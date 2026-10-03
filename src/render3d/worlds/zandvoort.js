import * as THREE from 'three';
import { ZGEO } from '../../tracks/survey/zandvoort.js';
import { TAU, clamp } from '../../config/util.js';
import { TEAMS } from '../../config/teams.js';
import { LB } from './vegas.js';
import { SILVER } from './silverstone.js';

/* ---------- Zandvoort: the survey, built ---------------------------------
   The circuit in the North Sea dunes, built on the Silverstone machinery with
   its own ground, a beach and a sea, dunes instead of fields, and orange
   everywhere. Everything comes off the baked survey (ZGEO); what is invented is
   said where it is built. */
const ZAND = Object.create(SILVER, Object.getOwnPropertyDescriptors({
  get GEO(){ return ZGEO; },
  // its own caches, for the same reason
  _crowd:null, _cf:null, _duneMask:null,
  AIRFIELD:false,
  WIND:0.12,                                  // off the sea, from the west: everything streams east
  GANTRY_TEXT:"ZANDVOORT", NOBLIMP:true, MARQ:0.66,
  TOWERS:[0.064, 0.17, 0.311, 0.454, 0.507, 0.706, 0.85, 0.96],
  FENCE:[0.935, 0.045],
  // the open dunes, wherever the map has no other use for the ground: pale sand, grey-green marram, heath
  CROPS:[
    { c:[214, 200, 156], amp:0.03, sp:41, n:"bare sand" },
    { c:[172, 172, 120], amp:0.04, sp:33, n:"marram dune" },
    { c:[150, 152, 100], amp:0.03, sp:29, n:"grey dune" },
    { c:[132, 128, 90],  amp:0.03, sp:25, n:"dune heath" },
    { c:[188, 182, 132], amp:0.03, sp:37, n:"sand and grass" },
  ],
  LANDCOL:{ grass:"#8EA45C", meadow:"#A2A86E", wood:"#3E5A34", scrub:"#7E8A55", parking:"#9A9C92", camp:"#9AAA66",
            town:"#A6A496", water:"#4E6E80", works:"#9C9C96", yard:"#8C7C60", golf:"#78A84E", pitch:"#6FA84A",
            sand:"#DCCB9A", beach:"#E8D8AA" },
  SHIRTS:["#FF7A00", "#FF7A00", "#FF8A1E", "#FF6A00", "#FF7A00", "#F28A1E", "#FF9A2E", "#FFFFFF", "#1E3A8A", "#C8102E", "#101418", "#FF7A00", "#E86A1A", "#FFB04A"],

  /* ---- the ground: the survey's dunes, kept low between the track and the
     sea, and a beach that shelves gently into the water ---- */
  dune(x, y){
    const s1 = Math.sin(x * 0.021 + Math.sin(y * 0.013) * 1.7) * Math.cos(y * 0.017 - x * 0.006);
    const s2 = Math.sin(x * 0.053 - y * 0.041) * 0.5;
    return (s1 * 0.75 + s2 * 0.25);
  },
  ground(x, y){
    let z = SILVER.ground.call(this, x, y);
    const q = this.near(x, y), e = q ? this.edge(q.i, q.side) : 0, away = q ? q.d - e : 999;
    // ridges and hollows in the open dunes, well clear of the circuit and the town
    if(away > 25 && !this.inTown(x, y)) z += this.dune(x, y) * 2.2 * this.sm((away - 25) / 60);
    const sh = this.shoreAt(x, y);
    if(sh != null){
      const sea = this.GEO.seaZ;
      if(sh < 60){
        // the beach: a gentle shelf from the foot of the dunes down into the sea
        const zb = sea + 0.25 + sh * 0.05;
        z = sh < 0 ? sea - 0.6 + Math.max(sh, -80) * 0.03 : z + (zb - z) * (1 - this.sm((sh - 40) / 20));
      }
      // the dunes between the track and the beach stay low enough to see over
      const ac = this.GEO.across(x, y);
      if(ac > -18 && sh > 0 && q){ const cap = q.z + 4.5; if(z > cap) z = cap + (z - cap) * 0.15; }
    }
    return z;
  },
  // nothing of the fan sprawl goes onto the beach or into the sea
  free(x, y){ const s = this.shoreAt(x, y); if(s != null && s < 40) return false; return SILVER.free.call(this, x, y); },
  inTown(x, y){ const A = this.inn; if(!A || !this.townMask) return false;
    const c = Math.floor((x - A.X0) / A.px), r = Math.floor((y - A.Y0) / A.px);
    return c >= 0 && r >= 0 && c < A.cw && r < A.ch && this.townMask[r * A.cw + c] === 1; },

  /* how far from the water's edge: + on land, - out to sea, metres; a raster
     drawn from the surveyed (and moved) coastline */
  shoreField(T){
    const C = this.GEO.coast, sc = T.worldScale; if(!C || !C.length) return;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for(const [x, y] of C){ x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const M = 200, px = 4, X0 = x0 - M, Y0 = Math.max(y0, -3200 * sc) - M, W = (x1 - x0) + 2 * M, H = (Math.min(y1, 3200 * sc) - Math.max(y0, -3200 * sc)) + 2 * M;
    const cw = Math.ceil(W / px), ch = Math.ceil(H / px);
    const mk = () => { const c = document.createElement("canvas"); c.width = cw; c.height = ch; return c; };
    const P = (x, y) => [(x - X0) / px, (y - Y0) / px];
    const land = mk(), lg = land.getContext("2d", { willReadFrequently:true });
    lg.fillStyle = "#000"; lg.fillRect(0, 0, cw, ch);
    lg.fillStyle = "#FFF"; lg.beginPath();
    C.forEach((p, i) => { const [a, b] = P(p[0], p[1]); i ? lg.lineTo(a, b) : lg.moveTo(a, b); });
    // close the land off to the east, which is where it is
    const [ea, eb] = P(C[C.length - 1][0] + 20000, C[C.length - 1][1]), [fa, fb] = P(C[0][0] + 20000, C[0][1]);
    lg.lineTo(ea, eb); lg.lineTo(fa, fb); lg.closePath(); lg.fill();
    const dist = mk(), dg = dist.getContext("2d", { willReadFrequently:true });
    dg.fillStyle = "#FFF"; dg.fillRect(0, 0, cw, ch); dg.lineCap = "round"; dg.lineJoin = "round";
    for(let d = 124; d >= 0; d -= 2){
      const v = Math.round(d / 124 * 255); dg.strokeStyle = "rgb(" + v + "," + v + "," + v + ")"; dg.lineWidth = Math.max(1, 2 * d / px);
      dg.beginPath(); C.forEach((p, i) => { const [a, b] = P(p[0], p[1]); i ? dg.lineTo(a, b) : dg.moveTo(a, b); }); dg.stroke();
    }
    const L = lg.getImageData(0, 0, cw, ch).data, Dd = dg.getImageData(0, 0, cw, ch).data, N = cw * ch;
    const F = new Float32Array(N), tex = new Uint8Array(N * 4);
    for(let k = 0; k < N; k++){
      const d = Dd[k * 4] / 255 * 124, onLand = L[k * 4] > 127, v = onLand ? d : -d;
      F[k] = v; const e = clamp(Math.round(v + 128), 0, 255); tex[k * 4] = e; tex[k * 4 + 1] = e; tex[k * 4 + 2] = e; tex[k * 4 + 3] = 255;
    }
    const dt = new THREE.DataTexture(tex, cw, ch, THREE.RGBAFormat); dt.flipY = false;
    dt.magFilter = THREE.LinearFilter; dt.minFilter = THREE.LinearFilter; dt.needsUpdate = true;
    this.SH = { X0, Y0, W:cw * px, H:ch * px, px, cw, ch, F, tex:dt };
  },
  shoreAt(x, y){
    const S = this.SH; if(!S) return null;
    const c = Math.floor((x - S.X0) / S.px), r = Math.floor((y - S.Y0) / S.px);
    if(c < 0 || r < 0 || c >= S.cw || r >= S.ch) return x < S.X0 ? -124 : null;
    return S.F[r * S.cw + c];
  },

  /* the painted ground, then the beach drawn into it: the dry sand, the dark wet
     band the tide leaves, the wrack line, and footprints and tyre tracks */
  paint(T){
    SILVER.paint.call(this, T);
    // where the town is, so the dunes do not ripple through its streets
    const A = this.inn, tc = document.createElement("canvas"); tc.width = A.cw; tc.height = A.ch;
    const tg = tc.getContext("2d", { willReadFrequently:true }); tg.fillStyle = "#000"; tg.fillRect(0, 0, A.cw, A.ch); tg.fillStyle = "#FFF";
    for(const r of (this.GEO.land.town || [])){ tg.beginPath(); r.forEach((p, i) => { const a = (p[0] - A.X0) / A.px, b = (p[1] - A.Y0) / A.px; i ? tg.lineTo(a, b) : tg.moveTo(a, b); }); tg.closePath(); tg.fill(); }
    const td = tg.getImageData(0, 0, A.cw, A.ch).data; this.townMask = new Uint8Array(A.cw * A.ch);
    for(let k = 0; k < this.townMask.length; k++) this.townMask[k] = td[k * 4] > 127 ? 1 : 0;
    const C = this.GEO.coast; if(!C) return;
    for(const Ar of [this.inn, this.out]){
      const g = Ar.canvas.getContext("2d"), fp = Ar.W / Ar.canvas.width;
      const Q = (x, y) => [(x - Ar.X0) / fp, (y - Ar.Y0) / fp];
      const line = (d, w, col) => { g.strokeStyle = col; g.lineWidth = w / fp; g.beginPath();
        C.forEach((p, i) => { const [a, b] = Q(p[0] + d, p[1]); i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.stroke(); };
      g.lineCap = "round"; g.lineJoin = "round";
      // under the water, a sandy bottom that darkens with depth (seen through the shallows)
      line(-60, 120, "#9C9474"); line(-18, 36, "#B6AA82");
      // wet sand, then the line of weed and shells the last tide left, then the dry beach
      line(6, 16, "#B39E70"); line(11, 4, "#A08A5E"); line(17, 2.2, "#8A7A58");
      // footprints and the beach-cleaning tractor's tracks
      g.strokeStyle = "rgba(150,132,96,.35)"; g.lineWidth = 1.2 / fp; g.setLineDash([2 / fp, 3 / fp]);
      for(const d of [24, 27, 33]){ g.beginPath(); C.forEach((p, i) => { const [a, b] = Q(p[0] + d + Math.sin(i) * 2, p[1]); i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.stroke(); }
      g.setLineDash([]);
    }
    // the paths through the dunes are loose sand, not tarmac
    for(const Ar of [this.inn, this.out]){
      const g = Ar.canvas.getContext("2d"), fp = Ar.W / Ar.canvas.width;
      g.strokeStyle = "#D8C898"; g.lineWidth = 2.2 / fp; g.lineCap = "round";
      for(const r of (this.GEO.roads.path || [])){ g.beginPath(); r.forEach((p, i) => { const a = (p[0] - Ar.X0) / fp, b = (p[1] - Ar.Y0) / fp; i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.stroke(); }
      g.strokeStyle = "#6A625A"; g.lineWidth = 4 / fp;
      for(const r of (this.GEO.roads.rail || [])){ g.beginPath(); r.forEach((p, i) => { const a = (p[0] - Ar.X0) / fp, b = (p[1] - Ar.Y0) / fp; i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.stroke(); }
    }
  },

  /* ---- the North Sea ---- */
  waveNormals(){
    if(this._wn) return this._wn;
    const N = 128, h = new Float32Array(N * N), R = this.rng(311);
    for(const [f, amp] of [[4, 0.5], [8, 0.28], [16, 0.15], [32, 0.07]]){
      const W = f + 1, gr = new Float32Array(W * W); for(let k = 0; k < gr.length; k++) gr[k] = R();
      for(let y = 0; y <= f; y++) gr[y * W + f] = gr[y * W]; for(let x = 0; x <= f; x++) gr[f * W + x] = gr[x];
      for(let y = 0; y < N; y++) for(let x = 0; x < N; x++){
        const fx = x / N * f, fy = y / N * f, xi = Math.floor(fx), yi = Math.floor(fy), u = fx - xi, v = fy - yi, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
        h[y * N + x] += amp * ((gr[yi * W + xi] * (1 - su) + gr[yi * W + xi + 1] * su) * (1 - sv) + (gr[(yi + 1) * W + xi] * (1 - su) + gr[(yi + 1) * W + xi + 1] * su) * sv);
      }
    }
    const d = new Uint8Array(N * N * 4);
    for(let y = 0; y < N; y++) for(let x = 0; x < N; x++){
      const dx = (h[y * N + (x + 1) % N] - h[y * N + (x + N - 1) % N]) * 6, dy = (h[((y + 1) % N) * N + x] - h[((y + N - 1) % N) * N + x]) * 6;
      const l = Math.hypot(dx, dy, 1), k = (y * N + x) * 4;
      d[k] = (-dx / l * 0.5 + 0.5) * 255; d[k + 1] = (-dy / l * 0.5 + 0.5) * 255; d[k + 2] = h[y * N + x] * 255; d[k + 3] = 255;
    }
    const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
    return (this._wn = t);
  },
  sea(G, g, T){
    if(!this.SH) return;
    const S = this.SH, lin = c => new THREE.Color(c).convertSRGBToLinear();
    const sun = G.sun ? G.sun.position.clone().normalize() : new THREE.Vector3(0.5, 0.7, 0.3);
    this.seaU = Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), {
      uTime:this.U.time, uShore:{ value:S.tex }, uBox:{ value:new THREE.Vector4(S.X0, S.Y0, S.W, S.H) }, uN:{ value:this.waveNormals() },
      uSun:{ value:sun }, uSky:{ value:lin("#8FB3D0") }, uHor:{ value:lin("#D2DCE2") },
      uShallow:{ value:lin("#647F78") }, uDeep:{ value:lin("#4A5E6A") }, uDark:this.U.dark });
    const mat = new THREE.ShaderMaterial({ uniforms:this.seaU, fog:true,
      vertexShader:`varying vec3 vW;
#include <fog_pars_vertex>
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
#include <fog_vertex>
}`,
      fragmentShader:`varying vec3 vW; uniform float uTime, uDark; uniform sampler2D uShore, uN; uniform vec4 uBox; uniform vec3 uSun, uSky, uHor, uShallow, uDeep;
#include <common>
#include <fog_pars_fragment>
void main(){
  vec2 su = (vW.xz - uBox.xy) / uBox.zw;
  float sd = (texture2D(uShore, su).r * 255.0 - 128.0);
  if(su.x < 0.0 || su.y < 0.0 || su.x > 1.0 || su.y > 1.0) sd = -124.0;
  float dsea = max(-sd, 0.0);
  vec3 n1 = texture2D(uN, vW.xz / 41.0 + vec2(uTime * 0.021, uTime * 0.012)).xyz * 2.0 - 1.0;
  vec3 n2 = texture2D(uN, vW.xz / 113.0 - vec2(uTime * 0.009, -uTime * 0.016)).xyz * 2.0 - 1.0;
  vec3 N = normalize(vec3(n1.x + n2.x, 2.6, n1.y + n2.y));
  vec3 V = normalize(cameraPosition - vW);
  float fres = 0.03 + 0.97 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 water = mix(uShallow, uDeep, smoothstep(0.0, 260.0, dsea));
  vec3 Rf = reflect(-V, N);
  vec3 sky = mix(uHor, uSky, clamp(Rf.y * 1.6, 0.0, 1.0));
  vec3 col = mix(water, sky, clamp(fres * 0.85, 0.0, 1.0));
  // sun glints
  col += vec3(1.0, 0.94, 0.82) * pow(max(dot(Rf, uSun), 0.0), 260.0) * 4.0 * (1.0 - uDark);
  // breakers rolling in, broken up so they are not ruled lines
  float nz = texture2D(uN, vW.xz / 17.0 + vec2(uTime * 0.04, 0.0)).z;
  float w = fract(dsea / 24.0 + uTime * 0.085);
  float band = smoothstep(0.0, 0.06, w) * smoothstep(0.28, 0.06, w) * smoothstep(110.0, 18.0, dsea);
  float foam = band * smoothstep(0.38, 0.72, nz);
  // the swash: the edge of the water runs up the beach and back
  float edge = 7.0 + 4.0 * sin(uTime * 0.52 + vW.z * 0.004) + 2.0 * sin(uTime * 1.3 + vW.z * 0.02);
  foam = max(foam, smoothstep(edge, edge - 3.5, dsea) * (0.55 + 0.45 * nz));
  col = mix(col, vec3(0.90, 0.92, 0.91), clamp(foam, 0.0, 1.0));
  col *= 1.0 - uDark * 0.35;
  gl_FragColor = vec4(col, 1.0);
#include <tonemapping_fragment>
#include <encodings_fragment>
#include <fog_fragment>
}` });
    // the water itself: out from the coast to the horizon
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    const xR = S.X0 + S.W - 40, xL = -12000, yT = -12000, yB = 12000;
    const m = new THREE.Mesh(geo, mat);
    m.scale.set(xR - xL, 1, yB - yT); m.position.set((xL + xR) / 2, this.GEO.seaZ, (yT + yB) / 2);
    m.frustumCulled = false; m.userData.dynamic = true; m.receiveShadow = false; g.add(m); this.seaM = m;
  },

  /* ---- the beach: pavilions on stilts, parasols, windbreaks, beach chairs,
     sunbathers, people at the water's edge, lifeguards, groynes, the stairs
     over the dunes ---- */
  // a point on the beach, d metres inland of the water's edge, k metres along it from the coast's start
  coastFrame(){
    if(this._cf) return this._cf;
    const C = this.GEO.coast, cum = [0];
    for(let i = 1; i < C.length; i++) cum.push(cum[i - 1] + Math.hypot(C[i][0] - C[i - 1][0], C[i][1] - C[i - 1][1]));
    const at = s => { let i = 0; while(i < C.length - 2 && cum[i + 1] < s) i++;
      const a = C[i], b = C[i + 1], l = (cum[i + 1] - cum[i]) || 1, f = clamp((s - cum[i]) / l, 0, 1);
      const tx = (b[0] - a[0]) / l, ty = (b[1] - a[1]) / l; let nx = -ty, ny = tx;
      if(nx < 0){ nx = -nx; ny = -ny; }                    // inland is east
      return { x:a[0] + (b[0] - a[0]) * f, y:a[1] + (b[1] - a[1]) * f, tx, ty, nx, ny, ang:Math.atan2(ty, tx) }; };
    // the stretch of beach that faces the circuit
    let s0 = 0, s1 = cum[cum.length - 1], best = Infinity;
    for(let s = 0; s < s1; s += 20){ const p = at(s), d = Math.hypot(p.x - (this.T.bounds.minX + this.T.bounds.w / 2), p.y - (this.T.bounds.minY + this.T.bounds.h / 2)); if(d < best){ best = d; s0 = s; } }
    return (this._cf = { at, mid:s0, L:cum[cum.length - 1] });
  },
  beach(G, g, T){
    const CF = this.coastFrame(), R = this.rng(1953), sea = this.GEO.seaZ;
    const P = (s, d) => { const p = CF.at(s); return { x:p.x + p.nx * d, y:p.y + p.ny * d, p }; };
    const Bt = this.geoBuf(), Bg = this.geoBuf(), Br = this.geoBuf(), Bs = this.geoBuf();
    const stilts = [], paras = [], poles = [], wind = [], chairs = [], lying = [], walk = [], posts = [], towers = [], stairs = [];
    const PC = ["#FF7A00", "#1E5AA8", "#FFFFFF", "#E8242C", "#F2C230", "#2E8C5A", "#FF7A00"];
    const span = 2200;
    // the pavilions: big timber decks on stilts with glass and a long roof, every 300 m or so
    for(let s = CF.mid - span; s <= CF.mid + span; s += 290 + R() * 60){
      if(s < 0 || s > CF.L) continue;
      const c = P(s, 26), ang = c.p.ang, z = sea + 3.2;
      const L = 30 + R() * 10, W = 18, grp = new THREE.Group(); grp.position.set(c.x, z, c.y); grp.rotation.y = -ang;
      const bt = this.geoBuf(), bg = this.geoBuf(), br = this.geoBuf();
      this.box3(bt, -L / 2, 0, -W / 2, L / 2, 0.45, W / 2);                                          // the deck
      this.box3(bt, -L / 2, 0.45, W / 2 - 0.15, L / 2, 1.5, W / 2);                                   // the seaward rail
      this.box3(bg, -L / 2 + 3, 0.45, -W / 2 + 2, L / 2 - 3, 4.2, W / 2 - 7);                         // the glass box
      this.box3(br, -L / 2 - 0.5, 4.2, -W / 2 + 1, L / 2 + 0.5, 4.7, W / 2 - 4);                      // the roof
      this.mesh(G, grp, bt, G.twoSided(G.mat("#9A7650", { roughness:0.85 })), true);
      this.mesh(G, grp, bg, G.twoSided(G.faceMat("glass", "#8AA8B8")), false);
      this.mesh(G, grp, br, G.twoSided(G.mat("#5A4A3A", { roughness:0.8 })), true);
      g.add(grp);
      for(let a = -L / 2 + 2; a <= L / 2 - 2; a += 4) for(const b of [-W / 2 + 1, 0, W / 2 - 1]){
        const x = c.x + Math.cos(ang) * a - Math.sin(ang) * b, y = c.y + Math.sin(ang) * a + Math.cos(ang) * b;
        stilts.push([x, y, sea - 0.5, -ang, 1, 1]);
      }
      // parasols, windbreaks and beach chairs on the sand in front, and the people
      for(let k = 0; k < 40; k++){
        const q = P(s + (R() - 0.5) * 120, 6 + R() * 16), z0 = this.ground(q.x, q.y);
        const r = R();
        if(r < 0.4){ paras.push([q.x, q.y, z0, R() * TAU, 1, 1, PC[Math.floor(R() * PC.length)]]); poles.push([q.x, q.y, z0, 0]); }
        else if(r < 0.65) wind.push([q.x, q.y, z0, -ang + (R() - 0.5) * 0.6, 1, 1]);
        else chairs.push([q.x, q.y, z0, -ang + Math.PI / 2 + (R() - 0.5) * 0.5, 1, 1, R() < 0.5 ? "#2A5AA8" : "#E8E4DA"]);
        if(R() < 0.6) lying.push([q.x + 1.2, q.y, z0 + 0.12, R() * TAU]);
      }
      // a flag on the pavilion
      (this.zflags = this.zflags || []).push([c.x, c.y, z + 4.7]);
    }
    // people walking along the water's edge, lifeguard towers, the groynes
    for(let s = CF.mid - span; s <= CF.mid + span; s += 6){
      if(s < 0 || s > CF.L) continue;
      if(R() < 0.35){ const q = P(s, 1 + R() * 9); walk.push([q.x, q.y, this.ground(q.x, q.y), R() * TAU]); }
    }
    for(let s = CF.mid - span + 150; s <= CF.mid + span; s += 520){
      const q = P(s, 18); if(s < 0 || s > CF.L) continue; towers.push([q.x, q.y, this.ground(q.x, q.y), -q.p.ang]);
    }
    // the groynes: rows of old timber piles running out into the sea. The survey has
    // only two short ones mapped here; these are placed at the usual spacing
    for(let s = CF.mid - span + 60; s <= CF.mid + span; s += 250){
      if(s < 0 || s > CF.L) continue;
      for(let d = 4; d > -70; d -= 1.6){ const q = P(s, d); posts.push([q.x, q.y, sea - 2.5, 0, 1, 1]); }
    }
    // the stairs over the dune, from the boulevard down onto the beach
    for(let s = CF.mid - span + 200; s <= CF.mid + span; s += 420){
      if(s < 0 || s > CF.L) continue;
      for(let d = 30; d < 95; d += 1.2){ const q = P(s, d); stairs.push([q.x, q.y, this.ground(q.x, q.y) + 0.25, -q.p.ang + Math.PI / 2, 1, 1]); }
    }
    const stG = new THREE.BoxGeometry(0.3, 4.2, 0.3); stG.translate(0, 2.1, 0);
    const paG = new THREE.ConeGeometry(1.4, 0.55, 8, 1, true); paG.translate(0, 2.3, 0);
    const poG = new THREE.CylinderGeometry(0.03, 0.03, 2.3, 4); poG.translate(0, 1.15, 0);
    const wiG = new THREE.BoxGeometry(3.2, 1.2, 0.05); wiG.translate(0, 0.6, 0);
    const chG = new THREE.BoxGeometry(0.7, 0.4, 1.6); chG.translate(0, 0.25, 0);
    const lyG = new THREE.BoxGeometry(1.7, 0.22, 0.45); lyG.translate(0, 0.11, 0);
    const piG = new THREE.CylinderGeometry(0.16, 0.16, 3.2, 5); piG.translate(0, 1.6, 0);
    const twG = new THREE.BoxGeometry(2.0, 2.0, 2.0); twG.translate(0, 4.2, 0);
    const twL = new THREE.BoxGeometry(2.2, 3.2, 2.2); twL.translate(0, 1.6, 0);
    const plG = new THREE.BoxGeometry(1.3, 0.12, 2.2);
    LB.many(G, g, stG, G.mat("#6A5440", { roughness:0.9 }), stilts, true);
    LB.many(G, g, paG, new THREE.MeshStandardMaterial({ color:0xFFFFFF, roughness:0.7, side:THREE.DoubleSide }), paras, true);
    LB.many(G, g, poG, G.mat("#E8E8E8"), poles, false);
    LB.many(G, g, wiG, this.stripeMat(), wind, true);
    LB.many(G, g, chG, G.mat("#FFFFFF", { roughness:0.6 }), chairs, false);
    LB.many(G, g, piG, G.mat("#4A3A2C", { roughness:0.95 }), posts, false);
    LB.many(G, g, twG, G.mat("#E8242C"), towers, true); LB.many(G, g, twL, G.mat("#F2F2F2"), towers, true);
    LB.many(G, g, plG, G.mat("#A88A62", { roughness:0.9 }), stairs, true);
    this.people(G, g, walk);
    // sunbathers lying on towels: a body and a towel, flat on the sand
    LB.many(G, g, lyG, G.mat("#FFFFFF", { roughness:0.9 }), lying.map(l => [l[0], l[1], l[2], l[3], 1, 1, ["#E8C2A0", "#D8A888", "#B07A58"][Math.floor(Math.abs(l[0] * 7)) % 3]]), false);
    this.stats.beach = paras.length + wind.length + chairs.length + lying.length + walk.length;
  },
  stripeMat(){
    if(this._stm) return this._stm;
    const cv = document.createElement("canvas"); cv.width = 64; cv.height = 16; const c = cv.getContext("2d");
    const C = ["#E8242C", "#FFFFFF", "#1E5AA8", "#FFFFFF", "#F2C230", "#FFFFFF"];
    for(let k = 0; k < 8; k++){ c.fillStyle = C[k % C.length]; c.fillRect(k * 8, 0, 8, 16); }
    const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding;
    return (this._stm = new THREE.MeshStandardMaterial({ map:t, roughness:0.8, side:THREE.DoubleSide }));
  },
  /* what is out there: kite-surfers, a few small boats, ships on the shipping
     lane and the offshore wind farm (I believe there is one off this coast, at
     about ten kilometres; its position here is not surveyed) */
  offshore(G, g, T){
    const CF = this.coastFrame(), R = this.rng(77), sea = this.GEO.seaZ;
    this.kites = []; this.turbines = [];
    const kiteM = new THREE.MeshStandardMaterial({ color:0xFF5A1E, roughness:0.6, side:THREE.DoubleSide });
    for(let k = 0; k < 7; k++){
      const s = CF.mid + (R() - 0.5) * 1600, p = CF.at(s);
      const grp = new THREE.Group();
      const rider = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.4, 0.4), G.mat("#101418")); rider.position.y = 0.9;
      const board = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.4), G.mat("#F2F2F2")); board.position.y = 0.05;
      const kg = new THREE.SphereGeometry(4, 10, 4, 0, Math.PI, 0, Math.PI / 2); kg.scale(1.4, 0.5, 0.6);
      const kite = new THREE.Mesh(kg, kiteM.clone()); kite.material.color.set(["#FF5A1E", "#1EA0E8", "#F2C230", "#E8242C"][k % 4]);
      kite.position.set(14, 18, 0);
      grp.add(rider, board, kite); grp.traverse(o => { o.userData.dynamic = true; o.castShadow = o !== board; }); g.add(grp);
      this.kites.push({ o:grp, s, d:-(40 + R() * 160), v:(R() < 0.5 ? -1 : 1) * (6 + R() * 5), ph:R() * TAU });
    }
    const hullM = G.mat("#E8E8E6", { roughness:0.5 }), darkM = G.mat("#2A3440", { roughness:0.6 }), redM = G.mat("#A8302A");
    const ships = [];
    for(let k = 0; k < 9; k++){
      const s = CF.mid + (R() - 0.5) * 9000, p = CF.at(clamp(s, 0, CF.L)), d = -(1200 + R() * 4500);
      const big = d < -3000, grp = new THREE.Group();
      grp.position.set(p.x + p.nx * d, sea, p.y + p.ny * d); grp.rotation.y = -p.ang + (R() < 0.5 ? 0 : Math.PI);
      if(big){ const h = new THREE.Mesh(new THREE.BoxGeometry(160, 9, 24), darkM); h.position.y = 4;
        const b = new THREE.Mesh(new THREE.BoxGeometry(18, 14, 22), hullM); b.position.set(-62, 14, 0);
        const c = new THREE.Mesh(new THREE.BoxGeometry(110, 8, 22), redM); c.position.set(10, 12, 0); grp.add(h, b, c); }
      else { const h = new THREE.Mesh(new THREE.BoxGeometry(9, 1.2, 3), hullM); h.position.y = 0.5;
        const sl = new THREE.Mesh(new THREE.ConeGeometry(2, 9, 3), G.mat("#F8F8F6")); sl.position.y = 5.6; grp.add(h, sl); }
      grp.traverse(o => { o.userData.dynamic = true; }); g.add(grp); ships.push(grp);
    }
    // the turbines: tower, nacelle and three slowly turning blades
    const towerG = new THREE.CylinderGeometry(1.6, 2.6, 110, 8); towerG.translate(0, 55, 0);
    const bladeG = new THREE.BoxGeometry(1.6, 58, 0.6); bladeG.translate(0, 29, 0);
    const wM = G.mat("#F2F4F6", { roughness:0.5 });
    const mid = CF.at(CF.mid);
    for(let r = 0; r < 4; r++) for(let c = 0; c < 6; c++){
      const along = (c - 2.5) * 900 - 2500, out = -(9500 + r * 800);
      const x = mid.x + mid.tx * along + mid.nx * out, y = mid.y + mid.ty * along + mid.ny * out;
      const grp = new THREE.Group(); grp.position.set(x, sea, y);
      const tw = new THREE.Mesh(towerG, wM); const nac = new THREE.Mesh(new THREE.BoxGeometry(12, 4, 4), wM); nac.position.set(0, 111, 0);
      const hub = new THREE.Group(); hub.position.set(6.5, 111, 0); hub.rotation.y = Math.PI / 2;
      for(let b = 0; b < 3; b++){ const bl = new THREE.Mesh(bladeG, wM); bl.rotation.z = b * TAU / 3; hub.add(bl); }
      grp.add(tw, nac, hub); grp.rotation.y = -this.WIND + Math.PI; grp.traverse(o => { o.userData.dynamic = true; }); g.add(grp);
      this.turbines.push({ hub, ph:R() * TAU, w:0.9 + R() * 0.3 });
    }
  },

  /* ---- the dunes' planting: marram grass on the open sand, sea-buckthorn in the
     scrub, and pine and birch in the woods and the sheltered hollows ---- */
  vegetation(G, g, T){
    const R = this.rng(4410), D = this.GEO, I = this.inner;
    const marram = [], shrubs = [], pines = [], birches = [], trunks = [];
    const ok = (x, y, m) => { const q = this.near(x, y); return !q || q.d > this.edge(q.i, q.side) + (m || 4); };
    // marram: everywhere the ground is open dune, densest near the circuit and on the sea side
    for(let y = I.Y0; y < I.Y0 + I.H; y += 3.4) for(let x = I.X0; x < I.X0 + I.W; x += 3.4){
      const px = x + (R() - 0.5) * 3, py = y + (R() - 0.5) * 3;
      if(R() < 0.45 || !this.free(px, py) || this.inTown(px, py)) continue;
      const sh = this.shoreAt(px, py); if(sh != null && sh < 40) continue;
      const q = this.near(px, py), d = q ? q.d : 999; if(q && d < this.edge(q.i, q.side) + 3) continue;
      if(d > 500 && R() < 0.75) continue;
      if(!this.isDune(px, py)) continue;
      marram.push([px, py, this.ground(px, py) - 0.05, R() * TAU, 0.7 + R() * 0.6, 0.8 + R() * 0.7, R() < 0.3 ? "#A8A46A" : R() < 0.5 ? "#8E9A5A" : "#B4AE78"]);
      if(marram.length > 42000) break;
    }
    for(const P of (D.land.scrub || [])){
      const bb = this.bbox(P);
      for(let y = bb.y0; y < bb.y1; y += 6) for(let x = bb.x0; x < bb.x1; x += 6){
        const px = x + (R() - 0.5) * 5, py = y + (R() - 0.5) * 5;
        if(R() < 0.35 || !this.pip(px, py, P) || !ok(px, py)) continue;
        shrubs.push([px, py, this.ground(px, py) - 0.2, R() * TAU, 1.2 + R() * 1.4, 0.8 + R() * 0.6, R() < 0.5 ? "#6E7A4A" : "#7E8458"]);
        if(shrubs.length > 14000) break;
      }
    }
    for(const P of (D.land.wood || [])){
      const bb = this.bbox(P);
      for(let y = bb.y0; y < bb.y1; y += 8) for(let x = bb.x0; x < bb.x1; x += 8){
        const px = x + (R() - 0.5) * 7, py = y + (R() - 0.5) * 7;
        if(!this.pip(px, py, P) || !ok(px, py, 6)) continue;
        const q = this.near(px, py); if(q && q.d > 900 && R() < 0.6) continue;
        const z = this.ground(px, py), h = 7 + R() * 7;
        if(R() < 0.78){ pines.push([px, py, z, R() * TAU, h / 9, h / 9, R() < 0.5 ? "#2E4A2C" : "#3A5432"]); }
        else { birches.push([px, py, z, R() * TAU, h / 10, h / 10, R() < 0.2 ? "#A8A43A" : "#7A9A4A"]); trunks.push([px, py, z, 0, h / 10, h / 10]); }
        if(pines.length + birches.length > 14000) break;
      }
    }
    for(const [x, y] of D.trees) if(ok(x, y)) pines.push([x, y, this.ground(x, y), R() * TAU, 1.2, 1.2, "#34502E"]);
    // the geometries: a tuft of blades, a low mound of shrub, a pine and a birch
    const tuft = new THREE.ConeGeometry(0.32, 0.9, 5, 1, true); tuft.translate(0, 0.45, 0);
    const shrub = new THREE.IcosahedronGeometry(1, 0); shrub.scale(1, 0.55, 1); shrub.translate(0, 0.4, 0);
    const pine = (() => { const a = new THREE.ConeGeometry(2.3, 4.2, 7); a.translate(0, 4.2, 0); const b = new THREE.ConeGeometry(1.7, 3.4, 7); b.translate(0, 6.6, 0);
      const t = new THREE.CylinderGeometry(0.18, 0.24, 3, 5); t.translate(0, 1.5, 0); return LB.merge([t, a, b]); })();
    const birch = new THREE.IcosahedronGeometry(1.8, 0); birch.scale(0.8, 1.3, 0.8); birch.translate(0, 6.8, 0);
    const btrunk = new THREE.CylinderGeometry(0.12, 0.16, 6, 5); btrunk.translate(0, 3, 0);
    const sway = this.swayMat("#FFFFFF", 0.95);
    LB.many(G, g, tuft, sway, marram, false);
    LB.many(G, g, shrub, this.swayMat("#FFFFFF", 0.9), shrubs, true);
    LB.many(G, g, pine, this.swayMat("#FFFFFF", 0.9), pines, true);
    LB.many(G, g, birch, this.swayMat("#FFFFFF", 0.9), birches, true);
    LB.many(G, g, btrunk, G.mat("#E8E4DA", { roughness:0.8 }), trunks, true);
    // the wooden fences that keep people off the dunes
    const fp = [], fr = [];
    for(const r of (D.lines.fence || [])) for(let k = 0; k < r.length - 1; k++){
      const [ax, ay] = r[k], [bx, by] = r[k + 1], L = Math.hypot(bx - ax, by - ay), ang = Math.atan2(by - ay, bx - ax);
      for(let s = 0; s < L; s += 2.5){ const x = ax + (bx - ax) * s / L, y = ay + (by - ay) * s / L; if(!ok(x, y, 2)) continue;
        const z = this.ground(x, y); fp.push([x, y, z, 0]); fr.push([x, y, z + 0.8, -ang, 1, 1]); }
    }
    const fpG = new THREE.CylinderGeometry(0.06, 0.06, 1.1, 4); fpG.translate(0, 0.55, 0);
    const frG = new THREE.BoxGeometry(2.5, 0.08, 0.05);
    LB.many(G, g, fpG, G.mat("#7A6248", { roughness:0.95 }), fp, false); LB.many(G, g, frG, G.mat("#8A7254", { roughness:0.95 }), fr, false);
    this.stats.marram = marram.length; this.stats.shrubs = shrubs.length; this.stats.trees = pines.length + birches.length;
  },
  // open dune: not a wood, a car park, water or the town, by what was painted there
  isDune(x, y){
    const A = this.inn, c = Math.floor((x - A.X0) / A.px), r = Math.floor((y - A.Y0) / A.px);
    if(c < 0 || r < 0 || c >= A.cw || r >= A.ch) return false;
    if(!this._duneMask){
      const cv = document.createElement("canvas"); cv.width = A.cw; cv.height = A.ch; const g = cv.getContext("2d", { willReadFrequently:true });
      g.fillStyle = "#FFF"; g.fillRect(0, 0, A.cw, A.ch); g.fillStyle = "#000";
      for(const k of ["wood", "parking", "town", "water", "camp", "pitch", "golf", "works", "grass", "beach"]) for(const P of (this.GEO.land[k] || [])){
        g.beginPath(); P.forEach((p, i) => { const a = (p[0] - A.X0) / A.px, b = (p[1] - A.Y0) / A.px; i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.closePath(); g.fill(); }
      const d = g.getImageData(0, 0, A.cw, A.ch).data; this._duneMask = new Uint8Array(A.cw * A.ch);
      for(let k = 0; k < this._duneMask.length; k++) this._duneMask[k] = d[k * 4] > 127 ? 1 : 0;
    }
    return this._duneMask[r * A.cw + c] === 1;
  },

  /* ---- the landmarks ---- */
  /* the pit building, rebuilt in 2001: a long low block with the garages on the
     pit lane and a glazed floor of hospitality lounges along the top (sixteen,
     the circuit says), and a gantry on the pit wall in front. The footprint is the
     mapped one; the heights and the lounge glazing are my reading of it. */
  pitBuilding(G, g, T){
    const b = this.GEO.blds.find(x => x.lm === "pitbuilding"); if(!b) return;
    const O = this.obb(b.pts), { f, q } = this.facingTrack(O); if(!q) return;
    let z0 = Infinity; for(const [x, y] of b.pts) z0 = Math.min(z0, this.ground(x, y)); z0 = Math.min(z0, T.z[q.i]) - 0.2;
    const hl = O.l / 2, hw = O.w / 2, bs = -f, fz = -bs * hw, bz = bs * hw, s1 = bs > 0 ? 1 : -1;
    const grp = this.local(G, O, z0);
    const doors = (n, lounges) => {
      const cv = document.createElement("canvas"); cv.width = 2048; cv.height = 128; const c = cv.getContext("2d");
      c.fillStyle = lounges ? "#2A3A48" : "#2A2E34"; c.fillRect(0, 0, 2048, 128);
      const dw = 2048 / n;
      for(let k = 0; k < n; k++){
        const x = k * dw;
        if(lounges){ c.fillStyle = "#7AA2BE"; c.fillRect(x + 4, 10, dw - 8, 108); c.fillStyle = "rgba(255,255,255,.25)"; c.fillRect(x + 4, 10, dw * 0.3, 108); c.fillStyle = "#E8ECEF"; c.fillRect(x, 0, 4, 128); }
        else { const team = TEAMS[k % TEAMS.length]; c.fillStyle = team.body; c.fillRect(x + dw * 0.05, 0, dw * 0.9, 16);
          c.fillStyle = "#3A4048"; c.fillRect(x + dw * 0.06, 20, dw * 0.88, 108);
          c.fillStyle = "#4A515A"; for(let s = 28; s < 128; s += 9) c.fillRect(x + dw * 0.06, s, dw * 0.88, 2);
          c.fillStyle = "#FFFFFF"; c.font = "800 13px 'Saira Condensed',sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText((team.short || team.name).toUpperCase().slice(0, 14), x + dw / 2, 8); }
      }
      const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8; return t;
    };
    const Bd = this.geoBuf(), Bl = this.geoBuf(), Bw = this.geoBuf(), Br = this.geoBuf();
    const g1 = 6.0, g2 = 10.4;
    this.quad(Bd, [-hl * s1, 0, fz], [hl * s1, 0, fz], [hl * s1, g1, fz], [-hl * s1, g1, fz], [0, 0, 1, 1]);
    this.quad(Bl, [-hl * s1, g1, fz], [hl * s1, g1, fz], [hl * s1, g2, fz], [-hl * s1, g2, fz], [0, 0, 1, 1]);
    this.quad(Bw, [-hl, 0, bz], [hl, 0, bz], [hl, g2, bz], [-hl, g2, bz]);
    for(const sx of [-hl, hl]) this.quad(Bw, [sx, 0, fz], [sx, 0, bz], [sx, g2, bz], [sx, g2, fz]);
    this.box3(Br, -hl - 1, g2, Math.min(fz - bs * 3, bz), hl + 1, g2 + 0.7, Math.max(fz - bs * 3, bz));    // the roof, out over the lane
    const ms = [this.mesh(G, grp, Bd, new THREE.MeshStandardMaterial({ map:doors(TEAMS.length, false), roughness:0.6, metalness:0.2 }), true),
                this.mesh(G, grp, Bl, new THREE.MeshStandardMaterial({ map:doors(16, true), roughness:0.15, metalness:0.5 }), false),
                this.mesh(G, grp, Bw, G.twoSided(G.faceMat("concrete", "#E2E4E6")), true),
                this.mesh(G, grp, Br, G.twoSided(G.mat("#F2F2F0", { roughness:0.5 })), true)].filter(Boolean);
    g.add(grp); grp.updateMatrixWorld(true);
    this.occ(G, ms, O.cx, O.cy, z0 + 6, hl * 0.7, 9);
    // the gantry on the pit wall: a slim canopy on posts all the way along the boxes
    const sd = T.pitSide, gb = this.geoBuf(), gp = [];
    for(let k = -30; k <= 30; k++){
      const i = ((T.pitBox + k) % T.n + T.n) % T.n; if(T.pitRamp(i) < 0.95) continue;
      const o = sd * (T.half + 0.55), x = T.x[i] + T.nx[i] * o, y = T.y[i] + T.ny[i] * o;
      if(k % 3 === 0) gp.push([x, y, T.z[i] + 1.0, -T.ang[i]]);
    }
    const pg = new THREE.BoxGeometry(0.2, 2.6, 0.2); pg.translate(0, 1.3, 0);
    LB.many(G, g, pg, G.mat("#2A2E34"), gp, true);
    G.add(g, G.strip(T, sd > 0 ? sd * (T.half + 0.1) : sd * (T.half + 1.6), sd > 0 ? sd * (T.half + 1.6) : sd * (T.half + 0.1), 3.6, 8,
      i => { const d = ((i - T.pitBox) % T.n + T.n) % T.n; return T.pitRamp(i) > 0.95 && (d <= 30 || d >= T.n - 30); }), G.mat("#2A2E34"), true);
    this.pitO = O;
    // race control: a glass tower at the Tarzan end of the building
    const tx = O.cx + O.ux * (hl + 10) * (q.i > T.pitBox ? 1 : -1), ty = O.cy + O.uy * (hl + 10) * (q.i > T.pitBox ? 1 : -1);
    const tc = new THREE.Group(); tc.position.set(tx, this.ground(tx, ty), ty); tc.rotation.y = -O.ang;
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(6, 14, 6), G.faceMat("concrete", "#D8DCDE")); shaft.position.y = 7;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(11, 4.5, 9), G.faceMat("glass", "#7A9AB0")); cab.position.y = 16.2;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(12, 0.6, 10), G.mat("#F2F2F0")); cap.position.y = 18.7;
    tc.add(shaft, cab, cap); tc.traverse(o => { o.castShadow = true; o.userData.dynamic = true; }); g.add(tc); tc.updateMatrixWorld(true);
    this.occ(G, [shaft, cab, cap], tx, ty, this.ground(tx, ty) + 10, 8, 12);
  },
  // the grandstands the survey does not have: at the corners where the big crowds sit
  extraStands(T){
    const add = (u, sd, len, dep, name) => {
      const i = Math.round(u * T.n) % T.n, o = sd * (this.edge(i, sd) + 4 + dep / 2);
      const cx = T.x[i] + T.nx[i] * o, cy = T.y[i] + T.ny[i] * o, a = T.ang[i], ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux;
      const P = [[-len / 2, -dep / 2], [len / 2, -dep / 2], [len / 2, dep / 2], [-len / 2, dep / 2]].map(([p, q2]) => [cx + ux * p + vx * q2, cy + uy * p + vy * q2]);
      for(const [x, y] of P){ const q = this.near(x, y); if(q && q.d < this.edge(q.i, q.side) + 2) return; }
      this.GEO.blds.push({ pts:P, h:0, kind:2, lm:"", stand:name, extra:true });
    };
    // Tarzan's outside, the Hugenholtz bowl, Scheivlak, the Hans Ernst chicane, Arie Luyendyk.
    // Their real positions are my best reading of the circuit, not survey.
    add(0.060, -1, 120, 16, "Tarzan"); add(0.180, 1, 90, 14, "Hugenholtz");
    add(0.452, -1, 100, 14, "Scheivlak"); add(0.716, -1, 90, 14, "Hans Ernst"); add(0.870, -1, 110, 16, "Arie Luyendyk");
  },
  // the sponsor arch over the track on the run up to Hunserug
  arch(G, g, T){
    const i = Math.round(0.225 * T.n) % T.n, w = T.half + T.roR[i] + 4, wl = T.half + T.roL[i] + 4;
    for(const o of [-wl, w]){ const x = T.x[i] + T.nx[i] * o, y = T.y[i] + T.ny[i] * o; LB.box(G, g, x, y, T.zAt(i, o), 1.2, 1.2, 9, T.ang[i], G.mat("#FF7A00")); }
    const mid = (w - wl) / 2, cx = T.x[i] + T.nx[i] * mid, cy = T.y[i] + T.ny[i] * mid;
    LB.box(G, g, cx, cy, T.z[i] + 8, w + wl + 1.2, 1.4, 2.2, T.ang[i] + Math.PI / 2, G.mat("#FF7A00"));
    LB.text(G, g, "HUP HOLLAND HUP", cx - T.tx[i] * 0.75, cy - T.ty[i] * 0.75, T.z[i] + 9.1, (w + wl) * 0.8, 1.9, T.ang[i] + Math.PI / 2, "#FFFFFF", "#FF7A00", true);
  },

  /* ---- the barriers: a SAFER wall right at the edge of the banked corners,
     concrete behind blue-and-white energy-absorbing foam, with tall debris
     fencing on top. It follows the banking, as everything else does ---- */
  bowl(G, g, T){
    if(!T.bankW) return;
    const lift = (G.roadLift || 0.1) + 0.004, m = new THREE.MeshStandardMaterial({ color:G.col("#25272C"), roughness:0.62, metalness:0.05, transparent:true, opacity:0.55, depthWrite:false });
    for(const sd of [-1, 1]){
      const on = i => T.bankW[i] > 0.15 && T.bankOut[i] === sd;
      const geo = sd > 0 ? G.strip(T, -T.half * 0.1, T.half - 0.3, lift, 7, on) : G.strip(T, -(T.half - 0.3), T.half * 0.1, lift, 7, on);
      if(geo){ const me = new THREE.Mesh(geo, m); me.receiveShadow = true; me.renderOrder = 1; me.userData.dynamic = true; g.add(me); }
    }
  },
  saferWalls(G, g, T){
    const w = T.half;
    const sTex = (() => { const cv = document.createElement("canvas"); cv.width = 128; cv.height = 32; const c = cv.getContext("2d");
      c.fillStyle = "#1E5AA8"; c.fillRect(0, 0, 128, 32); c.fillStyle = "#F2F2F2"; c.fillRect(0, 12, 128, 8);
      c.fillStyle = "#0E3A78"; for(let x = 0; x < 128; x += 32) c.fillRect(x, 0, 2, 32);
      const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; t.wrapS = THREE.RepeatWrapping; return t; })();
    for(const sd of [-1, 1]){
      const on = i => T.safer(i, sd), f = i => sd * (w + (sd < 0 ? T.roL[i] : T.roR[i]) + 2.6);
      G.add(g, G.wall(T, i => f(i) + sd * 0.3, 1.25, on, 0.3), G.twoSided(G.faceMat("concrete", "#C8CCD0")), true);
      G.add(g, G.wall(T, f, 1.05, on, 0.2), new THREE.MeshStandardMaterial({ map:sTex, roughness:0.6, side:THREE.DoubleSide }), true);
    }
  },

  /* ---- orange: the crowd's shirts, flags and the smoke flares ---- */
  crowdTex(){
    if(this._crowd) return this._crowd;
    const W = 512, H = 256, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const g = cv.getContext("2d"), R = this.rng(31);
    g.fillStyle = "#3A3E46"; g.fillRect(0, 0, W, H);
    const shirts = this.SHIRTS, skin = ["#E8C2A0", "#D8A888", "#F0D0B4", "#B07A58"];
    for(let r = 0; r < 16; r++){
      g.fillStyle = "#4A4E56"; g.fillRect(0, r * 16 + 13, W, 3);
      for(let c = 0; c < 64; c++){ if(R() < 0.04) continue; const x = c * 8 + R() * 1.5, y = r * 16;
        g.fillStyle = shirts[Math.floor(R() * shirts.length)]; g.fillRect(x + 1, y + 6, 6, 7);
        g.fillStyle = R() < 0.25 ? "#FF7A00" : skin[Math.floor(R() * skin.length)]; g.fillRect(x + 2, y + 2, 4, 4); }
    }
    for(let i = 0; i < 30; i++){ const x = R() * W, y = R() * H; this.dutchFlag(g, x, y, 14, 9); }
    const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    return (this._crowd = t);
  },
  dutchFlag(g, x, y, w, h, orange){
    if(orange){ g.fillStyle = "#FF7A00"; g.fillRect(x, y, w, h); return; }
    g.fillStyle = "#AE1C28"; g.fillRect(x, y, w, h / 3); g.fillStyle = "#FFFFFF"; g.fillRect(x, y + h / 3, w, h / 3); g.fillStyle = "#21468B"; g.fillRect(x, y + 2 * h / 3, w, h / 3 + 0.5);
  },
  flagMatFor(orange){
    const key = orange ? "_fmo" : "_fmd"; if(this[key]) return this[key];
    const cv = document.createElement("canvas"); cv.width = 96; cv.height = 64; this.dutchFlag(cv.getContext("2d"), 0, 0, 96, 64, orange);
    const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding;
    const m = SILVER.flagMat.call(Object.create(this, { _fm:{ value:null, writable:true } }));
    const m2 = m.clone(); m2.map = t; m2.onBeforeCompile = m.onBeforeCompile; m2.customProgramCacheKey = m.customProgramCacheKey;
    return (this[key] = m2);
  },
  flags(G, g, list){
    if(!list.length) return;
    const fg = new THREE.PlaneGeometry(1.8, 1.2, 8, 1); fg.translate(0.9, 3.0, 0);
    const pg = new THREE.CylinderGeometry(0.03, 0.03, 3.6, 4); pg.translate(0, 1.8, 0);
    const rot = -this.WIND, A = [], B = [];
    list.forEach((p, k) => (k % 3 === 0 ? B : A).push([p[0], p[1], p[2], rot, 1]));
    LB.many(G, g, fg, this.flagMatFor(false), A, false); LB.many(G, g, fg, this.flagMatFor(true), B, false);
    LB.many(G, g, pg, G.mat("#C8CCD0", { metalness:0.6, roughness:0.4 }), list.map(p => [p[0], p[1], p[2], 0, 1]), false);
  },
  // bicycles: racked at the entrances and the car parks, and leaning everywhere else (the Netherlands)
  bikes(G, g, T){
    const R = this.rng(1817), list = [];
    for(const P of (this.GEO.land.parking || [])){
      const O = this.obb(P); if(Math.hypot(O.cx, O.cy) > 1600 * T.worldScale) continue;
      // a rack of them along one long side of each car park
      for(let u = -O.l / 2 + 2; u < O.l / 2 - 2; u += 0.75){ if(R() < 0.25) continue;
        const v = -O.w / 2 - 1.5, x = O.cx + O.ux * u - O.uy * v, y = O.cy + O.uy * u + O.ux * v;
        if(!this.free(x, y)) continue; list.push([x, y, this.ground(x, y), -(O.ang + Math.PI / 2), 1, 1, ["#1A1C20", "#2A4A8A", "#8A1A1A", "#E8E4DA", "#2E6A3A"][Math.floor(R() * 5)]]); }
      if(list.length > 6000) break;
    }
    const frame = new THREE.BoxGeometry(0.06, 0.55, 1.1); frame.translate(0, 0.62, 0);
    const wheel = new THREE.TorusGeometry(0.34, 0.03, 4, 10); wheel.rotateY(Math.PI / 2);
    const w1 = wheel.clone(); w1.translate(0, 0.36, 0.52); const w2 = wheel.clone(); w2.translate(0, 0.36, -0.52);
    const bars = new THREE.BoxGeometry(0.5, 0.04, 0.04); bars.translate(0, 0.95, 0.42);
    LB.many(G, g, LB.merge([frame, w1, w2, bars]), G.mat("#FFFFFF", { roughness:0.5, metalness:0.4 }), list, false);
    this.stats.bikes = list.length;
  },
  // orange smoke flares let off in the stands and on the dune banks
  flares(G, g, T){
    const R = this.rng(2021), pts = [];
    for(const S2 of this.standList || []) for(let k = 0; k < 3; k++){ const O = S2.O, u = (R() - 0.5) * O.l * 0.8, v = (R() - 0.5) * O.w * 0.6;
      pts.push([O.cx + O.ux * u - O.uy * v, O.cy + O.uy * u + O.ux * v, S2.z0 + S2.H * 0.6]); }
    for(const B of this.BANKS) for(let k = 0; k < 4; k++){ const i = Math.round((B.a + (B.b - B.a) * R()) * T.n) % T.n, o = B.sd * (this.edge(i, B.sd) + 20 + R() * 20);
      const x = T.x[i] + T.nx[i] * o, y = T.y[i] + T.ny[i] * o; pts.push([x, y, this.ground(x, y) + 1.5]); }
    this.flarePts = pts;
    const N = pts.length * 14, geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
    const m = new THREE.PointsMaterial({ color:0xFF6A10, size:2.8, transparent:true, opacity:0.55, depthWrite:false });
    this.flareP = new THREE.Points(geo, m); this.flareP.frustumCulled = false; this.flareP.userData.dynamic = true; g.add(this.flareP);
  },

  /* ---- the light: a bright, hazy coastal afternoon, the sun low and warm ---- */
  light(G, T){
    if(G.sun){ G.sun.color.set("#FFF0DA"); G.sun.intensity = 1.08; this.sunBase = 1.08; }
    this.hemi = null;
    G.scene.traverse(o => { if(o.isHemisphereLight && o !== G.envFill){ o.color.set("#D2E2F0"); o.groundColor.set("#C8B88A"); o.intensity = 0.55; this.hemi = o; } });
    this.hemiBase = 0.55;
  },
  // the spectator banks on the dunes above the outside of the big corners
  BANKS:[ { a:0.040, b:0.095, sd:-1, h:4.5, n:"Tarzan" }, { a:0.152, b:0.205, sd:1, h:6.5, n:"Hugenholtz" },
          { a:0.430, b:0.480, sd:-1, h:4.0, n:"Scheivlak" }, { a:0.690, b:0.750, sd:-1, h:3.0, n:"Hans Ernst" },
          { a:0.830, b:0.900, sd:-1, h:5.5, n:"Arie Luyendyk" } ],

  build(G, world, T, S){
    this.T = T; this.stats = { people:0 }; this._cf = null; this._duneMask = null; this.zflags = []; this.townMask = null; this.groundMats = [];
    this.GEO.init(T.worldScale);
    this.GEO.blds = this.GEO.blds.filter(b => !b.extra);
    const g = new THREE.Group(); world.add(g); this.root = g;
    this.U = { cloud:{ value:this.cloudField().t }, off:{ value:new THREE.Vector2(0, 0) }, amt:{ value:0.22 },
               detail:{ value:this.detailTex() }, time:{ value:0 }, dark:{ value:0 } };
    const tm = {};
    const step = (k, fn) => { const a = performance.now(); try{ fn(); }catch(e){ console.warn("zandvoort " + k, e.message, e.stack); } tm[k] = Math.round(performance.now() - a); };
    step("index", () => this.distRaster(T));
    step("stands0", () => this.extraStands(T));
    step("shore", () => this.shoreField(T));
    step("paint", () => this.paint(T));
    step("terrain", () => this.terrain(G, g, T));
    step("sky", () => this.sky(G, g, T));
    step("cloud", () => this.cloudOver(G, g, T));
    step("sea", () => this.sea(G, g, T));
    step("plants", () => this.vegetation(G, g, T));
    step("buildings", () => this.buildings(G, g, T));
    step("stands", () => this.stands(G, g, T));
    step("pits", () => this.pitBuilding(G, g, T));
    step("gantry", () => { this.gantry(G, g, T); this.arch(G, g, T); });
    step("crowds", () => this.crowds(G, g, T));
    step("sprawl", () => this.sprawl(G, g, T));
    step("furniture", () => { this.furniture(G, g, T); this.saferWalls(G, g, T); this.bowl(G, g, T); });
    step("adverts", () => this.adverts(G, g, T));
    step("beach", () => { this.beach(G, g, T); this.flags(G, g, this.zflags); });
    step("offshore", () => this.offshore(G, g, T));
    step("bikes", () => this.bikes(G, g, T));
    step("flares", () => this.flares(G, g, T));
    step("extras", () => this.extras(G, g, T));
    step("tiles", () => { this.stats.split = G.tileSplit(g, 250, 3000); });
    this.light(G, T);
    this.timing = tm; this._t = null; this.wetS = 0;
  },
  frame(S, G){
    SILVER.frame.call(this, S, G);
    const t = S.clock || 0, dt = this._dt2 == null ? 0 : clamp(t - this._dt2, 0, 0.1); this._dt2 = t;
    const CF = this.coastFrame();
    for(const K of this.kites || []){
      K.s += K.v * dt; if(Math.abs(K.s - CF.mid) > 900) K.v = -K.v;
      const p = CF.at(clamp(K.s, 0, CF.L)), d = K.d + Math.sin(t * 0.2 + K.ph) * 20;
      K.o.position.set(p.x + p.nx * d, this.GEO.seaZ + 0.1 + Math.sin(t * 2 + K.ph) * 0.15, p.y + p.ny * d);
      K.o.rotation.y = -this.WIND + Math.sin(t * 0.5 + K.ph) * 0.4;
    }
    for(const W of this.turbines || []) W.hub.rotation.x = t * W.w + W.ph;
    if(this.flareP){
      const pa = this.flareP.geometry.attributes.position, P = this.flarePts;
      for(let k = 0; k < P.length; k++){
        const on = Math.sin(t * 0.13 + k * 1.7) > 0.2;            // flares come and go
        for(let j = 0; j < 14; j++){
          const ph = ((t * 0.35 + j / 14 + k * 0.31) % 1), idx = (k * 14 + j) * 3;
          if(!on){ pa.array[idx + 1] = -999; continue; }
          pa.array[idx] = P[k][0] + Math.cos(this.WIND) * ph * 22 + Math.sin(t * 3 + j) * 0.5;
          pa.array[idx + 1] = P[k][2] + ph * 9;
          pa.array[idx + 2] = P[k][1] + Math.sin(this.WIND) * ph * 22;
        }
      }
      pa.needsUpdate = true;
    }
    // rain greys the sea; the sky and the sun are SILVER's
    if(this.seaU){ this.seaU.uSky.value.setRGB(0.27, 0.43, 0.63).lerp(new THREE.Color(0.30, 0.33, 0.37), this.wetS); }
  },
}));



export { ZAND };
