import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { CAMPAIGN_ID, seedOffline } from '../editor/testing'
import { offlineDb } from '../offline/db'
import { mockApi, renderApp, testUser } from '../test/api'
import { de } from '../text/de'
import { createCreatureType } from './creatureTypes'

const t = de.bestiary
const path = `/kampagnen/${CAMPAIGN_ID}/bestiarium`

async function seedGoblin() {
  await createCreatureType(offlineDb(testUser.id), CAMPAIGN_ID, {
    name: 'Goblin',
    size: 'small',
    appearance: '',
    notes: '',
    initiativeModifier: 2,
    initiativeRollMode: 'normal',
  })
}

describe('BestiaryPage', () => {
  it('lists the campaign’s creature types from this browser and makes new ones', async () => {
    mockApi({})
    await seedOffline()
    await seedGoblin()
    renderApp(path)

    expect(await screen.findByRole('heading', { name: t.title })).toBeInTheDocument()
    expect(await screen.findByText('Goblin')).toBeInTheDocument()
    // Nothing to pick outside a map: the rows aren't buttons.
    expect(screen.queryByRole('button', { name: t.pick('Goblin') })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: t.newType }))
    expect(await screen.findByLabelText(t.name)).toBeInTheDocument()
  })

  it('is only for the campaign’s dm members', async () => {
    mockApi({})
    await seedOffline({ role: 'player' })
    await seedGoblin()
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
