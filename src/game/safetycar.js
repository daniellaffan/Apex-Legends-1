import { angWrap, clamp, lerp } from '../config/util.js';
import { CFG } from '../config/settings.js';
import { TYRES } from '../car/parts.js';
import { AUDIO } from '../audio/audio.js';
import { showMsg } from '../ui/screens.js';
import { issue, notify } from './penalties.js';

/* ---------- the safety car ----------
   off → out (deployed: the field slows, bunches up behind it, no overtaking, the pit lane is cheap)
       → in  (lights off, it leads the field to the pit entry and goes in; the leader sets the pace)
       → off (green flag when the leader crosses the line).
   It is a rail follower of its own, not a Car: it sits outside S.cars, so it is in no result, no classification and no contact.
   Triggers: a car stopped on the track, or a random "debris" call (likelier in heavy rain). Only with two or more laps still to run. */

const PIT_V = 22;

function init(S){
  const on = CFG.sc !== 0 && S.mode === "race" && S.laps >= 3;
  const heavy = S.wetTarget > 0.6;
  S.sc = { state:"off", car:null, on, lapsLeft:0, leaderLap:0, reason:"", count:0, cool:0, t:0, prev:new Map(), passCool:-99,
           plan: on && Math.random() < (heavy ? 0.75 : 0.45)
             ? { lap:1 + Math.floor(Math.random() * Math.max(1, S.laps - 2)), frac:0.15 + Math.random() * 0.75 } : null };
}
const active = S => !!(S && S.sc && S.sc.state !== "off");
/* the car, while it is on the track (not in the pit lane) */
const onTrack = S => (S.sc && S.sc.car && !S.sc.car.inLane) ? S.sc.car : null;

function wrapD(S, d){ const L = S.track.length; if(d > L / 2) d -= L; else if(d < -L / 2) d += L; return d; }
function leaderOf(S){
  let b = null;
  for(const c of S.cars) if(!c.dnf && (!b || c.prog > b.prog)) b = c;
  return b;
}

function place(T, k){
  const f = k.f, j = ((Math.floor(f) % T.n) + T.n) % T.n, k2 = (j + 1) % T.n, u = f - Math.floor(f);
  const lat = lerp(T.line[j], T.pitCentre(j), k.mix);
  k.x = lerp(T.x[j], T.x[k2], u) + lerp(T.nx[j], T.nx[k2], u) * lat;
  k.y = lerp(T.y[j], T.y[k2], u) + lerp(T.ny[j], T.ny[k2], u) * lat;
  k.z = lerp(T.z[j], T.z[k2], u);
  k.h = T.ang[j] + angWrap(T.ang[k2] - T.ang[j]) * u;
  k.node = j; k.off = lat; k.s = T.s[j] + u * T.ds;
  k.vx = Math.cos(k.h) * k.v; k.vy = Math.sin(k.h) * k.v; k.speed = k.v;
}

function deploy(S, reason){
  const sc = S.sc, T = S.track;
  if(!sc || sc.state !== "off") return false;
  const lead = leaderOf(S); if(!lead) return false;
  // from the pit exit if it is a fair way ahead of the leader, otherwise onto the road well ahead of him
  const toExit = (((T.pitOut - lead.node) % T.n + T.n) % T.n) * T.ds;
  const fromPit = toExit > 260 && toExit < 1700;
  const k = { f:0, v:fromPit ? 14 : 40, mix:fromPit ? 1 : 0, inLane:fromPit, wasLane:fromPit, ended:false, lights:true,
              x:0, y:0, z:0, h:0, node:0, off:0, s:0, vx:0, vy:0, speed:0, dnf:false, pitting:0, stalled:false, ai:false, railV:40,
              pace:1, life:1, damage:0, lungeSide:0, defMove:null, drv:{ skill:1, aggr:0, last:"the safety car", abbr:"SC" } };
  k.f = fromPit ? T.pitOut - Math.round(70 / T.ds) : lead.node + Math.round(300 / T.ds);
  place(T, k);
  sc.car = k; sc.state = "out"; sc.fin = false; sc.reason = reason; sc.count++; sc.t = 0;
  sc.leaderLap = Math.max(...S.cars.filter(c => !c.dnf).map(c => c.lap));
  sc.lapsLeft = clamp(S.laps - sc.leaderLap - 1, 1, 2);
  sc.prev.clear();
  showMsg("SAFETY CAR", reason, 3.6);
  const me = S.player;
  if(me && !me.dnf){
    try{ AUDIO.say("Safety car, safety car. " + reason + ". Stay behind it, no overtaking. The pit lane is cheap now — press P.", "eng", true); }catch(e){}
  }
  notify(S, "SAFETY CAR DEPLOYED · " + reason, 3.4);
  // the pit wall calls a good few of them in: a stop under the safety car costs the least
  for(const c of S.cars){
    if(!c.ai || c.dnf || c.pitReq || c.pitting || c.lap >= S.laps) continue;
    if((c.stops === 0 || c.life < 0.5) && Math.random() < 0.6){
      c.pitReq = true;
      c.nextTyre = S.wet > 0.45 ? TYRES.wet : c.tyre.key === "hard" ? TYRES.medium : TYRES.hard;
    }
  }
  return true;
}

function moveCar(S, dt){
  const sc = S.sc, k = sc.car, T = S.track; if(!k) return;
  const wet = 1 - 0.22 * S.wet;
  // the pace the road allows for the next 150 m, at about 60 % of the limit
  const look = Math.max(2, Math.round(150 / T.ds)), j0 = ((Math.floor(k.f) % T.n) + T.n) % T.n;
  let vp = 1e9; for(let q = 0; q < look; q += 2) vp = Math.min(vp, T.vprof[(j0 + q) % T.n]);
  let target = clamp(vp * 0.6, 20, 52) * wet;
  if(sc.state === "out"){
    // wait for the leader if he is a long way back
    const lead = leaderOf(S);
    if(lead){ const gap = wrapD(S, k.s - lead.s); if(gap > 0 && gap > 230) target = Math.max(24, target * 0.55); }
  }
  if(k.inLane) target = Math.min(target, PIT_V);
  k.v += clamp(target - k.v, -14 * dt, 6 * dt);
  k.f += k.v * dt / T.ds;
  const j = ((Math.floor(k.f) % T.n) + T.n) % T.n;
  // out of the pit exit: lane first, then onto the road
  if(k.wasLane && k.inLane && T.pitU(j) < 0) k.inLane = false;
  // coming in: down the pit lane at the entry
  if(sc.fin && !k.inLane && !k.ended){
    const u = T.pitU(j); if(u >= 0 && u < 0.3){ k.inLane = true; k.wasLane = false; }
  }
  k.mix = clamp(k.mix + (k.inLane ? 1 : -1) * dt * 0.5, 0, 1);
  place(T, k);
  // gone down the lane: it is off the road
  if(sc.fin && k.inLane && T.pitU(j) > 0.96){ k.ended = true; sc.car = null; }
  k.lights = sc.state === "out";
}

function tick(S, dt){
  const sc = S.sc; if(!sc) return;
  if(S.mode !== "race" || S.state !== "run") return;
  sc.t += dt;
  const lead = leaderOf(S);
  if(sc.state === "off"){
    if(sc.car) moveCar(S, dt);                       // still rolling down the lane after the green flag
    if(!sc.on || !lead || S.clock < 14 || (S.penT || 0) < sc.cool) return;
    if(lead.lap < 1 || lead.lap > S.laps - 2) return;
    // a car stopped on the track
    for(const c of S.cars){
      if(!c.dnf || c.scSeen) continue;
      if(c.pitting || c.inPit){ c.scSeen = true; continue; }
      if(c.speed < 6){
        c.scSeen = true;
        deploy(S, c.drv.last + " is stopped on the track"); return;
      }
    }
    // debris
    if(sc.plan && lead.lap === sc.plan.lap && (lead.s / S.track.length) > sc.plan.frac){
      sc.plan = null; deploy(S, "Debris on the track");
    }
    return;
  }
  moveCar(S, dt);
  // the leader's laps
  const lap = Math.max(...S.cars.filter(c => !c.dnf).map(c => c.lap));
  const crossed = lap > sc.leaderLap; sc.leaderLap = lap;
  if(sc.state === "out"){
    if(crossed) sc.lapsLeft--;
    if(sc.lapsLeft <= 0 || lap >= S.laps){
      sc.state = "in"; sc.fin = true;
      showMsg("SAFETY CAR IN THIS LAP", "Lights off · pit lane open · green flag at the line", 3.4);
      try{ if(S.player && !S.player.dnf) AUDIO.say("Safety car in this lap. Stay ready, we go green at the line.", "eng", true); }catch(e){}
      notify(S, "SAFETY CAR IN THIS LAP", 3);
    }
  } else if(sc.state === "in"){
    if(crossed && (!sc.car || sc.car.inLane)){
      sc.state = "off"; sc.cool = (S.penT || 0) + 40;
      showMsg("GREEN FLAG", "Racing resumes", 2.6);
      try{ if(S.player && !S.player.dnf) AUDIO.say("Green, green, green. Go go go.", "eng", true); }catch(e){}
    }
  }
  // overtaking behind the safety car: the player is watched
  const p = S.player;
  if(p && !p.dnf && !p.finished && !p.inPit && !p.pitting && p.spinT <= 0 && p.speed > 8){
    const others = S.cars.filter(o => o !== p && !o.dnf && !o.pitting && !o.inPit);
    const k = onTrack(S); if(k) others.push(k);
    for(const o of others){
      const d = wrapD(S, o.s - p.s), pd = sc.prev.get(o);
      sc.prev.set(o, d);
      if(pd != null && Math.abs(pd) < 40 && Math.abs(d) < 40 && pd > 1.5 && d < -1.5 && Math.abs(o.off - p.off) < 7 &&
         (S.penT || 0) - sc.passCool > 6){
        sc.passCool = S.penT || 0;
        issue(S, p, "dt", o === k ? "Overtaking the safety car" : "Overtaking " + o.drv.last + " under the safety car");
      }
    }
  }
}

/* the player's own limiter while the car is out: no faster than the one in front, closing the gap gently */
function limitPlayer(S, c){
  const k = onTrack(S);
  if(!S.sc || S.sc.state !== "out" || !k || c.inPit || c.pitting) return;
  c.boost = 0;
  let ahead = k, gap = wrapD(S, k.s - c.s);
  for(const o of S.cars){
    if(o === c || o.dnf || o.pitting || o.inPit) continue;
    const d = wrapD(S, o.s - c.s);
    if(d > 0 && d < gap && Math.abs(o.off - c.off) < 6.5){ gap = d; ahead = o; }
  }
  if(gap <= 0 || gap > 600) return;
  const av = ahead === k ? k.v : Math.max(ahead.speed, 8);
  const cap = av + 3 + Math.max(0, gap - 22) * 0.4;
  if(c.speed > cap){ c.thr = 0; c.brk = Math.max(c.brk, clamp((c.speed - cap) * 0.16, 0.25, 1)); }
}

export { active, deploy, init, limitPlayer, onTrack, tick };
