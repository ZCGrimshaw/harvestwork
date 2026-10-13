# Infinifarm (formerly Harvestworks)

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

## Shared market
Prices are shared through a Supabase project (`harvestworks`). The game only calls two database
functions over the public API: `get_market()` (prices + recent trades) and `record_trade(...)`
(report a sale/purchase; capped at 50 units per report and 40 reports per player per 10 minutes).
Market speed scales with activity: `market_active()` counts players who traded in the last hour;
`market_tau(n)` sets how fast prices recover (about a day for 1–2 traders, minutes for hundreds) and
`market_impact(n)` shrinks each trade's effect as the market grows. Tune those two functions to rebalance.
Tables have row-level security with no policies, so they can't be read or written directly.
The public key in `src/game.js` is the project's publishable key, which is meant to be public.

## Making a release
1. Edit files in `src/`.
2. Run `./build.sh`.
3. Add the release to `CHANGELOG.md` and to `updates` at the end of `src/data.js` (shown in-game), commit, and push.
