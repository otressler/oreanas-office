// Starting from the editor: the sync before the start decides where it goes.
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { json, mockApi, testUser } from '../../test/api'
import { de } from '../../text/de'
import { mapWith, roomCells } from '../features/fixtures'
import { CAMPAIGN_ID, seedOffline } from '../testing'
import { EncounterPanel } from './panels'
import { pickType } from './picked'
import { emptyEncounter, ENCOUNTER_ID, encounterFixture, renderInEncounter } from './testing'
import { placeToken } from './tokens'
import { offlineDb } from '../../offline/db'

const t = de.encounterEditor

const navigate = vi.hoisted(() => vi.fn())
const syncBeforeStart = vi.hoisted(() => vi.fn())
vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router')>()),
  useNavigate: () => navigate,
}))
vi.mock('../../sync/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../sync/client')>()),
  syncBeforeStart,
}))

beforeEach(async () => {
  pickType(null)
  navigate.mockReset()
  syncBeforeStart.mockReset()
  await seedOffline()
  // The device has the encounter, so the start syncs it first.
  await offlineDb(testUser.id).encounters.put({
    id: ENCOUNTER_ID,
    campaignId: CAMPAIGN_ID,
    battleMapId: 'map-1',
    name: 'Hinterhalt',
    status: 'ready',
    archivedAt: null,
    tokens: [],
    sessionId: 's1',
    mapCopy: null,
    createdAt: '2026-10-14T10:00:00Z',
    updatedAt: '2026-10-14T10:00:00Z',
    sync: { baseVersion: 0, changed: true, editCount: 1, issue: null, server: null },
    recordVersion: 1,
  })
  mockApi({
    'GET /api/campaigns/:id/sessions': () =>
      json(200, [
        {
          id: 's1',
          campaignId: CAMPAIGN_ID,
          title: 'Sitzung 1',
          status: 'active',
          isSessionDm: true,
          activeEncounter: null,
        },
      ]),
  })
})

const readyFixture = () =>
  encounterFixture(
    placeToken(
      emptyEncounter({ status: 'ready' }),
      { id: 'goblin', name: 'Goblin', size: 'small' },
      { x: 1, y: 1 },
      'a',
    ),
    mapWith([], roomCells()),
  )

describe('Starten', () => {
  it('goes to the setup page once the sync says ready', async () => {
    syncBeforeStart.mockResolvedValue('ready')
    const user = userEvent.setup()
    renderInEncounter(<EncounterPanel />, readyFixture())
    await user.click(await screen.findByRole('button', { name: t.start }))
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(
        `/kampagnen/${CAMPAIGN_ID}/sitzungen/s1/kampf/${ENCOUNTER_ID}/aufstellen`,
      ),
    )
    expect(syncBeforeStart).toHaveBeenCalledWith(expect.anything(), ENCOUNTER_ID)
  })

  it('stays and says why when a conflict or rejection must be resolved first', async () => {
    syncBeforeStart.mockResolvedValue('blocked')
    const user = userEvent.setup()
    renderInEncounter(<EncounterPanel />, readyFixture())
    await user.click(await screen.findByRole('button', { name: t.start }))
    expect(await screen.findByText(t.startBlocked)).toBeInTheDocument()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('stays and says so when the sync is offline', async () => {
    syncBeforeStart.mockResolvedValue('offline')
    const user = userEvent.setup()
    renderInEncounter(<EncounterPanel />, readyFixture())
    await user.click(await screen.findByRole('button', { name: t.start }))
    expect(await screen.findByText(t.startOffline)).toBeInTheDocument()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('saves edits that are still waiting for the autosave before it syncs', async () => {
    syncBeforeStart.mockResolvedValue('ready')
    const user = userEvent.setup()
    const f = readyFixture()
    const db = offlineDb(testUser.id)
    renderInEncounter(<EncounterPanel />, f)
    // A change the autosave hasn't written yet.
    act(() => f.encounter.getState().apply((doc) => ({ ...doc, name: 'Neuer Name' })))
    await user.click(await screen.findByRole('button', { name: t.start }))
    await waitFor(() => expect(syncBeforeStart).toHaveBeenCalled())
    expect((await db.encounters.get(ENCOUNTER_ID))!.name).toBe('Neuer Name')
  })
})
