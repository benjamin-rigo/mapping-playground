import * as Tone from 'tone'
import { ROOTS } from './settings.js'

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
const MAX_VOICES = 24
const PARTIALS = 24

export const expMap = (v, lo, hi) => lo * (hi / lo) ** v
const mtof = (m) => 440 * 2 ** ((m - 69) / 12)

// Every note of the scale between MIDI 12 and 108.
export function scaleNotes(root, scale) {
  const out = []
  for (let o = 0; o < 9; o++) for (const s of SCALE_STEPS[scale]) out.push(12 + ROOTS.indexOf(root) + o * 12 + s)
  return out
}

// note 0..1 picks a scale note inside a span of 1..4 octaves (range) around base.
export function noteFor(note, range, root, scale, base = 36) {
  const octaves = 1 + Math.round(range * 3)
  const low = base + ROOTS.indexOf(root) + 12 * Math.floor((4 - octaves) / 2)
  const inSpan = scaleNotes(root, scale).filter((m) => m >= low && m <= low + octaves * 12)
  return inSpan[Math.round(note * (inSpan.length - 1))]
}

// Drone chord: root plus scale-wise third, fifth and octave above it.
export function droneChord(pitch, range, root, scale) {
  const all = scaleNotes(root, scale)
  const first = noteFor(pitch, range, root, scale, 36)
  const i = all.indexOf(first)
  const steps = SCALE_STEPS[scale].length
  const offsets = scale === 'chromatic' ? [0, 7, 12, 19] : [0, 2, 4, steps]
  return offsets.map((o) => all[Math.min(all.length - 1, i + o)])
}

// Harmonic spectra the Shape/Timbre knobs morph through, like a small wavetable.
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
  for (let n = 1; n <= PARTIALS; n++) out.push((TABLES[i](n) * (1 - f) + TABLES[i + 1](n) * f) * n ** -tilt)
  return out
}

// Synth: a per-attack Web Audio voice (wavetable-like Osc 1 with FM, a detuned saw
// stack as Osc 2 that can cross-modulate Osc 1, sub, noise, per-voice filter and
// envelopes). Drone: a held four-note chord in the scale with glide, morphing
// timbre and slow filter/amp movement. Both run through drive -> crush -> delay ->
// reverb.
export function createSynth() {
  let n = null
  let raw = null
  let settings = null
  let ready = false
  let active = 0
  let reverbSize = -1
  let droneKey = ''
  let droneTimbre = -1
  const waves = new Map()

  function wave(shape, bright) {
    const key = `${shape.toFixed(2)}:${bright.toFixed(2)}`
    if (!waves.has(key)) {
      const partials = shapePartials(shape, bright)
      const imag = new Float32Array(partials.length + 1)
      imag.set(partials, 1)
      waves.set(key, raw.createPeriodicWave(new Float32Array(imag.length), imag))
    }
    return waves.get(key)
  }

  function build() {
    raw = Tone.getContext().rawContext
    const master = new Tone.Volume(-8).toDestination()
    const limiter = new Tone.Limiter(-1).connect(master)
    const reverb = new Tone.Reverb({ decay: 4, wet: 0.4 }).connect(limiter)
    const delay = new Tone.FeedbackDelay({ delayTime: 0.3, feedback: 0.35, wet: 0.2 }).connect(reverb)
    const crusher = new Tone.BitCrusher({ bits: 16, wet: 0 }).connect(delay)
    const drive = new Tone.Distortion({ distortion: 0.3, wet: 0 }).connect(crusher)
    const input = new Tone.Gain(1).connect(drive)

    const noise = raw.createBuffer(1, raw.sampleRate * 2, raw.sampleRate)
    const nd = noise.getChannelData(0)
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1

    // drone: 4 chord tones x 2 detuned oscillators -> lowpass (LFO) -> tremolo -> level
    const droneOut = raw.createGain()
    droneOut.gain.value = 0
    Tone.connect(droneOut, input)
    const trem = raw.createGain()
    trem.connect(droneOut)
    const dFilter = raw.createBiquadFilter()
    dFilter.Q.value = 1.2
    dFilter.connect(trem)
    const lfo = raw.createOscillator()
    lfo.frequency.value = 0.1
    const lfoDepth = raw.createGain()
    lfo.connect(lfoDepth).connect(dFilter.frequency)
    const amp = raw.createOscillator()
    amp.frequency.value = 0.07
    const ampDepth = raw.createGain()
    amp.connect(ampDepth).connect(trem.gain)
    lfo.start()
    amp.start()
    const tones = [0, 1, 2, 3].map(() => {
      const g = raw.createGain()
      g.connect(dFilter)
      const pair = [-1, 1].map((side) => {
        const o = raw.createOscillator()
        o.frequency.value = 110
        o.connect(g)
        o.start()
        return { o, side }
      })
      return { g, pair }
    })

    n = { master, reverb, delay, crusher, drive, input, noise, droneOut, trem, dFilter, lfo, lfoDepth, amp, ampDepth, tones }
  }

  const now = () => raw.currentTime
  const glideTo = (param, value, tc) => param.setTargetAtTime(value, now(), tc)

  function voice(v, t) {
    const ctx = raw
    const midi = noteFor(v['synth.note'], v['synth.range'], settings.root, settings.scale, 48)
    const f = mtof(midi)
    const a = expMap(v['synth.attack'], 0.001, 2)
    const d = expMap(v['synth.decay'], 0.02, 3)
    const r = expMap(v['synth.release'], 0.02, 5)
    const gateEnd = t + a + d
    const end = gateEnd + r * 1.5 + 0.05
    const level = v['synth.level'] ** 2 * 0.6

    const sources = []
    const gain = (value) => {
      const g = ctx.createGain()
      g.gain.value = value
      return g
    }
    const osc = (type, freq) => {
      const o = ctx.createOscillator()
      if (type) o.type = type
      o.frequency.value = freq
      sources.push(o)
      return o
    }

    const out = gain(0)
    out.gain.setValueAtTime(0, t)
    out.gain.linearRampToValueAtTime(level, t + a)
    out.gain.setTargetAtTime(level * v['synth.sustain'], t + a, d / 3)
    out.gain.setTargetAtTime(0, gateEnd, r / 4)
    const pan = ctx.createStereoPanner()
    pan.pan.value = v['synth.pan'] * 2 - 1
    out.connect(pan)
    Tone.connect(pan, n.input)

    const cutoff = expMap(v['synth.cutoff'], 60, 14000)
    const filter = ctx.createBiquadFilter()
    filter.Q.value = expMap(v['synth.res'], 0.5, 18)
    filter.frequency.setValueAtTime(cutoff, t)
    filter.frequency.linearRampToValueAtTime(Math.min(18000, cutoff * 2 ** (v['synth.fenv'] * 6)), t + a + 0.005)
    filter.frequency.setTargetAtTime(cutoff, t + a + 0.005, d / 3)
    filter.connect(out)

    const cents = v['synth.detune'] * 30
    const o1 = osc(null, f)
    o1.setPeriodicWave(wave(v['synth.shape'], v['synth.bright']))
    o1.detune.value = -cents / 2
    o1.connect(gain(0.5)).connect(filter)

    if (v['synth.warp'] > 0.005) {
      const m = osc('sine', f * expMap(v['synth.ratio'], 0.5, 8))
      const peak = f * v['synth.warp'] * 8
      const depth = gain(0)
      depth.gain.setValueAtTime(peak, t)
      depth.gain.setTargetAtTime(peak * 0.3, t, d / 2)
      m.connect(depth).connect(o1.frequency)
    }

    if (v['synth.osc2'] > 0.005 || v['synth.xmod'] > 0.005) {
      const sum = gain(1 / 3)
      for (const det of [-cents, 0, cents]) {
        const o = osc('sawtooth', f * 1.002)
        o.detune.value = det
        o.connect(sum)
      }
      sum.connect(gain(v['synth.osc2'] * 0.5)).connect(filter)
      if (v['synth.xmod'] > 0.005) sum.connect(gain(f * v['synth.xmod'] * 6)).connect(o1.frequency)
    }

    if (v['synth.sub'] > 0.005) osc('sine', f / 2).connect(gain(v['synth.sub'] * 0.6)).connect(filter)

    if (v['synth.noise'] > 0.005) {
      const src = ctx.createBufferSource()
      src.buffer = n.noise
      src.loop = true
      sources.push(src)
      src.connect(gain(v['synth.noise'] * 0.5)).connect(filter)
    }

    active++
    sources[0].onended = () => {
      active--
      pan.disconnect()
    }
    for (const s of sources) {
      s.start(t, s.buffer ? Math.random() : undefined)
      s.stop(end)
    }
  }

  return {
    get ready() {
      return ready
    },
    async start(s) {
      await Tone.start()
      if (!n) build()
      settings = s
      ready = true
    },
    stop() {
      if (!n) return
      ready = false
      glideTo(n.droneOut.gain, 0, 0.3)
    },
    setSettings(s) {
      settings = s
      if (!ready) return
      n.master.volume.rampTo(s.master > 0 ? Tone.gainToDb(s.master) - 8 : -Infinity, 0.05)
    },
    // continuous knobs (drone + fx), called ~20 times per second
    setContinuous(v, tau) {
      if (!ready) return
      const tc = Math.max(0.01, tau / 3)

      const chord = droneChord(v['drone.pitch'], v['drone.range'], settings.root, settings.scale)
      const key = chord.join()
      if (key !== droneKey) {
        droneKey = key
        const glide = expMap(v['drone.glide'], 0.01, 6) / 3
        n.tones.forEach((t, i) => t.pair.forEach(({ o }) => glideTo(o.frequency, mtof(chord[i]), glide)))
      }
      if (Math.abs(v['drone.timbre'] - droneTimbre) > 0.02) {
        droneTimbre = v['drone.timbre']
        const w = wave(droneTimbre, 0.75)
        for (const t of n.tones) for (const { o } of t.pair) o.setPeriodicWave(w)
      }
      const spread = v['drone.spread'] * 25
      for (const t of n.tones) for (const { o, side } of t.pair) glideTo(o.detune, side * spread, tc)
      n.tones.forEach((t, i) => glideTo(t.g.gain, i === 0 ? 0.35 : Math.max(0, Math.min(1, v['drone.voicing'] * 4 - i + 1)) * 0.25, 0.2))
      const cutoff = expMap(v['drone.bright'], 80, 9000)
      glideTo(n.dFilter.frequency, cutoff, tc)
      glideTo(n.lfoDepth.gain, cutoff * 0.6 * v['drone.motion'], tc)
      n.lfo.frequency.value = 0.03 + v['drone.motion'] * 0.5
      glideTo(n.ampDepth.gain, v['drone.motion'] * 0.35, tc)
      glideTo(n.droneOut.gain, v['drone.level'] ** 2 * 0.5, tc)

      if (Math.abs(n.drive.distortion - (0.2 + v['fx.drive'] * 0.8)) > 0.02) n.drive.distortion = 0.2 + v['fx.drive'] * 0.8
      n.drive.wet.rampTo(Math.min(1, v['fx.drive'] * 1.5), tc)
      n.crusher.bits.value = 16 - v['fx.crush'] * 13
      n.crusher.wet.rampTo(v['fx.crush'] > 0.02 ? 1 : 0, tc)
      n.delay.wet.rampTo(v['fx.delay'] * 0.7, tc)
      n.delay.delayTime.rampTo(expMap(v['fx.time'], 0.05, 1.2), 0.1)
      n.delay.feedback.rampTo(v['fx.feedback'] * 0.9, tc)
      n.reverb.wet.rampTo(v['fx.reverb'], tc)
      if (Math.abs(v['fx.size'] - reverbSize) > 0.02) {
        reverbSize = v['fx.size']
        n.reverb.decay = expMap(reverbSize, 0.5, 10)
      }
    },
    // one attack with the event knobs already modulated
    play(v) {
      if (!ready || active >= MAX_VOICES || Math.random() > v['synth.chance']) return
      voice(v, raw.currentTime + 0.02)
    },
  }
}
