import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { normalize, resolve } from './fields.js'
import { parseDataset } from './isc.js'
import { createSampler, pickWeighted } from './sampler.js'
import { DEFAULTS, decodeSettings, encodeSettings, sanitize } from './settings.js'

const snapshot = JSON.parse(readFileSync(new URL('../../public/snapshot.json', import.meta.url)))

const seeded = (seed = 1) => () => {
  seed = (seed * 16807) % 2147483647
  return (seed - 1) / 2147483646
}

describe('normalize', () => {
  const ctx = { maxPortW: 1000, maxIpW: 1000, density: 15, threat: 0.33 }
  const ev = { ip: '204.1.2.3', ipWeight: 1000, port: 22, portWeight: 1 }

  it('maps fields into 0..1', () => {
    const f = normalize(ev, ctx, () => 0.5)
    expect(f.port).toBeCloseTo(Math.log(22) / Math.log(65535))
    expect(f.portPop).toBe(0)
    expect(f.ipVol).toBe(1)
    expect(f.ip).toBeCloseTo(204 / 255)
    expect(f.density).toBe(0.5)
    expect(f.threat).toBe(0.33)
    expect(f.random).toBe(0.5)
    expect(f.off).toBe(0)
  })

  it('clamps density', () => {
    expect(normalize(ev, { ...ctx, density: 99 }).density).toBe(1)
  })
})

describe('resolve', () => {
  const fields = { port: 0.5, off: 0 }

  it('applies base + amount * input', () => {
    expect(resolve({ source: 'port', base: 0.2, amount: 0.5 }, fields)).toBeCloseTo(0.45)
  })

  it('inverts with negative amount and clamps', () => {
    expect(resolve({ source: 'port', base: 0.1, amount: -1 }, fields)).toBe(0)
    expect(resolve({ source: 'port', base: 0.9, amount: 1 }, fields)).toBe(1)
  })

  it('uses base only when off', () => {
    expect(resolve({ source: 'off', base: 0.3, amount: 1 }, fields)).toBe(0.3)
  })
})

describe('settings', () => {
  it('round-trips through the hash', () => {
    const s = structuredClone(DEFAULTS)
    s.mappings.pitch = { source: 'random', base: 0.4, amount: -0.25 }
    s.tuning.scale = 'major'
    expect(decodeSettings(encodeSettings(s))).toEqual(s)
  })

  it('returns null for garbage and fills gaps with defaults', () => {
    expect(decodeSettings('!!!not-base64')).toBeNull()
    const s = sanitize({ mappings: { pitch: { source: 'nope', base: 5, amount: 0.5 } } })
    expect(s.mappings.pitch).toEqual({ ...DEFAULTS.mappings.pitch, amount: 0.5 })
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
