import { Link, Outlet } from 'react-router'
import { ServerGate } from '../server/ServerGate'
import { de } from '../text/de'
import { InstallButton } from './InstallButton'
import { UpdatePrompt } from './UpdatePrompt'

/** The app shell: always rendered from cache, even while the server sleeps. */
export function Layout() {
  return (
    <div className="flex min-h-dvh flex-col pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
      <header className="border-b border-line bg-panel/60 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-12 max-w-3xl items-center px-4">
          <Link to="/" className="text-base font-semibold tracking-wide text-candle">
            {de.appName}
          </Link>
          <InstallButton />
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
