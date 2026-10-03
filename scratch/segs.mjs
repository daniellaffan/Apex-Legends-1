import { TRACKS } from '../src/tracks/index.js';
import { buildTrack } from '../src/tracks/build.js';
const def = TRACKS.find(t => t.id === 'cota');
const T = buildTrack(def);
// find lap fraction of each corner by heading-change accumulation along the built centreline
const n = T.n; const dh = [];
for (let i = 0; i < n; i++) { let d = T.ang[(i + 1) % n] - T.ang[i]; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; dh.push(d); }
// smooth, then find runs where |curv| high
const out = []; let run = null;
for (let i = 0; i < n; i++) {
  const c = Math.abs(dh[i]) / T.ds; // rad/m
  if (c > 0.004) { if (!run) run = { a: i, tot: 0 }; run.tot += dh[i]; run.b = i; }
  else if (run) { out.push(run); run = null; }
}
if (run) out.push(run);
let k = 0;
for (const r of out) { k++; console.log(k, 'u', (r.a / n).toFixed(3), '-', (r.b / n).toFixed(3), 'deg', (r.tot * 180 / Math.PI).toFixed(0), 'z', T.z[r.a].toFixed(1)); }
console.log('x,y start', T.x[0].toFixed(0), T.y[0].toFixed(0), 'heading', (T.ang[0] * 180 / Math.PI).toFixed(0));
