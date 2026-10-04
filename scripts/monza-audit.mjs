/* The Monza world plan in Node: counts, timings, clearance and overhead-lens audit.  node scripts/monza-audit.mjs [detail 0|1] */
import { TRACKS } from '../src/tracks/index.js';
import { buildTrack } from '../src/tracks/build.js';
import { planMonza, auditMonza } from '../src/render3d/worlds/monza-plan.js';

const detail = process.argv[2] != null ? +process.argv[2] : 1;
const T = buildTrack(TRACKS.find(t => t.id === 'monza'));
const t0 = Date.now(); const P = planMonza(T, { detail });
console.log('plan built in', Date.now() - t0, 'ms', JSON.stringify(P.tm));
console.log('grid', P.grid.NX, 'x', P.grid.NY, 'step', P.grid.STEP);
console.log('counts', JSON.stringify(P.stats.counts));
console.log('audit', JSON.stringify(auditMonza(P, T)));
const S = P.structs;
console.log('villa', S.villa ? S.villa.h.toFixed(0) + ' m at ' + S.villa.x.toFixed(0) + ',' + S.villa.y.toFixed(0) : 'none', '| flyover', !!S.flyover, '| banks', S.banks.map(b => (b.i0 / T.n).toFixed(3) + '-' + (b.i1 / T.n).toFixed(3) + ' side ' + b.side).join(', '), '| tent village', !!S.tentVillage);
for (const st of S.stands) console.log('  stand', st.name.padEnd(10), 'side', st.side, 'off', st.off0.toFixed(0));
console.log('footbridges', S.footbridges.map(f => (f.i / T.n).toFixed(3)).join(' '));
let tall = 0, tallest = 0; for (const t of S.trees.concat(S.pines)) { if (t.h > 20) tall++; tallest = Math.max(tallest, t.h); }
console.log('trees taller than 20 m:', tall, '| tallest', tallest.toFixed(0), 'm');
