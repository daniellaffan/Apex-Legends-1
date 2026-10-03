import * as THREE from 'three';
import { SGEO } from '../../tracks/survey/silverstone.js';
import { TAU, clamp, shade } from '../../config/util.js';
import { bankZ } from '../../tracks/shared.js';
import { hashStr } from '../../render2d/textures.js';
import { PTEX } from '../surfaces.js';
import { ADS } from '../hoardings.js';
import { G3 } from '../g3.js';
import { LB } from './vegas.js';

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


export { SILVER };
