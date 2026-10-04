/* ---------- Interlagos: the plan ------------------------------------------
   Everything about the Interlagos world that is numbers rather than meshes. No
   three.js and no DOM, so the whole plan and its clearance audit run in Node.

   The bowl, the lake, the green grounds and the city round them come from the
   real place (survey/interlagos.js): SRTM heights and OpenStreetMap land cover
   sampled round the real lap, carried onto the game's lap in lap coordinates
   (the same machinery as Spa's plan: a point at lap distance s and offset o
   beside the game's track is matched to the point at the corner-pinned real
   distance and the same offset beside the real track; far out, one overall fit).

   Game space: x, y along the ground (y south), z up. */
import { ILGGEO } from '../../tracks/survey/interlagos.js';

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

/* clearances, from the barrier line (half width + run-off + 2.6 m, where the Armco stands) */
const BAR = 2.6;

function planIlg(T, opts){
  opts = opts || {};
  const lite = opts.detail === 0;
  const D = ILGGEO.DATA;
  const n = T.n, half = T.half, R = rng(4309), Lg = T.length, ds = T.ds;
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

  /* ---- land cover: the real raster, run-length decoded. Unmapped land is the city ('b');
     inside the circuit's own grounds (the infield, and 60 m past the barriers) it is grass ---- */
  const LD = D.land, LN = LD.N, LC = new Uint8Array(LN * LN), CODES = "bmskfpitwe";
  LD.rle.forEach((row, r) => { let c = 0, num = ""; for(const ch of row){ if(ch >= "0" && ch <= "9"){ num += ch; continue; } const k = num ? +num : 1; num = ""; const v = CODES.indexOf(ch); LC.fill(v < 0 ? 0 : v, r * LN + c, r * LN + c + k); c += k; } });
  const coverReal = (rx, ry) => { const c = Math.floor((rx - LD.X0) / LD.CELL), r = Math.floor((ry - LD.Y0) / LD.CELL); return (c < 0 || r < 0 || c >= LN || r >= LN) ? 0 : LC[r * LN + c]; };
  const C = { built:0, grass:1, scrub:2, pitch:3, trees:4, parking:5, industry:6, kart:7, water:8, wetland:9 };
  P.C = C;
  // inside the game's lap (the infield): crossing count against the centreline
  const inField = (x, y) => { let c = false; for(let i = 0, j = n - 1; i < n; j = i++){ const yi = T.y[i], yj = T.y[j]; if((yi > y) !== (yj > y) && x < T.x[i] + (y - yi) * (T.x[j] - T.x[i]) / (yj - yi)) c = !c; } return c; };
  P.inField = inField;

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
    /* Between two parts of the lap that run close (and the game's lap folds
       back on itself in places), the ground slopes evenly from one barrier to the other:
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
    const rp = gameToReal(x, y); let cv = coverReal(rp[0], rp[1]);
    if((cv === C.built || cv === C.industry) && (q.bar < 60 || inField(x, y))) cv = C.grass;   // the circuit's own grounds
    COV[k] = cv;
    maxRise = Math.max(maxRise, z - a.zr);
  }
  tm.grid = Date.now() - t0;
  // soften it past the verge: rolling, not lumpy (the surface model sees roofs and tree tops)
  for(let pass = 0; pass < 6; pass++){
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

  /* ---- the lake and the ponds: every patch of mapped water (and wetland) near the circuit,
     a flat surface at the height of its lowest shore, the ground under it scooped out, an
     island in a big one, reeds along the edge ---- */
  P.lakes = [];
  { const seen = new Uint8Array(NV), Q2 = [];
    for(let k0 = 0; k0 < NV; k0++){
      if(seen[k0] || (COV[k0] !== C.water && COV[k0] !== C.wetland) || DB[k0] < 8) continue;
      const cells = []; Q2.length = 0; Q2.push(k0); seen[k0] = 1; let wet = 0;
      while(Q2.length){ const k = Q2.pop(); cells.push(k); if(COV[k] === C.wetland) wet++;
        const c = k % NX, r = (k / NX) | 0;
        for(const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]){ const cc = c + dc, rr = r + dr; if(cc < 0 || rr < 0 || cc >= NX || rr >= NY) continue;
          const kk = rr * NX + cc; if(!seen[kk] && (COV[kk] === C.water || COV[kk] === C.wetland) && DB[kk] >= 8){ seen[kk] = 1; Q2.push(kk); } } }
      if(cells.length < 5) continue;
      // the level: the lowest ground on its shore, less a little
      const inSet = new Set(cells); let level = Infinity; const shore = [];
      for(const k of cells){ const c = k % NX, r = (k / NX) | 0;
        for(const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]){ const kk = (r + dr) * NX + c + dc; if(!inSet.has(kk)){ level = Math.min(level, H[kk] ?? H[k]); shore.push(k); break; } } }
      level -= 0.4;
      let cx = 0, cy = 0; for(const k of cells){ cx += X0 + (k % NX) * STEP; cy += Y0 + ((k / NX) | 0) * STEP; } cx /= cells.length; cy /= cells.length;
      const lake = { cells, level, shore, cx, cy, marsh:wet > cells.length * 0.5, area:cells.length * STEP * STEP };
      for(const k of cells) H[k] = Math.min(H[k], level - (shore.includes(k) ? 0.6 : 2.2));
      // a small island in a big lake (my addition: the real lake's islands are not mapped)
      if(lake.area > 6000 && !lake.marsh){
        let best = null; for(const k of cells){ const x = X0 + (k % NX) * STEP, y = Y0 + ((k / NX) | 0) * STEP; const d = Math.hypot(x - cx, y - cy); if(!best || d < best.d) best = { d, x, y }; }
        lake.island = { x:best.x, y:best.y, r:Math.min(16, Math.sqrt(lake.area) * 0.12) };
        for(const k of cells){ const x = X0 + (k % NX) * STEP, y = Y0 + ((k / NX) | 0) * STEP, d = Math.hypot(x - best.x, y - best.y);
          if(d < lake.island.r * 1.6) H[k] = Math.max(H[k], level + 1.4 * (1 - sstep(lake.island.r * 0.6, lake.island.r * 1.6, d)) - 0.8 * sstep(lake.island.r, lake.island.r * 1.6, d)); }
      }
      P.lakes.push(lake);
    }
    P.lakes.sort((a, b) => b.area - a.area);
  }

  /* ---- where things are on the lap ---- */
  const uOf = i => i / n, nodeOf = u => ((Math.round(wrapU(u) * n) % n) + n) % n;
  const ptAt = (u, off) => { const i = nodeOf(u); return { i, x:T.x[i] + T.nx[i] * off, y:T.y[i] + T.ny[i] * off, z:T.z[i], ang:T.ang[i] }; };
  const barOff = (i, side) => side * (half + roOf(i, side) + BAR);
  P.ptAt = ptAt; P.barOff = barOff;

  /* ---- what is standing: structures, with their footprints for the trees to keep out of ---- */
  const S = [];                     // every built thing: kind, x, y, z, ang and its own numbers
  // footprints: cx, cy, ux, uy, half length, half width; hashed in 50 m cells (a city is thousands of them)
  const rects = [], FH = 50, fhash = new Map();
  const addRect = (cx, cy, ang, hl, hw) => {
    const q = { cx, cy, ux:Math.cos(ang), uy:Math.sin(ang), hl, hw }, rr = Math.hypot(hl, hw); rects.push(q);
    for(let a = Math.floor((cx - rr) / FH); a <= Math.floor((cx + rr) / FH); a++) for(let b = Math.floor((cy - rr) / FH); b <= Math.floor((cy + rr) / FH); b++){
      const key = a + "," + b; let l = fhash.get(key); if(!l){ l = []; fhash.set(key, l); } l.push(q); } };
  const blocked = (x, y, r) => {
    for(let a = Math.floor((x - r) / FH); a <= Math.floor((x + r) / FH); a++) for(let b = Math.floor((y - r) / FH); b <= Math.floor((y + r) / FH); b++){
      for(const q of fhash.get(a + "," + b) || []){ const dx = x - q.cx, dy = y - q.cy, aa = dx * q.ux + dy * q.uy, bb = -dx * q.uy + dy * q.ux;
        if(Math.abs(aa) < q.hl + r && Math.abs(bb) < q.hw + r) return true; } }
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
     part of the lap. */
  const ps = T.pitSide;
  /* The garages: 14 m deep, behind a 3 m apron; the modules go only where they fit. */
  { const span = T.pitSpan, back = half + roOf(T.pitBox, ps) + 3;
    // the garages line the pit straight only, up to the line (the rest of the lane is the long exit road)
    const toLine = ((n - T.pitIn) % n) || n;
    for(let k = Math.round(span * 0.14); k <= Math.min(span - Math.round(span * 0.14), toLine - 3); k += 7){
      const i = (T.pitIn + k) % n;
      const o = ps * (back + 7), x = T.x[i] + T.nx[i] * o, y = T.y[i] + T.ny[i] * o;
      if(footClear(x, y, T.ang[i], 25, 7, i) < 1.5) continue;
      S.push({ kind:"pits", x, y, z:T.z[i], ang:T.ang[i] + (ps > 0 ? Math.PI : 0), wid:50, dep:14, side:ps, i, u:uOf(i) });
      addRect(x, y, T.ang[i], 27, 9);
    }
    // the paddock: behind the garages where there is room, and out past the pit entry
    for(let k = -Math.round(140 / ds); k <= toLine; k += 7){
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

  /* Grandstands and spectator banks: the covered main stand across the straight from the pits
     and the stands round the Senna S (as mapped), then grassy banks on the outside of the
     corners all round the bowl, packed with people. Which corners have banks is my reading:
     the real circuit's natural slopes are used as spectator areas in many places. */
  const stand = (u, side, wid, rows, roof, extra) => besideTrack("stand", u, side, 6, wid, 6 + rows * 0.85, Object.assign({ rows, roof }, extra || {}));
  const bank = (u, side, wid, dep) => besideTrack("bank", u, side, 5, wid, dep);
  stand(0.955, 1, 220, 22, true, { main:true, seat:"#2E8B45" });
  stand(0.010, 1, 120, 16, true);
  stand(0.048, 1, 110, 16, true, { name:"senna", seat:"#E8C02A" });
  stand(0.075, 1, 80, 14, false);
  stand(0.105, 1, 70, 12, false);
  stand(0.86, 1, 90, 12, true);
  for(const [u, side, w, d] of [[0.135, 1, 70, 24], [0.20, 1, 80, 26], [0.31, 1, 70, 26], [0.345, 1, 60, 22], [0.43, -1, 60, 24], [0.47, -1, 50, 22],
                                [0.525, 1, 60, 24], [0.59, -1, 60, 24], [0.63, 1, 60, 22], [0.705, 1, 70, 26], [0.75, 1, 70, 24], [0.80, 1, 80, 26],
                                [0.30, -1, 50, 18], [0.66, -1, 50, 18]]) bank(u, side, w, d);
  // big screens facing the main stand and the Senna S
  besideTrack("screen", 0.030, -1, 18, 16, 3);
  besideTrack("screen", 0.79, -1, 18, 16, 3);
  // food stalls behind the main stand and the Senna S stands
  for(const u of [0.94, 0.965, 0.99, 0.03, 0.06]) besideTrack("stalls", u, 1, 30, 24, 5);
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

  /* ---- the real water, carried across: the streams near the lap ---- */
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
      P.streams.push({ name:L0.n, w:/^Rio /.test(L0.n) ? 3 : 1.4, pts });
    }
  }
  /* The streams run in their valleys: carve a channel along every one that is not under the
     circuit, and let the water sit just in it. */
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
  P.culvert = null;

  /* ---- roads and lanes, carried across the same way; never onto the circuit ---- */
  P.roads = [];
  for(const kind of ["road"]){
    for(const L0 of lines[kind]){
      for(const part of mapLine(L0.p, 8)){
        const pts = resample(part, 8);
        if(pts.length < 2) continue;
        P.roads.push({ kind:"road", w:L0.w === 3 ? 12 : L0.w === 2 ? 8 : 6, name:L0.n, pts:pts.map(p => [p[0], p[1], triH(p[0], p[1]) + 0.18]) });
      }
    }
  }
  // the roads flatten the ground under them a little, so they do not cut into the slope
  for(const r of P.roads) for(const p of r.pts){
    const c = Math.round((p[0] - X0) / STEP), rr = Math.round((p[1] - Y0) / STEP);
    if(c > 0 && rr > 0 && c < NX - 1 && rr < NY - 1 && DB[rr * NX + c] > 6){ for(const k of [rr * NX + c]) H[k] = mix(H[k], p[2] - 0.2, 0.5); }
  }
  for(const r of P.roads) for(const p of r.pts) p[2] = triH(p[0], p[1]) + 0.2;

  /* ---- the streets, hashed, for "how far to the nearest street and which way does it run" ---- */
  const RCELL = 40, rh = new Map();
  P.roads.forEach((r, ri) => { for(let k = 0; k < r.pts.length - 1; k++){ const a = r.pts[k], b = r.pts[k + 1];
    for(const [x, y] of [a, b, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]]){ const key = Math.floor(x / RCELL) + "," + Math.floor(y / RCELL); let l = rh.get(key); if(!l){ l = []; rh.set(key, l); } l.push([ri, k]); } } });
  const nearRoad = (x, y) => { let bd = Infinity, ang = 0, w = 6; const cx = Math.floor(x / RCELL), cy = Math.floor(y / RCELL);
    for(let a = -1; a <= 1; a++) for(let b = -1; b <= 1; b++){ for(const [ri, k] of rh.get((cx + a) + "," + (cy + b)) || []){
      const r = P.roads[ri], p0 = r.pts[k], p1 = r.pts[k + 1], dx = p1[0] - p0[0], dy = p1[1] - p0[1], L2 = dx * dx + dy * dy || 1;
      const t = clamp(((x - p0[0]) * dx + (y - p0[1]) * dy) / L2, 0, 1), d = Math.hypot(x - p0[0] - dx * t, y - p0[1] - dy * t) - r.w / 2;
      if(d < bd){ bd = d; ang = Math.atan2(dy, dx); w = r.w; } } }
    return [bd, ang, w]; };
  P.nearRoad = nearRoad;

  /* ---- the city: low houses in rows along the streets on every built-up cell outside the circuit,
     a few tower blocks further out (some with a helipad on the roof), warehouses on the industrial
     land. The walls are every colour; the roofs are terracotta tiles or flat slabs with a water tank. ---- */
  P.houses = []; P.towers = []; P.sheds = [];
  { const step = lite ? 14 : 10.5;
    const WALLS = ["#E8C9A0", "#D97B5A", "#7FB3C8", "#E8D86A", "#9CC98A", "#F2EEE4", "#C98AA8", "#B8634A", "#E8A65A", "#8AA8D8", "#D8D2C4", "#A0583E"];
    for(let y = Y0 + 10; y < Y0 + (NY - 1) * STEP - 10; y += step) for(let x = X0 + 10; x < X0 + (NX - 1) * STEP - 10; x += step){
      const jx = x + (R() - 0.5) * 2.5, jy = y + (R() - 0.5) * 2.5, cv = coverAt(jx, jy);
      if(cv !== C.built && cv !== C.industry) continue;
      const db = at(DB, jx, jy); if(db < 60) continue;
      const [rd, rang, rw] = nearRoad(jx, jy); if(rd < 3) continue;
      if(slopeAt(jx, jy) > 0.7 || blocked(jx, jy, 4)) continue;
      const ang = (rd < 60 ? rang : R() * Math.PI) + (R() < 0.5 ? 0 : Math.PI);
      if(cv === C.industry){ if(R() < 0.75) continue;
        const sh = { x:jx, y:jy, z:triH(jx, jy), ang, l:24 + R() * 16, w:16 + R() * 8, h:7 + R() * 4, d:db }; P.sheds.push(sh); addRect(jx, jy, ang, sh.l / 2 + 2, sh.w / 2 + 2); continue; }
      // tower blocks in clusters, further out
      if(db > 260 && fbm(jx / 220, jy / 220, 61, 2) > 0.62 && R() < 0.3){
        if(blocked(jx, jy, 16)) continue;
        const tw = { x:jx, y:jy, z:triH(jx, jy) - 0.5, ang, l:18 + R() * 10, w:16 + R() * 6, floors:8 + Math.floor(R() * 14), col:WALLS[Math.floor(R() * WALLS.length)], helipad:R() < 0.25, d:db };
        P.towers.push(tw); addRect(jx, jy, ang, tw.l / 2 + 4, tw.w / 2 + 4); continue; }
      const kind = R(), floors = R() < 0.55 ? 1 : R() < 0.75 ? 2 : 3;
      const h = { x:jx, y:jy, z:triH(jx, jy) - 0.3, ang, l:7 + R() * 4, w:6 + R() * 3, floors, v:kind < 0.42 ? 0 : kind < 0.78 ? 1 : 2, col:WALLS[Math.floor(R() * WALLS.length)], d:db };
      P.houses.push(h); addRect(jx, jy, ang, h.l / 2 + 0.4, h.w / 2 + 0.4);
    }
    // nearest the circuit first: the overhead camera never sees the far edge of the city
    for(const L of [P.houses, P.towers, P.sheds]) L.sort((a, b) => a.d - b.d);
    const cap = lite ? 4000 : 9000; if(P.houses.length > cap) P.houses.length = cap;
    if(P.towers.length > (lite ? 40 : 90)) P.towers.length = lite ? 40 : 90;
  }

  /* ---- football pitches, where they are mapped: a mown rectangle with its lines, and a game on ---- */
  P.pitches = [];
  { const seen = new Uint8Array(NV);
    for(let k0 = 0; k0 < NV; k0++){
      if(seen[k0] || COV[k0] !== C.pitch || DB[k0] < 20) continue;
      const cells = [], Q3 = [k0]; seen[k0] = 1;
      while(Q3.length){ const k = Q3.pop(); cells.push(k); const c = k % NX, r = (k / NX) | 0;
        for(const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]){ const kk = (r + dr) * NX + c + dc; if(kk >= 0 && kk < NV && !seen[kk] && COV[kk] === C.pitch){ seen[kk] = 1; Q3.push(kk); } } }
      if(cells.length < 6) continue;
      let mx = 0, my = 0; const pts = cells.map(k => [X0 + (k % NX) * STEP, Y0 + ((k / NX) | 0) * STEP]);
      for(const p of pts){ mx += p[0]; my += p[1]; } mx /= pts.length; my /= pts.length;
      let sxx = 0, syy = 0, sxy = 0; for(const p of pts){ const dx = p[0] - mx, dy = p[1] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
      const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy), area = cells.length * STEP * STEP, l = clamp(Math.sqrt(area * 1.55), 24, 105), w = clamp(area / l, 16, 68);
      if(blocked(mx, my, 6)) continue;
      const z = triH(mx, my);
      P.pitches.push({ x:mx, y:my, z, ang, l:l * 0.9, w:w * 0.9 }); addRect(mx, my, ang, l / 2 + 2, w / 2 + 2);
    }
    // level them
    for(const pt of P.pitches){ const ux = Math.cos(pt.ang), uy = Math.sin(pt.ang);
      for(let r = 0; r < NY; r++) for(let c = 0; c < NX; c++){ const k = r * NX + c, dx = X0 + c * STEP - pt.x, dy = Y0 + r * STEP - pt.y;
        if(Math.abs(dx) > 90 || Math.abs(dy) > 90 || DB[k] < 8) continue;
        const a = Math.abs(dx * ux + dy * uy) - pt.l / 2, b = Math.abs(-dx * uy + dy * ux) - pt.w / 2, out = Math.hypot(Math.max(a, 0), Math.max(b, 0));
        if(out < 6) H[k] = mix(H[k], pt.z, 1 - sstep(0, 6, out)); } } }

  /* ---- parked cars and buses in the mapped car parks, and cars along the streets near the circuit ---- */
  P.cars = [];
  { const step = lite ? 9 : 6.5;
    for(let y = Y0; y < Y0 + (NY - 1) * STEP; y += step) for(let x = X0; x < X0 + (NX - 1) * STEP; x += step){
      if(coverAt(x, y) !== C.parking) continue; const q = query(x, y); if(q.bar < 12 || blocked(x, y, 2.5) || R() < 0.35) continue;
      P.cars.push({ x, y, z:triH(x, y), ang:0.3 + (R() < 0.5 ? 0 : Math.PI), bus:R() < 0.06, tint:["#D8352A", "#2F78B8", "#E8E8E8", "#222428", "#8A9199", "#E8C02A", "#F2F2F2"][Math.floor(R() * 7)] }); }
    for(const r of P.roads){ if(r.w > 8) continue;
      for(let k = 0; k < r.pts.length - 1; k++){ if(R() > 0.22) continue; const a = r.pts[k], b = r.pts[k + 1], ang = Math.atan2(b[1] - a[1], b[0] - a[0]), sd = R() < 0.5 ? 1 : -1;
        const x = (a[0] + b[0]) / 2 - Math.sin(ang) * (r.w / 2 + 1.1) * sd, y = (a[1] + b[1]) / 2 + Math.cos(ang) * (r.w / 2 + 1.1) * sd;
        const db = at(DB, x, y); if(db < 30 || db > 420 || blocked(x, y, 1.5)) continue;
        P.cars.push({ x, y, z:triH(x, y), ang, bus:false, tint:["#D8352A", "#2F78B8", "#E8E8E8", "#222428", "#8A9199", "#E8C02A"][Math.floor(R() * 6)] }); } }
    if(P.cars.length > (lite ? 900 : 2400)) P.cars.length = lite ? 900 : 2400;
  }

  /* ---- the planting: Atlantic-forest broadleaves in rich greens, tall palms, flowering ipês in yellow,
     purple and pink, eucalyptus on the outer slopes, banana clumps by the houses, shrubs and tall grass.
     Woods where the real ones are mapped, groves and tree lines on the circuit's grounds and in the
     parks, street and garden trees in the city. ---- */
  const L = { palm:[], broad:[], ipe:[], euca:[], banana:[], broadFar:[], eucaFar:[], shrub:[], grass:[], reeds:[], flowers:[] };
  P.lists = L;
  const canopyR = { palm:0.22, broad:0.38, ipe:0.36, euca:0.16, banana:0.35 };
  const IPE = [[1.55, 1.35, 0.25], [1.05, 0.62, 1.35], [1.55, 0.78, 1.1]];        // yellow, purple, pink (tints over a pale canopy)
  let tested = 0;
  const treeAt = (x, y, k, far) => {
    const dbg = at(DB, x, y), q = dbg > 40 ? { bar:dbg, z:at(ZR, x, y) } : query(x, y); tested++;
    const h0 = k === "palm" ? 15 : k === "euca" ? 24 : k === "banana" ? 5 : k === "ipe" ? 11 : 13;
    const h = h0 * (0.75 + R() * 0.5) * (1 + sstep(30, 260, q.bar) * 0.15);
    const cr = h * canopyR[k];
    if(q.bar < cr + 2.0 || blocked(x, y, cr * 0.7) || slopeAt(x, y) > 0.9) return false;
    const v = 0.85 + R() * 0.25;
    const tint = k === "ipe" ? IPE[Math.floor(R() * 3)] : k === "palm" || k === "banana" ? [v, v, v * 0.95] : [v * (0.85 + R() * 0.25), v, v * (0.8 + R() * 0.15)];
    const it = { x, y, z:triH(x, y) - 0.3, h, ry:R() * Math.PI * 2, tint, lx:(R() - 0.5) * 0.06, ly:(R() - 0.5) * 0.06, cr, shade:q.bar < 60 };
    if(far && (k === "broad" || k === "ipe")) L.broadFar.push(it); else if(far && k === "euca") L.eucaFar.push(it); else L[k].push(it);
    return true;
  };
  const xmax = X0 + (NX - 1) * STEP, ymax = Y0 + (NY - 1) * STEP;
  { const sp = lite ? [8.5, 13, 22] : [6.8, 10, 16], cell = sp[0];
    for(let y = Y0 + 4; y < ymax - 4; y += cell) for(let x = X0 + 4; x < xmax - 4; x += cell){
      const db = at(DB, x, y); if(db < 2) continue;
      const band = db < 150 ? 0 : db < 360 ? 1 : 2;
      if(band === 1 && hash2(Math.floor(x / cell), Math.floor(y / cell), 3) > (sp[0] / sp[1]) ** 2) continue;
      if(band === 2 && hash2(Math.floor(x / cell), Math.floor(y / cell), 4) > (sp[0] / sp[2]) ** 2) continue;
      const jx = x + (R() - 0.5) * cell * 0.9, jy = y + (R() - 0.5) * cell * 0.9, cv = coverAt(jx, jy);
      const grove = fbm(jx / 80, jy / 80, 13, 2), sl = slopeAt(jx, jy);
      let p = 0, k = "broad";
      if(cv === C.trees){ p = 0.85; const r = R(); k = r < 0.5 ? "broad" : r < 0.66 ? "ipe" : r < 0.86 ? "euca" : "palm"; }
      else if(cv === C.scrub){ p = 0.3; }
      else if(cv === C.grass){
        // the grounds and the parks: groves where the noise says, palms near the stands, eucalyptus up the slopes
        p = 0.04 + 0.5 * sstep(0.6, 0.72, grove);
        const r = R(); k = sl > 0.18 && r < 0.45 ? "euca" : r < 0.55 ? "broad" : r < 0.72 ? "ipe" : "palm";
      } else if(cv === C.built){ p = 0.035; const r = R(); k = r < 0.45 ? "broad" : r < 0.7 ? "palm" : r < 0.85 ? "ipe" : "banana"; }
      else if(cv === C.pitch || cv === C.parking || cv === C.water || cv === C.kart) p = 0;
      else p = 0.05;
      p *= db < 6 ? 0.2 : db < 14 ? 0.55 : 1;
      if(R() > p) continue;
      treeAt(jx, jy, k, band === 2 && k !== "palm" && k !== "banana");
    }
  }
  tm.trees = Date.now() - t0;
  /* ---- the low layer near the circuit: shrubs and tall grass by the fences, flowers in the grounds,
     reeds round the water ---- */
  if(!lite){
    for(let y = Y0 + 2; y < ymax - 2; y += 4.5) for(let x = X0 + 2; x < xmax - 2; x += 4.5){
      const db = at(DB, x, y); if(db < 1.5 || db > 90) continue;
      const jx = x + (R() - 0.5) * 4, jy = y + (R() - 0.5) * 4, cv = coverAt(jx, jy);
      if(blocked(jx, jy, 1)) continue;
      const z = triH(jx, jy) - 0.1;
      if(cv === C.trees || cv === C.scrub){ if(R() < 0.3) L.shrub.push({ x:jx, y:jy, z, h:1.2 + R() * 1.6, w:1.3, ry:R() * 6.3, tint:[0.9 + R() * 0.2, 1, 0.9] }); }
      else if(cv === C.grass){
        if(db < 14 && R() < 0.22) L.grass.push({ x:jx, y:jy, z, h:0.9 + R() * 0.8, w:1.4, ry:R() * 6.3, tint:[1 + R() * 0.15, 1, 0.85] });
        else if(fbm(jx / 26, jy / 26, 29, 2) > 0.6 && R() < 0.4) L.flowers.push({ x:jx, y:jy, z, h:0.6 + R() * 0.4, w:1.4, ry:R() * 6.3,
          tint:[["#F4D23A", "#FFFFFF", "#E86AA8", "#E8742A", "#B888E8"][Math.floor(R() * 5)]].map(hex)[0] });
        else if(R() < 0.04) L.shrub.push({ x:jx, y:jy, z, h:1 + R() * 1.4, w:1.3, ry:R() * 6.3, tint:[0.9 + R() * 0.2, 1, 0.9] });
      }
    }
  }
  // reeds round every lake and through the marshes, and palms and reeds on the island
  for(const lk of P.lakes){
    for(const k of lk.cells){ const isShore = lk.shore.includes(k); if(!isShore && !lk.marsh) continue;
      const n2 = isShore ? 3 : 1;
      for(let m = 0; m < n2; m++){ const x = X0 + (k % NX) * STEP + (R() - 0.5) * STEP, y = Y0 + ((k / NX) | 0) * STEP + (R() - 0.5) * STEP;
        if(at(DB, x, y) < 6) continue; L.reeds.push({ x, y, z:lk.level - 0.3, h:1.6 + R() * 1.2, w:1, ry:R() * 6.3, tint:[0.9 + R() * 0.2, 1, 0.8] }); } }
    if(lk.island) for(let m = 0; m < 4; m++){ const a = R() * 6.3, d = R() * lk.island.r * 0.5; treeAt(lk.island.x + Math.cos(a) * d, lk.island.y + Math.sin(a) * d, "palm", false); }
  }
  // a jetty on the biggest lake, at the shore nearest the circuit
  P.jetty = null;
  if(P.lakes.length){ const lk = P.lakes[0]; let best = null;
    for(const k of lk.shore){ const x = X0 + (k % NX) * STEP, y = Y0 + ((k / NX) | 0) * STEP, db = at(DB, x, y); if(db < 15) continue; if(!best || db < best.db) best = { x, y, db }; }
    if(best){ const ang = Math.atan2(lk.cy - best.y, lk.cx - best.x); P.jetty = { x:best.x, y:best.y, z:lk.level + 0.6, ang, len:Math.min(24, Math.sqrt(lk.area) * 0.25) }; } }

  P.stats = { grid:NX + "x" + NY, step:STEP, tested, trees:L.palm.length + L.broad.length + L.ipe.length + L.euca.length + L.banana.length,
    farTrees:L.broadFar.length + L.eucaFar.length, low:L.shrub.length + L.grass.length + L.flowers.length + L.reeds.length,
    houses:P.houses.length, towers:P.towers.length, sheds:P.sheds.length, pitches:P.pitches.length, cars:P.cars.length,
    lakes:P.lakes.map(l => Math.round(l.area) + (l.marsh ? "m2 marsh" : "m2") + (l.island ? "+island" : "")).join(" "),
    structures:S.length, streams:P.streams.length, roads:P.roads.length, maxRise:+maxRise.toFixed(1) };
  tm.total = Date.now() - t0;
  return P;
}

/* ---- the clearance audit: every tree, building and prop against the circuit ---- */
function auditIlg(P, T){
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
  for(const k of ["palm", "broad", "ipe", "euca", "banana", "broadFar", "eucaFar"]) for(const t of P.lists[k]){
    const b = exactBar(t.x, t.y) - t.cr; out.checked++;
    if(b < out.worstTree) out.worstTree = b; if(b < 0) out.treesOnRoad++; }
  for(const h of [...P.houses, ...P.towers, ...P.sheds, ...P.pitches]){ const b = exactBar(h.x, h.y) - Math.hypot(h.l, h.w) / 2; if(b < out.worstBuilding) out.worstBuilding = b; if(b < 0) out.buildingsOnRoad++; }
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
  for(const t of P.cars){ const b = exactBar(t.x, t.y) - 3; if(b < out.worstSmall) out.worstSmall = b; }
  out.worstStructure = +out.worstStructure.toFixed(2); out.worstSmall = +out.worstSmall.toFixed(2); out.dropped = P.dropped || [];
  out.worstTree = +out.worstTree.toFixed(2); out.worstBuilding = +out.worstBuilding.toFixed(2);
  return out;
}

export { auditIlg, planIlg };
