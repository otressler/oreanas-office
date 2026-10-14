import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { offlineDb } from '../offline/db'
import { serverMap } from '../sync/testing'
import { json, mockApi, renderApp, testUser } from '../test/api'
import { de } from '../text/de'
import { emptyMap } from './model'
import { CAMPAIGN_ID, renderEditor, seedMap, seedOffline } from './testing'

describe('EditorPage', () => {
  it('opens a map from the browser without asking the server', async () => {
    const calls = mockApi({})
    await renderEditor(emptyMap('Schluchtübergang', 12, 8))

    expect(await screen.findByRole('heading', { name: 'Schluchtübergang' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Zur Kartenliste/ })).toHaveAttribute(
      'href',
      `/kampagnen/${CAMPAIGN_ID}/karten`,
    )
    // Only the header's profile link and the sync on opening ask (the pull, and the look at
    // the opened map's version), since the test marks the server as awake; the map itself
    // comes from the browser.
    expect(
      calls.filter(
        (c) =>
          c.path !== '/api/auth/me' &&
          c.path !== '/api/campaigns' &&
          !c.path.startsWith('/api/sync/'),
      ),
    ).toHaveLength(0)
  })

  it('shows the server’s newer version of a map this device has not changed', async () => {
    mockApi({
      'GET /api/sync/campaigns/:id/versions': () =>
        json(200, { creatureTypes: [], battleMaps: [{ id: 'm1', version: 2 }], encounters: [] }),
      'POST /api/sync/campaigns/:id/items': () =>
        json(200, [serverMap('m1', 2, { name: 'Klamm, neu', campaignId: CAMPAIGN_ID })]),
    })
    await seedOffline()
    const db = offlineDb(testUser.id)
    const record = await seedMap({ ...emptyMap('Klamm, alt', 12, 8) })
    // Same id as the server's copy; synced at version 1.
    await db.maps.delete(record.id)
    await db.maps.put({
      ...record,
      id: 'm1',
      sync: { ...record.sync, baseVersion: 1, changed: false, editCount: 0 },
    })
    renderApp(`/kampagnen/${CAMPAIGN_ID}/karten/m1`)

    expect(await screen.findByRole('heading', { name: 'Klamm, neu' })).toBeInTheDocument()
    expect((await db.maps.get('m1'))!.sync).toMatchObject({ baseVersion: 2, changed: false })
  })

  it('says when the map isn’t on this device', async () => {
    mockApi({})
    await seedOffline()
    renderApp(`/kampagnen/${CAMPAIGN_ID}/karten/00000000-0000-0000-0000-00000000abcd`)
    expect(
      await screen.findByRole('heading', { name: de.editor.notFoundTitle }),
    ).toBeInTheDocument()
  })

  it('is only for the campaign’s dm members', async () => {
    mockApi({})
    await seedOffline({ role: 'player' })
    const record = await seedMap()
    renderApp(`/kampagnen/${CAMPAIGN_ID}/karten/${record.id}`)
    expect(await screen.findByRole('heading', { name: de.editor.notDmTitle })).toBeInTheDocument()
  })

  it('sends someone without a remembered user to the sign-in page', async () => {
    mockApi({ 'GET /api/auth/me': () => new Response(null, { status: 401 }) })
    const { router } = renderApp(`/kampagnen/${CAMPAIGN_ID}/karten/x`)
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/anmelden'))
  })

  it('shows a hint instead of the editor on small screens', async () => {
    mockApi({})
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    await renderEditor()
    expect(await screen.findByRole('heading', { name: de.editor.narrowTitle })).toBeInTheDocument()
  })
})
