import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { smallBoard } from '../../encounters/testing'
import { json, mockApi } from '../../test/api'
import { de } from '../../text/de'
import { SpawnPanel } from './SpawnPanel'
import { NEW_SPAWN, type SpawnDraft, type SpawnType } from './draft'

const t = de.fog.spawn
const CAMPAIGN = 'c0000000-0000-0000-0000-000000000001'

const goblin: SpawnType = { id: 'goblin', name: 'Goblin', size: 'small' }
const wolf: SpawnType = { id: 'wolf', name: 'Wolf', size: 'medium' }

interface Row {
  id: string
  name: string
  size: string
  archivedAt: string | null
}

const row = (item: Row) => ({
  id: item.id,
  kind: 'creatureType',
  campaignId: CAMPAIGN,
  version: 1,
  updatedAt: '2026-10-16T10:00:00Z',
  updatedByDisplayName: null,
  campaign: null,
  map: null,
  encounter: null,
  creatureType: {
    name: item.name,
    size: item.size,
    appearance: '',
    notes: '',
    archivedAt: item.archivedAt,
  },
})

/**
 * The campaign's bestiary through the sync routes: the goblin is on the test board, the
 * zombie is archived. A push adds the type to what the server lists afterwards.
 */
function bestiary(push?: (body: { items: { id: string; creatureType: Row }[] }) => Response) {
  const rows: Row[] = [
    { id: 'goblin', name: 'Goblin', size: 'small', archivedAt: null },
    { id: 'wolf', name: 'Wolf', size: 'medium', archivedAt: null },
    { id: 'zombie', name: 'Zombie', size: 'medium', archivedAt: '2026-10-01T10:00:00Z' },
  ]
  return mockApi({
    'GET /api/sync/campaigns/:id/versions': () =>
      json(200, {
        creatureTypes: rows.map((r) => ({ id: r.id, version: 1 })),
        battleMaps: [],
        encounters: [],
        sessions: [],
      }),
    'POST /api/sync/campaigns/:id/items': () => json(200, rows.map(row)),
    'POST /api/sync/push': (call) => {
      const body = call.body as { items: { id: string; creatureType: Row }[] }
      if (push) return push(body)
      const item = body.items[0]!
      rows.push({ ...item.creatureType, id: item.id })
      return json(200, { results: [{ id: item.id, outcome: 'created', error: null }] })
    },
  })
}

function setup(
  draft: SpawnDraft = NEW_SPAWN,
  props: Partial<Parameters<typeof SpawnPanel>[0]> = {},
) {
  const handlers = {
    onPick: vi.fn(),
    onOtherType: vi.fn(),
    onClosePicker: vi.fn(),
    onDone: vi.fn(),
    onResume: vi.fn(),
    onHidden: vi.fn(),
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  }
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SpawnPanel
        campaignId={CAMPAIGN}
        board={smallBoard()}
        draft={draft}
        picking={false}
        connected
        busy={false}
        error={null}
        bottom={0}
        {...handlers}
        {...props}
      />
    </QueryClientProvider>,
  )
  return { ...handlers, user: userEvent.setup() }
}

const placed = (...types: SpawnType[]): SpawnDraft => ({
  ...NEW_SPAWN,
  picked: types.at(-1) ?? null,
  placements: types.map((type, i) => ({ key: `k${i}`, type, x: i, y: 0 })),
})

describe('SpawnPanel picker', () => {
  it('lists the active types, the ones used in this fight first, and picks one', async () => {
    bestiary()
    const { user, onPick } = setup(NEW_SPAWN, { picking: true })
    expect(screen.getByText(t.loading)).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: t.pick('Goblin') })).toBeInTheDocument()
    // The goblin on the board (creature type "goblin") is under "In diesem Kampf".
    expect(screen.getByText(t.usedHere)).toBeInTheDocument()
    expect(screen.getByText(t.others)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: t.pick('Zombie') })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: t.pick('Wolf') }))
    expect(onPick).toHaveBeenCalledWith({ id: 'wolf', name: 'Wolf', size: 'medium' })
  })

  it('says when the types could not be loaded', async () => {
    mockApi({ 'GET /api/sync/campaigns/:id/versions': () => json(500) })
    setup(NEW_SPAWN, { picking: true })
    expect(await screen.findByText(t.loadFailed)).toBeInTheDocument()
  })

  it('cancels the spawn when "Schließen" is tapped before anything is picked', async () => {
    bestiary()
    const { user, onClosePicker, onCancel } = setup(NEW_SPAWN, { picking: true })
    await user.click(screen.getByRole('button', { name: t.close }))
    expect(onCancel).toHaveBeenCalled()
    expect(onClosePicker).not.toHaveBeenCalled()
  })

  it('closes only the picker when creatures are already placed', async () => {
    bestiary()
    const { user, onClosePicker, onCancel } = setup(placed(goblin), { picking: true })
    await user.click(screen.getByRole('button', { name: t.close }))
    expect(onClosePicker).toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('makes a new type with only a name and a size, then picks it', async () => {
    const calls = bestiary()
    const { user, onPick } = setup(NEW_SPAWN, { picking: true })
    await user.click(await screen.findByRole('button', { name: t.newType }))
    await user.type(screen.getByLabelText(t.newName), 'Schattenwesen')
    await user.selectOptions(screen.getByLabelText(t.newSize), de.sizes.large)
    await user.click(screen.getByRole('button', { name: t.newCreate }))

    await vi.waitFor(() => expect(onPick).toHaveBeenCalledTimes(1))
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Schattenwesen', size: 'large' }),
    )
    expect(calls.find((c) => c.path === '/api/sync/push')?.body).toMatchObject({
      items: [
        {
          kind: 'creatureType',
          campaignId: CAMPAIGN,
          baseVersion: 0,
          creatureType: { name: 'Schattenwesen', size: 'large', archivedAt: null },
        },
      ],
    })
  })

  it('says when the name is taken', async () => {
    bestiary(() =>
      json(200, {
        results: [
          {
            outcome: 'rejected',
            error: { code: 'creatureTypeNameTaken' },
            existingCreatureTypeId: null,
          },
        ],
      }),
    )
    const { user, onPick } = setup(NEW_SPAWN, { picking: true })
    await user.click(await screen.findByRole('button', { name: t.newType }))
    await user.type(screen.getByLabelText(t.newName), 'Goblin')
    await user.click(screen.getByRole('button', { name: t.newCreate }))
    expect(await screen.findByText(t.newNameTaken)).toBeInTheDocument()
    expect(onPick).not.toHaveBeenCalled()
  })
})

describe('SpawnPanel placing and confirming', () => {
  it('shows what is placed per type and finishes with "Fertig"', async () => {
    const { user, onDone, onOtherType, onCancel } = setup(placed(goblin, goblin, wolf))
    expect(screen.getByText(t.placing('Wolf'))).toBeInTheDocument()
    expect(screen.getByText(t.placed('Goblin', 2))).toBeInTheDocument()
    expect(screen.getByText(t.placed('Wolf', 1))).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: t.done }))
    expect(onDone).toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: t.otherType }))
    expect(onOtherType).toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: t.cancel }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('can’t finish before something is placed', () => {
    setup({ ...NEW_SPAWN, picked: goblin })
    expect(screen.getByRole('button', { name: t.done })).toBeDisabled()
  })

  it('asks "3 Kreaturen erscheinen lassen?" with "Verborgen", and sends on confirm', async () => {
    const { user, onConfirm, onHidden, onResume } = setup({
      ...placed(goblin, goblin, wolf),
      finished: true,
    })
    expect(screen.getByText(t.confirm(3))).toBeInTheDocument()
    await user.click(screen.getByRole('switch', { name: t.hidden }))
    expect(onHidden).toHaveBeenCalledWith(true)
    await user.click(screen.getByRole('button', { name: t.back }))
    expect(onResume).toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: t.appear }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('shows the hidden switch as chosen, and the singular for one creature', () => {
    setup({ ...placed(goblin), finished: true, hidden: true })
    expect(screen.getByText('1 Kreatur erscheinen lassen?')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: t.hidden })).toBeChecked()
  })

  it('can’t send while offline, and says why; a failure shows as an alert', () => {
    setup({ ...placed(goblin), finished: true }, { connected: false, error: 'kaputt' })
    expect(screen.getByRole('button', { name: t.appear })).toBeDisabled()
    expect(screen.getByText(de.fog.needsConnection)).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('kaputt')
  })

  it('can’t send twice while the first is on its way', () => {
    setup({ ...placed(goblin), finished: true }, { busy: true })
    expect(screen.getByRole('button', { name: t.appear })).toBeDisabled()
  })
})
