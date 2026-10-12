import { useNavigate, useParams } from 'react-router'
import { ApiRequestError } from '../api/errors'
import { Board } from '../board/Board'
import { ButtonLink, LoadError, Loading, PageTitle } from '../components/ui'
import { EndEncounterButton } from '../encounters/EndEncounterButton'
import { FightScreen } from '../encounters/FightScreen'
import { useBoard } from '../encounters/queries'
import { de } from '../text/de'

/**
 * /kampagnen/:campaignId/kampf/:encounterId — the running fight's board, for
 * players and the DM. Loads once and again on focus or reconnect, never on a timer
 * (knowledge/decisions/hosting.md); live moves arrive in stage 4.
 */
export function EncounterPage() {
  const { campaignId = '', encounterId = '' } = useParams()
  const navigate = useNavigate()
  const board = useBoard(campaignId, encounterId)

  // Players get 404 once the fight has ended; DMs still see it, marked ended.
  const over =
    board.data?.status === 'ended' ||
    (board.error instanceof ApiRequestError && board.error.status === 404)
  if (over) return <FightOver campaignId={campaignId} />

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

function FightOver({ campaignId }: { campaignId: string }) {
  return (
    <div className="flex flex-col items-start gap-3 pb-8">
      <PageTitle>{de.encounters.overTitle}</PageTitle>
      <p className="text-dim">{de.encounters.overBody}</p>
      <ButtonLink variant="primary" to={`/kampagnen/${campaignId}`}>
        {de.encounters.back}
      </ButtonLink>
    </div>
  )
}
