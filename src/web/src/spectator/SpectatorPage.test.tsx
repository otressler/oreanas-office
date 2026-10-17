import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Campaign, WatchResult, WatchedSession } from '../api/types'
import { ids, smallBoard } from '../encounters/testing'
import { FakeHub, fakeTable } from '../table/testing'
import { json, mockApi, renderApp, testUser } from '../test/api'
import { de } from '../text/de'
import { rememberScreen, rememberedScreen } from './remember'

vi.mock('../board/Board', async () => ({
  Board: (await import('../table/FakeTableBoard')).FakeTableBoard,
}))
vi.mock('../sharedTable/SharedScreenControls', () => ({
  SharedScreenControls: ({ encounterId }: { encounterId: string }) => (
    <div data-testid="shared-controls">{encounterId}</div>
  ),
}))

const t = de.spectator
const path = `/kampagnen/${ids.campaign}/sitzungen/${ids.session}/zuschauen`

function watchedSession(fields: Partial<WatchedSession> = {}): WatchedSession {
  return {
    sessionId: ids.session,
    campaignId: ids.campaign,
    title: 'Die Seilbrücke',
    date: '2026-10-17',
    status: 'active',
    playMode: 'byod',
    activeEncounterId: null,
    characters: [
      { name: 'Thorin', imageUrl: null, color: '#e63946', colorIndex: 0 },
      { name: 'Aria', imageUrl: '/api/assets/a1', color: '#2a9d8f', colorIndex: 1 },
    ],
    ...fields,
  }
}

const campaign = (myRole: Campaign['myRole']): Campaign => ({
  id: ids.campaign,
  name: 'Die Rabenküste',
  defaultDmUserId: testUser.id,
  myRole,
  joinCode: myRole === 'dm' ? 'KX7PQ2' : null,
  activeSessionId: ids.session,
  members: [],
})

let hub: FakeHub
let session: WatchedSession
let watchError: WatchResult['error']

beforeEach(() => {
  hub = new FakeHub()
  fakeTable.hub = hub
  session = watchedSession()
  watchError = null
  hub.respond = (method, args) => {
    if (method === 'WatchSession') {
      const shared = (args[0] as { sharedScreen: boolean }).sharedScreen
      return {
        error: watchError,
        mode: shared ? 'sharedScreen' : 'spectator',
        session: watchError ? null : session,
      } satisfies WatchResult
    }
    return method === 'JoinEncounter' ? { error: null } : undefined
  }
})

/** A member (the campaign is in their list) or, with `member` false, a session spectator. */
function open(options: { member?: boolean; role?: Campaign['myRole']; url?: string } = {}) {
  const { member = true, role = 'dm', url = path } = options
  const board = smallBoard({ status: 'active', sessionId: ids.session, viewer: 'player' })
  const calls = mockApi({
    'GET /api/auth/me': json(200, testUser),
    'GET /api/campaigns': json(
      200,
      member
        ? [{ id: ids.campaign, name: 'Die Rabenküste', myRole: role, activeSession: null }]
        : [],
    ),
    'GET /api/campaigns/:id': () => (member ? json(200, campaign(role)) : json(403)),
    'GET /api/sessions/:id/spectate': () => json(200, session),
    'GET /api/sessions/:id/spectate/board': () => json(200, board),
  })
  return { ...renderApp(url), calls }
}

/** The session connection is the first one; the fight's is the second. */
const sessionConnection = () => hub.connections[0]!
const fightConnection = () => hub.connections[1]!

describe('the spectator screen', () => {
  it('says a planned session has not started', async () => {
    session = watchedSession({ status: 'planned' })
    open()

    expect(await screen.findByText(t.notStarted)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Die Seilbrücke' })).toBeInTheDocument()
  })

  it('shows the QR code and the characters while the session runs without a fight', async () => {
    open()

    expect(await screen.findByText(t.waiting)).toBeInTheDocument()
    expect(await screen.findByRole('img', { name: t.qrLabel })).toBeInTheDocument()
    expect(screen.getByText('Thorin')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: t.portrait('Aria') })).toHaveAttribute(
      'src',
      '/api/assets/a1',
    )
  })

  it('shows no QR code to someone who does not know the join code', async () => {
    open({ role: 'player' })

    expect(await screen.findByText(t.waiting)).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: t.qrLabel })).not.toBeInTheDocument()
  })

  it('switches to a fight that starts and back when it ends, by itself', async () => {
    const { calls } = open()
    await screen.findByText(t.waiting)

    act(() =>
      sessionConnection().emit('EncounterStarted', {
        sessionId: ids.session,
        encounterId: ids.encounter,
      }),
    )

    expect(await screen.findByTestId('board')).toBeInTheDocument()
    // The players' board from the session's own endpoint, never the campaign's.
    expect(calls.map((call) => call.path)).toContain(`/api/sessions/${ids.session}/spectate/board`)
    expect(calls.some((call) => call.path.includes('/encounters/'))).toBe(false)
    // The fight's connection watches first, then joins.
    await waitFor(() => expect(hub.calls('JoinEncounter')).toEqual([[ids.encounter]]))
    expect(
      fightConnection()
        .invocations.map((call) => call.method)
        .slice(0, 2),
    ).toEqual(['WatchSession', 'JoinEncounter'])

    act(() => sessionConnection().emit('EncounterEnded', ids.encounter))

    expect(await screen.findByText(t.waiting)).toBeInTheDocument()
    expect(screen.queryByTestId('board')).not.toBeInTheDocument()
  })

  it('opens straight on a fight that is already running', async () => {
    session = watchedSession({ activeEncounterId: ids.encounter })
    open()

    expect(await screen.findByTestId('board')).toBeInTheDocument()
  })

  it('has no controls: a tap on the map shows nothing', async () => {
    session = watchedSession({ activeEncounterId: ids.encounter })
    open()
    await screen.findByTestId('board')

    await userEvent.click(screen.getByRole('button', { name: 'Feld 0,0' }))

    expect(screen.queryByText(/^Info /)).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: de.tokenCard.label })).not.toBeInTheDocument()
  })

  it('shows "Sitzung beendet" when the session ends, and disconnects', async () => {
    open()
    await screen.findByText(t.waiting)

    act(() => sessionConnection().emit('SessionEnded', ids.session))

    expect(await screen.findByText(t.ended)).toBeInTheDocument()
    expect(sessionConnection().state).toBe('stopped')
  })

  it('tells someone without access so', async () => {
    watchError = 'tokenNotFound'
    open({ member: false })

    expect(await screen.findByText(t.denied)).toBeInTheDocument()
  })

  it('remembers that the device is the session’s screen', async () => {
    open()
    await screen.findByText(t.waiting)

    expect(rememberedScreen()).toMatchObject({
      userId: testUser.id,
      campaignId: ids.campaign,
      sessionId: ids.session,
      sharedScreen: false,
    })
  })
})

describe('the corner menu', () => {
  it('takes a member back to the session page and forgets the screen', async () => {
    const { router } = open()
    await screen.findByText(t.waiting)

    await userEvent.click(screen.getByRole('button', { name: t.menuLabel }))
    await userEvent.click(screen.getByRole('menuitem', { name: t.leave }))

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        `/kampagnen/${ids.campaign}/sitzungen/${ids.session}`,
      ),
    )
    expect(rememberedScreen()).toBeNull()
  })

  it('takes a session spectator to the join page of the code they joined with', async () => {
    rememberScreen({
      userId: testUser.id,
      campaignId: ids.campaign,
      sessionId: ids.session,
      sharedScreen: false,
      joinCode: 'KX7PQ2',
    })
    const { router } = open({ member: false })
    await screen.findByText(t.waiting)

    await userEvent.click(screen.getByRole('button', { name: t.menuLabel }))
    await userEvent.click(screen.getByRole('menuitem', { name: t.leave }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/beitreten/KX7PQ2'))
    expect(router.state.location.search).toBe(`?sitzung=${ids.session}`)
    expect(rememberedScreen()).toBeNull()
  })

  it('offers "Ganze Karte" only while a fight shows', async () => {
    open()
    await screen.findByText(t.waiting)
    await userEvent.click(screen.getByRole('button', { name: t.menuLabel }))
    expect(screen.queryByRole('menuitem', { name: t.fit })).not.toBeInTheDocument()
  })
})

describe('as a shared screen', () => {
  it('lays the shared table’s controls over the fight in local mode', async () => {
    session = watchedSession({ activeEncounterId: ids.encounter, playMode: 'local' })
    open({ url: `${path}?gemeinsam=1` })

    expect(await screen.findByTestId('shared-controls')).toHaveTextContent(ids.encounter)
    expect(hub.calls('WatchSession')[0]).toEqual([{ sessionId: ids.session, sharedScreen: true }])
    await waitFor(() => expect(hub.calls('JoinEncounter')).toHaveLength(1))
    expect(
      fightConnection().invocations.find((call) => call.method === 'WatchSession')?.args,
    ).toEqual([{ sessionId: ids.session, sharedScreen: true }])
    expect(rememberedScreen()?.sharedScreen).toBe(true)
  })

  it('has no controls outside local mode, nor on a plain spectator screen', async () => {
    session = watchedSession({ activeEncounterId: ids.encounter })
    open({ url: `${path}?gemeinsam=1` })
    await screen.findByTestId('board')
    expect(screen.queryByTestId('shared-controls')).not.toBeInTheDocument()

    act(() =>
      sessionConnection().emit('PlayModeChanged', { sessionId: ids.session, playMode: 'local' }),
    )
    expect(await screen.findByTestId('shared-controls')).toBeInTheDocument()
    act(() =>
      sessionConnection().emit('PlayModeChanged', { sessionId: ids.session, playMode: 'byod' }),
    )
    await waitFor(() => expect(screen.queryByTestId('shared-controls')).not.toBeInTheDocument())
  })

  it('never gets controls as a plain spectator screen, even in local mode', async () => {
    session = watchedSession({ activeEncounterId: ids.encounter, playMode: 'local' })
    open()

    await screen.findByTestId('board')
    expect(screen.queryByTestId('shared-controls')).not.toBeInTheDocument()
  })
})
