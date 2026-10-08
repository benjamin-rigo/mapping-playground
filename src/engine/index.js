import { createField } from './field.js'
import { createSources, normalize } from './fields.js'
import { loadDataset } from './isc.js'
import { PARAM_BY_KEY, QUANTIZE_STEPS, applyPatches } from './params.js'
import { step } from './music.js'
import { createSampler } from './sampler.js'
import { DEFAULTS } from './settings.js'
import { createSynth, expMap } from './synth.js'

const REFRESH_MS = 4 * 60 * 1000
const DENSITY_WINDOW_MS = 5000
const HIT_DECAY_S = 0.2

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

  // Quantize: snap every incoming data value to N steps before it modulates anything.
  function quantized(src) {
    const n = QUANTIZE_STEPS[step(live['global.quantize'] ?? settings.knobs['global.quantize'], QUANTIZE_STEPS.length)]
    if (!n) return src
    const out = {}
    for (const k in src) out[k] = Math.round(src[k] * (n - 1)) / (n - 1)
    return out
  }

  // Drone Smooth: a second, slower follower on the drone's continuous knobs, so it can
  // drift over many seconds while the rest reacts fast. Stepped knobs are not smoothed
  // (they would pass through every step); Hold paces those instead.
  const droneLag = {}
  const STEPPED = new Set(['drone.root', 'drone.scale', 'drone.ratio', 'drone.type', 'drone.hold', 'drone.smooth', 'drone.level'])
  function droneSmoothed(values, dt) {
    const k = 1 - Math.exp(-dt / expMap(values['drone.smooth'], 0.05, 30))
    const out = { ...values }
    for (const key in values) {
      if (!key.startsWith('drone.') || STEPPED.has(key)) continue
      droneLag[key] = droneLag[key] == null ? values[key] : droneLag[key] + (values[key] - droneLag[key]) * k
      out[key] = droneLag[key]
      live[key] = droneLag[key]
    }
    return out
  }

  const sampler = createSampler({
    emit(event) {
      recent.push(performance.now())
      const fields = normalize(event, data)
      sources.onEvent(fields)
      hit = 1
      sources.latest.hit = 1
      const values = applyPatches(settings.knobs, settings.patches, quantized(sources.latest), 'event')
      for (const key in values) if (PARAM_BY_KEY[key].kind === 'event') live[key] = values[key]
      synth.play(values)
      for (const fn of listeners) fn(event)
    },
  })

  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    while (recent.length && now - recent[0] > DENSITY_WINDOW_MS) recent.shift()
    // Response is a knob too; use last frame's modulated value.
    const tau = expMap(live['global.response'] ?? settings.knobs['global.response'], 0.01, 3)
    sources.tick(dt, { density: recent.length, threat: running && data ? data.threat : 0, tau })
    hit *= Math.exp(-dt / HIT_DECAY_S)
    sources.latest.hit = hit
    sources.smooth.hit = hit

    const values = applyPatches(settings.knobs, settings.patches, quantized(sources.smooth), 'continuous')
    for (const key in values) if (PARAM_BY_KEY[key].kind === 'continuous') live[key] = values[key]
    field.render(values, dt)
    audioClock += dt
    if (audioClock > 0.05) {
      audioClock = 0
      synth.setContinuous(droneSmoothed(values, 0.05), tau)
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
      synth.setMaster(s.master)
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
