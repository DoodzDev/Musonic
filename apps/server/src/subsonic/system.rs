//! System and user management endpoints.

use serde_json::{Map, Value, json};

use super::{ApiError, Code, Ctx, Reply, one};
use crate::users::User;

pub fn open_subsonic_extensions() -> Reply {
    Ok(one(
        "openSubsonicExtensions",
        json!([
            { "name": "apiKeyAuthentication", "versions": [1] },
            { "name": "formPost", "versions": [1] },
            { "name": "indexBasedQueue", "versions": [1] },
            // Musonic Server itself: its clients switch to what it adds (see ADR-018);
            // version 2: the one-request routes of ADR-021 (`getMusonicLibrary`, `getMusonicHome`…);
            // version 3: short ids (ADR-026), clients convert the UUIDs they kept;
            // version 4: podcasts (ADR-023: `searchPodcasts`, `savePodcastPosition`, positions).
            { "name": "musonicServer", "versions": [1, 2, 3, 4] },
        ]),
    ))
}

pub fn license() -> Reply {
    Ok(one("license", json!({ "valid": true })))
}

pub fn token_info(ctx: &Ctx) -> Reply {
    if !ctx.params.has("apiKey") {
        return Err(ApiError::new(
            Code::AuthMechanismNotSupported,
            "tokenInfo needs apiKey authentication",
        ));
    }
    Ok(one("tokenInfo", json!({ "username": ctx.user.username })))
}

fn user_json(u: &User) -> Value {
    json!({
        "username": u.username,
        "email": "",
        "scrobblingEnabled": true,
        "adminRole": u.is_admin,
        "settingsRole": true,
        "downloadRole": true,
        "uploadRole": false,
        "playlistRole": true,
        "coverArtRole": true,
        "commentRole": true,
        "podcastRole": false,
        "streamRole": true,
        "jukeboxRole": false,
        "shareRole": false,
        "videoConversionRole": false,
        "folder": [1],
    })
}

async fn find_user(ctx: &Ctx, username: &str) -> Result<User, ApiError> {
    ctx.state
        .users
        .list()
        .await?
        .into_iter()
        .find(|u| u.username.eq_ignore_ascii_case(username))
        .ok_or_else(|| ApiError::not_found("User"))
}

pub async fn get_user(ctx: &Ctx) -> Reply {
    let name = ctx.params.get("username").unwrap_or(&ctx.user.username);
    if !ctx.user.is_admin && !name.eq_ignore_ascii_case(&ctx.user.username) {
        return Err(ApiError::forbidden());
    }
    Ok(one("user", user_json(&find_user(ctx, name).await?)))
}

pub async fn get_users(ctx: &Ctx) -> Reply {
    if !ctx.user.is_admin {
        return Err(ApiError::forbidden());
    }
    let users: Vec<Value> = ctx
        .state
        .users
        .list()
        .await?
        .iter()
        .map(user_json)
        .collect();
    Ok(one("users", json!({ "user": users })))
}

fn decode_password(raw: &str) -> String {
    match raw.strip_prefix("enc:") {
        Some(h) => hex::decode(h)
            .ok()
            .and_then(|b| String::from_utf8(b).ok())
            .unwrap_or_default(),
        None => raw.to_owned(),
    }
}

pub async fn create_user(ctx: &Ctx) -> Reply {
    if !ctx.user.is_admin {
        return Err(ApiError::forbidden());
    }
    let username = ctx.params.require("username")?;
    let password = decode_password(ctx.params.require("password")?);
    let admin = ctx.params.get("adminRole") == Some("true");
    ctx.state
        .users
        .create(username, &password, admin)
        .await
        .map_err(|e| ApiError::new(Code::Generic, e.to_string()))?;
    ctx.state.journal.log(
        crate::journal::Entry::new("account.created")
            .by_admin(&ctx.user.username)
            .target(username)
            .detail(if admin { "admin" } else { "user" }),
    );
    Ok(Map::new())
}

pub async fn delete_user(ctx: &Ctx) -> Reply {
    if !ctx.user.is_admin {
        return Err(ApiError::forbidden());
    }
    let user = find_user(ctx, ctx.params.require("username")?).await?;
    ctx.state
        .users
        .delete(&user.id)
        .await
        .map_err(|e| ApiError::new(Code::Generic, e.to_string()))?;
    ctx.state.journal.log(
        crate::journal::Entry::new("account.deleted")
            .by_admin(&ctx.user.username)
            .target(&user.username),
    );
    Ok(Map::new())
}

pub async fn change_password(ctx: &Ctx) -> Reply {
    let name = ctx.params.require("username")?;
    if !ctx.user.is_admin && !name.eq_ignore_ascii_case(&ctx.user.username) {
        return Err(ApiError::forbidden());
    }
    let user = find_user(ctx, name).await?;
    let password = decode_password(ctx.params.require("password")?);
    ctx.state
        .users
        .set_password(&user.id, &password)
        .await
        .map_err(|e| ApiError::new(Code::Generic, e.to_string()))?;
    ctx.state.journal.log(if user.id == ctx.user.id {
        crate::journal::Entry::new("password.changed").user(&user.username)
    } else {
        crate::journal::Entry::new("password.set")
            .by_admin(&ctx.user.username)
            .target(&user.username)
    });
    Ok(Map::new())
}

pub async fn music_folders(ctx: &Ctx) -> Reply {
    let folders: Vec<Value> = ctx
        .state
        .db
        .call(|c| {
            let mut st = c.prepare("SELECT id, name FROM library ORDER BY id")?;
            Ok(st
                .query_map([], |r| {
                    Ok(json!({ "id": r.get::<_, i64>(0)?, "name": r.get::<_, String>(1)? }))
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?)
        })
        .await?;
    Ok(one("musicFolders", json!({ "musicFolder": folders })))
}
