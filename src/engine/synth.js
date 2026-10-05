import { ROOTS } from './settings.js'

const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  pentatonic: [0, 3, 5, 7, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
}
const WAVES = ['sine', 'triangle', 'sawtooth', 'square']
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

function droneChord(step, root, scale) {
  const degrees = scale === 'major' ? SCALES.major : scale === 'dorian' ? SCALES.dorian : SCALES.minor
  const progression = scale === 'major' ? [0, 4, 5, 3] : [0, 5, 2, 6]
  const d = progression[step % 4]
  const base = 36 + ROOTS.indexOf(root)
  const n = (k) => base + degrees[(d + k) % 7] + 12 * Math.floor((d + k) / 7)
  return [n(0), n(0) + 12, n(2) + 12, n(4) + 12]
}

function shaperCurve(drive, crush) {
  const size = 2048
  const curve = new Float32Array(size)
  const k = 1 + drive * 40
  const norm = Math.tanh(k)
  const steps = crush > 0.01 ? 2 ** (1 + (1 - crush) * 10) : 0
  for (let i = 0; i < size; i++) {
    let y = Math.tanh(k * ((i / (size - 1)) * 2 - 1)) / norm
    if (steps) y = Math.round(y * steps) / steps
    curve[i] = y
  }
  return curve
}

function impulse(ctx, seconds) {
  const len = Math.floor(ctx.sampleRate * seconds)
  const buf = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch)
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.5
  }
  return buf
}

// A small modular-style synth on raw Web Audio: one configurable voice per event
// (wave morph + FM + detune + noise -> filter with envelope -> amp envelope -> pan),
// a shared drive/crush -> delay/reverb chain, and a continuous chord drone.
export function createSynth() {
  let ctx = null
  let n = null
  let settings = null
  let active = 0
  let ready = false
  let shapeKey = ''
  let reverbSize = -1
  let reverbTimer = null
  let chordStep = 0
  let chordTimer = null

  const target = (param, value, tc = 0.05) => param.setTargetAtTime(value, ctx.currentTime, tc)

  function build() {
    ctx = new AudioContext()
    const master = ctx.createGain()
    const comp = ctx.createDynamicsCompressor()
    master.connect(comp).connect(ctx.destination)

    const bus = ctx.createGain()
    const shaper = ctx.createWaveShaper()
    shaper.oversample = '2x'
    bus.connect(shaper)
    shaper.connect(master)

    const delaySend = ctx.createGain()
    const delay = ctx.createDelay(2)
    const delayTone = ctx.createBiquadFilter()
    delayTone.frequency.value = 3500
    const feedback = ctx.createGain()
    shaper.connect(delaySend).connect(delay).connect(delayTone).connect(feedback).connect(delay)
    delayTone.connect(master)

    const reverbSend = ctx.createGain()
    const convolver = ctx.createConvolver()
    shaper.connect(reverbSend).connect(convolver).connect(master)
    delayTone.connect(reverbSend)

    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const nd = noise.getChannelData(0)
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1

    const droneOut = ctx.createGain()
    droneOut.gain.value = 0
    const droneFilter = ctx.createBiquadFilter()
    droneFilter.Q.value = 0.7
    droneFilter.connect(droneOut)
    droneOut.connect(master)
    const droneVerb = ctx.createGain()
    droneVerb.gain.value = 0.6
    droneOut.connect(droneVerb).connect(convolver)

    const detuneLfo = ctx.createOscillator()
    detuneLfo.frequency.value = 0.13
    const detuneDepth = ctx.createGain()
    detuneLfo.connect(detuneDepth)
    const filterLfo = ctx.createOscillator()
    filterLfo.frequency.value = 0.07
    const filterDepth = ctx.createGain()
    filterLfo.connect(filterDepth).connect(droneFilter.frequency)
    detuneLfo.start()
    filterLfo.start()

    const droneOscs = [0, 1, 2, 3].map((i) => {
      const o = ctx.createOscillator()
      o.type = i % 2 ? 'triangle' : 'sawtooth'
      o.detune.value = i % 2 ? 7 : -7
      const g = ctx.createGain()
      g.gain.value = i === 0 ? 0.35 : 0.2
      detuneDepth.connect(o.detune)
      o.connect(g).connect(droneFilter)
      o.start()
      return o
    })

    n = { master, bus, shaper, delaySend, delay, feedback, reverbSend, convolver, noise, droneOut, droneFilter, detuneDepth, filterDepth, droneOscs }
  }

  function nextChord() {
    const notes = droneChord(chordStep++, settings.root, settings.scale)
    n.droneOscs.forEach((o, i) => o.frequency.setTargetAtTime(mtof(notes[i]), ctx.currentTime, chordStep === 1 ? 0.01 : 1.5))
  }

  function applyShared(k) {
    const key = `${k['drive.drive'].toFixed(2)}:${k['drive.crush'].toFixed(2)}`
    if (key !== shapeKey) {
      shapeKey = key
      n.shaper.curve = shaperCurve(k['drive.drive'], k['drive.crush'])
    }
    target(n.delay.delayTime, expMap(k['delay.time'], 0.05, 1.2), 0.08)
    target(n.feedback.gain, k['delay.feedback'] * 0.9)
    target(n.delaySend.gain, k['delay.mix'])
    target(n.reverbSend.gain, k['reverb.mix'] * 1.2)
  }

  function setReverbSize(size) {
    if (Math.abs(size - reverbSize) < 0.02) return
    reverbSize = size
    clearTimeout(reverbTimer)
    reverbTimer = setTimeout(() => (n.convolver.buffer = impulse(ctx, expMap(size, 0.4, 8))), 200)
  }

  return {
    get ready() {
      return ready
    },
    async start(s) {
      if (!ctx) build()
      await ctx.resume()
      ready = true
      this.setSettings(s)
      chordStep = 0
      nextChord()
      chordTimer = setInterval(nextChord, 10000)
    },
    stop() {
      if (!ctx) return
      ready = false
      clearInterval(chordTimer)
      ctx.suspend()
    },
    setSettings(s) {
      settings = s
      if (!ready) return
      target(n.master.gain, s.master ** 2, 0.05)
      applyShared(s.knobs)
      setReverbSize(s.knobs['reverb.size'])
    },
    setContinuous(v) {
      if (!ready) return
      const level = v['drone.level']
      const cutoff = expMap(v['drone.tone'], 80, 8000)
      target(n.droneOut.gain, level * level * 0.3, 0.2)
      target(n.droneFilter.frequency, cutoff, 0.2)
      target(n.filterDepth.gain, cutoff * 0.6 * v['drone.motion'], 0.2)
      target(n.detuneDepth.gain, v['drone.motion'] * 25, 0.2)
    },
    play(v) {
      if (!ready || active >= MAX_VOICES || Math.random() > v['voice.chance']) return
      applyShared(v)

      const t = ctx.currentTime + 0.01
      const freq = mtof(noteFor(v['voice.note'], v['voice.range'], settings.root, settings.scale))
      const a = expMap(v['env.attack'], 0.001, 2)
      const d = expMap(v['env.decay'], 0.02, 3)
      const r = expMap(v['env.release'], 0.02, 5)
      const level = v['voice.level'] ** 2 * 0.5
      const gateEnd = t + a + d
      const end = gateEnd + r * 1.5 + 0.05

      const out = ctx.createGain()
      out.gain.setValueAtTime(0, t)
      out.gain.linearRampToValueAtTime(level, t + a)
      out.gain.setTargetAtTime(level * v['env.sustain'], t + a, d / 3)
      out.gain.setTargetAtTime(0, gateEnd, r / 4)
      const pan = ctx.createStereoPanner()
      pan.pan.value = v['voice.pan'] * 2 - 1
      out.connect(pan).connect(n.bus)

      const cutoff = expMap(v['filter.cutoff'], 60, 16000)
      const filter = ctx.createBiquadFilter()
      filter.Q.value = expMap(v['filter.reso'], 0.5, 20)
      filter.frequency.setValueAtTime(cutoff, t)
      filter.frequency.linearRampToValueAtTime(Math.min(18000, cutoff * 2 ** (v['filter.env'] * 5)), t + a)
      filter.frequency.setTargetAtTime(cutoff, t + a, d / 3)
      filter.connect(out)

      const sources = []
      const w = Math.min(v['osc.wave'] * 3, 2.999)
      const i0 = Math.floor(w)
      const morph = w - i0
      const cents = v['osc.detune'] * 40
      const layers = cents > 0.5 ? [-cents, cents] : [0]
      const carriers = []
      for (const det of layers) {
        for (const [type, gain] of [[WAVES[i0], 1 - morph], [WAVES[i0 + 1], morph]]) {
          if (gain < 0.01) continue
          const o = ctx.createOscillator()
          o.type = type
          o.frequency.value = freq
          o.detune.value = det
          const g = ctx.createGain()
          g.gain.value = (gain * 0.6) / layers.length
          o.connect(g).connect(filter)
          carriers.push(o)
        }
      }
      sources.push(...carriers)

      const fm = v['osc.fm']
      if (fm > 0.005) {
        const mod = ctx.createOscillator()
        mod.frequency.value = freq * expMap(v['osc.ratio'], 0.5, 8)
        const depth = ctx.createGain()
        depth.gain.value = freq * fm * fm * 10
        mod.connect(depth)
        for (const o of carriers) depth.connect(o.frequency)
        sources.push(mod)
      }

      if (v['osc.noise'] > 0.005) {
        const src = ctx.createBufferSource()
        src.buffer = n.noise
        src.loop = true
        const g = ctx.createGain()
        g.gain.value = v['osc.noise'] * 0.6
        src.connect(g).connect(filter)
        sources.push(src)
      }

      active++
      sources[0].onended = () => {
        active--
        pan.disconnect()
      }
      for (const s of sources) {
        s.start(t)
        s.stop(end)
      }
    },
  }
}
