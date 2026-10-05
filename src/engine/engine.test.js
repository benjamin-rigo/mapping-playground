import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createSources, normalize } from './fields.js'
import { parseDataset } from './isc.js'
import { createSampler, pickWeighted } from './sampler.js'
import { modOffsets, setPatch } from './params.js'
import { SOUND_ENGINES, SOUND_U, VISUAL_ENGINES, VISUAL_U, lerpU } from './scenes.js'
import { DEFAULTS, PRESETS, decodeSettings, encodeSettings, randomScene, sanitize } from './settings.js'
import { noteFor } from './synth.js'

const snapshot = JSON.parse(readFileSync(new URL('../../public/snapshot.json', import.meta.url)))

const seeded = (seed = 1) => () => {
  seed = (seed * 16807) % 2147483647
  return (seed - 1) / 2147483646
}

describe('normalize', () => {
  it('maps event fields into 0..1', () => {
    const ctx = { minPortW: 10, maxPortW: 1000, minIpW: 10, maxIpW: 1000 }
    const f = normalize({ ip: '204.1.2.3', ipWeight: 1000, port: 22, portWeight: 10 }, ctx)
    expect(normalize({ ip: '1.1.1.1', ipWeight: 100, port: 22, portWeight: 100 }, ctx).portPop).toBeCloseTo(0.5)
    expect(f.port).toBeCloseTo(Math.log(22) / Math.log(65535))
    expect(f.portPop).toBe(0)
    expect(f.ipVol).toBe(1)
    expect(f.ip).toBeCloseTo(204 / 255)
  })
})

describe('sources', () => {
  it('smooths toward the latest values and clamps density', () => {
    const s = createSources()
    s.onEvent({ port: 1 })
    s.tick(0.1, { density: 90, threat: 0.5, tau: 0.8 })
    expect(s.latest.density).toBe(1)
    expect(s.smooth.port).toBeGreaterThan(0)
    expect(s.smooth.port).toBeLessThan(0.2)
    for (let i = 0; i < 100; i++) s.tick(0.1, { density: 0, threat: 0.5, tau: 0.8 })
    expect(s.smooth.port).toBeCloseTo(1)
    expect(s.smooth.threat).toBeCloseTo(0.5)
  })
})

describe('modOffsets', () => {
  it('treats data as bipolar around 0.5 and hit as unipolar', () => {
    const patches = [
      { source: 'port', target: 'tension', amount: 0.4 },
      { source: 'hit', target: 'tension', amount: 0.5 },
      { source: 'ip', target: 'visual.color', amount: -0.2 },
    ]
    expect(modOffsets(patches, { port: 0.5, hit: 0, ip: 1 })).toMatchObject({ tension: 0, 'visual.color': -0.2 })
    expect(modOffsets(patches, { port: 1, hit: 1, ip: 0 }).tension).toBeCloseTo(0.9)
    expect(modOffsets(patches, { port: 0, hit: 0, ip: 0.5 }).tension).toBeCloseTo(-0.4)
  })
})

describe('scenes', () => {
  it('every engine yields a full, finite parameter set at the macro extremes', () => {
    for (const [engines, base] of [[SOUND_ENGINES, SOUND_U], [VISUAL_ENGINES, VISUAL_U]]) {
      for (const e of Object.values(engines)) {
        for (const m of [0, 1]) {
          const u = e.map({ color: m, texture: m, motion: m })
          expect(Object.keys(u).sort()).toEqual(Object.keys(base).sort())
          expect(Object.values(u).every(Number.isFinite)).toBe(true)
        }
      }
    }
  })

  it('morphs linearly between two scenes', () => {
    const a = VISUAL_ENGINES.fluid.map({ color: 0, texture: 0, motion: 0 })
    const b = VISUAL_ENGINES.mosh.map({ color: 1, texture: 1, motion: 1 })
    const mid = lerpU(a, b, 0.5)
    expect(mid.mosh).toBeCloseTo((a.mosh + b.mosh) / 2)
    expect(lerpU(a, b, 0)).toEqual(a)
  })
})

describe('settings', () => {
  it('round-trips through the hash', () => {
    const s = structuredClone(DEFAULTS)
    s.scenes.storm = randomScene(() => 0.3)
    s.patches.push({ source: 'threat', target: 'sound.motion', amount: -0.25 })
    s.tension = 0.4
    expect(decodeSettings(encodeSettings(s))).toEqual(s)
  })

  it('rejects garbage, old versions and bad values', () => {
    expect(decodeSettings('!!!not-base64')).toBeNull()
    expect(sanitize({ version: 3, root: 'C' }).root).toBe(DEFAULTS.root)
    const s = sanitize({
      version: 4,
      scenes: { calm: { sound: { engine: 'nope', color: 3 }, visual: { engine: 'grid' } } },
      patches: [
        { source: 'nope', target: 'tension', amount: 0.5 },
        { source: 'port', target: 'voice.note', amount: 0.5 },
        { source: 'port', target: 'tension', amount: 0.5 },
        { source: 'port', target: 'tension', amount: 0.9 },
      ],
    })
    expect(s.scenes.calm.sound).toEqual(DEFAULTS.scenes.calm.sound)
    expect(s.scenes.calm.visual.engine).toBe('grid')
    expect(s.patches).toEqual([{ source: 'port', target: 'tension', amount: 0.5 }])
  })

  it('ships presets that survive sanitize unchanged', () => {
    for (const p of PRESETS) expect(sanitize(p.settings)).toEqual(p.settings)
  })
})

describe('setPatch', () => {
  it('sets, replaces and removes one matrix cell', () => {
    let p = setPatch([], 'port', 'tension', 0.5)
    p = setPatch(p, 'port', 'tension', -0.2)
    expect(p).toEqual([{ source: 'port', target: 'tension', amount: -0.2 }])
    expect(setPatch(p, 'port', 'tension', 0)).toEqual([])
  })
})

describe('noteFor', () => {
  it('stays in the scale and spans the range', () => {
    const lo = noteFor(0, 0, 'A', 'minor')
    const hi = noteFor(1, 0, 'A', 'minor')
    expect(hi - lo).toBe(12)
    expect(noteFor(1, 1, 'A', 'minor') - noteFor(0, 1, 'A', 'minor')).toBe(48)
    expect((noteFor(0.5, 0.5, 'C', 'pentatonic') % 12 + 12) % 12).toSatisfy((pc) => [0, 3, 5, 7, 10].includes(pc))
  })
})

describe('isc', () => {
  it('parses the bundled snapshot', () => {
    const d = parseDataset(snapshot)
    expect(d.ports.length).toBeGreaterThan(10)
    expect(d.ips.length).toBeGreaterThan(10)
    expect(d.maxPortW).toBe(Math.max(...d.ports.map((p) => p.w)))
    expect(typeof d.ports[0].port).toBe('number')
  })

  it('throws on empty data', () => {
    expect(() => parseDataset({ ports: {}, ips: [], infocon: {} })).toThrow()
  })
})

describe('sampler', () => {
  it('picks by weight', () => {
    const list = [{ w: 1 }, { w: 3 }]
    const rand = seeded(7)
    let heavy = 0
    for (let i = 0; i < 4000; i++) if (pickWeighted(list, rand) === list[1]) heavy++
    expect(heavy / 4000).toBeGreaterThan(0.7)
    expect(heavy / 4000).toBeLessThan(0.8)
  })

  it('emits events and bursts from one ip, and stops cleanly', () => {
    const queue = []
    const events = []
    const s = createSampler({
      emit: (e) => events.push(e),
      rand: seeded(3),
      schedule: (fn) => queue.push(fn),
      cancel: () => {},
    })
    s.setData(parseDataset(snapshot))
    s.start()
    for (let i = 0; i < 2000 && queue.length; i++) queue.shift()()
    expect(events.length).toBeGreaterThan(100)
    const bursts = events.filter((e) => e.burst)
    expect(bursts.length).toBeGreaterThan(0)
    s.stop()
    const n = events.length
    while (queue.length) queue.shift()()
    expect(events.length).toBe(n)
  })
})
