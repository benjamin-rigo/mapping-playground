// Every knob in the app. Values are always 0..1; each module maps them to real units.
// kind: 'event' knobs are read when an attack fires the synth, 'continuous' ones every
// frame from smoothed sources. sub groups knobs inside a module card.
// patchable: false keeps a knob out of the modulation matrix; header: true shows it
// as a volume slider in the card header instead of a knob.

import { DIVISIONS, DRONE_RANGE, ROOTS, SCALES, SYNTH_RANGE, bpmOf, expMap, keyOf, noteAt, noteName, secondsLabel, step, stepValue } from './music.js'

export { ROOTS, SCALES, step, stepValue }

// Defaults are kept to two decimals, the precision share links store.
const p = (sub, id, label, value, extra = {}) => ({ sub, id, label, value: Math.round(value * 100) / 100, ...extra })

// Synth algorithms (after Mutable Instruments Plaits): the same three macros mean
// something different in each. labels = what Harmonics, Timbre and Morph do.
export const ALGORITHMS = [
  { id: 'analog', name: 'Analog', labels: ['Detune', 'Pulse width', 'Tri → saw'] },
  { id: 'fold', name: 'Fold', labels: ['Shape', 'Fold', 'Asymmetry'] },
  { id: 'fm', name: 'FM', labels: ['Ratio', 'Index', 'Feedback'] },
  { id: 'formant', name: 'Formant', labels: ['F2 ratio', 'Formant', 'Width'] },
  { id: 'additive', name: 'Additive', labels: ['Bumps', 'Peak', 'Narrow'] },
  { id: 'wavetable', name: 'Wavetable', labels: ['Unison', 'Position', 'Bright'] },
  { id: 'chords', name: 'Chords', labels: ['Chord', 'Inversion', 'Wave'] },
  { id: 'modal', name: 'Modal', labels: ['Material', 'Bright', 'Decay'] },
  { id: 'drum', name: 'Drum', labels: ['Spread', 'Partials', 'Wave'] },
  { id: 'noise', name: 'Noise', labels: ['LP · BP · HP', 'Cutoff', 'Resonance'] },
  { id: 'dust', name: 'Dust', labels: ['Scatter', 'Density', 'Resonance'] },
]
export const algoIndex = (v) => step(v, ALGORITHMS.length)

export const FILTER_TYPES = [
  { type: 'lowpass', label: 'LP' },
  { type: 'bandpass', label: 'BP' },
  { type: 'highpass', label: 'HP' },
]
// Modulator/carrier ratios the Drone FM Ratio knob steps through.
export const DRONE_RATIOS = [0.5, 1, 1.5, 2, 3, 4, 5, 7]
export const ARP_MODES = ['Off', 'Up', 'Down', 'Up-down', 'Random']
// Arp rates: a subset of the note divisions.
export const ARP_RATES = DIVISIONS.filter(([name]) => ['1/32', '1/16T', '1/16', '1/8T', '1/8', '1/4T', '1/4'].includes(name))
export const QUANTIZE_STEPS = [0, 2, 3, 4, 6, 8, 12, 16, 24]

// Display helpers; they get the knob value and all knobs (for key, tempo and sync).
const pct = (v) => `${Math.round(v * 100)}%`
const time = (lo, hi) => (v) => secondsLabel(expMap(v, lo, hi))
const synthNote = (v, k) => {
  const { root, scale } = keyOf(k)
  return noteName(noteAt(v, root, scale, ...SYNTH_RANGE))
}
const dronePitch = (v, k) => {
  const { root, scale } = keyOf(k)
  return noteName(noteAt(v, root, scale, ...DRONE_RANGE))
}
const delayTime = (v, k) =>
  step(k['fx.sync'], 2) ? DIVISIONS[step(v, DIVISIONS.length)][0] : secondsLabel(expMap(v, 0.05, 1.2))

export const MODULES = [
  {
    // Shown in the matrix toolbar rather than as a card.
    id: 'global', group: 'matrix', label: 'Matrix', kind: 'continuous',
    params: [
      p('Reaction', 'response', 'Response', 0.25, { format: time(0.01, 3) }),
      p('Reaction', 'quantize', 'Quantize', 0, { format: (v) => (QUANTIZE_STEPS[step(v, QUANTIZE_STEPS.length)] ? `${QUANTIZE_STEPS[step(v, QUANTIZE_STEPS.length)]} steps` : 'Off') }),
      p('Reaction', 'bpm', 'Tempo', 0.5, { format: (v) => `${bpmOf(v)} BPM` }),
    ],
  },
  {
    id: 'synth', group: 'sound', label: 'Synth', kind: 'event',
    hint: 'notes fired by attacks',
    params: [
      p('Engine', 'algo', 'Algorithm', 0.05, { format: (v) => ALGORITHMS[algoIndex(v)].name }),
      p('Engine', 'harmonics', 'Harmonics', 0.4, { macro: 0 }), p('Engine', 'timbre', 'Timbre', 0.5, { macro: 1 }), p('Engine', 'morph', 'Morph', 0.4, { macro: 2 }),
      p('Engine', 'fold', 'Fold', 0), p('Engine', 'punch', 'Punch', 0),
      p('Filter', 'cutoff', 'Cutoff', 0.7), p('Filter', 'res', 'Resonance', 0.15), p('Filter', 'fenv', 'Env depth', 0.3),
      p('Envelope', 'attack', 'Attack', 0.03, { format: time(0.001, 2) }), p('Envelope', 'release', 'Release', 0.5, { format: time(0.02, 5) }),
      p('Arp', 'arpMode', 'Mode', 0, { format: (v) => ARP_MODES[step(v, ARP_MODES.length)] }),
      p('Arp', 'arpRate', 'Rate', stepValue(2, ARP_RATES.length), { format: (v) => ARP_RATES[step(v, ARP_RATES.length)][0] }),
      p('Arp', 'arpSteps', 'Steps', stepValue(3, 8), { format: (v) => `${step(v, 8) + 1}` }),
      p('Arp', 'arpOctaves', 'Octaves', 0, { format: (v) => `${step(v, 3) + 1}` }),
      p('Voice', 'note', 'Note', 0.4, { format: synthNote }), p('Voice', 'level', 'Level', 0.7, { header: true }),
      p('Voice', 'pan', 'Pan', 0.5), p('Voice', 'chance', 'Chance', 0.85, { format: pct }),
    ],
  },
  {
    id: 'drone', group: 'sound', label: 'Drone', kind: 'continuous',
    hint: 'a held chord; its key is shared with the synth',
    params: [
      p('Key', 'root', 'Root', stepValue(9, 12), { format: (v) => ROOTS[step(v, 12)] }),
      p('Key', 'scale', 'Scale', stepValue(0, 8), { format: (v) => SCALES[step(v, 8)] }),
      p('Key', 'pitch', 'Pitch', 0.5, { format: dronePitch }), p('Key', 'glide', 'Glide', 0.5, { format: time(0.01, 6) }),
      p('Key', 'voicing', 'Voicing', 0.6),
      p('FM', 'ratio', 'Ratio', stepValue(1, DRONE_RATIOS.length), { format: (v) => `×${DRONE_RATIOS[step(v, DRONE_RATIOS.length)]}` }),
      p('FM', 'index', 'Index', 0.25), p('FM', 'feedback', 'Feedback', 0), p('FM', 'spread', 'Detune', 0.3),
      p('Bass', 'sub', 'Sub', 0), p('Bass', 'reese', 'Reese', 0), p('Bass', 'width', 'Width', 0.4), p('Bass', 'drive', 'Drive', 0),
      p('Filter', 'cutoff', 'Cutoff', 0.6), p('Filter', 'res', 'Resonance', 0.15),
      p('Filter', 'type', 'Type', 0, { format: (v) => FILTER_TYPES[step(v, 3)].label }),
      p('Envelope', 'attack', 'Attack', 0.4, { format: time(0.05, 8) }), p('Envelope', 'release', 'Release', 0.3, { format: time(0.05, 8) }),
      p('Envelope', 'motion', 'Motion', 0.3), p('Envelope', 'level', 'Level', 0.45, { header: true }),
    ],
  },
  {
    id: 'fx', group: 'sound', label: 'FX', kind: 'continuous',
    hint: 'shared by synth and drone',
    params: [
      p('Dirt', 'drive', 'Drive', 0.05), p('Dirt', 'crush', 'Crush', 0),
      p('Delay', 'delay', 'Amount', 0.2), p('Delay', 'time', 'Time', 0.4, { format: delayTime }),
      p('Delay', 'sync', 'Sync', 0, { format: (v) => (step(v, 2) ? 'Tempo' : 'Free'), patchable: false }),
      p('Delay', 'feedback', 'Feedback', 0.35),
      p('Reverb', 'reverb', 'Amount', 0.45), p('Reverb', 'size', 'Size', 0.6, { patchable: false }),
    ],
  },
  {
    id: 'noise', group: 'visual', label: 'Noise', kind: 'continuous',
    hint: 'soft blurred noise with feedback',
    params: [
      p('Color', 'hue', 'Hue', 0.6), p('Color', 'spread', 'Hue range', 0.08), p('Color', 'saturation', 'Saturation', 0.55),
      p('Color', 'paper', 'Paper', 0.93), p('Color', 'contrast', 'Contrast', 0.4),
      p('Shape', 'scale', 'Scale', 0.35), p('Shape', 'detail', 'Detail', 0.6), p('Shape', 'blur', 'Blur', 0.7), p('Shape', 'turbulence', 'Turbulence', 0.4), p('Shape', 'seed', 'Seed', 0),
      p('Motion', 'flow', 'Speed', 0.25), p('Motion', 'direction', 'Direction', 0.25),
      p('Feedback', 'feedback', 'Amount', 0.5), p('Feedback', 'zoom', 'Zoom', 0.5), p('Feedback', 'rotate', 'Rotate', 0.5), p('Feedback', 'drift', 'Drift', 0.2),
    ],
  },
  {
    id: 'distort', group: 'visual', label: 'Distortion', kind: 'continuous',
    hint: 'breaks the picture apart',
    params: [
      p('Glitch', 'blocks', 'Blocks', 0), p('Glitch', 'blockSize', 'Block size', 0.7), p('Glitch', 'pixelate', 'Pixelate', 0), p('Glitch', 'rgb', 'RGB split', 0),
      p('Noise', 'static', 'Static', 0), p('Noise', 'scanlines', 'Scanlines', 0), p('Noise', 'grain', 'Grain', 0.35),
      p('Color', 'hueshift', 'Hue shift', 0), p('Color', 'posterize', 'Posterize', 0), p('Color', 'burn', 'Burn', 0),
      p('Stylize', 'dither', 'Dither', 0), p('Stylize', 'halftone', 'Halftone', 0), p('Stylize', 'sort', 'Pixel sort', 0), p('Stylize', 'slit', 'Slit-scan', 0),
      p('Feedback', 'feedback', 'Amount', 0), p('Feedback', 'zoom', 'Zoom', 0.5), p('Feedback', 'rotate', 'Rotate', 0.5), p('Feedback', 'shift', 'Drift', 0.5),
    ],
  },
]

export const PARAMS = MODULES.flatMap((m) =>
  m.params.map((q) => ({ ...q, key: `${m.id}.${q.id}`, module: m, kind: m.kind, patchable: q.patchable !== false })),
)
export const PARAM_BY_KEY = Object.fromEntries(PARAMS.map((q) => [q.key, q]))
export const DEFAULT_KNOBS = Object.fromEntries(PARAMS.map((q) => [q.key, q.value]))

// Hit is a trigger turned into an envelope (0 at rest), so it only pushes one way.
// The data values are bipolar around 0.5, so the knob is the centre.
export const SOURCES = [
  { id: 'hit', label: 'Hit', short: 'Hit', hint: 'envelope fired by every attack', unipolar: true },
  { id: 'density', label: 'Density', short: 'Dens', hint: 'attacks in the last few seconds' },
  { id: 'threat', label: 'Threat level', short: 'Threat', hint: 'global infocon level' },
  { id: 'port', label: 'Port', short: 'Port', hint: 'targeted port, low to high' },
  { id: 'portPop', label: 'Port popularity', short: 'Pop', hint: 'how often this port is hit' },
  { id: 'ip', label: 'Attacker IP', short: 'IP', hint: 'first octet of the attacker address' },
  { id: 'ipVol', label: 'Attacker volume', short: 'Vol', hint: 'how many reports this attacker has' },
]
export const SOURCE_IDS = SOURCES.map((s) => s.id)
const UNIPOLAR = new Set(SOURCES.filter((s) => s.unipolar).map((s) => s.id))

export const signal = (source, value) => (UNIPOLAR.has(source) ? value : 2 * value - 1)

const clamp01 = (v) => Math.max(0, Math.min(1, v))

export function applyPatches(knobs, patches, sources, kind) {
  const out = { ...knobs }
  for (const { source, target, amount } of patches) {
    const param = PARAM_BY_KEY[target]
    if (!param || (kind && param.kind !== kind)) continue
    out[target] = out[target] + amount * signal(source, sources[source] ?? 0.5)
  }
  for (const k in out) out[k] = clamp01(out[k])
  return out
}

// Set one matrix cell; amount 0 removes the patch.
export function setPatch(patches, source, target, amount) {
  const rest = patches.filter((x) => !(x.source === source && x.target === target))
  return amount === 0 ? rest : [...rest, { source, target, amount }]
}

// Share links store knobs by their index in this list. It is frozen: never reorder
// it, only append new keys, so links shared from older versions keep working.
export const LINK_KEYS = [
  'global.response', 'synth.algo', 'synth.harmonics', 'synth.timbre', 'synth.morph', 'synth.fold',
  'synth.punch', 'synth.cutoff', 'synth.res', 'synth.fenv', 'synth.attack', 'synth.decay',
  'synth.sustain', 'synth.release', 'synth.note', 'synth.range', 'synth.level', 'synth.pan',
  'synth.chance', 'drone.root', 'drone.scale', 'drone.pitch', 'drone.range', 'drone.glide',
  'drone.voicing', 'drone.ratio', 'drone.index', 'drone.feedback', 'drone.spread', 'drone.cutoff',
  'drone.res', 'drone.type', 'drone.motion', 'drone.level', 'fx.drive', 'fx.crush',
  'fx.delay', 'fx.time', 'fx.feedback', 'fx.reverb', 'fx.size', 'noise.hue',
  'noise.spread', 'noise.saturation', 'noise.paper', 'noise.contrast', 'noise.scale', 'noise.detail',
  'noise.blur', 'noise.turbulence', 'noise.flow', 'noise.direction', 'noise.feedback', 'noise.zoom',
  'noise.rotate', 'noise.drift', 'distort.blocks', 'distort.blockSize', 'distort.tear', 'distort.pixelate',
  'distort.rgb', 'distort.static', 'distort.scanlines', 'distort.grain', 'distort.hueshift', 'distort.invert',
  'distort.posterize', 'distort.burn', 'distort.feedback', 'distort.zoom', 'distort.rotate', 'distort.shift',
  // added after 1.0.1
  'noise.seed', 'global.quantize', 'global.bpm', 'synth.arpMode', 'synth.arpRate', 'synth.arpSteps',
  'synth.arpOctaves', 'drone.sub', 'drone.reese', 'drone.width', 'drone.drive', 'drone.attack',
  'drone.release', 'fx.sync', 'distort.dither', 'distort.halftone', 'distort.sort', 'distort.slit',
]
// Keys in LINK_KEYS that no longer exist (synth.decay, synth.sustain, synth.range,
// drone.range, distort.tear, distort.invert) are simply ignored when a link loads.
