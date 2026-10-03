/* Scene census through the REAL G3.build (stubbed DOM, no GPU): what a circuit's 3D world costs.
   node scripts/census.mjs <trackId> [detail]   e.g. cota, suzuka, silverstone
   Prints meshes (= draw calls if all visible), instanced draw calls, triangles, and the triangles/draw calls that
   fall inside a 450 m circle around a few places on the lap (a stand-in for what a camera sees). */
globalThis.window = globalThis;
const mk = () => new Proxy(function () {}, { get: (t, k) => (k === 'canvas' ? { width: 1, height: 1 } : k === 'measureText' ? () => ({ width: 10 }) : k === 'data' ? new Uint8ClampedArray(1 << 20) : (k === 'width' || k === 'height') ? 1 : mk()), set: () => true, apply: () => mk() });
const canvas = () => ({ width: 1, height: 1, getContext: () => mk(), style: {}, addEventListener() {}, toDataURL: () => '' });
globalThis.document = { createElement: canvas, body: { appendChild() {} }, getElementById: () => canvas(), addEventListener() {} };
globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.addEventListener = () => {}; globalThis.innerWidth = 1280; globalThis.innerHeight = 720; globalThis.devicePixelRatio = 1;
globalThis.Image = class { set src(v) {} };
globalThis.requestAnimationFrame = () => 0;

const THREE = await import('three');
const { G3 } = await import('../src/render3d/g3.js');
for (const f of ['build', 'frame', 'scenery', 'surfaces', 'car', 'cine', 'crash', 'weather']) { try { await import('../src/render3d/' + f + '.js'); } catch (e) { console.log('skip', f, e.message.slice(0, 60)); } }
const { R } = await import('../src/render2d/view.js'); R.ctx = mk();
const { TRACKS } = await import('../src/tracks/index.js');
const { buildTrack } = await import('../src/tracks/build.js');
const { CFG } = await import('../src/config/settings.js');

const id = process.argv[2] || 'cota'; CFG.detail = process.argv[3] != null ? +process.argv[3] : 1;
const T = buildTrack(process.argv[4] ? (await import(process.argv[4])).default : TRACKS.find(t => t.id === id));
G3.scene = new THREE.Scene(); G3.texes = G3.texes || new Map(); G3.dyn = []; G3.occluders = [];
G3.rend = { renderLists: { dispose() {} }, capabilities: { getMaxAnisotropy: () => 8 }, domElement: canvas() };
const S = { track: T, uid: 1, cars: [], clock: 0, player: null, weather: { wet: 0 }, rain: 0 };
const t0 = performance.now();
try { G3.build(S); } catch (e) { console.log('build threw:', e.stack.split('\n').slice(0, 6).join('\n')); }
console.log(id, 'built in', (performance.now() - t0).toFixed(0), 'ms (detail', CFG.detail + ')');

const items = [];
G3.world.updateMatrixWorld(true);
G3.world.traverse(o => {
  if (!(o.isMesh || o.isPoints || o.isLine)) return;
  const g = o.geometry; if (!g || !g.attributes.position) return;
  const tri = (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1);
  if (!g.boundingSphere) g.computeBoundingSphere();
  const c = g.boundingSphere.center.clone().applyMatrix4(o.matrixWorld);
  items.push({ tri, inst: !!o.isInstancedMesh, c, r: g.boundingSphere.radius * 1.0, shadow: o.castShadow });
});
const total = items.reduce((a, b) => a + b.tri, 0);
console.log('meshes/draw calls (all):', items.length, ' instanced:', items.filter(i => i.inst).length, ' triangles (all):', Math.round(total), ' shadow casters:', items.filter(i => i.shadow).length);
const n = T.n, spots = [['T1 crest', 0.079], ['Esses', 0.15], ['back straight', 0.5], ['T11', 0.383], ['stadium', 0.783], ['pits', 0.99]];
for (const [name, u] of spots) {
  const i = Math.round(u * n) % n, px = T.x[i], pz = T.y[i];
  let tris = 0, dc = 0;
  for (const it of items) { if (Math.hypot(it.c.x - px, it.c.z - pz) < 450 + it.r) { tris += it.tri; dc++; } }
  console.log('  within 450 m of', name.padEnd(14), 'draw calls', dc, ' triangles', Math.round(tris));
}
