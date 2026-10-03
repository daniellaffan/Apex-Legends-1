import * as THREE from 'three';
import { TAU, clamp } from '../../config/util.js';
import { CFG } from '../../config/settings.js';
import { TEAMS } from '../../config/teams.js';
import { PTEX } from '../surfaces.js';
import { ADS } from '../hoardings.js';
import { SUZUKA, flat, lin, merge, paint } from './suzuka.js';
import { planSpa, auditSpa } from './spa-plan.js';
import { KIT, plantGeos } from './spa-kit.js';

/* ---------- Spa-Francorchamps: the Ardennes -------------------------------
   The real valley round the circuit: its ground and its forest, carried onto
   the game's lap from terrain and map data (spa-plan.js, survey/spa.js). On it:
   spruce, pine, beech, oak and birch with ferns and bracken under them; meadows
   with flowers, hay bales, cows and sheep; the stream down the Eau Rouge valley
   and under the track; villages and farms with steep slate roofs and smoking
   chimneys; campsites; the pits, paddock and covered main stand; stands and
   crowded banks round the lap; marshal posts, camera towers, tyre walls, catch
   fencing and silly adverts; hot-air balloons, a cyclist and valley mist.

   Everything that repeats is instanced or merged, in spatial chunks with their
   own bounds, so the overhead camera and the shadow pass only draw what they
   can see. Nothing here touches the cameras. */

const CHUNK = 200;
const sst = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const WIND = 0.9;                                  // one wind for the trees, the flags and the smoke

const SPA = {
  U:{ time:{ value:0 }, cloud:{ value:null }, cloudOff:{ value:new THREE.Vector2() }, cloudAmt:{ value:1 } },
  CHUNK,

  /* soft cloud shadows drifting over the valley: one tiling noise, read in world space */
  cloudTex(){
    if(this._cloud) return this._cloud;
    const N = 128, d = new Uint8Array(N * N * 4);
    const h = (x, y) => { let v = Math.imul(x * 374761393 + y * 668265263, 1274126177); v ^= v >>> 13; return ((v >>> 0) % 1000) / 1000; };
    const vn = (x, y, p) => { const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
      const g = (a, b) => h(((a % p) + p) % p, ((b % p) + p) % p);
      return g(ix, iy) * (1 - u) * (1 - v) + g(ix + 1, iy) * u * (1 - v) + g(ix, iy + 1) * (1 - u) * v + g(ix + 1, iy + 1) * u * v; };
    for(let y = 0; y < N; y++) for(let x = 0; x < N; x++){
      const v = vn(x / 16, y / 16, 8) * 0.6 + vn(x / 8, y / 8, 16) * 0.3 + vn(x / 4, y / 4, 32) * 0.1;
      const k = (y * N + x) * 4; d[k] = d[k + 1] = d[k + 2] = Math.round(v * 255); d[k + 3] = 255; }
    const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
    return (this._cloud = t);
  },
  // the cloud-shadow lines for any shader: a world-space varying and a darkening where the cloud is
  cloudVS:`vec4 cwP = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  cwP = instanceMatrix * cwP;
#endif
  vCW = (modelMatrix * cwP).xz;`,
  cloudFS:`float cwN = texture2D(uCloud, (vCW + uCloudOff) / 1400.0).r;
  diffuseColor.rgb *= 1.0 - 0.26 * uCloudAmt * smoothstep(0.42, 0.6, cwN);`,
  hookCloud(sh){
    const U = this.U; sh.uniforms.uCloud = U.cloud; sh.uniforms.uCloudOff = U.cloudOff; sh.uniforms.uCloudAmt = U.cloudAmt;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec2 vCW;").replace("#include <project_vertex>", "#include <project_vertex>\n  " + this.cloudVS);
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec2 vCW;\nuniform sampler2D uCloud; uniform vec2 uCloudOff; uniform float uCloudAmt;")
      .replace("#include <color_fragment>", "#include <color_fragment>\n  " + this.cloudFS);
  },

  /* One vertex-colour material for things that sway: amp is how far, above y0 (in the
     model's own units), at a speed; the instance's tint where the paint mask says. Trees
     barely move, flags and waving fans a lot. */
  swayMat(key, amp, y0, speed, opts){
    const m = new THREE.MeshStandardMaterial(Object.assign({ color:0xFFFFFF, vertexColors:true, flatShading:true, roughness:0.9, metalness:0 }, opts || {}));
    const U = this.U, self = this, wx = Math.cos(WIND).toFixed(3), wz = Math.sin(WIND).toFixed(3);
    m.onBeforeCompile = sh => {
      sh.uniforms.uTime = U.time;
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float tintMask;\nuniform float uTime;")
        .replace("#include <color_vertex>", `vColor = vec3(1.0);
#ifdef USE_COLOR
  vColor *= color;
#endif
#ifdef USE_INSTANCING_COLOR
  vColor *= mix(vec3(1.0), instanceColor.xyz, tintMask);
#endif`)
        .replace("#include <begin_vertex>", `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec3 sIp = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  float sPh = sIp.x * 0.37 + sIp.z * 0.53;
  float sSw = (sin(uTime * ${speed.toFixed(2)} + sPh) * 0.7 + sin(uTime * ${(speed * 2.3).toFixed(2)} + sPh * 1.7) * 0.3) * ${amp.toFixed(4)} * max(position.y - ${y0.toFixed(2)}, 0.0);
  ${key === "flag" ? "transformed.z += sin(uTime * 6.0 + sPh + position.x * 7.0) * 0.16 * position.x; transformed.y += sin(uTime * 4.0 + sPh + position.x * 5.0) * 0.04 * position.x;"
    : `transformed.x += sSw * ${wx}; transformed.z += sSw * ${wz};`}
#endif`);
      self.hookCloud(sh);
    };
    m.customProgramCacheKey = () => "spaSway|" + key;
    return m;
  },
  plant(G, g, geo, mat, list, cast){ return SUZUKA.plant.call(this, G, g, geo, mat, list, cast); },

  /* ---- the ground: the real lie of the land, coloured by what grows on it ---- */
  groundColours(P){
    const Gd = P.grid, { NX, NY, H, DB, COV, X0, Y0, STEP } = Gd, C = P.C, COL = Gd.COL;
    const hx = c => [parseInt(c.slice(1, 3), 16) / 255, parseInt(c.slice(3, 5), 16) / 255, parseInt(c.slice(5, 7), 16) / 255];
    const K = { meadow:hx("#5E8A3E"), meadow2:hx("#76983F"), lush:hx("#4A7834"), verge:hx("#5E8A40"), floor:hx("#2E4026"), needle:hx("#4A4232"),
      scrub:hx("#5A6A36"), village:hx("#6A8C4C"), yard:hx("#7E7058"), park:hx("#7E8084"), camp:hx("#86A456"), earth:hx("#6E5E44"), rock:hx("#7E7C74") };
    const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const nz = (x, y, s) => { const v = Math.sin(x * 0.0123 * s + 1.3) * Math.cos(y * 0.0171 * s + 0.7) + Math.sin((x + y) * 0.0067 * s); return 0.5 + 0.25 * v; };
    for(let r = 0; r < NY; r++) for(let c = 0; c < NX; c++){
      const k = r * NX + c, x = X0 + c * STEP, y = Y0 + r * STEP, cv = COV[k], db = DB[k];
      let col;
      if(cv === C.forest) col = mixc(K.floor, K.needle, nz(x, y, 3));
      else if(cv === C.scrub) col = K.scrub;
      else if(cv === C.village) col = mixc(K.village, K.meadow, nz(x, y, 2));
      else if(cv === C.yard) col = K.yard;
      else if(cv === C.parking) col = mixc(K.park, K.meadow, 0.25);
      else if(cv === C.camp) col = K.camp;
      else col = mixc(mixc(K.meadow, K.meadow2, nz(x, y, 1)), K.lush, nz(y, x, 2.3) * 0.6);
      // the verges are mown, whatever the land beyond is
      col = mixc(K.verge, col, sst(4, 18, db));
      // steep banks and cuttings show earth and stone
      const sl = c > 0 && c < NX - 1 && r > 0 && r < NY - 1 ? Math.hypot(H[k + 1] - H[k - 1], H[k + NX] - H[k - NX]) / (2 * STEP) : 0;
      col = mixc(col, sl > 0.75 ? K.rock : K.earth, sst(0.42, 0.95, sl) * (db > 3 ? 0.7 : 0));
      COL[k * 3] = col[0]; COL[k * 3 + 1] = col[1]; COL[k * 3 + 2] = col[2];
    }
  },
  terrain(G, g, P){
    const Gd = P.grid, { X0, Y0, STEP, NX, NY, H, COL } = Gd, TILE = 40;
    const mat = new THREE.MeshStandardMaterial({ vertexColors:true, roughness:0.97, metalness:0 });
    const det = (() => { const N = 128, d = new Uint8Array(N * N * 4); let a = 99;
      const r = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
      for(let k = 0; k < N * N; k++){ const v = 128 + (r() - 0.5) * 80 + (r() < 0.05 ? -36 : 0); d[k * 4] = d[k * 4 + 1] = d[k * 4 + 2] = v; d[k * 4 + 3] = 255; }
      const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true; return t; })();
    const self = this;
    mat.onBeforeCompile = sh => {
      sh.uniforms.uDet = { value:det };
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec2 vGW;")
        .replace("#include <project_vertex>", "#include <project_vertex>\n  vGW = (modelMatrix * vec4(transformed, 1.0)).xz;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec2 vGW;\nuniform sampler2D uDet;")
        .replace("#include <color_fragment>", `#include <color_fragment>
  float gD = texture2D(uDet, vGW / 5.0).r * 0.55 + texture2D(uDet, vGW / 31.0).r * 0.45;
  diffuseColor.rgb *= 0.84 + gD * 0.32;`);
      self.hookCloud(sh);
    };
    mat.customProgramCacheKey = () => "spaGround";
    this.groundMat = mat;
    const c = new THREE.Color();
    let tiles = 0;
    for(let r0 = 0; r0 < NY - 1; r0 += TILE) for(let c0 = 0; c0 < NX - 1; c0 += TILE){
      const r1 = Math.min(NY - 1, r0 + TILE), c1 = Math.min(NX - 1, c0 + TILE), w = c1 - c0 + 1, h = r1 - r0 + 1;
      const pos = new Float32Array(w * h * 3), col = new Float32Array(w * h * 3), idx = [];
      for(let r = r0; r <= r1; r++) for(let cc = c0; cc <= c1; cc++){
        const k = r * NX + cc, v = (r - r0) * w + (cc - c0);
        pos[v * 3] = X0 + cc * STEP; pos[v * 3 + 1] = H[k]; pos[v * 3 + 2] = Y0 + r * STEP;
        c.setRGB(COL[k * 3], COL[k * 3 + 1], COL[k * 3 + 2]).convertSRGBToLinear();
        col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b;
      }
      for(let r = 0; r < h - 1; r++) for(let cc = 0; cc < w - 1; cc++){ const a = r * w + cc, b = a + 1, d = a + w, e = d + 1; idx.push(a, d, b, b, d, e); }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      geo.setIndex(idx); geo.computeVertexNormals(); geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; m.castShadow = false; m.userData.dynamic = true;
      g.add(m); tiles++;
    }
    return tiles;
  },
  /* the hills beyond the grid, and ridgelines on the horizon in layers of blue-green haze:
     two cheap meshes, for the shots that look out (the crash and podium cameras) */
  horizon(G, g, P, T){
    const bb = T.bounds, cx = bb.minX + bb.w / 2, cy = bb.minY + bb.h / 2, Gd = P.grid;
    const inner = (x, y) => x > Gd.X0 + 30 && x < Gd.X0 + (Gd.NX - 1) * Gd.STEP - 30 && y > Gd.Y0 + 30 && y < Gd.Y0 + (Gd.NY - 1) * Gd.STEP - 30;
    // the far ground: a polar mesh out to 6 km, sunk a little where the real grid lies over it
    { const NR = 30, NA = 72, pos = [], col = [], idx = [], c = new THREE.Color();
      for(let r = 0; r <= NR; r++){ const rad = 300 + Math.pow(r / NR, 1.6) * 5700;
        for(let a = 0; a < NA; a++){ const th = a / NA * TAU, x = cx + Math.cos(th) * rad, y = cy + Math.sin(th) * rad;
          let z = P.farHeight(x, y); if(inner(x, y)) z -= 6;
          pos.push(x, z, y); const t = sst(800, 5000, rad); c.setRGB(0.20 + t * 0.30, 0.30 + t * 0.30, 0.20 + t * 0.34).convertSRGBToLinear(); col.push(c.r, c.g, c.b); } }
      for(let r = 0; r < NR; r++) for(let a = 0; a < NA; a++){ const A = r * NA + a, B = r * NA + (a + 1) % NA, Cc = A + NA, D = B + NA; idx.push(A, Cc, B, B, Cc, D); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); geo.setIndex(idx); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors:true, roughness:1, metalness:0 })); m.receiveShadow = false; m.userData.dynamic = true; g.add(m); }
    // three rings of ridges, each further, higher and hazier than the last
    { const pos = [], col = [], c = new THREE.Color();
      [[7000, 90, "#3E5A48"], [9500, 150, "#5E7A72"], [12500, 230, "#8A9EA2"]].forEach(([rad, hgt, cc], ri) => {
        c.set(cc).convertSRGBToLinear(); const NA = 120;
        for(let a = 0; a < NA; a++){ const t0 = a / NA * TAU, t1 = (a + 1) / NA * TAU, ph = ri * 1.7;
          const h0 = hgt * (0.55 + 0.45 * Math.sin(t0 * 5 + ph) * Math.sin(t0 * 3.1 + ph * 2)), h1 = hgt * (0.55 + 0.45 * Math.sin(t1 * 5 + ph) * Math.sin(t1 * 3.1 + ph * 2));
          const x0 = cx + Math.cos(t0) * rad, y0 = cy + Math.sin(t0) * rad, x1 = cx + Math.cos(t1) * rad, y1 = cy + Math.sin(t1) * rad, base = 40;
          for(const p of [[x0, base, y0], [x1, base, y1], [x1, base + h1 + 60, y1], [x0, base, y0], [x1, base + h1 + 60, y1], [x0, base + h0 + 60, y0]]){ pos.push(...p); col.push(c.r, c.g, c.b); } } });
      const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors:true, side:THREE.DoubleSide, fog:true })); m.frustumCulled = false; m.userData.dynamic = true; g.add(m); }
  },

  /* mown stripes down the verges, over the grass run-off and the strip past it */
  verges(G, g, T){
    const cv = document.createElement("canvas"); cv.width = 8; cv.height = 64;
    const c = cv.getContext("2d"), gr = c.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, "#557F3A"); gr.addColorStop(0.46, "#557F3A"); gr.addColorStop(0.54, "#679048"); gr.addColorStop(0.96, "#679048"); gr.addColorStop(1, "#557F3A");
    c.fillStyle = gr; c.fillRect(0, 0, 8, 64);
    const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
    const mat = new THREE.MeshStandardMaterial({ map:t, roughness:0.95, metalness:0 });
    this.vergeMat = mat;
    const w = T.half, lift = 0.04;
    for(const sd of [-1, 1]){
      const code = i => (sd < 0 ? T.rsL[i] : T.rsR[i]), rf = i => (sd < 0 ? T.roL[i] : T.roR[i]);
      const band = (a, b, f) => { const geo = sd < 0 ? G.strip(T, i => -b(i), i => -a(i), lift, 22, f) : G.strip(T, a, b, lift, 22, f); if(geo){ const m = G.add(g, geo, mat); G.tileSplit(m, 250, 50); } };
      band(() => w + 1.8, i => w + rf(i), i => code(i) === 3 && !(sd === T.pitSide && T.pitRamp(i) > 0.02));
      band(i => w + rf(i), i => w + rf(i) + 6, null);
    }
  },

  /* ---- water: the streams in their channels ---- */
  water(G, g, P){
    const mat = new THREE.MeshStandardMaterial({ color:lin("#5E6E62"), roughness:0.12, metalness:0.0, envMapIntensity:0.9 });
    const pos = [];
    for(const s of P.streams){ const S = s.pts, Z = s.z;
      for(let k = 0; k < S.length - 1; k++){ const [ax, ay] = S[k], [bx, by] = S[k + 1], az = Z[k], bz = Z[k + 1], L = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / L * s.w / 2, ny = (bx - ax) / L * s.w / 2;
        pos.push(ax - nx, az, ay - ny, bx + nx, bz, by + ny, bx - nx, bz, by - ny,  ax - nx, az, ay - ny, ax + nx, az, ay + ny, bx + nx, bz, by + ny); } }
    if(!pos.length) return;
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals(); geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; m.userData.dynamic = true; g.add(m);
    G.tileSplit(m, 250, 50);
  },
  /* ---- the lanes and roads: grey ribbons with a pale centre line on the bigger ones ---- */
  roads(G, g, P){
    const mats = { road:new THREE.MeshStandardMaterial({ color:lin("#5C5F64"), roughness:0.9, polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2 }),
                   track:new THREE.MeshStandardMaterial({ color:lin("#8E8064"), roughness:0.97, polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2 }) };
    for(const kind of ["road", "track"]){
      const pos = [];
      for(const r of P.roads){ if(r.kind !== kind) continue; const S = r.pts;
        for(let k = 0; k < S.length - 1; k++){ const [ax, ay, az] = S[k], [bx, by, bz] = S[k + 1], L = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / L * r.w / 2, ny = (bx - ax) / L * r.w / 2;
          pos.push(ax - nx, az, ay - ny, bx + nx, bz, by + ny, bx - nx, bz, by - ny,  ax - nx, az, ay - ny, ax + nx, az, ay + ny, bx + nx, bz, by + ny); } }
      if(!pos.length) continue;
      const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals(); geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, mats[kind]); m.receiveShadow = true; m.userData.dynamic = true; g.add(m); G.tileSplit(m, 250, 50);
    }
  },

  /* ---- everything built: a building's parts in its own frame, dropped into a spatial
     bucket; each bucket becomes one merged mesh ---- */
  bucketAdd(parts, x, y, z, ang){
    const M = new THREE.Matrix4().makeRotationY(-ang).setPosition(x, z, y);
    const key = Math.floor(x / CHUNK) + "," + Math.floor(y / CHUNK);
    let b = this.buckets.get(key); if(!b){ b = []; this.buckets.set(key, b); }
    for(const p of parts){ const q = p.clone(); q.applyMatrix4(M); b.push(q); }
  },
  bucketBake(G, g){
    const mat = new THREE.MeshStandardMaterial({ vertexColors:true, roughness:0.86, metalness:0.02 });
    this.buildMat = mat; G.cutMat(mat);
    let made = 0;
    for(const parts of this.buckets.values()){
      if(!parts.length) continue;
      const geo = merge(parts); for(const p of parts) p.dispose();
      const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; m.userData.dynamic = true; g.add(m); made++;
    }
    this.buckets.clear();
    return made;
  },
  // local -> world (game) for a point in a structure's frame
  toWorld(s, lx, ly, lz){ const c = Math.cos(s.ang), sn = Math.sin(s.ang); return [s.x + lx * c - lz * sn, s.y + lx * sn + lz * c, s.z + ly]; },

  structures(G, g, T, P){
    const F = this.fans, W = this.wavers, flags = this.flagList;
    const shirt = ["#E8C02A", "#D8352A", "#1E1E22", "#F08A1E", "#2F78B8", "#F2F2EE", "#3E8A4A", "#C8302A", "#E8E4DA", "#7A4AA8"];
    const crowd = (s, seats, density) => {
      for(const [lx, ly, lz] of seats){ if(Math.random() > density) continue;
        const [x, y, z] = this.toWorld(s, lx + (Math.random() - 0.5) * 0.2, ly, lz);
        const it = { x, y, z, h:0.92 + Math.random() * 0.14, w:1, ry:-s.ang + Math.PI + (Math.random() - 0.5) * 0.6, tint:shirt[Math.floor(Math.random() * shirt.length)] };
        (Math.random() < 0.16 ? W : F).push(it); } };
    for(const s of P.S){
      let r = null;
      switch(s.kind){
        case "house": case "farm": case "barn": break;
        case "pits": r = KIT.pits(s, TEAMS); break;
        case "paddock": r = KIT.paddock(s, TEAMS); break;
        case "stand": r = KIT.stand(s); crowd(s, r.seats, s.main ? 0.86 : 0.72);
          // flags along the back of the stand
          for(let x = -s.wid / 2 + 4; x < s.wid / 2; x += 9){ const [fx, fy, fz] = this.toWorld(s, x, r.top + 2.2, -s.rows * 0.85 - 0.4);
            flags.push({ x:fx, y:fy, z:fz, ry:-s.ang, h:2.2, w:1, tint:["#1E1E22", "#E8C02A", "#D8352A", "#2F78B8", "#F2F2EE"][Math.floor(Math.random() * 5)] }); }
          break;
        case "bank": r = KIT.bank(s); crowd(s, r.seats, 0.55);
          for(let x = -s.wid / 2 + 6; x < s.wid / 2; x += 14){ const [fx, fy, fz] = this.toWorld(s, x, r.top * 0.6 + 2.6, -s.dep * 0.6);
            flags.push({ x:fx, y:fy, z:fz, ry:-s.ang, h:1.8, w:1, tint:["#E8C02A", "#D8352A", "#F08A1E", "#2F78B8", "#3E8A4A"][Math.floor(Math.random() * 5)] }); }
          break;
        case "chalets": r = KIT.chalets(s); break;
        case "hotel": r = KIT.hotel(s); break;
        case "oldhotel": r = KIT.oldhotel(s); break;
        case "oldpits": r = KIT.oldpits(s); break;
        case "marshal": r = KIT.marshal(s); break;
        case "tvtower": r = KIT.tvtower(s); break;
        case "paddocksign": this.paddockSign(G, g, s); break;
        case "startgantry": this.startGantry(G, g, T, s); break;
      }
      if(!r) continue;
      this.bucketAdd(r.parts, s.x, s.y, s.z, s.ang);
      if(r.sign) this.sign(G, g, s, r.sign);
      // the hard ground the pits and paddock stand on
      if(s.kind === "pits" || s.kind === "paddock"){ const pad = new THREE.BoxGeometry(s.wid + 2, 0.4, s.dep + (s.kind === "paddock" ? 6 : 2)); pad.translate(0, -0.18, 0);
        this.bucketAdd([paint(pad, flat(s.kind === "pits" ? "#5E6066" : "#6A6C70"), () => 0)], s.x, s.y, s.z, s.ang); }
    }
    for(const h of [...P.houses, ...P.farms]){
      const r = h.kind === "barn" ? KIT.barn(h) : h.kind === "farm" ? KIT.farm(h) : KIT.house(h);
      this.bucketAdd(r.parts, h.x, h.y, h.z, h.ang);
      if(h.smoke && r.chimney) this.chimneys.push(this.toWorld({ x:h.x, y:h.y, z:h.z, ang:h.ang }, ...r.chimney));
    }
    if(P.church){ const r = KIT.church(); this.bucketAdd(r.parts, P.church.x, P.church.y, P.church.z, P.church.ang); }
    if(P.abbey){ const r = KIT.abbey(); this.bucketAdd(r.parts, P.abbey.x, P.abbey.y, P.abbey.z, P.abbey.ang); }
    this.culvert(G, g, T, P);
  },

  // a painted sign on a building front
  sign(G, g, s, sg){
    const cv = document.createElement("canvas"); cv.width = 512; cv.height = 64;
    const c = cv.getContext("2d"); c.fillStyle = "#2A2420"; c.fillRect(0, 0, 512, 64); c.strokeStyle = "#C8A45A"; c.lineWidth = 4; c.strokeRect(4, 4, 504, 56);
    c.fillStyle = "#F0E2C0"; c.font = "700 40px Georgia,serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(sg.text, 256, 34);
    const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(sg.w, sg.h), new THREE.MeshStandardMaterial({ map:t, roughness:0.7 }));
    const [x, y, z] = this.toWorld(s, sg.x, sg.y, sg.z + 0.05); m.position.set(x, z, y); m.rotation.y = -s.ang; m.userData.dynamic = true; g.add(m);
  },
  /* The big paddock sign: red bars and a white word on a black frame. Made of plain shapes
     and a plain typeface; it is nobody's logo. */
  paddockSign(G, g, s){
    const cv = document.createElement("canvas"); cv.width = 1024; cv.height = 256;
    const c = cv.getContext("2d"); c.fillStyle = "#121418"; c.fillRect(0, 0, 1024, 256);
    c.fillStyle = "#E10600";
    c.beginPath(); c.moveTo(40, 200); c.lineTo(200, 56); c.lineTo(300, 56); c.lineTo(140, 200); c.fill();
    c.beginPath(); c.moveTo(170, 200); c.lineTo(330, 56); c.lineTo(380, 56); c.lineTo(220, 200); c.fill();
    c.fillStyle = "#FFFFFF"; c.font = "900 italic 120px 'Saira Condensed',Impact,sans-serif"; c.textAlign = "left"; c.textBaseline = "middle"; c.fillText("PADDOCK", 400, 132);
    c.fillStyle = "#E10600"; c.fillRect(400, 200, 560, 10);
    const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8;
    const grp = new THREE.Group(); grp.position.set(s.x, s.z, s.y); grp.rotation.y = -s.ang;
    const dark = G.mat("#1A1C20", { roughness:0.5, metalness:0.4 });
    for(const x of [-9, 9]){ const p = new THREE.Mesh(new THREE.BoxGeometry(0.6, 9, 0.6), dark); p.position.set(x, 4.5, 0); p.castShadow = true; grp.add(p); }
    const frame = new THREE.Mesh(new THREE.BoxGeometry(21, 5.6, 0.5), dark); frame.position.y = 7.6; frame.castShadow = true; grp.add(frame);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(20, 5), new THREE.MeshStandardMaterial({ map:t, roughness:0.6, emissive:new THREE.Color(1, 1, 1), emissiveMap:t, emissiveIntensity:0.18 }));
    face.position.set(0, 7.6, 0.27); grp.add(face);
    grp.traverse(o => { if(o.isMesh) o.userData.dynamic = true; });
    g.add(grp);
  },
  /* The start lights: a gantry over the line with five pairs of red lamps. They light one by
     one with the session's own count, and go out together at the start. */
  startGantry(G, g, T, s){
    const grp = new THREE.Group(); grp.position.set(s.x, s.z, s.y); grp.rotation.y = -s.ang;
    const dark = G.mat("#20242B", { roughness:0.6, metalness:0.4 }), w = T.half + 1.4;
    for(const z of [-w, w]){ const p = new THREE.Mesh(new THREE.BoxGeometry(0.6, 7.4, 0.6), dark); p.position.set(0, 3.7, z); p.castShadow = true; grp.add(p); }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.0, 2 * w + 0.6), dark); beam.position.y = 7.2; beam.castShadow = true; grp.add(beam);
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.4, 5.6), dark); box.position.y = 6.2; grp.add(box);
    const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color:0xFFFFFF, toneMapped:false }), 10);
    const M = new THREE.Matrix4();
    for(let k = 0; k < 10; k++){ M.makeTranslation(k < 5 ? -0.52 : 0.52, 6.45, -2.2 + (k % 5) * 1.1); lamps.setMatrixAt(k, M); lamps.setColorAt(k, new THREE.Color("#2A0A0A")); }
    lamps.instanceMatrix.needsUpdate = true; lamps.instanceColor.needsUpdate = true; grp.add(lamps);
    grp.traverse(o => { if(o.isMesh) o.userData.dynamic = true; });
    g.add(grp); this.lamps = lamps; this.lampState = -1;
  },
  /* the Eau Rouge passing under the track: a stone headwall with an arch either side of
     the embankment, and stone parapets along the road edge above it */
  culvert(G, g, T, P){
    const i = P.culvert.i, parts = [], stone = "#8A867C", dark = "#2A2C2A";
    for(const sd of [-1, 1]){
      const o = sd * (T.half + (sd < 0 ? T.roL[i] : T.roR[i]) + 6.5);
      const x = T.x[i] + T.nx[i] * o, y = T.y[i] + T.ny[i] * o, z = Math.min(P.height(x, y), T.z[i] - 2.5);
      const wall = new THREE.BoxGeometry(12, 5, 1.2); wall.translate(0, 2.5, 0); parts.length = 0;
      parts.push(paint(wall, flat(stone), () => 0));
      const arch = new THREE.CylinderGeometry(1.6, 1.6, 1.4, 12, 1, false, 0, Math.PI); arch.rotateZ(Math.PI / 2); arch.rotateY(Math.PI / 2); arch.translate(0, 1.6, sd * 0.1);
      parts.push(paint(arch, flat(dark), () => 0));
      const hole = new THREE.BoxGeometry(3.2, 1.6, 1.4); hole.translate(0, 0.8, sd * 0.1); parts.push(paint(hole, flat(dark), () => 0));
      const cap = new THREE.BoxGeometry(12.6, 0.4, 1.6); cap.translate(0, 5.1, 0); parts.push(paint(cap, flat("#6E6A62"), () => 0));
      this.bucketAdd(parts.slice(), x, y, z, T.ang[i] + (sd > 0 ? Math.PI : 0));
    }
    this.culvertAt = { x:T.x[i], y:T.y[i], z:T.z[i] };
  },

  /* ---- barriers: catch fencing where it is fast, tyre walls at the gravel, adverts ---- */
  barriers(G, g, T, P){
    const n = T.n, w = T.half, Z = T.def.zones || {};
    const boAt = (sd, i) => sd * (w + (sd < 0 ? T.roL[i] : T.roR[i]) + 2.6);
    const inU = (i, a, b) => { const u = i / n; return a <= b ? (u >= a && u <= b) : (u >= a || u <= b); };
    // catch fencing: Eau Rouge and Raidillon both sides, Blanchimont and Pouhon on the outside
    const fh = 4.2;
    const fmat = new THREE.MeshStandardMaterial({ map:PTEX.fence(), alphaMap:PTEX.fence(), transparent:true, alphaTest:0.28, side:THREE.DoubleSide, roughness:0.6, metalness:0.5, color:G.col("#B8C0C8"), depthWrite:true });
    const zones = [[-1, 0.084, 0.128], [1, 0.084, 0.128], [1, 0.848, 0.902], [1, 0.515, 0.568]];
    const posts = [];
    for(const [sd, a, b] of zones){
      const f = i => boAt(sd, i) + sd * 0.35, sel = i => inU(i, a, b);
      const fg = G.wall(T, f, fh, sel, -1.0);
      if(fg){ const uv = fg.attributes.uv; for(let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 2.0, uv.getY(k) * (fh / 4)); uv.needsUpdate = true;
        const m = new THREE.Mesh(fg, fmat); m.userData.dynamic = true; g.add(m); }
      for(let i = 0; i < n; i += 3) if(sel(i)){ const o = f(i); posts.push({ x:T.x[i] + T.nx[i] * o, y:T.y[i] + T.ny[i] * o, z:T.z[i] - 1, sx:0.16, sy:fh + 1.0, sz:0.16, ry:0 }); }
    }
    const post = paint(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), flat("#6E757C"), () => 0);
    this.plant(G, g, post, this.mat, posts, false);
    // tyre walls in front of the Armco, wherever a gravel trap runs into it
    const tyres = [];
    if(T.rsL) for(const sd of [-1, 1]) for(let i = 0; i < n; i++){
      const code = sd < 0 ? T.rsL[i] : T.rsR[i]; if(code !== 2 && code !== 5) continue;
      const j = (i + 1) % n, o0 = boAt(sd, i) - sd * 0.7, o1 = boAt(sd, j) - sd * 0.7;
      const ax = T.x[i] + T.nx[i] * o0, ay = T.y[i] + T.ny[i] * o0, bx = T.x[j] + T.nx[j] * o1, by = T.y[j] + T.ny[j] * o1, L = Math.hypot(bx - ax, by - ay), m = Math.round(L / 0.68);
      for(let k = 0; k < m; k++){ const t = k / m; tyres.push({ x:ax + (bx - ax) * t, y:ay + (by - ay) * t, z:T.z[i] + (T.z[j] - T.z[i]) * t, h:1, w:1, ry:0 }); }
    }
    this.plant(G, g, this.geos.tyres, this.mat, tyres, false);
    this.stats.tyres = tyres.length;
    /* adverts on the Armco: along the straights, past the stands and at the big corners,
       panels 6 m by 1.1 m on the outside, facing the cars */
    const runs = [[0.94, 0.02, -1], [0.05, 0.085, -1], [0.13, 0.30, 1], [0.13, 0.30, -1], [0.36, 0.40, -1], [0.43, 0.47, -1], [0.52, 0.56, 1], [0.84, 0.90, 1], [0.95, 0.975, -1]];
    const ad = new THREE.Group();
    let count = 0;
    for(const [a, b, sd] of runs){
      let s = 0;
      for(let i = 0; i < n; i++){ if(!inU(i, a, b) || T.inPitZone(i) && sd === T.pitSide) continue;
        s += T.ds; if(s < 8.5) continue; s = 0;
        const o = boAt(sd, i) + sd * 0.25, x = T.x[i] + T.nx[i] * o, y = T.y[i] + T.ny[i] * o;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.1), ADS.mat(((i * 7) % 23) / 23 + 1e-3, false));
        m.position.set(x, T.z[i] + 1.65, y); m.rotation.y = -T.ang[i] + (sd > 0 ? Math.PI : 0); ad.add(m); count++;
      }
    }
    g.add(G.bake(ad, 220)); this.stats.adverts = count;
  },

  /* ---- people, flags, tents, cars and animals: instanced ---- */
  instanced(G, g, P){
    const GE = this.geos, L = P.lists, st = this.stats;
    st.chunks = 0;
    // only the trees by the circuit cast shadows: the shadow map only covers the view anyway
    for(const k of ["spruce", "pine", "beech", "oak", "birch"]){
      st.chunks += this.plant(G, g, GE[k], this.treeMat, L[k].filter(t => t.shade), true);
      st.chunks += this.plant(G, g, GE[k], this.treeMat, L[k].filter(t => !t.shade), false);
    }
    st.chunks += this.plant(G, g, GE.spruceFar, this.treeMat, L.spruceFar, false);
    st.chunks += this.plant(G, g, GE.broadFar, this.treeMat, L.broadFar, false);
    for(const k of ["fern", "shrub", "flowers", "hedge"]) st.chunks += this.plant(G, g, GE[k], this.mat, L[k], false);
    for(const k of ["bale", "cow", "sheep"]) st.chunks += this.plant(G, g, GE[k], this.mat, L[k], true);
    // the campsites
    const by = { tent:[], bigtent:[], van:[], flagpole:[] }, fl = this.flagList;
    for(const t of P.tents){ by[t.kind].push({ x:t.x, y:t.y, z:t.z - 0.05, ry:t.ang, h:1, w:1, tint:t.kind === "van" ? "#FFFFFF" : t.tint });
      if(t.kind === "flagpole") fl.push({ x:t.x, y:t.y, z:t.z + 6.2, ry:t.ang, h:1.4, w:1, tint:t.tint }); }
    for(const k in by) st.chunks += this.plant(G, g, GE[k], this.mat, by[k], k !== "flagpole");
    st.chunks += this.plant(G, g, GE.car, this.mat, P.cars.map(c => ({ x:c.x, y:c.y, z:c.z, ry:c.ang, h:1, w:1, tint:c.tint })), false);
    // the crowds and the flags
    st.fans = this.fans.length + this.wavers.length;
    st.chunks += this.plant(G, g, GE.fan, this.mat, this.fans, false);
    st.chunks += this.plant(G, g, GE.waver, this.fanMat, this.wavers, false);
    st.chunks += this.plant(G, g, GE.flag, this.flagMat, this.flagList, false);
  },

  /* ---- the little things that move ---- */
  smoke(G, g){
    this.sm = null; if(!this.chimneys.length) return;
    const N = this.chimneys.length * 7, geo = new THREE.IcosahedronGeometry(1, 0);
    const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color:lin("#D8DCDE"), roughness:1, transparent:true, opacity:0.42, depthWrite:false }), N);
    im.frustumCulled = false; im.userData.dynamic = true; g.add(im);
    this.sm = { im, N, M:new THREE.Matrix4(), q:new THREE.Quaternion(), s:new THREE.Vector3(), p:new THREE.Vector3() };
  },
  balloons(G, g, T){
    this.bl = [];
    const bb = T.bounds, cx = bb.minX + bb.w / 2, cy = bb.minY + bb.h / 2;
    const cols = [["#E8C02A", "#D8352A"], ["#2F78B8", "#F2F2EE"], ["#3E8A4A", "#F08A1E"]];
    cols.forEach(([a, b], k) => {
      const env = new THREE.SphereGeometry(9, 12, 10); env.scale(1, 1.18, 1); env.translate(0, 14, 0);
      const e2 = paint(env, (x, y, z) => lin(Math.floor((Math.atan2(z, x) + Math.PI) / TAU * 12) % 2 ? a : b), () => 0);
      const neck = paint(new THREE.CylinderGeometry(2.4, 1.2, 4, 10).translate(0, 4, 0), flat(a), () => 0);
      const basket = paint(new THREE.BoxGeometry(1.6, 1.2, 1.6).translate(0, -0.4, 0), flat("#7A5A3A"), () => 0);
      const m = new THREE.Mesh(merge([e2, neck, basket]), this.buildMat);
      m.castShadow = true; m.userData.dynamic = true; g.add(m);
      this.bl.push({ m, cx:cx + (k - 1) * 700, cy:cy + (k - 1) * 350, r:500 + k * 180, h:170 + k * 45, w:0.004 + k * 0.0015, ph:k * 2.1 });
    });
  },
  cyclist(G, g, T, P){
    this.cy = null;
    // a lane that runs within sight of the circuit, near La Source and Eau Rouge if one does
    let best = null;
    for(const r of P.roads){ if(r.kind !== "road" || r.pts.length < 12) continue;
      let near = 0; for(const p of r.pts){ const q = P.query(p[0], p[1]); if(q.bar > 12 && q.bar < 140) near++; }
      const score = near / r.pts.length * Math.min(1, r.pts.length / 40);
      if(!best || score > best.score) best = { r, score }; }
    if(!best || best.score <= 0) return;
    const parts = [];
    for(const x of [-0.55, 0.55]){ const wh = new THREE.TorusGeometry(0.34, 0.05, 4, 10); wh.translate(x, 0.36, 0); parts.push(paint(wh, flat("#1A1C20"), () => 0)); }
    parts.push(paint(new THREE.BoxGeometry(1.1, 0.06, 0.06).translate(0, 0.62, 0), flat("#D8352A"), () => 0));
    parts.push(paint(new THREE.BoxGeometry(0.06, 0.5, 0.06).translate(-0.15, 0.62, 0), flat("#D8352A"), () => 0));
    parts.push(paint(new THREE.BoxGeometry(0.34, 0.55, 0.3).translate(-0.05, 1.18, 0).rotateZ(-0.35), flat("#E8C02A"), () => 0));
    parts.push(paint(new THREE.BoxGeometry(0.2, 0.22, 0.2).translate(0.18, 1.55, 0), flat("#E2B896"), () => 0));
    parts.push(paint(new THREE.BoxGeometry(0.22, 0.5, 0.14).translate(-0.12, 0.72, 0.12), flat("#1E2A44"), () => 0));
    const m = new THREE.Mesh(merge(parts), this.buildMat); m.castShadow = true; m.userData.dynamic = true; g.add(m);
    const pts = best.r.pts, cum = [0]; for(let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
    this.cy = { m, pts, cum, s:cum[cum.length - 1] * 0.3, dir:1, v:6.5 };
  },
  // drifting mist in the Eau Rouge valley: a few soft sheets that face the overhead camera
  mist(G, g, P){
    this.ms = null; if(CFG.detail === 0) return;
    const cv = document.createElement("canvas"); cv.width = cv.height = 128;
    const c = cv.getContext("2d"), gr = c.createRadialGradient(64, 64, 4, 64, 64, 62);
    gr.addColorStop(0, "rgba(255,255,255,0.85)"); gr.addColorStop(0.5, "rgba(255,255,255,0.35)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = gr; c.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(cv);
    const mat = new THREE.MeshBasicMaterial({ map:t, color:lin("#DDE4E2"), transparent:true, opacity:0.55, depthWrite:false, fog:true });
    // the camera's direction is fixed (45 round, 35.26 up): the sheets face it
    const el = 35.264 * Math.PI / 180, az = Math.PI * 0.25, dir = new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    const seeds = [];
    for(const s of P.streams){ if(!/Eau Rouge/.test(s.name)) continue;
      for(let k = 0; k < s.pts.length; k += 3){ const p = s.pts[k], cu = this.culvertAt; if(!cu || Math.hypot(p[0] - cu.x, p[1] - cu.y) > 320) continue; seeds.push([p[0], p[1], s.z[k]]); } }
    if(!seeds.length && this.culvertAt) seeds.push([this.culvertAt.x, this.culvertAt.y, this.culvertAt.z - 2]);
    const N = Math.min(26, seeds.length * 2), im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, N);
    im.frustumCulled = false; im.renderOrder = 2; im.userData.dynamic = true; g.add(im);
    const list = [];
    for(let k = 0; k < N; k++){ const s = seeds[Math.floor(Math.random() * seeds.length)]; list.push({ x:s[0] + (Math.random() - 0.5) * 40, y:s[1] + (Math.random() - 0.5) * 40, z:s[2] + 3 + Math.random() * 7, r:28 + Math.random() * 30, ph:Math.random() * TAU }); }
    this.ms = { im, list, q, M:new THREE.Matrix4(), p:new THREE.Vector3(), s:new THREE.Vector3() };
  },

  /* ---- light: soft overcast, cool, with patches of sun drifting through ---- */
  light(G, T){
    if(G.sun){ G.sun.color.copy(lin("#FFF2E0")); G.sun.intensity = 1.0; }
    G.scene.traverse(o => { if(o.isHemisphereLight && o !== G.envFill){ o.color.copy(lin("#B8C4CC")); o.groundColor.copy(lin("#4E5E3A")); } });
    if(G.scene.fog) G.scene.fog.color.copy(lin("#B5C1C0"));
    G.scene.background = lin("#B9C4C6");
    // a little haze across the frame: start it just in front of the bottom of the view
    G.fogNear = -90; G.fogSpanK = 0.9;
  },

  build(G, world, T, S){
    const t0 = performance.now(), tm = {};
    const step = (k, fn) => { const a = performance.now(); try{ fn(); }catch(e){ console.warn("spa " + k, e.message, e.stack); } tm[k] = Math.round(performance.now() - a); };
    const g = new THREE.Group(); world.add(g); this.root = g; this.T = T;
    let P;
    step("plan", () => { P = planSpa(T, { detail:CFG.detail }); });
    if(!P) return;
    this.P = P; this.stats = {}; this.buckets = new Map(); this.chimneys = []; this.fans = []; this.wavers = []; this.flagList = [];
    this.U.cloud.value = this.cloudTex();
    this.geos = plantGeos();
    this.mat = this.swayMat("small", 0.0, 9, 1, {});
    this.treeMat = this.swayMat("tree", 0.008, 0.3, 1.1, {});
    this.fanMat = this.swayMat("fan", 0.55, 1.25, 3.4, {});
    this.flagMat = this.swayMat("flag", 0, 0, 1, { side:THREE.DoubleSide });
    // whatever stands between the overhead camera and the car is cut away (G3.cutU)
    for(const m of [this.mat, this.treeMat, this.fanMat, this.flagMat]) G.cutMat(m);
    step("colours", () => this.groundColours(P));
    step("terrain", () => { this.stats.tiles = this.terrain(G, g, P); });
    step("horizon", () => this.horizon(G, g, P, T));
    step("verges", () => this.verges(G, g, T));
    step("water", () => this.water(G, g, P));
    step("roads", () => this.roads(G, g, P));
    step("structures", () => this.structures(G, g, T, P));
    step("bake", () => { this.stats.buildingChunks = this.bucketBake(G, g); });
    step("barriers", () => this.barriers(G, g, T, P));
    step("instanced", () => this.instanced(G, g, P));
    step("smoke", () => this.smoke(G, g));
    step("balloons", () => this.balloons(G, g, T));
    step("cyclist", () => this.cyclist(G, g, T, P));
    step("mist", () => this.mist(G, g, P));
    this.light(G, T);
    tm.total = Math.round(performance.now() - t0);
    this.timing = tm;
    Object.assign(this.stats, P.stats);
    // for checking from the console: what was built, how long it took, and the clearance audit
    try{ window.__spa = { stats:this.stats, timing:tm, audit:() => auditSpa(P, T), plan:P }; }catch(e){}
  },

  frame(S, G){
    const t = S.clock || 0, dt = this._t == null ? 0 : clamp(t - this._t, 0, 0.1); this._t = t;
    this.U.time.value = t;
    // the clouds drift with the wind; in the rain they close over
    this.U.cloudOff.value.set(t * 6 * Math.cos(WIND), t * 6 * Math.sin(WIND));
    const wv = G.wetVis || 0;
    this.U.cloudAmt.value = 1 - wv * 0.7;
    if(this.groundMat) this.groundMat.color.setScalar(1 - wv * 0.26);
    if(this.vergeMat) this.vergeMat.color.setScalar(1 - wv * 0.26);
    if(this.treeMat) this.treeMat.color.setScalar(1 - wv * 0.14);
    // the start lights follow the session: one pair per second, then all out
    if(this.lamps){
      const on = S.state === "lights" ? Math.min(5, Math.floor(S.lights || 0)) : 0;
      if(on !== this.lampState){ this.lampState = on; const c = new THREE.Color();
        for(let k = 0; k < 10; k++){ c.set((k % 5) < on ? "#FF2A1A" : "#2A0A0A"); this.lamps.setColorAt(k, c); }
        this.lamps.instanceColor.needsUpdate = true; }
    }
    // chimney smoke: puffs rise, drift downwind, grow and thin
    const SM = this.sm;
    if(SM){ const ch = this.chimneys, wx = Math.cos(WIND), wy = Math.sin(WIND);
      for(let k = 0; k < SM.N; k++){ const c = ch[Math.floor(k / 7)], f = ((t * 0.16 + (k % 7) / 7 + Math.floor(k / 7) * 0.37) % 1);
        SM.p.set(c[0] + wx * f * 14, c[2] + f * 11, c[1] + wy * f * 14); const r = 0.6 + f * 2.6 * (1 - f * 0.4);
        SM.s.set(r, r * 0.8, r); SM.M.compose(SM.p, SM.q, SM.s); SM.im.setMatrixAt(k, SM.M); }
      SM.im.instanceMatrix.needsUpdate = true; }
    for(const b of this.bl || []){ const a = t * b.w + b.ph;
      b.m.position.set(b.cx + Math.cos(a) * b.r, b.h + Math.sin(t * 0.21 + b.ph) * 6, b.cy + Math.sin(a) * b.r); }
    const C = this.cy;
    if(C && dt > 0){
      const end = C.cum[C.cum.length - 1];
      C.s += C.dir * C.v * dt; if(C.s > end - 2){ C.s = end - 2; C.dir = -1; } else if(C.s < 2){ C.s = 2; C.dir = 1; }
      let k = 1; while(k < C.cum.length - 1 && C.cum[k] < C.s) k++;
      const a = C.pts[k - 1], b = C.pts[k], f = (C.s - C.cum[k - 1]) / Math.max(C.cum[k] - C.cum[k - 1], 1e-6);
      C.m.position.set(a[0] + (b[0] - a[0]) * f, a[2] + (b[2] - a[2]) * f + 0.05, a[1] + (b[1] - a[1]) * f);
      C.m.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]) + (C.dir < 0 ? Math.PI : 0);
    }
    const MS = this.ms;
    if(MS){ for(let k = 0; k < MS.list.length; k++){ const m = MS.list[k], d = Math.sin(t * 0.05 + m.ph);
        MS.p.set(m.x + d * 18 * Math.cos(WIND), m.z + Math.sin(t * 0.13 + m.ph) * 1.5, m.y + d * 18 * Math.sin(WIND)); MS.s.set(m.r * 1.6, m.r * 0.55, 1);
        MS.M.compose(MS.p, MS.q, MS.s); MS.im.setMatrixAt(k, MS.M); }
      MS.im.instanceMatrix.needsUpdate = true;
      MS.im.material.opacity = 0.5 + wv * 0.25; }
  },
};

export { SPA };
