// Encounter mode as a page: the route, the header, the toolbar, undo and the autosave.
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { offlineDb } from '../../offline/db'
import { mockApi, renderApp, testUser } from '../../test/api'
import { de } from '../../text/de'
import { mapWith, roomCells } from '../features/fixtures'
import { CAMPAIGN_ID, seedMap, seedOffline } from '../testing'
import { createEncounter } from './encounters'
import { encounterEditorPath, editorPath } from '../paths'
import { AUTOSAVE_DELAY_MS } from '../useAutosave'

const t = de.encounterEditor
const goblin = { id: 'goblin', creatureTypeId: 'goblin', size: 'small' as const }

beforeEach(() => mockApi({}))

async function seed() {
  await seedOffline()
  const map = await seedMap(mapWith([], roomCells()))
  const encounter = await createEncounter(offlineDb(testUser.id), map)
  return { map, encounter, db: offlineDb(testUser.id) }
}

const toolbar = () => screen.getByRole('navigation', { name: de.editor.toolbar })

describe('encounter mode', () => {
  it('shows the encounter and the map in the header, with only the creature tools', async () => {
    const { map, encounter } = await seed()
    renderApp(encounterEditorPath(CAMPAIGN_ID, map.id, encounter.id))

    expect(await screen.findByLabelText(t.encounterName)).toHaveValue('Klamm')
    expect(screen.getByRole('heading', { name: t.mapOf('Klamm') })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: new RegExp(t.backToMap) })).toHaveAttribute(
      'href',
      editorPath(CAMPAIGN_ID, map.id),
    )
    const tools = Array.from(toolbar().querySelectorAll('button')).map((b) =>
      b.getAttribute('aria-label'),
    )
    expect(tools).toEqual([t.tools.place, t.tools.select])
    // The map can't change: no preview switch, no terrain tools.
    expect(screen.queryByRole('button', { name: de.editor.preview })).not.toBeInTheDocument()
    expect(screen.getByRole('switch', { name: t.ready })).toBeInTheDocument()
  })

  it('renames the encounter and saves it in the browser', async () => {
    const user = userEvent.setup()
    const { map, encounter, db } = await seed()
    renderApp(encounterEditorPath(CAMPAIGN_ID, map.id, encounter.id))
    const name = await screen.findByLabelText(t.encounterName)
    await user.clear(name)
    await user.type(name, '  Hinterhalt am Fluss ')
    await user.tab()
    expect(name).toHaveValue('Hinterhalt am Fluss')
    await waitFor(
      async () => expect((await db.encounters.get(encounter.id))!.name).toBe('Hinterhalt am Fluss'),
      {
        timeout: AUTOSAVE_DELAY_MS * 5,
      },
    )
    const stored = (await db.encounters.get(encounter.id))!
    expect(stored.sync.editCount).toBeGreaterThan(encounter.sync.editCount)
    // The map itself is untouched.
    expect((await db.maps.get(map.id))!.name).toBe('Klamm')
  })

  it('undoes the encounter’s changes with the button and the keys, not the map’s', async () => {
    const user = userEvent.setup()
    const { map, encounter } = await seed()
    renderApp(encounterEditorPath(CAMPAIGN_ID, map.id, encounter.id))
    const name = await screen.findByLabelText(t.encounterName)
    await user.clear(name)
    await user.type(name, 'Neu')
    await user.tab()
    await user.click(screen.getByRole('button', { name: de.editor.undo }))
    expect(screen.getByLabelText(t.encounterName)).toHaveValue('Klamm')
    await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}')
    expect(screen.getByLabelText(t.encounterName)).toHaveValue('Neu')
    await user.keyboard('{Control>}z{/Control}')
    expect(screen.getByLabelText(t.encounterName)).toHaveValue('Klamm')
  })

  it('lists the encounter in map mode and opens it', async () => {
    const user = userEvent.setup()
    const { map, encounter } = await seed()
    renderApp(editorPath(CAMPAIGN_ID, map.id))
    await user.click(await screen.findByRole('link', { name: encounter.name }))
    expect(await screen.findByLabelText(t.encounterName)).toHaveValue('Klamm')
  })

  it('creates an encounter from the map editor and opens it', async () => {
    const user = userEvent.setup()
    const { map, db } = await seed()
    renderApp(editorPath(CAMPAIGN_ID, map.id))
    await user.click(await screen.findByRole('button', { name: t.newEncounter }))
    expect(await screen.findByLabelText(t.encounterName)).toHaveValue('Klamm')
    // The map already had one.
    expect(await db.encounters.count()).toBe(2)
  })

  it('says when the encounter is not on this device or belongs to another map', async () => {
    const { map } = await seed()
    renderApp(encounterEditorPath(CAMPAIGN_ID, map.id, 'unbekannt'))
    expect(await screen.findByRole('heading', { name: t.notFoundTitle })).toBeInTheDocument()
  })

  it('opens an active encounter read-only on the map copy', async () => {
    const { map, encounter, db } = await seed()
    await db.encounters.put({
      ...encounter,
      status: 'active',
      tokens: [{ ...goblin, id: 'a', label: 'Goblin 1', x: 1, y: 1 }],
      // The copy has a different size than the map has now.
      mapCopy: { width: 4, height: 3, layout: mapWith([], roomCells()).layout },
    })
    renderApp(encounterEditorPath(CAMPAIGN_ID, map.id, encounter.id))
    expect(await screen.findByText(t.readOnly(de.encounterStatus.active))).toBeInTheDocument()
    expect(screen.queryByLabelText(t.encounterName)).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: de.editor.toolbar })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: de.editor.undo })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: de.editor.canvasLabel('Klamm') })).toBeInTheDocument()
  })

  it('writes the last change when the page is left before the autosave fires', async () => {
    const user = userEvent.setup()
    const { map, encounter, db } = await seed()
    renderApp(encounterEditorPath(CAMPAIGN_ID, map.id, encounter.id))
    const name = await screen.findByLabelText(t.encounterName)
    await user.clear(name)
    await user.type(name, 'Schnell')
    await user.tab()
    // Leaving the page unmounts the editor, which writes at once.
    cleanup()
    await waitFor(async () => expect((await db.encounters.get(encounter.id))!.name).toBe('Schnell'))
  })
})
