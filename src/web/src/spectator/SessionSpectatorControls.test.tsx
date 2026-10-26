import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import type { Campaign } from '../api/types'
import { ids, session } from '../encounters/testing'
import { testUser } from '../test/api'
import { de } from '../text/de'
import { SessionSpectatorControls } from './SessionSpectatorControls'

const t = de.spectator

const campaign = (joinCode: string | null): Campaign => ({
  id: ids.campaign,
  name: 'Die Rabenküste',
  defaultDmUserId: testUser.id,
  myRole: joinCode ? 'dm' : 'player',
  joinCode,
  activeSessionId: ids.session,
  members: [],
  description: null,
  coverUrl: null,
})

function show(joinCode: string | null, status: 'active' | 'ended' = 'active') {
  render(
    <MemoryRouter>
      <SessionSpectatorControls campaign={campaign(joinCode)} session={session({ status })} />
    </MemoryRouter>,
  )
}

describe('SessionSpectatorControls', () => {
  it('lets every member open the spectator screen', () => {
    show(null)

    expect(screen.getByRole('link', { name: t.open })).toHaveAttribute(
      'href',
      `/kampagnen/${ids.campaign}/sitzungen/${ids.session}/zuschauen`,
    )
    expect(screen.queryByRole('button', { name: t.invite })).not.toBeInTheDocument()
  })

  it('shows dm members the QR code, the link and the join code', async () => {
    show('KX7PQ2')
    await userEvent.click(screen.getByRole('button', { name: t.invite }))

    expect(screen.getByRole('img', { name: t.qrLabel })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: t.inviteLink })).toHaveValue(
      `${window.location.origin}/beitreten/KX7PQ2?sitzung=${ids.session}`,
    )
    expect(screen.getByRole('textbox', { name: t.inviteCode })).toHaveValue('KX7PQ2')
  })

  it('does not invite to an ended session', () => {
    show('KX7PQ2', 'ended')
    expect(screen.queryByRole('button', { name: t.invite })).not.toBeInTheDocument()
  })
})
