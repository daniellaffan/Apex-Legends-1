# Apex Rivals '26

A browser F1 racing game (three.js r128). The source is split into ES modules
and Vite builds it back into one standalone HTML file.

## Run

```sh
npm install
npm run dev        # open the URL Vite prints (usually http://localhost:5173)
```

## Build

```sh
npm run build      # -> dist/index.html, one file with everything inlined
npm run preview    # serve the built file locally
```

`dist/index.html` makes no network requests. three.js, the fonts, the CSS and
the two sound clips are all inlined, so it opens by double-click. The build is
deliberately not minified (see `vite.config.js`).

## Folder map

```
index.html              markup only (no doctype, same as the original)
src/
  main.js               boot: imports every module in the original order, wires menus, starts the loop
  styles.css            the original stylesheet
  fonts.css             Saira Condensed, Barlow, Roboto Mono (bundled instead of Google Fonts)
  config/               util.js (helpers), teams.js (TEAMS, POINTS), settings.js (CFG, OPTS)
  tracks/               one definition per circuit + index.js (TRACKS, in menu order)
    shared.js           elevPW, bankZ, bumpU
    build.js            parseLayout, turtle, catmull, buildTrack
    survey/             baked map/terrain data for Monaco, Silverstone, Zandvoort
  car/                  parts.js (damage, tyres), spec.js (dimensions), physics.js (Car), pit.js (player pit stop)
  ai/driver.js          rival drivers
  game/session.js       session state, timing, race update, frame loop
  render2d/             2D canvas renderer: view/camera, drawCar, props (pyramid, box, boxCol, B3), world, particles
  render3d/             G3 renderer: g3.js core, surfaces, hoardings, post-processing pipeline,
    worlds/             per-track 3D worlds (vegas, vegas-city, monaco, silverstone, zandvoort, suzuka)
    build.js, scenery.js, car.js, frame.js   parts of G3 attached after the worlds
  ui/                   screens, hud, setup, results, championship, minimap, carview
  input/input.js        keyboard, wheel zoom, touch
  audio/                audio.js + samples/
legacy/                 untouched originals (original.html is the refactor source)
```

`main.js` imports some modules only for their side effects, such as attaching
methods to `G3`. The import order matters, so don't reorder those lines.

## Where each track lives

| Track | Definition | Custom 3D world |
|---|---|---|
| Monaco | `src/tracks/monaco.js` | `src/render3d/worlds/monaco.js`, data in `src/tracks/survey/monaco.js` |
| Singapore | `src/tracks/singapore.js` | — |
| Las Vegas | `src/tracks/vegas.js` | `src/render3d/worlds/vegas.js`, `vegas-city.js` |
| Baku | `src/tracks/baku.js` | — |
| Silverstone | `src/tracks/silverstone.js` | `src/render3d/worlds/silverstone.js`, data in `src/tracks/survey/silverstone.js` |
| Spa-Francorchamps | `src/tracks/spa.js` | — |
| Monza | `src/tracks/monza.js` | — |
| Zandvoort | `src/tracks/zandvoort.js` | `src/render3d/worlds/zandvoort.js`, data in `src/tracks/survey/zandvoort.js` |
| Suzuka | `src/tracks/suzuka.js` | `src/render3d/worlds/suzuka.js`, plan in `suzuka-plan.js` |
| São Paulo | `src/tracks/interlagos.js` | — |
| Austin | `src/tracks/cota.js` | — |
| Mexico City | `src/tracks/mexico.js` | — |

Each track file exports its definition object (layout, elevation, banking,
run-off, land, scene and pit settings). The order in `src/tracks/index.js` is
the order of the menu and the championship.
