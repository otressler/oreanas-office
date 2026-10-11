// Can the app be installed, and how? (knowledge/features/playable-map.md)
//
// Chrome and Edge fire `beforeinstallprompt` while the app is installable. The
// event is kept so the header button can open the browser's install dialog
// later. It can fire before React renders, so listenForInstall() runs in main.tsx.
// Safari on iOS and iPadOS has no such event or dialog, so the button explains
// Share → "Zum Home-Bildschirm" instead. Running installed hides the button.
import { create } from 'zustand'

export type InstallMode =
  /** Running installed, or the browser offers no way to install (Firefox on Android). */
  | 'none'
  /** The browser's install dialog is available. */
  | 'prompt'
  /** iOS or iPadOS: install through the Share menu. */
  | 'ios'

/** Chrome's install event; not in the DOM typings. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

interface InstallState {
  mode: InstallMode
}

export const useInstall = create<InstallState>(() => ({ mode: 'none' }))

let deferred: BeforeInstallPromptEvent | null = null
let stopListening: (() => void) | null = null

function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as { standalone?: boolean }).standalone === true
  )
}

function isIos(): boolean {
  // iPadOS asks for desktop sites and reports a Mac; touch points tell them apart.
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1)
  )
}

/** Decides the mode and starts listening for the browser's install events. */
export function listenForInstall(): void {
  if (stopListening) return
  stopListening = () => {}
  if (isStandalone()) return

  useInstall.setState({ mode: isIos() ? 'ios' : 'none' })

  const onPrompt = (event: Event) => {
    // Stops Chrome's own install banner; the header button replaces it.
    event.preventDefault()
    deferred = event as BeforeInstallPromptEvent
    useInstall.setState({ mode: 'prompt' })
  }
  const onInstalled = () => {
    deferred = null
    useInstall.setState({ mode: 'none' })
  }
  window.addEventListener('beforeinstallprompt', onPrompt)
  window.addEventListener('appinstalled', onInstalled)
  stopListening = () => {
    window.removeEventListener('beforeinstallprompt', onPrompt)
    window.removeEventListener('appinstalled', onInstalled)
  }
}

/**
 * Opens the browser's install dialog. The event works only once, so the button
 * hides until the browser offers installing again.
 */
export async function promptInstall(): Promise<void> {
  const event = deferred
  if (!event) return
  deferred = null
  useInstall.setState({ mode: 'none' })
  await event.prompt()
}

/** Stops listening and forgets the mode. For tests. */
export function resetInstall(): void {
  stopListening?.()
  stopListening = null
  deferred = null
  useInstall.setState({ mode: 'none' })
}
