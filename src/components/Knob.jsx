import { Slider } from '@/components/ui/slider'

export function Knob({ label, value, display, min = 0, max = 1, step = 0.01, onChange, patchedBy, name }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          {label}
          {patchedBy?.length > 0 && (
            <span
              className="size-1.5 rounded-full bg-orange-400"
              title={`Patched from ${patchedBy.join(', ')}`}
              aria-label={`patched from ${patchedBy.join(', ')}`}
            />
          )}
        </span>
        <span className="font-mono tabular-nums text-foreground">{display ?? value.toFixed(2)}</span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v)}
        aria-label={name ?? label}
        className="py-1.5"
      />
    </div>
  )
}
