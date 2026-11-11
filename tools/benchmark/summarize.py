#!/usr/bin/env python3
# @file summarize.py
# @description Summary of serverbench.py results: median of the passes for each measure, with
#   the min-max range and the ratio between the two servers, as Markdown and JSON.
# @author DoodzProg
# @version 1.0.0
# @license CC-BY-NC-4.0
"""Summary of serverbench.py results: median of the runs for each measure, as Markdown and JSON.

    python3 -I summarize.py results.json summary.md summary.json
"""
import json, statistics, sys

data = json.load(open(sys.argv[1]))
runs = [r for r in data["runs"] if "error" not in r]
servers = list(dict.fromkeys(r["server"] for r in runs))
by = {s: [r for r in runs if r["server"] == s] for s in servers}


def med(values):
    values = [v for v in values if v is not None]
    return statistics.median(values) if values else None


def get(r, path):
    for p in path:
        if r is None:
            return None
        r = r[p] if isinstance(r, dict) and p in r else (r[p] if isinstance(r, list) and isinstance(p, int) and p < len(r) else None)
    return r


def m(server, *path):
    return med([get(r, path) for r in by[server]])


def spread(server, *path):
    v = [get(r, path) for r in by[server] if get(r, path) is not None]
    return (min(v), max(v)) if v else (None, None)


out = {"machine": data["machine"], "started": data["started"], "ended": data.get("ended"),
       "runs_per_server": {s: len(by[s]) for s in servers}, "measures": {}}
md = [f"Runs: {', '.join(f'{s} {len(by[s])}' for s in servers)} · {data['machine']['cpus']} CPUs · "
      f"{data['started']} → {data.get('ended')}", ""]


def table(title, rows, unit, better="lower"):
    md.append(f"### {title}")
    md.append("| | " + " | ".join(servers) + " | ratio |")
    md.append("|---|" + "---|" * (len(servers) + 1))
    sec = out["measures"].setdefault(title, {})
    for label, path, scale in rows:
        vals = [m(s, *path) for s in servers]
        vals = [None if v is None else v * scale for v in vals]
        cells = []
        for s, v in zip(servers, vals):
            lo, hi = spread(s, *path)
            rng = "" if lo is None or lo == hi else f" <sub>({lo * scale:.3g}–{hi * scale:.3g})</sub>"
            cells.append("—" if v is None else f"{v:.3g}{rng}")
        ratio = ""
        if len(vals) == 2 and None not in vals and min(vals) > 0:
            r = vals[1] / vals[0] if better == "lower" else vals[0] / vals[1]
            ratio = f"×{r:.1f}" if r >= 1 else f"÷{1 / r:.1f}"
        md.append(f"| {label} | " + " | ".join(cells) + f" | {ratio} |")
        sec[label] = {"unit": unit, **{s: v for s, v in zip(servers, vals)}}
    md.append("")


first = by[servers[0]][0]
table("Scan of the whole library (empty database)", [
    ("time (s)", ["scan", "wall_s"], 1),
    ("CPU time (s)", ["scan", "cpu_s"], 1),
    ("peak memory during the scan (MB)", ["scan", "peak_rss_kb"], 1 / 1024),
], "s")
table("Memory (RSS, MB)", [
    ("idle after the scan", ["rss_idle_kb"], 1 / 1024),
    ("after all the tests", ["rss_after_load_kb"], 1 / 1024),
    ("peak", ["rss_peak_kb"], 1 / 1024),
    ("after a restart", ["rss_after_restart_kb"], 1 / 1024),
], "MB")
table("Start and disk", [
    ("first start (s)", ["first_start_s"], 1),
    ("restart (s)", ["restart_s"], 1),
    ("data folder (MB)", ["data_dir_bytes"], 1 / 1e6),
], "")
table("Requests, warm (median ms)", [(k, ["latency_warm", k, "median"], 1) for k in first["latency_warm"]], "ms")
table("Requests right after a like (median ms)", [(k, ["latency_after_write", k, "median"], 1) for k in first["latency_after_write"]], "ms")
if "latency_300ms_after_write" in first:
    table("Requests 300 ms after a like (median ms)", [(k, ["latency_300ms_after_write", k, "median"], 1) for k in first["latency_300ms_after_write"]], "ms")
table("Requests, warm (p95 ms)", [(k, ["latency_warm", k, "p95"], 1) for k in first["latency_warm"]], "ms")
table("Answer size with gzip (KB)", [(k, ["bytes_gzip", k], 1 / 1024) for k in first["bytes_gzip"]], "KB")
table("Sign-in on each request (median ms)", [(k, ["auth", k, "median"], 1) for k in first["auth"]], "ms")
table("Covers (60 albums)", [
    (f"{k}, median ms", ["covers", k, "median"], 1) for k in first["covers"]
] + [(f"{k}, total KB", ["covers", k, "bytes_total"], 1 / 1024) for k in first["covers"] if not k.endswith(" cached")], "")
table("Streaming", [
    ("first byte, original file (ms)", ["streaming", "raw first 64 KiB, first byte ms", "median"], 1),
    ("first byte, transcoded to MP3 96 (ms)", ["streaming", "transcode to mp3 96, first byte ms", "median"], 1),
    ("whole song transcoded (ms)", ["streaming", "transcode to mp3 96, whole song ms", "median"], 1),
    ("first byte, transcoded song played again (ms)", ["streaming", "transcoded again, first byte ms", "median"], 1),
], "ms")
table("Streaming throughput", [("original file (MB/s)", ["streaming", "raw whole file MB/s"], 1)], "MB/s", better="higher")
conc = []
for i, c in enumerate(first["concurrency"]):
    n = c["threads"]
    conc += [(f"{n} clients: requests/s", ["concurrency", i, "requests_per_s"], 1)]
table("Concurrent clients: throughput (the load generator runs on the same 2 CPUs)", conc, "req/s", better="higher")
conc = []
for i, c in enumerate(first["concurrency"]):
    n = c["threads"]
    conc += [(f"{n} clients: median ms", ["concurrency", i, "median"], 1),
             (f"{n} clients: p95 ms", ["concurrency", i, "p95"], 1)]
table("Concurrent clients: latency", conc, "ms")

# CPU per request.
md.append("### Server CPU time per 1,000 requests (s)")
md.append("| | " + " | ".join(servers) + " |")
md.append("|---|" + "---|" * len(servers))
sec = out["measures"].setdefault("Server CPU time per 1,000 requests", {})
for i, c in enumerate(first["concurrency"]):
    vals = []
    for s in servers:
        per = [r["concurrency"][i]["cpu_s"] / (r["concurrency"][i]["requests_per_s"] * data["config"].get("concurrency_seconds", 10)) * 1000
               for r in by[s] if r["concurrency"][i]["requests_per_s"]]
        vals.append(med(per))
    md.append(f"| {c['threads']} clients | " + " | ".join(f"{v:.2f}" for v in vals) + " |")
    sec[f"{c['threads']} clients"] = {"unit": "s", **dict(zip(servers, vals))}
md.append("")
open(sys.argv[2], "w").write("\n".join(md))
json.dump(out, open(sys.argv[3], "w"), indent=1)
print("\n".join(md))
