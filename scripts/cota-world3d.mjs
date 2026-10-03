/* Builds the real COTA 3D world in Node (stubbed DOM, no GPU) and counts what it made.
   node scripts/cota-world3d.mjs [detail 0|1|2]  -> meshes, instanced draw calls, triangles, build time */
globalThis.window = globalThis;
const ctxStub = new Proxy({}, { get: (t, k) => (k === 'canvas' ? { width: 1, height: 1 } : k === 'measureText' ? () => ({ width: 10 }) : () => ctxStub), set: () => true });
globalThis.document = { createElement: () => ({ width: 1, height: 1, getContext: () => ctxStub, style: {} }) };
globalThis.localStorage = { getItem: () => null, setItem() {} };

const THREE = await import('three');
const { TRACKS } = await import('../src/tracks/index.js');
const { buildTrack } = await import('../src/tracks/build.js');
const { CFG } = await import('../src/config/settings.js');
const { COTA } = await import('../src/render3d/worlds/cota.js');
const { auditCota } = await import('../src/render3d/worlds/cota-plan.js');

CFG.detail = process.argv[2] != null ? +process.argv[2] : 1;
const T = buildTrack(TRACKS.find(t => t.id === 'cota'));
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xffffff, 0x888888, 0.4));
const world = new THREE.Group(); scene.add(world);
const G = { sun: { color: new THREE.Color(), intensity: 1 }, scene, envFill: null };
const t0 = performance.now();
COTA.build(G, world, T, { clock: 0, cars: [] });
const ms = performance.now() - t0;

let meshes = 0, inst = 0, instCount = 0, tris = 0, instTris = 0, shadowDraws = 0;
const kinds = {};
world.traverse(o => {
  if (!o.isMesh && !o.isPoints) return;
  meshes++;
  const g = o.geometry, idx = g.index ? g.index.count : g.attributes.position.count, t = idx / 3;
  if (o.isInstancedMesh) { inst++; instCount += o.count; instTris += t * o.count; tris += t * o.count; }
  else tris += t;
  if (o.castShadow) shadowDraws++;
});
console.log('detail', CFG.detail, '| build time', ms.toFixed(0), 'ms', JSON.stringify(COTA.timing));
console.log('meshes (draw calls if all visible):', meshes, ' of which instanced:', inst, '(', instCount, 'instances )');
console.log('triangles if everything were drawn:', Math.round(tris), ' of which instanced', Math.round(instTris));
console.log('shadow-casting meshes:', shadowDraws);
console.log('stats', JSON.stringify(COTA.stats, (k, v) => (Array.isArray(v) ? undefined : v)));
console.log('audit', JSON.stringify(auditCota(COTA.P, T)));

/* ---- geometry audits: nothing clips the track, the barriers or the ground ---- */
const P = COTA.P, S = P.structs, n = T.n;
let treadHits = 0, treadWorst = 0, rowsChecked = 0, standMinBar = 1e9;
for (const s of S.stands) {
  for (let k = 0; k <= s.span; k++) {
    const i = (s.i0 + k) % n;
    standMinBar = Math.min(standMinBar, s.off0 - P.edge(i, s.side));
    for (let r = 0; r < s.rows; r++) {
      const [x, y] = P.at(i, s.side, s.off0 + (r + 0.5) * s.rowD), top = s.zb[k] + (r + 1) * s.rowH;
      rowsChecked++;
      const poke = P.height(x, y) - (top - 0.02);       // terrain above the tread top = it would hide the seats
      if (poke > 0) { treadHits++; treadWorst = Math.max(treadWorst, poke); }
    }
  }
}
console.log('stands:', S.stands.length, '| tread cells checked', rowsChecked, '| terrain above a tread top:', treadHits, '(worst', treadWorst.toFixed(2), 'm) | closest stand to a barrier line:', standMinBar.toFixed(1), 'm');
const barOf = (o) => P.clearance(o.x, o.y);
const minOf = (list) => list.length ? Math.min(...list.map(barOf)).toFixed(1) : 'n/a';
console.log('past the barrier line (m): tower', P.clearance(S.tower.x, S.tower.y).toFixed(1), '| amphitheatre', P.clearance(S.amph.x, S.amph.y).toFixed(1), '| fence posts min', minOf(S.posts), '| TV towers min', minOf(S.tvTowers), '| marshal posts min', minOf(S.marshal), '| tents min', minOf(S.tents), '| warehouses min', minOf(S.warehouses), '| car parks min', Math.min(...S.lots.map(l => P.clearance(l.x, l.y) - Math.max(l.w, l.d) / 2)).toFixed(1));
const pit = S.pit; let pitGap = 1e9;
for (let k = 0; k <= pit.span; k++) pitGap = Math.min(pitGap, pit.off0 - (T.half + T.pitW));
console.log('pit building front is', pitGap.toFixed(1), 'm beyond the outer edge of the pit lane; garages (circuit props) sit at', (T.half + T.pitW + 7).toFixed(1), 'from the centre');
