/* The DNF climb-out in Node: for many car positions and headings (some pressed against the barrier), run the real
   CINE.dnfInit / dnfTick and check the driver never ends up past the barrier line, plus what the OLD logic
   (out of the track-facing side, then along the car's nose) would have done.   node scripts/dnf-test.mjs [track] */
globalThis.window = globalThis;
const mk = () => new Proxy(function () {}, { get: (t, k) => (k === 'canvas' ? { width: 1, height: 1 } : k === 'data' ? new Uint8ClampedArray(1 << 20) : (k === 'width' || k === 'height') ? 1 : mk()), set: () => true, apply: () => mk() });
const canvas = () => ({ width: 1, height: 1, getContext: () => mk(), style: {}, addEventListener() {} });
globalThis.document = { createElement: canvas, body: { appendChild() {} }, getElementById: () => canvas(), addEventListener() {} };
globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.addEventListener = () => {}; globalThis.innerWidth = 1280; globalThis.innerHeight = 720; globalThis.devicePixelRatio = 1;
globalThis.Image = class { set src(v) {} }; globalThis.requestAnimationFrame = () => 0;

const THREE = await import('three');
const { G3 } = await import('../src/render3d/g3.js');
for (const f of ['build', 'scenery', 'surfaces', 'car', 'person']) await import('../src/render3d/' + f + '.js');
const { CINE } = await import('../src/render3d/cine.js');
const { TRACKS } = await import('../src/tracks/index.js');
const { buildTrack } = await import('../src/tracks/build.js');
const { R } = await import('../src/render2d/view.js'); R.ctx = mk();

const id = process.argv[2] || 'cota';
const T = buildTrack(TRACKS.find(t => t.id === id));
G3.texes = G3.texes || new Map(); G3.dyn = []; G3.world = new THREE.Group();
CINE.caption = () => {}; CINE.shake = () => new THREE.Vector3();
const room = (x, z) => { const i = T.near(x, z), off = (x - T.x[i]) * T.nx[i] + (z - T.y[i]) * T.ny[i]; return T.half + T.roAt(i, off) + 2.6 - Math.abs(off); };

let carHits = 0, runs = 0, worstNew = 1e9, worstOld = 1e9, badNew = 0, badOld = 0, sideAgree = 0;
for (const u of [0.02, 0.079, 0.15, 0.3, 0.383, 0.5, 0.61, 0.72, 0.8, 0.88]) {
  const node = Math.round(u * T.n) % T.n;
  for (const offK of [0, 0.6, 0.95, -0.6, -0.95]) {
    const ro = offK >= 0 ? T.roR[node] : T.roL[node], off = offK * (T.half + ro + 2.6 - 1.2) * (offK === 0 ? 0 : 1);
    for (let hk = 0; hk < 8; hk++) {
      const h = T.ang[node] + hk * Math.PI / 4 + 0.2, x = T.x[node] + T.nx[node] * off, y = T.y[node] + T.ny[node] * off;
      const g = new THREE.Group(); g.position.set(x, T.z[node], y); g.rotation.y = -h; g.updateMatrixWorld(true);
      const p = { node, off, x, y, z: T.z[node], team: { body: '#2A3A5C', accent: '#F2F2F2' }, drv: { cam: '#F2C230', n: 3, last: 'Test' }, lap: 2, retiredBy: 'Crash' };
      const S = { track: T, player: p, cine: { t: 0 } };
      G3.cars = [{ c: p, g }]; G3.world = new THREE.Group();
      CINE.dnfInit(G3, S);
      const c = S.cine;
      // the old logic, for comparison: out of the track-facing side, then along the nose
      const toward = new THREE.Vector3(-Math.sign(off || 1) * T.nx[node], 0, -Math.sign(off || 1) * T.ny[node]);
      const right = new THREE.Vector3(0, 0, 1).applyQuaternion(c.q); right.y = 0; right.normalize();
      const sOld = right.dot(toward) >= 0 ? 1 : -1;
      const oldEnd = new THREE.Vector3(0.32 + 12, 0, sOld * 1.55).applyMatrix4(c.base);
      const oldRoom = room(oldEnd.x, oldEnd.z);
      let minNew = 1e9;
      for (let t = 0; t <= 13.6; t += 1 / 30) { c.t = t; CINE.dnfTick(G3, S, 1 / 30); if (t > 4.5) { const q = c.person.root.position; minNew = Math.min(minNew, room(q.x, q.z)); if (t > 9.8) { const l = q.clone().applyMatrix4(c.base.clone().invert()); if (l.x > -1.5 && l.x < 4.3 && Math.abs(l.z) < 1.1) carHits++; } } }
      runs++; worstNew = Math.min(worstNew, minNew); worstOld = Math.min(worstOld, oldRoom);
      if (minNew < -0.3) badNew++; if (oldRoom < -0.3) badOld++;
      if (c.side === sOld) sideAgree++;
      CINE.dnfCleanup(G3, S);
    }
  }
}
console.log(id, ': runs', runs);
console.log('NEW  driver ends past the barrier line in', badNew, 'runs; worst room', worstNew.toFixed(2), 'm (negative = past the barrier)');
console.log('OLD  driver ends past the barrier line in', badOld, 'runs; worst room', worstOld.toFixed(2), 'm');
console.log('NEW  frames where the walking driver is inside the car footprint:', carHits);
console.log('new exit side matches the old choice in', sideAgree, 'of', runs, 'runs');
