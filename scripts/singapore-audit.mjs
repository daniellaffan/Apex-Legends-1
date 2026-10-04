/* The Singapore world plan in Node: counts, timings, clearance audit.  node scripts/singapore-audit.mjs [detail 0|1] */
import { TRACKS } from '../src/tracks/index.js';
import { buildTrack } from '../src/tracks/build.js';
import { planSingapore, auditSingapore } from '../src/render3d/worlds/singapore-plan.js';

const detail = process.argv[2] != null ? +process.argv[2] : 1;
const T = buildTrack(TRACKS.find(t => t.id === 'singapore'));
const t0 = Date.now();
const P = planSingapore(T, { detail });
console.log('plan built in', Date.now() - t0, 'ms', JSON.stringify(P.tm));
const G = P.grid;
let wet = 0; for (let k = 0; k < G.WATER.length; k++) wet += G.WATER[k];
console.log('grid', G.NX, 'x', G.NY, 'step', G.STEP, '| water cells', wet, '(', (100 * wet / G.WATER.length).toFixed(0), '%)');
console.log('counts', JSON.stringify(P.stats.counts));
console.log('building kinds', JSON.stringify(P.stats.kinds));
const a = auditSingapore(P, T);
console.log('audit', JSON.stringify(a));
for (const st of P.structs.stands) console.log('  stand', st.name.padEnd(6), 'side', st.side, 'off', st.off0.toFixed(0), 'rows', st.rows, st.wet ? 'ON WATER?' : '');
console.log('footbridges', P.structs.footbridges.map(f => (f.i / T.n).toFixed(3)).join(' '));
console.log('tallest', Math.max(...P.structs.buildings.map(b => b.h)).toFixed(0), 'm; landmark buildings:', P.structs.buildings.filter(b => b.landmark).map(b => b.type).join(', '));
