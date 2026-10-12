import { useNavigate, useParams } from 'react-router'
import { ApiRequestError } from '../api/errors'
import { Board } from '../board/Board'
import { ButtonLink, LoadError, Loading, PageTitle } from '../components/ui'
import { EndEncounterButton } from '../encounters/EndEncounterButton'
import { FightScreen } from '../encounters/FightScreen'
import { useBoard } from '../encounters/queries'
import { de } from '../text/de'

const t = de.encounters

/**
 * /kampagnen/:campaignId/kampf/:encounterId — the running fight's board, for
 * players and the DM. Loads once and again on focus or reconnect, never on a timer
 * (knowledge/decisions/hosting.md); live moves arrive in stage 4.
 */
export function EncounterPage() {
  const { campaignId = '', encounterId = '' } = useParams()
  const navigate = useNavigate()
  const board = useBoard(campaignId, encounterId)

  // An ended fight is over for everyone. Players get 404 for a fight that isn't
  // running (ended, not started yet, or a wrong link); DMs get the board itself.
  if (board.data?.status === 'ended') {
    return <FightMessage campaignId={campaignId} title={t.overTitle} body={t.overBody} />
  }
  if (board.error instanceof ApiRequestError && board.error.status === 404) {
    return (
      <FightMessage campaignId={campaignId} title={t.notRunningTitle} body={t.notRunningBody} />
    )
  }

  if (board.isPending || board.isError) {
    return (
      <FightScreen campaignId={campaignId} title={null}>
        <div className="px-4">
          {board.isPending ? (
            <Loading />
          ) : (
            <LoadError error={board.error} onRetry={() => void board.refetch()} />
          )}
        </div>
      </FightScreen>
    )
  }

  const { sessionId, isSessionDm, status } = board.data
  return (
    <FightScreen
      campaignId={campaignId}
      title={board.data.name}
      actions={
        isSessionDm &&
        sessionId &&
        status === 'active' && (
          <EndEncounterButton
            campaignId={campaignId}
            sessionId={sessionId}
            encounterId={encounterId}
            onEnded={() => void navigate(`/kampagnen/${campaignId}`)}
          />
        )
      }
    >
      <Board board={board.data} className="min-h-0 flex-1" />
    </FightScreen>
  )
}

function FightMessage({
  campaignId,
  title,
  body,
}: {
  campaignId: string
  title: string
  body: string
}) {
  return (
    <div className="flex flex-col items-start gap-3 pb-8">
      <PageTitle>{title}</PageTitle>
      <p className="text-dim">{body}</p>
      <ButtonLink variant="primary" to={`/kampagnen/${campaignId}`}>
        {t.back}
      </ButtonLink>
    </div>
  )
}
