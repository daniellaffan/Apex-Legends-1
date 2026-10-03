/* Where the seated DNF driver's head is, against the helmet baked into the car (x 1.34, z 0.78 in car metres). node scripts/driver-size.mjs */
globalThis.window = globalThis;
const mk = () => new Proxy(function () {}, { get: (t, k) => (k === 'canvas' ? { width: 1, height: 1 } : k === 'data' ? new Uint8ClampedArray(1 << 20) : (k === 'width' || k === 'height') ? 1 : mk()), set: () => true, apply: () => mk() });
const canvas = () => ({ width: 1, height: 1, getContext: () => mk(), style: {}, addEventListener() {} });
globalThis.document = { createElement: canvas, body: { appendChild() {} }, getElementById: () => canvas(), addEventListener() {} };
globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.addEventListener = () => {}; globalThis.innerWidth = 1280; globalThis.innerHeight = 720; globalThis.devicePixelRatio = 1; globalThis.Image = class { set src(v) {} };
const THREE = await import('three');
const { G3 } = await import('../src/render3d/g3.js');
await import('../src/render3d/person.js');
const { CINE } = await import('../src/render3d/cine.js');
G3.texes = G3.texes || new Map();
for (const S0 of [1.0, 0.84]) {
  const P = G3.person({ suit: '#2A3A5C', accent: '#F2F2F2', helmet: '#F2C230' });
  P.root.scale.setScalar(S0);
  const keys = CINE.dnfKeys(1, S0), k0 = keys[0];
  P.pose(k0.pose);
  P.root.position.set(k0.x, k0.y - 0.93 * S0, k0.z); P.root.updateMatrixWorld(true);
  const hp = new THREE.Vector3(); P.head.getWorldPosition(hp);
  const hel = new THREE.Vector3(); P.helm.getWorldPosition(hel);
  // standing
  P.pose({}); P.root.position.set(0, 0, 0); P.root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(P.root);
  let tris = 0; P.root.traverse(o => { if (o.isMesh) tris += o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3; });
  console.log('scale', S0, '| seated helmet centre at car x', hel.x.toFixed(2), 'height', hel.y.toFixed(2), '(cockpit helmet: x 1.34, height 0.78) | standing height', (box.max.y - box.min.y).toFixed(2), 'm | triangles', tris);
}
