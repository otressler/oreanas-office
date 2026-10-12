// jsdom has no canvas, so the board only mounts its frame here (it measures 0 × 0).
// Pages that contain a board can still be rendered in their tests.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { BoardState } from '../api/types'
import { Board } from './Board'
import gorgeFixture from './fixtures/gorge-crossing.board.json'

describe('Board', () => {
  it('renders its frame and the fit button without a canvas', () => {
    render(<Board board={gorgeFixture as BoardState} className="h-96" />)
    expect(screen.getByTestId('board')).toHaveClass('h-96')
    expect(screen.getByRole('region', { name: 'Kampfkarte: Schluchtübergang' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Ganze Karte' })).toBeEnabled()
  })
})
