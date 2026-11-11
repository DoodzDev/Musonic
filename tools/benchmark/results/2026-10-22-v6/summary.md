Runs: musonic 3, navidrome 3 · 2 CPUs · 2026-10-22 21:17:04 UTC → 2026-10-22 21:52:14 UTC

### Scan of the whole library (empty database)
| | musonic | navidrome | ratio |
|---|---|---|---|
| time (s) | 1.78 <sub>(1.77–2.01)</sub> | 18.9 <sub>(18.9–19.1)</sub> | ×10.6 |
| CPU time (s) | 1.77 <sub>(1.75–1.77)</sub> | 16.9 <sub>(16.6–17)</sub> | ×9.6 |
| peak memory during the scan (MB) | 19.3 <sub>(19.1–19.8)</sub> | 56.3 <sub>(55.7–61.4)</sub> | ×2.9 |

### Memory (RSS, MB)
| | musonic | navidrome | ratio |
|---|---|---|---|
| idle after the scan | 19.5 <sub>(19.2–19.7)</sub> | 100 <sub>(94.9–109)</sub> | ×5.1 |
| after all the tests | 77.6 <sub>(72.4–79.2)</sub> | 236 <sub>(229–239)</sub> | ×3.0 |
| peak | 78.3 <sub>(72.8–79.5)</sub> | 237 <sub>(235–244)</sub> | ×3.0 |
| after a restart | 15.5 <sub>(15.4–15.5)</sub> | 45.1 <sub>(44.9–45.2)</sub> | ×2.9 |

### Start and disk
| | musonic | navidrome | ratio |
|---|---|---|---|
| first start (s) | 0.062 <sub>(0.055–0.147)</sub> | 0.769 <sub>(0.764–0.782)</sub> | ×12.4 |
| restart (s) | 0.019 <sub>(0.018–0.029)</sub> | 0.045 <sub>(0.039–0.07)</sub> | ×2.4 |
| data folder (MB) | 26.9 <sub>(26.9–27)</sub> | 361 <sub>(361–361)</sub> | ×13.4 |

### Requests, warm (median ms)
| | musonic | navidrome | ratio |
|---|---|---|---|
| search3 "love" | 0.353 <sub>(0.336–0.355)</sub> | 29.4 <sub>(27.1–30.4)</sub> | ×83.4 |
| search3 "mo" | 0.377 <sub>(0.369–0.378)</sub> | 25.6 <sub>(24.4–28.1)</sub> | ×68.0 |
| search3 two words | 0.299 <sub>(0.296–0.329)</sub> | 20.2 <sub>(17.9–22.2)</sub> | ×67.4 |
| getAlbum | 0.288 <sub>(0.285–0.293)</sub> | 2.6 <sub>(2.6–2.93)</sub> | ×9.0 |
| getArtist | 0.279 <sub>(0.278–0.392)</sub> | 2.27 <sub>(2.04–2.92)</sub> | ×8.1 |
| getArtists | 0.429 <sub>(0.423–0.455)</sub> | 52.7 <sub>(51.8–53.3)</sub> | ×122.9 |
| getSong | 0.284 <sub>(0.281–0.286)</sub> | 2.43 <sub>(2–2.44)</sub> | ×8.6 |
| getAlbumList2 newest 50 | 0.338 <sub>(0.335–0.352)</sub> | 16.6 <sub>(16.5–17)</sub> | ×49.3 |
| getAlbumList2 alphabetical 500 | 0.517 <sub>(0.51–0.539)</sub> | 35.4 <sub>(35.3–35.4)</sub> | ×68.4 |
| getAlbumList2 random 50 | 2.17 <sub>(2.13–2.21)</sub> | 8.31 <sub>(8.28–8.37)</sub> | ×3.8 |
| getRandomSongs 50 | 3.29 <sub>(3.27–3.3)</sub> | 5.76 <sub>(5.7–5.9)</sub> | ×1.8 |
| getGenres | 0.289 <sub>(0.286–0.291)</sub> | 1.17 <sub>(1.14–1.18)</sub> | ×4.0 |
| getStarred2 | 0.279 <sub>(0.277–0.282)</sub> | 2.17 <sub>(1.76–2.97)</sub> | ×7.8 |
| getPlaylists | 0.276 <sub>(0.276–0.294)</sub> | 1.01 <sub>(0.994–1.05)</sub> | ×3.7 |

### Requests right after a like (median ms)
| | musonic | navidrome | ratio |
|---|---|---|---|
| search3 "love" | 2.78 <sub>(2.64–2.8)</sub> | 4.88 <sub>(4.7–5.15)</sub> | ×1.8 |
| search3 "mo" | 5.47 <sub>(5.43–5.57)</sub> | 7.09 <sub>(6.71–7.12)</sub> | ×1.3 |
| search3 two words | 1.93 <sub>(1.92–1.94)</sub> | 4.61 <sub>(4.34–4.73)</sub> | ×2.4 |
| getAlbum | 0.845 <sub>(0.837–0.853)</sub> | 1.84 <sub>(1.82–1.88)</sub> | ×2.2 |
| getArtist | 0.471 <sub>(0.47–0.483)</sub> | 1.66 <sub>(1.64–1.67)</sub> | ×3.5 |
| getArtists | 4.48 <sub>(4.26–4.66)</sub> | 30.2 <sub>(30.2–30.3)</sub> | ×6.8 |
| getSong | 0.772 <sub>(0.77–0.777)</sub> | 1.36 <sub>(1.36–1.37)</sub> | ×1.8 |
| getAlbumList2 newest 50 | 4.46 <sub>(4.42–4.51)</sub> | 4.76 <sub>(4.72–4.79)</sub> | ×1.1 |
| getAlbumList2 alphabetical 500 | 24 <sub>(23.4–24.5)</sub> | 35.3 <sub>(35.2–35.4)</sub> | ×1.5 |
| getAlbumList2 random 50 | 2.21 <sub>(2.2–2.25)</sub> | 8.41 <sub>(8.37–8.65)</sub> | ×3.8 |
| getRandomSongs 50 | 3.35 <sub>(3.27–3.42)</sub> | 5.63 <sub>(5.54–5.67)</sub> | ×1.7 |
| getGenres | 0.739 <sub>(0.735–0.74)</sub> | 1.19 <sub>(1.18–1.2)</sub> | ×1.6 |
| getStarred2 | 0.405 <sub>(0.391–0.414)</sub> | 1.62 <sub>(1.62–1.7)</sub> | ×4.0 |
| getPlaylists | 0.375 <sub>(0.365–0.377)</sub> | 1.02 <sub>(1–1.03)</sub> | ×2.7 |

### Requests 300 ms after a like (median ms)
| | musonic | navidrome | ratio |
|---|---|---|---|
| search3 "love" | 0.694 <sub>(0.69–0.706)</sub> | 7.21 <sub>(6.86–7.58)</sub> | ×10.4 |
| search3 "mo" | 0.708 <sub>(0.707–0.712)</sub> | 9.47 <sub>(9.24–9.56)</sub> | ×13.4 |
| search3 two words | 0.683 <sub>(0.678–0.689)</sub> | 6.94 <sub>(6.82–6.98)</sub> | ×10.2 |
| getAlbum | 0.671 <sub>(0.67–0.68)</sub> | 2.42 <sub>(2.42–2.5)</sub> | ×3.6 |
| getArtist | 0.665 <sub>(0.665–0.672)</sub> | 2.22 <sub>(2.21–2.26)</sub> | ×3.3 |
| getArtists | 0.728 <sub>(0.723–0.731)</sub> | 30.2 <sub>(30–30.8)</sub> | ×41.5 |
| getSong | 0.678 <sub>(0.672–0.678)</sub> | 1.91 <sub>(1.91–1.91)</sub> | ×2.8 |
| getAlbumList2 newest 50 | 0.699 <sub>(0.692–0.7)</sub> | 5.14 <sub>(5.1–5.18)</sub> | ×7.4 |
| getAlbumList2 alphabetical 500 | 0.762 <sub>(0.752–0.802)</sub> | 35.4 <sub>(35.3–35.5)</sub> | ×46.5 |
| getAlbumList2 random 50 | 3.25 <sub>(3.25–3.27)</sub> | 8.9 <sub>(8.85–8.95)</sub> | ×2.7 |
| getRandomSongs 50 | 4.64 <sub>(4.63–4.67)</sub> | 6.01 <sub>(6–6.14)</sub> | ×1.3 |
| getGenres | 0.672 <sub>(0.664–0.673)</sub> | 1.66 <sub>(1.65–1.66)</sub> | ×2.5 |
| getStarred2 | 0.67 <sub>(0.665–0.674)</sub> | 3.63 <sub>(3.63–3.66)</sub> | ×5.4 |
| getPlaylists | 0.675 <sub>(0.67–0.675)</sub> | 1.5 <sub>(1.5–1.54)</sub> | ×2.2 |

### Requests, warm (p95 ms)
| | musonic | navidrome | ratio |
|---|---|---|---|
| search3 "love" | 0.445 <sub>(0.416–0.454)</sub> | 61.9 <sub>(60.7–62.4)</sub> | ×139.1 |
| search3 "mo" | 0.455 <sub>(0.45–0.493)</sub> | 60.4 <sub>(60.3–60.4)</sub> | ×132.7 |
| search3 two words | 0.39 <sub>(0.368–0.393)</sub> | 57.2 <sub>(57.1–57.2)</sub> | ×146.6 |
| getAlbum | 0.372 <sub>(0.364–0.446)</sub> | 25.2 <sub>(21.9–29.7)</sub> | ×67.6 |
| getArtist | 0.378 <sub>(0.374–1.1)</sub> | 28.7 <sub>(26–34.2)</sub> | ×76.0 |
| getArtists | 0.587 <sub>(0.511–0.832)</sub> | 84.6 <sub>(81.3–89.6)</sub> | ×144.2 |
| getSong | 0.39 <sub>(0.362–0.539)</sub> | 25.9 <sub>(24.8–30)</sub> | ×66.5 |
| getAlbumList2 newest 50 | 0.45 <sub>(0.415–0.456)</sub> | 36 <sub>(35.4–41.4)</sub> | ×80.1 |
| getAlbumList2 alphabetical 500 | 0.632 <sub>(0.597–0.64)</sub> | 39 <sub>(38.2–60.6)</sub> | ×61.7 |
| getAlbumList2 random 50 | 2.3 <sub>(2.25–2.47)</sub> | 11.2 <sub>(11–11.4)</sub> | ×4.9 |
| getRandomSongs 50 | 3.56 <sub>(3.47–4.79)</sub> | 8.21 <sub>(7.97–8.48)</sub> | ×2.3 |
| getGenres | 0.366 <sub>(0.363–0.37)</sub> | 1.51 <sub>(1.48–1.57)</sub> | ×4.1 |
| getStarred2 | 0.394 <sub>(0.35–0.395)</sub> | 3.5 <sub>(3.36–3.94)</sub> | ×8.9 |
| getPlaylists | 0.361 <sub>(0.355–0.753)</sub> | 1.34 <sub>(1.28–1.66)</sub> | ×3.7 |

### Answer size with gzip (KB)
| | musonic | navidrome | ratio |
|---|---|---|---|
| search3 "love" | 6.98 <sub>(6.96–7)</sub> | 5.95 <sub>(5.95–5.95)</sub> | ÷1.2 |
| search3 "mo" | 8.88 <sub>(8.84–8.9)</sub> | 6.91 <sub>(6.9–6.92)</sub> | ÷1.3 |
| search3 two words | 2.46 <sub>(2.45–2.47)</sub> | 3.2 <sub>(3.2–3.2)</sub> | ×1.3 |
| getAlbum | 0.723 <sub>(0.723–0.726)</sub> | 0.811 <sub>(0.808–0.812)</sub> | ×1.1 |
| getArtist | 0.69 | 0.49 <sub>(0.489–0.49)</sub> | ÷1.4 |
| getArtists | 47.7 <sub>(47.7–47.7)</sub> | 30 <sub>(30–30.1)</sub> | ÷1.6 |
| getSong | 0.639 <sub>(0.639–0.64)</sub> | 0.666 <sub>(0.666–0.67)</sub> | ×1.0 |
| getAlbumList2 newest 50 | 6.79 <sub>(6.7–6.85)</sub> | 6.88 | ×1.0 |
| getAlbumList2 alphabetical 500 | 65.8 <sub>(65.7–65.8)</sub> | 67 <sub>(67–67.1)</sub> | ×1.0 |
| getAlbumList2 random 50 | 7.59 <sub>(7.37–7.64)</sub> | 7.79 <sub>(7.58–7.91)</sub> | ×1.0 |
| getRandomSongs 50 | 13.2 <sub>(12.4–13.2)</sub> | 10.6 <sub>(10.5–11.2)</sub> | ÷1.2 |
| getGenres | 0.772 <sub>(0.772–0.773)</sub> | 0.69 | ÷1.1 |
| getStarred2 | 0.159 | 0.134 | ÷1.2 |
| getPlaylists | 0.142 | 0.328 <sub>(0.326–0.331)</sub> | ×2.3 |

### Sign-in on each request (median ms)
| | musonic | navidrome | ratio |
|---|---|---|---|
| ping token (t+s) | 0.27 <sub>(0.269–0.271)</sub> | 0.682 <sub>(0.651–0.698)</sub> | ×2.5 |
| ping password (p) | 0.395 <sub>(0.377–0.396)</sub> | 0.705 <sub>(0.664–0.719)</sub> | ×1.8 |

### Covers (60 albums)
| | musonic | navidrome | ratio |
|---|---|---|---|
| 300 first, median ms | 21.1 <sub>(21–21.7)</sub> | 72.5 <sub>(72.1–72.8)</sub> | ×3.4 |
| 300 cached, median ms | 0.531 <sub>(0.516–0.537)</sub> | 0.992 <sub>(0.983–1.15)</sub> | ×1.9 |
| 300 cached later, median ms | 0.539 <sub>(0.537–0.54)</sub> | 0.921 <sub>(0.911–0.929)</sub> | ×1.7 |
| 600 first, median ms | 31.5 <sub>(30.1–32.6)</sub> | 119 <sub>(115–119)</sub> | ×3.8 |
| 600 cached, median ms | 0.599 <sub>(0.596–0.643)</sub> | 1.05 <sub>(1.02–1.05)</sub> | ×1.8 |
| 600 cached later, median ms | 0.637 <sub>(0.605–0.637)</sub> | 0.977 <sub>(0.956–0.978)</sub> | ×1.5 |
| 300 first, total KB | 1.09e+03 | 1e+03 | ÷1.1 |
| 300 cached later, total KB | 915 <sub>(906–919)</sub> | 1e+03 | ×1.1 |
| 600 first, total KB | 3.7e+03 | 3.49e+03 | ÷1.1 |
| 600 cached later, total KB | 3.25e+03 <sub>(3.22e+03–3.25e+03)</sub> | 3.49e+03 | ×1.1 |

### Streaming
| | musonic | navidrome | ratio |
|---|---|---|---|
| first byte, original file (ms) | 0.811 <sub>(0.808–0.838)</sub> | 1.55 <sub>(1.43–1.61)</sub> | ×1.9 |
| first byte, transcoded to MP3 96 (ms) | 42 <sub>(41.9–42.1)</sub> | 33.5 <sub>(33.4–40.4)</sub> | ÷1.3 |
| whole song transcoded (ms) | 2.78e+03 <sub>(2.76e+03–2.78e+03)</sub> | 2.76e+03 <sub>(2.76e+03–2.76e+03)</sub> | ÷1.0 |
| first byte, transcoded song played again (ms) | 1.25 <sub>(1.2–1.36)</sub> | 1.72 <sub>(1.71–1.72)</sub> | ×1.4 |

### Streaming throughput
| | musonic | navidrome | ratio |
|---|---|---|---|
| original file (MB/s) | 625 <sub>(616–660)</sub> | 660 <sub>(631–720)</sub> | ÷1.1 |

### Concurrent clients: throughput (the load generator runs on the same 2 CPUs)
| | musonic | navidrome | ratio |
|---|---|---|---|
| 1 clients: requests/s | 723 <sub>(723–729)</sub> | 86.5 <sub>(86.1–87.1)</sub> | ×8.4 |
| 4 clients: requests/s | 918 <sub>(899–928)</sub> | 135 <sub>(134–136)</sub> | ×6.8 |
| 16 clients: requests/s | 902 <sub>(900–905)</sub> | 143 <sub>(141–143)</sub> | ×6.3 |
| 64 clients: requests/s | 913 <sub>(904–917)</sub> | 156 <sub>(152–158)</sub> | ×5.8 |

### Concurrent clients: latency
| | musonic | navidrome | ratio |
|---|---|---|---|
| 1 clients: median ms | 0.41 <sub>(0.41–0.42)</sub> | 5.68 <sub>(5.67–5.68)</sub> | ×13.9 |
| 1 clients: p95 ms | 2.53 <sub>(2.47–2.53)</sub> | 32.9 <sub>(32.9–33)</sub> | ×13.0 |
| 4 clients: median ms | 2.44 <sub>(2.42–2.48)</sub> | 19 <sub>(18.6–19)</sub> | ×7.8 |
| 4 clients: p95 ms | 6.32 <sub>(6.27–6.55)</sub> | 80.7 <sub>(79.1–81)</sub> | ×12.8 |
| 16 clients: median ms | 9.23 <sub>(9.22–9.24)</sub> | 102 <sub>(100–103)</sub> | ×11.0 |
| 16 clients: p95 ms | 23.9 <sub>(23.8–24.9)</sub> | 212 <sub>(210–212)</sub> | ×8.9 |
| 64 clients: median ms | 33.5 <sub>(33–33.7)</sub> | 394 <sub>(381–399)</sub> | ×11.8 |
| 64 clients: p95 ms | 105 <sub>(104–106)</sub> | 593 <sub>(583–624)</sub> | ×5.6 |

### Server CPU time per 1,000 requests (s)
| | musonic | navidrome |
|---|---|---|
| 1 clients | 0.58 | 12.15 |
| 4 clients | 0.60 | 12.05 |
| 16 clients | 0.60 | 11.74 |
| 64 clients | 0.60 | 11.01 |
