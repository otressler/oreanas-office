// The editor's "Zustände" (knowledge/features/spell-cards.md, "Statuses when a spell is added"):
// the spell itself as a status, the conditions its texts mark to tick, Konzentration as a note.
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { createQueryClient } from '../api/queryClient'
import { json, mockApi } from '../test/api'
import { de } from '../text/de'
import { SpellEditor, type SpellEdit } from './SpellEditor'

const e = de.spells.editor

const initial: SpellEdit = {
  spellId: 's1',
  nameEn: 'Entangle',
  level: 1,
  school: 'conjuration',
  origin: 'manual',
  card: {
    name: 'Verstricken',
    icon: 'leaf',
    concentration: true,
    description:
      'Ranken halten jede Kreatur [[festgesetzt]]; Lesser Restoration beendet [[Blind]].',
    effects: [],
    pips: [],
  },
}

function renderEditor(onSave: (edit: SpellEdit) => void) {
  mockApi({ 'GET /api/spells': json(200, []) })
  const queryClient = createQueryClient()
  const router = createMemoryRouter([
    {
      path: '/',
      element: (
        <SpellEditor
          initial={initial}
          factsLocked
          error={null}
          busy={false}
          onSave={onSave}
          onCancel={() => {}}
        />
      ),
    },
  ])
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('the editor’s statuses', () => {
  it('suggests the marked conditions unticked and saves what the author ticks', async () => {
    const onSave = vi.fn()
    renderEditor(onSave)
    const user = userEvent.setup()

    const section = screen.getByRole('group', { name: e.statuses })
    expect(within(section).getByText(e.concentrationOffered)).toBeVisible()
    const conditions = within(section).getByRole('group', { name: e.conditions })
    const restrained = within(conditions).getByRole('checkbox', { name: 'Festgesetzt' })
    const blinded = within(conditions).getByRole('checkbox', { name: 'Blind' })
    expect(restrained).not.toBeChecked()
    expect(blinded).not.toBeChecked()

    await user.click(restrained)
    await user.click(within(section).getByRole('checkbox', { name: e.offerStatus }))
    const bar = screen.getByRole('group', { name: e.save })
    await user.click(within(bar).getByRole('button', { name: de.sheet.saveChanges }))

    expect(onSave).toHaveBeenCalledTimes(1)
    const saved = onSave.mock.calls[0]![0] as SpellEdit
    expect(saved.card.statuses).toEqual(['restrained'])
    expect(saved.card.offerStatus).toBe(true)
  })
})
