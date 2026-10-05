import { $, el } from '../config/util.js';
import { PARTS, TYRES } from './parts.js';
import { AUDIO } from '../audio/audio.js';
import { showMsg } from '../ui/screens.js';
import { nextServe, served } from '../game/penalties.js';

/* ---------- the player's pit stop ---------- */
function playerPit(c, S, dt){
  const T = S.track;
  if(c.stopT > 0){
    c.stopT -= dt; c.thr = 0; c.brk = 1; c.steer = 0;
    if(c.stopT <= 0) finishStop(c, S);
    return;
  }
  if(c.inPit && !c.pitVisit){
    c.pitVisit = true;
    const owe = S.mode === "race" ? nextServe(c) : null;
    if(owe){
      // a penalty visit: no tyres, no repairs, no menu — just the lane
      c.pitPlan = { tyre:"none", repairs:new Set(), done:false, none:owe.kind === "dt", pen:owe.kind };
      showMsg(owe.kind === "dt" ? "DRIVE-THROUGH" : "STOP-AND-GO",
              owe.kind === "dt" ? "Hold the limiter all the way through — do not stop" : "Stop in your box for 10 seconds — no work allowed", 3.2);
    }
    else if(S.mode === "race" && c.lap <= S.laps) openPitMenu(c, S);
  }
  if(!c.inPit && c.pitVisit && T.pitRamp(c.node) <= 0.04){
    if(c.pitPlan && c.pitPlan.pen === "dt") served(S, c, "dt");
    c.pitVisit = false; c.pitPlan = null; c.pitReq = false;
  }
  // approaching the entry, and missing it
  if(c.pitReq && !c.inPit && !c.pitting){
    const u = T.pitU(c.node);
    const toEntry = (((T.pitIn - c.node) % T.n + T.n) % T.n) * T.ds;
    if(u < 0 && toEntry < 240 && !c.pitWarned){
      c.pitWarned = true;
      showMsg("PIT ENTRY AHEAD", "Move to the " + (T.pitSide > 0 ? "right" : "left"), 2.0);   // + is the right-hand side
    }
    if(u > 0.24 && u < 0.7){
      c.pitReq = false; c.pitWarned = false;
      showMsg("PIT ENTRY MISSED", "Stay out — call it again next lap", 2.2);
    }
  }
  const plan = c.pitPlan;
  if(c.inPit && plan && !plan.none && !plan.done){
    let bd = ((c.node - T.pitBox) % T.n + T.n) % T.n;
    if(bd > T.n / 2) bd -= T.n;
    if(Math.abs(bd) < 6 && c.speed < 2.5) beginStop(c, S);
  }
}
function pitJobTime(c, plan){
  let t = 2.2;
  for(const k of plan.repairs) t += PARTS[k].fix;
  return t;
}
function openPitMenu(c, S){
  S.menuOpen = true;
  c.pitPlan = { tyre:(S.wet > 0.45 ? "wet" : c.tyre.key === "soft" ? "hard" : "soft"),
                repairs:new Set([...c.broken].filter(k => !PARTS[k].tyre)), done:false, none:false };
  $("#pitmenu").hidden = false;
  $("#pit-sub").textContent = S.mode === "race"
    ? "Lap " + c.lap + " of " + S.laps + " · P" + c.pos + " · the crew are waiting"
    : "Choose your service";
  renderPitMenu(c, S);
}
function renderPitMenu(c, S){
  const plan = c.pitPlan, host = $("#pit-tyres"); host.innerHTML = "";
  const opts = [["Soft", "soft"], ["Medium", "medium"], ["Hard", "hard"], ["Wet", "wet"], ["Keep", "none"]];
  for(const o of opts){
    const b = el("button", plan.tyre === o[1] ? "on" : "", o[0]);
    b.onclick = () => { plan.tyre = o[1]; renderPitMenu(c, S); };
    host.appendChild(b);
  }
  const rep2 = $("#pit-repairs"); rep2.innerHTML = "";
  const fixable = [...c.broken].filter(k => !PARTS[k].tyre);
  if(!fixable.length){
    rep2.appendChild(el("div", "fixrow clean",
      c.broken.size ? "Puncture — fixed with the tyre change" : "Nothing broken"));
  } else for(const k of fixable){
    const on = plan.repairs.has(k);
    const row = el("button", "fixrow" + (on ? " on" : ""),
      '<span class="tick"></span><span class="nm2">' + PARTS[k].name +
      '</span><span class="t2">+' + PARTS[k].fix.toFixed(1) + 's</span>');
    row.onclick = () => { plan.repairs.has(k) ? plan.repairs.delete(k) : plan.repairs.add(k); renderPitMenu(c, S); };
    rep2.appendChild(row);
  }
  $("#pit-time").textContent = pitJobTime(c, plan).toFixed(1) + "s";
}
function closePitMenu(S){ S.menuOpen = false; $("#pitmenu").hidden = true; }
function beginStop(c, S){
  const plan = c.pitPlan;
  const t = plan.pen ? 10 : pitJobTime(c, plan) + Math.random() * 0.8;
  c.stopT = t; c.stopTotal = t; c.vx = c.vy = 0;
  try{ AUDIO.event("stop", c, S); }catch(e){}
  S.toast("Stopped — crew working");
}
function finishStop(c, S){
  const plan = c.pitPlan;
  if(plan.pen){                                  // the stop-and-go is over: the car is released untouched
    plan.done = true; c.stopT = 0; served(S, c, "sg"); return;
  }
  const fitted = TYRES[plan.tyre];
  if(plan.tyre !== "none" && fitted){
    c.tyre = fitted; c.used.add(plan.tyre); c.life = 1; c.temp = 0.45;
    if(c.broken.has("punct")){ c.broken.delete("punct"); c.health.punct = 1; }
  }
  for(const k of plan.repairs){ c.broken.delete(k); c.health[k] = 1; }
  c.recalcPerf();
  c.damage = Math.max(0, c.damage - 0.5);
  c.stops++; plan.done = true; c.stopT = 0;
  try{ AUDIO.event("away", c, S, c.stopTotal.toFixed(1) + " seconds, P" + c.pos + "."); }catch(e){}
  S.toast("Away · " + c.stopTotal.toFixed(1) + "s");
}


export { closePitMenu, playerPit };
