# Musonic Web — self-hosting

`Musonic-Web.zip` holds a ready-made build of the web client: static files only, no server code. Any web server can host it (Nginx, Caddy, Apache, a static host…).

## 1. Serve the files

Unzip the archive into the folder your web server publishes, at the **root of a domain or subdomain** (for example `https://music-web.example.com/`). The build expects to live at `/`.

To host it under a sub-path instead (for example `/musonic/`), build it yourself from the repository:

```bash
npm ci
MUSONIC_WEB_BASE=/musonic/ npm run build --workspace apps/web   # result in apps/web/dist/
```

## 2. Send every address to `index.html`

The client uses real addresses (`/album/…`, `/playlist/…`). Reloading one of them must return `index.html`.

Nginx:

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

Caddy:

```caddy
music-web.example.com {
    root * /srv/musonic-web
    try_files {path} /index.html
    file_server
}
```

## 3. Let the browser reach your music server

The browser calls your Subsonic server directly, so either:

- serve the client from the **same domain** as the server, or
- let the server answer cross-origin requests: send `Access-Control-Allow-Origin` with the client's address (Navidrome does it by default).

Use HTTPS on both: browsers block an HTTP server from an HTTPS page.

## Updating

Download `Musonic-Web.zip` from the latest `web-v…` release and replace the files. The online version (https://musonic.doodz.dev/app/) is always up to date.
