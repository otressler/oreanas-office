// Keeps the screen awake while a session runs (knowledge/features/spectator-view.md). The
// browser releases the lock when the page is hidden, so it is taken again when the page is
// visible again. Browsers without the Wake Lock API just let the screen sleep.
import { useEffect } from 'react'

interface Sentinel {
  release: () => Promise<void>
}

export function useWakeLock(enabled: boolean): void {
  useEffect(() => {
    const wakeLock = (
      navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<Sentinel> } }
    ).wakeLock
    if (!enabled || !wakeLock) return
    let sentinel: Sentinel | null = null
    let cancelled = false

    async function take() {
      if (document.hidden || sentinel) return
      try {
        const lock = await wakeLock!.request('screen')
        if (cancelled) void lock.release().catch(() => {})
        else sentinel = lock
      } catch {
        // Refused (low battery, no permission): the screen may sleep.
      }
    }
    const onVisible = () => {
      if (!document.hidden) {
        sentinel = null
        void take()
      }
    }
    void take()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void sentinel?.release().catch(() => {})
      sentinel = null
    }
  }, [enabled])
}
