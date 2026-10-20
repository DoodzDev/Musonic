-- Imports: online tracks to turn into library files (liked, added to a playlist…).
-- One job per track; done jobs stay as a history of what was imported, and when.
CREATE TABLE import_job (
    track_id     TEXT PRIMARY KEY REFERENCES track(id) ON DELETE CASCADE,
    state        TEXT NOT NULL DEFAULT 'pending'
                 CHECK (state IN ('pending', 'running', 'done', 'failed')),
    attempts     INTEGER NOT NULL DEFAULT 0,
    last_error   TEXT,
    provider     TEXT,                     -- the one that served the file
    path         TEXT,                     -- where it was put, relative to the library
    requested_by TEXT REFERENCES user(id) ON DELETE SET NULL,
    next_try_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
CREATE INDEX import_job_due ON import_job(state, next_try_at);
