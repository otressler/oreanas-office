import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { FogArea } from '../api/types'
import { de } from '../text/de'
import { NEW_DRAFT, type FogDraft } from './draft'
import { FogBar } from './FogBar'

const t = de.fog.board

const areas: FogArea[] = [
  { id: 'a1', name: 'Nordkammer', cells: [[1, 1]] },
  { id: 'a2', name: 'Halle', cells: [[1, 1]] },
]

function setup(draft: FogDraft = NEW_DRAFT, props: Partial<Parameters<typeof FogBar>[0]> = {}) {
  const handlers = {
    onTool: vi.fn(),
    onDirection: vi.fn(),
    onChooseArea: vi.fn(),
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  }
  render(
    <FogBar
      draft={draft}
      count={0}
      connected
      busy={false}
      error={null}
      noArea={false}
      bottom={0}
      {...handlers}
      {...props}
    />,
  )
  return { ...handlers, user: userEvent.setup() }
}

const chosen = (reveal = true): FogDraft => ({
  ...NEW_DRAFT,
  reveal,
  cells: new Set(['1,1', '2,1']),
})

/** The confirm button: "Aufdecken" or "Verdecken" twice on the bar, once as a direction segment. */
const confirmButton = (verb: string) =>
  screen.getAllByRole('button', { name: verb }).find((b) => !b.hasAttribute('aria-pressed'))!

describe('FogBar', () => {
  it('shows the tools and the direction, and tells what the tool waits for', async () => {
    const { user, onTool, onDirection } = setup()
    expect(screen.getByText(t.hints.brush)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: t.tools.brush })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await user.click(screen.getByRole('button', { name: t.tools.rect }))
    expect(onTool).toHaveBeenCalledWith('rect')
    await user.click(screen.getByRole('button', { name: t.hide }))
    expect(onDirection).toHaveBeenCalledWith(false)
  })

  it('asks for the first corner of a rectangle, then the second', () => {
    setup({ ...NEW_DRAFT, tool: 'rect' })
    expect(screen.getByText(t.hints.rectFirst)).toBeInTheDocument()
  })

  it('says the second corner is next after the first tap', () => {
    setup({ ...NEW_DRAFT, tool: 'rect', corner: { x: 1, y: 1 } })
    expect(screen.getByText(t.hints.rectSecond)).toBeInTheDocument()
  })

  it('says when a tapped cell lies in no area', () => {
    setup({ ...NEW_DRAFT, tool: 'area' }, { noArea: true })
    expect(screen.getByText(t.noArea)).toBeInTheDocument()
  })

  it('asks "12 Felder aufdecken?" and sends only on confirm, never on cancel', async () => {
    const { user, onConfirm, onCancel } = setup(chosen(), { count: 12 })
    expect(screen.getByText(t.confirmReveal(12))).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: t.cancel }))
    expect(onCancel).toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
    await user.click(confirmButton(t.reveal))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('asks to hide, with the singular for one cell', () => {
    setup(chosen(false), { count: 1 })
    expect(screen.getByText('1 Feld verdecken?')).toBeInTheDocument()
    expect(confirmButton(t.hide)).toBeEnabled()
  })

  it('has nothing to send when the cells are already so', () => {
    setup(chosen(), { count: 0 })
    expect(screen.getByText(t.nothingToChange)).toBeInTheDocument()
    expect(confirmButton(t.reveal)).toBeDisabled()
  })

  it('can’t send without a connection, and says why', () => {
    setup(chosen(), { count: 3, connected: false })
    expect(screen.getByText(de.fog.needsConnection)).toBeInTheDocument()
    expect(confirmButton(t.reveal)).toBeDisabled()
  })

  it('can’t send twice while the first is on its way', () => {
    setup(chosen(), { count: 3, busy: true })
    expect(confirmButton(t.reveal)).toBeDisabled()
  })

  it('lets the DM pick one of several areas under a tapped cell', async () => {
    const draft: FogDraft = {
      ...NEW_DRAFT,
      tool: 'area',
      cells: new Set(['1,1']),
      choose: { cell: { x: 1, y: 1 }, areas },
    }
    const { user, onChooseArea } = setup(draft, { count: 1 })
    expect(screen.getByText(t.chooseArea)).toBeInTheDocument()
    // No confirm bar until an area is chosen.
    expect(screen.queryByText(t.confirmReveal(1))).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Halle' }))
    expect(onChooseArea).toHaveBeenCalledWith(areas[1])
  })

  it('shows a failure as an alert', () => {
    setup(chosen(), { count: 2, error: t.failed })
    expect(screen.getByRole('alert')).toHaveTextContent(t.failed)
  })
})
