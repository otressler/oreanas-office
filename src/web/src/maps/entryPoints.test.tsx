// The ways to the map pages: the campaign page for dm members, and the server gate's
// offline and waking screens for a remembered user.
import { act, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Campaign } from '../api/types'
import { offlineDb } from '../offline/db'
import { rememberUser } from '../offline/identity'
import { ServerGate } from '../server/ServerGate'
import { GRACE_MS, resetServerGate } from '../server/serverStatus'
import { json, mockApi, renderApp, testUser } from '../test/api'
import { de } from '../text/de'

const t = de.maps

describe('campaign page', () => {
  function api(myRole: Campaign['myRole']) {
    return mockApi({
      'GET /api/auth/me': json(200, testUser),
      'GET /api/campaigns/:id': () =>
        json(200, {
          id: 'c1',
          name: 'Die Rabenküste',
          defaultDmUserId: testUser.id,
          myRole,
          joinCode: null,
          activeSessionId: null,
          members: [],
          description: null,
          coverUrl: null,
        } satisfies Campaign),
      'GET /api/campaigns/:id/characters': () => json(200, []),
      'GET /api/campaigns/:id/sessions': () => json(200, []),
      'GET /api/campaigns/:id/encounters': () => json(200, []),
    })
  }

  it('links dm members to the map list and keeps the campaign for offline use', async () => {
    api('dm')
    rememberUser(testUser)
    renderApp('/kampagnen/c1')

    expect(await screen.findByRole('link', { name: new RegExp(t.campaignLink) })).toHaveAttribute(
      'href',
      '/kampagnen/c1/karten',
    )
    await vi.waitFor(async () =>
      expect(await offlineDb(testUser.id).campaigns.get('c1')).toMatchObject({
        name: 'Die Rabenküste',
        myRole: 'dm',
      }),
    )
  })

  it('has no map link for players', async () => {
    api('player')
    renderApp('/kampagnen/c1')
    expect(await screen.findByRole('heading', { name: 'Die Rabenküste' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: new RegExp(t.campaignLink) })).toBeNull()
  })
})

describe('server gate', () => {
  beforeEach(() => {
    // Other tests render the app with the server marked as awake.
    resetServerGate()
  })

  afterEach(() => {
    resetServerGate()
    vi.useRealTimers()
  })

  function goOffline() {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    vi.stubGlobal('fetch', vi.fn())
  }

  it('offers the offline maps while offline, also outside a router', async () => {
    goOffline()
    rememberUser(testUser)
    render(<ServerGate>Tisch</ServerGate>)

    const link = await screen.findByRole('link', { name: t.gateOffline })
    expect(link).toHaveAttribute('href', '/karten')
  })

  it('opens the offline maps inside the app', async () => {
    goOffline()
    rememberUser(testUser)
    const router = createMemoryRouter([
      { path: '/', element: <ServerGate>Tisch</ServerGate> },
      { path: '/karten', element: <p>Karten-Seite</p> },
    ])
    render(<RouterProvider router={router} />)

    const link = await screen.findByRole('link', { name: t.gateOffline })
    act(() => link.click())
    expect(await screen.findByText('Karten-Seite')).toBeInTheDocument()
  })

  it('offers the offline maps while the server wakes', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(503, { status: 'waking' })),
    )
    rememberUser(testUser)
    render(<ServerGate>Tisch</ServerGate>)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(GRACE_MS)
    })
    expect(screen.getByText(de.serverGate.wakingTitle)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: t.gateWaking })).toHaveAttribute('href', '/karten')
  })

  it('has no link without a remembered user', async () => {
    goOffline()
    render(<ServerGate>Tisch</ServerGate>)
    expect(await screen.findByText(de.serverGate.offlineTitle)).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
  })
})
