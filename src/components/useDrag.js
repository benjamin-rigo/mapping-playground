import { useRef } from 'react'

// Drag gesture for knobs and matrix cells.
// Mouse/pen: drag up/down; after a few pixels it takes pointer lock (like a DAW knob)
// so it keeps working past the screen edge.
// Touch: drag left/right, so vertical swipes still scroll the page (the element uses
// touch-action: pan-y; if the browser starts scrolling it cancels the gesture).
// onDrag(d, event) gets the total distance since pointer-down (up or right is positive).
// onEnd(moved, cancelled) runs when the gesture ends.
export function useDrag({ onStart, onDrag, onEnd }) {
  const state = useRef(null)

  const end = (cancelled) => {
    const s = state.current
    if (!s) return
    if (document.pointerLockElement === s.el) document.exitPointerLock()
    state.current = null
    onEnd?.(s.moved, cancelled, s.touch)
  }

  return {
    onPointerDown(e) {
      const touch = e.pointerType === 'touch'
      if (!touch) e.currentTarget.setPointerCapture(e.pointerId)
      state.current = { x: e.clientX, y: e.clientY, d: 0, moved: false, el: e.currentTarget, touch }
      onStart?.(e)
    },
    onPointerMove(e) {
      const s = state.current
      if (!s) return
      if (s.touch) s.d = e.clientX - s.x
      else if (document.pointerLockElement === s.el) s.d -= e.movementY
      else s.d = s.y - e.clientY
      if (!s.moved && Math.abs(s.d) > (s.touch ? 6 : 3)) {
        s.moved = true
        if (s.touch) s.el.setPointerCapture(e.pointerId)
        else s.el.requestPointerLock?.()?.catch?.(() => {})
      }
      if (s.moved) onDrag(s.d, e)
    },
    onPointerUp() {
      end(false)
    },
    onPointerCancel() {
      end(true)
    },
  }
}
