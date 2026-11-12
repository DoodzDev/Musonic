# Images — about/benchmark and about/benchmark-method (agent benchmark)

No screenshots: only diagrams (SVG, class `diagram`), one `.en.svg` and one `.fr.svg` each.
Used in `docs/about/benchmark.mdx` and `fr/docs/about/benchmark.mdx`.

## Rules common to every chart (items 2 to 12)

- Kind: diagram, simple **horizontal bar chart**. One row per measure; in each row, two bars
  one above the other: **Musonic** first (the site's accent colour), **Navidrome** second (neutral grey).
  Legend at the top: "Musonic" / "Navidrome" (same in FR).
- Write the exact value with its unit at the end of each bar. EN uses a decimal point (`1.78`),
  FR a decimal comma (`1,78`) and a narrow space for thousands (`2 779`).
- When a row's better value is Navidrome's, add a small label "Navidrome ahead" / "Navidrome devant"
  at the right of that row. No other colour meaning, no gradients, no glow.
- "Own scale per row" = each row's longest bar spans the full width (units differ between rows).
  "Common linear scale" = one axis for all rows, ticks shown. "Log scale" = one logarithmic axis
  for all rows, ticks at 0.1, 1, 10, 100 (FR 0,1 · 1 · 10 · 100), axis label given below.
- Title on top of each chart (given below). Source line at the bottom, small:
  EN "Median of 3 passes · Musonic Server 1.0.1 vs Navidrome 0.64.2 · 2026-10-22 · 2-core ARM VPS, 1,871 files"
  FR "Médiane de 3 passes · Musonic Server 1.0.1 face à Navidrome 0.64.2 · 22/10/2026 · VPS ARM 2 cœurs, 1 871 fichiers"
- Values come from the page tables (themselves generated from `tools/benchmark/results/2026-10-22-v6/results.json`).
  Do not round them further.

## 1. /assets/img/docs/diagrams/benchmark-setup.en.svg and .fr.svg
- Kind: diagram (test setup), near the top of the page.
- One large rounded rectangle = the machine: "ARM virtual server · 2 cores · 12 GB · Ubuntu 24.04"
  / FR "Serveur virtuel ARM · 2 cœurs · 12 Go · Ubuntu 24.04".
- Inside it, left: box "Benchmark script (serverbench.py, Python)" / "Script de test (serverbench.py, Python)".
- Inside it, middle: two stacked boxes "Musonic Server 1.0.1" (top) and "Navidrome 0.64.2" (bottom).
  Only one is drawn solid; the other dashed, with a small note between them:
  "one at a time" / "un seul à la fois".
- Arrow script -> server under test (both, the one to the dashed box dashed), labelled
  "HTTP on 127.0.0.1 · Subsonic API" / "HTTP sur 127.0.0.1 · API Subsonic".
- Second thin arrow script -> server box labelled "reads /proc: memory, CPU" / "lit /proc : mémoire, processeur".
- Inside it, right: box "Music folder · 1,871 files · 7.0 GB · read only" / "Dossier de musique · 1 871 fichiers · 7,0 Go · lecture seule",
  arrow from it to both servers labelled "same folder" / "même dossier".
- Small box "ffmpeg n8.1 (same binary)" / "ffmpeg n8.1 (même binaire)" linked to both servers.
- Small box under each server: "empty data folder at each pass" / "dossier de données vide à chaque passe".
- Strip at the bottom, outside the machine, a timeline of 6 small blocks:
  "Pass 1: Musonic → Navidrome · Pass 2: Navidrome → Musonic · Pass 3: Musonic → Navidrome"
  / FR "Passe 1 : Musonic → Navidrome · Passe 2 : Navidrome → Musonic · Passe 3 : Musonic → Navidrome".
  Under it: "Result = median of the 3 passes" / "Résultat = médiane des 3 passes".

## 2. /assets/img/docs/diagrams/benchmark-scan.en.svg and .fr.svg
- Title: "Library scan, empty database (lower is better)" / "Analyse de la bibliothèque, base vide (plus bas = mieux)".
- Own scale per row.
| Row EN | Row FR | Musonic | Navidrome |
|---|---|---:|---:|
| Wall-clock time | Durée réelle | 1.78 s | 18.9 s |
| CPU time | Temps processeur | 1.77 s | 16.9 s |
| Peak memory | Mémoire max | 19.3 MiB | 56.3 MiB |
(FR units: s, Mio.)

## 3. /assets/img/docs/diagrams/benchmark-memory.en.svg and .fr.svg
- Title: "Server memory, RSS in MiB (lower is better)" / "Mémoire du serveur, RSS en Mio (plus bas = mieux)".
- Common linear scale 0 to 250 MiB, ticks every 50.
| Row EN | Row FR | Musonic | Navidrome |
|---|---|---:|---:|
| Idle, 60 s after the scan | Au repos, 60 s après l’analyse | 19.5 | 100 |
| After all the tests | Après tous les tests | 77.6 | 236 |
| Peak of the pass | Maximum de la passe | 78.3 | 237 |
| 5 s after a restart | 5 s après un redémarrage | 15.5 | 45.1 |

## 4. /assets/img/docs/diagrams/benchmark-startup-disk.en.svg and .fr.svg
- Title: "Startup and disk (lower is better)" / "Démarrage et disque (plus bas = mieux)".
- Own scale per row.
| Row EN | Row FR | Musonic | Navidrome |
|---|---|---:|---:|
| First start | Premier démarrage | 0.062 s | 0.769 s |
| Restart | Redémarrage | 0.019 s | 0.045 s |
| Data folder | Dossier de données | 26.9 MB | 361 MB |
(FR units: s, Mo.)

## 5. /assets/img/docs/diagrams/benchmark-requests-median.en.svg and .fr.svg
- Title: "Median latency of 14 Subsonic requests, ms (lower is better)" / "Latence médiane de 14 requêtes Subsonic, ms (plus bas = mieux)".
- **Log scale**, axis label "ms (logarithmic scale)" / "ms (échelle logarithmique)". Values in ms:
| Row EN | Row FR | Musonic | Navidrome |
|---|---|---:|---:|
| Search "love" | Recherche « love » | 0.353 | 29.4 |
| Search "mo" | Recherche « mo » | 0.377 | 25.6 |
| Search "the love" | Recherche « the love » | 0.299 | 20.2 |
| One album | Un album | 0.288 | 2.60 |
| One artist | Un artiste | 0.279 | 2.27 |
| Every artist, 797 | Tous les artistes (797) | 0.429 | 52.7 |
| One song | Un titre | 0.284 | 2.43 |
| 50 newest albums | 50 albums les plus récents | 0.338 | 16.6 |
| 500 albums A–Z | 500 albums de A à Z | 0.517 | 35.4 |
| 50 random albums | 50 albums au hasard | 2.17 | 8.31 |
| 50 random songs | 50 titres au hasard | 3.29 | 5.76 |
| Genres | Genres | 0.289 | 1.17 |
| Likes | Favoris | 0.279 | 2.17 |
| Playlists | Playlists | 0.276 | 1.01 |

## 6. /assets/img/docs/diagrams/benchmark-requests-p95.en.svg and .fr.svg
- Title: "95th percentile of 14 Subsonic requests, ms (lower is better)" / "95e centile de 14 requêtes Subsonic, ms (plus bas = mieux)".
- **Log scale**, same axis as item 5. Values in ms:
| Row EN | Row FR | Musonic | Navidrome |
|---|---|---:|---:|
| Search "love" | Recherche « love » | 0.445 | 61.9 |
| Search "mo" | Recherche « mo » | 0.455 | 60.4 |
| Search "the love" | Recherche « the love » | 0.390 | 57.2 |
| One album | Un album | 0.372 | 25.2 |
| One artist | Un artiste | 0.378 | 28.7 |
| Every artist, 797 | Tous les artistes (797) | 0.587 | 84.6 |
| One song | Un titre | 0.390 | 25.9 |
| 50 newest albums | 50 albums les plus récents | 0.450 | 36.0 |
| 500 albums A–Z | 500 albums de A à Z | 0.632 | 39.0 |
| 50 random albums | 50 albums au hasard | 2.30 | 11.2 |
| 50 random songs | 50 titres au hasard | 3.56 | 8.21 |
| Genres | Genres | 0.366 | 1.51 |
| Likes | Favoris | 0.394 | 3.50 |
| Playlists | Playlists | 0.361 | 1.34 |

## 7. /assets/img/docs/diagrams/benchmark-after-like.en.svg and .fr.svg
- Title: "Median latency right after a like, ms (lower is better)" / "Latence médiane juste après un like, ms (plus bas = mieux)".
- **Log scale**, same axis as item 5. Values in ms:
| Row EN | Row FR | Musonic | Navidrome |
|---|---|---:|---:|
| Search "love" | Recherche « love » | 2.78 | 4.88 |
| Search "mo" | Recherche « mo » | 5.47 | 7.09 |
| Search "the love" | Recherche « the love » | 1.93 | 4.61 |
| One album | Un album | 0.845 | 1.84 |
| One artist | Un artiste | 0.471 | 1.66 |
| Every artist, 797 | Tous les artistes (797) | 4.48 | 30.2 |
| One song | Un titre | 0.772 | 1.36 |
| 50 newest albums | 50 albums les plus récents | 4.46 | 4.76 |
| 500 albums A–Z | 500 albums de A à Z | 24.0 | 35.3 |
| 50 random albums | 50 albums au hasard | 2.21 | 8.41 |
| 50 random songs | 50 titres au hasard | 3.35 | 5.63 |
| Genres | Genres | 0.739 | 1.19 |
| Likes | Favoris | 0.405 | 1.62 |
| Playlists | Playlists | 0.375 | 1.02 |

## 8. /assets/img/docs/diagrams/benchmark-throughput.en.svg and .fr.svg
- Title: "Requests per second with concurrent clients (higher is better)" / "Requêtes par seconde avec des clients simultanés (plus haut = mieux)".
- Common linear scale 0 to 1,000, ticks every 200.
- Footnote under the chart: "Musonic is capped by the test client running on the same 2 cores" / "Musonic est plafonné par le client de test, sur les mêmes 2 cœurs".
| Row EN | Row FR | Musonic | Navidrome |
|---|---|---:|---:|
| 1 client | 1 client | 723 | 86.5 |
| 4 clients | 4 clients | 918 | 135 |
| 16 clients | 16 clients | 902 | 143 |
| 64 clients | 64 clients | 913 | 156 |

## 9. /assets/img/docs/diagrams/benchmark-cpu.en.svg and .fr.svg
- Title: "Server CPU time per 1,000 requests, s (lower is better)" / "Temps processeur du serveur pour 1 000 requêtes, s (plus bas = mieux)".
- Common linear scale 0 to 13 s, ticks every 2.
| Row EN | Row FR | Musonic | Navidrome |
|---|---|---:|---:|
| 1 client | 1 client | 0.582 | 12.1 |
| 4 clients | 4 clients | 0.602 | 12.1 |
| 16 clients | 16 clients | 0.601 | 11.7 |
| 64 clients | 64 clients | 0.598 | 11.0 |

## 10. /assets/img/docs/diagrams/benchmark-covers.en.svg and .fr.svg
- Title: "Covers: median time per cover, ms (lower is better)" / "Pochettes : durée médiane par pochette, ms (plus bas = mieux)".
- Own scale per row.
| Row EN | Row FR | Musonic | Navidrome |
|---|---|---:|---:|
| 300 px, first request | 300 px, 1re demande | 21.1 | 72.5 |
| 600 px, first request | 600 px, 1re demande | 31.5 | 119 |
| 300 px, asked again | 300 px, redemandée | 0.531 | 0.992 |
| 600 px, asked again | 600 px, redemandée | 0.599 | 1.05 |

## 11. /assets/img/docs/diagrams/benchmark-streaming.en.svg and .fr.svg
- Title: "Streaming: time to the first byte, ms (lower is better)" / "Streaming : durée jusqu’au 1er octet, ms (plus bas = mieux)".
- Own scale per row. Row 2 gets the "Navidrome ahead" / "Navidrome devant" label.
| Row EN | Row FR | Musonic | Navidrome |
|---|---|---:|---:|
| Original file | Fichier original | 0.811 | 1.55 |
| Transcoded, first play | Transcodé, 1re écoute | 42.0 | 33.5 |
| Transcoded, second play | Transcodé, 2e écoute | 1.25 | 1.72 |

## 12. /assets/img/docs/diagrams/benchmark-gzip.en.svg and .fr.svg
- Title: "Compressed answer size, KiB (lower is better) — Musonic 1.0.1, before short ids" / "Poids des réponses compressées, Kio (plus bas = mieux) — Musonic 1.0.1, avant les identifiants courts".
- **Log scale**, axis label "KiB (logarithmic scale)" / "Kio (échelle logarithmique)", ticks 0.1, 1, 10, 100.
- "Navidrome ahead" label on: Search "love", Search "mo", One artist, Every artist, 50 random songs, Genres, Likes.
| Row EN | Row FR | Musonic | Navidrome |
|---|---|---:|---:|
| Search "love" | Recherche « love » | 6.98 | 5.95 |
| Search "mo" | Recherche « mo » | 8.88 | 6.91 |
| Search "the love" | Recherche « the love » | 2.46 | 3.20 |
| One album | Un album | 0.723 | 0.811 |
| One artist | Un artiste | 0.690 | 0.490 |
| Every artist, 797 | Tous les artistes (797) | 47.7 | 30.0 |
| One song | Un titre | 0.639 | 0.666 |
| 50 newest albums | 50 albums les plus récents | 6.79 | 6.88 |
| 500 albums A–Z | 500 albums de A à Z | 65.8 | 67.0 |
| 50 random albums | 50 albums au hasard | 7.59 | 7.79 |
| 50 random songs | 50 titres au hasard | 13.2 | 10.6 |
| Genres | Genres | 0.772 | 0.690 |
| Likes | Favoris | 0.159 | 0.134 |
| Playlists | Playlists | 0.142 | 0.328 |

