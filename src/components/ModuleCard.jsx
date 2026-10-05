import { RotaryKnob } from '@/components/RotaryKnob'

export function modRange(patches, key) {
  let neg = 0
  let pos = 0
  for (const x of patches) {
    if (x.target !== key) continue
    if (x.amount < 0) neg += x.amount
    else pos += x.amount
  }
  return { neg, pos }
}

export function ModuleCard({ module, settings, selected, onKnob, onSelect, children, title = module.label }) {
  return (
    <section className="rounded-lg border border-border bg-card px-3 py-3">
      <h3 className="mb-3 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{title}</h3>
      <div className="grid grid-cols-4 gap-x-1 gap-y-3">
        {children}
        {module.params.map((p) => {
          const key = `${module.id}.${p.id}`
          const patchable = p.patchable !== false
          return (
            <RotaryKnob
              key={key}
              label={p.label}
              name={`${module.label} ${p.label}`}
              value={settings.knobs[key]}
              defaultValue={p.value}
              onChange={(v) => onKnob(key, v)}
              onSelect={patchable ? () => onSelect(key) : undefined}
              selected={selected === key}
              mod={modRange(settings.patches, key)}
            />
          )
        })}
      </div>
    </section>
  )
}
