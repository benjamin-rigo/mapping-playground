import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Check, Link, Maximize, Minimize, Play, Square, Volume2 } from 'lucide-react'
import { AboutDialog } from '@/components/AboutDialog'
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
import { cn } from '@/lib/utils'
import { DEFAULTS, PRESETS, decodeSettings, encodeSettings } from '@/engine/settings'

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

  // In full screen, hide the cursor and the overlays after 2 s without mouse movement.
  const [idle, setIdle] = useState(false)
  const idleTimer = useRef(null)
  const wake = () => {
    setIdle(false)
    clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => setIdle(true), 2000)
  }
  useEffect(() => {
    const onChange = () => {
      const on = document.fullscreenElement === stageRef.current
      setFullscreen(on)
      clearTimeout(idleTimer.current)
      setIdle(false)
      if (on) idleTimer.current = setTimeout(() => setIdle(true), 2000)
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])
  const hidden = fullscreen && idle
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

  // Shortens the patch link with spoo.me (free, no key, CORS enabled, redirects
  // browsers straight through); falls back to the full link if it is unreachable. ClipboardItem with a promise keeps Safari
  // happy about writing to the clipboard after a network request.
  async function copyLink() {
    history.replaceState(null, '', `#s=${encodeSettings(settings)}`)
    const long = location.href
    setCopied('working')
    const text = fetch('https://spoo.me/', {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: new URLSearchParams({ url: long }),
      signal: AbortSignal.timeout(5000),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then((j) => (j.short_url ? j.short_url.replace(/^http:/, 'https:') : long))
      .catch(() => long)
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': text.then((t) => new Blob([t], { type: 'text/plain' })) })])
    } catch {
      await navigator.clipboard.writeText(await text)
    }
    setCopied((await text) === long ? 'long' : 'short')
    setTimeout(() => setCopied(false), 2000)
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
    <div ref={stageRef} onPointerMove={fullscreen ? wake : undefined} className={cn('relative size-full bg-background', hidden && 'cursor-none')}>
      <Button
        variant="secondary"
        size="icon-sm"
        onClick={toggleFullscreen}
        aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
        className={cn('absolute top-3 right-3 z-10 opacity-70 transition-opacity hover:opacity-100', hidden && 'pointer-events-none opacity-0')}
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
      {running && !hidden && <EventLog engine={engine} />}
    </div>
  )

  const panelClass = 'flex h-full flex-col gap-3 overflow-y-auto px-3 pb-3 max-md:h-auto max-md:overflow-visible max-md:px-0 max-md:pb-0'
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
      <h2 className="sticky top-0 z-10 -mx-3 -mb-3 bg-background px-3 py-3 text-xs font-medium tracking-wider text-muted-foreground uppercase max-md:mx-0 max-md:px-0">Visual</h2>
      {MODULES.filter((m) => m.group === 'visual').map((m) => card(m))}
    </div>
  )

  const soundPanel = (
    <div className={panelClass}>
      <h2 className="sticky top-0 z-10 -mx-3 -mb-3 bg-background px-3 py-3 text-xs font-medium tracking-wider text-muted-foreground uppercase max-md:mx-0 max-md:px-0">Sound</h2>
      {MODULES.filter((m) => m.group === 'sound').map((m) => card(m))}
    </div>
  )

  return (
    <EngineContext.Provider value={engine}>
      <div className="flex h-dvh flex-col bg-background text-foreground">
        <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <h1 className="text-sm font-semibold tracking-tight">Cyber Sonification Playground</h1>
          <div className="mr-auto">
            <AboutDialog />
          </div>
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
            {copied && copied !== 'working' ? <Check /> : <Link />}{' '}
            {copied === 'working' ? 'Shortening…' : copied === 'short' ? 'Copied short link' : copied === 'long' ? 'Copied full link' : 'Copy link'}
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
