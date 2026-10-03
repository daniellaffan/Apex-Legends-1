/* ============================================================================
   APEX RIVALS '26  —  isometric formula racing
   Sections: 0 utils · 1 data · 2 track builder · 3 physics · 4 AI
             5 renderer · 6 session · 7 UI · 8 boot
   ========================================================================== */

/* ---------- 0. utils ------------------------------------------------------ */
const TAU = Math.PI * 2, RAD = Math.PI / 180;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
function angWrap(a){ while(a > Math.PI) a -= TAU; while(a < -Math.PI) a += TAU; return a; }
function mulberry(seed){ let t = seed >>> 0; return function(){ t += 0x6D2B79F5; let r = t;
  r = Math.imul(r ^ r >>> 15, r | 1); r ^= r + Math.imul(r ^ r >>> 7, r | 61); return ((r ^ r >>> 14) >>> 0) / 4294967296; }; }
function shade(hex, k){
  let r, g, b;
  if(hex[0] === "r"){                                   // an rgb(...) string, from an earlier shade()
    const m = hex.match(/[\d.]+/g); r = +m[0]; g = +m[1]; b = +m[2];
  } else { const n = parseInt(hex.slice(1), 16); r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255; }
  if(k >= 0){ r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; }
  else { r *= 1 + k; g *= 1 + k; b *= 1 + k; }
  return `rgb(${r|0},${g|0},${b|0})`;
}
function fmtTime(ms, showMin = true){
  if(ms == null || !isFinite(ms) || ms <= 0) return "--:--.---";
  const m = Math.floor(ms / 60000), s = (ms % 60000) / 1000;
  return showMin || m > 0 ? `${m}:${s < 10 ? "0" : ""}${s.toFixed(3)}` : s.toFixed(3);
}
function fmtGap(ms){ if(ms == null) return "—"; if(ms >= 60000) return "+" + fmtTime(ms); return "+" + (ms / 1000).toFixed(3); }
const $ = s => document.querySelector(s);
const el = (t, c, h) => { const n = document.createElement(t); if(c) n.className = c; if(h != null) n.innerHTML = h; return n; };
function store(k, v){ try{ if(v === undefined) return JSON.parse(localStorage.getItem("ar26_" + k) || "null");
  localStorage.setItem("ar26_" + k, JSON.stringify(v)); }catch(e){ return null; } }


export { $, RAD, TAU, angWrap, clamp, dist, el, fmtGap, fmtTime, lerp, mulberry, shade, store };
