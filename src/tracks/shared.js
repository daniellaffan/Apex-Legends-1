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


export { bankZ, bumpU, elevPW };
