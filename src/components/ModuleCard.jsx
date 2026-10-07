import { memo } from 'react'
import { RotaryKnob } from '@/components/RotaryKnob'
import { ALGORITHMS, algoIndex } from '@/engine/params'

function depthOf(patches, key) {
  let neg = 0
  let pos = 0
  for (const x of patches) {
    if (x.target !== key) continue
    if (x.source === 'hit') {
      if (x.amount < 0) neg += x.amount
      else pos += x.amount
    } else {
      neg -= Math.abs(x.amount)
      pos += Math.abs(x.amount)
    }
  }
  return [neg, pos]
}

export const ModuleCard = memo(function ModuleCard({ module, knobs, patches, selected, onKnob, onSelect, children }) {
  const subs = [...new Set(module.params.map((p) => p.sub))]
  return (
    <section className="rounded-lg border border-border bg-card px-3 py-3">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{module.label}</h3>
        <span className="truncate text-[11px] text-muted-foreground">{module.hint}</span>
      </div>
      {children}
      <div className="space-y-3">
        {subs.map((sub) => (
          <div key={sub}>
            <div className="mb-1.5 text-[10px] font-medium tracking-wider text-muted-foreground/70 uppercase">{sub}</div>
            <div className="grid grid-cols-4 gap-x-1 gap-y-3 sm:grid-cols-5">
              {module.params
                .filter((p) => p.sub === sub)
                .map((p) => {
                  const key = `${module.id}.${p.id}`
                  const [modNeg, modPos] = depthOf(patches, key)
                  // Harmonics/Timbre/Morph are renamed for the selected synth algorithm.
                  const label = p.macro != null ? ALGORITHMS[algoIndex(knobs['synth.algo'])].labels[p.macro] : p.label
                  return (
                    <RotaryKnob
                      key={key}
                      id={key}
                      label={label}
                      name={`${module.label} ${p.label}`}
                      display={p.format?.(knobs[key])}
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
          </div>
        ))}
      </div>
    </section>
  )
})
