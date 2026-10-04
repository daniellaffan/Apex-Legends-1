import * as THREE from 'three';
import { TAU } from '../../config/util.js';
import { flat, lin, merge, paint } from './suzuka.js';

/* ---------- Interlagos: the kit -------------------------------------------
   The plants (palms, Atlantic-forest broadleaves, flowering ipês, eucalyptus,
   banana, shrubs, tall grass, reeds), the city (houses in three kinds, tower
   blocks, warehouses), and the small moving things (helicopters, kites, birds).
   Everything is unit-sized where it is instanced; a tint mask of 1 takes the
   instance's colour (a wall, a canopy), 0 keeps its own (a roof, a trunk). */

const grad = (lo, hi, y0, y1) => { const A = lin(lo), B = lin(hi); return (x, y) => A.clone().lerp(B, Math.min(1, Math.max(0, (y - y0) / (y1 - y0)))); };
const box = (l, h, w, col, x, y, z, mask, ry) => { const g = new THREE.BoxGeometry(l, h, w); if(ry) g.rotateY(ry); g.translate(x || 0, (y || 0) + h / 2, z || 0); return paint(g, typeof col === "function" ? col : flat(col), () => mask || 0); };

function ilgGeos(){
  const G = {};
  // open-ended: the caps underneath are never seen from above
  const trunk = (r0, r1, h, col, lean) => { const t = new THREE.CylinderGeometry(r1, r0, h, 5, 1, true); t.translate(0, h / 2, 0); if(lean) t.rotateZ(lean); return paint(t, flat(col || "#6A5440"), () => 0); };
  const blob = (r, x, y, z, sy, lo, hi) => { const b = new THREE.IcosahedronGeometry(r, 0); b.scale(1, sy, 1); b.translate(x, y, z); return paint(b, grad(lo, hi, y - r * sy, y + r * sy)); };
  const cone = (r, h, y, seg, lo, hi) => { const c = new THREE.ConeGeometry(r, h, seg, 1, true); c.translate(0, y + h / 2, 0); return paint(c, grad(lo, hi, y, y + h)); };
  /* a palm: a slim, slightly curved trunk and a crown of drooping fronds */
  { const parts = [trunk(0.03, 0.022, 0.86, "#8A7A60", 0.04)];
    for(let k = 0; k < 9; k++){ const a = k / 9 * TAU, f = new THREE.PlaneGeometry(0.42, 0.09, 3, 1);
      const p = f.attributes.position; for(let i = 0; i < p.count; i++){ const x = p.getX(i) + 0.21; p.setX(i, x); p.setY(i, -x * x * 0.9); }
      f.rotateX(-Math.PI / 2 + 0.25); f.rotateY(a); f.translate(0.035, 0.88, 0); parts.push(paint(f, grad("#2E6A26", "#5A9A3A", 0.7, 0.9))); }
    parts.push(blob(0.06, 0.035, 0.87, 0, 1, "#5A4A2A", "#7A6A3A"));
    G.palm = merge(parts); }
  // Atlantic-forest broadleaf: a big, many-lobed crown in rich greens
  G.broad = merge([trunk(0.04, 0.025, 0.5, "#6A5A48"),
    blob(0.34, 0, 0.62, 0, 0.75, "#24561E", "#4E8A2E"), blob(0.27, 0.22, 0.7, 0.1, 0.75, "#2A5E22", "#58943A"),
    blob(0.25, -0.2, 0.72, -0.12, 0.75, "#2A5E22", "#5A963C"), blob(0.2, 0.02, 0.86, 0.16, 0.7, "#346A28", "#68A442")]);
  G.broadFar = merge([blob(0.38, 0, 0.62, 0, 0.8, "#24561E", "#4E8A2E")]);
  // ipê: a slim trunk and a flat, open crown; the crown is pale so the instance's colour (yellow, purple, pink) carries
  G.ipe = merge([trunk(0.03, 0.02, 0.55, "#5A4A3A"),
    blob(0.32, 0, 0.66, 0, 0.5, "#C8C0A0", "#F4F0E0"), blob(0.24, 0.2, 0.72, 0.06, 0.45, "#D0C8A8", "#F8F4E8"), blob(0.22, -0.2, 0.74, -0.06, 0.45, "#D0C8A8", "#F8F4E8")]);
  // eucalyptus: tall, pale bark, a thin high crown in grey-green
  G.euca = merge([trunk(0.018, 0.012, 0.72, "#D8D0C0"),
    blob(0.16, 0, 0.8, 0, 1.3, "#4E6A48", "#7A9470"), blob(0.12, 0.06, 0.92, 0.04, 1.2, "#56724E", "#86A07A")]);
  G.eucaFar = merge([cone(0.17, 0.62, 0.38, 5, "#4E6A48", "#7A9470")]);
  // banana: a cluster of broad paddle leaves on short stems
  { const parts = [trunk(0.08, 0.06, 0.45, "#7A8A4A")];
    for(let k = 0; k < 7; k++){ const a = k / 7 * TAU, f = new THREE.PlaneGeometry(0.55, 0.2, 3, 1);
      const p = f.attributes.position; for(let i = 0; i < p.count; i++){ const x = p.getX(i) + 0.27; p.setX(i, x); p.setY(i, x * 0.6 - x * x * 1.1); }
      f.rotateX(-Math.PI / 2 + 0.4); f.rotateY(a); f.translate(0, 0.42 + (k % 3) * 0.08, 0); parts.push(paint(f, grad("#3E7A2A", "#7AB44A", 0.3, 0.8))); }
    G.banana = merge(parts); }
  G.shrub = merge([blob(0.5, 0, 0.42, 0, 0.8, "#2E5A22", "#56883A"), blob(0.36, 0.3, 0.36, 0.1, 0.8, "#346228", "#5E9040")]);
  // tall grass: a tuft of flat blades
  { const parts = []; for(let k = 0; k < 5; k++){ const b = new THREE.PlaneGeometry(0.12, 1); b.translate(0, 0.5, 0); b.rotateX((k % 2 ? 1 : -1) * 0.2); b.rotateY(k / 5 * Math.PI); parts.push(paint(b, grad("#5A7A2E", "#B8B868", 0, 1))); }
    G.grass = merge(parts); }
  // reeds: thin stalks with brown heads
  { const parts = []; for(let k = 0; k < 6; k++){ const a = k / 6 * TAU, r = 0.15 + (k % 2) * 0.1, s = new THREE.CylinderGeometry(0.012, 0.018, 1, 3, 1, true); s.translate(Math.cos(a) * r, 0.5, Math.sin(a) * r); parts.push(paint(s, flat("#6A8A3A")));
      const h = new THREE.CylinderGeometry(0.03, 0.03, 0.16, 4); h.translate(Math.cos(a) * r, 0.92, Math.sin(a) * r); parts.push(paint(h, flat("#6A4A2A"), () => 0)); }
    G.reeds = merge(parts); }
  { const parts = []; for(const [x, z] of [[0, 0], [0.4, 0.2], [-0.35, 0.3], [0.15, -0.4], [-0.3, -0.25]]){ const b = new THREE.IcosahedronGeometry(0.13, 0); b.translate(x, 0.16, z); parts.push(paint(b, flat("#FFFFFF"))); }
    const leaf = new THREE.CircleGeometry(0.55, 6); leaf.rotateX(-Math.PI / 2); leaf.translate(0, 0.03, 0); parts.push(paint(leaf, flat("#3E7A2E"), () => 0)); G.flowers = merge(parts); }

  /* ---- the city. A house is 1 x 1 x 1 in plan and per floor; the instance scales it. Walls take
     the tint; roofs, tanks, frames and the washing keep their own colours. ---- */
  const wall = flat("#FFFFFF"), win = "#2C3440", frame = "#E8E4D8";
  const windows = (parts, floors, ox) => { for(let f = 0; f < floors; f++) for(const x of [-0.25, 0.22]){ parts.push(box(0.18, 0.32, 0.02, frame, x + (ox || 0), f + 0.32, 0.505)); parts.push(box(0.14, 0.26, 0.03, win, x + (ox || 0), f + 0.35, 0.51)); } };
  // 0: a flat concrete slab roof, a blue water tank and a satellite dish
  G.house0 = floors => { const parts = [box(1, floors, 1, wall, 0, 0, 0, 1), box(1.04, 0.08, 1.04, "#8A8680", 0, floors, 0)];
    windows(parts, floors); parts.push(box(0.16, 0.6, 0.02, "#5A3A2A", 0.05, 0, 0.505));
    parts.push(box(0.22, 0.16, 0.22, "#3A6AA8", 0.26, floors + 0.08, -0.22));
    const d = new THREE.CircleGeometry(0.08, 8); d.rotateX(-0.6); d.translate(-0.3, floors + 0.2, 0.3); parts.push(paint(d, flat("#E8E8E8"), () => 0));
    return merge(parts); };
  // 1: a terracotta pitched roof
  G.house1 = floors => { const parts = [box(1, floors, 1, wall, 0, 0, 0, 1)]; windows(parts, floors); parts.push(box(0.16, 0.6, 0.02, "#5A3A2A", -0.1, 0, 0.505));
    const pos = [], h = 0.32, L = 0.56, W = 0.58; const v = (a, b, c) => pos.push(a, b, c);
    v(-L, 0, W); v(L, 0, W); v(L, h, 0); v(-L, 0, W); v(L, h, 0); v(-L, h, 0); v(L, 0, -W); v(-L, 0, -W); v(-L, h, 0); v(L, 0, -W); v(-L, h, 0); v(L, h, 0);
    v(0.5, 0, 0.5); v(0.5, 0, -0.5); v(0.5, h * 0.86, 0); v(-0.5, 0, -0.5); v(-0.5, 0, 0.5); v(-0.5, h * 0.86, 0);
    const r = new THREE.BufferGeometry(); r.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); r.translate(0, floors, 0);
    parts.push(paint(r, (x, y, z, f) => lin(f < 4 ? (f % 2 ? "#B8583A" : "#A84E32") : "#E8DCC8"), (y, f) => f < 4 ? 0 : 1));
    return merge(parts); };
  // 2: a rooftop terrace with a low wall, a tank, and washing on a line
  G.house2 = floors => { const parts = [box(1, floors, 1, wall, 0, 0, 0, 1), box(1.02, 0.06, 1.02, "#9A9288", 0, floors, 0)];
    for(const [l, w, x, z] of [[1, 0.06, 0, 0.48], [1, 0.06, 0, -0.48], [0.06, 1, 0.48, 0], [0.06, 1, -0.48, 0]]) parts.push(box(l, 0.18, w, wall, x, floors, z, 1));
    windows(parts, floors); parts.push(box(0.2, 0.2, 0.2, "#3A6AA8", -0.28, floors + 0.06, -0.26));
    parts.push(box(0.6, 0.012, 0.012, "#3A3A3A", 0.05, floors + 0.36, 0.1));
    for(let k = 0; k < 4; k++) parts.push(box(0.1, 0.14, 0.01, ["#E8E8E8", "#D8352A", "#2F78B8", "#E8C02A"][k], -0.18 + k * 0.15, floors + 0.22, 0.1));
    return merge(parts); };
  return G;
}

/* ---- built things that are merged, not instanced: in the building's own frame (front +z) ---- */
const KIT2 = {
  // a tower block: a slab, floors of windows, a roof plant room, and sometimes a helipad
  tower(t){
    const parts = [], H = t.floors * 2.9, l = t.l, w = t.w;
    parts.push(box(l, H, w, t.col)); parts.push(box(l + 0.4, 0.5, w + 0.4, "#8A8680", 0, H, 0));
    for(let f = 0; f < t.floors; f++){ const y = f * 2.9 + 1.0;
      parts.push(box(l + 0.06, 0.9, w * 0.96, "#3A4652", 0, y, 0)); parts.push(box(l * 0.96, 0.9, w + 0.06, "#3A4652", 0, y, 0)); }
    if(t.helipad){ parts.push(box(l * 0.8, 0.12, w * 0.8, "#4A4E54", 0, H + 0.5, 0));
      const c = new THREE.RingGeometry(w * 0.26, w * 0.3, 20); c.rotateX(-Math.PI / 2); c.translate(0, H + 0.64, 0); parts.push(paint(c, flat("#E8C02A"), () => 0));
      parts.push(box(w * 0.08, 0.02, w * 0.3, "#F2F2F2", -w * 0.08, H + 0.64, 0), box(w * 0.08, 0.02, w * 0.3, "#F2F2F2", w * 0.08, H + 0.64, 0), box(w * 0.16, 0.02, w * 0.06, "#F2F2F2", 0, H + 0.64, 0)); }
    else parts.push(box(l * 0.3, 2.4, w * 0.3, "#9A9690", l * 0.2, H + 0.5, 0), box(1.6, 1.2, 1.6, "#3A6AA8", -l * 0.25, H + 0.5, w * 0.2));
    return { parts, top:H };
  },
  // a warehouse with a saw-tooth roof
  shed(s){
    const parts = [box(s.l, s.h, s.w, "#B8B4AA")], n = Math.max(2, Math.floor(s.l / 6));
    for(let k = 0; k < n; k++){ const x = -s.l / 2 + (k + 0.5) * s.l / n, g = new THREE.BoxGeometry(s.l / n, 0.3, s.w); g.rotateZ(0.32); g.translate(x, s.h + 1, 0); parts.push(paint(g, flat(k % 2 ? "#8A9298" : "#9AA2A8"), () => 0)); }
    parts.push(box(5, 4.5, 0.12, "#5A6670", 0, 0, s.w / 2 + 0.06));
    return { parts };
  },
  // a row of food stalls: counters under striped awnings
  stalls(s){
    const parts = [], n = Math.floor(s.wid / 5), C = ["#E8C02A", "#2E8B45", "#2F78B8", "#D8352A", "#F08A1E"];
    for(let k = 0; k < n; k++){ const x = -s.wid / 2 + (k + 0.5) * s.wid / n, c = C[k % C.length];
      parts.push(box(4, 2.4, 3, "#F2EEE4", x)); parts.push(box(4.3, 0.12, 4.2, c, x, 2.6, 0.5)); parts.push(box(4.3, 0.5, 0.06, "#FFFFFF", x, 2.1, 2.6));
      parts.push(box(3.4, 1.0, 0.2, "#8A5A3A", x, 0, 1.6)); }
    return { parts };
  },
  // a football pitch: a mown slab, its lines, goals
  pitch(p){
    const parts = [box(p.l + 4, 0.3, p.w + 4, "#4E8A32", 0, -0.2, 0), box(p.l, 0.06, p.w, "#5E9A3A", 0, 0.1, 0)];
    const line = (l, w, x, z) => parts.push(box(l, 0.04, w, "#F2F2EE", x, 0.16, z));
    line(p.l, 0.14, 0, p.w / 2); line(p.l, 0.14, 0, -p.w / 2); line(0.14, p.w, p.l / 2, 0); line(0.14, p.w, -p.l / 2, 0); line(0.14, p.w, 0, 0);
    const c = new THREE.RingGeometry(p.w * 0.12, p.w * 0.12 + 0.14, 24); c.rotateX(-Math.PI / 2); c.translate(0, 0.2, 0); parts.push(paint(c, flat("#F2F2EE"), () => 0));
    for(const s of [-1, 1]){ parts.push(box(0.12, 2.0, 0.12, "#F2F2F2", s * p.l / 2, 0, -2.4), box(0.12, 2.0, 0.12, "#F2F2F2", s * p.l / 2, 0, 2.4), box(0.12, 0.12, 4.9, "#F2F2F2", s * p.l / 2, 2.0, 0)); }
    return { parts };
  },
  // a big screen on legs, facing +z
  screen(s){
    const parts = [];
    for(const x of [-s.wid * 0.35, s.wid * 0.35]) parts.push(box(0.6, 7, 0.6, "#2A2E34", x));
    parts.push(box(s.wid + 0.8, s.wid * 0.6 + 0.8, 0.8, "#1A1C20", 0, 7, -0.2));
    return { parts, panel:{ w:s.wid, h:s.wid * 0.6, y:7.4 + s.wid * 0.3, z:0.25 } };
  },
  // a wooden jetty on posts, along +x
  jetty(j){
    const parts = [box(j.len, 0.2, 2.2, "#8A6A48", j.len / 2, 0, 0)];
    for(let x = 1; x < j.len; x += 3) for(const z of [-1, 1]) parts.push(box(0.2, 2.6, 0.2, "#5A4632", x, -2.4, z));
    parts.push(box(1.6, 0.25, 0.8, "#E8E4DA", j.len - 1.5, 0.2, 1.6));                   // a little boat tied on
    return { parts };
  },
};

/* ---- the moving things ---- */
function movers(){
  const M = {};
  // a helicopter: body, tail boom, skids; the rotor is separate so it can spin
  { const parts = [];
    const b = new THREE.SphereGeometry(1.2, 10, 8); b.scale(1.6, 1, 1); b.translate(0, 1.5, 0); parts.push(paint(b, flat("#FFFFFF"), () => 1));
    const w = new THREE.SphereGeometry(0.9, 8, 6); w.scale(1, 0.7, 0.95); w.translate(1.2, 1.7, 0); parts.push(paint(w, flat("#2C3A46"), () => 0));
    parts.push(box(4, 0.35, 0.35, "#FFFFFF", -3.2, 1.5, 0, 1), box(0.6, 1.2, 0.12, "#FFFFFF", -5.1, 1.7, 0, 1));
    for(const z of [-0.8, 0.8]) parts.push(box(3.2, 0.1, 0.1, "#3A3A3A", 0, 0.2, z));
    M.heli = merge(parts);
    const r = new THREE.BoxGeometry(9, 0.06, 0.3); r.translate(0, 2.8, 0); const r2 = r.clone(); r2.rotateY(Math.PI / 2);
    M.rotor = merge([paint(r, flat("#2A2A2A"), () => 0), paint(r2, flat("#2A2A2A"), () => 0)]); }
  // a kite: a diamond and a ribbon tail, unit-sized
  { const pos = [0, 0.5, 0, -0.35, 0, 0, 0, -0.5, 0, 0, 0.5, 0, 0, -0.5, 0, 0.35, 0, 0];
    const k = new THREE.BufferGeometry(); k.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    const t = new THREE.PlaneGeometry(0.06, 1.2); t.translate(0, -1.1, 0);
    M.kite = merge([paint(k, flat("#FFFFFF")), paint(t, flat("#F2F2F2"))]); }
  // a bird: a body and two wings (parrots and toucans are tinted; a toucan gets an orange beak)
  { const b = new THREE.BoxGeometry(0.5, 0.18, 0.18); const w = new THREE.PlaneGeometry(0.3, 0.9); w.rotateX(-Math.PI / 2); w.translate(0, 0.05, 0);
    const beak = new THREE.ConeGeometry(0.07, 0.25, 4); beak.rotateZ(-Math.PI / 2); beak.translate(0.36, 0, 0);
    M.bird = merge([paint(b, flat("#FFFFFF")), paint(w, flat("#FFFFFF")), paint(beak, flat("#F08A1E"), () => 0)]); }
  // a drum: a short cylinder with a pale head
  { const d = new THREE.CylinderGeometry(0.32, 0.32, 0.5, 10); d.translate(0, 0.95, 0.25); const h = new THREE.CircleGeometry(0.31, 10); h.rotateX(-Math.PI / 2); h.translate(0, 1.21, 0.25);
    M.drum = merge([paint(d, flat("#FFFFFF")), paint(h, flat("#F2EEE4"), () => 0)]); }
  return M;
}

export { KIT2, ilgGeos, movers };
