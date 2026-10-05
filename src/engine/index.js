import { createField } from './field.js'
import { createSources, normalize } from './fields.js'
import { loadDataset } from './isc.js'
import { applyPatches } from './params.js'
import { createSampler } from './sampler.js'
import { DEFAULTS } from './settings.js'
import { createSynth } from './synth.js'

const REFRESH_MS = 4 * 60 * 1000
const DENSITY_WINDOW_MS = 5000

export function createEngine({ canvas, snapshotUrl, onEvent, onStatus }) {
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
  const recent = []

  const sampler = createSampler({
    emit(event) {
      recent.push(performance.now())
      sources.onEvent(normalize(event, data))
      const values = applyPatches(settings.knobs, settings.patches, sources.latest, 'event')
      synth.play(values)
      field.addImpact(values)
      onEvent?.(event)
    },
  })

  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    while (recent.length && now - recent[0] > DENSITY_WINDOW_MS) recent.shift()
    sources.tick(dt, {
      density: recent.length,
      threat: running && data ? data.threat : 0,
    })
    const values = applyPatches(settings.knobs, settings.patches, sources.smooth, 'continuous')
    field.render(values, dt)
    audioClock += dt
    if (audioClock > 0.05) {
      audioClock = 0
      synth.setContinuous(values)
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
    async start() {
      if (running) return
      running = true
      onStatus?.('loading')
      await synth.start(settings)
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
      synth.setSettings(s)
    },
    destroy() {
      this.stop()
      cancelAnimationFrame(raf)
    },
  }
}
