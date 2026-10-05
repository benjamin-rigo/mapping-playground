import { memo } from 'react'
import { RotaryKnob } from '@/components/RotaryKnob'

function modRange(patches, key) {
  let neg = 0
  let pos = 0
  for (const x of patches) {
    if (x.target !== key) continue
    if (x.amount < 0) neg += x.amount
    else pos += x.amount
  }
  return [neg, pos]
}

export const ModuleCard = memo(function ModuleCard({ module, knobs, patches, selected, onKnob, onSelect }) {
  return (
    <section className="rounded-lg border border-border bg-card px-3 py-3">
      <h3 className="mb-3 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{module.label}</h3>
      <div className="grid grid-cols-4 gap-x-1 gap-y-3">
        {module.params.map((p) => {
          const key = `${module.id}.${p.id}`
          const [modNeg, modPos] = modRange(patches, key)
          return (
            <RotaryKnob
              key={key}
              id={key}
              label={p.label}
              name={`${module.label} ${p.label}`}
              value={knobs[key]}
              defaultValue={p.value}
              onChange={onKnob}
              onSelect={p.patchable !== false ? onSelect : undefined}
              selected={selected === key}
              modNeg={modNeg}
              modPos={modPos}
            />
          )
        })}
      </div>
    </section>
  )
})
