// Two scenes (Calm and Storm), each = one sound engine + one visual engine with three
// macros (color, texture, motion). An engine is a function from its macros to the
// full set of low-level parameters ("U"). The Tension fader interpolates the two
// scenes' U, so engines crossfade into each other.

const lerp = (a, b, t) => a + (b - a) * t

export const VISUAL_U = {
  hue: 0.6, sat: 0.6, paper: 0.93, contrast: 0.4, scale: 0.35, turb: 0.4, flow: 0.2, soft: 0.6,
  fb: 0, zoom: 0.5, rot: 0.5, warp: 0, mosh: 0, block: 0.5, grid: 0, rgb: 0, tear: 0, static: 0, grain: 0.35,
}

export const SOUND_U = {
  drone: 0, droneTone: 0.4, droneMove: 0.3,
  bell: 0, bellBright: 0.4, bellDecay: 0.5,
  tex: 0, texColor: 0.5, texMove: 0.3,
  pulse: 0, pulseCrush: 0.3, pulseRate: 0.3,
  drive: 0, crush: 0, delay: 0.2, reverb: 0.4,
}

const visual = (u) => ({ ...VISUAL_U, ...u })
const sound = (u) => ({ ...SOUND_U, ...u })

export const VISUAL_ENGINES = {
  fluid: {
    label: 'Fluid',
    hint: 'soft pastel ink that drifts and folds',
    map: ({ color, texture, motion }) =>
      visual({
        hue: 0.45 + color * 0.5, sat: 0.35 + color * 0.4, contrast: 0.25 + texture * 0.3, scale: 0.2 + texture * 0.5,
        turb: 0.2 + texture * 0.6, soft: 0.75 - texture * 0.4, flow: 0.08 + motion * 0.5, fb: motion * 0.5, zoom: 0.5 + motion * 0.1,
        grain: 0.3 + texture * 0.2,
      }),
  },
  tunnel: {
    label: 'Tunnel',
    hint: 'video feedback: trails, zoom tunnels and spirals',
    map: ({ color, texture, motion }) =>
      visual({
        hue: 0.5 + color * 0.6, sat: 0.4 + color * 0.4, contrast: 0.45, scale: 0.4, turb: 0.3, flow: 0.3,
        fb: 0.82 + texture * 0.14, warp: texture * 0.7, zoom: motion, rot: 0.5 + (motion - 0.5) * 0.8, grain: 0.3,
      }),
  },
  mosh: {
    label: 'Mosh',
    hint: 'datamosh: stuck and sliding blocks, colour bleed',
    map: ({ color, texture, motion }) =>
      visual({
        hue: 0.9 + color * 0.4, sat: 0.6 + color * 0.3, contrast: 0.6, scale: 0.5, turb: 0.6, flow: 0.4,
        fb: 0.75, mosh: 0.35 + texture * 0.6, block: motion, rgb: 0.2 + color * 0.6, tear: motion * 0.6, static: texture * 0.2, grain: 0.5,
      }),
  },
  grid: {
    label: 'Grid',
    hint: 'raw data barcodes and static, after Ryoji Ikeda',
    map: ({ color, texture, motion }) =>
      visual({
        hue: color, sat: color * 0.5, paper: 0.04, contrast: 0.9, scale: 0.6, turb: 0.5, flow: 0.5, soft: 0.05,
        fb: 0.3, grid: 0.5 + texture * 0.5, static: motion * 0.6, tear: motion * 0.4, rgb: color * 0.3, grain: 0.6,
      }),
  },
}

export const SOUND_ENGINES = {
  drone: {
    label: 'Drone',
    hint: 'held chords that slowly open and close',
    map: ({ color, texture, motion }) =>
      sound({ drone: 0.75, droneTone: 0.15 + color * 0.7, droneMove: motion, tex: texture * 0.35, texColor: color, bell: texture * 0.25, reverb: 0.55, delay: 0.15 }),
  },
  bells: {
    label: 'Bells',
    hint: 'one struck tone per attack, pitch from the port',
    map: ({ color, texture, motion }) =>
      sound({ bell: 0.8, bellBright: color, bellDecay: 1 - motion * 0.8, drone: 0.25, droneTone: 0.3, tex: texture * 0.2, delay: 0.15 + motion * 0.4, reverb: 0.45 }),
  },
  texture: {
    label: 'Texture',
    hint: 'a filtered noise cloud that breathes',
    map: ({ color, texture, motion }) =>
      sound({ tex: 0.75, texColor: color, texMove: motion, drone: 0.2, droneTone: color * 0.5, drive: texture * 0.35, reverb: 0.5, delay: 0.1 }),
  },
  pulse: {
    label: 'Pulse',
    hint: 'crackles and stutters on every attack',
    map: ({ color, texture, motion }) =>
      sound({ pulse: 0.85, pulseCrush: texture, pulseRate: motion, drive: 0.3 + color * 0.6, crush: texture * 0.6, tex: 0.25, texColor: 0.8, bell: 0.15, bellBright: 1, delay: 0.25, reverb: 0.2 }),
  },
}

export const MACROS = ['color', 'texture', 'motion']

export function lerpU(a, b, t) {
  const out = {}
  for (const k in a) out[k] = lerp(a[k], b[k], t)
  return out
}

// macros: { color, texture, motion } after modulation
export function sceneU(scene, macros) {
  return {
    sound: SOUND_ENGINES[scene.sound.engine].map(macros.sound),
    visual: VISUAL_ENGINES[scene.visual.engine].map(macros.visual),
  }
}
