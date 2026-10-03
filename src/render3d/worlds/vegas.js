import * as THREE from 'three';
import { TAU, shade } from '../../config/util.js';
import { TEAMS } from '../../config/teams.js';
import { PTEX } from '../surfaces.js';

/* ---------- 10b. the Strip, built rather than painted ----------------------
   The landmarks used to be stacks of boxes and four-sided pyramids, because
   that is all the 2D painter could describe. Here each one is built for its own
   silhouette: extruded footprints for the curved and Y-shaped slabs, lathes for
   anything round, real cones for the castle turrets, an instanced lattice for
   the tower in Paris. Silhouette first, then material, then what the roofline
   does at night.

   Detail that repeats — windows, columns, turrets, balconies, lamp heads — is
   instanced or comes out of a map. Nothing here adds polygons to solve a
   problem a texture can solve.

   The 2D fallback is untouched: it still runs the old box-and-pyramid recipe in
   drawProp, so a machine without WebGL gets the same picture it got before.
   ------------------------------------------------------------------------- */

/* the shared toolkit: everything a landmark is made of */
const LB = {
  /* a rounded rectangle as a Shape, for extruding a slab tower */
  slab(l, w, r){
    const s = new THREE.Shape(), hl = l / 2, hw = w / 2;
    r = Math.min(r || 0, hl * 0.9, hw * 0.9);
    s.moveTo(-hl + r, -hw);
    s.lineTo(hl - r, -hw); if(r) s.quadraticCurveTo(hl, -hw, hl, -hw + r);
    s.lineTo(hl, hw - r);  if(r) s.quadraticCurveTo(hl, hw, hl - r, hw);
    s.lineTo(-hl + r, hw); if(r) s.quadraticCurveTo(-hl, hw, -hl, hw - r);
    s.lineTo(-hl, -hw + r);if(r) s.quadraticCurveTo(-hl, -hw, -hl + r, -hw);
    return s;
  },
  /* a gently bowed slab: the shape Wynn, Encore and Aria all share */
  arc(l, w, bow){
    const s = new THREE.Shape(), hl = l / 2, N = 14;
    for(let i = 0; i <= N; i++){ const t = i / N, x = -hl + l * t;
      s.lineTo(x, -w / 2 + bow * Math.sin(t * Math.PI)); }
    for(let i = N; i >= 0; i--){ const t = i / N, x = -hl + l * t;
      s.lineTo(x, w / 2 + bow * Math.sin(t * Math.PI)); }
    s.closePath(); return s;
  },
  /* three wings off a common core: the Venetian and the Mirage */
  wye(arm, w, ang){
    const s = new THREE.Shape();
    const pts = [];
    for(let k = 0; k < 3; k++){
      const a = ang + k * TAU / 3, c = Math.cos(a), sn = Math.sin(a);
      const px = -sn * w / 2, py = c * w / 2;
      pts.push([px, py], [c * arm + px, sn * arm + py],
               [c * arm - px, sn * arm - py], [-px, -py]);
    }
    pts.forEach((p, i) => i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1]));
    s.closePath(); return s;
  },

  /* extrude a footprint upward. bevel gives the top edge a little weight. */
  ex(G, g, shape, x, y, z, h, rot, mat, opts){
    const o = Object.assign({ depth:h, bevelEnabled:false, curveSegments:10 }, opts || {});
    const geo = new THREE.ExtrudeGeometry(shape, o);
    geo.rotateX(-Math.PI / 2);                 // the shape is drawn flat, stand it up
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, z, y); m.rotation.y = -rot;
    m.castShadow = true; m.receiveShadow = true;
    g.add(m); return m;
  },
  /* the UVs an extrusion gets are the shape's own coordinates, in metres,
     which is exactly what a tiling facade map wants */
  exUV(m, sx, sy){
    const uv = m.geometry.attributes.uv;
    for(let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / sx, uv.getY(i) / sy);
    uv.needsUpdate = true; return m;
  },

  /* The four sides of a unit box and nothing else. A lit roofline wants a rim
     round the edge; a solid box puts a lid over the whole roof, which reads as
     a bright plate from above rather than an edge. */
  shell(){
    if(this._shell) return this._shell.clone();
    const p = [], n = [], u = [], idx = [];
    const S = [[[-0.5, 0.5], [0.5, 0.5], [0, 0, 1]], [[0.5, -0.5], [-0.5, -0.5], [0, 0, -1]],
               [[0.5, 0.5], [0.5, -0.5], [1, 0, 0]], [[-0.5, -0.5], [-0.5, 0.5], [-1, 0, 0]]];
    let v = 0;
    for(const [a, b, nr] of S){
      p.push(a[0], 0, a[1], b[0], 0, b[1], b[0], 1, b[1], a[0], 1, a[1]);
      for(let k = 0; k < 4; k++) n.push(nr[0], nr[1], nr[2]);
      u.push(0, 0, 1, 0, 1, 1, 0, 1);
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3); v += 4;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(n, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(u, 2));
    g.setIndex(idx);
    g.translate(0, -0.5, 0);                       // match BoxGeometry's centring
    this._shell = g;
    return g.clone();
  },

  box(G, g, x, y, z, l, w, h, rot, mat){
    const m = new THREE.Mesh(new THREE.BoxGeometry(l, h, w), mat);
    m.position.set(x, z + h / 2, y); m.rotation.y = -rot;
    m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
  },
  cyl(G, g, x, y, z, rb, rt, h, mat, seg){
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 24), mat);
    m.position.set(x, z + h / 2, y);
    m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
  },
  cone(G, g, x, y, z, r, h, mat, seg){
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg || 14), mat);
    m.position.set(x, z + h / 2, y);
    m.castShadow = true; g.add(m); return m;
  },
  lathe(G, g, x, y, z, pts, mat, seg){
    const m = new THREE.Mesh(new THREE.LatheGeometry(pts, seg || 28), mat);
    m.position.set(x, z, y); m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
  },

  /* the lit line round a roof, which is what tells one tower from another at
     night more than its shape does */
  crown(G, g, x, y, z, l, w, rot, col, thick){
    const t = thick || 1.6;
    const m = new THREE.Mesh(new THREE.BoxGeometry(l, t, w), G.glowMat(col, 0.95));
    m.position.set(x, z + t / 2, y); m.rotation.y = -rot; g.add(m); return m;
  },
  crownRing(G, g, x, y, z, r, col, thick){
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, thick || 1.5, 40, 1, true),
      G.glowMat(col, 0.95, { side:THREE.DoubleSide }));
    m.position.set(x, z, y); g.add(m); return m;
  },

  /* the block a tower stands on, with its lit entrance under a canopy */
  podium(G, g, x, y, z, l, w, h, rot, col, night, accent){
    this.box(G, g, x, y, z, l, w, h, rot, G.faceMat("stone", col, night));
    // the porte-cochere: a canopy with light under it
    const cx = x + Math.cos(rot + Math.PI / 2) * (w / 2 + 5), cy = y + Math.sin(rot + Math.PI / 2) * (w / 2 + 5);
    this.box(G, g, cx, cy, z + h * 0.52, l * 0.34, 14, 1.6, rot, G.mat(shade(col, -0.3)));
    if(night){
      const lit = new THREE.Mesh(new THREE.PlaneGeometry(l * 0.32, 13),
        G.glowMat(accent || "#FFD8A0", 1.5, { side:THREE.DoubleSide }));
      lit.rotation.x = Math.PI / 2; lit.position.set(cx, z + h * 0.52 - 0.1, cy);
      lit.rotation.z = -rot; g.add(lit);
      const pool = new THREE.Mesh(new THREE.CircleGeometry(16, 18), G.poolMat("#FFC880", 0.22));
      pool.rotation.x = -Math.PI / 2; pool.position.set(cx, z + 0.12, cy); g.add(pool);
    }
    return { cx, cy };
  },

  /* a name across the top of a tower, or a marquee on its base */
  text(G, g, txt, x, y, z, w, h, rot, col, bg, italic){
    const cv = document.createElement("canvas"); cv.width = 512; cv.height = 128;
    const c = cv.getContext("2d");
    if(bg){ c.fillStyle = bg; c.fillRect(0, 0, 512, 128); } else c.clearRect(0, 0, 512, 128);
    c.fillStyle = col; c.textAlign = "center"; c.textBaseline = "middle";
    let fs = 88;
    c.font = "800 " + (italic ? "italic " : "") + fs + "px 'Saira Condensed',sans-serif";
    while(c.measureText(txt).width > 484 && fs > 14){
      fs -= 3; c.font = "800 " + (italic ? "italic " : "") + fs + "px 'Saira Condensed',sans-serif";
    }
    c.fillText(txt, 256, 68);
    const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8;
    const mat = new THREE.MeshStandardMaterial({ map:t, transparent:!bg, emissiveMap:t,
      emissive:new THREE.Color(1, 1, 1), emissiveIntensity:1.5, roughness:0.8,
      side:THREE.FrontSide, depthWrite:!!bg });
    // two single-sided panels back to back. One double-sided plane shows the
    // lettering mirrored from behind, which is the sort of thing you only
    // notice once and then cannot stop noticing.
    const grp = new THREE.Group();
    const geo = new THREE.PlaneGeometry(w, h);
    const a2 = new THREE.Mesh(geo, mat); grp.add(a2);
    const b2 = new THREE.Mesh(geo, mat); b2.rotation.y = Math.PI; grp.add(b2);
    grp.position.set(x, z, y); grp.rotation.y = -rot; g.add(grp);
    return grp;
  },

  /* one geometry, many places: the cheap way to have four hundred of anything */
  /* several geometries into one, non-indexed, keeping colour where there is any */
  merge(geos){
    let n = 0; const parts = geos.map(g => { const q = g.index ? g.toNonIndexed() : g; n += q.attributes.position.count; return q; });
    const hasCol = parts.some(q => q.attributes.color), hasUV = parts.every(q => q.attributes.uv);
    const pos = new Float32Array(n * 3), col = hasCol ? new Float32Array(n * 3) : null, uv = hasUV ? new Float32Array(n * 2) : null;
    let o = 0;
    for(const q of parts){
      const c = q.attributes.position.count;
      pos.set(q.attributes.position.array, o * 3);
      if(col){ if(q.attributes.color) col.set(q.attributes.color.array, o * 3); else col.fill(1, o * 3, (o + c) * 3); }
      if(uv) uv.set(q.attributes.uv.array, o * 2);
      o += c;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    if(col) out.setAttribute("color", new THREE.BufferAttribute(col, 3));
    if(uv) out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    out.computeVertexNormals();
    return out;
  },

  /* r128 frustum-culls an InstancedMesh by its template geometry's bounds at the
     origin, not by where the instances are. A set spread over a whole town is
     then either always drawn or wrongly thrown away. So instances are split into
     spatial chunks, and each chunk gets its own geometry handle carrying the
     true bounds of what is in it: culling works, and so does the shadow pass. */
  CHUNK:110,
  many(G, g, geo, mat, list, cast){
    if(!list.length) return null;
    if(!geo.boundingSphere) geo.computeBoundingSphere();
    const r0 = geo.boundingSphere.radius + geo.boundingSphere.center.length();
    const C = this.CHUNK, groups = new Map();
    for(const it of list){
      const k = Math.floor(it[0] / C) + "," + Math.floor(it[1] / C);
      let a = groups.get(k); if(!a){ a = []; groups.set(k, a); } a.push(it);
    }
    const d = new THREE.Object3D();
    // every chunk carries a colour buffer (white unless the instance says otherwise):
    // r128 keeps one program per material, and a mesh without one, sharing a material
    // with a mesh that has one, is drawn by a shader that expects it and the frame fails
    const anyCol = true;
    let first = null;
    for(const items of groups.values()){
      // a new geometry object sharing the same buffers, so it can carry its own bounds
      const gg = new THREE.BufferGeometry();
      for(const name in geo.attributes) gg.setAttribute(name, geo.attributes[name]);
      if(geo.index) gg.setIndex(geo.index);
      for(const gr of geo.groups) gg.addGroup(gr.start, gr.count, gr.materialIndex);
      const im = new THREE.InstancedMesh(gg, mat, items.length);
      const tint = new THREE.Color();
      let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity, smax = 0;
      items.forEach((it, i) => {
        if(it[6] != null){ tint.set(it[6]).convertSRGBToLinear(); im.setColorAt(i, tint); }
        else if(anyCol){ tint.setRGB(1, 1, 1); im.setColorAt(i, tint); }
        d.position.set(it[0], it[2], it[1]);
        d.rotation.set(0, it[3] || 0, 0);
        const s = it[4] == null ? 1 : it[4], sy = it[5] == null ? s : it[5];
        d.scale.set(s, sy, s);
        d.updateMatrix(); im.setMatrixAt(i, d.matrix);
        x0 = Math.min(x0, it[0]); x1 = Math.max(x1, it[0]); y0 = Math.min(y0, it[2]); y1 = Math.max(y1, it[2]);
        z0 = Math.min(z0, it[1]); z1 = Math.max(z1, it[1]); smax = Math.max(smax, s, sy);
      });
      gg.boundingSphere = new THREE.Sphere(new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2),
        Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 + r0 * smax);
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = !!cast; im.receiveShadow = true;
      // r128 switches culling off on every InstancedMesh, since it cannot bound
      // them; these chunks carry true bounds, so it can go back on
      im.frustumCulled = true;
      // instanced meshes carry their own transforms, so they must skip the bake
      im.userData.dynamic = true;
      g.add(im); if(!first) first = im;
    }
    return first;
  },
};

/* Each entry gets (G3, group, prop, track, session) and builds one property.
   p.x/p.y is the plot centre, p.z the ground under it, p.h the tower height,
   p.rot roughly square to the circuit. Where I was unsure of the real building
   the comment says so. */
const LM3 = {

  /* Bellagio: a shallow crescent of cream Italianate tower with terracotta
     banding, set back behind the lake. The fountains are the landmark, not the
     hotel, so they get the work. */
  bellagio(G, g, p, T, S){
    const night = T.night, h = p.h, col = "#E4DCC4";
    const face = G.faceMat("stucco", col, night);
    // the curve: one long bowed slab with two shorter wings stepped down
    LB.exUV(LB.ex(G, g, LB.arc(150, 26, 16), p.x, p.y, p.z, h, p.rot, face), 9, 4.2);
    LB.exUV(LB.ex(G, g, LB.arc(86, 24, 10),
      p.x + Math.cos(p.rot) * 96, p.y + Math.sin(p.rot) * 96, p.z, h * 0.74, p.rot + 0.5, face), 9, 4.2);
    // the terracotta cornice and the roofline
    LB.box(G, g, p.x, p.y, p.z + h, 154, 30, 2.6, p.rot, G.mat("#B4632E", { roughness:0.85 }));
    if(night) LB.crown(G, g, p.x, p.y, p.z + h + 2.6, 154, 30, p.rot, "#FFD9A0", 1.0);
    // the podium and the porte-cochere
    LB.podium(G, g, p.x, p.y, p.z, 168, 46, 16, p.rot, "#DCD2B6", night, "#FFE0B0");
    LB.text(G, g, "BELLAGIO", p.x, p.y + 0.1, p.z + h * 0.72, 62, 12, p.rot, "#FFF0CE", null);

    /* the lake, in front, between the hotel and the road */
    const lx = p.x - Math.cos(p.rot + Math.PI / 2) * 78, ly = p.y - Math.sin(p.rot + Math.PI / 2) * 78;
    const lake = new THREE.Mesh(new THREE.CircleGeometry(1, 40),
      new THREE.MeshStandardMaterial({ color:G.col("#12283C"), roughness:0.16, metalness:0.75,
        envMapIntensity:2.4, emissive:G.col("#0A1E30"), emissiveIntensity:night ? 0.6 : 0 }));
    lake.rotation.x = -Math.PI / 2; lake.rotation.z = -p.rot;
    lake.scale.set(132, 56, 1); lake.position.set(lx, p.z + 0.3, ly);
    lake.receiveShadow = false; g.add(lake);
    // the coping round it
    const kerb = new THREE.Mesh(new THREE.TorusGeometry(1, 0.016, 6, 48),
      G.mat("#C8C0AC"));
    kerb.rotation.x = Math.PI / 2; kerb.rotation.z = -p.rot;
    kerb.scale.set(134, 58, 1); kerb.position.set(lx, p.z + 1.2, ly); g.add(kerb);

    /* the fountain show: jets standing in the lake, rising and falling. They are
       tapered cylinders, lit white, with a haze cap — cheap, and from above that
       is what the show reads as. */
    const jets = [];
    const NJ = 34;
    for(let i = 0; i < NJ; i++){
      const t = i / (NJ - 1), a = (t - 0.5) * Math.PI * 0.92;
      const rr = 1 - 0.45 * Math.abs(t - 0.5) * 2;
      jets.push([lx + Math.cos(p.rot) * Math.sin(a) * 110 - Math.sin(p.rot) * Math.cos(a) * 32 * rr,
                 ly + Math.sin(p.rot) * Math.sin(a) * 110 + Math.cos(p.rot) * Math.cos(a) * 32 * rr, i]);
    }
    const jgeo = new THREE.CylinderGeometry(0.9, 2.6, 1, 8, 1, true);
    jgeo.translate(0, 0.5, 0);
    const jmat = new THREE.MeshStandardMaterial({ color:G.col("#0C1620"), roughness:0.4,
      emissive:G.col("#DCEEFF"), emissiveIntensity:2.6, transparent:true, opacity:0.85,
      side:THREE.DoubleSide, depthWrite:false });
    const im = new THREE.InstancedMesh(jgeo, jmat, jets.length);
    im.userData.dynamic = true; im.frustumCulled = false;
    g.add(im);
    G.dyn.push({ kind:"fountain", im, jets, z:p.z + 0.4, obj:new THREE.Object3D() });
    if(night){
      const fl = new THREE.PointLight(G.col("#BFE0FF"), 2.4, 300, 2);
      fl.position.set(lx, p.z + 26, ly); fl.userData.dynamic = true; g.add(fl);
    }
  },

  /* Caesars Palace: not one tower but a cluster of cream slabs at angles to
     each other, with a columned frontage and a fountain forecourt. */
  caesars(G, g, p, T, S){
    const night = T.night, col = "#EFEADC";
    const face = G.faceMat("stucco", col, night);
    const towers = [[0, 0, 1.0, 0], [72, -34, 0.82, 0.5], [-66, -40, 0.74, -0.45],
                    [24, 70, 0.66, 0.9], [-40, 62, 0.58, -0.8]];
    for(const [dx, dy, sc, dr] of towers){
      const c = Math.cos(p.rot), s2 = Math.sin(p.rot);
      const x = p.x + dx * c - dy * s2, y = p.y + dx * s2 + dy * c;
      const hh = p.h * sc;
      LB.exUV(LB.ex(G, g, LB.arc(56 * (0.6 + sc * 0.5), 20, 7), x, y, p.z, hh, p.rot + dr, face), 9, 4.2);
      LB.box(G, g, x, y, p.z + hh, 60 * (0.6 + sc * 0.5), 24, 2.0, p.rot + dr, G.mat("#8C8472"));
      if(night) LB.crown(G, g, x, y, p.z + hh + 2, 60 * (0.6 + sc * 0.5), 24, p.rot + dr, "#FFE6B4", 0.9);
    }
    /* the frontage: a colonnade, instanced, with a pediment over it */
    const fx = p.x - Math.cos(p.rot + Math.PI / 2) * 54, fy = p.y - Math.sin(p.rot + Math.PI / 2) * 54;
    LB.box(G, g, fx, fy, p.z, 110, 22, 4, p.rot, G.mat("#E8E2D2"));
    const cols = [];
    for(let i = 0; i < 16; i++){
      const t = (i / 15 - 0.5) * 104;
      cols.push([fx + Math.cos(p.rot) * t, fy + Math.sin(p.rot) * t, p.z + 4]);
    }
    const cg = new THREE.CylinderGeometry(1.9, 2.2, 22, 12);
    cg.translate(0, 11, 0);
    LB.many(G, g, cg, G.mat("#F2EDE0", { roughness:0.7 }), cols, true);
    LB.box(G, g, fx, fy, p.z + 26, 112, 24, 3.2, p.rot, G.mat("#9A9384"));
    LB.box(G, g, fx, fy, p.z + 29.2, 104, 20, 2.0, p.rot, G.mat("#8E8877"));
    if(night){
      LB.crown(G, g, fx, fy, p.z + 31.2, 112, 24, p.rot, "#FFDC9A", 0.8);
      const pool = new THREE.Mesh(new THREE.CircleGeometry(40, 22), G.poolMat("#FFD08A", 0.20));
      pool.rotation.x = -Math.PI / 2; pool.position.set(fx, p.z + 0.14, fy); g.add(pool);
    }
    LB.text(G, g, "CAESARS PALACE", fx, fy, p.z + 34, 74, 10, p.rot, "#FFF4D8", null);
    /* the forecourt fountain and the statues in front of it */
    const qx = fx - Math.cos(p.rot + Math.PI / 2) * 32, qy = fy - Math.sin(p.rot + Math.PI / 2) * 32;
    LB.cyl(G, g, qx, qy, p.z, 20, 20, 1.6, G.mat("#DCD4C0"), 28);
    const basin = new THREE.Mesh(new THREE.CircleGeometry(18, 28),
      new THREE.MeshStandardMaterial({ color:G.col("#0E2030"), roughness:0.05, metalness:0.9, envMapIntensity:1.6 }));
    basin.rotation.x = -Math.PI / 2; basin.position.set(qx, p.z + 1.7, qy); g.add(basin);
    for(let i = 0; i < 8; i++){
      const a = i / 8 * TAU;
      LB.cyl(G, g, qx + Math.cos(a) * 13, qy + Math.sin(a) * 13, p.z + 1.7, 0.5, 0.2, 7,
        night ? G.glowMat("#CFE6FF", 1.6) : G.mat("#E8F0F8"), 7);
    }
    // the statues: a plinth and a figure, repeated round the court
    const st = [];
    for(let i = 0; i < 6; i++){
      const a = i / 6 * TAU + 0.4;
      st.push([qx + Math.cos(a) * 30, qy + Math.sin(a) * 30, p.z, -a, 1]);
    }
    const sg = new THREE.CylinderGeometry(1.1, 1.4, 3.2, 8); sg.translate(0, 1.6, 0);
    LB.many(G, g, sg, G.mat("#EAE4D4"), st, true);
    const fg = new THREE.CylinderGeometry(0.9, 0.7, 5.4, 8);
    fg.translate(0, 6.0, 0);
    LB.many(G, g, fg, G.mat("#F4EFE2"), st, true);
    const hg = new THREE.SphereGeometry(0.85, 8, 6); hg.translate(0, 9.2, 0);
    LB.many(G, g, hg, G.mat("#F4EFE2"), st, false);
  },

  /* The Venetian: a tan Y-plan tower, the campanile in brick red with a green
     pyramid on top, a Doge's-palace arcade along the front, and the canal with
     a Rialto-style bridge over it. */
  venetian(G, g, p, T, S){
    const night = T.night, col = "#E2D6BA";
    const face = G.faceMat("stucco", col, night);
    LB.exUV(LB.ex(G, g, LB.wye(46, 26, p.rot), p.x, p.y, p.z, p.h, 0, face), 9, 4.2);
    // the stepped cap
    LB.ex(G, g, LB.wye(48, 28, p.rot), p.x, p.y, p.z + p.h, 2.4, 0, G.mat("#8E836B"));
    LB.ex(G, g, LB.wye(30, 20, p.rot), p.x, p.y, p.z + p.h + 2.4, 5.0, 0, G.mat("#968B73"));
    if(night) LB.crown(G, g, p.x, p.y, p.z + p.h + 7.4, 44, 30, p.rot, "#FFCE72", 1.2);
    LB.podium(G, g, p.x, p.y, p.z, 130, 44, 14, p.rot, "#DCCFAF", night, "#FFD98E");

    /* the arcade: pointed arches along the front, instanced */
    const ax = p.x - Math.cos(p.rot + Math.PI / 2) * 34, ay = p.y - Math.sin(p.rot + Math.PI / 2) * 34;
    LB.box(G, g, ax, ay, p.z, 120, 16, 18, p.rot, G.faceMat("stone", "#EFE8D6", night));
    const arch = [];
    for(let i = 0; i < 20; i++){
      const t = (i / 19 - 0.5) * 112;
      arch.push([ax + Math.cos(p.rot) * t - Math.sin(p.rot) * -8.2,
                 ay + Math.sin(p.rot) * t + Math.cos(p.rot) * -8.2, p.z + 1, -p.rot]);
    }
    const arg = new THREE.TorusGeometry(2.4, 0.55, 5, 9, Math.PI);
    arg.translate(0, 6.4, 0);
    LB.many(G, g, arg, G.mat("#F6F0E0"), arch, false);
    const pil = new THREE.BoxGeometry(1.1, 6.4, 1.1); pil.translate(0, 3.2, 0);
    LB.many(G, g, pil, G.mat("#F6F0E0"), arch, false);

    /* the campanile: brick red shaft, belfry, green pyramid */
    const cx = p.x + Math.cos(p.rot) * 84 - Math.sin(p.rot) * -52;
    const cy = p.y + Math.sin(p.rot) * 84 + Math.cos(p.rot) * -52;
    const ch = p.h * 0.78;
    LB.box(G, g, cx, cy, p.z, 13, 13, ch, p.rot, G.faceMat("brick", "#A8452E", night));
    LB.box(G, g, cx, cy, p.z + ch, 16, 16, 9, p.rot,
      night ? G.glowMat("#F0DCA8", 1.4) : G.mat("#EFE4C4"));           // the belfry, lit
    LB.box(G, g, cx, cy, p.z + ch + 9, 14, 14, 3, p.rot, G.mat("#D8CDB0"));
    LB.cone(G, g, cx, cy, p.z + ch + 12, 10.4, 15, G.mat("#2E7A5A", { roughness:0.5, metalness:0.3 }), 4);
    LB.cyl(G, g, cx, cy, p.z + ch + 27, 0.5, 0.2, 5, G.mat("#C8A040"), 6);

    /* the canal and the Rialto-style bridge */
    const wx = p.x - Math.cos(p.rot + Math.PI / 2) * 64, wy = p.y - Math.sin(p.rot + Math.PI / 2) * 64;
    const canal = new THREE.Mesh(new THREE.PlaneGeometry(126, 22),
      new THREE.MeshStandardMaterial({ color:G.col("#12303C"), roughness:0.16, metalness:0.7,
        envMapIntensity:2.2, emissive:G.col("#0A2430"), emissiveIntensity:night ? 0.6 : 0 }));
    canal.rotation.x = -Math.PI / 2; canal.rotation.z = -p.rot;
    canal.position.set(wx, p.z + 0.5, wy); g.add(canal);
    const bpts = [];
    for(let i = 0; i <= 12; i++){ const t = i / 12; bpts.push([ (t - 0.5) * 34, Math.sin(t * Math.PI) * 6 ]); }
    const bs = new THREE.Shape();
    bpts.forEach(([a, b], i) => i ? bs.lineTo(a, b) : bs.moveTo(a, b));
    for(let i = 12; i >= 0; i--){ const [a, b] = bpts[i]; bs.lineTo(a, b - 2.2); }
    bs.closePath();
    const bgeo = new THREE.ExtrudeGeometry(bs, { depth:12, bevelEnabled:false, curveSegments:6 });
    bgeo.rotateY(Math.PI / 2); bgeo.translate(0, 0, -6);
    const bm = new THREE.Mesh(bgeo, G.faceMat("stone", "#EFE8D6", night));
    bm.position.set(wx, p.z + 1.4, wy); bm.rotation.y = -p.rot;
    bm.castShadow = true; g.add(bm);
  },

  /* Palazzo: the taller, plainer tan tower next door. */
  palazzo(G, g, p, T, S){
    const night = T.night, face = G.faceMat("stucco", "#E8DCC0", night);
    LB.exUV(LB.ex(G, g, LB.slab(64, 30, 8), p.x, p.y, p.z, p.h, p.rot, face), 9, 4.2);
    LB.exUV(LB.ex(G, g, LB.slab(46, 26, 6), p.x + Math.cos(p.rot) * 54, p.y + Math.sin(p.rot) * 54,
      p.z, p.h * 0.80, p.rot, face), 9, 4.2);
    LB.box(G, g, p.x, p.y, p.z + p.h, 70, 36, 3.2, p.rot, G.mat("#8A7F65"));
    if(night) LB.crown(G, g, p.x, p.y, p.z + p.h + 3.2, 70, 36, p.rot, "#FFD48A", 1.3);
    LB.podium(G, g, p.x, p.y, p.z, 96, 44, 15, p.rot, "#DED2B4", night, "#FFD98E");
    LB.text(G, g, "PALAZZO", p.x, p.y, p.z + p.h * 0.86, 44, 9, p.rot, "#FFEFC8", null);
  },

  /* Wynn and Encore: two gently bowed bronze-glass slabs side by side, each
     with the script sign across the top. */
  wynn(G, g, p, T, S){
    const night = T.night;
    const face = G.faceMat("bronze", "#8E6A2E", night);
    for(const [k, off, sc] of [[0, -46, 1.0], [1, 46, 0.94]]){
      const x = p.x + Math.cos(p.rot) * off, y = p.y + Math.sin(p.rot) * off;
      const hh = p.h * sc;
      LB.exUV(LB.ex(G, g, LB.arc(58, 22, 13), x, y, p.z, hh, p.rot + (k ? 0.18 : -0.18), face), 8, 4.0);
      LB.box(G, g, x, y, p.z + hh, 62, 28, 2.4, p.rot + (k ? 0.18 : -0.18), G.mat("#6A4E20"));
      LB.text(G, g, k ? "Encore" : "Wynn", x, y, p.z + hh - 9, 40, 12,
        p.rot + (k ? 0.18 : -0.18), "#FFD86A", null, true);
      if(night) LB.crown(G, g, x, y, p.z + hh + 2.4, 62, 28, p.rot + (k ? 0.18 : -0.18), "#FFB84A", 1.2);
    }
    LB.podium(G, g, p.x, p.y, p.z, 150, 50, 17, p.rot, "#7A5C28", night, "#FFC868");
  },

  /* Paris: the half-scale tower, built as a real lattice silhouette. The
     ironwork is an alpha-tested texture on tapered surfaces rather than tens of
     thousands of struts — the only way to get the see-through look at this
     polygon budget. Proportions follow the original: the first platform at
     about a third of the height and a fifth of the height across, narrowing
     twice more to the mast. */
  eiffel(G, g, p, T, S){
    const night = T.night, H2 = p.h;
    const lat = PTEX.lattice();
    const latMat = new THREE.MeshStandardMaterial({ map:lat, alphaMap:lat, transparent:true,
      alphaTest:0.40, color:G.col("#8A7658"), roughness:0.7, metalness:0.45, side:THREE.DoubleSide,
      emissive:G.col(night ? "#7A5418" : "#000000"), emissiveIntensity:night ? 1.0 : 0,
      depthWrite:true });
    const solid = G.mat("#6E5C42", { roughness:0.6, metalness:0.5 });
    // height, half-width: the four stages of the silhouette
    const STAGE = [[0.000, 0.190], [0.215, 0.105], [0.420, 0.058], [0.700, 0.026], [0.905, 0.012]];
    // the four legs: they flare hard at the bottom and straighten by the first deck
    for(let k = 0; k < 4; k++){
      const a = p.rot + Math.PI / 4 + k * Math.PI / 2;
      const pts = [];
      for(let i2 = 0; i2 <= 8; i2++){
        const t = i2 / 8;
        const r = H2 * (0.190 - (0.190 - 0.105) * Math.pow(t, 0.55));
        pts.push(new THREE.Vector3(Math.cos(a) * r, t * H2 * 0.215, Math.sin(a) * r));
      }
      const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 9, H2 * 0.016, 6, false), solid);
      m.position.set(p.x, p.z, p.y); m.castShadow = true; g.add(m);
      // the arch between the legs at ground level
      if(k < 2){
        const b = a + Math.PI / 2;
        const ar = new THREE.Mesh(new THREE.TorusGeometry(H2 * 0.13, H2 * 0.010, 5, 12, Math.PI), solid);
        ar.position.set(p.x, p.z + H2 * 0.030, p.y);
        ar.rotation.y = -a - Math.PI / 4 + k * Math.PI / 2; g.add(ar);
      }
    }
    // the four stages of latticed shaft, each a square frustum
    for(let k = 0; k < STAGE.length - 1; k++){
      const [t0, w0] = STAGE[k], [t1, w1] = STAGE[k + 1];
      const geo = new THREE.LatheGeometry(
        [new THREE.Vector2(H2 * w0, H2 * t0), new THREE.Vector2(H2 * w1, H2 * t1)], 4, 0, TAU);
      const m = new THREE.Mesh(geo, latMat);
      m.position.set(p.x, p.z, p.y); m.rotation.y = p.rot + Math.PI / 4;
      m.castShadow = false; g.add(m);
    }
    // the decks: small, and only where the real ones are
    for(const [t, w2] of [[0.215, 0.112], [0.420, 0.064], [0.700, 0.030]]){
      LB.box(G, g, p.x, p.y, p.z + H2 * t, H2 * w2 * 2, H2 * w2 * 2, H2 * 0.012,
        p.rot + Math.PI / 4, solid);
      if(night){
        // the deck edge is a line of light, which is how it reads at night
        const e = new THREE.Mesh(new THREE.BoxGeometry(H2 * w2 * 2.1, H2 * 0.007, H2 * w2 * 2.1),
          G.glowMat("#FFB43A", 1.6));
        e.position.set(p.x, p.z + H2 * t + H2 * 0.014, p.y);
        e.rotation.y = -p.rot - Math.PI / 4; g.add(e);
      }
    }
    // the mast and the lamp on top
    LB.cyl(G, g, p.x, p.y, p.z + H2 * 0.905, H2 * 0.013, H2 * 0.006, H2 * 0.060, solid, 8);
    LB.cyl(G, g, p.x, p.y, p.z + H2 * 0.965, 0.7, 0.2, H2 * 0.035,
      night ? G.glowMat("#FFEBC0", 3.2) : G.mat("#C8B890"), 8);
    if(night){
      const L = new THREE.PointLight(G.col("#FFA83A"), 2.6, 380, 2);
      L.position.set(p.x, p.z + H2 * 0.35, p.y); L.userData.dynamic = true; g.add(L);
      const pool = new THREE.Mesh(new THREE.CircleGeometry(H2 * 0.34, 20), G.poolMat("#FFC070", 0.22));
      pool.rotation.x = -Math.PI / 2; pool.position.set(p.x, p.z + 0.16, p.y); g.add(pool);
    }
    /* the Montgolfier balloon sign on the frontage */
    const bx = p.x - Math.cos(p.rot + Math.PI / 2) * 62, by = p.y - Math.sin(p.rot + Math.PI / 2) * 62;
    LB.box(G, g, bx, by, p.z, 96, 32, 26, p.rot, G.faceMat("stone", "#D8CDB4", night));
    if(night) LB.crown(G, g, bx, by, p.z + 26, 98, 38, p.rot, "#FFD07A", 0.9);
    const balloon = new THREE.Mesh(new THREE.SphereGeometry(9, 18, 13),
      new THREE.MeshStandardMaterial({ color:G.col("#B01E26"), roughness:0.55, metalness:0.1,
        emissive:G.col("#8A1218"), emissiveIntensity:night ? 0.9 : 0 }));
    balloon.position.set(bx, p.z + 44, by); balloon.scale.set(1, 1.12, 1);
    balloon.castShadow = true; g.add(balloon);
    for(let k = 0; k < 8; k++){
      const a = k / 8 * TAU;
      LB.box(G, g, bx + Math.cos(a) * 4.6, by + Math.sin(a) * 4.6, p.z + 32, 0.5, 0.5, 6, a, G.mat("#C8A040"));
    }
    LB.box(G, g, bx, by, p.z + 28, 5, 5, 4, p.rot, G.mat("#8A6A2E"));
    LB.cyl(G, g, bx, by, p.z + 26, 2.2, 2.2, 2, G.mat("#6E5A30"), 10);
    LB.text(G, g, "PARIS", bx, by, p.z + 17, 36, 9, p.rot, "#FFD86A", null);
    /* the Arc de Triomphe out front */
    const ax = bx - Math.cos(p.rot + Math.PI / 2) * 34 + Math.cos(p.rot) * 58;
    const ay = by - Math.sin(p.rot + Math.PI / 2) * 34 + Math.sin(p.rot) * 58;
    const arc = new THREE.Shape();
    arc.moveTo(-16, 0); arc.lineTo(16, 0); arc.lineTo(16, 30); arc.lineTo(-16, 30); arc.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-7, 0); hole.lineTo(-7, 14);
    hole.quadraticCurveTo(-7, 21, 0, 21); hole.quadraticCurveTo(7, 21, 7, 14);
    hole.lineTo(7, 0); hole.closePath();
    arc.holes.push(hole);
    const ageo = new THREE.ExtrudeGeometry(arc, { depth:14, bevelEnabled:false, curveSegments:8 });
    ageo.translate(0, 0, -7);
    const am = new THREE.Mesh(ageo, G.faceMat("stone", "#E4DAC2", night));
    am.position.set(ax, p.z, ay); am.rotation.y = -p.rot; am.castShadow = true; g.add(am);
    if(night){
      const pool = new THREE.Mesh(new THREE.CircleGeometry(28, 18), G.poolMat("#FFD9A0", 0.26));
      pool.rotation.x = -Math.PI / 2; pool.position.set(ax, p.z + 0.14, ay); g.add(pool);
    }
  },

  /* Luxor: the black glass pyramid, the beam, and the sphinx. */
  luxor(G, g, p, T, S){
    const night = T.night, base = p.h * 1.9;
    const pyr = new THREE.ConeGeometry(base * Math.SQRT1_2, p.h, 4);
    const m = new THREE.Mesh(pyr, new THREE.MeshStandardMaterial({
      color:G.col("#0B0D14"), roughness:0.07, metalness:0.85, envMapIntensity:2.0,
      emissiveMap:night ? PTEX.windowTex("darkglass", "#0B0D14") : null,
      emissive:night ? new THREE.Color(1, 1, 1) : new THREE.Color(0, 0, 0),
      emissiveIntensity:night ? 0.55 : 0 }));
    m.position.set(p.x, p.z + p.h / 2, p.y); m.rotation.y = p.rot + Math.PI / 4;
    m.castShadow = true; m.receiveShadow = true; g.add(m);
    // the edges, picked out so the silhouette is sharp against a black sky
    if(night){
      const eg = new THREE.EdgesGeometry(pyr);
      const em = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color:G.col("#C8A24A") }));
      em.position.copy(m.position); em.rotation.copy(m.rotation); em.userData.dynamic = true; g.add(em);
    }
    /* the sky beam: an additive cone, bright at the apex and gone by the top */
    if(night){
      const bh = p.h * 9;
      const bg = new THREE.CylinderGeometry(p.h * 0.30, p.h * 0.055, bh, 18, 1, true);
      const bm = new THREE.MeshBasicMaterial({ color:G.col("#EAF2FF"), transparent:true, opacity:0.11,
        blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide });
      const beam = new THREE.Mesh(bg, bm);
      beam.position.set(p.x, p.z + p.h + bh / 2, p.y); beam.userData.dynamic = true;
      beam.frustumCulled = false; g.add(beam);
      const core = new THREE.Mesh(new THREE.CylinderGeometry(p.h * 0.10, p.h * 0.02, bh * 0.5, 12, 1, true),
        new THREE.MeshBasicMaterial({ color:G.col("#FFFFFF"), transparent:true, opacity:0.30,
          blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide }));
      core.position.set(p.x, p.z + p.h + bh * 0.25, p.y); core.userData.dynamic = true;
      core.frustumCulled = false; g.add(core);
      const L = new THREE.PointLight(G.col("#DCE8FF"), 4.0, 400, 2);
      L.position.set(p.x, p.z + p.h + 8, p.y); L.userData.dynamic = true; g.add(L);
    }
    /* the sphinx out front: a crouched body, forelegs and a headdress */
    const sx = p.x - Math.cos(p.rot + Math.PI / 2) * (base * 0.62);
    const sy = p.y - Math.sin(p.rot + Math.PI / 2) * (base * 0.62);
    const st = G.faceMat("sand", "#D8B878", night);
    LB.box(G, g, sx, sy, p.z, 44, 20, 16, p.rot + Math.PI / 2, st);
    LB.box(G, g, sx - Math.cos(p.rot + Math.PI / 2) * 26, sy - Math.sin(p.rot + Math.PI / 2) * 26,
      p.z, 26, 18, 8, p.rot + Math.PI / 2, st);
    LB.box(G, g, sx + Math.cos(p.rot + Math.PI / 2) * 16, sy + Math.sin(p.rot + Math.PI / 2) * 16,
      p.z + 16, 22, 16, 13, p.rot + Math.PI / 2, st);
    LB.box(G, g, sx + Math.cos(p.rot + Math.PI / 2) * 16, sy + Math.sin(p.rot + Math.PI / 2) * 16,
      p.z + 29, 24, 18, 5, p.rot + Math.PI / 2, G.mat("#C8A45E"));
    if(night){
      const L2 = new THREE.PointLight(G.col("#FFC060"), 1.6, 160, 2);
      L2.position.set(sx, p.z + 18, sy); L2.userData.dynamic = true; g.add(L2);
    }
  },

  /* Excalibur: white castle blocks with red, blue and gold conical turrets on
     round bases. */
  excalibur(G, g, p, T, S){
    const night = T.night, face = G.faceMat("stucco", "#EFEBE0", night);
    LB.exUV(LB.ex(G, g, LB.slab(120, 58, 10), p.x, p.y, p.z, p.h * 0.62, p.rot, face), 9, 4.2);
    LB.box(G, g, p.x, p.y, p.z + p.h * 0.62, 124, 62, 2.4, p.rot, G.mat("#948E80"));
    // battlements along the roofline, instanced
    const merl = [];
    for(let i = 0; i < 26; i++){
      const t = (i / 25 - 0.5) * 118;
      for(const sd of [-1, 1])
        merl.push([p.x + Math.cos(p.rot) * t - Math.sin(p.rot) * sd * 30,
                   p.y + Math.sin(p.rot) * t + Math.cos(p.rot) * sd * 30, p.z + p.h * 0.62 + 2.4, -p.rot]);
    }
    const mg = new THREE.BoxGeometry(2.6, 3.2, 2.2); mg.translate(0, 1.6, 0);
    LB.many(G, g, mg, G.mat("#EFEBE0"), merl, false);
    // the turrets: a round drum with a real cone on it
    const TUR = [[-54, -26, 1.0, "#C8202E"], [54, -26, 1.0, "#1E5FC0"], [-54, 26, 0.86, "#D8A020"],
                 [54, 26, 0.86, "#C8202E"], [0, -34, 1.22, "#1E5FC0"], [0, 34, 0.78, "#D8A020"],
                 [-24, 0, 0.94, "#D8A020"], [26, 0, 0.94, "#C8202E"]];
    for(const [dx, dy, sc, tc] of TUR){
      const c = Math.cos(p.rot), s2 = Math.sin(p.rot);
      const x = p.x + dx * c - dy * s2, y = p.y + dx * s2 + dy * c;
      const th = p.h * 0.72 * sc, tr = 8 * sc;
      LB.cyl(G, g, x, y, p.z, tr, tr, th, face, 18);
      LB.cyl(G, g, x, y, p.z + th, tr * 1.18, tr * 1.18, 2.2, G.mat("#E4DED0"), 18);
      LB.cone(G, g, x, y, p.z + th + 2.2, tr * 1.2, th * 0.55,
        night ? G.glowMat(tc, 0.85, { color:G.col(tc), roughness:0.6 }) : G.mat(tc), 16);
      LB.cyl(G, g, x, y, p.z + th + 2.2 + th * 0.55, 0.3, 0.12, 4, G.mat("#D8B84A"), 6);
    }
    LB.text(G, g, "EXCALIBUR", p.x, p.y - 0.2, p.z + p.h * 0.36, 60, 12, p.rot, "#FFE07A", null);
  },

  /* New York-New York: a cluster of mini skyscrapers, the Statue of Liberty,
     a bridge replica, and the coaster winding through it. */
  nyny(G, g, p, T, S){
    const night = T.night;
    const face = G.faceMat("stone", "#96A2AE", night);
    const glass = G.faceMat("glass", "#6E7E92", night);
    const c = Math.cos(p.rot), s2 = Math.sin(p.rot);
    const at = (dx, dy) => [p.x + dx * c - dy * s2, p.y + dx * s2 + dy * c];
    /* the Empire State silhouette: a broad base, a setback shaft, a mast */
    {
      const [x, y] = at(0, 0), hh = p.h;
      LB.exUV(LB.ex(G, g, LB.slab(34, 34, 3), x, y, p.z, hh * 0.52, p.rot, face), 8, 4);
      LB.exUV(LB.ex(G, g, LB.slab(24, 24, 3), x, y, p.z + hh * 0.52, hh * 0.34, p.rot, face), 8, 4);
      LB.exUV(LB.ex(G, g, LB.slab(15, 15, 2), x, y, p.z + hh * 0.86, hh * 0.09, p.rot, face), 8, 4);
      LB.cyl(G, g, x, y, p.z + hh * 0.95, 3.4, 1.6, hh * 0.09, G.mat("#AEB8C2"), 12);
      LB.cyl(G, g, x, y, p.z + hh * 1.04, 0.7, 0.2, hh * 0.13,
        night ? G.glowMat("#FFE0A0", 3.0) : G.mat("#C8D0D8"), 8);
      if(night) LB.crownRing(G, g, x, y, p.z + hh * 0.90, 8.5, "#6EC8FF", 1.4);
    }
    /* the Chrysler silhouette: stepped arches to a spire */
    {
      const [x, y] = at(48, -30), hh = p.h * 0.84;
      LB.exUV(LB.ex(G, g, LB.slab(24, 24, 2), x, y, p.z, hh * 0.70, p.rot + 0.3, face), 8, 4);
      const pts = [];
      for(let i = 0; i <= 7; i++){ const t = i / 7; pts.push(new THREE.Vector2(12 * Math.cos(t * Math.PI / 2) + 0.1, hh * 0.70 + t * hh * 0.22)); }
      LB.lathe(G, g, x, y, p.z, pts, night ? G.glowMat("#C8D8E8", 0.8) : G.mat("#C8D2DC"), 20);
      LB.cyl(G, g, x, y, p.z + hh * 0.92, 0.6, 0.15, hh * 0.16,
        night ? G.glowMat("#EAF4FF", 3.0) : G.mat("#D8E0E8"), 8);
    }
    /* a couple of plainer blocks to fill the skyline */
    for(const [dx, dy, sc, r2] of [[-46, -24, 0.62, 0.2], [30, 40, 0.54, -0.4], [-36, 38, 0.46, 0.7], [62, 12, 0.40, 0.1]]){
      const [x, y] = at(dx, dy);
      LB.exUV(LB.ex(G, g, LB.slab(22, 20, 2), x, y, p.z, p.h * sc, p.rot + r2, glass), 8, 4);
      if(night) LB.crown(G, g, x, y, p.z + p.h * sc, 24, 22, p.rot + r2, "#FFD08A", 0.8);
    }
    /* the Statue of Liberty */
    {
      const [x, y] = at(-70, -52), sh = p.h * 0.34;
      const cu = G.mat("#4EBFA0", { roughness:0.75 });
      LB.box(G, g, x, y, p.z, 14, 14, sh * 0.30, p.rot + 0.4, G.faceMat("stone", "#C8C0B0", night));
      const body = [];
      for(let i = 0; i <= 8; i++){ const t = i / 8; body.push(new THREE.Vector2(3.4 * (1 - t * 0.55) + 0.2, sh * 0.30 + t * sh * 0.52)); }
      LB.lathe(G, g, x, y, p.z, body, cu, 14);
      LB.cyl(G, g, x, y, p.z + sh * 0.82, 1.5, 1.4, sh * 0.10, cu, 10);
      // the crown and the torch arm
      for(let i = 0; i < 7; i++){
        const a = i / 7 * TAU;
        LB.cone(G, g, x + Math.cos(a) * 2.4, y + Math.sin(a) * 2.4, p.z + sh * 0.92, 0.5, 2.4, cu, 5);
      }
      LB.box(G, g, x + 2.4, y, p.z + sh * 0.92, 1.0, 1.0, sh * 0.22, 0.5, cu);
      const torch = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 6),
        night ? G.glowMat("#FFD24A", 3.4) : G.mat("#E8C048"));
      torch.position.set(x + 3.2, p.z + sh * 1.16, y); g.add(torch);
      if(night){
        const L = new THREE.PointLight(G.col("#FFD24A"), 1.2, 110, 2);
        L.position.set(x + 3.2, p.z + sh * 1.16, y); L.userData.dynamic = true; g.add(L);
      }
    }
    /* the bridge replica across the front */
    {
      const [x0, y0] = at(-86, 62), [x1, y1] = at(50, 62);
      const bm = G.faceMat("stone", "#C0B8A8", night);
      for(const [bx, by] of [[x0 + (x1 - x0) * 0.22, y0 + (y1 - y0) * 0.22],
                             [x0 + (x1 - x0) * 0.78, y0 + (y1 - y0) * 0.78]]){
        LB.box(G, g, bx, by, p.z, 11, 11, p.h * 0.30, p.rot, bm);
        LB.box(G, g, bx, by, p.z + p.h * 0.16, 13, 13, 2.0, p.rot, bm);
      }
      LB.box(G, g, (x0 + x1) / 2, (y0 + y1) / 2, p.z + p.h * 0.14, Math.hypot(x1 - x0, y1 - y0), 13, 1.6,
        Math.atan2(y1 - y0, x1 - x0), G.mat("#8A8272"));
      // the cables, as thin tubes following a catenary
      for(const sd of [-1, 1]){
        const cp = [];
        for(let i = 0; i <= 10; i++){
          const t = i / 10;
          const bx = x0 + (x1 - x0) * t, by = y0 + (y1 - y0) * t;
          const sag = Math.abs(t - 0.5) * 2;
          cp.push(new THREE.Vector3(bx - Math.sin(p.rot) * sd * 6,
            p.z + p.h * 0.16 + (sag * sag) * p.h * 0.15 - 0.5, by + Math.cos(p.rot) * sd * 6));
        }
        const cm = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cp), 14, 0.4, 5, false),
          night ? G.glowMat("#8AC8FF", 1.1) : G.mat("#9AA2AA"));
        g.add(cm);
      }
    }
    /* the coaster: one continuous tube that weaves round the whole plot */
    {
      const cp = [];
      for(let i = 0; i < 26; i++){
        const a = i / 26 * TAU;
        const rr = 74 + Math.sin(a * 3) * 22;
        const [x, y] = at(Math.cos(a) * rr, Math.sin(a) * rr * 0.78);
        cp.push(new THREE.Vector3(x, p.z + 16 + Math.sin(a * 2.4) * 13 + Math.sin(a * 5) * 5, y));
      }
      const track = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cp, true), 130, 0.8, 5, true),
        night ? G.glowMat("#FF4A3A", 1.4) : G.mat("#D8352A"));
      track.castShadow = true; g.add(track);
      // the supports under it
      const sup = [];
      for(let i = 0; i < 26; i += 2){
        const v = cp[i]; sup.push([v.x, v.z, p.z, 0, 1, (v.y - p.z) / 2]);
      }
      const sg = new THREE.CylinderGeometry(0.5, 0.6, 2, 6); sg.translate(0, 1, 0);
      LB.many(G, g, sg, G.mat("#7A8290"), sup, false);
    }
    LB.text(G, g, "NEW YORK", ...at(0, -66).slice(0, 2), p.z + 26, 52, 11, p.rot, "#FFD86A", null);
  },

  /* MGM: emerald glass slabs and the lion. */
  mgm(G, g, p, T, S){
    const night = T.night;
    const face = G.faceMat("glass", "#1E6E4A", night);
    for(const [dx, dy, sc, r2] of [[0, 0, 1.0, 0], [58, 22, 0.88, 0.35], [-58, 22, 0.88, -0.35]]){
      const c = Math.cos(p.rot), s2 = Math.sin(p.rot);
      const x = p.x + dx * c - dy * s2, y = p.y + dx * s2 + dy * c;
      LB.exUV(LB.ex(G, g, LB.slab(52, 24, 4), x, y, p.z, p.h * sc, p.rot + r2, face), 8, 4);
      LB.box(G, g, x, y, p.z + p.h * sc, 56, 28, 2.4, p.rot + r2, G.mat("#0E4A30"));
      if(night) LB.crown(G, g, x, y, p.z + p.h * sc + 2.4, 56, 28, p.rot + r2, "#28E894", 1.4);
    }
    LB.podium(G, g, p.x, p.y, p.z, 150, 52, 16, p.rot, "#186040", night, "#5EE8A8");
    /* the lion: a plinth, a couched body, a head and a mane */
    const lx = p.x - Math.cos(p.rot + Math.PI / 2) * 52, ly = p.y - Math.sin(p.rot + Math.PI / 2) * 52;
    const gold = G.mat("#C8A030", { roughness:0.28, metalness:0.85, envMapIntensity:1.8 });
    LB.box(G, g, lx, ly, p.z, 26, 16, 10, p.rot, G.mat("#0C3A26"));
    LB.box(G, g, lx, ly, p.z + 10, 18, 9, 7, p.rot, gold);
    LB.box(G, g, lx + Math.cos(p.rot + Math.PI / 2) * 8, ly + Math.sin(p.rot + Math.PI / 2) * 8,
      p.z + 10, 9, 8, 5, p.rot, gold);
    const head = new THREE.Mesh(new THREE.SphereGeometry(3.6, 12, 9), gold);
    head.position.set(lx + Math.cos(p.rot + Math.PI / 2) * 9, p.z + 20, ly + Math.sin(p.rot + Math.PI / 2) * 9);
    head.castShadow = true; g.add(head);
    const mane = new THREE.Mesh(new THREE.TorusGeometry(4.4, 1.5, 7, 16), gold);
    mane.position.copy(head.position); mane.rotation.y = -p.rot + Math.PI / 2; g.add(mane);
    if(night){
      const pool = new THREE.Mesh(new THREE.CircleGeometry(22, 18), G.poolMat("#FFD24A", 0.30));
      pool.rotation.x = -Math.PI / 2; pool.position.set(lx, p.z + 0.14, ly); g.add(pool);
    }
    LB.text(G, g, "MGM GRAND", p.x, p.y, p.z + p.h * 0.5, 56, 11, p.rot, "#7AF0B4", null);
  },

  /* The Cosmopolitan: twin glass slabs with lit balcony bands and the LED
     marquee column on the corner. */
  cosmopolitan(G, g, p, T, S){
    const night = T.night, face = G.faceMat("glass", "#2C3440", night);
    for(const [dx, sc, r2] of [[-34, 1.0, 0], [34, 0.90, 0.22]]){
      const x = p.x + Math.cos(p.rot) * dx, y = p.y + Math.sin(p.rot) * dx;
      LB.exUV(LB.ex(G, g, LB.slab(44, 22, 3), x, y, p.z, p.h * sc, p.rot + r2, face), 8, 4);
      // the balconies: a lit band every few floors, as instanced slabs
      const bl = [];
      for(let k = 3; k < 22; k += 2) bl.push([x, y, p.z + p.h * sc * (k / 22), -p.rot - r2]);
      const bg = new THREE.BoxGeometry(46, 0.5, 24);
      LB.many(G, g, bg, night ? G.glowMat("#FFCE86", 0.9) : G.mat("#9AA4B0"), bl, false);
      LB.box(G, g, x, y, p.z + p.h * sc, 48, 26, 2.2, p.rot + r2, G.mat("#1A2028"));
      if(night) LB.crown(G, g, x, y, p.z + p.h * sc + 2.2, 48, 26, p.rot + r2, "#7ADCFF", 1.2);
    }
    LB.podium(G, g, p.x, p.y, p.z, 110, 44, 18, p.rot, "#28303C", night, "#8AD8FF");
    /* the marquee: a tall column of moving light on the street corner */
    const mx = p.x - Math.cos(p.rot + Math.PI / 2) * 50 + Math.cos(p.rot) * 48;
    const my = p.y - Math.sin(p.rot + Math.PI / 2) * 50 + Math.sin(p.rot) * 48;
    LB.box(G, g, mx, my, p.z, 12, 12, p.h * 0.52, p.rot, G.mat("#12161C"));
    const scr = G.screen("#00C8FF");
    for(const sd of [0, 1, 2, 3]){
      const a = p.rot + sd * Math.PI / 2;
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(11.4, p.h * 0.46), scr);
      pl.position.set(mx + Math.cos(a + Math.PI / 2) * 6.1, p.z + p.h * 0.28, my + Math.sin(a + Math.PI / 2) * 6.1);
      pl.rotation.y = -a - Math.PI / 2; g.add(pl);
    }
    if(night){
      const L = new THREE.PointLight(G.col("#4AC8FF"), 2.0, 200, 2);
      L.position.set(mx, p.z + p.h * 0.4, my); L.userData.dynamic = true; g.add(L);
    }
  },

  /* Aria: crisp curved silver-grey glass, two blades meeting at an angle. */
  aria(G, g, p, T, S){
    const night = T.night, face = G.faceMat("darkglass", "#4A5866", night);
    for(const [dx, dy, sc, r2, bow] of [[0, 0, 1.0, 0, 18], [66, 30, 0.82, 0.8, -14], [-58, 34, 0.70, -0.7, 12]]){
      const c = Math.cos(p.rot), s2 = Math.sin(p.rot);
      const x = p.x + dx * c - dy * s2, y = p.y + dx * s2 + dy * c;
      LB.exUV(LB.ex(G, g, LB.arc(62, 20, bow), x, y, p.z, p.h * sc, p.rot + r2, face), 8, 4);
      LB.box(G, g, x, y, p.z + p.h * sc, 66, 26, 1.8, p.rot + r2, G.mat("#2A3440"));
      if(night) LB.crown(G, g, x, y, p.z + p.h * sc + 1.8, 66, 26, p.rot + r2, "#BFE4FF", 1.0);
    }
    LB.podium(G, g, p.x, p.y, p.z, 140, 50, 15, p.rot, "#3A4652", night, "#CFE8FF");
    LB.text(G, g, "ARIA", p.x, p.y, p.z + p.h * 0.62, 34, 10, p.rot, "#E8F4FF", null);
  },

  /* Planet Hollywood: a plain tower over a base wrapped in a media facade. */
  planethollywood(G, g, p, T, S){
    const night = T.night, face = G.faceMat("glass", "#3A5068", night);
    LB.exUV(LB.ex(G, g, LB.slab(46, 28, 4), p.x, p.y, p.z, p.h, p.rot, face), 8, 4);
    LB.box(G, g, p.x, p.y, p.z + p.h, 50, 32, 2.2, p.rot, G.mat("#243448"));
    if(night) LB.crown(G, g, p.x, p.y, p.z + p.h + 2.2, 50, 32, p.rot, "#FF7ACF", 1.3);
    // the base, and the screen wrapped round the side that faces the road
    LB.box(G, g, p.x, p.y, p.z, 118, 54, 26, p.rot, G.mat("#1A2430"));
    const scr = G.screen("#FF3D92");
    for(const [ox, oy, w, a] of [[0, -28, 116, 0], [59, 0, 52, Math.PI / 2], [-59, 0, 52, Math.PI / 2]]){
      const c = Math.cos(p.rot), s2 = Math.sin(p.rot);
      const x = p.x + ox * c - oy * s2, y = p.y + ox * s2 + oy * c;
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(w, 24), scr);
      pl.position.set(x, p.z + 13, y); pl.rotation.y = -p.rot - a + Math.PI;
      g.add(pl);
    }
    if(night){
      const L = new THREE.PointLight(G.col("#FF5AA8"), 2.2, 220, 2);
      L.position.set(p.x, p.z + 20, p.y); L.userData.dynamic = true; g.add(L);
    }
  },

  /* The Mirage: a gold-glass Y tower with the volcano in the lagoon out front.
     Flagged in the summary — the real property closed in 2024 and is being
     rebuilt as a guitar-shaped hotel; this is deliberately the Mirage. */
  mirage(G, g, p, T, S){
    const night = T.night, face = G.faceMat("bronze", "#A07C34", night);
    LB.exUV(LB.ex(G, g, LB.wye(40, 24, p.rot), p.x, p.y, p.z, p.h, 0, face), 8, 4);
    LB.ex(G, g, LB.wye(42, 26, p.rot), p.x, p.y, p.z + p.h, 2.4, 0, G.mat("#7A5C24"));
    if(night) LB.crownRing(G, g, p.x, p.y, p.z + p.h + 3.4, 34, "#FFC04A", 1.6);
    LB.podium(G, g, p.x, p.y, p.z, 118, 46, 15, p.rot, "#8A6C2E", night, "#FFD89A");
    /* the volcano: a cone in a lagoon, with fire at the top */
    const vx = p.x - Math.cos(p.rot + Math.PI / 2) * 66, vy = p.y - Math.sin(p.rot + Math.PI / 2) * 66;
    const lag = new THREE.Mesh(new THREE.CircleGeometry(34, 26),
      new THREE.MeshStandardMaterial({ color:G.col("#08201E"), roughness:0.07, metalness:0.9, envMapIntensity:1.6 }));
    lag.rotation.x = -Math.PI / 2; lag.position.set(vx, p.z + 0.35, vy); g.add(lag);
    LB.cone(G, g, vx, vy, p.z, 22, 26, G.mat("#2A2420", { roughness:0.95 }), 16);
    for(let i = 0; i < 5; i++){
      const a = i / 5 * TAU;
      LB.cone(G, g, vx + Math.cos(a) * 15, vy + Math.sin(a) * 15, p.z, 9, 12 + i, G.mat("#332C26"), 10);
    }
    if(night){
      const fire = new THREE.Mesh(new THREE.ConeGeometry(9, 22, 12),
        new THREE.MeshBasicMaterial({ color:G.col("#FF7A1A"), transparent:true, opacity:0.55,
          blending:THREE.AdditiveBlending, depthWrite:false }));
      fire.position.set(vx, p.z + 32, vy); fire.userData.dynamic = true; g.add(fire);
      const L = new THREE.PointLight(G.col("#FF8A2A"), 3.0, 260, 2);
      L.position.set(vx, p.z + 30, vy); L.userData.dynamic = true; g.add(L);
      G.dyn.push({ kind:"flicker", obj:fire, light:L, base:3.0 });
    }
    LB.text(G, g, "MIRAGE", p.x, p.y, p.z + p.h * 0.55, 42, 11, p.rot, "#FFD88A", null);
  },

  /* Circus Circus: pink and white blocks under a big-top canopy. */
  circus(G, g, p, T, S){
    const night = T.night;
    const face = G.faceMat("stucco", "#E8E2DC", night);
    LB.exUV(LB.ex(G, g, LB.slab(70, 26, 4), p.x, p.y, p.z, p.h, p.rot, face), 8, 4);
    LB.exUV(LB.ex(G, g, LB.slab(50, 24, 4), p.x + Math.cos(p.rot) * 62, p.y + Math.sin(p.rot) * 62,
      p.z, p.h * 0.8, p.rot + 0.3, G.faceMat("stucco", "#D8547E", night)), 8, 4);
    if(night){
      LB.crown(G, g, p.x, p.y, p.z + p.h, 72, 28, p.rot, "#FF6AA8", 1.3);
      LB.crown(G, g, p.x + Math.cos(p.rot) * 62, p.y + Math.sin(p.rot) * 62, p.z + p.h * 0.8, 52, 26, p.rot + 0.3, "#FFFFFF", 1.1);
    }
    /* the big top: a striped tent over the casino */
    const tx = p.x - Math.cos(p.rot + Math.PI / 2) * 68, ty = p.y - Math.sin(p.rot + Math.PI / 2) * 68;
    for(let k = 0; k < 16; k++){
      const a0 = k / 16 * TAU;
      const sh = new THREE.Shape();
      sh.moveTo(0, 0);
      for(let i = 0; i <= 6; i++){ const t = i / 6; sh.lineTo(Math.cos(a0 + t * TAU / 16) * 40, Math.sin(a0 + t * TAU / 16) * 40); }
      sh.closePath();
      const geo = new THREE.ExtrudeGeometry(sh, { depth:0.6, bevelEnabled:false, curveSegments:4 });
      geo.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(geo, k % 2 ? G.mat("#F4F0EC") : (night ? G.glowMat("#FF4A8E", 0.9) : G.mat("#D8547E")));
      m.position.set(tx, p.z + 30 - Math.cos(0) * 0, ty);
      m.castShadow = true; g.add(m);
    }
    LB.cone(G, g, tx, ty, p.z + 30, 41, 20, G.mat("#E8E2DC", { roughness:0.9 }), 16);
    LB.cyl(G, g, tx, ty, p.z + 50, 1.2, 0.3, 8, night ? G.glowMat("#FF4A8E", 3.0) : G.mat("#D8547E"), 8);
    LB.cyl(G, g, tx, ty, p.z, 6, 6, 30, G.mat("#DCD6D0"), 14);
    LB.text(G, g, "CIRCUS CIRCUS", p.x, p.y, p.z + p.h * 0.62, 58, 12, p.rot, "#FFB0D4", null);
  },

  /* The STRAT: a slim tapered concrete shaft with the pod near the top and a
     spire above it. The published height is about 1,149 ft, so it is by far the
     tallest thing on the Strip and should read that way. */
  strat(G, g, p, T, S){
    const night = T.night;
    const H2 = p.h;
    const shaft = [];
    for(let i = 0; i <= 10; i++){
      const t = i / 10;
      shaft.push(new THREE.Vector2(13 * (1 - t * 0.62) + 0.5, t * H2 * 0.74));
    }
    LB.lathe(G, g, p.x, p.y, p.z, shaft, G.faceMat("concrete", "#DCD6C6", night), 20);
    // the three legs at the base
    for(let k = 0; k < 3; k++){
      const a = p.rot + k * TAU / 3;
      LB.box(G, g, p.x + Math.cos(a) * 15, p.y + Math.sin(a) * 15, p.z, 9, 22, H2 * 0.16, a + Math.PI / 2,
        G.mat("#CFC8B6"));
    }
    /* the pod: several lit decks and an observation ring */
    const pz = p.z + H2 * 0.74;
    LB.cyl(G, g, p.x, p.y, pz, 9, 17, H2 * 0.045, G.mat("#847D6E"), 24);
    for(let k = 0; k < 4; k++){
      const zz = pz + H2 * 0.045 + k * H2 * 0.026;
      LB.cyl(G, g, p.x, p.y, zz, 18 - k * 1.2, 18 - k * 1.2, H2 * 0.022,
        night ? G.glowMat(k % 2 ? "#FFD9A0" : "#8AD4FF", 1.7) : G.mat("#E8E2D4"), 24);
    }
    LB.cyl(G, g, p.x, p.y, pz + H2 * 0.15, 11, 7, H2 * 0.05, G.mat("#C0B8A6"), 20);
    // the spire
    LB.cyl(G, g, p.x, p.y, pz + H2 * 0.20, 4, 1.2, H2 * 0.045, G.mat("#B8B0A0"), 12);
    LB.cyl(G, g, p.x, p.y, pz + H2 * 0.245, 1.2, 0.25, H2 * 0.075,
      night ? G.glowMat("#FFEEC0", 2.6) : G.mat("#CFC8B8"), 8);
    if(night){
      const L = new THREE.PointLight(G.col("#FFD9A0"), 2.6, 420, 2);
      L.position.set(p.x, pz + H2 * 0.10, p.y); L.userData.dynamic = true; g.add(L);
      // the aviation light on the spire
      const av = new THREE.Mesh(new THREE.SphereGeometry(1.6, 8, 6), G.glowMat("#FF2A1A", 4.0));
      av.position.set(p.x, pz + H2 * 0.325, p.y); av.userData.dynamic = true; g.add(av);
      G.dyn.push({ kind:"beacon", obj:av, rate:1.1 });
    }
    LB.text(G, g, "THE STRAT", p.x, p.y, p.z + H2 * 0.40, 30, 9, p.rot, "#FFE4A8", null);
  },

  /* Fontainebleau: the tall dark-blue glass slab at the north end. */
  fontainebleau(G, g, p, T, S){
    const night = T.night, face = G.faceMat("darkglass", "#1A3A72", night);
    LB.exUV(LB.ex(G, g, LB.arc(54, 24, 11), p.x, p.y, p.z, p.h, p.rot, face), 8, 4);
    LB.box(G, g, p.x, p.y, p.z + p.h, 58, 30, 2.4, p.rot, G.mat("#0E2450"));
    if(night) LB.crown(G, g, p.x, p.y, p.z + p.h + 2.4, 58, 30, p.rot, "#5A9AFF", 1.5);
    LB.podium(G, g, p.x, p.y, p.z, 96, 44, 16, p.rot, "#16305E", night, "#7AB4FF");
  },
};

/* a handful of properties that only need to read as the right colour and mass */
for(const [k, style, col, label] of [
  ["resorts", "glass", "#3A4252", "RESORTS WORLD"],
  ["treasure", "stucco", "#C7A98C", "TREASURE ISLAND"],
  ["harrahs", "stucco", "#6E4E9E", "HARRAH'S"],
  ["flamingo", "stucco", "#D8547E", "FLAMINGO"],
  ["horseshoe", "stone", "#8E8E96", "HORSESHOE"],
]){
  LM3[k] = function(G, g, p, T, S){
    const night = T.night, face = G.faceMat(style, col, night);
    LB.exUV(LB.ex(G, g, LB.slab(56, 26, 5), p.x, p.y, p.z, p.h, p.rot, face), 8, 4);
    LB.exUV(LB.ex(G, g, LB.slab(38, 22, 4), p.x + Math.cos(p.rot) * 50, p.y + Math.sin(p.rot) * 50,
      p.z, p.h * 0.76, p.rot + 0.4, face), 8, 4);
    LB.box(G, g, p.x, p.y, p.z + p.h, 60, 30, 2.2, p.rot, G.mat(shade(col, -0.3)));
    if(night) LB.crown(G, g, p.x, p.y, p.z + p.h + 2.2, 60, 30, p.rot, shade(col, 0.5), 1.1);
    LB.podium(G, g, p.x, p.y, p.z, 92, 40, 14, p.rot, shade(col, -0.15), night, shade(col, 0.55));
    LB.text(G, g, label, p.x, p.y, p.z + p.h * 0.62, 46, 10, p.rot, "#FFEAC8", null);
  };
}

/* ---- the paddock, and the sign over it ---------------------------------- */

/* the letters F and 1, drawn as outlines so they can be extruded with real
   depth. Deliberately not the Formula 1 wordmark: this is a bold italic F with
   a squared-off 1 beside it, in the same spirit but drawn here. */
function f1Shapes(){
  const sk = 0.30;                                     // the lean
  const sh = (pts) => { const s = new THREE.Shape();
    pts.forEach(([x, y], i) => { const X = x + y * sk; i ? s.lineTo(X, y) : s.moveTo(X, y); });
    s.closePath(); return s; };
  // the F: a spine, a full top arm and a shorter middle arm, all squared off
  const F = sh([[0, 0], [0.30, 0], [0.30, 0.40], [0.86, 0.40], [0.86, 0.66], [0.30, 0.66],
                [0.30, 0.74], [1.00, 0.74], [1.00, 1.00], [0, 1.00]]);
  // the 1: a slab with the flag cut back off its top left
  const N = sh([[1.20, 0], [1.56, 0], [1.56, 1.00], [1.26, 1.00], [1.02, 0.80], [1.02, 0.52],
                [1.20, 0.66]]);
  return [F, N];
}

LM3.f1sign = function(G, g, p, T, S){
  const night = T.night;
  const H2 = p.h;                                       // the letters' cap height
  const [F, N] = f1Shapes();
  const depth = H2 * 0.20;
  const red = new THREE.MeshStandardMaterial({ color:G.col("#E10600"), roughness:0.38, metalness:0.15,
    emissive:G.col("#E10600"), emissiveIntensity:night ? 1.25 : 0.25 });
  const white = new THREE.MeshStandardMaterial({ color:G.col("#F6F6F6"), roughness:0.34, metalness:0.1,
    emissive:G.col("#FFFFFF"), emissiveIntensity:night ? 0.85 : 0.2 });
  const side = new THREE.MeshStandardMaterial({ color:G.col("#7A0300"), roughness:0.6, metalness:0.2 });
  const grp = new THREE.Group();
  for(const [shape, mat] of [[F, white], [N, red]]){
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled:true,
      bevelThickness:H2 * 0.02, bevelSize:H2 * 0.015, bevelSegments:2, curveSegments:4 });
    geo.scale(H2, H2, 1);
    const m = new THREE.Mesh(geo, [mat, side]);
    m.castShadow = true; grp.add(m);
  }
  // the speed streaks off the back of the mark
  for(let i = 0; i < 4; i++){
    const y = H2 * (0.14 + i * 0.22), w = H2 * (1.5 - i * 0.28), t = H2 * 0.085;
    const s2 = new THREE.Shape();
    s2.moveTo(0, 0); s2.lineTo(w, t * 0.5); s2.lineTo(w - t * 0.8, t * 1.4); s2.lineTo(0, t);
    s2.closePath();
    const geo = new THREE.ExtrudeGeometry(s2, { depth:depth * 0.7, bevelEnabled:false });
    const m = new THREE.Mesh(geo, red);
    m.position.set(H2 * 1.70, y, 0); grp.add(m);
  }
  // the shapes are drawn from the origin outward, so slide the whole mark back
  // to sit centred on its frame
  grp.children.forEach(m => m.position.x -= H2 * 1.55);
  grp.position.set(p.x, p.z + H2 * 0.95, p.y);
  grp.rotation.y = -p.rot;                       // along the straight, facing across it
  g.add(grp);

  // the line underneath
  LB.text(G, g, "LAS VEGAS GRAND PRIX", p.x, p.y, p.z + H2 * 0.64, H2 * 3.0, H2 * 0.40,
    p.rot, "#F6F6F6", null);

  /* the steel frame it stands on */
  const leg = G.mat("#4A5058", { roughness:0.5, metalness:0.7 });
  for(const sd of [-1, 1]){
    const lx = p.x + Math.cos(p.rot) * sd * H2 * 1.5, ly = p.y + Math.sin(p.rot) * sd * H2 * 1.5;
    LB.box(G, g, lx, ly, p.z, 1.6, 1.6, H2 * 0.95, p.rot, leg);
    for(let k = 0; k < 4; k++)
      LB.box(G, g, lx, ly, p.z + H2 * 0.18 * k, 0.9, 0.9, 0.9, p.rot + 0.7, leg);
  }
  LB.box(G, g, p.x, p.y, p.z + H2 * 0.88, H2 * 3.4, 1.6, 1.2, p.rot, leg);
  LB.box(G, g, p.x, p.y, p.z + H2 * 0.50, H2 * 3.4, 1.0, 0.8, p.rot, leg);
  if(night){
    const L = new THREE.PointLight(G.col("#FF3A2A"), 3.0, 260, 2);
    L.position.set(p.x, p.z + H2 * 1.3, p.y); L.userData.dynamic = true; g.add(L);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(H2 * 2.2, 20), G.poolMat("#FF6A4A", 0.22));
    pool.rotation.x = -Math.PI / 2; pool.position.set(p.x, p.z + 0.16, p.y); g.add(pool);
  }
};

/* the paddock building: garages below, hospitality above, a lit roof rim */
LM3.vegaspit = function(G, g, p, T, S){
  const night = T.night, L2 = 230, W2 = 34;
  const face = G.faceMat("concrete", "#2E3138", night);
  // the ground floor, with the garage openings cut into the track side
  LB.box(G, g, p.x, p.y, p.z, L2, W2, 9, p.rot, face);
  const nx = Math.cos(p.rot + Math.PI / 2), ny = Math.sin(p.rot + Math.PI / 2);
  const NG = 11;
  for(let i = 0; i < NG; i++){
    const t = (i / (NG - 1) - 0.5) * (L2 - 24);
    const gx = p.x + Math.cos(p.rot) * t - nx * (W2 / 2 + 0.3);
    const gy = p.y + Math.sin(p.rot) * t - ny * (W2 / 2 + 0.3);
    // the lit interior behind the opening
    const op = new THREE.Mesh(new THREE.PlaneGeometry(13, 7),
      night ? G.glowMat("#FFE8C0", 1.5) : G.mat("#D8DCE2"));
    op.position.set(gx, p.z + 3.6, gy); op.rotation.y = -p.rot + Math.PI / 2; g.add(op);
    // the banner over it, in the team's colour
    const team = TEAMS[i % TEAMS.length];
    const ban = new THREE.Mesh(new THREE.PlaneGeometry(13, 2.2),
      night ? G.glowMat(team.body, 1.3) : G.mat(team.body));
    ban.position.set(gx - nx * 0.1, p.z + 8.0, gy - ny * 0.1);
    ban.rotation.y = -p.rot + Math.PI / 2; g.add(ban);
    if(night){
      const pool = new THREE.Mesh(new THREE.CircleGeometry(9, 12), G.poolMat("#FFD9A0", 0.20));
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(gx - nx * 5, p.z + 0.15, gy - ny * 5); g.add(pool);
    }
  }
  // the hospitality deck: a glazed band set back over the garages
  LB.box(G, g, p.x, p.y, p.z + 9, L2 - 6, W2 - 4, 1.2, p.rot, G.mat("#1C2026"));
  LB.box(G, g, p.x, p.y, p.z + 10.2, L2 - 10, W2 - 8, 11, p.rot,
    G.faceMat("glass", "#3E4A5A", night));
  LB.box(G, g, p.x, p.y, p.z + 21.2, L2 - 4, W2 - 4, 1.6, p.rot, G.mat("#171A1F"));
  // the lit rim round the roof
  if(night){
    LB.crown(G, g, p.x, p.y, p.z + 22.8, L2 - 4, W2 - 4, p.rot, "#E8EEF6", 0.9);
    LB.crown(G, g, p.x, p.y, p.z + 8.9, L2 - 4, W2 - 2, p.rot, "#FF3D92", 0.7);
  }
  // the roof terrace furniture, so it does not read as a bare slab
  const pods = [];
  for(let i = 0; i < 14; i++){
    const t = (i / 13 - 0.5) * (L2 - 30);
    pods.push([p.x + Math.cos(p.rot) * t + nx * 6, p.y + Math.sin(p.rot) * t + ny * 6, p.z + 22.8, -p.rot]);
  }
  const pg = new THREE.BoxGeometry(7, 3.2, 7); pg.translate(0, 1.6, 0);
  LB.many(G, g, pg, G.mat("#E8EAEE", { roughness:0.85 }), pods, true);
};


export { LB, LM3 };
