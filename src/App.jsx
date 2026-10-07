import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Check, Dices, Link, Maximize, Minimize, Play, Square, Volume2 } from 'lucide-react'
import { EngineContext } from '@/components/Meter'
import { ModMatrix } from '@/components/ModMatrix'
import { ModuleCard } from '@/components/ModuleCard'
import { RotaryKnob } from '@/components/RotaryKnob'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createEngine } from '@/engine'
import { MODULES, PARAM_BY_KEY } from '@/engine/params'
import { DEFAULTS, PRESETS, decodeSettings, encodeSettings, randomSettings } from '@/engine/settings'

const STATUS = {
  idle: { label: 'Stopped', variant: 'outline' },
  loading: { label: 'Connecting', variant: 'secondary' },
  live: { label: 'Live · SANS ISC', variant: 'default' },
  offline: { label: 'Offline · snapshot', variant: 'destructive' },
}

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

export default function App() {
  const canvasRef = useRef(null)
  const stageRef = useRef(null)
  const [fullscreen, setFullscreen] = useState(false)
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

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === stageRef.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])
  const toggleFullscreen = () => (document.fullscreenElement ? document.exitFullscreen() : stageRef.current?.requestFullscreen())

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

  const responseDepth = settings.patches.filter((x) => x.target === 'global.response').reduce((sum, x) => sum + Math.abs(x.amount), 0)
  const matrix = (className) => (
    <ModMatrix
      settings={settings}
      selected={selected}
      onSelect={select}
      onPatches={setPatches}
      className={className}
      corner={
        <RotaryKnob
          id="global.response"
          label="Response"
          name="Response time"
          value={settings.knobs['global.response']}
          defaultValue={0.25}
          display={PARAM_BY_KEY['global.response'].format(settings.knobs['global.response'])}
          onChange={setKnob}
          onSelect={select}
          selected={selected === 'global.response'}
          modNeg={-responseDepth}
          modPos={responseDepth}
        />
      }
    />
  )

  const stage = (
    <div ref={stageRef} className="relative size-full bg-background">
      <Button
        variant="secondary"
        size="icon-sm"
        onClick={toggleFullscreen}
        aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
        className="absolute top-3 right-3 z-10 opacity-70 hover:opacity-100"
      >
        {fullscreen ? <Minimize /> : <Maximize />}
      </Button>
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
  const card = (m) => (
    <ModuleCard
      key={m.id}
      module={m}
      knobs={settings.knobs}
      patches={settings.patches}
      selected={selected}
      onKnob={setKnob}
      onSelect={select}
    />
  )

  const visualPanel = (
    <div className={panelClass}>
      <h2 className="text-xs font-medium tracking-wider text-muted-foreground uppercase">Visual</h2>
      {MODULES.filter((m) => m.group === 'visual').map((m) => card(m))}
    </div>
  )

  const soundPanel = (
    <div className={panelClass}>
      <h2 className="text-xs font-medium tracking-wider text-muted-foreground uppercase">Sound</h2>
      {MODULES.filter((m) => m.group === 'sound').map((m) => card(m))}
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setPreset('')
              setSettings((s) => randomSettings(Math.random, s.master))
            }}
          >
            <Dices /> Random
          </Button>
          <label className="flex items-center gap-2 text-muted-foreground">
            <Volume2 className="size-4" aria-hidden />
            <Slider
              value={[settings.master]}
              min={0}
              max={1}
              step={0.01}
              onValueChange={([master]) => edit({ master })}
              aria-label="Master volume"
              className="w-24"
            />
          </label>
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
