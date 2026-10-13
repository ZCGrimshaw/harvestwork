# Harvestworks: notes for working on this project

## Release notes (in-game Updates log)
- Every release gets an entry at the top of `HW_DATA.updates` in `src/data.js` and a section in `CHANGELOG.md`.
- **Default: mark the entry `backend: true`** (hidden from players; no "new" badge). Only leave it visible when a player
  would notice the change while playing: new features or content, visual changes, quality-of-life and control changes,
  balance changes, and bug fixes they could have run into. Plumbing, hosting, links, refactors and dev tooling stay backend.
- Write visible notes for players: what changed and where to find it, no file or function names.
- Mark backend releases in `CHANGELOG.md` with "· backend (hidden from the in-game updates log)".

## Releasing
1. Edit files in `src/`, then run `./build.sh` (stamps a build id into `game.js`, `version.json` and the script addresses in `index.html`).
2. Commit and push to `main`; GitHub Pages serves the repo root. Open games see the "new version" banner within ~2 minutes.
