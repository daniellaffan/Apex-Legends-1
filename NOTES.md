# Refactor notes

The refactor source is `legacy/original.html`, a byte-for-byte copy of
`apex-rivals-26.html`. `legacy/original-export.html` is a copy of the offline
export `Apex Rivals 26.html`. Neither original in the project root was edited.

## What changed while moving the code (mechanical only)

- **Live bindings.** ES imports are read-only, so values written from other
  modules got a setter in the module that owns them: `setS` and `setPaused`
  (game/session.js), `setB3` and `setTEXBUDGET` (render2d/props.js). Only the
  assignment syntax changed, for example `S = null` became `setS(null)`.
- **`"use strict"`** was dropped from the 8 script blocks. Modules are always
  strict, and all 8 original blocks were strict already.
- **three.js** is imported as `import * as THREE from 'three'` (the npm
  package `three@0.128.0`, byte-identical to the cdnjs r128 build) in each
  module that uses it. Nothing relies on a global `THREE`.
- **Fonts.** The Google Fonts `<link>` became `src/fonts.css` with
  `@fontsource` 5.3.0 files, so the build makes no requests. They are the same
  families, weights and unicode ranges, but the font file versions may differ
  slightly from what Google serves.
- **Sounds.** `apex-rivals-26.html` points at `sounds/gun.mp3` and
  `sounds/radio.mp3`, but there is no `sounds/` folder, so those two clips
  never played in that file. Only the export had them, as data URIs. The two
  files in `src/audio/samples/` were decoded from the export, so the new build
  behaves like the export here, not like the bare source file.
- **No doctype.** The original has none and runs in quirks mode. `index.html`
  keeps it that way on purpose. Adding `<!doctype html>` could shift layout.
- **Script timing.** The original's game scripts all come after the markup,
  so running them as one deferred module gives the same order.

## Checks done (outside the browser)

- Line-level comparison of all original script lines against `src/`. The only
  differences are the setters, the `"use strict"` lines, the track objects
  becoming named `const`s, and the sound URLs. No numbers changed.
- `src/styles.css` is identical to the original `<style>` block.
- The `index.html` markup matches the original apart from the
  `<html>/<head>/<body>` wrappers and the font links.
- Earlier commits: byte-for-byte reassembly of the script lines, 160 top-level
  values deep-equal to the original (elevation, camber and banking sampled at
  201 points per track), and a Node smoke boot.
- `npm run build` gives a single `dist/index.html` (about 3.1 MB). The only
  URLs in it are comments inside three.js.

## Not done here: browser testing

These could not be run from the coding session. The sandbox stops local dev
servers, and the Chrome extension isn't available on this machine. Please
check:

1. `npm run dev`: the title screen loads and the console shows no errors.
2. Quick race on each of the 12 tracks: the scene loads and the default
   camera matches `legacy/original-export.html` (open it side by side).
3. The car drives (arrow keys), the HUD speed rises, and AI cars race.
4. Pit stop: press `P`, drive into the pit lane, the pit menu appears, and
   "Go" and "Skip" both work.
5. Championship, time trial, standings, pause/restart/quit, and the `#carview`
   page.
6. 2D fallback: open the game in a browser with WebGL turned off and
   confirm the 2D canvas renderer runs.
7. `npm run build`, then double-click `dist/index.html` with the network
   off.

## Left alone

- `Racing Game/`: a stray nested git repo (only `.gitattributes`), ignored in
  `.gitignore`.
- `.claude/` (Claude Code's local settings, untracked) and `src/.claude/` (an
  empty folder Claude Code created, which git ignores).
- `harness.js` is in `.gitignore` for the old browser test rig, which is
  copied in only while testing.
- No gameplay bugs were found during the move, and none were fixed.

## Changes after the refactor (deliberate)

- **Zandvoort camera:** `zoomK:1.3` added to `src/tracks/zandvoort.js`. The
  original framed it too far out because the track is narrow (13.4 m) and had
  no close-up factor. It now uses the same per-track `zoomK` mechanism as
  Monaco (1.45) and Las Vegas (0.8).

# Suzuka: the real circuit, and how the game's layout compares

Researched 2026-10-03 for the Suzuka greenery work. Nothing in the layout,
elevation, banking or pit settings was changed because of what follows. Every
mismatch below is waiting for a decision.

## What the real circuit is

Sources: Wikipedia (*Suzuka International Racing Course*), OpenStreetMap
raceway ways (queried through Overpass, chained into one lap), SRTM 30 m and
ASTER 30 m heights through OpenTopoData, and the Mie Prefecture tea pages.

- **Layout.** 5.807 km, 18 turns, run clockwise. It is a figure of eight: the
  1.2 km back straight runs over the first part of the lap on an overpass. The
  OSM ways chain into a 5,796 m loop, so the map agrees to within 0.2 %.
- **Corners, in order** (OSM names in brackets where the sponsor name differs):
  Turn 1 and Turn 2 (First / Second Turn), the S Curves (Esses), the Gyaku
  (reverse-bank) Curve, Dunlop Curve (mapped as "NIPPO Corner"), Degner 1 and
  Degner 2, under the bridge, the Hairpin (NISSIN Brake Hairpin), the long
  right (200R), Spoon Curve (two left apexes), the West/back straight, over the
  bridge, 130R (left), the Casio Triangle chicane (mapped as "Hitachi Astemo
  Chicane"), the last right, then the main straight.
- **The crossover.** The OSM way just before 130R carries `bridge=yes,
  layer=1`, so the back straight goes over. The road underneath is the link
  from Degner 2 to the Hairpin.
- **Pits and park.** The pit lane runs along the right-hand side of the main
  straight, the same side Turn 1 turns towards. The Ferris wheel ("Circuit
  Wheel", サーキットホイール) stands about 140 m to the left of the start of the
  main straight, inside the Motopia amusement park. Motopia covers the area
  north-east of the main straight, behind the main grandstand, across the
  track from the pits.
- **Height.** F1 teams quote about 40 m of elevation change. The SRTM samples
  along the lap agree. They are noisy because SRTM measures the top of the
  trees, so read these as ±5 m:
  - main straight about 50 m, falling to Turn 1 and Turn 2 (about 20 m)
  - the low point is Turn 2 and the entry to the Esses, about 16–20 m
  - the first sector **climbs** through the Esses to Dunlop (about 40 m) and
    Degner (about 45 m)
  - the Hairpin is about level with Degner (about 44 m)
  - it climbs again through 200R to Spoon, the highest part of the lap (about
    55–60 m)
  - the back section **drops** gently along the back straight and through 130R
    (about 47–50 m), and the chicane and main straight are about 50 m
- **Surroundings.** OSM around the circuit is mostly `landuse=forest` and
  `natural=wood` (about 130 polygons), with 54 scrub patches. Ponds sit in the
  infield and around Motopia, there are drains east of the first sector, and
  streams run in the valleys to the south. Farmland lies further out to the
  east, west and north, with a few orchards to the south-east. Suzuka City is
  an Ise-cha (kabuse tea) growing area at the foot of the Suzuka mountain
  range to the west, with Ise Bay to the east.
- **Sakura.** Since 2024 the Japanese GP has been held in early April, and the
  cherry blossom season is part of the race's look.

## Not confirmed

- **Tree species.** OSM does not say what grows in the woods. Planted sugi
  (cedar) and hinoki (cypress), with secondary broadleaf and bamboo, is typical
  of Mie lowland hills, but I could not confirm it for the circuit grounds.
- **The Ferris wheel's height and diameter.** I found no published figure. It
  is built at about 50 m.
- **Run-off surfaces.** Where the real circuit has gravel and where it has
  asphalt, corner by corner, was not confirmed from a primary source. Wikipedia
  only gives Dunlop's run-off growing from 12 m to 25 m.
- **Paddies and tea fields.** Their exact positions round the circuit were not
  confirmed (OSM farmland is not tagged with crops). Where they are placed in
  the game is invented.
- **Streams and ditches.** Their exact courses were not used either. The pond
  and ditch in the game are placed by eye.

## The layout: rebuilt from the survey (fixed 2026-10-03, on request)

Suzuka used to be built from the turtle DSL. Against the OSM centreline it was
274 m RMS off, and it had five problems:
1. **Mirrored.** The DSL's turtle treats y as pointing up, but the game draws y
   pointing south, so the lap ran counter-clockwise on screen. This still
   applies to every other DSL-built circuit.
2. **Two wrong crossings.** Degner went over 200R, and 130R went over the
   stretch after Turn 2.
3. **Proportions.** Every radius was stretched ×1.516, for example "130R" at
   199 m.
4. **Heights.** A 26 m range, with the Hairpin at the bottom of the lap.
5. **Set dressing.** The grandstand and the wheel were on the pit side.

It is now built like Silverstone and Zandvoort, from a survey baked into
`src/tracks/survey/suzuka.js`:

- **Path.** The OSM raceway ways chained into one lap: 731 points, x east and
  y south, clockwise, starting at the line. Long map segments are split to
  10 m, so the spline cannot overshoot; the 242 m run under the bridge to the
  Hairpin had made a cusp at Degner 2. Built with `smooth:3`, the lap comes out
  at 5,808 m (real: 5,807 m). Lined up against the OSM centreline it is now
  **2.4 m RMS** off, with no rotation and no mirroring.
- **Heights.** The GSI 5 m laser DEM (bare earth), every 25 m: 231 samples,
  17.1–57.8 m above sea level, used as 0–40.7 m over the lowest point.
  - The main straight falls about 38 m from the chicane to Turn 1, the lowest
    point.
  - The Esses climb to Dunlop and Degner.
  - The Hairpin is level with Degner.
  - Spoon is the top of the lap.
  - The back straight drops gently through 130R.
- **One crossing**, at lap 0.808–0.831. The back straight goes over the
  Degner→Hairpin link (49.6 m against 43.5 m in the DEM, with the builder's
  usual bump to 8.5 m clearance), and the 3D world gives it an open span on
  piers.
- **Pits** on the right, as mapped: in just after the chicane (0.9227), out at
  Turn 1 (0.077). The box is the default. Width and gap are unchanged.
- **Corners**, by lap fraction from the line:
  - Turn 1 0.077–0.102, Turn 2 0.107–0.129
  - S Curves 0.154–0.219, Gyaku 0.226–0.253, Dunlop 0.263–0.327
  - Degner 1 0.364, Degner 2 0.390
  - Hairpin 0.468–0.481, Spoon 0.622–0.670, West straight 0.670–0.816
  - 130R 0.823–0.861, chicane 0.897–0.917
- **Gravel zones and grandstands** were re-keyed to those corners and the
  outside of each.
  - Stands are asked for at 30 m off the centreline. The scene placer needs
    half width + 20 m, so at the old 24 m every stand had been pushed out to
    50–70 m.
  - The main stand is 200 m wide (it was 240), so it clears the final curve.
  - The chicane stand moved to the 130R exit, where it fits.
- **The Ferris wheel** stands where OSM maps it, 88 m left of the main straight
  at lap 0.959 (within 2 m).
- **Not surveyed.** The start line is put half way along the pit lane. OSM
  has no line node, so this is a guess.
- **Lap feel.** An AI car laps the real circuit in about 103.5 s, against about
  95 s on the old DSL layout. The real corners are tighter than the stretched
  ones were.
- **Best laps.** Stored best laps for Suzuka were set on the old layout.

# Suzuka greenery (2026-10-03)

## What was built

The world lives in `src/render3d/worlds/suzuka.js`. Everything it decides is in
`suzuka-plan.js`, which is pure JS (no three.js, no DOM), so the plan and its
clearance audit run in Node.

- **Ground.** A vertex-coloured terrain grid at 8 m, split into 90 tiles so it
  can be culled. Near the circuit, the height comes from the road itself,
  interpolated along each segment (not snapped to the nearest node). Further
  out it eases into an inverse-distance blend of the lap's heights, then rolling
  hills (low-frequency noise growing with distance) and a gentle rise away from
  the track. It is smoothed three times; the verges stay exact. Where two
  different parts of the lap are close, the lower road keeps its ground out
  past one grid diagonal, so no ground triangle can climb onto its verge. That
  happens at the crossing and where 200R runs beside the West straight. A
  segment of the same stretch of road (within 14 nodes) never counts.
- **Ground colour.**
  - open grass in two greens, with mown fresh green near the track
  - darker forest floor wherever trees were actually planted
  - canopy colour further out, past where trees are thinned out
  - mossy banks on slopes, bare earth or a concrete cut where it is very steep
  - worn dirt and gravel patches
  - paddock grey behind the pits
  - paddy bunds and tea-field soil
  - a world-space grain over all of it
- **Verges.** Mown stripes over the plain run-off and the 6 m grass strip past
  it, plus a 2 m tarmac apron behind the kerbs.
- **Trees.** Each species is low-poly and coloured per vertex: darker
  underneath, lighter on top, with a lighter trunk.
  - sugi (4 tiers) and hinoki (3 rounder tiers) make up most of the forest
  - broadleaf (3 lumps, 3 tint families)
  - sakura (a forked trunk and a wide pink-white cloud)
  - momiji (red, orange or spring green)
  - bamboo clumps on banks and forest edges

  Every instance varies in height, width and rotation. It gets a tint from its
  species' range, and leans slightly downhill on a slope. One shared material
  takes the tint only where the vertex mask says so, so trunks keep their
  colour, and adds a gentle wind sway.
- **Forest structure.** Groves and clearings come from low-frequency noise.
  - Belts thicken behind the barriers and thin toward the track.
  - Taller conifer plantations stand on higher ground, with mixed broadleaf
    lower down.
  - The back section (lap 0.62–0.87, Spoon to 130R) starts closer and denser.
  - Where things are on the lap comes from `zones` in the track definition.
  - Density falls to 62 % past 230 m from the barrier, 30 % past 430 m and none
    past 600 m. Past 230 m the trees use a cheaper model with no shadow. The
    overhead camera never sees much more than about 450 m off the track.
- **Sakura** are planted only in clusters:
  - behind the main grandstands and on into the park
  - an avenue down the back straight
  - round every other grandstand
  - pairs along the park paths
- **Lower planting.** Azalea runs along the fences in front of the crowds,
  down the main straight and through the back section, in pink, white and
  red. There are shrubs on the verges, wild flowers in clearings and
  flowering hedges along the park paths.
- **Farmland, 170–520 m out.** About 40 flooded paddies, each levelled into
  its own terrace, and tea fields of rounded rows laid along the contour.
- **Water.** A pond in the first sector's infield, and a drainage ditch out of
  it behind the verge. The pond sits at the low point, so a stream had nowhere
  to run.
- **The park (Motopia-style, made-up).** It sits across the main straight from
  the pits, behind the main grandstands, round the Ferris wheel at its mapped
  spot.
  - pavilions with dark hip roofs and deep eaves, kiosks and a carousel
  - gravel paths linking them to the grandstands
  - paper lanterns, and nobori banners in plain colours with no text
  - a 52 m Ferris wheel facing the camera, turning once every 5 minutes, with
    gondolas that hang level. It fades out of the way like the other big props.
- **Bridges and walls.** Where a road stands clear of the ground is decided
  from the ground actually under it, not from the track's bridge flag.
  - Over the other road's tarmac, it gets an open span: slab, fascia, a red
    band, parapet, pier caps and columns. That is only the real crossing.
  - Elsewhere it gets a retaining wall down each side to the ground: the
    crossing's approaches, 200R above the West straight, and short low walls by
    Turn 2 and the Hairpin.
- **Camera towers** (scaffold, platform, hut) stand among the trees outside
  the Esses, Dunlop, Degner, Hairpin, Spoon, 130R and the chicane, where they
  fit.
- **Gravel traps** (`runoffZones`) sit on the outside of Turn 1 and 2 (asphalt
  then gravel), Dunlop, Degner 1 and 2, Spoon, and 130R (asphalt then gravel).
  Widths are unchanged, so the barriers did not move.
- **Atmosphere.** A warmer sun (`#FFEBCF`, 1.12), a warmer green hemisphere
  ground colour, and a blue-grey haze. The fog now starts 60 m in front of the
  camera's target distance instead of 120 m behind it, and builds over 2,550 m
  instead of 1,700 m. That is about 9 % haze at the top of the frame and none
  at the bottom.
- **Petals.** 700 cherry petals (one draw) drift round the groves nearest the
  car. They are off on "Lite".
- **Quality setting.** The existing *Full detail / Lite* option (`CFG.detail`)
  now also controls Suzuka's planting. Lite has about 56 % of the trees, half
  the tea, no wild flowers and no petals.

## Changes outside the Suzuka files

- `src/tracks/build.js`: a new run-off surface code, `plain` (6). `surfAt`
  returns `"runoff"` for it.
- `src/car/physics.js`: `"runoff"` maps to `SURF.runoff`. Suzuka's grip
  everywhere outside the five gravel zones is therefore exactly what it was;
  only the gravel zones are new. No other circuit uses `plain`.
- `src/render3d/build.js`:
  - Suzuka brings its own ground (no generic plane, land patches or hillside
    walls), and its `only2d` props are skipped in 3D.
  - Plain run-off gets a tarmac apron.
  - It calls `SUZUKA.build`.
- `src/render3d/frame.js`: calls `SUZUKA.frame`. A world may set `fogNear` and
  `fogSpanK` (both reset on every build). The camera code is untouched.
- `src/tracks/suzuka.js`: now the surveyed path, heights and pits
  (`path`, `elev`, `smooth:3`, `pit`).
  - `world:"suzuka"`, `runoffSurf:"plain"`, the gravel zones and `zones`
  - the old prop trees, Ferris wheel and funfair are `only2d`, so the 2D
    fallback still has them
  - the scene is re-keyed to the real corners
  - the old DSL is kept as `layoutDSL`, unused
- `src/tracks/survey/suzuka.js`: new, the baked lap and heights.

## Checks (Node, no browser), on the surveyed lap

- **Clearance audit** (`auditSuzuka`), exact distance to every segment of the
  lap: of 44,300 plants (Lite: about 25,000), **0** are on the track, **0** in
  the run-off, **0** within 2.5 m past a barrier, **0** in a footprint
  (grandstands, marshal posts, pylons, billboards, arches, pit building,
  garages, park, wheel, towers, pond) and **0** within 3 m of the racing line.
  The closest is a shrub 3.9 m past the armco.
- **Ground against the road ribbons**, 30,710 samples across every node, read
  triangle by triangle as the mesh draws it: **0** where the ground comes
  through a ribbon, **0** where a verge floats unsupported.
- **Gravel zones**: all five are on the outside of their corners. None is on
  the bridge.
- **An AI car** (headless, same `driveAI` and `Car.step` as the game) did three
  laps: 103.4 s, 103.6 s and 104.0 s, with 0 s off the road and 0 s in gravel.
  It never stalled or wrecked, and its lowest speed was 21 m/s (the Hairpin).
- **Build time**: the plan takes about 0.4–0.5 s and the whole Suzuka world
  about 0.5–0.6 s.
- **Every other circuit builds exactly as before.** Same mesh, instanced-chunk,
  instance, triangle and shadow-caster counts as `main`, all 11 of them.
- `npm run build` gives one `dist/index.html` (3.17 MB).
- **Scene census.** Draws and triangles that fall in a 340 × 260 m window round
  each named corner, roughly the default view. World matrices are updated
  first; an earlier version of this table was wrong without that. For
  instanced meshes, only the instances inside the window are counted.
  "Before" is `main`, on the old layout at its own corner positions; "after" is
  the surveyed lap.

| View | before | after, Full detail | after, Lite |
|---|---|---|---|
| Main straight | 196 / 73k | 156 / 80k | 147 / 69k |
| Esses | 131 / 77k | 149 / 106k | 139 / 82k |
| Degner | 116 / 76k | 166 / 123k | 159 / 89k |
| Hairpin | 119 / 70k | 112 / 128k | 102 / 91k |
| Spoon | 96 / 70k | 135 / 156k | 124 / 112k |
| 130R | 144 / 73k | 200 / 122k | 196 / 95k |
| Casio | 159 / 75k | 153 / 66k | 144 / 57k |

The "before" figures include the old single ground plane (45k triangles),
which was always drawn whole. Part of the extra draws at Degner and 130R are
the generic armco posts, one mesh each, as on every armco circuit: on the real
lap there is more road in those windows.

## Not done here: browser testing

These could not be run from the coding session. The sandbox stops local dev
servers, and the Chrome extension isn't available on this machine. Please
check:

1. `npm run dev`: the title screen loads and the console shows no errors.
2. Quick race on each of the 12 tracks: the scene loads and the default
   camera matches `legacy/original-export.html` (open it side by side).
3. The car drives (arrow keys), the HUD speed rises, and AI cars race.
4. Pit stop: press `P`, drive into the pit lane, the pit menu appears, and
   "Go" and "Skip" both work.
5. Championship, time trial, standings, pause/restart/quit, and the `#carview`
   page.
6. 2D fallback: open the game in a browser with WebGL turned off and
   confirm the 2D canvas renderer runs.
7. `npm run build`, then double-click `dist/index.html` with the network
   off.

## Left alone

- `Racing Game/`: a stray nested git repo (only `.gitattributes`), ignored in
  `.gitignore`.
- `.claude/` (Claude Code's local settings, untracked) and `src/.claude/` (an
  empty folder Claude Code created, which git ignores).
- `harness.js` is in `.gitignore` for the old browser test rig, which is
  copied in only while testing.
- No gameplay bugs were found during the move, and none were fixed.

## Changes after the refactor (deliberate)

- **Zandvoort camera:** `zoomK:1.3` added to `src/tracks/zandvoort.js`. The
  original framed it too far out because the track is narrow (13.4 m) and had
  no close-up factor. It now uses the same per-track `zoomK` mechanism as
  Monaco (1.45) and Las Vegas (0.8).

# Suzuka: the real circuit, and how the game's layout compares

Researched 2026-10-03 for the Suzuka greenery work. Nothing in the layout,
elevation, banking or pit settings was changed because of what follows. Every
mismatch below is waiting for a decision.

## What the real circuit is

Sources: Wikipedia (*Suzuka International Racing Course*), OpenStreetMap
raceway ways (queried through Overpass, chained into one lap), SRTM 30 m and
ASTER 30 m heights through OpenTopoData, and the Mie Prefecture tea pages.

- **Layout.** 5.807 km, 18 turns, run clockwise. It is a figure of eight: the
  1.2 km back straight runs over the first part of the lap on an overpass. The
  OSM ways chain into a 5,796 m loop, so the map agrees to within 0.2 %.
- **Corners, in order** (OSM names in brackets where the sponsor name differs):
  Turn 1 and Turn 2 (First / Second Turn), the S Curves (Esses), the Gyaku
  (reverse-bank) Curve, Dunlop Curve (mapped as "NIPPO Corner"), Degner 1 and
  Degner 2, under the bridge, the Hairpin (NISSIN Brake Hairpin), the long
  right (200R), Spoon Curve (two left apexes), the West/back straight, over the
  bridge, 130R (left), the Casio Triangle chicane (mapped as "Hitachi Astemo
  Chicane"), the last right, then the main straight.
- **The crossover.** The OSM way just before 130R carries `bridge=yes,
  layer=1`, so the back straight goes over. The road underneath is the link
  from Degner 2 to the Hairpin.
- **Pits and park.** The pit lane runs along the right-hand side of the main
  straight, the same side Turn 1 turns towards. The Ferris wheel ("Circuit
  Wheel", サーキットホイール) stands about 140 m to the left of the start of the
  main straight, inside the Motopia amusement park. Motopia covers the area
  north-east of the main straight, behind the main grandstand, across the
  track from the pits.
- **Height.** F1 teams quote about 40 m of elevation change. The SRTM samples
  along the lap agree. They are noisy because SRTM measures the top of the
  trees, so read these as ±5 m:
  - main straight about 50 m, falling to Turn 1 and Turn 2 (about 20 m)
  - the low point is Turn 2 and the entry to the Esses, about 16–20 m
  - the first sector **climbs** through the Esses to Dunlop (about 40 m) and
    Degner (about 45 m)
  - the Hairpin is about level with Degner (about 44 m)
  - it climbs again through 200R to Spoon, the highest part of the lap (about
    55–60 m)
  - the back section **drops** gently along the back straight and through 130R
    (about 47–50 m), and the chicane and main straight are about 50 m
- **Surroundings.** OSM around the circuit is mostly `landuse=forest` and
  `natural=wood` (about 130 polygons), with 54 scrub patches. Ponds sit in the
  infield and around Motopia, there are drains east of the first sector, and
  streams run in the valleys to the south. Farmland lies further out to the
  east, west and north, with a few orchards to the south-east. Suzuka City is
  an Ise-cha (kabuse tea) growing area at the foot of the Suzuka mountain
  range to the west, with Ise Bay to the east.
- **Sakura.** Since 2024 the Japanese GP has been held in early April, and the
  cherry blossom season is part of the race's look.

## Not confirmed

- **Tree species.** OSM does not say what grows in the woods. Planted sugi
  (cedar) and hinoki (cypress), with secondary broadleaf and bamboo, is typical
  of Mie lowland hills, but I could not confirm it for the circuit grounds.
- **The Ferris wheel's height and diameter.** I found no published figure. It
  is built at about 50 m.
- **Run-off surfaces.** Where the real circuit has gravel and where it has
  asphalt, corner by corner, was not confirmed from a primary source. Wikipedia
  only gives Dunlop's run-off growing from 12 m to 25 m.
- **Paddies and tea fields.** Their exact positions round the circuit were not
  confirmed (OSM farmland is not tagged with crops). Where they are placed in
  the game is invented.
- **Streams and ditches.** Their exact courses were not used either. The pond
  and ditch in the game are placed by eye.

## The layout: rebuilt from the survey (fixed 2026-10-03, on request)

Suzuka used to be built from the turtle DSL. Against the OSM centreline it was
274 m RMS off, and it had five problems:
1. **Mirrored.** The DSL's turtle treats y as pointing up, but the game draws y
   pointing south, so the lap ran counter-clockwise on screen. This still
   applies to every other DSL-built circuit.
2. **Two wrong crossings.** Degner went over 200R, and 130R went over the
   stretch after Turn 2.
3. **Proportions.** Every radius was stretched ×1.516, for example "130R" at
   199 m.
4. **Heights.** A 26 m range, with the Hairpin at the bottom of the lap.
5. **Set dressing.** The grandstand and the wheel were on the pit side.

It is now built like Silverstone and Zandvoort, from a survey baked into
`src/tracks/survey/suzuka.js`:

- **Path.** The OSM raceway ways chained into one lap: 731 points, x east and
  y south, clockwise, starting at the line. Long map segments are split to
  10 m, so the spline cannot overshoot; the 242 m run under the bridge to the
  Hairpin had made a cusp at Degner 2. Built with `smooth:3`, the lap comes out
  at 5,808 m (real: 5,807 m). Lined up against the OSM centreline it is now
  **2.4 m RMS** off, with no rotation and no mirroring.
- **Heights.** The GSI 5 m laser DEM (bare earth), every 25 m: 231 samples,
  17.1–57.8 m above sea level, used as 0–40.7 m over the lowest point.
  - The main straight falls about 38 m from the chicane to Turn 1, the lowest
    point.
  - The Esses climb to Dunlop and Degner.
  - The Hairpin is level with Degner.
  - Spoon is the top of the lap.
  - The back straight drops gently through 130R.
- **One crossing**, at lap 0.808–0.831. The back straight goes over the
  Degner→Hairpin link (49.6 m against 43.5 m in the DEM, with the builder's
  usual bump to 8.5 m clearance), and the 3D world gives it an open span on
  piers.
- **Pits** on the right, as mapped: in just after the chicane (0.9227), out at
  Turn 1 (0.077). The box is the default. Width and gap are unchanged.
- **Corners**, by lap fraction from the line:
  - Turn 1 0.077–0.102, Turn 2 0.107–0.129
  - S Curves 0.154–0.219, Gyaku 0.226–0.253, Dunlop 0.263–0.327
  - Degner 1 0.364, Degner 2 0.390
  - Hairpin 0.468–0.481, Spoon 0.622–0.670, West straight 0.670–0.816
  - 130R 0.823–0.861, chicane 0.897–0.917
- **Gravel zones and grandstands** were re-keyed to those corners and the
  outside of each.
  - Stands are asked for at 30 m off the centreline. The scene placer needs
    half width + 20 m, so at the old 24 m every stand had been pushed out to
    50–70 m.
  - The main stand is 200 m wide (it was 240), so it clears the final curve.
  - The chicane stand moved to the 130R exit, where it fits.
- **The Ferris wheel** stands where OSM maps it, 88 m left of the main straight
  at lap 0.959 (within 2 m).
- **Not surveyed.** The start line is put half way along the pit lane. OSM
  has no line node, so this is a guess.
- **Lap feel.** An AI car laps the real circuit in about 103.5 s, against about
  95 s on the old DSL layout. The real corners are tighter than the stretched
  ones were.
- **Best laps.** Stored best laps for Suzuka were set on the old layout.

# Suzuka greenery (2026-10-03)

## What was built

The world lives in `src/render3d/worlds/suzuka.js`. Everything it decides is in
`suzuka-plan.js`, which is pure JS (no three.js, no DOM), so the plan and its
clearance audit run in Node.

- **Ground.** A vertex-coloured terrain grid at 8 m, split into 90 tiles so it
  can be culled. Near the circuit, the height comes from the road itself,
  interpolated along each segment (not snapped to the nearest node). Further
  out it eases into an inverse-distance blend of the lap's heights, then rolling
  hills (low-frequency noise growing with distance) and a gentle rise away from
  the track. It is smoothed three times; the verges stay exact. Where two
  different parts of the lap are close, the lower road keeps its ground out
  past one grid diagonal, so no ground triangle can climb onto its verge. That
  happens at the crossing and where 200R runs beside the West straight. A
  segment of the same stretch of road (within 14 nodes) never counts.
- **Ground colour.**
  - open grass in two greens, with mown fresh green near the track
  - darker forest floor wherever trees were actually planted
  - canopy colour further out, past where trees are thinned out
  - mossy banks on slopes, bare earth or a concrete cut where it is very steep
  - worn dirt and gravel patches
  - paddock grey behind the pits
  - paddy bunds and tea-field soil
  - a world-space grain over all of it
- **Verges.** Mown stripes over the plain run-off and the 6 m grass strip past
  it, plus a 2 m tarmac apron behind the kerbs.
- **Trees.** Each species is low-poly and coloured per vertex: darker
  underneath, lighter on top, with a lighter trunk.
  - sugi (4 tiers) and hinoki (3 rounder tiers) make up most of the forest
  - broadleaf (3 lumps, 3 tint families)
  - sakura (a forked trunk and a wide pink-white cloud)
  - momiji (red, orange or spring green)
  - bamboo clumps on banks and forest edges

  Every instance varies in height, width and rotation. It gets a tint from its
  species' range, and leans slightly downhill on a slope. One shared material
  takes the tint only where the vertex mask says so, so trunks keep their
  colour, and adds a gentle wind sway.
- **Forest structure.** Groves and clearings come from low-frequency noise.
  - Belts thicken behind the barriers and thin toward the track.
  - Taller conifer plantations stand on higher ground, with mixed broadleaf
    lower down.
  - The back section (lap 0.62–0.87, Spoon to 130R) starts closer and denser.
  - Where things are on the lap comes from `zones` in the track definition.
  - Density falls to 62 % past 230 m from the barrier, 30 % past 430 m and none
    past 600 m. Past 230 m the trees use a cheaper model with no shadow. The
    overhead camera never sees much more than about 450 m off the track.
- **Sakura** are planted only in clusters:
  - behind the main grandstands and on into the park
  - an avenue down the back straight
  - round every other grandstand
  - pairs along the park paths
- **Lower planting.** Azalea runs along the fences in front of the crowds,
  down the main straight and through the back section, in pink, white and
  red. There are shrubs on the verges, wild flowers in clearings and
  flowering hedges along the park paths.
- **Farmland, 170–520 m out.** About 40 flooded paddies, each levelled into
  its own terrace, and tea fields of rounded rows laid along the contour.
- **Water.** A pond in the first sector's infield, and a drainage ditch out of
  it behind the verge. The pond sits at the low point, so a stream had nowhere
  to run.
- **The park (Motopia-style, made-up).** It sits across the main straight from
  the pits, behind the main grandstands, round the Ferris wheel at its mapped
  spot.
  - pavilions with dark hip roofs and deep eaves, kiosks and a carousel
  - gravel paths linking them to the grandstands
  - paper lanterns, and nobori banners in plain colours with no text
  - a 52 m Ferris wheel facing the camera, turning once every 5 minutes, with
    gondolas that hang level. It fades out of the way like the other big props.
- **Bridges and walls.** Where a road stands clear of the ground is decided
  from the ground actually under it, not from the track's bridge flag.
  - Over the other road's tarmac, it gets an open span: slab, fascia, a red
    band, parapet, pier caps and columns. That is only the real crossing.
  - Elsewhere it gets a retaining wall down each side to the ground: the
    crossing's approaches, 200R above the West straight, and short low walls by
    Turn 2 and the Hairpin.
- **Camera towers** (scaffold, platform, hut) stand among the trees outside
  the Esses, Dunlop, Degner, Hairpin, Spoon, 130R and the chicane, where they
  fit.
- **Gravel traps** (`runoffZones`) sit on the outside of Turn 1 and 2 (asphalt
  then gravel), Dunlop, Degner 1 and 2, Spoon, and 130R (asphalt then gravel).
  Widths are unchanged, so the barriers did not move.
- **Atmosphere.** A warmer sun (`#FFEBCF`, 1.12), a warmer green hemisphere
  ground colour, and a blue-grey haze. The fog now starts 60 m in front of the
  camera's target distance instead of 120 m behind it, and builds over 2,550 m
  instead of 1,700 m. That is about 9 % haze at the top of the frame and none
  at the bottom.
- **Petals.** 700 cherry petals (one draw) drift round the groves nearest the
  car. They are off on "Lite".
- **Quality setting.** The existing *Full detail / Lite* option (`CFG.detail`)
  now also controls Suzuka's planting. Lite has about 56 % of the trees, half
  the tea, no wild flowers and no petals.

## Changes outside the Suzuka files

- `src/tracks/build.js`: a new run-off surface code, `plain` (6). `surfAt`
  returns `"runoff"` for it.
- `src/car/physics.js`: `"runoff"` maps to `SURF.runoff`. Suzuka's grip
  everywhere outside the five gravel zones is therefore exactly what it was;
  only the gravel zones are new. No other circuit uses `plain`.
- `src/render3d/build.js`:
  - Suzuka brings its own ground (no generic plane, land patches or hillside
    walls), and its `only2d` props are skipped in 3D.
  - Plain run-off gets a tarmac apron.
  - It calls `SUZUKA.build`.
- `src/render3d/frame.js`: calls `SUZUKA.frame`. A world may set `fogNear` and
  `fogSpanK` (both reset on every build). The camera code is untouched.
- `src/tracks/suzuka.js`: now the surveyed path, heights and pits
  (`path`, `elev`, `smooth:3`, `pit`).
  - `world:"suzuka"`, `runoffSurf:"plain"`, the gravel zones and `zones`
  - the old prop trees, Ferris wheel and funfair are `only2d`, so the 2D
    fallback still has them
  - the scene is re-keyed to the real corners
  - the old DSL is kept as `layoutDSL`, unused
- `src/tracks/survey/suzuka.js`: new, the baked lap and heights.

## Checks (Node, no browser)

- **Clearance audit** (`auditSuzuka`), exact distance to every segment of the
  lap: of 42,452 plants (Lite: 23,853), **0** are on the track, **0** in the
  run-off, **0** within 2.5 m past a barrier, **0** in a footprint (grandstands,
  marshal posts, pylons, billboards, arches, pit building, garages, park,
  towers, pond) and **0** within 3 m of the racing line. The closest is an
  azalea 3.95 m past the armco.
- **Ground against the road ribbons**, 30,710 samples across every node:
  ground is above a ribbon at 9 samples, worst 0.48 m, at the outer edge of the
  grass verge by the Hairpin. Unsupported floating verge (more than 1.4 m over
  the ground with no wall or span under it) at 2 samples.
- **Build time**: the plan takes about 0.4–0.5 s and the whole Suzuka world
  about 0.5–0.6 s.
- **Every other circuit builds exactly as before.** Same mesh, instanced-chunk,
  instance, triangle and shadow-caster counts as `main`, all 11 of them.
- **Scene census.** Draws and triangles that fall in a 340 × 260 m window round
  each point, roughly the default view. For instanced meshes, only the
  instances inside the window are counted.

| View | before | after, Full detail | after, Lite |
|---|---|---|---|
| Main straight | 170 / 73k | 204 / 62k | 200 / 61k |
| Esses | 97 / 76k | 110 / 149k | 102 / 103k |
| Degner | 91 / 76k | 96 / 103k | 87 / 76k |
| Hairpin | 83 / 70k | 114 / 97k | 99 / 71k |
| Spoon | 71 / 70k | 93 / 196k | 87 / 139k |
| 130R | 101 / 73k | 131 / 175k | 117 / 128k |
| Casio | 129 / 75k | 103 / 74k | 90 / 62k |

"Before" includes the old single ground plane (45k triangles), which was always
drawn whole.

## Not done

- **Not checked in a browser.** No screenshots, no frame time, no visual
  check: neither the sandbox nor the Chrome extension was available this
  session. This is the next step.
- **No distant ridgelines.** The game's only 3D camera is the fixed 35°
  orthographic overhead one; the TV camera is never switched on. A camera
  like that never shows the horizon, so ridgelines 2–6 km out could never be
  on screen. The "hills" are the terrain the camera does see, which rises and
  rolls away from the track.
- **Materials are `MeshStandardMaterial`, not Lambert.** That is what the whole
  renderer uses (its lighting was calibrated for it). The plants use flat
  shading and vertex colours to keep the stylised look.

# Rain in 3D, and the camera zooming out (2026-10-03)

- **Rain never showed in 3D.** The 2D painter draws rain (a dark wash and
  streaks), but in 3D the only sign of rain was the haze closing in. New:
  `src/render3d/weather.js`, for every circuit. In the wet it draws:
  - falling streaks round the camera, one draw call; up to 4,000 drops, as many
    and as bright as the track is wet
  - a dimmer sun and sky fill
  - a darker, glossier road and darker ground (Silverstone and Zandvoort keep
    their own versions of this)
  - on Suzuka, darker grass, verges and leaves
- **Spray drew as orange sparks.** The 3D renderer drew every particle as one,
  including the wheel spray and tyre smoke. Those now draw as soft puffs in
  their own colours. Nothing changes in the dry.
  - **Checked headless** on Suzuka, Monza and Silverstone, with the real
    `G3.build` and `G3.frame`, dry then wet at 85 %: 3,470 drops in view, the
    sun 1.12 → 0.72, the road ×0.68 and roughness 0.94 → 0.47, spray as puffs.
    **Not yet seen in a browser.**
- **The camera zoomed right out.** The zoom is worked out from the 2D view's
  size (`R.W`, `R.H`). With 3D running, that canvas is hidden and measures
  0 × 0, so any resize after boot (window, fullscreen, browser zoom, dev tools)
  pinned the camera at its widest (4.4 px/m, about 182 m of track top to
  bottom).
  - `R.resize` now measures the game area the canvas sits in.
  - The camera code re-measures if it ever sees a zero size.
  - In a 1280 × 800 window the zoom is back to 14 when slow and 9.3 at 80 m/s
    (about 86 m top to bottom), as designed.

## Crashes and cutscenes

- `src/car/damage.js`: contact geometry (where on the car a hit landed), the dent
  list on `car.dents`, and the `S.fx` queue physics uses to tell the 3D side what
  happened. `physics.js` does the spins (wall brush, over the grip limit) and the
  part loss; `Car.startSpin` is the one place a spin begins.
- `src/render3d/crash.js`: crumples a car's body from its dents (own copy of the
  geometry, cut finer, vertices pushed in and darkened) and runs the flying
  debris. `cine.js`: the slow-motion crash camera, the DNF scene (driver climbs
  out) and the podium scene. `person.js`: the jointed driver model.
- Slow motion is `S.slow`; the session passes `update(dt * S.slow, dt)`.
- These were checked in Node (physics scenarios, mesh and cutscene code with a
  stubbed DOM) but not seen on screen: headless Chrome cannot run the 3D here.

# Track upgrade: Step 0 audit (awaiting approval, nothing in `src/` has been changed)

How the numbers were made: every track was built with the real `buildTrack()` in Node and measured from the
centreline (`T.x/T.y/T.z`). Winding is the signed area plus the net heading change, printed by code, not judged
from a picture. No screenshots were taken: headless Chrome cannot run this game's 3D in the coding sandbox, so
the "weak points" below come from reading the track definition files and need your eye to confirm.

## 0a. Direction and elevation audit

### The direction bug is one bug, not eleven

`turtle()` in `src/tracks/build.js` turns the letter `R` into a NEGATIVE heading change
(`c.t === "R" ? -1 : 1`), but in the physics a right-hand turn is a POSITIVE one (`steer` right gives
`yaw > 0`, `h += yaw`; the 3D car is `rotation.y = -h`, which turns clockwise on screen as `h` grows).
So every circuit built from a `layout:` string is drawn as its own mirror image. The letters themselves are
right: the first corners in the layout strings match the real first corners (Monza R-L chicane, Spa La Source
right hairpin, Vegas T1 left hairpin, COTA T1 left hairpin, Interlagos Senna S left-right). The surveyed
tracks (`path:` from OpenStreetMap: Monaco, Silverstone, Zandvoort, Suzuka) are not affected and are correct.

Calibration: the three surveyed tracks with a known real direction (Monaco, Silverstone, Zandvoort, all
clockwise) have positive net turn, so positive = clockwise on screen, which agrees with the physics reading.

| Track | Real direction (source) | Game winding (area / net turn) | Game direction | Verdict |
|---|---|---|---|---|
| Monaco | clockwise ([Wikipedia list of F1 circuits](https://en.wikipedia.org/wiki/List_of_Formula_One_circuits)) | +110136 / +360 | clockwise | correct (surveyed) |
| Singapore | anti-clockwise (same list) | +1242212 / +360 | clockwise | WRONG (mirrored) |
| Las Vegas | anti-clockwise (same list) | +1998649 / +360 | clockwise | WRONG (mirrored) |
| Baku | anti-clockwise (same list; I expected clockwise from memory, the list says otherwise, I used the list) | +1643286 / +360 | clockwise | WRONG (mirrored) |
| Silverstone | clockwise (not in the Wikipedia table; widely known; matches the OSM survey) | +823589 / +360 | clockwise | correct (surveyed) |
| Spa | clockwise (same list) | -1110045 / -360 | anti-clockwise | WRONG (mirrored) |
| Monza | clockwise (same list) | -867586 / -360 | anti-clockwise | WRONG (mirrored) |
| Zandvoort | clockwise (same list) | +226179 / +360 | clockwise | correct (surveyed) |
| Suzuka | figure-of-eight, main loop clockwise (not in the table; the list notes the crossover) | +123102 / 0 | figure-of-eight, one crossing | correct (surveyed; first-corner order to be re-checked in step G) |
| Interlagos | anti-clockwise (same list) | +899685 / +360 | clockwise | WRONG (mirrored) |
| COTA | anti-clockwise (same list) | +1470453 / +360 | clockwise | WRONG (mirrored) |
| Mexico City | clockwise (same list; one search summary said anti-clockwise, the table itself says clockwise, I used the table) | -401258 / -360 | anti-clockwise | WRONG (mirrored) |

So 8 of 12 are wrong and all 8 are the layout-string tracks. Proposed fix, to be made ONCE in `turtle()`
and `buildTrack()`: flip the sign. This IS a mirror, and I want you to confirm that is what you want, because
your brief says not to just mirror. The reason it is right here: the corner letters are already in the real
order and the real handedness, only the renderer flipped them, so mirroring puts the game on the real circuit.
Reversing the driving order instead would run the real circuit backwards, which is also wrong.

Everything that stores a side as a raw sign has to flip in the same commit, otherwise pit lanes, run-off and
scenery end up on the wrong side after the flip: `pit` side, `runoffZones` (`ls/rs/lt/rt`), `side:1/-1`
entries in `scene` (not the `"in"/"out"` ones, those are relative and follow the corner), banking sign, and
the `side:-1` pit buildings. Elevation is a function of lap fraction `u`, which a mirror does not change, so
no elevation profile needs re-ordering because of the flip.

### Elevation

Current profiles are `def.elev(u)` functions of lap fraction. Measured vs real:

| Track | Real range (source) | Game range (min..max, start) | Max gradient | Verdict |
|---|---|---|---|---|
| Monaco | "over 40 m", highest Casino Square, lowest tunnel exit ([search summary of F1 and guide pages](https://www.formula1.com/en/latest/features/2016/10/highs-and-lows---which-f1-track-has-the-most-elevation-changes-.html), page itself not readable) | 42 m (2..44, start 3.5) | 11.6% | roughly right, surveyed DEM |
| Singapore | 5 m ([f1-fansite](https://www.f1-fansite.com/f1-circuits/singapore-circuit/)) | 4.3 m | 7.7% | right range, but 7.7% is steep for a flat city: the Anderson Bridge bump is probably too sharp |
| Las Vegas | 5 m ([f1-fansite](https://www.f1-fansite.com/f1%20circuits/las-vegas-strip-circuit-layout-records/)) | 4 m | 0.4% | right, but it is a plain 2-cycle sine (not real shape) |
| Baku | about 27 m: highest 2.1 m, lowest 24.7 m below sea level ([Wikipedia](https://en.wikipedia.org/wiki/Baku_City_Circuit) via search; the location of the high point is reported as Turn 13 there, which I doubt: the old-town climb is mid-lap) | 30 m, start is the low point | 4.7% | close; peak position to verify |
| Silverstone | 11 m / 37 ft ([lapmeta and others](https://lapmeta.com/es/track/variation/421)) | 14.1 m | 2.8% | 3 m high; seam of 0.14 m at the start line, must wrap exactly |
| Spa | 102 m, Eau Rouge about 17% / 41 m ([F1 article via search](https://www.formula1.com/en/latest/article/highs-and-lows-which-f1-track-has-the-most-elevation-changes-.7I9JEcBw3R2AqXbnJ6hyvc)) | 58 m (12..70) | 16.7% | WRONG: 44 m too flat; sources disagree on where the highest point is (Les Combes vs Malmedy), both sit past mid-lap |
| Monza | 10 m ([f1-fansite](https://www.f1-fansite.com/f1-circuits/autodromo-nazionale-monza/)) | 4 m | 0.7% | too flat, and it is an artificial 3-cycle sine |
| Zandvoort | sources disagree: a lap-gain figure of 32 m appears on lapmeta-style pages, which is probably cumulative climb, not the range; I found no clean range figure | 11.6 m, start 8.8 | 6.1% | unknown, flagged; banked corners are implemented already |
| Suzuka | 40.4 m ([f1-fansite](https://www.f1-fansite.com/f1-circuits/suzuka-circuit/)) | 40.3 m | 9.9% | correct; seam of 0.19 m at the start line |
| Interlagos | 43 m, highest at the start/T1 area, lowest in the lake section ([f1-fansite](https://www.f1-fansite.com/?p=6731)) | 44 m (-10..34), start is the high point | 16.2% | range right; the low point sits at u=0.55, I could not confirm that against a source |
| COTA | 133 ft = 40.5 m; T1 climb 85 ft = 26 m, 11-16% depending on source ([Jalopnik guide, others](https://jalopnik.com/circuit-of-the-americas-a-turn-by-turn-guide-5856083)) | 36 m (2..38) | 15.1% | 4.5 m short; right shape |
| Mexico City | 8 m ([f1-fansite](https://www.f1-fansite.com/?p=78657)); the site is at 2285 m altitude | 2.4 m | 0.4% | too flat, artificial 2-cycle sine |

Seams (height at lap end minus height at start): Silverstone 0.14 m, Suzuka 0.19 m, everything else under
0.05 m. The brief asks for exact wrap, so those two get fixed in the shared elevation system.

Visual exaggeration: there is none today. I suggest one global constant `ELEV_VISUAL = 1.25` (set to 1.0 for
pure real figures), and I will show real and displayed values side by side per track so you can change it.
Where I could not find a reliable profile (Zandvoort range, Interlagos low point, Baku peak position) I will
mark the profile as an estimate in the notes.

## 0b. Weak points (from the definition files, not from screenshots)

- Monaco, Silverstone, Zandvoort, Suzuka, Las Vegas: have their own `worlds/*.js` files, hand-built scenery and
  landmarks. Earlier prompts cover them. Weak: Monaco is by far the heaviest file (2028 lines); Vegas has the
  Strip but a plain sine elevation; Silverstone and Suzuka have the start-line height seam.
- Singapore: 33 scene entries, landmarks are boxes (`mbs`, `artscience`, `merlion` etc. from a kit), no
  working water (Marina Bay is the signature), skyline thin, no Ferris wheel, no Anderson Bridge shape.
- Baku: 30 entries, one tall landmark (`flame`), Old City wall is repeated boxes, no Caspian sea along the
  Boulevard, no real castle-section squeeze visuals, palms are generic.
- Spa: 21 entries, only chalets and a pit building: nothing like the Ardennes; no forest density, no Eau Rouge /
  Raidillon walls and valley, no La Source hairpin hotel, elevation 44 m too flat.
- Monza: 26 entries, trees and grandstands as boxes, banking ruins present (`banking` entries) but small,
  royal-park feel missing, elevation is a sine.
- Interlagos: 25 entries, almost no landmarks (only the pit building), favela facade setting but no hillside
  homes, no lake, no Senna S tyre-wall character; run-off set to 11 everywhere.
- COTA: 23 entries, tower and amphitheatre present, the rest is generic; Texas scrub, flat horizon, no S-curves
  homage visuals.
- Mexico City: 24 entries, grandstands in the Foro Sol area are plain boxes, a baseball stadium box is the only
  landmark, no mountains on the horizon, no volcano haze.
- Across all generic tracks: run-off is one number per track (no per-corner tarmac/gravel/grass mix, except
  Vegas and the surveyed worlds), banking only on Zandvoort, pit lane settings are shared constants
  (`pitbuilding` at u about 0.98 on the same side everywhere), adverts are the same billboard type.

## 0c. Personality sheets (for approval)

Palettes are distinct by design: no two share a dominant hue pair. Times of day are my proposals from the
usual race slots; where I am unsure of a real race time it says so. All names, signs and adverts are fictional.

### Spa (Belgian ardennes)
1. Identity: a deep, damp, evergreen valley where the track plunges and climbs through pine forest.
2. Palette: forest green #1F4A2E, deep spruce #12301F, wet slate #5C6670, lichen yellow-green #8AA23A, mist white #D7DEDC.
3. Light: overcast-bright with a break of low sun; cool white light, soft shadows, sky grey-blue to pale. Real race is mid-afternoon; weather is the point.
4. Atmosphere: low valley mist, fog tint cool grey-green, fog starts close (near 60 m), faint drifting drizzle haze.
5. Signature: Eau Rouge/Raidillon dip and wall of trees, La Source hairpin hotel, long forest straight (Kemmel), Pouhon sweepers, Bus Stop chicane.
6. Crowd: camping-style stands in rain jackets, orange and yellow flags, packed at Eau Rouge and La Source, ponchos animated as a slow wave.
7. Adverts: a waffle brand ("Waffle Wizard: Dough Not Slow"), a chocolate trap ("Cocoa Brakes"), a very long forest-themed tyre pun.
8. Surface/kerbs: darker, rougher asphalt, red-white kerbs, wide grey tarmac run-off at La Source, gravel at Les Combes, armco and tyre walls.
9. Details: cow field, wooden bridge, a mist bank at the valley floor, birds over the forest, camper vans, a hot air balloon.
10. Signature moment: the full-throttle compression through Eau Rouge into the Raidillon crest, camera-less: the height change itself.

### Interlagos (Sao Paulo, Brazil)
1. Identity: a hillside bowl of colourful houses, tropical green and loud local crowd.
2. Palette: sunburnt orange #E8892C, lagoon teal #2FA39B, favela pastel #E7C7A3 and #D9657A, tropical green #3F8F3A, terracotta roof #B5532F.
3. Light: late-afternoon golden hour, warm sun low from one side, medium shadows, humid pale-gold sky. Real race slot is around 14:00-15:00 local, but weather is often changeable; golden hour is a stylistic choice, flagged.
4. Atmosphere: warm haze, orange-tinted fog far away, a hint of thunderheads on the horizon.
5. Signature: Senna S, the lake bowl, a stepped hillside of houses, the Subida dos Boxes climb, the long grandstand wall at the final corner.
6. Crowd: green-yellow-blue shirts, big fictional flag banners, drums, packed and bouncing, strong colour.
7. Adverts: "Café Turbo: wake up in third gear", a fictional insurance firm "Seguro Sobre Rodas, we cover the lap", coconut water "Coco Boost".
8. Surface/kerbs: bumpy warm-grey asphalt, red-white kerbs with sand-yellow edges, grass and tarmac run-off, low armco.
9. Details: hanging laundry, a kite, parrots, a lake with a floating stage, a helicopter, a football on the grass.
10. Signature moment: the downhill plunge out of Senna S into Descida do Lago, with the whole bowl of crowd laid out in front.

### COTA (Austin, Texas)
1. Identity: big-sky Texas ranchland with an observation tower and a hairpin on a hill.
2. Palette: dry grass tan #C8B26A, Texas limestone #E6DCC3, sky blue #4C8FD8, cedar green #4C6B3A, sunset red #D9552B.
3. Light: bright afternoon, high-ish sun, hard shadows, clear deep blue sky with thin cirrus. Real race is early-afternoon; bright midday is correct.
4. Atmosphere: very clear, light dust haze, heat shimmer on the straights, almost no fog.
5. Signature: the observation tower, the uphill Turn 1 hairpin, the esses homage, the Turn 12 stadium bend, the amphitheatre.
6. Crowd: cowboy hats, fictional red-white-blue-and-star flags, big stands, packed at T1.
7. Adverts: "Brisket Boost", a fictional pickup truck "Big Hoss: Fits A Horse", boot shop "Spin Out Boots".
8. Surface/kerbs: pale tan-grey asphalt, red-white kerbs, wide tarmac run-offs, short grass beyond.
9. Details: a cattle herd, a windmill, a longhorn statue, hot-air balloon, a train on the far edge, flags straight out in the wind.
10. Signature moment: the blind climb to Turn 1 with the tower at the top and the whole circuit behind you.

### Monza (Italian royal park)
1. Identity: a speed temple in an ancient park, trees on both sides and a banked ruin from the old track.
2. Palette: park green #3F6B3A, gravel #B8A582, brick red #B34A2C, old stone #A59E8E, sky pale #D6E4EC.
3. Light: warm early-September afternoon, medium sun, soft shadows through the trees, pale blue-white sky. Real race is mid-afternoon; fine.
4. Atmosphere: gentle haze through the trees, warm fog tint, floating pollen specks.
5. Signature: the avenue of tall trees, old banking ruins, the Parabolica sweep, the Lesmo trees, the main-straight grandstands.
6. Crowd: sea of red scarves and flags, packed at the Parabolica exit, flare smoke red.
7. Adverts: "Pasta Power: carbs for corners", fictional espresso "Doppio Boost", a clock firm "Tempo, always on time".
8. Surface/kerbs: grippy dark asphalt, red-white big kerbs, wide gravel run-off, armco.
9. Details: a grand villa, a pigeon flock, cyclists on the park path, hot-air balloon, church bell tower, a vineyard strip.
10. Signature moment: the long full-throttle flat run down the straight with the grandstand wall and then a heavy braking into the first chicane.

### Mexico City (Autodromo Hermanos Rodriguez)
1. Identity: a loud stadium in a mountain-ringed city bowl at high altitude.
2. Palette: marigold #F0A21C, volcanic grey #6A6A72, hot pink #D8467C, jade green #2F8A6A, sky haze #C7D3DD.
3. Light: bright midday at altitude, hard clean light, thin blue sky; at 2285 m the sky is deeper. Real race is early-afternoon; flagged as a choice.
4. Atmosphere: thin smog band at the horizon, volcano haze, almost no fog near the track.
5. Signature: the Foro Sol stadium section, the long main straight, the Peraltada curve remnant, a mountain skyline.
6. Crowd: green-white-red scarves, fictional lucha-mask flags, party lights, dancing, packed in the stadium.
7. Adverts: "Taco Torque", a fictional soft drink "Jarrito Jolt", "Altitude Attitude" an oxygen bar.
8. Surface/kerbs: light grey high-grip asphalt, red-white kerbs, tarmac and grass run-off.
9. Details: confetti, a mariachi stage, a papel picado string, a hot-air balloon, flower beds, a cable car.
10. Signature moment: sweeping through the stadium, where the crowd is on all sides of the car.

### Baku (Azerbaijan)
1. Identity: a medieval walled old town squeezed against a modern skyline and the Caspian shore.
2. Palette: sandstone #D8C39A, Caspian blue #2F7FB8, flame orange #E8742A, tiled turquoise #2FA7A0, carpet red #A8322F.
3. Light: bright late-afternoon (real race is mid-to-late afternoon local), warm light from the west, medium-soft shadows, pale warm sky.
4. Atmosphere: sea haze, warm tint, light wind lifting flags and dust.
5. Signature: castle section squeeze, flame-shaped towers, the old city walls, the sea-front boulevard, the long main straight.
6. Crowd: red-green-blue flags, packed in the castle section stands, flag waves.
7. Adverts: "Pomegranate Pit Stop", "Carpet Cleaners: We Wash Your Racing Line", a fictional tea "Samovar Sprint".
8. Surface/kerbs: dusty warm asphalt, low red-white kerbs, minimal run-off, walls close.
9. Details: a minaret, flags on the rooftops, a gull flock, a tanker on the horizon, a pomegranate market stall, a tram.
10. Signature moment: the narrow squeeze through the castle section between the old city walls and a barrier.

### Singapore (Marina Bay)
1. Identity: a hot neon night under a glass-and-steel skyline and a bay.
2. Palette: neon magenta #D8307A, electric cyan #2FD0E0, deep navy #0B1230, gold #E8B33A, glass teal #1F6E80.
3. Light: full night under floodlights, magenta and cyan accents, no sun, sky deep indigo with city glow. Real race is at night, correct.
4. Atmosphere: humid hazy glow around lights, warm-tinted fog, thin spray after rain, light bloom.
5. Signature: the bay with the Ferris wheel, a boat-shaped triple tower, a lotus museum, a fictional lion statue, a light-up bridge.
6. Crowd: tropical shirts and glow sticks, big night stands, flags in lights.
7. Adverts: "Chilli Crab Cola", a fictional bank "Merlion & Sons Savings", "Humidity Hair Gel".
8. Surface/kerbs: dark wet-looking asphalt, bright red-white kerbs under the lights, concrete walls.
9. Details: a Ferris wheel, passing boats on the bay, a light show, fireworks, a footbridge, drones.
10. Signature moment: the sweep along the lit bay with the skyline mirrored in the water.

### Las Vegas (night strip)
1. Identity: a glittering neon desert night on the Strip. Already built; kept as is.
2. Palette: neon pink #E8307A, gold #E8B33A, electric blue #2F7FE8, desert black #0A0A12, fountain white #EAF4FF.
3. Light: late-night race, full darkness with neon, cool desert sky; real race is late evening, correct.
4. Atmosphere: warm glow haze, dry cold night air, no fog.
5. Signature: the Strip hotels, the sphere, the fountains, the casino signs, a 2-km straight.
6. Crowd: fancy-dress crowd, LED-lit stands, glowing wristbands.
7. Adverts: "Lucky Seven Lawyers", a buffet "All You Can Lap", a wedding chapel "Pit Stop & I Do".
8. Surface/kerbs: dark smooth asphalt, red-white kerbs, tarmac and wall run-off.
9. Details: fountains, a helicopter, a limousine, a ferris wheel, neon billboards.
10. Signature moment: the long flat-out blast under the lit skyline.
Existing world is kept. Left for later: a real elevation shape instead of a 2-cycle sine.

### Monaco (harbour town)
1. Identity: glamorous harbour town on a hill. Already built; kept.
2. Palette: Mediterranean blue #2F78B8, creamy stucco #E8D5B0, terracotta #B8542F, harbour white #F2F2F0, olive #6A8A4A.
3. Light: bright late-afternoon sun, golden warm light from the side, crisp medium shadows; the real race slot is mid-afternoon.
4. Atmosphere: light sea haze, warm tint, a thin fog far off.
5. Signature: harbour, casino, tunnel, hairpin hotel, swimming pool, Rascasse.
6. Crowd: balcony crowd, flags, yacht-top crowd.
7. Adverts: existing, to be checked for brand names.
8. Surface/kerbs: tight walls, red-white kerbs, no run-off.
9. Details: yachts, a cable car, cruise ship, helicopter, rooftop bars.
10. Signature moment: the tunnel exit into the harbour chicane.
Existing world kept.

### Silverstone (English airfield)
1. Identity: a flat English airfield under big changeable skies. Already built; kept.
2. Palette: lawn green #5A8A3A, concrete grey #8A8F96, hay yellow #C9B35A, overcast white #E0E3E6, brick red #A8452F.
3. Light: overcast soft light, thin sun break, very soft shadows. Real race is mid-afternoon.
4. Atmosphere: grey cloud mass, damp haze, light drizzle possible.
5. Signature: Maggotts-Becketts-Chapel, the Wing, the hangar straight, the airfield look.
6. Crowd: camping crowd with union-flag style banners (fictional), umbrellas.
7. Adverts: existing, to be checked.
8. Surface/kerbs: grey asphalt, red-white kerbs, wide tarmac and gravel.
9. Details: a vintage plane, a helicopter, tents, a hay bale stack.
10. Signature moment: Maggotts-Becketts flick through.
Existing world kept. Seam to fix.

### Zandvoort (Dutch dunes)
1. Identity: windswept sandy dunes and the North Sea with banked corners. Already built; kept.
2. Palette: dune sand #E3D2A0, sea blue #4C86A8, grass tuft #6F8F4A, orange accents #F08A1E, cloud white #EEF1F4.
3. Light: bright coastal sun with breeze, medium shadows, pale blue sky with scattered clouds.
4. Atmosphere: sea mist at the horizon, drifting sand, a light salty haze.
5. Signature: banked Tarzan and Arie Luyendyk, dunes, the sea view, the orange crowd.
6. Crowd: orange-covered stands, flares, packed.
7. Adverts: existing, to be checked.
8. Surface/kerbs: grey asphalt, red-white kerbs, sand run-off.
9. Details: a windmill, a beach hut, kites, a seaplane, a wind turbine row.
10. Signature moment: the banked final corner onto the straight.
Existing world kept.

### Suzuka (Japan)
1. Identity: a wooded hillside figure-of-eight with an amusement park. Already built; kept.
2. Palette: maple red #C9442F, cedar green #2F5A3A, mist grey #AEB8BC, pagoda red #B8362A, wet black asphalt #2A2E34.
3. Light: overcast-to-dusk soft light, low sun, long shadows. Real race is mid-afternoon.
4. Atmosphere: hill mist, cool tint, light drizzle.
5. Signature: the figure-of-eight crossover, the esses, the Ferris wheel, 130R.
6. Crowd: bright costumes, banners, dense.
7. Adverts: existing, to be checked.
8. Surface/kerbs: dark asphalt, red-white kerbs, gravel traps.
9. Details: a pagoda, a Ferris wheel, a monorail, cherry blossom.
10. Signature moment: passing under the crossover bridge.
Existing world kept. Seam to fix.

## Proposed order

1. Central direction fix (one commit, all eight mirrored tracks together, plus pit/run-off/scene side swaps), verified by printed winding.
2. Shared foundations (Step 1 of the brief), reusing what exists (the `bankZ`, `runoffZones`, `pit` and `G3.tileSplit` code is already there).
3. Tracks, weakest first: Spa, Interlagos, COTA, Monza, Mexico City, Baku, Singapore.
4. Then Vegas, Monaco, Silverstone, Zandvoort, Suzuka: direction and elevation-seam checks only unless you want more.

## Things I need from you

- OK to fix direction as a one-time sign flip in the layout parser (a mirror, justified above)?
- OK to add `ELEV_VISUAL = 1.25`, or do you want 1.0?
- OK on the track order and the personality sheets, or edits?
- Zandvoort and Interlagos elevation: I could not confirm those two from a clean source, accept estimates flagged as estimates?

## Track atmosphere hook
`def.atmo = { near, k, tint }` (src/render3d/build.js) sets per-track haze: near = fog start offset, k = visible-distance scale, tint = fog and sky colour. First user: Spa (mist, denser conifer). Spa visuals are a first pass only (no landmark kit or adverts yet); not seen in a browser.
