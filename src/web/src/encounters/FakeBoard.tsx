// A board stand-in for page tests, with buttons instead of a canvas. It imports
// nothing but types, so `vi.mock('../board/Board', …)` can load it without a cycle.
import type { BoardProps } from '../board/Board'

/**
 * Replaces the canvas board in page tests (`vi.mock('../board/Board', …)`): every
 * highlighted cell and every token is a button.
 */
export function FakeBoard({
  board,
  onCellTap,
  onTokenTap,
  highlight,
  selectedTokenId,
}: BoardProps) {
  return (
    <div data-testid="board">
      <p>{board.name}</p>
      {[...(highlight ?? [])].map((key) => {
        const [x = 0, y = 0] = key.split(',').map(Number)
        return (
          <button key={key} type="button" onClick={() => onCellTap?.({ x, y })}>
            {`Feld ${key}`}
          </button>
        )
      })}
      {board.tokens.map((token) => (
        <button
          key={token.id}
          type="button"
          aria-pressed={token.id === selectedTokenId}
          onClick={() => onTokenTap?.(token, { x: token.x, y: token.y })}
        >
          {`Figur ${token.label} auf ${token.x},${token.y}`}
        </button>
      ))}
    </div>
  )
}
