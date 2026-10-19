//! Scanner tests on real files: small WAV files written and tagged in a temporary folder.

use std::{path::PathBuf, time::Duration};

use rusqlite::Connection;

use super::*;
use crate::testing::{SONG, Song, write_song};

struct Lib {
    root: PathBuf,
    db: Db,
    scanner: Scanner,
}

impl Lib {
    async fn new(name: &str) -> Self {
        let root = std::env::temp_dir().join(format!("musonic-scan-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        let db = Db::memory().unwrap();
        let scanner = Scanner::new(db.clone(), root.clone()).await.unwrap();
        Self { root, db, scanner }
    }

    async fn q<T: rusqlite::types::FromSql + Send + 'static>(&self, sql: &'static str) -> T {
        self.db
            .call(move |c: &mut Connection| Ok(c.query_row(sql, [], |r| r.get(0))?))
            .await
            .unwrap()
    }

    async fn exec(&self, sql: &'static str) {
        self.db
            .call(move |c| Ok(c.execute_batch(sql)?))
            .await
            .unwrap();
    }
}

impl Drop for Lib {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

#[tokio::test]
async fn scans_tracks_albums_artists_and_genres() {
    let lib = Lib::new("basic").await;
    write_song(
        &lib.root,
        "Sigur Rós/Takk/03 - Hoppípolla.wav",
        &Song {
            cover: true,
            ..SONG
        },
    );
    write_song(
        &lib.root,
        "Sigur Rós/Takk/04 - Með blóðnasir.wav",
        &Song {
            title: "Með blóðnasir",
            track: 4,
            ..SONG
        },
    );
    write_song(
        &lib.root,
        "Daft Punk/RAM/08 - Get Lucky.wav",
        &Song {
            title: "Get Lucky",
            artist: "Daft Punk feat. Pharrell Williams",
            album: "Random Access Memories",
            track: 8,
            genre: "Electro; Disco",
            ..SONG
        },
    );
    std::fs::write(lib.root.join("Daft Punk/RAM/cover.jpg"), b"jpg").unwrap();

    let stats = lib.scanner.scan(false).await.unwrap();
    assert!(stats.errors.is_empty(), "{:?}", stats.errors);
    assert_eq!(
        (stats.files, stats.files_read, stats.tracks_added),
        (3, 3, 3)
    );
    assert_eq!(lib.q::<i64>("SELECT count(*) FROM track").await, 3);
    assert_eq!(lib.q::<i64>("SELECT count(*) FROM album").await, 2);
    assert_eq!(
        lib.q::<i64>("SELECT count(*) FROM artist").await,
        3,
        "Sigur Rós, Daft Punk, Pharrell"
    );
    assert_eq!(lib.q::<i64>("SELECT count(*) FROM genre").await, 3);
    assert_eq!(
        lib.q::<String>("SELECT artist_display FROM track WHERE title = 'Get Lucky'")
            .await,
        "Daft Punk • Pharrell Williams"
    );
    assert_eq!(
        lib.q::<String>("SELECT artist_display FROM album WHERE title = 'Random Access Memories'")
            .await,
        "Daft Punk",
        "without an album artist tag, the main artist"
    );
    assert_eq!(
        lib.q::<i64>("SELECT year FROM album WHERE title = 'Takk...'")
            .await,
        2005
    );
    assert_eq!(
        lib.q::<String>("SELECT cover_ref FROM album WHERE title = 'Random Access Memories'")
            .await,
        "file:Daft Punk/RAM/cover.jpg"
    );
    assert!(
        lib.q::<String>("SELECT cover_ref FROM album WHERE title = 'Takk...'")
            .await
            .starts_with("embedded:")
    );
    assert_eq!(
        lib.q::<i64>("SELECT count(*) FROM folder").await,
        5,
        "root, 2 artists, 2 albums"
    );
}

#[tokio::test]
async fn rescans_only_what_changed() {
    let lib = Lib::new("incremental").await;
    write_song(
        &lib.root,
        "A/One/01 - a.wav",
        &Song {
            title: "a",
            track: 1,
            ..SONG
        },
    );
    write_song(
        &lib.root,
        "B/Two/01 - b.wav",
        &Song {
            title: "b",
            album: "Two",
            track: 1,
            ..SONG
        },
    );
    lib.scanner.scan(false).await.unwrap();

    let again = lib.scanner.scan(false).await.unwrap();
    assert_eq!(
        (again.folders_changed, again.files_read),
        (0, 0),
        "nothing changed"
    );

    // Retag one file (another modification time) in folder B only.
    tokio::time::sleep(Duration::from_millis(1100)).await;
    write_song(
        &lib.root,
        "B/Two/01 - b.wav",
        &Song {
            title: "b (edit)",
            album: "Two",
            track: 1,
            ..SONG
        },
    );
    let after = lib.scanner.scan(false).await.unwrap();
    assert_eq!(
        (after.folders_changed, after.files_read, after.tracks_added),
        (1, 1, 0)
    );
    assert_eq!(
        lib.q::<i64>("SELECT count(*) FROM track WHERE title = 'b (edit)'")
            .await,
        1
    );

    let full = lib.scanner.scan(true).await.unwrap();
    assert_eq!(full.files_read, 2, "a full scan reads everything");
}

#[tokio::test]
async fn a_moved_file_keeps_its_track_and_likes() {
    let lib = Lib::new("move").await;
    write_song(&lib.root, "Old/03 - Hoppípolla.wav", &SONG);
    lib.scanner.scan(false).await.unwrap();
    let id: String = lib.q("SELECT id FROM track").await;
    lib.exec("INSERT INTO user(id, username, password_hash) VALUES ('u', 'u', 'x')")
        .await;
    lib.db
        .call({
            let id = id.clone();
            move |c| Ok(c.execute("INSERT INTO annotation(user_id, item_type, item_id, starred_at) VALUES ('u', 'track', ?1, 1)", [id])?)
        })
        .await
        .unwrap();

    std::fs::create_dir_all(lib.root.join("New")).unwrap();
    std::fs::rename(
        lib.root.join("Old/03 - Hoppípolla.wav"),
        lib.root.join("New/03 - Hoppípolla.wav"),
    )
    .unwrap();
    let stats = lib.scanner.scan(false).await.unwrap();
    assert_eq!(stats.tracks_added, 0);
    assert_eq!(
        lib.q::<String>("SELECT id FROM track").await,
        id,
        "same canonical id"
    );
    assert_eq!(
        lib.q::<String>("SELECT path FROM track_file").await,
        "New/03 - Hoppípolla.wav"
    );
    assert_eq!(
        lib.q::<i64>("SELECT count(*) FROM track_file").await,
        1,
        "old copy cleaned up"
    );
    assert_eq!(
        lib.q::<i64>("SELECT count(*) FROM annotation").await,
        1,
        "like kept"
    );
}

#[tokio::test]
async fn a_deleted_file_is_marked_missing_and_its_track_kept() {
    let lib = Lib::new("delete").await;
    write_song(
        &lib.root,
        "A/01 - a.wav",
        &Song {
            title: "a",
            track: 1,
            ..SONG
        },
    );
    write_song(
        &lib.root,
        "A/02 - b.wav",
        &Song {
            title: "b",
            track: 2,
            ..SONG
        },
    );
    lib.scanner.scan(false).await.unwrap();
    std::fs::remove_file(lib.root.join("A/02 - b.wav")).unwrap();
    let stats = lib.scanner.scan(false).await.unwrap();
    assert_eq!(stats.files_missing, 1);
    assert_eq!(
        lib.q::<i64>("SELECT count(*) FROM track_file WHERE missing = 1")
            .await,
        1
    );
    assert_eq!(
        lib.q::<i64>("SELECT count(*) FROM track").await,
        2,
        "the track stays (likes, playlists)"
    );

    // The whole folder goes: everything in it is missing, nothing is deleted.
    std::fs::remove_dir_all(lib.root.join("A")).unwrap();
    lib.scanner.scan(false).await.unwrap();
    assert_eq!(
        lib.q::<i64>("SELECT count(*) FROM track_file WHERE missing = 0")
            .await,
        0
    );
    assert_eq!(
        lib.q::<i64>("SELECT count(*) FROM folder WHERE missing = 1")
            .await,
        1
    );
}

#[tokio::test]
async fn an_imported_file_joins_the_track_first_seen_online() {
    let lib = Lib::new("import").await;
    // A track known only from an online catalog, already liked.
    lib.exec(
        "INSERT INTO track(id, title, norm_title, norm_artists, artist_display, duration_ms, isrc)
             VALUES ('online-1', 'Hoppípolla', 'hoppipolla', 'sigur ros', 'Sigur Rós', 270000, 'GBKEE0500003');
         INSERT INTO track_source(provider, provider_id, track_id) VALUES ('deezer', '3153429', 'online-1');",
    )
    .await;
    write_song(
        &lib.root,
        "Sigur Rós/Takk/03 - Hoppípolla.wav",
        &Song {
            isrc: Some("GBKEE0500003"),
            ..SONG
        },
    );
    let stats = lib.scanner.scan(false).await.unwrap();
    assert_eq!(stats.tracks_added, 0, "no duplicate");
    assert_eq!(
        lib.q::<String>("SELECT track_id FROM track_file").await,
        "online-1"
    );
    assert_eq!(
        lib.q::<i64>("SELECT count(*) FROM track_source").await,
        1,
        "still known online"
    );
}

#[tokio::test]
async fn reads_sidecar_lyrics() {
    let lib = Lib::new("lyrics").await;
    write_song(
        &lib.root,
        "A/01 - a.wav",
        &Song {
            title: "a",
            track: 1,
            ..SONG
        },
    );
    std::fs::write(
        lib.root.join("A/01 - a.lrc"),
        "[00:01.00]Hello\n[00:02.50]World\n",
    )
    .unwrap();
    lib.scanner.scan(false).await.unwrap();
    assert_eq!(lib.q::<String>("SELECT source FROM lyrics").await, "file");
    assert_eq!(lib.q::<i64>("SELECT synced FROM lyrics").await, 1);
}
