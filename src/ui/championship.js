import { $, el, fmtTime, store } from '../config/util.js';
import { POINTS, TEAMS } from '../config/teams.js';
import { TRACKS } from '../tracks/index.js';
import { CFG } from '../config/settings.js';
import { S, startSession } from '../game/session.js';
import { show } from './screens.js';

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



export { applyChampionship, champState, saveRecord, showStandings, startChampWeekend };
