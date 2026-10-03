import { clamp } from '../config/util.js';

/* ---------- where a car was hit, and what that did to it ------------------
   A contact is described in the car's own frame (x out of the nose, z out of
   the right-hand side, metres, the same frame the 3D model is built in).
   Every contact adds to a short list of dents; the 3D car crumples its
   bodywork from that list, so the damage you see is exactly where the hit
   was and as deep as it was hard. Physics never reads the shape of a dent. */
const REACH_X = 2.35, REACH_Z = 0.95;     // roughly the model's outline, for putting a hit on its skin
const MAX_DENTS = 14;

/* dir = world direction from the car towards what it hit (unit), h = its heading.
   Returns the local contact point, the push direction (into the car) and a zone name. */
function contactLocal(dx, dy, h){
  const fx = Math.cos(h), fy = Math.sin(h);
  const lf = dx * fx + dy * fy, lr = -dx * fy + dy * fx;        // along the nose, out of the right side
  const k = Math.max(Math.abs(lf) / REACH_X, Math.abs(lr) / REACH_Z, 1e-3);
  const px = lf / k, pz = lr / k;                                // on the outline, in the direction of the hit
  const front = lf > 0, ang = Math.atan2(lr, lf);                // 0 nose, +pi/2 right
  let zone;
  const a = Math.abs(ang);
  if(a < 0.5) zone = "nose";
  else if(a > 2.65) zone = "tail";
  else if(a < 1.15) zone = ang > 0 ? "fr" : "fl";
  else if(a > 2.0) zone = ang > 0 ? "rr" : "rl";
  else zone = ang > 0 ? "right" : "left";
  return { px, pz, lf, lr, ang, zone, front, nx:-lf, nz:-lr };
}

/* Add a dent. Nearby dents merge, so a car that is ground along a wall gets one
   long deep crease and not forty little ones. */
function addDent(c, loc, mag){
  if(!c.dents) c.dents = [];
  mag = clamp(mag, 0, 1);
  for(const d of c.dents){
    if(Math.hypot(d.x - loc.px, d.z - loc.pz) < 0.55){
      d.mag = clamp(d.mag + mag * 0.6, 0, 1.25);
      d.x += (loc.px - d.x) * 0.25; d.z += (loc.pz - d.z) * 0.25;
      d.hits++; c.dentVer = (c.dentVer || 0) + 1; return d;
    }
  }
  const d = { x:loc.px, z:loc.pz, nx:loc.nx, nz:loc.nz, mag, hits:1, seed:Math.random() * 1000 };
  const n = Math.hypot(d.nx, d.nz) || 1; d.nx /= n; d.nz /= n;
  c.dents.push(d);
  if(c.dents.length > MAX_DENTS){
    let k = 0; for(let i = 1; i < c.dents.length; i++) if(c.dents[i].mag < c.dents[k].mag) k = i;
    c.dents.splice(k, 1);
  }
  c.dentVer = (c.dentVer || 0) + 1;
  return d;
}

/* The sideways kick two cars give each other. dx, dy is the world direction from
   this car to the other. A front corner that is hit is pushed off, a rear one is
   swung round; a square-on shunt along the centre line does not turn anything. */
function contactTorque(c, dx, dy, imp){
  const L = contactLocal(dx, dy, c.h);
  const fd = Math.hypot(L.lf, L.lr) || 1, f = L.lf / fd, r = L.lr / fd;
  return -Math.sign(f || 1) * Math.sign(r || 1) * imp * 0.22 * clamp(Math.abs(r) * 2.6, 0, 1) * clamp(Math.abs(f) * 2, 0.3, 1);
}

/* The effect queue: physics says what happened, the 3D renderer shows it.
   The list is capped so a 2D fallback, which never reads it, cannot grow it. */
function pushFx(S, ev){
  if(!S) return;
  if(!S.fx) S.fx = [];
  if(S.fx.length > 80) S.fx.shift();
  S.fx.push(ev);
}

export { MAX_DENTS, addDent, contactLocal, contactTorque, pushFx };
