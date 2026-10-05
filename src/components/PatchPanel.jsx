import { useEffect, useRef } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { MODULES, SOURCES } from '@/engine/params'

const TARGET_GROUPS = MODULES.map((m) => ({ ...m, params: m.params.filter((p) => p.patchable !== false) })).filter(
  (m) => m.params.length,
)

function Meter({ sources, id }) {
  const bar = useRef(null)
  useEffect(() => {
    let raf
    const loop = () => {
      if (bar.current) bar.current.style.transform = `scaleX(${sources.latest[id] ?? 0})`
      raf = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [sources, id])
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
      <div ref={bar} className="h-full origin-left bg-orange-400 transition-transform duration-75" />
    </div>
  )
}

function PatchRow({ patch, sources, onChange, onRemove }) {
  const pct = Math.round(patch.amount * 100)
  return (
    <li className="space-y-3 rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        <Select value={patch.source} onValueChange={(source) => onChange({ ...patch, source })}>
          <SelectTrigger className="w-full min-w-0 flex-1" aria-label="Patch source">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            {SOURCES.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground" aria-hidden>
          →
        </span>
        <Select value={patch.target} onValueChange={(target) => onChange({ ...patch, target })}>
          <SelectTrigger className="w-full min-w-0 flex-1" aria-label="Patch target">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" className="max-h-80">
            {TARGET_GROUPS.map((m) => (
              <SelectGroup key={m.id}>
                <SelectLabel>{m.label}</SelectLabel>
                {m.params.map((p) => (
                  <SelectItem key={p.id} value={`${m.id}.${p.id}`}>
                    {m.label} · {p.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon" onClick={onRemove} aria-label="Remove patch">
          <X />
        </Button>
      </div>
      <div className="flex items-center gap-3">
        <div className="w-16 shrink-0">
          <Meter sources={sources} id={patch.source} />
        </div>
        <Slider
          value={[patch.amount]}
          min={-1}
          max={1}
          step={0.01}
          onValueChange={([amount]) => onChange({ ...patch, amount })}
          aria-label="Patch amount"
          className="flex-1 py-1.5"
        />
        <span className="w-12 text-right font-mono text-xs tabular-nums">
          {pct > 0 ? '+' : ''}
          {pct}%
        </span>
      </div>
    </li>
  )
}

export function PatchPanel({ patches, sources, onChange }) {
  const update = (i, p) => onChange(patches.map((x, j) => (j === i ? p : x)))
  const remove = (i) => onChange(patches.filter((_, j) => j !== i))
  const add = () => onChange([...patches, { source: 'random', target: 'voice.pan', amount: 0.5 }])

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        A patch sends a data source into any knob. The knob is the resting value, the amount is how far the data
        pushes it (negative inverts). The bar shows the source live.
      </p>
      <ul className="space-y-3">
        {patches.map((p, i) => (
          <PatchRow key={i} patch={p} sources={sources} onChange={(x) => update(i, x)} onRemove={() => remove(i)} />
        ))}
      </ul>
      <Button variant="outline" className="w-full" onClick={add} disabled={patches.length >= 32}>
        <Plus /> Add patch
      </Button>
      <section className="space-y-3">
        <h3 className="text-xs font-medium tracking-wider text-muted-foreground uppercase">Sources</h3>
        <ul className="space-y-2.5">
          {SOURCES.map((s) => (
            <li key={s.id} className="grid grid-cols-[7.5rem_1fr] items-center gap-3 text-xs" title={s.hint}>
              <span>{s.label}</span>
              <Meter sources={sources} id={s.id} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
