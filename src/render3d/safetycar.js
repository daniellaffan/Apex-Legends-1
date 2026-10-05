import * as THREE from 'three';
import { G3 } from './g3.js';

/* ---- the safety car ---------------------------------------------------
   A fast GT coupe in green and white with an amber light bar. The model's nose is local +x, up is +y and the
   sides are z, the same as the race cars, so the frame places it the same way. Built once per session and
   added to the world; S.sc.car (a plain rail follower, see game/safetycar.js) says where it is. */
function buildSafetyCar(){
  const g = new THREE.Group(); g.name = "safetycar";
  const M = (c, o) => G3.mat(c, o);
  const box = (w, h, d, x, y, z, mat, rz) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); if(rz) m.rotation.z = rz; m.castShadow = true; g.add(m); return m;
  };
  const paint = M("#0E8A5C", { roughness:0.32, metalness:0.35 }), white = M("#F2F4F5", { roughness:0.4, metalness:0.2 });
  const glass = M("#0B1015", { roughness:0.12, metalness:0.6 }), dark = M("#14181D", { roughness:0.7 });
  // body: a long low tub, a sloped bonnet, a glasshouse set back, a roof, a rear deck and wing
  box(4.7, 0.5, 1.96, 0, 0.62, 0, paint);
  box(1.7, 0.16, 1.86, 1.55, 0.97, 0, paint, -0.1);
  box(1.95, 0.46, 1.64, -0.28, 1.13, 0, glass);
  box(1.55, 0.05, 1.5, -0.28, 1.38, 0, white);
  box(1.3, 0.02, 0.34, 1.5, 1.06, 0, white, -0.1);                      // the stripe over the bonnet
  box(0.5, 0.06, 1.9, -2.32, 1.12, 0, paint);
  box(0.12, 0.2, 0.1, -2.3, 0.98, 0.7, dark); box(0.12, 0.2, 0.1, -2.3, 0.98, -0.7, dark);
  box(0.7, 0.07, 1.96, 2.3, 0.33, 0, dark);                             // splitter
  box(3.0, 0.05, 0.02, -0.1, 0.72, 0.99, white); box(3.0, 0.05, 0.02, -0.1, 0.72, -0.99, white);   // side stripes
  // wheels
  const tyre = M("#101214", { roughness:0.9 }), rim = M("#9AA3AB", { roughness:0.4, metalness:0.7 });
  g.userData.wheels = [];
  for(const [x, z] of [[1.5, 0.9], [1.5, -0.9], [-1.5, 0.9], [-1.5, -0.9]]){
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.3, 18), tyre);
    w.rotation.x = Math.PI / 2; w.position.set(x, 0.37, z); w.castShadow = true; g.add(w);
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.32, 12), rim);
    r.rotation.x = Math.PI / 2; r.position.set(x, 0.37, z); g.add(r);
    g.userData.wheels.push(w, r);
  }
  // lights: amber bar on the roof (two halves that alternate), white fronts, red rears
  box(0.3, 0.08, 1.2, -0.3, 1.45, 0, dark);
  const am = () => new THREE.MeshStandardMaterial({ color:0x553300, emissive:0xFFA800, emissiveIntensity:0.1 });
  const a1 = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.11, 0.52), am()), a2 = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.11, 0.52), am());
  a1.position.set(-0.3, 1.52, 0.3); a2.position.set(-0.3, 1.52, -0.3); g.add(a1, a2);
  g.userData.bar = [a1, a2];
  const hl = new THREE.MeshStandardMaterial({ color:0xFFFFFF, emissive:0xFFF6D8, emissiveIntensity:1.4 });
  const tl = new THREE.MeshStandardMaterial({ color:0x330000, emissive:0xFF1A1A, emissiveIntensity:1.1 });
  box(0.06, 0.1, 0.5, 2.36, 0.72, 0.62, hl); box(0.06, 0.1, 0.5, 2.36, 0.72, -0.62, hl);
  box(0.06, 0.1, 0.7, -2.36, 0.82, 0.55, tl); box(0.06, 0.1, 0.7, -2.36, 0.82, -0.55, tl);
  return g;
}

G3.safetyCar = function(S){
  const k = S.sc && S.sc.car;
  if(this.scUid !== S.uid){ this.scMesh = null; this.scUid = S.uid; }
  if(!k){ if(this.scMesh) this.scMesh.visible = false; return; }
  if(!this.scMesh){ this.scMesh = buildSafetyCar(); this.world.add(this.scMesh); }
  const g = this.scMesh, T = S.track; g.visible = true;
  const ni = k.node || 0, hx = Math.cos(k.h), hy = Math.sin(k.h), HB = 1.5;
  const zr = T.surfZ(k.x - hx * HB, k.y - hy * HB, ni), zf = T.surfZ(k.x + hx * HB, k.y + hy * HB, ni);
  const pitch = Math.atan2(zf - zr, 2 * HB);
  g.position.set(k.x, (zr + zf) / 2 + 0.03, k.y);
  g.rotation.set(-(T.camber[ni] || 0) * Math.cos(k.h - T.ang[ni]), -k.h, pitch, "YXZ");
  const on = k.lights, ph = (S.clock * 4.2) % 1 < 0.5;
  g.userData.bar[0].material.emissiveIntensity = on && ph ? 3.2 : 0.08;
  g.userData.bar[1].material.emissiveIntensity = on && !ph ? 3.2 : 0.08;
};
export { buildSafetyCar };
