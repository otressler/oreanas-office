import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { json, mockApi, renderApp, testUser } from '../test/api'
import { de } from '../text/de'

const TOKEN = 'abc123'

function api(invite: { valid: boolean; expiresAt: string | null }, extra = {}) {
  return mockApi({
    'GET /api/auth/me': () => json(401),
    'GET /api/auth/options': () => json(200, { googleEnabled: true }),
    'GET /api/auth/invites/:token': () => json(200, invite),
    ...extra,
  })
}

describe('InvitePage', () => {
  it('says the link has expired and offers no form', async () => {
    api({ valid: false, expiresAt: null })
    renderApp(`/einladung/${TOKEN}`)

    expect(await screen.findByRole('heading', { name: de.invite.invalidTitle })).toBeInTheDocument()
    expect(screen.getByText(de.invite.invalidBody)).toBeInTheDocument()
    expect(screen.queryByLabelText(de.invite.email)).not.toBeInTheDocument()
  })

  it('registers through a valid link and lands on the home page', async () => {
    const calls = api(
      { valid: true, expiresAt: '2026-10-11T18:30:00Z' },
      {
        'POST /api/auth/register': () => json(200, testUser),
        'GET /api/campaigns': () => json(200, []),
      },
    )
    const { router } = renderApp(`/einladung/${TOKEN}`)
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText(de.invite.displayName), '  Mira ')
    await user.type(screen.getByLabelText(de.invite.email), 'mira@example.org')
    await user.type(screen.getByLabelText(de.invite.password), 'geheim123')
    await user.click(screen.getByRole('button', { name: de.invite.submit }))

    expect(await screen.findByRole('heading', { name: de.home.title })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    expect(calls.find((c) => c.path === '/api/auth/register')?.body).toEqual({
      inviteToken: TOKEN,
      displayName: 'Mira',
      email: 'mira@example.org',
      password: 'geheim123',
    })
  })

  it('checks the password length before asking the server', async () => {
    const calls = api({ valid: true, expiresAt: '2026-10-11T18:30:00Z' })
    renderApp(`/einladung/${TOKEN}`)
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText(de.invite.displayName), 'Mira')
    await user.type(screen.getByLabelText(de.invite.email), 'mira@example.org')
    await user.type(screen.getByLabelText(de.invite.password), 'kurz')
    await user.click(screen.getByRole('button', { name: de.invite.submit }))

    expect(await screen.findByRole('alert')).toHaveTextContent(de.errors.passwordTooShort)
    expect(calls.some((c) => c.path === '/api/auth/register')).toBe(false)
  })

  it('shows the server error when the link expires while filling in', async () => {
    api(
      { valid: true, expiresAt: '2026-10-11T18:30:00Z' },
      { 'POST /api/auth/register': () => json(400, { code: 'inviteInvalid' }) },
    )
    renderApp(`/einladung/${TOKEN}`)
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText(de.invite.displayName), 'Mira')
    await user.type(screen.getByLabelText(de.invite.email), 'mira@example.org')
    await user.type(screen.getByLabelText(de.invite.password), 'geheim123')
    await user.click(screen.getByRole('button', { name: de.invite.submit }))

    expect(await screen.findByRole('alert')).toHaveTextContent(de.errors.inviteInvalid)
  })

  it('offers Google registration with the invite', async () => {
    api({ valid: true, expiresAt: '2026-10-11T18:30:00Z' })
    renderApp(`/einladung/${TOKEN}`)

    expect(await screen.findByRole('link', { name: de.invite.google })).toHaveAttribute(
      'href',
      `/api/auth/google/login?returnUrl=%2F&invite=${TOKEN}`,
    )
  })

  it('tells a signed-in user so, with a way home', async () => {
    mockApi({ 'GET /api/auth/me': () => json(200, testUser) })
    renderApp(`/einladung/${TOKEN}`)

    expect(
      await screen.findByRole('heading', { name: de.invite.signedInTitle }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: de.common.toHome })).toHaveAttribute('href', '/')
  })
})
