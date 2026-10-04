import * as THREE from 'three';
import { TAU } from '../../config/util.js';
import { L, fh } from './cota-kit.js';
import { shaft, ledge, neonLine, rooftop, outline, TINTS } from './singapore-kit.js';

/* ---------- Singapore's buildings ------------------------------------------------
   Each builder writes into a Town (windows / solid / bright meshers). A building has a podium, one to three setbacks, a
   crown (clutter, a stepped top, a spire, an angled roof) and sometimes neon on its corners; its windows are a shared
   texture, so a tower costs a few dozen triangles. beacons collects the red roof lights for the blinkers.             */

const PASTEL = [[1.0, 0.78, 0.7], [0.75, 0.95, 0.85], [1.0, 0.92, 0.65], [0.78, 0.82, 1.0], [1.0, 0.75, 0.88], [0.85, 1.0, 0.7]];
const NEON = ["#18D8E8", "#FF4AA0", "#B060FF", "#FFB030", "#40FFC0"];

function crown(T, b, z, beacons, seed){
  const m = T.get("solid", b.x, b.y), br = T.get("bright", b.x, b.y), k = Math.floor(fh(seed * 13) * 5);
  const ca = Math.cos(b.ang), sa = Math.sin(b.ang);
  if(k === 0 || b.h < 60){ rooftop(T, b, z, fh(seed + 2), beacons, "#38364A"); return; }
  if(k === 1){                                                                  // a stepped glass crown with a lit edge
    const w = b.w * 0.62, d = b.d * 0.62, hh = 8 + fh(seed) * 8;
    shaft(T, b.x, b.y, b.ang, w, d, z, z + hh, "band", TINTS[seed % TINTS.length], seed + 9, "#2A2840");
    outline(br, b.x, b.y, z + hh, w + 0.6, d + 0.6, b.ang, NEON[seed % NEON.length]);
    rooftop(T, { ...b, w:w * 0.8, d:d * 0.8 }, z + hh, fh(seed + 4), beacons, "#38364A"); return; }
  if(k === 2){                                                                  // a spire
    const hh = 20 + fh(seed) * 22;
    m.pole(b.x, b.y, z, b.x, b.y, z + hh, 0.5, L("#8A8EA0")); m.pole(b.x, b.y, z, b.x, b.y, z + 4, 1.2, L("#6A6E80"));
    br.box(b.x, b.y, z + hh - 5, 0.7, 0.7, 5, 0, L("#FFE8C0")); beacons.push([b.x, b.y, z + hh + 0.5]); return; }
  if(k === 3){                                                                  // an angled roof with a lit slot
    m.gable(b.x, b.y, z, b.w * 0.96, b.d * 0.96, 7 + fh(seed) * 6, b.ang, L("#2E2C44"), L("#26243A"));
    br.box(b.x, b.y, z + 5.5, b.w * 0.6, 0.4, 0.4, b.ang, L(NEON[(seed + 1) % NEON.length])); beacons.push([b.x, b.y, z + 14]); return; }
  rooftop(T, b, z, fh(seed + 2), beacons, "#38364A");                          // a heliport: a lit ring on the roof
  if(fh(seed + 31) < 0.3) outline(br, b.x + ca * 2, b.y + sa * 2, z + 0.1, 7, 7, b.ang, "#FF4A4A", 0.3);
  beacons.push([b.x, b.y, z + 6]);
}

/* office, tower, apartment, hotel, slab: a podium and one to three shafts */
function block(T, b, beacons){
  const seed = b.seed || 1, tint = TINTS[seed % TINTS.length], ca = Math.cos(b.ang), sa = Math.sin(b.ang), z0 = b.z;
  const hp = b.type === "hotel" ? 8 + fh(seed) * 4 : 5 + fh(seed) * 5, kind = b.type === "apt" ? "grid" : b.type === "tower" || b.type === "slab" ? "slim" : (fh(seed + 1) < 0.7 ? "band" : "grid");
  // the podium: wider, lower, a dark plinth and a lit band of shops
  shaft(T, b.x, b.y, b.ang, b.w + 6, b.d + 6, z0 - 0.4, z0 + hp, "band", [tint[0] * 0.8, tint[1] * 0.8, tint[2] * 0.8], seed + 3, "#2A2840");
  ledge(T, b.x, b.y, b.ang, b.w + 7, b.d + 7, z0 + hp, 0.5, "#3A3852");
  if(b.type === "hotel"){                                                        // an awning at the door and a lit sky bar on top
    T.get("bright", b.x, b.y).box(b.x + ca * 0, b.y + sa * 0, z0 + 3.6, 2.5, b.d + 7.4, 0.18, b.ang, L("#FFC070"));
  }
  const hs = b.h - hp, tiers = b.h > 130 ? 3 : b.h > 70 ? 2 : 1;
  let z = z0 + hp, w = b.w, d = b.d, left = hs;
  for(let t = 0; t < tiers; t++){
    const th = t === tiers - 1 ? left : hs * (tiers === 3 ? [0.5, 0.3][t] : 0.62);
    shaft(T, b.x, b.y, b.ang, w, d, z, z + th, kind, tint, seed + t * 17, "#26243C");
    // balconies on an apartment block
    if(b.type === "apt") for(let zz = z + 3.8 * 3; zz < z + th - 2; zz += 3.8 * 4) ledge(T, b.x, b.y, b.ang, w + 1.2, d + 1.2, zz, 0.35, "#3E3C58");
    // neon on two corners of the tall ones
    if(b.h > 100 && t === 0){ const c = NEON[seed % NEON.length]; neonLine(T, b.x, b.y, b.ang, w, d, z, z + th, c, 1); neonLine(T, b.x, b.y, b.ang, w, d, z, z + th, c, 2); }
    z += th; left -= th; w *= 0.78; d *= 0.78;
  }
  if(b.type === "hotel" || fh(seed + 21) < 0.3){ outline(T.get("bright", b.x, b.y), b.x, b.y, z - 0.3, w / 0.78 + 0.5, d / 0.78 + 0.5, b.ang, NEON[(seed + 2) % NEON.length]); }
  crown(T, { ...b, w:w / 0.78, d:d / 0.78 }, z, beacons, seed);
}

/* a row of shophouses: narrow, coloured, three storeys, a pitched tile roof, a covered five-foot way of columns */
function shophouses(T, b){
  const seed = b.seed || 1, units = Math.max(3, Math.round(b.w / 5.6)), uw = b.w / units, ca = Math.cos(b.ang), sa = Math.sin(b.ang);
  for(let u = 0; u < units; u++){
    const off = -b.w / 2 + uw * (u + 0.5), cx = b.x + ca * off, cy = b.y + sa * off, ps = PASTEL[(seed + u * 3) % PASTEL.length], h = b.h + (fh(seed + u) - 0.5) * 2.4;
    shaft(T, cx, cy, b.ang, uw - 0.25, b.d, b.z, b.z + h, "grid", [ps[0] * 1.1, ps[1] * 1.1, ps[2] * 1.1], seed + u * 5, null);
    T.get("solid", cx, cy).gable(cx, cy, b.z + h, uw + 0.4, b.d + 0.8, 2.4, b.ang + Math.PI / 2, L(["#8A4A38", "#9A5A40", "#7A4A3A"][u % 3]));
    // two columns on the street side, and the arch they carry
    for(const s of [-1, 1]) T.get("solid", cx, cy).box(cx - sa * (b.d / 2 + 1.0) + ca * s * (uw / 2 - 0.5), cy + ca * (b.d / 2 + 1.0) + sa * s * (uw / 2 - 0.5), b.z, 0.4, 0.4, 3.0, b.ang, L("#E8E0D0"));
    T.get("bright", cx, cy).box(cx - sa * (b.d / 2 + 0.2), cy + ca * (b.d / 2 + 0.2), b.z + 2.4, uw - 0.8, 0.12, 0.35, b.ang, L(["#FFC070", "#FF9A60", "#FFE0A0"][u % 3]));
  }
}

/* a colonial building: white, floodlit, a colonnade and veranda, a central pediment and a cupola */
function colonial(T, b){
  const seed = b.seed || 1, ca = Math.cos(b.ang), sa = Math.sin(b.ang), m = T.get("solid", b.x, b.y), br = T.get("bright", b.x, b.y);
  shaft(T, b.x, b.y, b.ang, b.w, b.d, b.z, b.z + b.h, "slim", [1.25, 1.12, 0.9], seed + 2, "#C8C4B8");
  // the colonnade along the front
  const cols = Math.floor(b.w / 4);
  for(let k = 0; k <= cols; k++){ const a = -b.w / 2 + 1 + (b.w - 2) * k / cols; m.box(b.x + ca * a - sa * (b.d / 2 + 1.6), b.y + sa * a + ca * (b.d / 2 + 1.6), b.z, 0.55, 0.55, b.h * 0.72, b.ang, L("#F0EAD8")); }
  m.box(b.x - sa * (b.d / 2 + 1.0), b.y + ca * (b.d / 2 + 1.0), b.z + b.h * 0.72, b.w + 0.6, 3.6, 0.5, b.ang, L("#E8E0CC"));            // the veranda roof
  br.box(b.x - sa * (b.d / 2 + 1.2), b.y + ca * (b.d / 2 + 1.2), b.z + b.h * 0.72 - 0.25, b.w - 0.5, 0.12, 0.25, b.ang, L("#FFD590"));  // lit under it
  // the pediment, and for the larger ones a cupola
  m.gable(b.x - sa * (b.d / 2 + 0.9), b.y + ca * (b.d / 2 + 0.9), b.z + b.h * 0.72 + 0.5, 11, 3.2, 3.4, b.ang + Math.PI / 2, L("#F4EEDC"), L("#E8E0CC"));
  m.gable(b.x, b.y, b.z + b.h, b.w * 0.98, b.d * 0.98, 3.6, b.ang, L("#9A8A78"));
  if(b.landmark && b.w > 80){ m.frustum(b.x, b.y, b.z + b.h + 3, b.z + b.h + 9, 3.2, 2.4, 10, L("#F4EEDC"), L("#E8E0CC")); m.cone(b.x, b.y, b.z + b.h + 9, 4.5, 2.8, 10, L("#8A9AA8")); }
}

/* a stepped art-deco tower: four tiers, gold fins, a lit crown and a spire */
function deco(T, b, beacons){
  const seed = b.seed || 1, m = T.get("solid", b.x, b.y), br = T.get("bright", b.x, b.y), tiers = [[1, 0.46], [0.76, 0.26], [0.54, 0.18], [0.3, 0.10]];
  let z = b.z; shaft(T, b.x, b.y, b.ang, b.w + 10, b.d + 10, z - 0.4, z + 8, "band", [0.9, 0.85, 0.7], seed + 1, "#2A2840"); z += 8;
  for(const [s, hf] of tiers){
    const th = (b.h - 8) * hf; shaft(T, b.x, b.y, b.ang, b.w * s, b.d * s, z, z + th, "slim", [1.2, 1.0, 0.72], seed, "#3A3040");
    for(const w of [1, 2, 3]) neonLine(T, b.x, b.y, b.ang, b.w * s, b.d * s, z, z + th, "#FFC040", w);                  // gold fins
    outline(br, b.x, b.y, z + th - 0.2, b.w * s + 0.8, b.d * s + 0.8, b.ang, "#FFB030");
    z += th;
  }
  m.frustum(b.x, b.y, z, z + 7, b.w * 0.17, b.w * 0.07, 8, L("#E8C060"), L("#E8C060"));
  m.pole(b.x, b.y, z + 7, b.x, b.y, z + 22, 0.35, L("#E8C060"));
  br.frustum(b.x, b.y, z + 1, z + 6.5, b.w * 0.15, b.w * 0.06, 8, L("#FFC860"));
  beacons.push([b.x, b.y, z + 22.5]);
}

/* a ring of glass offices: a twelve-sided ring with an open yard, lit inside and out */
function ring(T, b, beacons){
  const seed = b.seed || 1, ro = b.w * 0.5, ri = b.w * 0.3, N = 12, m = T.get("band", b.x, b.y), s = T.get("solid", b.x, b.y), br = T.get("bright", b.x, b.y), z0 = b.z, z1 = z0 + b.h;
  const P = (r, k, z) => [b.x + Math.cos(b.ang + k / N * TAU) * r, b.y + Math.sin(b.ang + k / N * TAU) * r, z];
  for(let k = 0; k < N; k++){
    const tint = [1.1 - (k % 3) * 0.08, 1.0, 0.9 + (k % 4) * 0.08], C = new THREE.Color(...tint).multiplyScalar(0.9 + (k & 1) * 0.12);
    const len = ro * 2 * Math.sin(Math.PI / N), u0 = fh(seed + k) * 8, v0 = fh(seed + 99) * 8;
    m.quadUV(P(ro, k, z0), P(ro, k + 1, z0), P(ro, k + 1, z1), P(ro, k, z1), C, u0, v0, u0 + len / 3.4 / 8, v0 + b.h / 3.8 / 8);
    const leni = ri * 2 * Math.sin(Math.PI / N);
    m.quadUV(P(ri, k + 1, z0), P(ri, k, z0), P(ri, k, z1), P(ri, k + 1, z1), C.clone().multiplyScalar(0.8), u0, v0, u0 + leni / 3.4 / 8, v0 + b.h / 3.8 / 8);
    s.quad(P(ri, k, z1), P(ri, k + 1, z1), P(ro, k + 1, z1), P(ro, k, z1), L("#26243C"));
    br.quad(P(ro + 0.05, k, z1 - 0.7), P(ro + 0.05, k + 1, z1 - 0.7), P(ro + 0.05, k + 1, z1 - 0.2), P(ro + 0.05, k, z1 - 0.2), L("#40E8FF"));
  }
  s.frustum(b.x, b.y, z0 - 0.4, z0 + 1.2, ri * 0.98, ri * 0.98, 12, L("#4A4660"), L("#4A4660"));                    // the yard
  s.box(b.x, b.y, z0 - 0.4, ro * 2.3, ro * 2.3, 0.5, b.ang, L("#3A3852"));
  beacons.push([b.x + ro, b.y, z1 + 1], [b.x - ro, b.y, z1 + 1]);
}

/* three leaning towers carrying a boat-shaped sky deck (a generic design): the deck is a hull on top, with a lit pool and a few dark trees */
function triTower(T, b, beacons){
  const m = T.get("solid", b.x, b.y), br = T.get("bright", b.x, b.y), ca = Math.cos(b.ang), sa = Math.sin(b.ang), H = b.h, W = 40, D = 34, gap = 62;
  const lean = 0.07;
  for(let t = -1; t <= 1; t++){
    const cx = b.x + ca * t * gap, cy = b.y + sa * t * gap;
    // each tower leans toward the middle: built as stacked slices so the lean is a step of centres
    const SL = 14, th = H / SL;
    for(let k = 0; k < SL; k++){
      const ox = -t * lean * (k * th) * 1.0, px = cx + ca * ox, py = cy + sa * ox, w = W * (1 - k * 0.012);
      shaft(T, px, py, b.ang, w, D, b.z + k * th, b.z + (k + 1) * th + 0.4, "band", [1.05, 1.0 + (t === 0 ? 0.05 : 0), 0.95], 41 + t * 7 + k, null);
    }
    m.box(cx, cy, b.z - 0.4, W + 10, D + 10, 4, b.ang, L("#2E2C46"));
  }
  // the sky deck: a long hull across the three tops, a lit pool, trees, a glowing rim
  const zD = b.z + H * 0.90, len = gap * 2 + 80, hw = 14;
  const stations = 11, P = (s, side, z) => { const x = (s / (stations - 1) - 0.5) * len, taper = 1 - Math.pow(Math.abs(s / (stations - 1) - 0.5) * 2, 3) * 0.92; return [b.x + ca * x - sa * side * hw * taper, b.y + sa * x + ca * side * hw * taper, z]; };
  for(let s = 0; s < stations - 1; s++){
    m.quad(P(s, -1, zD), P(s + 1, -1, zD), P(s + 1, -1, zD - 6), P(s, -1, zD - 5.5 - (s % 2) * 0.1), L("#3A3852"));
    m.quad(P(s, 1, zD - 5.5), P(s + 1, 1, zD - 6), P(s + 1, 1, zD), P(s, 1, zD), L("#3A3852"));
    m.quad(P(s, -1, zD - 6), P(s + 1, -1, zD - 6), P(s + 1, 1, zD - 6), P(s, 1, zD - 6), L("#26243C"));
    m.quad(P(s, -1, zD), P(s, 1, zD), P(s + 1, 1, zD), P(s + 1, -1, zD), L("#3A5A52"));                                    // the deck
    br.quad(P(s, -0.7, zD + 0.12), P(s, 0.7, zD + 0.12), P(s + 1, 0.7, zD + 0.12), P(s + 1, -0.7, zD + 0.12), (s > 2 && s < 8) ? L("#30D8F0") : L("#3A5A52"));   // the pool, lit
    br.box(P(s, 1, zD)[0], P(s, 1, zD)[1], zD, 2.6, 0.5, 0.5, b.ang, L("#F2F6FF"));
  }
  // a few dark trees along the deck
  for(let k = 0; k < 10; k++){ const [x, y] = P(1 + k * 0.9, k & 1 ? -0.9 : 0.9, zD); m.frustum(x, y, zD, zD + 4, 1.2, 0.2, 5, L("#1C3A2C"), L("#2A5A3C")); }
  beacons.push([b.x + ca * len * 0.5, b.y + sa * len * 0.5, zD + 3], [b.x - ca * len * 0.5, b.y - sa * len * 0.5, zD + 3]);
}

/* an arts centre dome: a squat ellipsoid under a coat of triangular spikes, gold under the floodlights, with a dark base */
function dome(T, d){
  const m = T.get("solid", d.x, d.y), br = T.get("bright", d.x, d.y), g = new THREE.IcosahedronGeometry(1, 2), p = g.attributes.position;
  const V = i => [p.getX(i) * d.r, p.getZ(i) * d.r, Math.max(p.getY(i), -0.05) * d.h], nrm = i => [p.getX(i), p.getZ(i), p.getY(i)];
  m.frustum(d.x, d.y, -0.4, 2.2, d.r * 1.12, d.r * 1.05, 20, L("#3A3852"), L("#2E2C44"));
  for(let f = 0; f < p.count; f += 3){
    const a = f, b2 = f + 1, c = f + 2, A = V(a), B = V(b2), C = V(c), cy = (p.getY(a) + p.getY(b2) + p.getY(c)) / 3;
    if(cy < -0.05) continue;
    const n = [(nrm(a)[0] + nrm(b2)[0] + nrm(c)[0]) / 3, (nrm(a)[1] + nrm(b2)[1] + nrm(c)[1]) / 3, (nrm(a)[2] + nrm(b2)[2] + nrm(c)[2]) / 3], nl = Math.hypot(...n) || 1;
    const ctr = [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3, (A[2] + B[2] + C[2]) / 3], tip = [ctr[0] + n[0] / nl * d.r * 0.34, ctr[1] + n[1] / nl * d.r * 0.34, ctr[2] + n[2] / nl * d.h * 0.34];
    const sh = (P2, k) => [P2[0] + (ctr[0] - P2[0]) * k, P2[1] + (ctr[1] - P2[1]) * k, P2[2] + (ctr[2] - P2[2]) * k], A2 = sh(A, 0.12), B2 = sh(B, 0.12), C2 = sh(C, 0.12);
    const S = (q) => [d.x + q[0], d.y + q[1], 2.2 + q[2]], gold = fh(f * 3) < 0.5;
    for(const [u, v] of [[A2, B2], [B2, C2], [C2, A2]]) (gold ? br : m).tri(S(u), S(v), S(tip), gold ? L("#E8B050").clone().multiplyScalar(0.95) : L("#C8A868"));
    m.tri(S(A), S(B), S(C), L("#5A4A38"));
  }
}

/* a lion-headed, fish-tailed statue on a plinth, with a spout, generic */
function merlion(T, M, ground){
  const m = T.get("solid", M.x, M.y), br = T.get("bright", M.x, M.y), z = ground, W = L("#E8E8EE");
  m.frustum(M.x, M.y, z, z + 1.6, 9, 8, 12, L("#6A6E80"), L("#7A7E90"));
  m.frustum(M.x, M.y, z + 1.6, z + 6, 3.2, 2.6, 10, W, W);
  m.frustum(M.x, M.y, z + 6, z + 9, 2.7, 2.2, 10, W, W);
  const ca = Math.cos(M.ang), sa = Math.sin(M.ang);
  m.box(M.x + ca * 0.6, M.y + sa * 0.6, z + 8.6, 3.2, 3.0, 2.8, M.ang, W);                                           // the head
  for(let k = 0; k < 9; k++){ const a = k / 9 * TAU; m.pole(M.x + Math.cos(a) * 1.5, M.y + Math.sin(a) * 1.5, z + 10.2, M.x + Math.cos(a) * 2.7, M.y + Math.sin(a) * 2.7, z + 11.4, 0.35, W); }   // the mane
  for(let k = 0; k < 5; k++) m.box(M.x - ca * (2 + k * 0.5), M.y - sa * (2 + k * 0.5), z + 3 + k * 0.9, 1.8 - k * 0.2, 1.4, 0.8, M.ang, W);   // the fish tail curling up behind
  // the spout: an arc of lit droplets
  for(let k = 0; k < 14; k++){ const t = k / 13, r = 1.5 + t * 9; br.box(M.x + ca * (1.6 + r), M.y + sa * (1.6 + r), z + 8.3 + 2.6 * Math.sin(t * Math.PI) - t * 5.5, 0.5, 0.5, 0.5, M.ang, L("#BFEFFF")); }
}

export { block, shophouses, colonial, deco, ring, triTower, dome, merlion, crown, NEON, PASTEL };
