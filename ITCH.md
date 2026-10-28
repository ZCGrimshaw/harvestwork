# Putting Harvest Valley on itch.io

`./build.sh` also writes `itch/harvest-valley-itch-v<version>.zip` (git-ignored). It holds `index.html` at the top plus the scripts, images and `version.json`. Upload that file as-is.

## Page settings
- **Kind of project:** HTML. Tick "This file will be played in the browser" on the zip.
- **Viewport:** 1280 × 720 (16:9), enable the fullscreen button, no scrollbars. Mobile friendly: on (the game has a phone layout).
- **Storage:** nothing special. The game keeps saves in the browser's local storage; itch frames allow it. Tell players to use Menu → Save and backup (backup code or save file) before clearing browser data.
- **Updates:** itch has no auto-update; upload a new zip per release. The in-game "new version" banner only works on the GitHub Pages copy.

## What is shared with the GitHub Pages copy
Same Supabase project, so market prices, leaderboard, weekly challenge, monument, names and medals are one world. Browser storage is per address, so a player's id, name and farm saves are separate on itch; their player key (Menu → Save and backup) carries a name and medals across.

## Suggested page text
**Harvest Valley** is a cozy isometric farming game that grows into a factory: till, plant and harvest, cook, build stations, hire a farmhand, and play with the whole valley (shared market, leaderboards, a weekly challenge and a monument everyone builds together). Free, no sign-up.

Tags: farming, cozy, idle, management, automation, pixel-art, singleplayer, multiplayer-lite, casual, browser

## Before each upload
1. `./build.sh`, then run the usual tests against `index.html`.
2. Upload `itch/harvest-valley-itch-v<version>.zip` and keep the version number in the file name.
