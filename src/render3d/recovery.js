import * as THREE from 'three';
import { clamp, shade } from '../config/util.js';
import { G3 } from './g3.js';

/* ---------- the recovery truck ----------------------------------------------
   A flatbed with a crane on the back, for the retirement cutscene: the crane lifts
   the wrecked car onto the bed, and the driver gets out up there, on a level floor.
   Truck frame, like the cars': nose +x, y up, z out of the right-hand side, ground at
   y = 0. The bed top is TRUCK.BED_Y, the car sits on it with its own origin at the
   middle of the bed, and the crane's pivot is at the back.                        */
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TRUCK = {
  BED_Y:1.15, BED_X:3.5, BED_Z:1.7,                  // the bed: x from -3.5 to 3.5, z +-1.7
  PIVOT:[-3.75, 2.35, 0], CABLE:2.6,
  FOOT:{ x0:-4.9, x1:6.1, hz:1.9 },                  // what the truck covers on the ground, truck-local
};

/* Where to park. Candidates on rings round the wreck, facing along the track either way. A spot is valid when
   everything the truck covers is inside the barrier (room() > 0.3), it does not overlap the car (with a margin),
   and the crane can reach the car. Nearest and roomiest wins. Pure numbers: Node-testable.
   car: { x, z, yaw } (world, three axes: x, z; yaw = heading of its nose), room(x, z) -> metres to the barrier. */
function planTruck(car, tangentYaw, room){
  const ca = Math.cos(car.yaw), sa = Math.sin(car.yaw);
  const carHit = (tx, tz, th) => {
    // SAT between the truck's rectangle and the car's (axis-aligned in their own frames)
    const cx = Math.cos(th), sx = Math.sin(th);
    const T = [[1, 0], [0, 1]].map(([a, b]) => [cx * a - sx * b, sx * a + cx * b]), C = [[ca, sa], [-sa, ca]];
    const tc = [tx + cx * (TRUCK.FOOT.x0 + TRUCK.FOOT.x1) / 2, tz + sx * (TRUCK.FOOT.x0 + TRUCK.FOOT.x1) / 2];
    const th2 = [(TRUCK.FOOT.x1 - TRUCK.FOOT.x0) / 2 + 0.7, TRUCK.FOOT.hz + 0.7], ch = [(car.half ? car.half[0] : 2.9) + 0.6, (car.half ? car.half[1] : 1.3) + 0.6];
    const d = [(car.cx != null ? car.cx : car.x) - tc[0], (car.cz != null ? car.cz : car.z) - tc[1]];
    for(const ax of [...T, ...C]){
      const rT = Math.abs(T[0][0] * ax[0] + T[0][1] * ax[1]) * th2[0] + Math.abs(T[1][0] * ax[0] + T[1][1] * ax[1]) * th2[1];
      const rC = Math.abs(C[0][0] * ax[0] + C[0][1] * ax[1]) * ch[0] + Math.abs(C[1][0] * ax[0] + C[1][1] * ax[1]) * ch[1];
      if(Math.abs(d[0] * ax[0] + d[1] * ax[1]) > rT + rC) return false;
    }
    return true;
  };
  const minRoom = (tx, tz, th) => {
    const cx = Math.cos(th), sx = Math.sin(th); let m = 1e9;
    for(const lx of [TRUCK.FOOT.x0, -2.4, 0, 2.4, 4.4, TRUCK.FOOT.x1]) for(const lz of [-TRUCK.FOOT.hz, 0, TRUCK.FOOT.hz]){
      m = Math.min(m, room(tx + cx * lx - sx * lz, tz + sx * lx + cx * lz));
    }
    return m;
  };
  let best = null;
  for(const need of [0.4, -1.5, -99]){
    for(const r of [6.5, 8, 9.5, 11, 12.5]) for(let k = 0; k < 18; k++) for(const th of [tangentYaw, tangentYaw + Math.PI]){
      const a = k / 18 * Math.PI * 2, tx = car.x + Math.cos(a) * r, tz = car.z + Math.sin(a) * r;
      const mr = minRoom(tx, tz, th);
      if(mr < need) continue;
      if(carHit(tx, tz, th)) continue;
      // the crane pivot (at the back, truck-local) to the car
      const px = tx + Math.cos(th) * TRUCK.PIVOT[0], pz = tz + Math.sin(th) * TRUCK.PIVOT[0];
      const reach = Math.hypot(car.x - px, car.z - pz);
      if(reach > 10.5) continue;
      const score = r + reach * 0.35 - Math.min(mr, 5) * 0.5;
      if(!best || score < best.score) best = { x:tx, z:tz, h:th, score, room:mr, reach };
    }
    if(best) return best;
  }
  return { x:car.x + 8, z:car.z, h:tangentYaw, score:1e9, room:-99, reach:8 };
}

G3.recoveryTruck = function(){
  const M = (col, rough, extra) => this.mat(col, Object.assign({ roughness:rough == null ? 0.65 : rough, flatShading:true }, extra || {}));
  const box = (parent, w, h, d, col, x, y, z, rough, extra) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(col, rough, extra)); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  };
  const cyl = (parent, rt, rb, h, col, x, y, z, seg, rx) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 12), M(col, 0.7)); m.position.set(x, y, z); if(rx) m.rotation.x = rx; m.castShadow = true; parent.add(m); return m;
  };
  const YEL = "#F0B30A", ORG = "#E8731E", DK = "#2A2E36", GR = "#8A9098";
  const R = { root:new THREE.Group(), beacons:[] };
  const g = R.root;
  // chassis, the deck and its edge, tie-down lugs
  box(g, 11.0, 0.28, 1.5, DK, 0.5, 0.78, 0);
  box(g, 7.0, 0.20, 3.4, "#383D46", 0, 1.05, 0);
  box(g, 7.0, 0.05, 3.4, "#4A505A", 0, 1.145, 0);
  for(const sd of [-1, 1]){ box(g, 7.0, 0.14, 0.12, YEL, 0, 1.2, sd * 1.64, 0.5); for(let k = -3; k <= 3; k++) box(g, 0.12, 0.10, 0.12, GR, k * 1.1, 1.17, sd * 1.5); }
  box(g, 0.2, 0.6, 3.4, YEL, 3.5, 1.4, 0);                                         // the headboard behind the cab
  // wheels: a front axle under the cab and a tandem at the back
  for(const [x, r] of [[5.1, 0.56], [-1.9, 0.56], [-3.1, 0.56]]) for(const sd of [-1, 1]){
    cyl(g, r, r, 0.42, "#16181C", x, r, sd * 1.35, 14, Math.PI / 2);
    cyl(g, r * 0.5, r * 0.5, 0.44, "#B8BCC2", x, r, sd * 1.35, 10, Math.PI / 2);
    box(g, r * 2.3, 0.07, 0.55, DK, x, r * 2 + 0.08, sd * 1.35);                    // mudguard
  }
  // the cab: lower body, glass, roof, grille, bumper, lamps, a light bar
  box(g, 2.3, 1.15, 2.7, ORG, 5.0, 1.55, 0);
  box(g, 1.6, 1.1, 2.55, ORG, 4.55, 2.65, 0);
  box(g, 0.05, 0.8, 2.3, "#7FB4CE", 5.36, 2.65, 0, 0.1, { metalness:0.3 });          // windscreen
  for(const sd of [-1, 1]) box(g, 1.2, 0.7, 0.05, "#7FB4CE", 4.55, 2.7, sd * 1.28, 0.1);
  box(g, 0.14, 0.7, 2.2, "#1A1C20", 6.12, 1.3, 0);                                  // grille
  box(g, 0.3, 0.3, 2.9, DK, 6.18, 0.82, 0);
  for(const sd of [-1, 1]) box(g, 0.06, 0.2, 0.4, "#FFF3C8", 6.16, 1.7, sd * 1.0, 0.2, { emissive:"#FFE9A0", emissiveIntensity:0.7 });
  box(g, 0.8, 0.12, 2.0, DK, 4.4, 3.25, 0);
  for(const sd of [-1, 1]){ const b = box(g, 0.4, 0.28, 0.5, "#FFB020", 4.4, 3.45, sd * 0.7, 0.3, { emissive:"#FF9A00", emissiveIntensity:1.0 }); R.beacons.push(b); }
  // the crane: outriggers down to the ground, a turntable, a slewing arm, and a telescopic boom that points at the hook
  const [px, py] = TRUCK.PIVOT;
  for(const sd of [-1, 1]){ box(g, 0.28, 0.28, 2.0, YEL, px + 0.6, 0.95, sd * 1.9); box(g, 0.6, 0.12, 0.6, DK, px + 0.6, 0.06, sd * 2.7); box(g, 0.18, 0.9, 0.18, GR, px + 0.6, 0.5, sd * 2.7); }
  cyl(g, 0.75, 0.85, 0.55, DK, px, 1.45, 0, 14);
  R.slew = new THREE.Group(); R.slew.position.set(px, 1.75, 0); g.add(R.slew);
  box(R.slew, 1.3, 0.9, 1.3, YEL, 0, 0.45, 0);                                       // the crane's body
  box(R.slew, 0.7, 0.5, 0.05, "#7FB4CE", 0.5, 0.7, 0.66, 0.1);
  R.lift = new THREE.Group(); R.lift.position.set(0, py - 1.75, 0); R.slew.add(R.lift);
  box(R.slew, 0.5, py - 1.75, 0.5, GR, 0, (py - 1.75) / 2 + 0.3, 0.0);
  cyl(R.lift, 0.22, 0.22, 1.0, DK, 0, 0, 0, 10, Math.PI / 2);
  // the boom: two sections whose lengths are set each frame
  R.b1 = box(R.lift, 1, 0.5, 0.55, YEL, 0.5, 0, 0); R.b2 = box(R.lift, 1, 0.34, 0.38, "#D8DADD", 0.5, 0, 0);
  R.tip = box(R.lift, 0.3, 0.45, 0.5, DK, 0, 0, 0);
  // the cable, the hook block, and four slings: placed in the world each frame
  R.rig = new THREE.Group();
  R.cable = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 5), M("#1A1C20")); R.rig.add(R.cable);
  R.block = new THREE.Group(); R.block.add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.46, 0.34), M(YEL))); { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.04, 6, 10, Math.PI * 1.5), M(DK)); ring.position.set(0, -0.34, 0); R.block.add(ring); } R.rig.add(R.block);
  R.slings = [0, 1, 2, 3].map(() => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 4), M("#E8E8E0")); R.rig.add(m); return m; });
  R.slingOn = true;
  const up = V(0, 1, 0), tmp = V(0, 0, 0), dir = V(0, 0, 0);
  const line = (m, a, b) => { dir.copy(b).sub(a); const len = dir.length() || 1e-3; m.position.copy(a).add(b).multiplyScalar(0.5); m.scale.set(1, len, 1); m.quaternion.setFromUnitVectors(up, dir.multiplyScalar(1 / len)); };

  /* point the boom at a hook position (world): slew round, tilt up and run the boom out to it, with the cable
     hanging TRUCK.CABLE straight down from the tip to the hook block; slings go to the car's four lug points (world) */
  R.aim = (H, lugs) => {
    g.updateMatrixWorld(true);
    const Hl = g.worldToLocal(H.clone());
    const tipL = Hl.clone(); tipL.y += TRUCK.CABLE;
    const dx = tipL.x - px, dz = tipL.z - 0, dh = Math.max(Math.hypot(dx, dz), 0.8), dy = tipL.y - py;
    R.slew.rotation.y = Math.atan2(-dz, dx);
    const beta = Math.atan2(dy, dh), L = Math.max(Math.hypot(dh, dy), 3.2);
    R.lift.rotation.z = beta;
    const l1 = Math.min(L, 4.6);
    R.b1.scale.x = l1; R.b1.position.x = l1 / 2;
    R.b2.scale.x = Math.max(L - l1 * 0.55, 0.5); R.b2.position.x = l1 * 0.55 + R.b2.scale.x / 2;
    R.tip.position.x = L;
    // the cable and the hook block
    const top = g.localToWorld(tipL.clone()), hook = H.clone();
    R.rig.updateMatrixWorld(true);
    line(R.cable, top, hook);
    R.block.position.copy(hook).add(V(0, 0.1, 0));
    if(lugs){
      lugs.forEach((p, i) => { R.slings[i].visible = R.slingOn; line(R.slings[i], hook.clone().add(V(0, -0.15, 0)), p); });
    } else for(const s of R.slings) s.visible = false;
    return L;
  };
  R.blink = t => { const on = (Math.floor(t * 3.2) & 1) === 0; for(const b of R.beacons) b.material.emissiveIntensity = on ? 1.4 : 0.05; };
  return R;
};

export { TRUCK, planTruck };
