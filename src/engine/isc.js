import { THREAT } from './fields.js'
// Bundled with the code, so the offline fallback needs no network at all.
import snapshot from './snapshot.json'

const API = 'https://isc.sans.edu/api'

export function parseDataset({ ports, ips, infocon }) {
  const portList = Object.values(ports)
    .filter((o) => o && typeof o === 'object' && o.targetport != null)
    .map((o) => ({ port: Number(o.targetport), w: Math.max(1, Number(o.records) || 1) }))
  const ipList = (Array.isArray(ips) ? ips : Object.values(ips))
    .filter((o) => o && typeof o === 'object' && o.source)
    .map((o) => ({ ip: String(o.source), w: Math.max(1, Number(o.reports) || 1) }))
  if (!portList.length || !ipList.length) throw new Error('empty dataset')
  return {
    ports: portList,
    ips: ipList,
    threat: THREAT[infocon?.status] ?? 0,
    minPortW: Math.min(...portList.map((p) => p.w)),
    maxPortW: Math.max(...portList.map((p) => p.w)),
    minIpW: Math.min(...ipList.map((p) => p.w)),
    maxIpW: Math.max(...ipList.map((p) => p.w)),
  }
}

// A stalled API must not leave the app stuck on "Connecting".
const getJson = async (url) => {
  const r = await fetch(url, { signal: AbortSignal.timeout(6000) })
  if (!r.ok) throw new Error(`${url} -> ${r.status}`)
  return r.json()
}

export async function loadDataset() {
  try {
    const [ports, ips, infocon] = await Promise.all([
      getJson(`${API}/topports/records/25?json`),
      getJson(`${API}/topips/records/40?json`),
      getJson(`${API}/infocon?json`).catch(() => ({ status: 'green' })),
    ])
    return { ...parseDataset({ ports, ips, infocon }), live: true }
  } catch {
    return { ...parseDataset(snapshot), live: false }
  }
}
