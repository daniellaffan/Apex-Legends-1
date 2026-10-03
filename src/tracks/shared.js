/* Circuits. layout DSL: S<metres> | R<deg>/<radius> | L<deg>/<radius>
   elev(u) -> metres above datum. scene = procedural set dressing.        */
// elevation as a piecewise profile over the lap, eased between the points given,
// so a climb can be put exactly where the real one is
function elevPW(pts){
  return u => {
    u = ((u % 1) + 1) % 1;
    for(let i = 0; i < pts.length - 1; i++){
      const [u0, z0] = pts[i], [u1, z1] = pts[i + 1];
      if(u >= u0 && u <= u1){ const t = (u - u0) / Math.max(u1 - u0, 1e-6); return z0 + (z1 - z0) * (0.5 - 0.5 * Math.cos(Math.PI * t)); }
    }
    return pts[pts.length - 1][1];
  };
}
/* A closed elevation profile through [u, metres] control points (u rising from 0,
   the last point's height wraps to the first). Piecewise cubic Hermite with
   Fritsch-Carlson slopes: continuous gradient everywhere, no overshoot between
   points, and the same height AND slope either side of the start line, so the lap
   closes exactly. elevPW above is flat at every knot; this is not. */
function elevSpline(pts){
  const n = pts.length, U = pts.map(p => p[0]), Z = pts.map(p => p[1]);
  const du = i => ((U[(i + 1) % n] - U[i]) + (i + 1 >= n ? 1 : 0)), sec = i => (Z[(i + 1) % n] - Z[i]) / du(i);
  const m = Z.map((_, i) => {
    const a = sec((i - 1 + n) % n), b = sec(i);
    if(a * b <= 0) return 0;
    const w1 = 2 * du(i) + du((i - 1 + n) % n), w2 = du(i) + 2 * du((i - 1 + n) % n);
    return (w1 + w2) / (w1 / a + w2 / b);
  });
  return u => {
    u = ((u % 1) + 1) % 1;
    let i = n - 1; for(let k = 0; k < n - 1; k++) if(u < U[k + 1]){ i = k; break; }
    const h = du(i), t = (u - U[i]) / h, t2 = t * t, t3 = t2 * t, j = (i + 1) % n;
    return (2 * t3 - 3 * t2 + 1) * Z[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * Z[j] + (t3 - t2) * h * m[j];
  };
}
/* The one visual exaggeration of height for every circuit (1 = the real figures).
   Applied where the lap's heights are first read, in buildTrack. */
const ELEV_VISUAL = 1.0;
// a smooth bump centred on one lap fraction: banking through one corner
/* How far the road surface is above (or below) the centreline at lateral offset
   o, node k. Every piece of the circuit asks this one function: the ribbon, the
   kerbs, the walls and fences, the 2D renderer and the car's own ride height,
   so they can never disagree. A circuit with real banking (def.banking) builds
   its own profile in buildTrack; otherwise the old planar bank, which no
   circuit but the old Zandvoort ever used. */
function bankZ(T, k, o){
  if(T.bankZf) return T.bankZf(k, o);
  const b = T.bank[k]; if(!b) return 0;
  return Math.abs(o) * b * (Math.sign(o) === Math.sign(T.curv[k]) ? -0.5 : 1);
}
function bumpU(u, c, w){ const d = Math.abs((((u - c) % 1) + 1.5) % 1 - 0.5); return d < w ? 0.5 + 0.5 * Math.cos(Math.PI * d / w) : 0; }


export { bankZ, bumpU, elevPW, elevSpline, ELEV_VISUAL };
