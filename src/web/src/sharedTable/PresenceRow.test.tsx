import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { BoardPerson, BoardToken, PresenceState } from '../api/types'
import { smallBoard } from '../encounters/testing'
import { PresenceRow } from './PresenceRow'
import { SESSION_DM_RING, buildAvatars } from './presence'

const people: BoardPerson[] = [
  { userId: 'dm', displayName: 'Oreana', pingColor: '#f5b81c' },
  { userId: 'eli', displayName: 'Eli', pingColor: '#4da3ff' },
  { userId: 'vanya', displayName: 'Vanya', pingColor: '#4cc76a' },
  { userId: 'felix', displayName: 'Felix', pingColor: '#ffffff' },
]

function character(
  id: string,
  label: string,
  owner: string,
  colorIndex: number,
  imageUrl: string | null = null,
): BoardToken {
  return {
    ...smallBoard().tokens[0]!,
    id,
    kind: 'character',
    ownerUserId: owner,
    label,
    colorIndex,
    imageUrl,
  }
}

// Eli has two characters: the one added to the campaign first (colorIndex 0) shows.
const tokens = [
  character('t2', 'Zweite', 'eli', 3, '/second.webp'),
  character('t1', 'Thorin', 'eli', 0, '/thorin.webp'),
  character('t3', 'Aria', 'vanya', 1),
]

const presence: PresenceState = {
  people: [
    { userId: 'dm', connected: true, isSessionDm: true },
    { userId: 'eli', connected: true, isSessionDm: false },
    { userId: 'vanya', connected: false, isSessionDm: false },
    { userId: 'felix', connected: true, isSessionDm: false },
  ],
  sharedScreen: false,
}

describe('buildAvatars', () => {
  it('shows the first character in its ring, the DM in gold and others by initial', () => {
    const [dm, eli, vanya, felix] = buildAvatars(presence, people, tokens)
    expect(dm!.ring).toBe(SESSION_DM_RING)
    expect(eli).toMatchObject({ imageUrl: '/thorin.webp', ring: '#4da3ff' })
    expect(vanya).toMatchObject({ imageUrl: null, initial: 'A', connected: false })
    expect(felix).toMatchObject({ imageUrl: null, initial: 'F' })
  })

  it('adds the table icon while a shared screen is connected', () => {
    const avatars = buildAvatars({ ...presence, sharedScreen: true }, people, tokens)
    expect(avatars.at(-1)).toMatchObject({ kind: 'table', connected: true })
  })
})

describe('PresenceRow', () => {
  it('draws one avatar per person and greys the ones not connected', () => {
    render(<PresenceRow presence={presence} people={people} tokens={tokens} />)
    const row = screen.getByRole('group', { name: 'Wer am Tisch ist' })
    expect(within(row).getAllByRole('button')).toHaveLength(4)
    expect(screen.getByRole('button', { name: 'Vanya, nicht verbunden' })).toHaveAttribute(
      'data-connected',
      'false',
    )
    expect(screen.getByRole('button', { name: 'Eli, verbunden' })).toHaveAttribute(
      'data-connected',
      'true',
    )
  })

  it('shows the table icon for the shared screen', () => {
    render(
      <PresenceRow
        presence={{ ...presence, sharedScreen: true }}
        people={people}
        tokens={tokens}
      />,
    )
    expect(screen.getByRole('button', { name: 'Tisch, verbunden' })).toHaveAttribute(
      'data-kind',
      'table',
    )
  })

  it('shows the name and the state on a tap, and nothing else', async () => {
    const user = userEvent.setup()
    render(<PresenceRow presence={presence} people={people} tokens={tokens} />)
    await user.click(screen.getByRole('button', { name: 'Vanya, nicht verbunden' }))
    expect(screen.getByRole('status')).toHaveTextContent('Vanya · nicht verbunden')
    await user.click(screen.getByRole('button', { name: 'Vanya, nicht verbunden' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
