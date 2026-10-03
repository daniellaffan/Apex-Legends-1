import * as THREE from 'three';
import { TAU, clamp } from '../../config/util.js';
import { PTEX } from '../surfaces.js';
import { ADS } from '../hoardings.js';
import { LB } from './vegas.js';

/* ---------- 10c. the city the circuit runs through -------------------------
   A street circuit is only convincing if the streets keep going after the
   barrier does. This lays down the cross streets that meet the lap and are
   closed off at it, the blocks between them, the low city out to the desert and
   the mountains behind that, and then fills the near ground with the clutter
   you would actually be driving past.

   The rule throughout is that repetition is instanced and everything static is
   merged, so a few thousand objects arrive as a few dozen draw calls. It is
   built once per session from the track's own nodes, and only for circuits that
   ask for it, so no other track pays for any of it.
   ------------------------------------------------------------------------- */
const CITY = {
  /* world position and heading at a lap fraction and a lateral offset */
  at(T, u, off){
    const i = ((Math.round(u * T.n) % T.n) + T.n) % T.n;
    return { x:T.x[i] + T.nx[i] * off, y:T.y[i] + T.ny[i] * off, z:T.z[i],
             a:T.ang[i], nx:T.nx[i], ny:T.ny[i], i };
  },
  /* is this patch of ground clear of the circuit and of anything named?
     The filler blocks are there to thicken the skyline, not to be dropped into
     the Bellagio's lake. */
  clear(T, x, y, pad){
    const i = T.near(x, y);
    const dx = x - T.x[i], dy = y - T.y[i];
    // the run-off on this side at this point, not the widest anywhere on the
    // lap — otherwise one escape road holds the whole city back by twenty metres
    const side = dx * T.nx[i] + dy * T.ny[i];
    const ro = side >= 0 ? T.roR[i] : T.roL[i];
    if(Math.hypot(dx, dy) <= T.half + ro + 3.5 + pad) return false;
    for(const k of this.keepOut){
      if(Math.abs(x - k[0]) < k[2] && Math.abs(y - k[1]) < k[2]) return false;
    }
    return true;
  },
  /* how much room each landmark needs around it, from its own footprint */
  plots(T){
    const out = [];
    for(const p of T.props){
      if(p.t === "sphere"){ out.push([p.x, p.y, p.h * 0.88]); continue; }
      if(p.t !== "lm") continue;
      // just the property's own plot. Any larger and the whole near ground gets
      // reserved, which is what left the circuit standing in a dark field.
      const R2 = { bellagio:126, caesars:142, venetian:132, eiffel:132, nyny:152, luxor:172,
                   excalibur:122, mgm:124, strat:74, circus:112, aria:124, cosmopolitan:120,
                   wynn:124, mirage:132, palazzo:102, planethollywood:104, vegaspit:132,
                   fontainebleau:92, f1sign:56 }[p.k];
      out.push([p.x, p.y, R2 == null ? 88 : R2]);
    }
    return out;
  },

  build(G, parent, T, S){
    const night = T.night, g = new THREE.Group();
    this.G = G; this.T = T; this.night = night;
    this.keepOut = this.plots(T); this._spots = new Map();
    const RNG = (() => { let s = 20260921; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; })();
    this.rnd = RNG;

    this.streets(G, g, T);
    this.blocks(G, g, T);
    this.frontage(G, g, T);
    this.skyline(G, g, T);
    this.mountains(G, g, T);
    this.furniture(G, g, T);
    this.adverts(G, g, T);
    parent.add(g);
    return g;
  },


  /* ---- the buildings that line the circuit itself ----
     The skyline pass fills the distance; this fills the near ground, which is
     what actually makes a street circuit feel like a street. Blocks are laid in
     three depth bands out from the barrier, in the gaps the circuit, the cross
     streets and the named properties leave behind. All of it is instanced, in
     four material buckets, so several hundred buildings arrive as four draws. */
  frontage(G, g, T){
    const night = this.night, n = T.n;
    const rnd = this.rnd;
    const buckets = [[], [], [], []];
    // distance from the barrier, height range, and how often to bother
    const BANDS = [[7, 8, 22, 0.78], [40, 13, 40, 0.70], [86, 18, 66, 0.54], [148, 24, 92, 0.38]];
    for(let i = 0; i < n; i += 2){
      const tx = Math.cos(T.ang[i]), ty = Math.sin(T.ang[i]);
      for(const sd of [-1, 1]){
        const edge = T.half + (sd < 0 ? T.roL[i] : T.roR[i]) + 4;
        for(let b = 0; b < BANDS.length; b++){
          const [d0, hLo, hHi, chance] = BANDS[b];
          if(rnd() > chance) continue;
          const w2 = 16 + rnd() * 30, dep = 16 + rnd() * 28;
          const o = sd * (edge + d0 + rnd() * 22 + dep * 0.5);
          const x = T.x[i] + T.nx[i] * o + tx * (rnd() - 0.5) * 24;
          const y = T.y[i] + T.ny[i] * o + ty * (rnd() - 0.5) * 24;
          const rad = Math.max(w2, dep) * 0.55;
          if(!this.clear(T, x, y, rad + 2)) continue;
          if(this.onStreet(x, y, rad + 6)) continue;
          if(!this.takeSpot(x, y, rad + 4)) continue;
          // nearer the road the blocks are lower and squarer; further back they climb
          const h = hLo + Math.pow(rnd(), 1.6) * (hHi - hLo);
          const rot = T.ang[i] + (rnd() - 0.5) * 0.5;
          buckets[b].push([x, y, T.z[T.near(x, y)], rot, 1, 1, w2, dep, h]);
        }
      }
    }
    const MAT = [
      ["#5E5668", [1, 1.1], 0.40],      // low frontage: shops and podiums
      ["#544E60", [1, 1.7], 0.44],
      ["#4E5668", [1, 2.4], 0.50],
      ["#48526A", [1, 3.2], 0.54],
    ];
    for(let b = 0; b < 4; b++){
      const list = buckets[b];
      if(!list.length) continue;
      const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
      const im = new THREE.InstancedMesh(geo, this.blockMat(G, MAT[b][0], MAT[b][1], MAT[b][2]), list.length);
      const d = new THREE.Object3D();
      list.forEach((it, k) => {
        d.position.set(it[0], it[2], it[1]); d.rotation.set(0, it[3], 0);
        d.scale.set(it[6], it[8], it[7]); d.updateMatrix();
        im.setMatrixAt(k, d.matrix);
      });
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = b === 0; im.receiveShadow = true; im.userData.dynamic = true;
      g.add(im);
      // a lit parapet on the nearest band, so the rooflines catch the eye
      if(b === 0 && night){
        const cg = LB.shell(); cg.translate(0, 0.5, 0);
        const cm = new THREE.InstancedMesh(cg, G.glowMat("#FFB86A", 0.85), list.length);
        list.forEach((it, k) => {
          d.position.set(it[0], it[2] + it[8], it[1]); d.rotation.set(0, it[3], 0);
          d.scale.set(it[6] + 0.9, 0.7, it[7] + 0.9); d.updateMatrix();
          cm.setMatrixAt(k, d.matrix);
        });
        cm.instanceMatrix.needsUpdate = true; cm.userData.dynamic = true;
        g.add(cm);
      }
    }
    this.frontageCount = buckets.reduce((a, b2) => a + b2.length, 0);
  },

  /* one material per band: instanced boxes are stretched to every size, so the
     window grid is chosen for the band's average block rather than each one */
  blockMat(G, col, rep, glow){
    const night = this.night;
    const key = "blk|" + col + "|" + rep.join(",");
    this._bm = this._bm || new Map();
    if(this._bm.has(key)) return this._bm.get(key);
    const w2 = PTEX.windowTex("concrete", col).clone();
    w2.needsUpdate = true; w2.wrapS = w2.wrapT = THREE.RepeatWrapping;
    w2.encoding = THREE.sRGBEncoding; w2.repeat.set(rep[0], rep[1]);
    const m = new THREE.MeshStandardMaterial({
      color:G.col(col), roughness:0.9, metalness:0.03, envMapIntensity:0.5,
      emissiveMap:night ? w2 : null, emissive:new THREE.Color(1, 1, 1),
      emissiveIntensity:night ? glow : 0 });
    this._bm.set(key, m); return m;
  },

  /* A coarse hash of what has already been placed, so blocks stand next to each
     other rather than through each other. One cell per twenty metres is enough
     at these sizes and costs nothing. */
  takeSpot(x, y, r){
    if(!this._spots) this._spots = new Map();
    const CS = 20;
    const c0 = Math.floor((x - r) / CS), c1 = Math.floor((x + r) / CS);
    const r0 = Math.floor((y - r) / CS), r1 = Math.floor((y + r) / CS);
    for(let c = c0; c <= c1; c++) for(let q = r0; q <= r1; q++){
      const e = this._spots.get(c + "," + q);
      if(e && Math.hypot(x - e[0], y - e[1]) < r + e[2]) return false;
    }
    for(let c = c0; c <= c1; c++) for(let q = r0; q <= r1; q++) this._spots.set(c + "," + q, [x, y, r]);
    return true;
  },

  /* is this spot in the middle of one of the cross streets? */
  onStreet(x, y, pad){
    for(const s of (this.streetSegs || [])){
      const dx = x - s[0], dy = y - s[1];
      const along = dx * s[2] + dy * s[3];
      if(along < -pad || along > s[4] + pad) continue;
      const across = Math.abs(-dx * s[3] + dy * s[2]);
      if(across < s[5] + pad) return true;
    }
    return false;
  },

  /* ---- the road grid: cross streets closed off at the circuit ---- */
  streets(G, g, T){
    const night = this.night;
    const asph = G.mat("#2A2730", { roughness:0.94 });
    const walk = G.mat("#3E3A46", { roughness:0.96 });
    const kerb = G.mat("#5A5564", { roughness:0.9 });
    const paint = G.mat("#C8C4B0", { roughness:0.85 });
    const dash = [], cross = [], lights = [];

    // where a street meets the lap, which side it leaves on, and how far it runs
    const XS = T.def.streets || [];
    this.streetSegs = [];
    for(const st of XS){
      const p = this.at(T, st.u, 0);
      // the street leaves at right angles to the circuit, on the side given
      const sd = st.side === "in" ? -1 : 1;
      const dx = T.nx[p.i] * sd, dy = T.ny[p.i] * sd;
      const px = -dy, py = dx;                       // across the street
      const near = T.half + (sd < 0 ? T.roL[p.i] : T.roR[p.i]) + 4, far = near + (st.len || 260);
      const halfW = (st.w || 22) / 2;
      // the carriageway
      const cx = p.x + dx * (near + far) / 2, cy = p.y + dy * (near + far) / 2;
      const ang = Math.atan2(dy, dx);
      // origin, direction, length, half width — what the frontage pass avoids
      this.streetSegs.push([p.x + dx * near, p.y + dy * near, dx, dy, far - near, halfW + 5]);
      LB.box(G, g, cx, cy, p.z - 0.10, far - near, halfW * 2, 0.10, ang, asph);
      // the footways either side, raised
      for(const s2 of [-1, 1]){
        LB.box(G, g, cx + px * s2 * (halfW + 2.4), cy + py * s2 * (halfW + 2.4), p.z - 0.05,
          far - near, 4.8, 0.30, ang, walk);
        LB.box(G, g, cx + px * s2 * halfW, cy + py * s2 * halfW, p.z - 0.05,
          far - near, 0.5, 0.34, ang, kerb);
      }
      // the centre line, dashed
      for(let d = near + 6; d < far - 6; d += 12)
        dash.push([p.x + dx * d, p.y + dy * d, p.z + 0.02, -ang, 1]);
      // the stop bar and the arrows where it is closed off
      LB.box(G, g, p.x + dx * (near + 3), p.y + dy * (near + 3), p.z + 0.01, 0.8, halfW * 2 - 2, 0.02, ang, paint);
      for(const s2 of [-0.5, 0.5])
        cross.push([p.x + dx * (near + 11) + px * s2 * halfW, p.y + dy * (near + 11) + py * s2 * halfW,
                    p.z + 0.02, -ang, 1]);
      // the crossing, back from the barrier
      for(let k = -6; k <= 6; k++)
        LB.box(G, g, p.x + dx * (near + 26) + px * k * 1.6, p.y + dy * (near + 26) + py * k * 1.6,
          p.z + 0.01, 3.4, 0.7, 0.02, ang, paint);
      // the signal on the corner, dark or blinking amber
      if(st.lights !== false) for(const s2 of [-1, 1]){
        const lx = p.x + dx * (near + 6) + px * s2 * (halfW + 2.4);
        const ly = p.y + dy * (near + 6) + py * s2 * (halfW + 2.4);
        LB.box(G, g, lx, ly, p.z, 0.42, 0.42, 6.2, ang, G.mat("#2E323A"));
        LB.box(G, g, lx + dx * 3, ly + dy * 3, p.z + 6.0, 6.4, 0.3, 0.3, ang, G.mat("#2E323A"));
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.0, 0.6),
          night ? G.glowMat("#FFA000", 1.2) : G.mat("#3A2A10"));
        head.position.set(lx + dx * 5.6, p.z + 5.2, ly + dy * 5.6);
        head.userData.dynamic = true; g.add(head);
        lights.push(head);
      }
      // a few parked cars along the kerb, behind the fence
      const cars = [];
      for(let d = near + 40; d < far - 14; d += 7.5)
        for(const s2 of [-1, 1])
          if(this.rnd() < 0.55)
            cars.push([p.x + dx * d + px * s2 * (halfW - 2.2), p.y + dy * d + py * s2 * (halfW - 2.2),
                       p.z, -ang, 1]);
      if(cars.length) this.cars(G, g, cars);
    }
    if(dash.length){
      const dg = new THREE.BoxGeometry(5, 0.04, 0.35); dg.translate(0, 0.02, 0);
      LB.many(G, g, dg, G.mat("#D8D4C0"), dash, false);
    }
    if(cross.length){
      const ag = new THREE.ConeGeometry(1.3, 3.4, 3); ag.rotateX(-Math.PI / 2); ag.rotateY(Math.PI / 2);
      ag.translate(0, 0.02, 0);
      LB.many(G, g, ag, G.mat("#D8D4C0"), cross, false);
    }
    if(lights.length) this.G.dyn.push({ kind:"amber", heads:lights });
  },

  /* a row of parked cars, as one instanced body and one instanced glasshouse */
  cars(G, g, list){
    const night = this.night;
    const body = new THREE.BoxGeometry(4.5, 1.1, 1.9); body.translate(0, 0.65, 0);
    const cab = new THREE.BoxGeometry(2.4, 0.8, 1.75); cab.translate(-0.2, 1.55, 0);
    const cols = ["#8A9099", "#3A3F48", "#B0B6BE", "#2A2E36", "#6E4A3A", "#D8DCE0"];
    // bucketed by colour so each bucket is one instanced mesh
    for(let c = 0; c < cols.length; c++){
      const sub = list.filter((_, i) => i % cols.length === c);
      if(!sub.length) continue;
      LB.many(G, g, body, G.mat(cols[c], { roughness:0.35, metalness:0.4 }), sub, true);
      LB.many(G, g, cab, G.mat("#151A22", { roughness:0.15, metalness:0.2 }), sub, false);
    }
  },

  /* ---- the blocks between the streets: podiums, garages, the near city ---- */
  blocks(G, g, T){
    const night = this.night;
    const gar = [];
    for(const b of (T.def.garages || [])){
      const p = this.at(T, b.u, (b.side === "in" ? -1 : 1) * b.off);
      const lv = b.lv || 5, lh = 3.4;
      LB.box(G, g, p.x, p.y, p.z, b.l || 70, b.w || 46, 1.2, p.a, G.mat("#2A2832"));
      for(let k = 0; k < lv; k++){
        // the deck, and the lit gap between it and the next one
        LB.box(G, g, p.x, p.y, p.z + 1.2 + k * lh, b.l || 70, b.w || 46, 0.7, p.a, G.mat("#34313E"));
        if(night){
          const band = new THREE.Mesh(new THREE.BoxGeometry((b.l || 70) - 1, lh - 1.1, (b.w || 46) - 1),
            G.glowMat("#FFE0AA", 0.55));
          band.position.set(p.x, p.z + 1.2 + k * lh + 0.7 + (lh - 1.1) / 2, p.y);
          band.rotation.y = -p.a; g.add(band);
        }
        // the columns round the edge, so it is not a stack of slabs
        for(let q = 0; q < 10; q++){
          const t = (q / 9 - 0.5) * ((b.l || 70) - 4);
          for(const s2 of [-1, 1])
            gar.push([p.x + Math.cos(p.a) * t - Math.sin(p.a) * s2 * ((b.w || 46) / 2 - 1),
                      p.y + Math.sin(p.a) * t + Math.cos(p.a) * s2 * ((b.w || 46) / 2 - 1),
                      p.z + 1.2 + k * lh + 0.7, -p.a, 1, (lh - 0.7) / 2]);
        }
      }
      LB.box(G, g, p.x, p.y, p.z + 1.2 + lv * lh, (b.l || 70) + 2, (b.w || 46) + 2, 1.0, p.a, G.mat("#26242E"));
      // the cars on the open top deck
      const top = [];
      for(let q = 0; q < 24; q++){
        const tx = ((q % 12) / 11 - 0.5) * ((b.l || 70) - 10);
        const ty = (Math.floor(q / 12) - 0.5) * ((b.w || 46) * 0.4);
        top.push([p.x + Math.cos(p.a) * tx - Math.sin(p.a) * ty,
                  p.y + Math.sin(p.a) * tx + Math.cos(p.a) * ty, p.z + 1.2 + lv * lh + 1.0, -p.a, 1]);
      }
      this.cars(G, g, top);
    }
    if(gar.length){
      const cg = new THREE.BoxGeometry(0.7, 2, 0.7); cg.translate(0, 1, 0);
      LB.many(G, g, cg, G.mat("#3E3A48"), gar, false);
    }

    /* the cranes, with their aviation lights */
    for(const c of (T.def.cranes || [])){
      const p = this.at(T, c.u, (c.side === "in" ? -1 : 1) * c.off);
      const h = c.h || 90;
      const mast = G.mat("#C8A030", { roughness:0.6, metalness:0.5 });
      LB.box(G, g, p.x, p.y, p.z, 5, 5, h, p.a + 0.4, mast);
      LB.box(G, g, p.x + Math.cos(p.a + 0.4) * 22, p.y + Math.sin(p.a + 0.4) * 22, p.z + h, 62, 3.2, 3.2, p.a + 0.4, mast);
      LB.box(G, g, p.x, p.y, p.z + h + 3.2, 7, 7, 5, p.a + 0.4, G.mat("#2E3238"));
      if(this.night){
        const bl = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 6), G.glowMat("#FF2A1A", 4.0));
        bl.position.set(p.x, p.z + h + 9, p.y); bl.userData.dynamic = true; g.add(bl);
        G.dyn.push({ kind:"beacon", obj:bl, rate:0.62 });
      }
    }

    /* the pedestrian overpasses, which on the Strip cross at every junction */
    for(const o of (T.def.bridges || [])){
      const p = this.at(T, o.u, 0);
      const span = (T.half + T.runoffMax) * 2 + 34;
      const deck = G.mat("#3A3F48", { roughness:0.7, metalness:0.3 });
      LB.box(G, g, p.x, p.y, p.z + 9.2, 5.2, span, 1.0, p.a, deck);
      LB.box(G, g, p.x, p.y, p.z + 10.2, 5.6, span, 0.4, p.a,
        this.night ? G.glowMat("#8AD8FF", 0.7) : G.mat("#6E7A88"));
      // the glazing along the sides, and the stair towers at each end
      for(const s2 of [-1, 1]){
        const gl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.6, span),
          new THREE.MeshStandardMaterial({ color:G.col("#2A3A4A"), roughness:0.1, metalness:0.4,
            transparent:true, opacity:0.45 }));
        gl.position.set(p.x + Math.cos(p.a) * s2 * 2.6, p.z + 11.5, p.y + Math.sin(p.a) * s2 * 2.6);
        gl.rotation.y = -p.a; g.add(gl);
        const ex = p.x + T.nx[p.i] * s2 * (span / 2 - 4), ey = p.y + T.ny[p.i] * s2 * (span / 2 - 4);
        LB.box(G, g, ex, ey, p.z, 9, 9, 10.2, p.a, G.mat("#333842"));
        if(this.night) LB.crown(G, g, ex, ey, p.z + 10.2, 10, 10, p.a, "#8AD8FF", 0.6);
      }
      // the crowd on it
      const ppl = [];
      for(let k = 0; k < 26; k++)
        ppl.push([p.x + T.nx[p.i] * (this.rnd() - 0.5) * span * 0.9 + Math.cos(p.a) * (this.rnd() - 0.5) * 3,
                  p.y + T.ny[p.i] * (this.rnd() - 0.5) * span * 0.9 + Math.sin(p.a) * (this.rnd() - 0.5) * 3,
                  p.z + 10.6, this.rnd() * TAU, 1]);
      const hg = new THREE.CylinderGeometry(0.26, 0.3, 1.7, 5); hg.translate(0, 0.85, 0);
      LB.many(G, g, hg, G.mat("#7A6A78"), ppl, false);
    }
  },

  /* ---- the low city, out to where the desert takes over ---- */
  skyline(G, g, T){
    const night = this.night;
    /* These are instanced, so one box is stretched to every size and the UVs
       cannot follow. They get their own materials with a coarse window grid
       chosen for the average block, rather than the tight one a named tower
       wants, or the whole skyline reads as static. */
    const bmat = (col, rep, gl) => {
      const w2 = PTEX.windowTex("concrete", col).clone();
      w2.needsUpdate = true; w2.wrapS = w2.wrapT = THREE.RepeatWrapping;
      w2.encoding = THREE.sRGBEncoding; w2.repeat.set(rep[0], rep[1]);
      return new THREE.MeshStandardMaterial({
        color:G.col(col), roughness:0.92, metalness:0.02, envMapIntensity:0.4,
        emissiveMap:night ? w2 : null, emissive:new THREE.Color(1, 1, 1),
        emissiveIntensity:night ? gl : 0 });
    };
    const lit = bmat("#5A5464", [1, 1.6], 0.42);
    const lit2 = bmat("#4E5A6C", [1, 2.4], 0.50);
    const A = [], B = [];
    const b = T.bounds;
    const cx = b.minX + b.w / 2, cy = b.minY + b.h / 2;
    for(let k = 0; k < 900; k++){
      const a = this.rnd() * TAU;
      const r = 260 + Math.pow(this.rnd(), 0.6) * 1500;
      const x = cx + Math.cos(a) * r * (b.w / Math.max(b.w, b.h) * 0.6 + 0.7);
      const y = cy + Math.sin(a) * r * (b.h / Math.max(b.w, b.h) * 0.6 + 0.7);
      if(!this.clear(T, x, y, 30) || this.onStreet(x, y, 16)) continue;
      if(!this.takeSpot(x, y, 22)) continue;
      // nearer the circuit the blocks are taller; out in the valley they are not
      const near = 1 - clamp((r - 220) / 1400, 0, 1);
      const h = 9 + Math.pow(this.rnd(), 2.1) * (16 + near * 110);
      const w2 = 14 + this.rnd() * 26, d = 14 + this.rnd() * 26;
      const rot = this.rnd() * 0.6 - 0.3;
      (h > 34 ? B : A).push([x, y, T.z[T.near(x, y)], rot, 1, 1, w2, d, h]);
    }
    for(const [list, mat, bw, bh] of [[A, lit, 20, 20], [B, lit2, 24, 34]]){
      if(!list.length) continue;
      const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
      // the instanced matrix carries the size, so one box serves the lot
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      const d = new THREE.Object3D();
      list.forEach((it, i) => {
        d.position.set(it[0], it[2], it[1]); d.rotation.set(0, it[3], 0);
        d.scale.set(it[6], it[8], it[7]); d.updateMatrix();
        im.setMatrixAt(i, d.matrix);
      });
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = false; im.receiveShadow = false; im.userData.dynamic = true;
      g.add(im);
    }
  },

  /* ---- the ridge line, which is what tells you this is a valley ---- */
  mountains(G, g, T){
    const b = T.bounds, cx = b.minX + b.w / 2, cy = b.minY + b.h / 2;
    const mat = new THREE.MeshBasicMaterial({ color:G.col(this.night ? "#16121F" : "#6E6A78"),
      side:THREE.DoubleSide, fog:false });
    const R2 = 3200;
    for(let ring = 0; ring < 2; ring++){
      const rr = R2 + ring * 600;
      const pos = [], idx = [];
      const N = 96;
      let v = 0;
      for(let i = 0; i < N; i++){
        const a0 = i / N * TAU, a1 = (i + 1) / N * TAU;
        const hgt = (h => 120 + h * 320)(0.5 + 0.5 * Math.sin(a0 * 3.1 + ring * 2) * Math.sin(a0 * 7.3 + ring));
        const h2 = (h => 120 + h * 320)(0.5 + 0.5 * Math.sin(a1 * 3.1 + ring * 2) * Math.sin(a1 * 7.3 + ring));
        const z0 = T.z[0] - 40;
        pos.push(cx + Math.cos(a0) * rr, z0, cy + Math.sin(a0) * rr,
                 cx + Math.cos(a1) * rr, z0, cy + Math.sin(a1) * rr,
                 cx + Math.cos(a1) * rr, z0 + h2, cy + Math.sin(a1) * rr,
                 cx + Math.cos(a0) * rr, z0 + hgt, cy + Math.sin(a0) * rr);
        idx.push(v, v + 1, v + 2, v, v + 2, v + 3); v += 4;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, ring ? mat : new THREE.MeshBasicMaterial({
        color:G.col(this.night ? "#0E0B16" : "#5A5666"), side:THREE.DoubleSide, fog:false }));
      m.userData.dynamic = true; m.frustumCulled = false;
      g.add(m);
    }
  },

  /* ---- what you actually drive past ---- */
  furniture(G, g, T){
    const night = this.night, n = T.n;
    const bol = [], tyre = [], plant = [], marsh = [], tv = [];
    for(let i = 0; i < n; i += 1){
      const u = i / n;
      for(const sd of [-1, 1]){
        const ro = sd < 0 ? T.roL[i] : T.roR[i];
        const o = sd * (T.half + ro + 1.9);
        const x = T.x[i] + T.nx[i] * o, y = T.y[i] + T.ny[i] * o, z = T.z[i];
        // tyre stacks where an escape road ends and at the barrier joints
        if(ro > T.def.runoff + 2.5 && i % 4 === 0)
          tyre.push([x + T.nx[i] * sd * 1.2, y + T.ny[i] * sd * 1.2, z, this.rnd() * TAU, 1]);
        else if(i % 46 === 0) plant.push([x, y, z, -T.ang[i], 1]);
        if(i % 11 === 0) bol.push([x - T.nx[i] * sd * 1.2, y - T.ny[i] * sd * 1.2, z, 0, 1]);
      }
      if(i % 58 === 0){
        const o = (T.half + T.roR[i] + 6);
        marsh.push([T.x[i] + T.nx[i] * o, T.y[i] + T.ny[i] * o, T.z[i], -T.ang[i], 1]);
      }
      if(i % 97 === 0){
        const o = -(T.half + T.roL[i] + 8);
        tv.push([T.x[i] + T.nx[i] * o, T.y[i] + T.ny[i] * o, T.z[i], -T.ang[i], 1]);
      }
    }
    if(tyre.length){
      const tg = new THREE.CylinderGeometry(1.0, 1.0, 2.4, 10); tg.translate(0, 1.2, 0);
      LB.many(G, g, tg, G.mat("#1A1C20", { roughness:0.95 }), tyre, true);
      const tw = new THREE.CylinderGeometry(1.02, 1.02, 0.3, 10); tw.translate(0, 1.3, 0);
      LB.many(G, g, tw, night ? G.glowMat("#F2F2F2", 0.7) : G.mat("#E8E8EA"), tyre, false);
    }
    if(bol.length){
      const bg = new THREE.CylinderGeometry(0.16, 0.2, 1.0, 6); bg.translate(0, 0.5, 0);
      LB.many(G, g, bg, night ? G.glowMat("#E8E24A", 0.5) : G.mat("#C8C24A"), bol, false);
    }
    if(plant.length){
      const pg = new THREE.CylinderGeometry(1.3, 1.1, 1.2, 8); pg.translate(0, 0.6, 0);
      LB.many(G, g, pg, G.mat("#4A4450"), plant, true);
      const sg = new THREE.SphereGeometry(1.5, 7, 5); sg.translate(0, 2.2, 0);
      LB.many(G, g, sg, G.mat("#2E5A3E"), plant, false);
    }
    if(marsh.length){
      const mg = new THREE.BoxGeometry(2.4, 2.6, 2.4); mg.translate(0, 1.3, 0);
      LB.many(G, g, mg, G.mat("#D8DCE0"), marsh, true);
      const rg = new THREE.BoxGeometry(3.0, 0.3, 3.0); rg.translate(0, 2.75, 0);
      LB.many(G, g, rg, G.mat("#D8352A"), marsh, false);
    }
    if(tv.length){
      // the camera towers: a scaffold and a platform
      const sg = new THREE.BoxGeometry(2.6, 7.0, 2.6); sg.translate(0, 3.5, 0);
      LB.many(G, g, sg, G.mat("#4A5058", { metalness:0.6, roughness:0.5 }), tv, true);
      const pg = new THREE.BoxGeometry(4.0, 0.4, 4.0); pg.translate(0, 7.2, 0);
      LB.many(G, g, pg, G.mat("#2E3238"), tv, false);
      const cg = new THREE.BoxGeometry(1.2, 0.8, 0.8); cg.translate(0, 8.0, 0);
      LB.many(G, g, cg, G.mat("#16181C"), tv, false);
    }

    /* hospitality marquees on the outside of the fast corners */
    for(const m of (T.def.marquees || [])){
      const p = this.at(T, m.u, (m.side === "in" ? -1 : 1) * m.off);
      LB.box(G, g, p.x, p.y, p.z, m.l || 44, m.w || 22, 7, p.a, G.mat("#E8E6EC", { roughness:0.9 }));
      for(let k = 0; k < 5; k++){
        const t = (k / 4 - 0.5) * (m.l || 44);
        LB.cone(G, g, p.x + Math.cos(p.a) * t, p.y + Math.sin(p.a) * t, p.z + 7,
          (m.w || 22) * 0.4, 4.5, G.mat("#F4F2F6"), 10);
      }
      if(night) LB.crown(G, g, p.x, p.y, p.z + 6.6, (m.l || 44) + 1, (m.w || 22) + 1, p.a, "#FFD9A0", 0.5);
    }
  },

  /* ---- the hoardings along the concrete ----
     Panels on the track-facing side of the wall, in runs, with the long ones on
     the straights where there is time to read them. */
  adverts(G, g, T){
    const night = this.night, n = T.n;
    const H2 = 1.05, lift = 0.16;
    const byMat = new Map();
    let seed = 7;
    const nextAd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
    for(const sd of [-1, 1]){
      let i = 8;
      while(i < n - 4){
        // how long a run this stretch will take: straights get the long panels
        const straight = Math.abs(T.curv[i]) < 0.0025;
        const nodes = straight ? 3 + Math.floor(nextAd() * 3) : 2;
        const span = nodes * T.ds;
        // leave gaps, and never cover an escape road's TecPro
        const wide = (sd < 0 ? T.roL[i] : T.roR[i]) > T.def.runoff + 2.5;
        if(!wide && nextAd() < (straight ? 0.86 : 0.45)){
          const k = Math.floor(nextAd() * ADS.LIST.length);
          const mat = ADS.mat(k / ADS.LIST.length + 1e-4, night);
          let arr = byMat.get(mat); if(!arr){ arr = []; byMat.set(mat, arr); }
          arr.push([i, nodes, sd]);
        }
        i += nodes + (nextAd() < 0.3 ? 1 : 0);
      }
    }
    // one geometry per advert, carrying every panel that uses it
    for(const [mat, runs] of byMat){
      const pos = [], uv = [], idx = [];
      let v = 0;
      for(const [i0, nodes, sd] of runs){
        for(let k = 0; k < nodes; k++){
          const i = (i0 + k) % n, j = (i + 1) % n;
          const oi = sd * (T.half + (sd < 0 ? T.roL[i] : T.roR[i]) + (T.barrier === "wall" ? 1.0 : 2.6)) - sd * 0.06;
          const oj = sd * (T.half + (sd < 0 ? T.roL[j] : T.roR[j]) + (T.barrier === "wall" ? 1.0 : 2.6)) - sd * 0.06;
          const ax = T.x[i] + T.nx[i] * oi, ay = T.y[i] + T.ny[i] * oi, az = T.z[i];
          const bx = T.x[j] + T.nx[j] * oj, by = T.y[j] + T.ny[j] * oj, bz = T.z[j];
          pos.push(ax, az + lift, ay, bx, bz + lift, by, bx, bz + lift + H2, by, ax, az + lift + H2, ay);
          const u0 = k / nodes, u1 = (k + 1) / nodes;
          // the panel faces the circuit, so which way round u runs depends on the side
          if(sd > 0) uv.push(u1, 0, u0, 0, u0, 1, u1, 1);
          else       uv.push(u0, 0, u1, 0, u1, 1, u0, 1);
          idx.push(v, v + 1, v + 2, v, v + 2, v + 3); v += 4;
        }
      }
      if(!pos.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat);
      m.receiveShadow = true; g.add(m);
    }
  },
};


export { CITY };
