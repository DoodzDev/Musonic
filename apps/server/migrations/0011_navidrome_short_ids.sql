-- Repair of imports from Navidrome made with server 1.0.3 to 1.2.1: they kept the Navidrome
-- ids of tracks and playlists (22 characters) as they were, while requests shorten such an id
-- to its first 11 characters before looking it up (ADR-026), so those tracks and playlists
-- were "not found". They get the short id 0008 gave older ones; every other id is already
-- short and `musonic_short_id` leaves it as it is.

PRAGMA defer_foreign_keys = ON;

-- Same guard as 0008: two items with the same short id would become one.
CREATE TEMP TABLE short_id_check (kind TEXT NOT NULL, id TEXT NOT NULL, PRIMARY KEY (kind, id));
INSERT INTO short_id_check SELECT 'track', musonic_short_id(id) FROM track;
INSERT INTO short_id_check SELECT 'playlist', musonic_short_id(id) FROM playlist;
DROP TABLE short_id_check;

UPDATE track SET id = musonic_short_id(id);
UPDATE playlist SET id = musonic_short_id(id);

UPDATE track_file SET track_id = musonic_short_id(track_id);
UPDATE track_source SET track_id = musonic_short_id(track_id);
UPDATE track_artist SET track_id = musonic_short_id(track_id);
UPDATE track_genre SET track_id = musonic_short_id(track_id);
UPDATE annotation SET item_id = musonic_short_id(item_id) WHERE item_type = 'track';
UPDATE scrobble SET track_id = musonic_short_id(track_id);
UPDATE playlist_track SET playlist_id = musonic_short_id(playlist_id), track_id = musonic_short_id(track_id);
UPDATE play_queue_item SET track_id = musonic_short_id(track_id);
UPDATE lyrics SET track_id = musonic_short_id(track_id);
UPDATE import_job SET track_id = musonic_short_id(track_id);
UPDATE playlist_import SET playlist_id = musonic_short_id(playlist_id);
UPDATE playlist_import_track SET track_id = musonic_short_id(track_id);
