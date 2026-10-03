import * as THREE from 'three';
import { G3 } from './g3.js';

/* ---------- 9b. the render pipeline ---------------------------------------
   Three.js ships EffectComposer and UnrealBloomPass as example modules. This
   file has to keep working offline from one document, so nothing can be
   imported and they are written out here instead, against the r128 API. The
   bloom is the same algorithm UnrealBloomPass uses — a luminosity high pass,
   then five successively halved separable gaussians, composited with a falling
   weight — rather than a transcription of that file.

   Colour is handled exactly once, at the very end. The scene renders linear
   into a half-float buffer with the renderer's own tone mapping and output
   encoding switched off; bloom works on those linear values; the combine shader
   does the exposure, ACES and the sRGB transfer on the way out. Nothing else in
   the chain touches either, which is the mistake that is easy to make here.
   ------------------------------------------------------------------------- */
const PP = {
  on:false, rend:null, W:0, H:0,
  LEVELS:5,

  // a full-screen pass: one triangle, no attributes beyond the corners
  quadScene:null, quadCam:null, quadMesh:null,

  vert:`varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,

  init(rend){
    this.rend = rend;
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quadScene = new THREE.Scene();
    this.quadMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
    this.quadMesh.frustumCulled = false;
    this.quadScene.add(this.quadMesh);

    const half = { minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter,
                   format:THREE.RGBAFormat, type:THREE.HalfFloatType,
                   encoding:THREE.LinearEncoding, depthBuffer:true, stencilBuffer:false };
    this.sceneRT = new THREE.WebGLRenderTarget(1, 1, half);
    this.sceneRT.depthBuffer = true;
    this.hiRT = new THREE.WebGLRenderTarget(1, 1, Object.assign({}, half, { depthBuffer:false }));
    this.blurA = []; this.blurB = [];
    for(let i = 0; i < this.LEVELS; i++){
      this.blurA.push(new THREE.WebGLRenderTarget(1, 1, Object.assign({}, half, { depthBuffer:false })));
      this.blurB.push(new THREE.WebGLRenderTarget(1, 1, Object.assign({}, half, { depthBuffer:false })));
    }
    // the tone-mapped image, still needing the edge pass: 8 bit is plenty here
    this.ldrRT = new THREE.WebGLRenderTarget(1, 1, { minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter,
      format:THREE.RGBAFormat, type:THREE.UnsignedByteType, encoding:THREE.LinearEncoding, depthBuffer:false, stencilBuffer:false });

    this.mHi = new THREE.ShaderMaterial({
      uniforms:{ tDiffuse:{ value:null }, threshold:{ value:1.0 }, knee:{ value:0.6 }, scale:{ value:1.0 } },
      vertexShader:this.vert,
      fragmentShader:`uniform sampler2D tDiffuse; uniform float threshold, knee, scale; varying vec2 vUv;
void main(){
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  // a soft knee, so a surface just under the cut does not pop as it crosses it
  float s = clamp(l - threshold + knee, 0.0, 2.0 * knee);
  s = s * s / (4.0 * knee + 1e-4);
  float w = max(s, l - threshold) / max(l, 1e-4);
  gl_FragColor = vec4(c * w * scale, 1.0);
}`});

    this.mBlur = new THREE.ShaderMaterial({
      uniforms:{ tDiffuse:{ value:null }, dir:{ value:new THREE.Vector2(1, 0) }, texel:{ value:new THREE.Vector2() } },
      vertexShader:this.vert,
      fragmentShader:`uniform sampler2D tDiffuse; uniform vec2 dir, texel; varying vec2 vUv;
void main(){
  // a nine-tap gaussian folded into five bilinear fetches
  vec2 o = dir * texel;
  vec3 c = texture2D(tDiffuse, vUv).rgb * 0.2270270270;
  c += texture2D(tDiffuse, vUv + o * 1.3846153846).rgb * 0.3162162162;
  c += texture2D(tDiffuse, vUv - o * 1.3846153846).rgb * 0.3162162162;
  c += texture2D(tDiffuse, vUv + o * 3.2307692308).rgb * 0.0702702703;
  c += texture2D(tDiffuse, vUv - o * 3.2307692308).rgb * 0.0702702703;
  gl_FragColor = vec4(c, 1.0);
}`});

    this.mCombine = new THREE.ShaderMaterial({
      uniforms:{
        tDiffuse:{ value:null },
        b0:{ value:null }, b1:{ value:null }, b2:{ value:null }, b3:{ value:null }, b4:{ value:null },
        strength:{ value:0.9 }, radius:{ value:0.7 }, exposure:{ value:1.0 }, tint:{ value:new THREE.Color(1,1,1) },
      },
      vertexShader:this.vert,
      fragmentShader:`uniform sampler2D tDiffuse, b0, b1, b2, b3, b4;
uniform float strength, radius, exposure; uniform vec3 tint; varying vec2 vUv;
float lw(float f){ return mix(1.0, 1.2 - f, radius); }
// ACES, in the fitted form that runs cheaply in a fragment shader
vec3 aces(vec3 x){
  const mat3 IN = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 OUT = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  vec3 v = IN * x;
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return clamp(OUT * (a / b), 0.0, 1.0);
}
void main(){
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  vec3 bl = lw(0.0) * texture2D(b0, vUv).rgb
          + lw(0.2) * texture2D(b1, vUv).rgb
          + lw(0.4) * texture2D(b2, vUv).rgb
          + lw(0.6) * texture2D(b3, vUv).rgb
          + lw(0.8) * texture2D(b4, vUv).rgb;
  c += bl * strength * tint;
  c = aces(c * exposure);
  // the sRGB transfer, done here and nowhere else in the chain
  vec3 s = mix(c * 12.92, 1.055 * pow(max(c, vec3(1e-5)), vec3(0.41666)) - 0.055, step(vec3(0.0031308), c));
  gl_FragColor = vec4(s, 1.0);
}`});

    this.mFxaa = new THREE.ShaderMaterial({
      uniforms:{ tDiffuse:{ value:null }, texel:{ value:new THREE.Vector2() } },
      vertexShader:this.vert,
      fragmentShader:`uniform sampler2D tDiffuse; uniform vec2 texel; varying vec2 vUv;
// a compact FXAA: find the local edge, step along it, keep whichever of the
// blurred and the original pair sits inside the neighbourhood's range
void main(){
  vec3 rgbNW = texture2D(tDiffuse, vUv + vec2(-1.0, -1.0) * texel).rgb;
  vec3 rgbNE = texture2D(tDiffuse, vUv + vec2( 1.0, -1.0) * texel).rgb;
  vec3 rgbSW = texture2D(tDiffuse, vUv + vec2(-1.0,  1.0) * texel).rgb;
  vec3 rgbSE = texture2D(tDiffuse, vUv + vec2( 1.0,  1.0) * texel).rgb;
  vec4 texM  = texture2D(tDiffuse, vUv);
  vec3 L = vec3(0.299, 0.587, 0.114);
  float lNW = dot(rgbNW, L), lNE = dot(rgbNE, L), lSW = dot(rgbSW, L), lSE = dot(rgbSE, L), lM = dot(texM.rgb, L);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  if(lMax - lMin < max(0.0833, lMax * 0.166)){ gl_FragColor = texM; return; }
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
  float red = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);
  float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);
  dir = clamp(dir * rcp, -8.0, 8.0) * texel;
  vec3 rgbA = 0.5 * (texture2D(tDiffuse, vUv + dir * (1.0/3.0 - 0.5)).rgb +
                     texture2D(tDiffuse, vUv + dir * (2.0/3.0 - 0.5)).rgb);
  vec3 rgbB = rgbA * 0.5 + 0.25 * (texture2D(tDiffuse, vUv - dir * 0.5).rgb +
                                   texture2D(tDiffuse, vUv + dir * 0.5).rgb);
  float lB = dot(rgbB, L);
  gl_FragColor = vec4((lB < lMin || lB > lMax) ? rgbA : rgbB, texM.a);
}`});

    this.ready = true;
    return this;
  },

  size(w, h){
    if(w === this.W && h === this.H) return;
    this.W = w; this.H = h;
    this.sceneRT.setSize(w, h);
    this.ldrRT.setSize(w, h);
    let bw = Math.max(1, Math.round(w / 2)), bh = Math.max(1, Math.round(h / 2));
    this.hiRT.setSize(bw, bh);
    for(let i = 0; i < this.LEVELS; i++){
      this.blurA[i].setSize(bw, bh); this.blurB[i].setSize(bw, bh);
      bw = Math.max(1, Math.round(bw / 2)); bh = Math.max(1, Math.round(bh / 2));
    }
  },

  blit(mat, target){
    this.quadMesh.material = mat;
    this.rend.setRenderTarget(target || null);
    this.rend.render(this.quadScene, this.quadCam);
  },

  /* scene in, canvas out */
  render(scene, cam, opt){
    const r = this.rend;
    const w = r.domElement.width, h = r.domElement.height;
    this.size(w, h);

    // 1. the world, linear, untouched by the renderer's own colour steps
    const oTone = r.toneMapping, oEnc = r.outputEncoding;
    r.toneMapping = THREE.NoToneMapping; r.outputEncoding = THREE.LinearEncoding;
    r.setRenderTarget(this.sceneRT);
    r.clear();
    r.render(scene, cam);

    // 2. what is bright enough to bloom
    this.mHi.uniforms.tDiffuse.value = this.sceneRT.texture;
    this.mHi.uniforms.threshold.value = opt.threshold;
    this.mHi.uniforms.knee.value = opt.knee == null ? 0.5 : opt.knee;
    this.blit(this.mHi, this.hiRT);

    // 3. five halvings, each blurred along both axes
    let src = this.hiRT;
    for(let i = 0; i < this.LEVELS; i++){
      const a = this.blurA[i], b = this.blurB[i];
      this.mBlur.uniforms.tDiffuse.value = src.texture;
      this.mBlur.uniforms.dir.value.set(1, 0);
      this.mBlur.uniforms.texel.value.set(1 / a.width, 1 / a.height);
      this.blit(this.mBlur, a);
      this.mBlur.uniforms.tDiffuse.value = a.texture;
      this.mBlur.uniforms.dir.value.set(0, 1);
      this.blit(this.mBlur, b);
      src = b;
    }

    // 4. composite, expose, tone map, encode — the only place colour changes
    const u = this.mCombine.uniforms;
    u.tDiffuse.value = this.sceneRT.texture;
    for(let i = 0; i < this.LEVELS; i++) u["b" + i].value = this.blurB[i].texture;
    u.strength.value = opt.strength; u.radius.value = opt.radius; u.exposure.value = opt.exposure;
    this.blit(this.mCombine, opt.fxaa === false ? null : this.ldrRT);

    // 5. edges
    if(opt.fxaa !== false){
      this.mFxaa.uniforms.tDiffuse.value = this.ldrRT.texture;
      this.mFxaa.uniforms.texel.value.set(1 / w, 1 / h);
      this.blit(this.mFxaa, null);
    }
    r.setRenderTarget(null);
    r.toneMapping = oTone; r.outputEncoding = oEnc;
  },

  dispose(){
    if(!this.ready) return;
    for(const rt of [this.sceneRT, this.hiRT, this.ldrRT].concat(this.blurA, this.blurB)) rt.dispose();
  },
};

/* A small procedural room, filtered into an environment map. Glass and metal
   need something to reflect or they read as flat paint; this is what gives the
   towers their sheen. It is never used as a background. */
function buildEnv(rend, night, P){
  const pm = new THREE.PMREMGenerator(rend);
  pm.compileEquirectangularShader();
  const s = new THREE.Scene();
  const box = (col, x, y, z, w, h, d, emissive) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color:G3.col(col), roughness:1, metalness:0,
        emissive:G3.col(emissive || "#000000"), emissiveIntensity:emissive ? 1 : 0, side:THREE.BackSide }));
    m.position.set(x, y, z); s.add(m); return m;
  };
  if(night){
    /* A dark desert sky with the city's glow coming up from below. Everything
       warm has to sit under the horizon: a bright surface anywhere overhead
       lights every roof in the scene, which is not what a night sky does. */
    box("#05040A", 0, 0, 0, 900, 900, 900);                  // the sky, all round
    box("#000000", 0, -300, 0, 880, 10, 880, "#4A3418");     // the glow off the ground
    box("#000000", 0, -150, -430, 880, 260, 10, "#2A1830");  // and off the Strip, low down
    box("#000000", -430, -150, 0, 10, 240, 880, "#301022");
    box("#000000", 430, -150, 0, 10, 240, 880, "#0E2438");
  } else {
    box("#9FB6D4", 0, 0, 0, 900, 900, 900);
    box("#000000", 0, 400, 0, 880, 10, 880, "#C8D8EE");      // the sky
    box("#000000", 0, -300, 0, 880, 10, 880, G3.cssGround || "#6E7460");
    box("#000000", 240, 260, 240, 160, 160, 160, "#FFF2D8"); // the sun's quarter
  }
  const rt = pm.fromScene(s, 0.04, 1, 1200);
  s.traverse(o => { if(o.isMesh){ o.geometry.dispose(); o.material.dispose(); } });
  pm.dispose();
  return rt;
}


export { PP, buildEnv };
