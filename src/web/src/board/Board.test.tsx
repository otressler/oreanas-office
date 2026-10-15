// jsdom has no canvas, so the board only mounts its frame here (it measures 0 × 0).
// Pages that contain a board can still be rendered in their tests.
import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { BoardState } from '../api/types'
import { forgetLoadedPictures } from './background'
import { Board } from './Board'
import { forgetTokenPictures } from './tokenPictures'
import gorgeFixture from './fixtures/gorge-crossing.board.json'

describe('Board', () => {
  it('renders its frame and the fit button without a canvas', () => {
    render(<Board board={gorgeFixture as BoardState} className="h-96" />)
    expect(screen.getByTestId('board')).toHaveClass('h-96')
    expect(screen.getByRole('region', { name: 'Kampfkarte: Schluchtübergang' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Ganze Karte' })).toBeEnabled()
  })

  it('keeps the plain rendering until the background picture has loaded', () => {
    const images: { src: string; onload: (() => void) | null }[] = []
    vi.stubGlobal(
      'Image',
      class {
        src = ''
        decoding = ''
        onload: (() => void) | null = null
        onerror: (() => void) | null = null
        constructor() {
          images.push(this)
        }
      },
    )
    forgetLoadedPictures()
    const gorge = gorgeFixture as BoardState
    const board: BoardState = {
      ...gorge,
      map: {
        ...gorge.map,
        background: { assetId: 'a', url: '/api/assets/a', x: 0, y: 0, width: 20, height: 12 },
      },
    }
    const { rerender } = render(<Board board={gorge} />)
    expect(screen.getByTestId('board')).not.toHaveAttribute('data-background')
    rerender(<Board board={board} />)
    expect(screen.getByTestId('board')).toHaveAttribute('data-background', 'plain')
    expect(images[0]!.src).toBe('/api/assets/a')
    act(() => images[0]!.onload!())
    expect(screen.getByTestId('board')).toHaveAttribute('data-background', 'shown')
    forgetLoadedPictures()
  })

  it('loads each token image once, however many tokens show it', () => {
    const images: { src: string; onload: (() => void) | null }[] = []
    vi.stubGlobal(
      'Image',
      class {
        src = ''
        decoding = ''
        onload: (() => void) | null = null
        onerror: (() => void) | null = null
        constructor() {
          images.push(this)
        }
      },
    )
    forgetTokenPictures()
    const gorge = gorgeFixture as BoardState
    const withIcons = (tokens: BoardState['tokens']): BoardState => ({
      ...gorge,
      tokens: tokens.map((token) =>
        token.kind === 'creature'
          ? { ...token, imageUrl: `/api/assets/${token.creatureTypeId}` }
          : token,
      ),
    })
    const board = withIcons(gorge.tokens)
    const types = new Set(
      gorge.tokens.flatMap((t) => (t.kind === 'creature' ? [t.creatureTypeId] : [])),
    )
    const { rerender } = render(<Board board={board} />)
    expect(images.map((image) => image.src).sort()).toEqual(
      [...types].map((id) => `/api/assets/${id}`).sort(),
    )
    // A new board state with the same images asks for nothing more.
    rerender(<Board board={withIcons([...gorge.tokens])} />)
    act(() => images.forEach((image) => image.onload!()))
    rerender(<Board board={withIcons([...gorge.tokens])} />)
    expect(images).toHaveLength(types.size)
    forgetTokenPictures()
  })
})
