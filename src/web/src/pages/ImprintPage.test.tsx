import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { json, mockApi, renderApp } from '../test/api'
import { de } from '../text/de'

const t = de.imprint

function stubDetails() {
  vi.stubEnv('VITE_IMPRINT_NAME', 'Erika Mustermann')
  vi.stubEnv('VITE_IMPRINT_STREET', 'Musterstraße 1')
  vi.stubEnv('VITE_IMPRINT_CITY', '12345 Musterstadt')
  vi.stubEnv('VITE_IMPRINT_EMAIL', 'erika@example.org')
}

async function imprint() {
  return screen.findByRole('heading', { level: 1, name: t.title })
}

describe('ImprintPage', () => {
  it('shows the provider from the build while the server sleeps', async () => {
    stubDetails()
    const calls = mockApi({})
    renderApp('/impressum', { status: 'checking' })
    await imprint()

    const provider = screen.getByRole('region', { name: t.provider })
    expect(provider).toHaveTextContent('Erika Mustermann')
    expect(provider).toHaveTextContent('Musterstraße 1')
    expect(provider).toHaveTextContent('12345 Musterstadt')
    expect(screen.getByRole('link', { name: 'erika@example.org' })).toHaveAttribute(
      'href',
      'mailto:erika@example.org',
    )
    expect(screen.getByText(t.project.body)).toBeInTheDocument()
    expect(screen.getByText(t.trademarks.body)).toBeInTheDocument()
    expect(calls).toEqual([])
  })

  it('says the details are missing when the build has only some of them', async () => {
    stubDetails()
    vi.stubEnv('VITE_IMPRINT_STREET', '')
    mockApi({})
    renderApp('/impressum')
    await imprint()

    expect(screen.getByText(t.missing)).toBeInTheDocument()
    expect(screen.queryByText('Erika Mustermann')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: t.contact })).not.toBeInTheDocument()
  })

  it('is linked from the footer of the app pages', async () => {
    mockApi({ 'GET /api/auth/me': json(401) })
    renderApp('/anmelden')

    await userEvent.click(await screen.findByRole('link', { name: t.link }))
    await imprint()
  })

  it('is linked from the landing page', async () => {
    mockApi({})
    renderApp('/willkommen')

    await userEvent.click(await screen.findByRole('link', { name: t.link }))
    await imprint()
  })
})
