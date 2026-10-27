import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { CAMPAIGN_ID, seedOffline } from '../editor/testing'
import { offlineDb } from '../offline/db'
import { mockApi, renderApp, testUser } from '../test/api'
import { de } from '../text/de'
import {
  createCreatureType,
  setCreatureTypeArchived,
  type CreatureTypeInput,
} from './creatureTypes'

const t = de.bestiary
const path = `/kampagnen/${CAMPAIGN_ID}/bestiarium`

async function seed(name: string, fields: Partial<CreatureTypeInput> = {}) {
  const result = await createCreatureType(offlineDb(testUser.id), CAMPAIGN_ID, {
    name,
    size: 'small',
    appearance: '',
    notes: '',
    initiativeModifier: 2,
    initiativeRollMode: 'normal',
    ...fields,
  })
  if (!result.ok) throw new Error(result.problems.join())
  return result.type
}

describe('BestiaryPage', () => {
  it('shows the campaign’s creature types from this browser as cards linking to their pages', async () => {
    mockApi({})
    await seedOffline()
    const goblin = await seed('Goblin', { appearance: 'Ein **kleiner** grüner Kobold.' })
    renderApp(path)

    expect(await screen.findByRole('heading', { name: t.title })).toBeInTheDocument()
    const card = await screen.findByRole('link', { name: t.open('Goblin') })
    expect(card).toHaveAttribute('href', `${path}/${goblin.id}`)
    expect(within(card).getByText(/Klein/)).toHaveTextContent('Klein · Ini +2')
    // The appearance as a plain line, without markdown's marks.
    expect(within(card).getByText('Ein kleiner grüner Kobold.')).toBeInTheDocument()
    // Nothing to pick outside a map.
    expect(screen.queryByRole('button', { name: t.pick('Goblin') })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: new RegExp(t.newType) })).toHaveAttribute(
      'href',
      `${path}/neu`,
    )
  })

  it('folds archived types away, and brings one back', async () => {
    mockApi({})
    await seedOffline()
    const ork = await seed('Ork')
    await setCreatureTypeArchived(offlineDb(testUser.id), ork.id, true)
    renderApp(path)

    await screen.findByText(t.archived(1))
    expect(screen.queryByRole('link', { name: t.open('Ork') })).not.toBeInTheDocument()
    await userEvent.click(screen.getByText(t.archived(1)))
    await userEvent.click(screen.getByRole('button', { name: t.restoreLabel('Ork') }))
    expect(await screen.findByRole('link', { name: t.open('Ork') })).toBeInTheDocument()
  })

  it('filters the cards by name once there are a dozen', async () => {
    mockApi({})
    await seedOffline()
    for (let n = 1; n <= 11; n++) await seed(`Skelett ${n}`)
    renderApp(path)
    await screen.findByRole('link', { name: t.open('Skelett 11') })
    expect(screen.queryByLabelText(t.filter)).not.toBeInTheDocument()

    await seed('Oger')
    const filter = await screen.findByLabelText(t.filter)
    await userEvent.type(filter, 'og')
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: t.open('Skelett 1') })).not.toBeInTheDocument(),
    )
    expect(screen.getByRole('link', { name: t.open('Oger') })).toBeInTheDocument()

    await userEvent.clear(filter)
    await userEvent.type(filter, 'Drache')
    expect(screen.getByText(t.noMatch)).toBeInTheDocument()
  })

  it('is only for the campaign’s dm members', async () => {
    mockApi({})
    await seedOffline({ role: 'player' })
    await seed('Goblin')
    renderApp(path)
    expect(await screen.findByRole('heading', { name: de.maps.notDmTitle })).toBeInTheDocument()
    expect(screen.queryByText('Goblin')).not.toBeInTheDocument()
  })

  it('says when the device doesn’t know the campaign', async () => {
    mockApi({})
    await seedOffline()
    renderApp('/kampagnen/unbekannt/bestiarium')
    expect(await screen.findByRole('heading', { name: de.maps.unknownTitle })).toBeInTheDocument()
  })
})
