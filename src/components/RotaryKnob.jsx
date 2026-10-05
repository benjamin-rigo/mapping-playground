import { memo, useRef } from 'react'
import { cn } from '@/lib/utils'

const SIZE = 44
const R = 17
const START = -135
const SWEEP = 270
const clamp01 = (v) => Math.max(0, Math.min(1, v))

function arc(from, to) {
  const a0 = ((START + SWEEP * from - 90) * Math.PI) / 180
  const a1 = ((START + SWEEP * to - 90) * Math.PI) / 180
  const c = SIZE / 2
  const large = (to - from) * SWEEP > 180 ? 1 : 0
  return `M ${c + R * Math.cos(a0)} ${c + R * Math.sin(a0)} A ${R} ${R} 0 ${large} 1 ${c + R * Math.cos(a1)} ${c + R * Math.sin(a1)}`
}

// Drag up/down to turn; touching it selects it (highlights its row in the matrix);
// double-click to reset. The orange arc shows how far patched data can move it.
export const RotaryKnob = memo(function RotaryKnob({ id, label, name, value, defaultValue, onChange, onSelect, selected, modNeg = 0, modPos = 0, display }) {
  const drag = useRef(null)

  function onPointerDown(e) {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { y: e.clientY, v: value }
    onSelect?.(id)
  }
  function onPointerMove(e) {
    const d = drag.current
    if (!d) return
    onChange(Math.round(clamp01(d.v + (d.y - e.clientY) / (e.shiftKey ? 600 : 150)) * 100) / 100, id)
  }
  function onPointerUp() {
    drag.current = null
  }
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
    <div className="flex flex-col items-center gap-1">
      <div
        role="slider"
        tabIndex={0}
        aria-label={name ?? label}
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={value}
        aria-valuetext={display ?? value.toFixed(2)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onFocus={() => onSelect?.(id)}
        onDoubleClick={() => defaultValue != null && onChange(defaultValue, id)}
        onKeyDown={onKeyDown}
        className={cn(
          'cursor-ns-resize touch-none rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
          selected && 'ring-2 ring-orange-400',
        )}
      >
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden>
          <path d={arc(0, 1)} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="text-muted" />
          {value > 0.005 && (
            <path d={arc(0, value)} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="text-foreground" />
          )}
          {hi - lo > 0.005 && <path d={arc(lo, hi)} fill="none" stroke="currentColor" strokeWidth="5" className="text-orange-400/70" />}
          <circle
            cx={SIZE / 2 + 9 * Math.cos(((START + SWEEP * value - 90) * Math.PI) / 180)}
            cy={SIZE / 2 + 9 * Math.sin(((START + SWEEP * value - 90) * Math.PI) / 180)}
            r="2"
            className="fill-foreground"
          />
        </svg>
      </div>
      <span className={cn('max-w-16 truncate text-[11px] leading-tight', selected ? 'text-orange-300' : 'text-muted-foreground')}>
        {label}
      </span>
      <span className="font-mono text-[10px] leading-none tabular-nums text-muted-foreground/80">{display ?? value.toFixed(2)}</span>
    </div>
  )
})
