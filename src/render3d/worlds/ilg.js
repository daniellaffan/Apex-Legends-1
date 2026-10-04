import * as THREE from 'three';
import { TAU, clamp } from '../../config/util.js';
import { CFG } from '../../config/settings.js';
import { TEAMS } from '../../config/teams.js';
import { flat, lin, paint } from './suzuka.js';
import { SPA } from './spa.js';
import { KIT } from './spa-kit.js';
import { planIlg, auditIlg } from './ilg-plan.js';
import { KIT2, ilgGeos, movers } from './ilg-kit.js';
import { plantGeos } from './spa-kit.js';

/* ---------- Interlagos: the bowl --------------------------------------------
   The real ground round the circuit (SRTM, carried onto the game's lap by
   ilg-plan.js): the green grounds and grassy banks in the bowl, the lake behind
   the Descida do Lago and the reedy pond in the infield, and the city packed
   round it on every side: thousands of small houses in every colour along the
   real streets, tower blocks with helipads further out, warehouses, football
   pitches with a game on. On the circuit: the pits and paddock on the left of
   the uphill straight, the covered main stand across from them, stands round the
   Senna S and crowded banks round the bowl in yellow, green and blue, with flags,
   flares, confetti and drums; big screens, marshal posts, camera towers, catch
   fencing and silly adverts. Above it: helicopters, kites, parrots, toucans and
   herons, and a storm coming in under a low golden sun.

   This world inherits Spa's machinery (terrain, cloud shadows, the sway shader,
   merged buildings, stands, gantry, sign) and adds its own; it never touches the
   cameras. Everything repeated is instanced or merged in 200 m chunks. */

const sst = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const CROWD = ["#F4D23A", "#F4D23A", "#2E8B45", "#2E8B45", "#2F5FB8", "#F2F2EE", "#F4D23A", "#2E8B45", "#E8742A", "#1E1E22"];

const ILG = Object.create(SPA);
Object.assign(ILG, {
  // catch fencing (side, from, to): the outside of the Senna S, Junção, and the stands along the straight
  fenceZones:[[1, 0.040, 0.112], [1, 0.690, 0.728], [1, 0.880, 0.995]],
  // advert runs on the Armco (from, to, side)
  adRuns:[[0.12, 0.29, 1], [0.12, 0.29, -1], [0.40, 0.46, 1], [0.54, 0.58, 1], [0.64, 0.70, -1], [0.73, 0.85, 1], [0.86, 0.995, 1], [0.005, 0.04, 1]],

  /* ---- the ground: rich tropical greens in the grounds, packed earth and concrete in the city ---- */
  groundColours(P){
    const Gd = P.grid, { NX, NY, H, DB, COV, X0, Y0, STEP } = Gd, C = P.C, COL = Gd.COL;
    const hx = c => [parseInt(c.slice(1, 3), 16) / 255, parseInt(c.slice(3, 5), 16) / 255, parseInt(c.slice(5, 7), 16) / 255];
    const K = { grass:hx("#4E8A2E"), grass2:hx("#6A9A36"), lush:hx("#3E7A26"), verge:hx("#5A9236"), city:hx("#8A7E6A"), city2:hx("#9C8C74"),
      dirt:hx("#9A6A44"), trees:hx("#2E5A22"), scrub:hx("#6A7A3A"), park:hx("#7E8084"), pitch:hx("#5E9A3A"), ind:hx("#8E8C88"), kart:hx("#6A6C70"),
      wet:hx("#4E6A3A"), mud:hx("#6A5A3E") };
    const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const nz = (x, y, s) => 0.5 + 0.25 * (Math.sin(x * 0.0123 * s + 1.3) * Math.cos(y * 0.0171 * s + 0.7) + Math.sin((x + y) * 0.0067 * s));
    for(let r = 0; r < NY; r++) for(let c = 0; c < NX; c++){
      const k = r * NX + c, x = X0 + c * STEP, y = Y0 + r * STEP, cv = COV[k], db = DB[k];
      let col;
      if(cv === C.built) col = mixc(mixc(K.city, K.city2, nz(x, y, 2)), K.dirt, 0.25 * nz(y, x, 3));
      else if(cv === C.industry) col = K.ind;
      else if(cv === C.trees) col = K.trees;
      else if(cv === C.scrub) col = K.scrub;
      else if(cv === C.parking) col = mixc(K.park, K.city, 0.3);
      else if(cv === C.pitch) col = K.pitch;
      else if(cv === C.kart) col = K.kart;
      else if(cv === C.water || cv === C.wetland) col = K.mud;
      else col = mixc(mixc(K.grass, K.grass2, nz(x, y, 1)), K.lush, nz(y, x, 2.3) * 0.6);
      col = mixc(K.verge, col, sst(4, 18, db));
      const sl = c > 0 && c < NX - 1 && r > 0 && r < NY - 1 ? Math.hypot(H[k + 1] - H[k - 1], H[k + NX] - H[k - NX]) / (2 * STEP) : 0;
      col = mixc(col, K.dirt, sst(0.45, 0.95, sl) * (db > 3 ? 0.6 : 0));
      COL[k * 3] = col[0]; COL[k * 3 + 1] = col[1]; COL[k * 3 + 2] = col[2];
    }
  },

  /* ---- the lakes: a flat surface over each one's cells, slightly murky green ---- */
  lakes(G, g, P){
    const Gd = P.grid, { X0, Y0, STEP, NX } = Gd, pos = [], h = STEP * 0.62;
    for(const lk of P.lakes) for(const k of lk.cells){
      const x = X0 + (k % NX) * STEP, y = Y0 + ((k / NX) | 0) * STEP, z = lk.level;
      pos.push(x - h, z, y - h, x - h, z, y + h, x + h, z, y + h,  x - h, z, y - h, x + h, z, y + h, x + h, z, y - h);
    }
    if(!pos.length) return;
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals(); geo.computeBoundingSphere();
    this.lakeMat = new THREE.MeshStandardMaterial({ color:lin("#4E6A5E"), roughness:0.1, metalness:0, envMapIntensity:1.0 });
    const m = new THREE.Mesh(geo, this.lakeMat); m.receiveShadow = true; m.userData.dynamic = true; g.add(m); G.tileSplit(m, 250, 50);
    if(P.jetty){ const r = KIT2.jetty(P.jetty); this.bucketAdd(r.parts, P.jetty.x, P.jetty.y, P.jetty.z, P.jetty.ang); }
  },

  /* ---- the darker patches in the asphalt: one translucent ribbon, patch by patch round the lap ---- */
  patches(G, g, T){
    const n = T.n, w = T.half, pa = new Float32Array(n), pb = new Float32Array(n), on = new Uint8Array(n);
    let r = 41; const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
    for(let k = 0; k < 70; k++){ const i0 = Math.floor(rnd() * n), len = 2 + Math.floor(rnd() * 5), c = (rnd() - 0.5) * w * 1.3, hw = 1.2 + rnd() * 2.4;
      for(let j = 0; j <= len; j++){ const i = (i0 + j) % n; if(on[i]) continue; on[i] = 1; pa[i] = Math.max(-w + 0.4, c - hw); pb[i] = Math.min(w - 0.4, c + hw); } }
    const geo = G.strip(T, i => pa[i], i => pb[i], (G.roadLift || 0.1) + 0.006, 7, i => on[i] && on[(i + 1) % n]);
    if(geo){ const m = G.add(g, geo, new THREE.MeshStandardMaterial({ color:lin("#2A2C30"), roughness:0.9, transparent:true, opacity:0.32, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-1 })); G.tileSplit(m, 250, 20); }
  },

  /* ---- everything built ---- */
  structures(G, g, T, P){
    const F = this.fans, W = this.wavers, flags = this.flagList;
    const crowd = (s, seats, density) => {
      for(const [lx, ly, lz] of seats){ if(Math.random() > density) continue;
        const [x, y, z] = this.toWorld(s, lx + (Math.random() - 0.5) * 0.2, ly, lz);
        const it = { x, y, z, h:0.92 + Math.random() * 0.14, w:1, ry:-s.ang + Math.PI + (Math.random() - 0.5) * 0.6, tint:CROWD[Math.floor(Math.random() * CROWD.length)] };
        (Math.random() < 0.2 ? W : F).push(it); } };
    const flagCols = ["#F4D23A", "#2E8B45", "#2F5FB8", "#F2F2EE"];
    for(const s of P.S){
      let r = null;
      switch(s.kind){
        case "pits": r = KIT.pits(s, TEAMS); break;
        case "paddock": r = KIT.paddock(s, TEAMS); break;
        case "stand": r = KIT.stand(s); crowd(s, r.seats, s.main ? 0.9 : 0.8);
          for(let x = -s.wid / 2 + 4; x < s.wid / 2; x += 8){ const [fx, fy, fz] = this.toWorld(s, x, r.top + 2.2, -s.rows * 0.85 - 0.4);
            flags.push({ x:fx, y:fy, z:fz, ry:-s.ang, h:2.4, w:1, tint:flagCols[Math.floor(Math.random() * 4)] }); }
          if(s.main || s.name === "senna") this.flareSpots.push(this.toWorld(s, 0, r.top * 0.6, -s.rows * 0.4), this.toWorld(s, s.wid * 0.3, r.top * 0.5, -s.rows * 0.3));
          if(s.main) this.confettiAt = this.toWorld(s, 0, r.top + 4, -s.rows * 0.4).concat([s.wid]);
          break;
        case "bank": r = KIT.bank(s); crowd(s, r.seats, 0.7);
          for(let x = -s.wid / 2 + 6; x < s.wid / 2; x += 12){ const [fx, fy, fz] = this.toWorld(s, x, r.top * 0.6 + 2.6, -s.dep * 0.6);
            flags.push({ x:fx, y:fy, z:fz, ry:-s.ang, h:2.0, w:1, tint:flagCols[Math.floor(Math.random() * 4)] }); }
          // a samba drum group at the front of one bank in three
          if(this.drumBanks++ % 3 === 0) for(let k = 0; k < 8; k++){ const [x, y, z] = this.toWorld(s, -6 + k * 1.6, 0.1, -1.6 - (k % 2) * 1.2);
            this.drummers.push({ x, y, z, h:1, w:1, ry:-s.ang + Math.PI, tint:k % 2 ? "#F4D23A" : "#2E8B45" }); }
          break;
        case "screen": r = KIT2.screen(s); this.screenPanel(G, g, s, r.panel); break;
        case "stalls": r = KIT2.stalls(s); break;
        case "marshal": r = KIT.marshal(s); break;
        case "tvtower": r = KIT.tvtower(s); break;
        case "paddocksign": this.paddockSign(G, g, s); break;
        case "startgantry": this.startGantry(G, g, T, s); break;
      }
      if(!r) continue;
      this.bucketAdd(r.parts, s.x, s.y, s.z, s.ang);
      if(s.kind === "pits" || s.kind === "paddock"){ const pad = new THREE.BoxGeometry(s.wid + 2, 0.4, s.dep + (s.kind === "paddock" ? 6 : 2)); pad.translate(0, -0.18, 0);
        this.bucketAdd([paint(pad, flat(s.kind === "pits" ? "#5E6066" : "#6A6C70"), () => 0)], s.x, s.y, s.z, s.ang); }
    }
    for(const t of P.towers){ const r = KIT2.tower(t); this.bucketAdd(r.parts, t.x, t.y, t.z, t.ang); if(t.helipad) this.helipads.push([t.x, t.y, t.z + r.top + 0.7]); }
    for(const s of P.sheds){ const r = KIT2.shed(s); this.bucketAdd(r.parts, s.x, s.y, s.z, s.ang); }
    for(const p of P.pitches){ const r = KIT2.pitch(p); this.bucketAdd(r.parts, p.x, p.y, p.z, p.ang);
      // a game on: two teams of five, and a ball
      for(let k = 0; k < 10; k++){ const lx = (Math.random() - 0.5) * p.l * 0.8, lz = (Math.random() - 0.5) * p.w * 0.8, c = Math.cos(p.ang), sn = Math.sin(p.ang);
        this.players.push({ x:p.x + lx * c - lz * sn, y:p.y + lx * sn + lz * c, z:p.z + 0.12, h:1, w:1, ry:Math.random() * 6.3, tint:k < 5 ? "#F4D23A" : "#2F5FB8" }); } }
  },
  // a big screen's picture: a generic broadcast card in green and yellow (no real graphics)
  screenPanel(G, g, s, pn){
    const cv = document.createElement("canvas"); cv.width = 256; cv.height = 154;
    const c = cv.getContext("2d"), gr = c.createLinearGradient(0, 0, 256, 154);
    gr.addColorStop(0, "#0E3A22"); gr.addColorStop(1, "#1E5A8A"); c.fillStyle = gr; c.fillRect(0, 0, 256, 154);
    c.fillStyle = "#F4D23A"; c.fillRect(0, 118, 256, 36); c.fillStyle = "#0E1A12"; c.font = "800 italic 26px 'Saira Condensed',Impact,sans-serif"; c.textAlign = "center"; c.fillText("VAI, VAI, VAI!", 128, 145);
    c.fillStyle = "#FFFFFF"; c.font = "800 italic 34px 'Saira Condensed',Impact,sans-serif"; c.fillText("SÃO PAULO", 128, 60);
    for(let k = 0; k < 5; k++){ c.fillStyle = ["#F4D23A", "#2E8B45", "#2F78B8", "#F2F2EE", "#E8742A"][k]; c.fillRect(30 + k * 40, 80, 30, 22); }
    const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(pn.w, pn.h), new THREE.MeshBasicMaterial({ map:t, toneMapped:false }));
    const [x, y, z] = this.toWorld(s, 0, pn.y, pn.z); m.position.set(x, z, y); m.rotation.y = -s.ang; m.userData.dynamic = true; g.add(m);
  },

  /* ---- the instanced things: plants, the city, people ---- */
  instanced(G, g, P){
    const GE = this.geos, L = P.lists, st = this.stats;
    st.chunks = 0;
    for(const k of ["palm", "broad", "ipe", "euca", "banana"]){
      st.chunks += this.plant(G, g, GE[k], this.treeMat, L[k].filter(t => t.shade), true);
      st.chunks += this.plant(G, g, GE[k], this.treeMat, L[k].filter(t => !t.shade), false);
    }
    st.chunks += this.plant(G, g, GE.broadFar, this.treeMat, L.broadFar, false);
    st.chunks += this.plant(G, g, GE.eucaFar, this.treeMat, L.eucaFar, false);
    for(const k of ["shrub", "grass", "flowers"]) st.chunks += this.plant(G, g, GE[k], this.mat, L[k], false);
    st.chunks += this.plant(G, g, GE.reeds, this.treeMat, L.reeds, false);
    // the houses: one geometry per kind and floor count, the instance scales plan size and tints the walls;
    // the near ones cast shadows (the shadow map only covers the view)
    const hg = {};
    for(const v of [0, 1, 2]) for(const f of [1, 2, 3]) hg[v + "_" + f] = GE["house" + v](f);
    const by = {};
    for(const h of P.houses){ const key = h.v + "_" + h.floors + (h.d < 140 ? "s" : ""); (by[key] = by[key] || []).push({ x:h.x, y:h.y, z:h.z, ry:-h.ang, sx:h.l, sy:2.9, sz:h.w, tint:h.col }); }
    for(const key in by) st.chunks += this.plant(G, g, hg[key.replace("s", "")], this.mat, by[key], key.endsWith("s"));
    st.houses = P.houses.length;
    st.chunks += this.plant(G, g, GE.car, this.mat, P.cars.filter(c => !c.bus).map(c => ({ x:c.x, y:c.y, z:c.z, ry:-c.ang, h:1, w:1, tint:c.tint })), false);
    st.chunks += this.plant(G, g, GE.car, this.mat, P.cars.filter(c => c.bus).map(c => ({ x:c.x, y:c.y, z:c.z, ry:-c.ang, sx:2.9, sy:2.2, sz:1.4, tint:"#E8E4D8" })), false);
    // the crowd, the flags, the drums and the footballers
    st.fans = this.fans.length + this.wavers.length;
    st.chunks += this.plant(G, g, GE.fan, this.mat, this.fans, false);
    st.chunks += this.plant(G, g, GE.waver, this.fanMat, this.wavers, false);
    st.chunks += this.plant(G, g, GE.flag, this.flagMat, this.flagList, false);
    st.chunks += this.plant(G, g, this.mv.drum, this.fanMat, this.drummers, false);
    st.chunks += this.plant(G, g, GE.waver, this.fanMat, this.drummers, false);
    st.chunks += this.plant(G, g, GE.fan, this.fanMat, this.players, false);
  },

  /* ---- the sky for the shots that look up: a dome, heavy blue-grey storm on one side and a
     golden break low on the other, with towering clouds round the horizon ---- */
  sky(G, g, T){
    const bb = T.bounds, cx = bb.minX + bb.w / 2, cy = bb.minY + bb.h / 2, sa = T.sun == null ? 0.9 : T.sun;
    const dome = new THREE.SphereGeometry(5200, 24, 12, 0, TAU, 0, Math.PI / 2), p = dome.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
    const storm = lin("#4E5866"), gold = lin("#F2C27A"), high = lin("#8EA2B4"), haze = lin("#D8CDB4");
    for(let i = 0; i < p.count; i++){ const x = p.getX(i), y = p.getY(i), z = p.getZ(i), el = y / 5200, az = Math.atan2(z, x);
      const toSun = 0.5 + 0.5 * Math.cos(az - sa); c.copy(storm).lerp(gold, Math.pow(toSun, 3) * (1 - el) * 0.9).lerp(high, el * 0.5).lerp(haze, Math.pow(1 - el, 6) * 0.6);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    dome.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const dm = new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ vertexColors:true, side:THREE.BackSide, fog:false, depthWrite:false }));
    dm.position.set(cx, -200, cy); dm.renderOrder = -1; dm.frustumCulled = false; dm.userData.dynamic = true; g.add(dm);
    // towering clouds: lumps of grey-white, darker where the storm is
    const parts = [];
    for(let k = 0; k < 18; k++){ const a = k / 18 * TAU + 0.2, rad = 3200 + (k % 3) * 500, sx = cx + Math.cos(a) * rad, sy = cy + Math.sin(a) * rad, dark = 0.5 + 0.5 * Math.cos(a - sa);
      for(let m = 0; m < 6; m++){ const b = new THREE.IcosahedronGeometry(260 + (m % 3) * 120, 1); b.scale(1, 0.8 + m * 0.12, 1);
        b.translate(sx + (m - 2.5) * 180, 700 + m * 170 + (k % 2) * 200, sy + ((m * 37) % 5 - 2) * 120);
        parts.push(paint(b, (x, y) => lin(dark > 0.6 ? "#F2EEE6" : "#9AA2AC").lerp(lin(dark > 0.6 ? "#FFF4DC" : "#5E6672"), Math.min(1, Math.max(0, (y - 600) / 1400))), () => 0)); } }
    const mg = new THREE.BufferGeometry(); let nv = 0; for(const q of parts) nv += q.attributes.position.count;
    const pos = new Float32Array(nv * 3), cl = new Float32Array(nv * 3); let o = 0;
    for(const q of parts){ pos.set(q.attributes.position.array, o * 3); cl.set(q.attributes.color.array, o * 3); o += q.attributes.position.count; }
    mg.setAttribute("position", new THREE.BufferAttribute(pos, 3)); mg.setAttribute("color", new THREE.BufferAttribute(cl, 3)); mg.computeVertexNormals();
    const cm = new THREE.Mesh(mg, new THREE.MeshBasicMaterial({ vertexColors:true, fog:false })); cm.frustumCulled = false; cm.userData.dynamic = true; g.add(cm);
    // and the city beyond the hills: rows of pale blocks in the warm haze
    const blocks = []; let r = 7; const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
    for(let k = 0; k < 420; k++){ const a = rnd() * TAU, rad = 2600 + rnd() * 2200, h = 15 + rnd() * rnd() * 110;
      blocks.push({ x:cx + Math.cos(a) * rad, y:cy + Math.sin(a) * rad, z:P_far(this.P, cx + Math.cos(a) * rad, cy + Math.sin(a) * rad) - 2, ry:rnd() * 3, sx:18 + rnd() * 26, sy:h, sz:16 + rnd() * 20, tint:["#E8E0D0", "#D8CCB8", "#C8C4BC", "#E8D8C0"][Math.floor(rnd() * 4)] }); }
    const bg = paint(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), flat("#FFFFFF"));
    this.plant(G, g, bg, this.mat, blocks, false);
  },

  /* ---- the little things that move ---- */
  fliers(G, g, T, P){
    const M = this.mv;
    // helicopters: three, circling at different heights; the rotor spins
    const hb = new THREE.InstancedMesh(M.heli, this.buildMat, 3), hr = new THREE.InstancedMesh(M.rotor, this.buildMat, 3);
    for(const im of [hb, hr]){ im.frustumCulled = false; im.userData.dynamic = true; im.castShadow = true; g.add(im); }
    const cols = ["#E8E8E8", "#D8352A", "#2F5FB8"]; for(let k = 0; k < 3; k++) hb.setColorAt(k, lin(cols[k]));
    /* The rotors share the bodies' material, so they must carry instance colours as well (white:
       they keep their own grey). three.js compiles one program per material, and one with
       per-instance colour drawn on a mesh without any throws on every frame, which drops the
       game to 2D. */
    for(let k = 0; k < 3; k++) hr.setColorAt(k, new THREE.Color(1, 1, 1));
    hb.instanceColor.needsUpdate = true; hr.instanceColor.needsUpdate = true;
    const bb = T.bounds, cx = bb.minX + bb.w / 2, cy = bb.minY + bb.h / 2;
    this.hl = { hb, hr, list:[0, 1, 2].map(k => ({ cx:cx + (k - 1) * 400, cy:cy + (1 - k) * 260, r:380 + k * 140, h:140 + k * 50, w:0.05 + k * 0.012, ph:k * 2 })), M:new THREE.Matrix4(), q:new THREE.Quaternion(), e:new THREE.Euler(), p:new THREE.Vector3(), s:new THREE.Vector3(1, 1, 1) };
    // kites over the houses, swaying on their strings
    const homes = P.houses.filter(h => h.d > 90 && h.d < 420);
    const kn = Math.min(CFG.detail === 0 ? 14 : 40, homes.length), km = new THREE.InstancedMesh(M.kite, this.flagMat2, kn);
    this.kites = [];
    for(let k = 0; k < kn; k++){ const h = homes[Math.floor(k * homes.length / kn)]; km.setColorAt(k, lin(["#F4D23A", "#D8352A", "#2F78B8", "#2E8B45", "#E86AA8", "#F08A1E"][k % 6])); this.kites.push({ x:h.x, y:h.y, z:h.z + 30 + (k % 5) * 9, ph:k * 1.7 }); }
    km.instanceColor.needsUpdate = true; km.frustumCulled = false; km.userData.dynamic = true; g.add(km); this.km = km;
    // birds: parrots and toucans round the trees near the circuit, herons over the lake
    const trees = [...P.lists.broad, ...P.lists.palm].filter(t => t.shade);
    this.flocks = [];
    for(let k = 0; k < 7 && trees.length; k++){ const t = trees[Math.floor((k + 0.5) / 7 * trees.length)]; this.flocks.push({ x:t.x, y:t.y, z:t.z + t.h + 6, r:18 + k * 3, n:k < 5 ? 7 : 3, kind:k < 5 ? "parrot" : "toucan", ph:k }); }
    if(P.lakes.length){ const lk = P.lakes.find(l => !l.marsh) || P.lakes[0]; this.flocks.push({ x:lk.cx, y:lk.cy, z:lk.level + 14, r:40, n:5, kind:"heron", ph:9 }); }
    const nb = this.flocks.reduce((a, f) => a + f.n, 0), bm = new THREE.InstancedMesh(M.bird, this.flagMat2, Math.max(1, nb));
    let b = 0; for(const f of this.flocks) for(let k = 0; k < f.n; k++) bm.setColorAt(b++, lin(f.kind === "parrot" ? (k % 3 ? "#3EA83A" : "#E8C02A") : f.kind === "toucan" ? "#1A1A1E" : "#F2F2EE"));
    if(bm.instanceColor) bm.instanceColor.needsUpdate = true; bm.frustumCulled = false; bm.userData.dynamic = true; g.add(bm); this.bm = bm;
    // smoke flares in the stands: puffs of green and yellow that rise and spread
    const fn = this.flareSpots.length * 8;
    this.fl = null;
    if(fn){ const fm = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color:0xFFFFFF, transparent:true, opacity:0.5, depthWrite:false }), fn);
      for(let k = 0; k < fn; k++) fm.setColorAt(k, lin(Math.floor(k / 8) % 2 ? "#F4D23A" : "#3EB84A"));
      fm.instanceColor.needsUpdate = true; fm.frustumCulled = false; fm.userData.dynamic = true; g.add(fm); this.fl = { fm, n:fn }; }
    // confetti over the main stand
    this.cf = null;
    if(this.confettiAt && CFG.detail !== 0){ const N = 500, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), c = new THREE.Color(), [x0, y0, z0, w] = this.confettiAt;
      const st = []; for(let k = 0; k < N; k++){ st.push({ x:x0 + (Math.random() - 0.5) * w, y:y0 + (Math.random() - 0.5) * 16, z:z0 + Math.random() * 20, v:1 + Math.random(), ph:Math.random() * 6.3 }); c.set(["#F4D23A", "#2E8B45", "#2F78B8", "#F2F2EE"][k % 4]).convertSRGBToLinear(); col.set([c.r, c.g, c.b], k * 3); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size:3, sizeAttenuation:false, vertexColors:true })); pts.frustumCulled = false; pts.userData.dynamic = true; g.add(pts);
      this.cf = { pts, pos, st, z0 }; }
  },
  // mist on the lake nearest the circuit
  mist(G, g, P){
    this.ms = null; if(CFG.detail === 0 || !P.lakes.length) return;
    const lk = P.lakes.slice().sort((a, b) => P.query(a.cx, a.cy).bar - P.query(b.cx, b.cy).bar)[0];
    this.culvertAt = { x:lk.cx, y:lk.cy, z:lk.level - 2 };
    const Gd = P.grid; this.mistSeeds = lk.shore.filter((_, k) => k % 3 === 0).map(k => [Gd.X0 + (k % Gd.NX) * Gd.STEP, Gd.Y0 + ((k / Gd.NX) | 0) * Gd.STEP, lk.level]);
    SPA.mist.call(this, G, g, { streams:[] });
  },

  /* ---- light: a low golden sun under a storm sky; warm, wet haze ---- */
  light(G, T){
    if(G.sun){ G.sun.color.copy(lin("#FFD49A")); G.sun.intensity = 1.25; }
    G.scene.traverse(o => { if(o.isHemisphereLight && o !== G.envFill){ o.color.copy(lin("#8E9AA8")); o.groundColor.copy(lin("#5E6A3A")); } });
    if(G.scene.fog) G.scene.fog.color.copy(lin("#CFC6B2"));
    G.scene.background = lin("#C8C2B4");
    G.fogNear = -80; G.fogSpanK = 0.75;
  },

  build(G, world, T, S){
    const t0 = performance.now(), tm = {};
    const step = (k, fn) => { const a = performance.now(); try{ fn(); }catch(e){ console.warn("interlagos " + k, e.message, e.stack); } tm[k] = Math.round(performance.now() - a); };
    const g = new THREE.Group(); world.add(g); this.root = g; this.T = T; this._t = null;
    let P;
    step("plan", () => { P = planIlg(T, { detail:CFG.detail }); });
    if(!P) return;
    this.P = P; this.stats = {}; this.buckets = new Map(); this.chimneys = []; this.fans = []; this.wavers = []; this.flagList = [];
    this.drummers = []; this.players = []; this.flareSpots = []; this.helipads = []; this.drumBanks = 0; this.confettiAt = null;
    this.sm = null; this.cy = null; this.bl = null; this.lamps = null;
    this.U.cloud.value = this.cloudTex();
    this.geos = Object.assign({}, ilgGeos(), SPA_SHARED());
    this.mv = movers();
    this.mat = this.swayMat("small", 0.0, 9, 1, {});
    this.treeMat = this.swayMat("tree", 0.012, 0.3, 1.3, {});
    this.fanMat = this.swayMat("fan", 0.55, 1.25, 3.8, {});
    this.flagMat = this.swayMat("flag", 0, 0, 1, { side:THREE.DoubleSide });
    this.flagMat2 = this.swayMat("small", 0.0, 9, 1, { side:THREE.DoubleSide });
    for(const m of [this.mat, this.treeMat, this.fanMat, this.flagMat]) G.cutMat(m);
    step("colours", () => this.groundColours(P));
    step("terrain", () => { this.stats.tiles = this.terrain(G, g, P); });
    step("horizon", () => this.horizon(G, g, P, T));
    step("verges", () => this.verges(G, g, T));
    step("water", () => { this.water(G, g, P); this.lakes(G, g, P); });
    step("roads", () => this.roads(G, g, P));
    step("patches", () => this.patches(G, g, T));
    step("structures", () => this.structures(G, g, T, P));
    step("bake", () => { this.stats.buildingChunks = this.bucketBake(G, g); });
    step("barriers", () => this.barriers(G, g, T, P));
    step("instanced", () => this.instanced(G, g, P));
    step("sky", () => this.sky(G, g, T));
    step("fliers", () => this.fliers(G, g, T, P));
    step("balloons", () => this.balloons(G, g, T));
    step("mist", () => this.mist(G, g, P));
    this.light(G, T);
    tm.total = Math.round(performance.now() - t0);
    this.timing = tm;
    Object.assign(this.stats, P.stats);
    try{ window.__interlagos = { stats:this.stats, timing:tm, audit:() => auditIlg(P, T), plan:P }; }catch(e){}
  },

  frame(S, G){
    const t0 = this._t;
    SPA.frame.call(this, S, G);                               // clouds, wet look, start lights, balloons, mist
    const t = S.clock || 0, dt = t0 == null ? 0 : clamp(t - t0, 0, 0.1), wv = G.wetVis || 0;
    // clouds race over faster here, and the wet grass shines
    this.U.cloudOff.value.set(t * 14, t * 9);
    if(this.groundMat){ this.groundMat.roughness = 0.97 - wv * 0.45; }
    if(this.lakeMat) this.lakeMat.color.copy(lin(wv > 0.3 ? "#3E5650" : "#4E6A5E"));
    const H = this.hl;
    if(H){ for(let k = 0; k < 3; k++){ const h = H.list[k], a = t * h.w + h.ph;
        H.p.set(h.cx + Math.cos(a) * h.r, h.h + Math.sin(t * 0.3 + k) * 4, h.cy + Math.sin(a) * h.r);
        H.e.set(0.08, -a - Math.PI / 2, 0.12); H.q.setFromEuler(H.e); H.M.compose(H.p, H.q, H.s); H.hb.setMatrixAt(k, H.M);
        H.e.set(0.08, -a - Math.PI / 2 + t * 22, 0.12); H.q.setFromEuler(H.e); H.M.compose(H.p, H.q, H.s); H.hr.setMatrixAt(k, H.M); }
      H.hb.instanceMatrix.needsUpdate = true; H.hr.instanceMatrix.needsUpdate = true; }
    const M = this._M || (this._M = new THREE.Matrix4()), q = this._q || (this._q = new THREE.Quaternion()), e = this._e || (this._e = new THREE.Euler()), p = this._p || (this._p = new THREE.Vector3()), s = this._s || (this._s = new THREE.Vector3());
    if(this.km){ for(let k = 0; k < this.kites.length; k++){ const kt = this.kites[k];
        p.set(kt.x + Math.sin(t * 0.7 + kt.ph) * 4, kt.z + Math.sin(t * 1.3 + kt.ph) * 2, kt.y + Math.cos(t * 0.5 + kt.ph) * 3); e.set(0.3, -0.785, Math.sin(t * 1.9 + kt.ph) * 0.4); q.setFromEuler(e); s.set(3, 3, 3);
        M.compose(p, q, s); this.km.setMatrixAt(k, M); }
      this.km.instanceMatrix.needsUpdate = true; }
    if(this.bm){ let b = 0;
      for(const f of this.flocks){ for(let k = 0; k < f.n; k++){ const a = t * (f.kind === "heron" ? 0.25 : 0.7) + f.ph + k / f.n * TAU * (f.kind === "heron" ? 1 : 0.35);
          const rr = f.r * (1 + 0.15 * Math.sin(k * 2.1)), flap = 1 + 0.35 * Math.sin(t * (f.kind === "heron" ? 4 : 14) + k);
          p.set(f.x + Math.cos(a) * rr, f.z + Math.sin(t * 0.8 + k) * 2 + k * 0.4, f.y + Math.sin(a) * rr); e.set(0, -a - Math.PI / 2, 0); q.setFromEuler(e);
          const sc = f.kind === "heron" ? 2.4 : f.kind === "toucan" ? 1.3 : 1; s.set(sc, sc, sc * flap); M.compose(p, q, s); this.bm.setMatrixAt(b++, M); } }
      this.bm.instanceMatrix.needsUpdate = true; }
    const FL = this.fl;
    if(FL){ for(let k = 0; k < FL.n; k++){ const sp = this.flareSpots[Math.floor(k / 8)], f = (t * 0.22 + (k % 8) / 8) % 1;
        p.set(sp[0] + f * 6, sp[2] + f * 14, sp[1] + f * 4); const r = 0.8 + f * 4.5; s.set(r, r * 0.8, r); q.identity(); M.compose(p, q, s); FL.fm.setMatrixAt(k, M); }
      FL.fm.instanceMatrix.needsUpdate = true; FL.fm.material.opacity = 0.45 * (1 - wv * 0.6); }
    const CF = this.cf;
    if(CF && dt > 0){ for(let k = 0; k < CF.st.length; k++){ const c = CF.st[k]; c.z -= c.v * dt * 1.6; if(c.z < CF.z0 - 22) c.z = CF.z0 + 4 + Math.random() * 10;
        CF.pos[k * 3] = c.x + Math.sin(t * 2 + c.ph) * 1.5; CF.pos[k * 3 + 1] = c.z; CF.pos[k * 3 + 2] = c.y + Math.cos(t * 1.7 + c.ph) * 1.5; }
      CF.pts.geometry.attributes.position.needsUpdate = true; }
  },
});

// the far ground under a point (the skyline blocks stand on it)
function P_far(P, x, y){ return P.farHeight(x, y); }
// the shared pieces this world borrows from Spa's kit: spectators, flags, tyre stacks, cars
let _shared = null;
function SPA_SHARED(){ if(!_shared){ const G = plantGeos(); _shared = { fan:G.fan, waver:G.waver, flag:G.flag, tyres:G.tyres, car:G.car }; } return _shared; }

export { ILG };
