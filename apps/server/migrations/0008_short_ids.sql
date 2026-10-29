-- Short ids (ADR-026): what clients see (tracks, albums, artists, folders, playlists) goes from
-- UUIDs (36 characters) to 64 bits in base 62 (11 characters), the first 64 bits of the old
-- UUID; ids kept from Navidrome (22 characters of base 62) to their first 11. Clients turn the
-- ids they kept into the new ones themselves, and the server still accepts old ones
-- (`ids::shorten`). `musonic_short_id` is registered by the server; it leaves other ids as
-- they are (online ids such as `dz-track-…`).
-- Accounts, keys, invitations and imports keep their UUIDs.

-- References are checked at the end of the transaction, once every table has its new ids.
PRAGMA defer_foreign_keys = ON;

-- Two items with the same short id would become one: stop before changing anything
-- (UNIQUE constraint failed). About 3 chances in 100 million for a million items.
CREATE TEMP TABLE short_id_check (kind TEXT NOT NULL, id TEXT NOT NULL, PRIMARY KEY (kind, id));
INSERT INTO short_id_check SELECT 'artist', musonic_short_id(id) FROM artist;
INSERT INTO short_id_check SELECT 'album', musonic_short_id(id) FROM album;
INSERT INTO short_id_check SELECT 'track', musonic_short_id(id) FROM track;
INSERT INTO short_id_check SELECT 'folder', musonic_short_id(id) FROM folder;
INSERT INTO short_id_check SELECT 'playlist', musonic_short_id(id) FROM playlist;
DROP TABLE short_id_check;

UPDATE artist SET id = musonic_short_id(id);
UPDATE album SET id = musonic_short_id(id);
UPDATE track SET id = musonic_short_id(id), album_id = musonic_short_id(album_id);
UPDATE folder SET id = musonic_short_id(id), parent_id = musonic_short_id(parent_id);
UPDATE playlist SET id = musonic_short_id(id);

UPDATE album_artist SET album_id = musonic_short_id(album_id), artist_id = musonic_short_id(artist_id);
UPDATE track_artist SET track_id = musonic_short_id(track_id), artist_id = musonic_short_id(artist_id);
UPDATE track_file SET track_id = musonic_short_id(track_id), folder_id = musonic_short_id(folder_id);
UPDATE track_source SET track_id = musonic_short_id(track_id);
UPDATE album_source SET album_id = musonic_short_id(album_id);
UPDATE artist_source SET artist_id = musonic_short_id(artist_id);
UPDATE track_genre SET track_id = musonic_short_id(track_id);
UPDATE album_genre SET album_id = musonic_short_id(album_id);
UPDATE annotation SET item_id = musonic_short_id(item_id);
UPDATE scrobble SET track_id = musonic_short_id(track_id);
UPDATE playlist_track SET playlist_id = musonic_short_id(playlist_id), track_id = musonic_short_id(track_id);
UPDATE play_queue_item SET track_id = musonic_short_id(track_id);
UPDATE lyrics SET track_id = musonic_short_id(track_id);
UPDATE import_job SET track_id = musonic_short_id(track_id);
UPDATE playlist_import SET playlist_id = musonic_short_id(playlist_id);
UPDATE playlist_import_track SET track_id = musonic_short_id(track_id);
