use super::*;

fn users(legacy: bool) -> Users {
    Users::new(Db::memory().unwrap(), SecretBox::from_key(&[1; 32]), legacy)
}

#[test]
fn md5_matches_subsonic_tokens() {
    // Example from the Subsonic API documentation: password "sesame", salt "c19b2d".
    assert_eq!(md5_hex("sesamec19b2d"), "26719a1196d2a940705a59634eb18eab");
}

#[tokio::test]
async fn creates_accounts_and_checks_passwords() {
    let u = users(true);
    let admin = u.create("Doodz", "correct horse", true).await.unwrap();
    assert!(admin.is_admin);
    assert!(
        u.create("doodz", "another one", false).await.is_err(),
        "names ignore case"
    );
    assert!(
        u.create("short", "1234567", false).await.is_err(),
        "password too short"
    );
    assert!(u.create("  ", "long enough", false).await.is_err());

    assert_eq!(
        u.check_password("DOODZ", "correct horse")
            .await
            .unwrap()
            .unwrap()
            .id,
        admin.id
    );
    assert_eq!(
        u.check_password("Doodz", "wrong")
            .await
            .unwrap()
            .unwrap_err(),
        AuthError::WrongCredentials
    );
    assert_eq!(
        u.check_password("nobody", "x").await.unwrap().unwrap_err(),
        AuthError::WrongCredentials
    );
    assert!(
        u.get(&admin.id)
            .await
            .unwrap()
            .unwrap()
            .last_login_at
            .is_some()
    );

    // The stored hash is argon2, never the password.
    let stored: String =
        u.db.call(|c| Ok(c.query_row("SELECT password_hash FROM user", [], |r| r.get(0))?))
            .await
            .unwrap();
    assert!(stored.starts_with("$argon2id$") && !stored.contains("correct horse"));
}

#[tokio::test]
async fn legacy_token_auth_follows_the_setting() {
    let on = users(true);
    on.create("doodz", "correct horse", false).await.unwrap();
    let token = md5_hex("correct horsec19b2d");
    assert!(
        on.check_token("doodz", &token, "c19b2d")
            .await
            .unwrap()
            .is_ok()
    );
    assert!(
        on.check_token("doodz", &token.to_uppercase(), "c19b2d")
            .await
            .unwrap()
            .is_ok()
    );
    assert_eq!(
        on.check_token("doodz", &token, "other")
            .await
            .unwrap()
            .unwrap_err(),
        AuthError::WrongCredentials
    );

    let off = users(false);
    off.create("doodz", "correct horse", false).await.unwrap();
    assert_eq!(
        off.check_token("doodz", &token, "c19b2d")
            .await
            .unwrap()
            .unwrap_err(),
        AuthError::TokenAuthUnavailable
    );
    let kept: Option<String> = off
        .db
        .call(|c| Ok(c.query_row("SELECT legacy_password_enc FROM user", [], |r| r.get(0))?))
        .await
        .unwrap();
    assert!(kept.is_none(), "nothing reversible stored when disabled");
}

#[tokio::test]
async fn api_keys_are_shown_once_and_revocable() {
    let u = users(false);
    let user = u.create("doodz", "correct horse", false).await.unwrap();
    let (info, key) = u.create_api_key(&user.id, "Pixel 10").await.unwrap();
    assert!(key.starts_with(API_KEY_PREFIX) && key.len() > 40);
    assert_eq!(u.check_api_key(&key).await.unwrap().unwrap().id, user.id);
    assert!(
        u.api_keys(&user.id).await.unwrap()[0]
            .last_used_at
            .is_some()
    );
    assert_eq!(
        u.check_api_key("msk_nope").await.unwrap().unwrap_err(),
        AuthError::InvalidApiKey
    );

    assert!(u.revoke_api_key(&user.id, &info.id).await.unwrap());
    assert!(u.check_api_key(&key).await.unwrap().is_err());
    assert!(u.api_keys(&user.id).await.unwrap().is_empty());
}

#[tokio::test]
async fn sessions_end_with_a_new_password() {
    let u = users(false);
    let user = u.create("doodz", "correct horse", false).await.unwrap();
    let token = u.create_session(&user.id).await.unwrap();
    assert_eq!(u.check_session(&token).await.unwrap().unwrap().id, user.id);
    u.set_password(&user.id, "battery staple").await.unwrap();
    assert!(u.check_session(&token).await.unwrap().is_none());
    assert!(
        u.check_password("doodz", "battery staple")
            .await
            .unwrap()
            .is_ok()
    );

    let t2 = u.create_session(&user.id).await.unwrap();
    u.end_session(&t2).await.unwrap();
    assert!(u.check_session(&t2).await.unwrap().is_none());
}

#[tokio::test]
async fn the_last_admin_cannot_be_deleted() {
    let u = users(false);
    let a = u.create("admin", "correct horse", true).await.unwrap();
    let b = u.create("guest", "correct horse", false).await.unwrap();
    assert!(u.delete(&a.id).await.is_err());
    assert!(u.delete(&b.id).await.unwrap());
    assert_eq!(u.count().await.unwrap(), 1);
}
