import * as THREE from 'three';
import { TAU, clamp } from '../../config/util.js';
import { CFG } from '../../config/settings.js';
import { flat, lin, paint } from './suzuka.js';
import { SPA } from './spa.js';
import { ILG } from './ilg.js';
import { plantGeos } from './spa-kit.js';
import { ilgGeos, movers } from './ilg-kit.js';
import { KIT3, mexTrees } from './mex-kit.js';
import { planMex, auditMex } from './mex-plan.js';

/* ---------- Mexico City: the Autódromo in the sports city -------------------
   The real place round the circuit (mex-plan.js): the Magdalena Mixhuca sports
   city's lawns and avenues of ash, eucalyptus, pepper trees and cypress, and the
   city packed round it, low concrete houses with black water tanks on the roofs
   in every colour along the real streets, apartment blocks further out.

   The autódromo itself: the Foro Sol, the stadium the lap runs through, a full
   bowl of tall stands round the baseball diamond with the podium on it; the
   covered stands down the main straight where they are mapped; the pits and
   paddock on the right with the helipad; the Palacio de los Deportes, its copper
   dome outside the Peraltada; the baseball and athletics stadiums and the two
   velodromes; the old banked Peraltada left beside the new one. And it is the Day
   of the Dead weekend: giant catrinas, a mariachi stage, marigold arches, papel
   picado strung over the fan zone, a monumental flag, crowds in green, white and
   red, flares and confetti in the stadium.

   Above it all: thin, clear high-altitude light, a brown haze low over the city,
   the volcanoes on the horizon, grackles, helicopters and balloons. This world
   inherits Interlagos's (and so Spa's) machinery; it never touches the cameras. */

const MEX = Object.create(ILG);
Object.assign(MEX, {
  fenceZones:[[1, 0.28, 0.35], [-1, 0.755, 0.835], [1, 0.755, 0.835], [-1, 0.90, 0.995]],
  adRuns:[[0.92, 0.27, -1], [0.36, 0.47, 1], [0.36, 0.47, -1], [0.70, 0.75, -1], [0.84, 0.90, -1]],
  crowdCols:["#2E8B45", "#2E8B45", "#F2F2EE", "#F2F2EE", "#D8352A", "#D8352A", "#E4007C", "#F4A21C", "#1E1E22", "#2F5FB8"],
  flagCols:["#1E7A3A", "#F2F2EE", "#C8242A", "#F4A21C", "#E4007C"],

  /* ---- the ground: the sports city's mown lawns, the city's grey-brown, the dry edges ---- */
  groundColours(P){
    const Gd = P.grid, { NX, NY, H, DB, COV, X0, Y0, STEP } = Gd, C = P.C, COL = Gd.COL;
    const hx = c => [parseInt(c.slice(1, 3), 16) / 255, parseInt(c.slice(3, 5), 16) / 255, parseInt(c.slice(5, 7), 16) / 255];
    const K = { grass:hx("#5E8A3A"), grass2:hx("#7A9A44"), dry:hx("#9A9A5A"), verge:hx("#629040"), city:hx("#8E8678"), city2:hx("#A09482"),
      trees:hx("#3E6A2E"), scrub:hx("#7A8048"), park:hx("#7E8084"), pitch:hx("#4E8A32"), ind:hx("#8E8C88") };
    const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const nz = (x, y, s) => 0.5 + 0.25 * (Math.sin(x * 0.0123 * s + 1.3) * Math.cos(y * 0.0171 * s + 0.7) + Math.sin((x + y) * 0.0067 * s));
    for(let r = 0; r < NY; r++) for(let c = 0; c < NX; c++){
      const k = r * NX + c, x = X0 + c * STEP, y = Y0 + r * STEP, cv = COV[k];
      let col;
      if(cv === C.built) col = mixc(K.city, K.city2, nz(x, y, 2));
      else if(cv === C.industry) col = K.ind;
      else if(cv === C.trees) col = K.trees;
      else if(cv === C.scrub) col = K.scrub;
      else if(cv === C.parking) col = mixc(K.park, K.city, 0.2);
      else if(cv === C.pitch) col = K.pitch;
      else col = mixc(mixc(K.grass, K.grass2, nz(x, y, 1)), K.dry, 0.35 * nz(y, x, 2.7));
      col = mixc(K.verge, col, sst(4, 18, DB[k]));
      COL[k * 3] = col[0]; COL[k * 3 + 1] = col[1]; COL[k * 3 + 2] = col[2];
    }
  },

  /* ---- the old Peraltada: faded, cracked asphalt with the ghost of its kerbs ---- */
  oldRoad(G, g, P){
    const pos = [], kerb = [];
    for(const pts of P.oldRoad) for(let k = 0; k < pts.length - 1; k++){
      const [ax, ay, az] = pts[k], [bx, by, bz] = pts[k + 1], L = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / L, ny = (bx - ax) / L;
      const quad = (arr, o0, o1, lift) => arr.push(ax + nx * o0, az + lift, ay + ny * o0, bx + nx * o1, bz + lift, by + ny * o1, bx + nx * o0, bz + lift, by + ny * o0,
                                                  ax + nx * o0, az + lift, ay + ny * o0, ax + nx * o1, az + lift, ay + ny * o1, bx + nx * o1, bz + lift, by + ny * o1);
      quad(pos, -7, 7, 0);
      if(k % 2 === 0){ quad(kerb, 6.2, 7, 0.02); quad(kerb, -7, -6.2, 0.02); }
    }
    const mk = (arr, col, op) => { if(!arr.length) return; const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3)); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color:lin(col), roughness:0.97, transparent:op < 1, opacity:op, polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2 }));
      m.receiveShadow = true; m.userData.dynamic = true; g.add(m); G.tileSplit(m, 250, 20); };
    mk(pos, "#6E6A64", 1); mk(kerb, "#B8786A", 0.7);
  },

  /* ---- everything built: Interlagos's kinds, then the autódromo's own ---- */
  structures(G, g, T, P){
    ILG.structures.call(this, G, g, T, P);
    const K = this.KIT;
    for(const s of P.S){
      let r = null;
      switch(s.kind){
        case "diamond": r = K.diamond(); this.podiumAt = this.toWorld(s, ...r.podium); break;
        case "palacio": case "baseball": case "palillo": case "velodrome": case "velodrome2": r = K[s.kind](s);
          if(r.seats){ for(const [lx, ly, lz] of r.seats){ if(Math.random() > 0.35) continue; const [x, y, z] = this.toWorld(s, lx, ly, lz);
              const ang = Math.atan2(y - s.y, x - s.x); this.fans.push({ x, y, z, h:1, w:1, ry:-ang - Math.PI / 2, tint:this.crowdCols[Math.floor(Math.random() * this.crowdCols.length)] }); } }
          break;
        case "helipad": r = K.helipad(); this.parkedHeli = [s.x, s.y, s.z + 0.15]; break;
        case "catrinas": r = K.catrinas(); break;
        case "mariachi": r = K.mariachi(); break;
        case "flag": r = K.flag(); { const [x, y, z] = this.toWorld(s, 0, r.top, 0); this.bigFlag = { x, y, z, ry:-s.ang }; } break;
      }
      if(!r) continue;
      this.bucketAdd(r.parts, s.x, s.y, s.z, s.ang);
    }
    // the bowl's stands get flares, and the confetti falls over the podium
    if(P.bowl){ for(const st of P.bowl.stands.filter((_, k) => k % 6 === 0)) this.flareSpots.push(this.toWorld(st, 0, st.rows * 0.5, -st.dep * 0.3));
      if(this.podiumAt) this.confettiAt = [this.podiumAt[0], this.podiumAt[1], this.podiumAt[2] + 18, 70]; }
    // papel picado: strings of little paper flags over the fan zone and along the back of the main stands
    const cols = ["#E4007C", "#F4A21C", "#2F78B8", "#2E8B45", "#8A5AA8", "#D8352A", "#F4D23A"];
    const string = (x0, y0, x1, y1, z) => { const L = Math.hypot(x1 - x0, y1 - y0), n = Math.floor(L / 1.3), ang = Math.atan2(y1 - y0, x1 - x0);
      for(let k = 0; k < n; k++){ const t = (k + 0.5) / n, sag = Math.sin(t * Math.PI) * L * 0.04; this.picado.push({ x:x0 + (x1 - x0) * t, y:y0 + (y1 - y0) * t, z:z - sag, ry:-ang, h:1, w:1, tint:cols[k % cols.length] }); } };
    for(const f of P.fanzone || []){ const c = Math.cos(f.ang), s2 = Math.sin(f.ang);
      for(let r = -2; r <= 2; r++) string(f.x - c * 22 - s2 * r * 5, f.y - s2 * 22 + c * r * 5, f.x + c * 22 - s2 * r * 5, f.y + s2 * 22 + c * r * 5, f.z + 7); }
    for(const s of P.S.filter(q => q.kind === "stand" && !q.bowl)){ const [x0, y0, z0] = this.toWorld(s, -s.wid / 2, 0, -s.dep - 4), [x1, y1] = this.toWorld(s, s.wid / 2, 0, -s.dep - 4); string(x0, y0, x1, y1, z0 + 6); }
  },

  /* ---- the instanced things ---- */
  instanced(G, g, P){
    const GE = this.geos, L = P.lists, st = this.stats;
    st.chunks = 0;
    for(const k of ["palm", "ash", "pirul", "euca", "cypress"]){
      const geo = GE[k === "ash" ? "broad" : k];
      st.chunks += this.plant(G, g, geo, this.treeMat, L[k].filter(t => t.shade), true);
      st.chunks += this.plant(G, g, geo, this.treeMat, L[k].filter(t => !t.shade), false);
    }
    st.chunks += this.plant(G, g, GE.broadFar, this.treeMat, L.broadFar, false);
    st.chunks += this.plant(G, g, GE.eucaFar, this.treeMat, L.eucaFar, false);
    for(const k of ["shrub", "grass", "flowers"]) st.chunks += this.plant(G, g, GE[k], this.mat, L[k], false);
    st.chunks += this.plant(G, g, GE.reeds, this.treeMat, L.reeds, false);
    const hg = {}; for(const v of [0, 1, 2]) for(const f of [1, 2, 3]) hg[v + "_" + f] = GE["house" + v](f);
    const by = {};
    for(const h of P.houses){ const key = h.v + "_" + h.floors + (h.d < 140 ? "s" : ""); (by[key] = by[key] || []).push({ x:h.x, y:h.y, z:h.z, ry:-h.ang, sx:h.l, sy:2.9, sz:h.w, tint:h.col }); }
    for(const key in by) st.chunks += this.plant(G, g, hg[key.replace("s", "")], this.mat, by[key], key.endsWith("s"));
    st.houses = P.houses.length;
    st.chunks += this.plant(G, g, GE.car, this.mat, P.cars.filter(c => !c.bus).map(c => ({ x:c.x, y:c.y, z:c.z, ry:-c.ang, h:1, w:1, tint:c.tint })), false);
    st.chunks += this.plant(G, g, GE.car, this.mat, P.cars.filter(c => c.bus).map(c => ({ x:c.x, y:c.y, z:c.z, ry:-c.ang, sx:2.9, sy:2.2, sz:1.4, tint:"#E8E4D8" })), false);
    st.fans = this.fans.length + this.wavers.length;
    st.chunks += this.plant(G, g, GE.fan, this.mat, this.fans, false);
    st.chunks += this.plant(G, g, GE.waver, this.fanMat, this.wavers, false);
    st.chunks += this.plant(G, g, GE.flag, this.flagMat, this.flagList, false);
    st.chunks += this.plant(G, g, this.mv.drum, this.fanMat, this.drummers, false);
    st.chunks += this.plant(G, g, GE.waver, this.fanMat, this.drummers, false);
    st.chunks += this.plant(G, g, GE.fan, this.fanMat, this.players, false);
    st.chunks += this.plant(G, g, GE.picado, this.flagMat, this.picado, false);
    if(this.bigFlag) st.chunks += this.plant(G, g, GE.bigflag, this.flagMat, [{ x:this.bigFlag.x, y:this.bigFlag.y, z:this.bigFlag.z, ry:this.bigFlag.ry, sx:28, sy:28, sz:28, tint:"#FFFFFF" }], true);
    st.picado = this.picado.length;
  },

  /* ---- the sky for the shots that look out: deep high-altitude blue, a brown band low over the city,
     a few fair-weather clouds, the city's towers to the west, and the two volcanoes to the south-east
     where the real ones are (Popocatépetl and Iztaccíhuatl, snow on their tops) ---- */
  sky(G, g, T){
    const bb = T.bounds, cx = bb.minX + bb.w / 2, cy = bb.minY + bb.h / 2, F = this.P;
    const dome = new THREE.SphereGeometry(5200, 24, 12, 0, TAU, 0, Math.PI / 2), p = dome.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
    const zen = lin("#2E6AC0"), mid = lin("#6E9ED8"), smog = lin("#C8B898");
    for(let i = 0; i < p.count; i++){ const el = p.getY(i) / 5200; c.copy(smog).lerp(mid, sst(0, 0.25, el)).lerp(zen, sst(0.25, 1, el)); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    dome.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const dm = new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ vertexColors:true, side:THREE.BackSide, fog:false, depthWrite:false }));
    dm.position.set(cx, -200, cy); dm.renderOrder = -1; dm.frustumCulled = false; dm.userData.dynamic = true; g.add(dm);
    // a real direction, carried through the overall fit's turn
    const th = F.fitTurn || 0, dir = (ex, sy) => { const a = Math.atan2(sy, ex) - th; return [Math.cos(a), Math.sin(a)]; };
    const parts = [];
    // the volcanoes: Popocatépetl (48.6 km east, 42.2 km south) and Iztaccíhuatl (47.1 km east, 25.0 km south), at the horizon
    for(const [ex, sy, h, w, twin] of [[48.6, 42.2, 1300, 2600, false], [47.1, 25.0, 1050, 3600, true]]){
      const [ux, uy] = dir(ex, sy), d = 8800, x = cx + ux * d, y = cy + uy * d;
      if(!twin){ const cn = new THREE.ConeGeometry(w / 2, h, 24, 4, true); cn.translate(x, h / 2, y); parts.push(paint(cn, (px, py) => lin(py > h * 0.72 ? "#F2F4F6" : "#7A8494").lerp(lin("#A8B4C4"), 0.3), () => 0)); }
      else for(const [o, hh] of [[-0.3, 0.85], [0, 1], [0.32, 0.9]]){ const cn = new THREE.ConeGeometry(w / 3, h * hh, 18, 4, true); cn.scale(1.5, 1, 1); cn.translate(x - uy * o * w, h * hh / 2, y + ux * o * w);
        parts.push(paint(cn, (px, py) => lin(py > h * 0.62 ? "#F2F4F6" : "#7A8494").lerp(lin("#A8B4C4"), 0.3), () => 0)); }
    }
    // fair-weather clouds, few and high
    for(let k = 0; k < 10; k++){ const a = k / 10 * TAU + 0.5, rad = 3600 + (k % 3) * 500;
      for(let m = 0; m < 4; m++){ const b = new THREE.IcosahedronGeometry(200 + (m % 2) * 90, 1); b.scale(1.4, 0.55, 1); b.translate(cx + Math.cos(a) * rad + (m - 1.5) * 200, 1300 + (k % 2) * 220 + m * 40, cy + Math.sin(a) * rad + ((m * 31) % 3 - 1) * 120);
        parts.push(paint(b, (x, y) => lin("#E8ECF2").lerp(lin("#FFFFFF"), Math.min(1, Math.max(0, (y - 1200) / 500))), () => 0)); } }
    const mg = new THREE.BufferGeometry(); let nv = 0; for(const q of parts) nv += q.attributes.position.count;
    const pos = new Float32Array(nv * 3), cl = new Float32Array(nv * 3); let o = 0;
    for(const q of parts){ pos.set(q.attributes.position.array, o * 3); cl.set(q.attributes.color.array, o * 3); o += q.attributes.position.count; }
    mg.setAttribute("position", new THREE.BufferAttribute(pos, 3)); mg.setAttribute("color", new THREE.BufferAttribute(cl, 3)); mg.computeVertexNormals();
    const cm = new THREE.Mesh(mg, new THREE.MeshBasicMaterial({ vertexColors:true, fog:false })); cm.frustumCulled = false; cm.userData.dynamic = true; g.add(cm);
    // the city out to the horizon, and its towers clustered to the west (the centre is about 8 km away)
    const blocks = []; let r = 11; const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
    const [wx, wy] = dir(-8.3, -2.5);
    for(let k = 0; k < 520; k++){ const west = k < 90, a = west ? Math.atan2(wy, wx) + (rnd() - 0.5) * 0.5 : rnd() * TAU, rad = west ? 2400 + rnd() * 1800 : 2600 + rnd() * 2200;
      const h = west ? 60 + rnd() * 160 : 12 + rnd() * rnd() * 70, x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
      blocks.push({ x, y, z:F.farHeight(x, y) - 2, ry:rnd() * 3, sx:west ? 24 + rnd() * 20 : 20 + rnd() * 28, sy:h, sz:west ? 22 + rnd() * 16 : 18 + rnd() * 22, tint:["#E8E2D6", "#D8CCB8", "#C8C4BC", "#B8C4D0", "#E8D8C0"][Math.floor(rnd() * 5)] }); }
    const bg = paint(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), flat("#FFFFFF"));
    this.plant(G, g, bg, this.mat, blocks, false);
  },

  /* ---- what moves: helicopters (one sits on the paddock pad), grackles and pigeons, flares in the
     stadium, confetti over the podium, balloons ---- */
  fliers(G, g, T, P){
    const M = this.mv;
    const hb = new THREE.InstancedMesh(M.heli, this.buildMat, 4), hr = new THREE.InstancedMesh(M.rotor, this.buildMat, 4);
    for(const im of [hb, hr]){ im.frustumCulled = false; im.userData.dynamic = true; im.castShadow = true; g.add(im); }
    // both carry instance colours: they share a material, and three.js needs them to agree (see the Interlagos fix)
    ["#F2F2F2", "#1E7A3A", "#C8242A", "#2A2E34"].forEach((c, k) => { hb.setColorAt(k, lin(c)); hr.setColorAt(k, new THREE.Color(1, 1, 1)); });
    hb.instanceColor.needsUpdate = true; hr.instanceColor.needsUpdate = true;
    const bb = T.bounds, cx = bb.minX + bb.w / 2, cy = bb.minY + bb.h / 2;
    this.hl = { hb, hr, list:[0, 1, 2].map(k => ({ cx:cx + (k - 1) * 380, cy:cy + (1 - k) * 220, r:360 + k * 120, h:150 + k * 45, w:0.05 + k * 0.012, ph:k * 2 })), M:new THREE.Matrix4(), q:new THREE.Quaternion(), e:new THREE.Euler(), p:new THREE.Vector3(), s:new THREE.Vector3(1, 1, 1) };
    // the fourth sits on the paddock helipad (or far off, if there is none), rotor turning slowly
    const ph = this.parkedHeli || [cx, cy, -500];
    this.hl.list.push({ parked:ph });
    this.km = null; this.kites = [];
    // grackles (the city's black birds) round the trees by the circuit, pigeons over the plazas
    const trees = [...P.lists.ash, ...P.lists.euca].filter(t => t.shade);
    this.flocks = [];
    for(let k = 0; k < 6 && trees.length; k++){ const t = trees[Math.floor((k + 0.5) / 6 * trees.length)]; this.flocks.push({ x:t.x, y:t.y, z:t.z + t.h + 5, r:16 + k * 3, n:8, kind:"parrot", col:"#1A1A22", ph:k }); }
    if(P.marks.palacio){ const m = P.marks.palacio; this.flocks.push({ x:m.x, y:m.y, z:m.z + 50, r:60, n:12, kind:"heron", col:"#8A8E96", ph:7 }); }
    const nb = this.flocks.reduce((a, f) => a + f.n, 0), bm = new THREE.InstancedMesh(M.bird, this.flagMat2, Math.max(1, nb));
    let b = 0; for(const f of this.flocks) for(let k = 0; k < f.n; k++) bm.setColorAt(b++, lin(f.col));
    if(!nb) bm.setColorAt(0, lin("#1A1A22"));
    bm.instanceColor.needsUpdate = true; bm.frustumCulled = false; bm.userData.dynamic = true; g.add(bm); this.bm = bm;
    // flares in the stadium: green, white and red smoke
    const fn = this.flareSpots.length * 8;
    this.fl = null;
    if(fn){ const fm = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color:0xFFFFFF, transparent:true, opacity:0.5, depthWrite:false }), fn);
      for(let k = 0; k < fn; k++) fm.setColorAt(k, lin(["#2EA84A", "#F2F2EE", "#D8352A"][Math.floor(k / 8) % 3]));
      fm.instanceColor.needsUpdate = true; fm.frustumCulled = false; fm.userData.dynamic = true; g.add(fm); this.fl = { fm, n:fn }; }
    // confetti over the podium
    this.cf = null;
    if(this.confettiAt && CFG.detail !== 0){ const N = 600, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), c = new THREE.Color(), [x0, y0, z0, w] = this.confettiAt;
      const st = []; for(let k = 0; k < N; k++){ st.push({ x:x0 + (Math.random() - 0.5) * w, y:y0 + (Math.random() - 0.5) * w, z:z0 + Math.random() * 20, v:1 + Math.random(), ph:Math.random() * 6.3 }); c.set(["#1E7A3A", "#F2F2EE", "#C8242A", "#F4A21C", "#E4007C"][k % 5]).convertSRGBToLinear(); col.set([c.r, c.g, c.b], k * 3); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size:3, sizeAttenuation:false, vertexColors:true })); pts.frustumCulled = false; pts.userData.dynamic = true; g.add(pts);
      this.cf = { pts, pos, st, z0 }; }
  },
  mist(){ this.ms = null; },

  /* ---- light: thin, clear and hard at 2,240 m; a warm-white sun, a blue fill, a brown haze low down ---- */
  light(G, T){
    if(G.sun){ G.sun.color.copy(lin("#FFF4E0")); G.sun.intensity = 1.35; }
    G.scene.traverse(o => { if(o.isHemisphereLight && o !== G.envFill){ o.color.copy(lin("#9EBCE0")); o.groundColor.copy(lin("#7A7458")); } });
    if(G.scene.fog) G.scene.fog.color.copy(lin("#D6CAB2"));
    G.scene.background = lin("#CFC6B4");
    G.fogNear = -40; G.fogSpanK = 1.1;
  },

  build(G, world, T, S){
    const t0 = performance.now(), tm = {};
    const step = (k, fn) => { const a = performance.now(); try{ fn(); }catch(e){ console.warn("mexico " + k, e.message, e.stack); } tm[k] = Math.round(performance.now() - a); };
    const g = new THREE.Group(); world.add(g); this.root = g; this.T = T; this._t = null;
    let P;
    step("plan", () => { P = planMex(T, { detail:CFG.detail }); });
    if(!P) return;
    this.P = P; this.stats = {}; this.buckets = new Map(); this.chimneys = []; this.fans = []; this.wavers = []; this.flagList = [];
    this.drummers = []; this.players = []; this.flareSpots = []; this.helipads = []; this.drumBanks = 0; this.confettiAt = null; this.picado = [];
    this.podiumAt = null; this.parkedHeli = null; this.bigFlag = null;
    this.sm = null; this.cy = null; this.bl = null; this.lamps = null; this.lakeMat = null;
    this.KIT = KIT3;
    this.U.cloud.value = this.cloudTex();
    const sp = plantGeos();
    this.geos = Object.assign({}, ilgGeos({ tank:"#1E1E22", rebar:true }), mexTrees(), { fan:sp.fan, waver:sp.waver, flag:sp.flag, tyres:sp.tyres, car:sp.car });
    this.mv = movers();
    this.mat = this.swayMat("small", 0.0, 9, 1, {});
    this.treeMat = this.swayMat("tree", 0.01, 0.3, 1.2, {});
    this.fanMat = this.swayMat("fan", 0.55, 1.25, 3.8, {});
    this.flagMat = this.swayMat("flag", 0, 0, 1, { side:THREE.DoubleSide });
    this.flagMat2 = this.swayMat("small", 0.0, 9, 1, { side:THREE.DoubleSide });
    for(const m of [this.mat, this.treeMat, this.fanMat, this.flagMat]) G.cutMat(m);
    step("colours", () => this.groundColours(P));
    step("terrain", () => { this.stats.tiles = this.terrain(G, g, P); });
    step("horizon", () => this.horizon(G, g, P, T));
    step("verges", () => this.verges(G, g, T));
    step("water", () => { this.water(G, g, P); this.lakes(G, g, P); });
    step("roads", () => { this.roads(G, g, P); this.oldRoad(G, g, P); });
    step("patches", () => this.patches(G, g, T));
    step("structures", () => this.structures(G, g, T, P));
    step("bake", () => { this.stats.buildingChunks = this.bucketBake(G, g); });
    step("barriers", () => this.barriers(G, g, T, P));
    step("instanced", () => this.instanced(G, g, P));
    step("sky", () => this.sky(G, g, T));
    step("fliers", () => this.fliers(G, g, T, P));
    step("balloons", () => this.balloons(G, g, T));
    this.light(G, T);
    tm.total = Math.round(performance.now() - t0);
    this.timing = tm;
    Object.assign(this.stats, P.stats);
    try{ window.__mexico = { stats:this.stats, timing:tm, audit:() => auditMex(P, T), plan:P }; }catch(e){}
  },

  frame(S, G){
    ILG.frame.call(this, S, G);
    // the parked helicopter: sitting on the pad, rotor idling
    const H = this.hl, t = S.clock || 0;
    if(H && H.list[3] && H.list[3].parked){ const p = H.list[3].parked;
      H.p.set(p[0], p[2], p[1]); H.e.set(0, 0.6, 0); H.q.setFromEuler(H.e); H.M.compose(H.p, H.q, H.s); H.hb.setMatrixAt(3, H.M);
      H.e.set(0, 0.6 + t * 3, 0); H.q.setFromEuler(H.e); H.M.compose(H.p, H.q, H.s); H.hr.setMatrixAt(3, H.M);
      H.hb.instanceMatrix.needsUpdate = true; H.hr.instanceMatrix.needsUpdate = true; }
    // the air is clear here: the cloud shadows are few and slow
    this.U.cloudOff.value.set(t * 4, t * 2.5);
    this.U.cloudAmt.value = 0.55 * (1 - (G.wetVis || 0) * 0.3);
  },
});
const sst = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export { MEX };
