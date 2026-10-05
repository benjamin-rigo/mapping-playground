import { createField } from './field.js'
import { createSources, normalize } from './fields.js'
import { loadDataset } from './isc.js'
import { modOffsets } from './params.js'
import { createSampler } from './sampler.js'
import { lerpU, sceneU } from './scenes.js'
import { DEFAULTS } from './settings.js'
import { createSynth, expMap } from './synth.js'

const REFRESH_MS = 4 * 60 * 1000
const DENSITY_WINDOW_MS = 5000
const clamp01 = (v) => Math.max(0, Math.min(1, v))

const macrosOf = (part, off) => ({
  color: clamp01(part.color + off[`${part.key}.color`]),
  texture: clamp01(part.texture + off[`${part.key}.texture`]),
  motion: clamp01(part.motion + off[`${part.key}.motion`]),
})

export function createEngine({ canvas, snapshotUrl, onStatus }) {
  const field = createField(canvas)
  const synth = createSynth()
  const sources = createSources()
  let settings = DEFAULTS
  let preview = null
  let data = null
  let refreshTimer = null
  let running = false
  let raf = 0
  let last = performance.now()
  let audioClock = 0
  let hit = 0
  const recent = []
  const listeners = new Set()
  // What the UI animates: the modulated tension and the per-target offsets.
  const live = { tension: 0, offsets: {} }

  const sampler = createSampler({
    emit(event) {
      recent.push(performance.now())
      const fields = normalize(event, data)
      sources.onEvent(fields)
      hit = 1
      synth.trigger(fields)
      field.addImpact(fields.ip, fields.port)
      for (const fn of listeners) fn(event)
    },
  })

  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    while (recent.length && now - recent[0] > DENSITY_WINDOW_MS) recent.shift()
    const tau = expMap(settings.response, 0.01, 3)
    sources.tick(dt, { density: recent.length, threat: running && data ? data.threat : 0, tau })
    hit *= Math.exp(-dt / expMap(settings.hitDecay, 0.05, 3))
    sources.latest.hit = hit
    sources.smooth.hit = hit

    const off = modOffsets(settings.patches, sources.smooth)
    const tension = preview === 'calm' ? 0 : preview === 'storm' ? 1 : clamp01(settings.tension + off.tension)
    const scene = (s) =>
      sceneU(s, {
        sound: macrosOf({ ...s.sound, key: 'sound' }, off),
        visual: macrosOf({ ...s.visual, key: 'visual' }, off),
      })
    const a = scene(settings.scenes.calm)
    const b = scene(settings.scenes.storm)
    live.tension = tension
    live.offsets = off

    field.render(lerpU(a.visual, b.visual, tension), dt)
    audioClock += dt
    if (audioClock > 0.05) {
      audioClock = 0
      synth.setU(lerpU(a.sound, b.sound, tension), Math.min(tau, 0.3))
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
    // 'calm' | 'storm' | null: audition one scene regardless of the data
    setPreview(p) {
      preview = p
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
