import * as THREE from 'three';
import { clamp } from '../config/util.js';
import { PART } from '../render2d/particles.js';

/* ---------- weather, in 3D ------------------------------------------------
   The 2D painter has always drawn the rain (a dark wash and two layers of
   streaks), but the 3D renderer drew none: in the wet only the haze closed in.
   This is the 3D side of it, for every circuit:

   - falling rain: streaks in a box that follows the camera, one draw call, as
     many drops and as bright as the track is wet
   - the light goes flat: the sun dims, the sky fill a little less
   - the road goes dark and glossy, and the ground darkens
   - the spray and tyre smoke the session spawns ("smoke" particles) as soft pale
     puffs in their own colours, rather than as orange sparks

   A world that does its own wet (Silverstone and Zandvoort darken their fields
   and the road, and dim the sun with the clouds) keeps doing it; this only adds
   the rain and the puffs there. Nothing here runs in the dry. */
const N = 4000, PUFFS = 330, FALL = 14, STREAK = 2.6, WIND = 0.6, WINDV = 2.5;

const WEATHER = {
  build(G, S){
    // the rain: N line segments, positions written each frame
    const pos = new Float32Array(N * 6), geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setDrawRange(0, 0);
    const mat = new THREE.LineBasicMaterial({ color:G.col("#D6E8F6"), transparent:true, opacity:0, depthWrite:false, fog:false });
    const lines = new THREE.LineSegments(geo, mat);
    lines.frustumCulled = false; lines.visible = false; lines.renderOrder = 5; lines.userData.dynamic = true;
    G.world.add(lines);
    this.rain = { lines, pos, drops:new Float32Array(N * 3), seeded:false };
    // the puffs: spray off the tyres in the wet, and tyre smoke
    const pp = new Float32Array(PUFFS * 3), pc = new Float32Array(PUFFS * 3), pg = new THREE.BufferGeometry();
    pg.setAttribute("position", new THREE.BufferAttribute(pp, 3)); pg.setAttribute("color", new THREE.BufferAttribute(pc, 3));
    const pm = new THREE.PointsMaterial({ size:8, sizeAttenuation:false, map:this.dot(), vertexColors:true, transparent:true,
      opacity:0.42, depthWrite:false, alphaTest:0.01 });
    const pts = new THREE.Points(pg, pm); pts.frustumCulled = false; pts.userData.dynamic = true;
    G.world.add(pts);
    this.puffs = { pts, pos:pp, col:pc, cache:new Map() };
    // what the light and the surfaces are in the dry, to go back to
    this.sunBase = G.sun ? G.sun.intensity : 0;
    this.hemi = null;
    G.scene.traverse(o => { if(o.isHemisphereLight && o !== G.envFill && !this.hemi) this.hemi = o; });
    this.hemiBase = this.hemi ? this.hemi.intensity : 0;
    this.road0 = G.roadMat ? { c:G.roadMat.color.clone(), r:G.roadMat.roughness, m:G.roadMat.metalness } : null;
    this.ground = G.gplane ? G.gplane.material : null;
    this.ground0 = this.ground ? this.ground.color.clone() : null;
    this.ownWet = !!G.silver;
    this.wv = 0; this._t = null;
    G.wetVis = 0;
  },
  // a soft round dot, for the puffs
  dot(){
    if(this._dot) return this._dot;
    const cv = document.createElement("canvas"); cv.width = cv.height = 64;
    const c = cv.getContext("2d"), g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.55, "rgba(255,255,255,.55)"); g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    return (this._dot = new THREE.CanvasTexture(cv));
  },

  /* Once a frame. (tx, ty, tz) is what the camera is looking at, hw and hh the
     half-width and half-height of the view in metres, ppm its pixels per metre. */
  step(G, S, tx, ty, tz, hw, hh, ppm){
    if(!this.rain) return;
    const t = S.clock || 0, dt = this._t == null ? 0 : clamp(t - this._t, 0, 0.1); this._t = t;
    this.wv += ((S.wet || 0) - this.wv) * Math.min(1, dt * 0.8);
    const wv = this.wv; G.wetVis = wv;

    /* the light and the surfaces */
    if(!this.ownWet){
      if(G.sun) G.sun.intensity = this.sunBase * (1 - 0.42 * wv);
      if(this.hemi) this.hemi.intensity = this.hemiBase * (1 - 0.18 * wv);
      if(G.roadMat && this.road0){
        G.roadMat.color.copy(this.road0.c).multiplyScalar(1 - wv * 0.38);
        G.roadMat.roughness = Math.max(0.2, this.road0.r - wv * 0.55);
        G.roadMat.metalness = this.road0.m + wv * 0.12;
      }
      if(this.ground) this.ground.color.copy(this.ground0).multiplyScalar(1 - wv * 0.22);
    }

    /* the rain */
    const Rn = this.rain, on = wv > 0.03;
    Rn.lines.visible = on;
    if(on){
      const n = Math.round(clamp(500 + wv * 3500, 0, N));
      // a square round what the camera sees, big enough to fill the frame at any heading
      const R = Math.hypot(hw, hh * 1.75) + 20, top = tz + 45, bot = tz - 8, span = top - bot;
      const wx = Math.cos(WIND) * WINDV, wy = Math.sin(WIND) * WINDV;
      const d = Rn.drops, p = Rn.pos;
      if(!Rn.seeded){
        for(let k = 0; k < N; k++){ d[k * 3] = tx + (Math.random() * 2 - 1) * R; d[k * 3 + 1] = ty + (Math.random() * 2 - 1) * R; d[k * 3 + 2] = bot + Math.random() * span; }
        Rn.seeded = true;
      }
      const wrap = (v, c) => c + ((((v - c + R) % (2 * R)) + 2 * R) % (2 * R)) - R;
      for(let k = 0; k < n; k++){
        let x = d[k * 3] + wx * dt, y = d[k * 3 + 1] + wy * dt, h = d[k * 3 + 2] - FALL * dt;
        if(h < bot || h > top + 5){ h = top - Math.random() * 6; x = tx + (Math.random() * 2 - 1) * R; y = ty + (Math.random() * 2 - 1) * R; }
        x = wrap(x, tx); y = wrap(y, ty);
        d[k * 3] = x; d[k * 3 + 1] = y; d[k * 3 + 2] = h;
        // the head, and the tail up and upwind of it (three is y-up: game x, z, y)
        const o = k * 6;
        p[o] = x; p[o + 1] = h; p[o + 2] = y;
        p[o + 3] = x - wx * STREAK / FALL; p[o + 4] = h + STREAK; p[o + 5] = y - wy * STREAK / FALL;
      }
      Rn.lines.geometry.setDrawRange(0, n * 2);
      Rn.lines.geometry.attributes.position.needsUpdate = true;
      Rn.lines.material.opacity = 0.16 + 0.34 * wv;
    }

    /* the sparks and the puffs, out of the one particle list */
    const sp = G.sparks ? G.sparks.geometry.attributes.position : null, Pf = this.puffs;
    let k = 0, m = 0;
    for(const q of PART){
      if(q.kind === "smoke"){
        if(m >= PUFFS) continue;
        Pf.pos[m * 3] = q.x; Pf.pos[m * 3 + 1] = q.z; Pf.pos[m * 3 + 2] = q.y;
        let c = Pf.cache.get(q.col);
        if(!c){ const cc = new THREE.Color(q.col || "#DDE6EE").convertSRGBToLinear(); c = [cc.r, cc.g, cc.b]; Pf.cache.set(q.col, c); }
        // fade as it dies: towards nothing, by darkening into the additive-free blend
        const a = clamp(q.life / (q.max || 1), 0, 1);
        Pf.col[m * 3] = c[0] * (0.35 + 0.65 * a); Pf.col[m * 3 + 1] = c[1] * (0.35 + 0.65 * a); Pf.col[m * 3 + 2] = c[2] * (0.35 + 0.65 * a);
        m++;
      } else if(sp && k < 300){
        sp.array[k * 3] = q.x; sp.array[k * 3 + 1] = q.z; sp.array[k * 3 + 2] = q.y; k++;
      }
    }
    if(sp){ for(let q = k; q < 300; q++) sp.array[q * 3 + 1] = -9999; sp.needsUpdate = true; }
    for(let q = m; q < PUFFS; q++) Pf.pos[q * 3 + 1] = -9999;
    Pf.pts.geometry.attributes.position.needsUpdate = true; Pf.pts.geometry.attributes.color.needsUpdate = true;
    // a puff is about two metres across, whatever the zoom
    Pf.pts.material.size = clamp(2.2 * ppm, 3, 64);
  },
};

export { WEATHER };
