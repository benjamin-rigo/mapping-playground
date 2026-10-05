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
const MAX_VOICES = 24

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

// Each event builds one short-lived Web Audio voice: Osc 1 (wavetable-like harmonic
// morph + FM), Osc 2 (detuned stack), cross-modulation both ways, sub and noise,
// each with its own envelope and pan. Voices feed a shared Tone.js chain: morphing
// filter with envelope -> drive -> crush -> chorus -> delay -> reverb. A chord drone
// runs underneath.
export function createSynth() {
  let n = null
  let raw = null
  let settings = null
  let ready = false
  let active = 0
  let reverbSize = -1
  let chordStep = 0
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
    const chorus = new Tone.Chorus({ frequency: 0.8, delayTime: 3.5, depth: 0.6, wet: 0 }).connect(delay).start()
    const crusher = new Tone.BitCrusher({ bits: 16, wet: 0 }).connect(chorus)
    const drive = new Tone.Distortion({ distortion: 0.2, wet: 0 }).connect(crusher)
    const filter = new Tone.Filter({ frequency: 2000, type: 'lowpass', rolloff: -24 }).connect(drive)
    const filterEnv = new Tone.FrequencyEnvelope({ baseFrequency: 2000, octaves: 2, attack: 0.01, decay: 0.3, sustain: 0, release: 0.3 })
    filterEnv.connect(filter.frequency)
    const input = new Tone.Gain(1).connect(filter)

    const noise = raw.createBuffer(1, raw.sampleRate * 2, raw.sampleRate)
    const nd = noise.getChannelData(0)
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1

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

    n = { master, reverb, delay, chorus, crusher, drive, filter, filterEnv, input, noise, droneFilter, droneGain, droneLfo, loop }
  }

  const ramp = (param, value, time = 0.03) => param.rampTo(value, time)

  // Shared chain: applied on every event and immediately when a knob moves.
  function applyShared(v) {
    n.filter.type = v['filter.morph'] < 0.34 ? 'lowpass' : v['filter.morph'] < 0.67 ? 'bandpass' : 'highpass'
    n.filter.Q.value = expMap(v['filter.res'], 0.5, 18)
    n.filterEnv.baseFrequency = expMap(v['filter.cutoff'], 60, 14000)
    n.filterEnv.octaves = v['filter.env'] * 6
    n.filterEnv.attack = expMap(v['mod.attack'], 0.001, 2)
    n.filterEnv.decay = expMap(v['mod.decay'], 0.02, 3)
    if (Math.abs(n.drive.distortion - v['fx.drive']) > 0.01) n.drive.distortion = v['fx.drive']
    ramp(n.drive.wet, Math.sqrt(v['fx.drive']))
    n.crusher.bits.value = 16 - v['fx.crush'] * 13
    ramp(n.crusher.wet, v['fx.crush'] > 0.01 ? 1 : 0)
    ramp(n.chorus.wet, v['fx.chorus'])
    ramp(n.delay.wet, v['fx.delay'] * 0.7)
    n.delay.delayTime.rampTo(expMap(v['fx.time'], 0.05, 1.2), 0.1)
    ramp(n.delay.feedback, v['fx.feedback'] * 0.9)
    ramp(n.reverb.wet, v['fx.reverb'])
  }

  function voice(v, t) {
    const ctx = raw
    const midi = noteFor(v['voice.note'], v['voice.range'], settings.root, settings.scale)
    const f1 = mtof(midi)
    const f2 = mtof(midi + Math.round(v['osc2.octave'] * 2 - 1) * 12)
    const a = expMap(v['amp.attack'], 0.001, 2)
    const d = expMap(v['amp.decay'], 0.02, 3)
    const r = expMap(v['amp.release'], 0.02, 5)
    const ma = expMap(v['mod.attack'], 0.001, 2)
    const md = expMap(v['mod.decay'], 0.02, 3)
    const gateEnd = t + a + d
    const end = gateEnd + r * 1.5 + 0.05
    const level = v['voice.level'] ** 2

    const out = ctx.createGain()
    out.gain.setValueAtTime(0, t)
    out.gain.linearRampToValueAtTime(level, t + a)
    out.gain.setTargetAtTime(level * v['amp.sustain'], t + a, d / 3)
    out.gain.setTargetAtTime(0, gateEnd, r / 4)
    const pan = ctx.createStereoPanner()
    pan.pan.value = v['voice.pan'] * 2 - 1
    out.connect(pan)
    Tone.connect(pan, n.input)

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

    const o1 = osc(null, f1)
    o1.setPeriodicWave(wave(v['osc1.shape'], v['osc1.bright']))
    o1.connect(gain(v['osc1.level'] * 0.5)).connect(out)

    // FM warp, shaped by the mod envelope
    if (v['osc1.warp'] > 0.005) {
      const m = osc('sine', f1 * expMap(v['osc1.ratio'], 0.5, 8))
      const peak = f1 * v['osc1.warp'] * 8
      const depth = gain(0)
      depth.gain.setValueAtTime(0, t)
      depth.gain.linearRampToValueAtTime(peak, t + ma)
      depth.gain.setTargetAtTime(peak * (1 - v['mod.amount']), t + ma, md / 3)
      m.connect(depth).connect(o1.frequency)
    }

    const useOsc2 = v['osc2.level'] > 0.005 || v['osc1.xmod'] > 0.005
    if (useOsc2) {
      const type = ['sine', 'triangle', 'sawtooth', 'square'][Math.min(3, Math.floor(v['osc2.shape'] * 4))]
      const cents = v['osc2.spread'] * 50
      const sum = gain(1 / 3)
      const stack = [-cents, 0, cents].map((det) => {
        const o = osc(type, f2)
        o.detune.value = det
        o.connect(sum)
        return o
      })
      sum.connect(gain(v['osc2.level'] * 0.5)).connect(out)
      // Osc 2 -> Osc 1 frequency
      if (v['osc1.xmod'] > 0.005) sum.connect(gain(f1 * v['osc1.xmod'] * 6)).connect(o1.frequency)
      // Osc 1 -> Osc 2 frequency; the delay breaks the cycle Web Audio would otherwise mute
      if (v['osc2.xmod'] > 0.005) {
        const dl = ctx.createDelay(0.01)
        dl.delayTime.value = 128 / ctx.sampleRate
        const x = gain(f2 * v['osc2.xmod'] * 6)
        o1.connect(dl).connect(x)
        for (const o of stack) x.connect(o.frequency)
      }
    }

    if (v['sub.sub'] > 0.005) osc('sine', f1 / 2).connect(gain(v['sub.sub'] * 0.6)).connect(out)

    if (v['sub.noise'] > 0.005) {
      const src = ctx.createBufferSource()
      src.buffer = n.noise
      src.loop = true
      sources.push(src)
      const tone = ctx.createBiquadFilter()
      tone.frequency.value = expMap(v['sub.color'], 300, 18000)
      src.connect(tone).connect(gain(v['sub.noise'] * 0.5)).connect(out)
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
      ready = true
      this.setSettings(s, s.knobs)
      n.loop.start(0)
      Tone.getTransport().start()
    },
    stop() {
      if (!n) return
      ready = false
      Tone.getTransport().stop()
      n.loop.stop()
      n.droneGain.gain.rampTo(0, 0.5)
    },
    // values: knobs with event patches applied to the latest data
    setSettings(s, values) {
      settings = s
      if (!ready) return
      ramp(n.master.volume, s.master > 0 ? Tone.gainToDb(s.master) - 8 : -Infinity)
      const size = s.knobs['fx.size']
      if (Math.abs(size - reverbSize) > 0.02) {
        reverbSize = size
        n.reverb.decay = expMap(size, 0.5, 10)
      }
      applyShared(values)
    },
    setContinuous(v, tau) {
      if (!ready) return
      const cutoff = expMap(v['drone.tone'], 80, 6000)
      n.droneGain.gain.rampTo(v['drone.level'] ** 2 * 1.2, tau)
      n.droneLfo.min = cutoff * (1 - v['drone.motion'] * 0.7)
      n.droneLfo.max = cutoff * (1 + v['drone.motion'] * 1.5)
      n.droneLfo.frequency.value = 0.04 + v['drone.motion'] * 0.4
    },
    play(v) {
      if (!ready || active >= MAX_VOICES || Math.random() > v['voice.chance']) return
      const t = raw.currentTime + 0.02
      applyShared(v)
      n.filterEnv.triggerAttackRelease(expMap(v['amp.attack'], 0.001, 2) + expMap(v['amp.decay'], 0.02, 3), Tone.now() + 0.02)
      voice(v, t)
    },
  }
}
