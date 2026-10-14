# Changelog

Each release lists the commit that holds it. To see an old version on GitHub, open
`https://github.com/ZCGrimshaw/harvestwork/tree/<commit>`; to restore one, check out that commit.

## v0.36.4 — 2026-10-14
- placePanel(): offset from the tile grows by 20% of the panel's width (mirrored when it opens on the left).

## v0.36.3 — 2026-10-14
- placePanel(): on non-phone layouts #panel floats beside the selected tile (right, or left when there's no room),
  clamped below the top bar, updated each frame. Panel buttons: no filled .pri; every enabled action gets a gold border.

## v0.36.2 — 2026-10-14
- Live "open now" chip (#online) left of Storage: per-page-load random id pings presence_ping every 30 s (hidden tabs
  too); the server counts ids seen in the last 150 s; presence_leave on pagehide. Table presence, stale rows pruned.

## v0.36.1 — 2026-10-14
- nameHTML(): the locked player name UI, now shown in every mode (Settings → Your player name) and on the weekly screen;
  the weekly board refreshes after locking a name. Server: locked "Grimshaw" for the owner's player id and renamed
  that player's week-2962 run.

## v0.36 — 2026-10-14
- Weekly challenge: D.weeklyThemes (10 themes) picked in shuffled rounds from the week number (each theme once per
  round, never twice in a row); weeklyPreset seeds stations, plots, land, terrain and goods. Rules hook into gainScore
  tags, crop growth, station speed, sell price, fish regen and order refill (wrule). Runs live in WEEK_KEY; 15 minutes,
  no pause; catch-up capped at the run end.
- Server: weekly_runs, weekly_closed, medals, player_keys, player_farms; weekly_start (one ranked run per UTC day,
  5-second countdown), weekly_score (pace and time checks), weekly_board, my_medals, hw_close_weeks (top 3 on close),
  player_key_set, link_farm, player_key_use.
- Medals: ceremony screen, Menu → Medals, 'medal' decor building placed from empty grass, medal panel, art (OBJ.medal).
- Player key in Menu; Restore accepts a backup code or a player key; restore picks a slot.

## v0.35.1 — 2026-10-13
- Public name is now Harvest Valley: page title, title art (title-art.webp), title/menu headings, welcome toast, support
  and save-file wording, update banner, README heading. Internal names (repo, storage keys, save formats, Supabase) unchanged.

## v0.35 — 2026-10-13
- Farm modes: S.mode 'online' | 'private' (old saves migrate to 'online'); online() gates mult(), reportTrade, sendScore,
  the ticker, leaderboard buttons and the leaderboard settings.
- Main menu: Online Valley / Private farm / Race buttons; the slots screen filters by mode and shows a mode badge per farm;
  the name screen has a mode picker. Settings → This farm: one-way "Make this farm private" (two taps).

## v0.34.1 — 2026-10-13
- costList(): per-ingredient checklist (have / need N more) shown above Buy this tile and Survey buttons.

## v0.34 — 2026-10-13
- Market → Stations: "Can build" / "At your limit" chips; capped kits (built + waiting kits ≥ area allowance) move to
  the second list with a note on how to raise the limit; kit prices use buyPrice (race bargains show correctly).
- Farmhands drawer (Menu, Jobs button on the farmhand bar, Homestead → Manage farmhands, links from full-routine
  hints): per farmhand card with Working/Paused, speed chips, jobs list with ↑/↓ reorder, × remove, go-to, two-tap
  Clear all; built to list several farmhands later. Homestead now shows a summary instead of the full list.

## v0.33.1 — 2026-10-13
- Race head starts are random per race and identical within it (seeded from the race code): gold 150–400, 5×5 or 7×7
  land, 1–3 stations from a pool (with the discoveries and starter goods they need, sometimes speed-tuned), 2–5 tilled
  plots (sometimes a carrot crop already growing), carrot/potato seeds, odds and ends, 0–3 Discovery. Guaranteed:
  Stove, ≥2 plots, ≥6 carrot seeds, ≥150g (checked across 400 random codes).
- Greed traps (each ~80%): a 60%-off "race-day bargain" kit (Smelter/Loom/Cider Press/Oven) whose chain can't run
  from the head start, and a "Collector's grand request" paying ~2.2× value in gold but only 10–25 points.
  The countdown screen lists the head start.

## v0.33 — 2026-10-13
- Save slots: SLOT_KEYS (slot 1 keeps 'harvestworks.save.v1'), active slot in 'harvestworks.slot'; Your farms screen
  (title + Menu) to play a slot or start/replace a farm in one (two-tap replace). Menu's "Start a new farm" now opens it.
- Race mode (database): races + race_players; create_race (5-letter code, ≤10/hour per host), join_race (lobby only,
  ≤8), start_race (host; starts 6 s later), leave_race, race_state, race_score (records finish time on reaching the
  target; ignores impossible pace > 400 pts/s); hw_display_name prefers a locked leaderboard name.
- Race mode (game): host/join screens, ?race=CODE invite links, lobby polling, countdown, identical head-start farm
  (300g, Homestead L1, 5×5 owned, Sawmill + Flour Mill, tilled plots, seeds/logs/planks, early discoveries) saved in
  its own RACE_KEY slot; live race bar; results screen; Leave race / Back to your race. During a race: no pausing
  (menu/idle/tab), local prices only, no trades reported, no leaderboard, backups, weekly report or loan.

## v0.32.1 — 2026-10-13
- Idle pause options now in seconds: Never/5/10/15/30 s/2 min (S.idleSec; default 120 s). Older S.idlePause minutes
  map to 2 min (or Never if it was 0).

## v0.32 — 2026-10-13
- Idle pause: S.idlePause minutes (default 10; Never/2/5/10/30 in Settings → Pausing). Any pointerdown/keydown/wheel/
  touch resets the timer; when it runs out the game pauses (paused() includes UI.idle), saves, and shows a centred
  "Paused while you were away" bar until the next input. Not counted during title screens or away-time catch-up.
- Cloud backup: code shown as selectable text with a Copy code button (clipboard API, execCommand fallback,
  "Copied ✓" for 2.5 s).

## v0.31.1 — 2026-10-13
- Market Buy tab: red notice when storage is full, amber when 5 or fewer spaces remain.

## v0.31 — 2026-10-13
- Cloud backup (database): cloud_saves (code_hash = sha256 of the 12-char backup code, data = HWZ1 save code, name,
  day); backup_save (validates code/size/prefix, one write per 15 s per code) and restore_save(code).
- Game: S.cloud {code, at, day, auto}; code generated client-side from a 31-letter alphabet (~59 bits). Auto backup on
  first connection and each new day if 10+ min since the last; Menu → Cloud backup (code chip copies, Back up now,
  auto toggle); title + Menu → Restore from a backup code (preview, then load; keeps backing up to the same code).
- Share save file (Web Share API with a File) shown where the browser supports sharing files (phones).

## v0.30.1 — 2026-10-13
- Locked leaderboard names (database): player_names (player pk, name, unique lower-case key); claim_name(player, name)
  claims or switches this player's name, or returns the lowest free numbered suggestion (Zac → Zac1, Zac2…);
  my_name(player); hw_clean_name() shared sanitiser. get_leaderboard shows a locked name (flag `locked`) over the farm
  name, and shows "A farmer" for an unlocked farm name that copies someone else's locked name.
- Game: Settings → Leaderboard name (input + Lock in, taken → "How about Zac1?" + Use button, Change it); name cached
  per device in localStorage 'harvestworks.lbname'; ✓ next to locked names on the board.

## v0.30 — 2026-10-13
- Leaderboard (database): table farm_scores (farm uuid pk, player, name, show, score, days, updated_at; RLS, no
  policies) + SECURITY DEFINER submit_score (name sanitised to 14 chars of letters/digits/space/'._-; rejects
  score > 50,000 × days; owner-only upsert, at most every 20 s) and get_leaderboard (top 20 by score, top 20 by
  pace = score/days for farms ≥ 7 days, your ranks, counts; farms idle > 120 days drop off; hidden names → "A farmer").
- Game: per-farm id S.fid; score sent on first market connection and each new day; Leaderboard drawer (Menu, weekly
  report) with Top score / Best pace tabs, your stats and ranks; Settings → "Show my farmer's name" (S.lbShow).
  Web version only, like the shared market.

## v0.29 — 2026-10-13
- Weekly report: S.wk tallies the week (gold/score/DP/tiles/contracts snapshot + crafted goods, harvest count, sales,
  purchases, orders). On days 8, 15, 22… newDay queues a report (if S.weekly !== false) shown as a title-overlay card
  once nothing else is on screen and no catch-up is running; "Turn off weekly reports" link on the card.
- Settings moved to its own drawer (Menu → Settings): Pausing, Notifications (weekly report), Sound. The settings
  drawer pauses the game like the Menu does.

## v0.28 — 2026-10-13
- Rock-bottom rescue: `stuck()` = gold below the cheapest unlocked seed, no sellable goods, nothing growing/ready,
  no station batches, no ingredient-free recipe (Beehive), no workable resource tile, idle farmer and farmhand.
  After 8 s stuck: first time a 100g loan (S.loan, "Loan" chip in the top bar repays; auto-repaid at 200g);
  stuck again with the loan unpaid sets S.over and shows the game-over screen (Start a new farm / Look at my farm).

## v0.27.3 — 2026-10-13
- Desktop ticker row spans the full width (flex-basis 100%); collapsed button unchanged.

## v0.27.2 — 2026-10-13
- Category tabs (Discovery, Storage, Market buy/sell) remember the last choice in localStorage 'harvestworks.tabs'.
  chips() no longer resets the stored choice when that tab is temporarily empty (e.g. Ready to unlock); it shows All
  meanwhile (UI.catShow) and returns to the chosen tab when it has entries again.

## v0.27.1 — 2026-10-13
- Desktop layout: #top wraps; the ticker takes a second row under the stats (max 700px), Menu/Storage stay top-right;
  goal card, coach and move bar shift down to 104px. Phone layouts unchanged.

## v0.27 — 2026-10-13
- Sound (new src/sound.js, all Web Audio synthesis, no files): bells/plucks on C-major pentatonic with a generated
  convolution reverb. Effects per task (played from runLogged; farmhand at 55%), crop ready, station done, goals,
  contracts, discoveries, new day, warnings (soft two-note), and a very quiet UI tap. Ambience: looping filtered-noise
  breeze with slow swell, birds before 18:30, crickets after. Music: 9 s triangle-pad chords + random pentatonic
  music-box notes. Audio starts on the first tap/key (browser rule), suspends with the tab, and stays quiet during
  away-time catch-up. Prefs (mute, sfx, amb, mus) live in localStorage 'harvestworks.audio' per device; M toggles mute.

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
