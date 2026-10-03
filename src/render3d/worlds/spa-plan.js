/* ---------- Spa-Francorchamps: the plan ----------------------------------
   Everything about the Spa world that is numbers rather than meshes. No
   three.js and no DOM, so the whole plan and its clearance audit run in Node.

   The ground, the forest and the villages come from the real place
   (survey/spa.js): terrain heights and OpenStreetMap land cover sampled round
   the real lap. The game's lap is not the real shape, so the real place is
   carried across in lap coordinates: a point beside the game's track at lap
   distance s and offset o (+ is the right of the driving direction) is matched
   to the point at the same corner-pinned distance and the same offset beside
   the real track. Far from the circuit (past 380 m) that gives way to one
   overall fit of the game lap onto the real one (scale and turn), which is
   all the hills on the horizon need.

   Game space: x, y along the ground (y south), z up. */
import { SPAGEO } from '../../tracks/survey/spa.js';

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
function fbm(x, y, s, oct){ let a = 0.5, f = 1, sum = 0, nrm = 0;
  for(let o = 0; o < (oct || 3); o++){ sum += a * vnoise(x * f, y * f, s + o * 17); nrm += a; a *= 0.5; f *= 2.03; } return sum / nrm; }
const hex = c => [parseInt(c.slice(1, 3), 16) / 255, parseInt(c.slice(3, 5), 16) / 255, parseInt(c.slice(5, 7), 16) / 255];
const mixC = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const wrapU = u => ((u % 1) + 1) % 1;
const inU = (u, a, b) => a <= b ? (u >= a && u <= b) : (u >= a || u <= b);

/* the palette of the ground, sRGB: cool, damp Ardennes greens */
const GC = {
  meadow:hex("#5E8A3E"), meadowHi:hex("#7A9E4A"), lush:hex("#4F7A36"), verge:hex("#6C9446"),
  floor:hex("#33482A"), needle:hex("#3E3A2C"), moss:hex("#4C6634"), scrub:hex("#5C6A38"),
  village:hex("#6F8A4E"), yard:hex("#7E7058"), park:hex("#8A8C8E"), camp:hex("#7E9C52"),
  bank:hex("#6A6248"), earth:hex("#7A6A4E"), stream:hex("#4A5A3A"),
};

/* clearances, from the barrier line (half width + run-off + 2.6 m, where the Armco stands) */
const BAR = 2.6;

function planSpa(T, opts){
  opts = opts || {};
  const lite = opts.detail === 0;
  const D = SPAGEO.DATA;
  const n = T.n, half = T.half, R = rng(7177), Lg = T.length, ds = T.ds;
  const t0 = Date.now(), tm = {};
  const P = { stats:{}, tm };
  const Z = T.def.zones || {};

  /* ---- the corner-pinned map between game lap distance and real lap distance ---- */
  const A = D.anchors, Lr = D.lapLen, AA = [...A, [A[0][0] + Lg, A[0][1] + Lr]];
  const gToR = sg => { sg = ((sg - A[0][0]) % Lg + Lg) % Lg + A[0][0];
    for(let k = 0; k < AA.length - 1; k++){ const [g0, r0] = AA[k], [g1, r1] = AA[k + 1]; if(sg <= g1) return ((r0 + (r1 - r0) * (sg - g0) / (g1 - g0)) % Lr + Lr) % Lr; }
    return 0; };
  const rToG = sr => { sr = ((sr - A[0][1]) % Lr + Lr) % Lr + A[0][1];
    for(let k = 0; k < AA.length - 1; k++){ const [g0, r0] = AA[k], [g1, r1] = AA[k + 1]; if(sr <= r1) return ((g0 + (g1 - g0) * (sr - r0) / (r1 - r0)) % Lg + Lg) % Lg; }
    return 0; };
  P.gToR = gToR; P.rToG = rToG;

  /* ---- the real lap: position and normal at a real lap distance (60 m chord, as sampled) ---- */
  const RL = D.lap, RN = RL.length / 2, RC = new Float64Array(RN + 1);
  for(let k = 1; k <= RN; k++){ const a = (k - 1) % RN, b = k % RN; RC[k] = RC[k - 1] + Math.hypot(RL[b * 2] - RL[a * 2], RL[b * 2 + 1] - RL[a * 2 + 1]); }
  const realPt = s => { s = ((s % RC[RN]) + RC[RN]) % RC[RN]; let lo = 0, hi = RN; while(hi - lo > 1){ const m = (lo + hi) >> 1; if(RC[m] <= s) lo = m; else hi = m; }
    const a = lo % RN, b = (lo + 1) % RN, t = (s - RC[lo]) / Math.max(RC[lo + 1] - RC[lo], 1e-9); return [RL[a * 2] + (RL[b * 2] - RL[a * 2]) * t, RL[a * 2 + 1] + (RL[b * 2 + 1] - RL[a * 2 + 1]) * t]; };
  const realFrame = s => { const a = realPt(s - 30), b = realPt(s + 30), c = realPt(s), l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const tx = (b[0] - a[0]) / l, ty = (b[1] - a[1]) / l; return [c[0], c[1], -ty, tx]; };
  // a coarse table of it, for the inverse lookups
  const RF = []; for(let s = 0; s < Lr; s += 10) RF.push([s, ...realFrame(s)]);

  /* ---- one overall fit, game -> real, and back ---- */
  const F = D.fit, fc = Math.cos(F.th), fsn = Math.sin(F.th);
  const simGR = (x, y) => { const px = x - F.sx, py = y - F.sy; return [F.dx + F.s * (fc * px - fsn * py), F.dy + F.s * (fsn * px + fc * py)]; };
  const simRG = (x, y) => { const px = (x - F.dx) / F.s, py = (y - F.dy) / F.s; return [F.sx + fc * px + fsn * py, F.sy - fsn * px + fc * py]; };

  /* ---- the game lap: nearest piece, from anywhere ---- */
  const SUB = 3, subIdx = []; for(let i = 0; i < n; i += SUB) subIdx.push(i);
  const roOf = (i, side) => side >= 0 ? T.roR[i] : T.roL[i];
  const Q = { d:0, i:0, t:0, off:0, side:1, bar:0, z:0, i2:-1, d2:1e9, off2:0, t2:0 };
  const segAt = (x, y, i, out) => {
    // the exact nearest point on the polyline within 6 nodes of i
    // and the nearest barrier, which is not always beside the nearest road: run-off widths change along the lap
    let bd = Infinity; out.bar = Infinity;
    for(let k = -6; k <= 6; k++){
      const a = (i + k + n) % n, b = (a + 1) % n, ax = T.x[a], ay = T.y[a], dx = T.x[b] - ax, dy = T.y[b] - ay;
      const L2 = dx * dx + dy * dy || 1, t = clamp(((x - ax) * dx + (y - ay) * dy) / L2, 0, 1);
      const d = Math.hypot(x - ax - dx * t, y - ay - dy * t), off = (x - ax) * T.nx[a] + (y - ay) * T.ny[a], sd = off >= 0 ? 1 : -1;
      out.bar = Math.min(out.bar, d - half - Math.max(roOf(a, sd), roOf(b, sd)) - BAR);
      if(d < bd){ bd = d; out.i = a; out.t = t; out.d = d; out.off = off; }
    }
    return out;
  };
  const tmpA = { i:0, t:0, d:0, off:0, bar:0 }, tmpB = { i:0, t:0, d:0, off:0, bar:0 };
  function query(x, y){
    let b1 = -1, d1 = Infinity;
    for(const i of subIdx){ const dx = x - T.x[i], dy = y - T.y[i], d = dx * dx + dy * dy; if(d < d1){ d1 = d; b1 = i; } }
    segAt(x, y, b1, tmpA);
    Q.i = tmpA.i; Q.t = tmpA.t; Q.d = tmpA.d; Q.off = tmpA.off; Q.side = Q.off >= 0 ? 1 : -1;
    const j = (Q.i + 1) % n;
    Q.z = T.z[Q.i] + (T.z[j] - T.z[Q.i]) * Q.t;
    Q.bar = Q.bar1 = tmpA.bar; Q.bar2 = Infinity;
    // the nearest piece of a different part of the lap, for blending across the middle between two
    let b2 = -1, d2 = Infinity;
    for(const i of subIdx){ const di = Math.abs(((i - Q.i) % n + n + (n >> 1)) % n - (n >> 1)); if(di < 45) continue;
      const dx = x - T.x[i], dy = y - T.y[i], d = dx * dx + dy * dy; if(d < d2){ d2 = d; b2 = i; } }
    if(b2 >= 0){ segAt(x, y, b2, tmpB); Q.i2 = tmpB.i; Q.d2 = tmpB.d; Q.off2 = tmpB.off; Q.t2 = tmpB.t;
      // the clearance is from whichever barrier is nearer, this part of the lap or the other
      Q.bar2 = tmpB.bar; Q.bar = Math.min(Q.bar, tmpB.bar); }
    else { Q.i2 = -1; Q.d2 = 1e9; }
    return Q;
  }
  P.query = query;
  P.clearance = (x, y) => query(x, y).bar;

  /* game point -> real point, through a given piece of the lap (i, t, off) */
  const viaLap = (i, t, off) => { const sr = gToR((i + t) * ds), f = realFrame(sr); return [f[0] + f[2] * off, f[1] + f[3] * off, sr]; };
  const gameToReal = (x, y) => {
    const q = query(x, y), w = sstep(330, 430, q.d);
    if(w >= 1) return simGR(x, y);
    const a = viaLap(q.i, q.t, q.off);
    if(w <= 0) return a;
    const b = simGR(x, y); return [mix(a[0], b[0], w), mix(a[1], b[1], w)];
  };
  P.gameToReal = gameToReal;
  /* real point -> game point: the same thing the other way round */
  const realToGame = (rx, ry) => {
    let bd = Infinity, bs = 0, bo = 0;
    for(const f of RF){ const dx = rx - f[1], dy = ry - f[2], d = dx * dx + dy * dy; if(d < bd){ bd = d; bs = f[0]; } }
    // refine along the lap
    for(let s = bs - 10; s <= bs + 10; s += 1){ const f = realFrame(s), dx = rx - f[0], dy = ry - f[1], d = dx * dx + dy * dy; if(d < bd){ bd = d; bs = s; } }
    const f = realFrame(bs), dist = Math.sqrt(bd); bo = (rx - f[0]) * f[2] + (ry - f[1]) * f[3];
    const w = sstep(330, 430, dist);
    const sg = rToG(bs), i = Math.floor(sg / ds) % n, t = sg / ds - Math.floor(sg / ds), j = (i + 1) % n;
    const gx = mix(T.x[i], T.x[j], t) + mix(T.nx[i], T.nx[j], t) * bo, gy = mix(T.y[i], T.y[j], t) + mix(T.ny[i], T.ny[j], t) * bo;
    if(w <= 0) return [gx, gy, sg, bo];
    const b = simRG(rx, ry); return [mix(gx, b[0], w), mix(gy, b[1], w), sg, bo];
  };
  P.realToGame = realToGame;

  /* ---- the real ground, as heights over the real track beside it ---- */
  const NG = D.near, NS = NG.NS, NO = NG.NO, NW = 2 * NO + 1, OFF = NG.OFF;
  const K = D.range / D.rawRange;                         // the same scale the lap's heights got
  const relAt = (sr, o) => {                             // real ground height over the real track, metres (scaled)
    const fk = (((sr / Lr) * NS) % NS + NS) % NS, k0 = Math.floor(fk), k1 = (k0 + 1) % NS, u = fk - k0;
    const fj = clamp(o / OFF + NO, 0, NW - 1.0001), j0 = Math.floor(fj), v = fj - j0;
    const z = (k, j) => NG.z[k * NW + j] - NG.z[k * NW + NO];
    return K * ((z(k0, j0) * (1 - v) + z(k0, j0 + 1) * v) * (1 - u) + (z(k1, j0) * (1 - v) + z(k1, j0 + 1) * v) * u);
  };
  const FG = D.far, FN = FG.FN;
  const farAt = (rx, ry) => {                           // the real ground, metres over the lap's lowest point (scaled)
    const fx = clamp((rx - FG.cx) / FG.FS + (FN - 1) / 2, 0, FN - 1.001), fy = clamp((ry - FG.cy) / FG.FS + (FN - 1) / 2, 0, FN - 1.001);
    const c = Math.floor(fx), r = Math.floor(fy), u = fx - c, v = fy - r, k = r * FN + c;
    const z = (FG.z[k] * (1 - u) + FG.z[k + 1] * u) * (1 - v) + (FG.z[k + FN] * (1 - u) + FG.z[k + FN + 1] * u) * v;
    return (z - D.datum) * K;
  };

  P.farHeight = (x, y) => { const r = simGR(x, y); return farAt(r[0], r[1]); };

  /* ---- land cover: the real raster, run-length decoded ---- */
  const LD = D.land, LN = LD.N, LC = new Uint8Array(LN * LN), CODES = "ms_fypcrw";
  LD.rle.forEach((row, r) => { let c = 0, num = ""; for(const ch of row){ if(ch >= "0" && ch <= "9"){ num += ch; continue; } const k = num ? +num : 1; num = ""; const v = CODES.indexOf(ch); LC.fill(v < 0 ? 0 : v, r * LN + c, r * LN + c + k); c += k; } });
  const coverReal = (rx, ry) => { const c = Math.floor((rx - LD.X0) / LD.CELL), r = Math.floor((ry - LD.Y0) / LD.CELL); return (c < 0 || r < 0 || c >= LN || r >= LN) ? 3 : LC[r * LN + c]; };
  const C = { meadow:0, scrub:1, park:2, forest:3, yard:4, parking:5, camp:6, village:7, water:8 };
  P.C = C;

  /* ---- the terrain grid ---- */
  const bb = T.bounds, PAD = 650, STEP = opts.step || (lite ? 12 : 8);
  const X0 = bb.minX - PAD, Y0 = bb.minY - PAD;
  const NX = Math.ceil((bb.w + 2 * PAD) / STEP) + 1, NY = Math.ceil((bb.h + 2 * PAD) / STEP) + 1, NV = NX * NY;
  const H = new Float32Array(NV), DB = new Float32Array(NV), COV = new Uint8Array(NV), ZR = new Float32Array(NV), COL = new Float32Array(NV * 3);
  // a candidate height beside one piece of the lap
  const fromPiece = (x, y, i, t, off, d) => {
    const j = (i + 1) % n, side = off >= 0 ? 1 : -1, zr = T.z[i] + (T.z[j] - T.z[i]) * t;
    const edge = half + mix(roOf(i, side), roOf(j, side), t) + BAR, dband = d - edge - 3.4;
    const sr = gToR((i + t) * ds);
    const real = zr + relAt(sr, off);
    // the verge is the road's own height, 1 m under (the ribbons sit on it); then a bank or a cutting
    // into the real lie of the land, never steeper than the overhead camera can see over
    let z = dband <= 0 ? zr - 1.0 : mix(zr - 1.0 + 0.6 * sstep(2, 16, dband), real, sstep(0, 46, dband));
    if(dband > 0) z = clamp(z, zr - 0.4 - 0.95 * dband, zr - 0.4 + 0.55 * dband);
    return { z, zr, dband };
  };
  let maxRise = 0;
  for(let r = 0; r < NY; r++) for(let c = 0; c < NX; c++){
    const k = r * NX + c, x = X0 + c * STEP, y = Y0 + r * STEP;
    const q = query(x, y);
    const a = fromPiece(x, y, q.i, q.t, q.off, q.d);
    let z = a.z;
    /* Between two parts of the lap that run close (the game's Bus Stop is 95 m from the foot
       of Eau Rouge, and 20 m higher), the ground slopes evenly from one barrier to the other:
       each one's own ground, weighted by how far the point is from the other's barrier. */
    if(q.i2 >= 0 && q.bar1 > 0 && q.bar2 > 0 && q.bar2 < 160){
      const b = fromPiece(x, y, q.i2, q.t2, q.off2, q.d2);
      const w = sstep(160, 90, q.bar2);                 // fade the effect in as the other part gets near
      const lin2 = (z * q.bar2 + b.z * q.bar1) / (q.bar1 + q.bar2);
      z = mix(z, lin2, w);
    }
    // far out, the real hills by the overall fit
    const wf = sstep(330, 460, q.d);
    if(wf > 0){ const rp = simGR(x, y); z = mix(z, farAt(rp[0], rp[1]), wf); }
    H[k] = z; DB[k] = q.bar; ZR[k] = a.zr;
    const rp = gameToReal(x, y); COV[k] = coverReal(rp[0], rp[1]);
    maxRise = Math.max(maxRise, z - a.zr);
  }
  tm.grid = Date.now() - t0;
  // soften it past the verge: rolling, not lumpy (the surface models see tree tops and houses)
  for(let pass = 0; pass < 4; pass++){
    const src = H.slice();
    for(let r = 1; r < NY - 1; r++) for(let c = 1; c < NX - 1; c++){
      const k = r * NX + c; if(DB[k] < 6) continue;
      const w = sstep(6, 30, DB[k]);
      const av = (src[k] * 4 + src[k - 1] + src[k + 1] + src[k - NX] + src[k + NX] + (src[k - NX - 1] + src[k - NX + 1] + src[k + NX - 1] + src[k + NX + 1]) * 0.5) / 10;
      H[k] = mix(src[k], av, w);
    }
  }
  const G = { X0, Y0, STEP, NX, NY, H, DB, COV, COL };
  P.grid = G;
  const at = (Arr, x, y) => {
    const fx = clamp((x - X0) / STEP, 0, NX - 1.001), fy = clamp((y - Y0) / STEP, 0, NY - 1.001);
    const c = Math.floor(fx), r = Math.floor(fy), u = fx - c, v = fy - r, k = r * NX + c;
    return (Arr[k] * (1 - u) + Arr[k + 1] * u) * (1 - v) + (Arr[k + NX] * (1 - u) + Arr[k + NX + 1] * u) * v;
  };
  P.at = at;
  // the height of the ground as the mesh draws it: two triangles per square, split a-d-b / b-d-e
  const triH = (x, y) => {
    const fx = clamp((x - X0) / STEP, 0, NX - 1.001), fy = clamp((y - Y0) / STEP, 0, NY - 1.001);
    const c = Math.floor(fx), r = Math.floor(fy), u = fx - c, v = fy - r, k = r * NX + c;
    const a = H[k], b = H[k + 1], d = H[k + NX], e = H[k + NX + 1];
    return u + v <= 1 ? a + (b - a) * u + (d - a) * v : e + (d - e) * (1 - u) + (b - e) * (1 - v);
  };
  P.height = triH;
  const coverAt = (x, y) => { const c = clamp(Math.round((x - X0) / STEP), 0, NX - 1), r = clamp(Math.round((y - Y0) / STEP), 0, NY - 1); return COV[r * NX + c]; };
  P.coverAt = coverAt;
  const slopeAt = (x, y) => { const e = STEP; return Math.hypot(triH(x + e, y) - triH(x - e, y), triH(x, y + e) - triH(x, y - e)) / (2 * e); };

  /* ---- where things are on the lap ---- */
  const uOf = i => i / n, nodeOf = u => ((Math.round(wrapU(u) * n) % n) + n) % n;
  const ptAt = (u, off) => { const i = nodeOf(u); return { i, x:T.x[i] + T.nx[i] * off, y:T.y[i] + T.ny[i] * off, z:T.z[i], ang:T.ang[i] }; };
  const barOff = (i, side) => side * (half + roOf(i, side) + BAR);
  P.ptAt = ptAt; P.barOff = barOff;

  /* ---- what is standing: structures, with their footprints for the trees to keep out of ---- */
  const S = [];                     // every built thing: kind, x, y, z, ang and its own numbers
  const rects = [];                 // footprints: cx, cy, ux, uy, half length, half width
  const addRect = (cx, cy, ang, hl, hw) => rects.push({ cx, cy, ux:Math.cos(ang), uy:Math.sin(ang), hl, hw });
  const blocked = (x, y, r) => {
    for(const q of rects){ const dx = x - q.cx, dy = y - q.cy, a = dx * q.ux + dy * q.uy, b = -dx * q.uy + dy * q.ux;
      if(Math.abs(a) < q.hl + r && Math.abs(b) < q.hw + r) return true; }
    return false;
  };
  P.blocked = blocked; P.rects = rects; P.S = S;
  /* How far a footprint (centre, along-track angle, half length, half width) is from the
     nearest barrier: from every barrier, or (own >= 0) only from parts of the lap more than
     40 nodes from node own to their barriers, and its own stretch to the wall the cars feel, for
     things that stand behind their own lane, like the pits. */
  const footClear = (x, y, ang, hl, hw, own) => {
    const ux = Math.cos(ang), uy = Math.sin(ang); let worst = Infinity;
    const far = i => Math.abs(((i - own) % n + n + (n >> 1)) % n - (n >> 1)) > 40;
    for(const a of [-1, -0.5, 0, 0.5, 1]) for(const b of [-1, 0, 1]){
      const q = query(x + ux * a * hl - uy * b * hw, y + uy * a * hl + ux * b * hw);
      if(own == null) worst = Math.min(worst, q.bar);
      // its own stretch of lap only to the wall the cars feel (half + run-off); the rest to the Armco line
      else { worst = Math.min(worst, q.bar1 + (far(q.i) ? 0 : BAR)); if(q.i2 >= 0) worst = Math.min(worst, q.bar2 + (far(q.i2) ? 0 : BAR)); }
    }
    return worst;
  };
  /* A structure set back beside node u on one side: wid along the track, dep across. It starts
     behind the widest run-off along its whole length, then steps back until no corner of it is
     over any barrier (another part of the lap can be closer than this one); if it never fits,
     it is not built. Its front faces the track: the building's local +z. */
  const besideTrack = (kind, u, side, gap, wid, dep, extra) => {
    const i = nodeOf(u), span = Math.ceil(wid / 2 / ds) + 2;
    let ro = 0; for(let k = -span; k <= span; k++) ro = Math.max(ro, roOf((i + k + n) % n, side));
    const ang = T.ang[i] + (side > 0 ? Math.PI : 0);
    for(let push = 0; push <= 48; push += 4){
      const o = side * (half + ro + BAR + gap + push + dep / 2), x = T.x[i] + T.nx[i] * o, y = T.y[i] + T.ny[i] * o;
      if(footClear(x, y, T.ang[i], wid / 2, dep / 2) < 1.5) continue;
      const s = Object.assign({ kind, x, y, z:triH(x, y), ang, wid, dep, side, i, u }, extra || {});
      S.push(s); addRect(x, y, T.ang[i], wid / 2 + 3, dep / 2 + 3);
      return s;
    }
    P.dropped = (P.dropped || []).concat(kind + "@" + u);
    return null;
  };
  P.besideTrack = besideTrack;

  /* The pit building along the lane, and the paddock behind it, right of the straight. The
     garages face the lane over a working apron, just behind where the physical wall is on that
     side (the Armco is not drawn along the lane: def.noPitArmco); no module may reach another
     part of the lap (La Source turns back past the end of the paddock). */
  const ps = T.pitSide;
  /* The garages: 14 m deep, behind a 3 m apron. The run back from La Source passes behind the
     straight here, as it does at the real circuit, so the room is 15-34 m deep and the
     modules go only where they fit. */
  { const span = T.pitSpan, back = half + roOf(T.pitBox, ps) + 3;
    for(let k = Math.round(span * 0.14); k <= span - Math.round(span * 0.14); k += 7){
      const i = (T.pitIn + k) % n;
      const o = ps * (back + 7), x = T.x[i] + T.nx[i] * o, y = T.y[i] + T.ny[i] * o;
      if(footClear(x, y, T.ang[i], 25, 7, i) < 1.5) continue;
      S.push({ kind:"pits", x, y, z:T.z[i], ang:T.ang[i] + (ps > 0 ? Math.PI : 0), wid:50, dep:14, side:ps, i, u:uOf(i) });
      addRect(x, y, T.ang[i], 27, 9);
    }
    // the paddock: behind the garages where there is room, and out past the pit entry
    for(let k = -Math.round(140 / ds); k <= span; k += 7){
      const i = (T.pitIn + k + n) % n, o = ps * (back + 14 + 4 + 15), x = T.x[i] + T.nx[i] * o, y = T.y[i] + T.ny[i] * o;
      if(blocked(x, y, 1) || footClear(x, y, T.ang[i], 25, 15, i) < 1.5) continue;
      // on its own ground (the real paddock is terraced), but only where that ground is fairly level
      const ux = Math.cos(T.ang[i]), uy = Math.sin(T.ang[i]);
      const hs = [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]].map(([a, b]) => triH(x + ux * a * 25 - uy * b * 15, y + uy * a * 25 + ux * b * 15));
      if(Math.max(...hs) - Math.min(...hs) > 6) continue;
      S.push({ kind:"paddock", x, y, z:T.z[i], ang:T.ang[i] + (ps > 0 ? Math.PI : 0), wid:50, dep:30, side:ps, i, u:uOf(i), seed:k });
      addRect(x, y, T.ang[i], 27, 17);
    } }
  // the paddock sign, at the end of the paddock nearest the Bus Stop
  { const pads = S.filter(s => s.kind === "paddock"), first = pads[0];
    if(first){ const ii = (first.i - Math.round(36 / ds) + n) % n, o = ps * (half + roOf(ii, ps) + 3 + 26), x = T.x[ii] + T.nx[ii] * o, y = T.y[ii] + T.ny[ii] * o;
      if(!blocked(x, y, 2) && footClear(x, y, T.ang[ii], 11, 2, ii) > 1.5){ S.push({ kind:"paddocksign", x, y, z:T.z[ii], ang:T.ang[ii] + (ps > 0 ? Math.PI : 0), i:ii }); addRect(x, y, T.ang[ii], 14, 6); } } }
  // the start-light gantry over the line
  S.push({ kind:"startgantry", x:T.x[0], y:T.y[0], z:T.z[0], ang:T.ang[0], i:0 });

  /* Grandstands and spectator banks, where the real ones are (NOTES.md): a covered main
     stand across from the pits, La Source, Silver and Endurance down the hill, Raidillon at
     the top of the climb, then the outsides of Les Combes, Pouhon, Stavelot, Blanchimont and
     the Bus Stop. Banks are terraced grass slopes full of people, on the hillsides. */
  const stand = (u, side, wid, rows, roof, extra) => besideTrack("stand", u, side, 6, wid, 6 + rows * 0.85, Object.assign({ rows, roof }, extra || {}));
  const bank = (u, side, wid, dep) => besideTrack("bank", u, side, 5, wid, dep);
  stand(0.982, -ps, 150, 18, true, { main:true });
  stand(0.030, -1, 70, 12, true);
  stand(0.058, -1, 80, 10, false, { name:"silver" });
  stand(0.074, -1, 60, 9, false);
  stand(0.118, -1, 100, 16, true, { name:"raidillon" });
  bank(0.100, -1, 60, 26); bank(0.106, 1, 70, 30); bank(0.124, 1, 60, 26); bank(0.135, -1, 60, 22);
  stand(0.372, -1, 70, 11, false); bank(0.384, 1, 50, 20);
  stand(0.540, 1, 80, 11, false); bank(0.528, 1, 60, 24); bank(0.552, -1, 50, 18);
  stand(0.756, -1, 60, 10, false); bank(0.705, -1, 50, 18);
  stand(0.880, 1, 80, 12, true); bank(0.866, 1, 60, 24); bank(0.893, -1, 50, 18);
  stand(0.955, -1, 70, 12, false);
  // hospitality boxes: a glass row above the pits (part of the pit building) and a chalet row at Raidillon
  besideTrack("chalets", 0.131, -1, 34, 70, 10);

  /* The old buildings: a stone hotel with a bell turret outside La Source (fictional: the
     real old hotel is further back), the old Hotel de l'Eau Rouge on the right at the foot
     of the dip, and a low old pit row on the run down to it. */
  besideTrack("hotel", 0.032, -1, 46, 40, 18, { floors:3, name:"lasource" });
  // (the real one is on the right at the foot of the dip; try spots around there until one fits)
  for(const u of [0.091, 0.086, 0.081, 0.096, 0.076]){ if(besideTrack("oldhotel", u, 1, 14, 24, 13, { floors:3 })) break; }
  if(S.some(s => s.kind === "oldhotel")) P.dropped = (P.dropped || []).filter(d => !/^oldhotel/.test(d));
  besideTrack("oldpits", 0.062, 1, 14, 70, 8);
  /* Level the ground under everything built beside the track, so nothing hangs off the
     hillside or sinks into it: the pits and paddock at road height, the rest at the
     ground's own height in its middle, eased back into the slope over 7 m. */
  const flatten = (cx, cy, ang, hl, hw, z0) => {
    const ux = Math.cos(ang), uy = Math.sin(ang), R0 = Math.hypot(hl, hw) + 8;
    const c0 = Math.max(0, Math.floor((cx - R0 - X0) / STEP)), c1 = Math.min(NX - 1, Math.ceil((cx + R0 - X0) / STEP));
    const r0 = Math.max(0, Math.floor((cy - R0 - Y0) / STEP)), r1 = Math.min(NY - 1, Math.ceil((cy + R0 - Y0) / STEP));
    for(let rr = r0; rr <= r1; rr++) for(let cc = c0; cc <= c1; cc++){
      const k = rr * NX + cc; if(DB[k] < 4) continue;       // never the verge: that belongs to the road
      const dx = X0 + cc * STEP - cx, dy = Y0 + rr * STEP - cy, a = Math.abs(dx * ux + dy * uy) - hl, b = Math.abs(-dx * uy + dy * ux) - hw;
      const out = Math.hypot(Math.max(a, 0), Math.max(b, 0));
      if(out < 7) H[k] = mix(H[k], z0, 1 - sstep(0, 7, out));
    } };
  for(const s of S){
    if(s.kind === "startgantry") continue;
    const atRoad = s.kind === "pits";
    // a stand or a bank sits at the height of its front edge (its local +z, towards the track)
    const d2 = (s.dep || 0) / 2, fx = s.x - Math.sin(s.ang) * d2, fy = s.y + Math.cos(s.ang) * d2;
    s.z = atRoad ? T.z[s.i] - 0.25 : (s.kind === "stand" || s.kind === "bank") ? triH(fx, fy) : triH(s.x, s.y);
    // and a bank is a slope already: it is laid on the hill, rising as the hill does, not levelled into it
    if(s.kind === "bank"){ s.rise = triH(s.x + Math.sin(s.ang) * d2, s.y - Math.cos(s.ang) * d2) - s.z; continue; }
    const hl = s.kind === "pits" || s.kind === "paddock" ? 27 : s.kind === "paddocksign" ? 12 : (s.wid || 10) / 2 + 1, hw = (s.dep || 8) / 2 + (s.kind === "paddock" ? 2 : 1);
    flatten(s.x, s.y, T.ang[s.i], hl, hw, s.z - (s.kind === "bank" ? 0.3 : 0.15));
  }
  // marshal posts every 280 m or so, alternating sides; TV towers at the big corners
  { let side = 1;
    for(let u = 0.02; u < 1; u += 280 / Lg){
      const i = nodeOf(u); if(T.inPitZone(i)) continue;
      const o = barOff(i, side) + side * 2.2, x = T.x[i] + T.nx[i] * o, y = T.y[i] + T.ny[i] * o;
      if(!blocked(x, y, 3) && footClear(x, y, T.ang[i], 1.5, 1.2) > 0.3){ S.push({ kind:"marshal", x, y, z:triH(x, y), ang:T.ang[i] + (side > 0 ? Math.PI : 0), i }); addRect(x, y, T.ang[i], 2.5, 2.5); }
      side = -side;
    }
    for(const [u, side] of [[0.036, -1], [0.112, 1], [0.24, -1], [0.381, 1], [0.452, -1], [0.534, -1], [0.632, 1], [0.70, 1], [0.872, -1], [0.97, 1]]){
      const i = nodeOf(u), o = barOff(i, side) + side * 7, x = T.x[i] + T.nx[i] * o, y = T.y[i] + T.ny[i] * o;
      if(!blocked(x, y, 3) && footClear(x, y, T.ang[i], 1.8, 1.8) > 0.5){ S.push({ kind:"tvtower", x, y, z:triH(x, y), ang:T.ang[i], i }); addRect(x, y, T.ang[i], 3, 3); }
    } }

  /* ---- the real water, carried across: the Eau Rouge and the other streams near the lap ---- */
  const lines = D.lines;
  const mapLine = (flat, maxD) => { const out = [];
    for(let k = 0; k < flat.length; k += 2){ const g = realToGame(flat[k], flat[k + 1]); out.push([g[0], g[1]]); }
    // split where it passes too close to the circuit, or jumps
    const parts = []; let cur = [];
    for(const p of out){ const q = query(p[0], p[1]);
      const ok = q.bar > (maxD == null ? 4 : maxD) && q.d < 1500 && (!cur.length || Math.hypot(p[0] - cur[cur.length - 1][0], p[1] - cur[cur.length - 1][1]) < 160);
      if(ok) cur.push(p); else { if(cur.length > 1) parts.push(cur); cur = ok ? [p] : []; } }
    if(cur.length > 1) parts.push(cur);
    return parts; };
  // resample a polyline to a step
  const resample = (pts, step) => { const out = [pts[0]];
    for(let k = 1; k < pts.length; k++){ const a = pts[k - 1], b = pts[k], L = Math.hypot(b[0] - a[0], b[1] - a[1]), m = Math.max(1, Math.ceil(L / step));
      for(let s = 1; s <= m; s++) out.push([a[0] + (b[0] - a[0]) * s / m, a[1] + (b[1] - a[1]) * s / m]); }
    return out; };
  P.streams = [];
  for(const L0 of lines.stream){
    for(const part of mapLine(L0.p, -1e9)){
      const pts = resample(part, 6).filter(p => { const q = query(p[0], p[1]); return q.d < 900; });
      if(pts.length < 3) continue;
      P.streams.push({ name:L0.n, w:/Eau Rouge/.test(L0.n) ? 2.4 : 1.3, pts });
    }
  }
  /* The stream must run in its valley and under the track where the real one does: at the
     foot of Eau Rouge. Carve a channel along every stream that is not under the circuit,
     and let the water sit just in it. */
  const cut = (x, y, r, depth) => {
    const c0 = Math.floor((x - r - X0) / STEP), c1 = Math.ceil((x + r - X0) / STEP), r0 = Math.floor((y - r - Y0) / STEP), r1 = Math.ceil((y + r - Y0) / STEP);
    for(let rr = Math.max(0, r0); rr <= Math.min(NY - 1, r1); rr++) for(let cc = Math.max(0, c0); cc <= Math.min(NX - 1, c1); cc++){
      const k = rr * NX + cc; if(DB[k] < 3) continue;
      const d = Math.hypot(X0 + cc * STEP - x, Y0 + rr * STEP - y); if(d > r) continue;
      H[k] -= depth * (0.5 + 0.5 * Math.cos(Math.PI * d / r)) * sstep(3, 12, DB[k]);
    } };
  for(const s of P.streams){
    // the bed runs downhill: never let the water climb
    const zs = s.pts.map(p => triH(p[0], p[1]));
    for(let k = 1; k < zs.length; k++) zs[k] = Math.min(zs[k], zs[k - 1] + 0.02);
    const zs2 = zs.slice(); for(let k = zs.length - 2; k >= 0; k--) zs2[k] = Math.max(zs[k], Math.min(zs2[k], zs2[k + 1] + 3));
    s.pts.forEach((p, k) => { const h = triH(p[0], p[1]); cut(p[0], p[1], s.w * 5, Math.max(1.2, h - zs[k] + 1.2)); });
    s.z = s.pts.map(p => triH(p[0], p[1]) + 0.35);
  }
  // where the Eau Rouge passes under the track: the culvert
  { const iE = nodeOf(Z.stream || 0.09); let best = null;
    for(const s of P.streams){ if(!/Eau Rouge/.test(s.name)) continue;
      for(const p of s.pts){ const q = query(p[0], p[1]); const di = Math.abs(((q.i - iE) % n + n + (n >> 1)) % n - (n >> 1)); if(di < 25 && (!best || q.d < best.d)) best = { d:q.d, i:q.i }; } }
    P.culvert = { i:best ? best.i : iE, found:!!best }; }

  /* ---- roads and lanes, carried across the same way; never onto the circuit ---- */
  P.roads = [];
  for(const kind of ["road", "track"]){
    for(const L0 of lines[kind]){
      for(const part of mapLine(L0.p, 8)){
        const pts = resample(part, 8);
        if(pts.length < 2) continue;
        P.roads.push({ kind, w:kind === "track" ? 3 : L0.w > 1 ? 7 : 5.5, name:L0.n, pts:pts.map(p => [p[0], p[1], triH(p[0], p[1]) + 0.18]) });
      }
    }
  }
  // the roads flatten the ground under them a little, so they do not cut into the slope
  for(const r of P.roads) for(const p of r.pts){
    const c = Math.round((p[0] - X0) / STEP), rr = Math.round((p[1] - Y0) / STEP);
    if(c > 0 && rr > 0 && c < NX - 1 && rr < NY - 1 && DB[rr * NX + c] > 6){ for(const k of [rr * NX + c]) H[k] = mix(H[k], p[2] - 0.2, 0.5); }
  }
  for(const r of P.roads) for(const p of r.pts) p[2] = triH(p[0], p[1]) + 0.2;

  /* ---- villages and farms, from the real residential land and farmyards ---- */
  const nearRoad = (x, y) => { let bd = Infinity, ang = 0;
    for(const r of P.roads){ if(r.kind !== "road") continue; for(let k = 0; k < r.pts.length - 1; k++){ const a = r.pts[k], b = r.pts[k + 1], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
      const t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / L2, 0, 1), d = Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t); if(d < bd){ bd = d; ang = Math.atan2(dy, dx); } } }
    return [bd, ang]; };
  P.houses = []; P.farms = [];
  { const step = lite ? 34 : 26;
    for(let y = Y0 + 20; y < Y0 + (NY - 1) * STEP - 20; y += step) for(let x = X0 + 20; x < X0 + (NX - 1) * STEP - 20; x += step){
      const jx = x + (R() - 0.5) * step * 0.6, jy = y + (R() - 0.5) * step * 0.6;
      const cv = coverAt(jx, jy); if(cv !== C.village && cv !== C.yard) continue;
      const q = query(jx, jy); if(q.bar < 18) continue;
      if(slopeAt(jx, jy) > 0.32 || blocked(jx, jy, 10)) continue;
      const [rd, rang] = nearRoad(jx, jy); if(rd > 70 && R() < 0.6) continue;
      const ang = (rd < 70 ? rang : R() * Math.PI) + (R() < 0.5 ? 0 : Math.PI / 2) + (R() - 0.5) * 0.12;
      const farm = cv === C.yard || R() < 0.12;
      const h = { kind:farm ? "farm" : "house", x:jx, y:jy, z:triH(jx, jy), ang, l:farm ? 18 + R() * 6 : 10 + R() * 5, w:farm ? 10 + R() * 3 : 8 + R() * 2.5,
                  floors:R() < 0.35 ? 2 : 1 + (R() < 0.15 ? 2 : 0), style:Math.floor(R() * 4), smoke:R() < 0.18, d:q.d };
      (farm ? P.farms : P.houses).push(h); addRect(jx, jy, ang, h.l / 2 + 3, h.w / 2 + 3);
      if(farm){ // a barn beside it, and the yard
        const bx = jx + Math.cos(ang + Math.PI / 2) * 17, by = jy + Math.sin(ang + Math.PI / 2) * 17;
        if(!blocked(bx, by, 8) && query(bx, by).bar > 14){ P.farms.push({ kind:"barn", x:bx, y:by, z:triH(bx, by), ang, l:24 + R() * 8, w:12 + R() * 3 }); addRect(bx, by, ang, 16, 9); }
      }
    }
    // a cap, nearest the circuit first: the overhead camera never sees the far villages
    for(const L of [P.houses, P.farms]) L.sort((a, b) => (a.d || 0) - (b.d || 0));
    if(P.houses.length > (lite ? 120 : 260)) P.houses.length = lite ? 120 : 260;
  }
  // the village church (Francorchamps: Saint-Georges, as mapped) and an abbey with its spire towards Stavelot
  { const c = realToGame(-1536, -1821), q = query(c[0], c[1]);
    if(q.bar > 20){ P.church = { x:c[0], y:c[1], z:triH(c[0], c[1]), ang:0.3 }; addRect(c[0], c[1], 0.3, 22, 10); }
    // the real abbey is 5.5 km off; it stands on the edge of the world, in the right direction
    const st = realToGame(-2862, 4750), dx = st[0] - (bb.minX + bb.w / 2), dy = st[1] - (bb.minY + bb.h / 2), L = Math.hypot(dx, dy);
    const ax = bb.minX + bb.w / 2 + dx / L * 2100, ay = bb.minY + bb.h / 2 + dy / L * 2100;
    P.abbey = { x:ax, y:ay, z:farAt(...simGR(ax, ay)), ang:Math.atan2(dy, dx) }; }

  /* ---- campsites: the mapped ones, and the fields behind La Source and Blanchimont
     (Spa's camping is famous; which fields exactly is my choice) ---- */
  P.tents = [];
  { const isCamp = (x, y) => { const cv = coverAt(x, y); if(cv === C.camp) return true;
      if(cv !== C.meadow) return false; const q = query(x, y), u = q.i / n;
      return q.bar > 40 && q.bar < 260 && (inU(u, 0.985, 0.05) && q.side < 0 || inU(u, 0.85, 0.90) && q.side > 0 || inU(u, 0.36, 0.40) && q.side < 0); };
    const step = lite ? 14 : 10;
    for(let y = Y0; y < Y0 + (NY - 1) * STEP; y += step) for(let x = X0; x < X0 + (NX - 1) * STEP; x += step){
      const jx = x + (R() - 0.5) * 6, jy = y + (R() - 0.5) * 6; if(!isCamp(jx, jy) || slopeAt(jx, jy) > 0.2 || blocked(jx, jy, 4)) continue;
      if(fbm(jx / 60, jy / 60, 5, 2) < 0.45) continue;
      const r = R(), kind = r < 0.62 ? "tent" : r < 0.82 ? "van" : r < 0.92 ? "bigtent" : "flagpole";
      P.tents.push({ kind, x:jx, y:jy, z:triH(jx, jy), ang:R() * Math.PI * 2, tint:["#E8B33A", "#2F78B8", "#D8352A", "#3E8A4A", "#E8E4DA", "#F08A1E", "#7A4AA8"][Math.floor(R() * 7)] });
      addRect(jx, jy, 0, 3, 3);
    } }

  /* ---- parked cars in the mapped car parks near the lap ---- */
  P.cars = [];
  { const step = lite ? 10 : 7;
    for(let y = Y0; y < Y0 + (NY - 1) * STEP; y += step) for(let x = X0; x < X0 + (NX - 1) * STEP; x += step){
      if(coverAt(x, y) !== C.parking) continue; const q = query(x, y); if(q.bar < 12 || q.d > 600 || blocked(x, y, 2.5) || R() < 0.45) continue;
      P.cars.push({ x, y, z:triH(x, y), ang:0.4 + (R() < 0.5 ? 0 : Math.PI), tint:["#D8352A", "#2F78B8", "#E8E8E8", "#222428", "#8A9199", "#3E6A3A", "#E8B33A"][Math.floor(R() * 7)] });
    } }

  /* ---- the planting. Ardennes forest where the real forest is: spruce for the bulk, pine,
     beech, oak and birch, the odd one already turning. Dense behind the barriers, thinner
     in the open, taller up the hills, and cheaper the further it is from the circuit. ---- */
  const L = { spruce:[], pine:[], beech:[], oak:[], birch:[], spruceFar:[], broadFar:[], fern:[], shrub:[], hedge:[], flowers:[], bale:[], cow:[], sheep:[] };
  P.lists = L;
  const SP = [["spruce", 0.50], ["pine", 0.14], ["beech", 0.16], ["oak", 0.09], ["birch", 0.11]];
  const pickSp = (x, y) => { // groves: the mix drifts across the forest rather than being salt and pepper
    const g = fbm(x / 160, y / 160, 41, 2), r = R();
    let acc = 0; const w = SP.map(([k, p], j) => [k, p * (j === 0 ? 0.6 + g * 1.0 : j >= 2 ? 1.5 - g : 1)]);
    const tot = w.reduce((a, b) => a + b[1], 0);
    for(const [k, p] of w){ acc += p / tot; if(r <= acc) return k; } return "spruce"; };
  const canopyR = { spruce:0.19, pine:0.22, beech:0.36, oak:0.40, birch:0.26 };
  const tintFor = (k, x, y) => {
    const v = 0.85 + R() * 0.25, grv = fbm(x / 90, y / 90, 7, 2);
    if((k === "beech" || k === "oak" || k === "birch") && R() < 0.07) return R() < 0.5 ? [1.45 * v, 1.0 * v, 0.42 * v] : [1.3 * v, 1.12 * v, 0.5 * v];   // turning early
    if(k === "spruce" || k === "pine") return [v * (0.86 + grv * 0.2), v * (0.92 + grv * 0.14), v * 0.95];
    return [v * (0.9 + grv * 0.25), v, v * (0.82 + grv * 0.1)];
  };
  let tested = 0;
  const treeAt = (x, y, k, far) => {
    // well clear of the circuit the grid's own numbers are close enough; near it, ask exactly
    const dbg = at(DB, x, y), q = dbg > 40 ? { bar:dbg, z:at(ZR, x, y) } : query(x, y); tested++;
    const h0 = k === "spruce" ? 19 : k === "pine" ? 18 : k === "birch" ? 13 : k === "oak" ? 15 : 17;
    // taller up the hills and further from the circuit
    const up = clamp((triH(x, y) - q.z) / 30, -0.3, 0.6), farK = sstep(20, 240, q.bar);
    const h = h0 * (0.75 + R() * 0.45) * (1 + up * 0.25 + farK * 0.2);
    const cr = h * canopyR[k] * (far ? 1.1 : 1);
    if(q.bar < cr + 2.0) return false;                     // never over the barrier, the run-off or the track
    if(blocked(x, y, cr * 0.8)) return false;
    if(slopeAt(x, y) > 0.9) return false;
    const it = { x, y, z:triH(x, y) - 0.3, h, ry:R() * Math.PI * 2, tint:tintFor(k, x, y), lx:(R() - 0.5) * 0.05, ly:(R() - 0.5) * 0.05, cr, shade:q.bar < 60 };
    if(far) L[k === "spruce" || k === "pine" ? "spruceFar" : "broadFar"].push(it); else L[k].push(it);
    return true;
  };
  const xmax = X0 + (NX - 1) * STEP, ymax = Y0 + (NY - 1) * STEP;
  { // spacing by how far from the barrier: full near the circuit, then sparser and cheaper
    const sp = lite ? [8.5, 13, 22] : [6.4, 9.5, 16];
    const cell = sp[0];
    for(let y = Y0 + 4; y < ymax - 4; y += cell) for(let x = X0 + 4; x < xmax - 4; x += cell){
      const db = at(DB, x, y); if(db < 2) continue;
      const band = db < 150 ? 0 : db < 360 ? 1 : 2;
      // the sparser bands only keep some of the cells
      if(band === 1 && hash2(Math.floor(x / cell), Math.floor(y / cell), 3) > (sp[0] / sp[1]) ** 2) continue;
      if(band === 2 && hash2(Math.floor(x / cell), Math.floor(y / cell), 4) > (sp[0] / sp[2]) ** 2) continue;
      const jx = x + (R() - 0.5) * cell * 0.9, jy = y + (R() - 0.5) * cell * 0.9;
      const cv = coverAt(jx, jy);
      let p = 0;
      if(cv === C.forest) p = 0.92 - 0.35 * sstep(0.62, 0.72, fbm(jx / 70, jy / 70, 13, 2));          // clearings
      else if(cv === C.scrub) p = 0.35;
      else if(cv === C.village) p = 0.08;
      else if(cv === C.meadow){
        // tree lines and copses along the edges of the fields, the odd tree out in them
        const edge = [[12, 0], [-12, 0], [0, 12], [0, -12]].some(([a, b]) => coverAt(jx + a, jy + b) === C.forest);
        p = edge ? 0.55 : 0.012 + 0.05 * sstep(0.68, 0.8, fbm(jx / 45, jy / 45, 17, 2));
      }
      // thinner right by the circuit, so the barrier and the banks show
      p *= db < 6 ? 0.25 : db < 14 ? 0.6 : 1;
      if(R() > p) continue;
      treeAt(jx, jy, pickSp(jx, jy), band === 2);
    }
  }
  tm.trees = Date.now() - t0;

  /* ---- undergrowth near the circuit: ferns and bracken under the trees, shrubs at the forest
     edge, hedges along the lanes, wild flowers and hay bales in the meadows, cows and sheep ---- */
  if(!lite){
    for(let y = Y0 + 2; y < ymax - 2; y += 4.5) for(let x = X0 + 2; x < xmax - 2; x += 4.5){
      const db = at(DB, x, y); if(db < 1.5 || db > 70) continue;
      const jx = x + (R() - 0.5) * 4, jy = y + (R() - 0.5) * 4, cv = coverAt(jx, jy);
      if(blocked(jx, jy, 1)) continue;
      const z = triH(jx, jy) - 0.1;
      if(cv === C.forest || cv === C.scrub){
        if(R() < 0.45) L.fern.push({ x:jx, y:jy, z, h:0.7 + R() * 0.8, w:1.6, ry:R() * 6.3, tint:R() < 0.25 ? [1.25, 1.0, 0.55] : [0.9 + R() * 0.2, 1, 0.9] });
        else if(R() < 0.18 && db > 3) L.shrub.push({ x:jx, y:jy, z, h:1.2 + R() * 1.4, w:1.3, ry:R() * 6.3, tint:[0.9 + R() * 0.2, 1, 0.9] });
      } else if(cv === C.meadow){
        if(fbm(jx / 30, jy / 30, 29, 2) > 0.58 && R() < 0.5) L.flowers.push({ x:jx, y:jy, z, h:0.6 + R() * 0.4, w:1.4, ry:R() * 6.3,
          tint:[["#F4E04A", "#FFFFFF", "#C8A2E8", "#E86A6A", "#F4F0D8"][Math.floor(R() * 5)]].map(hex)[0] });
      }
    }
    // hedges along the lanes, where they run through open land near the circuit
    for(const r of P.roads){ if(r.kind !== "road") continue;
      for(let k = 0; k < r.pts.length - 1; k += 1){ const a = r.pts[k], b = r.pts[k + 1];
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, q = query(mx, my); if(q.bar < 10 || q.bar > 260) continue;
        if(coverAt(mx, my) !== C.meadow || R() < 0.3) continue;
        const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), nx = -Math.sin(ang), ny = Math.cos(ang), side = R() < 0.5 ? 1 : -1, off = r.w / 2 + 2.2;
        const hx = mx + nx * off * side, hy = my + ny * off * side; if(blocked(hx, hy, 1) || query(hx, hy).bar < 6) continue;
        L.hedge.push({ x:hx, y:hy, z:triH(hx, hy) - 0.1, ry:-ang, sx:Math.hypot(b[0] - a[0], b[1] - a[1]) * 1.05, sy:1.4 + R() * 0.5, sz:1.3, tint:[0.9 + R() * 0.2, 1, 0.92] });
      } }
  }
  // hay bales, cows and sheep out in the fields (where the camera might catch them)
  { const herds = []; let tries = 0;
    while(herds.length < (lite ? 6 : 14) && tries++ < 4000){
      const i = Math.floor(R() * n), side = R() < 0.5 ? 1 : -1, o = side * (half + 60 + R() * 220);
      const x = T.x[i] + T.nx[i] * o, y = T.y[i] + T.ny[i] * o;
      if(coverAt(x, y) !== C.meadow || slopeAt(x, y) > 0.25 || query(x, y).bar < 40 || blocked(x, y, 20)) continue;
      herds.push({ x, y, kind:herds.length % 3 === 2 ? "bale" : herds.length % 3 === 1 ? "sheep" : "cow" });
    }
    for(const hd of herds){
      const m = hd.kind === "sheep" ? 14 : hd.kind === "cow" ? 8 : 10;
      for(let k = 0; k < m; k++){ const x = hd.x + (R() - 0.5) * 50, y = hd.y + (R() - 0.5) * 50;
        if(coverAt(x, y) !== C.meadow || query(x, y).bar < 30 || blocked(x, y, 2)) continue;
        L[hd.kind].push({ x, y, z:triH(x, y), ry:R() * 6.3, h:1, w:1, tint:hd.kind === "cow" ? (R() < 0.5 ? [1, 1, 1] : [0.35, 0.28, 0.22]) : [1, 1, 1] }); }
    }
    P.herds = herds; }

  /* ---- people: on the banks and in the stands; where they stand is the world's business,
     this only says how many each one holds ---- */
  P.stats = { grid:NX + "x" + NY, step:STEP, tested, trees:L.spruce.length + L.pine.length + L.beech.length + L.oak.length + L.birch.length,
    farTrees:L.spruceFar.length + L.broadFar.length, under:L.fern.length + L.shrub.length + L.flowers.length + L.hedge.length,
    houses:P.houses.length, farms:P.farms.length, tents:P.tents.length, cars:P.cars.length, structures:S.length, streams:P.streams.length,
    roads:P.roads.length, culvert:P.culvert, maxRise:+maxRise.toFixed(1) };
  tm.total = Date.now() - t0;
  return P;
}

/* ---- the clearance audit: every tree, building and prop against the circuit ---- */
function auditSpa(P, T){
  const out = { worstTree:Infinity, treesOnRoad:0, worstBuilding:Infinity, buildingsOnRoad:0, checked:0 };
  // the exact distance from the centreline spline (every segment), minus the barrier line
  const half = T.half, n = T.n;
  // (own: for the pits, their own straight is measured to its physical wall, half + run-off, not to the Armco line)
  const exactBar = (x, y, own) => { let best = Infinity;
    for(let i = 0; i < n; i++){ const j = (i + 1) % n, ax = T.x[i], ay = T.y[i], dx = T.x[j] - ax, dy = T.y[j] - ay, L2 = dx * dx + dy * dy || 1;
      const t = clamp(((x - ax) * dx + (y - ay) * dy) / L2, 0, 1), d = Math.hypot(x - ax - dx * t, y - ay - dy * t);
      const side = ((x - ax) * T.nx[i] + (y - ay) * T.ny[i]) >= 0 ? 1 : -1, ro = side > 0 ? T.roR[i] : T.roL[i];
      const mine = own != null && Math.abs(((i - own) % n + n + (n >> 1)) % n - (n >> 1)) <= 40;
      best = Math.min(best, d - half - ro - (mine ? 0 : BAR)); }
    return best; };
  for(const k of ["spruce", "pine", "beech", "oak", "birch", "spruceFar", "broadFar"]) for(const t of P.lists[k]){
    const b = exactBar(t.x, t.y) - t.cr; out.checked++;
    if(b < out.worstTree) out.worstTree = b; if(b < 0) out.treesOnRoad++; }
  for(const h of [...P.houses, ...P.farms]){ const b = exactBar(h.x, h.y) - Math.max(h.l, h.w) / 2; if(b < out.worstBuilding) out.worstBuilding = b; if(b < 0) out.buildingsOnRoad++; }
  /* the stands, banks, pits and posts: every corner of the footprint must be behind the
     barrier (the pits stand behind the pit wall, so they are measured from the lane) */
  out.worstStructure = Infinity; out.structuresOnRoad = []; out.worstSmall = Infinity;
  for(const s of P.S){
    if(s.kind === "startgantry") continue;
    const hl = (s.kind === "pits" || s.kind === "paddock" ? 25 : s.kind === "paddocksign" ? 10 : (s.wid || 3) / 2), hw = s.kind === "paddocksign" ? 1 : (s.dep || 3) / 2;
    const c = Math.cos(s.ang), sn = Math.sin(s.ang);
    let worst = Infinity;
    const own = s.kind === "pits" || s.kind === "paddock" || s.kind === "paddocksign" ? s.i : null;
    for(const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1]]){ const lx = a * hl, lz = b * hw; worst = Math.min(worst, exactBar(s.x + lx * c - lz * sn, s.y + lx * sn + lz * c, own)); }
    if(worst < out.worstStructure) out.worstStructure = worst;
    if(worst < 0) out.structuresOnRoad.push(s.kind + "@" + (s.i / n).toFixed(3) + ":" + worst.toFixed(1));
  }
  for(const t of [...P.tents, ...P.cars]){ const b = exactBar(t.x, t.y) - 3; if(b < out.worstSmall) out.worstSmall = b; }
  out.worstStructure = +out.worstStructure.toFixed(2); out.worstSmall = +out.worstSmall.toFixed(2); out.dropped = P.dropped || [];
  out.worstTree = +out.worstTree.toFixed(2); out.worstBuilding = +out.worstBuilding.toFixed(2);
  return out;
}

export { auditSpa, planSpa };
