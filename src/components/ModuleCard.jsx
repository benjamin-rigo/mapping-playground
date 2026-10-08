import { memo } from 'react'
import { Volume2 } from 'lucide-react'
import { RotaryKnob } from '@/components/RotaryKnob'
import { Slider } from '@/components/ui/slider'
import { ALGORITHMS, PARAM_BY_KEY, algoIndex, fullLabel } from '@/engine/params'

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
  const header = module.params.filter((p) => p.header)
  const params = module.params.filter((p) => !p.header)
  const subs = [...new Set(params.map((p) => p.sub))]
  const nameOf = (p) => `${module.label} ${fullLabel(PARAM_BY_KEY[`${module.id}.${p.id}`])}`
  return (
    <section className="rounded-lg border border-border bg-card px-2.5 py-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{module.label}</h3>
          <span className="block truncate text-[11px] text-muted-foreground">{module.hint}</span>
        </div>
        {header.map((p) => {
          const key = `${module.id}.${p.id}`
          return (
            <div
              key={key}
              onPointerDown={() => onSelect(key)}
              className={`flex shrink-0 items-center gap-2 rounded-md px-1.5 py-1 text-muted-foreground ${selected === key ? 'ring-2 ring-white' : ''}`}
            >
              <Volume2 className="size-4" aria-hidden />
              <Slider
                value={[knobs[key]]}
                min={0}
                max={1}
                step={0.01}
                onValueChange={([v]) => onKnob(v, key)}
                onFocus={() => onSelect(key)}
                aria-label={`${module.label} ${p.label}`}
                className="w-24"
              />
            </div>
          )
        })}
      </div>
      {children}
      <div className="space-y-2">
        {subs.map((sub) => (
          <div key={sub}>
            <div className="mb-1 text-[10px] font-medium tracking-wider text-muted-foreground/70 uppercase">{sub}</div>
            <div className="grid grid-cols-5 gap-x-0.5 gap-y-2">
              {params
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
                      name={nameOf(p)}
                      display={p.format?.(knobs[key], knobs)}
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
