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
- **Daily quest mode (pinned 2026-10-13):** a fresh challenge every real-world day, the same for every player (seeded
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
- ~~Valley stock~~ (dropped 2026-10-13): replaced by v0.19, where the market sells any good you've made at least once.

## Late-game loops plan (agreed 2026-10-15)

Built in stages; each stage ships on its own.

- ~~**Stage 1: Seasons and weather.**~~ (done in v0.41). A 28-day year of four 7-day seasons (lines up with the weekly report). Each
  season favours some crops (faster growth, market demand) and changes the scenery (blossom, lush green, autumn
  leaves, snow). Gentle weather, no storms: rain (waters every crop), sunny spells, heat (soil dries faster), fog
  and morning mist (cosmetic), first frost in late autumn, snow days in winter (some crops can't be planted outside).
  Each season gets its own music, ambience and colour palette. Client only.
- **Stage 2: Supply contracts.** Standing deals on the Order Board ("10 bread a day for 5 days"): steady daily
  deliveries for a big bonus and Discovery; missing a day ends the deal early with partial pay. Seasonal ones use
  in-season crops. Client only.
- **Stage 3: The Almanac.** A collection book: every good at every quality, plus rare finds (giant pumpkin, golden
  egg, pearl while fishing, four-leaf clover). Completed pages give small permanent perks or decorations. Client only.
- **Stage 4: Valley Monuments (online, co-op; agreed 2026-10-15, now first in line after Stage 1).** Replaces the
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
  - Homestead: a Valley section with a slowly rotating floating monument, progress bar, what's needed this phase,
    your own total, a contributor roll and a Contribute button. Add a general Homestead notices list with a glowing
    badge for things players forget (an unfinished monument, an affordable storage upgrade, a waiting weekly
    report), plus a tutorial goal pointing at it.
  - Valley view: a button beside See-through opens a diorama scene (plaza, the monument at its stage, scaffolding,
    banner of contributor names), since the shared build can't sit on a private farm map.
  - Valley Gallery of finished monuments. Candidates: pyramid first, then mill, lighthouse, stone bridge, clock
    tower, great barn, fountain square, harvest statue.
  - Server: projects + contributions tables, per-report caps like record_trade, active-player count for scaling.
- **Stage 5: The County Fair.** Once a season (end of each season). A special list of Fair orders just for the
  event, a race to fill it: the clock starts when you open the fair. You get a Fair Cart that holds exactly enough
  for the list (doesn't use storage). Fastest complete lists win ribbons for the trophy case; everyone who finishes
  gets a reward. Online ranking like the weekly challenge.
- **Stage 6: Seed breeding and the Greenhouse.** A Greenhouse grows out of season and crosses two Excellent crops
  into variants (sweet carrots, giant pumpkins, golden wheat) worth more and recorded in the Almanac.
- **Pinned for later:** Farm Renown ranks and titles; decorations and farm charm; farmhand expeditions.
