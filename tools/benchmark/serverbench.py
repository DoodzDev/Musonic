#!/usr/bin/env python3
# @file serverbench.py
# @description Benchmark of Subsonic servers (Musonic Server, Navidrome) on the same machine and
#   the same music library: scan, memory, start, disk, request latency, covers, streaming,
#   concurrent clients and CPU time. See README.md.
# @author DoodzProg
# @version 1.1.0
# @license CC-BY-NC-4.0
"""Benchmark of Subsonic servers on the same machine and the same music library.

Each run starts a server from an empty data folder, waits for its full scan, then measures
memory, start time, request latency (warm and right after a write), covers, streaming,
throughput under concurrent clients, CPU time and disk use. Runs alternate between servers.
Python 3 standard library only.

    python3 -I serverbench.py config.json results.json

The configuration lists the servers (command, environment, port, how to create the account);
see config.example.json.
"""
import hashlib, http.client, json, os, random, secrets, shutil, signal, statistics, subprocess
import sys, threading, time, urllib.parse

CONFIG, OUT = sys.argv[1], sys.argv[2]
cfg = json.load(open(CONFIG))
RUNS = cfg.get("runs", 3)
WARMUP, SAMPLES = 20, cfg.get("samples", 200)
CONC_SECONDS = cfg.get("concurrency_seconds", 10)
HERE = os.path.dirname(os.path.abspath(CONFIG))


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def pctl(values, p):
    v = sorted(values)
    return v[min(len(v) - 1, int(len(v) * p))]


def summary(ms):
    return {"median": round(statistics.median(ms), 3), "p95": round(pctl(ms, 0.95), 3),
            "min": round(min(ms), 3)}


# Process measures -------------------------------------------------------------------------

TICK = os.sysconf("SC_CLK_TCK")


def proc_status(pid, field):
    try:
        for line in open(f"/proc/{pid}/status"):
            if line.startswith(field + ":"):
                return int(line.split()[1])  # kB
    except OSError:
        return None


def cpu_seconds(pid):
    """User + system CPU time of the process and its children so far (s)."""
    try:
        f = open(f"/proc/{pid}/stat").read().rsplit(")", 1)[1].split()
        return (int(f[11]) + int(f[12]) + int(f[13]) + int(f[14])) / TICK
    except OSError:
        return None


def du(path):
    total = 0
    for root, _, files in os.walk(path):
        for f in files:
            try:
                total += os.path.getsize(os.path.join(root, f))
            except OSError:
                pass
    return total


# Subsonic client --------------------------------------------------------------------------

class Client:
    def __init__(self, port, user, password, gzip=False):
        self.port, self.user, self.password = port, user, password
        self.conn = http.client.HTTPConnection("127.0.0.1", port, timeout=120)
        self.headers = {"Accept-Encoding": "gzip"} if gzip else {}

    def query(self, auth="token", **params):
        if auth == "password":
            a = {"u": self.user, "p": self.password}
        else:
            s = secrets.token_hex(6)
            a = {"u": self.user, "t": hashlib.md5((self.password + s).encode()).hexdigest(), "s": s}
        return urllib.parse.urlencode({**a, "v": "1.16.1", "c": "bench", "f": "json", **params})

    def raw(self, path, headers=None, first_bytes=None):
        """(ms total, ms to first byte, body, response)."""
        t0 = time.perf_counter()
        try:
            self.conn.request("GET", path, headers={**self.headers, **(headers or {})})
            r = self.conn.getresponse()
        except (http.client.HTTPException, OSError):
            self.conn.close()
            self.conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=120)
            self.conn.request("GET", path, headers={**self.headers, **(headers or {})})
            r = self.conn.getresponse()
        head = r.read(1)
        ttfb = (time.perf_counter() - t0) * 1000
        body = head + r.read()
        return (time.perf_counter() - t0) * 1000, ttfb, body, r

    def call(self, view, auth="token", **params):
        ms, _, body, r = self.raw(f"/rest/{view}?" + self.query(auth, **params))
        if r.getheader("Content-Encoding") == "gzip":
            import gzip
            data = json.loads(gzip.decompress(body))
        else:
            data = json.loads(body)
        resp = data["subsonic-response"]
        if resp.get("status") != "ok":
            raise RuntimeError(f"{view}: {resp.get('error')}")
        return ms, resp, len(body)


def wait_http(port, timeout=300):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            c = http.client.HTTPConnection("127.0.0.1", port, timeout=2)
            c.request("GET", "/rest/ping?f=json")
            c.getresponse().read()
            return time.time() - t0
        except OSError:
            time.sleep(0.002)
    raise RuntimeError("server did not start")


# One run ----------------------------------------------------------------------------------

def start(server, data_dir):
    env = {**os.environ, **{k: v.replace("{data}", data_dir) for k, v in server["env"].items()}}
    log_file = open(os.path.join(data_dir, "..", f"{os.path.basename(data_dir)}.log"), "w")
    p = subprocess.Popen(server["command"], env=env, cwd=HERE, stdout=log_file, stderr=log_file)
    return p, env


def stop(p):
    p.send_signal(signal.SIGTERM)
    try:
        p.wait(30)
    except subprocess.TimeoutExpired:
        p.kill()
        p.wait()


def wait_scan(server, client, pid):
    """Seconds until the first full scan is over, and the peak memory meanwhile."""
    peak = 0
    t0 = time.time()
    while True:
        peak = max(peak, proc_status(pid, "VmRSS") or 0)
        try:
            h = {}
            if server["kind"] == "musonic":
                c = http.client.HTTPConnection("127.0.0.1", server["port"], timeout=5)
                c.request("GET", "/health")
                h = json.loads(c.getresponse().read())
            if isinstance(h.get("scan"), dict):
                # Musonic Server up to 1.0.2: /health reports the scan and its own duration.
                if h["scan"].get("last") and not h["scan"].get("scanning"):
                    return time.time() - t0, h["scan"]["last"]["duration_ms"] / 1000, peak
            else:
                # Navidrome, and Musonic Server 1.0.3 and later (/health only answers "ok").
                _, r, _ = client.call("getScanStatus")
                s = r["scanStatus"]
                if not s["scanning"] and s.get("lastScan") and s.get("count", 0) > 0:
                    return time.time() - t0, s.get("elapsedTime", 0) / 1e9, peak
        except (OSError, RuntimeError, KeyError, ValueError):
            pass
        if time.time() - t0 > 900:
            raise RuntimeError("scan did not end")
        time.sleep(0.1)


def latency(client, routes, before=None, samples=None):
    out = {}
    for name, (view, params) in routes.items():
        for _ in range(WARMUP):
            client.call(view, **params)
        ms, size = [], 0
        for _ in range(samples or SAMPLES):
            if before:
                before()
            t, _, size = client.call(view, **params)
            ms.append(t)
        out[name] = {**summary(ms), "bytes": size}
    return out


def concurrency(server, user, password, workload, threads):
    stop_at = time.time() + CONC_SECONDS
    lat, errors, lock = [], [0], threading.Lock()

    def worker(seed):
        rnd = random.Random(seed)
        c = Client(server["port"], user, password, gzip=True)
        mine, err = [], 0
        while time.time() < stop_at:
            view, params = rnd.choice(workload)()
            try:
                t, _, _ = c.call(view, **params)
                mine.append(t)
            except Exception:
                err += 1
        with lock:
            lat.extend(mine)
            errors[0] += err

    ts = [threading.Thread(target=worker, args=(i,)) for i in range(threads)]
    t0 = time.time()
    for t in ts:
        t.start()
    for t in ts:
        t.join()
    el = time.time() - t0
    return {"threads": threads, "requests_per_s": round(len(lat) / el, 1),
            "median": round(statistics.median(lat), 2), "p95": round(pctl(lat, 0.95), 2),
            "errors": errors[0]}


def picked_files():
    files = []
    for root, _, names in os.walk(cfg["music_dir"]):
        for n in names:
            if n.lower().endswith((".mp3", ".flac", ".m4a", ".ogg", ".opus")):
                files.append(os.path.join(root, n))
    files.sort()
    step = max(1, len(files) // 10)
    sizes = []
    for f in files[step // 2::step]:
        size = os.path.getsize(f)
        if size not in sizes and size > 1_000_000:
            sizes.append(size)
    return sizes[:10]


def one_run(server, run_no):
    name = server["name"]
    root = os.path.join(HERE, "runs")
    data = os.path.join(root, f"{name}-{run_no}")
    shutil.rmtree(data, ignore_errors=True)
    os.makedirs(data)
    if server.get("copy_into_data"):
        for f in server["copy_into_data"]:
            shutil.copy(os.path.join(HERE, f), data)
    res = {"server": name, "run": run_no}
    log(name, run_no, "start (empty data folder)")
    t_start = time.time()
    p, env = start(server, data)
    res["first_start_s"] = round(wait_http(server["port"]), 3)
    user, password = "bench", cfg["password"]
    if server["kind"] == "musonic":
        subprocess.run(server["add_user"], env={**env, "MUSONIC_PASSWORD": password}, cwd=HERE,
                       check=True, capture_output=True)
    else:
        user = "admin"
    client = Client(server["port"], user, password)
    cpu0 = cpu_seconds(p.pid)
    wall, own, peak = wait_scan(server, client, p.pid)
    res["scan"] = {"wall_s": round(wall, 2), "reported_s": round(own, 2),
                   "cpu_s": round(cpu_seconds(p.pid) - cpu0, 2), "peak_rss_kb": peak}
    log(name, run_no, "scan", res["scan"])
    time.sleep(cfg.get("settle_seconds", 30))
    res["rss_idle_kb"] = proc_status(p.pid, "VmRSS")

    # Ids and words of this library, the same for both servers.
    rnd = random.Random(42)
    _, r, _ = client.call("getAlbumList2", type="alphabeticalByName", size=500)
    albums = r["albumList2"]["album"]
    _, r, _ = client.call("getArtists")
    artists = [a for i in r["artists"]["index"] for a in i["artist"]]
    album = sorted(albums, key=lambda a: a["name"])[len(albums) // 3]
    artist = sorted(artists, key=lambda a: a["name"])[len(artists) // 3]
    _, r, _ = client.call("getAlbum", id=album["id"])
    song = r["album"]["song"][0]
    res["library"] = {"albums_listed": len(albums), "artists": len(artists)}
    routes = {
        "search3 \"love\"": ("search3", {"query": "love"}),
        "search3 \"mo\"": ("search3", {"query": "mo"}),
        "search3 two words": ("search3", {"query": "the love"}),
        "getAlbum": ("getAlbum", {"id": album["id"]}),
        "getArtist": ("getArtist", {"id": artist["id"]}),
        "getArtists": ("getArtists", {}),
        "getSong": ("getSong", {"id": song["id"]}),
        "getAlbumList2 newest 50": ("getAlbumList2", {"type": "newest", "size": 50}),
        "getAlbumList2 alphabetical 500": ("getAlbumList2", {"type": "alphabeticalByName", "size": 500}),
        "getAlbumList2 random 50": ("getAlbumList2", {"type": "random", "size": 50}),
        "getRandomSongs 50": ("getRandomSongs", {"size": 50}),
        "getGenres": ("getGenres", {}),
        "getStarred2": ("getStarred2", {}),
        "getPlaylists": ("getPlaylists", {}),
    }
    log(name, run_no, "latency")
    res["latency_warm"] = latency(client, routes)
    toggle = lambda: (client.call("star", id=song["id"]), client.call("unstar", id=song["id"]))
    res["latency_after_write"] = latency(client, routes, before=toggle)
    # The next screen a person opens: a moment after the like.
    def toggle_then_wait():
        toggle()
        time.sleep(0.3)
    res["latency_300ms_after_write"] = latency(client, routes, before=toggle_then_wait, samples=30)
    res["auth"] = {
        "ping token (t+s)": summary([client.call("ping")[0] for _ in range(SAMPLES)]),
        "ping password (p)": summary([client.call("ping", auth="password")[0] for _ in range(50)]),
    }
    gz = Client(server["port"], user, password, gzip=True)
    res["bytes_gzip"] = {n: gz.call(v, **p)[2] for n, (v, p) in routes.items()}

    log(name, run_no, "covers")
    covers = [a["coverArt"] for a in albums if a.get("coverArt")][:60]
    res["covers"] = {}
    for size in (300, 600):
        for label in ("first", "cached", "cached later"):
            if label == "cached later":
                time.sleep(10)  # background work (smaller pictures) has had its time
            ms, total = [], 0
            for cid in covers:
                t, _, body, _ = client.raw("/rest/getCoverArt?" + client.query(id=cid, size=size))
                ms.append(t)
                total += len(body)
            res["covers"][f"{size} {label}"] = {**summary(ms), "bytes_total": total, "count": len(covers)}

    log(name, run_no, "streaming")
    st = {}
    # The same files for both servers: ten files of the music folder (every tenth of the sorted
    # list), found by their size in bytes. Each is read once before, so the disk cache does
    # not decide.
    wanted = picked_files()
    by_size = {}
    offset = 0
    while len(by_size) < len(wanted):
        _, r, _ = client.call("getAlbumList2", type="alphabeticalByName", size=500, offset=offset)
        page = r["albumList2"].get("album", [])
        if not page:
            break
        for a in page:
            _, ra, _ = client.call("getAlbum", id=a["id"])
            for s in ra["album"].get("song", []):
                if s.get("size") in wanted:
                    by_size[s["size"]] = s
        offset += 500
    songs = [by_size[size] for size in wanted if size in by_size]
    for s in songs:
        client.raw("/rest/stream?" + client.query(id=s["id"], format="raw"))
    st["songs"] = [f"{s.get('artist')} - {s.get('title')}" for s in songs]
    # 96 kbit/s: below every file of a usual library, so both servers transcode.
    hi = songs[5:10]
    plain = songs[:5]
    ttfb = [client.raw("/rest/stream?" + client.query(id=s["id"], format="raw"),
                       headers={"Range": "bytes=0-65535"})[1] for s in plain for _ in range(4)]
    st["raw first 64 KiB, first byte ms"] = summary(ttfb)
    full = []
    for s in plain:
        t, _, body, _ = client.raw("/rest/stream?" + client.query(id=s["id"], format="raw"))
        full.append(len(body) / 1e6 / (t / 1000))
    st["raw whole file MB/s"] = round(statistics.median(full), 1)
    trans, trans_full = [], []
    for s in hi:
        t, first, body, _ = client.raw("/rest/stream?" + client.query(id=s["id"], format="mp3", maxBitRate=96))
        trans.append(first)
        trans_full.append(t)
        st.setdefault("transcoded bytes vs file", []).append([len(body), s.get("size")])
    st["transcode to mp3 96, first byte ms"] = summary(trans)
    st["transcode to mp3 96, whole song ms"] = summary(trans_full)
    # The same songs again: from the transcoding cache, when the server has one.
    time.sleep(2)
    again = [client.raw("/rest/stream?" + client.query(id=s["id"], format="mp3", maxBitRate=96))[1] for s in hi]
    st["transcoded again, first byte ms"] = summary(again)
    st["transcoded source bit rates"] = [s.get("bitRate") for s in hi]
    res["streaming"] = st

    log(name, run_no, "concurrency")
    words = ["love", "mo", "the", "night", "mozart", "you", "me", "de", "la", "blue"]
    ids = [a["id"] for a in albums]
    workload = [
        lambda: ("getAlbum", {"id": random.choice(ids)}),
        lambda: ("getAlbumList2", {"type": "newest", "size": 50}),
        lambda: ("search3", {"query": random.choice(words)}),
        lambda: ("getArtists", {}),
        lambda: ("getRandomSongs", {"size": 20}),
    ]
    res["concurrency"] = []
    for n in cfg.get("threads", [1, 4, 16, 64]):
        cpu0 = cpu_seconds(p.pid)
        c = concurrency(server, user, password, workload, n)
        c["cpu_s"] = round(cpu_seconds(p.pid) - cpu0, 2)
        res["concurrency"].append(c)
        log(name, run_no, "threads", c)
    res["rss_after_load_kb"] = proc_status(p.pid, "VmRSS")
    res["rss_peak_kb"] = proc_status(p.pid, "VmHWM")
    stop(p)
    res["data_dir_bytes"] = du(data)

    log(name, run_no, "restart")
    p, _ = start(server, data)
    res["restart_s"] = round(wait_http(server["port"]), 3)
    time.sleep(5)
    res["rss_after_restart_kb"] = proc_status(p.pid, "VmRSS")
    stop(p)
    res["total_run_s"] = round(time.time() - t_start, 1)
    return res


def redacted(c):
    """The configuration without the password (also given to servers in their environment)."""
    text = json.dumps({k: v for k, v in c.items() if k != "password"})
    return json.loads(text.replace(c["password"], "***"))


results = {"config": redacted(cfg), "started": time.strftime("%Y-%m-%d %H:%M:%S %Z"),
           "machine": {"cpus": os.cpu_count(), "uname": " ".join(os.uname())}, "runs": []}
for run_no in range(1, RUNS + 1):
    order = cfg["servers"] if run_no % 2 else list(reversed(cfg["servers"]))
    for server in order:
        try:
            results["runs"].append(one_run(server, run_no))
        except Exception as e:
            log("FAILED", server["name"], run_no, repr(e))
            results["runs"].append({"server": server["name"], "run": run_no, "error": repr(e)})
        json.dump(results, open(OUT, "w"), indent=1)
results["ended"] = time.strftime("%Y-%m-%d %H:%M:%S %Z")
json.dump(results, open(OUT, "w"), indent=1)
log("done", OUT)
