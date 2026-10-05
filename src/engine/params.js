// Modulation matrix: rows are the Tension fader and the six scene macros, columns are
// the signals coming from the data.

export const TARGETS = [
  { key: 'tension', label: 'Tension', group: 'Global' },
  { key: 'sound.color', label: 'Color', group: 'Sound' },
  { key: 'sound.texture', label: 'Texture', group: 'Sound' },
  { key: 'sound.motion', label: 'Motion', group: 'Sound' },
  { key: 'visual.color', label: 'Color', group: 'Visual' },
  { key: 'visual.texture', label: 'Texture', group: 'Visual' },
  { key: 'visual.motion', label: 'Motion', group: 'Visual' },
]
export const TARGET_KEYS = TARGETS.map((t) => t.key)

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

// Summed modulation offset per target.
export function modOffsets(patches, sources) {
  const out = Object.fromEntries(TARGET_KEYS.map((k) => [k, 0]))
  for (const { source, target, amount } of patches) {
    if (target in out) out[target] += amount * signal(source, sources[source] ?? 0)
  }
  return out
}

// Set one matrix cell; amount 0 removes the patch.
export function setPatch(patches, source, target, amount) {
  const rest = patches.filter((x) => !(x.source === source && x.target === target))
  return amount === 0 ? rest : [...rest, { source, target, amount }]
}
