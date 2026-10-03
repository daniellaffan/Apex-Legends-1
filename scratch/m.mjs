import { TRACKS } from '../src/tracks/index.js';
import { buildTrack } from '../src/tracks/build.js';
const def = TRACKS.find(t => t.id === 'cota');
const T = buildTrack(def);
let A = 0; for (let i = 0; i < T.n; i++) { const j = (i + 1) % T.n; A += T.x[i] * T.y[j] - T.x[j] * T.y[i]; }
let turn = 0; for (let i = 0; i < T.n; i++) { const j = (i + 1) % T.n; let d = T.ang[j] - T.ang[i]; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; turn += d; }
console.log('n', T.n, 'len', T.length.toFixed(0), 'area', A / 2 | 0, 'netTurn deg', (turn * 180 / Math.PI).toFixed(0));
let mn = 1e9, mx = -1e9; for (const z of T.z) { mn = Math.min(mn, z); mx = Math.max(mx, z); }
console.log('z', mn, mx, 'start', T.z[0], 'end', T.z[T.n - 1]);
console.log(Object.keys(T).join(' '));
console.log('pit', JSON.stringify(def.pit), 'world', def.world);
