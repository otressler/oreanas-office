// The icon part of the creature type form: offline it says so, a type the server has never
// seen must be synced first, and generating saves the form, syncs the type and sends its
// server version.
import { onlineManager, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createQueryClient } from '../api/queryClient'
import { CAMPAIGN_ID, seedOffline } from '../editor/testing'
import { offlineDb } from '../offline/db'
import { LocalUserContext } from '../offline/localUser'
import type { LocalCreatureType } from '../offline/model'
import { json, mockApi, testUser, type ApiCall } from '../test/api'
import { fakeImages } from '../editor/background/testing'
import { de } from '../text/de'
import { tokenImage, tokenImagesOf } from '../tokenImages/testing'
import { createCreatureType } from './creatureTypes'
import { CreatureTypeForm } from './CreatureTypeForm'

const syncCreatureTypeBeforeGenerate = vi.hoisted(() => vi.fn())
vi.mock('../sync/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../sync/client')>()),
  syncCreatureTypeBeforeGenerate,
}))
// The factory must not import the fake hub's module: that pulls in the app's routes, which
// import this module again and would wait on themselves.
const imageHub = vi.hoisted(() => ({ factory: null as null | (() => unknown) }))
vi.mock('../tokenImages/createConnection', () => ({
  createTokenImageConnection: () => imageHub.factory!(),
}))

const t = de.bestiary.icon

let online: boolean
let calls: ApiCall[]

beforeEach(() => {
  imageHub.factory = fakeImages.hub.factory
  online = true
  onlineManager.setOnline(true)
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online)
  syncCreatureTypeBeforeGenerate.mockReset()
  syncCreatureTypeBeforeGenerate.mockResolvedValue({ result: 'ready', version: 4 })
  calls = mockApi({
    'GET /api/campaigns/:c/creature-types/:t/icons': () => json(200, tokenImagesOf([])),
    'POST /api/campaigns/:c/creature-types/:t/icons': () =>
      json(202, tokenImage({ ownerType: 'creatureType', status: 'queued' })),
  })
})

/** A goblin in the offline store, synced at `baseVersion` (0: only on this device). */
async function goblin(baseVersion: number): Promise<LocalCreatureType> {
  const db = await seedOffline()
  const created = await createCreatureType(db, CAMPAIGN_ID, {
    name: 'Goblin',
    size: 'small',
    appearance: 'grün',
    notes: '',
    initiativeModifier: 0,
    initiativeRollMode: 'normal',
  })
  if (!created.ok) throw new Error('not created')
  const type = {
    ...created.type,
    sync: { ...created.type.sync, baseVersion, changed: baseVersion === 0 },
  }
  await db.creatureTypes.put(type)
  return type
}

function renderForm(type?: LocalCreatureType) {
  const queryClient = createQueryClient()
  queryClient.setDefaultOptions({ queries: { retry: false } })
  const db = offlineDb(testUser.id)
  render(
    <QueryClientProvider client={queryClient}>
      <LocalUserContext.Provider value={{ user: testUser, db }}>
        <CreatureTypeForm
          campaignId={CAMPAIGN_ID}
          type={type}
          onSaved={() => {}}
          onCancel={() => {}}
        />
      </LocalUserContext.Provider>
    </QueryClientProvider>,
  )
  return db
}

const generateButton = async () => {
  const button = await screen.findByRole('button', { name: t.generate })
  await waitFor(() => expect(button).toBeEnabled())
  return button
}

describe('the icon section', () => {
  it('is not part of a new type', async () => {
    await seedOffline()
    renderForm()
    expect(screen.queryByRole('region', { name: t.title })).not.toBeInTheDocument()
  })

  it('says offline that icons need a connection, and asks for nothing', async () => {
    online = false
    renderForm(await goblin(3))
    expect(screen.getByText(de.tokenImages.offline)).toBeVisible()
    expect(screen.queryByRole('button', { name: t.generate })).not.toBeInTheDocument()
    expect(calls).toEqual([])
  })

  it('asks to sync a type the server has never seen, and says why it could not', async () => {
    const type = await goblin(0)
    syncCreatureTypeBeforeGenerate.mockResolvedValue({ result: 'blocked', version: null })
    const user = userEvent.setup()
    renderForm(type)
    expect(screen.getByText(t.notSynced)).toBeVisible()
    expect(screen.queryByRole('button', { name: t.generate })).not.toBeInTheDocument()
    expect(calls).toEqual([])

    await user.click(screen.getByRole('button', { name: t.syncNow }))
    expect(await screen.findByRole('alert')).toHaveTextContent(t.syncBlocked)
    expect(syncCreatureTypeBeforeGenerate).toHaveBeenCalledWith(expect.anything(), type.id)
  })

  it('saves the form, syncs the type and sends its version after the confirm', async () => {
    const type = await goblin(3)
    const user = userEvent.setup()
    const db = renderForm(type)
    let synced: string | undefined
    syncCreatureTypeBeforeGenerate.mockImplementation(async () => {
      synced = (await db.creatureTypes.get(type.id))?.appearance
      return { result: 'ready', version: 4 }
    })
    const appearance = screen.getByLabelText(de.bestiary.appearance)
    await user.clear(appearance)
    await user.type(appearance, 'grün, mit Kapuze')

    await user.click(await generateButton())
    expect(screen.getByRole('dialog', { name: de.tokenImages.confirm.iconTitle })).toBeVisible()
    expect(syncCreatureTypeBeforeGenerate).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: de.tokenImages.confirm.ok }))

    await screen.findByText(de.tokenImages.queued)
    expect(synced).toBe('grün, mit Kapuze')
    expect(calls.filter((c) => c.method === 'POST')).toEqual([
      expect.objectContaining({
        path: `/api/campaigns/${CAMPAIGN_ID}/creature-types/${type.id}/icons`,
        body: { itemVersion: 4 },
      }),
    ])
  })

  it('offers uploading an icon, but no restyling', async () => {
    const uploaded = tokenImage({ ownerType: 'creatureType', origin: 'uploaded' })
    calls = mockApi({
      'GET /api/campaigns/:c/creature-types/:t/icons': () =>
        json(200, tokenImagesOf([uploaded], { pickedAssetId: uploaded.id })),
    })
    renderForm(await goblin(3))
    await screen.findAllByRole('listitem')
    expect(screen.getByRole('button', { name: de.tokenImages.upload })).toBeEnabled()
    expect(screen.queryByRole('button', { name: de.tokenImages.restyle })).not.toBeInTheDocument()
  })

  it('generates nothing when the sync finds no connection', async () => {
    const type = await goblin(3)
    syncCreatureTypeBeforeGenerate.mockResolvedValue({ result: 'offline', version: null })
    const user = userEvent.setup()
    renderForm(type)
    await user.click(await generateButton())
    await user.click(screen.getByRole('button', { name: de.tokenImages.confirm.ok }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      `${t.syncOffline} ${t.nothingGenerated}`,
    )
    expect(calls.filter((c) => c.method === 'POST')).toEqual([])
  })
})
