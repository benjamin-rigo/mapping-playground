import { ParamRow, SliderField } from '@/components/ParamRow'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ACCENTS, ROOTS, SCALES, SOUND_PARAMS, VISUAL_PARAMS, VOICES } from '@/engine/settings'

const cap = (s) => s[0].toUpperCase() + s.slice(1)

function Section({ title, children }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xs font-medium tracking-wider text-muted-foreground uppercase">{title}</h2>
      {children}
    </section>
  )
}

function SelectField({ label, value, options, onChange, format = (o) => o }) {
  const id = `f-${label}`
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {format(o)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function SwitchField({ label, checked, onChange }) {
  const id = `s-${label}`
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id}>{label}</Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

export function ControlPanel({ settings, onChange }) {
  const { tuning, look, mappings } = settings
  const setTuning = (patch) => onChange({ ...settings, tuning: { ...tuning, ...patch } })
  const setLook = (patch) => onChange({ ...settings, look: { ...look, ...patch } })
  const setMapping = (id, m) => onChange({ ...settings, mappings: { ...mappings, [id]: m } })

  const rows = (params) => (
    <Section title="Mapping">
      <p className="text-xs text-muted-foreground">
        Pick which data drives each parameter. Base is the resting value, Amount is how strongly the data moves it
        (negative inverts).
      </p>
      <div>
        {params.map((p) => (
          <ParamRow key={p.id} param={p} mapping={mappings[p.id]} onChange={(m) => setMapping(p.id, m)} />
        ))}
      </div>
    </Section>
  )

  return (
    <Tabs defaultValue="sound" className="gap-6">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="sound">Sound</TabsTrigger>
        <TabsTrigger value="visuals">Visuals</TabsTrigger>
      </TabsList>

      <TabsContent value="sound" className="space-y-8">
        <Section title="Tuning">
          <SelectField label="Voice" value={tuning.voice} options={VOICES} format={cap} onChange={(voice) => setTuning({ voice })} />
          <SelectField label="Root" value={tuning.root} options={ROOTS} onChange={(root) => setTuning({ root })} />
          <SelectField label="Scale" value={tuning.scale} options={SCALES} format={cap} onChange={(scale) => setTuning({ scale })} />
          <SwitchField label="Chords" checked={tuning.chords} onChange={(chords) => setTuning({ chords })} />
          <SliderField label="Master volume" value={tuning.master} display={`${Math.round(tuning.master * 100)}%`} onChange={(master) => setTuning({ master })} />
        </Section>
        {rows(SOUND_PARAMS)}
      </TabsContent>

      <TabsContent value="visuals" className="space-y-8">
        <Section title="Look">
          <SliderField label="Grid density" value={look.grid} display={look.grid.toFixed(2)} onChange={(grid) => setLook({ grid })} />
          <SliderField label="Grain" value={look.grain} display={look.grain.toFixed(2)} onChange={(grain) => setLook({ grain })} />
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">Accent</span>
            <div className="flex gap-2" role="radiogroup" aria-label="Accent color">
              {ACCENTS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={look.accent === c}
                  aria-label={`Accent ${c}`}
                  onClick={() => setLook({ accent: c })}
                  className="size-8 rounded-md border-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-checked:border-foreground border-transparent"
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
          <SwitchField label="Annotations" checked={look.annotations} onChange={(annotations) => setLook({ annotations })} />
        </Section>
        {rows(VISUAL_PARAMS)}
      </TabsContent>
    </Tabs>
  )
}
