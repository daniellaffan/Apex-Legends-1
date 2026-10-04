import { fbm, rng } from './suzuka-plan.js';

/* ---------- Baku: the plan ----------------------------------------------------------
   Pure numbers, no three.js, so it runs in Node (scripts/baku-audit.mjs). It decides: the ground (the Caspian along the
   seafront half of the lap, the boulevard, the old town inside the castle section, the new city round it), where every wall,
   tower, building, tree, stand, bridge and boat goes, and that none of it hides the road from the game's fixed overhead lens
   (35 degrees up from the south-east: a building of height h hides 1.414 h of ground behind it along the north-west diagonal).
   Side convention as everywhere: +1 is the right of the direction of travel, -1 the left. The lap is anticlockwise, so the
   infield is on the left; the sea is on the outside of the seafront half (the old land blobs put it there too).            */

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const hex = c => [parseInt(c.slice(1, 3), 16) / 255, parseInt(c.slice(3, 5), 16) / 255, parseInt(c.slice(5, 7), 16) / 255];
const mixC = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const GC = { sand:hex("#D8C8A0"), sand2:hex("#C8B48C"), pave:hex("#CFC4AE"), pave2:hex("#BFB29A"), lawn:hex("#6E9A4C"), lawn2:hex("#82AA58"), park:hex("#5E8C46"),
  old:hex("#BCA882"), block:hex("#B8A98A"), street:hex("#A89A80"), shore:hex("#E2D4AE"), seabed:hex("#2A7C96"), rock:hex("#A09078") };
const BAR = 2.6;
const SEA_Y = -3.3, SEABED = -8;                  // the Caspian is 3.3 m under the start straight

function planBaku(T, opts){
  opts = opts || {};
  const lite = opts.detail === 0, dens = lite ? 0.55 : 1;
  const n = T.n, half = T.half, R = rng(8123);
  const t0 = Date.now(), P = { stats:{}, tm:{} };
  const roOf = (i, side) => side >= 0 ? T.roR[i] : T.roL[i];
  const nodeAt = u => Math.round(((u % 1) + 1) % 1 * n) % n;
  const edge = (i, side) => half + roOf(((Math.round(i) % n) + n) % n, side) + BAR;
  const outside = i => { let c = 0; for(let k = -6; k <= 6; k++) c += T.curv[((i + k) % n + n) % n]; return c <= 0 ? 1 : -1; };
  const at = (i, side, off) => { i = ((Math.round(i) % n) + n) % n; return [T.x[i] + T.nx[i] * side * off, T.y[i] + T.ny[i] * side * off]; };
  const inU = (u, a, b) => a <= b ? (u >= a && u <= b) : (u >= a || u <= b);
  P.edge = edge; P.at = at; P.nodeAt = nodeAt; P.outside = outside;
  const SEA = [0.80, 0.115], OLD = [0.485, 0.66];
  P.SEA = SEA; P.OLD = OLD;

  /* ---- segments hashed ---- */
  const CELL = 40, bb = T.bounds, PAD = 620, STEP = opts.step || (lite ? 22 : 14);
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

  const S = P.structs = { stands:[], buildings:[], lamps:[], trees:[], palms:[], pines:[], planters:[], footbridges:[], boats:[], cars:[], stalls:[], screens:[], tv:[],
    flagPoles:[], walls:[], towers:[], monuments:[], tyres:[], gulls:[], fountains:[], lawns:[], wheel:null, pit:null, pier:null, flame:null, carpet:null, govhouse:null, maiden:null, wave:null };

  /* ---- the ground: land with the old town rising, the Caspian along the seafront, a boulevard between ---- */
  const X0 = bb.minX - PAD, Y0 = bb.minY - PAD;
  const NX = Math.ceil((bb.w + 2 * PAD) / STEP) + 1, NY = Math.ceil((bb.h + 2 * PAD) / STEP) + 1, NV = NX * NY;
  const INSIDE = new Uint8Array(NV);
  { const sub = []; for(let i = 0; i < n; i += 2) sub.push(i);
    for(let r = 0; r < NY; r++){
      const y = Y0 + r * STEP + 0.013, xs = [];
      for(let a = 0; a < sub.length; a++){ const i = sub[a], j = sub[(a + 1) % sub.length], yi = T.y[i], yj = T.y[j];
        if((yi <= y && yj > y) || (yj <= y && yi > y)) xs.push(T.x[i] + (y - yi) / (yj - yi) * (T.x[j] - T.x[i])); }
      xs.sort((p, q) => p - q);
      for(let c = 0; c < NX; c++){ const x = X0 + c * STEP; let k = 0; while(k < xs.length && xs[k] < x) k++; INSIDE[r * NX + c] = k & 1; }
    } }
  const sub6 = []; for(let i = 0; i < n; i += 6) sub6.push(i);
  const sub12 = []; for(let i = 0; i < n; i += 10) sub12.push(i);
  const lieOf = (x, y) => { let zw = 0, ws = 0; for(const i of sub12){ const d2 = (x - T.x[i]) ** 2 + (y - T.y[i]) ** 2, w = 1 / (d2 + 14400); zw += w * T.z[i]; ws += w; } return zw / ws; };
  const H = new Float32Array(NV), COL = new Float32Array(NV * 3), WATER = new Uint8Array(NV), DB = new Float32Array(NV);
  for(let r = 0; r < NY; r++) for(let c = 0; c < NX; c++){
    const k = r * NX + c, x = X0 + c * STEP, y = Y0 + r * STEP;
    query(x, y);
    let qi = Q.i, qside = Q.side, qbar = Q.bar;
    if(Q.far){ let bd = Infinity, bi = 0; for(const i of sub12){ const d2 = (x - T.x[i]) ** 2 + (y - T.y[i]) ** 2; if(d2 < bd){ bd = d2; bi = i; } }
      const off = (x - T.x[bi]) * T.nx[bi] + (y - T.y[bi]) * T.ny[bi]; qi = bi; qside = off >= 0 ? 1 : -1; qbar = Math.sqrt(bd) - half - roOf(bi, qside) - BAR; }
    const bar = qbar, inside = INSIDE[k] === 1, u = qi / n;
    DB[k] = bar;
    // the sea: outside the loop, along the seafront half, beyond a boulevard that is wide mid-stretch and pinches out at its ends
    let sea = false;
    if(!inside && inU(u, SEA[0], SEA[1])){
      const span = SEA[1] >= SEA[0] ? SEA[1] - SEA[0] : 1 - SEA[0] + SEA[1], pos = ((u - SEA[0]) % 1 + 1) % 1 / span, ends = Math.min(sstep(0, 0.14, pos), sstep(0, 0.14, 1 - pos));
      const prom = 72 + 46 * fbm(x / 140, y / 140, 3, 2) + (1 - ends) * 700;
      if(bar > prom && qside > 0) sea = true;
    }
    WATER[k] = sea ? 1 : 0;
    const lie = lieOf(x, y), hills = (fbm(x / 260, y / 260, 5, 3) - 0.5) * 7;
    const z = sea ? SEABED : mix(Q.far ? lie : Q.z - 0.35, lie + hills, sstep(0, 280, bar));
    H[k] = z;
    let col;
    if(sea) col = mixC(GC.seabed, GC.shore, 0.15);
    else {
      const coast = !inside && inU(u, SEA[0], SEA[1]);
      if(coast){ col = mixC(GC.pave, GC.lawn, sstep(14, 30, bar) * (0.55 + 0.45 * fbm(x / 40, y / 40, 9, 2))); if(bar > 70) col = mixC(col, GC.shore, sstep(70, 120, bar) * 0.8); }
      else if(inside && inU(u, OLD[0], OLD[1])) col = mixC(GC.old, GC.sand2, fbm(x / 20, y / 20, 5, 3));
      else col = mixC(GC.block, GC.street, fbm(x / 22, y / 22, 11, 3));
      col = mixC(col, GC.pave2, 1 - sstep(0, 26, bar));
      col = mixC(col, GC.rock, sstep(0.62, 0.8, fbm(x / 60, y / 60, 17, 3)) * 0.4);
    }
    COL[k * 3] = col[0]; COL[k * 3 + 1] = col[1]; COL[k * 3 + 2] = col[2];
  }
  for(let pass = 0; pass < 2; pass++){
    const src = H.slice();
    for(let r = 1; r < NY - 1; r++) for(let c = 1; c < NX - 1; c++){ const k = r * NX + c; if(DB[k] < 3) continue; H[k] = (src[k] * 4 + src[k - 1] + src[k + 1] + src[k - NX] + src[k + NX]) / 8; }
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

  /* ---- the overhead lens: how tall may something stand here? (as in singapore-plan) ---- */
  const SH = Math.SQRT1_2;
  const maxH = (x, y, rad, thr, t0) => {
    thr = thr == null ? 11 : thr; let hit = 420; t0 = t0 || 0;
    for(let t = t0; t <= 420 && hit === 420; t += 5)
      for(const l of [-0.7, 0, 0.7]){ const px = x - SH * t + SH * l * rad, py = y - SH * t - SH * l * rad; if(gat(DB, px, py) < thr){ hit = t; break; } }
    return Math.max(0, hit - rad * 0.85) / 1.414 - 1.5;
  };
  // the same march, exact (the real distance to the road, not the coarse grid): for the walls and towers that hug the road
  const maxHx = (x, y, rad, thr, t0) => {
    let hit = 420;
    for(let t = t0; t <= 120 && hit === 420; t += 2)
      for(const l of [-0.7, 0, 0.7]){ const px = x - SH * t + SH * l * rad, py = y - SH * t - SH * l * rad; if(P.clearance(px, py) < thr){ hit = t; break; } }
    return Math.max(0, hit - rad * 0.85) / 1.414 - 1.0;
  };
  P.maxH = maxH;

  /* ---- 1. stands ---- */
  const stand = o => {
    const i0 = nodeAt(o.u0), i1 = nodeAt(o.u1), side = o.side, span = ((i1 - i0) % n + n) % n;
    let off0 = 0; for(let k = 0; k <= span; k++) off0 = Math.max(off0, edge(i0 + k, side));
    off0 += o.gap != null ? o.gap : 7;
    const st = Object.assign({ rows:12, rowD:0.95, rowH:0.46, roof:false, fill:0.8, col:"#9A8E78" }, o, { i0, i1, span, side, off0 });
    st.depth = st.rows * st.rowD; st.height = st.rows * st.rowH;
    for(let k = 0; k <= span; k += 3){ const [x, y] = at(i0 + k, side, off0 + st.depth / 2); if(isWater(x, y)) st.wet = true; }
    S.stands.push(st); addBand(i0, i1, side, off0 - 4, off0 + st.depth + (st.roof ? 6 : 4));
    return st;
  };
  stand({ name:"main", u0:0.945, u1:0.040, side:1, rows:14, rowD:1.0, rowH:0.5, roof:true, col:"#A8A090" });
  stand({ name:"t1", u0:0.098, u1:0.126, side:outside(nodeAt(0.108)), rows:12, col:"#4C78A8" });
  stand({ name:"t3", u0:0.250, u1:0.272, side:outside(nodeAt(0.262)), rows:10, col:"#B8704A" });
  stand({ name:"t4", u0:0.326, u1:0.346, side:outside(nodeAt(0.336)), rows:10, col:"#4A8A6A" });
  stand({ name:"t13", u0:0.606, u1:0.634, side:outside(nodeAt(0.619)), rows:12, roof:true, col:"#8A6AA8" });
  stand({ name:"t16", u0:0.730, u1:0.756, side:outside(nodeAt(0.745)), rows:10, col:"#C8A23A" });
  stand({ name:"t20", u0:0.872, u1:0.896, side:outside(nodeAt(0.884)), rows:10, col:"#A84A4A" });
  { const ps = T.pitSide, i0 = nodeAt(0.975), i1 = nodeAt(0.040), span = ((i1 - i0) % n + n) % n, off0 = half + T.pitW + 15;
    S.pit = { i0, i1, span, side:ps, off0, depth:20 }; addBand(i0, i1, ps, half, off0 + 20 + 70); }

  /* ---- 2. footbridges, over straights ---- */
  for(const u of [0.012, 0.185, 0.300, 0.395, 0.915, 0.840]){
    const i = nodeAt(u), eL = edge(i, -1) + 1.4, eR = edge(i, 1) + 1.4, pl = at(i, -1, eL), pr = at(i, 1, eR);
    let ok = Math.abs(T.curv[i]) < 0.002;
    for(const b of bands){ const k = ((i - b.i0) % n + n) % n; if(k <= b.span + 12) ok = false; }
    if(isWater(pl[0], pl[1]) || isWater(pr[0], pr[1])) ok = false;
    if(!ok) continue;
    S.footbridges.push({ i, pl, pr, z:T.z[i], ang:T.ang[i], len:eL + eR }); addCircle(pl[0], pl[1], 3.5); addCircle(pr[0], pr[1], 3.5);
  }

  /* ---- 3. the old city wall: on the infield side along the castle section, as low as it has to be to keep the road in view ---- */
  { const i0 = nodeAt(OLD[0]), i1 = nodeAt(OLD[1]), span = ((i1 - i0) % n + n) % n, side = -1;
    let lastT = -99;
    for(let k = 0; k < span; k++){
      const i = (i0 + k) % n, off = edge(i, side) + 2.2, [x, y] = at(i, side, off);
      const cap = clamp(maxHx(x, y, 2.5, -1.5, 4), 1.2, 9.0);
      S.walls.push({ x, y, z:T.z[i] - 0.3, i, ang:T.ang[i], h:cap });
      if(k - lastT >= Math.round(52 / T.ds)){ const [tx, ty] = at(i, side, off + 1.5); S.towers.push({ x:tx, y:ty, z:T.z[i] - 0.3, h:Math.min(clamp(maxHx(tx, ty, 4.5, -1.5, 6), 3.5, 13), cap + 4), r:4.4 }); lastT = k; }
    }
    addBand(i0, i1, side, 0, edge(i0, side) + 9);
  }

  /* ---- 4. buildings on an occupancy grid; heights capped by the lens ---- */
  const OC = 5, ONX = Math.ceil((NX * STEP) / OC) + 1, ONY = Math.ceil((NY * STEP) / OC) + 1, OCC = new Uint8Array(ONX * ONY);
  const rasterRect = (cx, cy, ang, w, d, set) => {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    for(let a = -w / 2; a <= w / 2 + OC * 0.5; a += OC * 0.6) for(let b = -d / 2; b <= d / 2 + OC * 0.5; b += OC * 0.6){
      const x = cx + ca * Math.min(a, w / 2) - sa * Math.min(b, d / 2), y = cy + sa * Math.min(a, w / 2) + ca * Math.min(b, d / 2);
      const c = Math.floor((x - X0) / OC), r = Math.floor((y - Y0) / OC);
      if(c < 0 || r < 0 || c >= ONX || r >= ONY) return set ? true : false;
      if(set) OCC[r * ONX + c] = 1; else if(OCC[r * ONX + c]) return false;
    }
    return true;
  };
  for(const e of excl) rasterRect(e.x, e.y, 0, e.r * 2, e.r * 2, true);
  for(const q of rects) rasterRect(q.cx, q.cy, Math.atan2(q.uy, q.ux), q.a1 - q.a0, q.b1 - q.b0, true);
  const addBuilding = b => {
    const gap = b.gap != null ? b.gap : 12;
    if(!rasterRect(b.x, b.y, b.ang, b.w + gap, b.d + gap, false)) return false;
    if(blocked(b.x, b.y, Math.hypot(b.w, b.d) / 2 * 0.8)) return false;
    { const q = query(b.x, b.y); if(!q.far && q.bar < 12) return false; }
    { const allow = maxH(b.x, b.y, Math.hypot(b.w, b.d) / 2);
      if(b.landmark ? allow < b.h * 0.92 : allow < (b.type === "old" ? 5.5 : 8)) return false;
      if(b.h > allow){ b.h = allow; if(b.h < 14 && ["glass", "soviet"].includes(b.type)) b.type = "stone"; } }
    if(wetNear(b.x, b.y, Math.max(b.w, b.d) / 2)) return false;
    { const ca = Math.cos(b.ang), sa = Math.sin(b.ang); for(const [a, c] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]) if(isWater(b.x + ca * a * b.w / 2 - sa * c * b.d / 2, b.y + sa * a * b.w / 2 + ca * c * b.d / 2)) return false; }
    rasterRect(b.x, b.y, b.ang, b.w + gap, b.d + gap, true);
    b.z = height(b.x, b.y);
    S.buildings.push(b); return true;
  };
  P.addBuilding = addBuilding;
  const near = (u, side, off) => { const i = nodeAt(u); const [x, y] = at(i, side, off); return { x, y, i, ang:T.ang[i] }; };
  // monuments: allowed to stand within the lens's shadow (they are the circuit's own landmarks; the cutaway handles them)
  const monument = (type, c, w, d, h, extra) => { rasterRect(c.x, c.y, c.ang, w + 8, d + 8, true); addCircle(c.x, c.y, Math.hypot(w, d) / 2); const m = Object.assign({ type, x:c.x, y:c.y, ang:c.ang, w, d, h, z:height(c.x, c.y) }, extra || {}); S.monuments.push(m); return m; };
  { const i = nodeAt(0.545), [x, y] = at(i, -1, edge(i, -1) + 30); S.maiden = monument("maiden", { x, y, ang:T.ang[i] }, 17, 17, 28); }
  { const i = nodeAt(0.735), [x, y] = at(i, 1, edge(i, 1) + 70); S.govhouse = monument("govhouse", { x, y, ang:T.ang[i] }, 90, 34, 30); }
  { let spot = null; for(const u of [0.95, 0.99, 0.02, 0.07, 0.84, 0.90]) for(const off of [62, 74, 88, 104, 130, 160, 190]){ if(spot) break; const i = nodeAt(u), [x, y] = at(i, 1, off); if(!isWater(x, y) && !isWater(...at(i, 1, off + 24)) && !blocked(x, y, 36) && rasterRect(x, y, T.ang[i], 84, 34, false)) spot = { x, y, ang:T.ang[i] }; }
    if(spot) S.carpet = monument("carpet", spot, 80, 30, 22); }
  // the three flame-shaped towers: as tall as they can be (up to 190 m), on the highest land that allows 90 m or more
  { let best = null;
    for(const side of [-1, 1]) for(let u = 0.05; u < 1; u += 0.03) for(const off of [160, 240, 320, 420]){ const [x, y] = at(nodeAt(u), side, off), i = nodeAt(u);
      if(isWater(x, y) || blocked(x, y, 50) || !rasterRect(x, y, 0, 130, 70, false)) continue; const q = query(x, y); if(!q.far && q.bar < 150) continue;
      const allow = maxH(x, y, 60), score = Math.min(allow, 190) + height(x, y) * 1.5; if(allow >= 90 && (!best || score > best.score)) best = { x, y, ang:T.ang[i], h:Math.min(190, allow), score }; }
    if(best){ S.flame = best; rasterRect(best.x, best.y, 0, 150, 90, true); addCircle(best.x, best.y, 70); } }
  // the wave-shaped cultural centre, generic: a white swoop
  { let best = null;
    for(const side of [1, -1]) for(let u = 0.3; u < 0.95; u += 0.05) for(const off of [150, 220, 300]){ const [x, y] = at(nodeAt(u), side, off), i = nodeAt(u);
      if(isWater(x, y) || blocked(x, y, 45) || !rasterRect(x, y, i, 100, 70, false)) continue; const allow = maxH(x, y, 50); if(allow >= 30 && !best) best = { x, y, ang:T.ang[i] }; }
    if(best){ S.wave = monument("wave", best, 100, 60, 28); } }
  // a lawn with fountains on the boulevard, and a pier with yachts
  { const i = nodeAt(0.90), side = 1; const [x, y] = at(i, side, edge(i, side) + 46); S.lawns.push({ x, y, ang:T.ang[i], w:170, d:50 }); addRect(x, y, T.ang[i], -90, 90, -28, 28);
    for(let k = -2; k <= 2; k++){ const fx = x + Math.cos(T.ang[i]) * k * 34, fy = y + Math.sin(T.ang[i]) * k * 34; S.fountains.push({ x:fx, y:fy, z:height(fx, fy) }); } }
  { let tried = 0; for(const u of [0.96, 0.02, 0.88, 0.07, 0.84]){ if(S.pier) break; const i = nodeAt(u); for(let off = 60; off < 260 && !S.pier; off += 10){ const [x, y] = at(i, 1, off), [x2, y2] = at(i, 1, off + 60); if(!isWater(x, y) && isWater(x2, y2) && !blocked(x, y, 6)){ S.pier = { x, y, ang:Math.atan2(y2 - y, x2 - x), len:150, side:1, i }; tried++; } } } }
  // the observation wheel, on the boulevard
  { const i = nodeAt(0.86), side = 1; for(let off = edge(i, side) + 60; off < edge(i, side) + 200; off += 15){ const [x, y] = at(i, side, off); if(!isWater(x, y) && !blocked(x, y, 40) && rasterRect(x, y, 0, 60, 60, false)){ S.wheel = { x, y, z:height(x, y), ang:T.ang[i] + Math.PI / 2, r:34 }; rasterRect(x, y, 0, 70, 70, true); addCircle(x, y, 38); break; } } }

  /* the field: the old town, stone streets, soviet slabs, glass towers far out */
  const kinds = [];
  { const step = lite ? 36 : 20;
    for(let y = Y0 + 12; y < Y0 + NY * STEP - 12; y += step) for(let x = X0 + 12; x < X0 + NX * STEP - 12; x += step){
      const px = x + (R() - 0.5) * step * 0.8, py = y + (R() - 0.5) * step * 0.8;
      const k = Math.floor((py - Y0) / STEP) * NX + Math.floor((px - X0) / STEP);
      if(k < 0 || k >= NV || WATER[k] === 1) continue;
      const q = query(px, py), bar = q.far ? 600 : q.bar, u = q.far ? 0.5 : q.i / n; if(bar < 12 || bar > 640) continue;
      const inside = INSIDE[k] === 1, oldTown = inside && inU(u, OLD[0] - 0.01, OLD[1] + 0.02) && bar < 260;
      const coast = !inside && inU(u, SEA[0], SEA[1]) && bar < 130;
      if(coast) continue;                                                          // the boulevard
      const ang = q.far ? 0 : T.ang[q.i] + (oldTown ? (fbm(px / 40, py / 40, 3, 2) - 0.5) * 0.9 : 0), r = R(), nz = fbm(px / 170, py / 170, 7, 3);
      let type, w, d, h, gap = 12;
      if(oldTown){ type = "old"; w = 9 + R() * 9; d = 8 + R() * 6; h = 6 + R() * 4; gap = 6; }
      else if(bar < 60){ type = r < 0.55 ? "stone" : r < 0.8 ? "old" : "hotel"; w = type === "old" ? 14 + R() * 10 : 28 + R() * 16; d = type === "old" ? 10 : 16 + R() * 6; h = type === "old" ? 7 + R() * 3 : 12 + R() * 8; gap = type === "old" ? 8 : 12; }
      else if(bar < 150){ type = r < 0.5 ? "stone" : r < 0.75 ? "soviet" : r < 0.9 ? "hotel" : "old"; w = type === "soviet" ? 54 + R() * 14 : 26 + R() * 18; d = type === "soviet" ? 13 : 16 + R() * 8; h = type === "soviet" ? 28 + R() * 18 : type === "stone" ? 14 + R() * 10 : type === "old" ? 8 : 24 + R() * 20; }
      else { type = r < 0.42 ? "stone" : r < 0.66 ? "soviet" : r < 0.80 ? "glass" : r < 0.9 ? "hotel" : "stone"; const grow = sstep(120, 450, bar); w = type === "soviet" ? 56 + R() * 12 : 26 + R() * 16; d = type === "soviet" ? 13 : 24 + R() * 14; h = type === "glass" ? 55 + grow * 55 + nz * 40 + R() * 25 : type === "soviet" ? 30 + R() * 25 : 16 + R() * 16; }
      if(R() > (oldTown ? 0.92 : bar < 60 ? 0.88 : 0.7) * dens + 0.05 * (1 - dens)) continue;
      if(addBuilding({ type, x:px, y:py, ang, w, d, h, seed:(R() * 1e6) | 0, gap })) kinds.push(type);
    } }
  P.stats.buildings = S.buildings.length;
  P.stats.kinds = kinds.reduce((a, k) => (a[k] = (a[k] || 0) + 1, a), {});
  P.tm.buildings = Date.now() - t0;

  /* ---- 5. street furniture and planting ---- */
  for(let i = 0; i < n; i += Math.max(1, Math.round(26 / T.ds))) for(const side of [-1, 1]){
    const [x, y] = at(i, side, edge(i, side) + 7); if(isWater(x, y) || blocked(x, y, 1.5) || !rasterRect(x, y, 0, 3, 3, false)) continue;
    S.lamps.push({ x, y, z:height(x, y), ang:T.ang[i] + (side > 0 ? Math.PI : 0) });
  }
  for(let i = 0; i < n; i += Math.max(1, Math.round(14 / T.ds))) for(const side of [-1, 1]){
    const u = i / n, seafront = side > 0 && inU(u, SEA[0], SEA[1]), base = edge(i, side) + 4;
    for(const off of [base + 3, base + 11, base + 20]){
      if(R() > (seafront ? 0.8 : 0.5) * dens + 0.1) continue;
      const [x, y] = at(i, side, off + (R() - 0.5) * 3);
      if(isWater(x, y) || blocked(x, y, 3.4) || !rasterRect(x, y, 0, 7, 7, false)) continue;
      const q = query(x, y); if(!q.far && q.bar < 5.5) continue;
      const rec = { x, y, z:height(x, y), ry:R() * 6.28, h:0 };
      if(seafront && R() < 0.7){ rec.h = 9 + R() * 5; S.palms.push(rec); } else if(R() < 0.35){ rec.h = 11 + R() * 6; S.pines.push(rec); } else { rec.h = 8 + R() * 4; S.trees.push(rec); }
    }
  }
  // gardens on the lawns, and low shrubs: a few in the old town's lanes
  for(const lw of S.lawns){ for(let k = 0; k < 60 * dens; k++){ const a = (R() - 0.5) * lw.w, b = (R() - 0.5) * lw.d, x = lw.x + Math.cos(lw.ang) * a - Math.sin(lw.ang) * b, y = lw.y + Math.sin(lw.ang) * a + Math.cos(lw.ang) * b;
    if(isWater(x, y) || S.fountains.some(f => Math.hypot(f.x - x, f.y - y) < 6)) continue; (R() < 0.45 ? S.palms : S.trees).push({ x, y, z:height(x, y), ry:R() * 6.28, h:8 + R() * 5 }); } }
  for(let i = 0; i < n; i += Math.max(1, Math.round(21 / T.ds))){ const side = -1, [x, y] = at(i, side, edge(i, side) + 3.6); if(isWater(x, y) || blocked(x, y, 1.5)) continue; S.planters.push({ x, y, z:height(x, y), ang:T.ang[i] }); }
  for(const u of [0.045, 0.14, 0.23, 0.30, 0.40, 0.46, 0.60, 0.69, 0.78, 0.86, 0.95]){
    const i = nodeAt(u), side = outside(i), [x, y] = at(i, side, edge(i, side) + 7);
    if(isWater(x, y) || blocked(x, y, 5)) continue; S.tv.push({ x, y, z:height(x, y), ang:T.ang[i], h:10 + R() * 2 }); addCircle(x, y, 6);
  }
  for(const [u, side] of [[0.010, 1], [0.110, outside(nodeAt(0.110))], [0.262, outside(nodeAt(0.262))], [0.619, outside(nodeAt(0.619))], [0.884, outside(nodeAt(0.884))]]){
    const i = nodeAt(u), st = S.stands.find(s => s.side === side && ((i - s.i0 + n) % n) <= s.span), off = (st ? st.off0 + st.depth : edge(i, side)) + 12, [x, y] = at(i, side, off);
    if(isWater(x, y) || blocked(x, y, 8)) continue; S.screens.push({ x, y, z:height(x, y), a0:T.ang[i], side, n:S.screens.length }); addCircle(x, y, 9);
  }
  for(let k = 0; k < 40 && S.cars.length < 260 * dens; k++){
    const i = nodeAt(R()), side = R() < 0.6 ? 1 : -1, [x, y] = at(i, side, edge(i, side) + 40 + R() * 90);
    if(isWater(x, y) || blocked(x, y, 12) || !rasterRect(x, y, T.ang[i], 30, 14, false)) continue; rasterRect(x, y, T.ang[i], 30, 14, true);
    for(let a = -12; a <= 12; a += 3.2) for(let b = -4.5; b <= 4.5; b += 4.5) if(R() < 0.7){ const ca = Math.cos(T.ang[i]), sa = Math.sin(T.ang[i]); S.cars.push({ x:x + ca * a - sa * b, y:y + sa * a + ca * b, z:height(x, y), ry:T.ang[i] + (R() < 0.5 ? 0 : Math.PI) }); }
  }
  for(let k = 0; k < 60 && S.stalls.length < 20; k++){
    const i = nodeAt(R()), side = R() < 0.6 ? 1 : -1, [x, y] = at(i, side, edge(i, side) + 14 + R() * 18);
    if(isWater(x, y) || blocked(x, y, 7) || !rasterRect(x, y, T.ang[i], 14, 12, false)) continue; rasterRect(x, y, T.ang[i], 14, 12, true); S.stalls.push({ x, y, z:height(x, y), ang:T.ang[i], c:S.stalls.length }); addCircle(x, y, 8);
  }
  for(const st of S.stands) for(let k = 0; k <= st.span; k += 6){ const i = (st.i0 + k) % n, [x, y] = at(i, st.side, st.off0 - 2.5); if(!isWater(x, y)) S.flagPoles.push({ x, y, z:height(x, y), h:8, ang:T.ang[i], c:k }); }
  // tyre walls behind the concrete on the outside of the corners
  { let i = 0; while(i < n){ if(Math.abs(T.curv[i]) > 0.004){ let j = i; while(j < n && Math.abs(T.curv[j]) > 0.004) j++;
        if(j - i >= 3){ const side = outside(Math.round((i + j) / 2)); for(let k = i - 2; k <= j + 2; k++){ const [x, y] = at(k, side, edge(k, side) + 0.9); if(S.tyres.length < 520 && !isWater(x, y) && !blocked(x, y, 0.6)) S.tyres.push({ x, y, z:T.z[((k % n) + n) % n] - 0.1, c:S.tyres.length }); } }
        i = j; } else i++; } }
  // the sea's boats, and the gulls
  { const spots = []; for(let r = 4; r < NY - 4; r += 4) for(let c = 4; c < NX - 4; c += 4){ const k = r * NX + c; if(WATER[k] && DB[k] > 140) spots.push([X0 + c * STEP, Y0 + r * STEP]); }
    const take = (cnt, minD, list) => { let tries = 0; while(list.length < cnt && tries++ < 400 && spots.length){ const s = spots[Math.floor(R() * spots.length)]; if(list.every(o => Math.hypot(o.x - s[0], o.y - s[1]) > minD)) list.push({ x:s[0], y:s[1] }); } };
    take(Math.round(12 * dens), 60, S.boats); S.boats.forEach((b, k) => { b.a = R() * 6.28; b.r = 20 + R() * 40; b.sp = (0.03 + R() * 0.05) * (R() < 0.5 ? -1 : 1); b.c = k; b.kind = k % 4 === 3 ? 2 : k % 2; });
    for(let k = 0; k < 26 * dens; k++){ const s = spots.length ? spots[Math.floor(R() * spots.length)] : [bb.minX, bb.minY]; S.gulls.push({ x:s[0], y:s[1], r:30 + R() * 90, h:18 + R() * 60, a:R() * 6.28, sp:(0.12 + R() * 0.2) * (R() < 0.5 ? -1 : 1), ph:R() * 6.28 }); }
    P.stats.waterSpots = spots.length; }
  P.stats.counts = { buildings:S.buildings.length, monuments:S.monuments.length, walls:S.walls.length, towers:S.towers.length, lamps:S.lamps.length, trees:S.trees.length, palms:S.palms.length, pines:S.pines.length, stands:S.stands.length, footbridges:S.footbridges.length, tyres:S.tyres.length, boats:S.boats.length, gulls:S.gulls.length };
  P.tm.total = Date.now() - t0;
  return P;
}

/* the audit: buildings against the barrier line, each other, the water and the overhead lens's shadows */
function auditBaku(P, T){
  const o = { buildings:0, tooClose:0, minBar:1e9, overlapping:0, narrowStreets:0, onWater:0, occluding:0, worstCover:0, treesTooClose:0, lampsInRoad:0, wallsInRoad:0, wallShadowOnRoad:0, monumentsInShadow:0 };
  const S = P.structs, SH = Math.SQRT1_2;
  const shadowHits = (x, y, rad, h, t0, thr) => { thr = thr == null ? 5 : thr; for(let t = t0; t <= t0 + 1.414 * h; t += 3) for(const l of [-0.6, 0, 0.6]){ if(P.clearance(x - SH * t + SH * l * rad, y - SH * t - SH * l * rad) < thr) return t0 + 1.414 * h - t; } return 0; };
  for(const b of S.buildings){
    o.buildings++; const ca = Math.cos(b.ang), sa = Math.sin(b.ang);
    for(const [a, c] of [[0, 0], [-1, -1], [1, -1], [1, 1], [-1, 1]]){
      const x = b.x + ca * a * b.w / 2 - sa * c * b.d / 2, y = b.y + sa * a * b.w / 2 + ca * c * b.d / 2, bar = P.clearance(x, y);
      o.minBar = Math.min(o.minBar, bar); if(bar < 6) o.tooClose++; if(P.isWater(x, y)) o.onWater++;
    }
    const rad = Math.hypot(b.w, b.d) / 2, cover = shadowHits(b.x, b.y, rad, b.h, rad * 0.85); if(cover > 0){ o.occluding++; o.worstCover = Math.max(o.worstCover, cover); }
  }
  { const H2 = new Map(), key = (x, y) => Math.floor(x / 60) + "," + Math.floor(y / 60);
    for(const b of S.buildings){ const r = Math.hypot(b.w, b.d) / 2 + 8; for(let x = b.x - r; x <= b.x + r + 60; x += 60) for(let y = b.y - r; y <= b.y + r + 60; y += 60){ const k = key(x, y); if(!H2.has(k)) H2.set(k, []); H2.get(k).push(b); } }
    const inRect = (b, x, y, g) => { const dx = x - b.x, dy = y - b.y, c = Math.cos(b.ang), s = Math.sin(b.ang); return Math.abs(dx * c + dy * s) < b.w / 2 + g && Math.abs(-dx * s + dy * c) < b.d / 2 + g; };
    for(const b of S.buildings){ const c = Math.cos(b.ang), s = Math.sin(b.ang); let ov = false, nr = false;
      for(let a = -b.w / 2; a <= b.w / 2 && !ov; a += 3) for(let d = -b.d / 2; d <= b.d / 2; d += 3){ const x = b.x + c * a - s * d, y = b.y + s * a + c * d;
        for(const q of H2.get(key(x, y)) || []) if(q !== b){ if(inRect(q, x, y, 0)) ov = true; else if(inRect(q, x, y, (b.gap != null ? b.gap : 12) / 2 - 0.6 + (q.gap != null ? q.gap : 12) / 2 - 0.6 > 8 ? 4 : 2)) nr = true; } }
      if(ov) o.overlapping++; else if(nr) o.narrowStreets++; } }
  for(const w of S.walls){ if(P.clearance(w.x, w.y) < 0.8) o.wallsInRoad++; if(shadowHits(w.x, w.y, 2.5, w.h, 3.2, -1.5) > 0) o.wallShadowOnRoad++; }
  for(const m of S.monuments) if(shadowHits(m.x, m.y, Math.hypot(m.w, m.d) / 2, m.h, Math.hypot(m.w, m.d) / 2 * 0.85) > 0) o.monumentsInShadow++;
  for(const t of S.trees.concat(S.palms, S.pines)) if(P.clearance(t.x, t.y) < 3.5) o.treesTooClose++;
  for(const l of S.lamps) if(P.clearance(l.x, l.y) < 1.5) o.lampsInRoad++;
  return o;
}

export { planBaku, auditBaku, SEA_Y, SEABED };
