export function pickWeighted(list, rand = Math.random) {
  const total = list.reduce((s, x) => s + x.w, 0)
  let r = rand() * total
  for (const x of list) {
    r -= x.w
    if (r < 0) return x
  }
  return list[list.length - 1]
}

// Turns DShield aggregates (top IPs, top ports) into a live-feeling event stream:
// weighted IP x port picks at ~3/s, with occasional port-scan bursts from one IP.
export function createSampler({ emit, rand = Math.random, schedule = (fn, ms) => setTimeout(fn, ms), cancel = (id) => clearTimeout(id) }) {
  let data = null
  let timer = null
  let running = false

  const makeEvent = (ip, port, burst) => ({
    t: Date.now(),
    ip: ip.ip,
    ipWeight: ip.w,
    port: port.port,
    portWeight: port.w,
    burst,
  })

  function burst(ip) {
    const n = 4 + Math.floor(rand() * 7)
    let delay = 0
    for (let i = 0; i < n; i++) {
      delay += 60 + rand() * 90
      schedule(() => running && emit(makeEvent(ip, pickWeighted(data.ports, rand), true)), delay)
    }
  }

  function tick() {
    if (!running) return
    const ip = pickWeighted(data.ips, rand)
    if (rand() < 1 / 15) burst(ip)
    else emit(makeEvent(ip, pickWeighted(data.ports, rand), false))
    timer = schedule(tick, 120 + rand() * 450)
  }

  return {
    setData(d) {
      data = d
    },
    start() {
      if (running || !data) return
      running = true
      tick()
    },
    stop() {
      running = false
      if (timer != null) cancel(timer)
      timer = null
    },
  }
}
