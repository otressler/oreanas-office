import { Link, Outlet } from 'react-router'
import { useMe } from '../auth/auth'
import { ServerGate } from '../server/ServerGate'
import { useServerStatus } from '../server/serverStatus'
import { de } from '../text/de'
import { InstallButton } from './InstallButton'
import { UpdatePrompt } from './UpdatePrompt'

/** The app shell: always rendered from cache, even while the server sleeps. */
export function Layout() {
  return (
    <div className="flex min-h-dvh flex-col pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
      <header className="border-b border-line bg-panel/60 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-12 max-w-3xl items-center gap-2 px-4">
          <Link to="/" className="text-base font-semibold tracking-wide text-candle">
            {de.appName}
          </Link>
          <div className="ml-auto flex min-w-0 items-center gap-2">
            <InstallButton />
            <ProfileLink />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <ServerGate>
          <Outlet />
        </ServerGate>
      </main>
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
