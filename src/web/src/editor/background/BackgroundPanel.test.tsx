// The "Hintergrund" panel: nothing generated without confirming, the sync first, errors in
// German, the gallery's states, picking, and the image hub only while a job is pending.
import { onlineManager } from '@tanstack/react-query'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MapBackgrounds } from '../../api/types'
import { json, mockApi, type ApiCall } from '../../test/api'
import { de } from '../../text/de'
import { emptyMap } from '../model'
import { BackgroundPanel } from './BackgroundPanel'
import { backgroundsOf, budget, fakeImages, renderInMapEditor, version } from './testing'
import { backgroundTool } from '.'

const t = de.maps.background

const syncMapBeforeGenerate = vi.hoisted(() => vi.fn())
vi.mock('../../sync/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../sync/client')>()),
  syncMapBeforeGenerate,
}))
vi.mock('./createConnection', async () => {
  const { fakeImages } = await import('./testing')
  return { createImageConnection: () => fakeImages.hub.factory() }
})

let online: boolean
let list: MapBackgrounds
let calls: ApiCall[]

/** Answers the background endpoints from `list`; `post` and `put` can be replaced. */
function serve({
  post = () => json(202, version({ status: 'queued' })),
  put = () => json(204),
}: { post?: (call: ApiCall) => Response; put?: (call: ApiCall) => Response } = {}) {
  calls = mockApi({
    'GET /api/campaigns/:c/maps/:m/backgrounds': () => json(200, list),
    'POST /api/campaigns/:c/maps/:m/backgrounds': post,
    'PUT /api/campaigns/:c/maps/:m/background': put,
  })
}

/** The generate button once the list has loaded (it waits disabled until then). */
async function generateButton(name: string = t.generate) {
  const button = await screen.findByRole('button', { name })
  await waitFor(() => expect(button).toBeEnabled())
  return button
}

const posts = () => calls.filter((c) => c.method === 'POST')
const puts = () => calls.filter((c) => c.method === 'PUT')
const gets = () => calls.filter((c) => c.method === 'GET')

beforeEach(() => {
  online = true
  // TanStack Query follows the browser's offline events too; a test that went offline
  // would leave every later query paused.
  onlineManager.setOnline(true)
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online)
  fakeImages.hub.reset()
  syncMapBeforeGenerate.mockReset()
  syncMapBeforeGenerate.mockResolvedValue({ result: 'ready', version: 4 })
  list = backgroundsOf([])
  serve()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the tool', () => {
  it('is a panel in the "Karte" group', () => {
    expect(backgroundTool).toMatchObject({
      id: 'map-background',
      group: 'map',
      label: 'Hintergrund',
      Panel: BackgroundPanel,
    })
  })
})

describe('offline', () => {
  it('says backgrounds need a connection and asks for nothing', async () => {
    online = false
    await renderInMapEditor(<BackgroundPanel />)
    expect(screen.getByText(t.offline)).toBeVisible()
    expect(screen.queryByRole('button', { name: t.generate })).not.toBeInTheDocument()
    expect(calls).toEqual([])
    expect(fakeImages.hub.connections).toHaveLength(0)
  })

  it('switches to the line when the connection goes', async () => {
    await renderInMapEditor(<BackgroundPanel />)
    await screen.findByText(t.empty)
    online = false
    act(() => void window.dispatchEvent(new Event('offline')))
    expect(screen.getByText(t.offline)).toBeVisible()
  })
})

describe('generating', () => {
  it('opens the confirm dialog first and posts nothing without confirming', async () => {
    const user = userEvent.setup()
    await renderInMapEditor(<BackgroundPanel />)
    await user.click(await generateButton())

    const dialog = screen.getByRole('dialog', { name: t.confirm.title })
    expect(dialog).toHaveTextContent(t.confirm.sync)
    expect(dialog).toHaveTextContent('hoher Qualität')
    expect(dialog).toHaveTextContent('halbe Minute')
    expect(dialog).toHaveTextContent('ein paar Cent')
    expect(dialog).toHaveTextContent('Diesen Monat: 0,42 $ von 20,00 $')
    expect(syncMapBeforeGenerate).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: de.common.cancel }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(syncMapBeforeGenerate).not.toHaveBeenCalled()
    expect(posts()).toEqual([])
  })

  it('saves edits the autosave has not written yet before syncing', async () => {
    const user = userEvent.setup()
    const { mapId, store, db } = await renderInMapEditor(<BackgroundPanel />)
    store.getState().apply((doc) => ({ ...doc, scene: 'Eine Klamm im Nebel' }))
    let synced: string | undefined
    syncMapBeforeGenerate.mockImplementation(async () => {
      synced = (await db.maps.get(mapId))?.scene
      return { result: 'ready', version: 4 }
    })

    await user.click(await generateButton())
    await user.click(screen.getByRole('button', { name: t.confirm.ok }))

    await screen.findByText(t.queued)
    expect(synced).toBe('Eine Klamm im Nebel')
  })

  it('syncs the map, then posts with the synced version', async () => {
    const user = userEvent.setup()
    const { mapId } = await renderInMapEditor(<BackgroundPanel />)
    await user.click(await generateButton())
    await user.click(screen.getByRole('button', { name: t.confirm.ok }))

    await screen.findByText(t.queued)
    expect(syncMapBeforeGenerate).toHaveBeenCalledWith(expect.anything(), mapId)
    expect(posts()).toEqual([
      expect.objectContaining({
        path: `/api/campaigns/c1/maps/${mapId}/backgrounds`,
        body: { mapVersion: 4 },
      }),
    ])
  })

  it('says so when the sync finds no connection', async () => {
    syncMapBeforeGenerate.mockResolvedValue({ result: 'offline', version: null })
    const user = userEvent.setup()
    await renderInMapEditor(<BackgroundPanel />)
    await user.click(await generateButton())
    await user.click(screen.getByRole('button', { name: t.confirm.ok }))
    expect(await screen.findByRole('alert')).toHaveTextContent(t.syncOffline)
    expect(posts()).toEqual([])
  })

  it('asks to resolve the sync issue first when the sync is blocked', async () => {
    syncMapBeforeGenerate.mockResolvedValue({ result: 'blocked', version: null })
    const user = userEvent.setup()
    await renderInMapEditor(<BackgroundPanel />)
    await user.click(await generateButton())
    await user.click(screen.getByRole('button', { name: t.confirm.ok }))
    expect(await screen.findByRole('alert')).toHaveTextContent(t.syncBlocked)
    expect(posts()).toEqual([])
  })

  it.each([
    ['mapChanged', de.errors.mapChanged],
    ['generationRunning', de.errors.generationRunning],
    ['imageBudgetExhausted', de.errors.imageBudgetExhausted],
    ['imagesUnavailable', de.errors.imagesUnavailable],
  ] as const)('shows the server refusing with %s', async (code, text) => {
    serve({ post: () => json(409, { code }) })
    const user = userEvent.setup()
    await renderInMapEditor(<BackgroundPanel />)
    await user.click(await generateButton())
    await user.click(screen.getByRole('button', { name: t.confirm.ok }))
    expect(await screen.findByRole('alert')).toHaveTextContent(text)
  })

  it('offers no confirm when the month’s budget is used up', async () => {
    list = backgroundsOf([], { budget: budget({ spentUsd: 20.03 }) })
    await renderInMapEditor(<BackgroundPanel />)
    expect(await screen.findByText(t.budgetExhausted)).toBeVisible()
    expect(screen.getByRole('button', { name: t.generate })).toBeDisabled()
    expect(screen.getByText('Diesen Monat: 20,03 $ von 20,00 $')).toBeVisible()
  })

  it('offers no confirm when the server has no image model', async () => {
    list = backgroundsOf([], { budget: budget({ available: false }) })
    await renderInMapEditor(<BackgroundPanel />)
    expect(await screen.findByText(t.unavailable)).toBeVisible()
    expect(screen.getByRole('button', { name: t.generate })).toBeDisabled()
  })

  it('says a map only on this device is synced first, and asks the server for nothing', async () => {
    const user = userEvent.setup()
    await renderInMapEditor(<BackgroundPanel />, { baseVersion: 0 })
    expect(await screen.findByText(t.notSynced)).toBeVisible()
    expect(gets()).toEqual([])
    await user.click(await generateButton())
    // The budget isn't known yet; the dialog still confirms first.
    const dialog = screen.getByRole('dialog', { name: t.confirm.title })
    expect(dialog).not.toHaveTextContent('Diesen Monat')
    await user.click(within(dialog).getByRole('button', { name: t.confirm.ok }))
    await waitFor(() => expect(posts()).toHaveLength(1))
  })
})

describe('the gallery', () => {
  it('shows every state, newest first, and the month’s spending', async () => {
    list = backgroundsOf([
      version({ status: 'queued', createdAt: '2026-10-14T18:40:00Z' }),
      version({ status: 'running', createdAt: '2026-10-14T18:39:00Z' }),
      version({ status: 'failed', failure: 'rejected', createdAt: '2026-10-14T18:38:00Z' }),
      version({ status: 'failed', failure: 'error', createdAt: '2026-10-14T18:37:00Z' }),
      version({ id: 'aaaaaaaa-0000-0000-0000-000000000001', outdated: true, gridWidth: 12 }),
      version({ layoutChanged: true }),
    ])
    await renderInMapEditor(<BackgroundPanel />)
    const items = await screen.findAllByRole('listitem')
    expect(items).toHaveLength(6)
    expect(items[0]).toHaveTextContent(t.status.queued)
    expect(items[1]).toHaveTextContent(t.status.running)
    expect(items[2]).toHaveTextContent(t.rejected)
    expect(items[3]).toHaveTextContent(t.failed)
    expect(items[4]).toHaveTextContent(t.outdated)
    expect(within(items[4]!).queryByRole('button', { name: t.pick })).not.toBeInTheDocument()
    expect(items[5]).toHaveTextContent(t.layoutChanged)
    expect(within(items[5]!).getByRole('button', { name: t.pick })).toBeEnabled()
    const thumb = within(items[5]!).getByRole('img')
    expect(thumb).toHaveAttribute('loading', 'lazy')
    expect(thumb.getAttribute('src')).toMatch(/^\/api\/assets\//)
    expect(screen.getByText('Diesen Monat: 0,42 $ von 20,00 $')).toBeVisible()
    // A job is pending: no second one.
    expect(screen.getByRole('button', { name: t.regenerate })).toBeDisabled()
    expect(screen.getByText(t.running)).toBeVisible()
  })

  it('treats a version made for another size than the editor’s map as outdated', async () => {
    list = backgroundsOf([version({ gridWidth: 10, gridHeight: 8 })])
    await renderInMapEditor(<BackgroundPanel />, { doc: emptyMap('Klamm', 12, 8) })
    const [item] = await screen.findAllByRole('listitem')
    expect(item).toHaveTextContent(t.outdated)
    expect(within(item!).queryByRole('button', { name: t.pick })).not.toBeInTheDocument()
  })

  it('marks the picked one and says when it no longer fits the map', async () => {
    const picked = version({ outdated: true, gridWidth: 12 })
    list = backgroundsOf([picked], { pickedAssetId: picked.id })
    await renderInMapEditor(<BackgroundPanel />)
    const [item] = await screen.findAllByRole('listitem')
    expect(item).toHaveTextContent(t.picked)
    expect(screen.getByText(t.pickedOutdated)).toBeVisible()
  })

  it('picks a version, and none', async () => {
    const a = version()
    const b = version()
    list = backgroundsOf([a, b], { pickedAssetId: b.id })
    const user = userEvent.setup()
    const { mapId } = await renderInMapEditor(<BackgroundPanel />)
    const items = await screen.findAllByRole('listitem')
    expect(within(items[1]!).queryByRole('button', { name: t.pick })).not.toBeInTheDocument()
    serve({
      put: (call) => {
        list = { ...list, pickedAssetId: (call.body as { assetId: string | null }).assetId }
        return json(204)
      },
    })
    await user.click(within(items[0]!).getByRole('button', { name: t.pick }))
    await waitFor(() => expect(within(items[0]!).getByText(t.picked)).toBeVisible())
    expect(puts()).toEqual([
      expect.objectContaining({
        path: `/api/campaigns/c1/maps/${mapId}/background`,
        body: { assetId: a.id },
      }),
    ])

    await user.click(screen.getByRole('button', { name: t.pickNone }))
    await waitFor(() => expect(screen.queryByText(t.picked)).not.toBeInTheDocument())
    expect(puts().at(-1)!.body).toEqual({ assetId: null })
  })

  it('shows a refused pick in German', async () => {
    const a = version()
    list = backgroundsOf([a])
    serve({ put: () => json(409, { code: 'backgroundOutdated' }) })
    const user = userEvent.setup()
    await renderInMapEditor(<BackgroundPanel />)
    await user.click(await screen.findByRole('button', { name: t.pick }))
    expect(await screen.findByRole('alert')).toHaveTextContent(de.errors.backgroundOutdated)
  })

  it('compares the finished versions large, with the grid over them', async () => {
    const older = version({ createdAt: '2026-10-14T18:00:00Z' })
    const newer = version({ createdAt: '2026-10-14T19:00:00Z', x: 0, y: -1, height: 10 })
    list = backgroundsOf([newer, version({ status: 'running' }), older])
    const user = userEvent.setup()
    await renderInMapEditor(<BackgroundPanel />)
    const [first] = await screen.findAllByRole('button', { name: new RegExp(t.enlarge) })
    await user.click(first!)
    const dialog = screen.getByRole('dialog', { name: t.compare.title })
    expect(dialog).toHaveTextContent('1 von 2')
    expect(within(dialog).getByTestId('compare-grid')).toHaveAttribute('viewBox', '0 -1 10 10')
    expect(within(dialog).getByRole('button', { name: t.compare.previous })).toBeDisabled()
    await user.click(within(dialog).getByRole('button', { name: t.compare.next }))
    expect(dialog).toHaveTextContent('2 von 2')
    expect(within(dialog).getByTestId('compare-grid')).toHaveAttribute('viewBox', '0 0 10 8')
    expect(within(dialog).getByRole('button', { name: t.compare.next })).toBeDisabled()
  })
})

describe('refining', () => {
  const r = t.refine

  it('asks what should change, then syncs and posts a refinement of that version', async () => {
    const user = userEvent.setup()
    const first = version()
    list = backgroundsOf([first], { pickedAssetId: first.id })
    serve({
      post: () =>
        json(202, version({ status: 'queued', refinedFromId: first.id, instruction: 'Breiter' })),
    })
    const { mapId } = await renderInMapEditor(<BackgroundPanel />)

    await user.click(await screen.findByRole('button', { name: r.button }))
    const dialog = screen.getByRole('dialog', { name: r.title })
    expect(dialog).toHaveTextContent(r.layoutHint)
    expect(dialog).toHaveTextContent('Diesen Monat: 0,42 $ von 20,00 $')
    const ok = within(dialog).getByRole('button', { name: r.ok })
    expect(ok).toBeDisabled()

    await user.type(within(dialog).getByLabelText(r.instruction), '  Breiter  ')
    await user.click(ok)

    await screen.findByText(t.queued)
    expect(syncMapBeforeGenerate).toHaveBeenCalledWith(expect.anything(), mapId)
    expect(posts()).toEqual([
      expect.objectContaining({
        body: { mapVersion: 4, refineAssetId: first.id, instruction: 'Breiter' },
      }),
    ])
  })

  it('posts nothing when the dialog is cancelled', async () => {
    const user = userEvent.setup()
    list = backgroundsOf([version()])
    serve()
    await renderInMapEditor(<BackgroundPanel />)

    await user.click(await screen.findByRole('button', { name: r.button }))
    const dialog = screen.getByRole('dialog', { name: r.title })
    await user.type(within(dialog).getByLabelText(r.instruction), 'Breiter')
    await user.click(within(dialog).getByRole('button', { name: de.common.cancel }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(syncMapBeforeGenerate).not.toHaveBeenCalled()
    expect(posts()).toEqual([])
  })

  it('shows what a refinement changed, and offers no refining of an outdated version', async () => {
    list = backgroundsOf([
      version({ instruction: 'Mehr Nebel', refinedFromId: 'other' }),
      version({ gridWidth: 12, outdated: true }),
    ])
    serve()
    await renderInMapEditor(<BackgroundPanel />)

    expect(await screen.findByText(t.refinedFrom('Mehr Nebel'))).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: r.button })).toHaveLength(1)
  })
})

describe('the image hub', () => {
  it('stays closed while no job is pending', async () => {
    list = backgroundsOf([version()])
    await renderInMapEditor(<BackgroundPanel />)
    await screen.findAllByRole('listitem')
    expect(fakeImages.hub.connections).toHaveLength(0)
  })

  it('watches the map while a job runs, follows it and closes once it is done', async () => {
    const job = version({ status: 'running' })
    list = backgroundsOf([job])
    const { mapId } = await renderInMapEditor(<BackgroundPanel />)
    await screen.findByText(t.running)
    await waitFor(() => expect(fakeImages.hub.latest.invocations).toHaveLength(1))
    expect(fakeImages.hub.latest.invocations[0]).toEqual({
      method: 'WatchMap',
      args: ['c1', mapId],
    })

    const done = { ...job, mapId, status: 'done' as const, url: `/api/assets/${job.id}` }
    list = backgroundsOf([done], { budget: budget({ spentUsd: 0.47 }) })
    act(() => fakeImages.hub.latest.emit('BackgroundUpdated', done))
    expect(await screen.findByRole('button', { name: t.pick })).toBeVisible()
    await waitFor(() => expect(fakeImages.hub.open).toHaveLength(0))
    expect(await screen.findByText('Diesen Monat: 0,47 $ von 20,00 $')).toBeVisible()
  })

  it('stays watching when a failed attempt goes back into the queue', async () => {
    const job = version({ status: 'running' })
    list = backgroundsOf([job])
    const { mapId } = await renderInMapEditor(<BackgroundPanel />)
    await waitFor(() => expect(fakeImages.hub.latest.invocations).toHaveLength(1))
    act(() => fakeImages.hub.latest.emit('BackgroundUpdated', { ...job, mapId, status: 'queued' }))
    expect(await screen.findAllByText(t.status.queued)).not.toHaveLength(0)
    expect(fakeImages.hub.open).toHaveLength(1)
  })

  it('opens after a confirmed job and fetches the list again once watching', async () => {
    const queued = version({ status: 'queued' })
    serve({
      post: () => {
        list = backgroundsOf([queued])
        return json(202, queued)
      },
    })
    let answerWatch: (result: unknown) => void = () => {}
    fakeImages.hub.respond = () => new Promise((resolve) => (answerWatch = resolve))
    const user = userEvent.setup()
    await renderInMapEditor(<BackgroundPanel />)
    await user.click(await generateButton())
    expect(fakeImages.hub.connections).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: t.confirm.ok }))
    await waitFor(() => expect(fakeImages.hub.latest.invocations).toHaveLength(1))

    // The job finished before the watch began, so its event never came: the refetch after
    // WatchMap sees it, and the connection closes.
    list = backgroundsOf([{ ...queued, status: 'done', url: `/api/assets/${queued.id}` }])
    const before = gets().length
    await act(async () => answerWatch({ error: null }))
    await waitFor(() => expect(gets().length).toBeGreaterThan(before))
    expect(await screen.findByRole('button', { name: t.pick })).toBeVisible()
    await waitFor(() => expect(fakeImages.hub.open).toHaveLength(0))
  })

  it('closes the connection when the panel closes', async () => {
    list = backgroundsOf([version({ status: 'queued' })])
    const { unmount } = await renderInMapEditor(<BackgroundPanel />)
    await waitFor(() => expect(fakeImages.hub.open).toHaveLength(1))
    unmount()
    expect(fakeImages.hub.open).toHaveLength(0)
  })

  it('closes the connection when the device goes offline', async () => {
    list = backgroundsOf([version({ status: 'queued' })])
    await renderInMapEditor(<BackgroundPanel />)
    await waitFor(() => expect(fakeImages.hub.open).toHaveLength(1))
    online = false
    act(() => void window.dispatchEvent(new Event('offline')))
    expect(screen.getByText(t.offline)).toBeVisible()
    expect(fakeImages.hub.open).toHaveLength(0)
  })
})
