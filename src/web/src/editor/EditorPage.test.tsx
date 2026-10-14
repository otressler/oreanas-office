import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { mockApi, renderApp } from '../test/api'
import { de } from '../text/de'
import { emptyMap } from './model'
import { CAMPAIGN_ID, renderEditor, seedMap, seedOffline } from './testing'

describe('EditorPage', () => {
  it('opens a map from the browser without asking the server', async () => {
    const calls = mockApi({})
    await renderEditor(emptyMap('Schluchtübergang', 12, 8))

    expect(await screen.findByRole('heading', { name: 'Schluchtübergang' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Zur Kartenliste/ })).toHaveAttribute(
      'href',
      `/kampagnen/${CAMPAIGN_ID}/karten`,
    )
    // Only the header's profile link and the sync's pull on opening ask, since the test
    // marks the server as awake; the map itself comes from the browser.
    expect(
      calls.filter((c) => c.path !== '/api/auth/me' && c.path !== '/api/campaigns'),
    ).toHaveLength(0)
  })

  it('says when the map isn’t on this device', async () => {
    mockApi({})
    await seedOffline()
    renderApp(`/kampagnen/${CAMPAIGN_ID}/karten/00000000-0000-0000-0000-00000000abcd`)
    expect(
      await screen.findByRole('heading', { name: de.editor.notFoundTitle }),
    ).toBeInTheDocument()
  })

  it('is only for the campaign’s dm members', async () => {
    mockApi({})
    await seedOffline({ role: 'player' })
    const record = await seedMap()
    renderApp(`/kampagnen/${CAMPAIGN_ID}/karten/${record.id}`)
    expect(await screen.findByRole('heading', { name: de.editor.notDmTitle })).toBeInTheDocument()
  })

  it('sends someone without a remembered user to the sign-in page', async () => {
    mockApi({ 'GET /api/auth/me': () => new Response(null, { status: 401 }) })
    const { router } = renderApp(`/kampagnen/${CAMPAIGN_ID}/karten/x`)
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/anmelden'))
  })

  it('shows a hint instead of the editor on small screens', async () => {
    mockApi({})
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    await renderEditor()
    expect(await screen.findByRole('heading', { name: de.editor.narrowTitle })).toBeInTheDocument()
  })
})
