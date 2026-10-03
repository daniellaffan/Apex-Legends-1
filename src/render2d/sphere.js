import { TAU, clamp } from '../config/util.js';

const SPHERE = {
  /* The Sphere's screen.

     Drawing straight onto an equirectangular sheet was the wrong idea: every
     circle has to be pre-distorted by hand, and anything near the crown gets
     smeared into the pole no matter how carefully it is drawn. So this is a
     flat poster — a square canvas drawn exactly as you would draw a picture —
     and the projection onto the ball happens in the shader, orthographically
     about a point tilted up to meet the camera.

     Orthographic is the right projection here because the isometric camera
     looks down the tilt axis: the poster reads undistorted from the seat and
     curves away naturally at the limb, which is what the real Exosphere does
     with flat video. The picture is fixed to the building and never turns.

     Only the inscribed circle of the canvas is ever sampled — the corners fall
     off the back of the ball — and the visible face reaches about r = 0.83 of
     the radius, so content lives inside r = 0.78. */
  loop:["emoji", "eyeball", "welcome", "f1brand", "moon", "waves", "flag", "fireworks"],
  W:1024, H:1024,
  TILT:36 * Math.PI / 180,          // where the poster faces: the camera's elevation
  SCALE:1.0,                        // 1 = the poster's disc is the whole hemisphere

  // handy shorthands for the painters: centre, and a radius fraction
  C(){ return this.W / 2; },
  r(f){ return this.W * 0.5 * f; },

  paint(g, S){
    const W = this.W, H = this.H, C = W / 2;
    const intro = this.introPhase(S);
    g.save();
    g.fillStyle = "#06050C"; g.fillRect(0, 0, W, H);
    if(intro != null) this.f1intro(g, W, H, intro, S);
    else {
      const per = 11, k = Math.floor(S.clock / per) % this.loop.length, t = S.clock % per;
      const fade = t < 0.7 ? t / 0.7 : t > per - 0.7 ? (per - t) / 0.7 : 1;
      g.globalAlpha = fade;
      this[this.loop[k]](g, W, H, t, S);
      g.globalAlpha = 1;
    }
    // the very edge of the picture dies away, so nothing ends on a hard line
    const vg = g.createRadialGradient(C, C, this.r(0.70), C, C, this.r(1.0));
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(0.55, "rgba(0,0,0,0.35)");
    vg.addColorStop(1, "rgba(0,0,0,0.9)");
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    g.restore();
  },

  // how far into the race-start show we are, or null when it is not running
  introPhase(S){
    if(S.state === "lights") return S.clock;                 // 0 .. 5.1
    if(S.state === "run" && S.clock < 6.0) return 5.1 + S.clock;
    return null;
  },
  // what the Sphere is throwing onto everything around it
  glowOf(S){
    const intro = this.introPhase(S);
    if(intro != null) return intro < 5.1 ? 0xE8221A : 0xFFFFFF;
    const k = Math.floor(S.clock / 11) % this.loop.length;
    return [0xFFC85A, 0xE8ECF4, 0xFF3D92, 0xE8221A, 0xC8C4B8, 0x6ADCFF, 0xF2F2F2, 0xFFB03A][k];
  },

  /* ---- the race start: the Formula 1 opener ---- */
  f1intro(g, W, H, t, S){
    const C = W / 2;
    g.fillStyle = "#08070C"; g.fillRect(0, 0, W, H);
    // speed streaks sweeping across, building the whole way through
    const rush = clamp(t / 1.6, 0, 1) * (t > 8.4 ? clamp((10 - t) / 1.6, 0, 1) : 1);
    for(let i = 0; i < 26; i++){
      const y = (i * 61 + (t * 320) % H) % H;
      const len = (140 + (i % 5) * 190) * rush;
      const x = ((i * 137.5) % 360) / 360 * W;
      g.globalAlpha = 0.16 + 0.34 * ((i % 3) / 2);
      g.fillStyle = i % 4 === 0 ? "#FFFFFF" : "#E8221A";
      g.fillRect(x - len, y, len, 4 + (i % 3) * 2);
    }
    g.globalAlpha = 1;
    if(t < 1.1){
      g.fillStyle = "rgba(232,34,26," + (0.5 * (1 - t / 1.1)).toFixed(3) + ")";
      g.fillRect(0, 0, W, H);
    }
    if(t > 0.8 && t < 5.1){
      const a = clamp((t - 0.8) / 0.9, 0, 1);
      this.f1mark(g, C, C - this.r(0.22), this.r(0.30) * (0.7 + 0.3 * a), a);
    }
    if(t > 2.0 && t < 5.1){
      const a = clamp((t - 2.0) / 0.5, 0, 1), slide = (1 - a) * 260;
      g.globalAlpha = a;
      g.fillStyle = "#FFFFFF"; g.textAlign = "center"; g.textBaseline = "middle";
      g.font = "800 " + this.r(0.155).toFixed(0) + "px 'Saira Condensed',sans-serif";
      g.fillText("LAS VEGAS", C - slide, C + this.r(0.16));
      if(t > 2.4){
        const a2 = clamp((t - 2.4) / 0.5, 0, 1); g.globalAlpha = a2;
        g.fillText("GRAND PRIX", C + (1 - a2) * 260, C + this.r(0.34));
      }
      g.globalAlpha = 1;
    }
    if(t > 3.3 && t < 5.15){
      const lit = Math.min(5, Math.floor((t - 3.3) / 0.36));
      for(let i = 0; i < 5; i++){
        const x = C + (i - 2) * this.r(0.155), y = C - this.r(0.50);
        g.fillStyle = i < lit ? "#FF2418" : "#241014";
        g.beginPath(); g.arc(x, y, this.r(0.055), 0, TAU); g.fill();
        if(i < lit){
          const rg = g.createRadialGradient(x, y, 0, x, y, this.r(0.15));
          rg.addColorStop(0, "rgba(255,50,30,.55)"); rg.addColorStop(1, "rgba(255,50,30,0)");
          g.fillStyle = rg; g.beginPath(); g.arc(x, y, this.r(0.15), 0, TAU); g.fill();
        }
      }
    }
    if(t >= 5.1){
      const s = t - 5.1;
      if(s < 0.5){ g.fillStyle = "rgba(255,255,255," + (1 - s / 0.5).toFixed(3) + ")"; g.fillRect(0, 0, W, H); }
      if(s > 0.25 && s < 3.2){
        const a = clamp((s - 0.25) / 0.3, 0, 1) * clamp((3.2 - s) / 0.6, 0, 1);
        g.globalAlpha = a;
        g.fillStyle = "#FFFFFF"; g.textAlign = "center"; g.textBaseline = "middle";
        g.font = "800 " + this.r(0.42).toFixed(0) + "px 'Saira Condensed',sans-serif";
        g.fillText("GO", C, C);
        g.globalAlpha = 1;
      }
      if(s > 3.0){
        const a = clamp((s - 3.0) / 0.6, 0, 1);
        g.globalAlpha = a; this.f1mark(g, C, C, this.r(0.34), 1); g.globalAlpha = 1;
      }
    }
  },

  // the speed mark: a bold slanted F and 1, then the streaks off the back
  f1mark(g, cx, cy, h, a){
    g.save(); g.translate(cx, cy);
    g.fillStyle = "#FFFFFF"; g.textAlign = "right"; g.textBaseline = "middle";
    g.font = "800 italic " + h.toFixed(0) + "px 'Saira Condensed',sans-serif";
    g.fillText("F1", h * 0.30, 0);
    g.fillStyle = "#E8221A";
    for(let i = 0; i < 5; i++){
      const w = (h * 1.05 - i * h * 0.17) * a, y = -h * 0.36 + i * h * 0.175, th = h * 0.11;
      g.beginPath();
      g.moveTo(h * 0.40, y); g.lineTo(h * 0.40 + w, y - th * 0.25);
      g.lineTo(h * 0.40 + w - th * 0.6, y + th * 0.8); g.lineTo(h * 0.40, y + th);
      g.closePath(); g.fill();
    }
    g.restore();
  },

  /* ---- the yellow face ---- */
  emoji(g, W, H, t){
    const C = W / 2, R = this.r(0.80);
    const gd = g.createRadialGradient(C - R * 0.3, C - R * 0.35, R * 0.05, C, C, R * 1.2);
    gd.addColorStop(0, "#FFF08A"); gd.addColorStop(0.55, "#FFC400"); gd.addColorStop(1, "#E08A00");
    g.fillStyle = gd; g.fillRect(0, 0, W, H);

    const mood = Math.floor(t / 3.6) % 3;            // surprised, happy, suspicious
    const blink = (t % 2.9) > 2.76;
    const look = Math.sin(t * 0.7) * this.r(0.022);
    const ex = this.r(0.235), ey = C - this.r(0.10), er = this.r(0.145);
    for(const sd of [-1, 1]){
      const x = C + sd * ex;
      g.fillStyle = "#FFFFFF";
      g.beginPath(); g.ellipse(x, ey, er, blink ? er * 0.10 : er * 1.04, 0, 0, TAU); g.fill();
      if(!blink){
        g.fillStyle = "#14100A";
        g.beginPath(); g.arc(x + look, ey + er * 0.10, er * 0.50, 0, TAU); g.fill();
        g.fillStyle = "#FFFFFF";
        g.beginPath(); g.arc(x + look - er * 0.18, ey - er * 0.14, er * 0.17, 0, TAU); g.fill();
      }
      // the brow, set by the mood
      g.strokeStyle = "#2E2006"; g.lineWidth = this.r(0.042); g.lineCap = "round";
      const by = ey - er * (mood === 2 ? 1.5 : 1.35);
      const tilt = mood === 2 ? sd * this.r(0.035) : mood === 0 ? -this.r(0.012) : 0;
      g.beginPath();
      g.moveTo(x - er * 0.95, by + tilt);
      g.quadraticCurveTo(x, by - er * (mood === 0 ? 0.42 : 0.26) + tilt * 0.4, x + er * 0.95, by - tilt);
      g.stroke();
    }
    // the cheeks
    g.fillStyle = "rgba(255,120,110,.34)";
    for(const sd of [-1, 1]){
      g.beginPath();
      g.ellipse(C + sd * this.r(0.40), C + this.r(0.08), this.r(0.11), this.r(0.075), 0, 0, TAU);
      g.fill();
    }
    // the mouth
    const my = C + this.r(0.26);
    g.fillStyle = "#3A2A08"; g.strokeStyle = "#3A2A08"; g.lineCap = "round";
    if(mood === 0){
      g.beginPath(); g.ellipse(C, my, this.r(0.085), this.r(0.125), 0, 0, TAU); g.fill();
    } else if(mood === 1){
      g.beginPath(); g.arc(C, my - this.r(0.10), this.r(0.21), 0.30, Math.PI - 0.30); g.fill();
      g.fillStyle = "#FF8894";
      g.beginPath(); g.ellipse(C, my + this.r(0.055), this.r(0.10), this.r(0.045), 0, 0, TAU); g.fill();
    } else {
      g.lineWidth = this.r(0.046);
      g.beginPath(); g.moveTo(C - this.r(0.16), my); g.lineTo(C + this.r(0.11), my - this.r(0.035)); g.stroke();
    }
  },

  /* ---- the eye: the one everybody photographs ---- */
  eyeball(g, W, H, t){
    const C = W / 2;
    g.fillStyle = "#E4E0D6"; g.fillRect(0, 0, W, H);
    // the veins, faint and asymmetric, kept out to the edges
    g.strokeStyle = "rgba(186,66,58,.28)"; g.lineCap = "round";
    for(let i = 0; i < 34; i++){
      const a = (i * 137.5) * Math.PI / 180, r0 = this.r(0.50 + (i % 5) * 0.06);
      g.lineWidth = 2 + (i % 3) * 2;
      g.beginPath();
      g.moveTo(C + Math.cos(a) * r0, C + Math.sin(a) * r0);
      for(let k = 1; k < 5; k++){
        const rr = r0 - k * this.r(0.055), aa = a + Math.sin(i + k) * 0.20;
        g.lineTo(C + Math.cos(aa) * rr, C + Math.sin(aa) * rr);
      }
      g.stroke();
    }
    const look = Math.sin(t * 0.55) * this.r(0.10), lookY = Math.cos(t * 0.37) * this.r(0.05);
    const blink = (t % 4.3) > 4.12;
    const ir = this.r(0.34);
    if(!blink){
      const ix = C + look, iy = C + lookY;
      g.fillStyle = "#06202E";
      g.beginPath(); g.arc(ix, iy, ir * 1.06, 0, TAU); g.fill();
      const gd = g.createRadialGradient(ix, iy, ir * 0.12, ix, iy, ir);
      gd.addColorStop(0, "#5FD8E8"); gd.addColorStop(0.55, "#1A78A8"); gd.addColorStop(1, "#0A3C5E");
      g.fillStyle = gd;
      g.beginPath(); g.arc(ix, iy, ir, 0, TAU); g.fill();
      g.strokeStyle = "rgba(180,240,255,.26)"; g.lineWidth = 3;
      for(let i = 0; i < 52; i++){
        const a = i / 52 * TAU;
        g.beginPath();
        g.moveTo(ix + Math.cos(a) * ir * 0.40, iy + Math.sin(a) * ir * 0.40);
        g.lineTo(ix + Math.cos(a) * ir * 0.94, iy + Math.sin(a) * ir * 0.94);
        g.stroke();
      }
      const pr = ir * (0.36 + 0.05 * Math.sin(t * 1.3));
      g.fillStyle = "#050608";
      g.beginPath(); g.arc(ix, iy, pr, 0, TAU); g.fill();
      g.fillStyle = "rgba(255,255,255,.90)";
      g.beginPath(); g.ellipse(ix - pr * 0.44, iy - pr * 0.50, pr * 0.34, pr * 0.26, -0.5, 0, TAU); g.fill();
    } else {
      g.fillStyle = "#D8D2C6"; g.fillRect(0, 0, W, H);
      g.strokeStyle = "#9A8E7E"; g.lineWidth = this.r(0.02);
      g.beginPath(); g.moveTo(C - this.r(0.5), C); g.lineTo(C + this.r(0.5), C); g.stroke();
    }
  },

  /* ---- the Welcome to Fabulous Las Vegas sign ---- */
  welcome(g, W, H, t){
    const C = W / 2;
    g.fillStyle = "#10061C"; g.fillRect(0, 0, W, H);
    // the starburst behind it
    g.save(); g.translate(C, C);
    for(let i = 0; i < 24; i++){
      g.rotate(TAU / 24);
      g.fillStyle = i % 2 ? "rgba(255,60,140,.24)" : "rgba(60,200,255,.18)";
      g.beginPath(); g.moveTo(0, 0);
      g.lineTo(this.r(1.0), -this.r(0.06)); g.lineTo(this.r(1.0), this.r(0.06));
      g.closePath(); g.fill();
    }
    g.restore();
    // the diamond
    const dw = this.r(0.60), dh = this.r(0.72);
    const dia = (sx, sy) => {
      g.beginPath();
      g.moveTo(C, C - sy); g.lineTo(C + sx, C); g.lineTo(C, C + sy); g.lineTo(C - sx, C);
      g.closePath();
    };
    g.fillStyle = "#123A8E"; dia(dw * 1.10, dh * 1.10); g.fill();
    g.fillStyle = "#F4F0E2"; dia(dw, dh); g.fill();
    g.strokeStyle = "#123A8E"; g.lineWidth = this.r(0.018); dia(dw * 0.93, dh * 0.93); g.stroke();
    // the bulbs round the rim, chasing
    const NB = 40;
    for(let i = 0; i < NB; i++){
      const f = i / NB, q = Math.floor(f * 4), s = (f * 4) % 1;
      const pts = [[0, -dh * 1.05], [dw * 1.05, 0], [0, dh * 1.05], [-dw * 1.05, 0]];
      const a = pts[q], b = pts[(q + 1) % 4];
      const x = C + a[0] + (b[0] - a[0]) * s, y = C + a[1] + (b[1] - a[1]) * s;
      const on = ((i + Math.floor(t * 7)) % 3) !== 0;
      g.fillStyle = on ? "#FFE9A8" : "#6A5A38";
      g.beginPath(); g.arc(x, y, this.r(0.016), 0, TAU); g.fill();
    }
    // the red circle at the top
    g.fillStyle = "#C8202E";
    g.beginPath(); g.ellipse(C, C - dh * 0.62, this.r(0.075), this.r(0.095), 0, 0, TAU); g.fill();
    g.fillStyle = "#F4F0E2"; g.textAlign = "center"; g.textBaseline = "middle";
    g.font = "800 " + this.r(0.045).toFixed(0) + "px 'Saira Condensed',sans-serif";
    g.fillText("LAS", C, C - dh * 0.67); g.fillText("VEGAS", C, C - dh * 0.56);
    // the wording
    g.fillStyle = "#123A8E";
    g.font = "700 " + this.r(0.072).toFixed(0) + "px 'Saira Condensed',sans-serif";
    g.fillText("WELCOME", C, C - dh * 0.30);
    g.fillText("TO FABULOUS", C, C - dh * 0.10);
    g.fillStyle = "#C8202E";
    g.font = "800 " + this.r(0.135).toFixed(0) + "px 'Saira Condensed',sans-serif";
    g.fillText("LAS VEGAS", C, C + dh * 0.16);
    g.fillStyle = "#123A8E";
    g.font = "700 " + this.r(0.075).toFixed(0) + "px 'Saira Condensed',sans-serif";
    g.fillText("NEVADA", C, C + dh * 0.40);
  },

  /* ---- the Grand Prix card ---- */
  f1brand(g, W, H, t){
    const C = W / 2;
    g.fillStyle = "#0A0710"; g.fillRect(0, 0, W, H);
    // a slow sweep of red across the back
    const sw = ((t * 0.16) % 1) * W * 2 - W * 0.5;
    const lg = g.createLinearGradient(sw - W * 0.4, 0, sw + W * 0.4, 0);
    lg.addColorStop(0, "rgba(232,34,26,0)"); lg.addColorStop(0.5, "rgba(232,34,26,0.30)");
    lg.addColorStop(1, "rgba(232,34,26,0)");
    g.fillStyle = lg; g.fillRect(0, 0, W, H);
    this.f1mark(g, C - this.r(0.12), C - this.r(0.26), this.r(0.30), 1);
    g.fillStyle = "#FFFFFF"; g.textAlign = "center"; g.textBaseline = "middle";
    g.font = "800 " + this.r(0.155).toFixed(0) + "px 'Saira Condensed',sans-serif";
    g.fillText("LAS VEGAS", C, C + this.r(0.14));
    g.font = "800 " + this.r(0.155).toFixed(0) + "px 'Saira Condensed',sans-serif";
    g.fillText("GRAND PRIX", C, C + this.r(0.33));
    g.fillStyle = "#E8221A";
    g.fillRect(C - this.r(0.30), C + this.r(0.02), this.r(0.60), this.r(0.012));
    g.fillStyle = "#9AA4B8";
    g.font = "600 " + this.r(0.055).toFixed(0) + "px 'Saira Condensed',sans-serif";
    g.fillText("ROUND 22 · UNDER THE LIGHTS", C, C + this.r(0.48));
  },

  /* ---- a moon rolling round the ball ---- */
  moon(g, W, H, t){
    const C = W / 2;
    g.fillStyle = "#04060E"; g.fillRect(0, 0, W, H);
    for(let i = 0; i < 260; i++){
      const x = ((i * 733 + t * 30) % W), y = (i * 421) % H;
      const a = 0.25 + 0.65 * ((i % 7) / 6);
      g.fillStyle = "rgba(200,220,255," + a.toFixed(2) + ")";
      const s = 2 + (i % 3 === 0 ? 2 : 0);
      g.fillRect(x, y, s, s);
    }
    const mx = C + Math.sin(t * 0.22) * this.r(0.30), my = C - this.r(0.04);
    const r = this.r(0.40);
    const gd = g.createRadialGradient(mx - r * 0.35, my - r * 0.35, r * 0.1, mx, my, r);
    gd.addColorStop(0, "#FFFCF0"); gd.addColorStop(0.6, "#D8D2C2"); gd.addColorStop(1, "#8E8A80");
    g.fillStyle = gd; g.beginPath(); g.arc(mx, my, r, 0, TAU); g.fill();
    g.fillStyle = "rgba(120,116,108,.42)";
    for(const [a, b, rr] of [[-0.34, -0.22, 0.22], [0.26, 0.10, 0.16], [-0.10, 0.36, 0.13],
                             [0.44, -0.36, 0.10], [0.06, -0.06, 0.19], [-0.46, 0.14, 0.11]]){
      g.beginPath(); g.ellipse(mx + a * r, my + b * r, rr * r, rr * r * 0.92, 0, 0, TAU); g.fill();
    }
  },

  /* ---- abstract colour, which is most of what it actually shows ---- */
  waves(g, W, H, t){
    const C = W / 2;
    g.fillStyle = "#05030E"; g.fillRect(0, 0, W, H);
    const band = ["#FF2E88", "#7A2BFF", "#00C8FF", "#00FFB4", "#FFD400", "#FF6A2A"];
    for(let k = 0; k < 7; k++){
      const ph = t * (0.5 + k * 0.13) + k * 1.7;
      g.beginPath(); g.moveTo(0, H);
      for(let x = 0; x <= W; x += 10){
        const u = x / W * TAU;
        const y = C + Math.sin(u * (2 + k % 3) + ph) * this.r(0.20)
                    + Math.sin(u * 5 - ph * 1.4) * this.r(0.07)
                    + (k - 3) * this.r(0.11);
        g.lineTo(x, y);
      }
      g.lineTo(W, H); g.closePath();
      g.globalAlpha = 0.55; g.fillStyle = band[k % band.length]; g.fill();
    }
    g.globalAlpha = 1;
    g.strokeStyle = "rgba(255,255,255,.85)"; g.lineWidth = this.r(0.018);
    g.beginPath();
    for(let x = 0; x <= W; x += 8){
      const u = x / W * TAU;
      const y = C - this.r(0.06) + Math.sin(u * 2 + t * 0.9) * this.r(0.22) + Math.sin(u * 7 - t) * this.r(0.04);
      x ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke();
  },

  /* ---- the chequered flag, rippling ---- */
  flag(g, W, H, t){
    const C = W / 2;
    g.fillStyle = "#0A0A0E"; g.fillRect(0, 0, W, H);
    const cell = this.r(0.125);
    for(let r = -5; r < 10; r++) for(let c = -5; c < 10; c++){
      if((r + c) % 2) continue;
      const x0 = c * cell, y0 = r * cell;
      g.fillStyle = "#F4F4F6";
      g.beginPath();
      for(let i = 0; i <= 6; i++){
        const x = x0 + cell * i / 6;
        g.lineTo(x, y0 + Math.sin(x * 0.012 + t * 2.4) * cell * 0.28);
      }
      for(let i = 6; i >= 0; i--){
        const x = x0 + cell * i / 6;
        g.lineTo(x, y0 + cell + Math.sin(x * 0.012 + t * 2.4) * cell * 0.28);
      }
      g.closePath(); g.fill();
    }
    // a shadow in the troughs, so it reads as cloth rather than tiles
    for(let x = 0; x < W; x += 6){
      const s = Math.sin(x * 0.012 + t * 2.4);
      g.fillStyle = "rgba(0,0,0," + (0.30 * Math.max(0, -s)).toFixed(3) + ")";
      g.fillRect(x, 0, 6, H);
    }
  },

  /* ---- fireworks ---- */
  fireworks(g, W, H, t){
    const C = W / 2;
    g.fillStyle = "#05040C"; g.fillRect(0, 0, W, H);
    const cols = ["#FFD24A", "#FF3D92", "#6ADCFF", "#9AFF6A", "#FF8A3A", "#D89AFF"];
    for(let b = 0; b < 7; b++){
      const born = (b * 1.7) % 5.5;
      const life = ((t - born) % 5.5) / 2.4;
      if(life < 0 || life > 1) continue;
      const bx = C + Math.sin(b * 2.3) * this.r(0.42);
      const by = C + Math.cos(b * 1.7) * this.r(0.36);
      const rad = this.r(0.10 + 0.30 * Math.sqrt(life));
      const col = cols[b % cols.length];
      g.globalAlpha = (1 - life) * 0.95;
      g.fillStyle = col;
      for(let i = 0; i < 26; i++){
        const a = i / 26 * TAU + b;
        const rr = this.r(0.012) * (1 - life * 0.6);
        g.beginPath();
        g.arc(bx + Math.cos(a) * rad, by + Math.sin(a) * rad + life * this.r(0.05), rr, 0, TAU);
        g.fill();
        g.beginPath();
        g.arc(bx + Math.cos(a) * rad * 0.66, by + Math.sin(a) * rad * 0.66, rr * 0.7, 0, TAU);
        g.fill();
      }
      const gd = g.createRadialGradient(bx, by, 0, bx, by, rad * 1.3);
      gd.addColorStop(0, col.replace(")", "")); gd.addColorStop(0, col);
      gd.addColorStop(1, "rgba(0,0,0,0)");
      g.globalAlpha = (1 - life) * 0.22;
      g.fillStyle = gd; g.beginPath(); g.arc(bx, by, rad * 1.3, 0, TAU); g.fill();
    }
    g.globalAlpha = 1;
  },
};


export { SPHERE };
