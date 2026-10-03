import './tracks/survey/monaco.js';
import './tracks/survey/silverstone.js';
import './tracks/survey/zandvoort.js';
import { $, el, store } from './config/util.js';
import { TEAMS } from './config/teams.js';
import './car/parts.js';
import './car/spec.js';
import './tracks/shared.js';
import { TRACKS } from './tracks/index.js';
import './tracks/monaco.js';
import './tracks/singapore.js';
import './tracks/vegas.js';
import './tracks/baku.js';
import './tracks/silverstone.js';
import './tracks/spa.js';
import './tracks/monza.js';
import './tracks/zandvoort.js';
import './tracks/suzuka.js';
import './tracks/interlagos.js';
import './tracks/cota.js';
import './tracks/mexico.js';
import './tracks/build.js';
import { LAUNCH_HI, LAUNCH_LO } from './car/physics.js';
import './ai/driver.js';
import { R } from './render2d/view.js';
import './render2d/sphere.js';
import './render2d/textures.js';
import './render2d/props.js';
import './render2d/car.js';
import './render2d/world.js';
import './render2d/particles.js';
import './render3d/surfaces.js';
import './render3d/hoardings.js';
import './render3d/pipeline.js';
import { G3 } from './render3d/g3.js';
import './render3d/worlds/vegas.js';
import './render3d/worlds/vegas-city.js';
import './render3d/worlds/monaco.js';
import './render3d/worlds/silverstone.js';
import './render3d/worlds/zandvoort.js';
import './render3d/build.js';
import './render3d/scenery.js';
import './render3d/car.js';
import './render3d/frame.js';
import { AUDIO, CARVIEW, CFG, S, bindTouch, buildSetup, champState, closePitMenu, endSession, loop, setPaused, setS, show, showStandings, startChampWeekend, startSession, togglePause } from './legacy-rest.js';

/* ---------- 8. boot ------------------------------------------------------- */
function boot(){
  R.init();
  try{ G3.init(); }catch(e){ console.warn("3D unavailable", e); } bindTouch();
  if(location.hash === "#carview") setTimeout(() => CARVIEW.open(), 0);
  addEventListener("hashchange", () => { if(location.hash === "#carview") CARVIEW.open(); });
  const strip = $("#title-strip");
  for(const t of TEAMS){ const i = el("i"); i.style.background = t.body; strip.appendChild(i); }
  const ch = champState();
  $("#m-champ").textContent = ch.round > 0 && ch.round < TRACKS.length
    ? `Round ${ch.round + 1} of ${TRACKS.length} · ${TRACKS[ch.round].name}` : `${TRACKS.length} rounds · qualifying + race`;

  document.querySelectorAll("[data-go]").forEach(b => b.onclick = () => {
    const g = b.dataset.go;
    if(g === "standings") return showStandings();
    if(g === "champ"){ const c = champState();
      if(c.round >= TRACKS.length){ showStandings(); return; }
      CFG.trackId = TRACKS[c.round].id; buildSetup("champ"); return; }
    buildSetup(g === "tt" ? "tt" : "quick");
  });
  document.querySelectorAll("[data-back]").forEach(b => b.onclick = () => show("screen-title"));
  $("#go-race").onclick = () => {
    if(CFG.mode === "champ"){ startChampWeekend(); }
    else startSession(CFG.mode === "tt" ? "tt" : "race", null);
  };
  const endBtn = el("button", "btn", "End run");
  endBtn.id = "pb-end";
  $("#pause .actions").insertBefore(endBtn, $("#pb-quit"));
  endBtn.onclick = () => { setPaused(false); $("#pause").hidden = true; endSession(); };
  $("#pit-go").onclick = () => { if(S) closePitMenu(S); };
  $("#pit-skip").onclick = () => { if(S){ S.player.pitPlan = { none:true, done:true, repairs:new Set() }; closePitMenu(S); } };
  $("#pb-resume").onclick = togglePause;
  $("#pb-restart").onclick = () => { setPaused(false); $("#pause").hidden = true;
    startSession(S.mode, S.champ ? { grid:S.gridAbbr } : null); };
  $("#pb-quit").onclick = () => { setPaused(false); $("#pause").hidden = true; try{ AUDIO.silence(); }catch(e){} R.persp = false; R.tv = false; setS(null); show("screen-title"); };
  $("#st-reset").onclick = () => { store("champ", { round:0, pts:{}, cons:{}, done:[] }); showStandings(); boot0(); };
  const zone = document.getElementById("h-tachzone");
  if(zone){ zone.style.left = (LAUNCH_LO * 100) + "%"; zone.style.width = ((LAUNCH_HI - LAUNCH_LO) * 100) + "%"; }
  show("screen-title");
  requestAnimationFrame(loop);
}
function boot0(){
  const ch = champState();
  $("#m-champ").textContent = ch.round > 0 && ch.round < TRACKS.length
    ? `Round ${ch.round + 1} of ${TRACKS.length} · ${TRACKS[ch.round].name}` : `${TRACKS.length} rounds · qualifying + race`;
}
try{
  window.claude?.hot?.snapshot?.(() => ({ cfg:CFG }));
}catch(e){}
boot();
