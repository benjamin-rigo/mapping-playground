import { Knob } from '@/components/Knob'

export function ModuleCard({ module, settings, onKnob, onPatches, children, title = module.label }) {
  const { knobs, patches } = settings
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-4 text-xs font-medium tracking-wider text-muted-foreground uppercase">{title}</h3>
      <div className="grid grid-cols-2 items-start gap-x-5 gap-y-4">
        {children}
        {module.params.map((p) => {
          const key = `${module.id}.${p.id}`
          return (
            <Knob
              key={key}
              label={p.label}
              name={`${module.label} ${p.label}`}
              value={knobs[key]}
              onChange={(v) => onKnob(key, v)}
              patchable={p.patchable !== false}
              patches={patches.map((patch, index) => ({ patch, index })).filter((x) => x.patch.target === key)}
              onAddPatch={(source) => onPatches([...patches, { source, target: key, amount: 0.5 }])}
              onPatchChange={(i, patch) => onPatches(patches.map((x, j) => (j === i ? patch : x)))}
              onPatchRemove={(i) => onPatches(patches.filter((_, j) => j !== i))}
            />
          )
        })}
      </div>
    </section>
  )
}
