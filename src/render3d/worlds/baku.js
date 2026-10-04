import * as THREE from 'three';
import { TAU, clamp } from '../../config/util.js';
import { CFG } from '../../config/settings.js';
import { planBaku, auditBaku, SEA_Y, SEABED } from './baku-plan.js';
import * as K from './cota-kit.js';
import * as N from './singapore-kit.js';
import * as B from './baku-kit.js';

const { L, shadeC, fh, sst, Mesher } = K;
const WIND = 1.0;                                    // the north-east wind of race day: toward the south-west
const CROWD = ["#E8402E", "#2E7AE8", "#F2C230", "#F4F2EC", "#2EAA6A", "#E8742A", "#8A4AD8", "#E8509C", "#18B8C8", "#3AA860"];

/* ---------- Baku: the Caspian, the old walls, the sandstone city ---------------------------
   The circuit stays what the track definition says. Around it this builds the Caspian along the seafront half of the lap
   (turquoise, sparkling, with boats, a pier and gulls), a boulevard of lawns, palms and fountains, the Old City wall and
   towers beside the castle section, sandstone streets, concrete slabs and glass towers behind, a few landmarks with generic
   shapes (a stout round tower, a long symmetric government building, a carpet-shaped museum, a white wave, three flame-shaped
   towers), stands with scaffold and fans, flags in the north-east wind, kites over the boulevard, and a sunny sky. Repeated
   things are instanced; static structures are merged per 300 m square. Nothing is built where it would hide the road from the
   fixed overhead lens (the plan's `maxH`); the cutaway shader dissolves whatever still stands in the way of the car.       */

function instMat(mode, U){
  const m = new THREE.MeshLambertMaterial({ vertexColors:true });
  const body = { sway:`vec3 sIp = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  float sSw = (sin(uTime * 1.3 + sIp.x * 0.05 + sIp.z * 0.07) * 0.6 + sin(uTime * 2.6 + sIp.x * 0.11) * 0.3) * 0.014 * max(position.y - 0.3, 0.0);
  transformed.x += sSw * ${Math.cos(WIND).toFixed(3)}; transformed.z += sSw * ${Math.sin(WIND).toFixed(3)};`,
    wave:`vec3 sIp = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  float ph = sIp.x * 0.37 + sIp.z * 0.51;
  transformed.x += sin(uTime * 6.0 + ph) * 0.22 * arm; transformed.y += (1.0 - cos(uTime * 6.0 + ph)) * 0.03 * arm;`,
    flag:`vec3 sIp = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  float ph = sIp.x * 0.13 + sIp.z * 0.17;
  float fx = max(position.x, 0.0);
  transformed.y += sin(position.x * 7.0 - uTime * 8.0 + ph) * 0.08 * fx;
  transformed.z += cos(position.x * 6.0 - uTime * 7.0 + ph) * 0.06 * fx;`,
    flap:`vec3 sIp = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  float ph = sIp.x * 0.21 + sIp.z * 0.31;
  transformed.y += sin(uTime * 7.0 + ph) * 0.42 * arm;`, plain:"" }[mode];
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = U;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float tintMask;\n" + (mode === "wave" || mode === "flag" || mode === "flap" ? "attribute float arm;\n" : "") + "uniform float uTime;")
      .replace("#include <color_vertex>", `vColor = vec3(1.0);
#ifdef USE_COLOR
  vColor *= color;
#endif
#ifdef USE_INSTANCING_COLOR
  vColor *= mix(vec3(1.0), instanceColor.xyz, tintMask);
#endif`)
      .replace("#include <begin_vertex>", "#include <begin_vertex>\n#ifdef USE_INSTANCING\n  " + body + "\n#endif");
  };
  m.side = mode === "flag" || mode === "flap" ? THREE.DoubleSide : THREE.FrontSide;
  m.customProgramCacheKey = () => "bku_" + mode;
  return m;
}
function instance(g, geo, mat, list, cast, C){
  if(!list.length) return 0;
  if(!geo.boundingSphere) geo.computeBoundingSphere();
  const r0 = geo.boundingSphere.radius + geo.boundingSphere.center.length(), groups = new Map();
  for(const it of list){ const k = Math.floor(it.x / C) + "," + Math.floor(it.y / C); let a = groups.get(k); if(!a){ a = []; groups.set(k, a); } a.push(it); }
  const pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), M = new THREE.Matrix4(), tint = new THREE.Color();
  let made = 0;
  for(const items of groups.values()){
    const gg = new THREE.BufferGeometry(); for(const name in geo.attributes) gg.setAttribute(name, geo.attributes[name]);
    const im = new THREE.InstancedMesh(gg, mat, items.length);
    let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9, smax = 0;
    items.forEach((it, i) => {
      pos.set(it.x, it.z, it.y); q.setFromAxisAngle(up, it.ry || 0);
      if(it.sx) sc.set(it.sx, it.sy, it.sz); else { const s = it.h * (it.w || 1); sc.set(s, it.h, s); }
      M.compose(pos, q, sc); im.setMatrixAt(i, M);
      const t = it.tint; if(typeof t === "string") tint.set(t).convertSRGBToLinear(); else if(t) tint.setRGB(t[0], t[1], t[2]); else tint.setRGB(1, 1, 1);
      im.setColorAt(i, tint);
      x0 = Math.min(x0, it.x); x1 = Math.max(x1, it.x); z0 = Math.min(z0, it.y); z1 = Math.max(z1, it.y); y0 = Math.min(y0, it.z); y1 = Math.max(y1, it.z);
      smax = Math.max(smax, sc.x, sc.y, sc.z);
    });
    gg.boundingSphere = new THREE.Sphere(new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 + r0 * smax + 2);
    im.instanceMatrix.needsUpdate = true; if(im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = !!cast; im.receiveShadow = true; im.userData.dynamic = true; g.add(im); made++;
  }
  return made;
}

const BAKU = {
  U:{ value:0 },

  /* ---- the ground, and the sea: a turquoise sheet with glints, carried out past the grid so it runs to the horizon ---- */
  ground(g, P){
    const { X0, Y0, STEP, NX, NY, H, COL, WATER } = P.grid, TILE = 48, mat = new THREE.MeshLambertMaterial({ vertexColors:true }), c = new THREE.Color();
    this.groundMat = mat; let tiles = 0;
    for(let r0 = 0; r0 < NY - 1; r0 += TILE) for(let c0 = 0; c0 < NX - 1; c0 += TILE){
      const r1 = Math.min(NY - 1, r0 + TILE), c1 = Math.min(NX - 1, c0 + TILE), w = c1 - c0 + 1, h = r1 - r0 + 1;
      const pos = new Float32Array(w * h * 3), col = new Float32Array(w * h * 3), idx = [];
      for(let r = r0; r <= r1; r++) for(let cc = c0; cc <= c1; cc++){
        const k = r * NX + cc, v = (r - r0) * w + (cc - c0);
        pos[v * 3] = X0 + cc * STEP; pos[v * 3 + 1] = H[k]; pos[v * 3 + 2] = Y0 + r * STEP;
        c.setRGB(COL[k * 3], COL[k * 3 + 1], COL[k * 3 + 2]).convertSRGBToLinear(); col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b;
      }
      for(let r = 0; r < h - 1; r++) for(let cc = 0; cc < w - 1; cc++){ const a = r * w + cc, b = a + 1, d = a + w, e = d + 1; idx.push(a, d, b, b, d, e); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      geo.setIndex(idx); geo.computeVertexNormals(); geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; m.userData.dynamic = true; g.add(m); tiles++;
    }
    // the sea: every cell with water in or next to it, and a skirt running out from each border cell that is sea
    const pos = [], uv = [], FAR = 5000;
    const quad = (x, y, w, h) => { for(const [a, b] of [[0, 0], [0, 1], [1, 0], [1, 0], [0, 1], [1, 1]]){ pos.push(x + a * w, SEA_Y, y + b * h); uv.push((x + a * w) / 46, (y + b * h) / 46); } };
    for(let r = 0; r < NY - 1; r++) for(let cc = 0; cc < NX - 1; cc++){
      const k = r * NX + cc; if(!(WATER[k] || WATER[k + 1] || WATER[k + NX] || WATER[k + NX + 1])) continue;
      const x = X0 + cc * STEP, y = Y0 + r * STEP; quad(x, y, STEP, STEP);
      if(cc === 0 && WATER[k]) quad(x - FAR, y, FAR, STEP); if(cc === NX - 2 && WATER[k + 1]) quad(x + STEP, y, FAR, STEP);
      if(r === 0 && WATER[k]) quad(x, y - FAR, STEP, FAR); if(r === NY - 2 && WATER[k + NX]) quad(x, y + STEP, STEP, FAR);
    }
    const wg = new THREE.BufferGeometry(); wg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); wg.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); wg.computeVertexNormals(); wg.computeBoundingSphere();
    const wm = new THREE.Mesh(wg, new THREE.MeshPhongMaterial({ color:L("#2E8EAE"), shininess:90, specular:new THREE.Color(0.55, 0.62, 0.7), transparent:true, opacity:0.92, depthWrite:false }));
    wm.renderOrder = 2; wm.userData.dynamic = true; g.add(wm);
    // sun glitter: bright flecks that crawl across the water
    const cv = document.createElement("canvas"); cv.width = 256; cv.height = 256; const cx = cv.getContext("2d"); let a = 17;
    const rr = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
    for(let k = 0; k < 230; k++){ const x = rr() * 256, y = rr() * 256, w = 3 + rr() * 16; cx.fillStyle = "rgba(255,255,255," + (0.25 + rr() * 0.6) + ")"; cx.fillRect(x, y, w, 1 + rr() * 1.4); }
    for(let k = 0; k < 40; k++){ const x = rr() * 256, y = rr() * 256; cx.fillStyle = "rgba(255,250,220,0.8)"; cx.fillRect(x, y, 2, 2); }
    const gt = new THREE.CanvasTexture(cv); gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.encoding = THREE.sRGBEncoding; this.glintTex = gt;
    const gm = new THREE.Mesh(wg, new THREE.MeshBasicMaterial({ map:gt, transparent:true, opacity:0.6, blending:THREE.AdditiveBlending, depthWrite:false, fog:true }));
    gm.position.y = 0.05; gm.renderOrder = 3; gm.userData.dynamic = true; g.add(gm);
    return tiles;
  },

  /* ---- the city, the old walls, the landmarks: merged ---- */
  city(g, P, T){
    const S = P.structs, TW = new N.Town(320), beacons = [], tex = B.dayTextures();
    const lam = map => new THREE.MeshLambertMaterial({ map, vertexColors:true });
    const mats = { grid:lam(tex.grid), band:lam(tex.band), slim:lam(tex.slim), solid:new THREE.MeshLambertMaterial({ vertexColors:true, side:THREE.DoubleSide }), bright:new THREE.MeshBasicMaterial({ vertexColors:true, side:THREE.DoubleSide, toneMapped:true }) };
    this.cityMats = mats;
    for(const b of S.buildings) B.building(TW, b, beacons);
    B.cityWall(TW, S.walls, S.towers);
    if(S.maiden) B.maiden(TW, S.maiden);
    if(S.govhouse) B.govHouse(TW, S.govhouse);
    if(S.carpet) B.carpet(TW, S.carpet);
    if(S.wave) B.wave(TW, S.wave);
    if(S.flame){ S.flame.base = Math.max(P.height(S.flame.x, S.flame.y), 0); B.flame(TW, S.flame, beacons); }
    this.beacons = beacons;
    const st = { tris:TW.tris }; st.meshes = TW.emit(g, mats, true);
    return st;
  },

  /* ---- the circuit's own structures: stands (scaffold, fencing), the pit building, footbridges, TV towers, flags, stalls, the pier ---- */
  structures(g, P, T){
    const S = P.structs, n = T.n, TW = new N.Town(300), at = P.at, ht = P.height, st = {};
    const pt = (i, side, off, z) => { const a = at(i, side, off); return [a[0], a[1], z]; };
    const WALL = "#9A927E";
    for(const s of S.stands){
      if(s.wet) continue;
      const { i0, span, side, off0, rows, rowD, rowH, depth } = s, seat = s.col;
      const tread = r => (r & 1 ? shadeC(seat, -0.08) : L(seat)), riser = shadeC(seat, -0.4), aisle = shadeC(seat, 0.3);
      const zb = []; for(let k = 0; k <= span; k++){ const i = (i0 + k) % n, a = at(i, side, off0), b = at(i, side, off0 + depth); zb.push(Math.max(ht(a[0], a[1]), ht(b[0], b[1]), T.z[i] - 0.5) + 0.12); }
      s.zb = zb;
      for(let k = 0; k < span; k++){
        const ia = (i0 + k) % n, ib = (i0 + k + 1) % n, m = TW.get("solid", ...at(ia, side, off0 + depth / 2)), za = zb[k], zn = zb[k + 1], isA = k % 9 === 0;
        for(let r = 0; r < rows; r++){
          const oa = off0 + r * rowD, ob = oa + rowD, ta = za + (r + 1) * rowH, tb = zn + (r + 1) * rowH, lo = r === 0 ? 2.5 : 0;
          m.quad(pt(ia, side, oa, ta), pt(ia, side, ob, ta), pt(ib, side, ob, tb), pt(ib, side, oa, tb), isA ? aisle : tread(r));
          m.quad(pt(ia, side, oa, ta - rowH - lo), pt(ib, side, oa, tb - rowH - lo), pt(ib, side, oa, tb), pt(ia, side, oa, ta), riser);
        }
        m.quad(pt(ia, side, off0 + depth, za + rows * rowH), pt(ib, side, off0 + depth, zn + rows * rowH), pt(ib, side, off0 + depth, zn - 3), pt(ia, side, off0 + depth, za - 3), L(WALL));
        if(k % 3 === 0){ const bk = pt(ia, side, off0 + depth + 0.4, 0), top = za + rows * rowH + 2.4, bot = za - 0.2, nx3 = pt((ia + 3) % n, side, off0 + depth + 0.4, 0);
          m.pole(bk[0], bk[1], bot, bk[0], bk[1], top, 0.1, L("#8A8EA0"));
          for(const f of [0.35, 0.7]){ const z = bot + (top - bot) * f; m.pole(bk[0], bk[1], z, nx3[0], nx3[1], z, 0.06, L("#8A8EA0")); }
          m.pole(bk[0], bk[1], bot, nx3[0], nx3[1], top * 0.7 + bot * 0.3, 0.05, L("#8A8EA0")); }
      }
      for(const k of [0, span]){ const i = (i0 + k) % n, m = TW.get("solid", ...at(i, side, off0 + depth / 2));
        for(let r = 0; r < rows; r++){ const oa = off0 + r * rowD, ob = oa + rowD, t = zb[k] + (r + 1) * rowH; m.quad(pt(i, side, oa, zb[k] - 3), pt(i, side, ob, zb[k] - 3), pt(i, side, ob, t), pt(i, side, oa, t), L(WALL)); } }
      if(s.roof){
        const top = rows * rowH + 4.4;
        for(let k = 0; k < span; k++){
          const ia = (i0 + k) % n, ib = (i0 + k + 1) % n, m = TW.get("solid", ...at(ia, side, off0 + depth / 2)), za = zb[k] + top, zn = zb[k + 1] + top, f0 = off0 - 2.5, f1 = off0 + depth + 2.5;
          m.quad(pt(ia, side, f0, za), pt(ib, side, f0, zn), pt(ib, side, f1, zn + 0.8), pt(ia, side, f1, za + 0.8), L("#F2EEE4"));
          m.quad(pt(ia, side, f0, za - 0.5), pt(ib, side, f0, zn - 0.5), pt(ib, side, f1, zn + 0.3), pt(ia, side, f1, za + 0.3), shadeC("#F2EEE4", -0.35));
          m.quad(pt(ia, side, f0, za - 0.5), pt(ib, side, f0, zn - 0.5), pt(ib, side, f0, zn + 0.45), pt(ia, side, f0, za + 0.45), (k >> 1) & 1 ? L(seat) : shadeC(seat, 0.5));
          if(k % 5 === 0){ const fa = at(ia, side, f0 + 1.2); m.pole(fa[0], fa[1], zb[k] - 0.5, fa[0], fa[1], za - 0.5, 0.18, L("#8A8E9A")); }
        }
      }
      for(let k = 0; k < span; k++){      // catch fencing
        const ia = (i0 + k) % n, ib = (i0 + k + 1) % n, oa = P.edge(ia, side) + 1.0, ob = P.edge(ib, side) + 1.0, m = TW.get("solid", ...at(ia, side, oa));
        const A = at(ia, side, oa), Bq = at(ib, side, ob), za = ht(A[0], A[1]), zn = ht(Bq[0], Bq[1]), C = L("#7A7E8C");
        for(const hh of [1.4, 2.9, 4.4]) m.quad([A[0], A[1], za + hh], [Bq[0], Bq[1], zn + hh], [Bq[0], Bq[1], zn + hh + 0.12], [A[0], A[1], za + hh + 0.12], C);
        if(k % 3 === 0) m.pole(A[0], A[1], za - 0.2, A[0], A[1], za + 4.6, 0.09, C);
      }
    }
    /* the pit building */
    { const pb = S.pit, { i0, span, side, off0 } = pb, D0 = off0, D1 = off0 + pb.depth;
      for(let k = 0; k < span; k++){
        const ia = (i0 + k) % n, ib = (i0 + k + 1) % n, za = T.z[ia] - 0.5, zn = T.z[ib] - 0.5, Fm = TW.get("band", ...at(ia, side, D0)), Sm = TW.get("solid", ...at(ia, side, D0));
        const u0 = k * T.ds / 3.4 / 8, u1 = (k + 1) * T.ds / 3.4 / 8, tint = new THREE.Color(0.9, 1.0, 1.05);
        Sm.quad(pt(ia, side, D0, za), pt(ib, side, D0, zn), pt(ib, side, D0, zn + 1.1), pt(ia, side, D0, za + 1.1), L("#8A8676"));
        Fm.quadUV(pt(ia, side, D0, za + 1.1), pt(ib, side, D0, zn + 1.1), pt(ib, side, D0, zn + 5.4), pt(ia, side, D0, za + 5.4), tint, u0, 0.1, u1, 0.1 + 4.3 / 3.8 / 8);
        Sm.quad(pt(ia, side, D0 - 3.4, za + 5.1), pt(ib, side, D0 - 3.4, zn + 5.1), pt(ib, side, D0, zn + 5.7), pt(ia, side, D0, za + 5.7), (k >> 1) & 1 ? L("#C8442A") : L("#F4F0E8"));   // the striped awning
        Sm.quad(pt(ia, side, D0, za + 5.4), pt(ib, side, D0, zn + 5.4), pt(ib, side, D0 + 3.5, zn + 5.4), pt(ia, side, D0 + 3.5, za + 5.4), L("#B8B2A0"));
        Fm.quadUV(pt(ia, side, D0 + 3.5, za + 5.7), pt(ib, side, D0 + 3.5, zn + 5.7), pt(ib, side, D0 + 3.5, zn + 10), pt(ia, side, D0 + 3.5, za + 10), tint.clone().multiplyScalar(0.95), u0 + 0.2, 0.5, u1 + 0.2, 0.5 + 4.3 / 3.8 / 8);
        Sm.quad(pt(ia, side, D0 + 3.5, za + 10), pt(ib, side, D0 + 3.5, zn + 10), pt(ib, side, D1, zn + 10), pt(ia, side, D1, za + 10), L("#C8C2B0"));
        Sm.quad(pt(ia, side, D1, za + 10), pt(ib, side, D1, zn + 10), pt(ib, side, D1, zn - 1), pt(ia, side, D1, za - 1), L("#B8B2A0"));
      }
      { const i = (i0 + (span >> 1)) % n, [x, y] = at(i, side, D0 + 10), z = T.z[i] - 0.5, a = T.ang[i];
        N.shaft(TW, x, y, a, 12, 12, z, z + 24, "band", [1.0, 1.05, 1.1], 91, "#8A9AA8"); TW.get("solid", x, y).pole(x, y, z + 24.5, x, y, z + 34, 0.3, L("#9A9EA6")); }
    }
    /* footbridges */
    for(const f of S.footbridges){
      const m = TW.get("solid", f.pl[0], f.pl[1]), dx = f.pr[0] - f.pl[0], dy = f.pr[1] - f.pl[1], L2 = Math.hypot(dx, dy), a = Math.atan2(dy, dx), mx = (f.pl[0] + f.pr[0]) / 2, my = (f.pl[1] + f.pr[1]) / 2, zD = f.z + 5.8;
      m.box(mx, my, zD, L2 + 4, 3.2, 0.55, a, L("#B8B4A8"), L("#9A968A"));
      for(const sd of [-1, 1]){ const ox = -Math.sin(a) * 1.5 * sd, oy = Math.cos(a) * 1.5 * sd; m.box(mx + ox, my + oy, zD + 0.55, L2 + 4, 0.12, 1.1, a, L("#9A968A"));
        for(let k = 0; k < 12; k++){ const t0 = k / 12, t1 = (k + 1) / 12, e = (t) => [f.pl[0] + dx * t + ox, f.pl[1] + dy * t + oy, zD + 1.6 + 2.2 * Math.sin(t * Math.PI)], A = e(t0), Bq = e(t1); m.pole(A[0], A[1], A[2], Bq[0], Bq[1], Bq[2], 0.1, L("#E4DCC6")); if(k % 2 === 0) m.pole(A[0], A[1], zD + 0.6, A[0], A[1], A[2], 0.05, L("#C8C0A8")); } }
      for(const end of [f.pl, f.pr]) for(const sd of [-1, 1]){ const px = end[0] - Math.sin(a) * 1.3 * sd, py = end[1] + Math.cos(a) * 1.3 * sd; m.box(px, py, f.z - 0.4, 0.9, 0.9, 6.3, a, L("#9A968A")); }
    }
    /* TV towers, flag poles, stalls */
    for(const t of S.tv){
      const m = TW.get("solid", t.x, t.y), s0 = 1.15, s1 = 0.9, z = t.z - 0.3, h = t.h, c = L("#8A9098"), ca = Math.cos(t.ang), sa = Math.sin(t.ang), corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      const w = (l, q, sc) => [t.x + ca * l * sc - sa * q * sc, t.y + sa * l * sc + ca * q * sc];
      corners.forEach(([l, q], k) => { const a = w(l, q, s0), b = w(l, q, s1); m.pole(a[0], a[1], z, b[0], b[1], z + h, 0.1, c); const [l2, q2] = corners[(k + 1) % 4]; for(const f of [0.4, 0.75]){ const aa = w(l, q, s0 + (s1 - s0) * f), bb = w(l2, q2, s0 + (s1 - s0) * (f + 0.25)); m.pole(aa[0], aa[1], z + h * f, bb[0], bb[1], z + h * (f + 0.25), 0.05, c); } });
      m.box(t.x, t.y, z + h, 3.2, 3.2, 0.3, t.ang, L("#C8C8D0")); m.box(t.x, t.y, z + h + 0.3, 3.1, 3.1, 0.8, t.ang, L("#2A2E36")); m.box(t.x, t.y, z + h + 2.6, 3.4, 3.4, 0.25, t.ang, L("#E8E6E0"));
    }
    for(const p of S.flagPoles) TW.get("solid", p.x, p.y).pole(p.x, p.y, p.z - 0.3, p.x, p.y, p.z + p.h, 0.09, L("#E6E6EE"));
    for(const q of S.stalls){
      const m = TW.get("solid", q.x, q.y), col = ["#C8442A", "#2E6AB8", "#E8B030", "#2E9A5A", "#D8742A"][q.c % 5], ca = Math.cos(q.ang), sa = Math.sin(q.ang);
      m.box(q.x, q.y, q.z - 0.2, 6, 3, 1.1, q.ang, L("#9A8E78"), L("#E8E0D0"));
      for(const sx of [-1, 1]) for(const sy of [-1, 1]){ const px = q.x + ca * sx * 2.8 - sa * sy * 1.4, py = q.y + sa * sx * 2.8 + ca * sy * 1.4; m.pole(px, py, q.z - 0.2, px, py, q.z + 2.8, 0.06, L("#B8BCCC")); }
      m.gable(q.x, q.y, q.z + 2.8, 7, 4.2, 1.1, q.ang, L(col));
    }
    /* the pier: planks on piles running out over the sea, with a lamp at the end and yachts moored along it */
    if(S.pier){
      const p = S.pier, m = TW.get("solid", p.x, p.y), ca = Math.cos(p.ang), sa = Math.sin(p.ang), z = Math.max(P.height(p.x, p.y), 0) - 0.15;
      m.box(p.x + ca * p.len / 2, p.y + sa * p.len / 2, SEA_Y + 1.6, p.len, 6, 0.5, p.ang, L("#A88A5E"), L("#B89868"));
      for(let k = 0; k <= p.len; k += 9) for(const sd of [-1, 1]) m.box(p.x + ca * k - sa * sd * 2.6, p.y + sa * k + ca * sd * 2.6, SEABED, 0.7, 0.7, SEA_Y + 1.6 - SEABED, p.ang, L("#6A5A44"));
      for(let k = 6; k < p.len; k += 22) for(const sd of [-1, 1]){ const x = p.x + ca * k - sa * sd * 2.8, y = p.y + sa * k + ca * sd * 2.8; m.pole(x, y, SEA_Y + 2.0, x, y, SEA_Y + 6.5, 0.1, L("#4A4E5A")); m.box(x, y, SEA_Y + 6.5, 0.6, 0.3, 0.3, p.ang, L("#FFF2D0")); }
    }
    /* fountain basins on the boulevard lawn */
    for(const f of S.fountains){ const m = TW.get("solid", f.x, f.y); m.frustum(f.x, f.y, f.z - 0.2, f.z + 0.7, 5.2, 5.0, 14, L("#D8CCB0"), L("#3A9CB8")); m.frustum(f.x, f.y, f.z + 0.7, f.z + 1.4, 1.6, 0.5, 10, L("#D8CCB0"), L("#E8E8E0")); }
    return Object.assign(st, { tris:TW.tris, meshes:TW.emit(g, this.cityMats, true) });
  },

  /* ---- the things that move: the wheel, boats, gulls, kites, fountain spray, clouds ---- */
  features(g, P, T){
    const S = P.structs, anim = this.anim = { t:0 };
    if(S.wheel){
      const w = S.wheel, R = w.r, hub = R + 6, root = new THREE.Group(), z0 = Math.max(w.z, 0);
      root.position.set(w.x, z0, w.y); root.rotation.y = -w.ang;
      const frame = new Mesher(); for(const s of [-1, 1]){ frame.pole(-R * 0.5, s * 2.4, 0, 0, s * 2.4, hub, 0.55, L("#F0F0F4")); frame.pole(R * 0.5, s * 2.4, 0, 0, s * 2.4, hub, 0.55, L("#F0F0F4")); } frame.box(0, 0, 0, 12, 8, 0.8, 0, L("#B8B4A8"));
      root.add(new THREE.Mesh(frame.geometry(), new THREE.MeshLambertMaterial({ vertexColors:true, side:THREE.DoubleSide })));
      const rim = new Mesher(), NS = 40; for(const s of [-2.2, 2.2]) for(let k = 0; k < NS; k++){ const a0 = k / NS * TAU, a1 = (k + 1) / NS * TAU; rim.pole(Math.cos(a0) * R, s, Math.sin(a0) * R, Math.cos(a1) * R, s, Math.sin(a1) * R, 0.28, L("#2E6AB8")); }
      for(let k = 0; k < 14; k++){ const a = k / 14 * TAU; for(const s of [-2.2, 2.2]) rim.pole(0, s, 0, Math.cos(a) * R, s, Math.sin(a) * R, 0.1, L("#E8E8EC")); }
      const wheel = new THREE.Group(); wheel.position.set(0, hub, 0); wheel.add(new THREE.Mesh(rim.geometry(), new THREE.MeshLambertMaterial({ vertexColors:true, side:THREE.DoubleSide }))); root.add(wheel);
      const gon = new THREE.InstancedMesh(new THREE.BoxGeometry(3.6, 2.8, 2.8), new THREE.MeshLambertMaterial({ color:0xFFFFFF }), 20);
      for(let k = 0; k < 20; k++) gon.setColorAt(k, new THREE.Color(["#F4F0E4", "#E8B030", "#E8402E", "#2E7AE8", "#2EAA6A"][k % 5]).convertSRGBToLinear());
      gon.frustumCulled = false; gon.userData.dynamic = true; root.add(gon); g.add(root); anim.wheel = { root, wheel, gon, R, hub, n:20, a:0, m:new THREE.Matrix4() };
    }
    // boats, instanced, drifting; a few moored along the pier stay put
    const V = N.vesselGeos(), im = instMat("plain", this.U), COLS = ["#F4F4F6", "#FFE6B8", "#C8E0FF", "#F4D0C0"];
    const small = S.boats.filter(b => b.kind !== 2), ferries = S.boats.filter(b => b.kind === 2);
    const mk = (geo, cnt) => { const mesh = new THREE.InstancedMesh(geo, instMat("plain", this.U), Math.max(cnt, 1)); mesh.setColorAt(0, new THREE.Color(1, 1, 1)); mesh.frustumCulled = false; mesh.userData.dynamic = true; g.add(mesh); return mesh; };
    anim.boatsSmall = { mesh:mk(V.boat, small.length), list:small, scale:1.1 }; anim.boatsFerry = { mesh:mk(V.ferry, ferries.length), list:ferries, scale:1.0 };
    for(const o of [anim.boatsSmall, anim.boatsFerry]) o.list.forEach((b, i) => o.mesh.setColorAt(i, new THREE.Color(COLS[b.c % 4]).convertSRGBToLinear()));
    if(S.pier){ const p = S.pier, ca = Math.cos(p.ang), sa = Math.sin(p.ang), moored = []; for(let k = 12; k < p.len - 8; k += 17) for(const sd of [-1, 1]) if(((k * 7 + sd) | 0) % 3) moored.push({ x:p.x + ca * k - sa * sd * 7.5, y:p.y + sa * k + ca * sd * 7.5, z:SEA_Y + 0.05, ry:-p.ang, h:1.1, w:1, tint:COLS[(k + sd + 8) % 4] });
      instance(g, V.boat, instMat("plain", this.U), moored, false, 400); }
    // gulls, wheeling over the shore
    const gl = new THREE.InstancedMesh(B.gullGeo(), instMat("flap", this.U), Math.max(S.gulls.length, 1)); gl.frustumCulled = false; gl.userData.dynamic = true; g.add(gl);
    for(let i = 0; i < S.gulls.length; i++) gl.setColorAt(i, new THREE.Color(1, 1, 1)); anim.gulls = { mesh:gl, list:S.gulls };
    // kites over the boulevard
    { const ks = []; const lw = S.lawns[0]; if(lw) for(let k = 0; k < 8; k++){ const a = (k / 8 - 0.5) * lw.w * 0.9, b = (fh(k * 3) - 0.5) * lw.d; ks.push({ cx:lw.x + Math.cos(lw.ang) * a - Math.sin(lw.ang) * b, cy:lw.y + Math.sin(lw.ang) * a + Math.cos(lw.ang) * b, h:32 + fh(k * 5) * 38, ph:k * 1.7 }); }
      const km = new THREE.InstancedMesh(B.kiteGeo(), instMat("plain", this.U), Math.max(ks.length, 1)); km.frustumCulled = false; km.userData.dynamic = true; g.add(km);
      ks.forEach((q, i) => km.setColorAt(i, new THREE.Color(["#E8402E", "#2E7AE8", "#F2C230", "#2EAA6A", "#E8509C"][i % 5]).convertSRGBToLinear())); anim.kites = { mesh:km, list:ks }; }
    // fountain spray: points that rise and fall on arcs
    if(S.fountains.length){ const NP = S.fountains.length * 36, pg = new THREE.BufferGeometry(), pos = new Float32Array(NP * 3); pg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const pts = new THREE.Points(pg, new THREE.PointsMaterial({ color:0xE8F8FF, size:4, sizeAttenuation:false, transparent:true, opacity:0.85, depthWrite:false })); pts.frustumCulled = false; pts.userData.dynamic = true; g.add(pts); anim.spray = { pts, pos, list:S.fountains }; }
    anim.cx = T.bounds.minX + T.bounds.w / 2; anim.cy = T.bounds.minY + T.bounds.h / 2;
  },

  /* ---- a sunny sky: pale haze at the horizon, a warm sun glow, a few clouds ---- */
  sky(g, T){
    const geo = new THREE.SphereGeometry(4200, 28, 16), p = geo.attributes.position, col = new Float32Array(p.count * 3);
    const top = L("#3C8AD4"), mid = L("#7EB8E8"), hor = L("#E8F0F2"), c = new THREE.Color();
    for(let v = 0; v < p.count; v++){ const e = p.getY(v) / 4200; if(e > 0.12) c.copy(mid).lerp(top, sst(0.12, 0.9, e)); else c.copy(hor).lerp(mid, sst(0.0, 0.12, e)); if(e < 0) c.copy(hor); col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b; }
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const dome = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors:true, side:THREE.BackSide, fog:false, depthWrite:false })); const b = T.bounds;
    dome.position.set(b.minX + b.w / 2, 0, b.minY + b.h / 2); dome.renderOrder = -10; dome.frustumCulled = false; dome.userData.dynamic = true; g.add(dome); this.dome = dome;
    // the sun: a warm glow sprite in its own direction
    { const sa = T.sun == null ? 0.9 : T.sun, cv = document.createElement("canvas"); cv.width = cv.height = 128; const c2 = cv.getContext("2d"), gr = c2.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, "rgba(255,250,225,1)"); gr.addColorStop(0.15, "rgba(255,240,200,0.8)"); gr.addColorStop(0.5, "rgba(255,225,170,0.18)"); gr.addColorStop(1, "rgba(255,220,160,0)"); c2.fillStyle = gr; c2.fillRect(0, 0, 128, 128);
      const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map:t, transparent:true, depthWrite:false, fog:false, blending:THREE.AdditiveBlending }));
      sp.scale.setScalar(900); sp.position.set(dome.position.x + Math.cos(sa) * 3300, 1900, dome.position.z + Math.sin(sa) * 3300); sp.frustumCulled = false; sp.renderOrder = -9; sp.userData.dynamic = true; g.add(sp); }
    // clouds
    { const cg = new THREE.IcosahedronGeometry(1, 1), cm = new THREE.MeshBasicMaterial({ color:0xFFFFFF, transparent:true, opacity:0.9, fog:false, depthWrite:false }), cl = new THREE.InstancedMesh(cg, cm, 48), M4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(); let a = 91; const r = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
      for(let k = 0; k < 16; k++){ const cx = (r() - 0.5) * 5600, cz = (r() - 0.5) * 5600, cy = 1000 + r() * 500; for(let j = 0; j < 3; j++){ ps.set(cx + (j - 1) * 150 + r() * 60, cy + r() * 20, cz + (r() - 0.5) * 90); sc.set(190 + r() * 110, 36 + r() * 16, 100 + r() * 50); M4.compose(ps, q, sc); cl.setMatrixAt(k * 3 + j, M4); } }
      cl.instanceMatrix.needsUpdate = true; cl.frustumCulled = false; cl.renderOrder = -8; cl.userData.dynamic = true; cl.position.set(dome.position.x, 0, dome.position.z); g.add(cl); this.clouds = cl; }
  },

  build(G, world, T, S){
    const t0 = performance.now(), tm = {}, stats = this.stats = {};
    const step = (k, fn) => { const a = performance.now(); try{ fn(); }catch(e){ console.warn("baku " + k, e.message, e.stack); } tm[k] = Math.round(performance.now() - a); };
    const g = new THREE.Group(); world.add(g); this.root = g; this.T = T;
    let P; step("plan", () => { P = planBaku(T, { detail:CFG.detail }); });
    if(!P) return;
    this.P = P; this.anim = null;
    step("ground", () => { stats.tiles = this.ground(g, P); });
    step("city", () => { stats.city = this.city(g, P, T); });
    step("structures", () => { stats.structs = this.structures(g, P, T); });
    const GE = Object.assign(B.plantGeos(), N.lampGeos(), { car:K.carGeo(), person:K.personGeo(false, null), personW:K.personGeo(true, null), flag:K.flagGeo(), tyres:N.tyreGeo() });
    const sway = instMat("sway", this.U), plain = instMat("plain", this.U), wave = instMat("wave", this.U), flagM = instMat("flag", this.U);
    step("instances", () => {
      const tint = () => [0.85 + Math.random() * 0.3, 0.9 + Math.random() * 0.2, 0.85 + Math.random() * 0.3], near = (x, y) => P.clearance(x, y) < 170;
      const SS = P.structs; let c = 0;
      const trees = SS.trees.map(t => ({ ...t, tint:tint() })), pines = SS.pines.map(t => ({ ...t, tint:tint() }));
      c += instance(g, GE.tree, sway, trees.filter(t => near(t.x, t.y)), true, 300); c += instance(g, GE.treeFar, sway, trees.filter(t => !near(t.x, t.y)), false, 500);
      c += instance(g, GE.pine, sway, pines.filter(t => near(t.x, t.y)), true, 300); c += instance(g, GE.pineFar, sway, pines.filter(t => !near(t.x, t.y)), false, 500);
      c += instance(g, GE.palm, sway, SS.palms.map(t => ({ ...t, tint:tint() })), true, 300);
      c += instance(g, GE.planter, plain, SS.planters.map(p => ({ x:p.x, y:p.y, z:p.z, ry:-p.ang, sx:1, sy:1, sz:1 })), false, 400);
      c += instance(g, GE.lamp, plain, SS.lamps.map(l => ({ x:l.x, y:l.y, z:l.z, ry:-l.ang, h:1, w:1 })), false, 400);
      c += instance(g, GE.car, plain, SS.cars.map((q, k) => ({ x:q.x, y:q.y, z:q.z + 0.05, ry:-q.ry, sx:4.2, sy:2.0, sz:4.3, tint:["#C8C8CC", "#222428", "#8A1E1E", "#2E4E8A", "#D8D8D0", "#5A5E66", "#1E5A3A", "#E8E4D8"][k % 8] })), false, 400);
      c += instance(g, GE.tyres, plain, SS.tyres.map(q => ({ x:q.x, y:q.y, z:q.z, ry:q.c * 0.7, h:1, w:1 })), false, 400);
      stats.instChunks = c;
      const R2 = (() => { let a = 4711; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; })(), sp = CFG.detail === 0 ? 2.6 : 1.9, list = [], wv = [];
      for(const s of SS.stands){
        if(!s.zb) continue;
        for(let r = 1; r < s.rows; r += 2) for(let k = 0; k < s.span; k++){
          if(k % 9 === 0) continue;
          const ia = (s.i0 + k) % T.n, ib = (s.i0 + k + 1) % T.n, o = s.off0 + r * s.rowD + s.rowD * 0.5;
          for(let q = 0; q < T.ds; q += sp){
            if(R2() > s.fill) continue; const t = q / T.ds, pa = P.at(ia, s.side, o), pb = P.at(ib, s.side, o), z = s.zb[k] + (r + 1) * s.rowH + (s.zb[k + 1] - s.zb[k]) * t;
            (R2() < 0.15 ? wv : list).push({ x:pa[0] + (pb[0] - pa[0]) * t, y:pa[1] + (pb[1] - pa[1]) * t, z, ry:-Math.atan2(-s.side * T.ny[ia], -s.side * T.nx[ia]) + Math.PI / 2 + (R2() - 0.5) * 0.5, h:1.95 + R2() * 0.25, w:1, tint:CROWD[(R2() * CROWD.length) | 0] });
          }
        }
      }
      // walkers on the boulevard, and fans on the footbridges
      for(const lw of SS.lawns) for(let k = 0; k < 90 * (CFG.detail === 0 ? 0.5 : 1); k++){ const a = (R2() - 0.5) * lw.w, b = (R2() - 0.5) * lw.d, x = lw.x + Math.cos(lw.ang) * a - Math.sin(lw.ang) * b, y = lw.y + Math.sin(lw.ang) * a + Math.cos(lw.ang) * b; if(!P.isWater(x, y)) (R2() < 0.2 ? wv : list).push({ x, y, z:P.height(x, y), ry:R2() * 6.28, h:1.9, w:1, tint:CROWD[(R2() * CROWD.length) | 0] }); }
      for(const f of SS.footbridges){ const ca = Math.cos(f.ang + Math.PI / 2), sa = Math.sin(f.ang + Math.PI / 2), mx = (f.pl[0] + f.pr[0]) / 2, my = (f.pl[1] + f.pr[1]) / 2;
        for(let a = -f.len / 2 + 2; a < f.len / 2 - 2; a += 2.2) if(R2() < 0.55) (R2() < 0.4 ? wv : list).push({ x:mx + ca * a + Math.cos(f.ang) * (R2() - 0.5) * 1.8, y:my + sa * a + Math.sin(f.ang) * (R2() - 0.5) * 1.8, z:f.z + 6.2, ry:R2() * 6.28, h:2.0, w:1, tint:CROWD[(R2() * CROWD.length) | 0] }); }
      stats.crowd = list.length + wv.length; instance(g, GE.person, wave, list, false, 500); instance(g, GE.personW, wave, wv, false, 500);
      instance(g, GE.flag, flagM, SS.flagPoles.map((p, k) => ({ x:p.x, y:p.y, z:p.z + p.h - 0.35, ry:-WIND, sx:2.4, sy:2.4, sz:2.4, tint:["#E8402E", "#2EAA6A", "#2E7AE8", "#F4F2EC"][k & 3] })), false, 600);
    });
    step("features", () => this.features(g, P, T));
    step("sky", () => this.sky(g, T));
    step("signs", () => { stats.signs = this.signs(g, P, T); });
    step("cut", () => { for(const m of Object.values(this.cityMats)) G.cutMat(m); });
    this.light(G, T);
    tm.total = Math.round(performance.now() - t0); this.timing = tm; Object.assign(stats, { counts:P.stats.counts });
    try{ window.__baku = { stats, timing:tm, audit:() => auditBaku(P, T), plan:P }; }catch(e){}
  },

  signs(g, P, T){
    if(typeof document === "undefined") return 0;
    const S = P.structs, mk = (w, h, draw) => { const cv = document.createElement("canvas"); cv.width = w; cv.height = h; draw(cv.getContext("2d"), w, h);
      const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; return new THREE.MeshBasicMaterial({ map:t, side:THREE.DoubleSide, toneMapped:false }); };
    const font = (px, wg) => (wg || 800) + " " + px + "px 'Saira Condensed',Impact,sans-serif";
    const SCR = [["TEA BREAK", "Back in two laps. Probably.", "#5A1A14", "#FFD890"], ["7.6 METRES", "Please hold your elbows in", "#143A5A", "#9AD8FF"], ["MIND THE DRAIN", "It is bolted down. Honest.", "#1A1D28", "#FFC23A"], ["24 M BELOW", "Sea level. Lowest grid there is.", "#0A3A4A", "#9AF0E0"]];
    const screens = S.screens.map((s, k) => { const [a, b, bg, fg] = SCR[k % SCR.length];
      const mat = mk(512, 288, (c, w, h) => { c.fillStyle = bg; c.fillRect(0, 0, w, h); for(let q = 0; q < 12; q++){ c.fillStyle = "rgba(255,255,255," + (0.03 + (q % 3) * 0.02) + ")"; c.fillRect(0, q * 24, w, 10); }
        c.fillStyle = fg; c.textAlign = "center"; c.font = font(80); c.fillText(a, w / 2, h * 0.5); c.font = font(38, 700); c.fillText(b, w / 2, h * 0.74); c.strokeStyle = fg; c.lineWidth = 8; c.strokeRect(10, 10, w - 20, h - 20); });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(14, 7.9), mat); m.position.set(s.x, s.z + 11.2, s.y); m.rotation.y = Math.PI / 2 - (s.a0 - s.side * Math.PI / 2); m.userData.dynamic = true; g.add(m);
      const pm = new THREE.MeshLambertMaterial({ color:L("#6A6E80") }); for(const q of [-6.4, 6.4]){ const p = new THREE.Mesh(new THREE.BoxGeometry(0.8, 11, 0.8), pm); p.position.set(s.x + Math.cos(s.a0) * q, s.z + 5.5, s.y + Math.sin(s.a0) * q); p.userData.dynamic = true; g.add(p); }
      return m; });
    { const mat = mk(1024, 256, (c, w, h) => { c.fillStyle = "#1C6FC0"; c.fillRect(0, 0, w, h);
        for(let q = 0; q < 6; q++){ c.fillStyle = "rgba(255,255,255,0.16)"; c.beginPath(); c.moveTo(q * 60, h); c.lineTo(q * 60 + 70, 0); c.lineTo(q * 60 + 100, 0); c.lineTo(q * 60 + 30, h); c.fill(); }
        c.fillStyle = "#FFFFFF"; c.textAlign = "center"; c.font = font(150, 900); c.fillText("PADDOCK", w / 2 + 20, h * 0.66);
        c.fillStyle = "#FFD24A"; c.font = font(44, 700); c.fillText("TEAMS · GUESTS · ONE LARGE SAMOVAR", w / 2 + 20, h * 0.92);
        for(let q = 0; q < 32; q++){ c.fillStyle = q & 1 ? "#111" : "#FFF"; c.fillRect(q * 32, 0, 32, 14); c.fillStyle = q & 1 ? "#FFF" : "#111"; c.fillRect(q * 32, 14, 32, 14); } });
      const pb = P.structs.pit, i = pb.i0, side = pb.side, [x, y] = P.at(i, side, T.half + T.pitW + 12), z = T.z[i];
      const m = new THREE.Mesh(new THREE.PlaneGeometry(26, 6.5), mat); m.position.set(x, z + 12.5, y); m.rotation.y = Math.PI / 2 - (T.ang[i] - side * Math.PI / 2); m.userData.dynamic = true; g.add(m);
      const pm = new THREE.MeshLambertMaterial({ color:L("#6A6E80") }); for(const q of [-13, 13]){ const p = new THREE.Mesh(new THREE.BoxGeometry(0.9, 15, 0.9), pm); p.position.set(x + Math.cos(T.ang[i]) * q, z + 7, y + Math.sin(T.ang[i]) * q); p.userData.dynamic = true; g.add(p); } }
    return screens.length + 1;
  },

  light(G, T){
    if(G.sun){ G.sun.color.set(L("#FFF2DC")); }
    G.scene.traverse(o => { if(o.isHemisphereLight && o !== G.envFill){ o.groundColor.copy(L("#B8A888")); } });
  },

  frame(S, G){
    const t = S.clock || 0, dt = this._t == null ? 0 : clamp(t - this._t, 0, 0.1); this._t = t;
    this.U.value = t;
    const A = this.anim; if(!A) return;
    if(this.glintTex) this.glintTex.offset.set(t * 0.010, t * 0.006);
    if(this.clouds) this.clouds.position.x = this.dome.position.x + ((t * 5) % 2400);
    const W = A.wheel;
    if(W){ W.a += dt * TAU / 360; W.wheel.rotation.z = W.a; for(let k = 0; k < W.n; k++){ const a = W.a + k / W.n * TAU; W.m.makeTranslation(Math.cos(a) * W.R, W.hub + Math.sin(a) * W.R - 2.2, 0); W.gon.setMatrixAt(k, W.m); } W.gon.instanceMatrix.needsUpdate = true; }
    const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), M4 = new THREE.Matrix4(), ps = new THREE.Vector3(), sc = new THREE.Vector3();
    for(const o of [A.boatsSmall, A.boatsFerry]){ if(!o) continue;
      o.list.forEach((b, i) => { const a = b.a + t * b.sp, x = b.x + Math.cos(a) * b.r, y = b.y + Math.sin(a) * b.r, hd = a + (b.sp > 0 ? Math.PI / 2 : -Math.PI / 2);
        q.setFromAxisAngle(up, -hd); ps.set(x, SEA_Y + 0.05 + Math.sin(t * 1.3 + i) * 0.1, y); sc.setScalar(o.scale); M4.compose(ps, q, sc); o.mesh.setMatrixAt(i, M4); });
      o.mesh.instanceMatrix.needsUpdate = true; }
    if(A.gulls){ const gl = A.gulls; gl.list.forEach((b, i) => { const a = b.a + t * b.sp, x = b.x + Math.cos(a) * b.r, y = b.y + Math.sin(a) * b.r, hd = a + (b.sp > 0 ? Math.PI / 2 : -Math.PI / 2);
        q.setFromAxisAngle(up, -hd + Math.PI / 2); ps.set(x, SEA_Y + b.h + Math.sin(t * 0.5 + b.ph) * 4, y); sc.setScalar(1.6); M4.compose(ps, q, sc); gl.mesh.setMatrixAt(i, M4); }); gl.mesh.instanceMatrix.needsUpdate = true; }
    if(A.kites){ const k = A.kites; k.list.forEach((b, i) => { ps.set(b.cx + Math.sin(t * 0.6 + b.ph) * 6, b.h + Math.sin(t * 0.9 + b.ph) * 4, b.cy + Math.cos(t * 0.5 + b.ph) * 4); q.setFromEuler(new THREE.Euler(0.5 + Math.sin(t + b.ph) * 0.2, WIND, Math.sin(t * 1.3 + b.ph) * 0.3)); sc.setScalar(3.2); M4.compose(ps, q, sc); k.mesh.setMatrixAt(i, M4); }); k.mesh.instanceMatrix.needsUpdate = true; }
    if(A.spray){ const sp = A.spray; let j = 0; for(const f of sp.list) for(let p = 0; p < 36; p++, j++){ const ph = ((t * 0.9 + p / 36) % 1), a = p * 2.399, r = Math.sin(ph * Math.PI) * 0.0 + ph * (1.4 + (p % 6) * 0.55), h = 1.4 + Math.sin(ph * Math.PI) * (3.0 + (p % 5) * 0.5);
        sp.pos[j * 3] = f.x + Math.cos(a) * r; sp.pos[j * 3 + 1] = f.z + h; sp.pos[j * 3 + 2] = f.y + Math.sin(a) * r; } sp.pts.geometry.attributes.position.needsUpdate = true; }
  },
};

export { BAKU, instMat, instance };
