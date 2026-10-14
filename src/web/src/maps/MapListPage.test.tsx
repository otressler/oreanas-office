import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listMaps } from '../editor/maps'
import { emptyMap } from '../editor/model'
import { CAMPAIGN_ID, seedMap, seedOffline } from '../editor/testing'
import { offlineDb } from '../offline/db'
import { mockApi, renderApp, testUser } from '../test/api'
import { de } from '../text/de'
import { forgetStorageRequest } from './storage'

const t = de.maps
const db = () => offlineDb(testUser.id)
const listPath = `/kampagnen/${CAMPAIGN_ID}/karten`

let persist: ReturnType<typeof vi.fn>

beforeEach(() => {
  forgetStorageRequest()
  persist = vi.fn(async () => true)
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: { persist, persisted: async () => false },
  })
})

afterEach(() => {
  delete (navigator as { storage?: unknown }).storage
})

function narrowScreen() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

async function openList() {
  const calls = mockApi({})
  const app = renderApp(listPath)
  await screen.findByRole('heading', { name: t.title('Die Rabenküste') })
  return { ...app, calls }
}

const activeList = () => screen.getByRole('region', { name: t.activeTitle })

describe('MapListPage', () => {
  it('lists the campaign’s maps with size, change and sync mark, without asking the server', async () => {
    await seedOffline()
    await seedMap(emptyMap('Schluchtübergang', 20, 12))
    await seedMap(emptyMap('Andere Kampagne', 5, 5), 'c2')

    const { calls } = await openList()

    const row = (await within(activeList()).findByText('Schluchtübergang')).closest('li')!
    expect(row).toHaveTextContent('20 × 12 Felder (30 m × 18 m)')
    expect(row).toHaveTextContent(/Geändert \d/)
    expect(within(row).getByText(t.localOnly)).toBeInTheDocument()
    expect(within(row).getByRole('link', { name: t.editMap('Schluchtübergang') })).toHaveAttribute(
      'href',
      expect.stringMatching(new RegExp(`^${listPath}/[0-9a-f-]{36}$`)),
    )
    expect(screen.queryByText('Andere Kampagne')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Zur Kampagne/ })).toHaveAttribute(
      'href',
      `/kampagnen/${CAMPAIGN_ID}`,
    )
    // Only the header's profile link asks, since the test marks the server as awake.
    expect(calls.filter((c) => c.path !== '/api/auth/me')).toHaveLength(0)
  })

  it('says so when there are no maps', async () => {
    await seedOffline()
    await openList()
    expect(within(activeList()).getByText(t.empty)).toBeInTheDocument()
  })

  it('creates a map and opens the editor, asking the browser to keep the storage', async () => {
    const user = userEvent.setup()
    await seedOffline()
    const { router } = await openList()

    const form = screen.getByRole('region', { name: t.newTitle })
    expect(within(form).getByLabelText(t.width)).toHaveValue(20)
    expect(within(form).getByLabelText(t.height)).toHaveValue(15)
    await user.type(within(form).getByLabelText(t.name), '  Alte Gruft ')
    await user.clear(within(form).getByLabelText(t.width))
    await user.type(within(form).getByLabelText(t.width), '24')
    await user.click(within(form).getByRole('button', { name: t.create }))

    await waitFor(() =>
      expect(router.state.location.pathname).toMatch(new RegExp(`^${listPath}/[0-9a-f-]{36}$`)),
    )
    const [map] = await listMaps(db(), CAMPAIGN_ID)
    expect(map).toMatchObject({ name: 'Alte Gruft', width: 24, height: 15 })
    expect(router.state.location.pathname).toBe(`${listPath}/${map!.id}`)
    await waitFor(() => expect(persist).toHaveBeenCalledTimes(1))
  })

  it('needs a name and a size from 1 to 40', async () => {
    const user = userEvent.setup()
    await seedOffline()
    await openList()
    const form = screen.getByRole('region', { name: t.newTitle })

    await user.click(within(form).getByRole('button', { name: t.create }))
    expect(within(form).getByRole('alert')).toHaveTextContent(t.nameRequired)

    await user.type(within(form).getByLabelText(t.name), 'Riesig')
    await user.clear(within(form).getByLabelText(t.height))
    await user.type(within(form).getByLabelText(t.height), '41')
    await user.click(within(form).getByRole('button', { name: t.create }))
    expect(within(form).getByRole('alert')).toHaveTextContent(t.sizeInvalid(40))
    expect(await listMaps(db(), CAMPAIGN_ID)).toHaveLength(0)
    expect(persist).not.toHaveBeenCalled()
  })

  it('duplicates, archives and brings back a map; nothing is deleted', async () => {
    const user = userEvent.setup()
    await seedOffline()
    const original = await seedMap(emptyMap('Klamm', 10, 8))
    await openList()

    await user.click(await screen.findByRole('button', { name: t.duplicateMap('Klamm') }))
    expect(await screen.findByText(t.duplicated('Klamm (Kopie)'))).toBeInTheDocument()
    const copy = (await listMaps(db(), CAMPAIGN_ID)).find((m) => m.name === 'Klamm (Kopie)')!
    expect(copy).toMatchObject({ copiedFromMapId: original.id, width: 10, height: 8 })
    expect(within(activeList()).getByText('Klamm (Kopie)')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: t.archiveMap('Klamm (Kopie)') }))
    expect(await screen.findByText(t.archived('Klamm (Kopie)'))).toBeInTheDocument()
    await waitFor(() =>
      expect(within(activeList()).queryByText('Klamm (Kopie)')).not.toBeInTheDocument(),
    )
    const archived = screen.getByText(t.archivedTitle(1)).closest('details')!
    expect(archived).not.toHaveAttribute('open')
    expect(within(archived).getByText('Klamm (Kopie)')).toBeInTheDocument()
    expect((await listMaps(db(), CAMPAIGN_ID)).find((m) => m.id === copy.id)?.archivedAt).not.toBe(
      null,
    )

    await user.click(within(archived).getByText(t.archivedTitle(1)))
    await user.click(within(archived).getByRole('button', { name: t.restoreMap('Klamm (Kopie)') }))
    expect(await screen.findByText(t.restored('Klamm (Kopie)'))).toBeInTheDocument()
    await waitFor(() => expect(within(activeList()).getByText('Klamm (Kopie)')).toBeInTheDocument())
    expect(screen.queryByText(t.archivedTitle(1))).not.toBeInTheDocument()
    expect(await listMaps(db(), CAMPAIGN_ID)).toHaveLength(2)
  })

  it('keeps a copy’s name within the limit', async () => {
    const user = userEvent.setup()
    await seedOffline()
    const long = 'L'.repeat(80)
    await seedMap(emptyMap(long, 4, 4))
    await openList()

    await user.click(await screen.findByRole('button', { name: t.duplicateMap(long) }))
    await waitFor(async () => expect(await listMaps(db(), CAMPAIGN_ID)).toHaveLength(2))
    const names = (await listMaps(db(), CAMPAIGN_ID)).map((m) => m.name)
    expect(names).toContain(`${'L'.repeat(72)} (Kopie)`)
  })

  it('imports a map file as a new map in the browser', async () => {
    const user = userEvent.setup()
    await seedOffline()
    await openList()

    const content = JSON.stringify({
      name: 'Furt',
      width: 12,
      height: 6,
      scene: 'eine Furt',
      layout: { schemaVersion: 1, cells: [{ x: 0, y: 0, terrain: 'water' }] },
      creatures: [{ type: 'Goblin', size: 'small', x: 0, y: 0 }],
    })
    await user.upload(
      screen.getByLabelText(t.importLabel),
      new File([content], 'furt.json', { type: 'application/json' }),
    )

    expect(await screen.findByText(t.imported('Furt'))).toBeInTheDocument()
    const [map] = await listMaps(db(), CAMPAIGN_ID)
    expect(map).toMatchObject({ name: 'Furt', width: 12, height: 6, scene: 'eine Furt' })
    expect(map).not.toHaveProperty('creatures')
    expect(within(activeList()).getByText('Furt')).toBeInTheDocument()
    await waitFor(() => expect(persist).toHaveBeenCalledTimes(1))
  })

  it('refuses a file that isn’t a map, with a German message', async () => {
    const user = userEvent.setup()
    await seedOffline()
    await openList()

    await user.upload(
      screen.getByLabelText(t.importLabel),
      new File(
        [JSON.stringify({ name: 'Groß', width: 50, height: 5, layout: { cells: [] } })],
        'x.json',
      ),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(t.file.tooLarge(40))
    expect(await listMaps(db(), CAMPAIGN_ID)).toHaveLength(0)
  })

  it('is read-only on small screens, with the laptop hint', async () => {
    narrowScreen()
    await seedOffline()
    await seedMap(emptyMap('Klamm', 10, 8))
    await openList()

    expect(screen.getByText(de.editor.narrowTitle)).toBeInTheDocument()
    expect(await within(activeList()).findByText('Klamm')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: t.editMap('Klamm') })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: t.duplicateMap('Klamm') })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: t.archiveMap('Klamm') })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: t.newTitle })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(t.importLabel)).not.toBeInTheDocument()
  })

  it('is only for the campaign’s dm members', async () => {
    mockApi({})
    await seedOffline({ role: 'player' })
    await seedMap()
    renderApp(listPath)
    expect(await screen.findByRole('heading', { name: t.notDmTitle })).toBeInTheDocument()
    expect(screen.queryByText('Klamm')).not.toBeInTheDocument()
  })

  it('says when the device doesn’t know the campaign', async () => {
    mockApi({})
    await seedOffline()
    renderApp('/kampagnen/unbekannt/karten')
    expect(await screen.findByRole('heading', { name: t.unknownTitle })).toBeInTheDocument()
  })
})
