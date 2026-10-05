import * as THREE from 'three';
import { clamp, lerp } from '../config/util.js';
import { G3 } from './g3.js';
import { CINE } from './cine.js';
import { CRASH } from './crash.js';

/* ---- recovering a stopped AI car, in the race view --------------------------------
   Draws what game/recovery.js says is happening: marshals running out with a yellow flag, the recovery truck
   (G3.recoveryTruck, the one from the retirement cutscene) driving up and parking beside the wreck, its crane lifting
   the car onto the bed on the same curve as the cutscene (CINE.dnfCar), the truck driving off with it, and the
   marshals sweeping up the debris (CRASH.items near the wreck, or loose pieces for a "debris" call).
   Three axes: world x = game x, world z = game y, y up; a model faces local +x and turns with rotation.y = -heading.
   Everything here runs off the job's own phase clock, so it follows pause and slow motion with the race.          */

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ease = k => k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k);
const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const TD = 6.2;                                    // the crane's work, as in the cutscene

function ground(T, x, z, node, fb){ let h = NaN; try{ h = T.surfZ(x, z, node); }catch(e){} return h === h ? h : fb; }

/* the truck's rotation and height on the ground at (x, z) facing h: four samples under its wheels, as in the cutscene */
function fit(T, x, z, h, node, fb){
  const at = (lx, lz) => V(x + Math.cos(h) * lx - Math.sin(h) * lz, 0, z + Math.sin(h) * lx + Math.cos(h) * lz);
  const hgt = (lx, lz) => { const v = at(lx, lz); return ground(T, v.x, v.z, node, fb); };
  const pf = at(5.1, 0), pr = at(-2.5, 0), pL = at(0, -1.35), pR = at(0, 1.35);
  pf.y = (hgt(5.1, -1.35) + hgt(5.1, 1.35)) / 2; pr.y = (hgt(-2.5, -1.35) + hgt(-2.5, 1.35)) / 2; pL.y = hgt(0, -1.35); pR.y = hgt(0, 1.35);
  const fwd = pf.clone().sub(pr).normalize(), rgt = pR.clone().sub(pL).normalize(), up = rgt.clone().cross(fwd).normalize();
  const rgt2 = fwd.clone().cross(up).normalize(), fwd2 = up.clone().cross(rgt2).normalize();
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(fwd2, up, rgt2));
  return { q, y:(pf.y + pr.y + pL.y + pR.y) / 4, fwd:fwd2 };
}

function dispose(o){ o.traverse(m => { if(m.geometry) m.geometry.dispose(); }); }

/* ---- marshals ---- */
function marshal(G, kind){
  const P = G.person({ suit:"#FF7A00", accent:"#F2F2F2", cap:"#FF7A00", helmetOn:false, skin:G.skinFor(kind * 5 + 2), hair:G.hairFor(kind * 3) });
  if(P.cap) P.cap.visible = true;
  if(kind === 0){
    // a yellow flag on a pole, in the left hand
    const f = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.3, 6), G.mat("#2A2D31"));
    pole.position.y = 0.45; f.add(pole);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.5), G.mat("#FFD21A", { side:THREE.DoubleSide, roughness:0.8 }));
    cloth.position.set(0.39, 0.85, 0); f.add(cloth);
    f.position.set(0, -0.06, 0); P.lHand.add(f); P.flag = cloth;
  } else {
    // a broom: a long handle, and a head that sits on the ground when he sweeps
    const b = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1.35, 6), G.mat("#8A6A44"));
    handle.position.y = -0.55; b.add(handle);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.46), G.mat("#2A2D31"));
    head.position.y = -1.22; b.add(head);
    b.rotation.z = 0.55; b.position.set(0, -0.05, 0); P.rHand.add(b);
  }
  return P;
}
const POSE = {
  stand:{ lean:0.02, ls:0.05, rs:-0.05, le:0.15, re:0.15 },
  sweep:t => { const w = Math.sin(t * 5.2); return { lean:0.32, nod:0.1, ls:0.75 + w * 0.22, rs:0.55 + w * 0.22, le:0.55, re:0.45, lh:0.12, rh:-0.06, lk:0.18, rk:0.12 }; },
  wave:t => { const w = Math.sin(t * 7); return { lean:-0.02, ls:2.55 + w * 0.3, lsa:0.25, le:0.25 + w * 0.15, rs:0.1, re:0.2 }; },
};

/* where a marshal stands: an offset from the wreck along the track (ds metres) and across it (off, absolute) */
function trackPoint(T, node, ds, off){
  const i = (((node + Math.round(ds / T.ds)) % T.n) + T.n) % T.n;
  return { x:T.x[i] + T.nx[i] * off, z:T.y[i] + T.ny[i] * off, i };
}

function placePerson(G, S, P, x, z, yaw, node, pose){
  const T = S.track;
  P.root.position.set(x, ground(T, x, z, node, 0), z);
  P.root.rotation.set(0, -yaw, 0);
  P.pose(pose);
}

function marshals(G, S, j, v, dt){
  const T = S.track;
  if(!v.ppl){
    v.ppl = [0, 1, 2].map(k => { const P = marshal(G, k); G.world.add(P.root); return P; });
    v.walk = [{}, {}, {}];
    const edge = j.side * (T.half + Math.min(3.5, T.roAt(j.node, j.off) * 0.6 + 1.2));
    v.home = [trackPoint(T, j.node, -32, j.side * (T.half + 1.2)), trackPoint(T, j.node, -4, edge), trackPoint(T, j.node, 5, edge)];
    for(let k = 0; k < 3; k++) v.walk[k] = { x:v.home[k].x, z:v.home[k].z, yaw:Math.atan2(j.y - v.home[k].z, j.x - v.home[k].x) };
  }
  const t = S.clock || 0;
  // the flag: upstream, facing the oncoming cars, waving the whole time
  const f = v.home[0], i0 = f.i, back = Math.atan2(-T.ty[i0], -T.tx[i0]);
  placePerson(G, S, v.ppl[0], f.x, f.z, back, i0, POSE.wave(t));
  if(v.ppl[0].flag) v.ppl[0].flag.rotation.y = Math.sin(t * 9) * 0.35;
  // the two with brooms
  if(j.phase === "sweep"){
    if(!v.jobs) v.jobs = sweepList(G, S, j, v);
    const dur = j.phases[j.pi][1];
    for(let k = 1; k <= 2; k++){
      const list = v.jobs[k - 1], P = v.ppl[k], w = v.walk[k];
      if(!list.length){ placePerson(G, S, P, w.x, w.z, w.yaw, j.node, POSE.sweep(t + k)); continue; }
      const slot = dur / list.length, n = Math.min(list.length - 1, Math.floor(j.pt / slot)), u = (j.pt - n * slot) / slot;
      const it = list[n], from = n ? list[n - 1] : { x:v.home[k].x, z:v.home[k].z };
      // the pieces before this one have been swept up
      for(let q = 0; q < n; q++) take(G, list[q]);
      if(u < 0.5){
        const kk = ease(u / 0.5), x = lerp(from.x, it.x - 0.6, kk), z = lerp(from.z, it.z, kk);
        const yaw = Math.atan2(it.z - from.z, it.x - 0.6 - from.x);
        w.x = x; w.z = z; w.yaw = yaw;
        placePerson(G, S, P, x, z, yaw, j.node, CINE.podiumWalk(t * 7.5 + k));
      } else placePerson(G, S, P, w.x, w.z, w.yaw, j.node, POSE.sweep(t + k));
    }
  } else {
    // out to the wreck and stand by it while the truck works
    for(let k = 1; k <= 2; k++){
      const P = v.ppl[k], h = v.home[k];
      const k2 = j.phase === "flags" ? ease(j.pt / 3) : 1;
      const tx = lerp(h.x, j.x + (h.x - j.x) * 0.55, k2), tz = lerp(h.z, j.y + (h.z - j.y) * 0.55, k2);
      const yaw = Math.atan2(j.y - tz, j.x - tx);
      v.walk[k] = { x:tx, z:tz, yaw };
      placePerson(G, S, P, tx, tz, yaw, j.node, j.phase === "flags" && k2 < 1 ? CINE.podiumWalk(t * 8 + k) : POSE.stand);
    }
  }
}

/* what there is to sweep: the crash's own debris near the wreck, or for a debris call, loose pieces of our own */
function sweepList(G, S, j, v){
  const items = [];
  if(CRASH.items && CRASH.group){
    for(const it of CRASH.items){
      const p = it.m.position;
      if(Math.hypot(p.x - j.x, p.z - j.y) < 34) items.push({ x:p.x, z:p.z, crash:it });
    }
  }
  for(const m of v.shards || []) items.push({ x:m.position.x, z:m.position.z, mesh:m });
  items.sort((a, b) => Math.hypot(a.x - j.x, a.z - j.y) - Math.hypot(b.x - j.x, b.z - j.y));
  const a = [], b = [];
  items.slice(0, 16).forEach((it, k) => (k % 2 ? b : a).push(it));
  return [a, b];
}
function take(G, it){
  if(it.taken) return; it.taken = true;
  if(it.crash){ const k = CRASH.items.indexOf(it.crash); if(k >= 0){ CRASH.group.remove(it.crash.m); CRASH.items.splice(k, 1); } }
  if(it.mesh){ G.world.remove(it.mesh); it.mesh.geometry.dispose(); }
}

/* a "debris" call has no crash behind it, so it brings its own pieces of carbon */
function shards(G, S, j, v){
  if(v.shards) return;
  const T = S.track; let r = j.seed || 1;
  const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
  v.shards = [];
  for(let k = 0; k < 9; k++){
    const a = rnd() * Math.PI * 2, d = 1 + rnd() * 6, x = j.x + Math.cos(a) * d, z = j.y + Math.sin(a) * d;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.25 + rnd() * 0.4, 0.03, 0.12 + rnd() * 0.25), G.mat(k % 3 ? "#16191D" : "#C8CCD1", { roughness:0.6 }));
    m.position.set(x, ground(T, x, z, j.node, 0) + 0.02, z); m.rotation.y = rnd() * 6.3;
    G.world.add(m); v.shards.push(m);
  }
}

/* ---- the truck and the car on it ---- */
function truckAndCar(G, S, j, v){
  const T = S.track, tp = j.truck, c = j.car;
  const e = G.cars.find(x => x.c === c), g = e && e.g;
  if(!tp){
    if(v.R && (j.phase === "sweep" || j.phase === "done")){ G.world.remove(v.R.root); G.world.remove(v.R.rig); dispose(v.R.root); dispose(v.R.rig); v.R = null; }
    return;
  }
  if(!v.R){
    v.R = G.recoveryTruck(); G.world.add(v.R.root); G.world.add(v.R.rig);
    const fb = c.z || 0;
    v.park = fit(T, j.plan.x, j.plan.y, j.plan.h, j.node, fb);
  }
  const R = v.R;
  // drive: on the ground wherever it is, turned to the slope it parks on
  if(tp.moving){
    const f = fit(T, tp.x, tp.y, tp.h, j.node, v.park.y);
    R.root.position.set(tp.x, f.y, tp.y); R.root.quaternion.copy(f.q);
  } else { R.root.position.set(tp.x, v.park.y, tp.y); R.root.quaternion.copy(v.park.q); }
  R.root.updateMatrixWorld(true);
  const tm = R.root.matrixWorld;
  R.blink(S.clock || 0);
  const stow = V(-2.3, 5.0, 0).applyMatrix4(tm);
  if(j.phase === "arrive" || !g){ R.slingOn = false; R.aim(stow); return; }
  if(j.phase === "lift"){
    if(!v.w){
      // the wreck's pose now, where the truck has parked, and where it will sit on the bed (cine.js dnfInit)
      g.updateMatrixWorld(true);
      const q0 = g.getWorldQuaternion(new THREE.Quaternion()), p0 = g.getWorldPosition(new THREE.Vector3());
      const nose = V(1, 0, 0).applyQuaternion(q0), yaw0 = Math.atan2(nose.z, nose.x);
      const trYaw = Math.atan2(v.park.fwd.z, v.park.fwd.x), flip = Math.cos(yaw0 - trYaw) < 0;
      const tmc = tm.clone();
      const pT = V(0, 1.17, 0).applyMatrix4(tmc);
      const qT = new THREE.Quaternion().setFromRotationMatrix(tmc.clone().multiply(new THREE.Matrix4().makeRotationY(flip ? Math.PI : 0)));
      const qL0 = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), -yaw0);
      v.w = { p0, q0, qL0, qT, pT, peak:Math.max(pT.y + 2.5, p0.y + 2.2), hStow:stow.clone() };
    }
    const t = j.pt, w = v.w, cp = CINE.dnfCar(w, Math.min(t, TD));
    g.position.copy(cp.pos); g.quaternion.copy(cp.q); g.updateMatrixWorld(true);
    const lugs = [[1.1, 0.5, -0.5], [1.1, 0.5, 0.5], [-1.0, 0.6, -0.45], [-1.0, 0.6, 0.45]].map(a => V(...a).applyMatrix4(g.matrixWorld));
    let hook;
    if(t < cp.t1 - 0.3){ const k = ease(seg(t, 0, cp.t0)); hook = w.hStow.clone().lerp(V(w.p0.x, w.p0.y + 1.95, w.p0.z), k); }
    else if(t < TD - 0.4) hook = V(cp.pos.x, cp.pos.y + 1.95, cp.pos.z);
    else { const k = ease(seg(t, TD - 0.4, TD + 1.0)); hook = V(cp.pos.x, cp.pos.y + 1.95, cp.pos.z).lerp(w.hStow, k); }
    R.slingOn = t < TD - 0.1;
    R.aim(hook, lugs);
    return;
  }
  if(j.phase === "away"){
    // the car rides on the bed: fixed in the truck's frame from the moment it drives off
    if(!v.bed){ g.updateMatrixWorld(true); v.bed = new THREE.Matrix4().copy(tm).invert().multiply(g.matrixWorld); }
    const m = new THREE.Matrix4().multiplyMatrices(tm, v.bed);
    m.decompose(g.position, g.quaternion, g.scale);
    R.slingOn = false; R.aim(stow);
  }
}

function remove(G, v){
  for(const P of v.ppl || []){ G.world.remove(P.root); dispose(P.root); }
  for(const m of v.shards || []){ if(m.parent) G.world.remove(m); m.geometry.dispose(); }
  if(v.jobs) for(const l of v.jobs) for(const it of l) take(G, it);
  if(v.R){ G.world.remove(v.R.root); G.world.remove(v.R.rig); dispose(v.R.root); dispose(v.R.rig); v.R = null; }
  v.ppl = null; v.shards = null;
}

G3.recoveryFrame = function(S){
  if(this.recWorld !== this.world){ this.recWorld = this.world; this.recVis = new Map(); }
  const RJ = S.recov; if(!RJ || !RJ.jobs.length) return;
  for(const j of RJ.jobs){
    let v = this.recVis.get(j.id);
    if(j.done){ if(v && !v.gone){ remove(this, v); v.gone = true; } continue; }
    if(!v){ v = { j }; this.recVis.set(j.id, v); }
    try{
      if(!j.car) shards(this, S, j, v);
      marshals(this, S, j, v);
      if(j.car) truckAndCar(this, S, j, v);
    }catch(e){ if(!v.warned){ v.warned = true; console.warn("recovery", e.message, e.stack); } }
  }
};

export { fit };
