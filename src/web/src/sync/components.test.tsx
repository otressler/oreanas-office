import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { emptyMap } from '../editor/model'
import { CAMPAIGN_ID, renderEditor, seedMap, seedOffline } from '../editor/testing'
import { offlineDb } from '../offline/db'
import { newSyncState } from '../offline/sync'
import { renderApp, testUser } from '../test/api'
import { de } from '../text/de'
import { fakeServer, serverMap, type FakeServer } from './testing'
import { resetSyncState } from './state'

const t = de.sync
const db = () => offlineDb(testUser.id)

/** Presses "Sync" once the sync that the editor starts on opening is over. */
async function pressSync(user: ReturnType<typeof userEvent.setup>) {
  const button = await screen.findByRole('button', { name: t.status.button })
  await waitFor(() => expect(button).toBeEnabled())
  await user.click(button)
}

let server: FakeServer

beforeEach(() => {
  resetSyncState()
  server = fakeServer()
  server.campaigns = [
    { id: CAMPAIGN_ID, name: 'Die Rabenküste', myRole: 'dm', activeSession: null },
  ]
})

describe('the editor header', () => {
  it('shows the status and syncs with the Sync button', async () => {
    const user = userEvent.setup()
    const { record } = await renderEditor(emptyMap('Schluchtübergang', 12, 8))

    expect(await screen.findByText(t.status.pendingOne)).toBeInTheDocument()
    await pressSync(user)

    expect(await screen.findByText(t.status.allSynced)).toBeInTheDocument()
    expect(server.pushedIds()).toEqual([record.id])
    expect((await db().maps.get(record.id))!.sync).toMatchObject({ baseVersion: 1, changed: false })
  })

  it('asks for attention only for a conflict, and each choice does what it says', async () => {
    const user = userEvent.setup()
    const { record } = await renderEditor(emptyMap('Meine Klamm', 12, 8))
    await db().maps.update(record.id, { sync: { ...record.sync, baseVersion: 1, changed: true } })
    server.put(serverMap(record.id, 2, { name: 'Ihre Klamm', campaignId: CAMPAIGN_ID }))

    await pressSync(user)
    await user.click(await screen.findByRole('button', { name: t.status.reviewOne }))

    const dialog = await screen.findByRole('dialog', { name: t.dialog.title })
    expect(
      within(dialog).getByText(t.dialog.conflictTitle(t.kinds.battleMap, 'Meine Klamm')),
    ).toBeInTheDocument()
    // Who changed each version last.
    expect(
      within(dialog).getByText(new RegExp(`von ${t.dialog.thisDeviceWho},`)),
    ).toBeInTheDocument()
    expect(within(dialog).getByText(/von Felix,/)).toBeInTheDocument()
    expect(
      within(dialog).getByRole('img', { name: t.dialog.preview(t.dialog.onServer) }),
    ).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: t.dialog.takeServer }))

    await waitFor(async () => expect((await db().maps.get(record.id))!.name).toBe('Ihre Klamm'))
    expect(await screen.findByText(t.dialog.allDone)).toBeInTheDocument()
  })

  it('lists a rejection with the reason', async () => {
    const user = userEvent.setup()
    const { record } = await renderEditor()
    server.rejections.set(record.id, { error: { code: 'layoutInvalid' } })

    await pressSync(user)
    await user.click(await screen.findByRole('button', { name: t.status.reviewOne }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(de.errors.layoutInvalid)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: t.dialog.exportMap })).toBeInTheDocument()
    expect(
      within(dialog).getByRole('link', { name: t.dialog.openItem('Klamm') }),
    ).toBeInTheDocument()
  })

  it('says to reload when the server refuses this app version', async () => {
    const user = userEvent.setup()
    await renderEditor()
    server.syncStatus = 426

    await pressSync(user)

    expect(await screen.findByText(t.status.outdated)).toBeInTheDocument()
  })
})

describe('the sign-out warning', () => {
  async function openProfile() {
    await seedOffline()
    const map = await seedMap(emptyMap('Klamm', 4, 4))
    renderApp('/profil')
    await screen.findByRole('heading', { name: de.profile.title })
    return map
  }

  it('asks first when changes are not synced, and signs out anyway on request', async () => {
    const user = userEvent.setup()
    await openProfile()

    await user.click(screen.getByRole('button', { name: de.profile.signOut }))
    const dialog = await screen.findByRole('dialog', { name: t.signOut.title })
    expect(within(dialog).getByText(t.signOut.body(1))).toBeInTheDocument()
    expect(server.calls.some((call) => call.path === '/api/auth/logout')).toBe(false)

    await user.click(within(dialog).getByRole('button', { name: t.signOut.anyway }))
    await waitFor(() =>
      expect(server.calls.some((call) => call.path === '/api/auth/logout')).toBe(true),
    )
  })

  it('cancel keeps the user signed in', async () => {
    const user = userEvent.setup()
    await openProfile()

    await user.click(screen.getByRole('button', { name: de.profile.signOut }))
    await user.click(await screen.findByRole('button', { name: de.common.cancel }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(server.calls.some((call) => call.path === '/api/auth/logout')).toBe(false)
  })

  it('syncs first and signs out when that saves everything', async () => {
    const user = userEvent.setup()
    await openProfile()

    await user.click(screen.getByRole('button', { name: de.profile.signOut }))
    await user.click(await screen.findByRole('button', { name: t.signOut.syncNow }))

    await waitFor(() =>
      expect(server.calls.some((call) => call.path === '/api/auth/logout')).toBe(true),
    )
    expect(server.pushedIds()).toHaveLength(1)
  })

  it('signs out at once with nothing to lose', async () => {
    const user = userEvent.setup()
    await seedOffline()
    renderApp('/profil')
    await screen.findByRole('heading', { name: de.profile.title })

    await user.click(screen.getByRole('button', { name: de.profile.signOut }))

    await waitFor(() =>
      expect(server.calls.some((call) => call.path === '/api/auth/logout')).toBe(true),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('the map store', () => {
  const offered = {
    id: 'store-map-1',
    name: 'Hafenkneipe',
    width: 6,
    height: 4,
    campaignName: 'Das Grab',
    layout: emptyMap('', 6, 4).layout,
    hasArchivedCopy: false,
  }

  it('lists the offered maps and adds one as a synced map', async () => {
    const user = userEvent.setup()
    server.store = [offered]
    await seedOffline()
    renderApp(`/kampagnen/${CAMPAIGN_ID}/karten`)

    await user.click(await screen.findByRole('button', { name: t.store.open }))
    const dialog = await screen.findByRole('dialog', { name: t.store.title })
    expect(within(dialog).getByText('Hafenkneipe')).toBeInTheDocument()
    expect(within(dialog).getByText(t.store.fromCampaign('Das Grab'))).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: t.store.addLabel('Hafenkneipe') }))

    await waitFor(async () => {
      const maps = await db().maps.toArray()
      expect(maps).toHaveLength(1)
      expect(maps[0]).toMatchObject({ name: 'Hafenkneipe', copiedFromMapId: 'store-map-1' })
      expect(maps[0]!.sync).toMatchObject({ baseVersion: 1, changed: false })
    })
    // A pull follows, so the copy is current.
    await waitFor(() =>
      expect(server.calls.some((call) => call.path.endsWith('/versions'))).toBe(true),
    )
  })

  it('says it brings back an archived copy', async () => {
    const user = userEvent.setup()
    server.store = [{ ...offered, hasArchivedCopy: true }]
    await seedOffline()
    renderApp(`/kampagnen/${CAMPAIGN_ID}/karten`)

    await user.click(await screen.findByRole('button', { name: t.store.open }))

    expect(
      await screen.findByRole('button', { name: t.store.addLabel('Hafenkneipe') }),
    ).toHaveTextContent(t.store.addBack)
  })

  it('is not offered without a connection', async () => {
    await seedOffline()
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    try {
      renderApp(`/kampagnen/${CAMPAIGN_ID}/karten`)
      expect(await screen.findByRole('button', { name: t.store.open })).toBeDisabled()
      expect(screen.getByText(t.store.offlineHint)).toBeInTheDocument()
    } finally {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    }
  })
})

describe('campaigns made offline', () => {
  it('are created on /karten and listed as only on this device', async () => {
    const user = userEvent.setup()
    await seedOffline({ role: 'player' })
    renderApp('/karten')

    await user.type(await screen.findByLabelText(t.localCampaign.name), 'Die Nebelinsel')
    await user.click(screen.getByRole('button', { name: t.localCampaign.create }))

    const link = await screen.findByRole('link', { name: /Die Nebelinsel/ })
    expect(link).toHaveTextContent(de.maps.localOnly)
    const [copy] = await db()
      .campaigns.filter((c) => c.local)
      .toArray()
    expect(copy).toMatchObject({ name: 'Die Nebelinsel', myRole: 'dm', local: true })
    expect(copy!.sync).toMatchObject({ baseVersion: 0, changed: true })
  })

  it('show no join code before the first sync', async () => {
    await seedOffline()
    const copy = {
      id: 'local-1',
      name: 'Die Nebelinsel',
      myRole: 'dm' as const,
      savedAt: '',
      local: true,
      sync: newSyncState(),
    }
    await db().campaigns.put(copy)
    renderApp('/kampagnen/local-1')

    expect(await screen.findByRole('heading', { name: 'Die Nebelinsel' })).toBeInTheDocument()
    expect(screen.getByText(t.localCampaign.localBody)).toBeInTheDocument()
    expect(screen.getByText(de.maps.localOnly)).toBeInTheDocument()
    expect(screen.queryByText(de.campaign.joinCodeTitle)).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: de.characters.title })).not.toBeInTheDocument()
    // The server doesn't know the campaign, so the page never asks for it.
    expect(server.calls.some((call) => call.path === '/api/campaigns/local-1')).toBe(false)
    expect(screen.getByRole('link', { name: new RegExp(de.maps.campaignLink) })).toBeInTheDocument()
  })

  it('appear on the home page', async () => {
    await seedOffline()
    await db().campaigns.put({
      id: 'local-1',
      name: 'Die Nebelinsel',
      myRole: 'dm',
      savedAt: '',
      local: true,
      sync: newSyncState(),
    })
    renderApp('/')

    const link = await screen.findByRole('link', { name: /Die Nebelinsel/ })
    expect(link).toHaveTextContent(de.maps.localOnly)
  })
})
