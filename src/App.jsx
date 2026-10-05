import { useEffect, useRef, useState } from 'react'
import { Check, Link, Play, RotateCcw, Square } from 'lucide-react'
import { ControlPanel } from '@/components/ControlPanel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { createEngine } from '@/engine'
import { DEFAULTS, decodeSettings, encodeSettings } from '@/engine/settings'

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

export default function App() {
  const canvasRef = useRef(null)
  const engineRef = useRef(null)
  const [settings, setSettings] = useState(initialSettings)
  const [status, setStatus] = useState('idle')
  const [lastEvent, setLastEvent] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const engine = createEngine({
      canvas: canvasRef.current,
      snapshotUrl: `${import.meta.env.BASE_URL}snapshot.json`,
      onEvent: setLastEvent,
      onStatus: setStatus,
    })
    engineRef.current = engine
    return () => engine.destroy()
  }, [])

  useEffect(() => {
    engineRef.current?.setSettings(settings)
    const id = setTimeout(() => history.replaceState(null, '', `#s=${encodeSettings(settings)}`), 300)
    return () => clearTimeout(id)
  }, [settings])

  const running = status !== 'idle'

  async function copyLink() {
    history.replaceState(null, '', `#s=${encodeSettings(settings)}`)
    await navigator.clipboard.writeText(location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <h1 className="mr-auto text-sm font-semibold tracking-tight">Cyber Sonification Playground</h1>
        <Badge variant={STATUS[status].variant} aria-live="polite">
          {STATUS[status].label}
        </Badge>
        <Button variant="ghost" size="sm" onClick={() => setSettings(structuredClone(DEFAULTS))} aria-label="Reset to defaults">
          <RotateCcw /> <span className="hidden sm:inline">Reset</span>
        </Button>
        <Button variant="outline" size="sm" onClick={copyLink}>
          {copied ? <Check /> : <Link />} {copied ? 'Copied' : 'Copy link'}
        </Button>
        <Button size="sm" onClick={() => (running ? engineRef.current.stop() : engineRef.current.start())}>
          {running ? <Square /> : <Play />} {running ? 'Stop' : 'Start'}
        </Button>
      </header>

      <main className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="relative h-[45dvh] shrink-0 md:h-auto md:flex-1">
          <canvas ref={canvasRef} className="block size-full" aria-label="Live visualization of attack events" />
          {!running && (
            <button
              type="button"
              onClick={() => engineRef.current.start()}
              className="absolute inset-0 flex items-center justify-center font-mono text-xs tracking-widest text-neutral-900 uppercase"
            >
              Press start to listen
            </button>
          )}
          {lastEvent && running && (
            <p className="pointer-events-none absolute bottom-3 left-3 font-mono text-[11px] text-neutral-900">
              {lastEvent.burst ? 'scan' : 'hit'} {lastEvent.ip} → :{lastEvent.port}
            </p>
          )}
        </div>
        <aside className="min-h-0 flex-1 overflow-y-auto border-border px-4 py-5 md:w-[400px] md:flex-none md:border-l">
          <ControlPanel settings={settings} onChange={setSettings} />
        </aside>
      </main>
    </div>
  )
}
