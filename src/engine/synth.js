import * as Tone from 'tone'
import { ALGORITHMS, ROOTS, SCALES, algoIndex, step } from './params.js'

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

// Synth: a per-attack Web Audio voice built from one of eleven algorithms (after
// Plaits: the same Harmonics/Timbre/Morph mean something different in each), plus a
// wavefolder (Fold) and pitch envelope (Punch) after Basimilus Iteritas, a per-voice
// filter and envelopes. Drone: a held four-note chord in the scale with glide, morphing
// timbre and slow filter/amp movement. Both run through drive -> crush -> delay ->
// reverb.
export function createSynth() {
  let n = null
  let raw = null
  // Key shared by drone and synth, from the (modulated) Drone Root and Scale knobs.
  let root = 'A'
  let scale = 'minor'
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
    const master = new Tone.Volume(-4).toDestination()
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

  const cache = new Map()
  const cached = (key, make) => {
    if (!cache.has(key)) cache.set(key, make())
    return cache.get(key)
  }
  const periodic = (key, real, imag) => cached(key, () => raw.createPeriodicWave(real, imag))
  const q = (x) => Math.round(x * 20) / 20

  // Triangle -> saw morph and variable-width pulse, as Fourier series.
  function triSaw(m) {
    return periodic(`ts${q(m)}`, new Float32Array(33), Float32Array.from({ length: 33 }, (_, n) => {
      if (n === 0) return 0
      const tri = n % 2 ? (8 / Math.PI ** 2) * (((n - 1) / 2) % 2 ? -1 : 1) / n ** 2 : 0
      return tri * (1 - q(m)) + (1 / n) * q(m)
    }))
  }
  function pulse(width) {
    const d = q(width)
    return periodic(`pw${d}`, Float32Array.from({ length: 33 }, (_, n) => (n ? (2 / (n * Math.PI)) * Math.sin(n * Math.PI * d) : 0)), new Float32Array(33))
  }
  function additive(h, t, m) {
    const bumps = 1 + Math.floor(h * 3.99)
    const peak = 1 + q(t) * 23
    const width = 8 - q(m) * 7
    return periodic(`ad${bumps}:${q(t)}:${q(m)}`, new Float32Array(49), Float32Array.from({ length: 49 }, (_, n) => {
      if (n === 0) return 0
      let a = n === 1 ? 0.3 : 0
      for (let b = 0; b < bumps; b++) a += Math.exp(-((n - peak * (1 + b * 0.8)) ** 2) / (2 * width ** 2))
      return a / Math.sqrt(n)
    }))
  }
  // Sine wavefolder with gain and offset baked into the curve (inputs are clamped to +-1).
  function foldCurve(amount, offset = 0) {
    return cached(`fold${q(amount)}:${q(offset)}`, () => {
      const g = 1 + q(amount) * 8
      return Float32Array.from({ length: 2048 }, (_, i) => Math.sin(((i / 2047) * 2 - 1 + offset) * g * Math.PI * 0.5))
    })
  }
  function dust(density) {
    return cached(`dust${q(density)}`, () => {
      const buf = raw.createBuffer(1, raw.sampleRate, raw.sampleRate)
      const d = buf.getChannelData(0)
      const rate = expMap(q(density), 15, 4000)
      for (let i = 0; i < d.length; i++) if (Math.random() < rate / raw.sampleRate) d[i] = Math.random() * 2 - 1
      return buf
    })
  }

  const RATIOS = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 7]
  const CHORDS = [[0, 12], [0, 7], [0, 5, 12], [0, 3, 7], [0, 4, 7], [0, 3, 7, 10], [0, 4, 7, 11], [0, 4, 7, 14], [0, 5, 7, 10]]
  const MATERIALS = [
    [1, 2, 3, 4, 5, 6], // string
    [1, 2.756, 5.404, 8.933, 13.344, 18.64], // bar
    [1, 1.594, 2.136, 2.296, 2.653, 2.918], // membrane
  ]
  const BASIC = ['sine', 'triangle', 'sawtooth', 'square']

  function voice(v, t) {
    const ctx = raw
    const midi = noteFor(v['synth.note'], v['synth.range'], root, scale, 48)
    const f = mtof(midi)
    const H = v['synth.harmonics']
    const T = v['synth.timbre']
    const M = v['synth.morph']
    const a = expMap(v['synth.attack'], 0.001, 2)
    const d = expMap(v['synth.decay'], 0.02, 3)
    const r = expMap(v['synth.release'], 0.02, 5)
    const gateEnd = t + a + d
    const end = gateEnd + r * 1.5 + 0.05
    const level = v['synth.level'] ** 2
    const algo = ALGORITHMS[algoIndex(v['synth.algo'])].id

    const sources = []
    const gain = (value) => {
      const g = ctx.createGain()
      g.gain.value = value
      return g
    }
    // Punch: every oscillator starts higher and drops to pitch (BIA "Liquid" style kick).
    const punch = v['synth.punch'] + (algo === 'drum' ? 0.25 : 0)
    const setFreq = (param, fr) => {
      if (punch > 0.01) {
        param.setValueAtTime(fr * 2 ** (punch * 4), t)
        param.setTargetAtTime(fr, t, 0.008 + punch * 0.05)
      } else param.value = fr
    }
    const osc = (wave, fr, level, dest) => {
      const o = ctx.createOscillator()
      if (typeof wave === 'string') o.type = wave
      else o.setPeriodicWave(wave)
      setFreq(o.frequency, fr)
      sources.push(o)
      if (dest) o.connect(gain(level)).connect(dest)
      return o
    }
    const noiseSrc = (buffer, dest) => {
      const src = ctx.createBufferSource()
      src.buffer = buffer
      src.loop = true
      sources.push(src)
      src.connect(dest)
      return src
    }
    // A partial with its own decay, for the modal and drum models.
    const partial = (wave, fr, amp, decay, dest) => {
      const g = gain(0)
      g.gain.setValueAtTime(amp, t)
      g.gain.setTargetAtTime(0, t + 0.002, decay / 4)
      osc(wave, fr, 1, null).connect(g).connect(dest)
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

    const cutoff = expMap(v['synth.cutoff'], 60, 16000)
    const filter = ctx.createBiquadFilter()
    filter.Q.value = expMap(v['synth.res'], 0.5, 18)
    filter.frequency.setValueAtTime(cutoff, t)
    filter.frequency.linearRampToValueAtTime(Math.min(18000, cutoff * 2 ** (v['synth.fenv'] * 6)), t + a + 0.005)
    filter.frequency.setTargetAtTime(cutoff, t + a + 0.005, d / 3)
    filter.connect(out)

    const mix = gain(1)
    if (v['synth.fold'] > 0.01) {
      const shaper = ctx.createWaveShaper()
      shaper.curve = foldCurve(v['synth.fold'])
      shaper.oversample = '2x'
      mix.connect(gain(0.9)).connect(shaper).connect(gain(0.7)).connect(filter)
    } else mix.connect(filter)

    const decayTime = expMap(M, 0.08, 6)
    switch (algo) {
      case 'analog':
        osc(triSaw(M), f, 0.35, mix)
        osc(pulse(0.5 - T * 0.45), f * 2 ** ((H * 40) / 1200), 0.3, mix)
        break
      case 'fold': {
        const shaper = ctx.createWaveShaper()
        shaper.curve = foldCurve(T, (M - 0.5) * 0.8)
        shaper.oversample = '2x'
        shaper.connect(gain(0.45)).connect(mix)
        osc(H < 0.5 ? 'sine' : 'triangle', f, 0.95, shaper)
        break
      }
      case 'fm': {
        const ratio = RATIOS[Math.min(RATIOS.length - 1, Math.floor(H * RATIOS.length))]
        const car = osc('sine', f, 0.5, mix)
        const mod = osc('sine', f * ratio, 1, null)
        const depth = gain(0)
        depth.gain.setValueAtTime(f * T * 10, t)
        depth.gain.setTargetAtTime(f * T * 3, t, d / 2)
        mod.connect(depth).connect(car.frequency)
        if (M > 0.01) osc('sine', f * ratio * 1.5, f * ratio * M * 4, null).connect(gain(f * ratio * M * 4)).connect(mod.frequency)
        break
      }
      case 'formant': {
        const src = osc('sawtooth', f, 1, null)
        const f1 = 250 * 2 ** (T * 3.5)
        for (const [freq, lvl] of [[f1, 1], [f1 * (1.2 + H * 3), 0.6]]) {
          const bp = ctx.createBiquadFilter()
          bp.type = 'bandpass'
          bp.frequency.value = freq
          bp.Q.value = 2 + M * 25
          src.connect(bp).connect(gain(lvl * (1 + M * 3))).connect(mix)
        }
        break
      }
      case 'additive':
        osc(additive(H, T, M), f, 0.5, mix)
        break
      case 'wavetable': {
        const w = periodic(`wt${q(T)}:${q(M)}`, new Float32Array(25), Float32Array.from([0, ...shapePartials(q(T), q(M))]))
        osc(w, f, 0.45, mix)
        if (H > 0.02) for (const c of [-1, 1]) osc(w, f * 2 ** ((c * H * 25) / 1200), H * 0.3, mix)
        break
      }
      case 'chords': {
        const intervals = [...CHORDS[Math.min(CHORDS.length - 1, Math.floor(H * CHORDS.length))]]
        const up = Math.floor(T * intervals.length)
        for (let i = 0; i < up; i++) intervals[i] += 12
        for (const iv of intervals) osc(BASIC[Math.min(3, Math.floor(M * 4))], f * 2 ** (iv / 12), 0.9 / intervals.length, mix)
        break
      }
      case 'modal': {
        const m = H * 2
        const lo = MATERIALS[Math.min(1, Math.floor(m))]
        const hi = MATERIALS[Math.min(2, Math.floor(m) + 1)]
        const k = m - Math.floor(m)
        for (let i = 0; i < 6; i++) {
          const ratio = lo[i] * (1 - k) + hi[i] * k
          if (f * ratio > 18000) continue
          partial('sine', f * ratio, (0.5 / (i + 1) ** ((1 - T) * 2)) * 0.6, decayTime / (1 + i * 0.5), mix)
        }
        break
      }
      case 'drum': {
        const wave = BASIC[Math.min(3, Math.floor(M * 4))]
        for (let i = 0; i < 6; i++) {
          const ratio = (i + 1) ** (0.5 + H)
          if (f * ratio > 18000) continue
          partial(wave, f * ratio, Math.exp(-i * (1 - T) * 1.2) * 0.3, d * (1.2 - i * 0.12), mix)
        }
        break
      }
      case 'noise': {
        const flt = ctx.createBiquadFilter()
        flt.type = H < 0.34 ? 'lowpass' : H < 0.67 ? 'bandpass' : 'highpass'
        flt.frequency.value = Math.min(16000, f * 2 ** (T * 6 - 1))
        flt.Q.value = expMap(M, 0.5, 30)
        flt.connect(gain(0.35 + M * 0.3)).connect(mix)
        noiseSrc(n.noise, flt)
        break
      }
      case 'dust': {
        const flt = ctx.createBiquadFilter()
        flt.type = 'bandpass'
        flt.frequency.value = f * 2 ** ((Math.random() - 0.5) * H * 4)
        flt.Q.value = expMap(M, 1, 80)
        flt.connect(gain(10 + M * 40)).connect(mix)
        noiseSrc(dust(T), flt)
        break
      }
    }

    active++
    sources[0].onended = () => {
      active--
      pan.disconnect()
    }
    for (const s of sources) {
      s.start(t, s.buffer ? Math.random() * 0.5 : undefined)
      s.stop(end)
    }
  }

  return {
    get ready() {
      return ready
    },
    async start() {
      await Tone.start()
      if (!n) build()
      ready = true
    },
    stop() {
      if (!n) return
      ready = false
      glideTo(n.droneOut.gain, 0, 0.3)
    },
    // continuous knobs (drone + fx), called ~20 times per second
    setContinuous(v, tau) {
      if (!ready) return
      const tc = Math.max(0.01, tau / 3)
      const master = v['global.master']
      n.master.volume.rampTo(master > 0 ? Tone.gainToDb(master) - 4 : -Infinity, 0.05)

      root = ROOTS[step(v['drone.root'], ROOTS.length)]
      scale = SCALES[step(v['drone.scale'], SCALES.length)]
      const chord = droneChord(v['drone.pitch'], v['drone.range'], root, scale)
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
