const clamp01 = (v) => Math.max(0, Math.min(1, v))
const logRatio = (v, max) => (max > 1 ? clamp01(Math.log(Math.max(1, v)) / Math.log(max)) : 0)

export const THREAT = { green: 0, yellow: 0.33, orange: 0.66, red: 1 }

// ctx: { maxPortW, maxIpW, density (events in window), threat (0..1) }
export function normalize(event, ctx, rand = Math.random) {
  return {
    port: clamp01(Math.log(Math.max(1, event.port)) / Math.log(65535)),
    portPop: logRatio(event.portWeight, ctx.maxPortW),
    ip: (Number(event.ip.split('.')[0]) || 0) / 255,
    ipVol: logRatio(event.ipWeight, ctx.maxIpW),
    density: clamp01(ctx.density / 30),
    threat: ctx.threat,
    random: rand(),
    off: 0,
  }
}

export function resolve(mapping, fields) {
  const input = mapping.source === 'off' ? 0 : fields[mapping.source]
  return clamp01(mapping.base + mapping.amount * input)
}

export function resolveAll(mappings, fields) {
  const out = {}
  for (const [id, mapping] of Object.entries(mappings)) out[id] = resolve(mapping, fields)
  return out
}
