/* The COTA world plan, in Node: counts, timings and the clearance audit.  node scripts/cota-audit-world.mjs [detail 0|1] */
import { TRACKS } from '../src/tracks/index.js';
import { buildTrack } from '../src/tracks/build.js';
import { planCota, auditCota } from '../src/render3d/worlds/cota-plan.js';

const detail = process.argv[2] != null ? +process.argv[2] : 1;
const T = buildTrack(TRACKS.find(t => t.id === 'cota'));
const t0 = Date.now();
const P = planCota(T, { detail });
console.log('plan built in', Date.now() - t0, 'ms', JSON.stringify(P.tm));
console.log('grid', P.grid.NX, 'x', P.grid.NY, 'step', P.grid.STEP, 'height range', Math.min(...P.grid.H).toFixed(1), Math.max(...P.grid.H).toFixed(1));
console.log('plants', JSON.stringify(P.stats.plants));
console.log('structures', JSON.stringify(P.stats.structs));
const a = auditCota(P, T);
console.log('audit: checked', a.checked, 'too close to a barrier', a.tooClose, 'inside a footprint', a.inFootprint, 'min clearance past barrier', a.minBar.toFixed(2), 'm', a.worst ? JSON.stringify(a.worst) : '');
for (const st of P.structs.stands) console.log('  stand', st.name.padEnd(9), 'side', st.side, 'off', st.off0.toFixed(0), 'depth', st.depth.toFixed(0), 'h', st.height.toFixed(1), 'nodes', st.span + 1);
const tw = P.structs.tower; console.log('tower at', tw.x.toFixed(0), tw.y.toFixed(0), 'side', tw.side, 'off', tw.off.toFixed(0));
console.log('lots', P.structs.lots.length, 'of', P.lotSpec.length, '| ferris', !!P.structs.ferris, '| ponds', P.structs.ponds.length);
