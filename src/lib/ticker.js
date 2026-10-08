// One shared requestAnimationFrame loop for all the small live displays (knob arcs,
// scopes, matrix bars), instead of one loop per component. It runs only while
// something is subscribed.
const subscribers = new Set()
let raf = 0

function loop(now) {
  for (const fn of subscribers) fn(now)
  raf = subscribers.size ? requestAnimationFrame(loop) : 0
}

export function onFrame(fn) {
  subscribers.add(fn)
  if (!raf) raf = requestAnimationFrame(loop)
  return () => subscribers.delete(fn)
}
