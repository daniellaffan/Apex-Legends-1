import * as THREE from 'three';
import { TAU } from '../../config/util.js';
import { flat, lin, merge, paint } from './suzuka.js';

/* ---------- Mexico City: the kit -------------------------------------------
   The trees the sports city has that the other worlds do not (the weeping pirul
   and the Mexican cypress), and the autódromo's own landmarks, built in their own
   frame (x along the long axis, y up, z across; a stand's front is +z):
     diamond    the baseball field in the middle of the Foro Sol, with the podium
     palacio    the Palacio de los Deportes: a copper geodesic dome on a plinth
     baseball   a baseball stadium: a horseshoe of stands under a white canopy
     palillo    an athletics stadium: an oval of stands, a red running track
     velodrome  an open velodrome with its banked oval; velodrome2 a roofed hall
     helipad    the paddock helipad, with a helicopter parked on it
     catrinas   two giant Day of the Dead catrinas on plinths
     mariachi   a stage with a band in sombreros
     flag       a monumental flagpole (the flag itself waves, so it is instanced)
   Everything is painted (vertex colour), so it merges into the world's buckets. */

const grad = (lo, hi, y0, y1) => { const A = lin(lo), B = lin(hi); return (x, y) => A.clone().lerp(B, Math.min(1, Math.max(0, (y - y0) / (y1 - y0)))); };
const box = (l, h, w, col, x, y, z, ry) => { const g = new THREE.BoxGeometry(l, h, w); if(ry) g.rotateY(ry); g.translate(x || 0, (y || 0) + h / 2, z || 0); return paint(g, typeof col === "function" ? col : flat(col), () => 0); };
const cyl = (r0, r1, h, seg, col, x, y, z, open) => { const g = new THREE.CylinderGeometry(r1, r0, h, seg, 1, !!open); g.translate(x || 0, (y || 0) + h / 2, z || 0); return paint(g, typeof col === "function" ? col : flat(col), () => 0); };
const disc = (r, seg, col, y, x, z) => { const g = new THREE.CircleGeometry(r, seg); g.rotateX(-Math.PI / 2); g.translate(x || 0, y, z || 0); return paint(g, flat(col), () => 0); };
const ring = (r0, r1, seg, col, y, a0, a1) => { const g = new THREE.RingGeometry(r0, r1, seg, 1, a0 || 0, a1 == null ? TAU : a1); g.rotateX(-Math.PI / 2); g.translate(0, y, 0); return paint(g, flat(col), () => 0); };
// an elliptical ring of stepped stands, rising outwards, between angles a0..a1, for rx x rz at the front row
function standRing(parts, rx, rz, rows, a0, a1, seg, cols, roof){
  for(let r = 0; r < rows; r++){
    const sx = rx + r * 0.9, sz = rz + r * 0.9, y = 1.2 + r * 0.5, col = cols[r % cols.length];
    for(let k = 0; k < seg; k++){
      const t0 = a0 + (a1 - a0) * k / seg, t1 = a0 + (a1 - a0) * (k + 1) / seg, tm = (t0 + t1) / 2;
      const x = Math.cos(tm) * sx, z = Math.sin(tm) * sz, len = Math.hypot(Math.cos(t1) * sx - Math.cos(t0) * sx, Math.sin(t1) * sz - Math.sin(t0) * sz);
      const g = new THREE.BoxGeometry(len + 0.1, 0.5, 0.9); g.rotateY(-Math.atan2(Math.cos(tm) * sz, -Math.sin(tm) * sx)); g.translate(x, y, z); parts.push(paint(g, flat(col), () => 0));
    }
  }
  if(roof){ const R0 = rows * 0.9; for(let k = 0; k < seg; k++){ const t0 = a0 + (a1 - a0) * k / seg, t1 = a0 + (a1 - a0) * (k + 1) / seg, tm = (t0 + t1) / 2;
      const sx = rx + R0 * 0.6, sz = rz + R0 * 0.6, x = Math.cos(tm) * sx, z = Math.sin(tm) * sz, len = Math.hypot(Math.cos(t1) * sx - Math.cos(t0) * sx, Math.sin(t1) * sz - Math.sin(t0) * sz);
      // a white canopy blade over the top rows, angled up towards the field
      const g = new THREE.BoxGeometry(len + 0.4, 0.35, R0 * 0.9); g.rotateX(-0.18); g.rotateY(-Math.atan2(Math.cos(tm) * sz, -Math.sin(tm) * sx)); g.translate(x, 1.2 + rows * 0.5 + 7, z); parts.push(paint(g, flat(roof), () => 0));
      if(k % 3 === 0){ const p = new THREE.BoxGeometry(0.5, rows * 0.5 + 7, 0.5); p.translate(Math.cos(tm) * (rx + R0 + 0.8), 1.2 + (rows * 0.5 + 7) / 2, Math.sin(tm) * (rz + R0 + 0.8)); parts.push(paint(p, flat("#9AA0A6"), () => 0)); } } }
  // the outer wall
  for(let k = 0; k < seg; k++){ const t0 = a0 + (a1 - a0) * k / seg, t1 = a0 + (a1 - a0) * (k + 1) / seg, tm = (t0 + t1) / 2, sx = rx + rows * 0.9 + 0.5, sz = rz + rows * 0.9 + 0.5;
    const len = Math.hypot(Math.cos(t1) * sx - Math.cos(t0) * sx, Math.sin(t1) * sz - Math.sin(t0) * sz), g = new THREE.BoxGeometry(len + 0.1, 1.2 + rows * 0.5 + 1.5, 0.6);
    g.rotateY(-Math.atan2(Math.cos(tm) * sz, -Math.sin(tm) * sx)); g.translate(Math.cos(tm) * sx, (1.2 + rows * 0.5 + 1.5) / 2, Math.sin(tm) * sz); parts.push(paint(g, flat("#C8C2B8"), () => 0)); }
  // the seats: positions on every row for the crowd (local x, y, z)
  const seats = [];
  for(let r = 0; r < rows; r++){ const sx = rx + r * 0.9, sz = rz + r * 0.9, per = Math.max(1, Math.round((a1 - a0) * (sx + sz) / 2 / 0.8));
    for(let k = 0; k < per; k++){ const t = a0 + (a1 - a0) * (k + 0.5) / per; seats.push([Math.cos(t) * sx, 1.2 + r * 0.5 + 0.5, Math.sin(t) * sz]); } }
  return seats;
}

const KIT3 = {
  /* the Foro Sol's field: the outfield grass, the dirt infield, the bases and the lines; and the
     podium in front of it, three steps under a lit arch, as the race ends here in the stadium */
  diamond(){
    const parts = [disc(30, 32, "#4E8A32", 0.05), ring(18, 26, 32, "#6A9A3A", 0.07, -Math.PI * 0.75, Math.PI * 0.5)];
    const d = new THREE.CircleGeometry(15, 4); d.rotateX(-Math.PI / 2); d.rotateY(Math.PI / 4); d.translate(-8, 0.09, 0); parts.push(paint(d, flat("#B07A4A"), () => 0));
    const g = new THREE.CircleGeometry(8, 4); g.rotateX(-Math.PI / 2); g.rotateY(Math.PI / 4); g.translate(-8, 0.11, 0); parts.push(paint(g, flat("#5A9236"), () => 0));
    for(const [x, z] of [[-18.6, 0], [-8, 10.6], [2.6, 0], [-8, -10.6]]) parts.push(box(0.6, 0.12, 0.6, "#F2F2EE", x, 0.1, z));
    parts.push(cyl(1.6, 1.6, 0.3, 12, "#B07A4A", -8, 0.1, 0));
    // the podium: steps, a stage, a lit arch in green, white and red
    const P0 = 16; parts.push(box(16, 0.8, 9, "#2A2E34", P0, 0, 0));
    for(const [x, h, c] of [[0, 2.2, "#E8C02A"], [-3.4, 1.6, "#C8CCD0"], [3.4, 1.2, "#C87A3A"]]) parts.push(box(3, h, 2.6, c, P0 + x * 0, 0.8, x));
    for(const [z, c] of [[-6.5, "#2E8B45"], [0, "#F2F2EE"], [6.5, "#D8352A"]]) parts.push(box(1, 9, 1.4, c, P0 + 3.5, 0.8, z));
    parts.push(box(1.2, 1.4, 15, "#1E1E22", P0 + 3.5, 9.8, 0));
    return { parts, podium:[P0, 3, 0] };
  },
  // the Palacio de los Deportes: a low dome clad in copper panels (each face its own shade, a few gone green)
  palacio(m){
    const R = Math.min(m.l, m.w) * 0.5, parts = [cyl(R * 1.04, R * 1.08, 3, 40, "#B8B0A2", 0, 0, 0)];
    const ge = new THREE.IcosahedronGeometry(R, 3), p = ge.attributes.position, keep = [];
    const nonIdx = ge.index ? ge.toNonIndexed() : ge, pp = nonIdx.attributes.position;
    for(let f = 0; f < pp.count; f += 3){ let ok = true; for(let k = 0; k < 3; k++) if(pp.getY(f + k) < -0.01) ok = false; if(ok) keep.push(f); }
    const pos = new Float32Array(keep.length * 9); keep.forEach((f, i) => { for(let k = 0; k < 3; k++){ pos[i * 9 + k * 3] = pp.getX(f + k); pos[i * 9 + k * 3 + 1] = pp.getY(f + k) * 0.42 + 3; pos[i * 9 + k * 3 + 2] = pp.getZ(f + k); } });
    const dome = new THREE.BufferGeometry(); dome.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const COP = ["#B8733A", "#A8642E", "#C8844A", "#9A5A2C", "#B87A44", "#5E8A72"];
    parts.push(paint(dome, (x, y, z, f) => lin(COP[(f * 7 + (f >> 2)) % 23 === 0 ? 5 : (f * 13) % 5]), () => 0));
    // a ring of glazing round the foot and the entrance canopies
    parts.push(cyl(R * 1.0, R * 1.0, 1.6, 40, "#3A4652", 0, 3, 0, true));
    for(let k = 0; k < 4; k++){ const a = k * Math.PI / 2 + 0.4; parts.push(box(16, 0.5, 10, "#E8E4DA", Math.cos(a) * (R + 6), 4, Math.sin(a) * (R + 6), -a)); }
    parts.push(disc(R * 1.5, 40, "#B4AEA4", 0.06));
    return { parts };
  },
  // a baseball stadium: a horseshoe of stands round a green field under a white canopy
  baseball(m){
    const r = Math.min(m.l, m.w) * 0.36, parts = [disc(r + 2, 40, "#4E8A32", 0.05)];
    const d = new THREE.CircleGeometry(r * 0.32, 4); d.rotateX(-Math.PI / 2); d.rotateY(Math.PI / 4); d.translate(-r * 0.45, 0.08, 0); parts.push(paint(d, flat("#B07A4A"), () => 0));
    const seats = standRing(parts, r, r, 22, Math.PI * 0.55, Math.PI * 1.45, 26, ["#D8352A", "#C02A22"], "#F2F2EE");
    return { parts, seats };
  },
  // an athletics stadium: an oval of stands, a red track, a green field
  palillo(m){
    const rx = m.l * 0.36, rz = m.w * 0.34, parts = [];
    const tr = new THREE.CircleGeometry(1, 48); tr.rotateX(-Math.PI / 2); tr.scale(rx, 1, rz); tr.translate(0, 0.06, 0); parts.push(paint(tr, flat("#B8503A"), () => 0));
    const fi = new THREE.CircleGeometry(1, 48); fi.rotateX(-Math.PI / 2); fi.scale(rx - 9, 1, rz - 9); fi.translate(0, 0.09, 0); parts.push(paint(fi, flat("#4E8A32"), () => 0));
    const seats = standRing(parts, rx + 1, rz + 1, 16, 0, TAU, 36, ["#2F5FB8", "#2A52A0"], null);
    return { parts, seats };
  },
  // an open velodrome: the banked oval and a ring of low stands
  velodrome(m){
    const rx = m.l * 0.3, rz = m.w * 0.26, parts = [], N = 40;
    for(let k = 0; k < N; k++){ const t0 = k / N * TAU, t1 = (k + 1) / N * TAU;
      const pts = [[Math.cos(t0) * rx, 0.2, Math.sin(t0) * rz], [Math.cos(t1) * rx, 0.2, Math.sin(t1) * rz], [Math.cos(t1) * (rx + 7), 3.2 + 2 * Math.abs(Math.cos(t1)), Math.sin(t1) * (rz + 7)], [Math.cos(t0) * (rx + 7), 3.2 + 2 * Math.abs(Math.cos(t0)), Math.sin(t0) * (rz + 7)]];
      const g = new THREE.BufferGeometry(); const v = [0, 2, 1, 0, 3, 2].flatMap(i => pts[i]); g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3)); parts.push(paint(g, flat("#C8B48A"), () => 0)); }
    parts.push(disc(rx * 0.95, 32, "#5E8A3A", 0.1));
    const seats = standRing(parts, rx + 8, rz + 8, 8, 0, TAU, 28, ["#E8E4DA", "#D8D2C4"], null);
    return { parts, seats };
  },
  // a roofed velodrome hall: an oval wall and a shallow curved roof
  velodrome2(m){
    const rx = m.l * 0.45, rz = m.w * 0.45, parts = [];
    const w = new THREE.CylinderGeometry(1, 1, 9, 36, 1, true); w.scale(rx, 1, rz); w.translate(0, 4.5, 0); parts.push(paint(w, flat("#D8D2C4"), () => 0));
    const r = new THREE.SphereGeometry(1, 36, 6, 0, TAU, 0, Math.PI * 0.32); r.scale(rx * 1.05, 10, rz * 1.05); r.translate(0, 9 - 10 * Math.cos(Math.PI * 0.32), 0); parts.push(paint(r, grad("#B8BCC0", "#E8ECEF", 9, 12), () => 0));
    for(let k = 0; k < 12; k++){ const a = k / 12 * TAU; parts.push(box(0.4, 7, 0.4, "#9AA0A6", Math.cos(a) * (rx + 0.4), 0, Math.sin(a) * (rz + 0.4))); }
    return { parts };
  },
  helipad(){
    const parts = [disc(13, 32, "#4A4E54", 0.08), ring(9.5, 10.5, 32, "#E8C02A", 0.12)];
    parts.push(box(1.4, 0.04, 8, "#F2F2EE", -2.6, 0.12, 0), box(1.4, 0.04, 8, "#F2F2EE", 2.6, 0.12, 0), box(5.2, 0.04, 1.4, "#F2F2EE", 0, 0.12, 0));
    return { parts };
  },
  /* two giant catrinas: a long dress, a skull face, and a wide hat heaped with flowers. Generic Day of
     the Dead figures, as seen in fan zones in the city */
  catrinas(){
    const parts = [];
    for(const [x, dress, hat] of [[-6, "#7A2A8A", "#1E1E22"], [6, "#D84A2A", "#2E2A4A"]]){
      parts.push(cyl(1.6, 1.6, 1.2, 10, "#B8B0A2", x, 0, 0));
      parts.push(cyl(2.6, 0.8, 7, 12, grad(dress, "#F4A21C", 1, 8), x, 1.2, 0));
      parts.push(cyl(0.7, 0.9, 2.2, 10, dress, x, 8.2, 0));
      const head = new THREE.SphereGeometry(1.25, 12, 10); head.translate(x, 11.6, 0); parts.push(paint(head, flat("#F4F0E6"), () => 0));
      for(const ex of [-0.42, 0.42]){ const e = new THREE.SphereGeometry(0.32, 8, 6); e.scale(1, 1.2, 0.5); e.translate(x + ex, 11.75, 1.05); parts.push(paint(e, flat("#1E1E22"), () => 0)); }
      parts.push(cyl(3.4, 3.4, 0.25, 20, hat, x, 12.4, 0), cyl(1.3, 1.1, 1.2, 14, hat, x, 12.6, 0));
      for(let k = 0; k < 9; k++){ const a = k / 9 * TAU, f = new THREE.IcosahedronGeometry(0.45, 0); f.translate(x + Math.cos(a) * 1.8, 12.9, Math.sin(a) * 1.8); parts.push(paint(f, flat(["#F4A21C", "#E4007C", "#F08A1E"][k % 3]), () => 0)); }
      for(const s of [-1, 1]){ const a = new THREE.BoxGeometry(0.4, 4.6, 0.4); a.rotateZ(s * 0.5); a.translate(x + s * 1.7, 7.6, 0.3); parts.push(paint(a, flat(dress), () => 0)); }
    }
    // a marigold arch behind them
    for(let k = 0; k <= 16; k++){ const a = Math.PI * k / 16, f = new THREE.IcosahedronGeometry(0.9, 0); f.translate(Math.cos(a) * 10, 1 + Math.sin(a) * 9, -3); parts.push(paint(f, flat(k % 2 ? "#F4A21C" : "#F08A1E"), () => 0)); }
    return { parts };
  },
  // a mariachi stage: a raised platform, a backdrop in pink, and the band in black with silver and wide sombreros
  mariachi(){
    const parts = [box(18, 1.4, 9, "#2A2E34"), box(18, 7, 0.4, "#E4007C", 0, 1.4, -4.3), box(19, 0.4, 10, "#1E1E22", 0, 8.4, 0)];
    for(const x of [-8.8, 8.8]) parts.push(box(0.4, 7, 0.4, "#9AA0A6", x, 1.4, 4.2));
    for(let k = 0; k < 7; k++){ const x = -6 + k * 2;
      parts.push(box(0.4, 0.9, 0.3, "#1E1E22", x, 1.4, 0.5), box(0.55, 0.75, 0.32, "#1E1E22", x, 2.3, 0.5), box(0.24, 0.26, 0.24, "#C89A70", x, 3.05, 0.5));
      parts.push(cyl(0.75, 0.75, 0.06, 14, "#1E1E22", x, 3.3, 0.5), cyl(0.2, 0.14, 0.32, 10, "#1E1E22", x, 3.36, 0.5));
      if(k % 2) parts.push(box(0.5, 0.18, 0.12, "#8A5A30", x + 0.2, 2.5, 0.75)); }
    return { parts };
  },
  // the monumental flagpole (the flag is instanced so it can wave): 60 m tall
  flag(){ return { parts:[cyl(0.9, 0.5, 60, 12, "#C8CCD0"), cyl(3.4, 3.4, 1, 16, "#B8B0A2")], top:58 }; },
};

// trees: the weeping pirul, the Mexican cypress
function mexTrees(){
  const G = {};
  const trunk = (r0, r1, h, col, lean) => { const t = new THREE.CylinderGeometry(r1, r0, h, 5, 1, true); t.translate(0, h / 2, 0); if(lean) t.rotateZ(lean); return paint(t, flat(col || "#6A5440"), () => 0); };
  const blob = (r, x, y, z, sy, lo, hi) => { const b = new THREE.IcosahedronGeometry(r, 0); b.scale(1, sy, 1); b.translate(x, y, z); return paint(b, grad(lo, hi, y - r * sy, y + r * sy)); };
  { const parts = [trunk(0.05, 0.03, 0.5, "#5E4A3A", 0.1), blob(0.3, 0.02, 0.62, 0, 0.6, "#4A6A34", "#7A9A48")];
    // drooping curtains of leaves round the crown
    for(let k = 0; k < 9; k++){ const a = k / 9 * TAU, f = new THREE.PlaneGeometry(0.2, 0.42, 1, 2); f.translate(0, -0.21, 0); f.rotateY(a); f.translate(Math.cos(a) * 0.3, 0.66, Math.sin(a) * 0.3); parts.push(paint(f, grad("#3E5E2C", "#6A8A40", 0.24, 0.66))); }
    G.pirul = merge(parts); }
  { const c = (r, h, y, lo, hi) => { const g = new THREE.ConeGeometry(r, h, 8, 1, true); g.translate(0, y + h / 2, 0); return paint(g, grad(lo, hi, y, y + h)); };
    G.cypress = merge([trunk(0.02, 0.014, 0.2, "#4A3A2A"), c(0.16, 0.6, 0.12, "#1E3A22", "#2E5230"), c(0.11, 0.4, 0.55, "#24422A", "#36603A")]); }
  // a little square of papel picado: tinted, hung off its top edge so the flag shader waves it
  { const p = new THREE.PlaneGeometry(1, 0.7, 4, 1); p.translate(0.5, -0.35, 0); G.picado = paint(p, flat("#FFFFFF")); }
  // the monumental flag: three vertical bands, green, white, red (no emblem), hung off its left edge
  { const p = new THREE.PlaneGeometry(1, 0.57, 9, 2); p.translate(0.5, 0, 0);
    G.bigflag = paint(p, x => lin(x < 1 / 3 ? "#1E7A3A" : x < 2 / 3 ? "#F2F2EE" : "#C8242A"), () => 0); }
  return G;
}

export { KIT3, mexTrees };
