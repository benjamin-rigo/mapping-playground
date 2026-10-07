import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Check, Link, Play, Square } from 'lucide-react'
import { EngineContext } from '@/components/Meter'
import { ModMatrix } from '@/components/ModMatrix'
import { ModuleCard } from '@/components/ModuleCard'
import { RotaryKnob } from '@/components/RotaryKnob'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createEngine } from '@/engine'
import { expMap } from '@/engine/synth'
import { ALGORITHMS, MODULES, algoIndex } from '@/engine/params'
import { cn } from '@/lib/utils'
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

const desktopQuery = '(min-width: 768px)'
function useIsDesktop() {
  return useSyncExternalStore(
    (cb) => {
      const mq = matchMedia(desktopQuery)
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    () => matchMedia(desktopQuery).matches,
  )
}

// Subscribes on its own so incoming events don't re-render the whole app.
function EventLog({ engine }) {
  const [event, setEvent] = useState(null)
  useEffect(() => engine?.subscribe(setEvent), [engine])
  if (!event) return null
  return (
    <p className="pointer-events-none absolute bottom-3 left-3 rounded bg-white/70 px-1.5 py-0.5 font-mono text-[11px] text-neutral-900">
      {event.burst ? 'scan' : 'hit'} {event.ip} → :{event.port}
    </p>
  )
}

function PickField({ label, value, options, onChange, format = (o) => o }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" className="w-full" aria-label={label}>
        <span className="text-muted-foreground">{label}</span>
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
  )
}

export default function App() {
  const canvasRef = useRef(null)
  const [engine, setEngine] = useState(null)
  const [settings, setSettings] = useState(initialSettings)
  const [preset, setPreset] = useState('')
  const [status, setStatus] = useState('idle')
  const [copied, setCopied] = useState(false)
  const [selected, setSelected] = useState(null)
  const isDesktop = useIsDesktop()

  useEffect(() => {
    const e = createEngine({
      canvas: canvasRef.current,
      snapshotUrl: `${import.meta.env.BASE_URL}snapshot.json`,
      onStatus: setStatus,
    })
    setEngine(e)
    return () => e.destroy()
    // the canvas is a different element in the mobile and desktop layouts
  }, [isDesktop])

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
  const setPatches = (patches) => edit({ patches })
  const setKnob = useCallback((v, key) => {
    setPreset('')
    setSettings((s) => ({ ...s, knobs: { ...s.knobs, [key]: v } }))
  }, [])
  const select = useCallback((key) => setSelected(key), [])

  function loadPreset(name) {
    setPreset(name)
    setSelected(null)
    setSettings(structuredClone(PRESETS.find((p) => p.name === name).settings))
  }

  async function copyLink() {
    history.replaceState(null, '', `#s=${encodeSettings(settings)}`)
    await navigator.clipboard.writeText(location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const matrix = (className) => (
    <ModMatrix settings={settings} selected={selected} onSelect={select} onPatches={setPatches} className={className} />
  )

  const stage = (
    <div className="relative size-full">
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
      {running && <EventLog engine={engine} />}
    </div>
  )

  const panelClass = 'flex h-full flex-col gap-3 overflow-y-auto px-3 py-3 max-md:h-auto max-md:overflow-visible max-md:px-0 max-md:py-0'
  const card = (m, children) => (
    <ModuleCard
      key={m.id}
      module={m}
      knobs={settings.knobs}
      patches={settings.patches}
      selected={selected}
      onKnob={setKnob}
      onSelect={select}
    >
      {children}
    </ModuleCard>
  )
  const current = algoIndex(settings.knobs['synth.algo'])

  const visualPanel = (
    <div className={panelClass}>
      <h2 className="text-xs font-medium tracking-wider text-muted-foreground uppercase">Visual</h2>
      {MODULES.filter((m) => m.group === 'visual').map((m) => card(m))}
    </div>
  )

  const soundPanel = (
    <div className={panelClass}>
      <h2 className="text-xs font-medium tracking-wider text-muted-foreground uppercase">Sound</h2>
      <section className="flex items-center justify-around gap-2 rounded-lg border border-border bg-card p-3">
        <RotaryKnob
          label="Response"
          name="Response time"
          value={settings.response}
          defaultValue={0.25}
          display={`${Math.round(expMap(settings.response, 10, 3000))}ms`}
          onChange={(response) => edit({ response })}
        />
        <RotaryKnob
          label="Hit decay"
          name="Hit decay"
          value={settings.hitDecay}
          defaultValue={0.35}
          display={`${Math.round(expMap(settings.hitDecay, 50, 3000))}ms`}
          onChange={(hitDecay) => edit({ hitDecay })}
        />
        <RotaryKnob
          label="Master"
          value={settings.master}
          defaultValue={0.8}
          display={`${Math.round(settings.master * 100)}%`}
          onChange={(master) => edit({ master })}
        />
      </section>
      {MODULES.filter((m) => m.group === 'sound').map((m) =>
        card(
          m,
          m.id === 'synth' ? (
            <div role="radiogroup" aria-label="Synth algorithm" className="mb-3 grid grid-cols-4 gap-1">
              {ALGORITHMS.map((alg, i) => (
                <button
                  key={alg.id}
                  type="button"
                  role="radio"
                  aria-checked={current === i}
                  title={alg.labels.join(' · ')}
                  onClick={() => setKnob((i + 0.5) / ALGORITHMS.length, 'synth.algo')}
                  className={cn(
                    'rounded-md border px-1 py-1 text-[11px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                    current === i ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:text-foreground',
                  )}
                >
                  {alg.name}
                </button>
              ))}
            </div>
          ) : m.id === 'drone' ? (
            <div className="mb-3 grid grid-cols-2 gap-2">
              <PickField label="Root" value={settings.root} options={ROOTS} onChange={(root) => edit({ root })} />
              <PickField label="Scale" value={settings.scale} options={SCALES} format={cap} onChange={(scale) => edit({ scale })} />
            </div>
          ) : null,
        ),
      )}
    </div>
  )

  return (
    <EngineContext.Provider value={engine}>
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

        {isDesktop ? (
          <ResizablePanelGroup id="main3" orientation="horizontal" className="min-h-0 flex-1">
            <ResizablePanel id="visual" defaultSize="24%" minSize={260}>
              {visualPanel}
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel id="stage" defaultSize="50%" minSize="25%">
              <ResizablePanelGroup id="stage-split" orientation="vertical">
                <ResizablePanel id="canvas" defaultSize="62%" minSize="20%">
                  {stage}
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel id="matrix" defaultSize="38%" minSize="12%">
                  {matrix('h-full px-3 pb-2')}
                </ResizablePanel>
              </ResizablePanelGroup>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel id="sound" defaultSize="26%" minSize={280}>
              {soundPanel}
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          <main className="flex min-h-0 flex-1 flex-col">
            <div className="h-[40dvh] shrink-0">{stage}</div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3">
              {matrix('max-h-[45dvh] rounded-lg border border-border px-2 pb-2')}
              {visualPanel}
              {soundPanel}
            </div>
          </main>
        )}
      </div>
    </EngineContext.Provider>
  )
}
