import { useRef } from 'react'

// Vertical drag that keeps working past the screen edge: after a few pixels of
// movement it takes pointer lock (like a DAW knob) and reads relative movement.
// onDrag(dy, event) gets the total upward distance since pointer-down.
export function useDrag({ onStart, onDrag, onEnd }) {
  const state = useRef(null)

  return {
    onPointerDown(e) {
      e.currentTarget.setPointerCapture(e.pointerId)
      state.current = { y: e.clientY, dy: 0, moved: false, el: e.currentTarget, mouse: e.pointerType === 'mouse' }
      onStart?.(e)
    },
    onPointerMove(e) {
      const s = state.current
      if (!s) return
      if (document.pointerLockElement === s.el) s.dy -= e.movementY
      else s.dy = s.y - e.clientY
      if (!s.moved && Math.abs(s.dy) > 3) {
        s.moved = true
        if (s.mouse) s.el.requestPointerLock?.()?.catch?.(() => {})
      }
      if (s.moved) onDrag(s.dy, e)
    },
    onPointerUp() {
      const s = state.current
      if (!s) return
      if (document.pointerLockElement === s.el) document.exitPointerLock()
      state.current = null
      onEnd?.(s.moved)
    },
  }
}
