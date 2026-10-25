// The session DM's initiative on the fight page (knowledge/features/initiative.md): rolling
// and the setup screen, the list over the board with selecting and reordering, changes from
// the DM's other devices, and ending it. Against the fake board and hub as in
// EncounterPage.test.tsx.
import { act, screen, within } from '@testing-library/react'
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  BoardState,
  BoardToken,
  InitiativeEntry,
  InitiativeView,
  SetInitiativeRequest,
} from '../api/types'
import { ids, smallBoard } from '../encounters/testing'
import type { TableHubCalls } from '../table/hub'
import { FakeHub, fakeTable } from '../table/testing'
import { json, mockApi, renderApp, testUser } from '../test/api'
import { de } from '../text/de'

vi.mock('../board/Board', async () => ({
  Board: (await import('../table/FakeTableBoard')).FakeTableBoard,
}))

const fightPath = `/kampagnen/${ids.campaign}/kampf/${ids.encounter}`
const t = de.initiative

const hero: BoardToken = {
  ...smallBoard().tokens[0]!,
  id: 't-hero',
  kind: 'character',
  characterId: 'ch-hero',
  creatureTypeId: null,
  ownerUserId: 'u-player',
  label: 'Held',
  x: 0,
  y: 0,
  colorIndex: 0,
}

const goblin = (id: string, label: string, x: number): BoardToken => ({
  ...smallBoard().tokens[0]!,
  id,
  label,
  x,
  y: 1,
})

const entry = (tokenId: string, value: number | null, rolls: number[] = []): InitiativeEntry => ({
  tokenId,
  value,
  modifier: 0,
  mode: 'normal',
  rolls,
})

function dmBoard(initiative: InitiativeView = { version: 0, entries: null }): BoardState {
  return {
    ...smallBoard({ status: 'active', sessionId: ids.session }),
    isSessionDm: true,
    viewer: 'dm',
    tokens: [hero, goblin('g1', 'Goblin 1', 0), goblin('g2', 'Goblin 2', 1)],
    initiative,
  }
}

let hub: FakeHub
let version: number

beforeEach(() => {
  hub = new FakeHub()
  version = 10
  hub.respond = (method: keyof TableHubCalls, args: unknown[]) => {
    if (method === 'RollInitiative')
      return {
        error: null,
        entries: [entry('t-hero', null), entry('g1', 9, [9]), entry('g2', 15, [15])],
      }
    if (method === 'SetInitiative') {
      const request = args[0] as SetInitiativeRequest
      return {
        error: null,
        change: {
          encounterId: ids.encounter,
          initiative: { version: version++, entries: request.entries },
        },
      }
    }
    if (method === 'ClearInitiative')
      return {
        error: null,
        change: { encounterId: ids.encounter, initiative: { version: version++, entries: null } },
      }
    return { error: null }
  }
  fakeTable.hub = hub
})

let boardLoads: () => number

function openFight(board: BoardState) {
  const calls = mockApi({
    'GET /api/auth/me': json(200, testUser),
    'GET /api/campaigns/:id/encounters/:eid/board': () => json(200, board),
  })
  boardLoads = () => calls.filter((call) => call.path.endsWith('/board')).length
  renderApp(fightPath)
  return userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never })
}

async function connected() {
  await vi.waitFor(() =>
    expect(screen.getByTestId('connection-indicator')).toHaveAttribute('data-status', 'connected'),
  )
  await vi.waitFor(() => expect(boardLoads()).toBeGreaterThanOrEqual(2))
  await act(async () => {})
}

const list = () => within(screen.getByTestId('initiative-list'))
/** The list's rows by their accessible names, top to bottom; `row` writes one. */
const rows = () =>
  list()
    .getAllByRole('button', { name: /auswählen/ })
    .map((button) => button.getAttribute('aria-label'))
const row = (label: string, value: number | null) => t.select(label, value)
const saved = () => (hub.calls('SetInitiative').at(-1)![0] as SetInitiativeRequest).entries

describe('rolling initiative', () => {
  it('is for the session DM only', async () => {
    openFight({ ...dmBoard(), isSessionDm: false, viewer: 'player', initiative: null })
    await connected()
    expect(screen.queryByRole('button', { name: t.roll })).not.toBeInTheDocument()
    expect(screen.queryByTestId('initiative-list')).not.toBeInTheDocument()
  })

  it('rolls the creatures, takes the players’ values and saves the list sorted', async () => {
    const user = openFight(dmBoard())
    await connected()

    await user.click(screen.getByRole('button', { name: t.roll }))
    const dialog = within(await screen.findByRole('dialog', { name: t.setupTitle }))
    expect(hub.calls('RollInitiative')).toEqual([[ids.encounter]])
    expect(dialog.getByRole('spinbutton', { name: t.valueOf('Goblin 2') })).toHaveValue(15)
    expect(dialog.getByRole('spinbutton', { name: t.valueOf('Held') })).toHaveValue(null)

    await user.type(dialog.getByRole('spinbutton', { name: t.valueOf('Held') }), '12')
    // A goblin's modifier moves its value with the roll.
    const modifier = dialog.getByRole('spinbutton', { name: t.modifierOf('Goblin 1') })
    await user.clear(modifier)
    await user.type(modifier, '4')
    expect(dialog.getByRole('spinbutton', { name: t.valueOf('Goblin 1') })).toHaveValue(13)
    await user.click(dialog.getByRole('button', { name: t.save }))

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(saved().map((e) => [e.tokenId, e.value])).toEqual([
      ['g2', 15],
      ['g1', 13],
      ['t-hero', 12],
    ])
    expect(rows()).toEqual([row('Goblin 2', 15), row('Goblin 1', 13), row('Held', 12)])
    expect(screen.queryByRole('button', { name: t.roll })).not.toBeInTheDocument()
  })
})

describe('the initiative list', () => {
  const on = {
    version: 4,
    entries: [entry('g2', 15), entry('t-hero', null), entry('gone', 20), entry('g1', 9)],
  }

  it('selects an entry’s token on the board and opens its card', async () => {
    const user = openFight(dmBoard(on))
    await connected()
    expect(rows()).toEqual([row('Goblin 2', 15), row('Held', null), row('Goblin 1', 9)])

    await user.click(list().getByRole('button', { name: t.select('Goblin 1', 9) }))

    expect(screen.getByText('Ausgewählt: Goblin 1')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: de.tokenCard.label })).toHaveTextContent('Goblin 1')
  })

  it('moves an entry with the arrow keys and keeps entries of removed tokens in place', async () => {
    const user = openFight(dmBoard(on))
    await connected()

    list()
      .getByRole('button', { name: t.handle('Goblin 2') })
      .focus()
    await user.keyboard('{ArrowDown}')

    expect(saved().map((e) => e.tokenId)).toEqual(['t-hero', 'gone', 'g2', 'g1'])
    await vi.waitFor(() =>
      expect(rows()).toEqual([row('Held', null), row('Goblin 2', 15), row('Goblin 1', 9)]),
    )
    expect(screen.getByText(t.moved('Goblin 2', 2))).toBeInTheDocument()
  })

  it('follows changes from the DM’s other devices, never an older version', async () => {
    openFight(dmBoard(on))
    await connected()

    act(() =>
      hub.latest.emit('InitiativeChanged', {
        encounterId: ids.encounter,
        initiative: { version: 5, entries: [entry('g1', 9), entry('g2', 15)] },
      }),
    )
    expect(rows()).toEqual([row('Goblin 1', 9), row('Goblin 2', 15)])
    act(() =>
      hub.latest.emit('InitiativeChanged', {
        encounterId: ids.encounter,
        initiative: { version: 3, entries: null },
      }),
    )
    expect(rows()).toEqual([row('Goblin 1', 9), row('Goblin 2', 15)])
  })

  it('edits the saved values and ends initiative after asking', async () => {
    const user = openFight(dmBoard(on))
    await connected()

    await user.click(list().getByRole('button', { name: t.edit }))
    const dialog = within(await screen.findByRole('dialog', { name: t.editTitle }))
    expect(hub.calls('RollInitiative')).toEqual([])
    await user.type(dialog.getByRole('spinbutton', { name: t.valueOf('Held') }), '18')
    await user.click(dialog.getByRole('button', { name: t.save }))
    await vi.waitFor(() =>
      expect(rows()).toEqual([row('Held', 18), row('Goblin 2', 15), row('Goblin 1', 9)]),
    )
    expect(saved().map((e) => e.tokenId)).toEqual(['gone', 't-hero', 'g2', 'g1'])

    await user.click(list().getByRole('button', { name: t.end }))
    expect(hub.calls('ClearInitiative')).toEqual([])
    await user.click(list().getByRole('button', { name: t.endConfirm }))
    expect(hub.calls('ClearInitiative')).toEqual([[ids.encounter]])
    await vi.waitFor(() => expect(screen.queryByTestId('initiative-list')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: t.roll })).toBeInTheDocument()
  })
})
