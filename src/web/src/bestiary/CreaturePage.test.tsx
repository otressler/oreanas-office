import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { CAMPAIGN_ID, seedOffline } from '../editor/testing'
import { offlineDb } from '../offline/db'
import { mockApi, renderApp, testUser } from '../test/api'
import { de } from '../text/de'
import { createCreatureType, listCreatureTypes, type CreatureTypeInput } from './creatureTypes'

const t = de.bestiary
const p = t.page
const bestiary = `/kampagnen/${CAMPAIGN_ID}/bestiarium`

async function seed(name: string, fields: Partial<CreatureTypeInput> = {}) {
  const result = await createCreatureType(offlineDb(testUser.id), CAMPAIGN_ID, {
    name,
    size: 'large',
    appearance: 'Ein **grauer** Riese mit Keule.',
    notes: '- Hasst Zwerge\n- Schläft tagsüber',
    initiativeModifier: -1,
    initiativeRollMode: 'advantage',
    ...fields,
  })
  if (!result.ok) throw new Error(result.problems.join())
  return result.type
}

const stored = async () => listCreatureTypes(offlineDb(testUser.id), CAMPAIGN_ID)
const pencil = (name: string) => screen.findByRole('button', { name: t.edit(name) })

describe('CreaturePage', () => {
  it('reads like a character’s page: name, facts, appearance and notes', async () => {
    mockApi({})
    await seedOffline()
    const oger = await seed('Oger')
    renderApp(`${bestiary}/${oger.id}`)

    expect(await screen.findByRole('heading', { name: 'Oger', level: 1 })).toBeInTheDocument()
    expect(screen.getByText(p.kicker)).toBeInTheDocument()
    expect(screen.getByText('Groß')).toBeInTheDocument()
    expect(screen.getByText('2 × 2 Felder')).toBeInTheDocument()
    expect(screen.getByText('−1 mit Vorteil')).toBeInTheDocument()
    // The texts as markdown.
    expect(screen.getByText('grauer').tagName).toBe('STRONG')
    expect(screen.getByText('Hasst Zwerge').tagName).toBe('LI')
    expect(screen.getByRole('link', { name: new RegExp(t.title) })).toHaveAttribute(
      'href',
      bestiary,
    )
  })

  it('turns into the editor in place and saves to this browser', async () => {
    const user = userEvent.setup()
    mockApi({})
    await seedOffline()
    const oger = await seed('Oger')
    renderApp(`${bestiary}/${oger.id}`)

    await user.click(await pencil('Oger'))
    const name = screen.getByLabelText(t.name)
    await user.clear(name)
    await user.type(name, 'Steinoger')
    await user.selectOptions(screen.getByLabelText(t.size), 'huge')
    expect(screen.getByText(de.sheet.unsaved)).toBeVisible()
    await user.click(screen.getByRole('button', { name: de.sheet.saveChanges }))

    expect(await screen.findByRole('heading', { name: 'Steinoger', level: 1 })).toBeVisible()
    expect(screen.getByText('Riesig')).toBeInTheDocument()
    const [type] = await stored()
    expect(type).toMatchObject({ name: 'Steinoger', size: 'huge' })
  })

  it('drops edits on cancel', async () => {
    const user = userEvent.setup()
    mockApi({})
    await seedOffline()
    const oger = await seed('Oger')
    renderApp(`${bestiary}/${oger.id}`)

    await user.click(await pencil('Oger'))
    await user.type(screen.getByLabelText(t.name), 'xx')
    await user.click(screen.getByRole('button', { name: de.common.cancel }))
    expect(await screen.findByRole('heading', { name: 'Oger', level: 1 })).toBeVisible()
    expect((await stored())[0]!.name).toBe('Oger')
  })

  it('refuses a name another type has, archived ones included', async () => {
    const user = userEvent.setup()
    mockApi({})
    await seedOffline()
    await seed('Goblin')
    const oger = await seed('Oger')
    renderApp(`${bestiary}/${oger.id}`)

    await user.click(await pencil('Oger'))
    const name = screen.getByLabelText(t.name)
    await user.clear(name)
    await user.type(name, 'goblin')
    await user.click(screen.getByRole('button', { name: de.sheet.saveChanges }))
    expect(await screen.findAllByText(t.problems.nameTaken)).not.toHaveLength(0)
    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect((await stored()).map((type) => type.name)).toEqual(['Goblin', 'Oger'])
  })

  it('makes a new type from the empty editor and opens its page', async () => {
    const user = userEvent.setup()
    mockApi({})
    await seedOffline()
    const { router } = renderApp(`${bestiary}/neu`)

    const save = await screen.findByRole('button', { name: de.sheet.saveChanges })
    expect(screen.getByText(p.iconAfterSave)).toBeInTheDocument()
    await user.click(save)
    expect(await screen.findAllByText(t.problems.nameMissing)).not.toHaveLength(0)

    await user.type(screen.getByLabelText(t.name), 'Wolf')
    await user.click(save)
    expect(await screen.findByRole('heading', { name: 'Wolf', level: 1 })).toBeVisible()
    const [wolf] = await stored()
    expect(router.state.location.pathname).toBe(`${bestiary}/${wolf!.id}`)
    expect(wolf).toMatchObject({ size: 'medium', initiativeModifier: 0 })
  })

  it('archives a type and brings it back', async () => {
    const user = userEvent.setup()
    mockApi({})
    await seedOffline()
    const oger = await seed('Oger')
    renderApp(`${bestiary}/${oger.id}`)

    await user.click(await screen.findByRole('button', { name: t.archive }))
    expect(await screen.findByText(p.archivedNote)).toBeVisible()
    expect(screen.getByText(p.archivedKicker)).toBeInTheDocument()
    await waitFor(async () => expect((await stored())[0]!.archivedAt).not.toBeNull())

    await user.click(screen.getByRole('button', { name: t.restoreLabel('Oger') }))
    await waitFor(() => expect(screen.queryByText(p.archivedNote)).not.toBeInTheDocument())
    expect((await stored())[0]!.archivedAt).toBeNull()
  })

  it('says when the type isn’t in this browser', async () => {
    mockApi({})
    await seedOffline()
    renderApp(`${bestiary}/gibt-es-nicht`)
    expect(await screen.findByRole('heading', { name: p.unknownTitle })).toBeInTheDocument()
  })
})
