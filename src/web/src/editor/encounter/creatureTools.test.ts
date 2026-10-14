import { beforeEach, describe, expect, it } from 'vitest'
import { feature, mapWith, roomCells } from '../features/fixtures'
import { creatureTools, placeTool, selectCreatureTool } from './creatureTools'
import { pickType } from './picked'
import { at, click, dragTo, emptyEncounter, encounterFixture, key } from './testing'
import { placeToken } from './tokens'

const goblin = { id: 'goblin', name: 'Goblin', size: 'small' as const }
const ogre = { id: 'ogre', name: 'Oger', size: 'large' as const }

beforeEach(() => pickType(null))

const labels = (f: ReturnType<typeof encounterFixture>) =>
  f.encounter.getState().doc.tokens.map((t) => t.label)
const overlay = (f: ReturnType<typeof encounterFixture>) => f.map.getState().overlay

describe('creature tools', () => {
  it('registers the placement and select tools with their keys', () => {
    expect(creatureTools.map((t) => [t.id, t.group, t.shortcut])).toEqual([
      ['creature-place', 'creatures', 'k'],
      ['creature-select', 'creatures', 'v'],
    ])
  })
})

describe('place tool', () => {
  it('places a token on the clicked cell, labelled and selected', () => {
    pickType(goblin)
    const f = encounterFixture()
    click(placeTool, f, 3, 2)
    expect(f.encounter.getState().doc.tokens).toMatchObject([
      { label: 'Goblin 1', creatureTypeId: 'goblin', x: 3, y: 2, size: 'small' },
    ])
    expect(f.encounter.getState().selectedId).toBe(f.encounter.getState().doc.tokens[0]!.id)
  })

  it('numbers goblins 1 to 3, and goes on with 4 after removing the second', () => {
    pickType(goblin)
    const f = encounterFixture()
    for (const x of [0, 1, 2]) click(placeTool, f, x, 0)
    expect(labels(f)).toEqual(['Goblin 1', 'Goblin 2', 'Goblin 3'])
    f.encounter.getState().select(f.encounter.getState().doc.tokens[1]!.id)
    expect(key(selectCreatureTool, f, 'Delete')).toBe(true)
    click(placeTool, f, 5, 0)
    expect(labels(f)).toEqual(['Goblin 1', 'Goblin 3', 'Goblin 4'])
  })

  it('places nothing without a picked type', () => {
    const f = encounterFixture()
    click(placeTool, f, 3, 2)
    expect(labels(f)).toEqual([])
    expect(overlay(f)).toEqual([])
  })

  it('shows the footprint on hover, red where the creature may not stand', () => {
    pickType(ogre)
    const f = encounterFixture()
    placeTool.onPointerMove?.(at(2, 2), f.ctx)
    expect(overlay(f)).toEqual([{ kind: 'rect', x: 2, y: 2, w: 2, h: 2, style: 'paint' }])
    placeTool.onPointerMove?.(at(9, 7), f.ctx)
    expect(overlay(f)).toEqual([{ kind: 'rect', x: 9, y: 7, w: 2, h: 2, style: 'invalid' }])
    placeTool.onPointerLeave?.(f.ctx)
    expect(overlay(f)).toEqual([])
  })

  it('refuses outside the map, on walls, void and pillars, and over another creature', () => {
    pickType(goblin)
    const cells = roomCells()
      .filter((c) => !(c.x === 1 && c.y === 0))
      .map((c) => (c.x === 2 && c.y === 0 ? { ...c, terrain: 'wall' as const } : c))
    const f = encounterFixture(emptyEncounter(), mapWith([feature('f1', 3, 0)], cells))
    for (const [x, y] of [
      [10, 0],
      [-1, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ] as const)
      click(placeTool, f, x, y)
    expect(labels(f)).toEqual([])

    click(placeTool, f, 5, 5)
    click(placeTool, f, 5, 5)
    expect(labels(f)).toEqual(['Goblin 1'])
  })

  it('refuses a large creature that would overlap a small one', () => {
    const f = encounterFixture(placeToken(emptyEncounter(), goblin, { x: 4, y: 4 }, 'g1'))
    pickType(ogre)
    click(placeTool, f, 3, 3)
    expect(labels(f)).toEqual(['Goblin 1'])
    click(placeTool, f, 2, 2)
    expect(labels(f)).toEqual(['Goblin 1', 'Oger 1'])
  })

  it('places nothing in a read-only encounter', () => {
    pickType(goblin)
    const f = encounterFixture(emptyEncounter({ status: 'active' }), undefined, { readOnly: true })
    click(placeTool, f, 3, 2)
    expect(labels(f)).toEqual([])
  })

  it('is undone as one step per token', () => {
    pickType(goblin)
    const f = encounterFixture()
    click(placeTool, f, 0, 0)
    click(placeTool, f, 1, 0)
    f.encounter.getState().undo()
    expect(labels(f)).toEqual(['Goblin 1'])
  })
})

describe('select tool', () => {
  const withTwo = () =>
    encounterFixture(
      placeToken(
        placeToken(emptyEncounter(), goblin, { x: 1, y: 1 }, 'a'),
        ogre,
        { x: 4, y: 4 },
        'b',
      ),
    )

  it('selects a token by clicking any cell of its footprint, and clears on empty ground', () => {
    const f = withTwo()
    click(selectCreatureTool, f, 5, 5)
    expect(f.encounter.getState().selectedId).toBe('b')
    click(selectCreatureTool, f, 1, 1)
    expect(f.encounter.getState().selectedId).toBe('a')
    click(selectCreatureTool, f, 8, 1)
    expect(f.encounter.getState().selectedId).toBeNull()
  })

  it('drags a token to a free cell as one undo step', () => {
    const f = withTwo()
    dragTo(selectCreatureTool, f, [1, 1], [2, 3])
    expect(f.encounter.getState().doc.tokens[0]).toMatchObject({ x: 2, y: 3 })
    expect(f.encounter.getState().past).toHaveLength(1)
    f.encounter.getState().undo()
    expect(f.encounter.getState().doc.tokens[0]).toMatchObject({ x: 1, y: 1 })
  })

  it('keeps the grab point: dragging a large token by its second cell', () => {
    const f = withTwo()
    dragTo(selectCreatureTool, f, [5, 5], [7, 5])
    expect(f.encounter.getState().doc.tokens[1]).toMatchObject({ x: 6, y: 4 })
  })

  it('refuses a drop on a wall, off the map or on another creature, and leaves it where it was', () => {
    const f = withTwo()
    dragTo(selectCreatureTool, f, [1, 1], [4, 4])
    dragTo(selectCreatureTool, f, [1, 1], [-3, 1])
    dragTo(selectCreatureTool, f, [4, 4], [9, 7])
    expect(f.encounter.getState().doc.tokens.map((t) => [t.x, t.y])).toEqual([
      [1, 1],
      [4, 4],
    ])
    expect(f.encounter.getState().past).toHaveLength(0)
  })

  it('shows the drop in the overlay while dragging, red when refused', () => {
    const f = withTwo()
    selectCreatureTool.onPointerDown?.(at(1, 1, { pressed: true }), f.ctx)
    selectCreatureTool.onPointerMove?.(at(2, 1, { pressed: true }), f.ctx)
    expect(overlay(f)).toEqual([{ kind: 'rect', x: 2, y: 1, w: 1, h: 1, style: 'paint' }])
    selectCreatureTool.onPointerMove?.(at(4, 4, { pressed: true }), f.ctx)
    expect(overlay(f)[0]).toMatchObject({ style: 'invalid' })
    key(selectCreatureTool, f, 'Escape')
    expect(overlay(f)).toEqual([])
  })

  it('removes the selected token with Delete or Backspace, and clears the selection with Escape', () => {
    const f = withTwo()
    click(selectCreatureTool, f, 1, 1)
    expect(key(selectCreatureTool, f, 'Backspace')).toBe(true)
    expect(f.encounter.getState().doc.tokens.map((t) => t.id)).toEqual(['b'])
    expect(key(selectCreatureTool, f, 'Delete')).toBe(false)
    click(selectCreatureTool, f, 5, 5)
    expect(key(selectCreatureTool, f, 'Escape')).toBe(true)
    expect(f.encounter.getState().selectedId).toBeNull()
    expect(key(selectCreatureTool, f, 'Escape')).toBe(false)
  })

  it('leaves a read-only encounter as it is', () => {
    const f = encounterFixture(
      { ...placeToken(emptyEncounter({ status: 'ended' }), goblin, { x: 1, y: 1 }, 'a') },
      undefined,
      { readOnly: true },
    )
    click(selectCreatureTool, f, 1, 1)
    expect(f.encounter.getState().selectedId).toBe('a')
    dragTo(selectCreatureTool, f, [1, 1], [2, 2])
    expect(key(selectCreatureTool, f, 'Delete')).toBe(false)
    expect(f.encounter.getState().doc.tokens[0]).toMatchObject({ x: 1, y: 1 })
  })
})
