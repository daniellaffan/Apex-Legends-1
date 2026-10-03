/* ---------- Suzuka: the plan --------------------------------------------
   Everything about the Suzuka world that is numbers rather than meshes: the
   ground's height and colour, how far every point is from the circuit, where
   the forest is thick and where it opens out, and where each tree, bush, hedge,
   tea row and paddy goes. No three.js and no DOM in here, so the whole plan,
   and the clearance audit at the bottom, runs in Node as well as in the game.

   Game space: x, y along the ground, z up. The circuit is the track's own
   centreline (T.x, T.y, T.z); nothing here moves it. */

/* ---- small tools ---- */
function rng(seed){ let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
function hash2(ix, iy, s){
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296;
}
function vnoise(x, y, s){
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, s), b = hash2(ix + 1, iy, s), c = hash2(ix, iy + 1, s), d = hash2(ix + 1, iy + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
// a few octaves of it: about 0.15..0.85, centred on 0.5
function fbm(x, y, s, oct){ let a = 0.5, f = 1, sum = 0, nrm = 0;
  for(let o = 0; o < (oct || 3); o++){ sum += a * vnoise(x * f, y * f, s + o * 17); nrm += a; a *= 0.5; f *= 2.03; } return sum / nrm; }
const hex = c => [parseInt(c.slice(1, 3), 16) / 255, parseInt(c.slice(3, 5), 16) / 255, parseInt(c.slice(5, 7), 16) / 255];
const mixC = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

/* the palette of the ground, sRGB */
const GC = {
  open:hex("#79A24C"), openDry:hex("#8DAA58"), lush:hex("#5F8E3C"), verge:hex("#86B058"),
  floor:hex("#45622F"), moss:hex("#56743A"), canopy:hex("#33502C"), canopyHi:hex("#476C35"),
  earth:hex("#8C7550"), dirt:hex("#9E8A62"), gravel:hex("#A9A396"), cut:hex("#9A8C74"),
  paddock:hex("#8C9095"), path:hex("#C9BCA0"), paddyBund:hex("#7E9A4C"), teaSoil:hex("#6A6A3E"),
};

/* The clearances. Measured from the barrier line (half width + run-off + 2.6 m,
   which is where the armco stands), on whichever side of whichever piece of the
   circuit is nearest. */
const BAR = 2.6;
const CLEAR = { shrub:3.2, tree:4.0 };

function planSuzuka(T, opts){
  opts = opts || {};
  const lite = opts.detail === 0;
  const n = T.n, half = T.half, R = rng(9137);
  const t0 = Date.now(), tm = {};
  const P = { stats:{}, tm };
  const uOf = i => i / n;
  // is lap fraction u inside the window a..b (which may wrap through the line)
  const inU = (u, a, b) => a <= b ? (u >= a && u <= b) : (u >= a || u <= b);

  /* ---- segments, hashed so "what is near here" is cheap ---- */
  const CELL = 40, bb = T.bounds, PAD = 760, STEP = opts.step || 8;
  const HX0 = bb.minX - PAD - CELL, HY0 = bb.minY - PAD - CELL;
  const hw = Math.ceil((bb.w + 2 * PAD + 2 * CELL) / CELL) + 1, hh = Math.ceil((bb.h + 2 * PAD + 2 * CELL) / CELL) + 1;
  const cells = Array.from({ length:hw * hh }, () => []);
  for(let i = 0; i < n; i++){
    const j = (i + 1) % n;
    const c0 = Math.floor((Math.min(T.x[i], T.x[j]) - HX0) / CELL), c1 = Math.floor((Math.max(T.x[i], T.x[j]) - HX0) / CELL);
    const r0 = Math.floor((Math.min(T.y[i], T.y[j]) - HY0) / CELL), r1 = Math.floor((Math.max(T.y[i], T.y[j]) - HY0) / CELL);
    for(let r = r0; r <= r1; r++) for(let c = c0; c <= c1; c++) cells[r * hw + c].push(i);
  }
  const roOf = (i, side) => side >= 0 ? T.roR[i] : T.roL[i];
  /* The circuit as seen from one point: the nearest piece of it (distance, which
     side, how far past its barrier, the road height there), and the lowest road
     whose verge this point is on. Exact within 80 m; beyond that it says so. */
  const Q = { d:0, i:0, side:1, bar:0, z:0, zBand:0, band:false, far:false };
  const cI = new Int32Array(4096), cD = new Float32Array(4096), cE = new Float32Array(4096), cZ = new Float32Array(4096);
  function query(x, y){
    const c = Math.floor((x - HX0) / CELL), r = Math.floor((y - HY0) / CELL);
    let bd = Infinity, bi = -1, bs = 1, bz = 0, bbar = Infinity, m = 0, atBridge = false;
    for(let rr = r - 2; rr <= r + 2; rr++){ if(rr < 0 || rr >= hh) continue;
      for(let cc = c - 2; cc <= c + 2; cc++){ if(cc < 0 || cc >= hw) continue;
        for(const i of cells[rr * hw + cc]){
          const j = (i + 1) % n, ax = T.x[i], ay = T.y[i], dx = T.x[j] - ax, dy = T.y[j] - ay;
          const L2 = dx * dx + dy * dy || 1, t = clamp(((x - ax) * dx + (y - ay) * dy) / L2, 0, 1);
          const px = ax + dx * t, py = ay + dy * t, d = Math.hypot(x - px, y - py);
          const off = (x - ax) * T.nx[i] + (y - ay) * T.ny[i], side = off >= 0 ? 1 : -1;
          const edge = half + mix(roOf(i, side), roOf(j, side), t);
          const z = T.z[i] + (T.z[j] - T.z[i]) * t;
          const bar = d - edge - BAR;
          if(bar < bbar) bbar = bar;
          if(d < bd){ bd = d; bi = i; bs = side; bz = z; }
          if(T.bridge[i] && d < edge + 30) atBridge = true;
          if(d < edge + 19 && m < 4096){ cI[m] = i; cD[m] = d; cE[m] = edge; cZ[m] = z; m++; }
        }
      } }
    Q.far = bi < 0;
    if(Q.far){ Q.d = 999; Q.bar = 999; Q.band = false; return Q; }
    /* Where two different parts of the lap are both close (never the same stretch of
       road further along a bend), the lower one wins, out to more than one grid diagonal
       past its verge (6 m past the run-off): no ground triangle can then climb onto it on
       the way up to the other road, which gets a retaining wall or a span instead (below).
       At Suzuka that is the crossing, and the 200R running beside the West straight. */
    let zb = bz;
    for(let k = 0; k < m; k++){
      const di = Math.abs(((cI[k] - bi) % n + n + (n >> 1)) % n - (n >> 1));
      if(di < 14) continue;
      if(cZ[k] < zb) zb = cZ[k];
    }
    Q.d = bd; Q.i = bi; Q.side = bs; Q.bar = bbar; Q.z = bz; Q.band = true; Q.zBand = zb;
    return Q;
  }
  P.query = query;
  // past the barrier, exact; for an audit
  P.clearance = (x, y) => { const q = query(x, y); return q.far ? 999 : q.bar; };

  /* ---- the terrain grid ---- */
  const X0 = bb.minX - PAD, Y0 = bb.minY - PAD;
  const NX = Math.ceil((bb.w + 2 * PAD) / STEP) + 1, NY = Math.ceil((bb.h + 2 * PAD) / STEP) + 1, NV = NX * NY;
  const H = new Float32Array(NV), DB = new Float32Array(NV), DT = new Float32Array(NV), ZN = new Float32Array(NV);
  const NI = new Int32Array(NV), SD = new Int8Array(NV);
  // the land's own lie, from far off: every eighth node, weighted by nearness
  const sub = []; for(let i = 0; i < n; i += 6) sub.push(i);
  for(let r = 0; r < NY; r++) for(let c = 0; c < NX; c++){
    const k = r * NX + c, x = X0 + c * STEP, y = Y0 + r * STEP;
    query(x, y);
    let zw = 0, ws = 0, dmin = Infinity, imin = 0;
    for(const i of sub){ const d2 = (x - T.x[i]) ** 2 + (y - T.y[i]) ** 2, w = 1 / (d2 + 3600); zw += w * T.z[i]; ws += w; if(d2 < dmin){ dmin = d2; imin = i; } }
    zw /= ws;
    let d, bar, zn, ni, sd;
    if(Q.far){
      d = Math.sqrt(dmin); ni = imin; sd = ((x - T.x[imin]) * T.nx[imin] + (y - T.y[imin]) * T.ny[imin]) >= 0 ? 1 : -1;
      bar = d - half - roOf(imin, sd) - BAR; zn = T.z[imin];
    } else { d = Q.d; bar = Q.bar; zn = Q.band ? Q.zBand : Q.z; ni = Q.i; sd = Q.side; }
    DT[k] = d; DB[k] = bar; ZN[k] = zn; NI[k] = ni; SD[k] = sd;
    // the verge is the road's own height (a little under it, so the ribbons sit on
    // top); past it the land eases into the lie of the country and its hills
    const dband = bar - 3.4;                                     // the grass strip ends 6 m past the run-off
    const t = sstep(0, 150, dband);
    let z = dband <= 0 ? zn - 0.6 : mix(zn - 0.6, zw, t);
    const hill = (fbm(x / 430, y / 430, 11, 3) - 0.5) * 46 + (fbm(x / 140, y / 140, 23, 2) - 0.5) * 9;
    z += hill * sstep(14, 280, dband) + 16 * sstep(40, 460, dband);
    H[k] = z;
  }
  tm.grid = Date.now() - t0;
  // soften it: rolling, not lumpy. The verge itself is left exact.
  for(let pass = 0; pass < 3; pass++){
    const src = H.slice();
    for(let r = 1; r < NY - 1; r++) for(let c = 1; c < NX - 1; c++){
      const k = r * NX + c; if(DB[k] < 5) continue;
      const w = sstep(5, 20, DB[k]);
      const av = (src[k] * 4 + src[k - 1] + src[k + 1] + src[k - NX] + src[k + NX] + (src[k - NX - 1] + src[k - NX + 1] + src[k + NX - 1] + src[k + NX + 1]) * 0.5) / 10;
      H[k] = mix(src[k], av, w);
    }
  }
  const G = { X0, Y0, STEP, NX, NY, H, DB, DT, ZN, NI, SD };
  P.grid = G;
  const at = (A, x, y) => {
    const fx = clamp((x - X0) / STEP, 0, NX - 1.001), fy = clamp((y - Y0) / STEP, 0, NY - 1.001);
    const c = Math.floor(fx), r = Math.floor(fy), u = fx - c, v = fy - r, k = r * NX + c;
    return (A[k] * (1 - u) + A[k + 1] * u) * (1 - v) + (A[k + NX] * (1 - u) + A[k + NX + 1] * u) * v;
  };
  P.at = at;
  const height = (x, y) => at(H, x, y);
  P.height = height;
  const slopeAt = (x, y) => { const e = STEP; return Math.hypot(height(x + e, y) - height(x - e, y), height(x, y + e) - height(x, y - e)) / (2 * e); };
  const gradAt = (x, y) => { const e = STEP; return [(height(x + e, y) - height(x - e, y)) / (2 * e), (height(x, y + e) - height(x, y - e)) / (2 * e)]; };

  /* ---- what is already standing: the props, and what the world adds ---- */
  const excl = [];                    // circles: x, y, r
  const rects = [];                   // oriented: cx, cy, ux, uy, a0, a1, b0, b1 (b away from the track)
  const addRect = (cx, cy, ang, a0, a1, b0, b1, away) => {
    const ux = Math.cos(ang), uy = Math.sin(ang); let vx = -uy, vy = ux;
    if(away && (vx * away[0] + vy * away[1]) < 0){ vx = -vx; vy = -vy; }
    rects.push({ cx, cy, ux, uy, vx, vy, a0, a1, b0, b1 });
  };
  const stands = [];
  for(const p of T.props){
    if(p.only2d) continue;
    const i = T.near(p.x, p.y), away = [p.x - T.x[i], p.y - T.y[i]];
    if(p.t === "grandstand"){ addRect(p.x, p.y, p.rot, -(p.wid / 2 + 6), p.wid / 2 + 6, -16, 20, away); stands.push({ p, i, away }); }
    else if(p.t === "arch"){ const w2 = half + T.runoff + 3; for(const s of [-1, 1]) excl.push({ x:p.x + T.nx[i] * w2 * s, y:p.y + T.ny[i] * w2 * s, r:4 }); }
    else if(p.t === "lm" && p.k === "pitbuilding") excl.push({ x:p.x, y:p.y, r:48 });
    else if(p.t === "hotel") excl.push({ x:p.x, y:p.y, r:30 });
    else if(p.t === "garage") excl.push({ x:p.x, y:p.y, r:15 });
    else excl.push({ x:p.x, y:p.y, r:({ marshal:5, pylon:3.2, billboard:8.5, ferris:40, lm:26 })[p.t] || 6 });
  }
  const blocked = (x, y, r) => {
    for(const e of excl){ const dx = x - e.x, dy = y - e.y, rr = e.r + r; if(dx * dx + dy * dy < rr * rr) return true; }
    for(const q of rects){ const dx = x - q.cx, dy = y - q.cy, a = dx * q.ux + dy * q.uy, b = dx * q.vx + dy * q.vy;
      if(a > q.a0 - r && a < q.a1 + r && b > q.b0 - r && b < q.b1 + r) return true; }
    return false;
  };
  P.blocked = blocked; P.excl = excl; P.rects = rects;

  /* ---- the zones: where things are on the lap, as the circuit's definition names them ---- */
  const ps = T.pitSide;
  const Z = Object.assign({ main:[0.95, 0.08], park:[0.93, 0.05], tight:[0.6, 0.87], infield:[0.1, 0.26],
    back:[0.68, 0.8], spoon:[0.6, 0.68], r130:[0.8, 0.87], towers:[], wheel:null }, T.def.zones || {});
  // the main straight, line to Turn 1 and the run up to it
  const MAIN = Z.main;
  // the paddock: behind the pit garages, all along the pit lane
  const inPaddock = (i, side, d) => side === ps && T.pitU(i) >= 0 && d < half + T.pitW + 95;
  // the park: across the main straight from the pits, behind the grandstands
  const inParkZone = (i, side, bar) => side === -ps && inU(uOf(i), Z.park[0], Z.park[1]) && bar > 38 && bar < 250;
  // the back of the circuit, where it runs tight between the trees
  const tight = i => inU(uOf(i), Z.tight[0], Z.tight[1]);
  P.zones = { MAIN, inPaddock, inParkZone, tight };

  /* ---- the farmland: tea on the slopes, paddies in the bottoms ---- */
  const farmAt = (x, y, bar) => bar > 170 && fbm(x / 520, y / 520, 41, 2) > 0.58;

  /* ---- the forest: how thick it wants to be at a point ---- */
  // groves and clearings at the scale of a hundred metres or two, tree lines along the edges
  const forestAt = (x, y, i, side, bar) => {
    if(bar < 4) return 0;
    const tgt = tight(i);
    const g = fbm(x / 210, y / 210, 5, 3);
    let f = sstep(tgt ? 0.30 : 0.36, tgt ? 0.52 : 0.6, g);
    // dense belts behind the barriers, thinning towards the track
    f *= tgt ? sstep(4, 16, bar) * 1.15 : sstep(8, 34, bar);
    // further off, fewer trees: the camera only ever sees a few hundred metres either side
    f *= bar < 230 ? 1 : bar < 430 ? 0.62 : bar < 600 ? 0.3 : 0;
    return clamp(f, 0, 1);
  };
  P.forestAt = forestAt;

  /* ---- lists ---- */
  const L = { sugi:[], hinoki:[], broad:[], sakura:[], momiji:[], bamboo:[], shrub:[], azalea:[], flowers:[], hedge:[], tea:[] };
  P.lists = L;
  const groves = [];                 // the sakura, for the petals
  // one plant: where, how big, which way it leans and how it is tinted
  const put = (kind, x, y, h, w, tint, r) => {
    const z = height(x, y);
    // a slight lean downhill on a slope, as trees on a bank do
    const [gx, gy] = gradAt(x, y), sl = Math.hypot(gx, gy), lean = clamp(sl * 0.35, 0, 0.09) * (0.6 + R() * 0.6);
    const lx = sl > 1e-4 ? -gx / sl * lean : 0, ly = sl > 1e-4 ? -gy / sl * lean : 0;
    L[kind].push({ x, y, z, ry:R() * Math.PI * 2, h, w, lx, ly, tint, r });
  };
  // a tint around white, so the instance colour only nudges the species colour
  const nudge = (k, warm) => { const v = 1 + (R() - 0.5) * k, t = (R() - 0.5) * (warm || 0);
    return [clamp(v + t, 0.6, 1.3), clamp(v, 0.6, 1.3), clamp(v - t, 0.6, 1.3)]; };
  const CROWN = { sugi:0.22, hinoki:0.26, broad:0.36, sakura:0.5, momiji:0.42, bamboo:0.25, shrub:0.6, azalea:0.6 };
  // the one test every plant passes: off the circuit, the run-off, the barrier and its margin, and
  // out of every footprint; tall ones get more room
  const fits = (x, y, kind, h, extra) => {
    const r = CROWN[kind] * h, q = query(x, y);
    const need = (kind === "shrub" || kind === "azalea" ? CLEAR.shrub : CLEAR.tree) + r + (extra || 0);
    if(!q.far && q.bar < need) return false;
    if(blocked(x, y, r + 1)) return false;
    if(!q.far && inPaddock(q.i, q.side, q.d)) return false;
    return true;
  };
  P.fits = fits;

  /* ---- the park, the wheel and the sakura along the main straight ---- */
  const park = { cells:[], buildings:[], paths:[], lanterns:[], wheel:null };
  P.park = park;
  { // the park's ground: every grid point that qualifies
    let best = null;
    for(let r = 0; r < NY; r++) for(let c = 0; c < NX; c++){
      const k = r * NX + c; if(!inParkZone(NI[k], SD[k], DB[k])) continue;
      const x = X0 + c * STEP, y = Y0 + r * STEP; park.cells.push(k);
      // the wheel, if the map does not place it: as far from the track as the park allows
      const u = uOf(NI[k]), du = Math.min(Math.abs(u - Z.park[0]), Math.abs(u - Z.park[1]));
      const sc = Math.min(DB[k], 150) + du * 300;
      if(DB[k] > 70 && !blocked(x, y, 34) && (!best || sc > best.sc)) best = { x, y, sc, k };
    }
    // where the map has it, if it fits there
    if(Z.wheel){
      const i = ((Math.round(Z.wheel.u * n) % n) + n) % n, o = Z.wheel.side * Z.wheel.off;
      const x = T.x[i] + T.nx[i] * o, y = T.y[i] + T.ny[i] * o, q = query(x, y);
      if((q.far || q.bar > 30) && !blocked(x, y, 26)) best = { x, y, sc:0, k:-1 };
    }
    if(best){ park.wheel = { x:best.x, y:best.y, z:height(best.x, best.y), r:24, h:52 }; excl.push({ x:best.x, y:best.y, r:30 }); }
    // the park is flattened a little into terraces, so the buildings sit down
    for(const k of park.cells) H[k] = mix(H[k], ZN[k] + 0.8 + (H[k] - ZN[k]) * 0.35, sstep(38, 70, DB[k]));
    // buildings: a few pavilions, a hall, kiosks and a carousel, spread out
    const spots = park.cells.slice().sort(() => R() - 0.5);
    for(const k of spots){
      if(park.buildings.length >= 11) break;
      const x = X0 + (k % NX) * STEP, y = Y0 + Math.floor(k / NX) * STEP;
      const big = park.buildings.length < 3, l = big ? 26 + R() * 10 : 9 + R() * 8, w = big ? 16 + R() * 6 : 7 + R() * 5;
      const rr = Math.hypot(l, w) / 2 + 6;
      if(DB[k] < 46 + rr * 0.5 || blocked(x, y, rr)) continue;
      const ang = T.ang[NI[k]] + (R() < 0.5 ? 0 : Math.PI / 2) + (R() - 0.5) * 0.1;
      const kind = park.buildings.length === 3 ? "carousel" : big ? "hall" : "kiosk";
      park.buildings.push({ x, y, z:height(x, y), l, w, h:big ? 9 + R() * 4 : 4.5 + R() * 2, ang, kind,
        col:["#F2E6D0", "#E8D8C0", "#F4EEE4", "#E6E0D4"][Math.floor(R() * 4)], roof:["#3E4A5C", "#4A3A36", "#5A4A40", "#2E3A4A"][Math.floor(R() * 4)] });
      excl.push({ x, y, r:rr });
    }
    // the paths: from the wheel to each building, and from the grandstands into the park
    const nodes = park.buildings.map(b => [b.x, b.y]);
    if(park.wheel) nodes.unshift([park.wheel.x, park.wheel.y]);
    for(let a = 1; a < nodes.length; a++){
      // to the nearest node already joined: a tree of paths, not a star
      let bj = 0, bd = Infinity; for(let b = 0; b < a; b++){ const d = Math.hypot(nodes[a][0] - nodes[b][0], nodes[a][1] - nodes[b][1]); if(d < bd){ bd = d; bj = b; } }
      park.paths.push([nodes[bj], nodes[a]]);
    }
    for(const s of stands){
      if(!inU(uOf(s.i), Z.main[0], Z.main[1]) || !nodes.length) continue;
      const al = Math.hypot(s.away[0], s.away[1]) || 1, bx = s.p.x + s.away[0] / al * 24, by = s.p.y + s.away[1] / al * 24;
      let bj = 0, bd = Infinity; nodes.forEach((q, j) => { const d = Math.hypot(q[0] - bx, q[1] - by); if(d < bd){ bd = d; bj = j; } });
      park.paths.push([[bx, by], nodes[bj]]);
    }
    // along each path: hedges of azalea both sides, sakura in pairs, lanterns
    for(const [a, b] of park.paths){
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]); if(len < 8) continue;
      const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len, vx = -uy, vy = ux;
      for(let s = 10; s < len - 10; s += 3.2) for(const sd of [-1, 1]){
        const x = a[0] + ux * s + vx * sd * 3.4, y = a[1] + uy * s + vy * sd * 3.4;
        if(blocked(x, y, 1.2) || !fits(x, y, "azalea", 1.2)) continue;
        const z = height(x, y);
        L.hedge.push({ x, y, z, ry:-Math.atan2(uy, ux), sx:3.3, sy:0.9 + R() * 0.2, sz:1.1, tint:R() < 0.5 ? [1, 0.5, 0.72] : [1, 1, 1], flower:true });
      }
      for(let s = 14; s < len - 12; s += 13) for(const sd of [-1, 1]){
        const x = a[0] + ux * s + vx * sd * 7.5, y = a[1] + uy * s + vy * sd * 7.5, h = 6.5 + R() * 2;
        if(fits(x, y, "sakura", h)) { put("sakura", x, y, h, 1, nudge(0.12, 0.08)); groves.push({ x, y, z:height(x, y) + h * 0.7, r:6 }); }
      }
      for(let s = 6; s < len - 6; s += 8){ const x = a[0] + ux * s + vx * 2.2, y = a[1] + uy * s + vy * 2.2; if(!blocked(x, y, 0.3)) park.lanterns.push({ x, y, z:height(x, y), ang:Math.atan2(uy, ux) }); }
    }
  }

  /* ---- sakura in clusters: along the straights, behind the stands ---- */
  const cluster = (cx, cy, k, rad) => {
    let made = 0;
    for(let t = 0; t < k * 3 && made < k; t++){
      const a = R() * Math.PI * 2, d = Math.sqrt(R()) * rad, x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d, h = 6 + R() * 3.2;
      if(!fits(x, y, "sakura", h)) continue;
      put("sakura", x, y, h, 0.9 + R() * 0.3, nudge(0.14, 0.1)); made++;
    }
    if(made) groves.push({ x:cx, y:cy, z:height(cx, cy) + 6, r:rad + 4 });
    return made;
  };
  const along = (u0, u1, step, side, off0, off1, k, rad) => {
    const i0 = Math.round(u0 * n), span = ((Math.round(u1 * n) - i0) % n + n) % n;
    for(let s = 0; s <= span; s += Math.max(1, Math.round(step / T.ds))){
      const i = (i0 + s) % n;
      for(const sd of (side === 0 ? [-1, 1] : [side])){
        const o = sd * (half + roOf(i, sd) + BAR + off0 + R() * (off1 - off0));
        cluster(T.x[i] + T.nx[i] * o, T.y[i] + T.ny[i] * o, k, rad);
      }
    }
  };
  // the main straight, the side away from the pits: behind the stands and on into the park
  along(Z.main[0], Z.main[1], 52, -ps, 30, 46, 5, 12);
  // the back straight: an avenue of them, both sides
  along(Z.back[0], Z.back[1], 95, 0, 7, 16, 4, 9);
  // the spectator banks round every other grandstand
  for(const s of stands){
    if(inU(uOf(s.i), Z.main[0], Z.main[1])) continue;
    const al = Math.hypot(s.away[0], s.away[1]) || 1, ax = s.away[0] / al, ay = s.away[1] / al;
    const wid = s.p.wid || 30, tx = Math.cos(s.p.rot), ty = Math.sin(s.p.rot);
    for(const f of [-0.7, -0.2, 0.3, 0.8]) cluster(s.p.x + ax * 34 + tx * wid * 0.5 * f, s.p.y + ay * 34 + ty * wid * 0.5 * f, 4, 9);
    for(const sd of [-1, 1]) cluster(s.p.x + tx * sd * (wid / 2 + 16) + ax * 10, s.p.y + ty * sd * (wid / 2 + 16) + ay * 10, 3, 7);
  }
  P.groves = groves;
  P.stats.sakuraClusters = groves.length;

  /* ---- azalea along the fences: in front of the crowds, down the main straight and
     in patches through the back section, broken where the noise says so ---- */
  const fenceRow = (u0, u1, side) => {
    const i0 = ((Math.round(u0 * n) % n) + n) % n, span = ((Math.round(u1 * n) - i0) % n + n) % n;
    for(let s = 0; s <= span; s++){
      const i = (i0 + s) % n;
      for(const sd of (side === 0 ? [-1, 1] : [side])){
        for(let k = 0; k < 3; k++){
          const along = (k - 1) * 2.3 + (R() - 0.5), o = sd * (half + roOf(i, sd) + BAR + 4.4 + R() * 1.2);
          const x = T.x[i] + T.nx[i] * o + T.tx[i] * along, y = T.y[i] + T.ny[i] * o + T.ty[i] * along;
          if(fbm(x / 40, y / 40, 101, 2) < 0.45) continue;
          const h = 1.0 + R() * 0.5;
          if(fits(x, y, "azalea", h)) put("azalea", x, y, h, 1.1 + R() * 0.4, R() < 0.6 ? [1, 0.48, 0.7] : R() < 0.5 ? [1, 1, 1] : [1, 0.3, 0.42]);
        }
      }
    }
  };
  fenceRow(Z.main[0], Z.main[1], -ps);
  for(const s of stands){ const du = ((s.p.wid || 40) / 2 + 25) / T.length; fenceRow(uOf(s.i) - du, uOf(s.i) + du, 0); }
  fenceRow(Z.spoon[0], Z.spoon[1], 0); fenceRow(Z.r130[0], Z.r130[1], 0);
  tm.park = Date.now() - t0;

  /* ---- farmland: paddies and tea fields, just outside the forest ---- */
  const paddies = [], teaFields = [];
  P.paddies = paddies; P.tea = teaFields;
  {
    // fields only where the camera can reach (it never sees more than about 450 m off the
    // circuit), one per 48 m square at most, and a cap on how many
    const teaCap = lite ? 4000 : 8000;
    for(let r = 3; r < NY - 3; r += 6) for(let c = 3; c < NX - 3; c += 6){
      const k = r * NX + c, x = X0 + c * STEP + (R() - 0.5) * 12, y = Y0 + r * STEP + (R() - 0.5) * 12;
      if(!farmAt(x, y, DB[k]) || DB[k] > 520 || R() < 0.3) continue;
      if(blocked(x, y, 30)) continue;
      const sl = slopeAt(x, y), ang = fbm(x / 900, y / 900, 3, 1) * Math.PI;
      if(sl < 0.05){
        // a paddy: flooded in April, levelled into its own terrace
        const l = 30 + R() * 14, w = 18 + R() * 8, ux = Math.cos(ang), uy = Math.sin(ang);
        let zMin = Infinity;
        for(const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]) zMin = Math.min(zMin, height(x + ux * a * l / 2 - uy * b * w / 2, y + uy * a * l / 2 + ux * b * w / 2));
        paddies.push({ x, y, z:zMin + 0.05, l, w, ang });
        for(let rr = r - 3; rr <= r + 3; rr++) for(let cc = c - 3; cc <= c + 3; cc++){
          const kk = rr * NX + cc, px = X0 + cc * STEP - x, py = Y0 + rr * STEP - y, a = px * ux + py * uy, b = -px * uy + py * ux;
          if(Math.abs(a) < l / 2 - 1 && Math.abs(b) < w / 2 - 1) H[kk] = zMin - 0.3;
        }
      } else if(sl < 0.2 && L.tea.length < teaCap){
        // a tea field: rounded hedges in rows across the slope
        const [gx, gy] = gradAt(x, y), gl = Math.hypot(gx, gy) || 1, rx = -gy / gl, ry = gx / gl;   // along the contour
        const L0 = 34 + R() * 16, W0 = 26 + R() * 10;
        teaFields.push({ x, y, ang:Math.atan2(ry, rx), l:L0, w:W0 });
        for(let b = -W0 / 2; b < W0 / 2; b += 1.9) for(let a = -L0 / 2; a < L0 / 2; a += 5.6){
          const px = x + rx * (a + 2.8) - ry * b, py = y + ry * (a + 2.8) + rx * b;
          if(!fits(px, py, "shrub", 1)) continue;
          L.tea.push({ x:px, y:py, z:height(px, py), ry:-Math.atan2(ry, rx), sx:5.4, sy:1.0 + R() * 0.1, sz:1.25, tint:nudge(0.08) });
        }
      } else continue;
      excl.push({ x, y, r:24 });
    }
  }
  P.stats.paddies = paddies.length; P.stats.teaRows = L.tea.length;

  /* ---- water: a pond in the first sector's infield, and the stream out of it ---- */
  P.pond = null; P.stream = [];
  {
    let best = null;
    for(let r = 0; r < NY; r++) for(let c = 0; c < NX; c++){
      const k = r * NX + c, u = uOf(NI[k]);
      if(!inU(u, Z.infield[0], Z.infield[1]) || DB[k] < 45 || DB[k] > 110) continue;
      const x = X0 + c * STEP, y = Y0 + r * STEP; if(blocked(x, y, 30)) continue;
      const sc = H[k] - DB[k] * 0.02;
      if(!best || sc < best.sc) best = { x, y, sc, k };
    }
    if(best){
      const rad = clamp(DB[best.k] - 22, 14, 26);
      let zr = Infinity;
      for(let a = 0; a < 16; a++) zr = Math.min(zr, height(best.x + Math.cos(a / 16 * Math.PI * 2) * (rad + 6), best.y + Math.sin(a / 16 * Math.PI * 2) * (rad + 6)));
      const wz = zr - 0.4;
      for(let r = 0; r < NY; r++) for(let c = 0; c < NX; c++){
        const x = X0 + c * STEP, y = Y0 + r * STEP, d = Math.hypot(x - best.x, y - best.y);
        if(d < rad + 10){ const k = r * NX + c; H[k] = Math.min(H[k], mix(wz - 1.6, H[k], sstep(rad - 6, rad + 10, d))); }
      }
      P.pond = { x:best.x, y:best.y, z:wz, r:rad };
      excl.push({ x:best.x, y:best.y, r:rad + 2 });
      // the stream: downhill from the pond's lowest edge, until it reaches a verge or levels out
      let x = best.x, y = best.y, ang = 0, lo = Infinity;
      for(let a = 0; a < 16; a++){ const px = best.x + Math.cos(a / 16 * Math.PI * 2) * (rad + 8), py = best.y + Math.sin(a / 16 * Math.PI * 2) * (rad + 8), z = height(px, py); if(z < lo){ lo = z; ang = a / 16 * Math.PI * 2; } }
      x += Math.cos(ang) * (rad + 6); y += Math.sin(ang) * (rad + 6);
      const path = [[x, y, wz]];
      let zPrev = wz;
      for(let s = 0; s < 70; s++){
        const [gx, gy] = gradAt(x, y), gl = Math.hypot(gx, gy);
        const dx = gl > 1e-3 ? -gx / gl : Math.cos(ang), dy = gl > 1e-3 ? -gy / gl : Math.sin(ang);
        ang = Math.atan2(mix(Math.sin(ang), dy, 0.5), mix(Math.cos(ang), dx, 0.5));
        const nx2 = x + Math.cos(ang) * 6, ny2 = y + Math.sin(ang) * 6, q = query(nx2, ny2);
        if(!q.far && q.bar < 8) break;
        if(blocked(nx2, ny2, 3)) break;
        x = nx2; y = ny2;
        const z = Math.min(zPrev, height(x, y) - 0.9); zPrev = z; path.push([x, y, z]);
      }
      // nowhere to run downhill (the pond is in the bottom already): a drainage ditch
      // instead, out of the pond and along behind the verge, the way the circuit's drains run
      if(path.length < 6){
        path.length = 0;
        const q0 = query(best.x, best.y), i0 = q0.i, sd = q0.side;
        let zPrev = wz;
        for(let s = 0; s <= 30; s++){
          const i = (i0 + (s - 4) + n) % n, o = sd * (half + roOf(i, sd) + BAR + 9);
          const x2 = T.x[i] + T.nx[i] * o, y2 = T.y[i] + T.ny[i] * o;
          if(Math.hypot(x2 - best.x, y2 - best.y) < rad + 2) continue;
          const q = query(x2, y2); if(!q.far && q.bar < 7) break;
          if(blocked(x2, y2, 2)) break;
          const z = Math.min(zPrev, height(x2, y2) - 0.9); zPrev = z; path.push([x2, y2, z]);
        }
      }
      // cut its bed into the grid
      for(const [sx, sy, sz] of path){
        const c0 = Math.round((sx - X0) / STEP), r0 = Math.round((sy - Y0) / STEP);
        for(let r = r0 - 1; r <= r0 + 1; r++) for(let c = c0 - 1; c <= c0 + 1; c++){
          const k = r * NX + c, d = Math.hypot(X0 + c * STEP - sx, Y0 + r * STEP - sy);
          if(k >= 0 && k < NV && d < 9 && DB[k] > 6) H[k] = Math.min(H[k], mix(sz - 0.5, H[k], sstep(3, 9, d)));
        }
        excl.push({ x:sx, y:sy, r:3.5 });
      }
      // the water sits on the bed it was cut into, never above the banks
      P.stream = path.map(([sx, sy]) => [sx, sy, height(sx, sy) + 0.25]);
    }
  }
  tm.water = Date.now() - t0;

  /* ---- the forest, scanned on a jittered grid ---- */
  const FSTEP = lite ? 8.6 : 6.4;
  let nF = 0;
  for(let y = Y0 + 4; y < Y0 + (NY - 1) * STEP - 4; y += FSTEP) for(let x = X0 + 4; x < X0 + (NX - 1) * STEP - 4; x += FSTEP){
    const px = x + (R() - 0.5) * FSTEP * 0.9, py = y + (R() - 0.5) * FSTEP * 0.9;
    const bar = at(DB, px, py); if(bar < 3.4) continue;
    const kk = Math.round((py - Y0) / STEP) * NX + Math.round((px - X0) / STEP);
    const i = NI[kk], side = SD[kk];
    if(inParkZone(i, side, bar) || inPaddock(i, side, at(DT, px, py))) continue;
    if(farmAt(px, py, bar)) continue;
    const z = height(px, py), rel = z - ZN[kk], sl = slopeAt(px, py);
    const f = forestAt(px, py, i, side, bar);
    const roll = R();
    // the verge: shrubs and the odd azalea along the fence, more of them where the forest is near
    if(bar < 14){
      if(roll < 0.10 + f * 0.25){
        const h = 0.9 + R() * 1.3, az = (stands.some(s => Math.hypot(s.p.x - px, s.p.y - py) < (s.p.wid || 40) / 2 + 60) || tight(i)) && R() < 0.5;
        if(fits(px, py, az ? "azalea" : "shrub", h)) put(az ? "azalea" : "shrub", px, py, h, 1 + R() * 0.5, az ? (R() < 0.55 ? [1, 0.48, 0.7] : [1, 1, 1]) : nudge(0.18, 0.06));
      }
      if(f < 0.25 || roll > f * 0.55) continue;
    } else if(roll > f){
      // the open ground between: a bush now and then, wild flowers in the clearings
      if(roll < f + 0.035 && bar < 200){ const h = 1 + R(); if(fits(px, py, "shrub", h)) put("shrub", px, py, h, 1.2 + R() * 0.6, nudge(0.2, 0.06)); }
      else if(roll > 0.985 && bar > 10 && bar < 160 && !lite) L.flowers.push({ x:px, y:py, z, ry:R() * 6.3, s:0.7 + R() * 0.8, tint:[["#F2D0DC"], ["#FFFFFF"], ["#F2C94C"], ["#B9A0E0"]][Math.floor(R() * 4)][0] });
      continue;
    }
    // which tree: conifer plantations on the hills, mixed broadleaf lower down, bamboo on the banks
    const plant = fbm(px / 150, py / 150, 61, 2), bam = fbm(px / 85, py / 85, 71, 2);
    const near = sstep(0, 40, bar);                  // trees by the track are smaller
    const hill = sstep(-4, 22, rel);
    let kind;
    if(bam > 0.66 && sl > 0.06 && f < 0.9) kind = "bamboo";
    else if(R() < (bar < 40 ? 0.05 : 0.025)) kind = "momiji";
    else if(R() < 0.01) kind = "sakura";
    else if(plant > 0.5 - hill * 0.12) kind = R() < 0.62 ? "sugi" : "hinoki";
    else kind = R() < 0.78 ? "broad" : R() < 0.6 ? "hinoki" : "sugi";
    const tall = 0.7 + 0.3 * near + hill * 0.25;
    const h = ({ sugi:15 + R() * 9, hinoki:12 + R() * 6, broad:8 + R() * 6, momiji:5 + R() * 3, sakura:6 + R() * 3, bamboo:8 + R() * 4 })[kind] * tall;
    if(!fits(px, py, kind, h)) continue;
    const tint = kind === "broad" ? [[0.92, 1.02, 0.86], [1, 1, 1], [1.08, 1.06, 0.88]][Math.floor(R() * 3)].map(v => v * (0.94 + R() * 0.12))
      : kind === "momiji" ? [[1, 1, 1], [1.1, 0.78, 0.6], [1.04, 1.12, 0.7]][Math.floor(R() * 3)]
      : nudge(kind === "sakura" ? 0.14 : 0.16, 0.08);
    put(kind, px, py, h, (kind === "broad" ? 0.85 + R() * 0.35 : 0.88 + R() * 0.24) * (kind === "sugi" || kind === "hinoki" ? 1 : 1), tint);
    nF++;
  }
  tm.forest = Date.now() - t0;

  /* ---- the ground's colour: open grass, mown verges, the forest floor, banks and dirt ---- */
  const COL = new Float32Array(NV * 3);
  // how wooded each grid square ended up, from what was actually planted
  const dens = new Float32Array(NV);
  for(const k of ["sugi", "hinoki", "broad", "momiji", "bamboo", "sakura"]) for(const t of L[k]){
    const c = Math.round((t.x - X0) / STEP), r = Math.round((t.y - Y0) / STEP);
    for(let rr = r - 1; rr <= r + 1; rr++) for(let cc = c - 1; cc <= c + 1; cc++){ const q = rr * NX + cc; if(q >= 0 && q < NV) dens[q] += (rr === r && cc === c) ? 0.5 : 0.18; }
  }
  const parkSet = new Set(park.cells);
  for(let r = 0; r < NY; r++) for(let c = 0; c < NX; c++){
    const k = r * NX + c, x = X0 + c * STEP, y = Y0 + r * STEP, bar = DB[k];
    const n1 = fbm(x / 60, y / 60, 81, 2), n2 = fbm(x / 23, y / 23, 91, 2);
    let col = mixC(GC.lush, GC.openDry, sstep(0.35, 0.7, n1));
    col = mixC(col, GC.open, 0.4);
    // fresh, mown grass near the circuit
    col = mixC(GC.verge, col, sstep(4, 40, bar));
    // darker under the trees, and from far off a canopy rather than a floor
    const fd = clamp(dens[k], 0, 1);
    col = mixC(col, GC.floor, fd * 0.85);
    const f = forestAt(x, y, NI[k], SD[k], bar), unplanted = sstep(380, 520, bar) * f * 1.6;
    if(unplanted > 0) col = mixC(col, mixC(GC.canopy, GC.canopyHi, sstep(0.45, 0.62, n2)), clamp(unplanted, 0, 0.92));
    // banks: mossy where steep, bare earth or a concrete cut where very steep
    const sl = slopeAt(x, y);
    col = mixC(col, GC.moss, sstep(0.22, 0.45, sl) * 0.7);
    col = mixC(col, bar < 30 ? GC.cut : GC.earth, sstep(0.55, 0.9, sl) * 0.85);
    // worn patches: behind the stands, by the gates, the odd scrape in the open
    if(bar > 6 && fd < 0.3 && n2 > 0.7) col = mixC(col, n1 > 0.55 ? GC.dirt : GC.gravel, sstep(0.7, 0.8, n2) * 0.75);
    if(bar < 0.5) col = mixC(col, GC.verge, 0.6);
    if(inPaddock(NI[k], SD[k], DT[k]) && bar > -1) col = mixC(col, GC.paddock, sstep(-1, 6, bar));
    if(parkSet.has(k)) col = mixC(col, mixC(GC.open, GC.verge, 0.5), 0.6);
    COL[k * 3] = col[0]; COL[k * 3 + 1] = col[1]; COL[k * 3 + 2] = col[2];
  }
  // farmland ground: bunds round the paddies, dark soil between the tea
  const paint = (cx, cy, ang, l, w, c0, k0) => {
    const ux = Math.cos(ang), uy = Math.sin(ang), c = Math.round((cx - X0) / STEP), r = Math.round((cy - Y0) / STEP), R2 = Math.ceil(Math.hypot(l, w) / 2 / STEP) + 1;
    for(let rr = r - R2; rr <= r + R2; rr++) for(let cc = c - R2; cc <= c + R2; cc++){
      const q = rr * NX + cc; if(q < 0 || q >= NV) continue;
      const px = X0 + cc * STEP - cx, py = Y0 + rr * STEP - cy, a = px * ux + py * uy, b = -px * uy + py * ux;
      if(Math.abs(a) < l / 2 + STEP * 0.6 && Math.abs(b) < w / 2 + STEP * 0.6){ const t = k0; COL[q * 3] = mix(COL[q * 3], c0[0], t); COL[q * 3 + 1] = mix(COL[q * 3 + 1], c0[1], t); COL[q * 3 + 2] = mix(COL[q * 3 + 2], c0[2], t); }
    }
  };
  for(const p of paddies) paint(p.x, p.y, p.ang, p.l, p.w, GC.paddyBund, 0.8);
  for(const t of teaFields) paint(t.x, t.y, t.ang, t.l, t.w, GC.teaSoil, 0.7);
  G.COL = COL;
  tm.paint = Date.now() - t0;

  /* ---- TV towers among the trees, on the outside of the big corners ---- */
  P.towers = [];
  for(const u of Z.towers){
    const i = Math.round(u * n) % n, sd = T.curv[i] > 0 ? -1 : 1, o = sd * (half + roOf(i, sd) + BAR + 6);
    const x = T.x[i] + T.nx[i] * o, y = T.y[i] + T.ny[i] * o, q = query(x, y);
    if(!q.far && q.bar < 4.5) continue;
    if(blocked(x, y, 4)) continue;
    P.towers.push({ x, y, z:height(x, y), ang:T.ang[i], face:Math.atan2(-T.ny[i] * sd, -T.nx[i] * sd) });
    excl.push({ x, y, r:6 });
  }
  // anything planted before the towers, the pond or the stream went in that now stands
  // in one is taken out, and everything is set down on the ground as it finally is
  for(const k in L) L[k] = L[k].filter(t => !P.towers.some(w => Math.hypot(w.x - t.x, w.y - t.y) < 6 + (CROWN[k] || 0.3) * (t.h || 2))
    && !(P.pond && Math.hypot(P.pond.x - t.x, P.pond.y - t.y) < P.pond.r + 3)
    && !P.stream.some(s => Math.hypot(s[0] - t.x, s[1] - t.y) < 3.5)
    && (k === "hedge" || k === "tea" || !blocked(t.x, t.y, 0)));
  for(const k in L) for(const t of L[k]) t.z = height(t.x, t.y) - (k === "hedge" || k === "tea" ? 0.15 : 0.05);

  /* ---- the bridges, decided by what is actually under the road ----
     Wherever the road and its verges stand clear of the ground (the approach to a
     crossing, and the crossing itself), the road needs holding up: over the other
     road an open span on piers, elsewhere a retaining wall down each side to the
     ground. The ground is read exactly as the mesh draws it, triangle by triangle. */
  const triH = (x, y) => {
    const fx = clamp((x - X0) / STEP, 0, NX - 1.001), fy = clamp((y - Y0) / STEP, 0, NY - 1.001), c = Math.floor(fx), r = Math.floor(fy), u = fx - c, v = fy - r, k = r * NX + c;
    const a = H[k], b = H[k + 1], d = H[k + NX], e = H[k + NX + 1];
    return u + v <= 1 ? a + (b - a) * u + (d - a) * v : e + (d - e) * (1 - u) + (b - e) * (1 - v);
  };
  P.triH = triH;
  P.bridges = [];
  {
    const lift = new Float32Array(n), open = new Uint8Array(n), dropL = new Float32Array(n), dropR = new Float32Array(n);
    for(let i = 0; i < n; i++){
      const eL = half + T.roL[i] + 6, eR = half + T.roR[i] + 6;
      let mx = 0;
      for(let o = -eL; o <= eR + 0.01; o += 3){
        const x = T.x[i] + T.nx[i] * o, y = T.y[i] + T.ny[i] * o;
        mx = Math.max(mx, T.zAt(i, o) - triH(x, y));
        // over another road: its tarmac is right underneath, well below this one
        if(Math.abs(o) <= half + roOf(i, o >= 0 ? 1 : -1)){
          const q = query(x, y);
          if(!q.far && Math.abs(((q.i - i + n + n / 2) % n) - n / 2) > 40 && q.d < half + 1.5 && q.z < T.z[i] - 3) open[i] = 1;
        }
      }
      lift[i] = mx;
      const zl = T.zAt(i, -eL), zr = T.zAt(i, eR);
      dropL[i] = zl - triH(T.x[i] - T.nx[i] * eL, T.y[i] - T.ny[i] * eL);
      dropR[i] = zr - triH(T.x[i] + T.nx[i] * eR, T.y[i] + T.ny[i] * eR);
    }
    // runs of nodes that stand clear somewhere across their width (the verge sits 0.6 m
    // over the ground by design, so anything under 1.4 m is just that)
    let run = null;
    for(let i = 0; i <= n; i++){
      const k = i % n, on = i < n && lift[k] > 1.4;
      if(on){ if(!run) run = { i0:k, i1:k }; else run.i1 = k; }
      else if(run){ P.bridges.push(run); run = null; }
    }
    for(const b of P.bridges){
      b.piers = []; b.open = [];
      let prev = null;
      for(let s = 0, i = b.i0; s <= ((b.i1 - b.i0 + n) % n); s++, i = (i + 1) % n){
        const o = !!open[i]; b.open.push(o);
        if(prev !== null && o !== prev) b.piers.push(o ? (i - 1 + n) % n : i);
        prev = o;
      }
    }
    P.deck = { lift, open, dropL, dropR };
  }

  /* ---- counts ---- */
  for(const k in L) P.stats[k] = L[k].length;
  P.stats.trees = L.sugi.length + L.hinoki.length + L.broad.length + L.sakura.length + L.momiji.length + L.bamboo.length;
  P.stats.grid = NX + "x" + NY;
  tm.total = Date.now() - t0;
  return P;
}

/* The audit: every plant against the circuit (its run-off and barrier, both sides,
   every piece of it) and against every footprint. Exact, not sampled. */
function auditSuzuka(P, T){
  const out = { checked:0, onTrack:0, inRunoff:0, pastBarrierTooClose:0, inFootprint:0, minBar:Infinity, worst:null, onLine:0 };
  for(const k in P.lists) for(const t of P.lists[k]){
    out.checked++;
    const q = P.query(t.x, t.y);
    if(q.far) continue;
    const half = T.half, ro = q.side >= 0 ? T.roR[q.i] : T.roL[q.i];
    if(q.d < half + 0.5) out.onTrack++;
    else if(q.d < half + ro) out.inRunoff++;
    else if(q.bar < 2.5) out.pastBarrierTooClose++;
    // the racing line runs inside the white lines, so this can only be hit by a plant on the road
    const lx = T.x[q.i] + T.nx[q.i] * T.line[q.i], ly = T.y[q.i] + T.ny[q.i] * T.line[q.i];
    if(Math.hypot(t.x - lx, t.y - ly) < 3) out.onLine++;
    if(q.bar < out.minBar){ out.minBar = q.bar; out.worst = { kind:k, x:t.x, y:t.y, bar:q.bar, u:q.i / T.n }; }
    if(P.blocked(t.x, t.y, 0)) out.inFootprint++;
  }
  return out;
}

export { planSuzuka, auditSuzuka, fbm, rng };
