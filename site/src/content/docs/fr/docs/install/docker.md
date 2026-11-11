---
title: Installer le serveur avec Docker
description: D'une machine Linux vide à votre premier compte, avec Docker Compose.
---

Il vous faut une machine Linux (un serveur maison, un Raspberry Pi, un VPS) avec Docker, et votre musique dans un dossier.

## Installer

1. Dans le dossier où vivront vos données, récupérez `compose.yml` :

   ```sh
   curl -o compose.yml https://raw.githubusercontent.com/DoodzDev/Musonic/main/apps/server/compose.example.yml
   ```

2. Indiquez le chemin de votre dossier de musique, et l'utilisateur qui en est propriétaire (`user: "1000:1000"`).

   ```yaml
   services:
     musonic-server:
       image: ghcr.io/doodzdev/musonic-server:1
       restart: unless-stopped
       user: "1000:1000"
       ports:
         - "127.0.0.1:4533:4533"
       volumes:
         - ./data:/data              # base de données, caches, sauvegardes quotidiennes
         - /chemin/vers/musique:/music   # :ro si vous ne voulez pas d'imports
   ```

3. Lancez : `docker compose up -d`. Le serveur, ffmpeg et sa console sont téléchargés et démarrés.
4. Placez un reverse proxy en HTTPS devant (Caddy, nginx, un tunnel Cloudflare…) : le serveur écoute sur `127.0.0.1:4533`.

Sans Docker, téléchargez le programme pour Linux x86 ou ARM dans les [versions](https://github.com/DoodzDev/Musonic/releases) (`server-v…`) : c'est un seul programme, avec sa console à côté.

## Premier démarrage

1. Créez votre compte administrateur (il demande un mot de passe) :

   ```sh
   docker compose exec musonic-server musonic-server user add <nom> --admin
   ```

2. Ouvrez l'adresse de votre serveur dans un navigateur : la console s'ouvre. Connectez-vous.
3. Invitez famille et amis depuis **Comptes** : chacun reçoit un lien et choisit lui-même son nom et son mot de passe.
4. Dans les applis, entrez l'adresse de votre serveur et connectez-vous.
