-- Account management from the administration console (RMP-005).

-- A suspended account cannot sign in; nothing of it is deleted.
ALTER TABLE user ADD COLUMN suspended INTEGER NOT NULL DEFAULT 0;

-- Rights and quotas of users who are not administrators. No row = everything allowed,
-- nothing limited (the default). NULL quota = unlimited.
CREATE TABLE user_limits (
    user_id              TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
    can_import           INTEGER NOT NULL DEFAULT 1,  -- online songs liked / playlisted get imported
    can_online           INTEGER NOT NULL DEFAULT 1,  -- online catalog (search, pages, plays)
    can_download         INTEGER NOT NULL DEFAULT 1,  -- Subsonic `download` (offline copies)
    can_public_playlists INTEGER NOT NULL DEFAULT 1,
    imports_per_day      INTEGER,
    imports_per_month    INTEGER,
    import_bytes_max     INTEGER,                     -- total size of the files imported for them
    max_bit_rate         INTEGER                      -- kbit/s when streaming
) STRICT;

-- Links to create an account: the person chooses their name and password. Only the hash of
-- the link's token is kept; the administrator never sees a password.
CREATE TABLE invitation (
    id          TEXT PRIMARY KEY,
    token_hash  TEXT NOT NULL UNIQUE,
    note        TEXT NOT NULL DEFAULT '',
    is_admin    INTEGER NOT NULL DEFAULT 0,
    created_by  TEXT REFERENCES user(id) ON DELETE SET NULL,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    expires_at  INTEGER NOT NULL,
    used_by     TEXT REFERENCES user(id) ON DELETE SET NULL,
    used_at     INTEGER,
    revoked_at  INTEGER
) STRICT;

-- Links to choose a new password (one use, expire).
CREATE TABLE password_reset (
    id             TEXT PRIMARY KEY,
    token_hash     TEXT NOT NULL UNIQUE,
    user_id        TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    logout_devices INTEGER NOT NULL DEFAULT 1,       -- also revoke the device keys once used
    created_by     TEXT REFERENCES user(id) ON DELETE SET NULL,
    created_at     INTEGER NOT NULL DEFAULT (unixepoch()),
    expires_at     INTEGER NOT NULL,
    used_at        INTEGER,
    revoked_at     INTEGER
) STRICT;
CREATE INDEX password_reset_user ON password_reset(user_id);
