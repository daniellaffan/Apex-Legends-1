import { clamp, lerp } from '../config/util.js';
import { AUDIO } from '../legacy-rest.js';

/* ---------- 4. AI --------------------------------------------------------- */
// The rail followers track their own speed in railV; the player's car does not,
// so asking for railV on a human-driven car reads a stale zero.
function carSpeed(o){ return (o.ai && o.railV != null) ? o.railV : o.speed; }


/* Where the next corner is, which side is its inside, and how slow it gets.
   The apexes are the local minima of the speed profile that are clearly slower
   than the road either side; the sign of the curvature there is the inside
   (right-handers are positive, and the racing line sits on that side). */
function cornerAhead(T, i){
  let C = T._corners;
  if(!C){
    const n = T.n, vp = T.vprof, W = Math.max(4, Math.round(120 / T.ds)), ap = [];
    for(let k = 0; k < n; k++){
      let mn = true, hi = 0;
      for(let q = -W; q <= W; q++){ const v = vp[(k + q + n) % n]; if(q && v < vp[k] - 1e-6){ mn = false; break; } if(v > hi) hi = v; }
      if(mn && vp[k] < hi * 0.8 && Math.abs(T.curv[k]) > 0.004 && (!ap.length || k - ap[ap.length - 1] > 6)) ap.push(k);
    }
    const dist = new Float32Array(n).fill(1e5), side = new Int8Array(n), vmin = new Float32Array(n).fill(200), apex = new Int32Array(n).fill(-1);
    if(ap.length) for(let k = 0; k < n; k++){
      let best = -1, bd = 1e9;
      for(const a of ap){ const d = (a - k + n) % n; if(d < bd){ bd = d; best = a; } }
      dist[k] = bd * T.ds; side[k] = Math.sign(T.curv[best]) || 0; vmin[k] = vp[best]; apex[k] = best;
    }
    C = T._corners = { dist, side, vmin, apex };
  }
  return { dist:C.dist[i], side:C.side[i], vmin:C.vmin[i], apex:C.apex[i] };
}

function driveAI(c, S, dt){
  const T = c.T, i = c.node, v = carSpeed(c);
  if(c.pitting) return;
  const kNow = Math.abs(T.curv[i]);
  const look = Math.max(2, Math.round(clamp((10 + v * 0.46) / (1 + kNow * 40), 9, 56) / T.ds));
  const ti = (i + look) % T.n;

  // --- pace from the speed profile, with a braking horizon ---
  const horizon = Math.round(220 / T.ds);
  let vt = Infinity;
  for(let k = 1; k <= horizon; k++){
    const j = (i + k) % T.n, d = k * T.ds;
    vt = Math.min(vt, Math.sqrt(T.vprof[j] ** 2 + 2 * 29 * d));
  }
  const tyreK = 0.90 + 0.10 * c.life, wetK = S.wet > 0 ? lerp(1, c.tyre.key === "wet" ? 0.95 : 0.80, S.wet) : 1;
  vt = Math.min(vt, T.vprof[i] * 1.02) * 0.985 * c.pace * S.aiScale * tyreK * wetK * (1 + c.mistake * 0.22);

  // --- traffic: who is in front, who is hounding us ---
  let ahead = null, gap = 1e9, behind = null, bgap = 1e9;
  const halfLap = T.length / 2;
  for(const o of S.cars){
    if(o === c || o.dnf || o.pitting) continue;
    let d = o.s - c.s;
    if(d > halfLap) d -= T.length; else if(d < -halfLap) d += T.length;
    if(d > 0 && d < 140 && Math.abs(o.off - c.off) < 6.5){ if(d < gap){ gap = d; ahead = o; } }
    else if(d <= 0 && d > -42){ if(-d < bgap){ bgap = -d; behind = o; } }
  }

  /* --- racing: the car in front, and the car behind --- */
  const D = S.combat || { defend:0.6, aggr:0.9, push:0.01, lunge:1 };
  const tight = T.half < 6.6 ? 0.5 : 1;        // there is nowhere to go on a street circuit
  if(c.prevRacePos != null && c.pos > c.prevRacePos) c.attackT = 10;   // just been passed — go get it back
  c.prevRacePos = c.pos;
  if(c.attackT > 0) c.attackT -= dt;
  if(c.defCool > 0) c.defCool -= dt;
  const avenging = c.attackT > 0 && S.mode === "race";
  // The first seconds are a scramble into turn one: hold the line, no moves
  const racing = S.mode === "race" && S.clock > 9;
  // the next corner: how far, which side is the inside, and whether we are braking for it
  const cn = cornerAhead(T, i);
  const brakeDist = Math.max(0, (v * v - cn.vmin * cn.vmin) / (2 * 26)) + 14;
  const inBrake = cn.dist < brakeDist;           // the corner's own braking zone, not braking for traffic
  // anyone at our elbow: side by side is about room, not about lines
  let elbow = null;
  for(const o of S.cars){
    if(o === c || o.dnf || o.pitting) continue;
    let d = o.s - c.s;
    if(d > halfLap) d -= T.length; else if(d < -halfLap) d += T.length;
    if(Math.abs(d) < 5.5 && Math.abs(o.off - c.off) < 4.4){ elbow = o; break; }
  }

  let passDir = 0, avoid = null;
  if(ahead){
    const av = carSpeed(ahead);
    const lane = Math.abs(ahead.off - c.off) < 3.6;      // are we actually behind them?
    const respect = 8 + v * 0.30;
    const mine = c.pace * c.drv.skill * (0.86 + 0.14 * c.life);
    const theirs = ahead.pace * ahead.drv.skill * (0.86 + 0.14 * ahead.life);
    const quicker = mine > theirs * 0.998;
    // a car that has crashed, spun or stopped is an obstacle, not a rival to follow
    const stricken = ahead.stalled === true;
    // tow down the straights — this is what actually breaks a train up
    if(gap > 8 && gap < 45 && v > 52 && kNow < 0.0045 && lane) vt *= 1.018 + D.push;
    if(avenging) vt *= 1 + D.push;                        // dig in while the place is fresh

    if(stricken){
      // take whichever side has the most road, measured from where THEY are stopped
      const roomL = (T.half - 1.8) - ahead.off, roomR = ahead.off + (T.half - 1.8);
      passDir = roomL > roomR ? 1 : -1;
      avoid = ahead;
      if(lane && gap < 70) vt = Math.min(vt, Math.max(T.vprof[i] * 0.55, av + 12));
    } else if(lane){
      const bold = c.drv.aggr * D.aggr;
      const willTry = racing &&
        ((T.half > 6.4 ? quicker : mine > theirs * 1.015) || avenging || bold > 0.88);
      if(S.mode !== "race"){ if(gap < respect){ vt = Math.min(vt, av * 0.97); passDir = ahead.off > 0 ? -1 : 1; } }
      else if(willTry && gap < respect * (1 + 1.1 * tight)){
        // Line up the move on the straight, before the braking zone: the inside
        // of the next corner if there is one coming, else whichever side is open.
        // Once it is too late to set it up, wait for the next straight.
        // room to set it up: at least a second before the braking point
        const setUp = cn.dist > 320 || cn.dist - brakeDist > v * 1.0;
        if(!c.lungeSide && !inBrake && setUp){
          const inside = cn.dist < 300 ? cn.side : 0;
          const wantSide = inside || (ahead.off > 0 ? -1 : 1);
          const target = clamp(ahead.off + wantSide * 3.6, -(T.half - 1.8), T.half - 1.8);
          let busy = false;
          for(const o of S.cars){
            if(o === c || o === ahead || o.dnf || o.pitting) continue;
            let d2 = o.s - c.s;
            if(d2 > halfLap) d2 -= T.length; else if(d2 < -halfLap) d2 += T.length;
            if(d2 > -12 && d2 < 38 && Math.abs(o.off - target) < 4.2){ busy = true; break; }
          }
          // the defender has already taken that side: no move to make there
          if(!busy && !(ahead.defMove && ahead.defMove.side === wantSide && gap < 18)) c.lungeSide = wantSide;
        }
        if(c.lungeSide){ passDir = c.lungeSide; vt = Math.min(vt, av + 3 + D.aggr * 2); }
      } else if(gap < respect){
        c.lungeSide = 0;
        vt = Math.min(vt, av * clamp(0.95 + 0.05 * (gap / respect), 0.88, 1));
      } else if(gap > respect * 2.4) c.lungeSide = 0;
    } else if(gap > respect * 2.4) c.lungeSide = 0;
    // once committed, stay committed until the move is finished
    if(c.lungeSide && gap < respect * 1.5) passDir = c.lungeSide;
    // the dive: alongside or nearly, on the inside, into the braking zone. The
    // car that has the inside gets to brake a touch later; the car on the
    // outside lets it through rather than squeezing it.
    if(c.lungeSide && c.lungeSide === cn.side && gap < 6 && cn.dist < brakeDist + 40 && Math.abs(ahead.off - c.off) > 1.4){
      vt *= 1 + 0.028 * clamp(c.drv.aggr * D.aggr, 0.4, 1.3);
    }
    // only hold station behind someone while still in their lane; once alongside, go
    if(lane){
      const clearing = stricken && Math.abs(c.off - ahead.off) > 2.2;
      const press = passDir ? 0.5 : 1;          // committed to a move: close right up
      const desired = (7.5 + v * 0.45 + Math.max(0, (v * v - av * av) / (2 * 30))) * press;
      if(gap < desired) vt = Math.min(vt, Math.max(clearing ? 11 : 3, av - (desired - gap) * 2.0));
    } else if(gap < 7 && Math.abs(ahead.off - c.off) < 5.2){
      vt = Math.min(vt, Math.max(8, av * 1.03));         // wheel to wheel: edge past, don't barge
    }
    // a failed move: fell back or went past the corner without getting there
    if(c.lungeSide && (gap > respect * 2.4 || (inBrake && gap > 14 && !elbow)))c.lungeSide = 0;
  } else c.lungeSide = 0;

  /* --- defending, to the regulations: ONE move, made on the straight, never
         under braking, and always leave the attacker a car's width --- */
  let defend = 0;
  const bv = behind ? carSpeed(behind) : 0;
  const underThreat = behind && bgap < 19 && (bv > v + 0.6 || bgap < 10);
  if(c.defMove){
    const dm = c.defMove; dm.t += dm.t >= 0 ? dt : 0;
    const gone = !behind || bgap > 26;
    dm.gone = gone ? (dm.gone || 0) + dt : 0;
    // finished: through the corner they were defending, or the threat has gone, or held long enough
    if(dm.t > 9 || dm.gone > 1.2 || (dm.apex != null && cn.apex !== dm.apex && cn.dist > 40)){ c.defMove = null; c.defCool = 5; }
  } else if(underThreat && racing && !inBrake && !elbow && !(c.defCool > 0) && Math.random() < D.defend * tight * dt * 2.5){
    // take the inside line for the coming corner, which is what a defender does;
    // with no corner coming, cover the side they are on. Never into a car.
    const inside = cn.dist < 320 ? cn.side : 0;
    const side = inside || (behind.off > c.off ? 1 : -1);
    if(!((behind.off - c.off) * side > 3.0)) c.defMove = { side, t:0, apex:cn.apex };   // they are already well out there: nothing to cover
  }
  if(c.defMove){
    // a car's width must stay free between us and the edge; ease the move in over half a second
    const keep = Math.max(0, T.half - 3.6), dm = c.defMove;
    defend = dm.side * Math.min(2.8, keep) * clamp(c.drv.aggr * D.aggr, 0.3, 1.2) * clamp(dm.t / 0.6, 0, 1);
  }
  const room = T.half - 2.0;
  const lunge = Math.min(3.9, T.half * 0.52) * (S.combat ? S.combat.lunge : 1);
  const legalDef = Math.max(0, T.half - 3.6);      // leave them room to exist
  let targetOff = avoid ? clamp(avoid.off + passDir * Math.max(4.0, lunge), -room, room)
                  : passDir ? clamp(T.line[ti] + passDir * lunge, -room, room)
                  : clamp(T.line[ti] + defend, -legalDef, legalDef);
  // nobody moves sideways into a car that is at their elbow: hold where we are
  if(elbow && !avoid){
    const toward = Math.sign(targetOff - c.off), there = Math.sign(elbow.off - c.off);
    if(toward && toward === there) targetOff = c.off;
  }
  c.aiOff = lerp(c.aiOff, targetOff - T.line[ti], dt * (avoid ? 4.2 : 2.0));
  let want = clamp(T.line[ti] + c.aiOff, -(T.half - 1.4), T.half - 1.4);
  const edge = T.half - 1.9;
  if(Math.abs(c.off) > edge) want -= Math.sign(c.off) * Math.min(3.4, (Math.abs(c.off) - edge) * 1.6);

  for(const o of S.cars){
    if(o === c || o.dnf || o.pitting) continue;
    let d = o.s - c.s;
    if(d > halfLap) d -= T.length; else if(d < -halfLap) d += T.length;
    const sep = Math.min(5.2, T.half * 0.94);
    if(Math.abs(d) < 7.5 && Math.abs(o.off - c.off) < sep){
      // Push apart smoothly. A hard sign flip at equal offsets made two cars
      // side by side swap their targets every frame and shake; here the push
      // fades to nothing at a tie, and the car index breaks the tie the same
      // way for both so they part rather than chase.
      const rel = c.off - o.off;
      const dir = Math.abs(rel) < 0.05 ? ((c.idx || 0) > (o.idx || 0) ? 0.5 : -0.5) : clamp(rel / 1.2, -1, 1);
      // the car with the inside keeps it; the one outside gives way
      want += dir * (sep - Math.abs(rel)) * 1.35 * (o.lungeSide && o.lungeSide === cn.side && o.s > c.s - 2 ? 1.25 : 1);
    }
  }
  want = clamp(want, -(T.half - 1.2), T.half - 1.2);
  // and never let the target jump from one frame to the next
  c.aiWantS = c.aiWantS == null ? want : lerp(c.aiWantS, want, 1 - Math.exp(-dt * 7));
  want = c.aiWantS;
  if(c.momentT > 0){
    c.momentT -= dt;
    if(c.momentKind === "lock") vt *= 0.72;
    else if(c.momentKind === "wide"){
      vt *= 1.07;
      const spill = T.half * 0.8 + Math.min(T.runoff, 3.5) * 0.4;
      want = clamp(want + c.momentSide * spill, -(T.half + 1.6), T.half + 1.6);
    }
  } else if(kNow > 0.004){
    const rate = (1.03 - c.drv.skill) * 0.040 * (1 + S.wet * 1.2) *
                 (1 + (1 - c.life) * 0.9) * (1 + c.damage * 1.5);
    if(Math.random() < rate * dt){
      c.momentT = 0.7 + Math.random() * 1.5;
      c.momentKind = Math.random() < 0.5 ? "lock" : "wide";
      c.momentSide = -Math.sign(T.curv[i]) || 1;
      try{ AUDIO.event("moment", c, S); }catch(e){}
      if(S.player && Math.abs(c.pos - S.player.pos) <= 2)
        S.toast(c.drv.last + (c.momentKind === "lock" ? " locks up" : " runs wide"));
    }
  }
  c.aiWant = want;
  c.aiTargetV = vt * Math.sqrt(c.perf.grip);
  c.mistake = lerp(c.mistake, (Math.random() - 0.5) * (1.04 - c.drv.skill) * 1.4, dt * 2.4);
  const straight = T.vprof[ti] > 78;
  c.boost = (straight && c.batt > 0.35 && v > 30 && (gap < 70 || c.batt > 0.85)) ? 1 : 0;
  c.hand = 0;

  // pit call
  if(S.mode === "race" && !c.pitReq && c.stops === 0 && S.mustPit &&
     c.lap >= Math.floor(S.laps * (0.38 + (c.idx % 5) * 0.07))) c.pitReq = true;
  if(!c.pitReq && c.life < 0.22 && S.mode === "race" && S.laps - c.lap > 2) c.pitReq = true;
  if(!c.pitReq && c.broken.size && S.mode === "race" && S.laps - c.lap > 1) c.pitReq = true;
}


export { driveAI };
