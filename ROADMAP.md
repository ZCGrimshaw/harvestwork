# Roadmap and ideas

Not built yet; picked up when we choose to.

- **Map expansion (pinned 2026-10-12):** buy a 6×6 region beyond the map edge for gold + materials.
  Proposed shape: a "Survey" action at the edge picks a side and adds a 6×6 region of unclaimed land,
  still bought tile by tile; each region has a theme (meadow, woods, quarry, lake, later ore hills/orchards).
  Cost rises per region (gold, planks, stone, fence kits; later bricks/gears).
  Technical: resize the grid, remap tile indices (selection, queue, farmhand jobs) when growing north/west,
  draw non-rectangular outlines, and convert old saves.
- More discoveries as the tree is worked through (ore beyond copper, orchards, more automation).
- **Visibility as the farm grows (pinned 2026-10-12):** buildings and trees hide what's behind them.
  Options, best first: (1) fade anything standing in front of the selected tile, the hovered tile and
  the farmers to see-through; (2) a "flat view" toggle (key/button) that draws buildings and trees as
  low footprints with their icon; (3) shrink tall sprites slightly; (4) fade tall objects when zoomed out.
- **Valley stock (proposed 2026-10-12):** goods players sell go into a shared pool anyone can buy from at the shared price.
