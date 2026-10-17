import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { ApiRequestError } from '../api/errors'
import { useCampaign, useSession } from '../campaigns/queries'
import { SessionControls, SessionDetailsForm } from '../campaigns/SessionControls'
import { Badge, Button, ButtonLink, LoadError, Loading, PageTitle } from '../components/ui'
import { EndEncounterButton } from '../encounters/EndEncounterButton'
import { formatDate } from '../lib/dates'
import { FightsPanel } from '../sessions/FightsPanel'
import { fightPath } from '../sessions/paths'
import { SessionTableControls } from '../sharedTable/SessionTableControls'
import { de } from '../text/de'

const t = de.sessionPage

/**
 * /kampagnen/:campaignId/sitzungen/:sessionId — one game night and its fights
 * (knowledge/features/session-planning.md, "Session page"). The DM plans and runs the
 * night from here; players find the running fight.
 */
export function SessionPage() {
  const { campaignId = '', sessionId = '' } = useParams()
  const campaign = useCampaign(campaignId)
  const session = useSession(campaignId, sessionId)
  const [editing, setEditing] = useState(false)

  if (campaign.isPending || session.isPending) return <Loading />
  if (session.isError && session.error instanceof ApiRequestError && session.error.status === 404) {
    return (
      <div className="flex flex-col items-start gap-3 pb-8">
        <PageTitle>{t.notFoundTitle}</PageTitle>
        <p className="text-dim">{t.notFoundBody}</p>
        <ButtonLink to={`/kampagnen/${campaignId}`}>{t.back}</ButtonLink>
      </div>
    )
  }
  if (campaign.isError) {
    return <LoadError error={campaign.error} onRetry={() => void campaign.refetch()} />
  }
  if (session.isError) {
    return <LoadError error={session.error} onRetry={() => void session.refetch()} />
  }

  const s = session.data
  const isDmMember = campaign.data.myRole === 'dm'
  return (
    <div className="flex flex-col pb-8">
      <Link
        to={`/kampagnen/${campaignId}`}
        className="pt-4 text-sm text-candle underline-offset-4 hover:underline"
      >
        <span aria-hidden="true">← </span>
        {t.back}
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <PageTitle>{s.title}</PageTitle>
        <Badge tone={s.status === 'active' ? 'candle' : 'dim'}>{de.sessionStatus[s.status]}</Badge>
      </div>
      <p className="text-sm text-dim">
        {formatDate(s.date)} · {de.sessions.dmName(s.dmDisplayName)}
      </p>

      <div className="mt-3 flex flex-col gap-3">
        {editing ? (
          <SessionDetailsForm
            campaignId={campaignId}
            session={s}
            onDone={() => setEditing(false)}
          />
        ) : (
          s.isSessionDm && (
            <div>
              <Button variant="quiet" onClick={() => setEditing(true)}>
                {t.editDetails}
              </Button>
            </div>
          )
        )}
        <SessionControls campaign={campaign.data} session={s} />
        <SessionTableControls campaignId={campaignId} session={s} />
      </div>

      {s.activeEncounter && (
        <div className="mt-4 flex flex-col gap-2 rounded-xl border border-candle/60 bg-panel p-4">
          <span className="text-xs font-semibold tracking-wide text-candle uppercase">
            {de.encounters.running}
          </span>
          <span className="text-lg text-parchment">{s.activeEncounter.name}</span>
          <div className="flex flex-wrap items-center gap-2">
            <ButtonLink variant="primary" to={fightPath(campaignId, s.activeEncounter.id)}>
              {de.encounters.toFight}
            </ButtonLink>
            {s.isSessionDm && (
              <EndEncounterButton
                campaignId={campaignId}
                sessionId={s.id}
                encounterId={s.activeEncounter.id}
              />
            )}
          </div>
        </div>
      )}

      {isDmMember ? (
        <FightsPanel campaignId={campaignId} session={s} />
      ) : (
        !s.activeEncounter && (
          <p className="mt-4 text-dim">{s.status === 'ended' ? t.playerEnded : t.playerHint}</p>
        )
      )}
    </div>
  )
}
