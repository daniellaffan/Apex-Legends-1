import * as THREE from 'three';
import { TAU, clamp } from '../../config/util.js';
import { L, shadeC, fh, sst, Mesher, paint, merge } from './cota-kit.js';
import { shaft, ledge, outline } from './singapore-kit.js';

/* ---------- Monza's kit -------------------------------------------------------------------
   The royal park's woodland species (a near copy with a few blobs and a far copy with one), a tricolour flag, the old banking's
   decayed concrete, the flyover, a neoclassical villa, tents and the park wall.                                              */

/* woodland: each species has a near and a far copy, with the tint mask (1 takes the instance's tint) */
function treeGeos(){
  const G = {}, trunk = (r0, r1, h, col, seg) => { const t = new THREE.CylinderGeometry(r1, r0, h, seg || 5); t.translate(0, h / 2, 0); return paint(t, () => L(col), () => 0); };
  const blob = (r, x, y, z, sy, lo, hi, det) => { const b = new THREE.IcosahedronGeometry(r, det || 0); b.scale(1, sy, 1); b.translate(x, y, z); const A = L(lo), B = L(hi); return paint(b, (px, py, pz, f) => A.clone().lerp(B, clamp(sst(y - r * sy, y + r * sy, py) + (fh(f) - 0.5) * 0.45, 0, 1))); };
  const cone = (r, h, y, seg, lo, hi) => { const c = new THREE.ConeGeometry(r, h, seg); c.translate(0, y + h / 2, 0); const A = L(lo), B = L(hi); return paint(c, (x, yy, z, f) => A.clone().lerp(B, clamp(sst(y, y + h, yy) + (fh(f) - 0.5) * 0.3, 0, 1))); };
  // oak: a short trunk and a broad crown of three lobes
  G.oak = merge([trunk(0.05, 0.035, 0.34, "#5A4A3A", 5), blob(0.38, 0, 0.62, 0, 0.78, "#3E6A30", "#78A048"), blob(0.28, 0.3, 0.55, 0.08, 0.72, "#44722E", "#82A84C"), blob(0.27, -0.28, 0.58, -0.1, 0.72, "#3E6A30", "#7CA248")]);
  G.oakFar = merge([trunk(0.05, 0.035, 0.3, "#5A4A3A", 4), blob(0.5, 0, 0.6, 0, 0.8, "#44722E", "#7CA248")]);
  // plane tree: taller, a rounder crown on a pale trunk
  G.plane = merge([trunk(0.04, 0.026, 0.46, "#8A8070", 5), blob(0.34, 0, 0.72, 0, 0.92, "#4A7A34", "#8AB254"), blob(0.24, 0.16, 0.9, 0.06, 0.9, "#4E7E36", "#90B858")]);
  G.planeFar = merge([trunk(0.04, 0.026, 0.4, "#8A8070", 4), blob(0.4, 0, 0.74, 0, 0.95, "#4E7E36", "#8AB254")]);
  // beech: a columnar oval of darker, coppery green
  G.beech = merge([trunk(0.04, 0.03, 0.3, "#6A5A4A", 5), blob(0.3, 0, 0.66, 0, 1.1, "#386030", "#6A9640"), blob(0.2, 0.1, 0.9, 0.04, 1.0, "#3C6632", "#74A044")]);
  G.beechFar = merge([trunk(0.04, 0.03, 0.26, "#6A5A4A", 4), blob(0.34, 0, 0.7, 0, 1.15, "#3C6632", "#6A9640")]);
  // umbrella pine: a bare trunk and a flat dark canopy
  G.pine = merge([trunk(0.03, 0.022, 0.62, "#7A5A3E", 5), blob(0.36, 0, 0.78, 0, 0.34, "#2A5A30", "#4E8446"), blob(0.24, 0.2, 0.74, 0.05, 0.3, "#2E5E32", "#528848")]);
  G.pineFar = merge([trunk(0.03, 0.022, 0.55, "#7A5A3E", 4), blob(0.42, 0, 0.78, 0, 0.34, "#2E5E32", "#4E8446")]);
  { const b = new THREE.IcosahedronGeometry(0.5, 0); b.scale(1, 0.7, 1); b.translate(0, 0.35, 0); G.shrub = paint(b, (x, y, z, f) => L("#3A6A30").clone().lerp(L("#6A9A44"), fh(f)), () => 0.8); }
  return G;
}
/* the tricolour: green, white, red bands (it is a flag, not a logo), waving; no tint */
function tricolourGeo(){
  const g = new THREE.PlaneGeometry(1, 0.66, 6, 2); g.translate(0.5, 0, 0);
  const p = g.attributes.position, col = new Float32Array(p.count * 3), G = L("#2E9A4A"), W = L("#F4F2EC"), Rr = L("#D8352A");
  for(let v = 0; v < p.count; v++){ const x = p.getX(v), c = x < 0.33 ? G : x < 0.67 ? W : Rr; col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b; }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3)); g.setAttribute("tintMask", new THREE.BufferAttribute(new Float32Array(p.count), 1)); g.setAttribute("arm", new THREE.BufferAttribute(new Float32Array(p.count), 1));
  return g;
}

/* a stretch of the old banking: a concrete slope from the ground to 13 m over 26 m, weathered, cracked, with joints and a broken parapet */
function banking(T, P, b, TW){
  const n = T.n, at = P.at, ht = P.height, CONC = ["#A8A498", "#9E9A8E", "#B0AC9E", "#948F84"];
  const ST = 7;                                                                // strips up the slope
  for(let k = 0; k < b.span; k++){
    const ia = (b.i0 + k) % n, ib = (b.i0 + k + 1) % n, m = TW.get("solid", ...at(ia, b.side, b.off0 + b.w / 2));
    const za = ht(...at(ia, b.side, b.off0)) - 0.2, zb = ht(...at(ib, b.side, b.off0)) - 0.2;
    for(let s = 0; s < ST; s++){
      const t0 = s / ST, t1 = (s + 1) / ST, z = (t, zz) => zz + b.h * Math.pow(t, 1.35);
      const A = at(ia, b.side, b.off0 + b.w * t0), B2 = at(ib, b.side, b.off0 + b.w * t0), C = at(ib, b.side, b.off0 + b.w * t1), D = at(ia, b.side, b.off0 + b.w * t1);
      const moss = fh(k * 7 + s * 13) < 0.22, joint = k % 4 === 0;
      m.quad([A[0], A[1], z(t0, za)], [B2[0], B2[1], z(t0, zb)], [C[0], C[1], z(t1, zb)], [D[0], D[1], z(t1, za)], moss ? L("#7E8A5A") : joint ? shadeC(CONC[0], -0.25) : L(CONC[(k + s) % CONC.length]));
    }
    // the rear drop and a broken parapet along the top
    const A = at(ia, b.side, b.off0 + b.w), B2 = at(ib, b.side, b.off0 + b.w);
    m.quad([A[0], A[1], za + b.h], [B2[0], B2[1], zb + b.h], [B2[0], B2[1], zb - 2], [A[0], A[1], za - 2], L("#8A867A"));
    if(fh(k * 3 + 1) > 0.25) m.box((A[0] + B2[0]) / 2, (A[1] + B2[1]) / 2, (za + zb) / 2 + b.h, Math.hypot(B2[0] - A[0], B2[1] - A[1]) * 0.9, 0.7, 0.9 + fh(k) * 0.4, T.ang[ia], L("#9A968A"));
  }
  for(const k of [0, b.span]){ const i = (b.i0 + k) % n, z0 = ht(...at(i, b.side, b.off0)) - 0.2, m = TW.get("solid", ...at(i, b.side, b.off0));
    for(let s = 0; s < ST; s++){ const t0 = s / ST, t1 = (s + 1) / ST, A = at(i, b.side, b.off0 + b.w * t0), B2 = at(i, b.side, b.off0 + b.w * t1);
      m.quad([A[0], A[1], z0 - 2], [B2[0], B2[1], z0 - 2], [B2[0], B2[1], z0 + b.h * Math.pow(t1, 1.35)], [A[0], A[1], z0 + b.h * Math.pow(t0, 1.35)], L("#8A867A")); } }
}
/* the flyover: the old oval's concrete bridge over the road before the Ascari chicane: a deck on four piers with parapets, and earth ramps rising to it from each side */
function flyover(T, P, F, TW){
  const ht = P.height, m = TW.get("solid", F.pl[0], F.pl[1]), C = L("#A09C90"), C2 = L("#8E8A7E"), CM = L("#7E8A5A");
  const mx = (F.pl[0] + F.pr[0]) / 2, my = (F.pl[1] + F.pr[1]) / 2, L2 = Math.hypot(F.pr[0] - F.pl[0], F.pr[1] - F.pl[1]), ang = Math.atan2(F.pr[1] - F.pl[1], F.pr[0] - F.pl[0]);
  const ux = Math.cos(ang), uy = Math.sin(ang), vx = -uy, vy = ux, z0 = F.z, zD = z0 + 7.4, W2 = F.w / 2;
  m.box(mx, my, zD - 1.3, L2 + 8, F.w, 1.3, ang, C, C2);                                           // the deck over the road
  for(const sd of [-1, 1]) m.box(mx + vx * (W2 - 0.35) * sd, my + vy * (W2 - 0.35) * sd, zD, L2 + 8, 0.7, 1.3, ang, C2);   // parapets
  for(const e of [F.pl, F.pr]) for(const q of [-W2 + 2, W2 - 2]) m.box(e[0] + vx * q, e[1] + vy * q, z0 - 0.6, 2.4, 2.4, 6.9, ang, C);   // piers
  for(const s of [-1, 1]){                                                                         // the ramps: earth and concrete up to the deck
    const ex = mx + ux * s * (L2 / 2 + 4), ey = my + uy * s * (L2 / 2 + 4);
    for(let k = 0; k < 8; k++){ const t0 = k / 8, t1 = (k + 1) / 8, o0 = t0 * 44, o1 = t1 * 44;
      const g0 = ht(ex + ux * s * o0, ey + uy * s * o0), g1 = ht(ex + ux * s * o1, ey + uy * s * o1), h0 = Math.max(zD - 1.3 - (zD - 1.3 - g0) * t0, g0), h1 = Math.max(zD - 1.3 - (zD - 1.3 - g1) * t1, g1);
      const q = (o, h, sd) => [ex + ux * s * o + vx * W2 * sd, ey + uy * s * o + vy * W2 * sd, h];
      m.quad(q(o0, h0, -1), q(o1, h1, -1), q(o1, h1, 1), q(o0, h0, 1), k & 1 ? C : CM);
      for(const sd of [-1, 1]) m.quad(q(o0, g0 - 1, sd), q(o1, g1 - 1, sd), q(o1, h1, sd), q(o0, h0, sd), C2); } }
}
/* the royal villa: a long neoclassical palace in ochre and cream: a central block with a pediment and a cupola, two wings, hip roofs */
function villa(T, b){
  const seed = b.seed || 3, m = T.get("solid", b.x, b.y), ca = Math.cos(b.ang), sa = Math.sin(b.ang), z = b.z - 0.3;
  const at = (a, c) => [b.x + ca * a - sa * c, b.y + sa * a + ca * c];
  shaft(T, b.x, b.y, b.ang, b.w * 0.34, b.d, z, z + b.h, "grid", [1.0, 0.9, 0.7], seed, "#9A8266");
  for(const s of [-1, 1]){ const [wx, wy] = at(s * b.w * 0.34, 0); shaft(T, wx, wy, b.ang, b.w * 0.33, b.d * 0.8, z, z + b.h * 0.8, "grid", [1.0, 0.92, 0.74], seed + s, "#9A8266");
    m.gable(wx, wy, z + b.h * 0.8, b.w * 0.34, b.d * 0.84, 4.5, b.ang, L("#8A5A44")); }
  m.gable(b.x, b.y, z + b.h, b.w * 0.36, b.d * 1.02, 5.5, b.ang, L("#8A5A44"));
  const [px, py] = at(0, b.d / 2 + 1.5); m.gable(px, py, z + b.h * 0.72, b.w * 0.2, 5, 3.4, b.ang + Math.PI / 2, L("#EADFC6"), L("#E0D4B8"));
  for(let k = -3; k <= 3; k++){ const [cx, cy] = at(k * 4.6, b.d / 2 + 2.2); m.box(cx, cy, z, 1.0, 1.0, b.h * 0.72, b.ang, L("#F0E8D4")); }
  m.frustum(b.x, b.y, z + b.h + 5.5, z + b.h + 10, 3.4, 2.4, 10, L("#EADFC6"), L("#6A9A9A")); m.cone(b.x, b.y, z + b.h + 10, 4, 2.8, 10, L("#6A9A9A"));
}
/* a tent: a pitched ridge in a colour, or a long white marquee */
function tent(T, t, big){
  const m = T.get("solid", t.x, t.y), COL = ["#E8402E", "#2E7AE8", "#F2C230", "#2EAA6A", "#E8742A", "#8A4AD8", "#18B8C8", "#E8509C"], col = big ? "#F4F2EC" : COL[t.c % 8];
  if(big){ m.box(t.x, t.y, t.z - 0.2, t.w, t.d, 3.2, t.ang, L("#F0EEE6"), L("#E8E4D8")); m.gable(t.x, t.y, t.z + 3.0, t.w + 0.8, t.d + 0.8, 2.6, t.ang, L("#F8F6EE"), L("#ECE8DC")); m.box(t.x, t.y, t.z + 1.2, t.w * 0.6, t.d + 0.1, 1.5, t.ang, L("#7A94AA")); }
  else { m.gable(t.x, t.y, t.z - 0.1, 3.4, 2.6, 2.0, t.ang, L(col), shadeC(col, -0.2)); }
}
/* the park wall: a low stone wall with a coping, and pillars with caps at the ends of each run */
function parkWall(T, W, pillars){
  for(let k = 0; k < W.length - 1; k++){ const a = W[k], b = W[k + 1]; if(Math.hypot(b.x - a.x, b.y - a.y) > 30) continue;
    const m = T.get("solid", a.x, a.y), th = 0.8, dx = b.x - a.x, dy = b.y - a.y, L2 = Math.hypot(dx, dy) || 1, nx = -dy / L2 * th / 2, ny = dx / L2 * th / 2, h = 3.0;
    m.quad([a.x - nx, a.y - ny, a.z - 0.2], [b.x - nx, b.y - ny, b.z - 0.2], [b.x - nx, b.y - ny, b.z + h], [a.x - nx, a.y - ny, a.z + h], L("#B8A888"));
    m.quad([a.x + nx, a.y + ny, a.z + h], [b.x + nx, b.y + ny, b.z + h], [b.x + nx, b.y + ny, b.z - 0.2], [a.x + nx, a.y + ny, a.z - 0.2], L("#B0A07C"));
    m.quad([a.x - nx * 1.3, a.y - ny * 1.3, a.z + h], [b.x - nx * 1.3, b.y - ny * 1.3, b.z + h], [b.x + nx * 1.3, b.y + ny * 1.3, b.z + h], [a.x + nx * 1.3, a.y + ny * 1.3, a.z + h], L("#D8CCAE")); }
  for(const p of pillars){ const m = T.get("solid", p.x, p.y); m.box(p.x, p.y, p.z - 0.2, 1.7, 1.7, 4.2, p.ang, L("#C8BA9A")); m.box(p.x, p.y, p.z + 4.0, 2.2, 2.2, 0.5, p.ang, L("#D8CCAE")); m.frustum(p.x, p.y, p.z + 4.5, p.z + 5.4, 0.9, 0.2, 6, L("#C8BA9A"), L("#C8BA9A")); }
}
/* an airship: a long ellipsoid with fins and a gondola */
function blimpGeo(){
  const m = new Mesher(), N = 14, K = 8, len = 34, rad = 6.5, P = (t, a, rr) => { const x = (t - 0.5) * len, r = rad * Math.sin(t * Math.PI) ** 0.7; return [x, Math.cos(a) * r * rr, Math.sin(a) * r * rr]; };
  for(let i = 0; i < N; i++) for(let j = 0; j < K; j++){ const a0 = j / K * TAU, a1 = (j + 1) / K * TAU, t0 = i / N, t1 = (i + 1) / N; const A = P(t0, a0, 1), B2 = P(t1, a0, 1), C = P(t1, a1, 1), D = P(t0, a1, 1);
    m.quad(A, B2, C, D, (i + j) & 1 ? L("#F4F2EC") : L("#E8E4DA")); }
  m.box(-1, 0, -rad - 1.4, 7, 2.6, 2.0, 0, L("#C8442A")); for(const [a, s] of [[0, 1], [Math.PI, 1], [Math.PI / 2, 1], [-Math.PI / 2, 1]]) m.box(-len / 2 + 3, Math.cos(a) * 4, Math.sin(a) * 4, 7, a % Math.PI ? 0.4 : 8, a % Math.PI ? 8 : 0.4, 0, L("#C8442A"));
  return m.geometry();
}

export { treeGeos, tricolourGeo, banking, flyover, villa, tent, parkWall, blimpGeo };
