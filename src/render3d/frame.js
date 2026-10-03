import * as THREE from 'three';
import { clamp, lerp } from '../config/util.js';
import { bankZ } from '../tracks/shared.js';
import { R } from '../render2d/view.js';
import { SPHERE } from '../render2d/sphere.js';
import { PART } from '../render2d/particles.js';
import { PP } from './pipeline.js';
import { G3 } from './g3.js';
import { CFG } from '../config/settings.js';

/* ---- the frame --------------------------------------------------------- */
G3.frame = function(S){
  const T = S.track;
  if(this.built !== S.uid || this.cars.length !== S.cars.length) this.build(S);

  for(const e of this.cars){
    const c = e.c, g = e.g;
    /* The car model's nose is local +x, so pitch is a rotation about local z and
       roll about local x. Its wheels are 3.13 m apart, so the body sits on the
       straight line between the road under the rear axle and the road under the
       front one: pitch is that slope, height is the midpoint, and neither can
       leave a wheel in the tarmac or in the air. The suspension only ever lifts
       the body, light over a crest, and never sinks it. */
    const ni = c.node || 0, nn = T.n, HB = 1.57;
    const al = Math.cos(c.h - T.ang[ni]);
    const hx = Math.cos(c.h), hy = Math.sin(c.h);
    const zr = T.surfZ(c.x - hx * HB, c.y - hy * HB, ni), zf = T.surfZ(c.x + hx * HB, c.y + hy * HB, ni);
    const gzA = T.grade((ni + 1) % nn), gzB = T.grade((ni - 1 + nn) % nn);
    const vcurv = (gzA - gzB) / (2 * T.ds);                  // + at the foot of a climb, - over a crest
    const sp = c.speed || 0;
    e.sp = lerp(e.sp == null ? Math.atan2(zf - zr, 2 * HB) : e.sp, Math.atan2(zf - zr, 2 * HB), 0.55);
    e.sq = lerp(e.sq || 0, clamp(sp * sp * vcurv * 0.010, -0.09, 0.07), 0.25);
    // the road's own cross-slope under the car: camber, and the banking at this offset
    const bsl = T.bankZf ? (bankZ(T, ni, (c.off || 0) + 0.6) - bankZ(T, ni, (c.off || 0) - 0.6)) / 1.2 : 0;
    const cross = (T.camber[ni] + bsl) * al;
    g.position.set(c.x, (zr + zf) / 2 + (c.air || 0) + 0.03 + Math.max(0, -e.sq) * 0.6, c.y);
    g.rotation.set(-(c.roll || 0) - Math.atan(cross), -c.h, e.sp - (c.pitch || 0), "YXZ");
    // steering, wheels, flaps, lights, damage and the pit stop
    const A = g.userData.anim;
    const dtc = A.clock == null ? 0 : clamp((S.clock || 0) - A.clock, 0, 0.05); A.clock = S.clock || 0;
    this.carAnim(g, c, S, dtc);
    if(g.userData.lift) g.position.y += g.userData.lift;
    this.crewUpdate(e, c, S, g);
  }

  for(const d of this.dyn){
    if(d.kind === "screen"){
      // a band of light sliding across, plus a scrolling word: enough motion at
      // this distance to read as a working screen
      const c = d.ctx, W2 = 256, H2 = 128;
      d.t += 0.016;
      c.fillStyle = "#07070C"; c.fillRect(0, 0, W2, H2);
      for(let k = 0; k < 4; k++){
        const x = ((d.t * (28 + k * 13) + k * 90) % (W2 + 120)) - 60;
        const gd = c.createLinearGradient(x - 50, 0, x + 50, 0);
        gd.addColorStop(0, "rgba(0,0,0,0)"); gd.addColorStop(0.5, d.col); gd.addColorStop(1, "rgba(0,0,0,0)");
        c.fillStyle = gd; c.fillRect(x - 50, k * 32, 100, 30);
      }
      c.fillStyle = "#FFFFFF"; c.font = "800 italic 34px 'Saira Condensed',sans-serif";
      c.textAlign = "left"; c.textBaseline = "middle";
      c.fillText("LAS VEGAS GRAND PRIX", W2 - ((d.t * 42) % (W2 + 380)), H2 / 2);
      d.tx.needsUpdate = true;
      continue;
    }
    if(d.kind === "fountain"){
      // the jets breathe, and every so often the whole row goes up at once
      const o = d.obj, tt = S.clock;
      const burst = Math.max(0, Math.sin(tt * 0.22)) ** 6;
      for(let i = 0; i < d.jets.length; i++){
        const j = d.jets[i];
        const base = 0.35 + 0.65 * Math.abs(Math.sin(tt * 0.9 + i * 0.42));
        const hgt = 4 + (base * 26 + burst * 64) * (0.6 + 0.4 * Math.sin(i * 1.3));
        o.position.set(j[0], d.z, j[1]);
        o.scale.set(1 + burst * 0.5, hgt, 1 + burst * 0.5);
        o.rotation.set(0, 0, 0); o.updateMatrix();
        d.im.setMatrixAt(i, o.matrix);
      }
      d.im.instanceMatrix.needsUpdate = true;
      continue;
    }
    if(d.kind === "flicker"){
      const f = 0.7 + 0.3 * Math.sin(S.clock * 7.3) + 0.2 * Math.sin(S.clock * 17.1);
      d.obj.scale.set(0.8 + f * 0.4, 0.7 + f * 0.6, 0.8 + f * 0.4);
      d.light.intensity = d.base * (0.6 + f * 0.6);
      continue;
    }
    if(d.kind === "amber"){
      const on = (S.clock * 1.2) % 1 < 0.5;
      for(const h of d.heads) h.material.emissiveIntensity = on ? 1.6 : 0.10;
      continue;
    }
    if(d.kind === "beacon"){
      const on = (S.clock * d.rate) % 1 < 0.42;
      d.obj.material.emissiveIntensity = on ? 5.0 : 0.25;
      continue;
    }
    if(d.kind === "sphere"){
      // the picture at 30 Hz is plenty for an LED screen, and it halves the repaint and the upload
      if((d.tick & 1) === 0){ SPHERE.paint(d.ctx, S); d.tx.needsUpdate = true; }
      // What it throws on the asphalt is whatever it happens to be showing, so
      // look at the picture: the same painting at 32 x 32 on a small software
      // canvas, averaged, once every six frames. (Reading the big canvas back
      // stalled the whole pipeline for 60-200 ms each time it happened.)
      if((d.tick++ % 6) === 0){
        try{
          if(!d.small){ d.small = document.createElement("canvas"); d.small.width = d.small.height = 32;
                        d.sg = d.small.getContext("2d", { willReadFrequently:true }); }
          const sg = d.sg;
          sg.setTransform(32 / SPHERE.W, 0, 0, 32 / SPHERE.H, 0, 0);
          SPHERE.paint(sg, S);
          sg.setTransform(1, 0, 0, 1, 0, 0);
          const px = sg.getImageData(0, 0, 32, 32).data;
          let r = 0, gg = 0, b = 0;
          for(let i = 0; i < px.length; i += 4){ r += px[i]; gg += px[i + 1]; b += px[i + 2]; }
          const k = px.length / 4;
          r /= k; gg /= k; b /= k;
          const mx = Math.max(r, gg, b, 1);
          // pushed to full saturation: a wash of dim grey would not read at all
          d.light.color.setRGB(r / mx, gg / mx, b / mx);
          d.avg = (r + gg + b) / (3 * 255);
        }catch(e){ d.light.color.set(SPHERE.glowOf(S)); }
      }
      // it burns brighter through the start show
      const ip = SPHERE.introPhase(S);
      const base = 1.6 + 3.2 * (d.avg == null ? 0.4 : d.avg);
      d.light.intensity = ip == null ? base : (ip >= 5.1 && ip < 5.5 ? 9 : base * 1.4);
      // the material may have been cloned since, for the fade, so read it back
      d.mesh.material.emissiveIntensity = ip == null ? 1.05 : (ip >= 5.1 && ip < 5.5 ? 1.9 : 1.30);
    }
  }

  const pa = this.sparks.geometry.attributes.position;
  let k = 0;
  for(const q of PART){
    if(k >= 300) break;
    pa.array[k * 3] = q.x; pa.array[k * 3 + 1] = q.z; pa.array[k * 3 + 2] = q.y; k++;
  }
  for(let q = k; q < 300; q++) pa.array[q * 3 + 1] = -9999;
  pa.needsUpdate = true;

  this.wet = lerp(this.wet, S.wet > 0.3 ? 0.55 : 0, 0.02);

  const p = S.player;
  this.fadeOccluders(S, p);
  if(R.tv && S.tv){
    const cam = this.camTV;
    cam.position.set(S.tv.x, S.tv.z, S.tv.y);
    cam.lookAt(p.x + p.vx * 0.12, p.z + 0.7, p.y + p.vy * 0.12);
    if(this.scene.fog){ this.scene.fog.near = 220; this.scene.fog.far = 220 + this.fogSpan * (1 - this.wet * 0.5); }
    this.cam = cam;
  } else {
    const cam = this.camIso;
    const hh = Math.max(14, (this.cv.clientHeight || 600) / Math.max(R.zoom, 0.5) * 0.5);
    const asp = (this.cv.clientWidth || 800) / (this.cv.clientHeight || 600);
    cam.left = -hh * asp; cam.right = hh * asp; cam.top = hh; cam.bottom = -hh;
    cam.updateProjectionMatrix();
    /* The shadow map only needs to cover what the camera can see (plus what
       falls into it from just outside). A fixed 300 m box drew every building
       and boat in the neighbourhood a second time for nothing, so size it to
       the ground the view actually covers, in steps so the shadows do not
       shimmer as the zoom eases. */
    if(this.sun){
      const gx = Math.hypot(hh * asp, hh * 1.75);
      const ext = clamp(Math.ceil((gx * 1.12 + 26) / 12) * 12, 72, 150);
      const sc = this.sun.shadow.camera;
      if(sc.right !== ext){ sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.updateProjectionMatrix(); }
    }
    const tx = p.x + p.vx * 0.35, ty = p.y + p.vy * 0.35, tz = p.z;
    const d = 700, el = 35.264 * Math.PI / 180, az = Math.PI * 0.25;
    cam.position.set(tx + Math.cos(az) * d * Math.cos(el), tz + d * Math.sin(el), ty + Math.sin(az) * d * Math.cos(el));
    cam.lookAt(tx, tz, ty);
    // the orthographic camera stands well back, so the haze starts from there
    // (a world may start it a little nearer, for a touch of depth across the frame)
    if(this.scene.fog){ const fn = this.fogNear == null ? 120 : this.fogNear;
      this.scene.fog.near = d + fn; this.scene.fog.far = d + fn + this.fogSpan * (this.fogSpanK || 1) * (1 - this.wet * 0.5); }
    this.cam = cam;
    if(this.sun){
      this.sun.target.position.set(tx, tz, ty); this.sun.target.updateMatrixWorld();
      const sa = T.sun == null ? 0.9 : T.sun;
      this.sun.position.set(tx + Math.cos(sa) * 300, tz + 420 * (T.def.sunH || 1), ty + Math.sin(sa) * 300);
    }
  }
  {
    const cu = this.cutU, cm = this.cam;
    cu.uCutOn.value = (this.monaco && cm === this.camIso && !p.dnf) ? 1 : 0;
    if(cu.uCutOn.value){
      cm.updateMatrixWorld();
      cu.uCutV.value.copy(cm.matrixWorld);
      cu.uCutD.value.set(0, 0, 1).transformDirection(cm.matrixWorld);
      cu.uCutP.value.set(p.x, p.z + 0.6, p.y);
      cu.uCutR.value = clamp((cm.top - cm.bottom) * 0.16, 8, 16);
    }
  }
  if(this.monaco){ try{ this.monaco.frame(S, this); }catch(e){ console.warn("monaco frame", e.message); this.monaco = null; } }
  if(this.silver){ try{ this.silver.frame(S, this); }catch(e){ console.warn("silverstone frame", e.message); this.silver = null; } }
  if(this.suzuka){ try{ this.suzuka.frame(S, this); }catch(e){ console.warn("suzuka frame", e.message); this.suzuka = null; } }
  /* Bloom is what the composer is for, and a daytime circuit has next to none.
     Without it the frame goes straight to the screen: the renderer's own ACES
     and sRGB steps (the same curve, which divides by 0.6 inside, hence the
     0.6 here), and 4x multisampling in place of FXAA, which is sharper. */
  const gr = this.grade || { exposure:1, strength:0.4, radius:0.6, threshold:1.0, knee:0.4 };
  if(PP.ready && CFG.fx !== 0 && (gr.strength >= 0.3 || CFG.fx === 2)){
    PP.render(this.scene, this.cam, gr);
  } else {
    this.rend.toneMapping = THREE.ACESFilmicToneMapping;
    this.rend.toneMappingExposure = (gr.exposure || 1) * 0.6;
    this.rend.outputEncoding = THREE.sRGBEncoding;
    this.rend.setRenderTarget(null);
    this.rend.render(this.scene, this.cam);
  }
};

