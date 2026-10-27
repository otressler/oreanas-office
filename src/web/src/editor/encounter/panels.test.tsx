import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCreatureType } from '../../bestiary/creatureTypes'
import { offlineDb } from '../../offline/db'
import { mockApi, json, testUser } from '../../test/api'
import { de } from '../../text/de'
import { feature, mapWith, roomCells } from '../features/fixtures'
import { seedOffline, CAMPAIGN_ID, SESSION_ID } from '../testing'
import { EncounterListPanel } from './EncounterListPanel'
import { createEncounter, listEncounters } from './encounters'
import { EncounterPanel, PlacePanel, SelectCreaturePanel } from './panels'
import { pickedType, pickType } from './picked'
import { emptyEncounter, encounterFixture, MAP_ID, renderInEncounter } from './testing'
import { placeToken } from './tokens'

const t = de.encounterEditor
const b = de.bestiary

const goblin = { id: 'goblin', name: 'Goblin', size: 'small' as const }

beforeEach(async () => {
  pickType(null)
  await seedOffline()
})

const dbOf = () => offlineDb(testUser.id)

describe('placement panel', () => {
  it('creates a type while placing and picks it', async () => {
    const user = userEvent.setup()
    renderInEncounter(<PlacePanel />)
    expect(screen.getByText(t.placePickFirst)).toBeInTheDocument()

    await user.click(await screen.findByRole('button', { name: b.newType }))
    const dialog = await screen.findByRole('dialog', { name: b.newTitle })
    await user.type(within(dialog).getByLabelText(b.name), 'Goblin')
    await user.selectOptions(within(dialog).getByLabelText(b.size), b.sizeOption(de.sizes.small, 1))
    await user.click(within(dialog).getByRole('button', { name: de.sheet.saveChanges }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await waitFor(() =>
      expect(screen.getByRole('button', { name: b.pick('Goblin') })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    )
    expect(pickedType.getState().type).toMatchObject({ name: 'Goblin', size: 'small' })
    expect(screen.getByText(t.placeHelp('Goblin'))).toBeInTheDocument()
  })

  it('says when the name is taken, ignoring case', async () => {
    const user = userEvent.setup()
    await createCreatureType(dbOf(), CAMPAIGN_ID, {
      name: 'Goblin',
      size: 'small',
      appearance: '',
      notes: '',
      initiativeModifier: 0,
      initiativeRollMode: 'normal',
    })
    renderInEncounter(<PlacePanel />)
    await user.click(await screen.findByRole('button', { name: b.newType }))
    await user.type(await screen.findByLabelText(b.name), ' goblin')
    expect(screen.getAllByText(b.problems.nameTaken).length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: de.sheet.saveChanges }))
    expect(screen.getByRole('dialog', { name: b.newTitle })).toBeInTheDocument()
    expect(await dbOf().creatureTypes.count()).toBe(1)
  })

  it('lists types to pick from, and edits one', async () => {
    const user = userEvent.setup()
    await createCreatureType(dbOf(), CAMPAIGN_ID, {
      name: 'Wolf',
      size: 'medium',
      appearance: '',
      notes: '',
      initiativeModifier: 0,
      initiativeRollMode: 'normal',
    })
    await createCreatureType(dbOf(), CAMPAIGN_ID, {
      name: 'Ork',
      size: 'large',
      appearance: '',
      notes: '',
      initiativeModifier: 0,
      initiativeRollMode: 'normal',
    })
    renderInEncounter(<PlacePanel />)
    const ork = await screen.findByRole('button', { name: b.pick('Ork') })
    const names = screen.getAllByRole('button', { name: /wählen$/ }).map((e) => e.textContent)
    expect(names[0]).toContain('Ork')
    await user.click(ork)
    expect(pickedType.getState().type).toMatchObject({ name: 'Ork', size: 'large' })

    await user.click(screen.getByRole('button', { name: b.edit('Ork') }))
    const dialog = await screen.findByRole('dialog', { name: b.editTitle('Ork') })
    const name = within(dialog).getByLabelText(b.name)
    await user.clear(name)
    await user.type(name, 'Oger')
    await user.selectOptions(within(dialog).getByLabelText(b.size), b.sizeOption(de.sizes.huge, 3))
    await user.click(within(dialog).getByRole('button', { name: de.sheet.saveChanges }))
    // The pick follows the type, and the dialog closes.
    await waitFor(() =>
      expect(pickedType.getState().type).toMatchObject({ name: 'Oger', size: 'huge' }),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('asks before closing the dialog with unsaved changes', async () => {
    const user = userEvent.setup()
    await createCreatureType(dbOf(), CAMPAIGN_ID, {
      name: 'Wolf',
      size: 'medium',
      appearance: '',
      notes: '',
      initiativeModifier: 0,
      initiativeRollMode: 'normal',
    })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderInEncounter(<PlacePanel />)
    await user.click(await screen.findByRole('button', { name: b.edit('Wolf') }))
    const dialog = await screen.findByRole('dialog', { name: b.editTitle('Wolf') })
    await user.type(within(dialog).getByLabelText(b.name), 'srudel')

    await user.keyboard('{Escape}')
    expect(confirm).toHaveBeenCalledWith(b.dialogDiscard)
    expect(dialog).toBeInTheDocument()
    confirm.mockReturnValue(true)
    await user.click(within(dialog).getByRole('button', { name: de.sync.close }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect((await dbOf().creatureTypes.toArray())[0]?.name).toBe('Wolf')
  })

  it('archives a type: not pickable any more, and brought back from the collapsed part', async () => {
    const user = userEvent.setup()
    await createCreatureType(dbOf(), CAMPAIGN_ID, {
      name: 'Wolf',
      size: 'medium',
      appearance: '',
      notes: '',
      initiativeModifier: 0,
      initiativeRollMode: 'normal',
    })
    renderInEncounter(<PlacePanel />)
    await user.click(await screen.findByRole('button', { name: b.pick('Wolf') }))
    await user.click(screen.getByRole('button', { name: b.edit('Wolf') }))
    const dialog = await screen.findByRole('dialog', { name: b.editTitle('Wolf') })
    await user.click(within(dialog).getByRole('button', { name: b.archive }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: b.pick('Wolf') })).not.toBeInTheDocument(),
    )
    expect(pickedType.getState().type).toBeNull()
    const summary = screen.getByText(b.archived(1))
    expect(summary.closest('details')).not.toHaveAttribute('open')

    await user.click(summary)
    await user.click(screen.getByRole('button', { name: b.restoreLabel('Wolf') }))
    expect(await screen.findByRole('button', { name: b.pick('Wolf') })).toBeInTheDocument()
    expect(await dbOf().creatureTypes.count()).toBe(1)
  })
})

describe('select panel', () => {
  const withGoblin = () =>
    encounterFixture(placeToken(emptyEncounter(), goblin, { x: 1, y: 1 }, 'a'))

  it('asks for a selection first', () => {
    renderInEncounter(<SelectCreaturePanel />, withGoblin())
    expect(screen.getByText(t.selectHelp)).toBeInTheDocument()
  })

  it('renames the selected token on leaving the field, trimmed, as one undo step', async () => {
    const user = userEvent.setup()
    const f = withGoblin()
    renderInEncounter(<SelectCreaturePanel />, f)
    act(() => f.encounter.getState().select('a'))
    const label = screen.getByLabelText(t.label)
    expect(label).toHaveValue('Goblin 1')
    await user.clear(label)
    await user.type(label, '  Grisk ')
    await user.tab()
    expect(f.encounter.getState().doc.tokens[0]!.label).toBe('Grisk')
    expect(f.encounter.getState().past).toHaveLength(1)
  })

  it('keeps the old label for an empty one', async () => {
    const user = userEvent.setup()
    const f = withGoblin()
    renderInEncounter(<SelectCreaturePanel />, f)
    act(() => f.encounter.getState().select('a'))
    const label = screen.getByLabelText(t.label)
    await user.clear(label)
    expect(screen.getByText(t.labelInvalid)).toBeInTheDocument()
    await user.tab()
    expect(f.encounter.getState().doc.tokens[0]!.label).toBe('Goblin 1')
    expect(screen.getByLabelText(t.label)).toHaveValue('Goblin 1')
  })

  it('gives the creature its own starting hit points, and empty hands them back', async () => {
    const user = userEvent.setup()
    const f = withGoblin()
    renderInEncounter(<SelectCreaturePanel />, f)
    act(() => f.encounter.getState().select('a'))
    const field = screen.getByLabelText(t.hitPoints)
    expect(field).toHaveValue(null)
    await user.type(field, '1000')
    expect(screen.getByText(t.hitPointsInvalid)).toBeInTheDocument()
    await user.clear(field)
    await user.type(field, '12')
    expect(f.encounter.getState().doc.tokens[0]!.maxHitPoints).toBe(12)
    await user.clear(field)
    expect(f.encounter.getState().doc.tokens[0]).not.toHaveProperty('maxHitPoints')
  })

  it('removes the token with the button', async () => {
    const user = userEvent.setup()
    const f = withGoblin()
    renderInEncounter(<SelectCreaturePanel />, f)
    act(() => f.encounter.getState().select('a'))
    await user.click(screen.getByRole('button', { name: t.remove }))
    expect(f.encounter.getState().doc.tokens).toEqual([])
    expect(screen.getByText(t.selectHelp)).toBeInTheDocument()
  })
})

describe('encounter panel', () => {
  const room = mapWith([], roomCells())
  const ready = () => screen.getByRole('switch', { name: t.ready })

  it('sets ready by hand when every creature stands validly', async () => {
    const user = userEvent.setup()
    const f = encounterFixture(placeToken(emptyEncounter(), goblin, { x: 1, y: 1 }, 'a'), room)
    renderInEncounter(<EncounterPanel />, f)
    expect(ready()).not.toBeChecked()
    await user.click(ready())
    expect(f.encounter.getState().doc.status).toBe('ready')
    await user.click(ready())
    expect(f.encounter.getState().doc.status).toBe('draft')
  })

  it('can’t be ready while a creature stands on a wall, and names it', () => {
    const f = encounterFixture(
      placeToken(emptyEncounter(), goblin, { x: 2, y: 2 }, 'a'),
      mapWith([feature('f1', 2, 2)], roomCells()),
    )
    renderInEncounter(<EncounterPanel />, f)
    expect(ready()).toBeDisabled()
    expect(screen.getByText(t.readyMisplaced('Goblin 1'))).toBeInTheDocument()
  })

  it('flags a ready encounter whose map changed, and keeps it ready', () => {
    const f = encounterFixture(
      placeToken(emptyEncounter({ status: 'ready' }), goblin, { x: 2, y: 2 }, 'a'),
      mapWith([feature('f1', 2, 2)], roomCells()),
    )
    renderInEncounter(<EncounterPanel />, f)
    expect(ready()).toBeChecked()
    expect(screen.getByRole('alert')).toHaveTextContent(t.readyBroken('Goblin 1'))
    expect(f.encounter.getState().doc.status).toBe('ready')
  })

  it('archives and brings the encounter back; an archived one can’t be ready', async () => {
    const user = userEvent.setup()
    const f = encounterFixture(emptyEncounter(), room)
    renderInEncounter(<EncounterPanel />, f)
    await user.click(screen.getByRole('button', { name: t.archive }))
    expect(f.encounter.getState().doc.archivedAt).not.toBeNull()
    expect(ready()).toBeDisabled()
    expect(screen.getByText(t.readyArchived)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: t.restore }))
    expect(f.encounter.getState().doc.archivedAt).toBeNull()
    expect(ready()).toBeEnabled()
  })

  it('opens an active encounter read-only with a note', () => {
    const f = encounterFixture(emptyEncounter({ status: 'active' }), room, { readOnly: true })
    renderInEncounter(<EncounterPanel />, f)
    expect(screen.getByText(t.readOnly(de.encounterStatus.active))).toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })
})

describe('starting', () => {
  const session = (extra: object = {}) => ({
    id: 's1',
    campaignId: CAMPAIGN_ID,
    title: 'Sitzung 1',
    status: 'active',
    isSessionDm: true,
    activeEncounter: null,
    ...extra,
  })
  const readyFixture = (overrides: Parameters<typeof emptyEncounter>[0] = {}) =>
    encounterFixture(
      placeToken(emptyEncounter({ status: 'ready', ...overrides }), goblin, { x: 1, y: 1 }, 'a'),
      mapWith([], roomCells()),
    )

  it('shows Starten to the session DM', async () => {
    mockApi({ 'GET /api/campaigns/:id/sessions': () => json(200, [session()]) })
    renderInEncounter(<EncounterPanel />, readyFixture())
    // What the button does with the sync's answer is in start.test.tsx.
    expect(await screen.findByRole('button', { name: t.start })).toBeEnabled()
  })

  it('explains when the user is not the session DM', async () => {
    mockApi({
      'GET /api/campaigns/:id/sessions': () => json(200, [session({ isSessionDm: false })]),
    })
    renderInEncounter(<EncounterPanel />, readyFixture())
    expect(await screen.findByText(t.startNeedsSession)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: t.start })).not.toBeInTheDocument()
  })

  it('disables the button with the reason when a creature stands wrongly', async () => {
    mockApi({ 'GET /api/campaigns/:id/sessions': () => json(200, [session()]) })
    const f = encounterFixture(
      placeToken(emptyEncounter({ status: 'ready' }), goblin, { x: 2, y: 2 }, 'a'),
      mapWith([feature('f1', 2, 2)], roomCells()),
    )
    renderInEncounter(<EncounterPanel />, f)
    expect(await screen.findByRole('button', { name: t.start })).toBeDisabled()
    expect(screen.getByText(t.startMisplaced)).toBeInTheDocument()
  })

  it('disables the button for an archived encounter', async () => {
    mockApi({ 'GET /api/campaigns/:id/sessions': () => json(200, [session()]) })
    renderInEncounter(<EncounterPanel />, readyFixture({ archivedAt: '2026-10-14T10:00:00Z' }))
    expect(await screen.findByRole('button', { name: t.start })).toBeDisabled()
    expect(screen.getByText(t.startArchived)).toBeInTheDocument()
  })

  it('asks for a draft to become ready first', () => {
    renderInEncounter(<EncounterPanel />, encounterFixture(emptyEncounter()))
    expect(screen.getByText(t.startNeedsReady)).toBeInTheDocument()
  })

  it('gives a hint instead of a button when offline', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    renderInEncounter(<EncounterPanel />, readyFixture())
    expect(screen.getByText(t.startOffline)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: t.start })).not.toBeInTheDocument()
  })
})

describe('encounter list', () => {
  const seedEncounter = (name: string) =>
    createEncounter(dbOf(), { id: MAP_ID, campaignId: CAMPAIGN_ID, name }, 's1')

  it('creates a draft encounter named after the map', async () => {
    const user = userEvent.setup()
    const f = encounterFixture()
    renderInEncounter(<EncounterListPanel />, f)
    expect(await screen.findByText(t.listEmpty)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: t.newEncounter }))
    await waitFor(async () => expect(await listEncounters(dbOf(), MAP_ID)).toHaveLength(1))
    const [created] = await listEncounters(dbOf(), MAP_ID)
    expect(created).toMatchObject({
      name: 'Klamm',
      status: 'draft',
      battleMapId: MAP_ID,
      sessionId: SESSION_ID,
      tokens: [],
      sync: { baseVersion: 0, changed: true },
    })
  })

  // knowledge/features/session-planning.md: a fight goes in a planned or running session
  // the user runs.
  it('asks for the session when the user runs several, and leaves out ended ones', async () => {
    const user = userEvent.setup()
    const sessions = dbOf().sessions
    const base = await sessions.get(SESSION_ID)
    await sessions.bulkPut([
      { ...base!, id: 's2', title: 'Die Rückkehr', date: '2026-10-24' },
      { ...base!, id: 's3', title: 'Vorbei', status: 'ended' },
      { ...base!, id: 's4', title: 'Bei Yara', dmUserId: 'someone-else' },
    ])
    renderInEncounter(<EncounterListPanel />, encounterFixture())
    await user.click(await screen.findByRole('button', { name: t.newEncounter }))

    expect(await screen.findByText(t.pickSession)).toBeInTheDocument()
    expect(screen.getByText('Die Seilbrücke')).toBeInTheDocument()
    expect(screen.queryByText('Vorbei')).not.toBeInTheDocument()
    expect(screen.queryByText('Bei Yara')).not.toBeInTheDocument()
    const row = screen.getByText('Die Rückkehr').closest('li')!
    await user.click(within(row).getByRole('button', { name: t.newEncounter }))
    await waitFor(async () => expect(await listEncounters(dbOf(), MAP_ID)).toHaveLength(1))
    expect((await listEncounters(dbOf(), MAP_ID))[0]).toMatchObject({ sessionId: 's2' })
  })

  it('says a session is needed when the user runs none', async () => {
    const user = userEvent.setup()
    await dbOf().sessions.clear()
    renderInEncounter(<EncounterListPanel />, encounterFixture())
    await user.click(await screen.findByRole('button', { name: t.newEncounter }))

    expect(await screen.findByText(t.noSession)).toBeInTheDocument()
    expect(await listEncounters(dbOf(), MAP_ID)).toHaveLength(0)
  })

  it('lists status and creature count, and marks an encounter with a misplaced creature', async () => {
    const record = await seedEncounter('Hinterhalt')
    await dbOf().encounters.put({
      ...record,
      status: 'ready',
      tokens: [
        { id: 'a', creatureTypeId: 'goblin', label: 'Goblin 1', x: 1, y: 1, size: 'small' },
        { id: 'b', creatureTypeId: 'goblin', label: 'Goblin 2', x: 2, y: 2, size: 'small' },
      ],
    })
    await seedEncounter('Wache')
    const f = encounterFixture(emptyEncounter(), mapWith([feature('f1', 2, 2)], roomCells()))
    renderInEncounter(<EncounterListPanel />, f)
    const row = (await screen.findByRole('link', { name: 'Hinterhalt' })).closest('li')!
    expect(within(row).getByText(de.encounterStatus.ready)).toBeInTheDocument()
    expect(within(row).getByText(de.encounters.creatures(2))).toBeInTheDocument()
    expect(within(row).getByRole('img', { name: t.misplacedMark })).toBeInTheDocument()
    const other = screen.getByRole('link', { name: 'Wache' }).closest('li')!
    expect(within(other).queryByRole('img', { name: t.misplacedMark })).not.toBeInTheDocument()
  })

  it('archives into a collapsed part and brings back', async () => {
    const user = userEvent.setup()
    await seedEncounter('Hinterhalt')
    renderInEncounter(<EncounterListPanel />)
    await user.click(await screen.findByRole('button', { name: t.archiveLabel('Hinterhalt') }))
    const summary = await screen.findByText(t.archived(1))
    expect(summary.closest('details')).not.toHaveAttribute('open')
    expect(await screen.findByText(t.listEmpty)).toBeInTheDocument()
    await user.click(summary)
    await user.click(screen.getByRole('button', { name: t.restoreLabel('Hinterhalt') }))
    await waitFor(() => expect(screen.queryByText(t.archived(1))).not.toBeInTheDocument())
    expect(screen.getByRole('link', { name: 'Hinterhalt' })).toBeInTheDocument()
  })

  it('opens active encounters but does not archive them', async () => {
    const record = await seedEncounter('Läuft')
    await dbOf().encounters.put({ ...record, status: 'active' })
    renderInEncounter(<EncounterListPanel />)
    expect(await screen.findByRole('link', { name: 'Läuft' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: t.archiveLabel('Läuft') })).not.toBeInTheDocument()
  })
})
