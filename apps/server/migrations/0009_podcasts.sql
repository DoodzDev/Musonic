-- Podcasts (ADR-023): shows read from their RSS feed, their episodes, who follows what and
-- where each listener stopped. Shows and episodes are shared; subscriptions and positions are
-- per account.

CREATE TABLE podcast (
    id            TEXT PRIMARY KEY,            -- derived from the feed address (`ids::podcast_id`)
    feed_url      TEXT NOT NULL UNIQUE,
    title         TEXT NOT NULL DEFAULT '',
    author        TEXT,
    description   TEXT,
    image_url     TEXT,
    link          TEXT,
    language      TEXT,
    etag          TEXT,                        -- for conditional reads of the feed
    last_modified TEXT,
    checked_at    INTEGER,                     -- last read of the feed (changed or not)
    error         TEXT,                        -- last failure, cleared on success
    updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;

CREATE TABLE episode (
    id             TEXT PRIMARY KEY,           -- derived from the feed and the item's guid
    podcast_id     TEXT NOT NULL REFERENCES podcast(id) ON DELETE CASCADE,
    guid           TEXT NOT NULL,
    title          TEXT NOT NULL,
    description    TEXT,
    published_at   INTEGER,
    duration_s     INTEGER,
    audio_url      TEXT NOT NULL,
    audio_size     INTEGER,
    audio_type     TEXT,
    image_url      TEXT,
    chapters_url   TEXT,                       -- `podcast:chapters` (JSON)
    transcript_url TEXT,                       -- `podcast:transcript` (VTT / SRT)
    local_path     TEXT,                       -- downloaded copy, relative to the data dir
    UNIQUE (podcast_id, guid)
) STRICT;

CREATE INDEX episode_podcast ON episode(podcast_id, published_at DESC);

CREATE TABLE podcast_subscription (
    user_id       TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    podcast_id    TEXT NOT NULL REFERENCES podcast(id) ON DELETE CASCADE,
    auto_download INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (user_id, podcast_id)
) STRICT;

CREATE INDEX podcast_subscription_podcast ON podcast_subscription(podcast_id);

CREATE TABLE episode_state (
    user_id     TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    episode_id  TEXT NOT NULL REFERENCES episode(id) ON DELETE CASCADE,
    position_ms INTEGER NOT NULL DEFAULT 0,
    played      INTEGER NOT NULL DEFAULT 0,
    updated_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (user_id, episode_id)
) STRICT;
