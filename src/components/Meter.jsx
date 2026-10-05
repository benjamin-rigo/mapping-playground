import { createContext, useContext, useEffect, useRef } from 'react'

// Provides the running engine (its live sources and modulated knob values).
export const EngineContext = createContext(null)

export function Meter({ id, className = '' }) {
  const engine = useContext(EngineContext)
  const bar = useRef(null)
  useEffect(() => {
    if (!engine) return
    let raf
    const loop = () => {
      if (bar.current) bar.current.style.transform = `scaleX(${engine.sources.latest[id] ?? 0})`
      raf = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [engine, id])
  return (
    <div className={`h-1 overflow-hidden rounded-full bg-muted ${className}`} aria-hidden>
      <div ref={bar} className="h-full origin-left scale-x-0 bg-orange-400" />
    </div>
  )
}
