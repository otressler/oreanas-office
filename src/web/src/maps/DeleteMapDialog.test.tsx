import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { setArchived } from '../editor/maps'
import { emptyMap } from '../editor/model'
import { CAMPAIGN_ID, SESSION_ID, seedMap, seedOffline } from '../editor/testing'
import { offlineDb } from '../offline/db'
import type { EncounterStatus } from '../api/types'
import { seedEncounter } from '../sync/testing'
import { json, mockApi, renderApp, testUser } from '../test/api'
import { de } from '../text/de'

// Deleting an archived map from the map list (knowledge/domain/battle-map.md, "Deleting").
const t = de.maps
const d = de.maps.deleteDialog
const db = () => offlineDb(testUser.id)
const deletePath = `DELETE /api/campaigns/:campaignId/maps/:mapId`

async function archivedMap(name = 'Klamm', synced = false) {
  await seedOffline()
  const map = await seedMap(emptyMap(name, 10, 8))
  await setArchived(db(), map.id, true)
  if (synced) {
    await db().maps.update(map.id, {
      sync: { baseVersion: 3, changed: false, editCount: 0, issue: null, server: null },
    })
  }
  return map
}

function encounterOn(mapId: string, name: string, status: EncounterStatus = 'draft') {
  return seedEncounter(db(), {
    battleMapId: mapId,
    campaignId: CAMPAIGN_ID,
    sessionId: SESSION_ID,
    name,
    status,
  })
}

async function openDialog(name: string, handlers: Parameters<typeof mockApi>[0] = {}) {
  const user = userEvent.setup()
  const calls = mockApi(handlers)
  renderApp(`/kampagnen/${CAMPAIGN_ID}/karten`)
  const summary = await screen.findByText(t.archivedTitle(1))
  await user.click(summary)
  await user.click(screen.getByRole('button', { name: t.deleteMap(name) }))
  const dialog = await screen.findByRole('dialog', { name: d.title(name) })
  return { user, calls, dialog }
}

describe('DeleteMapDialog', () => {
  it('is offered for archived maps only', async () => {
    await archivedMap('Klamm')
    await seedMap(emptyMap('Brücke', 10, 8))
    mockApi({})
    renderApp(`/kampagnen/${CAMPAIGN_ID}/karten`)

    await screen.findByText(t.archivedTitle(1))
    expect(screen.queryByRole('button', { name: t.deleteMap('Brücke') })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: t.deleteMap('Klamm') })).toBeInTheDocument()
  })

  it('names the unplayed encounters that go with the map and deletes it on this device', async () => {
    const map = await archivedMap()
    const encounter = await encounterOn(map.id, 'Hinterhalt')
    const { user, calls, dialog } = await openDialog('Klamm')

    expect(within(dialog).getByText(d.encounters(1))).toBeInTheDocument()
    expect(
      within(dialog).getByText(d.inSession('Hinterhalt', 'Die Seilbrücke')),
    ).toBeInTheDocument()
    // Never on the server, so it has no images there.
    expect(within(dialog).queryByText(d.images)).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: d.confirm }))

    expect(await screen.findByText(t.deleted('Klamm'))).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await db().maps.get(map.id)).toBeUndefined()
    expect(await db().encounters.get(encounter.id)).toBeUndefined()
    expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(0)
  })

  it('deletes a synced map on the server', async () => {
    const map = await archivedMap('Klamm', true)
    const { user, calls, dialog } = await openDialog('Klamm', { [deletePath]: json(204) })

    expect(within(dialog).getByText(d.images)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: d.confirm }))

    expect(await screen.findByText(t.deleted('Klamm'))).toBeInTheDocument()
    expect(calls.filter((c) => c.method === 'DELETE').map((c) => c.path)).toEqual([
      `/api/campaigns/${CAMPAIGN_ID}/maps/${map.id}`,
    ])
    expect(await db().maps.get(map.id)).toBeUndefined()
  })

  it('shows the server’s refusal and keeps the map', async () => {
    const map = await archivedMap('Klamm', true)
    const { user, dialog } = await openDialog('Klamm', {
      [deletePath]: json(409, { code: 'mapPlayed' }),
    })

    await user.click(within(dialog).getByRole('button', { name: d.confirm }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(de.errors.mapPlayed)
    expect(await db().maps.get(map.id)).toBeDefined()
  })

  it('says why a map that a played fight uses stays, without a delete button', async () => {
    const map = await archivedMap()
    await encounterOn(map.id, 'Brückenkampf', 'ended')
    await encounterOn(map.id, 'Später')
    const { user, dialog } = await openDialog('Klamm')

    expect(within(dialog).getByText(d.played)).toBeInTheDocument()
    expect(
      within(dialog).getByText(d.inSession('Brückenkampf', 'Die Seilbrücke')),
    ).toBeInTheDocument()
    expect(within(dialog).queryByText(/Später/)).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: d.confirm })).not.toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: de.common.cancel }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await db().maps.get(map.id)).toBeDefined()
  })
})
