# Musonic Console

The administration console of [Musonic Server](../server): accounts, invitations and
password reset links, rights and quotas, then the server's state, imports, library and
settings (see the roadmap in the project documentation). It is served by the server itself,
at its address; a user who is not an administrator is sent to Musonic Web.

The administrator never sees a password: accounts are created by invitation links and
passwords are changed through reset links, both chosen by the person.

```sh
npm run admin                        # development, API forwarded to MUSONIC_SERVER
                                     # (default http://127.0.0.1:4533)
npm run build --workspace apps/admin # dist/, served by the server (MUSONIC_ADMIN_DIR)
```

Icons come from `@musonic/icons` (generated from the mobile app's set), types of the native
API from `@musonic/core` (generated from the server's Rust code).
