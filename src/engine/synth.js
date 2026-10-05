import * as Tone from 'tone'
import { ROOTS } from './settings.js'

const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  pentatonic: [0, 3, 5, 7, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
}
const PARTIALS = 24
const FAT = ['fatsine', 'fattriangle', 'fatsawtooth', 'fatsquare']
const NOISES = ['brown', 'pink', 'white']

export const expMap = (v, lo, hi) => lo * (hi / lo) ** v
const mtof = (m) => 440 * 2 ** ((m - 69) / 12)

export function noteFor(note, range, root, scale) {
  const octaves = 1 + Math.round(range * 3)
  const low = 36 + ROOTS.indexOf(root) + 12 * Math.floor((4 - octaves) / 2)
  const notes = []
  for (let o = 0; o < octaves; o++) for (const i of SCALES[scale]) notes.push(low + o * 12 + i)
  notes.push(low + octaves * 12)
  return notes[Math.round(note * (notes.length - 1))]
}

// Harmonic spectra Osc 1's Shape knob morphs through, like a small wavetable.
const TABLES = [
  (n) => (n === 1 ? 1 : 0), // sine
  (n) => 1 / n, // saw
  (n) => (n % 2 ? 1 / n : 0), // square
  (n) => (1 / n) * (Math.exp(-((n - 3) ** 2) / 2) + 0.8 * Math.exp(-((n - 8) ** 2) / 3) + 0.2), // vocal formants
  (n) => ([1, 3, 6, 10, 15, 21].includes(n) ? 1 / Math.sqrt(n) : 0), // glassy bell
]

export function shapePartials(shape, bright) {
  const pos = Math.min(shape, 0.9999) * (TABLES.length - 1)
  const i = Math.floor(pos)
  const f = pos - i
  const tilt = (1 - bright) * 2
  const out = []
  for (let n = 1; n <= PARTIALS; n++) {
    const amp = (TABLES[i](n) * (1 - f) + TABLES[i + 1](n) * f) * n ** -tilt
    out.push(Math.round(amp * 1000) / 1000)
  }
  return out
}

function droneChord(step, root, scale) {
  const degrees = scale === 'major' ? SCALES.major : scale === 'dorian' ? SCALES.dorian : SCALES.minor
  const progression = scale === 'major' ? [0, 4, 5, 3] : [0, 5, 2, 6]
  const d = progression[step % 4]
  const base = 36 + ROOTS.indexOf(root)
  const n = (k) => base + degrees[(d + k) % 7] + 12 * Math.floor((d + k) / 7)
  return [n(0), n(0) + 12, n(2) + 12, n(4) + 12].map(mtof)
}

// Event voice: Osc 1 (morphing harmonic table + FM warp), Osc 2 (detuned unison),
// sub and noise -> pan -> morphing filter with envelope -> drive -> crush -> chorus
// -> delay -> reverb. A chord drone runs underneath.
export function createSynth() {
  let n = null
  let settings = null
  let ready = false
  let lastMono = 0
  let lastPartials = ''
  let reverbSize = -1
  let chordStep = 0

  function build() {
    const master = new Tone.Volume(-8).toDestination()
    const limiter = new Tone.Limiter(-1).connect(master)
    const reverb = new Tone.Reverb({ decay: 4, wet: 0.4 }).connect(limiter)
    const delay = new Tone.FeedbackDelay({ delayTime: 0.3, feedback: 0.35, wet: 0.2 }).connect(reverb)
    const chorus = new Tone.Chorus({ frequency: 0.8, delayTime: 3.5, depth: 0.6, wet: 0 }).connect(delay).start()
    const crusher = new Tone.BitCrusher({ bits: 16, wet: 0 }).connect(chorus)
    const drive = new Tone.Distortion({ distortion: 0.2, wet: 0 }).connect(crusher)
    const filter = new Tone.Filter({ frequency: 2000, type: 'lowpass', rolloff: -24 }).connect(drive)
    const filterEnv = new Tone.FrequencyEnvelope({ baseFrequency: 2000, octaves: 2, attack: 0.01, decay: 0.3, sustain: 0, release: 0.3 })
    filterEnv.connect(filter.frequency)
    const panner = new Tone.Panner(0).connect(filter)

    const osc1 = new Tone.PolySynth(Tone.FMSynth, {
      maxPolyphony: 12,
      oscillator: { type: 'custom', partials: shapePartials(0.15, 0.55) },
      modulation: { type: 'sine' },
      volume: -10,
    }).connect(panner)
    const osc2 = new Tone.PolySynth(Tone.Synth, {
      maxPolyphony: 12,
      oscillator: { type: 'fatsawtooth', count: 3, spread: 20 },
      volume: -14,
    }).connect(panner)
    const sub = new Tone.PolySynth(Tone.Synth, { maxPolyphony: 8, oscillator: { type: 'sine' }, volume: -8 }).connect(panner)
    const noise = new Tone.NoiseSynth({ noise: { type: 'pink' }, volume: -14 }).connect(panner)

    const droneFilter = new Tone.Filter({ frequency: 600, type: 'lowpass' })
    const droneGain = new Tone.Gain(0).connect(reverb)
    droneGain.connect(limiter)
    droneFilter.connect(droneGain)
    const droneLfo = new Tone.LFO({ frequency: 0.07, min: 300, max: 900 }).connect(droneFilter.frequency).start()
    const drone = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'fatsawtooth', count: 3, spread: 15 },
      envelope: { attack: 3, decay: 1, sustain: 0.8, release: 5 },
      volume: -16,
    }).connect(droneFilter)
    const loop = new Tone.Loop((time) => {
      drone.triggerAttackRelease(droneChord(chordStep++, settings.root, settings.scale), 9, time, 0.5)
    }, 10)

    n = { master, reverb, delay, chorus, crusher, drive, filter, filterEnv, panner, osc1, osc2, sub, noise, droneFilter, droneGain, droneLfo, loop }
  }

  const ramp = (param, value) => param.rampTo(value, 0.05)

  return {
    get ready() {
      return ready
    },
    async start(s) {
      await Tone.start()
      if (!n) build()
      ready = true
      this.setSettings(s)
      n.loop.start(0)
      Tone.getTransport().start()
    },
    stop() {
      if (!n) return
      ready = false
      Tone.getTransport().stop()
      n.loop.stop()
      for (const v of [n.osc1, n.osc2, n.sub]) v.releaseAll()
      n.droneGain.gain.rampTo(0, 0.5)
    },
    setSettings(s) {
      settings = s
      if (!ready) return
      ramp(n.master.volume, s.master > 0 ? Tone.gainToDb(s.master) - 8 : -Infinity)
      const size = s.knobs['fx.size']
      if (Math.abs(size - reverbSize) > 0.02) {
        reverbSize = size
        n.reverb.decay = expMap(size, 0.5, 10)
      }
    },
    setContinuous(v) {
      if (!ready) return
      const cutoff = expMap(v['drone.tone'], 80, 6000)
      n.droneGain.gain.rampTo(v['drone.level'] ** 2 * 1.2, 0.2)
      n.droneLfo.min = cutoff * (1 - v['drone.motion'] * 0.7)
      n.droneLfo.max = cutoff * (1 + v['drone.motion'] * 1.5)
      n.droneLfo.frequency.value = 0.04 + v['drone.motion'] * 0.4
    },
    play(v) {
      if (!ready || Math.random() > v['voice.chance']) return
      const t = Tone.now() + 0.03
      const midi = noteFor(v['voice.note'], v['voice.range'], settings.root, settings.scale)
      const a = expMap(v['amp.attack'], 0.001, 2)
      const d = expMap(v['amp.decay'], 0.02, 3)
      const r = expMap(v['amp.release'], 0.02, 5)
      const gate = a + d
      const envelope = { attack: a, decay: d, sustain: v['amp.sustain'], release: r }
      const vel = v['voice.level']

      // shared chain, set per event
      ramp(n.panner.pan, v['voice.pan'] * 2 - 1)
      const cutoff = expMap(v['filter.cutoff'], 60, 14000)
      n.filter.type = v['filter.morph'] < 0.34 ? 'lowpass' : v['filter.morph'] < 0.67 ? 'bandpass' : 'highpass'
      n.filter.Q.value = expMap(v['filter.res'], 0.5, 18)
      n.filterEnv.baseFrequency = cutoff
      n.filterEnv.octaves = v['filter.env'] * 6
      n.filterEnv.attack = expMap(v['mod.attack'], 0.001, 2)
      n.filterEnv.decay = expMap(v['mod.decay'], 0.02, 3)
      n.filterEnv.triggerAttackRelease(gate, t)
      n.drive.distortion = v['fx.drive']
      ramp(n.drive.wet, Math.sqrt(v['fx.drive']))
      n.crusher.bits.value = 16 - v['fx.crush'] * 13
      ramp(n.crusher.wet, v['fx.crush'] > 0.01 ? 1 : 0)
      ramp(n.chorus.wet, v['fx.chorus'])
      ramp(n.delay.wet, v['fx.delay'] * 0.7)
      n.delay.delayTime.rampTo(expMap(v['fx.time'], 0.05, 1.2), 0.1)
      ramp(n.delay.feedback, v['fx.feedback'] * 0.9)
      ramp(n.reverb.wet, v['fx.reverb'])

      const partials = shapePartials(v['osc1.shape'], v['osc1.bright'])
      const key = partials.join()
      n.osc1.set({
        ...(key !== lastPartials && { oscillator: { partials } }),
        harmonicity: expMap(v['osc1.ratio'], 0.5, 8),
        modulationIndex: v['osc1.warp'] * 20,
        envelope,
        modulationEnvelope: {
          attack: expMap(v['mod.attack'], 0.001, 2),
          decay: expMap(v['mod.decay'], 0.02, 3),
          sustain: 1 - v['mod.amount'],
          release: r,
        },
      })
      lastPartials = key
      if (v['osc1.level'] > 0.01) n.osc1.triggerAttackRelease(mtof(midi), gate, t, vel * v['osc1.level'])

      if (v['osc2.level'] > 0.01) {
        n.osc2.set({
          oscillator: { type: FAT[Math.min(3, Math.floor(v['osc2.shape'] * 4))], spread: v['osc2.spread'] * 60 },
          envelope,
        })
        const oct = Math.round(v['osc2.octave'] * 2 - 1) * 12
        n.osc2.triggerAttackRelease(mtof(midi + oct), gate, t, vel * v['osc2.level'])
      }
      if (v['sub.sub'] > 0.01) {
        n.sub.set({ envelope })
        n.sub.triggerAttackRelease(mtof(midi - 12), gate, t, vel * v['sub.sub'])
      }
      if (v['sub.noise'] > 0.01) {
        const tm = Math.max(t, lastMono + 0.01)
        lastMono = tm
        n.noise.noise.type = NOISES[Math.min(2, Math.floor(v['sub.color'] * 3))]
        n.noise.envelope.set({ attack: a, decay: d, sustain: v['amp.sustain'], release: r })
        n.noise.triggerAttackRelease(gate, tm, vel * v['sub.noise'])
      }
    },
  }
}
