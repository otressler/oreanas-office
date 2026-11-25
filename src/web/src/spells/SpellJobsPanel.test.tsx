// The admin page's suggestion queue (knowledge/features/spell-cards.md, "Planned", steps 4 and 5).
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { SpellJobsOverview } from '../api/types'
import { json, mockApi, renderApp, testUser } from '../test/api'
import { de } from '../text/de'

const t = de.spells.jobs

function overview(fields: Partial<SpellJobsOverview> = {}): SpellJobsOverview {
  return {
    textModel: true,
    budget: { spentUsd: 1.5, limitUsd: 20, monthStart: '2026-11-01T00:00:00Z', available: true },
    counts: [
      { kind: 'draft', queued: 0, running: 0, done: 12, failed: 1 },
      { kind: 'motif', queued: 0, running: 0, done: 0, failed: 0 },
      { kind: 'revision', queued: 0, running: 0, done: 3, failed: 0 },
    ],
    failed: [
      {
        id: 'j1',
        kind: 'draft',
        spellId: 's1',
        variantId: null,
        spellName: 'Wunsch',
        status: 'failed',
        outcome: null,
        error: 'Diesen Zauber gibt es im Wiki nicht.',
        detail: null,
        finishedAt: '2026-11-25T20:00:00Z',
      },
    ],
    toCheck: [
      {
        id: 'j2',
        kind: 'revision',
        spellId: 's2',
        variantId: 'v2',
        spellName: 'Mondstrahl',
        status: 'done',
        outcome: 'wordsChanged',
        error: null,
        detail: 'card.description',
        finishedAt: '2026-11-25T20:00:00Z',
      },
    ],
    revisions: [
      {
        id: 'r1',
        variantId: 'v3',
        spellId: 's3',
        name: 'Donnerwoge',
        createdAt: '2026-11-25T20:00:00Z',
        canRevert: true,
      },
    ],
    ...fields,
  }
}

function open(state: SpellJobsOverview = overview()) {
  const calls = mockApi({
    'GET /api/auth/me': json(200, { ...testUser, isAdmin: true }),
    'GET /api/admin/invites': json(200, []),
    'GET /api/admin/users': json(200, []),
    'GET /api/admin/spells/jobs': () => json(200, state),
    'POST /api/admin/spells/jobs/plan': json(200, {
      drafts: 330,
      motifs: 0,
      revisions: 0,
      estimatedUsd: 0.66,
    }),
    'POST /api/admin/spells/jobs': json(202, {
      drafts: 330,
      motifs: 0,
      revisions: 0,
      estimatedUsd: 0.66,
    }),
    'POST /api/admin/spells/jobs/:jobId/retry': () => new Response(null, { status: 204 }),
    'POST /api/admin/spells/revisions/:revisionId/revert': () =>
      new Response(null, { status: 204 }),
  })
  renderApp('/admin')
  return calls
}

describe('the suggestion queue', () => {
  it('estimates first and starts only what the estimate counted', async () => {
    const calls = open()
    const user = userEvent.setup()
    const form = await screen.findByRole('region', { name: t.suggestions })
    expect(within(form).getByRole('checkbox', { name: t.onlyWithoutCard })).toBeChecked()
    expect(within(form).queryByRole('button', { name: /starten/ })).not.toBeInTheDocument()

    await user.click(within(form).getByRole('button', { name: t.estimate }))
    expect(await within(form).findByText(/330 Entwürfe · etwa 0,66/)).toBeVisible()
    await user.click(within(form).getByRole('button', { name: t.start(330) }))

    expect(await within(form).findByText(t.started(330))).toBeVisible()
    const started = calls.filter((c) => c.method === 'POST' && c.path === '/api/admin/spells/jobs')
    expect(started.map((c) => c.body)).toEqual([
      {
        run: 'suggestions',
        level: null,
        classId: null,
        school: null,
        onlyWithoutCard: true,
        onlyUnrevised: true,
      },
    ])
  })

  it('shows failures to retry, cards to check and revisions to put back', async () => {
    const calls = open()
    const user = userEvent.setup()

    const failed = await screen.findByRole('region', { name: t.failed })
    expect(within(failed).getByText(/im Wiki nicht/)).toBeVisible()
    await user.click(within(failed).getByRole('button', { name: t.retry }))

    const check = screen.getByRole('region', { name: t.toCheck })
    expect(within(check).getByRole('link', { name: t.openCard })).toHaveAttribute(
      'href',
      '/zauber/varianten/v2/bearbeiten',
    )
    expect(within(check).getByText(/card\.description/)).toBeVisible()

    await user.click(screen.getByText(t.revised(1)))
    await user.click(screen.getByRole('button', { name: t.revert }))

    await vi.waitFor(() =>
      expect(calls.filter((c) => c.method === 'POST').map((c) => c.path)).toEqual([
        '/api/admin/spells/jobs/j1/retry',
        '/api/admin/spells/revisions/r1/revert',
      ]),
    )
  })

  it('can’t start anything without a text model', async () => {
    open(overview({ textModel: false }))
    expect(await screen.findByText(t.noTextModel)).toBeVisible()
    const form = screen.getByRole('region', { name: t.revision })
    expect(within(form).getByRole('button', { name: t.estimate })).toBeDisabled()
  })
})
