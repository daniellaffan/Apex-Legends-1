import { mulberry, shade } from '../config/util.js';
import { R } from './view.js';

const TEX = {
  cache:new Map(),
  mk(w, h){ const c = document.createElement("canvas"); c.width = w; c.height = h; return c; },
  rnd(seed){ return mulberry(seed | 0); },
  // a facade tile: one repeat of wall + windows. Returned with the metres it spans.
  facade(style, col, lit){
    const key = "f|" + style + "|" + col + "|" + (lit ? 1 : 0);
    if(this.cache.has(key)) return this.cache.get(key);
    const W = 96, H = 72, c = this.mk(W, H), g = c.getContext("2d"), r = this.rnd(hashStr(key));
    const wall = col, dark = shade(col, -0.22), light = shade(col, 0.14);
    g.fillStyle = wall; g.fillRect(0, 0, W, H);
    const glassDay = () => r() < 0.5 ? "#6C8AA6" : "#5E7C98";
    const glassNight = () => r() < 0.42 ? "#0F141C" : r() < 0.6 ? "#F2C46A" : "#BBD7F5";
    let sx = 8, sy = 6;                                   // metres per tile
    if(style === "glass"){
      // curtain wall: thin mullions over big panes
      sx = 6; sy = 4;
      for(let y = 0; y < H; y += 24) for(let x = 0; x < W; x += 24){
        g.fillStyle = lit ? glassNight() : glassDay(); g.fillRect(x + 1, y + 1, 22, 22);
        g.fillStyle = "rgba(255,255,255,.08)"; g.fillRect(x + 1, y + 1, 22, 6);
      }
      g.fillStyle = "rgba(20,24,30,.55)";
      for(let x = 0; x < W; x += 24) g.fillRect(x, 0, 1.5, H);
      for(let y = 0; y < H; y += 24) g.fillRect(0, y, W, 1.5);
    } else if(style === "stone"){
      // belle-époque: stone courses, tall arched windows, shutters, a cornice
      sx = 8; sy = 6;
      g.fillStyle = "rgba(0,0,0,.06)"; for(let y = 8; y < H; y += 12) g.fillRect(0, y, W, 1);
      for(let x = 8; x < W; x += 32){
        g.fillStyle = lit ? glassNight() : "#3E4A58"; g.fillRect(x + 4, 14, 14, 30);
        g.beginPath(); g.arc(x + 11, 14, 7, Math.PI, 0); g.fill();
        g.fillStyle = "#4E6E5A"; g.fillRect(x, 16, 4, 28); g.fillRect(x + 18, 16, 4, 28);   // shutters
        g.fillStyle = light; g.fillRect(x - 1, 44, 24, 3);                              // sill
        g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(x + 2, 46, 20, 6);                  // balcony
      }
      g.fillStyle = light; g.fillRect(0, 0, W, 3); g.fillStyle = dark; g.fillRect(0, 3, W, 1);
    } else if(style === "sand"){
      // Baku: ashlar blocks, arched windows, carved band
      sx = 8; sy = 6;
      g.fillStyle = "rgba(0,0,0,.07)";
      for(let y = 0; y < H; y += 12){ g.fillRect(0, y, W, 1); for(let x = (y / 12) % 2 ? 12 : 0; x < W; x += 24) g.fillRect(x, y, 1, 12); }
      for(let x = 10; x < W; x += 32){
        g.fillStyle = lit ? glassNight() : "#2E3A48"; g.fillRect(x, 18, 12, 26);
        g.beginPath(); g.arc(x + 6, 18, 6, Math.PI, 0); g.fill();
        g.fillStyle = dark; g.fillRect(x - 2, 44, 16, 2);
      }
      g.fillStyle = shade(col, 0.1); g.fillRect(0, 6, W, 4);
    } else if(style === "brick"){
      sx = 6; sy = 4.5;
      g.fillStyle = shade(col, -0.05);
      for(let y = 0; y < H; y += 6) for(let x = (y / 6) % 2 ? -6 : 0; x < W; x += 12){
        g.fillStyle = r() < 0.5 ? col : shade(col, r() < 0.5 ? -0.08 : 0.06); g.fillRect(x + 1, y + 1, 10, 4);
      }
      for(let x = 12; x < W; x += 36){ g.fillStyle = lit ? glassNight() : "#3A4654"; g.fillRect(x, 20, 14, 20); g.fillStyle = "#EDEBE4"; g.fillRect(x - 2, 40, 18, 2); }
    } else if(style === "concrete"){
      // panel grid with strip windows
      sx = 8; sy = 5;
      g.fillStyle = "rgba(0,0,0,.09)"; for(let x = 0; x < W; x += 24) g.fillRect(x, 0, 1, H);
      g.fillRect(0, 0, W, 1);
      g.fillStyle = lit ? glassNight() : "#4A5A6A"; g.fillRect(4, 22, W - 8, 16);
      g.fillStyle = "rgba(255,255,255,.12)"; g.fillRect(4, 22, W - 8, 3);
      g.fillStyle = dark; g.fillRect(0, 40, W, 2);
    } else if(style === "stucco"){
      // Italian: rendered wall, tall shuttered windows, terracotta band
      sx = 8; sy = 6;
      g.fillStyle = "rgba(255,255,255,.05)"; for(let i = 0; i < 40; i++) g.fillRect(r() * W, r() * H, 3, 1);
      for(let x = 10; x < W; x += 32){
        g.fillStyle = lit ? glassNight() : "#3A4654"; g.fillRect(x, 12, 12, 32);
        g.fillStyle = "#6E5238"; g.fillRect(x - 4, 12, 4, 32); g.fillRect(x + 12, 12, 4, 32);
        g.fillStyle = light; g.fillRect(x - 5, 44, 22, 2);
      }
      g.fillStyle = "#A8553C"; g.fillRect(0, 0, W, 4);
    } else if(style === "favela"){
      // painted block walls, small windows, every unit a different colour
      sx = 6; sy = 4;
      const cs = ["#B95A3C", "#C99A5A", "#4E7AA6", "#5E8A4E", "#D8C8A6", "#8E5A46", col];
      for(let x = 0; x < W; x += 32){
        g.fillStyle = cs[Math.floor(r() * cs.length)]; g.fillRect(x, 0, 32, H);
        g.fillStyle = lit ? glassNight() : "#2E3A48"; g.fillRect(x + 8, 18, 10, 12); g.fillRect(x + 8, 46, 10, 12);
        g.fillStyle = "rgba(0,0,0,.15)"; g.fillRect(x, 0, 1, H);
      }
      g.fillStyle = "rgba(0,0,0,.12)"; g.fillRect(0, 34, W, 2);
    } else if(style === "led"){
      sx = 4; sy = 3;
      for(let y = 0; y < H; y += 6) for(let x = 0; x < W; x += 6){
        g.fillStyle = ["#E03C5A", "#37D6E8", "#FFC63D", "#B14BF0", "#39FF88"][Math.floor(r() * 5)];
        g.globalAlpha = 0.35 + r() * 0.65; g.fillRect(x + 1, y + 1, 4, 4);
      }
      g.globalAlpha = 1;
    } else {
      // "hotel": the plain grid with balconies
      sx = 8; sy = 6;
      for(let y = 4; y < H; y += 24) for(let x = 4; x < W; x += 16){
        g.fillStyle = lit ? glassNight() : glassDay(); g.fillRect(x, y, 10, 14);
        g.fillStyle = "rgba(255,255,255,.1)"; g.fillRect(x, y, 10, 3);
        g.fillStyle = dark; g.fillRect(x - 2, y + 14, 14, 2);
      }
    }
    const out = { img:c, sx, sy, pat:null };
    this.cache.set(key, out); return out;
  },
  // rows of seats with the crowd in them
  seats(col, night){
    const key = "s|" + col + "|" + (night ? 1 : 0);
    if(this.cache.has(key)) return this.cache.get(key);
    const W = 96, H = 48, c = this.mk(W, H), g = c.getContext("2d"), r = this.rnd(hashStr(key));
    const dim = night ? -0.45 : 0;                       // a crowd under floodlight, not in daylight
    g.fillStyle = shade(col, -0.3); g.fillRect(0, 0, W, H);
    const seat = ["#2E5AA8", "#D8352A", "#E8B33D", "#2E8B45", "#F2F2F2"];
    const folk = ["#E8D8C0", "#3A2A20", "#D8352A", "#2E5AA8", "#F2F2F2", "#2A2A2A"];
    for(let y = 0; y < H; y += 8){
      g.fillStyle = shade(col, -0.1); g.fillRect(0, y, W, 2);
      for(let x = 0; x < W; x += 4){
        const base = r() < 0.6 ? folk[Math.floor(r() * 6)] : seat[Math.floor(r() * 5)];
        g.fillStyle = dim ? shade(base, dim) : base;
        g.fillRect(x + 1, y + 3, 2, 3);
      }
    }
    const out = { img:c, sx:12, sy:6, pat:null }; this.cache.set(key, out); return out;
  },
  garage(col){
    const key = "g|" + col;
    if(this.cache.has(key)) return this.cache.get(key);
    const W = 64, H = 40, c = this.mk(W, H), g = c.getContext("2d");
    g.fillStyle = col; g.fillRect(0, 0, W, H);
    g.fillStyle = "#1A1E24"; g.fillRect(6, 10, 52, 30);
    g.fillStyle = "rgba(255,255,255,.08)"; for(let y = 12; y < 40; y += 5) g.fillRect(6, y, 52, 1);
    g.fillStyle = "#FFA51F"; g.fillRect(6, 6, 52, 3);
    const out = { img:c, sx:11, sy:6, pat:null }; this.cache.set(key, out); return out;
  },
  // ground grain: a noise tile in the colour given, world-anchored when drawn from overhead
  ground(col, kind){
    const key = "gr|" + col + "|" + (kind || "");
    if(this.cache.has(key)) return this.cache.get(key);
    const W = 64, H = 64, c = this.mk(W, H), g = c.getContext("2d"), r = this.rnd(hashStr(key));
    g.fillStyle = col; g.fillRect(0, 0, W, H);
    const amp = kind === "water" ? 0.05 : kind === "asphalt" ? 0.03 : kind === "sand" ? 0.045 : kind === "gravel" ? 0.16 : 0.06;
    for(let i = 0; i < (kind === "gravel" ? 1400 : 420); i++){
      g.fillStyle = shade(col, (r() - 0.5) * 2 * amp);
      const x = r() * W, y = r() * H;
      if(kind === "grass") g.fillRect(x, y, 1, 1 + r() * 2);
      else if(kind === "water") g.fillRect(x, y, 3 + r() * 6, 1);
      else g.fillRect(x, y, 1 + r() * 1.5, 1 + r() * 1.5);
    }
    if(kind === "water"){ g.fillStyle = "rgba(255,255,255,.10)"; for(let i = 0; i < 18; i++) g.fillRect(r() * W, r() * H, 4 + r() * 10, 1); }
    const pat = R.ctx.createPattern(c, "repeat");
    const out = { img:c, pat }; this.cache.set(key, out); return out;
  },
  pattern(t){ if(!t.pat) t.pat = R.ctx.createPattern(t.img, "repeat"); return t.pat; },
};

function hashStr(str){ let h = 7; for(let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return h; }

// a texture-mapped quad: p0..p3 on screen, tile size in metres, face size in metres.
// Two affine triangles: exact under the overhead camera, a hair off through a lens.
function texQuad(ctx, tex, p0, p1, p2, p3, wm, hm){
  const tw = tex.img.width, th = tex.img.height;
  const U = (wm / tex.sx) * tw, V = (hm / tex.sy) * th;        // texture-space extent in px
  const pat = TEX.pattern(tex);
  const tri = (s0, s1, s2, t0, t1, t2) => {
    // affine mapping texture (t) -> screen (s)
    const d = (t1[0] - t0[0]) * (t2[1] - t0[1]) - (t2[0] - t0[0]) * (t1[1] - t0[1]);
    if(Math.abs(d) < 1e-6) return;
    const a = ((s1[0] - s0[0]) * (t2[1] - t0[1]) - (s2[0] - s0[0]) * (t1[1] - t0[1])) / d;
    const b = ((s1[1] - s0[1]) * (t2[1] - t0[1]) - (s2[1] - s0[1]) * (t1[1] - t0[1])) / d;
    const c = ((s2[0] - s0[0]) * (t1[0] - t0[0]) - (s1[0] - s0[0]) * (t2[0] - t0[0])) / d;
    const dd = ((s2[1] - s0[1]) * (t1[0] - t0[0]) - (s1[1] - s0[1]) * (t2[0] - t0[0])) / d;
    const e = s0[0] - a * t0[0] - c * t0[1], f = s0[1] - b * t0[0] - dd * t0[1];
    ctx.save();
    ctx.beginPath(); ctx.moveTo(s0[0], s0[1]); ctx.lineTo(s1[0], s1[1]); ctx.lineTo(s2[0], s2[1]); ctx.closePath(); ctx.clip();
    ctx.transform(a, b, c, dd, e, f);
    ctx.fillStyle = pat; ctx.fillRect(-2, -2, U + 4, V + 4);
    ctx.restore();
  };
  // p0 bottom-left, p1 bottom-right, p2 top-right, p3 top-left
  tri(p0, p1, p3, [0, V], [U, V], [0, 0]);
  tri(p2, p3, p1, [U, 0], [0, 0], [U, V]);
}


export { TEX, hashStr, texQuad };
