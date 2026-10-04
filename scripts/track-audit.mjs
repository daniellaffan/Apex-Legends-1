/* Winding, length, heights, straights and pit zone of any circuit, from the real buildTrack():
   node scripts/track-audit.mjs <trackId> [defPath] [u1,u2,...]   (extra lap fractions to print heights at) */
import { TRACKS } from '../src/tracks/index.js';
import { buildTrack } from '../src/tracks/build.js';
import { ELEV_VISUAL } from '../src/tracks/shared.js';

const id = process.argv[2] || 'singapore';
const def = process.argv[3] && process.argv[3] !== '-' ? (await import(process.argv[3])).default : TRACKS.find(t => t.id === id);
const T = buildTrack(def), n = T.n;
let A = 0, turn = 0;
for (let i = 0; i < n; i++) {
  const j = (i + 1) % n; A += T.x[i] * T.y[j] - T.x[j] * T.y[i];
  let d = T.ang[j] - T.ang[i]; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; turn += d;
}
const deg = turn * 180 / Math.PI;
console.log(id, 'winding: net turn', deg.toFixed(0), 'deg, signed area', (A / 2) | 0, '=>', deg < 0 ? 'ANTICLOCKWISE (on screen, y down)' : 'CLOCKWISE');
console.log('lap length', T.length.toFixed(1), 'm (definition says', def.len, ')');
let mn = 1e9, mx = -1e9, imn = 0, imx = 0, gmax = 0, ig = 0;
for (let i = 0; i < n; i++) {
  if (T.z[i] < mn) { mn = T.z[i]; imn = i; } if (T.z[i] > mx) { mx = T.z[i]; imx = i; }
  const g = (T.z[(i + 1) % n] - T.z[i]) / T.ds; if (Math.abs(g) > Math.abs(gmax)) { gmax = g; ig = i; }
}
console.log('height min', mn.toFixed(2), 'at u', (imn / n).toFixed(3), ' max', mx.toFixed(2), 'at u', (imx / n).toFixed(3), ' range', (mx - mn).toFixed(2), 'm | ELEV_VISUAL', ELEV_VISUAL);
console.log('steepest gradient', (gmax * 100).toFixed(1), '% at u', (ig / n).toFixed(3));
const extra = (process.argv[4] || '').split(',').filter(Boolean).map(Number);
for (const u of [0, ...extra]) console.log('  z at u', u.toFixed(3), T.z[Math.round(u * n) % n].toFixed(2), 'm');
const sg = (T.z[1] - T.z[0]) / T.ds, eg = (T.z[0] - T.z[n - 1]) / T.ds;
console.log('lap seam: z(end) - z(start) =', (T.z[n - 1] - T.z[0]).toFixed(3), 'm; gradient before line', (eg * 100).toFixed(2), '% after', (sg * 100).toFixed(2), '%');
const dh = i => { let d = T.ang[(i + 1) % n] - T.ang[i]; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const runs = []; let a = -1;
for (let i = 0; i <= n; i++) { const st = Math.abs(dh(i % n)) / T.ds < 0.0015; if (st && a < 0) a = i; if (!st && a >= 0) { if ((i - a) * T.ds > 120) runs.push([a, i]); a = -1; } }
for (const [p, q] of runs) console.log('  straight u', (p / n).toFixed(3), '->', (q / n).toFixed(3), ((q - p) * T.ds).toFixed(0), 'm');
// corners: runs where the heading changes fast
const cs = []; let r = null;
for (let i = 0; i < n; i++) { if (Math.abs(dh(i)) / T.ds > 0.004) { if (!r) r = { a:i, tot:0 }; r.tot += dh(i); r.b = i; } else if (r) { cs.push(r); r = null; } }
if (r) cs.push(r);
console.log('corners found:', cs.length, cs.map(c => (c.tot < 0 ? 'L' : 'R') + Math.abs(c.tot * 180 / Math.PI).toFixed(0) + '@' + (c.a / n).toFixed(3)).join(' '));
console.log('pit: side', T.pitSide, 'in u', (T.pitIn / n).toFixed(3), 'out u', (T.pitOut / n).toFixed(3), 'lane', (T.pitSpan * T.ds).toFixed(0), 'm, box u', (T.pitBox / n).toFixed(3), '| max |bank| on lap', Math.max(...T.bank.map(Math.abs)), '| runoffMax', T.runoffMax.toFixed(1), '| start', T.x[0].toFixed(1), T.y[0].toFixed(1), 'heading', (T.ang[0] * 180 / Math.PI).toFixed(1));
