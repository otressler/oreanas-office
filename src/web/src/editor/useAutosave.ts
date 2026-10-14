// Saves the map to the browser shortly after every change, and at once when the page
// hides or the editor closes, so closing the browser loses nothing
// (knowledge/implementation-plan.md, stage 5 gate).
import { useEffect, useState } from 'react'
import type { OfflineDb } from '../offline/db'
import { saveMap } from './maps'
import type { EditorStore } from './store'

export type SaveStatus = 'saved' | 'saving' | 'failed'

/** How long typing or painting may pause before the map is written. */
export const AUTOSAVE_DELAY_MS = 400

export function useAutosave(store: EditorStore, db: OfflineDb, mapId: string): SaveStatus {
  const [status, setStatus] = useState<SaveStatus>('saved')

  useEffect(() => {
    let savedRevision = store.getState().revision
    let timer: ReturnType<typeof setTimeout> | undefined
    let running: Promise<void> = Promise.resolve()

    const flush = () => {
      clearTimeout(timer)
      timer = undefined
      const { revision, doc } = store.getState()
      if (revision === savedRevision) return
      savedRevision = revision
      setStatus('saving')
      running = running
        .then(() => saveMap(db, mapId, doc))
        .then(
          () => {
            if (store.getState().revision === savedRevision) setStatus('saved')
          },
          () => {
            // Try again with the next change or flush.
            savedRevision = -1
            setStatus('failed')
          },
        )
    }

    const unsubscribe = store.subscribe((state, previous) => {
      const gestureEnded = previous.gestureBase !== null && state.gestureBase === null
      if (state.revision === previous.revision && !gestureEnded) return
      // A gesture saves when it ends; one write per drag, not per cell.
      if (state.gestureBase) return
      clearTimeout(timer)
      timer = setTimeout(flush, AUTOSAVE_DELAY_MS)
      setStatus('saving')
    })
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flush)

    return () => {
      unsubscribe()
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [store, db, mapId])

  return status
}
