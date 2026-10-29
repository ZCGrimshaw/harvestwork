# Roadmap and ideas

Not built yet; picked up when we choose to.

- ~~Map expansion~~ (done in v0.25: survey 6×6 areas with their own terrain, plus building caps and moving buildings).
- More discoveries as the tree is worked through (more area themes, orchards, more automation).
- ~~Visibility as the farm grows~~ (done: v0.21 auto-fade + See-through toggle; v0.22 buildings 25% shorter).
- **Supporter pack (pinned 2026-10-13):** cosmetic-only perks for Ko-fi supporters (nothing that affects gold or the shared market).
  First pack: supporter outfits/hats (S.shirt / S.hat already exist), one seasonal theme (autumn), ambient life
  (butterflies, birds, fireflies, lit windows, station smoke/steam). Later: more themes, placeable decorations,
  supporter building trim. Unlock via Menu → Supporter pack: start with one shared code shown in the Ko-fi thank-you
  message; move to per-supporter codes (Ko-fi webhook → Supabase) only if sharing becomes a problem. Unlock saved in S.
- ~~Animals, first wave~~ (done in v0.39: chickens, dairy cows, sheep, creamery). Still to come from the pin: pets, ducks, goats, wandering animals, brushing. Original pin (2026-10-13; updated 2026-10-15: they arrive once a player surveys their first new area):** a new
  "Animals" Discovery branch that opens after Land Surveying, so the early game stays simple and new land has a purpose. peaceful only, never slaughter. Ideas: Chicken Coop (eggs → baking),
  Dairy Barn with cows (milk → butter, cheese), sheep on a Pasture (wool → yarn at the Loom), ducks on ponds (feathers),
  goats; animals eat spare crops (a new use for surplus), happiness from feeding/brushing raises quality; animals wander
  their pen. Pets: a farm dog that follows the farmer and a cat that naps on the Homestead step. Wild life for ambience
  (rabbits, birds landing, butterflies) can share work with the supporter pack's ambient life.
- ~~Backup code copy button~~ (done in v0.32).
- ~~Idle auto-pause~~ (done in v0.32).
- ~~Daily quest mode~~ (done in v0.53 as the Daily Puzzle: a riddle chain instead of three small goals). Original pin (2026-10-13): a fresh challenge every real-world day, the same for every player (seeded
  by the date, like race head starts). Two shapes to choose between when we build it:
  (a) Daily quests on your own farm: 3 small goals a day (e.g. "Bake 4 bread", "Sell 300g of goods", "Harvest 20
  carrots"), rewards in gold/Discovery, a streak counter and a weekly bonus for 7 days in a row.
  (b) ~~Daily challenge~~ folded into the Weekly challenge below; (a) stays as its own idea.
- ~~Next build: live count dot and number only~~ (done in v0.37). Was: the live "open now" chip at the top right shows just the green dot and the number;
  drop the word "playing" (renderOpen in game.js; keep the tooltip). Release note: visible, small visual change.
- ~~Window-style action menu~~ (done in v0.37). Was: move and resize the action menu like a Windows 11 window (computers only). Replaces
  the right-click "Move and resize" menu (#pctx / #pedit). Click and hold the menu's title bar to drag it anywhere;
  resize from any edge or corner with the matching resize cursors (↔ ↕ ⤡). Position and size are remembered in this
  browser and it opens there from then on (same 'harvestworks.panelpos' store, clamped on screen). Until it's moved, it
  keeps opening beside the tile. Double-click the title bar to send it back to opening beside the tile. Buttons inside
  keep working normally; only the title bar drags. Update the tip line and release note to match.
- ~~10-minute weekly runs~~ (done in v0.37). Was: starting with the week that opens Monday
  2026-10-19 00:00 UTC (week 2963; Sunday 5pm Pacific), ranked and practice runs last 10 minutes instead of 15. Change WEEK_RUN
  in game.js per week (keep 15 for week 2962 so this week's runs stay fair), the 900 s limit in weekly_score on the
  server (per week, same rule), and the "15 minutes" wording on the weekly screens and in the update notes.
- ~~Weekly challenge~~ (done in v0.36). Original pin: main-menu mode (online only). Everyone gets the same seeded head start for
  the week (race preset seeded by year+week). One ranked attempt per day (enforced server-side, day resets 00:00 UTC),
  each a 15-minute no-pause run; your best attempt of the week counts; extra runs are unranked practice. Week closes
  Sunday 00:00 UTC; ties go to the earlier submission. Top 3 get gold/silver/bronze medals, stored server-side against
  the player (so they survive restores) and shown with a ceremony pop-up on next open. Medals live in Menu → Medals and
  can be placed on any farm (private too) as a decoration; clicking one shows e.g. "Weekly Challenge champion · Week 42,
  2026". Server: weekly_runs + medals tables; start_attempt, submit_weekly (with a max-points-per-minute sanity check),
  weekly_board, my_medals. Pairs well with the player key below.
- ~~Player key~~ (done in v0.36). Original pin: one no-signup code per player (like the backup code) that carries the locked
  name, medals and every farm's cloud backup to a new device. Optional; no email or password.
- **City growth (pinned 2026-10-15, wild idea, major update; later):** the farm grows into a village, town and city
  with residential, commercial and industrial buildings, with the farm staying the heart of the economy.
  Rough phases: (1) Village: houses bring villagers who want goods (food, cloth, tools); their steady demand
  becomes the main source of orders, and villagers can be hired as farmhands. (2) Town: shops (bakery, tailor,
  smithy) sell your goods for you for steady income; roads and a town square. (3) City: industry (bigger versions
  of your stations, factories), districts, more residents wanting finer goods. Watch: scope, art volume, and
  performance on the 36×36 map (may need a separate "town" map).
- **Race codes as farm words (pinned 2026-10-16, DONE in v0.64):** replace the random 5-character race code (K7QPM) with a real farm word of
  4 to 5 letters (BARN, WHEAT, HIVE…), picked from a list of about 190 inside create_race. Old races (over 2 days) are deleted
  so words can be reused; if every word is in use it falls back to a random code. Client: joinRace currently demands exactly
  5 letters or digits; it should accept 3 to 5 (old codes keep working), with new wording ("Race codes are farm words, like
  WHEAT"). Watch: a word list is far easier to guess than 31^5, so a stranger could join an open lobby (it only shows names,
  8 players max). The migration was written but cancelled twice at the approval prompt on 2026-10-16, so nothing changed yet.
- **Phone-first pass (pinned 2026-10-16):** make the game comfortable on a phone: easier to see, fewer taps. Ideas: tap
  targets of 44px or more, less chrome above the map (ticker and goal card collapsed), quick-action chips on the selected tile,
  drag to till/plant/water/harvest many plots, remember the last crop, bottom sheets with peek and full heights, an
  Add-to-Home-Screen app (manifest, offline), a larger-text option, battery and frame rate checks. Needs a real-device test.
  Done so far: v0.44 (44px tap targets, ticker hidden by default on phones). Skipped: quick-action chips (tapping a selected
  tile again already does its main action). Next: drag to till/plant/water/harvest many plots, Add to Home Screen, larger text.
- **Pause button at the top (pinned 2026-10-23, next build):** a visible Pause/Resume button in the top bar, so players can stop the
  clock without opening the menu (today only the menu, idle timeout and full-storage hold pause the world; see `paused()`).
  Open: it should show a clear "Paused" state, keep working while panels are open, and not apply during races or the weekly
  challenge (the clock keeps running there).
- **Walk-in house interior (pinned 2026-10-22, not built; Opus work):** a "Go inside" room view for the house with a floor grid
  (4×4 cells per house tile: Cottage 4×4, House 4×8, Farmhouse 8×8, Manor 8×12), floor pieces (chairs, tables, bookshelves, lamps,
  rugs flat underneath) and wall pieces (paintings, curtains, fish trophy) on the two back walls, placed by tap or drag with rotate
  and store. Needs larger room sprites for the 9 decor pieces and a save-format change; current display spots (`d`) would be placed
  automatically the first time it opens. Open: wall spots now or floor only; a layout bonus (rug under a table, lamp by a chair).
- **Homestead decor line (pinned 2026-10-20; stages 1–2 SHIPPED in v0.65: house, decor, growth to 2×3; charm still open):** a new production line of household goods for decorating the farm (furniture,
  rugs, lamps, curtains, pottery, picture frames), made at new stations from existing materials (wood, wool, clay, glass,
  cloth). Pairs with "decorations and farm charm" and City growth.
  **Direction (discussed 2026-10-22):** decor is displayed inside a **Homestead house**, not scattered on the map. The house
  starts 1x1 and grows in 3 to 4 paid steps (1x1, 1x2, 2x2, 2x3); its size sets the display slots (about 3, 6, 10, 15).
  Charm comes from what is on display (capped by slots). A **fish trophy** (crafted from a caught fish; rarer fish make
  better trophies) is the first showpiece, so the trophy wall doubles as a collection. Interior is a slot-grid drawer like
  storage (phone friendly), not isometric rooms.
  Build order: 1x1 house + 3 slots + a handful of pieces incl. the fish trophy; then size upgrades; then the charm bonus.
  Risks: buildings are single-tile today (`T.b` per tile), so multi-tile footprints are new (placement check naming the
  blocking tile, save format, procedural art per size; Opus work). Open: should charm feed order rewards or stay display-only?
- **Inside a factory (pinned 2026-10-20):** a factory building you can step into: a separate indoor map where machines are
  laid out and linked by belts, turning raw goods into finished ones on their own. Pairs with City growth phase 3 (industry)
  and the storage buildings. Open: indoor grid size, belts versus adjacent machines, art volume.
- **One sync request (pinned 2026-10-20, not built):** today a cycle sends `market_sync` (prices, clock, open count, presence ping)
  every 90 s, plus `get_trades` when the ticker is open, `mon_state` about every 3 min, and a load-time burst (`submit_score`,
  `my_name`, `my_medals`, auto-backup, `link_farm`). Plan: one additive `game_sync` RPC returning market, clock, open count, trades,
  monument state, and (on load) name and medals, so a normal cycle is one request; old clients keep using the current RPCs.
  The weekly check for losing #1 could ride on it too. Low priority: DB is small and trades are trimmed daily.
  **Watch (noted 2026-10-22):** monument gifts (`mon_give`) are sent straight to the server one at a time, and Auto-give sends one gift of
  one good every 20 s at most. Manual gifts should stay immediate (the server must approve the allowance and phase before goods leave
  storage). If traffic becomes too much, address Auto-give first: let one request carry several goods, or send auto gifts with the
  regular sync, and handle the server refusing a gift after the goods were set aside. Not a problem today.
- **Grand orders tuning (pinned 2026-10-21, waiting on Joel):** Joel says "every 6 mins makes it impossible to keep up". Nothing in the
  game runs every 6 minutes: Grand orders refill every 15 min (`C.grand.refill` 900 s, 2 slots, never expire), regular requests every
  15 s, a game day is 4 min. Ask Joel which screen shows 6 minutes. If it is the Grand orders, options: slower refill (30-60 min),
  smaller size (`C.grand.fill` 0.22 down to about 0.10-0.12), or one slot. Smaller size first.
- **Two-finger drag glitches near big buildings (pinned 2026-10-28, not looked into yet):** on a touch screen, pressing and dragging with two fingers
  makes the Farmer's Manor (the biggest house size) and the Pyramid monument "do weird things". Two fingers turn and tilt the view (pointer code near
  `pinch`, game.js), so the likely suspect is how these large multi-tile sprites are drawn or sorted while the view yaws or tilts. Needs a repro first:
  which device, and what "weird" looks like (jumping, flickering, drawn behind other things, disappearing).
- **More cold storage (pinned 2026-10-28, DONE in v0.95 as option B, mega expansions for all three stores; Grand order sizing left alone, watch Joel's feedback; from Joel: "Give more cold-storage (allow mega-upgrade or something). Everything is cold-storage and the
  mega-orders have us saving everything."):** The Cold Cellar holds every cooked, baked, preserved and brewed good plus eggs and milk (`storeKinds.coldcellar`),
  which in the late game is nearly everything a player makes. One cellar per area, 200 + 120 per expansion, 4 expansions = 680 maximum each
  (`hold` in `data.js`). Grand ("mega") orders ask for 5 goods with quantities that scale with storage (`C.grand.fill`), so players hoard goods for them, and
  the cellars fill first and spill into main storage. Options: (1) extra "mega" expansion levels after the 4th (a bigger step, costs rising as today);
  (2) raise `max` from 4 to 8; (3) a second cellar per area; (4) split the Cold Cellar so goods and drinks have their own store. Do not make storage endless
  without a cost: it should stay a choice. Tune with the Grand orders pin above, since the two feed each other.
- **See what is in each store (pinned 2026-10-28, DONE in v0.94, from Joel: "Allow us to see what's in our cold-storage (and silos and material-yards, etc)."):** Today the
  Storage drawer is one mixed list of everything owned, and its subtitle only gives totals per store ("food and drink 600 of 680 in their own store"). A
  Silo, Cold Cellar or Material Yard panel shows a single count too. Joel wants to see which goods are in each store. Idea: in the Storage drawer, a
  "Where" switch (All / Main / Silo / Cold Cellar / Material Yard) or grouped sections; and a list of contents in each store building's own panel. The
  data is already there (`storeKind(id)` says which store a good belongs to; `holdUsed()` totals each).
- **Time edit (pinned 2026-10-20, discussed, not built):** lengthen the game without making it grindy. Three parts:
  (1) Task durations: user's idea was +5% short, +7% medium, +10% long tasks, farmhand matched. Concern: that's small and
  mastery/speed upgrades cancel it; 10/15/25% would be felt; a flat % is simpler; one tier function (short <15 s, medium 15-40,
  long >40) applied to every duration, only to tasks started after the update; check weekly-challenge targets.
  (2) Discovery tokens (DT; rename "Discovery"/"Discovery Points" to "discovery tokens" everywhere): tree is 60 Discoveries
  costing 171 DT in total, with DT paid by first-time actions, 29 contracts (2 each), mastery, monuments and the Daily Puzzle (3 a
  day). Plan by phase. Early = learning: steady cheap DT (1-2) from tutorial goals and first-times. Middle = planning: DT from
  contracts, mastery to Gold and deeper chains; costs 3-6 plus some goods; branching choices. Late = systems: DT from top mastery,
  monuments, supply contracts, medals and throughput goals; costs 8-15 plus goods; unlocks automation, factories, more workers.
  Target tree about 350-450 DT. (v0.72 added six late Discoveries for 45 DT: tree now 70 / 231 DT.) Existing saves keep their tokens; only new prices apply. First step: tag all 60 Discoveries
  early/mid/late and set DT and goods costs in a table for approval (best done on Opus).
  (3) More than one farmhand (today exactly one: 4 jobs, 8 with Seasoned Farmhand).
- **Time on work (to discuss, pinned 2026-10-20):** put a duration on every task that needs work (tilling, building, crafting,
  expanding, hiring, gathering), so work takes time instead of finishing at once, and farmhands and speed upgrades matter more.
  Questions to settle first: which tasks already have timers (crops, crafts) versus instant ones; whether time runs offline;
  whether you can queue; how it affects races and the weekly challenge; skip-with-gold, and the balance risk for Joel-level farms.
- ~~Valley stock~~ (dropped 2026-10-13): replaced by v0.19, where the market sells any good you've made at least once.

## Late-game loops plan (agreed 2026-10-15)

Built in stages; each stage ships on its own.

- ~~**Stage 1: Seasons and weather.**~~ (done in v0.41). A 28-day year of four 7-day seasons (lines up with the weekly report). Each
  season favours some crops (faster growth, market demand) and changes the scenery (blossom, lush green, autumn
  leaves, snow). Gentle weather, no storms: rain (waters every crop), sunny spells, heat (soil dries faster), fog
  and morning mist (cosmetic), first frost in late autumn, snow days in winter (some crops can't be planted outside).
  Each season gets its own music, ambience and colour palette. Client only.
- ~~**Mastery tiers**~~ (done in v0.46, crops and animal goods). Next: crafted goods, Master variants as Almanac entries.
- **Stage 2: Supply contracts.** Standing deals on the Order Board ("10 bread a day for 5 days"): steady daily
  deliveries for a big bonus and Discovery; missing a day ends the deal early with partial pay. Seasonal ones use
  in-season crops. Client only.
- **Stage 3: The Almanac.** A collection book: every good at every quality, plus rare finds (giant pumpkin, golden
  egg, pearl while fishing, four-leaf clover). Completed pages give small permanent perks or decorations. Client only.
- ~~**Stage 4: Valley Monuments**~~ (done in v0.42: The Great Pyramid, 2026-10-16 → 10-30). Built as planned below, with these
  changes: the Valley Green opens after the tutorial with a welcome card (instead of a new tutorial goal, which would
  have reopened the finished tutorial for existing players); the floating monument bobs gently rather than rotating;
  the Depot sits on the lawn 3 tiles from the centre. Still to do: a second pedestal on the Green for the next monument
  (the area grows in bands), the Valley Gallery, and the next monuments. To start the next one, insert a mon_projects
  row (see CHANGELOG v0.42) and add its art to art.js MONUMENTS and data.js monuments.
  Original plan, Stage 4: Valley Monuments (online, co-op; agreed 2026-10-15, now first in line after Stage 1). Replaces the
  old "Valley projects" idea. Every online farm helps build one shared monument; it is co-operative, with no
  rankings or race. First monument runs 2 weeks, to see how it goes; after that one per month, with weekly
  mini-projects possibly added later as feeders. Shared events follow the real calendar (seasons are only theming).
  - Four visual stages at 25/50/75/100% funded (a pyramid: base, body, detail, crown). Each stage is also a phase that
    asks for a different kind of good (stone/brick, then planks, then finished goods, then fine goods), so farms with
    different specialities matter at different points. Scaffolding fills in as the current stage progresses.
    Crossing a stage gives every contributor a ceremony pop-up on next open (like the medals). Stage thresholds are
    decided on the server so everyone sees the same stage.
  - Contributing: donated goods earn no gold. Rewards are the small monument decoration plus a few Discovery points,
    never anything that touches gold or the shared market. Per-player cap per day/week so one big farm can't finish it
    alone; targets scale with active players; buying goods to donate is allowed (a gold sink). Online farms only.
    A minimum contribution earns the decoration; a late joiner can still view finished monuments in the gallery.
  - The small version: a one-tile decoration (like the medals) showing the current stage, staying as the finished
    model afterwards.
  - Sizes (mockup agreed 2026-10-15): farm decoration 1x (one tile, like a medal); floating Homestead monument 3x
    (~96 art px wide, redrawn with finer detail, not the small sprite scaled up); full-size on the map ~3×3 tiles.
    Stage art: 0% surveyed plot (stakes, string, sign), 25% stone base + scaffolding + crane + stone pile, 50% half
    height, 75% entrance and decorated band with low scaffolding, 100% gold capstone, banners, sparkle.
  - **Valley Green (replaces the old Valley view diorama, agreed 2026-10-15):** a fixed, pre-cleared plaza area on
    every online farm, outside the buildable land (never costs farm space or counts toward building caps). It holds
    one 3×3 pedestal per monument: the current build with its scaffolding, and finished ones as full-size models,
    so it fills up over the months like a trophy garden; the area grows in bands as monuments finish (start ~6×6).
    Opened by a tutorial goal that points players to it. The "show the build" button beside See-through jumps the
    camera to the Green. Online farms only.
  - **Monument Depot (agreed 2026-10-15):** one free building per farm, standing in the Valley Green (not placeable
    on the farm). Opening it shows the stage, what this phase needs, the progress bar, your own total, today's
    remaining allowance, the contributor roll, and Contribute. Donating stacks crates at the Depot and a little cart
    carries them to the scaffolding. Stage ceremonies play here.
  - Homestead: a Valley section mirroring the Depot panel (same Contribute button, so phone players never have to
    travel), with the slowly rotating 3x floating monument. Add a general Homestead notices list with a glowing
    badge for things players forget (monument needs planks, an affordable storage upgrade, a waiting weekly
    report).
  - Donation flow: the panel lists only goods the current phase accepts, with how much is still needed; pick a good
    and amount, or "Give max" (respects storage and the daily cap). Goods leave storage. Each good has a build
    value (finer goods count for more); progress is measured in points per phase. The server adds to the shared
    total; crossing a stage updates everyone and queues the ceremony pop-up. Decoration earned after a minimum total,
    plus a few Discovery points.
  - **Player explanations (required, 2026-10-15):** players must always understand what this is and why it helps.
    - First visit to the Green/Depot: a short welcome card ("Every farm in the valley builds this together. Donate
      goods, watch it rise, and keep a model of it on your farm.") with the four stages pictured and the rewards
      stated up front (decoration + Discovery, no gold).
    - A "How monuments work" info card (in the Depot, the Homestead section and the Info menu): stages and phases,
      build value, the daily allowance and why it exists (so every farm can take part), that donations give no gold,
      when the monument ends, and what happens if it isn't finished in time.
    - Inline help in the panel: each good shows its build value and "counts as N points"; the daily allowance shows
      as "You can give N more points today, resets at 00:00 UTC"; the phase line says why ("Phase 2: planks for the
      scaffolding"); greyed goods say what's missing ("you have none in storage" / "not needed this phase").
    - After donating: a toast with what you gave, the points, your new total, and how close the next stage is;
      a note when you've earned the decoration ("Placed in Menu → Monuments, put it anywhere on your farm").
    - Tutorial goal text, the Homestead notice and the "show the build" button tooltip all say what to do next.
    - Offline or private farms: the Green shows a plain explanation that monuments need an online farm, not a
      broken or empty panel. Release notes visible and written for players.
  - Valley Gallery of finished monuments. Candidates: pyramid first, then mill, lighthouse, stone bridge, clock
    tower, great barn, fountain square, harvest statue.
  - Server: projects + contributions tables, per-report caps like record_trade (the server can't see storage, so it
    limits each report and each day rather than verifying goods), active-player count for scaling.
- **Stage 5: The County Fair.** Once a season (end of each season). A special list of Fair orders just for the
  event, a race to fill it: the clock starts when you open the fair. You get a Fair Cart that holds exactly enough
  for the list (doesn't use storage). Fastest complete lists win ribbons for the trophy case; everyone who finishes
  gets a reward. Online ranking like the weekly challenge.
- **Stage 6: Seed breeding and the Greenhouse.** A Greenhouse grows out of season and crosses two Excellent crops
  into variants (sweet carrots, giant pumpkins, golden wheat) worth more and recorded in the Almanac.
- **Pinned for later:** Farm Renown ranks and titles; decorations and farm charm; farmhand expeditions.
