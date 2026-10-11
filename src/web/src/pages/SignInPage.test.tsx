import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { json, mockApi, renderApp, testUser } from '../test/api'
import { de } from '../text/de'

function signedOut(googleEnabled = false) {
  return {
    'GET /api/auth/me': () => json(401),
    'GET /api/auth/options': () => json(200, { googleEnabled }),
  }
}

async function fillAndSubmit(email: string, password: string) {
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText(de.signIn.email), email)
  await user.type(screen.getByLabelText(de.signIn.password), password)
  await user.click(screen.getByRole('button', { name: de.signIn.submit }))
}

describe('SignInPage', () => {
  it('shows the German message for wrong credentials', async () => {
    const calls = mockApi({
      ...signedOut(),
      'POST /api/auth/login': () => json(400, { code: 'invalidCredentials' }),
    })
    renderApp('/anmelden')

    await fillAndSubmit('mira@example.org', 'falsch123')

    expect(await screen.findByRole('alert')).toHaveTextContent(de.errors.invalidCredentials)
    expect(calls.find((c) => c.path === '/api/auth/login')?.body).toEqual({
      email: 'mira@example.org',
      password: 'falsch123',
    })
  })

  it('returns to the page from ?zurueck after signing in', async () => {
    mockApi({
      ...signedOut(),
      'POST /api/auth/login': () => json(200, testUser),
    })
    const { router } = renderApp('/anmelden?zurueck=%2Fprofil')

    await fillAndSubmit('mira@example.org', 'geheim123')

    expect(await screen.findByRole('heading', { name: de.profile.title })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/profil')
  })

  it('ignores a return path that leaves the app', async () => {
    mockApi({
      ...signedOut(),
      'POST /api/auth/login': () => json(200, testUser),
      'GET /api/campaigns': () => json(200, []),
    })
    const { router } = renderApp('/anmelden?zurueck=%2F%2Fevil.example')

    await fillAndSubmit('mira@example.org', 'geheim123')

    expect(await screen.findByRole('heading', { name: de.home.title })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
  })

  it('offers Google only when the server has it, with the return path', async () => {
    mockApi(signedOut(true))
    renderApp('/anmelden?zurueck=%2Fkampagnen%2Fabc')

    const google = await screen.findByRole('link', { name: de.signIn.google })
    expect(google).toHaveAttribute('href', '/api/auth/google/login?returnUrl=%2Fkampagnen%2Fabc')
    expect(screen.getByText(de.signIn.inviteNote)).toBeInTheDocument()
  })

  it('hides Google when it is off', async () => {
    mockApi(signedOut(false))
    renderApp('/anmelden')

    await screen.findByLabelText(de.signIn.email)
    expect(screen.queryByRole('link', { name: de.signIn.google })).not.toBeInTheDocument()
  })

  it('shows the error from a Google redirect', async () => {
    mockApi(signedOut(true))
    renderApp('/anmelden?fehler=googleNoInvite')

    expect(await screen.findByRole('alert')).toHaveTextContent(de.errors.googleNoInvite)
  })

  it('shows a general message for an unknown redirect error', async () => {
    mockApi(signedOut())
    renderApp('/anmelden?fehler=%3Cscript%3E')

    expect(await screen.findByRole('alert')).toHaveTextContent(de.requestErrors.unknown)
  })
})
