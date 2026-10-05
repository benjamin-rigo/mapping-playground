import { Knob } from '@/components/Knob'
import { SOURCES } from '@/engine/params'

const sourceLabel = Object.fromEntries(SOURCES.map((s) => [s.id, s.label]))

export function ModuleCard({ module, knobs, patches, onKnob, children }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-4 text-xs font-medium tracking-wider text-muted-foreground uppercase">{module.label}</h3>
      <div className="grid grid-cols-2 gap-x-5 gap-y-4">
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
              patchedBy={patches.filter((x) => x.target === key).map((x) => sourceLabel[x.source])}
            />
          )
        })}
      </div>
    </section>
  )
}
