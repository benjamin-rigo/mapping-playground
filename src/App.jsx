import { useEffect, useRef, useState } from 'react'
import { Check, Link, Play, Square } from 'lucide-react'
import { Knob } from '@/components/Knob'
import { ModuleCard } from '@/components/ModuleCard'
import { PatchPanel } from '@/components/PatchPanel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { createEngine } from '@/engine'
import { MODULES } from '@/engine/params'
import { DEFAULTS, PRESETS, ROOTS, SCALES, decodeSettings, encodeSettings } from '@/engine/settings'

const STATUS = {
  idle: { label: 'Stopped', variant: 'outline' },
  loading: { label: 'Connecting', variant: 'secondary' },
  live: { label: 'Live · SANS ISC', variant: 'default' },
  offline: { label: 'Offline · snapshot', variant: 'destructive' },
}

const cap = (s) => s[0].toUpperCase() + s.slice(1)

function initialSettings() {
  const match = location.hash.match(/s=([\w-]+)/)
  return (match && decodeSettings(match[1])) || structuredClone(DEFAULTS)
}

function PickField({ label, value, options, onChange, format = (o) => o }) {
  return (
    <div className="space-y-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full" aria-label={label}>
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

export default function App() {
  const canvasRef = useRef(null)
  const [engine, setEngine] = useState(null)
  const [settings, setSettings] = useState(initialSettings)
  const [preset, setPreset] = useState('')
  const [status, setStatus] = useState('idle')
  const [lastEvent, setLastEvent] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const e = createEngine({
      canvas: canvasRef.current,
      snapshotUrl: `${import.meta.env.BASE_URL}snapshot.json`,
      onEvent: setLastEvent,
      onStatus: setStatus,
    })
    setEngine(e)
    return () => e.destroy()
  }, [])

  useEffect(() => {
    engine?.setSettings(settings)
    const id = setTimeout(() => history.replaceState(null, '', `#s=${encodeSettings(settings)}`), 300)
    return () => clearTimeout(id)
  }, [engine, settings])

  const running = status !== 'idle'
  const edit = (patch) => {
    setPreset('')
    setSettings((s) => ({ ...s, ...patch }))
  }
  const setKnob = (key, v) => edit({ knobs: { ...settings.knobs, [key]: v } })

  function loadPreset(name) {
    setPreset(name)
    setSettings(structuredClone(PRESETS.find((p) => p.name === name).settings))
  }

  async function copyLink() {
    history.replaceState(null, '', `#s=${encodeSettings(settings)}`)
    await navigator.clipboard.writeText(location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const modules = (group) =>
    MODULES.filter((m) => m.group === group).map((m) => (
      <ModuleCard key={m.id} module={m} knobs={settings.knobs} patches={settings.patches} onKnob={setKnob} />
    ))

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <h1 className="mr-auto text-sm font-semibold tracking-tight">Cyber Sonification Playground</h1>
        <Badge variant={STATUS[status].variant} aria-live="polite">
          {STATUS[status].label}
        </Badge>
        <Select value={preset} onValueChange={loadPreset}>
          <SelectTrigger size="sm" className="w-36" aria-label="Load preset">
            <SelectValue placeholder="Presets" />
          </SelectTrigger>
          <SelectContent position="popper">
            {PRESETS.map((p) => (
              <SelectItem key={p.name} value={p.name}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={copyLink}>
          {copied ? <Check /> : <Link />} {copied ? 'Copied' : 'Copy link'}
        </Button>
        <Button size="sm" onClick={() => (running ? engine.stop() : engine.start())}>
          {running ? <Square /> : <Play />} {running ? 'Stop' : 'Start'}
        </Button>
      </header>

      <main className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="relative h-[45dvh] shrink-0 md:h-auto md:flex-1">
          <canvas ref={canvasRef} className="block size-full" aria-label="Live visualization of attack events" />
          {!running && (
            <button
              type="button"
              onClick={() => engine?.start()}
              className="absolute inset-0 flex items-center justify-center font-mono text-xs tracking-widest text-neutral-900 uppercase"
            >
              Press start to listen
            </button>
          )}
          {lastEvent && running && (
            <p className="pointer-events-none absolute bottom-3 left-3 rounded bg-white/70 px-1.5 py-0.5 font-mono text-[11px] text-neutral-900">
              {lastEvent.burst ? 'scan' : 'hit'} {lastEvent.ip} → :{lastEvent.port}
            </p>
          )}
        </div>

        <aside className="min-h-0 flex-1 overflow-y-auto border-border px-4 py-5 md:w-[440px] md:flex-none md:border-l">
          <Tabs defaultValue="sound" className="gap-5">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="sound">Sound</TabsTrigger>
              <TabsTrigger value="visual">Visual</TabsTrigger>
              <TabsTrigger value="patch">Patch · {settings.patches.length}</TabsTrigger>
            </TabsList>

            <TabsContent value="sound" className="space-y-3">
              <section className="rounded-lg border border-border bg-card p-4">
                <h3 className="mb-4 text-xs font-medium tracking-wider text-muted-foreground uppercase">Pitch & output</h3>
                <div className="grid grid-cols-2 gap-x-5 gap-y-4">
                  <PickField label="Root" value={settings.root} options={ROOTS} onChange={(root) => edit({ root })} />
                  <PickField label="Scale" value={settings.scale} options={SCALES} format={cap} onChange={(scale) => edit({ scale })} />
                  <Knob
                    label="Master"
                    value={settings.master}
                    display={`${Math.round(settings.master * 100)}%`}
                    onChange={(master) => edit({ master })}
                  />
                </div>
              </section>
              {modules('sound')}
            </TabsContent>

            <TabsContent value="visual" className="space-y-3">
              {modules('visual')}
            </TabsContent>

            <TabsContent value="patch" className="space-y-3">
              {modules('mod')}
              {engine && <PatchPanel patches={settings.patches} sources={engine.sources} onChange={(patches) => edit({ patches })} />}
            </TabsContent>
          </Tabs>
        </aside>
      </main>
    </div>
  )
}
