// The way from the server gate's offline and waking screens to the offline map pages,
// so a DM can prepare while the connection is gone or the server wakes up.
import { Link, useInRouterContext } from 'react-router'
import { lastUser } from '../offline/identity'

const className =
  'inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-4 py-2 text-parchment hover:border-candle'

/** A link to /karten, only when a user is remembered on this device. */
export function OfflineMapsLink({ label }: { label: string }) {
  // The gate also renders outside a router (tests); a plain link reloads into the app.
  const inRouter = useInRouterContext()
  if (!lastUser()) return null
  return inRouter ? (
    <Link to="/karten" className={className}>
      {label}
    </Link>
  ) : (
    <a href="/karten" className={className}>
      {label}
    </a>
  )
}
