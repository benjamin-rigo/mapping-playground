import { createField } from './field.js'
import { createSources, normalize } from './fields.js'
import { loadDataset } from './isc.js'
import { PARAM_BY_KEY, applyPatches } from './params.js'
import { createSampler } from './sampler.js'
import { DEFAULTS } from './settings.js'
import { createSynth, expMap } from './synth.js'

const REFRESH_MS = 4 * 60 * 1000
const DENSITY_WINDOW_MS = 5000

export function createEngine({ canvas, snapshotUrl, onStatus }) {
  const field = createField(canvas)
  const synth = createSynth()
  const sources = createSources()
  let settings = DEFAULTS
  let data = null
  let refreshTimer = null
  let running = false
  let raf = 0
  let last = performance.now()
  let audioClock = 0
  let hit = 0
  const recent = []
  const listeners = new Set()
  // Latest modulated value of every knob, read by the UI to animate knobs.
  const live = {}

  const sampler = createSampler({
    emit(event) {
      recent.push(performance.now())
      const fields = normalize(event, data)
      sources.onEvent(fields)
      hit = 1
      sources.latest.hit = 1
      const values = applyPatches(settings.knobs, settings.patches, sources.latest, 'event')
      for (const key in values) if (PARAM_BY_KEY[key].kind === 'event') live[key] = values[key]
      synth.play(values)
      for (const fn of listeners) fn(event)
    },
  })

  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    while (recent.length && now - recent[0] > DENSITY_WINDOW_MS) recent.shift()
    // Response and Hit decay are knobs too; use last frame's modulated values.
    const tau = expMap(live['global.response'] ?? settings.knobs['global.response'], 0.01, 3)
    sources.tick(dt, { density: recent.length, threat: running && data ? data.threat : 0, tau })
    hit *= Math.exp(-dt / expMap(live['global.hitDecay'] ?? settings.knobs['global.hitDecay'], 0.05, 3))
    sources.latest.hit = hit
    sources.smooth.hit = hit

    const values = applyPatches(settings.knobs, settings.patches, sources.smooth, 'continuous')
    for (const key in values) if (PARAM_BY_KEY[key].kind === 'continuous') live[key] = values[key]
    field.render(values, dt)
    audioClock += dt
    if (audioClock > 0.05) {
      audioClock = 0
      synth.setContinuous(values, tau)
    }
    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)

  async function refresh() {
    data = await loadDataset(snapshotUrl)
    sampler.setData(data)
    if (running) onStatus?.(data.live ? 'live' : 'offline')
  }

  return {
    sources,
    live,
    async start() {
      if (running) return
      running = true
      onStatus?.('loading')
      await synth.start()
      await refresh()
      if (!running) return
      sampler.start()
      refreshTimer = setInterval(() => refresh(), REFRESH_MS)
    },
    stop() {
      running = false
      sampler.stop()
      clearInterval(refreshTimer)
      synth.stop()
      onStatus?.('idle')
    },
    setSettings(s) {
      settings = s
    },
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    destroy() {
      this.stop()
      cancelAnimationFrame(raf)
    },
  }
}
