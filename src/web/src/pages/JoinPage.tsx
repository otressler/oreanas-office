// The page the session's QR code and link open: "Mitspielen" or "Nur zuschauen"
// (knowledge/features/spectator-view.md, "The join page"), route /beitreten/:joinCode with an
// optional ?sitzung=<sessionId>. It never turns anyone away for already having access: a member
// who picks "Mitspielen" is told "already in" by the join endpoint's own idempotence, and one
// who picks "Nur zuschauen" gets the screen. Someone who picked wrong comes back here.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { api } from '../api/client'
import { ApiRequestError, unwrap } from '../api/errors'
import { useCurrentUser } from '../auth/auth'
import { campaignKeys } from '../campaigns/queries'
import { Button, ErrorAlert, LoadError, Loading, PageTitle } from '../components/ui'
import { formatDate } from '../lib/dates'
import { spectatorPath } from '../sessions/paths'
import { cleanJoinCode, defaultSession } from '../spectator/joinCode'
import { useJoinAsSpectator, useJoinLookup } from '../spectator/queries'
import { rememberScreen } from '../spectator/remember'
import { de } from '../text/de'

const t = de.spectator

export function JoinPage() {
  const { joinCode: rawCode = '' } = useParams()
  const joinCode = cleanJoinCode(rawCode)
  const [params] = useSearchParams()
  const requested = params.get('sitzung')
  const me = useCurrentUser()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const lookup = useJoinLookup(joinCode)
  const [picked, setPicked] = useState<string | null>(null)

  const play = useMutation({
    mutationFn: () => unwrap(api.POST('/api/campaigns/join', { body: { code: joinCode } })),
    onSuccess: (campaign) => {
      void queryClient.invalidateQueries({ queryKey: campaignKeys.list })
      void navigate(`/kampagnen/${campaign.id}`)
    },
  })
  const watch = useJoinAsSpectator(joinCode)

  if (lookup.isPending) {
    return (
      <div className="pt-6" role="status">
        <p className="text-dim">{t.joinLoading}</p>
        <Loading />
      </div>
    )
  }
  if (lookup.isError) {
    const invalid =
      lookup.error instanceof ApiRequestError && lookup.error.code === 'joinCodeInvalid'
    if (!invalid) return <LoadError error={lookup.error} onRetry={() => void lookup.refetch()} />
    return (
      <div className="flex flex-col items-start gap-3 pb-8">
        <PageTitle>{t.joinInvalid}</PageTitle>
        <p className="text-dim">{t.joinInvalidHint}</p>
        <Link to="/" className="text-candle underline">
          {t.toHome}
        </Link>
      </div>
    )
  }

  const { campaignName, isMember, sessions } = lookup.data
  const sessionId = requested ?? picked ?? defaultSession(sessions)
  const named = sessions.find((session) => session.id === sessionId)

  function startWatching() {
    watch.mutate(sessionId, {
      onSuccess: (joined) => {
        // The screen is brought back when the app reopens, and a session spectator's way
        // back from it leads here again.
        rememberScreen({
          userId: me.id,
          campaignId: joined.campaignId,
          sessionId: joined.sessionId,
          sharedScreen: false,
          joinCode,
        })
        void navigate(spectatorPath(joined.campaignId, joined.sessionId))
      },
    })
  }

  return (
    <div className="flex flex-col gap-4 pb-8">
      <PageTitle>{campaignName}</PageTitle>
      <p className="text-lg text-parchment">{t.joinIntro(campaignName)}</p>
      {isMember && <p className="text-dim">{t.joinMember}</p>}

      <section className="flex flex-col gap-2 rounded-xl border border-line bg-panel p-4">
        <h2 className="text-lg font-semibold text-parchment">{t.play}</h2>
        <p className="text-dim">{t.playHint}</p>
        <div>
          <Button variant="primary" onClick={() => play.mutate()} busy={play.isPending}>
            {t.play}
          </Button>
        </div>
        <ErrorAlert error={play.error} />
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4">
        <h2 className="text-lg font-semibold text-parchment">{t.watch}</h2>
        <p className="text-dim">{t.watchHint}</p>
        {requested ? (
          named && (
            <p className="text-parchment">
              {named.title} · {formatDate(named.date)}
            </p>
          )
        ) : sessions.length === 0 ? (
          <p className="text-dim">{t.noSessions}</p>
        ) : (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm text-dim">{t.pickSession}</legend>
            {sessions.map((session) => (
              <label
                key={session.id}
                className="flex min-h-11 items-center gap-3 rounded-lg border border-line px-3 py-2 text-parchment has-[:checked]:border-candle"
              >
                <input
                  type="radio"
                  name="session"
                  value={session.id}
                  checked={session.id === sessionId}
                  onChange={() => setPicked(session.id)}
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{session.title}</span>
                  <span className="text-sm text-dim">
                    {formatDate(session.date)} ·{' '}
                    {session.status === 'active' ? t.sessionRunning : t.sessionPlanned}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        <div>
          <Button onClick={startWatching} busy={watch.isPending} disabled={!sessionId}>
            {t.watch}
          </Button>
        </div>
        <ErrorAlert error={watch.error} />
      </section>
    </div>
  )
}
