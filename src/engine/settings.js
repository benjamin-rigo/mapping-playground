import { DEFAULT_KNOBS, PARAM_BY_KEY, SOURCE_IDS } from './params.js'

export const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
export const SCALES = ['minor', 'major', 'pentatonic', 'dorian', 'chromatic']

const patch = (source, target, amount) => ({ source, target, amount })

const preset = (name, knobs, patches, extra = {}) => ({
  name,
  settings: { version: 3, knobs: { ...DEFAULT_KNOBS, ...knobs }, patches, root: 'A', scale: 'minor', master: 0.8, response: 0.25, ...extra },
})

export const PRESETS = [
  preset(
    'Glass rain',
    { 'impact.y': 0.05, 'impact.x': 0.05, 'voice.note': 0.1 },
    [
      patch('port', 'voice.note', 0.8),
      patch('ipVol', 'voice.level', 0.3),
      patch('ip', 'voice.pan', 0.9),
      patch('portPop', 'osc1.shape', 0.4),
      patch('portPop', 'filter.cutoff', 0.3),
      patch('threat', 'fx.drive', 0.5),
      patch('ip', 'impact.x', 0.9),
      patch('port', 'impact.y', 0.9),
      patch('ipVol', 'impact.size', 0.4),
      patch('density', 'field.turbulence', 0.4),
      patch('density', 'distort.ripple', 0.4),
    ],
  ),
  preset(
    'Low tide',
    {
      'voice.range': 0.2, 'voice.level': 0.5, 'osc1.shape': 0.6, 'osc1.warp': 0, 'osc2.level': 0.5, 'osc2.shape': 0.3,
      'osc2.spread': 0.5, 'amp.attack': 0.45, 'amp.decay': 0.7, 'amp.sustain': 0.5, 'amp.release': 0.8, 'filter.cutoff': 0.35,
      'filter.env': 0.2, 'fx.size': 0.9, 'fx.reverb': 0.6, 'drone.level': 0.6, 'drone.tone': 0.25, 'drone.motion': 0.5,
      'field.flow': 0.12, 'field.turbulence': 0.3, 'field.scale': 0.2, 'color.hue': 0.55, 'color.contrast': 0.3,
      'impact.strength': 0.35, 'impact.decay': 0.8, 'impact.size': 0.6, 'distort.swirl': 0.25, 'distort.push': 0.5, 'distort.ripple': 0.7,
    },
    [
      patch('port', 'voice.note', 0.6),
      patch('ipVol', 'osc1.shape', 0.4),
      patch('density', 'filter.cutoff', 0.3),
      patch('density', 'drone.tone', 0.4),
      patch('ip', 'impact.x', 0.9),
      patch('ipVol', 'impact.y', 0.8),
      patch('threat', 'color.hue', -0.4),
    ],
    { scale: 'dorian', root: 'D', response: 0.6 },
  ),
  preset(
    'Static storm',
    {
      'osc1.shape': 0.4, 'osc1.warp': 0.6, 'osc1.ratio': 0.8, 'osc1.xmod': 0.35, 'osc2.level': 0.2, 'osc2.shape': 0.9, 'sub.noise': 0.35, 'sub.color': 0.1, 'amp.attack': 0, 'amp.decay': 0.15,
      'amp.sustain': 0, 'amp.release': 0.15, 'filter.res': 0.55, 'filter.env': 0.7, 'filter.morph': 0.5, 'fx.drive': 0.45,
      'fx.crush': 0.4, 'fx.time': 0.15, 'fx.feedback': 0.55, 'fx.delay': 0.35, 'fx.reverb': 0.15, 'drone.level': 0.1,
      'field.turbulence': 0.85, 'field.flow': 0.6, 'field.scale': 0.6, 'color.hue': 0.98, 'color.saturation': 0.9,
      'color.contrast': 0.8, 'texture.grain': 0.8, 'texture.softness': 0.2, 'impact.strength': 0.8, 'impact.decay': 0.2,
      'impact.ink': 0.6, 'distort.swirl': 0.3, 'distort.shatter': 0.7, 'distort.smear': 0.6, 'distort.pixelate': 0.35, 'distort.tint': 0.4,
    },
    [
      patch('ip', 'voice.note', 0.9),
      patch('ipVol', 'osc1.warp', 0.4),
      patch('port', 'filter.cutoff', 0.6),
      patch('density', 'fx.crush', 0.5),
      patch('ip', 'impact.x', 0.9),
      patch('portPop', 'impact.y', 1),
      patch('ipVol', 'impact.strength', 0.4),
      patch('density', 'field.turbulence', 0.3),
      patch('density', 'distort.shatter', 0.3),
      patch('portPop', 'distort.tint', 0.5),
    ],
    { scale: 'chromatic', root: 'E', response: 0 },
  ),
]

export const DEFAULTS = PRESETS[0].settings

const isNum = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi

export function sanitize(input) {
  const out = structuredClone(DEFAULTS)
  if (!input || typeof input !== 'object' || input.version !== 3) return out
  for (const key of Object.keys(out.knobs)) if (isNum(input.knobs?.[key], 0, 1)) out.knobs[key] = input.knobs[key]
  if (Array.isArray(input.patches)) {
    out.patches = input.patches
      .filter((x) => x && SOURCE_IDS.includes(x.source) && PARAM_BY_KEY[x.target]?.patchable && isNum(x.amount, -1, 1))
      .filter((x, i, all) => all.findIndex((y) => y.source === x.source && y.target === x.target) === i)
      .slice(0, 64)
      .map(({ source, target, amount }) => ({ source, target, amount }))
  }
  if (ROOTS.includes(input.root)) out.root = input.root
  if (SCALES.includes(input.scale)) out.scale = input.scale
  if (isNum(input.master, 0, 1)) out.master = input.master
  if (isNum(input.response, 0, 1)) out.response = input.response
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
