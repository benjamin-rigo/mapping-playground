// Every knob in the app. Values are always 0..1; each module maps them to real units.
// kind: 'event' params are evaluated per attack event, 'continuous' ones every frame
// from smoothed sources. patchable: false keeps a knob out of the patch targets.

const p = (id, label, value, extra = {}) => ({ id, label, value, ...extra })

export const MODULES = [
  {
    id: 'voice', group: 'sound', label: 'Voice', kind: 'event',
    params: [p('note', 'Note', 0.5), p('range', 'Range', 0.5), p('level', 'Level', 0.7), p('pan', 'Pan', 0.5), p('chance', 'Chance', 0.85)],
  },
  {
    id: 'osc', group: 'sound', label: 'Oscillator', kind: 'event',
    params: [p('wave', 'Wave', 0.2), p('fm', 'FM amount', 0.3), p('ratio', 'FM ratio', 0.5), p('detune', 'Detune', 0.15), p('noise', 'Noise', 0)],
  },
  {
    id: 'env', group: 'sound', label: 'Envelope', kind: 'event',
    params: [p('attack', 'Attack', 0.05), p('decay', 'Decay', 0.4), p('sustain', 'Sustain', 0.1), p('release', 'Release', 0.45)],
  },
  {
    id: 'filter', group: 'sound', label: 'Filter', kind: 'event',
    params: [p('cutoff', 'Cutoff', 0.6), p('reso', 'Resonance', 0.2), p('env', 'Env amount', 0.35)],
  },
  {
    id: 'drive', group: 'sound', label: 'Drive', kind: 'event',
    params: [p('drive', 'Drive', 0.1), p('crush', 'Crush', 0)],
  },
  {
    id: 'delay', group: 'sound', label: 'Delay', kind: 'event',
    params: [p('time', 'Time', 0.4), p('feedback', 'Feedback', 0.35), p('mix', 'Mix', 0.2)],
  },
  {
    id: 'reverb', group: 'sound', label: 'Reverb', kind: 'event',
    params: [p('size', 'Size', 0.6, { patchable: false }), p('mix', 'Mix', 0.35)],
  },
  {
    id: 'drone', group: 'sound', label: 'Drone', kind: 'continuous',
    params: [p('level', 'Level', 0.3), p('tone', 'Tone', 0.35), p('motion', 'Motion', 0.3)],
  },
  {
    id: 'field', group: 'visual', label: 'Field', kind: 'continuous',
    params: [p('scale', 'Scale', 0.35), p('turbulence', 'Turbulence', 0.45), p('flow', 'Flow', 0.25), p('detail', 'Detail', 0.6)],
  },
  {
    id: 'color', group: 'visual', label: 'Color', kind: 'continuous',
    params: [p('hue', 'Hue', 0.62), p('spread', 'Hue spread', 0.05), p('saturation', 'Saturation', 0.75), p('contrast', 'Contrast', 0.45), p('paper', 'Paper', 0.95)],
  },
  {
    id: 'texture', group: 'visual', label: 'Texture', kind: 'continuous',
    params: [p('grain', 'Grain', 0.45), p('softness', 'Softness', 0.6)],
  },
  {
    id: 'impact', group: 'visual', label: 'Impact', kind: 'event',
    params: [p('x', 'Position X', 0.5), p('y', 'Position Y', 0.5), p('size', 'Size', 0.35), p('strength', 'Strength', 0.5), p('swirl', 'Swirl', 0.5), p('decay', 'Decay', 0.4)],
  },
  {
    id: 'lfo', group: 'mod', label: 'LFO', kind: 'continuous',
    params: [p('rate', 'Rate', 0.3, { patchable: false })],
  },
]

export const PARAMS = MODULES.flatMap((m) =>
  m.params.map((q) => ({ ...q, key: `${m.id}.${q.id}`, module: m, kind: m.kind, patchable: q.patchable !== false })),
)
export const PARAM_BY_KEY = Object.fromEntries(PARAMS.map((q) => [q.key, q]))
export const DEFAULT_KNOBS = Object.fromEntries(PARAMS.map((q) => [q.key, q.value]))

export const SOURCES = [
  { id: 'port', label: 'Port', hint: 'targeted port, low to high' },
  { id: 'portPop', label: 'Port popularity', hint: 'how often this port is hit' },
  { id: 'ip', label: 'Attacker IP', hint: 'first octet of the attacker address' },
  { id: 'ipVol', label: 'Attacker volume', hint: 'how many reports this attacker has' },
  { id: 'density', label: 'Density', hint: 'events in the last few seconds' },
  { id: 'threat', label: 'Threat level', hint: 'global infocon level' },
  { id: 'random', label: 'Random', hint: 'new value per event' },
  { id: 'lfo', label: 'LFO', hint: 'slow sine wave, set its rate in the LFO module' },
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
