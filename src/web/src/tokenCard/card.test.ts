import { describe, expect, it } from 'vitest'
import type { BoardToken } from '../api/types'
import { buildScene } from '../board/scene'
import { smallBoard } from '../encounters/testing'
import { de } from '../text/de'
import { showCard, stackRows, tokenKind, tokenMeasures } from './card'

const ME = 'me'
const board = smallBoard()
const scene = buildScene(board.map)
const goblin = board.tokens[0]!

function token(id: string, fields: Partial<BoardToken> = {}): BoardToken {
  return {
    ...goblin,
    id,
    kind: 'character',
    creatureTypeId: null,
    characterId: `ch-${id}`,
    ownerUserId: ME,
    label: id,
    size: 'medium',
    x: 0,
    y: 0,
    ...fields,
  }
}

const canMove = (t: BoardToken) => t.kind === 'character' && t.ownerUserId === ME

describe('showCard', () => {
  it('shows a token with every token on the tapped cell, the movable first', () => {
    // Drawn bottom to top: hero, a goblin, someone else's character.
    const hero = token('hero')
    const ogre = { ...goblin, id: 'ogre', x: 0, y: 0 }
    const friend = token('friend', { ownerUserId: 'other' })
    const tokens = [hero, ogre, friend]
    const shown = showCard({ kind: 'token', tokenId: 'ogre', cell: { x: 0, y: 0 } }, tokens, scene, canMove)
    expect(shown?.kind).toBe('token')
    if (shown?.kind !== 'token') return
    expect(shown.token.id).toBe('ogre')
    expect(shown.rows.map((t) => t.id)).toEqual(['hero', 'friend', 'ogre'])
  })

  it('follows a token that moved away from the tapped cell, and closes when it is gone', () => {
    const hero = token('hero', { x: 2, y: 1 })
    const card = { kind: 'token' as const, tokenId: 'hero', cell: { x: 0, y: 0 } }
    const shown = showCard(card, [hero], scene, canMove)
    expect(shown).toMatchObject({ kind: 'token', cell: { x: 2, y: 1 } })
    expect(showCard(card, [goblin], scene, canMove)).toBeNull()
  })

  it('shows a cell’s terrain, and nothing outside the map', () => {
    expect(showCard({ kind: 'cell', cell: { x: 1, y: 1 } }, [], scene, canMove)).toEqual({
      kind: 'cell',
      cell: { x: 1, y: 1 },
      info: { title: 'Boden', details: ['Höhe 0 m'] },
    })
    expect(showCard({ kind: 'cell', cell: { x: 9, y: 9 } }, [], scene, canMove)).toBeNull()
    expect(showCard(null, [], scene, canMove)).toBeNull()
  })
})

describe('stackRows', () => {
  it('keeps the drawing order within the movable and the other tokens', () => {
    const a = token('a')
    const b = token('b', { ownerUserId: 'other' })
    const c = token('c')
    expect(stackRows([a, b, c], { x: 0, y: 0 }, canMove).map((t) => t.id)).toEqual(['c', 'a', 'b'])
  })
})

describe('tokenKind and tokenMeasures', () => {
  const people = [{ userId: ME, displayName: 'Eli', pingColor: '#4da3ff' }]

  it('names the character’s player, or says creature', () => {
    expect(tokenKind(token('hero'), people)).toBe(de.tokenCard.characterOf('Eli'))
    expect(tokenKind(token('lost', { ownerUserId: 'gone' }), people)).toBe(
      de.tokenCard.characterOf(de.statuses.someone),
    )
    expect(tokenKind(goblin, people)).toBe(de.tokenCard.creature)
  })

  it('gives size and elevation in meters', () => {
    expect(tokenMeasures({ size: 'large', elevation: 1.5 })).toBe('Groß · Höhe 1,5 m')
  })
})
