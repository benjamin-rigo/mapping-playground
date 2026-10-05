import { SOURCE_IDS, TARGET_KEYS } from './params.js'
import { SOUND_ENGINES, VISUAL_ENGINES } from './scenes.js'

export const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
export const SCALES = ['minor', 'major', 'pentatonic', 'dorian', 'chromatic']

const scene = (soundEngine, s, visualEngine, v) => ({
  sound: { engine: soundEngine, color: s[0], texture: s[1], motion: s[2] },
  visual: { engine: visualEngine, color: v[0], texture: v[1], motion: v[2] },
})
const patch = (source, target, amount) => ({ source, target, amount })

const preset = (name, calm, storm, patches, extra = {}) => ({
  name,
  settings: {
    version: 4,
    scenes: { calm, storm },
    tension: 0.05,
    patches,
    root: 'A',
    scale: 'minor',
    master: 0.8,
    response: 0.25,
    hitDecay: 0.35,
    ...extra,
  },
})

export const PRESETS = [
  preset(
    'Pastel to static',
    scene('drone', [0.35, 0.3, 0.3], 'fluid', [0.3, 0.3, 0.25]),
    scene('pulse', [0.7, 0.8, 0.6], 'mosh', [0.4, 0.8, 0.6]),
    [patch('hit', 'tension', 0.55), patch('density', 'tension', 0.3), patch('port', 'sound.color', 0.3), patch('ip', 'visual.color', 0.2)],
  ),
  preset(
    'Glass and tunnel',
    scene('bells', [0.45, 0.2, 0.4], 'fluid', [0.15, 0.2, 0.15]),
    scene('bells', [0.95, 0.7, 0.9], 'tunnel', [0.6, 0.7, 0.85]),
    [patch('hit', 'tension', 0.4), patch('threat', 'tension', 0.3), patch('ipVol', 'sound.texture', 0.4), patch('density', 'visual.motion', 0.4)],
    { root: 'D', scale: 'dorian' },
  ),
  preset(
    'Data rain',
    scene('texture', [0.3, 0.2, 0.2], 'fluid', [0.6, 0.15, 0.2]),
    scene('pulse', [0.9, 1, 0.9], 'grid', [0.1, 0.8, 0.8]),
    [patch('hit', 'tension', 0.7), patch('portPop', 'sound.motion', 0.5), patch('density', 'visual.texture', 0.4)],
    { scale: 'chromatic', root: 'E', hitDecay: 0.2 },
  ),
]

export const DEFAULTS = PRESETS[0].settings

const isNum = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi

function sanitizeScene(input, fallback) {
  const out = structuredClone(fallback)
  for (const [part, engines] of [['sound', SOUND_ENGINES], ['visual', VISUAL_ENGINES]]) {
    const src = input?.[part]
    if (!src) continue
    if (src.engine in engines) out[part].engine = src.engine
    for (const m of ['color', 'texture', 'motion']) if (isNum(src[m], 0, 1)) out[part][m] = src[m]
  }
  return out
}

export function sanitize(input) {
  const out = structuredClone(DEFAULTS)
  if (!input || typeof input !== 'object' || input.version !== 4) return out
  out.scenes.calm = sanitizeScene(input.scenes?.calm, out.scenes.calm)
  out.scenes.storm = sanitizeScene(input.scenes?.storm, out.scenes.storm)
  if (Array.isArray(input.patches)) {
    out.patches = input.patches
      .filter((x) => x && SOURCE_IDS.includes(x.source) && TARGET_KEYS.includes(x.target) && isNum(x.amount, -1, 1))
      .filter((x, i, all) => all.findIndex((y) => y.source === x.source && y.target === x.target) === i)
      .map(({ source, target, amount }) => ({ source, target, amount }))
  }
  if (ROOTS.includes(input.root)) out.root = input.root
  if (SCALES.includes(input.scale)) out.scale = input.scale
  for (const k of ['tension', 'master', 'response', 'hitDecay']) if (isNum(input[k], 0, 1)) out[k] = input[k]
  return out
}

export function randomScene(rand = Math.random) {
  const pick = (o) => Object.keys(o)[Math.floor(rand() * Object.keys(o).length)]
  return scene(pick(SOUND_ENGINES), [rand(), rand(), rand()], pick(VISUAL_ENGINES), [rand(), rand(), rand()])
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
