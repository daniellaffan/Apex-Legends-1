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
