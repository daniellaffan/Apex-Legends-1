import { $, clamp, el, fmtGap, fmtTime } from '../config/util.js';
import { PARTS } from '../car/parts.js';
import { LAUNCH_HI, LAUNCH_LO } from '../car/physics.js';
import { S, updateStatus } from '../game/session.js';
import { hudLine } from '../game/penalties.js';

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
  const pl = S.mode === "tt" ? "" : hudLine(S, c), pn = $("#h-pen");
  pn.hidden = !pl; if(pl && pn.textContent !== pl){ pn.textContent = pl; }
  pn.classList.toggle("owed", !!(c.pen && c.pen.todo.length));
  const scEl = $("#h-sc"), scs = S.sc ? S.sc.state : "off";
  scEl.hidden = scs === "off";
  if(scs !== "off"){
    const t = scs === "out" ? "SAFETY CAR · NO OVERTAKING" : "SAFETY CAR IN THIS LAP";
    if(scEl.textContent !== t) scEl.textContent = t;
  }
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


export { buildBoard, updateHUD };
