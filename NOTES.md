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

## Where the game's layout differs (not fixed, asking first)

The game builds Suzuka from the turtle DSL in `src/tracks/suzuka.js`, not from
a survey. Lined up against the OSM centreline (best rotation, translation and
start offset, with mirroring allowed), the RMS distance is **274 m**. It is a
loose figure of eight, not the real shape.

1. **It is mirrored.** The DSL's turtle treats y as pointing up, but the game
   draws y pointing south, like the surveyed circuits. So on screen the lap
   runs **counter-clockwise**, and Turn 1 is a left-hander. The same applies
   to every DSL-built circuit, not just Suzuka.
2. **The crossings are wrong.** The game has **two** bridges and neither is
   the real one:
   - lap 0.336–0.383 (after Degner) crosses *over* 0.455–0.495 (200R)
   - lap 0.824–0.846 (130R) crosses *over* 0.155–0.169 (between Turn 2 and the
     Esses)

   The real circuit has one crossing: the back straight over the Degner→Hairpin
   link.
3. **Proportions.** The game's footprint is about 1.54 × 1.26 km. The real one
   is about 2.2 × 0.85 km, long and narrow. To reach 5.807 km the DSL is
   scaled ×1.516, so every radius grows by that much. "130R" ends up at about
   199 m and the Hairpin at about 24 m.
4. **Elevation profile.** The game's range is 2–28 m (26 m) against about 40 m
   real.
   - The main straight falls only 4 m to Turn 1 (real: about 25–30 m).
   - The Hairpin sits 4 m above the lowest point. Really it is level with
     Degner, about 25 m above the low point.
   - The sector 1 climb and the back-section drop are there, in roughly the
     right places.
5. **The main grandstand and the Ferris wheel** were on the pit side. In
   reality they are across the track from the pits. This is set dressing, not
   layout, so it was moved (see the greenery notes below).

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
  the track. It is smoothed three times; the verges stay exact. Where two parts
  of the lap are close, the lower road keeps its ground, and at the two
  crossings it keeps it out past one grid diagonal, so no ground triangle can
  climb onto its verge.
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
  - The back section (lap 0.55–0.87, Spoon to 130R) starts closer and denser.
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
- **Farmland, 170–520 m out.** 69 flooded paddies, each levelled into its own
  terrace, and tea fields of rounded rows laid along the contour.
- **Water.** A pond in the first sector's infield, and a drainage ditch out of
  it behind the verge. The pond sits at the low point, so a stream had nowhere
  to run.
- **The park (Motopia-style, made-up).** It sits across the main straight from
  the pits, behind the grandstands, which were moved to that side.
  - pavilions with dark hip roofs and deep eaves, kiosks and a carousel
  - gravel paths linking them to the grandstands
  - paper lanterns, and nobori banners in plain colours with no text
  - a 52 m Ferris wheel facing the camera, turning once every 5 minutes, with
    gondolas that hang level. It fades out of the way like the other big props.
- **Bridges.** Both of the game's crossings get an open span (slab, fascia, a
  red band, parapet, pier caps and columns). Their approaches get retaining
  walls down to the ground. Where a bridge is needed is decided from the
  ground actually under the road, not from the track's bridge flag.
- **Camera towers** (scaffold, platform, hut) stand among the trees outside
  the Esses, Degner, Hairpin, Spoon, 130R and the chicane, where they fit. 4 of
  the 6 fit.
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
- `src/tracks/suzuka.js`:
  - `world:"suzuka"`, `runoffSurf:"plain"` and the gravel zones
  - the old prop trees, Ferris wheel and funfair are `only2d`, so the 2D
    fallback still has them
  - the main grandstands and the wheel moved to the side away from the pits

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
