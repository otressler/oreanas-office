// Saves the map to the browser shortly after every change, and at once when the page
// hides or the editor closes, so closing the browser loses nothing
// (knowledge/implementation-plan.md, stage 5 gate).
import { useCallback, useEffect, useState } from 'react'
import type { StoreApi } from 'zustand'
import type { OfflineDb } from '../offline/db'
import { saveMap } from './maps'
import type { EditorMap } from './model'
import type { EditorStore } from './store'

export type SaveStatus = 'saved' | 'saving' | 'failed'

/** How long typing or painting may pause before the map is written. */
export const AUTOSAVE_DELAY_MS = 400

export function useAutosave(store: EditorStore, db: OfflineDb, mapId: string): SaveStatus {
  const save = useCallback((doc: EditorMap) => saveMap(db, mapId, doc), [db, mapId])
  return useAutosaveOf(store, save)
}

/**
 * The same for any store that keeps a document and a revision (encounter mode saves its
 * encounter this way). `save` should keep its identity between renders; it resolves false
 * when the write didn't happen.
 */
export function useAutosaveOf<T>(
  store: StoreApi<{ revision: number; doc: T }>,
  save: (doc: T) => Promise<boolean>,
): SaveStatus {
  const [status, setStatus] = useState<SaveStatus>('saved')

  useEffect(() => {
    // The revision last handed to a write; writes run one after another.
    let queuedRevision = store.getState().revision
    let writing = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    let running: Promise<void> = Promise.resolve()

    const flush = () => {
      clearTimeout(timer)
      timer = undefined
      const { revision, doc } = store.getState()
      if (revision === queuedRevision) {
        if (writing === 0) setStatus('saved')
        return
      }
      queuedRevision = revision
      writing += 1
      setStatus('saving')
      // Each write stores the whole map, so only the last one decides the status.
      running = running
        .then(() => save(doc))
        .then(
          (saved) => saved,
          () => false,
        )
        .then((saved) => {
          writing -= 1
          if (writing > 0) return
          if (!saved) {
            // The next change or flush tries again.
            queuedRevision = -1
            setStatus('failed')
          } else {
            setStatus(store.getState().revision === queuedRevision ? 'saved' : 'saving')
          }
        })
    }

    // Changes inside a gesture (typing, a brush stroke) are saved too, so nothing waits
    // for the gesture to end; the delay keeps it to one write per pause.
    const unsubscribe = store.subscribe((state, previous) => {
      if (state.revision === previous.revision) return
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
  }, [store, save])

  return status
}
