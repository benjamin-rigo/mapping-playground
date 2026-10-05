const clamp01 = (v) => Math.max(0, Math.min(1, v))
// Log-scaled position between the smallest and largest weight in the current dataset.
const logRange = (v, min, max) => (max > min ? clamp01(Math.log(v / min) / Math.log(max / min)) : 0.5)

export const THREAT = { green: 0, yellow: 0.33, orange: 0.66, red: 1 }

// Per-event source values, all 0..1. ctx: { minPortW, maxPortW, minIpW, maxIpW }
export function normalize(event, ctx) {
  return {
    port: clamp01(Math.log(Math.max(1, event.port)) / Math.log(65535)),
    portPop: logRange(event.portWeight, ctx.minPortW, ctx.maxPortW),
    ip: (Number(event.ip.split('.')[0]) || 0) / 255,
    ipVol: logRange(event.ipWeight, ctx.minIpW, ctx.maxIpW),
  }
}

// Holds the latest per-event values plus smoothed followers of every source, so
// continuous targets (drone, visual field) glide instead of jumping per event.
export function createSources() {
  const latest = { port: 0, portPop: 0, ip: 0, ipVol: 0, density: 0, threat: 0, hit: 0 }
  const smooth = { ...latest }

  return {
    latest,
    smooth,
    onEvent(fields) {
      Object.assign(latest, fields)
    },
    tick(dt, { density, threat, tau }) {
      latest.density = clamp01(density / 30)
      latest.threat = threat
      const k = 1 - Math.exp(-dt / tau)
      for (const key in latest) smooth[key] += (latest[key] - smooth[key]) * k
    },
  }
}
