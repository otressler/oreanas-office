import { useState } from 'react'
import { useNavigate } from 'react-router'
import type { Campaign, Encounter, Session } from '../api/types'
import { useSessions } from '../campaigns/queries'
import { Badge, ButtonLink, LoadError, Loading, Panel } from '../components/ui'
import { formatMeters } from '../lib/units'
import { syncThenStart, useSyncDb } from '../sync'
import { de } from '../text/de'
import { NewEncounterButton } from './NewEncounterButton'
import { useEncounters } from './queries'

/**
 * The campaign's prepared and past fights, for `dm` members only
 * (knowledge/domain/encounter.md, "Who does what"). The session DM sets up and
 * starts a ready one from here.
 */
export function EncountersPanel({ campaign }: { campaign: Campaign }) {
  const encounters = useEncounters(campaign.id)
  const sessions = useSessions(campaign.id)
  // The session this user runs right now, if any: only its DM starts fights.
  const mySession = sessions.data?.find((s) => s.status === 'active' && s.isSessionDm) ?? null
  const hasReady = encounters.data?.some((e) => e.status === 'ready') ?? false
  // Why a ready fight has no start button.
  const hint =
    !hasReady || sessions.isPending
      ? null
      : !mySession
        ? de.encounters.needsSession
        : mySession.activeEncounter
          ? de.encounters.oneAtATime
          : null

  return (
    <Panel
      title={de.encounters.title}
      action={
        <div className="flex flex-wrap gap-2">
          <NewEncounterButton campaignId={campaign.id} />
          <ButtonLink to={`/kampagnen/${campaign.id}/karten/importieren`}>
            {de.encounters.importMap}
          </ButtonLink>
        </div>
      }
    >
      {encounters.isPending ? (
        <Loading />
      ) : encounters.isError ? (
        <LoadError error={encounters.error} onRetry={() => void encounters.refetch()} />
      ) : encounters.data.length === 0 ? (
        <p className="text-dim">{de.encounters.empty}</p>
      ) : (
        <>
          {hint && <p className="text-sm text-dim">{hint}</p>}
          <ul className="flex flex-col divide-y divide-line">
            {encounters.data.map((encounter) => (
              <EncounterRow
                key={encounter.id}
                campaignId={campaign.id}
                encounter={encounter}
                session={mySession}
              />
            ))}
          </ul>
        </>
      )}
    </Panel>
  )
}

function EncounterRow({
  campaignId,
  encounter,
  session,
}: {
  campaignId: string
  encounter: Encounter
  /** The active session the user runs; starting needs one without a running fight. */
  session: Session | null
}) {
  const canSetUp = encounter.status === 'ready' && session && !session.activeEncounter
  // An encounter prepared on this device goes to the server first, as with the editor's button.
  const db = useSyncDb()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  async function setUp() {
    if (!session) return
    setBusy(true)
    setMessage(null)
    try {
      const check = await syncThenStart(db, encounter.id)
      if (check.proceed) {
        void navigate(
          `/kampagnen/${campaignId}/sitzungen/${session.id}/kampf/${encounter.id}/aufstellen`,
        )
      } else {
        setMessage(check.message)
      }
    } finally {
      setBusy(false)
    }
  }
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-parchment">{encounter.name}</span>
        <Badge tone={encounter.status === 'active' ? 'candle' : 'dim'}>
          {de.encounterStatus[encounter.status]}
        </Badge>
      </div>
      <span className="text-sm text-dim">
        {de.encounters.gridSize(
          encounter.width,
          encounter.height,
          formatMeters(encounter.width),
          formatMeters(encounter.height),
        )}{' '}
        · {de.encounters.creatures(encounter.creatureCount)}
      </span>
      {canSetUp && (
        <div>
          <ButtonLink
            variant="primary"
            to={`/kampagnen/${campaignId}/sitzungen/${session.id}/kampf/${encounter.id}/aufstellen`}
            onClick={(event) => {
              event.preventDefault()
              void setUp()
            }}
            aria-busy={busy}
          >
            {de.encounters.setUp}
          </ButtonLink>
          {message && (
            <p role="status" className="mt-2 text-sm text-parchment">
              {message}
            </p>
          )}
        </div>
      )}
      {encounter.status === 'active' && (
        <div>
          <ButtonLink variant="primary" to={`/kampagnen/${campaignId}/kampf/${encounter.id}`}>
            {de.encounters.toFight}
          </ButtonLink>
        </div>
      )}
    </li>
  )
}
