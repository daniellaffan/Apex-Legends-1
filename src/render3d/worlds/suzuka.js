import * as THREE from 'three';
import { TAU, clamp } from '../../config/util.js';
import { CFG } from '../../config/settings.js';
import { planSuzuka, auditSuzuka } from './suzuka-plan.js';

/* ---------- Suzuka: wooded Mie hills ---------------------------------------
   The circuit stays the stylised one it always was (the layout is the DSL's,
   see NOTES.md for how it differs from the real thing). Around it this builds:
   rolling ground that follows the circuit's own heights and rises into hills,
   forest of cedar, cypress, broadleaf, bamboo and the odd maple, cherry
   blossom in groves along the straights and round the crowds, azalea along the
   fences, tea rows and flooded paddies further out, a pond and its ditch, the
   park with its Ferris wheel across the main straight from the pits, bridges
   under both decks, and camera towers among the trees.

   What goes where is decided in suzuka-plan.js (pure numbers, testable in
   Node). Everything that repeats is instanced, in spatial chunks with their own
   bounds so the camera and the shadow pass only draw what they can see. */

const lin = c => new THREE.Color(c).convertSRGBToLinear();
const sst = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const WIND = 0.7;                                  // one wind for every tree and petal

/* ---- geometry tools: everything a plant is made of carries its own colour and
   a tint mask (1 takes the instance's tint, 0 keeps its own colour: a trunk) ---- */
function paint(geo, colFn, maskFn){
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position, N = p.count;
  const col = new Float32Array(N * 3), msk = new Float32Array(N);
  for(let v = 0; v < N; v++){
    const f = Math.floor(v / 3), c = colFn(p.getX(v), p.getY(v), p.getZ(v), f);
    col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b;
    msk[v] = maskFn ? maskFn(p.getY(v), f) : 1;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setAttribute("tintMask", new THREE.BufferAttribute(msk, 1));
  return g;
}
function merge(geos){
  let n = 0; for(const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), msk = new Float32Array(n);
  let o = 0;
  for(const g of geos){
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3); col.set(g.attributes.color.array, o * 3); msk.set(g.attributes.tintMask.array, o);
    o += c;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("color", new THREE.BufferAttribute(col, 3));
  out.setAttribute("tintMask", new THREE.BufferAttribute(msk, 1));
  out.computeVertexNormals(); out.computeBoundingSphere();
  return out;
}
const fh = f => { let h = Math.imul(f + 7, 2654435761) >>> 0; h ^= h >>> 15; return (h % 1000) / 1000; };
// a canopy coloured dark underneath and lighter on top, which is what gives a wood its depth from above
const grad = (lo, hi, y0, y1, jit) => { const A = lin(lo), B = lin(hi);
  return (x, y, z, f) => A.clone().lerp(B, clamp(sst(y0, y1, y) + (fh(f) - 0.5) * (jit || 0.25), 0, 1)); };
const flat = c => { const C = lin(c); return () => C; };

const SUZUKA = {
  U:{ time:{ value:0 } },
  CHUNK:180,

  /* ---- the species: unit height, so an instance's scale is its height ---- */
  geos(){
    if(this._geos) return this._geos;
    const TRUNK = "#6E5440", TRUNK_D = "#4E3C30";
    const trunk = (r0, r1, h, col, seg) => { const t = new THREE.CylinderGeometry(r1, r0, h, seg || 5); t.translate(0, h / 2, 0); return paint(t, flat(col || TRUNK), () => 0); };
    const cone = (r, h, y, seg, lo, hi) => { const c = new THREE.ConeGeometry(r, h, seg); c.translate(0, y + h / 2, 0); return paint(c, grad(lo, hi, 0.15, 1.0, 0.2)); };
    const blob = (r, x, y, z, sy, lo, hi, det) => { const b = new THREE.IcosahedronGeometry(r, det || 0); b.scale(1, sy, 1); b.translate(x, y, z); return paint(b, grad(lo, hi, y - r * sy, y + r * sy, 0.35)); };
    const G = {};
    // sugi: tall, narrow, dark, in close tiers
    G.sugi = merge([trunk(0.017, 0.010, 0.42),
      cone(0.19, 0.40, 0.20, 7, "#22402A", "#305A30"), cone(0.155, 0.34, 0.38, 7, "#284A2C", "#386634"),
      cone(0.115, 0.29, 0.55, 7, "#2E522E", "#42703A"), cone(0.07, 0.25, 0.72, 6, "#36602F", "#4E7E3E")]);
    G.sugiFar = merge([cone(0.18, 0.62, 0.18, 5, "#26462C", "#36602F"), cone(0.10, 0.4, 0.58, 5, "#30562E", "#46723A")]);
    // hinoki: rounder tiers, a warmer green
    G.hinoki = merge([trunk(0.02, 0.012, 0.36),
      cone(0.24, 0.42, 0.18, 8, "#2C4C2A", "#3E6836"), cone(0.19, 0.36, 0.40, 8, "#345830", "#4A763C"), cone(0.12, 0.30, 0.62, 7, "#3E6634", "#588642")]);
    G.hinokiFar = merge([cone(0.23, 0.82, 0.16, 6, "#2E502C", "#48743A")]);
    // broadleaf: a trunk and three rounded lumps
    G.broad = merge([trunk(0.035, 0.022, 0.5),
      blob(0.34, 0, 0.6, 0, 0.82, "#355E2A", "#5A8A3C"), blob(0.25, 0.18, 0.72, 0.08, 0.85, "#3C662E", "#649442"), blob(0.23, -0.15, 0.78, -0.1, 0.85, "#3C662E", "#6A9A46")]);
    G.broadFar = merge([blob(0.38, 0, 0.62, 0, 0.85, "#38602C", "#5E8E40")]);
    // sakura: a short dark trunk that forks, and a wide cloud of pink-white
    { const t = trunk(0.04, 0.03, 0.4, TRUNK_D);
      const b1 = new THREE.BoxGeometry(0.035, 0.32, 0.035); b1.translate(0, 0.16, 0); b1.rotateZ(0.5); b1.translate(0.02, 0.36, 0);
      const b2 = new THREE.BoxGeometry(0.035, 0.30, 0.035); b2.translate(0, 0.15, 0); b2.rotateZ(-0.55); b2.translate(-0.02, 0.36, 0);
      const parts = [t, paint(b1, flat(TRUNK_D), () => 0), paint(b2, flat(TRUNK_D), () => 0)];
      for(const [x, y, z, r] of [[0, 0.72, 0, 0.36], [0.3, 0.64, 0.1, 0.26], [-0.28, 0.66, -0.06, 0.27], [0.06, 0.66, 0.3, 0.25], [-0.05, 0.64, -0.3, 0.25], [0.1, 0.86, -0.05, 0.22]])
        parts.push(blob(r, x, y, z, 0.7, "#E4A9BC", "#FCEBF0", 0));
      G.sakura = merge(parts); }
    // momiji: small, layered, red-orange
    G.momiji = merge([trunk(0.03, 0.02, 0.45, TRUNK_D),
      blob(0.36, 0, 0.62, 0, 0.6, "#A8321E", "#E4683A"), blob(0.26, 0.12, 0.8, 0.05, 0.6, "#C0402A", "#F08A48")]);
    // bamboo: a clump of thin culms and feathery tops
    { const parts = [], r = (() => { let a = 7; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; })();
      for(let k = 0; k < 7; k++){
        const a = r() * TAU, d = r() * 0.12, h = 0.82 + r() * 0.18, lean = (r() - 0.5) * 0.12;
        const c = new THREE.CylinderGeometry(0.006, 0.009, h, 4); c.translate(0, h / 2, 0); c.rotateZ(lean); c.rotateX((r() - 0.5) * 0.12); c.translate(Math.cos(a) * d, 0, Math.sin(a) * d);
        parts.push(paint(c, flat("#8EA858"), () => 0.4));
        { const y = h * 0.8; parts.push(blob(0.1, Math.cos(a) * d - lean * y, y, Math.sin(a) * d, 1.6, "#6E9A3E", "#A2C460", 0)); }
      }
      G.bamboo = merge(parts); }
    // shrubs and azalea: a low mound; the azalea's flowers are white faces that take the tint
    { const s = new THREE.IcosahedronGeometry(0.5, 0); s.scale(1, 0.7, 1); s.translate(0, 0.38, 0); G.shrub = paint(s, grad("#3E5E2C", "#5E8240", 0, 0.75, 0.3)); }
    { const a = new THREE.IcosahedronGeometry(0.5, 1); a.scale(1, 0.62, 1); a.translate(0, 0.36, 0);
      const leaf = lin("#3A5C2C"), leafHi = lin("#4E7436"), fl = lin("#FFFFFF");
      G.azalea = paint(a, (x, y, z, f) => fh(f) < 0.58 ? fl : (y > 0.4 ? leafHi : leaf), (y, f) => fh(f) < 0.58 ? 1 : 0); }
    // a patch of wild flowers: five small heads close to the ground
    { const parts = []; for(const [x, z] of [[0, 0], [0.4, 0.2], [-0.35, 0.3], [0.15, -0.4], [-0.3, -0.25]]){
        const b = new THREE.IcosahedronGeometry(0.16, 0); b.translate(x, 0.18, z); parts.push(paint(b, flat("#FFFFFF"))); }
      G.flowers = merge(parts); }
    // a clipped hedge, flowering in the park
    { const h = new THREE.BoxGeometry(1, 1, 1, 2, 1, 1); h.translate(0, 0.5, 0);
      const p = h.attributes.position; for(let i = 0; i < p.count; i++) if(p.getY(i) > 0.9) p.setY(i, 0.88 + ((i * 0.37) % 1) * 0.2);
      const leaf = lin("#3E6030"), fl = lin("#FFFFFF");
      G.hedge = paint(h, (x, y, z, f) => fh(f) < 0.35 ? fl : leaf, (y, f) => fh(f) < 0.35 ? 1 : 0.25); }
    // tea: a long rounded row, clipped into a dome
    { const t = new THREE.SphereGeometry(0.5, 6, 3, 0, TAU, 0, Math.PI / 2); t.scale(1, 1.8, 1); G.tea = paint(t, grad("#3C6A26", "#7AAA3A", 0, 0.5, 0.15)); }
    return (this._geos = G);
  },

  /* one material for every plant: vertex colour, the instance's tint where the mask
     says, and a little sway in the wind for whatever stands above head height */
  plantMat(){
    const m = new THREE.MeshStandardMaterial({ color:0xFFFFFF, vertexColors:true, flatShading:true, roughness:0.9, metalness:0 });
    const U = this.U;
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
  float sSw = (sin(uTime * 1.1 + sIp.x * 0.05 + sIp.z * 0.07) * 0.6 + sin(uTime * 2.3 + sIp.x * 0.11) * 0.25) * 0.008 * max(position.y - 0.3, 0.0);
  transformed.x += sSw * ${Math.cos(WIND).toFixed(3)}; transformed.z += sSw * ${Math.sin(WIND).toFixed(3)};
#endif`);
    };
    m.customProgramCacheKey = () => "suzukaPlant";
    return m;
  },

  /* Instanced, in chunks. Each item: x, y, z (game space), ry, and either h and w
     (height, width as a share of it) with a lean, or sx/sy/sz for a hedge row. */
  plant(G, g, geo, mat, list, cast){
    if(!list.length) return 0;
    if(!geo.boundingSphere) geo.computeBoundingSphere();
    const r0 = geo.boundingSphere.radius + geo.boundingSphere.center.length();
    const C = this.CHUNK, groups = new Map();
    for(const it of list){ const k = Math.floor(it.x / C) + "," + Math.floor(it.y / C); let a = groups.get(k); if(!a){ a = []; groups.set(k, a); } a.push(it); }
    const pos = new THREE.Vector3(), q = new THREE.Quaternion(), qy = new THREE.Quaternion(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), tip = new THREE.Vector3(), M = new THREE.Matrix4(), tint = new THREE.Color();
    let made = 0;
    for(const items of groups.values()){
      const gg = new THREE.BufferGeometry();
      for(const name in geo.attributes) gg.setAttribute(name, geo.attributes[name]);
      const im = new THREE.InstancedMesh(gg, mat, items.length);
      let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity, smax = 0;
      items.forEach((it, i) => {
        pos.set(it.x, it.z, it.y);
        qy.setFromAxisAngle(up, it.ry || 0);
        if(it.lx || it.ly){ tip.set(it.lx, 1, it.ly).normalize(); q.setFromUnitVectors(up, tip).multiply(qy); } else q.copy(qy);
        if(it.sx) sc.set(it.sx, it.sy, it.sz); else { const s = it.h * (it.w || 1); sc.set(s, it.h, s); }
        M.compose(pos, q, sc); im.setMatrixAt(i, M);
        const t = it.tint;
        if(typeof t === "string") tint.set(t).convertSRGBToLinear(); else if(t) tint.setRGB(t[0], t[1], t[2]); else tint.setRGB(1, 1, 1);
        im.setColorAt(i, tint);
        x0 = Math.min(x0, it.x); x1 = Math.max(x1, it.x); z0 = Math.min(z0, it.y); z1 = Math.max(z1, it.y); y0 = Math.min(y0, it.z); y1 = Math.max(y1, it.z);
        smax = Math.max(smax, sc.x, sc.y, sc.z);
      });
      gg.boundingSphere = new THREE.Sphere(new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 + r0 * smax);
      im.instanceMatrix.needsUpdate = true; if(im.instanceColor) im.instanceColor.needsUpdate = true;
      im.castShadow = !!cast; im.receiveShadow = true; im.frustumCulled = true;
      im.userData.dynamic = true;                    // carries its own transforms: keep it out of the bake
      g.add(im); made++;
    }
    return made;
  },

  /* ---- the ground ---- */
  terrain(G, g, P){
    const Gd = P.grid, { X0, Y0, STEP, NX, NY, H, COL } = Gd, TILE = 40;
    const mat = new THREE.MeshStandardMaterial({ vertexColors:true, roughness:0.96, metalness:0 });
    // a fine grain over the vertex colour, in world space, so the grass is not a flat wash
    const det = (() => { const N = 128, d = new Uint8Array(N * N * 4); let a = 99;
      const r = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
      for(let k = 0; k < N * N; k++){ const v = 128 + (r() - 0.5) * 80 + (r() < 0.05 ? -36 : 0); d[k * 4] = d[k * 4 + 1] = d[k * 4 + 2] = v; d[k * 4 + 3] = 255; }
      const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true; return t; })();
    mat.onBeforeCompile = sh => {
      sh.uniforms.uDet = { value:det };
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec2 vGW;")
        .replace("#include <project_vertex>", "#include <project_vertex>\n  vGW = (modelMatrix * vec4(transformed, 1.0)).xz;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec2 vGW;\nuniform sampler2D uDet;")
        .replace("#include <color_fragment>", `#include <color_fragment>
  float gD = texture2D(uDet, vGW / 5.0).r * 0.55 + texture2D(uDet, vGW / 31.0).r * 0.45;
  diffuseColor.rgb *= 0.84 + gD * 0.32;`);
    };
    mat.customProgramCacheKey = () => "suzukaGround";
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
      for(let r = 0; r < h - 1; r++) for(let cc = 0; cc < w - 1; cc++){
        const a = r * w + cc, b = a + 1, d = a + w, e = d + 1;
        idx.push(a, d, b, b, d, e);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      geo.setIndex(idx); geo.computeVertexNormals(); geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; m.castShadow = false; m.userData.dynamic = true;
      g.add(m); tiles++;
    }
    return tiles;
  },

  /* mown stripes down the verges, over the plain run-off and the grass strip past it */
  verges(G, g, T){
    const cv = document.createElement("canvas"); cv.width = 8; cv.height = 64;
    const c = cv.getContext("2d");
    const gr = c.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, "#74A04A"); gr.addColorStop(0.46, "#74A04A"); gr.addColorStop(0.54, "#86B256"); gr.addColorStop(0.96, "#86B256"); gr.addColorStop(1, "#74A04A");
    c.fillStyle = gr; c.fillRect(0, 0, 8, 64);
    const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
    const mat = new THREE.MeshStandardMaterial({ map:t, roughness:0.95, metalness:0 });
    this.vergeMat = mat;
    const w = T.half, lift = 0.04;
    for(const sd of [-1, 1]){
      const code = i => (sd < 0 ? T.rsL[i] : T.rsR[i]), rf = i => (sd < 0 ? T.roL[i] : T.roR[i]);
      const band = (a, b, f) => { const geo = sd < 0 ? G.strip(T, i => -b(i), i => -a(i), lift, 22, f) : G.strip(T, a, b, lift, 22, f); if(geo) G.add(g, geo, mat); };
      if(T.rsL) band(() => w + 2.0, i => w + rf(i), i => code(i) === 6);
      band(i => w + rf(i), i => w + rf(i) + 6, null);
    }
  },

  /* ---- water: paddies, the pond and the ditch ---- */
  water(G, g, P){
    const mat = new THREE.MeshStandardMaterial({ color:lin("#6E8C92"), roughness:0.16, metalness:0.0, envMapIntensity:0.9 });
    const pos = [];
    const quad = (cx, cy, z, l, w, ang) => {
      const ux = Math.cos(ang), uy = Math.sin(ang), P4 = [[-l / 2, -w / 2], [l / 2, -w / 2], [l / 2, w / 2], [-l / 2, w / 2]].map(([a, b]) => [cx + ux * a - uy * b, cy + uy * a + ux * b]);
      for(const k of [0, 2, 1, 0, 3, 2]) pos.push(P4[k][0], z, P4[k][1]);
    };
    for(const p of P.paddies) quad(p.x, p.y, p.z, p.l - 3, p.w - 3, p.ang);
    if(P.pond){ const N = 28, o = P.pond;
      for(let k = 0; k < N; k++){ const a0 = k / N * TAU, a1 = (k + 1) / N * TAU, r0 = o.r * (1 + 0.08 * Math.sin(k * 1.7)), r1 = o.r * (1 + 0.08 * Math.sin((k + 1) * 1.7));
        pos.push(o.x, o.z, o.y, o.x + Math.cos(a1) * r1, o.z, o.y + Math.sin(a1) * r1, o.x + Math.cos(a0) * r0, o.z, o.y + Math.sin(a0) * r0); } }
    const S = P.stream;
    for(let k = 0; k < S.length - 1; k++){
      const [ax, ay, az] = S[k], [bx, by, bz] = S[k + 1], L = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / L * 0.9, ny = (bx - ax) / L * 0.9;
      pos.push(ax - nx, az, ay - ny, bx + nx, bz, by + ny, bx - nx, bz, by - ny,  ax - nx, az, ay - ny, ax + nx, az, ay + ny, bx + nx, bz, by + ny);
    }
    if(!pos.length) return;
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals(); geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; m.userData.dynamic = true; g.add(m);
    G.tileSplit(m, 250, 50);
  },

  /* ---- the bridges: wherever the road stands clear of the ground. Over the other
     road, an open span: a slab with its fascia, a red band and a parapet, on pier caps
     and columns. On the approaches, a retaining wall down each side to the ground ---- */
  bridges(G, g, T, P){
    const w = T.half, conc = G.twoSided(G.mat("#C8C6C0", { roughness:0.85 })), band = G.mat("#C0392B", { roughness:0.7 }), dark = G.twoSided(G.mat("#8E8C88"));
    const wallM = G.twoSided(G.mat("#B8B4A8", { roughness:0.9 })), D = P.deck;
    const edge = (sd, i) => sd * (w + (sd < 0 ? T.roL[i] : T.roR[i]) + 6);
    for(const b of P.bridges){
      const L = ((b.i1 - b.i0) % T.n + T.n) % T.n;
      const idx = i => ((i - b.i0) % T.n + T.n) % T.n;
      const inRun = i => idx(i) <= L, isOpen = i => inRun(i) && b.open[idx(i)], closed = i => inRun(i) && !b.open[idx(i)];
      G.add(g, G.strip(T, i => edge(-1, i), i => edge(1, i), -1.5, 8, isOpen), dark);
      for(const sd of [-1, 1]){
        const drop = sd < 0 ? D.dropL : D.dropR;
        // the span's fascia and its band; the approach walls go right down to the ground
        G.add(g, G.wall(T, i => edge(sd, i), 0.0, isOpen, 1.5), conc);
        G.add(g, G.wall(T, i => edge(sd, i) - sd * 0.02, -0.55, isOpen, 1.1), band);
        G.add(g, G.wall(T, i => edge(sd, i), 0.0, closed, i => Math.max(1.0, drop[i] + 0.6)), wallM);
        // a low parapet along the outer edge, wherever the drop is worth one
        const tall = i => inRun(i) && (b.open[idx(i)] || drop[i] > 2.2);
        G.add(g, G.wall(T, i => edge(sd, i) - sd * 0.3, 1.0, tall, 0), conc);
        G.add(g, G.strip(T, sd < 0 ? (i => edge(sd, i)) : (i => edge(sd, i) - 0.3), sd < 0 ? (i => edge(sd, i) + 0.3) : (i => edge(sd, i)), 1.0, 8, tall), conc);
      }
      // pier caps and columns where the span begins and ends
      const parts = new THREE.Group();
      for(const i of b.piers){
        const zTop = T.z[i] - 1.5, x = T.x[i], y = T.y[i], wid = edge(1, i) - edge(-1, i), mid = (edge(1, i) + edge(-1, i)) / 2;
        const cx = x + T.nx[i] * mid, cy = y + T.ny[i] * mid, zg = P.triH(cx, cy);
        if(zTop - zg < 1) continue;
        const cap = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, wid), conc);
        cap.position.set(cx, zTop - 0.7, cy); cap.rotation.y = -T.ang[i]; cap.castShadow = true; cap.receiveShadow = true; parts.add(cap);
        for(let o = edge(-1, i) + 3; o <= edge(1, i) - 3; o += 8){
          const px = x + T.nx[i] * o, py = y + T.ny[i] * o, z0 = P.triH(px, py) - 0.5, hgt = zTop - 1.4 - z0;
          if(hgt < 0.5) continue;
          const col = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.85, hgt, 10), conc);
          col.position.set(px, z0 + hgt / 2, py); col.castShadow = true; col.receiveShadow = true; parts.add(col);
        }
      }
      g.add(parts);
    }
  },

  /* ---- camera towers: scaffold legs, a platform, a hut ---- */
  towers(G, g, P){
    const steel = G.mat("#9AA0A6", { roughness:0.6, metalness:0.4 }), deck = G.mat("#5A5E64"), hut = G.mat("#E8E8E4"), roof = G.mat("#C0392B");
    for(const t of P.towers){
      const grp = new THREE.Group(); grp.position.set(t.x, t.z, t.y); grp.rotation.y = -t.ang;
      for(const [a, b] of [[-1.3, -1.3], [1.3, -1.3], [1.3, 1.3], [-1.3, 1.3]]){ const l = new THREE.Mesh(new THREE.BoxGeometry(0.18, 9, 0.18), steel); l.position.set(a, 4.5, b); grp.add(l); }
      for(let y = 2; y < 9; y += 2.4){ const r = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.1, 2.8), steel); r.position.y = y; grp.add(r); }
      const pl = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.25, 3.4), deck); pl.position.y = 9.1; grp.add(pl);
      const h = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.9, 2.2), hut); h.position.set(0.3, 10.2, 0); grp.add(h);
      const rf = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.2, 2.8), roof); rf.position.set(0.3, 11.25, 0); grp.add(rf);
      grp.traverse(o => { if(o.isMesh){ o.castShadow = true; o.receiveShadow = true; } });
      g.add(grp);
    }
  },

  /* ---- the park: pavilions with dark tiled hip roofs and deep eaves, a
     carousel, the paths, paper lanterns and nobori banners, and the wheel ---- */
  park(G, g, T, P, statics){
    const K = P.park;
    for(const b of K.buildings){
      const grp = new THREE.Group(); grp.position.set(b.x, b.z - 0.2, b.y); grp.rotation.y = -b.ang;
      if(b.kind === "carousel"){
        const base = new THREE.Mesh(new THREE.CylinderGeometry(7, 7.4, 1, 16), G.mat("#E8E0D0")); base.position.y = 0.5; grp.add(base);
        for(let k = 0; k < 8; k++){ const p = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4, 0.3), G.mat("#F2D27A")); p.position.set(Math.cos(k / 8 * TAU) * 6, 3, Math.sin(k / 8 * TAU) * 6); grp.add(p); }
        const rf = new THREE.Mesh(new THREE.ConeGeometry(8, 3.2, 16), G.mat("#C0392B")); rf.position.y = 6.6; grp.add(rf);
      } else {
        const body = new THREE.Mesh(new THREE.BoxGeometry(b.l, b.h, b.w), G.mat(b.col)); body.position.y = b.h / 2; grp.add(body);
        // the eaves: a thin slab well out past the walls, then a hip roof on it
        const eave = new THREE.Mesh(new THREE.BoxGeometry(b.l + 2.4, 0.35, b.w + 2.4), G.mat(b.roof)); eave.position.y = b.h + 0.15; grp.add(eave);
        const hip = new THREE.Mesh(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4), G.mat(b.roof)); hip.rotation.y = Math.PI / 4;
        hip.scale.set(b.l + 1.6, Math.min(b.l, b.w) * 0.32, b.w + 1.6); hip.position.y = b.h + 0.3 + Math.min(b.l, b.w) * 0.16; grp.add(hip);
        // a band of glazing along the front
        const gl = new THREE.Mesh(new THREE.BoxGeometry(b.l * 0.8, b.h * 0.35, 0.1), G.mat("#7A98A8", { roughness:0.3, metalness:0.2 })); gl.position.set(0, b.h * 0.45, b.w / 2 + 0.06); grp.add(gl);
      }
      grp.traverse(o => { if(o.isMesh){ o.castShadow = true; o.receiveShadow = true; } });
      statics.add(grp);
    }
    // the paths: gravel-pale ribbons laid over the ground
    { const pos = [];
      for(const [a, b] of K.paths){
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if(L < 2) continue;
        const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, nx = -uy * 2.2, ny = ux * 2.2, N = Math.ceil(L / 4);
        for(let k = 0; k < N; k++){
          const s0 = k / N * L, s1 = (k + 1) / N * L, x0 = a[0] + ux * s0, y0 = a[1] + uy * s0, x1 = a[0] + ux * s1, y1 = a[1] + uy * s1;
          const z = (x, y) => P.height(x, y) + 0.22;
          const A = [x0 - nx, y0 - ny], B = [x0 + nx, y0 + ny], C = [x1 + nx, y1 + ny], D = [x1 - nx, y1 - ny];
          for(const p of [A, C, B, A, D, C]) pos.push(p[0], z(p[0], p[1]), p[1]);
        }
      }
      if(pos.length){ const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals();
        const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color:lin("#CDBF9E"), roughness:0.95, polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2 }));
        m.receiveShadow = true; m.userData.dynamic = true; g.add(m); } }
    // paper lanterns on short posts, red and white; and tall nobori banners at the path ends
    { const posts = [], lamps = [], flags = [];
      K.lanterns.forEach((l, k) => {
        posts.push({ x:l.x, y:l.y, z:l.z, ry:-l.ang, sx:0.12, sy:2.4, sz:0.12 });
        lamps.push({ x:l.x, y:l.y, z:l.z + 2.55, ry:0, sx:0.55, sy:0.7, sz:0.55, tint:k % 3 === 2 ? "#F4F0E6" : "#D8352A" });
        if(k % 4 === 0) flags.push({ x:l.x - Math.sin(l.ang) * 1.6, y:l.y + Math.cos(l.ang) * 1.6, z:l.z, ry:-l.ang, sx:0.9, sy:4.2, sz:1, tint:["#D8352A", "#2A3A6A", "#F2F2EE", "#E68AA8"][k % 4] });
      });
      const postG = paint(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), flat("#3A3430"), () => 0);
      const lampG = paint(new THREE.SphereGeometry(0.5, 8, 6), flat("#FFFFFF"), () => 1);
      const flagG = (() => { const p = new THREE.PlaneGeometry(1, 0.8); p.translate(0.5, 0.55, 0); const pole = new THREE.BoxGeometry(0.06, 1, 0.06); pole.translate(0, 0.5, 0);
        return merge([paint(p, flat("#FFFFFF"), () => 1), paint(pole, flat("#5A5048"), () => 0)]); })();
      const lampMat = this.plantMat(); lampMat.emissive = lin("#401008"); lampMat.side = THREE.DoubleSide;
      this.plant(G, g, postG, this.mat, posts, false);
      this.plant(G, g, lampG, lampMat, lamps, false);
      const flagMat = this.plantMat(); flagMat.side = THREE.DoubleSide;
      this.plant(G, g, flagG, flagMat, flags, true);
    }
    if(K.wheel) this.wheel(G, g, T, K.wheel);
  },

  /* The Ferris wheel. Its real size is not something I could confirm; 52 m to the
     top, 48 m across, 32 gondolas. It faces the overhead camera so it reads as a
     wheel, and it turns about once every five minutes. */
  wheel(G, g, T, W){
    const grp = new THREE.Group(); grp.position.set(W.x, W.z, W.y);
    grp.rotation.y = Math.PI * 0.25;                      // face the camera's azimuth
    const hubY = W.h - W.r - 2, steel = G.mat("#E8ECEF", { roughness:0.5, metalness:0.3 }), red = G.mat("#D8352A", { roughness:0.6 });
    const ms = [];
    // the two A-frames, one each side of the rim
    for(const s of [-1, 1]) for(const t of [-1, 1]){
      const len = Math.hypot(hubY, W.r * 0.55), leg = new THREE.Mesh(new THREE.BoxGeometry(0.9, len, 0.9), steel);
      leg.position.set(t * W.r * 0.275, hubY / 2, s * 2.6); leg.rotation.z = t * Math.atan2(W.r * 0.55, hubY); grp.add(leg); ms.push(leg);
    }
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 6, 12), steel); axle.rotation.x = Math.PI / 2; axle.position.y = hubY; grp.add(axle); ms.push(axle);
    // the turning part: two rims, spokes between them and the hub
    const rot = new THREE.Group(); rot.position.y = hubY; grp.add(rot);
    for(const s of [-1, 1]){
      const rim = new THREE.Mesh(new THREE.TorusGeometry(W.r, 0.32, 6, 72), red); rim.position.z = s * 1.8; rot.add(rim); ms.push(rim);
      const inner = new THREE.Mesh(new THREE.TorusGeometry(W.r * 0.55, 0.18, 5, 48), steel); inner.position.z = s * 1.8; rot.add(inner); ms.push(inner);
    }
    const NS = 32;
    for(let k = 0; k < NS; k++){
      const a = k / NS * TAU, sp = new THREE.Mesh(new THREE.BoxGeometry(0.16, W.r, 0.16), steel);
      sp.position.set(Math.cos(a) * W.r / 2, Math.sin(a) * W.r / 2, (k % 2 ? 1.8 : -1.8)); sp.rotation.z = a - Math.PI / 2; rot.add(sp); ms.push(sp);
    }
    // the gondolas hang level as the wheel turns, so they are moved, not rotated with it
    const gg = new THREE.CylinderGeometry(1.1, 1.1, 2.0, 10); gg.rotateX(Math.PI / 2);
    const gm = new THREE.MeshStandardMaterial({ color:0xFFFFFF, roughness:0.5, metalness:0.1 });
    const gon = new THREE.InstancedMesh(gg, gm, NS), C = ["#F2F2F0", "#E68AA8", "#7FB6E0", "#F2C94C", "#D8352A", "#8CCB7A"];
    for(let k = 0; k < NS; k++) gon.setColorAt(k, lin(C[k % C.length]));
    gon.frustumCulled = false; gon.castShadow = true; gon.userData.dynamic = true; grp.add(gon); ms.push(gon);
    grp.traverse(o => { if(o.isMesh){ o.castShadow = true; o.userData.dynamic = true; } });
    g.add(grp);
    this.wh = { rot, gon, r:W.r, hubY, n:NS, a:0, m:new THREE.Matrix4(), v:new THREE.Vector3() };
    // big, so it gets out of the way of the camera the way the other big props do
    const fadeable = ms.map(o => { const ms2 = Array.isArray(o.material) ? o.material : [o.material]; o.material = ms2.map(m => { const c = m.clone(); c.transparent = true; return c; })[0]; return o; });
    G.occluders.push({ meshes:fadeable, x:W.x, y:W.y, z:W.z + W.h * 0.5, rx:W.r + 4, ry:W.h * 0.55, fade:1 });
  },

  /* ---- cherry petals drifting down round the groves near the car ---- */
  petals(G, g, P){
    this.pt = null;
    if(CFG.detail === 0 || !P.groves.length) return;
    const N = 700, geo = new THREE.BufferGeometry(), pos = new Float32Array(N * 3);
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color:lin("#F9D7E0"), size:3, sizeAttenuation:false, transparent:true, opacity:0.9, depthWrite:false });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.userData.dynamic = true; g.add(pts);
    const st = [];
    for(let k = 0; k < N; k++) st.push({ gi:-1, t:Math.random() * 7, life:5 + Math.random() * 4, ox:0, oy:0, ph:Math.random() * TAU });
    this.pt = { pts, pos, st, near:[], tNear:-9 };
  },

  /* ---- light and haze: a warm, soft spring sun, and a little depth across the frame ---- */
  light(G, T){
    if(G.sun){ G.sun.color.set(lin("#FFEBCF")); G.sun.intensity = 1.12; }
    G.scene.traverse(o => { if(o.isHemisphereLight && o !== G.envFill){ o.groundColor.copy(lin("#6B7A4C")); } });
    if(G.scene.fog) G.scene.fog.color.copy(lin("#D3E0E6"));
    // the overhead camera stands 700 m back and sees about 540 to 860 m of depth: start the haze
    // just before the bottom of the frame and let it build slowly, so the top of the frame and
    // the ground between the trees go a little softer than the treetops nearest the lens
    G.fogNear = -60; G.fogSpanK = 1.5;
  },

  build(G, world, T, S){
    const t0 = performance.now(), tm = {};
    const step = (k, fn) => { const a = performance.now(); try{ fn(); }catch(e){ console.warn("suzuka " + k, e.message, e.stack); } tm[k] = Math.round(performance.now() - a); };
    const g = new THREE.Group(); world.add(g); this.root = g; this.T = T;
    let P;
    step("plan", () => { P = planSuzuka(T, { detail:CFG.detail }); });
    if(!P) return;
    this.P = P; this.wh = null;
    this.mat = this.plantMat();
    const GE = this.geos(), L = P.lists, stats = this.stats = { chunks:0 };
    step("terrain", () => { stats.tiles = this.terrain(G, g, P); });
    step("verges", () => this.verges(G, g, T));
    step("water", () => this.water(G, g, P));
    step("plants", () => {
      // near the circuit, the full tree and a shadow; further off, a cheaper one and none
      const far = it => P.at(P.grid.DB, it.x, it.y) > 230;
      for(const k of ["sugi", "hinoki", "broad"]){
        const nearL = L[k].filter(it => !far(it)), farL = L[k].filter(far);
        stats.chunks += this.plant(G, g, GE[k], this.mat, nearL, true);
        stats.chunks += this.plant(G, g, GE[k + "Far"], this.mat, farL, false);
      }
      for(const k of ["sakura", "momiji", "bamboo"]) stats.chunks += this.plant(G, g, GE[k], this.mat, L[k], true);
      for(const k of ["shrub", "azalea", "flowers", "hedge", "tea"]) stats.chunks += this.plant(G, g, GE[k], this.mat, L[k].map(it => it.s ? Object.assign({ h:it.s, w:1 }, it) : it), false);
    });
    const statics = new THREE.Group();
    step("bridges", () => this.bridges(G, statics, T, P));
    step("towers", () => this.towers(G, statics, P));
    step("park", () => this.park(G, g, T, P, statics));
    step("bake", () => { g.add(G.bake(statics, 260)); });
    step("petals", () => this.petals(G, g, P));
    this.light(G, T);
    tm.total = Math.round(performance.now() - t0);
    this.timing = tm;
    Object.assign(stats, P.stats);
    // for checking from the console: what was built, how long it took, and the clearance audit
    try{ window.__suzuka = { stats, timing:tm, audit:() => auditSuzuka(P, T), plan:P }; }catch(e){}
  },

  frame(S, G){
    const t = S.clock || 0, dt = this._t == null ? 0 : clamp(t - this._t, 0, 0.1); this._t = t;
    this.U.time.value = t;
    // in the wet the grass, the verges and the leaves go darker (weather.js says how wet it looks)
    const wv = G.wetVis || 0;
    if(this.groundMat) this.groundMat.color.setScalar(1 - wv * 0.26);
    if(this.vergeMat) this.vergeMat.color.setScalar(1 - wv * 0.26);
    if(this.mat) this.mat.color.setScalar(1 - wv * 0.14);
    const W = this.wh;
    if(W){
      W.a += dt * TAU / 300;
      W.rot.rotation.z = W.a;
      for(let k = 0; k < W.n; k++){
        const a = W.a + k / W.n * TAU;
        W.m.makeTranslation(Math.cos(a) * W.r, W.hubY + Math.sin(a) * W.r - 1.4, (k % 2 ? 0.4 : -0.4));
        W.gon.setMatrixAt(k, W.m);
      }
      W.gon.instanceMatrix.needsUpdate = true;
    }
    const PT = this.pt, p = S.player;
    if(PT && p){
      // which groves are near the car: refreshed every second
      if(t - PT.tNear > 1 || t < PT.tNear){
        PT.tNear = t;
        PT.near = this.P.groves.map((q, i) => [Math.hypot(q.x - p.x, q.y - p.y), i]).sort((a, b) => a[0] - b[0]).slice(0, 14).filter(e => e[0] < 320).map(e => e[1]);
      }
      const pos = PT.pos, G2 = this.P.groves, wx = Math.cos(WIND), wy = Math.sin(WIND);
      for(let k = 0; k < PT.st.length; k++){
        const s = PT.st[k];
        s.t += dt;
        if(s.gi < 0 || s.t > s.life){
          if(!PT.near.length){ pos[k * 3 + 1] = -9999; s.gi = -1; continue; }
          s.gi = PT.near[Math.floor(Math.random() * PT.near.length)]; s.t = 0; s.life = 5 + Math.random() * 4;
          const q = G2[s.gi], a = Math.random() * TAU, d = Math.sqrt(Math.random()) * q.r; s.ox = Math.cos(a) * d; s.oy = Math.sin(a) * d;
        }
        const q = G2[s.gi], f = s.t / s.life, drift = s.t * 1.6;
        pos[k * 3] = q.x + s.ox + wx * drift + Math.sin(t * 2.1 + s.ph) * 0.6;
        pos[k * 3 + 1] = q.z + 2 - f * (q.z - this.P.height(q.x, q.y) + 2) + Math.sin(t * 3.3 + s.ph) * 0.25;
        pos[k * 3 + 2] = q.y + s.oy + wy * drift + Math.cos(t * 1.7 + s.ph) * 0.6;
      }
      PT.pts.geometry.attributes.position.needsUpdate = true;
    }
  },
};

export { SUZUKA };
