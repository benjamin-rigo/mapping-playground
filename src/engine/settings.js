import { DEFAULT_KNOBS, PARAM_BY_KEY, SOURCE_IDS, signal } from './params.js'

export const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
export const SCALES = ['minor', 'major', 'pentatonic', 'dorian', 'phrygian', 'lydian', 'whole tone', 'chromatic']

const patch = (source, target, amount) => ({ source, target, amount })

// Presets are written as "knob + amount × data (0..1)". Bipolar sources are converted
// to the centre form (knob + amount/2, amount/2) so they behave as written.
const preset = (name, knobs, patches, extra = {}) => {
  const k = { ...DEFAULT_KNOBS, ...knobs }
  const out = patches.map(({ source, target, amount }) => {
    if (signal(source, 0) === 0) return { source, target, amount }
    k[target] += amount / 2
    return { source, target, amount: amount / 2 }
  })
  for (const key in k) k[key] = Math.round(Math.max(0, Math.min(1, k[key])) * 100) / 100
  return {
    name,
    settings: { version: 5, knobs: k, patches: out, root: 'A', scale: 'minor', master: 0.8, response: 0.25, hitDecay: 0.35, ...extra },
  }
}

export const PRESETS = [
  preset(
    'Pastel drift',
    { 'synth.note': 0.15, 'synth.shape': 0.1, 'synth.ratio': 0.62, 'synth.level': 0.5 },
    [
      patch('port', 'synth.note', 0.75),
      patch('ip', 'synth.pan', 0.9),
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
      'synth.shape': 0.95, 'synth.bright': 0.8, 'synth.warp': 0.15, 'synth.decay': 0.5, 'synth.release': 0.6, 'synth.note': 0.3,
      'drone.level': 0.25, 'drone.timbre': 0.1, 'fx.delay': 0.4, 'fx.feedback': 0.5,
      'noise.hue': 0.55, 'noise.saturation': 0.7, 'noise.feedback': 0.75, 'noise.drift': 0.4, 'noise.direction': 0.75,
    },
    [
      patch('port', 'synth.note', 0.7),
      patch('portPop', 'synth.bright', -0.4),
      patch('ip', 'synth.pan', 0.9),
      patch('hit', 'distort.rgb', 0.35),
      patch('hit', 'distort.feedback', 0.5),
      patch('hit', 'noise.rotate', 0.1),
      patch('threat', 'noise.hue', 0.2),
    ],
    { root: 'D', scale: 'lydian' },
  ),
  preset(
    'Breakdown',
    {
      'synth.shape': 0.45, 'synth.warp': 0.7, 'synth.ratio': 0.8, 'synth.noise': 0.35, 'synth.xmod': 0.3, 'synth.osc2': 0.3,
      'synth.res': 0.55, 'synth.fenv': 0.7, 'synth.decay': 0.15, 'synth.release': 0.15,
      'drone.timbre': 0.7, 'drone.bright': 0.6, 'drone.spread': 0.7, 'drone.level': 0.35,
      'fx.drive': 0.35, 'fx.crush': 0.2, 'fx.delay': 0.3, 'fx.time': 0.15, 'fx.feedback': 0.55, 'fx.reverb': 0.2,
      'noise.hue': 0.98, 'noise.saturation': 0.8, 'noise.contrast': 0.7, 'noise.blur': 0.3, 'noise.turbulence': 0.7, 'noise.feedback': 0.65,
      'distort.grain': 0.6, 'distort.scanlines': 0.3, 'distort.blocks': 0.2, 'distort.tear': 0.12, 'distort.rgb': 0.3, 'distort.static': 0.08, 'distort.feedback': 0.35, 'distort.shift': 0.75,
    },
    [
      patch('ip', 'synth.note', 0.9),
      patch('port', 'synth.cutoff', 0.6),
      patch('hit', 'fx.crush', 0.5),
      patch('density', 'drone.pitch', 0.5),
      patch('hit', 'distort.blocks', 0.6),
      patch('hit', 'distort.tear', 0.5),
      patch('hit', 'distort.static', 0.4),
      patch('density', 'distort.pixelate', 0.4),
      patch('threat', 'distort.burn', 0.4),
    ],
    { root: 'E', scale: 'phrygian', hitDecay: 0.2 },
  ),
]

export const DEFAULTS = PRESETS[0].settings

const isNum = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi

export function sanitize(input) {
  const out = structuredClone(DEFAULTS)
  if (!input || typeof input !== 'object' || input.version !== 5) return out
  for (const key of Object.keys(out.knobs)) if (isNum(input.knobs?.[key], 0, 1)) out.knobs[key] = input.knobs[key]
  if (Array.isArray(input.patches)) {
    out.patches = input.patches
      .filter((x) => x && SOURCE_IDS.includes(x.source) && PARAM_BY_KEY[x.target]?.patchable && isNum(x.amount, -1, 1))
      .filter((x, i, all) => all.findIndex((y) => y.source === x.source && y.target === x.target) === i)
      .slice(0, 96)
      .map(({ source, target, amount }) => ({ source, target, amount }))
  }
  if (ROOTS.includes(input.root)) out.root = input.root
  if (SCALES.includes(input.scale)) out.scale = input.scale
  for (const k of ['master', 'response', 'hitDecay']) if (isNum(input[k], 0, 1)) out[k] = input[k]
  return out
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
