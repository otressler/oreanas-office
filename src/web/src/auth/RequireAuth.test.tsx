import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { json, mockApi, renderApp, testUser } from '../test/api'
import { de } from '../text/de'

const CAMPAIGN_ID = '11111111-1111-1111-1111-111111111111'

describe('RequireAuth', () => {
  it('sends a signed-out user to the sign-in page, remembering where they wanted to go', async () => {
    mockApi({
      'GET /api/auth/me': () => json(401),
      'GET /api/auth/options': () => json(200, { googleEnabled: false }),
    })
    const { router } = renderApp(`/kampagnen/${CAMPAIGN_ID}`)

    expect(await screen.findByRole('heading', { name: de.signIn.title })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/anmelden')
    expect(new URLSearchParams(router.state.location.search).get('zurueck')).toBe(
      `/kampagnen/${CAMPAIGN_ID}`,
    )
  })

  it('sends a signed-out user from home to the plain sign-in page', async () => {
    mockApi({
      'GET /api/auth/me': () => json(401),
      'GET /api/auth/options': () => json(200, { googleEnabled: false }),
    })
    const { router } = renderApp('/')

    await screen.findByRole('heading', { name: de.signIn.title })
    expect(router.state.location.pathname + router.state.location.search).toBe('/anmelden')
  })

  it('shows the page and the name in the header when signed in', async () => {
    mockApi({
      'GET /api/auth/me': () => json(200, testUser),
      'GET /api/campaigns': () => json(200, []),
    })
    renderApp('/')

    expect(await screen.findByRole('heading', { name: de.home.title })).toBeInTheDocument()
    expect(await screen.findByText(de.home.empty)).toBeInTheDocument()
    const profile = screen.getByRole('link', { name: de.header.profile(testUser.displayName) })
    expect(profile).toHaveAttribute('href', '/profil')
    expect(profile).toHaveTextContent(testUser.displayName)
  })

  it('goes to sign-in when a request finds the sign-in expired', async () => {
    mockApi({
      'GET /api/auth/me': () => json(200, testUser),
      'GET /api/auth/options': () => json(200, { googleEnabled: false }),
      'GET /api/campaigns': () => json(401),
    })
    const { router } = renderApp('/')

    expect(await screen.findByRole('heading', { name: de.signIn.title })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/anmelden')
  })

  it('hides the admin page from non-admins', async () => {
    mockApi({ 'GET /api/auth/me': () => json(200, testUser) })
    renderApp('/admin')

    expect(await screen.findByRole('heading', { name: de.notFound.title })).toBeInTheDocument()
  })

  it('shows the admin page to the admin, and the link to it in the profile', async () => {
    mockApi({
      'GET /api/auth/me': () => json(200, { ...testUser, isAdmin: true }),
      'GET /api/auth/options': () => json(200, { googleEnabled: false }),
      'GET /api/admin/invites': () => json(200, []),
      'GET /api/admin/users': () => json(200, []),
    })
    renderApp('/profil')

    await userEvent.click(await screen.findByRole('link', { name: de.profile.admin }))
    expect(await screen.findByRole('heading', { name: de.admin.title })).toBeInTheDocument()
    expect(await screen.findByText(de.admin.noInvites)).toBeInTheDocument()
  })
})
