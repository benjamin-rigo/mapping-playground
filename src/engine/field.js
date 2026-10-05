const MAX_IMPACTS = 16
const RES_SCALE = 0.6

const VERT = `attribute vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }`

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime, uFlowT, uScale, uTurb, uDetail, uThreshold, uSoft, uGrain;
uniform vec3 uPaper, uInkA, uInkB;
uniform vec4 uImp[${MAX_IMPACTS}];
uniform float uSwirl[${MAX_IMPACTS}];

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
float fbm(vec2 p) {
  float v = 0.0, a = 0.5, tot = 0.0;
  for (int i = 0; i < 6; i++) {
    float w = clamp(uDetail - float(i), 0.0, 1.0);
    v += a * w * noise(p);
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
  float ink = 0.0;
  for (int i = 0; i < ${MAX_IMPACTS}; i++) {
    vec4 m = uImp[i];
    if (m.z <= 0.0) continue;
    vec2 d = uv - m.xy * aspect;
    float r2 = dot(d, d);
    float f = m.z * exp(-r2 / (m.w * m.w));
    warp += f * (uSwirl[i] * vec2(-d.y, d.x) + (1.0 - uSwirl[i]) * d) / (sqrt(r2) + 0.08) * 0.35;
    ink += f * 0.22;
  }
  vec2 p = (uv + warp) * uScale;
  vec2 q = vec2(fbm(p + vec2(0.0, uFlowT)), fbm(p + vec2(5.2, 1.3) - uFlowT * 0.7));
  vec2 r = vec2(fbm(p + uTurb * 4.0 * q + vec2(1.7, 9.2) + 0.15 * uFlowT), fbm(p + uTurb * 4.0 * q + vec2(8.3, 2.8) - 0.126 * uFlowT));
  float v = fbm(p + uTurb * 4.0 * r) + ink;
  float t = smoothstep(uThreshold - uSoft, uThreshold + uSoft, v);
  vec3 inkCol = mix(uInkA, uInkB, smoothstep(0.3, 0.7, q.x));
  vec3 col = mix(uPaper, inkCol, t);
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
// become impacts: short-lived swirls/pushes that also add ink where they land.
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
  for (const name of ['uRes', 'uTime', 'uFlowT', 'uScale', 'uTurb', 'uDetail', 'uThreshold', 'uSoft', 'uGrain', 'uPaper', 'uInkA', 'uInkB', 'uImp', 'uSwirl']) {
    u[name] = gl.getUniformLocation(prog, name)
  }

  const impacts = []
  const impData = new Float32Array(MAX_IMPACTS * 4)
  const swirlData = new Float32Array(MAX_IMPACTS)
  let time = 0
  let flowT = 0

  return {
    addImpact(v) {
      impacts.push({
        x: v['impact.x'],
        y: v['impact.y'],
        size: 0.04 + v['impact.size'] * 0.4,
        strength: 0.15 + v['impact.strength'] * 1.6,
        swirl: v['impact.swirl'],
        life: 1,
        rate: 1 / (0.3 + v['impact.decay'] * 5),
      })
      if (impacts.length > MAX_IMPACTS) impacts.shift()
    },
    render(v, dt) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2) * RES_SCALE
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr))
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      gl.viewport(0, 0, w, h)

      time += dt
      flowT += dt * (0.02 + v['field.flow'] ** 2 * 1.2)

      impData.fill(0)
      swirlData.fill(0)
      for (let i = impacts.length - 1; i >= 0; i--) {
        const m = impacts[i]
        m.life -= dt * m.rate
        if (m.life <= 0) impacts.splice(i, 1)
      }
      impacts.forEach((m, i) => {
        impData.set([m.x, m.y, m.strength * m.life ** 1.5, m.size], i * 4)
        swirlData[i] = m.swirl
      })

      const hue = v['color.hue']
      const sat = v['color.saturation']
      const paper = v['color.paper']
      const inkL = 0.75 - paper * 0.4
      gl.uniform2f(u.uRes, w, h)
      gl.uniform1f(u.uTime, time)
      gl.uniform1f(u.uFlowT, flowT)
      gl.uniform1f(u.uScale, 0.8 + v['field.scale'] * 7)
      gl.uniform1f(u.uTurb, v['field.turbulence'])
      gl.uniform1f(u.uDetail, 1 + v['field.detail'] * 5)
      gl.uniform1f(u.uThreshold, 0.7 - v['color.contrast'] * 0.3)
      gl.uniform1f(u.uSoft, 0.03 + v['texture.softness'] * 0.3)
      gl.uniform1f(u.uGrain, v['texture.grain'] * 0.3)
      gl.uniform3fv(u.uPaper, hsl(hue, sat * 0.15, 0.06 + paper * 0.9))
      gl.uniform3fv(u.uInkA, hsl(hue, sat, inkL))
      gl.uniform3fv(u.uInkB, hsl(hue + v['color.spread'] * 0.5, sat, inkL + 0.1))
      gl.uniform4fv(u.uImp, impData)
      gl.uniform1fv(u.uSwirl, swirlData)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    },
  }
}
