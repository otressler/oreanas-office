// The preview: the map as the board shows it, with a test token (lane: terrain and
// elevation). Clicking a cell puts the test token there if the stage 4 target check
// passes; the cells its top-left corner may go to are highlighted. Nothing is saved.
// Inside the editor it shows the map's picked background (the "Hintergrund" panel's query)
// while online and as long as it fits the map's size.
import { useContext, useId, useMemo, useState } from 'react'
import type { BoardBackground, CreatureSize } from '../../api/types'
import { Board } from '../../board/Board'
import { buildGrid, placementElevation, type GridPoint } from '../../board/geometry'
import { inputClass } from '../../components/styles'
import { formatElevation } from '../../lib/units'
import { de } from '../../text/de'
import { pickedBoardBackground, useMapBackgrounds } from '../background/backgrounds'
import { EditorTargetContext, type EditorTarget } from '../encounter/store'
import type { EditorMap } from '../model'
import { canStand, previewBoard, standCells, type TestToken } from './placement'

const t = de.editorTerrain.preview

const SIZES = Object.keys(de.sizes) as CreatureSize[]

type Message = { kind: 'placed' | 'blocked'; text: string } | null

export function PreviewPane({ doc }: { doc: EditorMap }) {
  const target = useContext(EditorTargetContext)
  return target ? (
    <WithBackground target={target} doc={doc} />
  ) : (
    <Preview doc={doc} background={null} />
  )
}

/** The preview of a map the server may have pictures for. */
function WithBackground({ target, doc }: { target: EditorTarget; doc: EditorMap }) {
  const { query, enabled } = useMapBackgrounds(target.campaignId, target.mapId)
  const { width, height } = doc
  const data = enabled ? query.data : undefined
  const background = useMemo(
    () => pickedBoardBackground(data, { width, height }),
    [data, width, height],
  )
  return <Preview doc={doc} background={background} />
}

function Preview({ doc, background }: { doc: EditorMap; background: BoardBackground | null }) {
  const grid = useMemo(() => buildGrid(doc), [doc])
  const [size, setSize] = useState<CreatureSize>('medium')
  const [token, setToken] = useState<TestToken | null>(null)
  const [message, setMessage] = useState<Message>(null)
  const sizeId = useId()

  const highlight = useMemo(() => standCells(grid, size), [grid, size])
  // A token from before the map changed stays only where it may still stand.
  const shown = token && canStand(grid, token.size, token.x, token.y) ? token : null
  const board = useMemo(
    () => previewBoard(doc, grid, t.token, shown, background),
    [doc, grid, shown, background],
  )

  const placedText = (next: TestToken) =>
    t.placed(
      next.x,
      next.y,
      de.board.elevation(formatElevation(placementElevation(grid, next.size, next.x, next.y))),
    )

  const place = (cell: GridPoint) => {
    if (!canStand(grid, size, cell.x, cell.y)) {
      setMessage({ kind: 'blocked', text: t.blocked })
      return true
    }
    const next = { x: cell.x, y: cell.y, size }
    setToken(next)
    setMessage({ kind: 'placed', text: placedText(next) })
    return true
  }

  const changeSize = (next: CreatureSize) => {
    setSize(next)
    if (!shown) return
    if (canStand(grid, next, shown.x, shown.y)) {
      const moved = { ...shown, size: next }
      setToken(moved)
      setMessage({ kind: 'placed', text: placedText(moved) })
    } else {
      setToken(null)
      setMessage({ kind: 'blocked', text: t.sizeDoesNotFit })
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        role="toolbar"
        aria-label={t.bar}
        className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-panel/60 px-3 py-2"
      >
        <div className="flex items-center gap-2">
          <label htmlFor={sizeId} className="text-sm text-dim">
            {t.size}
          </label>
          <select
            id={sizeId}
            value={size}
            onChange={(e) => changeSize(e.target.value as CreatureSize)}
            className={`${inputClass} min-h-9 w-auto py-1 text-sm`}
          >
            {SIZES.map((option) => (
              <option key={option} value={option}>
                {de.sizes[option]}
              </option>
            ))}
          </select>
        </div>
        {shown && (
          <button
            type="button"
            onClick={() => {
              setToken(null)
              setMessage(null)
            }}
            className="min-h-9 rounded-lg border border-line px-3 text-sm hover:border-candle"
          >
            {t.remove}
          </button>
        )}
        <p className="min-w-0 flex-1 text-xs text-dim">{t.hint}</p>
        <p
          role="status"
          className={`w-full text-sm ${message?.kind === 'blocked' ? 'text-red-300' : 'text-parchment'}`}
        >
          {message?.text ?? ''}
        </p>
      </div>
      <Board
        board={board}
        highlight={highlight}
        onCellTap={place}
        onTokenTap={(_, cell) => place(cell)}
        className="min-h-0 flex-1"
      />
    </div>
  )
}
