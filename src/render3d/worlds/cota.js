import * as THREE from 'three';
import { TAU, clamp } from '../../config/util.js';
import { CFG } from '../../config/settings.js';
import { planCota, auditCota } from './cota-plan.js';
import * as K from './cota-kit.js';

const { L, shadeC, fh, sst, Mesher, Chunked } = K;
const WIND = 0.6;                                  // one wind for every flag, tree and balloon (game-space heading)
const CROWD = ["#D8352A", "#2B6CD8", "#F2C230", "#F4F2EC", "#2E9A5A", "#E8742A", "#7A3AB8", "#1E1E24", "#E8509C", "#18A8B8", "#C8442A"];
const HATS = ["#C9A66B", "#F2EEE4", "#6B4A2E", "#C9A66B"];

/* ---------- Circuit of the Americas: the Texas Hill Country world -----------------
   The circuit stays what the track definition says. Around it this builds: rolling
   ground in dusty gold and sage with limestone outcrops, a dry creek and ponds,
   live oak, cedar elm, mesquite and juniper, prickly pear, yucca, dry grass and
   spring wildflowers; the observation tower; tiered stands that follow the circuit's
   curve (main straight, the Turn 1 hill, the Esses, Turn 11, Turn 12, the stadium);
   the pit and paddock buildings, car parks, tents, food trucks, warehouses, an
   amphitheatre, a fan-zone Ferris wheel, flags, bunting, hot-air balloons, a plane
   and a helicopter. What goes where is cota-plan.js (pure numbers, Node-testable).
   Repeated things are instanced; static structures are merged into one mesh per
   300 m square, with vertex colours (MeshLambertMaterial).                         */

const COTA = {
  U:{ time:{ value:0 } },
  CHUNK:320,

  /* One material for every instanced thing: vertex colour, the instance's tint where the mask says,
     and the motion for its kind: sway (plants), wave (an arm up in the crowd), flag (cloth, pennants). */
  instMat(mode){
    const m = new THREE.MeshLambertMaterial({ vertexColors:true });
    const U = this.U;
    const body = {
      sway:`vec3 sIp = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  float sSw = (sin(uTime * 1.1 + sIp.x * 0.05 + sIp.z * 0.07) * 0.6 + sin(uTime * 2.3 + sIp.x * 0.11) * 0.25) * 0.008 * max(position.y - 0.3, 0.0);
  transformed.x += sSw * ${Math.cos(WIND).toFixed(3)}; transformed.z += sSw * ${Math.sin(WIND).toFixed(3)};`,
      wave:`vec3 sIp = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  float ph = sIp.x * 0.37 + sIp.z * 0.51;
  transformed.x += sin(uTime * 6.0 + ph) * 0.22 * arm; transformed.y += (1.0 - cos(uTime * 6.0 + ph)) * 0.03 * arm;`,
      flag:`vec3 sIp = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  float ph = sIp.x * 0.13 + sIp.z * 0.17;
  float fx = max(position.x, 0.0);
  transformed.y += sin(position.x * 7.0 - uTime * 7.0 + ph) * 0.07 * fx + sin(uTime * 3.0 + ph) * 0.1 * arm;
  transformed.z += cos(position.x * 6.0 - uTime * 6.0 + ph) * 0.05 * fx + sin(uTime * 4.0 + ph) * 0.14 * arm;`,
      plain:"",
    }[mode];
    m.onBeforeCompile = sh => {
      sh.uniforms.uTime = U.time;
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float tintMask;\n" + (mode === "sway" || mode === "plain" ? "" : "attribute float arm;\n") + "uniform float uTime;")
        .replace("#include <color_vertex>", `vColor = vec3(1.0);
#ifdef USE_COLOR
  vColor *= color;
#endif
#ifdef USE_INSTANCING_COLOR
  vColor *= mix(vec3(1.0), instanceColor.xyz, tintMask);
#endif`)
        .replace("#include <begin_vertex>", "#include <begin_vertex>\n#ifdef USE_INSTANCING\n  " + body + "\n#endif");
    };
    m.side = mode === "flag" ? THREE.DoubleSide : THREE.FrontSide;
    m.customProgramCacheKey = () => "cota_" + mode;
    return m;
  },

  /* Instanced, in chunks of CHUNK metres, each with its own bounds so the camera and the shadow pass
     only draw what they can see. Item: x, y, z (game space), ry, h, w (share of h), lean, tint; or sx/sy/sz. */
  instance(g, geo, mat, list, cast, chunk){
    if(!list.length) return 0;
    if(!geo.boundingSphere) geo.computeBoundingSphere();
    const r0 = geo.boundingSphere.radius + geo.boundingSphere.center.length();
    const C = chunk || this.CHUNK, groups = new Map();
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
      gg.boundingSphere = new THREE.Sphere(new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 + r0 * smax + 2);
      im.instanceMatrix.needsUpdate = true; if(im.instanceColor) im.instanceColor.needsUpdate = true;
      im.castShadow = !!cast; im.receiveShadow = true; im.frustumCulled = true;
      im.userData.dynamic = true;
      g.add(im); made++;
    }
    return made;
  },

  /* ---- the ground: tiles of the plan's height grid, with the plan's colours ---- */
  terrain(G, g, P){
    const { X0, Y0, STEP, NX, NY, H, COL } = P.grid, TILE = 40;
    const mat = new THREE.MeshLambertMaterial({ vertexColors:true });
    // a fine grain over the vertex colour, in world space, so the dry grass is not a flat wash
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
  float gD = texture2D(uDet, vGW / 4.0).r * 0.5 + texture2D(uDet, vGW / 27.0).r * 0.5;
  diffuseColor.rgb *= 0.86 + gD * 0.28;`);
    };
    mat.customProgramCacheKey = () => "cotaGround";
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
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      geo.setIndex(idx); geo.computeVertexNormals(); geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; m.castShadow = false; m.userData.dynamic = true;
      g.add(m); tiles++;
    }
    return tiles;
  },

  /* ---- everything made of boxes and planes, merged: the stands, the pit and paddock, the tower... ---- */
  structures(G, g, T, P){
    const S = P.structs, n = T.n, M = new Chunked(300), at = P.at, ht = P.height;
    const pt = (i, side, off, z) => { const a = at(i, side, off); return [a[0], a[1], z]; };
    const st = { tris:0 };
    const WALL = "#8E9096", CONC = "#B9B7B0", ROOF = "#E8E6E0", RED = "#C8321E";

    /* the tiered stands */
    for(const s of S.stands){
      const { i0, span, side, off0, rows, rowD, rowH } = s, depth = s.depth, bank = s.kind === "bank";
      const seat = s.col, tread = r => (r & 1 ? shadeC(seat, -0.1) : L(seat)), riser = shadeC(seat, -0.38), aisle = shadeC(seat, 0.35);
      const grass = r => (r & 1 ? L("#B8AB68") : L("#C8BA74")), earth = L("#9C7A52");
      const zb = [];
      for(let k = 0; k <= span; k++){
        const i = (i0 + k) % n, a = at(i, side, off0), b = at(i, side, off0 + depth);
        zb.push(Math.max(ht(a[0], a[1]), ht(b[0], b[1]), T.z[i] - 1.0) + 0.1);
      }
      s.zb = zb;
      for(let k = 0; k < span; k++){
        const ia = (i0 + k) % n, ib = (i0 + k + 1) % n, m = M.at(...at(ia, side, off0 + depth / 2));
        const za = zb[k], zbn = zb[k + 1], isAisle = k % 9 === 0;
        for(let r = 0; r < rows; r++){
          const oa = off0 + r * rowD, ob = oa + rowD, ta = za + (r + 1) * rowH, tb = zbn + (r + 1) * rowH, lo = r === 0 ? 2.5 : 0;
          m.quad(pt(ia, side, oa, ta), pt(ia, side, ob, ta), pt(ib, side, ob, tb), pt(ib, side, oa, tb), bank ? grass(r) : (isAisle ? aisle : tread(r)));
          m.quad(pt(ia, side, oa, ta - rowH - lo), pt(ib, side, oa, tb - rowH - lo), pt(ib, side, oa, tb), pt(ia, side, oa, ta), bank ? earth : riser);
        }
        // the back wall, down to well under the ground
        m.quad(pt(ia, side, off0 + depth, za + rows * rowH), pt(ib, side, off0 + depth, zbn + rows * rowH), pt(ib, side, off0 + depth, zbn - 3), pt(ia, side, off0 + depth, za - 3), L(WALL));
      }
      // the end caps: a stepped profile each end
      for(const [k, flip] of [[0, 1], [span, 0]]){
        const i = (i0 + k) % n, m = M.at(...at(i, side, off0 + depth / 2));
        for(let r = 0; r < rows; r++){
          const oa = off0 + r * rowD, ob = oa + rowD, t = zb[k] + (r + 1) * rowH;
          m.quad(pt(i, side, oa, zb[k] - 3), pt(i, side, ob, zb[k] - 3), pt(i, side, ob, t), pt(i, side, oa, t), L(WALL));
        }
      }
      // the roof: a slab on posts, with a coloured fascia
      if(s.roof){
        const top = rows * rowH + (s.kind === "bowl" ? 5.5 : 4.2);
        for(let k = 0; k < span; k++){
          const ia = (i0 + k) % n, ib = (i0 + k + 1) % n, m = M.at(...at(ia, side, off0 + depth / 2)), za = zb[k] + top, zbn = zb[k + 1] + top, f0 = off0 - 2.5, f1 = off0 + depth + 2.5;
          m.quad(pt(ia, side, f0, za), pt(ib, side, f0, zbn), pt(ib, side, f1, zbn + 0.8), pt(ia, side, f1, za + 0.8), L(ROOF));
          m.quad(pt(ia, side, f0, za - 0.5), pt(ib, side, f0, zbn - 0.5), pt(ib, side, f1, zbn + 0.3), pt(ia, side, f1, za + 0.3), shadeC(ROOF, -0.35));
          m.quad(pt(ia, side, f0, za - 0.5), pt(ib, side, f0, zbn - 0.5), pt(ib, side, f0, zbn + 0.45), pt(ia, side, f0, za + 0.45), (k >> 1) & 1 ? L(s.col) : shadeC(s.col, 0.5));
          if(k % 5 === 0){
            const fa = at(ia, side, f0 + 1.2), ba = at(ia, side, f1 - 1.2);
            m.pole(fa[0], fa[1], zb[k] - 0.5, fa[0], fa[1], za - 0.5, 0.18, L("#7A7E86"));
            m.pole(ba[0], ba[1], zb[k] - 0.5, ba[0], ba[1], za + 0.3, 0.18, L("#7A7E86"));
          }
        }
      }
    }

    /* catch fencing along the front of every stand: posts and three rails, so the stand is still visible through it */
    for(const s of S.stands){
      if(s.kind === "bank") continue;
      const { i0, span, side } = s, C = L("#5C6068");
      for(let k = 0; k < span; k++){
        const ia = (i0 + k) % n, ib = (i0 + k + 1) % n, oa = P.edge(ia, side) + 1.0, ob = P.edge(ib, side) + 1.0, m = M.at(...at(ia, side, oa));
        const A = at(ia, side, oa), B = at(ib, side, ob), za = ht(A[0], A[1]), zb2 = ht(B[0], B[1]);
        for(const hh of [1.3, 2.7, 4.0]) m.quad([A[0], A[1], za + hh], [B[0], B[1], zb2 + hh], [B[0], B[1], zb2 + hh + 0.12], [A[0], A[1], za + hh + 0.12], C);
        if(k % 3 === 0) m.pole(A[0], A[1], za - 0.2, A[0], A[1], za + 4.3, 0.09, C);
      }
    }

    /* the pit building: ground floor, a set-back floor, a glass hospitality deck, awnings, a tower at the line */
    { const pb = S.pit, { i0, span, side, off0 } = pb;
      const D0 = off0, D1 = off0 + pb.depth;
      for(let k = 0; k < span; k++){
        const ia = (i0 + k) % n, ib = (i0 + k + 1) % n, m = M.at(...at(ia, side, off0)), za = T.z[ia] - 0.7, zbn = T.z[ib] - 0.7, win = (k >> 1) & 1;
        const H1 = 5.4, H2 = 4.4;
        // front, ground floor: wall, a band of glass, wall
        m.quad(pt(ia, side, D0, za), pt(ib, side, D0, zbn), pt(ib, side, D0, zbn + 1.2), pt(ia, side, D0, za + 1.2), L("#D8D4CA"));
        m.quad(pt(ia, side, D0, za + 1.2), pt(ib, side, D0, zbn + 1.2), pt(ib, side, D0, zbn + 4.4), pt(ia, side, D0, za + 4.4), win ? L("#4A6A82") : L("#8CB4CC"));
        m.quad(pt(ia, side, D0, za + 4.4), pt(ib, side, D0, zbn + 4.4), pt(ib, side, D0, zbn + H1), pt(ia, side, D0, za + H1), L("#E8E4DA"));
        // awning over the garages: striped, sloped out to the lane
        m.quad(pt(ia, side, D0, za + H1 - 0.2), pt(ib, side, D0, zbn + H1 - 0.2), pt(ib, side, D0 - 3.4, zbn + H1 - 1.3), pt(ia, side, D0 - 3.4, za + H1 - 1.3), (k >> 1) & 1 ? L(RED) : L("#F4F0E8"));
        // the first floor sits back
        const D0b = D0 + 3.5;
        m.quad(pt(ia, side, D0, za + H1), pt(ib, side, D0, zbn + H1), pt(ib, side, D0b, zbn + H1), pt(ia, side, D0b, za + H1), L("#D4D0C6"));
        m.quad(pt(ia, side, D0b, za + H1), pt(ib, side, D0b, zbn + H1), pt(ib, side, D0b, zbn + H1 + H2), pt(ia, side, D0b, za + H1 + H2), win ? L("#547A92") : L("#98C0D8"));
        m.quad(pt(ia, side, D0b, za + H1 + H2), pt(ib, side, D0b, zbn + H1 + H2), pt(ib, side, D1, zbn + H1 + H2), pt(ia, side, D1, za + H1 + H2), L("#C8C4BA"));
        m.quad(pt(ia, side, D0, za + H1 + 0.0), pt(ib, side, D0, zbn + H1 + 0.0), pt(ib, side, D0, zbn + H1 + 0.5), pt(ia, side, D0, za + H1 + 0.5), L(RED));
        // the back and the roof
        m.quad(pt(ia, side, D1, za + H1 + H2), pt(ib, side, D1, zbn + H1 + H2), pt(ib, side, D1, zbn - 1), pt(ia, side, D1, za - 1), L("#BDB9AF"));
        m.quad(pt(ia, side, D0b, za + H1 + H2 + 0.9), pt(ib, side, D0b, zbn + H1 + H2 + 0.9), pt(ib, side, D1, zbn + H1 + H2 + 0.9), pt(ia, side, D1, za + H1 + H2 + 0.9), L("#E0DED6"));
        m.quad(pt(ia, side, D0b, za + H1 + H2), pt(ib, side, D0b, zbn + H1 + H2), pt(ib, side, D0b, zbn + H1 + H2 + 0.9), pt(ia, side, D0b, za + H1 + H2 + 0.9), L("#F2F0EA"));
        // the ground floor roof (the terrace) on the setback
        m.quad(pt(ia, side, D0, za + H1), pt(ib, side, D0, zbn + H1), pt(ib, side, D0b, zbn + H1), pt(ia, side, D0b, za + H1), L("#BEBAB0"));
      }
      for(const [k] of [[0], [span]]){ const i = (i0 + k) % n, m = M.at(...at(i, side, off0)), z = T.z[i] - 0.7;
        m.quad(pt(i, side, D0, z), pt(i, side, D1, z), pt(i, side, D1, z + 9.8), pt(i, side, D0, z + 5.4), L(WALL)); }
      // the timing tower, in the middle of the building
      { const i = (i0 + (span >> 1)) % n, [x, y] = at(i, side, D0 + 10), z = T.z[i] - 0.7, a = T.ang[i];
        M.at(x, y).box(x, y, z, 12, 12, 20, a, L("#D8D6D0"), L("#C0BEB6"));
        M.at(x, y).box(x, y, z + 20, 14, 14, 6, a, L("#5A7E94"), L("#2A3640"));
        M.at(x, y).box(x, y, z + 26, 12.5, 12.5, 0.8, a, L(RED));
        M.at(x, y).pole(x, y, z + 26.8, x, y, z + 36, 0.3, L("#9A9EA6")); }
    }

    /* the start/finish gantry across the straight, just before the line */
    { const gi = S.gantry.i, ai = (gi - 4 + n) % n, hw = S.gantry.halfW, m = M.at(T.x[ai], T.y[ai]), z = T.z[ai];
      const A = at(ai, -1, hw), B = at(ai, 1, hw), a = T.ang[ai];
      for(const p of [A, B]) m.box(p[0], p[1], z - 1, 2.0, 2.0, 11, a, L("#B8B8B8"));
      m.box((A[0] + B[0]) / 2, (A[1] + B[1]) / 2, z + 9, 1.8, Math.hypot(B[0] - A[0], B[1] - A[1]) + 2, 2.4, a, L("#C8C8C8"), L("#E4E4E4"));
      m.box((A[0] + B[0]) / 2, (A[1] + B[1]) / 2, z + 11.4, 0.7, Math.hypot(B[0] - A[0], B[1] - A[1]) + 2, 0.5, a, L(RED));
      S.gantry.mid = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, z + 10.2, a];
    }

    /* the observation tower: a tapering concrete shaft, a red steel ribbon round it, a double helix of stairs, a deck with a glass band and a lit spire */
    { const tw = S.tower, x = tw.x, y = tw.y, z0 = ht(x, y) - 1.5, m = M.at(x, y), H = tw.h;
      const r = zz => 4.4 - 1.9 * (zz / 62);
      m.frustum(x, y, z0, z0 + 62, 4.5, 2.5, 10, k => (k & 1 ? L("#D6D4CE") : L("#C4C2BA")), L("#B8B6B0"));
      // the deck: flare, glass drum, roof ring, cap, spire
      m.frustum(x, y, z0 + 61, z0 + 64, 2.7, 9.2, 16, L("#9C9A94"));
      m.frustum(x, y, z0 + 64, z0 + 68.4, 9.2, 9.2, 16, k => (k & 1 ? L("#7FB0CC") : L("#9CC8E0")), L("#5E6670"));
      m.frustum(x, y, z0 + 68.4, z0 + 69.4, 9.8, 9.8, 16, L(RED), L("#7A2A1A"));
      m.cone(x, y, z0 + 69.4, 3.2, 5.4, 12, L("#D8D6D0"));
      m.pole(x, y, z0 + 72, x, y, z0 + H + 0.5, 0.35, L("#9A9EA6"));
      // the red ribbon: a wide band winding up, built of short boxes
      for(let k = 0; k < 150; k++){
        const t = k / 150, a = t * TAU * 2.3, zz = 2 + t * 58, rr = r(zz) + 0.9;
        m.box(x + Math.cos(a) * rr, y + Math.sin(a) * rr, z0 + zz, 2.6, 0.9, 2.6, a + Math.PI / 2, L(RED));
      }
      // the stairs: two helices, half a turn apart, 0.8 m wide steps (the real one has 419)
      for(const ph of [0, Math.PI]) for(let k = 0; k < 110; k++){
        const t = k / 110, a = ph + t * TAU * 3.1, zz = 1 + t * 60, rr = r(zz) + 2.1;
        m.box(x + Math.cos(a) * rr, y + Math.sin(a) * rr, z0 + zz, 2.4, 1.0, 0.3, a + Math.PI / 2, L("#8A9098"));
      }
      // legs: four slim braces at the foot
      for(let k = 0; k < 4; k++){ const a = k / 4 * TAU + 0.4; m.pole(x + Math.cos(a) * 9, y + Math.sin(a) * 9, z0, x + Math.cos(a) * 4.8, y + Math.sin(a) * 4.8, z0 + 9, 0.35, L("#8A9098")); }
      m.box(x, y, z0, 22, 22, 0.6, 0, L("#C8C2B0"));                         // a plaza slab round the foot
      tw.deckZ = z0 + 68.4; tw.topZ = z0 + H; tw.z0 = z0;
    }

    /* the amphitheatre: a fan of tiered seating round a stage with a white canopy, a lawn above */
    { const A = S.amph, m = M.at(A.x, A.y), rot = A.rot, NS = 28, span = Math.PI * 1.15, rows = 13, r0 = 22, rowD = 2.3, rowH = 0.52;
      const pa = (ang, rr) => [A.x + Math.cos(rot + ang) * rr, A.y + Math.sin(rot + ang) * rr];
      const base = []; for(let k = 0; k <= NS; k++){ const ang = (k / NS - 0.5) * span; let b = -1e9; for(const rr of [r0, r0 + rows * rowD * 0.5, r0 + rows * rowD]){ const p = pa(ang, rr); b = Math.max(b, ht(p[0], p[1])); } base.push(b + 0.1); }
      A.base = ht(A.x, A.y);
      for(let k = 0; k < NS; k++){
        const a0 = (k / NS - 0.5) * span, a1 = ((k + 1) / NS - 0.5) * span;
        for(let r = 0; r < rows; r++){
          const ra = r0 + r * rowD, rb = ra + rowD, t0 = base[k] + (r + 1) * rowH, t1 = base[k + 1] + (r + 1) * rowH, lo = r === 0 ? 2.5 : 0;
          const lawn = r >= rows - 4;
          const c = lawn ? ((r & 1) ? L("#C0B26C") : L("#CCBE7A")) : (r & 1) ? L("#EAE6DC") : L("#D8D2C4");
          const P1 = pa(a0, ra), P2 = pa(a0, rb), P3 = pa(a1, rb), P4 = pa(a1, ra);
          m.quad([P1[0], P1[1], t0], [P2[0], P2[1], t0], [P3[0], P3[1], t1], [P4[0], P4[1], t1], c);
          m.quad([P1[0], P1[1], t0 - rowH - lo], [P4[0], P4[1], t1 - rowH - lo], [P4[0], P4[1], t1], [P1[0], P1[1], t0], lawn ? L("#9C7A52") : L("#9A968C"));
        }
        const Q1 = pa(a0, r0 + rows * rowD), Q2 = pa(a1, r0 + rows * rowD);
        m.quad([Q1[0], Q1[1], base[k] + rows * rowH], [Q2[0], Q2[1], base[k + 1] + rows * rowH], [Q2[0], Q2[1], base[k + 1] - 3], [Q1[0], Q1[1], base[k] - 3], L(WALL));
      }
      // the stage: a deck, a white shell of folded sails on two towers, speaker stacks
      const sz = ht(A.x, A.y) + 0.2, a = rot + Math.PI;     // the stage faces the bowl
      m.box(A.x, A.y, sz - 1, 26, 16, 2.2, a, L("#6A6E74"), L("#8E9298"));
      for(const s of [-1, 1]){ const px = A.x + Math.cos(a + Math.PI / 2) * 11 * s - Math.cos(a) * 2, py = A.y + Math.sin(a + Math.PI / 2) * 11 * s - Math.sin(a) * 2; m.box(px, py, sz + 1, 3, 3, 14, a, L("#D8D6D0")); }
      for(let k = 0; k < 5; k++){
        const w0 = (k - 2.5) * 5.6, w1 = (k - 1.5) * 5.6, hb = 15.5 + (k % 2) * 3.2, hf = 9 + (k % 2) * 2.2, ca = Math.cos(a), sa = Math.sin(a), pc = Math.cos(a + Math.PI / 2), ps = Math.sin(a + Math.PI / 2);
        const V = (w, d, zz) => [A.x + pc * w + ca * d, A.y + ps * w + sa * d, sz + zz];
        const col = k & 1 ? L("#F4F2EE") : L("#E2DED4");
        m.quad(V(w0, -3, hb), V(w1, -3, hb), V(w1, 7, hf), V(w0, 7, hf), col);
        m.quad(V(w0, -3, hb - 0.4), V(w1, -3, hb - 0.4), V(w1, -3, hb), V(w0, -3, hb), L(RED));
      }
      for(const s of [-1, 1]) for(let q = 0; q < 2; q++){ const px = A.x + Math.cos(a + Math.PI / 2) * (15 + q * 2.6) * s + Math.cos(a) * 3, py = A.y + Math.sin(a + Math.PI / 2) * (15 + q * 2.6) * s + Math.sin(a) * 3; m.box(px, py, sz + 0.6, 2, 2, 6, a, L("#2A2C32")); }
    }

    /* paddock: hospitality cabins with awnings, and the transporters behind */
    S.paddock.forEach(b => {
      const m = M.at(b.x, b.y), z = ht(b.x, b.y) - 0.2, col = ["#F2F0EA", "#EDE8DC"][b.c & 1], aw = ["#C8321E", "#2B4C9B", "#D8A020", "#2E8C4A"][b.c & 3];
      m.box(b.x, b.y, z, b.w, b.d, 4, b.ang, L(col), L("#CCCAC2"));
      m.box(b.x, b.y, z + 4, b.w - 1.5, b.d - 1.5, 3.4, b.ang, L("#9CC4D8"), L("#E8E6DE"));
      m.quad([b.x + Math.cos(b.ang) * b.w / 2, b.y + Math.sin(b.ang) * b.w / 2, z + 4.2], [b.x - Math.cos(b.ang) * b.w / 2, b.y - Math.sin(b.ang) * b.w / 2, z + 4.2],
        [b.x - Math.cos(b.ang) * b.w / 2 - Math.sin(b.ang) * 4.2, b.y - Math.sin(b.ang) * b.w / 2 + Math.cos(b.ang) * 4.2, z + 3.2], [b.x + Math.cos(b.ang) * b.w / 2 - Math.sin(b.ang) * 4.2, b.y + Math.sin(b.ang) * b.w / 2 + Math.cos(b.ang) * 4.2, z + 3.2], L(aw));
    });
    S.trucks.forEach(tk => {
      const m = M.at(tk.x, tk.y), z = ht(tk.x, tk.y), a = tk.ang, cols = ["#F2F0EA", "#D8352A", "#2B6CD8", "#F2C230", "#2E9A5A", "#E8742A", "#EDE8DC"], col = cols[tk.c % cols.length];
      if(tk.food){
        m.box(tk.x, tk.y, z + 0.4, tk.l, tk.w, 2.5, a, L(col), shadeC(col, -0.2));
        m.box(tk.x, tk.y, z + 2.9, tk.l * 0.5, 0.4, 0.8, a, L("#FFF2D0"));
        const ca = Math.cos(a), sa = Math.sin(a);
        const o = (l, w, zz) => [tk.x + ca * l - sa * w, tk.y + sa * l + ca * w, z + zz];
        m.quad(o(-tk.l * 0.35, tk.w / 2, 2.2), o(tk.l * 0.35, tk.w / 2, 2.2), o(tk.l * 0.35, tk.w / 2 + 1.6, 1.6), o(-tk.l * 0.35, tk.w / 2 + 1.6, 1.6), L(["#C8321E", "#F4F0E8"][tk.c & 1]));
        m.quad(o(-tk.l * 0.3, tk.w / 2 + 0.01, 1.0), o(tk.l * 0.3, tk.w / 2 + 0.01, 1.0), o(tk.l * 0.3, tk.w / 2 + 0.01, 2.0), o(-tk.l * 0.3, tk.w / 2 + 0.01, 2.0), L("#2A2E36"));
      } else {
        const cl = 2.6, ca = Math.cos(a), sa = Math.sin(a);
        m.box(tk.x + ca * (tk.l / 2 - cl / 2 - 0.2), tk.y + sa * (tk.l / 2 - cl / 2 - 0.2), z + 0.4, tk.l - cl - 0.4, tk.w, 3.0, a, L("#F2F0EA"), L("#D8D6CE"));
        m.box(tk.x - ca * (tk.l / 2 - cl / 2), tk.y - sa * (tk.l / 2 - cl / 2), z + 0.2, cl, tk.w, 2.4, a, L(col), shadeC(col, -0.2));
      }
    });
    S.warehouses.forEach(w => {
      const m = M.at(w.x, w.y), z = ht(w.x, w.y) - 0.3, col = ["#C8C4B8", "#D8D2C4", "#BCC0C4", "#C6B8A0"][w.c & 3];
      m.box(w.x, w.y, z, w.w, w.d, w.h, w.ang, L(col), L("#B0AEA6"));
      m.gable(w.x, w.y, z + w.h, w.w + 0.8, w.d + 0.8, 2.6, w.ang, L(["#7A6A5A", "#8E5A46", "#6E7478"][w.c % 3]));
      const ca = Math.cos(w.ang), sa = Math.sin(w.ang), o = (l, wd, zz) => [w.x + ca * l - sa * wd, w.y + sa * l + ca * wd, z + zz];
      for(let q = -1; q <= 1; q += 2){ m.quad(o(-w.w * 0.4, q * (w.d / 2 + 0.02), 0.2), o(-w.w * 0.4 + 7, q * (w.d / 2 + 0.02), 0.2), o(-w.w * 0.4 + 7, q * (w.d / 2 + 0.02), 5.2), o(-w.w * 0.4, q * (w.d / 2 + 0.02), 5.2), L("#4A5058"));
        m.quad(o(-w.w * 0.4, q * (w.d / 2 + 0.02), w.h - 3), o(w.w * 0.4, q * (w.d / 2 + 0.02), w.h - 3), o(w.w * 0.4, q * (w.d / 2 + 0.02), w.h - 1.4), o(-w.w * 0.4, q * (w.d / 2 + 0.02), w.h - 1.4), L("#6C8EA2")); }
    });
    // tents: a ring of striped wall and a coloured, faceted cone
    S.tents.forEach(t => {
      const m = M.at(t.x, t.y), z = ht(t.x, t.y) - 0.2, cA = ["#D8352A", "#2B6CD8", "#F2C230", "#2E9A5A", "#E8742A", "#7A3AB8"][t.c % 6];
      m.frustum(t.x, t.y, z, z + 2.6, t.r, t.r, 10, k => (k & 1 ? L("#F4F0E8") : L(cA)));
      m.cone(t.x, t.y, z + 2.6, t.r * 0.62, t.r * 1.08, 10, k => (k & 1 ? L("#F4F0E8") : L(cA)));
      m.pole(t.x, t.y, z + 2.6 + t.r * 0.62, t.x, t.y, z + 2.6 + t.r * 0.62 + 1.4, 0.1, L("#9A9EA6"));
    });
    // marshal posts: a little cabin with a pitched roof and a flag pole
    S.marshal.forEach(p => {
      const m = M.at(p.x, p.y); m.box(p.x, p.y, p.z - 0.2, 2.6, 2.2, 2.4, p.ang, L("#F0EEE6"), L("#C8C6BE"));
      m.gable(p.x, p.y, p.z + 2.2, 3.0, 2.6, 0.9, p.ang, L("#C8442A")); m.box(p.x, p.y, p.z + 0.9, 2.62, 2.22, 0.9, p.ang, L("#2A2E36"));
    });
    // TV towers: scaffold legs, bracing, a platform with a rail and a canopy
    S.tvTowers.forEach(t => {
      const m = M.at(t.x, t.y), s0 = 1.15, s1 = 0.9, z = t.z - 0.3, h = t.h, c = L("#8A9098"), d = L("#C8C8C8");
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]], ca = Math.cos(t.ang), sa = Math.sin(t.ang);
      const w = (l, q, s) => [t.x + ca * l * s - sa * q * s, t.y + sa * l * s + ca * q * s];
      corners.forEach(([l, q], k) => { const a = w(l, q, s0), b = w(l, q, s1); m.pole(a[0], a[1], z, b[0], b[1], z + h, 0.1, c);
        const [l2, q2] = corners[(k + 1) % 4]; for(const f of [0.4, 0.75]){ const aa = w(l, q, s0 + (s1 - s0) * f), bb = w(l2, q2, s0 + (s1 - s0) * (f + 0.25)); m.pole(aa[0], aa[1], z + h * f, bb[0], bb[1], z + h * (f + 0.25), 0.05, c); } });
      m.box(t.x, t.y, z + h, 3.2, 3.2, 0.3, t.ang, d); m.box(t.x, t.y, z + h + 0.3, 3.1, 3.1, 0.8, t.ang, L("#2A2E36"));
      m.box(t.x, t.y, z + h + 2.6, 3.4, 3.4, 0.25, t.ang, L("#E8E6E0"));
      for(const [l, q] of corners){ const a = w(l, q, 1.45); m.pole(a[0], a[1], z + h + 0.3, a[0], a[1], z + h + 2.6, 0.07, c); }
    });
    // flag poles
    S.flagPoles.forEach(p => { M.at(p.x, p.y).pole(p.x, p.y, p.z - 0.3, p.x, p.y, p.z + p.h, 0.09, L("#E6E6E6")); });
    // big-screen posts (the screens themselves are textured panels, below)
    S.screens.forEach(s => { const m = M.at(s.x, s.y), ca = Math.cos(s.a0), sa = Math.sin(s.a0);
      for(const q of [-6.4, 6.4]) m.box(s.x + ca * q, s.y + sa * q, s.z - 0.5, 0.8, 0.8, 11, s.a0, L("#6A6E74")); });
    // water towers and radio masts on the horizon
    S.towers.forEach(t => { const m = M.at(t.x, t.y), z = t.z - 1;
      m.frustum(t.x, t.y, z + 16, z + 23, 5, 5.4, 10, k => (k & 1 ? L("#D8D6D0") : L("#C6C4BC")), L("#9A9890"));
      m.cone(t.x, t.y, z + 23, 3.5, 5.6, 10, L("#8E9096"));
      for(let k = 0; k < 4; k++){ const a = k / 4 * TAU + 0.7; m.pole(t.x + Math.cos(a) * 5.4, t.y + Math.sin(a) * 5.4, z, t.x + Math.cos(a) * 3.2, t.y + Math.sin(a) * 3.2, z + 16, 0.25, L("#8A9098")); }
      m.frustum(t.x, t.y, z + 14, z + 16, 3.4, 5, 10, L("#8A9098")); });
    S.masts.forEach(t => { const m = M.at(t.x, t.y), z = t.z - 1, H = 78;
      for(let k = 0; k < 6; k++) m.frustum(t.x, t.y, z + k * H / 6, z + (k + 1) * H / 6, 1.0 - k * 0.1, 1.0 - (k + 1) * 0.1, 4, k & 1 ? L("#D8352A") : L("#F4F0E8"));
      m.pole(t.x, t.y, z + H, t.x, t.y, z + H + 7, 0.15, L("#8A9098")); });
    // the fence: posts every 9 m and a strip of wire between them
    { let prev = null;
      for(const p of S.posts){ const m = M.at(p.x, p.y); m.box(p.x, p.y, p.z - 0.1, 0.16, 0.16, 1.5, p.ang, L("#8A7A62"));
        if(prev && prev.side === p.side && ((p.i - prev.i + n) % n) <= 3 && Math.hypot(p.x - prev.x, p.y - prev.y) < 11)
          m.quad([prev.x, prev.y, prev.z + 0.5], [p.x, p.y, p.z + 0.5], [p.x, p.y, p.z + 1.3], [prev.x, prev.y, prev.z + 1.3], L("#A8A8A0"));
        prev = p; } }
    // service roads: a pale gravel ribbon inside the fence, hugging the ground
    for(const R of S.roads){
      for(let i = R.i0; i < R.i1; i++){
        const ia = i % n, ib = (i + 1) % n, oa = P.roadAt(ia, R.side), ob = P.roadAt(ib, R.side), m = M.at(T.x[ia], T.y[ia]);
        const f = (ii, o, w) => { const p = at(ii, R.side, o + w); return [p[0], p[1], ht(p[0], p[1]) + 0.22]; };
        m.quad(f(ia, oa, -2.2), f(ia, oa, 2.2), f(ib, ob, 2.2), f(ib, ob, -2.2), L("#CFC4A0"));
      }
    }
    // ponds: water discs just under the bank
    S.pondGeo = null;
    st.tris = M.tris;
    const made = M.emit(g, this.structMat = new THREE.MeshLambertMaterial({ vertexColors:true, side:THREE.DoubleSide }), true);
    st.meshes = made;
    return st;
  },

  /* ponds: a still disc a little under the ground round it; and a darker rim of reeds is the ground colour */
  water(G, g, P){
    const S = P.structs; if(!S.ponds.length) return 0;
    const mat = new THREE.MeshPhongMaterial({ color:L("#5E8A92"), shininess:90, specular:new THREE.Color(0.5, 0.5, 0.5), transparent:true, opacity:0.92 });
    const pos = [];
    for(const o of S.ponds){ const N = 28;
      for(let k = 0; k < N; k++){ const a0 = k / N * TAU, a1 = (k + 1) / N * TAU, R0 = o.r * 1.1 * (1 + 0.1 * Math.sin(a0 * 3)), R1 = o.r * 1.1 * (1 + 0.1 * Math.sin(a1 * 3));
        pos.push(o.x, o.z + 0.05, o.y, o.x + Math.cos(a1) * R1, o.z + 0.05, o.y + Math.sin(a1) * R1, o.x + Math.cos(a0) * R0, o.z + 0.05, o.y + Math.sin(a0) * R0); } }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals(); geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; m.userData.dynamic = true; g.add(m);
    return 1;
  },

  /* ---- fans: a person at most seats, each stand's own mix; some with an arm up, waving ---- */
  crowds(G, g, T, P, GE){
    const S = P.structs, n = T.n, lite = CFG.detail === 0, sp = lite ? 2.6 : 1.7, R = (() => { let a = 4711; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; })();
    const lists = { h0:[], h1:[], h2:[], wv:[] };
    let total = 0;
    for(const s of S.stands){
      if(!s.zb) continue;
      const { i0, span, side, off0, rows, rowD, rowH, depth } = s, bank = s.kind === "bank";
      for(let r = 0; r < rows; r++){
        if(!bank && (r & 1) === 0 && r !== rows - 1) continue;                         // every second row of a stand, every row of a bank
        const o = off0 + r * rowD + rowD * 0.5;
        for(let k = 0; k < span; k++){
          if(k % 9 === 0 && !bank) continue;                                           // the aisles
          const ia = (i0 + k) % n, ib = (i0 + k + 1) % n;
          for(let q = 0; q < T.ds; q += sp){
            const t = q / T.ds, ra = R();
            if(ra > s.fill * (lite ? 0.8 : 1)) continue;
            const pa = P.at(ia, side, o), pb = P.at(ib, side, o);
            const x = pa[0] + (pb[0] - pa[0]) * t + (R() - 0.5) * 0.3, y = pa[1] + (pb[1] - pa[1]) * t + (R() - 0.5) * 0.3;
            const za = s.zb[k] + (r + 1) * rowH, zb2 = s.zb[k + 1] + (r + 1) * rowH, z = za + (zb2 - za) * t;
            const pick = R(), list = (s.wave && pick < 0.16) ? lists.wv : pick < 0.75 ? lists.h0 : pick < 0.88 ? lists.h1 : lists.h2;
            const face = Math.atan2(-side * T.ny[ia], -side * T.nx[ia]);
            list.push({ x, y, z, ry:-face + Math.PI / 2 + (R() - 0.5) * 0.5, h:1.95 + R() * 0.25, w:1, tint:CROWD[(R() * CROWD.length) | 0] });
            total++;
          }
        }
      }
    }
    // a thin crowd along the fence of the paddock and by the fan-zone: standing, in a few small groups
    const mat = this.matWave || (this.matWave = this.instMat("wave"));
    let made = 0;
    made += this.instance(g, GE.person0, mat, lists.h0, false, 520);
    made += this.instance(g, GE.person1, mat, lists.h1, false, 520);
    made += this.instance(g, GE.person2, mat, lists.h2, false, 520);
    made += this.instance(g, GE.personW, mat, lists.wv, false, 520);
    return { total, made };
  },

  /* ---- flags, bunting, cars in the car parks: instanced ---- */
  dressing(G, g, T, P, GE){
    const S = P.structs, R = (() => { let a = 2718; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; })();
    const FL = ["#D8352A", "#2B4C9B", "#F4F2EC", "#F2C230", "#2E9A5A"];
    const flags = [], pen = [];
    S.flagPoles.forEach((p, k) => flags.push({ x:p.x, y:p.y, z:p.z + p.h - 0.35, ry:-WIND, h:1.0, sx:2.4, sy:2.4, sz:2.4, tint:FL[p.c % FL.length] }));
    // bunting between neighbouring poles of the same run, sagging
    for(let k = 1; k < S.flagPoles.length; k++){
      const a = S.flagPoles[k - 1], b = S.flagPoles[k], d = Math.hypot(b.x - a.x, b.y - a.y);
      if(d > 40 || d < 6) continue;
      const cnt = Math.floor(d / 2.1);
      for(let q = 1; q < cnt; q++){ const t = q / cnt, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, zz = a.z + a.h - 0.6 + (b.z + b.h - 0.6 - a.z - a.h + 0.6) * t - Math.sin(t * Math.PI) * 0.9;
        pen.push({ x, y, z:zz, ry:-Math.atan2(b.y - a.y, b.x - a.x), sx:1.5, sy:1.5, sz:1.5, tint:["#D8352A", "#F2C230", "#2B6CD8", "#F4F2EC", "#E8742A"][q % 5] }); }
    }
    // the cars: rows in each car park, with aisles
    const cars = [], CC = ["#C8C8CC", "#222428", "#8A1E1E", "#2E4E8A", "#D8D8D0", "#5A5E66", "#E8E4D8", "#1E5A3A", "#B8791E"];
    for(const lot of S.lots){
      const ux = Math.cos(lot.ang), uy = Math.sin(lot.ang), vx = -uy, vy = ux;
      for(let b = -lot.d / 2 + 5; b < lot.d / 2 - 4; b += 5.6){
        if(Math.round((b + lot.d) / 5.6) % 4 === 0) continue;
        for(let a = -lot.w / 2 + 4; a < lot.w / 2 - 3; a += 2.9){
          if(R() > (CFG.detail === 0 ? 0.35 : 0.62)) continue;
          const x = lot.x + ux * a + vx * b, y = lot.y + uy * a + vy * b;
          cars.push({ x, y, z:lot.z + 0.05, ry:-(lot.ang + Math.PI / 2) + (R() - 0.5) * 0.08, sx:4.2, sy:2.0, sz:4.3, tint:CC[(R() * CC.length) | 0] });
        }
      }
    }
    const mFlag = this.instMat("flag"), mPlain = this.instMat("plain");
    let made = 0;
    made += this.instance(g, GE.flag, mFlag, flags, false, 600);
    made += this.instance(g, GE.pennant, mFlag, pen, false, 600);
    made += this.instance(g, GE.car, mPlain, cars, false, 500);
    return { flags:flags.length, pennants:pen.length, cars:cars.length, made };
  },

  /* ---- textured panels: the big screens, the paddock sign, the gantry banner ---- */
  signs(G, g, T, P){
    if(typeof document === "undefined") return 0;
    const S = P.structs, mk = (w, h, draw) => { const cv = document.createElement("canvas"); cv.width = w; cv.height = h; draw(cv.getContext("2d"), w, h);
      const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; return new THREE.MeshBasicMaterial({ map:t, side:THREE.DoubleSide, toneMapped:false }); };
    const font = (px, wgt) => (wgt || 800) + " " + px + "px 'Saira Condensed',Impact,sans-serif";
    const SCR = [["HOWDY, Y'ALL!", "Wave at the nice camera", "#102A4A", "#FFD24A"], ["BRISKET BREAK", "In 5 minutes. Run.", "#4A1008", "#FFE2B0"], ["LAP DOWN?", "Have a taco. Feel better.", "#0E3A2E", "#C8FFE4"], ["BIG HOSS TRUCKS", "Fits a horse. Not the pit lane.", "#8A1A14", "#FFF0D8"]];
    const screens = S.screens.map((s, k) => {
      const [a, b, bg, fg] = SCR[k % SCR.length];
      const mat = mk(512, 288, (c, w, h) => { c.fillStyle = bg; c.fillRect(0, 0, w, h);
        for(let q = 0; q < 12; q++){ c.fillStyle = "rgba(255,255,255," + (0.03 + (q % 3) * 0.02) + ")"; c.fillRect(0, q * 24, w, 10); }
        c.fillStyle = fg; c.textAlign = "center"; c.font = font(92); c.fillText(a, w / 2, h * 0.5); c.font = font(42, 700); c.fillText(b, w / 2, h * 0.74);
        c.strokeStyle = fg; c.lineWidth = 8; c.strokeRect(10, 10, w - 20, h - 20); });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(14, 7.9), mat); m.position.set(s.x, s.z + 11.2, s.y); m.rotation.y = Math.PI / 2 - (s.a0 - s.side * Math.PI / 2); m.userData.dynamic = true; g.add(m); return m;
    });
    // the paddock sign: chunky generic lettering with speed bars and a chequered edge, on a gantry over the paddock entrance
    { const mat = mk(1024, 256, (c, w, h) => { c.fillStyle = "#C8321E"; c.fillRect(0, 0, w, h);
        for(let q = 0; q < 6; q++){ c.fillStyle = "rgba(255,255,255,0.16)"; c.beginPath(); c.moveTo(q * 60, h); c.lineTo(q * 60 + 70, 0); c.lineTo(q * 60 + 100, 0); c.lineTo(q * 60 + 30, h); c.fill(); }
        c.fillStyle = "#FFFFFF"; c.textAlign = "center"; c.font = font(150, 900); c.fillText("PADDOCK", w / 2 + 20, h * 0.66);
        c.fillStyle = "#F2C230"; c.font = font(44, 700); c.fillText("TEAMS · GUESTS · ONE VERY LARGE HAT", w / 2 + 20, h * 0.92);
        for(let q = 0; q < 32; q++){ c.fillStyle = q & 1 ? "#111" : "#FFF"; c.fillRect(q * 32, 0, 32, 14); c.fillStyle = q & 1 ? "#FFF" : "#111"; c.fillRect(q * 32, 14, 32, 14); } });
      const pb = S.pit, i = pb.i0, side = pb.side, [x, y] = P.at(i, side, T.half + T.pitW + 12), z = T.z[i];
      const m = new THREE.Mesh(new THREE.PlaneGeometry(26, 6.5), mat); m.position.set(x, z + 12.5, y); m.rotation.y = Math.PI / 2 - (T.ang[i] - side * Math.PI / 2); m.userData.dynamic = true; g.add(m);
      const pm = new THREE.MeshLambertMaterial({ color:L("#8A8E96") });
      for(const q of [-13, 13]){ const px = x + Math.cos(T.ang[i]) * q, py = y + Math.sin(T.ang[i]) * q; const p = new THREE.Mesh(new THREE.BoxGeometry(0.9, 15, 0.9), pm); p.position.set(px, z + 7, py); p.userData.dynamic = true; g.add(p); } }
    // the gantry banner: "START FINISH" in generic chequered style, hung from the gantry
    if(S.gantry.mid){ const [mx, my, mz, a] = S.gantry.mid;
      const mat = mk(1024, 128, (c, w, h) => { c.fillStyle = "#101418"; c.fillRect(0, 0, w, h);
        for(let q = 0; q < 64; q++){ c.fillStyle = (q & 1) ? "#FFF" : "#111"; c.fillRect(q * 16, 0, 16, 16); c.fillStyle = (q & 1) ? "#111" : "#FFF"; c.fillRect(q * 16, h - 16, 16, 16); }
        c.fillStyle = "#F2F0EA"; c.textAlign = "center"; c.font = font(84, 900); c.fillText("START  ·  FINISH", w / 2, h * 0.72); });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2 * (T.half + 5), 2.2), mat); m.position.set(mx, mz - 2.6, my); m.rotation.y = -Math.PI / 2 - a; m.userData.dynamic = true; g.add(m); }
    return screens.length + 2;
  },

  /* ---- a Ferris wheel in the fan zone, hot-air balloons, a plane and a helicopter ---- */
  sky(G, g, T, P){
    const S = P.structs, anim = this.anim = { spin:0, balloons:[], t:0 };
    // the sky dome: a deep blue overhead, paling to a warm haze at the horizon
    { const geo = new THREE.SphereGeometry(3800, 28, 14), p = geo.attributes.position, col = new Float32Array(p.count * 3);
      const top = L("#2F7FD0"), mid = L("#86B8E6"), hor = L("#F2E6C6"), c = new THREE.Color();
      for(let v = 0; v < p.count; v++){ const e = p.getY(v) / 3800;       // -1 .. 1
        if(e > 0.18) c.copy(mid).lerp(top, sst(0.18, 0.95, e)); else c.copy(hor).lerp(mid, sst(0.0, 0.18, e));
        if(e < 0) c.copy(hor);
        col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b; }
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      const dome = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors:true, side:THREE.BackSide, fog:false, depthWrite:false }));
      const b = T.bounds; dome.position.set(b.minX + b.w / 2, 0, b.minY + b.h / 2); dome.renderOrder = -10; dome.frustumCulled = false; dome.userData.dynamic = true; g.add(dome); this.dome = dome;
      // a few high, thin clouds
      const cg = new THREE.IcosahedronGeometry(1, 1), cmat = new THREE.MeshBasicMaterial({ color:0xFFFFFF, transparent:true, opacity:0.78, fog:false, depthWrite:false });
      const cl = new THREE.InstancedMesh(cg, cmat, 42), M4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(); let a = 91; const r = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
      for(let k = 0; k < 14; k++){ const cx = (r() - 0.5) * 5200, cz = (r() - 0.5) * 5200, cy = 1200 + r() * 500;
        for(let j = 0; j < 3; j++){ ps.set(cx + (j - 1) * 170 + r() * 60, cy + r() * 20, cz + (r() - 0.5) * 90); sc.set(210 + r() * 120, 22 + r() * 12, 100 + r() * 50); M4.compose(ps, q, sc); cl.setMatrixAt(k * 3 + j, M4); } }
      cl.instanceMatrix.needsUpdate = true; cl.frustumCulled = false; cl.renderOrder = -9; cl.userData.dynamic = true; cl.position.set(dome.position.x, 0, dome.position.z); g.add(cl); anim.clouds = cl;
    }
    // the Ferris wheel
    if(S.ferris){ const f = S.ferris, root = new THREE.Group(), R = f.r, hub = R + 4;
      root.position.set(f.x, f.z, f.y); root.rotation.y = -f.ang; root.userData.dynamic = true;
      const frame = new K.Mesher();                                         // legs, in local game-like coords (x along track, y across, z up)
      for(const s of [-1, 1]){ frame.pole(-R * 0.55, s * 2.6, 0, 0, s * 2.6, hub, 0.5, L("#E8E6E0")); frame.pole(R * 0.55, s * 2.6, 0, 0, s * 2.6, hub, 0.5, L("#E8E6E0")); }
      frame.box(0, 0, 0, 3, 8, 0.8, 0, L("#C8C4B8"));
      const fg = frame.geometry(), fm = new THREE.Mesh(fg, new THREE.MeshLambertMaterial({ vertexColors:true, side:THREE.DoubleSide })); fm.castShadow = true; root.add(fm);
      // the wheel: two rings and twelve spokes, spun about the hub
      const wm = new K.Mesher(), N = 40;
      for(const s of [-2.2, 2.2]) for(let k = 0; k < N; k++){ const a0 = k / N * TAU, a1 = (k + 1) / N * TAU; wm.pole(Math.cos(a0) * R, s, Math.sin(a0) * R, Math.cos(a1) * R, s, Math.sin(a1) * R, 0.28, L("#D8352A")); }
      for(let k = 0; k < 12; k++){ const a = k / 12 * TAU; for(const s of [-2.2, 2.2]) wm.pole(0, s, 0, Math.cos(a) * R, s, Math.sin(a) * R, 0.12, L("#E8E6E0")); }
      const wg = wm.geometry(), wmesh = new THREE.Mesh(wg, new THREE.MeshLambertMaterial({ vertexColors:true, side:THREE.DoubleSide }));
      const wheel = new THREE.Group(); wheel.position.set(0, hub, 0); wheel.add(wmesh); root.add(wheel);
      // the wheel mesh is built in (x, y=depth, z=up); the group turns about its depth axis, so swap into three's axes
      const gon = new THREE.InstancedMesh(new THREE.BoxGeometry(2.6, 2.2, 3.4), new THREE.MeshLambertMaterial({ color:0xFFFFFF }), 14), C = ["#F2F2F0", "#E8377F", "#2B6CD8", "#F2C230", "#D8352A", "#2E9A5A", "#E8742A"];
      for(let k = 0; k < 14; k++) gon.setColorAt(k, new THREE.Color(C[k % C.length]).convertSRGBToLinear());
      gon.userData.dynamic = true; gon.frustumCulled = false; root.add(gon); g.add(root);
      anim.wheel = { root, wheel, gon, hub, R, n:14, a:0, m:new THREE.Matrix4() };
    }
    // balloons: striped envelope, a wicker basket and four lines
    const bmat = new THREE.MeshLambertMaterial({ vertexColors:true });
    for(const B of S.balloons){
      const sg = new THREE.SphereGeometry(1, 14, 10), p = sg.attributes.position, col = new Float32Array(p.count * 3), c1 = L(B.c), c2 = L("#F4F0E8");
      for(let v = 0; v < p.count; v++){ const a = Math.atan2(p.getZ(v), p.getX(v)), k = Math.floor((a + Math.PI) / TAU * 12) & 1, c = k ? c1 : c2; col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b; }
      sg.setAttribute("color", new THREE.BufferAttribute(col, 3)); sg.scale(11, 14, 11); sg.translate(0, 10, 0);
      const bm = new K.Mesher(); bm.box(0, 0, -6, 2.4, 2.4, 1.8, 0, L("#8A6A3E"), L("#6A4E2E")); for(const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) bm.pole(x, y, -4.2, x * 5, y * 5, 2, 0.05, L("#5A4A3A"));
      const bg = bm.geometry(), mesh = new THREE.Mesh(sg, bmat), basket = new THREE.Mesh(bg, new THREE.MeshLambertMaterial({ vertexColors:true, side:THREE.DoubleSide }));
      const grp = new THREE.Group(); grp.add(mesh); grp.add(basket); grp.userData.dynamic = true; grp.frustumCulled = false; g.add(grp);
      anim.balloons.push({ grp, B, a:B.a });
    }
    // a small plane and a helicopter, circling well above
    const pm = new K.Mesher(), WH = L("#F4F2EC");
    pm.box(0, 0, 0, 8, 1.1, 1.3, 0, WH); pm.box(0.5, 0, 0.5, 1.6, 12, 0.18, 0, L("#E8E6E0")); pm.box(-3.8, 0, 0.7, 1.2, 4, 0.14, 0, L("#E8E6E0")); pm.box(-3.8, 0, 0.7, 0.14, 0.14, 1.7, 0, L("#C8321E")); pm.box(4.1, 0, 0.1, 0.5, 1, 1, 0, L("#2A2E36"));
    const plane = new THREE.Mesh(pm.geometry(), new THREE.MeshLambertMaterial({ vertexColors:true, side:THREE.DoubleSide })); plane.userData.dynamic = true; plane.frustumCulled = false; g.add(plane);
    const hm = new K.Mesher(); hm.box(0, 0, 0, 5.4, 2, 2, 0, L("#C8321E")); hm.box(1.4, 0, 0.9, 2, 1.8, 1.2, 0, L("#7FB0CC")); hm.box(-4.4, 0, 0.9, 4.4, 0.4, 0.5, 0, L("#C8321E")); hm.box(-6.4, 0, 0.9, 0.3, 0.3, 1.6, 0, L("#C8321E")); hm.box(0, 0, 2, 0.4, 0.4, 1, 0, L("#2A2E36"));
    const heli = new THREE.Mesh(hm.geometry(), new THREE.MeshLambertMaterial({ vertexColors:true, side:THREE.DoubleSide })); heli.userData.dynamic = true; heli.frustumCulled = false;
    const rm = new K.Mesher(); rm.box(0, 0, 0, 12, 0.35, 0.06, 0, L("#2A2E36")); rm.box(0, 0, 0, 0.35, 12, 0.06, 0, L("#2A2E36"));
    const rotor = new THREE.Mesh(rm.geometry(), new THREE.MeshLambertMaterial({ vertexColors:true, side:THREE.DoubleSide })); rotor.position.set(0, 3.0, 0); rotor.userData.dynamic = true; heli.add(rotor); g.add(heli);
    anim.plane = plane; anim.heli = heli; anim.rotor = rotor;
    anim.cx = T.bounds.minX + T.bounds.w / 2; anim.cy = T.bounds.minY + T.bounds.h / 2;
    // tower lights: a ring of bulbs round the deck and one at the tip, cycling colour; and a burst of sparks over it now and then
    { const tw = S.tower, N = 20, bulb = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.45, 0), new THREE.MeshBasicMaterial({ color:0xFFFFFF, fog:false, toneMapped:false }), N + 1), M4 = new THREE.Matrix4();
      for(let k = 0; k < N; k++){ const a = k / N * TAU; M4.makeTranslation(tw.x + Math.cos(a) * 9.9, tw.deckZ + 0.6, tw.y + Math.sin(a) * 9.9); bulb.setMatrixAt(k, M4); }
      M4.makeTranslation(tw.x, tw.topZ + 0.9, tw.y); bulb.setMatrixAt(N, M4);
      bulb.instanceMatrix.needsUpdate = true; bulb.setColorAt(0, new THREE.Color(1, 1, 1)); bulb.frustumCulled = false; bulb.userData.dynamic = true; g.add(bulb); anim.bulbs = { mesh:bulb, N };
      const NP = 70, pg = new THREE.BufferGeometry(), pos = new Float32Array(NP * 3), cl = new Float32Array(NP * 3);
      pg.setAttribute("position", new THREE.BufferAttribute(pos, 3)); pg.setAttribute("color", new THREE.BufferAttribute(cl, 3));
      const pts = new THREE.Points(pg, new THREE.PointsMaterial({ size:5, sizeAttenuation:false, vertexColors:true, transparent:true, opacity:0.95, depthWrite:false, blending:THREE.AdditiveBlending, fog:false }));
      pts.frustumCulled = false; pts.userData.dynamic = true; g.add(pts);
      const vel = []; for(let k = 0; k < NP; k++){ const a = Math.random() * TAU, e = (Math.random() - 0.2) * Math.PI * 0.9, s = 8 + Math.random() * 9; vel.push([Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s, Math.sin(a) * Math.cos(e) * s]); }
      anim.fw = { pts, pos, cl, vel, NP, t:-1, col:[1, 0.6, 0.2], x:tw.x, y:tw.topZ + 8, z:tw.y };
    }
  },

  /* ---- light and haze: a warm late-afternoon sun, golden light on the grass, a pale haze low down ---- */
  light(G, T){
    if(G.sun){ G.sun.color.set(L("#FFD7A0")); G.sun.intensity = 1.2; }
    G.scene.traverse(o => { if(o.isHemisphereLight && o !== G.envFill){ o.groundColor.copy(L("#B09A5C")); } });
  },

  build(G, world, T, S){
    const t0 = performance.now(), tm = {};
    const step = (k, fn) => { const a = performance.now(); try{ fn(); }catch(e){ console.warn("cota " + k, e.message, e.stack); } tm[k] = Math.round(performance.now() - a); };
    const g = new THREE.Group(); world.add(g); this.root = g; this.T = T;
    let P; step("plan", () => { P = planCota(T, { detail:CFG.detail }); });
    if(!P) return;
    this.P = P; this.anim = null;
    const stats = this.stats = {}, GE = Object.assign(K.plantGeos(), {
      person0:K.personGeo(false, HATS[0]), person1:K.personGeo(false, HATS[1]), person2:K.personGeo(false, HATS[2]), personW:K.personGeo(true, HATS[0]),
      car:K.carGeo(), flag:K.flagGeo(), pennant:K.pennantGeo() });
    this.GE = GE;
    step("terrain", () => { stats.tiles = this.terrain(G, g, P); });
    step("structures", () => { Object.assign(stats, { struct:this.structures(G, g, T, P) }); });
    step("water", () => { stats.water = this.water(G, g, P); });
    this.mat = this.instMat("sway");
    step("plants", () => {
      const L2 = P.lists, near = (it, d) => P.query(it.x, it.y).bar < d;
      const nearOnly = k => L2[k].filter(it => near(it, 190)), farOnly = k => L2[k].filter(it => !near(it, 190));
      stats.chunks = 0;
      for(const k of ["liveOak", "elm", "mesquite", "juniper"]){
        stats.chunks += this.instance(g, GE[k], this.mat, nearOnly(k), true);
        stats.chunks += this.instance(g, GE[k + "Far"], this.mat, farOnly(k), false, 520);
      }
      for(const k of ["pear", "yucca", "grass", "flowers"]) stats.chunks += this.instance(g, GE[k], this.mat, L2[k], false, k === "grass" || k === "flowers" ? 280 : this.CHUNK);
    });
    step("crowds", () => { stats.crowd = this.crowds(G, g, T, P, GE); });
    step("dressing", () => { stats.dress = this.dressing(G, g, T, P, GE); });
    step("signs", () => { stats.signs = this.signs(G, g, T, P); });
    step("sky", () => this.sky(G, g, T, P));
    this.light(G, T);
    tm.total = Math.round(performance.now() - t0);
    this.timing = tm; Object.assign(stats, P.stats);
    try{ window.__cota = { stats, timing:tm, audit:() => auditCota(P, T), plan:P }; }catch(e){}
  },

  frame(S, G){
    const t = S.clock || 0, dt = this._t == null ? 0 : clamp(t - this._t, 0, 0.1); this._t = t;
    this.U.time.value = t;
    const wv = G.wetVis || 0;
    if(this.groundMat) this.groundMat.color.setScalar(1 - wv * 0.22);
    if(this.mat) this.mat.color.setScalar(1 - wv * 0.12);
    const A = this.anim; if(!A) return;
    const W = A.wheel;
    if(W){
      W.a += dt * TAU / 240; W.wheel.rotation.z = W.a;
      for(let k = 0; k < W.n; k++){ const a = W.a + k / W.n * TAU; W.m.makeTranslation(Math.cos(a) * W.R, W.hub + Math.sin(a) * W.R - 1.5, 0); W.gon.setMatrixAt(k, W.m); }
      W.gon.instanceMatrix.needsUpdate = true;
    }
    for(const b of A.balloons){
      b.a += dt * b.B.sp; const x = A.cx + Math.cos(b.a) * b.B.r, y = A.cy + Math.sin(b.a) * b.B.r * 0.7;
      b.grp.position.set(x, b.B.h + Math.sin(t * 0.3 + b.B.r) * 4, y); b.grp.rotation.y = t * 0.05;
    }
    if(A.plane){ const a = t * 0.07, r = 900; A.plane.position.set(A.cx + Math.cos(a) * r, 260 + Math.sin(t * 0.2) * 6, A.cy + Math.sin(a) * r * 0.8); A.plane.rotation.set(0, -(a + Math.PI / 2), 0, "YXZ"); A.plane.rotation.z = 0.0; A.plane.rotateX(0.2); }
    if(A.heli){ const a = -t * 0.11 + 1.3, r = 500; A.heli.position.set(A.cx + Math.cos(a) * r, 150 + Math.sin(t * 0.4) * 5, A.cy + Math.sin(a) * r * 0.9); A.heli.rotation.set(0, -(a - Math.PI / 2), 0); A.rotor.rotation.y = t * 30; }
    if(A.clouds){ A.clouds.position.x = this.dome.position.x + ((t * 6) % 2600); }
    if(A.bulbs){ const B = A.bulbs, c = new THREE.Color(); for(let k = 0; k <= B.N; k++){ c.setHSL(((t * 0.35 + k / B.N * 1.0) % 1), 1, 0.55); B.mesh.setColorAt(k, c); } B.mesh.instanceColor.needsUpdate = true; }
    const F = A.fw;
    if(F){
      F.t += dt;
      if(F.t > 3.8 || F.t < 0){ if(F.t > 3.8 || F.t === -1){ F.t = 0; const c = new THREE.Color().setHSL(Math.random(), 1, 0.6); F.col = [c.r, c.g, c.b]; } }
      for(let k = 0; k < F.NP; k++){
        const tt = F.t, v = F.vel[k], life = Math.max(0, 1 - tt / 2.4);
        F.pos[k * 3] = F.x + v[0] * tt; F.pos[k * 3 + 1] = F.y + v[1] * tt - 4.0 * tt * tt; F.pos[k * 3 + 2] = F.z + v[2] * tt;
        F.cl[k * 3] = F.col[0] * life; F.cl[k * 3 + 1] = F.col[1] * life; F.cl[k * 3 + 2] = F.col[2] * life;
      }
      F.pts.geometry.attributes.position.needsUpdate = true; F.pts.geometry.attributes.color.needsUpdate = true;
    }
  },
};

export { COTA };
