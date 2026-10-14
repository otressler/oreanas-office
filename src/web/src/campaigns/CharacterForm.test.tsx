import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createQueryClient } from '../api/queryClient'
import type { Character } from '../api/types'
import { json, mockApi } from '../test/api'
import { de } from '../text/de'
import { CharacterForm } from './CharacterForm'

const CAMPAIGN = 'c1'

function renderForm(character?: Character) {
  const onDone = vi.fn()
  render(
    <QueryClientProvider client={createQueryClient()}>
      <CharacterForm campaignId={CAMPAIGN} character={character} onDone={onDone} />
    </QueryClientProvider>,
  )
  return onDone
}

describe('CharacterForm', () => {
  it('starts as a medium character', () => {
    mockApi({})
    renderForm()
    expect(screen.getByLabelText(de.characters.size)).toHaveValue('medium')
  })

  it('creates a character with its name and size', async () => {
    const calls = mockApi({
      'POST /api/campaigns/:id/characters': (call) => json(201, call.body),
    })
    const onDone = renderForm()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText(de.characters.name), 'Brom')
    await user.selectOptions(screen.getByLabelText(de.characters.size), de.sizes.small)
    await user.click(screen.getByRole('button', { name: de.common.create }))

    await vi.waitFor(() => expect(onDone).toHaveBeenCalled())
    const post = calls.find((c) => c.method === 'POST')!
    expect(post.path).toBe(`/api/campaigns/${CAMPAIGN}/characters`)
    expect(post.body).toEqual({ name: 'Brom', size: 'small' })
  })

  it('edits an existing character', async () => {
    const character: Character = {
      id: 'ch1',
      ownerUserId: 'u1',
      ownerDisplayName: 'Mira',
      colorIndex: 0,
      name: 'Brom',
      size: 'medium',
      canEdit: true,
    }
    const calls = mockApi({
      'PUT /api/campaigns/:id/characters/:characterId': (call) => json(200, call.body),
    })
    const onDone = renderForm(character)
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText(de.characters.size), de.sizes.large)
    await user.click(screen.getByRole('button', { name: de.common.save }))

    await vi.waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(calls[0]?.path).toBe(`/api/campaigns/${CAMPAIGN}/characters/ch1`)
    expect(calls[0]?.body).toEqual({ name: 'Brom', size: 'large' })
  })

  it('shows the server error in German', async () => {
    mockApi({
      'POST /api/campaigns/:id/characters': () => json(400, { code: 'nameInvalid', field: 'name' }),
    })
    renderForm()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText(de.characters.name), ' ')
    await user.click(screen.getByRole('button', { name: de.common.create }))

    expect(await screen.findByRole('alert')).toHaveTextContent(de.errors.nameInvalid)
  })
})
