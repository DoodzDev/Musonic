-- Scrobbling: each account may send its plays to ListenBrainz and Last.fm. The local history
-- (`scrobble`) stays the reference; plays to send wait in an outbox, with what the services
-- need copied in (a track removed later still goes out), until sent or given up.

CREATE TABLE scrobble_account (
    user_id    TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    service    TEXT NOT NULL CHECK (service IN ('listenbrainz', 'lastfm')),
    name       TEXT NOT NULL DEFAULT '',   -- the account's name on the service
    secret     TEXT NOT NULL,              -- token or session key, sealed (SecretBox)
    problem    TEXT,                       -- the service refused it: nothing is sent until reconnected
    sent_at    INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (user_id, service)
) STRICT;

CREATE TABLE scrobble_outbox (
    id          INTEGER PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    service     TEXT NOT NULL,
    played_at   INTEGER NOT NULL,
    artist      TEXT NOT NULL,
    title       TEXT NOT NULL,
    album       TEXT NOT NULL DEFAULT '',
    duration_ms INTEGER NOT NULL DEFAULT 0,
    track_no    INTEGER,
    mbid        TEXT,
    isrc        TEXT,
    attempts    INTEGER NOT NULL DEFAULT 0,
    next_at     INTEGER NOT NULL DEFAULT 0,
    UNIQUE (user_id, service, played_at, artist, title)
) STRICT;

CREATE INDEX scrobble_outbox_due ON scrobble_outbox(next_at);
