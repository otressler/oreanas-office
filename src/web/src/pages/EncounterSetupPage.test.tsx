import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { character, encounter, ids, session, smallBoard } from '../encounters/testing'
import { json, mockApi, renderApp, testUser } from '../test/api'
import { de } from '../text/de'

vi.mock('../board/Board', async () => ({
  Board: (await import('../encounters/FakeBoard')).FakeBoard,
}))

const t = de.encounters.setup
const setupPath = `/kampagnen/${ids.campaign}/sitzungen/${ids.session}/kampf/${ids.encounter}/aufstellen`
const ilse = character('Ilse', { size: 'small' })
const brom = character('Brom')

function api(extra = {}, sessions = [session()]) {
  return mockApi({
    'GET /api/auth/me': json(200, testUser),
    'GET /api/campaigns/:id/encounters/:eid/board': () => json(200, smallBoard()),
    'GET /api/campaigns/:id/characters': () => json(200, [brom, ilse]),
    'GET /api/campaigns/:id/sessions': () => json(200, sessions),
    ...extra,
  })
}

describe('EncounterSetupPage', () => {
  it('places a ticked character on a free cell and starts the fight', async () => {
    const calls = api({
      'POST /api/campaigns/:id/sessions/:sid/encounters/:eid/start': () =>
        json(200, encounter({ status: 'active', sessionId: ids.session })),
    })
    const { router } = renderApp(setupPath)
    const user = userEvent.setup()

    await user.click(await screen.findByRole('checkbox', { name: t.takesPart('Ilse') }))
    expect(screen.getByText(t.pickCell('Ilse'))).toBeInTheDocument()
    // Six free cells: not the wall at 3,1, not under the goblin at 3,0.
    const board = screen.getByTestId('board')
    expect(within(board).getAllByRole('button', { name: /^Feld/ })).toHaveLength(6)
    expect(within(board).queryByRole('button', { name: 'Feld 3,0' })).not.toBeInTheDocument()

    await user.click(within(board).getByRole('button', { name: 'Feld 1,1' }))
    expect(within(board).getByRole('button', { name: 'Figur Ilse auf 1,1' })).toBeInTheDocument()
    expect(screen.getByText(t.pickCharacter)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: t.start }))
    expect(await screen.findByRole('heading', { name: 'Kleine Lichtung' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(`/kampagnen/${ids.campaign}/kampf/${ids.encounter}`)
    expect(calls.find((c) => c.method === 'POST')).toMatchObject({
      path: `/api/campaigns/${ids.campaign}/sessions/${ids.session}/encounters/${ids.encounter}/start`,
      body: { characters: [{ characterId: ilse.id, x: 1, y: 1 }] },
    })
  })

  it('moves a placed character by tapping its token, and refuses an occupied cell', async () => {
    api()
    renderApp(setupPath)
    const user = userEvent.setup()

    await user.click(await screen.findByRole('checkbox', { name: t.takesPart('Brom') }))
    const board = screen.getByTestId('board')
    await user.click(within(board).getByRole('button', { name: 'Feld 0,0' }))

    await user.click(within(board).getByRole('button', { name: 'Figur Brom auf 0,0' }))
    expect(screen.getByText(t.pickCell('Brom'))).toBeInTheDocument()
    // Tapping the goblin's cell: no room there.
    await user.click(within(board).getByRole('button', { name: 'Figur Goblin 1 auf 3,0' }))
    expect(screen.getByRole('alert')).toHaveTextContent(t.noRoom('Brom'))
    await user.click(within(board).getByRole('button', { name: 'Feld 2,0' }))
    expect(within(board).getByRole('button', { name: 'Figur Brom auf 2,0' })).toBeInTheDocument()

    // Unticking takes the token off the board.
    await user.click(screen.getByRole('checkbox', { name: t.takesPart('Brom') }))
    expect(within(board).queryByRole('button', { name: /Figur Brom/ })).not.toBeInTheDocument()
  })

  it('wants every ticked character placed before starting', async () => {
    const calls = api()
    renderApp(setupPath)
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: t.start }))
    expect(screen.getByRole('alert')).toHaveTextContent(t.noneTicked)

    await user.click(screen.getByRole('checkbox', { name: t.takesPart('Brom') }))
    await user.click(screen.getByRole('checkbox', { name: t.takesPart('Ilse') }))
    await user.click(screen.getByRole('button', { name: t.start }))
    expect(screen.getByRole('alert')).toHaveTextContent(t.unplaced('Brom, Ilse'))
    expect(calls.some((c) => c.method === 'POST')).toBe(false)

    await user.click(screen.getByRole('button', { name: t.autoPlace }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getAllByText(new RegExp(t.placed))).toHaveLength(2)
  })

  it('names the character the server rejected', async () => {
    api({
      'POST /api/campaigns/:id/sessions/:sid/encounters/:eid/start': () =>
        json(400, { code: 'placementInvalid', field: 'characters[0]' }),
    })
    renderApp(setupPath)
    const user = userEvent.setup()

    await user.click(await screen.findByRole('checkbox', { name: t.takesPart('Ilse') }))
    await user.click(screen.getByRole('button', { name: 'Feld 0,1' }))
    await user.click(screen.getByRole('button', { name: t.start }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      `${de.errors.placementInvalid} ${t.concerns('Ilse')}`,
    )
  })

  it('is only for the DM of the running session', async () => {
    api({}, [session({ isSessionDm: false })])
    renderApp(setupPath)

    expect(await screen.findByText(t.notSessionDm)).toBeInTheDocument()
    expect(screen.queryByTestId('board')).not.toBeInTheDocument()
  })
})
