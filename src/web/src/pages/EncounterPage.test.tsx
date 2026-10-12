import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { encounter, ids, smallBoard } from '../encounters/testing'
import { json, mockApi, renderApp, testUser } from '../test/api'
import { de } from '../text/de'

vi.mock('../board/Board', async () => ({
  Board: (await import('../encounters/FakeBoard')).FakeBoard,
}))

const fightPath = `/kampagnen/${ids.campaign}/kampf/${ids.encounter}`
const running = smallBoard({ status: 'active', sessionId: ids.session })

describe('EncounterPage', () => {
  it('shows the board to a player, without the end button', async () => {
    mockApi({
      'GET /api/auth/me': json(200, testUser),
      'GET /api/campaigns/:id/encounters/:eid/board': () => json(200, running),
    })
    renderApp(fightPath)

    expect(await screen.findByRole('heading', { name: 'Kleine Lichtung' })).toBeInTheDocument()
    expect(screen.getByTestId('board')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: de.encounters.back })).toHaveAttribute(
      'href',
      `/kampagnen/${ids.campaign}`,
    )
    expect(screen.queryByRole('button', { name: de.encounters.end })).not.toBeInTheDocument()
  })

  it('says the fight is over when a player gets 404', async () => {
    mockApi({
      'GET /api/auth/me': json(200, testUser),
      'GET /api/campaigns/:id/encounters/:eid/board': () => json(404),
    })
    renderApp(fightPath)

    expect(
      await screen.findByRole('heading', { name: de.encounters.overTitle }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: de.encounters.back })).toBeInTheDocument()
  })

  it('says the fight is over when the board is ended', async () => {
    mockApi({
      'GET /api/auth/me': json(200, testUser),
      'GET /api/campaigns/:id/encounters/:eid/board': () =>
        json(200, { ...running, status: 'ended' }),
    })
    renderApp(fightPath)

    expect(
      await screen.findByRole('heading', { name: de.encounters.overTitle }),
    ).toBeInTheDocument()
  })

  it('lets the session DM end the fight after confirming, then goes to the campaign', async () => {
    const calls = mockApi({
      'GET /api/auth/me': json(200, testUser),
      'GET /api/campaigns/:id/encounters/:eid/board': () =>
        json(200, { ...running, isSessionDm: true }),
      'POST /api/campaigns/:id/sessions/:sid/encounters/:eid/end': () =>
        json(200, encounter({ status: 'ended', sessionId: ids.session })),
    })
    const { router } = renderApp(fightPath)
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: de.encounters.end }))
    expect(screen.getByText(de.encounters.endQuestion)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: de.encounters.endConfirm }))

    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe(`/kampagnen/${ids.campaign}`),
    )
    expect(calls.find((c) => c.method === 'POST')?.path).toBe(
      `/api/campaigns/${ids.campaign}/sessions/${ids.session}/encounters/${ids.encounter}/end`,
    )
  })
})
