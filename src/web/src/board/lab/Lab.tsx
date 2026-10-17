// The board lab page; see main.tsx for the query parameters.
import { useMemo, useRef, useState } from 'react'
import type { BoardState, StatusDefinition } from '../../api/types'
import { MyCharacterButton } from '../../table/MyCharacterButton'
import { usePings } from '../../table/usePings'
import { Board, type BoardHandle } from '../Board'
import { freeCells } from '../../encounters/placement'
import { buildGrid } from '../geometry'

const LAB_USER = 'lab-user'

/** Sample statuses for `statuses=1`: icon-less, so their letters show. */
const SAMPLE_STATUSES: StatusDefinition[] = [
  ['prone', 'Liegend', false],
  ['poisoned', 'Vergiftet', false],
  ['exhaustion', 'Erschöpfung', true],
  ['frightened', 'Verängstigt', false],
  [null, 'Verhext', false],
].map(([key, name, hasLevels], i) => ({
  id: `lab-status-${i}`,
  libraryKey: key as string | null,
  name: name as string,
  hasLevels: hasLevels as boolean,
  iconUrl: null,
  iconDescription: null,
  characterId: null,
}))

const fixtures = import.meta.glob<{ default: unknown }>('../fixtures/*.board.json', {
  eager: true,
})

function fixture(name: string): BoardState {
  const entry = Object.entries(fixtures).find(([path]) => path.endsWith(`/${name}.board.json`))
  return (entry ?? Object.entries(fixtures)[0]!)[1].default as BoardState
}

const params = new URLSearchParams(location.search)

export function Lab() {
  const board = useMemo(() => {
    const loaded = fixture(params.get('fixture') ?? 'gorge-crossing')
    const moves = new Map(
      params.getAll('move').map((value) => {
        const [label, x, y] = value.split(/[:,]/)
        return [label, { x: Number(x), y: Number(y) }] as const
      }),
    )
    const withStatuses = params.get('statuses') === '1'
    // The first character is the lab user's, for "Meine Figur".
    const mine = loaded.tokens.find((token) => token.kind === 'character')?.id
    return {
      ...loaded,
      statuses: withStatuses ? SAMPLE_STATUSES : loaded.statuses,
      people: [{ userId: LAB_USER, displayName: 'Mira', pingColor: '#4da3ff' }],
      tokens: loaded.tokens.map((token, i) => {
        const own = token.id === mine
        return {
          ...token,
          ...moves.get(token.label),
          ownerUserId: own ? LAB_USER : token.ownerUserId,
          statuses: withStatuses
            ? SAMPLE_STATUSES.slice(0, i % 6).map((s) => ({
                statusId: s.id,
                level: s.hasLevels ? 2 : null,
                appliedByUserId: LAB_USER,
                appliedAt: '2026-10-16T10:00:00Z',
                fromSharedScreen: false,
              }))
            : token.statuses,
        }
      }),
    }
  }, [])
  const pings = usePings(board, LAB_USER)
  const handle = useRef<BoardHandle>(null)
  const inset = Number(params.get('inset') ?? 0)
  const selected = board.tokens.find((token) => token.label === params.get('select'))?.id
  const highlight = useMemo(
    () =>
      params.get('highlight') === 'free'
        ? freeCells(buildGrid(board.map), board.tokens, { id: '', size: 'medium' })
        : undefined,
    [board],
  )
  const arrows = useMemo(
    () =>
      params.getAll('arrow').flatMap((value) => {
        const [label, x, y] = value.split(/[:,]/)
        const token = board.tokens.find((candidate) => candidate.label === label)
        return token ? [{ tokenId: token.id, x: Number(x), y: Number(y) }] : []
      }),
    [board],
  )
  const [log, setLog] = useState('')
  const handlers =
    params.get('handlers') === '1'
      ? {
          onCellTap: (cell: { x: number; y: number }) => setLog(`Feld ${cell.x},${cell.y}`),
          onTokenTap: (token: { label: string }) => setLog(`Figur ${token.label}`),
        }
      : {}

  return (
    <div className="flex h-dvh flex-col">
      {params.get('header') === '1' && (
        <div className="flex h-14 shrink-0 items-center border-b border-line px-4 font-semibold">
          {board.name}
        </div>
      )}
      <Board
        board={board}
        className="min-h-0 flex-1"
        selectedTokenId={selected}
        highlight={highlight}
        arrows={arrows}
        {...handlers}
        slide
        onDoubleTap={(target) => pings.ping(target)}
        onArrow={(from, to, done) => pings.arrow(from, to, done)}
        pings={pings.shown}
        inset={inset ? { bottom: inset } : undefined}
        handleRef={handle}
      />
      <MyCharacterButton
        tokens={board.tokens}
        removedTokens={[]}
        userId={LAB_USER}
        board={handle}
      />
      {inset > 0 && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-line bg-panel/80"
          style={{ height: inset }}
        />
      )}
      {log && (
        <p data-testid="tap-log" className="absolute top-2 left-2 rounded bg-panel px-2 text-sm">
          {log}
        </p>
      )}
    </div>
  )
}
