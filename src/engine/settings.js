import { DEFAULT_KNOBS, PARAM_BY_KEY, SOURCE_IDS } from './params.js'

export const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
export const SCALES = ['minor', 'major', 'pentatonic', 'dorian', 'chromatic']

const patch = (source, target, amount) => ({ source, target, amount })

const preset = (name, knobs, patches, extra = {}) => ({
  name,
  settings: { version: 2, knobs: { ...DEFAULT_KNOBS, ...knobs }, patches, root: 'A', scale: 'minor', master: 0.8, ...extra },
})

export const PRESETS = [
  preset(
    'Glass rain',
    { 'impact.y': 0.05, 'impact.x': 0.05, 'voice.note': 0.1, 'color.hue': 0.6, 'color.contrast': 0.35, 'texture.softness': 0.75 },
    [
      patch('port', 'voice.note', 0.8),
      patch('ipVol', 'voice.level', 0.3),
      patch('ip', 'voice.pan', 0.9),
      patch('ip', 'impact.x', 0.9),
      patch('port', 'impact.y', 0.9),
      patch('ipVol', 'impact.size', 0.4),
      patch('density', 'field.turbulence', 0.4),
      patch('threat', 'drive.drive', 0.5),
      patch('lfo', 'color.hue', 0.03),
      patch('portPop', 'filter.cutoff', 0.3),
    ],
  ),
  preset(
    'Low tide',
    {
      'voice.range': 0.2, 'voice.level': 0.45, 'osc.wave': 0.66, 'osc.fm': 0, 'env.attack': 0.45, 'env.decay': 0.7,
      'env.sustain': 0.5, 'env.release': 0.8, 'filter.cutoff': 0.35, 'filter.env': 0.2, 'reverb.size': 0.9, 'reverb.mix': 0.55,
      'drone.level': 0.6, 'drone.tone': 0.25, 'drone.motion': 0.5, 'field.flow': 0.12, 'field.turbulence': 0.3, 'field.scale': 0.2,
      'color.hue': 0.55, 'color.contrast': 0.3, 'impact.strength': 0.35, 'impact.decay': 0.8, 'impact.size': 0.6,
    },
    [
      patch('port', 'voice.note', 0.6),
      patch('density', 'drone.tone', 0.4),
      patch('lfo', 'field.flow', 0.15),
      patch('ip', 'impact.x', 0.9),
      patch('ipVol', 'impact.y', 0.8),
      patch('threat', 'color.hue', -0.4),
      patch('random', 'voice.chance', -0.6),
    ],
    { scale: 'dorian', root: 'D' },
  ),
  preset(
    'Static storm',
    {
      'osc.wave': 1, 'osc.fm': 0.55, 'osc.ratio': 0.83, 'osc.noise': 0.35, 'env.attack': 0, 'env.decay': 0.15, 'env.sustain': 0,
      'env.release': 0.15, 'filter.reso': 0.55, 'filter.env': 0.7, 'drive.drive': 0.45, 'drive.crush': 0.4, 'delay.time': 0.15,
      'delay.feedback': 0.55, 'delay.mix': 0.35, 'reverb.mix': 0.15, 'drone.level': 0.1, 'field.turbulence': 0.85,
      'field.flow': 0.6, 'field.scale': 0.6, 'color.hue': 0.98, 'color.saturation': 0.9, 'color.contrast': 0.8,
      'texture.grain': 0.8, 'texture.softness': 0.2, 'impact.strength': 0.8, 'impact.swirl': 0.9, 'impact.decay': 0.2,
    },
    [
      patch('port', 'filter.cutoff', 0.6),
      patch('density', 'drive.crush', 0.5),
      patch('ip', 'voice.note', 0.9),
      patch('ip', 'impact.x', 0.9),
      patch('random', 'impact.y', 1),
      patch('density', 'field.turbulence', 0.3),
      patch('ipVol', 'impact.strength', 0.4),
    ],
    { scale: 'chromatic', root: 'E' },
  ),
]

export const DEFAULTS = PRESETS[0].settings

const isNum = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi

export function sanitize(input) {
  const out = structuredClone(DEFAULTS)
  if (!input || typeof input !== 'object' || input.version !== 2) return out
  for (const key of Object.keys(out.knobs)) if (isNum(input.knobs?.[key], 0, 1)) out.knobs[key] = input.knobs[key]
  if (Array.isArray(input.patches)) {
    out.patches = input.patches
      .filter((x) => x && SOURCE_IDS.includes(x.source) && PARAM_BY_KEY[x.target]?.patchable && isNum(x.amount, -1, 1))
      .slice(0, 32)
      .map(({ source, target, amount }) => ({ source, target, amount }))
  }
  if (ROOTS.includes(input.root)) out.root = input.root
  if (SCALES.includes(input.scale)) out.scale = input.scale
  if (isNum(input.master, 0, 1)) out.master = input.master
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
