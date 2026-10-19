//! Library scanner.
//!
//! 1. **Walk** the music folder (hidden entries skipped). Each folder gets a hash of its entries
//!    (names, sizes, dates): an unchanged hash means nothing to read in it.
//! 2. **Read** the tags of new or modified files only (or all of them on a full scan), in
//!    parallel.
//! 3. **Store**, one transaction per batch: each file is attached to a canonical track, found in
//!    this order: the same path, the same persistent id (a moved or duplicated file), a track
//!    without any file yet with the same ISRC or title + artists + length (a track first seen
//!    online, now imported); otherwise a new track.
//! 4. **Finish**: files gone from changed folders are marked missing (their track, likes and
//!    playlists stay), albums are refreshed (year, genres, cover), unused albums, artists and
//!    genres are removed.

use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    sync::Arc,
    time::{Instant, UNIX_EPOCH},
};

use anyhow::{Context, Result};
use futures_util::{StreamExt, stream};
use rusqlite::{OptionalExtension, Transaction, params};
use serde::Serialize;

use super::read::{FileInfo, is_audio, read_file};
use crate::{
    db::Db,
    ids,
    matcher::{normalize, normalize_artists},
};

/// Files stored per transaction.
const BATCH: usize = 200;
/// Cover file names, in order of preference (any image extension).
const COVER_NAMES: &[&str] = &["cover", "folder", "front", "album", "albumart"];
const IMAGE_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "webp"];
/// Shown when a compilation has no album artist.
pub const VARIOUS_ARTISTS: &str = "Various Artists";
/// Album of the tracks without an album tag (one per album artist), so every track has one.
pub const UNKNOWN_ALBUM: &str = "[Unknown Album]";

/// What a scan did.
#[derive(Debug, Default, Clone, Serialize)]
pub struct ScanStats {
    pub full: bool,
    pub folders: usize,
    pub folders_changed: usize,
    pub files: usize,
    pub files_read: usize,
    pub files_missing: usize,
    pub tracks_added: usize,
    pub errors: Vec<String>,
    pub duration_ms: u128,
}

struct WalkedFile {
    rel: String,
    size: i64,
    modified: i64,
}

struct WalkedFolder {
    rel: String,
    parent: Option<String>,
    hash: String,
    audio: Vec<WalkedFile>,
    images: Vec<String>,
    /// Sidecar lyrics by file stem (`song.lrc` → `song`).
    lyrics: HashMap<String, String>,
}

fn rel_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn modified_secs(meta: &std::fs::Metadata) -> i64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |d| d.as_secs() as i64)
}

fn has_ext(name: &str, exts: &[&str]) -> bool {
    Path::new(name)
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| exts.contains(&e.to_ascii_lowercase().as_str()))
}

/// Walks the whole tree (blocking). Unreadable folders are reported, not fatal.
fn walk(root: &Path, errors: &mut Vec<String>) -> Vec<WalkedFolder> {
    let mut out = Vec::new();
    let mut pending: Vec<(PathBuf, Option<String>)> = vec![(root.to_owned(), None)];
    while let Some((dir, parent)) = pending.pop() {
        let entries = match std::fs::read_dir(&dir) {
            Ok(e) => e,
            Err(e) => {
                errors.push(format!("{}: {e}", dir.display()));
                continue;
            }
        };
        let rel = rel_path(root, &dir);
        let mut names: Vec<(String, std::fs::Metadata)> = entries
            .filter_map(|e| e.ok())
            .filter_map(|e| {
                let name = e.file_name().to_string_lossy().into_owned();
                // Follows symlinks, like the rest of the walk.
                let meta = std::fs::metadata(e.path()).ok()?;
                (!name.starts_with('.')).then_some((name, meta))
            })
            .collect();
        names.sort_by(|a, b| a.0.cmp(&b.0));

        let mut hasher = blake3::Hasher::new();
        let mut folder = WalkedFolder {
            rel: rel.clone(),
            parent,
            hash: String::new(),
            audio: Vec::new(),
            images: Vec::new(),
            lyrics: HashMap::new(),
        };
        for (name, meta) in names {
            let path = dir.join(&name);
            if meta.is_dir() {
                hasher.update(format!("d\u{1f}{name}\n").as_bytes());
                pending.push((path, Some(rel.clone())));
                continue;
            }
            let modified = modified_secs(&meta);
            hasher
                .update(format!("f\u{1f}{name}\u{1f}{}\u{1f}{modified}\n", meta.len()).as_bytes());
            if is_audio(&path) {
                folder.audio.push(WalkedFile {
                    rel: rel_path(root, &path),
                    size: meta.len() as i64,
                    modified,
                });
            } else if has_ext(&name, IMAGE_EXTENSIONS) {
                folder.images.push(rel_path(root, &path));
            } else if has_ext(&name, &["lrc", "txt"]) {
                let stem = Path::new(&name)
                    .file_stem()
                    .map(|s| s.to_string_lossy().into_owned())
                    .unwrap_or_default();
                // .lrc (synced) wins over .txt.
                if name.to_ascii_lowercase().ends_with(".lrc") || !folder.lyrics.contains_key(&stem)
                {
                    folder.lyrics.insert(stem, rel_path(root, &path));
                }
            }
        }
        folder.hash = hasher.finalize().to_hex().to_string();
        out.push(folder);
    }
    out
}

/// The cover file of a folder, by name preference.
fn cover_file(images: &[String]) -> Option<&String> {
    COVER_NAMES.iter().find_map(|wanted| {
        images.iter().find(|p| {
            Path::new(p)
                .file_stem()
                .and_then(|s| s.to_str())
                .is_some_and(|s| s.eq_ignore_ascii_case(wanted))
        })
    })
}

pub struct Scanner {
    db: Db,
    root: PathBuf,
    library_id: i64,
}

struct Known {
    size: i64,
    modified: i64,
    missing: bool,
}

impl Scanner {
    /// Registers `root` as the library (created on first use).
    pub async fn new(db: Db, root: PathBuf) -> Result<Self> {
        let path = root.to_string_lossy().into_owned();
        let library_id = db
            .call(move |c| {
                c.execute(
                    "INSERT INTO library(name, path) VALUES ('Music', ?1) ON CONFLICT(path) DO NOTHING",
                    [&path],
                )?;
                Ok(c.query_row("SELECT id FROM library WHERE path = ?1", [&path], |r| r.get(0))?)
            })
            .await?;
        Ok(Self {
            db,
            root,
            library_id,
        })
    }

    pub async fn scan(&self, full: bool) -> Result<ScanStats> {
        let started = Instant::now();
        let mut stats = ScanStats {
            full,
            ..Default::default()
        };

        let root = self.root.clone();
        let (folders, walk_errors) = tokio::task::spawn_blocking(move || {
            let mut errors = Vec::new();
            (walk(&root, &mut errors), errors)
        })
        .await?;
        stats.errors = walk_errors;
        stats.folders = folders.len();

        let lib = self.library_id;
        let (old_hashes, known) = self
            .db
            .call(move |c| {
                let mut st =
                    c.prepare("SELECT path, hash, missing FROM folder WHERE library_id = ?1")?;
                let hashes: HashMap<String, (String, bool)> = st
                    .query_map([lib], |r| {
                        Ok((r.get(0)?, (r.get(1)?, r.get::<_, i64>(2)? != 0)))
                    })?
                    .collect::<rusqlite::Result<_>>()?;
                let mut st = c.prepare(
                    "SELECT path, size, modified_at, missing FROM track_file WHERE library_id = ?1",
                )?;
                let files: HashMap<String, Known> = st
                    .query_map([lib], |r| {
                        Ok((
                            r.get(0)?,
                            Known {
                                size: r.get(1)?,
                                modified: r.get(2)?,
                                missing: r.get::<_, i64>(3)? != 0,
                            },
                        ))
                    })?
                    .collect::<rusqlite::Result<_>>()?;
                Ok((hashes, files))
            })
            .await?;

        // Folders to look into, and the files to read in them.
        let mut to_read: Vec<(String, &WalkedFolder, &WalkedFile)> = Vec::new();
        let mut changed: Vec<&WalkedFolder> = Vec::new();
        for f in &folders {
            stats.files += f.audio.len();
            let unchanged = matches!(old_hashes.get(&f.rel), Some((h, false)) if *h == f.hash);
            if unchanged && !full {
                continue;
            }
            changed.push(f);
            for file in &f.audio {
                let same = known.get(&file.rel).is_some_and(|k| {
                    k.size == file.size && k.modified == file.modified && !k.missing
                });
                if full || !same {
                    to_read.push((file.rel.clone(), f, file));
                }
            }
        }
        stats.folders_changed = changed.len();

        // Read tags in parallel.
        let workers = std::thread::available_parallelism().map_or(2, |n| n.get());
        let root = Arc::new(self.root.clone());
        let rels: Vec<String> = to_read.iter().map(|(rel, _, _)| rel.clone()).collect();
        let read: Vec<(String, Result<FileInfo>)> = stream::iter(rels)
            .map(|rel| {
                let root = root.clone();
                async move {
                    let path = root.join(&rel);
                    let info = tokio::task::spawn_blocking(move || read_file(&path))
                        .await
                        .map_err(anyhow::Error::from)
                        .and_then(|r| r);
                    (rel, info)
                }
            })
            .buffer_unordered(workers)
            .collect()
            .await;
        stats.files_read = read.len();

        let by_rel: HashMap<&str, (&WalkedFolder, &WalkedFile)> = to_read
            .iter()
            .map(|(rel, f, w)| (rel.as_str(), (*f, *w)))
            .collect();
        let mut records = Vec::new();
        for (rel, info) in read {
            match info {
                Ok(info) => {
                    let (folder, walked) = by_rel[rel.as_str()];
                    let stem = Path::new(&rel)
                        .file_stem()
                        .map(|s| s.to_string_lossy().into_owned());
                    let sidecar = stem.and_then(|s| folder.lyrics.get(&s).cloned());
                    records.push(FileRecord {
                        rel,
                        folder: folder.rel.clone(),
                        size: walked.size,
                        modified: walked.modified,
                        format: Path::new(&walked.rel)
                            .extension()
                            .map(|e| e.to_string_lossy().to_ascii_lowercase())
                            .unwrap_or_default(),
                        sidecar_lyrics: sidecar
                            .and_then(|p| std::fs::read_to_string(self.root.join(&p)).ok()),
                        info,
                    })
                }
                Err(e) => stats.errors.push(format!("{rel}: {e:#}")),
            }
        }

        // Folder rows first (files point to them), parents before children.
        let folder_rows: Vec<(String, Option<String>, String)> = changed
            .iter()
            .map(|f| (f.rel.clone(), f.parent.clone(), f.hash.clone()))
            .collect();
        let seen_folders: HashSet<String> = folders.iter().map(|f| f.rel.clone()).collect();
        let changed_files: HashMap<String, HashSet<String>> = changed
            .iter()
            .map(|f| {
                (
                    f.rel.clone(),
                    f.audio.iter().map(|a| a.rel.clone()).collect(),
                )
            })
            .collect();
        let covers: HashMap<String, Option<String>> = folders
            .iter()
            .map(|f| (f.rel.clone(), cover_file(&f.images).cloned()))
            .collect();

        let (added, missing) = self
            .db
            .call(move |c| {
                let tx = c.transaction()?;
                for (rel, parent, hash) in &folder_rows {
                    upsert_folder(&tx, lib, rel, parent.as_deref(), hash)?;
                }
                tx.commit()?;

                let mut added = 0;
                let mut touched_albums = HashSet::new();
                for batch in records.chunks(BATCH) {
                    let tx = c.transaction()?;
                    for r in batch {
                        let (new, album) = store_file(&tx, lib, r)?;
                        added += usize::from(new);
                        touched_albums.insert(album);
                    }
                    tx.commit()?;
                }

                let tx = c.transaction()?;
                let missing = mark_missing(&tx, lib, &seen_folders, &changed_files)?;
                // A track found again (moved file) no longer needs its old, missing copy.
                tx.execute(
                    "DELETE FROM track_file WHERE missing = 1 AND track_id IN
                         (SELECT track_id FROM track_file WHERE missing = 0)",
                    [],
                )?;
                // Albums of missing files may change too.
                let mut st = tx.prepare(
                    "SELECT DISTINCT t.album_id FROM track t JOIN track_file f ON f.track_id = t.id
                     WHERE f.missing = 1 AND t.album_id IS NOT NULL",
                )?;
                for a in st.query_map([], |r| r.get::<_, String>(0))? {
                    touched_albums.insert(a?);
                }
                drop(st);
                for album in &touched_albums {
                    refresh_album(&tx, album, &covers)?;
                }
                collect_garbage(&tx)?;
                tx.execute(
                    "UPDATE library SET last_scan_at = unixepoch() WHERE id = ?1",
                    [lib],
                )?;
                tx.commit()?;
                Ok((added, missing))
            })
            .await?;
        stats.tracks_added = added;
        stats.files_missing = missing;
        stats.duration_ms = started.elapsed().as_millis();
        tracing::info!(
            full,
            folders = stats.folders,
            changed = stats.folders_changed,
            files = stats.files,
            read = stats.files_read,
            added = stats.tracks_added,
            missing = stats.files_missing,
            errors = stats.errors.len(),
            ms = stats.duration_ms as u64,
            "scan done"
        );
        for e in stats.errors.iter().take(20) {
            tracing::warn!("scan: {e}");
        }
        Ok(stats)
    }
}

struct FileRecord {
    rel: String,
    folder: String,
    size: i64,
    modified: i64,
    format: String,
    sidecar_lyrics: Option<String>,
    info: FileInfo,
}

fn upsert_folder(
    tx: &Transaction,
    lib: i64,
    rel: &str,
    parent: Option<&str>,
    hash: &str,
) -> Result<()> {
    tx.execute(
        "INSERT INTO folder(id, library_id, parent_id, path, hash, missing, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 0, unixepoch())
         ON CONFLICT(id) DO UPDATE SET hash = excluded.hash, missing = 0, updated_at = unixepoch()",
        params![
            ids::folder_id(lib, rel),
            lib,
            parent.map(|p| ids::folder_id(lib, p)),
            rel,
            hash
        ],
    )?;
    Ok(())
}

fn upsert_artist(tx: &Transaction, name: &str) -> Result<String> {
    let id = ids::artist_id(name);
    tx.execute(
        "INSERT INTO artist(id, name, norm_name) VALUES (?1, ?2, ?3) ON CONFLICT(id) DO NOTHING",
        params![id, name, normalize(name)],
    )?;
    Ok(id)
}

fn upsert_genre(tx: &Transaction, name: &str) -> Result<i64> {
    tx.execute(
        "INSERT INTO genre(name) VALUES (?1) ON CONFLICT(name) DO NOTHING",
        [name],
    )?;
    Ok(tx.query_row("SELECT id FROM genre WHERE name = ?1", [name], |r| r.get(0))?)
}

/// The canonical track a file belongs to (see the module doc for the order).
fn find_track(
    tx: &Transaction,
    lib: i64,
    r: &FileRecord,
    pid: &str,
    norm_artists: &str,
) -> Result<Option<String>> {
    let same_path: Option<String> = tx
        .query_row(
            "SELECT track_id FROM track_file WHERE library_id = ?1 AND path = ?2",
            params![lib, r.rel],
            |row| row.get(0),
        )
        .optional()?;
    if same_path.is_some() {
        return Ok(same_path);
    }
    let same_pid: Option<String> = tx
        .query_row(
            "SELECT id FROM track WHERE pid = ?1 LIMIT 1",
            [pid],
            |row| row.get(0),
        )
        .optional()?;
    if same_pid.is_some() {
        return Ok(same_pid);
    }
    // A track known only online (no file yet): same ISRC, or same title, artists and length.
    let no_file = "NOT EXISTS (SELECT 1 FROM track_file f WHERE f.track_id = track.id)";
    if let Some(isrc) = &r.info.isrc {
        let hit: Option<String> = tx
            .query_row(
                &format!("SELECT id FROM track WHERE isrc = ?1 AND {no_file} LIMIT 1"),
                [isrc],
                |row| row.get(0),
            )
            .optional()?;
        if hit.is_some() {
            return Ok(hit);
        }
    }
    Ok(tx
        .query_row(
            &format!(
                "SELECT id FROM track WHERE norm_title = ?1 AND norm_artists = ?2
                 AND abs(duration_ms - ?3) <= 3000 AND {no_file} LIMIT 1"
            ),
            params![normalize(&r.info.title), norm_artists, r.info.duration_ms],
            |row| row.get(0),
        )
        .optional()?)
}

/// Stores one file; returns (new track?, album id).
fn store_file(tx: &Transaction, lib: i64, r: &FileRecord) -> Result<(bool, String)> {
    let info = &r.info;
    let artists: Vec<&str> = if info.artists.is_empty() {
        vec!["Unknown Artist"]
    } else {
        info.artists.iter().map(String::as_str).collect()
    };
    let album_artists: Vec<&str> = if !info.album_artists.is_empty() {
        info.album_artists.iter().map(String::as_str).collect()
    } else if info.compilation {
        vec![VARIOUS_ARTISTS]
    } else {
        artists.clone()
    };
    let album_artist_display = album_artists.join(" • ");
    let artist_display = artists.join(" • ");
    let norm_artists = normalize_artists(artists.iter().copied()).join("|");

    // Album (tracks without one go to "[Unknown Album]" of their album artist).
    let album_title = info.album.as_deref().unwrap_or(UNKNOWN_ALBUM);
    let album_pid = ids::album_pid(
        info.mbid_album.as_deref(),
        &album_artist_display,
        album_title,
    );
    let album_id = ids::album_id(&album_pid);
    tx.execute(
        "INSERT INTO album(id, title, sort_title, norm_title, artist_display, compilation, mbid, pid)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(id) DO UPDATE SET title = excluded.title, sort_title = excluded.sort_title,
             norm_title = excluded.norm_title, artist_display = excluded.artist_display,
             compilation = excluded.compilation, mbid = excluded.mbid, updated_at = unixepoch()",
        params![
            album_id,
            album_title,
            info.sort_album.as_deref().unwrap_or_default(),
            normalize(album_title),
            album_artist_display,
            info.compilation,
            info.mbid_album,
            album_pid
        ],
    )?;
    tx.execute("DELETE FROM album_artist WHERE album_id = ?1", [&album_id])?;
    for (i, name) in album_artists.iter().enumerate() {
        let artist = upsert_artist(tx, name)?;
        tx.execute(
            "INSERT OR IGNORE INTO album_artist(album_id, artist_id, role, position) VALUES (?1, ?2, 'albumartist', ?3)",
            params![album_id, artist, i as i64],
        )?;
    }

    // Track.
    let pid = ids::track_pid(
        info.mbid_track.as_deref(),
        &album_pid,
        info.disc_number,
        info.track_number,
        &info.title,
    );
    let existing = find_track(tx, lib, r, &pid, &norm_artists)?;
    let is_new = existing.is_none();
    let track_id = existing.unwrap_or_else(ids::new_track_id);
    tx.execute(
        "INSERT INTO track(id, title, sort_title, norm_title, norm_artists, artist_display, album_id,
             disc_number, track_number, duration_ms, isrc, mbid, pid, year, release_date, bpm)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
         ON CONFLICT(id) DO UPDATE SET title = excluded.title, sort_title = excluded.sort_title,
             norm_title = excluded.norm_title, norm_artists = excluded.norm_artists,
             artist_display = excluded.artist_display, album_id = excluded.album_id,
             disc_number = excluded.disc_number, track_number = excluded.track_number,
             duration_ms = excluded.duration_ms, isrc = coalesce(excluded.isrc, track.isrc),
             mbid = excluded.mbid, pid = excluded.pid, year = excluded.year,
             release_date = excluded.release_date, bpm = excluded.bpm, updated_at = unixepoch()",
        params![
            track_id,
            info.title,
            info.sort_title.as_deref().unwrap_or_default(),
            normalize(&info.title),
            norm_artists,
            artist_display,
            album_id,
            info.disc_number,
            info.track_number,
            info.duration_ms,
            info.isrc,
            info.mbid_track,
            pid,
            info.year,
            info.release_date,
            info.bpm
        ],
    )?;
    tx.execute("DELETE FROM track_artist WHERE track_id = ?1", [&track_id])?;
    for (role, names) in [
        ("artist", &artists),
        (
            "composer",
            &info.composers.iter().map(String::as_str).collect(),
        ),
    ] {
        for (i, name) in names.iter().enumerate() {
            let artist = upsert_artist(tx, name)?;
            tx.execute(
                "INSERT OR IGNORE INTO track_artist(track_id, artist_id, role, position) VALUES (?1, ?2, ?3, ?4)",
                params![track_id, artist, role, i as i64],
            )?;
        }
    }
    tx.execute("DELETE FROM track_genre WHERE track_id = ?1", [&track_id])?;
    for g in &info.genres {
        let genre = upsert_genre(tx, g)?;
        tx.execute(
            "INSERT OR IGNORE INTO track_genre(track_id, genre_id) VALUES (?1, ?2)",
            params![track_id, genre],
        )?;
    }

    // File.
    tx.execute(
        "INSERT INTO track_file(id, track_id, library_id, folder_id, path, size, modified_at, format,
             bit_rate, sample_rate, bit_depth, channels, duration_ms, has_cover, missing)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, 0)
         ON CONFLICT(library_id, path) DO UPDATE SET track_id = excluded.track_id,
             folder_id = excluded.folder_id, size = excluded.size, modified_at = excluded.modified_at,
             format = excluded.format, bit_rate = excluded.bit_rate, sample_rate = excluded.sample_rate,
             bit_depth = excluded.bit_depth, channels = excluded.channels,
             duration_ms = excluded.duration_ms, has_cover = excluded.has_cover, missing = 0,
             updated_at = unixepoch()",
        params![
            ids::new_id(),
            track_id,
            lib,
            ids::folder_id(lib, &r.folder),
            r.rel,
            r.size,
            r.modified,
            r.format,
            info.bit_rate,
            info.sample_rate,
            info.bit_depth,
            info.channels,
            info.duration_ms,
            info.has_cover
        ],
    )?;

    // Lyrics from the library (a sidecar file wins over the tag).
    let lyrics = r
        .sidecar_lyrics
        .as_deref()
        .map(|l| ("file", l))
        .or(info.lyrics.as_deref().map(|l| ("tag", l)));
    if let Some((source, text)) = lyrics.filter(|(_, t)| !t.trim().is_empty()) {
        let synced = text
            .lines()
            .any(|l| l.trim_start().starts_with('[') && l.contains(':') && l.contains(']'));
        tx.execute(
            "INSERT INTO lyrics(track_id, source, synced, content, fetched_at) VALUES (?1, ?2, ?3, ?4, unixepoch())
             ON CONFLICT(track_id) DO UPDATE SET source = excluded.source, synced = excluded.synced,
                 content = excluded.content, fetched_at = unixepoch()",
            params![track_id, source, synced, text],
        )?;
    }
    Ok((is_new, album_id))
}

/// Marks missing the files and folders that disappeared. Returns the number of files.
fn mark_missing(
    tx: &Transaction,
    lib: i64,
    seen_folders: &HashSet<String>,
    changed_files: &HashMap<String, HashSet<String>>,
) -> Result<usize> {
    let mut gone = 0;
    let rows: Vec<(String, String)> = tx
        .prepare("SELECT id, path FROM folder WHERE library_id = ?1 AND missing = 0")?
        .query_map([lib], |r| Ok((r.get(0)?, r.get(1)?)))?
        .collect::<rusqlite::Result<_>>()?;
    for (id, path) in rows {
        if !seen_folders.contains(&path) {
            tx.execute(
                "UPDATE folder SET missing = 1, hash = '' WHERE id = ?1",
                [&id],
            )?;
            gone += tx.execute(
                "UPDATE track_file SET missing = 1 WHERE folder_id = ?1 AND missing = 0",
                [&id],
            )?;
        }
    }
    for (folder, present) in changed_files {
        let files: Vec<(String, String)> = tx
            .prepare("SELECT id, path FROM track_file WHERE folder_id = ?1 AND missing = 0")?
            .query_map([ids::folder_id(lib, folder)], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })?
            .collect::<rusqlite::Result<_>>()?;
        for (id, path) in files {
            if !present.contains(&path) {
                gone += tx.execute("UPDATE track_file SET missing = 1 WHERE id = ?1", [&id])?;
            }
        }
    }
    Ok(gone)
}

/// Album fields computed from its tracks: year, release date, genres, cover.
fn refresh_album(
    tx: &Transaction,
    album: &str,
    covers: &HashMap<String, Option<String>>,
) -> Result<()> {
    tx.execute(
        "UPDATE album SET
             year = (SELECT min(year) FROM track WHERE album_id = ?1 AND year > 0),
             release_date = (SELECT min(release_date) FROM track WHERE album_id = ?1),
             updated_at = unixepoch()
         WHERE id = ?1",
        [album],
    )?;
    tx.execute("DELETE FROM album_genre WHERE album_id = ?1", [album])?;
    tx.execute(
        "INSERT OR IGNORE INTO album_genre(album_id, genre_id)
         SELECT DISTINCT ?1, tg.genre_id FROM track_genre tg JOIN track t ON t.id = tg.track_id WHERE t.album_id = ?1",
        [album],
    )?;
    // Cover: an image file next to the tracks, else the first embedded picture.
    let files: Vec<(String, String, bool)> = tx
        .prepare(
            "SELECT f.id, coalesce(d.path, ''), f.has_cover FROM track_file f
             JOIN track t ON t.id = f.track_id LEFT JOIN folder d ON d.id = f.folder_id
             WHERE t.album_id = ?1 AND f.missing = 0
             ORDER BY t.disc_number, t.track_number, f.path",
        )?
        .query_map([album], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get::<_, i64>(2)? != 0))
        })?
        .collect::<rusqlite::Result<_>>()?;
    let cover = files
        .iter()
        .find_map(|(_, folder, _)| {
            covers
                .get(folder)
                .cloned()
                .flatten()
                .map(|p| format!("file:{p}"))
        })
        .or_else(|| {
            files
                .iter()
                .find(|(_, _, has)| *has)
                .map(|(id, _, _)| format!("embedded:{id}"))
        });
    tx.execute(
        "UPDATE album SET cover_ref = ?2 WHERE id = ?1",
        params![album, cover],
    )?;
    Ok(())
}

/// Removes albums without tracks, artists credited nowhere, genres used nowhere.
fn collect_garbage(tx: &Transaction) -> Result<()> {
    tx.execute_batch(
        "DELETE FROM album WHERE NOT EXISTS (SELECT 1 FROM track WHERE track.album_id = album.id)
             AND NOT EXISTS (SELECT 1 FROM album_source WHERE album_source.album_id = album.id);
         DELETE FROM artist WHERE NOT EXISTS (SELECT 1 FROM track_artist WHERE artist_id = artist.id)
             AND NOT EXISTS (SELECT 1 FROM album_artist WHERE artist_id = artist.id)
             AND NOT EXISTS (SELECT 1 FROM artist_source WHERE artist_id = artist.id);
         DELETE FROM genre WHERE NOT EXISTS (SELECT 1 FROM track_genre WHERE genre_id = genre.id)
             AND NOT EXISTS (SELECT 1 FROM album_genre WHERE genre_id = genre.id);",
    )
    .context("garbage collection")?;
    Ok(())
}

#[cfg(test)]
#[path = "scanner_tests.rs"]
mod tests;
