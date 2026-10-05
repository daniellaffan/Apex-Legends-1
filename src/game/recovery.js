import { clamp } from '../config/util.js';
import { planTruck } from '../render3d/recovery.js';

/* ---------- wreck recovery ----------
   An AI car that stops on the circuit (a crash or a failure) stays exactly where it came to rest until it is
   recovered: marshals run out with yellow flags, a recovery truck drives up and parks beside it, its crane lifts the
   car onto the bed, the truck drives off with it, and the marshals sweep the debris. Only then is the track clear.
   A random "debris" call is a job of its own: just the sweeping.
   This is the game side (pure numbers, run on the race clock, Node-testable). It says where the truck is (game x, y,
   heading) and which phase each job is in; render3d/wreckrecovery.js draws it. The wreck and the parked truck are
   obstacles: the AI steers round them, the safety car dodges them and anyone who drives into them stops.  */

const CAR_PHASES = [["flags", 4], ["arrive", 6], ["lift", 7.4], ["away", 6], ["sweep", 8]];
const DEBRIS_PHASES = [["flags", 3], ["sweep", 18]];
const DRIVE = 45;                    // metres the truck covers coming in and going away
const CAR_R = 1.7;                   // a wreck, as a circle
const TRUCK_R = 2.0, TRUCK_X = [-3.1, 0.6, 4.3];   // the parked truck: three circles along its length (truck-local x)

function rec(S){ return S.recov || (S.recov = { jobs:[], n:0, obsT:-1, obs:[] }); }

/* metres from a ground point (game x, y) to the barrier, the way the cutscene measures it, and its offset */
function roomAt(T, x, y, hint){
  const i = T.near(x, y, hint), off = (x - T.x[i]) * T.nx[i] + (y - T.y[i]) * T.ny[i];
  return { room:T.half + T.roAt(i, off) + 2.6 - 1.0 - Math.abs(off), off, i };
}

/* where the truck parks: off the road if there is room for it there, otherwise wherever it fits */
function planFor(T, c){
  const yaw = c.h, node = c.node, tang = Math.atan2(T.ty[node], T.tx[node]);
  const car = { x:c.x, z:c.y, yaw };
  const offRoad = (x, z) => { const r = roomAt(T, x, z, node); return Math.min(r.room, Math.abs(r.off) - (T.half + 0.8)); };
  let p = planTruck(car, tang, offRoad);
  if(!(p.score < 1e8) || p.room < 0) p = planTruck(car, tang, (x, z) => roomAt(T, x, z, node).room);
  return { x:p.x, y:p.z, h:p.h };
}

function addJob(S, c){
  const R = rec(S), T = S.track;
  if(c.recJob) return c.recJob;
  const j = { id:++R.n, car:c, x:c.x, y:c.y, node:c.node, off:c.off, s:c.s, side:Math.sign(c.off) || 1,
              phases:CAR_PHASES, phase:"flags", pi:0, pt:0, t:0, done:false, plan:planFor(T, c), truck:null };
  c.recJob = j;
  R.jobs.push(j);
  return j;
}
function addDebris(S, node, off){
  const R = rec(S), T = S.track; node = ((node % T.n) + T.n) % T.n;
  const j = { id:++R.n, car:null, x:T.x[node] + T.nx[node] * off, y:T.y[node] + T.ny[node] * off, node, off, s:T.s[node],
              side:Math.sign(off) || 1, phases:DEBRIS_PHASES, phase:"flags", pi:0, pt:0, t:0, done:false, plan:null, truck:null,
              seed:(R.n * 7919) % 1000 };
  R.jobs.push(j);
  return j;
}

/* the truck's pose (game x, y, heading) for this job right now, or null when it is not on the scene */
function truckPose(j){
  if(!j.plan) return null;
  const P = j.plan, fx = Math.cos(P.h), fy = Math.sin(P.h);
  let d;
  if(j.phase === "arrive"){ const k = clamp(j.pt / 6, 0, 1); d = -DRIVE * (1 - (1 - (1 - k) * (1 - k))); }  // eases in
  else if(j.phase === "lift") d = 0;
  else if(j.phase === "away"){ const k = clamp(j.pt / 6, 0, 1); d = DRIVE * k * k; }
  else return null;
  return { x:P.x + fx * d, y:P.y + fy * d, h:P.h, moving:j.phase !== "lift", d };
}

function tick(S, dt){
  const R = S.recov; if(!R || !R.jobs.length) return;
  for(const j of R.jobs){
    if(j.done) continue;
    j.t += dt; j.pt += dt;
    while(!j.done && j.pt >= j.phases[j.pi][1]){
      j.pt -= j.phases[j.pi][1]; j.pi++;
      if(j.car && j.phases[j.pi - 1][0] === "lift") j.car.recovering = true;         // on the bed: no longer where it stopped
      if(j.car && j.phases[j.pi - 1][0] === "away") j.car.recovered = true;          // gone
      if(j.pi >= j.phases.length){ j.done = true; j.phase = "done"; if(j.car) j.car.recovered = true; }
      else j.phase = j.phases[j.pi][0];
    }
    if(j.car && j.phase === "lift" && j.pt > 2.2) j.car.recovering = true;            // the crane has it off the ground
    j.truck = truckPose(j);
  }
}

const clear = S => !S.recov || S.recov.jobs.every(j => j.done);
const pending = S => S.recov ? S.recov.jobs.filter(j => !j.done).length : 0;

/* everything a car must not drive through, as circles with their track position: { x, y, r, s, off, node } */
function obstacles(S){
  const R = rec(S);
  if(!R.jobs.length && !S.cars.some(c => c.dnf && c.ai)) return [];
  if(R.obsT === S.clock) return R.obs;
  const T = S.track, out = [];
  const add = (x, y, r, hint) => {
    const i = T.near(x, y, hint), off = (x - T.x[i]) * T.nx[i] + (y - T.y[i]) * T.ny[i];
    if(Math.abs(off) > T.half + 2.2 + r) return;              // well out on the run-off: nobody is near it
    out.push({ x, y, r, s:T.s[i] + (x - T.x[i]) * T.tx[i] + (y - T.y[i]) * T.ty[i], off, node:i,
               stalled:true, dnf:false, pitting:0, speed:0, pace:1, life:1, damage:0, lungeSide:0, defMove:null,
               drv:{ skill:1, aggr:0, last:"the wreck", abbr:"--" } });
  };
  // every car that is out and still on the circuit, the moment it is out (still tumbling, too)
  for(const c of S.cars) if(c.dnf && !c.recovering && !c.recovered && !c.pitting && !c.inPit && c.ai) add(c.x, c.y, CAR_R, c.node);
  for(const j of R.jobs){
    if(j.done) continue;
    const tp = j.truck;
    if(tp && !tp.moving){
      const fx = Math.cos(tp.h), fy = Math.sin(tp.h);
      for(const lx of TRUCK_X) add(tp.x + fx * lx, tp.y + fy * lx, TRUCK_R, j.node);
    }
  }
  R.obsT = S.clock; R.obs = out;
  return out;
}

export { addDebris, addJob, clear, obstacles, pending, planFor, roomAt, tick, truckPose, CAR_PHASES, DEBRIS_PHASES, DRIVE };
