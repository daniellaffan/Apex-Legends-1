import { fbm, rng } from './suzuka-plan.js';

/* ---------- Monza: the plan ----------------------------------------------------------
   Pure numbers, no three.js (scripts/monza-audit.mjs). The royal park: tall mature woodland with clearings and gravel avenues
   round a clockwise circuit; the ruined banking of the old oval (two stretches, and the flyover the road passes under before
   the Ascari chicane); stands (a huge one across from the pits, one on the inside of the Parabolica exit), the pit building and
   paddock, campers' tents, car parks, a park wall with gate pillars, a royal villa far in the trees.
   THE OVERHEAD LENS: the game's camera is fixed (35 degrees up from the south-east), so anything of height h hides 1.414 h of
   ground behind it along the north-west diagonal. Trees are what could hide the road here, so every tree's height is capped by
   `maxH` (a tall wood on the north-west side of the road, a low one on the south-east side), and the cutaway shader dissolves
   whatever still stands in the way of the car.
   Side convention as everywhere: +1 is the right of the direction of travel. The lap is CLOCKWISE, so the infield is on the right
   (the pits too) and the outside of a right-hand corner is the left.                                                      */

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const hex = c => [parseInt(c.slice(1, 3), 16) / 255, parseInt(c.slice(3, 5), 16) / 255, parseInt(c.slice(5, 7), 16) / 255];
const mixC = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const GC = { lawn:hex("#7DA24E"), lawn2:hex("#92B45A"), gold:hex("#B8B070"), wood:hex("#3E6A34"), wood2:hex("#2E5A2C"), floor:hex("#4A6A36"), gravel:hex("#C8BC98"), verge:hex("#9AAE62"),
  car:hex("#A8A494"), dirt:hex("#8A7A58"), pave:hex("#B8B2A0") };
const BAR = 2.6;

function planMonza(T, opts){
  opts = opts || {};
  const lite = opts.detail === 0, dens = lite ? 0.5 : 1;
  const n = T.n, half = T.half, R = rng(2917);
  const t0 = Date.now(), P = { stats:{}, tm:{} };
  const roOf = (i, side) => side >= 0 ? T.roR[i] : T.roL[i];
  const nodeAt = u => Math.round(((u % 1) + 1) % 1 * n) % n;
  const edge = (i, side) => half + roOf(((Math.round(i) % n) + n) % n, side) + BAR;
  const outside = i => { let c = 0; for(let k = -6; k <= 6; k++) c += T.curv[((i + k) % n + n) % n]; return c <= 0 ? 1 : -1; };
  const at = (i, side, off) => { i = ((Math.round(i) % n) + n) % n; return [T.x[i] + T.nx[i] * side * off, T.y[i] + T.ny[i] * side * off]; };
  P.edge = edge; P.at = at; P.nodeAt = nodeAt; P.outside = outside;

  /* ---- segments hashed ---- */
  const CELL = 40, bb = T.bounds, PAD = 700, STEP = opts.step || (lite ? 24 : 16);
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

  const S = P.structs = { stands:[], buildings:[], trees:[], pines:[], shrubs:[], lamps:[], footbridges:[], banks:[], flyover:null, walls:[], pillars:[], tents:[], paddock:[], trucks:[], paths:[], ponds:[],
    cars:[], stalls:[], screens:[], tv:[], flagPoles:[], tyres:[], villa:null, pit:null, birds:[], blimp:null, tentVillage:null, fountains:[], pier:null };

  /* ---- the ground: flat park with a gentle lie; lawns, woods, gravel ---- */
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
  const sub10 = []; for(let i = 0; i < n; i += 10) sub10.push(i);
  const lieOf = (x, y) => { let zw = 0, ws = 0; for(const i of sub10){ const d2 = (x - T.x[i]) ** 2 + (y - T.y[i]) ** 2, w = 1 / (d2 + 14400); zw += w * T.z[i]; ws += w; } return zw / ws; };
  /* how wooded the ground is at a point: groves and clearings at a scale of a hundred metres or two (0 = open lawn, 1 = dense wood) */
  const woodAt = (x, y) => sstep(0.36, 0.60, fbm(x / 170, y / 170, 5, 3)) * (0.75 + 0.25 * fbm(x / 60, y / 60, 9, 2));
  const H = new Float32Array(NV), COL = new Float32Array(NV * 3), DB = new Float32Array(NV);
  for(let r = 0; r < NY; r++) for(let c = 0; c < NX; c++){
    const k = r * NX + c, x = X0 + c * STEP, y = Y0 + r * STEP;
    query(x, y);
    let qbar = Q.bar, qz = Q.z;
    if(Q.far){ let bd = Infinity, bi = 0; for(const i of sub10){ const d2 = (x - T.x[i]) ** 2 + (y - T.y[i]) ** 2; if(d2 < bd){ bd = d2; bi = i; } }
      const off = (x - T.x[bi]) * T.nx[bi] + (y - T.y[bi]) * T.ny[bi], sd = off >= 0 ? 1 : -1; qbar = Math.sqrt(bd) - half - roOf(bi, sd) - BAR; qz = T.z[bi]; }
    DB[k] = qbar;
    const lie = lieOf(x, y), hills = (fbm(x / 300, y / 300, 5, 3) - 0.5) * 3.2;
    H[k] = mix(Q.far ? lie : qz - 0.35, lie + hills, sstep(0, 220, qbar));
    const w = woodAt(x, y), open = 1 - w;
    let col = mixC(GC.lawn, GC.lawn2, fbm(x / 40, y / 40, 3, 2));
    col = mixC(col, GC.gold, sstep(0.55, 0.8, fbm(x / 90, y / 90, 7, 2)) * 0.5);
    col = mixC(col, mixC(GC.wood, GC.wood2, fbm(x / 30, y / 30, 11, 2)), w * sstep(8, 30, qbar));
    col = mixC(col, GC.verge, 1 - sstep(0, 22, qbar));
    col = mixC(col, GC.gravel, (1 - sstep(0, 5, qbar)) * 0.5);
    COL[k * 3] = col[0]; COL[k * 3 + 1] = col[1]; COL[k * 3 + 2] = col[2];
  }
  for(let pass = 0; pass < 2; pass++){
    const src = H.slice();
    for(let r = 1; r < NY - 1; r++) for(let c = 1; c < NX - 1; c++){ const k = r * NX + c; if(DB[k] < 3) continue; H[k] = (src[k] * 4 + src[k - 1] + src[k + 1] + src[k - NX] + src[k + NX]) / 8; }
  }
  const G = { X0, Y0, STEP, NX, NY, H, COL, DB, INSIDE };
  P.grid = G;
  const gat = (A, x, y) => {
    const fx = clamp((x - X0) / STEP, 0, NX - 1.001), fy = clamp((y - Y0) / STEP, 0, NY - 1.001);
    const c = Math.floor(fx), r = Math.floor(fy), u = fx - c, v = fy - r, k = r * NX + c;
    return (A[k] * (1 - u) + A[k + 1] * u) * (1 - v) + (A[k + NX] * (1 - u) + A[k + NX + 1] * u) * v;
  };
  const height = (x, y) => gat(H, x, y);
  P.height = height; P.woodAt = woodAt;
  P.tm.ground = Date.now() - t0;

  const SH = Math.SQRT1_2;
  const maxH = (x, y, rad, thr, t0b) => {
    thr = thr == null ? 11 : thr; let hit = 420; t0b = t0b || 0;
    for(let t = t0b; t <= 420 && hit === 420; t += 5)
      for(const l of [-0.7, 0, 0.7]){ const px = x - SH * t + SH * l * rad, py = y - SH * t - SH * l * rad; if(gat(DB, px, py) < thr){ hit = t; break; } }
    return Math.max(0, hit - rad * 0.85) / 1.414 - 1.5;
  };
  P.maxH = maxH;

  /* ---- 1. stands ---- */
  const stand = o => {
    const i0 = nodeAt(o.u0), i1 = nodeAt(o.u1), side = o.side, span = ((i1 - i0) % n + n) % n;
    let off0 = 0; for(let k = 0; k <= span; k++) off0 = Math.max(off0, edge(i0 + k, side));
    off0 += o.gap != null ? o.gap : 7;
    const st = Object.assign({ rows:12, rowD:0.95, rowH:0.46, roof:false, fill:0.85, col:"#A8A290" }, o, { i0, i1, span, side, off0 });
    st.depth = st.rows * st.rowD; st.height = st.rows * st.rowH;
    S.stands.push(st); addBand(i0, i1, side, off0 - 4, off0 + st.depth + (st.roof ? 6 : 4));
    return st;
  };
  stand({ name:"main", u0:0.935, u1:0.050, side:-T.pitSide, rows:18, rowD:1.0, rowH:0.52, roof:true, col:"#B8B2A0", gap:9 });                     // the big one, across from the pits
  stand({ name:"rettifilo", u0:0.100, u1:0.126, side:outside(nodeAt(0.112)), rows:14, rowD:1.0, rowH:0.5, col:"#C8442A" });
  stand({ name:"grande", u0:0.178, u1:0.214, side:outside(nodeAt(0.196)), rows:12, col:"#2E6AB8" });
  stand({ name:"roggia", u0:0.308, u1:0.332, side:outside(nodeAt(0.320)), rows:12, col:"#C8442A" });
  stand({ name:"lesmo", u0:0.392, u1:0.412, side:outside(nodeAt(0.400)), rows:10, col:"#3A8A5A" });
  stand({ name:"ascari", u0:0.636, u1:0.662, side:outside(nodeAt(0.648)), rows:12, roof:true, col:"#C8442A" });
  stand({ name:"parab-in", u0:0.872, u1:0.912, side:-outside(nodeAt(0.890)), rows:14, rowD:1.0, rowH:0.5, roof:true, col:"#C8442A" });       // on the inside of the Parabolica exit
  stand({ name:"parab-out", u0:0.828, u1:0.852, side:outside(nodeAt(0.84)), rows:10, col:"#2E6AB8" });
  { const ps = T.pitSide, i0 = nodeAt(0.962), i1 = nodeAt(0.058), span = ((i1 - i0) % n + n) % n, off0 = half + T.pitW + 15;
    S.pit = { i0, i1, span, side:ps, off0, depth:20 }; addBand(i0, i1, ps, half, off0 + 20 + 90); }

  /* ---- 2. the old banking: two stretches on the outside, and the flyover over the road before the Ascari chicane ---- */
  const bank = (u0, u1, o) => { const i0 = nodeAt(u0), i1 = nodeAt(u1), side = outside(Math.round((i0 + i1) / 2)), span = ((i1 - i0) % n + n) % n;
    let off0 = 0; for(let k = 0; k <= span; k++) off0 = Math.max(off0, edge(i0 + k, side)); off0 += o;
    const b = { i0, i1, span, side, off0, w:26, h:13 }; S.banks.push(b); addBand(i0, i1, side, off0 - 8, off0 + b.w + 10); return b; };
  bank(0.132, 0.172, 62); bank(0.690, 0.790, 78); bank(0.868, 0.918, 74);                    // the third is the one seen beyond the Parabolica exit
  { const i = nodeAt(0.628), eL = edge(i, -1), eR = edge(i, 1), pl = at(i, -1, eL + 2), pr = at(i, 1, eR + 2);
    S.flyover = { i, pl, pr, z:T.z[i], ang:T.ang[i], len:eL + eR + 4, w:18 }; addBand((i - 6 + n) % n, (i + 6) % n, -1, 0, eL + 26); addBand((i - 6 + n) % n, (i + 6) % n, 1, 0, eR + 26); }

  /* ---- 3. footbridges (steel) over straights ---- */
  for(const u of [0.020, 0.255, 0.365, 0.735, 0.805, 0.960, 0.560, 0.470, 0.215]){
    const i = nodeAt(u), eL = edge(i, -1) + 1.4, eR = edge(i, 1) + 1.4, pl = at(i, -1, eL), pr = at(i, 1, eR);
    let ok = Math.abs(T.curv[i]) < 0.002;
    for(const b of bands){ const k = ((i - b.i0) % n + n) % n; if(k <= b.span + 12) ok = false; }
    if(!ok) continue;
    S.footbridges.push({ i, pl, pr, z:T.z[i], ang:T.ang[i], len:eL + eR }); addCircle(pl[0], pl[1], 3.5); addCircle(pr[0], pr[1], 3.5);
  }

  /* ---- 4. occupancy for buildings, tents, car parks ---- */
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
  P.rasterRect = rasterRect;
  const addBuilding = b => {
    const gap = b.gap != null ? b.gap : 12;
    if(!rasterRect(b.x, b.y, b.ang, b.w + gap, b.d + gap, false)) return false;
    if(blocked(b.x, b.y, Math.hypot(b.w, b.d) / 2 * 0.8)) return false;
    { const q = query(b.x, b.y); if(!q.far && q.bar < 12) return false; }
    { const allow = maxH(b.x, b.y, Math.hypot(b.w, b.d) / 2); if(b.landmark ? allow < b.h * 0.92 : allow < 5) return false; if(b.h > allow) b.h = allow; }
    rasterRect(b.x, b.y, b.ang, b.w + gap, b.d + gap, true); b.z = height(b.x, b.y); S.buildings.push(b); return true;
  };
  const near = (u, side, off) => { const i = nodeAt(u); const [x, y] = at(i, side, off); return { x, y, i, ang:T.ang[i] }; };

  // the royal villa: a long neoclassical palace in the trees, as far from the road as it needs to be to stand 24 m tall
  { let ok = false; for(const side of [1, -1]) for(const u of [0.55, 0.5, 0.6, 0.45, 0.35, 0.7, 0.25]) for(const off of [260, 320, 380, 440, 520]){ if(ok) break; const c = near(u, side, off);
      if(addBuilding({ type:"villa", x:c.x, y:c.y, ang:c.ang, w:110, d:34, h:24, seed:3, landmark:true, gap:30 })){ ok = true; S.villa = S.buildings[S.buildings.length - 1]; } } }
  // sheds and a gatehouse here and there, near the car parks and the paddock; a campers' village of tents in a clearing
  for(let k = 0; k < 14 * dens; k++){ const i = nodeAt(R()), side = R() < 0.5 ? 1 : -1, off = edge(i, side) + 60 + R() * 140, [x, y] = at(i, side, off);
    addBuilding({ type:R() < 0.5 ? "old" : "stone", x, y, ang:T.ang[i], w:16 + R() * 14, d:10 + R() * 5, h:6 + R() * 4, seed:(R() * 1e6) | 0, gap:14 }); }

  /* ---- 5. the paddock: marquees and cabins behind the pit building, transporters in rows ---- */
  { const pb = S.pit, ps = pb.side, base = pb.off0 + pb.depth + 10;
    for(let k = 0; k < 16; k++){ const i = (pb.i0 + Math.round(k * pb.span / 15)) % n, [x, y] = at(i, ps, base + 8 + (k % 2) * 17); S.paddock.push({ x, y, ang:T.ang[i], w:24, d:12, h:8, c:k }); }
    for(let k = 0; k < 22; k++){ const i = (pb.i0 + Math.round(k * pb.span / 21)) % n, [x, y] = at(i, ps, base + 54); S.trucks.push({ x, y, ang:T.ang[i], c:k, l:14, w:2.8 }); } }

  /* ---- 7. gravel avenues, the park wall, ponds, lamps, tents, cars ---- */
  for(let k = 0; k < 9; k++){ const i = nodeAt(R()), side = R() < 0.5 ? 1 : -1, ang0 = T.ang[i] + side * Math.PI / 2 + (R() - 0.5) * 0.6, off = edge(i, side) + 12;
    const [x0, y0] = at(i, side, off), len = 160 + R() * 240, pts = []; let x = x0, y = y0, a = ang0, ok = true;
    for(let d = 0; d <= len && ok; d += 16){ pts.push([x, y]); a += (R() - 0.5) * 0.18; x += Math.cos(a) * 16; y += Math.sin(a) * 16; if(P.clearance(x, y) < 6 && d > 40) ok = false; }
    if(pts.length > 5){ S.paths.push(pts); for(const p of pts) addCircle(p[0], p[1], 3.2); for(const p of pts) rasterRect(p[0], p[1], 0, 6, 6, true); } }
  for(const [u0, u1] of [[0.215, 0.245], [0.500, 0.540], [0.905, 0.935]]){
    const i0 = nodeAt(u0), i1 = nodeAt(u1), side = outside(Math.round((i0 + i1) / 2)), span = ((i1 - i0) % n + n) % n; let last = -99;
    for(let k = 0; k <= span; k += 2){ const i = (i0 + k) % n, [x, y] = at(i, side, edge(i, side) + 118);
      if(blocked(x, y, 2) || P.clearance(x, y) < 20) continue;
      S.walls.push({ x, y, z:height(x, y), i, ang:T.ang[i] }); if(k - last > 18){ S.pillars.push({ x, y, z:height(x, y), ang:T.ang[i] }); last = k; } } }
  for(let k = 0; k < 120 && S.ponds.length < 3; k++){ const i = nodeAt(R()), side = -outside(i), [x, y] = at(i, side, edge(i, side) + 90 + R() * 160), r = 18 + R() * 16;
    if(blocked(x, y, r + 8) || !rasterRect(x, y, 0, r * 2 + 12, r * 2 + 12, false)) continue; S.ponds.push({ x, y, z:height(x, y), r }); addCircle(x, y, r + 6); rasterRect(x, y, 0, r * 2 + 12, r * 2 + 12, true); }
  for(let i = 0; i < n; i += Math.max(1, Math.round(30 / T.ds))) for(const side of [-1, 1]){
    const [x, y] = at(i, side, edge(i, side) + 6.5); if(blocked(x, y, 1.5) || !rasterRect(x, y, 0, 3, 3, false)) continue; S.lamps.push({ x, y, z:height(x, y), ang:T.ang[i] + (side > 0 ? Math.PI : 0) }); }
  // the campers' village: a clearing of tents, in rows, on the outside
  { let best = null; for(const u of [0.54, 0.44, 0.24, 0.60, 0.34, 0.76]) for(const side of [1, -1]) for(const off of [90, 130, 170]){ if(best) break; const c = near(u, side, off); if(!blocked(c.x, c.y, 50) && rasterRect(c.x, c.y, c.ang, 100, 70, false)) best = c; }
    if(best){ S.tentVillage = best; rasterRect(best.x, best.y, best.ang, 100, 70, true); addCircle(best.x, best.y, 55);
      const ca = Math.cos(best.ang), sa = Math.sin(best.ang); for(let a = -42; a <= 42; a += 7) for(let b = -26; b <= 26; b += 8) if(R() < 0.8 * dens + 0.1) S.tents.push({ x:best.x + ca * a - sa * b, y:best.y + sa * a + ca * b, z:height(best.x, best.y), ang:best.ang + (R() - 0.5) * 0.3, c:S.tents.length }); } }
  // car parks with parked cars
  for(let k = 0; k < 40 && S.cars.length < 380 * dens; k++){
    const i = nodeAt(R()), side = R() < 0.5 ? 1 : -1, [x, y] = at(i, side, edge(i, side) + 60 + R() * 120);
    if(blocked(x, y, 12) || !rasterRect(x, y, T.ang[i], 30, 14, false)) continue; rasterRect(x, y, T.ang[i], 30, 14, true);
    for(let a = -12; a <= 12; a += 3.2) for(let b = -4.5; b <= 4.5; b += 4.5) if(R() < 0.7){ const ca = Math.cos(T.ang[i]), sa = Math.sin(T.ang[i]); S.cars.push({ x:x + ca * a - sa * b, y:y + sa * a + ca * b, z:height(x, y), ry:T.ang[i] + (R() < 0.5 ? 0 : Math.PI) }); } }
  for(let k = 0; k < 60 && S.stalls.length < 22; k++){ const i = nodeAt(R()), side = R() < 0.5 ? 1 : -1, [x, y] = at(i, side, edge(i, side) + 16 + R() * 20);
    if(blocked(x, y, 7) || !rasterRect(x, y, T.ang[i], 14, 12, false)) continue; rasterRect(x, y, T.ang[i], 14, 12, true); S.stalls.push({ x, y, z:height(x, y), ang:T.ang[i], c:S.stalls.length }); addCircle(x, y, 8); }
  for(const u of [0.045, 0.14, 0.235, 0.34, 0.42, 0.50, 0.58, 0.66, 0.74, 0.82, 0.90]){ const i = nodeAt(u), side = outside(i), [x, y] = at(i, side, edge(i, side) + 7);
    if(blocked(x, y, 5)) continue; S.tv.push({ x, y, z:height(x, y), ang:T.ang[i], h:10 + R() * 2 }); addCircle(x, y, 6); }
  for(const [u, side] of [[0.000, -T.pitSide], [0.118, outside(nodeAt(0.118))], [0.200, outside(nodeAt(0.200))], [0.404, outside(nodeAt(0.404))], [0.652, outside(nodeAt(0.652))], [0.890, -outside(nodeAt(0.890))]]){
    const i = nodeAt(u), st = S.stands.find(s => s.side === side && ((i - s.i0 + n) % n) <= s.span), off = (st ? st.off0 + st.depth : edge(i, side)) + 12, [x, y] = at(i, side, off);
    if(blocked(x, y, 8)) continue; S.screens.push({ x, y, z:height(x, y), a0:T.ang[i], side, n:S.screens.length }); addCircle(x, y, 9); }
  for(const st of S.stands) for(let k = 0; k <= st.span; k += 6){ const i = (st.i0 + k) % n, [x, y] = at(i, st.side, st.off0 - 2.5); S.flagPoles.push({ x, y, z:height(x, y), h:9, ang:T.ang[i], c:k }); }
  { let i = 0; while(i < n){ if(Math.abs(T.curv[i]) > 0.004){ let j = i; while(j < n && Math.abs(T.curv[j]) > 0.004) j++;
        if(j - i >= 3){ const side = outside(Math.round((i + j) / 2)); for(let k = i - 2; k <= j + 2; k++){ const [x, y] = at(k, side, edge(k, side) + 0.9); if(S.tyres.length < 520 && !blocked(x, y, 0.6)) S.tyres.push({ x, y, z:T.z[((k % n) + n) % n] - 0.1, c:S.tyres.length }); } }
        i = j; } else i++; } }
  /* ---- 6. the woods (last: they keep clear of everything else): lattice with jitter, taller where the lens allows it ---- */
  const crownR = { oak:0.55, plane:0.5, beech:0.42, pine:0.3 };
  { const step = lite ? 22 : 15, near170 = x => x;
    for(let y = Y0 + 8; y < Y0 + NY * STEP - 8; y += step) for(let x = X0 + 8; x < X0 + NX * STEP - 8; x += step){
      const px = x + R() * step, py = y + R() * step, q = query(px, py);
      let bar = q.far ? 999 : q.bar; if(bar === 999){ const k = Math.floor((py - Y0) / STEP) * NX + Math.floor((px - X0) / STEP); if(k >= 0 && k < NV) bar = DB[k]; }
      if(bar < 4.5 || bar > 720) continue;
      const w = woodAt(px, py), f = bar < 14 ? w * 0.65 : w;
      if(R() > f * 0.95 * dens) continue;
      if(blocked(px, py, 3.5) || !rasterRect(px, py, 0, 6, 6, false)) continue;
      const pick = R(); let kind, want;
      if(pick < 0.40){ kind = "oak"; want = 17 + R() * 11; } else if(pick < 0.68){ kind = "plane"; want = 18 + R() * 12; } else if(pick < 0.86){ kind = "beech"; want = 20 + R() * 10; } else { kind = "pine"; want = 15 + R() * 10; }
      const cr = crownR[kind] * want * 0.9, allow = maxH(px, py, Math.max(cr, 2));
      let h = Math.min(want, allow);
      if(h < 5.5){ if(bar < 6.5 || R() > 0.5) continue; S.shrubs.push({ x:px, y:py, z:height(px, py), ry:R() * 6.28, h:2.4 + R() * 1.4 }); rasterRect(px, py, 0, 4, 4, true); continue; }
      rasterRect(px, py, 0, 6, 6, true);
      (kind === "pine" ? S.pines : S.trees).push({ x:px, y:py, z:height(px, py), ry:R() * 6.28, h, kind, w:kind === "pine" ? 0.5 : 0.72 + R() * 0.2 });
    } }
  P.stats.trees = S.trees.length + S.pines.length;
  P.tm.trees = Date.now() - t0;

  // the sky: pigeons over the park, and a blimp that drifts over the circuit now and then
  for(let k = 0; k < 24 * dens; k++){ const i = nodeAt(R()), [x, y] = at(i, R() < 0.5 ? 1 : -1, 80 + R() * 300); S.birds.push({ x, y, r:25 + R() * 70, h:16 + R() * 50, a:R() * 6.28, sp:(0.15 + R() * 0.25) * (R() < 0.5 ? -1 : 1), ph:R() * 6.28 }); }
  S.blimp = { x:bb.minX + bb.w / 2, y:bb.minY + bb.h / 2, r:Math.min(bb.w, bb.h) * 0.35, h:210 };
  P.stats.counts = { buildings:S.buildings.length, trees:S.trees.length, pines:S.pines.length, shrubs:S.shrubs.length, stands:S.stands.length, banks:S.banks.length, footbridges:S.footbridges.length, tents:S.tents.length, cars:S.cars.length, walls:S.walls.length, paths:S.paths.length, ponds:S.ponds.length, tyres:S.tyres.length, birds:S.birds.length };
  P.tm.total = Date.now() - t0;
  return P;
}

/* the audit: nothing hides the road from the overhead lens, nothing stands on the road or overlaps */
function auditMonza(P, T){
  const o = { trees:0, treesOccluding:0, worstCover:0, treesTooClose:0, tall:0, tallestNearRoad:0, buildings:0, bldTooClose:0, bldOccluding:0, overlapping:0, lampsInRoad:0, wallsInRoad:0, tentsInRoad:0 };
  const S = P.structs, SH = Math.SQRT1_2;
  const shadowHits = (x, y, rad, h, t0, thr) => { thr = thr == null ? 5 : thr; for(let t = t0; t <= t0 + 1.414 * h; t += 4) for(const l of [-0.6, 0, 0.6]){ if(P.clearance(x - SH * t + SH * l * rad, y - SH * t - SH * l * rad) < thr) return t0 + 1.414 * h - t; } return 0; };
  for(const t of S.trees.concat(S.pines)){ o.trees++; const bar = P.clearance(t.x, t.y); if(bar < 4) o.treesTooClose++; const cr = Math.max(2, (t.kind === "pine" ? 0.3 : 0.5) * t.h * 0.9);
    if(t.h > 8){ o.tall++; const c = shadowHits(t.x, t.y, cr, t.h, cr * 0.85); if(c > 0){ o.treesOccluding++; o.worstCover = Math.max(o.worstCover, c); } } }
  for(const b of S.buildings){ o.buildings++; const ca = Math.cos(b.ang), sa = Math.sin(b.ang);
    for(const [a, c] of [[0, 0], [-1, -1], [1, -1], [1, 1], [-1, 1]]) if(P.clearance(b.x + ca * a * b.w / 2 - sa * c * b.d / 2, b.y + sa * a * b.w / 2 + ca * c * b.d / 2) < 6) { o.bldTooClose++; break; }
    const rad = Math.hypot(b.w, b.d) / 2; if(shadowHits(b.x, b.y, rad, b.h, rad * 0.85) > 0) o.bldOccluding++; }
  { const H2 = new Map(), key = (x, y) => Math.floor(x / 60) + "," + Math.floor(y / 60);
    for(const b of S.buildings){ const r = Math.hypot(b.w, b.d) / 2 + 8; for(let x = b.x - r; x <= b.x + r + 60; x += 60) for(let y = b.y - r; y <= b.y + r + 60; y += 60){ const k = key(x, y); if(!H2.has(k)) H2.set(k, []); H2.get(k).push(b); } }
    const inRect = (b, x, y) => { const dx = x - b.x, dy = y - b.y, c = Math.cos(b.ang), s = Math.sin(b.ang); return Math.abs(dx * c + dy * s) < b.w / 2 && Math.abs(-dx * s + dy * c) < b.d / 2; };
    for(const b of S.buildings){ const c = Math.cos(b.ang), s = Math.sin(b.ang); let ov = false;
      for(let a = -b.w / 2; a <= b.w / 2 && !ov; a += 3) for(let d = -b.d / 2; d <= b.d / 2; d += 3){ const x = b.x + c * a - s * d, y = b.y + s * a + c * d; for(const q of H2.get(key(x, y)) || []) if(q !== b && inRect(q, x, y)) ov = true; }
      if(ov) o.overlapping++; } }
  for(const l of S.lamps) if(P.clearance(l.x, l.y) < 1.5) o.lampsInRoad++;
  for(const w of S.walls) if(P.clearance(w.x, w.y) < 10) o.wallsInRoad++;
  for(const t of S.tents) if(P.clearance(t.x, t.y) < 6) o.tentsInRoad++;
  return o;
}

export { planMonza, auditMonza };
