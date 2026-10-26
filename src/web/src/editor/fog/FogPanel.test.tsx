import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { FogDocument } from '../../api/types'
import { seedOffline } from '../testing'
import { de } from '../../text/de'
import { PlacePanel, SelectCreaturePanel } from '../encounter/panels'
import { pickType } from '../encounter/picked'
import { emptyEncounter, encounterFixture, renderInEncounter } from '../encounter/testing'
import { placeToken } from '../encounter/tokens'
import { feature, mapWith, roomCells } from '../features/fixtures'
import { FogChecks, FogPanel } from './FogPanel'
import { resetFogOptions, useFogOptions } from './options'

const t = de.fog.editor

beforeEach(async () => {
  resetFogOptions()
  pickType(null)
  await seedOffline()
})

const withFog = (fog: FogDocument) => emptyEncounter({ fog })
const hiddenCells = (f: ReturnType<typeof encounterFixture>) =>
  f.encounter.getState().doc.fog?.hiddenCells

describe('the Nebel panel', () => {
  it('offers to turn fog on while it is off, which hides the whole map', async () => {
    const user = userEvent.setup()
    const f = renderInEncounter(<FogPanel />)
    expect(screen.getByText(t.turnOnHelp)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: t.turnOn }))
    expect(hiddenCells(f)).toHaveLength(80)
    expect(screen.getByText(t.counts(80, 80))).toBeInTheDocument()
  })

  it('turns fog off again', async () => {
    const user = userEvent.setup()
    const f = renderInEncounter(
      <FogPanel />,
      encounterFixture(withFog({ hiddenCells: [[1, 1]], areas: [] })),
    )
    await user.click(screen.getByRole('button', { name: t.turnOff }))
    expect(f.encounter.getState().doc.fog).toBeNull()
    expect(screen.getByRole('button', { name: t.turnOn })).toBeInTheDocument()
  })

  it('reveals all and hides all', async () => {
    const user = userEvent.setup()
    const f = renderInEncounter(
      <FogPanel />,
      encounterFixture(withFog({ hiddenCells: [[1, 1]], areas: [] })),
    )
    expect(screen.getByRole('button', { name: t.hideAll })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: t.revealAll }))
    expect(hiddenCells(f)).toEqual([])
    expect(screen.getByRole('button', { name: t.revealAll })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: t.hideAll }))
    expect(hiddenCells(f)).toHaveLength(80)
    expect(screen.getByRole('button', { name: t.hideAll })).toBeDisabled()
  })

  it('chooses the shape and the effect for the tool', async () => {
    const user = userEvent.setup()
    renderInEncounter(<FogPanel />, encounterFixture(withFog({ hiddenCells: [[1, 1]], areas: [] })))
    await user.click(screen.getByRole('button', { name: t.shapes.rect }))
    await user.click(screen.getByRole('button', { name: t.hide }))
    expect(useFogOptions.getState()).toMatchObject({ shape: 'rect', reveal: false })
    expect(screen.getByRole('button', { name: t.shapes.rect })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('makes an area of the chosen cells, then renames, highlights, redraws and deletes it', async () => {
    const user = userEvent.setup()
    const f = renderInEncounter(
      <FogPanel />,
      encounterFixture(withFog({ hiddenCells: [[1, 1]], areas: [] })),
    )
    const create = () => screen.getByRole('button', { name: t.createArea })
    expect(create()).toBeDisabled()

    act(() => useFogOptions.getState().setSelection(new Set(['1,1', '2,1'])))
    expect(screen.getByText(t.selectionCount(2))).toBeInTheDocument()
    await user.type(screen.getByLabelText(t.areaName), 'Nordkammer')
    await user.click(create())
    const areas = () => f.encounter.getState().doc.fog?.areas
    expect(areas()).toMatchObject([{ id: 'a1', name: 'Nordkammer' }])
    expect(useFogOptions.getState().selection.size).toBe(0)
    expect(screen.getByLabelText(t.areaName)).toHaveValue('')

    // A click on the name highlights it on the canvas, and again takes the highlight away.
    const show = screen.getByRole('button', { name: t.showLabel('Nordkammer') })
    await user.click(show)
    expect(useFogOptions.getState().highlighted).toBe('a1')
    await user.click(show)
    expect(useFogOptions.getState().highlighted).toBeNull()

    await user.click(screen.getByRole('button', { name: t.renameLabel('Nordkammer') }))
    const input = screen.getAllByRole('textbox', { name: t.areaName })[1]!
    expect(input).toHaveFocus()
    await user.clear(input)
    await user.type(input, 'Gruft{Enter}')
    expect(areas()?.[0]?.name).toBe('Gruft')

    expect(screen.getByRole('button', { name: t.redrawLabel('Gruft') })).toBeDisabled()
    act(() => useFogOptions.getState().setSelection(new Set(['4,4'])))
    await user.click(screen.getByRole('button', { name: t.redrawLabel('Gruft') }))
    expect(areas()?.[0]?.cells).toEqual([[4, 4]])

    await user.click(screen.getByRole('button', { name: t.deleteLabel('Gruft') }))
    expect(areas()).toEqual([])
    expect(screen.getByText(t.noAreas)).toBeInTheDocument()
  })

  it('refuses a name of only spaces', async () => {
    const user = userEvent.setup()
    renderInEncounter(<FogPanel />, encounterFixture(withFog({ hiddenCells: [], areas: [] })))
    act(() => useFogOptions.getState().setSelection(new Set(['1,1'])))
    await user.type(screen.getByLabelText(t.areaName), '   ')
    expect(screen.getByText(t.areaNameInvalid)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: t.createArea })).toBeDisabled()
  })

  it('can’t change anything in a read-only encounter', () => {
    const f = encounterFixture(
      withFog({ hiddenCells: [[1, 1]], areas: [{ id: 'a1', name: 'Nord', cells: [[1, 1]] }] }),
      mapWith([], roomCells()),
      { readOnly: true },
    )
    renderInEncounter(<FogPanel />, f)
    expect(screen.getByRole('button', { name: t.revealAll })).toBeDisabled()
    expect(screen.getByRole('button', { name: t.createArea })).toBeDisabled()
    expect(screen.queryByRole('button', { name: t.deleteLabel('Nord') })).not.toBeInTheDocument()
  })
})

describe('the Prüfung note', () => {
  const entrance = (cells: number[][]) => ({
    id: 'e1',
    kind: 'Eingang',
    label: 'Südtor',
    cells,
  })
  const mapWithEntrance = (cells: number[][]) => {
    const map = mapWith([], roomCells())
    return {
      ...map,
      layout: { ...map.layout, entrances: [entrance(cells)] },
    } as unknown as ReturnType<typeof mapWith>
  }

  it('names an entrance that lies entirely in fog', () => {
    renderInEncounter(
      <FogChecks />,
      encounterFixture(withFog({ hiddenCells: [[0, 0]], areas: [] }), mapWithEntrance([[0, 0]])),
    )
    const note = screen.getByRole('region', { name: t.checksTitle })
    expect(within(note).getByText(new RegExp(t.entranceInFog('Südtor')))).toBeInTheDocument()
    expect(within(note).getByText(t.entranceInFogHint)).toBeInTheDocument()
  })

  it('says nothing when a cell of the entrance is revealed', () => {
    renderInEncounter(
      <FogChecks />,
      encounterFixture(
        withFog({ hiddenCells: [[0, 0]], areas: [] }),
        mapWithEntrance([
          [0, 0],
          [1, 0],
        ]),
      ),
    )
    expect(screen.queryByRole('region', { name: t.checksTitle })).not.toBeInTheDocument()
  })

  it('says nothing while fog is off', () => {
    renderInEncounter(<FogChecks />, encounterFixture(emptyEncounter(), mapWithEntrance([[0, 0]])))
    expect(screen.queryByRole('region', { name: t.checksTitle })).not.toBeInTheDocument()
  })
})

describe('hidden creatures in the creature panels', () => {
  const goblin = { id: 'goblin', name: 'Goblin', size: 'small' as const }

  it('"Verborgen platzieren" sets what the place tool does', async () => {
    const user = userEvent.setup()
    renderInEncounter(<PlacePanel />)
    const place = screen.getByRole('switch', { name: t.placeHidden })
    expect(place).not.toBeChecked()
    await user.click(place)
    expect(useFogOptions.getState().placeHidden).toBe(true)
    expect(place).toBeChecked()
  })

  it('the selected creature’s "Verborgen" switch hides and shows it', async () => {
    const user = userEvent.setup()
    const doc = placeToken(emptyEncounter(), goblin, { x: 1, y: 1 }, 't1')
    const f = encounterFixture(doc)
    f.encounter.getState().select('t1')
    renderInEncounter(<SelectCreaturePanel />, f)
    const hidden = screen.getByRole('switch', { name: t.hiddenSwitch })
    expect(hidden).not.toBeChecked()
    await user.click(hidden)
    expect(f.encounter.getState().doc.tokens[0]?.hidden).toBe(true)
    expect(hidden).toBeChecked()
    await user.click(hidden)
    expect(f.encounter.getState().doc.tokens[0]?.hidden).toBeUndefined()
  })

  it('the switch is disabled in a read-only encounter', () => {
    const doc = placeToken(emptyEncounter(), goblin, { x: 1, y: 1 }, 't1', true)
    const f = encounterFixture(doc, mapWith([feature('f', 9, 7)], roomCells()), { readOnly: true })
    f.encounter.getState().select('t1')
    renderInEncounter(<SelectCreaturePanel />, f)
    expect(screen.getByRole('switch', { name: t.hiddenSwitch })).toBeDisabled()
    expect(screen.getByRole('switch', { name: t.hiddenSwitch })).toBeChecked()
  })
})
