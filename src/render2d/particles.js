import { TAU, clamp } from '../config/util.js';
import { R } from './view.js';

const PART = [];
function spawn(x, y, z, vx, vy, vz, life, col, size, kind){
  if(PART.length > 320) PART.shift();
  PART.push({ x, y, z, vx, vy, vz, life, max:life, col, size, kind });
}
function stepParts(dt){
  for(let i = PART.length - 1; i >= 0; i--){
    const p = PART[i];
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    p.vz -= (p.kind === "smoke" ? -1.1 : 16) * dt;
    p.vx *= 0.96; p.vy *= 0.96;
    if(p.z < 0){ p.z = 0; p.vz *= -0.3; }
    p.life -= dt; if(p.life <= 0) PART.splice(i, 1);
  }
}
function drawPart(ctx, p){
  const [sx, sy] = R.P(p.x, p.y, p.z), a = clamp(p.life / p.max, 0, 1);
  const r = p.size * R.zoom * (p.kind === "smoke" ? (1.6 - a) * 1.5 : 1);
  ctx.globalAlpha = a * (p.kind === "smoke" ? 0.42 : 0.9);
  ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(sx, sy, Math.max(0.6, r), 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
}

// a ground pattern that stays put on the ground as the overhead camera moves

export { PART, drawPart, spawn, stepParts };
