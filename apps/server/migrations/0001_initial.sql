-- Musonic Server schema v1.
--
-- A track is a canonical song (one id for clients), with or without a file. Its local files
-- (`track_file`) and its ids in online catalogs (`track_source`) are copies of the same song:
-- liking or listing a track never depends on where its audio comes from.
-- User data (`annotation`, playlists, queues) hangs on canonical ids, so a rescan, a moved
-- file or a later import never loses it.
-- Times are Unix seconds (UTC). Durations are milliseconds.

CREATE TABLE property (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
) STRICT;

-- Library ---------------------------------------------------------------------------------

CREATE TABLE library (
    id           INTEGER PRIMARY KEY,
    name         TEXT NOT NULL UNIQUE,
    path         TEXT NOT NULL UNIQUE,
    last_scan_at INTEGER,
    created_at   INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;

-- One row per directory; `hash` (names, sizes, dates of its entries) lets a scan skip
-- directories that did not change.
CREATE TABLE folder (
    id         TEXT PRIMARY KEY,
    library_id INTEGER NOT NULL REFERENCES library(id) ON DELETE CASCADE,
    parent_id  TEXT REFERENCES folder(id) ON DELETE CASCADE,
    path       TEXT NOT NULL,                -- relative to the library root, '' = root
    hash       TEXT NOT NULL DEFAULT '',
    missing    INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE (library_id, path)
) STRICT;

CREATE TABLE artist (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    sort_name  TEXT NOT NULL DEFAULT '',
    norm_name  TEXT NOT NULL,                -- matcher::normalize(name)
    mbid       TEXT,
    image_url  TEXT,
    bio        TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
CREATE INDEX artist_norm_name ON artist(norm_name);

CREATE TABLE album (
    id             TEXT PRIMARY KEY,
    title          TEXT NOT NULL,
    sort_title     TEXT NOT NULL DEFAULT '',
    norm_title     TEXT NOT NULL,
    artist_display TEXT NOT NULL DEFAULT '', -- "A • B", as shown to users
    year           INTEGER,
    release_date   TEXT,                     -- YYYY, YYYY-MM or YYYY-MM-DD
    release_type   TEXT,                     -- album, ep, single, compilation, live…
    compilation    INTEGER NOT NULL DEFAULT 0,
    mbid           TEXT,
    cover_url      TEXT,                     -- online cover when no local one
    pid            TEXT,                     -- persistent id computed from tags
    created_at     INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at     INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
CREATE INDEX album_norm_title ON album(norm_title);
CREATE INDEX album_year ON album(year);
CREATE INDEX album_created ON album(created_at);

CREATE TABLE album_artist (
    album_id  TEXT NOT NULL REFERENCES album(id) ON DELETE CASCADE,
    artist_id TEXT NOT NULL REFERENCES artist(id) ON DELETE CASCADE,
    role      TEXT NOT NULL DEFAULT 'albumartist',
    position  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (album_id, artist_id, role)
) STRICT;
CREATE INDEX album_artist_artist ON album_artist(artist_id);

CREATE TABLE track (
    id             TEXT PRIMARY KEY,         -- canonical id (UUID)
    title          TEXT NOT NULL,
    sort_title     TEXT NOT NULL DEFAULT '',
    norm_title     TEXT NOT NULL,
    norm_artists   TEXT NOT NULL DEFAULT '', -- sorted normalized names, '|'-separated
    artist_display TEXT NOT NULL DEFAULT '',
    album_id       TEXT REFERENCES album(id) ON DELETE SET NULL,
    disc_number    INTEGER,
    track_number   INTEGER,
    duration_ms    INTEGER NOT NULL DEFAULT 0,
    isrc           TEXT,
    mbid           TEXT,
    pid            TEXT,                     -- persistent id computed from tags
    year           INTEGER,
    release_date   TEXT,
    explicit       INTEGER NOT NULL DEFAULT 0,
    bpm            INTEGER,
    cover_url      TEXT,                     -- online cover when no local one
    created_at     INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at     INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
CREATE INDEX track_album ON track(album_id, disc_number, track_number);
CREATE INDEX track_isrc ON track(isrc) WHERE isrc IS NOT NULL;
CREATE INDEX track_pid ON track(pid) WHERE pid IS NOT NULL;
CREATE INDEX track_norm ON track(norm_title, norm_artists);
CREATE INDEX track_created ON track(created_at);

CREATE TABLE track_artist (
    track_id  TEXT NOT NULL REFERENCES track(id) ON DELETE CASCADE,
    artist_id TEXT NOT NULL REFERENCES artist(id) ON DELETE CASCADE,
    role      TEXT NOT NULL DEFAULT 'artist', -- artist, composer, producer, remixer…
    position  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (track_id, artist_id, role)
) STRICT;
CREATE INDEX track_artist_artist ON track_artist(artist_id, role);

-- A local copy of a track. `missing` keeps the row when the file disappears, so a moved file
-- is matched again (same pid) instead of becoming a new track.
CREATE TABLE track_file (
    id          TEXT PRIMARY KEY,
    track_id    TEXT NOT NULL REFERENCES track(id) ON DELETE CASCADE,
    library_id  INTEGER NOT NULL REFERENCES library(id) ON DELETE CASCADE,
    folder_id   TEXT REFERENCES folder(id) ON DELETE SET NULL,
    path        TEXT NOT NULL,               -- relative to the library root
    size        INTEGER NOT NULL,
    modified_at INTEGER NOT NULL,
    format      TEXT NOT NULL,               -- mp3, flac, m4a, ogg, opus…
    bit_rate    INTEGER,                     -- kbit/s
    sample_rate INTEGER,
    bit_depth   INTEGER,
    channels    INTEGER,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    has_cover   INTEGER NOT NULL DEFAULT 0,  -- embedded picture
    missing     INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE (library_id, path)
) STRICT;
CREATE INDEX track_file_track ON track_file(track_id);
CREATE INDEX track_file_folder ON track_file(folder_id);

-- Ids of a track, album or artist in online catalogs (`deezer`, …).
CREATE TABLE track_source (
    provider    TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    track_id    TEXT NOT NULL REFERENCES track(id) ON DELETE CASCADE,
    PRIMARY KEY (provider, provider_id)
) STRICT;
CREATE INDEX track_source_track ON track_source(track_id);

CREATE TABLE album_source (
    provider    TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    album_id    TEXT NOT NULL REFERENCES album(id) ON DELETE CASCADE,
    PRIMARY KEY (provider, provider_id)
) STRICT;
CREATE INDEX album_source_album ON album_source(album_id);

CREATE TABLE artist_source (
    provider    TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    artist_id   TEXT NOT NULL REFERENCES artist(id) ON DELETE CASCADE,
    PRIMARY KEY (provider, provider_id)
) STRICT;
CREATE INDEX artist_source_artist ON artist_source(artist_id);

CREATE TABLE genre (
    id   INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE
) STRICT;

CREATE TABLE track_genre (
    track_id TEXT NOT NULL REFERENCES track(id) ON DELETE CASCADE,
    genre_id INTEGER NOT NULL REFERENCES genre(id) ON DELETE CASCADE,
    PRIMARY KEY (track_id, genre_id)
) STRICT;
CREATE INDEX track_genre_genre ON track_genre(genre_id);

CREATE TABLE album_genre (
    album_id TEXT NOT NULL REFERENCES album(id) ON DELETE CASCADE,
    genre_id INTEGER NOT NULL REFERENCES genre(id) ON DELETE CASCADE,
    PRIMARY KEY (album_id, genre_id)
) STRICT;
CREATE INDEX album_genre_genre ON album_genre(genre_id);

-- Accounts --------------------------------------------------------------------------------

CREATE TABLE user (
    id                   TEXT PRIMARY KEY,
    username             TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name         TEXT NOT NULL DEFAULT '',
    password_hash        TEXT NOT NULL,       -- argon2id (PHC string)
    -- Only when the legacy Subsonic token auth (t + s) is enabled: that scheme needs the
    -- password itself, kept encrypted with a key outside the database.
    legacy_password_enc  TEXT,
    is_admin             INTEGER NOT NULL DEFAULT 0,
    created_at           INTEGER NOT NULL DEFAULT (unixepoch()),
    last_login_at        INTEGER
) STRICT;

-- One key per device or app (OpenSubsonic `apiKey`); only its hash is stored.
CREATE TABLE api_key (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,              -- "Pixel 10", "Musonic Web"…
    key_hash     TEXT NOT NULL UNIQUE,       -- sha-256 of the key
    created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
    last_used_at INTEGER,
    revoked_at   INTEGER
) STRICT;
CREATE INDEX api_key_user ON api_key(user_id);

-- Sign-in sessions of the web client and native API; only the token hash is stored.
CREATE TABLE session (
    token_hash   TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
    expires_at   INTEGER NOT NULL,
    last_seen_at INTEGER
) STRICT;
CREATE INDEX session_user ON session(user_id);

-- Per-user data ---------------------------------------------------------------------------

CREATE TABLE annotation (
    user_id        TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    item_type      TEXT NOT NULL CHECK (item_type IN ('track', 'album', 'artist')),
    item_id        TEXT NOT NULL,
    starred_at     INTEGER,                  -- NULL = not liked
    rating         INTEGER NOT NULL DEFAULT 0 CHECK (rating BETWEEN 0 AND 5),
    play_count     INTEGER NOT NULL DEFAULT 0,
    last_played_at INTEGER,
    PRIMARY KEY (user_id, item_type, item_id)
) STRICT;
CREATE INDEX annotation_starred ON annotation(user_id, item_type, starred_at) WHERE starred_at IS NOT NULL;
CREATE INDEX annotation_played ON annotation(user_id, item_type, last_played_at);

-- The item columns are polymorphic: annotations go away with their item.
CREATE TRIGGER track_delete_annotations AFTER DELETE ON track BEGIN
    DELETE FROM annotation WHERE item_type = 'track' AND item_id = old.id;
END;
CREATE TRIGGER album_delete_annotations AFTER DELETE ON album BEGIN
    DELETE FROM annotation WHERE item_type = 'album' AND item_id = old.id;
END;
CREATE TRIGGER artist_delete_annotations AFTER DELETE ON artist BEGIN
    DELETE FROM annotation WHERE item_type = 'artist' AND item_id = old.id;
END;

CREATE TABLE scrobble (
    id        INTEGER PRIMARY KEY,
    user_id   TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    track_id  TEXT NOT NULL REFERENCES track(id) ON DELETE CASCADE,
    played_at INTEGER NOT NULL,
    client    TEXT
) STRICT;
CREATE INDEX scrobble_user ON scrobble(user_id, played_at);

CREATE TABLE playlist (
    id         TEXT PRIMARY KEY,
    owner_id   TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    comment    TEXT NOT NULL DEFAULT '',
    public     INTEGER NOT NULL DEFAULT 0,
    cover_path TEXT,                         -- custom cover, relative to the data dir
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
CREATE INDEX playlist_owner ON playlist(owner_id);

CREATE TABLE playlist_track (
    playlist_id TEXT NOT NULL REFERENCES playlist(id) ON DELETE CASCADE,
    position    INTEGER NOT NULL,
    track_id    TEXT NOT NULL REFERENCES track(id) ON DELETE CASCADE,
    added_at    INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (playlist_id, position)
) STRICT;
CREATE INDEX playlist_track_track ON playlist_track(track_id);

-- Saved play queue, to resume on another device.
CREATE TABLE play_queue (
    user_id     TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
    current     INTEGER NOT NULL DEFAULT 0,  -- index in play_queue_item
    position_ms INTEGER NOT NULL DEFAULT 0,
    changed_by  TEXT,
    updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;

CREATE TABLE play_queue_item (
    user_id  TEXT NOT NULL REFERENCES play_queue(user_id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    track_id TEXT NOT NULL REFERENCES track(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, position)
) STRICT;

-- Caches ----------------------------------------------------------------------------------

CREATE TABLE lyrics (
    track_id   TEXT PRIMARY KEY REFERENCES track(id) ON DELETE CASCADE,
    source     TEXT NOT NULL,                -- file, tag, lrclib, none
    synced     INTEGER NOT NULL DEFAULT 0,
    content    TEXT NOT NULL DEFAULT '',     -- LRC when synced, plain text otherwise
    fetched_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;

-- Search ----------------------------------------------------------------------------------
-- Full-text indexes kept in sync by triggers. Accents and case are ignored by the tokenizer.

CREATE VIRTUAL TABLE track_fts USING fts5(
    title, artist_display, content = 'track', content_rowid = 'rowid',
    tokenize = 'unicode61 remove_diacritics 2'
);
CREATE TRIGGER track_fts_insert AFTER INSERT ON track BEGIN
    INSERT INTO track_fts(rowid, title, artist_display) VALUES (new.rowid, new.title, new.artist_display);
END;
CREATE TRIGGER track_fts_delete AFTER DELETE ON track BEGIN
    INSERT INTO track_fts(track_fts, rowid, title, artist_display) VALUES ('delete', old.rowid, old.title, old.artist_display);
END;
CREATE TRIGGER track_fts_update AFTER UPDATE OF title, artist_display ON track BEGIN
    INSERT INTO track_fts(track_fts, rowid, title, artist_display) VALUES ('delete', old.rowid, old.title, old.artist_display);
    INSERT INTO track_fts(rowid, title, artist_display) VALUES (new.rowid, new.title, new.artist_display);
END;

CREATE VIRTUAL TABLE album_fts USING fts5(
    title, artist_display, content = 'album', content_rowid = 'rowid',
    tokenize = 'unicode61 remove_diacritics 2'
);
CREATE TRIGGER album_fts_insert AFTER INSERT ON album BEGIN
    INSERT INTO album_fts(rowid, title, artist_display) VALUES (new.rowid, new.title, new.artist_display);
END;
CREATE TRIGGER album_fts_delete AFTER DELETE ON album BEGIN
    INSERT INTO album_fts(album_fts, rowid, title, artist_display) VALUES ('delete', old.rowid, old.title, old.artist_display);
END;
CREATE TRIGGER album_fts_update AFTER UPDATE OF title, artist_display ON album BEGIN
    INSERT INTO album_fts(album_fts, rowid, title, artist_display) VALUES ('delete', old.rowid, old.title, old.artist_display);
    INSERT INTO album_fts(rowid, title, artist_display) VALUES (new.rowid, new.title, new.artist_display);
END;

CREATE VIRTUAL TABLE artist_fts USING fts5(
    name, content = 'artist', content_rowid = 'rowid',
    tokenize = 'unicode61 remove_diacritics 2'
);
CREATE TRIGGER artist_fts_insert AFTER INSERT ON artist BEGIN
    INSERT INTO artist_fts(rowid, name) VALUES (new.rowid, new.name);
END;
CREATE TRIGGER artist_fts_delete AFTER DELETE ON artist BEGIN
    INSERT INTO artist_fts(artist_fts, rowid, name) VALUES ('delete', old.rowid, old.name);
END;
CREATE TRIGGER artist_fts_update AFTER UPDATE OF name ON artist BEGIN
    INSERT INTO artist_fts(artist_fts, rowid, name) VALUES ('delete', old.rowid, old.name);
    INSERT INTO artist_fts(rowid, name) VALUES (new.rowid, new.name);
END;
