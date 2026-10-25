import { Link, Outlet, useMatches } from 'react-router'
import { useMe } from '../auth/auth'
import { useServerStatus } from '../server/serverStatus'
import { de } from '../text/de'
import { InstallButton } from './InstallButton'
import { Diamond } from './ornaments'
import { UpdatePrompt } from './UpdatePrompt'

/** What a route tells the shell (its `handle` in routes.tsx). */
export interface LayoutHandle {
  /** The page uses a desktop's width instead of one reading column. */
  wide?: boolean
}

function useWide(): boolean {
  return useMatches().some((match) => (match.handle as LayoutHandle | undefined)?.wide)
}

/**
 * The app shell: always rendered from cache, even while the server sleeps. The routes
 * decide which pages wait for the server (ServerGateOutlet) and which work offline.
 */
export function Layout() {
  const width = useWide() ? 'max-w-6xl' : 'max-w-3xl'
  return (
    <div className="flex min-h-dvh flex-col pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
      <header className="border-b border-line bg-panel/60 pt-[env(safe-area-inset-top)]">
        <div className={`mx-auto flex h-12 ${width} items-center gap-2 px-4`}>
          <Link
            to="/"
            className="flex items-center gap-2 font-display text-base font-bold tracking-wide whitespace-nowrap text-candle hover:text-candle-strong"
          >
            <Diamond className="size-1.5 bg-candle" />
            {de.appName}
          </Link>
          <div className="ml-auto flex min-w-0 items-center gap-2">
            <InstallButton />
            <ProfileLink />
          </div>
        </div>
      </header>
      <main className={`mx-auto w-full ${width} flex-1 px-4 pb-4`}>
        <Outlet />
      </main>
      <footer className="border-t border-line pb-[env(safe-area-inset-bottom)]">
        <div className={`mx-auto flex ${width} flex-wrap gap-x-4 px-4`}>
          <Link
            to="/fahrplan"
            className="flex min-h-11 items-center text-sm text-dim hover:text-parchment"
          >
            {de.roadmap.link}
          </Link>
          <Link
            to="/impressum"
            className="flex min-h-11 items-center text-sm text-dim hover:text-parchment"
          >
            {de.imprint.link}
          </Link>
          <Link
            to="/datenschutz"
            className="flex min-h-11 items-center text-sm text-dim hover:text-parchment"
          >
            {de.privacy.link}
          </Link>
        </div>
      </footer>
      <UpdatePrompt />
    </div>
  )
}

/** The signed-in user's name, linking to the profile. Asks only once the server is awake. */
function ProfileLink() {
  const ready = useServerStatus((s) => s.status === 'ready')
  const me = useMe({ enabled: ready })
  if (!me.data) return null
  return (
    <Link
      to="/profil"
      aria-label={de.header.profile(me.data.displayName)}
      className="flex min-h-11 min-w-0 items-center gap-1.5 rounded-lg px-2 text-sm text-parchment hover:text-candle"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-5 shrink-0 text-candle"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </svg>
      <span className="max-w-[9rem] truncate">{me.data.displayName}</span>
    </Link>
  )
}
