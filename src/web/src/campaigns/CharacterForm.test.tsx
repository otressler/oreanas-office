import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createQueryClient } from '../api/queryClient'
import type { Character } from '../api/types'
import { json, mockApi } from '../test/api'
import { fakeImages } from '../editor/background/testing'
import { de } from '../text/de'
import { tokenImage, tokenImagesOf } from '../tokenImages/testing'
import { CharacterForm } from './CharacterForm'

// The factory must not import the fake hub's module: that pulls in the app's routes, which
// import this module again and would wait on themselves.
const imageHub = vi.hoisted(() => ({ factory: null as null | (() => unknown) }))
vi.mock('../tokenImages/createConnection', () => ({
  createTokenImageConnection: () => imageHub.factory!(),
}))

const CAMPAIGN = 'c1'

beforeEach(() => {
  imageHub.factory = fakeImages.hub.factory
  fakeImages.hub.reset()
})

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
    await user.type(screen.getByLabelText(de.characters.appearance), ' Zwerg mit rotem Bart ')
    expect(screen.getByText(/\(22\/500\)/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: de.common.create }))

    await vi.waitFor(() => expect(onDone).toHaveBeenCalled())
    const post = calls.find((c) => c.method === 'POST')!
    expect(post.path).toBe(`/api/campaigns/${CAMPAIGN}/characters`)
    expect(post.body).toEqual({
      name: 'Brom',
      size: 'small',
      appearance: 'Zwerg mit rotem Bart',
      color: null,
    })
    // A new character has no portraits yet.
    expect(screen.queryByRole('region', { name: de.characters.portrait.title })).toBeNull()
  })

  it('edits an existing character', async () => {
    const character: Character = {
      id: 'ch1',
      ownerUserId: 'u1',
      ownerDisplayName: 'Mira',
      colorIndex: 0,
      color: null,
      appearance: '',
      portraitUrl: null,
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
    const put = calls.find((c) => c.method === 'PUT')
    expect(put?.path).toBe(`/api/campaigns/${CAMPAIGN}/characters/ch1`)
    expect(put?.body).toEqual({ name: 'Brom', size: 'large', appearance: '', color: null })
  })

  it('saves a typed colour code as #rrggbb in lower case', async () => {
    const calls = mockApi({
      'POST /api/campaigns/:id/characters': (call) => json(201, call.body),
    })
    const onDone = renderForm()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText(de.characters.name), 'Brom')
    await user.type(screen.getByLabelText(de.characters.color.label), 'A1B2C3')
    await user.click(screen.getByRole('button', { name: de.common.create }))

    await vi.waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({ color: '#a1b2c3' })
  })

  it('fills in a default colour, and goes back to the colour by order', async () => {
    const character: Character = {
      id: 'ch1',
      ownerUserId: 'u1',
      ownerDisplayName: 'Mira',
      colorIndex: 1,
      color: '#123abc',
      appearance: '',
      portraitUrl: null,
      name: 'Brom',
      size: 'medium',
      canEdit: true,
    }
    const calls = mockApi({
      'GET /api/campaigns/:id/characters/:characterId/portraits': () =>
        json(200, tokenImagesOf([])),
      'PUT /api/campaigns/:id/characters/:characterId': (call) => json(200, call.body),
    })
    const onDone = renderForm(character)
    const user = userEvent.setup()
    const field = screen.getByLabelText(de.characters.color.label)
    expect(field).toHaveValue('#123abc')

    const orange = screen.getByRole('button', { name: de.characters.color.pick('Orange') })
    await user.click(orange)
    expect(field).toHaveValue('#f28c38')
    expect(orange).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: de.characters.color.reset }))
    expect(field).toHaveValue('')
    // The placeholder names the colour the character gets by its place in the campaign.
    expect(field).toHaveAttribute('placeholder', expect.stringContaining('#4cc76a'))
    await user.click(screen.getByRole('button', { name: de.common.save }))

    await vi.waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(calls.find((c) => c.method === 'PUT')?.body).toMatchObject({ color: null })
  })

  it('does not send a colour that isn’t a hex code', async () => {
    const calls = mockApi({
      'POST /api/campaigns/:id/characters': (call) => json(201, call.body),
    })
    const onDone = renderForm()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText(de.characters.name), 'Brom')
    await user.type(screen.getByLabelText(de.characters.color.label), 'rot')
    await user.click(screen.getByRole('button', { name: de.common.create }))

    expect(screen.getByLabelText(de.characters.color.label)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText(de.characters.color.invalid)).toBeVisible()
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0)
    expect(onDone).not.toHaveBeenCalled()
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

  it('offers a portrait once the appearance is filled in, and saves it first', async () => {
    const character: Character = {
      id: 'ch1',
      ownerUserId: 'u1',
      ownerDisplayName: 'Mira',
      colorIndex: 0,
      color: null,
      appearance: '',
      portraitUrl: null,
      name: 'Brom',
      size: 'medium',
      canEdit: true,
    }
    const calls = mockApi({
      'GET /api/campaigns/:id/characters/:characterId/portraits': () =>
        json(200, tokenImagesOf([])),
      'PUT /api/campaigns/:id/characters/:characterId': (call) =>
        json(200, { ...character, ...(call.body as object) }),
      'POST /api/campaigns/:id/characters/:characterId/portraits': () =>
        json(202, tokenImage({ status: 'queued' })),
    })
    const onDone = renderForm(character)
    const user = userEvent.setup()
    const portrait = screen.getByRole('region', { name: de.characters.portrait.title })
    const generate = within(portrait).getByRole('button', {
      name: de.characters.portrait.generate,
    })
    expect(within(portrait).getByText(de.characters.portrait.needsAppearance)).toBeVisible()
    expect(generate).toBeDisabled()

    await user.type(screen.getByLabelText(de.characters.appearance), 'Zwerg')
    await vi.waitFor(() => expect(generate).toBeEnabled())
    await user.click(generate)
    await user.click(screen.getByRole('button', { name: de.tokenImages.confirm.ok }))
    await screen.findByText(de.tokenImages.queued)

    // The appearance was saved before the job, and the form stays open.
    const order = calls.filter((c) => c.method !== 'GET').map((c) => `${c.method} ${c.path}`)
    expect(order).toEqual([
      `PUT /api/campaigns/${CAMPAIGN}/characters/ch1`,
      `POST /api/campaigns/${CAMPAIGN}/characters/ch1/portraits`,
    ])
    expect(calls.find((c) => c.method === 'PUT')?.body).toMatchObject({ appearance: 'Zwerg' })
    expect(onDone).not.toHaveBeenCalled()
  })
})
