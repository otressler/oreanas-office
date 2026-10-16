// The status list editor: offline note, reading someone else's list, ordering, removing
// and adding statuses, and a custom status with its icon generated after a confirm step.
import { onlineManager, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createQueryClient } from '../api/queryClient'
import type { StatusDefinition, StatusList } from '../api/types'
import { fakeImages } from '../editor/background/testing'
import { json, mockApi, type ApiCall } from '../test/api'
import { de } from '../text/de'
import { tokenImage, tokenImagesOf } from '../tokenImages/testing'
import type { StatusListOwner } from './queries'
import { StatusListEditor } from './StatusListEditor'

const imageHub = vi.hoisted(() => ({ factory: null as null | (() => unknown) }))
vi.mock('../tokenImages/createConnection', () => ({
  createTokenImageConnection: () => imageHub.factory!(),
}))

const t = de.statuses.list

function definition(id: string, libraryKey: string | null, name: string): StatusDefinition {
  return {
    id,
    libraryKey,
    name,
    hasLevels: libraryKey === 'exhaustion',
    iconUrl: libraryKey ? `/statuses/${libraryKey}.webp` : null,
    iconDescription: null,
    characterId: null,
  }
}

const prone = definition('s-prone', 'prone', 'Liegend')
const blinded = definition('s-blinded', 'blinded', 'Blind')
const poisoned = definition('s-poisoned', 'poisoned', 'Vergiftet')
const all = [blinded, poisoned, prone]

let online: boolean
let list: StatusList
let calls: ApiCall[]

function serve() {
  calls = mockApi({
    'GET /api/campaigns/:c/characters/:ch/status-list': () => json(200, list),
    'GET /api/campaigns/:c/dm-status-list': () => json(200, list),
    'PUT /api/campaigns/:c/characters/:ch/status-list': (call) => {
      const ids = (call.body as { statusIds: string[] }).statusIds
      list = { ...list, statuses: ids.map((id) => [...all, ...custom].find((s) => s.id === id)!) }
      return json(200, list)
    },
    'GET /api/campaigns/:c/statuses': () => json(200, [...all, ...custom]),
    'POST /api/campaigns/:c/statuses': (call) => {
      const body = call.body as { name: string; characterId: string | null }
      const created: StatusDefinition = {
        ...definition('s-hexed', null, body.name),
        characterId: body.characterId,
      }
      custom.push(created)
      list = { ...list, statuses: [...list.statuses, created] }
      return json(201, created)
    },
    'GET /api/campaigns/:c/statuses/:s/icons': () => json(200, tokenImagesOf([])),
    'POST /api/campaigns/:c/statuses/:s/icons': () =>
      json(202, tokenImage({ ownerType: 'status', ownerId: 's-hexed', status: 'queued' })),
  })
}

let custom: StatusDefinition[]

function renderEditor(owner: StatusListOwner = { kind: 'character', characterId: 'ch1' }) {
  const queryClient = createQueryClient()
  queryClient.setDefaultOptions({ queries: { retry: false } })
  render(
    <QueryClientProvider client={queryClient}>
      <StatusListEditor campaignId="c1" owner={owner} />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

const puts = () => calls.filter((c) => c.method === 'PUT').map((c) => c.body)

beforeEach(() => {
  imageHub.factory = fakeImages.hub.factory
  fakeImages.hub.reset()
  online = true
  onlineManager.setOnline(true)
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online)
  custom = []
  list = { id: 'l1', characterId: 'ch1', statuses: [prone, blinded], canEdit: true }
  serve()
})

describe('StatusListEditor', () => {
  it('says status lists need a connection and asks for nothing offline', () => {
    online = false
    renderEditor()
    expect(screen.getByText(t.offline)).toBeInTheDocument()
    expect(calls).toHaveLength(0)
  })

  it('shows someone else’s list without changing it', async () => {
    list = { ...list, canEdit: false }
    renderEditor()

    expect(await screen.findByText('Liegend')).toBeInTheDocument()
    expect(screen.getByText('Blind')).toBeInTheDocument()
    expect(screen.getByText(t.readOnly)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(calls.some((c) => c.path.endsWith('/statuses'))).toBe(false)
  })

  it('orders, removes and adds statuses, saving the whole list', async () => {
    const user = renderEditor()

    await user.click(await screen.findByRole('button', { name: t.moveDown('Liegend') }))
    expect(puts()).toEqual([{ statusIds: ['s-blinded', 's-prone'] }])
    expect(await screen.findByRole('button', { name: t.moveUp('Liegend') })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: t.remove('Blind') }))
    expect(puts()[1]).toEqual({ statusIds: ['s-prone'] })

    // The choice offers what isn't in the list, the removed one included.
    const select = await screen.findByRole('combobox', { name: t.addLabel })
    await vi.waitFor(() =>
      expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual([
        'Blind',
        'Vergiftet',
      ]),
    )
    await user.selectOptions(select, 's-poisoned')
    await user.click(screen.getByRole('button', { name: t.add }))
    expect(puts()[2]).toEqual({ statusIds: ['s-prone', 's-poisoned'] })
  })

  it('makes a custom status and generates its icon only after confirming', async () => {
    const user = renderEditor()

    await user.click(await screen.findByRole('button', { name: de.statuses.custom.open }))
    await user.type(screen.getByLabelText(de.statuses.custom.name), 'Verhext')
    await user.type(screen.getByLabelText(de.statuses.custom.iconDescription), 'ein lila Auge')
    await user.click(screen.getByLabelText(de.statuses.custom.hasLevels))
    await user.click(screen.getByRole('button', { name: de.statuses.custom.create }))

    const post = calls.find((c) => c.method === 'POST' && c.path.endsWith('/statuses'))
    expect(post?.body).toEqual({
      name: 'Verhext',
      iconDescription: 'ein lila Auge',
      hasLevels: true,
      characterId: 'ch1',
    })
    expect(await screen.findByText(de.statuses.custom.created('Verhext'))).toBeInTheDocument()

    // Its icon gallery opens; nothing is generated before the confirm.
    const gallery = await screen.findByRole('region', { name: t.icon('Verhext') })
    await user.click(
      await within(gallery).findByRole('button', { name: de.statuses.icon.generate }),
    )
    const dialog = screen.getByRole('dialog', { name: de.statuses.icon.confirmTitle })
    expect(dialog).toHaveTextContent(de.statuses.icon.confirmFrom)
    expect(calls.some((c) => c.method === 'POST' && c.path.endsWith('/icons'))).toBe(false)

    await user.click(within(dialog).getByRole('button', { name: de.tokenImages.confirm.ok }))
    await vi.waitFor(() =>
      expect(
        calls.filter((c) => c.method === 'POST' && c.path.endsWith('/statuses/s-hexed/icons')),
      ).toHaveLength(1),
    )
  })

  it('makes custom statuses in the DM’s own list without a character', async () => {
    list = { id: 'l2', characterId: null, statuses: [prone], canEdit: true }
    const user = renderEditor({ kind: 'dm' })

    await user.click(await screen.findByRole('button', { name: de.statuses.custom.open }))
    await user.type(screen.getByLabelText(de.statuses.custom.name), 'Gesegnet')
    await user.click(screen.getByRole('button', { name: de.statuses.custom.create }))

    expect(calls.some((c) => c.path === '/api/campaigns/c1/dm-status-list')).toBe(true)
    const post = calls.find((c) => c.method === 'POST')
    expect(post?.body).toMatchObject({ name: 'Gesegnet', characterId: null })
  })
})
