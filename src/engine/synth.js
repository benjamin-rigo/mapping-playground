import * as Tone from 'tone'
import { ROOTS } from './settings.js'

const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  pentatonic: [0, 3, 5, 7, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
}
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
  return [n(0), n(0) + 12, n(2) + 12, n(4) + 12].map(mtof)
}

// Four layers whose levels and colours come from the morphed scene (see scenes.js):
// continuous Drone and Texture, plus Bells and Pulse fired by attacks. Everything
// goes through one drive -> crush -> delay -> reverb chain, so the Storm side can
// distort the whole mix.
export function createSynth() {
  let n = null
  let raw = null
  let settings = null
  let ready = false
  let active = 0
  let chordStep = 0
  let u = null

  function build() {
    raw = Tone.getContext().rawContext
    const master = new Tone.Volume(-8).toDestination()
    const limiter = new Tone.Limiter(-1).connect(master)
    const reverb = new Tone.Reverb({ decay: 6, wet: 0.4 }).connect(limiter)
    const delay = new Tone.FeedbackDelay({ delayTime: 0.33, feedback: 0.45, wet: 0.2 }).connect(reverb)
    const crusher = new Tone.BitCrusher({ bits: 16, wet: 0 }).connect(delay)
    const drive = new Tone.Distortion({ distortion: 0.6, wet: 0 }).connect(crusher)
    const input = new Tone.Gain(1).connect(drive)

    const droneFilter = new Tone.Filter({ frequency: 600, type: 'lowpass', Q: 1.5 })
    const droneGain = new Tone.Gain(0).connect(input)
    droneFilter.connect(droneGain)
    const droneLfo = new Tone.LFO({ frequency: 0.07, min: 300, max: 900 }).connect(droneFilter.frequency).start()
    const drone = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'fatsawtooth', count: 3, spread: 18 },
      envelope: { attack: 3, decay: 1, sustain: 0.8, release: 5 },
      volume: -14,
    }).connect(droneFilter)
    const loop = new Tone.Loop((time) => {
      drone.triggerAttackRelease(droneChord(chordStep++, settings.root, settings.scale), 9, time, 0.5)
    }, 10)

    const noise = new Tone.Noise('pink').start()
    const texFilter = new Tone.Filter({ frequency: 1200, type: 'bandpass', Q: 2 })
    const texGain = new Tone.Gain(0).connect(input)
    const texLfo = new Tone.LFO({ frequency: 0.2, min: 400, max: 2400 }).connect(texFilter.frequency).start()
    noise.connect(texFilter)
    texFilter.connect(texGain)

    const noiseBuf = raw.createBuffer(1, raw.sampleRate, raw.sampleRate)
    const nd = noiseBuf.getChannelData(0)
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1

    n = { master, reverb, delay, crusher, drive, input, droneFilter, droneGain, droneLfo, loop, texFilter, texGain, texLfo, noiseBuf }
  }

  const ramp = (param, value, time) => param.rampTo(value, time)

  function connectVoice(node, pan) {
    const p = raw.createStereoPanner()
    p.pan.value = pan
    node.connect(p)
    Tone.connect(p, n.input)
    return p
  }

  // A struck FM tone; brightness raises the FM index, decay sets the ring time.
  function bell(t, freq, level, bright, decay, pan) {
    const ring = 0.08 + decay * 2.5
    const out = raw.createGain()
    out.gain.setValueAtTime(0, t)
    out.gain.linearRampToValueAtTime(level, t + 0.004)
    out.gain.setTargetAtTime(0, t + 0.004, ring / 4)
    const p = connectVoice(out, pan)
    const car = raw.createOscillator()
    car.frequency.value = freq
    const mod = raw.createOscillator()
    mod.frequency.value = freq * 3.5
    const depth = raw.createGain()
    depth.gain.setValueAtTime(freq * (0.5 + bright * 8), t)
    depth.gain.setTargetAtTime(freq * 0.2, t, ring / 6)
    mod.connect(depth).connect(car.frequency)
    car.connect(out)
    active++
    car.onended = () => {
      active--
      p.disconnect()
    }
    for (const o of [car, mod]) {
      o.start(t)
      o.stop(t + ring * 1.5)
    }
  }

  // A burst of short clicks and noise grains; rate adds stutters, crush coarsens them.
  function pulse(t, level, crush, rate, pan) {
    const hits = 1 + Math.floor(rate * 6)
    const gap = 0.03 + (1 - rate) * 0.06
    const out = raw.createGain()
    const filter = raw.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = expMap(1 - crush, 300, 6000)
    filter.Q.value = 1 + crush * 6
    filter.connect(out)
    const p = connectVoice(out, pan)
    const end = t + hits * gap + 0.1
    for (let i = 0; i < hits; i++) {
      const at = t + i * gap * (0.6 + Math.random() * 0.8)
      out.gain.setValueAtTime(level * (1 - i / (hits + 1)), at)
      out.gain.setTargetAtTime(0, at + 0.002, 0.008 + (1 - crush) * 0.02)
    }
    const src = raw.createBufferSource()
    src.buffer = n.noiseBuf
    src.connect(filter)
    active++
    src.onended = () => {
      active--
      p.disconnect()
    }
    src.start(t, Math.random() * 0.5)
    src.stop(end)
  }

  return {
    get ready() {
      return ready
    },
    async start(s) {
      await Tone.start()
      if (!n) build()
      ready = true
      settings = s
      n.loop.start(0)
      Tone.getTransport().start()
    },
    stop() {
      if (!n) return
      ready = false
      Tone.getTransport().stop()
      n.loop.stop()
      n.droneGain.gain.rampTo(0, 0.5)
      n.texGain.gain.rampTo(0, 0.5)
    },
    setSettings(s) {
      settings = s
      if (ready) ramp(n.master.volume, s.master > 0 ? Tone.gainToDb(s.master) - 8 : -Infinity, 0.05)
    },
    // u: the morphed sound parameters, called a few times per second
    setU(next, tau) {
      u = next
      if (!ready) return
      const tc = Math.max(0.02, tau)
      ramp(n.droneGain.gain, next.drone ** 2 * 1.4, tc)
      const cutoff = expMap(next.droneTone, 120, 7000)
      n.droneLfo.min = cutoff * (1 - next.droneMove * 0.7)
      n.droneLfo.max = cutoff * (1 + next.droneMove * 1.5)
      n.droneLfo.frequency.value = 0.04 + next.droneMove * 0.6
      ramp(n.texGain.gain, next.tex ** 2 * 0.8, tc)
      const tcol = expMap(next.texColor, 200, 9000)
      n.texLfo.min = tcol * 0.5
      n.texLfo.max = tcol * (1.2 + next.texMove * 2)
      n.texLfo.frequency.value = 0.05 + next.texMove ** 2 * 12
      if (Math.abs(n.drive.distortion - next.drive) > 0.02) n.drive.distortion = 0.2 + next.drive * 0.8
      ramp(n.drive.wet, Math.min(1, next.drive * 1.5), tc)
      n.crusher.bits.value = 16 - next.crush * 13
      ramp(n.crusher.wet, next.crush > 0.02 ? 1 : 0, tc)
      ramp(n.delay.wet, next.delay * 0.7, tc)
      ramp(n.reverb.wet, next.reverb, tc)
    },
    // one attack: bells and pulse fire if their layer is up
    trigger(fields) {
      if (!ready || !u || active >= MAX_VOICES) return
      const t = raw.currentTime + 0.02
      const pan = fields.ip * 1.6 - 0.8
      if (u.bell > 0.03) {
        const freq = mtof(noteFor(fields.port, 0.6, settings.root, settings.scale) + 12)
        bell(t, freq, u.bell ** 2 * (0.25 + fields.ipVol * 0.3), u.bellBright, u.bellDecay, pan)
      }
      if (u.pulse > 0.03) pulse(t, u.pulse ** 2 * 0.6, u.pulseCrush, u.pulseRate, -pan)
    },
  }
}
