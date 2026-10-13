# Changelog

Each release lists the commit that holds it. To see an old version on GitHub, open
`https://github.com/ZCGrimshaw/harvestwork/tree/<commit>`; to restore one, check out that commit.

## v0.26 — 2026-10-13
- Menu → Options: "Pause the game when you switch to another tab or app" (S.bgPause, default on). Browsers stop
  requestAnimationFrame in background tabs, so "on" is the old behaviour. Off: on return the game simulates the time
  away (capped at 2 h) in 0.5 s steps, 300 steps per frame, then toasts a summary. No progress while the page is closed.

## v0.25 — 2026-10-13
- World grows to 36×36 (6×6 grid of 6×6 areas); the original 12×12 sits in the middle and counts as one area.
  `expandWorld()` (run from migrate) lifts old saves in and remaps every stored tile index (queue, current task,
  farmer and farmhand positions/paths, farmhand routine). Unsurveyed tiles are `t: 'void'`: not drawn, walked or picked.
- Survey (discovery `surveying`, req Workbench): pick a dashed area next to open land; task runs at the Homestead.
  Cost: 500g ×1.6 per survey + fence kits + planks, bricks from the 2nd, roof tiles from the 4th. Theme per area is
  fixed by position (`themeAt`); `genRegion` lays weighted terrain from `D.regionThemes[...].mix`, smooths once and
  guarantees the area's resource appears. Camera bounds follow open land (+ surveyable ring once unlocked).
- New terrain + generic `gather` task: Wildflower Meadow (flowers), Clay Bank (clay), Reed Marsh (reeds), Iron Seam
  (iron ore + stone), each with a discovery, regrowing stock, farmhand support and a "clear to grass" reshape.
- New stations Dye Vat, Potter's Wheel, Forge; recipes Wildflower Honey (Beehive), Dye, Dyed Cloth, Roof Tiles (Kiln),
  Clay Pot, Basket (Workbench), Iron Ingot, Iron Tools; 5 new contracts; Crafts item group; "New lands" discovery branch.
- Building caps: stations 1 per area, Storage Barn 2 per area, Warehouse 1 per area; checked on kit purchase and on
  placing; existing duplicates are kept. Market Stations tab lists every unlocked kit with "Built n of cap".
- Move buildings (discovery `rollers`): stations, storage, sprinklers; keeps upgrades/batches; queue and farmhand jobs
  follow. Cost (80g + kit price) ×1.5^recent moves + planks or bricks; one step of surcharge wears off every 3 days.
- Water reeds decoration sprite renamed `pondreeds` (the `reeds` key is now the marsh ground tile).

## v0.24 — 2026-10-13
- Title art (title-art.webp, 1000px wide from the supplied artwork) heads the welcome splash and main menu, replacing the
  text logo and crop icons; a visually hidden h1 keeps the name for screen readers. Image is cropped from the top on
  short screens so the logo stays visible.

## v0.23.1 — 2026-10-13
- Update loop fix: GitHub Pages serves files with ~10 min browser caching, so `location.reload()` could bring back the old
  game.js and the banner reappeared. Now build.sh stamps `?v=<build>` on the script tags, and Reload navigates to
  `?v=<newBuild>` so index.html and scripts are fetched fresh. Banner only shows for a strictly newer build; Later is
  remembered per build for the session. Verified against a local server sending `Cache-Control: max-age=600`.
- Update banner z-index raised above the title screen (it was unclickable there).
- Release-notes rule recorded in CLAUDE.md / README: entries default to backend unless players would notice.

## v0.23 — 2026-10-13
- Removed the automatic fade and See-through mode entirely (focusPoints/fadeOf/UI.fade gone).
- Eye button / X now toggles building name labels (UI.labels), drawn as pills above every building after the object pass.

## v0.22 — 2026-10-13
- Buildings ~25% shorter (art.js `dropRows`/`shortRows`): whole pixel rows above an 8px footing are removed, most-redundant
  first, with each run of identical rows capped at 40% removal so chimneys/awnings survive; animated frames share one row set.
  Trees, rocks, crops and sprinklers unchanged. Station smoke starts from the (shorter) chimney top.
- Fade softened from 38% to 45% opacity.

## v0.21 — 2026-10-13
- Visibility: tall sprites (buildings, trees, rocks) ease to 38% opacity when they are nearer the viewer than a focus point
  (farmer, farmhand, selected tile, hovered tile on mouse devices, current job target) and their sprite box overlaps it.
  Per-tile fade eased each frame (UI.fade).
- See-through mode (eye button in the view controls, key X): fades all tall sprites except the selected tile's. Session-only.

## v0.20.2 — 2026-10-13 · backend (hidden from the in-game updates log)
- Show your support switched from PayPal to Ko-fi: https://ko-fi.com/zerocrunchgames. New support-qr.png generated for that URL
  (verified by decoding); button reads "Open Ko-fi".

## v0.20.1 — 2026-10-13 · backend (hidden from the in-game updates log)
- Name restored to Harvestworks everywhere players see it (save files `harvestworks-*.json`; `infinifarm-save` files from v0.20 still load).
- Show your support opens its own screen (title menu and Menu → Show your support) with a large QR code and an Open PayPal link, on phones too.
- `backend: true` on a D.updates entry hides it from the in-game Updates log and from the "new update" badge.

## v0.20 — 2026-10-13
- Renamed to Infinifarm (visible name, save file names `infinifarm-*.json`, format `infinifarm-save`; old `harvestworks-save` files still load).
  localStorage keys unchanged so every farm carries over. Repo and web link unchanged.
- Title flow (#title overlay, game paused): first-visit splash → main menu (Continue / New farm / Load a save file / Show your support).
  New farm confirms before replacing a save, offers a download first, then asks for the farmer's name and tutorial yes/no.
  Skipped after the update banner's Reload and on hot reloads.
- Hands-on tutorial coach (#coach, S.tut): pan, zoom/turn, select the Farm Plot, till, plant, goal card, menu. Steps advance
  when the player does them; skippable; replayable from the Menu.
- Show your support: PayPal link + QR (support-qr.png, desktop only) on the title screen and in the Menu.

## v0.19.1 — 2026-10-13
- Category filter chips on the Open Market Buy tab (UI.cat.buy).

## v0.19 — 2026-10-13
- Open Market Buy tab lists every crop/gathered/good/component in `S.disc` (made or owned at least once), priced at
  value × 1.75 × shared multiplier (above the +50% demand sell price, so no buy-sell loop). Bought goods are Normal quality.

## v0.18.1 — 2026-10-13
- Fix: Load a save file did nothing. The menu rewrote itself every second (the “last saved Xs ago” text), replacing the
  hidden file input while the picker was open, so the chosen file was lost. The input now lives outside the menu,
  the menu no longer re-renders each second, and loading shows toasts for progress and errors.

## v0.18 — 2026-10-12
- Download / load a save file (harvestworks-<name>-day<N>.json). In Claude the viewer's download prompt is used
  (the page declares the `downloads` capability); on the web it's a normal browser download.
- Save codes kept as a fallback; the Menu's farm section moved above Controls; phones no longer show the desktop controls list.

## v0.17 — 2026-10-12
- Export / import a farm as a save code (Menu → Move your farm). Codes are gzip-compressed (~1–3 KB of text),
  validated before import, and importing needs a second tap to confirm.

## v0.16 — 2026-10-12
- Market speed scales with activity (database change): active traders = players who traded in the last hour.
  Recovery to normal: 1–2 traders ~24h, 5 ~10h, 10 ~5h, 50 ~1h, 200 ~20 min (floor ~12 min).
  Each unit's effect scales by 1/sqrt(traders/2), so large markets don't slam to the limits.
- Market status line shows active traders and settle time.

## v0.15 — 2026-10-12
- Shared valley market (web version only): sales and purchases are reported to a Supabase database
  (project "harvestworks") and move prices for every player, within 0.5×–1.6×, recovering over ~3 hours.
  Station kits keep fixed prices. Falls back to local prices when the database can't be reached.
- Market rows show ▲/▼ price movement and a "Shared valley prices" status line.
- Valley market ticker in the top bar (strip under the top bar on phones): recent trades scrolling;
  collapse to a button; Slow/Fast speeds; remembered per save.

## v0.14 — 2026-10-12
- Activity log (button beside +, bottom left on phones): everything you and your farmhand finished, with results.
- Updates log: in-game list of every release with its time; opens by itself after an update until you close it.

## v0.13 — 2026-10-12
- Fertilized crops grow 40% faster (on top of the +1 quality).

## v0.12 — 2026-10-12
- "Add fertilizer" on a growing crop: fertilize after planting, any time before it's ready (+1 quality at harvest).

## v0.11 — 2026-10-12
- Seeds, seedlings, saplings and fertilizer can be sold at the market (half their buy price).
- Storage and the market's Buy tab show how to use seeds, saplings, fertilizer and kits.
- "Apple Seedling" is now "Apple Tree Seedling" (planted on a tilled Farm Plot).

## v0.10.1 — 2026-10-12
- Fix: no more blue/grey flash when tapping the map on phones; long-press no longer pops up the browser menu.

## v0.10 — 2026-10-12
- The contract card lists each item the contract needs with have/need counts.
- "See everything it takes" opens a production tree for the contract: every ingredient back to raw
  materials, batches per station, what's still locked or unbuilt, quality notes, and a raw-materials shopping list.
  Also available from the Order Board.

## v0.9 — 2026-10-12
- "Clear" button on the farmhand chip (and "Clear all jobs" at the Homestead) wipes the farmhand's job list.
  Tap once to arm, again within 3 seconds to confirm.

## v0.8.1 — 2026-10-12
- Fix: upgrade costs wrap onto a new line instead of running under the Upgrade button.

## v0.8 — 2026-10-12
- Every station's Capacity upgrade now goes to +10 batch slots (12 total), and Speed to ×5.0.
  Later levels use bricks, gears and copper, and need the Brick Kiln / Tinkering discoveries.
- "Fill ×N" button loads as many batches as the free slots and your ingredients allow, in one trip.
- Long batch queues show the first four and a "+N more queued" line.

## v0.7 — 2026-10-12
- Farmhand status chip has a play/pause button and a speed button (1× → 2× → 3×).

## v0.6 — 2026-10-12
- Change this land: clear forest, boulder fields or ponds into grassland (you keep logs/stone),
  or turn grass into a woodland, a pond or a rock field. Found in the tile's panel.
- Minimizing the goal/contract card now tucks it into a button in the top bar, next to the clock.

## v0.5 — 2026-10-12
- The goal/contract card can be minimized (×) to a small tab that shows just the contract name;
  tap the tab to bring it back. The choice is saved.

## v0.4 — 2026-10-12
- Phone layout: one-line top bar, goal card as a slim strip, panels slide up from the bottom,
  full-screen Storage/Discovery/Menu, larger touch targets, landscape support.
- Touch controls: twist two fingers to turn the world, slide two fingers up/down to tilt.
- Selecting a tile on a phone slides it into view above the panel.
- Text says "Tap" instead of "Click" on touch screens.

## v0.3 — 2026-10-12 · commit 171422e (source added to the repo in 0122819)
- Upgrade rows show their cost, what the next level gives, and what you're short of.

## v0.2 — 2026-10-12 · commit 7d3e634
- Storage keeps growing: the Homestead upgrades past 220 (+60 per level, rising cost).
- Storage Barn (+40) and Warehouse (+120) buildings; build as many as you like.
- New discovery: Warehouses.

## v0.1 — 2026-10-11 · commit a05c24c (first public build)
Everything built before going public, in one release:
- Isometric farm on a 12×12 map: farming, five production chains, orders, contracts, land expansion.
- Quality tiers, market demand, save in browser, tutorial goals.
- Camera: pan, zoom, smooth turn and tilt with the right mouse button held.
- 36 discoveries across gathering, farming, kitchen, workshops, automation and upgrades, each with a picture.
- Tools, repeat recipes, auto-collect, sprinklers, farmhand.
- Sell by typed amount, categories in the market/storage/discovery screens, clear unused farm plots.
- Menu pauses the game; "new version ready" banner on the hosted site.
