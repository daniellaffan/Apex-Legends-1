import { $, TAU, shade } from '../config/util.js';

/* ---------- minimap ---------- */
function drawMini(S){
  const cv = $("#mini"), ctx = cv.getContext("2d"), T = S.track, n = T.n;
  const sz = cv.width, pad = 10;
  ctx.clearRect(0, 0, sz, sz);
  const b = T.bounds, sc = Math.min((sz - pad * 2) / b.w, (sz - pad * 2) / b.h);
  const mx = (sz - b.w * sc) / 2 - b.minX * sc, my = (sz - b.h * sc) / 2 - b.minY * sc;
  ctx.strokeStyle = "#39424D"; ctx.lineWidth = 5; ctx.lineJoin = "round";
  ctx.beginPath();
  for(let i = 0; i <= n; i++){ const k = i % n; const x = T.x[k] * sc + mx, y = T.y[k] * sc + my;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.closePath(); ctx.stroke();
  ctx.strokeStyle = "#151A21"; ctx.lineWidth = 2.6; ctx.stroke();
  ctx.fillStyle = "#F0F0F0"; ctx.fillRect(T.x[0] * sc + mx - 2, T.y[0] * sc + my - 2, 4, 4);
  const k = S.sc && S.sc.car;
  if(k){ ctx.fillStyle = "#FFC21A"; ctx.beginPath(); ctx.arc(k.x * sc + mx, k.y * sc + my, 3, 0, TAU); ctx.fill(); }
  for(const c of S.cars){
    if(c.dnf) continue;
    const me = c === S.player;
    ctx.fillStyle = me ? "#FFA51F" : shade(c.team.body, 0.1);
    ctx.beginPath(); ctx.arc(c.x * sc + mx, c.y * sc + my, me ? 3.4 : 2.2, 0, TAU); ctx.fill();
    if(me){ ctx.strokeStyle = "#0B0E12"; ctx.lineWidth = 1; ctx.stroke(); }
  }
}

export { drawMini };
