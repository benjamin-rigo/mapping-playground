// Shared music helpers: keys, scales, note names and tempo divisions.

export const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
export const SCALES = ['minor', 'major', 'pentatonic', 'dorian', 'phrygian', 'lydian', 'whole tone', 'chromatic']
export const SCALE_STEPS = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  pentatonic: [0, 3, 5, 7, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  'whole tone': [0, 2, 4, 6, 8, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
}

export const step = (v, n) => Math.min(n - 1, Math.floor(v * n))
// Knob value at the centre of step i of n, for presets and pickers.
export const stepValue = (i, n) => (i + 0.5) / n
export const expMap = (v, lo, hi) => lo * (hi / lo) ** v
export const mtof = (m) => 440 * 2 ** ((m - 69) / 12)
export const noteName = (m) => `${ROOTS[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`

// The key from the Drone Root and Scale knobs.
export const keyOf = (knobs) => ({ root: ROOTS[step(knobs['drone.root'], 12)], scale: SCALES[step(knobs['drone.scale'], 8)] })

// Every note of the scale between MIDI 12 and 119.
export function scaleNotes(root, scale) {
  const out = []
  for (let o = 0; o < 9; o++) for (const s of SCALE_STEPS[scale]) out.push(12 + ROOTS.indexOf(root) + o * 12 + s)
  return out
}

// A knob value 0..1 picks a scale note between lo and hi (MIDI).
export function noteAt(v, root, scale, lo, hi) {
  const notes = scaleNotes(root, scale).filter((m) => m >= lo && m <= hi)
  return notes[Math.round(Math.max(0, Math.min(1, v)) * (notes.length - 1))]
}

export const SYNTH_RANGE = [24, 96] // C1..C7
export const DRONE_RANGE = [24, 72] // C1..C5

// Root plus scale-wise third, fifth and octave above it.
export function droneChord(pitch, root, scale) {
  const all = scaleNotes(root, scale)
  const first = noteAt(pitch, root, scale, ...DRONE_RANGE)
  const i = all.indexOf(first)
  const offsets = scale === 'chromatic' ? [0, 7, 12, 19] : [0, 2, 4, SCALE_STEPS[scale].length]
  return offsets.map((o) => all[Math.min(all.length - 1, i + o)])
}

// Note values in beats (a quarter note = 1).
export const DIVISIONS = [
  ['1/32', 0.125],
  ['1/16T', 1 / 6],
  ['1/16', 0.25],
  ['1/8T', 1 / 3],
  ['1/16.', 0.375],
  ['1/8', 0.5],
  ['1/4T', 2 / 3],
  ['1/8.', 0.75],
  ['1/4', 1],
  ['1/2T', 4 / 3],
  ['1/4.', 1.5],
  ['1/2', 2],
  ['1/1', 4],
]

export const bpmOf = (v) => Math.round(60 + v * 120) // 60..180
export const secondsLabel = (s) => (s < 1 ? `${Math.round(s * 1000)} ms` : `${s.toFixed(s < 10 ? 2 : 1)} s`)
