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
    return { source, target, amount: Math.round((amount / 2) * 100) / 100 }
  })
  // two decimals, the precision share links keep
  for (const id in k) k[id] = Math.round(Math.max(0, Math.min(1, k[id])) * 100) / 100
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
  // Saved from the app as-is (already in bipolar form), so not run through preset().
  {
    name: 'Night scan',
    settings: {
      version: 11,
      knobs: { ...DEFAULT_KNOBS, 'global.response': 0,
      'synth.algo': 0.64,
      'synth.harmonics': 0.99,
      'synth.timbre': 0.15,
      'synth.morph': 0.43,
      'synth.fold': 0.8,
      'synth.punch': 0,
      'synth.cutoff': 0.15,
      'synth.res': 0.86,
      'synth.fenv': 0,
      'synth.attack': 0.83,
      'synth.decay': 0.84,
      'synth.sustain': 0.05,
      'synth.release': 0.94,
      'synth.note': 0.19,
      'synth.range': 0.5,
      'synth.level': 0.22,
      'synth.pan': 0.49,
      'synth.chance': 0.13,
      'drone.root': 0.14,
      'drone.scale': 0.32,
      'drone.pitch': 0,
      'drone.range': 0.17,
      'drone.glide': 0,
      'drone.voicing': 0.47,
      'drone.ratio': 0.23,
      'drone.index': 0.04,
      'drone.feedback': 0,
      'drone.spread': 0.3,
      'drone.cutoff': 0.07,
      'drone.res': 0.15,
      'drone.type': 0,
      'drone.motion': 0.3,
      'drone.level': 0.48,
      'fx.drive': 0.05,
      'fx.crush': 0,
      'fx.delay': 0.4,
      'fx.time': 0.4,
      'fx.feedback': 0.5,
      'fx.reverb': 0.45,
      'fx.size': 0.74,
      'noise.hue': 0.6,
      'noise.spread': 0,
      'noise.saturation': 0,
      'noise.paper': 0,
      'noise.contrast': 1,
      'noise.scale': 0.03,
      'noise.detail': 0,
      'noise.blur': 0.49,
      'noise.turbulence': 0.4,
      'noise.flow': 0.25,
      'noise.direction': 0.75,
      'noise.feedback': 0.75,
      'noise.zoom': 0.5,
      'noise.rotate': 0.5,
      'noise.drift': 0.4,
      'distort.blocks': 0,
      'distort.blockSize': 1,
      'distort.tear': 0,
      'distort.pixelate': 0.49,
      'distort.rgb': 0.02,
      'distort.static': 0,
      'distort.scanlines': 0.37,
      'distort.grain': 0.35,
      'distort.hueshift': 0,
      'distort.invert': 0,
      'distort.posterize': 0,
      'distort.burn': 0.34,
      'distort.feedback': 0.69,
      'distort.zoom': 0.5,
      'distort.rotate': 0.5,
      'distort.shift': 0.38 },
      patches: [
      patch('port', 'synth.note', 0.35),
      patch('portPop', 'synth.timbre', -0.2),
      patch('ip', 'synth.pan', 0.45),
      patch('port', 'synth.cutoff', 0.51),
      patch('hit', 'drone.index', 0.57),
      patch('density', 'drone.pitch', 0.23),
      patch('ipVol', 'noise.scale', 0.44),
      patch('ip', 'distort.blocks', 0.35),
      patch('ipVol', 'distort.blockSize', 0.42),
      patch('portPop', 'distort.pixelate', 0.53),
      patch('ip', 'distort.burn', 0.29),
      ],
      master: 0.65,
    },
  },
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

// Compact share links: a format byte, the master volume, then only the knobs that
// differ from their defaults (index into PARAMS, value 0..100) and the patches (source,
// target index, amount + 100), as bytes in base64url. Prefixed with "c" to tell it
// apart from the older JSON links, which still decode. Indexes follow PARAMS order, so
// adding knobs at the end keeps old links working.
const FORMAT = 1
const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64url = (str) => Uint8Array.from(atob(str.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

export function encodeSettings(settings) {
  const bytes = [FORMAT, Math.round(settings.master * 100)]
  const changed = PARAMS.map((p, i) => [i, Math.round(settings.knobs[p.key] * 100)]).filter(([i, v]) => v !== Math.round(PARAMS[i].value * 100))
  bytes.push(changed.length, ...changed.flat())
  const patches = settings.patches.map((x) => [SOURCE_IDS.indexOf(x.source), PARAMS.findIndex((p) => p.key === x.target), Math.round(x.amount * 100) + 100])
  bytes.push(patches.length, ...patches.flat())
  return `c${b64url(bytes)}`
}

export function decodeSettings(str) {
  try {
    if (!str.startsWith('c')) return sanitize(JSON.parse(atob(str.replace(/-/g, '+').replace(/_/g, '/'))))
    const b = unb64url(str.slice(1))
    if (b[0] !== FORMAT) return null
    const knobs = { ...DEFAULT_KNOBS }
    let i = 2
    for (let n = b[i++]; n > 0; n--, i += 2) if (PARAMS[b[i]]) knobs[PARAMS[b[i]].key] = b[i + 1] / 100
    const patches = []
    for (let n = b[i++]; n > 0; n--, i += 3) {
      if (SOURCE_IDS[b[i]] && PARAMS[b[i + 1]]) patches.push({ source: SOURCE_IDS[b[i]], target: PARAMS[b[i + 1]].key, amount: (b[i + 2] - 100) / 100 })
    }
    return sanitize({ version: DEFAULTS.version, knobs, patches, master: b[1] / 100 })
  } catch {
    return null
  }
}
