/**
 * Living Flow — the Weirwise signature visual (ADR-013, brief §2).
 *
 * Raw WebGL2 rather than three.js: the landing page ships 143 kB of First Load
 * JS today and adding a 3D library to draw one object would roughly double it
 * (§10 forbids heavy dependencies without justification). The whole signature
 * is one parametrised curve, so the curve lives in the vertex shader and every
 * ribbon shares a single 900-vertex grid. Animating costs no CPU.
 *
 * The palette is read from `--flow-1`…`--flow-7`, so the artwork and the design
 * system cannot drift apart.
 */

const SEG = 150;
const ACROSS = 6;
/** Seven bands: enough to read as a group, few enough to stay legible at 390 px. */
const RIBBONS = 7;
/** Particles ride the same centerline, so they inherit its motion for free. */
const MAX_PARTICLES = 190;

const VIEW_DIST = 2.55;
/** Frames the sweep into the viewport: 2.45 was measured, not estimated. */
const YARD = 2.45;

const FALLBACK_PALETTE = [
  [0.208, 0.812, 0.753],
  [0.149, 0.78, 0.902],
  [0.184, 0.427, 1.0],
  [0.537, 0.341, 0.898],
  [0.847, 0.357, 0.667],
  [1.0, 0.471, 0.404],
  [1.0, 0.776, 0.659],
];

export interface FlowConfig {
  particles: number;
  /** Contour lines across the ribbon. 16 sits below the shimmer threshold. */
  lineCount: number;
  lineWeight: number;
  fill: number;
  glow: number;
  sheen: number;
  width: number;
  twist: number;
  /** Ribbon spacing across the brand ramp — a hair over a fifth keeps every lane distinct. */
  hueSpread: number;
  drift: number;
  pointSize: number;
}

export const FLOW_CONFIG: FlowConfig = {
  particles: MAX_PARTICLES,
  lineCount: 16,
  lineWeight: 0.11,
  fill: 0.34,
  glow: 0.85,
  sheen: 0.85,
  width: 0.3,
  twist: 1.4,
  hueSpread: 0.055,
  drift: 1,
  pointSize: 4,
};

/* Shared GLSL. `precision highp float;` deliberately does NOT live here: this
   block is spliced in after the `in`/`out` declarations of each shader, and a
   fragment shader in GLSL ES 3.00 has no default float precision, so every
   shader states its own at the top. */
const HELPERS = `
#define TAU 6.28318530718
uniform vec3 uPalette[7];

vec3 palette(float x){
  float p = fract(x) * 7.0;
  int i = int(floor(p));
  float f = smoothstep(0.0, 1.0, fract(p));
  // Clamped, not wrapped: the ramp ends on peach, and cycling it back to
  // turquoise would put a visible seam in the middle of a hero.
  vec3 a = uPalette[clamp(i, 0, 6)];
  vec3 b = uPalette[min(i + 1, 6)];
  return mix(a, b, f);
}

// One open sweep, shared by the ribbon surfaces and the particles that ride them.
// Half-cycle waves only: the lanes arc through the frame and never return on
// themselves, which is what keeps this reading as flow rather than as a knot.
vec3 centerline(float t, float seed, float time){
  float lane = floor(seed * 0.729927 + 0.5);   // seed = i * 1.37  ->  i
  float ph = lane * 0.85;
  float w = t * 3.14159265;
  float x = (t - 0.5) * 1.78 + sin(w * 2.0 + ph + time * 0.10) * 0.030;
  float y = (lane - 3.0) * 0.080
          + sin(w + ph + time * 0.16) * 0.285
          + sin(w * 2.0 - ph * 0.6 - time * 0.11) * 0.070;
  float z = sin(w + ph * 1.35 - time * 0.09) * 0.40
          + cos(w * 2.0 + ph) * 0.065;
  return vec3(x, y, z);
}`;

const RIBBON_VERT = `#version 300 es
in vec2 aGrid;            // x = t along (0..1), y = v across (-1..1)
uniform float uTime, uSeed, uAspect, uWidth, uTwist;
uniform vec2 uMouse;
out float vT; out float vV; out vec3 vN; out float vDepth; out vec3 vViewPos;
${HELPERS}

void main(){
  float t = aGrid.x, v = aGrid.y;
  float e = 0.0035;
  vec3 c  = centerline(t, uSeed, uTime);
  vec3 c1 = centerline(t + e, uSeed, uTime);
  vec3 c0 = centerline(t - e, uSeed, uTime);
  vec3 T = normalize(c1 - c0);

  // A stable reference normal, then twist the band around the tangent.
  vec3 ref = normalize(cross(T, vec3(0.0, 0.0, 1.0)) + vec3(0.0, 1e-5, 0.0));
  vec3 bi  = normalize(cross(T, ref));
  float th = uTwist * t * TAU + sin(t * 3.14159 * 2.0 + uTime * 0.18 + uSeed) * 0.45;
  vec3 W = normalize(ref * cos(th) + bi * sin(th));

  // Tapered ends read as a ribbon entering and leaving the frame rather than a
  // closed tube, which is the difference between motion and ornament.
  float taper = 0.16 + 0.84 * pow(sin(t * 3.14159), 0.55);
  float w = uWidth * taper;
  vec3 p = c + W * (v * 0.5 * w);
  vec3 N = normalize(cross(T, W));

  p.xy += uMouse * 0.05 * (1.0 - abs(p.z));

  float d = ${VIEW_DIST} + p.z;
  vec2 s = p.xy * (${YARD} / max(d, 0.2));
  s.x /= uAspect;
  vDepth = d;
  vViewPos = p;
  vN = N; vT = t; vV = v;
  gl_Position = vec4(s, 1.0 - d * 0.25, 1.0);
}`;

const RIBBON_FRAG = `#version 300 es
precision highp float;
in float vT; in float vV; in vec3 vN; in float vDepth; in vec3 vViewPos;
uniform float uTime, uSeed, uHue, uDark, uLineCount, uLineWeight;
uniform float uFill, uGlow, uSheen;
out vec4 fragColor;
${HELPERS}

void main(){
  float across = vV * 0.5 + 0.5;
  vec3 N = normalize(vN);
  vec3 Vv = normalize(vec3(0.0, 0.0, 1.0) - vViewPos * 0.25);
  float facing = abs(dot(N, Vv));

  // Cinematic light: one key that drifts slowly, one cool fill from below.
  vec3 L = normalize(vec3(0.35 + 0.35 * sin(uTime * 0.11), 0.62, 0.72));
  float diff = 0.42 + 0.58 * max(dot(N, L), 0.0);
  float fill = 0.30 + 0.30 * max(dot(N, normalize(vec3(-0.4, -0.7, 0.35))), 0.0);
  vec3 H = normalize(L + Vv);
  float spec = pow(max(dot(N, H), 0.0), 42.0);

  vec3 col = palette(uHue + vT * 0.40 + across * 0.05);
  col = col * 1.12 + 0.035;                    // keep the aubergine end off the black
  col *= (diff * 0.85 + fill * 0.45);
  // Specular is a highlight on dark and a bleaching spot on light, so it is
  // weighted down on ink where the ramp matters more than the sheen.
  col += spec * uSheen * (0.30 + 0.70 * uDark) * mix(vec3(1.0), vec3(0.85, 0.95, 1.0), uDark);

  // Fine parallel contour lines following the geometry.
  float u = across * uLineCount + uSeed * 0.37;
  float dline = abs(fract(u) - 0.5) * 2.0;
  float aa = max(fwidth(u), 0.0001);
  float line = 1.0 - smoothstep(0.0, uLineWeight * (1.0 + aa * 2.0), dline);

  // Luminous edges where the surface turns away.
  float edge = pow(1.0 - facing, 2.0);

  float a = uFill * (0.55 + 0.45 * facing) + edge * uGlow * 0.55 + line * 0.10;
  a *= mix(1.0, 0.45, smoothstep(2.2, 3.4, vDepth));

  vec3 outc = col * (0.75 + 0.9 * line * uGlow);
  float alpha = clamp(a, 0.0, 1.0);

  if (uDark < 0.5) {
    // On a light ground the surface has to behave like ink. The wash was never
    // a hue problem: a 25%-alpha pale glaze over ivory reads as grey however
    // dark the source colour is, because compositing mixes the *background* in.
    // So coverage goes up hard and value goes down, with chroma restored before
    // the multiply so the turquoise and coral ends survive the blend.
    float l = dot(outc, vec3(0.2126, 0.7152, 0.0722));
    outc = clamp(mix(vec3(l), outc, 2.0), 0.0, 1.0);
    outc = min(outc * 0.62, vec3(0.80));
    alpha = clamp(alpha * 1.55, 0.0, 0.86);
  }

  fragColor = vec4(outc, alpha);
}`;

const PARTICLE_VERT = `#version 300 es
in vec3 aSeed;
uniform float uTime, uAspect, uSize, uDrift, uHue;
out vec3 vCol; out float vA;
${HELPERS}
void main(){
  float lane = floor(aSeed.z * 7.0);
  float seed = lane * 1.37;
  float t = fract(aSeed.x + uTime * (0.012 + 0.03 * aSeed.y) * uDrift);
  vec3 c = centerline(t, seed, uTime);
  vec2 off = vec2(sin(aSeed.y * 12.0 + uTime * 0.3), cos(aSeed.y * 9.0 - uTime * 0.22));
  c += vec3(off * 0.055, sin(aSeed.x * 8.0 + uTime * 0.4) * 0.05);
  float d = ${VIEW_DIST} + c.z;
  vec2 s = c.xy * (${YARD} / max(d, 0.2));
  s.x /= uAspect;
  gl_Position = vec4(s, 1.0 - d * 0.25, 1.0);
  gl_PointSize = uSize * (2.6 / max(d, 0.4));
  vCol = palette(uHue + lane * 0.055 + t * 0.4);
  vA = (0.25 + 0.65 * aSeed.y) * mix(1.0, 0.5, smoothstep(2.4, 3.4, d));
}`;

const PARTICLE_FRAG = `#version 300 es
precision highp float;
in vec3 vCol; in float vA;
uniform float uDark;
out vec4 fragColor;
void main(){
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float d = dot(q, q);
  if (d > 1.0) discard;
  float a = exp(-d * 3.2) * vA;
  vec3 c = vCol;
  if (uDark < 0.5) {
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = clamp(mix(vec3(l), c, 2.0), 0.0, 1.0) * 0.56;
    a = min(a * 2.0, 0.9);
  }
  fragColor = vec4(c, a);
}`;

/* --------------------------------------------------------------------- util */

function hslTripletToRgb(triplet: string): [number, number, number] | null {
  const parts = triplet.trim().split(/[\s,]+/);
  if (parts.length < 3) return null;
  const h = parseFloat(parts[0]);
  const s = parseFloat(parts[1]);
  const l = parseFloat(parts[2]);
  if ([h, s, l].some(Number.isNaN)) return null;

  const hh = ((h % 360) + 360) % 360 / 360;
  const ss = Math.min(100, Math.max(0, s)) / 100;
  const ll = Math.min(100, Math.max(0, l)) / 100;
  if (ss === 0) return [ll, ll, ll];
  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
  const p = 2 * ll - q;
  const chan = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [chan(hh + 1 / 3), chan(hh), chan(hh - 1 / 3)];
}

/**
 * Tokens first, baked values only if a token is missing. The gradient stops are
 * authored as HSL triplets in globals.css, so reading them here keeps the art
 * and the system on the same source of truth (§11).
 */
export function readPalette(host: HTMLElement | null): Float32Array {
  const out = new Float32Array(21);
  const style = host ? getComputedStyle(host) : null;
  for (let i = 0; i < 7; i++) {
    const raw = style?.getPropertyValue(`--flow-${i + 1}`)?.trim();
    const rgb = (raw && hslTripletToRgb(raw)) || FALLBACK_PALETTE[i];
    out[i * 3] = rgb[0];
    out[i * 3 + 1] = rgb[1];
    out[i * 3 + 2] = rgb[2];
  }
  return out;
}

/** `--background` is an HSL triplet in both themes, so its lightness is the ground. */
export function readIsDark(host: HTMLElement | null): boolean {
  const raw = host ? getComputedStyle(host).getPropertyValue("--background").trim() : "";
  const rgb = raw ? hslTripletToRgb(raw) : null;
  if (!rgb) return true;
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2] < 0.4;
}

/* ------------------------------------------------------------------- engine */

export interface LivingFlowHandle {
  stop(): void;
  /** Redraw one frame — used by reduced-motion and by a theme change. */
  renderOnce(timeSeconds?: number): void;
}

export interface LivingFlowOptions {
  canvas: HTMLCanvasElement;
  /** Element whose computed style carries the `--flow-*` tokens. */
  tokenHost?: HTMLElement;
  reducedMotion?: boolean;
  onFailed?: (reason: string) => void;
}

export function createLivingFlow({
  canvas,
  tokenHost,
  reducedMotion = false,
  onFailed,
}: LivingFlowOptions): LivingFlowHandle | null {
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: true,
    depth: false,
    premultipliedAlpha: false,
    powerPreference: "high-performance",
  });
  if (!gl) {
    onFailed?.("webgl2-unavailable");
    return null;
  }

  const compile = (label: string, type: number, source: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      onFailed?.(`${label}: ${gl.getShaderInfoLog(shader) ?? "compile failed"}`);
      return null;
    }
    return shader;
  };
  const build = (name: string, vertexSource: string, fragmentSource: string) => {
    const vs = compile(`${name}.vert`, gl.VERTEX_SHADER, vertexSource);
    const fs = compile(`${name}.frag`, gl.FRAGMENT_SHADER, fragmentSource);
    if (!vs || !fs) return null;
    const p = gl.createProgram()!;
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      onFailed?.(`${name}: ${gl.getProgramInfoLog(p) ?? "link failed"}`);
      return null;
    }
    return p;
  };

  const ribbonProgram = build("ribbon", RIBBON_VERT, RIBBON_FRAG);
  const particleProgram = build("particle", PARTICLE_VERT, PARTICLE_FRAG);
  if (!ribbonProgram || !particleProgram) {
    return null;
  }

  const locations = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>();
  const uniform = (program: WebGLProgram, name: string) => {
    let byName = locations.get(program);
    if (!byName) {
      byName = new Map();
      locations.set(program, byName);
    }
    if (!byName.has(name)) byName.set(name, gl.getUniformLocation(program, name));
    return byName.get(name)!;
  };

  // One grid, shared by all seven ribbons: 900 vertices, one index buffer.
  const grid = new Float32Array(SEG * ACROSS * 2);
  let k = 0;
  for (let i = 0; i < SEG; i++) {
    const t = i / (SEG - 1);
    for (let j = 0; j < ACROSS; j++) {
      grid[k++] = t;
      grid[k++] = (j / (ACROSS - 1)) * 2 - 1;
    }
  }
  const indices: number[] = [];
  for (let i = 0; i < SEG - 1; i++) {
    for (let j = 0; j < ACROSS - 1; j++) {
      const a = i * ACROSS + j;
      indices.push(a, a + ACROSS, a + 1, a + 1, a + ACROSS, a + ACROSS + 1);
    }
  }
  const indexCount = indices.length;

  const ribbonVao = gl.createVertexArray()!;
  gl.bindVertexArray(ribbonVao);
  const ribbonVbo = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, ribbonVbo);
  gl.bufferData(gl.ARRAY_BUFFER, grid, gl.STATIC_DRAW);
  const gridLocation = gl.getAttribLocation(ribbonProgram, "aGrid");
  gl.enableVertexAttribArray(gridLocation);
  gl.vertexAttribPointer(gridLocation, 2, gl.FLOAT, false, 0, 0);
  const ribbonIbo = gl.createBuffer()!;
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ribbonIbo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

  const seeds = new Float32Array(FLOW_CONFIG.particles * 3);
  for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
  const particleVao = gl.createVertexArray()!;
  gl.bindVertexArray(particleVao);
  const particleVbo = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, particleVbo);
  gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);
  const seedLocation = gl.getAttribLocation(particleProgram, "aSeed");
  gl.enableVertexAttribArray(seedLocation);
  gl.vertexAttribPointer(seedLocation, 3, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  let palette = readPalette(tokenHost ?? null);
  let isDark = readIsDark(tokenHost ?? null);

  let width = 0;
  let height = 0;
  const mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };

  /**
   * Raster budget, measured on Intel UHD 620: 1.97 ms per frame at 0.79 Mpx,
   * 3.13 ms at 3.17 Mpx. Capping the long edge at 1100 px and the DPR at 1.5
   * keeps the signature inside one third of a 60 fps frame on the weakest GPU
   * this product has to survive.
   */
  const MAX_LONG_EDGE = 1100;
  const MAX_DPR = 1.5;

  function resize() {
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;
    if (!cssWidth || !cssHeight) return false;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const scale = Math.min(dpr, MAX_LONG_EDGE / Math.max(cssWidth, cssHeight));
    const nextWidth = Math.max(1, Math.round(cssWidth * scale));
    const nextHeight = Math.max(1, Math.round(cssHeight * scale));
    if (nextWidth === width && nextHeight === height) return true;
    canvas.width = nextWidth;
    canvas.height = nextHeight;
    width = nextWidth;
    height = nextHeight;
    gl!.viewport(0, 0, width, height);
    return true;
  }

  // Mean depth of each ribbon, sampled from the same curve the vertex shader
  // evaluates. Without a depth buffer the translucent surfaces have to be
  // painted far-to-near or they stack in the wrong order.
  function painterOrder(time: number) {
    const order: { index: number; seed: number; depth: number }[] = [];
    for (let i = 0; i < RIBBONS; i++) {
      let z = 0;
      for (let s = 0; s < 8; s++) {
        const t = (s + 0.5) / 8;
        const w = t * Math.PI;
        const ph = i * 0.85;
        z += Math.sin(w + ph * 1.35 - time * 0.09) * 0.4 + Math.cos(w * 2 + ph) * 0.065;
      }
      order.push({ index: i, seed: i * 1.37, depth: z / 8 });
    }
    return order.sort((a, b) => b.depth - a.depth);
  }

  function drawFrame(time: number) {
    mouse.x += (mouse.targetX - mouse.x) * 0.08;
    mouse.y += (mouse.targetY - mouse.y) * 0.08;
    const aspect = width / height;

    gl!.clearColor(0, 0, 0, 0);
    gl!.clear(gl!.COLOR_BUFFER_BIT);
    gl!.disable(gl!.DEPTH_TEST);
    gl!.depthMask(false);
    gl!.enable(gl!.BLEND);
    gl!.blendFuncSeparate(gl!.SRC_ALPHA, gl!.ONE_MINUS_SRC_ALPHA, gl!.ONE, gl!.ONE_MINUS_SRC_ALPHA);

    gl!.useProgram(ribbonProgram!);
    gl!.bindVertexArray(ribbonVao!);
    gl!.uniform3fv(uniform(ribbonProgram!, "uPalette"), palette);
    gl!.uniform1f(uniform(ribbonProgram!, "uTime"), time);
    gl!.uniform1f(uniform(ribbonProgram!, "uAspect"), aspect);
    gl!.uniform1f(uniform(ribbonProgram!, "uWidth"), FLOW_CONFIG.width);
    gl!.uniform1f(uniform(ribbonProgram!, "uTwist"), FLOW_CONFIG.twist);
    gl!.uniform1f(uniform(ribbonProgram!, "uDark"), isDark ? 1 : 0);
    gl!.uniform1f(uniform(ribbonProgram!, "uLineCount"), FLOW_CONFIG.lineCount);
    gl!.uniform1f(uniform(ribbonProgram!, "uLineWeight"), FLOW_CONFIG.lineWeight);
    gl!.uniform1f(uniform(ribbonProgram!, "uFill"), FLOW_CONFIG.fill);
    gl!.uniform1f(uniform(ribbonProgram!, "uGlow"), FLOW_CONFIG.glow);
    gl!.uniform1f(uniform(ribbonProgram!, "uSheen"), FLOW_CONFIG.sheen);
    gl!.uniform2f(uniform(ribbonProgram!, "uMouse"), mouse.x, mouse.y);
    for (const ribbon of painterOrder(time)) {
      gl!.uniform1f(uniform(ribbonProgram!, "uSeed"), ribbon.seed);
      // Spread the group across the brand ramp: one hue for every lane would
      // collapse the signature back into a single-colour brand.
      gl!.uniform1f(uniform(ribbonProgram!, "uHue"), ribbon.index * FLOW_CONFIG.hueSpread);
      gl!.drawElements(gl!.TRIANGLES, indexCount, gl!.UNSIGNED_SHORT, 0);
    }

    gl!.useProgram(particleProgram!);
    gl!.bindVertexArray(particleVao!);
    gl!.uniform3fv(uniform(particleProgram!, "uPalette"), palette);
    gl!.uniform1f(uniform(particleProgram!, "uTime"), time);
    gl!.uniform1f(uniform(particleProgram!, "uAspect"), aspect);
    gl!.uniform1f(uniform(particleProgram!, "uSize"), FLOW_CONFIG.pointSize * Math.min(2, window.devicePixelRatio || 1));
    gl!.uniform1f(uniform(particleProgram!, "uDrift"), FLOW_CONFIG.drift);
    gl!.uniform1f(uniform(particleProgram!, "uHue"), 0);
    gl!.uniform1f(uniform(particleProgram!, "uDark"), isDark ? 1 : 0);
    gl!.drawArrays(gl!.POINTS, 0, FLOW_CONFIG.particles);
    gl!.bindVertexArray(null);
  }

  /* --------------------------------------------------------------- lifecycle */

  let running = false;
  let frame = 0;
  let visible = true;
  let onScreen = true;
  const startedAt = performance.now();

  const loop = () => {
    if (!running) return;
    if (resize()) drawFrame((performance.now() - startedAt) / 1000);
    frame = requestAnimationFrame(loop);
  };

  const start = () => {
    if (running || reducedMotion || !visible || !onScreen) return;
    running = true;
    frame = requestAnimationFrame(loop);
  };

  const stop = () => {
    running = false;
    cancelAnimationFrame(frame);
  };

  const still = () => {
    stop();
    if (resize()) drawFrame(reducedMotion ? 5.2 : (performance.now() - startedAt) / 1000);
  };

  const resizeObserver = new ResizeObserver(() => {
    if (reducedMotion || !running) still();
    else resize();
  });
  resizeObserver.observe(canvas);

  const intersection = new IntersectionObserver(
    (entries) => {
      onScreen = entries.some((entry) => entry.isIntersecting);
      if (reducedMotion) still();
      else if (onScreen && visible) start();
      else stop();
    },
    { rootMargin: "120px" }
  );
  intersection.observe(canvas);

  const onVisibility = () => {
    visible = document.visibilityState !== "hidden";
    if (reducedMotion) return;
    if (visible && onScreen) start();
    else stop();
  };
  document.addEventListener("visibilitychange", onVisibility);

  // A pointer is only worth parallax when it is a pointer. On touch this would
  // fight the scroll and add nothing.
  const finePointer = window.matchMedia("(pointer: fine)").matches;
  const onPointerMove = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    mouse.targetX = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    mouse.targetY = (0.5 - (event.clientY - rect.top) / rect.height) * 2;
  };
  const onPointerLeave = () => {
    mouse.targetX = 0;
    mouse.targetY = 0;
  };
  if (finePointer && !reducedMotion) {
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave);
  }

  // Theme changes swap the palette and the light grade, not the geometry.
  const observer = new MutationObserver(() => {
    palette = readPalette(tokenHost ?? null);
    isDark = readIsDark(tokenHost ?? null);
    if (reducedMotion || !running) still();
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });

  const onLost = (event: Event) => {
    event.preventDefault();
    stop();
    onFailed?.("webgl-context-lost");
  };
  canvas.addEventListener("webglcontextlost", onLost);

  still();
  if (!reducedMotion) start();

  return {
    stop() {
      stop();
      resizeObserver.disconnect();
      intersection.disconnect();
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("webglcontextlost", onLost);
      gl.deleteVertexArray(ribbonVao);
      gl.deleteVertexArray(particleVao);
      gl.deleteBuffer(ribbonVbo);
      gl.deleteBuffer(ribbonIbo);
      gl.deleteBuffer(particleVbo);
      gl.deleteProgram(ribbonProgram);
      gl.deleteProgram(particleProgram);
    },
    renderOnce(timeSeconds?: number) {
      palette = readPalette(tokenHost ?? null);
      isDark = readIsDark(tokenHost ?? null);
      if (resize()) drawFrame(timeSeconds ?? 5.2);
    },
  };
}
