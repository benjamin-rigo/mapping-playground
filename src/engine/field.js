const VERT = `attribute vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }`

const COMMON = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
`

// Frame pass: draws the pastel fluid source and mixes it with the previous frame,
// which is resampled with zoom/rotate/self-warp (feedback), block offsets (mosh),
// RGB split, row tearing, data barcodes (grid) and static.
const FRAME = `${COMMON}
uniform sampler2D uPrev;
uniform float uScale, uTurb, uSoft, uThreshold, uFb, uZoom, uRot, uWarp, uMosh, uBlock, uGrid, uRgb, uTear, uStatic;
uniform vec2 uFlow, uCenter;
uniform vec3 uPaper, uInkA, uInkB;

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = mat2(1.6, 1.2, -1.2, 1.6) * p + 3.1;
    a *= 0.5;
  }
  return v / 0.97;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  float jit = floor(uTime * 14.0);

  // row tearing shifts whole scanlines
  float row = floor(uv.y * 70.0);
  if (hash(vec2(row, jit)) < uTear * 0.5) uv.x += (hash(vec2(row + 7.0, jit)) - 0.5) * 0.3 * uTear;

  // source: domain-warped fbm ink in paper
  vec2 p = vec2(uv.x * aspect, uv.y) * (0.8 + uScale * 6.0);
  vec2 q = vec2(fbm(p + uFlow), fbm(p + vec2(5.2, 1.3) - uFlow * 0.7));
  float v = fbm(p + uTurb * 4.0 * q);
  float t = smoothstep(uThreshold - uSoft, uThreshold + uSoft, v);
  vec3 src = mix(uPaper, mix(uInkA, uInkB, smoothstep(0.3, 0.7, q.x)), t);

  // feedback: previous frame zoomed / rotated around the centre and warped by itself
  vec2 c = uCenter;
  vec2 d = uv - c;
  d.x *= aspect;
  float ang = (uRot - 0.5) * 0.08;
  d = mat2(cos(ang), sin(ang), -sin(ang), cos(ang)) * d;
  d *= 1.0 - (uZoom - 0.5) * 0.06;
  d.x /= aspect;
  vec2 fuv = c + d;
  vec3 self = texture2D(uPrev, uv).rgb;
  fuv += (self.rg - 0.5) * uWarp * 0.04;

  // mosh: some blocks keep sliding the old picture instead of refreshing
  float cells = mix(48.0, 6.0, uBlock);
  vec2 block = floor(uv * vec2(cells * aspect, cells));
  float stuck = step(hash(block + floor(uTime * 3.0)), uMosh * 0.7);
  fuv += stuck * (vec2(hash(block + 1.7), hash(block + 4.1)) - 0.5) * 0.02;

  float split = uRgb * 0.012;
  vec3 prev = vec3(
    texture2D(uPrev, fuv + vec2(split, 0.0)).r,
    texture2D(uPrev, fuv).g,
    texture2D(uPrev, fuv - vec2(split, 0.0)).b
  );

  float keep = clamp(uFb + stuck * 0.25, 0.0, 0.985);
  vec3 col = mix(src, prev, keep);

  // grid: raw barcode columns flashing in bands
  float band = step(hash(vec2(floor(uv.y * 18.0), floor(uTime * 5.0))), uGrid);
  float bar = step(0.55, hash(vec2(floor(uv.x * mix(40.0, 400.0, hash(vec2(floor(uv.y * 18.0), jit)))), jit)));
  col = mix(col, vec3(bar), band * uGrid);

  col = mix(col, vec3(hash(gl_FragCoord.xy + uTime)), uStatic * 0.7);
  gl_FragColor = vec4(col, 1.0);
}`

// Present pass: show the frame with animated grain on top (grain is not fed back).
const PRESENT = `${COMMON}
uniform sampler2D uFrame;
uniform float uGrain;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 col = texture2D(uFrame, uv).rgb;
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

function program(gl, frag) {
  const compile = (type, src) => {
    const s = gl.createShader(type)
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s))
    return s
  }
  const prog = gl.createProgram()
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT))
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, frag))
  gl.linkProgram(prog)
  const u = new Proxy({}, { get: (cache, name) => (cache[name] ??= gl.getUniformLocation(prog, name)) })
  return { prog, u }
}

// Feedback video synth: each frame is drawn from the previous one (ping-pong
// framebuffers), then presented with grain. Attacks move the feedback centre.
export function createField(canvas) {
  const gl = canvas.getContext('webgl', { antialias: false, preserveDrawingBuffer: true })
  if (!gl) return { addImpact() {}, render() {} }

  const frame = program(gl, FRAME)
  const present = program(gl, PRESENT)
  const quad = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, quad)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  for (const { prog } of [frame, present]) {
    const loc = gl.getAttribLocation(prog, 'a')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
  }

  let targets = []
  let w = 0
  let h = 0
  let cur = 0
  function makeTargets() {
    for (const t of targets) {
      gl.deleteTexture(t.tex)
      gl.deleteFramebuffer(t.fb)
    }
    targets = [0, 1].map(() => {
      const tex = gl.createTexture()
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      const fb = gl.createFramebuffer()
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
      return { tex, fb }
    })
  }

  let time = 0
  const flow = [0, 0]
  const center = [0.5, 0.5]
  const target = [0.5, 0.5]
  // Render resolution adapts to frame time; the look is soft, so it can go low.
  let scale = 0.6
  let frameAvg = 1 / 60

  return {
    addImpact(x, y) {
      target[0] = x
      target[1] = y
    },
    render(u, dt) {
      frameAvg += (dt - frameAvg) * 0.05
      if (frameAvg > 1 / 45 && scale > 0.3) scale = Math.max(0.3, scale - 0.05)
      else if (frameAvg < 1 / 58 && scale < 0.75) scale = Math.min(0.75, scale + 0.01)
      const nw = Math.max(1, Math.round(canvas.clientWidth * scale))
      const nh = Math.max(1, Math.round(canvas.clientHeight * scale))
      if (nw !== w || nh !== h) {
        w = canvas.width = nw
        h = canvas.height = nh
        makeTargets()
      }

      time += dt
      const speed = dt * (0.02 + u.flow ** 2 * 1.2)
      flow[0] += speed * 0.6
      flow[1] += speed
      const follow = 1 - Math.exp(-dt / 0.4)
      center[0] += (target[0] - center[0]) * follow
      center[1] += (target[1] - center[1]) * follow

      const inkL = 0.75 - u.paper * 0.38
      const read = targets[cur]
      const write = targets[1 - cur]

      gl.viewport(0, 0, w, h)
      gl.useProgram(frame.prog)
      gl.bindFramebuffer(gl.FRAMEBUFFER, write.fb)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, read.tex)
      const f = frame.u
      gl.uniform1i(f.uPrev, 0)
      gl.uniform2f(f.uRes, w, h)
      gl.uniform1f(f.uTime, time)
      gl.uniform2fv(f.uFlow, flow)
      gl.uniform2fv(f.uCenter, center)
      gl.uniform1f(f.uScale, u.scale)
      gl.uniform1f(f.uTurb, u.turb)
      gl.uniform1f(f.uSoft, 0.03 + u.soft * 0.3)
      gl.uniform1f(f.uThreshold, 0.68 - u.contrast * 0.28)
      gl.uniform1f(f.uFb, u.fb)
      gl.uniform1f(f.uZoom, u.zoom)
      gl.uniform1f(f.uRot, u.rot)
      gl.uniform1f(f.uWarp, u.warp)
      gl.uniform1f(f.uMosh, u.mosh)
      gl.uniform1f(f.uBlock, u.block)
      gl.uniform1f(f.uGrid, u.grid)
      gl.uniform1f(f.uRgb, u.rgb)
      gl.uniform1f(f.uTear, u.tear)
      gl.uniform1f(f.uStatic, u.static)
      gl.uniform3fv(f.uPaper, hsl(u.hue, u.sat * 0.25, 0.04 + u.paper * 0.93))
      gl.uniform3fv(f.uInkA, hsl(u.hue, u.sat, inkL))
      gl.uniform3fv(f.uInkB, hsl(u.hue + 0.08, u.sat, Math.min(0.85, inkL + 0.12)))
      gl.drawArrays(gl.TRIANGLES, 0, 3)

      gl.useProgram(present.prog)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.bindTexture(gl.TEXTURE_2D, write.tex)
      gl.uniform1i(present.u.uFrame, 0)
      gl.uniform2f(present.u.uRes, w, h)
      gl.uniform1f(present.u.uTime, time)
      gl.uniform1f(present.u.uGrain, u.grain * 0.3)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      cur = 1 - cur
    },
  }
}
