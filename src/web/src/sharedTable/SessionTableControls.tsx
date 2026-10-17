// The session page's part of the shared table (knowledge/features/shared-table.md, "Local
// mode"): the session DM's switch between "Eigene Geräte" and "Gemeinsamer Bildschirm", the
// mode read-only for everyone else, and "Gemeinsamen Bildschirm öffnen" for any member while
// the session is in local mode. The session page has no hub connection, so it learns of a
// change by refetching the session.
import { useMutation } from '@tanstack/react-query'
import { api } from '../api/client'
import { unwrap } from '../api/errors'
import type { PlayMode, Session } from '../api/types'
import { useInvalidateSessions } from '../campaigns/queries'
import { ButtonLink, ErrorAlert } from '../components/ui'
import { sharedScreenPath } from '../sessions/paths'
import { de } from '../text/de'

const t = de.sharedTable

const MODES: readonly PlayMode[] = ['byod', 'local']

export function SessionTableControls({
  campaignId,
  session,
}: {
  campaignId: string
  session: Session
}) {
  const invalidate = useInvalidateSessions(campaignId)
  const change = useMutation({
    mutationFn: (playMode: PlayMode) =>
      unwrap(
        api.PUT('/api/campaigns/{campaignId}/sessions/{sessionId}/play-mode', {
          params: { path: { campaignId, sessionId: session.id } },
          body: { playMode },
        }),
      ),
    onSuccess: () => invalidate(),
  })

  // An ended session has no table any more.
  if (session.status === 'ended') return null
  const local = session.playMode === 'local'

  return (
    <section aria-label={t.playMode.title} className="flex flex-col gap-2">
      {session.isSessionDm ? (
        <div className="flex flex-col gap-1">
          <span className="text-sm text-dim">{t.playMode.title}</span>
          <div role="group" aria-label={t.playMode.title} className="flex flex-wrap gap-2">
            {MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={session.playMode === mode}
                disabled={change.isPending}
                onClick={() => {
                  if (session.playMode !== mode) change.mutate(mode)
                }}
                className={`min-h-11 rounded-lg border px-3 text-sm ${
                  session.playMode === mode
                    ? 'border-candle bg-candle/15 text-candle'
                    : 'border-line text-parchment hover:border-candle'
                }`}
              >
                {t.playMode[mode]}
              </button>
            ))}
          </div>
          <p className="text-sm text-dim">{local ? t.playMode.localHint : t.playMode.byodHint}</p>
          {change.isError && <ErrorAlert error={t.playMode.failed} />}
        </div>
      ) : (
        <p className="text-sm text-dim">{t.playMode.readOnly(t.playMode[session.playMode])}</p>
      )}
      {local && (
        <div>
          <ButtonLink to={sharedScreenPath(campaignId, session.id)}>{t.openScreen}</ButtonLink>
        </div>
      )}
    </section>
  )
}
