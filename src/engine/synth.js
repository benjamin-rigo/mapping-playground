import * as Tone from 'tone'
import { ALGORITHMS, ARP_MODES, ARP_RATES, DRONE_RATIOS, FILTER_TYPES, HOLD_BEATS, algoIndex } from './params.js'
import { DIVISIONS, ROOTS, SCALES, SYNTH_RANGE, bpmOf, droneChord, expMap, mtof, noteAt, scaleNotes, step } from './music.js'

export { expMap }

const MAX_VOICES = 24
const PARTIALS = 24

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
// timbre and slow filter/amp movement. Both run through drive -> crush -> delay (mono / ping-pong) ->
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
  let droneFreqs = [110, 110, 110, 110]
  let droneDrive = -1
  let lastChange = 0
  let bpm = 120
  let master = 0.8
  function build() {
    raw = Tone.getContext().rawContext
    const master = new Tone.Volume(-4).toDestination()
    const limiter = new Tone.Limiter(-1).connect(master)
    const reverb = new Tone.Reverb({ decay: 4, wet: 0.4 }).connect(limiter)
    // Delay: a mono feedback delay and a ping-pong delay side by side, both fully wet,
    // with sends that crossfade between them (Ping-pong) and scale with Amount.
    const crusher = new Tone.BitCrusher({ bits: 16, wet: 0 })
    const dry = new Tone.Gain(1).connect(reverb)
    const delay = new Tone.FeedbackDelay({ delayTime: 0.3, maxDelay: 4, feedback: 0.35, wet: 1 })
    const pingpong = new Tone.PingPongDelay({ delayTime: 0.3, maxDelay: 4, feedback: 0.35, wet: 1 })
    const monoSend = new Tone.Gain(0).connect(reverb)
    const ppSend = new Tone.Gain(0).connect(reverb)
    crusher.connect(dry)
    crusher.connect(delay)
    crusher.connect(pingpong)
    delay.connect(monoSend)
    pingpong.connect(ppSend)
    const drive = new Tone.Distortion({ distortion: 0.3, wet: 0 }).connect(crusher)
    const input = new Tone.Gain(1).connect(drive)

    const noise = raw.createBuffer(1, raw.sampleRate * 2, raw.sampleRate)
    const nd = noise.getChannelData(0)
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1

    // drone: 4 chord tones, each an FM voice (2 detuned sine carriers, a modulator,
    // and a third operator feeding the modulator) -> lowpass (LFO) -> tremolo -> level.
    // A slow LFO also breathes every voice's FM index.
    // Chain: FM chord + reese + sub -> drive -> filter -> tremolo -> AR envelope -> level.
    const droneOut = raw.createGain()
    droneOut.gain.value = 0
    Tone.connect(droneOut, input)
    const env = raw.createGain()
    env.gain.value = 0
    env.connect(droneOut)
    const trem = raw.createGain()
    trem.connect(env)
    const dFilter = raw.createBiquadFilter()
    dFilter.Q.value = 1.2
    dFilter.connect(trem)
    const dDrive = raw.createWaveShaper()
    dDrive.oversample = '2x'
    dDrive.connect(dFilter)
    const sine = (freq) => {
      const o = raw.createOscillator()
      o.frequency.value = freq
      o.start()
      return o
    }
    const g = (value) => {
      const node = raw.createGain()
      node.gain.value = value
      return node
    }
    const lfo = sine(0.1)
    const lfoDepth = g(0)
    lfo.connect(lfoDepth).connect(dFilter.frequency)
    const amp = sine(0.07)
    const ampDepth = g(0)
    amp.connect(ampDepth).connect(trem.gain)
    const idxLfo = sine(0.11)
    const tones = [0, 1, 2, 3].map(() => {
      const level = g(0)
      level.connect(dDrive)
      const pair = [-1, 1].map((side) => {
        const o = sine(110)
        o.connect(level)
        return { o, side }
      })
      const mod = sine(110)
      const depth = g(0)
      mod.connect(depth)
      for (const { o } of pair) depth.connect(o.frequency)
      const breathe = g(0)
      idxLfo.connect(breathe).connect(depth.gain)
      const op3 = sine(110)
      const fb = g(0)
      op3.connect(fb).connect(mod.frequency)
      return { g: level, pair, mod, depth, breathe, op3, fb }
    })

    // Bass layer: a reese (two detuned saws that beat against each other) and a sine sub,
    // both on the chord's root.
    const reeseLevel = g(0)
    reeseLevel.connect(dDrive)
    const reese = [-1, 1].map((side) => {
      const o = sine(55)
      o.type = 'sawtooth'
      o.connect(reeseLevel)
      return { o, side }
    })
    const subLevel = g(0)
    subLevel.connect(dDrive)
    const sub = sine(55)
    sub.connect(subLevel)

    n = { master, reverb, delay, pingpong, dry, monoSend, ppSend, crusher, drive, input, noise, droneOut, env, trem, dFilter, dDrive, lfo, lfoDepth, amp, ampDepth, idxLfo, tones, reese, reeseLevel, sub, subLevel }
  }

  const now = () => raw.currentTime
  // Continuous updates run ~20 times a second; only schedule when the target really
  // changed, so the audio thread isn't flooded with identical automation events.
  const targets = new WeakMap()
  const changed = (param, value) => {
    const prev = targets.get(param)
    if (prev !== undefined && Math.abs(prev - value) <= Math.abs(value) * 1e-4 + 1e-6) return false
    targets.set(param, value)
    return true
  }
  const glideTo = (param, value, tc) => changed(param, value) && param.setTargetAtTime(value, now(), tc)
  const rampTo = (param, value, time) => changed(param, value) && param.rampTo(value, time)

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

  function voice(v, t, midi) {
    const ctx = raw
    const f = mtof(midi)
    const H = v['synth.harmonics']
    const T = v['synth.timbre']
    const M = v['synth.morph']
    const a = expMap(v['synth.attack'], 0.001, 2)
    const r = expMap(v['synth.release'], 0.02, 5)
    const end = t + a + r * 1.5 + 0.05
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
    out.gain.setTargetAtTime(0, t + a, r / 4)
    const pan = ctx.createStereoPanner()
    pan.pan.value = v['synth.pan'] * 2 - 1
    out.connect(pan)
    Tone.connect(pan, n.input)

    const cutoff = expMap(v['synth.cutoff'], 60, 16000)
    const filter = ctx.createBiquadFilter()
    filter.Q.value = expMap(v['synth.res'], 0.5, 18)
    filter.frequency.setValueAtTime(cutoff, t)
    filter.frequency.linearRampToValueAtTime(Math.min(18000, cutoff * 2 ** (v['synth.fenv'] * 6)), t + a + 0.005)
    filter.frequency.setTargetAtTime(cutoff, t + a + 0.005, r / 3)
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
        depth.gain.setTargetAtTime(f * T * 3, t, r / 2)
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
          partial(wave, f * ratio, Math.exp(-i * (1 - T) * 1.2) * 0.3, r * (1.2 - i * 0.12), mix)
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
      this.setMaster(master)
    },
    stop() {
      if (!n) return
      ready = false
      glideTo(n.droneOut.gain, 0, 0.3)
      // swell in again on the next start
      droneKey = ''
      n.env.gain.cancelScheduledValues(now())
      n.env.gain.setTargetAtTime(0, now(), 0.1)
    },
    setMaster(m) {
      master = m
      if (n) n.master.volume.rampTo(m > 0 ? Tone.gainToDb(m) - 4 : -Infinity, 0.05)
    },
    // continuous knobs (drone + fx), called ~20 times per second
    setContinuous(v, tau) {
      if (!ready) return
      const tc = Math.max(0.01, tau / 3)

      bpm = bpmOf(v['global.bpm'])
      const nextRoot = ROOTS[step(v['drone.root'], ROOTS.length)]
      const nextScale = SCALES[step(v['drone.scale'], SCALES.length)]
      const chord = droneChord(v['drone.pitch'], nextRoot, nextScale)
      let key = chord.join()
      // Hold: the chord (and the key the synth follows) may only change on a beat grid.
      const holdBeats = HOLD_BEATS[step(v['drone.hold'], HOLD_BEATS.length)][1]
      if (key !== droneKey && droneKey !== '' && holdBeats && now() - lastChange < (holdBeats * 60) / bpm) key = droneKey
      else if (key !== droneKey) {
        lastChange = now()
        root = nextRoot
        scale = nextScale
      }
      const glide = expMap(v['drone.glide'], 0.01, 6) / 3
      const attack = expMap(v['drone.attack'], 0.05, 8)
      const release = expMap(v['drone.release'], 0.05, 8)
      if (key !== droneKey) {
        // AR: every new chord fades the old one out over Release, then swells in over Attack.
        const first = droneKey === ''
        droneKey = key
        droneFreqs = key.split(',').map(Number).map(mtof)
        const t0 = now()
        const swell = first ? t0 : t0 + release
        n.env.gain.cancelScheduledValues(t0)
        n.env.gain.setValueAtTime(n.env.gain.value, t0)
        if (!first) n.env.gain.setTargetAtTime(0, t0, release / 4)
        n.env.gain.setTargetAtTime(1, swell, attack / 4)
        n.tones.forEach((t, i) => t.pair.forEach(({ o }) => o.frequency.setTargetAtTime(droneFreqs[i], first ? t0 : t0 + release * 0.5, glide)))
        for (const { o } of n.reese) o.frequency.setTargetAtTime(droneFreqs[0], first ? t0 : t0 + release * 0.5, glide)
        n.sub.frequency.setTargetAtTime(droneFreqs[0] / 2, first ? t0 : t0 + release * 0.5, glide)
      }
      const width = v['drone.width'] * 35
      for (const { o, side } of n.reese) glideTo(o.detune, side * width, tc)
      glideTo(n.reeseLevel.gain, v['drone.reese'] ** 2 * 1.2, tc)
      glideTo(n.subLevel.gain, v['drone.sub'] ** 2 * 2.5, tc)
      const driveKey = Math.round(v['drone.drive'] * 50)
      if (driveKey !== droneDrive) {
        droneDrive = driveKey
        const k = 1 + v['drone.drive'] * 30
        n.dDrive.curve = Float32Array.from({ length: 2048 }, (_, i) => Math.tanh(k * ((i / 2047) * 2 - 1)) / Math.tanh(k))
      }
      const ratio = DRONE_RATIOS[step(v['drone.ratio'], DRONE_RATIOS.length)]
      const index = v['drone.index'] ** 2 * 8
      n.tones.forEach((t, i) => {
        const f = droneFreqs[i]
        glideTo(t.mod.frequency, f * ratio, glide)
        glideTo(t.op3.frequency, f * ratio, glide)
        glideTo(t.depth.gain, f * ratio * index, tc)
        glideTo(t.breathe.gain, f * ratio * index * v['drone.motion'] * 0.8, tc)
        glideTo(t.fb.gain, f * ratio * v['drone.feedback'] * 3, tc)
      })
      const idxRate = 0.05 + v['drone.motion'] * 0.4
      if (changed(n.idxLfo.frequency, idxRate)) n.idxLfo.frequency.value = idxRate
      const spread = v['drone.spread'] * 25
      for (const t of n.tones) for (const { o, side } of t.pair) glideTo(o.detune, side * spread, tc)
      n.tones.forEach((t, i) => glideTo(t.g.gain, i === 0 ? 0.35 : Math.max(0, Math.min(1, v['drone.voicing'] * 4 - i + 1)) * 0.25, 0.2))
      // the lowpass opens with the FM index so the sidebands it creates stay audible
      const cutoff = Math.min(16000, expMap(v['drone.cutoff'], 60, 12000) * (1 + index * 0.6))
      const type = FILTER_TYPES[step(v['drone.type'], 3)].type
      if (n.dFilter.type !== type) n.dFilter.type = type
      const Q = expMap(v['drone.res'], 0.5, 20)
      glideTo(n.dFilter.Q, Q, tc)
      // bandpass and highpass remove most of the chord's energy; make it back up
      const makeup = type === 'bandpass' ? 3 + Q * 0.25 : type === 'highpass' ? 1.8 : 1
      glideTo(n.dFilter.frequency, cutoff, tc)
      glideTo(n.lfoDepth.gain, cutoff * 0.6 * v['drone.motion'], tc)
      const lfoRate = 0.03 + v['drone.motion'] * 0.5
      if (changed(n.lfo.frequency, lfoRate)) n.lfo.frequency.value = lfoRate
      glideTo(n.ampDepth.gain, v['drone.motion'] * 0.35, tc)
      glideTo(n.droneOut.gain, v['drone.level'] ** 2 * 0.5 * makeup, tc)

      if (Math.abs(n.drive.distortion - (0.2 + v['fx.drive'] * 0.8)) > 0.02) n.drive.distortion = 0.2 + v['fx.drive'] * 0.8
      rampTo(n.drive.wet, Math.min(1, v['fx.drive'] * 1.5), tc)
      const bits = 16 - v['fx.crush'] * 13
      if (changed(n.crusher.bits, bits)) n.crusher.bits.value = bits
      rampTo(n.crusher.wet, v['fx.crush'] > 0.02 ? 1 : 0, tc)
      const wet = v['fx.delay'] * 0.7
      rampTo(n.dry.gain, 1 - wet * 0.5, tc)
      rampTo(n.monoSend.gain, wet * (1 - v['fx.pingpong']), tc)
      rampTo(n.ppSend.gain, wet * v['fx.pingpong'], tc)
      const delaySeconds = step(v['fx.sync'], 2) ? (DIVISIONS[step(v['fx.time'], DIVISIONS.length)][1] * 60) / bpm : expMap(v['fx.time'], 0.05, 1.2)
      for (const d of [n.delay, n.pingpong]) {
        rampTo(d.delayTime, Math.min(4, delaySeconds), 0.1)
        rampTo(d.feedback, v['fx.feedback'] * 0.9, tc)
      }
      rampTo(n.reverb.wet, v['fx.reverb'], tc)
      if (Math.abs(v['fx.size'] - reverbSize) > 0.02) {
        reverbSize = v['fx.size']
        n.reverb.decay = expMap(reverbSize, 0.5, 10)
      }
    },
    // One attack with the event knobs already modulated. With the arp on, it plays a
    // short run over the chord (root, third, fifth) of the note, in time with the tempo.
    play(v) {
      if (!ready || active >= MAX_VOICES || Math.random() > v['synth.chance']) return
      const t = raw.currentTime + 0.02
      const note = noteAt(v['synth.note'], root, scale, ...SYNTH_RANGE)
      const mode = ARP_MODES[step(v['synth.arpMode'], ARP_MODES.length)]
      if (mode === 'Off') return voice(v, t, note)

      const all = scaleNotes(root, scale)
      const i = all.indexOf(note)
      const tones = []
      for (let o = 0; o <= step(v['synth.arpOctaves'], 3); o++) for (const d of [0, 2, 4]) if (all[i + d] != null) tones.push(all[i + d] + o * 12)
      const order = mode === 'Down' ? [...tones].reverse() : mode === 'Up-down' ? [...tones, ...tones.slice(1, -1).reverse()] : tones
      const steps = step(v['synth.arpSteps'], 8) + 1
      const stepTime = (ARP_RATES[step(v['synth.arpRate'], ARP_RATES.length)][1] * 60) / bpm
      for (let k = 0; k < steps && active < MAX_VOICES; k++) {
        const m = mode === 'Random' ? tones[Math.floor(Math.random() * tones.length)] : order[k % order.length]
        if (m != null) voice(v, t + k * stepTime, m)
      }
    },
  }
}
