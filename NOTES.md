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
