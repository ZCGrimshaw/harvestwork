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

## Project facts (for a fresh conversation)
- Public name **Harvest Valley**; repo/internal name Harvestworks (`ZCGrimshaw/harvestwork`, GitHub Pages:
  https://zcgrimshaw.github.io/harvestwork/). Also mirrored as a Claude artifact:
  https://claude.ai/artifact/KGVdTPj3H4mSzeMvRZNE4g (publish `index.html` plus `game.js`, `data.js`, `art.js`, `sound.js`
  from the repo root after `./build.sh`, to that URL).
- Also linked from https://zerocrunch.ca/harvest-valley (the site URL used by the menu's Spread the word and website buttons,
  `HW_DATA.site` in `src/data.js`).
- Layout: `src/` is the source, edit it only. The root `index.html`, `*.js` and `version.json` are built by `./build.sh`; never
  hand-edit them.
- Code: vanilla JS. `src/game.js` (game, UI, online features), `src/data.js` (all content: items, recipes, buildings,
  discoveries, contracts, weekly themes, update log), `src/art.js` (procedural pixel art), `src/sound.js` (Web Audio).
- Online features use Supabase project `xtbsmtystiozdogielrd` (Supabase connector): market prices, leaderboard,
  names, cloud backups, races, weekly challenge + medals, player keys, presence count, Valley Monuments
  (mon_projects + mon_gifts; a new monument is a new mon_projects row). All RPCs are SECURITY DEFINER
  with RLS on and no policies (intentional). Test SQL inside `begin; … rollback;`.
- Testing: Playwright with Chromium at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, opening `src/index.html`
  via file://. Hooks on `window.HW` (state, select, focus, update, queueTask, checkTask, info, weekTest, raceTest, season, weatherOn, sellPrice, mon (set, give, totals, notices, show, green), drawer…).
  Mock the server with `ctx.route('**/rest/v1/rpc/*')`; seed saves with `add_init_script`. Write test screenshots to
  a scratch folder, never the repo.
- Plans and ideas live in `ROADMAP.md` (next up: "Late-game loops plan" Stage 2 Supply contracts; Stage 1 Seasons and weather shipped in v0.41, Stage 4 Valley Monuments in v0.42).
  History of every release is in `CHANGELOG.md`.

## Design vocabulary (so edits stay consistent)
- **Discovery tokens (DT)** are the currency that unlocks Discoveries (older text says "Discovery" or "Discovery Points"; rename to
  "discovery tokens" when touching it). They are separate from score: everything the player does earns score, regardless of DT.
- Game arc: early game = a steady stream of cheap discoveries while learning; mid game = planning and unlocking, with choices;
  late game = layered automation toward factories. See the "Time edit" pin in `ROADMAP.md`.

## Scope discipline and models
- Keep changes scoped to the files a request touches: `data.js` content, `game.js` logic/rendering/saving, `art.js` visuals,
  `index.html` UI. Don't re-explore the whole codebase for small, well-specified changes.
- Prefer Sonnet for routine edits (content, balancing, UI fixes). Reserve Opus for architecture (save format, restructuring the
  discovery tree, big planning passes).
- Don't replace this file wholesale from an upload; merge changes in (a replacement once dropped the Supabase and testing notes).
