import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { de } from '../text/de'

/**
 * A full-screen page for the board: a slim top bar instead of the app header, so
 * the map gets every pixel a phone has. Covers the app shell; the update prompt
 * still shows above it.
 */
export function FightScreen({
  campaignId,
  title,
  status,
  actions,
  children,
}: {
  campaignId: string
  title: ReactNode
  /** Small, next to the title: the live table's connection indicator. */
  status?: ReactNode
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-table pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]">
      <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-panel/80 px-3 py-1">
        <Link
          to={`/kampagnen/${campaignId}`}
          aria-label={de.encounters.back}
          className="flex min-h-11 items-center gap-1 rounded-lg pr-2 text-sm text-candle hover:underline"
        >
          <span aria-hidden="true">←</span>
          <span className="hidden sm:inline">{de.encounters.back}</span>
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-parchment">{title}</h1>
        {status}
        {actions}
      </header>
      {children}
    </div>
  )
}
