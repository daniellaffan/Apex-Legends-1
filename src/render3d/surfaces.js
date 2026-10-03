import * as THREE from 'three';
import { TAU } from '../config/util.js';

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


export { PTEX };
