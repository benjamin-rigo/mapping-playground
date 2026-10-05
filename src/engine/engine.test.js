import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createSources, normalize } from './fields.js'
import { parseDataset } from './isc.js'
import { createSampler, pickWeighted } from './sampler.js'
import { DEFAULT_KNOBS, applyPatches, setPatch } from './params.js'
import { DEFAULTS, PRESETS, decodeSettings, encodeSettings, sanitize } from './settings.js'
import { noteFor, shapePartials } from './synth.js'

const snapshot = JSON.parse(readFileSync(new URL('../../public/snapshot.json', import.meta.url)))

const seeded = (seed = 1) => () => {
  seed = (seed * 16807) % 2147483647
  return (seed - 1) / 2147483646
}

describe('normalize', () => {
  it('maps event fields into 0..1', () => {
    const f = normalize({ ip: '204.1.2.3', ipWeight: 1000, port: 22, portWeight: 1 }, { maxPortW: 1000, maxIpW: 1000 })
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

describe('applyPatches', () => {
  const knobs = { ...DEFAULT_KNOBS, 'voice.note': 0.5, 'field.flow': 0.9 }

  it('is bipolar around the knob and clamps', () => {
    const patch = [{ source: 'port', target: 'voice.note', amount: 0.4 }]
    expect(applyPatches(knobs, patch, { port: 0.5 })['voice.note']).toBeCloseTo(0.5)
    expect(applyPatches(knobs, patch, { port: 1 })['voice.note']).toBeCloseTo(0.9)
    expect(applyPatches(knobs, patch, { port: 0 })['voice.note']).toBeCloseTo(0.1)
    const w = applyPatches(knobs, [{ source: 'port', target: 'field.flow', amount: 1 }], { port: 1 })
    expect(w['field.flow']).toBe(1)
  })

  it('sums several patches on one knob and inverts with negative amount', () => {
    const patches = [
      { source: 'port', target: 'voice.note', amount: 0.2 },
      { source: 'ip', target: 'voice.note', amount: -0.1 },
    ]
    expect(applyPatches(knobs, patches, { port: 1, ip: 1 })['voice.note']).toBeCloseTo(0.6)
  })

  it('only applies patches of the requested kind', () => {
    const patches = [
      { source: 'port', target: 'voice.note', amount: 0.5 },
      { source: 'port', target: 'field.flow', amount: -0.5 },
    ]
    const v = applyPatches(knobs, patches, { port: 1 }, 'continuous')
    expect(v['voice.note']).toBe(0.5)
    expect(v['field.flow']).toBeCloseTo(0.4)
  })
})

describe('setPatch', () => {
  it('sets, replaces and removes one matrix cell', () => {
    let p = setPatch([], 'port', 'voice.note', 0.5)
    p = setPatch(p, 'port', 'voice.note', -0.2)
    expect(p).toEqual([{ source: 'port', target: 'voice.note', amount: -0.2 }])
    expect(setPatch(p, 'port', 'voice.note', 0)).toEqual([])
  })
})

describe('shapePartials', () => {
  it('starts as a pure sine and morphs toward richer spectra', () => {
    const sine = shapePartials(0, 1)
    expect(sine[0]).toBe(1)
    expect(sine.slice(1).every((x) => x === 0)).toBe(true)
    expect(shapePartials(0.25, 1).filter((x) => x > 0).length).toBe(24)
    expect(shapePartials(1, 1)[1]).toBe(0)
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

describe('settings', () => {
  it('round-trips through the hash', () => {
    const s = structuredClone(DEFAULTS)
    s.knobs['osc1.warp'] = 0.77
    s.patches.push({ source: 'threat', target: 'osc2.spread', amount: -0.25 })
    s.scale = 'dorian'
    expect(decodeSettings(encodeSettings(s))).toEqual(s)
  })

  it('rejects garbage, old versions and bad patches', () => {
    expect(decodeSettings('!!!not-base64')).toBeNull()
    expect(sanitize({ version: 2, root: 'C' }).root).toBe(DEFAULTS.root)
    const s = sanitize({
      version: 3,
      knobs: { 'osc1.warp': 5 },
      patches: [
        { source: 'nope', target: 'voice.note', amount: 0.5 },
        { source: 'port', target: 'fx.size', amount: 0.5 },
        { source: 'port', target: 'voice.note', amount: 0.5 },
        { source: 'port', target: 'voice.note', amount: 0.9 },
      ],
    })
    expect(s.knobs['osc1.warp']).toBe(DEFAULTS.knobs['osc1.warp'])
    expect(s.patches).toEqual([{ source: 'port', target: 'voice.note', amount: 0.5 }])
  })

  it('ships presets that survive sanitize unchanged', () => {
    for (const p of PRESETS) expect(sanitize(p.settings)).toEqual(p.settings)
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
