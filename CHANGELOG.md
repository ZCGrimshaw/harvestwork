# Changelog

Each release lists the commit that holds it. To see an old version on GitHub, open
`https://github.com/ZCGrimshaw/harvestwork/tree/<commit>`; to restore one, check out that commit.

## v0.77 — 2026-10-25
- Medals were only fetched once per page load (first sync), so a medal awarded while the game was open (weeks close lazily on the first `my_medals` / `weekly_board` call after Monday 00:00 UTC) stayed invisible until a reload. Now `pullMarket` refetches when the server week changes, and opening the Medals drawer refetches if the list is over a minute old (`NET.medalAt`). Test: t_medals.py.

## v0.76 — 2026-10-25
- Phones: the minimized Goal / Contract button is rendered by `goalBtn()` into a new `#goalchip` at the top of `#hud` (under the gold counter, below the ticker) and hidden
  in `#stats`; elsewhere it stays in the top bar. New per-device setting (localStorage `harvestworks.counts`, `countsOn()` / `applyCounts()`, body class `counts-on`):
  Settings → Top of the screen → show the players-online / unique-visitor pills on phones (off by default). Test: t_goalchip.py.

## v0.75 — 2026-10-25
- `clickTile`: the first tap on one of your own ripe farm plots now queues Harvest (it still selects the plot, so the panel shows Cancel). Skipped while moving a house or
  placing a model/medal, and silent if that harvest is already queued or under way; a full storage shows the usual warning. The second-tap primary action also no longer
  toasts "already in the task queue" for a harvest that is queued. Test: t_tapharv.py.

## v0.74 — 2026-10-25
- Phone layout (≤760 px wide, and landscape phones): the bottom-left Activity / Updates / Puzzle buttons collapse into one `Info ▾` button (`data-drawer="vinfo"`,
  `vinfoDrawer()`), whose panel links to Weather and season (opens the season drawer), Updates, Activity and the Daily Puzzle (`data-vinfo` closes the panel and opens
  that `logpanel` list) and shows the visitor / online counts. The `.pills` counts are hidden in the top bar on phones, and fair/mist/fog weather tags (`.wxtag.calm`)
  too. A dot on Info means an unread update or a fresh puzzle. Desktop is unchanged. Fixes the overlapping bottom buttons on 360 px phones.

## v0.73 — 2026-10-24
- Player feedback. Table `feedback` (RLS on, no policies) and RPC `send_feedback(p_player, p_kind, p_msg, p_name, p_ctx)`: idea/bug/other, 3–1000 chars,
  5 per device per hour, 500 a day overall; ctx = version, build, day, score, discoveries, mode, device, screen. Migration `player_feedback`.
- Edge function `feedback-mail` (verify_jwt off; it only sends rows with `emailed_at` null, at most 10 per call, then stamps them): emails each note via Resend
  from onboarding@resend.dev to zerocrunchgames@gmail.com (override with the FEEDBACK_TO secret). Needs the RESEND_API_KEY secret; until it is set, notes are
  only saved, and the backlog goes out on the first call after it is added.
- Client: drawer `feedback` (Menu → Game → Send feedback, and a speech-bubble `.fbbtn` in the top bar; floats above the bottom-right controls on phones). Offline notes
  queue in localStorage `harvestworks.fbq` and flush after the next successful sync. Pauses the game like the menu. Test: t_fb.py.

## v0.72 — 2026-10-24
- Fifth wave of content, six Discoveries (45 DT; tree is now 70 Discoveries, 231 DT): `orchard` (6, req apples), `marketgarden` (5, req compostbin),
  `gourmet` (7, req oven + creamery), `brewery` (9, req winemaking + wheat), `cheesecave` (8, req creamery + cellar), `jeweler` (10, req ironworking + glassworks).
- 8 crops (pears, cherries, plums, corn, onions, peppers, cabbage, hops; onions, cabbage and pears hardy) with seeds, crop sprites, seasons, Mastery entries,
  Daily Puzzle riddles and uses. 26 new goods and 24 recipes, priced inside the existing value bands (1.3–2.5× inputs; nothing beats stained glass per second).
- New station Brewhouse (`brewhouse`, kit 180g, place 6 planks + 4 stone) with sprite. New icon shapes: pear, cob, onion, pepper, cabbage, hop, gem, ring, necklace, mug, pizza, jbox.
- Rough gems: `gatherGive(T)` adds one on every third Iron Seam dig once Jeweler is unlocked (counter `S.gemN`); the gather button says when the next one comes.
  Jewel Box is decor (carpenter). Snow-day hint now lists hardy crops from the data. Test: t_wave5.py (Joel's save: unlock by clicking, grow all eight, craft at every station, gems).

## v0.71 — 2026-10-23
- `seedNudge(i)` (called from `clickTile`): a raw or tilled Farm Plot tapped with no seeds in storage toasts "No seeds yet" (at most every 10 s). The plot panel's no-seeds hint gets a `data-goto` link to the market. New test hook `HW.click(i)`. Test: t_seed.py.

## v0.70 — 2026-10-23
- Unique visitors: table `visitors (player uuid pk, first_seen)` (RLS on, no policies), backfilled from every table holding a player id (39 at the time).
  `market_sync(p_inst, p_player)` records the device's random player id and returns `visitors` (the old one-arg version was dropped; defaults keep old clients working).
  Client sends `p_player: PLAYER`, stores `NET.visitors`, `renderVisitors()` fills `#visitors` (person icon with gold dot) beside `#online`, wrapped in `.pills`
  (stacked on phones). Migration `unique_visitors`.
- First-run flow: `firstTime()` (no saves in any slot, no locked name) forces the Online Valley, hides the mode picker and the main-menu Private button, and requires a name
  (`lockFirstName`, taken names take the suggestion). `offlineNow()` (sync tried and failed) makes the name optional. Make-private stays in Settings.
- Fix: the placeholder farm shown before anyone starts one was being backed up and sent to the leaderboard ~3 s after the first successful sync, which also created a "Farmer's farm"
  in slot 1. `sendScore` and `autoBackup` now need `UI.hadSave`; `startNewFarm` sends the first score and backup itself. Test: t_first.py.

## v0.69 — 2026-10-23
- `btn()` matches the queued task on a, i, p and n, so only the pressed button (×1 vs ×5) becomes Cancel. Queued tasks carry `at` (ms); a `.cancelbtn` press within 400 ms of it is ignored (double-tap guard). Tests: t_buy2.py.

## v0.68 — 2026-10-23
- The v0.67 cancel × (`.btnx`/`.cancelx`) is replaced: `btn()` now returns a `.btn.cancelbtn` (× Cancel + state line: waiting / on the way / working) in the action button's place
  while that task is queued or current; same `data-cancel` handler.

## v0.67 — 2026-10-23
- Auto-sell keep chips (`data-keep`) show in Storage whether or not `S.autoSell` is on; the toggle now only gates `autoSellTick`. Hint texts in Storage and Settings updated.
- `btn()` wraps a task button with a medium red × (`.cancelx`, `data-cancel`) when that same task (a, i, p) is queued or current. The `cancel` handler now also
  cancels the current task (`S.cur = null`, path cleared; costs are only charged on completion, so nothing is lost).

## v0.66 — 2026-10-22
- Move the house: task `housemove` (needs Rollers & Skids; `t.p` main tile, `t.i` new top-corner tile; `houseSpot` lists the footprint and what
  blocks it, own tiles count as free so shifting by one works). Cost `houseMoveCost`: (C.move.gold + D.house.move.gold × size step) × heat,
  plus D.house.move.plank × step planks; shares `moveHeat`. Uses the existing move bar; the lit-tile preview is drawn in `draw()`.
- Manual (Menu → Game → Manual, drawer `manual`): `manualEntries()` builds rows from the game data (items via `infoHTML`, buildings, station/tool/
  house/Homestead upgrades, discoveries, land, 11 hand-written "How it works" pages); `manualMatches()` ANDs the search words over each row's
  keywords; the search box updates only `#manres` so it keeps focus; only the open row builds its body. Test: t_manual.py.

## v0.65 — 2026-10-22
- Homestead decor, stages 1–2 (see ROADMAP pin). Discoveries `homemaking` (3 DT, needs kiln + fishing) and `additions` (3 DT, needs
  homemaking + surveying) in a new Home & decor branch. `D.house` holds the build cost and four levels (Cottage 1×1/3 spots, House 1×2/6,
  Farmhouse 2×2/10, Manor 2×3/15). One house per farm: task `housebuild` on empty grass; task `housegrow` (key `x,y,W,H`) picks any
  next-size footprint that contains the old one and is all empty grass (`growOpts`, `blockWhy` names the blocker, `dirWord` gives the
  on-screen direction for the current view angle). Save format: the main tile holds `{type:'house', lv, w, h, d}` (`d` = `[item, quality]`
  or null per display spot); every other covered tile holds `{type:'house', pt: mainIdx}`. `builtCount` skips `pt` tiles.
- House tiles are not walkable; `standGoals` sends the farmer beside the house and `stepOffHouse` moves anyone standing where it lands.
- Drawing: the house is one sprite (`art.js` `house(A, B, L)`, a true isometric box, mirrored with swapped shades when B > A) drawn from
  its front-most tile; tiles beside its visible walls that were drawn earlier, and actors on them, are redrawn on top (`draw()` object
  pass refactored into `drawObj(i, again)`). Selection outlines the whole footprint; a picked growth direction lights its new tiles.
- Decor: 9 items, cat `decor` (market buys them; not in orders, puzzles or mastery); Carpenter's Bench station + kit; recipes at the
  bench, Loom, Potter's Wheel and Glass Furnace. Recipe `requires` may be a list (`unlocked` takes arrays; `lockOf` names the first
  missing discovery). Decor pays the first-made Discovery award but not the deep-chain one. Display/store are instant panel actions
  (`data-deco-put`, `data-deco-take`). Test hook `HW.house` (at, idx, opts, tiles). Tests: t_house.py, t_housephone.py.

## v0.64 — 2026-10-22
- Race codes are farm words (4–5 letters, ~215 in a list inside `create_race`; migration `race_codes_farm_words`). `create_race` picks a random
  unused word (40 tries), then falls back to a random 5-character code; races and players older than 2 days are deleted on create so words
  are reused. `joinRace` accepts 3–5 letters/digits (old codes still work), new wording and placeholder.

## v0.63 — 2026-10-22
- Discovery supply trimmed (tree costs 177 + Salvage 3; contracts alone pay 117): mastery `legend`/`mythic` now `dp: 0` with `gold` 20,000 and
  100,000 paid in `mastAdd`; Grand orders no longer pay Discovery (`C.grand.dp`/`dpPerDay`, `grandDpLeft`, `S.grandDay` removed). Existing tokens
  are untouched. Tests: t_legendgold.py, t_grand.py updated.
- Salvage (Discovery `salvage`, cost 3, needs rollers; Upgrades branch). Task `salvage` on a station, storage building or sprinkler when
  `builtCount(type) >= 2`, the station has no batches and storage still holds the refund after removal (`room() - items >= 0`).
  `salvageRefund(b)`: half (floored) of the place cost + the kit's market price (`buy`) or its recipe inputs + every station upgrade level
  bought + every store expansion. Panel section `salvageSection` under the move section. Test: t_salvage.py.

## v0.62.1 — 2026-10-22
- Daily Puzzle no longer pays Discovery. `DQ.reward`: `doneBonus` 0.5 (gold bonus on finishing = 50% of the steps' pay, minus `doneCut`
  0.15 for each of: naming an answer, 3+ wrong guesses; floor 20%), `streakBonus` 1 (every 7th day adds 100% of the steps' pay). Removed
  `dp`/`streakDp`; texts updated. `P.bonus` holds the bonus. t_dq.py updated.

## v0.62 — 2026-10-21
- Grand orders by the real clock: `S.advAt` (ms timestamp; migrated from `advRefill`), `C.grand.refill` 3600 s. A new one arrives when
  a slot is free and `Date.now() >= advAt`, then advAt = now + 1 h. `grandNext(wasFull)` restarts the hour only when the board was full
  (a timer already running is never pushed back) and returns a text like "1 hour"; delivery and Pass toast "Next Grand order in …".
  Panel shows "Next Grand order in …". Test: t_grand3.py.
- Farmhand seeds: `S.helper.seeds` (default off), toggle `data-fh-seeds`. `resolveStep` calls `fhBuySeeds(st)` for a tilled plot with no seed
  in storage: buys up to min(10, his Tend jobs on that crop) at `buyPrice` (fewer if gold/room is short, none if he cannot afford one),
  logs it, records the trade. Tend jobs already loop till, plant, water, harvest.
- ROADMAP unchanged for Grand tuning: Joel's "6 minutes" still unexplained.

## v0.61.2 — 2026-10-21
- `#logbar` (Activity, Updates, Puzzle) moved to `bottom: 12px` beside the zoom column on desktop (was 196px); `#logpanel` opens from
  `bottom: 60px`, max-height `calc(100% - 150px)`. Phone layouts already had it at the bottom. ROADMAP: pinned "Grand orders tuning".

## v0.61.1 — 2026-10-21
- Daily Puzzle clues end with "In the real world, it/they …" from `D.daily.uses[id]` (a plain description for each of the 69 sellable goods,
  e.g. crate: "could carry or store things"). Added in `dqMake` when a step is pushed, so uniqueness tests are unchanged; the first step
  keeps its riddle. Plural phrases (are/sprout/brighten) use "they". Today's already-generated puzzle keeps its old text.

## v0.61 — 2026-10-21
- Weekly notice narrowed: `noteWeekly` only toasts when the stored rank was 1 and the new rank is worse (names the new #1 when it is in
  the top list); winning #1 back and losing it again notifies again. Settings text updated. t_wkpass.py rewritten.
- Order Board slots: `orderSlots()` = min(`C.orderSlotMax` 6, `C.orderSlots` 3 + floor(unlocked discoveries / `C.orderSlotEvery` 14)).
- Grand orders: Discovery `grandorders` (Upgrades; cost 6; req granary + mastery). `S.adv` (max `C.grand.slots` 2, refill
  `C.grand.refill` 900 s, `S.advRefill`), `genGrand()`: 5 distinct sellable goods from the upper 60% by value, total units
  = cap() × `C.grand.fill` 0.22 × (0.7-1.2), per-good quantity weighted by (avg value / value)^0.4, min 6 and max 35% of cap(), up to 2 goods
  at Good+ when `canGood`, gold = Σ value × qty × (1 + 0.6 × minQ) × 1.5, score 0.6 × gold. Delivery through the `deliver` task
  (`findOrder`), +1 Discovery for the first `C.grand.dpPerDay` 3 per UTC day (`S.grandDay`). Not in races. Pass works. Board panel section.
  Joel's farm (cap 6,220): orders of about 1,200 items, 70-100k gold. Tests: t_grand.py (uses joel/save.json), t_wkpass.py.

## v0.60 — 2026-10-21
- Weekly "someone passed you" notice (no server change; uses `weekly_board` `mine.rank`). `noteWeekly(b, silent)` keeps
  `harvestworks.wkrank` {week, rank, armed} per device: a worse rank while armed toasts once and disarms; a better rank re-arms; weekly
  screens update it silently. `checkWeeklyPass()` runs from `pullMarket` at most every 150 s, only when S.wkAlert !== false, online,
  not in a race, and a rank is already recorded for the player. Settings → Notifications toggle `data-wkalert`. Test: t_wkpass.py.
- ROADMAP: pinned "One sync request" (combine market_sync, get_trades, mon_state and the load-time calls into one RPC).

## v0.59 — 2026-10-20
- Sprinkler pick-up: task `pickup` (check: a sprinkler is there, room() >= 1; run: clears the building, S.built-1, kit back via
  `addItem`, `S.recycled[kit]++`). The `place` task skips build score/first-time award while `S.recycled[kit] > 0` (then decrements)
  so pick-up/place loops can't farm score. Button in `sprinklerPanel`. Test: t_pickup.py.

## v0.58.3 — 2026-10-20
- Daily Puzzle `dqGive`: the handed-in goods are no longer taken when the next step's answer has a recipe that uses them
  (`D.recipes` out has next id, in has this id); the toast says they stay. Other steps and the last step still take them. The picker
  note explains it. Test: t_dqkeep.py.

## v0.58.2 — 2026-10-20
- Station recipe formulas show the count of each output good in white brackets (`.formula .out small`, `count(k)` over all qualities),
  next to the existing ingredient counts. Test: t_outcount.py.

## v0.58.1 — 2026-10-20
- Daily Puzzle hint prices: `DQ.reward.hint` [1, 2] (× step reward), `hintGold` [0.08, 0.15] (share of gold held), new `hintCap` 0.25
  (never more than a quarter of gold), 10g minimum, rounded up to 2 significant figures. Was [0.3, 0.6] and [0.01, 0.03].
  Example: 2,600 gold → 210g first hint (was 32g); 20,000 gold → 1,600g. t_dq.py updated.

## v0.58 — 2026-10-20
- Menu → Game: Spread the word opens drawer 'spread' (`spreadHTML`: invite text, selectable `D.site.share` address, Copy button
  `data-spread-copy` with a 2.5 s "Copied!" state). The website button is now "Zero Crunch website" (`D.site.home`). `HW_DATA.site` is
  `{ home, share }`; the Web Share path from v0.57 is gone.

## v0.57.1 — 2026-10-20 · backend (hidden from the in-game updates log)
- `HW_DATA.site.url` is now https://zerocrunch.ca/harvest-valley (Spread the word and website button).

## v0.57 — 2026-10-20
- Menu → Game: "Spread the word" (`data-spread`: Web Share with title, text and URL, else copies the text and link via `copyText`) and a
  "Harvest Valley website" link button (`HW_DATA.site.url`). ROADMAP: pinned Homestead decor line, Inside a factory, Time on work.

## v0.56 — 2026-10-20
- Special stores: Silo, Cold Cellar, Material Yard (kind 'storage' with `hold: {cls, base, step, max}`; kits silo_kit, coldcellar_kit,
  yard_kit; Discoveries silo, coldcellar, yard in Upgrades). `storeKinds` maps goods to a store (crops; cat 'good' + egg, milk; cats
  'gathered', 'component' + wool). `used()` counts each kind against its stores first, only overflow against cap(); `holdCaps()` (tile
  scan cached 100 ms, reset on place/expand), `holdUsed()`. Expansion task `storeup` (b.lvl, cost `storeUp`: gold 500×1.7^l, bricks
  8+6l, crates 2+2l). Store panel shows capacity, overflow, next expansion; Storage drawer lists each kind. Sprites silo, coldcellar, yard.
- Auto-sell (opt-in, S.autoSell): keep amounts S.keep[id] cycled by a chip on each sellable good in Storage (off → Sell all → 10 → 50 →
  100 → 250 → 500 → 1,000 → off). `autoSellTick` every 20 s (not paused, not in races) sells the excess lowest quality first at
  sellPrice, reports trades, adds gold/score/weekly sold; one summary toast per 2 minutes. Settings → Selling toggle too.
- Main menu: foldable sections via `msec()` (Your farm, Play together, Save and backup (folded, status in header; forced open while a
  file/import/export/backup is in progress), Game, Controls (folded)); folds remembered in localStorage harvestworks.mfold; buttons in
  an even grid. Tests: t_store.py (stores, auto-sell, menu), t_storeart.py.

## v0.55.1 — 2026-10-20 · backend (hidden from the in-game updates log)
- Trade history trimmed daily. Server migration `trim_old_trades_daily`: enables pg_cron; `trim_trades()` (security
  definer, not callable by anon/authenticated) deletes trades older than 7 days; job `trim_trades_daily` runs at 03:17 UTC. Readers
  (get_market, get_trades, record_trade, record_trades) only use recent rows. First run deleted 3 rows. Owner approved the deletes.
  The trades table was ~4,900 rows / 624 KB, growing ~1,700 rows a day.

## v0.55 — 2026-10-20
- Pause when storage is full: Settings toggle S.fullPause (default off). `checkFull()` each frame sets UI.fullHold when room() <= 0 (not in
  races, title screens or catch-up); `paused()` includes it; banner in #idlebar (dataset.k 'full'/'idle' so the idle message and this one
  don't clash); one toast and warn sound on the transition. Actions that free space (selling, upgrades) still work while paused.
- Farmhand fertilizer: S.helper.fert (Farmhands screen toggle, default off). `resolveStep` 'tend': plant with f:1 when fertilizer is in
  storage, fertilize a growing unfertilized plot before watering; falls back to no fertilizer when none is left.
  Hooks: HW.resolve, HW.room. Test: t_fullfert.py (incl. a 7 s farmhand run: 2 of 3 fertilizer used).

## v0.54 — 2026-10-19
- Daily Puzzle on the main screen: a "Puzzle n/m ▾" button in the Activity/Updates row (`dqBarBtn`, logOpen 'dq'; red dot while a fresh
  puzzle is untouched; tick when solved; hidden before the tutorial ends, in races and when no puzzle can be built) and a dropdown
  (`dqDrop`) with the clue, hints, Hand in / hint buttons, solved clues, streak and time left. The active-step markup is shared with the
  drawer (`dqNowHTML`). Test: t_dqbar.py (desktop and phone).

## v0.53.2 — 2026-10-19
- Scroll jump fix. `setHTML` replaced a container's markup on every change (a count, a progress tick), which clamped its scrollTop to 0.
  It now saves the scroll of the element and of `.dbox` and restores it when the same drawer (UI.drawer) or the same tile (UI.sel) is
  redrawn; a different drawer or tile still starts at the top. Applies to every drawer and the tile panel. Test: t_scroll.py (phone and
  desktop; fails 5 checks without the fix).

## v0.53.1 — 2026-10-19
- Daily Puzzle hint prices: max(step-reward share 30%/60%, 1%/3% of gold held), rounded to two significant figures (`niceG`).
  Config `daily.reward.hintGold`. At 9M gold: ~90k / 270k; at 500g the step-based price still applies.

## v0.53 — 2026-10-19
- Daily Puzzle (Menu → Daily Puzzle; drawer 'daily'). `dqGraph` lists what this farm can make (unlocked crops, gather outputs of owned
  terrain, recipes at built stations whose inputs are makeable); `dqMake(day)` seeds raceRng with the UTC day + that good list, so farms
  that can make the same goods share a puzzle. Step 1 is a hand-written riddle (data.js `daily.riddles`); later clues come from `dqLinks`
  (up: made from the last answer; down: goes into it; side: same station), each with a test, kept only if exactly one makeable good fits.
  Weights favour making things, harder wording, station changes and a finer last good; 5 steps at 22+ goods, else 4 (min 3, min 6 goods).
  Last step may need Good quality. Stored in S.daily for the day; S.dqStreak {n, last}. Rewards: 1.5× value per step in gold, 3 Discovery
  (−1 after a named answer, −1 at 3+ wrong guesses, min 1), +3 every 7-day streak; hints cost 30%/60% of the step's gold. Daily toast
  (localStorage harvestworks.dqseen). Off before the tutorial ends and in races/weekly challenges. Test: t_dq.py, t_dq_gen.py (Joel's save,
  60 days: 50+ distinct 5-step chains, every clue unique).

## v0.52 — 2026-10-18
- Phone bottom sheet (portrait / narrow) is compact by default: max-height 42% (was 56%); `#panel:not(.full)` hides the subtitle, hints (not
  errors), tips and `.more` sections (Change this land, Move this building, Clear plot). A 40px "More/Less" handle (`.pmore`, `data-pmore`,
  UI.pfull) toggles `.full` (58%). Stations, market, home, storage and the board open full by default; every new selection resets it. The
  handle only shows when something is folded (`:has`). Desktop and landscape side panel unchanged. Test: t_sheet.py (built page, 390px).
  t_phone2.py already fails on 3 old assertions (ticker hidden, goal card height, ticker toggle); not caused by this.

## v0.51 — 2026-10-18
- Valley Green can move onto an already-surveyed corner area if no tile there has a building (a farmer with all four corners surveyed could
  not move it at all). `greenSpot(k, swap)` accepts empty surveyed areas for moves only (first placement still prefers unsurveyed land);
  `moveGreen` asks for a second tap within 15 s (UI.greenAsk), then replaces the area, lowers S.surveys by one (the old spot is unsurveyed
  again, so the area count stays right), drops queued tasks on those tiles. `greenWhy` gives the locked-corner reason. Test: t_corner.py (extended).

## v0.50 — 2026-10-17
- Mastery gets two tiers above Master (after the top save showed honey at ~74k, far past Master's ~1.8k): Legend (400k points; +25% sell,
  +20% speed, every second harvest/batch one extra, +3 Discovery) and Mythic (2.5M; +30%, +25%, every second, +5 Discovery).
  Existing Masters earn Legend on their next harvest/batch (loop awards any skipped tiers). Wording helper `extraWord`, star badge
  for tier 4+, new badge/bar colours. Test: t_mast.py (extended).

## v0.49.1 — 2026-10-17 · backend (hidden from the in-game updates log)
- Batched trade reports. Server migration `record_trades_batch` (additive; record_trade stays): `record_trades(p_player, p_trades jsonb)`
  runs each {item, qty, side} through record_trade (same price impact, rate limit and feed; bad entries skipped; max 30 per
  call) and returns {item: new price}. Client queues sales/purchases for 2.5 s, merges the same good and side (split at 50),
  sends one request, applies the returned prices; flushes when the tab is hidden or closed; one record_trade per entry if
  the server lacks record_trades (404). The per-player rate limit (40 reports / 10 min) now stretches further, since merged
  entries count once. Test: t_batch.py. Still not done: trimming old rows from the `trades` table.

## v0.49 — 2026-10-17 · backend (hidden from the in-game updates log)
- Market traffic cut ~80%+ per open copy. Server migration `market_sync_and_get_trades` (additive; get_market and presence_ping stay
  for older open copies): `market_sync(p_inst)` returns only prices that differ from 1.0, the clock and the open-copies count,
  with the presence ping folded in (~1 KB vs 5.5 KB); `get_trades(p_limit)` returns the ticker's trades (25 rows, ~2.6 KB).
- Client: pullMarket calls market_sync (falls back to get_market on any error) every 90 s while visible (was 30 s) and a bare
  presence ping every 90 s while hidden; trades are fetched only while the ticker is open (default off on phones);
  re-sync when a tab becomes visible after 30 s+, and when the ticker is switched on. Test: t_sync.py.
- Not done yet: batching sells into one record_trade call; trimming the `trades` table (old rows).

## v0.48.2 — 2026-10-17
- When the daily allowance is used up (after a gift, a 'cap' reply, or a refreshed state showing none left), `monAutoCapStop` clears every Auto toggle and shows a warning toast. The auto loop confirms with the valley (refresh) before switching off on old numbers. Test: t_auto2.py.

## v0.48.1 — 2026-10-17
- Auto-give stall fix: when nothing can be given (allowance shows used, no ticked good wanted/owned), `autoMonGive` refreshes the monument state at most once a minute, so a new UTC day or new phase is picked up; a gift with no reply for 30 s no longer blocks later ones (UI.monBusyAt). Test: t_auto2.py.

## v0.48 — 2026-10-17
- Monument auto-give: per-good Auto toggle in the give list (S.monAuto, saved per farm); `autoMonGive` runs every 20 s,
  picks one ticked good the current phase takes and gives monMax of it (quiet toast, no error toasts); stops when the
  day's allowance is used. Online farms only, never in races.
- Builder's days: `builderDay()` is true when the player has given today (m.today > 0, monument not finished). Gathering
  tiles regrow 2× (stock regen and forest saplings) and `useDep` doesn't wear deposits. Shown in the monument panel and on
  deposit lines. Client only. Test: t_auto.py.

## v0.47 — 2026-10-17
- Fourth wave of discoveries (client only): winemaking (Press: berry_wine, apple_brandy), glassworks (fishing also gives
  1 sand via gatherOut; new Glass Furnace station `glassworks` + kit + art: glass, glass_jar, stained_glass (needs dyeing)),
  seedsaving (every 3rd harvest +1 seed, S.seedN), coldframes (needs glassworks; `hardy(c)` treats every crop as hardy for
  frost, winter and snow), granary (homeGrowth.granary 100 instead of 60 per level past the listed upgrades, retroactive).
- New items sand, glass, glass_jar, stained_glass, berry_wine, apple_brandy, glassworks_kit; two new contracts
  (The Vintner's Cellar, Glassblower's Fair); wine in season in summer, brandy in autumn. Test: t_wave4.py.

## v0.46 — 2026-10-17
- Mastery (end-game, client only). `D.mastery`: 13 goods (8 crops + egg, milk, wool, honey, mushrooms) and four tiers with
  targets in points (units × base value, shown as rounded units): Bronze 1k (+5% sell, +1 DP), Silver 5k (+10% sell, 10%
  faster, +1 DP), Gold 15k (+15%, 10% faster, every 4th harvest/batch +1, +1 DP), Master 40k (+20%, 15% faster, every 3rd
  +1, +2 DP). Counts in `S.mast` from harvests and station collects only (`mastAdd`); extras only when storage has room
  (`S.mastX` counters). Perks: `sellPrice`, crop growth, station batch time. Off in races/weekly (no counting, no perks).
- UI: Menu → Mastery drawer (list, progress bars, tier help), mastery block on item info cards, tier badges in storage.
- Existing farms start at zero (no lifetime production history existed). Test: t_mast.py.

## v0.45.1 — 2026-10-16
- #drawer (main menu and other full-screen menus) gets z-index 30 so racebar, coach, movebar, idlebar, update bar and the panel stay behind it. CSS only.

## v0.45 — 2026-10-16
- Race and weekly bars on a phone (isPhone()) render as a vertical meter (vMeter): `#racebar.vm` at the left edge under the top
  bar, one column per racer filling upward (yours wider and gold), time above, your score below; the goal card shifts right
  by the meter's width (body.has-vm, --vmw). Weekly: one column showing the elapsed share of the run. Tapping the meter
  toasts the standings or the run details. Desktop keeps the horizontal bar. Client only. Test: t_vmeter.py.

## v0.44 — 2026-10-16
- Phone pass 1 (see ROADMAP "Phone-first pass"). CSS under @media (pointer: coarse): HUD chips 40px tall, top buttons 44×40,
  goal-card buttons 44×40, close buttons 44, ticker buttons 44×34, chips and toggles 40–44 high; desktop sizes unchanged.
  New farms on a phone start with the market ticker closed (S.tick.open = !isPhone()); a closed ticker takes no room
  (body.tick-off hides it and moves the goal card up to 54px). Settings → "Show the valley market ticker at the top"
  brings it back (data-tick-toggle). Farms that already had a ticker setting keep it. Client only. Test: t_phone2.py.

## v0.43 — 2026-10-16
- Storage sorting. A "Sort by" row in the Storage drawer (INV_SORTS): Category (the grouped view, unchanged default),
  A–Z, Most, Fewest, Worth (item value × count; the slot shows the total), Best quality (Excellent, then Good, then
  count) and Newest (reverse order items first entered storage). Everything but Category is one flat list; the category
  chips still filter it. Saved with the other tab choices (UI.cat.invsort in harvestworks.tabs). Client only.

## v0.42.4 — 2026-10-16
- Daily allowance dead end fixed. mon_give used to refuse when the allowance left was smaller than one item's points
  (allow < val, and allow / val rounded down), so a player 1 point short of 800 could not give a 4-point item. Server
  (migration mon_give_last_gift_can_pass_cap): any allowance > 0 lets you give, n = ceil(allow / val), so the last gift
  of the day can pass the cap by less than one item's value; the 'cap' error now means allowance <= 0. Client monMax uses
  ceil to match, the "worth more than…" reason now says the last gift can go over, and the help card explains it.
  Tested in begin…rollback (799 + 5 stone → 1 stone, 803; next gift refused) and by t_cap.py.

## v0.42.3 — 2026-10-16
- Valley Green attaches to a corner of the farm (the area diagonal to a corner of the starting land) instead of an edge
  area. greenSpot(k) finds it for 'back' | 'right' | 'left' | 'front' (back = top of the map at the default rotation); a
  corner is unavailable if that area is off the map or already surveyed. New farms open at 'back', falling back to the
  old nearest-area rule if all four are taken. moveGreen(k) (free) returns the old area to unsurveyed void and paves the
  new one; the picker is in the Depot and Green panels. Existing Greens keep their place (k = null) until moved.

## v0.42.2 — 2026-10-16
- Fence Kit renamed Land Kit (display name only; the item id stays fence_kit, so saves are untouched). Wording updated on
  the Workbench and Sheep discoveries, Timber Week, the expansion hint, and the "Fence the Fields" contract is now "Claim the
  Land". canPay adds a hint when Land Kits are short: make them at the Workbench (recipe cost), or unlock the Workbench first.

## v0.42.1 — 2026-10-16
- Your first Online Valley farm asks for a name ("What's your name?") and locks it to the player with claim_name; a
  taken name falls back to the server's suggestion (Name1…) with a toast, and S.name follows the locked name. An empty
  name stops the start. Private farms and players who already have a locked name see the old "Name your farmer" card.

## v0.42 — 2026-10-15
- Valley Monuments (Late-game loops, Stage 4). Server: mon_projects (phases jsonb with need, items→points, name, short,
  blurb; cap points/day; keep_min for the model) and mon_gifts (project, player, UTC day, points); hw_mon_current();
  mon_state(p_player) (project, points, mine, today, givers, top 10, mine_all, gallery); mon_give(p_player, p_name,
  p_project, p_item, p_qty) accepts only the current phase's goods, at most the daily allowance and never past the end
  of the phase, and returns how many to take. First project 'pyramid-1' (The Great Pyramid): 4 × 8,000 points, 800/day,
  model at 150, 2026-10-16 → 2026-10-30; building carries on past the target date.
- Client: NET.mon (cached in localStorage), fetched with the market every 2 min; monTotals (stage/phase from cumulative
  needs); monGive takes lowest quality first only after the server accepts; +1 DP for the first gift per phase per farm
  (S.monPh), +2 when finished (S.monDone). Ceremony title cards ('monstage', once per stage per device) and a welcome
  card ('monwelcome') when the Green opens.
- Valley Green: after the tutorial, online farms get the unsurveyed area nearest the middle as S.green (theme 'green',
  36 owned lawn/plaza tiles, not counted as a survey, can't be built on, can't buy land or survey from it). 3×3
  'mon_site' tiles drawn once from the front-most tile at any angle; 'depot' (kind depot) 3 tiles from the centre so it
  never ties the monument's draw order; a cart animation after each gift; map button [data-mon-show].
- Panels: Depot / monument tiles (monPanel), Valley Green tiles (greenPanel), drawer 'valley' (Menu and Homestead),
  model decoration 'monument' (kind decor, placed like medals, shows the current stage), "How monuments work" card,
  inline help on points, allowance and greyed goods. Homestead Notices list (notices()) with a glowing "!" over the
  Homestead until opened (S.noticeSeen).
- Art: monument(kind, stage, mode) in art.js, pyramid at 5 stages × 3 sizes ('deco' 1 tile, 'site' 3×3 on a plinth,
  'big' floating for panels; canvases carry ax/ay anchors), ART.monPic, depot sprite with crates for today's gifts,
  lawn and plaza ground tiles (seasonal).

## v0.41 — 2026-10-15
- Seasons and weather (Late-game loops, Stage 1). data.js: seasonRules, seasons (crops, goods, weather weights, late-autumn
  frost), weather texts, crop `hardy` flag. 28-day year from S.day (seasonIdx/seasonDay/yearOf); weather rolled from
  fid + day (rollWeather, gentle kinds only during the tutorial), memoised in S.wx; rain falls in a seeded window
  (rainWin) and waters growing plots (counts for quality); heat dries wet plots after 12 s (b.dry); frost halves tender
  growth before 10:00; snow blocks planting non-hardy crops; in-season crops grow ×1.25, tender crops ×0.8 in winter,
  sun ×1.1. sellPrice × seasonSell (×1.2 in season); rollMarket picks an in-season demand 60% of the time. Races and
  weekly runs: noSeasons() keeps everything neutral.
- UI: the day chip is a button (season + weather tag) opening the 'season' drawer (today/tomorrow, in season now and
  next, year bar); "in season" tags in the market; plot panel growth note and snow-day hint; info cards list seasons and
  hardiness; season-start toast and log line; weather in the day toast.
- Art: ART.setScene (spring/summer/autumn/winter/snow) recolours ground and plant sprites by exact colour swaps, spring
  blossom on trees, snow caps on every upward edge on snow days; discovery pictures stay spring. Screen-space weather in
  draw(): soft-light season grades, sun/heat glow, rain streaks, snowflakes, fog/mist banks, frost tint, spring petals
  and autumn leaves (particles off with reduced motion); background colour per scene.
- Sound: SND.setScene(season, weather, raining). Four generated themes (spring bells in C, summer plucks + walking bass
  in G, autumn wooden plucks in A minor, winter celesta in E minor); rain hiss and drips, summer cicadas, fewer birds in
  autumn/winter, no crickets in winter, muffled breeze in snow and fog.

## v0.40 — 2026-10-15
- Finite minerals: gather.deposit (30 digs) on boulder, clay, ore; T.r.dep counts digs left; surface stock refills
  only from what's left; useDep() on mine/gather; migrate() gives old tiles a full deposit. Not applied in races.
  Gather panel shows the deposit bar; worked-out tiles offer the new 'deepen' task (Deep Quarrying discovery, 250g +
  6 plank). Piling a rock field (grass>boulder) makes a 3-dig deposit so it can't mint stone.

## v0.39.3 — 2026-10-15
- Quality upgrade capped at +1 tier over the ingredients (effect [0, 1, 1]); level 2 (Master Crafting) gives a bonus
  first-output item every 3rd batch (b.qn counter, job.bonus). Closes the buy-Basic / sell-Excellent loop. Help text,
  info card, station hint and production-tree note updated.

## v0.39.2 — 2026-10-15
- Repeat count: select (REP_OPTS, 0 = forever) beside the Repeat toggle; b.repN / b.repDone; turns off when done.
  setHTML leaves a focused <select> alone.
- Weekly themes: barnyard, woolly, dairyweek, helpers (start.helper hires a farmhand). Weeks < 2963 keep the old
  10-theme rounds (this week unchanged); from 2963 themeRound() deals all 14 per round, no repeats week to week.

## v0.39.1 — 2026-10-15
- Audit pass (data reachability, every panel/drawer/title screen on a late-game and a fresh save, 1,500 s sims): no
  render or runtime errors; all discoveries, items and contracts reachable.
- Fixes: animal feed recipes were value-losing (milk 12g; egg_scraps 3 eggs; milk_hay 3; milk_veg 2; wool_greens 2).
  genOrder only asks for Good when canGood(id). stove_kit (90g, place 2 plank + 2 stone) so the Stove follows the
  one-per-area rule like other stations. repeatUsers(): useHint + info card note; Activity log 'auto' entry once a day.

## v0.39 — 2026-10-15
- Animals branch (discoveries chickens, dairy, sheep, creamery; chickens needs surveying + a surveyed area via the new
  `survey: true` flag and discOk()). Stations coop, dairy, pasture, creamery (kits in the market) with feed recipes
  (recipe `label` for same-output rows); goods egg, milk, wool, butter, cheese, omelette, custard, cake, yarn, blanket.
  Contracts Farm Fresh, Cozy Woolens, Country Bakery (land: 'any' = needs a surveyed area). Art: animated coop, dairy,
  pasture sprites, creamery, new icons (egg, bottle, wool, block, wedge, cake, yarn). Toast on the first survey.

## v0.38.1 — 2026-10-15
- Contracts: milestones 19–23 carry land:<theme>; S.msOrd (per-farm order) and curMs(); fixMsOrder() swaps a land
  contract whose area isn't open with the next contract that's doable (run on load, after a survey, after a delivery).
- surveyCost(): roof tiles only once a Clay Banks area is open (avoids a deadlock on the 4th survey).

## v0.38 — 2026-10-14
- Recipe rows are clickable (UI.rexp): errandBox() lists each ingredient's stock, need and market price (canBuyItem /
  buyPrice) with a 1-batch / fill toggle. New discovery 'errands' (req farmhand, 3 DP): sendErrand() sets S.helper.errand;
  updateErrand() walks to the market, buys the shortfall (re-checked on arrival: gold, room, buyable), walks back and
  loads; it overrides the routine, then the routine resumes. Queue chip shows errand progress; Activity logs both steps.

## v0.37.2 — 2026-10-14
- QUALITY_HELP explainer (crops: water both stages +1, fertilizer +1; goods: lowest ingredient + station Quality upgrade;
  gathered always Basic; sell multipliers). Shown from Storage (data-qhelp), farm plot and station panels
  (data-qhelp-panel), a quality line on info cards, and a one-time toast after the first Basic harvest (S.qTip).

## v0.37.1 — 2026-10-14
- Info cards (#info): contextmenu in #panel/#drawer/#queue/#goals → infoTarget() finds the item (data-info on every ico()
  and on recipe rows, task buttons load/buy/sell/place/plant, single-icon rows); infoHTML() builds the card from data.js
  (building desc, sprinkler coverage, station recipes, crop/seed, gathering, recipes, uses, prices, needed discovery).

## v0.37 — 2026-10-14
- Action panel, window style (non-phone): drag .phead to move, #pframe edge/corner handles to resize, double-click
  .phead to reset; saved in 'harvestworks.panelpos' ({x,y,w,h}; h null when only moved). Removed #pctx / #pedit.
- Weekly runs: runMins(w) = 15 for week 2962, 10 after; weekly_score limit per week (900 s / 600 s) on the server.
- Live count chip: dot and number only.

## v0.36.5 — 2026-10-14
- Pinned panel: right-click #panel → #pctx menu (Move and resize / Open beside the tile again). #pedit frame drags and
  resizes UI.ppDraft; Done saves {x,y,w,h} to localStorage 'harvestworks.panelpos'; placePanel uses it (border-box, clamped).

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
