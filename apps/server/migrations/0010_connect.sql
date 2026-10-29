-- Musonic Connect (ADR-019): one player per account, « synced playback » (on by default):
-- starting on a device pauses the one that was playing.
ALTER TABLE user ADD COLUMN connect_sync INTEGER NOT NULL DEFAULT 1;

-- The last thing listened to on the account (any device that does not play alone): the
-- track or episode, where it was and its queue, as a Musonic Connect state (JSON). Any
-- device resumes it, even after every device was closed (`GET /v1/me/player`).
CREATE TABLE connect_state (
    user_id    TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
    state      TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);
