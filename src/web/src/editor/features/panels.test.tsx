import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { de } from '../../text/de'
import type { EditorStore } from '../store'
import { renderWithEditorStore } from '../testing'
import { feature, floor, mapWith } from './fixtures'
import { placementOptions, resetPlacementOptions } from './options'
import { ChecksPanel, EntranceToolPanel, FeatureToolPanel, SelectPanel } from './panels'

const t = de.editorFeatures

beforeEach(resetPlacementOptions)

const select = (store: EditorStore, kind: 'feature' | 'entrance', id: string) =>
  act(() => store.getState().select({ kind, id }))
const featureOf = (store: EditorStore, id: string) =>
  store.getState().doc.layout.features.find((f) => f.id === id)!

describe('property panel', () => {
  const map = mapWith(
    [feature('f1', 1, 1, 2, 1, { label: 'Alte Säule' }), feature('f2', 4, 1)],
    [floor(0, 2), floor(0, 3)],
    [
      {
        id: 'e1',
        kind: 'entrance',
        label: 'Waldweg',
        cells: [
          [0, 2],
          [0, 3],
        ],
      },
    ],
  )

  it('says what to do while nothing is selected', () => {
    renderWithEditorStore(<SelectPanel />, map)
    expect(screen.getByText(t.selectHelp)).toBeInTheDocument()
  })

  it('edits a feature’s texts as one undo step per field', async () => {
    const user = userEvent.setup()
    const store = renderWithEditorStore(<SelectPanel />, map)
    select(store, 'feature', 'f1')
    expect(screen.getByRole('heading', { name: t.featureTitle('Alte Säule') })).toBeInTheDocument()

    const label = screen.getByLabelText(t.label)
    await user.clear(label)
    await user.type(label, 'Säule am Tor ')
    expect(featureOf(store, 'f1').label).toBe('Säule am Tor ')
    await user.tab()
    // Trimmed on leaving the field, and still one step.
    expect(featureOf(store, 'f1').label).toBe('Säule am Tor')
    expect(store.getState().past).toHaveLength(1)

    act(() => store.getState().undo())
    expect(featureOf(store, 'f1').label).toBe('Alte Säule')
    expect(screen.getByLabelText(t.label)).toHaveValue('Alte Säule')
  })

  it('marks a blank kind', async () => {
    const user = userEvent.setup()
    const store = renderWithEditorStore(<SelectPanel />, map)
    select(store, 'feature', 'f1')
    await user.clear(screen.getByLabelText(t.kind))
    expect(screen.getByLabelText(t.kind)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText(t.kindMissing)).toBeInTheDocument()
  })

  it('reads the elevation in German, negative too', async () => {
    const user = userEvent.setup()
    const store = renderWithEditorStore(<SelectPanel />, map)
    select(store, 'feature', 'f1')
    const elevation = screen.getByLabelText(t.elevation)
    await user.clear(elevation)
    await user.type(elevation, '-1,5')
    expect(featureOf(store, 'f1').elevation).toBe(-1.5)

    await user.clear(elevation)
    await user.type(elevation, 'hoch')
    expect(elevation).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText(t.elevationInvalid)).toBeInTheDocument()
    expect(featureOf(store, 'f1').elevation).toBe(-1.5)

    await user.tab()
    expect(elevation).toHaveValue('-1,5')
    expect(store.getState().past).toHaveLength(1)
  })

  it('changes position and size, but refuses overlaps and the grid’s edge', async () => {
    const user = userEvent.setup()
    const store = renderWithEditorStore(<SelectPanel />, map)
    select(store, 'feature', 'f1')

    const x = screen.getByLabelText(t.x)
    await user.clear(x)
    await user.type(x, '3')
    expect(screen.getByText(t.footprintOverlap)).toBeInTheDocument()
    expect(featureOf(store, 'f1').x).toBe(1)

    await user.clear(x)
    await user.type(x, '5')
    expect(featureOf(store, 'f1').x).toBe(5)
    await user.tab()

    const width = screen.getByLabelText(t.w)
    await user.clear(width)
    await user.type(width, '6')
    expect(screen.getByText(t.footprintOutside)).toBeInTheDocument()
    expect(featureOf(store, 'f1').w).toBe(2)
    await user.clear(width)
    await user.type(width, 'zwei')
    expect(screen.getByText(t.wholeNumber)).toBeInTheDocument()
    await user.tab()
    expect(width).toHaveValue('2')
  })

  it('switches "blocks movement" and deletes the feature', async () => {
    const user = userEvent.setup()
    const store = renderWithEditorStore(<SelectPanel />, map)
    select(store, 'feature', 'f1')
    await user.click(screen.getByLabelText(t.blocksMovement))
    expect(featureOf(store, 'f1').blocksMovement).toBe(false)

    await user.click(screen.getByRole('button', { name: t.delete }))
    expect(store.getState().doc.layout.features.map((f) => f.id)).toEqual(['f2'])
    expect(store.getState().selection).toBeNull()
    expect(screen.getByText(t.selectHelp)).toBeInTheDocument()
  })

  it('edits an entrance’s kind and label and shows its cells', async () => {
    const user = userEvent.setup()
    const store = renderWithEditorStore(<SelectPanel />, map)
    select(store, 'entrance', 'e1')
    expect(screen.getByText(t.cellCount(2))).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText(t.entranceKind), de.board.entranceKinds.exit)
    expect(store.getState().doc.layout.entrances[0]!.kind).toBe('exit')

    const label = screen.getByLabelText(t.label)
    await user.clear(label)
    await user.type(label, 'Brücke')
    await user.tab()
    expect(store.getState().doc.layout.entrances[0]!.label).toBe('Brücke')
    expect(store.getState().past).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: t.delete }))
    expect(store.getState().doc.layout.entrances).toEqual([])
  })
})

describe('tool panels', () => {
  it('presets "blocks movement" from a suggested kind, and the DM can change it', async () => {
    const user = userEvent.setup()
    renderWithEditorStore(<FeatureToolPanel />)
    const kind = screen.getByLabelText(t.kind)
    const blocks = screen.getByLabelText(t.blocksMovement)
    expect(kind).toHaveValue(t.kinds.bridge)
    expect(blocks).not.toBeChecked()

    await user.clear(kind)
    await user.type(kind, 'säule')
    expect(blocks).toBeChecked()
    await user.click(blocks)
    expect(placementOptions.getState().feature).toMatchObject({
      kind: 'säule',
      blocksMovement: false,
    })

    await user.clear(kind)
    expect(screen.getByText(t.kindMissing)).toBeInTheDocument()
    await user.type(kind, 'Treppe')
    expect(blocks).not.toBeChecked()
    await user.type(kind, 'nhaus')
    expect(placementOptions.getState().feature).toMatchObject({
      kind: 'Treppenhaus',
      blocksMovement: false,
    })
  })

  it('picks the kind from the catalog, with its preset', async () => {
    const user = userEvent.setup()
    renderWithEditorStore(<FeatureToolPanel />)
    const catalog = screen.getByRole('region', { name: t.catalog.title })
    expect(within(catalog).getByRole('button', { name: t.kinds.bridge })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await user.click(within(catalog).getByRole('button', { name: t.kinds.sarcophagus }))
    expect(screen.getByLabelText(t.kind)).toHaveValue(t.kinds.sarcophagus)
    expect(screen.getByLabelText(t.blocksMovement)).toBeChecked()
    expect(within(catalog).getByRole('button', { name: t.kinds.sarcophagus })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(within(catalog).getByRole('button', { name: t.kinds.bridge })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('searches the catalog, umlauts too, and takes a search without a match as own kind', async () => {
    const user = userEvent.setup()
    renderWithEditorStore(<FeatureToolPanel />)
    const catalog = screen.getByRole('region', { name: t.catalog.title })
    const search = within(catalog).getByRole('searchbox', { name: t.catalog.search })

    await user.type(search, 'tur')
    const cards = within(catalog)
      .getAllByRole('button', { pressed: false })
      .map((b) => b.getAttribute('aria-label'))
    expect(cards).toEqual([t.kinds.door, t.kinds.trapdoor])
    expect(within(catalog).getByRole('group', { name: t.catalog.groups.passage })).toBeVisible()
    expect(within(catalog).queryByRole('group', { name: t.catalog.groups.fire })).toBeNull()

    await user.clear(search)
    await user.type(search, 'Kristallsäule')
    expect(within(catalog).getByText(t.catalog.noMatch('Kristallsäule'))).toBeInTheDocument()
    await user.click(
      within(catalog).getByRole('button', { name: t.catalog.useCustom('Kristallsäule') }),
    )
    expect(placementOptions.getState().feature.kind).toBe('Kristallsäule')

    // Enter takes the only match.
    await user.clear(search)
    await user.type(search, 'kamin{Enter}')
    expect(placementOptions.getState().feature).toMatchObject({
      kind: t.kinds.fireplace,
      blocksMovement: true,
    })
  })

  it('sets label and elevation for the next feature', async () => {
    const user = userEvent.setup()
    renderWithEditorStore(<FeatureToolPanel />)
    await user.type(screen.getByLabelText(t.label), 'Hängebrücke')
    const elevation = screen.getByLabelText(t.elevation)
    await user.clear(elevation)
    await user.type(elevation, '2,5')
    expect(placementOptions.getState().feature).toMatchObject({
      label: 'Hängebrücke',
      elevation: 2.5,
    })
    await user.clear(elevation)
    await user.type(elevation, 'x')
    expect(screen.getByText(t.elevationInvalid)).toBeInTheDocument()
  })

  it('sets kind and label for the next entrance', async () => {
    const user = userEvent.setup()
    renderWithEditorStore(<EntranceToolPanel />)
    await user.selectOptions(screen.getByLabelText(t.entranceKind), de.board.entranceKinds.both)
    await user.type(screen.getByLabelText(t.label), 'Höhle')
    expect(placementOptions.getState().entrance).toEqual({ kind: 'both', label: 'Höhle' })
  })
})

describe('checks panel', () => {
  it('says when there are no problems', () => {
    renderWithEditorStore(<ChecksPanel />, mapWith([feature('f1', 0, 0)]))
    expect(screen.getByText(t.checks.none)).toBeInTheDocument()
  })

  it('lists the problems and selects what a problem is about', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const store = renderWithEditorStore(
      <ChecksPanel onSelect={onSelect} />,
      mapWith(
        [
          feature('f1', 0, 0, 2, 1, { label: 'Kiste' }),
          feature('f2', 1, 0, 1, 1, { kind: 'Fass' }),
        ],
        [],
        [{ id: 'e1', kind: 'exit', label: '', cells: [[4, 4]] }],
      ),
    )
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    const overlap = screen.getByRole('button', {
      name: t.checks.problems.featureOverlap(t.checks.feature('Fass'), t.checks.feature('Kiste')),
    })
    const exit = t.checks.entranceAt(de.board.entranceKinds.exit, '4, 4')
    expect(
      screen.getByRole('button', { name: t.checks.problems.entranceCellNotOnEdge(exit, '4, 4') }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: t.checks.problems.entranceCellNotWalkable(exit, '4, 4') }),
    ).toBeInTheDocument()

    await user.click(overlap)
    expect(store.getState().selection).toEqual({ kind: 'feature', id: 'f2' })
    expect(store.getState().toolId).toBe('select')
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('names map problems without a button', () => {
    renderWithEditorStore(<ChecksPanel />, { ...mapWith(), name: ' ' })
    expect(screen.getByText(t.checks.problems.nameMissing())).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
