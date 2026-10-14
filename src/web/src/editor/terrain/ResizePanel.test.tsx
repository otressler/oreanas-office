import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { emptyMap, type EditorMap } from '../model'
import { renderWithEditorStore } from '../testing'
import { parseEdge } from './layout'
import { ResizePanel } from './ResizePanel'

function gorge(): EditorMap {
  const doc = emptyMap('Klamm', 10, 8)
  return {
    ...doc,
    layout: {
      ...doc.layout,
      cells: [{ x: 0, y: 0, terrain: 'floor', elevation: 0 }],
      features: [
        {
          id: 'f1',
          kind: 'bridge',
          label: 'Hängebrücke',
          x: 8,
          y: 3,
          w: 2,
          h: 1,
          elevation: 0,
          blocksMovement: false,
        },
      ],
      entrances: [{ id: 'e1', kind: 'entrance', label: '', cells: [[0, 3]] }],
    },
  }
}

async function setEdge(name: string, value: string) {
  const input = screen.getByLabelText(name)
  await userEvent.clear(input)
  if (value) await userEvent.type(input, value)
}

describe('ResizePanel', () => {
  it('shows the size in cells and meters', () => {
    renderWithEditorStore(<ResizePanel />, gorge())
    expect(screen.getByText('10 × 8 Felder')).toBeInTheDocument()
    expect(screen.getByText('15 m × 12 m')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Größe ändern' })).toBeDisabled()
  })

  it('grows by two columns on the left, then shrinks back; undo brings the bridge back', async () => {
    const store = renderWithEditorStore(<ResizePanel />, gorge())
    await setEdge('Links', '2')
    expect(screen.getByText('Danach: 12 × 8 Felder')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Größe ändern' }))

    let doc = store.getState().doc
    expect([doc.width, doc.height]).toEqual([12, 8])
    expect(doc.layout.cells[0]).toMatchObject({ x: 2, y: 0 })
    expect(doc.layout.features[0]).toMatchObject({ x: 10, y: 3 })
    expect(screen.getByText('12 × 8 Felder')).toBeInTheDocument()
    expect(screen.getByLabelText('Links')).toHaveValue('0')

    await setEdge('Rechts', '-3')
    expect(screen.getByText(/Dabei fällt 1 Objekt weg/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Größe ändern' }))
    doc = store.getState().doc
    expect(doc.width).toBe(9)
    expect(doc.layout.features).toEqual([])
    expect(store.getState().past).toHaveLength(2)

    store.getState().undo()
    expect(store.getState().doc.layout.features).toHaveLength(1)
  })

  it('disables the button outside 1 to 40 cells and for broken numbers', async () => {
    renderWithEditorStore(<ResizePanel />, gorge())
    const button = screen.getByRole('button', { name: 'Größe ändern' })
    await setEdge('Oben', '33')
    expect(screen.getByText('Jede Seite braucht 1 bis 40 Felder.')).toBeInTheDocument()
    expect(button).toBeDisabled()
    await setEdge('Oben', '32')
    expect(button).toBeEnabled()
    await setEdge('Unten', '1,5')
    expect(screen.getByText('Bitte nur ganze Zahlen eingeben.')).toBeInTheDocument()
    expect(button).toBeDisabled()
  })

  it('reads whole numbers only', () => {
    expect(parseEdge('')).toBe(0)
    expect(parseEdge(' -2 ')).toBe(-2)
    expect(parseEdge('−2')).toBe(-2)
    expect(parseEdge('+3')).toBe(3)
    expect(parseEdge('-0')).toBe(0)
    expect(parseEdge('1.5')).toBeNull()
    expect(parseEdge('-')).toBeNull()
    expect(parseEdge('abc')).toBeNull()
  })
})
