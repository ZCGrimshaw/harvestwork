#!/bin/sh
# Build the playable site from src/ into the repository root (what GitHub Pages serves).
# Stamps a fresh build id into game.js and version.json so open games show the "new version" banner.
set -e
cd "$(dirname "$0")"
ID=$(date -u +%Y%m%d-%H%M%S)
# Script addresses carry the build id, so a reload after an update always fetches the new files instead of cached ones.
{ printf '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>\n'; sed -E "s#src=\"(data|art|sound|game)\.js\"#src=\"\1.js?v=$ID\"#" src/index.html; printf '\n</body></html>\n'; } > index.html
cp src/data.js src/art.js src/sound.js src/support-qr.png src/title-art.webp .
sed "s/__BUILD__/$ID/" src/game.js > game.js
printf '{"build":"%s"}\n' "$ID" > version.json
touch .nojekyll
echo "Built $ID"
