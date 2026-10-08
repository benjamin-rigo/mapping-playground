import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { AudioLines, Check, Grid3x3, Image, Link, Maximize, Minimize, Play, Square, Volume2 } from 'lucide-react'
import { AboutDialog } from '@/components/AboutDialog'
import { SavePresetDialog } from '@/components/SavePresetDialog'
import { deletePreset, presetSettings, readPresets, savePreset } from '@/lib/userPresets'
import { EngineContext } from '@/components/Meter'
import { ModMatrix } from '@/components/ModMatrix'
import { ModuleCard } from '@/components/ModuleCard'
import { RotaryKnob } from '@/components/RotaryKnob'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createEngine } from '@/engine'
import { MODULES, PARAM_BY_KEY } from '@/engine/params'
import { cn } from '@/lib/utils'
import { DEFAULTS, PRESETS, decodeSettings, encodeSettings } from '@/engine/settings'

const STATUS = {
  idle: { label: 'Stopped', short: 'Stopped', variant: 'outline' },
  loading: { label: 'Connecting', short: 'Connecting', variant: 'secondary' },
  live: { label: 'Live · SANS ISC', short: 'Live', variant: 'default' },
  offline: { label: 'Offline · snapshot', short: 'Offline', variant: 'destructive' },
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
  const [mobileTab, setMobileTab] = useState('visual')
  const isDesktop = useIsDesktop()

  useEffect(() => {
    const e = createEngine({
      canvas: canvasRef.current,
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

  const [userPresets, setUserPresets] = useState(readPresets)

  // value is "b:<name>" for built-in presets, "u:<name>" for the user's own
  function loadPreset(value) {
    const name = value.slice(2)
    const settings = value.startsWith('u:')
      ? presetSettings(userPresets.find((p) => p.name === name))
      : structuredClone(PRESETS.find((p) => p.name === name).settings)
    if (!settings) return
    setPreset(value)
    setSelected(null)
    setSettings(settings)
  }

  function saveUserPreset(name) {
    const next = savePreset(name, settings)
    if (!next) return false
    setUserPresets(next)
    setPreset(`u:${name}`)
    return true
  }

  function deleteUserPreset(name) {
    setUserPresets(deletePreset(name))
    if (preset === `u:${name}`) setPreset('')
  }

  async function copyLink() {
    history.replaceState(null, '', `#s=${encodeSettings(settings)}`)
    await navigator.clipboard.writeText(location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const matrix = (className) => (
    <ModMatrix
      settings={settings}
      selected={selected}
      onSelect={select}
      onPatches={setPatches}
      className={className}
      corner={['global.response', 'global.quantize', 'global.bpm'].map((key) => {
        const p = PARAM_BY_KEY[key]
        const depth = settings.patches.filter((x) => x.target === key).reduce((sum, x) => sum + Math.abs(x.amount), 0)
        return (
          <RotaryKnob
            key={key}
            id={key}
            label={p.label}
            name={p.label}
            value={settings.knobs[key]}
            defaultValue={p.value}
            display={p.format(settings.knobs[key], settings.knobs)}
            onChange={setKnob}
            onSelect={select}
            selected={selected === key}
            modNeg={-depth}
            modPos={depth}
          />
        )
      })}
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
      <h2 className="sticky top-0 z-10 -mx-3 -mb-3 bg-background px-3 py-3 text-xs font-medium tracking-wider text-muted-foreground uppercase max-md:hidden">Visual</h2>
      {MODULES.filter((m) => m.group === 'visual').map((m) => card(m))}
    </div>
  )

  const soundPanel = (
    <div className={panelClass}>
      <h2 className="sticky top-0 z-10 -mx-3 -mb-3 bg-background px-3 py-3 text-xs font-medium tracking-wider text-muted-foreground uppercase max-md:hidden">Sound</h2>
      {MODULES.filter((m) => m.group === 'sound').map((m) => card(m))}
    </div>
  )

  return (
    <EngineContext.Provider value={engine}>
      <div className="flex h-dvh flex-col bg-background text-foreground">
        {/* Mobile: two rows (title, about, start / status, presets, volume, copy). Desktop: one row in DOM order. */}
        <header className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 md:px-4 md:py-3">
          <h1 className="order-1 min-w-0 flex-1 truncate text-sm font-semibold tracking-tight md:order-none md:flex-none">
            Cyber Sonification Playground
          </h1>
          <div className="order-2 md:order-none md:mr-auto">
            <AboutDialog />
          </div>
          <div className="order-4 h-0 basis-full md:hidden" aria-hidden />
          <Badge variant={STATUS[status].variant} aria-live="polite" className="order-5 md:order-none">
            <span className="sm:hidden">{STATUS[status].short}</span>
            <span className="hidden sm:inline">{STATUS[status].label}</span>
          </Badge>
          <Select value={preset} onValueChange={loadPreset}>
            <SelectTrigger size="sm" className="order-6 w-auto min-w-0 flex-1 md:order-none md:w-36 md:flex-none" aria-label="Load preset">
              <SelectValue placeholder="Presets" />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectGroup>
                <SelectLabel>Built-in</SelectLabel>
                {PRESETS.map((p) => (
                  <SelectItem key={p.name} value={`b:${p.name}`}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectGroup>
              {userPresets.length > 0 && (
                <SelectGroup>
                  <SelectLabel>My presets</SelectLabel>
                  {userPresets.map((p) => (
                    <SelectItem key={p.name} value={`u:${p.name}`}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
            </SelectContent>
          </Select>
          <SavePresetDialog
            presets={userPresets}
            current={preset.startsWith('u:') ? preset.slice(2) : ''}
            onSave={saveUserPreset}
            onDelete={deleteUserPreset}
            className="order-6 md:order-none"
          />
          <label className="order-7 flex items-center gap-2 text-muted-foreground md:order-none">
            <Volume2 className="size-4" aria-hidden />
            <Slider
              value={[settings.master]}
              min={0}
              max={1}
              step={0.01}
              onValueChange={([master]) => edit({ master })}
              aria-label="Master volume"
              className="w-16 sm:w-24"
            />
          </label>
          <Button variant="outline" size="sm" onClick={copyLink} aria-label={copied ? 'Copied' : 'Copy link'} className="order-8 md:order-none">
            {copied ? <Check /> : <Link />} <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy link'}</span>
          </Button>
          <Button size="sm" onClick={() => (running ? engine.stop() : engine.start())} className="order-3 md:order-none">
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
            <div className="h-[32dvh] shrink-0">{stage}</div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-1 pb-3">
              {mobileTab === 'visual' ? visualPanel : mobileTab === 'sound' ? soundPanel : matrix('px-0')}
            </div>
            <nav
              role="tablist"
              aria-label="Sections"
              className="grid shrink-0 grid-cols-3 border-t border-border bg-background pb-[env(safe-area-inset-bottom)]"
            >
              {[
                ['visual', 'Visual', Image],
                ['matrix', 'Matrix', Grid3x3],
                ['sound', 'Sound', AudioLines],
              ].map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={mobileTab === id}
                  onClick={() => setMobileTab(id)}
                  className={cn(
                    'flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] outline-none focus-visible:bg-muted',
                    mobileTab === id ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  <Icon className="size-5" aria-hidden />
                  {label}
                </button>
              ))}
            </nav>
          </main>
        )}
      </div>
    </EngineContext.Provider>
  )
}
