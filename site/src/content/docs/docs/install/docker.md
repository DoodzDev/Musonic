---
title: Install the server with Docker
description: From an empty Linux machine to your first account, with Docker Compose.
---

You need a Linux machine (a home server, a Raspberry Pi, a VPS) with Docker, and your music in a folder.

## Install

1. In the folder where your data will live, get `compose.yml`:

   ```sh
   curl -o compose.yml https://raw.githubusercontent.com/DoodzDev/Musonic/main/apps/server/compose.example.yml
   ```

2. Set the path of your music folder, and the user owning it (`user: "1000:1000"`).

   ```yaml
   services:
     musonic-server:
       image: ghcr.io/doodzdev/musonic-server:1
       restart: unless-stopped
       user: "1000:1000"
       ports:
         - "127.0.0.1:4533:4533"
       volumes:
         - ./data:/data              # database, caches, daily backups
         - /path/to/music:/music     # :ro if you do not want imports
   ```

3. Start it: `docker compose up -d`. The server, ffmpeg and its console are downloaded and started.
4. Put a reverse proxy with HTTPS in front (Caddy, nginx, a Cloudflare tunnel…): the server listens on `127.0.0.1:4533`.

Without Docker, download the program for Linux x86 or ARM from the [releases](https://github.com/DoodzDev/Musonic/releases) (`server-v…`): it is a single program, with its console next to it.

## First start

1. Create your administrator account (it asks for a password):

   ```sh
   docker compose exec musonic-server musonic-server user add <name> --admin
   ```

2. Open your server's address in a browser: the console opens. Sign in.
3. Invite your family and friends from **Accounts**: each gets a link and chooses their own name and password.
4. In the apps, enter your server's address and sign in.
