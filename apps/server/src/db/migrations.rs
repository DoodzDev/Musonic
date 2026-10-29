//! Schema migrations: SQL files in `migrations/`, built into the binary and applied in order.
//! `PRAGMA user_version` holds how many are applied. Each runs in its own transaction; a
//! migration is never edited once released, a new one is added instead.

use anyhow::{Context, Result, bail};
use rusqlite::Connection;

/// `(name, sql)`, in order.
pub const MIGRATIONS: &[(&str, &str)] = &[
    (
        "0001_initial",
        include_str!("../../migrations/0001_initial.sql"),
    ),
    (
        "0002_album_cover",
        include_str!("../../migrations/0002_album_cover.sql"),
    ),
    (
        "0003_imports",
        include_str!("../../migrations/0003_imports.sql"),
    ),
    (
        "0004_accounts_admin",
        include_str!("../../migrations/0004_accounts_admin.sql"),
    ),
    (
        "0005_invitation_name",
        include_str!("../../migrations/0005_invitation_name.sql"),
    ),
    (
        "0006_metrics",
        include_str!("../../migrations/0006_metrics.sql"),
    ),
    (
        "0007_playlist_imports",
        include_str!("../../migrations/0007_playlist_imports.sql"),
    ),
    (
        "0008_short_ids",
        include_str!("../../migrations/0008_short_ids.sql"),
    ),
];

pub const SCHEMA_VERSION: u32 = MIGRATIONS.len() as u32;

pub fn apply(conn: &mut Connection) -> Result<()> {
    let current: u32 = conn.pragma_query_value(None, "user_version", |r| r.get(0))?;
    if current > SCHEMA_VERSION {
        bail!(
            "database schema {current} is newer than this server ({SCHEMA_VERSION}): update the server"
        );
    }
    for (i, (name, sql)) in MIGRATIONS.iter().enumerate().skip(current as usize) {
        let tx = conn.transaction()?;
        tx.execute_batch(sql)
            .with_context(|| format!("migration {name}"))?;
        tx.pragma_update(None, "user_version", i as u32 + 1)?;
        tx.commit()?;
        tracing::info!("database migrated to {} ({name})", i + 1);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use rusqlite::params;

    use super::*;
    use crate::{db::Db, ids::shorten};

    fn conn(db: &Db) -> std::sync::MutexGuard<'_, Connection> {
        db.conn.lock().unwrap()
    }

    fn count(c: &Connection, sql: &str) -> i64 {
        c.query_row(sql, [], |r| r.get(0)).unwrap()
    }

    #[tokio::test]
    async fn applies_all_migrations_once() {
        let db = Db::memory().unwrap();
        assert_eq!(db.version().await.unwrap(), SCHEMA_VERSION);
        // Running again changes nothing.
        apply(&mut conn(&db)).unwrap();
        assert_eq!(db.version().await.unwrap(), SCHEMA_VERSION);
    }

    #[test]
    fn refuses_a_newer_schema() {
        let mut c = Connection::open_in_memory().unwrap();
        c.pragma_update(None, "user_version", SCHEMA_VERSION + 1)
            .unwrap();
        assert!(apply(&mut c).is_err());
    }

    fn seed(c: &Connection) {
        c.execute_batch(
            "INSERT INTO library(id, name, path) VALUES (1, 'Music', '/music');
             INSERT INTO user(id, username, password_hash) VALUES ('u1', 'Doodz', 'x');
             INSERT INTO artist(id, name, norm_name) VALUES ('ar1', 'Sigur Rós', 'sigur ros');
             INSERT INTO album(id, title, norm_title, artist_display) VALUES ('al1', 'Takk...', 'takk', 'Sigur Rós');
             INSERT INTO track(id, title, norm_title, artist_display, album_id, duration_ms)
                 VALUES ('t1', 'Hoppípolla', 'hoppipolla', 'Sigur Rós', 'al1', 276000);
             INSERT INTO track_artist(track_id, artist_id) VALUES ('t1', 'ar1');",
        )
        .unwrap();
    }

    #[test]
    fn a_track_keeps_its_likes_when_its_file_goes() {
        let db = Db::memory().unwrap();
        let c = conn(&db);
        seed(&c);
        c.execute_batch(
            "INSERT INTO track_file(id, track_id, library_id, path, size, modified_at, format)
                 VALUES ('f1', 't1', 1, 'Sigur Rós/Takk/03 - Hoppípolla.mp3', 4694815, 0, 'mp3');
             INSERT INTO track_source(provider, provider_id, track_id) VALUES ('deezer', '3153429', 't1');
             INSERT INTO annotation(user_id, item_type, item_id, starred_at) VALUES ('u1', 'track', 't1', 1);",
        )
        .unwrap();
        c.execute("DELETE FROM track_file WHERE id = 'f1'", [])
            .unwrap();
        assert_eq!(
            count(&c, "SELECT count(*) FROM annotation"),
            1,
            "like kept without a file"
        );
        assert_eq!(
            count(&c, "SELECT count(*) FROM track_source"),
            1,
            "still playable online"
        );
        c.execute("DELETE FROM track WHERE id = 't1'", []).unwrap();
        assert_eq!(
            count(&c, "SELECT count(*) FROM annotation"),
            0,
            "like gone with its track"
        );
        assert_eq!(count(&c, "SELECT count(*) FROM track_source"), 0);
    }

    #[test]
    fn deleting_a_user_deletes_their_data() {
        let db = Db::memory().unwrap();
        let c = conn(&db);
        seed(&c);
        c.execute_batch(
            "INSERT INTO playlist(id, owner_id, name) VALUES ('p1', 'u1', 'Mix');
             INSERT INTO playlist_track(playlist_id, position, track_id) VALUES ('p1', 0, 't1');
             INSERT INTO api_key(id, user_id, name, key_hash) VALUES ('k1', 'u1', 'Pixel', 'h');
             INSERT INTO annotation(user_id, item_type, item_id, play_count) VALUES ('u1', 'album', 'al1', 3);",
        )
        .unwrap();
        c.execute("DELETE FROM user WHERE id = 'u1'", []).unwrap();
        for table in ["playlist", "playlist_track", "api_key", "annotation"] {
            assert_eq!(
                count(&c, &format!("SELECT count(*) FROM {table}")),
                0,
                "{table}"
            );
        }
        assert_eq!(
            count(&c, "SELECT count(*) FROM track"),
            1,
            "the library stays"
        );
    }

    #[test]
    fn rejects_bad_values() {
        let db = Db::memory().unwrap();
        let c = conn(&db);
        seed(&c);
        let bad = [
            "INSERT INTO annotation(user_id, item_type, item_id) VALUES ('u1', 'song', 't1')",
            "INSERT INTO annotation(user_id, item_type, item_id, rating) VALUES ('u1', 'track', 't1', 9)",
            "INSERT INTO track_file(id, track_id, library_id, path, size, modified_at, format) VALUES ('f', 'nope', 1, 'a', 1, 0, 'mp3')",
            "INSERT INTO user(id, username, password_hash) VALUES ('u2', 'doodz', 'y')",
            "INSERT INTO track(id, title, norm_title, duration_ms) VALUES ('t2', 'x', 'x', 'long')",
        ];
        for sql in bad {
            assert!(c.execute(sql, []).is_err(), "accepted: {sql}");
        }
    }

    #[test]
    fn search_ignores_accents_and_follows_edits() {
        let db = Db::memory().unwrap();
        let c = conn(&db);
        seed(&c);
        let find = |q: &str| -> Vec<String> {
            let mut st = c
                .prepare("SELECT t.id FROM track_fts f JOIN track t ON t.rowid = f.rowid WHERE track_fts MATCH ?1")
                .unwrap();
            st.query_map(params![q], |r| r.get(0))
                .unwrap()
                .map(Result::unwrap)
                .collect()
        };
        assert_eq!(find("hoppipolla"), ["t1"]);
        assert_eq!(find("sigur ros"), ["t1"]);
        c.execute("UPDATE track SET title = 'Glósóli' WHERE id = 't1'", [])
            .unwrap();
        assert!(find("hoppipolla").is_empty());
        assert_eq!(find("glosoli"), ["t1"]);
        c.execute("DELETE FROM track WHERE id = 't1'", []).unwrap();
        assert!(find("glosoli").is_empty());
        c.execute(
            "INSERT INTO track_fts(track_fts) VALUES ('integrity-check')",
            [],
        )
        .unwrap();
        let mut st = c
            .prepare("SELECT rowid FROM album_fts WHERE album_fts MATCH 'takk'")
            .unwrap();
        assert_eq!(st.query_map([], |r| r.get::<_, i64>(0)).unwrap().count(), 1);
    }

    #[tokio::test]
    async fn short_ids_keep_every_link_and_a_copy_of_the_old_base() {
        const AR: &str = "0c3c5e47-6f22-5dfe-ab18-9987368e4dac";
        const AL: &str = "debee2e6-23ec-565c-8a48-8c8d3c4dc5cb";
        const T: &str = "5220a049-bd94-47ae-8d35-2ca090cfb168";
        const F: &str = "2497d93f-160d-5ac6-b55e-b739c9f466e2";
        const P: &str = "7b0c1d2e-3f40-4a5b-8c6d-7e8f90a1b2c3";
        const U: &str = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
        // Kept by an import from Navidrome.
        const ND: &str = "4xDzN7lF2pq1Hc0Ab9Zk3s";
        let dir = crate::testing::temp_dir("short-ids");
        let path = dir.join("musonic.db");
        {
            // A base as version 1.0.2 left it (schema 7), with UUIDs everywhere.
            let mut c = Connection::open(&path).unwrap();
            for (_, sql) in &MIGRATIONS[..7] {
                c.execute_batch(sql).unwrap();
            }
            c.pragma_update(None, "user_version", 7).unwrap();
            let tx = c.transaction().unwrap();
            tx.execute_batch(&format!(
                "INSERT INTO library(id, name, path) VALUES (1, 'Music', '/music');
                 INSERT INTO user(id, username, password_hash) VALUES ('{U}', 'Doodz', 'x');
                 INSERT INTO folder(id, library_id, path) VALUES ('{F}', 1, 'Sigur Rós');
                 INSERT INTO artist(id, name, norm_name) VALUES ('{AR}', 'Sigur Rós', 'sigur ros');
                 INSERT INTO album(id, title, norm_title, artist_display) VALUES ('{AL}', 'Takk...', 'takk', 'Sigur Rós');
                 INSERT INTO album_artist(album_id, artist_id) VALUES ('{AL}', '{AR}');
                 INSERT INTO track(id, title, norm_title, artist_display, album_id, duration_ms)
                     VALUES ('{T}', 'Hoppípolla', 'hoppipolla', 'Sigur Rós', '{AL}', 276000);
                 INSERT INTO track_artist(track_id, artist_id) VALUES ('{T}', '{AR}');
                 INSERT INTO track(id, title, norm_title, artist_display, album_id, duration_ms)
                     VALUES ('{ND}', 'Glósóli', 'glosoli', 'Sigur Rós', '{AL}', 368000);
                 INSERT INTO track_file(id, track_id, library_id, folder_id, path, size, modified_at, format)
                     VALUES ('file-1', '{T}', 1, '{F}', 'Sigur Rós/03.mp3', 1, 0, 'mp3');
                 INSERT INTO annotation(user_id, item_type, item_id, starred_at) VALUES
                     ('{U}', 'track', '{T}', 1), ('{U}', 'album', '{AL}', 1),
                     ('{U}', 'artist', '{AR}', 1), ('{U}', 'track', 'dz-track-1001', 1);
                 INSERT INTO scrobble(user_id, track_id, played_at) VALUES ('{U}', '{T}', 1);
                 INSERT INTO playlist(id, owner_id, name) VALUES ('{P}', '{U}', 'Mix');
                 INSERT INTO playlist_track(playlist_id, position, track_id) VALUES ('{P}', 0, '{T}');
                 INSERT INTO play_queue(user_id) VALUES ('{U}');
                 INSERT INTO play_queue_item(user_id, position, track_id) VALUES ('{U}', 0, '{T}');"
            ))
            .unwrap();
            tx.commit().unwrap();
        }
        let db = Db::open(&path).unwrap();
        let c = conn(&db);
        let one = |sql: &str| -> String { c.query_row(sql, [], |r| r.get(0)).unwrap() };
        let (ar, al, t) = (shorten(AR), shorten(AL), shorten(T));
        assert_eq!(one("SELECT id FROM artist"), ar);
        assert_eq!(one("SELECT id FROM album"), al);
        assert_eq!(one("SELECT id FROM track WHERE title = 'Hoppípolla'"), t);
        assert_eq!(
            one("SELECT id FROM track WHERE title = 'Glósóli'"),
            "4xDzN7lF2pq"
        );
        assert_eq!(one("SELECT album_id FROM track"), al);
        assert_eq!(one("SELECT id FROM folder"), shorten(F));
        assert_eq!(one("SELECT folder_id FROM track_file"), shorten(F));
        assert_eq!(
            one("SELECT id FROM track_file"),
            "file-1",
            "not shown, kept"
        );
        assert_eq!(one("SELECT id FROM playlist"), shorten(P));
        assert_eq!(one("SELECT track_id FROM playlist_track"), t);
        assert_eq!(one("SELECT track_id FROM play_queue_item"), t);
        assert_eq!(one("SELECT track_id FROM scrobble"), t);
        assert_eq!(one("SELECT id FROM user"), U, "accounts keep their UUIDs");
        let liked: Vec<String> = c
            .prepare("SELECT item_id FROM annotation ORDER BY item_type, item_id")
            .unwrap()
            .query_map([], |r| r.get(0))
            .unwrap()
            .map(Result::unwrap)
            .collect();
        assert_eq!(
            liked,
            [
                al.to_string(),
                ar.to_string(),
                t.to_string(),
                "dz-track-1001".into()
            ]
        );
        assert_eq!(
            count(&c, "SELECT count(*) FROM pragma_foreign_key_check"),
            0,
            "every link still points somewhere"
        );
        c.execute(
            "INSERT INTO track_fts(track_fts) VALUES ('integrity-check')",
            [],
        )
        .unwrap();
        let old = Connection::open(dir.join("musonic.db.before-schema-8")).unwrap();
        let kept: String = old
            .query_row(
                "SELECT id FROM track WHERE title = 'Hoppípolla'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(kept, T, "the copy is the base as it was");
        drop(c);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn daily_backups_are_complete_and_rotated() {
        let db = Db::memory().unwrap();
        db.call(|c| {
            c.execute("INSERT INTO property(key, value) VALUES ('k', 'v')", [])?;
            Ok(())
        })
        .await
        .unwrap();
        let dir = crate::testing::temp_dir("backups");
        for old in [
            "musonic-2026-01-01.db",
            "musonic-2026-01-02.db",
            "notes.txt",
        ] {
            std::fs::write(dir.join(old), "x").unwrap();
        }
        let path = db.daily_backup(&dir, 2).await.unwrap();
        let copy = Connection::open(&path).unwrap();
        let v: String = copy
            .query_row("SELECT value FROM property WHERE key = 'k'", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(v, "v");
        let mut left: Vec<String> = std::fs::read_dir(&dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().into_string().unwrap())
            .collect();
        left.sort();
        assert_eq!(left.len(), 3, "{left:?}");
        assert!(left.contains(&"musonic-2026-01-02.db".to_owned()));
        assert!(
            left.contains(&"notes.txt".to_owned()),
            "other files are left alone"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }
}
