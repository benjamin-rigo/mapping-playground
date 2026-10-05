import { Cable, X } from 'lucide-react'
import { Meter } from '@/components/Meter'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Slider } from '@/components/ui/slider'
import { SOURCES } from '@/engine/params'

const sourceLabel = Object.fromEntries(SOURCES.map((s) => [s.id, s.label]))

function PatchLine({ patch, knobName, onChange, onRemove }) {
  const pct = Math.round(patch.amount * 100)
  const name = `${sourceLabel[patch.source]} to ${knobName}`
  return (
    <li className="space-y-1.5 border-l-2 border-orange-400/70 pl-2.5">
      <div className="flex items-center gap-1.5 text-[11px]">
        <span className="truncate text-orange-300">{sourceLabel[patch.source]}</span>
        <span className="ml-auto font-mono tabular-nums">
          {pct > 0 ? '+' : ''}
          {pct}%
        </span>
        <Button variant="ghost" size="icon-xs" onClick={onRemove} aria-label={`Remove ${name}`}>
          <X />
        </Button>
      </div>
      <Slider
        value={[patch.amount]}
        min={-1}
        max={1}
        step={0.01}
        onValueChange={([amount]) => onChange({ ...patch, amount })}
        aria-label={`${name} amount`}
        className="py-1"
      />
      <Meter id={patch.source} />
    </li>
  )
}

// A knob is the resting value; patches listed under it push it around with live data.
export function Knob({ label, name, value, display, min = 0, max = 1, step = 0.01, onChange, patchable = false, patches = [], onAddPatch, onPatchChange, onPatchRemove }) {
  const knobName = name ?? label
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="ml-auto font-mono tabular-nums text-foreground">{display ?? value.toFixed(2)}</span>
        {patchable && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className={patches.length ? 'text-orange-400' : 'text-muted-foreground'}
                aria-label={`Connect data to ${knobName}`}
              >
                <Cable />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Drive {knobName} with</DropdownMenuLabel>
              {SOURCES.map((s) => (
                <DropdownMenuItem key={s.id} onSelect={() => onAddPatch(s.id)} className="flex-col items-start gap-0">
                  <span>{s.label}</span>
                  <span className="text-[11px] text-muted-foreground">{s.hint}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v)}
        aria-label={knobName}
        className="py-1.5"
      />
      {patches.length > 0 && (
        <ul className="space-y-2.5 pt-1">
          {patches.map(({ patch, index }) => (
            <PatchLine
              key={index}
              patch={patch}
              knobName={knobName}
              onChange={(p) => onPatchChange(index, p)}
              onRemove={() => onPatchRemove(index)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
