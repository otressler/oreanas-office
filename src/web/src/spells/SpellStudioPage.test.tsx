// The studio's "Vorschlagen" (knowledge/features/spell-cards.md, "Art studio"): the text
// model's motif lands in the editor unsaved, and an error shows instead of replacing it.
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createQueryClient } from '../api/queryClient'
import type { SpellStudio } from '../api/types'
import { json, mockApi, type ApiCall } from '../test/api'
import { de } from '../text/de'
import { SpellStudioPage } from './SpellStudioPage'

const t = de.spells.studio
const VARIANT = 'v1'

const studio = (over: Partial<SpellStudio> = {}): SpellStudio => ({
  variant: {
    id: VARIANT,
    spellId: 's1',
    nameEn: 'Moonbeam',
    level: 2,
    school: 'evocation',
    author: { id: 'u', displayName: 'Mira' },
    basedOnVariantId: null,
    origin: 'manual',
    card: {
      name: 'Mondstrahl',
      castingTime: '1 Aktion',
      range: '36 m',
      components: 'V, G, M',
      duration: 'bis 1 Minute',
      concentration: true,
      ritual: false,
      description: 'Ein silbriger Strahl.',
      effects: [],
      icon: 'moon',
      pips: [],
      higherLevels: '',
      tip: '',
      material: '',
      source: '',
      writeIns: [],
    },
    artAssetId: null,
    artUrl: null,
    artApproved: false,
    usedBy: 0,
    canEdit: true,
    createdAt: '2026-11-24T00:00:00Z',
    updatedAt: '2026-11-24T00:00:00Z',
  },
  canEdit: true,
  generator: { available: true, model: 'gpt-image', quality: 'high', width: 1008, height: 1728 },
  motifSuggestions: true,
  budget: { spentUsd: 0, limitUsd: 20 } as SpellStudio['budget'],
  prompts: [
    {
      id: 'p1',
      letter: 'a',
      subject: 'a wolf in moonlight',
      source: 'studio',
      createdAt: '2026-11-24T00:00:00Z',
    },
  ],
  images: [],
  events: [],
  ...over,
})

let calls: ApiCall[]
let answer: () => Response

beforeEach(() => {
  answer = () => json(200, { subject: 'close view of a hand raising a moonseed leaf' })
  calls = mockApi({
    'GET /api/spells/variants/:v/studio': () => json(200, studio()),
    'POST /api/spells/variants/:v/studio/motif': () => answer(),
  })
})

function renderStudio() {
  const queryClient = createQueryClient()
  queryClient.setDefaultOptions({ queries: { retry: false } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/zauber/varianten/${VARIANT}/studio`]}>
        <Routes>
          <Route path="/zauber/varianten/:variantId/studio" element={<SpellStudioPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('suggesting a motif', () => {
  it('puts the suggestion into the editor without saving it', async () => {
    renderStudio()
    const editor = await screen.findByRole('textbox', { name: t.motif('a') })
    expect(editor).toHaveValue('a wolf in moonlight')

    await userEvent.click(screen.getByRole('button', { name: t.suggest }))

    expect(editor).toHaveValue('close view of a hand raising a moonseed leaf')
    expect(calls.filter((c) => c.method === 'POST').map((c) => c.path)).toEqual([
      `/api/spells/variants/${VARIANT}/studio/motif`,
    ])
    // Unsaved: discarding brings the saved motif back.
    await userEvent.click(screen.getByRole('button', { name: t.discard }))
    expect(editor).toHaveValue('a wolf in moonlight')
  })

  it('keeps the text and shows the error when the model gives none', async () => {
    answer = () => json(409, { code: 'motifSuggestionFailed' })
    renderStudio()
    const editor = await screen.findByRole('textbox', { name: t.motif('a') })

    await userEvent.click(screen.getByRole('button', { name: t.suggest }))

    expect(await screen.findByRole('alert')).toHaveTextContent(de.errors.motifSuggestionFailed)
    expect(editor).toHaveValue('a wolf in moonlight')
  })

  it('deletes a motif without pictures, not one with a picture', async () => {
    const picture = (id: string, letter: string, status: 'done' | 'failed') => ({
      id,
      letter,
      promptId: letter === 'b' ? 'p2' : 'p1',
      origin: 'generated' as const,
      status,
      url: status === 'done' ? '/img.webp' : null,
      failure: null,
      prompt: null,
      model: null,
      quality: null,
      attempts: 1,
      queuePosition: null,
      createdAt: '2026-11-24T00:00:00Z',
      startedAt: null,
      finishedAt: null,
    })
    calls = mockApi({
      'GET /api/spells/variants/:v/studio': () =>
        json(
          200,
          studio({
            prompts: [
              ...studio().prompts,
              { ...studio().prompts[0], id: 'p2', letter: 'b', subject: 'an owl' },
            ],
            // a: only a failed request, so it can go; b: a picture, so it stays.
            images: [picture('i1', 'a', 'failed'), picture('i2', 'b', 'done')],
          }),
        ),
      'DELETE /api/spells/variants/:v/studio/motifs/:letter': () =>
        new Response(null, { status: 204 }),
    })
    const confirm = vi.spyOn(window, 'confirm')
    renderStudio()
    await screen.findByRole('textbox', { name: t.motif('b') })
    const deletes = () => calls.filter((c) => c.method === 'DELETE').map((c) => c.path)

    const remove = screen.getAllByRole('button', { name: t.deleteMotif })
    expect(remove).toHaveLength(1)
    // It asks in the row; "Behalten" keeps the motif.
    await userEvent.click(remove[0])
    expect(screen.getByText(t.confirmDeleteMotif('a'))).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: t.deleteMotifNo }))
    expect(deletes()).toEqual([])

    await userEvent.click(screen.getByRole('button', { name: t.deleteMotif }))
    await userEvent.click(screen.getByRole('button', { name: t.deleteMotifYes }))
    expect(deletes()).toEqual([`/api/spells/variants/${VARIANT}/studio/motifs/a`])
    // Never the browser's own dialog.
    expect(confirm).not.toHaveBeenCalled()
    confirm.mockRestore()
  })

  it('offers no suggestions without a text model', async () => {
    mockApi({
      'GET /api/spells/variants/:v/studio': () => json(200, studio({ motifSuggestions: false })),
    })
    renderStudio()
    await screen.findByRole('textbox', { name: t.motif('a') })
    expect(screen.queryByRole('button', { name: t.suggest })).toBeNull()
  })
})
