import { $ } from '../config/util.js';

/* ---------- 5. renderer --------------------------------------------------- */
const ISX = 0.866, ISY = 0.50, ZS = 0.88;          // the settled overhead angle
const NEARP = 0.9;                                 // broadcast-camera near plane, in metres
const CAM_LOW = { isx:0.94, isy:0.30, zs:1.30 };    // crouched in behind the car
/* ---------- the Sphere's screen ------------------------------------------
   Painted equirectangular: x is longitude, y is latitude, so a 2:1 canvas maps
   one-to-one onto the ball and a circle drawn near the equator stays a circle.
   Longitude 0 sits in the middle of the canvas and is aimed at the camera.
   -------------------------------------------------------------------------- */

const R = {
  cv:null, ctx:null, W:0, H:0, dpr:1, camX:0, camY:0, zoom:7, targZoom:7, parts:[],
  // the wheel nudges this, and it drifts back to 1 once you leave it alone
  userZoom:1, userZoomT:99,
  init(){
    this.cv = $("#view"); this.ctx = this.cv.getContext("2d", { alpha:false });
    this.resize(); addEventListener("resize", () => this.resize());
  },
  resize(){
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.W = this.cv.clientWidth; this.H = this.cv.clientHeight;
    this.cv.width = Math.max(1, this.W * this.dpr); this.cv.height = Math.max(1, this.H * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  },
  isx:ISX, isy:ISY, zs:ZS,
  // the broadcast camera: a perspective lens, used when the feed cuts trackside
  persp:false, fx:0, fy:0, fz:0, fcos:1, fsin:0, froll:0, fpitch:0, focal:900,
  // camera space -> screen. Everything the broadcast camera draws goes through
  // here, so a clipped vertex lands exactly where an unclipped one would.
  proj(f, r, dz){
    const inv = this.focal / Math.max(f, NEARP * 0.5);
    let px = r * inv, py = -dz * inv - this.fpitch;
    if(this.froll){
      const cr = Math.cos(this.froll), sr = Math.sin(this.froll);
      const qx = px * cr - py * sr; py = px * sr + py * cr; px = qx;
    }
    return [this.W / 2 + px, this.H / 2 + py + this.shakeY];
  },
  P(x, y, z){
    if(this.persp){
      const dx = x - this.fx, dy = y - this.fy, dz = (z || 0) - this.fz;
      const f = dx * this.fcos + dy * this.fsin;                      // forward (can be negative: behind you)
      const r = -dx * this.fsin + dy * this.fcos;                     // right
      const s = this.proj(f, r, dz);
      // carry the camera-space position so poly() can clip against the near plane
      s[2] = f; s[3] = r; s[4] = dz;
      return s;
    }
    const X = (x - y) * this.isx, Y = (x + y) * this.isy - (z || 0) * this.zs;
    return [(X - this.camX) * this.zoom + this.W / 2, (Y - this.camY) * this.zoom + this.H / 2 + this.shakeY];
  },
  fwdOf(x, y){ return (x - this.fx) * this.fcos + (y - this.fy) * this.fsin; },
  shakeY:0,
};
/* Anything partly behind the broadcast camera has to be cut off at the near plane.
   Clamping the vertex instead (which is what a naive projection does) smears the
   polygon right across the screen — that was the horizon tearing. */
function clipNear(pts){
  const out = [];
  for(let i = 0; i < pts.length; i++){
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const fa = a[2], fb = b[2], ain = fa >= NEARP, bin = fb >= NEARP;
    if(ain) out.push(a);
    if(ain !== bin){
      const t = (NEARP - fa) / (fb - fa);
      const r = a[3] + (b[3] - a[3]) * t, dz = a[4] + (b[4] - a[4]) * t;
      const q = R.proj(NEARP, r, dz); q[2] = NEARP; q[3] = r; q[4] = dz;
      out.push(q);
    }
  }
  return out;
}
function poly(ctx, pts, fill, stroke, lw){
  if(R.persp && pts.length > 2 && pts[0].length > 4){
    let cut = false;
    for(let i = 0; i < pts.length; i++) if(pts[i][2] < NEARP){ cut = true; break; }
    if(cut){ pts = clipNear(pts); if(pts.length < 3) return; }
  }
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for(let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  if(fill){ ctx.fillStyle = fill; ctx.fill(); }
  if(stroke){ ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
}

/* ---- textures ------------------------------------------------------------
   Nothing external can be loaded here, so every texture is painted once into
   an offscreen canvas and cached: facades, seating, garage doors, and the
   grain that goes on the ground. Faces then get them mapped on, two affine
   triangles per face, which is exact from overhead and close enough from the
   seat. */

export { CAM_LOW, ISX, ISY, NEARP, R, ZS, poly };
