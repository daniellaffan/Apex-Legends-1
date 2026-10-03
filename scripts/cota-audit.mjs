/* Prints the COTA numbers from the real buildTrack(): node scripts/cota-audit.mjs */
import { TRACKS } from '../src/tracks/index.js';
import { buildTrack } from '../src/tracks/build.js';
import { ELEV_VISUAL } from '../src/tracks/shared.js';

const def = TRACKS.find(t => t.id === 'cota');
const T = buildTrack(def), n = T.n;
let A = 0, turn = 0;
for (let i = 0; i < n; i++) {
  const j = (i + 1) % n; A += T.x[i] * T.y[j] - T.x[j] * T.y[i];
  let d = T.ang[j] - T.ang[i]; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; turn += d;
}
const deg = turn * 180 / Math.PI;
console.log('winding: net turn', deg.toFixed(0), 'deg, signed area', (A / 2) | 0, '=>', deg < 0 ? 'ANTICLOCKWISE (on screen, y down)' : 'CLOCKWISE');
console.log('lap length', T.length.toFixed(1), 'm   (real 5513 m)');
let mn = 1e9, mx = -1e9, imn = 0, imx = 0, gmax = 0, ig = 0;
for (let i = 0; i < n; i++) {
  if (T.z[i] < mn) { mn = T.z[i]; imn = i; } if (T.z[i] > mx) { mx = T.z[i]; imx = i; }
  const g = (T.z[(i + 1) % n] - T.z[i]) / T.ds; if (Math.abs(g) > Math.abs(gmax)) { gmax = g; ig = i; }
}
console.log('height min', mn.toFixed(2), 'at u', (imn / n).toFixed(3), ' max', mx.toFixed(2), 'at u', (imx / n).toFixed(3), ' range', (mx - mn).toFixed(2), 'm = ', ((mx - mn) / 0.3048).toFixed(0), 'ft (real 133 ft)');
console.log('ELEV_VISUAL', ELEV_VISUAL, '(displayed = real x', ELEV_VISUAL, ')');
console.log('steepest gradient', (gmax * 100).toFixed(1), '% at u', (ig / n).toFixed(3));
const zu = u => T.z[Math.round(u * n) % n].toFixed(1);
const key = [['start line', 0], ['top of T1 climb (crest)', 0.079], ['T1 exit', 0.095], ['Esses T3', 0.136], ['Esses T5', 0.163], ['end of Esses', 0.183], ['T11 hairpin', 0.383], ['end of back straight (T12)', 0.600], ['T16-18', 0.716], ['final corner T20', 0.879]];
for (const [k, u] of key) console.log('  z at', k.padEnd(28), 'u', u.toFixed(3), zu(u), 'm');
// seam: height and gradient across the line
const sg = (T.z[1] - T.z[0]) / T.ds, eg = (T.z[0] - T.z[n - 1]) / T.ds;
console.log('lap seam: z(end) - z(start) =', (T.z[n - 1] - T.z[0]).toFixed(3), 'm; gradient before line', (eg * 100).toFixed(2), '% after', (sg * 100).toFixed(2), '%');
// straights
const dh = i => { let d = T.ang[(i + 1) % n] - T.ang[i]; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const runs = []; let a = -1;
for (let i = 0; i <= n; i++) { const st = Math.abs(dh(i % n)) / T.ds < 0.0015; if (st && a < 0) a = i; if (!st && a >= 0) { if ((i - a) * T.ds > 150) runs.push([a, i]); a = -1; } }
for (const [p, q] of runs) console.log('  straight u', (p / n).toFixed(3), '->', (q / n).toFixed(3), ((q - p) * T.ds).toFixed(0), 'm');
console.log('pit: side', T.pitSide, 'in node', T.pitIn, '(u', (T.pitIn / n).toFixed(3) + ')', 'out node', T.pitOut, '(u', (T.pitOut / n).toFixed(3) + ')', 'lane length', ((T.pitSpan) * T.ds).toFixed(0), 'm; bank on pit:', Math.max(...Array.from({ length: n }, (_, i) => T.pitU(i) >= 0 ? Math.abs(T.bank[i]) : 0)));
console.log('start at x,y', T.x[0].toFixed(1), T.y[0].toFixed(1), 'heading', (T.ang[0] * 180 / Math.PI).toFixed(1), 'deg; lap counting reads the line at node 0');
console.log('max |bank|', Math.max(...T.bank.map(Math.abs)), ' runoffMax', T.runoffMax.toFixed(0));
