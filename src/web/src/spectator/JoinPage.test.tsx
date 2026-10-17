import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { Campaign, JoinLookupResponse } from '../api/types'
import { ids, session } from '../encounters/testing'
import { json, mockApi, renderApp, testUser } from '../test/api'
import { de } from '../text/de'
import { cleanJoinCode, defaultSession } from './joinCode'
import { rememberedScreen } from './remember'

const t = de.spectator

const lookup = (fields: Partial<JoinLookupResponse> = {}): JoinLookupResponse => ({
  campaignId: ids.campaign,
  campaignName: 'Die Rabenküste',
  isMember: false,
  sessions: [
    { id: 'planned', title: 'Später', date: '2026-11-01', status: 'planned' },
    { id: ids.session, title: 'Die Seilbrücke', date: '2026-10-17', status: 'active' },
  ],
  ...fields,
})

function open(url: string, data = lookup()) {
  const calls = mockApi({
    'GET /api/auth/me': json(200, testUser),
    'GET /api/join/:code': () => json(200, data),
    'POST /api/join/:code/spectate': (call) =>
      json(200, {
        campaignId: ids.campaign,
        sessionId: (call.body as { sessionId: string }).sessionId,
        isMember: data.isMember,
      }),
    'POST /api/campaigns/join': json(200, {
      id: ids.campaign,
      name: 'Die Rabenküste',
      myRole: 'player',
      activeSession: null,
    } satisfies Pick<Campaign, 'id' | 'name' | 'myRole'> & { activeSession: null }),
    'GET /api/campaigns': json(200, []),
    'GET /api/sessions/:id/spectate': json(200, session()),
  })
  return { ...renderApp(url), calls }
}

describe('join code helpers', () => {
  it('ignores case, spaces and dashes', () => {
    expect(cleanJoinCode(' kx7-pq 2 ')).toBe('KX7PQ2')
  })

  it('starts on the running session', () => {
    expect(defaultSession(lookup().sessions)).toBe(ids.session)
    expect(defaultSession([])).toBe('')
  })
})

describe('the join page', { timeout: 40_000 }, () => {
  it('offers both choices and preselects the running session', async () => {
    open('/beitreten/KX7PQ2')

    expect(await screen.findByRole('heading', { name: t.play })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Die Seilbrücke/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /Später/ })).not.toBeChecked()
    expect(screen.getByRole('button', { name: t.watch })).toBeEnabled()
  })

  it('"Mitspielen" joins the campaign and opens it', async () => {
    const { router, calls } = open('/beitreten/KX7PQ2')
    await userEvent.click(await screen.findByRole('button', { name: t.play }))

    await waitFor(() => expect(router.state.location.pathname).toBe(`/kampagnen/${ids.campaign}`))
    expect(calls.find((c) => c.path === '/api/campaigns/join')?.body).toEqual({ code: 'KX7PQ2' })
  })

  it('"Nur zuschauen" joins the picked session and opens the screen', async () => {
    const { router, calls } = open('/beitreten/KX7PQ2')
    await userEvent.click(await screen.findByRole('radio', { name: /Später/ }))
    await userEvent.click(screen.getByRole('button', { name: t.watch }))

    // The screen's route loads on demand, which takes a while in a cold run.
    await waitFor(
      () =>
        expect(router.state.location.pathname).toBe(
          `/kampagnen/${ids.campaign}/sitzungen/planned/zuschauen`,
        ),
      { timeout: 30_000 },
    )
    expect(calls.find((c) => c.path.endsWith('/spectate') && c.method === 'POST')?.body).toEqual({
      sessionId: 'planned',
    })
    expect(rememberedScreen()).toMatchObject({ sessionId: 'planned', joinCode: 'KX7PQ2' })
  })

  it('uses the session from the link without a picker, and never turns a member away', async () => {
    const { router } = open(`/beitreten/KX7PQ2?sitzung=${ids.session}`, lookup({ isMember: true }))

    expect(await screen.findByText(t.joinMember)).toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: t.watch }))
    await waitFor(() => expect(router.state.location.pathname).toContain('/zuschauen'), {
      timeout: 30_000,
    })
  })

  it('says so when no session is there to watch', async () => {
    open('/beitreten/KX7PQ2', lookup({ sessions: [] }))

    expect(await screen.findByText(t.noSessions)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: t.watch })).toBeDisabled()
    expect(screen.getByRole('button', { name: t.play })).toBeEnabled()
  })

  it('reports a code that does not exist', async () => {
    mockApi({
      'GET /api/auth/me': json(200, testUser),
      'GET /api/join/:code': json(400, { code: 'joinCodeInvalid', field: 'code' }),
    })
    renderApp('/beitreten/ZZZZZZ')

    expect(await screen.findByText(t.joinInvalid)).toBeInTheDocument()
  })
})

describe('the home page’s join form', () => {
  it('reaches the same choice, and still joins directly', async () => {
    mockApi({
      'GET /api/auth/me': json(200, testUser),
      'GET /api/campaigns': json(200, []),
      'GET /api/join/:code': json(200, lookup()),
    })
    const { router } = renderApp('/')
    await userEvent.type(await screen.findByLabelText(de.home.joinCode), 'kx7 pq2')

    expect(screen.getByRole('button', { name: de.home.join })).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: t.joinFormWatch }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/beitreten/KX7PQ2'))
  })
})
