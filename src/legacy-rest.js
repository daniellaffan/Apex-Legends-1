import * as THREE from 'three';
import gunUrl from './audio/samples/gun.mp3';
import radioUrl from './audio/samples/radio.mp3';
import { $, TAU, clamp, el, fmtGap, fmtTime, lerp, shade, store } from './config/util.js';
import { POINTS, TEAMS } from './config/teams.js';
import { PARTS, TYRES } from './car/parts.js';
import { TRACKS } from './tracks/index.js';
import { buildTrack } from './tracks/build.js';
import { Car, LAUNCH_HI, LAUNCH_LO } from './car/physics.js';
import { driveAI } from './ai/driver.js';
import { CAM_LOW, ISX, ISY, R, ZS } from './render2d/view.js';
import { renderWorld } from './render2d/world.js';
import { PART, spawn, stepParts } from './render2d/particles.js';
import { PP } from './render3d/pipeline.js';
import { G3 } from './render3d/g3.js';

/* ---------- minimap ---------- */
function drawMini(S){
  const cv = $("#mini"), ctx = cv.getContext("2d"), T = S.track, n = T.n;
  const sz = cv.width, pad = 10;
  ctx.clearRect(0, 0, sz, sz);
  const b = T.bounds, sc = Math.min((sz - pad * 2) / b.w, (sz - pad * 2) / b.h);
  const mx = (sz - b.w * sc) / 2 - b.minX * sc, my = (sz - b.h * sc) / 2 - b.minY * sc;
  ctx.strokeStyle = "#39424D"; ctx.lineWidth = 5; ctx.lineJoin = "round";
  ctx.beginPath();
  for(let i = 0; i <= n; i++){ const k = i % n; const x = T.x[k] * sc + mx, y = T.y[k] * sc + my;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.closePath(); ctx.stroke();
  ctx.strokeStyle = "#151A21"; ctx.lineWidth = 2.6; ctx.stroke();
  ctx.fillStyle = "#F0F0F0"; ctx.fillRect(T.x[0] * sc + mx - 2, T.y[0] * sc + my - 2, 4, 4);
  for(const c of S.cars){
    if(c.dnf) continue;
    const me = c === S.player;
    ctx.fillStyle = me ? "#FFA51F" : shade(c.team.body, 0.1);
    ctx.beginPath(); ctx.arc(c.x * sc + mx, c.y * sc + my, me ? 3.4 : 2.2, 0, TAU); ctx.fill();
    if(me){ ctx.strokeStyle = "#0B0E12"; ctx.lineWidth = 1; ctx.stroke(); }
  }
}

/* ---------- 6. session ---------------------------------------------------- */
const KEY = {};
addEventListener("keydown", e => {
  if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) e.preventDefault();
  KEY[e.key.toLowerCase()] = true;
  if(e.key === "Escape") togglePause();
  if(e.key.toLowerCase() === "p" && S && S.state === "run") requestPit();
  if(e.key.toLowerCase() === "r" && S && S.state === "run") recover();
  if(e.key.toLowerCase() === "m"){ try{ AUDIO.init(); AUDIO.toggle(); }catch(err){} }
});
addEventListener("keyup", e => { KEY[e.key.toLowerCase()] = false; });

/* The wheel pulls the camera in and pushes it out. It is a multiplier over
   whatever the automatic framing wants, not a replacement for it, so speed,
   the launch and the pit lane all still move the camera underneath you. Leave
   it alone for five seconds and it eases back to the automatic framing. */
const ZOOM_HOLD = 5;                               // seconds before it lets go
addEventListener("wheel", e => {
  if(!S || paused || S.menuOpen || S.state === "done") return;
  if(e.target.closest && e.target.closest(".screen, .panel, #pause")) return;
  e.preventDefault();
  // trackpads report pixels, mice report lines or pages
  const d = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
  R.userZoom = clamp(R.userZoom * Math.exp(-clamp(d, -240, 240) * 0.0016), 0.45, 3.2);
  R.userZoomT = 0;
}, { passive:false });
addEventListener("blur", () => { for(const k in KEY) KEY[k] = false; });

const TOUCH = { l:0, r:0, gas:0, brk:0, boost:0 };
function bindTouch(){
  const map = { "t-l":"l", "t-r":"r", "t-gas":"gas", "t-brk":"brk", "t-boost":"boost" };
  for(const id in map){
    const n = document.getElementById(id), k = map[id];
    const on = e => { e.preventDefault(); TOUCH[k] = 1; n.classList.add("act"); };
    const off = e => { e.preventDefault(); TOUCH[k] = 0; n.classList.remove("act"); };
    n.addEventListener("pointerdown", on); n.addEventListener("pointerup", off);
    n.addEventListener("pointercancel", off); n.addEventListener("pointerleave", off);
  }
}

let S = null, paused = false, lastT = 0, hudT = 0;
const CFG = Object.assign({ teamId:"mcl", drvIdx:0, trackId:"monaco", lapsIdx:1, diff:1,
  tyre:"medium", weather:"auto", line:1, damage:1, grid:1, mode:"quick", fx:1, detail:1 }, store("cfg") || {});

const OPTS = {
  laps:[["Sprint", 0], ["Feature", 1], ["Full", 2]],
  diff:[["Rookie", 0], ["Pro", 1], ["Ace", 2], ["Legend", 3]],
  tyre:[["Soft", "soft"], ["Medium", "medium"], ["Hard", "hard"]],
  weather:[["Dry", "dry"], ["Likely", "auto"], ["Wet", "wet"]],
  line:[["Line on", 1], ["Line off", 0]],
  damage:[["Damage on", 1], ["Damage off", 0]],
  grid:[["Pole", 0], ["Midfield", 1], ["Back row", 2]],
  fx:[["Effects on", 1], ["Effects off", 0]],
  detail:[["Full detail", 1], ["Lite", 0]],
};
const AI_SCALE = [0.945, 0.975, 0.995, 1.012];
// how hard the field races you, by difficulty: chance to defend, appetite for a move,
// the extra push when chasing a place back, and how far they will lunge
const COMBAT = [
  { defend:0.22, aggr:0.55, push:0.000, lunge:0.75 },
  { defend:0.55, aggr:0.85, push:0.008, lunge:1.00 },
  { defend:0.80, aggr:1.05, push:0.016, lunge:1.15 },
  { defend:0.96, aggr:1.22, push:0.026, lunge:1.30 },
];

let SESSION_N = 0;
function startSession(mode, champ){
  const def = TRACKS.find(t => t.id === CFG.trackId) || TRACKS[0];
  const T = buildTrack(def);
  const laps = mode === "race" ? def.laps[CFG.lapsIdx] : mode === "qualy" ? 4 : 99;
  const rnd = Math.random();
  const wetTarget = CFG.weather === "wet" ? 1 : CFG.weather === "dry" ? 0 : (rnd < def.rain ? 0.55 + Math.random() * 0.45 : 0);

  S = { track:T, mode, laps, cars:[], clock:0, state:"lights", lights:0, wet:0, wetTarget,
        uid:T.id + "#" + (++SESSION_N),
        wearMul:mode === "race" ? clamp(9 / laps, 0.55, 2.2) : 0.55,
        aiScale:AI_SCALE[CFG.diff], combat:COMBAT[CFG.diff], shake:0, champ:!!champ,
        mustPit:mode === "race" && laps >= 10, assistLine:!!CFG.line, damage:!!CFG.damage,
        finishOrder:[], ended:false, ghost:null, ghostCar:null, rec:[], bestRec:null,
        toast:msg => showToast(msg) };

  // field
  const entries = [];
  for(const t of TEAMS) for(const d of t.drivers) entries.push({ t, d });
  const myIdx = entries.findIndex(e => e.t.id === CFG.teamId && e.d === (TEAMS.find(t => t.id === CFG.teamId).drivers[CFG.drvIdx]));
  // grid order: pace-based with a shuffle, then the player's chosen slot
  const order = entries.map((e, i) => ({ i, k:e.t.pace * e.d.skill + Math.random() * 0.011 }))
                       .sort((a, b) => b.k - a.k).map(o => o.i);
  if(mode === "race" && !champ){
    const want = CFG.grid === 0 ? 0 : CFG.grid === 1 ? 10 : 20;
    const at = order.indexOf(myIdx); order.splice(at, 1); order.splice(want, 0, myIdx);
  }
  if(champ && champ.grid){
    const g = champ.grid.map(a => entries.findIndex(e => e.d.abbr === a));
    order.length = 0; for(const x of g) if(x >= 0) order.push(x);
    for(let i = 0; i < entries.length; i++) if(!order.includes(i)) order.push(i);
  }
  S.gridAbbr = order.map(x => entries[x].d.abbr);
  const single = mode === "tt";
  const list = single ? [myIdx] : order;

  list.forEach((ei, slot) => {
    const e = entries[ei], c = new Car(e.t, e.d, slot, T);
    c.ai = ei !== myIdx;
    // every car finds a slightly different window each weekend
    c.pace = e.t.pace * (0.985 + e.d.skill * 0.015) * (0.9955 + Math.random() * 0.009);
    c.tyre = wetTarget > 0.4 ? TYRES.wet : (c.ai ? (slot % 3 === 0 ? TYRES.soft : slot % 3 === 1 ? TYRES.medium : TYRES.hard) : TYRES[CFG.tyre]);
    c.nextTyre = c.tyre.key === "soft" ? TYRES.hard : TYRES.soft;
    c.used.add(c.tyre.key);
    const back = single ? 0 : slot * 8.6;
    const node = single ? 0
      : mode === "race" ? (((T.n - Math.round((14 + back) / T.ds)) % T.n) + T.n) % T.n
      : Math.round(T.n * slot / list.length) % T.n;
    c.place(node, (single || mode !== "race") ? T.line[node] : (slot % 2 ? 2.7 : -2.7) * (T.half > 6 ? 1 : 0.7));
    if(mode !== "race"){ const vv = T.vprof[node] * 0.8; c.railV = vv;
      c.vx = Math.cos(c.h) * vv; c.vy = Math.sin(c.h) * vv; }
    c.pos = slot + 1;
    if(!c.ai) S.player = c;
    S.cars.push(c);
  });
  if(mode !== "race"){ S.state = "run"; S.lights = 5; }
  PART.length = 0;
  S.marks = [];
  try{ AUDIO.init(); AUDIO.resume(); AUDIO.reset(); }catch(e){}
  R.camX = 0; R.camY = 0;
  R.userZoom = 1; R.userZoomT = 99;
  S.launchCam = mode === "race" ? 1 : 0;
  R.isx = lerp(ISX, CAM_LOW.isx, S.launchCam);
  R.isy = lerp(ISY, CAM_LOW.isy, S.launchCam);
  R.zs  = lerp(ZS,  CAM_LOW.zs,  S.launchCam);
  const [cx, cy] = isoOf(S.player);
  R.camX = cx; R.camY = cy;
  $("#hud").hidden = false;
  $("#touch").hidden = !("ontouchstart" in window || navigator.maxTouchPoints > 0);
  show(null);
  buildBoard();
  hudT = 0;
  showMsg(mode === "race" ? T.name.toUpperCase() : mode === "qualy" ? "QUALIFYING" : "TIME TRIAL",
          mode === "race" ? `${laps} laps · ${(T.length / 1000).toFixed(3)} km` : T.loc, 2.2);
}
function isoOf(c){ return [(c.x - c.y) * R.isx, (c.x + c.y) * R.isy - c.z * R.zs]; }

function partColor(h, broken){
  if(broken) return "#FF4B3E";
  h = clamp(h, 0, 1);
  const mix = (a, b, t) => "rgb(" + Math.round(a[0] + (b[0] - a[0]) * t) + "," +
    Math.round(a[1] + (b[1] - a[1]) * t) + "," + Math.round(a[2] + (b[2] - a[2]) * t) + ")";
  return h > 0.5 ? mix([242, 194, 48], [47, 208, 122], (h - 0.5) * 2)
                 : mix([255, 75, 62], [242, 194, 48], h * 2);
}
function updateStatus(c){
  const paint = (sel, k) => { const col = partColor(c.health[k], c.broken.has(k));
    document.querySelectorAll(sel).forEach(n => n.setAttribute("fill", col)); };
  paint("#sv-wing, #sv-nose", "wing");
  paint("#sv-rear", "rear");
  paint("#sv-gbox", "gearbox");
  paint("#sv-eng", "engine");
  paint("#sv-floor, #sv-podL, #sv-podR", "floor");
  paint(".sv-susp", "susp");
  paint(".sv-brake", "brakes");
  const tyreCol = c.broken.has("punct") ? "#FF4B3E" : partColor(c.life, false);
  document.querySelectorAll(".sv-tyre").forEach(n => n.setAttribute("fill", tyreCol));
  const pod = document.querySelector("#sv-pod");
  if(pod) pod.setAttribute("fill", "#0E1217");
}
function requestPit(){
  const c = S.player; if(!c || c.pitting || c.stopT > 0 || c.inPit) return;
  const u = S.track.pitU(c.node);
  if(!c.pitReq && u > 0.05 && u < 0.88){ showToast("Too late — the pit entry is behind you"); return; }
  c.pitReq = !c.pitReq;
  c.pitWarned = false;
  const jobs = [...c.broken].map(k => PARTS[k].name.toLowerCase());
  showToast(c.pitReq
    ? "Box, box — pit entry open" + (jobs.length ? " · " + jobs.join(", ") + " to fix" : "")
    : "Pit call cancelled — stay out");
}

function recover(){
  const c = S.player; if(!c) return;
  const T = S.track, i = c.node;
  c.place(i, T.line[i]); c.vx = Math.cos(c.h) * 12; c.vy = Math.sin(c.h) * 12;
  c.damage = Math.max(0, c.damage - 0.15);
  showToast("Recovered to the track");
}

function playerInput(c, dt){
  if(S.state === "lights"){ c.thr = 0; c.brk = 1; c.steer = 0; return; }
  const left = KEY["arrowleft"] || KEY["a"] || TOUCH.l, right = KEY["arrowright"] || KEY["d"] || TOUCH.r;
  const up = KEY["arrowup"] || KEY["w"] || TOUCH.gas, down = KEY["arrowdown"] || KEY["s"] || TOUCH.brk;
  const target = (right ? 1 : 0) - (left ? 1 : 0);
  const rate = 6.6 - clamp(c.speed / 40, 0, 3.2);
  c.steer += clamp(target - c.steer, -rate * dt, rate * dt);
  if(!left && !right) c.steer *= Math.pow(0.02, dt);
  c.thr = up ? 1 : 0; c.brk = down ? 1 : 0;
  c.hand = (KEY[" "] ? 1 : 0);
  c.boost = ((KEY["shift"] || TOUCH.boost) && c.batt > 0.01) ? 1 : 0;
}

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
    if(S.mode === "race" && c.lap <= S.laps) openPitMenu(c, S);
  }
  if(!c.inPit && c.pitVisit && T.pitRamp(c.node) <= 0.04){
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
  const t = pitJobTime(c, plan) + Math.random() * 0.8;
  c.stopT = t; c.stopTotal = t; c.vx = c.vy = 0;
  try{ AUDIO.event("stop", c, S); }catch(e){}
  S.toast("Stopped — crew working");
}
function finishStop(c, S){
  const plan = c.pitPlan;
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

function crossLine(c){
  const T = S.track, n = T.n;
  if(c.prevNode == null){ c.prevNode = c.node; return false; }
  const a = c.prevNode, b = c.node; c.prevNode = b;
  return a > n * 0.75 && b < n * 0.25;
}

function updateTiming(c){
  const T = S.track, n = T.n, ms = S.clock * 1000;
  // sectors
  const sec = c.node < T.sec[1] ? 0 : c.node < T.sec[2] ? 1 : 2;
  if(sec !== c.curSec && !((c.curSec === 2) && sec === 0)){
    const t = ms - c.secStart;
    if(c.lapStart != null && t > 1000){ c.secT[c.curSec] = t;
      if(c.secBest[c.curSec] == null || t < c.secBest[c.curSec]) c.secBest[c.curSec] = t;
      if(S.bestSec == null) S.bestSec = [null, null, null];
      if(S.bestSec[c.curSec] == null || t < S.bestSec[c.curSec]){ S.bestSec[c.curSec] = t; c.purple = c.purple || {}; } }
    c.secStart = ms; c.curSec = sec;
  }
  if(crossLine(c)){
    if(c.lapStart != null){
      const t = ms - c.lapStart;
      if(t > 8000){
        c.last = t; c.laps.push(t); c.total += t;
        if(c.best == null || t < c.best) c.best = t;
        if(S.fastest == null || t < S.fastest){ S.fastest = t; S.fastestBy = c;
          if(!c.ai) showToast(`Fastest lap — ${fmtTime(t)}`); }
        if(!c.ai){
          if(S.mode === "tt" && (S.bestRec == null || t < (S.bestTT ?? 1e9))){ S.bestTT = t; S.bestRec = c.recBuf.slice(); }
          saveRecord(S.track.id, t, c);
        }
      }
      c.lap++;
    } else { c.lap = 1; }
    c.lapStart = ms; c.secStart = ms; c.curSec = 0;
    if(!c.ai){ c.recBuf = []; }
    if(S.mode === "race" && c.lap > S.laps && !c.finished){
      c.finished = true; c.finishTime = ms; S.finishOrder.push(c);
      if(!c.ai) endSession();
      if(S.finishOrder.length === 1 && c.ai && S.player && !S.player.finished) showToast(`${c.drv.last} takes the win`);
    }
    if(S.mode === "qualy" && c.lap > S.laps && !c.finished){ c.finished = true; if(!c.ai) endSession(); }
    // pit release
    if(c.pitReq && !c.pitting && S.mode === "race" && c.lap <= S.laps) { /* entry handled below */ }
  }
  // pit entry
  if(c.ai && c.pitReq && !c.pitting && S.mode === "race" && c.node >= T.pitIn && c.node < T.pitIn + 6 && c.lap <= S.laps){
    c.pitting = 1; c.pitS = c.node; c.pitDone = false; c.pitT = 0;
    if(!c.ai) showToast("Pit entry — limiter on");
  }
}

function positions(){
  const T = S.track;
  const arr = S.cars.filter(c => !c.dnf);
  for(const c of arr) c.prog = c.lap * T.length + c.s;
  arr.sort((a, b) => (b.finished - a.finished) || (a.finished ? a.finishTime - b.finishTime : b.prog - a.prog));
  arr.forEach((c, i) => { c.pos = i + 1; });
  const leader = arr[0];
  for(const c of arr){
    const d = leader.prog - c.prog;
    c.gap = c === leader ? null : d / Math.max(18, c.speed) * 1000;
    const ahead = arr[c.pos - 2], chaser = arr[c.pos];
    c.gapAhead = ahead ? (ahead.prog - c.prog) / Math.max(18, c.speed) * 1000 : null;
    c.gapBehind = chaser ? (c.prog - chaser.prog) / Math.max(18, c.speed) * 1000 : null;
  }
  return arr;
}

function update(dt){
  S.clock += dt;
  // lights
  if(S.state === "lights"){
    S.lights = Math.min(5, Math.floor(S.clock / 0.85));
    $("#lights").hidden = false;
    [...$("#lights").children].forEach((n, i) => n.classList.toggle("on", i < S.lights && S.clock < 5.1));
    if(S.clock > 5.1 + Math.random() * 0.0){
      S.state = "run"; S.clock = 0; $("#lights").hidden = true;
      for(const c of S.cars){
        c.lapStart = null; c.lap = 0; c.secStart = 0; c.prevNode = c.node;
        // in the window = drive; under it = bogged down; over it = wheelspin
        if(c.revs < LAUNCH_LO){ c.launchGrade = "bog"; c.launchMul = lerp(0.42, 0.9, c.revs / LAUNCH_LO); c.launchT = 2.2; }
        else if(c.revs > LAUNCH_HI){ c.launchGrade = "spin"; c.launchMul = lerp(0.85, 0.5, (c.revs - LAUNCH_HI) / (1 - LAUNCH_HI)); c.launchT = 2.0; }
        else { c.launchGrade = "good"; c.launchMul = 1.10; c.launchT = 1.6; }
      }
      const g = S.player.launchGrade;
      showMsg(g === "good" ? "GREAT START" : g === "bog" ? "BOGGED DOWN" : "WHEELSPIN",
              g === "good" ? "Perfect launch" : g === "bog" ? "Not enough revs" : "Too many revs", 1.5);
    }
  }
  // weather drift
  S.wet = lerp(S.wet, S.wetTarget, dt * 0.15);
  if(S.wetTarget > 0 && S.wet > 0.25 && !S.wetToast){ S.wetToast = true; showToast("Rain — the track is going wet"); }

  for(const c of S.cars){
    if(S.state === "lights"){
      // engines running, brakes on, nobody moves — and no creeping backwards
      c.thr = 0; c.brk = 1; c.steer = 0; c.boost = 0; c.slide = 0;
      c.vx = 0; c.vy = 0; c.railV = 0; c.aiTargetV = 0;
      if(c.ai) c.revs = clamp(LAUNCH_LO + (LAUNCH_HI - LAUNCH_LO) * (0.2 + c.drv.skill * 0.7) +
                              (Math.random() - 0.5) * 0.10, 0.15, 1);
      else {
        const gas = KEY["arrowup"] || KEY["w"] || TOUCH.gas;
        c.revs = clamp(c.revs + (gas ? 0.55 : -0.9) * dt, 0, 1);
      }
      continue;
    }
    if(c.ai) driveAI(c, S, dt);
    else { playerPit(c, S, dt); if(c.stopT > 0){ c.vx = 0; c.vy = 0; continue; } playerInput(c, dt); }
    c.step(dt, S);
    if(S.state === "run") updateTiming(c);
    // particles
    const spd = c.speed;
    if(c.slide > 0.3 && spd > 12 && Math.random() < 0.6){
      const bx = c.x - Math.cos(c.h) * 1.6, by = c.y - Math.sin(c.h) * 1.6;
      spawn(bx, by, c.z + 0.2, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, 0.4, 0.8,
            S.wet > 0.2 ? "#C9DCE8" : "#B9BEC4", 0.45, "smoke");
    }
    if(S.wet > 0.2 && spd > 14){
      const puffs = S.wet > 0.6 ? 2 : 1;
      for(let q = 0; q < puffs; q++){
        const bx = c.x - Math.cos(c.h) * (2.0 + q * 0.9), by = c.y - Math.sin(c.h) * (2.0 + q * 0.9);
        spawn(bx, by, c.z + 0.3,
              -Math.cos(c.h) * (5 + spd * 0.10) + (Math.random() - 0.5) * 6,
              -Math.sin(c.h) * (5 + spd * 0.10) + (Math.random() - 0.5) * 6,
              1.8 + Math.random() * 1.6, 0.55 + S.wet * 0.5, "#DCEAF4", 0.36 + S.wet * 0.45, "smoke");
      }
    }
    if(c.kerbShake > 0.5 && spd > 25 && Math.random() < 0.5)
      spawn(c.x, c.y, c.z + 0.1, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, 3 + Math.random() * 4, 0.35, "#FFC46B", 0.16, "spark");
    // the plank grounding out — more often on a battered or heavily loaded car
    if(spd > 30 && !c.wrecked){
      const bottoming = 0.10 + c.damage * 0.9 + (c.broken.has("floor") ? 1.2 : 0) +
                        Math.abs(c.roll || 0) * 2.2 + c.kerbShake * 0.6;
      if(Math.random() < bottoming * dt * 4){
        const bx = c.x - Math.cos(c.h) * 1.3, by = c.y - Math.sin(c.h) * 1.3;
        for(let q = 0; q < 2 + (Math.random() * 3 | 0); q++)
          spawn(bx, by, c.z + 0.06,
                -Math.cos(c.h) * (4 + Math.random() * 7) + (Math.random() - 0.5) * 4,
                -Math.sin(c.h) * (4 + Math.random() * 7) + (Math.random() - 0.5) * 4,
                1.4 + Math.random() * 3.4, 0.30 + Math.random() * 0.25,
                Math.random() < 0.75 ? "#FFC46B" : "#FFF0C0", 0.15, "spark");
      }
    }
    if(Math.abs(c.off) > S.track.half + 1.5 && spd > 14 && S.track.barrier !== "wall" && Math.random() < 0.7)
      spawn(c.x, c.y, c.z + 0.1, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, 1.5, 0.6,
            S.track.pal.ground, 0.5, "smoke");
    if(c.dnf && !c.wrecked && Math.random() < dt * 3)
      spawn(c.x, c.y, c.z + 0.4, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5,
            1.2 + Math.random(), 1.6, "#6E757D", 0.5, "smoke");
    if(c === S.player && S.mode === "tt"){ c.recBuf = c.recBuf || [];
      if(S.clock - (c.recT || 0) > 0.05){ c.recT = S.clock; c.recBuf.push([c.x, c.y, c.h, c.z]); } }
  }
  // car-to-car contact
  for(let a = 0; a < S.cars.length; a++) for(let b = a + 1; b < S.cars.length; b++){
    const A = S.cars[a], B = S.cars[b];
    if(A.dnf || B.dnf || A.pitting || B.pitting) continue;
    // only cars on the same stretch of road can touch — some circuits pass close to themselves
    let ds2 = B.s - A.s, halfL = S.track.length / 2;
    if(ds2 > halfL) ds2 -= S.track.length; else if(ds2 < -halfL) ds2 += S.track.length;
    if(Math.abs(ds2) > 22) continue;
    const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy);
    if(d < 3.4 && d > 0.001){
      const ux = dx / d, uy = dy / d, push = (3.4 - d) / 2;
      A.x -= ux * push; A.y -= uy * push; B.x += ux * push; B.y += uy * push;
      const rel = (B.vx - A.vx) * ux + (B.vy - A.vy) * uy;
      if(rel < 0){
        const imp = -rel * 0.68;
        A.vx -= ux * imp; A.vy -= uy * imp; B.vx += ux * imp; B.vy += uy * imp;
        // wheels touching throws the cars sideways and can spin them
        if(imp > 5){
          const kick = clamp(imp * 0.10, 0.2, 2.6);
          A.spinV = (A.spinV || 0) - kick * Math.sign(ds2 || 1);
          B.spinV = (B.spinV || 0) + kick * Math.sign(ds2 || 1);
          if(imp > 11){
            if(A.spinT <= 0 && !A.wrecked){ A.spinT = 0.7 + Math.random() * 0.8; }
            if(B.spinT <= 0 && !B.wrecked){ B.spinT = 0.7 + Math.random() * 0.8; }
          }
          const mx2 = (A.x + B.x) / 2, my2 = (A.y + B.y) / 2;
          for(let q = 0; q < Math.min(12, 3 + imp | 0); q++)
            spawn(mx2, my2, A.z + 0.3, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14,
                  2 + Math.random() * 7, 0.3 + Math.random() * 0.4,
                  q % 3 ? "#FFC46B" : "#C9CED4", 0.2, "spark");
          if(imp > 9){ A.scuff(S, imp * 0.7); }
        }
        if(imp > 9){
          const nose = Math.abs(ds2) < 2.2 ? "side" : (ds2 > 0 ? "front" : "rear");
          const tail = Math.abs(ds2) < 2.2 ? "side" : (ds2 > 0 ? "rear" : "front");
          A.hurt(imp * 0.75, nose, S); B.hurt(imp * 0.75, tail, S);
        }
        if(A === S.player || B === S.player) S.shake = Math.min(1, S.shake + imp * 0.04);
        
      }
    }
  }
  stepParts(dt);
  positions();

  // ghost playback
  if(S.mode === "tt" && S.bestRec && S.player.lapStart != null){
    const t = (S.clock * 1000 - S.player.lapStart) / 50 | 0;
    const f = S.bestRec[Math.min(t, S.bestRec.length - 1)];
    if(f){ if(!S.ghostCar){ S.ghostCar = new Car(S.player.team, S.player.drv, 99, S.track); }
      S.ghostCar.x = f[0]; S.ghostCar.y = f[1]; S.ghostCar.h = f[2]; S.ghostCar.z = f[3]; S.ghost = true; }
  }
  S.shake = Math.max(0, S.shake - dt * 2.6);
  try{ AUDIO.frame(S, dt); }catch(e){}
  // your own accident plays out before the classification comes up
  if(S.crashCam > 0){
    S.crashCam -= dt;
    const settled = !S.player.wrecked && S.player.speed < 1.2;
    if(S.crashCam <= 0 || (settled && S.crashCam < 5.6)){ S.crashCam = 0; endSession(); }
  }

  // camera
  const p = S.player;
  // real accelerations, for the way the camera leans
  const ax = ((p.vx - (p.pvx == null ? p.vx : p.pvx)) / Math.max(dt, 1e-4));
  const ay = ((p.vy - (p.pvy == null ? p.vy : p.pvy)) / Math.max(dt, 1e-4));
  p.pvx = p.vx; p.pvy = p.vy;
  const gLat = clamp((-ax * Math.sin(p.h) + ay * Math.cos(p.h)) / 30, -1.4, 1.4);
  const gFwd = clamp((ax * Math.cos(p.h) + ay * Math.sin(p.h)) / 30, -1.4, 1.4);
  S.gLat = lerp(S.gLat || 0, gLat, 1 - Math.pow(0.02, dt));
  S.gFwd = lerp(S.gFwd || 0, gFwd, 1 - Math.pow(0.02, dt));
  if(S.tv){
    S.tv.t -= dt;
    if(S.tv.t <= 0 || S.crashCam || p.dnf){ R.persp = false; R.tv = false; S.tv = null; R.froll = 0; R.fpitch = 0; }
    else {
      R.persp = true; R.tv = true; R.focal = R.W * 0.78;
      const tx3 = p.x + p.vx * 0.12, ty3 = p.y + p.vy * 0.12, tz3 = p.z + 0.7;
      R.fx = S.tv.x; R.fy = S.tv.y; R.fz = S.tv.z;
      const look = Math.atan2(ty3 - R.fy, tx3 - R.fx);
      R.fcos = Math.cos(look); R.fsin = Math.sin(look);
      const f = Math.max((tx3 - R.fx) * R.fcos + (ty3 - R.fy) * R.fsin, 1);
      R.fpitch = -(tz3 - R.fz) * (R.focal / f) + R.H * 0.06;
      R.froll = 0; R.shakeY = 0;
      return;
    }
  }
  R.froll = 0; R.fpitch = 0;
  const wantLow = S.state === "lights" ? 1 : 0;
  S.launchCam = wantLow ? 1 : Math.max(0, (S.launchCam || 0) - dt * 0.5);
  const lc = S.launchCam * S.launchCam * (3 - 2 * S.launchCam);      // ease out
  R.isx = lerp(ISX, CAM_LOW.isx, lc);
  R.isy = lerp(ISY, CAM_LOW.isy, lc);
  R.zs  = lerp(ZS,  CAM_LOW.zs,  lc);
  const lead = lerp(0.55, 0, lc);
  const ahead = lc * 20;                                             // look up the road
  const [tx, ty0] = isoOf({ x:p.x + p.vx * lead + Math.cos(p.h) * ahead,
                            y:p.y + p.vy * lead + Math.sin(p.h) * ahead, z:p.z });
  const ty = ty0 - lc * 0.17 * R.H / Math.max(R.zoom, 1);            // sit the car low in frame
  R.camX = lerp(R.camX, tx, 1 - Math.pow(0.0008, dt));
  R.camY = lerp(R.camY, ty, 1 - Math.pow(0.0008, dt));
  const inLane = p.inPit || p.stopT > 0 || p.pitting;
  S.pitFocus = lerp(S.pitFocus || 0, inLane ? 1 : 0, 1 - Math.pow(0.05, dt));
  R.targZoom = lerp(clamp(Math.min(R.W, R.H) / (46 + p.speed * 0.50), 4.4, 14),
                    clamp(Math.min(R.W, R.H) / 27, 7, 19), S.pitFocus);
  R.targZoom = lerp(R.targZoom, clamp(Math.min(R.W, R.H) / 32, 6.5, 15), lc);
  if(S.crashCam > 0) R.targZoom = lerp(R.targZoom, clamp(Math.min(R.W, R.H) / 56, 5, 10), 0.7);
  R.targZoom *= S.track.def.zoomK || 1;                              // a street circuit wants the camera in close
  R.userZoomT += dt;
  if(R.userZoomT > ZOOM_HOLD) R.userZoom = lerp(R.userZoom, 1, 1 - Math.pow(0.22, dt));
  if(Math.abs(R.userZoom - 1) < 0.004) R.userZoom = 1;
  R.targZoom = clamp(R.targZoom * R.userZoom, 2.2, 34);
  // a deliberate nudge should land quickly; the drift back should not
  R.zoom = lerp(R.zoom, R.targZoom, 1 - Math.pow(R.userZoomT < ZOOM_HOLD ? 0.0006 : 0.02, dt));
  R.shakeY = (Math.random() - 0.5) * S.shake * 9 + (p.kerbShake > 0.5 ? (Math.random() - 0.5) * 2.2 : 0);
}

/* ---------- end of session ---------- */
function endSession(){
  if(S.ended) return; S.ended = true; S.state = "done";
  try{ AUDIO.silence(); }catch(e){}
  const arr = positions();
  const T = S.track;
  const res = arr.map(c => {
    const gap = c === arr[0] ? null : (c.finished && arr[0].finished ? c.finishTime - arr[0].finishTime : c.gap);
    return { car:c, pos:c.pos, gap, best:c.best, stops:c.stops, tyre:c.tyre };
  });
  const out = S.cars.filter(c => c.dnf).sort((a, b) => (b.prog || 0) - (a.prog || 0));
  for(const c of out) res.push({ car:c, pos:res.length + 1, gap:null, best:c.best, stops:c.stops, tyre:c.tyre, dnf:true });
  res.forEach((r, i) => r.pos = i + 1);
  // two-compound rule
  if(S.mode === "race" && S.mustPit){
    for(const r of res) if(!r.dnf && r.car.used.size < 2){ r.dq = true; }
    res.sort((a, b) => (a.dnf - b.dnf) || (a.dq - b.dq) || (a.pos - b.pos));
    res.forEach((r, i) => r.pos = i + 1);
  }
  S.results = res;
  if(S.champ && S.mode === "race") applyChampionship(res);
  const sess = S; setTimeout(() => { if(S === sess) showResults(res); }, 900);
  showMsg(S.player.dnf ? "DNF" : S.mode === "qualy" ? "CHEQUERED FLAG" : "FINISH",
    S.player.dnf ? (S.player.retiredBy || "Retired") : S.mode !== "race" ? "Session over" : S.player.pos === 1 ? "Race win" : `P${S.player.pos}`, 2.4);
  $("#flag").classList.add("on"); setTimeout(() => $("#flag").classList.remove("on"), 1400);
}

function loop(t){
  requestAnimationFrame(loop);
  const dt = Math.min(0.033, (t - lastT) / 1000 || 0.016); lastT = t;
  if(!S){ return; }
  if(!paused && !S.menuOpen && S.state !== "done") update(dt);
  else if(!paused && S.state === "done") { S.clock += dt; stepParts(dt); }
  renderWorld(S);
  if(R.tv && S.tv){
    const ctx = R.ctx; ctx.save(); ctx.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
    ctx.fillStyle = "rgba(10,12,16,.72)"; ctx.fillRect(18, R.H - 54, 190, 34);
    ctx.fillStyle = "#FF3B30"; ctx.beginPath(); ctx.arc(34, R.H - 37, 6, 0, TAU); ctx.fill();
    ctx.fillStyle = "#F2F2F2"; ctx.font = "700 15px 'Saira Condensed',sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText("LIVE · " + S.tv.name, 48, R.H - 37);
    ctx.restore();
  }
  hudT += dt;
  if(hudT > 0.07){ hudT = 0; updateHUD(); drawMini(S); }
}

/* ---------- 9. sound ------------------------------------------------------
   Everything here is synthesised — no samples. Engines are exhaust-pulse trains
   fired through fixed formants, tyres and crew are filtered noise, and the radio
   is on-screen text cued by a squelch beep.
   -------------------------------------------------------------------------- */
const AUDIO = {
  ok:false, on:true, ctx:null, master:null, noiseBuf:null,
  eng:null, traf:[], squeal:null, crowd:null, wind:null,
  lastSay:0, lastCom:0, lastGap:0, lastPos:0, gunT:0, yellT:0,
  saidBox:false, saidTyre:false, saidStart:false,

  init(){
    if(this.ctx || !this.on) return;
    try{
      const AC = window.AudioContext || window.webkitAudioContext;
      if(!AC) return;
      const c = this.ctx = new AC();
      const m = this.master = c.createGain();
      m.gain.value = 0.5; m.connect(c.destination);
      const len = Math.floor(c.sampleRate * 2);
      const buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      let last = 0;
      for(let i = 0; i < len; i++){ const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = w * 0.7 + last * 1.6; }
      this.noiseBuf = buf;
      this.ok = true;
      this.loadSamples();
    }catch(e){ this.ok = false; }
  },
  resume(){ if(this.ctx && this.ctx.state === "suspended") this.ctx.resume(); },

  /* ---- recorded samples ---------------------------------------------------
     Engines are two looping layers crossfaded by revs, each resampled with
     playbackRate so pitch tracks continuously — the standard racing-game trick.
     If anything fails to load we fall back to the synthesised engine.        */
  SRC:{ gun:gunUrl, radio:radioUrl },
  buf:{}, useSamples:false, loading:false,

  // works whether the clip is a file alongside the page or inlined as a data URI
  fetchAudio(url){
    if(url.slice(0, 5) === "data:"){
      try{
        const bin = atob(url.slice(url.indexOf(",") + 1));
        const ab = new ArrayBuffer(bin.length), v = new Uint8Array(ab);
        for(let i = 0; i < bin.length; i++) v[i] = bin.charCodeAt(i);
        return Promise.resolve(ab);
      }catch(e){ return Promise.reject(e); }
    }
    return fetch(url).then(r => r.ok ? r.arrayBuffer() : Promise.reject(r.status));
  },
  loadSamples(){
    if(this.loading || !this.ctx) return;
    this.loading = true;
    const names = Object.keys(this.SRC);
    let done = 0;
    names.forEach(nm => {
      this.fetchAudio(this.SRC[nm])
        .then(ab => new Promise((res, rej) => {
          const p = this.ctx.decodeAudioData(ab, res, rej);
          if(p && p.then) p.then(res, rej);
        }))
        .then(b => { this.buf[nm] = b; })
        .catch(() => {})
        .finally(() => { if(++done === names.length) this.samplesReady(); });
    });
  },
  samplesReady(){
    try{
      this.useSamples = true;
    }catch(e){ this.useSamples = false; }
  },
  /* one engine recording, resampled across the whole rev range */
  sVoice(buf, simple){
    const c = this.ctx, out = c.createGain(); out.gain.value = 0;
    const pan = c.createStereoPanner ? c.createStereoPanner() : null;
    const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 5000; lp.Q.value = 0.4;
    const hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 60;
    const s2 = c.createBufferSource(); s2.buffer = buf; s2.loop = true;
    // keep the loop away from the clip's own fade in and out
    s2.loopStart = Math.min(0.2, buf.duration * 0.05);
    s2.loopEnd = Math.max(s2.loopStart + 0.4, buf.duration - 0.15);
    const g = c.createGain(); g.gain.value = 0;
    s2.connect(g); g.connect(hp); hp.connect(lp); lp.connect(out);
    if(pan){ out.connect(pan); pan.connect(this.master); } else out.connect(this.master);
    s2.start(0, s2.loopStart + Math.random() * (s2.loopEnd - s2.loopStart) * 0.8);
    return { set:(rn, thr, vol, pv, dop) => {
      const t = c.currentTime, r = clamp(rn, -0.4, 1.35);
      s2.playbackRate.setTargetAtTime(clamp((0.60 + r * 1.00) * (dop || 1), 0.3, 3), t, 0.035);
      g.gain.setTargetAtTime(vol, t, 0.06);
      lp.frequency.setTargetAtTime(1200 + thr * 8500 + Math.max(0, r) * 3200, t, 0.05);
      out.gain.setTargetAtTime(vol > 0 ? 1 : 0, t, 0.05);
      if(pan) pan.pan.setTargetAtTime(pv, t, 0.07);
    } };
  },
  sLoop(b, startAt){
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = b; s.loop = true;
    s.loopStart = Math.min(0.2, b.duration * 0.05);
    s.loopEnd = Math.max(s.loopStart + 0.5, b.duration - 0.15);
    const g = c.createGain(); g.gain.value = 0;
    const pan = c.createStereoPanner ? c.createStereoPanner() : null;
    s.connect(g);
    if(pan){ g.connect(pan); pan.connect(this.master); } else g.connect(this.master);
    s.start(0, startAt || s.loopStart);
    return { src:s, gain:g, pan, set:(v, rate, pv) => { const t = c.currentTime;
      g.gain.setTargetAtTime(v, t, 0.10);
      if(rate) s.playbackRate.setTargetAtTime(rate, t, 0.1);
      if(pan && pv != null) pan.pan.setTargetAtTime(pv, t, 0.12); } };
  },
  /* fire a slice of a sample as a one-shot */
  slice(name, off, dur, vol, pv, rate){
    const b = this.buf[name];
    if(!b || !this.ok) return false;
    const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = b; s.playbackRate.value = rate || 1;
    const g = c.createGain();
    const d = Math.min(dur, Math.max(0.05, b.duration - off));
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + Math.min(0.03, d * 0.25));
    g.gain.setTargetAtTime(0.0001, t + d * 0.7, d * 0.25);
    const pan = c.createStereoPanner ? c.createStereoPanner() : null;
    s.connect(g);
    if(pan){ pan.pan.value = pv || 0; g.connect(pan); pan.connect(this.master); } else g.connect(this.master);
    s.start(t, clamp(off, 0, Math.max(0, b.duration - 0.1)), d);
    s.stop(t + d / (rate || 1) + 0.1);
    return true;
  },
  /* An engine is a train of exhaust pulses fired through fixed resonances.
     The pulse RATE tracks revs; the resonances do NOT move — that is what stops
     it sounding like a synth sweep. Harmonic-rich periodic wave -> four fixed
     formants -> mechanical noise on top. */
  engineWave(){
    if(this._wave) return this._wave;
    const N = 24, real = new Float32Array(N), imag = new Float32Array(N);
    for(let i = 1; i < N; i++){
      const roll = Math.pow(i, -0.85);                       // spectral tilt
      const lumpy = 1 + 0.35 * Math.sin(i * 1.9) + 0.18 * Math.sin(i * 4.3);
      imag[i] = roll * lumpy * (i % 2 ? 1 : 0.72);           // uneven firing
    }
    return (this._wave = this.ctx.createPeriodicWave(real, imag, { disableNormalization:false }));
  },
  voice(simple){
    const c = this.ctx, out = c.createGain(); out.gain.value = 0;
    const pan = c.createStereoPanner ? c.createStereoPanner() : null;

    // fixed exhaust / bodyshell resonances — these never track rpm
    const mkF = (type, f, q, g) => { const b = c.createBiquadFilter(); b.type = type;
      b.frequency.value = f; b.Q.value = q; if(g != null) b.gain.value = g; return b; };
    const sum = c.createGain(); sum.gain.value = 1;
    const fm1 = mkF("bandpass", 165, 7), fm2 = mkF("bandpass", 480, 5.5),
          fm3 = mkF("bandpass", 1180, 4), fm4 = mkF("peaking", 2550, 1.6, 7);
    const gm1 = c.createGain(), gm2 = c.createGain(), gm3 = c.createGain();
    gm1.gain.value = 0.9; gm2.gain.value = 0.55; gm3.gain.value = 0.3;
    const tone = c.createGain();                              // brightness control
    const lp = mkF("lowpass", 1400, 0.7);

    const osc = c.createOscillator(); osc.setPeriodicWave(this.engineWave());
    const sub = c.createOscillator(); sub.type = "sine";
    const subg = c.createGain(); subg.gain.value = 0.32;
    osc.connect(fm1); osc.connect(fm2); osc.connect(fm3); osc.connect(fm4);
    fm1.connect(gm1); fm2.connect(gm2); fm3.connect(gm3);
    gm1.connect(sum); gm2.connect(sum); gm3.connect(sum); fm4.connect(sum);
    sub.connect(subg); subg.connect(sum);
    sum.connect(lp); lp.connect(tone); tone.connect(out);
    tone.gain.value = 1;

    // valvetrain / induction rattle, level rises with revs
    let mechG = null;
    if(!simple){
      const ns = c.createBufferSource(); ns.buffer = this.noiseBuf; ns.loop = true;
      const bp = mkF("bandpass", 2600, 1.1);
      mechG = c.createGain(); mechG.gain.value = 0;
      ns.connect(bp); bp.connect(mechG); mechG.connect(lp); ns.start();
    }
    if(pan){ out.connect(pan); pan.connect(this.master); } else out.connect(this.master);
    osc.start(); sub.start();

    let jitter = 0, jt = 0;
    return { set:(fire, thr, vol, pv, bright, dt) => {
      const t = c.currentTime;
      // combustion is never perfectly even — a touch of wander keeps it organic
      jt -= dt || 0.016;
      if(jt <= 0){ jt = 0.045 + Math.random() * 0.05; jitter = (Math.random() - 0.5) * 0.022; }
      const f = Math.max(20, fire * (1 + jitter));
      osc.frequency.setTargetAtTime(f, t, 0.012);
      sub.frequency.setTargetAtTime(f / 3, t, 0.02);
      // on throttle the upper formants open up; off throttle it goes hollow
      gm2.gain.setTargetAtTime(0.35 + thr * 0.5, t, 0.05);
      gm3.gain.setTargetAtTime(0.12 + thr * 0.42, t, 0.05);
      lp.frequency.setTargetAtTime(bright, t, 0.04);
      if(mechG) mechG.gain.setTargetAtTime(0.012 + 0.03 * clamp(fire / 600, 0, 1), t, 0.06);
      out.gain.setTargetAtTime(vol, t, 0.05);
      if(pan) pan.pan.setTargetAtTime(pv, t, 0.07);
    } };
  },
  noiseVoice(type, freq, q, g){
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const gn = c.createGain(); gn.gain.value = g;
    const pan = c.createStereoPanner ? c.createStereoPanner() : null;
    src.connect(f); f.connect(gn);
    if(pan){ gn.connect(pan); pan.connect(this.master); } else gn.connect(this.master);
    src.start();
    return { gain:gn, filt:f, pan, set:(v, fr, pv) => { const t = c.currentTime;
      gn.gain.setTargetAtTime(v, t, 0.08);
      if(fr) f.frequency.setTargetAtTime(fr, t, 0.1);
      if(pan && pv != null) pan.pan.setTargetAtTime(pv, t, 0.1); } };
  },
  /* short one-shots */
  burst(freq, q, dur, vol, pv, type){
    if(!this.ok) return;
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = type || "bandpass"; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + Math.min(0.02, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const pan = c.createStereoPanner ? c.createStereoPanner() : null;
    src.connect(f); f.connect(g);
    if(pan){ pan.pan.value = pv || 0; g.connect(pan); pan.connect(this.master); } else g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.05);
  },
  pop(v){
    return;
    if(this.slice("backfire", 0.05 + Math.random() * 0.5, 0.35, 0.30 * v, (Math.random() - 0.5) * 0.4, 0.9 + Math.random() * 0.5)) return;
    this.burst(220 + Math.random() * 900, 3, 0.07, 0.07 * v, (Math.random() - 0.5) * 0.4);
  },
  whoosh(pv, spd){
    return;
    if(!this.ok) return;
    if(this.buf.passby && this.slice("passby", 2 + Math.random() * 25, 0.7,
        clamp(0.25 + spd * 0.02, 0.1, 0.6), pv, 1.05 + Math.random() * 0.25)) return;
    const c = this.ctx, t = c.currentTime, dur = 0.42;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 1.1;
    f.frequency.setValueAtTime(1800, t); f.frequency.exponentialRampToValueAtTime(380, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(clamp(0.05 + spd * 0.006, 0.02, 0.16), t + 0.10);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const pan = c.createStereoPanner ? c.createStereoPanner() : null;
    src.connect(f); f.connect(g);
    if(pan){ pan.pan.setValueAtTime(pv, t); pan.pan.linearRampToValueAtTime(-pv, t + dur); g.connect(pan); pan.connect(this.master); }
    else g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.05);
  },
  gun(pv){   // wheel gun
    if(!this.ok) return;
    if(this.slice("gun", 0.1 + Math.random() * 2.8, 0.42, 0.5, pv, 0.95 + Math.random() * 0.3)) return;
    const c = this.ctx, t = c.currentTime, dur = 0.34 + Math.random() * 0.3;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1500 + Math.random() * 700; f.Q.value = 2.2;
    const g = c.createGain(); g.gain.value = 0;
    const lfo = c.createOscillator(); lfo.type = "square"; lfo.frequency.value = 42 + Math.random() * 16;
    const lg = c.createGain(); lg.gain.value = 0.10;
    lfo.connect(lg); lg.connect(g.gain); lfo.start(t); lfo.stop(t + dur);
    const env = c.createGain(); env.gain.setValueAtTime(1, t);
    env.gain.setTargetAtTime(0.0001, t + dur * 0.7, 0.08);
    const pan = c.createStereoPanner ? c.createStereoPanner() : null;
    src.connect(f); f.connect(g); g.connect(env);
    if(pan){ pan.pan.value = pv || 0; env.connect(pan); pan.connect(this.master); } else env.connect(this.master);
    src.start(t); src.stop(t + dur + 0.1);
  },
  yell(){    // a crew member shouting, heard from inside a helmet
    if(!this.ok) return;
    const c = this.ctx, t = c.currentTime, dur = 0.22 + Math.random() * 0.25;
    const o = c.createOscillator(); o.type = "sawtooth";
    o.frequency.setValueAtTime(130 + Math.random() * 90, t);
    o.frequency.linearRampToValueAtTime(90 + Math.random() * 120, t + dur);
    const f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 700 + Math.random() * 500; f.Q.value = 4;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.035, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  },
  squelch(){
    if(this.slice("radio", 0.02, 0.7, 0.45, 0, 1)) return;
    this.burst(1200, 5, 0.06, 0.05, 0, "bandpass");
  },

  /* ---- speech: race engineer and commentary box ---- */
  say(text, who, priority){
    if(!this.on) return;
    const now = performance.now() / 1000;
    const lane = who === "com" ? "lastCom2" : "lastEng2";
    const gap = who === "com" ? 5 : 7;
    if(!priority && now - (this[lane] || 0) < gap) return;
    this[lane] = now;
    this.banner(text, who);
    try{ this.squelch(); }catch(e){}
  },
  banner(text, who){
    const n = document.getElementById("h-radio");
    if(!n) return;
    n.classList.toggle("com", who === "com");
    document.getElementById("h-radio-who").textContent = who === "com" ? "Commentary" : "Race engineer";
    document.getElementById("h-radio-txt").textContent = text;
    n.hidden = false; n.style.opacity = "1";
    clearTimeout(this._bt);
    this._bt = setTimeout(() => { n.style.opacity = "0";
      this._bt2 = setTimeout(() => { n.hidden = true; }, 300); }, 4200);
  },
  silence(){
    try{
      const n = document.getElementById("h-radio"); if(n) n.hidden = true;
    }catch(e){}
  },

  /* ---- events from the simulation ---- */
  event(kind, car, S, extra){
    if(!this.ok || !this.on || !S || !car) return;
    const isMe = S.player === car, last = car.drv ? car.drv.last : "";
    const pick = arr => arr[(Math.random() * arr.length) | 0];
    if(kind === "fail"){
      if(isMe) this.say("We're seeing damage. " + extra + ". Box when you can.", "eng", true);
      else this.say(pick(["Trouble for " + last + "! That looks like " + extra.toLowerCase() + ".",
                          "Oh, " + last + " is in trouble — " + extra.toLowerCase() + " damage there.",
                          "Big problem for " + last + ", that's the " + extra.toLowerCase() + " gone."]), "com", true);
    } else if(kind === "out"){
      if(isMe) this.say("That's the end of our race. Sorry about that.", "eng", true);
      else this.say(pick(["And that is the end of " + last + "'s race!",
                          last + " is out! What a blow for them.",
                          "It's all over for " + last + "."]), "com", true);
      this.burst(140, 1.2, 0.8, 0.16, 0, "lowpass");
    } else if(kind === "moment"){
      if(isMe) return;
      this.say(pick([last + " has a huge moment there!",
                     "Lock up for " + last + "!",
                     last + " runs wide — that will cost him.",
                     "Ooh, " + last + " nearly lost that one!"]), "com");
    } else if(kind === "pitstop"){
      if(isMe) return;
      this.say(pick([last + " peels into the pit lane.",
                     "And " + last + " is coming in for service.",
                     last + " takes the pit entry — interesting strategy call."]), "com");
    } else if(kind === "pass"){
      this.say(pick(["Great move! " + last + " takes the place.",
                     last + " is through — that was brave.",
                     "Wheel to wheel, and " + last + " makes it stick!"]), "com");
    } else if(kind === "stop"){
      this.gunT = 0; this.yellT = 0;
    } else if(kind === "away"){
      if(isMe) this.say("Away you go. " + extra, "eng", true);
    }
  },

  /* ---- the engineer's own running commentary ---- */
  engineer(S, dt){
    const p = S.player, now = performance.now() / 1000;
    if(S.state === "lights" && !this.saidStart){ this.saidStart = true;
      this.say("Radio check. Lights out shortly — let's have a clean start.", "eng", true); return; }
    if(S.mode !== "race") return;
    if(!this.saidBox && S.mustPit && p.stops === 0 && p.lap >= Math.max(2, Math.floor(S.laps * 0.42))){
      this.saidBox = true;
      this.say("Box this lap, box box. Pit entry is on the " + (S.track.pitSide < 0 ? "right" : "left") + ".", "eng", true);
      return;
    }
    if(!this.saidTyre && p.life < 0.3){
      this.saidTyre = true;
      this.say("Tyres are going away now. Start thinking about a stop.", "eng", true);
      return;
    }
    if(p.damage > 0.45 && !this.saidDmg){ this.saidDmg = true;
      this.say("The car has taken a knock. Keep an eye on it.", "eng", true); return; }
    if(now - this.lastGap > 15){
      this.lastGap = now;
      const lines = [];
      if(p.pos === 1) lines.push("You're leading. Gap behind is " + ((p.gapBehind || 1500) / 1000).toFixed(1) + ".");
      else if(p.gapAhead != null) lines.push("Gap to the car ahead, " + (p.gapAhead / 1000).toFixed(1) + ".");
      if(p.life < 0.55) lines.push("Tyres at " + Math.round(p.life * 100) + " per cent.");
      if(p.batt > 0.8) lines.push("Full battery — use the override on the straight.");
      if(S.wet > 0.3 && p.tyre.key !== "wet") lines.push("It's raining and you're on slicks. Be careful out there.");
      if(p.best) lines.push("Last lap was " + fmtTime(p.last) + ". Keep it up.");
      if(lines.length) this.say(lines[(Math.random() * lines.length) | 0], "eng");
    }
    if(this.lastPos && p.pos < this.lastPos) this.say("P" + p.pos + " now. Well done.", "eng", true);
    else if(this.lastPos && p.pos > this.lastPos) this.say("We've lost a place, P" + p.pos + ". Head down.", "eng");
    this.lastPos = p.pos;
  },

  /* ---- per-frame mix: crew, crowd and radio only ---- */
  frame(S, dt){
    if(!this.ok || !this.on || !S || !S.player) return;
    const p = S.player;
    if(p.dnf || S.state === "done"){ this.silence(); return; }
    // ---- pit crew ----
    if(p.stopT > 0){
      this.gunT -= dt; this.yellT -= dt;
      if(this.gunT <= 0){ this.gunT = 0.20 + Math.random() * 0.22; this.gun((Math.random() - 0.5) * 1.5); }
      if(this.yellT <= 0){ this.yellT = 0.5 + Math.random() * 1.1; this.yell(); }
    }

    this.engineer(S, dt);
  },
  reset(){ this.saidBox = false; this.saidTyre = false; this.saidStart = false; this.saidDmg = false;
    this.lastPos = 0; this.lastGap = 0; this.lastEng2 = 0; this.lastCom2 = 0; },
  toggle(){
    this.on = !this.on;
    if(this.master) this.master.gain.value = this.on ? 0.5 : 0;
    showToast(this.on ? "Sound on" : "Sound muted");
  },
};
addEventListener("pointerdown", () => { AUDIO.init(); AUDIO.resume(); }, { passive:true });
addEventListener("keydown", () => { AUDIO.init(); AUDIO.resume(); });

/* ---------- 7. interface -------------------------------------------------- */
const SCREENS = ["screen-title", "screen-setup", "screen-results", "screen-standings"];
function show(id){
  for(const s of SCREENS) document.getElementById(s).hidden = (s !== id);
  const racing = id === null;
  $("#hud").hidden = !racing || !S;
  $("#touch").hidden = !racing || !("ontouchstart" in window || navigator.maxTouchPoints > 0);
}
let msgT = 0;
function showMsg(big, small, secs){
  const m = $("#msg"); $("#msg-b").textContent = big; $("#msg-s").textContent = small || "";
  m.hidden = false; clearTimeout(msgT); msgT = setTimeout(() => { m.hidden = true; }, secs * 1000);
}
let toastT = 0;
function showToast(txt){
  const t = $("#toast"); t.textContent = txt; t.classList.add("on");
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), 2600);
}
function togglePause(){
  if(!S || S.state === "done") return;
  setPaused(!paused); $("#pause").hidden = !paused;
  if(paused) try{ AUDIO.silence(); }catch(e){}
  const eb = document.getElementById("pb-end");
  if(eb) eb.hidden = !(S && S.mode !== "race");
  if(paused) $("#pause-sub").textContent =
    `${S.track.name} · ${S.mode === "race" ? "Race" : S.mode === "qualy" ? "Qualifying" : "Time trial"} · Lap ${Math.max(1, S.player.lap)}${S.mode === "race" ? " of " + S.laps : ""}`;
}

function buildBoard(){
  const b = $("#h-board"); b.innerHTML = "";
  for(let i = 0; i < 6; i++){
    const r = el("div", "tw", `<span class="p"></span><span class="n"></span><span class="g"></span>`);
    b.appendChild(r);
  }
}
function rpmOfCar(c){
  const kph = c.speed * 3.6, gear = clamp(Math.ceil(kph / 42), 1, 8);
  return 4200 + clamp((kph - (gear - 1) * 42) / 42, 0, 1) * 9200;
}
function updateHUD(){
  if(!S || !S.player) return;
  const c = S.player, T = S.track, ms = S.clock * 1000;
  $("#h-pos").innerHTML = `${c.pos}<small>/${S.cars.length}</small>`;
  $("#h-lap").innerHTML = S.mode === "race" ? `${clamp(c.lap, 1, S.laps)}<small>/${S.laps}</small>`
    : `${Math.max(1, c.lap)}<small>/∞</small>`;
  const cur = c.lapStart == null ? 0 : ms - c.lapStart;
  $("#h-time").textContent = c.lapStart == null ? "OUT LAP" : fmtTime(cur);
  for(let i = 0; i < 3; i++){
    const n = document.getElementById("s" + (i + 1)), t = c.secT[i];
    n.style.background = t == null ? "#2B333D"
      : (S.bestSec && t <= S.bestSec[i]) ? "var(--purple)"
      : (t <= c.secBest[i]) ? "var(--green)" : "var(--yellow)";
  }
  $("#h-last").textContent = c.best ? `Best ${fmtTime(c.best)}` : c.last ? `Last ${fmtTime(c.last)}` : "No time set";
  const cond = $("#h-cond");
  if(S.wet > 0.12){
    cond.hidden = false;
    cond.textContent = (S.wet > 0.65 ? "Heavy rain" : S.wet > 0.35 ? "Rain" : "Light rain") +
      (c.tyre.key === "wet" ? "" : " · slicks");
    cond.style.color = c.tyre.key === "wet" ? "var(--cyan)" : "var(--red)";
  } else cond.hidden = true;
  const ty = c.tyre;
  const cmp = $("#h-cmp"); cmp.textContent = ty.label; cmp.style.setProperty("--tyc", ty.col);
  const wear = $("#h-wear"); wear.style.width = (c.life * 100).toFixed(0) + "%";
  wear.style.background = c.life > 0.55 ? "var(--green)" : c.life > 0.25 ? "var(--yellow)" : "var(--red)";
  const dbox = $("#h-dmg"), anyD = c.damage > 0.02 || c.broken.size > 0;
  dbox.hidden = !anyD;
  if(anyD){
    const bar = $("#h-dmgbar");
    bar.style.width = (clamp(c.damage, 0, 1) * 100).toFixed(0) + "%";
    bar.style.background = c.damage > 0.6 ? "var(--red)" : c.damage > 0.3 ? "var(--yellow)" : "var(--green)";
    dbox.classList.toggle("bad", c.broken.size > 0);
    const chips = [...c.broken].map(k => "<b>" + PARTS[k].label + "</b>").join("");
    const host = $("#h-chips");
    if(host.dataset.k !== chips){ host.dataset.k = chips; host.innerHTML = chips; }
  }
  $("#h-lim").hidden = !c.inPit;
  $("#h-status").hidden = false;
  updateStatus(c);
  $("#h-ebat").textContent = Math.round(c.batt * 100) + "%";
  $("#h-ebar").style.width = (c.batt * 100).toFixed(0) + "%";
  $("#h-energy").classList.toggle("on", c.boost > 0 && c.batt > 0.01);
  const kph = c.speed * 3.6;
  const launching = S.state === "lights";
  const revN = launching ? c.revs : clamp((rpmOfCar(c) - 4200) / 9200, 0, 1);
  const bar = $("#h-tachbar");
  $("#h-tach").style.width = (revN * 100).toFixed(1) + "%";
  bar.classList.toggle("good", launching && c.revs >= LAUNCH_LO && c.revs <= LAUNCH_HI);
  bar.classList.toggle("hot", launching ? c.revs > LAUNCH_HI : revN > 0.9);
  $("#h-spd").textContent = Math.round(kph);
  $("#h-gear").textContent = c.speed < 0.5 ? "N" : clamp(Math.ceil(kph / 42), 1, 8);

  const arr = S.cars.filter(x => !x.dnf).sort((a, b) => a.pos - b.pos);
  let start = clamp(c.pos - 3, 0, Math.max(0, arr.length - 6));
  const rows = $("#h-board").children;
  for(let i = 0; i < 6; i++){
    const o = arr[start + i], r = rows[i];
    if(!o){ r.style.display = "none"; continue; }
    r.style.display = "";
    r.classList.toggle("me", o === c);
    r.style.setProperty("--c", o.team.body);
    r.children[0].textContent = o.pos;
    r.children[1].textContent = o.drv.abbr;
    r.children[2].textContent = o === arr[0] ? "LEADER" : fmtGap(o.gapAhead);
  }
}

/* ---------- setup screen ---------- */
function seg(name){
  const host = document.getElementById("opt-" + name); host.innerHTML = "";
  const key = name === "laps" ? "lapsIdx" : name;
  OPTS[name].forEach(([label, val]) => {
    const b = el("button", CFG[key] === val ? "on" : "", label);
    b.onclick = () => { CFG[key] = val; store("cfg", CFG); seg(name); };
    host.appendChild(b);
  });
}
function buildSetup(mode){
  CFG.mode = mode;
  $("#setup-mode").textContent = mode === "champ" ? "Championship weekend" : mode === "tt" ? "Time trial" : "Quick race";
  $("#field-track").hidden = mode === "champ";
  $("#field-grid").hidden = mode !== "quick";
  $("#go-race").textContent = mode === "champ" ? "Start qualifying" : mode === "tt" ? "Go out on track" : "Head out";

  const tw = $("#teams"); tw.innerHTML = "";
  for(const t of TEAMS){
    const b = el("button", "team" + (t.id === CFG.teamId ? " sel" : ""),
      `<span><span class="tn">${t.short}</span><span class="td">${t.drivers.map(d => d.abbr).join(" · ")}</span></span>`);
    b.style.setProperty("--tc", t.body);
    b.onclick = () => { CFG.teamId = t.id; CFG.drvIdx = 0; store("cfg", CFG); buildSetup(mode); };
    tw.appendChild(b);
  }
  const team = TEAMS.find(t => t.id === CFG.teamId);
  const dw = $("#drivers"); dw.innerHTML = "";
  team.drivers.forEach((d, i) => {
    const b = el("button", "drv" + (i === CFG.drvIdx ? " sel" : ""), `<b>${d.n}</b><span>${d.last}</span>`);
    b.onclick = () => { CFG.drvIdx = i; store("cfg", CFG); buildSetup(mode); };
    dw.appendChild(b);
  });
  const tr = $("#tracks"); tr.innerHTML = "";
  for(const t of TRACKS){
    const b = el("button", "trk" + (t.id === CFG.trackId ? " sel" : ""),
      `<div class="tk-n">${t.name}</div><div class="tk-l">${t.loc}</div>
       <div class="tk-b">${t.night ? "Night" : "Day"} · ${t.barrier === "wall" ? "Street" : "Permanent"}</div>`);
    b.style.setProperty("--tc", t.pal.accent);
    const sw = el("div", "tk-p");
    sw.style.background = `linear-gradient(135deg, ${t.pal.skyA}, ${t.pal.accent} 60%, ${t.pal.ground})`;
    b.appendChild(sw);
    b.onclick = () => { CFG.trackId = t.id; store("cfg", CFG); buildSetup(mode); };
    tr.appendChild(b);
  }
  ["laps", "diff", "tyre", "weather", "line", "damage", "grid", "fx", "detail"].forEach(seg);
  show("screen-setup");
}

/* ---------- results ---------- */
function showResults(res){
  if(S.mode === "qualy"){
    res.sort((a, b) => (a.best == null) - (b.best == null) || (a.best - b.best));
    res.forEach((r, i) => r.pos = i + 1);
  }
  const winner = res[0];
  $("#res-title").innerHTML = S.mode === "qualy" ? `Qualifying <i>result</i>` : S.mode === "tt" ? `Time <i>trial</i>` : `Race <i>result</i>`;
  $("#res-sub").textContent = `${S.track.name} · ${S.track.loc}${S.mode === "race" ? " · " + S.laps + " laps" : ""}`;
  const t = $("#res-tbl");
  t.innerHTML = `<thead><tr><th class="r">Pos</th><th>Driver</th><th>Team</th>
    <th class="r">${S.mode === "qualy" ? "Best lap" : "Gap"}</th><th class="r">Best lap</th><th class="r">Stops</th><th>Tyre</th></tr></thead>`;
  const body = el("tbody");
  for(const r of res){
    const c = r.car, me = c === S.player;
    const gapCell = r.dnf ? "DNF" : S.mode === "qualy" ? fmtTime(r.best)
      : r.dq ? "DSQ" : r.pos === 1 ? (S.mode === "race" ? fmtTime(c.finishTime) : fmtTime(r.best)) : fmtGap(r.gap);
    const row = el("tr", me ? "me" : "");
    row.innerHTML = `<td class="r pos">${r.pos}</td>
      <td class="nm"><span class="bar" style="background:${c.team.body}"></span>${c.drv.abbr} ${c.drv.last}</td>
      <td class="tm">${c.team.short}</td>
      <td class="r num" style="color:${r.dnf ? "var(--red)" : "inherit"}">${gapCell}</td>
      <td class="r num" style="color:${S.fastestBy === c ? "var(--purple)" : "inherit"}">${fmtTime(r.best)}</td>
      <td class="r num">${S.mode === "race" ? r.stops : "—"}</td>
      <td class="tm" style="color:${r.dnf ? "var(--dim)" : r.tyre.col}">${r.dnf ? (c.retiredBy || "Retired") : r.tyre.name}</td>`;
    body.appendChild(row);
  }
  t.appendChild(body);

  const acts = $("#res-actions"); acts.innerHTML = "";
  const add = (label, cls, fn) => { const b = el("button", "btn " + cls, label); b.onclick = fn; acts.appendChild(b); };
  if(S.mode === "qualy" && S.champ){
    add("Go to the race", "primary", () => {
      const grid = res.map(r => r.car.drv.abbr);
      startSession("race", { grid });
    });
  } else if(S.champ){
    const ch = store("champ");
    if(ch && ch.round < TRACKS.length) add(`Next round · ${TRACKS[ch.round].name}`, "primary", () => startChampWeekend());
    else add("Season complete — standings", "primary", () => showStandings());
    add("Standings", "", () => showStandings());
  } else {
    add("Race again", "primary", () => startSession(S.mode === "tt" ? "tt" : S.mode, null));
    add("Change setup", "", () => buildSetup(CFG.mode));
  }
  add("Paddock", "ghost", () => { setS(null); show("screen-title"); });
  show("screen-results");
}

/* ---------- championship ---------- */
function champState(){
  let c = store("champ");
  if(!c || !c.pts) c = { round:0, pts:{}, cons:{}, done:[] };
  return c;
}
function startChampWeekend(){
  const ch = champState();
  if(ch.round >= TRACKS.length){ showStandings(); return; }
  CFG.trackId = TRACKS[ch.round].id; store("cfg", CFG);
  startSession("qualy", {});
  S.champ = true;
}
function applyChampionship(res){
  const ch = champState();
  let fl = null, flBest = 1e18;
    res.forEach(r => { if(!r.dnf && r.best != null && r.best < flBest && r.pos <= 10){ flBest = r.best; fl = r; } });
  res.forEach((r, i) => {
    let p = POINTS[i] || 0;
    if(r.dq || r.dnf) p = 0;
    if(fl && r === fl) p += 1;
    ch.pts[r.car.drv.abbr] = (ch.pts[r.car.drv.abbr] || 0) + p;
    ch.cons[r.car.team.id] = (ch.cons[r.car.team.id] || 0) + p;
  });
  ch.done.push({ track:S.track.id, winner:res[0].car.drv.abbr, you:S.player.pos });
  ch.round++;
  store("champ", ch);
}
function saveRecord(trackId, t, c){
  const recs = store("recs") || {};
  if(!recs[trackId] || t < recs[trackId].t){
    recs[trackId] = { t, abbr:c.drv.abbr, team:c.team.id, tyre:c.tyre.key };
    store("recs", recs);
  }
}
function showStandings(){
  const ch = champState(), recs = store("recs") || {};
  $("#st-sub").textContent = ch.round >= TRACKS.length ? "Season complete"
    : `Round ${ch.round + 1} of ${TRACKS.length} · next up ${TRACKS[Math.min(ch.round, TRACKS.length - 1)].name}`;
  const all = [];
  for(const t of TEAMS) for(const d of t.drivers) all.push({ t, d, p:ch.pts[d.abbr] || 0 });
  all.sort((a, b) => b.p - a.p);
  const dt = $("#st-drv");
  dt.innerHTML = `<thead><tr><th class="r">Pos</th><th>Driver</th><th>Team</th><th class="r">Pts</th></tr></thead>`;
  const db = el("tbody");
  all.forEach((r, i) => {
    const mine = r.t.id === CFG.teamId && r.d === TEAMS.find(t => t.id === CFG.teamId).drivers[CFG.drvIdx];
    db.innerHTML += `<tr class="${mine ? "me" : ""}"><td class="r pos">${i + 1}</td>
      <td class="nm"><span class="bar" style="background:${r.t.body}"></span>${r.d.abbr} ${r.d.last}</td>
      <td class="tm">${r.t.short}</td><td class="r num">${r.p}</td></tr>`;
  });
  dt.appendChild(db);
  const cons = TEAMS.map(t => ({ t, p:ch.cons[t.id] || 0 })).sort((a, b) => b.p - a.p);
  const ct = $("#st-con");
  ct.innerHTML = `<thead><tr><th class="r">Pos</th><th>Constructor</th><th class="r">Pts</th></tr></thead>`;
  const cb = el("tbody");
  cons.forEach((r, i) => { cb.innerHTML += `<tr class="${r.t.id === CFG.teamId ? "me" : ""}"><td class="r pos">${i + 1}</td>
    <td class="nm"><span class="bar" style="background:${r.t.body}"></span>${r.t.short}</td><td class="r num">${r.p}</td></tr>`; });
  ct.appendChild(cb);
  const rt = $("#st-rec");
  rt.innerHTML = `<thead><tr><th>Circuit</th><th class="r">Lap record</th><th>Set by</th></tr></thead>`;
  const rb = el("tbody");
  for(const t of TRACKS){
    const r = recs[t.id];
    rb.innerHTML += `<tr><td class="nm">${t.name}</td><td class="r num">${r ? fmtTime(r.t) : "—"}</td>
      <td class="tm">${r ? r.abbr : "not set"}</td></tr>`;
  }
  rt.appendChild(rb);
  show("screen-standings");
}


/* ---------- the car viewer: open the game with #carview ----------------
   One car on a plain grey floor under a neutral light, for checking it against
   drawings: top, side, front, rear and three-quarter views, any team, any
   compound, and every state the car can show. */
const CARVIEW = {
  on:false,
  open(){
    if(this.on || !G3.ok) return;
    this.on = true; setS(null); show(null);
    const sc = this.scene = new THREE.Scene();
    sc.background = new THREE.Color(0xD9DCDF);
    sc.add(new THREE.HemisphereLight(0xFFFFFF, 0x9A9EA4, 0.55));
    sc.add(new THREE.AmbientLight(0xFFFFFF, 0.15));
    const sun = new THREE.DirectionalLight(0xFFFFFF, 1.1); sun.position.set(6, 12, 8); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left:-5, right:5, top:5, bottom:-5, near:1, far:40 });
    sun.shadow.camera.updateProjectionMatrix(); sun.shadow.bias = -0.0004; sc.add(sun);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color:0xC9CCD0, roughness:0.95 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; sc.add(floor);
    // a 1 m grid, to read sizes off
    const grid = new THREE.GridHelper(12, 12, 0x8A9098, 0xAEB3B9); grid.position.y = 0.002; sc.add(grid);
    this.persp = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
    this.ortho = new THREE.OrthographicCamera(-4, 4, 3, -3, 0.1, 200);
    this.state = { team:0, tyre:"soft", steer:0, boost:false, brake:false, pit:0, spin:0, damage:new Set(), view:"q34", az:0.8, el:0.35, dist:9 };
    this.ui(); this.rebuild(); this.setView("q34");
    const tick = () => { if(!this.on) return; requestAnimationFrame(tick); this.render(); };
    requestAnimationFrame(tick);
  },
  close(){ this.on = false; if(this.panel) this.panel.remove(); this.panel = null; show("screen-title"); },
  fakeCar(){
    const st = this.state, t = TEAMS[st.team];
    const c = { team:t, drv:t.drivers[0], idx:0, ai:false, broken:new Set(st.damage), tyre:TYRES[st.tyre], steer:st.steer,
                boost:st.boost ? 1 : 0, batt:1, brk:st.brake ? 1 : 0, x:0, y:0, z:0, h:0, vx:st.spin, vy:0,
                stopT:st.pit > 0 ? (1 - st.pit) * 3 + 0.001 : 0, stopTotal:3, pitT:0, pitStopTime:0 };
    return c;
  },
  rebuild(){
    if(this.car){ this.scene.remove(this.car); }
    G3.mats.clear();
    this.c = this.fakeCar();
    this.car = G3.car(this.c);
    this.scene.add(this.car);
    this.clock = 0;
  },
  setView(v){
    const st = this.state; st.view = v;
    const dirs = { top:[0, 1, 0.0001], side:[0, 0, 1], front:[1, 0, 0], rear:[-1, 0, 0] };
    if(v === "q34"){ this.cam = this.persp; return; }
    this.cam = this.ortho;
    const d = dirs[v], k = 20;
    this.ortho.position.set(d[0] * k, 0.5 + d[1] * k, d[2] * k);
    if(v === "top") this.ortho.up.set(0, 0, -1); else this.ortho.up.set(0, 1, 0);
    this.ortho.lookAt(0, 0.45, 0);
  },
  render(){
    const cv = G3.cv, w = cv.clientWidth || 800, h = cv.clientHeight || 600, asp = w / h, st = this.state;
    const c = this.c; c.steer = st.steer; c.boost = st.boost ? 1 : 0; c.brk = st.brake ? 1 : 0; c.vx = st.spin;
    c.stopT = st.pit > 0 ? (1 - st.pit) * 3 + 0.001 : 0;
    this.clock += 1 / 60;
    G3.carAnim(this.car, c, { clock:this.clock, wet:0, track:null }, 1 / 60);
    this.car.position.y = (this.car.userData.lift || 0);
    if(this.cam === this.persp){
      this.persp.aspect = asp; this.persp.updateProjectionMatrix();
      this.persp.position.set(Math.cos(st.az) * Math.cos(st.el) * st.dist, 0.4 + Math.sin(st.el) * st.dist, Math.sin(st.az) * Math.cos(st.el) * st.dist);
      this.persp.lookAt(0, 0.4, 0);
    } else {
      const hh = st.view === "front" || st.view === "rear" ? 1.3 : 1.9; this.ortho.left = -hh * asp; this.ortho.right = hh * asp; this.ortho.top = hh; this.ortho.bottom = -hh;
      this.ortho.updateProjectionMatrix();
    }
    const grade = { exposure:1.0, strength:0.25, radius:0.4, threshold:1.3, knee:0.3 };
    if(PP.ready && CFG.fx !== 0) PP.render(this.scene, this.cam, grade);
    else { G3.rend.setRenderTarget(null); G3.rend.render(this.scene, this.cam); }
  },
  ui(){
    const P = this.panel = document.createElement("div");
    P.style.cssText = "position:fixed;left:12px;top:12px;z-index:99;background:rgba(14,16,20,.86);color:#E8EDF3;padding:10px 12px;" +
      "font:12px/1.5 'Roboto Mono',monospace;border-radius:4px;max-width:300px;display:flex;flex-direction:column;gap:6px";
    const st = this.state, row = () => { const d = document.createElement("div"); d.style.cssText = "display:flex;flex-wrap:wrap;gap:4px;align-items:center"; P.appendChild(d); return d; };
    const btn = (r, label, fn) => { const b = document.createElement("button"); b.textContent = label;
      b.style.cssText = "font:inherit;padding:2px 7px;background:#2A3038;color:inherit;border:1px solid #3A424C;border-radius:3px;cursor:pointer";
      b.onclick = fn; r.appendChild(b); return b; };
    const title = document.createElement("b"); title.textContent = "CAR VIEWER"; P.appendChild(title);
    const r1 = row(); for(const [k, l] of [["top", "Top"], ["side", "Side"], ["front", "Front"], ["rear", "Rear"], ["q34", "3/4"]]) btn(r1, l, () => this.setView(k));
    const r2 = row(); const sel = document.createElement("select"); sel.style.cssText = "font:inherit;background:#2A3038;color:inherit";
    TEAMS.forEach((t, i) => { const o = document.createElement("option"); o.value = i; o.textContent = t.short; sel.appendChild(o); });
    sel.onchange = () => { st.team = +sel.value; this.rebuild(); }; r2.appendChild(sel);
    const ty = document.createElement("select"); ty.style.cssText = sel.style.cssText;
    for(const k of Object.keys(TYRES)){ const o = document.createElement("option"); o.value = k; o.textContent = TYRES[k].name; ty.appendChild(o); }
    ty.onchange = () => { st.tyre = ty.value; this.c.tyre = TYRES[st.tyre]; }; r2.appendChild(ty);
    const r3 = row();
    btn(r3, "Steer L", () => { st.steer = -1; }); btn(r3, "Straight", () => { st.steer = 0; }); btn(r3, "Steer R", () => { st.steer = 1; });
    const r4 = row();
    const tog = (r, label, get, set) => { const b = btn(r, label, () => { set(!get()); b.style.background = get() ? "#FF8A1F" : "#2A3038"; }); return b; };
    tog(r4, "Boost", () => st.boost, v => st.boost = v); tog(r4, "Brake", () => st.brake, v => st.brake = v);
    tog(r4, "Spin", () => st.spin > 0, v => st.spin = v ? 12 : 0);
    const r5 = row(); r5.appendChild(document.createTextNode("Damage:"));
    for(const k of ["wing", "rear", "floor", "susp", "punct", "brakes"])
      tog(r5, k, () => st.damage.has(k), v => { v ? st.damage.add(k) : st.damage.delete(k); this.c.broken = new Set(st.damage); });
    const r6 = row(); r6.appendChild(document.createTextNode("Pit stop:"));
    const pit = document.createElement("input"); pit.type = "range"; pit.min = 0; pit.max = 100; pit.value = 0; pit.style.width = "140px";
    pit.oninput = () => { st.pit = pit.value / 100; }; r6.appendChild(pit);
    const r7 = row(); btn(r7, "Close", () => { history.replaceState(null, "", location.pathname); this.close(); });
    // drag to turn the three-quarter view
    let drag = null;
    G3.cv.addEventListener("pointerdown", e => { drag = [e.clientX, e.clientY]; });
    addEventListener("pointerup", () => { drag = null; });
    addEventListener("pointermove", e => { if(!drag || !this.on || this.cam !== this.persp) return;
      st.az += (e.clientX - drag[0]) * 0.008; st.el = clamp(st.el + (e.clientY - drag[1]) * 0.006, 0.02, 1.5); drag = [e.clientX, e.clientY]; });
    G3.cv.addEventListener("wheel", e => { if(this.on) st.dist = clamp(st.dist * Math.exp(e.deltaY * 0.001), 3, 30); }, { passive:true });
    document.body.appendChild(P);
  },
};


function setPaused(v){ paused = v; }
function setS(v){ S = v; }
export { AUDIO, CARVIEW, CFG, S, bindTouch, buildSetup, champState, closePitMenu, endSession, loop, setPaused, setS, show, showStandings, showToast, startChampWeekend, startSession, togglePause };
