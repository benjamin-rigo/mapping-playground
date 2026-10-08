import { createField } from './field.js'
import { createSources, normalize } from './fields.js'
import { loadDataset } from './isc.js'
import { PARAM_BY_KEY, QUANTIZE_GRID, applyPatches } from './params.js'
import { bpmOf, step } from './music.js'
import { createSampler } from './sampler.js'
import { DEFAULTS } from './settings.js'
import { createSynth, expMap } from './synth.js'

const REFRESH_MS = 4 * 60 * 1000
const DENSITY_WINDOW_MS = 5000
const HIT_DECAY_S = 0.2

export function createEngine({ canvas, onStatus }) {
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

  // Quantize: an attack waits for the next point on the tempo grid. If several arrive
  // within one grid step, the latest one plays (sample and hold). Density still counts
  // every arrival.
  let pending = null
  let gridTimer = null
  function arrive(event) {
    recent.push(performance.now())
    const beats = QUANTIZE_GRID[step(live['global.quantize'] ?? settings.knobs['global.quantize'], QUANTIZE_GRID.length)][1]
    if (!beats) return fire(event)
    pending = event
    if (gridTimer != null) return
    const period = (beats * 60000) / bpmOf(live['global.bpm'] ?? settings.knobs['global.bpm'])
    const now = performance.now()
    const wait = Math.ceil(now / period) * period - now
    gridTimer = setTimeout(() => {
      gridTimer = null
      const e = pending
      pending = null
      if (e && running) fire(e)
    }, wait)
  }

  function fire(event) {
    const fields = normalize(event, data)
    sources.onEvent(fields)
    hit = 1
    sources.latest.hit = 1
    const values = applyPatches(settings.knobs, settings.patches, sources.latest, 'event')
    for (const key in values) if (PARAM_BY_KEY[key].kind === 'event') live[key] = values[key]
    synth.play(values)
    for (const fn of listeners) fn(event)
  }

  const sampler = createSampler({ emit: arrive })

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

    const values = applyPatches(settings.knobs, settings.patches, sources.smooth, 'continuous')
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
    data = await loadDataset()
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
      try {
        await synth.start()
        await refresh()
      } catch (err) {
        // e.g. the browser refused to start audio; go back to a clean stopped state
        console.error(err)
        this.stop()
        return
      }
      if (!running) return
      sampler.start()
      refreshTimer = setInterval(() => refresh().catch(() => {}), REFRESH_MS)
    },
    stop() {
      running = false
      sampler.stop()
      clearTimeout(gridTimer)
      gridTimer = null
      pending = null
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
