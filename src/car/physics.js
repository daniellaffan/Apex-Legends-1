import { TAU, angWrap, clamp, lerp } from '../config/util.js';
import { PARTS, PART_KEYS, TYRES } from './parts.js';
import { bankZ } from '../tracks/shared.js';
import { spawn } from '../render2d/particles.js';
import { AUDIO } from '../legacy-rest.js';

/* ---------- 3. cars: physics --------------------------------------------- */
const LAUNCH_LO = 0.52, LAUNCH_HI = 0.74;          // the rev window for a clean getaway
const PIT_SPEED = 140 / 3.6;
const VMAX = 92, ENGINE = 15.2, DRAG = 0.00128, BRAKE = 40, GRIP = 38.5, STEER_AUTH = 2.55;
const SURF = { road:1, kerb:0.94, runoff:0.62, grass:0.48, sand:0.42, pit:1, tarmac:0.86, gravel:0.30, astro:0.60 };
const GRADE_G = 9.81 * 0.5;                      // gravity along a slope, at half strength

class Car {
  constructor(team, drv, idx, T){
    this.team = team; this.drv = drv; this.idx = idx; this.T = T;
    this.x = 0; this.y = 0; this.z = 0; this.h = 0; this.vx = 0; this.vy = 0;
    this.node = 0; this.lap = 0; this.s = 0; this.prog = 0; this.off = 0;
    this.steer = 0; this.thr = 0; this.brk = 0; this.hand = 0; this.boost = 0;
    this.batt = 1; this.tyre = TYRES.medium; this.life = 1; this.temp = 0.5;
    this.damage = 0; this.slide = 0; this.pitting = 0; this.pitReq = false; this.pitT = 0;
    this.broken = new Set(); this.perf = { grip:1, power:1, brake:1, top:1, boost:true, pull:0 };
    this.health = {}; for(const k of PART_KEYS) this.health[k] = 1;
    this.inPit = false; this.pitPlan = null; this.stopT = 0; this.stopTotal = 0; this.pitVisit = 0;
    this.momentT = 0; this.momentKind = null; this.retiredBy = null;
    this.revs = 0; this.launchMul = 1; this.launchT = 0; this.launchGrade = null;
    this.roll = 0; this.pitch = 0; this.rollV = 0; this.pitchV = 0;
    this.air = 0; this.airV = 0; this.spinV = 0; this.spinT = 0; this.wrecked = false;
    this.stops = 0; this.used = new Set(); this.finished = false; this.dnf = false;
    this.lapStart = null; this.best = null; this.last = null; this.laps = []; this.secBest = [null, null, null];
    this.secStart = 0; this.curSec = 0; this.secT = [null, null, null];
    this.ai = true; this.pace = 1; this.pos = idx + 1; this.gap = null; this.total = 0;
    this.aiOff = 0; this.aiTarget = 0; this.mistake = 0; this.kerbShake = 0; this.wallHit = 0;
  }
  /* ---------- crash dynamics ----------------------------------------------
     A wrecked car leaves the track model entirely and becomes a ballistic
     body: it tumbles, lands, bounces, and can clear the barriers.           */
  launch(imp, S){
    this.wrecked = true; this.spinT = 0;
    this.air = Math.max(this.air, 0.35);
    this.airV = clamp(imp * 0.26, 3.5, 12);
    this.rollV = (Math.random() < 0.5 ? -1 : 1) * (2.8 + Math.random() * 4.5);
    this.pitchV = (Math.random() - 0.5) * 3.4;
    this.spinV = (Math.random() - 0.5) * 7;
    const sp = Math.hypot(this.vx, this.vy);
    if(sp > 2){ this.vx *= 0.7; this.vy *= 0.7; }
    if(S) for(let k = 0; k < 22; k++)
      spawn(this.x, this.y, this.z + 0.4, (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16,
            2 + Math.random() * 9, 0.7 + Math.random() * 1.2,
            k % 3 ? "#8A9199" : "#FFC46B", 0.28, k % 3 ? "spark" : "smoke");
  }
  wreckStep(dt, S){
    const T = this.T;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.air += this.airV * dt;
    this.airV -= 17 * dt;
    this.h += this.spinV * dt;
    this.roll += this.rollV * dt;
    this.pitch += this.pitchV * dt;
    if(this.air <= 0){
      this.air = 0;
      if(this.airV < -2.5){
        this.airV = -this.airV * 0.34;                    // bounce
        this.rollV *= 0.55; this.pitchV *= 0.45; this.spinV *= 0.7;
        this.vx *= 0.72; this.vy *= 0.72;
        for(let k = 0; k < 8; k++)
          spawn(this.x, this.y, this.z + 0.2, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9,
                1.5 + Math.random() * 4, 0.6, k % 2 ? "#FFC46B" : "#9AA0A7", 0.3, k % 2 ? "spark" : "smoke");
        if(this === S.player) S.shake = Math.min(1, S.shake + 0.5);
      } else this.airV = 0;
      const k2 = Math.pow(0.22, dt);
      this.vx *= k2; this.vy *= k2;
      this.spinV *= Math.pow(0.25, dt);
      this.rollV *= Math.pow(0.2, dt);
      this.pitchV *= Math.pow(0.2, dt);
    }
    this.node = T.near(this.x, this.y, this.node);
    const i = this.node;
    const dx = this.x - T.x[i], dy = this.y - T.y[i];
    this.off = dx * T.nx[i] + dy * T.ny[i];
    this.s = T.s[i] + (dx * T.tx[i] + dy * T.ty[i]);
    this.z = this.roadZ(i, dx * T.tx[i] + dy * T.ty[i]) + this.air;
    this.slide = 0;
    if(this.air === 0 && Math.hypot(this.vx, this.vy) < 1.2 && Math.abs(this.rollV) < 0.5){
      this.wrecked = false;                                // come to rest, on wheels or roof
      this.roll = Math.round(this.roll / Math.PI) * Math.PI;
      this.pitch *= 0.2; this.rollV = this.pitchV = this.spinV = 0;
      this.vx = this.vy = 0;
    }
  }
  scuff(S, imp){
    if(!S.marks) S.marks = [];
    if(S.marks.length > 90) S.marks.shift();
    S.marks.push({ x:this.x, y:this.y, z:this.z, a:this.h,
                   w:clamp(imp * 0.22, 1.4, 6), o:clamp(imp / 34, 0.12, 0.55) });
  }
  recalcPerf(){
    const p = { grip:1, power:1, brake:1, top:1, boost:true, pull:0 };
    for(const k of this.broken){
      const d = PARTS[k]; if(!d) continue;
      if(d.grip) p.grip *= d.grip;
      if(d.power) p.power *= d.power;
      if(d.brake) p.brake *= d.brake;
      if(d.top) p.top *= d.top;
      if(d.noBoost) p.boost = false;
      if(d.pull) p.pull += (this.idx % 2 ? 1 : -1) * 0.14;
    }
    this.perf = p;
  }
  breakPart(where, S, exact){
    let k;
    if(exact){ k = where; if(this.broken.has(k)) return null; }
    else {
      // pick something that has not already gone, biased by where the hit landed
      const pool = PART_KEYS.filter(k2 => !this.broken.has(k2) &&
        (where === "any" || PARTS[k2].where === "any" || PARTS[k2].where === where));
      const list = pool.length ? pool : PART_KEYS.filter(k2 => !this.broken.has(k2));
      if(!list.length) return null;
      k = list[(Math.random() * list.length) | 0];
    }
    this.health[k] = 0;
    this.broken.add(k); this.recalcPerf();
    if(PARTS[k].tyre) this.life = Math.min(this.life, 0.08);
    if(S){
      try{ AUDIO.event("fail", this, S, PARTS[k].name); }catch(e){}
      if(!this.ai) S.toast(PARTS[k].name + " damaged — box for repairs");
      else if(S.player && Math.abs(this.pos - S.player.pos) <= 3) S.toast(this.drv.last + ": " + PARTS[k].name.toLowerCase() + " trouble");
    }
    return k;
  }
  hurt(imp, where, S){
    if(this.dnf || !S || !S.damage) return;
    this.damage = clamp(this.damage + Math.pow(clamp(imp / 30, 0, 1.3), 1.7) * 0.32, 0, 1);
    if(imp > 30 || this.damage >= 0.995){ this.launch(imp, S); this.retire(S, "Heavy crash"); return; }
    // wear the components on the side that took the hit
    for(const k of PART_KEYS){
      if(this.broken.has(k)) continue;
      const P = PARTS[k];
      const aim = (P.where === where) ? 1.0 : (P.where === "any" ? 0.45 : 0.18);
      if(aim <= 0) continue;
      this.health[k] = clamp(this.health[k] - Math.pow(clamp(imp / 30, 0, 1.2), 2) * aim * (0.35 + Math.random() * 0.5), 0, 1);
      if(this.health[k] <= 0.001) this.breakPart(k, S, true);
    }
    const chance = clamp((imp - 5) / 34, 0, 0.9) * (0.30 + this.damage * 0.9) * 0.45;
    if(Math.random() < chance) this.breakPart(where, S);
  }
  retire(S, why){
    if(this.dnf) return;
    this.dnf = true; this.retiredBy = why || "Retired"; this.thr = 0; this.brk = 1;
    this.vx = this.vy = 0; this.railV = 0;
    if(typeof spawn === "function") for(let k = 0; k < 16; k++)
      spawn(this.x, this.y, this.z + 0.5, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12,
            2 + Math.random() * 6, 0.9 + Math.random(), k % 3 ? "#6E7681" : "#FFB86B", 0.5, "smoke");
    try{ AUDIO.event("out", this, S); if(this === S.player) setTimeout(() => AUDIO.silence(), 900); }catch(e){}
    if(this === S.player){
      S.toast("RETIRED — " + this.retiredBy);
      S.crashCam = this.wrecked ? 7.5 : 2.2;          // watch it come to rest first
    }
    else S.toast(this.drv.last + " is out — " + this.retiredBy.toLowerCase());
  }
  place(node, lateral){
    const T = this.T, i = ((node % T.n) + T.n) % T.n;
    this.x = T.x[i] + T.nx[i] * lateral; this.y = T.y[i] + T.ny[i] * lateral;
    this.z = T.z[i]; this.h = T.ang[i]; this.node = i; this.vx = this.vy = 0;
    this.railS = T.s[i]; this.railV = 0; this.s = T.s[i]; this.off = lateral;
  }
  get speed(){ return Math.hypot(this.vx, this.vy); }
  /* The ribbon is straight between nodes, so the road height under the car is a
     straight line too. Snapping to the nearest node instead made the car jump a
     whole step at every half-way point, which on a real climb is most of a metre. */
  roadZ(i, along){
    const T = this.T, n = T.n, j = (i + (along >= 0 ? 1 : n - 1)) % n, f = Math.min(Math.abs(along) / T.ds, 1);
    return T.z[i] + (T.z[j] - T.z[i]) * f;
  }
  roadCamber(i, along){
    const T = this.T, n = T.n, j = (i + (along >= 0 ? 1 : n - 1)) % n, f = Math.min(Math.abs(along) / T.ds, 1);
    return T.camber[i] + (T.camber[j] - T.camber[i]) * f;
  }

  surface(){
    const T = this.T, a = Math.abs(this.off);
    if(this.pitting) return SURF.pit;
    if((this.pitReq || this.pitting) && T.inPitLane(this.node, this.off)) return SURF.pit;
    if(a < T.half - 0.4) return SURF.road;
    if(a < T.half + 1.6) return SURF.kerb;
    if(T.surfAt){ const k = T.surfAt(this.node, this.off);
      return k === "asphalt" ? SURF.tarmac : k === "gravel" ? SURF.gravel : k === "astro" ? SURF.astro : SURF.grass; }
    const ro = T.roAt(this.node, this.off);
    if(ro > 0 && a < T.half + ro) return T.pal.ground === "#D6C79E" || T.id === "baku" ? SURF.sand : SURF.runoff;
    // on a street circuit there is nothing beyond the run-off but the wall, so
    // the last strip stays as grippy as the road — except in a real escape road,
    // where the dusty asphalt keeps its penalty right up to the TecPro
    if(T.barrier === "wall") return ro > 4 ? SURF.runoff : SURF.road;
    return SURF.grass;
  }

  step(dt, S){
    const T = this.T;
    if(this.dnf && !this.wrecked) return;
    if(S.damage && !this.pitting){
      const risk = (0.00005 + this.damage * 0.0011 + (this.life < 0.12 ? 0.0004 : 0)) * dt;
      if(Math.random() < risk) this.breakPart("any", S);
    }
    this.slowT = this.speed < 10 ? (this.slowT || 0) + dt : 0;
    this.stalled = this.slowT > 1.2 && !this.pitting;
    // ---- pit lane is driven on rails; the stop itself is the drama ----
    if(this.pitting){ this.pitStep(dt, S); return; }
    if(this.wrecked){ this.wreckStep(dt, S); return; }
    if(this.ai && this.spinT <= 0){ this.aiStep(dt, S); return; }

    const fx = Math.cos(this.h), fy = Math.sin(this.h), rx = -fy, ry = fx;
    let vf = this.vx * fx + this.vy * fy, vs = this.vx * rx + this.vy * ry;

    const surf = this.surface();
    const wetK = S.wet > 0 ? lerp(1, this.tyre.key === "wet" ? 0.93 : 0.68, S.wet) : 1;
    const tyreGrip = this.tyre.grip * (0.80 + 0.20 * clamp(this.life * 1.15, 0, 1)) *
                     (this.life < 0.12 ? 0.86 : 1) * lerp(0.93, 1, clamp(this.temp, 0, 1));
    const g = GRIP * surf * wetK * tyreGrip * (1 - this.damage * 0.22) * this.pace * this.perf.grip;
    const boosting = this.boost > 0 && this.batt > 0.01 && vf > 8 && this.perf.boost;
    const vmax = VMAX * (boosting ? 1.055 : 1) * this.pace * this.perf.top;

    // longitudinal
    const eng = ENGINE * (boosting ? 1.10 : 1) * (1 - this.damage * 0.18) * surf * this.pace * this.perf.power * this.launchMul;
    if(this.launchT > 0){
      this.launchT -= dt;
      if(this.launchT <= 0) this.launchMul = 1;
      else if(this.launchGrade === "spin" && this.thr > 0 && Math.abs(vf) < 45 && Math.random() < dt * 40)
        spawn(this.x - Math.cos(this.h) * 1.6, this.y - Math.sin(this.h) * 1.6, this.z + 0.2,
              (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, 0.6, 0.7, "#C6CBD1", 0.5, "smoke");
    }
    let af = this.thr * eng * Math.min(1, 0.55 + Math.abs(vf) / 25);
    if(this.inPit && vf > PIT_SPEED) af = Math.min(af, -26);      // pit lane speed limiter
    af -= this.brk * BRAKE * this.perf.brake * surf * wetK * (vf > 0.4 ? 1 : 0);
    if(this.brk > 0 && vf <= 0.4 && vf > -11) af -= this.brk * eng * 0.5;          // reverse
    // gravel digs in, and harder the faster you arrive, but a car can still crawl out of it
    const gravel = surf === SURF.gravel;
    af -= Math.sign(vf) * (DRAG * vf * vf) + vf * 0.035 + (surf < 0.72 ? Math.sign(vf) * (gravel ? 1.4 : 6.5) : 0)
      + (gravel ? Math.sign(vf) * clamp((Math.abs(vf) - 5) / 6, 0, 1) * (9 + Math.abs(vf) * 0.32) : 0);
    // the hill: gravity along the road, at half strength so it is felt without
    // rebalancing the field — slower up Beau Rivage, quicker down to the hairpin
    af -= GRADE_G * T.grade(this.node) * Math.cos(this.h - T.ang[this.node]);
    vf += af * dt;
    if(vf > vmax) vf = lerp(vf, vmax, 1 - Math.pow(0.02, dt));
    if(this.inPit && vf > PIT_SPEED) vf = Math.max(PIT_SPEED, vf - 30 * dt);
    if(this.thr === 0 && this.brk === 0 && Math.abs(vf) < 0.35) vf = 0;

    // yaw + lateral friction
    const spd = Math.hypot(vf, vs);
    let auth = Math.min(STEER_AUTH, 1.06 * g / Math.max(spd, 7)) *
               clamp(spd / 4.5, 0, 1) * (1 - clamp(Math.abs(vs) / 26, 0, 0.28)) * (vf < 0 ? -1 : 1);
    // catching a slide should work: countersteer gets extra authority
    if(vs !== 0 && Math.sign(this.steer) === Math.sign(vs)) auth *= 1 + clamp(Math.abs(vs) / 10, 0, 0.35);
    const yaw = (this.steer + this.perf.pull) * auth * (1 - this.hand * 0.25);
    this.h += yaw * dt;
    vs += -vf * yaw * dt;
    const latMax = g * (1 - this.hand * 0.62) * dt;
    if(Math.abs(vs) <= latMax) vs = 0; else vs -= Math.sign(vs) * latMax;
    vf -= Math.abs(vs) * 0.28 * dt;
    this.slide = lerp(this.slide, clamp(Math.abs(vs) / 9, 0, 1), 0.2);
    // lose the back end badly enough and the car spins
    if(this.spinT <= 0 && Math.abs(vs) > 10.5 && Math.abs(vf) > 16 && !this.dnf){
      this.spinT = 1.1 + Math.random() * 0.9;
      this.spinV = -Math.sign(vs) * (2.0 + Math.random() * 1.8);
      if(this === S.player) S.shake = Math.min(1, S.shake + 0.35);
    }
    if(this.spinT > 0){
      this.spinT -= dt;
      this.h += this.spinV * dt;
      this.spinV *= Math.pow(0.42, dt);
      this.pitch = lerp(this.pitch, 0, dt * 3);
      if(this.ai){ this.thr = 0; this.brk = 0.75; this.steer = 0; }
      if(Math.abs(vf) > 8 && Math.random() < dt * 30)
        spawn(this.x, this.y, this.z + 0.15, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6,
              0.8, 0.9, "#B9BEC4", 0.55, "smoke");
      if(this.spinT <= 0 && this.ai){ this.railV = Math.hypot(this.vx, this.vy); this.railS = null; }
    }
    // body leans under load, and settles when it is not
    this.roll = lerp(this.roll, clamp(-vs * 0.012, -0.11, 0.11), dt * 6);
    this.pitch = lerp(this.pitch, clamp((this.brk * 0.05 - this.thr * 0.025), -0.05, 0.06), dt * 5);

    // rebuild in the NEW heading's frame, so the velocity actually turns with the car
    const nfx = Math.cos(this.h), nfy = Math.sin(this.h);
    this.vx = nfx * vf - nfy * vs; this.vy = nfy * vf + nfx * vs;
    this.x += this.vx * dt; this.y += this.vy * dt;

    // ---- track frame ----
    this.node = T.near(this.x, this.y, this.node);
    const i = this.node;
    const dx = this.x - T.x[i], dy = this.y - T.y[i];
    this.off = dx * T.nx[i] + dy * T.ny[i];
    const along = dx * T.tx[i] + dy * T.ty[i];
    this.s = T.s[i] + along;
    this.z = this.roadZ(i, along) + bankZ(T, i, this.off) + this.off * this.roadCamber(i, along);

    this.inPit = (this.pitReq || this.pitting) && T.inPitLane(i, this.off);
    // committed: the pit wall stops you rejoining until the lane merges back
    if(this.inPit && !this.ai && T.pitRamp(i) > 0.35){
      const sg = T.pitSide, innerEdge = T.half - 0.2;
      if(this.off * sg < innerEdge){
        const push = (innerEdge - this.off * sg) * sg;
        this.x += T.nx[i] * push; this.y += T.ny[i] * push; this.off += push;
        const into = this.vx * T.nx[i] * sg + this.vy * T.ny[i] * sg;
        if(into < 0){ this.vx -= T.nx[i] * sg * into * 1.3; this.vy -= T.ny[i] * sg * into * 1.3; }
      }
    }
    // barriers
    const onPitSide = Math.sign(this.off) === T.pitSide;
    const pitExtra = (onPitSide && (this.pitReq || this.pitting)) ? T.pitW * T.pitRamp(i) : 0;
    const roHere = T.roAt(i, this.off);
    const saferHere = T.safer && T.safer(i, Math.sign(this.off) || 1);
    const limit = T.half + pitExtra + (pitExtra > 0.2 ? 1.0 : (T.barrier === "wall" ? roHere + 0.9 : saferHere ? roHere + 1.7 : roHere + 3));
    if(Math.abs(this.off) > limit){
      const push = (Math.abs(this.off) - limit) * Math.sign(this.off);
      this.x -= T.nx[i] * push; this.y -= T.ny[i] * push; this.off -= push;
      const into = this.vx * T.nx[i] * Math.sign(this.off) + this.vy * T.ny[i] * Math.sign(this.off);
      if(into > 0){
        const sg = Math.sign(this.off);
        const rest = clamp(0.35 + into * 0.012, 0.35, 0.75);       // it bounces, it does not stick
        this.vx -= T.nx[i] * sg * into * (1 + rest);
        this.vy -= T.ny[i] * sg * into * (1 + rest);
        this.vx *= 0.86; this.vy *= 0.86;
        if(into > 3){
          this.scuff(S, into);
          for(let k = 0; k < Math.min(14, 2 + into | 0); k++)
            spawn(this.x, this.y, this.z + 0.25 + Math.random() * 0.4,
                  -T.nx[i] * sg * (3 + Math.random() * 9) + (Math.random() - 0.5) * 6,
                  -T.ny[i] * sg * (3 + Math.random() * 9) + (Math.random() - 0.5) * 6,
                  2 + Math.random() * 6, 0.35 + Math.random() * 0.4,
                  k % 4 ? "#FFC46B" : "#C9CED4", 0.22, "spark");
          // a glancing blow kicks the car sideways and can spin it
          if(into > 8 && this.spinT <= 0 && !this.wrecked){
            this.spinT = 0.8 + Math.random() * 0.9;
            this.spinV = sg * (1.4 + into * 0.09) * (Math.random() < 0.5 ? -1 : 1);
          }
        }
        if(into > 6) this.hurt(into, Math.abs(this.off) > T.half ? "side" : "front", S);
        this.wallHit = 1; if(!this.ai) S.shake = Math.min(1, S.shake + into * 0.03);
      }
    }
    // kerb rattle
    this.kerbShake = surf === SURF.kerb ? 1 : Math.max(0, this.kerbShake - dt * 4);

    // battery + tyres
    if(boosting) this.batt = clamp(this.batt - dt * 0.30, 0, 1);
    else this.batt = clamp(this.batt + dt * (this.brk > 0.2 ? 0.20 : 0.035), 0, 1);
    const load = Math.abs(vs) * 0.00055 + Math.abs(yaw) * Math.abs(vf) * 0.00005 + 0.00042 + this.brk * 0.00055;
    this.life = clamp(this.life - load * this.tyre.wear * S.wearMul * dt * 0.34, 0, 1);
    this.temp = clamp(this.temp + (Math.abs(vs) * 0.02 + Math.abs(vf) * 0.004 - (this.temp - 0.35) * 0.55) * dt, 0, 1.2);
  }

  /* Rivals follow the line with real speed dynamics: they brake, accelerate and
     wear tyres like the player's car, but they cannot spin themselves off the road.
     Contact displaces them bodily — the next frame re-reads position, so a hit
     genuinely knocks them off line and they have to work their way back. */
  aiStep(dt, S){
    const T = this.T;
    const i = this.node = T.near(this.x, this.y, this.node);
    const dx = this.x - T.x[i], dy = this.y - T.y[i];
    let off = dx * T.nx[i] + dy * T.ny[i];
    const derived = T.s[i] + (dx * T.tx[i] + dy * T.ty[i]);
    /* A rail follower knows its own lane. Measuring it back from the position
       is fine on a straight, but on the inside of a tight corner the nearest
       node's normal is nowhere near the right direction, the error feeds into
       the next frame's position, and the car spirals to the edge. So if we are
       where the rail says we are, keep the lane we had; only re-measure after
       something (a contact, a spin) has moved us. */
    if(this.railOff != null && this.railS != null){
      const f0 = this.railS / T.ds, j0 = ((Math.floor(f0) % T.n) + T.n) % T.n, k0 = (j0 + 1) % T.n, u0 = f0 - Math.floor(f0);
      const px = lerp(T.x[j0], T.x[k0], u0) + lerp(T.nx[j0], T.nx[k0], u0) * this.railOff;
      const py = lerp(T.y[j0], T.y[k0], u0) + lerp(T.ny[j0], T.ny[k0], u0) * this.railOff;
      if(Math.hypot(this.x - px, this.y - py) < 0.8) off = this.railOff;
    }
    // keep our own arc-length, but resync whenever contact has shoved us somewhere else
    let s = this.railS;
    if(s == null || Math.abs(angWrap((derived - s) / T.length * TAU)) > 0.004 * TAU) s = derived;

    // longitudinal
    let v = this.railV != null ? this.railV : this.speed;
    const vt = this.aiTargetV != null ? this.aiTargetV : v;
    if(vt > v){
      // the same pull of the hill as the player feels, on the way up to speed
      const accCap = Math.max(1.4, ENGINE * this.pace * this.perf.power * (this.boost > 0 && this.batt > 0.02 && this.perf.boost ? 1.10 : 1) *
        (1 - this.damage * 0.20) * Math.min(1, 0.55 + v / 25) - DRAG * v * v - v * 0.035 - GRADE_G * T.grade(i));
      v = Math.min(vt, v + Math.min(accCap, (vt - v) * 3.2) * dt);
      this.brk = 0; this.thr = 1;
    } else {
      const decCap = BRAKE * 0.92 * this.perf.brake * (S.wet > 0 ? lerp(1, 0.78, S.wet) : 1);
      v = Math.max(1.2, v - Math.min(decCap, (v - vt) * 3.4) * dt);
      this.brk = clamp((this.railV - v) / (decCap * dt || 1), 0, 1); this.thr = 0;
    }
    this.railV = v;

    // lateral: ease onto the intended line, but no faster than a car can change direction
    const want = this.aiWant != null ? this.aiWant : T.line[i];
    const latRate = clamp(6.5 + v * 0.06, 4, 13);
    const dOff = clamp(want - off, -latRate * dt, latRate * dt);
    off += dOff;
    off = clamp(off, -(T.half + T.roL[i] * 0.7 + 0.6), T.half + T.roR[i] * 0.7 + 0.6);
    if(Math.abs(off) > T.half + 1.0) v *= 1 - 0.30 * dt;        // off the road costs real time

    // advance along the ribbon, interpolating between nodes
    s = (s + v * dt) % T.length; if(s < 0) s += T.length;
    this.railS = s;
    const f = s / T.ds, j = ((Math.floor(f) % T.n) + T.n) % T.n, k = (j + 1) % T.n, u = f - Math.floor(f);
    this.node = j;
    const cx = lerp(T.x[j], T.x[k], u), cy = lerp(T.y[j], T.y[k], u);
    const nxi = lerp(T.nx[j], T.nx[k], u), nyi = lerp(T.ny[j], T.ny[k], u);
    this.x = cx + nxi * off;
    this.y = cy + nyi * off;
    this.z = lerp(T.z[j], T.z[k], u) + off * T.camber[j];
    this.off = off; this.railOff = off;
    this.s = s;
    // the nose follows the smoothed sideways speed, not the raw step: at a
    // standstill a tiny shuffle sideways used to swing the heading by tens of degrees
    this.latV = lerp(this.latV || 0, dOff / Math.max(dt, 0.001), 1 - Math.exp(-dt * 9));
    const steerAng = Math.atan2(this.latV, Math.max(v, 8)) * 0.6;
    this.h = T.ang[j] + angWrap(T.ang[k] - T.ang[j]) * u + clamp(steerAng, -0.4, 0.4);
    this.vx = Math.cos(this.h) * v; this.vy = Math.sin(this.h) * v;

    // wear, heat, battery — driven by how hard the corner is
    const lat = Math.abs(T.lcurv[j]) * v * v;
    this.slide = lerp(this.slide, clamp(lat / (GRIP * 1.05) - 0.72, 0, 1), 0.18);
    this.kerbShake = Math.abs(off) > T.half - 0.8 ? 1 : Math.max(0, this.kerbShake - dt * 4);
    if(this.boost > 0 && this.batt > 0.01) this.batt = clamp(this.batt - dt * 0.30, 0, 1);
    else this.batt = clamp(this.batt + dt * (this.brk > 0.2 ? 0.20 : 0.035), 0, 1);
    const load = lat * 0.00004 + 0.00042 + this.brk * 0.00055;
    this.life = clamp(this.life - load * this.tyre.wear * S.wearMul * dt * 0.34, 0, 1);
    this.temp = clamp(this.temp + (lat * 0.0016 + v * 0.004 - (this.temp - 0.35) * 0.55) * dt, 0, 1.2);
  }

  pitStep(dt, S){
    const T = this.T, i = this.node;
    // rails: advance along the pit lane, hold the box, then rejoin
    if(this.pitV == null) this.pitV = clamp(this.speed || 22, 22, 90);
    if(this.pitS == null) this.pitS = i;
    let bd = ((T.pitBox - this.pitS) % T.n + T.n) % T.n;
    const boxDist = (bd > T.n / 2 ? 0 : bd) * T.ds;        // metres to the service box, 0 once past it
    let v = this.pitV;
    if(this.pitT > 0){ v = this.pitV = 0; this.pitT -= dt;
      if(this.pitT <= 0){ this.tyre = this.nextTyre || TYRES.medium; this.used.add(this.tyre.key);
        this.life = 1; this.temp = 0.45; this.stops++; if(!this.ai) S.toast((this.repaired && this.repaired.length ? this.repaired.join(" + ") + " replaced · " : this.tyre.name + " tyres · ") + this.pitStopTime.toFixed(1) + "s");
        this.repaired = null; } }
    else if(this.pitDone){                                    // released: pull away up to the limiter
      this.pitV = v = Math.min(22, this.pitV + 15 * dt);
    }
    else if(boxDist < 0.3){
      this.pitDone = true;
      try{ AUDIO.event("pitstop", this, S); }catch(e){}
      let extra = 0, fixed = [];
      for(const k of this.broken){ if(PARTS[k].tyre){ fixed.push(k); continue; }
        extra += PARTS[k].fix; fixed.push(k); }
      this.repaired = fixed.map(k => PARTS[k].name);
      this.broken.clear(); this.recalcPerf();
      this.damage = Math.max(0, this.damage - 0.5);
      this.pitStopTime = 2.1 + Math.random() * 1.4 + (this.ai ? Math.random() * 0.6 : 0) + extra;
      this.pitT = this.pitStopTime; v = this.pitV = 0;
    }
    else {                                                    // rolling up to the box: limiter, then brake to stop on the mark
      const target = Math.min(22, Math.max(1.4, Math.sqrt(2 * 9 * boxDist)));
      this.pitV = v = this.pitV > target ? Math.max(target, this.pitV - 30 * dt) : Math.min(target, this.pitV + 12 * dt);
    }
    this.pitS = (this.pitS == null ? i : this.pitS) + (v * dt) / T.ds;
    const f = this.pitS, j = ((Math.floor(f) % T.n) + T.n) % T.n, k2 = (j + 1) % T.n, u = f - Math.floor(f);
    this.node = j;
    const lat = T.pitCentre(j);
    this.x = lerp(T.x[j], T.x[k2], u) + lerp(T.nx[j], T.nx[k2], u) * lat;
    this.y = lerp(T.y[j], T.y[k2], u) + lerp(T.ny[j], T.ny[k2], u) * lat;
    this.z = lerp(T.z[j], T.z[k2], u);
    this.h = T.ang[j] + angWrap(T.ang[k2] - T.ang[j]) * u;
    this.off = lat; this.s = T.s[j]; this.inPit = true;
    this.vx = Math.cos(this.h) * v; this.vy = Math.sin(this.h) * v;
    if(this.pitT <= 0 && this.pitDone && T.pitRamp(j) <= 0.04){
      this.pitting = 0; this.pitDone = false; this.pitS = null; this.pitV = null; this.pitReq = false; this.inPit = false;
    }
  }
}

export { Car, LAUNCH_HI, LAUNCH_LO };
