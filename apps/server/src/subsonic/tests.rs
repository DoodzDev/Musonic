//! Requests as the Musonic apps and other clients send them.

use axum::{
    Router,
    body::Body,
    http::{Request, header},
};
use http_body_util::BodyExt;
use md5::Digest;
use serde_json::Value;
use tower::ServiceExt;

use crate::server::{AppState, router, tests::state};

async fn setup() -> (Router, AppState) {
    let st = state();
    st.users
        .create("Doodz", "correct horse", true)
        .await
        .unwrap();
    st.users
        .create("guest", "battery staple", false)
        .await
        .unwrap();
    (router(st.clone()), st)
}

async fn send(app: &Router, req: Request<Body>) -> (String, String) {
    let res = app.clone().oneshot(req).await.unwrap();
    let ct = res
        .headers()
        .get(header::CONTENT_TYPE)
        .map(|v| v.to_str().unwrap().to_owned())
        .unwrap_or_default();
    let body = res.into_body().collect().await.unwrap().to_bytes();
    (ct, String::from_utf8(body.to_vec()).unwrap())
}

async fn get(app: &Router, uri: &str) -> Value {
    let (_, body) = send(app, Request::get(uri).body(Body::empty()).unwrap()).await;
    serde_json::from_str::<Value>(&body).unwrap()["subsonic-response"].clone()
}

fn token(password: &str, salt: &str) -> String {
    hex::encode(md5::Md5::digest(format!("{password}{salt}").as_bytes()))
}

#[tokio::test]
async fn web_client_token_login() {
    let (app, _) = setup().await;
    // Exactly what packages/core sends.
    let t = token("correct horse", "a1b2c3");
    let r = get(
        &app,
        &format!("/rest/ping.view?u=Doodz&t={t}&s=a1b2c3&v=1.16.1&c=Musonic&f=json"),
    )
    .await;
    assert_eq!(r["status"], "ok");
    assert_eq!(r["openSubsonic"], true);
    assert_eq!(r["type"], "musonic");
    let r = get(
        &app,
        "/rest/ping.view?u=Doodz&t=00000000000000000000000000000000&s=a1b2c3&f=json",
    )
    .await;
    assert_eq!(r["status"], "failed");
    assert_eq!(r["error"]["code"], 40);
}

#[tokio::test]
async fn mobile_client_password_login() {
    let (app, _) = setup().await;
    // The mobile app sends the password in `p` (URL-encoded).
    let r = get(
        &app,
        "/rest/ping.view?u=Doodz&p=correct%20horse&v=1.16.1&c=Musonic&f=json",
    )
    .await;
    assert_eq!(r["status"], "ok");
    let hex_pass = hex::encode("correct horse");
    let r = get(&app, &format!("/rest/ping?u=Doodz&p=enc:{hex_pass}&f=json")).await;
    assert_eq!(r["status"], "ok", "enc: form, and no .view suffix");
}

#[tokio::test]
async fn too_many_failures_lock_the_account_for_that_address() {
    let (app, _) = setup().await;
    // An app retrying an old password: not guessing, never locked.
    for _ in 0..20 {
        get(&app, "/rest/ping?u=Doodz&p=old%20password&f=json").await;
    }
    let r = get(&app, "/rest/ping?u=Doodz&p=correct%20horse&f=json").await;
    assert_eq!(r["status"], "ok", "the new password still works");
    // Ten different guesses: locked.
    for i in 0..10 {
        let r = get(&app, &format!("/rest/ping?u=Doodz&p=guess{i}&f=json")).await;
        assert_eq!(r["error"]["code"], 40);
    }
    let r = get(&app, "/rest/ping?u=Doodz&p=correct%20horse&f=json").await;
    assert_eq!(r["status"], "failed", "locked even with the right password");
    let r = get(&app, "/rest/ping?u=guest&p=battery%20staple&f=json").await;
    assert_eq!(r["status"], "ok", "other accounts are not affected");
}

#[tokio::test]
async fn api_keys_open_subsonic() {
    let (app, st) = setup().await;
    let user = st
        .users
        .list()
        .await
        .unwrap()
        .into_iter()
        .find(|u| u.username == "guest")
        .unwrap();
    let (_, key) = st
        .users
        .create_api_key(&user.id, "Symfonium")
        .await
        .unwrap();

    let r = get(&app, &format!("/rest/tokenInfo?apiKey={key}&f=json")).await;
    assert_eq!(r["tokenInfo"]["username"], "guest");
    let r = get(&app, &format!("/rest/ping?apiKey={key}&u=guest&f=json")).await;
    assert_eq!(r["error"]["code"], 43, "apiKey mixed with u");
    let r = get(&app, "/rest/ping?apiKey=msk_wrong&f=json").await;
    assert_eq!(r["error"]["code"], 44);
    let r = get(&app, "/rest/getOpenSubsonicExtensions?f=json").await;
    assert_eq!(r["status"], "ok", "no credentials needed");
    assert_eq!(
        r["openSubsonicExtensions"][0]["name"],
        "apiKeyAuthentication"
    );
}

#[tokio::test]
async fn xml_by_default_and_form_posts() {
    let (app, _) = setup().await;
    let (ct, body) = send(
        &app,
        Request::get("/rest/ping.view?u=Doodz&p=correct%20horse")
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert!(ct.starts_with("application/xml"));
    assert!(body.contains("<subsonic-response xmlns=\"http://subsonic.org/restapi\""));
    assert!(body.contains("status=\"ok\""));

    let req = Request::post("/rest/getUser.view")
        .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
        .body(Body::from("u=Doodz&p=correct+horse&f=json&username=guest"))
        .unwrap();
    let (_, body) = send(&app, req).await;
    let r: Value = serde_json::from_str(&body).unwrap();
    assert_eq!(r["subsonic-response"]["user"]["username"], "guest");

    let (ct, body) = send(
        &app,
        Request::get("/rest/ping?u=Doodz&p=correct%20horse&f=jsonp&callback=cb")
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert!(ct.starts_with("application/javascript") && body.starts_with("cb({"));
}

#[tokio::test]
async fn users_only_see_themselves() {
    let (app, _) = setup().await;
    let guest = "u=guest&p=battery%20staple&f=json";
    assert_eq!(
        get(&app, &format!("/rest/getUser?{guest}")).await["user"]["adminRole"],
        false
    );
    assert_eq!(
        get(&app, &format!("/rest/getUser?{guest}&username=Doodz")).await["error"]["code"],
        50
    );
    assert_eq!(
        get(&app, &format!("/rest/getUsers?{guest}")).await["error"]["code"],
        50
    );
    assert_eq!(
        get(
            &app,
            &format!("/rest/createUser?{guest}&username=x&password=12345678")
        )
        .await["error"]["code"],
        50
    );

    let admin = "u=Doodz&p=correct%20horse&f=json";
    assert_eq!(
        get(&app, &format!("/rest/getUsers?{admin}")).await["users"]["user"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
    let r = get(
        &app,
        &format!(
            "/rest/createUser?{admin}&username=new&password=enc:{}",
            hex::encode("long enough")
        ),
    )
    .await;
    assert_eq!(r["status"], "ok");
    assert_eq!(
        get(&app, "/rest/ping?u=new&p=long%20enough&f=json").await["status"],
        "ok"
    );
    let r = get(
        &app,
        &format!("/rest/changePassword?{guest}&username=guest&password=new%20password"),
    )
    .await;
    assert_eq!(r["status"], "ok");
    assert_eq!(
        get(&app, "/rest/ping?u=guest&p=new%20password&f=json").await["status"],
        "ok"
    );
}

#[tokio::test]
async fn token_auth_can_be_turned_off() {
    let mut st = state();
    st.users.legacy_auth = false;
    st.users
        .create("Doodz", "correct horse", true)
        .await
        .unwrap();
    let app = router(st);
    let t = token("correct horse", "s1");
    let r = get(&app, &format!("/rest/ping?u=Doodz&t={t}&s=s1&f=json")).await;
    assert_eq!(r["error"]["code"], 41);
    assert_eq!(
        get(&app, "/rest/ping?u=Doodz&p=correct%20horse&f=json").await["status"],
        "ok"
    );
}

#[tokio::test]
async fn unknown_endpoints_fail_politely() {
    let (app, _) = setup().await;
    let r = get(&app, "/rest/getVideos?u=Doodz&p=correct%20horse&f=json").await;
    assert_eq!(r["status"], "failed");
    assert_eq!(r["error"]["code"], 0);
    let r = get(&app, "/rest/ping?f=json").await;
    assert_eq!(r["error"]["code"], 10, "no credentials");
}

#[test]
fn decodes_form_values() {
    let p = super::Params::parse(
        Some("a=1&b=x+y&c=%C3%A9t%C3%A9&id=1&id=2&bad=%zz&end=%4"),
        b"d=4",
    );
    assert_eq!(p.get("b"), Some("x y"));
    assert_eq!(p.get("c"), Some("été"));
    assert_eq!(p.all("id"), ["1", "2"]);
    assert_eq!(p.get("bad"), Some("%zz"));
    assert_eq!(p.get("end"), Some("%4"));
    assert_eq!(p.get("d"), Some("4"));
}

#[tokio::test]
async fn a_suspended_account_is_told_so_only_with_its_own_password() {
    let (app, st) = setup().await;
    let doodz = st
        .users
        .list()
        .await
        .unwrap()
        .into_iter()
        .find(|u| u.username == "Doodz")
        .unwrap();
    let (_, key) = st.users.create_api_key(&doodz.id, "Pixel").await.unwrap();
    // Another administrator keeps the server managed.
    let guest = st
        .users
        .list()
        .await
        .unwrap()
        .into_iter()
        .find(|u| u.username == "guest")
        .unwrap();
    st.users
        .update(
            &guest.id,
            crate::users::admin::AccountChanges {
                is_admin: Some(true),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    st.users
        .update(
            &doodz.id,
            crate::users::admin::AccountChanges {
                suspended: Some(true),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    let r = get(&app, "/rest/ping?u=Doodz&p=correct%20horse&f=json").await;
    assert_eq!(r["error"]["code"], 50);
    assert!(
        r["error"]["message"]
            .as_str()
            .unwrap()
            .contains("suspended")
    );
    let r = get(&app, &format!("/rest/ping?apiKey={key}&f=json")).await;
    assert_eq!(r["error"]["code"], 50, "device keys too");
    let r = get(&app, "/rest/ping?u=Doodz&p=wrong%20one&f=json").await;
    assert_eq!(
        r["error"]["code"], 40,
        "a wrong password is not told the account is suspended"
    );
}

#[tokio::test]
async fn ids_kept_from_before_short_ids_still_work() {
    let (app, st) = setup().await;
    // A song as clients knew it before version 1.0.3 (ADR-026).
    let old = "5220a049-bd94-47ae-8d35-2ca090cfb168";
    let short = crate::ids::shorten(old).into_owned();
    st.db
        .call(move |c| {
            c.execute(
                "INSERT INTO track(id, title, norm_title, artist_display, duration_ms)
                 VALUES (?1, 'Hoppípolla', 'hoppipolla', 'Sigur Rós', 276000)",
                [&short],
            )?;
            c.execute(
                "INSERT INTO library(id, name, path) VALUES (1, 'Music', '/music');",
                [],
            )?;
            c.execute(
                "INSERT INTO track_file(id, track_id, library_id, path, size, modified_at, format)
                 VALUES ('f1', ?1, 1, 'Sigur Rós/03.mp3', 1, 0, 'mp3')",
                [&short],
            )?;
            Ok(())
        })
        .await
        .unwrap();
    let auth = "u=Doodz&p=correct%20horse&v=1.16.1&c=Musonic&f=json";
    let r = get(&app, &format!("/rest/getSong.view?id={old}&{auth}")).await;
    assert_eq!(r["status"], "ok", "{r}");
    assert_eq!(r["song"]["id"], "73A4WPDHD9a", "answered with the short id");
    let r = get(&app, &format!("/rest/star.view?id={old}&{auth}")).await;
    assert_eq!(r["status"], "ok");
    let r = get(&app, &format!("/rest/getStarred2.view?{auth}")).await;
    assert_eq!(r["starred2"]["song"][0]["id"], "73A4WPDHD9a");
    let r = get(&app, "/rest/getOpenSubsonicExtensions.view?f=json").await;
    let musonic = r["openSubsonicExtensions"]
        .as_array()
        .unwrap()
        .iter()
        .find(|e| e["name"] == "musonicServer")
        .unwrap()
        .clone();
    assert!(musonic["versions"].as_array().unwrap().contains(&3.into()));
    assert!(musonic["versions"].as_array().unwrap().contains(&4.into()));
}

#[tokio::test]
async fn podcasts_followed_by_an_account() {
    let (app, st) = setup().await;
    let doodz = st
        .users
        .list()
        .await
        .unwrap()
        .into_iter()
        .find(|u| u.username == "Doodz")
        .unwrap()
        .id;
    let feed = "https://example.org/rock.xml";
    let show = crate::podcasts::feed::Show {
        title: "Rock Stories".into(),
        image_url: Some("https://example.org/cover.jpg".into()),
        episodes: vec![
            crate::podcasts::feed::Item {
                guid: "1".into(),
                title: "Older".into(),
                published_at: Some(1_000),
                audio_url: "https://cdn.example.org/1.mp3".into(),
                ..Default::default()
            },
            crate::podcasts::feed::Item {
                guid: "2".into(),
                title: "Newer".into(),
                published_at: Some(2_000),
                duration_s: Some(95),
                audio_url: "https://cdn.example.org/2.mp3".into(),
                ..Default::default()
            },
        ],
        ..Default::default()
    };
    let id = crate::ids::podcast_id(feed);
    let pid = id.clone();
    st.db
        .call(move |c| {
            crate::podcasts::store(c, &pid, feed, &show, None, None)?;
            c.execute(
                "INSERT INTO podcast_subscription(user_id, podcast_id) VALUES (?1, ?2)",
                [&doodz, &pid],
            )?;
            Ok(())
        })
        .await
        .unwrap();
    let doodz_auth = "u=Doodz&p=correct%20horse&v=1.16.1&c=Musonic&f=json";
    let guest_auth = "u=guest&p=battery%20staple&v=1.16.1&c=Musonic&f=json";
    let r = get(&app, &format!("/rest/getPodcasts.view?{doodz_auth}")).await;
    let channel = &r["podcasts"]["channel"][0];
    assert_eq!(channel["title"], "Rock Stories");
    assert_eq!(channel["coverArt"], id.as_str());
    assert_eq!(channel["episode"][0]["title"], "Newer", "newest first");
    assert_eq!(channel["episode"][0]["status"], "completed", "playable");
    assert_eq!(channel["episode"][0]["duration"], 95);
    let episode = channel["episode"][0]["id"].as_str().unwrap().to_owned();
    assert!(episode.starts_with("pe-"));
    let r = get(
        &app,
        &format!("/rest/getNewestPodcasts.view?count=1&{doodz_auth}"),
    )
    .await;
    assert_eq!(r["newestPodcasts"]["episode"][0]["id"], episode.as_str());
    let r = get(
        &app,
        &format!("/rest/getPodcastEpisode.view?id={episode}&{doodz_auth}"),
    )
    .await;
    assert_eq!(r["podcastEpisode"]["channelId"], id.as_str());
    // Another account follows nothing.
    let r = get(&app, &format!("/rest/getPodcasts.view?{guest_auth}")).await;
    assert!(r["podcasts"]["channel"].as_array().unwrap().is_empty());
    // A feed on the server's own network is refused.
    let r = get(
        &app,
        &format!("/rest/createPodcastChannel.view?url=http://127.0.0.1:4533/feed&{doodz_auth}"),
    )
    .await;
    assert_eq!(r["status"], "failed");
    // Unfollowed by its only listener: the show goes.
    let r = get(
        &app,
        &format!("/rest/deletePodcastChannel.view?id={id}&{doodz_auth}"),
    )
    .await;
    assert_eq!(r["status"], "ok");
    let left: i64 = st
        .db
        .call(|c| Ok(c.query_row("SELECT count(*) FROM episode", [], |r| r.get(0))?))
        .await
        .unwrap();
    assert_eq!(left, 0);
}
