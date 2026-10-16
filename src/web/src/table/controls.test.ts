import { describe, expect, it } from 'vitest'
import type { BoardToken, LayoutCell } from '../api/types'
import { buildGrid } from '../board/geometry'
import {
  IDLE,
  canMoveToken,
  chooseTarget,
  confirmPreview,
  currentControls,
  ownTokensOnTop,
  tapBoard,
  type Controls,
  type TapContext,
} from './controls'

// A 6 × 4 map: a gorge (void) in column 3 with a bridge across row 1, a wall at 5,3.
//   x: 0 1 2 3 4 5
//   y0 . . . v . .
//   y1 . . . B . .
//   y2 . . . v . .
//   y3 . . . v . W
const cells: LayoutCell[] = []
for (let y = 0; y < 4; y++)
  for (let x = 0; x < 6; x++) {
    if (x === 3) continue
    cells.push({ x, y, terrain: x === 5 && y === 3 ? 'wall' : 'floor', elevation: 0 })
  }
const grid = buildGrid({
  width: 6,
  height: 4,
  layout: {
    schemaVersion: 1,
    cells,
    features: [
      {
        id: 'b',
        kind: 'bridge',
        label: 'Brücke',
        x: 3,
        y: 1,
        w: 1,
        h: 1,
        elevation: 0,
        blocksMovement: false,
      },
    ],
    entrances: [],
  },
})

const ME = 'me'

function token(id: string, fields: Partial<BoardToken> = {}): BoardToken {
  return {
    id,
    kind: 'character',
    characterId: `ch-${id}`,
    creatureTypeId: null,
    ownerUserId: ME,
    label: id,
    x: 0,
    y: 0,
    elevation: 0,
    size: 'medium',
    colorIndex: 0,
    version: 0,
    imageUrl: null,
    color: null,
    ...fields,
  }
}

const hero = token('hero', { x: 0, y: 0 })
const friend = token('friend', { x: 1, y: 0, ownerUserId: 'other' })
const goblin = token('goblin', { kind: 'creature', ownerUserId: null, x: 4, y: 0 })
const ogre = token('ogre', { kind: 'creature', ownerUserId: null, size: 'large', x: 4, y: 2 })
const sidekick = token('sidekick', { x: 2, y: 2 })
const tokens = [hero, friend, goblin, ogre, sidekick]

function context(fields: Partial<TapContext> = {}): TapContext {
  return {
    tokens,
    grid,
    canMove: (t) => canMoveToken(t, { isSessionDm: false }, ME),
    enabled: true,
    ...fields,
  }
}

const at = (x: number, y: number, t?: BoardToken) => ({ cell: { x, y }, token: t })

describe('canMoveToken', () => {
  it('lets players move only their own characters and the session DM everything', () => {
    expect(canMoveToken(hero, { isSessionDm: false }, ME)).toBe(true)
    expect(canMoveToken(friend, { isSessionDm: false }, ME)).toBe(false)
    expect(canMoveToken(goblin, { isSessionDm: false }, ME)).toBe(false)
    // A creature has no owner, so even a matching null user can't move it.
    expect(canMoveToken({ kind: 'creature', ownerUserId: ME }, { isSessionDm: false }, ME)).toBe(
      false,
    )
    expect(canMoveToken(friend, { isSessionDm: true }, ME)).toBe(true)
    expect(canMoveToken(goblin, { isSessionDm: true }, ME)).toBe(true)
  })
})

describe('ownTokensOnTop', () => {
  it('draws the person’s own characters last, keeping the order otherwise', () => {
    const order = ownTokensOnTop([hero, friend, goblin, sidekick, ogre], ME).map((t) => t.id)
    expect(order).toEqual(['friend', 'goblin', 'ogre', 'hero', 'sidekick'])
    // The session DM owns no characters here: nothing moves.
    expect(ownTokensOnTop(tokens, 'dm')).toEqual(tokens)
  })
})

describe('chooseTarget', () => {
  it('uses the tapped cell for a 1×1 token, a bridge included, and nothing on void or wall', () => {
    expect(chooseTarget(grid, 'medium', { x: 2, y: 2 })).toEqual({ x: 2, y: 2 })
    expect(chooseTarget(grid, 'medium', { x: 3, y: 1 })).toEqual({ x: 3, y: 1 })
    expect(chooseTarget(grid, 'medium', { x: 3, y: 0 })).toBeNull()
    expect(chooseTarget(grid, 'medium', { x: 5, y: 3 })).toBeNull()
    expect(chooseTarget(grid, 'medium', { x: 9, y: 0 })).toBeNull()
  })

  it('makes the tapped cell the top-left of a larger footprint when it fits', () => {
    expect(chooseTarget(grid, 'large', { x: 0, y: 0 })).toEqual({ x: 0, y: 0 })
  })

  it('tries the other footprints covering the tapped cell in reading order', () => {
    // From (2,0) the footprint would reach the gorge; (1,0) is the first that fits.
    expect(chooseTarget(grid, 'large', { x: 2, y: 0 })).toEqual({ x: 1, y: 0 })
    // From (2,3) it would leave the map; above-left (1,2) comes first in reading order.
    expect(chooseTarget(grid, 'large', { x: 2, y: 3 })).toEqual({ x: 1, y: 2 })
    // Next to the wall at (5,3): only (4,1) fits around (5,2).
    expect(chooseTarget(grid, 'large', { x: 5, y: 2 })).toEqual({ x: 4, y: 1 })
  })

  it('finds nothing when no footprint covering the cell fits', () => {
    // Every 2×2 around the bridge cell touches the gorge.
    expect(chooseTarget(grid, 'large', { x: 3, y: 1 })).toBeNull()
  })
})

describe('tapBoard', () => {
  it('selects a token the person may move, and shows info for anything else', () => {
    expect(tapBoard(IDLE, at(0, 0, hero), context())).toEqual({
      controls: { mode: 'selected', tokenId: 'hero' },
    })
    expect(tapBoard(IDLE, at(1, 0, friend), context())).toEqual({ controls: IDLE, info: true })
    expect(tapBoard(IDLE, at(2, 1), context())).toEqual({ controls: IDLE, info: true })
  })

  it('previews on a cell, moves the preview, and confirms on a second tap', () => {
    const selected: Controls = { mode: 'selected', tokenId: 'hero' }
    const preview = tapBoard(selected, at(2, 1), context()).controls
    expect(preview).toEqual({ mode: 'preview', tokenId: 'hero', target: { x: 2, y: 1 } })

    const moved = tapBoard(preview, at(3, 1), context()).controls
    expect(moved).toEqual({ mode: 'preview', tokenId: 'hero', target: { x: 3, y: 1 } })

    expect(tapBoard(moved, at(3, 1), context())).toEqual({
      controls: IDLE,
      confirm: { tokenId: 'hero', x: 3, y: 1 },
    })
    expect(confirmPreview(moved)).toEqual({ tokenId: 'hero', x: 3, y: 1 })
    expect(confirmPreview(selected)).toBeNull()
  })

  it('confirms a large token’s preview on any cell under it', () => {
    const dm = context({ canMove: () => true })
    const preview = tapBoard({ mode: 'selected', tokenId: 'ogre' }, at(2, 3), dm).controls
    expect(preview).toEqual({ mode: 'preview', tokenId: 'ogre', target: { x: 1, y: 2 } })
    expect(tapBoard(preview, at(1, 3), dm).confirm).toEqual({ tokenId: 'ogre', x: 1, y: 2 })
  })

  it('deselects on the selected token, and targets another token it may move too', () => {
    const selected: Controls = { mode: 'selected', tokenId: 'hero' }
    expect(tapBoard(selected, at(0, 0, hero), context()).controls).toEqual(IDLE)
    // The session DM may move every token, and still stacks them.
    expect(tapBoard(selected, at(2, 2, sidekick), context()).controls).toEqual({
      mode: 'preview',
      tokenId: 'hero',
      target: { x: 2, y: 2 },
    })
  })

  it('in a stack, selects the person’s topmost token and cycles through theirs on each tap', () => {
    // Drawn bottom to top: hero, twin, a friend's character and a goblin, all on 0,0.
    const twin = token('twin')
    const stack = [
      hero,
      twin,
      token('friend', { ownerUserId: 'other' }),
      token('goblin', { kind: 'creature', ownerUserId: null }),
    ]
    const ctx = context({ tokens: stack })
    const tapStack = (controls: Controls) => tapBoard(controls, at(0, 0, stack[3]), ctx).controls

    const first = tapStack(IDLE)
    expect(first).toEqual({ mode: 'selected', tokenId: 'twin' })
    const second = tapStack(first)
    expect(second).toEqual({ mode: 'selected', tokenId: 'hero' })
    expect(tapStack(second)).toEqual(IDLE)

    // From a preview, too: the preview goes with the old selection.
    const preview: Controls = { mode: 'preview', tokenId: 'twin', target: { x: 2, y: 1 } }
    expect(tapStack(preview)).toEqual({ mode: 'selected', tokenId: 'hero' })

    // A stack without any of the person's tokens shows info.
    const theirs = context({ tokens: stack.slice(2) })
    expect(tapBoard(IDLE, at(0, 0, stack[3]), theirs)).toEqual({ controls: IDLE, info: true })
  })

  it('takes a cell with someone else’s token on it as the target', () => {
    const selected: Controls = { mode: 'selected', tokenId: 'hero' }
    expect(tapBoard(selected, at(1, 0, friend), context()).controls).toEqual({
      mode: 'preview',
      tokenId: 'hero',
      target: { x: 1, y: 0 },
    })
  })

  it('stays selected with a hint on a cell the token can’t stand on', () => {
    const preview: Controls = { mode: 'preview', tokenId: 'hero', target: { x: 2, y: 1 } }
    expect(tapBoard(preview, at(3, 0), context())).toEqual({
      controls: preview,
      hint: 'invalidTarget',
    })
  })

  it('does nothing but info while moving is off', () => {
    const off = context({ enabled: false })
    expect(tapBoard(IDLE, at(0, 0, hero), off)).toEqual({
      controls: IDLE,
      info: true,
      hint: 'movingOff',
    })
    expect(tapBoard({ mode: 'selected', tokenId: 'hero' }, at(2, 1), off)).toEqual({
      controls: IDLE,
      info: true,
    })
  })
})

describe('currentControls', () => {
  it('drops the selection when moving goes off or the token is gone', () => {
    const selected: Controls = { mode: 'selected', tokenId: 'hero' }
    expect(currentControls(selected, tokens, true)).toBe(selected)
    expect(currentControls(selected, tokens, false)).toEqual(IDLE)
    expect(currentControls(selected, [friend], true)).toEqual(IDLE)
  })
})
