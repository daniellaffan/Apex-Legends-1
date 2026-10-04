import * as THREE from 'three';
import { TAU, clamp } from '../../config/util.js';
import { CFG } from '../../config/settings.js';
import { planMonza, auditMonza } from './monza-plan.js';
import * as K from './cota-kit.js';
import * as N from './singapore-kit.js';
import * as B from './baku-kit.js';
import * as M from './monza-kit.js';
import { BAKU, instMat, instance } from './baku.js';

const { L, shadeC, fh, sst, Mesher } = K;
const WIND = 0.6;
const TIFOSI = ["#D8352A", "#D8352A", "#E8402E", "#C8281E", "#F4F2EC", "#2E9A4A", "#F2C230", "#2E6AB8", "#E8509C"];

/* ---------- Monza: the royal park ---------------------------------------------------------
   A temple of speed in a woodland: tall oaks, planes, beeches and umbrella pines (capped so the road is never hidden from the
   fixed overhead lens: tall to the north-west of it, low to the south-east), clearings with lawns and gravel avenues, ponds, a
   walled park with stone gate pillars, the ruined banking of the old oval and the flyover the road passes under, a royal villa
   in the trees, huge stands of tifosi (red above all) with flares and tricolour flags, the pit building and a paddock of
   marquees, a campers' village, car parks, a blimp over the circuit and pigeons over the trees. Repeated things are instanced,
   static structures merged per 300 m square; the stands, pit building and footbridges share Baku's builder.                  */

const MONZA = {
  U:{ value:0 },

  ground(g, P){
    const { X0, Y0, STEP, NX, NY, H, COL } = P.grid, TILE = 48, mat = new THREE.MeshLambertMaterial({ vertexColors:true }), c = new THREE.Color();
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
    return tiles;
  },

  /* gravel avenues and ponds laid on the ground */
  details(g, P){
    const S = P.structs, pos = [], col = [], gc = L("#CDBF98"), gc2 = L("#BDAE88");
    for(const path of S.paths) for(let k = 0; k < path.length - 1; k++){
      const [ax, ay] = path[k], [bx, by] = path[k + 1], dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1, nx = -dy / l * 2.4, ny = dx / l * 2.4, za = P.height(ax, ay) + 0.12, zb = P.height(bx, by) + 0.12, C = k & 1 ? gc : gc2;
      for(const [x, y, z] of [[ax - nx, ay - ny, za], [bx - nx, by - ny, zb], [bx + nx, by + ny, zb], [ax - nx, ay - ny, za], [bx + nx, by + ny, zb], [ax + nx, ay + ny, za]]){ pos.push(x, z, y); col.push(C.r, C.g, C.b); }
    }
    let made = 0;
    if(pos.length){ const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); geo.computeVertexNormals(); geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors:true, side:THREE.DoubleSide })); m.receiveShadow = true; m.userData.dynamic = true; g.add(m); made++; }
    for(const p of S.ponds){ const N2 = 22, pp = []; for(let k = 0; k < N2; k++){ const a0 = k / N2 * TAU, a1 = (k + 1) / N2 * TAU, r0 = p.r * (1 + 0.1 * Math.sin(a0 * 3)), r1 = p.r * (1 + 0.1 * Math.sin(a1 * 3));
        pp.push(p.x, p.z + 0.1, p.y, p.x + Math.cos(a1) * r1, p.z + 0.1, p.y + Math.sin(a1) * r1, p.x + Math.cos(a0) * r0, p.z + 0.1, p.y + Math.sin(a0) * r0); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pp, 3)); geo.computeVertexNormals(); geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ color:L("#4A8A8C"), shininess:90, specular:new THREE.Color(0.5, 0.55, 0.6), transparent:true, opacity:0.9 })); m.userData.dynamic = true; g.add(m); made++; }
    return made;
  },

  /* ---- the buildings, the banking, the flyover, tents, walls: merged ---- */
  city(g, P, T){
    const S = P.structs, TW = new N.Town(320), tex = B.dayTextures(), lam = map => new THREE.MeshLambertMaterial({ map, vertexColors:true });
    const mats = { grid:lam(tex.grid), band:lam(tex.band), slim:lam(tex.slim), solid:new THREE.MeshLambertMaterial({ vertexColors:true, side:THREE.DoubleSide }), bright:new THREE.MeshBasicMaterial({ vertexColors:true, side:THREE.DoubleSide }) };
    this.cityMats = mats;
    for(const b of S.buildings){ if(b.type === "villa") M.villa(TW, b); else B.building(TW, b, []); }
    for(const bk of S.banks) M.banking(T, P, bk, TW);
    if(S.flyover) M.flyover(T, P, S.flyover, TW);
    M.parkWall(TW, S.walls, S.pillars);
    for(const t of S.tents) M.tent(TW, t, false);
    for(const q of S.paddock) M.tent(TW, { x:q.x, y:q.y, z:P.height(q.x, q.y), ang:q.ang, w:q.w, d:q.d, c:q.c }, true);
    const st = { tris:TW.tris }; st.meshes = TW.emit(g, mats, true);
    return st;
  },

  /* ---- the things that move: blimp, pigeons, flares ---- */
  features(g, P, T){
    const S = P.structs, anim = this.anim = {};
    const bl = new THREE.Mesh(M.blimpGeo(), new THREE.MeshLambertMaterial({ vertexColors:true, side:THREE.DoubleSide })); bl.frustumCulled = false; bl.userData.dynamic = true; g.add(bl); anim.blimp = { mesh:bl, S:S.blimp };
    const bd = new THREE.InstancedMesh(B.gullGeo(), instMat("flap", this.U), Math.max(S.birds.length, 1)); bd.frustumCulled = false; bd.userData.dynamic = true; g.add(bd);
    for(let i = 0; i < Math.max(S.birds.length, 1); i++) bd.setColorAt(i, new THREE.Color(0.55, 0.55, 0.6)); anim.birds = { mesh:bd, list:S.birds };
    // flares: red smoke rising from a few stands
    const spots = []; for(const st of S.stands) if(["main", "parab-in", "rettifilo", "ascari"].includes(st.name)) for(let k = 2; k < st.span - 1; k += Math.max(3, Math.round(st.span / 3))){ const i = (st.i0 + k) % T.n, [x, y] = P.at(i, st.side, st.off0 + st.depth * 0.5); spots.push({ x, y, z:(st.zb ? st.zb[k] : T.z[i]) + st.rows * st.rowH * 0.55 }); }
    const NP = spots.length * 28, pg = new THREE.BufferGeometry(), pos = new Float32Array(NP * 3), cl = new Float32Array(NP * 3); pg.setAttribute("position", new THREE.BufferAttribute(pos, 3)); pg.setAttribute("color", new THREE.BufferAttribute(cl, 3));
    const pts = new THREE.Points(pg, new THREE.PointsMaterial({ size:11, sizeAttenuation:false, vertexColors:true, transparent:true, opacity:0.55, depthWrite:false })); pts.frustumCulled = false; pts.userData.dynamic = true; g.add(pts); anim.flares = { pts, pos, cl, spots };
    anim.cx = T.bounds.minX + T.bounds.w / 2; anim.cy = T.bounds.minY + T.bounds.h / 2;
  },

  signs(g, P, T){
    if(typeof document === "undefined") return 0;
    const S = P.structs, mk = (w, h, draw) => { const cv = document.createElement("canvas"); cv.width = w; cv.height = h; draw(cv.getContext("2d"), w, h);
      const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; return new THREE.MeshBasicMaterial({ map:t, side:THREE.DoubleSide, toneMapped:false }); };
    const font = (px, wg) => (wg || 800) + " " + px + "px 'Saira Condensed',Impact,sans-serif";
    const SCR = [["FORZA!", "Make some noise. Then more.", "#8A0A14", "#FFE0A0"], ["TEMPLE OF SPEED", "Please remove your hat in Turn 1", "#143A2A", "#9AF0C0"], ["ESPRESSO BREAK", "Back after the Parabolica", "#3A1E12", "#FFD890"], ["MIND THE CHICANE", "It is smaller than it looks", "#1A1D28", "#FFC23A"]];
    const screens = S.screens.map((s, k) => { const [a, b, bg, fg] = SCR[k % SCR.length];
      const mat = mk(512, 288, (c, w, h) => { c.fillStyle = bg; c.fillRect(0, 0, w, h); for(let q = 0; q < 12; q++){ c.fillStyle = "rgba(255,255,255," + (0.03 + (q % 3) * 0.02) + ")"; c.fillRect(0, q * 24, w, 10); }
        c.fillStyle = fg; c.textAlign = "center"; c.font = font(84); c.fillText(a, w / 2, h * 0.5); c.font = font(36, 700); c.fillText(b, w / 2, h * 0.74); c.strokeStyle = fg; c.lineWidth = 8; c.strokeRect(10, 10, w - 20, h - 20); });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(14, 7.9), mat); m.position.set(s.x, s.z + 11.2, s.y); m.rotation.y = Math.PI / 2 - (s.a0 - s.side * Math.PI / 2); m.userData.dynamic = true; g.add(m);
      const pm = new THREE.MeshLambertMaterial({ color:L("#6A6E80") }); for(const q of [-6.4, 6.4]){ const p = new THREE.Mesh(new THREE.BoxGeometry(0.8, 11, 0.8), pm); p.position.set(s.x + Math.cos(s.a0) * q, s.z + 5.5, s.y + Math.sin(s.a0) * q); p.userData.dynamic = true; g.add(p); }
      return m; });
    { const mat = mk(1024, 256, (c, w, h) => { c.fillStyle = "#B8121A"; c.fillRect(0, 0, w, h);
        for(let q = 0; q < 6; q++){ c.fillStyle = "rgba(255,255,255,0.16)"; c.beginPath(); c.moveTo(q * 60, h); c.lineTo(q * 60 + 70, 0); c.lineTo(q * 60 + 100, 0); c.lineTo(q * 60 + 30, h); c.fill(); }
        c.fillStyle = "#FFFFFF"; c.textAlign = "center"; c.font = font(150, 900); c.fillText("PADDOCK", w / 2 + 20, h * 0.66);
        c.fillStyle = "#FFE08A"; c.font = font(44, 700); c.fillText("TEAMS · GUESTS · ONE VERY LONG QUEUE FOR COFFEE", w / 2 + 20, h * 0.92);
        for(let q = 0; q < 32; q++){ c.fillStyle = q & 1 ? "#111" : "#FFF"; c.fillRect(q * 32, 0, 32, 14); c.fillStyle = q & 1 ? "#FFF" : "#111"; c.fillRect(q * 32, 14, 32, 14); } });
      const pb = S.pit, i = pb.i0, side = pb.side, [x, y] = P.at(i, side, T.half + T.pitW + 12), z = T.z[i];
      const m = new THREE.Mesh(new THREE.PlaneGeometry(26, 6.5), mat); m.position.set(x, z + 12.5, y); m.rotation.y = Math.PI / 2 - (T.ang[i] - side * Math.PI / 2); m.userData.dynamic = true; g.add(m);
      const pm = new THREE.MeshLambertMaterial({ color:L("#6A6E80") }); for(const q of [-13, 13]){ const p = new THREE.Mesh(new THREE.BoxGeometry(0.9, 15, 0.9), pm); p.position.set(x + Math.cos(T.ang[i]) * q, z + 7, y + Math.sin(T.ang[i]) * q); p.userData.dynamic = true; g.add(p); } }
    return screens.length + 1;
  },

  build(G, world, T, S){
    const t0 = performance.now(), tm = {}, stats = this.stats = {};
    const step = (k, fn) => { const a = performance.now(); try{ fn(); }catch(e){ console.warn("monza " + k, e.message, e.stack); } tm[k] = Math.round(performance.now() - a); };
    const g = new THREE.Group(); world.add(g); this.root = g; this.T = T;
    let P; step("plan", () => { P = planMonza(T, { detail:CFG.detail }); });
    if(!P) return;
    this.P = P; this.anim = null;
    step("ground", () => { stats.tiles = this.ground(g, P); stats.details = this.details(g, P); });
    step("city", () => { stats.city = this.city(g, P, T); });
    step("structures", () => { stats.structs = BAKU.structures.call(this, g, P, T); });
    const GE = Object.assign(M.treeGeos(), N.lampGeos(), { car:K.carGeo(), person:K.personGeo(false, null), personW:K.personGeo(true, null), flag:M.tricolourGeo(), tyres:N.tyreGeo() });
    const sway = instMat("sway", this.U), plain = instMat("plain", this.U), wave = instMat("wave", this.U), flagM = instMat("flag", this.U);
    this.treeMats = [sway];
    step("instances", () => {
      const tint = () => [0.86 + Math.random() * 0.28, 0.9 + Math.random() * 0.2, 0.86 + Math.random() * 0.28], near = (x, y) => P.clearance(x, y) < 150, SS = P.structs; let c = 0;
      const by = k => SS.trees.filter(t => t.kind === k).map(t => ({ ...t, tint:tint() }));
      for(const k of ["oak", "plane", "beech"]){ const list = by(k); c += instance(g, GE[k], sway, list.filter(t => near(t.x, t.y)), true, 300); c += instance(g, GE[k + "Far"], sway, list.filter(t => !near(t.x, t.y)), false, 500); }
      const pines = SS.pines.map(t => ({ ...t, tint:tint() })); c += instance(g, GE.pine, sway, pines.filter(t => near(t.x, t.y)), true, 300); c += instance(g, GE.pineFar, sway, pines.filter(t => !near(t.x, t.y)), false, 500);
      c += instance(g, GE.shrub, sway, SS.shrubs.map(t => ({ ...t, w:1.4, tint:tint() })), false, 300);
      c += instance(g, GE.lamp, plain, SS.lamps.map(l => ({ x:l.x, y:l.y, z:l.z, ry:-l.ang, h:1, w:1 })), false, 400);
      c += instance(g, GE.car, plain, SS.cars.map((q, k) => ({ x:q.x, y:q.y, z:q.z + 0.05, ry:-q.ry, sx:4.2, sy:2.0, sz:4.3, tint:["#C8C8CC", "#222428", "#8A1E1E", "#2E4E8A", "#D8D8D0", "#5A5E66", "#1E5A3A", "#E8E4D8"][k % 8] })), false, 400);
      c += instance(g, GE.tyres, plain, SS.tyres.map(q => ({ x:q.x, y:q.y, z:q.z, ry:q.c * 0.7, h:1, w:1 })), false, 400);
      stats.instChunks = c;
      const R2 = (() => { let a = 4711; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; })(), sp = CFG.detail === 0 ? 2.6 : 1.9, list = [], wv = [], n = T.n;
      for(const s of SS.stands){
        if(!s.zb) continue;
        for(let r = 1; r < s.rows; r += 2) for(let k = 0; k < s.span; k++){
          if(k % 9 === 0) continue;
          const ia = (s.i0 + k) % n, ib = (s.i0 + k + 1) % n, o = s.off0 + r * s.rowD + s.rowD * 0.5;
          for(let q = 0; q < T.ds; q += sp){
            if(R2() > s.fill) continue; const t = q / T.ds, pa = P.at(ia, s.side, o), pb = P.at(ib, s.side, o), z = s.zb[k] + (r + 1) * s.rowH + (s.zb[k + 1] - s.zb[k]) * t;
            (R2() < 0.22 ? wv : list).push({ x:pa[0] + (pb[0] - pa[0]) * t, y:pa[1] + (pb[1] - pa[1]) * t, z, ry:-Math.atan2(-s.side * T.ny[ia], -s.side * T.nx[ia]) + Math.PI / 2 + (R2() - 0.5) * 0.5, h:1.95 + R2() * 0.25, w:1, tint:TIFOSI[(R2() * TIFOSI.length) | 0] });
          }
        }
      }
      for(const f of SS.footbridges){ const ca = Math.cos(f.ang + Math.PI / 2), sa = Math.sin(f.ang + Math.PI / 2), mx = (f.pl[0] + f.pr[0]) / 2, my = (f.pl[1] + f.pr[1]) / 2;
        for(let a = -f.len / 2 + 2; a < f.len / 2 - 2; a += 2.2) if(R2() < 0.55) (R2() < 0.4 ? wv : list).push({ x:mx + ca * a + Math.cos(f.ang) * (R2() - 0.5) * 1.8, y:my + sa * a + Math.sin(f.ang) * (R2() - 0.5) * 1.8, z:f.z + 6.2, ry:R2() * 6.28, h:2.0, w:1, tint:TIFOSI[(R2() * TIFOSI.length) | 0] }); }
      // the flyover's rail has fans on it too, and the campers stand about their tents
      if(SS.flyover){ const F = SS.flyover, ang = Math.atan2(F.pr[1] - F.pl[1], F.pr[0] - F.pl[0]); for(let a = -F.len / 2 - 6; a < F.len / 2 + 6; a += 2.6) if(R2() < 0.5) (R2() < 0.3 ? wv : list).push({ x:(F.pl[0] + F.pr[0]) / 2 + Math.cos(ang) * a, y:(F.pl[1] + F.pr[1]) / 2 + Math.sin(ang) * a, z:F.z + 7.4, ry:R2() * 6.28, h:2.0, w:1, tint:TIFOSI[(R2() * TIFOSI.length) | 0] }); }
      for(const tn of SS.tents) if(R2() < 0.5) (R2() < 0.2 ? wv : list).push({ x:tn.x + 3 + R2() * 2, y:tn.y + 2 + R2() * 2, z:tn.z, ry:R2() * 6.28, h:1.9, w:1, tint:TIFOSI[(R2() * TIFOSI.length) | 0] });
      stats.crowd = list.length + wv.length; instance(g, GE.person, wave, list, false, 500); instance(g, GE.personW, wave, wv, false, 500);
      instance(g, GE.flag, flagM, SS.flagPoles.map(p => ({ x:p.x, y:p.y, z:p.z + p.h - 0.4, ry:-WIND, sx:2.6, sy:2.6, sz:2.6 })), false, 600);
    });
    step("features", () => this.features(g, P, T));
    step("sky", () => BAKU.sky.call(this, g, T));
    step("signs", () => { stats.signs = this.signs(g, P, T); });
    step("cut", () => { for(const m of Object.values(this.cityMats).concat(this.treeMats)) G.cutMat(m); });
    this.light(G, T);
    tm.total = Math.round(performance.now() - t0); this.timing = tm; Object.assign(stats, { counts:P.stats.counts });
    try{ window.__monza = { stats, timing:tm, audit:() => auditMonza(P, T), plan:P }; }catch(e){}
  },

  light(G, T){
    if(G.sun) G.sun.color.set(L("#FFF0D6"));
    G.scene.traverse(o => { if(o.isHemisphereLight && o !== G.envFill){ o.groundColor.copy(L("#8A9A60")); } });
  },

  frame(S, G){
    const t = S.clock || 0, dt = this._t == null ? 0 : clamp(t - this._t, 0, 0.1); this._t = t;
    this.U.value = t;
    const A = this.anim; if(!A) return;
    if(this.clouds) this.clouds.position.x = this.dome.position.x + ((t * 5) % 2400);
    const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), M4 = new THREE.Matrix4(), ps = new THREE.Vector3(), sc = new THREE.Vector3();
    if(A.birds){ const b2 = A.birds; b2.list.forEach((b, i) => { const a = b.a + t * b.sp, hd = a + (b.sp > 0 ? Math.PI / 2 : -Math.PI / 2); q.setFromAxisAngle(up, -hd + Math.PI / 2); ps.set(b.x + Math.cos(a) * b.r, b.h + Math.sin(t * 0.5 + b.ph) * 3, b.y + Math.sin(a) * b.r); sc.setScalar(1.3); M4.compose(ps, q, sc); b2.mesh.setMatrixAt(i, M4); }); b2.mesh.instanceMatrix.needsUpdate = true; }
    if(A.blimp){ const B2 = A.blimp, a = t * 0.012; B2.mesh.position.set(B2.S.x + Math.cos(a) * B2.S.r, B2.S.h + Math.sin(t * 0.2) * 3, B2.S.y + Math.sin(a) * B2.S.r * 0.8); B2.mesh.rotation.y = -(a + Math.PI / 2); }
    if(A.flares){ const F = A.flares; let j = 0; for(const sp of F.spots) for(let p = 0; p < 28; p++, j++){ const ph = ((t * 0.28 + p / 28 + sp.x * 0.001) % 1), drift = ph * 18;
        F.pos[j * 3] = sp.x + Math.cos(WIND) * drift + Math.sin(p * 2.1) * (0.6 + ph * 2); F.pos[j * 3 + 1] = sp.z + ph * 14; F.pos[j * 3 + 2] = sp.y + Math.sin(WIND) * drift + Math.cos(p * 1.7) * (0.6 + ph * 2);
        const fade = Math.sin(ph * Math.PI); F.cl[j * 3] = 0.95 * fade; F.cl[j * 3 + 1] = (0.28 + 0.4 * ph) * fade; F.cl[j * 3 + 2] = (0.22 + 0.4 * ph) * fade; }
      F.pts.geometry.attributes.position.needsUpdate = true; F.pts.geometry.attributes.color.needsUpdate = true; }
  },
};

export { MONZA };
