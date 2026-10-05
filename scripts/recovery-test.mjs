/* Wreck recovery in Node: an AI car crashes in a real race (the real update loop). Does it stay exactly where it stopped,
   does the safety car come out for it and stay out until the truck has taken it away and the marshals have swept up,
   do the other cars (and the safety car) go round it, and does a late crash finish the race under the safety car?
   Then the 3D side, stepped through every phase with the real truck, crane, marshals and debris code.
   node --import ./scripts/asset-register.mjs scripts/recovery-test.mjs [track] */
globalThis.window = globalThis;
const mk = () => new Proxy(function () {}, { get: (t, k) => (k === 'canvas' ? { width: 1, height: 1 } : k === 'data' ? new Uint8ClampedArray(1 << 20) : (k === 'width' || k === 'height') ? 1 : mk()), set: () => true, apply: () => mk() });
const els = new Map();
const el = id => { if (!els.has(id)) els.set(id, new Proxy({ textContent: '', hidden: false, width: 1, height: 1, getContext: () => mk(), style: { setProperty() {} }, dataset: {}, children: [], classList: { toggle() {}, add() {}, remove() {} }, appendChild() {}, setAttribute() {}, addEventListener() {}, querySelector() { return null; } }, { get: (t, k) => (k in t ? t[k] : () => el('x')), set: (t, k, v) => ((t[k] = v), true) })); return els.get(id); };
globalThis.document = { getElementById: el, querySelector: s => el(s), querySelectorAll: () => [], createElement: () => ({ width: 1, height: 1, getContext: () => mk(), style: {}, addEventListener() {} }), body: { appendChild() {} }, addEventListener() {} };
globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.addEventListener = () => {}; globalThis.innerWidth = 1280; globalThis.innerHeight = 720; globalThis.devicePixelRatio = 1;
globalThis.requestAnimationFrame = () => 0; globalThis.Image = class { set src(v) {} };
const warns = []; console.warn = (...a) => warns.push(a.join(' '));
const THREE = await import('three');
const SS = await import('../src/game/session.js');
const REC = await import('../src/game/recovery.js');
const { CFG } = await import('../src/config/settings.js');
const { R } = await import('../src/render2d/view.js'); R.cv = { clientWidth: 1280, clientHeight: 720, style: {} }; R.ctx = mk(); R.W = 1280; R.H = 720;
const { G3 } = await import('../src/render3d/g3.js');
for (const f of ['build', 'scenery', 'surfaces', 'car', 'person', 'recovery', 'wreckrecovery']) await import('../src/render3d/' + f + '.js');
const { CRASH } = await import('../src/render3d/crash.js');

const id = process.argv[2] || 'monza';
CFG.trackId = id; CFG.lapsIdx = 1; CFG.weather = 'dry'; CFG.damage = true; CFG.sc = 1;
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } };
const say = () => el('#msg-b').textContent + ' | ' + el('#msg-s').textContent;
const step = () => SS.update(1 / 60, 1 / 60);
const T0 = Date.now();

/* crash an AI car in the middle of the pack, on the road: a big hit, so it launches and comes to rest as a wreck */
function crash(S, pick){
  const cands = S.cars.filter(c => c.ai && !c.dnf && !c.pitting && !c.inPit && c.spinT <= 0 && Math.abs(c.off) < S.track.half - 1 && c.speed > 30);
  const v = cands[Math.min(cands.length - 1, pick)];
  v.hurt(60, 'front', S, { dx: Math.cos(v.h), dy: Math.sin(v.h) });
  return v;
}

// ---------- 1. a crash mid-race ----------
for (const [label, when] of [['mid-race crash', 'mid'], ['last-lap crash', 'last']]) {
  SS.startSession('race', null); const S = SS.S; S.player.ai = true; S.sc.plan = null;
  // run until the moment
  let n = 0;
  while (n++ < 60 * 60 * 30) {
    step();
    const lead = S.cars.filter(c => !c.dnf).sort((a, b) => b.prog - a.prog)[0];
    if (when === 'mid' && S.clock > 45 && S.sc.state === 'off') break;
    if (when === 'last' && lead.lap === S.laps && lead.s > S.track.length * 0.25 && S.sc.state === 'off') break;
  }
  const v = crash(S, 6);
  console.log(`${label}: ${S.track.name}, ${v.drv.last} crashes at ${S.clock.toFixed(0)} s (lap ${v.lap} of ${S.laps}), retired: ${v.dnf} "${v.retiredBy}"`);
  ok(v.dnf, 'the car is out');
  let rest = null, moved = 0, scAt = null, jobAt = null, inBefore = false, states = [S.sc.state], minLive = 1e9, minSC = 1e9, recAt = null, doneAt = null;
  let finishedUnder = null, prevState = S.sc.state;
  for (let i = 0; i < 60 * 60 * 12 && !S.ended; i++) {
    step();
    if (rest == null && !v.wrecked) { rest = { x: v.x, y: v.y, h: v.h, t: S.clock }; }
    if (rest && !v.recovering) moved = Math.max(moved, Math.hypot(v.x - rest.x, v.y - rest.y), Math.abs(v.h - rest.h));
    if (v.recJob && jobAt == null) jobAt = S.clock;
    if (scAt == null && S.sc.state === 'out') scAt = S.clock;
    if (S.sc.state !== states[states.length - 1]) { states.push(S.sc.state); console.log('  ', S.clock.toFixed(0) + 's', 'SC →', S.sc.state, '| job', v.recJob && v.recJob.phase, '|', say()); }
    if (S.sc.state === 'in' && v.recJob && !v.recJob.done) inBefore = true;
    if (rest && !v.recovering && !v.recovered) {
      for (const c of S.cars) if (c !== v && !c.dnf && !c.pitting && !c.inPit) {
        const dd = Math.hypot(c.x - v.x, c.y - v.y); minLive = Math.min(minLive, dd);
        if (process.env.DBG && dd < 3.2) console.log('    close', S.clock.toFixed(2), c.drv.abbr, dd.toFixed(2), 'v', c.speed.toFixed(1), 'railV', (c.railV||0).toFixed(1), 'spin', c.spinT > 0, 'off', c.off.toFixed(1), 'wreck off', v.off.toFixed(1), 'half', S.track.half, 'obs', REC.obstacles(S).length, 'ds', (v.s - c.s).toFixed(1));
      }
      const k = S.sc.car; if (k && !k.inLane) minSC = Math.min(minSC, Math.hypot(k.x - v.x, k.y - v.y));
    }
    if (v.recovered && recAt == null) recAt = S.clock;
    if (v.recJob && v.recJob.done && doneAt == null) doneAt = S.clock;
    if (S.finishOrder.length && finishedUnder == null) finishedUnder = prevState;
    prevState = S.sc.state;
    if (S.player.finished) break;
    if (when === 'mid' && doneAt && S.sc.state === 'off' && S.clock > doneAt + 5) break;
  }
  console.log(`  came to rest at ${rest && rest.t.toFixed(1)} s · moved after rest ${moved.toFixed(3)} · job at ${jobAt && jobAt.toFixed(1)} · SC out at ${scAt && scAt.toFixed(1)} · lifted away at ${recAt && recAt.toFixed(1)} · track clear at ${doneAt && doneAt.toFixed(1)} · nearest live car to the wreck ${minLive.toFixed(1)} m · safety car ${minSC.toFixed(1)} m · states ${states.join(' → ')} · ended ${S.ended} player out ${S.player.dnf}`);
  ok(rest, 'the wreck comes to rest');
  ok(moved < 1e-6, 'it stays exactly where it stopped until the crane takes it: ' + moved);
  ok(jobAt != null && scAt != null && scAt - rest.t < 1.5, 'the safety car comes out as soon as it stops');
  ok(!inBefore, 'the safety car never heads in before the track is clear');
  ok(recAt != null && doneAt != null && doneAt - jobAt < 40, 'recovered and swept within 40 s: ' + (doneAt - jobAt));
  ok(minLive > 2.8, 'nobody drives through the wreck (a frame of overlap before the push at 3.4 m is allowed): ' + minLive.toFixed(2));
  ok(minSC > 3.3, 'the safety car goes round it: ' + minSC.toFixed(2));
  if (when === 'mid') ok(states.includes('in') && S.sc.state === 'off', 'and then the green flag');
  if (when === 'last') { ok(S.player.finished, 'the race finishes'); ok(finishedUnder === 'out' || finishedUnder === 'in', 'the leader takes the flag behind the safety car, not racing: ' + finishedUnder); }
  ok(!warns.length, 'no warnings: ' + warns.slice(0, 2).join(' / '));
}

// ---------- 2. a second crash while the car is on its way in brings it back out ----------
{
  SS.startSession('race', null); const S = SS.S; S.player.ai = true; S.sc.plan = null;
  let n = 0; while (n++ < 60 * 60 * 20 && !(S.clock > 40 && S.sc.state === 'off')) step();
  crash(S, 4);
  let v2 = null;
  for (let i = 0; i < 60 * 60 * 8 && !S.ended; i++) {
    step();
    if (S.sc.state === 'in' && !v2) { v2 = crash(S, 9); console.log('  second crash during "in this lap":', v2.drv.last); }
    if (v2 && v2.recJob) break;
  }
  for (let i = 0; i < 120; i++) step();
  ok(v2 && S.sc.state === 'out' && S.sc.car && !S.sc.car.inLane, 'a crash during "in this lap" sends it back out: ' + S.sc.state + ' | ' + say());
}

// ---------- 2b. the safety car goes round a car stopped on its line ----------
{
  SS.startSession('race', null); const S = SS.S; S.player.ai = true; S.sc.plan = null;
  let n = 0; while (n++ < 60 * 40) step();
  const SC = await import('../src/game/safetycar.js');
  SC.deploy(S, 'Test'); const k = S.sc.car, T = S.track;
  const node = (Math.floor(k.f) + Math.round(120 / T.ds)) % T.n;
  const v = S.cars.filter(c => c.ai && !c.dnf && Math.abs(((c.node - node + T.n) % T.n)) > 60)[3];
  v.place(node, T.line[node]); v.retire(S, 'Engine');
  let minSC = 1e9;
  for (let i = 0; i < 60 * 25; i++) { step(); const kk = S.sc.car; if (kk && !kk.inLane && !v.recovering && !v.recovered) minSC = Math.min(minSC, Math.hypot(kk.x - v.x, kk.y - v.y)); }
  console.log('safety car past a car stopped on its line: nearest', minSC.toFixed(2), 'm');
  ok(minSC > 3.3 && minSC < 50, 'the safety car steers round a stopped car: ' + minSC.toFixed(2));
}

// ---------- 3. the 3D recovery, every phase ----------
{
  SS.startSession('race', null); const S = SS.S; S.player.ai = true; S.sc.plan = null;
  let n = 0; while (n++ < 60 * 50) step();
  const T = S.track;
  G3.texes = G3.texes || new Map(); G3.dyn = []; G3.world = new THREE.Group();
  G3.cars = S.cars.map(c => ({ c, g: G3.car(c) })); for (const e of G3.cars) G3.world.add(e.g);
  CRASH.items = []; CRASH.group = new THREE.Group(); G3.world.add(CRASH.group);
  // a few pieces of debris round the crash site, like CRASH.fx leaves
  const v = crash(S, 5);
  for (let i = 0; i < 60 * 12 && v.wrecked; i++) step();
  for (let k = 0; k < 6; k++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.2)); m.position.set(v.x + k - 3, 0, v.y + (k % 2) * 2); CRASH.group.add(m); CRASH.items.push({ m, c: v, t: 0 }); }
  const pose = () => { for (const e of G3.cars) { if (e.c.recovered) { e.g.visible = false; continue; } if (e.c.recovering) continue; e.g.position.set(e.c.x, T.surfZ(e.c.x, e.c.y, e.c.node), e.c.y); e.g.rotation.set(-(e.c.roll || 0), -e.c.h, -(e.c.pitch || 0), 'YXZ'); } };
  let j = null, bedErr = null, rideErr = 0, phases = [], feet = 0, maxMeshes = 0, lastPhase = null, liftTopY = -1e9, endPos = null;
  const g = G3.cars.find(e => e.c === v).g;
  for (let i = 0; i < 60 * 70; i++) {
    step(); pose(); G3.recoveryFrame(S);
    j = v.recJob; if (!j) continue;
    if (j.phase !== lastPhase) { phases.push(j.phase); lastPhase = j.phase; }
    const vis = G3.recVis.get(j.id);
    maxMeshes = Math.max(maxMeshes, G3.world.children.length);
    if (j.phase === 'lift') liftTopY = Math.max(liftTopY, g.position.y);
    if (j.phase === 'lift' && j.pt > 6.9 && vis && vis.w) bedErr = g.position.distanceTo(vis.w.pT);
    if (j.phase === 'away' && vis && vis.R && vis.bed) {
      // the car rides on the bed: its offset from the truck stays fixed
      const rel = g.position.clone().sub(vis.R.root.position);
      if (vis.rel0) rideErr = Math.max(rideErr, rel.distanceTo(vis.rel0.clone().applyQuaternion(vis.R.root.quaternion.clone().multiply(vis.q0inv)))); else { vis.rel0 = rel.clone(); vis.q0inv = vis.R.root.quaternion.clone().invert(); }
      endPos = g.position.clone();
    }
    if (vis && vis.ppl) for (const P of vis.ppl) { const p = P.root.position; feet = Math.max(feet, Math.abs(p.y - T.surfZ(p.x, p.z, j.node))); }
    if (j.done) { G3.recoveryFrame(S); break; }
  }
  const vis = G3.recVis.get(j.id);
  console.log(`3D: phases ${phases.join(' → ')} · car lifted to ${(liftTopY - T.surfZ(v.x, v.y, v.node)).toFixed(1)} m · on the bed within ${bedErr == null ? '?' : bedErr.toFixed(2)} m · ride drift ${rideErr.toFixed(3)} m · marshals' feet off the ground by ${feet.toFixed(3)} m · debris left ${CRASH.items.length} · scene children at most ${maxMeshes}, now ${G3.world.children.length}`);
  ok(phases.join() === 'flags,arrive,lift,away,sweep,done', 'every phase in order: ' + phases);
  ok(bedErr != null && bedErr < 0.3, 'the car ends on the bed');
  ok(rideErr < 0.05, 'and rides there as the truck drives off');
  ok(endPos && endPos.distanceTo(new THREE.Vector3(v.x, endPos.y, v.y)) > 20, 'it is taken away');
  ok(feet < 0.05, 'marshals stand on the ground');
  ok(CRASH.items.length === 0, 'the debris is swept up');
  ok(!vis.R && !vis.ppl && vis.gone, 'truck and marshals are gone afterwards');
  ok(v.recovered, 'the car is gone from the circuit');
  ok(!warns.length, 'no render warnings: ' + warns.slice(0, 2).join(' / '));
}
console.log('ran', ((Date.now() - T0) / 1000).toFixed(0), 's');
console.log(fail ? fail + ' FAILED' : 'all checks passed');
process.exit(fail ? 1 : 0);
