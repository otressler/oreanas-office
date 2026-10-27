// Draft (confirm bar state), fade, visibility and label rules of fog of war.
import { describe, expect, it } from 'vitest'
import type { BoardToken, FogArea } from '../api/types'
import {
  barOpen,
  changingCells,
  chooseArea,
  NEW_DRAFT,
  pickDirection,
  pickTool,
  tapFog,
  type FogDraft,
  type FogMap,
} from './draft'
import { FOG_FADE_MS, fadesRunning, fogOpacity, NO_FADES, startFades } from './fade'
import { hasNumber, labelWithoutNumber } from './labels'
import { tokensForPlayers, visibleToPlayers } from './visibility'

const key = (x: number, y: number) => `${x},${y}`
const set = (...pairs: [number, number][]) => new Set(pairs.map(([x, y]) => key(x, y)))

const playable = new Set<string>()
for (let y = 0; y < 5; y++) for (let x = 0; x < 6; x++) playable.add(key(x, y))
const north: FogArea = {
  id: 'a1',
  name: 'Nordkammer',
  cells: [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ],
}
const hall: FogArea = {
  id: 'a2',
  name: 'Halle',
  cells: [
    [1, 1],
    [2, 1],
  ],
}
const map: FogMap = { width: 6, height: 5, playable, areas: [north, hall] }

describe('the fog draft', () => {
  it('the brush toggles the tapped cells and ignores void', () => {
    let draft: FogDraft = pickTool(NEW_DRAFT, 'brush')
    draft = tapFog(draft, { x: 1, y: 1 }, map)
    draft = tapFog(draft, { x: 2, y: 1 }, map)
    expect(draft.cells).toEqual(set([1, 1], [2, 1]))
    draft = tapFog(draft, { x: 1, y: 1 }, map)
    expect(draft.cells).toEqual(set([2, 1]))
    expect(tapFog(draft, { x: 9, y: 9 }, map)).toBe(draft)
  })

  it('the rectangle waits for its second corner', () => {
    let draft = pickTool(NEW_DRAFT, 'rect')
    draft = tapFog(draft, { x: 1, y: 1 }, map)
    expect(draft.corner).toEqual({ x: 1, y: 1 })
    expect(draft.cells).toEqual(set([1, 1]))
    draft = tapFog(draft, { x: 2, y: 2 }, map)
    expect(draft.corner).toBeNull()
    expect(draft.cells).toEqual(set([1, 1], [2, 1], [1, 2], [2, 2]))
  })

  it('an area tap takes the only area, or asks which of several', () => {
    let draft = pickTool(NEW_DRAFT, 'area')
    draft = tapFog(draft, { x: 0, y: 0 }, map)
    expect(draft.cells).toEqual(set([0, 0], [1, 0], [0, 1], [1, 1]))
    expect(draft.choose).toBeNull()

    draft = tapFog(pickTool(NEW_DRAFT, 'area'), { x: 1, y: 1 }, map)
    expect(draft.choose?.areas.map((a) => a.id)).toEqual(['a1', 'a2'])
    // Nothing is chosen, so no confirm bar yet.
    expect(barOpen(draft)).toBe(false)
    draft = chooseArea(draft, hall)
    expect(draft.cells).toEqual(set([1, 1], [2, 1]))
    expect(barOpen(draft)).toBe(true)

    // A cell in no area changes nothing.
    expect(tapFog(pickTool(NEW_DRAFT, 'area'), { x: 5, y: 4 }, map).cells.size).toBe(0)
  })

  it('switching the tool drops the choice, switching the direction keeps it', () => {
    let draft = tapFog(pickTool(NEW_DRAFT, 'brush'), { x: 0, y: 0 }, map)
    expect(pickDirection(draft, false).cells).toBe(draft.cells)
    draft = pickTool(draft, 'rect')
    expect(draft.cells.size).toBe(0)
    expect(pickTool(draft, 'rect')).toBe(draft)
  })

  it('counts only cells that would change', () => {
    const hidden = set([0, 0], [1, 0])
    const draft = { ...NEW_DRAFT, cells: set([0, 0], [1, 0], [2, 0]), reveal: true }
    expect(changingCells(draft, hidden)).toEqual(set([0, 0], [1, 0]))
    expect(changingCells({ ...draft, reveal: false }, hidden)).toEqual(set([2, 0]))
  })
})

describe('fog fades', () => {
  it('starts a fade per changed cell and fades the fog away over revealed cells', () => {
    const fades = startFades(NO_FADES, set([0, 0], [1, 0]), set([1, 0], [2, 0]), 1000)
    expect(fades.get(key(0, 0))).toEqual({ start: 1000, reveal: true })
    expect(fades.get(key(2, 0))).toEqual({ start: 1000, reveal: false })
    expect(fogOpacity(false, fades.get(key(0, 0)), 1000)).toBe(1)
    expect(fogOpacity(false, fades.get(key(0, 0)), 1000 + FOG_FADE_MS / 2)).toBeCloseTo(0.5)
    expect(fogOpacity(false, fades.get(key(0, 0)), 1000 + FOG_FADE_MS)).toBe(0)
    // Hidden again: the fog fades in.
    expect(fogOpacity(true, fades.get(key(2, 0)), 1000)).toBe(0)
    expect(fogOpacity(true, fades.get(key(2, 0)), 1000 + FOG_FADE_MS)).toBe(1)
  })

  it('has no fade for a steady cell and shows changes at once without motion', () => {
    expect(fogOpacity(true, undefined, 0)).toBe(1)
    expect(fogOpacity(false, undefined, 0)).toBe(0)
    expect(startFades(NO_FADES, set([0, 0]), set(), 0, false)).toBe(NO_FADES)
  })

  it('keeps the fades when nothing changed and drops finished ones on the next change', () => {
    const first = startFades(NO_FADES, set([0, 0]), set(), 0)
    expect(startFades(first, set(), set(), 100)).toBe(first)
    const second = startFades(first, set(), set([4, 4]), FOG_FADE_MS + 10)
    expect(second.has(key(0, 0))).toBe(false)
    expect(second.has(key(4, 4))).toBe(true)
    expect(fadesRunning(first, FOG_FADE_MS - 1)).toBe(true)
    expect(fadesRunning(first, FOG_FADE_MS)).toBe(false)
  })
})

function token(extra: Partial<BoardToken> = {}): BoardToken {
  return {
    id: 't1',
    kind: 'creature',
    characterId: null,
    creatureTypeId: 'goblin',
    ownerUserId: null,
    label: 'Goblin',
    x: 0,
    y: 0,
    elevation: 0,
    size: 'medium',
    colorIndex: null,
    version: 0,
    imageUrl: null,
    color: null,
    statuses: [],
    hidden: false,
    dead: false,
    ...extra,
  }
}

describe('what players see', () => {
  const fog = set([0, 0], [1, 0], [0, 1], [1, 1])

  it('characters are always visible, also in the fog', () => {
    expect(visibleToPlayers(token({ kind: 'character' }), fog)).toBe(true)
    expect(visibleToPlayers(token({ kind: 'character', hidden: true }), fog)).toBe(true)
  })

  it('a creature needs to be unhidden and to stand on a revealed cell', () => {
    expect(visibleToPlayers(token({ x: 3, y: 3 }), fog)).toBe(true)
    expect(visibleToPlayers(token({ x: 0, y: 0 }), fog)).toBe(false)
    expect(visibleToPlayers(token({ x: 3, y: 3, hidden: true }), fog)).toBe(false)
    expect(visibleToPlayers(token({ x: 0, y: 0 }), new Set())).toBe(true)
  })

  it('a large creature is visible when one cell of its footprint is revealed', () => {
    expect(visibleToPlayers(token({ size: 'large', x: 1, y: 1 }), fog)).toBe(true)
    expect(
      visibleToPlayers(token({ size: 'large', x: 0, y: 0 }), set([0, 0], [1, 0], [0, 1], [1, 1])),
    ).toBe(false)
  })

  it('filters a list, keeping the same array when all are visible', () => {
    const tokens = [token({ id: 'a', x: 3, y: 3 }), token({ id: 'b', x: 0, y: 0 })]
    expect(tokensForPlayers(tokens, fog).map((t) => t.id)).toEqual(['a'])
    const visible = [tokens[0]!]
    expect(tokensForPlayers(visible, fog)).toBe(visible)
  })
})

describe('labels without numbers', () => {
  it('drops the number of a label the type named', () => {
    expect(labelWithoutNumber('Goblin 3', 'Goblin')).toBe('Goblin')
    expect(labelWithoutNumber('Goblin 3')).toBe('Goblin')
    expect(labelWithoutNumber('Riesenspinne 12', 'Riesenspinne')).toBe('Riesenspinne')
  })

  it('keeps a label the DM renamed, and one without a number', () => {
    expect(labelWithoutNumber('Häuptling 2', 'Goblin')).toBe('Häuptling 2')
    expect(labelWithoutNumber('Häuptling', 'Goblin')).toBe('Häuptling')
    expect(hasNumber('Goblin 3')).toBe(true)
    expect(hasNumber('Goblin')).toBe(false)
  })
})
