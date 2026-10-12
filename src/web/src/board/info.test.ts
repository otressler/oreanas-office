import { describe, expect, it } from 'vitest'
import type { BoardState } from '../api/types'
import cryptFixture from './fixtures/crypt.board.json'
import gorgeFixture from './fixtures/gorge-crossing.board.json'
import { cellInfo, tokenInfo } from './info'
import { buildScene } from './scene'

const gorge = buildScene((gorgeFixture as BoardState).map)
const crypt = buildScene((cryptFixture as BoardState).map)

describe('cellInfo', () => {
  it('names the terrain and elevation of a plain cell', () => {
    expect(cellInfo(gorge, 1, 1)).toEqual({ title: 'Boden', details: ['Höhe 0 m'] })
  })

  it('names a feature first and the ground under it second', () => {
    expect(cellInfo(gorge, 3, 2)).toEqual({ title: 'Menhir', details: ['Boden', 'Höhe 0 m'] })
  })

  it('names a bridge without the void under it', () => {
    expect(cellInfo(gorge, 9, 5)).toEqual({ title: 'Hängebrücke', details: ['Höhe 0 m'] })
  })

  it('has nothing to say about void or outside the map', () => {
    expect(cellInfo(gorge, 9, 0)).toBeNull()
    expect(cellInfo(gorge, -1, 3)).toBeNull()
    expect(cellInfo(gorge, 20, 3)).toBeNull()
  })

  it('shows the entrance and the elevation in German number format', () => {
    expect(cellInfo(gorge, 0, 5)?.details).toEqual(['Eingang: Waldweg', 'Höhe 0 m'])
    const raised = (cryptFixture as BoardState).map.layout.cells.find(
      (c) => c.elevation === 1.5 && c.terrain !== 'wall',
    )!
    expect(cellInfo(crypt, raised.x, raised.y)?.details).toContain('Höhe 1,5 m')
  })
})

describe('tokenInfo', () => {
  it('shows label, size and elevation', () => {
    expect(tokenInfo({ label: 'Oger 1', size: 'large', elevation: 0 })).toEqual({
      title: 'Oger 1',
      details: ['Groß', 'Höhe 0 m'],
    })
    expect(tokenInfo({ label: 'Krähe', size: 'tiny', elevation: 4.5 }).details).toEqual([
      'Winzig',
      'Höhe 4,5 m',
    ])
  })
})
