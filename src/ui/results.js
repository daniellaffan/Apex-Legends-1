import { $, el, fmtGap, fmtTime, store } from '../config/util.js';
import { TRACKS } from '../tracks/index.js';
import { CFG } from '../config/settings.js';
import { S, setS, startSession } from '../game/session.js';
import { show } from './screens.js';
import { buildSetup } from './setup.js';
import { showStandings, startChampWeekend } from './championship.js';

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
      : r.dq ? "DSQ" : r.pos === 1 ? (S.mode === "race" ? (r.total != null ? fmtTime(r.total) : c.finished ? fmtTime(c.finishTime) : "—") : fmtTime(r.best)) : fmtGap(r.gap);
    const row = el("tr", me ? "me" : "");
    row.innerHTML = `<td class="r pos">${r.pos}</td>
      <td class="nm"><span class="bar" style="background:${c.team.body}"></span>${c.drv.abbr} ${c.drv.last}</td>
      <td class="tm">${c.team.short}</td>
      <td class="r num" style="color:${r.dnf ? "var(--red)" : "inherit"}">${gapCell}${r.pen ? `<span class="res-pen">+${r.pen}s</span>` : ""}</td>
      <td class="r num" style="color:${S.fastestBy === c ? "var(--purple)" : "inherit"}">${fmtTime(r.best)}</td>
      <td class="r num">${S.mode === "race" ? r.stops : "—"}</td>
      <td class="tm" style="color:${r.dnf ? "var(--dim)" : r.tyre.col}">${r.dnf ? (c.retiredBy || "Retired") : r.tyre.name}</td>`;
    body.appendChild(row);
  }
  t.appendChild(body);
  const old = t.parentNode.querySelector(".pennotes"); if(old) old.remove();
  if(S.mode === "race" && S.penLog && S.penLog.length){
    const n = el("div", "pennotes", "<b>Stewards' decisions</b>");
    for(const e of S.penLog.slice(0, 14))
      n.appendChild(el("div", "", `Lap ${e.lap} · <span>${e.abbr}</span> — ${e.text}${e.reason ? " · " + e.reason : ""}`));
    if(S.penLog.length > 14) n.appendChild(el("div", "", "…and " + (S.penLog.length - 14) + " more"));
    t.after(n);
  }

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


export { showResults };
