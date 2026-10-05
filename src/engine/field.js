const MAX_IMPACTS = 12

const VERT = `attribute vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }`

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime, uScale, uTurb, uDetail, uThreshold, uSoft, uGrain, uChar, uStretch, uSym, uBands;
uniform vec2 uFlow;
uniform vec3 uPaper, uInkA, uInkB, uTint;
uniform vec4 uImp[${MAX_IMPACTS}];  // x, y, strength * life, size
uniform vec4 uImpA[${MAX_IMPACTS}]; // swirl, push (0..1 -> pull..push), ripple, smear
uniform vec4 uImpB[${MAX_IMPACTS}]; // shatter, pixelate, tint, age (s)
uniform float uInk[${MAX_IMPACTS}];

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
  vec2 warp = vec2(0.0);
  float ink = 0.0, pix = 0.0, tint = 0.0;
  for (int i = 0; i < ${MAX_IMPACTS}; i++) {
    vec4 m = uImp[i];
    if (m.z <= 0.0) continue;
    vec4 a = uImpA[i];
    vec4 b = uImpB[i];
    vec2 d = uv - m.xy * aspect;
    float r = length(d);
    float f = m.z * exp(-r * r / (m.w * m.w));
    vec2 dir = d / (r + 0.0001);
    float fi = float(i);
    warp += a.x * f * vec2(-d.y, d.x) / (r + 0.08) * 0.35;
    warp += (a.y * 2.0 - 1.0) * f * dir * 0.12;
    warp += a.z * f * dir * sin(r * 70.0 - b.w * 14.0) * 0.035;
    warp.x += a.w * f * (hash(vec2(floor(uv.y * 90.0), fi + floor(b.w * 12.0))) - 0.5) * 0.5;
    vec2 block = floor(uv * (3.0 / m.w)) + fi * 7.0 + floor(b.w * 9.0);
    warp += b.x * f * step(0.45, hash(block)) * (vec2(hash(block + 1.3), hash(block + 2.7)) - 0.5) * 0.3;
    pix = max(pix, b.y * min(f, 1.0));
    tint += b.z * f;
    ink += f * uInk[i];
  }
  vec2 suv = uv + warp;
  if (pix > 0.02) {
    float n = mix(220.0, 14.0, pix);
    suv = (floor(suv * n) + 0.5) / n;
  }
  // Symmetry: 1 mirrors, 2..8 folds into kaleidoscope slices around the centre.
  float segs = floor(uSym * 8.0 + 0.5);
  if (segs > 0.5) {
    vec2 c = vec2(aspect.x * 0.5, 0.5);
    vec2 d = suv - c;
    if (segs < 1.5) {
      d.x = abs(d.x);
    } else {
      float seg = 6.2831853 / segs;
      float a = mod(atan(d.y, d.x), seg);
      a = abs(a - seg * 0.5);
      d = length(d) * vec2(cos(a), sin(a));
    }
    suv = c + d;
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
  col = mix(col, uTint, clamp(tint, 0.0, 1.0) * 0.85);
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

// Domain-warped fbm noise field (soft ink in paper, with grain). Attack events
// become impacts: short-lived local distortions (swirl, push, ripple, smear,
// shatter, pixelate, tint) that also add ink where they land.
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
  for (const name of ['uRes', 'uTime', 'uFlow', 'uScale', 'uTurb', 'uDetail', 'uThreshold', 'uSoft', 'uGrain', 'uChar', 'uStretch', 'uSym', 'uBands', 'uPaper', 'uInkA', 'uInkB', 'uTint', 'uImp', 'uImpA', 'uImpB', 'uInk']) {
    u[name] = gl.getUniformLocation(prog, name)
  }

  const impacts = []
  const impData = new Float32Array(MAX_IMPACTS * 4)
  const impA = new Float32Array(MAX_IMPACTS * 4)
  const impB = new Float32Array(MAX_IMPACTS * 4)
  const inkData = new Float32Array(MAX_IMPACTS)
  let time = 0
  const flow = [0, 0]
  // Render resolution adapts to frame time; the field is soft anyway, so it can go low.
  let scale = 0.6
  let frameAvg = 1 / 60

  return {
    addImpact(v) {
      impacts.push({
        x: v['impact.x'],
        y: v['impact.y'],
        size: 0.04 + v['impact.size'] * 0.4,
        strength: 0.15 + v['impact.strength'] * 1.6,
        ink: v['impact.ink'] * 0.6,
        a: [v['distort.swirl'], v['distort.push'], v['distort.ripple'], v['distort.smear']],
        b: [v['distort.shatter'], v['distort.pixelate'], v['distort.tint']],
        age: 0,
        life: 1,
        rate: 1 / (0.3 + v['impact.decay'] * 5),
      })
      if (impacts.length > MAX_IMPACTS) impacts.shift()
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

      impData.fill(0)
      for (let i = impacts.length - 1; i >= 0; i--) {
        const m = impacts[i]
        m.life -= dt * m.rate
        m.age += dt
        if (m.life <= 0) impacts.splice(i, 1)
      }
      impacts.forEach((m, i) => {
        impData.set([m.x, m.y, m.strength * m.life ** 1.5, m.size], i * 4)
        impA.set(m.a, i * 4)
        impB.set([...m.b, m.age], i * 4)
        inkData[i] = m.ink
      })

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
      gl.uniform4fv(u.uImp, impData)
      gl.uniform4fv(u.uImpA, impA)
      gl.uniform4fv(u.uImpB, impB)
      gl.uniform1fv(u.uInk, inkData)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    },
  }
}
