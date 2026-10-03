import * as THREE from 'three';
import { clamp, lerp, shade } from '../config/util.js';
import { G3 } from './g3.js';

/* ---------- people ----------------------------------------------------------
   A driver for the cutscenes: about 1.78 m of faceted boxes in the team's
   overalls, jointed at the neck, shoulders, elbows, hips and knees so a pose
   is just a handful of angles. Faces +x, y up, z out of the right-hand side,
   the same frame as the cars, standing with its feet on y = 0. The helmet
   comes off: the head under it is bare, with hair. A pose is an object of
   angles in radians (forward positive); anything it leaves out is 0.        */
const SKINS = ["#E7B48E", "#C98F66", "#8A5A3C", "#F1C9A5", "#6B4429", "#D9A07A"];
const HAIRS = ["#1B1511", "#3A2A1C", "#6B4A2A", "#B88A4A", "#101010", "#4A3322"];

G3.person = function(o){
  const mk = (w, h, d, col, x, y, z, rough) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.mat(col, { roughness:rough == null ? 0.72 : rough, flatShading:true }));
    m.position.set(x || 0, y || 0, z || 0); m.castShadow = true; return m;
  };
  const grp = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x || 0, y || 0, z || 0); if(parent) parent.add(g); return g; };
  const suit = o.suit || "#2A3A5C", acc = o.accent || "#F2F2F2", skin = o.skin || SKINS[0], hair = o.hair || HAIRS[0];
  const P = { root:new THREE.Group() };
  P.hips = grp(P.root, 0, 0.93, 0);
  P.hips.add(mk(0.22, 0.20, 0.34, suit, 0, 0, 0));
  P.torso = grp(P.hips, 0, 0.10, 0);
  P.torso.add(mk(0.24, 0.56, 0.40, suit, 0, 0.28, 0));
  P.torso.add(mk(0.245, 0.12, 0.405, acc, 0, 0.40, 0));
  P.torso.add(mk(0.10, 0.20, 0.10, shade(suit, -0.2), 0, 0.64, 0));                 // neck
  P.head = grp(P.torso, 0, 0.62, 0);
  // bare head, and the helmet that goes over it
  P.bare = grp(P.head, 0, 0.14, 0);
  P.bare.add(mk(0.19, 0.22, 0.17, skin, 0, 0, 0, 0.9));
  P.bare.add(mk(0.20, 0.08, 0.18, hair, -0.005, 0.10, 0, 0.95));
  P.bare.add(mk(0.06, 0.20, 0.18, hair, -0.07, -0.01, 0, 0.95));
  P.helm = grp(P.head, 0, 0.14, 0);
  const hm = new THREE.Mesh(new THREE.SphereGeometry(0.15, 9, 7), this.mat(o.helmet || "#F2C230", { roughness:0.35, metalness:0.15, flatShading:true }));
  hm.scale.set(1.12, 1.02, 0.96); hm.castShadow = true; P.helm.add(hm);
  P.helm.add(mk(0.10, 0.07, 0.24, "#0B0D10", 0.09, 0.02, 0, 0.2));
  if(o.cap){ P.cap = grp(P.bare, 0, 0, 0); P.cap.visible = false;
             P.cap.add(mk(0.21, 0.05, 0.19, o.cap, 0, 0.13, 0)); P.cap.add(mk(0.10, 0.02, 0.17, o.cap, 0.14, 0.11, 0)); }
  // arms: shoulder, elbow and the glove at the end, each hanging straight down
  for(const sd of [-1, 1]){
    const n = sd < 0 ? "l" : "r";
    const sh = P[n + "Sh"] = grp(P.torso, 0, 0.52, sd * 0.255);
    sh.add(mk(0.11, 0.30, 0.11, suit, 0, -0.15, 0));
    sh.add(mk(0.115, 0.05, 0.115, acc, 0, -0.04, 0));
    const el = P[n + "El"] = grp(sh, 0, -0.30, 0);
    el.add(mk(0.10, 0.28, 0.10, suit, 0, -0.14, 0));
    const hand = P[n + "Hand"] = grp(el, 0, -0.28, 0);
    hand.add(mk(0.09, 0.10, 0.09, "#14171B", 0, -0.04, 0));
    const hi = P[n + "Hi"] = grp(P.hips, 0, 0, sd * 0.10);
    hi.add(mk(0.14, 0.46, 0.14, suit, 0, -0.23, 0));
    const kn = P[n + "Kn"] = grp(hi, 0, -0.46, 0);
    kn.add(mk(0.12, 0.44, 0.12, suit, 0, -0.22, 0));
    const ft = grp(kn, 0, -0.44, 0);
    ft.add(mk(0.26, 0.08, 0.12, "#14171B", 0.06, -0.04, 0));
  }
  P.helm.visible = o.helmetOn !== false; P.bare.visible = !P.helm.visible;
  P.setHelmet = on => { P.helm.visible = on; P.bare.visible = !on; };
  P.pose = p => {
    p = p || {};
    P.hips.rotation.set(p.hx || 0, p.hy || 0, p.hz || 0);
    P.torso.rotation.set(p.tx || 0, p.ty || 0, -(p.lean || 0));
    P.head.rotation.set(0, p.hdy || 0, -(p.nod || 0));
    P.lSh.rotation.set(p.lsa || 0, 0, p.ls || 0); P.rSh.rotation.set(-(p.rsa || 0), 0, p.rs || 0);
    P.lEl.rotation.set(0, 0, p.le || 0); P.rEl.rotation.set(0, 0, p.re || 0);
    P.lHi.rotation.set(0, 0, p.lh || 0); P.rHi.rotation.set(0, 0, p.rh || 0);
    P.lKn.rotation.set(0, 0, -(p.lk || 0)); P.rKn.rotation.set(0, 0, -(p.rk || 0));
  };
  P.pose({});
  return P;
};

/* the same pose, part-way to another */
G3.lerpPose = function(a, b, k){
  const out = {};
  for(const key in a) out[key] = a[key] + ((b[key] || 0) - a[key]) * k;
  for(const key in b) if(!(key in a)) out[key] = (b[key] || 0) * k;
  return out;
};

G3.skinFor = n => SKINS[(n | 0) % SKINS.length];
G3.hairFor = n => HAIRS[((n | 0) * 3 + 1) % HAIRS.length];

export { HAIRS, SKINS };
