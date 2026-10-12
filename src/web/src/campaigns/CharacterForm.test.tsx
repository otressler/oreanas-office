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

const speedInput = () => screen.getByLabelText(de.characters.speed)

async function setSpeed(value: string) {
  const user = userEvent.setup()
  await user.clear(speedInput())
  if (value) await user.type(speedInput(), value)
  return user
}

describe('CharacterForm', () => {
  it('starts at 9 m, the usual walking speed', () => {
    mockApi({})
    renderForm()
    expect(speedInput()).toHaveValue('9')
    expect(screen.getByLabelText(de.characters.size)).toHaveValue('medium')
  })

  it('says when the speed will be rounded down to whole squares', async () => {
    mockApi({})
    renderForm()

    await setSpeed('10')
    expect(screen.getByText(de.characters.speedRounded('9 m'))).toBeInTheDocument()

    await setSpeed('7,4')
    expect(screen.getByText(de.characters.speedRounded('6 m'))).toBeInTheDocument()

    await setSpeed('7,5')
    expect(screen.queryByText(/abgerundet/)).not.toBeInTheDocument()
    expect(screen.getByText(de.characters.speedHint)).toBeInTheDocument()
  })

  it('sends meters as whole squares, rounded down', async () => {
    const calls = mockApi({
      'POST /api/campaigns/:id/characters': (call) => json(201, call.body),
    })
    const onDone = renderForm()
    const user = await setSpeed('10')
    await user.type(screen.getByLabelText(de.characters.name), 'Brom')
    await user.selectOptions(screen.getByLabelText(de.characters.size), de.sizes.small)
    await user.click(screen.getByRole('button', { name: de.common.create }))

    await vi.waitFor(() => expect(onDone).toHaveBeenCalled())
    const post = calls.find((c) => c.method === 'POST')!
    expect(post.path).toBe(`/api/campaigns/${CAMPAIGN}/characters`)
    expect(post.body).toEqual({ name: 'Brom', size: 'small', speedSquares: 6 })
  })

  it('accepts a decimal point as well as a comma', async () => {
    const calls = mockApi({
      'POST /api/campaigns/:id/characters': (call) => json(201, call.body),
    })
    const onDone = renderForm()
    const user = await setSpeed('7.5')
    await user.type(screen.getByLabelText(de.characters.name), 'Ilse')
    await user.click(screen.getByRole('button', { name: de.common.create }))

    await vi.waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(calls[0]?.body).toMatchObject({ speedSquares: 5 })
  })

  it('rejects a speed that is not a number, without asking the server', async () => {
    const calls = mockApi({})
    renderForm()
    const user = await setSpeed('neun')
    await user.type(screen.getByLabelText(de.characters.name), 'Brom')
    await user.click(screen.getByRole('button', { name: de.common.create }))

    expect(await screen.findByRole('alert')).toHaveTextContent(de.errors.speedInvalid)
    expect(speedInput()).toHaveAttribute('aria-invalid', 'true')
    expect(calls).toHaveLength(0)
  })

  it('edits an existing character, showing its speed in meters', async () => {
    const character: Character = {
      id: 'ch1',
      ownerUserId: 'u1',
      ownerDisplayName: 'Mira',
      colorIndex: 0,
      name: 'Brom',
      size: 'medium',
      speedSquares: 5,
      canEdit: true,
    }
    const calls = mockApi({
      'PUT /api/campaigns/:id/characters/:characterId': (call) => json(200, call.body),
    })
    const onDone = renderForm(character)
    expect(speedInput()).toHaveValue('7,5')

    const user = await setSpeed('9')
    await user.click(screen.getByRole('button', { name: de.common.save }))

    await vi.waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(calls[0]?.path).toBe(`/api/campaigns/${CAMPAIGN}/characters/ch1`)
    expect(calls[0]?.body).toEqual({ name: 'Brom', size: 'medium', speedSquares: 6 })
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
