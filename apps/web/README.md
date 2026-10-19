# Musonic Web

Web client of Musonic, desktop first. It talks to any Subsonic-compatible server (Navidrome…) with token authentication: the password is never sent in clear.

## Use it

- **Online**, nothing to install: https://doodzprog.github.io/Musonic/app/ (always the latest version).
- **Self-hosted**: download `Musonic-Web.zip` from the latest [`web-v` release](https://github.com/DoodzProg/Musonic/releases?q=web-v&expanded=true) and follow [SELF-HOSTING.md](SELF-HOSTING.md).

What it does: see the [changelog](CHANGELOG.md). Releases are tagged `web-vX.Y.Z` and built by `.github/workflows/web-release.yml`.

## Development

```bash
# from the repository root (Node version in .nvmrc)
npm install
npm run web          # http://localhost:5173
```

Type your server address on the login screen, as in the mobile app. In development, API calls, audio and covers go through a small relay of the Vite dev server (`/__relay/…`), so the page works even when the server sends no CORS headers. A production deployment must be served from the same origin as the server, or the server must allow CORS.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Type check and production build in `dist/` |
| `npm run lint` | Oxlint |
| `npm run typecheck` | TypeScript only |
