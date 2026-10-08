import { memo, useContext, useEffect, useRef } from 'react'
import { EngineContext } from '@/components/Meter'
import { useDrag } from '@/components/useDrag'
import { cn } from '@/lib/utils'

const SIZE = 36
const R = 14
const START = -135
const SWEEP = 270
const clamp01 = (v) => Math.max(0, Math.min(1, v))

function point(v, r) {
  const a = ((START + SWEEP * v - 90) * Math.PI) / 180
  return [SIZE / 2 + r * Math.cos(a), SIZE / 2 + r * Math.sin(a)]
}

function arc(from, to) {
  const a0 = ((START + SWEEP * from - 90) * Math.PI) / 180
  const a1 = ((START + SWEEP * to - 90) * Math.PI) / 180
  const c = SIZE / 2
  const large = (to - from) * SWEEP > 180 ? 1 : 0
  return `M ${c + R * Math.cos(a0)} ${c + R * Math.sin(a0)} A ${R} ${R} 0 ${large} 1 ${c + R * Math.cos(a1)} ${c + R * Math.sin(a1)}`
}

// Drag up/down (touch: left/right) to turn; touching it selects it (highlights its row in the matrix);
// double-click to reset. The faint white arc is the modulation range; the bright
// arc and dot show where the data is pushing it right now.
export const RotaryKnob = memo(function RotaryKnob({ id, label, name, value, defaultValue, onChange, onSelect, selected, modNeg = 0, modPos = 0, display }) {
  const engine = useContext(EngineContext)
  const liveArc = useRef(null)
  const liveDot = useRef(null)
  const valueRef = useRef(value)
  useEffect(() => {
    valueRef.current = value
  }, [value])
  const modulated = modPos - modNeg > 0.005

  // Animate the live modulated value straight into the SVG, without re-rendering.
  useEffect(() => {
    if (!modulated || !engine || !id) return
    let raf
    const loop = () => {
      const live = engine.live[id]
      if (live != null && liveArc.current) {
        const base = valueRef.current
        const [x, y] = point(live, R)
        liveDot.current.setAttribute('cx', x)
        liveDot.current.setAttribute('cy', y)
        liveDot.current.style.opacity = 1
        liveArc.current.setAttribute('d', Math.abs(live - base) > 0.003 ? arc(Math.min(live, base), Math.max(live, base)) : '')
      }
      raf = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [modulated, engine, id])

  const start = useRef(value)
  const drag = useDrag({
    onStart(e) {
      start.current = valueRef.current
      // on touch, select on tap or drag only, so swiping past knobs to scroll doesn't
      if (e.pointerType !== 'touch') onSelect?.(id)
    },
    onEnd(moved, cancelled, touch) {
      if (touch && !cancelled) onSelect?.(id)
    },
    onDrag(dy, e) {
      onChange(Math.round(clamp01(start.current + dy / (e.shiftKey ? 600 : 150)) * 100) / 100, id)
    },
  })
  function onKeyDown(e) {
    const step = { ArrowUp: 0.01, ArrowRight: 0.01, ArrowDown: -0.01, ArrowLeft: -0.01, PageUp: 0.1, PageDown: -0.1 }[e.key]
    if (step) {
      e.preventDefault()
      onChange(Math.round(clamp01(value + step) * 100) / 100, id)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect?.(id)
    }
  }

  const lo = clamp01(value + modNeg)
  const hi = clamp01(value + modPos)

  return (
    <div className="flex min-w-0 flex-col items-center gap-0.5">
      <div
        role="slider"
        tabIndex={0}
        aria-label={name ?? label}
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={value}
        aria-valuetext={display ?? value.toFixed(2)}
        {...drag}
        onFocus={() => onSelect?.(id)}
        onDoubleClick={() => defaultValue != null && onChange(defaultValue, id)}
        onKeyDown={onKeyDown}
        className={cn(
          'cursor-ns-resize touch-pan-y rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
          selected && 'ring-2 ring-white',
        )}
      >
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden>
          <path d={arc(0, 1)} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="text-muted" />
          {value > 0.005 && (
            <path
              d={arc(0, value)}
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              className={modulated ? 'text-muted-foreground' : 'text-foreground'}
            />
          )}
          {modulated && <path d={arc(lo, hi)} fill="none" stroke="currentColor" strokeWidth="5" className="text-white/25" />}
          {modulated && <path ref={liveArc} fill="none" stroke="currentColor" strokeWidth="5" className="text-white" />}
          {modulated && <circle ref={liveDot} r="3" className="fill-white" style={{ opacity: 0 }} />}
          <circle cx={point(value, 7)[0]} cy={point(value, 7)[1]} r="1.8" className="fill-foreground" />
        </svg>
      </div>
      <span className={cn('max-w-full truncate text-[10px] leading-tight', selected ? 'font-medium text-white' : 'text-muted-foreground')}>
        {label}
      </span>
      <span className="font-mono text-[10px] leading-none tabular-nums text-muted-foreground/80">{display ?? value.toFixed(2)}</span>
    </div>
  )
})
