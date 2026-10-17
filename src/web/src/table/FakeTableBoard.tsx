// A board stand-in for the fight page's tests (`vi.mock('../board/Board', …)`): every
// cell is a button that taps like the canvas board does (the token on it first), and
// the tokens, the selection, the preview, others' move arrows, pings and the info box are
// plain text. `fakeBoard` (fakeBoard.ts) drives what has no button: the second touch of a
// double tap (it takes back the tap before it, then pings) and arrows. "Meine Figur"
// shows as "Mitte: …".
import { useImperativeHandle, useLayoutEffect, useState } from 'react'
import type { BoardProps } from '../board/Board'
import { tokenAt, type GridPoint } from '../board/geometry'
import type { PingTarget } from '../board/pings'
import { fakeBoard } from './fakeBoard'

export function FakeTableBoard({
  board,
  onCellTap,
  onTokenTap,
  selectedTokenId,
  ghost,
  arrows,
  instantTokenIds,
  onTapTakenBack,
  onDoubleTap,
  onArrow,
  pings,
  handleRef,
}: BoardProps) {
  const [info, setInfo] = useState<string | null>(null)
  const [centred, setCentred] = useState<string | null>(null)
  const { width, height } = board.map

  const target = (cell: GridPoint): PingTarget => {
    const token = tokenAt(board.tokens, cell, selectedTokenId)
    return token ? { cell, tokenId: token.id } : { cell }
  }

  // A double tap's second touch takes back the tap before it (the test taps the cell first).
  useLayoutEffect(() => {
    fakeBoard.doubleTap = (cell) => {
      onTapTakenBack?.()
      setInfo(null)
      onDoubleTap?.(target(cell))
    }
    fakeBoard.arrow = (from, to, done) => {
      onTapTakenBack?.()
      setInfo(null)
      onArrow?.(target(from), to, done)
    }
  })

  useImperativeHandle(handleRef, () => ({
    centerOn: (tokenId) =>
      setCentred(board.tokens.find((token) => token.id === tokenId)?.label ?? null),
    fit: () => {},
  }))

  function tap(x: number, y: number) {
    const cell = { x, y }
    const token = tokenAt(board.tokens, cell, selectedTokenId)
    const handled = token ? onTokenTap?.(token, cell) : onCellTap?.(cell)
    setInfo(handled === false ? `Info ${token ? token.label : `${x},${y}`}` : null)
  }

  const label = (tokenId: string) => board.tokens.find((token) => token.id === tokenId)?.label
  const selected = board.tokens.find((token) => token.id === selectedTokenId)
  const ghostToken = ghost && board.tokens.find((token) => token.id === ghost.tokenId)
  return (
    <div data-testid="board">
      <p>{board.name}</p>
      {Array.from({ length: height }, (_, y) =>
        Array.from({ length: width }, (_, x) => (
          <button key={`${x},${y}`} type="button" onClick={() => tap(x, y)}>
            {`Feld ${x},${y}`}
          </button>
        )),
      )}
      <ul aria-label="Figuren">
        {board.tokens.map((token) => (
          <li key={token.id} data-instant={instantTokenIds?.has(token.id) || undefined}>
            {`Figur ${token.label} auf ${token.x},${token.y}`}
          </li>
        ))}
      </ul>
      {selected && <p>{`Ausgewählt: ${selected.label}`}</p>}
      {ghost && ghostToken && <p>{`Vorschau ${ghostToken.label} auf ${ghost.x},${ghost.y}`}</p>}
      {arrows?.map((arrow) => (
        <p key={arrow.tokenId}>{`Pfeil ${label(arrow.tokenId)} nach ${arrow.x},${arrow.y}`}</p>
      ))}
      {pings?.map((ping) => (
        <p key={ping.id}>
          {ping.kind === 'cell'
            ? `Zeigen ${ping.name} auf ${ping.cell.x},${ping.cell.y}`
            : ping.kind === 'token'
              ? `Zeigen ${ping.name} auf ${label(ping.tokenId)}`
              : `Wegpfeil ${ping.name} nach ${ping.to.x},${ping.to.y}${ping.done ? '' : ' (zieht)'}`}
        </p>
      ))}
      {centred && <p>{`Mitte: ${centred}`}</p>}
      {info && <p>{info}</p>}
    </div>
  )
}
