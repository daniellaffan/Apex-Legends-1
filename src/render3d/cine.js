import * as THREE from 'three';
import { $, TAU, clamp, lerp } from '../config/util.js';
import { G3 } from './g3.js';
import './person.js';
import { TRUCK, planTruck } from './recovery.js';
import { spawn } from '../render2d/particles.js';

/* ---------- cinematics --------------------------------------------------------
   Three of them, all driven by S.cine = { kind, t, ... } with t in real seconds:

   crash   the slow-motion shot of your own wreck: a low trackside camera that
           follows the car through the air, then a crane that circles it at rest.
           The race goes on underneath, in slow motion (the session scales time).
   dnf     the driver climbs out of the wrecked car, takes his helmet off, throws
           it, holds his head, and walks away. In the real world, at the real car.
   win     the podium: a stage of its own, the top three walking on, the trophy,
           the champagne, confetti and fireworks.

   Nothing here touches the race: when one ends it calls the function it was
   started with, and the session shows the results.                            */

/* ---- sound: a few synthesised effects, so there is nothing to load ---- */
const SFX = {
  ctx:null,
  get(){
    try{
      if(!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if(this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
      return this.ctx;
    }catch(e){ return null; }
  },
  noise(dur, f0, f1, gain, type, attack){
    const c = this.get(); if(!c) return;
    const n = Math.max(1, (c.sampleRate * dur) | 0), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for(let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = type || "lowpass"; f.frequency.setValueAtTime(f0, c.currentTime); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), c.currentTime + dur);
    const g = c.createGain(), t0 = c.currentTime, at = attack == null ? 0.01 : attack;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + at); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(c.destination); src.start(t0);
  },
  tone(f0, f1, dur, gain, type){
    const c = this.get(); if(!c) return;
    const o = c.createOscillator(), g = c.createGain(), t0 = c.currentTime;
    o.type = type || "sine"; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(c.destination); o.start(t0); o.stop(t0 + dur + 0.05);
  },
  crash(big){ this.noise(0.7, 1400, 90, big ? 0.55 : 0.3, "lowpass"); this.tone(95, 32, 0.55, big ? 0.6 : 0.3); this.noise(0.22, 5000, 900, 0.22, "bandpass"); },
  hit(){ this.noise(0.18, 3000, 400, 0.18, "bandpass"); this.tone(140, 60, 0.12, 0.2); },
  pop(){ this.noise(0.14, 3500, 700, 0.4, "bandpass"); this.tone(420, 110, 0.09, 0.35); },
  spray(dur){ this.noise(dur, 6500, 4200, 0.09, "highpass", 0.15); },
  cheer(dur, vol){ this.noise(dur, 900, 1500, vol || 0.18, "bandpass", dur * 0.35); this.noise(dur, 400, 700, (vol || 0.18) * 0.6, "lowpass", dur * 0.3); },
  boom(){ this.noise(0.9, 700, 70, 0.3, "lowpass", 0.02); this.noise(0.5, 6000, 2000, 0.12, "highpass", 0.02); },
  clap(){ this.noise(0.05, 4000, 1500, 0.1, "bandpass"); },
};

const ease = k => k * k * (3 - 2 * k);
const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

const CINE = {
  SFX, active:null, _keys:null,

  /* ---- the overlay (letterbox, caption, skip hint, fade) ---- */
  ui(on){
    const e = $("#cine"); if(!e) return;
    e.hidden = !on;
    if(on){ $("#hud").hidden = true; $("#cine-fade").style.opacity = 0; this.caption("", ""); }
  },
  caption(big, small){
    const b = $("#cine-cap"), s = $("#cine-sub"); if(!b) return;
    if(b.textContent !== big) b.textContent = big;
    if(s.textContent !== small) s.textContent = small;
    const w = $(".cine-txt"); if(w) w.classList.toggle("on", !!big);
  },

  /* ---- starting and ending ---- */
  begin(G, S, kind, onDone){
    this.end(G, S, true);
    S.cine = { kind, t:0, onDone, done:false, skipAt:kind === "crash" ? 1e9 : 1.2 };
    this.active = S.cine;
    if(kind !== "crash"){
      this.ui(true);
      this._keys = e => { if(["Space", "Enter", "Escape"].includes(e.code) && S.cine && S.cine.t > S.cine.skipAt){ e.preventDefault(); this.finish(G, S); } };
      addEventListener("keydown", this._keys);
      this._click = () => { if(S.cine && S.cine.t > S.cine.skipAt + 0.6) this.finish(G, S); };
      addEventListener("pointerdown", this._click);
    }
  },
  finish(G, S){
    const c = S.cine; if(!c || c.done) return;
    c.done = true;
    const cb = c.onDone;
    this.end(G, S);
    if(cb) cb();
  },
  end(G, S, quiet){
    if(this._keys){ removeEventListener("keydown", this._keys); this._keys = null; }
    if(this._click){ removeEventListener("pointerdown", this._click); this._click = null; }
    const c = S && S.cine;
    if(c){
      try{ if(c.kind === "dnf") this.dnfCleanup(G, S); if(c.kind === "win") this.podiumCleanup(G, S); }catch(e){ console.warn("cine cleanup", e); }
    }
    if(S) S.cine = null;
    this.active = null;
    if(!quiet) this.ui(false);
    G.rend.setRenderTarget(null);
  },

  /* once a frame, from the session loop, with real time */
  update(G, S, dt){
    const c = S.cine; if(!c || c.done) return;
    c.t += dt; c.rdt = dt;
    if(c.kind === "dnf") this.dnfTick(G, S, dt);
    else if(c.kind === "win") this.podiumTick(G, S, dt);
    if(c.kind !== "crash"){
      const hint = $("#cine-skip"); if(hint) hint.style.opacity = c.t > c.skipAt ? 0.8 : 0;
      const f = $("#cine-fade");
      if(f){ const fin = seg(c.t, 0, 0.7), fout = seg(c.t, c.dur - 0.9, c.dur); f.style.opacity = Math.max(1 - fin, fout).toFixed(3); }
      if(c.t >= c.dur) this.finish(G, S);
    }
  },

  /* ---- camera helpers ---- */
  setCam(cam, pos, look, fov, roll){
    cam.position.copy(pos);
    cam.up.set(0, 1, 0);
    cam.lookAt(look);
    if(roll) cam.rotateZ(roll);
    if(Math.abs(cam.fov - fov) > 1e-3){ cam.fov = fov; cam.updateProjectionMatrix(); }
  },
  shake(t, a){ return V(Math.sin(t * 13.1) + Math.sin(t * 7.3 + 1) * 0.6, Math.sin(t * 11.7 + 2) + Math.sin(t * 5.9) * 0.6, Math.sin(t * 9.3 + 4)).multiplyScalar(a); },

  /* ===== the crash shot ===== */
  crashCam(G, S){
    const c = S.cine, p = S.player, T = S.track, cam = G.camTV;
    const ct = c.crashT = (c.crashT || 0) + (c.rdt || 0.016);
    if(!c.init){
      c.init = true;
      let dx = p.vx, dy = p.vy; const sp = Math.hypot(dx, dy);
      if(sp < 3){ dx = Math.cos(p.h); dy = Math.sin(p.h); } else { dx /= sp; dy /= sp; }
      const i = p.node, sg = -(Math.sign(p.off) || 1);
      // beyond the verge on the infield side, ahead of the car, low
      const nx = T.nx[i] * sg, ny = T.ny[i] * sg;
      c.dir = [dx, dy]; c.n = [nx, ny];
      c.pos = V(p.x + dx * 17 + nx * 8, p.z + 1.3, p.y + dy * 17 + ny * 8);
      c.look = V(p.x, p.z + 0.8, p.y);
      c.ang = Math.atan2(-dy, -dx) + 1.0;
    }
    const tgt = V(p.x, p.z + (p.air || 0) + 0.7, p.y);
    c.look.lerp(tgt, 1 - Math.exp(-(c.rdt || 0.016) * (ct < 3.2 ? 5 : 3)));
    let pos, fov;
    if(ct < 3.4){
      pos = c.pos.clone();
      const d = pos.distanceTo(tgt);
      fov = clamp(2 * Math.atan(3.4 / Math.max(d, 4)) * 180 / Math.PI * 1.6, 22, 52);      // keeps the car about the same size as it passes
      pos.add(this.shake(ct, 0.025 + 0.05 * Math.max(0, 1 - ct)));
    } else {
      const a = c.ang + (ct - 3.4) * 0.22, k = ease(seg(ct, 3.4, 4.6));
      const r = lerp(c.pos.distanceTo(tgt), 15, k), h = lerp(c.pos.y - tgt.y, 7, k);
      pos = V(tgt.x + Math.cos(a) * r, tgt.y + h, tgt.z + Math.sin(a) * r);
      fov = lerp(30, 38, k);
    }
    // keep the lens above the ground it stands on
    try{ const z = T.surfZ(pos.x, pos.z, p.node); if(z === z) pos.y = Math.max(pos.y, z + 0.5); }catch(e){}
    this.setCam(cam, pos, c.look, fov, ct < 0.35 ? (0.05 * (1 - ct / 0.35)) : 0);
    // the first instant: a punch in
    if(ct < 0.25) cam.fov = fov * (0.8 + 0.2 * ct / 0.25), cam.updateProjectionMatrix();
    return cam;
  },

  /* ===== the retirement: a crane lifts the wreck onto a recovery truck, and the driver climbs out up there =====
     The truck is parked in the world (inside the barrier, clear of the car, see planTruck), the car is lifted level
     and swung onto the bed, and everything the driver does after that happens in the CAR's own frame on a level bed
     (nose +x, y up, z out of the right side, bed top at y 0): so there is no slope to float over, whichever way the
     crash left the car. Hands and feet are placed by a two-bone IK (hands on the halo, feet on the sidepods and the bed). */
  dnfInit(G, S){
    const c = S.cine, p = S.player, T = S.track, e = G.cars.find(x => x.c === p), g = e.g;
    g.updateMatrixWorld(true);
    c.car = g; c.carFree = true;                                       // frame.js stops posing this car
    c.q0 = g.getWorldQuaternion(new THREE.Quaternion()); c.p0 = g.getWorldPosition(new THREE.Vector3());
    c.restore = { pos:g.position.clone(), quat:g.quaternion.clone() };
    c.S0 = 0.84;                                  // the driver's scale: this puts the seated helmet where the cockpit's own is
    c.tD = 6.2; c.dur = c.tD + 13.8;
    const nose = V(1, 0, 0).applyQuaternion(c.q0), yaw0 = Math.atan2(nose.z, nose.x), node = p.node;
    // park the truck
    // the wreck's footprint in its own heading, whatever its tilt (it may be on its side)
    let fx0 = 1e9, fx1 = -1e9, fz0 = 1e9, fz1 = -1e9; const cy = Math.cos(yaw0), sy = Math.sin(yaw0);
    for(const lx of [-2.7, 2.7]) for(const ly of [0, 1.1]) for(const lz of [-1.05, 1.05]){
      const w = V(lx, ly, lz).applyQuaternion(c.q0), a = w.x * cy + w.z * sy, b = -w.x * sy + w.z * cy;
      fx0 = Math.min(fx0, a); fx1 = Math.max(fx1, a); fz0 = Math.min(fz0, b); fz1 = Math.max(fz1, b);
    }
    const ccx = c.p0.x + cy * (fx0 + fx1) / 2 - sy * (fz0 + fz1) / 2, ccz = c.p0.z + sy * (fx0 + fx1) / 2 + cy * (fz0 + fz1) / 2;
    const plan = planTruck({ x:c.p0.x, z:c.p0.z, yaw:yaw0, cx:ccx, cz:ccz, half:[(fx1 - fx0) / 2, (fz1 - fz0) / 2] }, Math.atan2(T.ty[node], T.tx[node]), (x, z) => this.dnfRoom(S, { x, z }).room);
    const R = c.truck = G.recoveryTruck(); c.plan = plan;
    const gz = (x, z) => { let h = NaN; try{ h = T.surfZ(x, z, node); }catch(err){} return h === h ? h : c.p0.y; };
    const at = (lx, lz) => V(plan.x + Math.cos(plan.h) * lx - Math.sin(plan.h) * lz, 0, plan.z + Math.sin(plan.h) * lx + Math.cos(plan.h) * lz);
    const hgt = (lx, lz) => { const v = at(lx, lz); return gz(v.x, v.z); };
    const pf = at(5.1, 0), pr = at(-2.5, 0), pL = at(0, -1.35), pR = at(0, 1.35);
    pf.y = (hgt(5.1, -1.35) + hgt(5.1, 1.35)) / 2; pr.y = (hgt(-2.5, -1.35) + hgt(-2.5, 1.35)) / 2; pL.y = hgt(0, -1.35); pR.y = hgt(0, 1.35);
    const fwd = pf.clone().sub(pr).normalize(), rgt = pR.clone().sub(pL).normalize(), up = rgt.clone().cross(fwd).normalize();
    const rgt2 = fwd.clone().cross(up).normalize(), fwd2 = up.clone().cross(rgt2).normalize();
    const tm = new THREE.Matrix4().makeBasis(fwd2, up, rgt2);
    R.root.quaternion.setFromRotationMatrix(tm);
    R.root.position.set(plan.x, (pf.y + pr.y + pL.y + pR.y) / 4, plan.z);
    G.world.add(R.root); G.world.add(R.rig); R.root.updateMatrixWorld(true);
    c.tm = R.root.matrixWorld.clone();
    // which side he climbs out of: the one with room, away from the track when both have it
    const out = V(T.nx[node] * (Math.sign(p.off || 1) || 1), 0, T.ny[node] * (Math.sign(p.off || 1) || 1));
    let best = null;
    for(const sd of [1, -1]){
      const w = V(0, 0, sd * 4.8).applyMatrix4(c.tm), r = this.dnfRoom(S, w), dirW = V(0, 0, sd).transformDirection(c.tm);
      const sc = Math.min(r.room, 6) + 0.8 * dirW.dot(out);
      if(!best || sc > best.sc) best = { sd, sc };
    }
    c.side = best.sd;
    // the car's resting place on the bed: nose forward or back, whichever is the shorter swing
    const trYaw = Math.atan2(fwd2.z, fwd2.x);
    c.yawT = Math.cos(yaw0 - trYaw) >= 0 ? trYaw : trYaw + Math.PI;
    c.pT = V(0, TRUCK.BED_Y + 0.02, 0).applyMatrix4(c.tm);
    c.qT = c.tm.clone().multiply(new THREE.Matrix4().makeRotationY(c.yawT === trYaw ? 0 : Math.PI)); c.qT = new THREE.Quaternion().setFromRotationMatrix(c.qT);
    c.qL0 = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), -yaw0);          // the car's own heading, level
    c.peak = Math.max(c.pT.y + 2.5, c.p0.y + 2.2);
    c.hStow = V(-2.3, 5.0, 0).applyMatrix4(c.tm);                    // the hook's rest, above the back of the bed
    const t = p.team, d = p.drv;
    c.person = G.person({ suit:t.body, accent:t.accent, helmet:d.cam || "#F2C230", skin:G.skinFor(d.n), hair:G.hairFor(d.n) });
    c.person.root.scale.setScalar(c.S0);
    G.world.add(c.person.root);
    c.helm = { vel:V(0, 0, 0), thrown:false };
    c.hidden = [];
    for(const x of G.cars) if(x.c !== p){ c.hidden.push([x.g, x.g.visible]); x.g.visible = false; }
    if(g.userData.parts && g.userData.parts.drv) g.userData.parts.drv.visible = false;
    c.carM = g.matrixWorld.clone();
    c.sway = 0;
    SFX.cheer(0.01, 0.0001);
  },
  dnfCleanup(G, S){
    const c = S.cine; if(!c || !c.person) return;
    G.world.remove(c.person.root);
    if(c.truck){ G.world.remove(c.truck.root); G.world.remove(c.truck.rig); }
    if(c.car && c.restore){ c.car.position.copy(c.restore.pos); c.car.quaternion.copy(c.restore.quat); }
    c.carFree = false;
    for(const [g, v] of c.hidden || []) g.visible = v;
    const p = c.car && c.car.userData.parts; if(p && p.drv) p.drv.visible = true;
    c.person = null;
  },
  /* room between a world point and the barrier line (negative: past it), and which node it is nearest */
  dnfRoom(S, wp){
    const T = S.track, i = T.near(wp.x, wp.z, S.player.node), off = (wp.x - T.x[i]) * T.nx[i] + (wp.z - T.y[i]) * T.ny[i];
    return { room:T.half + T.roAt(i, off) + 2.6 - 1.0 - Math.abs(off), off, i };
  },

  /* the car on its way: sits, swings out to the hook, is lifted level, swung over the bed and lowered. t in seconds. */
  dnfCar(c, t){
    const T0 = 1.3, T1 = 2.2, T2 = 3.5, T3 = 5.0, T4 = 6.0;
    const pos = c.p0.clone(), q = c.q0.clone();
    let k;
    if(t > T1){ k = ease(seg(t, T1, T2)); pos.y = lerp(c.p0.y, c.peak, k); q.slerp(c.qL0, k); }
    if(t > T2){
      k = ease(seg(t, T2, T3)); pos.x = lerp(c.p0.x, c.pT.x, k); pos.z = lerp(c.p0.z, c.pT.z, k);
      q.copy(c.qL0).slerp(c.qT, k);
      if(t > T3){ k = ease(seg(t, T3, T4)); pos.y = lerp(c.peak, c.pT.y, k); }
    }
    // the pendulum: it swings as it is carried, and settles on the bed
    const carried = ease(seg(t, T1, T1 + 0.6)) * (1 - ease(seg(t, T3, T4 + 0.3)));
    const sway = Math.sin((t - T1) * 2.6) * 0.07 * carried;
    q.multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), sway)).multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), sway * 0.5));
    if(t > T4){ const b = Math.exp(-(t - T4) * 7) * Math.sin((t - T4) * 22) * 0.025; pos.y += b; }
    return { pos, q, hooked:t > T1 - 0.3 && t < T4 + 0.4, t0:T0, t1:T1, t2:T2, t3:T3, t4:T4 };
  },
  /* the driver's performance, in the car's frame (nose +x, bed top y 0, z out of the right side), seconds after the car lands.
     Each key: hips (x, y, z), yaw (0 faces the nose; +PI/2 faces out of the right side), a pose of angles, and optional IK:
     hands (weight + a target each) and feet. s is the side he climbs out of. */
  dnfKeys(s, S0){
    const POD = 0.51, ANK = 0.094 * S0, K = (t, hx, hy, hz, yaw, pose, ik) => ({ t, hx, hy, hz, yaw, pose, ik:ik || {} });
    const seat = { lean:-0.45, nod:0.15, ls:1.15, rs:1.15, le:0.8, re:0.8, lh:1.45, rh:1.45, lk:0.4, rk:0.4 };
    const rails = { hw:1, hl:[0.40, 0.87, -0.25], hr:[0.40, 0.87, 0.25] };
    const pods = (w) => ({ fw:w, fl:[-0.10, POD + ANK, -0.45], fr:[-0.10, POD + ANK, 0.45] });
    // a point relative to someone standing at (hx, hz) facing yaw: forward, lateral (to his right), height
    const rel = (hx, hz, yaw, f, l, u) => [hx + Math.cos(yaw) * f - Math.sin(yaw) * l, u, hz + Math.sin(yaw) * f + Math.cos(yaw) * l];
    const stand = 0.82, HP = Math.PI / 2 * s;
    const outFeet = (hx, hz, w, f) => ({ fw:w, fl:rel(hx, hz, HP, f, -0.12, ANK), fr:rel(hx, hz, HP, f, 0.12, ANK) });
    const bedFeet = (hx, hz, yaw) => ({ fw:1, fl:rel(hx, hz, yaw, 0.04, -0.09, ANK), fr:rel(hx, hz, yaw, 0.04, 0.09, ANK) });
    const sitX = -1.55, sitZ = s * 1.09;
    return [
      K(0.0, 0.62, 0.06, 0, 0, { ...seat, lean:-0.30, nod:0.65, ls:1.0, rs:1.0, le:1.0, re:1.0 }),                       // slumped in the seat
      K(0.8, 0.62, 0.06, 0, 0, { ...seat, lean:-0.40, nod:0.15 }),
      K(1.5, 0.60, 0.10, 0, 0, { ...seat, lean:-0.28, nod:0.1, lh:1.3, rh:1.3, lk:0.7, rk:0.7 }, { ...rails, hw:1 }),     // reaches for the halo
      K(2.2, 0.48, 0.32, 0, 0, { lean:0.10, nod:0.2, lh:1.25, rh:1.25, lk:1.4, rk:1.4 }, rails),                          // pulls himself up
      K(2.8, 0.20, 0.68, 0, 0, { lean:0.50, nod:0.25, lh:1.1, rh:1.1, lk:1.5, rk:1.5 }, { ...rails, ...pods(0.6) }),      // feet come up onto the sidepods
      K(3.3, -0.05, 0.93, 0, 0, { lean:0.82, nod:0.3 }, { ...rails, ...pods(1) }),                                        // crouched on the car, still holding on
      K(3.8, -0.05, 1.25, 0, 0, { lean:0.35, nod:0.15, ls:0.4, rs:0.4, le:0.4, re:0.4 }, { ...rails, hw:0.45, ...pods(1) }),
      K(4.3, -0.05, 1.33, 0, 0, { lean:0.08, nod:-0.12, ls:0.45, rs:0.45, le:0.25, re:0.25 }, { ...rails, hw:0, ...pods(1) }), // stands on the car
      K(4.9, -0.05, 1.33, 0, 0, { lean:0.0, nod:-0.2, ls:0.3, rs:0.3, le:0.2, re:0.2 }, { ...rails, hw:0, ...pods(1) }),   // takes it in
      K(5.2, -0.05, 1.12, 0, HP, { lean:0.32, nod:0.1, ls:-0.5, rs:-0.5, le:0.3, re:0.3 }, { ...rails, hw:0, ...pods(1) }),   // turns and bends his knees
      K(5.5, -0.05, 1.30, s * 0.10, HP, { lean:0.35, nod:0.0, ls:1.1, rs:1.1, le:0.2, re:0.2, lh:1.0, rh:1.0, lk:1.1, rk:1.1 }, { ...pods(0) }),   // the leap
      K(5.85, -0.05, 1.42, s * 0.85, HP, { lean:0.25, nod:0.0, ls:1.3, rs:1.3, le:0.3, re:0.3, lh:0.9, rh:0.9, lk:1.1, rk:1.1 }, {}),
      K(6.25, -0.05, 0.62, s * 1.36, HP, { lean:0.55, nod:0.3, ls:-0.2, rs:-0.2, le:0.4, re:0.4 }, outFeet(-0.05, s * 1.36, 1, 0.04)),  // lands, knees bent
      K(6.7, -0.05, stand, s * 1.38, HP, { lean:0.28, nod:0.45, ls:0.1, rs:0.1, le:0.15, re:0.15 }, outFeet(-0.05, s * 1.38, 1, 0.04)),
      K(7.1, -0.05, stand, s * 1.38, HP, { lean:0.15, nod:0.15, ls:1.35, rs:1.35, le:2.1, re:2.1 }, outFeet(-0.05, s * 1.38, 1, 0.04)),    // hands to the helmet
      K(7.55, -0.05, stand, s * 1.38, HP, { lean:0.22, nod:0.5, ls:0.4, rs:0.4, le:0.35, re:0.35 }, outFeet(-0.05, s * 1.38, 1, 0.04)),   // helmet off, in the hand
      K(7.95, -0.05, stand, s * 1.38, HP, { lean:0.5, nod:0.3, ls:0.4, rs:-1.0, le:0.35, re:0.5 }, outFeet(-0.05, s * 1.38, 1, 0.04)),    // wind up
      K(8.2, -0.05, stand, s * 1.38, HP, { lean:-0.12, nod:0.0, ls:0.4, rs:1.6, le:0.35, re:0.2 }, outFeet(-0.05, s * 1.38, 1, 0.04)),    // throw
      K(8.9, -0.05, stand, s * 1.38, HP, { lean:0.18, nod:0.5, ls:1.5, rs:1.5, le:2.3, re:2.3 }, outFeet(-0.05, s * 1.38, 1, 0.04)),     // hands on head
      K(9.5, -0.05, stand, s * 1.38, Math.PI, { lean:0.30, nod:0.6, ls:0.1, rs:0.1, le:0.1, re:0.1 }, outFeet(-0.05, s * 1.38, 1, 0.04)),   // turns on the spot to walk down the bed
      K(9.75, -0.05, stand, s * 1.38, Math.PI, { lean:0.30, nod:0.6, ls:0.1, rs:0.1, le:0.1, re:0.1 }, {}),
      K(10.7, sitX + 0.05, stand, s * 1.2, Math.PI, { lean:0.30, nod:0.6, ls:0.1, rs:0.1, le:0.1, re:0.1 }, {}),
      K(11.2, sitX, stand, sitZ, HP, { lean:0.22, nod:0.5, ls:0.1, rs:0.1, le:0.1, re:0.1 }, outFeet(sitX, sitZ, 1, 0.04)),                // back to the tyre
      K(11.8, sitX, 0.52, sitZ, HP, { lean:0.05, nod:0.45, ls:0.5, rs:0.5, le:0.9, re:0.9 }, outFeet(sitX, sitZ, 1, 0.30)),               // sits down
      K(12.5, sitX, 0.13, sitZ, HP, { lean:-0.30, nod:0.5, ls:0.35, rs:0.35, le:1.1, re:1.1 }, { ...outFeet(sitX, sitZ, 1, 0.40), hw:1, hl:rel(sitX, sitZ, HP, 0.36, -0.14, 0.36), hr:rel(sitX, sitZ, HP, 0.36, 0.14, 0.36) }),
      K(13.8, sitX, 0.13, sitZ, HP, { lean:-0.34, nod:0.62, ls:0.35, rs:0.35, le:1.1, re:1.1 }, { ...outFeet(sitX, sitZ, 1, 0.40), hw:1, hl:rel(sitX, sitZ, HP, 0.36, -0.14, 0.36), hr:rel(sitX, sitZ, HP, 0.36, 0.14, 0.36) }),
    ];
  },
  dnfSample(keys, t){
    let a = keys[0], b = keys[0];
    for(let i = 0; i < keys.length; i++){ if(keys[i].t <= t) a = keys[i]; if(keys[i].t >= t){ b = keys[i]; break; } b = keys[i]; }
    const k = a === b ? 0 : ease((t - a.t) / (b.t - a.t));
    const L3 = (u, v) => (u && v) ? [lerp(u[0], v[0], k), lerp(u[1], v[1], k), lerp(u[2], v[2], k)] : (v || u || null);
    const ia = a.ik, ib = b.ik;
    return { hx:lerp(a.hx, b.hx, k), hy:lerp(a.hy, b.hy, k), hz:lerp(a.hz, b.hz, k), yaw:lerp(a.yaw, b.yaw, k), pose:G3.lerpPose(a.pose, b.pose, k),
      hw:lerp(ia.hw || 0, ib.hw || 0, k), hl:L3(ia.hl, ib.hl), hr:L3(ia.hr, ib.hr),
      fw:lerp(ia.fw || 0, ib.fw || 0, k), fl:L3(ia.fl, ib.fl), fr:L3(ia.fr, ib.fr) };
  },
  dnfTick(G, S, dt){
    const c = S.cine;
    if(!c.person) this.dnfInit(G, S);
    const P = c.person, t = c.t, s = c.side, p = S.player, S0 = c.S0, tau = Math.max(0, t - c.tD);
    // 1. the car, and the crane that is carrying it
    const cp = this.dnfCar(c, Math.min(t, c.tD)), g = c.car;
    g.position.copy(cp.pos); g.quaternion.copy(cp.q); g.updateMatrixWorld(true); c.carM = g.matrixWorld.clone();
    const lugs = [[1.1, 0.5, -0.5], [1.1, 0.5, 0.5], [-1.0, 0.6, -0.45], [-1.0, 0.6, 0.45]].map(a => V(...a).applyMatrix4(c.carM));
    let hook;
    if(t < cp.t1 - 0.3){                       // out from over the bed to a point above the wreck
      const k = ease(seg(t, 0.0, cp.t0)); hook = c.hStow.clone().lerp(V(c.p0.x, c.p0.y + 1.95, c.p0.z), k);
    } else if(t < c.tD - 0.4){                 // carried: straight above the car
      hook = V(cp.pos.x, cp.pos.y + 1.95, cp.pos.z);
    } else {                                   // let go, and up and out of the way
      const k = ease(seg(t, c.tD - 0.4, c.tD + 1.0)); hook = V(cp.pos.x, cp.pos.y + 1.95, cp.pos.z).lerp(c.hStow, k);
    }
    c.truck.slingOn = t < c.tD - 0.1;
    c.truck.aim(hook, lugs); c.truck.blink(t);
    // 2. the driver, in the car's frame
    const keys = c.keys || (c.keys = this.dnfKeys(s, S0));
    const sm = this.dnfSample(keys, tau);
    let { hx, hy, hz, yaw } = sm; let pose = { ...sm.pose };
    // the walk down the bed (the legs are swung by hand there)
    if(tau > 9.75 && tau < 10.8){
      const w = tau - 9.75, ph = w * 5.6, sw = Math.sin(ph);
      pose = { lean:0.30, nod:0.6, ls:-sw * 0.3, rs:sw * 0.3, le:0.15, re:0.15, lh:sw * 0.5, rh:-sw * 0.5, lk:Math.max(0, -sw) * 0.7, rk:Math.max(0, sw) * 0.7 };
      hy += Math.abs(sw) * 0.02 * S0;
    }
    // place him: hips at (hx, hy, hz) in the car's frame, turned by yaw
    const lp = V(hx, hy - 0.93 * S0, hz).applyMatrix4(c.carM);
    P.root.position.copy(lp);
    P.root.quaternion.copy(g.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), -yaw));
    P.root.updateMatrixWorld(true);
    // hands and feet by IK, blended with the hand-made pose by their weights
    P.pose(pose); P.root.updateMatrixWorld(true);
    const out = { ...pose, flat:sm.fw };
    const limb = (n, kind, w, tgt) => {
      if(!(w > 0.001) || !tgt) return;
      const wp = V(tgt[0], tgt[1], tgt[2]).applyMatrix4(c.carM), r = P.ikAngles(n, kind, wp, pose);
      if(kind === "arm"){ out[n + "s"] = lerp(pose[n + "s"] || 0, r.s, w); out[n + "e"] = lerp(pose[n + "e"] || 0, r.e, w); }
      else { out[n + "h"] = lerp(pose[n + "h"] || 0, r.s, w); out[n + "k"] = lerp(pose[n + "k"] || 0, r.e, w); }
    };
    limb("l", "arm", sm.hw, sm.hl); limb("r", "arm", sm.hw, sm.hr);
    limb("l", "leg", sm.fw, sm.fl); limb("r", "leg", sm.fw, sm.fr);
    P.pose(out); P.root.updateMatrixWorld(true);
    // 3. the helmet: on, in the hand, then thrown out over the side of the truck
    const H = P.helm;
    if(tau < 7.45){ P.setHelmet(true); }
    else if(!c.helm.thrown){
      if(H.parent !== P.rHand){ P.rHand.add(H); H.position.set(0.04, -0.14, 0); H.rotation.set(0, 0, 0); H.scale.setScalar(1.0); P.bare.visible = true; H.visible = true; }
      if(tau > 8.12){
        c.helm.thrown = true;
        H.updateMatrixWorld(true);
        const wp = V(0, 0, 0); H.getWorldPosition(wp); G.world.add(H);
        H.position.copy(wp); H.quaternion.identity(); H.scale.setScalar(S0);
        const o = V(0, 0.0, s).transformDirection(c.carM);
        c.helm.vel.set(o.x * 5.2, 3.4, o.z * 5.2); c.helm.spin = V(7, 3, 9);
        SFX.hit();
      }
    }
    if(c.helm.thrown){
      const hv = c.helm.vel, hp = H.position;
      hv.y -= 21 * dt; hp.addScaledVector(hv, dt); H.rotation.x += c.helm.spin.x * dt; H.rotation.z += c.helm.spin.z * dt;
      // the floor: the bed while it is over it, the ground once it is past
      let floorY = c.pT.y - 0.02 + 0.12;
      try{ const z0 = S.track.surfZ(hp.x, hp.z, p.node); if(z0 === z0) floorY = z0 + 0.15; }catch(e){}
      const lh = hp.clone().applyMatrix4(c.tm.clone().invert());
      if(Math.abs(lh.x) < TRUCK.BED_X && Math.abs(lh.z) < TRUCK.BED_Z) floorY = V(lh.x, TRUCK.BED_Y, lh.z).applyMatrix4(c.tm).y + 0.12;
      if(hp.y < floorY){ hp.y = floorY; if(hv.y < -1.5){ hv.y = -hv.y * 0.45; hv.x *= 0.7; hv.z *= 0.7; c.helm.spin.multiplyScalar(0.55); SFX.hit(); } else hv.y = 0; hv.x *= 0.96; hv.z *= 0.96; }
    }
    // 4. the wreck smoulders
    if(Math.random() < dt * 24){
      const sp = V(-0.1, 0.5, 0).applyMatrix4(c.carM);
      spawn(sp.x, sp.z, sp.y, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2, 1.5 + Math.random() * 1.2, 2.6, "#4A4E54", 0.55, "smoke");
    }
    // 5. captions
    if(t > 0.8 && t < 5.2) this.caption("RETIRED", `${p.drv.last} · ${p.retiredBy || "Retired"}`);
    else if(t >= 5.2 && t < c.dur - 4.6) this.caption("", "");
    else if(t >= c.dur - 4.6) this.caption("DNF", `${S.track.name} · Lap ${Math.max(1, p.lap)}`);
  },
  dnfCam(G, S){
    const c = S.cine, cam = G.camTV, t = c.t, s = c.side;
    if(!c.person || !c.tm) return cam;
    const tau = t - c.tD, TL = (x, y, z) => V(x, y, z).applyMatrix4(c.tm), CL = (x, y, z) => V(x, y, z).applyMatrix4(c.carM);
    const hp = V(0, 0, 0); c.person.head.getWorldPosition(hp);
    const carC = V(0, 0.6, 0).applyMatrix4(c.carM);
    const sh = this.shake(t, 0.012);
    let pos, look, fov = 34;
    if(t < 2.2){                                           // the whole scene: truck, crane and wreck
      const k = t / 2.2;
      pos = TL(lerp(9.5, 8.0, k), lerp(3.6, 3.2, k), s * lerp(10.5, 9.0, k)); look = lerp3(TL(-1.5, 1.4, 0), carC, 0.5); fov = 40;
    } else if(t < c.tD){                                   // round it as it is lifted, swung and lowered
      const k = (t - 2.2) / (c.tD - 2.2), a = lerp(0.35, 1.25, ease(k));
      pos = TL(Math.cos(a) * 10.5 - 1.5, lerp(3.4, 2.6, k), s * Math.sin(a) * 10.5); look = carC.clone().add(V(0, 0.4, 0)); fov = lerp(36, 32, k);
    } else if(tau < 2.9){                                  // in the cockpit
      const k = tau / 2.9;
      pos = CL(lerp(3.0, 2.2, k), lerp(1.5, 1.6, k), s * lerp(3.0, 2.4, k)); look = lerp3(hp, CL(0.3, 0.8, 0), 0.25); fov = lerp(30, 26, k);
    } else if(tau < 5.0){                                  // climbing, standing on the car
      const k = (tau - 2.9) / 2.1;
      pos = CL(lerp(1.6, 0.8, k), lerp(1.2, 1.9, k), s * lerp(4.2, 5.0, k)); look = hp.clone().add(V(0, -0.15 - k * 0.2, 0)); fov = 30;
    } else if(tau < 6.7){                                  // the hop down
      const k = (tau - 5.0) / 1.7;
      pos = CL(lerp(-0.6, 0.6, k), lerp(1.8, 1.3, k), s * lerp(5.4, 5.6, k)); look = lerp3(hp, CL(-0.05, 0.9, s * 1.0), 0.35); fov = 32;
    } else if(tau < 9.3){                                  // the helmet, and the throw
      const k = (tau - 6.7) / 2.6;
      pos = CL(lerp(2.6, 3.2, k), lerp(1.5, 1.7, k), s * lerp(3.4, 3.8, k)); look = hp.clone().add(V(0, -0.1, 0)); fov = lerp(27, 30, k);
    } else {                                               // the long walk and the sit: pulling back to show the truck
      const k = (tau - 9.3) / (c.dur - c.tD - 9.3);
      pos = lerp3(CL(-1.0, 1.5, s * 3.6), TL(-7.5, 3.8, s * 8.5), ease(k)); look = lerp3(hp, CL(-1.2, 0.6, s * 1.0), 0.45 + 0.3 * k); fov = lerp(32, 40, k);
    }
    pos.add(sh);
    try{ const z0 = S.track.surfZ(pos.x, pos.z, S.player.node); if(z0 === z0) pos.y = Math.max(pos.y, z0 + 0.35); }catch(e){}
    this.setCam(cam, pos, look, fov);
    return cam;
  },
};
function lerp3(a, b, k){ return a.clone().lerp(b, k); }

/* =================== the podium =================== */
const PODIUM_DUR = 16.0;
const SIDE = { P1:0, P2:-1, P3:1 };

/* a ring of particles: positions, colours, velocities, a life each */
class Pool {
  constructor(n, opts){
    this.n = n; this.i = 0;
    this.pos = new Float32Array(n * 3).fill(-9999); this.col = new Float32Array(n * 3); this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n); this.max = new Float32Array(n);
    this.g = opts.gravity == null ? 9.8 : opts.gravity; this.drag = opts.drag || 0; this.flutter = opts.flutter || 0; this.floor = opts.floor == null ? 0 : opts.floor;
    this.fadeCol = !!opts.add; this.base = new Float32Array(n * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3)); geo.setAttribute("color", new THREE.BufferAttribute(this.col, 3));
    const mat = new THREE.PointsMaterial({ size:opts.size || 0.15, sizeAttenuation:true, vertexColors:true, transparent:true, opacity:opts.opacity == null ? 1 : opts.opacity,
      depthWrite:false, blending:opts.add ? THREE.AdditiveBlending : THREE.NormalBlending, map:opts.map || null, alphaTest:0.01, fog:false });
    this.pts = new THREE.Points(geo, mat); this.pts.frustumCulled = false;
  }
  spawn(x, y, z, vx, vy, vz, life, r, g, b){
    const k = this.i; this.i = (this.i + 1) % this.n;
    this.pos[k * 3] = x; this.pos[k * 3 + 1] = y; this.pos[k * 3 + 2] = z;
    this.vel[k * 3] = vx; this.vel[k * 3 + 1] = vy; this.vel[k * 3 + 2] = vz;
    this.life[k] = life; this.max[k] = life; this.col[k * 3] = this.base[k * 3] = r; this.col[k * 3 + 1] = this.base[k * 3 + 1] = g; this.col[k * 3 + 2] = this.base[k * 3 + 2] = b;
  }
  step(dt, t){
    for(let k = 0; k < this.n; k++){
      if(this.life[k] <= 0){ this.pos[k * 3 + 1] = -9999; continue; }
      this.life[k] -= dt;
      let vx = this.vel[k * 3], vy = this.vel[k * 3 + 1], vz = this.vel[k * 3 + 2];
      vy -= this.g * dt;
      if(this.drag){ const d = Math.exp(-this.drag * dt); vx *= d; vz *= d; if(this.flutter) vy = Math.max(vy, -1.7) ; }
      if(this.flutter){ vx += Math.sin(t * 3 + k) * this.flutter * dt; vz += Math.cos(t * 2.3 + k * 1.7) * this.flutter * dt; }
      this.pos[k * 3] += vx * dt; this.pos[k * 3 + 1] += vy * dt; this.pos[k * 3 + 2] += vz * dt;
      if(this.pos[k * 3 + 1] < this.floor){ this.life[k] = 0; this.pos[k * 3 + 1] = -9999; }
      this.vel[k * 3] = vx; this.vel[k * 3 + 1] = vy; this.vel[k * 3 + 2] = vz;
      if(this.fadeCol){ const a = clamp(this.life[k] / this.max[k], 0, 1); this.col[k * 3] = this.base[k * 3] * a; this.col[k * 3 + 1] = this.base[k * 3 + 1] * a; this.col[k * 3 + 2] = this.base[k * 3 + 2] * a; }
    }
    this.pts.geometry.attributes.position.needsUpdate = true; this.pts.geometry.attributes.color.needsUpdate = true;
  }
  dispose(){ this.pts.geometry.dispose(); this.pts.material.dispose(); }
}

function canvasTex(w, h, draw){
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  draw(cv.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
  return t;
}
function dotTex(){
  return canvasTex(32, 32, (g, w, h) => { const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.5, "rgba(255,255,255,.8)"); r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r; g.fillRect(0, 0, w, h); });
}

Object.assign(CINE, {
  podiumInit(G, S){
    const c = S.cine, T = S.track, night = !!T.night;
    c.dur = PODIUM_DUR; c.night = night;
    const res = S.results.filter(r => !r.dnf && !r.dq).slice(0, 3);
    c.top = res.map(r => r.car);
    const scene = c.scene = new THREE.Scene();
    // the sky
    c.bg = canvasTex(8, 512, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      if(night){ gr.addColorStop(0, "#04060F"); gr.addColorStop(0.55, "#0E1638"); gr.addColorStop(1, "#2B2C5E"); }
      else { gr.addColorStop(0, "#27427A"); gr.addColorStop(0.5, "#C86A63"); gr.addColorStop(0.8, "#FFB470"); gr.addColorStop(1, "#FFD9A0"); }
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    scene.background = c.bg;
    scene.fog = new THREE.Fog(night ? 0x1A1D3E : 0xD99B78, 60, 200);
    const sun = new THREE.DirectionalLight(night ? 0x9BB0FF : 0xFFC38A, night ? 0.9 : 2.2);
    sun.position.set(-9, 12, 14); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); const sc = sun.shadow.camera; sc.left = -9; sc.right = 9; sc.top = 8; sc.bottom = -4; sc.near = 1; sc.far = 50;
    sun.shadow.bias = -0.0004; scene.add(sun); scene.add(sun.target); sun.target.position.set(0, 1.5, 0);
    scene.add(new THREE.HemisphereLight(night ? 0x5A6BC0 : 0x8FB0FF, night ? 0x20203A : 0x8A6A58, night ? 0.9 : 0.85));
    const rim = new THREE.DirectionalLight(night ? 0xFF6FA8 : 0xFFE0B8, 0.8); rim.position.set(8, 6, -10); scene.add(rim);
    c.lights = [];
    for(const [x, col] of [[-5.5, 0xFF3A7A], [5.5, 0x3AA0FF]]){
      const l = new THREE.PointLight(col, night ? 2.6 : 1.1, 24, 1.6); l.position.set(x, 5, 5); scene.add(l); c.lights.push(l);
    }
    const M = (col, o) => G.mat(col, Object.assign({ roughness:0.8, flatShading:true }, o || {}));
    // the stage and the ground
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), M(night ? "#101324" : "#3A3A40", { roughness:1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.3; ground.receiveShadow = true; scene.add(ground);
    const stage = new THREE.Mesh(new THREE.BoxGeometry(17, 0.3, 8), M("#2B2F38", { roughness:0.55 })); stage.position.set(0, -0.15, 0.5); stage.receiveShadow = true; scene.add(stage);
    const carpet = new THREE.Mesh(new THREE.BoxGeometry(17, 0.02, 3.2), M("#7A1424", { roughness:0.95 })); carpet.position.set(0, 0.01, 2.8); carpet.receiveShadow = true; scene.add(carpet);
    // the backdrop: a made-up sponsor wall with the race's name across it
    const wall = canvasTex(2048, 512, (g, w, h) => {
      g.fillStyle = night ? "#0A0E22" : "#101A33"; g.fillRect(0, 0, w, h);
      const words = ["APEX", "VELOCE", "NOVA", "KINETIC", "HALCYON", "ORBIT"];
      g.font = "800 italic 46px 'Saira Condensed',Arial,sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
      for(let r = 0; r < 4; r++) for(let k = 0; k < 8; k++){
        g.fillStyle = "rgba(255,255,255," + (0.07 + ((r + k) % 3) * 0.03) + ")";
        g.fillText(words[(r * 3 + k) % words.length], (k + (r % 2) * 0.5) * 270 + 40, 50 + r * 120);
      }
      const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, "#FFB020"); gr.addColorStop(0.5, "#FFE08A"); gr.addColorStop(1, "#FFB020");
      g.fillStyle = gr; g.font = "800 italic 150px 'Saira Condensed',Arial,sans-serif";
      g.fillText((T.name || "GRAND PRIX").toUpperCase(), w / 2, 215);
      g.fillStyle = "#FFFFFF"; g.font = "700 62px 'Saira Condensed',Arial,sans-serif"; g.fillText("GRAND PRIX · RACE WINNERS", w / 2, 345);
      g.fillStyle = "#FFB020"; g.fillRect(0, 440, w, 10); g.fillRect(0, 462, w, 4);
    });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(22, 5.5), new THREE.MeshBasicMaterial({ map:wall, fog:false, toneMapped:true }));
    back.position.set(0, 3.2, -4.2); scene.add(back);
    for(const sd of [-1, 1]){
      const w2 = new THREE.Mesh(new THREE.PlaneGeometry(9, 5.5), new THREE.MeshBasicMaterial({ map:wall, fog:false }));
      w2.position.set(sd * 14.5, 3.2, -2.2); w2.rotation.y = -sd * 0.5; scene.add(w2);
    }
    // a truss with lamps, and beams
    const truss = new THREE.Mesh(new THREE.BoxGeometry(20, 0.25, 0.25), M("#1A1D24", { metalness:0.6, roughness:0.4 })); truss.position.set(0, 7.6, 1.5); scene.add(truss);
    c.beams = [];
    for(let k = 0; k < 9; k++){
      const x = -8 + k * 2, col = [0xFFE9B0, 0xFF5A9A, 0x5AB4FF][k % 3];
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.5), new THREE.MeshBasicMaterial({ color:col }));
      lamp.position.set(x, 7.3, 1.5); scene.add(lamp);
      const beam = new THREE.Mesh(new THREE.ConeGeometry(1.5, 9, 14, 1, true), new THREE.MeshBasicMaterial({ color:col, transparent:true, opacity:night ? 0.13 : 0.06, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide, fog:false }));
      beam.position.set(x, 3.0, 1.5); beam.userData.k = k; scene.add(beam); c.beams.push(beam);
    }
    // the podium
    const numTex = n => canvasTex(256, 256, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#232A3C"); gr.addColorStop(1, "#0F131D");
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = n === 1 ? "#FFC83A" : n === 2 ? "#D5DBE3" : "#D9915A"; g.font = "900 italic 190px 'Saira Condensed',Arial,sans-serif";
      g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(String(n), w / 2, h / 2 + 8);
      g.fillStyle = "#FFB020"; g.fillRect(0, h - 14, w, 14);
    });
    c.blocks = [[2, -2.35, 0.78], [1, 0, 1.12], [3, 2.35, 0.46]];
    c.tex = [];
    for(const [n, x, h] of c.blocks){
      const tex = numTex(n); c.tex.push(tex);
      const side = M("#1B2030", { roughness:0.5 });
      const top = M(n === 1 ? "#F4C84A" : "#C9CFD8", { roughness:0.35, metalness:0.4 });
      const front = new THREE.MeshStandardMaterial({ map:tex, roughness:0.45 });
      const b = new THREE.Mesh(new THREE.BoxGeometry(2.2, h, 1.8), [side, side, top, side, front, side]);
      b.position.set(x, h / 2, 0); b.castShadow = true; b.receiveShadow = true; scene.add(b);
    }
    // the crowd on the stands to either side
    const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.32, 0.3, 0.3), M("#E9B896", { roughness:0.9 }), 900);
    const bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(0.46, 0.7, 0.34), new THREE.MeshStandardMaterial({ roughness:0.9, flatShading:true }), 900);
    c.crowd = [];
    const cols = ["#E24B3A", "#F2C230", "#2F6FE0", "#F2F2F2", "#27A67A", "#FF8C2E", "#B04BD8", "#1B1E26", "#FF4D88"];
    let n = 0;
    for(const sd of [-1, 1]) for(let r = 0; r < 6; r++) for(let k = 0; k < 24; k++){
      if(n >= 900) break;
      const x = sd * (10.5 + r * 1.25) + (Math.random() - 0.5) * 0.4, y = r * 0.8 - 0.1, z = -3.5 + k * 0.85 + (Math.random() - 0.5) * 0.3;
      c.crowd.push({ x, y, z, ph:Math.random() * 6, amp:0.6 + Math.random() * 0.8 });
      bodies.setColorAt(n, new THREE.Color(cols[(Math.random() * cols.length) | 0]).convertSRGBToLinear());
      heads.setColorAt(n, new THREE.Color(G3.skinFor((Math.random() * 6) | 0)).convertSRGBToLinear());
      n++;
    }
    heads.count = bodies.count = n; c.heads = heads; c.bodies = bodies;
    scene.add(heads, bodies);
    // the stands under them
    for(const sd of [-1, 1]){
      for(let r = 0; r < 6; r++){
        const st = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.7 + r * 0.8, 21), M("#20242E")); st.position.set(sd * (10.5 + r * 1.25), (0.7 + r * 0.8) / 2 - 0.5, 6.7); scene.add(st);
      }
    }
    // the people on the podium
    c.ppl = [];
    c.pcol = [];
    const order = [1, 0, 2];                                         // positions in c.top: P2 left, P1 centre, P3 right
    c.top.forEach((car, idx) => {
      const place = idx + 1, bi = [1, 0, 2][idx], blk = c.blocks[bi];
      const P = G.person({ suit:car.team.body, accent:car.team.accent, helmet:car.drv.cam, skin:G.skinFor(car.drv.n), hair:G.hairFor(car.drv.n), cap:car.team.accent, helmetOn:false });
      if(P.cap) P.cap.visible = true;
      scene.add(P.root);
      const startX = place === 1 ? -12 : place === 2 ? -11 : 11, ta = place === 3 ? 0.8 : place === 2 ? 1.2 : 1.7;
      const tEnd = place === 1 ? 4.3 : place === 2 ? 3.8 : 3.5;
      // props: a bottle in the left hand, the trophy (winner) in the right
      const bottle = this.bottle(G); P.lHand.add(bottle); bottle.position.set(0.0, -0.14, 0.02); bottle.rotation.z = Math.PI;      // neck out along the forearm
      P.bottle = bottle;
      if(place === 1){ P.trophy = this.trophy(G); P.rHand.add(P.trophy); P.trophy.position.set(0.02, -0.10, 0); }
      else { bottle.parent.remove(bottle); P.rHand.add(bottle); bottle.position.set(0.02, -0.14, 0); }
      c.ppl.push({ P, car, place, bx:blk[1], bh:blk[2], startX, ta, tEnd, seed:Math.random() * 10 });
    });
    c.pools = {
      spray:new Pool(1800, { size:0.13, gravity:9.8, fade:true, opacity:0.85, map:dotTex() }),
      conf:new Pool(900, { size:0.16, gravity:3, drag:1.2, flutter:5, opacity:1 }),
      fire:new Pool(1400, { size:0.4, gravity:2.2, drag:0.6, add:true, map:dotTex(), floor:0 }),
    };
    c.pools.conf.floor = -0.2;
    for(const k in c.pools) scene.add(c.pools[k].pts);
    c.cork = null; c.popped = false; c.confDone = [false, false]; c.fireT = 0;
    c.cam = new THREE.PerspectiveCamera(36, 1.6, 0.2, 400);
    c.cheered = [false, false, false];
  },
  bottle(G){
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.26, 10), G.mat("#1D4A2A", { roughness:0.35, metalness:0.2 })); body.position.y = 0.0;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.05, 0.14, 10), G.mat("#1D4A2A", { roughness:0.35, metalness:0.2 })); neck.position.y = 0.2;
    const foil = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.07, 10), G.mat("#E8C45A", { roughness:0.3, metalness:0.7 })); foil.position.y = 0.30;
    const lab = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.1, 0.115), G.mat("#F2EBD3", { roughness:0.7 })); lab.position.y = -0.02;
    g.add(body, neck, foil, lab);
    g.userData.tip = V(0, 0.34, 0);
    g.scale.setScalar(1.15);
    return g;
  },
  trophy(G){
    const g = new THREE.Group(), gold = G.mat("#F3C645", { roughness:0.22, metalness:0.9 });
    const pts = [[0, 0], [0.11, 0], [0.11, 0.02], [0.05, 0.05], [0.04, 0.16], [0.07, 0.22], [0.14, 0.30], [0.16, 0.40], [0.13, 0.46], [0, 0.46]].map(([r, y]) => new THREE.Vector2(r, y));
    const cup = new THREE.Mesh(new THREE.LatheGeometry(pts, 14), gold); cup.castShadow = true; g.add(cup);
    for(const sd of [-1, 1]){ const h = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 6, 10, Math.PI), gold); h.position.set(0, 0.34, sd * 0.16); h.rotation.set(0, 0, 0); h.rotation.x = Math.PI / 2; g.add(h); }
    g.position.y = 0;
    return g;
  },

  /* the poses */
  podiumWalk(ph){ const sw = Math.sin(ph); return { lean:0.04, nod:0, ls:-sw * 0.5, rs:sw * 0.5, le:0.3, re:0.3, lh:sw * 0.55, rh:-sw * 0.55, lk:Math.max(0, -sw) * 0.8, rk:Math.max(0, sw) * 0.8 }; },
  podiumTick(G, S, dt){
    const c = S.cine, t = c.t;
    if(!c.scene) this.podiumInit(G, S);
    if(!c.started){ c.started = true; SFX.cheer(3.0, 0.14); }
    const sc = c.scene;
    // each of the three
    for(const q of c.ppl){
      const { P } = q;
      let x, y, z, yaw, pose;
      const walkEnd = q.tEnd, hop = walkEnd + 0.7, standT = hop + 0.45;
      const zWalk = 2.7;
      if(t < q.ta){ x = q.startX; y = 0; z = zWalk; yaw = q.startX < 0 ? 0 : Math.PI; pose = {}; }
      else if(t < walkEnd){
        const k = (t - q.ta) / (walkEnd - q.ta); x = lerp(q.startX, q.bx, k); y = 0; z = zWalk; yaw = q.startX < 0 ? 0 : Math.PI;
        pose = this.podiumWalk(t * 6.2 + q.seed); y += Math.abs(Math.sin(t * 6.2 + q.seed)) * 0.03;
        if(Math.random() < dt * 4) SFX.clap();
      } else if(t < hop){
        const k = ease((t - walkEnd) / 0.7); x = q.bx; z = lerp(zWalk, 0.1, k); y = Math.sin(k * Math.PI) * 0.35 + q.bh * k;
        yaw = lerp(q.startX < 0 ? 0 : Math.PI, -Math.PI / 2 * 0.2, k) ; pose = { ...this.podiumWalk(t * 7), lh:0.9 * Math.sin(k * Math.PI) };
        yaw = lerp(q.startX < 0 ? 0 : Math.PI, Math.PI / 2, k);                // round to face the camera as he climbs
      } else {
        x = q.bx; z = 0.1; y = q.bh; yaw = Math.PI / 2;
        const u = t - standT, jump = (u > 0.6 && u < 2.4) ? Math.abs(Math.sin(u * 5.2 + q.seed)) * 0.16 : 0;
        y += jump;
        const wave = Math.sin(t * 6 + q.seed);
        // 1: bow in, arms up; then the champagne
        const shake = t > 6.0 && t < 7.0, spray = t >= 7.0 && t < 12.6, after = t >= 12.6;
        if(!shake && !spray && !after){
          if(q.place === 1) pose = { lean:-0.08, nod:-0.2, ls:2.9, lsa:0.2, rs:2.8, rsa:0.25, le:0.15, re:0.25, lh:0.04, rh:-0.04 };
          else pose = { lean:-0.05, nod:-0.15, ls:2.6 + wave * 0.15, lsa:0.5, rs:2.6 - wave * 0.15, rsa:0.5, le:0.2, re:0.2 };
          if(q.place !== 1) P.rHand.visible = true;
        } else if(shake){
          const sh = Math.sin(t * 24 + q.seed);
          pose = { lean:0.1, nod:0.15, ls:1.0 + sh * 0.18, rs:1.0 - sh * 0.18, le:1.2 + sh * 0.2, re:1.2 - sh * 0.2, lh:0.04, rh:-0.04 };
          if(q.place === 1) pose.rs = 2.6;
        } else if(spray){
          const sw = Math.sin(t * 2.2 + q.seed);
          pose = { lean:-0.15 + sw * 0.05, nod:-0.1, ls:1.65 + sw * 0.1, lsa:0.2, rs:1.5, le:0.15, re:0.15, hdy:sw * 0.3 };
          if(q.place === 1){ pose.rs = 2.9; pose.rsa = 0.2; pose.ls = 1.7; }
          else if(q.place === 2){ pose.rs = 1.6; pose.re = 0.15; pose.ls = 2.7; pose.lsa = 0.4; }
          else { pose.rs = 1.6; pose.ls = 2.7; pose.lsa = 0.4; }
          yaw = Math.PI / 2 + (q.place === 1 ? sw * 0.7 : (q.place === 2 ? -0.7 : 0.7)) * 0.6;
        } else {
          pose = { lean:-0.1, nod:-0.2, ls:2.8 + wave * 0.2, lsa:0.3, rs:2.8 - wave * 0.2, rsa:0.3, le:0.2, re:0.2 };
        }
      }
      P.pose(pose);
      // the cup stays the right way up however high the arm goes
      if(P.trophy) P.trophy.rotation.z = Math.PI * clamp(((pose.rs || 0) - 1.0) / 1.4, 0, 1);
      P.root.position.set(x, y, z); P.root.rotation.set(0, -yaw, 0);
      if(!c.cheered[q.place - 1] && t > standT + 0.2){ c.cheered[q.place - 1] = true; SFX.cheer(2.4, q.place === 1 ? 0.2 : 0.12); }
    }
    // confetti: at the start and once more at the champagne
    if(t > 0.9 && !c.confDone[0]){ c.confDone[0] = true; this.confetti(c, 340); SFX.pop(); SFX.cheer(3.5, 0.22); }
    if(t > 5.9 && !c.confDone[1]){ c.confDone[1] = true; this.confetti(c, 420); SFX.boom(); SFX.cheer(3.5, 0.22); }
    // the corks, then the spray
    if(t >= 6.95 && !c.popped){
      c.popped = true; SFX.pop(); setTimeout(() => SFX.pop(), 160); setTimeout(() => SFX.pop(), 330); SFX.spray(5.3); SFX.cheer(5, 0.2);
    }
    const winner = c.ppl.find(q => q.place === 1);
    if(t >= 6.95 && t < 12.5){
      sc.updateMatrixWorld(true);
      const tgt = V(0, 2.9, 0.4), wp = V(0, 0, 0);
      for(const q of c.ppl){
        const b = q.P.bottle; if(!b) continue;
        b.updateMatrixWorld(true); wp.copy(b.userData.tip).applyMatrix4(b.matrixWorld);
        const to = q.place === 1 ? V(Math.sin(t * 1.4) * 4.5, 2.2, 6) : tgt.clone();
        const dir = to.sub(wp).normalize();
        const n = Math.round(dt * 150);
        for(let k = 0; k < n; k++){
          const sp = 8 + Math.random() * 6, j = 0.14;
          c.pools.spray.spawn(wp.x, wp.y, wp.z, (dir.x + (Math.random() - 0.5) * j) * sp, (dir.y + 0.25 + (Math.random() - 0.5) * j) * sp, (dir.z + (Math.random() - 0.5) * j) * sp,
            0.9 + Math.random() * 0.8, 1, 0.96, 0.8);
        }
      }
    }
    // fireworks over the stage to finish
    if(t > 11.4 && t < 15.6){
      c.fireT -= dt;
      if(c.fireT <= 0){
        c.fireT = 0.35 + Math.random() * 0.3;
        const cx = (Math.random() - 0.5) * 18, cy = 11 + Math.random() * 7, cz = -9 + Math.random() * 4;
        const hue = Math.random(), col = new THREE.Color().setHSL(hue, 1, 0.6).convertSRGBToLinear();
        for(let k = 0; k < 90; k++){
          const a = Math.random() * TAU, b = Math.acos(2 * Math.random() - 1), sp = 5 + Math.random() * 4;
          c.pools.fire.spawn(cx, cy, cz, Math.sin(b) * Math.cos(a) * sp, Math.cos(b) * sp, Math.sin(b) * Math.sin(a) * sp, 1.5 + Math.random() * 0.7, col.r * 1.6, col.g * 1.6, col.b * 1.6);
        }
        SFX.boom();
      }
    }
    for(const k in c.pools) c.pools[k].step(dt, t);
    // lamps and crowd
    for(const b of c.beams){ const k = b.userData.k; b.rotation.z = Math.sin(t * 0.8 + k) * 0.35; b.rotation.x = Math.cos(t * 0.6 + k * 1.3) * 0.25; b.material.opacity = (c.night ? 0.13 : 0.06) * (0.6 + 0.4 * Math.sin(t * 2 + k)); }
    for(const l of c.lights) l.intensity = (c.night ? 2.6 : 1.1) * (0.8 + 0.2 * Math.sin(t * 5 + l.position.x));
    if(((c.frameN = (c.frameN || 0) + 1) & 1) === 0){
      const m = new THREE.Matrix4(), pos = V(0, 0, 0), q = new THREE.Quaternion(), sc1 = V(1, 1, 1), sc2 = V(1, 1, 1);
      const jump = seg(t, 3.5, 5) * (0.5 + 0.5 * Math.sin(t * 0.5));
      c.crowd.forEach((p, i) => {
        const j = Math.max(0, Math.sin(t * (4 + p.amp) + p.ph)) * 0.22 * p.amp * (0.3 + 0.7 * (t > 3 ? 1 : 0.4));
        pos.set(p.x, p.y + 0.35 + j, p.z); m.compose(pos, q, sc1); c.bodies.setMatrixAt(i, m);
        pos.set(p.x, p.y + 0.9 + j, p.z); m.compose(pos, q, sc2); c.heads.setMatrixAt(i, m);
      });
      c.bodies.instanceMatrix.needsUpdate = true; c.heads.instanceMatrix.needsUpdate = true;
    }
    // words
    const w = winner && winner.car;
    if(t < 3.4) this.caption("RACE WIN", S.track.name);
    else if(t < 6.0 && w) this.caption(w.drv.last.toUpperCase(), w.team.name + " · P1");
    else if(t < 11.5) this.caption("", "");
    else if(w) this.caption("WINNER", `${w.drv.last} · ${S.track.name}`);
  },
  confetti(c, n){
    const cols = [[1, 0.2, 0.2], [1, 0.8, 0.1], [0.2, 0.5, 1], [1, 1, 1], [0.2, 0.9, 0.5], [1, 0.4, 0.8]];
    for(let k = 0; k < n; k++){
      const sd = k % 2 ? 1 : -1, col = cols[(Math.random() * cols.length) | 0];
      c.pools.conf.spawn(sd * (6 + Math.random() * 2), 1.5, -1 + Math.random() * 3, -sd * (4 + Math.random() * 6), 9 + Math.random() * 8, (Math.random() - 0.5) * 7,
        6 + Math.random() * 3, col[0] * 1.3, col[1] * 1.3, col[2] * 1.3);
    }
  },
  podiumCam(G, S){
    const c = S.cine, t = c.t, cam = c.cam;
    const cv = G.cv, asp = (cv.clientWidth || 800) / (cv.clientHeight || 600);
    if(Math.abs(cam.aspect - asp) > 1e-3){ cam.aspect = asp; cam.updateProjectionMatrix(); }
    let pos, look, fov;
    if(t < 3.5){
      const k = ease(t / 3.5);
      pos = V(lerp(-10, -4, k), lerp(7.5, 2.6, k), lerp(19, 11.5, k)); look = V(0, lerp(2.4, 2.0, k), 0); fov = lerp(40, 34, k);
    } else if(t < 6.2){
      const k = (t - 3.5) / 2.7;
      pos = V(lerp(2.4, -0.6, k), lerp(0.7, 1.0, k), lerp(5.4, 4.6, k)); look = V(lerp(0.1, -0.1, k), 2.75, 0); fov = lerp(31, 27, k);
    } else if(t < 11.4){
      const k = (t - 6.2) / 5.2, a = lerp(-0.62, 0.55, ease(k)), r = lerp(9.5, 7.2, k);
      pos = V(Math.sin(a) * r, lerp(2.3, 3.2, k), Math.cos(a) * r); look = V(0, 2.4, 0); fov = lerp(38, 34, k);
    } else {
      const k = ease(seg(t, 11.4, 15.6));
      pos = V(lerp(3, 0, k), lerp(3.2, 8.5, k), lerp(10, 25, k)); look = V(0, lerp(3, 4.5, k), 0); fov = lerp(40, 46, k);
    }
    pos.add(this.shake(t, 0.01));
    this.setCam(cam, pos, look, fov);
    return cam;
  },
  podiumFrame(G, S){
    const c = S.cine;
    if(!c.scene) return;
    const cam = this.podiumCam(G, S);
    G.rend.toneMapping = THREE.ACESFilmicToneMapping;
    G.rend.toneMappingExposure = c.night ? 0.8 : 0.7;
    G.rend.outputEncoding = THREE.sRGBEncoding;
    G.rend.setRenderTarget(null);
    G.rend.render(c.scene, cam);
  },
  podiumCleanup(G, S){
    const c = S.cine; if(!c || !c.scene) return;
    for(const k in c.pools) c.pools[k].dispose();
    c.scene.traverse(o => { if(o.geometry) o.geometry.dispose(); if(o.material && !G.mats.has(o.material.name || "")){
      const ms = Array.isArray(o.material) ? o.material : [o.material]; for(const m of ms){ if(m.map && m.map.dispose) m.map.dispose(); } } });
    for(const t of c.tex || []) t.dispose();
    if(c.bg) c.bg.dispose();
    c.scene = null;
  },
});

export { CINE, SFX };
