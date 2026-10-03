/* The retirement cutscene in Node: the real CINE.dnfInit / dnfTick for many wrecks (every kind of tilt, some in the air, some
   pressed against the barrier), checking the truck parks inside the barrier clear of the car, the car ends level on the bed,
   the driver's soles are on the bed (not floating) while he stands, his hands really reach the halo, and he never goes
   through the car.   node scripts/dnf-test.mjs [track] */
globalThis.window = globalThis;
const mk = () => new Proxy(function () {}, { get: (t, k) => (k === 'canvas' ? { width: 1, height: 1 } : k === 'data' ? new Uint8ClampedArray(1 << 20) : (k === 'width' || k === 'height') ? 1 : mk()), set: () => true, apply: () => mk() });
const canvas = () => ({ width: 1, height: 1, getContext: () => mk(), style: {}, addEventListener() {} });
globalThis.document = { createElement: canvas, body: { appendChild() {} }, getElementById: () => canvas(), addEventListener() {} };
globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.addEventListener = () => {}; globalThis.innerWidth = 1280; globalThis.innerHeight = 720; globalThis.devicePixelRatio = 1;
globalThis.Image = class { set src(v) {} }; globalThis.requestAnimationFrame = () => 0;

const THREE = await import('three');
const { G3 } = await import('../src/render3d/g3.js');
for (const f of ['build', 'scenery', 'surfaces', 'car', 'person', 'recovery']) await import('../src/render3d/' + f + '.js');
const { CINE } = await import('../src/render3d/cine.js');
const { TRUCK } = await import('../src/render3d/recovery.js');
const { TRACKS } = await import('../src/tracks/index.js');
const { buildTrack } = await import('../src/tracks/build.js');
const { R } = await import('../src/render2d/view.js'); R.ctx = mk();

const id = process.argv[2] || 'cota';
const T = buildTrack(TRACKS.find(t => t.id === id));
G3.texes = G3.texes || new Map(); G3.dyn = []; G3.world = new THREE.Group();
CINE.caption = () => {}; CINE.shake = () => new THREE.Vector3();
const room = (x, z) => { const i = T.near(x, z), off = (x - T.x[i]) * T.nx[i] + (z - T.y[i]) * T.ny[i]; return T.half + T.roAt(i, off) + 2.6 - Math.abs(off); };
let seed = 12345; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

const st = { runs: 0, truckOut: 0, truckRoomWorst: 1e9, truckOnCar: 0, carOff: 0, carTilt: 0, floatMax: 0, sinkMax: 0, handErr: 0, footErr: 0, throughCar: 0, helmetNaN: 0, fallback: 0 };
const bad = [];
for (const u of [0.02, 0.079, 0.15, 0.3, 0.383, 0.5, 0.61, 0.72, 0.8, 0.88]) {
  const node = Math.round(u * T.n) % T.n;
  for (const offK of [0, 0.7, 0.97, -0.7, -0.97]) {
    const ro = offK >= 0 ? T.roR[node] : T.roL[node], off = offK * (T.half + ro + 2.6 - 1.4);
    for (let hk = 0; hk < 6; hk++) {
      const h = T.ang[node] + hk * Math.PI / 3 + 0.3, x = T.x[node] + T.nx[node] * off, y = T.y[node] + T.ny[node] * off;
      const g = new THREE.Group(); g.position.set(x, T.z[node] + (rnd() < 0.3 ? 0.6 : 0), y);
      g.rotation.set((rnd() - 0.5) * 2.4 * (hk % 2), -h, (rnd() - 0.5) * 2.4 * ((hk >> 1) % 2), 'YXZ'); g.updateMatrixWorld(true);
      const p = { node, off, x, y, z: T.z[node], team: { body: '#2A3A5C', accent: '#F2F2F2' }, drv: { cam: '#F2C230', n: 3, last: 'Test' }, lap: 2, retiredBy: 'Crash' };
      const S = { track: T, player: p, cine: { t: 0 } };
      G3.cars = [{ c: p, g }]; G3.world = new THREE.Group();
      CINE.dnfInit(G3, S);
      const c = S.cine, P = c.person; st.runs++;
      if (c.plan.room < -1.4) st.fallback++;
      // the truck: everything it covers is inside the barrier, and clear of the car's start position
      let tr = 1e9; const tm = c.tm;
      for (const lx of [TRUCK.FOOT.x0, 0, 4, TRUCK.FOOT.x1]) for (const lz of [-TRUCK.FOOT.hz, TRUCK.FOOT.hz]) { const w = new THREE.Vector3(lx, 0, lz).applyMatrix4(tm); tr = Math.min(tr, room(w.x, w.z)); }
      st.truckRoomWorst = Math.min(st.truckRoomWorst, tr); if (tr < -0.3) st.truckOut++;
      const q0inv = new THREE.Matrix4().compose(c.p0, c.q0, new THREE.Vector3(1, 1, 1)).invert(), tinv = tm.clone().invert();
      for (let lx = TRUCK.FOOT.x0; lx <= TRUCK.FOOT.x1; lx += 0.5) for (let lz = -TRUCK.FOOT.hz; lz <= TRUCK.FOOT.hz; lz += 0.5) {
        const w = new THREE.Vector3(lx, 0.8, lz).applyMatrix4(tm), l = w.clone().applyMatrix4(q0inv);
        if (l.x > -2.6 && l.x < 2.6 && Math.abs(l.z) < 1.0 && l.y > -0.1 && l.y < 1.15) { st.truckOnCar++; st.hitAt = (st.hitAt || '') + ' [u ' + u + ' offK ' + offK + ' hk ' + hk + ' plan ' + c.plan.score.toFixed(1) + ' room ' + c.plan.room.toFixed(1) + ']'; lx = 1e9; break; }
      }
      let carOK = true, minFootY = 1e9;
      const FRAME = 1 / 30;
      for (let t = 0; t <= c.dur + 0.01; t += FRAME) {
        c.t = t; CINE.dnfTick(G3, S, FRAME);
        const tau = t - c.tD;
        if (t > c.tD - 0.2) {
          // the car on the bed, level
          const up = new THREE.Vector3(0, 1, 0).transformDirection(c.carM), bedUp = new THREE.Vector3(0, 1, 0).transformDirection(tm);
          st.carTilt = Math.max(st.carTilt, up.angleTo(bedUp));
          const pl = new THREE.Vector3().setFromMatrixPosition(c.carM).applyMatrix4(tinv);
          if (t > c.tD + 0.6) st.carOff = Math.max(st.carOff, Math.hypot(pl.x, pl.z), Math.abs(pl.y - (TRUCK.BED_Y + 0.02)));
        }
        // soles on the bed when he stands or sits on it
        if ((tau > 6.5 && tau < 9.3) || (tau > 11.3)) {
          P.root.updateMatrixWorld(true);
          for (const n of ['l', 'r']) {
            const bx = new THREE.Box3().setFromObject(P[n + 'Ft']);
            const ctr = bx.getCenter(new THREE.Vector3()).applyMatrix4(c.carM.clone().invert());
            const solePt = new THREE.Vector3(ctr.x, 0, ctr.z), floorW = solePt.clone().applyMatrix4(c.carM);
            // car-local height of the lowest point of the foot above the bed top (car-local y = 0)
            const lo = new THREE.Vector3(ctr.x, 0, ctr.z); const wmin = bx.min.clone();
            const local = wmin.clone().applyMatrix4(c.carM.clone().invert());
            minFootY = Math.min(minFootY, local.y);
            const gap = bx.min.y - floorW.y;
            if (gap > st.floatMax) st.floatMax = gap; if (-gap > st.sinkMax) { st.sinkMax = -gap; st.sinkAt = 'tau ' + tau.toFixed(2) + ' u ' + u + ' offK ' + offK + ' hk ' + hk; }
          }
        }
        // hands on the halo while he holds it (IK weight 1)
        if (tau > 2.25 && tau < 3.4) {
          P.root.updateMatrixWorld(true);
          for (const [n, tgt] of [['l', [0.40, 0.87, -0.25]], ['r', [0.40, 0.87, 0.25]]]) {
            const hw = new THREE.Vector3(); P[n + 'Hand'].getWorldPosition(hw);
            const tw = new THREE.Vector3(...tgt).applyMatrix4(c.carM);
            st.handErr = Math.max(st.handErr, hw.distanceTo(tw));
          }
        }
        // after he is off the car he must be outside the car's footprint, except sitting against the tyre
        if (tau > 6.3 && tau < 11.0) {
          const l = new THREE.Vector3().setFromMatrixPosition(P.hips.matrixWorld).applyMatrix4(c.carM.clone().invert());
          if (l.x > -2.5 && l.x < 2.5 && Math.abs(l.z) < 0.85) st.throughCar++;
        }
        if (c.helm.thrown) { const hp = P.helm.position; if (![hp.x, hp.y, hp.z].every(Number.isFinite)) st.helmetNaN++; }
      }
      // the car's final pose equals the bed's
      CINE.dnfCleanup(G3, S);
    }
  }
}
console.log(id, ': runs', st.runs, '| truck spots that had to be forced:', st.fallback);
console.log('truck: past the barrier in', st.truckOut, 'runs (worst room', st.truckRoomWorst.toFixed(2), 'm) | truck overlapping the car where it lay in', st.truckOnCar, 'runs');
console.log('worst sink at', st.sinkAt, '| overlaps at', st.hitAt);
console.log('car on the bed: worst tilt vs the bed', (st.carTilt * 180 / Math.PI).toFixed(2), 'deg; worst offset from the bed centre after landing', st.carOff.toFixed(3), 'm');
console.log('driver on the bed: highest sole above it', st.floatMax.toFixed(3), 'm, lowest below it', st.sinkMax.toFixed(3), 'm | worst hand-to-halo error', st.handErr.toFixed(3), 'm | hips inside the car after the hop:', st.throughCar, 'frames | helmet NaN frames', st.helmetNaN);
