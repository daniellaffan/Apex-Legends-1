/* Spa-Francorchamps checks, in Node (no browser, no GPU):
     node scripts/spa-audit.mjs [detail]      detail 1 (default) or 0 (Lite)
   1. the lap: winding, length, heights at the key corners, the seam at the line, the pit lane
   2. the world plan: what it places and how long it takes
   3. clearance: every tree canopy, house, stand, bank, post, tent and parked car against the
      barrier line, measured from every segment of the centreline
   4. clipping: no ground above the road ribbons inside the barrier line, and how high the
      ground stands right behind the Armco
   For draw calls and triangles through the real G3.build: node scripts/census.mjs spa */
import { buildTrack } from '../src/tracks/build.js';
import { ELEV_VISUAL } from '../src/tracks/shared.js';
import spa from '../src/tracks/spa.js';
import { planSpa, auditSpa } from '../src/render3d/worlds/spa-plan.js';

const detail = process.argv[2] == null ? 1 : +process.argv[2];
const T = buildTrack(spa), n = T.n;

// 1. the lap
let area = 0, turn = 0, lo = Infinity, hi = -Infinity, li = 0, hiI = 0, gm = 0, gi = 0;
for(let i = 0; i < n; i++){
  const j = (i + 1) % n; area += T.x[i] * T.y[j] - T.x[j] * T.y[i];
  let d = T.ang[j] - T.ang[i]; while(d > Math.PI) d -= 2 * Math.PI; while(d < -Math.PI) d += 2 * Math.PI; turn += d;
  if(T.z[i] < lo){ lo = T.z[i]; li = i; } if(T.z[i] > hi){ hi = T.z[i]; hiI = i; }
  const g = T.grade(i); if(Math.abs(g) > Math.abs(gm)){ gm = g; gi = i; }
}
const at = u => T.z[Math.round(u * n) % n].toFixed(1);
console.log(`lap: ${turn > 0 ? 'CLOCKWISE' : 'ANTICLOCKWISE'} (net turn ${(turn * 180 / Math.PI).toFixed(0)} deg, signed area ${(area / 2).toFixed(0)} m2, + is clockwise with y south), ${T.length.toFixed(0)} m, ${n} nodes`);
console.log(`heights (x${ELEV_VISUAL}): min ${lo.toFixed(1)} m at u ${(li / n).toFixed(3)}, max ${hi.toFixed(1)} m at u ${(hiI / n).toFixed(3)}, steepest ${(gm * 100).toFixed(1)} % at u ${(gi / n).toFixed(3)}`);
console.log(`  line ${at(0)}  La Source ${at(0.030)}  Eau Rouge ${at(0.093)}  top of Raidillon ${at(0.116)}  Les Combes ${at(0.374)}  Malmedy ${at(0.397)}  Pouhon ${at(0.527)}  Paul Frere ${at(0.751)}  Blanchimont ${at(0.885)}  Bus Stop ${at(0.967)}`);
console.log(`  seam at the line: ${(spa.elev(1 - 1e-9) - spa.elev(0)).toFixed(4)} m;  pit ${T.pitSide > 0 ? 'right' : 'left'}, in ${(T.pitIn / n).toFixed(3)}, out ${(T.pitOut / n).toFixed(3)}, box ${(T.pitBox / n).toFixed(3)}`);

// 2. the plan
const t0 = Date.now(), P = planSpa(T, { detail });
console.log(`\nplan (detail ${detail}): ${Date.now() - t0} ms ${JSON.stringify(P.tm)}`);
console.log(' ', JSON.stringify(P.stats));
console.log('  lists', JSON.stringify(Object.fromEntries(Object.entries(P.lists).map(([k, v]) => [k, v.length]))));
console.log('  structures', Object.entries(P.S.reduce((a, s) => (a[s.kind] = (a[s.kind] || 0) + 1, a), {})).map(e => e.join(':')).join(' '));

// 3. clearance
const A = auditSpa(P, T);
console.log(`\nclearance: ${A.checked} trees, worst canopy ${A.worstTree} m past the barrier line (${A.treesOnRoad} over it); houses worst ${A.worstBuilding} m (${A.buildingsOnRoad} over);`);
console.log(`  stands, banks, pits, posts worst ${A.worstStructure} m (${A.structuresOnRoad.length} over${A.structuresOnRoad.length ? ': ' + A.structuresOnRoad.join(' ') : ''}); tents and cars worst ${A.worstSmall} m; not built for want of room: ${A.dropped.length ? A.dropped.join(' ') : 'none'}`);

// 4. clipping
const G = P.grid; let over = 0, worst = -Infinity, checked = 0;
for(let r = 0; r < G.NY; r++) for(let c = 0; c < G.NX; c++){
  const k = r * G.NX + c; if(G.DB[k] > 0.5) continue;
  const q = P.query(G.X0 + c * G.STEP, G.Y0 + r * G.STEP), j = (q.i + 1) % n, zr = T.z[q.i] + (T.z[j] - T.z[q.i]) * q.t;
  const h = G.H[k] - (zr - 0.35); checked++; worst = Math.max(worst, h); if(h > 0) over++;   // the grass strip lies 0.35 m under the road
}
let behind = -Infinity, bu = 0;
for(let i = 0; i < n; i += 2) for(const sd of [-1, 1]){
  const o = sd * (T.half + (sd < 0 ? T.roL[i] : T.roR[i]) + 3.4), h = P.height(T.x[i] + T.nx[i] * o, T.y[i] + T.ny[i] * o) - T.z[i];
  if(h > behind){ behind = h; bu = i / n; } }
console.log(`\nclipping: ground inside the barrier line above the lowest ribbon at ${over} of ${checked} vertices (worst ${worst.toFixed(2)} m);`);
console.log(`  ground 0.8 m behind the Armco stands at most ${behind.toFixed(1)} m over the road (u ${bu.toFixed(3)})`);
