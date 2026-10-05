import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { FIELDS } from '@/engine/settings'

export function ParamRow({ param, mapping, onChange }) {
  const off = mapping.source === 'off'
  const pct = Math.round(mapping.amount * 100)
  const id = `p-${param.id}`

  return (
    <div className="space-y-3 border-b border-border py-4 last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id} className="text-sm font-medium">
          {param.label}
        </Label>
        <Select value={mapping.source} onValueChange={(source) => onChange({ ...mapping, source })}>
          <SelectTrigger id={id} className="w-44" aria-label={`${param.label} driven by`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            {FIELDS.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <SliderField
          label="Base"
          value={mapping.base}
          display={mapping.base.toFixed(2)}
          min={0}
          onChange={(base) => onChange({ ...mapping, base })}
          name={param.label}
        />
        <SliderField
          label="Amount"
          value={mapping.amount}
          display={`${pct > 0 ? '+' : ''}${pct}%`}
          min={-1}
          disabled={off}
          onChange={(amount) => onChange({ ...mapping, amount })}
          name={param.label}
        />
      </div>
    </div>
  )
}

export function SliderField({ label, value, display, min = 0, max = 1, step = 0.01, disabled, onChange, name }) {
  return (
    <div className={disabled ? 'space-y-2 opacity-50' : 'space-y-2'}>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="font-mono tabular-nums">{display}</span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={([v]) => onChange(v)}
        aria-label={name ? `${name} ${label}` : label}
        className="py-2"
      />
    </div>
  )
}
