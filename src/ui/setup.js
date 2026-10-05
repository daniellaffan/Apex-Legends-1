import { $, el, store } from '../config/util.js';
import { TEAMS } from '../config/teams.js';
import { TRACKS } from '../tracks/index.js';
import { CFG, OPTS } from '../config/settings.js';
import { show } from './screens.js';

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
  ["laps", "diff", "tyre", "weather", "line", "damage", "sc", "grid", "fx", "detail"].forEach(seg);
  show("screen-setup");
}


export { buildSetup };
