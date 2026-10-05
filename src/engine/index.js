import { createAudio } from './audio.js'
import { normalize, resolveAll } from './fields.js'
import { loadDataset } from './isc.js'
import { createSampler } from './sampler.js'
import { DEFAULTS } from './settings.js'
import { createVisuals } from './visuals.js'

const REFRESH_MS = 4 * 60 * 1000
const DENSITY_WINDOW_MS = 5000

export function createEngine({ canvas, snapshotUrl, onEvent, onStatus }) {
  const visuals = createVisuals(canvas)
  const audio = createAudio()
  let settings = DEFAULTS
  let data = null
  let refreshTimer = null
  let running = false
  const recent = []

  const sampler = createSampler({
    emit(event) {
      const now = performance.now()
      recent.push(now)
      while (now - recent[0] > DENSITY_WINDOW_MS) recent.shift()
      const fields = normalize(event, { ...data, density: recent.length })
      const values = resolveAll(settings.mappings, fields)
      audio.play(event, values)
      visuals.addEvent(event, values)
      onEvent?.(event)
    },
  })

  async function refresh() {
    data = await loadDataset(snapshotUrl)
    sampler.setData(data)
    if (running) onStatus?.(data.live ? 'live' : 'offline')
  }

  return {
    async start() {
      if (running) return
      running = true
      onStatus?.('loading')
      await audio.start(settings.tuning)
      await refresh()
      if (!running) return
      sampler.start()
      refreshTimer = setInterval(() => refresh(), REFRESH_MS)
    },
    stop() {
      running = false
      sampler.stop()
      clearInterval(refreshTimer)
      audio.stop()
      onStatus?.('idle')
    },
    setSettings(s) {
      settings = s
      audio.setTuning(s.tuning)
      visuals.setLook(s.look)
    },
    destroy() {
      this.stop()
      visuals.destroy()
    },
  }
}
