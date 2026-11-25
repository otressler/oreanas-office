// A card draft from the suggestion queue (knowledge/features/spell-cards.md, "Planned", step 5):
// shown on the spell's page, checked in the editor, saved as the user's variant.
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { SpellDetail } from '../api/types'
import { json, mockApi, renderApp, testUser } from '../test/api'
import { de } from '../text/de'

const t = de.spells.spell

const card = { name: 'Wunsch', icon: 'star', description: 'Ein Entwurf.', effects: [], pips: [] }

const detail: SpellDetail = {
  id: 's1',
  nameEn: 'Wish',
  nameDe: 'Wunsch',
  level: 9,
  school: 'conjuration',
  inHandbook: true,
  lists: [],
  variants: [],
  draft: {
    id: 'd1',
    card,
    motifSubject: 'A genie bowing over a golden lamp.',
    createdAt: '2026-11-25T20:00:00Z',
  },
}

function open(isAdmin = false) {
  const calls = mockApi({
    'GET /api/auth/me': json(200, { ...testUser, isAdmin }),
    'GET /api/spells': json(200, []),
    'GET /api/spells/import': json(200, { available: true }),
    'GET /api/spells/:spellId': json(200, detail),
    'POST /api/spells/variants': (call) =>
      json(201, {
        id: 'v1',
        spellId: 's1',
        nameEn: 'Wish',
        level: 9,
        school: 'conjuration',
        author: { id: testUser.id, displayName: testUser.displayName },
        basedOnVariantId: null,
        origin: 'wiki',
        card: (call.body as { card: unknown }).card,
        artAssetId: null,
        artUrl: null,
        artApproved: false,
        usedBy: 0,
        canEdit: true,
        createdAt: '2026-11-25T21:00:00Z',
        updatedAt: '2026-11-25T21:00:00Z',
      }),
    'DELETE /api/spells/drafts/:draftId': () => new Response(null, { status: 204 }),
  })
  renderApp('/zauber/s1')
  return calls
}

describe('a card draft', () => {
  it('is checked in the editor and saved as the user’s variant', async () => {
    const calls = open()
    const user = userEvent.setup()

    const section = await screen.findByRole('region', { name: t.draftTitle })
    expect(
      within(section).getByText(t.draftMotif('A genie bowing over a golden lamp.')),
    ).toBeVisible()
    // Only admins discard drafts.
    expect(within(section).queryByRole('button', { name: t.discardDraft })).not.toBeInTheDocument()
    await user.click(within(section).getByRole('link', { name: t.checkDraft }))

    expect(await screen.findByText(de.spells.create.draftIntro)).toBeVisible()
    const bar = screen.getByRole('group', { name: de.spells.editor.save })
    await user.click(within(bar).getByRole('button', { name: de.sheet.saveChanges }))

    await vi.waitFor(() =>
      expect(calls.filter((c) => c.method === 'POST').map((c) => c.body)).toEqual([
        expect.objectContaining({
          spellId: 's1',
          card: expect.objectContaining({ name: 'Wunsch', description: 'Ein Entwurf.' }),
          origin: 'wiki',
          draftId: 'd1',
        }),
      ]),
    )
  })

  it('can be discarded by an admin', async () => {
    const calls = open(true)
    const user = userEvent.setup()
    const section = await screen.findByRole('region', { name: t.draftTitle })
    await user.click(within(section).getByRole('button', { name: t.discardDraft }))
    await vi.waitFor(() =>
      expect(calls.filter((c) => c.method === 'DELETE').map((c) => c.path)).toEqual([
        '/api/spells/drafts/d1',
      ]),
    )
  })
})
