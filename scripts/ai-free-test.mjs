/* No more resets: rivals that spin drive themselves back on the full car physics. In real races (the real update loop),
   force spins on AI cars at speed all round the lap and check that nobody snaps back to the line (the heading never jumps,
   the position never jumps), that every one of them either rejoins or retires, that walls and gravel really hurt them,
   and that a car that loses a wheel pulls off and retires.
   node --import ./scripts/asset-register.mjs scripts/ai-free-test.mjs [track] [spins] */
globalThis.window = globalThis;
const mk = () => new Proxy(function () {}, { get: (t, k) => (k === 'canvas' ? { width: 1, height: 1 } : (k === 'width' || k === 'height') ? 1 : mk()), set: () => true, apply: () => mk() });
const els = new Map();
const el = id => { if (!els.has(id)) els.set(id, new Proxy({ textContent: '', hidden: false, style: { setProperty() {} }, dataset: {}, children: [], classList: { toggle() {}, add() {}, remove() {} }, appendChild() {}, setAttribute() {}, addEventListener() {}, querySelector() { return null; } }, { get: (t, k) => (k in t ? t[k] : () => el('x')), set: (t, k, v) => ((t[k] = v), true) })); return els.get(id); };
globalThis.document = { getElementById: el, querySelector: s => el(s), querySelectorAll: () => [], createElement: () => ({ width: 1, height: 1, getContext: () => mk(), style: {}, addEventListener() {} }), body: { appendChild() {} }, addEventListener() {} };
globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.addEventListener = () => {}; globalThis.innerWidth = 1280; globalThis.innerHeight = 720; globalThis.devicePixelRatio = 1;
globalThis.requestAnimationFrame = () => 0; globalThis.Image = class { set src(v) {} };
const SS = await import('../src/game/session.js');
const { CFG } = await import('../src/config/settings.js');
const { R } = await import('../src/render2d/view.js'); R.cv = { clientWidth: 1280, clientHeight: 720, style: {} }; R.ctx = mk(); R.W = 1280; R.H = 720;
const { angWrap } = await import('../src/config/util.js');

const id = process.argv[2] || 'monza', SPINS = +(process.argv[3] || 24);
CFG.trackId = id; CFG.lapsIdx = 2; CFG.weather = 'dry'; CFG.damage = true; CFG.sc = 1;
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } };
const step = () => SS.update(1 / 60, 1 / 60);
const T0 = Date.now();

SS.startSession('race', null); let S = SS.S; S.player.ai = true; S.sc.plan = null;
const T = S.track;
let n = 0; while (n++ < 60 * 20) step();
const watch = [];                 // { c, t0, rejoinT, outcome, maxJump, maxPosJump, dmg0, wall }
const prev = new Map();
let spun = 0, frames = 0, worstHeadSnap = 0, worstPosSnap = 0;
while (frames++ < 60 * 60 * 18 && !S.ended) {
  // every few seconds, spin a rival that is on its line at speed
  if (spun < SPINS && frames % 300 === 0) {
    const cands = S.cars.filter(c => c.ai && c !== S.player && !c.dnf && !c.pitting && !c.inPit && !c.aiFree && c.spinT <= 0 && c.speed > 40 && !watch.some(w => w.c === c && !w.outcome));
    const c = cands[spun % Math.max(1, cands.length)];
    if (c) { c.startSpin(S, (spun % 2 ? 1 : -1) * (4 + (spun % 3))); watch.push({ c, t0: S.clock, rejoinT: null, outcome: null, maxJump: 0, dmg0: c.damage, wall: 0, freeSeen: false }); spun++; }
  }
  for (const c of S.cars) prev.set(c, { x: c.x, y: c.y, h: c.h, free: c.aiFree || c.spinT > 0, dnf: c.dnf, rail: c.ai && !c.aiFree && c.spinT <= 0 && !c.pitting });
  step();
  for (const c of S.cars) {
    const p = prev.get(c); if (!c.ai || c.pitting || p.dnf || c.dnf) continue;
    const dh = Math.abs(angWrap(c.h - p.h)), dp = Math.hypot(c.x - p.x, c.y - p.y) - c.speed / 60;
    // the moment a free car goes back to its line: nothing may jump
    if (p.free && !c.aiFree && c.spinT <= 0) { worstHeadSnap = Math.max(worstHeadSnap, dh); worstPosSnap = Math.max(worstPosSnap, dp); }
  }
  for (const w of watch) {
    if (w.outcome) continue;
    const c = w.c;
    if (c.aiFree) w.freeSeen = true;
    if (c.wallHit === 1) w.wall++;
    if (c.dnf) { w.outcome = 'retired: ' + c.retiredBy; w.rejoinT = S.clock - w.t0; }
    else if (w.freeSeen && !c.aiFree && c.spinT <= 0) { w.outcome = 'rejoined'; w.rejoinT = S.clock - w.t0; }
    else if (S.clock - w.t0 > 45) { w.outcome = 'STILL OUT'; }
  }
  if (spun >= SPINS && watch.every(w => w.outcome)) break;
}
const rej = watch.filter(w => w.outcome === 'rejoined'), out = watch.filter(w => /retired/.test(w.outcome)), stuck = watch.filter(w => !w.outcome || w.outcome === 'STILL OUT');
const times = rej.map(w => w.rejoinT).sort((a, b) => a - b);
console.log(`${T.name}: ${watch.length} forced spins → ${rej.length} drove back (rejoin ${times.length ? times[0].toFixed(1) + '-' + times[times.length - 1].toFixed(1) + ' s, median ' + times[times.length >> 1].toFixed(1) : '-'}), ${out.length} retired [${out.map(w => w.c.drv.abbr + ': ' + w.outcome.slice(9)).join('; ')}], ${stuck.length} stuck`);
console.log(`  heading jump when rejoining the line: at most ${(worstHeadSnap * 180 / Math.PI).toFixed(1)}° · position jump ${worstPosSnap.toFixed(2)} m · walls hit by ${watch.filter(w => w.wall).length} · damage taken by ${watch.filter(w => w.c.damage > w.dmg0 + 0.01).length}`);
ok(watch.length >= Math.min(SPINS, 10), 'spins happened');
ok(watch.every(w => w.freeSeen || /retired/.test(w.outcome || '')), 'every spun car went free (no instant reset)');
ok(stuck.length === 0, 'nobody is left stuck for ever: ' + stuck.map(w => w.c.drv.abbr + ' off ' + w.c.off.toFixed(1) + ' v ' + w.c.speed.toFixed(1)).join(', '));
ok(worstHeadSnap < 0.2, 'no heading snap when rejoining: ' + worstHeadSnap.toFixed(3));
ok(worstPosSnap < 0.5, 'no position snap when rejoining: ' + worstPosSnap.toFixed(3));
ok(rej.length >= watch.length * 0.5, 'most of them drive back');

// a car that loses a wheel pulls off and retires
{
  SS.startSession('race', null); S = SS.S; S.player.ai = true; S.sc.plan = null;
  let k = 0; while (k++ < 60 * 30) step();
  const c = S.cars.find(x => x.ai && x !== S.player && !x.dnf && !x.pitting && x.speed > 40);
  c.tearWheel(S, 0, 20);
  let t = 0; while (t++ < 60 * 12 && !c.dnf) step();
  console.log('lost a wheel:', c.drv.last, c.dnf ? 'retired "' + c.retiredBy + '" after ' + (t / 60).toFixed(1) + ' s, off ' + c.off.toFixed(1) + ' (road half ' + S.track.half + ')' : 'still running');
  ok(c.dnf && /wheel/i.test(c.retiredBy), 'a car without a wheel retires');
}
// natural races: what the AI does to itself with nothing forced
if (process.argv[4] !== 'quick') {
  const tot = { races: 0, spins: 0, free: 0, walls: 0, damaged: 0, broken: 0, out: [], sc: 0, laps: 0 };
  for (let r = 0; r < 3; r++) {
    CFG.lapsIdx = 1; SS.startSession('race', null); S = SS.S; S.player.ai = true;
    const was = new Map(), wallSeen = new Set();
    for (let f = 0; f < 60 * 60 * 25 && !S.ended; f++) {
      for (const c of S.cars) was.set(c, { sp: c.spinT > 0, fr: !!c.aiFree });
      step();
      for (const c of S.cars) { if (c === S.player) continue; const w = was.get(c); if (c.spinT > 0 && !w.sp){ tot.spins++; const k = w.fr ? 'while free' : c.lastSpinWhy || 'on the line'; tot.why = tot.why || {}; tot.why[k] = (tot.why[k] || 0) + 1; } if (c.aiFree && !w.fr) tot.free++; if (c.wallHit === 1 && c.aiFree) wallSeen.add(c); }
      if (S.player.finished) break;
    }
    const ai = S.cars.filter(c => c !== S.player);
    tot.races++; tot.walls += wallSeen.size; tot.damaged += ai.filter(c => c.damage > 0.15).length; tot.broken += ai.filter(c => c.broken.size || c.stops > 1).length;
    tot.out.push(...ai.filter(c => c.dnf).map(c => c.drv.abbr + ' ' + c.retiredBy)); tot.sc += S.sc ? S.sc.count : 0; tot.laps = S.laps;
  }
  console.log(`natural ${tot.races} races of ${tot.laps} laps: ${tot.spins} AI spins, ${tot.free} drove themselves back, ${tot.walls} hit a wall while off the line, ${tot.damaged} cars finished with real damage, ${tot.broken} broke something, retirements: ${tot.out.length ? tot.out.join('; ') : 'none'}, safety cars ${tot.sc} · spins by cause ${JSON.stringify(tot.why)}`);
}
console.log('ran', ((Date.now() - T0) / 1000).toFixed(0), 's');
console.log(fail ? fail + ' FAILED' : 'all checks passed');
process.exit(fail ? 1 : 0);
