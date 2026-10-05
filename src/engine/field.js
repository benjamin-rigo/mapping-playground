const VERT = `attribute vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }`

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime, uScale, uTurb, uDetail, uThreshold, uSoft, uGrain, uChar, uStretch, uSym, uBands;
uniform vec2 uFlow;
uniform vec3 uPaper, uInkA, uInkB, uTint;
uniform vec2 uCenter;
uniform float uReach, uSwirl, uPush, uRipple, uSmear, uShatter, uPix, uTintAmt, uInkHit;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float cell(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float d = 1.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = vec2(hash(i + g), hash(i + g + 17.1));
      d = min(d, length(g + o - f));
    }
  }
  return d;
}
// Character morphs the base noise: smooth -> ridged -> billow -> cellular.
float base(vec2 p) {
  float c = uChar * 3.0;
  float n = noise(p);
  float ridged = 1.0 - abs(2.0 * n - 1.0);
  if (c < 1.0) return mix(n, ridged, c);
  float billow = abs(2.0 * n - 1.0);
  if (c < 2.0) return mix(ridged, billow, c - 1.0);
  return mix(billow, cell(p), c - 2.0);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5, tot = 0.0;
  for (int i = 0; i < 6; i++) {
    float w = clamp(uDetail - float(i), 0.0, 1.0);
    v += a * w * base(p);
    tot += a * w;
    p = mat2(1.6, 1.2, -1.2, 1.6) * p + 3.1;
    a *= 0.5;
  }
  return v / max(tot, 0.001);
}
void main() {
  vec2 uv = gl_FragCoord.xy / uRes.y;
  vec2 aspect = vec2(uRes.x / uRes.y, 1.0);
  // Whole-frame distortions. Swirl, push and ripple centre on the impact point and
  // fade out over Reach; smear, shatter, pixelate and tint cover everything.
  vec2 c = uCenter * aspect;
  vec2 d = uv - c;
  float rad = length(d);
  float fall = exp(-rad * rad / (uReach * uReach));
  vec2 dir = d / (rad + 0.0001);
  float ang = uSwirl * 7.0 * fall;
  vec2 suv = c + mat2(cos(ang), sin(ang), -sin(ang), cos(ang)) * d;
  suv -= dir * (uPush * 2.0 - 1.0) * 0.25 * fall;
  suv += dir * sin(rad * 55.0 - uTime * 7.0) * 0.03 * uRipple * mix(1.0, fall, 0.6);
  float jit = floor(uTime * 12.0);
  float row = floor(uv.y * 90.0);
  if (hash(vec2(row, jit)) < uSmear * 0.7) suv.x += (hash(vec2(row + 3.1, jit)) - 0.5) * 0.5 * uSmear;
  vec2 block = floor(uv * 14.0);
  if (hash(block + jit) < uShatter * 0.6) suv += (vec2(hash(block + 1.3 + jit), hash(block + 2.7 + jit)) - 0.5) * 0.3 * uShatter;
  if (uPix > 0.01) {
    float n = mix(260.0, 10.0, uPix);
    suv = (floor(suv * n) + 0.5) / n;
  }
  float ink = uInkHit * fall;
  float tint = uTintAmt * mix(0.25, 1.0, fall) * 0.7;
  // Symmetry: 1 mirrors, 2..8 folds into kaleidoscope slices around the centre.
  float segs = floor(uSym * 8.0 + 0.5);
  if (segs > 0.5) {
    vec2 sc = vec2(aspect.x * 0.5, 0.5);
    vec2 sd = suv - sc;
    if (segs < 1.5) {
      sd.x = abs(sd.x);
    } else {
      float seg = 6.2831853 / segs;
      float a = mod(atan(sd.y, sd.x), seg);
      a = abs(a - seg * 0.5);
      sd = length(sd) * vec2(cos(a), sin(a));
    }
    suv = sc + sd;
  }
  float sx = exp2((uStretch - 0.5) * 5.0);
  vec2 p = suv * uScale * vec2(1.0 / sx, sx);
  vec2 q = vec2(fbm(p + uFlow), fbm(p + vec2(5.2, 1.3) - uFlow * 0.7));
  vec2 r = vec2(fbm(p + uTurb * 4.0 * q + vec2(1.7, 9.2) + 0.15 * uFlow), fbm(p + uTurb * 4.0 * q + vec2(8.3, 2.8) - 0.126 * uFlow));
  float v = fbm(p + uTurb * 4.0 * r) + ink;
  float t = smoothstep(uThreshold - uSoft, uThreshold + uSoft, v);
  if (uBands > 0.01) {
    float levels = floor(mix(16.0, 2.0, uBands));
    t = floor(t * levels + 0.5) / levels;
  }
  vec3 inkCol = mix(uInkA, uInkB, smoothstep(0.3, 0.7, q.x));
  vec3 col = mix(uPaper, inkCol, t);
  col = mix(col, uTint, clamp(tint, 0.0, 1.0));
  col += (hash(gl_FragCoord.xy + fract(uTime * 7.0) * 91.0) - 0.5) * uGrain;
  gl_FragColor = vec4(col, 1.0);
}`

export function hsl(h, s, l) {
  h = ((h % 1) + 1) % 1
  const a = s * Math.min(l, 1 - l)
  const f = (k) => {
    const x = (k + h * 12) % 12
    return l - a * Math.max(-1, Math.min(x - 3, 9 - x, 1))
  }
  return [f(0), f(8), f(4)]
}

function compile(gl, type, src) {
  const s = gl.createShader(type)
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s))
  return s
}

// Domain-warped fbm noise field (soft ink in paper, with grain) with whole-frame
// distortions. Each attack event is a "hit": it moves the distortion centre toward
// its position and briefly spikes every distortion that is above zero.
export function createField(canvas) {
  const gl = canvas.getContext('webgl', { antialias: false, preserveDrawingBuffer: true })
  if (!gl) return { addImpact() {}, render() {} }

  const prog = gl.createProgram()
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT))
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG))
  gl.linkProgram(prog)
  gl.useProgram(prog)
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const loc = gl.getAttribLocation(prog, 'a')
  gl.enableVertexAttribArray(loc)
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

  const u = {}
  for (const name of ['uRes', 'uTime', 'uFlow', 'uScale', 'uTurb', 'uDetail', 'uThreshold', 'uSoft', 'uGrain', 'uChar', 'uStretch', 'uSym', 'uBands', 'uPaper', 'uInkA', 'uInkB', 'uTint', 'uCenter', 'uReach', 'uSwirl', 'uPush', 'uRipple', 'uSmear', 'uShatter', 'uPix', 'uTintAmt', 'uInkHit']) {
    u[name] = gl.getUniformLocation(prog, name)
  }

  let hit = 0
  let hitTime = 0.5
  let hitInk = 0
  let reach = 0.5
  const center = [0.5, 0.5]
  const target = [0.5, 0.5]
  let time = 0
  const flow = [0, 0]
  // Render resolution adapts to frame time; the field is soft anyway, so it can go low.
  let scale = 0.6
  let frameAvg = 1 / 60

  return {
    addImpact(v) {
      target[0] = v['impact.x']
      target[1] = v['impact.y']
      hit = Math.min(1.5, hit + v['impact.hit'] * 0.6)
      hitTime = 0.05 + v['impact.decay'] * 1.2
      hitInk = v['impact.ink']
      reach = 0.08 + v['impact.reach'] ** 1.5 * 1.6
    },
    render(v, dt) {
      frameAvg += (dt - frameAvg) * 0.05
      if (frameAvg > 1 / 45 && scale > 0.3) scale = Math.max(0.3, scale - 0.05)
      else if (frameAvg < 1 / 58 && scale < 0.75) scale = Math.min(0.75, scale + 0.01)
      const w = Math.max(1, Math.round(canvas.clientWidth * scale))
      const h = Math.max(1, Math.round(canvas.clientHeight * scale))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      gl.viewport(0, 0, w, h)

      time += dt
      const speed = dt * (0.02 + v['motion.flow'] ** 2 * 1.2)
      const angle = v['motion.direction'] * Math.PI * 2
      flow[0] += Math.cos(angle) * speed
      flow[1] += Math.sin(angle) * speed

      hit *= Math.exp(-dt / hitTime)
      const follow = 1 - Math.exp(-dt / 0.15)
      center[0] += (target[0] - center[0]) * follow
      center[1] += (target[1] - center[1]) * follow
      // A hit multiplies each distortion, so knobs at zero stay off.
      const spike = (x) => Math.min(1, x * (1 + hit * 2))

      const hue = v['color.hue']
      const sat = v['color.saturation']
      const paper = v['color.paper']
      const inkL = 0.75 - paper * 0.4
      gl.uniform2f(u.uRes, w, h)
      gl.uniform1f(u.uTime, time)
      gl.uniform2fv(u.uFlow, flow)
      gl.uniform1f(u.uScale, 0.8 + v['noise.scale'] * 7)
      gl.uniform1f(u.uTurb, v['motion.turbulence'])
      gl.uniform1f(u.uDetail, 1 + v['noise.detail'] * 5)
      gl.uniform1f(u.uChar, v['noise.character'])
      gl.uniform1f(u.uStretch, v['noise.stretch'])
      gl.uniform1f(u.uSym, v['noise.symmetry'])
      gl.uniform1f(u.uBands, v['texture.bands'])
      gl.uniform1f(u.uThreshold, 0.7 - v['color.contrast'] * 0.3)
      gl.uniform1f(u.uSoft, 0.03 + v['texture.softness'] * 0.3)
      gl.uniform1f(u.uGrain, v['texture.grain'] * 0.3)
      gl.uniform3fv(u.uPaper, hsl(hue, sat * 0.15, 0.06 + paper * 0.9))
      gl.uniform3fv(u.uInkA, hsl(hue, sat, inkL))
      gl.uniform3fv(u.uInkB, hsl(hue + v['color.spread'] * 0.5, sat, inkL + 0.1))
      gl.uniform3fv(u.uTint, hsl(hue + 0.5, Math.max(sat, 0.6), 0.55))
      gl.uniform2fv(u.uCenter, center)
      gl.uniform1f(u.uReach, reach)
      gl.uniform1f(u.uSwirl, spike(v['distort.swirl']))
      gl.uniform1f(u.uPush, 0.5 + (v['distort.push'] - 0.5) * (1 + hit * 1.5))
      gl.uniform1f(u.uRipple, spike(v['distort.ripple']))
      gl.uniform1f(u.uSmear, spike(v['distort.smear']))
      gl.uniform1f(u.uShatter, spike(v['distort.shatter']))
      gl.uniform1f(u.uPix, spike(v['distort.pixelate']))
      gl.uniform1f(u.uTintAmt, spike(v['distort.tint']))
      gl.uniform1f(u.uInkHit, hitInk * Math.min(1, hit) * 0.5)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    },
  }
}
