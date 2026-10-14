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
- **Animals (pinned 2026-10-13, ideas approved; build later, "not too soon"):** peaceful only, never slaughter. Ideas: Chicken Coop (eggs → baking),
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
- **Weekly challenge (pinned 2026-10-14):** main-menu mode (online only). Everyone gets the same seeded head start for
  the week (race preset seeded by year+week). One ranked attempt per day (enforced server-side, day resets 00:00 UTC),
  each a 15-minute no-pause run; your best attempt of the week counts; extra runs are unranked practice. Week closes
  Sunday 00:00 UTC; ties go to the earlier submission. Top 3 get gold/silver/bronze medals, stored server-side against
  the player (so they survive restores) and shown with a ceremony pop-up on next open. Medals live in Menu → Medals and
  can be placed on any farm (private too) as a decoration; clicking one shows e.g. "Weekly Challenge champion · Week 42,
  2026". Server: weekly_runs + medals tables; start_attempt, submit_weekly (with a max-points-per-minute sanity check),
  weekly_board, my_medals. Pairs well with the player key below.
- **Player key (pinned 2026-10-14, idea):** one no-signup code per player (like the backup code) that carries the locked
  name, medals and every farm's cloud backup to a new device. Optional; no email or password.
- ~~Valley stock~~ (dropped 2026-10-13): replaced by v0.19, where the market sells any good you've made at least once.
