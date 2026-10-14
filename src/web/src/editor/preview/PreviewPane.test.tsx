import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { BoardState } from '../../api/types'
import type { BoardProps } from '../../board/Board'
import { buildGrid, cellKey } from '../../board/geometry'
import gorgeFixture from '../../board/fixtures/gorge-crossing.board.json'
import type { EditorMap } from '../model'
import { renderWithEditorStore } from '../testing'
import { PreviewPane } from '.'
import { canStand, previewBoard, standCells, TEST_TOKEN_ID } from './placement'

// The board's latest props; jsdom has no canvas, so the test taps cells through them.
const board = vi.hoisted(() => ({ props: null as BoardProps | null }))
vi.mock('../../board/Board', () => ({
  Board: (props: BoardProps) => {
    board.props = props
    return (
      <div data-testid="board">
        {props.board.tokens.map((token) => (
          <p key={token.id}>{`${token.label} ${token.size} ${token.x},${token.y}`}</p>
        ))}
      </div>
    )
  },
}))

/** The gorge crossing with a wall cell added at 2, 2: the bridge spans x 8–11 at y 5–6. */
function gorge(): EditorMap {
  const map = (gorgeFixture as unknown as BoardState).map
  return {
    name: map.name,
    width: map.width,
    height: map.height,
    layout: {
      ...map.layout,
      cells: map.layout.cells.map((cell) =>
        cell.x === 2 && cell.y === 2 ? { ...cell, terrain: 'wall' as const } : cell,
      ),
    },
    scene: '',
    vibe: '',
    lighting: '',
  }
}

const tap = (x: number, y: number) => act(() => void board.props!.onCellTap!({ x, y }))

describe('preview placement', () => {
  it('lets a token stand on the bridge but not on a wall or in the gorge', () => {
    const grid = buildGrid(gorge())
    expect(canStand(grid, 'medium', 9, 5)).toBe(true)
    expect(canStand(grid, 'medium', 2, 2)).toBe(false)
    expect(canStand(grid, 'medium', 9, 2)).toBe(false)
    expect(canStand(grid, 'medium', 3, 2)).toBe(false) // the menhir blocks
    expect(canStand(grid, 'large', 8, 5)).toBe(true)
    expect(canStand(grid, 'large', 7, 4)).toBe(false) // half over the gorge
    expect(canStand(grid, 'huge', 18, 0)).toBe(false) // over the edge
  })

  it('collects the cells a token’s top-left corner may go to', () => {
    const grid = buildGrid(gorge())
    const cells = standCells(grid, 'large')
    expect(cells.has(cellKey(8, 5))).toBe(true)
    expect(cells.has(cellKey(9, 5))).toBe(true)
    expect(cells.has(cellKey(8, 4))).toBe(false)
    expect(cells.has(cellKey(19, 0))).toBe(false)
  })

  it('builds a board state with the test token at the highest elevation under it', () => {
    const doc = gorge()
    const empty = previewBoard(doc, buildGrid(doc), 'Testfigur', null)
    expect(empty.tokens).toEqual([])
    expect(empty.map).toMatchObject({ width: 20, height: 12, layout: doc.layout })
    const placed = previewBoard(doc, buildGrid(doc), 'Testfigur', { x: 9, y: 5, size: 'small' })
    expect(placed.tokens).toEqual([
      expect.objectContaining({ id: TEST_TOKEN_ID, label: 'Testfigur', x: 9, y: 5, elevation: 0 }),
    ])
  })
})

describe('PreviewPane', () => {
  it('places the test token on the bridge, but not on a wall or in the gorge', async () => {
    renderWithEditorStore(<PreviewPane doc={gorge()} />)
    expect(screen.getByRole('toolbar', { name: 'Testfigur' })).toBeInTheDocument()
    expect(screen.getByLabelText('Größe')).toHaveValue('medium')
    expect(board.props!.highlight!.has(cellKey(9, 5))).toBe(true)
    expect(board.props!.highlight!.has(cellKey(9, 2))).toBe(false)

    tap(9, 5)
    expect(screen.getByText('Testfigur medium 9,5')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Die Testfigur steht auf 9, 5')

    tap(2, 2)
    expect(screen.getByRole('status')).toHaveTextContent('Dort kann die Testfigur nicht stehen.')
    tap(9, 2)
    expect(screen.getByRole('status')).toHaveTextContent('Dort kann die Testfigur nicht stehen.')
    expect(screen.getByText('Testfigur medium 9,5')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Testfigur entfernen' }))
    expect(screen.queryByText(/Testfigur medium/)).not.toBeInTheDocument()
  })

  it('checks the whole footprint for larger sizes', async () => {
    renderWithEditorStore(<PreviewPane doc={gorge()} />)
    tap(9, 6)
    await userEvent.selectOptions(screen.getByLabelText('Größe'), 'large')
    expect(screen.getByRole('status')).toHaveTextContent('In dieser Größe passt')
    expect(screen.queryByText(/^Testfigur \w+ \d/)).not.toBeInTheDocument()

    tap(8, 5)
    expect(screen.getByText('Testfigur large 8,5')).toBeInTheDocument()
    tap(11, 4)
    expect(screen.getByRole('status')).toHaveTextContent('Dort kann die Testfigur nicht stehen.')
  })

  it('renders without the editor store too', () => {
    render(<PreviewPane doc={gorge()} />)
    expect(screen.getByTestId('board')).toBeInTheDocument()
  })
})
