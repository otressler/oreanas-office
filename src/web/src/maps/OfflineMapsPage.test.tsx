import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { emptyMap } from '../editor/model'
import { setArchived } from '../editor/maps'
import { seedMap, seedOffline } from '../editor/testing'
import { offlineDb } from '../offline/db'
import { mockApi, renderApp, testUser } from '../test/api'
import { de } from '../text/de'

const t = de.maps

describe('OfflineMapsPage', () => {
  it('lists the campaigns where the user is dm, with their map counts', async () => {
    mockApi({})
    await seedOffline({ campaignId: 'c1', campaignName: 'Die Rabenküste' })
    await seedOffline({ campaignId: 'c2', campaignName: 'Als Spieler', role: 'player' })
    await seedOffline({ campaignId: 'c3', campaignName: 'Das Grab' })
    await seedMap(emptyMap('Klamm', 4, 4), 'c1')
    await seedMap(emptyMap('Furt', 4, 4), 'c1')
    const archived = await seedMap(emptyMap('Alt', 4, 4), 'c1')
    await setArchived(offlineDb(testUser.id), archived.id, true)

    renderApp('/karten')

    expect(await screen.findByRole('heading', { name: t.offlineTitle })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /Die Rabenküste/ })).toHaveAttribute(
      'href',
      '/kampagnen/c1/karten',
    )
    expect(screen.getByRole('link', { name: /Die Rabenküste/ })).toHaveTextContent(t.mapCount(2))
    expect(screen.getByRole('link', { name: /Das Grab/ })).toHaveTextContent(t.mapCount(0))
    expect(screen.queryByText('Als Spieler')).not.toBeInTheDocument()
  })

  it('says so when the device knows no campaign the user leads', async () => {
    mockApi({})
    await seedOffline({ role: 'player' })
    renderApp('/karten')
    expect(await screen.findByText(t.offlineEmpty)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: t.home })).toHaveAttribute('href', '/')
  })
})
