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
