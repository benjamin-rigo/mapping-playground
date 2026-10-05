const clamp01 = (v) => Math.max(0, Math.min(1, v))
const logRatio = (v, max) => (max > 1 ? clamp01(Math.log(Math.max(1, v)) / Math.log(max)) : 0)

export const THREAT = { green: 0, yellow: 0.33, orange: 0.66, red: 1 }

// Per-event source values, all 0..1. ctx: { maxPortW, maxIpW }
export function normalize(event, ctx) {
  return {
    port: clamp01(Math.log(Math.max(1, event.port)) / Math.log(65535)),
    portPop: logRatio(event.portWeight, ctx.maxPortW),
    ip: (Number(event.ip.split('.')[0]) || 0) / 255,
    ipVol: logRatio(event.ipWeight, ctx.maxIpW),
  }
}

// Holds the latest per-event values plus smoothed followers of every source, so
// continuous targets (drone, visual field) glide instead of jumping per event.
export function createSources() {
  const latest = { port: 0, portPop: 0, ip: 0, ipVol: 0, density: 0, threat: 0 }
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
