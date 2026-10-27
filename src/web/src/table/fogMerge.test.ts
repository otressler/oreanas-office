import { describe, expect, it } from 'vitest'
import type { BoardState, BoardToken, FogChangedEvent, MapLayout } from '../api/types'
import { buildGrid } from '../board/geometry'
import { chooseTarget, isValidTarget } from './controls'
import {
  applyAdded,
  applyFogChanged,
  applyRevealed,
  applyTokenHidden,
  mergeFog,
  mergeLayout,
  pruneLayout,
} from './fogMerge'

function token(id: string, extra: Partial<BoardToken> = {}): BoardToken {
  return {
    id,
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
    version: 1,
    imageUrl: null,
    color: null,
    statuses: [],
    dead: false,
    hidden: false,
    ...extra,
  }
}

const floor = (x: number, y: number) => ({ x, y, terrain: 'floor' as const, elevation: 0 })

function board(extra: Partial<BoardState> = {}): BoardState {
  return {
    encounterId: 'e1',
    campaignId: 'c1',
    sessionId: 's1',
    name: 'Krypta',
    status: 'active',
    map: {
      id: 'm1',
      width: 6,
      height: 1,
      layout: {
        schemaVersion: 1,
        cells: [floor(0, 0), floor(1, 0)],
        features: [],
        entrances: [],
      },
    },
    tokens: [],
    isSessionDm: false,
    undoableMove: null,
    removedTokens: [],
    statuses: [],
    people: [],
    viewer: 'player',
    fog: {
      version: 1,
      hiddenCells: [
        { x: 2, y: 0 },
        { x: 3, y: 0 },
      ],
      areas: [],
    },
    playMode: 'devices',
    presence: { people: [], sharedScreen: false },
    ...extra,
  } as unknown as BoardState
}

function event(extra: Partial<FogChangedEvent> = {}): FogChangedEvent {
  return {
    encounterId: 'e1',
    version: 2,
    reveal: true,
    cells: [{ x: 2, y: 0 }],
    revealedLayout: null,
    appeared: [],
    disappeared: [],
    numbered: [],
    ...extra,
  }
}

describe('a fog change', () => {
  it('reveals cells, raises the version and merges the revealed layout for a player', () => {
    const layout: MapLayout = {
      schemaVersion: 1,
      cells: [floor(2, 0)],
      features: [
        {
          id: 'f1',
          kind: 'Säule',
          label: '',
          x: 2,
          y: 0,
          w: 1,
          h: 1,
          elevation: 0,
          blocksMovement: true,
        },
      ],
      entrances: [],
    }
    const next = applyFogChanged(board(), event({ revealedLayout: layout }))
    expect(next.fog?.version).toBe(2)
    expect(next.fog?.hiddenCells).toEqual([{ x: 3, y: 0 }])
    expect(next.map.layout.cells.map((c) => c.x)).toEqual([0, 1, 2])
    expect(next.map.layout.features).toHaveLength(1)
  })

  it('keeps the fog with the higher version', () => {
    const current = board()
    expect(applyFogChanged(current, event({ version: 1 }))).toBe(current)
    expect(applyFogChanged(current, event({ encounterId: 'other' }))).toBe(current)
  })

  it('hides cells again and forgets their layout, except under characters', () => {
    const withLayout = board({
      map: {
        ...board().map,
        layout: {
          schemaVersion: 1,
          cells: [floor(0, 0), floor(1, 0), floor(2, 0)],
          features: [],
          entrances: [],
        },
      },
      tokens: [token('c', { kind: 'character', x: 1, y: 0 })],
    })
    const next = applyFogChanged(
      withLayout,
      event({
        reveal: false,
        cells: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
        ],
      }),
    )
    expect(next.fog?.hiddenCells.map((c) => c.x)).toEqual([0, 1, 2, 3])
    // Cells 0 and 2 are forgotten; cell 1 stays under the character.
    expect(next.map.layout.cells.map((c) => c.x)).toEqual([1])
  })

  it('the session DM keeps the whole layout', () => {
    const dm = board({ viewer: 'dm', isSessionDm: true })
    const next = applyFogChanged(dm, event({ reveal: false, cells: [{ x: 0, y: 0 }] }))
    expect(next.map.layout).toBe(dm.map.layout)
    expect(next.fog?.hiddenCells).toHaveLength(3)
  })

  it('adds the creatures that appeared, removes the ones that went, and applies new numbers', () => {
    const start = board({ tokens: [token('a', { label: 'Goblin' }), token('b')] })
    const next = applyFogChanged(
      start,
      event({
        appeared: [token('n', { label: 'Goblin 1' })],
        disappeared: ['b'],
        numbered: [{ tokenId: 'a', number: 2, label: 'Goblin 2' }],
      }),
    )
    expect(next.tokens.map((t) => [t.id, t.label])).toEqual([
      ['a', 'Goblin 2'],
      ['n', 'Goblin 1'],
    ])
  })

  it('a reload with an older fog loses to the known one', () => {
    const reloaded = board()
    const known = { version: 3, hiddenCells: [{ x: 3, y: 0 }] }
    expect(mergeFog(reloaded, known).fog?.hiddenCells).toEqual([{ x: 3, y: 0 }])
    expect(mergeFog(reloaded, { ...known, version: 1 })).toBe(reloaded)
    expect(mergeFog(reloaded, null)).toBe(reloaded)
  })
})

describe('layout merges', () => {
  it('adds entrance cells to an entrance and replaces features by id', () => {
    const base: MapLayout = {
      schemaVersion: 1,
      cells: [floor(0, 0)],
      features: [],
      entrances: [{ id: 'e1', kind: 'entrance', label: 'Tor', cells: [[0, 0]] }],
    }
    const merged = mergeLayout(base, {
      ...base,
      cells: [floor(1, 0)],
      entrances: [{ id: 'e1', kind: 'entrance', label: 'Tor', cells: [[1, 0]] }],
    })
    expect(merged.entrances[0]!.cells).toEqual([
      [0, 0],
      [1, 0],
    ])
  })

  it('drops an entrance and a feature once all their cells are hidden', () => {
    const layout: MapLayout = {
      schemaVersion: 1,
      cells: [floor(0, 0), floor(1, 0)],
      features: [
        {
          id: 'f',
          kind: 'Tür',
          label: '',
          x: 0,
          y: 0,
          w: 2,
          h: 1,
          elevation: 0,
          blocksMovement: false,
        },
      ],
      entrances: [{ id: 'e1', kind: 'entrance', label: 'Tor', cells: [[0, 0]] }],
    }
    const half = pruneLayout(layout, new Set(['0,0']), [])
    expect(half.features).toHaveLength(1)
    expect(half.entrances).toHaveLength(0)
    expect(pruneLayout(layout, new Set(['0,0', '1,0']), []).features).toHaveLength(0)
  })
})

describe('creatures', () => {
  it('a revealed creature replaces itself in place and loses its hidden flag', () => {
    const dm = board({
      viewer: 'dm',
      tokens: [token('a', { hidden: true }), token('b')],
    })
    const next = applyRevealed(dm, { encounterId: 'e1', token: token('a', { label: 'Goblin 1' }) })
    expect(next.tokens.map((t) => [t.id, t.hidden, t.label])).toEqual([
      ['a', false, 'Goblin 1'],
      ['b', false, 'Goblin'],
    ])
  })

  it('a player gets the revealed creature added', () => {
    const next = applyRevealed(board(), { encounterId: 'e1', token: token('a') })
    expect(next.tokens.map((t) => t.id)).toEqual(['a'])
  })

  it('a hidden creature stays on the DM board see-through and goes from a player board', () => {
    const tokens = [token('a'), token('b')]
    const dm = applyTokenHidden(board({ viewer: 'dm', tokens }), {
      encounterId: 'e1',
      tokenId: 'a',
    })
    expect(dm.tokens.find((t) => t.id === 'a')?.hidden).toBe(true)
    const player = applyTokenHidden(board({ tokens }), { encounterId: 'e1', tokenId: 'a' })
    expect(player.tokens.map((t) => t.id)).toEqual(['b'])
    const same = board({ tokens })
    expect(applyTokenHidden(same, { encounterId: 'e1', tokenId: 'zz' })).toBe(same)
  })

  it('spawned creatures are added once', () => {
    const start = board({ tokens: [token('a')] })
    const next = applyAdded(start, { encounterId: 'e1', tokens: [token('a'), token('b')] })
    expect(next.tokens.map((t) => t.id)).toEqual(['a', 'b'])
  })
})

describe('fog is no target for a player', () => {
  const cells = [0, 1, 2, 3].map((x) => floor(x, 0))
  const grid = buildGrid({
    width: 4,
    height: 1,
    layout: { schemaVersion: 1, cells, features: [], entrances: [] },
  })
  const blocked = new Set(['2,0', '3,0'])

  it('rejects hidden cells, also the ones the character already stands in', () => {
    expect(isValidTarget(grid, 'medium', 1, 0, blocked)).toBe(true)
    expect(isValidTarget(grid, 'medium', 2, 0, blocked)).toBe(false)
    expect(isValidTarget(grid, 'medium', 2, 0)).toBe(true)
  })

  it('a large token cannot use a footprint that reaches into the fog', () => {
    const tall = buildGrid({
      width: 4,
      height: 2,
      layout: {
        schemaVersion: 1,
        cells: [0, 1, 2, 3].flatMap((x) => [floor(x, 0), floor(x, 1)]),
        features: [],
        entrances: [],
      },
    })
    expect(chooseTarget(tall, 'large', { x: 2, y: 0 }, blocked)).toBeNull()
    // Tapping cell 1 moves the footprint left, away from the fog.
    expect(chooseTarget(tall, 'large', { x: 1, y: 0 }, blocked)).toEqual({ x: 0, y: 0 })
    expect(chooseTarget(tall, 'large', { x: 0, y: 0 }, blocked)).toEqual({ x: 0, y: 0 })
  })
})
