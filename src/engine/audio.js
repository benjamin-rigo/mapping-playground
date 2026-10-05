import * as Tone from 'tone'
import { ROOTS } from './settings.js'

const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  pentatonic: [0, 3, 5, 7, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
}
const PROGRESSIONS = { minor: [0, 5, 2, 6], major: [0, 4, 5, 3] }

export function scaleNotes(root, scale, octaves = 3, base = 48) {
  const r = ROOTS.indexOf(root)
  const out = []
  for (let o = 0; o < octaves; o++) for (const i of SCALES[scale]) out.push(base + r + o * 12 + i)
  return out
}

export function noteFromValue(v, root, scale) {
  const notes = scaleNotes(root, scale)
  return notes[Math.round(v * (notes.length - 1))]
}

function chordFor(step, root, scale) {
  const harmonic = scale === 'major' ? 'major' : 'minor'
  const degrees = SCALES[harmonic]
  const d = PROGRESSIONS[harmonic][step % 4]
  const r = 48 + ROOTS.indexOf(root)
  const note = (k) => r + degrees[(d + k) % 7] + 12 * Math.floor((d + k) / 7)
  return [note(0) - 12, note(0), note(2), note(4)]
}

const midi = (n) => Tone.Frequency(n, 'midi').toFrequency()

export function createAudio() {
  let nodes = null
  let tuning = null
  let lastMono = 0
  let chordStep = 0
  let ready = false

  function build() {
    const master = new Tone.Volume(-6).toDestination()
    const reverb = new Tone.Reverb({ decay: 6, wet: 0.4 }).connect(master)
    const delay = new Tone.FeedbackDelay({ delayTime: '8n.', feedback: 0.35, wet: 0.1 }).connect(reverb)
    const filter = new Tone.Filter(4000, 'lowpass').connect(delay)
    const dist = new Tone.Distortion({ distortion: 0.2, wet: 0 }).connect(filter)
    const panner = new Tone.Panner(0).connect(dist)

    const padFilter = new Tone.Filter(900, 'lowpass').connect(reverb)
    const pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 2.5, decay: 1, sustain: 0.7, release: 4 },
      volume: -20,
    }).connect(padFilter)

    const voices = {
      pluck: new Tone.PolySynth(Tone.Synth, {
        maxPolyphony: 16,
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.002, decay: 0.25, sustain: 0, release: 0.3 },
        volume: -6,
      }),
      bell: new Tone.PolySynth(Tone.FMSynth, {
        maxPolyphony: 12,
        harmonicity: 3.01,
        modulationIndex: 10,
        envelope: { attack: 0.001, decay: 1.2, sustain: 0, release: 1.2 },
        modulationEnvelope: { attack: 0.002, decay: 0.3, sustain: 0, release: 0.2 },
        volume: -12,
      }),
      noise: new Tone.NoiseSynth({
        noise: { type: 'pink' },
        envelope: { attack: 0.001, decay: 0.12, sustain: 0 },
        volume: -10,
      }),
      kick: new Tone.MembraneSynth({
        pitchDecay: 0.03,
        octaves: 5,
        envelope: { attack: 0.001, decay: 0.4, sustain: 0 },
        volume: -4,
      }),
    }
    for (const v of Object.values(voices)) v.connect(panner)

    const loop = new Tone.Loop((time) => {
      if (!tuning.chords) return
      const notes = chordFor(chordStep++, tuning.root, tuning.scale).map(midi)
      pad.triggerAttackRelease(notes, 7, time, 0.6)
    }, 8)

    nodes = { master, reverb, delay, filter, dist, panner, padFilter, pad, voices, loop }
  }

  function setTuning(t) {
    tuning = t
    if (!nodes) return
    nodes.master.volume.rampTo(t.master > 0 ? Tone.gainToDb(t.master) - 6 : -Infinity, 0.1)
    if (!t.chords) nodes.pad.releaseAll()
  }

  return {
    get ready() {
      return ready
    },
    async start(t) {
      await Tone.start()
      if (!nodes) build()
      setTuning(t)
      nodes.loop.start(0)
      Tone.getTransport().start()
      ready = true
    },
    stop() {
      if (!nodes) return
      ready = false
      Tone.getTransport().stop()
      nodes.loop.stop()
      nodes.pad.releaseAll()
    },
    setTuning,
    play(event, v) {
      if (!ready || Math.random() > v.probability) return
      const { panner, filter, delay, reverb, dist, voices } = nodes
      panner.pan.rampTo(v.pan * 2 - 1, 0.05)
      filter.frequency.rampTo(200 * 2 ** (v.filter * 6.5), 0.05)
      delay.wet.rampTo(v.delay * 0.7, 0.05)
      reverb.wet.rampTo(v.reverb, 0.05)
      dist.wet.rampTo(v.distortion, 0.05)
      dist.distortion = 0.2 + v.distortion * 0.8

      const note = noteFromValue(v.pitch, tuning.root, tuning.scale)
      const vel = 0.1 + v.volume * 0.9
      const now = Tone.now() + 0.02
      const voice = voices[tuning.voice]
      if (tuning.voice === 'pluck' || tuning.voice === 'bell') {
        voice.triggerAttackRelease(midi(note), '16n', now, vel)
        return
      }
      // Mono synths need strictly increasing start times.
      const t = Math.max(now, lastMono + 0.015)
      lastMono = t
      if (tuning.voice === 'noise') voice.triggerAttackRelease(0.1, t, vel)
      else voice.triggerAttackRelease(midi(note - 24), '8n', t, vel)
    },
  }
}
