import * as THREE from 'three';
import gunUrl from './audio/samples/gun.mp3';
import radioUrl from './audio/samples/radio.mp3';
import { MGEO } from './tracks/survey/monaco.js';
import { SGEO } from './tracks/survey/silverstone.js';
import { ZGEO } from './tracks/survey/zandvoort.js';
import { $, TAU, angWrap, clamp, el, fmtGap, fmtTime, lerp, mulberry, shade, store } from './config/util.js';
import { POINTS, TEAMS } from './config/teams.js';
import { PARTS, TYRES } from './car/parts.js';
import { CAR_SPEC } from './car/spec.js';
import { bankZ } from './tracks/shared.js';
import { TRACKS } from './tracks/index.js';
import { buildTrack } from './tracks/build.js';
import { Car, LAUNCH_HI, LAUNCH_LO } from './car/physics.js';
import { driveAI } from './ai/driver.js';
import { CAM_LOW, ISX, ISY, R, ZS } from './render2d/view.js';
import { SPHERE } from './render2d/sphere.js';
import { TEX, hashStr } from './render2d/textures.js';
import { drawProp, setB3 } from './render2d/props.js';
import { renderWorld } from './render2d/world.js';
import { PART, spawn, stepParts } from './render2d/particles.js';

/* ---------- 9c. generated surfaces ----------------------------------------
   Detail here comes out of a canvas, not out of triangles: window grids that
   glow at night, normal maps that give a curtain wall its mullions and a
   stucco wall its render, and roughness break-up so nothing reads as a single
   flat swatch. Everything is cached by key, because the same tower material is
   wanted a hundred times over.
   ------------------------------------------------------------------------- */
const PTEX = {
  cache:new Map(),
  // rough, metal, env: how the surface answers light
  // nrm: how deep the relief reads   lit: does it show windows at night
  STYLE:{
    glass:    { rough:0.12, metal:0.62, env:1.5, nrm:0.55, lit:1, glow:0.80, tint:-0.30, kind:"mullion" },
    darkglass:{ rough:0.08, metal:0.78, env:1.9, nrm:0.5,  lit:1, glow:0.62, tint:-0.55, kind:"mullion" },
    bronze:   { rough:0.18, metal:0.80, env:1.7, nrm:0.5,  lit:1, glow:0.78, tint:-0.10, kind:"mullion" },
    stucco:   { rough:0.92, metal:0.0,  env:0.4, nrm:0.8,  lit:1, glow:0.58, kind:"render" },
    stone:    { rough:0.80, metal:0.0,  env:0.5, nrm:0.9,  lit:1, glow:0.54, kind:"masonry" },
    concrete: { rough:0.95, metal:0.0,  env:0.35, nrm:0.7, lit:1, glow:0.40, kind:"panel" },
    brick:    { rough:0.88, metal:0.0,  env:0.35, nrm:1.0, lit:0, kind:"brick" },
    metal:    { rough:0.34, metal:0.90, env:1.4, nrm:0.4,  lit:0, kind:"panel" },
    corrugated:{ rough:0.46, metal:0.62, env:1.0, nrm:1.1,  lit:0, kind:"corrugated" },
    hotel:    { rough:0.62, metal:0.08, env:0.7, nrm:0.7,  lit:1, glow:0.62, kind:"mullion" },
    sand:     { rough:0.94, metal:0.0,  env:0.35, nrm:0.8, lit:1, glow:0.50, kind:"render" },
  },

  cv(w, h){ const c = document.createElement("canvas"); c.width = w; c.height = h; return c; },
  tex(cv, rep, srgb){
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    if(rep) t.repeat.set(rep[0], rep[1]);
    t.encoding = srgb ? THREE.sRGBEncoding : THREE.LinearEncoding;
    t.needsUpdate = true;
    return t;
  },
  get(key, make){ let v = this.cache.get(key); if(v === undefined){ v = make(); this.cache.set(key, v); } return v; },
  dispose(){ for(const t of this.cache.values()) if(t && t.isTexture) t.dispose(); this.cache.clear(); },

  /* a height field turned into a tangent-space normal map by Sobel */
  normalFrom(cv, strength){
    const w = cv.width, h = cv.height, g = cv.getContext("2d");
    const src = g.getImageData(0, 0, w, h).data;
    const out = g.createImageData(w, h), o = out.data;
    const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
    for(let y = 0; y < h; y++) for(let x = 0; x < w; x++){
      const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1))
               - (H(x - 1, y - 1) + 2 * H(x - 1, y) + H(x - 1, y + 1));
      const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1))
               - (H(x - 1, y - 1) + 2 * H(x, y - 1) + H(x + 1, y - 1));
      let nx = -dx * strength, ny = -dy * strength, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const k = (y * w + x) * 4;
      o[k] = (nx / l * 0.5 + 0.5) * 255; o[k + 1] = (ny / l * 0.5 + 0.5) * 255;
      o[k + 2] = (nz / l * 0.5 + 0.5) * 255; o[k + 3] = 255;
    }
    g.putImageData(out, 0, 0);
    return cv;
  },

  /* the relief of a facade: mullions and panel seams, masonry courses, render */
  normalTex(style){
    const S = this.STYLE[style] || this.STYLE.stucco;
    return this.get("n|" + S.kind, () => {
      const N = 256, cv = this.cv(N, N), g = cv.getContext("2d");
      g.fillStyle = "#808080"; g.fillRect(0, 0, N, N);
      const k = S.kind;
      if(k === "mullion"){
        // a curtain wall: deep vertical mullions, shallower floor lines, and the
        // glass itself set back a little inside each bay
        const bw = N / 8, bh = N / 8;
        for(let x = 0; x < N; x += bw){
          g.fillStyle = "#4A4A4A"; g.fillRect(x, 0, 3, N);
          g.fillStyle = "#C8C8C8"; g.fillRect(x + 3, 0, 2, N);
        }
        for(let y = 0; y < N; y += bh){
          g.fillStyle = "#585858"; g.fillRect(0, y, N, 2);
          g.fillStyle = "#B4B4B4"; g.fillRect(0, y + 2, N, 2);
        }
      } else if(k === "masonry"){
        const rh = N / 12;
        for(let r = 0; r * rh < N; r++){
          const off = (r % 2) * rh;
          g.fillStyle = "#606060";
          g.fillRect(0, r * rh, N, 2);
          for(let x = -off; x < N; x += rh * 2) g.fillRect(x, r * rh, 2, rh);
          g.fillStyle = "#909090";
          for(let x = -off; x < N; x += rh * 2) g.fillRect(x + 2, r * rh + 2, rh - 4, rh - 4);
        }
      } else if(k === "brick"){
        const bh2 = N / 20, bw2 = N / 8;
        for(let r = 0; r * bh2 < N; r++){
          const off = (r % 2) * bw2 / 2;
          for(let x = -off; x < N; x += bw2){
            g.fillStyle = "#9E9E9E"; g.fillRect(x + 1, r * bh2 + 1, bw2 - 2, bh2 - 2);
          }
        }
      } else if(k === "corrugated"){
        // sheet roofing: a sine across, and a lap joint every few sheets
        for(let x = 0; x < N; x++){ const v = 128 + Math.sin(x / N * Math.PI * 2 * 24) * 90 | 0;
          g.fillStyle = "rgb(" + v + "," + v + "," + v + ")"; g.fillRect(x, 0, 1, N); }
        g.fillStyle = "#5A5A5A"; for(let y = 0; y < N; y += N / 3) g.fillRect(0, y, N, 2);
      } else if(k === "panel"){
        const p = N / 6;
        for(let x = 0; x < N; x += p){ g.fillStyle = "#6A6A6A"; g.fillRect(x, 0, 2, N); }
        for(let y = 0; y < N; y += p){ g.fillStyle = "#6A6A6A"; g.fillRect(0, y, N, 2); }
      }
      if(k === "render" || k === "panel" || k === "masonry"){
        // a fine grain on top so the flat parts are not glassy
        for(let i = 0; i < N * N * 0.30; i++){
          const v = 128 + (Math.random() - 0.5) * (k === "render" ? 54 : 22) | 0;
          g.fillStyle = "rgb(" + v + "," + v + "," + v + ")";
          g.fillRect(Math.random() * N | 0, Math.random() * N | 0, 2, 2);
        }
      }
      return this.tex(this.normalFrom(cv, 2.2), [3, 3], false);
    });
  },

  /* break the specular up so a whole wall does not flash at once */
  roughTex(style){
    const S = this.STYLE[style] || this.STYLE.stucco;
    return this.get("r|" + S.kind, () => {
      const N = 128, cv = this.cv(N, N), g = cv.getContext("2d");
      g.fillStyle = "#B4B4B4"; g.fillRect(0, 0, N, N);
      for(let i = 0; i < 1400; i++){
        const v = 140 + (Math.random() - 0.5) * 90 | 0;
        g.fillStyle = "rgb(" + v + "," + v + "," + v + ")";
        const r = 2 + Math.random() * 9;
        g.beginPath(); g.arc(Math.random() * N, Math.random() * N, r, 0, TAU); g.fill();
      }
      if(S.kind === "mullion"){
        // the frames are always duller than the glass
        for(let x = 0; x < N; x += N / 8){ g.fillStyle = "#EAEAEA"; g.fillRect(x, 0, 3, N); }
        for(let y = 0; y < N; y += N / 8){ g.fillStyle = "#EAEAEA"; g.fillRect(0, y, N, 3); }
      }
      return this.tex(cv, [3, 3], false);
    });
  },

  /* the windows, as an emissive map: which rooms have a light on tonight */
  windowTex(style, col){
    const S = this.STYLE[style] || this.STYLE.stucco;
    const warm = S.kind === "mullion" ? ["#FFD79A", "#FFE7C0", "#FFC578", "#E8F0FF", "#FFB25E"]
                                      : ["#FFCE86", "#FFDFA8", "#FFB868", "#FFE2B4"];
    return this.get("w|" + S.kind, () => {
      const N = 256, cv = this.cv(N, N), g = cv.getContext("2d");
      g.fillStyle = "#000000"; g.fillRect(0, 0, N, N);
      const cols = S.kind === "mullion" ? 8 : 10, rows = S.kind === "mullion" ? 8 : 12;
      const bw = N / cols, bh = N / rows;
      const pad = S.kind === "mullion" ? 0.10 : 0.22;
      for(let r = 0; r < rows; r++){
        // whole floors go dark: a plant room, a closed level
        const floorOff = Math.random() < 0.10;
        for(let c = 0; c < cols; c++){
          if(floorOff || Math.random() > (S.kind === "mullion" ? 0.58 : 0.42)) continue;
          const x = c * bw + bw * pad, y = r * bh + bh * pad;
          const w = bw * (1 - pad * 2), h = bh * (1 - pad * 2);
          const cc = warm[(Math.random() * warm.length) | 0];
          g.fillStyle = cc;
          g.globalAlpha = 0.30 + Math.random() * 0.46;
          g.fillRect(x, y, w, h);
          // a brighter core, so the pane is not a flat rectangle of light
          g.globalAlpha *= 0.45;
          g.fillStyle = "#FFFFFF";
          g.fillRect(x + w * 0.2, y + h * 0.15, w * 0.6, h * 0.4);
          g.globalAlpha = 1;
        }
      }
      return this.tex(cv, [3, 3], true);
    });
  },

  /* The Exosphere is roughly 1.2 million LED pucks on a triangulated frame.
     None of that is modelled: this is the panel grid and the puck spacing as a
     normal map, which is what makes the surface read as faceted rather than
     enamelled when the TV camera gets close. */
  facets(){
    return this.get("facets", () => {
      const N = 512, cv = this.cv(N, N), g = cv.getContext("2d");
      g.fillStyle = "#808080"; g.fillRect(0, 0, N, N);
      // the pucks, dense and shallow
      for(let y = 0; y < N; y += 4){
        const off = ((y / 4) % 2) * 2;
        for(let x = -off; x < N; x += 4){
          g.fillStyle = "#9C9C9C"; g.beginPath(); g.arc(x + 2, y + 2, 1.35, 0, TAU); g.fill();
        }
      }
      // the panel seams over the top of them, deeper
      const step = N / 24;
      g.strokeStyle = "#5A5A5A"; g.lineWidth = 2.2;
      g.beginPath();
      for(let r = 0; r * step * 0.866 < N + step; r++){
        const y = r * step * 0.866, off = (r % 2) * step / 2;
        for(let x = -off; x < N + step; x += step){
          g.moveTo(x, y); g.lineTo(x + step / 2, y + step * 0.866);
          g.moveTo(x + step, y); g.lineTo(x + step / 2, y + step * 0.866);
          g.moveTo(x, y); g.lineTo(x + step, y);
        }
      }
      g.stroke();
      return this.tex(this.normalFrom(cv, 1.5), [4, 2], false);
    });
  },

  /* the tower in Paris is a lattice, and a lattice is holes. Drawing the
     ironwork as an alpha map on a few tapered surfaces costs one texture; the
     same silhouette in struts would cost thousands of triangles. */
  lattice(){
    return this.get("lattice", () => {
      const N = 256, cv = this.cv(N, N), g = cv.getContext("2d");
      g.clearRect(0, 0, N, N);
      g.strokeStyle = "#B8A484"; g.lineCap = "square";
      const step = N / 10;
      g.lineWidth = 5;
      for(let x = 0; x <= N; x += step){ g.beginPath(); g.moveTo(x, 0); g.lineTo(x, N); g.stroke(); }
      g.lineWidth = 4;
      for(let y = 0; y <= N; y += step){ g.beginPath(); g.moveTo(0, y); g.lineTo(N, y); g.stroke(); }
      g.lineWidth = 3;
      for(let y = 0; y < N; y += step) for(let x = 0; x < N; x += step){
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + step, y + step);
        g.moveTo(x + step, y); g.lineTo(x, y + step); g.stroke();
      }
      return this.tex(cv, [3, 5], true);
    });
  },

  /* The same panelling, but tiled once over the whole ball.
     r128 takes the UV transform for every map on a material from the first one
     it finds — map, then normalMap, and so on — so a normal map with a repeat
     would drag the emissive picture along with it. The Sphere's picture must be
     laid on at repeat 1, so its normal map has to be too, and the density goes
     into the canvas instead. */
  facetsBall(){
    return this.get("facetsBall", () => {
      const N = 1024, cv = this.cv(N, N), g = cv.getContext("2d");
      g.fillStyle = "#808080"; g.fillRect(0, 0, N, N);
      for(let y = 0; y < N; y += 3){
        const off = ((y / 3) % 2) * 1.5;
        for(let x = -off; x < N; x += 3){
          g.fillStyle = "#909090"; g.fillRect(x + 1, y + 1, 1, 1);
        }
      }
      const step = N / 72;
      g.strokeStyle = "#5E5E5E"; g.lineWidth = 1.6;
      g.beginPath();
      for(let r = 0; r * step * 0.866 < N + step; r++){
        const y = r * step * 0.866, off = (r % 2) * step / 2;
        for(let x = -off; x < N + step; x += step){
          g.moveTo(x, y); g.lineTo(x + step / 2, y + step * 0.866);
          g.moveTo(x + step, y); g.lineTo(x + step / 2, y + step * 0.866);
          g.moveTo(x, y); g.lineTo(x + step, y);
        }
      }
      g.stroke();
      const t = this.tex(this.normalFrom(cv, 1.2), [1, 1], false);
      t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
      return t;
    });
  },


  /* ---- Monaco's surfaces ---- */
  paving(){
    return this.get("paving", () => {
      const N = 256, cv = this.cv(N, N), g = cv.getContext("2d");
      g.fillStyle = "#F2EEE6"; g.fillRect(0, 0, N, N);
      // large pale stone flags with thin joints, lightly mottled
      const s = N / 4;
      for(let r = 0; r < 4; r++) for(let c = 0; c < 4; c++){
        const v = 232 + ((r * 7 + c * 13) % 5) * 4;
        g.fillStyle = "rgb(" + v + "," + (v - 4) + "," + (v - 12) + ")";
        g.fillRect(c * s + 1, r * s + 1, s - 2, s - 2);
      }
      for(let i = 0; i < 2600; i++){
        const v = 200 + Math.random() * 50 | 0;
        g.fillStyle = "rgba(" + v + "," + (v - 6) + "," + (v - 16) + ",0.25)";
        g.fillRect(Math.random() * N, Math.random() * N, 2, 2);
      }
      return this.tex(cv, [1, 1], true);
    });
  },
  // a tileable ripple normal map, summed from a few sine trains
  ripples(){
    return this.get("ripples", () => {
      const N = 256, cv = this.cv(N, N), g = cv.getContext("2d"), img = g.createImageData(N, N), d = img.data;
      const W = [[3, 1, 0.8], [1, 4, 0.65], [5, -2, 0.45], [-2, 7, 0.32], [8, 3, 0.22], [-6, 5, 0.2],
                 [2, -5, 0.28], [-4, -3, 0.24], [9, -4, 0.12], [-7, -8, 0.1], [11, 6, 0.08], [4, 10, 0.1]];
      for(let y = 0; y < N; y++) for(let x = 0; x < N; x++){
        let dx = 0, dy = 0;
        for(const [kx, ky, a] of W){
          const ph = (kx * x + ky * y) / N * TAU + a * 7;
          const c = Math.cos(ph) * a;
          dx += c * kx; dy += c * ky;
        }
        let nx = -dx * 0.06, ny = -dy * 0.06, nz = 1; const l = Math.hypot(nx, ny, nz);
        const k = (y * N + x) * 4;
        d[k] = (nx / l * 0.5 + 0.5) * 255; d[k + 1] = (ny / l * 0.5 + 0.5) * 255; d[k + 2] = (nz / l * 0.5 + 0.5) * 255; d[k + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      return this.tex(cv, [1, 1], false);
    });
  },
  foam(){
    return this.get("foam", () => {
      const cv = this.cv(64, 64), g = cv.getContext("2d");
      const gd = g.createLinearGradient(0, 0, 0, 64);
      gd.addColorStop(0, "rgba(255,255,255,0.95)"); gd.addColorStop(0.35, "rgba(255,255,255,0.45)"); gd.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gd; g.fillRect(0, 0, 64, 64);
      const t = this.tex(cv, [1, 1], true); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
    });
  },
  stairs(){
    return this.get("stairs", () => {
      const cv = this.cv(64, 64), g = cv.getContext("2d");
      g.fillStyle = "#E6DECF"; g.fillRect(0, 0, 64, 64);
      for(let y = 0; y < 64; y += 16){ g.fillStyle = "#9A9080"; g.fillRect(0, y, 64, 3); g.fillStyle = "#F6F0E4"; g.fillRect(0, y + 3, 64, 2); }
      g.fillStyle = "#7A7266"; g.fillRect(0, 0, 4, 64); g.fillRect(60, 0, 4, 64);
      return this.tex(cv, [1, 1], true);
    });
  },
  roofGravel(){
    return this.get("gravel", () => {
      const N = 128, cv = this.cv(N, N), g = cv.getContext("2d");
      g.fillStyle = "#D8D2C6"; g.fillRect(0, 0, N, N);
      for(let i = 0; i < 3000; i++){ const v = 170 + Math.random() * 70 | 0; g.fillStyle = "rgb(" + v + "," + (v - 4) + "," + (v - 10) + ")"; g.fillRect(Math.random() * N, Math.random() * N, 2, 2); }
      // parapet lines, a roof hatch
      g.strokeStyle = "rgba(90,86,80,.35)"; g.lineWidth = 2; g.strokeRect(4, 4, N - 8, N - 8);
      return this.tex(cv, [1, 1], true);
    });
  },
  roofTiles(){
    return this.get("tiles", () => {
      const N = 128, cv = this.cv(N, N), g = cv.getContext("2d");
      g.fillStyle = "#C66A42"; g.fillRect(0, 0, N, N);
      for(let r = 0; r < 16; r++){
        g.fillStyle = "rgba(90,30,10,.35)"; g.fillRect(0, r * 8 + 6, N, 2);
        for(let c = 0; c < 16; c++){ const v = Math.random() * 30 - 15;
          g.fillStyle = "rgba(" + (200 + v | 0) + "," + (110 + v | 0) + "," + (70 + v | 0) + ",.5)";
          g.fillRect(c * 8 + ((r % 2) * 4), r * 8, 7, 6); }
      }
      return this.tex(cv, [1, 1], true);
    });
  },

  /* the facades: Monaco's pastels, each a tile of four bays by three floors, with
     window openings, shutters in the palette's own colour, a balcony rail under
     each window and a string course between floors */
  PALETTE_MODERN:8, PALETTE_BEAUX:9, PALETTE_OCHRE:2, PALETTE_CREAM:0, PALETTE_FAIRMONT:10, PALETTE_SALMON:3,
  monacoPalette(){
    return [
      { wall:"#F4E4C2", trim:"#FFFFFF", shut:"#6E8A6A", glass:"#586C7E" },   // cream
      { wall:"#F6D690", trim:"#FFF6E6", shut:"#5E7A5A", glass:"#586C7E" },   // pale yellow
      { wall:"#E8AE66", trim:"#FFF2DC", shut:"#6A5038", glass:"#546676" },   // ochre
      { wall:"#EC9C7C", trim:"#FFF0E8", shut:"#4E6A5A", glass:"#546676" },   // salmon
      { wall:"#F4BE86", trim:"#FFF6EA", shut:"#7A5A3A", glass:"#586C7E" },   // apricot
      { wall:"#F6F0E4", trim:"#FFFFFF", shut:"#3E5E7A", glass:"#586C7E" },   // white
      { wall:"#EDB6A0", trim:"#FFF4EE", shut:"#5A6E5A", glass:"#546676" },   // terracotta pink
      { wall:"#DCE4C4", trim:"#FFFFFF", shut:"#6A7A5A", glass:"#546676" },   // pale green
      { wall:"#EEF0F0", trim:"#FFFFFF", shut:null, glass:"#2A3E52", modern:true },  // modern towers
      { wall:"#EEE2C8", trim:"#FFF8EA", shut:null, glass:"#2E3A44", beaux:true },   // Beaux-Arts stone
      { wall:"#F4F2EC", trim:"#FFFFFF", shut:null, glass:"#6E8698", bands:true },   // the Fairmont
    ].slice(0, 11);
  },
  /* All the facades in one texture, one tile per palette, so a chunk of town is
     one draw however many colours are in it. The palette travels in the UVs as
     whole multiples of 32 on v; the shader peels it off and finds the tile. */
  monacoAtlas(){
    return this.get("mfAtlas", () => {
      const PAL = this.monacoPalette(), N = PAL.length, W = 256, H = 192;
      const cv = this.cv(W, H * N), g = cv.getContext("2d");
      for(let i = 0; i < N; i++) g.drawImage(this.monacoTile(i), 0, i * H);
      const map = this.tex(cv, [1, 1], true);
      const nm = this.normalTex("stucco").clone(); nm.needsUpdate = true; nm.repeat.set(1, 1);
      const m = new THREE.MeshStandardMaterial({ map, normalMap:nm, normalScale:new THREE.Vector2(0.35, 0.35),
        roughness:0.74, metalness:0.05, envMapIntensity:0.7, vertexColors:true });
      m.onBeforeCompile = sh => {
        sh.fragmentShader = sh.fragmentShader.replace("#include <map_fragment>", `
        #ifdef USE_MAP
          float palI = floor(vUv.y / 32.0);
          vec2 tl = vec2(fract(vUv.x), fract(vUv.y - palI * 32.0));
          vec2 auv = vec2(tl.x, (${N.toFixed(1)} - palI - 1.0 + tl.y) / ${N.toFixed(1)});
          #if __VERSION__ >= 300
            vec2 dx = dFdx(vUv) * vec2(1.0, 1.0 / ${N.toFixed(1)}), dy = dFdy(vUv) * vec2(1.0, 1.0 / ${N.toFixed(1)});
            vec4 texelColor = textureGrad(map, auv, dx, dy);
          #else
            vec4 texelColor = texture2D(map, auv);
          #endif
          texelColor = mapTexelToLinear(texelColor);
          diffuseColor *= texelColor;
        #endif`);
      };
      m.customProgramCacheKey = () => "monacoAtlas";
      return m;
    });
  },
  monacoTile(i){
    const P = this.monacoPalette()[i];
    const W = 256, H = 192, cv = this.cv(W, H), g = cv.getContext("2d");
    this._drawFacade(g, P, W, H);
    return cv;
  },
  monacoFacade(i){
    const P = this.monacoPalette()[i];
    return this.get("mf|" + i, () => {
      const W = 256, H = 192, cv = this.cv(W, H), g = cv.getContext("2d");
      this._drawFacade(g, P, W, H);
      const map = this.tex(cv, [1, 1], true);
      const nm = this.normalTex(P.modern ? "glass" : "stucco").clone(); nm.needsUpdate = true;
      const m = new THREE.MeshStandardMaterial({ map, normalMap:nm, normalScale:new THREE.Vector2(0.35, 0.35),
        roughness:P.modern ? 0.35 : 0.82, metalness:P.modern ? 0.25 : 0.0, envMapIntensity:P.modern ? 1.3 : 0.55 });
      nm.repeat.set(1, 1);
      return m;
    });
  },
  _drawFacade(g, P, W, H){
      g.fillStyle = P.wall; g.fillRect(0, 0, W, H);
      // a faint render texture
      for(let k = 0; k < 1800; k++){ g.fillStyle = "rgba(0,0,0," + (Math.random() * 0.05).toFixed(3) + ")"; g.fillRect(Math.random() * W, Math.random() * H, 2, 2); }
      const bw = W / 4, fh = H / 3;
      for(let f = 0; f < 3; f++){
        const y0 = f * fh;
        g.fillStyle = P.trim; g.fillRect(0, y0 + fh - 4, W, 4);        // the string course
        if(P.bands){
          // continuous glazing with a balcony slab at every floor
          g.fillStyle = P.glass; g.fillRect(0, y0 + 8, W, fh - 22);
          g.fillStyle = "rgba(255,255,255,.18)"; for(let x = 0; x < W; x += 16) g.fillRect(x, y0 + 8, 2, fh - 22);
          g.fillStyle = P.trim; g.fillRect(0, y0 + fh - 14, W, 10);
          continue;
        }
        for(let b = 0; b < 4; b++){
          const x0 = b * bw, ww = P.modern ? bw * 0.70 : bw * 0.34, wh = P.modern ? fh * 0.64 : fh * 0.54;
          const wx = x0 + (bw - ww) / 2, wy = y0 + fh * 0.14;
          if(P.beaux){
            // tall arched windows with a pediment over each
            g.fillStyle = P.glass;
            g.beginPath(); g.moveTo(wx, wy + wh); g.lineTo(wx, wy + ww / 2); g.arc(wx + ww / 2, wy + ww / 2, ww / 2, Math.PI, 0); g.lineTo(wx + ww, wy + wh); g.fill();
            g.fillStyle = P.trim; g.fillRect(wx - 4, wy - 6, ww + 8, 3);
            g.fillStyle = "rgba(0,0,0,.08)"; g.fillRect(x0 + 1, y0, 3, fh);  // pilasters
            continue;
          }
          g.fillStyle = P.glass; g.fillRect(wx, wy, ww, wh);
          g.fillStyle = "rgba(255,255,255,.22)"; g.fillRect(wx + 2, wy + 2, ww * 0.3, wh * 0.4);   // a reflection
          g.fillStyle = P.trim; g.fillRect(wx - 3, wy - 3, ww + 6, 3); g.fillRect(wx - 3, wy + wh, ww + 6, 3);
          if(P.shut && (b + f) % 3 !== 2){
            // open shutters either side, louvred
            g.fillStyle = P.shut;
            g.fillRect(wx - ww * 0.48, wy, ww * 0.44, wh); g.fillRect(wx + ww * 1.04, wy, ww * 0.44, wh);
            g.fillStyle = "rgba(0,0,0,.18)";
            for(let yy = wy + 3; yy < wy + wh; yy += 4){ g.fillRect(wx - ww * 0.48, yy, ww * 0.44, 1); g.fillRect(wx + ww * 1.04, yy, ww * 0.44, 1); }
          }
          // a balcony rail across the bottom of the window
          g.fillStyle = "rgba(40,40,44,.75)"; g.fillRect(wx - 4, wy + wh - 10, ww + 8, 2);
          for(let xx = wx - 3; xx < wx + ww + 4; xx += 3) g.fillRect(xx, wy + wh - 10, 1, 10);
        }
      }
  },

  /* catch fencing: a wire mesh, as alpha on a thin plane */
  fence(){
    return this.get("fence", () => {
      const N = 128, cv = this.cv(N, N), g = cv.getContext("2d");
      g.clearRect(0, 0, N, N);
      g.strokeStyle = "rgba(196,204,212,0.92)"; g.lineWidth = 2.1;
      const s = N / 8;
      g.beginPath();
      for(let i = -8; i < 16; i++){
        g.moveTo(i * s, 0); g.lineTo(i * s + N, N);
        g.moveTo(i * s, N); g.lineTo(i * s + N, 0);
      }
      g.stroke();
      return this.tex(cv, [1, 1], true);
    });
  },

  /* the soft falloff of a light pool on the ground */
  pool(){
    return this.get("pool", () => {
      const N = 128, cv = this.cv(N, N), g = cv.getContext("2d");
      const rg = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
      rg.addColorStop(0, "rgba(255,255,255,1)");
      rg.addColorStop(0.45, "rgba(255,255,255,0.45)");
      rg.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = rg; g.fillRect(0, 0, N, N);
      const t = this.tex(cv, [1, 1], false);
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      return t;
    });
  },

  /* a lit LED grid, for media facades and the big screens */
  led(){
    return this.get("led", () => {
      const N = 128, cv = this.cv(N, N), g = cv.getContext("2d");
      g.fillStyle = "#0A0A0C"; g.fillRect(0, 0, N, N);
      for(let y = 2; y < N; y += 4) for(let x = 2; x < N; x += 4){
        g.fillStyle = "rgba(255,255,255,0.14)";
        g.fillRect(x, y, 2, 2);
      }
      return this.tex(cv, [1, 1], true);
    });
  },
};

/* ---------- 9d. the hoardings ---------------------------------------------
   Every brand along the walls is invented. They are painted to canvas at load
   and shared as a small set of materials, so a hundred panels round the lap
   cost a handful of textures and one draw call per colour after the bake.
   At night they are backlit: emissive, but only just — enough to read and to
   catch a little bloom, not enough to compete with the Sphere.
   ------------------------------------------------------------------------- */
const ADS = {
  W:512, H:160,
  mats:new Map(), texs:[],
  // name, tagline, panel, ink, logo mark, and the shape the mark is drawn as
  get VEGAS(){ return this._vegas || (this._vegas = this.LIST); },
  LIST:[
    ["UNDERCUT",      "Tastes like a fresh set of softs", "#0E1A3C", "#4CE0FF", "#4CE0FF", "bolt"],
    ["BOX BOX PIZZA", "We'll be there in one lap",        "#B8121A", "#FFE9C4", "#FFC23A", "wheel"],
    ["LUCKY LUKE'S",  "Drive-thru vows under 2.9s",       "#2A0B3E", "#FF74C8", "#FF74C8", "ring"],
    ["DIRTY AIR",     "Air fresheners in Tyre Smoke",     "#1D3226", "#9BE88A", "#9BE88A", "leaf"],
    ["BUFFET PALACE", "Downforce not included",           "#7A1540", "#FFD9A0", "#FFB43A", "fork"],
    ["DRS PLUMBING",  "When your pipes need an overtake", "#06324E", "#7FD4FF", "#7FD4FF", "arrow"],
    ["MR. BLUE FLAG", "Surprisingly legal pawn shop",     "#0B2C6B", "#FFFFFF", "#3E86FF", "flag"],
    ["GRAVEL TRAP",   "Beach resort, opening Turn 1",     "#8A6A22", "#FFF0C4", "#FFDC7A", "umbrella"],
    ["APEX DENTAL",   "We'll straighten your chicane",    "#0F3F3A", "#B8FFF0", "#5FE8CC", "tooth"],
    ["PORPOISE INN",  "The bounciest beds on the Strip",  "#123A6B", "#CFE4FF", "#7FB4FF", "wave"],
    ["SAFETY CAR",    "Rentals — nought to sixty, slowly","#C46A08", "#FFF1D2", "#FFD24A", "cone"],
    ["MARBLES",       "Off-line snack co. Best cold",     "#3A1430", "#FFC8E8", "#FF66B8", "dots"],
    ["BLUE FLAG BBQ", "You're being lapped. Eat anyway",  "#4A1008", "#FFD0A0", "#FF7A2A", "fire"],
    ["THE PIT WALL",  "Sports bar. Nobody listens here",  "#1A1D28", "#E8ECF4", "#FF3D62", "screen"],
    ["DOUBLE STACK",  "Pancakes. Two at once. Sorry",     "#6A3A08", "#FFE2B0", "#FFC048", "stack"],
    ["TYRE CLIFF",    "Adventure climbs, sudden drops",   "#2A2A2E", "#DCE2EA", "#8A93A0", "mountain"],
    ["SLIPSTREAM",    "Dry cleaning while you tow",       "#0C3A2A", "#C8FFE4", "#48E8A0", "wind"],
    ["FORMATION LAP", "Wedding cars. We go round twice",  "#3E0E2A", "#FFD4E8", "#FF4A9E", "ring"],
    ["PARC FERME",    "Storage units. Nobody may touch",  "#243A16", "#DCF0B4", "#A8E05A", "lock"],
    ["OVERSTEER",     "Barbers. Ask for the snap",        "#141822", "#FFFFFF", "#E8221A", "scissors"],
  ],
  /* Monaco's set: invented brands, Riviera colours, and the jokes are about
     money, yachts and how little room there is on this circuit */
  LISTS:{},
  MONACO:[
    ["ZERO OVERTAKE",    "Insurance for the place you're keeping", "#0E2A5A", "#F4E4B0", "#D4AF5A", "lock"],
    ["STERN-TO VALET",   "We park yachts. Mind the paintwork",      "#F4F2EA", "#0E2A5A", "#1E6FA8", "wave"],
    ["HAIRPIN ESPRESSO", "Fastest thing at Turn 6",                 "#3A1E12", "#F4E0C0", "#E8A040", "fire"],
    ["OFFSHORE MINTS",   "Refreshingly undeclared",                 "#0C4A44", "#E0FFF6", "#5FE8C8", "dots"],
    ["SECOND YACHT",     "Therapy for the owner of the smaller one","#1A2A4A", "#FFFFFF", "#6AB4F0", "arrow"],
    ["BARRIER KISS",     "Lip balm. Gentle contact only",           "#B8203A", "#FFE4EA", "#FF8AA0", "ring"],
    ["TABAC TAILORS",    "Suits cut inches from the wall",          "#141820", "#E8E4DA", "#C8A45A", "scissors"],
    ["CASINO CRESTS",    "Hats for going over the top",             "#2E1A4A", "#F4E8FF", "#C89AF0", "mountain"],
    ["LOW TIDE LOANS",   "Because the harbour never is",            "#1E6FA8", "#FFFFFF", "#F4D48A", "wave"],
    ["TUNNEL TANS",      "Instant bronze, no sunlight involved",    "#6A3A12", "#FFE8C8", "#FFB45A", "bolt"],
    ["PIT LANE PASTA",   "Al dente in 2.4 seconds",                 "#F4EEE0", "#A0201E", "#2E8C4A", "fork"],
    ["CHICANE CHIRO",    "Left, right, and back into line",         "#0E3A2E", "#DCFFEE", "#6AE8A8", "wind"],
    ["ROCK VIEW REALTY", "Studios from one modest fortune",         "#E8D8B8", "#3A2A14", "#B8683E", "stack"],
    ["POLITE APPLAUSE",  "Gloves for the grandstand",               "#1A1C24", "#F2F2F2", "#E8C04A", "screen"],
    ["QUAYSIDE QUICHE",  "Moored daily at Rascasse",                "#F6E6C8", "#6A3A1A", "#E8903A", "umbrella"],
    ["HELIPAD HAIRCUTS", "Lands on your head in minutes",           "#0A1E3A", "#E8F2FF", "#4AA8FF", "cone"],
    ["PARADE LAP LOAFERS","Lead the procession in comfort",         "#4A2A14", "#F8E8D0", "#D8A060", "flag"],
    ["BLIND PORTIER",    "Opticians. We'll see you round it",       "#123A6A", "#FFFFFF", "#8AC8FF", "tooth"],
    ["PARKING ACADEMY",  "Reversing into a berth since 1929",       "#2A3A1A", "#EEF6DC", "#A8D860", "leaf"],
    ["FULL LOCK FRITES", "Crisp through the tightest turn",         "#D8A020", "#2A1A06", "#F4F0E0", "wheel"],
  ],
  /* Silverstone's set: made-up British brands, and the jokes are about the
     weather, queues, tea, gravel and the A43 */
  SILVERSTONE:[
    ["DRIZZLE™ UMBRELLAS",  "Fits all weather. Especially this one",     "#1C3A5E", "#E8F0F8", "#7FB8E8", "umbrella"],
    ["MIND THE GAP INSURANCE","Becketts edition. Terms apply at 300 km/h", "#0E2A4A", "#FFFFFF", "#E8242C", "arrow"],
    ["PROPER TEA RACING",    "Pit stop in 2.0s. Brewing takes four minutes","#F2EAD8", "#2A3A1A", "#5A8A3A", "stack"],
    ["QUEUE SYSTEMS LTD",    "Because you're already in one",             "#2E2A3A", "#F2F2F2", "#F2C230", "dots"],
    ["GRAVEL TRAP GARDENS",  "Plants. Pebbles. Panic.",                   "#5A6A2A", "#FFF6D8", "#E8D07A", "leaf"],
    ["ROUNDABOUT TYRE CO.",  "Going round in circles since 1948",         "#141418", "#F2F2F2", "#E8242C", "wheel"],
    ["SAUSAGE ROLL ENERGY",  "Now with 20% more pastry",                  "#C8781E", "#FFF2D8", "#7A3A0E", "bolt"],
    ["POTHOLE REPAIR CO.",   "We know a track that doesn't need us",      "#2A2C30", "#F2D23A", "#F2D23A", "cone"],
    ["A43 PATIENCE CLINIC",  "Now seeing Sunday's traffic. Book Friday",  "#0E3A2E", "#DCFFEE", "#6AE8A8", "lock"],
    ["DAMP SQUIB FIREWORKS", "Reliably British since forever",            "#3A1430", "#FFC8E8", "#FF66B8", "fire"],
    ["BRAKING NEWS",         "Vale's hardest stop, delivered daily",      "#B8121A", "#FFFFFF", "#FFD24A", "screen"],
    ["HEDGEROW HOLIDAYS",    "Northamptonshire: mostly fields, all heart", "#3E6A2A", "#F4FFE8", "#C8E87A", "leaf"],
    ["WELLY WAREHOUSE",      "For the walk back to the car park",         "#1E5A2A", "#F2F2F2", "#F2C230", "mountain"],
    ["SCONE ZONE",           "Jam first? We'll race you for it",          "#F4E4C8", "#7A1A2A", "#C8323A", "dots"],
    ["FOUR SEASONS CAGOULES","Sun, rain, hail and Stowe, all in one lap", "#0C2A5A", "#E8F2FF", "#4AA8FF", "wind"],
    ["MAGGOTTS PEST CONTROL","Genuinely the name of a corner",            "#2A1A0E", "#FFE8C8", "#E8A040", "scissors"],
    ["BISCUIT DUNKERS FC",   "Sponsoring the long run since teatime",     "#5A2A12", "#FFE2B0", "#FFC048", "ring"],
    ["CLUB CORNER CARAVANS", "Pitch up. Get stuck. Love it",              "#E8E4D8", "#1A3A5A", "#3E86C8", "flag"],
  ],
  /* Zandvoort's set: made-up Dutch brands; the jokes are about cheese, bikes,
     wind, sand, banking and the colour orange */
  ZANDVOORT:[
    ["STROOPWAFEL RACING FUEL", "Now with extra caramel",                  "#8A4A12", "#FFE2B0", "#FFC048", "stack"],
    ["WINDMILL ENERGY",        "We were turning before it was cool",      "#1E5AA8", "#FFFFFF", "#9AD0FF", "wind"],
    ["BANKED UP INSURANCE",    "Eighteen degrees of cover",               "#0E2A4A", "#FFFFFF", "#FF7A00", "arrow"],
    ["BIKE LANE AUTHORITY",    "This is not a runway. Ring ring",         "#C8302A", "#FFFFFF", "#FFE0D8", "wheel"],
    ["KAAS & ZOON",            "Gouda grip, aged for one race weekend",   "#F2C230", "#3A2A06", "#C8781E", "dots"],
    ["SAND IN YOUR SANDWICH",  "Beach deli. Crunch included free",        "#E8D8AA", "#6A4A1A", "#C8902E", "umbrella"],
    ["ORANGE CRUSH TYRES",     "Now with 100% more orange",               "#FF7A00", "#FFFFFF", "#1A1C20", "wheel"],
    ["TULIP & CO CONCRETE",    "Dune-proof since 1948",                   "#A8A8A2", "#1A1C20", "#E8242C", "leaf"],
    ["HERRING EXPRESS",        "Raw, with onions, under 2.4 seconds",     "#2A5A7A", "#E8F2FF", "#9AC8E8", "fork"],
    ["DIKE & DAM PLUMBING",    "Holding back the sea since forever",      "#1E3A6A", "#E8F0FF", "#6AA8E0", "wave"],
    ["GEZELLIG CARAVANS",      "Pitch up at Hugenholtz. Stay a week",     "#F4EEE0", "#2A4A2A", "#5A9A4A", "flag"],
    ["CLOGWORKS",              "Safety footwear for the pit lane",        "#E8A020", "#2A1A06", "#8A4A12", "lock"],
    ["DUTCH COURAGE COFFEE",   "Brewed strong enough for Scheivlak",      "#3A1E12", "#F4E0C0", "#E8A040", "fire"],
    ["FLAT COUNTRY GYMS",      "Our only hill is Hunserug",               "#141820", "#F2F2F2", "#FF7A00", "mountain"],
    ["BITTERBAL BOX",          "Six for the grid, six for the parade",    "#B8681E", "#FFF2D8", "#7A3A0E", "dots"],
    ["NORTH SEA BREEZE MINTS", "Crosswind at Hunserug, now in your mouth","#0E4A44", "#E0FFF6", "#5FE8C8", "wind"],
    ["POLDER PARKING",         "Below sea level, above expectations",     "#2E3A2A", "#E8F2DC", "#A8D860", "screen"],
    ["HAGELSLAG HOLDINGS",     "Sprinkles on everything. No questions",   "#1A1410", "#FFE8F0", "#FF8AC0", "dots"],
  ],
  use(set){
    const want = set === "monaco" ? this.MONACO : set === "silverstone" ? this.SILVERSTONE : set === "zandvoort" ? this.ZANDVOORT : this.VEGAS;
    if(this.LIST === want) return;
    this.dispose(); this.LIST = want;
  },

  mark(g, kind, x, y, r, col){
    g.save(); g.translate(x, y); g.fillStyle = col; g.strokeStyle = col;
    g.lineWidth = r * 0.22; g.lineCap = "round"; g.lineJoin = "round";
    const P = (...pts) => { g.beginPath(); pts.forEach(([a, b], i) => i ? g.lineTo(a * r, b * r) : g.moveTo(a * r, b * r)); g.closePath(); g.fill(); };
    switch(kind){
      case "bolt": P([0.1,-1],[0.6,-0.1],[0.18,-0.05],[0.5,1],[-0.55,-0.05],[-0.05,-0.1]); break;
      case "wheel": g.beginPath(); g.arc(0,0,r,0,TAU); g.fill();
        g.globalCompositeOperation="destination-out"; g.beginPath(); g.arc(0,0,r*0.44,0,TAU); g.fill();
        g.globalCompositeOperation="source-over"; break;
      case "ring": g.lineWidth=r*0.3; g.beginPath(); g.arc(0,r*0.15,r*0.75,0,TAU); g.stroke();
        P([0,-1],[0.3,-0.55],[-0.3,-0.55]); break;
      case "leaf": g.beginPath(); g.ellipse(0,0,r*0.5,r,0.5,0,TAU); g.fill(); break;
      case "fork": for(const dx of [-0.5,0,0.5]) g.fillRect(dx*r-r*0.1, -r, r*0.2, r*0.9);
        g.fillRect(-r*0.16,-r*0.2,r*0.32,r*1.2); break;
      case "arrow": P([-1,-0.3],[0.2,-0.3],[0.2,-0.8],[1,0],[0.2,0.8],[0.2,0.3],[-1,0.3]); break;
      case "flag": g.fillRect(-r*0.9,-r,r*0.2,r*2);
        for(let i=0;i<3;i++) for(let j=0;j<2;j++) if((i+j)%2===0) g.fillRect(-r*0.7+i*r*0.55,-r+j*r*0.55,r*0.55,r*0.55); break;
      case "umbrella": g.beginPath(); g.arc(0,r*0.2,r,Math.PI,0); g.fill(); g.fillRect(-r*0.08,r*0.2,r*0.16,r*0.8); break;
      case "tooth": g.beginPath(); g.moveTo(-r,-r*0.6); g.quadraticCurveTo(0,-r*1.3,r,-r*0.6);
        g.lineTo(r*0.4,r); g.lineTo(0,r*0.1); g.lineTo(-r*0.4,r); g.closePath(); g.fill(); break;
      case "wave": g.lineWidth=r*0.3; g.beginPath();
        for(let i=-1;i<=1;i+=0.02) g.lineTo(i*r, Math.sin(i*4)*r*0.5); g.stroke(); break;
      case "cone": P([0,-1],[0.7,1],[-0.7,1]); g.fillRect(-r*0.9,r*0.85,r*1.8,r*0.3); break;
      case "dots": for(const [a,b] of [[-0.6,-0.4],[0.4,-0.6],[0,0.2],[0.7,0.5],[-0.5,0.6]]){
          g.beginPath(); g.arc(a*r,b*r,r*0.3,0,TAU); g.fill(); } break;
      case "fire": g.beginPath(); g.moveTo(0,-r); g.quadraticCurveTo(r,0,r*0.4,r);
        g.lineTo(-r*0.4,r); g.quadraticCurveTo(-r,0,0,-r); g.fill(); break;
      case "screen": g.fillRect(-r,-r*0.75,r*2,r*1.4); g.fillRect(-r*0.25,r*0.65,r*0.5,r*0.35); break;
      case "stack": for(let i=0;i<3;i++){ g.beginPath(); g.ellipse(0,-r*0.5+i*r*0.55,r,r*0.3,0,0,TAU); g.fill(); } break;
      case "mountain": P([-1,0.8],[-0.2,-0.7],[0.3,0],[0.6,-0.4],[1,0.8]); break;
      case "wind": g.lineWidth=r*0.24; g.beginPath();
        g.moveTo(-r,-r*0.4); g.lineTo(r*0.5,-r*0.4); g.moveTo(-r,0); g.lineTo(r,0);
        g.moveTo(-r,r*0.4); g.lineTo(r*0.2,r*0.4); g.stroke(); break;
      case "lock": g.lineWidth=r*0.24; g.beginPath(); g.arc(0,-r*0.25,r*0.5,Math.PI,0); g.stroke();
        g.fillRect(-r*0.7,-r*0.25,r*1.4,r*1.1); break;
      case "scissors": g.lineWidth=r*0.2; g.beginPath(); g.moveTo(-r*0.7,-r*0.8); g.lineTo(r*0.5,r*0.5);
        g.moveTo(r*0.7,-r*0.8); g.lineTo(-r*0.5,r*0.5); g.stroke();
        g.beginPath(); g.arc(-r*0.6,r*0.7,r*0.3,0,TAU); g.arc(r*0.6,r*0.7,r*0.3,0,TAU); g.fill(); break;
    }
    g.restore();
  },

  canvas(i){
    const A = this.LIST[i % this.LIST.length];
    const [name, tag, panel, ink, logo, kind] = A;
    const W = this.W, H = this.H;
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const g = cv.getContext("2d");
    g.fillStyle = panel; g.fillRect(0, 0, W, H);
    // a wash across the panel so it is not one flat rectangle of colour
    const gd = g.createLinearGradient(0, 0, W, H);
    gd.addColorStop(0, "rgba(255,255,255,.10)"); gd.addColorStop(0.5, "rgba(255,255,255,0)");
    gd.addColorStop(1, "rgba(0,0,0,.22)");
    g.fillStyle = gd; g.fillRect(0, 0, W, H);
    // a stripe of the mark's colour down the left, with the mark on it
    g.fillStyle = "rgba(255,255,255,.07)"; g.fillRect(0, 0, H, H);
    this.mark(g, kind, H * 0.5, H * 0.5, H * 0.26, logo);
    g.fillStyle = ink; g.textAlign = "left"; g.textBaseline = "alphabetic";
    let fs = H * 0.34;
    g.font = "800 italic " + fs.toFixed(0) + "px 'Saira Condensed',Impact,sans-serif";
    while(g.measureText(name).width > W - H - 24 && fs > 12){
      fs -= 2; g.font = "800 italic " + fs.toFixed(0) + "px 'Saira Condensed',Impact,sans-serif";
    }
    g.fillText(name, H + 12, H * 0.48);
    g.fillStyle = logo;
    let ts = H * 0.155;
    g.font = "700 " + ts.toFixed(0) + "px 'Saira Condensed',sans-serif";
    while(g.measureText(tag).width > W - H - 24 && ts > 8){
      ts -= 1; g.font = "700 " + ts.toFixed(0) + "px 'Saira Condensed',sans-serif";
    }
    g.fillText(tag, H + 12, H * 0.74);
    // the rule under the wordmark, and a thin frame
    g.fillStyle = logo; g.fillRect(H + 12, H * 0.55, Math.min(W - H - 24, 160), 3);
    g.strokeStyle = "rgba(0,0,0,.45)"; g.lineWidth = 6; g.strokeRect(3, 3, W - 6, H - 6);
    return cv;
  },

  tex(i){
    i = ((i % this.LIST.length) + this.LIST.length) % this.LIST.length;
    if(this.texs[i]) return this.texs[i];
    const t = new THREE.CanvasTexture(this.canvas(i));
    t.encoding = THREE.sRGBEncoding; t.anisotropy = 8;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    this.texs[i] = t; return t;
  },

  // one shared material per advert, per lit state
  mat(seed, night){
    const i = Math.abs(Math.floor((seed || 0) * 977)) % this.LIST.length;
    const key = i + "|" + (night ? 1 : 0);
    let m = this.mats.get(key);
    if(m) return m;
    const t = this.tex(i);
    m = new THREE.MeshStandardMaterial({
      map:t, roughness:0.72, metalness:0.0, side:THREE.DoubleSide,
      emissiveMap:night ? t : null,
      emissive:night ? new THREE.Color(1, 1, 1) : new THREE.Color(0, 0, 0),
      emissiveIntensity:night ? 0.62 : 0,
    });
    this.mats.set(key, m); return m;
  },
  dispose(){ for(const t of this.texs) if(t) t.dispose(); this.texs.length = 0; this.mats.clear(); },
};

/* ---------- 9b. the render pipeline ---------------------------------------
   Three.js ships EffectComposer and UnrealBloomPass as example modules. This
   file has to keep working offline from one document, so nothing can be
   imported and they are written out here instead, against the r128 API. The
   bloom is the same algorithm UnrealBloomPass uses — a luminosity high pass,
   then five successively halved separable gaussians, composited with a falling
   weight — rather than a transcription of that file.

   Colour is handled exactly once, at the very end. The scene renders linear
   into a half-float buffer with the renderer's own tone mapping and output
   encoding switched off; bloom works on those linear values; the combine shader
   does the exposure, ACES and the sRGB transfer on the way out. Nothing else in
   the chain touches either, which is the mistake that is easy to make here.
   ------------------------------------------------------------------------- */
const PP = {
  on:false, rend:null, W:0, H:0,
  LEVELS:5,

  // a full-screen pass: one triangle, no attributes beyond the corners
  quadScene:null, quadCam:null, quadMesh:null,

  vert:`varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,

  init(rend){
    this.rend = rend;
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quadScene = new THREE.Scene();
    this.quadMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
    this.quadMesh.frustumCulled = false;
    this.quadScene.add(this.quadMesh);

    const half = { minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter,
                   format:THREE.RGBAFormat, type:THREE.HalfFloatType,
                   encoding:THREE.LinearEncoding, depthBuffer:true, stencilBuffer:false };
    this.sceneRT = new THREE.WebGLRenderTarget(1, 1, half);
    this.sceneRT.depthBuffer = true;
    this.hiRT = new THREE.WebGLRenderTarget(1, 1, Object.assign({}, half, { depthBuffer:false }));
    this.blurA = []; this.blurB = [];
    for(let i = 0; i < this.LEVELS; i++){
      this.blurA.push(new THREE.WebGLRenderTarget(1, 1, Object.assign({}, half, { depthBuffer:false })));
      this.blurB.push(new THREE.WebGLRenderTarget(1, 1, Object.assign({}, half, { depthBuffer:false })));
    }
    // the tone-mapped image, still needing the edge pass: 8 bit is plenty here
    this.ldrRT = new THREE.WebGLRenderTarget(1, 1, { minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter,
      format:THREE.RGBAFormat, type:THREE.UnsignedByteType, encoding:THREE.LinearEncoding, depthBuffer:false, stencilBuffer:false });

    this.mHi = new THREE.ShaderMaterial({
      uniforms:{ tDiffuse:{ value:null }, threshold:{ value:1.0 }, knee:{ value:0.6 }, scale:{ value:1.0 } },
      vertexShader:this.vert,
      fragmentShader:`uniform sampler2D tDiffuse; uniform float threshold, knee, scale; varying vec2 vUv;
void main(){
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  // a soft knee, so a surface just under the cut does not pop as it crosses it
  float s = clamp(l - threshold + knee, 0.0, 2.0 * knee);
  s = s * s / (4.0 * knee + 1e-4);
  float w = max(s, l - threshold) / max(l, 1e-4);
  gl_FragColor = vec4(c * w * scale, 1.0);
}`});

    this.mBlur = new THREE.ShaderMaterial({
      uniforms:{ tDiffuse:{ value:null }, dir:{ value:new THREE.Vector2(1, 0) }, texel:{ value:new THREE.Vector2() } },
      vertexShader:this.vert,
      fragmentShader:`uniform sampler2D tDiffuse; uniform vec2 dir, texel; varying vec2 vUv;
void main(){
  // a nine-tap gaussian folded into five bilinear fetches
  vec2 o = dir * texel;
  vec3 c = texture2D(tDiffuse, vUv).rgb * 0.2270270270;
  c += texture2D(tDiffuse, vUv + o * 1.3846153846).rgb * 0.3162162162;
  c += texture2D(tDiffuse, vUv - o * 1.3846153846).rgb * 0.3162162162;
  c += texture2D(tDiffuse, vUv + o * 3.2307692308).rgb * 0.0702702703;
  c += texture2D(tDiffuse, vUv - o * 3.2307692308).rgb * 0.0702702703;
  gl_FragColor = vec4(c, 1.0);
}`});

    this.mCombine = new THREE.ShaderMaterial({
      uniforms:{
        tDiffuse:{ value:null },
        b0:{ value:null }, b1:{ value:null }, b2:{ value:null }, b3:{ value:null }, b4:{ value:null },
        strength:{ value:0.9 }, radius:{ value:0.7 }, exposure:{ value:1.0 }, tint:{ value:new THREE.Color(1,1,1) },
      },
      vertexShader:this.vert,
      fragmentShader:`uniform sampler2D tDiffuse, b0, b1, b2, b3, b4;
uniform float strength, radius, exposure; uniform vec3 tint; varying vec2 vUv;
float lw(float f){ return mix(1.0, 1.2 - f, radius); }
// ACES, in the fitted form that runs cheaply in a fragment shader
vec3 aces(vec3 x){
  const mat3 IN = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 OUT = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  vec3 v = IN * x;
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return clamp(OUT * (a / b), 0.0, 1.0);
}
void main(){
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  vec3 bl = lw(0.0) * texture2D(b0, vUv).rgb
          + lw(0.2) * texture2D(b1, vUv).rgb
          + lw(0.4) * texture2D(b2, vUv).rgb
          + lw(0.6) * texture2D(b3, vUv).rgb
          + lw(0.8) * texture2D(b4, vUv).rgb;
  c += bl * strength * tint;
  c = aces(c * exposure);
  // the sRGB transfer, done here and nowhere else in the chain
  vec3 s = mix(c * 12.92, 1.055 * pow(max(c, vec3(1e-5)), vec3(0.41666)) - 0.055, step(vec3(0.0031308), c));
  gl_FragColor = vec4(s, 1.0);
}`});

    this.mFxaa = new THREE.ShaderMaterial({
      uniforms:{ tDiffuse:{ value:null }, texel:{ value:new THREE.Vector2() } },
      vertexShader:this.vert,
      fragmentShader:`uniform sampler2D tDiffuse; uniform vec2 texel; varying vec2 vUv;
// a compact FXAA: find the local edge, step along it, keep whichever of the
// blurred and the original pair sits inside the neighbourhood's range
void main(){
  vec3 rgbNW = texture2D(tDiffuse, vUv + vec2(-1.0, -1.0) * texel).rgb;
  vec3 rgbNE = texture2D(tDiffuse, vUv + vec2( 1.0, -1.0) * texel).rgb;
  vec3 rgbSW = texture2D(tDiffuse, vUv + vec2(-1.0,  1.0) * texel).rgb;
  vec3 rgbSE = texture2D(tDiffuse, vUv + vec2( 1.0,  1.0) * texel).rgb;
  vec4 texM  = texture2D(tDiffuse, vUv);
  vec3 L = vec3(0.299, 0.587, 0.114);
  float lNW = dot(rgbNW, L), lNE = dot(rgbNE, L), lSW = dot(rgbSW, L), lSE = dot(rgbSE, L), lM = dot(texM.rgb, L);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  if(lMax - lMin < max(0.0833, lMax * 0.166)){ gl_FragColor = texM; return; }
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
  float red = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);
  float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);
  dir = clamp(dir * rcp, -8.0, 8.0) * texel;
  vec3 rgbA = 0.5 * (texture2D(tDiffuse, vUv + dir * (1.0/3.0 - 0.5)).rgb +
                     texture2D(tDiffuse, vUv + dir * (2.0/3.0 - 0.5)).rgb);
  vec3 rgbB = rgbA * 0.5 + 0.25 * (texture2D(tDiffuse, vUv - dir * 0.5).rgb +
                                   texture2D(tDiffuse, vUv + dir * 0.5).rgb);
  float lB = dot(rgbB, L);
  gl_FragColor = vec4((lB < lMin || lB > lMax) ? rgbA : rgbB, texM.a);
}`});

    this.ready = true;
    return this;
  },

  size(w, h){
    if(w === this.W && h === this.H) return;
    this.W = w; this.H = h;
    this.sceneRT.setSize(w, h);
    this.ldrRT.setSize(w, h);
    let bw = Math.max(1, Math.round(w / 2)), bh = Math.max(1, Math.round(h / 2));
    this.hiRT.setSize(bw, bh);
    for(let i = 0; i < this.LEVELS; i++){
      this.blurA[i].setSize(bw, bh); this.blurB[i].setSize(bw, bh);
      bw = Math.max(1, Math.round(bw / 2)); bh = Math.max(1, Math.round(bh / 2));
    }
  },

  blit(mat, target){
    this.quadMesh.material = mat;
    this.rend.setRenderTarget(target || null);
    this.rend.render(this.quadScene, this.quadCam);
  },

  /* scene in, canvas out */
  render(scene, cam, opt){
    const r = this.rend;
    const w = r.domElement.width, h = r.domElement.height;
    this.size(w, h);

    // 1. the world, linear, untouched by the renderer's own colour steps
    const oTone = r.toneMapping, oEnc = r.outputEncoding;
    r.toneMapping = THREE.NoToneMapping; r.outputEncoding = THREE.LinearEncoding;
    r.setRenderTarget(this.sceneRT);
    r.clear();
    r.render(scene, cam);

    // 2. what is bright enough to bloom
    this.mHi.uniforms.tDiffuse.value = this.sceneRT.texture;
    this.mHi.uniforms.threshold.value = opt.threshold;
    this.mHi.uniforms.knee.value = opt.knee == null ? 0.5 : opt.knee;
    this.blit(this.mHi, this.hiRT);

    // 3. five halvings, each blurred along both axes
    let src = this.hiRT;
    for(let i = 0; i < this.LEVELS; i++){
      const a = this.blurA[i], b = this.blurB[i];
      this.mBlur.uniforms.tDiffuse.value = src.texture;
      this.mBlur.uniforms.dir.value.set(1, 0);
      this.mBlur.uniforms.texel.value.set(1 / a.width, 1 / a.height);
      this.blit(this.mBlur, a);
      this.mBlur.uniforms.tDiffuse.value = a.texture;
      this.mBlur.uniforms.dir.value.set(0, 1);
      this.blit(this.mBlur, b);
      src = b;
    }

    // 4. composite, expose, tone map, encode — the only place colour changes
    const u = this.mCombine.uniforms;
    u.tDiffuse.value = this.sceneRT.texture;
    for(let i = 0; i < this.LEVELS; i++) u["b" + i].value = this.blurB[i].texture;
    u.strength.value = opt.strength; u.radius.value = opt.radius; u.exposure.value = opt.exposure;
    this.blit(this.mCombine, opt.fxaa === false ? null : this.ldrRT);

    // 5. edges
    if(opt.fxaa !== false){
      this.mFxaa.uniforms.tDiffuse.value = this.ldrRT.texture;
      this.mFxaa.uniforms.texel.value.set(1 / w, 1 / h);
      this.blit(this.mFxaa, null);
    }
    r.setRenderTarget(null);
    r.toneMapping = oTone; r.outputEncoding = oEnc;
  },

  dispose(){
    if(!this.ready) return;
    for(const rt of [this.sceneRT, this.hiRT, this.ldrRT].concat(this.blurA, this.blurB)) rt.dispose();
  },
};

/* A small procedural room, filtered into an environment map. Glass and metal
   need something to reflect or they read as flat paint; this is what gives the
   towers their sheen. It is never used as a background. */
function buildEnv(rend, night, P){
  const pm = new THREE.PMREMGenerator(rend);
  pm.compileEquirectangularShader();
  const s = new THREE.Scene();
  const box = (col, x, y, z, w, h, d, emissive) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color:G3.col(col), roughness:1, metalness:0,
        emissive:G3.col(emissive || "#000000"), emissiveIntensity:emissive ? 1 : 0, side:THREE.BackSide }));
    m.position.set(x, y, z); s.add(m); return m;
  };
  if(night){
    /* A dark desert sky with the city's glow coming up from below. Everything
       warm has to sit under the horizon: a bright surface anywhere overhead
       lights every roof in the scene, which is not what a night sky does. */
    box("#05040A", 0, 0, 0, 900, 900, 900);                  // the sky, all round
    box("#000000", 0, -300, 0, 880, 10, 880, "#4A3418");     // the glow off the ground
    box("#000000", 0, -150, -430, 880, 260, 10, "#2A1830");  // and off the Strip, low down
    box("#000000", -430, -150, 0, 10, 240, 880, "#301022");
    box("#000000", 430, -150, 0, 10, 240, 880, "#0E2438");
  } else {
    box("#9FB6D4", 0, 0, 0, 900, 900, 900);
    box("#000000", 0, 400, 0, 880, 10, 880, "#C8D8EE");      // the sky
    box("#000000", 0, -300, 0, 880, 10, 880, G3.cssGround || "#6E7460");
    box("#000000", 240, 260, 240, 160, 160, 160, "#FFF2D8"); // the sun's quarter
  }
  const rt = pm.fromScene(s, 0.04, 1, 1200);
  s.traverse(o => { if(o.isMesh){ o.geometry.dispose(); o.material.dispose(); } });
  pm.dispose();
  return rt;
}

/* ---------- 10. the 3D renderer ------------------------------------------
   The world is built once per session as a Three.js scene: the circuit as
   ribbon meshes, the scenery as solids, the cars as little assemblies that get
   moved each frame. Physics, AI and the track builder are untouched — this
   only replaces what was being painted onto a 2D canvas.

   Game space is x,y along the ground with z up. Three is y-up, so everything
   goes through V3(x, y, z) -> (x, z, y).
   ------------------------------------------------------------------------ */
const V3 = (x, y, z) => new THREE.Vector3(x, z || 0, y);
function cssOf(c){ return (typeof c === "string") ? c : "#888888"; }

const G3 = {
  ok:false, scene:null, rend:null, cv:null, camIso:null, camTV:null,
  world:null, cars:[], sun:null, built:null, wet:0, sparks:null, sparkN:0,
  mats:new Map(), texes:new Map(), dyn:[],

  srgb(t){ t.encoding = THREE.sRGBEncoding; return t; },
  col(c){ return new THREE.Color(cssOf(c)).convertSRGBToLinear(); },
  // Lambert cannot see an environment map, so every surface is Standard now.
  // Anything that does not say otherwise is a rough dielectric.
  mat(col, opts){
    const key = cssOf(col) + "|" + (opts ? JSON.stringify(opts) : "");
    let m = this.mats.get(key);
    if(!m){
      const o = Object.assign({ color:this.col(col), roughness:0.88, metalness:0.0 }, opts || {});
      if(o.emissive) o.emissive = this.col(o.emissive);
      m = new THREE.MeshStandardMaterial(o);
      this.mats.set(key, m);
    }
    return m;
  },
  /* A surface described the way the landmarks want to describe one: a facade
     style, a colour, and whether the windows are alight. The window grid,
     the mullion relief and the roughness break-up all come from generated
     canvases, so detail costs texture memory rather than triangles. */
  faceMat(style, col, night, opts){
    const key = "f|" + style + "|" + cssOf(col) + "|" + (night ? 1 : 0) + "|" + (opts ? JSON.stringify(opts) : "");
    let m = this.mats.get(key);
    if(m) return m;
    const S2 = PTEX.STYLE[style] || PTEX.STYLE.stucco;
    const o = {
      color:this.col(S2.tint ? shade(col, S2.tint) : col),
      roughness:S2.rough, metalness:S2.metal,
      envMapIntensity:S2.env == null ? 1 : S2.env,
    };
    const nm = PTEX.normalTex(style);
    if(nm){ o.normalMap = nm; o.normalScale = new THREE.Vector2(S2.nrm || 0.6, S2.nrm || 0.6); }
    const rg = PTEX.roughTex(style);
    if(rg) o.roughnessMap = rg;
    if(night && S2.lit){
      o.emissiveMap = PTEX.windowTex(style, col);
      o.emissive = new THREE.Color(1, 1, 1);
      o.emissiveIntensity = S2.glow == null ? 1.15 : S2.glow;
    }
    Object.assign(o, opts || {});
    m = new THREE.MeshStandardMaterial(o);
    m.userData.face = true;
    this.mats.set(key, m);
    return m;
  },
  // the pool a streetlight leaves on the tarmac. Additive and unlit, so it is
  // one cheap quad instead of a real light with a shadow budget.
  poolMat(col, inten){
    const key = "pool|" + cssOf(col) + "|" + inten;
    let m = this.mats.get(key);
    if(m) return m;
    m = new THREE.MeshBasicMaterial({ color:this.col(col), transparent:true, opacity:inten,
      blending:THREE.AdditiveBlending, depthWrite:false, map:PTEX.pool() });
    this.mats.set(key, m); return m;
  },
  /* a media facade: a canvas of moving colour, shared by everything that wants
     one in that hue, and stepped on in G3.frame rather than per building */
  screen(col){
    const key = "scr|" + cssOf(col);
    let m = this.mats.get(key);
    if(m) return m;
    const cv = document.createElement("canvas"); cv.width = 256; cv.height = 128;
    const t = G3.srgb(new THREE.CanvasTexture(cv));
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
    m = new THREE.MeshStandardMaterial({ map:t, emissiveMap:t, emissive:new THREE.Color(1, 1, 1),
      emissiveIntensity:1.9, roughness:0.5, metalness:0.0, side:THREE.DoubleSide });
    this.mats.set(key, m);
    this.dyn.push({ kind:"screen", ctx:cv.getContext("2d"), tx:t, col:cssOf(col), t:Math.random() * 9 });
    return m;
  },
  // a surface that is its own light: signs, screens, neon, lit crowns
  glowMat(col, inten, opts){
    const key = "g|" + cssOf(col) + "|" + inten + "|" + (opts ? JSON.stringify(opts) : "");
    let m = this.mats.get(key);
    if(m) return m;
    m = new THREE.MeshStandardMaterial(Object.assign({
      color:this.col("#000000"), roughness:1, metalness:0,
      emissive:this.col(col), emissiveIntensity:inten,
    }, opts || {}));
    this.mats.set(key, m);
    return m;
  },
  // a generated canvas turned into one shared repeating material
  texMat(tex){
    const key = "t|" + (tex.id || (tex.id = "tex" + (this.texes.size + Math.random())));
    let m = this.mats.get(key);
    if(!m){
      let t = this.texes.get(tex);
      if(!t){ t = G3.srgb(new THREE.CanvasTexture(tex.img)); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; this.texes.set(tex, t); }
      m = new THREE.MeshStandardMaterial({ map:t, roughness:0.9, metalness:0.0 });
      this.mats.set(key, m);
    }
    return m;
  },
  // BoxGeometry lays its UVs 0..1 on every face; stretch each one so the tile
  // repeats at its real size in metres
  tileBoxUV(g, l, h, w, tex){
    const uv = g.attributes.uv, sx = tex.sx, sy = tex.sy;
    const face = [[w, h], [w, h], [l, w], [l, w], [l, h], [l, h]];
    for(let f = 0; f < 6; f++){
      const ru = Math.max(0.25, face[f][0] / sx), rv = Math.max(0.25, face[f][1] / sy);
      for(let k = 0; k < 4; k++){
        const i = f * 4 + k;
        uv.setXY(i, uv.getX(i) * ru, uv.getY(i) * rv);
      }
    }
    uv.needsUpdate = true;
  },

  init(){
    if(this.ok || typeof THREE === "undefined") return this.ok;
    const host = $("#view").parentNode;
    this.cv = document.createElement("canvas");
    this.cv.id = "view3";
    this.cv.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
    host.insertBefore(this.cv, $("#view"));
    $("#view").style.display = "none";
    try{
      this.rend = new THREE.WebGLRenderer({ canvas:this.cv, antialias:true, powerPreference:"high-performance" });
    }catch(e){ $("#view").style.display = ""; this.cv.remove(); return false; }
    this.rend.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    // these two are what the renderer does on its own when the composer is off.
    // With it on, PP.render turns both off for the scene pass and does the work
    // itself at the end, so the image is tone mapped and encoded exactly once.
    this.rend.outputEncoding = THREE.sRGBEncoding;
    this.rend.toneMapping = THREE.ACESFilmicToneMapping;
    this.rend.toneMappingExposure = 1.0;
    this.rend.shadowMap.enabled = true;
    this.rend.shadowMap.type = THREE.PCFSoftShadowMap;
    /* The browser takes the GPU's context away when it is short of memory (a few
       heavy circuits in a row can do it). That is not a reason to give up on 3D:
       wait, and when it comes back rebuild the world, which re-creates everything
       that lived on the GPU. */
    this.cv.addEventListener("webglcontextlost", e => { e.preventDefault(); this.lost = true; console.warn("WebGL context lost; waiting for it to come back"); });
    this.cv.addEventListener("webglcontextrestored", () => { this.lost = false; this.built = null; console.warn("WebGL context restored; rebuilding the world"); });
    try{ if(CFG.fx !== 0) PP.init(this.rend); }catch(e){ console.warn("post-processing unavailable", e); PP.ready = false; }
    this.scene = new THREE.Scene();
    // the true isometric angle: 45 degrees round, 35.26 up
    this.camIso = new THREE.OrthographicCamera(-50, 50, 50, -50, 0.5, 6000);
    this.camTV = new THREE.PerspectiveCamera(38, 1, 0.5, 6000);
    this.resize();
    addEventListener("resize", () => this.resize());
    this.ok = true;
    return true;
  },
  resize(){
    if(!this.rend) return;
    const w = this.cv.clientWidth || 1, h = this.cv.clientHeight || 1;
    this.rend.setSize(w, h, false);
    this.camTV.aspect = w / h; this.camTV.updateProjectionMatrix();
  },

  /* ---- geometry helpers ---- */
  // a flat ribbon along the circuit between two lateral offsets
  // true when a lateral offset reaches past the corner's own centre of curvature
  inverts(T, k, o){ const c = T.curv[k]; return !!c && o * c > 0.80; },
  safeOff(T, k, o){ const c = T.curv[k]; return (c && o * c > 0.80) ? 0.80 / c : o; },
  strip(T, fa, fb, lift, uvRepeat, filter){
    const pos = [], uv = [], idx = [];
    const n = T.n, E = (k, o0) => {
      const o = this.safeOff(T, k, o0);
      const bz = bankZ(T, k, o) + o * T.camber[k];
      return [T.x[k] + T.nx[k] * o, T.y[k] + T.ny[k] * o, T.z[k] + bz + lift];
    };
    let v = 0;
    for(let i = 0; i < n; i++){
      if(filter && !filter(i)) continue;
      const j = (i + 1) % n;
      const a0 = typeof fa === "function" ? fa(i) : fa, b0 = typeof fb === "function" ? fb(i) : fb;
      const a1 = typeof fa === "function" ? fa(j) : fa, b1 = typeof fb === "function" ? fb(j) : fb;
      if(Math.abs(a0 - a1) > 6 || Math.abs(b0 - b1) > 6) continue;   // the offset flipped sides
      // past the centre of curvature the ribbon would turn inside out
      if(this.inverts(T, i, a0) || this.inverts(T, i, b0) ||
         this.inverts(T, j, a1) || this.inverts(T, j, b1)) continue;
      const u0 = (i * T.ds) / (uvRepeat || 8), u1 = ((i + 1) * T.ds) / (uvRepeat || 8);
      // a banked or cambered cross-section is curved, so cut the ribbon across into
      // narrow lanes there; a flat one stays the single quad it always was
      const curved = T.bankZf && ((T.bankW && (T.bankW[i] || T.bankW[j])) || T.camber[i] || T.camber[j] || T.bankCamber && (T.bankCamber[i] || T.bankCamber[j]));
      const K = curved ? Math.max(1, Math.ceil(Math.max(Math.abs(b0 - a0), Math.abs(b1 - a1)) / 1.5)) : 1;
      for(let q = 0; q < K; q++){
        const f0 = q / K, f1 = (q + 1) / K;
        const p0 = E(i, a0 + (b0 - a0) * f0), p1 = E(i, a0 + (b0 - a0) * f1), p2 = E(j, a1 + (b1 - a1) * f1), p3 = E(j, a1 + (b1 - a1) * f0);
        for(const p of [p0, p1, p2, p3]) pos.push(p[0], p[2], p[1]);
        uv.push(f0, u0, f1, u0, f1, u1, f0, u1);
        idx.push(v, v + 1, v + 2, v, v + 2, v + 3); v += 4;
      }
    }
    if(!pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  },
  // a vertical wall standing on the circuit at one lateral offset
  wall(T, off, hgt, filter, drop){
    const dropOf = typeof drop === "function" ? drop : (() => drop || 0);
    const pos = [], uv = [], idx = [];
    const n = T.n, E = (k) => {
      const o = this.safeOff(T, k, typeof off === "function" ? off(k) : off);
      return [T.x[k] + T.nx[k] * o, T.y[k] + T.ny[k] * o, T.z[k] + bankZ(T, k, o)];
    };
    let v = 0;
    for(let i = 0; i < n; i++){
      if(filter && !filter(i)) continue;
      const j = (i + 1) % n, a = E(i), b = E(j);
      const lo = -dropOf(i);
      pos.push(a[0], a[2] + lo, a[1], b[0], b[2] + lo, b[1], b[0], b[2] + hgt, b[1], a[0], a[2] + hgt, a[1]);
      const u0 = (i * T.ds) / 8, u1 = ((i + 1) * T.ds) / 8;
      uv.push(u0, 0, u1, 0, u1, 1, u0, 1);
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
      v += 4;
    }
    if(!pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  },
  // walls are seen from both sides, so the material says so rather than the
  // geometry carrying two windings — that cancelled the normals and went black
  // a clone loses any shader hook, so carry it across
  twoSided(m){ const c = m.clone(); c.side = THREE.DoubleSide;
    if(m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile){ c.onBeforeCompile = m.onBeforeCompile; c.customProgramCacheKey = m.customProgramCacheKey; }
    return c; },
  /* A material that fades by discarding pixels in a 4x4 Bayer pattern rather
     than by blending. It stays in the opaque pass, writes depth, and never needs
     sorting, so a tunnel roof can go see-through without flickering against the
     road under it. All of them share one uniform, so one number fades the lot;
     edge pieces use a second one that never drops as far, so the tunnel's shape
     is still there when its roof is not. */
  fadeU:{ value:1 }, fadeEdgeU:{ value:1 },
  ditherMat(base, edge){
    const m = base.clone();
    const U = edge ? this.fadeEdgeU : this.fadeU;
    const prev = base.onBeforeCompile;
    m.onBeforeCompile = (sh, r) => {
      if(prev && prev !== THREE.Material.prototype.onBeforeCompile) prev(sh, r);
      sh.uniforms.uFade = U;
      sh.fragmentShader = "uniform float uFade;\n" +
        "float bayer2(vec2 a){ a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }\n" +
        "float bayer4(vec2 a){ return bayer2(0.5 * a) * 0.25 + bayer2(a); }\n" +
        sh.fragmentShader.replace("void main() {", "void main() {\n  if(uFade < 0.995 && bayer4(gl_FragCoord.xy) >= uFade) discard;");
    };
    m.customProgramCacheKey = () => "dither|" + (edge ? 1 : 0) + "|" + (base.customProgramCacheKey ? base.customProgramCacheKey() : "");
    m.userData.dither = true;
    return m;
  },
  /* Cut-away for whatever stands between the overhead camera and your car.
     The camera looks down a straight line, so an occluder is anything nearer the
     lens than the car, close to that line, and clearly above the car (the road
     and the ground beside it are never above it, so they stay). Those pixels
     are dropped in a Bayer pattern, thinning out toward the middle of the hole:
     it stays in the opaque pass and there is nothing to sort. One set of
     uniforms serves every patched material. */
  cutU:{ uCutP:{ value:new THREE.Vector3() }, uCutD:{ value:new THREE.Vector3(0, 0, 1) },
         uCutV:{ value:new THREE.Matrix4() }, uCutR:{ value:9 }, uCutOn:{ value:0 } },
  cutMat(m){
    if(!m || !m.userData || m.userData.cut) return;
    if(!(m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial || m.isMeshBasicMaterial)) return;
    m.userData.cut = true;
    const prev = m.onBeforeCompile, U = this.cutU;
    const key = (typeof m.customProgramCacheKey === "function" ? m.customProgramCacheKey() : "") + "|cut";
    m.onBeforeCompile = (sh, r) => {
      if(prev && prev !== THREE.Material.prototype.onBeforeCompile) prev(sh, r);
      for(const k in U) sh.uniforms[k] = U[k];
      sh.vertexShader = "varying vec3 vCutView;\n" +
        sh.vertexShader.replace("#include <project_vertex>", "#include <project_vertex>\n  vCutView = mvPosition.xyz;");
      sh.fragmentShader = "uniform vec3 uCutP; uniform vec3 uCutD; uniform mat4 uCutV; uniform float uCutR; uniform float uCutOn;\n" +
        "varying vec3 vCutView;\n" +
        "float cutB2(vec2 a){ a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }\n" +
        "float cutB4(vec2 a){ return cutB2(0.5 * a) * 0.25 + cutB2(a); }\n" +
        sh.fragmentShader.replace("void main() {", "void main() {\n" +
          "  if(uCutOn > 0.5){\n" +
          "    vec3 cq = (uCutV * vec4(vCutView, 1.0)).xyz - uCutP;\n" +
          "    float ca = dot(cq, uCutD);\n" +
          "    float cp = length(cq - ca * uCutD);\n" +
          "    float cm = smoothstep(uCutR, uCutR * 0.5, cp) * smoothstep(1.0, 3.5, ca) * smoothstep(1.2, 3.0, cq.y);\n" +
          "    if(cm > 0.01 && cm * 0.92 > cutB4(gl_FragCoord.xy)) discard;\n" +
          "  }");
    };
    m.customProgramCacheKey = () => key;
    m.needsUpdate = true;
  },
  cutAll(objs){
    for(const o of objs) o.traverse(x => {
      if(!x.isMesh) return;
      for(const mm of (Array.isArray(x.material) ? x.material : [x.material])) this.cutMat(mm);
    });
  },
  /* Every solid was its own draw call — two thousand of them, twice over for
     the shadow pass. The scenery never moves, so bake it down: bucket the
     meshes by material and by a coarse grid square, and merge each bucket into
     one geometry. Draw calls collapse, and chunking keeps frustum culling
     useful. r128's UMD build has no merge helper, so this is it. */
  bake(group, cell){
    const buckets = new Map();
    const strays = [];
    group.updateMatrixWorld(true);
    group.traverse(o => {
      if(!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
      if(o.userData.dynamic) { strays.push(o); return; }
      const p = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
      const gx = Math.floor(p.x / cell), gz = Math.floor(p.z / cell);
      const key = o.material.uuid + "|" + gx + "|" + gz + "|" + (o.castShadow ? 1 : 0);
      let b = buckets.get(key);
      if(!b){ b = { mat:o.material, cast:o.castShadow, list:[] }; buckets.set(key, b); }
      b.list.push(o);
    });
    const out = new THREE.Group();
    for(const b of buckets.values()){
      if(b.list.length === 1){ out.add(b.list[0].clone()); continue; }
      let n = 0;
      const parts = [];
      for(const m of b.list){
        let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
        g = g.clone(); g.applyMatrix4(m.matrixWorld);
        if(!g.attributes.uv){
          const c = g.attributes.position.count;
          g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(c * 2), 2));
        }
        if(!g.attributes.normal) g.computeVertexNormals();
        parts.push(g); n += g.attributes.position.count;
      }
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
      let o1 = 0, o2 = 0;
      for(const g of parts){
        pos.set(g.attributes.position.array, o1);
        nor.set(g.attributes.normal.array, o1);
        uv.set(g.attributes.uv.array, o2);
        o1 += g.attributes.position.count * 3; o2 += g.attributes.position.count * 2;
        g.dispose();
      }
      const merged = new THREE.BufferGeometry();
      merged.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      merged.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
      merged.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      const mesh = new THREE.Mesh(merged, b.mat);
      mesh.castShadow = b.cast; mesh.receiveShadow = true;
      out.add(mesh);
    }
    /* The strays keep their own materials so they can be faded, but moving them
       to a new parent drops whatever transform their old parents were applying.
       Bake the world matrix into each one before it moves, or anything built
       inside a nested group lands somewhere else entirely. */
    for(const st of strays){
      st.matrixWorld.decompose(st.position, st.quaternion, st.scale);
      st.updateMatrix();
      out.add(st);
    }
    return out;
  },
  add(parent, geom, mat, shadow){
    if(!geom) return null;
    const m = new THREE.Mesh(geom, mat);
    m.receiveShadow = true; m.castShadow = false;
    parent.add(m); return m;
  },
  // a solid, given the way the 2D renderer describes one
  boxAt(parent, cx, cy, cz, l, w, h, ang, col, tex){
    const g = new THREE.BoxGeometry(l, h, w);
    if(tex) this.tileBoxUV(g, l, h, w, tex);
    const m = new THREE.Mesh(g, tex ? this.texMat(tex) : this.mat(col));
    m.position.set(cx, cz + h / 2, cy); m.rotation.y = -ang;
    m.castShadow = h > 5 || Math.max(l, w) > 8; m.receiveShadow = true;
    parent.add(m); return m;
  },
  coneAt(parent, cx, cy, cz, half, h, ang, col, seg){
    const g = new THREE.ConeGeometry(half * (seg === 4 ? Math.SQRT2 : 1), h, seg || 4);
    const m = new THREE.Mesh(g, this.mat(col));
    m.position.set(cx, cz + h / 2, cy); m.rotation.y = -ang + (seg === 4 ? Math.PI / 4 : 0);
    m.castShadow = h > 5; m.receiveShadow = true;
    parent.add(m); return m;
  },
  discAt(parent, cx, cy, cz, rx, ry, ang, col){
    const g = new THREE.CircleGeometry(1, 28);
    const m = new THREE.Mesh(g, this.mat(col));
    m.rotation.x = -Math.PI / 2; m.rotation.z = ang;
    m.scale.set(rx, ry, 1);
    m.position.set(cx, cz, cy); m.receiveShadow = true;
    parent.add(m); return m;
  },
  // a patch of ground from a world-space polygon
  patch(parent, pts, z, col, kind){
    const shape = new THREE.Shape();
    pts.forEach((p, i) => i ? shape.lineTo(p[0], p[1]) : shape.moveTo(p[0], p[1]));
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(Math.PI / 2);                              // shape is XY, lay it flat
    const t = TEX.ground(col, kind);
    let tt = this.texes.get(t);
    if(!tt){ tt = G3.srgb(new THREE.CanvasTexture(t.img)); tt.wrapS = tt.wrapT = THREE.RepeatWrapping; this.texes.set(t, tt); }
    const key = "p|" + cssOf(col) + "|" + kind;
    let mat = this.mats.get(key);
    if(!mat){ const c = tt.clone(); c.needsUpdate = true; c.encoding = THREE.sRGBEncoding; c.wrapS = c.wrapT = THREE.RepeatWrapping; c.repeat.set(0.06, 0.06);
      mat = new THREE.MeshStandardMaterial({ map:c, roughness:0.96, metalness:0.0 }); this.mats.set(key, mat); }
    const m = new THREE.Mesh(g, mat);
    m.position.y = z; m.receiveShadow = true;
    // ShapeGeometry's UVs are the raw world coords, which is what we want
    parent.add(m); return m;
  },
};

/* ---------- 10b. the Strip, built rather than painted ----------------------
   The landmarks used to be stacks of boxes and four-sided pyramids, because
   that is all the 2D painter could describe. Here each one is built for its own
   silhouette: extruded footprints for the curved and Y-shaped slabs, lathes for
   anything round, real cones for the castle turrets, an instanced lattice for
   the tower in Paris. Silhouette first, then material, then what the roofline
   does at night.

   Detail that repeats — windows, columns, turrets, balconies, lamp heads — is
   instanced or comes out of a map. Nothing here adds polygons to solve a
   problem a texture can solve.

   The 2D fallback is untouched: it still runs the old box-and-pyramid recipe in
   drawProp, so a machine without WebGL gets the same picture it got before.
   ------------------------------------------------------------------------- */

/* the shared toolkit: everything a landmark is made of */
const LB = {
  /* a rounded rectangle as a Shape, for extruding a slab tower */
  slab(l, w, r){
    const s = new THREE.Shape(), hl = l / 2, hw = w / 2;
    r = Math.min(r || 0, hl * 0.9, hw * 0.9);
    s.moveTo(-hl + r, -hw);
    s.lineTo(hl - r, -hw); if(r) s.quadraticCurveTo(hl, -hw, hl, -hw + r);
    s.lineTo(hl, hw - r);  if(r) s.quadraticCurveTo(hl, hw, hl - r, hw);
    s.lineTo(-hl + r, hw); if(r) s.quadraticCurveTo(-hl, hw, -hl, hw - r);
    s.lineTo(-hl, -hw + r);if(r) s.quadraticCurveTo(-hl, -hw, -hl + r, -hw);
    return s;
  },
  /* a gently bowed slab: the shape Wynn, Encore and Aria all share */
  arc(l, w, bow){
    const s = new THREE.Shape(), hl = l / 2, N = 14;
    for(let i = 0; i <= N; i++){ const t = i / N, x = -hl + l * t;
      s.lineTo(x, -w / 2 + bow * Math.sin(t * Math.PI)); }
    for(let i = N; i >= 0; i--){ const t = i / N, x = -hl + l * t;
      s.lineTo(x, w / 2 + bow * Math.sin(t * Math.PI)); }
    s.closePath(); return s;
  },
  /* three wings off a common core: the Venetian and the Mirage */
  wye(arm, w, ang){
    const s = new THREE.Shape();
    const pts = [];
    for(let k = 0; k < 3; k++){
      const a = ang + k * TAU / 3, c = Math.cos(a), sn = Math.sin(a);
      const px = -sn * w / 2, py = c * w / 2;
      pts.push([px, py], [c * arm + px, sn * arm + py],
               [c * arm - px, sn * arm - py], [-px, -py]);
    }
    pts.forEach((p, i) => i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1]));
    s.closePath(); return s;
  },

  /* extrude a footprint upward. bevel gives the top edge a little weight. */
  ex(G, g, shape, x, y, z, h, rot, mat, opts){
    const o = Object.assign({ depth:h, bevelEnabled:false, curveSegments:10 }, opts || {});
    const geo = new THREE.ExtrudeGeometry(shape, o);
    geo.rotateX(-Math.PI / 2);                 // the shape is drawn flat, stand it up
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, z, y); m.rotation.y = -rot;
    m.castShadow = true; m.receiveShadow = true;
    g.add(m); return m;
  },
  /* the UVs an extrusion gets are the shape's own coordinates, in metres,
     which is exactly what a tiling facade map wants */
  exUV(m, sx, sy){
    const uv = m.geometry.attributes.uv;
    for(let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / sx, uv.getY(i) / sy);
    uv.needsUpdate = true; return m;
  },

  /* The four sides of a unit box and nothing else. A lit roofline wants a rim
     round the edge; a solid box puts a lid over the whole roof, which reads as
     a bright plate from above rather than an edge. */
  shell(){
    if(this._shell) return this._shell.clone();
    const p = [], n = [], u = [], idx = [];
    const S = [[[-0.5, 0.5], [0.5, 0.5], [0, 0, 1]], [[0.5, -0.5], [-0.5, -0.5], [0, 0, -1]],
               [[0.5, 0.5], [0.5, -0.5], [1, 0, 0]], [[-0.5, -0.5], [-0.5, 0.5], [-1, 0, 0]]];
    let v = 0;
    for(const [a, b, nr] of S){
      p.push(a[0], 0, a[1], b[0], 0, b[1], b[0], 1, b[1], a[0], 1, a[1]);
      for(let k = 0; k < 4; k++) n.push(nr[0], nr[1], nr[2]);
      u.push(0, 0, 1, 0, 1, 1, 0, 1);
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3); v += 4;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(n, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(u, 2));
    g.setIndex(idx);
    g.translate(0, -0.5, 0);                       // match BoxGeometry's centring
    this._shell = g;
    return g.clone();
  },

  box(G, g, x, y, z, l, w, h, rot, mat){
    const m = new THREE.Mesh(new THREE.BoxGeometry(l, h, w), mat);
    m.position.set(x, z + h / 2, y); m.rotation.y = -rot;
    m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
  },
  cyl(G, g, x, y, z, rb, rt, h, mat, seg){
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 24), mat);
    m.position.set(x, z + h / 2, y);
    m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
  },
  cone(G, g, x, y, z, r, h, mat, seg){
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg || 14), mat);
    m.position.set(x, z + h / 2, y);
    m.castShadow = true; g.add(m); return m;
  },
  lathe(G, g, x, y, z, pts, mat, seg){
    const m = new THREE.Mesh(new THREE.LatheGeometry(pts, seg || 28), mat);
    m.position.set(x, z, y); m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
  },

  /* the lit line round a roof, which is what tells one tower from another at
     night more than its shape does */
  crown(G, g, x, y, z, l, w, rot, col, thick){
    const t = thick || 1.6;
    const m = new THREE.Mesh(new THREE.BoxGeometry(l, t, w), G.glowMat(col, 0.95));
    m.position.set(x, z + t / 2, y); m.rotation.y = -rot; g.add(m); return m;
  },
  crownRing(G, g, x, y, z, r, col, thick){
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, thick || 1.5, 40, 1, true),
      G.glowMat(col, 0.95, { side:THREE.DoubleSide }));
    m.position.set(x, z, y); g.add(m); return m;
  },

  /* the block a tower stands on, with its lit entrance under a canopy */
  podium(G, g, x, y, z, l, w, h, rot, col, night, accent){
    this.box(G, g, x, y, z, l, w, h, rot, G.faceMat("stone", col, night));
    // the porte-cochere: a canopy with light under it
    const cx = x + Math.cos(rot + Math.PI / 2) * (w / 2 + 5), cy = y + Math.sin(rot + Math.PI / 2) * (w / 2 + 5);
    this.box(G, g, cx, cy, z + h * 0.52, l * 0.34, 14, 1.6, rot, G.mat(shade(col, -0.3)));
    if(night){
      const lit = new THREE.Mesh(new THREE.PlaneGeometry(l * 0.32, 13),
        G.glowMat(accent || "#FFD8A0", 1.5, { side:THREE.DoubleSide }));
      lit.rotation.x = Math.PI / 2; lit.position.set(cx, z + h * 0.52 - 0.1, cy);
      lit.rotation.z = -rot; g.add(lit);
      const pool = new THREE.Mesh(new THREE.CircleGeometry(16, 18), G.poolMat("#FFC880", 0.22));
      pool.rotation.x = -Math.PI / 2; pool.position.set(cx, z + 0.12, cy); g.add(pool);
    }
    return { cx, cy };
  },

  /* a name across the top of a tower, or a marquee on its base */
  text(G, g, txt, x, y, z, w, h, rot, col, bg, italic){
    const cv = document.createElement("canvas"); cv.width = 512; cv.height = 128;
    const c = cv.getContext("2d");
    if(bg){ c.fillStyle = bg; c.fillRect(0, 0, 512, 128); } else c.clearRect(0, 0, 512, 128);
    c.fillStyle = col; c.textAlign = "center"; c.textBaseline = "middle";
    let fs = 88;
    c.font = "800 " + (italic ? "italic " : "") + fs + "px 'Saira Condensed',sans-serif";
    while(c.measureText(txt).width > 484 && fs > 14){
      fs -= 3; c.font = "800 " + (italic ? "italic " : "") + fs + "px 'Saira Condensed',sans-serif";
    }
    c.fillText(txt, 256, 68);
    const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8;
    const mat = new THREE.MeshStandardMaterial({ map:t, transparent:!bg, emissiveMap:t,
      emissive:new THREE.Color(1, 1, 1), emissiveIntensity:1.5, roughness:0.8,
      side:THREE.FrontSide, depthWrite:!!bg });
    // two single-sided panels back to back. One double-sided plane shows the
    // lettering mirrored from behind, which is the sort of thing you only
    // notice once and then cannot stop noticing.
    const grp = new THREE.Group();
    const geo = new THREE.PlaneGeometry(w, h);
    const a2 = new THREE.Mesh(geo, mat); grp.add(a2);
    const b2 = new THREE.Mesh(geo, mat); b2.rotation.y = Math.PI; grp.add(b2);
    grp.position.set(x, z, y); grp.rotation.y = -rot; g.add(grp);
    return grp;
  },

  /* one geometry, many places: the cheap way to have four hundred of anything */
  /* several geometries into one, non-indexed, keeping colour where there is any */
  merge(geos){
    let n = 0; const parts = geos.map(g => { const q = g.index ? g.toNonIndexed() : g; n += q.attributes.position.count; return q; });
    const hasCol = parts.some(q => q.attributes.color), hasUV = parts.every(q => q.attributes.uv);
    const pos = new Float32Array(n * 3), col = hasCol ? new Float32Array(n * 3) : null, uv = hasUV ? new Float32Array(n * 2) : null;
    let o = 0;
    for(const q of parts){
      const c = q.attributes.position.count;
      pos.set(q.attributes.position.array, o * 3);
      if(col){ if(q.attributes.color) col.set(q.attributes.color.array, o * 3); else col.fill(1, o * 3, (o + c) * 3); }
      if(uv) uv.set(q.attributes.uv.array, o * 2);
      o += c;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    if(col) out.setAttribute("color", new THREE.BufferAttribute(col, 3));
    if(uv) out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    out.computeVertexNormals();
    return out;
  },

  /* r128 frustum-culls an InstancedMesh by its template geometry's bounds at the
     origin, not by where the instances are. A set spread over a whole town is
     then either always drawn or wrongly thrown away. So instances are split into
     spatial chunks, and each chunk gets its own geometry handle carrying the
     true bounds of what is in it: culling works, and so does the shadow pass. */
  CHUNK:110,
  many(G, g, geo, mat, list, cast){
    if(!list.length) return null;
    if(!geo.boundingSphere) geo.computeBoundingSphere();
    const r0 = geo.boundingSphere.radius + geo.boundingSphere.center.length();
    const C = this.CHUNK, groups = new Map();
    for(const it of list){
      const k = Math.floor(it[0] / C) + "," + Math.floor(it[1] / C);
      let a = groups.get(k); if(!a){ a = []; groups.set(k, a); } a.push(it);
    }
    const d = new THREE.Object3D();
    // every chunk carries a colour buffer (white unless the instance says otherwise):
    // r128 keeps one program per material, and a mesh without one, sharing a material
    // with a mesh that has one, is drawn by a shader that expects it and the frame fails
    const anyCol = true;
    let first = null;
    for(const items of groups.values()){
      // a new geometry object sharing the same buffers, so it can carry its own bounds
      const gg = new THREE.BufferGeometry();
      for(const name in geo.attributes) gg.setAttribute(name, geo.attributes[name]);
      if(geo.index) gg.setIndex(geo.index);
      for(const gr of geo.groups) gg.addGroup(gr.start, gr.count, gr.materialIndex);
      const im = new THREE.InstancedMesh(gg, mat, items.length);
      const tint = new THREE.Color();
      let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity, smax = 0;
      items.forEach((it, i) => {
        if(it[6] != null){ tint.set(it[6]).convertSRGBToLinear(); im.setColorAt(i, tint); }
        else if(anyCol){ tint.setRGB(1, 1, 1); im.setColorAt(i, tint); }
        d.position.set(it[0], it[2], it[1]);
        d.rotation.set(0, it[3] || 0, 0);
        const s = it[4] == null ? 1 : it[4], sy = it[5] == null ? s : it[5];
        d.scale.set(s, sy, s);
        d.updateMatrix(); im.setMatrixAt(i, d.matrix);
        x0 = Math.min(x0, it[0]); x1 = Math.max(x1, it[0]); y0 = Math.min(y0, it[2]); y1 = Math.max(y1, it[2]);
        z0 = Math.min(z0, it[1]); z1 = Math.max(z1, it[1]); smax = Math.max(smax, s, sy);
      });
      gg.boundingSphere = new THREE.Sphere(new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2),
        Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 + r0 * smax);
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = !!cast; im.receiveShadow = true;
      // r128 switches culling off on every InstancedMesh, since it cannot bound
      // them; these chunks carry true bounds, so it can go back on
      im.frustumCulled = true;
      // instanced meshes carry their own transforms, so they must skip the bake
      im.userData.dynamic = true;
      g.add(im); if(!first) first = im;
    }
    return first;
  },
};

/* Each entry gets (G3, group, prop, track, session) and builds one property.
   p.x/p.y is the plot centre, p.z the ground under it, p.h the tower height,
   p.rot roughly square to the circuit. Where I was unsure of the real building
   the comment says so. */
const LM3 = {

  /* Bellagio: a shallow crescent of cream Italianate tower with terracotta
     banding, set back behind the lake. The fountains are the landmark, not the
     hotel, so they get the work. */
  bellagio(G, g, p, T, S){
    const night = T.night, h = p.h, col = "#E4DCC4";
    const face = G.faceMat("stucco", col, night);
    // the curve: one long bowed slab with two shorter wings stepped down
    LB.exUV(LB.ex(G, g, LB.arc(150, 26, 16), p.x, p.y, p.z, h, p.rot, face), 9, 4.2);
    LB.exUV(LB.ex(G, g, LB.arc(86, 24, 10),
      p.x + Math.cos(p.rot) * 96, p.y + Math.sin(p.rot) * 96, p.z, h * 0.74, p.rot + 0.5, face), 9, 4.2);
    // the terracotta cornice and the roofline
    LB.box(G, g, p.x, p.y, p.z + h, 154, 30, 2.6, p.rot, G.mat("#B4632E", { roughness:0.85 }));
    if(night) LB.crown(G, g, p.x, p.y, p.z + h + 2.6, 154, 30, p.rot, "#FFD9A0", 1.0);
    // the podium and the porte-cochere
    LB.podium(G, g, p.x, p.y, p.z, 168, 46, 16, p.rot, "#DCD2B6", night, "#FFE0B0");
    LB.text(G, g, "BELLAGIO", p.x, p.y + 0.1, p.z + h * 0.72, 62, 12, p.rot, "#FFF0CE", null);

    /* the lake, in front, between the hotel and the road */
    const lx = p.x - Math.cos(p.rot + Math.PI / 2) * 78, ly = p.y - Math.sin(p.rot + Math.PI / 2) * 78;
    const lake = new THREE.Mesh(new THREE.CircleGeometry(1, 40),
      new THREE.MeshStandardMaterial({ color:G.col("#12283C"), roughness:0.16, metalness:0.75,
        envMapIntensity:2.4, emissive:G.col("#0A1E30"), emissiveIntensity:night ? 0.6 : 0 }));
    lake.rotation.x = -Math.PI / 2; lake.rotation.z = -p.rot;
    lake.scale.set(132, 56, 1); lake.position.set(lx, p.z + 0.3, ly);
    lake.receiveShadow = false; g.add(lake);
    // the coping round it
    const kerb = new THREE.Mesh(new THREE.TorusGeometry(1, 0.016, 6, 48),
      G.mat("#C8C0AC"));
    kerb.rotation.x = Math.PI / 2; kerb.rotation.z = -p.rot;
    kerb.scale.set(134, 58, 1); kerb.position.set(lx, p.z + 1.2, ly); g.add(kerb);

    /* the fountain show: jets standing in the lake, rising and falling. They are
       tapered cylinders, lit white, with a haze cap — cheap, and from above that
       is what the show reads as. */
    const jets = [];
    const NJ = 34;
    for(let i = 0; i < NJ; i++){
      const t = i / (NJ - 1), a = (t - 0.5) * Math.PI * 0.92;
      const rr = 1 - 0.45 * Math.abs(t - 0.5) * 2;
      jets.push([lx + Math.cos(p.rot) * Math.sin(a) * 110 - Math.sin(p.rot) * Math.cos(a) * 32 * rr,
                 ly + Math.sin(p.rot) * Math.sin(a) * 110 + Math.cos(p.rot) * Math.cos(a) * 32 * rr, i]);
    }
    const jgeo = new THREE.CylinderGeometry(0.9, 2.6, 1, 8, 1, true);
    jgeo.translate(0, 0.5, 0);
    const jmat = new THREE.MeshStandardMaterial({ color:G.col("#0C1620"), roughness:0.4,
      emissive:G.col("#DCEEFF"), emissiveIntensity:2.6, transparent:true, opacity:0.85,
      side:THREE.DoubleSide, depthWrite:false });
    const im = new THREE.InstancedMesh(jgeo, jmat, jets.length);
    im.userData.dynamic = true; im.frustumCulled = false;
    g.add(im);
    G.dyn.push({ kind:"fountain", im, jets, z:p.z + 0.4, obj:new THREE.Object3D() });
    if(night){
      const fl = new THREE.PointLight(G.col("#BFE0FF"), 2.4, 300, 2);
      fl.position.set(lx, p.z + 26, ly); fl.userData.dynamic = true; g.add(fl);
    }
  },

  /* Caesars Palace: not one tower but a cluster of cream slabs at angles to
     each other, with a columned frontage and a fountain forecourt. */
  caesars(G, g, p, T, S){
    const night = T.night, col = "#EFEADC";
    const face = G.faceMat("stucco", col, night);
    const towers = [[0, 0, 1.0, 0], [72, -34, 0.82, 0.5], [-66, -40, 0.74, -0.45],
                    [24, 70, 0.66, 0.9], [-40, 62, 0.58, -0.8]];
    for(const [dx, dy, sc, dr] of towers){
      const c = Math.cos(p.rot), s2 = Math.sin(p.rot);
      const x = p.x + dx * c - dy * s2, y = p.y + dx * s2 + dy * c;
      const hh = p.h * sc;
      LB.exUV(LB.ex(G, g, LB.arc(56 * (0.6 + sc * 0.5), 20, 7), x, y, p.z, hh, p.rot + dr, face), 9, 4.2);
      LB.box(G, g, x, y, p.z + hh, 60 * (0.6 + sc * 0.5), 24, 2.0, p.rot + dr, G.mat("#8C8472"));
      if(night) LB.crown(G, g, x, y, p.z + hh + 2, 60 * (0.6 + sc * 0.5), 24, p.rot + dr, "#FFE6B4", 0.9);
    }
    /* the frontage: a colonnade, instanced, with a pediment over it */
    const fx = p.x - Math.cos(p.rot + Math.PI / 2) * 54, fy = p.y - Math.sin(p.rot + Math.PI / 2) * 54;
    LB.box(G, g, fx, fy, p.z, 110, 22, 4, p.rot, G.mat("#E8E2D2"));
    const cols = [];
    for(let i = 0; i < 16; i++){
      const t = (i / 15 - 0.5) * 104;
      cols.push([fx + Math.cos(p.rot) * t, fy + Math.sin(p.rot) * t, p.z + 4]);
    }
    const cg = new THREE.CylinderGeometry(1.9, 2.2, 22, 12);
    cg.translate(0, 11, 0);
    LB.many(G, g, cg, G.mat("#F2EDE0", { roughness:0.7 }), cols, true);
    LB.box(G, g, fx, fy, p.z + 26, 112, 24, 3.2, p.rot, G.mat("#9A9384"));
    LB.box(G, g, fx, fy, p.z + 29.2, 104, 20, 2.0, p.rot, G.mat("#8E8877"));
    if(night){
      LB.crown(G, g, fx, fy, p.z + 31.2, 112, 24, p.rot, "#FFDC9A", 0.8);
      const pool = new THREE.Mesh(new THREE.CircleGeometry(40, 22), G.poolMat("#FFD08A", 0.20));
      pool.rotation.x = -Math.PI / 2; pool.position.set(fx, p.z + 0.14, fy); g.add(pool);
    }
    LB.text(G, g, "CAESARS PALACE", fx, fy, p.z + 34, 74, 10, p.rot, "#FFF4D8", null);
    /* the forecourt fountain and the statues in front of it */
    const qx = fx - Math.cos(p.rot + Math.PI / 2) * 32, qy = fy - Math.sin(p.rot + Math.PI / 2) * 32;
    LB.cyl(G, g, qx, qy, p.z, 20, 20, 1.6, G.mat("#DCD4C0"), 28);
    const basin = new THREE.Mesh(new THREE.CircleGeometry(18, 28),
      new THREE.MeshStandardMaterial({ color:G.col("#0E2030"), roughness:0.05, metalness:0.9, envMapIntensity:1.6 }));
    basin.rotation.x = -Math.PI / 2; basin.position.set(qx, p.z + 1.7, qy); g.add(basin);
    for(let i = 0; i < 8; i++){
      const a = i / 8 * TAU;
      LB.cyl(G, g, qx + Math.cos(a) * 13, qy + Math.sin(a) * 13, p.z + 1.7, 0.5, 0.2, 7,
        night ? G.glowMat("#CFE6FF", 1.6) : G.mat("#E8F0F8"), 7);
    }
    // the statues: a plinth and a figure, repeated round the court
    const st = [];
    for(let i = 0; i < 6; i++){
      const a = i / 6 * TAU + 0.4;
      st.push([qx + Math.cos(a) * 30, qy + Math.sin(a) * 30, p.z, -a, 1]);
    }
    const sg = new THREE.CylinderGeometry(1.1, 1.4, 3.2, 8); sg.translate(0, 1.6, 0);
    LB.many(G, g, sg, G.mat("#EAE4D4"), st, true);
    const fg = new THREE.CylinderGeometry(0.9, 0.7, 5.4, 8);
    fg.translate(0, 6.0, 0);
    LB.many(G, g, fg, G.mat("#F4EFE2"), st, true);
    const hg = new THREE.SphereGeometry(0.85, 8, 6); hg.translate(0, 9.2, 0);
    LB.many(G, g, hg, G.mat("#F4EFE2"), st, false);
  },

  /* The Venetian: a tan Y-plan tower, the campanile in brick red with a green
     pyramid on top, a Doge's-palace arcade along the front, and the canal with
     a Rialto-style bridge over it. */
  venetian(G, g, p, T, S){
    const night = T.night, col = "#E2D6BA";
    const face = G.faceMat("stucco", col, night);
    LB.exUV(LB.ex(G, g, LB.wye(46, 26, p.rot), p.x, p.y, p.z, p.h, 0, face), 9, 4.2);
    // the stepped cap
    LB.ex(G, g, LB.wye(48, 28, p.rot), p.x, p.y, p.z + p.h, 2.4, 0, G.mat("#8E836B"));
    LB.ex(G, g, LB.wye(30, 20, p.rot), p.x, p.y, p.z + p.h + 2.4, 5.0, 0, G.mat("#968B73"));
    if(night) LB.crown(G, g, p.x, p.y, p.z + p.h + 7.4, 44, 30, p.rot, "#FFCE72", 1.2);
    LB.podium(G, g, p.x, p.y, p.z, 130, 44, 14, p.rot, "#DCCFAF", night, "#FFD98E");

    /* the arcade: pointed arches along the front, instanced */
    const ax = p.x - Math.cos(p.rot + Math.PI / 2) * 34, ay = p.y - Math.sin(p.rot + Math.PI / 2) * 34;
    LB.box(G, g, ax, ay, p.z, 120, 16, 18, p.rot, G.faceMat("stone", "#EFE8D6", night));
    const arch = [];
    for(let i = 0; i < 20; i++){
      const t = (i / 19 - 0.5) * 112;
      arch.push([ax + Math.cos(p.rot) * t - Math.sin(p.rot) * -8.2,
                 ay + Math.sin(p.rot) * t + Math.cos(p.rot) * -8.2, p.z + 1, -p.rot]);
    }
    const arg = new THREE.TorusGeometry(2.4, 0.55, 5, 9, Math.PI);
    arg.translate(0, 6.4, 0);
    LB.many(G, g, arg, G.mat("#F6F0E0"), arch, false);
    const pil = new THREE.BoxGeometry(1.1, 6.4, 1.1); pil.translate(0, 3.2, 0);
    LB.many(G, g, pil, G.mat("#F6F0E0"), arch, false);

    /* the campanile: brick red shaft, belfry, green pyramid */
    const cx = p.x + Math.cos(p.rot) * 84 - Math.sin(p.rot) * -52;
    const cy = p.y + Math.sin(p.rot) * 84 + Math.cos(p.rot) * -52;
    const ch = p.h * 0.78;
    LB.box(G, g, cx, cy, p.z, 13, 13, ch, p.rot, G.faceMat("brick", "#A8452E", night));
    LB.box(G, g, cx, cy, p.z + ch, 16, 16, 9, p.rot,
      night ? G.glowMat("#F0DCA8", 1.4) : G.mat("#EFE4C4"));           // the belfry, lit
    LB.box(G, g, cx, cy, p.z + ch + 9, 14, 14, 3, p.rot, G.mat("#D8CDB0"));
    LB.cone(G, g, cx, cy, p.z + ch + 12, 10.4, 15, G.mat("#2E7A5A", { roughness:0.5, metalness:0.3 }), 4);
    LB.cyl(G, g, cx, cy, p.z + ch + 27, 0.5, 0.2, 5, G.mat("#C8A040"), 6);

    /* the canal and the Rialto-style bridge */
    const wx = p.x - Math.cos(p.rot + Math.PI / 2) * 64, wy = p.y - Math.sin(p.rot + Math.PI / 2) * 64;
    const canal = new THREE.Mesh(new THREE.PlaneGeometry(126, 22),
      new THREE.MeshStandardMaterial({ color:G.col("#12303C"), roughness:0.16, metalness:0.7,
        envMapIntensity:2.2, emissive:G.col("#0A2430"), emissiveIntensity:night ? 0.6 : 0 }));
    canal.rotation.x = -Math.PI / 2; canal.rotation.z = -p.rot;
    canal.position.set(wx, p.z + 0.5, wy); g.add(canal);
    const bpts = [];
    for(let i = 0; i <= 12; i++){ const t = i / 12; bpts.push([ (t - 0.5) * 34, Math.sin(t * Math.PI) * 6 ]); }
    const bs = new THREE.Shape();
    bpts.forEach(([a, b], i) => i ? bs.lineTo(a, b) : bs.moveTo(a, b));
    for(let i = 12; i >= 0; i--){ const [a, b] = bpts[i]; bs.lineTo(a, b - 2.2); }
    bs.closePath();
    const bgeo = new THREE.ExtrudeGeometry(bs, { depth:12, bevelEnabled:false, curveSegments:6 });
    bgeo.rotateY(Math.PI / 2); bgeo.translate(0, 0, -6);
    const bm = new THREE.Mesh(bgeo, G.faceMat("stone", "#EFE8D6", night));
    bm.position.set(wx, p.z + 1.4, wy); bm.rotation.y = -p.rot;
    bm.castShadow = true; g.add(bm);
  },

  /* Palazzo: the taller, plainer tan tower next door. */
  palazzo(G, g, p, T, S){
    const night = T.night, face = G.faceMat("stucco", "#E8DCC0", night);
    LB.exUV(LB.ex(G, g, LB.slab(64, 30, 8), p.x, p.y, p.z, p.h, p.rot, face), 9, 4.2);
    LB.exUV(LB.ex(G, g, LB.slab(46, 26, 6), p.x + Math.cos(p.rot) * 54, p.y + Math.sin(p.rot) * 54,
      p.z, p.h * 0.80, p.rot, face), 9, 4.2);
    LB.box(G, g, p.x, p.y, p.z + p.h, 70, 36, 3.2, p.rot, G.mat("#8A7F65"));
    if(night) LB.crown(G, g, p.x, p.y, p.z + p.h + 3.2, 70, 36, p.rot, "#FFD48A", 1.3);
    LB.podium(G, g, p.x, p.y, p.z, 96, 44, 15, p.rot, "#DED2B4", night, "#FFD98E");
    LB.text(G, g, "PALAZZO", p.x, p.y, p.z + p.h * 0.86, 44, 9, p.rot, "#FFEFC8", null);
  },

  /* Wynn and Encore: two gently bowed bronze-glass slabs side by side, each
     with the script sign across the top. */
  wynn(G, g, p, T, S){
    const night = T.night;
    const face = G.faceMat("bronze", "#8E6A2E", night);
    for(const [k, off, sc] of [[0, -46, 1.0], [1, 46, 0.94]]){
      const x = p.x + Math.cos(p.rot) * off, y = p.y + Math.sin(p.rot) * off;
      const hh = p.h * sc;
      LB.exUV(LB.ex(G, g, LB.arc(58, 22, 13), x, y, p.z, hh, p.rot + (k ? 0.18 : -0.18), face), 8, 4.0);
      LB.box(G, g, x, y, p.z + hh, 62, 28, 2.4, p.rot + (k ? 0.18 : -0.18), G.mat("#6A4E20"));
      LB.text(G, g, k ? "Encore" : "Wynn", x, y, p.z + hh - 9, 40, 12,
        p.rot + (k ? 0.18 : -0.18), "#FFD86A", null, true);
      if(night) LB.crown(G, g, x, y, p.z + hh + 2.4, 62, 28, p.rot + (k ? 0.18 : -0.18), "#FFB84A", 1.2);
    }
    LB.podium(G, g, p.x, p.y, p.z, 150, 50, 17, p.rot, "#7A5C28", night, "#FFC868");
  },

  /* Paris: the half-scale tower, built as a real lattice silhouette. The
     ironwork is an alpha-tested texture on tapered surfaces rather than tens of
     thousands of struts — the only way to get the see-through look at this
     polygon budget. Proportions follow the original: the first platform at
     about a third of the height and a fifth of the height across, narrowing
     twice more to the mast. */
  eiffel(G, g, p, T, S){
    const night = T.night, H2 = p.h;
    const lat = PTEX.lattice();
    const latMat = new THREE.MeshStandardMaterial({ map:lat, alphaMap:lat, transparent:true,
      alphaTest:0.40, color:G.col("#8A7658"), roughness:0.7, metalness:0.45, side:THREE.DoubleSide,
      emissive:G.col(night ? "#7A5418" : "#000000"), emissiveIntensity:night ? 1.0 : 0,
      depthWrite:true });
    const solid = G.mat("#6E5C42", { roughness:0.6, metalness:0.5 });
    // height, half-width: the four stages of the silhouette
    const STAGE = [[0.000, 0.190], [0.215, 0.105], [0.420, 0.058], [0.700, 0.026], [0.905, 0.012]];
    // the four legs: they flare hard at the bottom and straighten by the first deck
    for(let k = 0; k < 4; k++){
      const a = p.rot + Math.PI / 4 + k * Math.PI / 2;
      const pts = [];
      for(let i2 = 0; i2 <= 8; i2++){
        const t = i2 / 8;
        const r = H2 * (0.190 - (0.190 - 0.105) * Math.pow(t, 0.55));
        pts.push(new THREE.Vector3(Math.cos(a) * r, t * H2 * 0.215, Math.sin(a) * r));
      }
      const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 9, H2 * 0.016, 6, false), solid);
      m.position.set(p.x, p.z, p.y); m.castShadow = true; g.add(m);
      // the arch between the legs at ground level
      if(k < 2){
        const b = a + Math.PI / 2;
        const ar = new THREE.Mesh(new THREE.TorusGeometry(H2 * 0.13, H2 * 0.010, 5, 12, Math.PI), solid);
        ar.position.set(p.x, p.z + H2 * 0.030, p.y);
        ar.rotation.y = -a - Math.PI / 4 + k * Math.PI / 2; g.add(ar);
      }
    }
    // the four stages of latticed shaft, each a square frustum
    for(let k = 0; k < STAGE.length - 1; k++){
      const [t0, w0] = STAGE[k], [t1, w1] = STAGE[k + 1];
      const geo = new THREE.LatheGeometry(
        [new THREE.Vector2(H2 * w0, H2 * t0), new THREE.Vector2(H2 * w1, H2 * t1)], 4, 0, TAU);
      const m = new THREE.Mesh(geo, latMat);
      m.position.set(p.x, p.z, p.y); m.rotation.y = p.rot + Math.PI / 4;
      m.castShadow = false; g.add(m);
    }
    // the decks: small, and only where the real ones are
    for(const [t, w2] of [[0.215, 0.112], [0.420, 0.064], [0.700, 0.030]]){
      LB.box(G, g, p.x, p.y, p.z + H2 * t, H2 * w2 * 2, H2 * w2 * 2, H2 * 0.012,
        p.rot + Math.PI / 4, solid);
      if(night){
        // the deck edge is a line of light, which is how it reads at night
        const e = new THREE.Mesh(new THREE.BoxGeometry(H2 * w2 * 2.1, H2 * 0.007, H2 * w2 * 2.1),
          G.glowMat("#FFB43A", 1.6));
        e.position.set(p.x, p.z + H2 * t + H2 * 0.014, p.y);
        e.rotation.y = -p.rot - Math.PI / 4; g.add(e);
      }
    }
    // the mast and the lamp on top
    LB.cyl(G, g, p.x, p.y, p.z + H2 * 0.905, H2 * 0.013, H2 * 0.006, H2 * 0.060, solid, 8);
    LB.cyl(G, g, p.x, p.y, p.z + H2 * 0.965, 0.7, 0.2, H2 * 0.035,
      night ? G.glowMat("#FFEBC0", 3.2) : G.mat("#C8B890"), 8);
    if(night){
      const L = new THREE.PointLight(G.col("#FFA83A"), 2.6, 380, 2);
      L.position.set(p.x, p.z + H2 * 0.35, p.y); L.userData.dynamic = true; g.add(L);
      const pool = new THREE.Mesh(new THREE.CircleGeometry(H2 * 0.34, 20), G.poolMat("#FFC070", 0.22));
      pool.rotation.x = -Math.PI / 2; pool.position.set(p.x, p.z + 0.16, p.y); g.add(pool);
    }
    /* the Montgolfier balloon sign on the frontage */
    const bx = p.x - Math.cos(p.rot + Math.PI / 2) * 62, by = p.y - Math.sin(p.rot + Math.PI / 2) * 62;
    LB.box(G, g, bx, by, p.z, 96, 32, 26, p.rot, G.faceMat("stone", "#D8CDB4", night));
    if(night) LB.crown(G, g, bx, by, p.z + 26, 98, 38, p.rot, "#FFD07A", 0.9);
    const balloon = new THREE.Mesh(new THREE.SphereGeometry(9, 18, 13),
      new THREE.MeshStandardMaterial({ color:G.col("#B01E26"), roughness:0.55, metalness:0.1,
        emissive:G.col("#8A1218"), emissiveIntensity:night ? 0.9 : 0 }));
    balloon.position.set(bx, p.z + 44, by); balloon.scale.set(1, 1.12, 1);
    balloon.castShadow = true; g.add(balloon);
    for(let k = 0; k < 8; k++){
      const a = k / 8 * TAU;
      LB.box(G, g, bx + Math.cos(a) * 4.6, by + Math.sin(a) * 4.6, p.z + 32, 0.5, 0.5, 6, a, G.mat("#C8A040"));
    }
    LB.box(G, g, bx, by, p.z + 28, 5, 5, 4, p.rot, G.mat("#8A6A2E"));
    LB.cyl(G, g, bx, by, p.z + 26, 2.2, 2.2, 2, G.mat("#6E5A30"), 10);
    LB.text(G, g, "PARIS", bx, by, p.z + 17, 36, 9, p.rot, "#FFD86A", null);
    /* the Arc de Triomphe out front */
    const ax = bx - Math.cos(p.rot + Math.PI / 2) * 34 + Math.cos(p.rot) * 58;
    const ay = by - Math.sin(p.rot + Math.PI / 2) * 34 + Math.sin(p.rot) * 58;
    const arc = new THREE.Shape();
    arc.moveTo(-16, 0); arc.lineTo(16, 0); arc.lineTo(16, 30); arc.lineTo(-16, 30); arc.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-7, 0); hole.lineTo(-7, 14);
    hole.quadraticCurveTo(-7, 21, 0, 21); hole.quadraticCurveTo(7, 21, 7, 14);
    hole.lineTo(7, 0); hole.closePath();
    arc.holes.push(hole);
    const ageo = new THREE.ExtrudeGeometry(arc, { depth:14, bevelEnabled:false, curveSegments:8 });
    ageo.translate(0, 0, -7);
    const am = new THREE.Mesh(ageo, G.faceMat("stone", "#E4DAC2", night));
    am.position.set(ax, p.z, ay); am.rotation.y = -p.rot; am.castShadow = true; g.add(am);
    if(night){
      const pool = new THREE.Mesh(new THREE.CircleGeometry(28, 18), G.poolMat("#FFD9A0", 0.26));
      pool.rotation.x = -Math.PI / 2; pool.position.set(ax, p.z + 0.14, ay); g.add(pool);
    }
  },

  /* Luxor: the black glass pyramid, the beam, and the sphinx. */
  luxor(G, g, p, T, S){
    const night = T.night, base = p.h * 1.9;
    const pyr = new THREE.ConeGeometry(base * Math.SQRT1_2, p.h, 4);
    const m = new THREE.Mesh(pyr, new THREE.MeshStandardMaterial({
      color:G.col("#0B0D14"), roughness:0.07, metalness:0.85, envMapIntensity:2.0,
      emissiveMap:night ? PTEX.windowTex("darkglass", "#0B0D14") : null,
      emissive:night ? new THREE.Color(1, 1, 1) : new THREE.Color(0, 0, 0),
      emissiveIntensity:night ? 0.55 : 0 }));
    m.position.set(p.x, p.z + p.h / 2, p.y); m.rotation.y = p.rot + Math.PI / 4;
    m.castShadow = true; m.receiveShadow = true; g.add(m);
    // the edges, picked out so the silhouette is sharp against a black sky
    if(night){
      const eg = new THREE.EdgesGeometry(pyr);
      const em = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color:G.col("#C8A24A") }));
      em.position.copy(m.position); em.rotation.copy(m.rotation); em.userData.dynamic = true; g.add(em);
    }
    /* the sky beam: an additive cone, bright at the apex and gone by the top */
    if(night){
      const bh = p.h * 9;
      const bg = new THREE.CylinderGeometry(p.h * 0.30, p.h * 0.055, bh, 18, 1, true);
      const bm = new THREE.MeshBasicMaterial({ color:G.col("#EAF2FF"), transparent:true, opacity:0.11,
        blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide });
      const beam = new THREE.Mesh(bg, bm);
      beam.position.set(p.x, p.z + p.h + bh / 2, p.y); beam.userData.dynamic = true;
      beam.frustumCulled = false; g.add(beam);
      const core = new THREE.Mesh(new THREE.CylinderGeometry(p.h * 0.10, p.h * 0.02, bh * 0.5, 12, 1, true),
        new THREE.MeshBasicMaterial({ color:G.col("#FFFFFF"), transparent:true, opacity:0.30,
          blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide }));
      core.position.set(p.x, p.z + p.h + bh * 0.25, p.y); core.userData.dynamic = true;
      core.frustumCulled = false; g.add(core);
      const L = new THREE.PointLight(G.col("#DCE8FF"), 4.0, 400, 2);
      L.position.set(p.x, p.z + p.h + 8, p.y); L.userData.dynamic = true; g.add(L);
    }
    /* the sphinx out front: a crouched body, forelegs and a headdress */
    const sx = p.x - Math.cos(p.rot + Math.PI / 2) * (base * 0.62);
    const sy = p.y - Math.sin(p.rot + Math.PI / 2) * (base * 0.62);
    const st = G.faceMat("sand", "#D8B878", night);
    LB.box(G, g, sx, sy, p.z, 44, 20, 16, p.rot + Math.PI / 2, st);
    LB.box(G, g, sx - Math.cos(p.rot + Math.PI / 2) * 26, sy - Math.sin(p.rot + Math.PI / 2) * 26,
      p.z, 26, 18, 8, p.rot + Math.PI / 2, st);
    LB.box(G, g, sx + Math.cos(p.rot + Math.PI / 2) * 16, sy + Math.sin(p.rot + Math.PI / 2) * 16,
      p.z + 16, 22, 16, 13, p.rot + Math.PI / 2, st);
    LB.box(G, g, sx + Math.cos(p.rot + Math.PI / 2) * 16, sy + Math.sin(p.rot + Math.PI / 2) * 16,
      p.z + 29, 24, 18, 5, p.rot + Math.PI / 2, G.mat("#C8A45E"));
    if(night){
      const L2 = new THREE.PointLight(G.col("#FFC060"), 1.6, 160, 2);
      L2.position.set(sx, p.z + 18, sy); L2.userData.dynamic = true; g.add(L2);
    }
  },

  /* Excalibur: white castle blocks with red, blue and gold conical turrets on
     round bases. */
  excalibur(G, g, p, T, S){
    const night = T.night, face = G.faceMat("stucco", "#EFEBE0", night);
    LB.exUV(LB.ex(G, g, LB.slab(120, 58, 10), p.x, p.y, p.z, p.h * 0.62, p.rot, face), 9, 4.2);
    LB.box(G, g, p.x, p.y, p.z + p.h * 0.62, 124, 62, 2.4, p.rot, G.mat("#948E80"));
    // battlements along the roofline, instanced
    const merl = [];
    for(let i = 0; i < 26; i++){
      const t = (i / 25 - 0.5) * 118;
      for(const sd of [-1, 1])
        merl.push([p.x + Math.cos(p.rot) * t - Math.sin(p.rot) * sd * 30,
                   p.y + Math.sin(p.rot) * t + Math.cos(p.rot) * sd * 30, p.z + p.h * 0.62 + 2.4, -p.rot]);
    }
    const mg = new THREE.BoxGeometry(2.6, 3.2, 2.2); mg.translate(0, 1.6, 0);
    LB.many(G, g, mg, G.mat("#EFEBE0"), merl, false);
    // the turrets: a round drum with a real cone on it
    const TUR = [[-54, -26, 1.0, "#C8202E"], [54, -26, 1.0, "#1E5FC0"], [-54, 26, 0.86, "#D8A020"],
                 [54, 26, 0.86, "#C8202E"], [0, -34, 1.22, "#1E5FC0"], [0, 34, 0.78, "#D8A020"],
                 [-24, 0, 0.94, "#D8A020"], [26, 0, 0.94, "#C8202E"]];
    for(const [dx, dy, sc, tc] of TUR){
      const c = Math.cos(p.rot), s2 = Math.sin(p.rot);
      const x = p.x + dx * c - dy * s2, y = p.y + dx * s2 + dy * c;
      const th = p.h * 0.72 * sc, tr = 8 * sc;
      LB.cyl(G, g, x, y, p.z, tr, tr, th, face, 18);
      LB.cyl(G, g, x, y, p.z + th, tr * 1.18, tr * 1.18, 2.2, G.mat("#E4DED0"), 18);
      LB.cone(G, g, x, y, p.z + th + 2.2, tr * 1.2, th * 0.55,
        night ? G.glowMat(tc, 0.85, { color:G.col(tc), roughness:0.6 }) : G.mat(tc), 16);
      LB.cyl(G, g, x, y, p.z + th + 2.2 + th * 0.55, 0.3, 0.12, 4, G.mat("#D8B84A"), 6);
    }
    LB.text(G, g, "EXCALIBUR", p.x, p.y - 0.2, p.z + p.h * 0.36, 60, 12, p.rot, "#FFE07A", null);
  },

  /* New York-New York: a cluster of mini skyscrapers, the Statue of Liberty,
     a bridge replica, and the coaster winding through it. */
  nyny(G, g, p, T, S){
    const night = T.night;
    const face = G.faceMat("stone", "#96A2AE", night);
    const glass = G.faceMat("glass", "#6E7E92", night);
    const c = Math.cos(p.rot), s2 = Math.sin(p.rot);
    const at = (dx, dy) => [p.x + dx * c - dy * s2, p.y + dx * s2 + dy * c];
    /* the Empire State silhouette: a broad base, a setback shaft, a mast */
    {
      const [x, y] = at(0, 0), hh = p.h;
      LB.exUV(LB.ex(G, g, LB.slab(34, 34, 3), x, y, p.z, hh * 0.52, p.rot, face), 8, 4);
      LB.exUV(LB.ex(G, g, LB.slab(24, 24, 3), x, y, p.z + hh * 0.52, hh * 0.34, p.rot, face), 8, 4);
      LB.exUV(LB.ex(G, g, LB.slab(15, 15, 2), x, y, p.z + hh * 0.86, hh * 0.09, p.rot, face), 8, 4);
      LB.cyl(G, g, x, y, p.z + hh * 0.95, 3.4, 1.6, hh * 0.09, G.mat("#AEB8C2"), 12);
      LB.cyl(G, g, x, y, p.z + hh * 1.04, 0.7, 0.2, hh * 0.13,
        night ? G.glowMat("#FFE0A0", 3.0) : G.mat("#C8D0D8"), 8);
      if(night) LB.crownRing(G, g, x, y, p.z + hh * 0.90, 8.5, "#6EC8FF", 1.4);
    }
    /* the Chrysler silhouette: stepped arches to a spire */
    {
      const [x, y] = at(48, -30), hh = p.h * 0.84;
      LB.exUV(LB.ex(G, g, LB.slab(24, 24, 2), x, y, p.z, hh * 0.70, p.rot + 0.3, face), 8, 4);
      const pts = [];
      for(let i = 0; i <= 7; i++){ const t = i / 7; pts.push(new THREE.Vector2(12 * Math.cos(t * Math.PI / 2) + 0.1, hh * 0.70 + t * hh * 0.22)); }
      LB.lathe(G, g, x, y, p.z, pts, night ? G.glowMat("#C8D8E8", 0.8) : G.mat("#C8D2DC"), 20);
      LB.cyl(G, g, x, y, p.z + hh * 0.92, 0.6, 0.15, hh * 0.16,
        night ? G.glowMat("#EAF4FF", 3.0) : G.mat("#D8E0E8"), 8);
    }
    /* a couple of plainer blocks to fill the skyline */
    for(const [dx, dy, sc, r2] of [[-46, -24, 0.62, 0.2], [30, 40, 0.54, -0.4], [-36, 38, 0.46, 0.7], [62, 12, 0.40, 0.1]]){
      const [x, y] = at(dx, dy);
      LB.exUV(LB.ex(G, g, LB.slab(22, 20, 2), x, y, p.z, p.h * sc, p.rot + r2, glass), 8, 4);
      if(night) LB.crown(G, g, x, y, p.z + p.h * sc, 24, 22, p.rot + r2, "#FFD08A", 0.8);
    }
    /* the Statue of Liberty */
    {
      const [x, y] = at(-70, -52), sh = p.h * 0.34;
      const cu = G.mat("#4EBFA0", { roughness:0.75 });
      LB.box(G, g, x, y, p.z, 14, 14, sh * 0.30, p.rot + 0.4, G.faceMat("stone", "#C8C0B0", night));
      const body = [];
      for(let i = 0; i <= 8; i++){ const t = i / 8; body.push(new THREE.Vector2(3.4 * (1 - t * 0.55) + 0.2, sh * 0.30 + t * sh * 0.52)); }
      LB.lathe(G, g, x, y, p.z, body, cu, 14);
      LB.cyl(G, g, x, y, p.z + sh * 0.82, 1.5, 1.4, sh * 0.10, cu, 10);
      // the crown and the torch arm
      for(let i = 0; i < 7; i++){
        const a = i / 7 * TAU;
        LB.cone(G, g, x + Math.cos(a) * 2.4, y + Math.sin(a) * 2.4, p.z + sh * 0.92, 0.5, 2.4, cu, 5);
      }
      LB.box(G, g, x + 2.4, y, p.z + sh * 0.92, 1.0, 1.0, sh * 0.22, 0.5, cu);
      const torch = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 6),
        night ? G.glowMat("#FFD24A", 3.4) : G.mat("#E8C048"));
      torch.position.set(x + 3.2, p.z + sh * 1.16, y); g.add(torch);
      if(night){
        const L = new THREE.PointLight(G.col("#FFD24A"), 1.2, 110, 2);
        L.position.set(x + 3.2, p.z + sh * 1.16, y); L.userData.dynamic = true; g.add(L);
      }
    }
    /* the bridge replica across the front */
    {
      const [x0, y0] = at(-86, 62), [x1, y1] = at(50, 62);
      const bm = G.faceMat("stone", "#C0B8A8", night);
      for(const [bx, by] of [[x0 + (x1 - x0) * 0.22, y0 + (y1 - y0) * 0.22],
                             [x0 + (x1 - x0) * 0.78, y0 + (y1 - y0) * 0.78]]){
        LB.box(G, g, bx, by, p.z, 11, 11, p.h * 0.30, p.rot, bm);
        LB.box(G, g, bx, by, p.z + p.h * 0.16, 13, 13, 2.0, p.rot, bm);
      }
      LB.box(G, g, (x0 + x1) / 2, (y0 + y1) / 2, p.z + p.h * 0.14, Math.hypot(x1 - x0, y1 - y0), 13, 1.6,
        Math.atan2(y1 - y0, x1 - x0), G.mat("#8A8272"));
      // the cables, as thin tubes following a catenary
      for(const sd of [-1, 1]){
        const cp = [];
        for(let i = 0; i <= 10; i++){
          const t = i / 10;
          const bx = x0 + (x1 - x0) * t, by = y0 + (y1 - y0) * t;
          const sag = Math.abs(t - 0.5) * 2;
          cp.push(new THREE.Vector3(bx - Math.sin(p.rot) * sd * 6,
            p.z + p.h * 0.16 + (sag * sag) * p.h * 0.15 - 0.5, by + Math.cos(p.rot) * sd * 6));
        }
        const cm = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cp), 14, 0.4, 5, false),
          night ? G.glowMat("#8AC8FF", 1.1) : G.mat("#9AA2AA"));
        g.add(cm);
      }
    }
    /* the coaster: one continuous tube that weaves round the whole plot */
    {
      const cp = [];
      for(let i = 0; i < 26; i++){
        const a = i / 26 * TAU;
        const rr = 74 + Math.sin(a * 3) * 22;
        const [x, y] = at(Math.cos(a) * rr, Math.sin(a) * rr * 0.78);
        cp.push(new THREE.Vector3(x, p.z + 16 + Math.sin(a * 2.4) * 13 + Math.sin(a * 5) * 5, y));
      }
      const track = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cp, true), 130, 0.8, 5, true),
        night ? G.glowMat("#FF4A3A", 1.4) : G.mat("#D8352A"));
      track.castShadow = true; g.add(track);
      // the supports under it
      const sup = [];
      for(let i = 0; i < 26; i += 2){
        const v = cp[i]; sup.push([v.x, v.z, p.z, 0, 1, (v.y - p.z) / 2]);
      }
      const sg = new THREE.CylinderGeometry(0.5, 0.6, 2, 6); sg.translate(0, 1, 0);
      LB.many(G, g, sg, G.mat("#7A8290"), sup, false);
    }
    LB.text(G, g, "NEW YORK", ...at(0, -66).slice(0, 2), p.z + 26, 52, 11, p.rot, "#FFD86A", null);
  },

  /* MGM: emerald glass slabs and the lion. */
  mgm(G, g, p, T, S){
    const night = T.night;
    const face = G.faceMat("glass", "#1E6E4A", night);
    for(const [dx, dy, sc, r2] of [[0, 0, 1.0, 0], [58, 22, 0.88, 0.35], [-58, 22, 0.88, -0.35]]){
      const c = Math.cos(p.rot), s2 = Math.sin(p.rot);
      const x = p.x + dx * c - dy * s2, y = p.y + dx * s2 + dy * c;
      LB.exUV(LB.ex(G, g, LB.slab(52, 24, 4), x, y, p.z, p.h * sc, p.rot + r2, face), 8, 4);
      LB.box(G, g, x, y, p.z + p.h * sc, 56, 28, 2.4, p.rot + r2, G.mat("#0E4A30"));
      if(night) LB.crown(G, g, x, y, p.z + p.h * sc + 2.4, 56, 28, p.rot + r2, "#28E894", 1.4);
    }
    LB.podium(G, g, p.x, p.y, p.z, 150, 52, 16, p.rot, "#186040", night, "#5EE8A8");
    /* the lion: a plinth, a couched body, a head and a mane */
    const lx = p.x - Math.cos(p.rot + Math.PI / 2) * 52, ly = p.y - Math.sin(p.rot + Math.PI / 2) * 52;
    const gold = G.mat("#C8A030", { roughness:0.28, metalness:0.85, envMapIntensity:1.8 });
    LB.box(G, g, lx, ly, p.z, 26, 16, 10, p.rot, G.mat("#0C3A26"));
    LB.box(G, g, lx, ly, p.z + 10, 18, 9, 7, p.rot, gold);
    LB.box(G, g, lx + Math.cos(p.rot + Math.PI / 2) * 8, ly + Math.sin(p.rot + Math.PI / 2) * 8,
      p.z + 10, 9, 8, 5, p.rot, gold);
    const head = new THREE.Mesh(new THREE.SphereGeometry(3.6, 12, 9), gold);
    head.position.set(lx + Math.cos(p.rot + Math.PI / 2) * 9, p.z + 20, ly + Math.sin(p.rot + Math.PI / 2) * 9);
    head.castShadow = true; g.add(head);
    const mane = new THREE.Mesh(new THREE.TorusGeometry(4.4, 1.5, 7, 16), gold);
    mane.position.copy(head.position); mane.rotation.y = -p.rot + Math.PI / 2; g.add(mane);
    if(night){
      const pool = new THREE.Mesh(new THREE.CircleGeometry(22, 18), G.poolMat("#FFD24A", 0.30));
      pool.rotation.x = -Math.PI / 2; pool.position.set(lx, p.z + 0.14, ly); g.add(pool);
    }
    LB.text(G, g, "MGM GRAND", p.x, p.y, p.z + p.h * 0.5, 56, 11, p.rot, "#7AF0B4", null);
  },

  /* The Cosmopolitan: twin glass slabs with lit balcony bands and the LED
     marquee column on the corner. */
  cosmopolitan(G, g, p, T, S){
    const night = T.night, face = G.faceMat("glass", "#2C3440", night);
    for(const [dx, sc, r2] of [[-34, 1.0, 0], [34, 0.90, 0.22]]){
      const x = p.x + Math.cos(p.rot) * dx, y = p.y + Math.sin(p.rot) * dx;
      LB.exUV(LB.ex(G, g, LB.slab(44, 22, 3), x, y, p.z, p.h * sc, p.rot + r2, face), 8, 4);
      // the balconies: a lit band every few floors, as instanced slabs
      const bl = [];
      for(let k = 3; k < 22; k += 2) bl.push([x, y, p.z + p.h * sc * (k / 22), -p.rot - r2]);
      const bg = new THREE.BoxGeometry(46, 0.5, 24);
      LB.many(G, g, bg, night ? G.glowMat("#FFCE86", 0.9) : G.mat("#9AA4B0"), bl, false);
      LB.box(G, g, x, y, p.z + p.h * sc, 48, 26, 2.2, p.rot + r2, G.mat("#1A2028"));
      if(night) LB.crown(G, g, x, y, p.z + p.h * sc + 2.2, 48, 26, p.rot + r2, "#7ADCFF", 1.2);
    }
    LB.podium(G, g, p.x, p.y, p.z, 110, 44, 18, p.rot, "#28303C", night, "#8AD8FF");
    /* the marquee: a tall column of moving light on the street corner */
    const mx = p.x - Math.cos(p.rot + Math.PI / 2) * 50 + Math.cos(p.rot) * 48;
    const my = p.y - Math.sin(p.rot + Math.PI / 2) * 50 + Math.sin(p.rot) * 48;
    LB.box(G, g, mx, my, p.z, 12, 12, p.h * 0.52, p.rot, G.mat("#12161C"));
    const scr = G.screen("#00C8FF");
    for(const sd of [0, 1, 2, 3]){
      const a = p.rot + sd * Math.PI / 2;
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(11.4, p.h * 0.46), scr);
      pl.position.set(mx + Math.cos(a + Math.PI / 2) * 6.1, p.z + p.h * 0.28, my + Math.sin(a + Math.PI / 2) * 6.1);
      pl.rotation.y = -a - Math.PI / 2; g.add(pl);
    }
    if(night){
      const L = new THREE.PointLight(G.col("#4AC8FF"), 2.0, 200, 2);
      L.position.set(mx, p.z + p.h * 0.4, my); L.userData.dynamic = true; g.add(L);
    }
  },

  /* Aria: crisp curved silver-grey glass, two blades meeting at an angle. */
  aria(G, g, p, T, S){
    const night = T.night, face = G.faceMat("darkglass", "#4A5866", night);
    for(const [dx, dy, sc, r2, bow] of [[0, 0, 1.0, 0, 18], [66, 30, 0.82, 0.8, -14], [-58, 34, 0.70, -0.7, 12]]){
      const c = Math.cos(p.rot), s2 = Math.sin(p.rot);
      const x = p.x + dx * c - dy * s2, y = p.y + dx * s2 + dy * c;
      LB.exUV(LB.ex(G, g, LB.arc(62, 20, bow), x, y, p.z, p.h * sc, p.rot + r2, face), 8, 4);
      LB.box(G, g, x, y, p.z + p.h * sc, 66, 26, 1.8, p.rot + r2, G.mat("#2A3440"));
      if(night) LB.crown(G, g, x, y, p.z + p.h * sc + 1.8, 66, 26, p.rot + r2, "#BFE4FF", 1.0);
    }
    LB.podium(G, g, p.x, p.y, p.z, 140, 50, 15, p.rot, "#3A4652", night, "#CFE8FF");
    LB.text(G, g, "ARIA", p.x, p.y, p.z + p.h * 0.62, 34, 10, p.rot, "#E8F4FF", null);
  },

  /* Planet Hollywood: a plain tower over a base wrapped in a media facade. */
  planethollywood(G, g, p, T, S){
    const night = T.night, face = G.faceMat("glass", "#3A5068", night);
    LB.exUV(LB.ex(G, g, LB.slab(46, 28, 4), p.x, p.y, p.z, p.h, p.rot, face), 8, 4);
    LB.box(G, g, p.x, p.y, p.z + p.h, 50, 32, 2.2, p.rot, G.mat("#243448"));
    if(night) LB.crown(G, g, p.x, p.y, p.z + p.h + 2.2, 50, 32, p.rot, "#FF7ACF", 1.3);
    // the base, and the screen wrapped round the side that faces the road
    LB.box(G, g, p.x, p.y, p.z, 118, 54, 26, p.rot, G.mat("#1A2430"));
    const scr = G.screen("#FF3D92");
    for(const [ox, oy, w, a] of [[0, -28, 116, 0], [59, 0, 52, Math.PI / 2], [-59, 0, 52, Math.PI / 2]]){
      const c = Math.cos(p.rot), s2 = Math.sin(p.rot);
      const x = p.x + ox * c - oy * s2, y = p.y + ox * s2 + oy * c;
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(w, 24), scr);
      pl.position.set(x, p.z + 13, y); pl.rotation.y = -p.rot - a + Math.PI;
      g.add(pl);
    }
    if(night){
      const L = new THREE.PointLight(G.col("#FF5AA8"), 2.2, 220, 2);
      L.position.set(p.x, p.z + 20, p.y); L.userData.dynamic = true; g.add(L);
    }
  },

  /* The Mirage: a gold-glass Y tower with the volcano in the lagoon out front.
     Flagged in the summary — the real property closed in 2024 and is being
     rebuilt as a guitar-shaped hotel; this is deliberately the Mirage. */
  mirage(G, g, p, T, S){
    const night = T.night, face = G.faceMat("bronze", "#A07C34", night);
    LB.exUV(LB.ex(G, g, LB.wye(40, 24, p.rot), p.x, p.y, p.z, p.h, 0, face), 8, 4);
    LB.ex(G, g, LB.wye(42, 26, p.rot), p.x, p.y, p.z + p.h, 2.4, 0, G.mat("#7A5C24"));
    if(night) LB.crownRing(G, g, p.x, p.y, p.z + p.h + 3.4, 34, "#FFC04A", 1.6);
    LB.podium(G, g, p.x, p.y, p.z, 118, 46, 15, p.rot, "#8A6C2E", night, "#FFD89A");
    /* the volcano: a cone in a lagoon, with fire at the top */
    const vx = p.x - Math.cos(p.rot + Math.PI / 2) * 66, vy = p.y - Math.sin(p.rot + Math.PI / 2) * 66;
    const lag = new THREE.Mesh(new THREE.CircleGeometry(34, 26),
      new THREE.MeshStandardMaterial({ color:G.col("#08201E"), roughness:0.07, metalness:0.9, envMapIntensity:1.6 }));
    lag.rotation.x = -Math.PI / 2; lag.position.set(vx, p.z + 0.35, vy); g.add(lag);
    LB.cone(G, g, vx, vy, p.z, 22, 26, G.mat("#2A2420", { roughness:0.95 }), 16);
    for(let i = 0; i < 5; i++){
      const a = i / 5 * TAU;
      LB.cone(G, g, vx + Math.cos(a) * 15, vy + Math.sin(a) * 15, p.z, 9, 12 + i, G.mat("#332C26"), 10);
    }
    if(night){
      const fire = new THREE.Mesh(new THREE.ConeGeometry(9, 22, 12),
        new THREE.MeshBasicMaterial({ color:G.col("#FF7A1A"), transparent:true, opacity:0.55,
          blending:THREE.AdditiveBlending, depthWrite:false }));
      fire.position.set(vx, p.z + 32, vy); fire.userData.dynamic = true; g.add(fire);
      const L = new THREE.PointLight(G.col("#FF8A2A"), 3.0, 260, 2);
      L.position.set(vx, p.z + 30, vy); L.userData.dynamic = true; g.add(L);
      G.dyn.push({ kind:"flicker", obj:fire, light:L, base:3.0 });
    }
    LB.text(G, g, "MIRAGE", p.x, p.y, p.z + p.h * 0.55, 42, 11, p.rot, "#FFD88A", null);
  },

  /* Circus Circus: pink and white blocks under a big-top canopy. */
  circus(G, g, p, T, S){
    const night = T.night;
    const face = G.faceMat("stucco", "#E8E2DC", night);
    LB.exUV(LB.ex(G, g, LB.slab(70, 26, 4), p.x, p.y, p.z, p.h, p.rot, face), 8, 4);
    LB.exUV(LB.ex(G, g, LB.slab(50, 24, 4), p.x + Math.cos(p.rot) * 62, p.y + Math.sin(p.rot) * 62,
      p.z, p.h * 0.8, p.rot + 0.3, G.faceMat("stucco", "#D8547E", night)), 8, 4);
    if(night){
      LB.crown(G, g, p.x, p.y, p.z + p.h, 72, 28, p.rot, "#FF6AA8", 1.3);
      LB.crown(G, g, p.x + Math.cos(p.rot) * 62, p.y + Math.sin(p.rot) * 62, p.z + p.h * 0.8, 52, 26, p.rot + 0.3, "#FFFFFF", 1.1);
    }
    /* the big top: a striped tent over the casino */
    const tx = p.x - Math.cos(p.rot + Math.PI / 2) * 68, ty = p.y - Math.sin(p.rot + Math.PI / 2) * 68;
    for(let k = 0; k < 16; k++){
      const a0 = k / 16 * TAU;
      const sh = new THREE.Shape();
      sh.moveTo(0, 0);
      for(let i = 0; i <= 6; i++){ const t = i / 6; sh.lineTo(Math.cos(a0 + t * TAU / 16) * 40, Math.sin(a0 + t * TAU / 16) * 40); }
      sh.closePath();
      const geo = new THREE.ExtrudeGeometry(sh, { depth:0.6, bevelEnabled:false, curveSegments:4 });
      geo.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(geo, k % 2 ? G.mat("#F4F0EC") : (night ? G.glowMat("#FF4A8E", 0.9) : G.mat("#D8547E")));
      m.position.set(tx, p.z + 30 - Math.cos(0) * 0, ty);
      m.castShadow = true; g.add(m);
    }
    LB.cone(G, g, tx, ty, p.z + 30, 41, 20, G.mat("#E8E2DC", { roughness:0.9 }), 16);
    LB.cyl(G, g, tx, ty, p.z + 50, 1.2, 0.3, 8, night ? G.glowMat("#FF4A8E", 3.0) : G.mat("#D8547E"), 8);
    LB.cyl(G, g, tx, ty, p.z, 6, 6, 30, G.mat("#DCD6D0"), 14);
    LB.text(G, g, "CIRCUS CIRCUS", p.x, p.y, p.z + p.h * 0.62, 58, 12, p.rot, "#FFB0D4", null);
  },

  /* The STRAT: a slim tapered concrete shaft with the pod near the top and a
     spire above it. The published height is about 1,149 ft, so it is by far the
     tallest thing on the Strip and should read that way. */
  strat(G, g, p, T, S){
    const night = T.night;
    const H2 = p.h;
    const shaft = [];
    for(let i = 0; i <= 10; i++){
      const t = i / 10;
      shaft.push(new THREE.Vector2(13 * (1 - t * 0.62) + 0.5, t * H2 * 0.74));
    }
    LB.lathe(G, g, p.x, p.y, p.z, shaft, G.faceMat("concrete", "#DCD6C6", night), 20);
    // the three legs at the base
    for(let k = 0; k < 3; k++){
      const a = p.rot + k * TAU / 3;
      LB.box(G, g, p.x + Math.cos(a) * 15, p.y + Math.sin(a) * 15, p.z, 9, 22, H2 * 0.16, a + Math.PI / 2,
        G.mat("#CFC8B6"));
    }
    /* the pod: several lit decks and an observation ring */
    const pz = p.z + H2 * 0.74;
    LB.cyl(G, g, p.x, p.y, pz, 9, 17, H2 * 0.045, G.mat("#847D6E"), 24);
    for(let k = 0; k < 4; k++){
      const zz = pz + H2 * 0.045 + k * H2 * 0.026;
      LB.cyl(G, g, p.x, p.y, zz, 18 - k * 1.2, 18 - k * 1.2, H2 * 0.022,
        night ? G.glowMat(k % 2 ? "#FFD9A0" : "#8AD4FF", 1.7) : G.mat("#E8E2D4"), 24);
    }
    LB.cyl(G, g, p.x, p.y, pz + H2 * 0.15, 11, 7, H2 * 0.05, G.mat("#C0B8A6"), 20);
    // the spire
    LB.cyl(G, g, p.x, p.y, pz + H2 * 0.20, 4, 1.2, H2 * 0.045, G.mat("#B8B0A0"), 12);
    LB.cyl(G, g, p.x, p.y, pz + H2 * 0.245, 1.2, 0.25, H2 * 0.075,
      night ? G.glowMat("#FFEEC0", 2.6) : G.mat("#CFC8B8"), 8);
    if(night){
      const L = new THREE.PointLight(G.col("#FFD9A0"), 2.6, 420, 2);
      L.position.set(p.x, pz + H2 * 0.10, p.y); L.userData.dynamic = true; g.add(L);
      // the aviation light on the spire
      const av = new THREE.Mesh(new THREE.SphereGeometry(1.6, 8, 6), G.glowMat("#FF2A1A", 4.0));
      av.position.set(p.x, pz + H2 * 0.325, p.y); av.userData.dynamic = true; g.add(av);
      G.dyn.push({ kind:"beacon", obj:av, rate:1.1 });
    }
    LB.text(G, g, "THE STRAT", p.x, p.y, p.z + H2 * 0.40, 30, 9, p.rot, "#FFE4A8", null);
  },

  /* Fontainebleau: the tall dark-blue glass slab at the north end. */
  fontainebleau(G, g, p, T, S){
    const night = T.night, face = G.faceMat("darkglass", "#1A3A72", night);
    LB.exUV(LB.ex(G, g, LB.arc(54, 24, 11), p.x, p.y, p.z, p.h, p.rot, face), 8, 4);
    LB.box(G, g, p.x, p.y, p.z + p.h, 58, 30, 2.4, p.rot, G.mat("#0E2450"));
    if(night) LB.crown(G, g, p.x, p.y, p.z + p.h + 2.4, 58, 30, p.rot, "#5A9AFF", 1.5);
    LB.podium(G, g, p.x, p.y, p.z, 96, 44, 16, p.rot, "#16305E", night, "#7AB4FF");
  },
};

/* a handful of properties that only need to read as the right colour and mass */
for(const [k, style, col, label] of [
  ["resorts", "glass", "#3A4252", "RESORTS WORLD"],
  ["treasure", "stucco", "#C7A98C", "TREASURE ISLAND"],
  ["harrahs", "stucco", "#6E4E9E", "HARRAH'S"],
  ["flamingo", "stucco", "#D8547E", "FLAMINGO"],
  ["horseshoe", "stone", "#8E8E96", "HORSESHOE"],
]){
  LM3[k] = function(G, g, p, T, S){
    const night = T.night, face = G.faceMat(style, col, night);
    LB.exUV(LB.ex(G, g, LB.slab(56, 26, 5), p.x, p.y, p.z, p.h, p.rot, face), 8, 4);
    LB.exUV(LB.ex(G, g, LB.slab(38, 22, 4), p.x + Math.cos(p.rot) * 50, p.y + Math.sin(p.rot) * 50,
      p.z, p.h * 0.76, p.rot + 0.4, face), 8, 4);
    LB.box(G, g, p.x, p.y, p.z + p.h, 60, 30, 2.2, p.rot, G.mat(shade(col, -0.3)));
    if(night) LB.crown(G, g, p.x, p.y, p.z + p.h + 2.2, 60, 30, p.rot, shade(col, 0.5), 1.1);
    LB.podium(G, g, p.x, p.y, p.z, 92, 40, 14, p.rot, shade(col, -0.15), night, shade(col, 0.55));
    LB.text(G, g, label, p.x, p.y, p.z + p.h * 0.62, 46, 10, p.rot, "#FFEAC8", null);
  };
}

/* ---- the paddock, and the sign over it ---------------------------------- */

/* the letters F and 1, drawn as outlines so they can be extruded with real
   depth. Deliberately not the Formula 1 wordmark: this is a bold italic F with
   a squared-off 1 beside it, in the same spirit but drawn here. */
function f1Shapes(){
  const sk = 0.30;                                     // the lean
  const sh = (pts) => { const s = new THREE.Shape();
    pts.forEach(([x, y], i) => { const X = x + y * sk; i ? s.lineTo(X, y) : s.moveTo(X, y); });
    s.closePath(); return s; };
  // the F: a spine, a full top arm and a shorter middle arm, all squared off
  const F = sh([[0, 0], [0.30, 0], [0.30, 0.40], [0.86, 0.40], [0.86, 0.66], [0.30, 0.66],
                [0.30, 0.74], [1.00, 0.74], [1.00, 1.00], [0, 1.00]]);
  // the 1: a slab with the flag cut back off its top left
  const N = sh([[1.20, 0], [1.56, 0], [1.56, 1.00], [1.26, 1.00], [1.02, 0.80], [1.02, 0.52],
                [1.20, 0.66]]);
  return [F, N];
}

LM3.f1sign = function(G, g, p, T, S){
  const night = T.night;
  const H2 = p.h;                                       // the letters' cap height
  const [F, N] = f1Shapes();
  const depth = H2 * 0.20;
  const red = new THREE.MeshStandardMaterial({ color:G.col("#E10600"), roughness:0.38, metalness:0.15,
    emissive:G.col("#E10600"), emissiveIntensity:night ? 1.25 : 0.25 });
  const white = new THREE.MeshStandardMaterial({ color:G.col("#F6F6F6"), roughness:0.34, metalness:0.1,
    emissive:G.col("#FFFFFF"), emissiveIntensity:night ? 0.85 : 0.2 });
  const side = new THREE.MeshStandardMaterial({ color:G.col("#7A0300"), roughness:0.6, metalness:0.2 });
  const grp = new THREE.Group();
  for(const [shape, mat] of [[F, white], [N, red]]){
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled:true,
      bevelThickness:H2 * 0.02, bevelSize:H2 * 0.015, bevelSegments:2, curveSegments:4 });
    geo.scale(H2, H2, 1);
    const m = new THREE.Mesh(geo, [mat, side]);
    m.castShadow = true; grp.add(m);
  }
  // the speed streaks off the back of the mark
  for(let i = 0; i < 4; i++){
    const y = H2 * (0.14 + i * 0.22), w = H2 * (1.5 - i * 0.28), t = H2 * 0.085;
    const s2 = new THREE.Shape();
    s2.moveTo(0, 0); s2.lineTo(w, t * 0.5); s2.lineTo(w - t * 0.8, t * 1.4); s2.lineTo(0, t);
    s2.closePath();
    const geo = new THREE.ExtrudeGeometry(s2, { depth:depth * 0.7, bevelEnabled:false });
    const m = new THREE.Mesh(geo, red);
    m.position.set(H2 * 1.70, y, 0); grp.add(m);
  }
  // the shapes are drawn from the origin outward, so slide the whole mark back
  // to sit centred on its frame
  grp.children.forEach(m => m.position.x -= H2 * 1.55);
  grp.position.set(p.x, p.z + H2 * 0.95, p.y);
  grp.rotation.y = -p.rot;                       // along the straight, facing across it
  g.add(grp);

  // the line underneath
  LB.text(G, g, "LAS VEGAS GRAND PRIX", p.x, p.y, p.z + H2 * 0.64, H2 * 3.0, H2 * 0.40,
    p.rot, "#F6F6F6", null);

  /* the steel frame it stands on */
  const leg = G.mat("#4A5058", { roughness:0.5, metalness:0.7 });
  for(const sd of [-1, 1]){
    const lx = p.x + Math.cos(p.rot) * sd * H2 * 1.5, ly = p.y + Math.sin(p.rot) * sd * H2 * 1.5;
    LB.box(G, g, lx, ly, p.z, 1.6, 1.6, H2 * 0.95, p.rot, leg);
    for(let k = 0; k < 4; k++)
      LB.box(G, g, lx, ly, p.z + H2 * 0.18 * k, 0.9, 0.9, 0.9, p.rot + 0.7, leg);
  }
  LB.box(G, g, p.x, p.y, p.z + H2 * 0.88, H2 * 3.4, 1.6, 1.2, p.rot, leg);
  LB.box(G, g, p.x, p.y, p.z + H2 * 0.50, H2 * 3.4, 1.0, 0.8, p.rot, leg);
  if(night){
    const L = new THREE.PointLight(G.col("#FF3A2A"), 3.0, 260, 2);
    L.position.set(p.x, p.z + H2 * 1.3, p.y); L.userData.dynamic = true; g.add(L);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(H2 * 2.2, 20), G.poolMat("#FF6A4A", 0.22));
    pool.rotation.x = -Math.PI / 2; pool.position.set(p.x, p.z + 0.16, p.y); g.add(pool);
  }
};

/* the paddock building: garages below, hospitality above, a lit roof rim */
LM3.vegaspit = function(G, g, p, T, S){
  const night = T.night, L2 = 230, W2 = 34;
  const face = G.faceMat("concrete", "#2E3138", night);
  // the ground floor, with the garage openings cut into the track side
  LB.box(G, g, p.x, p.y, p.z, L2, W2, 9, p.rot, face);
  const nx = Math.cos(p.rot + Math.PI / 2), ny = Math.sin(p.rot + Math.PI / 2);
  const NG = 11;
  for(let i = 0; i < NG; i++){
    const t = (i / (NG - 1) - 0.5) * (L2 - 24);
    const gx = p.x + Math.cos(p.rot) * t - nx * (W2 / 2 + 0.3);
    const gy = p.y + Math.sin(p.rot) * t - ny * (W2 / 2 + 0.3);
    // the lit interior behind the opening
    const op = new THREE.Mesh(new THREE.PlaneGeometry(13, 7),
      night ? G.glowMat("#FFE8C0", 1.5) : G.mat("#D8DCE2"));
    op.position.set(gx, p.z + 3.6, gy); op.rotation.y = -p.rot + Math.PI / 2; g.add(op);
    // the banner over it, in the team's colour
    const team = TEAMS[i % TEAMS.length];
    const ban = new THREE.Mesh(new THREE.PlaneGeometry(13, 2.2),
      night ? G.glowMat(team.body, 1.3) : G.mat(team.body));
    ban.position.set(gx - nx * 0.1, p.z + 8.0, gy - ny * 0.1);
    ban.rotation.y = -p.rot + Math.PI / 2; g.add(ban);
    if(night){
      const pool = new THREE.Mesh(new THREE.CircleGeometry(9, 12), G.poolMat("#FFD9A0", 0.20));
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(gx - nx * 5, p.z + 0.15, gy - ny * 5); g.add(pool);
    }
  }
  // the hospitality deck: a glazed band set back over the garages
  LB.box(G, g, p.x, p.y, p.z + 9, L2 - 6, W2 - 4, 1.2, p.rot, G.mat("#1C2026"));
  LB.box(G, g, p.x, p.y, p.z + 10.2, L2 - 10, W2 - 8, 11, p.rot,
    G.faceMat("glass", "#3E4A5A", night));
  LB.box(G, g, p.x, p.y, p.z + 21.2, L2 - 4, W2 - 4, 1.6, p.rot, G.mat("#171A1F"));
  // the lit rim round the roof
  if(night){
    LB.crown(G, g, p.x, p.y, p.z + 22.8, L2 - 4, W2 - 4, p.rot, "#E8EEF6", 0.9);
    LB.crown(G, g, p.x, p.y, p.z + 8.9, L2 - 4, W2 - 2, p.rot, "#FF3D92", 0.7);
  }
  // the roof terrace furniture, so it does not read as a bare slab
  const pods = [];
  for(let i = 0; i < 14; i++){
    const t = (i / 13 - 0.5) * (L2 - 30);
    pods.push([p.x + Math.cos(p.rot) * t + nx * 6, p.y + Math.sin(p.rot) * t + ny * 6, p.z + 22.8, -p.rot]);
  }
  const pg = new THREE.BoxGeometry(7, 3.2, 7); pg.translate(0, 1.6, 0);
  LB.many(G, g, pg, G.mat("#E8EAEE", { roughness:0.85 }), pods, true);
};

/* ---------- 10c. the city the circuit runs through -------------------------
   A street circuit is only convincing if the streets keep going after the
   barrier does. This lays down the cross streets that meet the lap and are
   closed off at it, the blocks between them, the low city out to the desert and
   the mountains behind that, and then fills the near ground with the clutter
   you would actually be driving past.

   The rule throughout is that repetition is instanced and everything static is
   merged, so a few thousand objects arrive as a few dozen draw calls. It is
   built once per session from the track's own nodes, and only for circuits that
   ask for it, so no other track pays for any of it.
   ------------------------------------------------------------------------- */
const CITY = {
  /* world position and heading at a lap fraction and a lateral offset */
  at(T, u, off){
    const i = ((Math.round(u * T.n) % T.n) + T.n) % T.n;
    return { x:T.x[i] + T.nx[i] * off, y:T.y[i] + T.ny[i] * off, z:T.z[i],
             a:T.ang[i], nx:T.nx[i], ny:T.ny[i], i };
  },
  /* is this patch of ground clear of the circuit and of anything named?
     The filler blocks are there to thicken the skyline, not to be dropped into
     the Bellagio's lake. */
  clear(T, x, y, pad){
    const i = T.near(x, y);
    const dx = x - T.x[i], dy = y - T.y[i];
    // the run-off on this side at this point, not the widest anywhere on the
    // lap — otherwise one escape road holds the whole city back by twenty metres
    const side = dx * T.nx[i] + dy * T.ny[i];
    const ro = side >= 0 ? T.roR[i] : T.roL[i];
    if(Math.hypot(dx, dy) <= T.half + ro + 3.5 + pad) return false;
    for(const k of this.keepOut){
      if(Math.abs(x - k[0]) < k[2] && Math.abs(y - k[1]) < k[2]) return false;
    }
    return true;
  },
  /* how much room each landmark needs around it, from its own footprint */
  plots(T){
    const out = [];
    for(const p of T.props){
      if(p.t === "sphere"){ out.push([p.x, p.y, p.h * 0.88]); continue; }
      if(p.t !== "lm") continue;
      // just the property's own plot. Any larger and the whole near ground gets
      // reserved, which is what left the circuit standing in a dark field.
      const R2 = { bellagio:126, caesars:142, venetian:132, eiffel:132, nyny:152, luxor:172,
                   excalibur:122, mgm:124, strat:74, circus:112, aria:124, cosmopolitan:120,
                   wynn:124, mirage:132, palazzo:102, planethollywood:104, vegaspit:132,
                   fontainebleau:92, f1sign:56 }[p.k];
      out.push([p.x, p.y, R2 == null ? 88 : R2]);
    }
    return out;
  },

  build(G, parent, T, S){
    const night = T.night, g = new THREE.Group();
    this.G = G; this.T = T; this.night = night;
    this.keepOut = this.plots(T); this._spots = new Map();
    const RNG = (() => { let s = 20260921; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; })();
    this.rnd = RNG;

    this.streets(G, g, T);
    this.blocks(G, g, T);
    this.frontage(G, g, T);
    this.skyline(G, g, T);
    this.mountains(G, g, T);
    this.furniture(G, g, T);
    this.adverts(G, g, T);
    parent.add(g);
    return g;
  },


  /* ---- the buildings that line the circuit itself ----
     The skyline pass fills the distance; this fills the near ground, which is
     what actually makes a street circuit feel like a street. Blocks are laid in
     three depth bands out from the barrier, in the gaps the circuit, the cross
     streets and the named properties leave behind. All of it is instanced, in
     four material buckets, so several hundred buildings arrive as four draws. */
  frontage(G, g, T){
    const night = this.night, n = T.n;
    const rnd = this.rnd;
    const buckets = [[], [], [], []];
    // distance from the barrier, height range, and how often to bother
    const BANDS = [[7, 8, 22, 0.78], [40, 13, 40, 0.70], [86, 18, 66, 0.54], [148, 24, 92, 0.38]];
    for(let i = 0; i < n; i += 2){
      const tx = Math.cos(T.ang[i]), ty = Math.sin(T.ang[i]);
      for(const sd of [-1, 1]){
        const edge = T.half + (sd < 0 ? T.roL[i] : T.roR[i]) + 4;
        for(let b = 0; b < BANDS.length; b++){
          const [d0, hLo, hHi, chance] = BANDS[b];
          if(rnd() > chance) continue;
          const w2 = 16 + rnd() * 30, dep = 16 + rnd() * 28;
          const o = sd * (edge + d0 + rnd() * 22 + dep * 0.5);
          const x = T.x[i] + T.nx[i] * o + tx * (rnd() - 0.5) * 24;
          const y = T.y[i] + T.ny[i] * o + ty * (rnd() - 0.5) * 24;
          const rad = Math.max(w2, dep) * 0.55;
          if(!this.clear(T, x, y, rad + 2)) continue;
          if(this.onStreet(x, y, rad + 6)) continue;
          if(!this.takeSpot(x, y, rad + 4)) continue;
          // nearer the road the blocks are lower and squarer; further back they climb
          const h = hLo + Math.pow(rnd(), 1.6) * (hHi - hLo);
          const rot = T.ang[i] + (rnd() - 0.5) * 0.5;
          buckets[b].push([x, y, T.z[T.near(x, y)], rot, 1, 1, w2, dep, h]);
        }
      }
    }
    const MAT = [
      ["#5E5668", [1, 1.1], 0.40],      // low frontage: shops and podiums
      ["#544E60", [1, 1.7], 0.44],
      ["#4E5668", [1, 2.4], 0.50],
      ["#48526A", [1, 3.2], 0.54],
    ];
    for(let b = 0; b < 4; b++){
      const list = buckets[b];
      if(!list.length) continue;
      const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
      const im = new THREE.InstancedMesh(geo, this.blockMat(G, MAT[b][0], MAT[b][1], MAT[b][2]), list.length);
      const d = new THREE.Object3D();
      list.forEach((it, k) => {
        d.position.set(it[0], it[2], it[1]); d.rotation.set(0, it[3], 0);
        d.scale.set(it[6], it[8], it[7]); d.updateMatrix();
        im.setMatrixAt(k, d.matrix);
      });
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = b === 0; im.receiveShadow = true; im.userData.dynamic = true;
      g.add(im);
      // a lit parapet on the nearest band, so the rooflines catch the eye
      if(b === 0 && night){
        const cg = LB.shell(); cg.translate(0, 0.5, 0);
        const cm = new THREE.InstancedMesh(cg, G.glowMat("#FFB86A", 0.85), list.length);
        list.forEach((it, k) => {
          d.position.set(it[0], it[2] + it[8], it[1]); d.rotation.set(0, it[3], 0);
          d.scale.set(it[6] + 0.9, 0.7, it[7] + 0.9); d.updateMatrix();
          cm.setMatrixAt(k, d.matrix);
        });
        cm.instanceMatrix.needsUpdate = true; cm.userData.dynamic = true;
        g.add(cm);
      }
    }
    this.frontageCount = buckets.reduce((a, b2) => a + b2.length, 0);
  },

  /* one material per band: instanced boxes are stretched to every size, so the
     window grid is chosen for the band's average block rather than each one */
  blockMat(G, col, rep, glow){
    const night = this.night;
    const key = "blk|" + col + "|" + rep.join(",");
    this._bm = this._bm || new Map();
    if(this._bm.has(key)) return this._bm.get(key);
    const w2 = PTEX.windowTex("concrete", col).clone();
    w2.needsUpdate = true; w2.wrapS = w2.wrapT = THREE.RepeatWrapping;
    w2.encoding = THREE.sRGBEncoding; w2.repeat.set(rep[0], rep[1]);
    const m = new THREE.MeshStandardMaterial({
      color:G.col(col), roughness:0.9, metalness:0.03, envMapIntensity:0.5,
      emissiveMap:night ? w2 : null, emissive:new THREE.Color(1, 1, 1),
      emissiveIntensity:night ? glow : 0 });
    this._bm.set(key, m); return m;
  },

  /* A coarse hash of what has already been placed, so blocks stand next to each
     other rather than through each other. One cell per twenty metres is enough
     at these sizes and costs nothing. */
  takeSpot(x, y, r){
    if(!this._spots) this._spots = new Map();
    const CS = 20;
    const c0 = Math.floor((x - r) / CS), c1 = Math.floor((x + r) / CS);
    const r0 = Math.floor((y - r) / CS), r1 = Math.floor((y + r) / CS);
    for(let c = c0; c <= c1; c++) for(let q = r0; q <= r1; q++){
      const e = this._spots.get(c + "," + q);
      if(e && Math.hypot(x - e[0], y - e[1]) < r + e[2]) return false;
    }
    for(let c = c0; c <= c1; c++) for(let q = r0; q <= r1; q++) this._spots.set(c + "," + q, [x, y, r]);
    return true;
  },

  /* is this spot in the middle of one of the cross streets? */
  onStreet(x, y, pad){
    for(const s of (this.streetSegs || [])){
      const dx = x - s[0], dy = y - s[1];
      const along = dx * s[2] + dy * s[3];
      if(along < -pad || along > s[4] + pad) continue;
      const across = Math.abs(-dx * s[3] + dy * s[2]);
      if(across < s[5] + pad) return true;
    }
    return false;
  },

  /* ---- the road grid: cross streets closed off at the circuit ---- */
  streets(G, g, T){
    const night = this.night;
    const asph = G.mat("#2A2730", { roughness:0.94 });
    const walk = G.mat("#3E3A46", { roughness:0.96 });
    const kerb = G.mat("#5A5564", { roughness:0.9 });
    const paint = G.mat("#C8C4B0", { roughness:0.85 });
    const dash = [], cross = [], lights = [];

    // where a street meets the lap, which side it leaves on, and how far it runs
    const XS = T.def.streets || [];
    this.streetSegs = [];
    for(const st of XS){
      const p = this.at(T, st.u, 0);
      // the street leaves at right angles to the circuit, on the side given
      const sd = st.side === "in" ? -1 : 1;
      const dx = T.nx[p.i] * sd, dy = T.ny[p.i] * sd;
      const px = -dy, py = dx;                       // across the street
      const near = T.half + (sd < 0 ? T.roL[p.i] : T.roR[p.i]) + 4, far = near + (st.len || 260);
      const halfW = (st.w || 22) / 2;
      // the carriageway
      const cx = p.x + dx * (near + far) / 2, cy = p.y + dy * (near + far) / 2;
      const ang = Math.atan2(dy, dx);
      // origin, direction, length, half width — what the frontage pass avoids
      this.streetSegs.push([p.x + dx * near, p.y + dy * near, dx, dy, far - near, halfW + 5]);
      LB.box(G, g, cx, cy, p.z - 0.10, far - near, halfW * 2, 0.10, ang, asph);
      // the footways either side, raised
      for(const s2 of [-1, 1]){
        LB.box(G, g, cx + px * s2 * (halfW + 2.4), cy + py * s2 * (halfW + 2.4), p.z - 0.05,
          far - near, 4.8, 0.30, ang, walk);
        LB.box(G, g, cx + px * s2 * halfW, cy + py * s2 * halfW, p.z - 0.05,
          far - near, 0.5, 0.34, ang, kerb);
      }
      // the centre line, dashed
      for(let d = near + 6; d < far - 6; d += 12)
        dash.push([p.x + dx * d, p.y + dy * d, p.z + 0.02, -ang, 1]);
      // the stop bar and the arrows where it is closed off
      LB.box(G, g, p.x + dx * (near + 3), p.y + dy * (near + 3), p.z + 0.01, 0.8, halfW * 2 - 2, 0.02, ang, paint);
      for(const s2 of [-0.5, 0.5])
        cross.push([p.x + dx * (near + 11) + px * s2 * halfW, p.y + dy * (near + 11) + py * s2 * halfW,
                    p.z + 0.02, -ang, 1]);
      // the crossing, back from the barrier
      for(let k = -6; k <= 6; k++)
        LB.box(G, g, p.x + dx * (near + 26) + px * k * 1.6, p.y + dy * (near + 26) + py * k * 1.6,
          p.z + 0.01, 3.4, 0.7, 0.02, ang, paint);
      // the signal on the corner, dark or blinking amber
      if(st.lights !== false) for(const s2 of [-1, 1]){
        const lx = p.x + dx * (near + 6) + px * s2 * (halfW + 2.4);
        const ly = p.y + dy * (near + 6) + py * s2 * (halfW + 2.4);
        LB.box(G, g, lx, ly, p.z, 0.42, 0.42, 6.2, ang, G.mat("#2E323A"));
        LB.box(G, g, lx + dx * 3, ly + dy * 3, p.z + 6.0, 6.4, 0.3, 0.3, ang, G.mat("#2E323A"));
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.0, 0.6),
          night ? G.glowMat("#FFA000", 1.2) : G.mat("#3A2A10"));
        head.position.set(lx + dx * 5.6, p.z + 5.2, ly + dy * 5.6);
        head.userData.dynamic = true; g.add(head);
        lights.push(head);
      }
      // a few parked cars along the kerb, behind the fence
      const cars = [];
      for(let d = near + 40; d < far - 14; d += 7.5)
        for(const s2 of [-1, 1])
          if(this.rnd() < 0.55)
            cars.push([p.x + dx * d + px * s2 * (halfW - 2.2), p.y + dy * d + py * s2 * (halfW - 2.2),
                       p.z, -ang, 1]);
      if(cars.length) this.cars(G, g, cars);
    }
    if(dash.length){
      const dg = new THREE.BoxGeometry(5, 0.04, 0.35); dg.translate(0, 0.02, 0);
      LB.many(G, g, dg, G.mat("#D8D4C0"), dash, false);
    }
    if(cross.length){
      const ag = new THREE.ConeGeometry(1.3, 3.4, 3); ag.rotateX(-Math.PI / 2); ag.rotateY(Math.PI / 2);
      ag.translate(0, 0.02, 0);
      LB.many(G, g, ag, G.mat("#D8D4C0"), cross, false);
    }
    if(lights.length) this.G.dyn.push({ kind:"amber", heads:lights });
  },

  /* a row of parked cars, as one instanced body and one instanced glasshouse */
  cars(G, g, list){
    const night = this.night;
    const body = new THREE.BoxGeometry(4.5, 1.1, 1.9); body.translate(0, 0.65, 0);
    const cab = new THREE.BoxGeometry(2.4, 0.8, 1.75); cab.translate(-0.2, 1.55, 0);
    const cols = ["#8A9099", "#3A3F48", "#B0B6BE", "#2A2E36", "#6E4A3A", "#D8DCE0"];
    // bucketed by colour so each bucket is one instanced mesh
    for(let c = 0; c < cols.length; c++){
      const sub = list.filter((_, i) => i % cols.length === c);
      if(!sub.length) continue;
      LB.many(G, g, body, G.mat(cols[c], { roughness:0.35, metalness:0.4 }), sub, true);
      LB.many(G, g, cab, G.mat("#151A22", { roughness:0.15, metalness:0.2 }), sub, false);
    }
  },

  /* ---- the blocks between the streets: podiums, garages, the near city ---- */
  blocks(G, g, T){
    const night = this.night;
    const gar = [];
    for(const b of (T.def.garages || [])){
      const p = this.at(T, b.u, (b.side === "in" ? -1 : 1) * b.off);
      const lv = b.lv || 5, lh = 3.4;
      LB.box(G, g, p.x, p.y, p.z, b.l || 70, b.w || 46, 1.2, p.a, G.mat("#2A2832"));
      for(let k = 0; k < lv; k++){
        // the deck, and the lit gap between it and the next one
        LB.box(G, g, p.x, p.y, p.z + 1.2 + k * lh, b.l || 70, b.w || 46, 0.7, p.a, G.mat("#34313E"));
        if(night){
          const band = new THREE.Mesh(new THREE.BoxGeometry((b.l || 70) - 1, lh - 1.1, (b.w || 46) - 1),
            G.glowMat("#FFE0AA", 0.55));
          band.position.set(p.x, p.z + 1.2 + k * lh + 0.7 + (lh - 1.1) / 2, p.y);
          band.rotation.y = -p.a; g.add(band);
        }
        // the columns round the edge, so it is not a stack of slabs
        for(let q = 0; q < 10; q++){
          const t = (q / 9 - 0.5) * ((b.l || 70) - 4);
          for(const s2 of [-1, 1])
            gar.push([p.x + Math.cos(p.a) * t - Math.sin(p.a) * s2 * ((b.w || 46) / 2 - 1),
                      p.y + Math.sin(p.a) * t + Math.cos(p.a) * s2 * ((b.w || 46) / 2 - 1),
                      p.z + 1.2 + k * lh + 0.7, -p.a, 1, (lh - 0.7) / 2]);
        }
      }
      LB.box(G, g, p.x, p.y, p.z + 1.2 + lv * lh, (b.l || 70) + 2, (b.w || 46) + 2, 1.0, p.a, G.mat("#26242E"));
      // the cars on the open top deck
      const top = [];
      for(let q = 0; q < 24; q++){
        const tx = ((q % 12) / 11 - 0.5) * ((b.l || 70) - 10);
        const ty = (Math.floor(q / 12) - 0.5) * ((b.w || 46) * 0.4);
        top.push([p.x + Math.cos(p.a) * tx - Math.sin(p.a) * ty,
                  p.y + Math.sin(p.a) * tx + Math.cos(p.a) * ty, p.z + 1.2 + lv * lh + 1.0, -p.a, 1]);
      }
      this.cars(G, g, top);
    }
    if(gar.length){
      const cg = new THREE.BoxGeometry(0.7, 2, 0.7); cg.translate(0, 1, 0);
      LB.many(G, g, cg, G.mat("#3E3A48"), gar, false);
    }

    /* the cranes, with their aviation lights */
    for(const c of (T.def.cranes || [])){
      const p = this.at(T, c.u, (c.side === "in" ? -1 : 1) * c.off);
      const h = c.h || 90;
      const mast = G.mat("#C8A030", { roughness:0.6, metalness:0.5 });
      LB.box(G, g, p.x, p.y, p.z, 5, 5, h, p.a + 0.4, mast);
      LB.box(G, g, p.x + Math.cos(p.a + 0.4) * 22, p.y + Math.sin(p.a + 0.4) * 22, p.z + h, 62, 3.2, 3.2, p.a + 0.4, mast);
      LB.box(G, g, p.x, p.y, p.z + h + 3.2, 7, 7, 5, p.a + 0.4, G.mat("#2E3238"));
      if(this.night){
        const bl = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 6), G.glowMat("#FF2A1A", 4.0));
        bl.position.set(p.x, p.z + h + 9, p.y); bl.userData.dynamic = true; g.add(bl);
        G.dyn.push({ kind:"beacon", obj:bl, rate:0.62 });
      }
    }

    /* the pedestrian overpasses, which on the Strip cross at every junction */
    for(const o of (T.def.bridges || [])){
      const p = this.at(T, o.u, 0);
      const span = (T.half + T.runoffMax) * 2 + 34;
      const deck = G.mat("#3A3F48", { roughness:0.7, metalness:0.3 });
      LB.box(G, g, p.x, p.y, p.z + 9.2, 5.2, span, 1.0, p.a, deck);
      LB.box(G, g, p.x, p.y, p.z + 10.2, 5.6, span, 0.4, p.a,
        this.night ? G.glowMat("#8AD8FF", 0.7) : G.mat("#6E7A88"));
      // the glazing along the sides, and the stair towers at each end
      for(const s2 of [-1, 1]){
        const gl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.6, span),
          new THREE.MeshStandardMaterial({ color:G.col("#2A3A4A"), roughness:0.1, metalness:0.4,
            transparent:true, opacity:0.45 }));
        gl.position.set(p.x + Math.cos(p.a) * s2 * 2.6, p.z + 11.5, p.y + Math.sin(p.a) * s2 * 2.6);
        gl.rotation.y = -p.a; g.add(gl);
        const ex = p.x + T.nx[p.i] * s2 * (span / 2 - 4), ey = p.y + T.ny[p.i] * s2 * (span / 2 - 4);
        LB.box(G, g, ex, ey, p.z, 9, 9, 10.2, p.a, G.mat("#333842"));
        if(this.night) LB.crown(G, g, ex, ey, p.z + 10.2, 10, 10, p.a, "#8AD8FF", 0.6);
      }
      // the crowd on it
      const ppl = [];
      for(let k = 0; k < 26; k++)
        ppl.push([p.x + T.nx[p.i] * (this.rnd() - 0.5) * span * 0.9 + Math.cos(p.a) * (this.rnd() - 0.5) * 3,
                  p.y + T.ny[p.i] * (this.rnd() - 0.5) * span * 0.9 + Math.sin(p.a) * (this.rnd() - 0.5) * 3,
                  p.z + 10.6, this.rnd() * TAU, 1]);
      const hg = new THREE.CylinderGeometry(0.26, 0.3, 1.7, 5); hg.translate(0, 0.85, 0);
      LB.many(G, g, hg, G.mat("#7A6A78"), ppl, false);
    }
  },

  /* ---- the low city, out to where the desert takes over ---- */
  skyline(G, g, T){
    const night = this.night;
    /* These are instanced, so one box is stretched to every size and the UVs
       cannot follow. They get their own materials with a coarse window grid
       chosen for the average block, rather than the tight one a named tower
       wants, or the whole skyline reads as static. */
    const bmat = (col, rep, gl) => {
      const w2 = PTEX.windowTex("concrete", col).clone();
      w2.needsUpdate = true; w2.wrapS = w2.wrapT = THREE.RepeatWrapping;
      w2.encoding = THREE.sRGBEncoding; w2.repeat.set(rep[0], rep[1]);
      return new THREE.MeshStandardMaterial({
        color:G.col(col), roughness:0.92, metalness:0.02, envMapIntensity:0.4,
        emissiveMap:night ? w2 : null, emissive:new THREE.Color(1, 1, 1),
        emissiveIntensity:night ? gl : 0 });
    };
    const lit = bmat("#5A5464", [1, 1.6], 0.42);
    const lit2 = bmat("#4E5A6C", [1, 2.4], 0.50);
    const A = [], B = [];
    const b = T.bounds;
    const cx = b.minX + b.w / 2, cy = b.minY + b.h / 2;
    for(let k = 0; k < 900; k++){
      const a = this.rnd() * TAU;
      const r = 260 + Math.pow(this.rnd(), 0.6) * 1500;
      const x = cx + Math.cos(a) * r * (b.w / Math.max(b.w, b.h) * 0.6 + 0.7);
      const y = cy + Math.sin(a) * r * (b.h / Math.max(b.w, b.h) * 0.6 + 0.7);
      if(!this.clear(T, x, y, 30) || this.onStreet(x, y, 16)) continue;
      if(!this.takeSpot(x, y, 22)) continue;
      // nearer the circuit the blocks are taller; out in the valley they are not
      const near = 1 - clamp((r - 220) / 1400, 0, 1);
      const h = 9 + Math.pow(this.rnd(), 2.1) * (16 + near * 110);
      const w2 = 14 + this.rnd() * 26, d = 14 + this.rnd() * 26;
      const rot = this.rnd() * 0.6 - 0.3;
      (h > 34 ? B : A).push([x, y, T.z[T.near(x, y)], rot, 1, 1, w2, d, h]);
    }
    for(const [list, mat, bw, bh] of [[A, lit, 20, 20], [B, lit2, 24, 34]]){
      if(!list.length) continue;
      const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
      // the instanced matrix carries the size, so one box serves the lot
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      const d = new THREE.Object3D();
      list.forEach((it, i) => {
        d.position.set(it[0], it[2], it[1]); d.rotation.set(0, it[3], 0);
        d.scale.set(it[6], it[8], it[7]); d.updateMatrix();
        im.setMatrixAt(i, d.matrix);
      });
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = false; im.receiveShadow = false; im.userData.dynamic = true;
      g.add(im);
    }
  },

  /* ---- the ridge line, which is what tells you this is a valley ---- */
  mountains(G, g, T){
    const b = T.bounds, cx = b.minX + b.w / 2, cy = b.minY + b.h / 2;
    const mat = new THREE.MeshBasicMaterial({ color:G.col(this.night ? "#16121F" : "#6E6A78"),
      side:THREE.DoubleSide, fog:false });
    const R2 = 3200;
    for(let ring = 0; ring < 2; ring++){
      const rr = R2 + ring * 600;
      const pos = [], idx = [];
      const N = 96;
      let v = 0;
      for(let i = 0; i < N; i++){
        const a0 = i / N * TAU, a1 = (i + 1) / N * TAU;
        const hgt = (h => 120 + h * 320)(0.5 + 0.5 * Math.sin(a0 * 3.1 + ring * 2) * Math.sin(a0 * 7.3 + ring));
        const h2 = (h => 120 + h * 320)(0.5 + 0.5 * Math.sin(a1 * 3.1 + ring * 2) * Math.sin(a1 * 7.3 + ring));
        const z0 = T.z[0] - 40;
        pos.push(cx + Math.cos(a0) * rr, z0, cy + Math.sin(a0) * rr,
                 cx + Math.cos(a1) * rr, z0, cy + Math.sin(a1) * rr,
                 cx + Math.cos(a1) * rr, z0 + h2, cy + Math.sin(a1) * rr,
                 cx + Math.cos(a0) * rr, z0 + hgt, cy + Math.sin(a0) * rr);
        idx.push(v, v + 1, v + 2, v, v + 2, v + 3); v += 4;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, ring ? mat : new THREE.MeshBasicMaterial({
        color:G.col(this.night ? "#0E0B16" : "#5A5666"), side:THREE.DoubleSide, fog:false }));
      m.userData.dynamic = true; m.frustumCulled = false;
      g.add(m);
    }
  },

  /* ---- what you actually drive past ---- */
  furniture(G, g, T){
    const night = this.night, n = T.n;
    const bol = [], tyre = [], plant = [], marsh = [], tv = [];
    for(let i = 0; i < n; i += 1){
      const u = i / n;
      for(const sd of [-1, 1]){
        const ro = sd < 0 ? T.roL[i] : T.roR[i];
        const o = sd * (T.half + ro + 1.9);
        const x = T.x[i] + T.nx[i] * o, y = T.y[i] + T.ny[i] * o, z = T.z[i];
        // tyre stacks where an escape road ends and at the barrier joints
        if(ro > T.def.runoff + 2.5 && i % 4 === 0)
          tyre.push([x + T.nx[i] * sd * 1.2, y + T.ny[i] * sd * 1.2, z, this.rnd() * TAU, 1]);
        else if(i % 46 === 0) plant.push([x, y, z, -T.ang[i], 1]);
        if(i % 11 === 0) bol.push([x - T.nx[i] * sd * 1.2, y - T.ny[i] * sd * 1.2, z, 0, 1]);
      }
      if(i % 58 === 0){
        const o = (T.half + T.roR[i] + 6);
        marsh.push([T.x[i] + T.nx[i] * o, T.y[i] + T.ny[i] * o, T.z[i], -T.ang[i], 1]);
      }
      if(i % 97 === 0){
        const o = -(T.half + T.roL[i] + 8);
        tv.push([T.x[i] + T.nx[i] * o, T.y[i] + T.ny[i] * o, T.z[i], -T.ang[i], 1]);
      }
    }
    if(tyre.length){
      const tg = new THREE.CylinderGeometry(1.0, 1.0, 2.4, 10); tg.translate(0, 1.2, 0);
      LB.many(G, g, tg, G.mat("#1A1C20", { roughness:0.95 }), tyre, true);
      const tw = new THREE.CylinderGeometry(1.02, 1.02, 0.3, 10); tw.translate(0, 1.3, 0);
      LB.many(G, g, tw, night ? G.glowMat("#F2F2F2", 0.7) : G.mat("#E8E8EA"), tyre, false);
    }
    if(bol.length){
      const bg = new THREE.CylinderGeometry(0.16, 0.2, 1.0, 6); bg.translate(0, 0.5, 0);
      LB.many(G, g, bg, night ? G.glowMat("#E8E24A", 0.5) : G.mat("#C8C24A"), bol, false);
    }
    if(plant.length){
      const pg = new THREE.CylinderGeometry(1.3, 1.1, 1.2, 8); pg.translate(0, 0.6, 0);
      LB.many(G, g, pg, G.mat("#4A4450"), plant, true);
      const sg = new THREE.SphereGeometry(1.5, 7, 5); sg.translate(0, 2.2, 0);
      LB.many(G, g, sg, G.mat("#2E5A3E"), plant, false);
    }
    if(marsh.length){
      const mg = new THREE.BoxGeometry(2.4, 2.6, 2.4); mg.translate(0, 1.3, 0);
      LB.many(G, g, mg, G.mat("#D8DCE0"), marsh, true);
      const rg = new THREE.BoxGeometry(3.0, 0.3, 3.0); rg.translate(0, 2.75, 0);
      LB.many(G, g, rg, G.mat("#D8352A"), marsh, false);
    }
    if(tv.length){
      // the camera towers: a scaffold and a platform
      const sg = new THREE.BoxGeometry(2.6, 7.0, 2.6); sg.translate(0, 3.5, 0);
      LB.many(G, g, sg, G.mat("#4A5058", { metalness:0.6, roughness:0.5 }), tv, true);
      const pg = new THREE.BoxGeometry(4.0, 0.4, 4.0); pg.translate(0, 7.2, 0);
      LB.many(G, g, pg, G.mat("#2E3238"), tv, false);
      const cg = new THREE.BoxGeometry(1.2, 0.8, 0.8); cg.translate(0, 8.0, 0);
      LB.many(G, g, cg, G.mat("#16181C"), tv, false);
    }

    /* hospitality marquees on the outside of the fast corners */
    for(const m of (T.def.marquees || [])){
      const p = this.at(T, m.u, (m.side === "in" ? -1 : 1) * m.off);
      LB.box(G, g, p.x, p.y, p.z, m.l || 44, m.w || 22, 7, p.a, G.mat("#E8E6EC", { roughness:0.9 }));
      for(let k = 0; k < 5; k++){
        const t = (k / 4 - 0.5) * (m.l || 44);
        LB.cone(G, g, p.x + Math.cos(p.a) * t, p.y + Math.sin(p.a) * t, p.z + 7,
          (m.w || 22) * 0.4, 4.5, G.mat("#F4F2F6"), 10);
      }
      if(night) LB.crown(G, g, p.x, p.y, p.z + 6.6, (m.l || 44) + 1, (m.w || 22) + 1, p.a, "#FFD9A0", 0.5);
    }
  },

  /* ---- the hoardings along the concrete ----
     Panels on the track-facing side of the wall, in runs, with the long ones on
     the straights where there is time to read them. */
  adverts(G, g, T){
    const night = this.night, n = T.n;
    const H2 = 1.05, lift = 0.16;
    const byMat = new Map();
    let seed = 7;
    const nextAd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
    for(const sd of [-1, 1]){
      let i = 8;
      while(i < n - 4){
        // how long a run this stretch will take: straights get the long panels
        const straight = Math.abs(T.curv[i]) < 0.0025;
        const nodes = straight ? 3 + Math.floor(nextAd() * 3) : 2;
        const span = nodes * T.ds;
        // leave gaps, and never cover an escape road's TecPro
        const wide = (sd < 0 ? T.roL[i] : T.roR[i]) > T.def.runoff + 2.5;
        if(!wide && nextAd() < (straight ? 0.86 : 0.45)){
          const k = Math.floor(nextAd() * ADS.LIST.length);
          const mat = ADS.mat(k / ADS.LIST.length + 1e-4, night);
          let arr = byMat.get(mat); if(!arr){ arr = []; byMat.set(mat, arr); }
          arr.push([i, nodes, sd]);
        }
        i += nodes + (nextAd() < 0.3 ? 1 : 0);
      }
    }
    // one geometry per advert, carrying every panel that uses it
    for(const [mat, runs] of byMat){
      const pos = [], uv = [], idx = [];
      let v = 0;
      for(const [i0, nodes, sd] of runs){
        for(let k = 0; k < nodes; k++){
          const i = (i0 + k) % n, j = (i + 1) % n;
          const oi = sd * (T.half + (sd < 0 ? T.roL[i] : T.roR[i]) + (T.barrier === "wall" ? 1.0 : 2.6)) - sd * 0.06;
          const oj = sd * (T.half + (sd < 0 ? T.roL[j] : T.roR[j]) + (T.barrier === "wall" ? 1.0 : 2.6)) - sd * 0.06;
          const ax = T.x[i] + T.nx[i] * oi, ay = T.y[i] + T.ny[i] * oi, az = T.z[i];
          const bx = T.x[j] + T.nx[j] * oj, by = T.y[j] + T.ny[j] * oj, bz = T.z[j];
          pos.push(ax, az + lift, ay, bx, bz + lift, by, bx, bz + lift + H2, by, ax, az + lift + H2, ay);
          const u0 = k / nodes, u1 = (k + 1) / nodes;
          // the panel faces the circuit, so which way round u runs depends on the side
          if(sd > 0) uv.push(u1, 0, u0, 0, u0, 1, u1, 1);
          else       uv.push(u0, 0, u1, 0, u1, 1, u0, 1);
          idx.push(v, v + 1, v + 2, v, v + 2, v + 3); v += 4;
        }
      }
      if(!pos.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat);
      m.receiveShadow = true; g.add(m);
    }
  },
};

/* ---------- 10d. Monaco, built from the survey ------------------------------
   The circuit runs on the real OpenStreetMap centreline, so everything else can
   sit where it really is: the ground from SRTM, the harbour and the Rock from the
   coastline, 3,400 buildings on their actual footprints, the piers, the pools,
   the gardens, the streets and the stairs. This builds all of it for the 3D
   renderer; the 2D fallback keeps its stylised Monaco.

   The road still owns its own height. The survey's ground is fitted to it:
   paved to road level under the sidewalks, a stone retaining wall where the
   hill rises behind, a balustrade where it drops away.
   ------------------------------------------------------------------------- */
const MONACO = {
  CELL:20,

  /* ---- where is the circuit from here? ---- */
  index(T){
    this.T = T;
    const C = this.CELL, map = new Map();
    for(let i = 0; i < T.n; i++){
      const k = Math.floor(T.x[i] / C) + "," + Math.floor(T.y[i] / C);
      let a = map.get(k); if(!a){ a = []; map.set(k, a); } a.push(i);
    }
    this.cells = map;
  },
  // nearest point on the centreline, with the side and the road height there
  near(x, y, maxR, skip){
    const T = this.T, C = this.CELL, cx = Math.floor(x / C), cy = Math.floor(y / C);
    const R = Math.ceil((maxR || 140) / C);
    let best = -1, bd = Infinity;
    for(let r = 0; r <= R; r++){
      for(let dx = -r; dx <= r; dx++) for(let dy = -r; dy <= r; dy++){
        if(Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const a = this.cells.get((cx + dx) + "," + (cy + dy));
        if(!a) continue;
        for(const i of a){
          // skip: leave out the stretch of road around this node, to find the next carriageway over
          if(skip != null){ const dd = Math.abs(i - skip); if(Math.min(dd, T.n - dd) < 6) continue; }
          const d = (T.x[i] - x) ** 2 + (T.y[i] - y) ** 2; if(d < bd){ bd = d; best = i; } }
      }
      if(best >= 0 && Math.sqrt(bd) < (r - 0.5) * C) break;
    }
    if(best < 0) return null;
    // refine onto the segment either side, so distance and height are smooth
    const n = T.n; let res = null;
    for(const j of [(best - 1 + n) % n, best]){
      const k = (j + 1) % n;
      const ax = T.x[j], ay = T.y[j], dx = T.x[k] - ax, dy = T.y[k] - ay, l2 = dx * dx + dy * dy || 1;
      const t = clamp(((x - ax) * dx + (y - ay) * dy) / l2, 0, 1);
      const px = ax + dx * t, py = ay + dy * t, d = Math.hypot(x - px, y - py);
      if(!res || d < res.d){
        const l = Math.sqrt(l2), side = ((x - px) * -dy + (y - py) * dx) / l;
        res = { i:t < 0.5 ? j : k, d, side:side >= 0 ? 1 : -1, z:T.z[j] + (T.z[k] - T.z[j]) * t };
      }
    }
    return res;
  },
  /* Push a footprint's corners back until they are a couple of metres beyond the
     barrier line, so no building, however important, stands on the track. */
  clear(P, gap){
    const T = this.T;
    return P.map(([x0, y0]) => {
      let x = x0, y = y0;
      for(let pass = 0; pass < 3; pass++){
        const q = this.near(x, y, 60); if(!q) break;
        const need = T.half + (q.side < 0 ? T.roL[q.i] : T.roR[q.i]) + gap;
        if(q.d >= need) break;
        // away from the nearest bit of road, not from the node
        const k = (q.i + 1) % T.n, dx = T.x[k] - T.x[q.i], dy = T.y[k] - T.y[q.i], l = Math.hypot(dx, dy) || 1;
        const nx = -dy / l * q.side, ny = dx / l * q.side, push = need - q.d + 0.05;
        x += nx * push; y += ny * push;
      }
      return [x, y];
    });
  },
  /* Anything that stands between the overhead camera and the hairpin or the last
     two turns is left out, so those corners can be seen. The camera looks down a
     fixed line (from the south-east, 35 degrees up), so for each bit of road in
     those stretches take the points along that line and note how high the line
     is there; a building whose roof is above the line at a point inside its
     footprint is in the way. */
  viewSamples(){
    const T = this.T, n = T.n, S = new Map(), d = Math.SQRT1_2, slope = Math.tan(35.264 * Math.PI / 180);
    for(const [a, b] of [[0.335, 0.395], [0.825, 0.935]]){
      for(let i = Math.round(a * n); i <= Math.round(b * n); i++){
        for(const o of [-T.half * 0.7, 0, T.half * 0.7]){
          const x = T.x[i] + T.nx[i] * o, y = T.y[i] + T.ny[i] * o, z = T.z[i] + 0.6;
          for(let t = 2; t <= 170; t += 3){
            const px = x + d * t, py = y + d * t, k = Math.floor(px / 8) + "," + Math.floor(py / 8);
            let l = S.get(k); if(!l){ l = []; S.set(k, l); } l.push(px, py, z + slope * t);
          }
        }
      }
    }
    return (this._view = S);
  },
  hidesRoad(P, top){
    const S = this._view || this.viewSamples();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for(const [x, y] of P){ x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    for(let cx = Math.floor(x0 / 8); cx <= Math.floor(x1 / 8); cx++) for(let cy = Math.floor(y0 / 8); cy <= Math.floor(y1 / 8); cy++){
      const l = S.get(cx + "," + cy); if(!l) continue;
      for(let k = 0; k < l.length; k += 3){
        if(l[k + 2] - 26 >= top) continue;       // 26 m of slack: the buildings crowding the foreground too
        // inside the footprint?
        const x = l[k], y = l[k + 1]; let inside = false;
        for(let i = 0, j = P.length - 1; i < P.length; j = i++){
          const a = P[i], b = P[j];
          if((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
        }
        if(inside) return true;
      }
    }
    return false;
  },
  // how far the paving runs from the centreline before the town starts
  rin(i, side){ const T = this.T; return T.half + (side < 0 ? T.roL[i] : T.roR[i]) + 5.0; },

  /* ---- the ground ---- */
  // what the survey says, before the circuit is cut in
  raw(x, y){
    const M = this.M;
    if(!M.land(x, y)) return -7;
    // the waterfront is quays and sea walls: nothing slopes into the harbour
    return Math.max(M.dem(x, y) * this.zS, 2.4);
  },
  // and with the circuit cut in
  ground(x, y, pad){
    pad = pad || 0;                // the terrain mesh asks for a margin of one grid step, so no slope starts inside the road
    const q = this.near(x, y, 90);
    if(!q) return this.raw(x, y);
    const T = this.T;
    if(T.inTunnel(q.i) && q.d < T.half + 11) return q.z - 0.25;    // the tunnel's floor, under its roof
    const rin = this.rin(q.i, q.side) + pad;
    // Where the road doubles back (the hairpin, Beau Rivage over the harbour road),
    // a second carriageway may be close too. The ground follows the lowest road
    // whose margin covers the point: following the higher one would raise the
    // hillside straight through the road below.
    let q2 = null;
    if(q.d < 44){
      q2 = this.near(x, y, 52, q.i);
      if(q2 && (T.inTunnel(q2.i) || q2.d >= this.rin(q2.i, q2.side) + 7 + pad)) q2 = null;
    }
    const h = this.raw(x, y);
    const cs = q2 ? [q, q2] : [q];
    let out = Infinity;
    for(const c of cs) if(c.d < (c === q ? rin : this.rin(c.i, c.side) + pad)) out = Math.min(out, c.z - 0.25);
    if(out < Infinity) return out;
    // uphill, keep a terrace at road level for a few metres behind the wall so
    // the step lands behind it rather than as a ramp across the pavement
    for(const c of cs) if(h > c.z && c.d < (c === q ? rin : this.rin(c.i, c.side) + pad) + 7) out = Math.min(out, c.z - 0.25);
    return out < Infinity ? out : h;
  },

  build(G, world, T, S){
    const t0 = performance.now();
    this.G = G; this.T = T; this.S = S; this.night = T.night;
    this.zS = T.def.zScale || 1;
    this.M = MGEO.init(T.worldScale || 1);
    this.detail = CFG.detail !== 0;
    this.index(T);
    this.anim = [];
    this.fade = [];
    const g = new THREE.Group(); world.add(g);
    this.root = g;
    const steps = [["terrain", this.terrain], ["edges", this.edges], ["water", this.water], ["quays", this.quays],
                   ["greens", this.greens], ["streets", this.streets], ["buildings", this.buildings],
                   ["landmarks", this.landmarks], ["harbour", this.harbour], ["tunnel", this.tunnel],
                   ["dressing", this.dressing]];
    this.timing = {};
    for(const [name, fn] of steps){
      const a = performance.now();
      try{ fn.call(this, G, g, T, S); }catch(e){ console.warn("monaco " + name, e.message, e.stack); }
      this.timing[name] = +(performance.now() - a).toFixed(0);
    }
    // everything static and loose — grandstand rows, landmark parts, gantries,
    // signs — merges by material and by 260 m cell, like the rest of the scenery
    world.remove(g);
    const baked = G.bake(g, 260);
    world.add(baked); this.root = baked;
    this.timing.total = +(performance.now() - t0).toFixed(0);
    return baked;
  },

  /* ---- terrain: a fine grid over the town, a coarse one out to the Alps ---- */
  terrain(G, g, T){
    const M = this.M, sc = M.sc;
    const step = this.detail ? 8 : 12;
    const X0 = -1100 * sc, X1 = 1300 * sc, Y0 = -1450 * sc, Y1 = 1050 * sc;
    const nx = Math.ceil((X1 - X0) / step) + 1, ny = Math.ceil((Y1 - Y0) / step) + 1;
    const H = new Float32Array(nx * ny), Lm = new Uint8Array(nx * ny);
    for(let r = 0; r < ny; r++) for(let c = 0; c < nx; c++){
      const x = X0 + c * step, y = Y0 + r * step, k = r * nx + c;
      H[k] = this.ground(x, y, step * 0.75); Lm[k] = M.land(x, y) ? 1 : 0;
    }
    this.gridH = { H, nx, ny, X0, Y0, step };
    // colour by what the ground is: paving in town, green in the gardens, grey
    // rock on the cliffs, and a darker band where the hill is steep
    const pos = [], col = [], idx = [];
    const vid = new Int32Array(nx * ny).fill(-1);
    const cPave = G.col("#D8CFBE"), cHill = G.col("#B8AA90"), cRock = G.col("#9E9282"), cScrub = G.col("#7E8A5A");
    const tmp = new THREE.Color();
    const addV = (r, c) => {
      const k = r * nx + c;
      if(vid[k] >= 0) return vid[k];
      const x = X0 + c * step, y = Y0 + r * step, h = H[k];
      pos.push(x, h, y);
      // slope from the neighbours
      const hx = H[r * nx + Math.min(nx - 1, c + 1)] - H[r * nx + Math.max(0, c - 1)];
      const hy = H[Math.min(ny - 1, r + 1) * nx + c] - H[Math.max(0, r - 1) * nx + c];
      const slope = Math.hypot(hx, hy) / (2 * step);
      tmp.copy(cPave);
      if(h > 70 * this.zS) tmp.lerp(cScrub, clamp((h - 70) / 60, 0, 0.75));
      if(slope > 0.45) tmp.lerp(cRock, clamp((slope - 0.45) / 0.6, 0, 1));
      else if(slope > 0.18) tmp.lerp(cHill, clamp((slope - 0.18) / 0.3, 0, 1));
      col.push(tmp.r, tmp.g, tmp.b);
      return (vid[k] = pos.length / 3 - 1);
    };
    const CH = Math.round(200 / step), chunkIdx = new Map();
    for(let r = 0; r < ny - 1; r++) for(let c = 0; c < nx - 1; c++){
      const k = r * nx + c;
      // under water all round: the sea floor is never seen
      if(!Lm[k] && !Lm[k + 1] && !Lm[k + nx] && !Lm[k + nx + 1]) continue;
      const a = addV(r, c), b = addV(r, c + 1), d = addV(r + 1, c), e = addV(r + 1, c + 1);
      const ck = Math.floor(r / CH) * 1000 + Math.floor(c / CH);
      let arr = chunkIdx.get(ck); if(!arr){ arr = []; chunkIdx.set(ck, arr); }
      arr.push(a, d, b, b, d, e);
      idx.push(a, d, b, b, d, e);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    const tex = PTEX.paving();
    const mat = new THREE.MeshStandardMaterial({ vertexColors:true, roughness:0.93, metalness:0,
      map:tex, envMapIntensity:0.6 });
    // world-space UVs so the paving tiles at its real size
    const uv = new Float32Array(pos.length / 3 * 2);
    for(let i = 0; i < pos.length / 3; i++){ uv[i * 2] = pos[i * 3] / 6; uv[i * 2 + 1] = pos[i * 3 + 2] / 6; }
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    // one mesh per chunk, all drawing from the same vertex buffers
    this.terrainGeo = geo;
    for(const arr of chunkIdx.values()){
      const cg2 = new THREE.BufferGeometry();
      for(const nm of ["position", "normal", "color", "uv"]) cg2.setAttribute(nm, geo.attributes[nm]);
      cg2.setIndex(arr); cg2.computeBoundingSphere();
      const m = new THREE.Mesh(cg2, mat);
      m.receiveShadow = true; m.castShadow = true; m.userData.dynamic = true;
      g.add(m);
    }
    this.terrainTris = idx.length / 3;

    /* the country beyond: the coarse grid out to Mont Agel and Tête de Chien.
       No shadows, and the haze takes most of it. */
    const cg = M.ter.coarse, N = cg.N, Mm = cg.M, cpos = [], cidx = [], ccol = [];
    const cFar = G.col("#8C9278"), cFarHigh = G.col("#A8A48E");
    for(let r = 0; r < N; r++) for(let c = 0; c < Mm; c++){
      const x = (cg.x0 + (cg.x1 - cg.x0) * c / (Mm - 1)) * sc, y = (cg.y0 + (cg.y1 - cg.y0) * r / (N - 1)) * sc;
      let h = cg.h[r * Mm + c] * this.zS;
      // inside the fine grid, sink it out of the way
      const inside = x > X0 + 60 && x < X1 - 60 && y > Y0 + 60 && y < Y1 - 60;
      if(inside) h = Math.min(h, -20);
      else if(h < 1) h = -8;
      cpos.push(x, h, y);
      tmp.copy(cFar).lerp(cFarHigh, clamp(h / 900, 0, 1));
      ccol.push(tmp.r, tmp.g, tmp.b);
    }
    for(let r = 0; r < N - 1; r++) for(let c = 0; c < Mm - 1; c++){
      const k = r * Mm + c;
      cidx.push(k, k + Mm, k + 1, k + 1, k + Mm, k + Mm + 1);
    }
    const cgeo = new THREE.BufferGeometry();
    cgeo.setAttribute("position", new THREE.Float32BufferAttribute(cpos, 3));
    cgeo.setAttribute("color", new THREE.Float32BufferAttribute(ccol, 3));
    cgeo.setIndex(cidx); cgeo.computeVertexNormals();
    const cm = new THREE.Mesh(cgeo, new THREE.MeshStandardMaterial({ vertexColors:true, roughness:1, metalness:0 }));
    cm.userData.dynamic = true; cm.frustumCulled = false; g.add(cm);
  },

  /* ---- where the circuit meets the ground: pavements, walls, balustrades ---- */
  edges(G, g, T){
    const n = T.n, w = T.half;
    const pave = G.mat("#CFC6B4", { roughness:0.92 }), kerbStone = G.mat("#B8B0A0", { roughness:0.9 });
    const stone = G.faceMat("stone", "#C9B99C", false, { roughness:0.9 });
    const rail = G.mat("#EDEAE2", { roughness:0.6 });
    const posts = [];
    for(const sd of [-1, 1]){
      const rf = i => (sd < 0 ? T.roL[i] : T.roR[i]);
      const inner = i => sd * (w + rf(i) + 1.4), outer = i => sd * this.rin(i, sd);
      // the pavement, a kerb's height above the road
      G.add(g, G.strip(T, inner, outer, 0.14, 4, i => !T.inTunnel(i)), pave);
      // what the ground does just behind it
      const back = new Float64Array(n), has = new Uint8Array(n);
      for(let i = 0; i < n; i++){
        if(T.inTunnel(i)) continue;
        const o = this.rin(i, sd) + 3;
        const x = T.x[i] + T.nx[i] * sd * o, y = T.y[i] + T.ny[i] * sd * o;
        // another part of the lap is closer there: leave that to its own edge
        const q = this.near(x, y, 40);
        if(q && Math.min(Math.abs(q.i - i), n - Math.abs(q.i - i)) > 6) continue;
        back[i] = this.raw(x, y); has[i] = 1;
      }
      // smooth along the lap so the wall tops run level, not in steps
      const bs = new Float64Array(back);
      for(let p = 0; p < 3; p++) for(let i = 0; i < n; i++){
        if(!has[i]) continue;
        const a = has[(i - 1 + n) % n] ? bs[(i - 1 + n) % n] : bs[i], b = has[(i + 1) % n] ? bs[(i + 1) % n] : bs[i];
        bs[i] = (a + 2 * bs[i] + b) / 4;
      }
      const up = i => has[i] && bs[i] - T.z[i] > 1.2;
      const down = i => has[i] && T.z[i] - bs[i] > 1.2;
      // retaining walls where the hill rises behind the pavement, per node
      const wallGeo = (filter, top, bot) => {
        const pos = [], uv = [], idx = []; let v = 0;
        for(let i = 0; i < n; i++){
          const j = (i + 1) % n;
          if(!filter(i) || !filter(j)) continue;
          const oa = outer(i), ob = outer(j);
          const ax = T.x[i] + T.nx[i] * oa, ay = T.y[i] + T.ny[i] * oa, bx = T.x[j] + T.nx[j] * ob, by = T.y[j] + T.ny[j] * ob;
          pos.push(ax, bot(i), ay, bx, bot(j), by, bx, top(j), by, ax, top(i), ay);
          const u0 = i * T.ds / 3, u1 = (i + 1) * T.ds / 3;
          uv.push(u0, bot(i) / 3, u1, bot(j) / 3, u1, top(j) / 3, u0, top(i) / 3);
          idx.push(v, v + 1, v + 2, v, v + 2, v + 3); v += 4;
        }
        if(!pos.length) return null;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
        geo.setIndex(idx); geo.computeVertexNormals();
        return geo;
      };
      // No stone retaining walls: they read as huge brown curtains. The terrain
      // already holds a shoulder at road level and slopes away from it, so the
      // hill rises or falls from the pavement edge. Where it falls away, a
      // balustrade goes on top.
      const gb = wallGeo(down, i => T.z[i] + 1.05, i => T.z[i] + 0.95);
      if(gb){ const m = new THREE.Mesh(gb, G.twoSided(rail)); g.add(m); }
      for(let i = 0; i < n; i++) if(down(i)){
        const o = outer(i);
        for(const f of [0, 0.5]){
          const j = (i + 1) % n, x = T.x[i] + (T.x[j] - T.x[i]) * f + T.nx[i] * o, y = T.y[i] + (T.y[j] - T.y[i]) * f + T.ny[i] * o;
          posts.push([x, y, T.z[i] + 0.14, 0, 1]);
        }
      }
    }
    if(posts.length){
      // balusters: little turned posts, instanced
      const pts = [new THREE.Vector2(0.10, 0), new THREE.Vector2(0.13, 0.12), new THREE.Vector2(0.07, 0.35),
                   new THREE.Vector2(0.12, 0.6), new THREE.Vector2(0.07, 0.8), new THREE.Vector2(0.10, 0.85)];
      const bg = new THREE.LatheGeometry(pts, 6);
      LB.many(G, g, bg, G.mat("#EDEAE2", { roughness:0.6 }), posts, false);
    }
  },

  /* ---- the sea ----
     One tuned standard material rather than a bespoke shader, so it takes the
     environment map, the sun, fog and shadows like everything else. Two ripple
     layers scroll against each other through a patched normal-map line; the
     colour runs turquoise at the quays to deep Mediterranean blue offshore. */
  water(G, g, T){
    const M = this.M, sc = M.sc;
    // distance to land, on a coarse raster, for the colour
    const S = 12, X0 = -1500 * sc, Y0 = -1520 * sc, W = Math.ceil(3000 * sc / S), H = Math.ceil(2820 * sc / S);
    const dist = new Float32Array(W * H).fill(1e9);
    const q = [];
    for(let r = 0; r < H; r++) for(let c = 0; c < W; c++){
      if(M.land(X0 + (c + 0.5) * S, Y0 + (r + 0.5) * S)){ dist[r * W + c] = 0; q.push(r * W + c); }
    }
    // a cheap two-pass chamfer distance
    const pass = (dir) => {
      const r0 = dir > 0 ? 0 : H - 1, c0 = dir > 0 ? 0 : W - 1;
      for(let r = r0; r >= 0 && r < H; r += dir) for(let c = c0; c >= 0 && c < W; c += dir){
        const k = r * W + c; let d = dist[k];
        const pr = r - dir, pc = c - dir;
        if(pr >= 0 && pr < H) d = Math.min(d, dist[pr * W + c] + S);
        if(pc >= 0 && pc < W) d = Math.min(d, dist[r * W + pc] + S);
        if(pr >= 0 && pr < H && pc >= 0 && pc < W) d = Math.min(d, dist[pr * W + pc] + S * 1.414);
        dist[k] = d;
      }
    };
    pass(1); pass(-1);
    this.seaDist = { dist, W, H, X0, Y0, S };

    const cNear = G.col("#3FC4C8"), cMid = G.col("#1E8FB4"), cDeep = G.col("#0B4A86"), tmp = new THREE.Color();
    const gx = 160, gy = 150;
    const geo = new THREE.PlaneGeometry(W * S, H * S, gx, gy);
    geo.rotateX(-Math.PI / 2);
    geo.translate(X0 + W * S / 2, 0, Y0 + H * S / 2);
    const p = geo.attributes.position, colr = new Float32Array(p.count * 3);
    for(let i = 0; i < p.count; i++){
      const x = p.getX(i), y = p.getZ(i);
      const c = clamp(Math.floor((x - X0) / S), 0, W - 1), r = clamp(Math.floor((y - Y0) / S), 0, H - 1);
      const d = dist[r * W + c];
      tmp.copy(cNear).lerp(cMid, clamp(d / 70, 0, 1)).lerp(cDeep, clamp((d - 70) / 260, 0, 1));
      colr[i * 3] = tmp.r; colr[i * 3 + 1] = tmp.g; colr[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colr, 3));
    const nrm = PTEX.ripples();
    const mat = new THREE.MeshStandardMaterial({ vertexColors:true, color:0xffffff, roughness:0.10, metalness:0.0,
      normalMap:nrm, normalScale:new THREE.Vector2(0.55, 0.55), envMapIntensity:1.35, transparent:false });
    mat.onBeforeCompile = sh => {
      sh.uniforms.uW1 = { value:new THREE.Vector2() };
      sh.uniforms.uW2 = { value:new THREE.Vector2() };
      this.waterU = sh.uniforms;
      sh.fragmentShader = "uniform vec2 uW1;\nuniform vec2 uW2;\n" + sh.fragmentShader.replace("#include <normal_fragment_maps>",
        THREE.ShaderChunk.normal_fragment_maps.replace("vec3 mapN = texture2D( normalMap, vUv ).xyz * 2.0 - 1.0;",
          "vec3 mapN = normalize((texture2D( normalMap, vUv + uW1 ).xyz * 2.0 - 1.0) + (texture2D( normalMap, vUv * 0.61 + uW2 ).xyz * 2.0 - 1.0) + vec3(0.0, 0.0, 0.6));"));
    };
    mat.customProgramCacheKey = () => "monacoWater";
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true; m.userData.dynamic = true;
    g.add(m);
    // world-space ripple scale
    const uv = geo.attributes.uv;
    for(let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 34, p.getZ(i) / 34);
    uv.needsUpdate = true;
    // and the open sea beyond, deep blue, out to the horizon
    const far = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000, 1, 1),
      new THREE.MeshStandardMaterial({ color:cDeep, roughness:0.18, metalness:0, envMapIntensity:1.0 }));
    far.rotation.x = -Math.PI / 2; far.position.set(0, -0.35, 6000); far.userData.dynamic = true; far.frustumCulled = false;
    g.add(far);
    this.anim.push(t => {
      if(!this.waterU) return;
      this.waterU.uW1.value.set(t * 0.011, t * 0.017);
      this.waterU.uW2.value.set(-t * 0.014, t * 0.006);
    });
  },

  /* ---- quays, piers, pontoons and the Digue ---- */
  quays(G, g, T){
    const M = this.M;
    const stone = G.faceMat("stone", "#CBBFA6", false, { roughness:0.9 });
    const concrete = G.mat("#D6D2C8", { roughness:0.88 });
    const deck = G.mat("#9C8466", { roughness:0.85 });
    const foamPos = [], foamIdx = []; let fv = 0;
    const foam = (ax, ay, bx, by, sd) => {
      // a pale line on the water hugging the wall; which side is water is sd
      const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1, nx = -dy / l * sd, ny = dx / l * sd;
      foamPos.push(ax, 0.04, ay, bx, 0.04, by, bx + nx * 1.6, 0.04, by + ny * 1.6, ax + nx * 1.6, 0.04, ay + ny * 1.6);
      foamIdx.push(fv, fv + 1, fv + 2, fv, fv + 2, fv + 3); fv += 4;
    };
    // sea walls along the whole coast: from below the water to the quay top
    const wp = [], wi = [], wu = []; let v = 0;
    for(const ln of (M.line.coast || [])){
      for(let k = 0; k < ln.length - 1; k++){
        const [ax, ay] = ln[k], [bx, by] = ln[k + 1];
        const L = Math.hypot(bx - ax, by - ay); if(L < 0.2) continue;
        // which side is land? probe a couple of metres across
        const nx = -(by - ay) / L, ny = (bx - ax) / L;
        const mx = (ax + bx) / 2, my = (ay + by) / 2;
        const landSide = M.land(mx + nx * 3, my + ny * 3) ? 1 : -1;
        const topA = Math.max(2.4, this.raw(ax + nx * landSide * 4, ay + ny * landSide * 4));
        const topB = Math.max(2.4, this.raw(bx + nx * landSide * 4, by + ny * landSide * 4));
        const ta = Math.min(topA, 2.4 + 60), tb = Math.min(topB, 2.4 + 60);
        wp.push(ax, -3, ay, bx, -3, by, bx, tb, by, ax, ta, ay);
        wu.push(0, -1, L / 3, -1, L / 3, tb / 3, 0, ta / 3);
        wi.push(v, v + 1, v + 2, v, v + 2, v + 3); v += 4;
        foam(ax, ay, bx, by, -landSide);
      }
    }
    if(wp.length){
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(wp, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(wu, 2));
      geo.setIndex(wi); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, G.twoSided(stone)); m.receiveShadow = true; m.userData.dynamic = true; g.add(m);
    }
    // the quay top: a paved band inland of the wall, at the wall's own height,
    // laid over the terrain grid's ragged edge. It stops short of the circuit.
    { const qp = [], qi = [], qu = []; let qv = 0;
      for(const ln of (M.line.coast || [])){
        for(let k = 0; k < ln.length - 1; k++){
          const [ax, ay] = ln[k], [bx, by] = ln[k + 1];
          const L = Math.hypot(bx - ax, by - ay); if(L < 0.2) continue;
          const nx = -(by - ay) / L, ny = (bx - ax) / L;
          const landSide = M.land((ax + bx) / 2 + nx * 3, (ay + by) / 2 + ny * 3) ? 1 : -1;
          const ix = nx * landSide * 9, iy = ny * landSide * 9;
          const pts = [[ax, ay], [bx, by], [bx + ix, by + iy], [ax + ix, ay + iy]];
          let ok = true, top = Infinity;
          for(const [x, y] of pts){
            const q = this.near(x, y, 30);
            if(q && q.d < this.rin(q.i, q.side) + 1){ ok = false; break; }
            top = Math.min(top, Math.max(2.4, this.raw(x, y)));
          }
          if(!ok || top > 12) continue;          // cliffs are the cliff pass's business
          for(const [x, y] of pts){ qp.push(x, top + 0.04, y); qu.push(x / 6, y / 6); }
          if(landSide > 0) qi.push(qv, qv + 3, qv + 1, qv + 1, qv + 3, qv + 2);
          else qi.push(qv, qv + 1, qv + 3, qv + 1, qv + 2, qv + 3);
          qv += 4;
        }
      }
      if(qp.length){
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(qp, 3));
        geo.setAttribute("uv", new THREE.Float32BufferAttribute(qu, 2));
        geo.setIndex(qi); geo.computeVertexNormals();
        const mat = new THREE.MeshStandardMaterial({ map:PTEX.paving(), color:G.col("#E4DCCB"), roughness:0.92, side:THREE.DoubleSide,
          polygonOffset:true, polygonOffsetFactor:-1, polygonOffsetUnits:-1 });
        const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; m.userData.dynamic = true; g.add(m);
      }
    }
    // piers: concrete jetties stand proud, narrow pontoons float low
    const piers = (M.poly.pier || []);
    this.piers = [];
    const bollards = [];
    for(const ring of piers){
      if(ring.length < 3) continue;
      let A = 0, P = 0;
      for(let k = 0; k < ring.length; k++){
        const a = ring[k], b = ring[(k + 1) % ring.length];
        A += a[0] * b[1] - b[0] * a[1]; P += Math.hypot(b[0] - a[0], b[1] - a[1]);
      }
      A = Math.abs(A) / 2;
      const width = A / (P / 2);
      const pontoon = width < 5.5;
      const top = pontoon ? 0.7 : 2.3;
      const shape = new THREE.Shape(ring.map(([x, y]) => new THREE.Vector2(x, y)));
      const geo = new THREE.ExtrudeGeometry(shape, { depth:top + 3, bevelEnabled:false });
      geo.rotateX(Math.PI / 2); geo.translate(0, top, 0);
      // ExtrudeGeometry builds along +z; rotating +90 about x sends y to z, so the
      // shape keeps its game-space x/y as world x/z
      const m = new THREE.Mesh(geo, [pontoon ? deck : concrete, G.twoSided(stone)]);
      m.receiveShadow = true; m.castShadow = !pontoon; m.userData.dynamic = true;
      g.add(m);
      this.piers.push({ ring, top, pontoon, width, area:A });
      for(let k = 0; k < ring.length; k++){
        const a = ring[k], b = ring[(k + 1) % ring.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        foam(a[0], a[1], b[0], b[1], 1); foam(a[0], a[1], b[0], b[1], -1);
        if(!pontoon) for(let s = 3; s < L - 2; s += 9) bollards.push([a[0] + (b[0] - a[0]) * s / L, a[1] + (b[1] - a[1]) * s / L, top, 0, 1]);
      }
    }
    if(bollards.length){
      const bg = new THREE.CylinderGeometry(0.22, 0.28, 0.7, 8); bg.translate(0, 0.35, 0);
      LB.many(G, g, bg, G.mat("#2A2C30", { roughness:0.5, metalness:0.5 }), bollards, false);
    }
    // the lighthouse on the end of the Digue: the pier furthest out to sea
    let best = null;
    for(const p of this.piers){
      for(const [x, y] of p.ring){
        const d = this.seaDistAt(x, y);
        if(!best || d > best.d) best = { d, x, y, top:p.top };
      }
    }
    if(best){
      this.lighthouse = best;
      const lh = new THREE.Group();
      LB.cyl(G, lh, best.x, best.y, best.top, 2.4, 1.9, 13, G.mat("#F2F0EA", { roughness:0.6 }), 16);
      LB.cyl(G, lh, best.x, best.y, best.top + 13, 2.2, 2.2, 1.4, G.mat("#C8302A"), 16);
      LB.cyl(G, lh, best.x, best.y, best.top + 14.4, 1.3, 1.3, 2.2, G.glowMat("#FFE8B0", 1.2), 12);
      LB.cone(G, lh, best.x, best.y, best.top + 16.6, 1.8, 2.2, G.mat("#C8302A"), 12);
      lh.traverse(o => { if(o.isMesh) o.userData.dynamic = true; });
      g.add(lh);
    }
    if(foamPos.length){
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(foamPos, 3));
      const u = []; for(let k = 0; k < foamPos.length / 12; k++) u.push(0, 0, 1, 0, 1, 1, 0, 1);
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(u, 2));
      geo.setIndex(foamIdx);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map:PTEX.foam(), transparent:true, opacity:0.55,
        depthWrite:false, color:0xffffff, side:THREE.DoubleSide }));
      m.userData.dynamic = true; m.renderOrder = 2; g.add(m);
    }
  },
  seaDistAt(x, y){
    const s = this.seaDist; if(!s) return 0;
    const c = clamp(Math.floor((x - s.X0) / s.S), 0, s.W - 1), r = clamp(Math.floor((y - s.Y0) / s.S), 0, s.H - 1);
    return s.dist[r * s.W + c];
  },

  /* ---- scanline-fill a set of polygons onto a grid: cheap point-in-polygon for
     tens of thousands of lookups ---- */
  raster(rings, X0, Y0, step, nx, ny, out, val){
    for(const ring of rings){
      let y0 = Infinity, y1 = -Infinity;
      for(const [, y] of ring){ y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      const r0 = Math.max(0, Math.floor((y0 - Y0) / step)), r1 = Math.min(ny - 1, Math.ceil((y1 - Y0) / step));
      for(let r = r0; r <= r1; r++){
        const y = Y0 + r * step, xs = [];
        for(let k = 0; k < ring.length; k++){
          const a = ring[k], b = ring[(k + 1) % ring.length];
          if((a[1] <= y) !== (b[1] <= y)) xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
        }
        xs.sort((p, q) => p - q);
        for(let k = 0; k + 1 < xs.length; k += 2){
          const c0 = Math.max(0, Math.ceil((xs[k] - X0) / step)), c1 = Math.min(nx - 1, Math.floor((xs[k + 1] - X0) / step));
          for(let c = c0; c <= c1; c++) out[r * nx + c] = val;
        }
      }
    }
  },

  /* ---- gardens, woods, the Rock's cliffs, pools and trees ---- */
  greens(G, g, T){
    const M = this.M, GH = this.gridH;
    // recolour the terrain under the green spaces rather than laying patches on
    // it: the ground follows the hill exactly, and it costs nothing
    const cls = new Uint8Array(GH.nx * GH.ny);
    this.raster(M.poly.green || [], GH.X0, GH.Y0, GH.step, GH.nx, GH.ny, cls, 1);
    this.raster(M.poly.pitch || [], GH.X0, GH.Y0, GH.step, GH.nx, GH.ny, cls, 1);
    this.raster(M.poly.wood || [], GH.X0, GH.Y0, GH.step, GH.nx, GH.ny, cls, 2);
    this.raster(M.poly.rock || [], GH.X0, GH.Y0, GH.step, GH.nx, GH.ny, cls, 3);
    this.raster(M.poly.beach || [], GH.X0, GH.Y0, GH.step, GH.nx, GH.ny, cls, 4);
    this.greenCls = cls;
    const terr = this.terrainGeo ? { geometry:this.terrainGeo } : null;
    if(terr){
      const p = terr.geometry.attributes.position, c = terr.geometry.attributes.color;
      const COLS = [null, G.col("#7E9A58"), G.col("#5E7A44"), G.col("#A09684"), G.col("#E4D6B4")];
      for(let i = 0; i < p.count; i++){
        const cc = Math.round((p.getX(i) - GH.X0) / GH.step), rr = Math.round((p.getZ(i) - GH.Y0) / GH.step);
        const k = cls[clamp(rr, 0, GH.ny - 1) * GH.nx + clamp(cc, 0, GH.nx - 1)];
        if(k) c.setXYZ(i, COLS[k].r, COLS[k].g, COLS[k].b);
      }
      c.needsUpdate = true;
    }
    // the Rock's cliffs: bare limestone faces from the sea up to the top
    const cliff = G.faceMat("stone", "#BCAE94", false, { roughness:0.95 });
    const cp = [], ci = [], cu = []; let v = 0;
    for(const ln of (M.line.cliff || [])){
      for(let k = 0; k < ln.length - 1; k++){
        const [ax, ay] = ln[k], [bx, by] = ln[k + 1];
        const L = Math.hypot(bx - ax, by - ay); if(L < 0.5) continue;
        // OSM draws cliffs with the drop on the right: top on the left
        const nx = -(by - ay) / L, ny = (bx - ax) / L;
        const top = h => Math.max(h, 3);
        const ta = top(this.raw(ax - nx * 4, ay - ny * 4)), tb = top(this.raw(bx - nx * 4, by - ny * 4));
        const ba = Math.min(ta - 3, this.raw(ax + nx * 6, ay + ny * 6)), bb = Math.min(tb - 3, this.raw(bx + nx * 6, by + ny * 6));
        cp.push(ax, ba, ay, bx, bb, by, bx, tb, by, ax, ta, ay);
        cu.push(0, ba / 4, L / 4, bb / 4, L / 4, tb / 4, 0, ta / 4);
        ci.push(v, v + 1, v + 2, v, v + 2, v + 3); v += 4;
      }
    }
    if(cp.length){
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(cp, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(cu, 2));
      geo.setIndex(ci); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, G.twoSided(cliff)); m.castShadow = true; m.receiveShadow = true;
      m.userData.dynamic = true; g.add(m);
    }
    // swimming pools, the bright blue of every hotel terrace in town
    const poolMat = new THREE.MeshStandardMaterial({ color:G.col("#2FB8E0"), roughness:0.08, metalness:0,
      emissive:G.col("#0E6A8A"), emissiveIntensity:0.35, envMapIntensity:1.2 });
    const coping = G.mat("#F0ECE2", { roughness:0.8 });
    for(const ring of (M.poly.pool || [])){
      if(ring.length < 3) continue;
      let cx = 0, cy = 0; for(const [x, y] of ring){ cx += x; cy += y; } cx /= ring.length; cy /= ring.length;
      const q = this.near(cx, cy, 20); if(q && q.d < this.rin(q.i, q.side)) continue;
      let z = -Infinity; for(const [x, y] of ring) z = Math.max(z, this.ground(x, y));
      const shape = new THREE.Shape(ring.map(([x, y]) => new THREE.Vector2(x, y)));
      const geo = new THREE.ExtrudeGeometry(shape, { depth:0.5, bevelEnabled:false });
      geo.rotateX(Math.PI / 2); geo.translate(0, z + 0.25, 0);
      const m = new THREE.Mesh(geo, [poolMat, coping]);
      m.receiveShadow = true; m.userData.dynamic = true; g.add(m);
    }
    // trees: every mapped one, plus planting through the gardens and woods
    const rnd = mulberry(90210);
    const list = { pine:[], palm:[], cypress:[], broad:[] };
    const put = (x, y, kindHint) => {
      if(!M.land(x, y)) return;
      const q = this.near(x, y, 30); if(q && q.d < this.rin(q.i, q.side) + 1) return;
      if(q && this.T.pitRamp(q.i) > 0.02 && q.d < this.T.half + this.T.pitW + 18) return;      // keep the pit lane and its crew in view
      const z = this.ground(x, y);
      const nearSea = this.seaDistAt(x, y) < 60;
      let k = kindHint || (nearSea ? (rnd() < 0.7 ? "palm" : "pine") :
              (r => r < 0.34 ? "pine" : r < 0.56 ? "palm" : r < 0.74 ? "cypress" : "broad")(rnd()));
      const s = 0.8 + rnd() * 0.5;
      list[k].push([x, y, z, rnd() * TAU, s]);
    };
    for(const [x, y] of M.trees) put(x, y);
    const GH2 = this.gridH;
    for(let r = 0; r < GH2.ny; r++) for(let c = 0; c < GH2.nx; c++){
      const k = cls[r * GH2.nx + c];
      if(k !== 1 && k !== 2) continue;
      if(rnd() > (k === 2 ? 0.55 : 0.22) * (this.detail ? 1 : 0.5)) continue;
      put(GH2.X0 + (c + rnd() - 0.5) * GH2.step, GH2.Y0 + (r + rnd() - 0.5) * GH2.step, k === 2 ? (rnd() < 0.5 ? "pine" : "broad") : null);
    }
    this.trees(G, g, list);
  },

  /* four tree species, each an instanced trunk and an instanced canopy */
  trees(G, g, list){
    const bark = G.mat("#6A5440", { roughness:0.95 }), pineGreen = G.mat("#3E5A2E", { roughness:0.9 });
    const palmGreen = G.mat("#4E7A36", { roughness:0.85 }), cypGreen = G.mat("#2E4A26", { roughness:0.9 }),
          broadGreen = G.mat("#5A7E3A", { roughness:0.9 });
    const one = (items, trunk, crown, tm, cm) => {
      if(!items.length) return;
      LB.many(G, g, trunk, tm, items, true);
      LB.many(G, g, crown, cm, items, true);
    };
    // the umbrella pine: a tall bare trunk and a wide flat crown
    { const t = new THREE.CylinderGeometry(0.28, 0.45, 9, 6); t.translate(0, 4.5, 0);
      const c = new THREE.SphereGeometry(5.2, 10, 6); c.scale(1, 0.34, 1); c.translate(0, 9.6, 0);
      one(list.pine, t, c, bark, pineGreen); }
    // the palm: a leaning ringed trunk and a burst of fronds
    { const t = new THREE.CylinderGeometry(0.22, 0.34, 10, 6); t.translate(0, 5, 0);
      const fr = [];
      for(let k = 0; k < 8; k++){
        const f = new THREE.BoxGeometry(4.4, 0.12, 0.8);
        f.translate(2.0, 0, 0); f.rotateZ(-0.35); f.rotateY(k / 8 * TAU); f.translate(0, 10, 0);
        fr.push(f);
      }
      const c = LB.merge(fr);
      one(list.palm, t, c, G.mat("#8A7458", { roughness:0.9 }), palmGreen); }
    // the cypress: a dark, narrow flame
    { const t = new THREE.CylinderGeometry(0.2, 0.25, 1.5, 5); t.translate(0, 0.75, 0);
      const c = new THREE.ConeGeometry(1.5, 11, 8); c.translate(0, 6.8, 0);
      one(list.cypress, t, c, bark, cypGreen); }
    // a round broadleaf: plane trees and the like
    { const t = new THREE.CylinderGeometry(0.3, 0.42, 4, 6); t.translate(0, 2, 0);
      const c = new THREE.IcosahedronGeometry(3.6, 1); c.scale(1, 0.85, 1); c.translate(0, 6.2, 0);
      one(list.broad, t, c, bark, broadGreen); }
    this.treeCount = list.pine.length + list.palm.length + list.cypress.length + list.broad.length;
  },

  /* ---- the streets that meet the circuit, and the stairs between levels ---- */
  streets(G, g, T){
    const M = this.M;
    const WID = [10.5, 7.5, 5.0, 5.0, 3.0];
    const mats = [G.mat("#4E5258", { roughness:0.92 }), G.mat("#55595F", { roughness:0.92 }),
                  G.mat("#60646A", { roughness:0.92 }), G.mat("#D4CAB6", { roughness:0.92 }),
                  new THREE.MeshStandardMaterial({ map:PTEX.stairs(), color:G.col("#E2DACB"), roughness:0.9 })];
    const walkMat = G.mat("#CFC6B4", { roughness:0.92 }), paint = G.mat("#E8E6DE", { roughness:0.85 });
    for(let cl = 0; cl < 5; cl++){
      const pos = [], uv = [], idx = [], sw = [], swi = []; let v = 0, sv = 0;
      const dash = [], dashI = []; let dv = 0;
      for(const line of (M.streets[cl] || [])){
        // resample every 5 m and drop whatever lies on the circuit
        const pts = [];
        for(let k = 0; k < line.length - 1; k++){
          const [ax, ay] = line[k], [bx, by] = line[k + 1], L = Math.hypot(bx - ax, by - ay);
          const N2 = Math.max(1, Math.ceil(L / 5));
          for(let s = 0; s < N2; s++) pts.push([ax + (bx - ax) * s / N2, ay + (by - ay) * s / N2]);
        }
        pts.push(line[line.length - 1]);
        let run = [];
        const flush = () => {
          if(run.length < 2){ run = []; return; }
          let along = 0;
          for(let k = 0; k < run.length; k++){
            const p = run[k], a = run[Math.max(0, k - 1)], b = run[Math.min(run.length - 1, k + 1)];
            const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
            if(k) along += Math.hypot(p[0] - run[k - 1][0], p[1] - run[k - 1][1]);
            const hw = WID[cl] / 2, z = p[2] + 0.12;
            pos.push(p[0] - nx * hw, z, p[1] - ny * hw, p[0] + nx * hw, z, p[1] + ny * hw);
            uv.push(0, along / (cl === 4 ? 1.2 : 8), 1, along / (cl === 4 ? 1.2 : 8));
            if(k){ idx.push(v - 2, v - 1, v, v - 1, v + 1, v); }
            v += 2;
            if(cl <= 1){
              for(const sd of [-1, 1]){
                const o1 = hw, o2 = hw + 2.4;
                sw.push(p[0] + nx * sd * o1, z + 0.16, p[1] + ny * sd * o1, p[0] + nx * sd * o2, z + 0.16, p[1] + ny * sd * o2);
              }
              if(k){ for(const off of [0, 2]){ const b0 = sv - 4 + off, b1 = sv + off;
                swi.push(b0, b0 + 1, b1, b0 + 1, b1 + 1, b1); } }
              sv += 4;
              if(k && (Math.floor(along / 6) % 2 === 0)){
                const q0 = run[k - 1];
                dash.push(q0[0] - nx * 0.08, z + 0.02, q0[1] - ny * 0.08, q0[0] + nx * 0.08, z + 0.02, q0[1] + ny * 0.08,
                          p[0] + nx * 0.08, z + 0.02, p[1] + ny * 0.08, p[0] - nx * 0.08, z + 0.02, p[1] - ny * 0.08);
                dashI.push(dv, dv + 1, dv + 2, dv, dv + 2, dv + 3); dv += 4;
              }
            }
          }
          run = [];
        };
        for(const [x, y] of pts){
          const q = this.near(x, y, 30);
          const onCircuit = q && q.d < this.rin(q.i, q.side) + WID[cl] / 2 - 1;
          const inTunnel = q && T.inTunnel(q.i) && q.d < T.half + 10;
          if(onCircuit || inTunnel || !M.land(x, y)){ flush(); continue; }
          run.push([x, y, this.ground(x, y)]);
        }
        flush();
      }
      const mk = (P, I, U, mat) => {
        if(!P.length) return;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
        if(U) geo.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2));
        geo.setIndex(I); geo.computeVertexNormals();
        const mm = mat.clone(); mm.polygonOffset = true; mm.polygonOffsetFactor = -2; mm.polygonOffsetUnits = -2;
        const m = new THREE.Mesh(geo, mm); m.receiveShadow = true; m.userData.dynamic = true; g.add(m);
      };
      mk(pos, idx, uv, mats[cl]);
      mk(sw, swi, null, walkMat);
      mk(dash, dashI, null, paint);
    }
  },

  /* ---- the town: every mapped building on its real footprint ----
     Each one stands on the lowest ground under it and rises its storeys above
     the highest, so on a slope the downhill face shows extra floors and the
     rooflines step up the hill the way they do on the real rock face. Walls are
     batched by facade, roofs by kind, so 3,400 buildings are a handful of draws. */
  buildings(G, g, T){
    const M = this.M, rnd = mulberry(20260524);
    const TILE_W = 12, TILE_H = 9.45;                 // four bays by three floors
    const PAL = PTEX.monacoPalette();
    const nPal = PAL.length;
    // one bucket per facade colour, plus roofs; and a separate set for anything
    // standing over the tunnel, which has to be able to fade on its own
    const bucket = () => ({ pos:[], nrm:[], uv:[], col:[] });
    let tint = [1, 1, 1];
    const tintN = (b, n) => { for(let k = 0; k < n; k++) b.col.push(tint[0], tint[1], tint[2]); };
    // buckets by material and by 250 m chunk, so culling can skip most of the town
    const BK = new Map();
    const bk = (name, cx, cy) => { const k = name + "|" + Math.floor(cx / 250) + "," + Math.floor(cy / 250);
      let b = BK.get(k); if(!b){ b = bucket(); b.name = name; BK.set(k, b); } return b; };
    const fWalls = [...Array(nPal)].map(bucket), fFlat = bucket(), fTerra = bucket();
    const push = (b, a, c, d, e, n) => {             // a quad a-c-d-e, one normal, wound to face n
      b.pos.push(...a, ...d, ...c, ...a, ...e, ...d);
      for(let k = 0; k < 6; k++) b.nrm.push(n[0], n[1], n[2]);
      tintN(b, 6);
    };
    const tri = (b, a, c, d) => {
      let ux = c[0] - a[0], uy = c[1] - a[1], uz = c[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if(ny < 0){ const t = c; c = d; d = t; nx = -nx; ny = -ny; nz = -nz; }   // face the sky
      b.pos.push(...a, ...c, ...d);
      tintN(b, 3);
      const l = Math.hypot(nx, ny, nz) || 1;
      for(let k = 0; k < 3; k++) b.nrm.push(nx / l, ny / l, nz / l);
      b.uv.push(a[0] / 8, a[2] / 8, c[0] / 8, c[2] / 8, d[0] / 8, d[2] / 8);
    };
    this.bInfo = [];
    const balc = [], people = [], rooftop = [], tanks = [], gardens = [];
    let skipped = 0, count = 0, overTunnel = 0, hiddenView = 0;
    const tunnelNear = (x, y) => { const q = this.near(x, y, 40); return q && T.inTunnel(q.i) && q.d < T.half + 14; };
    for(const B of M.blds){
      const P = B.pts; if(P.length < 3) continue;
      if(B.lm) continue;                                // the landmarks build themselves
      let cx = 0, cy = 0, area = 0, per = 0;
      for(let k = 0; k < P.length; k++){
        const a = P[k], b = P[(k + 1) % P.length];
        cx += a[0]; cy += a[1]; area += a[0] * b[1] - b[0] * a[1]; per += Math.hypot(b[0] - a[0], b[1] - a[1]);
      }
      cx /= P.length; cy /= P.length; area = Math.abs(area) / 2;
      // how near the circuit is it, and does it stand on the road?
      let dMin = Infinity, onRoad = false, fades = false;
      for(const [x, y] of P.concat([[cx, cy]])){
        const q = this.near(x, y, 60);
        if(!q) continue;
        dMin = Math.min(dMin, q.d);
        if(T.inTunnel(q.i)){ if(q.d < T.half + 14) fades = true; continue; }
        if(q.d < T.half + (q.side < 0 ? T.roL[q.i] : T.roR[q.i]) + 1.2) onRoad = true;
      }
      if(onRoad){ skipped++; continue; }
      if(!this.detail && dMin > 700) continue;
      // storeys: the mapped number where there is one, a Monaco guess where not
      const h01 = ((Math.sin(cx * 12.9898 + cy * 78.233) * 43758.5453) % 1 + 1) % 1;
      let lv = B.lv;
      if(!lv){
        if(B.kind === 2) lv = 2 + Math.floor(h01 * 2);
        else if(B.kind === 3) lv = 4;
        else if(B.kind === 7) lv = 1;
        else if(area < 80) lv = 3 + Math.floor(h01 * 3);
        else if(area < 250) lv = 4 + Math.floor(h01 * 5);
        else if(area < 700) lv = 6 + Math.floor(h01 * 6);
        else if(area < 2000) lv = 8 + Math.floor(h01 * 8);
        else lv = 7 + Math.floor(h01 * 10);
      }
      if(!M.land(cx, cy) && lv > 3) lv = B.lv ? Math.min(B.lv, 4) : 3;
      // long thin footprints with no mapped height are sheds, terminals and
      // breakwater buildings, not towers
      if(!B.lv && per * per / Math.max(area, 1) > 40) lv = Math.min(lv, 4);
      const height = lv * 3.15 + 1.2;
      let gLo = Infinity, gHi = -Infinity;
      for(const [x, y] of P){ const h = this.ground(x, y); gLo = Math.min(gLo, h); gHi = Math.max(gHi, h); }
      if(gLo < 0.5) gLo = 0.5;                           // standing in the harbour is not a thing
      const base = gLo - 0.4, top = Math.max(gHi, gLo) + height;
      if(this.hidesRoad(P, top)){ hiddenView++; continue; }
      // facade colour: the old town is ochre and cream, the rest pastel
      let pal = Math.floor(h01 * nPal * 7.31) % nPal;
      { const v = 0.90 + ((h01 * 97.3) % 1) * 0.16, w2 = ((h01 * 53.1) % 1 - 0.5) * 0.06;
        tint = [v + w2, v, v - w2]; }
      if(lv >= 14) pal = PTEX.PALETTE_MODERN;
      const W = fades ? fWalls[pal] : bk("walls", cx, cy);
      // the palette rides in v for the atlas, four tiles in from its boundary so
      // walls that start just below ground stay inside their own palette
      const vOff = fades ? 0 : pal * 32 + 4;
      let along = 0;
      for(let k = 0; k < P.length; k++){
        const a = P[k], b = P[(k + 1) % P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if(L < 0.05) continue;
        // footprints are counter-clockwise in game space; the outward normal is (dy, -dx)
        const nx = (b[1] - a[1]) / L, ny = -(b[0] - a[0]) / L;
        push(W, [a[0], base, a[1]], [b[0], base, b[1]], [b[0], top, b[1]], [a[0], top, a[1]], [nx, 0, ny]);
        const u0 = along / TILE_W, u1 = (along + L) / TILE_W, v0 = (base - gLo) / TILE_H + vOff, v1 = (top - gLo) / TILE_H + vOff;
        W.uv.push(u0, v0, u1, v1, u1, v0, u0, v0, u0, v1, u1, v1);
        along += L;
        // balconies on the faces that look at the circuit, near it
        if(this.detail && dMin < 95 && L > 7 && lv >= 3){
          const q = this.near((a[0] + b[0]) / 2 + nx * 6, (a[1] + b[1]) / 2 + ny * 6, 110);
          if(q){
            const tx = T.x[q.i] - (a[0] + b[0]) / 2, ty = T.y[q.i] - (a[1] + b[1]) / 2, tl = Math.hypot(tx, ty) || 1;
            if((tx * nx + ty * ny) / tl > 0.35){
              const ang = Math.atan2(ny, nx);
              for(let s = 3; s < L - 2; s += 6){
                const px = a[0] + (b[0] - a[0]) * s / L + nx * 0.6, py = a[1] + (b[1] - a[1]) * s / L + ny * 0.6;
                const gz = this.ground(px, py);
                for(let f = 1; f < lv; f += (lv > 8 ? 2 : 1)){
                  const z = Math.max(base, gz) + 1.2 + f * 3.15;
                  if(z > top - 2) break;
                  balc.push([px, py, z, -ang, 1]);
                  // on a race weekend there is somebody on most of them
                  if(dMin < 70 && rnd() < 0.55) people.push([px + nx * 0.2, py + ny * 0.2, z + 0.9, rnd() * TAU, 0.9 + rnd() * 0.2]);
                }
              }
            }
          }
        }
      }
      // the roof: terracotta on the small old houses, flat terraces everywhere else
      const smallOld = area < 420 && lv <= 6 && P.length <= 6;
      const R = fades ? (smallOld ? fTerra : fFlat) : bk(smallOld ? "terra" : "flat", cx, cy);
      const tris = THREE.ShapeUtils.triangulateShape(P.map(([x, y]) => new THREE.Vector2(x, y)), []);
      if(smallOld){
        // a low hip towards the middle
        const apex = [cx, top + Math.min(4.5, Math.sqrt(area) * 0.28), cy];
        for(let k = 0; k < P.length; k++){
          const a = P[k], b = P[(k + 1) % P.length];
          tri(R, [a[0], top, a[1]], apex, [b[0], top, b[1]]);
        }
      } else {
        for(const t3 of tris){
          const A = P[t3[0]], Bq = P[t3[1]], C = P[t3[2]];
          tri(R, [A[0], top, A[1]], [Bq[0], top, Bq[1]], [C[0], top, C[1]]);
        }
        // what lives on a flat roof in Monaco: plant, tanks, and a garden or two
        if(this.detail && dMin < 450 && area > 90){
          const nAC = Math.min(6, 1 + Math.floor(area / 250));
          for(let k = 0; k < nAC; k++){
            const t3 = tris[Math.floor(rnd() * tris.length)]; if(!t3) break;
            const A = P[t3[0]], Bq = P[t3[1]], C = P[t3[2]];
            let r1 = rnd(), r2 = rnd(); if(r1 + r2 > 1){ r1 = 1 - r1; r2 = 1 - r2; }
            const x = A[0] + (Bq[0] - A[0]) * r1 + (C[0] - A[0]) * r2, y = A[1] + (Bq[1] - A[1]) * r1 + (C[1] - A[1]) * r2;
            (rnd() < 0.3 ? tanks : rooftop).push([x, y, top, rnd() * TAU, 0.8 + rnd() * 0.5]);
          }
          if(rnd() < 0.18 && area > 250) gardens.push([cx, cy, top + 0.05, rnd() * TAU, Math.sqrt(area) * 0.35]);
        }
      }
      this.bInfo.push({ cx, cy, base, top, area, dMin });
      count++; if(fades) overTunnel++;
    }
    // materials
    const mk = (b, mat, cast) => {
      if(!b.pos.length) return null;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(b.pos, 3));
      geo.setAttribute("normal", new THREE.Float32BufferAttribute(b.nrm, 3));
      if(b.uv.length) geo.setAttribute("uv", new THREE.Float32BufferAttribute(b.uv, 2));
      if(b.col.length){ geo.setAttribute("color", new THREE.Float32BufferAttribute(b.col, 3));
        if(!mat.vertexColors){
          const c = mat.clone(); c.vertexColors = true;
          if(mat.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile){
            c.onBeforeCompile = mat.onBeforeCompile; c.customProgramCacheKey = mat.customProgramCacheKey; }
          mat = c;
        } }
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = cast; m.receiveShadow = true; m.userData.dynamic = true;
      g.add(m); return m;
    };
    const facades = PAL.map((p, i) => PTEX.monacoFacade(i));
    const roofFlat = new THREE.MeshStandardMaterial({ map:PTEX.roofGravel(), color:G.col("#E2D8C6"), roughness:0.95, vertexColors:true });
    const roofTerra = new THREE.MeshStandardMaterial({ map:PTEX.roofTiles(), color:G.col("#D07048"), roughness:0.85, vertexColors:true });
    // one tinted material per facade, shared by every chunk that uses it
    const tinted = new Map();
    const tintMat = base => { let m = tinted.get(base); if(!m){ m = base.clone(); m.vertexColors = true; tinted.set(base, m); } return m; };
    for(const b of BK.values()){
      const name = b.name;
      const mat = name === "flat" ? roofFlat : name === "terra" ? roofTerra : PTEX.monacoAtlas();
      const m = mk(b, mat, true);
      if(m) m.geometry.computeBoundingSphere();
    }
    for(let i = 0; i < nPal; i++){
      const fm = mk(fWalls[i], G.ditherMat(facades[i]), true);
      if(fm) this.fade.push(fm);
    }
    for(const [b, mat] of [[fFlat, roofFlat], [fTerra, roofTerra]]){ const fm = mk(b, G.ditherMat(mat), true); if(fm) this.fade.push(fm); }
    // balconies: a slab with a solid parapet, which is most of Monaco's
    if(balc.length){
      const bg = LB.merge([ (() => { const s = new THREE.BoxGeometry(1.25, 0.18, 3.0); s.translate(0.62, 0, 0); return s; })(),
                            (() => { const s = new THREE.BoxGeometry(0.10, 1.0, 3.0); s.translate(1.22, 0.55, 0); return s; })() ]);
      LB.many(G, g, bg, G.mat("#F2EEE6", { roughness:0.8 }), balc, false);
    }
    if(people.length) this.crowd(G, g, people);
    if(rooftop.length){ const ac = new THREE.BoxGeometry(1.6, 1.0, 1.1); ac.translate(0, 0.5, 0);
      LB.many(G, g, ac, G.mat("#B8BCC0", { roughness:0.6, metalness:0.3 }), rooftop, false); }
    if(tanks.length){ const tk = new THREE.CylinderGeometry(0.9, 0.9, 1.8, 10); tk.translate(0, 1.2, 0);
      LB.many(G, g, tk, G.mat("#E8E6E0", { roughness:0.7 }), tanks, false); }
    if(gardens.length){ const gp = new THREE.CylinderGeometry(1, 1, 0.3, 8); gp.translate(0, 0.15, 0);
      const list = gardens.map(([x, y, z, r, s]) => [x, y, z, r, s, 1]);
      LB.many(G, g, gp, G.mat("#6E8E48", { roughness:0.95 }), list, false); }
    this.stats = Object.assign(this.stats || {}, { buildings:count, skippedOnRoad:skipped, hiddenInView:hiddenView, overTunnel,
      balconies:balc.length, balconyPeople:people.length });
  },

  /* people: a capsule body and a head, instanced, in a spread of colours */
  crowd(G, g, list){
    // one body mesh with a colour per person, rather than a mesh per shirt colour
    const body = this._body || (this._body = (() => { const b = new THREE.CylinderGeometry(0.22, 0.28, 1.2, 6); b.translate(0, 0.6, 0); return b; })());
    const head = this._head || (this._head = (() => { const h = new THREE.SphereGeometry(0.17, 6, 4); h.translate(0, 1.38, 0); return h; })());
    const shirts = ["#E8E4DC", "#1E3A6A", "#C8302A", "#F2C230", "#2E8C5A", "#101418", "#E86A9A", "#6AA8E0"];
    const items = list.map((p, i) => [p[0], p[1], p[2], p[3], p[4], null, shirts[(i * 7 + Math.floor(p[0] * 3)) % shirts.length]]);
    LB.many(G, g, body, G.mat("#FFFFFF", { roughness:0.9 }), items, false);
    LB.many(G, g, head, G.mat("#D8A88A", { roughness:0.8 }), list, false);
    this.stats = Object.assign(this.stats || {}, { people:(this.stats && this.stats.people || 0) + list.length });
  },

  /* ---- the landmarks, each on its own surveyed footprint ---- */
  foot(k){
    const B = this.M.blds.find(b => b.lm === k); if(!B) return null;
    const P = this.clear(B.pts, 2.4); let cx = 0, cy = 0, area = 0;
    for(let i = 0; i < P.length; i++){ const a = P[i], b = P[(i + 1) % P.length]; cx += a[0]; cy += a[1]; area += a[0] * b[1] - b[0] * a[1]; }
    cx /= P.length; cy /= P.length;
    let lo = Infinity, hi = -Infinity;
    for(const [x, y] of P){ const h = this.ground(x, y); lo = Math.min(lo, h); hi = Math.max(hi, h); }
    // a landmark in the way of the hairpin or the last turns is left out too
    if(this.hidesRoad(P, hi + (k === "fairmont" ? 26.4 : 20))){ (this.hiddenLandmarks = this.hiddenLandmarks || []).push(k); return null; }
    return { P, cx, cy, area:Math.abs(area) / 2, lo:Math.max(0.5, lo), hi };
  },
  // the edge of a footprint that faces a point, and the directions off it
  facing(F, tx, ty){
    let best = null;
    for(let i = 0; i < F.P.length; i++){
      const a = F.P[i], b = F.P[(i + 1) % F.P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if(L < 4) continue;
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, d = Math.hypot(tx - mx, ty - my) - L * 0.15;
      if(!best || d < best.d) best = { d, mx, my, L, tx:(b[0] - a[0]) / L, ty:(b[1] - a[1]) / L, nx:(b[1] - a[1]) / L, ny:-(b[0] - a[0]) / L };
    }
    return best;
  },
  // a footprint, shrunk towards its middle
  shrink(P, cx, cy, f){ return P.map(([x, y]) => [cx + (x - cx) * f, cy + (y - cy) * f]); },
  prism(G, g, P, z0, h, mat, cast){
    const shape = new THREE.Shape(P.map(([x, y]) => new THREE.Vector2(x, y)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth:h, bevelEnabled:false });
    geo.rotateX(Math.PI / 2); geo.translate(0, z0 + h, 0);
    // extrusions come out with the shape's own coordinates as UVs; rescale the
    // side walls to metres so facade maps tile at their real size
    const uv = geo.attributes.uv, pos = geo.attributes.position, nrm = null;
    const m = new THREE.Mesh(geo, mat); m.castShadow = cast !== false; m.receiveShadow = true;
    m.userData.dynamic = true; g.add(m); return m;
  },
  // wall UVs in metres: u along the wall, v up it (ExtrudeGeometry's own are
  // useless for a facade texture)
  facadeUV(geo, tileW, tileH, z0){
    const pos = geo.attributes.position, nrm = geo.attributes.normal, uv = geo.attributes.uv;
    for(let i = 0; i < pos.count; i++){
      const ny = nrm.getY(i);
      if(Math.abs(ny) > 0.5){ uv.setXY(i, pos.getX(i) / 8, pos.getZ(i) / 8); continue; }
      const nx = nrm.getX(i), nz = nrm.getZ(i);
      const along = pos.getX(i) * -nz + pos.getZ(i) * nx;
      uv.setXY(i, along / tileW, (pos.getY(i) - z0) / tileH);
    }
    uv.needsUpdate = true;
  },

  landmarks(G, g, T){
    const M = this.M, lm = M.lm;
    const stone = "#EADFC8";
    const copper = G.mat("#5FA08A", { roughness:0.55, metalness:0.35 });
    const slate = G.mat("#7C8898", { roughness:0.55, metalness:0.25 });
    const gold = G.mat("#C8A04A", { roughness:0.35, metalness:0.8 });
    const glass = new THREE.MeshStandardMaterial({ color:G.col("#9EC8C4"), roughness:0.08, metalness:0.2,
      transparent:true, opacity:0.55, envMapIntensity:1.6 });
    const cream = (c, rough) => G.faceMat("stone", c || stone, false, { roughness:rough || 0.8 });
    const beaux = PTEX.monacoFacade(PTEX.PALETTE_BEAUX);
    const made = {};
    const body = (F, h, mat) => {
      const m = this.prism(G, g, F.P, F.lo - 0.4, (F.hi - F.lo) + h + 0.4, mat);
      this.facadeUV(m.geometry, 12, 9.45, F.lo);
      return F.hi + h;
    };
    /* the Casino de Monte-Carlo: Beaux-Arts cream stone, two ornate towers on
       the square, a central dome, green copper and slate roofs */
    { const F = this.foot("casino");
      if(F){
        const top = body(F, 17, beaux);
        const fr = this.facing(F, lm.fountain[0], lm.fountain[1]);
        // the roof: a slate mansard band stepped in from the walls
        this.prism(G, g, this.shrink(F.P, F.cx, F.cy, 0.9), top, 3.2, slate);
        if(fr){
          const bx = fr.mx - fr.nx * 7, by = fr.my - fr.ny * 7, ang = Math.atan2(fr.ty, fr.tx);
          for(const s of [-1, 1]){
            const x = bx + fr.tx * s * fr.L * 0.36, y = by + fr.ty * s * fr.L * 0.36;
            LB.box(G, g, x, y, F.lo, 9, 9, top - F.lo + 9, ang, cream("#EFE4CC"));
            LB.box(G, g, x, y, top + 9, 10, 10, 1.2, ang, cream("#E2D6BC"));
            // the copper pavilion roofs, and a lantern on each
            const c = LB.cone(G, g, x, y, top + 10.2, 6.6, 9, copper, 4); c.rotation.y = -ang + Math.PI / 4;
            LB.cyl(G, g, x, y, top + 19.2, 0.9, 0.5, 3.2, gold, 8);
          }
          // the dome over the atrium, a little back from the entrance
          const dx = fr.mx - fr.nx * 16, dy = fr.my - fr.ny * 16;
          LB.cyl(G, g, dx, dy, top + 3, 7.5, 7.5, 5, cream("#EDE2CA"), 24);
          const pts = []; for(let k = 0; k <= 10; k++){ const a = k / 10 * Math.PI / 2; pts.push(new THREE.Vector2(7.6 * Math.cos(a) + 0.01, 7.2 * Math.sin(a))); }
          LB.lathe(G, g, dx, dy, top + 8, pts, copper, 24);
          LB.cyl(G, g, dx, dy, top + 15, 1.4, 1.0, 3.4, cream("#EDE2CA"), 10);
          LB.cyl(G, g, dx, dy, top + 18.4, 0.3, 0.05, 2.4, gold, 6);
          // the entrance: an arcade of three arches under a balcony
          const ex = fr.mx + fr.nx * 2.2, ey = fr.my + fr.ny * 2.2;
          LB.box(G, g, ex, ey, F.lo, 22, 4.4, 9, ang, cream("#F2E8D2"));
          const arch = [];
          for(const s of [-1, 0, 1]) arch.push([ex + fr.tx * s * 6.5 + fr.nx * 2.25, ey + fr.ty * s * 6.5 + fr.ny * 2.25, F.lo, -ang, 1]);
          const ag = new THREE.BoxGeometry(4.2, 6.2, 0.2); ag.translate(0, 3.1, 0);
          LB.many(G, g, ag, G.mat("#3A3226", { roughness:0.6 }), arch, false);
          LB.box(G, g, ex, ey, F.lo + 9, 23, 5, 0.7, ang, gold);
          made.casino = { x:fr.mx, y:fr.my };
        }
      } }
    /* the Hotel de Paris: a long cream Belle Epoque front under a mansard, with
       its domed rotunda on the corner nearest the square */
    { const F = this.foot("hotelparis");
      if(F){
        const top = body(F, 22, beaux);
        this.prism(G, g, this.shrink(F.P, F.cx, F.cy, 0.93), top, 4.2, slate);
        // the corner: whichever footprint vertex is nearest the Casino fountain
        let c = F.P[0], cd = Infinity;
        for(const p of F.P){ const d = Math.hypot(p[0] - lm.fountain[0], p[1] - lm.fountain[1]); if(d < cd){ cd = d; c = p; } }
        const rx = c[0] + (F.cx - c[0]) * 0.08, ry = c[1] + (F.cy - c[1]) * 0.08;
        LB.cyl(G, g, rx, ry, F.lo, 7, 7, top - F.lo + 3, cream("#F4EAD6"), 20);
        const pts = []; for(let k = 0; k <= 8; k++){ const a = k / 8 * Math.PI / 2; pts.push(new THREE.Vector2(7.1 * Math.cos(a) + 0.01, 6 * Math.sin(a))); }
        LB.lathe(G, g, rx, ry, top + 3, pts, slate, 20);
        LB.cyl(G, g, rx, ry, top + 9, 0.8, 0.5, 2.6, gold, 8);
        // flags along the roof
        const fl = [];
        const fr = this.facing(F, lm.fountain[0], lm.fountain[1]);
        if(fr) for(let k = -2; k <= 2; k++) fl.push([fr.mx + fr.tx * k * 12 - fr.nx * 2, fr.my + fr.ty * k * 12 - fr.ny * 2, top + 4.2, 0, 1]);
        this.flags(G, g, fl);
        // red awnings over the ground floor on the square
        if(fr){ const ang = Math.atan2(fr.ty, fr.tx);
          LB.box(G, g, fr.mx + fr.nx * 1.6, fr.my + fr.ny * 1.6, F.lo + 4.2, fr.L * 0.8, 3.2, 0.25, ang, G.mat("#B8282E", { roughness:0.8 })); }
      } }
    /* the Cafe de Paris: a lower Belle Epoque pavilion with its terrace spilling
       onto the square under parasols */
    { const F = this.foot("cafeparis");
      if(F){
        const top = body(F, 11, PTEX.monacoFacade(PTEX.PALETTE_OCHRE));
        this.prism(G, g, this.shrink(F.P, F.cx, F.cy, 0.94), top, 2.2, slate);
        const fr = this.facing(F, lm.fountain[0], lm.fountain[1]);
        if(fr){
          const ang = Math.atan2(fr.ty, fr.tx);
          LB.box(G, g, fr.mx + fr.nx * 3.5, fr.my + fr.ny * 3.5, F.lo + 4, fr.L * 0.9, 7, 0.3, ang, glass);
          const tables = [];
          for(let a = -3; a <= 3; a++) for(let b = 0; b < 2; b++){
            const x = fr.mx + fr.tx * a * 5.2 + fr.nx * (9 + b * 5), y = fr.my + fr.ty * a * 5.2 + fr.ny * (9 + b * 5);
            const q = this.near(x, y, 20); if(q && q.d < this.rin(q.i, q.side)) continue;
            tables.push([x, y, this.ground(x, y), 0, 1]);
          }
          this.terrace(G, g, tables, "#F2F0E6");
        }
      } }
    /* the Hermitage, and its glass-domed winter garden */
    { const F = this.foot("hermitage");
      if(F){
        const top = body(F, 20, PTEX.monacoFacade(PTEX.PALETTE_CREAM));
        this.prism(G, g, this.shrink(F.P, F.cx, F.cy, 0.93), top, 2.8, G.mat("#B8683E", { roughness:0.8 }));
        const dome = new THREE.Mesh(new THREE.SphereGeometry(9, 20, 10, 0, TAU, 0, Math.PI / 2), glass);
        dome.position.set(F.cx, top + 2.8, F.cy); dome.userData.dynamic = true; g.add(dome);
        const ribs = new THREE.Mesh(new THREE.SphereGeometry(9.05, 12, 5, 0, TAU, 0, Math.PI / 2),
          new THREE.MeshStandardMaterial({ color:G.col("#E8E6DE"), wireframe:true }));
        ribs.position.copy(dome.position); ribs.userData.dynamic = true; g.add(ribs);
      } }
    /* the Fairmont: long, low, curved round the hairpin, balcony bands all the
       way along, gardens on the flat roof — and the tunnel running under it, so
       every piece of it fades with the tunnel */
    { const F = this.foot("fairmont");
      if(F){
        const fm = PTEX.monacoFacade(PTEX.PALETTE_FAIRMONT);
        const m = this.prism(G, g, F.P, F.lo - 0.4, (F.hi - F.lo) + 26.4, G.ditherMat(fm));
        this.facadeUV(m.geometry, 12, 9.45, F.lo);
        this.fade.push(m);
        const top = F.hi + 26;
        // the roof garden and its pool
        const rg = this.prism(G, g, this.shrink(F.P, F.cx, F.cy, 0.86), top, 0.5, G.ditherMat(G.mat("#6E8E48", { roughness:0.95 })), false);
        this.fade.push(rg);
        const pool = new THREE.Mesh(new THREE.BoxGeometry(22, 0.4, 9), G.ditherMat(new THREE.MeshStandardMaterial({
          color:G.col("#2FB8E0"), roughness:0.08, emissive:G.col("#0E6A8A"), emissiveIntensity:0.35 })));
        pool.position.set(F.cx, top + 0.7, F.cy); pool.userData.dynamic = true; g.add(pool); this.fade.push(pool);
        this.fairmontTop = top;
      } }
    /* the Prince's Palace, on top of the Rock: pale ochre, crenellated, its
       towers at the corners */
    { const F = this.foot("palace");
      if(F){
        const top = body(F, 15, PTEX.monacoFacade(PTEX.PALETTE_OCHRE));
        const merl = [];
        for(let i = 0; i < F.P.length; i++){
          const a = F.P[i], b = F.P[(i + 1) % F.P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
          for(let s = 1; s < L; s += 2.2) merl.push([a[0] + (b[0] - a[0]) * s / L, a[1] + (b[1] - a[1]) * s / L, top, -Math.atan2(b[1] - a[1], b[0] - a[0]), 1]);
        }
        const mg = new THREE.BoxGeometry(1.1, 1.2, 0.7); mg.translate(0, 0.6, 0);
        LB.many(G, g, mg, G.mat("#E2C89A", { roughness:0.85 }), merl, false);
        // the two towers: the footprint corners furthest apart
        let A = F.P[0], Bq = F.P[1], bd = 0;
        for(const p of F.P) for(const q2 of F.P){ const d = Math.hypot(p[0] - q2[0], p[1] - q2[1]); if(d > bd){ bd = d; A = p; Bq = q2; } }
        for(const [x, y] of [A, Bq]){
          const tx = x + (F.cx - x) * 0.06, ty = y + (F.cy - y) * 0.06;
          LB.box(G, g, tx, ty, F.lo, 8, 8, top - F.lo + 9, 0, PTEX.monacoFacade(PTEX.PALETTE_OCHRE));
          const tm = [];
          for(let k = 0; k < 12; k++){ const a = k / 12 * TAU; tm.push([tx + Math.cos(a) * 4.3, ty + Math.sin(a) * 4.3, top + 9, a, 1]); }
          LB.many(G, g, mg, G.mat("#E2C89A", { roughness:0.85 }), tm, false);
        }
        this.flags(G, g, [[F.cx, F.cy, top, 0, 1.4]]);
      } }
    /* the Cathedral: white La Turbie stone, a bell tower and an apse dome */
    { const F = this.foot("cathedral");
      if(F){
        const top = body(F, 15, G.faceMat("stone", "#F2EEE4", false));
        this.prism(G, g, this.shrink(F.P, F.cx, F.cy, 0.95), top, 3, G.mat("#B86A44", { roughness:0.8 }));
        let far = F.P[0], fd = 0;
        for(const p of F.P){ const d = Math.hypot(p[0] - F.cx, p[1] - F.cy); if(d > fd){ fd = d; far = p; } }
        const bx = far[0] + (F.cx - far[0]) * 0.18, by = far[1] + (F.cy - far[1]) * 0.18;
        LB.box(G, g, bx, by, F.lo, 7, 7, top - F.lo + 13, 0, G.faceMat("stone", "#F2EEE4", false));
        LB.cone(G, g, bx, by, top + 13, 5, 5, G.mat("#B86A44"), 4);
        const opp = [F.cx * 2 - bx, F.cy * 2 - by];
        const pts = []; for(let k = 0; k <= 8; k++){ const a = k / 8 * Math.PI / 2; pts.push(new THREE.Vector2(6 * Math.cos(a) + 0.01, 5 * Math.sin(a))); }
        LB.lathe(G, g, (opp[0] + F.cx) / 2, (opp[1] + F.cy) / 2, top, pts, G.faceMat("stone", "#F2EEE4", false), 18);
      } }
    /* the Musee Oceanographique, on the cliff edge of the Rock */
    { const F = this.foot("musee");
      if(F){
        const top = body(F, 22, beaux);
        const pts = []; for(let k = 0; k <= 8; k++){ const a = k / 8 * Math.PI / 2; pts.push(new THREE.Vector2(7 * Math.cos(a) + 0.01, 6 * Math.sin(a))); }
        LB.cyl(G, g, F.cx, F.cy, top, 7, 7, 3, cream("#EFE6D2"), 18);
        LB.lathe(G, g, F.cx, F.cy, top + 3, pts, slate, 18);
      } }
    /* La Rascasse: low, with its terrace and awnings and the crowd on it */
    { const F = this.foot("rascasse");
      if(F){
        const top = body(F, 6.5, PTEX.monacoFacade(PTEX.PALETTE_SALMON));
        this.prism(G, g, this.shrink(F.P, F.cx, F.cy, 0.97), top, 1.1, G.mat("#E8E4DA"));
        const q = this.near(F.cx, F.cy, 120);
        if(q){
          const fr = this.facing(F, T.x[q.i], T.y[q.i]);
          if(fr){
            const ang = Math.atan2(fr.ty, fr.tx);
            LB.box(G, g, fr.mx + fr.nx * 2, fr.my + fr.ny * 2, F.lo + 3.4, fr.L, 4, 0.25, ang, G.mat("#1E4E8A", { roughness:0.8 }));
            const crowd = [];
            for(let k = 0; k < 60; k++){
              const s = (Math.random() - 0.5) * fr.L, d = 1 + Math.random() * 3.2;
              crowd.push([fr.mx + fr.tx * s + fr.nx * d, fr.my + fr.ty * s + fr.ny * d, F.hi + 0.1, Math.random() * TAU, 1]);
            }
            this.crowd(G, g, crowd);
          }
        }
      } }
    /* Sainte-Devote: a small pale chapel with a bell gable, right on the T1 barrier */
    { const F = this.foot("chapel");
      if(F){
        const top = body(F, 8, G.faceMat("stucco", "#F0E6D2", false));
        const ap = [F.cx, top + 4, F.cy];
        this.prism(G, g, this.shrink(F.P, F.cx, F.cy, 1.0), top, 0.5, G.mat("#C0643E"));
        LB.cone(G, g, F.cx, F.cy, top + 0.5, Math.sqrt(F.area) * 0.62, 3.6, G.mat("#C0643E"), 4).rotation.y = Math.PI / 4;
        const q = this.near(F.cx, F.cy, 80);
        if(q){
          const fr = this.facing(F, T.x[q.i], T.y[q.i]);
          if(fr){
            const ang = Math.atan2(fr.ty, fr.tx);
            LB.box(G, g, fr.mx, fr.my, top, 4.5, 1.0, 5.5, ang, G.faceMat("stucco", "#F0E6D2", false));
            LB.box(G, g, fr.mx + fr.nx * 0.2, fr.my + fr.ny * 0.2, top + 1.8, 1.6, 1.1, 2.2, ang, G.mat("#3A3026"));
            LB.cyl(G, g, fr.mx, fr.my, top + 5.5, 0.12, 0.06, 1.4, G.mat("#3A3026"), 5);
          }
        }
      } }
    /* the Yacht Club de Monaco: long, white, decks stepping back like a ship's */
    { const F = this.foot("yachtclub");
      if(F){
        const white = G.mat("#F4F4F2", { roughness:0.5 });
        const band = new THREE.MeshStandardMaterial({ color:G.col("#22303C"), roughness:0.08, metalness:0.4, envMapIntensity:1.6 });
        let z = F.lo;
        for(let k = 0; k < 5; k++){
          const P2 = this.shrink(F.P, F.cx, F.cy, 1 - k * 0.1);
          this.prism(G, g, this.shrink(F.P, F.cx, F.cy, 0.985 - k * 0.1), z, 2.4, band);
          this.prism(G, g, P2, z + 2.4, 1.0, white);
          z += 3.4;
        }
        LB.cyl(G, g, F.cx, F.cy, z, 0.35, 0.2, 16, white, 8);
        this.flags(G, g, [[F.cx, F.cy, z + 15, 0, 1.2]]);
      } }
    /* Tour Odeon: the twin-crowned tower up at the east end, about 170 m */
    { const F = this.foot("odeon");
      if(F){
        const gl = G.faceMat("glass", "#7A8C9E", false);
        // split the footprint along its long axis into the two towers
        let A = F.P[0], Bq = F.P[1], bd = 0;
        for(const p of F.P) for(const q2 of F.P){ const d = Math.hypot(p[0] - q2[0], p[1] - q2[1]); if(d > bd){ bd = d; A = p; Bq = q2; } }
        const ax = (Bq[0] - A[0]) / bd, ay = (Bq[1] - A[1]) / bd;
        for(const [f, h] of [[0.28, 170], [0.72, 156]]){
          const x = A[0] + ax * bd * f, y = A[1] + ay * bd * f;
          const m = LB.cyl(G, g, x, y, F.lo, bd * 0.26, bd * 0.24, h, gl, 24);
          const cap = new THREE.Mesh(new THREE.SphereGeometry(bd * 0.24, 20, 8, 0, TAU, 0, Math.PI / 2), G.mat("#DCE2E8", { roughness:0.3, metalness:0.6 }));
          cap.position.set(x, F.lo + h, y); cap.scale.y = 0.6; cap.userData.dynamic = true; g.add(cap);
        }
        LB.box(G, g, F.cx, F.cy, F.lo, bd * 0.5, bd * 0.3, 120, Math.atan2(ay, ax), gl);
      } }
    this.stats = Object.assign(this.stats || {}, { landmarks:Object.keys(M.blds.reduce((a, b) => (b.lm && (a[b.lm] = 1), a), {})).length });
  },

  // cafe tables under parasols
  terrace(G, g, list, col){
    if(!list.length) return;
    const pole = new THREE.CylinderGeometry(0.05, 0.05, 2.4, 4); pole.translate(0, 1.2, 0);
    const shade = new THREE.ConeGeometry(1.5, 0.55, 8); shade.translate(0, 2.55, 0);
    const table = new THREE.CylinderGeometry(0.45, 0.45, 0.75, 8); table.translate(0, 0.375, 0);
    LB.many(G, this.root, pole, G.mat("#8A8E94"), list, false);
    LB.many(G, this.root, shade, G.mat(col || "#F2F0E6", { roughness:0.9 }), list, true);
    LB.many(G, this.root, table, G.mat("#E8E6E0"), list, false);
  },
  // flags: small cloth panels that stir, instanced, red over white
  flags(G, g, list){
    if(!list.length) return;
    const pole = new THREE.CylinderGeometry(0.06, 0.08, 5, 5); pole.translate(0, 2.5, 0);
    LB.many(G, g, pole, G.mat("#D8DCE0", { metalness:0.6, roughness:0.4 }), list, false);
    const cloth = new THREE.PlaneGeometry(2.4, 1.6, 8, 1); cloth.translate(1.2, 4.1, 0);
    const col = [];
    const p = cloth.attributes.position;
    for(let i = 0; i < p.count; i++){ const top = p.getY(i) > 4.1; const c = G.col(top ? "#D8202A" : "#F4F4F4"); col.push(c.r, c.g, c.b); }
    cloth.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    const mat = new THREE.MeshStandardMaterial({ vertexColors:true, side:THREE.DoubleSide, roughness:0.9 });
    mat.onBeforeCompile = sh => {
      sh.uniforms.uT = this.timeU || (this.timeU = { value:0 });
      sh.vertexShader = "uniform float uT;\n" + sh.vertexShader.replace("#include <begin_vertex>",
        "#include <begin_vertex>\n  transformed.z += sin(position.x * 2.6 - uT * 5.0) * 0.18 * position.x;");
    };
    mat.customProgramCacheKey = () => "flagWave";
    LB.many(G, g, cloth, mat, list, false);
  },

  /* ---- yachts: lofted hulls, not boxes ----
     A hull is a run of cross-sections from transom to bow: a V under the water,
     flaring to the deck edge, with the sheer rising towards a pointed bow. Each
     model is built once at its own length and instanced; the hull takes a
     per-instance colour, the superstructure does not. */
  hull(L, B, D, H0){
    const S = 22, pos = [], idx = [], col = [];
    const sec = t => {
      const b = B * (t < 0.62 ? (0.92 + 0.08 * Math.min(1, t / 0.2)) : Math.pow(Math.cos((t - 0.62) / 0.38 * Math.PI / 2), 0.75));
      const d = D * (1 - 0.35 * t), h = H0 * (1 + 0.28 * t * t);
      // keel, bilge, waterline, deck edge
      return [[0, -d], [b * 0.72, -d * 0.35], [b, 0.2], [b * 0.97, h]];
    };
    const rows = [];
    for(let s = 0; s <= S; s++){
      const t = s / S, x = (t - 0.5) * L, c = sec(t);
      const row = [];
      for(const sd of [-1, 1]) for(let k = 0; k < c.length; k++){
        const [w, z] = c[k];
        row.push(pos.length / 3);
        pos.push(x, z, w * sd);
        // a dark boot stripe at the waterline; the rest takes the hull colour
        const boot = k === 2 ? 0.25 : 1; col.push(boot, boot, boot);
      }
      rows.push(row);
    }
    const nC = 4;
    for(let s = 0; s < S; s++){
      const a = rows[s], b = rows[s + 1];
      for(const side of [0, 1]){
        for(let k = 0; k < nC - 1; k++){
          const i0 = a[side * nC + k], i1 = a[side * nC + k + 1], j0 = b[side * nC + k], j1 = b[side * nC + k + 1];
          if(side) idx.push(i0, j0, i1, i1, j0, j1); else idx.push(i0, i1, j0, i1, j1, j0);
        }
      }
    }
    // the deck, between the two sheer lines, facing up: without it you look
    // straight down into the hull and see the water through the boat
    for(let s = 0; s < S; s++){
      const a = rows[s], b = rows[s + 1];
      idx.push(a[nC - 1], a[2 * nC - 1], b[nC - 1], a[2 * nC - 1], b[2 * nC - 1], b[nC - 1]);
    }
    // the transom
    const t0 = rows[0];
    for(let k = 0; k < nC - 1; k++) idx.push(t0[k], t0[nC + k], t0[k + 1], t0[k + 1], t0[nC + k], t0[nC + k + 1]);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  },
  // decks, cabins, window bands, masts: everything above the hull, coloured by vertex
  topsides(L, B, H0, kind){
    const parts = [];
    const add = (geo, hex) => {
      const c = new THREE.Color(hex).convertSRGBToLinear(), n = geo.attributes.position.count, a = new Float32Array(n * 3);
      for(let i = 0; i < n; i++){ a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
      geo.setAttribute("color", new THREE.BufferAttribute(a, 3)); parts.push(geo.index ? geo.toNonIndexed() : geo);
    };
    const box = (l, h, w, x, z, hex) => { const b = new THREE.BoxGeometry(l, h, w); b.translate(x, z + h / 2, 0); add(b, hex); };
    const deckZ = H0 * 1.02;
    // the teak deck, lofted from the same sections as the hull so it meets the bow
    { const S2 = 22, pos = [], idx = [];
      for(let s = 0; s <= S2; s++){
        const t = s / S2, x = (t - 0.5) * L;
        const b = B * (t < 0.62 ? (0.92 + 0.08 * Math.min(1, t / 0.2)) : Math.pow(Math.cos((t - 0.62) / 0.38 * Math.PI / 2), 0.75)) * 0.97;
        const h = H0 * (1 + 0.28 * t * t) + 0.05;
        pos.push(x, h, -b, x, h, b);
        if(s) idx.push(s * 2 - 2, s * 2 - 1, s * 2, s * 2 - 1, s * 2 + 1, s * 2);      // faces up
      }
      const dg = new THREE.BufferGeometry();
      dg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); dg.setIndex(idx); dg.computeVertexNormals();
      add(dg, "#B48A5E"); }
    if(kind === "sail"){
      box(L * 0.3, 1.0, B * 1.0, -L * 0.05, deckZ, "#F4F4F2");
      box(L * 0.3, 0.3, B * 1.02, -L * 0.05, deckZ + 0.55, "#1A2028");
      const m = new THREE.CylinderGeometry(0.12, 0.18, L * 1.25, 6); m.translate(L * 0.08, deckZ + L * 0.625, 0); add(m, "#DADCE0");
      const bm = new THREE.CylinderGeometry(0.1, 0.1, L * 0.42, 5); bm.rotateZ(Math.PI / 2); bm.translate(-L * 0.12, deckZ + 2.2, 0); add(bm, "#DADCE0");
      return LB.merge(parts);
    }
    const decks = kind === "motor" ? 1 : kind === "fly" ? 2 : kind === "super" ? 3 : 4;
    let z = deckZ, len = L * 0.62, x0 = -L * 0.05;
    for(let k = 0; k < decks; k++){
      const hgt = 2.6;
      box(len, hgt * 0.45, B * 1.6 - k * 0.5, x0, z, "#F6F6F4");
      // the tinted window band that makes a yacht look like a yacht
      box(len * 0.96, hgt * 0.38, B * 1.62 - k * 0.5, x0 + len * 0.01, z + hgt * 0.45, "#141C26");
      box(len * 1.02, 0.18, B * 1.64 - k * 0.5, x0 - len * 0.01, z + hgt * 0.83, "#F6F6F4");
      z += hgt; len *= 0.72; x0 -= L * 0.03;
    }
    if(kind !== "motor"){
      // the radar arch and mast
      box(0.5, 2.4, B * 1.2, x0 - len * 0.1, z, "#F6F6F4");
      const r = new THREE.SphereGeometry(0.7, 8, 6); r.translate(x0 - len * 0.1, z + 2.9, 0); add(r, "#EDEDEB");
    } else {
      box(len * 0.5, 0.8, B * 1.2, x0 + len * 0.1, z, "#1A2028");
    }
    if(kind === "mega"){
      // a helipad on the aft deck
      const hp = new THREE.CylinderGeometry(B * 0.85, B * 0.85, 0.2, 18); hp.translate(-L * 0.36, deckZ + 2.9, 0); add(hp, "#3A4048");
      const ring = new THREE.TorusGeometry(B * 0.6, 0.12, 4, 18); ring.rotateX(Math.PI / 2); ring.translate(-L * 0.36, deckZ + 3.05, 0); add(ring, "#F2F2F2");
    }
    if(kind === "super" || kind === "mega"){
      // a covered aft deck
      box(L * 0.2, 0.2, B * 1.6, -L * 0.32, deckZ + 2.6, "#F6F6F4");
    }
    return LB.merge(parts);
  },
  yachtModels(){
    if(this._ym) return this._ym;
    const M = (L, B, D, H0, kind) => ({ L, kind, hull:this.hull(L, B, D, H0), top:this.topsides(L, B, H0, kind) });
    return (this._ym = {
      motor:M(15, 2.3, 1.1, 1.6, "motor"), fly:M(28, 3.4, 1.6, 2.3, "fly"),
      super:M(55, 5.2, 2.6, 3.0, "super"), mega:M(88, 7.6, 3.6, 3.8, "mega"), sail:M(20, 2.6, 1.9, 1.4, "sail"),
    });
  },

  harbour(G, g, T){
    const M = this.M, rnd = mulberry(1297);
    const wet = (x, y) => !M.land(x, y) && !this.onPier(x, y);
    // pier outlines, for the "is this water or a jetty?" test
    this.pierGrid = new Map();
    for(const p of (this.piers || [])){
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for(const [x, y] of p.ring){ x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      p.bb = [x0, y0, x1, y1];
    }
    // every quay and pier edge that faces water inside the harbour is a berth
    const berths = [];
    // a berth counts only in enclosed water: from inside Port Hercule or
    // Fontvieille most directions meet a quay within a few hundred metres,
    // while from the open coast half of them run out to sea
    const encl = new Map();
    const inHarbour = (x, y) => {
      const key = Math.round(x / 20) + "," + Math.round(y / 20);
      if(encl.has(key)) return encl.get(key);
      let hits = 0;
      for(let k = 0; k < 16; k++){
        const a = k / 16 * TAU, ca = Math.cos(a), sa = Math.sin(a);
        for(let d = 10; d <= 420; d += 10){ const px = x + ca * d, py = y + sa * d;
          if(M.land(px, py) || this.onPier(px, py)){ hits++; break; } }
      }
      const ok = hits >= 13;
      encl.set(key, ok); return ok;
    };
    for(const p of (this.piers || [])){
      for(let k = 0; k < p.ring.length; k++){
        const a = p.ring[k], b = p.ring[(k + 1) % p.ring.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if(L < 8) continue;
        const nx = (b[1] - a[1]) / L, ny = -(b[0] - a[0]) / L;
        for(const sd of [1, -1]){
          const mx = (a[0] + b[0]) / 2 + nx * sd * 6, my = (a[1] + b[1]) / 2 + ny * sd * 6;
          if(wet(mx, my) && inHarbour(mx, my)) berths.push({ a, b, L, nx:nx * sd, ny:ny * sd, top:p.top, big:!p.pontoon && p.area > 1500 });
        }
      }
    }
    for(const ln of (M.line.coast || [])){
      for(let k = 0; k < ln.length - 1; k++){
        const a = ln[k], b = ln[k + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if(L < 8) continue;
        const nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L;
        for(const sd of [1, -1]){
          const mx = (a[0] + b[0]) / 2 + nx * sd * 6, my = (a[1] + b[1]) / 2 + ny * sd * 6;
          if(wet(mx, my) && inHarbour(mx, my) && M.land((a[0] + b[0]) / 2 - nx * sd * 4, (a[1] + b[1]) / 2 - ny * sd * 4))
            berths.push({ a, b, L, nx:nx * sd, ny:ny * sd, top:2.4, big:true });
        }
      }
    }
    // moor them stern-to, in tidy rows, biggest on the outer quays
    const models = this.yachtModels();
    const inst = { motor:[], fly:[], super:[], mega:[], sail:[] };
    const taken = new Map(), TK = 10;
    const free = (pts) => {
      for(const [x, y] of pts){
        if(!wet(x, y)) return false;
        const k = Math.floor(x / TK) + "," + Math.floor(y / TK);
        if(taken.get(k)) return false;
      }
      return true;
    };
    const take = (pts) => { for(const [x, y] of pts) taken.set(Math.floor(x / TK) + "," + Math.floor(y / TK), 1); };
    // and no two hulls may overlap: separating-axis test between rotated rectangles
    const PC = 60, placed = new Map();
    const boxOverlap = (A, B) => {
      const ax = [[A.ux, A.uy], [-A.uy, A.ux], [B.ux, B.uy], [-B.uy, B.ux]], dx = B.cx - A.cx, dy = B.cy - A.cy;
      for(const [x, y] of ax){
        const ra = A.hl * Math.abs(A.ux * x + A.uy * y) + A.hw * Math.abs(-A.uy * x + A.ux * y);
        const rb = B.hl * Math.abs(B.ux * x + B.uy * y) + B.hw * Math.abs(-B.uy * x + B.ux * y);
        if(Math.abs(dx * x + dy * y) > ra + rb) return false;
      }
      return true;
    };
    const clashes = (bx) => {
      const gx = Math.floor(bx.cx / PC), gy = Math.floor(bx.cy / PC);
      for(let a = -2; a <= 2; a++) for(let b = -2; b <= 2; b++){
        const l = placed.get((gx + a) + "," + (gy + b)); if(!l) continue;
        for(const o of l) if(boxOverlap(bx, o)) return true;
      }
      return false;
    };
    const keep = (bx) => { const k = Math.floor(bx.cx / PC) + "," + Math.floor(bx.cy / PC);
      let l = placed.get(k); if(!l){ l = []; placed.set(k, l); } l.push(bx); };
    for(const b of berths){
      let s = 2;
      while(s < b.L - 2){
        const r = rnd();
        let kind = b.big ? (r < 0.10 ? "mega" : r < 0.42 ? "super" : r < 0.82 ? "fly" : "sail")
                         : (r < 0.46 ? "motor" : r < 0.78 ? "fly" : "sail");
        const md = models[kind];
        const scl = kind === "mega" ? 0.85 + rnd() * 0.3 : 0.8 + rnd() * 0.45;
        const len = md.L * scl, beam = (kind === "mega" ? 7.6 : kind === "super" ? 5.2 : kind === "fly" ? 3.4 : kind === "sail" ? 2.6 : 2.3) * 2 * scl;
        const t = (s + beam / 2) / b.L;
        const px = b.a[0] + (b.b[0] - b.a[0]) * t, py = b.a[1] + (b.b[1] - b.a[1]) * t;
        // stern at the quay (a gangway's length off), bow out into the basin
        const sx = px + b.nx * 1.8, sy = py + b.ny * 1.8;
        const cx = sx + b.nx * len / 2, cy = sy + b.ny * len / 2;
        const probe = [[cx, cy], [sx + b.nx * len * 0.95, sy + b.ny * len * 0.95], [sx + b.nx * 2, sy + b.ny * 2]];
        const box = { cx, cy, hl:len / 2, hw:beam / 2 + 0.3, ux:b.nx, uy:b.ny };
        if(free(probe) && !clashes(box)){
          keep(box);
          take(probe.concat([[sx + b.nx * len * 0.5, sy + b.ny * len * 0.5]]));
          // the model's +x is the bow
          const ang = Math.atan2(b.ny, b.nx);
          const hue = rnd();
          const col = hue < 0.80 ? "#F6F6F4" : hue < 0.92 ? "#1A2A4A" : hue < 0.97 ? "#3A3E44" : "#B8BEC6";
          inst[kind].push({ x:cx, y:cy, a:ang, s:scl, col, ph:rnd() * TAU, top:b.top });
          s += beam + 1.4;
        } else s += 3;
      }
    }
    // a few boats anchored out in the bay
    for(let k = 0; k < 14; k++){
      const x = -600 + rnd() * 1400, y = 350 + rnd() * 700;
      if(!wet(x, y) || this.seaDistAt(x, y) < 120) continue;
      const kind = rnd() < 0.5 ? "super" : rnd() < 0.5 ? "mega" : "sail";
      inst[kind].push({ x, y, a:rnd() * TAU, s:0.9 + rnd() * 0.3, col:"#F6F6F4", ph:rnd() * TAU });
    }
    this.yachtSets = [];
    const obj = new THREE.Object3D();
    let total = 0;
    const hullMat = new THREE.MeshStandardMaterial({ vertexColors:true, roughness:0.22, metalness:0.1, envMapIntensity:1.3 });
    const topMat = new THREE.MeshStandardMaterial({ vertexColors:true, roughness:0.35, metalness:0.05, envMapIntensity:1.1 });
    const shareGeo = (geo, cx, cy, r) => {
      const gg = new THREE.BufferGeometry();
      for(const nm in geo.attributes) gg.setAttribute(nm, geo.attributes[nm]);
      if(geo.index) gg.setIndex(geo.index);
      gg.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, 4, cy), r);
      return gg;
    };
    for(const kind in inst){
      const md = models[kind];
      const chunks = new Map();
      for(const y of inst[kind]){ const k = Math.floor(y.x / 220) + "," + Math.floor(y.y / 220);
        let a = chunks.get(k); if(!a){ a = []; chunks.set(k, a); } a.push(y); }
      for(const list of chunks.values()){
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for(const y of list){ x0 = Math.min(x0, y.x); x1 = Math.max(x1, y.x); y0 = Math.min(y0, y.y); y1 = Math.max(y1, y.y); }
      const rad = Math.hypot(x1 - x0, y1 - y0) / 2 + md.L * 0.8;
      const hm = new THREE.InstancedMesh(shareGeo(md.hull, (x0 + x1) / 2, (y0 + y1) / 2, rad), hullMat, list.length);
      const tm = new THREE.InstancedMesh(shareGeo(md.top, (x0 + x1) / 2, (y0 + y1) / 2, rad + 20), topMat, list.length);
      list.forEach((y, i) => {
        obj.position.set(y.x, 0, y.y); obj.rotation.set(0, -y.a, 0); obj.scale.setScalar(y.s); obj.updateMatrix();
        hm.setMatrixAt(i, obj.matrix); tm.setMatrixAt(i, obj.matrix);
        hm.setColorAt(i, new THREE.Color(y.col).convertSRGBToLinear());
      });
      for(const m of [hm, tm]){ m.castShadow = true; m.receiveShadow = true; m.userData.dynamic = true; m.frustumCulled = true; g.add(m); }
      this.yachtSets.push({ list, hm, tm });
      total += list.length;
      }
    }
    // the moored boats breathe on the water: a little heave, roll and pitch
    this.anim.push((t, frame) => {
      if(frame % 2) return;
      for(const set of this.yachtSets){
        set.list.forEach((y, i) => {
          const w = t * 0.9 + y.ph;
          obj.position.set(y.x, Math.sin(w) * 0.08 * y.s, y.y);
          obj.rotation.set(Math.sin(w * 0.7) * 0.012, -y.a, Math.sin(w * 1.1 + 1) * 0.006, "YXZ");
          obj.scale.setScalar(y.s); obj.updateMatrix();
          set.hm.setMatrixAt(i, obj.matrix); set.tm.setMatrixAt(i, obj.matrix);
        });
        set.hm.instanceMatrix.needsUpdate = true; set.tm.instanceMatrix.needsUpdate = true;
      }
    });
    this.stats = Object.assign(this.stats || {}, { yachts:total, berths:berths.length });

    /* the cruise ship, along the seaward face of the Digue */
    const dig = (this.piers || []).filter(p => !p.pontoon).sort((a, b) => b.area - a.area)[0];
    if(dig){
      // the long axis of the breakwater
      let A = dig.ring[0], Bq = dig.ring[1], bd = 0;
      for(const p of dig.ring) for(const q2 of dig.ring){ const d = Math.hypot(p[0] - q2[0], p[1] - q2[1]); if(d > bd){ bd = d; A = p; Bq = q2; } }
      const ax = (Bq[0] - A[0]) / bd, ay = (Bq[1] - A[1]) / bd, mx = (A[0] + Bq[0]) / 2, my = (A[1] + Bq[1]) / 2;
      for(const sd of [1, -1]){
        const x = mx - ay * sd * 30, y = my + ax * sd * 30;
        if(wet(x, y) && this.seaDistAt(x, y) > 40){ this.cruise(G, g, x, y, Math.atan2(ay, ax)); break; }
      }
    }
    /* tenders shuttling about the basin, with a white V behind each */
    const tenders = [];
    const hc = this.harbourCentre();
    for(let k = 0; k < 7; k++){
      const r = 40 + rnd() * 90, ph = rnd() * TAU, sp = (0.05 + rnd() * 0.05) * (rnd() < 0.5 ? -1 : 1);
      tenders.push({ r, ph, sp, cx:hc[0] + (rnd() - 0.5) * 60, cy:hc[1] + (rnd() - 0.5) * 60 });
    }
    const tg = LB.merge([this.hull(7, 1.3, 0.5, 0.8), (() => { const b = new THREE.BoxGeometry(2, 0.9, 1.8); b.translate(-0.5, 1.1, 0);
      const c = new Float32Array(b.attributes.position.count * 3).fill(0.3); b.setAttribute("color", new THREE.BufferAttribute(c, 3)); return b.toNonIndexed(); })()]);
    const tmesh = new THREE.InstancedMesh(tg, new THREE.MeshStandardMaterial({ vertexColors:true, roughness:0.3 }), tenders.length);
    const wg = new THREE.PlaneGeometry(1, 1); wg.rotateX(-Math.PI / 2);
    // a wake: a white fan behind the boat
    const wp = wg.attributes.position; wp.setXYZ(0, -9, 0.05, -3.5); wp.setXYZ(1, 0, 0.05, -0.6); wp.setXYZ(2, -9, 0.05, 3.5); wp.setXYZ(3, 0, 0.05, 0.6);
    const wmesh = new THREE.InstancedMesh(wg, new THREE.MeshBasicMaterial({ map:PTEX.foam(), color:0xffffff, transparent:true,
      opacity:0.6, depthWrite:false, side:THREE.DoubleSide }), tenders.length);
    for(const m of [tmesh, wmesh]){ m.userData.dynamic = true; m.frustumCulled = false; g.add(m); }
    this.anim.push(t => {
      tenders.forEach((b, i) => {
        let a = b.ph + t * b.sp, x = b.cx + Math.cos(a) * b.r, y = b.cy + Math.sin(a) * b.r * 0.6;
        const hdg = Math.atan2(Math.cos(a) * b.r * 0.6 * b.sp, -Math.sin(a) * b.r * b.sp);
        obj.position.set(x, 0.05, y); obj.rotation.set(0, -hdg, 0); obj.scale.setScalar(1); obj.updateMatrix();
        tmesh.setMatrixAt(i, obj.matrix); wmesh.setMatrixAt(i, obj.matrix);
      });
      tmesh.instanceMatrix.needsUpdate = true; wmesh.instanceMatrix.needsUpdate = true;
    });
    // tenders must stay in water: keep their loops away from the quays
    for(const b of tenders){ for(let k = 0; k < 6; k++){ let ok = true;
      for(let a = 0; a < TAU; a += 0.4) if(!wet(b.cx + Math.cos(a) * b.r, b.cy + Math.sin(a) * b.r * 0.6)){ ok = false; break; }
      if(ok) break; b.r *= 0.7; } }

    this.harbourFront(G, g, T);
  },
  onPier(x, y){
    for(const p of (this.piers || [])){
      const b = p.bb; if(!b || x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
      let inside = false; const R = p.ring;
      for(let i = 0, j = R.length - 1; i < R.length; j = i++){
        if((R[i][1] > y) !== (R[j][1] > y) && x < (R[j][0] - R[i][0]) * (y - R[i][1]) / (R[j][1] - R[i][1]) + R[i][0]) inside = !inside;
      }
      if(inside) return true;
    }
    return false;
  },
  harbourCentre(){
    // Port Hercule: the water enclosed by the most pier length
    let sx = 0, sy = 0, n = 0;
    for(const p of (this.piers || [])) for(const [x, y] of p.ring){ sx += x; sy += y; n++; }
    return n ? [sx / n, sy / n] : [-120, 110];
  },
  cruise(G, g, x, y, ang){
    const L = 210, B = 15;
    const grp = new THREE.Group();
    const hullG = this.hull(L, B, 7, 9);
    const hm = new THREE.Mesh(hullG, new THREE.MeshStandardMaterial({ vertexColors:true, color:G.col("#F4F4F2"), roughness:0.3 }));
    grp.add(hm);
    const white = G.mat("#F6F6F4", { roughness:0.45 }), win = G.mat("#1C2A3A", { roughness:0.15, metalness:0.3 });
    for(let k = 0; k < 7; k++){
      const len = L * (0.74 - k * 0.035), z = 9 + k * 3;
      const d = new THREE.Mesh(new THREE.BoxGeometry(len, 2.1, B * 1.86 - k * 0.6), white); d.position.set(-L * 0.04, z + 1.05, 0); grp.add(d);
      const w = new THREE.Mesh(new THREE.BoxGeometry(len * 0.98, 0.8, B * 1.88 - k * 0.6), win); w.position.set(-L * 0.04, z + 1.2, 0); grp.add(w);
    }
    const fn = new THREE.Mesh(new THREE.BoxGeometry(14, 10, 8), G.mat("#1E3A6A")); fn.position.set(-L * 0.22, 35, 0); grp.add(fn);
    grp.position.set(x, 0, y); grp.rotation.y = -ang;
    grp.traverse(o => { if(o.isMesh){ o.castShadow = true; o.receiveShadow = true; o.userData.dynamic = true; } });
    g.add(grp);
  },

  /* the harbour front: the pool, the grandstands and terraces, pines and palms */
  harbourFront(G, g, T){
    const M = this.M, rnd = mulberry(4711), n = T.n;
    // the Stade Nautique Rainier III: the pool nearest the mapped point
    let pool = null, pd = Infinity;
    for(const r of (M.poly.pool || [])){
      let cx = 0, cy = 0; for(const [x, y] of r){ cx += x; cy += y; } cx /= r.length; cy /= r.length;
      const d = Math.hypot(cx - M.lm.piscine[0], cy - M.lm.piscine[1]); if(d < pd){ pd = d; pool = { r, cx, cy }; }
    }
    if(pool && pd < 80){
      // lane lines along its long axis
      let A = pool.r[0], Bq = pool.r[1], bd = 0;
      for(const p of pool.r) for(const q2 of pool.r){ const d = Math.hypot(p[0] - q2[0], p[1] - q2[1]); if(d > bd){ bd = d; A = p; Bq = q2; } }
      const ang = Math.atan2(Bq[1] - A[1], Bq[0] - A[0]);
      const z = this.ground(pool.cx, pool.cy) + 0.3;
      const lanes = [];
      for(let k = -3; k <= 3; k++) lanes.push([pool.cx - Math.sin(ang) * k * 2.5, pool.cy + Math.cos(ang) * k * 2.5, z, -ang, 1]);
      const lg = new THREE.BoxGeometry(bd * 0.7, 0.05, 0.25);
      LB.many(G, g, lg, G.glowMat("#F4F4F4", 0.2, { color:G.col("#F4F4F4") }), lanes, false);
    }
    // grandstands: on the quay between the circuit and the water, and behind the pits
    const stands = [[0.705, 0.745, -1], [0.765, 0.800, -1], [0.828, 0.852, -1], [0.955, 0.995, 1], [0.020, 0.040, -1]];
    const people = [];
    for(const [a, b, sd] of stands){
      const i0 = Math.round(a * n), i1 = Math.round(b * n);
      for(let i = i0; i < i1; i += 2){
        const back = sd > 0 ? T.half + T.pitW + 10 : T.half + T.roAt(i, sd) + 3.5;
        const x = T.x[i] + T.nx[i] * sd * back, y = T.y[i] + T.ny[i] * sd * back;
        if(!this.M.land(x, y)) continue;
        const ang = T.ang[i];
        // stand on the highest ground under it, or the hill behind the pits swallows the lower rows
        let base = T.z[i];
        for(let row = 0; row < 7; row++){
          const o = back + row * 0.9;
          base = Math.max(base, this.ground(T.x[i] + T.nx[i] * sd * o, T.y[i] + T.ny[i] * sd * o));
        }
        if(base > T.z[i] + 0.2) base += 0.8;            // the terrain mesh is coarser than ground()
        for(let row = 0; row < 7; row++){
          const o = back + row * 0.9;
          const rx = T.x[i] + T.nx[i] * sd * o, ry = T.y[i] + T.ny[i] * sd * o, rz = base + 0.4 + row * 0.62;
          if(!this.M.land(rx, ry) && row > 1) break;
          LB.box(G, g, rx, ry, T.z[i] - 1, T.ds * 2.02, 0.9, rz - T.z[i] + 1, ang, G.mat(row % 2 ? "#C8CCD2" : "#B8BEC6", { roughness:0.8 }));
          for(let s = 0; s < 4; s++) if(rnd() < 0.85)
            people.push([rx + Math.cos(ang) * (s - 1.5) * 3.2, ry + Math.sin(ang) * (s - 1.5) * 3.2, rz, -ang - Math.PI / 2 * sd, 0.95 + rnd() * 0.1]);
        }
      }
    }
    if(people.length) this.crowd(G, g, people);
    // palms and umbrella pines along the quay side of the harbour straights
    const palms = [], pines = [];
    for(let i = 0; i < n; i += 3){
      const u = i / n;
      if(!(u > 0.62 && u < 0.99)) continue;
      for(const sd of [-1, 1]){
        const o = sd * (this.rin(i, sd) + 2.5);
        const x = T.x[i] + T.nx[i] * o, y = T.y[i] + T.ny[i] * o;
        if(!this.M.land(x, y) || this.onPier(x, y)) continue;
        if(rnd() < 0.35) (rnd() < 0.75 ? palms : pines).push([x, y, this.ground(x, y), rnd() * TAU, 0.9 + rnd() * 0.3]);
      }
    }
    this.trees(G, g, { palm:palms, pine:pines, cypress:[], broad:[] });
  },

  /* ---- the tunnel under the Fairmont ----
     A proper box this time: roof slab, a solid wall on the hill side, a sea wall
     of piers and openings that lets the low sun in in slashes, portals with a lip
     at each end, and two rows of lamps. Every piece of it, and everything built
     on top, uses the dithered fade: pixels are discarded in a Bayer pattern
     rather than blended, so nothing needs sorting and nothing flickers. */
  tunnel(G, g, T){
    const n = T.n, w = T.half;
    const nodes = []; for(let i = 0; i < n; i++) if(T.inTunnel(i)) nodes.push(i);
    if(!nodes.length) return;
    this.tunnelNodes = nodes;
    const conc = G.ditherMat(G.mat("#C4BCAE", { roughness:0.92 }));
    const concDark = G.ditherMat(G.mat("#8E877C", { roughness:0.95 }));
    const lip = G.ditherMat(G.mat("#D8D0C0", { roughness:0.85 }), true);
    const lampM = G.ditherMat(G.glowMat("#FFE6B8", 2.2));
    const roofO = i => w + Math.max(T.roL[i], T.roR[i]) + 2.2;
    const inT = i => T.inTunnel(i);
    const add = (geo, mat, cast) => { if(!geo) return; const m = new THREE.Mesh(geo, mat); m.castShadow = cast !== false;
      m.receiveShadow = true; m.userData.dynamic = true; g.add(m); this.fade.push(m); return m; };
    // which side is the sea, per node
    const sea = new Int8Array(n);
    for(const i of nodes){
      const o = w + 16;
      const l = this.M.land(T.x[i] - T.nx[i] * o, T.y[i] - T.ny[i] * o), r = this.M.land(T.x[i] + T.nx[i] * o, T.y[i] + T.ny[i] * o);
      sea[i] = l && !r ? 1 : !l && r ? -1 : (this.raw(T.x[i] + T.nx[i] * o, T.y[i] + T.ny[i] * o) < this.raw(T.x[i] - T.nx[i] * o, T.y[i] - T.ny[i] * o) ? 1 : -1);
    }
    // the roof slab: its underside and its top
    add(G.strip(T, i => -roofO(i), i => roofO(i), 6.0, 6, inT), concDark, true);
    add(G.strip(T, i => -roofO(i), i => roofO(i), 6.9, 6, inT), conc, true);
    for(const sd of [-1, 1]){
      const o = i => sd * roofO(i);
      add(G.wall(T, i => sd * (roofO(i) - 0.02), 6.9, inT, 0.02), G.twoSided(conc), true);
      // the land-side wall is solid; the sea side is piers with openings
      const landSide = i => sea[i] !== sd;
      add(G.wall(T, i => sd * (roofO(i) - 0.6), 6.0, i => inT(i) && landSide(i)), G.twoSided(conc), true);
    }
    const piers = [];
    for(let k = 0; k < nodes.length; k += 2){
      const i = nodes[k], sd = sea[i], o = sd * (roofO(i) - 0.6);
      piers.push([T.x[i] + T.nx[i] * o, T.y[i] + T.ny[i] * o, T.z[i], -T.ang[i], 1]);
    }
    const pg = new THREE.BoxGeometry(3.0, 6.0, 1.1); pg.translate(0, 3.0, 0);
    const pm = LB.many(G, g, pg, G.ditherMat(G.mat("#C4BCAE", { roughness:0.92 })), piers, true);
    if(pm) this.fade.push(pm);
    // a lintel along the top of the openings
    for(const sd of [-1, 1]) add(G.wall(T, i => sd * (roofO(i) - 0.6), 6.0, i => inT(i) && sea[i] === sd, -4.4), G.twoSided(conc), true);
    // the portals: a lip across the road at each end
    for(const i of [nodes[0], nodes[nodes.length - 1]]){
      const ang = T.ang[i], z = T.z[i];
      const m = LB.box(G, g, T.x[i], T.y[i], z + 4.9, 1.6, roofO(i) * 2 + 1.4, 2.1, ang, lip);
      m.userData.dynamic = true; this.fade.push(m);
      for(const sd of [-1, 1]){
        const o = sd * (roofO(i) + 0.4);
        const p2 = LB.box(G, g, T.x[i] + T.nx[i] * o, T.y[i] + T.ny[i] * o, z, 1.6, 1.4, 7.0, ang, lip);
        p2.userData.dynamic = true; this.fade.push(p2);
      }
    }
    // the lamps: two rows of warm strips on the ceiling
    const lamps = [];
    for(const i of nodes) for(const o of [-3.2, 3.2])
      lamps.push([T.x[i] + T.nx[i] * o, T.y[i] + T.ny[i] * o, T.z[i] + 5.92, -T.ang[i], 1]);
    const lg = new THREE.BoxGeometry(3.2, 0.08, 0.35);
    const lm2 = LB.many(G, g, lg, lampM, lamps, false);
    if(lm2) this.fade.push(lm2);
    // a warm light that rides along with the leader through the tunnel: the
    // lamps sliding over the car, for the price of one light
    const L = new THREE.PointLight(G.col("#FFD9A0"), 0, 26, 2);
    L.userData.dynamic = true; g.add(L); this.tunnelLight = L;
    this.tunnelRange = [nodes[0], nodes[nodes.length - 1]];
  },

  /* ---- footbridges: barrier to barrier, on stair towers that reach the ground ---- */
  footbridges(G, g, T, list){
    const n = T.n, rnd = mulberry(818);
    const deck = G.mat("#3A3F48", { roughness:0.7, metalness:0.3 });
    const rail = G.mat("#8A96A4", { roughness:0.5, metalness:0.3 });
    const tower = G.mat("#333842");
    const ppl = [];
    for(const o of list){
      const i = Math.round(o.u * n) % n, a = T.ang[i];
      const ext = sd => {
        let e = this.rin(i, sd) + 1.4;
        if(sd === T.pitSide && T.inPitZone(i)) e = Math.max(e, T.half + T.pitW + 2.4);
        return e;
      };
      const eL = -ext(-1), eR = ext(1), len = eR - eL, mid = (eR + eL) / 2;
      const cx = T.x[i] + T.nx[i] * mid, cy = T.y[i] + T.ny[i] * mid;
      const zd = T.z[i] + 6.4;
      LB.box(G, g, cx, cy, zd, 4.4, len, 0.8, a, deck);
      for(const sd of [-1, 1]){
        // the rail and the canopy post at each edge
        const rx = cx + Math.cos(a) * sd * 2.1, ry = cy + Math.sin(a) * sd * 2.1;
        LB.box(G, g, rx, ry, zd + 0.8, 0.18, len, 1.2, a, rail);
      }
      LB.box(G, g, cx, cy, zd + 3.4, 4.8, len, 0.35, a, G.mat("#6E7A88"));
      // a stair tower at each end, standing on the ground it lands on
      for(const e of [eL - 2.6, eR + 2.6]){
        const x = T.x[i] + T.nx[i] * e, y = T.y[i] + T.ny[i] * e;
        let lo = Infinity;
        for(const [dx, dy] of [[0, 0], [2, 2], [-2, 2], [2, -2], [-2, -2]])
          lo = Math.min(lo, this.ground(x + dx, y + dy));
        const base = Math.min(lo, zd - 3) - 0.6;
        LB.box(G, g, x, y, base, 4.4, 4.4, zd + 0.8 - base, a, tower);
      }
      for(let k = 0; k < 12; k++)
        ppl.push([cx + T.nx[i] * (rnd() - 0.5) * len * 0.8 + Math.cos(a) * (rnd() - 0.5) * 2,
                  cy + T.ny[i] * (rnd() - 0.5) * len * 0.8 + Math.sin(a) * (rnd() - 0.5) * 2, zd + 0.8, rnd() * TAU, 1]);
    }
    if(ppl.length){
      const hg = new THREE.CylinderGeometry(0.26, 0.3, 1.7, 5); hg.translate(0, 0.85, 0);
      LB.many(G, g, hg, G.mat("#7A6A78"), ppl, false);
    }
  },

  /* ---- dressing the lap: cranes, the banner, gantries, bridges, clutter ---- */
  dressing(G, g, T, S){
    const rnd = mulberry(606), n = T.n;
    // hand the generic street-circuit furniture the right context
    Object.assign(CITY, { G, T, night:T.night, rnd:mulberry(33), keepOut:[], _spots:new Map(), streetSegs:[] });
    try{ CITY.furniture(G, g, T); }catch(e){ console.warn("monaco furniture", e.message); }
    try{ CITY.adverts(G, g, T); }catch(e){ console.warn("monaco adverts", e.message); }
    // the Strip's overpass is 84 m long and 9 m up: on a hillside it lands on other roads.
    // Monaco gets its own, just wide enough for the road it crosses
    { const br = T.def.bridges; T.def.bridges = null;
      try{ CITY.blocks(G, g, T); }catch(e){ console.warn("monaco blocks", e.message); }
      finally{ T.def.bridges = br; }
      try{ this.footbridges(G, g, T, br || []); }catch(e){ console.warn("monaco footbridges", e.message); } }
    // the red telescopic TV cranes, over the hairpin, the Casino and the harbour
    for(const [u, sd, reach] of [[0.378, 1, 26], [0.262, -1, 22], [0.745, 1, 24]]){
      const i = Math.round(u * n) % n, o = sd * (this.rin(i, sd) + 6);
      const x = T.x[i] + T.nx[i] * o, y = T.y[i] + T.ny[i] * o, z = this.ground(x, y);
      const red = G.mat("#D22A22", { roughness:0.5, metalness:0.3 });
      LB.box(G, g, x, y, z, 6, 2.6, 2.4, T.ang[i], G.mat("#2A2E34"));
      LB.cyl(G, g, x, y, z + 2.4, 0.9, 0.9, 1.8, red, 10);
      const boom = new THREE.Mesh(new THREE.BoxGeometry(reach, 0.7, 0.7), red);
      const ang = Math.atan2(T.y[i] - y, T.x[i] - x);
      boom.position.set(x + Math.cos(ang) * reach * 0.42, z + 4.2 + reach * 0.32, y + Math.sin(ang) * reach * 0.42);
      boom.rotation.set(0, -ang, 0.62, "YXZ"); boom.castShadow = true; boom.userData.dynamic = true; g.add(boom);
      LB.box(G, g, x + Math.cos(ang) * reach * 0.84, y + Math.sin(ang) * reach * 0.84, z + 3.6 + reach * 0.62, 1.2, 1.0, 1.0, ang, G.mat("#16181C"));
    }
    // the MONACO banner on the outside wall of the hairpin
    { const i = Math.round(0.374 * n) % n;
      // the outside of a left-hander is +1
      const o = this.rin(i, 1) - 3.9;
      const x = T.x[i] + T.nx[i] * o, y = T.y[i] + T.ny[i] * o;
      LB.text(G, g, "MONACO", x, y, T.z[i] + 2.9, 30, 3.4, T.ang[i], "#D8202A", "#F6F6F4"); }
    // Monaco's ornate street lamps along the pavements, and the mapped ones
    const lamps = [];
    for(let i = 0; i < n; i += 5){
      if(T.inTunnel(i)) continue;
      for(const sd of [-1, 1]){ if((i / 5 + (sd > 0 ? 1 : 0)) % 2) continue;
        const o = sd * (this.rin(i, sd) - 1.0);
        lamps.push([T.x[i] + T.nx[i] * o, T.y[i] + T.ny[i] * o, T.z[i] + 0.14, 0, 1]); }
    }
    for(const [x, y] of this.M.lamps){ const q = this.near(x, y, 30); if(q && q.d < this.rin(q.i, q.side)) continue; lamps.push([x, y, this.ground(x, y), 0, 1]); }
    { const post = new THREE.CylinderGeometry(0.09, 0.14, 4.6, 6); post.translate(0, 2.3, 0);
      const head = new THREE.SphereGeometry(0.34, 8, 6); head.translate(0, 4.75, 0);
      LB.many(G, g, post, G.mat("#1E2A24", { roughness:0.5, metalness:0.5 }), lamps, false);
      LB.many(G, g, head, G.mat("#F6F2E4", { roughness:0.3 }), lamps, false); }
    // planters and flower beds along the pavements: Monaco is very manicured
    const beds = [];
    for(let i = 2; i < n; i += 9){
      if(T.inTunnel(i)) continue;
      const sd = i % 2 ? 1 : -1, o = sd * (this.rin(i, sd) - 2.2);
      beds.push([T.x[i] + T.nx[i] * o, T.y[i] + T.ny[i] * o, T.z[i] + 0.14, -T.ang[i], 1]);
    }
    { const bx = new THREE.BoxGeometry(3.2, 0.7, 1.1); bx.translate(0, 0.35, 0);
      const fl = new THREE.BoxGeometry(3.0, 0.35, 0.95); fl.translate(0, 0.85, 0);
      LB.many(G, g, bx, G.mat("#E0D6C2"), beds, false);
      LB.many(G, g, fl, G.mat("#C83A5A", { roughness:0.9 }), beds.filter((_, k) => k % 2), false);
      LB.many(G, g, fl, G.mat("#E8A030", { roughness:0.9 }), beds.filter((_, k) => !(k % 2)), false); }
    // parked cars and scooters on the side streets, behind the fences
    const cars = [], scoot = [];
    for(let cl = 0; cl <= 1; cl++) for(const line of (this.M.streets[cl] || [])){
      for(let k = 0; k < line.length - 1; k++){
        const [ax, ay] = line[k], [bx, by] = line[k + 1], L2 = Math.hypot(bx - ax, by - ay);
        const nx = -(by - ay) / (L2 || 1), ny = (bx - ax) / (L2 || 1), ang = Math.atan2(by - ay, bx - ax);
        for(let s = 3; s < L2 - 3; s += 6.5){
          if(rnd() > 0.5) continue;
          const sd = rnd() < 0.5 ? -1 : 1, off = sd * ((cl ? 7.5 : 10.5) / 2 - 1.3);
          const x = ax + (bx - ax) * s / L2 + nx * off, y = ay + (by - ay) * s / L2 + ny * off;
          const q = this.near(x, y, 60); if(!q || q.d > 180 || q.d < this.rin(q.i, q.side) + 2) continue;
          (rnd() < 0.35 ? scoot : cars).push([x, y, this.ground(x, y) + 0.12, -ang, 1]);
        }
      }
    }
    if(cars.length) CITY.cars(G, g, cars);
    if(scoot.length){ const sg = new THREE.BoxGeometry(1.8, 1.0, 0.6); sg.translate(0, 0.5, 0);
      LB.many(G, g, sg, G.mat("#D8DCE0", { roughness:0.4, metalness:0.3 }), scoot, false); }
    // luxury cars lined up outside the Casino
    if(this.M.lm.casino){
      const lux = [], [x0, y0] = this.M.lm.fountain, [x1, y1] = this.M.lm.casino;
      const ang = Math.atan2(y1 - y0, x1 - x0);
      for(let k = -3; k <= 3; k++){
        const x = x1 + Math.cos(ang) * -24 + Math.cos(ang + Math.PI / 2) * k * 3.2, y = y1 + Math.sin(ang) * -24 + Math.sin(ang + Math.PI / 2) * k * 3.2;
        const q = this.near(x, y, 30); if(q && q.d < this.rin(q.i, q.side)) continue;
        lux.push([x, y, this.ground(x, y), -ang, 1]);
      }
      const cols = ["#C8201E", "#F2C230", "#E8E8E8", "#1A1C20", "#2E6ABE"];
      cols.forEach((c, k) => { const sub = lux.filter((_, j) => j % cols.length === k);
        if(sub.length){ const b = new THREE.BoxGeometry(4.6, 1.1, 2.0); b.translate(0, 0.6, 0);
          LB.many(G, g, b, G.mat(c, { roughness:0.25, metalness:0.6 }), sub, true); } });
    }
    // the Casino gardens and fountain in the middle of the square
    if(this.M.lm.fountain){
      const [fx, fy] = this.M.lm.fountain, fz = this.ground(fx, fy);
      const lawn = new THREE.Mesh(new THREE.CircleGeometry(1, 32), G.mat("#6E9A4A", { roughness:0.95 }));
      lawn.rotation.x = -Math.PI / 2; lawn.scale.set(22, 13, 1); lawn.position.set(fx, fz + 0.2, fy); lawn.userData.dynamic = true;
      g.add(lawn);
      LB.cyl(G, g, fx, fy, fz, 5.2, 5.4, 0.8, G.mat("#EDE6D6"), 24);
      const basin = new THREE.Mesh(new THREE.CircleGeometry(4.8, 24), new THREE.MeshStandardMaterial({ color:G.col("#3AA8C8"), roughness:0.05, envMapIntensity:1.5 }));
      basin.rotation.x = -Math.PI / 2; basin.position.set(fx, fz + 0.82, fy); basin.userData.dynamic = true; g.add(basin);
      LB.cyl(G, g, fx, fy, fz + 0.8, 0.35, 0.1, 3.4, G.mat("#EAF6FA", { transparent:true, opacity:0.7 }), 8);
      const beds2 = [];
      for(let k = 0; k < 14; k++){ const a = k / 14 * TAU; beds2.push([fx + Math.cos(a) * 16, fy + Math.sin(a) * 9, fz + 0.2, a, 1]); }
      const bg = new THREE.CylinderGeometry(1.1, 1.1, 0.4, 8); bg.translate(0, 0.2, 0);
      LB.many(G, g, bg, G.mat("#D83A6A", { roughness:0.9 }), beds2, false);
    }
  },

  /* ---- every frame ---- */
  frame(S, G){
    const T = this.T; if(!T) return;
    const now = performance.now(), dt = clamp((now - (this._last || now)) / 1000, 0.001, 0.05) || 0.016;
    this._last = now; this.dt = dt;
    this.t = (this.t || 0) + dt; this.fno = (this.fno || 0) + 1;
    if(this.timeU) this.timeU.value = this.t;
    for(const f of this.anim) f(this.t, this.fno);
    // the tunnel: fade it (and the Fairmont) for the player's car, in the
    // overhead camera only, eased over about a third of a second
    const p = S.player; if(!p || !this.tunnelRange) return;
    const [a, b] = this.tunnelRange, n = T.n;
    const i = p.node, inside = T.inTunnel(i);
    const before = ((a - i) % n + n) % n * T.ds, after = ((i - b) % n + n) % n * T.ds;
    const nearIt = inside || before < 40 || after < 25;
    const want = (nearIt && !R.tv) ? 0.12 : 1;
    const k = 1 - Math.pow(0.0005, dt);
    this.fadeV = this.fadeV == null ? 1 : this.fadeV + (want - this.fadeV) * k;
    G.fadeU.value = this.fadeV;
    G.fadeEdgeU.value = Math.max(this.fadeV, 0.42);
    // inside: the lamps slide over the car, the frame darkens, the exit blazes
    const L = this.tunnelLight;
    if(L){
      if(inside){
        L.position.set(p.x, p.z + 4.8, p.y);
        L.intensity = 1.4 * (0.55 + 0.45 * Math.cos(T.s[i] / 6 * TAU));
      } else L.intensity = 0;
    }
    const gr = G.grade; if(gr){
      const toExit = ((b - i) % n + n) % n * T.ds;
      const tgt = inside ? (toExit < 70 ? 1.02 + (70 - toExit) / 70 * 0.28 : 0.86) : 1.02;
      gr.exposure += (tgt - gr.exposure) * k * 0.6;
    }
  },
};

/* ---- building the world for a session ---------------------------------- */
/* trees and their trunks stand wherever the survey put them, which includes the pit lane: take the
   tall ones out of the instanced batches within reach of it so the box and the crew can be seen */

/* ---------- Silverstone: the survey, built -------------------------------
   A wartime airfield in Northamptonshire farmland. Everything here comes off
   the baked survey (SGEO): the ground is EU-DEM, the fields are the spaces
   between the mapped hedges and lanes, the woods, car parks and campsites are
   the mapped ones, and the Wing and the grandstands stand on their mapped
   footprints. What is invented is said so where it is built. */
const SILVER = {
  get GEO(){ return SGEO; },
  WIND:0.55,                                   // one wind direction for every flag, tree and cloud

  /* ---- small tools ---- */
  rng(seed){ let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; },
  sm(t){ t = clamp(t, 0, 1); return t * t * (3 - 2 * t); },
  pip(x, y, P){
    let c = false;
    for(let i = 0, j = P.length - 1; i < P.length; j = i++){
      const a = P[i], b = P[j];
      if((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  },
  bbox(P){ let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for(const [x, y] of P){ if(x < x0) x0 = x; if(x > x1) x1 = x; if(y < y0) y0 = y; if(y > y1) y1 = y; }
    return { x0, y0, x1, y1 }; },
  area(P){ let a = 0; for(let i = 0; i < P.length; i++){ const p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; },
  // the rectangle a footprint fills best, tried along each of its own edges
  obb(P){
    let best = null; const cx0 = P.reduce((s, p) => s + p[0], 0) / P.length, cy0 = P.reduce((s, p) => s + p[1], 0) / P.length;
    for(let i = 0; i < P.length; i++){
      const a = P[i], b = P[(i + 1) % P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if(L < 0.5) continue;
      const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      for(const [x, y] of P){ const u = (x - cx0) * ux + (y - cy0) * uy, v = -(x - cx0) * uy + (y - cy0) * ux;
        u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
      const ar = (u1 - u0) * (v1 - v0);
      if(!best || ar < best.ar){
        const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
        best = { ar, ang:Math.atan2(uy, ux), l:u1 - u0, w:v1 - v0, cx:cx0 + cu * ux - cv * uy, cy:cy0 + cu * uy + cv * ux, ux, uy };
      }
    }
    if(best.w > best.l){ const t = best.l; best.l = best.w; best.w = t; best.ang += Math.PI / 2;
      const ux = best.ux; best.ux = -best.uy; best.uy = ux; }
    return best;
  },

  /* ---- where is the circuit from here? A raster of the nearest node, so a
     hundred thousand ground samples do not each search the whole lap ---- */
  distRaster(T){
    const C = 10, R = 260, b = T.bounds;
    const X0 = b.minX - R - C, Y0 = b.minY - R - C, nx = Math.ceil((b.w + 2 * R) / C) + 3, ny = Math.ceil((b.h + 2 * R) / C) + 3;
    const idx = new Int32Array(nx * ny).fill(-1), dd = new Float32Array(nx * ny).fill(1e9), rc = Math.ceil(R / C);
    for(let i = 0; i < T.n; i++){
      const cx = Math.floor((T.x[i] - X0) / C), cy = Math.floor((T.y[i] - Y0) / C);
      for(let r = -rc; r <= rc; r++){ const yy = cy + r; if(yy < 0 || yy >= ny) continue;
        for(let c = -rc; c <= rc; c++){ const xx = cx + c; if(xx < 0 || xx >= nx) continue;
          const k = yy * nx + xx, wx = X0 + (xx + 0.5) * C - T.x[i], wy = Y0 + (yy + 0.5) * C - T.y[i], d = wx * wx + wy * wy;
          if(d < dd[k]){ dd[k] = d; idx[k] = i; } } }
    }
    this.DR = { C, X0, Y0, nx, ny, idx };
  },
  near(x, y){
    const D = this.DR, T = this.T, n = T.n;
    const cx = Math.floor((x - D.X0) / D.C), cy = Math.floor((y - D.Y0) / D.C);
    if(cx < 0 || cy < 0 || cx >= D.nx || cy >= D.ny) return null;
    const i0 = D.idx[cy * D.nx + cx]; if(i0 < 0) return null;
    let res = null;
    for(let q = -4; q <= 3; q++){
      const j = (i0 + q + n) % n, k = (j + 1) % n;
      const ax = T.x[j], ay = T.y[j], dx = T.x[k] - ax, dy = T.y[k] - ay, l2 = dx * dx + dy * dy || 1;
      const t = clamp(((x - ax) * dx + (y - ay) * dy) / l2, 0, 1), px = ax + dx * t, py = ay + dy * t, d = Math.hypot(x - px, y - py);
      if(!res || d < res.d){
        const side = ((x - px) * T.nx[j] + (y - py) * T.ny[j]) >= 0 ? 1 : -1;
        res = { i:t < 0.5 ? j : k, d, side, z:T.z[j] + (T.z[k] - T.z[j]) * t };
      }
    }
    return res;
  },
  // where the painted bands beside the track stop, on that side
  edge(i, side){ const T = this.T; return T.half + (side < 0 ? T.roL[i] : T.roR[i]) + 6; },

  /* ---- the ground ---- */
  // spectator banks: grass mounds behind the run-off where the crowds stand
  BANKS:[ { a:0.474, b:0.528, sd:-1, h:4.2, n:"Copse" }, { a:0.590, b:0.660, sd:-1, h:3.6, n:"Becketts" },
          { a:0.800, b:0.858, sd:-1, h:4.4, n:"Stowe" }, { a:0.925, b:0.985, sd:-1, h:3.8, n:"Club" },
          { a:0.565, b:0.640, sd:1, h:3.0, n:"Maggotts" } ],
  bankAt(q){
    if(!q) return 0;
    const u = q.i / this.T.n;
    for(const B of this.BANKS){
      if(q.side !== B.sd || u < B.a || u > B.b) continue;
      const e = this.edge(q.i, q.side), d = q.d - e;
      const along = Math.min((u - B.a) / 0.012, (B.b - u) / 0.012);
      const up = this.sm((d - 8) / 22), down = 1 - this.sm((d - 52) / 24);
      return B.h * up * down * this.sm(along);
    }
    return 0;
  },
  ground(x, y){
    const base = this.GEO.dem(x, y), q = this.near(x, y);
    if(!q) return base;
    const e = this.edge(q.i, q.side);
    // the ground beside the track follows the banking, so a banked corner is not buried in its own verge
    // (on a banked circuit it sits a little deeper, as the 8 m grid cannot follow the curve of the bowl)
    const road = q.z + bankZ(this.T, q.i, q.side * Math.min(q.d, e)) - (this.T.bankZf ? 0.9 : 0.22);
    if(q.d < e + 1.5) return road;
    // the verge eases from the road's own level back out to the farmland
    const t = this.sm((q.d - e - 1.5) / 55);
    return road + (base - road) * t + this.bankAt(q);
  },

  /* ---- the ground, painted ----
     One canvas for the circuit and its surroundings, one coarser one out to
     the horizon. The fields are not invented: they are the spaces the mapped
     hedges, lanes and woods leave between them, flood-filled, and each one
     gets its own crop and its own tractor lines. Inside the circuit, wherever
     the map has no grass, it is the old runway and perimeter-track concrete. */
  CROPS:[
    { c:[123, 94, 69],  amp:0.10, sp:3.2, n:"ploughed" },
    { c:[201, 180, 126],amp:0.07, sp:5.5, n:"stubble" },
    { c:[111, 154, 74], amp:0.06, sp:11,  n:"pasture" },
    { c:[85, 122, 58],  amp:0.11, sp:18,  n:"wheat, tramlined" },
    { c:[184, 165, 90], amp:0.06, sp:7,   n:"barley" },
    { c:[141, 170, 88], amp:0.08, sp:9,   n:"young crop" },
    { c:[96, 138, 64],  amp:0.05, sp:13,  n:"grazing" },
  ],
  LANDCOL:{ grass:"#7AA04E", meadow:"#88A65A", wood:"#3D5A2F", scrub:"#5F7B41", parking:"#8C9864", camp:"#80A253",
            town:"#8E9C78", water:"#4E6E80", works:"#9C9C96", yard:"#8C7C60", golf:"#70AC4C", pitch:"#6FA84A", sand:"#CDBB8E" },
  paintArea(X0, Y0, W, H, px, fine){
    const T = this.T, D = this.GEO, cw = Math.round(W / px), ch = Math.round(H / px);
    const mk = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
    const L = mk(cw, ch), g = L.getContext("2d", { willReadFrequently:true });
    const P = (x, y) => [(x - X0) / px, (y - Y0) / px];
    const path = (pts, close) => { g.beginPath(); pts.forEach((p, i) => { const [a, b] = P(p[0], p[1]); i ? g.lineTo(a, b) : g.moveTo(a, b); }); if(close) g.closePath(); };
    g.fillStyle = "#000"; g.fillRect(0, 0, cw, ch);
    // green: inside the circuit
    const lap = []; for(let i = 0; i < T.n; i++) lap.push([T.x[i], T.y[i]]);
    g.fillStyle = "rgb(0,255,0)"; path(lap, true); g.fill();
    g.globalCompositeOperation = "lighter";
    // red: what divides one field from the next; blue: what nothing else may stand on
    g.lineCap = "round"; g.lineJoin = "round";
    const W2 = { major:12, minor:7, service:5, track:3 };
    for(const k in D.roads){ g.strokeStyle = k === "track" ? "rgb(255,0,0)" : "rgb(255,0,255)"; g.lineWidth = Math.max(1, W2[k] / px);
      for(const r of D.roads[k]){ path(r); g.stroke(); } }
    g.strokeStyle = "rgb(255,0,0)"; g.lineWidth = Math.max(1, 3 / px);
    for(const r of D.lines.hedge){ path(r); g.stroke(); }
    for(const k in D.land){ for(const r of D.land[k]){ path(r, true);
      g.lineWidth = Math.max(1, 1.5 / px); g.strokeStyle = "rgb(255,0,0)"; g.stroke();
      if(k === "water" || k === "wood"){ g.fillStyle = "rgb(0,0,255)"; g.fill(); } } }
    g.fillStyle = "rgb(255,0,255)";
    for(const b of D.blds){ path(b.pts, true); g.fill(); }
    // the circuit and its run-off
    for(let i = 0; i < T.n; i++){
      const j = (i + 1) % T.n, ol = -(T.half + T.roL[i] + 6.5), or = T.half + T.roR[i] + 6.5;
      const olj = -(T.half + T.roL[j] + 6.5), orj = T.half + T.roR[j] + 6.5;
      path([[T.x[i] + T.nx[i] * ol, T.y[i] + T.ny[i] * ol], [T.x[i] + T.nx[i] * or, T.y[i] + T.ny[i] * or],
            [T.x[j] + T.nx[j] * orj, T.y[j] + T.ny[j] * orj], [T.x[j] + T.nx[j] * olj, T.y[j] + T.ny[j] * olj]], true); g.fill();
    }
    g.globalCompositeOperation = "source-over";
    const id = g.getImageData(0, 0, cw, ch).data, N = cw * ch;
    const lab = new Int32Array(N).fill(-1), inside = new Uint8Array(N), occ = new Uint8Array(N);
    for(let k = 0; k < N; k++){ inside[k] = id[k * 4 + 1] > 128; occ[k] = id[k * 4 + 2] > 128 ? 1 : 0; if(id[k * 4] > 128) lab[k] = -2; }
    // flood fill the fields
    let nl = 0; const stack = new Int32Array(N); const areas = [];
    for(let k = 0; k < N; k++){
      if(lab[k] !== -1) continue;
      let sp = 0; stack[sp++] = k; lab[k] = nl; let a = 0;
      while(sp){ const q = stack[--sp]; a++;
        const x = q % cw, y = (q / cw) | 0;
        if(x > 0 && lab[q - 1] === -1){ lab[q - 1] = nl; stack[sp++] = q - 1; }
        if(x < cw - 1 && lab[q + 1] === -1){ lab[q + 1] = nl; stack[sp++] = q + 1; }
        if(y > 0 && lab[q - cw] === -1){ lab[q - cw] = nl; stack[sp++] = q - cw; }
        if(y < ch - 1 && lab[q + cw] === -1){ lab[q + cw] = nl; stack[sp++] = q + cw; } }
      areas.push(a * px * px); nl++;
    }
    // every field its crop, its direction and its own slight shade
    const R = this.rng(4242), fld = [];
    for(let l = 0; l < nl; l++){
      const cr = this.CROPS[Math.floor(R() * this.CROPS.length)];
      fld.push({ cr, a:0.4 + Math.floor(R() * 4) * Math.PI / 4 + (R() - 0.5) * 0.2, k:0.92 + R() * 0.16, big:areas[l] > 6000 });
    }
    const C = mk(cw, ch), cg = C.getContext("2d"), img = cg.createImageData(cw, ch), o = img.data;
    const hn = (x, y) => { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s - Math.floor(s); };
    const vn = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      return (hn(xi, yi) * (1 - u) + hn(xi + 1, yi) * u) * (1 - v) + (hn(xi, yi + 1) * (1 - u) + hn(xi + 1, yi + 1) * u) * v; };
    for(let y = 0; y < ch; y++) for(let x = 0; x < cw; x++){
      const k = y * cw + x, wx = X0 + (x + 0.5) * px, wy = Y0 + (y + 0.5) * px;
      const nz = vn(wx / 40, wy / 40) * 0.6 + vn(wx / 9, wy / 9) * 0.4;
      let r, gg, b;
      const l = lab[k];
      if(l < 0){ r = 98; gg = 128; b = 66; }
      else if(this.AIRFIELD !== false && inside[k] && fld[l].big){
        // old runway concrete: patched, stained, the joints in it, weeds where it has cracked
        const ca = 0.4, u = wx * Math.cos(ca) + wy * Math.sin(ca), v = -wx * Math.sin(ca) + wy * Math.cos(ca);
        const joint = (u / 7.5 - Math.floor(u / 7.5)) < 0.16 || (v / 7.5 - Math.floor(v / 7.5)) < 0.16;
        const tar = vn(wx / 9 + 50, wy / 9) > 0.86, weed = vn(wx / 5 + 9, wy / 5) > 0.84;
        const s = 0.88 + nz * 0.2 - (joint ? 0.07 : 0);
        r = 168 * s; gg = 166 * s; b = 156 * s;
        if(tar){ r *= 0.8; gg *= 0.8; b *= 0.82; }
        if(weed){ r = r * 0.6 + 40; gg = gg * 0.6 + 62; b = b * 0.6 + 26; }
      } else if(this.AIRFIELD !== false && inside[k]){ r = 118; gg = 156; b = 76; const m = Math.sin((wx * 0.7 + wy * 0.7) / 6) > 0 ? 1.05 : 0.95; r *= m; gg *= m; b *= m; }
      else {
        const F = fld[l], cr = F.cr, u = wx * Math.cos(F.a) + wy * Math.sin(F.a);
        const st = Math.sin(u / cr.sp * Math.PI * 2);
        // tramlines: a darker pair every 20 m in the tall crops
        const tram = cr.sp > 15 ? ((u / 20 - Math.floor(u / 20)) < 0.08 ? -0.18 : 0) : 0;
        const s = F.k * (1 + st * cr.amp + tram) * (0.9 + nz * 0.2);
        r = cr.c[0] * s; gg = cr.c[1] * s; b = cr.c[2] * s;
      }
      o[k * 4] = r; o[k * 4 + 1] = gg; o[k * 4 + 2] = b; o[k * 4 + 3] = 255;
    }
    cg.putImageData(img, 0, 0);
    // the final picture, finer, with the mapped land and the roads on top
    const up = fine ? 2 : 1, F = mk(cw * up, ch * up), fg = F.getContext("2d");
    fg.imageSmoothingEnabled = true; fg.drawImage(C, 0, 0, cw * up, ch * up);
    const fp = px / up, Q = (x, y) => [(x - X0) / fp, (y - Y0) / fp];
    const fpath = (pts, close) => { fg.beginPath(); pts.forEach((p, i) => { const [a, b] = Q(p[0], p[1]); i ? fg.lineTo(a, b) : fg.moveTo(a, b); }); if(close) fg.closePath(); };
    const pat = (col, kind) => {
      const t = document.createElement("canvas"); t.width = t.height = 32; const tg = t.getContext("2d"), r2 = this.rng(hashStr(col + kind));
      tg.fillStyle = col; tg.fillRect(0, 0, 32, 32);
      for(let i = 0; i < 160; i++){ tg.fillStyle = shade(col, (r2() - 0.5) * (kind === "asphalt" ? 0.06 : 0.14)); tg.fillRect(r2() * 32, r2() * 32, 1 + r2() * 2, 1 + r2() * 2); }
      return fg.createPattern(t, "repeat"); };
    for(const k of ["grass", "meadow", "golf", "pitch", "scrub", "town", "yard", "works", "sand", "beach", "parking", "camp", "wood", "water"]){
      const rs = D.land[k]; if(!rs) continue;
      fg.fillStyle = pat(this.LANDCOL[k], k === "water" ? "water" : k === "works" || k === "yard" ? "asphalt" : "grass");
      for(const r of rs){ fpath(r, true); fg.fill(); }
      if(k === "grass" || k === "golf" || k === "pitch"){
        // mowing stripes, the way every bit of grass at a Grand Prix is cut
        fg.save(); for(const r of rs){ fpath(r, true); } fg.clip();
        fg.fillStyle = "rgba(255,255,255,.06)";
        for(let s = -4000; s < 4000; s += 12){ const [a1, b1] = Q(s, -3000), [a2, b2] = Q(s + 6, -3000), [a3, b3] = Q(s + 6 + 3000, 3000), [a4, b4] = Q(s + 3000, 3000);
          fg.beginPath(); fg.moveTo(a1, b1); fg.lineTo(a2, b2); fg.lineTo(a3, b3); fg.lineTo(a4, b4); fg.fill(); }
        fg.restore();
      }
      if(k === "parking"){
        // the grass car parks are worn into lanes by the queues
        fg.strokeStyle = "rgba(120,100,70,.35)"; fg.lineWidth = 2.2 / fp;
        for(const r of rs){ fpath(r, true); fg.save(); fg.clip(); const bb = this.bbox(r);
          for(let s = bb.y0; s < bb.y1; s += 13){ const [a1, b1] = Q(bb.x0, s), [a2, b2] = Q(bb.x1, s); fg.beginPath(); fg.moveTo(a1, b1); fg.lineTo(a2, b2); fg.stroke(); }
          fg.restore(); }
      }
    }
    // the spectator banks are mown grass, whatever the field behind them is
    fg.fillStyle = pat("#7EA452", "grass");
    for(const B of this.BANKS){
      const i0 = Math.round(B.a * T.n), i1 = Math.round(B.b * T.n), L1 = [], L2 = [];
      for(let i = i0; i <= i1; i++){ const e = this.edge(i, B.sd);
        for(const [arr, d] of [[L1, e + 2], [L2, e + 78]]){ const o = B.sd * d; arr.push([T.x[i] + T.nx[i] * o, T.y[i] + T.ny[i] * o]); } }
      fpath(L1.concat(L2.reverse()), true); fg.fill();
    }
    fg.lineCap = "round"; fg.lineJoin = "round";
    fg.strokeStyle = "#3C582B"; fg.lineWidth = 3 / fp;
    for(const r of D.lines.hedge){ fpath(r); fg.stroke(); }
    const RCOL = { major:["#4A4C50", 11], minor:["#5A5C60", 6.5], service:["#727472", 4.5], track:["#9A8A6C", 3] };
    for(const k of ["track", "service", "minor", "major"]){
      fg.strokeStyle = RCOL[k][0]; fg.lineWidth = RCOL[k][1] / fp;
      for(const r of D.roads[k]){ fpath(r); fg.stroke(); }
    }
    // the A43's centre line, and the old runways' faded centre lines and numbers
    fg.setLineDash([6 / fp, 9 / fp]); fg.strokeStyle = "rgba(240,240,236,.7)"; fg.lineWidth = 0.4 / fp;
    for(const r of D.roads.major){ fpath(r); fg.stroke(); }
    fg.setLineDash([18 / fp, 14 / fp]); fg.strokeStyle = "rgba(244,244,238,.38)"; fg.lineWidth = 1.1 / fp;
    this.runways = [];
    for(const r of D.roads.service){
      let len = 0; for(let i = 1; i < r.length; i++) len += Math.hypot(r[i][0] - r[i - 1][0], r[i][1] - r[i - 1][1]);
      const ch2 = Math.hypot(r[r.length - 1][0] - r[0][0], r[r.length - 1][1] - r[0][1]);
      const mid = r[Math.floor(r.length / 2)];
      if(this.AIRFIELD !== false && len > 240 && ch2 / len > 0.97 && this.pip(mid[0], mid[1], lap)){ fpath(r); fg.stroke(); this.runways.push(r); }
    }
    fg.setLineDash([]);
    fg.fillStyle = "rgba(244,244,238,.45)"; fg.textAlign = "center"; fg.textBaseline = "middle";
    for(const r of this.runways){
      const a = r[0], b = r[r.length - 1], ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const hd = Math.round(((ang * 180 / Math.PI + 90) % 360 + 360) % 360 / 10) || 36;
      for(const [p, q2, num] of [[a, b, hd], [b, a, (hd + 18 - 1) % 36 + 1]]){
        const d = Math.hypot(q2[0] - p[0], q2[1] - p[1]), x = p[0] + (q2[0] - p[0]) * 26 / d, y = p[1] + (q2[1] - p[1]) * 26 / d;
        const [sx, sy] = Q(x, y); fg.save(); fg.translate(sx, sy); fg.rotate(Math.atan2(q2[1] - p[1], q2[0] - p[0]) + Math.PI / 2);
        fg.font = "700 " + (14 / fp).toFixed(0) + "px 'Saira Condensed',sans-serif"; fg.fillText(String(num).padStart(2, "0"), 0, 0); fg.restore();
      }
    }
    return { canvas:F, X0, Y0, W, H, px, cw, ch, occ, inside };
  },
  paint(T){
    const b = T.bounds, m = 520;
    this.inner = { X0:b.minX - m, Y0:b.minY - m, W:b.w + 2 * m, H:b.h + 2 * m };
    const I = this.inner, px = Math.max(I.W, I.H) / 2048;
    this.inn = this.paintArea(I.X0, I.Y0, I.W, I.H, px, true);
    const E = 2600 * T.worldScale;
    this.out = this.paintArea(-E, -E, 2 * E, 2 * E, 2 * E / 900, false);
  },
  // is this spot free to put something on: not a road, a building, the track, water or a wood
  free(x, y){
    const A = this.inn, c = Math.floor((x - A.X0) / A.px), r = Math.floor((y - A.Y0) / A.px);
    if(c < 0 || r < 0 || c >= A.cw || r >= A.ch) return true;
    return !A.occ[r * A.cw + c];
  },
  inCircuit(x, y){
    const A = this.inn, c = Math.floor((x - A.X0) / A.px), r = Math.floor((y - A.Y0) / A.px);
    if(c < 0 || r < 0 || c >= A.cw || r >= A.ch) return false;
    return !!A.inside[r * A.cw + c];
  },

  /* ---- the sky's textures: one tileable cloud field drives the clouds
     overhead, their shadows on the fields and how hazy the sun is ---- */
  cloudField(){
    if(this._cloud) return this._cloud;
    const N = 256, data = new Float32Array(N * N), R = this.rng(77);
    const oct = [[8, 0.5], [16, 0.27], [32, 0.15], [64, 0.08]];
    for(const [f, amp] of oct){
      const g = new Float32Array((f + 1) * (f + 1)); for(let k = 0; k < g.length; k++) g[k] = R();
      for(let y = 0; y <= f; y++){ g[y * (f + 1) + f] = g[y * (f + 1)]; } for(let x = 0; x <= f; x++){ g[f * (f + 1) + x] = g[x]; }
      for(let y = 0; y < N; y++) for(let x = 0; x < N; x++){
        const fx = x / N * f, fy = y / N * f, xi = Math.floor(fx), yi = Math.floor(fy), u = fx - xi, v = fy - yi;
        const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v), W = f + 1;
        data[y * N + x] += amp * ((g[yi * W + xi] * (1 - su) + g[yi * W + xi + 1] * su) * (1 - sv) + (g[(yi + 1) * W + xi] * (1 - su) + g[(yi + 1) * W + xi + 1] * su) * sv);
      }
    }
    const cv = document.createElement("canvas"); cv.width = cv.height = N;
    const cg = cv.getContext("2d"), im = cg.createImageData(N, N);
    for(let k = 0; k < N * N; k++){ const v = clamp(data[k], 0, 1) * 255; im.data[k * 4] = im.data[k * 4 + 1] = im.data[k * 4 + 2] = v; im.data[k * 4 + 3] = 255; }
    cg.putImageData(im, 0, 0);
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return (this._cloud = { t, data, N });
  },
  cloudAt(x, y){
    const C = this.cloudField(), o = this.U.off.value, N = C.N;
    const fx = (((x + o.x) / 1400) % 1 + 1) % 1 * N, fy = (((y + o.y) / 1400) % 1 + 1) % 1 * N;
    return C.data[(Math.floor(fy) % N) * N + (Math.floor(fx) % N)];
  },
  detailTex(){
    if(this._det) return this._det;
    const N = 128, cv = document.createElement("canvas"); cv.width = cv.height = N;
    const g = cv.getContext("2d"), im = g.createImageData(N, N), R = this.rng(5);
    for(let k = 0; k < N * N; k++){ const v = 128 + (R() - 0.5) * 70 + (R() < 0.04 ? -40 : 0); im.data[k * 4] = im.data[k * 4 + 1] = im.data[k * 4 + 2] = v; im.data[k * 4 + 3] = 255; }
    g.putImageData(im, 0, 0);
    // blur it once so it reads as grass and grit, not as television static
    g.globalAlpha = 0.5; g.drawImage(cv, 1, 0); g.drawImage(cv, 0, 1); g.globalAlpha = 1;
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
    return (this._det = t);
  },
  groundMat(tex){
    const m = new THREE.MeshStandardMaterial({ map:tex, roughness:0.97, metalness:0, envMapIntensity:0.35 });
    const U = this.U;
    m.onBeforeCompile = sh => {
      sh.uniforms.uCloud = U.cloud; sh.uniforms.uCloudOff = U.off; sh.uniforms.uCloudAmt = U.amt; sh.uniforms.uDetail = U.detail;
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vSW;")
        .replace("#include <project_vertex>", "#include <project_vertex>\n  vSW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>",
        "#include <common>\nvarying vec3 vSW;\nuniform sampler2D uCloud;\nuniform sampler2D uDetail;\nuniform vec2 uCloudOff;\nuniform float uCloudAmt;")
        .replace("#include <map_fragment>", `#include <map_fragment>
  float sDt = texture2D(uDetail, vSW.xz / 6.0).r * 0.55 + texture2D(uDetail, vSW.xz / 37.0).r * 0.45;
  diffuseColor.rgb *= 0.80 + sDt * 0.40;
  float sCl = texture2D(uCloud, (vSW.xz + uCloudOff) / 1400.0).r;
  diffuseColor.rgb *= 1.0 - uCloudAmt * smoothstep(0.50, 0.70, sCl);`);
    };
    m.customProgramCacheKey = () => "silvGround";
    return m;
  },
  terrainMesh(G, g, A, step, hole){
    const nx = Math.ceil(A.W / step), ny = Math.ceil(A.H / step);
    const geo = new THREE.PlaneGeometry(A.W, A.H, nx, ny); geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, cx = A.X0 + A.W / 2, cy = A.Y0 + A.H / 2;
    for(let i = 0; i < pos.count; i++){
      const wx = pos.getX(i) + cx, wy = pos.getZ(i) + cy;
      let h = this.ground(wx, wy);
      if(hole && wx > hole.X0 && wx < hole.X0 + hole.W && wy > hole.Y0 && wy < hole.Y0 + hole.H) h -= 5;
      pos.setXYZ(i, wx, h, wy);
    }
    geo.computeVertexNormals(); geo.computeBoundingSphere();
    const tex = new THREE.CanvasTexture(A.canvas); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 8;
    const m = new THREE.Mesh(geo, this.groundMat(tex)); m.receiveShadow = true; m.userData.dynamic = true;
    (this.groundMats = this.groundMats || []).push(m.material);
    g.add(m); return m;
  },
  terrain(G, g, T){
    const I = this.inner, step = 8;
    this.terrainMesh(G, g, Object.assign({ canvas:this.inn.canvas }, I), step, null);
    const O = this.out, sh = { X0:I.X0 + 50, Y0:I.Y0 + 50, W:I.W - 100, H:I.H - 100 };
    this.terrainMesh(G, g, { canvas:O.canvas, X0:O.X0, Y0:O.Y0, W:O.W, H:O.H }, 40, sh);
  },

  /* the sky: a big British one, pale blue showing through heaps of grey-white cloud */
  sky(G, g, T){
    const lin = c => new THREE.Color(c).convertSRGBToLinear();
    this.skyU = { uCloud:this.U.cloud, uOff:this.U.off, uTop:{ value:lin("#6F93BE") }, uHor:{ value:lin("#D6DCE0") }, uDark:this.U.dark };
    const mat = new THREE.ShaderMaterial({ uniforms:this.skyU, side:THREE.BackSide, depthWrite:false, fog:false,
      vertexShader:"varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader:`varying vec3 vD; uniform sampler2D uCloud; uniform vec2 uOff; uniform vec3 uTop; uniform vec3 uHor; uniform float uDark;
void main(){
  float h = max(vD.y, 0.0);
  vec3 col = mix(uHor, uTop, pow(h, 0.55));
  vec2 p = vD.xz / (vD.y + 0.10) * 700.0 + uOff;
  float c = texture2D(uCloud, p / 2800.0).r * 0.62 + texture2D(uCloud, p / 760.0).r * 0.38;
  float cov = smoothstep(0.40 - uDark * 0.25, 0.70, c) * smoothstep(0.0, 0.10, vD.y);
  vec3 cc = mix(vec3(0.95, 0.95, 0.96), vec3(0.58, 0.61, 0.66), smoothstep(0.55, 0.92, c));
  col = mix(col, cc, cov);
  gl_FragColor = vec4(col * (1.0 - uDark * 0.45), 1.0);
}` });
    const m = new THREE.Mesh(new THREE.SphereGeometry(5200, 32, 16), mat);
    m.frustumCulled = false; m.renderOrder = -10; m.userData.dynamic = true; g.add(m); this.skyM = m;
  },
  // the clouds' shadows across the circuit itself: a multiply pass over the run-off and the road
  cloudOver(G, g, T){
    const w = T.half, geo = G.strip(T, i => -(w + T.roL[i] + 6), i => w + T.roR[i] + 6, (G.roadLift || 0.1) + 0.11, 9);
    if(!geo) return;
    const mat = new THREE.ShaderMaterial({ uniforms:{ uCloud:this.U.cloud, uOff:this.U.off, uAmt:this.U.amt },
      transparent:true, depthWrite:false, blending:THREE.MultiplyBlending, fog:false,
      vertexShader:"varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
      fragmentShader:"varying vec3 vW; uniform sampler2D uCloud; uniform vec2 uOff; uniform float uAmt;\nvoid main(){ float c = texture2D(uCloud, (vW.xz + uOff) / 1400.0).r; gl_FragColor = vec4(vec3(1.0 - uAmt * smoothstep(0.50, 0.70, c)), 1.0); }" });
    const m = new THREE.Mesh(geo, mat); m.renderOrder = 2; m.userData.dynamic = true; g.add(m);
  },

  /* ---- woods, hedgerows and the trees along them ---- */
  swayMat(col, rough){
    const m = new THREE.MeshStandardMaterial({ color:G3.col(col || "#FFFFFF"), roughness:rough || 0.9, metalness:0, flatShading:true });
    const U = this.U, W = this.WIND;
    m.onBeforeCompile = sh => {
      sh.uniforms.uTime = U.time;
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uTime;")
        .replace("#include <begin_vertex>", `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec3 sIp = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  float sSw = (sin(uTime * 1.25 + sIp.x * 0.05 + sIp.z * 0.07) * 0.6 + sin(uTime * 2.9 + sIp.x * 0.11) * 0.25) * 0.07 * max(position.y - 0.7, 0.0);
  transformed.x += sSw * ${Math.cos(W).toFixed(3)}; transformed.z += sSw * ${Math.sin(W).toFixed(3)};
#endif`);
    };
    m.customProgramCacheKey = () => "silvSway";
    return m;
  },
  treeGeos(){
    if(this._tg) return this._tg;
    const crownHi = new THREE.IcosahedronGeometry(1, 1); crownHi.scale(1, 0.92, 1); crownHi.translate(0, 1.75, 0);
    const crownLo = new THREE.IcosahedronGeometry(1, 0); crownLo.scale(1.05, 0.9, 1.05); crownLo.translate(0, 1.75, 0);
    const trunk = new THREE.BoxGeometry(0.16, 1.1, 0.16); trunk.translate(0, 0.55, 0);
    const poplar = new THREE.ConeGeometry(0.38, 3.2, 6); poplar.translate(0, 2.3, 0);
    const hedge = new THREE.BoxGeometry(1, 1, 1); hedge.translate(0, 0.5, 0);
    // a hedge is never a clean box: knock the top about a little
    { const p = hedge.attributes.position; for(let i = 0; i < p.count; i++) if(p.getY(i) > 0.9) p.setY(i, 0.85 + (i * 0.37 % 1) * 0.3); hedge.computeVertexNormals(); }
    return (this._tg = { crownHi, crownLo, trunk, poplar, hedge });
  },
  GREENS:["#4E7A36", "#5A8A3E", "#46703A", "#618C44", "#3E6430", "#6E9246", "#55803C", "#8A9A3E", "#A89A3A"],
  vegetation(G, g, T){
    const R = this.rng(31337), TG = this.treeGeos(), D = this.GEO;
    const near = [], far = [], trunks = [], pops = [], hedges = [];
    const tint = () => { const r = R(); return this.GREENS[r < 0.05 ? 7 + Math.floor(R() * 2) : Math.floor(R() * 7)]; };
    const okTree = (x, y) => { const q = this.near(x, y); return !q || q.d > this.edge(q.i, q.side) + 6; };
    const put = (x, y, h, kind) => {
      if(!okTree(x, y)) return;
      const z = this.ground(x, y), s = h / 2.9, q = this.near(x, y), close = q && q.d < 650;
      if(kind === "poplar"){ pops.push([x, y, z, R() * TAU, s * 0.9, s * 1.3, "#4A7234"]); trunks.push([x, y, z, 0, s, s]); return; }
      (close ? near : far).push([x, y, z, R() * TAU, s * (0.9 + R() * 0.3), s, tint()]);
      if(close) trunks.push([x, y, z, 0, s, s]);
    };
    // the woods, filled
    for(const P of (D.land.wood || []).concat(D.land.scrub || [])){
      const bb = this.bbox(P), scrub = (D.land.scrub || []).includes(P);
      for(let y = bb.y0; y < bb.y1; y += 9) for(let x = bb.x0; x < bb.x1; x += 9){
        const px = x + (R() - 0.5) * 8, py = y + (R() - 0.5) * 8;
        if(!this.pip(px, py, P)) continue;
        const q = this.near(px, py), dist = q ? q.d : 999;
        if(dist > 700 && R() < 0.55) continue;
        if(scrub && R() < 0.5) continue;
        put(px, py, (scrub ? 4 : 9) + R() * 7 + (dist > 700 ? 3 : 0), "broad");
        if(near.length + far.length > 16000) break;
      }
    }
    // the hedgerows, and the oaks, ash and poplars that stand in them
    const hedgeLine = (r, tall) => {
      for(let k = 0; k < r.length - 1; k++){
        const [ax, ay] = r[k], [bx, by] = r[k + 1], L = Math.hypot(bx - ax, by - ay); if(L < 1) continue;
        const ang = Math.atan2(by - ay, bx - ax), n = Math.max(1, Math.round(L / 5));
        for(let j = 0; j < n; j++){
          const t = (j + 0.5) / n, x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
          if(!okTree(x, y)) continue;
          const z = this.ground(x, y), hh = 1.8 + R() * 0.9;
          hedges.push([x, y, z - 0.2, -ang, 1, 1, shade(this.GREENS[Math.floor(R() * 7)], -0.12)]);
          hedges[hedges.length - 1].push(L / n + 0.6, hh + 0.2, 1.7 + R() * 0.6);
          if(tall && R() < 0.12){ const r2 = R(); put(x + (R() - 0.5) * 2, y + (R() - 0.5) * 2, 11 + R() * 8, r2 < 0.18 ? "poplar" : "broad"); }
        }
      }
    };
    for(const r of D.lines.hedge) hedgeLine(r, true);
    // country lanes outside the circuit are hedged both sides
    for(const k of ["minor", "track"]) for(const r of D.roads[k]){
      const mid = r[Math.floor(r.length / 2)]; if(this.inCircuit(mid[0], mid[1])) continue;
      for(const sd of [-1, 1]){
        const off = (k === "minor" ? 5.5 : 3.5) * sd, o = [];
        for(let i = 0; i < r.length; i++){ const a = r[Math.max(0, i - 1)], b = r[Math.min(r.length - 1, i + 1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
          o.push([r[i][0] - (b[1] - a[1]) / L * off, r[i][1] + (b[0] - a[0]) / L * off]); }
        if(R() < 0.75) hedgeLine(o, true);
      }
    }
    for(const [x, y] of D.trees) put(x, y, 10 + R() * 6, "broad");
    // instanced: the hedges carry their own length, height and depth in the matrix
    const sway = this.swayMat("#FFFFFF");
    LB.many(G, g, TG.crownHi, sway, near, true);
    LB.many(G, g, TG.crownLo, sway, far, false);
    LB.many(G, g, TG.poplar, sway, pops, true);
    LB.many(G, g, TG.trunk, G.mat("#4E4030", { roughness:0.95 }), trunks, true);
    this.hedgeMesh(G, g, hedges);
    this.stats.trees = near.length + far.length + pops.length; this.stats.hedge = hedges.length;
  },
  // LB.many scales evenly; a hedge needs length, height and depth of its own
  hedgeMesh(G, g, list){
    const TG = this.treeGeos(), C = 110, groups = new Map();
    for(const it of list){ const k = Math.floor(it[0] / C) + "," + Math.floor(it[1] / C); (groups.get(k) || groups.set(k, []).get(k)).push(it); }
    const mat = new THREE.MeshStandardMaterial({ color:0xFFFFFF, roughness:0.95, flatShading:true }), d = new THREE.Object3D(), col = new THREE.Color();
    for(const items of groups.values()){
      const gg = new THREE.BufferGeometry(); for(const nm in TG.hedge.attributes) gg.setAttribute(nm, TG.hedge.attributes[nm]); gg.setIndex(TG.hedge.index);
      const im = new THREE.InstancedMesh(gg, mat, items.length);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      items.forEach((it, i) => {
        d.position.set(it[0], it[2], it[1]); d.rotation.set(0, it[3], 0); d.scale.set(it[7], it[8], it[9]); d.updateMatrix();
        im.setMatrixAt(i, d.matrix); col.set(it[6]).convertSRGBToLinear(); im.setColorAt(i, col);
        x0 = Math.min(x0, it[0]); x1 = Math.max(x1, it[0]); y0 = Math.min(y0, it[1]); y1 = Math.max(y1, it[1]); z0 = Math.min(z0, it[2]); z1 = Math.max(z1, it[2]);
      });
      gg.boundingSphere = new THREE.Sphere(new THREE.Vector3((x0 + x1) / 2, (z0 + z1) / 2, (y0 + y1) / 2), Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 + 8);
      im.castShadow = true; im.receiveShadow = true; im.frustumCulled = true; im.userData.dynamic = true; g.add(im);
    }
  },

  /* ---- buildings: everything the survey mapped that is not a landmark or a stand ---- */
  geoBuf(){ return { p:[], u:[] }; },
  walls(B, P, z0, z1, tile){
    for(let i = 0; i < P.length; i++){
      const a = P[i], b = P[(i + 1) % P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if(L < 0.05) continue;
      B.p.push(a[0], z0, a[1], b[0], z0, b[1], b[0], z1, b[1], a[0], z0, a[1], b[0], z1, b[1], a[0], z1, a[1]);
      const h = (z1 - z0) / tile, l = L / tile;
      B.u.push(0, 0, l, 0, l, h, 0, 0, l, h, 0, h);
    }
  },
  roof(B, P, z){
    const tri = THREE.ShapeUtils.triangulateShape(P.map(p => new THREE.Vector2(p[0], p[1])), []);
    for(const t of tri) for(const k of t){ B.p.push(P[k][0], z, P[k][1]); B.u.push(P[k][0] / 8, P[k][1] / 8); }
  },
  // a hipped roof over the footprint's rectangle, ridge along the long side
  hip(B, O, z, rh){
    const hl = O.l / 2, hw = O.w / 2, ux = O.ux, uy = O.uy, vx = -uy, vy = ux, rl = Math.max(0, hl - hw * 0.9);
    const C = (u, v) => [O.cx + ux * u + vx * v, O.cy + uy * u + vy * v];
    const c0 = C(-hl, -hw), c1 = C(hl, -hw), c2 = C(hl, hw), c3 = C(-hl, hw), r0 = C(-rl, 0), r1 = C(rl, 0);
    const T3 = (a, az, b, bz, c, cz) => { B.p.push(a[0], az, a[1], b[0], bz, b[1], c[0], cz, c[1]); B.u.push(0, 0, 1, 0, 0.5, 1); };
    const zt = z + rh;
    T3(c0, z, r0, zt, c1, z); T3(c1, z, r0, zt, r1, zt);
    T3(c2, z, r1, zt, c3, z); T3(c3, z, r1, zt, r0, zt);
    T3(c1, z, r1, zt, c2, z); T3(c3, z, r0, zt, c0, z);
  },
  // a pitched barn roof, gable ends along the long side
  gable(B, O, z, rh){
    const hl = O.l / 2, hw = O.w / 2, ux = O.ux, uy = O.uy, vx = -uy, vy = ux;
    const C = (u, v) => [O.cx + ux * u + vx * v, O.cy + uy * u + vy * v];
    const a = C(-hl, -hw), b = C(hl, -hw), c = C(hl, hw), d = C(-hl, hw), r0 = C(-hl, 0), r1 = C(hl, 0), zt = z + rh;
    const T3 = (p, pz, q, qz, r, rz) => { B.p.push(p[0], pz, p[1], q[0], qz, q[1], r[0], rz, r[1]); B.u.push(0, 0, 1, 0, 0.5, 1); };
    T3(a, z, r0, zt, b, z); T3(b, z, r0, zt, r1, zt); T3(c, z, r1, zt, d, z); T3(d, z, r1, zt, r0, zt);
    T3(b, z, r1, zt, c, z); T3(d, z, r0, zt, a, z);
  },
  mesh(G, g, B, mat, cast){
    if(!B.p.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(B.p, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(B.u, 2));
    geo.computeVertexNormals(); geo.computeBoundingSphere();
    // the facades are wound either way round in the survey: show both faces
    const m = new THREE.Mesh(geo, mat); m.castShadow = cast !== false; m.receiveShadow = true; m.userData.dynamic = true;
    g.add(m); return m;
  },
  buildings(G, g, T){
    const R = this.rng(808), D = this.GEO;
    const B = { brick:this.geoBuf(), render:this.geoBuf(), tile:this.geoBuf(), slate:this.geoBuf(), metal:this.geoBuf(),
                clad:this.geoBuf(), flat:this.geoBuf(), barn:this.geoBuf(), stone:this.geoBuf(), glass:this.geoBuf(), timber:this.geoBuf() };
    for(const b of D.blds){
      if(b.lm || b.kind === 2) continue;
      let P = b.pts; if(P.length < 3) continue;
      if(this.area(P) < 0) P = P.slice().reverse();
      const ar = this.area(P); if(ar < 6) continue;
      // nothing of the survey's may stand on the circuit or its run-off
      const c = P.reduce((s, p) => [s[0] + p[0] / P.length, s[1] + p[1] / P.length], [0, 0]);
      const q = this.near(c[0], c[1]); if(q && q.d < this.edge(q.i, q.side) + 2) continue;
      let z0 = Infinity; for(const [x, y] of P) z0 = Math.min(z0, this.ground(x, y)); z0 -= 0.3;
      const O = this.obb(P), inside = this.inCircuit(c[0], c[1]);
      const k = b.kind;
      if(k === 1){
        const h = b.h > 3 ? b.h : 5.4 + (R() < 0.15 ? 2.6 : 0);
        this.walls(R() < 0.7 ? B.brick : B.render, P, z0, z0 + h + 0.3, 4);
        this.hip(R() < 0.6 ? B.tile : B.slate, O, z0 + h + 0.3, Math.min(3.4, O.w * 0.42));
      } else if(k === 6){
        this.walls(B.barn, P, z0, z0 + 5.5, 4); this.gable(B.barn, O, z0 + 5.5, O.w * 0.3);
      } else if(k === 5){
        this.walls(B.stone, P, z0, z0 + 9, 4); this.gable(B.slate, O, z0 + 9, O.w * 0.55);
        // the tower and spire at the west end, one of the few things that should break the horizon
        const tx = O.cx - O.ux * O.l * 0.42, ty = O.cy - O.uy * O.l * 0.42, s = 2.6;
        const sq = [[tx - s, ty - s], [tx + s, ty - s], [tx + s, ty + s], [tx - s, ty + s]];
        this.walls(B.stone, sq, z0, z0 + 17, 4);
        const sp = new THREE.ConeGeometry(s * 1.15, 14, 8); sp.translate(tx, z0 + 24, ty);
        const sm = new THREE.Mesh(sp, G.mat("#7A7468", { roughness:0.85 })); sm.castShadow = true; sm.userData.dynamic = true; g.add(sm);
      } else if(k === 9){
        // apartment blocks and the hotels along the boulevard: rendered, glazed balcony bands, flat roofs
        const h = b.h > 3 ? b.h : 12 + Math.floor(R() * 4) * 3;
        this.walls(R() < 0.6 ? B.render : B.brick, P, z0, z0 + h, 4);
        for(let y = 3; y < h - 1; y += 3) this.walls(B.glass, P.map(p => [c[0] + (p[0] - c[0]) * 1.004, c[1] + (p[1] - c[1]) * 1.004]), z0 + y, z0 + y + 1.3, 4);
        this.roof(B.flat, P, z0 + h);
      } else if(k === 10){
        // holiday-park bungalows and chalets: timber, a pitched roof
        this.walls(B.timber || B.render, P, z0, z0 + 2.8, 4); this.gable(B.tile, O, z0 + 2.8, Math.min(2.2, O.w * 0.45));
      } else if(k === 11){
        const r0 = Math.sqrt(ar / Math.PI); LB.cyl(G, g, c[0], c[1], z0, r0 * 0.7, r0 * 0.7, 26, G.faceMat("brick", "#8A5A44"), 12);
        LB.cyl(G, g, c[0], c[1], z0 + 26, r0, r0, 8, G.faceMat("brick", "#8A5A44"), 12);
      } else if(k === 4){
        this.walls(B.metal, P, z0, z0 + 3, 4); this.roof(B.flat, P, z0 + 3);
      } else {
        const h = b.h > 3 ? b.h : k === 3 ? 9 : k === 7 ? 14 : ar > 2500 ? 10 : 6.5;
        const skin = inside || k === 0 ? B.clad : B.metal;
        this.walls(skin, P, z0, z0 + h, 4);
        if(h > 8 && R() < 0.5) this.walls(B.glass, P.map(p => [c[0] + (p[0] - c[0]) * 1.002, c[1] + (p[1] - c[1]) * 1.002]), z0 + h * 0.45, z0 + h * 0.75, 4);
        this.roof(B.flat, P, z0 + h);
      }
    }
    const two = m => G.twoSided(m);
    this.mesh(G, g, B.brick, two(G.faceMat("brick", "#A4664C")));
    this.mesh(G, g, B.render, two(G.faceMat("stucco", "#DCD3C2")));
    this.mesh(G, g, B.stone, two(G.faceMat("stone", "#B8AE98")));
    this.mesh(G, g, B.tile, two(G.mat("#6A4A40", { roughness:0.85 })));
    this.mesh(G, g, B.slate, two(G.mat("#4A4E56", { roughness:0.7 })));
    this.mesh(G, g, B.metal, two(G.faceMat("corrugated", "#AEB4B8")));
    this.mesh(G, g, B.barn, two(G.faceMat("corrugated", "#5E6A58")));
    this.mesh(G, g, B.clad, two(G.faceMat("concrete", "#E4E6E4")));
    this.mesh(G, g, B.glass, two(G.faceMat("darkglass", "#5A7A8E")));
    this.mesh(G, g, B.flat, two(G.mat("#8C9092", { roughness:0.8 })));
    this.mesh(G, g, B.timber, two(G.mat("#8A6A4A", { roughness:0.85 })));
  },

  /* ---- the landmarks ---- */
  // an occluder owns its materials, so it can fade on its own
  occ(G, meshes, x, y, z, rx, ry){
    for(const m of meshes){ m.material = m.material.clone(); m.material.transparent = false; m.userData.wasCaster = m.castShadow; }
    G.occluders.push({ meshes, x, y, z, rx, ry, fade:1 });
  },
  // which way a footprint's rectangle faces the circuit: +1 or -1 along its short axis
  facingTrack(O){
    const q = this.near(O.cx, O.cy); if(!q) return { f:1, q:null };
    const tx = this.T.x[q.i] - O.cx, ty = this.T.y[q.i] - O.cy;
    return { f:(tx * -O.uy + ty * O.ux) >= 0 ? 1 : -1, q };
  },
  local(G, O, z){ const grp = new THREE.Group(); grp.position.set(O.cx, z, O.cy); grp.rotation.y = -O.ang; return grp; },
  // a quad in a group's own frame (x along, z across)
  quad(B, a, b, c, d, uv){ B.p.push(...a, ...b, ...c, ...a, ...c, ...d); const [u0, v0, u1, v1] = uv || [0, 0, 1, 1]; B.u.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1); },
  box3(B, x0, y0, z0, x1, y1, z1){
    const q = (a, b, c, d) => this.quad(B, a, b, c, d, [0, 0, Math.abs(b[0] - a[0] + b[2] - a[2]) / 4, Math.abs(d[1] - a[1]) / 4]);
    q([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]); q([x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1]);
    q([x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1]); q([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]);
    q([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]); q([x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0]);
  },
  crowdTex(){
    if(this._crowd) return this._crowd;
    const W = 512, H = 256, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const g = cv.getContext("2d"), R = this.rng(99);
    g.fillStyle = "#2E3A4A"; g.fillRect(0, 0, W, H);
    const shirts = ["#E8E4DC", "#1E3A6A", "#C8302A", "#F2C230", "#2E8C5A", "#101418", "#E86A9A", "#6AA8E0", "#F28A1E", "#FFFFFF", "#1E5A3A", "#8A1A2A"];
    const skin = ["#E8C2A0", "#D8A888", "#B07A58", "#7A5038", "#F0D0B4"];
    for(let r = 0; r < 16; r++){
      g.fillStyle = "#3C4858"; g.fillRect(0, r * 16 + 13, W, 3);           // the step of each row
      for(let c = 0; c < 64; c++){
        if(R() < 0.06) continue;                                           // the odd empty seat
        const x = c * 8 + R() * 1.5, y = r * 16;
        g.fillStyle = shirts[Math.floor(R() * shirts.length)]; g.fillRect(x + 1, y + 6, 6, 7);
        g.fillStyle = R() < 0.2 ? shirts[Math.floor(R() * 4)] : skin[Math.floor(R() * skin.length)]; g.fillRect(x + 2, y + 2, 4, 4);
      }
    }
    // the flags held up in the stands: red, white and blue, mostly
    for(let i = 0; i < 26; i++){ const x = R() * W, y = R() * H; this.unionJack(g, x, y, 14, 8); }
    const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    return (this._crowd = t);
  },
  // a Union Jack drawn from scratch, small enough to be painted anywhere
  unionJack(g, x, y, w, h){
    g.save(); g.translate(x, y);
    g.fillStyle = "#1E3A7A"; g.fillRect(0, 0, w, h);
    g.lineCap = "butt";
    g.strokeStyle = "#FFFFFF"; g.lineWidth = h * 0.3; g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h); g.moveTo(w, 0); g.lineTo(0, h); g.stroke();
    g.strokeStyle = "#C8102E"; g.lineWidth = h * 0.12; g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h); g.moveTo(w, 0); g.lineTo(0, h); g.stroke();
    g.fillStyle = "#FFFFFF"; g.fillRect(0, h * 0.34, w, h * 0.32); g.fillRect(w * 0.42, 0, w * 0.16, h);
    g.fillStyle = "#C8102E"; g.fillRect(0, h * 0.4, w, h * 0.2); g.fillRect(w * 0.45, 0, w * 0.1, h);
    g.restore();
  },
  // the mapped stands, raked away from the track, most of them roofed
  stands(G, g, T){
    const crowd = new THREE.MeshStandardMaterial({ map:this.crowdTex(), roughness:0.9, metalness:0 });
    const steel = G.faceMat("metal", "#C8CDD2", false, { roughness:0.5 }), roofM = G.mat("#EEF0F2", { roughness:0.45, metalness:0.2 });
    this.standList = [];
    for(const b of this.GEO.blds){
      if(b.kind !== 2) continue;
      const P = b.pts, O = this.obb(P); if(O.l < 8) continue;
      const { f, q } = this.facingTrack(O); if(!q) continue;
      let z0 = Infinity; for(const [x, y] of P) z0 = Math.min(z0, this.ground(x, y));
      const hl = O.l / 2, hw = O.w / 2, bs = -f;                     // the back is away from the track
      const H = clamp(O.w * 0.62, 4, 17), lip = 1.6, roofed = O.w > 8;
      const grp = this.local(G, O, z0 - 0.2);
      const Bc = this.geoBuf(), Bs = this.geoBuf(), Br = this.geoBuf();
      const fz = -bs * hw, bz = bs * hw;
      // the rake of seats, carrying the crowd
      this.quad(Bc, [-hl, lip, fz], [hl, lip, fz], [hl, H, bz], [-hl, H, bz], [0, 0, O.l / 8, Math.hypot(O.w, H - lip) / 4]);
      // back wall, front wall and the two ends
      this.quad(Bs, [-hl, 0, bz], [hl, 0, bz], [hl, H + 0.4, bz], [-hl, H + 0.4, bz]);
      this.quad(Bs, [-hl, 0, fz], [hl, 0, fz], [hl, lip, fz], [-hl, lip, fz]);
      for(const sx of [-hl, hl]){ Bs.p.push(sx, 0, fz, sx, 0, bz, sx, H, bz, sx, 0, fz, sx, H, bz, sx, lip, fz); Bs.u.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 0.2); }
      let top = H;
      if(roofed){
        // a cantilevered roof off the back, out over the front rows
        const rz = H + 3.6, rf = fz - bs * -1.2, ov = bs * 0.6;
        this.box3(Br, -hl - 0.6, rz, Math.min(rf, bz + ov), hl + 0.6, rz + 0.45, Math.max(rf, bz + ov));
        for(let x = -hl + 1; x <= hl; x += 12) this.box3(Bs, x - 0.2, H, bz - 0.2, x + 0.2, rz, bz + 0.2);
        top = rz + 0.5;
      }
      const ms = [this.mesh(G, grp, Bc, crowd, false), this.mesh(G, grp, Bs, G.twoSided(steel), true), this.mesh(G, grp, Br, G.twoSided(roofM), true)].filter(Boolean);
      g.add(grp); grp.updateMatrixWorld(true);
      if(top > 9) this.occ(G, ms, O.cx, O.cy, z0 + top * 0.55, Math.max(16, hl * 0.8), top * 0.6);
      this.standList.push({ O, z0, H, f, name:b.stand, q });
    }
  },

  /* the Wing: the pit and paddock building along the Hamilton Straight. A long,
     low run of garages with numbered doors, the glazed Paddock Club above, and
     the swept blade of a roof over the lot. Its footprint is the mapped one; the
     roof's exact shape and the garage count are my reading, not a survey. */
  wing(G, g, T){
    const b = this.GEO.blds.find(x => x.lm === "wing"); if(!b) return;
    const O = this.obb(b.pts), { f, q } = this.facingTrack(O); if(!q) return;
    let z0 = Infinity; for(const [x, y] of b.pts) z0 = Math.min(z0, this.ground(x, y));
    const hl = O.l / 2, hw = O.w / 2, bs = -f, fz = -bs * hw, bz = bs * hw;
    const grp = this.local(G, O, z0 - 0.2);
    const nG = Math.max(12, Math.round(O.l / 9.2));
    this.wingGarages = nG;
    // the garage doors: one strip, numbered
    const cv = document.createElement("canvas"); cv.width = 4096; cv.height = 128;
    const cg = cv.getContext("2d"); cg.fillStyle = "#22262C"; cg.fillRect(0, 0, 4096, 128);
    const dw = 4096 / nG;
    for(let k = 0; k < nG; k++){
      const x = k * dw;
      cg.fillStyle = "#3A4048"; cg.fillRect(x + dw * 0.08, 16, dw * 0.84, 112);
      cg.fillStyle = "#4A515A"; for(let s = 24; s < 128; s += 9) cg.fillRect(x + dw * 0.08, s, dw * 0.84, 2);
      cg.fillStyle = "#F2F4F6"; cg.font = "800 " + Math.min(30, dw * 0.4).toFixed(0) + "px 'Saira Condensed',sans-serif"; cg.textAlign = "center"; cg.textBaseline = "middle";
      cg.fillText(String(k + 1), x + dw / 2, 9);
    }
    const doorTex = new THREE.CanvasTexture(cv); doorTex.encoding = THREE.sRGBEncoding; doorTex.anisotropy = 8;
    const doorM = new THREE.MeshStandardMaterial({ map:doorTex, roughness:0.6, metalness:0.3 });
    const Bd = this.geoBuf(), Bw = this.geoBuf(), Bg = this.geoBuf(), Bf = this.geoBuf();
    const g1 = 6.8, g2 = 15.5;
    // the garage front, facing the pit lane (u runs the right way from the track side)
    const s1 = bs > 0 ? 1 : -1;
    this.quad(Bd, [-hl * s1, 0, fz], [hl * s1, 0, fz], [hl * s1, g1, fz], [-hl * s1, g1, fz], [0, 0, 1, 1]);
    // the rest of the block
    this.quad(Bw, [-hl, 0, bz], [hl, 0, bz], [hl, g2, bz], [-hl, g2, bz]);
    for(const sx of [-hl, hl]) this.quad(Bw, [sx, 0, fz], [sx, 0, bz], [sx, g2, bz], [sx, g2, fz]);
    // the Paddock Club: two glazed floors, set back a little over the garages
    const gz = fz + bs * 1.8;
    this.quad(Bg, [-hl + 2, g1, gz], [hl - 2, g1, gz], [hl - 2, g2, gz], [-hl + 2, g2, gz], [0, 0, O.l / 4, (g2 - g1) / 4]);
    this.box3(Bf, -hl, g1 - 0.2, Math.min(fz, gz), hl, g1 + 0.35, Math.max(fz, gz));          // the floor slab edge
    // the roof: a blade that sweeps up toward the track and out over the pit lane, deepest in the middle
    const Bt = this.geoBuf(), N = 48;
    for(let k = 0; k < N; k++){
      const sec = t => { const s = Math.sin(Math.PI * t), u = -hl - 4 + (O.l + 8) * t;
        return { u, f:[u, g2 + 2.2 + 3.6 * s, fz - bs * (2 + 9 * Math.sqrt(s))], m:[u, g2 + 2.8 + 2.6 * s, 0], b:[u, g2 + 0.6 + 1.2 * s, bz - bs * 4.5] }; };
      const A = sec(k / N), C = sec((k + 1) / N), dn = v => [v[0], v[1] - 0.55, v[2]];
      this.quad(Bt, A.f, C.f, C.m, A.m); this.quad(Bt, A.m, C.m, C.b, A.b);
      this.quad(Bt, dn(A.m), dn(C.m), dn(C.f), dn(A.f)); this.quad(Bt, dn(A.b), dn(C.b), dn(C.m), dn(A.m));
      this.quad(Bt, dn(A.f), dn(C.f), C.f, A.f);
    }
    const ms = [this.mesh(G, grp, Bd, doorM, true), this.mesh(G, grp, Bw, G.twoSided(G.faceMat("concrete", "#D8DCDE")), true),
                this.mesh(G, grp, Bg, G.twoSided(G.faceMat("glass", "#8AA4B6")), false), this.mesh(G, grp, Bf, G.mat("#F2F4F6"), false),
                this.mesh(G, grp, Bt, G.twoSided(this.roofMat(G)), true)].filter(Boolean);
    g.add(grp); grp.updateMatrixWorld(true);
    this.occ(G, ms, O.cx, O.cy, z0 + 11, hl * 0.7, 14);
    // the big sign, my own lettering, lit, on the roof's leading edge facing the straight
    const sx = O.cx - O.uy * (fz + bs * 1.5), sy = O.cy + O.ux * (fz + bs * 1.5);
    LB.text(G, g, "BRITISH GRAND PRIX", sx, sy, z0 + g2 + 10.4, 64, 9, O.ang, "#FFFFFF", null, true);
    this.wingO = O;
  },
  // the Wing's roof: white sheet in long panels, a seam at every rib
  roofMat(G){
    const cv = document.createElement("canvas"); cv.width = 128; cv.height = 128; const c = cv.getContext("2d");
    c.fillStyle = "#F2F4F6"; c.fillRect(0, 0, 128, 128);
    c.fillStyle = "#C4CAD0"; c.fillRect(0, 0, 3, 128);
    c.fillStyle = "#E2E6EA"; for(let y = 0; y < 128; y += 16) c.fillRect(0, y, 128, 1);
    const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8;
    return new THREE.MeshStandardMaterial({ map:t, roughness:0.32, metalness:0.3 });
  },
  // the start gantry, its lights, and the line under it
  gantry(G, g, T){
    const i = 0, w = T.half, o0 = -(w + 1.6), o1 = w + 1.6, steel = G.mat("#2A2E34", { roughness:0.5, metalness:0.6 });
    const pt = o => [T.x[i] + T.nx[i] * o, T.y[i] + T.ny[i] * o];
    for(const o of [o0, o1]){ const [x, y] = pt(o); LB.box(G, g, x, y, T.z[i], 0.6, 0.6, 7.6, T.ang[i], steel); }
    const [cx, cy] = pt(0);
    LB.box(G, g, cx, cy, T.z[i] + 6.6, o1 - o0 + 0.6, 0.8, 0.9, T.ang[i] + Math.PI / 2, steel);
    this.lights = [];
    const lm = new THREE.MeshBasicMaterial({ color:0x3A0A08 });
    for(let k = 0; k < 5; k++){
      const o = (k - 2) * 1.5, [x, y] = pt(o);
      const pod = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.6, 1.0), lm.clone());
      pod.position.set(x - T.tx[i] * 0.6, T.z[i] + 5.2, y - T.ty[i] * 0.6); pod.rotation.y = -T.ang[i]; pod.userData.dynamic = true; g.add(pod);
      this.lights.push(pod);
    }
    LB.text(G, g, this.GANTRY_TEXT || "SILVERSTONE", cx - T.tx[i] * 0.55, cy - T.ty[i] * 0.55, T.z[i] + 7.8, 14, 1.6, T.ang[i] + Math.PI / 2, "#FFFFFF", "#1A3A7A", true);
  },
  // the BRDC clubhouse: a handsome low brick building in its own grounds
  brdc(G, g, T){
    const b = this.GEO.blds.find(x => x.lm === "brdc"); if(!b) return;
    const P = this.area(b.pts) < 0 ? b.pts.slice().reverse() : b.pts, O = this.obb(P);
    let z0 = Infinity; for(const [x, y] of P) z0 = Math.min(z0, this.ground(x, y)); z0 -= 0.2;
    const Bb = this.geoBuf(), Bs = this.geoBuf(), Bw = this.geoBuf(), Br = this.geoBuf();
    this.walls(Bb, P, z0, z0 + 8, 4);
    this.walls(Bs, P.map(p => [O.cx + (p[0] - O.cx) * 1.004, O.cy + (p[1] - O.cy) * 1.004]), z0 + 3.6, z0 + 4.1, 4);     // a stone string course
    for(const [a, c] of [[1.1, 2.6], [4.6, 6.6]]) this.walls(Bw, P.map(p => [O.cx + (p[0] - O.cx) * 1.006, O.cy + (p[1] - O.cy) * 1.006]), z0 + a, z0 + c, 4);
    this.hip(Br, O, z0 + 8, Math.min(5, O.w * 0.4));
    this.mesh(G, g, Bb, G.twoSided(G.faceMat("brick", "#9C5C46")));
    this.mesh(G, g, Bs, G.twoSided(G.faceMat("stone", "#D8CFB8")));
    this.mesh(G, g, Bw, G.twoSided(G.faceMat("glass", "#6A8496")));
    this.mesh(G, g, Br, G.twoSided(G.mat("#4A4E58", { roughness:0.7 })));
  },
  // the museum lives in an old wartime hangar: corrugated arch, a glazed new front
  museum(G, g, T){
    const b = this.GEO.blds.find(x => x.lm === "museum"); if(!b) return;
    const O = this.obb(b.pts); let z0 = Infinity; for(const [x, y] of b.pts) z0 = Math.min(z0, this.ground(x, y)); z0 -= 0.2;
    const grp = this.local(G, O, z0), Ba = this.geoBuf(), Bg = this.geoBuf(), hl = O.l / 2, hw = O.w / 2, Hh = hw * 0.9, N = 14;
    for(let k = 0; k < N; k++){
      const a0 = Math.PI * k / N, a1 = Math.PI * (k + 1) / N;
      const p = a => [Math.cos(a) * hw, 3 + Math.sin(a) * Hh];
      const [z1, y1] = p(a0), [z2, y2] = p(a1);
      this.quad(Ba, [-hl * 0.8, y1, z1], [hl, y1, z1], [hl, y2, z2], [-hl * 0.8, y2, z2], [0, 0, O.l / 4, 1]);
    }
    this.quad(Ba, [-hl * 0.8, 0, -hw], [hl, 0, -hw], [hl, 3, -hw], [-hl * 0.8, 3, -hw]);
    this.quad(Ba, [hl, 0, hw], [-hl * 0.8, 0, hw], [-hl * 0.8, 3, hw], [hl, 3, hw]);
    this.box3(Bg, -hl, 0, -hw * 0.9, -hl * 0.8, 9, hw * 0.9);
    this.mesh(G, grp, Ba, G.twoSided(G.faceMat("corrugated", "#7E8A84")));
    this.mesh(G, grp, Bg, G.twoSided(G.faceMat("glass", "#9AB4C4")));
    g.add(grp);
  },
  /* The two bridges the survey has over the lap: the glass footbridge near the
     line, and the one over the Hangar Straight. I believe the second is the one
     dressed as a "Wall of Fame", but I am not sure, so it is just a footbridge here. */
  bridges(G, g, T){
    const sc = T.worldScale, spots = [{ x:-527 * sc, y:444 * sc, h:14.5, glass:true }, { x:100 * sc, y:647 * sc, h:7.2, glass:false }];
    this.bridgeList = [];
    for(const s of spots){
      const q = this.near(s.x, s.y); if(!q) continue;
      const i = q.i, z = T.z[i], a = T.ang[i];
      const extra = T.pitRamp(i) > 0.5 ? T.pitW * T.pitSide : 0;
      const o0 = -(T.half + T.roL[i] + 4) + Math.min(0, extra), o1 = T.half + T.roR[i] + 4 + Math.max(0, extra);
      const span = o1 - o0, mid = (o0 + o1) / 2, cx = T.x[i] + T.nx[i] * mid, cy = T.y[i] + T.ny[i] * mid;
      const grp = new THREE.Group(); grp.position.set(cx, z, cy); grp.rotation.y = -(a + Math.PI / 2);
      const Bd = this.geoBuf(), Bt = this.geoBuf(), Bg = this.geoBuf(), dw = s.glass ? 5 : 3.6, dh = s.glass ? 4 : 2.6;
      this.box3(Bd, -span / 2, s.h - 0.8, -dw / 2, span / 2, s.h, dw / 2);
      if(s.glass){ this.box3(Bg, -span / 2, s.h, -dw / 2, span / 2, s.h + dh, dw / 2); this.box3(Bd, -span / 2, s.h + dh, -dw / 2 - 0.3, span / 2, s.h + dh + 0.4, dw / 2 + 0.3); }
      else for(const sz of [-dw / 2, dw / 2]) this.box3(Bt, -span / 2, s.h, sz - 0.1, span / 2, s.h + 1.3, sz + 0.1);
      for(const ex of [-span / 2 - 3, span / 2 + 3]) this.box3(Bd, ex - 3, 0, -3, ex + 3, s.h + (s.glass ? dh + 0.4 : 1.4), 3);
      const ms = [this.mesh(G, grp, Bd, G.twoSided(G.faceMat("concrete", "#D4D8DA")), true), this.mesh(G, grp, Bt, G.twoSided(G.mat("#2A3A5A", { roughness:0.5 })), false),
                  this.mesh(G, grp, Bg, G.twoSided(G.faceMat("glass", "#9CB6C6", false, { transparent:true, opacity:0.8 })), false)].filter(Boolean);
      g.add(grp); grp.updateMatrixWorld(true);
      this.occ(G, ms, cx, cy, z + s.h, span / 2, s.h * 0.5 + 6);
      this.bridgeList.push({ i, span, mid, h:s.h, glass:s.glass, grp, dw });
    }
  },

  /* ---- the crowds ---- */
  personGeos(){
    if(this._pg) return this._pg;
    const body = new THREE.BoxGeometry(0.46, 1.15, 0.32); body.translate(0, 0.58, 0);
    const head = new THREE.BoxGeometry(0.24, 0.26, 0.24); head.translate(0, 1.32, 0);
    return (this._pg = { body, head });
  },
  SHIRTS:["#E8E4DC", "#1E3A6A", "#C8302A", "#F2C230", "#2E8C5A", "#101418", "#E86A9A", "#6AA8E0", "#F28A1E", "#FFFFFF", "#1E5A3A", "#8A1A2A", "#2A4ABA", "#D8D0A0"],
  people(G, g, list){
    if(!list.length) return;
    const PG = this.personGeos(), R = this.rng(list.length);
    const bodies = list.map(p => [p[0], p[1], p[2], p[3], 1, 0.92 + R() * 0.16, this.SHIRTS[Math.floor(R() * this.SHIRTS.length)]]);
    const heads = list.map((p, k) => [p[0], p[1], p[2] + (bodies[k][5] - 1) * 1.15, p[3], 1, 1, ["#E8C2A0", "#D8A888", "#B07A58", "#7A5038", "#F0D0B4"][k % 5]]);
    LB.many(G, g, PG.body, G.mat("#FFFFFF", { roughness:0.9 }), bodies, false);
    LB.many(G, g, PG.head, G.mat("#FFFFFF", { roughness:0.8 }), heads, false);
    this.stats.people += list.length;
  },
  flagMat(){
    if(this._fm) return this._fm;
    const cv = document.createElement("canvas"); cv.width = 128; cv.height = 64; this.unionJack(cv.getContext("2d"), 0, 0, 128, 64);
    const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding;
    const m = new THREE.MeshStandardMaterial({ map:t, side:THREE.DoubleSide, roughness:0.8 });
    const U = this.U;
    m.onBeforeCompile = sh => {
      sh.uniforms.uTime = U.time;
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uTime;")
        .replace("#include <begin_vertex>", `#include <begin_vertex>
  float fPh = 0.0;
#ifdef USE_INSTANCING
  fPh = instanceMatrix[3][0] * 0.31 + instanceMatrix[3][2] * 0.17;
#endif
  transformed.z += sin(uTime * 7.0 - position.x * 3.2 + fPh) * 0.16 * position.x;`);
    };
    m.customProgramCacheKey = () => "silvFlag";
    return (this._fm = m);
  },
  flags(G, g, list){
    if(!list.length) return;
    const fg = new THREE.PlaneGeometry(1.8, 0.95, 8, 1); fg.translate(0.9, 0, 0); fg.translate(0, 3.0, 0);
    const pg = new THREE.CylinderGeometry(0.03, 0.03, 3.5, 4); pg.translate(0, 1.75, 0);
    // every flag streams the same way: the wind does not change from corner to corner
    const rot = -this.WIND;
    LB.many(G, g, fg, this.flagMat(), list.map(p => [p[0], p[1], p[2], rot, 1]), false);
    LB.many(G, g, pg, G.mat("#C8CCD0", { metalness:0.6, roughness:0.4 }), list.map(p => [p[0], p[1], p[2], 0, 1]), false);
  },
  crowds(G, g, T){
    const R = this.rng(2026), ppl = [], fl = [];
    // the grass banks: packed along the top, thinner down the face
    for(const B of this.BANKS){
      const i0 = Math.round(B.a * T.n), i1 = Math.round(B.b * T.n);
      for(let i = i0; i <= i1; i++){
        const e = this.edge(i, B.sd);
        for(let d = 12; d < 44; d += 0.95){
          if(R() > 0.62 + (d > 22 && d < 34 ? 0.33 : 0)) continue;
          const o = B.sd * (e + d + (R() - 0.5)), x = T.x[i] + T.nx[i] * o + T.tx[i] * (R() - 0.5) * T.ds, y = T.y[i] + T.ny[i] * o + T.ty[i] * (R() - 0.5) * T.ds;
          if(!this.free(x, y)) continue;
          ppl.push([x, y, this.ground(x, y), -(T.ang[i] + Math.PI / 2 * -B.sd) + (R() - 0.5) * 0.6]);
          if(R() < 0.02) fl.push([x, y, this.ground(x, y)]);
        }
      }
    }
    // along the fence on the Hamilton Straight, opposite the Wing
    const FZ = this.FENCE || [0.955, 0.03];
    for(let k = Math.round(T.n * FZ[0]); k < T.n + Math.round(T.n * FZ[1]); k++){
      const i = k % T.n, sd = -T.pitSide, e = this.edge(i, sd);
      for(let r = 0; r < 4; r++) for(let s = 0; s < 6; s++){
        if(R() < 0.25) continue;
        const o = sd * (e + 1 + r * 0.8), al = (s / 6 - 0.5) * T.ds;
        const x = T.x[i] + T.nx[i] * o + T.tx[i] * al, y = T.y[i] + T.ny[i] * o + T.ty[i] * al;
        ppl.push([x, y, this.ground(x, y), -(T.ang[i] - sd * Math.PI / 2)]);
      }
      if(R() < 0.08) fl.push([T.x[i] + T.nx[i] * sd * (e + 3), T.y[i] + T.ny[i] * sd * (e + 3), this.ground(T.x[i] + T.nx[i] * sd * (e + 3), T.y[i] + T.ny[i] * sd * (e + 3))]);
    }
    // flags on the stands' back rails
    for(const S2 of this.standList || []){ const O = S2.O, n = Math.floor(O.l / 18);
      for(let k = 0; k <= n; k++){ const u = -O.l / 2 + O.l * k / Math.max(1, n), v = -S2.f * O.w / 2;
        fl.push([O.cx + O.ux * u - O.uy * v, O.cy + O.uy * u + O.ux * v, S2.z0 + S2.H + 0.4]); } }
    this.people(G, g, ppl); this.flags(G, g, fl);
    this.stats.flags = fl.length;
  },

  /* ---- the sprawl round a Grand Prix: hospitality, camping and parking ---- */
  tentGeos(){
    if(this._tents) return this._tents;
    const marq = new THREE.BoxGeometry(1, 1, 1); marq.translate(0, 0.5, 0);
    const mroof = new THREE.ConeGeometry(0.72, 0.5, 4, 1); mroof.rotateY(Math.PI / 4); mroof.translate(0, 1.25, 0);
    const dome = new THREE.SphereGeometry(1, 7, 3, 0, TAU, 0, Math.PI / 2); dome.scale(1.3, 1.1, 1.1);
    const ridge = new THREE.ConeGeometry(1, 1.3, 3, 1); ridge.rotateZ(Math.PI / 2); ridge.rotateY(Math.PI / 2); ridge.scale(1.0, 1.0, 1.6); ridge.translate(0, 0.55, 0);
    const van = new THREE.BoxGeometry(6.2, 2.5, 2.3); van.translate(0, 1.45, 0);
    const car = new THREE.BoxGeometry(4.4, 1.0, 1.85); car.translate(0, 0.6, 0);
    const cab = new THREE.BoxGeometry(2.3, 0.62, 1.7); cab.translate(-0.25, 1.38, 0);
    return (this._tents = { marq, mroof, dome, ridge, van, car, cab });
  },
  CARCOLS:["#2A2E36", "#8A9099", "#B0B6BE", "#D8DCE0", "#1E3A6A", "#7A1A1A", "#F2F2F0", "#3A3F48", "#4A5A3A", "#C8C2B0", "#5A6E8A", "#9A2A2A"],
  sprawl(G, g, T){
    const R = this.rng(4711), TG = this.tentGeos(), D = this.GEO;
    const marq = [], roofs = [], domes = [], ridges = [], vans = [], cars = [], cabs = [], smoke = [];
    // hospitality: rows of white marquees on the old concrete, never far from the circuit
    const vn = (x, y) => Math.sin(x * 0.011 + Math.sin(y * 0.007) * 2) * Math.cos(y * 0.013 - x * 0.004);
    const I = this.inner;
    for(let y = I.Y0; y < I.Y0 + I.H; y += 15) for(let x = I.X0; x < I.X0 + I.W; x += 15){
      if(vn(x, y) < (this.MARQ || 0.45)) continue;
      const q = this.near(x, y); if(!q || q.d < this.edge(q.i, q.side) + 22 || q.d > 260) continue;
      const big = R() < 0.3, l = big ? 30 : 11, w = big ? 13 : 11, ang = 0.4 + (R() < 0.5 ? 0 : Math.PI / 2);
      let ok = true; for(const [dx, dy] of [[0, 0], [l / 2, 0], [-l / 2, 0], [0, w / 2], [0, -w / 2]]){
        const px = x + dx * Math.cos(ang) - dy * Math.sin(ang), py = y + dx * Math.sin(ang) + dy * Math.cos(ang);
        if(!this.free(px, py)){ ok = false; break; } const q2 = this.near(px, py); if(q2 && q2.d < this.edge(q2.i, q2.side) + 18){ ok = false; break; } }
      if(!ok) continue;
      const z = this.ground(x, y) - 0.1;
      marq.push([x, y, z, -ang, l, w, 3.2]); roofs.push([x, y, z + 3.2 - 0.1, -ang, l, w, 2.2]);
      if(marq.length > 420) break;
    }
    // the campsites, as mapped: tents, caravans and gazebos, and a few barbecues on the go
    const TC = ["#2E7A3E", "#1E5AA8", "#E8A020", "#C8302A", "#5A6A7A", "#E86A2A", "#3A8AC8", "#8A3AA8", "#D8D0B0"];
    for(const P of (D.land.camp || [])){
      const bb = this.bbox(P);
      for(let y = bb.y0; y < bb.y1; y += 6) for(let x = bb.x0; x < bb.x1; x += 6){
        const px = x + (R() - 0.5) * 4, py = y + (R() - 0.5) * 4;
        if(!this.pip(px, py, P) || !this.free(px, py) || R() < 0.2) continue;
        const z = this.ground(px, py), r = R(), a = R() * TAU;
        if(r < 0.48) domes.push([px, py, z, a, 0.9 + R() * 0.5, 1, TC[Math.floor(R() * TC.length)]]);
        else if(r < 0.70) ridges.push([px, py, z, a, 1 + R() * 0.4, 1, TC[Math.floor(R() * TC.length)]]);
        else if(r < 0.86) vans.push([px, py, z, a, 1, 1, R() < 0.8 ? "#F2F2EE" : "#E8E0C8"]);
        else if(r < 0.93){ cars.push([px, py, z, a, 1, 1, this.CARCOLS[Math.floor(R() * this.CARCOLS.length)]]); cabs.push([px, py, z, a, 1, 1, "#1A1E26"]); }
        if(R() < 0.006) smoke.push([px, py, z]);
        if(domes.length + ridges.length + vans.length > 7000) break;
      }
    }
    // the car parks, marshalled into rows
    for(const P of (D.land.parking || [])){
      const O = this.obb(P), bb = this.bbox(P);
      if(Math.hypot(O.cx, O.cy) > 2300 * T.worldScale) continue;
      const fill = 0.55 + R() * 0.4;
      for(let v = -O.w / 2 + 3; v < O.w / 2 - 2; v += 6.2) for(let u = -O.l / 2 + 2; u < O.l / 2 - 2; u += 2.6){
        if(R() > fill) continue;
        const px = O.cx + O.ux * u - O.uy * v, py = O.cy + O.uy * u + O.ux * v;
        // a mapped car park can run up to the circuit: never park on the track or its run-off
        if(!this.pip(px, py, P) || !this.free(px, py)) continue;
        const z = this.ground(px, py), a = -(O.ang + Math.PI / 2) + (R() - 0.5) * 0.08 + (Math.floor((v + 99) / 6.2) % 2 ? Math.PI : 0);
        cars.push([px, py, z, a, 1, 1, this.CARCOLS[Math.floor(R() * this.CARCOLS.length)]]); cabs.push([px, py, z, a, 1, 1, "#1A1E26"]);
        if(cars.length > 9000) break;
      }
    }
    // marquees carry three sizes in the instance, so they go through the hedge path
    const marM = new THREE.MeshStandardMaterial({ color:0xFFFFFF, roughness:0.55, flatShading:true });
    this.scaled(G, g, TG.marq, marM, marq.map(m => [m[0], m[1], m[2], m[3], m[4], m[5], m[6], "#F4F4F2"]), true);
    this.scaled(G, g, TG.mroof, marM, roofs.map(m => [m[0], m[1], m[2], m[3], m[4], m[5], m[6], "#FAFAF8"]), true);
    const tm = new THREE.MeshStandardMaterial({ color:0xFFFFFF, roughness:0.75, flatShading:true });
    LB.many(G, g, TG.dome, tm, domes, false); LB.many(G, g, TG.ridge, tm, ridges, false);
    LB.many(G, g, TG.van, G.mat("#FFFFFF", { roughness:0.5 }), vans, true);
    LB.many(G, g, TG.car, G.mat("#FFFFFF", { roughness:0.35, metalness:0.4 }), cars, true);
    LB.many(G, g, TG.cab, G.mat("#FFFFFF", { roughness:0.15, metalness:0.3 }), cabs, false);
    this.smoke = smoke.slice(0, 24);
    this.stats.marquees = marq.length; this.stats.tents = domes.length + ridges.length; this.stats.cars = cars.length; this.stats.vans = vans.length;
  },
  // instanced with its own length, height and depth: marquees and the like
  scaled(G, g, geo, mat, list, cast){
    const C = 110, groups = new Map(), d = new THREE.Object3D(), col = new THREE.Color();
    for(const it of list){ const k = Math.floor(it[0] / C) + "," + Math.floor(it[1] / C); (groups.get(k) || groups.set(k, []).get(k)).push(it); }
    for(const items of groups.values()){
      const gg = new THREE.BufferGeometry(); for(const nm in geo.attributes) gg.setAttribute(nm, geo.attributes[nm]); if(geo.index) gg.setIndex(geo.index);
      const im = new THREE.InstancedMesh(gg, mat, items.length);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, zz = 0;
      items.forEach((it, i) => { d.position.set(it[0], it[2], it[1]); d.rotation.set(0, it[3], 0); d.scale.set(it[4], it[6], it[5]); d.updateMatrix();
        im.setMatrixAt(i, d.matrix); col.set(it[7]).convertSRGBToLinear(); im.setColorAt(i, col);
        x0 = Math.min(x0, it[0]); x1 = Math.max(x1, it[0]); y0 = Math.min(y0, it[1]); y1 = Math.max(y1, it[1]); zz = it[2]; });
      gg.boundingSphere = new THREE.Sphere(new THREE.Vector3((x0 + x1) / 2, zz, (y0 + y1) / 2), Math.hypot(x1 - x0, y1 - y0) / 2 + 40);
      im.castShadow = !!cast; im.receiveShadow = true; im.frustumCulled = true; im.userData.dynamic = true; g.add(im);
    }
  },

  /* ---- circuit furniture ---- */
  furniture(G, g, T){
    const n = T.n, w = T.half, R = this.rng(9);
    const boAt = (sd, i) => sd * (w + (sd < 0 ? T.roL[i] : T.roR[i]) + 2.6);
    // catch fencing over the Armco, all the way round
    const fmat = new THREE.MeshStandardMaterial({ map:PTEX.fence(), alphaMap:PTEX.fence(), transparent:true, alphaTest:0.28,
      side:THREE.DoubleSide, roughness:0.6, metalness:0.5, color:G.col("#B8C0C8") });
    const pits = i => T.pitSide > 0 && T.pitRamp(i) > 0.05;
    for(const sd of [-1, 1]){
      const f = i => boAt(sd, i) + sd * 0.4;
      const fg = G.wall(T, f, 3.4, i => !(sd === T.pitSide && T.pitRamp(i) > 0.05), -1.0);
      if(fg){ const uv = fg.attributes.uv; for(let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 2.0, uv.getY(k) * 0.85); uv.needsUpdate = true;
        const fm = new THREE.Mesh(fg, fmat); fm.userData.dynamic = true; g.add(fm); }
      const pg = new THREE.BoxGeometry(0.14, 4.4, 0.14), list = []; pg.translate(0, 1.2, 0);
      for(let i = 0; i < n; i += 3){ if(sd === T.pitSide && T.pitRamp(i) > 0.05) continue; const o = f(i); list.push([T.x[i] + T.nx[i] * o, T.y[i] + T.ny[i] * o, T.zAt(i, o), 0]); }
      LB.many(G, g, pg, G.mat("#7A828A", { roughness:0.5, metalness:0.5 }), list, false);
    }
    // tyre walls in front of the Armco wherever a gravel trap ends
    const tyres = [], bands = [];
    const tg = new THREE.CylinderGeometry(0.33, 0.33, 1.0, 8); tg.translate(0, 0.5, 0);
    for(let i = 0; i < n; i++) for(const sd of [-1, 1]){
      const code = sd < 0 ? T.rsL[i] : T.rsR[i]; if(code !== 2 && code !== 5) continue;
      for(let s = 0; s < 1; s += 0.14){
        const j = (i + 1) % n, o = boAt(sd, i) - sd * 0.45;
        const x = T.x[i] + (T.x[j] - T.x[i]) * s + T.nx[i] * o, y = T.y[i] + (T.y[j] - T.y[i]) * s + T.ny[i] * o;
        const tz = T.zAt(i, o); tyres.push([x, y, tz, 0]);
        if(Math.floor(i * 7 + s * 7) % 5 === 0) bands.push([x, y, tz + 0.35, 0, 1.02, 0.3]);
      }
    }
    LB.many(G, g, tg, G.mat("#1A1C20", { roughness:0.95 }), tyres, true);
    LB.many(G, g, tg, G.mat("#E8E8EA", { roughness:0.6 }), bands, false);
    // marshal posts and their flags, every quarter kilometre or so
    const post = new THREE.BoxGeometry(2.4, 2.6, 2.0); post.translate(0, 1.3, 0);
    const roofG = new THREE.BoxGeometry(2.8, 0.25, 2.4); roofG.translate(0, 2.7, 0);
    const posts = [], tow = [], cams = [];
    for(let i = 6; i < n; i += 34){ const sd = i % 68 < 34 ? 1 : -1; if(sd === T.pitSide && T.pitRamp(i) > 0.05) continue;
      const o = boAt(sd, i) + sd * 2.6; posts.push([T.x[i] + T.nx[i] * o, T.y[i] + T.ny[i] * o, T.zAt(i, o), -T.ang[i]]); }
    LB.many(G, g, post, G.mat("#E8ECEE"), posts, true);
    LB.many(G, g, roofG, G.mat("#E8781E"), posts, false);
    // TV towers and big screens at the corners the crowds come for
    const scr = this.screenMat();
    const towerG = new THREE.BoxGeometry(2.2, 12, 2.2); towerG.translate(0, 6, 0);
    const camG = new THREE.BoxGeometry(1.0, 0.7, 0.6); camG.translate(0, 12.6, 0);
    for(const u of (this.TOWERS || [0.045, 0.128, 0.153, 0.347, 0.494, 0.62, 0.828, 0.914, 0.958])){
      const i = Math.round(u * n) % n, sd = -(Math.sign(T.curv[i]) || 1), o = boAt(sd, i) + sd * 9;
      const x = T.x[i] + T.nx[i] * o, y = T.y[i] + T.ny[i] * o, z = this.ground(x, y);
      if(this.free(x, y)){ tow.push([x, y, z, -T.ang[i]]); cams.push([x, y, z, -T.ang[i]]); }
      // a screen on legs facing the bank behind it, wherever there is room for one
      let so = o + sd * 18, sx = T.x[i] + T.nx[i] * so, sy = T.y[i] + T.ny[i] * so;
      for(let tries = 0; tries < 6 && !this.free(sx, sy); tries++){ so += sd * 9; sx = T.x[i] + T.nx[i] * so; sy = T.y[i] + T.ny[i] * so; }
      if(!this.free(sx, sy)) continue;
      const sz = this.ground(sx, sy);
      const scg = new THREE.Group(); scg.position.set(sx, sz, sy); scg.rotation.y = -(T.ang[i]) + (sd > 0 ? 0 : Math.PI);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(12, 7, 0.5), G.mat("#1A1C20")); panel.position.y = 8.5; panel.castShadow = true;
      const face = new THREE.Mesh(new THREE.PlaneGeometry(11.4, 6.4), scr); face.position.set(0, 8.5, 0.27);
      const face2 = face.clone(); face2.rotation.y = Math.PI; face2.position.z = -0.27;
      const legs = new THREE.Mesh(new THREE.BoxGeometry(8, 5, 0.4), G.mat("#3A3F46")); legs.position.y = 2.5;
      scg.add(panel, face, face2, legs); scg.traverse(o2 => { o2.userData.dynamic = true; }); g.add(scg);
    }
    LB.many(G, g, towerG, G.mat("#9AA2AA", { roughness:0.5, metalness:0.6 }), tow, true);
    LB.many(G, g, camG, G.mat("#1A1C20"), cams, false);
    this.stats.tyres = tyres.length;
  },
  // what is on the big screens: the timing tower and a car, in made-up broadcast colours
  screenMat(){
    if(this._scr) return this._scr;
    const cv = document.createElement("canvas"); cv.width = 256; cv.height = 144; const c = cv.getContext("2d");
    c.fillStyle = "#3A6A3A"; c.fillRect(0, 0, 256, 144);
    c.fillStyle = "#5A5C60"; c.fillRect(0, 70, 256, 40);
    c.fillStyle = "#FF8A1E"; c.fillRect(120, 82, 34, 12);
    c.fillStyle = "rgba(10,14,22,.85)"; c.fillRect(6, 6, 64, 132);
    c.font = "700 11px 'Saira Condensed',sans-serif"; c.textBaseline = "top";
    for(let k = 0; k < 10; k++){ c.fillStyle = k % 2 ? "#E8ECF2" : "#FFFFFF"; c.fillText((k + 1) + "  " + ["APX", "RIV", "BOX", "DRS", "KRB", "SLP", "GRV", "PIT", "TOW", "FLG"][k], 10, 10 + k * 12.5); }
    c.fillStyle = "#C8102E"; c.fillRect(186, 8, 62, 18); c.fillStyle = "#FFFFFF"; c.fillText("LIVE", 204, 11);
    const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding;
    return (this._scr = new THREE.MeshBasicMaterial({ map:t, toneMapped:false, color:new THREE.Color(1.6, 1.6, 1.6) }));
  },

  /* ---- the hoardings along the Armco, and on the bridges ---- */
  adverts(G, g, T){
    const n = T.n, H2 = 0.86, lift = 0.08, byMat = new Map();
    let seed = 11; const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
    for(const sd of [-1, 1]){
      let i = 4;
      while(i < n - 4){
        const straight = Math.abs(T.curv[i]) < 0.0025, nodes = straight ? 3 + Math.floor(rnd() * 3) : 2;
        const pit = sd === T.pitSide && T.pitRamp(i) > 0.05;
        if(!pit && rnd() < (straight ? 0.8 : 0.5)){
          const mat = ADS.mat(Math.floor(rnd() * ADS.LIST.length) / ADS.LIST.length + 1e-4, false);
          (byMat.get(mat) || byMat.set(mat, []).get(mat)).push([i, nodes, sd]);
        }
        i += nodes + (rnd() < 0.3 ? 1 : 0);
      }
    }
    for(const [mat, runs] of byMat){
      const pos = [], uv = [], idx = []; let v = 0;
      for(const [i0, nodes, sd] of runs) for(let k = 0; k < nodes; k++){
        const i = (i0 + k) % n, j = (i + 1) % n;
        const oi = sd * (T.half + (sd < 0 ? T.roL[i] : T.roR[i]) + 2.6) - sd * 0.12, oj = sd * (T.half + (sd < 0 ? T.roL[j] : T.roR[j]) + 2.6) - sd * 0.12;
        const ax = T.x[i] + T.nx[i] * oi, ay = T.y[i] + T.ny[i] * oi, bx = T.x[j] + T.nx[j] * oj, by = T.y[j] + T.ny[j] * oj;
        const az = T.zAt(i, oi), bz = T.zAt(j, oj);
        pos.push(ax, az + lift, ay, bx, bz + lift, by, bx, bz + lift + H2, by, ax, az + lift + H2, ay);
        const u0 = k / nodes, u1 = (k + 1) / nodes;
        if(sd > 0) uv.push(u1, 0, u0, 0, u0, 1, u1, 1); else uv.push(u0, 0, u1, 0, u1, 1, u0, 1);
        idx.push(v, v + 1, v + 2, v, v + 2, v + 3); v += 4;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, G.twoSided(mat)); m.userData.dynamic = true; g.add(m);
    }
    // a long hoarding along each bridge, facing the oncoming cars
    for(const B of this.bridgeList || []){
      const mat = ADS.mat((B.i % 17) / 17 + 1e-3, false);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(B.span * 0.9, 1.4), mat);
      p.position.set(0, B.h - 1.5, -(B.dw / 2 + 0.05)); p.rotation.y = Math.PI; B.grp.add(p);
      const p2 = new THREE.Mesh(new THREE.PlaneGeometry(B.span * 0.9, 1.4), ADS.mat(((B.i + 5) % 17) / 17 + 1e-3, false));
      p2.position.set(0, B.h - 1.5, B.dw / 2 + 0.05); B.grp.add(p2);
    }
  },

  /* ---- the pit lane's guests, and what moves overhead ---- */
  extras(G, g, T){
    // the safety car and the medical car, waiting at the end of the pit lane
    const out = (T.pitOut - 14 + T.n) % T.n;
    for(const [k, col, bar] of [[0, "#B8BEC6", "#FF9A1E"], [1, "#F2F2F0", "#3E86FF"]]){
      const i = (out - k * 2 + T.n) % T.n, o = T.pitSide * (T.half + T.pitW * 0.7), x = T.x[i] + T.nx[i] * o, y = T.y[i] + T.ny[i] * o;
      const grp = new THREE.Group(); grp.position.set(x, T.z[i] + 0.05, y); grp.rotation.y = -T.ang[i];
      const body = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.95, 1.95), G.mat(col, { roughness:0.25, metalness:0.6 })); body.position.y = 0.55;
      const cab = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.55, 1.75), G.mat("#1A1E26", { roughness:0.1 })); cab.position.set(-0.3, 1.3, 0);
      const lb = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 1.4), G.glowMat(bar, 2.2)); lb.position.set(-0.3, 1.66, 0);
      grp.add(body, cab, lb); grp.traverse(o2 => { o2.castShadow = true; o2.userData.dynamic = true; }); g.add(grp);
    }
    // two helicopters on a slow orbit, and a blimp sitting over the infield
    this.air = [];
    const heli = () => {
      const grp = new THREE.Group(), m = G.mat("#1E3A6A", { roughness:0.4, metalness:0.4 });
      const body = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 6), m); body.scale.set(1.8, 1, 1);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(5, 0.35, 0.35), m); tail.position.x = -3.6;
      const rotor = new THREE.Mesh(new THREE.BoxGeometry(10, 0.06, 0.4), G.mat("#2A2C30")); rotor.position.y = 1.3;
      grp.add(body, tail, rotor); grp.userData.rotor = rotor; grp.traverse(o2 => { o2.castShadow = true; o2.userData.dynamic = true; });
      g.add(grp); return grp;
    };
    const b = T.bounds, cx = b.minX + b.w / 2, cy = b.minY + b.h / 2;
    this.air.push({ o:heli(), cx, cy, r:520, h:150, w:0.045, p:0 }, { o:heli(), cx:cx + 200, cy:cy - 150, r:380, h:120, w:-0.06, p:2 });
    const bl = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 10), G.mat("#F2F2F0", { roughness:0.5 })); bl.scale.set(30, 7.5, 7.5);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(6, 6, 0.4), G.mat("#1A3A7A")); fin.position.x = -26;
    const blg = new THREE.Group(); blg.add(bl, fin); blg.traverse(o2 => { o2.castShadow = true; o2.userData.dynamic = true; }); g.add(blg);
    if(this.NOBLIMP){ g.remove(blg); } else this.air.push({ o:blg, cx:cx - 100, cy:cy + 80, r:160, h:260, w:0.008, p:1, blimp:true });
    // shuttle buses going up and down the service roads inside the circuit
    this.buses = [];
    const long = this.GEO.roads.service.concat(this.GEO.roads.minor).filter(r => { const m = r[Math.floor(r.length / 2)]; return this.inCircuit(m[0], m[1]) || Math.hypot(m[0] - cx, m[1] - cy) < 1300; })
      .map(r => { let L = 0; for(let k = 1; k < r.length; k++) L += Math.hypot(r[k][0] - r[k - 1][0], r[k][1] - r[k - 1][1]); return { r, L }; })
      .filter(o2 => o2.L > 220).sort((a2, b2) => b2.L - a2.L).slice(0, 8);
    for(const [k, rd] of long.entries()){
      const grp = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(11, 2.9, 2.5), G.mat(k % 2 ? "#1E6A3A" : "#F2F2F0", { roughness:0.4 })); body.position.y = 1.75;
      const win = new THREE.Mesh(new THREE.BoxGeometry(10.4, 0.9, 2.56), G.mat("#1A1E26", { roughness:0.1 })); win.position.y = 2.3;
      grp.add(body, win); grp.traverse(o2 => { o2.castShadow = true; o2.userData.dynamic = true; }); g.add(grp);
      this.buses.push({ o:grp, r:rd.r, L:rd.L, s:rd.L * ((k * 0.37) % 1), v:(7 + k) * (k % 2 ? 1 : -1) });
    }
    // barbecue smoke drifting off the campsites
    if(this.smoke.length){
      const N = this.smoke.length * 10, geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
      const pm = new THREE.PointsMaterial({ color:0xD8DCE0, size:3.5, transparent:true, opacity:0.32, depthWrite:false, sizeAttenuation:true });
      this.smokeP = new THREE.Points(geo, pm); this.smokeP.frustumCulled = false; this.smokeP.userData.dynamic = true; g.add(this.smokeP);
    }
  },

  /* ---- the light of an English summer afternoon: a pale, soft sun that goes
     in and out, and a lot of light coming off the whole sky ---- */
  light(G, T){
    if(G.sun){ G.sun.color.set("#FFF3E4"); G.sun.intensity = 0.98; this.sunBase = 0.98; G.sun.shadow.bias = -0.0005; }
    this.hemi = null;
    G.scene.traverse(o => { if(o.isHemisphereLight){ o.color.set("#C8D6E6"); o.groundColor.set("#6E7A4E"); o.intensity = 0.62; this.hemi = o; } });
    this.hemiBase = 0.62;
  },

  build(G, world, T, S){
    this.T = T; this.stats = { people:0 }; this.groundMats = [];
    this.GEO.init(T.worldScale);
    const g = new THREE.Group(); world.add(g); this.root = g;
    this.U = { cloud:{ value:this.cloudField().t }, off:{ value:new THREE.Vector2(0, 0) }, amt:{ value:0.40 },
               detail:{ value:this.detailTex() }, time:{ value:0 }, dark:{ value:0 } };
    const tm = {};
    const step = (k, fn) => { const a = performance.now(); try{ fn(); }catch(e){ console.warn("silverstone " + k, e.message, e.stack); } tm[k] = Math.round(performance.now() - a); };
    step("index", () => this.distRaster(T));
    step("paint", () => this.paint(T));
    step("terrain", () => this.terrain(G, g, T));
    step("sky", () => this.sky(G, g, T));
    step("cloud", () => this.cloudOver(G, g, T));
    step("trees", () => this.vegetation(G, g, T));
    step("buildings", () => this.buildings(G, g, T));
    step("stands", () => this.stands(G, g, T));
    step("wing", () => this.wing(G, g, T));
    step("gantry", () => this.gantry(G, g, T));
    step("brdc", () => { this.brdc(G, g, T); this.museum(G, g, T); });
    step("bridges", () => this.bridges(G, g, T));
    step("crowds", () => this.crowds(G, g, T));
    step("sprawl", () => this.sprawl(G, g, T));
    step("furniture", () => this.furniture(G, g, T));
    step("adverts", () => this.adverts(G, g, T));
    step("extras", () => this.extras(G, g, T));
    step("tiles", () => { this.stats.split = G.tileSplit(g, 250, 3000); });
    this.light(G, T);
    this.timing = tm; this._t = null; this.wetS = 0;
  },

  frame(S, G){
    const t = S.clock || 0, dt = this._t == null ? 0 : clamp(t - this._t, 0, 0.1); this._t = t;
    this.U.time.value = t;
    // the clouds go downwind at a steady 7 m/s, and their shadows with them
    const o = this.U.off.value; o.x -= Math.cos(this.WIND) * 7 * dt; o.y -= Math.sin(this.WIND) * 7 * dt;
    this.wetS += ((S.wet || 0) - this.wetS) * Math.min(1, dt * 0.5);
    const wet = this.wetS;
    this.U.dark.value = wet * 0.85; this.U.amt.value = 0.40 + wet * 0.1;
    const p = S.player;
    if(p){
      const c = this.cloudAt(p.x, p.y), cover = this.sm((c - 0.5) / 0.2);
      this.sunK = (this.sunK == null ? cover : this.sunK + (cover - this.sunK) * Math.min(1, dt * 1.5));
      if(G.sun) G.sun.intensity = this.sunBase * (1 - 0.42 * this.sunK) * (1 - 0.55 * wet);
      if(this.hemi) this.hemi.intensity = this.hemiBase * (1 + 0.12 * this.sunK) * (1 - 0.25 * wet);
      if(this.skyM) this.skyM.position.set(p.x, p.z, p.y);
    }
    // wet ground is darker: the fields, the dunes and the sand
    for(const gm of this.groundMats || []) gm.color.setScalar(1 - wet * 0.28);
    // a wet track goes dark and glossy
    if(G.roadMat){ G.roadMat.color.setScalar(1 - wet * 0.38); G.roadMat.roughness = 0.94 - wet * 0.6; G.roadMat.metalness = wet * 0.15; }
    // the start lights on the gantry follow the real ones
    if(this.lights){ const on = S.state === "lights" && S.clock < 5.1 ? (S.lights || 0) : 0;
      this.lights.forEach((L, k) => L.material.color.set(k < on ? 0xFF2A1A : 0x3A0A08).multiplyScalar(k < on ? 2.5 : 1)); }
    for(const A of this.air || []){
      A.p += A.w * dt; const x = A.cx + Math.cos(A.p) * A.r, y = A.cy + Math.sin(A.p) * A.r;
      A.o.position.set(x, A.h + Math.sin(t * 0.4 + A.r) * 3, y); A.o.rotation.y = -(A.p + Math.sign(A.w) * Math.PI / 2);
      if(A.o.userData.rotor) A.o.userData.rotor.rotation.y = t * 26;
    }
    for(const B of this.buses || []){
      B.s += B.v * dt; if(B.s > B.L){ B.s = B.L; B.v = -B.v; } if(B.s < 0){ B.s = 0; B.v = -B.v; }
      let s = B.s, k = 0; const r = B.r;
      while(k < r.length - 2){ const l = Math.hypot(r[k + 1][0] - r[k][0], r[k + 1][1] - r[k][1]); if(s <= l) break; s -= l; k++; }
      const a = r[k], b = r[k + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, f = clamp(s / l, 0, 1);
      const x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f, side = B.v > 0 ? 1.8 : -1.8;
      const nx = -(b[1] - a[1]) / l, ny = (b[0] - a[0]) / l;
      B.o.position.set(x + nx * side, this.ground(x, y), y + ny * side); B.o.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]) + (B.v > 0 ? 0 : Math.PI);
    }
    if(this.smokeP){
      const pa = this.smokeP.geometry.attributes.position, N = this.smoke.length;
      for(let k = 0; k < N; k++) for(let j = 0; j < 10; j++){
        const ph = ((t * 0.12 + j / 10 + k * 0.137) % 1), q = this.smoke[k], idx = (k * 10 + j) * 3;
        pa.array[idx] = q[0] + Math.cos(this.WIND) * ph * 30 + Math.sin(t + j) * 0.6;
        pa.array[idx + 1] = q[2] + 1 + ph * 18;
        pa.array[idx + 2] = q[1] + Math.sin(this.WIND) * ph * 30;
      }
      pa.needsUpdate = true;
    }
  },
};

/* A static mesh that spans the whole map is drawn whole every frame, and into
   the shadow map too, however little of it is on screen. Cut the big ones into
   tiles by where each triangle is, so culling can drop what the camera and the
   sun cannot see. Same vertices, same materials: it only changes what is skipped. */

/* ---------- Zandvoort: the survey, built ---------------------------------
   The circuit in the North Sea dunes, built on the Silverstone machinery with
   its own ground, a beach and a sea, dunes instead of fields, and orange
   everywhere. Everything comes off the baked survey (ZGEO); what is invented is
   said where it is built. */
const ZAND = Object.create(SILVER, Object.getOwnPropertyDescriptors({
  get GEO(){ return ZGEO; },
  // its own caches, for the same reason
  _crowd:null, _cf:null, _duneMask:null,
  AIRFIELD:false,
  WIND:0.12,                                  // off the sea, from the west: everything streams east
  GANTRY_TEXT:"ZANDVOORT", NOBLIMP:true, MARQ:0.66,
  TOWERS:[0.064, 0.17, 0.311, 0.454, 0.507, 0.706, 0.85, 0.96],
  FENCE:[0.935, 0.045],
  // the open dunes, wherever the map has no other use for the ground: pale sand, grey-green marram, heath
  CROPS:[
    { c:[214, 200, 156], amp:0.03, sp:41, n:"bare sand" },
    { c:[172, 172, 120], amp:0.04, sp:33, n:"marram dune" },
    { c:[150, 152, 100], amp:0.03, sp:29, n:"grey dune" },
    { c:[132, 128, 90],  amp:0.03, sp:25, n:"dune heath" },
    { c:[188, 182, 132], amp:0.03, sp:37, n:"sand and grass" },
  ],
  LANDCOL:{ grass:"#8EA45C", meadow:"#A2A86E", wood:"#3E5A34", scrub:"#7E8A55", parking:"#9A9C92", camp:"#9AAA66",
            town:"#A6A496", water:"#4E6E80", works:"#9C9C96", yard:"#8C7C60", golf:"#78A84E", pitch:"#6FA84A",
            sand:"#DCCB9A", beach:"#E8D8AA" },
  SHIRTS:["#FF7A00", "#FF7A00", "#FF8A1E", "#FF6A00", "#FF7A00", "#F28A1E", "#FF9A2E", "#FFFFFF", "#1E3A8A", "#C8102E", "#101418", "#FF7A00", "#E86A1A", "#FFB04A"],

  /* ---- the ground: the survey's dunes, kept low between the track and the
     sea, and a beach that shelves gently into the water ---- */
  dune(x, y){
    const s1 = Math.sin(x * 0.021 + Math.sin(y * 0.013) * 1.7) * Math.cos(y * 0.017 - x * 0.006);
    const s2 = Math.sin(x * 0.053 - y * 0.041) * 0.5;
    return (s1 * 0.75 + s2 * 0.25);
  },
  ground(x, y){
    let z = SILVER.ground.call(this, x, y);
    const q = this.near(x, y), e = q ? this.edge(q.i, q.side) : 0, away = q ? q.d - e : 999;
    // ridges and hollows in the open dunes, well clear of the circuit and the town
    if(away > 25 && !this.inTown(x, y)) z += this.dune(x, y) * 2.2 * this.sm((away - 25) / 60);
    const sh = this.shoreAt(x, y);
    if(sh != null){
      const sea = this.GEO.seaZ;
      if(sh < 60){
        // the beach: a gentle shelf from the foot of the dunes down into the sea
        const zb = sea + 0.25 + sh * 0.05;
        z = sh < 0 ? sea - 0.6 + Math.max(sh, -80) * 0.03 : z + (zb - z) * (1 - this.sm((sh - 40) / 20));
      }
      // the dunes between the track and the beach stay low enough to see over
      const ac = this.GEO.across(x, y);
      if(ac > -18 && sh > 0 && q){ const cap = q.z + 4.5; if(z > cap) z = cap + (z - cap) * 0.15; }
    }
    return z;
  },
  // nothing of the fan sprawl goes onto the beach or into the sea
  free(x, y){ const s = this.shoreAt(x, y); if(s != null && s < 40) return false; return SILVER.free.call(this, x, y); },
  inTown(x, y){ const A = this.inn; if(!A || !this.townMask) return false;
    const c = Math.floor((x - A.X0) / A.px), r = Math.floor((y - A.Y0) / A.px);
    return c >= 0 && r >= 0 && c < A.cw && r < A.ch && this.townMask[r * A.cw + c] === 1; },

  /* how far from the water's edge: + on land, - out to sea, metres; a raster
     drawn from the surveyed (and moved) coastline */
  shoreField(T){
    const C = this.GEO.coast, sc = T.worldScale; if(!C || !C.length) return;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for(const [x, y] of C){ x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const M = 200, px = 4, X0 = x0 - M, Y0 = Math.max(y0, -3200 * sc) - M, W = (x1 - x0) + 2 * M, H = (Math.min(y1, 3200 * sc) - Math.max(y0, -3200 * sc)) + 2 * M;
    const cw = Math.ceil(W / px), ch = Math.ceil(H / px);
    const mk = () => { const c = document.createElement("canvas"); c.width = cw; c.height = ch; return c; };
    const P = (x, y) => [(x - X0) / px, (y - Y0) / px];
    const land = mk(), lg = land.getContext("2d", { willReadFrequently:true });
    lg.fillStyle = "#000"; lg.fillRect(0, 0, cw, ch);
    lg.fillStyle = "#FFF"; lg.beginPath();
    C.forEach((p, i) => { const [a, b] = P(p[0], p[1]); i ? lg.lineTo(a, b) : lg.moveTo(a, b); });
    // close the land off to the east, which is where it is
    const [ea, eb] = P(C[C.length - 1][0] + 20000, C[C.length - 1][1]), [fa, fb] = P(C[0][0] + 20000, C[0][1]);
    lg.lineTo(ea, eb); lg.lineTo(fa, fb); lg.closePath(); lg.fill();
    const dist = mk(), dg = dist.getContext("2d", { willReadFrequently:true });
    dg.fillStyle = "#FFF"; dg.fillRect(0, 0, cw, ch); dg.lineCap = "round"; dg.lineJoin = "round";
    for(let d = 124; d >= 0; d -= 2){
      const v = Math.round(d / 124 * 255); dg.strokeStyle = "rgb(" + v + "," + v + "," + v + ")"; dg.lineWidth = Math.max(1, 2 * d / px);
      dg.beginPath(); C.forEach((p, i) => { const [a, b] = P(p[0], p[1]); i ? dg.lineTo(a, b) : dg.moveTo(a, b); }); dg.stroke();
    }
    const L = lg.getImageData(0, 0, cw, ch).data, Dd = dg.getImageData(0, 0, cw, ch).data, N = cw * ch;
    const F = new Float32Array(N), tex = new Uint8Array(N * 4);
    for(let k = 0; k < N; k++){
      const d = Dd[k * 4] / 255 * 124, onLand = L[k * 4] > 127, v = onLand ? d : -d;
      F[k] = v; const e = clamp(Math.round(v + 128), 0, 255); tex[k * 4] = e; tex[k * 4 + 1] = e; tex[k * 4 + 2] = e; tex[k * 4 + 3] = 255;
    }
    const dt = new THREE.DataTexture(tex, cw, ch, THREE.RGBAFormat); dt.flipY = false;
    dt.magFilter = THREE.LinearFilter; dt.minFilter = THREE.LinearFilter; dt.needsUpdate = true;
    this.SH = { X0, Y0, W:cw * px, H:ch * px, px, cw, ch, F, tex:dt };
  },
  shoreAt(x, y){
    const S = this.SH; if(!S) return null;
    const c = Math.floor((x - S.X0) / S.px), r = Math.floor((y - S.Y0) / S.px);
    if(c < 0 || r < 0 || c >= S.cw || r >= S.ch) return x < S.X0 ? -124 : null;
    return S.F[r * S.cw + c];
  },

  /* the painted ground, then the beach drawn into it: the dry sand, the dark wet
     band the tide leaves, the wrack line, and footprints and tyre tracks */
  paint(T){
    SILVER.paint.call(this, T);
    // where the town is, so the dunes do not ripple through its streets
    const A = this.inn, tc = document.createElement("canvas"); tc.width = A.cw; tc.height = A.ch;
    const tg = tc.getContext("2d", { willReadFrequently:true }); tg.fillStyle = "#000"; tg.fillRect(0, 0, A.cw, A.ch); tg.fillStyle = "#FFF";
    for(const r of (this.GEO.land.town || [])){ tg.beginPath(); r.forEach((p, i) => { const a = (p[0] - A.X0) / A.px, b = (p[1] - A.Y0) / A.px; i ? tg.lineTo(a, b) : tg.moveTo(a, b); }); tg.closePath(); tg.fill(); }
    const td = tg.getImageData(0, 0, A.cw, A.ch).data; this.townMask = new Uint8Array(A.cw * A.ch);
    for(let k = 0; k < this.townMask.length; k++) this.townMask[k] = td[k * 4] > 127 ? 1 : 0;
    const C = this.GEO.coast; if(!C) return;
    for(const Ar of [this.inn, this.out]){
      const g = Ar.canvas.getContext("2d"), fp = Ar.W / Ar.canvas.width;
      const Q = (x, y) => [(x - Ar.X0) / fp, (y - Ar.Y0) / fp];
      const line = (d, w, col) => { g.strokeStyle = col; g.lineWidth = w / fp; g.beginPath();
        C.forEach((p, i) => { const [a, b] = Q(p[0] + d, p[1]); i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.stroke(); };
      g.lineCap = "round"; g.lineJoin = "round";
      // under the water, a sandy bottom that darkens with depth (seen through the shallows)
      line(-60, 120, "#9C9474"); line(-18, 36, "#B6AA82");
      // wet sand, then the line of weed and shells the last tide left, then the dry beach
      line(6, 16, "#B39E70"); line(11, 4, "#A08A5E"); line(17, 2.2, "#8A7A58");
      // footprints and the beach-cleaning tractor's tracks
      g.strokeStyle = "rgba(150,132,96,.35)"; g.lineWidth = 1.2 / fp; g.setLineDash([2 / fp, 3 / fp]);
      for(const d of [24, 27, 33]){ g.beginPath(); C.forEach((p, i) => { const [a, b] = Q(p[0] + d + Math.sin(i) * 2, p[1]); i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.stroke(); }
      g.setLineDash([]);
    }
    // the paths through the dunes are loose sand, not tarmac
    for(const Ar of [this.inn, this.out]){
      const g = Ar.canvas.getContext("2d"), fp = Ar.W / Ar.canvas.width;
      g.strokeStyle = "#D8C898"; g.lineWidth = 2.2 / fp; g.lineCap = "round";
      for(const r of (this.GEO.roads.path || [])){ g.beginPath(); r.forEach((p, i) => { const a = (p[0] - Ar.X0) / fp, b = (p[1] - Ar.Y0) / fp; i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.stroke(); }
      g.strokeStyle = "#6A625A"; g.lineWidth = 4 / fp;
      for(const r of (this.GEO.roads.rail || [])){ g.beginPath(); r.forEach((p, i) => { const a = (p[0] - Ar.X0) / fp, b = (p[1] - Ar.Y0) / fp; i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.stroke(); }
    }
  },

  /* ---- the North Sea ---- */
  waveNormals(){
    if(this._wn) return this._wn;
    const N = 128, h = new Float32Array(N * N), R = this.rng(311);
    for(const [f, amp] of [[4, 0.5], [8, 0.28], [16, 0.15], [32, 0.07]]){
      const W = f + 1, gr = new Float32Array(W * W); for(let k = 0; k < gr.length; k++) gr[k] = R();
      for(let y = 0; y <= f; y++) gr[y * W + f] = gr[y * W]; for(let x = 0; x <= f; x++) gr[f * W + x] = gr[x];
      for(let y = 0; y < N; y++) for(let x = 0; x < N; x++){
        const fx = x / N * f, fy = y / N * f, xi = Math.floor(fx), yi = Math.floor(fy), u = fx - xi, v = fy - yi, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
        h[y * N + x] += amp * ((gr[yi * W + xi] * (1 - su) + gr[yi * W + xi + 1] * su) * (1 - sv) + (gr[(yi + 1) * W + xi] * (1 - su) + gr[(yi + 1) * W + xi + 1] * su) * sv);
      }
    }
    const d = new Uint8Array(N * N * 4);
    for(let y = 0; y < N; y++) for(let x = 0; x < N; x++){
      const dx = (h[y * N + (x + 1) % N] - h[y * N + (x + N - 1) % N]) * 6, dy = (h[((y + 1) % N) * N + x] - h[((y + N - 1) % N) * N + x]) * 6;
      const l = Math.hypot(dx, dy, 1), k = (y * N + x) * 4;
      d[k] = (-dx / l * 0.5 + 0.5) * 255; d[k + 1] = (-dy / l * 0.5 + 0.5) * 255; d[k + 2] = h[y * N + x] * 255; d[k + 3] = 255;
    }
    const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
    return (this._wn = t);
  },
  sea(G, g, T){
    if(!this.SH) return;
    const S = this.SH, lin = c => new THREE.Color(c).convertSRGBToLinear();
    const sun = G.sun ? G.sun.position.clone().normalize() : new THREE.Vector3(0.5, 0.7, 0.3);
    this.seaU = Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), {
      uTime:this.U.time, uShore:{ value:S.tex }, uBox:{ value:new THREE.Vector4(S.X0, S.Y0, S.W, S.H) }, uN:{ value:this.waveNormals() },
      uSun:{ value:sun }, uSky:{ value:lin("#8FB3D0") }, uHor:{ value:lin("#D2DCE2") },
      uShallow:{ value:lin("#647F78") }, uDeep:{ value:lin("#4A5E6A") }, uDark:this.U.dark });
    const mat = new THREE.ShaderMaterial({ uniforms:this.seaU, fog:true,
      vertexShader:`varying vec3 vW;
#include <fog_pars_vertex>
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
#include <fog_vertex>
}`,
      fragmentShader:`varying vec3 vW; uniform float uTime, uDark; uniform sampler2D uShore, uN; uniform vec4 uBox; uniform vec3 uSun, uSky, uHor, uShallow, uDeep;
#include <common>
#include <fog_pars_fragment>
void main(){
  vec2 su = (vW.xz - uBox.xy) / uBox.zw;
  float sd = (texture2D(uShore, su).r * 255.0 - 128.0);
  if(su.x < 0.0 || su.y < 0.0 || su.x > 1.0 || su.y > 1.0) sd = -124.0;
  float dsea = max(-sd, 0.0);
  vec3 n1 = texture2D(uN, vW.xz / 41.0 + vec2(uTime * 0.021, uTime * 0.012)).xyz * 2.0 - 1.0;
  vec3 n2 = texture2D(uN, vW.xz / 113.0 - vec2(uTime * 0.009, -uTime * 0.016)).xyz * 2.0 - 1.0;
  vec3 N = normalize(vec3(n1.x + n2.x, 2.6, n1.y + n2.y));
  vec3 V = normalize(cameraPosition - vW);
  float fres = 0.03 + 0.97 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 water = mix(uShallow, uDeep, smoothstep(0.0, 260.0, dsea));
  vec3 Rf = reflect(-V, N);
  vec3 sky = mix(uHor, uSky, clamp(Rf.y * 1.6, 0.0, 1.0));
  vec3 col = mix(water, sky, clamp(fres * 0.85, 0.0, 1.0));
  // sun glints
  col += vec3(1.0, 0.94, 0.82) * pow(max(dot(Rf, uSun), 0.0), 260.0) * 4.0 * (1.0 - uDark);
  // breakers rolling in, broken up so they are not ruled lines
  float nz = texture2D(uN, vW.xz / 17.0 + vec2(uTime * 0.04, 0.0)).z;
  float w = fract(dsea / 24.0 + uTime * 0.085);
  float band = smoothstep(0.0, 0.06, w) * smoothstep(0.28, 0.06, w) * smoothstep(110.0, 18.0, dsea);
  float foam = band * smoothstep(0.38, 0.72, nz);
  // the swash: the edge of the water runs up the beach and back
  float edge = 7.0 + 4.0 * sin(uTime * 0.52 + vW.z * 0.004) + 2.0 * sin(uTime * 1.3 + vW.z * 0.02);
  foam = max(foam, smoothstep(edge, edge - 3.5, dsea) * (0.55 + 0.45 * nz));
  col = mix(col, vec3(0.90, 0.92, 0.91), clamp(foam, 0.0, 1.0));
  col *= 1.0 - uDark * 0.35;
  gl_FragColor = vec4(col, 1.0);
#include <tonemapping_fragment>
#include <encodings_fragment>
#include <fog_fragment>
}` });
    // the water itself: out from the coast to the horizon
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    const xR = S.X0 + S.W - 40, xL = -12000, yT = -12000, yB = 12000;
    const m = new THREE.Mesh(geo, mat);
    m.scale.set(xR - xL, 1, yB - yT); m.position.set((xL + xR) / 2, this.GEO.seaZ, (yT + yB) / 2);
    m.frustumCulled = false; m.userData.dynamic = true; m.receiveShadow = false; g.add(m); this.seaM = m;
  },

  /* ---- the beach: pavilions on stilts, parasols, windbreaks, beach chairs,
     sunbathers, people at the water's edge, lifeguards, groynes, the stairs
     over the dunes ---- */
  // a point on the beach, d metres inland of the water's edge, k metres along it from the coast's start
  coastFrame(){
    if(this._cf) return this._cf;
    const C = this.GEO.coast, cum = [0];
    for(let i = 1; i < C.length; i++) cum.push(cum[i - 1] + Math.hypot(C[i][0] - C[i - 1][0], C[i][1] - C[i - 1][1]));
    const at = s => { let i = 0; while(i < C.length - 2 && cum[i + 1] < s) i++;
      const a = C[i], b = C[i + 1], l = (cum[i + 1] - cum[i]) || 1, f = clamp((s - cum[i]) / l, 0, 1);
      const tx = (b[0] - a[0]) / l, ty = (b[1] - a[1]) / l; let nx = -ty, ny = tx;
      if(nx < 0){ nx = -nx; ny = -ny; }                    // inland is east
      return { x:a[0] + (b[0] - a[0]) * f, y:a[1] + (b[1] - a[1]) * f, tx, ty, nx, ny, ang:Math.atan2(ty, tx) }; };
    // the stretch of beach that faces the circuit
    let s0 = 0, s1 = cum[cum.length - 1], best = Infinity;
    for(let s = 0; s < s1; s += 20){ const p = at(s), d = Math.hypot(p.x - (this.T.bounds.minX + this.T.bounds.w / 2), p.y - (this.T.bounds.minY + this.T.bounds.h / 2)); if(d < best){ best = d; s0 = s; } }
    return (this._cf = { at, mid:s0, L:cum[cum.length - 1] });
  },
  beach(G, g, T){
    const CF = this.coastFrame(), R = this.rng(1953), sea = this.GEO.seaZ;
    const P = (s, d) => { const p = CF.at(s); return { x:p.x + p.nx * d, y:p.y + p.ny * d, p }; };
    const Bt = this.geoBuf(), Bg = this.geoBuf(), Br = this.geoBuf(), Bs = this.geoBuf();
    const stilts = [], paras = [], poles = [], wind = [], chairs = [], lying = [], walk = [], posts = [], towers = [], stairs = [];
    const PC = ["#FF7A00", "#1E5AA8", "#FFFFFF", "#E8242C", "#F2C230", "#2E8C5A", "#FF7A00"];
    const span = 2200;
    // the pavilions: big timber decks on stilts with glass and a long roof, every 300 m or so
    for(let s = CF.mid - span; s <= CF.mid + span; s += 290 + R() * 60){
      if(s < 0 || s > CF.L) continue;
      const c = P(s, 26), ang = c.p.ang, z = sea + 3.2;
      const L = 30 + R() * 10, W = 18, grp = new THREE.Group(); grp.position.set(c.x, z, c.y); grp.rotation.y = -ang;
      const bt = this.geoBuf(), bg = this.geoBuf(), br = this.geoBuf();
      this.box3(bt, -L / 2, 0, -W / 2, L / 2, 0.45, W / 2);                                          // the deck
      this.box3(bt, -L / 2, 0.45, W / 2 - 0.15, L / 2, 1.5, W / 2);                                   // the seaward rail
      this.box3(bg, -L / 2 + 3, 0.45, -W / 2 + 2, L / 2 - 3, 4.2, W / 2 - 7);                         // the glass box
      this.box3(br, -L / 2 - 0.5, 4.2, -W / 2 + 1, L / 2 + 0.5, 4.7, W / 2 - 4);                      // the roof
      this.mesh(G, grp, bt, G.twoSided(G.mat("#9A7650", { roughness:0.85 })), true);
      this.mesh(G, grp, bg, G.twoSided(G.faceMat("glass", "#8AA8B8")), false);
      this.mesh(G, grp, br, G.twoSided(G.mat("#5A4A3A", { roughness:0.8 })), true);
      g.add(grp);
      for(let a = -L / 2 + 2; a <= L / 2 - 2; a += 4) for(const b of [-W / 2 + 1, 0, W / 2 - 1]){
        const x = c.x + Math.cos(ang) * a - Math.sin(ang) * b, y = c.y + Math.sin(ang) * a + Math.cos(ang) * b;
        stilts.push([x, y, sea - 0.5, -ang, 1, 1]);
      }
      // parasols, windbreaks and beach chairs on the sand in front, and the people
      for(let k = 0; k < 40; k++){
        const q = P(s + (R() - 0.5) * 120, 6 + R() * 16), z0 = this.ground(q.x, q.y);
        const r = R();
        if(r < 0.4){ paras.push([q.x, q.y, z0, R() * TAU, 1, 1, PC[Math.floor(R() * PC.length)]]); poles.push([q.x, q.y, z0, 0]); }
        else if(r < 0.65) wind.push([q.x, q.y, z0, -ang + (R() - 0.5) * 0.6, 1, 1]);
        else chairs.push([q.x, q.y, z0, -ang + Math.PI / 2 + (R() - 0.5) * 0.5, 1, 1, R() < 0.5 ? "#2A5AA8" : "#E8E4DA"]);
        if(R() < 0.6) lying.push([q.x + 1.2, q.y, z0 + 0.12, R() * TAU]);
      }
      // a flag on the pavilion
      (this.zflags = this.zflags || []).push([c.x, c.y, z + 4.7]);
    }
    // people walking along the water's edge, lifeguard towers, the groynes
    for(let s = CF.mid - span; s <= CF.mid + span; s += 6){
      if(s < 0 || s > CF.L) continue;
      if(R() < 0.35){ const q = P(s, 1 + R() * 9); walk.push([q.x, q.y, this.ground(q.x, q.y), R() * TAU]); }
    }
    for(let s = CF.mid - span + 150; s <= CF.mid + span; s += 520){
      const q = P(s, 18); if(s < 0 || s > CF.L) continue; towers.push([q.x, q.y, this.ground(q.x, q.y), -q.p.ang]);
    }
    // the groynes: rows of old timber piles running out into the sea. The survey has
    // only two short ones mapped here; these are placed at the usual spacing
    for(let s = CF.mid - span + 60; s <= CF.mid + span; s += 250){
      if(s < 0 || s > CF.L) continue;
      for(let d = 4; d > -70; d -= 1.6){ const q = P(s, d); posts.push([q.x, q.y, sea - 2.5, 0, 1, 1]); }
    }
    // the stairs over the dune, from the boulevard down onto the beach
    for(let s = CF.mid - span + 200; s <= CF.mid + span; s += 420){
      if(s < 0 || s > CF.L) continue;
      for(let d = 30; d < 95; d += 1.2){ const q = P(s, d); stairs.push([q.x, q.y, this.ground(q.x, q.y) + 0.25, -q.p.ang + Math.PI / 2, 1, 1]); }
    }
    const stG = new THREE.BoxGeometry(0.3, 4.2, 0.3); stG.translate(0, 2.1, 0);
    const paG = new THREE.ConeGeometry(1.4, 0.55, 8, 1, true); paG.translate(0, 2.3, 0);
    const poG = new THREE.CylinderGeometry(0.03, 0.03, 2.3, 4); poG.translate(0, 1.15, 0);
    const wiG = new THREE.BoxGeometry(3.2, 1.2, 0.05); wiG.translate(0, 0.6, 0);
    const chG = new THREE.BoxGeometry(0.7, 0.4, 1.6); chG.translate(0, 0.25, 0);
    const lyG = new THREE.BoxGeometry(1.7, 0.22, 0.45); lyG.translate(0, 0.11, 0);
    const piG = new THREE.CylinderGeometry(0.16, 0.16, 3.2, 5); piG.translate(0, 1.6, 0);
    const twG = new THREE.BoxGeometry(2.0, 2.0, 2.0); twG.translate(0, 4.2, 0);
    const twL = new THREE.BoxGeometry(2.2, 3.2, 2.2); twL.translate(0, 1.6, 0);
    const plG = new THREE.BoxGeometry(1.3, 0.12, 2.2);
    LB.many(G, g, stG, G.mat("#6A5440", { roughness:0.9 }), stilts, true);
    LB.many(G, g, paG, new THREE.MeshStandardMaterial({ color:0xFFFFFF, roughness:0.7, side:THREE.DoubleSide }), paras, true);
    LB.many(G, g, poG, G.mat("#E8E8E8"), poles, false);
    LB.many(G, g, wiG, this.stripeMat(), wind, true);
    LB.many(G, g, chG, G.mat("#FFFFFF", { roughness:0.6 }), chairs, false);
    LB.many(G, g, piG, G.mat("#4A3A2C", { roughness:0.95 }), posts, false);
    LB.many(G, g, twG, G.mat("#E8242C"), towers, true); LB.many(G, g, twL, G.mat("#F2F2F2"), towers, true);
    LB.many(G, g, plG, G.mat("#A88A62", { roughness:0.9 }), stairs, true);
    this.people(G, g, walk);
    // sunbathers lying on towels: a body and a towel, flat on the sand
    LB.many(G, g, lyG, G.mat("#FFFFFF", { roughness:0.9 }), lying.map(l => [l[0], l[1], l[2], l[3], 1, 1, ["#E8C2A0", "#D8A888", "#B07A58"][Math.floor(Math.abs(l[0] * 7)) % 3]]), false);
    this.stats.beach = paras.length + wind.length + chairs.length + lying.length + walk.length;
  },
  stripeMat(){
    if(this._stm) return this._stm;
    const cv = document.createElement("canvas"); cv.width = 64; cv.height = 16; const c = cv.getContext("2d");
    const C = ["#E8242C", "#FFFFFF", "#1E5AA8", "#FFFFFF", "#F2C230", "#FFFFFF"];
    for(let k = 0; k < 8; k++){ c.fillStyle = C[k % C.length]; c.fillRect(k * 8, 0, 8, 16); }
    const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding;
    return (this._stm = new THREE.MeshStandardMaterial({ map:t, roughness:0.8, side:THREE.DoubleSide }));
  },
  /* what is out there: kite-surfers, a few small boats, ships on the shipping
     lane and the offshore wind farm (I believe there is one off this coast, at
     about ten kilometres; its position here is not surveyed) */
  offshore(G, g, T){
    const CF = this.coastFrame(), R = this.rng(77), sea = this.GEO.seaZ;
    this.kites = []; this.turbines = [];
    const kiteM = new THREE.MeshStandardMaterial({ color:0xFF5A1E, roughness:0.6, side:THREE.DoubleSide });
    for(let k = 0; k < 7; k++){
      const s = CF.mid + (R() - 0.5) * 1600, p = CF.at(s);
      const grp = new THREE.Group();
      const rider = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.4, 0.4), G.mat("#101418")); rider.position.y = 0.9;
      const board = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.4), G.mat("#F2F2F2")); board.position.y = 0.05;
      const kg = new THREE.SphereGeometry(4, 10, 4, 0, Math.PI, 0, Math.PI / 2); kg.scale(1.4, 0.5, 0.6);
      const kite = new THREE.Mesh(kg, kiteM.clone()); kite.material.color.set(["#FF5A1E", "#1EA0E8", "#F2C230", "#E8242C"][k % 4]);
      kite.position.set(14, 18, 0);
      grp.add(rider, board, kite); grp.traverse(o => { o.userData.dynamic = true; o.castShadow = o !== board; }); g.add(grp);
      this.kites.push({ o:grp, s, d:-(40 + R() * 160), v:(R() < 0.5 ? -1 : 1) * (6 + R() * 5), ph:R() * TAU });
    }
    const hullM = G.mat("#E8E8E6", { roughness:0.5 }), darkM = G.mat("#2A3440", { roughness:0.6 }), redM = G.mat("#A8302A");
    const ships = [];
    for(let k = 0; k < 9; k++){
      const s = CF.mid + (R() - 0.5) * 9000, p = CF.at(clamp(s, 0, CF.L)), d = -(1200 + R() * 4500);
      const big = d < -3000, grp = new THREE.Group();
      grp.position.set(p.x + p.nx * d, sea, p.y + p.ny * d); grp.rotation.y = -p.ang + (R() < 0.5 ? 0 : Math.PI);
      if(big){ const h = new THREE.Mesh(new THREE.BoxGeometry(160, 9, 24), darkM); h.position.y = 4;
        const b = new THREE.Mesh(new THREE.BoxGeometry(18, 14, 22), hullM); b.position.set(-62, 14, 0);
        const c = new THREE.Mesh(new THREE.BoxGeometry(110, 8, 22), redM); c.position.set(10, 12, 0); grp.add(h, b, c); }
      else { const h = new THREE.Mesh(new THREE.BoxGeometry(9, 1.2, 3), hullM); h.position.y = 0.5;
        const sl = new THREE.Mesh(new THREE.ConeGeometry(2, 9, 3), G.mat("#F8F8F6")); sl.position.y = 5.6; grp.add(h, sl); }
      grp.traverse(o => { o.userData.dynamic = true; }); g.add(grp); ships.push(grp);
    }
    // the turbines: tower, nacelle and three slowly turning blades
    const towerG = new THREE.CylinderGeometry(1.6, 2.6, 110, 8); towerG.translate(0, 55, 0);
    const bladeG = new THREE.BoxGeometry(1.6, 58, 0.6); bladeG.translate(0, 29, 0);
    const wM = G.mat("#F2F4F6", { roughness:0.5 });
    const mid = CF.at(CF.mid);
    for(let r = 0; r < 4; r++) for(let c = 0; c < 6; c++){
      const along = (c - 2.5) * 900 - 2500, out = -(9500 + r * 800);
      const x = mid.x + mid.tx * along + mid.nx * out, y = mid.y + mid.ty * along + mid.ny * out;
      const grp = new THREE.Group(); grp.position.set(x, sea, y);
      const tw = new THREE.Mesh(towerG, wM); const nac = new THREE.Mesh(new THREE.BoxGeometry(12, 4, 4), wM); nac.position.set(0, 111, 0);
      const hub = new THREE.Group(); hub.position.set(6.5, 111, 0); hub.rotation.y = Math.PI / 2;
      for(let b = 0; b < 3; b++){ const bl = new THREE.Mesh(bladeG, wM); bl.rotation.z = b * TAU / 3; hub.add(bl); }
      grp.add(tw, nac, hub); grp.rotation.y = -this.WIND + Math.PI; grp.traverse(o => { o.userData.dynamic = true; }); g.add(grp);
      this.turbines.push({ hub, ph:R() * TAU, w:0.9 + R() * 0.3 });
    }
  },

  /* ---- the dunes' planting: marram grass on the open sand, sea-buckthorn in the
     scrub, and pine and birch in the woods and the sheltered hollows ---- */
  vegetation(G, g, T){
    const R = this.rng(4410), D = this.GEO, I = this.inner;
    const marram = [], shrubs = [], pines = [], birches = [], trunks = [];
    const ok = (x, y, m) => { const q = this.near(x, y); return !q || q.d > this.edge(q.i, q.side) + (m || 4); };
    // marram: everywhere the ground is open dune, densest near the circuit and on the sea side
    for(let y = I.Y0; y < I.Y0 + I.H; y += 3.4) for(let x = I.X0; x < I.X0 + I.W; x += 3.4){
      const px = x + (R() - 0.5) * 3, py = y + (R() - 0.5) * 3;
      if(R() < 0.45 || !this.free(px, py) || this.inTown(px, py)) continue;
      const sh = this.shoreAt(px, py); if(sh != null && sh < 40) continue;
      const q = this.near(px, py), d = q ? q.d : 999; if(q && d < this.edge(q.i, q.side) + 3) continue;
      if(d > 500 && R() < 0.75) continue;
      if(!this.isDune(px, py)) continue;
      marram.push([px, py, this.ground(px, py) - 0.05, R() * TAU, 0.7 + R() * 0.6, 0.8 + R() * 0.7, R() < 0.3 ? "#A8A46A" : R() < 0.5 ? "#8E9A5A" : "#B4AE78"]);
      if(marram.length > 42000) break;
    }
    for(const P of (D.land.scrub || [])){
      const bb = this.bbox(P);
      for(let y = bb.y0; y < bb.y1; y += 6) for(let x = bb.x0; x < bb.x1; x += 6){
        const px = x + (R() - 0.5) * 5, py = y + (R() - 0.5) * 5;
        if(R() < 0.35 || !this.pip(px, py, P) || !ok(px, py)) continue;
        shrubs.push([px, py, this.ground(px, py) - 0.2, R() * TAU, 1.2 + R() * 1.4, 0.8 + R() * 0.6, R() < 0.5 ? "#6E7A4A" : "#7E8458"]);
        if(shrubs.length > 14000) break;
      }
    }
    for(const P of (D.land.wood || [])){
      const bb = this.bbox(P);
      for(let y = bb.y0; y < bb.y1; y += 8) for(let x = bb.x0; x < bb.x1; x += 8){
        const px = x + (R() - 0.5) * 7, py = y + (R() - 0.5) * 7;
        if(!this.pip(px, py, P) || !ok(px, py, 6)) continue;
        const q = this.near(px, py); if(q && q.d > 900 && R() < 0.6) continue;
        const z = this.ground(px, py), h = 7 + R() * 7;
        if(R() < 0.78){ pines.push([px, py, z, R() * TAU, h / 9, h / 9, R() < 0.5 ? "#2E4A2C" : "#3A5432"]); }
        else { birches.push([px, py, z, R() * TAU, h / 10, h / 10, R() < 0.2 ? "#A8A43A" : "#7A9A4A"]); trunks.push([px, py, z, 0, h / 10, h / 10]); }
        if(pines.length + birches.length > 14000) break;
      }
    }
    for(const [x, y] of D.trees) if(ok(x, y)) pines.push([x, y, this.ground(x, y), R() * TAU, 1.2, 1.2, "#34502E"]);
    // the geometries: a tuft of blades, a low mound of shrub, a pine and a birch
    const tuft = new THREE.ConeGeometry(0.32, 0.9, 5, 1, true); tuft.translate(0, 0.45, 0);
    const shrub = new THREE.IcosahedronGeometry(1, 0); shrub.scale(1, 0.55, 1); shrub.translate(0, 0.4, 0);
    const pine = (() => { const a = new THREE.ConeGeometry(2.3, 4.2, 7); a.translate(0, 4.2, 0); const b = new THREE.ConeGeometry(1.7, 3.4, 7); b.translate(0, 6.6, 0);
      const t = new THREE.CylinderGeometry(0.18, 0.24, 3, 5); t.translate(0, 1.5, 0); return LB.merge([t, a, b]); })();
    const birch = new THREE.IcosahedronGeometry(1.8, 0); birch.scale(0.8, 1.3, 0.8); birch.translate(0, 6.8, 0);
    const btrunk = new THREE.CylinderGeometry(0.12, 0.16, 6, 5); btrunk.translate(0, 3, 0);
    const sway = this.swayMat("#FFFFFF", 0.95);
    LB.many(G, g, tuft, sway, marram, false);
    LB.many(G, g, shrub, this.swayMat("#FFFFFF", 0.9), shrubs, true);
    LB.many(G, g, pine, this.swayMat("#FFFFFF", 0.9), pines, true);
    LB.many(G, g, birch, this.swayMat("#FFFFFF", 0.9), birches, true);
    LB.many(G, g, btrunk, G.mat("#E8E4DA", { roughness:0.8 }), trunks, true);
    // the wooden fences that keep people off the dunes
    const fp = [], fr = [];
    for(const r of (D.lines.fence || [])) for(let k = 0; k < r.length - 1; k++){
      const [ax, ay] = r[k], [bx, by] = r[k + 1], L = Math.hypot(bx - ax, by - ay), ang = Math.atan2(by - ay, bx - ax);
      for(let s = 0; s < L; s += 2.5){ const x = ax + (bx - ax) * s / L, y = ay + (by - ay) * s / L; if(!ok(x, y, 2)) continue;
        const z = this.ground(x, y); fp.push([x, y, z, 0]); fr.push([x, y, z + 0.8, -ang, 1, 1]); }
    }
    const fpG = new THREE.CylinderGeometry(0.06, 0.06, 1.1, 4); fpG.translate(0, 0.55, 0);
    const frG = new THREE.BoxGeometry(2.5, 0.08, 0.05);
    LB.many(G, g, fpG, G.mat("#7A6248", { roughness:0.95 }), fp, false); LB.many(G, g, frG, G.mat("#8A7254", { roughness:0.95 }), fr, false);
    this.stats.marram = marram.length; this.stats.shrubs = shrubs.length; this.stats.trees = pines.length + birches.length;
  },
  // open dune: not a wood, a car park, water or the town, by what was painted there
  isDune(x, y){
    const A = this.inn, c = Math.floor((x - A.X0) / A.px), r = Math.floor((y - A.Y0) / A.px);
    if(c < 0 || r < 0 || c >= A.cw || r >= A.ch) return false;
    if(!this._duneMask){
      const cv = document.createElement("canvas"); cv.width = A.cw; cv.height = A.ch; const g = cv.getContext("2d", { willReadFrequently:true });
      g.fillStyle = "#FFF"; g.fillRect(0, 0, A.cw, A.ch); g.fillStyle = "#000";
      for(const k of ["wood", "parking", "town", "water", "camp", "pitch", "golf", "works", "grass", "beach"]) for(const P of (this.GEO.land[k] || [])){
        g.beginPath(); P.forEach((p, i) => { const a = (p[0] - A.X0) / A.px, b = (p[1] - A.Y0) / A.px; i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.closePath(); g.fill(); }
      const d = g.getImageData(0, 0, A.cw, A.ch).data; this._duneMask = new Uint8Array(A.cw * A.ch);
      for(let k = 0; k < this._duneMask.length; k++) this._duneMask[k] = d[k * 4] > 127 ? 1 : 0;
    }
    return this._duneMask[r * A.cw + c] === 1;
  },

  /* ---- the landmarks ---- */
  /* the pit building, rebuilt in 2001: a long low block with the garages on the
     pit lane and a glazed floor of hospitality lounges along the top (sixteen,
     the circuit says), and a gantry on the pit wall in front. The footprint is the
     mapped one; the heights and the lounge glazing are my reading of it. */
  pitBuilding(G, g, T){
    const b = this.GEO.blds.find(x => x.lm === "pitbuilding"); if(!b) return;
    const O = this.obb(b.pts), { f, q } = this.facingTrack(O); if(!q) return;
    let z0 = Infinity; for(const [x, y] of b.pts) z0 = Math.min(z0, this.ground(x, y)); z0 = Math.min(z0, T.z[q.i]) - 0.2;
    const hl = O.l / 2, hw = O.w / 2, bs = -f, fz = -bs * hw, bz = bs * hw, s1 = bs > 0 ? 1 : -1;
    const grp = this.local(G, O, z0);
    const doors = (n, lounges) => {
      const cv = document.createElement("canvas"); cv.width = 2048; cv.height = 128; const c = cv.getContext("2d");
      c.fillStyle = lounges ? "#2A3A48" : "#2A2E34"; c.fillRect(0, 0, 2048, 128);
      const dw = 2048 / n;
      for(let k = 0; k < n; k++){
        const x = k * dw;
        if(lounges){ c.fillStyle = "#7AA2BE"; c.fillRect(x + 4, 10, dw - 8, 108); c.fillStyle = "rgba(255,255,255,.25)"; c.fillRect(x + 4, 10, dw * 0.3, 108); c.fillStyle = "#E8ECEF"; c.fillRect(x, 0, 4, 128); }
        else { const team = TEAMS[k % TEAMS.length]; c.fillStyle = team.body; c.fillRect(x + dw * 0.05, 0, dw * 0.9, 16);
          c.fillStyle = "#3A4048"; c.fillRect(x + dw * 0.06, 20, dw * 0.88, 108);
          c.fillStyle = "#4A515A"; for(let s = 28; s < 128; s += 9) c.fillRect(x + dw * 0.06, s, dw * 0.88, 2);
          c.fillStyle = "#FFFFFF"; c.font = "800 13px 'Saira Condensed',sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText((team.short || team.name).toUpperCase().slice(0, 14), x + dw / 2, 8); }
      }
      const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8; return t;
    };
    const Bd = this.geoBuf(), Bl = this.geoBuf(), Bw = this.geoBuf(), Br = this.geoBuf();
    const g1 = 6.0, g2 = 10.4;
    this.quad(Bd, [-hl * s1, 0, fz], [hl * s1, 0, fz], [hl * s1, g1, fz], [-hl * s1, g1, fz], [0, 0, 1, 1]);
    this.quad(Bl, [-hl * s1, g1, fz], [hl * s1, g1, fz], [hl * s1, g2, fz], [-hl * s1, g2, fz], [0, 0, 1, 1]);
    this.quad(Bw, [-hl, 0, bz], [hl, 0, bz], [hl, g2, bz], [-hl, g2, bz]);
    for(const sx of [-hl, hl]) this.quad(Bw, [sx, 0, fz], [sx, 0, bz], [sx, g2, bz], [sx, g2, fz]);
    this.box3(Br, -hl - 1, g2, Math.min(fz - bs * 3, bz), hl + 1, g2 + 0.7, Math.max(fz - bs * 3, bz));    // the roof, out over the lane
    const ms = [this.mesh(G, grp, Bd, new THREE.MeshStandardMaterial({ map:doors(TEAMS.length, false), roughness:0.6, metalness:0.2 }), true),
                this.mesh(G, grp, Bl, new THREE.MeshStandardMaterial({ map:doors(16, true), roughness:0.15, metalness:0.5 }), false),
                this.mesh(G, grp, Bw, G.twoSided(G.faceMat("concrete", "#E2E4E6")), true),
                this.mesh(G, grp, Br, G.twoSided(G.mat("#F2F2F0", { roughness:0.5 })), true)].filter(Boolean);
    g.add(grp); grp.updateMatrixWorld(true);
    this.occ(G, ms, O.cx, O.cy, z0 + 6, hl * 0.7, 9);
    // the gantry on the pit wall: a slim canopy on posts all the way along the boxes
    const sd = T.pitSide, gb = this.geoBuf(), gp = [];
    for(let k = -30; k <= 30; k++){
      const i = ((T.pitBox + k) % T.n + T.n) % T.n; if(T.pitRamp(i) < 0.95) continue;
      const o = sd * (T.half + 0.55), x = T.x[i] + T.nx[i] * o, y = T.y[i] + T.ny[i] * o;
      if(k % 3 === 0) gp.push([x, y, T.z[i] + 1.0, -T.ang[i]]);
    }
    const pg = new THREE.BoxGeometry(0.2, 2.6, 0.2); pg.translate(0, 1.3, 0);
    LB.many(G, g, pg, G.mat("#2A2E34"), gp, true);
    G.add(g, G.strip(T, sd > 0 ? sd * (T.half + 0.1) : sd * (T.half + 1.6), sd > 0 ? sd * (T.half + 1.6) : sd * (T.half + 0.1), 3.6, 8,
      i => { const d = ((i - T.pitBox) % T.n + T.n) % T.n; return T.pitRamp(i) > 0.95 && (d <= 30 || d >= T.n - 30); }), G.mat("#2A2E34"), true);
    this.pitO = O;
    // race control: a glass tower at the Tarzan end of the building
    const tx = O.cx + O.ux * (hl + 10) * (q.i > T.pitBox ? 1 : -1), ty = O.cy + O.uy * (hl + 10) * (q.i > T.pitBox ? 1 : -1);
    const tc = new THREE.Group(); tc.position.set(tx, this.ground(tx, ty), ty); tc.rotation.y = -O.ang;
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(6, 14, 6), G.faceMat("concrete", "#D8DCDE")); shaft.position.y = 7;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(11, 4.5, 9), G.faceMat("glass", "#7A9AB0")); cab.position.y = 16.2;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(12, 0.6, 10), G.mat("#F2F2F0")); cap.position.y = 18.7;
    tc.add(shaft, cab, cap); tc.traverse(o => { o.castShadow = true; o.userData.dynamic = true; }); g.add(tc); tc.updateMatrixWorld(true);
    this.occ(G, [shaft, cab, cap], tx, ty, this.ground(tx, ty) + 10, 8, 12);
  },
  // the grandstands the survey does not have: at the corners where the big crowds sit
  extraStands(T){
    const add = (u, sd, len, dep, name) => {
      const i = Math.round(u * T.n) % T.n, o = sd * (this.edge(i, sd) + 4 + dep / 2);
      const cx = T.x[i] + T.nx[i] * o, cy = T.y[i] + T.ny[i] * o, a = T.ang[i], ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux;
      const P = [[-len / 2, -dep / 2], [len / 2, -dep / 2], [len / 2, dep / 2], [-len / 2, dep / 2]].map(([p, q2]) => [cx + ux * p + vx * q2, cy + uy * p + vy * q2]);
      for(const [x, y] of P){ const q = this.near(x, y); if(q && q.d < this.edge(q.i, q.side) + 2) return; }
      this.GEO.blds.push({ pts:P, h:0, kind:2, lm:"", stand:name, extra:true });
    };
    // Tarzan's outside, the Hugenholtz bowl, Scheivlak, the Hans Ernst chicane, Arie Luyendyk.
    // Their real positions are my best reading of the circuit, not survey.
    add(0.060, -1, 120, 16, "Tarzan"); add(0.180, 1, 90, 14, "Hugenholtz");
    add(0.452, -1, 100, 14, "Scheivlak"); add(0.716, -1, 90, 14, "Hans Ernst"); add(0.870, -1, 110, 16, "Arie Luyendyk");
  },
  // the sponsor arch over the track on the run up to Hunserug
  arch(G, g, T){
    const i = Math.round(0.225 * T.n) % T.n, w = T.half + T.roR[i] + 4, wl = T.half + T.roL[i] + 4;
    for(const o of [-wl, w]){ const x = T.x[i] + T.nx[i] * o, y = T.y[i] + T.ny[i] * o; LB.box(G, g, x, y, T.zAt(i, o), 1.2, 1.2, 9, T.ang[i], G.mat("#FF7A00")); }
    const mid = (w - wl) / 2, cx = T.x[i] + T.nx[i] * mid, cy = T.y[i] + T.ny[i] * mid;
    LB.box(G, g, cx, cy, T.z[i] + 8, w + wl + 1.2, 1.4, 2.2, T.ang[i] + Math.PI / 2, G.mat("#FF7A00"));
    LB.text(G, g, "HUP HOLLAND HUP", cx - T.tx[i] * 0.75, cy - T.ty[i] * 0.75, T.z[i] + 9.1, (w + wl) * 0.8, 1.9, T.ang[i] + Math.PI / 2, "#FFFFFF", "#FF7A00", true);
  },

  /* ---- the barriers: a SAFER wall right at the edge of the banked corners,
     concrete behind blue-and-white energy-absorbing foam, with tall debris
     fencing on top. It follows the banking, as everything else does ---- */
  bowl(G, g, T){
    if(!T.bankW) return;
    const lift = (G.roadLift || 0.1) + 0.004, m = new THREE.MeshStandardMaterial({ color:G.col("#25272C"), roughness:0.62, metalness:0.05, transparent:true, opacity:0.55, depthWrite:false });
    for(const sd of [-1, 1]){
      const on = i => T.bankW[i] > 0.15 && T.bankOut[i] === sd;
      const geo = sd > 0 ? G.strip(T, -T.half * 0.1, T.half - 0.3, lift, 7, on) : G.strip(T, -(T.half - 0.3), T.half * 0.1, lift, 7, on);
      if(geo){ const me = new THREE.Mesh(geo, m); me.receiveShadow = true; me.renderOrder = 1; me.userData.dynamic = true; g.add(me); }
    }
  },
  saferWalls(G, g, T){
    const w = T.half;
    const sTex = (() => { const cv = document.createElement("canvas"); cv.width = 128; cv.height = 32; const c = cv.getContext("2d");
      c.fillStyle = "#1E5AA8"; c.fillRect(0, 0, 128, 32); c.fillStyle = "#F2F2F2"; c.fillRect(0, 12, 128, 8);
      c.fillStyle = "#0E3A78"; for(let x = 0; x < 128; x += 32) c.fillRect(x, 0, 2, 32);
      const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; t.wrapS = THREE.RepeatWrapping; return t; })();
    for(const sd of [-1, 1]){
      const on = i => T.safer(i, sd), f = i => sd * (w + (sd < 0 ? T.roL[i] : T.roR[i]) + 2.6);
      G.add(g, G.wall(T, i => f(i) + sd * 0.3, 1.25, on, 0.3), G.twoSided(G.faceMat("concrete", "#C8CCD0")), true);
      G.add(g, G.wall(T, f, 1.05, on, 0.2), new THREE.MeshStandardMaterial({ map:sTex, roughness:0.6, side:THREE.DoubleSide }), true);
    }
  },

  /* ---- orange: the crowd's shirts, flags and the smoke flares ---- */
  crowdTex(){
    if(this._crowd) return this._crowd;
    const W = 512, H = 256, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const g = cv.getContext("2d"), R = this.rng(31);
    g.fillStyle = "#3A3E46"; g.fillRect(0, 0, W, H);
    const shirts = this.SHIRTS, skin = ["#E8C2A0", "#D8A888", "#F0D0B4", "#B07A58"];
    for(let r = 0; r < 16; r++){
      g.fillStyle = "#4A4E56"; g.fillRect(0, r * 16 + 13, W, 3);
      for(let c = 0; c < 64; c++){ if(R() < 0.04) continue; const x = c * 8 + R() * 1.5, y = r * 16;
        g.fillStyle = shirts[Math.floor(R() * shirts.length)]; g.fillRect(x + 1, y + 6, 6, 7);
        g.fillStyle = R() < 0.25 ? "#FF7A00" : skin[Math.floor(R() * skin.length)]; g.fillRect(x + 2, y + 2, 4, 4); }
    }
    for(let i = 0; i < 30; i++){ const x = R() * W, y = R() * H; this.dutchFlag(g, x, y, 14, 9); }
    const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    return (this._crowd = t);
  },
  dutchFlag(g, x, y, w, h, orange){
    if(orange){ g.fillStyle = "#FF7A00"; g.fillRect(x, y, w, h); return; }
    g.fillStyle = "#AE1C28"; g.fillRect(x, y, w, h / 3); g.fillStyle = "#FFFFFF"; g.fillRect(x, y + h / 3, w, h / 3); g.fillStyle = "#21468B"; g.fillRect(x, y + 2 * h / 3, w, h / 3 + 0.5);
  },
  flagMatFor(orange){
    const key = orange ? "_fmo" : "_fmd"; if(this[key]) return this[key];
    const cv = document.createElement("canvas"); cv.width = 96; cv.height = 64; this.dutchFlag(cv.getContext("2d"), 0, 0, 96, 64, orange);
    const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding;
    const m = SILVER.flagMat.call(Object.create(this, { _fm:{ value:null, writable:true } }));
    const m2 = m.clone(); m2.map = t; m2.onBeforeCompile = m.onBeforeCompile; m2.customProgramCacheKey = m.customProgramCacheKey;
    return (this[key] = m2);
  },
  flags(G, g, list){
    if(!list.length) return;
    const fg = new THREE.PlaneGeometry(1.8, 1.2, 8, 1); fg.translate(0.9, 3.0, 0);
    const pg = new THREE.CylinderGeometry(0.03, 0.03, 3.6, 4); pg.translate(0, 1.8, 0);
    const rot = -this.WIND, A = [], B = [];
    list.forEach((p, k) => (k % 3 === 0 ? B : A).push([p[0], p[1], p[2], rot, 1]));
    LB.many(G, g, fg, this.flagMatFor(false), A, false); LB.many(G, g, fg, this.flagMatFor(true), B, false);
    LB.many(G, g, pg, G.mat("#C8CCD0", { metalness:0.6, roughness:0.4 }), list.map(p => [p[0], p[1], p[2], 0, 1]), false);
  },
  // bicycles: racked at the entrances and the car parks, and leaning everywhere else (the Netherlands)
  bikes(G, g, T){
    const R = this.rng(1817), list = [];
    for(const P of (this.GEO.land.parking || [])){
      const O = this.obb(P); if(Math.hypot(O.cx, O.cy) > 1600 * T.worldScale) continue;
      // a rack of them along one long side of each car park
      for(let u = -O.l / 2 + 2; u < O.l / 2 - 2; u += 0.75){ if(R() < 0.25) continue;
        const v = -O.w / 2 - 1.5, x = O.cx + O.ux * u - O.uy * v, y = O.cy + O.uy * u + O.ux * v;
        if(!this.free(x, y)) continue; list.push([x, y, this.ground(x, y), -(O.ang + Math.PI / 2), 1, 1, ["#1A1C20", "#2A4A8A", "#8A1A1A", "#E8E4DA", "#2E6A3A"][Math.floor(R() * 5)]]); }
      if(list.length > 6000) break;
    }
    const frame = new THREE.BoxGeometry(0.06, 0.55, 1.1); frame.translate(0, 0.62, 0);
    const wheel = new THREE.TorusGeometry(0.34, 0.03, 4, 10); wheel.rotateY(Math.PI / 2);
    const w1 = wheel.clone(); w1.translate(0, 0.36, 0.52); const w2 = wheel.clone(); w2.translate(0, 0.36, -0.52);
    const bars = new THREE.BoxGeometry(0.5, 0.04, 0.04); bars.translate(0, 0.95, 0.42);
    LB.many(G, g, LB.merge([frame, w1, w2, bars]), G.mat("#FFFFFF", { roughness:0.5, metalness:0.4 }), list, false);
    this.stats.bikes = list.length;
  },
  // orange smoke flares let off in the stands and on the dune banks
  flares(G, g, T){
    const R = this.rng(2021), pts = [];
    for(const S2 of this.standList || []) for(let k = 0; k < 3; k++){ const O = S2.O, u = (R() - 0.5) * O.l * 0.8, v = (R() - 0.5) * O.w * 0.6;
      pts.push([O.cx + O.ux * u - O.uy * v, O.cy + O.uy * u + O.ux * v, S2.z0 + S2.H * 0.6]); }
    for(const B of this.BANKS) for(let k = 0; k < 4; k++){ const i = Math.round((B.a + (B.b - B.a) * R()) * T.n) % T.n, o = B.sd * (this.edge(i, B.sd) + 20 + R() * 20);
      const x = T.x[i] + T.nx[i] * o, y = T.y[i] + T.ny[i] * o; pts.push([x, y, this.ground(x, y) + 1.5]); }
    this.flarePts = pts;
    const N = pts.length * 14, geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
    const m = new THREE.PointsMaterial({ color:0xFF6A10, size:2.8, transparent:true, opacity:0.55, depthWrite:false });
    this.flareP = new THREE.Points(geo, m); this.flareP.frustumCulled = false; this.flareP.userData.dynamic = true; g.add(this.flareP);
  },

  /* ---- the light: a bright, hazy coastal afternoon, the sun low and warm ---- */
  light(G, T){
    if(G.sun){ G.sun.color.set("#FFF0DA"); G.sun.intensity = 1.08; this.sunBase = 1.08; }
    this.hemi = null;
    G.scene.traverse(o => { if(o.isHemisphereLight && o !== G.envFill){ o.color.set("#D2E2F0"); o.groundColor.set("#C8B88A"); o.intensity = 0.55; this.hemi = o; } });
    this.hemiBase = 0.55;
  },
  // the spectator banks on the dunes above the outside of the big corners
  BANKS:[ { a:0.040, b:0.095, sd:-1, h:4.5, n:"Tarzan" }, { a:0.152, b:0.205, sd:1, h:6.5, n:"Hugenholtz" },
          { a:0.430, b:0.480, sd:-1, h:4.0, n:"Scheivlak" }, { a:0.690, b:0.750, sd:-1, h:3.0, n:"Hans Ernst" },
          { a:0.830, b:0.900, sd:-1, h:5.5, n:"Arie Luyendyk" } ],

  build(G, world, T, S){
    this.T = T; this.stats = { people:0 }; this._cf = null; this._duneMask = null; this.zflags = []; this.townMask = null; this.groundMats = [];
    this.GEO.init(T.worldScale);
    this.GEO.blds = this.GEO.blds.filter(b => !b.extra);
    const g = new THREE.Group(); world.add(g); this.root = g;
    this.U = { cloud:{ value:this.cloudField().t }, off:{ value:new THREE.Vector2(0, 0) }, amt:{ value:0.22 },
               detail:{ value:this.detailTex() }, time:{ value:0 }, dark:{ value:0 } };
    const tm = {};
    const step = (k, fn) => { const a = performance.now(); try{ fn(); }catch(e){ console.warn("zandvoort " + k, e.message, e.stack); } tm[k] = Math.round(performance.now() - a); };
    step("index", () => this.distRaster(T));
    step("stands0", () => this.extraStands(T));
    step("shore", () => this.shoreField(T));
    step("paint", () => this.paint(T));
    step("terrain", () => this.terrain(G, g, T));
    step("sky", () => this.sky(G, g, T));
    step("cloud", () => this.cloudOver(G, g, T));
    step("sea", () => this.sea(G, g, T));
    step("plants", () => this.vegetation(G, g, T));
    step("buildings", () => this.buildings(G, g, T));
    step("stands", () => this.stands(G, g, T));
    step("pits", () => this.pitBuilding(G, g, T));
    step("gantry", () => { this.gantry(G, g, T); this.arch(G, g, T); });
    step("crowds", () => this.crowds(G, g, T));
    step("sprawl", () => this.sprawl(G, g, T));
    step("furniture", () => { this.furniture(G, g, T); this.saferWalls(G, g, T); this.bowl(G, g, T); });
    step("adverts", () => this.adverts(G, g, T));
    step("beach", () => { this.beach(G, g, T); this.flags(G, g, this.zflags); });
    step("offshore", () => this.offshore(G, g, T));
    step("bikes", () => this.bikes(G, g, T));
    step("flares", () => this.flares(G, g, T));
    step("extras", () => this.extras(G, g, T));
    step("tiles", () => { this.stats.split = G.tileSplit(g, 250, 3000); });
    this.light(G, T);
    this.timing = tm; this._t = null; this.wetS = 0;
  },
  frame(S, G){
    SILVER.frame.call(this, S, G);
    const t = S.clock || 0, dt = this._dt2 == null ? 0 : clamp(t - this._dt2, 0, 0.1); this._dt2 = t;
    const CF = this.coastFrame();
    for(const K of this.kites || []){
      K.s += K.v * dt; if(Math.abs(K.s - CF.mid) > 900) K.v = -K.v;
      const p = CF.at(clamp(K.s, 0, CF.L)), d = K.d + Math.sin(t * 0.2 + K.ph) * 20;
      K.o.position.set(p.x + p.nx * d, this.GEO.seaZ + 0.1 + Math.sin(t * 2 + K.ph) * 0.15, p.y + p.ny * d);
      K.o.rotation.y = -this.WIND + Math.sin(t * 0.5 + K.ph) * 0.4;
    }
    for(const W of this.turbines || []) W.hub.rotation.x = t * W.w + W.ph;
    if(this.flareP){
      const pa = this.flareP.geometry.attributes.position, P = this.flarePts;
      for(let k = 0; k < P.length; k++){
        const on = Math.sin(t * 0.13 + k * 1.7) > 0.2;            // flares come and go
        for(let j = 0; j < 14; j++){
          const ph = ((t * 0.35 + j / 14 + k * 0.31) % 1), idx = (k * 14 + j) * 3;
          if(!on){ pa.array[idx + 1] = -999; continue; }
          pa.array[idx] = P[k][0] + Math.cos(this.WIND) * ph * 22 + Math.sin(t * 3 + j) * 0.5;
          pa.array[idx + 1] = P[k][2] + ph * 9;
          pa.array[idx + 2] = P[k][1] + Math.sin(this.WIND) * ph * 22;
        }
      }
      pa.needsUpdate = true;
    }
    // rain greys the sea; the sky and the sun are SILVER's
    if(this.seaU){ this.seaU.uSky.value.setRGB(0.27, 0.43, 0.63).lerp(new THREE.Color(0.30, 0.33, 0.37), this.wetS); }
  },
}));


G3.tileSplit = function(root, cell, minTris){
  const jobs = [];
  root.traverse(o => {
    if(!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.userData.noSplit || Array.isArray(o.material)) return;
    const g = o.geometry; if(!g || !g.attributes.position || (g.groups && g.groups.length > 1)) return;
    const tri = (g.index ? g.index.count : g.attributes.position.count) / 3; if(tri < minTris) return;
    if(!g.boundingSphere) g.computeBoundingSphere(); if(g.boundingSphere.radius < cell * 0.9) return;
    jobs.push(o);
  });
  const v = new THREE.Vector3();
  for(const o of jobs){
    o.updateMatrixWorld(true);
    const g = o.geometry, idx = g.index ? g.index.array : null, pos = g.attributes.position;
    const nTri = (idx ? idx.length : pos.count) / 3, buckets = new Map();
    for(let t = 0; t < nTri; t++){
      let cx = 0, cz = 0;
      for(let k = 0; k < 3; k++){ const i = idx ? idx[t * 3 + k] : t * 3 + k; v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); cx += v.x; cz += v.z; }
      const key = Math.floor(cx / 3 / cell) + "," + Math.floor(cz / 3 / cell);
      let b = buckets.get(key); if(!b){ b = []; buckets.set(key, b); } b.push(t);
    }
    if(buckets.size < 2) continue;
    const names = Object.keys(g.attributes);
    for(const tris of buckets.values()){
      const ng = new THREE.BufferGeometry();
      for(const nm of names){
        const a = g.attributes[nm], is = a.itemSize, out = new a.array.constructor(tris.length * 3 * is);
        let w = 0;
        for(const t of tris) for(let k = 0; k < 3; k++){ const i = idx ? idx[t * 3 + k] : t * 3 + k; for(let c = 0; c < is; c++) out[w++] = a.array[i * is + c]; }
        ng.setAttribute(nm, new THREE.BufferAttribute(out, is, a.normalized));
      }
      ng.computeBoundingSphere();
      const m = new THREE.Mesh(ng, o.material);
      m.position.copy(o.position); m.quaternion.copy(o.quaternion); m.scale.copy(o.scale);
      m.castShadow = o.castShadow; m.receiveShadow = o.receiveShadow; m.renderOrder = o.renderOrder;
      m.userData = Object.assign({}, o.userData); m.frustumCulled = true;
      o.parent.add(m);
    }
    o.parent.remove(o); g.dispose();
  }
  return jobs.length;
};

G3.clearPitTrees = function(root, T){
  const pts = [];
  for(let i = 0; i < T.n; i += 2){ if(T.pitRamp(i) <= 0.02) continue;
    const o = T.pitCentre(i); pts.push(T.x[i] + T.nx[i] * o, T.y[i] + T.ny[i] * o); }
  if(!pts.length) return;
  const R2 = 27 * 27, m = new THREE.Matrix4(), v = new THREE.Vector3(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  root.traverse(o => {
    if(!o.isInstancedMesh) return;
    const g = o.geometry; if(!g.boundingBox) g.computeBoundingBox();
    const sz = g.boundingBox.getSize(new THREE.Vector3());
    if(!((sz.x >= 3.5 && sz.y >= 1) || (sz.y >= 5.4 && sz.x <= 1.6))) return;
    let hit = false;
    for(let i = 0; i < o.count; i++){
      o.getMatrixAt(i, m); v.setFromMatrixPosition(m);
      for(let k = 0; k < pts.length; k += 2){ const dx = v.x - pts[k], dz = v.z - pts[k + 1]; if(dx * dx + dz * dz < R2){ o.setMatrixAt(i, zero); hit = true; break; } }
    }
    if(hit) o.instanceMatrix.needsUpdate = true;
  });
};

/* The environment map is only worth its cost on things that can show it. It
   used to be the scene's environment, so every surface in the frame sampled it
   twice per pixel, grass and tarmac included; that was a third of the frame.
   Now glass, metal, water and paintwork keep it, and everything matte gets the
   same sky-above, ground-below fill from a hemisphere light, which costs
   nothing per pixel. */
G3.ENV_FILL = 1.0;
G3.applyEnv = function(T, P){
  if(this.envFill){ this.scene.remove(this.envFill); this.envFill = null; }
  if(!this.envRT || CFG.envAll) return;
  const tex = this.envRT.texture, seen = new Set();
  this.scene.environment = null;
  this.scene.traverse(o => {
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for(const m of ms){
      if(seen.has(m) || !m.isMeshStandardMaterial) continue; seen.add(m);
      const shiny = m.metalness >= 0.25 || m.roughness <= 0.5;
      if(shiny){ if(m.envMap !== tex){ m.envMap = tex; m.needsUpdate = true; } m.userData.autoEnv = true; }
      else if(m.userData.autoEnv && m.envMap){ m.envMap = null; m.needsUpdate = true; m.userData.autoEnv = false; }
    }
  });
  // what the environment box looks like from below and above: its lit sky panel and its ground
  const sky = T.night ? "#2A2030" : "#C8D8EE", ground = T.night ? "#4A3418" : (G3.cssGround || "#6E7460");
  // how strong, matched by eye-free means: the mean brightness of three views of each circuit,
  // with the old environment against the fill. The surveyed circuits are lower because
  // their ground already took less of the environment than the generic one did.
  const K = { silverstone:0.57, monaco:0.38, baku:0.71, zandvoort:0.64 };
  const k = T.night ? 0.5 : (K[T.id] != null ? K[T.id] : 0.8);
  this.envFill = new THREE.HemisphereLight(this.col(sky), this.col(ground), k * this.ENV_FILL);
  this.scene.add(this.envFill);
};

G3.build = function(S){
  const T = S.track, P = T.pal, n = T.n, w = T.half, ro = T.runoffMax, wall = T.barrier === "wall";
  // the boundary is now a pair of curves, not a number
  const roR = i => T.roR[i], roL = i => T.roL[i];
  if(this.world){
    this.world.traverse(o => {
      if(o.geometry) o.geometry.dispose();
      const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for(const m of ms){ if(m.map) m.map.dispose(); m.dispose(); }
    });
    this.scene.remove(this.world);
  }
  for(const t of this.texes.values()) t.dispose();
  this.mats.clear(); this.texes.clear(); PTEX.dispose();
  ADS.VEGAS; ADS.dispose(); ADS.use(T.def.world === "monaco" ? "monaco" : T.def.world === "silverstone" ? "silverstone" : T.def.world === "zandvoort" ? "zandvoort" : "vegas");
  while(this.scene.children.length) this.scene.remove(this.scene.children[0]);
  this.rend.renderLists.dispose();
  this.world = new THREE.Group(); this.scene.add(this.world);
  this.built = S.uid; this.cars = []; this.dyn = []; this.occluders = [];

  /* sky, haze and the light of the place */
  this.scene.background = this.col(P.skyB);
  this.scene.fog = new THREE.Fog(this.col(P.skyB), 500, 2000);
  this.fogSpan = T.night ? 900 : 1700;
  // what the glass and the metal have to look at. Never the background: the sky
  // colour is doing that job already, and a visible room would give it away.
  if(this.envRT){ this.envRT.dispose(); this.envRT = null; }
  if(PP.ready){
    G3.cssGround = P.ground;
    try{ this.envRT = buildEnv(this.rend, T.night, P); this.scene.environment = this.envRT.texture; }
    catch(e){ console.warn("environment map unavailable", e); this.scene.environment = null; }
  } else this.scene.environment = null;

  // the grade for this circuit: exposure, how hard things bloom, and where the
  // bloom starts. Vegas at night wants a dark frame with a few very bright
  // things in it; a daytime circuit wants almost none of this.
  this.grade = T.night
    ? { exposure:1.22, strength:0.72, radius:0.72, threshold:1.05, knee:0.38 }
    : { exposure:1.02, strength:0.16, radius:0.50, threshold:1.35, knee:0.30 };
  if(T.def.grade) Object.assign(this.grade, T.def.grade);

  // the totals are chosen so a flat surface comes back at its own colour
  const amb = T.night ? 0.44 : 0.42, dir = T.night ? 0.22 : 1.15;
  const softSky = shade(P.skyA, 0.35);                 // the sky lights from above: keep it near neutral
  this.scene.add(new THREE.HemisphereLight(this.col(T.night ? "#141828" : softSky), this.col(T.night ? "#4A3220" : P.ground), amb));
  this.scene.add(new THREE.AmbientLight(this.col(T.night ? "#5A5478" : "#FFFFFF"), T.night ? 0.30 : 0.12));
  // at night this is moonlight, and the warmth in the frame comes from the city
  const sun = new THREE.DirectionalLight(this.col(T.night ? "#7C90C8" : "#FFF4E2"), dir);
  const sa = T.sun == null ? 0.9 : T.sun;
  sun.position.set(Math.cos(sa) * 400, 520 * (T.def.sunH || 1), Math.sin(sa) * 400);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  // wrapped tight around what the camera can actually see, so the texels land
  // where they are wanted rather than being spread over the whole circuit
  sc.left = -150; sc.right = 150; sc.top = 150; sc.bottom = -150; sc.near = 60; sc.far = 1100;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.9;
  sc.updateProjectionMatrix();
  this.scene.add(sun); this.scene.add(sun.target);
  this.sun = sun;
  if(T.night){
    // a warm wash coming up off the city, opposite the moon: it is what keeps
    // the ground from reading as flat black under a blue key
    const glow = new THREE.DirectionalLight(this.col("#FF9A46"), 0.80);
    glow.position.set(-Math.cos(sa) * 320, 130, -Math.sin(sa) * 320);
    this.scene.add(glow); this.cityGlow = glow;
  } else this.cityGlow = null;

  // a surveyed circuit brings its own ground, land and landmarks
  const surveyed = T.def.world === "monaco" || T.def.world === "silverstone" || T.def.world === "zandvoort";
  const monacoW = T.def.world === "monaco";
  G3.fadeU.value = 1; G3.fadeEdgeU.value = 1;
  /* the ground the circuit sits on — a surveyed circuit brings its own */
  if(!surveyed){
  const bb = T.bounds, pad = (T.def.streets ? 3400 : 520), GX = 150;
  const gw = bb.w + pad * 2, gh = bb.h + pad * 2;
  const ggeo = new THREE.PlaneGeometry(gw, gh, GX, GX);
  ggeo.rotateX(-Math.PI / 2);
  const gcx = bb.minX + bb.w / 2, gcy = bb.minY + bb.h / 2;
  const gp = ggeo.attributes.position, hts = new Float32Array(gp.count);
  for(let i = 0; i < gp.count; i++){
    const wx = gp.getX(i) + gcx, wy = gp.getZ(i) + gcy;
    hts[i] = T.z[T.near(wx, wy)];
  }
  // one smoothing pass so the field does not step between nodes
  const row = GX + 1, sm = new Float32Array(hts);
  for(let r = 1; r < GX; r++) for(let c = 1; c < GX; c++){
    const k = r * row + c;
    sm[k] = (hts[k] * 2 + hts[k - 1] + hts[k + 1] + hts[k - row] + hts[k + row]) / 6;
  }
  for(let i = 0; i < gp.count; i++) gp.setY(i, sm[i] - 1.0);
  ggeo.computeVertexNormals();
  const gplane = new THREE.Mesh(ggeo, this.mat(P.ground));
  gplane.position.set(gcx, 0, gcy); gplane.receiveShadow = true;
  this.world.add(gplane); this.gplane = gplane;

  /* the land: every patch a flat polygon */
  const land = new THREE.Group(); this.world.add(land);
  for(const L of (T.land || [])){
    try{ this.patch(land, L.pts, L.z - 0.4 + Math.min(L.r, 40) * 0.0005, L.col, L.kind || "grass"); }catch(e){}
  }
  } else this.gplane = null;

  /* the circuit surface, band by band, each one lifted clear of the last */
  const road = this.world; let lift = 0.02;
  const bandTex = (col, kind) => {
    const t = TEX.ground(col, kind);
    let tt = this.texes.get(t);
    if(!tt){ tt = G3.srgb(new THREE.CanvasTexture(t.img)); tt.wrapS = tt.wrapT = THREE.RepeatWrapping; this.texes.set(t, tt); }
    const c = tt.clone(); c.needsUpdate = true; c.encoding = THREE.sRGBEncoding; c.wrapS = c.wrapT = THREE.RepeatWrapping; c.repeat.set(2, 6);
    return new THREE.MeshStandardMaterial({ map:c, roughness:0.94, metalness:0.02 });
  };
  if(!wall && T.surfAt){
    /* run-off made of what the circuit says it is: tarmac, gravel traps, grass,
       and the strip of artificial grass along the kerbs */
    this.add(road, this.strip(T, i => -(w + roL(i) + 6), i => (w + roR(i) + 6), lift, 9), bandTex(shade(P.grass, -0.05), "grass"));
    lift += 0.02;
    const tarmac = bandTex("#6E7176", "asphalt"), gravelM = bandTex("#ADA38C", "gravel"), astroM = bandTex("#3E8A4A", "grass");
    const gEdge = this.mat("#8E8670");
    for(const sd of [-1, 1]){
      const code = i => (sd < 0 ? T.rsL[i] : T.rsR[i]), rf = sd < 0 ? roL : roR, rt = i => (sd < 0 ? T.rtL[i] : T.rtR[i]);
      const band = (a, b, f, m, l) => this.add(road, sd < 0 ? this.strip(T, i => -b(i), i => -a(i), lift + l, 9, f) : this.strip(T, a, b, lift + l, 9, f), m);
      band(() => w + 0.2, i => w + rf(i), i => code(i) === 1, tarmac, 0);
      band(() => w + 0.2, i => w + rf(i), i => code(i) === 2, gravelM, 0.004);
      band(() => w + 0.2, i => w + Math.max(0.5, rt(i)), i => code(i) === 5, tarmac, 0);
      band(i => w + Math.max(0.5, rt(i)), i => w + rf(i), i => code(i) === 5, gravelM, 0.004);
      // the raked lip where a gravel trap meets the grass
      band(i => w + rf(i) - 0.5, i => w + rf(i), i => code(i) === 2 || code(i) === 5, gEdge, 0.008);
      band(() => w + 0.2, i => w + Math.min(rf(i), T.astro + 1.6), i => code(i) === 3 || code(i) === 4, astroM, 0.002);
      band(i => w + T.astro + 1.6, i => w + rf(i), i => code(i) === 4 && rf(i) > T.astro + 1.8, astroM, 0.002);
      // the white line down the edge of a tarmac escape
      band(i => w + rf(i) - 0.6, i => w + rf(i) - 0.25, i => code(i) === 1 && rf(i) > 10, this.mat("#E8E8EA"), 0.01);
    }
  } else if(!wall){
    this.add(road, this.strip(T, i => -(w + roL(i) + 6), i => (w + roR(i) + 6), lift, 9), bandTex(shade(P.grass, -0.05), "grass"));
    lift += 0.02;
    const runCol = T.id === "zandvoort" || T.id === "baku" ? "#C9B78E" : shade(P.road, 0.22);
    this.add(road, this.strip(T, i => -(w + roL(i)), -(w + 0.2), lift, 9), bandTex(runCol, "asphalt"));
    this.add(road, this.strip(T, w + 0.2, i => w + roR(i), lift, 9), bandTex(runCol, "asphalt"));
  } else {
    this.add(road, this.strip(T, i => -(w + roL(i) + 1.4), i => (w + roR(i) + 1.4), lift, 9), this.mat(shade(P.wall, -0.30)));
    lift += 0.02;
    // the escape roads are laid in a lighter, dustier asphalt than the circuit
    const escape = bandTex(shade(P.road, 0.34), "asphalt");
    const plain = bandTex(shade(P.road, 0.26), "asphalt");
    for(const [sd, rf] of [[-1, roL], [1, roR]]){
      const wide = i => rf(i) > T.def.runoff + 2.5;
      this.add(road, this.strip(T, i => sd * (w + 0.15), i => sd * (w + rf(i)), lift, 9,
        i => rf(i) > 0.5 && !wide(i)), plain);
      this.add(road, this.strip(T, i => sd * (w + 0.15), i => sd * (w + rf(i)), lift, 9,
        i => wide(i)), escape);
      const kf = i => rf(i) > 0.5 && !wide(i) && Math.abs(T.curv[i]) > 0.004 && (Math.floor(i / 2) % 2);
      this.add(road, this.strip(T, i => sd * (w + rf(i)), i => sd * (w + rf(i) - 0.5), lift + 0.01, 9, kf), this.mat(P.kerbA));
      // an escape road is painted: a line down its outer edge and arrows on it
      this.add(road, this.strip(T, i => sd * (w + rf(i) - 0.7), i => sd * (w + rf(i) - 0.2), lift + 0.012, 9,
        i => wide(i)), this.mat("#E8E8EA"));
      this.add(road, this.strip(T, i => sd * (w + 1.4), i => sd * (w + rf(i) * 0.55), lift + 0.012, 3,
        i => wide(i) && (Math.floor(i / 3) % 5) === 0), this.mat("#DCDCE0"));
    }
  }
  lift += 0.03;
  this.roadLift = lift;
  this.roadMat = bandTex(P.road, "asphalt");
  this.add(road, this.strip(T, -w, w, lift, 7), this.roadMat);
  // the rubbered-in line down the racing line
  this.add(road, this.strip(T, i => T.line[i] - 1.7, i => T.line[i] + 1.7, lift + 0.012, 9),
    new THREE.MeshStandardMaterial({ color:new THREE.Color("#141518"), roughness:0.72, metalness:0, transparent:true, opacity:0.18 }));
  // kerbs, alternating along the corners
  const kOn = i => Math.abs(T.curv[i]) > 0.0032, kAlt = i => (Math.floor(i / 2) % 2);
  const sgn = i => Math.sign(T.curv[i]) || 1;
  for(const [pick, ca, cb] of [[true, P.kerbA, P.kerbB], [false, P.kerbB, P.kerbA]]){
    this.add(road, this.strip(T, i => sgn(i) * w, i => sgn(i) * (w + 1.5), lift + 0.02, 3,
      i => kOn(i) && (!!kAlt(i) === pick)), this.mat(pick ? ca : cb));
    this.add(road, this.strip(T, i => -sgn(i) * w, i => -sgn(i) * (w + 1.5), lift + 0.02, 3,
      i => Math.abs(T.curv[i]) > 0.010 && (!!kAlt(i) === pick)), this.mat(pick ? cb : ca));
  }
  // the white lines
  this.add(road, this.strip(T, w - 0.45, w - 0.05, lift + 0.025, 9), this.mat(P.line));
  this.add(road, this.strip(T, -(w - 0.05), -(w - 0.45), lift + 0.025, 9), this.mat(P.line));

  /* the pit lane: a lighter surface than the track, a lit lane edge, a fast lane and a
     working lane, a service box for the stop and a painted bay for every team, and a
     lit gantry over the entry and the exit so the lane reads from the air */
  const pOn = i => T.pitRamp(i) > 0.02, sg = T.pitSide, nite = !!T.night;
  const pin = i => sg * (T.half - 0.05), pout = i => sg * (T.half + T.pitW * T.pitRamp(i));
  // a strip wants its offsets low to high, or it faces the ground: on the left-hand side they come the other way round
  const ps = (fa, fb, l, u, f) => sg > 0 ? this.strip(T, fa, fb, l, u, f) : this.strip(T, fb, fa, l, u, f);
  const lit = (c, k) => this.mat(c, { emissive:c, emissiveIntensity:nite ? k : k * 0.18, roughness:0.6 });
  this.add(road, ps(pin, pout, lift + 0.03, 8, pOn), nite ? this.mat("#586178", { emissive:"#3A4560", emissiveIntensity:0.6 }) : this.mat(shade(P.road, 0.2)));
  this.add(road, ps(i => sg * (T.half + T.pitW * T.pitRamp(i) - 0.35), pout, lift + 0.04, 8, pOn), lit("#EEF3F8", 1.3));
  // the line between the fast lane and the working lane
  this.add(road, ps(i => sg * (T.half + 0.1 + T.pitW * T.pitRamp(i) * 0.34), i => sg * (T.half + 0.4 + T.pitW * T.pitRamp(i) * 0.34), lift + 0.04, 8,
    i => T.pitRamp(i) > 0.9), lit("#3FA9F5", 1.2));
  this.add(road, ps(sg * (T.half + 0.05), sg * (T.half + 0.5), lift + 0.04, 8,
    i => T.pitRamp(i) > 0.9 && i % 5 < 3), lit("#EEF3F8", 1.3));
  // a painted bay for each team, and the service box where the stops happen
  const bayAt = (bi, col, inner, k) => {
    const bd = ((bi - T.pitBox) % n + n) % n, inB = i => { const d = ((i - bi) % n + n) % n; return T.pitRamp(i) > 0.9 && (d <= 1 || d >= n - 1); };
    this.add(road, ps(sg * (T.half + 1.0), sg * (T.half + T.pitW - 1.0), lift + 0.05, 8, inB), lit(col, k));
    // a solid bay of colour: the dark inner strip that used to sit on top only ever
    // showed through as hatching, and drawing it properly lost the colour altogether
  };
  for(let q = -5; q <= 5; q++){
    const bi = ((T.pitBox + q * 4) % n + n) % n;
    if(q === 0) bayAt(bi, "#FFD23A", this.mat(nite ? "#2A2F3D" : shade(P.road, 0.04)), 2.2);
    else bayAt(bi, TEAMS[(q + 5) % TEAMS.length].body, this.mat(nite ? "#2A2F3D" : shade(P.road, 0.04)), 1.0);
  }
  // the wall, with a lit top rail
  const pw = i => T.pitRamp(i) > 0.9;
  this.add(road, this.wall(T, sg * (T.half + 0.35), 1.0, pw), this.twoSided(this.mat("#D8DCE0")), true);
  this.add(road, ps(sg * (T.half + 0.35), sg * (T.half + 0.75), 1.0, 8, pw), lit("#BFE3FF", 1.5));
  // entry and exit gantries
  if(!this._pitSign){
    const cv = document.createElement("canvas"); cv.width = 256; cv.height = 128;
    const g2 = cv.getContext("2d"); g2.fillStyle = "#1E7FD6"; g2.fillRect(0, 0, 256, 128);
    g2.strokeStyle = "#EEF3F8"; g2.lineWidth = 8; g2.strokeRect(8, 8, 240, 112);
    g2.fillStyle = "#FFFFFF"; g2.font = "900 82px 'Arial Black',sans-serif"; g2.textAlign = "center"; g2.textBaseline = "middle"; g2.fillText("PIT", 128, 70);
    this._pitSign = new THREE.CanvasTexture(cv); this._pitSign.encoding = THREE.sRGBEncoding;
  }
  const gantry = i => {
    const o = sg * (T.half + T.pitW * 0.5), gr = new THREE.Group();
    gr.position.set(T.x[i] + T.nx[i] * o, T.z[i], T.y[i] + T.ny[i] * o); gr.rotation.y = -T.ang[i];
    const hw = T.pitW * 0.5 + 0.9, dark = this.mat("#20242B");
    for(const sd of [-1, 1]){ const m = new THREE.Mesh(new THREE.BoxGeometry(0.45, 5.6, 0.45), dark); m.position.set(0, 2.8, sd * hw); m.castShadow = true; gr.add(m); }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, hw * 2 + 0.45), dark); bar.position.y = 5.6; bar.castShadow = true; gr.add(bar);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 2.6), new THREE.MeshBasicMaterial({ map:this._pitSign, toneMapped:false }));
    sign.rotation.x = -Math.PI / 2; sign.rotation.z = Math.PI / 2; sign.position.y = 5.88; gr.add(sign);
    const rim = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, hw * 2), lit("#3FA9F5", 2.4)); rim.position.set(-0.32, 5.25, 0); gr.add(rim);
    road.add(gr);
  };
  gantry((T.pitIn + Math.round(T.pitSpan * 0.08)) % n);
  gantry((T.pitOut - Math.round(T.pitSpan * 0.08) + n) % n);

  /* start line and grid boxes */
  for(let k = 0; k < 14; k++){
    this.add(road, this.strip(T, -w + (2 * w) * k / 14, -w + (2 * w) * (k + 1) / 14, lift + 0.05, 9,
      i => i === 0 || i === 1), this.mat(k % 2 ? "#141518" : "#F0F0F0"));
  }
  if(S.mode !== "tt") for(let k = 0; k < 11; k++){
    const o = (k % 2 ? 1 : -1) * (w * 0.45);
    this.add(road, this.strip(T, o - 0.9, o + 0.9, lift + 0.045, 9,
      i => i === (3 + k * 2) % n), new THREE.MeshStandardMaterial({ color:new THREE.Color("#F0F0F0"), roughness:0.9, metalness:0, transparent:true, opacity:0.55 }));
  }

  /* barriers — they follow the boundary wherever it goes */
  const boAt = (sd, i) => sd * (w + (sd < 0 ? roL(i) : roR(i)) + (wall ? 1.0 : 2.6));
  const bo = w + ro + (wall ? 1.0 : 2.6);
  if(wall){
    for(const sd of [-1, 1]){
      const rf = sd < 0 ? roL : roR, wide = i => rf(i) > T.def.runoff + 2.5;
      const f = i => boAt(sd, i);
      // concrete along the lap, and TecPro where an escape road ends
      this.add(road, this.wall(T, f, 1.25, i => !wide(i)), this.twoSided(this.mat(P.wall)), true);
      this.add(road, this.strip(T, f, i => f(i) + sd * 0.5, 1.25, 8, i => !wide(i)), this.mat(shade(P.wall, 0.18)));
      this.add(road, this.wall(T, f, 1.15, wide), this.twoSided(this.mat("#1E5FC0")), true);
      this.add(road, this.strip(T, f, i => f(i) + sd * 0.6, 1.15, 8, wide), this.mat("#E8E8EA"));
      // the blocks read as blocks because the top rail is broken up
      this.add(road, this.strip(T, i => f(i) + sd * 0.05, i => f(i) + sd * 0.55, 1.32, 8,
        i => wide(i) && (i % 3 < 2)), this.mat("#F2F2F4"));
    }
  } else {
    for(const sd of [-1, 1]){
      const f = i => boAt(sd, i);
      // where a circuit has a SAFER wall instead, its own builder puts that up
      const armco = i => !(T.safer && T.safer(i, sd));
      this.add(road, this.wall(T, f, 1.0, armco, 0), this.twoSided(this.mat("#C7CDD3")), true);
      this.add(road, this.strip(T, f, i => f(i) + sd * 0.4, 1.0, 8, armco), this.mat("#8A9199"));
      // posts
      const post = new THREE.BoxGeometry(0.18, 1.0, 0.18);
      for(let i = 0; i < n; i += 4){
        if(!armco(i)) continue;
        const o = boAt(sd, i) + sd * 0.2;
        const m = new THREE.Mesh(post, this.mat("#6E757C"));
        m.position.set(T.x[i] + T.nx[i] * o, T.z[i] + bankZ(T, i, o) + 0.5, T.y[i] + T.ny[i] * o);
        m.castShadow = true; road.add(m);
      }
    }
  }

  /* Debris fencing over the concrete, all the way round. One alpha-tested plane
     per side plus instanced posts: it is the single thing that makes a street
     circuit read as streets rather than as a track with walls. */
  if(wall && T.def.fencing !== false){
    const fh = 3.6;
    const fmat = new THREE.MeshStandardMaterial({ map:PTEX.fence(), alphaMap:PTEX.fence(),
      transparent:true, alphaTest:0.28, side:THREE.DoubleSide, roughness:0.6, metalness:0.5,
      color:this.col("#B8C0C8"), depthWrite:true });
    fmat.map.repeat.set(1, 1);
    for(const sd of [-1, 1]){
      const f = i => boAt(sd, i) + sd * 0.25;
      const fg = this.wall(T, f, fh, null, -1.3);
      if(fg){
        // one repeat every four metres up and along
        const uv = fg.attributes.uv;
        for(let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 2.0, uv.getY(k) * (fh / 4));
        uv.needsUpdate = true;
        const fm = new THREE.Mesh(fg, fmat);
        fm.castShadow = false; fm.receiveShadow = false; road.add(fm);
      }
      const pg = new THREE.BoxGeometry(0.16, fh + 1.3, 0.16); pg.translate(0, (fh - 1.3) / 2, 0);
      const list = [];
      for(let i = 0; i < n; i += 3){
        const o = boAt(sd, i) + sd * 0.25;
        list.push([T.x[i] + T.nx[i] * o, T.y[i] + T.ny[i] * o, T.z[i] + 0.65, 0]);
      }
      LB.many(this, road, pg, this.mat("#6E757C", { roughness:0.6, metalness:0.5 }), list, false);
    }
  }

  /* the hillside under a circuit that climbs */
  let zLo = Infinity; for(let i = 0; i < n; i++) zLo = Math.min(zLo, T.z[i]);
  if(!surveyed) for(const sd of [-1, 1])
    this.add(road, this.wall(T, sd * bo, 0.2, i => T.z[i] > zLo + 9, i => T.z[i] - zLo + 1),
      this.twoSided(this.mat(shade(P.ground, -0.2))), true);

  /* the tunnel */
  if(T.def.tunnel && !surveyed){
    const tf = i => T.inTunnel(i);
    this.add(road, this.strip(T, -(w + ro + 2), (w + ro + 2), 5.6, 8, tf), this.mat("#8C8478"));
    for(const sd of [-1, 1]) this.add(road, this.wall(T, sd * (w + ro + 1.6), 5.6, tf), this.twoSided(this.mat("#9A9284")), true);
  }

  /* Monaco: the surveyed town, harbour, tunnel and all */
  this.monaco = null; this.silver = null;
  if(monacoW){
    const before = new Set(this.world.children);
    try{ MONACO.build(this, this.world, T, S); this.monaco = MONACO; this.cutAll(this.world.children.filter(c => !before.has(c))); this.clearPitTrees(this.world, T);
      // the meshes the survey fades by hand keep their identity; the rest can be tiled
      for(const m of (MONACO.fade || [])) if(m && m.userData) m.userData.noSplit = true;
      for(const c of this.world.children) if(!before.has(c)) this.tileSplit(c, 250, 3000); }
    catch(e){ console.warn("monaco", e.message, e.stack); }
  }
  /* Silverstone: the surveyed airfield, the farmland, the Wing and the crowds */
  if(T.def.world === "silverstone" || T.def.world === "zandvoort"){
    const W = T.def.world === "zandvoort" ? ZAND : SILVER;
    try{ W.build(this, this.world, T, S); this.silver = W; }
    catch(e){ console.warn(T.def.world, e.message, e.stack); }
  }

  /* the city, for a circuit that has one described */
  if(!surveyed && (T.def.streets || T.def.garages || T.def.bridges)){
    const town = new THREE.Group();
    try{ CITY.build(this, town, T, S); }catch(e){ console.warn("city", e.message, e.stack); }
    this.world.add(this.bake(town, 400));
  }

  /* the scenery */
  const props = new THREE.Group();
  for(const p of T.props){
    if(p.only2d && surveyed) continue;            // the survey built the real one
    try{ this.prop(props, p, T, S); }catch(e){ console.warn("prop", p.t, p.k, e.message); } }
  const baked = this.bake(props, 260);
  this.world.add(baked);

  /* the cars */
  for(const c of S.cars){ const g = this.car(c); this.world.add(g); this.cars.push({ c, g }); }

  this.applyEnv(T, P);

  /* sparks and debris */
  const sg2 = new THREE.BufferGeometry();
  sg2.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(900), 3));
  this.sparks = new THREE.Points(sg2, new THREE.PointsMaterial({ color:0xFFC35A, size:0.5, sizeAttenuation:true, transparent:true }));
  this.sparks.frustumCulled = false; this.world.add(this.sparks);
};

/* ---- scenery ------------------------------------------------------------
   The simple props get real solids of revolution. The landmarks are already
   written as boxCol/pyramid calls, so those run unchanged with the geometry
   captured instead of painted — see B3 in box()/pyramid()/groundEllipse().  */
const NOCTX = new Proxy({}, {
  get(t, k){
    if(k === "canvas") return { width:1, height:1 };
    return () => ({ addColorStop(){}, width:0, height:0 });
  },
  set(){ return true; }
});

G3.prop = function(parent, p, T, S){
  const g = new THREE.Group(), z = p.z, night = T.night;
  // tall things have to be able to get out of the way on their own, so they stay
  // out of the bake and carry their own materials
  const big = p.t === "sphere" ||
    (p.h > 12 && ["lm", "hotel", "tower", "grandstand", "stadium", "ferris", "garage"].includes(p.t));
  const B = (cx, cy, cz, l, w, h, ang, col, tex) => this.boxAt(g, cx, cy, cz, l, w, h, ang, col, tex);
  const sphere = (cx, cy, cz, r, col, seg) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg || 12, (seg || 12) / 2), this.mat(col));
    m.position.set(cx, cz, cy); m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
  };
  const lamp = (cx, cy, cz, col, inten, dist) => {
    if(!night) return;
    const L = new THREE.PointLight(G3.col(col), inten, dist || 90, 2);
    L.position.set(cx, cz, cy); L.userData.dynamic = true; g.add(L);
  };
  switch(p.t){
    case "tree": {
      B(p.x, p.y, z, 0.8, 0.8, p.h * 0.45, 0, "#4A3A28");
      sphere(p.x, p.y, z + p.h * 0.72, p.h * 0.42, p.col, 10).castShadow = p.h > 14;
      sphere(p.x + p.h * 0.12, p.y - p.h * 0.1, z + p.h * 0.92, p.h * 0.3, shade(p.col, 0.1), 8);
      break; }
    case "palm": {
      B(p.x, p.y, z, 0.5, 0.5, p.h, 0, "#7A6247");
      for(let a = 0; a < 7; a++){
        const th = a / 7 * TAU + p.r * TAU;
        const f = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.18, 0.9), this.mat(p.col));
        f.position.set(p.x + Math.cos(th) * 2.0, z + p.h - 0.3, p.y + Math.sin(th) * 2.0);
        f.rotation.y = -th; f.rotation.z = 0.32; g.add(f);
      }
      break; }
    case "dune": {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8, 0, TAU, 0, Math.PI / 2), this.mat(p.col));
      m.position.set(p.x, z, p.y); m.scale.set(p.h * 2.4, p.h * 0.8, p.h * 1.5);
      m.rotation.y = p.r * TAU; m.receiveShadow = true; m.castShadow = true; g.add(m);
      break; }
    case "grandstand": {
      const wid = p.wid || (26 + p.r * 16);
      // the bank of seats, raked
      const rows = 7;
      for(let k = 0; k < rows; k++){
        const t = k / (rows - 1), off = -4 + t * 8, hh = p.h * (0.30 + 0.62 * t);
        const cx = p.x + Math.cos(p.rot + Math.PI / 2) * off, cy = p.y + Math.sin(p.rot + Math.PI / 2) * off;
        this.boxAt(g, cx, cy, z, wid, 1.5, hh, p.rot, p.col, k ? TEX.seats(p.col, night) : null);
      }
      B(p.x, p.y, z + p.h * 0.94, wid + 2, 13, 0.8, p.rot, shade(p.col, -0.3));
      break; }
    case "hotel": case "tower": {
      const wid = p.t === "tower" ? 14 + p.r * 16 : 16 + p.r * 22;
      const style = p.t === "tower" ? "glass" : (T.def.facade || "hotel");
      B(p.x, p.y, z, wid, wid * 0.8, p.h, p.rot * 0.2 + p.r, p.col, TEX.facade(style, p.col, night));
      B(p.x, p.y, z + p.h, wid + 1, wid * 0.8 + 1, 0.8, p.rot * 0.2 + p.r, shade(p.col, -0.2));
      break; }
    case "yacht": {
      B(p.x, p.y, z - 1.0, 26 + p.r * 18, 7, 3.4, p.rot, p.col);
      B(p.x - 2, p.y, z + 2.4, 11, 5.2, 3.0, p.rot, shade(p.col, -0.06));
      B(p.x - 4, p.y, z + 5.4, 5, 3.4, 2.2, p.rot, "#DCE3E8");
      break; }
    case "pylon": {
      B(p.x, p.y, z, 0.5, 0.5, p.h, 0, p.col);
      // the head glows and drops a pool of light, which is far cheaper than
      // sixty real lamps and reads the same from above
      const head = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 0.8),
        night ? this.glowMat("#FFE0A8", 3.0) : this.mat("#C8CDD3"));
      head.position.set(p.x, z + p.h + 0.25, p.y); head.rotation.y = -p.rot; g.add(head);
      if(night){
        const pool = new THREE.Mesh(new THREE.CircleGeometry(p.h * 0.85, 16),
          this.poolMat("#FFCE86", 0.16));
        pool.rotation.x = -Math.PI / 2; pool.position.set(p.x, z + 0.10, p.y);
        g.add(pool);
      }
      break; }
    case "ferris": {
      B(p.x, p.y, z, 3, 3, p.h * 0.5, 0, "#8A9199");
      const rr = p.h * 0.42;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(rr, rr * 0.035, 8, 40), this.mat(p.col));
      ring.position.set(p.x, z + p.h * 0.72, p.y); ring.rotation.y = p.rot; g.add(ring);
      for(let a = 0; a < 14; a++){
        const th = a / 14 * TAU;
        const cab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.0, 1.8), this.mat(a % 2 ? "#F2F2F2" : p.col));
        cab.position.set(p.x + Math.cos(th) * rr * Math.cos(p.rot), z + p.h * 0.72 + Math.sin(th) * rr,
                         p.y + Math.cos(th) * rr * Math.sin(p.rot));
        g.add(cab);
      }
      lamp(p.x, p.y, z + p.h * 0.72, p.col, 2.0, 200);
      break; }
    case "stadium": {
      const rx = 150, ry = 62, segs = 30, ca = Math.cos(p.rot), sa = Math.sin(p.rot);
      for(let q = 0; q < segs; q++){
        const th = q / segs * TAU;
        if(Math.abs(Math.sin(th)) < 0.3) continue;
        const lx = Math.cos(th) * rx, ly = Math.sin(th) * ry;
        const cx = p.x + lx * ca - ly * sa, cy = p.y + lx * sa + ly * ca;
        const tall = p.h * (0.55 + 0.45 * Math.abs(Math.sin(th)));
        const rot2 = p.rot + Math.atan2(Math.sin(th) * rx, Math.cos(th) * ry) + Math.PI / 2;
        this.boxAt(g, cx, cy, z, 30, 16, tall, rot2, p.col, TEX.seats(p.col, night));
        this.boxAt(g, cx, cy, z + tall, 30, 17, 1.2, rot2, shade(p.col, -0.3));
      }
      break; }
    case "neon": {
      B(p.x, p.y, z, 1.0, 1.0, p.h * 0.45, 0, "#2A2A32");
      // the tubes are the light, not a box lit by one
      for(let k = 0; k < 4; k++){
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, p.h * 0.10, 6.5),
          night ? this.glowMat(p.col, 3.4) : this.mat(p.col));
        m.position.set(p.x, z + p.h * 0.5 + k * p.h * 0.13 + p.h * 0.05, p.y);
        m.rotation.y = -p.rot; g.add(m);
      }
      lamp(p.x, p.y, z + p.h * 0.75, p.col, 1.6, 90);
      break; }
    case "sphere": {
      /* The Sphere.
         Published dimensions: 366 ft tall by 516 ft wide — 111.6 m by 157 m —
         so it is markedly wider than it is tall, and a plain ball of the right
         height would be 45 m too narrow. A sphere of radius 78.5 m whose centre
         sits 33.1 m above grade is exactly 111.6 m to the crown and exactly
         157 m across at its widest, which is a third of the way up. That is the
         profile used here: a sphere truncated below its equator, revolved from
         a lathe so the silhouette is under our control rather than the
         tessellator's, and cut off a few metres up where the LED skin stops and
         the podium takes over. See SPHERE.LAT0 for how the picture is laid on it. */
      const HT = p.h, R = HT * 0.7034, CZ = HT - R;          // 111.6 -> 78.5 and 33.1
      const zb = HT * 0.054;                                  // the skin stops here
      const lat0 = Math.asin(clamp((zb - CZ) / R, -1, 1));    // about -20 degrees
      const NV = 88;                                          // vertical samples: the
      const NU = 128;                                         // silhouette has to be clean at TV range
      const prof = [];
      // a crisp lip where the skin meets the plinth, then the ball
      prof.push(new THREE.Vector2(R * Math.cos(lat0) * 0.965, zb - 1.2));
      for(let i = 0; i <= NV; i++){
        const la = lat0 + (Math.PI / 2 - lat0) * (i / NV);
        prof.push(new THREE.Vector2(Math.max(0.01, R * Math.cos(la)), CZ + R * Math.sin(la)));
      }
      const geo = new THREE.LatheGeometry(prof, NU);
      // Lathe lays v out by profile index. The picture is drawn in latitude, so
      // rewrite v as the latitude each ring actually sits at: the graphics then
      // wrap the curvature instead of bunching at the crown.
      {
        const pos = geo.attributes.position, uv = geo.attributes.uv;
        for(let i = 0; i < pos.count; i++){
          const y = pos.getY(i), x = pos.getX(i), zz = pos.getZ(i);
          const rr = Math.hypot(x, zz);
          const la = Math.atan2(y - CZ, Math.max(rr, 1e-4)) * 180 / Math.PI;
          uv.setY(i, clamp(0.5 + la / 180, 0, 1));
        }
        uv.needsUpdate = true;
      }

      const cv = document.createElement("canvas"); cv.width = SPHERE.W; cv.height = SPHERE.H;
      const tx = G3.srgb(new THREE.CanvasTexture(cv));
      tx.wrapS = tx.wrapT = THREE.ClampToEdgeWrapping;
      tx.anisotropy = 8;
      // near black off, white light on: the picture lives entirely in the
      // emissive channel, which is what lets it blow past 1.0 and bloom
      const mat = new THREE.MeshStandardMaterial({
        color:G3.col("#08080C"), roughness:0.46, metalness:0.20,
        emissiveMap:tx, emissive:new THREE.Color(1, 1, 1), emissiveIntensity:1.05,
        normalMap:PTEX.facetsBall(), normalScale:new THREE.Vector2(0.24, 0.24),
        envMapIntensity:0.9,
      });
      /* The picture is drawn flat and wrapped here rather than in the canvas.
         vUv is equirectangular on the ball, so rebuild the surface normal from
         it, then project orthographically about a point tilted up to meet the
         camera: the poster reads undistorted head-on and curves away at the
         limb, which is what a flat video mapped onto the real Exosphere does.
         Doing it in the shader costs nothing; doing it per pixel in the canvas
         every frame would cost milliseconds. */
      mat.onBeforeCompile = sh => {
        sh.uniforms.uTilt = { value: SPHERE.TILT };
        sh.uniforms.uScale = { value: SPHERE.SCALE };
        sh.fragmentShader = "uniform float uTilt;\nuniform float uScale;\n" + sh.fragmentShader
          .replace("#include <emissivemap_fragment>", `
        #ifdef USE_EMISSIVEMAP
          float lon = vUv.x * 6.283185307;
          float lat = (vUv.y - 0.5) * 3.141592654;
          float cl = cos(lat);
          vec3 nrm = vec3(cl * sin(lon), sin(lat), cl * cos(lon));
          float sp = sin(uTilt), cp = cos(uTilt);
          float facing = nrm.y * sp + nrm.z * cp;
          vec2 pv = vec2(nrm.x, nrm.y * cp - nrm.z * sp) * (0.5 / uScale) + 0.5;
          vec4 emissiveColor = vec4(0.0);
          if(facing > 0.0){
            emissiveColor = texture2D(emissiveMap, pv);
            emissiveColor.rgb = emissiveMapTexelToLinear(emissiveColor).rgb;
            emissiveColor.rgb *= smoothstep(0.0, 0.26, facing);
          }
          // the pucks, in the surface's own space rather than the picture's
          emissiveColor.rgb *= 0.90 + 0.10 * cos(vUv.y * 3.141592654 * 320.0);
          totalEmissiveRadiance *= emissiveColor.rgb;
        #endif`);
      };
      // the injected uniforms change the program, so give it its own cache key
      mat.customProgramCacheKey = () => "sphereProj";
      const m = new THREE.Mesh(geo, mat);
      m.position.set(p.x, z, p.y);
      /* The poster's centre projects to local +Z, which LatheGeometry puts at
         u = 0. A quarter turn aims that at the camera's 45-degree azimuth. Set
         once, and then left alone — it never tracks the camera. */
      m.rotation.y = Math.PI * 0.25;
      m.castShadow = false; m.receiveShadow = false;
      m.userData.dynamic = true; g.add(m);

      /* the plinth: a low dark ring with a lit edge where it meets the ball */
      const pr = R * Math.cos(lat0) * 1.02;
      const pod = new THREE.Mesh(new THREE.CylinderGeometry(pr, pr * 1.06, zb, 64, 1, false),
        this.mat("#0E0C14", { roughness:0.9, metalness:0.1 }));
      pod.position.set(p.x, z + zb / 2, p.y); pod.receiveShadow = true; g.add(pod);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(pr * 1.005, pr * 1.005, 0.9, 64, 1, true),
        this.glowMat("#3C6EA8", 1.5, { side:THREE.DoubleSide }));
      rim.position.set(p.x, z + zb - 0.5, p.y); g.add(rim);
      // the apron it stands on
      const apron = new THREE.Mesh(new THREE.CylinderGeometry(pr * 1.5, pr * 1.55, 1.2, 48),
        this.mat("#15131C"));
      apron.position.set(p.x, z + 0.6, p.y); apron.receiveShadow = true; g.add(apron);

      const L = new THREE.PointLight(0xFFC85A, 3.2, 640, 2);
      L.position.set(p.x, z + CZ, p.y); L.userData.dynamic = true; g.add(L);
      this.dyn.push({ kind:"sphere", cv, tx, light:L, ctx:cv.getContext("2d"),
                      mesh:m, probe:document.createElement("canvas"), tick:0 });
      break; }
    case "billboard": {
      B(p.x, p.y, z, 0.6, 0.6, p.h * 0.55, 0, "#5A6069");
      const bw2 = 9 + p.r * 4, bh2 = p.h * 0.45;
      B(p.x, p.y, z + p.h * 0.55, 0.55, bw2, bh2, p.rot, "#23262E");
      // the lit face, on the side the camera is on
      const agEO = new THREE.PlaneGeometry(bw2 * 0.94, bh2 * 0.88), amat = ADS.mat(p.r, night);
      const fgrp = new THREE.Group();
      const fa = new THREE.Mesh(agEO, amat); fa.position.z = 0.30; fgrp.add(fa);
      const fb = new THREE.Mesh(agEO, amat); fb.position.z = -0.30; fb.rotation.y = Math.PI; fgrp.add(fb);
      fgrp.position.set(p.x, z + p.h * 0.55 + bh2 / 2, p.y);
      fgrp.rotation.y = -p.rot + Math.PI / 2;
      g.add(fgrp);
      break; }
    case "arch": {
      const w2 = T.half + T.runoff + 3;
      const nx = Math.cos(p.rot + Math.PI / 2), ny = Math.sin(p.rot + Math.PI / 2);
      for(const s of [-1, 1]) B(p.x + nx * w2 * s, p.y + ny * w2 * s, z, 1.4, 1.4, p.h, p.rot, "#3C434C");
      B(p.x, p.y, z + p.h, 1.8, w2 * 2 + 2, 1.7, p.rot, p.col);
      break; }
    case "marshal": {
      B(p.x, p.y, z, 2.2, 2.2, p.h, p.rot, p.col);
      B(p.x, p.y, z + p.h, 2.8, 2.8, 0.3, p.rot, "#D8352A");
      break; }
    case "fence": {
      B(p.x, p.y, z, 0.2, 7, p.h, p.rot, p.col);
      break; }
    case "garage": {
      B(p.x, p.y, z, 22, 9, p.h, p.rot, p.col, TEX.garage(p.col));
      B(p.x, p.y, z + p.h, 24, 10, 0.7, p.rot, shade(p.col, -0.28));
      break; }
    case "banking": {
      B(p.x, p.y, z, 90, 9, 9, p.rot, p.col);
      break; }
    default: {
      // A landmark with a builder of its own gets purpose-made geometry. Anything
      // without one falls back to its box-and-pyramid recipe, captured as
      // geometry rather than painted — which is still what most circuits use.
      if(p.t === "lm" && LM3[p.k]){
        LM3[p.k](this, g, p, T, S);
      } else {
        setB3({ g, self:this });
        try{ drawProp(NOCTX, p, T, S); } finally { setB3(null); }
        if(night && (p.t === "lm")) lamp(p.x, p.y, z + p.h * 0.6, "#FFD9A0", 1.1, p.h * 2.2);
      }
      break; }
  }
  if(big){
    const meshes = [];
    g.traverse(o => {
      if(!o.isMesh && !o.isInstancedMesh) return;
      o.userData.dynamic = true;
      // a mesh may carry several materials — the extruded sign has a face and a
      // side — so every one of them needs its own copy to fade
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      const cl = ms.map(m => {
        const c = m.clone();
        // Material.copy does not carry a shader hook, so a cloned material
        // silently loses its onBeforeCompile and falls back to the stock
        // shader. The Sphere's whole projection lives in that hook.
        if(m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile){
          c.onBeforeCompile = m.onBeforeCompile;
          c.customProgramCacheKey = m.customProgramCacheKey;
          c.needsUpdate = true;
        }
        c.transparent = true; c.depthWrite = true; return c;
      });
      o.material = Array.isArray(o.material) ? cl : cl[0];
      meshes.push(o);
    });
    if(meshes.length){
      // the Sphere is wider than it is tall, so its footprint is not its height
      const rad = p.t === "sphere" ? p.h * 0.72 : Math.max(16, p.h * 0.4);
      this.occluders.push({ meshes, x:p.x, y:p.y, z:z + p.h * (p.t === "sphere" ? 0.30 : 0.5),
                            rx:rad, ry:p.h * (p.t === "sphere" ? 0.62 : 0.55), fade:1 });
    }
  }
  parent.add(g);
  return g;
};

/* ---- the cars ----------------------------------------------------------
   Built from simple faceted shapes in the dimensions of CAR_SPEC: a lofted tub
   and nose, sculpted sidepods, a floor with its diffuser, the halo, three-
   element front wing and two-element rear wing with moving flaps, suspension
   arms, and lathe-turned tyres. Every static piece is one vertex-coloured mesh,
   built once per team and shared between its cars; only the wheels, the flaps
   and the lights move. */
const CARGEO = {
  cache:new Map(),
  // a triangle soup with a colour per triangle, in the car's real-world frame
  // (d = metres behind the front axle, y = metres out, z = metres up)
  soup(){ return { p:[], c:[] }; },
  // wind every triangle so it faces away from a point inside the solid
  tri(b, a, q, r, col, inside){
    const ux = q[0] - a[0], uy = q[1] - a[1], uz = q[2] - a[2], vx = r[0] - a[0], vy = r[1] - a[1], vz = r[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const cx = (a[0] + q[0] + r[0]) / 3 - inside[0], cy = (a[1] + q[1] + r[1]) / 3 - inside[1], cz = (a[2] + q[2] + r[2]) / 3 - inside[2];
    // (d, y, z) -> (x, y, z) of the group is d reversed and y, z swapped: two flips, so the
    // winding survives the mapping and a face pointing away from the inside stays that way
    if(nx * cx + ny * cy + nz * cz < 0){ const t = q; q = r; r = t; }
    b.p.push(a[0], a[1], a[2], q[0], q[1], q[2], r[0], r[1], r[2]);
    for(let k = 0; k < 3; k++) b.c.push(col.r, col.g, col.b);
  },
  quad(b, a, q, r, s, col, inside){ this.tri(b, a, q, r, col, inside); this.tri(b, a, r, s, col, inside); },
  // rings of points, one per section, stitched into a skin; colour decided per face
  skin(b, rings, colOf, capA, capB){
    for(let i = 0; i < rings.length - 1; i++){
      const A = rings[i], B2 = rings[i + 1], m = A.length;
      const inside = [(A.c[0] + B2.c[0]) / 2, (A.c[1] + B2.c[1]) / 2, (A.c[2] + B2.c[2]) / 2];
      for(let k = 0; k < m; k++){
        const a = A[k], q = A[(k + 1) % m], r = B2[(k + 1) % m], s = B2[k];
        const cx = (a[0] + q[0] + r[0] + s[0]) / 4, cy = (a[1] + q[1] + r[1] + s[1]) / 4, cz = (a[2] + q[2] + r[2] + s[2]) / 4;
        // which way the face looks: out from the ring centre
        const oy = cy - inside[1], oz = cz - inside[2];
        this.quad(b, a, q, r, s, colOf(cx, cy, cz, oy, oz), inside);
      }
    }
    for(const [R0, col, dir] of [[rings[0], capA, -1], [rings[rings.length - 1], capB, 1]]){
      if(!col) continue;
      const inside = [R0.c[0] - dir * 0.3, R0.c[1], R0.c[2]];            // the solid lies behind the first ring, ahead of the last
      for(let k = 0; k < R0.length; k++) this.tri(b, R0.c, R0[k], R0[(k + 1) % R0.length], col, inside);
    }
  },
  ring(pts, d, yc){
    const r = pts.map(([y, z]) => [d, yc + y, z]);
    let sy = 0, sz = 0; for(const [y, z] of pts){ sy += y; sz += z; }
    r.c = [d, yc + sy / pts.length, sz / pts.length];
    return r;
  },
  box(b, d, y, z, l, w, h, col, topShrink){
    const k = topShrink || 1, P = [];
    for(const [dz, s] of [[0, 1], [h, k]]) for(const [dd, dy] of [[-l / 2, -w / 2], [l / 2, -w / 2], [l / 2, w / 2], [-l / 2, w / 2]])
      P.push([d + dd * s, y + dy * s, z + dz]);
    const inside = [d, y, z + h / 2];
    this.quad(b, P[0], P[1], P[2], P[3], col, inside); this.quad(b, P[4], P[5], P[6], P[7], col, inside);
    for(let i = 0; i < 4; i++){ const j = (i + 1) % 4; this.quad(b, P[i], P[j], P[j + 4], P[i + 4], col, inside); }
  },
  // a thin tube with a few sides between two points
  tube(b, p0, p1, r, col, sides){
    sides = sides || 5;
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2], L = Math.hypot(dx, dy, dz) || 1;
    const t = [dx / L, dy / L, dz / L];
    let u = Math.abs(t[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    let v = [t[1] * u[2] - t[2] * u[1], t[2] * u[0] - t[0] * u[2], t[0] * u[1] - t[1] * u[0]];
    const vl = Math.hypot(...v); v = v.map(x => x / vl);
    u = [v[1] * t[2] - v[2] * t[1], v[2] * t[0] - v[0] * t[2], v[0] * t[1] - v[1] * t[0]];
    const ring = (p, s) => [...Array(sides)].map((_, k) => { const a = k / sides * TAU;
      return [p[0] + (u[0] * Math.cos(a) + v[0] * Math.sin(a)) * r * s, p[1] + (u[1] * Math.cos(a) + v[1] * Math.sin(a)) * r * s, p[2] + (u[2] * Math.cos(a) + v[2] * Math.sin(a)) * r * s]; });
    const A = ring(p0, 1), B2 = ring(p1, 1), inside = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2];
    for(let k = 0; k < sides; k++){ const j = (k + 1) % sides;
      // each face's own inside: the axis point beside it
      this.quad(b, A[k], A[j], B2[j], B2[k], col, inside); }
  },
  // a flat plate: an outline in (d, z) given a thickness in y, or in (d, y) with a thickness in z
  plateY(b, pts, y, thick, col){
    const n = pts.length, A = pts.map(([d, z]) => [d, y - thick / 2, z]), B2 = pts.map(([d, z]) => [d, y + thick / 2, z]);
    let cd = 0, cz = 0; for(const [d, z] of pts){ cd += d; cz += z; } cd /= n; cz /= n;
    const inside = [cd, y, cz];
    for(let k = 1; k < n - 1; k++){ this.tri(b, A[0], A[k], A[k + 1], col, inside); this.tri(b, B2[0], B2[k], B2[k + 1], col, inside); }
    for(let k = 0; k < n; k++){ const j = (k + 1) % n; this.quad(b, A[k], A[j], B2[j], B2[k], col, [cd, y, cz]); }
  },
  slabZ(b, pts, z0, z1, col, colTop){
    const n = pts.length, A = pts.map(([d, y]) => [d, y, z0]), B2 = pts.map(([d, y]) => [d, y, z1]);
    let cd = 0, cy = 0; for(const [d, y] of pts){ cd += d; cy += y; } cd /= n; cy /= n;
    const inside = [cd, cy, (z0 + z1) / 2];
    for(let k = 1; k < n - 1; k++){ this.tri(b, A[0], A[k], A[k + 1], col, inside); this.tri(b, B2[0], B2[k], B2[k + 1], colTop || col, inside); }
    for(let k = 0; k < n; k++){ const j = (k + 1) % n; this.quad(b, A[k], A[j], B2[j], B2[k], col, inside); }
  },
  // one wing element: an aerofoil section run across the span, the tips rising.
  // Built about its own leading edge so it can be turned there.
  wing(b, o){
    const st = o.stations || 9, prof = [[0, 0], [0.22, 0.55], [0.6, 0.42], [1, 0.04], [0.6, -0.22], [0.22, -0.3]];
    const rings = [];
    for(let s = 0; s < st; s++){
      const f = s / (st - 1) * 2 - 1, y = f * o.span / 2, rise = (o.tipRise || 0) * Math.pow(Math.abs(f), 3);
      const chord = o.chord * (1 - (o.tipTaper || 0) * Math.pow(Math.abs(f), 2));
      const ca = Math.cos(o.aoa || 0), sa = Math.sin(o.aoa || 0);
      const r = prof.map(([u, v]) => { const uu = u * chord, vv = v * o.thick;
        return [o.d + uu * ca, y, o.z + rise + uu * sa + vv * ca]; });
      let cd = 0, cz = 0; for(const q of r){ cd += q[0]; cz += q[2]; }
      r.c = [cd / r.length, y, cz / r.length];
      rings.push(r);
    }
    // stitch across the span; the tips are the caps
    const col = o.col;
    for(let i = 0; i < rings.length - 1; i++){
      const A = rings[i], B2 = rings[i + 1], m = A.length, inside = [(A.c[0] + B2.c[0]) / 2, (A.c[1] + B2.c[1]) / 2, (A.c[2] + B2.c[2]) / 2];
      for(let k = 0; k < m; k++) this.quad(b, A[k], A[(k + 1) % m], B2[(k + 1) % m], B2[k], col, inside);
    }
    for(const R0 of [rings[0], rings[rings.length - 1]]){
      const inside = [R0.c[0], R0.c[1] * 0.9, R0.c[2]];
      for(let k = 1; k < R0.length - 1; k++) this.tri(b, R0[0], R0[k], R0[k + 1], col, inside);
    }
  },
  // out of the real-world frame into the car group's (x forward, y up, z out)
  geo(b){
    const n = b.p.length / 3, pos = new Float32Array(n * 3), S = CAR_SPEC;
    for(let i = 0; i < n; i++){ pos[i * 3] = S.X(b.p[i * 3]); pos[i * 3 + 1] = S.Z(b.p[i * 3 + 2]); pos[i * 3 + 2] = S.Y(b.p[i * 3 + 1]); }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(b.c, 3));
    g.computeVertexNormals(); g.computeBoundingSphere();
    return g;
  },
  // the same, but about a pivot, for a flap that turns on its leading edge
  geoAbout(b, d0, z0){
    const g = this.geo(b), S = CAR_SPEC, p = g.attributes.position;
    for(let i = 0; i < p.count; i++){ p.setX(i, p.getX(i) - S.X(d0)); p.setY(i, p.getY(i) - S.Z(z0)); }
    g.computeBoundingSphere();
    return g;
  },

  /* ---- the pieces, per team ---- */
  TUB:[ // d, half width, bottom, top, top-width fraction: nose tip to crash structure
    [-0.98, 0.085, 0.130, 0.250, 0.50], [-0.70, 0.125, 0.150, 0.320, 0.55], [-0.35, 0.165, 0.165, 0.400, 0.60],
    [0.05, 0.210, 0.175, 0.480, 0.62], [0.50, 0.270, 0.120, 0.560, 0.65], [0.95, 0.340, 0.070, 0.640, 0.70],
    [1.30, 0.370, 0.060, 0.640, 0.72], [1.62, 0.370, 0.060, 0.700, 0.66], [1.80, 0.340, 0.060, 0.960, 0.30],
    [2.15, 0.310, 0.060, 0.900, 0.36], [2.60, 0.270, 0.060, 0.740, 0.46], [3.05, 0.190, 0.080, 0.580, 0.56],
    [3.45, 0.120, 0.120, 0.460, 0.62], [3.85, 0.080, 0.180, 0.400, 0.70], [4.05, 0.070, 0.220, 0.360, 0.70]],
  POD:[ // d, outer half width, bottom, top, undercut: the coke bottle
    [1.18, 0.60, 0.17, 0.53, 0.05], [1.45, 0.70, 0.12, 0.58, 0.12], [1.90, 0.68, 0.10, 0.55, 0.14],
    [2.40, 0.56, 0.09, 0.47, 0.12], [2.85, 0.40, 0.08, 0.38, 0.08], [3.15, 0.27, 0.08, 0.30, 0.04]],
  tubTop(d){
    const T = this.TUB;
    for(let i = 0; i < T.length - 1; i++) if(d >= T[i][0] && d <= T[i + 1][0]){
      const f = (d - T[i][0]) / (T[i + 1][0] - T[i][0]);
      return { top:lerp(T[i][3], T[i + 1][3], f), w:lerp(T[i][1], T[i + 1][1], f) * lerp(T[i][4], T[i + 1][4], f) };
    }
    return { top:0.3, w:0.1 };
  },
  palette(G, t){
    const c = x => G.col(x);
    return {
      body:c(t.body), body2:c(shade(t.body, -0.14)), nose:c(t.accent), accent:c(t.accent), accent2:c(t.accent2 || t.accent),
      carbon:c(t.carbon || "#1A1D22"), black:c("#16181C"), dark:c("#0B0D10"), under:c("#121418"),
    };
  },
  team(G, t){
    const key = t.id;
    let E = this.cache.get(key);
    if(E) return E;
    const C = this.palette(G, t);
    E = { body:this.buildBody(C, false), bodyChipped:null, C,
          fw:this.buildFrontWing(C), fwFlap:this.buildFrontFlaps(C), rw:this.buildRearWing(C), rwFlap:this.buildRearFlap(C),
          fwStub:this.buildFwStub(C), rwStub:this.buildRwStub(C) };
    this.cache.set(key, E);
    return E;
  },
  chipped(G, t){ const E = this.team(G, t); if(!E.bodyChipped) E.bodyChipped = this.buildBody(E.C, true); return E.bodyChipped; },

  buildBody(C, chipped){
    const b = this.soup();
    /* the tub: nose, monocoque, airbox and engine cover in one loft */
    const oct = (w, zb, zt, tw) => { const h = zt - zb;
      return [[w * 0.72, zb], [w, zb + h * 0.28], [w, zb + h * 0.72], [w * tw, zt], [-w * tw, zt], [-w, zb + h * 0.72], [-w, zb + h * 0.28], [-w * 0.72, zb]]; };
    const rings = this.TUB.map(([d, w, zb, zt, tw]) => this.ring(oct(w, zb, zt, tw), d, 0));
    this.skin(b, rings, (d, y, z, oy, oz) => {
      if(oz < -0.02 && Math.abs(oz) > Math.abs(oy)) return C.under;              // the underside
      if(d < -0.34) return C.nose;                                               // the nose in the contrast colour
      if(d > 1.0 && d < 1.62 && z > 0.58 && Math.abs(y) < 0.29) return C.dark;   // into the cockpit
      if(d > 1.62 && d < 1.80 && z > 0.62) return C.dark;                        // the airbox mouth
      if(d > 1.9 && d < 3.5 && Math.abs(y) < 0.075 && oz > 0) return C.accent;    // a spine stripe along the engine cover
      return C.body;
    }, C.nose, C.carbon);
    /* sidepods: an inlet at the front, an undercut, and a taper into the floor */
    for(const sd of [-1, 1]){
      const rs = this.POD.map(([d, w, zb, zt, uc]) => {
        const pts = [[0.20, zt], [w - 0.10, zt], [w, zt - 0.10], [w, zb + 0.16], [w - uc, zb], [0.20, zb]].map(([y, z]) => [y * sd, z]);
        return this.ring(pts, d, 0);
      });
      this.skin(b, rs, (d, y, z, oy, oz) => {
        // the livery cut: a band running down and back across the pod
        if(oz < -0.02 && Math.abs(oz) > Math.abs(oy) * 0.8) return C.under;
        const k = (d - 1.18) / (3.15 - 1.18) - (Math.abs(y) - 0.2) * 0.55;
        if(z > 0.30 && k > 0.30 && k < 0.46) return C.accent2;
        return C.body;
      }, C.dark, C.body2);
    }
    /* the floor, its edges, and the diffuser */
    const fl = [[0.45, 0.36], [0.75, 0.66], [1.25, 0.76], [2.70, 0.76], [3.10, 0.60], [3.30, 0.54]];
    const inner = fl.map(([d, y]) => [d, Math.min(y, 0.64)]);
    this.slabZ(b, [...inner.map(([d, y]) => [d, y]), ...inner.slice().reverse().map(([d, y]) => [d, -y])], 0.025, 0.05, C.black);
    for(const sd of [-1, 1]){
      if(chipped && sd < 0){
        // a bite out of the left-hand edge: just the front and the back of it survive
        this.slabZ(b, [[0.75, -0.64], [1.25, -0.76], [1.25, -0.64]], 0.025, 0.05, C.black);
        this.slabZ(b, [[1.25, -0.64], [1.25, -0.76], [1.55, -0.71], [1.60, -0.64]], 0.025, 0.05, C.black);
        this.slabZ(b, [[2.35, -0.64], [2.45, -0.71], [2.70, -0.76], [3.10, -0.64]], 0.025, 0.05, C.black);
        continue;
      }
      this.slabZ(b, [[0.75, 0.64 * sd], [1.25, 0.76 * sd], [2.70, 0.76 * sd], [3.10, 0.64 * sd]], 0.025, 0.05, C.black);
      // the floor-edge fence
      this.plateY(b, [[1.30, 0.05], [2.60, 0.05], [2.60, 0.10], [1.40, 0.12]], 0.745 * sd, 0.012, C.carbon);
    }
    // the diffuser ramp, its side walls and three strakes
    const ramp = [[3.25, -0.50, 0.04], [3.25, 0.50, 0.04], [3.95, 0.50, 0.30], [3.95, -0.50, 0.30]];
    this.quad(b, ramp[0], ramp[1], ramp[2], ramp[3], C.black, [3.6, 0, 0.35]);
    this.quad(b, ramp[0], ramp[1], ramp[2], ramp[3], C.black, [3.6, 0, -0.2]);
    for(const y of [-0.5, 0.5]) this.plateY(b, [[3.25, 0.04], [3.95, 0.30], [3.95, 0.34], [3.25, 0.10]], y, 0.02, C.carbon);
    for(const y of [-0.24, 0, 0.24]) this.plateY(b, [[3.35, 0.05], [3.92, 0.28], [3.92, 0.10], [3.45, 0.05]], y, 0.014, C.black);
    // a low shark fin on the engine cover
    this.plateY(b, [[2.05, 0.90], [3.30, 0.60], [3.40, 0.48], [2.20, 0.74]], 0, 0.02, C.body2);
    /* the cockpit: halo, headrest, mirrors */
    const H = CAR_SPEC.R.haloTop, hr = 0.045;
    const halo = [[1.62, 0.30, 0.66], [1.50, 0.29, 0.86], [1.30, 0.25, H - 0.015], [1.10, 0.14, H], [1.00, 0, H]];
    for(const sd of [-1, 1]) for(let i = 0; i < halo.length - 1; i++)
      this.tube(b, [halo[i][0], halo[i][1] * sd, halo[i][2]], [halo[i + 1][0], halo[i + 1][1] * sd, halo[i + 1][2]], hr, C.carbon, 6);
    this.tube(b, [1.00, 0, H], [0.92, 0, 0.78], hr * 1.1, C.carbon, 6);
    this.tube(b, [0.92, 0, 0.78], [0.86, 0, 0.64], hr * 1.2, C.carbon, 6);
    this.box(b, 1.52, 0, 0.62, 0.14, 0.40, 0.10, C.body2, 0.85);                     // headrest behind the helmet
    this.box(b, 1.24, 0, 0.72, 0.05, 0.20, 0.035, C.dark);                           // visor strip (the helmet's own is in the driver mesh)
    for(const sd of [-1, 1]){
      this.tube(b, [1.02, 0.34 * sd, 0.58], [1.02, 0.52 * sd, 0.63], 0.014, C.carbon, 4);
      this.box(b, 1.03, 0.57 * sd, 0.60, 0.07, 0.15, 0.075, C.body, 0.9);
    }
    // the two front-wing pylons under the nose
    for(const sd of [-1, 1]) this.plateY(b, [[-0.92, 0.10], [-0.62, 0.10], [-0.62, 0.17], [-0.90, 0.14]], 0.07 * sd, 0.02, C.carbon);
    /* suspension: wishbones and push/pull rods at each corner, and brake-duct fairings */
    const R2 = CAR_SPEC.R, yf = R2.trackF / 2, yr = R2.trackR / 2;
    for(const sd of [-1, 1]){
      const ar = (p, q, r) => this.tube(b, [p[0], p[1] * sd, p[2]], [q[0], q[1] * sd, q[2]], r || 0.016, C.black, 4);
      const uf = [0.0, yf - 0.10, 0.44], lf = [0.02, yf - 0.10, 0.17];
      ar([-0.18, 0.16, 0.46], uf); ar([0.22, 0.20, 0.48], uf); ar([-0.22, 0.16, 0.20], lf); ar([0.26, 0.20, 0.22], lf);
      ar([0.02, yf - 0.14, 0.20], [-0.05, 0.20, 0.52], 0.02);
      this.box(b, 0.08, (yf - 0.20) * sd, 0.26, 0.26, 0.06, 0.18, C.body2);
      const ur = [3.40, yr - 0.14, 0.44], lr = [3.40, yr - 0.14, 0.17];
      ar([3.10, 0.20, 0.44], ur); ar([3.62, 0.18, 0.42], ur); ar([3.05, 0.22, 0.18], lr); ar([3.65, 0.20, 0.18], lr);
      ar([3.40, yr - 0.18, 0.42], [3.10, 0.20, 0.22], 0.02);
    }
    return this.geo(b);
  },
  buildFrontWing(C){
    const b = this.soup(), half = CAR_SPEC.R.fwSpan / 2;
    // the main plane, curling up to the endplates
    this.wing(b, { d:-1.05, z:0.085, chord:0.27, thick:0.05, aoa:-0.10, span:half * 2, tipRise:0.07, col:C.accent, stations:11 });
    for(const sd of [-1, 1]){
      // endplate, and the footplate turning out at its foot
      this.plateY(b, [[-1.07, 0.06], [-0.55, 0.06], [-0.50, 0.17], [-0.62, 0.25], [-0.96, 0.22]], half * sd, 0.022, C.accent2);
      this.slabZ(b, [[-1.02, half * sd], [-0.58, half * sd], [-0.62, (half - 0.09) * sd], [-0.98, (half - 0.07) * sd]], 0.055, 0.07, C.accent2);
    }
    return this.geo(b);
  },
  // the two flaps, about the first flap's leading edge, so the pair can turn together
  FWF:{ d:-0.84, z:0.12 },
  buildFrontFlaps(C){
    const b = this.soup(), half = CAR_SPEC.R.fwSpan / 2 - 0.02, P = this.FWF;
    this.wing(b, { d:P.d, z:P.z, chord:0.19, thick:0.035, aoa:0.30, span:half * 2, tipRise:0.12, tipTaper:0.15, col:C.accent });
    this.wing(b, { d:P.d + 0.15, z:P.z + 0.075, chord:0.15, thick:0.03, aoa:0.52, span:half * 2 - 0.08, tipRise:0.14, tipTaper:0.2, col:C.body });
    return this.geoAbout(b, P.d, P.z);
  },
  buildRearWing(C){
    const b = this.soup(), half = CAR_SPEC.R.rwSpan / 2, top = CAR_SPEC.R.rwTop;
    this.wing(b, { d:3.93, z:0.70, chord:0.30, thick:0.06, aoa:0.14, span:half * 2, tipRise:-0.02, col:C.accent });
    // the beam wing, low down behind the diffuser
    this.wing(b, { d:3.92, z:0.40, chord:0.20, thick:0.04, aoa:0.18, span:half * 1.6, col:C.carbon, stations:5 });
    for(const sd of [-1, 1]){
      // a slim endplate, cut away low down the way the 2026 wings are
      this.plateY(b, [[3.97, 0.60], [4.40, 0.58], [4.47, top - 0.05], [4.36, top], [4.02, top - 0.03], [3.94, top - 0.12]], half * sd, 0.024, C.accent2);
      this.plateY(b, [[4.02, 0.36], [4.30, 0.36], [4.30, 0.60], [4.05, 0.62]], half * 0.88 * sd, 0.02, C.carbon);
    }
    // the swan-neck support
    this.plateY(b, [[3.95, 0.30], [4.12, 0.30], [4.10, 0.72], [4.00, 0.72]], 0, 0.03, C.carbon);
    // the rear crash structure, where the rain light sits
    this.box(b, 4.12, 0, 0.24, 0.16, 0.13, 0.10, C.carbon);
    return this.geo(b);
  },
  RWF:{ d:4.19, z:0.79 },
  buildRearFlap(C){
    const b = this.soup(), half = CAR_SPEC.R.rwSpan / 2 - 0.015, P = this.RWF;
    this.wing(b, { d:P.d, z:P.z, chord:0.25, thick:0.04, aoa:0, span:half * 2, col:C.accent, stations:5 });
    return this.geoAbout(b, P.d, P.z);
  },
  // what is left when a wing has come off
  buildFwStub(C){
    const b = this.soup();
    this.slabZ(b, [[-0.98, -0.30], [-0.70, -0.30], [-0.70, 0.36], [-0.95, 0.26]], 0.07, 0.11, C.carbon);
    // an endplate hanging by a thread
    this.plateY(b, [[-0.95, 0.00], [-0.55, 0.02], [-0.58, 0.22], [-0.90, 0.20]], -0.46, 0.022, C.accent2);
    return this.geo(b);
  },
  buildRwStub(C){
    const b = this.soup();
    this.plateY(b, [[3.95, 0.30], [4.12, 0.30], [4.10, 0.52], [4.02, 0.58]], 0, 0.03, C.carbon);
    this.box(b, 4.12, 0, 0.24, 0.16, 0.13, 0.10, C.carbon);
    return this.geo(b);
  },
  // the driver: helmet and the T-cam in the driver's own colour, with a dark visor
  driver(G, cam){
    const key = "drv|" + cam;
    let g = this.cache.get(key);
    if(g) return g;
    const b = this.soup(), col = G.col(cam), dark = G.col("#0B0D10");
    // a low-poly helmet: rings of latitude
    const cx = 1.34, cz = 0.78, r = 0.125, lat = 5, lon = 8, rings = [];
    for(let i = 1; i < lat; i++){ const th = i / lat * Math.PI, rr = Math.sin(th) * r, z = cz + Math.cos(th) * r;
      rings.push([...Array(lon)].map((_, k) => { const a = k / lon * TAU; return [cx + Math.cos(a) * rr, Math.sin(a) * rr, z]; })); }
    const inside = [cx, 0, cz];
    for(let i = 0; i < rings.length - 1; i++) for(let k = 0; k < lon; k++){
      const j = (k + 1) % lon, a = rings[i][k], q = rings[i][j], s = rings[i + 1][k], r2 = rings[i + 1][j];
      // the visor band: the forward-facing faces of the middle row
      const fwd = (a[0] + q[0]) / 2 < cx - r * 0.35 && i === 1;
      this.quad(b, a, q, r2, s, fwd ? dark : col, inside);
    }
    for(const [R0, z] of [[rings[0], cz + r], [rings[rings.length - 1], cz - r]])
      for(let k = 0; k < lon; k++) this.tri(b, [cx, 0, z], R0[k], R0[(k + 1) % lon], col, inside);
    // the T-cam on top of the airbox
    this.box(b, 1.80, 0, 0.965, 0.10, 0.20, 0.05, col);
    g = this.geo(b);
    this.cache.set(key, g);
    return g;
  },
  /* A tyre turned on a lathe: flat tread, rounded shoulders, flat sidewalls,
     with the compound's colour as a ring on both faces and the rim in the
     team's wheel colour. Axle along z, centred on the origin, in game metres. */
  wheel(G, radius, width, tyreCol, rimCol){
    const key = "whl|" + radius.toFixed(3) + "|" + width.toFixed(3) + "|" + tyreCol + "|" + rimCol;
    let g = this.cache.get(key);
    if(g) return g;
    const Rr = radius, W = width / 2, seg = 16;
    const rubber = G.col("#15181C"), ring = G.col(tyreCol), rim = G.col(rimCol), hub = G.col(shade(rimCol, -0.35));
    // the profile, from the rim on one face round the tread to the rim on the other
    const P = [[0.60, W], [0.78, W], [0.87, W], [0.955, W * 0.96], [1, W * 0.80], [1, -W * 0.80], [0.955, -W * 0.96], [0.87, -W], [0.78, -W], [0.60, -W]];
    const cols = [rubber, ring, rubber, rubber, rubber, rubber, rubber, ring, rubber];
    const pos = [], col = [];
    const push = (a, q, r, c) => {
      // face away from the wheel's centre
      const ux = q[0] - a[0], uy = q[1] - a[1], uz = q[2] - a[2], vx = r[0] - a[0], vy = r[1] - a[1], vz = r[2] - a[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const cx = a[0] + q[0] + r[0], cy = a[1] + q[1] + r[1], cz = a[2] + q[2] + r[2];
      if(nx * cx + ny * cy + nz * cz < 0){ const t = q; q = r; r = t; }
      pos.push(...a, ...q, ...r); for(let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
    };
    const pt = (f, z, k) => { const a = k / seg * TAU; return [Math.cos(a) * f * Rr, Math.sin(a) * f * Rr, z]; };
    for(let s = 0; s < P.length - 1; s++) for(let k = 0; k < seg; k++){
      const a = pt(P[s][0], P[s][1], k), q = pt(P[s][0], P[s][1], k + 1), r = pt(P[s + 1][0], P[s + 1][1], k + 1), t = pt(P[s + 1][0], P[s + 1][1], k);
      push(a, q, r, cols[s]); push(a, r, t, cols[s]);
    }
    // the wheel covers, slightly dished, and a hub nut that shows the wheel turning
    for(const sd of [-1, 1]) for(let k = 0; k < seg; k++){
      const a = pt(0.60, W * sd * 0.98, k), q = pt(0.60, W * sd * 0.98, k + 1), c0 = [0, 0, W * sd * 0.9];
      push(c0, a, q, k % 4 === 0 ? hub : rim);
    }
    g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals(); g.computeBoundingSphere();
    this.cache.set(key, g);
    return g;
  },
  // the lights: the rain light on the crash structure and the four brake discs
  lights(G){
    let g = this.cache.get("lights");
    if(g) return g;
    const b = this.soup(), red = G.col("#FF2A1E"), disc = G.col("#FF7A2A"), R2 = CAR_SPEC.R;
    this.box(b, 4.21, 0, 0.26, 0.03, 0.09, 0.06, red);
    for(const [d, y, r] of [[0, R2.trackF / 2 - 0.15, 0.13], [R2.wheelbase, R2.trackR / 2 - 0.19, 0.13]])
      for(const sd of [-1, 1]) this.plateY(b, [...Array(8)].map((_, k) => { const a = k / 8 * TAU; return [d + Math.cos(a) * r, R2.tyreDF / 2 + Math.sin(a) * r]; }), y * sd, 0.02, disc);
    g = this.geo(b);
    this.cache.set("lights", g);
    return g;
  },
  // one mechanic in the team's overalls, facing +x with both arms out in front; the pose is done by moving the mesh
  mechanic(G, t){
    const key = "mech|" + t.id;
    let g = this.cache.get(key);
    if(g) return g;
    const pos = [], col = [];
    const add = (geo, hex, x, y, z) => {
      const c = G.col(hex), p = geo.toNonIndexed().attributes.position;
      for(let i = 0; i < p.count; i++){ pos.push(p.getX(i) + x, p.getY(i) + y, p.getZ(i) + z); col.push(c.r, c.g, c.b); }
    };
    add(new THREE.BoxGeometry(0.30, 0.86, 0.34), "#1B1E24", 0, 0.43, 0);              // legs
    add(new THREE.BoxGeometry(0.40, 0.66, 0.50), t.body, 0, 1.18, 0);                 // torso
    add(new THREE.BoxGeometry(0.42, 0.14, 0.52), t.accent, 0, 0.96, 0);               // belt in the accent colour
    add(new THREE.BoxGeometry(0.36, 0.34, 0.34), t.accent, 0.02, 1.70, 0);            // helmet
    add(new THREE.BoxGeometry(0.10, 0.14, 0.30), "#0B0D10", 0.19, 1.70, 0);           // visor
    for(const sd of [-1, 1]) add(new THREE.BoxGeometry(0.70, 0.14, 0.14), "#F2F4F6", 0.38, 1.28, sd * 0.30);   // arms and gloves
    g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals(); g.computeBoundingSphere();
    this.cache.set(key, g);
    return g;
  },
  // one atlas of every race number, 0 to 99, bold white with a dark outline
  numberAtlas(){
    if(this._atlas) return this._atlas;
    const cv = document.createElement("canvas"); cv.width = cv.height = 1024;
    const g = cv.getContext("2d"), cell = 102.4;
    g.clearRect(0, 0, 1024, 1024);
    g.textAlign = "center"; g.textBaseline = "middle";
    g.font = "italic 900 80px 'Arial Black','Saira Condensed',sans-serif";
    g.lineJoin = "round";
    for(let n = 0; n < 100; n++){
      const x = (n % 10 + 0.5) * cell, y = (Math.floor(n / 10) + 0.5) * cell;
      g.lineWidth = 14; g.strokeStyle = "#0B0D10"; g.strokeText(String(n), x, y + 3);
      g.fillStyle = "#F8F8F6"; g.fillText(String(n), x, y + 3);
    }
    const t = new THREE.CanvasTexture(cv);
    t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
    return (this._atlas = t);
  },
  // the number quads: on the nose and on top of the engine cover (game metres)
  numbers(n){
    const key = "num|" + n;
    let g = this.cache.get(key);
    if(g) return g;
    const S = CAR_SPEC, u0 = (n % 10) / 10, v0 = 1 - (Math.floor(n / 10) + 1) / 10;
    const pos = [], uv = [];
    const decal = (d0, d1, halfW) => {
      const t0 = this.tubTop(d0), t1 = this.tubTop(d1);
      // front and back edges of the decal, sat just proud of the bodywork
      const A = [S.X(d0), S.Z(t0.top + 0.012)], B2 = [S.X(d1), S.Z(t1.top + 0.012)], w = S.Y(halfW);
      // the number reads from behind the car, top to the front
      const P = [[A[0], A[1], -w], [A[0], A[1], w], [B2[0], B2[1], w], [B2[0], B2[1], -w]];
      const U = [[u0, v0 + 0.1], [u0 + 0.1, v0 + 0.1], [u0 + 0.1, v0], [u0, v0]];
      // make "up" on the texture point forward, read from the camera behind and above
      const order = [0, 1, 2, 0, 2, 3];
      for(const i of order) pos.push(P[i][0], P[i][1], P[i][2]);
      for(const i of order) uv.push(U[i][0], U[i][1]);
    };
    decal(-0.52, -0.18, 0.11);
    decal(2.35, 2.95, 0.15);
    g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    // both triangles face up: flip any that ended up facing down
    const p = g.attributes.position, nrm = g.attributes.normal;
    if(nrm.getY(0) < 0){
      for(let i = 0; i < p.count; i += 3){
        const x = p.getX(i + 1), y = p.getY(i + 1), z = p.getZ(i + 1);
        p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)); p.setXYZ(i + 2, x, y, z);
        const u = g.attributes.uv; const ux = u.getX(i + 1), uy = u.getY(i + 1); u.setXY(i + 1, u.getX(i + 2), u.getY(i + 2)); u.setXY(i + 2, ux, uy);
      }
      g.computeVertexNormals();
    }
    g.computeBoundingSphere();
    this.cache.set(key, g);
    return g;
  },
};

G3.carMats = function(t){
  // the body's finish, as the 2D car does with its highlight: gloss shines, matte does not
  const f = t.finish === "gloss" ? { roughness:0.34, metalness:0.12 } : t.finish === "satin" ? { roughness:0.52, metalness:0.08 } : { roughness:0.78, metalness:0.02 };
  return { body:this.mat("#FFFFFF", Object.assign({ vertexColors:true, flatShading:true }, f)),
           tyre:this.mat("#FFFFFF", { vertexColors:true, flatShading:true, roughness:0.82, metalness:0 }) };
};
G3.carNumberMat = function(){
  let m = this.mats.get("carnum|");
  if(!m){ m = new THREE.MeshStandardMaterial({ map:CARGEO.numberAtlas(), alphaTest:0.5, roughness:0.55, metalness:0,
            polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2 }); this.mats.set("carnum|", m); }
  return m;
};

G3.car = function(c){
  const t = c.team, E = CARGEO.team(this, t), M = this.carMats(t), SP = CAR_SPEC;
  const g = new THREE.Group();
  const mesh = (geo, mat, name, shadow) => { const m = new THREE.Mesh(geo, mat); if(name) m.name = name; m.castShadow = shadow !== false; m.receiveShadow = false; return m; };
  const body = mesh(E.body, M.body, "body"); g.add(body);
  const drv = mesh(CARGEO.driver(this, c.drv.cam || "#FFFFFF"), M.body, "driver"); g.add(drv);
  const num = mesh(CARGEO.numbers(clamp(c.drv.n | 0, 0, 99)), this.carNumberMat(), "numbers", false); g.add(num);
  // the old contract: something called "nose" at the nose
  const nose = new THREE.Object3D(); nose.name = "nose"; nose.position.set(SP.nose.tip, SP.nose.z, 0); g.add(nose);
  // the wings, each with its flaps on a pivot at the leading edge
  const fw = new THREE.Group(); fw.name = "frontwing";
  fw.add(mesh(E.fw, M.body));
  const fwFlap = new THREE.Group(); fwFlap.position.set(SP.X(CARGEO.FWF.d), SP.Z(CARGEO.FWF.z), 0);
  fwFlap.add(mesh(E.fwFlap, M.body)); fw.add(fwFlap); g.add(fw);
  const rw = new THREE.Group(); rw.name = "rearwing";
  rw.add(mesh(E.rw, M.body));
  const rwFlap = new THREE.Group(); rwFlap.position.set(SP.X(CARGEO.RWF.d), SP.Z(CARGEO.RWF.z), 0);
  rwFlap.add(mesh(E.rwFlap, M.body)); rw.add(rwFlap); g.add(rw);
  const fwStub = mesh(E.fwStub, M.body, "fwstub"); fwStub.visible = false; g.add(fwStub);
  const rwStub = mesh(E.rwStub, M.body, "rwstub"); rwStub.visible = false; g.add(rwStub);
  // the rain light and brake discs share one glowing material of the car's own
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors:true, color:new THREE.Color(0.35, 0.35, 0.35), toneMapped:true });
  const glow = mesh(CARGEO.lights(this), glowMat, "lights", false); g.add(glow);
  // wheels: a pivot that steers, lifts and bends, and the tyre in it that turns
  g.userData.wheels = []; const pivots = [];
  const compound = (c.tyre && c.tyre.col) || TYRES.medium.col;
  // the same order as the 2D car: rear right, rear left, front right, front left
  for(const [ax, sd] of [[SP.rear, 1], [SP.rear, -1], [SP.front, 1], [SP.front, -1]]){
    const pv = new THREE.Group(); pv.position.set(ax.x, ax.r, ax.y * sd);
    const w = mesh(CARGEO.wheel(this, ax.r, ax.w, compound, t.wheel || "#2A2D31"), M.tyre);
    pv.add(w); g.add(pv); pivots.push(pv); g.userData.wheels.push(w);
    pv.userData.base = { x:ax.x, y:ax.r, z:ax.y * sd, sd, ax };
  }
  g.userData.car = c;
  g.userData.parts = { body, drv, fw, rw, fwFlap, rwFlap, fwStub, rwStub, glow, glowMat, pivots, compound, chipped:false };
  g.userData.anim = { spinF:0, spinR:0, steer:0, flap:0, brake:0, clock:null, h:null };
  return g;
};

/* Everything about the car that is not where it is on the track: steering,
   the wheels turning, the active-aero flaps, the lights, damage and the pit
   stop. It reads the car's state and never writes to it. */
/* The pit crew. They wait behind the wall, run out as the car rolls up to its box, take their
   places (wheel guns at the corners, men on the wing, a jack at each end), work through the
   stop in step with the car's own lift and wheel-off timeline, then step back and drop away
   as it pulls out. The crew stand at the box, not on the car, so they never move with it. */
G3.crewUpdate = function(e, c, S, g){
  const T = S.track, n = T.n, ds = T.ds, pb = T.pitBox;
  const gap = (a, b) => ((a - b) % n + n) % n;
  const stopping = c.stopT > 0 ? c.stopT : (c.pitT > 0 ? c.pitT : 0);
  const stotal = (c.stopT > 0 ? c.stopTotal : c.pitStopTime) || 1;
  const carview = !T.pitCentre || c.stopT > 0;
  let u = 0, sp = 0;
  if(stopping > 0){ u = 1; sp = clamp(1 - stopping / stotal, 0, 1); }
  else if(!carview && c.pitting && c.pitS != null){
    if(!c.pitDone){ const bd = gap(pb, c.pitS), d = (bd > n / 2 ? 0 : bd) * ds; u = clamp((64 - d) / 40, 0, 1); }
    else { u = 1 - clamp(gap(c.pitS, pb) * ds / 12, 0, 1); sp = 1; }
  }
  if(u <= 0){ if(e.crew) e.crew.visible = false; return; }
  const lerpf = (a, b, k) => a + (b - a) * k, ease = k => k * k * (3 - 2 * k);
  if(!e.crew){
    const cr = e.crew = new THREE.Group(), geo = CARGEO.mechanic(this, c.team);
    const mt = this.mat("#FFFFFF", { vertexColors:true, flatShading:true, roughness:0.8 });
    // wheel guns, wing men, jack men: station (x forward, z right), and whether they have to come round the car
    const st = [[1.55, 1.7, 0], [1.55, -1.7, 0], [-1.58, 1.7, 0], [-1.58, -1.7, 0], [3.4, 1.15, 1], [3.4, -1.15, 1], [3.15, 0, 2], [-3.15, 0, 2]];
    e.mem = st.map(([x, z, kind], q) => {
      const piv = new THREE.Group(), m = new THREE.Mesh(geo, mt); m.castShadow = true; piv.add(m); cr.add(piv);
      return { piv, m, x, z, kind, q, px:null, pz:null };
    });
    e.jacks = [2.0, -2.2].map(x => { const j = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.34), this.mat("#3A424C")); j.position.x = x; j.castShadow = true; cr.add(j); return j; });
    e.crewLight = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), new THREE.MeshBasicMaterial({ color:0xFF4B3E }));
    e.crewPole = new THREE.Mesh(new THREE.BoxGeometry(0.14, 3.6, 0.14), this.mat("#2C333B")); e.crewPole.position.y = 1.8; e.crewPole.castShadow = true;
    cr.add(e.crewPole, e.crewLight);
    this.world.add(cr);
  }
  const cr = e.crew; cr.visible = true;
  const lat = T.pitCentre(pb), h = T.ang[pb];
  cr.position.set(T.x[pb] + T.nx[pb] * lat, T.z[pb] + 0.03, T.y[pb] + T.ny[pb] * lat); cr.rotation.set(0, -h, 0);
  const gs = Math.sign(T.pitSide * (-T.nx[pb] * Math.sin(h) + T.ny[pb] * Math.cos(h))) || 1;
  const t = S.clock || 0, k = ease(u), run = u > 0 && u < 1;
  const out = (g.userData && g.userData.wheelOut) || 0, lift = (g.userData && g.userData.lift) || 0;
  for(const m of e.mem){
    const ax = m.x, awayZ = gs * 6.4, far = m.kind !== 2 && Math.sign(m.z) === -gs;
    let px, pz;
    if(far){ const mx = ax > 0 ? 4.7 : -4.7;                      // round the nose or tail, not through the car
      if(k < 0.5){ const q = k * 2; px = lerpf(ax, mx, q); pz = lerpf(awayZ, 0, q); } else { const q = (k - 0.5) * 2; px = lerpf(mx, ax, q); pz = lerpf(0, m.z, q); } }
    else { px = lerpf(ax, ax, k); pz = lerpf(awayZ, m.z, k); }
    let lean = 0, bob = 0, dx, dz;
    if(!run){
      // at the car: gun on, wheel carried, wing adjusted, jack worked
      if(m.kind === 0){ const side = Math.sign(m.z), on = sp < 0.14 || (sp > 0.60 && sp < 0.84);
        pz += side * out * 0.8; lean = on ? 0.30 + Math.sin(t * 38 + m.q) * 0.05 : (out > 0.05 ? -0.18 : 0.08); bob = on ? Math.sin(t * 38 + m.q) * 0.02 : 0; }
      else if(m.kind === 1){ const on = sp > 0.20 && sp < 0.55; lean = on ? 0.22 + Math.sin(t * 9 + m.q) * 0.08 : 0.05; pz += Math.sign(m.z) * (on ? -0.05 : 0); }
      else { const on = sp < 0.12 || sp > 0.86; lean = on ? 0.35 : 0.02; bob = on ? Math.sin(t * 20 + m.q) * 0.05 : 0; }
      dx = -px; dz = -pz;
    } else {
      bob = Math.abs(Math.sin(t * 17 + m.q * 1.7)) * 0.13; lean = 0.18;
      dx = m.px == null ? 0 : px - m.px; dz = m.pz == null ? gs * -1 : pz - m.pz;
      if(u < 0.5 && stopping <= 0 && sp >= 1){ dx = -dx; dz = -dz; }
      if(Math.abs(dx) + Math.abs(dz) < 1e-5){ dx = -px; dz = -pz; }
    }
    m.px = px; m.pz = pz;
    m.piv.position.set(px, bob, pz);
    m.piv.rotation.y = Math.atan2(-dz, dx);
    m.m.rotation.z = -lean;
  }
  // the jacks rise and fall with the car
  const jh = 0.14 + lift, js = u >= 1 && stopping > 0 ? 1 : 0.0001;
  e.jacks.forEach(j => { j.scale.y = jh / 0.3 * js; j.position.y = jh * js / 2; j.visible = stopping > 0; });
  // the release light: red while they work, green when they are clear
  e.crewPole.position.set(0.0, 1.8, gs * 3.3); e.crewLight.position.set(0, 3.7, gs * 3.3);
  e.crewPole.position.x = e.crewLight.position.x = 0;
  e.crewLight.material.color.set((stopping > 0 && stopping < 0.45) || (stopping <= 0 && sp >= 1) ? 0x2FD07A : 0xFF4B3E).multiplyScalar(2.2);
};

G3.carAnim = function(g, c, S, dt){
  const P = g.userData.parts, A = g.userData.anim, SP = CAR_SPEC;
  if(!P) return;
  const gone = c.broken || new Set();
  const v = (c.ai && c.railV != null) ? c.railV : Math.hypot(c.vx || 0, c.vy || 0);
  // the wheels turn with the road
  A.spinF = (A.spinF + v * dt / SP.front.r) % TAU; A.spinR = (A.spinR + v * dt / SP.rear.r) % TAU;
  // steering: the player's input directly; a rail-following car's from how fast it is turning
  let want = 0;
  if(!c.ai) want = clamp(c.steer || 0, -1, 1) * 0.35;
  else if(A.h != null && dt > 0){
    const yaw = angWrap(c.h - A.h) / dt;
    want = clamp(Math.atan(SP.wheelbase * yaw / Math.max(v, 4)), -0.35, 0.35);
  }
  A.h = c.h;
  A.steer += (want - A.steer) * (1 - Math.exp(-dt * 14));
  // pit stop: jacked up, wheels out, as the 2D car does
  const stopping = c.stopT > 0 ? c.stopT : (c.pitT > 0 ? c.pitT : 0);
  const stotal = (c.stopT > 0 ? c.stopTotal : c.pitStopTime) || 1;
  let lift = 0, wheelOut = 0;
  if(stopping > 0){
    const sp = clamp(1 - stopping / stotal, 0, 1);
    lift = 0.30 * clamp(Math.min(sp / 0.10, (1 - sp) / 0.10), 0, 1);
    wheelOut = 0.55 * clamp(Math.min((sp - 0.14) / 0.08, (0.60 - sp) / 0.08), 0, 1);   // wheels come off early, the fresh set goes on at 60%
  }
  g.userData.lift = lift; g.userData.wheelOut = wheelOut; g.userData.stopP = stopping > 0 ? clamp(1 - stopping / stotal, 0, 1) : -1;
  // tyre compound: swap the wheels to the fitted set when it changes
  const compound = (c.tyre && c.tyre.col) || TYRES.medium.col;
  if(compound !== P.compound){
    P.compound = compound;
    P.pivots.forEach((pv, i) => { const ax = pv.userData.base.ax;
      g.userData.wheels[i].geometry = CARGEO.wheel(this, ax.r, ax.w, compound, c.team.wheel || "#2A2D31"); });
  }
  const bent = gone.has("susp") ? (c.idx % 4) : -1, flat = gone.has("punct") ? ((c.idx + 1) % 4) : -1;
  P.pivots.forEach((pv, i) => {
    const B = pv.userData.base, front = i >= 2, w = g.userData.wheels[i];
    const out = wheelOut + (i === bent ? 0.34 : 0);
    pv.position.set(B.x, B.y - (i === flat ? 0.09 : 0) + wheelOut * 0.45, B.z + B.sd * out);
    pv.rotation.set(i === bent ? 0.42 * B.sd : 0, (front ? -A.steer : 0) + (i === bent ? 0.3 : 0), 0, "YXZ");
    pv.scale.set(1, i === flat ? 0.74 : 1, 1);
    w.rotation.z = -(front ? A.spinF : A.spinR);
  });
  // 2026 active aero: both wings' flaps lie flat under override, easing over about 0.15 s
  const boosting = c.boost > 0 && c.batt > 0.01;
  A.flap += ((boosting ? 1 : 0) - A.flap) * (1 - Math.exp(-dt / 0.05));
  P.rwFlap.rotation.z = -lerp(0.62, 0.08, A.flap);
  P.fwFlap.rotation.z = -lerp(0.0, -0.18, A.flap);
  // damage: the wings come off, the floor loses a chunk
  const noFront = gone.has("wing"), noRear = gone.has("rear");
  P.fw.visible = !noFront; P.fwStub.visible = noFront;
  P.rw.visible = !noRear; P.rwStub.visible = noRear;
  const chip = gone.has("floor");
  if(chip !== P.chipped){ P.chipped = chip; P.body.geometry = chip ? CARGEO.chipped(this, c.team) : CARGEO.team(this, c.team).body; }
  // the lights: brighter under braking, the rain light flashing in the wet, stuck on with broken brakes
  A.brake += (clamp(c.brk || 0, 0, 1) - A.brake) * (1 - Math.exp(-dt * 12));
  const wet = (S && S.wet > 0.2) ? (((S.clock || 0) * 4) % 1 < 0.5 ? 1 : 0.25) : 0;
  const night = S && S.track && S.track.night ? 0.35 : 0;
  const k = Math.max(0.30, night, wet, A.brake * (v > 3 ? 1 : 0.4), gone.has("brakes") ? 0.85 : 0);
  P.glowMat.color.setScalar(0.25 + k * 3.2);
};

/* merge a group's direct mesh children, material by material, keeping any
   named mesh or sub-group as it is */
G3.mergeChildren = function(group){
  const by = new Map();
  for(const o of group.children.slice()){
    if(!o.isMesh || o.name) continue;
    let a = by.get(o.material); if(!a){ a = []; by.set(o.material, a); } a.push(o);
  }
  for(const [mat, list] of by){
    if(list.length < 2) continue;
    const parts = list.map(m => { m.updateMatrix(); const q = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()); q.applyMatrix4(m.matrix); return q; });
    let n = 0; for(const q of parts) n += q.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
    let o = 0;
    for(const q of parts){ pos.set(q.attributes.position.array, o * 3); nor.set(q.attributes.normal.array, o * 3); o += q.attributes.position.count; q.dispose(); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = list.some(x => x.castShadow); m.receiveShadow = list.some(x => x.receiveShadow);
    for(const x of list){ group.remove(x); x.geometry.dispose(); }
    group.add(m);
  }
};

// Anything standing between the camera and your car is in the way. Work in the
// camera's own space: closer to the lens and overlapping you on screen means fade.
G3._v = null;
G3.fadeOccluders = function(S, p){
  if(!this.occluders || !this.occluders.length) return;
  const cam = this.cam || this.camIso;
  if(!cam) return;
  cam.updateMatrixWorld();
  if(!this._v){ this._v = new THREE.Vector3(); this._pv = new THREE.Vector3(); }
  const v = this._v, pv = this._pv;
  pv.set(p.x, p.z + 1, p.y).applyMatrix4(cam.matrixWorldInverse);
  for(const oc of this.occluders){
    v.set(oc.x, oc.z, oc.y).applyMatrix4(cam.matrixWorldInverse);
    // in camera space the lens looks down -z, so a larger z is nearer the camera
    const inFront = v.z > pv.z;
    const over = Math.abs(v.x - pv.x) < oc.rx + 14 && Math.abs(v.y - pv.y) < oc.ry + 14;
    const want = (inFront && over) ? 0.22 : 1;
    oc.fade += (want - oc.fade) * 0.12;
    const o = oc.fade;
    for(const m of oc.meshes){
      const ms = Array.isArray(m.material) ? m.material : [m.material];
      for(const mm of ms){ mm.opacity = o; mm.transparent = o < 0.995; }
      m.castShadow = o > 0.6 && m.userData.wasCaster !== false;
    }
  }
};

/* ---- the frame --------------------------------------------------------- */
G3.frame = function(S){
  const T = S.track;
  if(this.built !== S.uid || this.cars.length !== S.cars.length) this.build(S);

  for(const e of this.cars){
    const c = e.c, g = e.g;
    /* The car model's nose is local +x, so pitch is a rotation about local z and
       roll about local x. Its wheels are 3.13 m apart, so the body sits on the
       straight line between the road under the rear axle and the road under the
       front one: pitch is that slope, height is the midpoint, and neither can
       leave a wheel in the tarmac or in the air. The suspension only ever lifts
       the body, light over a crest, and never sinks it. */
    const ni = c.node || 0, nn = T.n, HB = 1.57;
    const al = Math.cos(c.h - T.ang[ni]);
    const hx = Math.cos(c.h), hy = Math.sin(c.h);
    const zr = T.surfZ(c.x - hx * HB, c.y - hy * HB, ni), zf = T.surfZ(c.x + hx * HB, c.y + hy * HB, ni);
    const gzA = T.grade((ni + 1) % nn), gzB = T.grade((ni - 1 + nn) % nn);
    const vcurv = (gzA - gzB) / (2 * T.ds);                  // + at the foot of a climb, - over a crest
    const sp = c.speed || 0;
    e.sp = lerp(e.sp == null ? Math.atan2(zf - zr, 2 * HB) : e.sp, Math.atan2(zf - zr, 2 * HB), 0.55);
    e.sq = lerp(e.sq || 0, clamp(sp * sp * vcurv * 0.010, -0.09, 0.07), 0.25);
    // the road's own cross-slope under the car: camber, and the banking at this offset
    const bsl = T.bankZf ? (bankZ(T, ni, (c.off || 0) + 0.6) - bankZ(T, ni, (c.off || 0) - 0.6)) / 1.2 : 0;
    const cross = (T.camber[ni] + bsl) * al;
    g.position.set(c.x, (zr + zf) / 2 + (c.air || 0) + 0.03 + Math.max(0, -e.sq) * 0.6, c.y);
    g.rotation.set(-(c.roll || 0) - Math.atan(cross), -c.h, e.sp - (c.pitch || 0), "YXZ");
    // steering, wheels, flaps, lights, damage and the pit stop
    const A = g.userData.anim;
    const dtc = A.clock == null ? 0 : clamp((S.clock || 0) - A.clock, 0, 0.05); A.clock = S.clock || 0;
    this.carAnim(g, c, S, dtc);
    if(g.userData.lift) g.position.y += g.userData.lift;
    this.crewUpdate(e, c, S, g);
  }

  for(const d of this.dyn){
    if(d.kind === "screen"){
      // a band of light sliding across, plus a scrolling word: enough motion at
      // this distance to read as a working screen
      const c = d.ctx, W2 = 256, H2 = 128;
      d.t += 0.016;
      c.fillStyle = "#07070C"; c.fillRect(0, 0, W2, H2);
      for(let k = 0; k < 4; k++){
        const x = ((d.t * (28 + k * 13) + k * 90) % (W2 + 120)) - 60;
        const gd = c.createLinearGradient(x - 50, 0, x + 50, 0);
        gd.addColorStop(0, "rgba(0,0,0,0)"); gd.addColorStop(0.5, d.col); gd.addColorStop(1, "rgba(0,0,0,0)");
        c.fillStyle = gd; c.fillRect(x - 50, k * 32, 100, 30);
      }
      c.fillStyle = "#FFFFFF"; c.font = "800 italic 34px 'Saira Condensed',sans-serif";
      c.textAlign = "left"; c.textBaseline = "middle";
      c.fillText("LAS VEGAS GRAND PRIX", W2 - ((d.t * 42) % (W2 + 380)), H2 / 2);
      d.tx.needsUpdate = true;
      continue;
    }
    if(d.kind === "fountain"){
      // the jets breathe, and every so often the whole row goes up at once
      const o = d.obj, tt = S.clock;
      const burst = Math.max(0, Math.sin(tt * 0.22)) ** 6;
      for(let i = 0; i < d.jets.length; i++){
        const j = d.jets[i];
        const base = 0.35 + 0.65 * Math.abs(Math.sin(tt * 0.9 + i * 0.42));
        const hgt = 4 + (base * 26 + burst * 64) * (0.6 + 0.4 * Math.sin(i * 1.3));
        o.position.set(j[0], d.z, j[1]);
        o.scale.set(1 + burst * 0.5, hgt, 1 + burst * 0.5);
        o.rotation.set(0, 0, 0); o.updateMatrix();
        d.im.setMatrixAt(i, o.matrix);
      }
      d.im.instanceMatrix.needsUpdate = true;
      continue;
    }
    if(d.kind === "flicker"){
      const f = 0.7 + 0.3 * Math.sin(S.clock * 7.3) + 0.2 * Math.sin(S.clock * 17.1);
      d.obj.scale.set(0.8 + f * 0.4, 0.7 + f * 0.6, 0.8 + f * 0.4);
      d.light.intensity = d.base * (0.6 + f * 0.6);
      continue;
    }
    if(d.kind === "amber"){
      const on = (S.clock * 1.2) % 1 < 0.5;
      for(const h of d.heads) h.material.emissiveIntensity = on ? 1.6 : 0.10;
      continue;
    }
    if(d.kind === "beacon"){
      const on = (S.clock * d.rate) % 1 < 0.42;
      d.obj.material.emissiveIntensity = on ? 5.0 : 0.25;
      continue;
    }
    if(d.kind === "sphere"){
      // the picture at 30 Hz is plenty for an LED screen, and it halves the repaint and the upload
      if((d.tick & 1) === 0){ SPHERE.paint(d.ctx, S); d.tx.needsUpdate = true; }
      // What it throws on the asphalt is whatever it happens to be showing, so
      // look at the picture: the same painting at 32 x 32 on a small software
      // canvas, averaged, once every six frames. (Reading the big canvas back
      // stalled the whole pipeline for 60-200 ms each time it happened.)
      if((d.tick++ % 6) === 0){
        try{
          if(!d.small){ d.small = document.createElement("canvas"); d.small.width = d.small.height = 32;
                        d.sg = d.small.getContext("2d", { willReadFrequently:true }); }
          const sg = d.sg;
          sg.setTransform(32 / SPHERE.W, 0, 0, 32 / SPHERE.H, 0, 0);
          SPHERE.paint(sg, S);
          sg.setTransform(1, 0, 0, 1, 0, 0);
          const px = sg.getImageData(0, 0, 32, 32).data;
          let r = 0, gg = 0, b = 0;
          for(let i = 0; i < px.length; i += 4){ r += px[i]; gg += px[i + 1]; b += px[i + 2]; }
          const k = px.length / 4;
          r /= k; gg /= k; b /= k;
          const mx = Math.max(r, gg, b, 1);
          // pushed to full saturation: a wash of dim grey would not read at all
          d.light.color.setRGB(r / mx, gg / mx, b / mx);
          d.avg = (r + gg + b) / (3 * 255);
        }catch(e){ d.light.color.set(SPHERE.glowOf(S)); }
      }
      // it burns brighter through the start show
      const ip = SPHERE.introPhase(S);
      const base = 1.6 + 3.2 * (d.avg == null ? 0.4 : d.avg);
      d.light.intensity = ip == null ? base : (ip >= 5.1 && ip < 5.5 ? 9 : base * 1.4);
      // the material may have been cloned since, for the fade, so read it back
      d.mesh.material.emissiveIntensity = ip == null ? 1.05 : (ip >= 5.1 && ip < 5.5 ? 1.9 : 1.30);
    }
  }

  const pa = this.sparks.geometry.attributes.position;
  let k = 0;
  for(const q of PART){
    if(k >= 300) break;
    pa.array[k * 3] = q.x; pa.array[k * 3 + 1] = q.z; pa.array[k * 3 + 2] = q.y; k++;
  }
  for(let q = k; q < 300; q++) pa.array[q * 3 + 1] = -9999;
  pa.needsUpdate = true;

  this.wet = lerp(this.wet, S.wet > 0.3 ? 0.55 : 0, 0.02);

  const p = S.player;
  this.fadeOccluders(S, p);
  if(R.tv && S.tv){
    const cam = this.camTV;
    cam.position.set(S.tv.x, S.tv.z, S.tv.y);
    cam.lookAt(p.x + p.vx * 0.12, p.z + 0.7, p.y + p.vy * 0.12);
    if(this.scene.fog){ this.scene.fog.near = 220; this.scene.fog.far = 220 + this.fogSpan * (1 - this.wet * 0.5); }
    this.cam = cam;
  } else {
    const cam = this.camIso;
    const hh = Math.max(14, (this.cv.clientHeight || 600) / Math.max(R.zoom, 0.5) * 0.5);
    const asp = (this.cv.clientWidth || 800) / (this.cv.clientHeight || 600);
    cam.left = -hh * asp; cam.right = hh * asp; cam.top = hh; cam.bottom = -hh;
    cam.updateProjectionMatrix();
    /* The shadow map only needs to cover what the camera can see (plus what
       falls into it from just outside). A fixed 300 m box drew every building
       and boat in the neighbourhood a second time for nothing, so size it to
       the ground the view actually covers, in steps so the shadows do not
       shimmer as the zoom eases. */
    if(this.sun){
      const gx = Math.hypot(hh * asp, hh * 1.75);
      const ext = clamp(Math.ceil((gx * 1.12 + 26) / 12) * 12, 72, 150);
      const sc = this.sun.shadow.camera;
      if(sc.right !== ext){ sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.updateProjectionMatrix(); }
    }
    const tx = p.x + p.vx * 0.35, ty = p.y + p.vy * 0.35, tz = p.z;
    const d = 700, el = 35.264 * Math.PI / 180, az = Math.PI * 0.25;
    cam.position.set(tx + Math.cos(az) * d * Math.cos(el), tz + d * Math.sin(el), ty + Math.sin(az) * d * Math.cos(el));
    cam.lookAt(tx, tz, ty);
    // the orthographic camera stands well back, so the haze starts from there
    if(this.scene.fog){ this.scene.fog.near = d + 120; this.scene.fog.far = d + 120 + this.fogSpan * (1 - this.wet * 0.5); }
    this.cam = cam;
    if(this.sun){
      this.sun.target.position.set(tx, tz, ty); this.sun.target.updateMatrixWorld();
      const sa = T.sun == null ? 0.9 : T.sun;
      this.sun.position.set(tx + Math.cos(sa) * 300, tz + 420 * (T.def.sunH || 1), ty + Math.sin(sa) * 300);
    }
  }
  {
    const cu = this.cutU, cm = this.cam;
    cu.uCutOn.value = (this.monaco && cm === this.camIso && !p.dnf) ? 1 : 0;
    if(cu.uCutOn.value){
      cm.updateMatrixWorld();
      cu.uCutV.value.copy(cm.matrixWorld);
      cu.uCutD.value.set(0, 0, 1).transformDirection(cm.matrixWorld);
      cu.uCutP.value.set(p.x, p.z + 0.6, p.y);
      cu.uCutR.value = clamp((cm.top - cm.bottom) * 0.16, 8, 16);
    }
  }
  if(this.monaco){ try{ this.monaco.frame(S, this); }catch(e){ console.warn("monaco frame", e.message); this.monaco = null; } }
  if(this.silver){ try{ this.silver.frame(S, this); }catch(e){ console.warn("silverstone frame", e.message); this.silver = null; } }
  /* Bloom is what the composer is for, and a daytime circuit has next to none.
     Without it the frame goes straight to the screen: the renderer's own ACES
     and sRGB steps (the same curve, which divides by 0.6 inside, hence the
     0.6 here), and 4x multisampling in place of FXAA, which is sharper. */
  const gr = this.grade || { exposure:1, strength:0.4, radius:0.6, threshold:1.0, knee:0.4 };
  if(PP.ready && CFG.fx !== 0 && (gr.strength >= 0.3 || CFG.fx === 2)){
    PP.render(this.scene, this.cam, gr);
  } else {
    this.rend.toneMapping = THREE.ACESFilmicToneMapping;
    this.rend.toneMappingExposure = (gr.exposure || 1) * 0.6;
    this.rend.outputEncoding = THREE.sRGBEncoding;
    this.rend.setRenderTarget(null);
    this.rend.render(this.scene, this.cam);
  }
};

/* ---------- minimap ---------- */
function drawMini(S){
  const cv = $("#mini"), ctx = cv.getContext("2d"), T = S.track, n = T.n;
  const sz = cv.width, pad = 10;
  ctx.clearRect(0, 0, sz, sz);
  const b = T.bounds, sc = Math.min((sz - pad * 2) / b.w, (sz - pad * 2) / b.h);
  const mx = (sz - b.w * sc) / 2 - b.minX * sc, my = (sz - b.h * sc) / 2 - b.minY * sc;
  ctx.strokeStyle = "#39424D"; ctx.lineWidth = 5; ctx.lineJoin = "round";
  ctx.beginPath();
  for(let i = 0; i <= n; i++){ const k = i % n; const x = T.x[k] * sc + mx, y = T.y[k] * sc + my;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.closePath(); ctx.stroke();
  ctx.strokeStyle = "#151A21"; ctx.lineWidth = 2.6; ctx.stroke();
  ctx.fillStyle = "#F0F0F0"; ctx.fillRect(T.x[0] * sc + mx - 2, T.y[0] * sc + my - 2, 4, 4);
  for(const c of S.cars){
    if(c.dnf) continue;
    const me = c === S.player;
    ctx.fillStyle = me ? "#FFA51F" : shade(c.team.body, 0.1);
    ctx.beginPath(); ctx.arc(c.x * sc + mx, c.y * sc + my, me ? 3.4 : 2.2, 0, TAU); ctx.fill();
    if(me){ ctx.strokeStyle = "#0B0E12"; ctx.lineWidth = 1; ctx.stroke(); }
  }
}

/* ---------- 6. session ---------------------------------------------------- */
const KEY = {};
addEventListener("keydown", e => {
  if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) e.preventDefault();
  KEY[e.key.toLowerCase()] = true;
  if(e.key === "Escape") togglePause();
  if(e.key.toLowerCase() === "p" && S && S.state === "run") requestPit();
  if(e.key.toLowerCase() === "r" && S && S.state === "run") recover();
  if(e.key.toLowerCase() === "m"){ try{ AUDIO.init(); AUDIO.toggle(); }catch(err){} }
});
addEventListener("keyup", e => { KEY[e.key.toLowerCase()] = false; });

/* The wheel pulls the camera in and pushes it out. It is a multiplier over
   whatever the automatic framing wants, not a replacement for it, so speed,
   the launch and the pit lane all still move the camera underneath you. Leave
   it alone for five seconds and it eases back to the automatic framing. */
const ZOOM_HOLD = 5;                               // seconds before it lets go
addEventListener("wheel", e => {
  if(!S || paused || S.menuOpen || S.state === "done") return;
  if(e.target.closest && e.target.closest(".screen, .panel, #pause")) return;
  e.preventDefault();
  // trackpads report pixels, mice report lines or pages
  const d = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
  R.userZoom = clamp(R.userZoom * Math.exp(-clamp(d, -240, 240) * 0.0016), 0.45, 3.2);
  R.userZoomT = 0;
}, { passive:false });
addEventListener("blur", () => { for(const k in KEY) KEY[k] = false; });

const TOUCH = { l:0, r:0, gas:0, brk:0, boost:0 };
function bindTouch(){
  const map = { "t-l":"l", "t-r":"r", "t-gas":"gas", "t-brk":"brk", "t-boost":"boost" };
  for(const id in map){
    const n = document.getElementById(id), k = map[id];
    const on = e => { e.preventDefault(); TOUCH[k] = 1; n.classList.add("act"); };
    const off = e => { e.preventDefault(); TOUCH[k] = 0; n.classList.remove("act"); };
    n.addEventListener("pointerdown", on); n.addEventListener("pointerup", off);
    n.addEventListener("pointercancel", off); n.addEventListener("pointerleave", off);
  }
}

let S = null, paused = false, lastT = 0, hudT = 0;
const CFG = Object.assign({ teamId:"mcl", drvIdx:0, trackId:"monaco", lapsIdx:1, diff:1,
  tyre:"medium", weather:"auto", line:1, damage:1, grid:1, mode:"quick", fx:1, detail:1 }, store("cfg") || {});

const OPTS = {
  laps:[["Sprint", 0], ["Feature", 1], ["Full", 2]],
  diff:[["Rookie", 0], ["Pro", 1], ["Ace", 2], ["Legend", 3]],
  tyre:[["Soft", "soft"], ["Medium", "medium"], ["Hard", "hard"]],
  weather:[["Dry", "dry"], ["Likely", "auto"], ["Wet", "wet"]],
  line:[["Line on", 1], ["Line off", 0]],
  damage:[["Damage on", 1], ["Damage off", 0]],
  grid:[["Pole", 0], ["Midfield", 1], ["Back row", 2]],
  fx:[["Effects on", 1], ["Effects off", 0]],
  detail:[["Full detail", 1], ["Lite", 0]],
};
const AI_SCALE = [0.945, 0.975, 0.995, 1.012];
// how hard the field races you, by difficulty: chance to defend, appetite for a move,
// the extra push when chasing a place back, and how far they will lunge
const COMBAT = [
  { defend:0.22, aggr:0.55, push:0.000, lunge:0.75 },
  { defend:0.55, aggr:0.85, push:0.008, lunge:1.00 },
  { defend:0.80, aggr:1.05, push:0.016, lunge:1.15 },
  { defend:0.96, aggr:1.22, push:0.026, lunge:1.30 },
];

let SESSION_N = 0;
function startSession(mode, champ){
  const def = TRACKS.find(t => t.id === CFG.trackId) || TRACKS[0];
  const T = buildTrack(def);
  const laps = mode === "race" ? def.laps[CFG.lapsIdx] : mode === "qualy" ? 4 : 99;
  const rnd = Math.random();
  const wetTarget = CFG.weather === "wet" ? 1 : CFG.weather === "dry" ? 0 : (rnd < def.rain ? 0.55 + Math.random() * 0.45 : 0);

  S = { track:T, mode, laps, cars:[], clock:0, state:"lights", lights:0, wet:0, wetTarget,
        uid:T.id + "#" + (++SESSION_N),
        wearMul:mode === "race" ? clamp(9 / laps, 0.55, 2.2) : 0.55,
        aiScale:AI_SCALE[CFG.diff], combat:COMBAT[CFG.diff], shake:0, champ:!!champ,
        mustPit:mode === "race" && laps >= 10, assistLine:!!CFG.line, damage:!!CFG.damage,
        finishOrder:[], ended:false, ghost:null, ghostCar:null, rec:[], bestRec:null,
        toast:msg => showToast(msg) };

  // field
  const entries = [];
  for(const t of TEAMS) for(const d of t.drivers) entries.push({ t, d });
  const myIdx = entries.findIndex(e => e.t.id === CFG.teamId && e.d === (TEAMS.find(t => t.id === CFG.teamId).drivers[CFG.drvIdx]));
  // grid order: pace-based with a shuffle, then the player's chosen slot
  const order = entries.map((e, i) => ({ i, k:e.t.pace * e.d.skill + Math.random() * 0.011 }))
                       .sort((a, b) => b.k - a.k).map(o => o.i);
  if(mode === "race" && !champ){
    const want = CFG.grid === 0 ? 0 : CFG.grid === 1 ? 10 : 20;
    const at = order.indexOf(myIdx); order.splice(at, 1); order.splice(want, 0, myIdx);
  }
  if(champ && champ.grid){
    const g = champ.grid.map(a => entries.findIndex(e => e.d.abbr === a));
    order.length = 0; for(const x of g) if(x >= 0) order.push(x);
    for(let i = 0; i < entries.length; i++) if(!order.includes(i)) order.push(i);
  }
  S.gridAbbr = order.map(x => entries[x].d.abbr);
  const single = mode === "tt";
  const list = single ? [myIdx] : order;

  list.forEach((ei, slot) => {
    const e = entries[ei], c = new Car(e.t, e.d, slot, T);
    c.ai = ei !== myIdx;
    // every car finds a slightly different window each weekend
    c.pace = e.t.pace * (0.985 + e.d.skill * 0.015) * (0.9955 + Math.random() * 0.009);
    c.tyre = wetTarget > 0.4 ? TYRES.wet : (c.ai ? (slot % 3 === 0 ? TYRES.soft : slot % 3 === 1 ? TYRES.medium : TYRES.hard) : TYRES[CFG.tyre]);
    c.nextTyre = c.tyre.key === "soft" ? TYRES.hard : TYRES.soft;
    c.used.add(c.tyre.key);
    const back = single ? 0 : slot * 8.6;
    const node = single ? 0
      : mode === "race" ? (((T.n - Math.round((14 + back) / T.ds)) % T.n) + T.n) % T.n
      : Math.round(T.n * slot / list.length) % T.n;
    c.place(node, (single || mode !== "race") ? T.line[node] : (slot % 2 ? 2.7 : -2.7) * (T.half > 6 ? 1 : 0.7));
    if(mode !== "race"){ const vv = T.vprof[node] * 0.8; c.railV = vv;
      c.vx = Math.cos(c.h) * vv; c.vy = Math.sin(c.h) * vv; }
    c.pos = slot + 1;
    if(!c.ai) S.player = c;
    S.cars.push(c);
  });
  if(mode !== "race"){ S.state = "run"; S.lights = 5; }
  PART.length = 0;
  S.marks = [];
  try{ AUDIO.init(); AUDIO.resume(); AUDIO.reset(); }catch(e){}
  R.camX = 0; R.camY = 0;
  R.userZoom = 1; R.userZoomT = 99;
  S.launchCam = mode === "race" ? 1 : 0;
  R.isx = lerp(ISX, CAM_LOW.isx, S.launchCam);
  R.isy = lerp(ISY, CAM_LOW.isy, S.launchCam);
  R.zs  = lerp(ZS,  CAM_LOW.zs,  S.launchCam);
  const [cx, cy] = isoOf(S.player);
  R.camX = cx; R.camY = cy;
  $("#hud").hidden = false;
  $("#touch").hidden = !("ontouchstart" in window || navigator.maxTouchPoints > 0);
  show(null);
  buildBoard();
  hudT = 0;
  showMsg(mode === "race" ? T.name.toUpperCase() : mode === "qualy" ? "QUALIFYING" : "TIME TRIAL",
          mode === "race" ? `${laps} laps · ${(T.length / 1000).toFixed(3)} km` : T.loc, 2.2);
}
function isoOf(c){ return [(c.x - c.y) * R.isx, (c.x + c.y) * R.isy - c.z * R.zs]; }

function partColor(h, broken){
  if(broken) return "#FF4B3E";
  h = clamp(h, 0, 1);
  const mix = (a, b, t) => "rgb(" + Math.round(a[0] + (b[0] - a[0]) * t) + "," +
    Math.round(a[1] + (b[1] - a[1]) * t) + "," + Math.round(a[2] + (b[2] - a[2]) * t) + ")";
  return h > 0.5 ? mix([242, 194, 48], [47, 208, 122], (h - 0.5) * 2)
                 : mix([255, 75, 62], [242, 194, 48], h * 2);
}
function updateStatus(c){
  const paint = (sel, k) => { const col = partColor(c.health[k], c.broken.has(k));
    document.querySelectorAll(sel).forEach(n => n.setAttribute("fill", col)); };
  paint("#sv-wing, #sv-nose", "wing");
  paint("#sv-rear", "rear");
  paint("#sv-gbox", "gearbox");
  paint("#sv-eng", "engine");
  paint("#sv-floor, #sv-podL, #sv-podR", "floor");
  paint(".sv-susp", "susp");
  paint(".sv-brake", "brakes");
  const tyreCol = c.broken.has("punct") ? "#FF4B3E" : partColor(c.life, false);
  document.querySelectorAll(".sv-tyre").forEach(n => n.setAttribute("fill", tyreCol));
  const pod = document.querySelector("#sv-pod");
  if(pod) pod.setAttribute("fill", "#0E1217");
}
function requestPit(){
  const c = S.player; if(!c || c.pitting || c.stopT > 0 || c.inPit) return;
  const u = S.track.pitU(c.node);
  if(!c.pitReq && u > 0.05 && u < 0.88){ showToast("Too late — the pit entry is behind you"); return; }
  c.pitReq = !c.pitReq;
  c.pitWarned = false;
  const jobs = [...c.broken].map(k => PARTS[k].name.toLowerCase());
  showToast(c.pitReq
    ? "Box, box — pit entry open" + (jobs.length ? " · " + jobs.join(", ") + " to fix" : "")
    : "Pit call cancelled — stay out");
}

function recover(){
  const c = S.player; if(!c) return;
  const T = S.track, i = c.node;
  c.place(i, T.line[i]); c.vx = Math.cos(c.h) * 12; c.vy = Math.sin(c.h) * 12;
  c.damage = Math.max(0, c.damage - 0.15);
  showToast("Recovered to the track");
}

function playerInput(c, dt){
  if(S.state === "lights"){ c.thr = 0; c.brk = 1; c.steer = 0; return; }
  const left = KEY["arrowleft"] || KEY["a"] || TOUCH.l, right = KEY["arrowright"] || KEY["d"] || TOUCH.r;
  const up = KEY["arrowup"] || KEY["w"] || TOUCH.gas, down = KEY["arrowdown"] || KEY["s"] || TOUCH.brk;
  const target = (right ? 1 : 0) - (left ? 1 : 0);
  const rate = 6.6 - clamp(c.speed / 40, 0, 3.2);
  c.steer += clamp(target - c.steer, -rate * dt, rate * dt);
  if(!left && !right) c.steer *= Math.pow(0.02, dt);
  c.thr = up ? 1 : 0; c.brk = down ? 1 : 0;
  c.hand = (KEY[" "] ? 1 : 0);
  c.boost = ((KEY["shift"] || TOUCH.boost) && c.batt > 0.01) ? 1 : 0;
}

/* ---------- the player's pit stop ---------- */
function playerPit(c, S, dt){
  const T = S.track;
  if(c.stopT > 0){
    c.stopT -= dt; c.thr = 0; c.brk = 1; c.steer = 0;
    if(c.stopT <= 0) finishStop(c, S);
    return;
  }
  if(c.inPit && !c.pitVisit){
    c.pitVisit = true;
    if(S.mode === "race" && c.lap <= S.laps) openPitMenu(c, S);
  }
  if(!c.inPit && c.pitVisit && T.pitRamp(c.node) <= 0.04){
    c.pitVisit = false; c.pitPlan = null; c.pitReq = false;
  }
  // approaching the entry, and missing it
  if(c.pitReq && !c.inPit && !c.pitting){
    const u = T.pitU(c.node);
    const toEntry = (((T.pitIn - c.node) % T.n + T.n) % T.n) * T.ds;
    if(u < 0 && toEntry < 240 && !c.pitWarned){
      c.pitWarned = true;
      showMsg("PIT ENTRY AHEAD", "Move to the " + (T.pitSide > 0 ? "right" : "left"), 2.0);   // + is the right-hand side
    }
    if(u > 0.24 && u < 0.7){
      c.pitReq = false; c.pitWarned = false;
      showMsg("PIT ENTRY MISSED", "Stay out — call it again next lap", 2.2);
    }
  }
  const plan = c.pitPlan;
  if(c.inPit && plan && !plan.none && !plan.done){
    let bd = ((c.node - T.pitBox) % T.n + T.n) % T.n;
    if(bd > T.n / 2) bd -= T.n;
    if(Math.abs(bd) < 6 && c.speed < 2.5) beginStop(c, S);
  }
}
function pitJobTime(c, plan){
  let t = 2.2;
  for(const k of plan.repairs) t += PARTS[k].fix;
  return t;
}
function openPitMenu(c, S){
  S.menuOpen = true;
  c.pitPlan = { tyre:(S.wet > 0.45 ? "wet" : c.tyre.key === "soft" ? "hard" : "soft"),
                repairs:new Set([...c.broken].filter(k => !PARTS[k].tyre)), done:false, none:false };
  $("#pitmenu").hidden = false;
  $("#pit-sub").textContent = S.mode === "race"
    ? "Lap " + c.lap + " of " + S.laps + " · P" + c.pos + " · the crew are waiting"
    : "Choose your service";
  renderPitMenu(c, S);
}
function renderPitMenu(c, S){
  const plan = c.pitPlan, host = $("#pit-tyres"); host.innerHTML = "";
  const opts = [["Soft", "soft"], ["Medium", "medium"], ["Hard", "hard"], ["Wet", "wet"], ["Keep", "none"]];
  for(const o of opts){
    const b = el("button", plan.tyre === o[1] ? "on" : "", o[0]);
    b.onclick = () => { plan.tyre = o[1]; renderPitMenu(c, S); };
    host.appendChild(b);
  }
  const rep2 = $("#pit-repairs"); rep2.innerHTML = "";
  const fixable = [...c.broken].filter(k => !PARTS[k].tyre);
  if(!fixable.length){
    rep2.appendChild(el("div", "fixrow clean",
      c.broken.size ? "Puncture — fixed with the tyre change" : "Nothing broken"));
  } else for(const k of fixable){
    const on = plan.repairs.has(k);
    const row = el("button", "fixrow" + (on ? " on" : ""),
      '<span class="tick"></span><span class="nm2">' + PARTS[k].name +
      '</span><span class="t2">+' + PARTS[k].fix.toFixed(1) + 's</span>');
    row.onclick = () => { plan.repairs.has(k) ? plan.repairs.delete(k) : plan.repairs.add(k); renderPitMenu(c, S); };
    rep2.appendChild(row);
  }
  $("#pit-time").textContent = pitJobTime(c, plan).toFixed(1) + "s";
}
function closePitMenu(S){ S.menuOpen = false; $("#pitmenu").hidden = true; }
function beginStop(c, S){
  const plan = c.pitPlan;
  const t = pitJobTime(c, plan) + Math.random() * 0.8;
  c.stopT = t; c.stopTotal = t; c.vx = c.vy = 0;
  try{ AUDIO.event("stop", c, S); }catch(e){}
  S.toast("Stopped — crew working");
}
function finishStop(c, S){
  const plan = c.pitPlan;
  const fitted = TYRES[plan.tyre];
  if(plan.tyre !== "none" && fitted){
    c.tyre = fitted; c.used.add(plan.tyre); c.life = 1; c.temp = 0.45;
    if(c.broken.has("punct")){ c.broken.delete("punct"); c.health.punct = 1; }
  }
  for(const k of plan.repairs){ c.broken.delete(k); c.health[k] = 1; }
  c.recalcPerf();
  c.damage = Math.max(0, c.damage - 0.5);
  c.stops++; plan.done = true; c.stopT = 0;
  try{ AUDIO.event("away", c, S, c.stopTotal.toFixed(1) + " seconds, P" + c.pos + "."); }catch(e){}
  S.toast("Away · " + c.stopTotal.toFixed(1) + "s");
}

function crossLine(c){
  const T = S.track, n = T.n;
  if(c.prevNode == null){ c.prevNode = c.node; return false; }
  const a = c.prevNode, b = c.node; c.prevNode = b;
  return a > n * 0.75 && b < n * 0.25;
}

function updateTiming(c){
  const T = S.track, n = T.n, ms = S.clock * 1000;
  // sectors
  const sec = c.node < T.sec[1] ? 0 : c.node < T.sec[2] ? 1 : 2;
  if(sec !== c.curSec && !((c.curSec === 2) && sec === 0)){
    const t = ms - c.secStart;
    if(c.lapStart != null && t > 1000){ c.secT[c.curSec] = t;
      if(c.secBest[c.curSec] == null || t < c.secBest[c.curSec]) c.secBest[c.curSec] = t;
      if(S.bestSec == null) S.bestSec = [null, null, null];
      if(S.bestSec[c.curSec] == null || t < S.bestSec[c.curSec]){ S.bestSec[c.curSec] = t; c.purple = c.purple || {}; } }
    c.secStart = ms; c.curSec = sec;
  }
  if(crossLine(c)){
    if(c.lapStart != null){
      const t = ms - c.lapStart;
      if(t > 8000){
        c.last = t; c.laps.push(t); c.total += t;
        if(c.best == null || t < c.best) c.best = t;
        if(S.fastest == null || t < S.fastest){ S.fastest = t; S.fastestBy = c;
          if(!c.ai) showToast(`Fastest lap — ${fmtTime(t)}`); }
        if(!c.ai){
          if(S.mode === "tt" && (S.bestRec == null || t < (S.bestTT ?? 1e9))){ S.bestTT = t; S.bestRec = c.recBuf.slice(); }
          saveRecord(S.track.id, t, c);
        }
      }
      c.lap++;
    } else { c.lap = 1; }
    c.lapStart = ms; c.secStart = ms; c.curSec = 0;
    if(!c.ai){ c.recBuf = []; }
    if(S.mode === "race" && c.lap > S.laps && !c.finished){
      c.finished = true; c.finishTime = ms; S.finishOrder.push(c);
      if(!c.ai) endSession();
      if(S.finishOrder.length === 1 && c.ai && S.player && !S.player.finished) showToast(`${c.drv.last} takes the win`);
    }
    if(S.mode === "qualy" && c.lap > S.laps && !c.finished){ c.finished = true; if(!c.ai) endSession(); }
    // pit release
    if(c.pitReq && !c.pitting && S.mode === "race" && c.lap <= S.laps) { /* entry handled below */ }
  }
  // pit entry
  if(c.ai && c.pitReq && !c.pitting && S.mode === "race" && c.node >= T.pitIn && c.node < T.pitIn + 6 && c.lap <= S.laps){
    c.pitting = 1; c.pitS = c.node; c.pitDone = false; c.pitT = 0;
    if(!c.ai) showToast("Pit entry — limiter on");
  }
}

function positions(){
  const T = S.track;
  const arr = S.cars.filter(c => !c.dnf);
  for(const c of arr) c.prog = c.lap * T.length + c.s;
  arr.sort((a, b) => (b.finished - a.finished) || (a.finished ? a.finishTime - b.finishTime : b.prog - a.prog));
  arr.forEach((c, i) => { c.pos = i + 1; });
  const leader = arr[0];
  for(const c of arr){
    const d = leader.prog - c.prog;
    c.gap = c === leader ? null : d / Math.max(18, c.speed) * 1000;
    const ahead = arr[c.pos - 2], chaser = arr[c.pos];
    c.gapAhead = ahead ? (ahead.prog - c.prog) / Math.max(18, c.speed) * 1000 : null;
    c.gapBehind = chaser ? (c.prog - chaser.prog) / Math.max(18, c.speed) * 1000 : null;
  }
  return arr;
}

function update(dt){
  S.clock += dt;
  // lights
  if(S.state === "lights"){
    S.lights = Math.min(5, Math.floor(S.clock / 0.85));
    $("#lights").hidden = false;
    [...$("#lights").children].forEach((n, i) => n.classList.toggle("on", i < S.lights && S.clock < 5.1));
    if(S.clock > 5.1 + Math.random() * 0.0){
      S.state = "run"; S.clock = 0; $("#lights").hidden = true;
      for(const c of S.cars){
        c.lapStart = null; c.lap = 0; c.secStart = 0; c.prevNode = c.node;
        // in the window = drive; under it = bogged down; over it = wheelspin
        if(c.revs < LAUNCH_LO){ c.launchGrade = "bog"; c.launchMul = lerp(0.42, 0.9, c.revs / LAUNCH_LO); c.launchT = 2.2; }
        else if(c.revs > LAUNCH_HI){ c.launchGrade = "spin"; c.launchMul = lerp(0.85, 0.5, (c.revs - LAUNCH_HI) / (1 - LAUNCH_HI)); c.launchT = 2.0; }
        else { c.launchGrade = "good"; c.launchMul = 1.10; c.launchT = 1.6; }
      }
      const g = S.player.launchGrade;
      showMsg(g === "good" ? "GREAT START" : g === "bog" ? "BOGGED DOWN" : "WHEELSPIN",
              g === "good" ? "Perfect launch" : g === "bog" ? "Not enough revs" : "Too many revs", 1.5);
    }
  }
  // weather drift
  S.wet = lerp(S.wet, S.wetTarget, dt * 0.15);
  if(S.wetTarget > 0 && S.wet > 0.25 && !S.wetToast){ S.wetToast = true; showToast("Rain — the track is going wet"); }

  for(const c of S.cars){
    if(S.state === "lights"){
      // engines running, brakes on, nobody moves — and no creeping backwards
      c.thr = 0; c.brk = 1; c.steer = 0; c.boost = 0; c.slide = 0;
      c.vx = 0; c.vy = 0; c.railV = 0; c.aiTargetV = 0;
      if(c.ai) c.revs = clamp(LAUNCH_LO + (LAUNCH_HI - LAUNCH_LO) * (0.2 + c.drv.skill * 0.7) +
                              (Math.random() - 0.5) * 0.10, 0.15, 1);
      else {
        const gas = KEY["arrowup"] || KEY["w"] || TOUCH.gas;
        c.revs = clamp(c.revs + (gas ? 0.55 : -0.9) * dt, 0, 1);
      }
      continue;
    }
    if(c.ai) driveAI(c, S, dt);
    else { playerPit(c, S, dt); if(c.stopT > 0){ c.vx = 0; c.vy = 0; continue; } playerInput(c, dt); }
    c.step(dt, S);
    if(S.state === "run") updateTiming(c);
    // particles
    const spd = c.speed;
    if(c.slide > 0.3 && spd > 12 && Math.random() < 0.6){
      const bx = c.x - Math.cos(c.h) * 1.6, by = c.y - Math.sin(c.h) * 1.6;
      spawn(bx, by, c.z + 0.2, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, 0.4, 0.8,
            S.wet > 0.2 ? "#C9DCE8" : "#B9BEC4", 0.45, "smoke");
    }
    if(S.wet > 0.2 && spd > 14){
      const puffs = S.wet > 0.6 ? 2 : 1;
      for(let q = 0; q < puffs; q++){
        const bx = c.x - Math.cos(c.h) * (2.0 + q * 0.9), by = c.y - Math.sin(c.h) * (2.0 + q * 0.9);
        spawn(bx, by, c.z + 0.3,
              -Math.cos(c.h) * (5 + spd * 0.10) + (Math.random() - 0.5) * 6,
              -Math.sin(c.h) * (5 + spd * 0.10) + (Math.random() - 0.5) * 6,
              1.8 + Math.random() * 1.6, 0.55 + S.wet * 0.5, "#DCEAF4", 0.36 + S.wet * 0.45, "smoke");
      }
    }
    if(c.kerbShake > 0.5 && spd > 25 && Math.random() < 0.5)
      spawn(c.x, c.y, c.z + 0.1, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, 3 + Math.random() * 4, 0.35, "#FFC46B", 0.16, "spark");
    // the plank grounding out — more often on a battered or heavily loaded car
    if(spd > 30 && !c.wrecked){
      const bottoming = 0.10 + c.damage * 0.9 + (c.broken.has("floor") ? 1.2 : 0) +
                        Math.abs(c.roll || 0) * 2.2 + c.kerbShake * 0.6;
      if(Math.random() < bottoming * dt * 4){
        const bx = c.x - Math.cos(c.h) * 1.3, by = c.y - Math.sin(c.h) * 1.3;
        for(let q = 0; q < 2 + (Math.random() * 3 | 0); q++)
          spawn(bx, by, c.z + 0.06,
                -Math.cos(c.h) * (4 + Math.random() * 7) + (Math.random() - 0.5) * 4,
                -Math.sin(c.h) * (4 + Math.random() * 7) + (Math.random() - 0.5) * 4,
                1.4 + Math.random() * 3.4, 0.30 + Math.random() * 0.25,
                Math.random() < 0.75 ? "#FFC46B" : "#FFF0C0", 0.15, "spark");
      }
    }
    if(Math.abs(c.off) > S.track.half + 1.5 && spd > 14 && S.track.barrier !== "wall" && Math.random() < 0.7)
      spawn(c.x, c.y, c.z + 0.1, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, 1.5, 0.6,
            S.track.pal.ground, 0.5, "smoke");
    if(c.dnf && !c.wrecked && Math.random() < dt * 3)
      spawn(c.x, c.y, c.z + 0.4, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5,
            1.2 + Math.random(), 1.6, "#6E757D", 0.5, "smoke");
    if(c === S.player && S.mode === "tt"){ c.recBuf = c.recBuf || [];
      if(S.clock - (c.recT || 0) > 0.05){ c.recT = S.clock; c.recBuf.push([c.x, c.y, c.h, c.z]); } }
  }
  // car-to-car contact
  for(let a = 0; a < S.cars.length; a++) for(let b = a + 1; b < S.cars.length; b++){
    const A = S.cars[a], B = S.cars[b];
    if(A.dnf || B.dnf || A.pitting || B.pitting) continue;
    // only cars on the same stretch of road can touch — some circuits pass close to themselves
    let ds2 = B.s - A.s, halfL = S.track.length / 2;
    if(ds2 > halfL) ds2 -= S.track.length; else if(ds2 < -halfL) ds2 += S.track.length;
    if(Math.abs(ds2) > 22) continue;
    const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy);
    if(d < 3.4 && d > 0.001){
      const ux = dx / d, uy = dy / d, push = (3.4 - d) / 2;
      A.x -= ux * push; A.y -= uy * push; B.x += ux * push; B.y += uy * push;
      const rel = (B.vx - A.vx) * ux + (B.vy - A.vy) * uy;
      if(rel < 0){
        const imp = -rel * 0.68;
        A.vx -= ux * imp; A.vy -= uy * imp; B.vx += ux * imp; B.vy += uy * imp;
        // wheels touching throws the cars sideways and can spin them
        if(imp > 5){
          const kick = clamp(imp * 0.10, 0.2, 2.6);
          A.spinV = (A.spinV || 0) - kick * Math.sign(ds2 || 1);
          B.spinV = (B.spinV || 0) + kick * Math.sign(ds2 || 1);
          if(imp > 11){
            if(A.spinT <= 0 && !A.wrecked){ A.spinT = 0.7 + Math.random() * 0.8; }
            if(B.spinT <= 0 && !B.wrecked){ B.spinT = 0.7 + Math.random() * 0.8; }
          }
          const mx2 = (A.x + B.x) / 2, my2 = (A.y + B.y) / 2;
          for(let q = 0; q < Math.min(12, 3 + imp | 0); q++)
            spawn(mx2, my2, A.z + 0.3, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14,
                  2 + Math.random() * 7, 0.3 + Math.random() * 0.4,
                  q % 3 ? "#FFC46B" : "#C9CED4", 0.2, "spark");
          if(imp > 9){ A.scuff(S, imp * 0.7); }
        }
        if(imp > 9){
          const nose = Math.abs(ds2) < 2.2 ? "side" : (ds2 > 0 ? "front" : "rear");
          const tail = Math.abs(ds2) < 2.2 ? "side" : (ds2 > 0 ? "rear" : "front");
          A.hurt(imp * 0.75, nose, S); B.hurt(imp * 0.75, tail, S);
        }
        if(A === S.player || B === S.player) S.shake = Math.min(1, S.shake + imp * 0.04);
        
      }
    }
  }
  stepParts(dt);
  positions();

  // ghost playback
  if(S.mode === "tt" && S.bestRec && S.player.lapStart != null){
    const t = (S.clock * 1000 - S.player.lapStart) / 50 | 0;
    const f = S.bestRec[Math.min(t, S.bestRec.length - 1)];
    if(f){ if(!S.ghostCar){ S.ghostCar = new Car(S.player.team, S.player.drv, 99, S.track); }
      S.ghostCar.x = f[0]; S.ghostCar.y = f[1]; S.ghostCar.h = f[2]; S.ghostCar.z = f[3]; S.ghost = true; }
  }
  S.shake = Math.max(0, S.shake - dt * 2.6);
  try{ AUDIO.frame(S, dt); }catch(e){}
  // your own accident plays out before the classification comes up
  if(S.crashCam > 0){
    S.crashCam -= dt;
    const settled = !S.player.wrecked && S.player.speed < 1.2;
    if(S.crashCam <= 0 || (settled && S.crashCam < 5.6)){ S.crashCam = 0; endSession(); }
  }

  // camera
  const p = S.player;
  // real accelerations, for the way the camera leans
  const ax = ((p.vx - (p.pvx == null ? p.vx : p.pvx)) / Math.max(dt, 1e-4));
  const ay = ((p.vy - (p.pvy == null ? p.vy : p.pvy)) / Math.max(dt, 1e-4));
  p.pvx = p.vx; p.pvy = p.vy;
  const gLat = clamp((-ax * Math.sin(p.h) + ay * Math.cos(p.h)) / 30, -1.4, 1.4);
  const gFwd = clamp((ax * Math.cos(p.h) + ay * Math.sin(p.h)) / 30, -1.4, 1.4);
  S.gLat = lerp(S.gLat || 0, gLat, 1 - Math.pow(0.02, dt));
  S.gFwd = lerp(S.gFwd || 0, gFwd, 1 - Math.pow(0.02, dt));
  if(S.tv){
    S.tv.t -= dt;
    if(S.tv.t <= 0 || S.crashCam || p.dnf){ R.persp = false; R.tv = false; S.tv = null; R.froll = 0; R.fpitch = 0; }
    else {
      R.persp = true; R.tv = true; R.focal = R.W * 0.78;
      const tx3 = p.x + p.vx * 0.12, ty3 = p.y + p.vy * 0.12, tz3 = p.z + 0.7;
      R.fx = S.tv.x; R.fy = S.tv.y; R.fz = S.tv.z;
      const look = Math.atan2(ty3 - R.fy, tx3 - R.fx);
      R.fcos = Math.cos(look); R.fsin = Math.sin(look);
      const f = Math.max((tx3 - R.fx) * R.fcos + (ty3 - R.fy) * R.fsin, 1);
      R.fpitch = -(tz3 - R.fz) * (R.focal / f) + R.H * 0.06;
      R.froll = 0; R.shakeY = 0;
      return;
    }
  }
  R.froll = 0; R.fpitch = 0;
  const wantLow = S.state === "lights" ? 1 : 0;
  S.launchCam = wantLow ? 1 : Math.max(0, (S.launchCam || 0) - dt * 0.5);
  const lc = S.launchCam * S.launchCam * (3 - 2 * S.launchCam);      // ease out
  R.isx = lerp(ISX, CAM_LOW.isx, lc);
  R.isy = lerp(ISY, CAM_LOW.isy, lc);
  R.zs  = lerp(ZS,  CAM_LOW.zs,  lc);
  const lead = lerp(0.55, 0, lc);
  const ahead = lc * 20;                                             // look up the road
  const [tx, ty0] = isoOf({ x:p.x + p.vx * lead + Math.cos(p.h) * ahead,
                            y:p.y + p.vy * lead + Math.sin(p.h) * ahead, z:p.z });
  const ty = ty0 - lc * 0.17 * R.H / Math.max(R.zoom, 1);            // sit the car low in frame
  R.camX = lerp(R.camX, tx, 1 - Math.pow(0.0008, dt));
  R.camY = lerp(R.camY, ty, 1 - Math.pow(0.0008, dt));
  const inLane = p.inPit || p.stopT > 0 || p.pitting;
  S.pitFocus = lerp(S.pitFocus || 0, inLane ? 1 : 0, 1 - Math.pow(0.05, dt));
  R.targZoom = lerp(clamp(Math.min(R.W, R.H) / (46 + p.speed * 0.50), 4.4, 14),
                    clamp(Math.min(R.W, R.H) / 27, 7, 19), S.pitFocus);
  R.targZoom = lerp(R.targZoom, clamp(Math.min(R.W, R.H) / 32, 6.5, 15), lc);
  if(S.crashCam > 0) R.targZoom = lerp(R.targZoom, clamp(Math.min(R.W, R.H) / 56, 5, 10), 0.7);
  R.targZoom *= S.track.def.zoomK || 1;                              // a street circuit wants the camera in close
  R.userZoomT += dt;
  if(R.userZoomT > ZOOM_HOLD) R.userZoom = lerp(R.userZoom, 1, 1 - Math.pow(0.22, dt));
  if(Math.abs(R.userZoom - 1) < 0.004) R.userZoom = 1;
  R.targZoom = clamp(R.targZoom * R.userZoom, 2.2, 34);
  // a deliberate nudge should land quickly; the drift back should not
  R.zoom = lerp(R.zoom, R.targZoom, 1 - Math.pow(R.userZoomT < ZOOM_HOLD ? 0.0006 : 0.02, dt));
  R.shakeY = (Math.random() - 0.5) * S.shake * 9 + (p.kerbShake > 0.5 ? (Math.random() - 0.5) * 2.2 : 0);
}

/* ---------- end of session ---------- */
function endSession(){
  if(S.ended) return; S.ended = true; S.state = "done";
  try{ AUDIO.silence(); }catch(e){}
  const arr = positions();
  const T = S.track;
  const res = arr.map(c => {
    const gap = c === arr[0] ? null : (c.finished && arr[0].finished ? c.finishTime - arr[0].finishTime : c.gap);
    return { car:c, pos:c.pos, gap, best:c.best, stops:c.stops, tyre:c.tyre };
  });
  const out = S.cars.filter(c => c.dnf).sort((a, b) => (b.prog || 0) - (a.prog || 0));
  for(const c of out) res.push({ car:c, pos:res.length + 1, gap:null, best:c.best, stops:c.stops, tyre:c.tyre, dnf:true });
  res.forEach((r, i) => r.pos = i + 1);
  // two-compound rule
  if(S.mode === "race" && S.mustPit){
    for(const r of res) if(!r.dnf && r.car.used.size < 2){ r.dq = true; }
    res.sort((a, b) => (a.dnf - b.dnf) || (a.dq - b.dq) || (a.pos - b.pos));
    res.forEach((r, i) => r.pos = i + 1);
  }
  S.results = res;
  if(S.champ && S.mode === "race") applyChampionship(res);
  const sess = S; setTimeout(() => { if(S === sess) showResults(res); }, 900);
  showMsg(S.player.dnf ? "DNF" : S.mode === "qualy" ? "CHEQUERED FLAG" : "FINISH",
    S.player.dnf ? (S.player.retiredBy || "Retired") : S.mode !== "race" ? "Session over" : S.player.pos === 1 ? "Race win" : `P${S.player.pos}`, 2.4);
  $("#flag").classList.add("on"); setTimeout(() => $("#flag").classList.remove("on"), 1400);
}

function loop(t){
  requestAnimationFrame(loop);
  const dt = Math.min(0.033, (t - lastT) / 1000 || 0.016); lastT = t;
  if(!S){ return; }
  if(!paused && !S.menuOpen && S.state !== "done") update(dt);
  else if(!paused && S.state === "done") { S.clock += dt; stepParts(dt); }
  renderWorld(S);
  if(R.tv && S.tv){
    const ctx = R.ctx; ctx.save(); ctx.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
    ctx.fillStyle = "rgba(10,12,16,.72)"; ctx.fillRect(18, R.H - 54, 190, 34);
    ctx.fillStyle = "#FF3B30"; ctx.beginPath(); ctx.arc(34, R.H - 37, 6, 0, TAU); ctx.fill();
    ctx.fillStyle = "#F2F2F2"; ctx.font = "700 15px 'Saira Condensed',sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText("LIVE · " + S.tv.name, 48, R.H - 37);
    ctx.restore();
  }
  hudT += dt;
  if(hudT > 0.07){ hudT = 0; updateHUD(); drawMini(S); }
}

/* ---------- 9. sound ------------------------------------------------------
   Everything here is synthesised — no samples. Engines are exhaust-pulse trains
   fired through fixed formants, tyres and crew are filtered noise, and the radio
   is on-screen text cued by a squelch beep.
   -------------------------------------------------------------------------- */
const AUDIO = {
  ok:false, on:true, ctx:null, master:null, noiseBuf:null,
  eng:null, traf:[], squeal:null, crowd:null, wind:null,
  lastSay:0, lastCom:0, lastGap:0, lastPos:0, gunT:0, yellT:0,
  saidBox:false, saidTyre:false, saidStart:false,

  init(){
    if(this.ctx || !this.on) return;
    try{
      const AC = window.AudioContext || window.webkitAudioContext;
      if(!AC) return;
      const c = this.ctx = new AC();
      const m = this.master = c.createGain();
      m.gain.value = 0.5; m.connect(c.destination);
      const len = Math.floor(c.sampleRate * 2);
      const buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      let last = 0;
      for(let i = 0; i < len; i++){ const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = w * 0.7 + last * 1.6; }
      this.noiseBuf = buf;
      this.ok = true;
      this.loadSamples();
    }catch(e){ this.ok = false; }
  },
  resume(){ if(this.ctx && this.ctx.state === "suspended") this.ctx.resume(); },

  /* ---- recorded samples ---------------------------------------------------
     Engines are two looping layers crossfaded by revs, each resampled with
     playbackRate so pitch tracks continuously — the standard racing-game trick.
     If anything fails to load we fall back to the synthesised engine.        */
  SRC:{ gun:gunUrl, radio:radioUrl },
  buf:{}, useSamples:false, loading:false,

  // works whether the clip is a file alongside the page or inlined as a data URI
  fetchAudio(url){
    if(url.slice(0, 5) === "data:"){
      try{
        const bin = atob(url.slice(url.indexOf(",") + 1));
        const ab = new ArrayBuffer(bin.length), v = new Uint8Array(ab);
        for(let i = 0; i < bin.length; i++) v[i] = bin.charCodeAt(i);
        return Promise.resolve(ab);
      }catch(e){ return Promise.reject(e); }
    }
    return fetch(url).then(r => r.ok ? r.arrayBuffer() : Promise.reject(r.status));
  },
  loadSamples(){
    if(this.loading || !this.ctx) return;
    this.loading = true;
    const names = Object.keys(this.SRC);
    let done = 0;
    names.forEach(nm => {
      this.fetchAudio(this.SRC[nm])
        .then(ab => new Promise((res, rej) => {
          const p = this.ctx.decodeAudioData(ab, res, rej);
          if(p && p.then) p.then(res, rej);
        }))
        .then(b => { this.buf[nm] = b; })
        .catch(() => {})
        .finally(() => { if(++done === names.length) this.samplesReady(); });
    });
  },
  samplesReady(){
    try{
      this.useSamples = true;
    }catch(e){ this.useSamples = false; }
  },
  /* one engine recording, resampled across the whole rev range */
  sVoice(buf, simple){
    const c = this.ctx, out = c.createGain(); out.gain.value = 0;
    const pan = c.createStereoPanner ? c.createStereoPanner() : null;
    const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 5000; lp.Q.value = 0.4;
    const hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 60;
    const s2 = c.createBufferSource(); s2.buffer = buf; s2.loop = true;
    // keep the loop away from the clip's own fade in and out
    s2.loopStart = Math.min(0.2, buf.duration * 0.05);
    s2.loopEnd = Math.max(s2.loopStart + 0.4, buf.duration - 0.15);
    const g = c.createGain(); g.gain.value = 0;
    s2.connect(g); g.connect(hp); hp.connect(lp); lp.connect(out);
    if(pan){ out.connect(pan); pan.connect(this.master); } else out.connect(this.master);
    s2.start(0, s2.loopStart + Math.random() * (s2.loopEnd - s2.loopStart) * 0.8);
    return { set:(rn, thr, vol, pv, dop) => {
      const t = c.currentTime, r = clamp(rn, -0.4, 1.35);
      s2.playbackRate.setTargetAtTime(clamp((0.60 + r * 1.00) * (dop || 1), 0.3, 3), t, 0.035);
      g.gain.setTargetAtTime(vol, t, 0.06);
      lp.frequency.setTargetAtTime(1200 + thr * 8500 + Math.max(0, r) * 3200, t, 0.05);
      out.gain.setTargetAtTime(vol > 0 ? 1 : 0, t, 0.05);
      if(pan) pan.pan.setTargetAtTime(pv, t, 0.07);
    } };
  },
  sLoop(b, startAt){
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = b; s.loop = true;
    s.loopStart = Math.min(0.2, b.duration * 0.05);
    s.loopEnd = Math.max(s.loopStart + 0.5, b.duration - 0.15);
    const g = c.createGain(); g.gain.value = 0;
    const pan = c.createStereoPanner ? c.createStereoPanner() : null;
    s.connect(g);
    if(pan){ g.connect(pan); pan.connect(this.master); } else g.connect(this.master);
    s.start(0, startAt || s.loopStart);
    return { src:s, gain:g, pan, set:(v, rate, pv) => { const t = c.currentTime;
      g.gain.setTargetAtTime(v, t, 0.10);
      if(rate) s.playbackRate.setTargetAtTime(rate, t, 0.1);
      if(pan && pv != null) pan.pan.setTargetAtTime(pv, t, 0.12); } };
  },
  /* fire a slice of a sample as a one-shot */
  slice(name, off, dur, vol, pv, rate){
    const b = this.buf[name];
    if(!b || !this.ok) return false;
    const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = b; s.playbackRate.value = rate || 1;
    const g = c.createGain();
    const d = Math.min(dur, Math.max(0.05, b.duration - off));
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + Math.min(0.03, d * 0.25));
    g.gain.setTargetAtTime(0.0001, t + d * 0.7, d * 0.25);
    const pan = c.createStereoPanner ? c.createStereoPanner() : null;
    s.connect(g);
    if(pan){ pan.pan.value = pv || 0; g.connect(pan); pan.connect(this.master); } else g.connect(this.master);
    s.start(t, clamp(off, 0, Math.max(0, b.duration - 0.1)), d);
    s.stop(t + d / (rate || 1) + 0.1);
    return true;
  },
  /* An engine is a train of exhaust pulses fired through fixed resonances.
     The pulse RATE tracks revs; the resonances do NOT move — that is what stops
     it sounding like a synth sweep. Harmonic-rich periodic wave -> four fixed
     formants -> mechanical noise on top. */
  engineWave(){
    if(this._wave) return this._wave;
    const N = 24, real = new Float32Array(N), imag = new Float32Array(N);
    for(let i = 1; i < N; i++){
      const roll = Math.pow(i, -0.85);                       // spectral tilt
      const lumpy = 1 + 0.35 * Math.sin(i * 1.9) + 0.18 * Math.sin(i * 4.3);
      imag[i] = roll * lumpy * (i % 2 ? 1 : 0.72);           // uneven firing
    }
    return (this._wave = this.ctx.createPeriodicWave(real, imag, { disableNormalization:false }));
  },
  voice(simple){
    const c = this.ctx, out = c.createGain(); out.gain.value = 0;
    const pan = c.createStereoPanner ? c.createStereoPanner() : null;

    // fixed exhaust / bodyshell resonances — these never track rpm
    const mkF = (type, f, q, g) => { const b = c.createBiquadFilter(); b.type = type;
      b.frequency.value = f; b.Q.value = q; if(g != null) b.gain.value = g; return b; };
    const sum = c.createGain(); sum.gain.value = 1;
    const fm1 = mkF("bandpass", 165, 7), fm2 = mkF("bandpass", 480, 5.5),
          fm3 = mkF("bandpass", 1180, 4), fm4 = mkF("peaking", 2550, 1.6, 7);
    const gm1 = c.createGain(), gm2 = c.createGain(), gm3 = c.createGain();
    gm1.gain.value = 0.9; gm2.gain.value = 0.55; gm3.gain.value = 0.3;
    const tone = c.createGain();                              // brightness control
    const lp = mkF("lowpass", 1400, 0.7);

    const osc = c.createOscillator(); osc.setPeriodicWave(this.engineWave());
    const sub = c.createOscillator(); sub.type = "sine";
    const subg = c.createGain(); subg.gain.value = 0.32;
    osc.connect(fm1); osc.connect(fm2); osc.connect(fm3); osc.connect(fm4);
    fm1.connect(gm1); fm2.connect(gm2); fm3.connect(gm3);
    gm1.connect(sum); gm2.connect(sum); gm3.connect(sum); fm4.connect(sum);
    sub.connect(subg); subg.connect(sum);
    sum.connect(lp); lp.connect(tone); tone.connect(out);
    tone.gain.value = 1;

    // valvetrain / induction rattle, level rises with revs
    let mechG = null;
    if(!simple){
      const ns = c.createBufferSource(); ns.buffer = this.noiseBuf; ns.loop = true;
      const bp = mkF("bandpass", 2600, 1.1);
      mechG = c.createGain(); mechG.gain.value = 0;
      ns.connect(bp); bp.connect(mechG); mechG.connect(lp); ns.start();
    }
    if(pan){ out.connect(pan); pan.connect(this.master); } else out.connect(this.master);
    osc.start(); sub.start();

    let jitter = 0, jt = 0;
    return { set:(fire, thr, vol, pv, bright, dt) => {
      const t = c.currentTime;
      // combustion is never perfectly even — a touch of wander keeps it organic
      jt -= dt || 0.016;
      if(jt <= 0){ jt = 0.045 + Math.random() * 0.05; jitter = (Math.random() - 0.5) * 0.022; }
      const f = Math.max(20, fire * (1 + jitter));
      osc.frequency.setTargetAtTime(f, t, 0.012);
      sub.frequency.setTargetAtTime(f / 3, t, 0.02);
      // on throttle the upper formants open up; off throttle it goes hollow
      gm2.gain.setTargetAtTime(0.35 + thr * 0.5, t, 0.05);
      gm3.gain.setTargetAtTime(0.12 + thr * 0.42, t, 0.05);
      lp.frequency.setTargetAtTime(bright, t, 0.04);
      if(mechG) mechG.gain.setTargetAtTime(0.012 + 0.03 * clamp(fire / 600, 0, 1), t, 0.06);
      out.gain.setTargetAtTime(vol, t, 0.05);
      if(pan) pan.pan.setTargetAtTime(pv, t, 0.07);
    } };
  },
  noiseVoice(type, freq, q, g){
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const gn = c.createGain(); gn.gain.value = g;
    const pan = c.createStereoPanner ? c.createStereoPanner() : null;
    src.connect(f); f.connect(gn);
    if(pan){ gn.connect(pan); pan.connect(this.master); } else gn.connect(this.master);
    src.start();
    return { gain:gn, filt:f, pan, set:(v, fr, pv) => { const t = c.currentTime;
      gn.gain.setTargetAtTime(v, t, 0.08);
      if(fr) f.frequency.setTargetAtTime(fr, t, 0.1);
      if(pan && pv != null) pan.pan.setTargetAtTime(pv, t, 0.1); } };
  },
  /* short one-shots */
  burst(freq, q, dur, vol, pv, type){
    if(!this.ok) return;
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = type || "bandpass"; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + Math.min(0.02, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const pan = c.createStereoPanner ? c.createStereoPanner() : null;
    src.connect(f); f.connect(g);
    if(pan){ pan.pan.value = pv || 0; g.connect(pan); pan.connect(this.master); } else g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.05);
  },
  pop(v){
    return;
    if(this.slice("backfire", 0.05 + Math.random() * 0.5, 0.35, 0.30 * v, (Math.random() - 0.5) * 0.4, 0.9 + Math.random() * 0.5)) return;
    this.burst(220 + Math.random() * 900, 3, 0.07, 0.07 * v, (Math.random() - 0.5) * 0.4);
  },
  whoosh(pv, spd){
    return;
    if(!this.ok) return;
    if(this.buf.passby && this.slice("passby", 2 + Math.random() * 25, 0.7,
        clamp(0.25 + spd * 0.02, 0.1, 0.6), pv, 1.05 + Math.random() * 0.25)) return;
    const c = this.ctx, t = c.currentTime, dur = 0.42;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 1.1;
    f.frequency.setValueAtTime(1800, t); f.frequency.exponentialRampToValueAtTime(380, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(clamp(0.05 + spd * 0.006, 0.02, 0.16), t + 0.10);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const pan = c.createStereoPanner ? c.createStereoPanner() : null;
    src.connect(f); f.connect(g);
    if(pan){ pan.pan.setValueAtTime(pv, t); pan.pan.linearRampToValueAtTime(-pv, t + dur); g.connect(pan); pan.connect(this.master); }
    else g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.05);
  },
  gun(pv){   // wheel gun
    if(!this.ok) return;
    if(this.slice("gun", 0.1 + Math.random() * 2.8, 0.42, 0.5, pv, 0.95 + Math.random() * 0.3)) return;
    const c = this.ctx, t = c.currentTime, dur = 0.34 + Math.random() * 0.3;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1500 + Math.random() * 700; f.Q.value = 2.2;
    const g = c.createGain(); g.gain.value = 0;
    const lfo = c.createOscillator(); lfo.type = "square"; lfo.frequency.value = 42 + Math.random() * 16;
    const lg = c.createGain(); lg.gain.value = 0.10;
    lfo.connect(lg); lg.connect(g.gain); lfo.start(t); lfo.stop(t + dur);
    const env = c.createGain(); env.gain.setValueAtTime(1, t);
    env.gain.setTargetAtTime(0.0001, t + dur * 0.7, 0.08);
    const pan = c.createStereoPanner ? c.createStereoPanner() : null;
    src.connect(f); f.connect(g); g.connect(env);
    if(pan){ pan.pan.value = pv || 0; env.connect(pan); pan.connect(this.master); } else env.connect(this.master);
    src.start(t); src.stop(t + dur + 0.1);
  },
  yell(){    // a crew member shouting, heard from inside a helmet
    if(!this.ok) return;
    const c = this.ctx, t = c.currentTime, dur = 0.22 + Math.random() * 0.25;
    const o = c.createOscillator(); o.type = "sawtooth";
    o.frequency.setValueAtTime(130 + Math.random() * 90, t);
    o.frequency.linearRampToValueAtTime(90 + Math.random() * 120, t + dur);
    const f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 700 + Math.random() * 500; f.Q.value = 4;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.035, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  },
  squelch(){
    if(this.slice("radio", 0.02, 0.7, 0.45, 0, 1)) return;
    this.burst(1200, 5, 0.06, 0.05, 0, "bandpass");
  },

  /* ---- speech: race engineer and commentary box ---- */
  say(text, who, priority){
    if(!this.on) return;
    const now = performance.now() / 1000;
    const lane = who === "com" ? "lastCom2" : "lastEng2";
    const gap = who === "com" ? 5 : 7;
    if(!priority && now - (this[lane] || 0) < gap) return;
    this[lane] = now;
    this.banner(text, who);
    try{ this.squelch(); }catch(e){}
  },
  banner(text, who){
    const n = document.getElementById("h-radio");
    if(!n) return;
    n.classList.toggle("com", who === "com");
    document.getElementById("h-radio-who").textContent = who === "com" ? "Commentary" : "Race engineer";
    document.getElementById("h-radio-txt").textContent = text;
    n.hidden = false; n.style.opacity = "1";
    clearTimeout(this._bt);
    this._bt = setTimeout(() => { n.style.opacity = "0";
      this._bt2 = setTimeout(() => { n.hidden = true; }, 300); }, 4200);
  },
  silence(){
    try{
      const n = document.getElementById("h-radio"); if(n) n.hidden = true;
    }catch(e){}
  },

  /* ---- events from the simulation ---- */
  event(kind, car, S, extra){
    if(!this.ok || !this.on || !S || !car) return;
    const isMe = S.player === car, last = car.drv ? car.drv.last : "";
    const pick = arr => arr[(Math.random() * arr.length) | 0];
    if(kind === "fail"){
      if(isMe) this.say("We're seeing damage. " + extra + ". Box when you can.", "eng", true);
      else this.say(pick(["Trouble for " + last + "! That looks like " + extra.toLowerCase() + ".",
                          "Oh, " + last + " is in trouble — " + extra.toLowerCase() + " damage there.",
                          "Big problem for " + last + ", that's the " + extra.toLowerCase() + " gone."]), "com", true);
    } else if(kind === "out"){
      if(isMe) this.say("That's the end of our race. Sorry about that.", "eng", true);
      else this.say(pick(["And that is the end of " + last + "'s race!",
                          last + " is out! What a blow for them.",
                          "It's all over for " + last + "."]), "com", true);
      this.burst(140, 1.2, 0.8, 0.16, 0, "lowpass");
    } else if(kind === "moment"){
      if(isMe) return;
      this.say(pick([last + " has a huge moment there!",
                     "Lock up for " + last + "!",
                     last + " runs wide — that will cost him.",
                     "Ooh, " + last + " nearly lost that one!"]), "com");
    } else if(kind === "pitstop"){
      if(isMe) return;
      this.say(pick([last + " peels into the pit lane.",
                     "And " + last + " is coming in for service.",
                     last + " takes the pit entry — interesting strategy call."]), "com");
    } else if(kind === "pass"){
      this.say(pick(["Great move! " + last + " takes the place.",
                     last + " is through — that was brave.",
                     "Wheel to wheel, and " + last + " makes it stick!"]), "com");
    } else if(kind === "stop"){
      this.gunT = 0; this.yellT = 0;
    } else if(kind === "away"){
      if(isMe) this.say("Away you go. " + extra, "eng", true);
    }
  },

  /* ---- the engineer's own running commentary ---- */
  engineer(S, dt){
    const p = S.player, now = performance.now() / 1000;
    if(S.state === "lights" && !this.saidStart){ this.saidStart = true;
      this.say("Radio check. Lights out shortly — let's have a clean start.", "eng", true); return; }
    if(S.mode !== "race") return;
    if(!this.saidBox && S.mustPit && p.stops === 0 && p.lap >= Math.max(2, Math.floor(S.laps * 0.42))){
      this.saidBox = true;
      this.say("Box this lap, box box. Pit entry is on the " + (S.track.pitSide < 0 ? "right" : "left") + ".", "eng", true);
      return;
    }
    if(!this.saidTyre && p.life < 0.3){
      this.saidTyre = true;
      this.say("Tyres are going away now. Start thinking about a stop.", "eng", true);
      return;
    }
    if(p.damage > 0.45 && !this.saidDmg){ this.saidDmg = true;
      this.say("The car has taken a knock. Keep an eye on it.", "eng", true); return; }
    if(now - this.lastGap > 15){
      this.lastGap = now;
      const lines = [];
      if(p.pos === 1) lines.push("You're leading. Gap behind is " + ((p.gapBehind || 1500) / 1000).toFixed(1) + ".");
      else if(p.gapAhead != null) lines.push("Gap to the car ahead, " + (p.gapAhead / 1000).toFixed(1) + ".");
      if(p.life < 0.55) lines.push("Tyres at " + Math.round(p.life * 100) + " per cent.");
      if(p.batt > 0.8) lines.push("Full battery — use the override on the straight.");
      if(S.wet > 0.3 && p.tyre.key !== "wet") lines.push("It's raining and you're on slicks. Be careful out there.");
      if(p.best) lines.push("Last lap was " + fmtTime(p.last) + ". Keep it up.");
      if(lines.length) this.say(lines[(Math.random() * lines.length) | 0], "eng");
    }
    if(this.lastPos && p.pos < this.lastPos) this.say("P" + p.pos + " now. Well done.", "eng", true);
    else if(this.lastPos && p.pos > this.lastPos) this.say("We've lost a place, P" + p.pos + ". Head down.", "eng");
    this.lastPos = p.pos;
  },

  /* ---- per-frame mix: crew, crowd and radio only ---- */
  frame(S, dt){
    if(!this.ok || !this.on || !S || !S.player) return;
    const p = S.player;
    if(p.dnf || S.state === "done"){ this.silence(); return; }
    // ---- pit crew ----
    if(p.stopT > 0){
      this.gunT -= dt; this.yellT -= dt;
      if(this.gunT <= 0){ this.gunT = 0.20 + Math.random() * 0.22; this.gun((Math.random() - 0.5) * 1.5); }
      if(this.yellT <= 0){ this.yellT = 0.5 + Math.random() * 1.1; this.yell(); }
    }

    this.engineer(S, dt);
  },
  reset(){ this.saidBox = false; this.saidTyre = false; this.saidStart = false; this.saidDmg = false;
    this.lastPos = 0; this.lastGap = 0; this.lastEng2 = 0; this.lastCom2 = 0; },
  toggle(){
    this.on = !this.on;
    if(this.master) this.master.gain.value = this.on ? 0.5 : 0;
    showToast(this.on ? "Sound on" : "Sound muted");
  },
};
addEventListener("pointerdown", () => { AUDIO.init(); AUDIO.resume(); }, { passive:true });
addEventListener("keydown", () => { AUDIO.init(); AUDIO.resume(); });

/* ---------- 7. interface -------------------------------------------------- */
const SCREENS = ["screen-title", "screen-setup", "screen-results", "screen-standings"];
function show(id){
  for(const s of SCREENS) document.getElementById(s).hidden = (s !== id);
  const racing = id === null;
  $("#hud").hidden = !racing || !S;
  $("#touch").hidden = !racing || !("ontouchstart" in window || navigator.maxTouchPoints > 0);
}
let msgT = 0;
function showMsg(big, small, secs){
  const m = $("#msg"); $("#msg-b").textContent = big; $("#msg-s").textContent = small || "";
  m.hidden = false; clearTimeout(msgT); msgT = setTimeout(() => { m.hidden = true; }, secs * 1000);
}
let toastT = 0;
function showToast(txt){
  const t = $("#toast"); t.textContent = txt; t.classList.add("on");
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), 2600);
}
function togglePause(){
  if(!S || S.state === "done") return;
  setPaused(!paused); $("#pause").hidden = !paused;
  if(paused) try{ AUDIO.silence(); }catch(e){}
  const eb = document.getElementById("pb-end");
  if(eb) eb.hidden = !(S && S.mode !== "race");
  if(paused) $("#pause-sub").textContent =
    `${S.track.name} · ${S.mode === "race" ? "Race" : S.mode === "qualy" ? "Qualifying" : "Time trial"} · Lap ${Math.max(1, S.player.lap)}${S.mode === "race" ? " of " + S.laps : ""}`;
}

function buildBoard(){
  const b = $("#h-board"); b.innerHTML = "";
  for(let i = 0; i < 6; i++){
    const r = el("div", "tw", `<span class="p"></span><span class="n"></span><span class="g"></span>`);
    b.appendChild(r);
  }
}
function rpmOfCar(c){
  const kph = c.speed * 3.6, gear = clamp(Math.ceil(kph / 42), 1, 8);
  return 4200 + clamp((kph - (gear - 1) * 42) / 42, 0, 1) * 9200;
}
function updateHUD(){
  if(!S || !S.player) return;
  const c = S.player, T = S.track, ms = S.clock * 1000;
  $("#h-pos").innerHTML = `${c.pos}<small>/${S.cars.length}</small>`;
  $("#h-lap").innerHTML = S.mode === "race" ? `${clamp(c.lap, 1, S.laps)}<small>/${S.laps}</small>`
    : `${Math.max(1, c.lap)}<small>/∞</small>`;
  const cur = c.lapStart == null ? 0 : ms - c.lapStart;
  $("#h-time").textContent = c.lapStart == null ? "OUT LAP" : fmtTime(cur);
  for(let i = 0; i < 3; i++){
    const n = document.getElementById("s" + (i + 1)), t = c.secT[i];
    n.style.background = t == null ? "#2B333D"
      : (S.bestSec && t <= S.bestSec[i]) ? "var(--purple)"
      : (t <= c.secBest[i]) ? "var(--green)" : "var(--yellow)";
  }
  $("#h-last").textContent = c.best ? `Best ${fmtTime(c.best)}` : c.last ? `Last ${fmtTime(c.last)}` : "No time set";
  const cond = $("#h-cond");
  if(S.wet > 0.12){
    cond.hidden = false;
    cond.textContent = (S.wet > 0.65 ? "Heavy rain" : S.wet > 0.35 ? "Rain" : "Light rain") +
      (c.tyre.key === "wet" ? "" : " · slicks");
    cond.style.color = c.tyre.key === "wet" ? "var(--cyan)" : "var(--red)";
  } else cond.hidden = true;
  const ty = c.tyre;
  const cmp = $("#h-cmp"); cmp.textContent = ty.label; cmp.style.setProperty("--tyc", ty.col);
  const wear = $("#h-wear"); wear.style.width = (c.life * 100).toFixed(0) + "%";
  wear.style.background = c.life > 0.55 ? "var(--green)" : c.life > 0.25 ? "var(--yellow)" : "var(--red)";
  const dbox = $("#h-dmg"), anyD = c.damage > 0.02 || c.broken.size > 0;
  dbox.hidden = !anyD;
  if(anyD){
    const bar = $("#h-dmgbar");
    bar.style.width = (clamp(c.damage, 0, 1) * 100).toFixed(0) + "%";
    bar.style.background = c.damage > 0.6 ? "var(--red)" : c.damage > 0.3 ? "var(--yellow)" : "var(--green)";
    dbox.classList.toggle("bad", c.broken.size > 0);
    const chips = [...c.broken].map(k => "<b>" + PARTS[k].label + "</b>").join("");
    const host = $("#h-chips");
    if(host.dataset.k !== chips){ host.dataset.k = chips; host.innerHTML = chips; }
  }
  $("#h-lim").hidden = !c.inPit;
  $("#h-status").hidden = false;
  updateStatus(c);
  $("#h-ebat").textContent = Math.round(c.batt * 100) + "%";
  $("#h-ebar").style.width = (c.batt * 100).toFixed(0) + "%";
  $("#h-energy").classList.toggle("on", c.boost > 0 && c.batt > 0.01);
  const kph = c.speed * 3.6;
  const launching = S.state === "lights";
  const revN = launching ? c.revs : clamp((rpmOfCar(c) - 4200) / 9200, 0, 1);
  const bar = $("#h-tachbar");
  $("#h-tach").style.width = (revN * 100).toFixed(1) + "%";
  bar.classList.toggle("good", launching && c.revs >= LAUNCH_LO && c.revs <= LAUNCH_HI);
  bar.classList.toggle("hot", launching ? c.revs > LAUNCH_HI : revN > 0.9);
  $("#h-spd").textContent = Math.round(kph);
  $("#h-gear").textContent = c.speed < 0.5 ? "N" : clamp(Math.ceil(kph / 42), 1, 8);

  const arr = S.cars.filter(x => !x.dnf).sort((a, b) => a.pos - b.pos);
  let start = clamp(c.pos - 3, 0, Math.max(0, arr.length - 6));
  const rows = $("#h-board").children;
  for(let i = 0; i < 6; i++){
    const o = arr[start + i], r = rows[i];
    if(!o){ r.style.display = "none"; continue; }
    r.style.display = "";
    r.classList.toggle("me", o === c);
    r.style.setProperty("--c", o.team.body);
    r.children[0].textContent = o.pos;
    r.children[1].textContent = o.drv.abbr;
    r.children[2].textContent = o === arr[0] ? "LEADER" : fmtGap(o.gapAhead);
  }
}

/* ---------- setup screen ---------- */
function seg(name){
  const host = document.getElementById("opt-" + name); host.innerHTML = "";
  const key = name === "laps" ? "lapsIdx" : name;
  OPTS[name].forEach(([label, val]) => {
    const b = el("button", CFG[key] === val ? "on" : "", label);
    b.onclick = () => { CFG[key] = val; store("cfg", CFG); seg(name); };
    host.appendChild(b);
  });
}
function buildSetup(mode){
  CFG.mode = mode;
  $("#setup-mode").textContent = mode === "champ" ? "Championship weekend" : mode === "tt" ? "Time trial" : "Quick race";
  $("#field-track").hidden = mode === "champ";
  $("#field-grid").hidden = mode !== "quick";
  $("#go-race").textContent = mode === "champ" ? "Start qualifying" : mode === "tt" ? "Go out on track" : "Head out";

  const tw = $("#teams"); tw.innerHTML = "";
  for(const t of TEAMS){
    const b = el("button", "team" + (t.id === CFG.teamId ? " sel" : ""),
      `<span><span class="tn">${t.short}</span><span class="td">${t.drivers.map(d => d.abbr).join(" · ")}</span></span>`);
    b.style.setProperty("--tc", t.body);
    b.onclick = () => { CFG.teamId = t.id; CFG.drvIdx = 0; store("cfg", CFG); buildSetup(mode); };
    tw.appendChild(b);
  }
  const team = TEAMS.find(t => t.id === CFG.teamId);
  const dw = $("#drivers"); dw.innerHTML = "";
  team.drivers.forEach((d, i) => {
    const b = el("button", "drv" + (i === CFG.drvIdx ? " sel" : ""), `<b>${d.n}</b><span>${d.last}</span>`);
    b.onclick = () => { CFG.drvIdx = i; store("cfg", CFG); buildSetup(mode); };
    dw.appendChild(b);
  });
  const tr = $("#tracks"); tr.innerHTML = "";
  for(const t of TRACKS){
    const b = el("button", "trk" + (t.id === CFG.trackId ? " sel" : ""),
      `<div class="tk-n">${t.name}</div><div class="tk-l">${t.loc}</div>
       <div class="tk-b">${t.night ? "Night" : "Day"} · ${t.barrier === "wall" ? "Street" : "Permanent"}</div>`);
    b.style.setProperty("--tc", t.pal.accent);
    const sw = el("div", "tk-p");
    sw.style.background = `linear-gradient(135deg, ${t.pal.skyA}, ${t.pal.accent} 60%, ${t.pal.ground})`;
    b.appendChild(sw);
    b.onclick = () => { CFG.trackId = t.id; store("cfg", CFG); buildSetup(mode); };
    tr.appendChild(b);
  }
  ["laps", "diff", "tyre", "weather", "line", "damage", "grid", "fx", "detail"].forEach(seg);
  show("screen-setup");
}

/* ---------- results ---------- */
function showResults(res){
  if(S.mode === "qualy"){
    res.sort((a, b) => (a.best == null) - (b.best == null) || (a.best - b.best));
    res.forEach((r, i) => r.pos = i + 1);
  }
  const winner = res[0];
  $("#res-title").innerHTML = S.mode === "qualy" ? `Qualifying <i>result</i>` : S.mode === "tt" ? `Time <i>trial</i>` : `Race <i>result</i>`;
  $("#res-sub").textContent = `${S.track.name} · ${S.track.loc}${S.mode === "race" ? " · " + S.laps + " laps" : ""}`;
  const t = $("#res-tbl");
  t.innerHTML = `<thead><tr><th class="r">Pos</th><th>Driver</th><th>Team</th>
    <th class="r">${S.mode === "qualy" ? "Best lap" : "Gap"}</th><th class="r">Best lap</th><th class="r">Stops</th><th>Tyre</th></tr></thead>`;
  const body = el("tbody");
  for(const r of res){
    const c = r.car, me = c === S.player;
    const gapCell = r.dnf ? "DNF" : S.mode === "qualy" ? fmtTime(r.best)
      : r.dq ? "DSQ" : r.pos === 1 ? (S.mode === "race" ? fmtTime(c.finishTime) : fmtTime(r.best)) : fmtGap(r.gap);
    const row = el("tr", me ? "me" : "");
    row.innerHTML = `<td class="r pos">${r.pos}</td>
      <td class="nm"><span class="bar" style="background:${c.team.body}"></span>${c.drv.abbr} ${c.drv.last}</td>
      <td class="tm">${c.team.short}</td>
      <td class="r num" style="color:${r.dnf ? "var(--red)" : "inherit"}">${gapCell}</td>
      <td class="r num" style="color:${S.fastestBy === c ? "var(--purple)" : "inherit"}">${fmtTime(r.best)}</td>
      <td class="r num">${S.mode === "race" ? r.stops : "—"}</td>
      <td class="tm" style="color:${r.dnf ? "var(--dim)" : r.tyre.col}">${r.dnf ? (c.retiredBy || "Retired") : r.tyre.name}</td>`;
    body.appendChild(row);
  }
  t.appendChild(body);

  const acts = $("#res-actions"); acts.innerHTML = "";
  const add = (label, cls, fn) => { const b = el("button", "btn " + cls, label); b.onclick = fn; acts.appendChild(b); };
  if(S.mode === "qualy" && S.champ){
    add("Go to the race", "primary", () => {
      const grid = res.map(r => r.car.drv.abbr);
      startSession("race", { grid });
    });
  } else if(S.champ){
    const ch = store("champ");
    if(ch && ch.round < TRACKS.length) add(`Next round · ${TRACKS[ch.round].name}`, "primary", () => startChampWeekend());
    else add("Season complete — standings", "primary", () => showStandings());
    add("Standings", "", () => showStandings());
  } else {
    add("Race again", "primary", () => startSession(S.mode === "tt" ? "tt" : S.mode, null));
    add("Change setup", "", () => buildSetup(CFG.mode));
  }
  add("Paddock", "ghost", () => { setS(null); show("screen-title"); });
  show("screen-results");
}

/* ---------- championship ---------- */
function champState(){
  let c = store("champ");
  if(!c || !c.pts) c = { round:0, pts:{}, cons:{}, done:[] };
  return c;
}
function startChampWeekend(){
  const ch = champState();
  if(ch.round >= TRACKS.length){ showStandings(); return; }
  CFG.trackId = TRACKS[ch.round].id; store("cfg", CFG);
  startSession("qualy", {});
  S.champ = true;
}
function applyChampionship(res){
  const ch = champState();
  let fl = null, flBest = 1e18;
    res.forEach(r => { if(!r.dnf && r.best != null && r.best < flBest && r.pos <= 10){ flBest = r.best; fl = r; } });
  res.forEach((r, i) => {
    let p = POINTS[i] || 0;
    if(r.dq || r.dnf) p = 0;
    if(fl && r === fl) p += 1;
    ch.pts[r.car.drv.abbr] = (ch.pts[r.car.drv.abbr] || 0) + p;
    ch.cons[r.car.team.id] = (ch.cons[r.car.team.id] || 0) + p;
  });
  ch.done.push({ track:S.track.id, winner:res[0].car.drv.abbr, you:S.player.pos });
  ch.round++;
  store("champ", ch);
}
function saveRecord(trackId, t, c){
  const recs = store("recs") || {};
  if(!recs[trackId] || t < recs[trackId].t){
    recs[trackId] = { t, abbr:c.drv.abbr, team:c.team.id, tyre:c.tyre.key };
    store("recs", recs);
  }
}
function showStandings(){
  const ch = champState(), recs = store("recs") || {};
  $("#st-sub").textContent = ch.round >= TRACKS.length ? "Season complete"
    : `Round ${ch.round + 1} of ${TRACKS.length} · next up ${TRACKS[Math.min(ch.round, TRACKS.length - 1)].name}`;
  const all = [];
  for(const t of TEAMS) for(const d of t.drivers) all.push({ t, d, p:ch.pts[d.abbr] || 0 });
  all.sort((a, b) => b.p - a.p);
  const dt = $("#st-drv");
  dt.innerHTML = `<thead><tr><th class="r">Pos</th><th>Driver</th><th>Team</th><th class="r">Pts</th></tr></thead>`;
  const db = el("tbody");
  all.forEach((r, i) => {
    const mine = r.t.id === CFG.teamId && r.d === TEAMS.find(t => t.id === CFG.teamId).drivers[CFG.drvIdx];
    db.innerHTML += `<tr class="${mine ? "me" : ""}"><td class="r pos">${i + 1}</td>
      <td class="nm"><span class="bar" style="background:${r.t.body}"></span>${r.d.abbr} ${r.d.last}</td>
      <td class="tm">${r.t.short}</td><td class="r num">${r.p}</td></tr>`;
  });
  dt.appendChild(db);
  const cons = TEAMS.map(t => ({ t, p:ch.cons[t.id] || 0 })).sort((a, b) => b.p - a.p);
  const ct = $("#st-con");
  ct.innerHTML = `<thead><tr><th class="r">Pos</th><th>Constructor</th><th class="r">Pts</th></tr></thead>`;
  const cb = el("tbody");
  cons.forEach((r, i) => { cb.innerHTML += `<tr class="${r.t.id === CFG.teamId ? "me" : ""}"><td class="r pos">${i + 1}</td>
    <td class="nm"><span class="bar" style="background:${r.t.body}"></span>${r.t.short}</td><td class="r num">${r.p}</td></tr>`; });
  ct.appendChild(cb);
  const rt = $("#st-rec");
  rt.innerHTML = `<thead><tr><th>Circuit</th><th class="r">Lap record</th><th>Set by</th></tr></thead>`;
  const rb = el("tbody");
  for(const t of TRACKS){
    const r = recs[t.id];
    rb.innerHTML += `<tr><td class="nm">${t.name}</td><td class="r num">${r ? fmtTime(r.t) : "—"}</td>
      <td class="tm">${r ? r.abbr : "not set"}</td></tr>`;
  }
  rt.appendChild(rb);
  show("screen-standings");
}


/* ---------- the car viewer: open the game with #carview ----------------
   One car on a plain grey floor under a neutral light, for checking it against
   drawings: top, side, front, rear and three-quarter views, any team, any
   compound, and every state the car can show. */
const CARVIEW = {
  on:false,
  open(){
    if(this.on || !G3.ok) return;
    this.on = true; setS(null); show(null);
    const sc = this.scene = new THREE.Scene();
    sc.background = new THREE.Color(0xD9DCDF);
    sc.add(new THREE.HemisphereLight(0xFFFFFF, 0x9A9EA4, 0.55));
    sc.add(new THREE.AmbientLight(0xFFFFFF, 0.15));
    const sun = new THREE.DirectionalLight(0xFFFFFF, 1.1); sun.position.set(6, 12, 8); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left:-5, right:5, top:5, bottom:-5, near:1, far:40 });
    sun.shadow.camera.updateProjectionMatrix(); sun.shadow.bias = -0.0004; sc.add(sun);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color:0xC9CCD0, roughness:0.95 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; sc.add(floor);
    // a 1 m grid, to read sizes off
    const grid = new THREE.GridHelper(12, 12, 0x8A9098, 0xAEB3B9); grid.position.y = 0.002; sc.add(grid);
    this.persp = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
    this.ortho = new THREE.OrthographicCamera(-4, 4, 3, -3, 0.1, 200);
    this.state = { team:0, tyre:"soft", steer:0, boost:false, brake:false, pit:0, spin:0, damage:new Set(), view:"q34", az:0.8, el:0.35, dist:9 };
    this.ui(); this.rebuild(); this.setView("q34");
    const tick = () => { if(!this.on) return; requestAnimationFrame(tick); this.render(); };
    requestAnimationFrame(tick);
  },
  close(){ this.on = false; if(this.panel) this.panel.remove(); this.panel = null; show("screen-title"); },
  fakeCar(){
    const st = this.state, t = TEAMS[st.team];
    const c = { team:t, drv:t.drivers[0], idx:0, ai:false, broken:new Set(st.damage), tyre:TYRES[st.tyre], steer:st.steer,
                boost:st.boost ? 1 : 0, batt:1, brk:st.brake ? 1 : 0, x:0, y:0, z:0, h:0, vx:st.spin, vy:0,
                stopT:st.pit > 0 ? (1 - st.pit) * 3 + 0.001 : 0, stopTotal:3, pitT:0, pitStopTime:0 };
    return c;
  },
  rebuild(){
    if(this.car){ this.scene.remove(this.car); }
    G3.mats.clear();
    this.c = this.fakeCar();
    this.car = G3.car(this.c);
    this.scene.add(this.car);
    this.clock = 0;
  },
  setView(v){
    const st = this.state; st.view = v;
    const dirs = { top:[0, 1, 0.0001], side:[0, 0, 1], front:[1, 0, 0], rear:[-1, 0, 0] };
    if(v === "q34"){ this.cam = this.persp; return; }
    this.cam = this.ortho;
    const d = dirs[v], k = 20;
    this.ortho.position.set(d[0] * k, 0.5 + d[1] * k, d[2] * k);
    if(v === "top") this.ortho.up.set(0, 0, -1); else this.ortho.up.set(0, 1, 0);
    this.ortho.lookAt(0, 0.45, 0);
  },
  render(){
    const cv = G3.cv, w = cv.clientWidth || 800, h = cv.clientHeight || 600, asp = w / h, st = this.state;
    const c = this.c; c.steer = st.steer; c.boost = st.boost ? 1 : 0; c.brk = st.brake ? 1 : 0; c.vx = st.spin;
    c.stopT = st.pit > 0 ? (1 - st.pit) * 3 + 0.001 : 0;
    this.clock += 1 / 60;
    G3.carAnim(this.car, c, { clock:this.clock, wet:0, track:null }, 1 / 60);
    this.car.position.y = (this.car.userData.lift || 0);
    if(this.cam === this.persp){
      this.persp.aspect = asp; this.persp.updateProjectionMatrix();
      this.persp.position.set(Math.cos(st.az) * Math.cos(st.el) * st.dist, 0.4 + Math.sin(st.el) * st.dist, Math.sin(st.az) * Math.cos(st.el) * st.dist);
      this.persp.lookAt(0, 0.4, 0);
    } else {
      const hh = st.view === "front" || st.view === "rear" ? 1.3 : 1.9; this.ortho.left = -hh * asp; this.ortho.right = hh * asp; this.ortho.top = hh; this.ortho.bottom = -hh;
      this.ortho.updateProjectionMatrix();
    }
    const grade = { exposure:1.0, strength:0.25, radius:0.4, threshold:1.3, knee:0.3 };
    if(PP.ready && CFG.fx !== 0) PP.render(this.scene, this.cam, grade);
    else { G3.rend.setRenderTarget(null); G3.rend.render(this.scene, this.cam); }
  },
  ui(){
    const P = this.panel = document.createElement("div");
    P.style.cssText = "position:fixed;left:12px;top:12px;z-index:99;background:rgba(14,16,20,.86);color:#E8EDF3;padding:10px 12px;" +
      "font:12px/1.5 'Roboto Mono',monospace;border-radius:4px;max-width:300px;display:flex;flex-direction:column;gap:6px";
    const st = this.state, row = () => { const d = document.createElement("div"); d.style.cssText = "display:flex;flex-wrap:wrap;gap:4px;align-items:center"; P.appendChild(d); return d; };
    const btn = (r, label, fn) => { const b = document.createElement("button"); b.textContent = label;
      b.style.cssText = "font:inherit;padding:2px 7px;background:#2A3038;color:inherit;border:1px solid #3A424C;border-radius:3px;cursor:pointer";
      b.onclick = fn; r.appendChild(b); return b; };
    const title = document.createElement("b"); title.textContent = "CAR VIEWER"; P.appendChild(title);
    const r1 = row(); for(const [k, l] of [["top", "Top"], ["side", "Side"], ["front", "Front"], ["rear", "Rear"], ["q34", "3/4"]]) btn(r1, l, () => this.setView(k));
    const r2 = row(); const sel = document.createElement("select"); sel.style.cssText = "font:inherit;background:#2A3038;color:inherit";
    TEAMS.forEach((t, i) => { const o = document.createElement("option"); o.value = i; o.textContent = t.short; sel.appendChild(o); });
    sel.onchange = () => { st.team = +sel.value; this.rebuild(); }; r2.appendChild(sel);
    const ty = document.createElement("select"); ty.style.cssText = sel.style.cssText;
    for(const k of Object.keys(TYRES)){ const o = document.createElement("option"); o.value = k; o.textContent = TYRES[k].name; ty.appendChild(o); }
    ty.onchange = () => { st.tyre = ty.value; this.c.tyre = TYRES[st.tyre]; }; r2.appendChild(ty);
    const r3 = row();
    btn(r3, "Steer L", () => { st.steer = -1; }); btn(r3, "Straight", () => { st.steer = 0; }); btn(r3, "Steer R", () => { st.steer = 1; });
    const r4 = row();
    const tog = (r, label, get, set) => { const b = btn(r, label, () => { set(!get()); b.style.background = get() ? "#FF8A1F" : "#2A3038"; }); return b; };
    tog(r4, "Boost", () => st.boost, v => st.boost = v); tog(r4, "Brake", () => st.brake, v => st.brake = v);
    tog(r4, "Spin", () => st.spin > 0, v => st.spin = v ? 12 : 0);
    const r5 = row(); r5.appendChild(document.createTextNode("Damage:"));
    for(const k of ["wing", "rear", "floor", "susp", "punct", "brakes"])
      tog(r5, k, () => st.damage.has(k), v => { v ? st.damage.add(k) : st.damage.delete(k); this.c.broken = new Set(st.damage); });
    const r6 = row(); r6.appendChild(document.createTextNode("Pit stop:"));
    const pit = document.createElement("input"); pit.type = "range"; pit.min = 0; pit.max = 100; pit.value = 0; pit.style.width = "140px";
    pit.oninput = () => { st.pit = pit.value / 100; }; r6.appendChild(pit);
    const r7 = row(); btn(r7, "Close", () => { history.replaceState(null, "", location.pathname); this.close(); });
    // drag to turn the three-quarter view
    let drag = null;
    G3.cv.addEventListener("pointerdown", e => { drag = [e.clientX, e.clientY]; });
    addEventListener("pointerup", () => { drag = null; });
    addEventListener("pointermove", e => { if(!drag || !this.on || this.cam !== this.persp) return;
      st.az += (e.clientX - drag[0]) * 0.008; st.el = clamp(st.el + (e.clientY - drag[1]) * 0.006, 0.02, 1.5); drag = [e.clientX, e.clientY]; });
    G3.cv.addEventListener("wheel", e => { if(this.on) st.dist = clamp(st.dist * Math.exp(e.deltaY * 0.001), 3, 30); }, { passive:true });
    document.body.appendChild(P);
  },
};


function setPaused(v){ paused = v; }
function setS(v){ S = v; }
export { AUDIO, CARVIEW, CFG, G3, S, bindTouch, buildSetup, champState, closePitMenu, endSession, loop, setPaused, setS, show, showStandings, showToast, startChampWeekend, startSession, togglePause };
