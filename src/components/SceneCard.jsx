import { memo } from 'react'
import { Dices } from 'lucide-react'
import { RotaryKnob } from '@/components/RotaryKnob'
import { Button } from '@/components/ui/button'
import { MACROS, SOUND_ENGINES, VISUAL_ENGINES } from '@/engine/scenes'
import { cn } from '@/lib/utils'

function EnginePicker({ engines, value, onChange, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-4 gap-1">
      {Object.entries(engines).map(([id, e]) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          title={e.hint}
          onClick={() => onChange(id)}
          className={cn(
            'rounded-md border px-1 py-1.5 text-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
            value === id ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:text-foreground',
          )}
        >
          {e.label}
        </button>
      ))}
    </div>
  )
}

function Part({ part, label, engines, value, onChange, onSelect, selected, depth }) {
  return (
    <div className="space-y-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <EnginePicker engines={engines} value={value.engine} label={`${label} engine`} onChange={(engine) => onChange({ ...value, engine })} />
      <div className="grid grid-cols-3">
        {MACROS.map((m) => {
          const key = `${part}.${m}`
          return (
            <RotaryKnob
              key={m}
              id={key}
              label={m[0].toUpperCase() + m.slice(1)}
              name={`${label} ${m}`}
              value={value[m]}
              defaultValue={0.5}
              onChange={(v) => onChange({ ...value, [m]: v })}
              onSelect={onSelect}
              selected={selected === key}
              modNeg={-depth[key]}
              modPos={depth[key]}
            />
          )
        })}
      </div>
    </div>
  )
}

export const SceneCard = memo(function SceneCard({ title, tone, scene, onChange, onRandomize, onSelect, selected, depth }) {
  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className={cn('text-sm font-semibold', tone)}>{title}</h3>
        <Button variant="ghost" size="sm" onClick={onRandomize} aria-label={`Randomize ${title}`}>
          <Dices /> Random
        </Button>
      </div>
      <Part
        part="sound"
        label="Sound"
        engines={SOUND_ENGINES}
        value={scene.sound}
        onChange={(sound) => onChange({ ...scene, sound })}
        onSelect={onSelect}
        selected={selected}
        depth={depth}
      />
      <Part
        part="visual"
        label="Visual"
        engines={VISUAL_ENGINES}
        value={scene.visual}
        onChange={(visual) => onChange({ ...scene, visual })}
        onSelect={onSelect}
        selected={selected}
        depth={depth}
      />
    </section>
  )
})
