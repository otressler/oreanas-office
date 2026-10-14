import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { offlineDb } from '../offline/db'
import { createMap, getMap } from './maps'
import { emptyMap, type EditorMap } from './model'
import { createEditorStore } from './store'
import { AUTOSAVE_DELAY_MS, useAutosave } from './useAutosave'

const rename = (name: string) => (doc: EditorMap) => ({ ...doc, name })

async function setup() {
  const db = offlineDb('u1')
  const record = await createMap(db, 'c1', emptyMap('Klamm', 10, 8))
  const store = createEditorStore(emptyMap('Klamm', 10, 8), '')
  const hook = renderHook(() => useAutosave(store, db, record.id))
  const stored = () => getMap(db, record.id)
  return { store, hook, stored }
}

describe('useAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('saves a short while after a change', async () => {
    const { store, hook, stored } = await setup()
    act(() => store.getState().apply(rename('A')))
    expect(hook.result.current).toBe('saving')

    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS))
    await vi.waitFor(async () => expect((await stored())?.name).toBe('A'))
    await vi.waitFor(() => expect(hook.result.current).toBe('saved'))
  })

  it('saves undo like any other change', async () => {
    const { store, stored } = await setup()
    act(() => store.getState().apply(rename('A')))
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS))
    act(() => store.getState().undo())
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS))
    await vi.waitFor(async () => expect((await stored())?.name).toBe('Klamm'))
  })

  it('waits for the end of a gesture', async () => {
    const { store, stored } = await setup()
    act(() => {
      store.getState().beginGesture()
      store.getState().updateGesture(rename('A'))
    })
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 3))
    expect((await stored())?.name).toBe('Klamm')

    act(() => store.getState().endGesture())
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS))
    await vi.waitFor(async () => expect((await stored())?.name).toBe('A'))
  })

  it('saves at once when the editor closes', async () => {
    const { store, hook, stored } = await setup()
    act(() => store.getState().apply(rename('A')))
    hook.unmount()
    await vi.waitFor(async () => expect((await stored())?.name).toBe('A'))
  })
})
