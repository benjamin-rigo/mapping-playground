// Every knob in the app. Values are always 0..1; each module maps them to real units.
// kind: 'event' params are evaluated per attack event, 'continuous' ones every frame
// from smoothed sources. patchable: false keeps a knob out of the modulation matrix.

const p = (id, label, value, extra = {}) => ({ id, label, value, ...extra })

export const MODULES = [
  {
    id: 'osc1', group: 'sound', label: 'Osc 1', kind: 'event',
    params: [p('shape', 'Shape', 0.15), p('bright', 'Bright', 0.55), p('warp', 'Warp', 0.3), p('ratio', 'Ratio', 0.45), p('level', 'Level', 0.8)],
  },
  {
    id: 'osc2', group: 'sound', label: 'Osc 2', kind: 'event',
    params: [p('shape', 'Shape', 0.66), p('spread', 'Spread', 0.3), p('octave', 'Octave', 0.5), p('level', 'Level', 0)],
  },
  {
    id: 'sub', group: 'sound', label: 'Sub & Noise', kind: 'event',
    params: [p('sub', 'Sub', 0.15), p('noise', 'Noise', 0), p('color', 'Color', 0.3)],
  },
  {
    id: 'filter', group: 'sound', label: 'Filter', kind: 'event',
    params: [p('cutoff', 'Cutoff', 0.6), p('res', 'Res', 0.2), p('morph', 'LP·BP·HP', 0), p('env', 'Env amt', 0.35)],
  },
  {
    id: 'amp', group: 'sound', label: 'Amp env', kind: 'event',
    params: [p('attack', 'Attack', 0.03), p('decay', 'Decay', 0.35), p('sustain', 'Sustain', 0.05), p('release', 'Release', 0.5)],
  },
  {
    id: 'mod', group: 'sound', label: 'Mod env', kind: 'event',
    params: [p('attack', 'Attack', 0.02), p('decay', 'Decay', 0.3), p('amount', 'To warp', 0.4)],
  },
  {
    id: 'voice', group: 'sound', label: 'Voice', kind: 'event',
    params: [p('note', 'Note', 0.5), p('range', 'Range', 0.5), p('pan', 'Pan', 0.5), p('level', 'Level', 0.7), p('chance', 'Chance', 0.85)],
  },
  {
    id: 'fx', group: 'sound', label: 'FX', kind: 'event',
    params: [
      p('drive', 'Drive', 0.1), p('crush', 'Crush', 0), p('chorus', 'Chorus', 0), p('delay', 'Delay', 0.25),
      p('time', 'Time', 0.4), p('feedback', 'Feedback', 0.35), p('reverb', 'Reverb', 0.45), p('size', 'Size', 0.6, { patchable: false }),
    ],
  },
  {
    id: 'drone', group: 'sound', label: 'Drone', kind: 'continuous',
    params: [p('level', 'Level', 0.25), p('tone', 'Tone', 0.35), p('motion', 'Motion', 0.3)],
  },
  {
    id: 'field', group: 'visual', label: 'Field', kind: 'continuous',
    params: [p('scale', 'Scale', 0.35), p('turbulence', 'Turbulence', 0.45), p('flow', 'Flow', 0.25), p('detail', 'Detail', 0.6)],
  },
  {
    id: 'color', group: 'visual', label: 'Color', kind: 'continuous',
    params: [p('hue', 'Hue', 0.6), p('spread', 'Spread', 0.05), p('saturation', 'Saturation', 0.75), p('contrast', 'Contrast', 0.35), p('paper', 'Paper', 0.95)],
  },
  {
    id: 'texture', group: 'visual', label: 'Texture', kind: 'continuous',
    params: [p('grain', 'Grain', 0.45), p('softness', 'Softness', 0.75)],
  },
  {
    id: 'impact', group: 'visual', label: 'Impact', kind: 'event',
    params: [p('x', 'Pos X', 0.5), p('y', 'Pos Y', 0.5), p('size', 'Size', 0.35), p('strength', 'Strength', 0.5), p('ink', 'Ink', 0.4), p('decay', 'Decay', 0.4)],
  },
  {
    id: 'distort', group: 'visual', label: 'Distortion', kind: 'event',
    params: [
      p('swirl', 'Swirl', 0.5), p('push', 'Push/pull', 0.6), p('ripple', 'Ripple', 0.3), p('smear', 'Smear', 0),
      p('shatter', 'Shatter', 0), p('pixelate', 'Pixelate', 0), p('tint', 'Tint', 0),
    ],
  },
]

export const PARAMS = MODULES.flatMap((m) =>
  m.params.map((q) => ({ ...q, key: `${m.id}.${q.id}`, module: m, kind: m.kind, patchable: q.patchable !== false })),
)
export const PARAM_BY_KEY = Object.fromEntries(PARAMS.map((q) => [q.key, q]))
export const DEFAULT_KNOBS = Object.fromEntries(PARAMS.map((q) => [q.key, q.value]))

// Modulation sources are only the incoming data types.
export const SOURCES = [
  { id: 'port', label: 'Port', short: 'Port', hint: 'targeted port, low to high' },
  { id: 'portPop', label: 'Port popularity', short: 'Pop', hint: 'how often this port is hit' },
  { id: 'ip', label: 'Attacker IP', short: 'IP', hint: 'first octet of the attacker address' },
  { id: 'ipVol', label: 'Attacker volume', short: 'Vol', hint: 'how many reports this attacker has' },
  { id: 'density', label: 'Density', short: 'Dens', hint: 'events in the last few seconds' },
  { id: 'threat', label: 'Threat level', short: 'Threat', hint: 'global infocon level' },
]
export const SOURCE_IDS = SOURCES.map((s) => s.id)

const clamp01 = (v) => Math.max(0, Math.min(1, v))

export function applyPatches(knobs, patches, sources, kind) {
  const out = { ...knobs }
  for (const { source, target, amount } of patches) {
    const param = PARAM_BY_KEY[target]
    if (!param || (kind && param.kind !== kind)) continue
    out[target] = out[target] + amount * (sources[source] ?? 0)
  }
  for (const k in out) out[k] = clamp01(out[k])
  return out
}

// Set one matrix cell; amount 0 removes the patch.
export function setPatch(patches, source, target, amount) {
  const rest = patches.filter((x) => !(x.source === source && x.target === target))
  return amount === 0 ? rest : [...rest, { source, target, amount }]
}
