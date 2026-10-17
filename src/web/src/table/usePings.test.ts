import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { vi } from 'vitest'
import type { BoardState, BoardToken } from '../api/types'
import { ARROW_MS, PING_MS } from '../board/pings'
import { smallBoard } from '../encounters/testing'
import { FALLBACK_PING_COLOR, usePings } from './usePings'

const me = 'u-mira'
const other = 'u-oreana'

const ogre: BoardToken = {
  id: 't-ogre',
  kind: 'creature',
  characterId: null,
  creatureTypeId: 'ct-ogre',
  ownerUserId: null,
  label: 'Oger',
  x: 2,
  y: 2,
  elevation: 0,
  size: 'large',
  colorIndex: null,
  version: 0,
  imageUrl: null,
  color: null,
  statuses: [],
  hidden: false,
}

function board(fields: Partial<BoardState> = {}): BoardState {
  const base = smallBoard({ status: 'active' })
  return {
    ...base,
    tokens: [...base.tokens, ogre],
    people: [
      { userId: me, displayName: 'Mira', pingColor: '#4da3ff' },
      { userId: other, displayName: 'Oreana', pingColor: '#d4a017' },
    ],
    ...fields,
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
})
afterEach(() => {
  vi.useRealTimers()
})

describe('usePings', () => {
  it('shows the own ping at once in the person’s colour and returns what to send', () => {
    const { result } = renderHook(() => usePings(board(), me))
    let request: ReturnType<typeof result.current.ping> | undefined
    act(() => {
      request = result.current.ping({ cell: { x: 3, y: 1 } })
    })
    expect(request).toEqual({ cell: { x: 3, y: 1 }, tokenId: null })
    expect(result.current.shown).toEqual([
      expect.objectContaining({
        kind: 'cell',
        cell: { x: 3, y: 1 },
        userId: me,
        name: 'Mira',
        color: '#4da3ff',
      }),
    ])
  })

  it('pings the token rather than the cell when there is one', () => {
    const { result } = renderHook(() => usePings(board(), me))
    let request: ReturnType<typeof result.current.ping> | undefined
    act(() => {
      request = result.current.ping({ cell: { x: 2, y: 2 }, tokenId: ogre.id })
    })
    expect(request).toEqual({ cell: null, tokenId: ogre.id })
    expect(result.current.shown[0]).toMatchObject({ kind: 'token', tokenId: ogre.id })
  })

  it('falls back to white and "Ich" when the board doesn’t list the person', () => {
    const { result } = renderHook(() => usePings(board({ people: [] }), me))
    act(() => {
      result.current.ping({ cell: { x: 0, y: 0 } })
    })
    expect(result.current.shown[0]).toMatchObject({ name: 'Ich', color: FALLBACK_PING_COLOR })
  })

  it('drops a ping when its time is up', () => {
    const { result } = renderHook(() => usePings(board(), me))
    act(() => {
      result.current.ping({ cell: { x: 0, y: 0 } })
    })
    act(() => vi.advanceTimersByTime(PING_MS - 10))
    expect(result.current.shown).toHaveLength(1)
    act(() => vi.advanceTimersByTime(20))
    expect(result.current.shown).toEqual([])
  })

  it('shows others’ pings and arrows from the hub with their names', () => {
    const { result } = renderHook(() => usePings(board(), me))
    act(() => {
      result.current.events.onPinged!({
        encounterId: 'e',
        userId: other,
        color: '#d4a017',
        cell: null,
        tokenId: ogre.id,
      })
      result.current.events.onArrowDrawn!({
        encounterId: 'e',
        userId: other,
        color: '#d4a017',
        fromCell: { x: 0, y: 0 },
        fromTokenId: null,
        to: { x: 4, y: 3 },
      })
    })
    expect(result.current.shown).toEqual([
      expect.objectContaining({
        kind: 'token',
        tokenId: ogre.id,
        name: 'Oreana',
        color: '#d4a017',
      }),
      expect.objectContaining({
        kind: 'arrow',
        from: { cell: { x: 0, y: 0 } },
        to: { x: 4, y: 3 },
        done: true,
        name: 'Oreana',
      }),
    ])
  })

  it('keeps one arrow per person: a new one replaces the old', () => {
    const { result } = renderHook(() => usePings(board(), me))
    const drawn = (to: { x: number; y: number }) => ({
      encounterId: 'e',
      userId: other,
      color: '#d4a017',
      fromCell: null,
      fromTokenId: ogre.id,
      to,
    })
    act(() => {
      result.current.events.onArrowDrawn!(drawn({ x: 0, y: 0 }))
      result.current.events.onArrowDrawn!(drawn({ x: 5, y: 0 }))
    })
    expect(result.current.shown).toHaveLength(1)
    expect(result.current.shown[0]).toMatchObject({
      from: { tokenId: ogre.id },
      to: { x: 5, y: 0 },
    })
  })

  it('shows the own arrow while drawing, sends it on lifting, and keeps it 8 seconds', () => {
    const { result } = renderHook(() => usePings(board(), me))
    let request: ReturnType<typeof result.current.arrow> | undefined
    act(() => {
      request = result.current.arrow({ cell: { x: 0, y: 0 } }, { x: 1, y: 0 }, false)
    })
    expect(request).toBeNull()
    expect(result.current.shown).toEqual([
      expect.objectContaining({ kind: 'arrow', to: { x: 1, y: 0 }, done: false }),
    ])
    // However long the finger stays down, the arrow being drawn stays.
    act(() => vi.advanceTimersByTime(ARROW_MS * 2))
    act(() => {
      request = result.current.arrow({ cell: { x: 0, y: 0 } }, { x: 3, y: 2 }, false)
    })
    act(() => {
      request = result.current.arrow({ cell: { x: 0, y: 0 } }, { x: 4, y: 2 }, true)
    })
    expect(request).toEqual({ fromCell: { x: 0, y: 0 }, fromTokenId: null, to: { x: 4, y: 2 } })
    expect(result.current.shown).toEqual([
      expect.objectContaining({ kind: 'arrow', to: { x: 4, y: 2 }, done: true }),
    ])
    act(() => vi.advanceTimersByTime(ARROW_MS + 10))
    expect(result.current.shown).toEqual([])
  })

  it('sends an arrow from a token with the token', () => {
    const { result } = renderHook(() => usePings(board(), me))
    let request: ReturnType<typeof result.current.arrow> | undefined
    act(() => {
      request = result.current.arrow(
        { cell: { x: 2, y: 2 }, tokenId: ogre.id },
        { x: 5, y: 1 },
        true,
      )
    })
    expect(request).toEqual({ fromCell: null, fromTokenId: ogre.id, to: { x: 5, y: 1 } })
  })

  it('draws and sends nothing for an arrow that ends where it started', () => {
    const { result } = renderHook(() => usePings(board(), me))
    let request: ReturnType<typeof result.current.arrow> | undefined
    act(() => {
      result.current.arrow({ cell: { x: 1, y: 1 } }, { x: 2, y: 1 }, false)
    })
    act(() => {
      request = result.current.arrow({ cell: { x: 1, y: 1 } }, { x: 1, y: 1 }, true)
    })
    expect(request).toBeNull()
    expect(result.current.shown).toEqual([])
    // From a large token: any of its own cells is its start.
    act(() => {
      request = result.current.arrow(
        { cell: { x: 2, y: 2 }, tokenId: ogre.id },
        { x: 3, y: 3 },
        true,
      )
    })
    expect(request).toBeNull()
    expect(result.current.shown).toEqual([])
  })
})
