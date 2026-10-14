import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { de } from '../../text/de'
import { emptyMap } from '../model'
import { renderEditor, renderWithEditorStore } from '../testing'
import { ExportButton } from './HeaderItems'
import { MapNameField } from './MapName'
import { ScenePanel } from './ScenePanel'
import { descriptionTool, sceneHeaderItems, sceneStatusItems } from '.'

const t = de.maps.scene

describe('scene panel', () => {
  it('is the panel of the "Beschreibung" tool in the "Karte" group', () => {
    expect(descriptionTool).toMatchObject({ group: 'map', label: t.tool, Panel: ScenePanel })
    expect(sceneHeaderItems).toHaveLength(1)
    expect(sceneStatusItems).toHaveLength(1)
  })

  it('makes one undo step per field visit, not one per keystroke', async () => {
    const user = userEvent.setup()
    const store = renderWithEditorStore(<ScenePanel />)

    await user.type(screen.getByLabelText(t.scene), 'Hängebrücke')
    expect(store.getState().doc.scene).toBe('Hängebrücke')
    await user.type(screen.getByLabelText(t.vibe), 'windig')
    await user.tab()

    expect(store.getState().doc).toMatchObject({ scene: 'Hängebrücke', vibe: 'windig' })
    expect(store.getState().past).toHaveLength(2)

    act(() => store.getState().undo())
    expect(store.getState().doc).toMatchObject({ scene: 'Hängebrücke', vibe: '' })
    expect(screen.getByLabelText(t.vibe)).toHaveValue('')
    act(() => store.getState().undo())
    expect(store.getState().doc.scene).toBe('')
    expect(screen.getByLabelText(t.scene)).toHaveValue('')
  })

  it('makes no undo step for a visit without typing', async () => {
    const user = userEvent.setup()
    const store = renderWithEditorStore(<ScenePanel />)
    await user.click(screen.getByLabelText(t.lighting))
    await user.tab()
    expect(store.getState().past).toHaveLength(0)
    expect(store.getState().gestureBase).toBeNull()
  })

  it('keeps typing when something ended the gesture meanwhile', async () => {
    const user = userEvent.setup()
    const store = renderWithEditorStore(<ScenePanel />)
    const field = screen.getByLabelText(t.lighting)
    await user.type(field, 'Fackel')
    act(() => store.getState().endGesture())
    await user.type(field, 'schein')
    await user.tab()
    expect(store.getState().doc.lighting).toBe('Fackelschein')
    expect(store.getState().past).toHaveLength(2)
  })

  it('limits the texts to what the server keeps', () => {
    renderWithEditorStore(<ScenePanel />)
    expect(screen.getByLabelText(t.scene)).toHaveAttribute('maxLength', '500')
  })
})

describe('map name', () => {
  it('doesn’t save an empty name and keeps the previous one', async () => {
    const user = userEvent.setup()
    const store = renderWithEditorStore(<MapNameField />, emptyMap('Klamm', 4, 4))
    const name = screen.getByLabelText(t.name)

    await user.clear(name)
    expect(name).toHaveValue('')
    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText(t.nameEmpty('Klamm'))).toBeInTheDocument()
    expect(store.getState().doc.name).toBe('Klamm')

    await user.tab()
    expect(name).toHaveValue('Klamm')
    expect(store.getState().past).toHaveLength(0)
  })

  it('renames the map in one undo step and trims the name', async () => {
    const user = userEvent.setup()
    const store = renderWithEditorStore(<MapNameField />, emptyMap('Klamm', 4, 4))
    const name = screen.getByLabelText(t.name)

    await user.clear(name)
    await user.type(name, ' Alte Gruft ')
    expect(store.getState().doc.name).toBe(' Alte Gruft ')
    await user.tab()

    expect(store.getState().doc.name).toBe('Alte Gruft')
    expect(store.getState().past).toHaveLength(1)
    act(() => store.getState().undo())
    expect(name).toHaveValue('Klamm')
  })

  it('limits the name to what the server keeps', () => {
    renderWithEditorStore(<MapNameField />)
    expect(screen.getByLabelText(t.name)).toHaveAttribute('maxLength', '80')
  })

  it('is in the editor header, with the name as the page heading', async () => {
    await renderEditor(emptyMap('Klamm', 6, 4))
    const header = (await screen.findByRole('heading', { name: 'Klamm' })).closest('header')!
    expect(header).toContainElement(screen.getByLabelText(t.name))
    expect(screen.getByLabelText(t.name)).toHaveValue('Klamm')
  })
})

describe('header items', () => {
  it('exports the current map as a file', async () => {
    const user = userEvent.setup()
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:map')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const store = renderWithEditorStore(<ExportButton />, emptyMap('Klamm', 4, 4))
    act(() => store.getState().apply((doc) => ({ ...doc, scene: 'Schlucht' })))

    await user.click(screen.getByRole('button', { name: t.export }))

    expect(click).toHaveBeenCalledTimes(1)
    const blob = create.mock.calls[0]![0] as Blob
    expect(JSON.parse(await blob.text())).toMatchObject({ name: 'Klamm', scene: 'Schlucht' })
  })

  it('marks a map that is only on this device in the status bar, next to the save state', async () => {
    await renderEditor(emptyMap('Klamm', 6, 4))
    const header = (await screen.findByRole('heading', { name: 'Klamm' })).closest('header')!
    const mark = await screen.findByText(de.maps.localOnly)
    expect(header).not.toContainElement(mark)
    expect(mark.parentElement).toContainElement(screen.getByText(de.editor.saved))
    expect(header).toContainElement(screen.getByRole('button', { name: t.export }))
  })
})
