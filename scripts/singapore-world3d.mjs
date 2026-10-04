/* Builds the real Singapore 3D world in Node (stubbed DOM, no GPU): where the triangles and draw calls go, and clipping audits.
   node scripts/singapore-world3d.mjs [detail 0|1] */
globalThis.window = globalThis;
const ctxStub = new Proxy({}, { get: (t, k) => (k === 'canvas' ? { width: 1, height: 1 } : k === 'measureText' ? () => ({ width: 10 }) : () => ctxStub), set: () => true });
globalThis.document = { createElement: () => ({ width: 1, height: 1, getContext: () => ctxStub, style: {} }) };
globalThis.localStorage = { getItem: () => null, setItem() {} };

const THREE = await import('three');
const { TRACKS } = await import('../src/tracks/index.js');
const { buildTrack } = await import('../src/tracks/build.js');
const { CFG } = await import('../src/config/settings.js');
const { SINGAPORE } = await import('../src/render3d/worlds/singapore.js');
const { auditSingapore } = await import('../src/render3d/worlds/singapore-plan.js');

CFG.detail = process.argv[2] != null ? +process.argv[2] : 1;
const T = buildTrack(TRACKS.find(t => t.id === 'singapore'));
const scene = new THREE.Scene(); scene.add(new THREE.HemisphereLight(0xffffff, 0x888888, 0.4));
const world = new THREE.Group(); scene.add(world);
const G = { cutMat() {}, sun: { color: new THREE.Color(), intensity: 1 }, scene, envFill: null, strip: (T2, a, b, lift, rep) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 0, 1], 3)); return g; } };
const t0 = performance.now();
SINGAPORE.build(G, world, T, { clock: 0, cars: [] });
console.log('detail', CFG.detail, '| build', (performance.now() - t0).toFixed(0), 'ms', JSON.stringify(SINGAPORE.timing));

const cls = {};
let meshes = 0, tris = 0;
world.traverse(o => {
  if (!(o.isMesh || o.isPoints || o.isLine)) return;
  const g = o.geometry, n = (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1);
  const m = o.material, key = o.isPoints ? 'points' : o.isInstancedMesh ? 'instanced' : m && m.map && m.vertexColors ? 'windows' : m && m.isMeshBasicMaterial && m.vertexColors ? 'bright/unlit' : m && m.isMeshLambertMaterial && m.vertexColors ? 'solid/ground' : 'other';
  const c = cls[key] || (cls[key] = { meshes: 0, tris: 0 }); c.meshes++; c.tris += n; meshes++; tris += n;
});
console.log('draw calls if all drawn', meshes, '| triangles', Math.round(tris));
for (const k in cls) console.log('  ', k.padEnd(14), String(cls[k].meshes).padStart(5), 'meshes', String(Math.round(cls[k].tris)).padStart(9), 'tris');
console.log('stats', JSON.stringify(SINGAPORE.stats, (k, v) => (Array.isArray(v) ? undefined : v)));
console.log('audit', JSON.stringify(auditSingapore(SINGAPORE.P, T)));

/* stands: terrain above a tread, distance from the barrier line */
const P = SINGAPORE.P, n = T.n; let hits = 0, cells = 0, minGap = 1e9;
for (const s of P.structs.stands) for (let k = 0; k <= s.span; k++) { const i = (s.i0 + k) % n; minGap = Math.min(minGap, s.off0 - P.edge(i, s.side));
  for (let r = 0; r < s.rows; r++) { const [x, y] = P.at(i, s.side, s.off0 + (r + 0.5) * s.rowD); cells++; if (P.height(x, y) > s.zb[k] + (r + 1) * s.rowH - 0.02) hits++; } }
console.log('stands', P.structs.stands.length, '| tread cells', cells, '| ground above a tread:', hits, '| closest stand to a barrier line', minGap.toFixed(1), 'm');
let wetStand = P.structs.stands.filter(s => s.wet && !s.floating).map(s => s.name);
console.log('stands over water that are not the floating one:', wetStand.join(',') || 'none');
const pit = P.structs.pit; console.log('pit building front', (pit.off0 - (T.half + T.pitW)).toFixed(1), 'm beyond the pit lane edge');
console.log('footbridge columns clear of barrier:', P.structs.footbridges.every(f => P.clearance(f.pl[0], f.pl[1]) > 0 && P.clearance(f.pr[0], f.pr[1]) > 0));

/* the animation: a few hundred seconds of frames, including the storm and the light show, must never throw */
let frames = 0, err = null;
try { for (let t = 0; t < 400; t += 0.1) { SINGAPORE.frame({ clock: t, player: null }, G); frames++; } } catch (e) { err = e; }
console.log('animation: ran', frames, 'frames (400 s)', err ? 'THREW: ' + err.stack.split('\n').slice(0, 3).join(' | ') : 'without error');

/* ---- the fixed overhead lens (35.26 deg up, from the south-east): is the road visible? ---------------------------------
   For road points all round the lap (three across the width), cast the sight line toward the camera and look for a building
   whose footprint it passes over below the building's top. Reports the share of road points that are hidden. */
{
  const B = P.structs.buildings.slice(); if (P.structs.tri) B.push({ x: P.structs.tri.x, y: P.structs.tri.y, ang: P.structs.tri.ang, w: 240, d: 40, h: P.structs.tri.h * 0.92, z: 0 });
  const CELLS = new Map(), key = (x, y) => Math.floor(x / 80) + ',' + Math.floor(y / 80);
  for (const b of B) { const r = Math.hypot(b.w, b.d) / 2; for (let x = b.x - r; x <= b.x + r + 80; x += 80) for (let y = b.y - r; y <= b.y + r + 80; y += 80) { const k = key(x, y); (CELLS.get(k) || CELLS.set(k, []).get(k)).push(b); } }
  const inside = (b, x, y) => { const dx = x - b.x, dy = y - b.y, c = Math.cos(b.ang), s = Math.sin(b.ang); return Math.abs(dx * c + dy * s) < b.w / 2 && Math.abs(-dx * s + dy * c) < b.d / 2; };
  let pts = 0, hidden = 0, worst = null; const S2 = Math.SQRT1_2;
  for (let i = 0; i < n; i += 3) for (const off of [-T.half * 0.7, 0, T.half * 0.7]) {
    pts++; const x0 = T.x[i] + T.nx[i] * off, y0 = T.y[i] + T.ny[i] * off, z0 = T.z[i];
    let blocked = null;
    for (let s = 2; s < 420 && !blocked; s += 2.5) { const x = x0 + S2 * s, y = y0 + S2 * s, list = CELLS.get(key(x, y)); if (!list) continue;
      for (const b of list) if (inside(b, x, y) && b.z + b.h > z0 + 0.7071 * s) { blocked = b; break; } }
    if (blocked) { hidden++; if (!worst) worst = { u: (i / n).toFixed(3), type: blocked.type, h: blocked.h.toFixed(0) }; }
  }
  console.log('view from the overhead lens: road points hidden by a building:', hidden, 'of', pts, '(' + (100 * hidden / pts).toFixed(1) + '%)', worst ? 'first at ' + JSON.stringify(worst) : '');
}
