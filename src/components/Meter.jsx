import { createContext, useContext, useEffect, useRef } from 'react'

// Provides the running engine (its live sources and modulated knob values).
export const EngineContext = createContext(null)

const HISTORY = 120 // samples, ~4 s at 30 Hz
const LINE = '#ffffff'

// A small oscilloscope for one source: its value over the last few seconds, a dashed
// centre line for bipolar sources (no modulation there), and a tick at the bottom
// for every incoming attack, so both the shape and the density are visible.
export function SourceScope({ id, unipolar }) {
  const engine = useContext(EngineContext)
  const canvas = useRef(null)
  const readout = useRef(null)

  useEffect(() => {
    if (!engine) return
    const values = new Float32Array(HISTORY)
    const ticks = new Uint8Array(HISTORY)
    let head = 0
    let pendingTick = false
    let acc = 0
    let last = performance.now()
    let raf
    const off = engine.subscribe(() => (pendingTick = true))

    const draw = () => {
      const c = canvas.current
      if (!c) return
      const dpr = window.devicePixelRatio || 1
      const w = c.clientWidth
      const h = c.clientHeight
      if (c.width !== Math.round(w * dpr)) {
        c.width = Math.round(w * dpr)
        c.height = Math.round(h * dpr)
      }
      const g = c.getContext('2d')
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      g.clearRect(0, 0, w, h)
      const plotH = h - 5
      g.strokeStyle = 'rgba(255,255,255,0.14)'
      g.setLineDash(unipolar ? [] : [2, 3])
      g.beginPath()
      const base = unipolar ? plotH : plotH / 2
      g.moveTo(0, base)
      g.lineTo(w, base)
      g.stroke()
      g.setLineDash([])

      g.strokeStyle = LINE
      g.lineWidth = 1.5
      g.beginPath()
      for (let i = 0; i < HISTORY; i++) {
        const v = values[(head + i) % HISTORY]
        const x = (i / (HISTORY - 1)) * w
        const y = plotH - v * (plotH - 2) - 1
        if (i === 0) g.moveTo(x, y)
        else g.lineTo(x, y)
      }
      g.stroke()

      g.fillStyle = 'rgba(255,255,255,0.55)'
      for (let i = 0; i < HISTORY; i++) {
        if (ticks[(head + i) % HISTORY]) g.fillRect((i / (HISTORY - 1)) * w - 0.5, h - 3, 1, 3)
      }
    }

    const loop = (now) => {
      acc += now - last
      last = now
      if (acc >= 33) {
        acc = 0
        values[head] = engine.sources.latest[id] ?? 0
        ticks[head] = pendingTick ? 1 : 0
        pendingTick = false
        head = (head + 1) % HISTORY
        draw()
        if (readout.current) readout.current.textContent = (engine.sources.latest[id] ?? 0).toFixed(2)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      off()
    }
  }, [engine, id, unipolar])

  return (
    <div className="space-y-0.5" aria-hidden>
      <canvas ref={canvas} className="block h-7 w-full rounded-sm bg-muted/40" />
      <div ref={readout} className="font-mono text-[10px] leading-none text-muted-foreground tabular-nums">
        0.00
      </div>
    </div>
  )
}
