// The board lab page; see main.tsx for the query parameters.
import { useMemo, useState } from 'react'
import type { BoardState } from '../../api/types'
import { Board } from '../Board'
import { buildGrid, canPlace, cellKey } from '../geometry'

const fixtures = import.meta.glob<{ default: unknown }>('../fixtures/*.board.json', {
  eager: true,
})

function fixture(name: string): BoardState {
  const entry = Object.entries(fixtures).find(([path]) => path.endsWith(`/${name}.board.json`))
  return (entry ?? Object.entries(fixtures)[0]!)[1].default as BoardState
}

function freeCells(board: BoardState): Set<string> {
  const grid = buildGrid(board.map)
  const cells = new Set<string>()
  for (let y = 0; y < board.map.height; y++)
    for (let x = 0; x < board.map.width; x++)
      if (canPlace(grid, board.tokens, 'medium', x, y)) cells.add(cellKey(x, y))
  return cells
}

const params = new URLSearchParams(location.search)

export function Lab() {
  const board = useMemo(() => fixture(params.get('fixture') ?? 'gorge-crossing'), [])
  const selected = board.tokens.find((token) => token.label === params.get('select'))?.id
  const highlight = useMemo(
    () => (params.get('highlight') === 'free' ? freeCells(board) : undefined),
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
        {...handlers}
      />
      {log && (
        <p data-testid="tap-log" className="absolute top-2 left-2 rounded bg-panel px-2 text-sm">
          {log}
        </p>
      )}
    </div>
  )
}
