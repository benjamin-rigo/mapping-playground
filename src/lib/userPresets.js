import { decodeSettings, encodeSettings } from '@/engine/settings'

// User presets live in this browser's localStorage, stored as compact share codes so
// they keep loading after knobs are added or removed. Storage can be unavailable
// (private mode, blocked site data), so every access is guarded.
const KEY = 'mapping-playground.presets'

export function readPresets() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(list) ? list.filter((p) => typeof p?.name === 'string' && typeof p?.code === 'string') : []
  } catch {
    return []
  }
}

function write(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
    return true
  } catch {
    return false
  }
}

// Saves (or overwrites by name); returns the new list, or null if storage failed.
export function savePreset(name, settings) {
  const list = readPresets().filter((p) => p.name !== name)
  const next = [...list, { name, code: encodeSettings(settings) }].sort((a, b) => a.name.localeCompare(b.name))
  return write(next) ? next : null
}

export function deletePreset(name) {
  const next = readPresets().filter((p) => p.name !== name)
  write(next)
  return next
}

export const presetSettings = (p) => decodeSettings(p.code)
