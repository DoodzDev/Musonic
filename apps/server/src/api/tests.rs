use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode, header},
};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use tower::ServiceExt;

use crate::server::{router, tests::state};

async fn call(
    app: &Router,
    method: &str,
    uri: &str,
    token: Option<&str>,
    body: Option<Value>,
) -> (StatusCode, Value) {
    let mut req = Request::builder().method(method).uri(uri);
    if let Some(t) = token {
        req = req.header(header::AUTHORIZATION, format!("Bearer {t}"));
    }
    let req = match body {
        Some(b) => req
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(b.to_string())),
        None => req.body(Body::empty()),
    }
    .unwrap();
    let res = app.clone().oneshot(req).await.unwrap();
    let status = res.status();
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(Value::Null),
    )
}

#[tokio::test]
async fn first_start_then_sign_in() {
    let app = router(state());
    assert_eq!(
        call(&app, "GET", "/v1/setup", None, None).await.1["needed"],
        true
    );

    let (s, r) = call(
        &app,
        "POST",
        "/v1/setup",
        None,
        Some(json!({"username": "Doodz", "password": "correct horse"})),
    )
    .await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(r["user"]["is_admin"], true);
    let admin = r["token"].as_str().unwrap().to_owned();

    let (s, _) = call(
        &app,
        "POST",
        "/v1/setup",
        None,
        Some(json!({"username": "evil", "password": "correct horse"})),
    )
    .await;
    assert_eq!(s, StatusCode::CONFLICT, "only once");
    assert_eq!(
        call(&app, "GET", "/v1/setup", None, None).await.1["needed"],
        false
    );

    assert_eq!(
        call(&app, "GET", "/v1/me", Some(&admin), None).await.1["username"],
        "Doodz"
    );
    assert_eq!(
        call(&app, "GET", "/v1/me", None, None).await.0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        call(&app, "GET", "/v1/me", Some("forged"), None).await.0,
        StatusCode::UNAUTHORIZED
    );

    let (s, r) = call(
        &app,
        "POST",
        "/v1/auth/login",
        None,
        Some(json!({"username": "doodz", "password": "correct horse"})),
    )
    .await;
    assert_eq!(s, StatusCode::OK);
    let second = r["token"].as_str().unwrap().to_owned();
    let (s, _) = call(
        &app,
        "POST",
        "/v1/auth/login",
        None,
        Some(json!({"username": "doodz", "password": "nope"})),
    )
    .await;
    assert_eq!(s, StatusCode::UNAUTHORIZED);

    call(&app, "POST", "/v1/auth/logout", Some(&second), None).await;
    assert_eq!(
        call(&app, "GET", "/v1/me", Some(&second), None).await.0,
        StatusCode::UNAUTHORIZED
    );
}

#[tokio::test]
async fn device_keys_and_accounts() {
    let app = router(state());
    let r = call(
        &app,
        "POST",
        "/v1/setup",
        None,
        Some(json!({"username": "Doodz", "password": "correct horse"})),
    )
    .await
    .1;
    let admin = r["token"].as_str().unwrap().to_owned();

    // A key for a device, usable on the Subsonic API and here.
    let r = call(
        &app,
        "POST",
        "/v1/me/api-keys",
        Some(&admin),
        Some(json!({"name": "Pixel 10"})),
    )
    .await
    .1;
    let key = r["key"].as_str().unwrap().to_owned();
    let key_id = r["info"]["id"].as_str().unwrap().to_owned();
    let (_, ping) = {
        let res = app
            .clone()
            .oneshot(
                Request::get(format!("/rest/ping?apiKey={key}&f=json"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        (
            res.status(),
            res.into_body().collect().await.unwrap().to_bytes(),
        )
    };
    assert!(String::from_utf8_lossy(&ping).contains("\"status\":\"ok\""));
    assert_eq!(
        call(&app, "GET", "/v1/me", Some(&key), None).await.1["username"],
        "Doodz"
    );
    let list = call(&app, "GET", "/v1/me/api-keys", Some(&admin), None)
        .await
        .1;
    assert_eq!(list[0]["name"], "Pixel 10");
    assert!(
        list[0].get("key").is_none(),
        "the key itself is never listed"
    );
    call(
        &app,
        "DELETE",
        &format!("/v1/me/api-keys/{key_id}"),
        Some(&admin),
        None,
    )
    .await;
    assert_eq!(
        call(&app, "GET", "/v1/me", Some(&key), None).await.0,
        StatusCode::UNAUTHORIZED
    );

    // Accounts: administrators only.
    let (s, guest) = call(
        &app,
        "POST",
        "/v1/users",
        Some(&admin),
        Some(json!({"username": "guest", "password": "battery staple"})),
    )
    .await;
    assert_eq!(s, StatusCode::OK);
    let login = call(
        &app,
        "POST",
        "/v1/auth/login",
        None,
        Some(json!({"username": "guest", "password": "battery staple"})),
    )
    .await
    .1;
    let guest_token = login["token"].as_str().unwrap().to_owned();
    assert_eq!(
        call(&app, "GET", "/v1/users", Some(&guest_token), None)
            .await
            .0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        call(&app, "GET", "/v1/users", Some(&admin), None)
            .await
            .1
            .as_array()
            .unwrap()
            .len(),
        2
    );

    let (s, _) = call(
        &app,
        "PUT",
        "/v1/me/password",
        Some(&guest_token),
        Some(json!({"current": "wrong", "new": "whatever123"})),
    )
    .await;
    assert_eq!(s, StatusCode::FORBIDDEN);
    let (s, _) = call(
        &app,
        "PUT",
        "/v1/me/password",
        Some(&guest_token),
        Some(json!({"current": "battery staple", "new": "whatever123"})),
    )
    .await;
    assert_eq!(s, StatusCode::OK);

    let guest_id = guest["id"].as_str().unwrap();
    assert_eq!(
        call(
            &app,
            "DELETE",
            &format!("/v1/users/{guest_id}"),
            Some(&admin),
            None
        )
        .await
        .0,
        StatusCode::OK
    );
}

/// An administrator signed in, and the app.
async fn admin_app() -> (Router, crate::server::AppState, String) {
    let st = state();
    let app = router(st.clone());
    let (_, r) = call(
        &app,
        "POST",
        "/v1/setup",
        None,
        Some(json!({"username": "Doodz", "password": "correct horse"})),
    )
    .await;
    (app, st, r["token"].as_str().unwrap().to_owned())
}

async fn sign_in(app: &Router, user: &str, password: &str) -> StatusCode {
    call(
        app,
        "POST",
        "/v1/auth/login",
        None,
        Some(json!({"username": user, "password": password})),
    )
    .await
    .0
}

#[tokio::test]
async fn invitations_create_accounts_without_the_admin_seeing_a_password() {
    let (app, st, admin) = admin_app().await;
    let (s, r) = call(
        &app,
        "POST",
        "/v1/invitations",
        Some(&admin),
        Some(json!({"note": "Cousine", "seconds": 3600})),
    )
    .await;
    assert_eq!(s, StatusCode::OK);
    let token = r["token"].as_str().unwrap().to_owned();
    assert_eq!(r["invitation"]["note"], "Cousine");
    assert!(
        !r.to_string().contains("password"),
        "nothing about a password: {r}"
    );

    // The public page, without signing in.
    let (s, page) = call(&app, "GET", &format!("/v1/invite/{token}"), None, None).await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(page["state"], "valid");
    assert_eq!(page["name"], "Doodz");
    let (s, r) = call(
        &app,
        "POST",
        &format!("/v1/invite/{token}"),
        None,
        Some(json!({"username": "Lea", "password": "her own choice"})),
    )
    .await;
    assert_eq!(s, StatusCode::OK, "{r}");
    assert_eq!(r["user"]["is_admin"], false);
    assert!(r["token"].is_string(), "signed in at once");
    assert_eq!(sign_in(&app, "Lea", "her own choice").await, StatusCode::OK);

    // Used once only.
    let (_, page) = call(&app, "GET", &format!("/v1/invite/{token}"), None, None).await;
    assert_eq!(page["state"], "used");
    let (s, _) = call(
        &app,
        "POST",
        &format!("/v1/invite/{token}"),
        None,
        Some(json!({"username": "Other", "password": "another one"})),
    )
    .await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
    let (_, list) = call(&app, "GET", "/v1/invitations", Some(&admin), None).await;
    assert_eq!(list[0]["usedBy"], "Lea");
    assert_eq!(list[0]["accountDeleted"], false);
    // Lea's account deleted: the invitation still says who used it.
    let (_, users) = call(&app, "GET", "/v1/users", Some(&admin), None).await;
    let lea_id = users
        .as_array()
        .unwrap()
        .iter()
        .find(|u| u["username"] == "Lea")
        .unwrap()["id"]
        .as_str()
        .unwrap()
        .to_owned();
    call(
        &app,
        "DELETE",
        &format!("/v1/users/{lea_id}"),
        Some(&admin),
        None,
    )
    .await;
    let (_, list) = call(&app, "GET", "/v1/invitations", Some(&admin), None).await;
    assert_eq!(list[0]["usedBy"], "Lea");
    assert_eq!(list[0]["accountDeleted"], true);
    assert_eq!(
        call(&app, "GET", &format!("/v1/invite/{token}"), None, None)
            .await
            .1["state"],
        "used"
    );

    // Revoked, unknown, out of range, not for users.
    let (_, r) = call(
        &app,
        "POST",
        "/v1/invitations",
        Some(&admin),
        Some(json!({"seconds": 600})),
    )
    .await;
    let id = r["invitation"]["id"].as_str().unwrap().to_owned();
    let t2 = r["token"].as_str().unwrap().to_owned();
    call(
        &app,
        "DELETE",
        &format!("/v1/invitations/{id}"),
        Some(&admin),
        None,
    )
    .await;
    assert_eq!(
        call(&app, "GET", &format!("/v1/invite/{t2}"), None, None)
            .await
            .1["state"],
        "revoked"
    );
    assert_eq!(
        call(&app, "GET", "/v1/invite/nope", None, None).await.1["state"],
        "unknown"
    );
    let (s, _) = call(
        &app,
        "POST",
        "/v1/invitations",
        Some(&admin),
        Some(json!({"seconds": 5})),
    )
    .await;
    assert_eq!(s, StatusCode::BAD_REQUEST, "at least a minute");
    st.users
        .create("Sam", "his own choice", false)
        .await
        .unwrap();
    let (_, lea) = call(
        &app,
        "POST",
        "/v1/auth/login",
        None,
        Some(json!({"username": "Sam", "password": "his own choice"})),
    )
    .await;
    let lea = lea["token"].as_str().unwrap().to_owned();
    let (s, _) = call(
        &app,
        "POST",
        "/v1/invitations",
        Some(&lea),
        Some(json!({"seconds": 600})),
    )
    .await;
    assert_eq!(s, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn reset_links_let_people_choose_a_new_password() {
    let (app, st, admin) = admin_app().await;
    let hugo = st
        .users
        .create("Hugo", "old password", false)
        .await
        .unwrap();
    st.users.create_api_key(&hugo.id, "Pixel 8").await.unwrap();
    let (s, r) = call(
        &app,
        "POST",
        &format!("/v1/users/{}/password-reset", hugo.id),
        Some(&admin),
        Some(json!({"seconds": 86400})),
    )
    .await;
    assert_eq!(s, StatusCode::OK);
    let token = r["token"].as_str().unwrap().to_owned();
    assert_eq!(
        call(&app, "GET", "/v1/password-resets", Some(&admin), None)
            .await
            .1[0]["username"],
        "Hugo"
    );
    let (_, page) = call(&app, "GET", &format!("/v1/reset/{token}"), None, None).await;
    assert_eq!(
        (page["state"].as_str(), page["name"].as_str()),
        (Some("valid"), Some("Hugo"))
    );

    let (s, _) = call(
        &app,
        "POST",
        &format!("/v1/reset/{token}"),
        None,
        Some(json!({"password": "short"})),
    )
    .await;
    assert_eq!(s, StatusCode::BAD_REQUEST, "8 characters at least");
    let (s, _) = call(
        &app,
        "POST",
        &format!("/v1/reset/{token}"),
        None,
        Some(json!({"password": "new password"})),
    )
    .await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(sign_in(&app, "Hugo", "new password").await, StatusCode::OK);
    assert_eq!(
        sign_in(&app, "Hugo", "old password").await,
        StatusCode::UNAUTHORIZED
    );
    assert!(
        st.users.api_keys(&hugo.id).await.unwrap().is_empty(),
        "devices signed out"
    );
    assert_eq!(
        call(&app, "GET", &format!("/v1/reset/{token}"), None, None)
            .await
            .1["state"],
        "used"
    );
    assert!(
        call(&app, "GET", "/v1/password-resets", Some(&admin), None)
            .await
            .1
            .as_array()
            .unwrap()
            .is_empty()
    );
}

#[tokio::test]
async fn roles_suspension_and_rights() {
    let (app, st, admin) = admin_app().await;
    let me = st.users.list().await.unwrap()[0].id.clone();
    let hugo = st
        .users
        .create("Hugo", "his password", false)
        .await
        .unwrap();

    // Never without an active administrator.
    let (s, r) = call(
        &app,
        "PATCH",
        &format!("/v1/users/{me}"),
        Some(&admin),
        Some(json!({"isAdmin": false})),
    )
    .await;
    assert_eq!(s, StatusCode::BAD_REQUEST, "{r}");
    let (s, _) = call(
        &app,
        "PATCH",
        &format!("/v1/users/{me}"),
        Some(&admin),
        Some(json!({"suspended": true})),
    )
    .await;
    assert_eq!(s, StatusCode::BAD_REQUEST);

    // Suspended: no sign-in at all, nothing deleted.
    let (s, r) = call(
        &app,
        "PATCH",
        &format!("/v1/users/{}", hugo.id),
        Some(&admin),
        Some(json!({"suspended": true})),
    )
    .await;
    assert_eq!((s, r["suspended"].as_bool()), (StatusCode::OK, Some(true)));
    assert_eq!(
        sign_in(&app, "Hugo", "his password").await,
        StatusCode::FORBIDDEN,
        "told the account is suspended"
    );
    assert_eq!(
        sign_in(&app, "Hugo", "not his").await,
        StatusCode::UNAUTHORIZED
    );
    call(
        &app,
        "PATCH",
        &format!("/v1/users/{}", hugo.id),
        Some(&admin),
        Some(json!({"suspended": false})),
    )
    .await;
    assert_eq!(sign_in(&app, "Hugo", "his password").await, StatusCode::OK);

    // Rights and quotas: unlimited by default, then set.
    let (_, list) = call(&app, "GET", "/v1/users", Some(&admin), None).await;
    let h = list
        .as_array()
        .unwrap()
        .iter()
        .find(|u| u["username"] == "Hugo")
        .unwrap()
        .clone();
    assert_eq!(h["limits"]["canImport"], true);
    assert!(h["limits"]["importsPerDay"].is_null());
    let limits = json!({"canImport": true, "canOnline": false, "canDownload": false,
        "canPublicPlaylists": false, "importsPerDay": 5, "importsPerMonth": null,
        "importBytesMax": null, "maxBitRate": 128});
    let (s, r) = call(
        &app,
        "PUT",
        &format!("/v1/users/{}/limits", hugo.id),
        Some(&admin),
        Some(limits),
    )
    .await;
    assert_eq!((s, r["importsPerDay"].as_u64()), (StatusCode::OK, Some(5)));
    assert_eq!(
        st.users.limits(&hugo.id).await.unwrap().max_bit_rate,
        Some(128)
    );

    // Promoted: no limits for administrators.
    call(
        &app,
        "PATCH",
        &format!("/v1/users/{}", hugo.id),
        Some(&admin),
        Some(json!({"isAdmin": true})),
    )
    .await;
    assert!(st.users.limits(&hugo.id).await.unwrap().can_online);
    // Now Doodz can step down.
    let (s, _) = call(
        &app,
        "PATCH",
        &format!("/v1/users/{me}"),
        Some(&admin),
        Some(json!({"isAdmin": false})),
    )
    .await;
    assert_eq!(s, StatusCode::OK);
}

#[tokio::test]
async fn the_dashboard_status_is_for_administrators() {
    let (app, st, admin) = admin_app().await;
    let (s, r) = call(&app, "GET", "/v1/admin/status", Some(&admin), None).await;
    assert_eq!(s, StatusCode::OK, "{r}");
    assert_eq!(r["version"], env!("CARGO_PKG_VERSION"));
    assert_eq!(r["library"]["accounts"], 1);
    assert_eq!(r["imports"]["failed"], 0);
    assert!(r["alerts"].as_array().unwrap().is_empty());
    assert_eq!(r["recent"][0]["kind"], "account");
    assert_eq!(r["recent"][0]["who"], "Doodz");
    st.users
        .create("Hugo", "his password", false)
        .await
        .unwrap();
    let (_, hugo) = call(
        &app,
        "POST",
        "/v1/auth/login",
        None,
        Some(json!({"username": "Hugo", "password": "his password"})),
    )
    .await;
    let (s, _) = call(
        &app,
        "GET",
        "/v1/admin/status",
        hugo["token"].as_str(),
        None,
    )
    .await;
    assert_eq!(s, StatusCode::FORBIDDEN);
}
