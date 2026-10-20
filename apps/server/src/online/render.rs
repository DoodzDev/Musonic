//! Online items as Subsonic / OpenSubsonic objects, with `dz-…` ids (see the module doc).
//! Tracks already in the library are shown from the library instead (likes, plays…).

use serde_json::{Map, Value, json};

use super::{
    album_id, artist_id,
    deezer::{DzAlbum, DzArtist, DzTrack},
    store::Tags,
    track_id,
};

fn release(date: Option<&str>) -> Option<Value> {
    let date = date.filter(|d| !d.is_empty() && !d.starts_with("0000"))?;
    let mut parts = date.split('-').map(|p| p.parse::<i64>().ok());
    let year = parts.next().flatten()?;
    Some(json!({ "year": year, "month": parts.next().flatten(), "day": parts.next().flatten() }))
}

fn year(date: Option<&str>) -> Option<i64> {
    date?.get(..4)?.parse().ok().filter(|y| *y > 0)
}

fn artist_ref(a: &DzArtist) -> Value {
    json!({ "id": artist_id(a.id), "name": a.name })
}

/// `album`: the album the track is shown in, when its own object lacks it (album tracklists).
pub fn song(t: &DzTrack, album: Option<&DzAlbum>) -> Value {
    let tags = Tags::of(t);
    let al = t.album.as_ref().filter(|a| a.id > 0).or(album);
    let artists: Vec<Value> = t.artists().iter().map(|a| artist_ref(a)).collect();
    let mut m = Map::new();
    m.insert("id".into(), json!(track_id(t.id)));
    m.insert("isDir".into(), json!(false));
    m.insert("title".into(), json!(t.title));
    let artist = tags.artists.join(" • ");
    m.insert("artist".into(), json!(artist));
    m.insert("displayArtist".into(), json!(artist));
    if let Some(first) = t.artists().first() {
        m.insert("artistId".into(), json!(artist_id(first.id)));
    }
    m.insert("artists".into(), json!(artists));
    if let Some(al) = al {
        m.insert("album".into(), json!(al.title));
        m.insert("albumId".into(), json!(album_id(al.id)));
        m.insert("parent".into(), json!(album_id(al.id)));
        m.insert("coverArt".into(), json!(album_id(al.id)));
        let album_artist = al.artist.as_ref().or(t.artist.as_ref());
        if let Some(a) = album_artist {
            m.insert("displayAlbumArtist".into(), json!(a.name));
            m.insert("albumArtists".into(), json!([artist_ref(a)]));
        }
        if let Some(y) = year(al.release_date.as_deref()) {
            m.insert("year".into(), json!(y));
        }
    }
    if let Some(n) = t.track_position {
        m.insert("track".into(), json!(n));
    }
    if let Some(n) = t.disk_number {
        m.insert("discNumber".into(), json!(n));
    }
    m.insert("duration".into(), json!(t.duration));
    if let Some(isrc) = &tags.isrc {
        m.insert("isrc".into(), json!([isrc]));
    }
    m.insert("suffix".into(), json!("mp3"));
    m.insert("contentType".into(), json!("audio/mpeg"));
    m.insert("playCount".into(), json!(0));
    m.insert(
        "explicitStatus".into(),
        json!(if t.explicit_lyrics { "explicit" } else { "" }),
    );
    m.insert("type".into(), json!("music"));
    m.insert("mediaType".into(), json!("song"));
    Value::Object(m)
}

/// `id`: the id the client asked for (a `dz-album-…` one or the canonical id of a stored album).
pub fn album(a: &DzAlbum, id: Option<&str>) -> Value {
    let id = id.map_or_else(|| album_id(a.id), str::to_owned);
    let mut m = Map::new();
    m.insert("id".into(), json!(id));
    for key in ["name", "title", "album"] {
        m.insert(key.into(), json!(a.title));
    }
    m.insert("isDir".into(), json!(true));
    if let Some(ar) = &a.artist {
        m.insert("artist".into(), json!(ar.name));
        m.insert("displayArtist".into(), json!(ar.name));
        m.insert("artistId".into(), json!(artist_id(ar.id)));
        m.insert("parent".into(), json!(artist_id(ar.id)));
        m.insert("artists".into(), json!([artist_ref(ar)]));
    }
    m.insert("coverArt".into(), json!(album_id(a.id)));
    if let Some(y) = year(a.release_date.as_deref()) {
        m.insert("year".into(), json!(y));
    }
    if let Some(r) = release(a.release_date.as_deref()) {
        m.insert("releaseDate".into(), r);
    }
    let songs = a.nb_tracks.unwrap_or(a.tracks.data.len() as i64);
    m.insert("songCount".into(), json!(songs));
    let duration = a
        .duration
        .unwrap_or_else(|| a.tracks.data.iter().map(|t| t.duration).sum());
    m.insert("duration".into(), json!(duration));
    if let Some(g) = a.genres.data.first() {
        m.insert("genre".into(), json!(g.name));
    }
    m.insert(
        "genres".into(),
        json!(
            a.genres
                .data
                .iter()
                .map(|g| json!({ "name": g.name }))
                .collect::<Vec<_>>()
        ),
    );
    if let Some(kind) = &a.record_type {
        m.insert("releaseTypes".into(), json!([kind]));
    }
    m.insert(
        "isCompilation".into(),
        json!(a.record_type.as_deref() == Some("compile")),
    );
    m.insert("playCount".into(), json!(0));
    m.insert("mediaType".into(), json!("album"));
    Value::Object(m)
}

pub fn artist(a: &DzArtist, id: Option<&str>) -> Value {
    let id = id.map_or_else(|| artist_id(a.id), str::to_owned);
    let mut m = Map::new();
    m.insert("id".into(), json!(id));
    m.insert("name".into(), json!(a.name));
    m.insert("coverArt".into(), json!(artist_id(a.id)));
    if let Some(pic) = &a.picture_xl {
        m.insert("artistImageUrl".into(), json!(pic));
    }
    if let Some(n) = a.nb_album {
        m.insert("albumCount".into(), json!(n));
    }
    Value::Object(m)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn songs_point_to_online_albums_and_artists() {
        let t = DzTrack {
            id: 1,
            title: "Get Lucky".into(),
            duration: 369,
            artist: Some(DzArtist {
                id: 27,
                name: "Daft Punk".into(),
                ..Default::default()
            }),
            album: Some(DzAlbum {
                id: 9,
                title: "RAM".into(),
                release_date: Some("2013-05-20".into()),
                ..Default::default()
            }),
            ..Default::default()
        };
        let s = song(&t, None);
        assert_eq!(s["id"], "dz-track-1");
        assert_eq!(s["albumId"], "dz-album-9");
        assert_eq!(s["coverArt"], "dz-album-9");
        assert_eq!(s["artistId"], "dz-artist-27");
        assert_eq!(s["year"], 2013);
        assert_eq!(s["duration"], 369);
        let a = album(t.album.as_ref().unwrap(), Some("canonical"));
        assert_eq!(a["id"], "canonical");
        assert_eq!(a["releaseDate"]["month"], 5);
    }
}
