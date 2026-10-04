import * as THREE from 'three';
import { TAU } from '../../config/util.js';
import { flat, lin, merge, paint } from './suzuka.js';

/* ---------- Spa: the building kit -----------------------------------------
   Ardennes houses and barns with steep slate roofs, chimneys and windows, the
   church and the abbey, the old hotels, the pit building and the paddock, the
   covered stands and the hospitality chalets, marshal posts and camera towers.
   Everything is made of painted pieces (vertex colour, no textures), put
   together in the building's own frame and then dropped into a spatial bucket,
   so a whole village bakes down to a few draw calls.

   A building's frame: x along its length, y up, z across. Things beside the
   track face +z (the track is on their +z side). */

const P = {
  slate:"#3C4148", slateHi:"#4A5058", stone:"#8E8A80", stoneDk:"#6E6A62", render:"#E6E1D4", renderWarm:"#DCCFB4",
  brick:"#9A5236", timber:"#6A4A32", timberDk:"#4A3424", glass:"#2C3A46", glassLit:"#6E8CA0", frame:"#EDEAE2",
  door:"#5A2E22", concrete:"#B4B2AC", concreteDk:"#8C8A86", steel:"#9AA0A6", red:"#C8302A", white:"#F0EEE8",
};

/* ---- the pieces ---- */
function bx(l, h, w, col, x, y, z, ry){
  const g = new THREE.BoxGeometry(l, h, w); if(ry) g.rotateY(ry); g.translate(x || 0, (y || 0) + h / 2, z || 0);
  return paint(g, typeof col === "function" ? col : flat(col), () => 0);
}
/* A gable roof: ridge along x at rh over the wall tops, eaves overhanging by ov. The
   slopes pass through the wall tops, so the eaves sit a little lower than the walls
   and there is no gap under them; the gable ends fill the triangle up to the ridge. */
function gable(l, w, rh, ov, col, colEnd, x, y, z){
  const L = l / 2 + ov, W = w / 2 + ov, ye = -rh * ov / (w / 2), pos = [];
  const v = (a, b, c) => pos.push(a, b, c);
  v(-L, ye, W); v(L, ye, W); v(L, rh, 0);  v(-L, ye, W); v(L, rh, 0); v(-L, rh, 0);
  v(L, ye, -W); v(-L, ye, -W); v(-L, rh, 0);  v(L, ye, -W); v(-L, rh, 0); v(L, rh, 0);
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.translate(x || 0, y || 0, z || 0);
  const roof = paint(g, (px, py, pz, f) => lin(f >= 2 ? P.slateHi : col), () => 0);
  // the gable end walls, in the wall colour
  const e = []; const ve = (a, b, c) => e.push(a, b, c);
  for(const s of [-1, 1]){ const X = s * l / 2; if(s > 0){ ve(X, 0, w / 2); ve(X, 0, -w / 2); ve(X, rh, 0); } else { ve(X, 0, -w / 2); ve(X, 0, w / 2); ve(X, rh, 0); } }
  const ge = new THREE.BufferGeometry(); ge.setAttribute("position", new THREE.Float32BufferAttribute(e, 3)); ge.translate(x || 0, y || 0, z || 0);
  return [roof, paint(ge, flat(colEnd), () => 0)];
}
// a hip-ish pyramid cap (turrets, towers)
function spire(r, h, seg, col, x, y, z){ const g = new THREE.ConeGeometry(r, h, seg || 8); g.translate(x || 0, (y || 0) + h / 2, z || 0); return paint(g, flat(col), () => 0); }
// a row of windows on one wall face: a light frame and a dark pane just proud of the wall
function windows(out, len, z, facing, y0, floors, fh, every, ww, wh, x0){
  const n = Math.max(1, Math.floor(len / every));
  for(let f = 0; f < floors; f++) for(let k = 0; k < n; k++){
    const x = (x0 || 0) - len / 2 + (k + 0.5) * len / n, y = y0 + f * fh + fh * 0.3;
    out.push(bx(ww + 0.25, wh + 0.25, 0.08, P.frame, x, y - 0.12, z + facing * 0.04));
    out.push(bx(ww, wh, 0.1, P.glass, x, y, z + facing * 0.07));
  }
}

/* ---- buildings ---- */
const WALL = [P.stone, P.render, P.brick, P.renderWarm];
const KIT = {
  P,
  // an Ardennes house: stone or render, a steep slate roof, a chimney, windows front and back
  house(h){
    const parts = [], fl = h.floors || 1, fh = 3.0, H = fl * fh + 0.4, wall = WALL[(h.style || 0) % WALL.length];
    parts.push(bx(h.l, H, h.w, wall));
    parts.push(bx(h.l + 0.3, 0.5, h.w + 0.3, P.stoneDk));                         // a plinth
    parts.push(...gable(h.l, h.w, h.w * 0.62, 0.45, P.slate, wall, 0, H, 0));
    parts.push(bx(0.9, 2.6, 0.9, P.stoneDk, h.l * 0.28, H + h.w * 0.3, -h.w * 0.12));  // chimney
    parts.push(bx(1.05, 0.2, 1.05, P.slate, h.l * 0.28, H + h.w * 0.3 + 2.6, -h.w * 0.12));
    windows(parts, h.l - 2, h.w / 2, 1, 0.4, fl, fh, 3.2, 1.0, 1.3);
    windows(parts, h.l - 2, -h.w / 2, -1, 0.4, fl, fh, 3.6, 1.0, 1.3);
    parts.push(bx(1.1, 2.1, 0.12, P.door, -h.l * 0.18, 0.4, h.w / 2 + 0.06));
    // a dormer on the bigger houses
    if(h.l > 12){ parts.push(bx(1.8, 1.4, 1.6, wall, h.l * 0.1, H + 0.6, h.w * 0.2)); parts.push(...gable(1.8, 1.6, 0.9, 0.15, P.slate, wall, h.l * 0.1, H + 2.0, h.w * 0.2)); }
    return { parts, chimney:[h.l * 0.28, H + h.w * 0.3 + 2.8, -h.w * 0.12] };
  },
  // a farmhouse with a stone ground floor and a long barn roof
  farm(h){
    const parts = [], H = 6.2;
    parts.push(bx(h.l, H, h.w, P.stone));
    parts.push(...gable(h.l, h.w, h.w * 0.7, 0.5, P.slate, P.stone, 0, H, 0));
    parts.push(bx(1, 2.8, 1, P.stoneDk, -h.l * 0.3, H + h.w * 0.35, 0));
    windows(parts, h.l * 0.55, h.w / 2, 1, 0.4, 2, 3, 3.0, 0.9, 1.2, -h.l * 0.2);
    // the barn half: a big timber door
    parts.push(bx(4.2, 4.2, 0.15, P.timber, h.l * 0.28, 0, h.w / 2 + 0.08));
    return { parts, chimney:[-h.l * 0.3, H + h.w * 0.35 + 3, 0] };
  },
  barn(h){
    const parts = [], H = 5.2;
    parts.push(bx(h.l, 1.6, h.w, P.stoneDk));
    parts.push(bx(h.l, H - 1.6, h.w, k => lin(P.timber), 0, 1.6, 0));
    // vertical boards: darker strips
    for(let x = -h.l / 2 + 1; x < h.l / 2; x += 1.6) parts.push(bx(0.12, H - 1.7, 0.06, P.timberDk, x, 1.6, h.w / 2 + 0.03));
    parts.push(...gable(h.l, h.w, h.w * 0.68, 0.5, P.slate, P.timber, 0, H, 0));
    parts.push(bx(5, 4.6, 0.15, P.timberDk, 0, 0, h.w / 2 + 0.08));
    return { parts };
  },
  // the village church: nave, a square tower and its slate spire, a little chancel
  church(){
    const parts = [];
    parts.push(bx(24, 9, 11, P.stone, 2, 0, 0));
    parts.push(...gable(24, 11, 6.5, 0.4, P.slate, P.stone, 2, 9, 0));
    parts.push(bx(7, 7, 8, P.stone, 15, 0, 0)); parts.push(...gable(7, 8, 4, 0.3, P.slate, P.stone, 15, 7, 0));
    parts.push(bx(6, 19, 6, P.stone, -12.5, 0, 0));
    parts.push(bx(6.6, 0.6, 6.6, P.stoneDk, -12.5, 19, 0));
    parts.push(spire(4.6, 16, 8, P.slate, -12.5, 19.6, 0));
    for(const s of [-1, 1]) for(let k = 0; k < 5; k++) parts.push(bx(1.1, 3.6, 0.1, P.glass, -6 + k * 4, 3, s * 5.56));
    parts.push(bx(1.6, 3.2, 0.1, P.door, -12.5, 0, 3.06));
    return { parts };
  },
  // the abbey on the horizon: big, red sandstone, a tall tower and a spire
  abbey(){
    const parts = [], RED = "#8E5A48";
    parts.push(bx(64, 18, 20, RED)); parts.push(...gable(64, 20, 10, 0.6, P.slate, RED, 0, 18, 0));
    parts.push(bx(30, 14, 14, RED, 0, 0, 22)); parts.push(...gable(30, 14, 7, 0.5, P.slate, RED, 0, 14, 22));
    parts.push(bx(12, 40, 12, RED, -38, 0, 0)); parts.push(spire(9, 28, 8, P.slate, -38, 40, 0));
    return { parts };
  },
  /* The stone hotel at La Source: three floors, a steep roof with dormers, a bell turret on
     the end like an old abbey's. Fictional (the real one is further back, NOTES.md). */
  hotel(h){
    const parts = [], l = h.wid, w = h.dep, H = 3 * 3.1 + 0.6;
    parts.push(bx(l, H, w, P.stone)); parts.push(bx(l + 0.4, 0.8, w + 0.4, P.stoneDk));
    parts.push(...gable(l, w, w * 0.62, 0.5, P.slate, P.stone, 0, H, 0));
    windows(parts, l - 3, w / 2, 1, 0.8, 3, 3.1, 3.4, 1.1, 1.7);
    windows(parts, l - 3, -w / 2, -1, 0.8, 3, 3.1, 3.4, 1.1, 1.7);
    for(let k = 0; k < 5; k++){ const x = -l / 2 + 5 + k * (l - 10) / 4;
      parts.push(bx(2, 1.8, 2.2, P.stone, x, H + 0.4, w * 0.22)); parts.push(...gable(2, 2.2, 1.1, 0.15, P.slate, P.stone, x, H + 2.2, w * 0.22)); }
    // the turret: a slim square tower with a pointed cap and a bell opening
    parts.push(bx(4, H + 8, 4, P.stone, l / 2 - 1, 0, -w / 2 + 2));
    parts.push(bx(2.2, 2, 0.1, "#20242A", l / 2 - 1, H + 5, -w / 2 + 4.06));
    parts.push(spire(3.4, 6, 4, P.slate, l / 2 - 1, H + 8, -w / 2 + 2));
    for(const x of [-l * 0.3, l * 0.15]) parts.push(bx(1.1, 3, 1.1, P.stoneDk, x, H + w * 0.3, 0));
    // a glazed porch on the front
    parts.push(bx(8, 3.2, 3, P.glassLit, 0, 0, w / 2 + 1.5)); parts.push(bx(8.6, 0.3, 3.4, P.slate, 0, 3.2, w / 2 + 1.5));
    return { parts, sign:{ x:0, y:H - 1.2, z:w / 2 + 0.2, w:12, h:1.6, text:"HOTEL DU VIRAGE" } };
  },
  // the old hotel at the foot of Eau Rouge: white render, a slate roof, balconies, chimneys
  oldhotel(h){
    const parts = [], l = h.wid, w = h.dep, H = 3 * 3.0 + 0.5;
    parts.push(bx(l, H, w, P.render)); parts.push(bx(l + 0.4, 0.7, w + 0.4, P.stoneDk));
    parts.push(...gable(l, w, w * 0.6, 0.6, P.slate, P.render, 0, H, 0));
    windows(parts, l - 2, w / 2, 1, 0.6, 3, 3.0, 3.0, 1.0, 1.6);
    windows(parts, l - 2, -w / 2, -1, 0.6, 3, 3.0, 3.0, 1.0, 1.6);
    for(let f = 1; f < 3; f++) parts.push(bx(l - 4, 0.15, 1.2, P.timberDk, 0, 0.5 + f * 3.0, w / 2 + 0.6), bx(l - 4, 0.9, 0.08, P.timberDk, 0, 0.6 + f * 3.0, w / 2 + 1.2));
    for(const x of [-l * 0.32, 0, l * 0.32]) parts.push(bx(1, 2.4, 1, P.brick, x, H + w * 0.28, 0));
    return { parts, sign:{ x:0, y:H - 0.9, z:w / 2 + 1.3, w:10, h:1.3, text:"HOTEL DU RUISSEAU" } };
  },
  // the old pit row: a long low block of garages, a flat roof with a railing
  oldpits(h){
    const parts = [], l = h.wid, w = h.dep;
    parts.push(bx(l, 3.8, w, P.renderWarm)); parts.push(bx(l + 0.6, 0.3, w + 0.8, P.concreteDk, 0, 3.8, 0));
    for(let x = -l / 2 + 2.5; x < l / 2 - 1; x += 4.4) parts.push(bx(3.4, 2.8, 0.1, x % 8.8 < 4.4 ? "#3A5A78" : "#7A2E26", x + 1.7, 0, w / 2 + 0.05));
    for(let x = -l / 2; x <= l / 2; x += 2) parts.push(bx(0.08, 1, 0.08, P.steel, x, 4.1, w / 2 + 0.2));
    parts.push(bx(l, 0.08, 0.08, P.steel, 0, 5.1, w / 2 + 0.2));
    return { parts };
  },
  /* A module of the pit building, 50 m: garages on the lane side in team colours, a glazed
     hospitality floor above with a balcony, and a roof terrace with its rail. */
  pits(h, teams){
    const parts = [], l = h.wid, w = h.dep;
    parts.push(bx(l, 5, w, P.concrete));
    for(let k = 0; k < 5; k++){ const x = -l / 2 + (k + 0.5) * l / 5, t = teams[(((k + (h.seed || 0)) % teams.length) + teams.length) % teams.length];
      parts.push(bx(l / 5 - 1.2, 4, 0.12, t.body, x, 0, w / 2 + 0.06)); parts.push(bx(l / 5 - 1.2, 0.5, 0.14, "#20242A", x, 4.1, w / 2 + 0.07)); }
    parts.push(bx(l, 3.6, w - 1.5, P.glassLit, 0, 5, -0.75));
    for(let x = -l / 2; x <= l / 2; x += 5) parts.push(bx(0.25, 3.6, 0.25, P.white, x, 5, w / 2 - 1.5));
    parts.push(bx(l, 0.3, 2.2, P.white, 0, 5, w / 2 - 0.3));                       // the balcony
    parts.push(bx(l, 0.9, 0.08, P.glassLit, 0, 5.3, w / 2 + 0.75));
    parts.push(bx(l + 0.6, 0.5, w + 0.6, P.white, 0, 8.6, 0));
    parts.push(bx(l, 0.1, 0.1, P.steel, 0, 10.1, w / 2), bx(l, 0.1, 0.1, P.steel, 0, 10.1, -w / 2));
    for(let x = -l / 2; x <= l / 2; x += 2.5) parts.push(bx(0.08, 1.0, 0.08, P.steel, x, 9.1, w / 2));
    parts.push(bx(l, 0.9, 0.1, P.red, 0, 7.4, w / 2 + 0.95));                      // a red band along the front
    return { parts };
  },
  // the paddock: two rows of team trucks with awnings, and a two-storey hospitality unit
  paddock(h, teams){
    const parts = [], l = h.wid, w = h.dep;
    for(let k = 0; k < 4; k++){ const t = teams[(((k + 2 + (h.seed || 0)) % teams.length) + teams.length) % teams.length], x = -l / 2 + 6 + k * 12.5;
      for(const z of [-w / 2 + 4, w / 2 - 6]){
        parts.push(bx(2.6, 3.8, 13.5, t.body, x, 0.5, z)); parts.push(bx(2.6, 0.5, 13.5, "#22262C", x, 0, z));
        parts.push(bx(2.5, 2.8, 2.4, P.white, x, 0.6, z - 8)); parts.push(bx(4, 0.15, 10, t.body, x + 3.3, 3.4, z));
      } }
    parts.push(bx(14, 7, 9, P.glassLit, l / 2 - 8, 0, 0)); parts.push(bx(15, 0.4, 10, P.white, l / 2 - 8, 7, 0)); parts.push(bx(14.2, 0.5, 9.2, P.white, l / 2 - 8, 3.5, 0));
    return { parts };
  },
  /* A grandstand: stepped rows rising away from the track, a back wall, and on the bigger
     ones a roof on columns, tilted up towards the track. Returns where the seats are. */
  stand(h){
    const parts = [], l = h.wid, rows = h.rows, D = 0.85, R = 0.48, base = 1.6;
    const seatCol = h.seat || (h.main ? "#2F5E9E" : h.name === "raidillon" ? "#C8302A" : "#5A6470");
    parts.push(bx(l, base, rows * D + 1.2, P.concreteDk, 0, 0, -rows * D / 2 + 0.6));
    for(let r = 0; r < rows; r++){
      const z = 0.6 - (r + 0.5) * D, y = base + r * R;
      parts.push(bx(l, R, D, r % 2 ? P.concrete : P.concreteDk, 0, y, z));
      parts.push(bx(l - 0.4, 0.22, 0.4, seatCol, 0, y + R, z + 0.15));
    }
    const back = -rows * D, top = base + rows * R;
    parts.push(bx(l, top + 1.6, 0.5, P.concrete, 0, 0, back - 0.1));
    for(const s of [-1, 1]) parts.push(bx(0.5, top + 1.2, rows * D + 1.2, P.concrete, s * (l / 2 + 0.25), 0, -rows * D / 2 + 0.6));
    parts.push(bx(l, 1.1, 0.15, P.white, 0, base, 0.65));                         // the front rail
    if(h.roof){
      for(let x = -l / 2 + 2; x <= l / 2 - 2; x += 12) parts.push(bx(0.5, top + 7, 0.5, P.steel, x, 0, back + 0.4));
      const rg = new THREE.BoxGeometry(l + 2, 0.45, rows * D + 5); rg.rotateX(-0.12); rg.translate(0, top + 6.2, -rows * D / 2 + 1.2);
      parts.push(paint(rg, flat(P.white), () => 0));
      parts.push(bx(l + 2, 1.4, 0.2, h.main ? "#1E3E6E" : P.red, 0, top + 6.0, 1.9));
    }
    // seats: every 0.7 m along every row, for the crowd
    const seats = [];
    for(let r = 0; r < rows; r++) for(let x = -l / 2 + 0.6; x < l / 2 - 0.4; x += 0.72) seats.push([x, base + r * R + R + 0.15, 0.6 - (r + 0.5) * D + 0.05]);
    return { parts, seats, top };
  },
  // a spectator bank: a terraced grass slope with a fence along its foot
  bank(h){
    // it rises as the hill under it does (at least a little), and its steps reach down to the ground
    const parts = [], l = h.wid, w = h.dep, steps = Math.round(w / 3), rise = Math.min(18, Math.max(1.5, h.rise == null ? w * 0.32 : h.rise));
    const drop = 1 + Math.max(0, -(h.rise || 0));
    const grassA = "#5E8A3E", grassB = "#6E9646", earth = "#7A6A4E";
    const seats = [];
    for(let s = 0; s < steps; s++){
      const z = -s * w / steps, y = s * rise / steps;
      parts.push(bx(l - s * 1.2, y + drop, w / steps, s % 2 ? grassA : grassB, 0, -drop, z - w / steps / 2));
      parts.push(bx(l - s * 1.2, 0.18, 0.4, earth, 0, y, z - 0.2));
      for(let x = -l / 2 + s * 0.6 + 0.8; x < l / 2 - s * 0.6 - 0.6; x += 0.9) seats.push([x, y + 0.05, z - w / steps * 0.5 + (Math.random() - 0.5) * 1.2]);
    }
    for(let x = -l / 2; x <= l / 2; x += 2.5) parts.push(bx(0.1, 1.3, 0.1, P.steel, x, 0, 1));
    parts.push(bx(l, 0.08, 0.08, P.steel, 0, 1.2, 1));
    return { parts, seats, top:rise };
  },
  // hospitality chalets at the top of Raidillon: a row of white boxes, glass fronts, peaked roofs
  chalets(h){
    const parts = [], l = h.wid, w = h.dep, nC = Math.floor(l / 10);
    for(let k = 0; k < nC; k++){ const x = -l / 2 + (k + 0.5) * l / nC;
      parts.push(bx(l / nC - 1, 3.4, w, P.white, x)); parts.push(bx(l / nC - 1.6, 2.4, 0.1, P.glassLit, x, 0.6, w / 2 + 0.05));
      parts.push(...gable(l / nC - 1, w, 1.6, 0.3, k % 2 ? "#2E5A2A" : "#3C4148", P.white, x, 3.4, 0)); }
    return { parts };
  },
  // a marshal post: a little concrete hut, orange band, a flag board
  marshal(){
    const parts = [];
    parts.push(bx(2.4, 2.3, 1.8, P.white)); parts.push(bx(2.5, 0.35, 1.9, "#E8742A", 0, 1.6, 0));
    parts.push(bx(2.9, 0.2, 2.3, P.slate, 0, 2.3, 0)); parts.push(bx(1.4, 0.8, 0.08, P.glass, 0, 1.0, 0.94));
    parts.push(bx(0.08, 2.8, 0.08, P.steel, 1.4, 0, 0.8)); parts.push(bx(0.9, 0.6, 0.04, "#F2D22A", 1.85, 2.2, 0.8));
    return { parts };
  },
  // a camera tower: scaffold legs, braces, a platform and a hut
  tvtower(){
    const parts = [];
    for(const [a, b] of [[-1.3, -1.3], [1.3, -1.3], [1.3, 1.3], [-1.3, 1.3]]) parts.push(bx(0.18, 9, 0.18, P.steel, a, 0, b));
    for(let y = 2; y < 9; y += 2.4) parts.push(bx(2.8, 0.1, 2.8, P.steel, 0, y, 0));
    parts.push(bx(3.4, 0.25, 3.4, "#5A5E64", 0, 9, 0)); parts.push(bx(2.2, 1.9, 2.2, P.white, 0.3, 9.25, 0)); parts.push(bx(2.8, 0.2, 2.8, P.red, 0.3, 11.15, 0));
    return { parts };
  },
};

/* ---- the plants and the little things that are instanced: unit-sized, colour from tint ---- */
const grad2 = (lo, hi, y0, y1) => { const A = lin(lo), B = lin(hi); return (x, y) => A.clone().lerp(B, Math.min(1, Math.max(0, (y - y0) / (y1 - y0)))); };
function plantGeos(){
  const G = {};
  // open-ended: the caps underneath are never seen from above, and they are half the triangles
  const trunk = (r0, r1, h, col) => { const t = new THREE.CylinderGeometry(r1, r0, h, 5, 1, true); t.translate(0, h / 2, 0); return paint(t, flat(col || "#5A4434"), () => 0); };
  const cone = (r, h, y, seg, lo, hi) => { const c = new THREE.ConeGeometry(r, h, seg, 1, true); c.translate(0, y + h / 2, 0); return paint(c, grad2(lo, hi, y, y + h)); };
  const blob = (r, x, y, z, sy, lo, hi) => { const b = new THREE.IcosahedronGeometry(r, 0); b.scale(1, sy, 1); b.translate(x, y, z); return paint(b, grad2(lo, hi, y - r * sy, y + r * sy)); };
  // Norway spruce: tall, dark, drooping tiers
  G.spruce = merge([trunk(0.016, 0.01, 0.35, "#4A3828"),
    cone(0.19, 0.34, 0.12, 7, "#16301E", "#22402A"), cone(0.16, 0.30, 0.30, 7, "#183422", "#26462C"),
    cone(0.125, 0.27, 0.48, 7, "#1C3824", "#2A4C2E"), cone(0.09, 0.24, 0.64, 6, "#1E3C26", "#30542F"), cone(0.05, 0.2, 0.8, 5, "#224028", "#365A33")]);
  G.spruceFar = merge([cone(0.19, 0.7, 0.1, 5, "#16301E", "#26462C"), cone(0.1, 0.4, 0.6, 5, "#1C3824", "#30542F")]);
  // Scots pine: bare trunk, a flat-topped crown up high
  G.pine = merge([trunk(0.022, 0.014, 0.72, "#8A5A3A"),
    blob(0.2, 0, 0.74, 0, 0.5, "#24402A", "#3A5E34"), blob(0.15, 0.1, 0.86, 0.05, 0.45, "#2A4A2C", "#446A3A"), blob(0.13, -0.1, 0.84, -0.06, 0.45, "#2A4A2C", "#446A3A")]);
  // beech and oak: big round crowns, two greens
  G.beech = merge([trunk(0.035, 0.024, 0.45, "#7A7468"),
    blob(0.34, 0, 0.62, 0, 0.85, "#2E5426", "#4E7E36"), blob(0.24, 0.17, 0.74, 0.07, 0.85, "#345C2A", "#56883C"), blob(0.23, -0.15, 0.78, -0.1, 0.85, "#345C2A", "#5A8C40")]);
  G.oak = merge([trunk(0.05, 0.03, 0.4, "#5A4636"),
    blob(0.38, 0, 0.58, 0, 0.7, "#2C4E22", "#4A7432"), blob(0.28, 0.24, 0.62, 0.1, 0.7, "#30542A", "#527A38"), blob(0.26, -0.22, 0.66, -0.12, 0.7, "#30542A", "#567E3A")]);
  G.broadFar = merge([blob(0.38, 0, 0.6, 0, 0.85, "#2E5426", "#4E7E36")]);
  // birch: a white trunk and a light, airy crown
  G.birch = merge([trunk(0.02, 0.012, 0.6, "#E6E2D8"),
    blob(0.2, 0, 0.62, 0, 1.3, "#4A7A34", "#7AA44A"), blob(0.14, 0.08, 0.84, 0.04, 1.2, "#52823A", "#86AE52")]);
  // ferns and bracken: a fan of flat fronds
  { const parts = []; for(let k = 0; k < 6; k++){ const p = new THREE.PlaneGeometry(0.22, 0.7); p.translate(0, 0.35, 0); p.rotateX(-0.75); p.rotateY(k / 6 * TAU); parts.push(paint(p, grad2("#2E4E22", "#5E8A3A", 0, 0.6))); }
    G.fern = merge(parts); }
  G.shrub = merge([blob(0.5, 0, 0.42, 0, 0.8, "#2E4A24", "#4E7234"), blob(0.36, 0.3, 0.36, 0.1, 0.8, "#345228", "#567A38")]);
  { const h = new THREE.BoxGeometry(1, 1, 1, 2, 1, 1); h.translate(0, 0.5, 0); G.hedge = paint(h, grad2("#2C4A22", "#4A7032", 0, 1), () => 1); }
  { const parts = []; for(const [x, z] of [[0, 0], [0.4, 0.2], [-0.35, 0.3], [0.15, -0.4], [-0.3, -0.25]]){ const b = new THREE.IcosahedronGeometry(0.13, 0); b.translate(x, 0.16, z); parts.push(paint(b, flat("#FFFFFF"))); }
    const leaf = new THREE.CircleGeometry(0.55, 6); leaf.rotateX(-Math.PI / 2); leaf.translate(0, 0.03, 0); parts.push(paint(leaf, flat("#4E7A36"), () => 0)); G.flowers = merge(parts); }
  // a round hay bale, wrapped
  { const c = new THREE.CylinderGeometry(0.75, 0.75, 1.2, 10); c.rotateZ(Math.PI / 2); c.translate(0, 0.75, 0); G.bale = paint(c, (x, y, z, f) => lin(Math.abs(x) > 0.55 ? "#C8B068" : "#B89A50"), () => 0); }
  // a cow: body, head, legs; tinted (white or brown) with dark patches kept dark
  { const parts = [], dk = "#2A2622";
    const body = new THREE.BoxGeometry(2.0, 0.9, 0.8); body.translate(0, 1.15, 0); parts.push(paint(body, flat("#FFFFFF")));
    const patch = new THREE.BoxGeometry(0.7, 0.92, 0.82); patch.translate(-0.3, 1.15, 0); parts.push(paint(patch, flat(dk), () => 0));
    const head = new THREE.BoxGeometry(0.5, 0.45, 0.4); head.translate(1.15, 1.05, 0); parts.push(paint(head, flat("#FFFFFF")));
    for(const [x, z] of [[0.75, 0.28], [0.75, -0.28], [-0.75, 0.28], [-0.75, -0.28]]){ const l = new THREE.BoxGeometry(0.16, 0.75, 0.16); l.translate(x, 0.37, z); parts.push(paint(l, flat(dk), () => 0)); }
    G.cow = merge(parts); }
  { const parts = [];
    const body = new THREE.IcosahedronGeometry(0.5, 1); body.scale(1.35, 0.85, 0.85); body.translate(0, 0.75, 0); parts.push(paint(body, flat("#EEEAE0")));
    const head = new THREE.BoxGeometry(0.3, 0.3, 0.26); head.translate(0.7, 0.85, 0); parts.push(paint(head, flat("#2A2622"), () => 0));
    for(const [x, z] of [[0.35, 0.2], [0.35, -0.2], [-0.35, 0.2], [-0.35, -0.2]]){ const l = new THREE.BoxGeometry(0.1, 0.45, 0.1); l.translate(x, 0.22, z); parts.push(paint(l, flat("#2A2622"), () => 0)); }
    G.sheep = merge(parts); }
  // camping: a dome tent, a big frame tent, a camper van, a flagpole
  { const t = new THREE.SphereGeometry(1.3, 8, 4, 0, TAU, 0, Math.PI / 2); t.scale(1.25, 0.95, 1); G.tent = paint(t, flat("#FFFFFF")); }
  { const t = new THREE.BoxGeometry(5, 2.2, 3.4); t.translate(0, 1.1, 0); const r = new THREE.ConeGeometry(3.1, 1.2, 4); r.rotateY(Math.PI / 4); r.scale(1.15, 1, 0.8); r.translate(0, 2.8, 0);
    G.bigtent = merge([paint(t, flat("#FFFFFF")), paint(r, flat("#FFFFFF"))]); }
  { const b = new THREE.BoxGeometry(5.6, 2.2, 2.1); b.translate(0, 1.5, 0); const c = new THREE.BoxGeometry(1.4, 1.2, 2.0); c.translate(2.8, 1.0, 0);
    const w = new THREE.BoxGeometry(1.2, 0.6, 2.12); w.translate(2.6, 1.9, 0); const s = new THREE.BoxGeometry(5.62, 0.5, 2.12); s.translate(0, 1.6, 0);
    G.van = merge([paint(b, flat("#F2F0EA"), () => 0), paint(c, flat("#F2F0EA"), () => 0), paint(w, flat("#2C3A46"), () => 0), paint(s, flat("#FFFFFF"))]); }
  { const pole = new THREE.CylinderGeometry(0.05, 0.05, 7, 4); pole.translate(0, 3.5, 0); G.flagpole = paint(pole, flat("#C8CCD0"), () => 0); }
  // a parked car
  { const b = new THREE.BoxGeometry(4.2, 0.8, 1.8); b.translate(0, 0.65, 0); const c = new THREE.BoxGeometry(2.2, 0.6, 1.6); c.translate(-0.2, 1.35, 0);
    const g = new THREE.BoxGeometry(2.0, 0.45, 1.62); g.translate(-0.2, 1.35, 0);
    G.car = merge([paint(b, flat("#FFFFFF")), paint(c, flat("#FFFFFF")), paint(g, flat("#2C3A46"), () => 0)]); }
  // a spectator: legs, a body in the shirt colour, a head; and the same with an arm up, waving
  { const leg = new THREE.BoxGeometry(0.32, 0.8, 0.22); leg.translate(0, 0.4, 0);
    const body = new THREE.BoxGeometry(0.44, 0.65, 0.26); body.translate(0, 1.12, 0);
    const head = new THREE.BoxGeometry(0.22, 0.24, 0.22); head.translate(0, 1.58, 0);
    const base = [paint(leg, flat("#2E3440"), () => 0), paint(body, flat("#FFFFFF")), paint(head, flat("#E2B896"), () => 0)];
    G.fan = merge(base);
    const arm = new THREE.BoxGeometry(0.12, 0.6, 0.12); arm.translate(0, 0.3, 0); arm.rotateZ(-0.35); arm.translate(0.24, 1.36, 0);
    const flag = new THREE.PlaneGeometry(0.6, 0.4); flag.translate(0.55, 2.05, 0);
    G.waver = merge([...base, paint(arm, flat("#FFFFFF")), paint(flag, flat("#FFFFFF"))]); }
  // a flag: a plane that the shader waves, hung off its left edge
  { const f = new THREE.PlaneGeometry(1, 0.66, 6, 1); f.translate(0.5, 0, 0); G.flag = paint(f, flat("#FFFFFF")); }
  // a tyre wall: a stack of three
  { const parts = []; for(let k = 0; k < 3; k++){ const t = new THREE.CylinderGeometry(0.33, 0.33, 0.26, 8); t.translate(0, 0.13 + k * 0.26, 0); parts.push(paint(t, flat(k === 1 ? "#E8E8E8" : "#1A1C20"), () => 0)); }
    G.tyres = merge(parts); }
  return G;
}

export { KIT, plantGeos };
