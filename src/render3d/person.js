import * as THREE from 'three';
import { clamp, lerp, shade } from '../config/util.js';
import { G3 } from './g3.js';

/* ---------- people ----------------------------------------------------------
   A driver for the cutscenes: about 1.78 m in the team's overalls, jointed at the
   neck, shoulders, elbows, hips and knees so a pose is just a handful of angles.
   Faces +x, y up, z out of the right-hand side, the same frame as the cars,
   standing with its feet on y = 0. The limbs are rounded and taper, the torso
   narrows at the waist and widens to the shoulders, there are shoulder pads,
   cuffs, gloves with a thumb and boots with a sole. The helmet has a dark visor
   band, a chin bar, a stripe and a rear fin; it comes off, and the head under it
   is bare, with hair, ears, a nose and eyes. The joints sit exactly where they
   always did, so every pose still works. A pose is an object of angles in radians
   (forward positive); anything it leaves out is 0.                              */
const SKINS = ["#E7B48E", "#C98F66", "#8A5A3C", "#F1C9A5", "#6B4429", "#D9A07A"];
const HAIRS = ["#1B1511", "#3A2A1C", "#6B4A2A", "#B88A4A", "#101010", "#4A3322"];

G3.person = function(o){
  const M = (col, rough, extra) => this.mat(col, Object.assign({ roughness:rough == null ? 0.72 : rough, flatShading:true }, extra || {}));
  const mk = (w, h, d, col, x, y, z, rough) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(col, rough));
    m.position.set(x || 0, y || 0, z || 0); m.castShadow = true; return m;
  };
  // rounded parts: a tapered cylinder (top radius rt, bottom rb, height h), optionally squashed into an ellipse (sx, sz)
  const cyl = (rt, rb, h, col, x, y, z, sx, sz, seg, rough) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 8), M(col, rough));
    m.position.set(x || 0, y || 0, z || 0); m.scale.set(sx || 1, 1, sz || 1); m.castShadow = true; return m;
  };
  const ball = (r, col, x, y, z, sx, sy, sz, rough, det) => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, det || 1), M(col, rough));
    m.position.set(x || 0, y || 0, z || 0); m.scale.set(sx || 1, sy || 1, sz || 1); m.castShadow = true; return m;
  };
  const grp = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x || 0, y || 0, z || 0); if(parent) parent.add(g); return g; };
  const suit = o.suit || "#2A3A5C", acc = o.accent || "#F2F2F2", skin = o.skin || SKINS[0], hair = o.hair || HAIRS[0];
  const dark = "#14171B", suitD = shade(suit, -0.22), helmC = o.helmet || "#F2C230";
  const P = { root:new THREE.Group() };
  // pelvis, belt, a waist that narrows into a chest that widens into shoulders
  P.hips = grp(P.root, 0, 0.93, 0);
  P.hips.add(cyl(1, 0.9, 0.22, suit, 0, 0, 0, 0.115, 0.175, 8));
  P.torso = grp(P.hips, 0, 0.10, 0);
  P.torso.add(cyl(1, 0.76, 0.58, suit, 0, 0.28, 0, 0.125, 0.205, 8));
  P.torso.add(cyl(1.02, 1.02, 0.07, dark, 0, 0.02, 0, 0.099, 0.158, 8));                   // belt
  P.torso.add(cyl(1.03, 1.03, 0.10, acc, 0, 0.42, 0, 0.123, 0.205, 8));                    // chest band
  P.torso.add(mk(0.012, 0.36, 0.05, suitD, 0.121, 0.30, 0));                               // the zip down the front
  P.torso.add(mk(0.10, 0.04, 0.34, suitD, 0, 0.575, 0));                                   // the collar
  P.torso.add(cyl(0.052, 0.058, 0.14, shade(suit, -0.12), 0, 0.64, 0, 1, 1, 7));           // neck
  P.head = grp(P.torso, 0, 0.62, 0);
  // the bare head: skin, hair, ears, a nose, eyes and brows
  P.bare = grp(P.head, 0, 0.14, 0);
  P.bare.add(ball(0.098, skin, 0, 0, 0, 0.95, 1.12, 0.9, 0.9));
  { const cap = new THREE.Mesh(new THREE.SphereGeometry(0.104, 9, 5, 0, Math.PI * 2, 0, Math.PI * 0.56), M(hair, 0.95));
    cap.scale.set(0.97, 1.12, 0.92); cap.position.set(-0.008, 0.012, 0); cap.castShadow = true; P.bare.add(cap); }
  P.bare.add(mk(0.07, 0.10, 0.17, hair, -0.07, -0.01, 0, 0.95));
  P.bare.add(mk(0.035, 0.06, 0.012, skin, 0, -0.005, 0.1, 0.9)); P.bare.add(mk(0.035, 0.06, 0.012, skin, 0, -0.005, -0.1, 0.9));
  P.bare.add(mk(0.03, 0.04, 0.026, shade(skin, -0.06), 0.097, -0.02, 0, 0.9));
  P.bare.add(mk(0.012, 0.018, 0.026, "#1B1511", 0.092, 0.022, 0.04, 0.5)); P.bare.add(mk(0.012, 0.018, 0.026, "#1B1511", 0.092, 0.022, -0.04, 0.5));
  P.bare.add(mk(0.01, 0.01, 0.05, shade(hair, 0.05), 0.093, 0.045, 0.04, 0.9)); P.bare.add(mk(0.01, 0.01, 0.05, shade(hair, 0.05), 0.093, 0.045, -0.04, 0.9));
  // the helmet: a shell, a dark visor band, a chin bar, a stripe in the team's colour and a small rear fin
  P.helm = grp(P.head, 0, 0.14, 0);
  const hm = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8), M(helmC, 0.3, { metalness:0.2 }));
  hm.scale.set(1.12, 1.02, 0.96); hm.castShadow = true; P.helm.add(hm);
  { const vz = new THREE.Mesh(new THREE.SphereGeometry(0.153, 12, 5, Math.PI - 1.0, 2.0, 1.12, 0.62), M("#0B0D10", 0.1, { metalness:0.45 }));
    vz.scale.set(1.125, 1.03, 0.965); P.helm.add(vz); }
  P.helm.add(mk(0.08, 0.06, 0.20, helmC, 0.115, -0.085, 0, 0.3));
  P.helm.add(mk(0.30, 0.014, 0.05, acc, -0.005, 0.152, 0, 0.4));
  P.helm.add(mk(0.07, 0.05, 0.03, shade(helmC, -0.25), -0.17, 0.0, 0, 0.4));
  if(o.cap){ P.cap = grp(P.bare, 0, 0, 0); P.cap.visible = false;
             P.cap.add(mk(0.21, 0.05, 0.19, o.cap, 0, 0.13, 0)); P.cap.add(mk(0.10, 0.02, 0.17, o.cap, 0.14, 0.11, 0)); }
  // arms and legs: rounded and tapering; shoulder pads, cuffs, gloves with a thumb, boots with a sole
  for(const sd of [-1, 1]){
    const n = sd < 0 ? "l" : "r";
    const sh = P[n + "Sh"] = grp(P.torso, 0, 0.52, sd * 0.255);
    sh.add(ball(0.072, acc, 0, 0.0, 0, 1, 0.85, 1, 0.7, 0));                                 // the shoulder pad
    sh.add(cyl(0.056, 0.047, 0.31, suit, 0, -0.155, 0, 1, 1, 7));
    sh.add(cyl(0.058, 0.058, 0.04, acc, 0, -0.07, 0, 1, 1, 7));
    const el = P[n + "El"] = grp(sh, 0, -0.30, 0);
    el.add(ball(0.05, suit, 0, 0, 0, 1, 1, 1, 0.72, 0));
    el.add(cyl(0.047, 0.04, 0.28, suit, 0, -0.14, 0, 1, 1, 7));
    el.add(cyl(0.043, 0.043, 0.035, acc, 0, -0.255, 0, 1, 1, 7));                            // the cuff
    const hand = P[n + "Hand"] = grp(el, 0, -0.28, 0);
    hand.add(ball(0.055, dark, 0, -0.045, 0, 0.9, 1.05, 1.0, 0.6, 0));
    hand.add(mk(0.03, 0.05, 0.03, dark, 0.035, -0.035, sd * -0.03, 0.6));
    const hi = P[n + "Hi"] = grp(P.hips, 0, 0, sd * 0.10);
    hi.add(cyl(0.078, 0.062, 0.47, suit, 0, -0.235, 0, 1, 1, 7));
    hi.add(cyl(0.08, 0.08, 0.035, acc, 0, -0.30, 0, 1, 1, 7));                               // a stripe round the thigh
    const kn = P[n + "Kn"] = grp(hi, 0, -0.46, 0);
    kn.add(ball(0.063, suit, 0, 0, 0, 1, 1, 1, 0.72, 0));
    kn.add(cyl(0.062, 0.048, 0.45, suit, 0, -0.225, 0, 1, 1, 7));
    const ft = P[n + "Ft"] = grp(kn, 0, -0.44, 0);
    ft.add(mk(0.26, 0.075, 0.115, dark, 0.06, -0.045, 0, 0.6));                              // the boot
    ft.add(mk(0.10, 0.06, 0.105, dark, -0.04, 0.0, 0, 0.6));                                 // the ankle
    ft.add(mk(0.27, 0.018, 0.12, "#E8E8EA", 0.06, -0.085, 0, 0.8));                          // the sole
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
    // a planted foot stays flat on the floor whatever the shin does (flat: 0 leaves it hanging from the shin, 1 levels it)
    const fl = p.flat || 0;
    P.lFt.rotation.set(0, 0, -fl * ((p.hz || 0) + (p.lh || 0) - (p.lk || 0))); P.rFt.rotation.set(0, 0, -fl * ((p.hz || 0) + (p.rh || 0) - (p.rk || 0)));
  };
  /* Two-bone IK in the person's own forward/up plane: the angles that put a hand (kind "arm") or an ankle ("leg") of
     side n ("l" or "r") on a world point. The joint is wherever the pose already put the shoulder or hip, so apply the
     body's pose and update the root's matrices first. Returns s (the shoulder or hip angle, relative to what it hangs
     from, as the pose's ls/lh) and e (the elbow or knee bend, as le/lk). The elbow bends forward-up, the knee forward. */
  P.ikAngles = (n, kind, world, pose) => {
    const arm = kind === "arm", jt = arm ? P[n + "Sh"] : P[n + "Hi"];
    const j = P.root.worldToLocal(jt.getWorldPosition(new THREE.Vector3())), t = P.root.worldToLocal(world.clone());
    const l1 = arm ? 0.30 : 0.46, l2 = arm ? 0.325 : 0.44;
    const phi = arm ? ((pose.hz || 0) - (pose.lean || 0)) : (pose.hz || 0);
    const dx = t.x - j.x, dy = t.y - j.y;
    const d = clamp(Math.hypot(dx, dy), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
    const thd = Math.atan2(dx, -dy);
    const a1 = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
    const flex = Math.PI - Math.acos(clamp((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2), -1, 1));
    return { s:(arm ? thd - a1 : thd + a1) - phi, e:flex };
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
