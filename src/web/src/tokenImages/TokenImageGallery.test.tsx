// The icon and portrait gallery: offline notice, the versions' states, picking one or none,
// nothing generated without confirming, German errors, and the image hub only while a job
// is pending.
import { onlineManager, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createQueryClient } from '../api/queryClient'
import type { TokenImages } from '../api/types'
import { budget, fakeImages } from '../editor/background/testing'
import { json, mockApi, type ApiCall } from '../test/api'
import { de } from '../text/de'
import { tokenImage, tokenImagesOf } from './testing'
import { TokenImageGallery, type Prepared, type TokenImageGalleryProps } from './TokenImageGallery'

// The factory must not import the fake hub's module: that pulls in the app's routes, which
// import this module again and would wait on themselves.
const imageHub = vi.hoisted(() => ({ factory: null as null | (() => unknown) }))
vi.mock('./createConnection', () => ({
  createTokenImageConnection: () => imageHub.factory!(),
}))

const t = de.tokenImages
const BASE = '/api/campaigns/c1/characters/ch1'

let online: boolean
let list: TokenImages
let calls: ApiCall[]

function serve({
  post = () => json(202, tokenImage({ status: 'queued' })),
}: { post?: (call: ApiCall) => Response } = {}) {
  calls = mockApi({
    'GET /api/campaigns/:c/characters/:ch/portraits': () => json(200, list),
    'POST /api/campaigns/:c/characters/:ch/portraits': post,
    'PUT /api/campaigns/:c/characters/:ch/portrait': () => json(204),
  })
}

const posts = () => calls.filter((c) => c.method === 'POST')
const puts = () => calls.filter((c) => c.method === 'PUT')

function renderGallery(props: Partial<TokenImageGalleryProps> = {}) {
  const prepare = vi.fn(async (): Promise<Prepared> => ({ body: {} }))
  const queryClient = createQueryClient()
  queryClient.setDefaultOptions({ queries: { retry: false } })
  render(
    <QueryClientProvider client={queryClient}>
      <TokenImageGallery
        campaignId="c1"
        owner={{ type: 'character', id: 'ch1' }}
        name="Brom"
        ring="#4da3ff"
        generateLabel="Porträt erzeugen"
        regenerateLabel="Neues Porträt erzeugen"
        prepare={prepare}
        uploads
        restyles
        {...props}
      />
    </QueryClientProvider>,
  )
  return { prepare, queryClient }
}

beforeEach(() => {
  imageHub.factory = fakeImages.hub.factory
  online = true
  onlineManager.setOnline(true)
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online)
  fakeImages.hub.reset()
  list = tokenImagesOf([])
  serve()
})

describe('offline', () => {
  it('says images need a connection and asks for nothing', () => {
    online = false
    renderGallery()
    expect(screen.getByText(t.offline)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Porträt erzeugen' })).not.toBeInTheDocument()
    expect(calls).toEqual([])
  })
})

describe('the versions', () => {
  it('shows each state, the failure reason and the picked one', async () => {
    const picked = tokenImage({ origin: 'uploaded' })
    list = tokenImagesOf(
      [
        tokenImage({ status: 'running' }),
        tokenImage({ status: 'failed', failure: 'rejected' }),
        tokenImage({ status: 'failed', failure: 'error' }),
        picked,
        tokenImage({ sourceAssetId: picked.id }),
      ],
      { pickedAssetId: picked.id },
    )
    renderGallery()
    const items = await screen.findAllByRole('listitem')
    expect(items).toHaveLength(5)
    expect(items[0]).toHaveTextContent(t.status.running)
    expect(items[1]).toHaveTextContent(t.rejected)
    expect(items[2]).toHaveTextContent(t.failed)
    expect(items[3]).toHaveTextContent(t.picked)
    expect(items[3]).toHaveTextContent(t.kind.uploaded)
    expect(items[4]).toHaveTextContent(t.kind.restyled)
    // The picked image is shown large, in the ring.
    expect(screen.getByRole('img', { name: t.pickedAlt('Brom') })).toHaveAttribute(
      'src',
      picked.url!,
    )
    // A job runs: no second one.
    expect(screen.getByRole('button', { name: 'Neues Porträt erzeugen' })).toBeDisabled()
    expect(screen.getByText(t.running)).toBeVisible()
  })

  it('picks a version, or none for the letter', async () => {
    const first = tokenImage()
    const second = tokenImage()
    list = tokenImagesOf([second, first], { pickedAssetId: second.id })
    const user = userEvent.setup()
    renderGallery()
    const items = await screen.findAllByRole('listitem')
    await user.click(within(items[1]!).getByRole('button', { name: t.pick }))
    await waitFor(() => expect(puts()).toHaveLength(1))
    expect(puts()[0]).toMatchObject({ path: `${BASE}/portrait`, body: { assetId: first.id } })

    await user.click(screen.getByRole('button', { name: t.pickNone }))
    await waitFor(() => expect(puts()).toHaveLength(2))
    expect(puts()[1]!.body).toEqual({ assetId: null })
  })

  it('shows the letter without a picked image', async () => {
    renderGallery()
    await screen.findByText(t.empty)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
  })
})

describe('generating', () => {
  it('confirms first, with the month’s spending, and posts nothing without it', async () => {
    const user = userEvent.setup()
    const { prepare } = renderGallery()
    const button = await screen.findByRole('button', { name: 'Porträt erzeugen' })
    await waitFor(() => expect(button).toBeEnabled())
    await user.click(button)

    const dialog = screen.getByRole('dialog', { name: t.confirm.portraitTitle })
    expect(dialog).toHaveTextContent(t.confirm.portraitFrom)
    expect(dialog).toHaveTextContent('Diesen Monat: 0,42 $ von 20,00 $')
    await user.click(within(dialog).getByRole('button', { name: de.common.cancel }))
    expect(prepare).not.toHaveBeenCalled()
    expect(posts()).toEqual([])

    await user.click(button)
    await user.click(screen.getByRole('button', { name: t.confirm.ok }))
    await screen.findByText(t.queued)
    expect(prepare).toHaveBeenCalledTimes(1)
    expect(posts()).toEqual([expect.objectContaining({ path: `${BASE}/portraits`, body: {} })])
  })

  it('sends what prepare returns, and stops with its message', async () => {
    const user = userEvent.setup()
    const { prepare } = renderGallery()
    prepare.mockResolvedValueOnce({ error: 'Nicht synchronisiert.' })
    const button = await screen.findByRole('button', { name: 'Porträt erzeugen' })
    await waitFor(() => expect(button).toBeEnabled())
    await user.click(button)
    await user.click(screen.getByRole('button', { name: t.confirm.ok }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Nicht synchronisiert.')
    expect(posts()).toEqual([])

    prepare.mockResolvedValueOnce({ body: { itemVersion: 7 } })
    await user.click(button)
    await user.click(screen.getByRole('button', { name: t.confirm.ok }))
    await screen.findByText(t.queued)
    expect(posts()[0]!.body).toEqual({ itemVersion: 7 })
  })

  it('shows the server’s refusal in German', async () => {
    serve({ post: () => json(409, { code: 'imageBudgetExhausted' }) })
    const user = userEvent.setup()
    renderGallery()
    const button = await screen.findByRole('button', { name: 'Porträt erzeugen' })
    await waitFor(() => expect(button).toBeEnabled())
    await user.click(button)
    await user.click(screen.getByRole('button', { name: t.confirm.ok }))
    expect(await screen.findByRole('alert')).toHaveTextContent(de.errors.imageBudgetExhausted)
  })

  it('offers no confirm when the budget is used up', async () => {
    list = tokenImagesOf([], { budget: budget({ spentUsd: 20 }) })
    renderGallery()
    expect(await screen.findByText(t.budgetExhausted)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Porträt erzeugen' })).toBeDisabled()
  })

  it('shows the hint instead of generating while one is given', async () => {
    renderGallery({ generateHint: de.characters.portrait.needsAppearance })
    await screen.findByText(t.empty)
    expect(screen.getByText(de.characters.portrait.needsAppearance)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Porträt erzeugen' })).toBeDisabled()
  })

  it('restyles an uploaded version after confirming', async () => {
    const uploaded = tokenImage({ origin: 'uploaded' })
    list = tokenImagesOf([uploaded, tokenImage()], { pickedAssetId: uploaded.id })
    const user = userEvent.setup()
    const { prepare } = renderGallery()
    const items = await screen.findAllByRole('listitem')
    // Only the upload can be restyled.
    expect(within(items[1]!).queryByRole('button', { name: t.restyle })).not.toBeInTheDocument()
    await user.click(within(items[0]!).getByRole('button', { name: t.restyle }))
    const dialog = screen.getByRole('dialog', { name: t.confirm.restyleTitle })
    expect(posts()).toEqual([])
    await user.click(within(dialog).getByRole('button', { name: t.confirm.restyleOk }))
    await screen.findByText(t.queued)
    expect(prepare).not.toHaveBeenCalled()
    expect(posts()[0]!.body).toEqual({ restyleAssetId: uploaded.id })
  })

  it('offers uploading without restyling when only uploads are on', async () => {
    const uploaded = tokenImage({ origin: 'uploaded' })
    list = tokenImagesOf([uploaded], { pickedAssetId: uploaded.id })
    renderGallery({ restyles: false })
    await screen.findAllByRole('listitem')
    expect(screen.getByRole('button', { name: t.upload })).toBeEnabled()
    expect(screen.queryByRole('button', { name: t.restyle })).not.toBeInTheDocument()
  })
})

describe('the image hub', () => {
  it('connects only while a job is pending and takes the finished one', async () => {
    renderGallery()
    await screen.findByText(t.empty)
    expect(fakeImages.hub.connections).toHaveLength(0)

    const queued = tokenImage({ status: 'queued' })
    list = tokenImagesOf([queued])
    const user = userEvent.setup()
    serve({ post: () => json(202, queued) })
    const button = screen.getByRole('button', { name: 'Porträt erzeugen' })
    await user.click(button)
    await user.click(screen.getByRole('button', { name: t.confirm.ok }))
    await waitFor(() => expect(fakeImages.hub.open).toHaveLength(1))
    await waitFor(() =>
      expect(fakeImages.hub.latest.invocations).toEqual([
        { method: 'WatchTokenImages', args: ['c1', 'character', 'ch1'] },
      ]),
    )

    const done = { ...queued, status: 'done' as const, url: `/api/assets/${queued.id}` }
    list = tokenImagesOf([done], { pickedAssetId: done.id })
    act(() => fakeImages.hub.latest.emit('TokenImageUpdated', done))
    expect(await screen.findByRole('img', { name: t.pickedAlt('Brom') })).toBeVisible()
    await waitFor(() => expect(fakeImages.hub.open).toHaveLength(0))
  })
})

describe('campaign covers', () => {
  it('lists, picks and generates through the cover endpoints, shown as a 3:2 picture', async () => {
    const cover = tokenImage({ ownerType: 'campaign', ownerId: 'c1' })
    list = tokenImagesOf([cover], { pickedAssetId: cover.id })
    calls = mockApi({
      'GET /api/campaigns/:c/covers': () => json(200, list),
      'POST /api/campaigns/:c/covers': () =>
        json(202, tokenImage({ ownerType: 'campaign', ownerId: 'c1', status: 'queued' })),
      'PUT /api/campaigns/:c/cover': () => json(204),
    })
    renderGallery({
      owner: { type: 'campaign', id: 'c1' },
      name: 'Die Rabenküste',
      shape: 'cover',
      generateLabel: 'Titelbild erzeugen',
      regenerateLabel: 'Neues Titelbild erzeugen',
      restyles: false,
    })

    // The default cover stands in until the list arrives.
    const picked = screen.getByRole('img', { name: t.pickedAlt('Die Rabenküste') })
    await waitFor(() => expect(picked).toHaveAttribute('src', cover.url))
    expect(picked).toHaveClass('aspect-[3/2]')

    await userEvent.click(screen.getByRole('button', { name: t.pickNone }))
    await waitFor(() => expect(puts()).toHaveLength(1))
    expect(puts()[0]!.path).toBe('/api/campaigns/c1/cover')
    expect(puts()[0]!.body).toEqual({ assetId: null })

    await userEvent.click(screen.getByRole('button', { name: 'Neues Titelbild erzeugen' }))
    const dialog = screen.getByRole('dialog', { name: t.confirm.coverTitle })
    await userEvent.click(within(dialog).getByRole('button', { name: t.confirm.ok }))
    await waitFor(() => expect(posts()).toHaveLength(1))
    expect(posts()[0]!.path).toBe('/api/campaigns/c1/covers')
  })
})
