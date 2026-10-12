# Harvestworks

A cozy isometric production-chain farming game that runs in the browser.

**Play:** https://zcgrimshaw.github.io/harvestwork/

Saves are kept in each player's own browser. Nothing is sent anywhere.

## Layout
- `src/` — the source: `index.html` (page and interface), `data.js` (items, recipes, stations,
  discoveries, contracts), `art.js` (placeholder pixel art), `game.js` (gameplay, rendering, saving)
- `build.sh` — builds the playable files in the root from `src/` and stamps a build id
- root `index.html`, `*.js`, `version.json` — the built game GitHub Pages serves (don't edit by hand)
- `CHANGELOG.md` — what changed in each tagged release
- `ROADMAP.md` — ideas not built yet

## Making a release
1. Edit files in `src/`.
2. Run `./build.sh`.
3. Commit, add the release and its commit to `CHANGELOG.md`, and push.
