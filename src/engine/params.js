// Every knob in the app. Values are always 0..1; each module maps them to real units.
// kind: 'event' knobs are read when an attack fires the synth, 'continuous' ones every
// frame from smoothed sources. sub groups knobs inside a module card.
// patchable: false keeps a knob out of the modulation matrix.

const p = (sub, id, label, value, extra = {}) => ({ sub, id, label, value, ...extra })

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
export const step = (v, n) => Math.min(n - 1, Math.floor(v * n))
export const algoIndex = (v) => step(v, ALGORITHMS.length)

export const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
export const SCALES = ['minor', 'major', 'pentatonic', 'dorian', 'phrygian', 'lydian', 'whole tone', 'chromatic']
// Knob value at the centre of step i of n, for presets and pickers.
export const stepValue = (i, n) => (i + 0.5) / n

const ms = (v, lo, hi) => `${Math.round(lo * (hi / lo) ** v)}ms`

export const MODULES = [
  {
    id: 'global', group: 'sound', label: 'Global', kind: 'continuous',
    hint: 'how the data reacts, and the volume',
    params: [
      p('Reaction', 'response', 'Response', 0.25, { format: (v) => ms(v, 10, 3000) }),
      p('Reaction', 'hitDecay', 'Hit decay', 0.35, { format: (v) => ms(v, 50, 3000) }),
      p('Reaction', 'master', 'Master', 0.8, { format: (v) => `${Math.round(v * 100)}%` }),
    ],
  },
  {
    id: 'synth', group: 'sound', label: 'Synth', kind: 'event',
    hint: 'one note per attack',
    params: [
      p('Engine', 'algo', 'Algorithm', 0.05, { format: (v) => ALGORITHMS[algoIndex(v)].name }),
      p('Engine', 'harmonics', 'Harmonics', 0.4, { macro: 0 }), p('Engine', 'timbre', 'Timbre', 0.5, { macro: 1 }), p('Engine', 'morph', 'Morph', 0.4, { macro: 2 }),
      p('Shape', 'fold', 'Fold', 0), p('Shape', 'punch', 'Punch', 0),
      p('Filter', 'cutoff', 'Cutoff', 0.7), p('Filter', 'res', 'Res', 0.15), p('Filter', 'fenv', 'Env amt', 0.3),
      p('Envelope', 'attack', 'Attack', 0.03), p('Envelope', 'decay', 'Decay', 0.35), p('Envelope', 'sustain', 'Sustain', 0.05), p('Envelope', 'release', 'Release', 0.5),
      p('Voice', 'note', 'Note', 0.5), p('Voice', 'range', 'Range', 0.5), p('Voice', 'level', 'Level', 0.7), p('Voice', 'pan', 'Pan', 0.5), p('Voice', 'chance', 'Chance', 0.85),
    ],
  },
  {
    id: 'drone', group: 'sound', label: 'Drone', kind: 'continuous',
    hint: 'a held chord; its key is shared with the synth',
    params: [
      p('Key', 'root', 'Root', stepValue(9, 12), { format: (v) => ROOTS[step(v, 12)] }),
      p('Key', 'scale', 'Scale', stepValue(0, 8), { format: (v) => SCALES[step(v, 8)] }),
      p('Pitch', 'pitch', 'Pitch', 0.4), p('Pitch', 'range', 'Range', 0.3), p('Pitch', 'glide', 'Glide', 0.5), p('Pitch', 'voicing', 'Voicing', 0.6),
      p('Tone', 'timbre', 'Timbre', 0.3), p('Tone', 'bright', 'Bright', 0.35), p('Tone', 'spread', 'Spread', 0.3),
      p('Movement', 'motion', 'Motion', 0.3), p('Movement', 'level', 'Level', 0.45),
    ],
  },
  {
    id: 'fx', group: 'sound', label: 'FX', kind: 'continuous',
    hint: 'shared by synth and drone',
    params: [
      p('Dirt', 'drive', 'Drive', 0.05), p('Dirt', 'crush', 'Crush', 0),
      p('Space', 'delay', 'Delay', 0.2), p('Space', 'time', 'Time', 0.4), p('Space', 'feedback', 'Feedback', 0.35),
      p('Space', 'reverb', 'Reverb', 0.45), p('Space', 'size', 'Size', 0.6, { patchable: false }),
    ],
  },
  {
    id: 'noise', group: 'visual', label: 'Noise', kind: 'continuous',
    hint: 'soft blurred noise with feedback',
    params: [
      p('Color', 'hue', 'Hue', 0.6), p('Color', 'spread', 'Hue spread', 0.08), p('Color', 'saturation', 'Saturation', 0.55),
      p('Color', 'paper', 'Paper', 0.93), p('Color', 'contrast', 'Contrast', 0.4),
      p('Shape', 'scale', 'Scale', 0.35), p('Shape', 'detail', 'Detail', 0.6), p('Shape', 'blur', 'Blur', 0.7), p('Shape', 'turbulence', 'Turbulence', 0.4),
      p('Motion', 'flow', 'Speed', 0.25), p('Motion', 'direction', 'Direction', 0.25),
      p('Feedback', 'feedback', 'Amount', 0.5), p('Feedback', 'zoom', 'Zoom', 0.5), p('Feedback', 'rotate', 'Rotate', 0.5), p('Feedback', 'drift', 'Drift', 0.2),
    ],
  },
  {
    id: 'distort', group: 'visual', label: 'Distortion', kind: 'continuous',
    hint: 'breaks the picture apart',
    params: [
      p('Glitch', 'blocks', 'Blocks', 0), p('Glitch', 'tear', 'Tear', 0), p('Glitch', 'pixelate', 'Pixelate', 0), p('Glitch', 'rgb', 'RGB split', 0),
      p('Noise', 'static', 'Static', 0), p('Noise', 'scanlines', 'Scanlines', 0), p('Noise', 'grain', 'Grain', 0.35),
      p('Color', 'hueshift', 'Hue shift', 0), p('Color', 'invert', 'Invert', 0), p('Color', 'posterize', 'Posterize', 0), p('Color', 'burn', 'Burn', 0),
      p('Feedback', 'feedback', 'Amount', 0), p('Feedback', 'zoom', 'Zoom', 0.5), p('Feedback', 'rotate', 'Rotate', 0.5), p('Feedback', 'shift', 'Shift', 0.5),
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
