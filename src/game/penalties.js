import { showMsg, showToast } from '../ui/screens.js';
import { AUDIO } from '../audio/audio.js';

/* ---------- the stewards ----------
   Every penalty in the book that this game can see:
     warning · reprimand · 5 s · 10 s · drive-through · 10 s stop-and-go · disqualification
     grid-place drops · deleted laps (qualifying) · track-limit strikes (white, then black-and-white flag)
   Drive-throughs and stop-and-gos are served in the pit lane within three laps; whatever is
   still owed at the flag, or can no longer be served, turns into time (20 s / 30 s).
   The player hears about their own through the message and the radio; the AI's arrive as steward notices. */

const PIT_LIMIT = 140 / 3.6;
const K = {
  warn: { name:"Warning", pts:0 },
  rep:  { name:"Reprimand", pts:0 },
  t5:   { name:"5 second time penalty", short:"5s penalty", sec:5, pts:1, big:"5 SECOND PENALTY", say:"five second time penalty" },
  t10:  { name:"10 second time penalty", short:"10s penalty", sec:10, pts:2, big:"10 SECOND PENALTY", say:"ten second time penalty" },
  dt:   { name:"Drive-through penalty", short:"drive-through", conv:20, pts:2, big:"DRIVE-THROUGH PENALTY", say:"drive-through penalty" },
  sg:   { name:"10 second stop-and-go", short:"10s stop-go", conv:30, pts:3, big:"STOP-AND-GO PENALTY", say:"ten second stop and go" },
  dsq:  { name:"Disqualification", short:"DISQUALIFIED", pts:0, big:"BLACK FLAG", say:"disqualification" },
};

function st(c){
  return c.pen || (c.pen = { time:0, todo:[], strikes:0, reps:0, points:0, dsq:false, cool:-99, n:0,
                             exT:0, inEx:false, exPos:0, blueT:0, blueSaid:false, lane:false, laneT:0, laneSpeed:false });
}

/* steward notices queue up, so two in a row are both read */
function notify(S, text, secs){
  (S.penQ || (S.penQ = [])).push({ text, secs:secs || 3.4 });
}
function pump(S, dt){
  S.penT = (S.penT || 0) + dt;
  if(S.penQ && S.penQ.length && S.penT >= (S.penNext || 0)){
    const m = S.penQ.shift();
    showToast(m.text, m.secs);
    S.penNext = S.penT + m.secs + 0.25;
  }
}
function radio(text){ try{ AUDIO.say(text, "eng", true); }catch(e){} }

function issue(S, c, kind, reason, opts){
  if(!S || !c || c.dnf || S.ended) return false;
  const p = st(c), me = c === S.player;
  if(p.dsq) return false;
  if(kind === "rep"){ p.reps++; if(p.reps >= 3){ kind = "dt"; reason = "Third reprimand — " + reason.toLowerCase(); } }
  const k = K[kind];
  p.n++; p.points += k.pts || 0;
  let line = k.name, small = reason;
  if(kind === "dt" || kind === "sg"){
    if(S.mode !== "race" || c.finished || c.lap >= S.laps){
      p.time += k.conv; line = k.name + " → +" + k.conv + " s (no time left to serve it)";
      small = reason + " · +" + k.conv + " s on your race time";
    } else {
      p.todo.push({ kind, by:c.lap + 3 });
      small = reason + (me ? " · pit (P) within 3 laps" : "");
    }
  } else if(k.sec) p.time += k.sec;
  else if(kind === "dsq") p.dsq = true;
  (S.penLog || (S.penLog = [])).push({ lap:Math.max(1, c.lap), abbr:c.drv.abbr, last:c.drv.last, me, text:line, reason });
  if(me){
    if(kind === "warn") showMsg("WARNING", reason, 2.8);
    else if(kind === "rep") showMsg("REPRIMAND", reason, 3);
    else showMsg(k.big, small, 4.2);
    if(kind === "warn" || kind === "rep") radio("Stewards: " + k.name.toLowerCase() + ". " + reason + ".");
    else if(kind === "dsq") radio("You have been shown the black flag. " + reason + ".");
    else if(kind === "dt" || kind === "sg") radio("Stewards have given us a " + k.say + ". " + reason + ". Box within three laps.");
    else radio("Stewards have given us a " + k.say + ". " + reason + ".");
    if(p.points >= 12) notify(S, "12 penalty points on your licence — one-race ban", 4);
    if(kind === "dsq" && S.endNow) setTimeout(() => { if(!S.ended) S.endNow(); }, 1800);
  } else if(kind !== "warn"){
    notify(S, "STEWARDS · " + c.drv.abbr + " " + c.drv.last + " — " + (k.short || k.name) + " · " + reason, kind === "rep" ? 3 : 3.8);
  }
  return true;
}

/* ---- fault in a collision: whoever was behind, or whoever drove into the other ---- */
function contact(S, A, B, ux, uy, imp, ds2){
  if(S.mode !== "race" || S.state !== "run" || imp < 3.5) return;
  const ca = A.vx * ux + A.vy * uy, cb = -(B.vx * ux + B.vy * uy);     // each car's closing speed on the other
  let f = null, v = null;
  if(Math.abs(ds2) > 2.2){ f = ds2 > 0 ? A : B; v = f === A ? B : A; }  // clearly one behind the other
  else if(ca > cb * 1.4 && ca > 1){ f = A; v = B; }
  else if(cb > ca * 1.4 && cb > 1){ f = B; v = A; }
  if(!f || f.spinT > 0 || f.wrecked || f.pitting || f.inPit || v.spinT > 0 || v.wrecked) return;
  const p = st(f);
  if((S.penT || 0) - p.cool < 5) return;
  p.cool = S.penT || 0;
  const why = "Causing a collision with " + v.drv.last;
  if(imp < 6){
    if(Math.random() < 0.45) issue(S, f, "rep", why);
    else if(f === S.player || v === S.player) notify(S, "Contact with " + (f === S.player ? v : f).drv.last + " — noted, no further action", 2.6);
    return;
  }
  if(imp < 10) issue(S, f, "t5", why);
  else if(imp < 15) issue(S, f, "t10", why.replace("Causing a", "Causing a serious") );
  else if(imp < 22) issue(S, f, "dt", "Causing a serious collision with " + v.drv.last);
  else issue(S, f, p.n >= 2 ? "dsq" : "sg", "Dangerous driving — " + v.drv.last + " was caught up");
}

/* ---- lights out: a car that has jumped the start ---- */
function launch(S){
  if(S.mode !== "race") return;
  for(const c of S.cars){
    if(c === S.player){ if(c.revs > 0.985) issue(S, c, "t5", "False start — you moved before the lights went out"); }
    else if(Math.random() < 0.025) issue(S, c, "t5", "False start");
  }
}

/* ---- grid penalties for a few AI cars, decided before the grid forms ---- */
function gridDrops(order, entries, myIdx){
  const out = [];
  const why = [["Gearbox change", 5], ["Power unit change", 10], ["Impeding in qualifying", 3], ["Power unit change — new element", 20]];
  const n = Math.random() < 0.55 ? (Math.random() < 0.3 ? 2 : 1) : 0;
  for(let q = 0; q < n; q++){
    const cand = order.slice(0, 15).filter(x => x !== myIdx && !out.some(o => o.idx === x));
    if(!cand.length) break;
    const idx = cand[(Math.random() * cand.length) | 0];
    const w = why[(Math.random() * why.length) | 0];
    const at = order.indexOf(idx);
    order.splice(at, 1);
    order.splice(Math.min(order.length, at + w[1]), 0, idx);
    out.push({ idx, abbr:entries[idx].d.abbr, last:entries[idx].d.last, places:w[1], why:w[0] });
  }
  return out;
}
function announceGrid(S, drops){
  S.gridDrops = drops;
  for(const d of drops){
    notify(S, "GRID PENALTY · " + d.last + " drops " + (d.places >= 20 ? "to the back of the grid" : d.places + " places") + " — " + d.why, 3.6);
  }
}

/* ---- served in the pit lane ---- */
function nextServe(c){ return c.pen && c.pen.todo.length ? c.pen.todo[0] : null; }
function served(S, c, kind){
  const p = st(c), i = p.todo.findIndex(t => t.kind === kind);
  if(i < 0) return;
  p.todo.splice(i, 1);
  (S.penLog || (S.penLog = [])).push({ lap:Math.max(1, c.lap), abbr:c.drv.abbr, last:c.drv.last, me:c === S.player,
                                       text:K[kind].name + " served", reason:"" });
  if(c === S.player){ showMsg("PENALTY SERVED", "Back to racing", 2.2); radio("Penalty served. Push."); }
  else notify(S, "STEWARDS · " + c.drv.abbr + " " + c.drv.last + " has served the " + K[kind].short, 3);
}

/* ---- the running checks ---- */
function limits(S, c, dt){
  const T = S.track, p = st(c);
  const off = Math.abs(c.off);
  const out = off > T.half + 1.9 && !c.inPit && !c.pitting;
  const free = c.spinT > 0 || c.wrecked || c.speed < 22;
  if(out && !free){
    p.exT += dt;
    if(!p.inEx && p.exT > 0.3){
      p.inEx = true; p.exPos = c.pos;
      if(S.mode === "qualy"){
        if(!c.lapInvalid && c.lapStart != null){
          c.lapInvalid = true;
          if(c === S.player) showMsg("LAP DELETED", "Track limits — that one will not count", 2.6);
        }
      } else if(S.mode === "race"){
        p.strikes++;
        if(p.strikes === 1 || p.strikes === 2){
          if(c === S.player) issue(S, c, "warn", "Track limits — warning " + p.strikes + " of 3");
        } else if(p.strikes === 3){
          if(c === S.player) showMsg("BLACK & WHITE FLAG", "Track limits — the next one is five seconds", 3.2);
          else if(S.player && Math.abs(c.pos - S.player.pos) <= 3) notify(S, "Black and white flag for " + c.drv.last + " — track limits", 3);
          if(c === S.player) radio("Track limits. That is the black and white flag, no more.");
        } else issue(S, c, "t5", "Track limits — repeated offences");
      }
    }
  } else if(off < T.half + 0.6){
    if(p.inEx && S.mode === "race" && c.pos < p.exPos && c.lap >= 1 && c.spinT <= 0 && Math.random() < 0.8)
      issue(S, c, "t5", "Leaving the track and gaining an advantage");
    p.inEx = false; p.exT = 0;
  }
}

function pitLane(S, c, dt){
  const p = st(c);
  const lane = !!(c.pitting || c.inPit);
  if(c.inPit && !c.pitting && c.stopT <= 0){
    p.laneT += dt;
    if(c.speed > PIT_LIMIT + 2.5 && p.laneT > 2.6 && !p.laneSpeed){
      p.laneSpeed = true; issue(S, c, "t5", "Speeding in the pit lane");
    }
  }
  if(p.lane && !lane){
    // rolled out of the pit lane: an unsafe release if a car is right there
    if(c.speed > 5 && Math.random() < 0.12){
      const near = S.cars.some(o => o !== c && !o.dnf && !o.pitting && !o.inPit && Math.hypot(o.x - c.x, o.y - c.y) < 26);
      if(near) issue(S, c, "t5", "Unsafe release — a car was released into traffic");
    }
    p.laneT = 0; p.laneSpeed = false;
  }
  p.lane = lane;
}

function blue(S, c, dt){
  const T = S.track, p = st(c);
  let who = null;
  for(const o of S.cars){
    if(o === c || o.dnf || o.finished || o.pitting || o.lap <= c.lap) continue;
    const d = o.prog - c.prog;
    if(d > T.length - 90 && d < T.length + 10){ who = o; break; }
  }
  if(who){
    p.blueT += dt;
    if(!p.blueSaid && p.blueT > 0.8){
      p.blueSaid = true;
      showMsg("BLUE FLAG", who.drv.last + " is lapping you — let them through", 2.6);
      radio("Blue flag. " + who.drv.last + " wants to come through.");
    }
    if(p.blueT > 11){ issue(S, c, "t5", "Ignoring blue flags"); p.blueT = -14; p.blueSaid = false; }
  } else {
    p.blueT = Math.max(p.blueT < 0 ? p.blueT : 0, p.blueT - dt * 2);
    if(p.blueT <= 0) p.blueSaid = false;
  }
}

/* the AI now and then does something the stewards notice */
function aiIncident(S, c, dt){
  if((S.penT || 0) < 12 || c.finished || c.pitting || c.lap < 1) return;
  if(Math.random() >= 0.00018 * (0.55 + c.drv.aggr) * (1 + S.wet * 0.4) * dt) return;
  const nb = S.cars.filter(o => o !== c && !o.dnf && Math.abs(o.pos - c.pos) === 1);
  const o = nb.length ? nb[(Math.random() * nb.length) | 0] : null;
  const r = Math.random();
  if(r < 0.28) issue(S, c, "t5", o ? "Forcing " + o.drv.last + " off the track" : "Forcing another driver off the track");
  else if(r < 0.50) issue(S, c, "t5", "Leaving the track and gaining an advantage");
  else if(r < 0.64) issue(S, c, "t5", o ? "Causing a collision with " + o.drv.last : "Causing a collision");
  else if(r < 0.76) issue(S, c, "t5", "Illegal defending — moving under braking");
  else if(r < 0.86) issue(S, c, "rep", "Driving with a lack of care");
  else if(r < 0.95) issue(S, c, "dt", "Dangerous driving");
  else issue(S, c, "sg", "Serious breach of the sporting regulations");
}

function tick(S, dt){
  pump(S, dt);
  if(S.state !== "run" || S.mode === "tt") return;
  for(const c of S.cars){
    if(c.dnf || c.finished) continue;
    const p = st(c);
    limits(S, c, dt);
    if(S.mode !== "race") continue;
    const sc = !!(S.sc && S.sc.state !== "off");
    pitLane(S, c, dt);
    if(c === S.player){ if(!sc) blue(S, c, dt); }
    else {
      if(c.penServedFlag){ c.penServedFlag = false; if(c.servePen){ served(S, c, c.servePen); c.servePen = null; } }
      if(!sc) aiIncident(S, c, dt);
      // the pit wall sends a penalised car down the lane, as a visit of its own
      const n = nextServe(c);
      if(n && !c.pitReq && !c.pitting && c.lap >= 1 && c.lap < S.laps){ c.pitReq = true; c.servePen = n.kind; c.nextTyre = c.tyre; }
    }
    // three laps to serve it, then it is time instead
    for(let i = p.todo.length - 1; i >= 0; i--){
      const t = p.todo[i];
      if(c.lap > t.by){
        p.todo.splice(i, 1); const k = K[t.kind]; p.time += k.conv;
        (S.penLog || (S.penLog = [])).push({ lap:c.lap, abbr:c.drv.abbr, last:c.drv.last, me:c === S.player,
                                             text:k.name + " not served → +" + k.conv + " s", reason:"" });
        if(c === S.player) showMsg("PENALTY NOT SERVED", "+" + k.conv + " s added to your race time", 3.4);
        else notify(S, "STEWARDS · " + c.drv.abbr + " never served the " + k.short + " — +" + k.conv + " s", 3.4);
      }
    }
  }
}

/* ---- the classification: penalty seconds added, unserved stops converted ---- */
function owed(c){
  const p = c.pen; if(!p) return 0;
  let s = p.time;
  for(const t of p.todo) s += K[t.kind].conv;
  return s;
}
function classify(S, arr){
  const T = S.track, ms = S.clock * 1000;
  const est = c => c.finished ? c.finishTime : ms + Math.max(0, (S.laps + 1) * T.length - c.prog) / Math.max(30, c.speed) * 1000;
  let run = 0, any = false;
  const items = arr.map((c, i) => {
    run = Math.max(run, est(c));
    const pen = owed(c); if(pen > 0) any = true;
    return { c, pen, base:i, key:run + pen * 1000, t:run };
  });
  if(!any) return { order:arr.slice(), any:false, key:new Map(), pen:new Map() };
  items.sort((a, b) => (a.key - b.key) || (a.base - b.base));
  const key = new Map(), pen = new Map();
  for(const it of items){ key.set(it.c, it.key); pen.set(it.c, it.pen); }
  return { order:items.map(it => it.c), any:true, key, pen };
}

/* the line under the clock in the HUD */
function hudLine(S, c){
  const p = c.pen; if(!p) return "";
  const out = [];
  if(p.time) out.push("+" + p.time + " s");
  for(const t of p.todo) out.push((t.kind === "dt" ? "DRIVE-THROUGH" : "STOP-GO 10 s") + " · by lap " + Math.min(t.by, S.laps));
  if(p.strikes && S.mode === "race") out.push("LIMITS " + Math.min(p.strikes, 3) + "/3" + (p.strikes >= 3 ? " ⚑" : ""));
  if(p.points) out.push(p.points + " pts");
  return out.join("  ·  ");
}

export { K, announceGrid, classify, contact, gridDrops, hudLine, issue, launch, nextServe, notify, owed, served, st, tick };
