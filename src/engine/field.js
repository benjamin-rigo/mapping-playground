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

// Frame pass (Noise module): blurred domain-warped fbm ink in paper, mixed with the
// previous frame, which is resampled zoomed/rotated around the centre, drifted along
// the flow direction and broken into sliding blocks (the only distortion fed back).
const FRAME = `${COMMON}
uniform sampler2D uPrev;
uniform float uScale, uDetail, uTurb, uSoft, uThreshold, uFb, uZoom, uRot, uDrift, uBlocks;
uniform vec2 uFlow, uDir;
uniform vec3 uPaper, uInkA, uInkB;

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
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;

  vec2 p = vec2(uv.x * aspect, uv.y) * (0.8 + uScale * 6.0);
  vec2 q = vec2(fbm(p + uFlow), fbm(p + vec2(5.2, 1.3) - uFlow * 0.7));
  vec2 r = vec2(fbm(p + uTurb * 4.0 * q + vec2(1.7, 9.2)), fbm(p + uTurb * 4.0 * q + vec2(8.3, 2.8)));
  float v = fbm(p + uTurb * 4.0 * r);
  float t = smoothstep(uThreshold - uSoft, uThreshold + uSoft, v);
  vec3 src = mix(uPaper, mix(uInkA, uInkB, smoothstep(0.3, 0.7, q.x)), t);

  vec2 d = uv - 0.5;
  d.x *= aspect;
  float ang = (uRot - 0.5) * 0.08;
  d = mat2(cos(ang), sin(ang), -sin(ang), cos(ang)) * d;
  d *= 1.0 - (uZoom - 0.5) * 0.06;
  d.x /= aspect;
  vec2 fuv = 0.5 + d - uDir * uDrift * 0.006;

  float cells = 18.0;
  vec2 block = floor(uv * vec2(cells * aspect, cells));
  float stuck = step(hash(block + floor(uTime * 4.0)), uBlocks * 0.6);
  fuv += stuck * (vec2(hash(block + 1.7), hash(block + 4.1)) - 0.5) * 0.03;

  vec3 prev = texture2D(uPrev, fuv).rgb;
  float keep = clamp(uFb * 0.97 + stuck * 0.3, 0.0, 0.985);
  gl_FragColor = vec4(mix(src, prev, keep), 1.0);
}`

// Present pass (Distortion module): tears, pixelates, splits and recolours the frame
// on its way to the screen, then adds scanlines, static and grain. Not fed back.
const PRESENT = `${COMMON}
uniform sampler2D uFrame;
uniform float uTear, uPix, uRgb, uStatic, uScan, uGrain, uHueShift, uInvert, uPost, uBurn;

vec3 hueRotate(vec3 c, float a) {
  const vec3 k = vec3(0.57735);
  float ca = cos(a);
  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float jit = floor(uTime * 14.0);
  float row = floor(uv.y * 80.0);
  if (hash(vec2(row, jit)) < uTear * 0.6) uv.x += (hash(vec2(row + 7.0, jit)) - 0.5) * 0.35 * uTear;
  if (uPix > 0.01) {
    vec2 n = vec2(uRes.x / uRes.y, 1.0) * mix(160.0, 8.0, pow(uPix, 0.7));
    uv = (floor(uv * n) + 0.5) / n;
  }
  float split = uRgb * 0.025;
  vec3 col = vec3(texture2D(uFrame, uv + vec2(split, 0.0)).r, texture2D(uFrame, uv).g, texture2D(uFrame, uv - vec2(split, split * 0.4)).b);

  col = hueRotate(col, uHueShift * 6.2831853);
  if (uPost > 0.01) {
    float levels = floor(mix(12.0, 2.0, uPost));
    col = floor(col * levels + 0.5) / levels;
  }
  col = mix(col, 1.0 - col, uInvert);
  col = mix(col, clamp((col - 0.5) * (1.0 + uBurn * 4.0) + 0.5 + uBurn * 0.15, 0.0, 1.0), uBurn);
  col *= 1.0 - uScan * 0.5 * step(0.5, fract(gl_FragCoord.y * 0.5));
  col = mix(col, vec3(hash(gl_FragCoord.xy + uTime)), uStatic * 0.75);
  col += (hash(gl_FragCoord.xy + fract(uTime * 7.0) * 91.0) - 0.5) * uGrain * 0.3;
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
// framebuffers), then distorted on its way to the screen.
export function createField(canvas) {
  const gl = canvas.getContext('webgl', { antialias: false, preserveDrawingBuffer: true })
  if (!gl) return { render() {} }

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
  // Render resolution adapts to frame time; the look is soft, so it can go low.
  let scale = 0.6
  let frameAvg = 1 / 60

  return {
    render(v, dt) {
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
      const angle = v['noise.direction'] * Math.PI * 2
      const dir = [Math.cos(angle), Math.sin(angle)]
      const speed = dt * (0.02 + v['noise.flow'] ** 2 * 1.2)
      flow[0] += dir[0] * speed
      flow[1] += dir[1] * speed

      const hue = v['noise.hue']
      const sat = v['noise.saturation']
      const paper = v['noise.paper']
      const inkL = 0.75 - paper * 0.38
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
      gl.uniform2fv(f.uDir, dir)
      gl.uniform1f(f.uScale, v['noise.scale'])
      gl.uniform1f(f.uDetail, 1 + v['noise.detail'] * 5)
      gl.uniform1f(f.uTurb, v['noise.turbulence'])
      gl.uniform1f(f.uSoft, 0.02 + v['noise.blur'] * 0.35)
      gl.uniform1f(f.uThreshold, 0.68 - v['noise.contrast'] * 0.28)
      gl.uniform1f(f.uFb, v['noise.feedback'])
      gl.uniform1f(f.uZoom, v['noise.zoom'])
      gl.uniform1f(f.uRot, v['noise.rotate'])
      gl.uniform1f(f.uDrift, v['noise.drift'])
      gl.uniform1f(f.uBlocks, v['distort.blocks'])
      gl.uniform3fv(f.uPaper, hsl(hue, sat * 0.25, 0.04 + paper * 0.93))
      gl.uniform3fv(f.uInkA, hsl(hue, sat, inkL))
      gl.uniform3fv(f.uInkB, hsl(hue + v['noise.spread'] * 0.5, sat, Math.min(0.85, inkL + 0.12)))
      gl.drawArrays(gl.TRIANGLES, 0, 3)

      gl.useProgram(present.prog)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.bindTexture(gl.TEXTURE_2D, write.tex)
      const pu = present.u
      gl.uniform1i(pu.uFrame, 0)
      gl.uniform2f(pu.uRes, w, h)
      gl.uniform1f(pu.uTime, time)
      gl.uniform1f(pu.uTear, v['distort.tear'])
      gl.uniform1f(pu.uPix, v['distort.pixelate'])
      gl.uniform1f(pu.uRgb, v['distort.rgb'])
      gl.uniform1f(pu.uStatic, v['distort.static'])
      gl.uniform1f(pu.uScan, v['distort.scanlines'])
      gl.uniform1f(pu.uGrain, v['distort.grain'])
      gl.uniform1f(pu.uHueShift, v['distort.hueshift'])
      gl.uniform1f(pu.uInvert, v['distort.invert'])
      gl.uniform1f(pu.uPost, v['distort.posterize'])
      gl.uniform1f(pu.uBurn, v['distort.burn'])
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      cur = 1 - cur
    },
  }
}
