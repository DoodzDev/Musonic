#!/usr/bin/env bash
# @file assemble.sh
# @description Puts the built website (site/dist) and the web client (apps/web/dist, built
#   with MUSONIC_WEB_BASE=/app/) together in one folder for GitHub Pages. GitHub Pages has a
#   single 404 page: it opens the web client for /app/… addresses (reloading a deep link) and
#   sends every other unknown address to the site's own « not found » page.
# @author DoodzProg
# @version 0.1.0
# @license CC-BY-NC-4.0
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
out="${1:-$root/_site}"
rm -rf "$out"
mkdir -p "$out/app"
cp -r "$root/site/dist/." "$out/"
mv "$out/404.html" "$out/not-found.html"
cp -r "$root/apps/web/dist/." "$out/app/"
redirect='<script>if(!location.pathname.startsWith("/app/"))location.replace("/not-found.html");</script>'
sed "s#<head>#<head>${redirect}#" "$out/app/index.html" > "$out/404.html"
echo "assembled in $out"
