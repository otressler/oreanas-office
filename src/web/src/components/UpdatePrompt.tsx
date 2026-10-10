import { useRegisterSW } from 'virtual:pwa-register/react'
import { de } from '../text/de'

/**
 * Offers a new app version without forcing it: the page only reloads when the
 * user taps "Neu laden", never in the middle of a fight.
 *
 * There is deliberately no periodic update check. Browsers check for a new
 * service worker on navigation anyway, and a timer would wake the sleeping
 * server (knowledge/decisions/hosting.md).
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <div className="flex w-full max-w-md flex-wrap items-center gap-3 rounded-xl border border-line bg-panel px-4 py-3 shadow-lg shadow-black/40">
        <p className="min-w-0 flex-1 text-sm text-parchment">{de.update.message}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setNeedRefresh(false)}
            className="rounded-lg px-3 py-2 text-sm text-dim hover:text-parchment"
          >
            {de.update.later}
          </button>
          <button
            type="button"
            onClick={() => void updateServiceWorker(true)}
            className="rounded-lg bg-candle px-3 py-2 text-sm font-semibold text-table hover:bg-candle-strong"
          >
            {de.update.reload}
          </button>
        </div>
      </div>
    </div>
  )
}
