/* The Baku world plan in Node: counts, timings, clearance and overhead-lens audit.  node scripts/baku-audit.mjs [detail 0|1] */
import { TRACKS } from '../src/tracks/index.js';
import { buildTrack } from '../src/tracks/build.js';
import { planBaku, auditBaku } from '../src/render3d/worlds/baku-plan.js';

const detail = process.argv[2] != null ? +process.argv[2] : 1;
const T = buildTrack(TRACKS.find(t => t.id === 'baku'));
const t0 = Date.now(); const P = planBaku(T, { detail });
console.log('plan built in', Date.now() - t0, 'ms', JSON.stringify(P.tm));
const G = P.grid; let wet = 0; for (let k = 0; k < G.WATER.length; k++) wet += G.WATER[k];
console.log('grid', G.NX, 'x', G.NY, 'step', G.STEP, '| sea cells', wet, '(', (100 * wet / G.WATER.length).toFixed(0), '%)');
console.log('counts', JSON.stringify(P.stats.counts));
console.log('building kinds', JSON.stringify(P.stats.kinds));
console.log('audit', JSON.stringify(auditBaku(P, T)));
const S = P.structs;
console.log('monuments', S.monuments.map(m => m.type + '(' + m.h + ' m)').join(', '), '| flame towers', S.flame ? S.flame.h.toFixed(0) + ' m' : 'none', '| wheel', !!S.wheel, '| pier', !!S.pier, '| wall height range', S.walls.length ? Math.min(...S.walls.map(w => w.h)).toFixed(1) + '..' + Math.max(...S.walls.map(w => w.h)).toFixed(1) : 'n/a');
for (const st of S.stands) console.log('  stand', st.name.padEnd(5), 'side', st.side, 'off', st.off0.toFixed(0), st.wet ? 'ON WATER?' : '');
console.log('footbridges', S.footbridges.map(f => (f.i / T.n).toFixed(3)).join(' '));
console.log('tallest building', Math.max(...S.buildings.map(b => b.h)).toFixed(0), 'm');
