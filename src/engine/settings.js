import { DEFAULT_KNOBS, PARAMS, PARAM_BY_KEY, ROOTS, SCALES, SOURCE_IDS, signal, stepValue } from './params.js'

export { ROOTS, SCALES }

const patch = (source, target, amount) => ({ source, target, amount })

// Presets are written as "knob + amount × data (0..1)". Bipolar sources are converted
// to the centre form (knob + amount/2, amount/2) so they behave as written.
const key = (root, scale) => ({
  'drone.root': stepValue(ROOTS.indexOf(root), ROOTS.length),
  'drone.scale': stepValue(SCALES.indexOf(scale), SCALES.length),
})

const preset = (name, knobs, patches, extra = {}) => {
  const k = { ...DEFAULT_KNOBS, ...knobs }
  const out = patches.map(({ source, target, amount }) => {
    if (signal(source, 0) === 0) return { source, target, amount }
    k[target] += amount / 2
    return { source, target, amount: amount / 2 }
  })
  for (const id in k) k[id] = Math.round(Math.max(0, Math.min(1, k[id])) * 1000) / 1000
  return {
    name,
    settings: { version: 11, knobs: k, patches: out, master: 0.8, ...extra },
  }
}

const algo = (id) => (['analog', 'fold', 'fm', 'formant', 'additive', 'wavetable', 'chords', 'modal', 'drum', 'noise', 'dust'].indexOf(id) + 0.5) / 11

export const PRESETS = [
  preset(
    'Pastel drift',
    { 'synth.algo': algo('modal'), 'synth.harmonics': 0.25, 'synth.timbre': 0.55, 'synth.morph': 0.6, 'synth.note': 0.15, 'synth.level': 0.55 },
    [
      patch('port', 'synth.note', 0.75),
      patch('ip', 'synth.pan', 0.9),
      patch('ipVol', 'synth.harmonics', 0.4),
      patch('density', 'drone.pitch', 0.3),
      patch('ipVol', 'noise.turbulence', 0.3),
      patch('hit', 'distort.static', 0.15),
      patch('hit', 'noise.zoom', 0.15),
      patch('density', 'distort.blocks', 0.3),
    ],
  ),
  preset(
    'Glass rain',
    {
      'synth.algo': algo('fm'), 'synth.harmonics': 0.7, 'synth.timbre': 0.35, 'synth.morph': 0.15, 'synth.decay': 0.5, 'synth.release': 0.6, 'synth.note': 0.3,
      'drone.level': 0.25, 'drone.index': 0.12, 'fx.delay': 0.4, 'fx.feedback': 0.5, ...key('D', 'lydian'),
      'noise.hue': 0.55, 'noise.saturation': 0.7, 'noise.feedback': 0.75, 'noise.drift': 0.4, 'noise.direction': 0.75,
    },
    [
      patch('port', 'synth.note', 0.7),
      patch('portPop', 'synth.timbre', -0.4),
      patch('ip', 'synth.pan', 0.9),
      patch('hit', 'distort.rgb', 0.35),
      patch('hit', 'distort.feedback', 0.5),
      patch('hit', 'noise.rotate', 0.1),
      patch('threat', 'noise.hue', 0.2),
    ],
  ),
  preset(
    'Breakdown',
    {
      'synth.algo': algo('drum'), 'synth.harmonics': 0.7, 'synth.timbre': 0.6, 'synth.morph': 0.7, 'synth.fold': 0.45, 'synth.punch': 0.6,
      'synth.res': 0.3, 'synth.decay': 0.2, 'synth.release': 0.2,
      'drone.index': 0.6, 'drone.feedback': 0.4, 'drone.cutoff': 0.65, 'drone.res': 0.45, 'drone.spread': 0.7, 'drone.level': 0.35, ...key('E', 'phrygian'),
      'fx.drive': 0.35, 'fx.crush': 0.2, 'fx.delay': 0.3, 'fx.time': 0.15, 'fx.feedback': 0.55, 'fx.reverb': 0.2,
      'noise.hue': 0.98, 'noise.saturation': 0.8, 'noise.contrast': 0.7, 'noise.blur': 0.3, 'noise.turbulence': 0.7, 'noise.feedback': 0.65,
      'distort.grain': 0.6, 'distort.scanlines': 0.3, 'distort.blocks': 0.2, 'distort.tear': 0.12, 'distort.rgb': 0.3, 'distort.static': 0.08, 'distort.feedback': 0.35, 'distort.shift': 0.75,
    },
    [
      patch('ip', 'synth.note', 0.9),
      patch('port', 'synth.algo', 0.5),
      patch('ipVol', 'synth.fold', 0.4),
      patch('hit', 'fx.crush', 0.5),
      patch('density', 'drone.pitch', 0.5),
      patch('hit', 'distort.blocks', 0.6),
      patch('hit', 'distort.tear', 0.5),
      patch('hit', 'distort.static', 0.4),
      patch('density', 'distort.pixelate', 0.4),
      patch('threat', 'distort.burn', 0.4),
    ],
  ),
]

export const DEFAULTS = PRESETS[0].settings

const isNum = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi

export function sanitize(input) {
  const out = structuredClone(DEFAULTS)
  if (!input || typeof input !== 'object' || input.version !== 11) return out
  for (const key of Object.keys(out.knobs)) if (isNum(input.knobs?.[key], 0, 1)) out.knobs[key] = input.knobs[key]
  if (isNum(input.master, 0, 1)) out.master = input.master
  if (Array.isArray(input.patches)) {
    out.patches = input.patches
      .filter((x) => x && SOURCE_IDS.includes(x.source) && PARAM_BY_KEY[x.target]?.patchable && isNum(x.amount, -1, 1))
      .filter((x, i, all) => all.findIndex((y) => y.source === x.source && y.target === x.target) === i)
      .slice(0, 96)
      .map(({ source, target, amount }) => ({ source, target, amount }))
  }
  return out
}

// A fresh random patch that stays usable: levels never vanish, distortions lean low,
// and 4–7 data sources get wired to random knobs.
export function randomSettings(rand = Math.random, master = 0.8) {
  const range = (lo, hi) => lo + rand() * (hi - lo)
  const knobs = {}
  for (const p of PARAMS) {
    if (p.module.id === 'distort' && !['grain', 'zoom', 'rotate', 'shift'].includes(p.id)) knobs[p.key] = rand() ** 3
    else knobs[p.key] = rand()
  }
  Object.assign(knobs, {
    'global.response': range(0.1, 0.5),
    'synth.level': range(0.45, 0.85),
    'synth.chance': range(0.5, 1),
    'synth.attack': rand() * 0.5,
    'drone.level': range(0.2, 0.6),
    'noise.paper': rand() < 0.75 ? range(0.7, 1) : range(0, 0.3),
    'noise.feedback': range(0, 0.85),
    'noise.saturation': range(0.35, 0.95),
    'noise.contrast': range(0.25, 0.85),
    'distort.feedback': rand() ** 2 * 0.7,
    'distort.static': rand() ** 3 * 0.3,
    'distort.grain': range(0.15, 0.5),
    // a half-inverted picture is flat grey, so it is either off or nearly full
    'distort.invert': rand() < 0.15 ? range(0.85, 1) : 0,
  })
  for (const key in knobs) knobs[key] = Math.round(knobs[key] * 1000) / 1000
  const targets = PARAMS.filter((p) => p.patchable)
  let patches = []
  const count = 4 + Math.floor(rand() * 4)
  for (let i = 0; i < count; i++) {
    const source = SOURCE_IDS[Math.floor(rand() * SOURCE_IDS.length)]
    const target = targets[Math.floor(rand() * targets.length)].key
    const amount = Math.round(range(0.15, 0.6) * (rand() < 0.25 ? -1 : 1) * 100) / 100
    patches = [...patches.filter((x) => !(x.source === source && x.target === target)), { source, target, amount }]
  }
  return { version: 11, knobs, patches, master }
}

export function encodeSettings(settings) {
  return btoa(JSON.stringify(settings)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeSettings(str) {
  try {
    return sanitize(JSON.parse(atob(str.replace(/-/g, '+').replace(/_/g, '/'))))
  } catch {
    return null
  }
}
