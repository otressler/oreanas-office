import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createQueryClient } from '../api/queryClient'
import type { Campaign, Session } from '../api/types'
import { character, ids, session } from '../encounters/testing'
import { json, mockApi } from '../test/api'
import { de } from '../text/de'
import { SessionPlayersPanel } from './SessionPlayersPanel'

const t = de.sessionPage.players

const campaign: Campaign = {
  id: ids.campaign,
  name: 'Die Rabenküste',
  defaultDmUserId: 'u-dm',
  myRole: 'dm',
  joinCode: 'KX7PQ2',
  activeSessionId: ids.session,
  members: [
    { userId: 'u-dm', displayName: 'Oreana', role: 'dm', joinedAt: '2026-10-01T00:00:00Z' },
    { userId: 'u-mira', displayName: 'Mira', role: 'player', joinedAt: '2026-10-02T00:00:00Z' },
    { userId: 'u-brom', displayName: 'Brom', role: 'player', joinedAt: '2026-10-03T00:00:00Z' },
  ],
  description: null,
  coverUrl: null,
}

const characters = [
  character('Aria', { id: 'ch-aria', ownerUserId: 'u-mira', ownerDisplayName: 'Mira' }),
  character('Thorin', { id: 'ch-thorin', ownerUserId: 'u-brom', ownerDisplayName: 'Brom' }),
]

/** Thorin goes to Mira for this session. */
const handedOver = [{ characterId: 'ch-thorin', userId: 'u-mira', displayName: 'Mira' }]

function renderPanel(current: Session) {
  const calls = mockApi({
    'GET /api/campaigns/:id/characters': () => json(200, characters),
    'PUT /api/campaigns/:id/sessions/:sid/characters/:characterId/player': () => json(200, current),
  })
  render(
    <QueryClientProvider client={createQueryClient()}>
      <SessionPlayersPanel campaign={campaign} session={current} />
    </QueryClientProvider>,
  )
  return calls
}

const row = (name: string) => screen.getByText(name).closest('li') as HTMLElement

describe('SessionPlayersPanel', () => {
  it('shows who plays each character, and who it was handed over from', async () => {
    renderPanel(session({ isSessionDm: false, characterPlayers: handedOver }))

    expect(await screen.findByRole('region', { name: t.title })).toBeInTheDocument()
    expect(within(row('Aria')).getByText(t.playedBy('Mira'))).toBeInTheDocument()
    expect(within(row('Thorin')).getByText(t.playedBy('Mira'))).toBeInTheDocument()
    expect(within(row('Thorin')).getByText(t.handedOver('Brom'))).toBeInTheDocument()
    // Only the session DM changes it.
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByText(t.help)).toBeNull()
  })

  it('lets the session DM hand a character to another member', async () => {
    const calls = renderPanel(session({ isSessionDm: true }))
    const user = userEvent.setup()

    const field = await screen.findByLabelText(t.field('Thorin'))
    expect(field).toHaveValue('u-brom')
    expect(within(field).getByRole('option', { name: t.ownerOption('Brom') })).toBeInTheDocument()
    await user.selectOptions(field, 'Oreana')

    await vi.waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true))
    const put = calls.find((c) => c.method === 'PUT')!
    expect(put.path).toBe(
      `/api/campaigns/${ids.campaign}/sessions/${ids.session}/characters/ch-thorin/player`,
    )
    expect(put.body).toEqual({ userId: 'u-dm' })
  })

  it('gives a character back by picking its owner', async () => {
    const calls = renderPanel(session({ isSessionDm: true, characterPlayers: handedOver }))
    const user = userEvent.setup()

    const field = await screen.findByLabelText(t.field('Thorin'))
    expect(field).toHaveValue('u-mira')
    await user.selectOptions(field, t.ownerOption('Brom'))

    await vi.waitFor(() =>
      expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({ userId: 'u-brom' }),
    )
  })

  it('shows an ended session without changes', async () => {
    renderPanel(session({ isSessionDm: true, status: 'ended', characterPlayers: handedOver }))

    expect(await screen.findByText(t.handedOver('Brom'))).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).toBeNull()
  })
})
