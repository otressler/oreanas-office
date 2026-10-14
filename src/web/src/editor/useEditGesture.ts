// Side-panel fields change the map as one store gesture from focus to blur, so typing a
// label or a scene text is one undo step, not one per keystroke.
import { useEffect, useRef } from 'react'
import type { EditorMap } from './model'
import { useEditorStore } from './store'

/** Begins the gesture on focus, ends it on blur, and also when unmounted mid-edit. */
export function useEditGesture() {
  const store = useEditorStore()
  const editing = useRef(false)
  useEffect(
    () => () => {
      if (editing.current) store.getState().endGesture()
    },
    [store],
  )
  return {
    begin() {
      editing.current = true
      store.getState().beginGesture()
    },
    /**
     * Changes the map inside the gesture, starting one if something (an undo, a tool)
     * ended it. Typing back what was there before makes no undo step.
     */
    change(update: (current: EditorMap, base: EditorMap) => EditorMap) {
      editing.current = true
      const state = store.getState()
      state.beginGesture()
      state.updateGesture((current, base) => {
        const next = update(current, base)
        return sameMap(next, base) ? base : next
      })
    },
    end() {
      editing.current = false
      store.getState().endGesture()
    },
  }
}

function sameMap(a: EditorMap, b: EditorMap): boolean {
  return (Object.keys(b) as (keyof EditorMap)[]).every((key) => a[key] === b[key])
}
