import { describe, expect, it } from 'vitest'
import { createEncounterStore } from './store'
import { placeToken, removeToken, renameEncounter, type EncounterDoc } from './tokens'

const doc: EncounterDoc = { name: 'Hinterhalt', status: 'draft', archivedAt: null, tokens: [] }
const goblin = { id: 'goblin', name: 'Goblin', size: 'small' as const }
const meta = { campaignId: 'c1', mapId: 'm1', encounterId: 'e1', readOnly: false }

describe('encounter store', () => {
  it('undoes and redoes changes', () => {
    const s = createEncounterStore(doc, meta)
    s.getState().apply((d) => placeToken(d, goblin, { x: 0, y: 0 }, 't1'))
    s.getState().apply((d) => placeToken(d, goblin, { x: 1, y: 0 }, 't2'))
    expect(s.getState().doc.tokens.map((t) => t.label)).toEqual(['Goblin 1', 'Goblin 2'])

    s.getState().undo()
    expect(s.getState().doc.tokens).toHaveLength(1)
    s.getState().undo()
    s.getState().undo()
    expect(s.getState().doc.tokens).toHaveLength(0)
    s.getState().redo()
    s.getState().redo()
    expect(s.getState().doc.tokens).toHaveLength(2)
  })

  it('drops the redo steps after a new change', () => {
    const s = createEncounterStore(doc, meta)
    s.getState().apply((d) => placeToken(d, goblin, { x: 0, y: 0 }, 't1'))
    s.getState().undo()
    s.getState().apply((d) => renameEncounter(d, 'Anderes'))
    expect(s.getState().future).toEqual([])
    s.getState().redo()
    expect(s.getState().doc.name).toBe('Anderes')
  })

  it('counts every change, undo and redo included, and skips no-ops', () => {
    const s = createEncounterStore(doc, meta)
    s.getState().apply((d) => d)
    expect(s.getState().revision).toBe(0)
    s.getState().apply((d) => placeToken(d, goblin, { x: 0, y: 0 }, 't1'))
    s.getState().undo()
    s.getState().redo()
    expect(s.getState().revision).toBe(3)
    expect(s.getState().past).toHaveLength(1)
  })

  it('keeps the selection only while the token exists', () => {
    const s = createEncounterStore(doc, meta)
    s.getState().apply((d) => placeToken(d, goblin, { x: 0, y: 0 }, 't1'))
    s.getState().select('t1')
    expect(s.getState().selectedId).toBe('t1')
    s.getState().select('nope')
    expect(s.getState().selectedId).toBeNull()
    s.getState().select('t1')
    s.getState().apply((d) => removeToken(d, 't1'))
    expect(s.getState().selectedId).toBeNull()
    s.getState().undo()
    expect(s.getState().selectedId).toBeNull()
  })

  it('does not change a read-only encounter', () => {
    const s = createEncounterStore(doc, { ...meta, readOnly: true })
    s.getState().apply((d) => placeToken(d, goblin, { x: 0, y: 0 }, 't1'))
    expect(s.getState().doc).toBe(doc)
    expect(s.getState().revision).toBe(0)
  })
})
