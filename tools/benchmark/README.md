# Server benchmark

The scripts behind the benchmark published at
[Musonic's documentation](https://musonic.doodz.dev/docs/about/benchmark/): Musonic Server
against Navidrome, on the same machine, with the same music library, one server at a time.

- `serverbench.py`: runs the passes and writes every raw measure to a JSON file.
- `summarize.py`: turns that JSON into a summary (median of the passes, min–max range, ratio).
- `config.example.json`: the configuration used for the published run, with placeholders.
- `results/2026-10-22-v6/`: the published run (raw results and summary).

Both scripts use the Python 3 standard library only. They read `/proc`, so they run on Linux.

## What you need

- A Linux machine with Python 3. Nothing else runs on it during a pass if you want clean
  numbers (the published run did not have that luxury, see "Limits" below).
- A music folder both servers can read. Give them read-only access if you like: neither
  server needs to write to it for this benchmark.
- The two servers as programs, **without Docker**, so that the script can read their memory and
  CPU time in `/proc/<pid>`:
  - Musonic Server: the `musonic-server` binary of a release (or built from `apps/server`).
  - Navidrome: the official release archive for your architecture, unpacked into `nd/`.
- One `ffmpeg` for both servers, so that transcoding compares the servers and not two ffmpeg
  builds. The published run used the static build `n8.1` from BtbN's FFmpeg-Builds, in `ffmpeg/`.
- Free ports `4580` and `4581` on `127.0.0.1` (or change them in the configuration).

## Folder layout

The script resolves every relative path from the folder that holds the configuration file, and
starts the servers from there:

```text
tools/benchmark/
├── config.json          your copy of config.example.json (ignored by Git: it holds a password)
├── musonic-server       Musonic Server binary
├── nd/navidrome         Navidrome binary
├── ffmpeg/ffmpeg        the ffmpeg used by both
├── serverbench.py
├── summarize.py
└── runs/                created by the script: one data folder and one log per pass
```

## Configuration

Copy `config.example.json` to `config.json` and change:

| Field | Meaning |
|---|---|
| `password` | Password of the benchmark account. Replace `__PASSWORD__` **in both places** (the top-level `password` and Navidrome's `ND_DEVAUTOCREATEADMINPASSWORD`). The script writes it as `***` in the results. |
| `music_dir` | Your music folder, used to pick the 10 streaming files. |
| `MUSONIC_MUSIC_DIR`, `ND_MUSICFOLDER` | The same music folder, for each server. |
| `runs` | Passes per server (3). Passes alternate: Musonic then Navidrome, then Navidrome then Musonic, and so on. |
| `samples` | Measured requests per route (200), after 20 warm-up requests. |
| `concurrency_seconds` | Duration of each concurrent-clients step (10 s). |
| `threads` | Numbers of concurrent clients (1, 4, 16, 64). |
| `settle_seconds` | Wait after the scan before measuring the idle memory (60 s). |
| `servers[].command` | How to start each server. `{data}` in an environment value is replaced by the pass's empty data folder. |
| `servers[].add_user` | Musonic only: the command that creates the `bench` account (`musonic-server user add bench`, password given in `MUSONIC_PASSWORD`). Navidrome creates its `admin` account from `ND_DEVAUTOCREATEADMINPASSWORD`. |

Settings of the published run, on top of each server's defaults:

- Musonic Server: `MUSONIC_ONLINE=false`, `MUSONIC_ONLINE_PREVIEWS=false`, `MUSONIC_IMPORT=false`,
  `MUSONIC_UPDATE_CHECK=false`, `RUST_LOG=warn`.
- Navidrome: `ND_SCANNER_SCHEDULE=0`, `ND_ENABLEINSIGHTSCOLLECTOR=false`,
  `ND_ENABLEEXTERNALSERVICES=false`, `ND_LASTFM_ENABLED=false`, `ND_LOGLEVEL=warn`.

## Run it

```sh
cd tools/benchmark
python3 -I serverbench.py config.json results.json
python3 -I summarize.py results.json summary.md summary.json
```

One pass takes about 5 minutes for Musonic and 7 for Navidrome on the published machine (35 min
for the 6 passes). `results.json` is written after each pass, so an interrupted run keeps what
it measured. A pass that fails is recorded with its error and left out of the summary.

## What one pass does

1. Deletes and recreates the pass's data folder (`runs/<name>-<pass>`), starts the server, and
   times how long it takes to answer `GET /rest/ping` (first start).
2. Waits for the first full scan to end, sampling the resident memory (`VmRSS`) every 0.1 s, and
   reads the CPU time the scan used.
3. Waits `settle_seconds`, then reads the idle memory.
4. Picks the same items on both servers by name (the album and the artist at one third of the
   sorted lists, the first song of that album) and measures 14 Subsonic routes: warm, right after
   a like, 300 ms after a like, then the 95th percentile, the `ping` sign-in and the gzip size.
5. Covers: 60 albums, at 300 and 600 px, first request, asked again at once, asked again 10 s later.
6. Streaming: 10 files of the music folder, found by their size in bytes on both servers.
7. Concurrent clients: 1, 4, 16 and 64 threads for 10 s each, with the CPU time of the server.
8. Reads the memory after the tests and its peak (`VmHWM`), stops the server, measures the data
   folder, restarts it, times the restart and reads the memory 5 s later.

The documentation page
[Benchmark method](https://musonic.doodz.dev/docs/about/benchmark-method/) describes every
request and every computation in detail.

## How the summary is computed

For each measure, `summarize.py` takes the value of each pass and keeps the **median of the
passes**, with the min–max range. Inside a pass, latencies are already the median (or p95) of
the 200 measured requests. The ratio is Navidrome ÷ Musonic for "lower is better" measures and
Musonic ÷ Navidrome for throughput; `÷` marks a ratio below 1 (Navidrome ahead).

Units: memory in MiB (`/proc` kB ÷ 1024), answer and cover sizes in KiB (bytes ÷ 1024, written
"KB" in the summary), data folder in MB (bytes ÷ 10⁶), throughput in MB/s (10⁶ bytes per second).

CPU per 1,000 requests = CPU seconds of the server during the step ÷ (requests per second ×
10 s) × 1,000, computed per pass, then the median of the passes.

## Limits

- The load generator is a Python program on the same machine: it shares the CPU with the server,
  and its own overhead is included in every latency. On the published machine, `ping` (a route
  that does almost nothing) took 0.27 ms on Musonic: its sub-millisecond medians are close to
  that floor, so their ratios depend on the client as much as on the server.
- One machine, one library, one date. The documentation page lists everything the published run
  does not show.

## Changes since the published run

The published run (2026-10-22) used version 1.0.0 of `serverbench.py`. Version 1.1.0 adds the file
header and one fallback: Musonic Server 1.0.3 and later no longer report the scan in `/health`
(it only answers `{"status":"ok"}`), so the script then waits on the Subsonic `getScanStatus`
route, as it already did for Navidrome. With those versions, `scan.reported_s` (the server's own
scan duration) is 0 for Musonic; `scan.wall_s` and `scan.cpu_s` are measured as before.
`summarize.py` is unchanged.

## The published run: `results/2026-10-22-v6/`

- `results.json`: raw output of `serverbench.py` (3 passes per server, 2026-10-22, 21:17 to
  21:52 UTC). Musonic Server 1.0.1 against Navidrome 0.64.2.
- `summary.md`, `summary.json`: output of `summarize.py` on that file.

Before publication, three things were replaced in `results.json` (no measure changed):
the machine's host name in `machine.uname` (`<hostname>`), the music folder path
(`/path/to/music`), and the "artist - title" names of the 10 streaming files (`<song 1>` to
`<song 10>`). The account password had already been written as `***` by the script.
`summary.md` and `summary.json` were generated again from the edited file; the summary is
identical to the original one.
