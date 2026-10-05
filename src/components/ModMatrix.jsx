import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { Meter } from '@/components/Meter'
import { Button } from '@/components/ui/button'
import { PARAMS, SOURCES, setPatch } from '@/engine/params'
import { cn } from '@/lib/utils'

const clamp = (v) => Math.max(-1, Math.min(1, v))

// One matrix cell: drag up/down to set how much this data source moves the target.
// Click an empty cell for +50%, double-click to clear.
function AmountCell({ amount, label, onChange }) {
  const drag = useRef(null)
  const pct = Math.round(amount * 100)

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={-100}
      aria-valuemax={100}
      aria-valuenow={pct}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current = { y: e.clientY, v: amount, moved: false }
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d) return
        const dy = d.y - e.clientY
        if (Math.abs(dy) > 2) d.moved = true
        if (d.moved) onChange(Math.round(clamp(d.v + dy / 120) * 100) / 100)
      }}
      onPointerUp={() => {
        if (drag.current && !drag.current.moved && amount === 0) onChange(0.5)
        drag.current = null
      }}
      onDoubleClick={() => onChange(0)}
      onKeyDown={(e) => {
        const step = { ArrowUp: 0.05, ArrowRight: 0.05, ArrowDown: -0.05, ArrowLeft: -0.05 }[e.key]
        if (step) {
          e.preventDefault()
          onChange(Math.round(clamp(amount + step) * 100) / 100)
        } else if (e.key === 'Delete' || e.key === 'Backspace') onChange(0)
      }}
      className={cn(
        'flex h-7 cursor-ns-resize touch-none items-center justify-center rounded font-mono text-[11px] tabular-nums outline-none select-none focus-visible:ring-2 focus-visible:ring-ring',
        amount === 0 ? 'text-muted-foreground/50 hover:bg-muted' : amount > 0 ? 'text-orange-100' : 'text-sky-100',
      )}
      style={
        amount !== 0
          ? { background: amount > 0 ? `rgba(251,146,60,${0.15 + Math.abs(amount) * 0.55})` : `rgba(56,189,248,${0.15 + Math.abs(amount) * 0.55})` }
          : undefined
      }
    >
      {amount === 0 ? '·' : `${pct > 0 ? '+' : ''}${pct}`}
    </div>
  )
}

export function ModMatrix({ settings, selected, onSelect, onPatches, className }) {
  const { patches } = settings
  const rows = PARAMS.filter((p) => p.patchable && (p.key === selected || patches.some((x) => x.target === p.key)))
  const rowRefs = useRef({})

  useEffect(() => {
    rowRefs.current[selected]?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const amountOf = (source, target) => patches.find((x) => x.source === source && x.target === target)?.amount ?? 0

  return (
    <section className={cn('@container overflow-auto', className)} aria-label="Modulation matrix">
      <table className="w-full table-fixed border-separate border-spacing-x-1 border-spacing-y-0.5 text-xs">
        <thead className="sticky top-0 z-10 bg-background">
          <tr>
            <th className="w-[30%] py-2 pl-1 text-left text-[11px] font-medium tracking-wider text-muted-foreground uppercase @[36rem]:w-48">
              Matrix
            </th>
            {SOURCES.map((s) => (
              <th key={s.id} className="py-2 font-normal" title={`${s.label}: ${s.hint}`}>
                <div className="mb-1 truncate text-[11px] text-foreground">
                  <span className="@[36rem]:hidden">{s.short}</span>
                  <span className="hidden @[36rem]:inline">{s.label}</span>
                </div>
                <Meter id={s.id} />
              </th>
            ))}
            <th className="w-7" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={SOURCES.length + 2} className="py-4 pl-1 text-muted-foreground">
                Click any knob, then drag a cell up or down to let that data move it.
              </td>
            </tr>
          )}
          {rows.map((p) => (
            <tr
              key={p.key}
              ref={(el) => (rowRefs.current[p.key] = el)}
              className={cn(p.key === selected && '[&>*]:bg-orange-400/10')}
            >
              <th className="rounded-l pl-1 text-left font-normal">
                <button
                  type="button"
                  onClick={() => onSelect(p.key)}
                  className={cn('block w-full truncate py-0.5 text-left leading-tight outline-none focus-visible:underline', p.key === selected ? 'text-orange-300' : 'text-foreground')}
                >
                  <span className="block truncate text-[10px] text-muted-foreground @[36rem]:inline @[36rem]:text-xs">
                    {p.module.label}
                    <span className="hidden @[36rem]:inline"> · </span>
                  </span>
                  {p.label}
                </button>
              </th>
              {SOURCES.map((s) => (
                <td key={s.id}>
                  <AmountCell
                    amount={amountOf(s.id, p.key)}
                    label={`${s.label} to ${p.module.label} ${p.label}`}
                    onChange={(a) => onPatches(setPatch(patches, s.id, p.key, a))}
                  />
                </td>
              ))}
              <td className="rounded-r">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Clear ${p.module.label} ${p.label}`}
                  onClick={() => onPatches(patches.filter((x) => x.target !== p.key))}
                >
                  <X />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
