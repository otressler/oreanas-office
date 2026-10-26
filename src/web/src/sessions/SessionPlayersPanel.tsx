// Who plays which character in this session (knowledge/domain/session.md, "Who plays which
// character"). Everyone sees it; the session DM hands a character to another member for the
// session, or back to its owner, while the session isn't over.
import { useMutation } from '@tanstack/react-query'
import { api } from '../api/client'
import { unwrap } from '../api/errors'
import type { Campaign, Character, Session } from '../api/types'
import { ringColor } from '../board/palette'
import { useCharacters, useInvalidateSessions } from '../campaigns/queries'
import { Badge, ErrorAlert, LoadError, Panel, SelectField } from '../components/ui'
import { de } from '../text/de'
import { TokenPicture } from '../tokenImages/TokenPicture'

const t = de.sessionPage.players

/** Nothing while the campaign has no characters. */
export function SessionPlayersPanel({
  campaign,
  session,
}: {
  campaign: Campaign
  session: Session
}) {
  const characters = useCharacters(campaign.id)
  const invalidate = useInvalidateSessions(campaign.id)
  const canChange = session.isSessionDm && session.status !== 'ended'

  const hand = useMutation({
    mutationFn: ({ characterId, userId }: { characterId: string; userId: string }) =>
      unwrap(
        api.PUT(
          '/api/campaigns/{campaignId}/sessions/{sessionId}/characters/{characterId}/player',
          {
            params: { path: { campaignId: campaign.id, sessionId: session.id, characterId } },
            body: { userId },
          },
        ),
      ),
    onSuccess: () => invalidate(),
  })

  if (characters.isPending) return null
  if (characters.isError) {
    return <LoadError error={characters.error} onRetry={() => void characters.refetch()} />
  }
  if (characters.data.length === 0) return null

  return (
    <Panel title={t.title}>
      {canChange && <p className="text-sm text-dim">{t.help}</p>}
      <ul className="flex flex-col divide-y divide-line">
        {characters.data.map((character) => {
          const handed = session.characterPlayers.find((p) => p.characterId === character.id)
          return (
            <PlayerRow
              key={character.id}
              campaign={campaign}
              character={character}
              player={handed ? { userId: handed.userId, displayName: handed.displayName } : null}
              canChange={canChange}
              busy={hand.isPending && hand.variables.characterId === character.id}
              onChange={(userId) => hand.mutate({ characterId: character.id, userId })}
            />
          )
        })}
      </ul>
      <ErrorAlert error={hand.error} />
    </Panel>
  )
}

function PlayerRow({
  campaign,
  character,
  player,
  canChange,
  busy,
  onChange,
}: {
  campaign: Campaign
  character: Character
  /** Someone other than the owner, for this session; null when the owner plays it. */
  player: { userId: string; displayName: string } | null
  canChange: boolean
  busy: boolean
  onChange: (userId: string) => void
}) {
  const playedBy = player ?? {
    userId: character.ownerUserId,
    displayName: character.ownerDisplayName,
  }
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
      <TokenPicture
        url={character.portraitUrl}
        label={character.name}
        ring={ringColor({ kind: 'character', ...character })}
        alt={de.characters.portraitAlt(character.name)}
        className="h-11 w-11 text-base"
      />
      <div className="flex min-w-0 flex-col">
        <span className="font-semibold text-parchment">{character.name}</span>
        <span className="text-sm text-dim">{t.playedBy(playedBy.displayName)}</span>
      </div>
      {player && <Badge tone="candle">{t.handedOver(character.ownerDisplayName)}</Badge>}
      {canChange && (
        <SelectField
          className="ml-auto"
          label={t.field(character.name)}
          value={playedBy.userId}
          disabled={busy}
          onChange={(event) => onChange(event.target.value)}
        >
          {campaign.members.map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.userId === character.ownerUserId
                ? t.ownerOption(member.displayName)
                : member.displayName}
            </option>
          ))}
        </SelectField>
      )}
    </li>
  )
}
