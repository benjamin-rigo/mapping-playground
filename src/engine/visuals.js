import { DEFAULTS } from './settings.js'

const PAPER = '#e7e9ea'
const INK = '#141414'
const lerp = (a, b, t) => a + (b - a) * t

function makeGrain(size = 160) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  const img = g.createImageData(size, size)
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v
    img.data[i + 3] = Math.random() * 90
  }
  g.putImageData(img, 0, 0)
  return c
}

// Halftone intensity field: events paint soft blobs into a low-res grid that
// decays each frame; every cell is drawn as a square ink dot sized by intensity.
export function createVisuals(canvas) {
  const ctx = canvas.getContext('2d')
  const grain = ctx.createPattern(makeGrain(), 'repeat')
  let look = DEFAULTS.look
  let W = 0, H = 0, dpr = 1, cell = 14, cols = 0, rows = 0
  let field = new Float32Array(0)
  let tint = new Float32Array(0)
  let gridLayer = null
  const soft = document.createElement('canvas')
  const softCtx = soft.getContext('2d')
  let softImg = null
  let annotations = []
  let fade = 0.35
  let glitchFrames = 0
  let glitchAmt = 0
  let glitchAt = { x: 0, y: 0 }
  let last = performance.now()
  let raf = 0

  function layout() {
    W = canvas.clientWidth
    H = canvas.clientHeight
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    cell = Math.round(lerp(22, 7, look.grid))
    cols = Math.ceil(W / cell)
    rows = Math.ceil(H / cell)
    field = new Float32Array(cols * rows)
    tint = new Float32Array(cols * rows)
    annotations = []
    soft.width = cols
    soft.height = rows
    softImg = softCtx.createImageData(cols, rows)

    gridLayer = document.createElement('canvas')
    gridLayer.width = canvas.width
    gridLayer.height = canvas.height
    const g = gridLayer.getContext('2d')
    g.scale(dpr, dpr)
    g.fillStyle = 'rgba(20,20,20,0.13)'
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) g.fillRect(x * cell + cell / 2 - 0.5, y * cell + cell / 2 - 0.5, 1, 1)
  }

  function addEvent(event, v) {
    if (!cols) return
    const cx = lerp(0.06, 0.94, v.posX) * cols
    const cy = lerp(0.06, 0.94, v.posY) * rows
    const r = (lerp(0.015, 0.16, v.size) * Math.min(W, H)) / cell
    const k = lerp(8, 1.5, v.softness)
    const amount = lerp(0.25, 1.2, v.ink) * (event.burst ? 0.7 : 1)
    const reach = Math.ceil(r * 1.6)
    for (let y = Math.max(0, Math.floor(cy - reach)); y < Math.min(rows, cy + reach); y++) {
      for (let x = Math.max(0, Math.floor(cx - reach)); x < Math.min(cols, cx + reach); x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r
        const f = Math.exp(-(d ** k) * 3)
        if (f < 0.01) continue
        const i = y * cols + x
        field[i] = Math.min(1.5, field[i] + amount * f)
        tint[i] = Math.min(1.5, tint[i] + v.accent * amount * f)
      }
    }
    fade = v.fade
    if (v.glitch > 0.5 && Math.random() < v.glitch) {
      glitchAt = { x: cx, y: cy }
      glitchFrames = Math.max(glitchFrames, Math.round(6 + v.glitch * 14))
      glitchAmt = v.glitch
    }
    if (look.annotations) {
      annotations.push({ x: cx * cell, y: cy * cell, text: `${event.ip}:${event.port}`, life: 1 })
      if (annotations.length > (W < 640 ? 5 : 12)) annotations.shift()
    }
  }

  // Blurry halo under the crisp dots: the low-res field upscaled with smoothing.
  function drawSoft() {
    const px = softImg.data
    for (let i = 0; i < field.length; i++) {
      px[i * 4 + 3] = Math.min(255, field[i] * 140)
    }
    softCtx.putImageData(softImg, 0, 0)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.globalAlpha = 0.3
    ctx.drawImage(soft, -cell, -cell, cols * cell + 2 * cell, rows * cell + 2 * cell)
    ctx.globalAlpha = 1
  }

  function drawCells() {
    const inkPath = new Path2D()
    const accentPath = new Path2D()
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x
        const I = field[i]
        if (I < 0.03) continue
        const s = cell * Math.min(1, Math.sqrt(I)) * 0.9
        const o = (cell - s) / 2
        ;(tint[i] > I * 0.7 ? accentPath : inkPath).rect(x * cell + o, y * cell + o, s, s)
      }
    }
    ctx.fillStyle = INK
    ctx.fill(inkPath)
    ctx.fillStyle = look.accent
    ctx.fill(accentPath)
  }

  function drawGlitch() {
    const blocks = 2 + Math.floor(glitchAmt * 6)
    for (let b = 0; b < blocks; b++) {
      const size = 2 + Math.floor(Math.random() * 5)
      const spread = 4 + glitchAmt * 14
      const bx = Math.max(0, Math.min(cols - size, Math.round(glitchAt.x + (Math.random() - 0.5) * spread * 2)))
      const by = Math.max(0, Math.min(rows - size, Math.round(glitchAt.y + (Math.random() - 0.5) * spread)))
      ctx.fillStyle = Math.random() < 0.35 ? look.accent : INK
      ctx.fillRect(bx * cell, by * cell, size * cell, size * cell)
      ctx.fillStyle = PAPER
      for (let y = by; y < by + size; y++) {
        for (let x = bx; x < bx + size; x++) {
          const I = field[y * cols + x]
          if (I < 0.03) continue
          const s = cell * Math.min(1, Math.sqrt(I)) * 0.9
          ctx.fillRect(x * cell + (cell - s) / 2, y * cell + (cell - s) / 2, s, s)
        }
      }
    }
    if (Math.random() < glitchAmt) {
      const h = cell * (1 + Math.floor(Math.random() * 4))
      const y = Math.max(0, Math.min(H - h, glitchAt.y * cell + (Math.random() - 0.5) * cell * 10))
      const dx = (Math.random() - 0.5) * cell * 8 * glitchAmt
      ctx.drawImage(canvas, 0, y * dpr, canvas.width, h * dpr, dx, y, W, h)
    }
    glitchFrames--
  }

  function drawAnnotations(dt) {
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.lineWidth = 1
    for (const a of annotations) {
      ctx.globalAlpha = Math.max(0, a.life)
      ctx.strokeStyle = look.accent
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(a.x + 26, a.y - 22)
      ctx.stroke()
      ctx.fillStyle = INK
      ctx.fillText(a.text, a.x + 30, a.y - 24)
      a.life -= dt * 0.35
    }
    ctx.globalAlpha = 1
    annotations = annotations.filter((a) => a.life > 0)
  }

  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    if (canvas.clientWidth !== W || canvas.clientHeight !== H) layout()

    const decay = lerp(0.992, 0.9, fade) ** (dt * 60)
    for (let i = 0; i < field.length; i++) {
      field[i] *= decay
      tint[i] *= decay
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = PAPER
    ctx.fillRect(0, 0, W, H)
    ctx.drawImage(gridLayer, 0, 0, W, H)
    drawSoft()
    drawCells()
    if (glitchFrames > 0) drawGlitch()
    drawAnnotations(dt)

    if (look.grain > 0) {
      const ox = Math.random() * 160
      const oy = Math.random() * 160
      ctx.globalAlpha = look.grain * 0.6
      ctx.translate(ox, oy)
      ctx.fillStyle = grain
      ctx.fillRect(-ox, -oy, W, H)
      ctx.globalAlpha = 1
    }
    raf = requestAnimationFrame(frame)
  }

  raf = requestAnimationFrame(frame)

  return {
    addEvent,
    setLook(l) {
      const regrid = l.grid !== look.grid
      look = l
      if (regrid && W) layout()
    },
    destroy() {
      cancelAnimationFrame(raf)
    },
  }
}
