import { fbm, rng } from './suzuka-plan.js';

/* ---------- Singapore: the plan ----------------------------------------------
   Pure numbers, no three.js, so it runs in Node (scripts/singapore-audit.mjs). It decides: the ground (land and the bay,
   the channel under the bridge), where every lamp, tree, stand, building, bridge, boat and landmark goes, and that none
   of it is on the road, the run-off or the walls.
   Side convention as everywhere: +1 is the right of the direction of travel, -1 the left. The lap is anticlockwise, so
   the infield (the bay) is on the left. Landmarks keep the lap fractions the old scene list gave them (the game's
   circuit is the layout string's shape, not the surveyed one: NOTES.md).                                             */

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const hex = c => [parseInt(c.slice(1, 3), 16) / 255, parseInt(c.slice(3, 5), 16) / 255, parseInt(c.slice(5, 7), 16) / 255];
const mixC = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const GC = { pave:hex("#34324A"), pave2:hex("#3E3B58"), block:hex("#252338"), lawn:hex("#2C4C3C"), lawn2:hex("#3A5E46"), plaza:hex("#4A4666"),
  bank:hex("#1A2640"), seabed:hex("#0A2030"), street:hex("#2E2C42"), dirt:hex("#2C2A3C"), park:hex("#24402F") };
const BAR = 2.6;
const WATER_Y = -0.75, SEABED = -3.2;

function planSingapore(T, opts){
  opts = opts || {};
  const lite = opts.detail === 0, dens = lite ? 0.55 : 1;
  const n = T.n, half = T.half, R = rng(5309);
  const t0 = Date.now(), P = { stats:{}, tm:{} };
  const roOf = (i, side) => side >= 0 ? T.roR[i] : T.roL[i];
  const nodeAt = u => Math.round(((u % 1) + 1) % 1 * n) % n;
  const edge = (i, side) => half + roOf(((Math.round(i) % n) + n) % n, side) + BAR;
  const outside = i => { let c = 0; for(let k = -6; k <= 6; k++) c += T.curv[((i + k) % n + n) % n]; return c <= 0 ? 1 : -1; };
  const at = (i, side, off) => { i = ((Math.round(i) % n) + n) % n; return [T.x[i] + T.nx[i] * side * off, T.y[i] + T.ny[i] * side * off]; };
  P.edge = edge; P.at = at; P.nodeAt = nodeAt; P.outside = outside;
  const Z = T.def.zones || {};

  /* ---- segments hashed, as in the other worlds ---- */
  const CELL = 40, bb = T.bounds, PAD = 560, STEP = opts.step || (lite ? 22 : 14);
  const HX0 = bb.minX - PAD - CELL, HY0 = bb.minY - PAD - CELL;
  const hw = Math.ceil((bb.w + 2 * PAD + 2 * CELL) / CELL) + 1, hh = Math.ceil((bb.h + 2 * PAD + 2 * CELL) / CELL) + 1;
  const cells = Array.from({ length:hw * hh }, () => []);
  for(let i = 0; i < n; i++){
    const j = (i + 1) % n;
    const c0 = Math.floor((Math.min(T.x[i], T.x[j]) - HX0) / CELL), c1 = Math.floor((Math.max(T.x[i], T.x[j]) - HX0) / CELL);
    const r0 = Math.floor((Math.min(T.y[i], T.y[j]) - HY0) / CELL), r1 = Math.floor((Math.max(T.y[i], T.y[j]) - HY0) / CELL);
    for(let r = r0; r <= r1; r++) for(let c = c0; c <= c1; c++) cells[r * hw + c].push(i);
  }
  const Q = { d:0, i:0, side:1, bar:0, z:0, far:false, off:0 };
  function query(x, y){
    const c = Math.floor((x - HX0) / CELL), r = Math.floor((y - HY0) / CELL);
    let bd = Infinity, bi = -1, bs = 1, bz = 0, bbar = Infinity, boff = 0;
    for(let rr = r - 2; rr <= r + 2; rr++){ if(rr < 0 || rr >= hh) continue;
      for(let cc = c - 2; cc <= c + 2; cc++){ if(cc < 0 || cc >= hw) continue;
        for(const i of cells[rr * hw + cc]){
          const j = (i + 1) % n, ax = T.x[i], ay = T.y[i], dx = T.x[j] - ax, dy = T.y[j] - ay;
          const L2 = dx * dx + dy * dy || 1, t = clamp(((x - ax) * dx + (y - ay) * dy) / L2, 0, 1);
          const d = Math.hypot(x - (ax + dx * t), y - (ay + dy * t));
          const off = (x - ax) * T.nx[i] + (y - ay) * T.ny[i], side = off >= 0 ? 1 : -1;
          const ed = half + mix(roOf(i, side), roOf(j, side), t);
          const bar = d - ed - BAR;
          if(bar < bbar) bbar = bar;
          if(d < bd){ bd = d; bi = i; bs = side; bz = T.z[i] + (T.z[j] - T.z[i]) * t; boff = off; }
        } } }
    Q.far = bi < 0;
    if(Q.far){ Q.d = 999; Q.bar = 999; return Q; }
    Q.d = bd; Q.i = bi; Q.side = bs; Q.bar = bbar; Q.z = bz; Q.off = boff;
    return Q;
  }
  P.query = query; P.clearance = (x, y) => { const q = query(x, y); return q.far ? 999 : q.bar; };

  /* ---- footprints ---- */
  const excl = [], rects = [], bands = [];
  const addCircle = (x, y, r) => excl.push({ x, y, r });
  const addRect = (cx, cy, ang, a0, a1, b0, b1) => { const ux = Math.cos(ang), uy = Math.sin(ang); rects.push({ cx, cy, ux, uy, vx:-uy, vy:ux, a0, a1, b0, b1 }); };
  const addBand = (i0, i1, side, o0, o1) => bands.push({ i0, i1, side, o0, o1, span:((i1 - i0) % n + n) % n });
  const blocked = (x, y, r) => {
    for(const e of excl){ const dx = x - e.x, dy = y - e.y, rr = e.r + r; if(dx * dx + dy * dy < rr * rr) return true; }
    for(const q of rects){ const dx = x - q.cx, dy = y - q.cy, a = dx * q.ux + dy * q.uy, b = dx * q.vx + dy * q.vy;
      if(a > q.a0 - r && a < q.a1 + r && b > q.b0 - r && b < q.b1 + r) return true; }
    if(bands.length){
      const q = query(x, y);
      if(!q.far) for(const b of bands){ if(b.side !== q.side) continue; const k = ((q.i - b.i0) % n + n) % n; const o = Math.abs(q.off); if(k <= b.span + 2 && o > b.o0 - r - 1.5 && o < b.o1 + r + 1.5) return true; }
    }
    return false;
  };
  P.blocked = blocked; P.excl = excl; P.rects = rects; P.bands = bands;
  for(const p of T.props){ if(p.only2d || p.t === "tree") continue; addCircle(p.x, p.y, ({ pylon:3.4, billboard:9, garage:15, marshal:5, arch:7 })[p.t] || 8); }

  const S = P.structs = { stands:[], buildings:[], lamps:[], pylons:[], trees:[], palms:[], planters:[], footbridges:[], boats:[], ships:[], cars:[], buses:[], stalls:[],
    screens:[], tv:[], flagPoles:[], peninsulas:[], bridges:[], lawns:[], posts:[], marshal:[], wheel:null, pit:null, merlion:null, domes:[], tri:null, spots:[], towersGlow:[] };

  /* ---- the bay: water inside the loop, but for a promenade, peninsulas for landmarks, and a channel under each bridge ---- */
  // inside / outside the loop, by scanline
  const X0 = bb.minX - PAD, Y0 = bb.minY - PAD;
  const NX = Math.ceil((bb.w + 2 * PAD) / STEP) + 1, NY = Math.ceil((bb.h + 2 * PAD) / STEP) + 1, NV = NX * NY;
  const INSIDE = new Uint8Array(NV);
  { const sub = []; for(let i = 0; i < n; i += 2) sub.push(i);
    for(let r = 0; r < NY; r++){
      const y = Y0 + r * STEP + 0.013, xs = [];
      for(let a = 0; a < sub.length; a++){
        const i = sub[a], j = sub[(a + 1) % sub.length], yi = T.y[i], yj = T.y[j];
        if((yi <= y && yj > y) || (yj <= y && yi > y)) xs.push(T.x[i] + (y - yi) / (yj - yi) * (T.x[j] - T.x[i]));
      }
      xs.sort((p, q) => p - q);
      for(let c = 0; c < NX; c++){ const x = X0 + c * STEP; let k = 0; while(k < xs.length && xs[k] < x) k++; INSIDE[r * NX + c] = k & 1; }
    } }
  // landmark peninsulas, on the infield side
  const pen = (u, off, r, tag) => { const i = nodeAt(u), [x, y] = at(i, -1, off); S.peninsulas.push({ x, y, r, tag, i }); return S.peninsulas[S.peninsulas.length - 1]; };
  const penTri = pen(0.30, 430, 120, "tri"), penArts = pen(0.36, 340, 110, "arts"), penWheel = pen(0.22, 150, 80, "wheel");
  // bridge channels: the span of each bridge, by lap fraction
  const BR = [{ u0:0.588, u1:0.646, w:70, name:"anderson" }, { u0:0.412, u1:0.462, w:38, name:"esplanade" }];
  S.bridges = BR.map(b => ({ ...b, i0:nodeAt(b.u0), i1:nodeAt(b.u1) }));
  const inSpan = (i, b) => { const k = ((i - b.i0) % n + n) % n; return k <= ((b.i1 - b.i0) % n + n) % n; };

  /* ---- the ground grid: land at street level, the bay below it ---- */
  const H = new Float32Array(NV), COL = new Float32Array(NV * 3), WATER = new Uint8Array(NV), DB = new Float32Array(NV);
  for(let r = 0; r < NY; r++) for(let c = 0; c < NX; c++){
    const k = r * NX + c, x = X0 + c * STEP, y = Y0 + r * STEP;
    query(x, y);
    const bar = Q.far ? 400 : Q.bar, inside = INSIDE[k] === 1;
    DB[k] = bar;
    // how wide the promenade is along this stretch of the infield
    const prom = 46 + 34 * fbm(x / 120, y / 120, 3, 2) + (Q.far ? 0 : 0);
    let water = false;
    if(inside && bar > prom){ water = true; }
    for(const p of S.peninsulas){ const d = Math.hypot(x - p.x, y - p.y); if(d < p.r * (1 + 0.1 * Math.sin(Math.atan2(y - p.y, x - p.x) * 3))) water = false; }
    if(!Q.far) for(const b of S.bridges) if(inSpan(Q.i, b) && bar > -2 && bar < b.w) water = true;
    WATER[k] = water ? 1 : 0;
    const zr = Q.far ? 0 : Q.z;
    let z = water ? SEABED : mix(zr - 0.35, 0, sstep(0, 220, bar));
    H[k] = z;
    // colours: pavement near the circuit, lawn and park inside, blocks and streets outside
    let col;
    if(water) col = mixC(GC.seabed, GC.bank, 0.4);
    else if(inside){ col = mixC(GC.pave, GC.pave2, fbm(x / 30, y / 30, 5, 2)); if(bar > 14) col = mixC(col, fbm(x / 70, y / 70, 9, 2) > 0.5 ? GC.lawn : GC.park, sstep(14, 26, bar) * 0.8); }
    else { col = mixC(GC.block, GC.street, fbm(x / 22, y / 22, 11, 3)); col = mixC(col, GC.pave2, 1 - sstep(0, 34, bar)); }
    COL[k * 3] = col[0]; COL[k * 3 + 1] = col[1]; COL[k * 3 + 2] = col[2];
  }
  // soften the banks (the road side is exact)
  for(let pass = 0; pass < 3; pass++){
    const src = H.slice();
    for(let r = 1; r < NY - 1; r++) for(let c = 1; c < NX - 1; c++){
      const k = r * NX + c; if(DB[k] < 3) continue;
      H[k] = (src[k] * 4 + src[k - 1] + src[k + 1] + src[k - NX] + src[k + NX]) / 8;
    }
  }
  const G = { X0, Y0, STEP, NX, NY, H, COL, WATER, DB, INSIDE };
  P.grid = G;
  const gat = (A, x, y) => {
    const fx = clamp((x - X0) / STEP, 0, NX - 1.001), fy = clamp((y - Y0) / STEP, 0, NY - 1.001);
    const c = Math.floor(fx), r = Math.floor(fy), u = fx - c, v = fy - r, k = r * NX + c;
    return (A[k] * (1 - u) + A[k + 1] * u) * (1 - v) + (A[k + NX] * (1 - u) + A[k + NX + 1] * u) * v;
  };
  const height = (x, y) => gat(H, x, y);
  const isWater = (x, y) => { const c = clamp(Math.round((x - X0) / STEP), 0, NX - 1), r = clamp(Math.round((y - Y0) / STEP), 0, NY - 1); return WATER[r * NX + c] === 1; };
  const wetNear = (x, y, rad) => { for(const [dx, dy] of [[0, 0], [rad, 0], [-rad, 0], [0, rad], [0, -rad]]) if(isWater(x + dx, y + dy)) return true; return false; };
  P.height = height; P.isWater = isWater; P.wetNear = wetNear;
  P.tm.ground = Date.now() - t0;

  /* ---- 1. stands: tiered, with scaffold, where the old scene had them and a few corners besides ---- */
  const stand = o => {
    const i0 = nodeAt(o.u0), i1 = nodeAt(o.u1), side = o.side, span = ((i1 - i0) % n + n) % n;
    let off0 = 0; for(let k = 0; k <= span; k++) off0 = Math.max(off0, edge(i0 + k, side));
    off0 += o.gap != null ? o.gap : 7;
    const st = Object.assign({ rows:12, rowD:0.95, rowH:0.46, roof:false, fill:0.8, col:"#4A4670" }, o, { i0, i1, span, side, off0 });
    st.depth = st.rows * st.rowD; st.height = st.rows * st.rowH;
    // keep it off the water
    for(let k = 0; k <= span; k += 3){ const [x, y] = at(i0 + k, side, off0 + st.depth / 2); if(isWater(x, y)) st.wet = true; }
    S.stands.push(st); addBand(i0, i1, side, off0 - 4, off0 + st.depth + (st.roof ? 6 : 4));
    return st;
  };
  stand({ name:"pit", u0:0.945, u1:0.040, side:1, rows:14, rowD:1.0, rowH:0.5, roof:true, col:"#4C4872" });            // the main stand, across from the pits
  stand({ name:"t1", u0:0.020, u1:0.062, side:outside(nodeAt(0.04)), rows:12, col:"#5A3A6E" });
  stand({ name:"t7", u0:0.232, u1:0.254, side:outside(nodeAt(0.245)), rows:12, col:"#3A5E7A" });                         // Memorial corner
  stand({ name:"t10", u0:0.362, u1:0.382, side:outside(nodeAt(0.372)), rows:10, col:"#6A3A5A" });
  stand({ name:"t13", u0:0.660, u1:0.684, side:outside(nodeAt(0.672)), rows:14, roof:true, col:"#3A6A6E" });              // the hairpin
  stand({ name:"t14", u0:0.730, u1:0.752, side:outside(nodeAt(0.742)), rows:10, col:"#5A5A7E" });
  stand({ name:"t19", u0:0.915, u1:0.940, side:outside(nodeAt(0.928)), rows:12, roof:true, col:"#7A3A4E" });
  // the floating stand on the bay, on the infield side
  { const f = stand({ name:"float", u0:0.790, u1:0.812, side:-1, rows:12, col:"#3A4E78", gap:12 }); f.floating = true; }

  /* ---- 2. the pit building, behind the garages the circuit adds, infield side ---- */
  { const ps = T.pitSide, i0 = nodeAt(0.975), i1 = nodeAt(0.040), span = ((i1 - i0) % n + n) % n, off0 = half + T.pitW + 15;
    S.pit = { i0, i1, span, side:ps, off0, depth:20 };
    addBand(i0, i1, ps, half, off0 + 20 + 70);
  }

  /* ---- 3. footbridges across straights ---- */
  for(const u of [0.030, 0.165, 0.320, 0.445, 0.545, 0.715, 0.865]){
    const i = nodeAt(u), eL = edge(i, -1) + 1.4, eR = edge(i, 1) + 1.4;
    const pl = at(i, -1, eL), pr = at(i, 1, eR);
    // not over a stand, in the bay, or too near a corner
    let ok = Math.abs(T.curv[i]) < 0.002;
    for(const b of bands){ const k = ((i - b.i0) % n + n) % n; if(k <= b.span + 12) ok = false; }
    if(S.bridges.some(b => inSpan(i, { i0:(b.i0 - 14 + n) % n, i1:(b.i1 + 14) % n }))) ok = false;
    if(!ok) continue;
    S.footbridges.push({ i, pl, pr, z:T.z[i], ang:T.ang[i], len:eL + eR });
    addCircle(pl[0], pl[1], 3.5); addCircle(pr[0], pr[1], 3.5);
  }

  /* ---- 4. lamps: floodlight pylons both sides, a truss over the barrier line; street lamps beyond ---- */
  { const SP = 26;
    for(let i = 0, k = 0; i < n; i += Math.max(1, Math.round(SP / T.ds)), k++){
      const side = (k & 1) ? 1 : -1, off = edge(i, side) + 1.3, [x, y] = at(i, side, off);
      if(blocked(x, y, 1.4) || P.clearance(x, y) < 0.9) continue;
      const hx = at(i, side, off - 5.5);
      S.pylons.push({ x, y, z:T.z[i] - 0.1, hx:hx[0], hy:hx[1], i, side, ang:T.ang[i] });
    }
  }
  const lampAt = (x, y, z, ang, h) => S.lamps.push({ x, y, z, ang, h:h || 6.2 });

  /* ---- 5. the bridges' own lamps and parapet are in the world; here: the boats and ships on the water ---- */
  { const spots = []; for(let r = 4; r < NY - 4; r += 5) for(let c = 4; c < NX - 4; c += 5){ const k = r * NX + c; if(WATER[k] && DB[k] > 80 && INSIDE[k]) spots.push([X0 + c * STEP, Y0 + r * STEP]); }
    const take = (cnt, minD, list) => { let tries = 0; while(list.length < cnt && tries++ < 400 && spots.length){ const s = spots[Math.floor(R() * spots.length)]; if(list.every(o => Math.hypot(o.x - s[0], o.y - s[1]) > minD)) list.push({ x:s[0], y:s[1] }); } };
    take(Math.round(10 * dens), 70, S.boats); take(3, 220, S.ships);
    S.boats.forEach((b, k) => { b.a = R() * 6.28; b.r = 25 + R() * 55; b.sp = (0.05 + R() * 0.07) * (R() < 0.5 ? -1 : 1); b.c = k; b.kind = k % 3; });
    S.ships.forEach((s2, k) => { s2.ang = R() * 6.28; s2.c = k; });
    P.stats.waterSpots = spots.length; }

  /* ---- 6. landmarks ---- */
  // the tri-tower with its boat-shaped sky deck (a generic design), on the bay peninsula
  { const i = penTri.i, a = T.ang[i] + 0.4; S.tri = { x:penTri.x, y:penTri.y, ang:a, h:185 }; addCircle(penTri.x, penTri.y, 70); }
  // the arts centre: two domes of spikes on the next peninsula
  { const a = T.ang[penArts.i]; S.domes.push({ x:penArts.x + Math.cos(a) * 24, y:penArts.y + Math.sin(a) * 24, r:26, h:20, ang:a }, { x:penArts.x - Math.cos(a) * 22, y:penArts.y - Math.sin(a) * 22, r:20, h:16, ang:a });
    addCircle(penArts.x, penArts.y, 70); }
  // the observation wheel on its peninsula
  { const a = T.ang[penWheel.i]; S.wheel = { x:penWheel.x, y:penWheel.y, ang:a + Math.PI / 2, r:60 }; addCircle(penWheel.x, penWheel.y, 50); }
  // a generic fish-tailed lion statue on the promenade near the Esplanade, and the Esplanade's own domes on the waterfront
  { const i = nodeAt(0.685), [x, y] = at(i, -1, edge(i, -1) + 22); S.merlion = { x, y, ang:T.ang[i] }; addCircle(x, y, 12);
    const j = nodeAt(0.70), [x2, y2] = at(j, -1, edge(j, -1) + 62); S.domes.push({ x:x2, y:y2, r:22, h:17, ang:T.ang[j], theatre:true }); addCircle(x2, y2, 38); }

  /* ---- 7. the buildings: footprints on an occupancy grid so nothing overlaps; height grows with distance from the track ---- */
  const OC = 6, OX0 = X0, OY0 = Y0, ONX = Math.ceil((NX * STEP) / OC) + 1, ONY = Math.ceil((NY * STEP) / OC) + 1, OCC = new Uint8Array(ONX * ONY);
  const rasterRect = (cx, cy, ang, w, d, set) => {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    for(let a = -w / 2; a <= w / 2 + OC * 0.5; a += OC * 0.6) for(let b = -d / 2; b <= d / 2 + OC * 0.5; b += OC * 0.6){
      const x = cx + ca * Math.min(a, w / 2) - sa * Math.min(b, d / 2), y = cy + sa * Math.min(a, w / 2) + ca * Math.min(b, d / 2);
      const c = Math.floor((x - OX0) / OC), r = Math.floor((y - OY0) / OC);
      if(c < 0 || r < 0 || c >= ONX || r >= ONY) return set ? true : false;
      if(set) OCC[r * ONX + c] = 1; else if(OCC[r * ONX + c]) return false;
    }
    return true;
  };
  for(const e of excl) rasterRect(e.x, e.y, 0, e.r * 2, e.r * 2, true);
  for(const q of rects) rasterRect(q.cx, q.cy, Math.atan2(q.uy, q.ux), q.a1 - q.a0, q.b1 - q.b0, true);
  const bandsOK = (x, y, rad) => !blocked(x, y, rad);
  const clearFor = (x, y, w, d, h, extra) => {
    const rad = Math.hypot(w, d) / 2, q = query(x, y);
    if(q.far) return true;
    // the taller, the further back: the overhead lens must still see the road
    const need = h <= 14 ? 12 : Math.min(30 + 0.8 * (h - 14), 190);
    return q.bar - rad * 0.35 >= need + (extra || 0);
  };
  const addBuilding = b => {
    if(!rasterRect(b.x, b.y, b.ang, b.w + 4, b.d + 4, false)) return false;
    if(blocked(b.x, b.y, Math.hypot(b.w, b.d) / 2 * 0.8)) return false;
    if(!clearFor(b.x, b.y, b.w, b.d, b.h)) return false;
    if(wetNear(b.x, b.y, Math.max(b.w, b.d) / 2) && !b.onWater) return false;
    { const ca = Math.cos(b.ang), sa = Math.sin(b.ang); for(const [a, c] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]) if(isWater(b.x + ca * a * b.w / 2 - sa * c * b.d / 2, b.y + sa * a * b.w / 2 + ca * c * b.d / 2) && !b.onWater) return false; }
    rasterRect(b.x, b.y, b.ang, b.w + 4, b.d + 4, true);
    b.z = Math.max(height(b.x, b.y), -0.4);
    S.buildings.push(b); return true;
  };
  // named landmarks first: a colonial hotel, a stepped art-deco tower, a ring of glass offices, the lawn with its pavilion
  const near = (u, side, off) => { const i = nodeAt(u); const [x, y] = at(i, side, off); return { x, y, i, ang:T.ang[i] }; };
  { const c = near(0.655, 1, 70); addBuilding({ type:"colonial", x:c.x, y:c.y, ang:c.ang, w:96, d:30, h:22, seed:1, landmark:true }); }
  { for(const off of [260, 300, 340]){ const c = near(0.62, 1, off); if(addBuilding({ type:"deco", x:c.x, y:c.y, ang:c.ang, w:34, d:34, h:128, seed:2, landmark:true })) break; } }
  { for(const [u, off] of [[0.50, 300], [0.52, 340], [0.48, 330], [0.54, 360]]){ const c = near(u, 1, off); if(addBuilding({ type:"ring", x:c.x, y:c.y, ang:c.ang, w:82, d:82, h:78, seed:3, landmark:true })) break; } }
  { const c = near(0.45, 1, 120); S.lawns.push({ x:c.x, y:c.y, ang:c.ang, w:170, d:76 }); addRect(c.x, c.y, c.ang, -90, 90, -42, 42); rasterRect(c.x, c.y, c.ang, 176, 82, true);
    // a pavilion at one end and a clubhouse across the lawn from it
    addBuilding({ type:"colonial", x:c.x + Math.cos(c.ang) * 78 + Math.cos(c.ang + Math.PI / 2) * 52, y:c.y + Math.sin(c.ang) * 78 + Math.sin(c.ang + Math.PI / 2) * 52, ang:c.ang, w:56, d:22, h:12, seed:5, landmark:true }); }
  // the lawn's grass, painted into the ground colours
  for(const lw of S.lawns){ const ux = Math.cos(lw.ang), uy = Math.sin(lw.ang);
    for(let r = 0; r < NY; r++) for(let c = 0; c < NX; c++){ const x = X0 + c * STEP - lw.x, y = Y0 + r * STEP - lw.y, a = x * ux + y * uy, b = -x * uy + y * ux;
      if(Math.abs(a) < lw.w / 2 + 6 && Math.abs(b) < lw.d / 2 + 6){ const k = r * NX + c, e = Math.min(1, Math.max(0, 1 - (Math.max(Math.abs(a) - lw.w / 2, Math.abs(b) - lw.d / 2)) / 6)); const col = mixC([COL[k * 3], COL[k * 3 + 1], COL[k * 3 + 2]], GC.lawn2, e); COL[k * 3] = col[0]; COL[k * 3 + 1] = col[1]; COL[k * 3 + 2] = col[2]; } } }
  // the field: street blocks of every sort, as far as the haze
  const kinds = [];
  { const step = lite ? 38 : 26;
    for(let y = Y0 + 20; y < Y0 + NY * STEP - 20; y += step) for(let x = X0 + 20; x < X0 + NX * STEP - 20; x += step){
      const px = x + (R() - 0.5) * step * 0.8, py = y + (R() - 0.5) * step * 0.8;
      const k = Math.floor((py - Y0) / STEP) * NX + Math.floor((px - X0) / STEP);
      if(k < 0 || k >= NV || WATER[k] === 1) continue;
      const q = query(px, py); const bar = q.far ? 600 : q.bar; if(bar < 12 || bar > 640) continue;
      const inside = INSIDE[k] === 1;
      if(inside && bar < 60) continue;                                   // the promenade
      if(inside && bar > 120) continue;
      const ang = q.far ? 0 : T.ang[q.i];
      const nz = fbm(px / 160, py / 160, 7, 3);
      let type, w, d, h;
      const r = R();
      if(bar < 44){ type = r < 0.55 ? "shop" : r < 0.8 ? "colonial" : "hotel"; w = type === "shop" ? 40 + R() * 30 : 34 + R() * 22; d = type === "shop" ? 14 : 20; h = type === "shop" ? 9 + R() * 3 : 11 + R() * 5; }
      else if(bar < 110){ type = r < 0.35 ? "hotel" : r < 0.65 ? "apt" : r < 0.85 ? "shop" : "office"; w = 30 + R() * 26; d = 22 + R() * 14; h = type === "shop" ? 10 : 24 + R() * 30; if(type === "shop"){ w = 46; d = 14; } }
      else { type = r < 0.45 ? "office" : r < 0.65 ? "apt" : r < 0.8 ? "tower" : r < 0.92 ? "hotel" : "slab"; const grow = sstep(110, 420, bar); w = 26 + R() * 24; d = 24 + R() * 20; h = (type === "apt" ? 55 : 60) + grow * 90 + nz * 70 + R() * 40; if(type === "tower") h += 40; }
      if(R() > (bar < 60 ? 0.95 : 0.8) * dens + 0.1 * (1 - dens)) continue;
      if(addBuilding({ type, x:px, y:py, ang, w, d, h, seed:(R() * 1e6) | 0 })) kinds.push(type);
    } }
  P.stats.buildings = S.buildings.length;
  P.stats.kinds = kinds.reduce((a, k) => (a[k] = (a[k] || 0) + 1, a), {});
  P.tm.buildings = Date.now() - t0;

  /* ---- 8. street furniture, greenery, parked cars, stalls, TV towers, screens ---- */
  // street lamps: both sides of the street belt around the circuit, on land and clear
  for(let i = 0; i < n; i += Math.max(1, Math.round(24 / T.ds))){
    for(const side of [-1, 1]){
      const off = edge(i, side) + 8.5, [x, y] = at(i, side, off);
      if(isWater(x, y) || blocked(x, y, 1.5)) continue;
      const sk = Math.floor((y - Y0) / STEP) * NX + Math.floor((x - X0) / STEP);
      if(rasterRect(x, y, 0, 3, 3, false)) lampAt(x, y, height(x, y), T.ang[i] + (side > 0 ? Math.PI : 0), 6.0);
    }
  }
  // rain trees (wide umbrella canopies), palms, planters, along the promenade and the streets
  for(let i = 0; i < n; i += Math.max(1, Math.round(15 / T.ds))){
    for(const side of [-1, 1]){
      const base = edge(i, side) + 5;
      for(const [off, kind] of [[base + 4, "tree"], [base + 12, R() < 0.5 ? "palm" : "tree"]]){
        if(R() > 0.62 * dens + 0.15) continue;
        const [x, y] = at(i, side, off + (R() - 0.5) * 3);
        if(isWater(x, y) || blocked(x, y, 3.6) || !rasterRect(x, y, 0, 8, 8, false)) continue;
        const q = query(x, y); if(!q.far && q.bar < 6.2) continue;
        (kind === "tree" ? S.trees : S.palms).push({ x, y, z:height(x, y), ry:R() * 6.28, h:kind === "tree" ? 9 + R() * 4 : 8 + R() * 5 });
      }
    }
  }
  // parks and the lawn's fringe: more trees where the infield is green
  for(let k = 0; k < NV; k += 7){
    if(WATER[k] || !INSIDE[k] || DB[k] < 26 || DB[k] > 120) continue;
    const r = Math.floor(k / NX), c = k % NX, x = X0 + c * STEP + R() * STEP, y = Y0 + r * STEP + R() * STEP;
    if(R() > 0.30 * dens || isWater(x, y) || blocked(x, y, 5) || !rasterRect(x, y, 0, 8, 8, false)) continue;
    (R() < 0.6 ? S.trees : S.palms).push({ x, y, z:height(x, y), ry:R() * 6.28, h:8 + R() * 5 });
  }
  // flower planters on the kerbside of the promenade
  for(let i = 0; i < n; i += Math.max(1, Math.round(19 / T.ds))){
    const side = -1, [x, y] = at(i, side, edge(i, side) + 3.6);
    if(isWater(x, y) || blocked(x, y, 1.5)) continue;
    S.planters.push({ x, y, z:height(x, y), ang:T.ang[i], c:i });
  }
  // marshal posts' companions: TV towers on the straights, big screens at corners
  for(const u of [0.045, 0.10, 0.20, 0.285, 0.40, 0.48, 0.56, 0.69, 0.78, 0.86, 0.95]){
    const i = nodeAt(u), side = outside(i), q0 = edge(i, side) + 7, [x, y] = at(i, side, q0);
    if(isWater(x, y) || blocked(x, y, 5)) continue;
    S.tv.push({ x, y, z:height(x, y), ang:T.ang[i], h:10 + R() * 2 }); addCircle(x, y, 6);
  }
  for(const [u, side] of [[0.010, 1], [0.075, outside(nodeAt(0.075))], [0.255, outside(nodeAt(0.255))], [0.665, outside(nodeAt(0.665))], [0.935, outside(nodeAt(0.935))]]){
    const i = nodeAt(u), st = S.stands.find(s => s.side === side && ((i - s.i0 + n) % n) <= s.span), off = (st ? st.off0 + st.depth : edge(i, side)) + 12, [x, y] = at(i, side, off);
    if(isWater(x, y) || blocked(x, y, 8)) continue;
    S.screens.push({ x, y, z:height(x, y), a0:T.ang[i], side, n:S.screens.length }); addCircle(x, y, 9);
  }
  // parked cars and a few buses in lots between the blocks; food stalls on the promenade
  for(let k = 0; k < 40 && S.cars.length < 380 * dens; k++){
    const i = nodeAt(R()), side = R() < 0.6 ? 1 : -1, off = edge(i, side) + 40 + R() * 90, [x, y] = at(i, side, off);
    if(isWater(x, y) || blocked(x, y, 12) || !rasterRect(x, y, T.ang[i], 30, 14, false)) continue;
    rasterRect(x, y, T.ang[i], 30, 14, true);
    for(let a = -12; a <= 12; a += 3.2) for(let b = -4.5; b <= 4.5; b += 4.5){ if(R() < 0.7){ const ca = Math.cos(T.ang[i]), sa = Math.sin(T.ang[i]); S.cars.push({ x:x + ca * a - sa * b, y:y + sa * a + ca * b, z:height(x, y), ry:T.ang[i] + (R() < 0.5 ? 0 : Math.PI), c:S.cars.length }); } }
    if(R() < 0.3) S.buses.push({ x:x + 4, y:y, z:height(x, y), ang:T.ang[i], c:S.buses.length });
  }
  for(let k = 0; k < 60 && S.stalls.length < 24; k++){
    const i = nodeAt(R()), side = -1, off = edge(i, side) + 14 + R() * 16, [x, y] = at(i, side, off);
    if(isWater(x, y) || blocked(x, y, 7) || !rasterRect(x, y, T.ang[i], 14, 12, false)) continue;
    rasterRect(x, y, T.ang[i], 14, 12, true); S.stalls.push({ x, y, z:height(x, y), ang:T.ang[i], c:S.stalls.length }); addCircle(x, y, 8);
  }
  // tyre walls behind the concrete on the outside of every corner of the lap
  S.tyres = [];
  { let i = 0; while(i < n){
      if(Math.abs(T.curv[i]) > 0.004){ let j = i; while(j < n && Math.abs(T.curv[j]) > 0.004) j++;
        if(j - i >= 3){ const side = outside(Math.round((i + j) / 2)); for(let k = i - 2; k <= j + 2; k++){ const [x, y] = at(k, side, edge(k, side) + 0.9);
          if(S.tyres.length < 520 && !isWater(x, y) && !blocked(x, y, 0.6)) S.tyres.push({ x, y, z:T.z[((k % n) + n) % n] - 0.1, side, c:S.tyres.length }); } }
        i = j; } else i++; } }
  // flag poles along the stands
  for(const st of S.stands){ for(let k = 0; k <= st.span; k += 6){ const i = (st.i0 + k) % n, [x, y] = at(i, st.side, st.off0 - 2.5); if(!isWater(x, y)) S.flagPoles.push({ x, y, z:height(x, y), h:8, ang:T.ang[i], c:k }); } }
  // fence posts for the catch fencing (the world builds the rails)
  P.stats.counts = { buildings:S.buildings.length, lamps:S.lamps.length, pylons:S.pylons.length, trees:S.trees.length, palms:S.palms.length, cars:S.cars.length, boats:S.boats.length, stands:S.stands.length, footbridges:S.footbridges.length, planters:S.planters.length, stalls:S.stalls.length };
  P.tm.total = Date.now() - t0;
  return P;
}

/* the audit: buildings against the track's barrier line and each other, structures against the water */
function auditSingapore(P, T){
  const o = { buildings:0, tooClose:0, minBar:1e9, overlapping:0, onWater:0, tallNear:0, treesTooClose:0, lampsInRoad:0, pylonsBad:0 };
  const S = P.structs;
  for(const b of S.buildings){
    o.buildings++;
    const rad = Math.hypot(b.w, b.d) / 2;
    // the four corners and the centre
    const ca = Math.cos(b.ang), sa = Math.sin(b.ang);
    for(const [a, c] of [[0, 0], [-1, -1], [1, -1], [1, 1], [-1, 1]]){
      const x = b.x + ca * a * b.w / 2 - sa * c * b.d / 2, y = b.y + sa * a * b.w / 2 + ca * c * b.d / 2, bar = P.clearance(x, y);
      o.minBar = Math.min(o.minBar, bar);
      if(bar < 6) o.tooClose++;
      if(b.h > 30 && bar < 30) o.tallNear++;
      if(P.isWater(x, y) && !b.onWater) o.onWater++;
    }
  }
  for(const t of S.trees.concat(S.palms)) if(P.clearance(t.x, t.y) < 3.5) o.treesTooClose++;
  for(const l of S.lamps) if(P.clearance(l.x, l.y) < 1.5) o.lampsInRoad++;
  for(const p of S.pylons) if(P.clearance(p.x, p.y) < 0.5) o.pylonsBad++;
  return o;
}

export { planSingapore, auditSingapore, WATER_Y, SEABED };
