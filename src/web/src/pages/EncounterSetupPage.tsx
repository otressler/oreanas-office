import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ApiRequestError, errorMessage } from '../api/errors'
import type { BoardState, BoardToken, Character } from '../api/types'
import { Board } from '../board/Board'
import { buildGrid, cellKey, type GridPoint } from '../board/geometry'
import { useCharacters, useSessions } from '../campaigns/queries'
import { Button, ButtonLink, ErrorAlert, LoadError, Loading, PageTitle } from '../components/ui'
import { FightScreen } from '../encounters/FightScreen'
import {
  autoPlace,
  freeCells,
  setupTokenId,
  withPlacedCharacters,
  type Positions,
} from '../encounters/placement'
import { useBoard, useStartEncounter } from '../encounters/queries'
import { formatMeters } from '../lib/units'
import { de } from '../text/de'

const t = de.encounters.setup

/**
 * /kampagnen/:campaignId/sitzungen/:sessionId/kampf/:encounterId/aufstellen — the
 * session DM ticks the characters taking part, places each, and starts the fight
 * (knowledge/domain/encounter.md, "Starting"). Placing and starting are one request,
 * so players never see half-placed tokens.
 */
export function EncounterSetupPage() {
  const { campaignId = '', sessionId = '', encounterId = '' } = useParams()
  const board = useBoard(campaignId, encounterId)
  const characters = useCharacters(campaignId)
  const sessions = useSessions(campaignId)

  const failed = [board, characters, sessions].find((query) => query.isError)
  if (failed) {
    return <LoadError error={failed.error} onRetry={() => void failed.refetch()} />
  }
  if (!board.data || !characters.data || !sessions.data) return <Loading />

  const session = sessions.data.find((s) => s.id === sessionId)
  if (!session || session.status !== 'active' || !session.isSessionDm) {
    return <CannotSetUp campaignId={campaignId} message={t.notSessionDm} />
  }
  if (board.data.status !== 'ready') {
    return (
      <CannotSetUp
        campaignId={campaignId}
        message={t.notReady}
        fightId={board.data.status === 'active' ? encounterId : undefined}
      />
    )
  }
  return (
    <SetupScreen
      campaignId={campaignId}
      sessionId={sessionId}
      board={board.data}
      characters={characters.data}
    />
  )
}

function CannotSetUp({
  campaignId,
  message,
  fightId,
}: {
  campaignId: string
  message: string
  fightId?: string
}) {
  return (
    <div className="flex flex-col items-start gap-3 pb-8">
      <PageTitle>{de.encounters.setUp}</PageTitle>
      <p className="text-dim">{message}</p>
      <div className="flex flex-wrap gap-2">
        {fightId && (
          <ButtonLink variant="primary" to={`/kampagnen/${campaignId}/kampf/${fightId}`}>
            {de.encounters.toFight}
          </ButtonLink>
        )}
        <ButtonLink to={`/kampagnen/${campaignId}`}>{de.encounters.back}</ButtonLink>
      </div>
    </div>
  )
}

function SetupScreen({
  campaignId,
  sessionId,
  board,
  characters,
}: {
  campaignId: string
  sessionId: string
  board: BoardState
  characters: Character[]
}) {
  const navigate = useNavigate()
  const start = useStartEncounter(campaignId, sessionId, board.encounterId)
  const grid = useMemo(() => buildGrid(board.map), [board.map])
  const [positions, setPositions] = useState<Positions>(() => new Map())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // A hint from this screen's own checks, e.g. no room on the tapped cell.
  const [problem, setProblem] = useState<string | null>(null)

  const shown = useMemo(
    () => withPlacedCharacters(board, grid, characters, positions),
    [board, grid, characters, positions],
  )
  const selected = characters.find((c) => c.id === selectedId) ?? null
  const highlight = useMemo(
    () => (selected ? freeCells(grid, shown.tokens, selected) : undefined),
    [grid, shown.tokens, selected],
  )
  const ticked = characters.filter((c) => positions.has(c.id))
  const unplaced = ticked.filter((c) => !positions.get(c.id))

  function update(next: Map<string, GridPoint | null>, nextSelected: string | null) {
    setPositions(next)
    setSelectedId(nextSelected)
    setProblem(null)
  }

  function toggle(character: Character, on: boolean) {
    const next = new Map(positions)
    if (on) {
      next.set(character.id, null)
      update(next, character.id)
    } else {
      next.delete(character.id)
      update(next, selectedId === character.id ? null : selectedId)
    }
  }

  function select(character: Character) {
    if (!positions.has(character.id)) return toggle(character, true)
    update(new Map(positions), selectedId === character.id ? null : character.id)
  }

  function place(cell: GridPoint) {
    if (!selected) return
    if (!highlight?.has(cellKey(cell.x, cell.y))) {
      setProblem(t.noRoom(selected.name))
      return
    }
    const next = new Map(positions)
    next.set(selected.id, cell)
    // Carry on with the next character still waiting for a place.
    const waiting = characters.find((c) => c.id !== selected.id && next.get(c.id) === null)
    update(next, waiting?.id ?? null)
  }

  function tapToken(token: BoardToken) {
    if (token.characterId && positions.has(token.characterId)) {
      update(new Map(positions), token.characterId)
    } else {
      place({ x: token.x, y: token.y })
    }
  }

  function placeRest() {
    const placed = autoPlace(grid, shown.tokens, board.map.layout.entrances, unplaced)
    const next = new Map(positions)
    for (const [id, cell] of placed) next.set(id, cell)
    update(next, null)
    if ([...placed.values()].includes(null)) setProblem(t.autoPlaceFull)
  }

  function startFight() {
    if (ticked.length === 0) return setProblem(t.noneTicked)
    if (unplaced.length > 0) {
      return setProblem(t.unplaced(unplaced.map((c) => c.name).join(', ')))
    }
    setProblem(null)
    const placements = ticked.map((c) => ({ characterId: c.id, ...positions.get(c.id)! }))
    start.mutate(placements, {
      onSuccess: () =>
        void navigate(`/kampagnen/${campaignId}/kampf/${board.encounterId}`, { replace: true }),
    })
  }

  return (
    <FightScreen
      campaignId={campaignId}
      title={t.title(board.name)}
      actions={
        <Button variant="primary" busy={start.isPending} onClick={startFight}>
          {t.start}
        </Button>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <Board
          board={shown}
          onCellTap={place}
          onTokenTap={tapToken}
          highlight={highlight}
          selectedTokenId={
            selected && positions.get(selected.id) ? setupTokenId(selected.id) : null
          }
          className="min-h-0 flex-1"
        />
        <aside
          aria-label={t.charactersTitle}
          className="flex max-h-[45dvh] shrink-0 flex-col gap-3 overflow-y-auto border-t border-line bg-panel p-3 md:max-h-none md:w-80 md:border-t-0 md:border-l"
        >
          <p aria-live="polite" className="text-sm text-parchment">
            {selected ? t.pickCell(selected.name) : t.pickCharacter}
          </p>
          <ErrorAlert error={problem} />
          <StartError
            error={start.error}
            characters={characters}
            placements={start.variables ?? []}
          />
          <h2 className="font-semibold text-parchment">{t.charactersTitle}</h2>
          {characters.length === 0 ? (
            <p className="text-sm text-dim">{t.noCharacters}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {characters.map((character) => (
                <CharacterRow
                  key={character.id}
                  character={character}
                  ticked={positions.has(character.id)}
                  placed={!!positions.get(character.id)}
                  selected={character.id === selectedId}
                  onToggle={(on) => toggle(character, on)}
                  onSelect={() => select(character)}
                />
              ))}
            </ul>
          )}
          {unplaced.length > 0 && (
            <div>
              <Button onClick={placeRest}>{t.autoPlace}</Button>
            </div>
          )}
        </aside>
      </div>
    </FightScreen>
  )
}

function CharacterRow({
  character,
  ticked,
  placed,
  selected,
  onToggle,
  onSelect,
}: {
  character: Character
  ticked: boolean
  placed: boolean
  selected: boolean
  onToggle: (on: boolean) => void
  onSelect: () => void
}) {
  return (
    <li className="flex items-center gap-2">
      <input
        type="checkbox"
        aria-label={t.takesPart(character.name)}
        checked={ticked}
        onChange={(event) => onToggle(event.target.checked)}
        className="size-6 shrink-0 accent-candle"
      />
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className={`flex min-h-11 min-w-0 flex-1 flex-col items-start rounded-lg border px-3 py-1 text-left ${
          selected ? 'border-candle bg-candle/10' : 'border-line hover:border-candle'
        }`}
      >
        <span className="truncate font-semibold text-parchment">{character.name}</span>
        <span className="text-xs text-dim">
          {de.sizes[character.size]} · {formatMeters(character.speedSquares)}
          {ticked && ` · ${placed ? t.placed : t.notPlaced}`}
        </span>
      </button>
    </li>
  )
}

/** The server's answer to starting, naming the character a `characters[i]` error is about. */
function StartError({
  error,
  characters,
  placements,
}: {
  error: unknown
  characters: Character[]
  placements: { characterId: string }[]
}) {
  if (!error) return null
  const index = error instanceof ApiRequestError && /^characters\[(\d+)\]/.exec(error.field ?? '')
  const id = index ? placements[Number(index[1])]?.characterId : undefined
  const name = characters.find((c) => c.id === id)?.name
  return <ErrorAlert error={name ? `${errorMessage(error)} ${t.concerns(name)}` : error} />
}
