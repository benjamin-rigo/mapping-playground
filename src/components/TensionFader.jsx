import { useContext, useEffect, useRef } from 'react'
import { EngineContext } from '@/components/Meter'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'

const PREVIEW = [
  ['calm', 'Calm'],
  [null, 'Live'],
  ['storm', 'Storm'],
]

// The Calm <-> Storm crossfader. The slider is the resting position; the orange
// marker shows where the data is pushing it right now.
export function TensionFader({ value, onChange, selected, onSelect, preview, onPreview }) {
  const engine = useContext(EngineContext)
  const marker = useRef(null)

  useEffect(() => {
    if (!engine) return
    let raf
    const loop = () => {
      if (marker.current) marker.current.style.left = `${engine.live.tension * 100}%`
      raf = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [engine])

  return (
    <section
      className={cn('rounded-lg border bg-card p-4', selected ? 'border-orange-400/70' : 'border-border')}
      onPointerDown={onSelect}
    >
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Tension</h3>
        <span className="font-mono text-[11px] text-muted-foreground">{Math.round(value * 100)}%</span>
      </div>
      <div className="relative">
        <Slider value={[value]} min={0} max={1} step={0.01} onValueChange={([v]) => onChange(v)} aria-label="Tension" className="py-2" />
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-0">
          <div ref={marker} className="absolute -top-2.5 h-5 w-1 -translate-x-1/2 rounded-full bg-orange-400 shadow-[0_0_8px] shadow-orange-400/70" />
        </div>
      </div>
      <div className="mt-2 flex justify-between text-xs">
        <span className="text-sky-300">Calm</span>
        <span className="text-orange-300">Storm</span>
      </div>
      <div role="radiogroup" aria-label="Preview" className="mt-3 grid grid-cols-3 gap-1 rounded-md bg-muted p-0.5 text-xs">
        {PREVIEW.map(([id, label]) => (
          <button
            key={label}
            type="button"
            role="radio"
            aria-checked={preview === id}
            onClick={() => onPreview(id)}
            className={cn(
              'rounded px-2 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring',
              preview === id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground',
            )}
          >
            {id ? `Hold ${label}` : 'Live data'}
          </button>
        ))}
      </div>
    </section>
  )
}
