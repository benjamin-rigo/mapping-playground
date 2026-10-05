import { createContext, useContext, useEffect, useRef } from 'react'

export const SourcesContext = createContext(null)

export function Meter({ id, className = '' }) {
  const sources = useContext(SourcesContext)
  const bar = useRef(null)
  useEffect(() => {
    if (!sources) return
    let raf
    const loop = () => {
      if (bar.current) bar.current.style.transform = `scaleX(${sources.latest[id] ?? 0})`
      raf = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [sources, id])
  return (
    <div className={`h-1 overflow-hidden rounded-full bg-muted ${className}`} aria-hidden>
      <div ref={bar} className="h-full origin-left scale-x-0 bg-orange-400" />
    </div>
  )
}
