// A board stand-in for the fight page's tests (`vi.mock('../board/Board', …)`): every
// cell is a button that taps like the canvas board does (the token on it first), and
// the tokens, the selection, the preview and the info box are plain text.
import { useState } from 'react'
import type { BoardProps } from '../board/Board'
import { tokenAt } from '../board/geometry'

export function FakeTableBoard({
  board,
  onCellTap,
  onTokenTap,
  selectedTokenId,
  ghost,
  instantTokenIds,
}: BoardProps) {
  const [info, setInfo] = useState<string | null>(null)
  const { width, height } = board.map

  function tap(x: number, y: number) {
    const cell = { x, y }
    const token = tokenAt(board.tokens, cell, selectedTokenId)
    const handled = token ? onTokenTap?.(token, cell) : onCellTap?.(cell)
    setInfo(handled === false ? `Info ${token ? token.label : `${x},${y}`}` : null)
  }

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
      {info && <p>{info}</p>}
    </div>
  )
}
