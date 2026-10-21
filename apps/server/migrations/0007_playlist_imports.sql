-- Playlists imported from Spotify or Deezer (ADR-020): one import per pasted address or list of
-- links, its songs in their order with what was found for each. The playlist is made when the
-- import is done; the report stays until its owner removes it.
CREATE TABLE playlist_import (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    source       TEXT NOT NULL,            -- 'deezer', 'spotify'
    source_id    TEXT,                     -- the playlist's id there, when read from an address
    url          TEXT,
    name         TEXT NOT NULL,
    cover_url    TEXT,
    playlist_id  TEXT REFERENCES playlist(id) ON DELETE SET NULL,
    state        TEXT NOT NULL DEFAULT 'pending'
                 CHECK (state IN ('pending', 'running', 'done', 'failed')),
    -- Songs the source playlist has (may be more than read: Spotify by address, 100).
    source_total INTEGER,
    error        TEXT,
    created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
CREATE INDEX playlist_import_user ON playlist_import(user_id, created_at);
CREATE INDEX playlist_import_state ON playlist_import(state);

CREATE TABLE playlist_import_track (
    import_id    TEXT NOT NULL REFERENCES playlist_import(id) ON DELETE CASCADE,
    position     INTEGER NOT NULL,
    title        TEXT NOT NULL,
    artists      TEXT NOT NULL,            -- ' • ' between names
    album        TEXT,
    duration_ms  INTEGER,
    isrc         TEXT,
    link         TEXT,                     -- the song at the source (Spotify or Deezer address)
    source_id    TEXT,                     -- its id there
    status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'library', 'online', 'uncertain', 'missing')),
    reason       TEXT,                     -- why missing: 'not_found', 'online_not_allowed'
    track_id     TEXT REFERENCES track(id) ON DELETE SET NULL,
    PRIMARY KEY (import_id, position)
) STRICT;
