import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { encounter, ids } from '../encounters/testing'
import { json, mockApi, renderApp, testUser } from '../test/api'
import { de } from '../text/de'

const t = de.encounters.import
const importPath = `/kampagnen/${ids.campaign}/karten/importieren`

function api(importReply: () => Response) {
  return mockApi({
    'GET /api/auth/me': json(200, testUser),
    'POST /api/campaigns/:id/encounters/import': importReply,
    'GET /api/campaigns/:id': () => json(404),
  })
}

function mapFile(content: string, name = 'karte.json') {
  return new File([content], name, { type: 'application/json' })
}

describe('MapImportPage', () => {
  it('imports a sample map and goes back to the campaign', async () => {
    const calls = api(() => json(201, encounter({ name: 'Schluchtübergang' })))
    const { router } = renderApp(importPath)
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /Schluchtübergang/ }))

    await screen.findByText(de.requestErrors.notFound)
    expect(router.state.location.pathname).toBe(`/kampagnen/${ids.campaign}`)
    const sent = calls.find((c) => c.method === 'POST')?.body as { name: string; width: number }
    expect(sent).toMatchObject({ name: 'Schluchtübergang', width: 20, height: 12 })
  })

  it('shows the sample maps with their size', async () => {
    api(() => json(500))
    renderApp(importPath)
    const crypt = await screen.findByRole('button', { name: /Alte Gruft/ })
    expect(crypt).toHaveTextContent(t.sampleSize(24, 16))
  })

  it('refuses a file that is not JSON without asking the server', async () => {
    const calls = api(() => json(500))
    renderApp(importPath)
    const user = userEvent.setup()

    await user.upload(await screen.findByLabelText(new RegExp(t.fileLabel)), mapFile('{ kaputt'))

    expect(await screen.findByRole('alert')).toHaveTextContent(t.unreadable)
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('names the place of a server error in the file', async () => {
    const calls = api(() => json(400, { code: 'cellInvalid', field: 'layout.cells[12]' }))
    renderApp(importPath)
    const user = userEvent.setup()

    const file = { name: 'Eigene Karte', width: 3, height: 3, layout: { cells: [] } }
    await user.upload(
      await screen.findByLabelText(new RegExp(t.fileLabel)),
      mapFile(JSON.stringify(file)),
    )

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(de.errors.cellInvalid)
    expect(alert).toHaveTextContent(t.where('Feld 13 in der Liste der Felder (layout.cells[12])'))
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual(file)
  })
})
