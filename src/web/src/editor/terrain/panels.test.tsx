import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { renderWithEditorStore } from '../testing'
import { resetPaintOptions, usePaintOptions } from './options'
import { ElevationPanel, TerrainPanel } from './panels'

beforeEach(() => resetPaintOptions())

describe('TerrainPanel', () => {
  it('picks the terrain to paint, void as "Leer"', async () => {
    renderWithEditorStore(<TerrainPanel />)
    expect(screen.getByRole('button', { name: /Boden/ })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: /Leer/ }))
    expect(usePaintOptions.getState().terrain).toBe('void')
    expect(screen.getByRole('button', { name: /Leer/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/nimmt Felder aus der Karte/)).toBeInTheDocument()
  })
})

describe('ElevationPanel', () => {
  it('takes German decimals, negative values and the quick buttons', async () => {
    renderWithEditorStore(<ElevationPanel />)
    const input = screen.getByLabelText('Höhe in Metern')
    expect(input).toHaveValue('1,5')

    await userEvent.clear(input)
    await userEvent.type(input, '-4,5')
    expect(usePaintOptions.getState().elevation).toBe(-4.5)

    await userEvent.clear(input)
    await userEvent.type(input, '2.5')
    expect(usePaintOptions.getState().elevation).toBe(2.5)

    await userEvent.click(screen.getByRole('button', { name: '-3 m' }))
    expect(usePaintOptions.getState().elevation).toBe(-3)
    expect(input).toHaveValue('-3')
    expect(screen.getByRole('button', { name: '-3 m' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('says when the value can’t be used and keeps the last good one', async () => {
    renderWithEditorStore(<ElevationPanel />)
    const input = screen.getByLabelText('Höhe in Metern')
    await userEvent.clear(input)
    await userEvent.type(input, '12000')
    expect(screen.getByRole('alert')).toHaveTextContent('unter 10.000 m')
    expect(usePaintOptions.getState().elevation).toBe(1200)
    await userEvent.tab()
    expect(input).toHaveValue('1200')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('follows a value picked on the map', () => {
    renderWithEditorStore(<ElevationPanel />)
    act(() => usePaintOptions.getState().setElevation(-1.5))
    expect(screen.getByLabelText('Höhe in Metern')).toHaveValue('-1,5')
  })
})
