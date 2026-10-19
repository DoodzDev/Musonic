-- Where an album's cover comes from: `file:<path relative to the library>` (cover.jpg…) or
-- `embedded:<track_file id>` (picture inside an audio file). NULL = none found.
ALTER TABLE album ADD COLUMN cover_ref TEXT;
