import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { createQueryClient } from '../api/queryClient'
import type { Session } from '../api/types'
import { ids, session } from '../encounters/testing'
import { json, mockApi } from '../test/api'
import { SessionTableControls } from './SessionTableControls'

function renderControls(fields: Partial<Session>) {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>
        <SessionTableControls campaignId={ids.campaign} session={session(fields)} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('SessionTableControls', () => {
  it('lets the session DM switch the play mode', async () => {
    const calls = mockApi({
      'PUT /api/campaigns/:id/sessions/:id/play-mode': () =>
        json(200, session({ playMode: 'local' })),
    })
    const user = userEvent.setup()
    renderControls({ isSessionDm: true, playMode: 'byod' })

    expect(screen.getByRole('button', { name: 'Eigene Geräte' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(
      screen.queryByRole('link', { name: 'Gemeinsamen Bildschirm öffnen' }),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Gemeinsamer Bildschirm' }))

    await waitFor(() =>
      expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({ playMode: 'local' }),
    )
  })

  it('shows the mode read-only to everyone else', () => {
    renderControls({ isSessionDm: false, playMode: 'byod' })
    expect(screen.getByText('Spielweise: Eigene Geräte')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('offers the shared screen to any member in local mode', () => {
    renderControls({ isSessionDm: false, playMode: 'local' })
    expect(screen.getByText('Spielweise: Gemeinsamer Bildschirm')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Gemeinsamen Bildschirm öffnen' })).toHaveAttribute(
      'href',
      `/kampagnen/${ids.campaign}/sitzungen/${ids.session}/zuschauen?gemeinsam=1`,
    )
  })

  it('shows nothing for an ended session', () => {
    renderControls({ status: 'ended', playMode: 'local' })
    expect(screen.queryByText('Spielweise')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
