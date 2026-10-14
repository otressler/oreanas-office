import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { json, mockApi, renderApp } from '../test/api'
import { de } from '../text/de'
import { BUILT_THROUGH_STAGE } from './RoadmapPage'

const t = de.roadmap
const stages: { number: number; title: string }[] = t.phases.flatMap((phase) => [...phase.stages])

function stageCard(title: string) {
  return screen.getByRole('article', { name: title })
}

describe('RoadmapPage', () => {
  it('lists every stage in order, without signing in', async () => {
    mockApi({ 'GET /api/auth/me': json(401) })
    renderApp('/fahrplan')

    expect(await screen.findByRole('heading', { level: 1, name: t.title })).toBeInTheDocument()
    expect(stages.map((s) => s.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    const titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(titles.slice(0, stages.length)).toEqual(stages.map((s) => s.title))
  })

  it('marks built stages as done and the following one as next', async () => {
    mockApi({ 'GET /api/auth/me': json(401) })
    renderApp('/fahrplan')
    await screen.findByRole('heading', { level: 1, name: t.title })

    for (const stage of stages) {
      const card = within(stageCard(stage.title))
      expect(card.queryByText(t.done) !== null).toBe(stage.number <= BUILT_THROUGH_STAGE)
      expect(card.queryByText(t.next) !== null).toBe(stage.number === BUILT_THROUGH_STAGE + 1)
    }
  })

  it('is linked from the footer of every page', async () => {
    mockApi({ 'GET /api/auth/me': json(401) })
    renderApp('/anmelden')

    await userEvent.click(await screen.findByRole('link', { name: t.link }))
    expect(await screen.findByRole('heading', { level: 1, name: t.title })).toBeInTheDocument()
  })
})
