import { useState } from 'react'
import { promptInstall, useInstall } from '../pwa/install'
import { de } from '../text/de'

/**
 * "App installieren" in the header. Opens the browser's install dialog where
 * there is one, and explains the Share menu on iOS, where there isn't.
 */
export function InstallButton() {
  const mode = useInstall((state) => state.mode)
  const [helpOpen, setHelpOpen] = useState(false)

  if (mode === 'none') return null

  return (
    <div className="relative ml-auto">
      <button
        type="button"
        onClick={() => (mode === 'prompt' ? void promptInstall() : setHelpOpen((open) => !open))}
        aria-expanded={mode === 'ios' ? helpOpen : undefined}
        className="rounded-lg border border-line px-3 py-1.5 text-sm text-parchment hover:border-candle"
      >
        {de.install.button}
      </button>
      {mode === 'ios' && helpOpen && (
        <div
          role="dialog"
          aria-label={de.install.iosTitle}
          className="absolute top-full right-0 z-40 mt-2 w-72 rounded-xl border border-line bg-panel p-4 shadow-lg shadow-black/40"
        >
          <p className="font-semibold text-parchment">{de.install.iosTitle}</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-dim">
            <li>
              {de.install.iosShare} <ShareIcon />
              <span className="block">{de.install.iosShareMenu}</span>
            </li>
            <li>{de.install.iosAdd}</li>
          </ol>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => setHelpOpen(false)}
              className="rounded-lg px-3 py-1.5 text-sm text-dim hover:text-parchment"
            >
              {de.install.close}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** The iOS share symbol: a box with an arrow pointing up. */
function ShareIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="inline h-4 w-4 align-text-bottom text-candle"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3v12M8 7l4-4 4 4M7 10H5v11h14V10h-2" />
    </svg>
  )
}
