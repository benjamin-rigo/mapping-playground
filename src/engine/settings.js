export const FIELDS = [
  { id: 'port', label: 'Port' },
  { id: 'portPop', label: 'Port popularity' },
  { id: 'ip', label: 'Attacker IP' },
  { id: 'ipVol', label: 'Attacker volume' },
  { id: 'density', label: 'Density' },
  { id: 'threat', label: 'Threat level' },
  { id: 'random', label: 'Random' },
  { id: 'off', label: 'Off' },
]

export const SOUND_PARAMS = [
  { id: 'pitch', label: 'Pitch' },
  { id: 'volume', label: 'Volume' },
  { id: 'filter', label: 'Filter cutoff' },
  { id: 'distortion', label: 'Distortion' },
  { id: 'reverb', label: 'Reverb' },
  { id: 'delay', label: 'Delay' },
  { id: 'pan', label: 'Pan' },
  { id: 'probability', label: 'Probability' },
]

export const VISUAL_PARAMS = [
  { id: 'posX', label: 'Position X' },
  { id: 'posY', label: 'Position Y' },
  { id: 'size', label: 'Blob size' },
  { id: 'softness', label: 'Softness' },
  { id: 'ink', label: 'Ink strength' },
  { id: 'glitch', label: 'Glitch' },
  { id: 'fade', label: 'Fade speed' },
  { id: 'accent', label: 'Accent mix' },
]

export const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
export const SCALES = ['minor', 'major', 'pentatonic', 'chromatic']
export const VOICES = ['pluck', 'bell', 'noise', 'kick']
export const ACCENTS = ['#ff3b1f', '#ff8a00', '#2f5bff', '#00a37a']

const m = (source, base, amount) => ({ source, base, amount })

export const DEFAULTS = {
  version: 1,
  mappings: {
    pitch: m('port', 0.15, 0.7),
    volume: m('ipVol', 0.45, 0.45),
    filter: m('off', 0.6, 0.5),
    distortion: m('threat', 0.05, 0.6),
    reverb: m('off', 0.45, 0.5),
    delay: m('off', 0.15, 0.5),
    pan: m('ip', 0.1, 0.8),
    probability: m('off', 0.7, 0.5),
    posX: m('ip', 0.05, 0.9),
    posY: m('port', 0.9, -0.8),
    size: m('ipVol', 0.15, 0.6),
    softness: m('off', 0.7, 0.5),
    ink: m('off', 0.6, 0.5),
    glitch: m('density', 0, 0.8),
    fade: m('off', 0.35, 0.5),
    accent: m('density', 0, 0.9),
  },
  tuning: { root: 'A', scale: 'minor', voice: 'pluck', chords: true, master: 0.8 },
  look: { grid: 0.5, grain: 0.4, accent: ACCENTS[0], annotations: true },
}

const isNum = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi
const sourceIds = new Set(FIELDS.map((f) => f.id))

export function sanitize(input) {
  const out = structuredClone(DEFAULTS)
  if (!input || typeof input !== 'object') return out
  for (const [id, def] of Object.entries(out.mappings)) {
    const v = input.mappings?.[id]
    if (!v) continue
    if (sourceIds.has(v.source)) def.source = v.source
    if (isNum(v.base, 0, 1)) def.base = v.base
    if (isNum(v.amount, -1, 1)) def.amount = v.amount
  }
  const t = input.tuning ?? {}
  if (ROOTS.includes(t.root)) out.tuning.root = t.root
  if (SCALES.includes(t.scale)) out.tuning.scale = t.scale
  if (VOICES.includes(t.voice)) out.tuning.voice = t.voice
  if (typeof t.chords === 'boolean') out.tuning.chords = t.chords
  if (isNum(t.master, 0, 1)) out.tuning.master = t.master
  const l = input.look ?? {}
  if (isNum(l.grid, 0, 1)) out.look.grid = l.grid
  if (isNum(l.grain, 0, 1)) out.look.grain = l.grain
  if (ACCENTS.includes(l.accent)) out.look.accent = l.accent
  if (typeof l.annotations === 'boolean') out.look.annotations = l.annotations
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
