import { fbm, rng } from './suzuka-plan.js';

/* ---------- Circuit of the Americas: the plan ---------------------------------
   Pure numbers, no three.js, so it runs in Node (scripts/cota-audit-world.mjs).
   It decides: the ground (heights and colours, rolling Hill Country with limestone,
   scrub, bare red earth, a dry creek and ponds), where every plant goes (and that
   none is on the road, the run-off, the barrier, a kerb, a marshal post, a TV
   tower, a stand or a building), and where every structure stands (tiered stands
   that follow the circuit's own curve, the tower, the amphitheatre, the pit and
   paddock buildings, car parks, tents, flags...).
   Side convention, as everywhere: +1 is the right of the direction of travel
   (the +normal), -1 the left. The lap is anticlockwise, so the infield is on the
   left (-1), and so is the pit lane.                                              */

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const hex = c => [parseInt(c.slice(1, 3), 16) / 255, parseInt(c.slice(3, 5), 16) / 255, parseInt(c.slice(5, 7), 16) / 255];
const mixC = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

/* the palette of the ground, sRGB: dusty gold and sage, red-brown earth, white limestone */
const GC = {
  sage:hex("#9DA862"), gold:hex("#CDB66C"), sandy:hex("#D6C288"), dry:hex("#BFA65A"), scrub:hex("#657A43"), scrubD:hex("#52673A"),
  bare:hex("#B88F5E"), red:hex("#A4603E"), lime:hex("#E6DECA"), limeD:hex("#CFC6AC"), gravel:hex("#B8B1A0"), lot:hex("#9E9C96"),
  creek:hex("#DBCBA6"), bank:hex("#8E8461"), ridge:hex("#9AA474"), ridgeFar:hex("#B2B48C"), service:hex("#C4B995"),
};

const BAR = 2.6;                                   // the barrier stands this far past the run-off
const CLEAR = { tree:4.0, scrub:2.4, low:1.2 };

function planCota(T, opts){
  opts = opts || {};
  const lite = opts.detail === 0, dens = lite ? 0.5 : 1;
  const n = T.n, half = T.half, R = rng(7311);
  const t0 = Date.now(), P = { stats:{}, tm:{} };
  const roOf = (i, side) => side >= 0 ? T.roR[i] : T.roL[i];
  const Z = T.def.zones || {};
  const inU = (u, a, b) => a <= b ? (u >= a && u <= b) : (u >= a || u <= b);
  // the edge of the barrier line, measured from the centre line
  const edge = (i, side) => half + roOf(((i % n) + n) % n, side) + BAR;
  // which side is the outside of the corner at node i (a left turn has its outside on the right)
  const outside = i => { let c = 0; for(let k = -6; k <= 6; k++) c += T.curv[((i + k) % n + n) % n]; return c <= 0 ? 1 : -1; };
  P.edge = edge; P.outside = outside;
  const at = (i, side, off) => { i = ((Math.round(i) % n) + n) % n; return [T.x[i] + T.nx[i] * side * off, T.y[i] + T.ny[i] * side * off]; };
  P.at = at;

  /* ---- segments, hashed so "what is near here" is cheap (as in suzuka-plan) ---- */
  const CELL = 40, bb = T.bounds, PAD = 1000, STEP = opts.step || (lite ? 16 : 12);
  const HX0 = bb.minX - PAD - CELL, HY0 = bb.minY - PAD - CELL;
  const hw = Math.ceil((bb.w + 2 * PAD + 2 * CELL) / CELL) + 1, hh = Math.ceil((bb.h + 2 * PAD + 2 * CELL) / CELL) + 1;
  const cells = Array.from({ length:hw * hh }, () => []);
  for(let i = 0; i < n; i++){
    const j = (i + 1) % n;
    const c0 = Math.floor((Math.min(T.x[i], T.x[j]) - HX0) / CELL), c1 = Math.floor((Math.max(T.x[i], T.x[j]) - HX0) / CELL);
    const r0 = Math.floor((Math.min(T.y[i], T.y[j]) - HY0) / CELL), r1 = Math.floor((Math.max(T.y[i], T.y[j]) - HY0) / CELL);
    for(let r = r0; r <= r1; r++) for(let c = c0; c <= c1; c++) cells[r * hw + c].push(i);
  }
  const Q = { d:0, i:0, side:1, bar:0, z:0, zBand:0, band:false, far:false, off:0 };
  const cI = new Int32Array(2048), cZ = new Float32Array(2048);
  function query(x, y){
    const c = Math.floor((x - HX0) / CELL), r = Math.floor((y - HY0) / CELL);
    let bd = Infinity, bi = -1, bs = 1, bz = 0, bbar = Infinity, m = 0, boff = 0;
    for(let rr = r - 2; rr <= r + 2; rr++){ if(rr < 0 || rr >= hh) continue;
      for(let cc = c - 2; cc <= c + 2; cc++){ if(cc < 0 || cc >= hw) continue;
        for(const i of cells[rr * hw + cc]){
          const j = (i + 1) % n, ax = T.x[i], ay = T.y[i], dx = T.x[j] - ax, dy = T.y[j] - ay;
          const L2 = dx * dx + dy * dy || 1, t = clamp(((x - ax) * dx + (y - ay) * dy) / L2, 0, 1);
          const d = Math.hypot(x - (ax + dx * t), y - (ay + dy * t));
          const off = (x - ax) * T.nx[i] + (y - ay) * T.ny[i], side = off >= 0 ? 1 : -1;
          const ed = half + mix(roOf(i, side), roOf(j, side), t);
          const z = T.z[i] + (T.z[j] - T.z[i]) * t, bar = d - ed - BAR;
          if(bar < bbar) bbar = bar;
          if(d < bd){ bd = d; bi = i; bs = side; bz = z; boff = off; }
          if(d < ed + 19 && m < 2048){ cI[m] = i; cZ[m] = z; m++; }
        } } }
    Q.far = bi < 0;
    if(Q.far){ Q.d = 999; Q.bar = 999; Q.band = false; return Q; }
    // where two different parts of the lap are both close, the lower road wins (no ground triangle
    // can climb onto it on the way to the other one)
    let zb = bz;
    for(let k = 0; k < m; k++){
      const di = Math.abs(((cI[k] - bi) % n + n + (n >> 1)) % n - (n >> 1));
      if(di < 14) continue;
      if(cZ[k] < zb) zb = cZ[k];
    }
    Q.d = bd; Q.i = bi; Q.side = bs; Q.bar = bbar; Q.z = bz; Q.band = true; Q.zBand = zb; Q.off = boff;
    return Q;
  }
  P.query = query;
  P.clearance = (x, y) => { const q = query(x, y); return q.far ? 999 : q.bar; };

  /* ---- footprints: circles and oriented rectangles that nothing may grow in ---- */
  const excl = [], rects = [], bands = [];          // bands: along the lap (node range, side, offset range)
  const addCircle = (x, y, r) => excl.push({ x, y, r });
  const addRect = (cx, cy, ang, a0, a1, b0, b1) => { const ux = Math.cos(ang), uy = Math.sin(ang); rects.push({ cx, cy, ux, uy, vx:-uy, vy:ux, a0, a1, b0, b1 }); };
  const addBand = (i0, i1, side, o0, o1) => bands.push({ i0, i1, side, o0, o1, span:((i1 - i0) % n + n) % n });
  const inBand = (i, side, off, margin) => {
    for(const b of bands){
      if(b.side !== side) continue;
      const k = ((i - b.i0) % n + n) % n;
      if(k <= b.span + 2 && off > b.o0 - margin && off < b.o1 + margin) return true;
    }
    return false;
  };
  const blocked = (x, y, r) => {
    for(const e of excl){ const dx = x - e.x, dy = y - e.y, rr = e.r + r; if(dx * dx + dy * dy < rr * rr) return true; }
    for(const q of rects){ const dx = x - q.cx, dy = y - q.cy, a = dx * q.ux + dy * q.uy, b = dx * q.vx + dy * q.vy;
      if(a > q.a0 - r && a < q.a1 + r && b > q.b0 - r && b < q.b1 + r) return true; }
    if(bands.length){
      const q = query(x, y);
      if(!q.far && inBand(q.i, q.side, Math.abs(q.off), r + 1.5)) return true;
    }
    return false;
  };
  P.blocked = blocked; P.excl = excl; P.rects = rects; P.bands = bands;

  // what the circuit already stands there: pylons, adverts, the pit garages
  for(const p of T.props){
    if(p.only2d || p.t === "tree") continue;
    addCircle(p.x, p.y, ({ pylon:3.4, billboard:9, garage:15, marshal:5, arch:7 })[p.t] || 8);
  }

  /* ---- 1. the structures, decided before the ground so the ground can make room ---- */
  const S = P.structs = { stands:[], buildings:[], lots:[], tents:[], trucks:[], flagPoles:[], screens:[], masts:[], towers:[],
    marshal:[], tvTowers:[], pylons:[], roads:[], fences:[], posts:[], bunting:[], balloons:[], ferris:null, tower:null, amph:null,
    gantry:null, paddock:[], tvList:[] };
  const nodeAt = u => Math.round(((u % 1) + 1) % 1 * n) % n;
  const mid = (a, b) => a <= b ? (a + b) / 2 : (((a + b + 1) / 2) % 1);

  /* A tiered stand follows the circuit's own curve between two laps fractions: rows of treads and risers
     at depth, raised row by row. Footprint recorded as a band along the lap. */
  const stand = o => {
    const i0 = nodeAt(o.u0), i1 = nodeAt(o.u1), side = o.side;
    const span = ((i1 - i0) % n + n) % n;
    // far enough back that no node's barrier line is inside it
    let off0 = 0; for(let k = 0; k <= span; k++) off0 = Math.max(off0, edge(i0 + k, side));
    off0 += o.gap != null ? o.gap : 7;
    const st = Object.assign({ rows:14, rowD:0.95, rowH:0.46, roof:false, kind:"stand", fill:0.78, wave:false, col:"#6A7A8C" }, o, { i0, i1, span, side, off0 });
    st.depth = st.rows * st.rowD; st.height = st.rows * st.rowH;
    S.stands.push(st);
    addBand(i0, i1, side, off0 - 4, off0 + st.depth + (st.roof ? 6 : 4) + (st.bank ? 10 : 0));
    return st;
  };
  // the main grandstand, across the straight from the pits, with a roof
  stand({ name:"main", u0:0.945, u1:0.040, side:1, rows:16, rowD:1.0, rowH:0.5, roof:true, col:"#7A8696", gap:9 });
  // Turn 1: the hill. A tall stand on the outside, and a grass bank beyond it
  stand({ name:"t1", u0:0.052, u1:0.096, side:1, rows:22, rowD:1.05, rowH:0.55, roof:false, col:"#B05A3C", gap:6, wave:true });
  stand({ name:"t1bank", u0:0.060, u1:0.092, side:1, rows:12, rowD:2.2, rowH:0.85, roof:false, kind:"bank", col:"#B7AA66", gap:34, wave:true, fill:0.9 });
  // the Esses: a stand on each of the first two outsides
  stand({ name:"esses1", u0:0.124, u1:0.150, side:outside(nodeAt(0.137)), rows:12, rowD:0.95, rowH:0.46, roof:false, col:"#5E7A9C", gap:6 });
  stand({ name:"esses2", u0:0.172, u1:0.200, side:outside(nodeAt(0.186)), rows:10, rowD:0.95, rowH:0.46, roof:false, col:"#9C5E5E", gap:6 });
  // Turn 11, the hairpin, and the big stand at Turn 12 on the outside
  stand({ name:"t11", u0:0.372, u1:0.396, side:outside(nodeAt(0.384)), rows:14, rowD:0.95, rowH:0.5, roof:false, col:"#4C6E8E", gap:6, wave:true });
  stand({ name:"t12", u0:0.592, u1:0.628, side:outside(nodeAt(0.610)), rows:20, rowD:1.0, rowH:0.52, roof:true, col:"#8A5A9A", gap:8 });
  // the stadium: a bowl round the outside of Turn 19, taller and deeper than the rest
  stand({ name:"stadium", u0:0.760, u1:0.806, side:outside(nodeAt(0.783)), rows:28, rowD:1.15, rowH:0.58, roof:true, kind:"bowl", col:"#B8483A", gap:8, wave:true });
  stand({ name:"stadium2", u0:0.852, u1:0.896, side:-outside(nodeAt(0.874)), rows:16, rowD:1.0, rowH:0.5, roof:false, col:"#3A6AA8", gap:7 });
  stand({ name:"t16", u0:0.724, u1:0.740, side:-outside(nodeAt(0.73)), rows:10, rowD:0.95, rowH:0.46, roof:false, col:"#C8A23A", gap:6 });

  // the pit building, on the pit side, behind the garages the circuit adds on the lane
  { const ps = T.pitSide, i0 = nodeAt(0.962), i1 = nodeAt(0.024), span = ((i1 - i0) % n + n) % n;
    const off0 = half + T.pitW + 15;
    S.pit = { i0, i1, span, side:ps, off0, depth:20, h:15 };
    addBand(i0, i1, ps, half, off0 + 20 + 75);                      // the lane, garages, building and paddock behind it
  }
  // the start/finish gantry: just before the line, across the straight
  S.gantry = { i:nodeAt(0.0), halfW:half + 5 };

  // the tower: outside the track near Turns 16 to 18 (the official COTA page)
  { const tz = Z.tower || { u:0.716, side:1, off:70 }, i = nodeAt(tz.u), side = tz.side;
    const off = Math.max(tz.off, edge(i, side) + 34), [x, y] = at(i, side, off);
    S.tower = { x, y, i, side, off, h:76.5, rot:T.ang[i] };
    addCircle(x, y, 22);
  }
  // the amphitheatre: in the infield, behind the Turn 16 to 18 sweep (its exact place I could not confirm)
  { const u = 0.745, i = nodeAt(u), side = -1, off = edge(i, side) + 130, [x, y] = at(i, side, off);
    S.amph = { x, y, i, side, r:62, rot:T.ang[i] + (side < 0 ? 0 : Math.PI) };
    addCircle(x, y, 86);
  }

  /* ---- flat-footed things placed by finding open ground ---- */
  const lotSpec = [[0.030, 1, 230, 180, 110], [0.452, 1, 240, 160, 90], [0.925, 1, 250, 160, 100], [0.560, -1, 210, 150, 90], [0.200, -1, 170, 140, 80]];
  P.lotSpec = lotSpec;
  tryLots:
  for(const [u, side, off0, w, d] of lotSpec){
    const i = nodeAt(u);
    for(let k = 0; k < 14; k++){
      const off = off0 + k * 12, [x, y] = at(i, side, off), ang = T.ang[i];
      // the lot's rectangle must be clear of the circuit and of every other footprint
      let ok = !blocked(x, y, Math.max(w, d) * 0.6);
      if(ok){ const q = query(x, y); if(!q.far && q.bar < Math.max(w, d) * 0.5 + 20) ok = false; }
      if(ok){ S.lots.push({ x, y, ang, w, d, z:0, u, side }); addRect(x, y, ang, -w / 2, w / 2, -d / 2, d / 2); continue tryLots; }
    }
  }
  // build the lots' ground height after the terrain exists (below), tents/food trucks around the plazas
  P.plazaOf = (u, side, off) => { const i = nodeAt(u), [x, y] = at(i, side, off); return [x, y, T.ang[i]]; };

  /* ---- 2. the terrain grid ---- */
  const X0 = bb.minX - PAD, Y0 = bb.minY - PAD;
  const NX = Math.ceil((bb.w + 2 * PAD) / STEP) + 1, NY = Math.ceil((bb.h + 2 * PAD) / STEP) + 1, NV = NX * NY;
  const H = new Float32Array(NV), DB = new Float32Array(NV), COL = new Float32Array(NV * 3), SL = new Float32Array(NV);
  const sub = []; for(let i = 0; i < n; i += 6) sub.push(i);
  const lieOf = (x, y) => { let zw = 0, ws = 0; for(const i of sub){ const d2 = (x - T.x[i]) ** 2 + (y - T.y[i]) ** 2, w = 1 / (d2 + 6400); zw += w * T.z[i]; ws += w; } return zw / ws; };
  const dband = new Float32Array(NV);
  for(let r = 0; r < NY; r++) for(let c = 0; c < NX; c++){
    const k = r * NX + c, x = X0 + c * STEP, y = Y0 + r * STEP;
    query(x, y);
    const zw = lieOf(x, y);
    let bar, zn;
    if(Q.far){ let bd = Infinity, bi = 0; for(const i of sub){ const d2 = (x - T.x[i]) ** 2 + (y - T.y[i]) ** 2; if(d2 < bd){ bd = d2; bi = i; } }
      bar = Math.sqrt(bd) - half - T.runoffMax - BAR; zn = T.z[bi]; }
    else { bar = Q.bar; zn = Q.band ? Q.zBand : Q.z; }
    DB[k] = bar;
    const db = bar - 3.4; dband[k] = db;
    // the verge is the road's own height; past it the land eases into the lie of the country: rolling
    // hills, taller and further off, with the hazy ridge at the back
    let z = db <= 0 ? zn - 1.0 : mix(zn - 1.0 + 0.6 * sstep(2, 16, db), zw, sstep(0, 170, db));
    const hill = (fbm(x / 520, y / 520, 11, 3) - 0.5) * 36 + (fbm(x / 170, y / 170, 23, 2) - 0.5) * 7 + (fbm(x / 60, y / 60, 5, 2) - 0.5) * 1.4;
    const ridge = (fbm(x / 900, y / 900, 3, 2) * 0.8 + 0.35) * 70 * sstep(380, 1100, db);
    z += hill * sstep(14, 300, db) + ridge;
    H[k] = z;
  }
  // soften: rolling, not lumpy; the verge is left exact
  for(let pass = 0; pass < 3; pass++){
    const src = H.slice();
    for(let r = 1; r < NY - 1; r++) for(let c = 1; c < NX - 1; c++){
      const k = r * NX + c; if(DB[k] < 5) continue;
      const w = sstep(5, 20, DB[k]);
      const av = (src[k] * 4 + src[k - 1] + src[k + 1] + src[k - NX] + src[k + NX] + (src[k - NX - 1] + src[k - NX + 1] + src[k + NX - 1] + src[k + NX + 1]) * 0.5) / 10;
      H[k] = mix(src[k], av, w);
    }
  }
  const gat = (A, x, y) => {
    const fx = clamp((x - X0) / STEP, 0, NX - 1.001), fy = clamp((y - Y0) / STEP, 0, NY - 1.001);
    const c = Math.floor(fx), r = Math.floor(fy), u = fx - c, v = fy - r, k = r * NX + c;
    return (A[k] * (1 - u) + A[k + 1] * u) * (1 - v) + (A[k + NX] * (1 - u) + A[k + NX + 1] * u) * v;
  };
  const G = { X0, Y0, STEP, NX, NY, H, DB, COL };
  P.grid = G;
  const height = (x, y) => gat(H, x, y);
  P.height = height;
  const gradAt = (x, y) => { const e = STEP; return [(height(x + e, y) - height(x - e, y)) / (2 * e), (height(x, y + e) - height(x, y - e)) / (2 * e)]; };
  const slopeAt = (x, y) => Math.hypot(...gradAt(x, y));

  // the car parks: level, at the height of the ground at their middle
  for(const L of S.lots){
    L.z = height(L.x, L.y) - 0.2;
    const ux = Math.cos(L.ang), uy = Math.sin(L.ang);
    for(let r = 0; r < NY; r++) for(let c = 0; c < NX; c++){
      const k = r * NX + c, x = X0 + c * STEP, y = Y0 + r * STEP, dx = x - L.x, dy = y - L.y;
      const a = dx * ux + dy * uy, b = -dx * uy + dy * ux;
      const m = Math.max(Math.abs(a) - L.w / 2, Math.abs(b) - L.d / 2);
      if(m < 24) H[k] = mix(L.z, H[k], sstep(0, 24, m));
    }
  }
  // ponds: a basin in the first open low spot of each region; dry creek along a lazy line
  S.ponds = [];
  { const spots = [[0.30, -1, 330], [0.50, 1, 300], [0.12, 1, 520]];
    for(const [u, side, off] of spots){
      const i = nodeAt(u);
      for(let t = 0; t < 10; t++){
        const [x, y] = at(i, side, off + t * 40);
        if(blocked(x, y, 40)) continue;
        const q = query(x, y); if(!q.far && q.bar < 120) continue;
        const r0 = 26 + R() * 16, z0 = height(x, y) - 0.7;
        S.ponds.push({ x, y, r:r0, z:z0 });
        for(let r = 0; r < NY; r++) for(let c = 0; c < NX; c++){
          const k = r * NX + c, dx = X0 + c * STEP - x, dy = Y0 + r * STEP - y, d = Math.hypot(dx, dy) / (r0 * (1 + 0.12 * Math.sin(Math.atan2(dy, dx) * 3)));
          if(d < 1.7) H[k] = mix(z0 - 1.3, H[k], sstep(0.55, 1.7, d));
        }
        addCircle(x, y, r0 * 1.25);
        break;
      }
    } }
  S.creek = [];
  { const i0 = nodeAt(0.14), side = 1;
    let prev = null;
    for(let k = 0; k < 60; k++){
      const u = 0.12 + k * 0.0065, i = nodeAt(u);
      const off = edge(i, side) + 60 + 38 * Math.sin(k * 0.55) + 20 * fbm(k * 0.3, 1, 2, 2);
      const [x, y] = at(i, side, off);
      if(blocked(x, y, 8)) { prev = null; continue; }
      const q = query(x, y); if(!q.far && q.bar < 40){ prev = null; continue; }
      S.creek.push({ x, y, brk:prev === null }); prev = 1;
    }
    // carve it 1.3 m into the ground
    for(let k = 1; k < S.creek.length; k++){
      if(S.creek[k].brk) continue;
      const a = S.creek[k - 1], b = S.creek[k], L = Math.hypot(b.x - a.x, b.y - a.y);
      for(let s = 0; s < L; s += STEP * 0.5){
        const x = mix(a.x, b.x, s / L), y = mix(a.y, b.y, s / L);
        for(let dy = -2; dy <= 2; dy++) for(let dx = -2; dx <= 2; dx++){
          const c = Math.round((x - X0) / STEP) + dx, r = Math.round((y - Y0) / STEP) + dy; if(c < 0 || r < 0 || c >= NX || r >= NY) continue;
          const d = Math.hypot(X0 + c * STEP - x, Y0 + r * STEP - y); if(d < STEP * 1.6) H[r * NX + c] -= 1.3 * (1 - d / (STEP * 1.6)) * 0.5;
        }
      }
    } }

  /* ---- 3. the ground colours ---- */
  const lotAt = (x, y) => { for(const L of S.lots){ const dx = x - L.x, dy = y - L.y, ux = Math.cos(L.ang), uy = Math.sin(L.ang), a = dx * ux + dy * uy, b = -dx * uy + dy * ux; if(Math.abs(a) < L.w / 2 + 3 && Math.abs(b) < L.d / 2 + 3) return true; } return false; };
  const creekD = (x, y) => { let best = 1e9; for(let k = 1; k < S.creek.length; k++){ if(S.creek[k].brk) continue; const a = S.creek[k - 1], b = S.creek[k], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1, t = clamp(((x - a.x) * dx + (y - a.y) * dy) / L2, 0, 1); best = Math.min(best, Math.hypot(x - a.x - dx * t, y - a.y - dy * t)); } return best; };
  for(let r = 0; r < NY; r++) for(let c = 0; c < NX; c++){
    const k = r * NX + c, x = X0 + c * STEP, y = Y0 + r * STEP, bar = DB[k];
    const sl = slopeAt(x, y); SL[k] = sl;
    let col = mixC(GC.sage, GC.gold, fbm(x / 260, y / 260, 3, 3));
    col = mixC(col, GC.dry, sstep(0.55, 0.8, fbm(x / 110, y / 110, 7, 2)) * 0.6);
    col = mixC(col, GC.sandy, sstep(0.60, 0.74, fbm(x / 90, y / 90, 17, 2)) * 0.7);
    col = mixC(col, fbm(x / 70, y / 70, 29, 2) > 0.5 ? GC.scrub : GC.scrubD, sstep(0.60, 0.72, fbm(x / 135, y / 135, 29, 2)) * 0.85);
    col = mixC(col, GC.bare, sstep(0.66, 0.78, fbm(x / 75, y / 75, 31, 2)) * 0.8);
    // red-brown earth where the run-off ends, and a haze of ridge colour far off
    col = mixC(col, GC.red, (1 - sstep(0, 11, bar)) * 0.6 * (0.5 + fbm(x / 40, y / 40, 3, 2)));
    // white limestone on the slopes, and as outcrops
    const out = sstep(0.70, 0.80, fbm(x / 60, y / 60, 41, 3));
    col = mixC(col, fbm(x / 8, y / 8, 9, 2) > 0.5 ? GC.lime : GC.limeD, clamp(sstep(0.16, 0.30, sl) * 0.9 + out * 0.7, 0, 1));
    const cd = creekD(x, y); if(cd < 7) col = mixC(col, GC.creek, 1 - sstep(2.5, 7, cd));
    col = mixC(col, GC.ridge, sstep(300, 900, bar) * 0.55);
    col = mixC(col, GC.ridgeFar, sstep(800, 1300, bar) * 0.5);
    if(lotAt(x, y)) col = mixC(col, GC.lot, 0.92);
    COL[k * 3] = col[0]; COL[k * 3 + 1] = col[1]; COL[k * 3 + 2] = col[2];
  }
  P.colorAt = (x, y) => { const c = clamp(Math.round((x - X0) / STEP), 0, NX - 1), r = clamp(Math.round((y - Y0) / STEP), 0, NY - 1), k = r * NX + c; return [COL[k * 3], COL[k * 3 + 1], COL[k * 3 + 2]]; };
  P.tm.ground = Date.now() - t0;

  /* ---- 4. standing things placed on the finished ground ---- */
  // the service roads (a gravel ribbon) and the fence beside them, on the outside of both edges
  const ROAD_BAR = 24, FENCE_BAR = 31;
  S.fenceBar = FENCE_BAR; S.roadBar = ROAD_BAR;
  P.roadAt = (i, side) => edge(i, side) + ROAD_BAR;
  // posts: every 9 m, wherever it is clear
  for(let side = -1; side <= 1; side += 2){
    let runStart = -1;
    for(let i = 0; i < n; i += 1){
      const off = edge(i, side) + FENCE_BAR, [x, y] = at(i, side, off);
      const ok = !blocked(x, y, 3) && P.clearance(x, y) > FENCE_BAR - 4;
      if(ok && i % 1 === 0 && Math.floor(i * T.ds / 9) !== Math.floor((i - 1) * T.ds / 9)) S.posts.push({ x, y, z:height(x, y), ang:T.ang[i], side, i });
      if(ok){ if(runStart < 0) runStart = i; } else if(runStart >= 0){ S.roads.push({ side, i0:runStart, i1:i - 1 }); runStart = -1; }
    }
    if(runStart >= 0) S.roads.push({ side, i0:runStart, i1:n - 1 });
  }
  // marshal posts (a little cabin each ~230 m, on the outside of the corners) and TV towers (scaffold, along the back straight)
  // a spot beside the barrier at node i, pushed outward until it is genuinely clear of every part of the circuit
  const placeOut = (i, side, off0, minBar, r) => {
    for(let t = 0; t < 14; t++){
      const [x, y] = at(i, side, off0 + t * 1.5);
      if(P.clearance(x, y) >= minBar && !blocked(x, y, r)) return [x, y];
    }
    return null;
  };
  for(let k = 0; k < 24; k++){
    const i = nodeAt(0.02 + k / 24), side = outside(i), pp = placeOut(i, side, edge(i, side) + 2.8, 2.6, 3);
    if(!pp) continue;
    S.marshal.push({ x:pp[0], y:pp[1], z:height(pp[0], pp[1]), ang:T.ang[i] + (side > 0 ? Math.PI : 0) });
    addCircle(pp[0], pp[1], 4);
  }
  for(const u of [0.07, 0.14, 0.23, 0.31, 0.37, 0.43, 0.50, 0.57, 0.61, 0.66, 0.72, 0.78, 0.84, 0.90]){
    const i = nodeAt(u), side = u > 0.40 && u < 0.60 ? 1 : outside(i), pp = placeOut(i, side, edge(i, side) + 7, 6, 5);
    if(!pp) continue;
    S.tvTowers.push({ x:pp[0], y:pp[1], z:height(pp[0], pp[1]), ang:T.ang[i], h:9 + R() * 3 });
    addCircle(pp[0], pp[1], 6);
  }
  // light pylons along the back straight and the front straight (the circuit's own pylons stand lower)
  // flag poles on the stand fronts and at plazas; bunting runs between them
  for(const st of S.stands){
    if(st.kind === "bank") continue;
    for(let k = 0; k <= st.span; k += 4){
      const i = (st.i0 + k) % n, off = st.off0 - 2.5, [x, y] = at(i, st.side, off);
      if(k % 8 === 0) S.flagPoles.push({ x, y, z:height(x, y), h:9 + (k % 16 === 0 ? 2 : 0), ang:T.ang[i], c:(k / 8) | 0 });
    }
  }
  // the paddock: hospitality village behind the pit building, tents, food trucks, screens
  { const ps = S.pit.side, base = S.pit.off0 + S.pit.depth + 10;
    for(let k = 0; k < 12; k++){
      const i = (S.pit.i0 + Math.round(k * S.pit.span / 11)) % n, [x, y] = at(i, ps, base + 6 + (k % 2) * 16);
      S.paddock.push({ x, y, ang:T.ang[i], w:22, d:11, h:7.5, c:k });
    }
    // transporters in two rows behind them
    for(let k = 0; k < 20; k++){
      const i = (S.pit.i0 + Math.round(k * S.pit.span / 19)) % n, [x, y] = at(i, ps, base + 52);
      S.trucks.push({ x, y, ang:T.ang[i], c:k, l:14, w:2.8 });
    }
  }
  // fan-zone plazas: tents and food trucks near the main stand and the T1 bank
  const plaza = (u, side, off, nt, nf) => {
    const i = nodeAt(u);
    for(let k = 0; k < nt; k++){
      const [x, y] = at(i + (k - nt / 2) * 3, side, off + (k % 3) * 11);
      if(blocked(x, y, 9)) continue; S.tents.push({ x, y, ang:T.ang[i], c:k, r:5 + (k % 2) * 2 }); addCircle(x, y, 9);
    }
    for(let k = 0; k < nf; k++){
      const [x, y] = at(i + (k - nf / 2) * 4, side, off - 16);
      if(blocked(x, y, 5)) continue; S.trucks.push({ x, y, ang:T.ang[i] + Math.PI / 2, c:k + 5, l:6.4, w:2.4, food:true }); addCircle(x, y, 6);
    }
  };
  plaza(0.985, 1, 80, 9, 7); plaza(0.07, 1, 105, 7, 5); plaza(0.745, -1, edge(nodeAt(0.745), -1) + 40, 8, 6); plaza(0.61, outside(nodeAt(0.61)), 90, 5, 4); plaza(0.80, outside(nodeAt(0.8)), 80, 6, 5);
  // big screens facing the straights and the hairpin
  for(const [u, side] of [[0.972, 1], [0.088, 1], [0.392, outside(nodeAt(0.39))], [0.78, outside(nodeAt(0.78))]]){
    const i = nodeAt(u), st = S.stands.find(s => s.i0 === nodeAt(s.u0) && inU(u, s.u0, s.u1) && s.side === side), off = (st ? st.off0 + st.depth : edge(i, side)) + 14, [x, y] = at(i, side, off);
    if(blocked(x, y, 7)) continue; S.screens.push({ x, y, z:height(x, y), a0:T.ang[i], side, n:S.screens.length }); addCircle(x, y, 10);
  }
  // warehouses behind the car parks and along the service zone
  S.warehouses = [];
  for(const L of S.lots.slice(0, 4)){
    const ux = Math.cos(L.ang), uy = Math.sin(L.ang), vx = -uy, vy = ux, away = L.side;
    for(let k = 0; k < 3; k++){
      const w = 44 + R() * 30, d = 22 + R() * 12, a = (k - 1) * 70;
      const x = L.x + ux * a + vx * away * (L.d / 2 + 40 + d / 2), y = L.y + uy * a + vy * away * (L.d / 2 + 40 + d / 2);
      if(blocked(x, y, Math.max(w, d) * 0.7)) continue;
      S.warehouses.push({ x, y, ang:L.ang, w, d, h:9 + R() * 4, c:S.warehouses.length }); addRect(x, y, L.ang, -w / 2 - 3, w / 2 + 3, -d / 2 - 3, d / 2 + 3);
    }
  }
  // the Ferris wheel, the fan zone: behind the main stand, across from the pits
  { const i = nodeAt(0.915), side = 1; for(let off = edge(i, side) + 130; off < edge(i, side) + 360; off += 20){ const [x, y] = at(i, side, off); if(!blocked(x, y, 36) && P.clearance(x, y) > 90){ S.ferris = { x, y, z:height(x, y), r:24, ang:T.ang[i] }; addCircle(x, y, 38); break; } } }
  // balloons: three, drifting round at different heights
  S.balloons = [{ r:420, h:120, a:0.4, sp:0.012, c:"#D8442A" }, { r:620, h:160, a:2.3, sp:-0.009, c:"#F2C230" }, { r:300, h:95, a:4.4, sp:0.015, c:"#3E86C8" }];
  // water towers and radio masts on the horizon: on the highest ground that is far out
  { const cand = [];
    for(let r = 2; r < NY - 2; r += 3) for(let c = 2; c < NX - 2; c += 3){ const k = r * NX + c; if(DB[k] > 520 && DB[k] < 900) cand.push([H[r * NX + c], X0 + c * STEP, Y0 + r * STEP]); }
    cand.sort((a, b) => b[0] - a[0]);
    const used = [];
    for(const [z, x, y] of cand){ if(used.length >= 7) break; if(used.some(u => Math.hypot(u[0] - x, u[1] - y) < 420)) continue; used.push([x, y]); (used.length % 2 ? S.masts : S.towers).push({ x, y, z }); } }
  P.tm.structs = Date.now() - t0;

  /* ---- 5. the planting ---- */
  const L = { liveOak:[], elm:[], mesquite:[], juniper:[], pear:[], yucca:[], grass:[], flowers:[], crowd:[], sway:[] };
  P.lists = L;
  const CROWN = { liveOak:0.62, elm:0.40, mesquite:0.55, juniper:0.30, pear:0.5, yucca:0.35 };
  const fits = (x, y, kind, h) => {
    const r = CROWN[kind] * h, q = query(x, y);
    const need = (kind === "pear" || kind === "yucca" ? CLEAR.scrub : CLEAR.tree) + r + (h > 5 ? FENCE_BAR - 2 : 0) * (kind === "pear" || kind === "yucca" ? 0 : 1);
    if(!q.far && q.bar < need) return false;
    if(blocked(x, y, r + 1)) return false;
    return true;
  };
  P.fits = fits;
  const put = (kind, x, y, h, w, tint, r) => {
    const z = height(x, y), [gx, gy] = gradAt(x, y), sl = Math.hypot(gx, gy), lean = clamp(sl * 0.3, 0, 0.08);
    L[kind].push({ x, y, z, ry:R() * Math.PI * 2, h, w, lx:sl > 1e-4 ? -gx / sl * lean : 0, ly:sl > 1e-4 ? -gy / sl * lean : 0, tint, r });
  };
  const nudge = (k, warm) => { const v = 1 + (R() - 0.5) * k, t = (R() - 0.5) * (warm || 0); return [clamp(v + t, 0.6, 1.3), clamp(v, 0.6, 1.3), clamp(v - t, 0.6, 1.3)]; };
  const CS = lite ? 22 : 15;
  let cnt = { liveOak:0, elm:0, mesquite:0, juniper:0 };
  for(let y = Y0; y < Y0 + NY * STEP; y += CS) for(let x = X0; x < X0 + NX * STEP; x += CS){
    const px = x + R() * CS, py = y + R() * CS, bar = P.clearance(px, py);
    if(bar > 760) continue;
    const q = query(px, py), sl = slopeAt(px, py);
    // thin near the track, thicker along the outer fences, groves between, clearings round the stands
    const grove = fbm(px / 210, py / 210, 5, 3);
    let f = sstep(0.40, 0.62, grove) * (bar < FENCE_BAR + 6 ? 0 : sstep(FENCE_BAR + 6, FENCE_BAR + 60, bar));
    f += (bar > FENCE_BAR + 4 && bar < FENCE_BAR + 46 ? 0.34 : 0) * (0.5 + 0.5 * fbm(px / 60, py / 60, 15, 2));      // the belt along the fences
    f *= bar < 300 ? 1 : bar < 520 ? 0.6 : 0.3;
    if(R() > f * 1.0 * dens) continue;
    const pick = R(), sc = grove;
    let kind, h;
    if(pick < 0.38){ kind = "liveOak"; h = 7 + R() * 5; } else if(pick < 0.58){ kind = "elm"; h = 9 + R() * 5; }
    else if(pick < 0.80){ kind = "mesquite"; h = 4 + R() * 2.5; } else { kind = "juniper"; h = 3 + R() * 3.5; }
    if(sl > 0.45 || !fits(px, py, kind, h)) continue;
    put(kind, px, py, h, kind === "juniper" ? 0.55 : 1, nudge(0.2, 0.18));
    cnt[kind]++;
  }
  // scrub: prickly pear and yucca, anywhere open and at least a few metres past the barrier
  for(let y = Y0; y < Y0 + NY * STEP; y += lite ? 20 : 12) for(let x = X0; x < X0 + NX * STEP; x += lite ? 20 : 12){
    const px = x + R() * 12, py = y + R() * 12, bar = P.clearance(px, py);
    if(bar < 4.5 || bar > 340) continue;
    const patch = fbm(px / 80, py / 80, 51, 2);
    if(R() > sstep(0.52, 0.7, patch) * 0.8 * dens) continue;
    const kind = R() < 0.62 ? "pear" : "yucca", h = kind === "pear" ? 0.8 + R() * 0.7 : 1.1 + R() * 1.1;
    if(!fits(px, py, kind, h)) continue;
    put(kind, px, py, h, 1, nudge(0.25, 0.1));
  }
  // tall dry grass: tufts, in clumps; flowers in the spring palette in broad patches (bluebonnet, paintbrush)
  for(let y = Y0 + 300; y < Y0 + NY * STEP - 300; y += lite ? 11 : 6.5) for(let x = X0 + 300; x < X0 + NX * STEP - 300; x += lite ? 11 : 6.5){
    const px = x + R() * 6, py = y + R() * 6, bar = P.clearance(px, py);
    if(bar < 4.2 || bar > 220) continue;
    const g = fbm(px / 55, py / 55, 61, 2);
    if(R() > sstep(0.45, 0.68, g) * 0.75 * dens) continue;
    if(blocked(px, py, 1)) continue;
    const q = query(px, py);
    if(!q.far && q.bar < 4.2) continue;
    put("grass", px, py, 0.7 + R() * 0.7, 1, nudge(0.3, 0.3));
  }
  const FL = ["#3C56D8", "#4A6CF0", "#2E48B8", "#E8582A", "#F0703A", "#F2D24A", "#F4F0E8"];
  for(let y = Y0 + 300; y < Y0 + NY * STEP - 300; y += lite ? 26 : 16) for(let x = X0 + 300; x < X0 + NX * STEP - 300; x += lite ? 26 : 16){
    const px = x + R() * 16, py = y + R() * 16, bar = P.clearance(px, py);
    if(bar < 6 || bar > 260) continue;
    const g = fbm(px / 95, py / 95, 71, 3);
    if(R() > sstep(0.56, 0.74, g) * 0.9 * dens) continue;
    if(blocked(px, py, 2)) continue;
    // a patch is a handful of heads in one colour
    const col = FL[g > 0.65 ? ((R() * 3) | 0) : 3 + ((R() * 4) | 0)];
    for(let k = 0; k < 4; k++){ const ax = px + (R() - 0.5) * 7, ay = py + (R() - 0.5) * 7; if(blocked(ax, ay, 1) || P.clearance(ax, ay) < 5) continue; put("flowers", ax, ay, 0.6 + R() * 0.3, 1, col); }
  }
  P.stats.plants = Object.fromEntries(Object.keys(L).map(k => [k, L[k].length]));
  P.tm.plants = Date.now() - t0;
  P.stats.structs = { stands:S.stands.length, lots:S.lots.length, tents:S.tents.length, trucks:S.trucks.length, ponds:S.ponds.length, creekPts:S.creek.length, posts:S.posts.length, towers:S.towers.length, masts:S.masts.length };
  P.nodeAt = nodeAt; P.height = height; P.slopeAt = slopeAt;
  return P;
}

/* The audit: every plant and every post against the circuit (its run-off and barrier, both sides)
   and against the footprints. Returns the worst numbers. */
function auditCota(P, T){
  const out = { checked:0, tooClose:0, minBar:1e9, inFootprint:0, worst:null };
  const need = { liveOak:CLEAR.tree, elm:CLEAR.tree, mesquite:CLEAR.tree, juniper:CLEAR.tree, pear:CLEAR.scrub, yucca:CLEAR.scrub, grass:4.2 - 0.0, flowers:5 };
  for(const kind in P.lists){
    for(const it of P.lists[kind]){
      if(it.x == null) continue;
      out.checked++;
      const bar = P.clearance(it.x, it.y); out.minBar = Math.min(out.minBar, bar);
      if(bar < (need[kind] || 3) - 0.01){ out.tooClose++; if(!out.worst || bar < out.worst.bar) out.worst = { kind, bar, x:it.x, y:it.y }; }
      if(kind !== "grass" && kind !== "flowers" && P.blocked(it.x, it.y, 0.2)) out.inFootprint++;
    }
  }
  return out;
}

export { planCota, auditCota };
