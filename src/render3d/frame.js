import * as THREE from 'three';
import { clamp, lerp } from '../config/util.js';
import { bankZ } from '../tracks/shared.js';
import { R } from '../render2d/view.js';
import { SPHERE } from '../render2d/sphere.js';
import { PP } from './pipeline.js';
import { G3 } from './g3.js';
import { WEATHER } from './weather.js';
import { CRASH } from './crash.js';
import { CINE } from './cine.js';
import { CFG } from '../config/settings.js';
import { CAR_SPEC } from '../car/spec.js';

/* ---- the cockpit camera ----------------------------------------------------
   The driver's eyes: on the car's centre line inside the helmet, a little behind
   the front of the cockpit opening, high enough over the rim that the cockpit
   sides sit low in the frame, looking down the nose with a slight tilt towards
   the road. The halo's top bar runs across the top of the view. */
const FP = {
  EYE:new THREE.Vector3(CAR_SPEC.X(1.28), CAR_SPEC.Z(0.82), 0),
  LOOK:new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.05, -Math.PI / 2, 0, "YXZ")),  // lens -z onto the nose (+x), 3 degrees down
  ROLL:0.5,          // share of the cornering lean the head takes: the neck holds it a little steadier than the chassis
  TAU:0.035,         // seconds: just enough smoothing to take the edge off, never a lag you can feel
  e:new THREE.Euler(0, 0, 0, "YXZ"), q:new THREE.Quaternion(), v:new THREE.Vector3(),
};

/* The cockpit lens, once a frame. Its position is bolted to the car (the eye
   point carried by the car model's own matrix, bounce and all), so the nose and
   the halo never swim against the view. Its heading, pitch and roll are the
   car's, eased over a few hundredths of a second so a kerb strike reads as a
   jolt rather than a judder; a jump bigger than any car can make in a frame (a
   recovery to the track, a restart) is taken at once. */
G3.cockpitCam = function(S, p, e){
  const cam = this.camFP, g = e.g;
  g.updateMatrixWorld();
  const pos = FP.v.copy(FP.EYE).applyMatrix4(g.matrixWorld);
  const r = e.fpRot;
  const want = FP.q.setFromEuler(FP.e.set(r[0], r[1], r[2], "YXZ")).multiply(FP.LOOK);
  const t = S.clock || 0, dt = clamp(t - (this.fpT == null ? t : this.fpT), 0, 0.1);
  this.fpT = t;
  const jump = !this.fpQ || cam.position.distanceToSquared(pos) > 400 || this.fpQ.angleTo(want) > 0.6 || this.fpUid !== S.uid;
  if(jump){ this.fpQ = (this.fpQ || new THREE.Quaternion()).copy(want); this.fpUid = S.uid; }
  else this.fpQ.slerp(want, 1 - Math.exp(-dt / FP.TAU));
  cam.position.copy(pos);
  cam.quaternion.copy(this.fpQ);
  /* A fixed lens, sized to the screen: about 80 degrees across a 16:9 view,
     never under 70 across on a narrow or upright one. Speed widens it by
     only 3 degrees, and slowly, which helps the sense of pace without the
     tunnel-vision zoom that makes people queasy. */
  const asp = cam.aspect || 1, D = Math.PI / 180;
  const base = clamp(Math.max(50, 2 * Math.atan(Math.tan(35 * D) / asp) / D), 50, 84);
  this.fpFov = lerp(this.fpFov || base, base + 3 * clamp((p.speed || 0) / 90, 0, 1), jump ? 1 : 1 - Math.exp(-dt / 1.2));
  if(Math.abs(cam.fov - this.fpFov) > 1e-3){ cam.fov = this.fpFov; cam.updateProjectionMatrix(); }
  cam.updateMatrixWorld();
  return cam;
};

/* ---- the frame --------------------------------------------------------- */
G3.frame = function(S){
  const T = S.track;
  if(this.built !== S.uid || this.cars.length !== S.cars.length) this.build(S);
  // the cockpit view, when chosen and while there is a car to sit in (cutscenes keep their own cameras)
  const pl = S.player;
  const fp = this.view === "cockpit" && !S.cine && !(R.tv && S.tv) && !!pl && !pl.dnf && !pl.recovering && !pl.recovered;

  for(const e of this.cars){
    const c = e.c, g = e.g;
    if(S.cine && S.cine.carFree && c === S.player) continue;           // the retirement cutscene poses this car itself (on the crane)
    if(c.recovered){ g.visible = false; continue; }                   // lifted away on the recovery truck
    if(c.recovering) continue;                                         // the recovery crane poses it (render3d/wreckrecovery.js)
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
    if(c === pl){
      // the driver's head: the road's camber and banking in full, the chassis lean in part
      e.fpRot = [-(c.roll || 0) * FP.ROLL - Math.atan(cross), -c.h, e.sp - (c.pitch || 0)];
      // in the cockpit the helmet is where the lens is, and the halo pillar goes thin
      const P = g.userData.parts;
      if(P && !!P.fp !== fp){ P.fp = fp; P.dentVer = NaN; P.dentT = -9; P.drv.visible = !fp; }
      this.fpCar = e;
    }
    // steering, wheels, flaps, lights, damage and the pit stop
    const A = g.userData.anim;
    const dtc = A.clock == null ? 0 : clamp((S.clock || 0) - A.clock, 0, 0.05); A.clock = S.clock || 0;
    this.carAnim(g, c, S, dtc);
    if(g.userData.lift) g.position.y += g.userData.lift;
    this.crewUpdate(e, c, S, g);
  }

  if(this.safetyCar) this.safetyCar(S);
  if(this.recoveryFrame) this.recoveryFrame(S);
  CRASH.fx(this, S); CRASH.step(this, S);
  // the podium is a stage of its own
  if(S.cine && S.cine.kind === "win"){ CINE.podiumFrame(this, S); return; }

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

  // the sparks, the spray and the rain are all done in WEATHER.step, once the camera is placed

  this.wet = lerp(this.wet, S.wet > 0.3 ? 0.55 : 0, 0.02);

  const p = S.player;
  this.fadeOccluders(S, p);
  if(S.cine){
    // a cutscene shot: the crash cam or the walk away from the wreck
    const cam = S.cine.kind === "crash" ? CINE.crashCam(this, S) : CINE.dnfCam(this, S);
    if(this.scene.fog){ this.scene.fog.near = 220; this.scene.fog.far = 220 + this.fogSpan * (1 - this.wet * 0.5); }
    this.cam = cam;
    WEATHER.step(this, S, p.x, p.y, p.z, 60, 45, 8);
  } else if(fp && this.fpCar && this.fpCar.fpRot){
    const cam = this.cockpitCam(S, p, this.fpCar);
    this.cam = cam;
    // the haze as the cutscene lenses have it, which is how the worlds were judged from the ground
    if(this.scene.fog){ this.scene.fog.near = 220; this.scene.fog.far = 220 + this.fogSpan * (1 - this.wet * 0.5); }
    const hx = Math.cos(p.h), hy = Math.sin(p.h);
    // rain and spray round what is ahead of you, not round the car
    WEATHER.step(this, S, p.x + hx * 22, p.y + hy * 22, p.z, 45, 30, 8);
    if(this.sun){
      /* The shadows that matter are the ones on the road ahead: centre the shadow
         box 45 m up the road, big enough to reach the car and well past the apex. */
      const ext = 96, sc = this.sun.shadow.camera;
      if(sc.right !== ext){ sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.updateProjectionMatrix(); }
      const tx = p.x + hx * 45, ty = p.y + hy * 45, tz = p.z;
      this.sun.target.position.set(tx, tz, ty); this.sun.target.updateMatrixWorld();
      const sa = T.sun == null ? 0.9 : T.sun;
      this.sun.position.set(tx + Math.cos(sa) * 300, tz + 420 * (T.def.sunH || 1), ty + Math.sin(sa) * 300);
    }
  } else if(R.tv && S.tv){
    const cam = this.camTV;
    cam.position.set(S.tv.x, S.tv.z, S.tv.y);
    cam.lookAt(p.x + p.vx * 0.12, p.z + 0.7, p.y + p.vy * 0.12);
    if(this.scene.fog){ this.scene.fog.near = 220; this.scene.fog.far = 220 + this.fogSpan * (1 - this.wet * 0.5); }
    this.cam = cam;
    WEATHER.step(this, S, p.x, p.y, p.z, 60, 45, 8);
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
    WEATHER.step(this, S, tx, ty, tz, hh * asp, hh, (this.rend.domElement.height || 600) / (2 * hh));
    if(this.sun){
      this.sun.target.position.set(tx, tz, ty); this.sun.target.updateMatrixWorld();
      const sa = T.sun == null ? 0.9 : T.sun;
      this.sun.position.set(tx + Math.cos(sa) * 300, tz + 420 * (T.def.sunH || 1), ty + Math.sin(sa) * 300);
    }
  }
  {
    const cu = this.cutU, cm = this.cam;
    cu.uCutOn.value = ((this.monaco || this.spa || this.ilg || this.singapore || this.baku || this.mex || this.monza) && cm === this.camIso && !p.dnf) ? 1 : 0;
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
  if(this.cota){ try{ this.cota.frame(S, this); }catch(e){ console.warn("cota frame", e.message); this.cota = null; } }
  if(this.spa){ try{ this.spa.frame(S, this); }catch(e){ console.warn("spa frame", e.message); this.spa = null; } }
  if(this.monza){ try{ this.monza.frame(S, this); }catch(e){ console.warn("monza frame", e.message); this.monza = null; } }
  if(this.baku){ try{ this.baku.frame(S, this); }catch(e){ console.warn("baku frame", e.message); this.baku = null; } }
  if(this.singapore){ try{ this.singapore.frame(S, this); }catch(e){ console.warn("singapore frame", e.message); this.singapore = null; } }
  if(this.ilg){ try{ this.ilg.frame(S, this); }catch(e){ console.warn("interlagos frame", e.message); this.ilg = null; } }
  if(this.mex){ try{ this.mex.frame(S, this); }catch(e){ console.warn("mexico frame", e.message); this.mex = null; } }
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

