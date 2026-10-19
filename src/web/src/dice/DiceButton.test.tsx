import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { createQueryClient, meQueryKey } from '../api/queryClient'
import { testUser } from '../test/api'
import { DiceButton } from './DiceButton'
import type { DiceRoller } from './diceRoller'
import { loadDiceHistory, saveDiceHistory } from './history'
import { forgetDiceTray } from './tray'

afterEach(() => forgetDiceTray())

function renderButton() {
  const queryClient = createQueryClient()
  queryClient.setQueryData(meQueryKey, testUser)
  render(
    <QueryClientProvider client={queryClient}>
      <DiceButton />
    </QueryClientProvider>,
  )
}

/** Opens the dialog and returns the tray inside it, with queries into its shadow root. */
async function openTray() {
  await userEvent.click(screen.getByRole('button', { name: 'Würfeln' }))
  const dialog = screen.getByRole('dialog', { name: 'Würfel' })
  const roller = dialog.querySelector('dice-roller') as DiceRoller | null
  expect(roller).not.toBeNull()
  return { dialog, roller: roller!, tray: within(roller!.shadowRoot as unknown as HTMLElement) }
}

describe('DiceButton', () => {
  it('opens the dice tray in a dialog and rolls on this device', async () => {
    renderButton()
    const { roller, tray } = await openTray()

    await userEvent.click(tray.getByRole('button', { name: 'Einen W20 dazunehmen' }))
    await userEvent.click(tray.getByRole('button', { name: 'Modifikator erhöhen' }))
    await userEvent.click(tray.getByRole('button', { name: '1 Würfel werfen' }))

    await waitFor(() => expect(roller.lastResult).not.toBeNull())
    const result = roller.lastResult!
    expect(result.notation).toBe('W20 + 1')
    expect(result.total).toBe(result.dice[0]!.value + 1)
    expect(result.total).toBeGreaterThanOrEqual(2)
    expect(result.total).toBeLessThanOrEqual(21)
    expect(tray.getByRole('button', { name: 'Noch mal würfeln' })).toBeEnabled()
    // Kept on the device for this person
    expect(loadDiceHistory(testUser.id)).toEqual([
      expect.objectContaining({ notation: 'W20 + 1', total: result.total }),
    ])
  })

  it('keeps the dice when the dialog closes and opens again', async () => {
    renderButton()
    const first = await openTray()
    await userEvent.click(first.tray.getByRole('button', { name: 'Einen W6 dazunehmen' }))
    await userEvent.click(first.tray.getByRole('button', { name: /Einen W6 dazunehmen/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Schließen' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    const again = await openTray()
    expect(again.roller).toBe(first.roller)
    expect(again.roller.notation).toBe('2W6')
  })

  it('brings back the last rolls kept on the device', async () => {
    saveDiceHistory(testUser.id, [
      {
        notation: '2W6 + 3',
        mode: 'normal',
        modifier: 3,
        total: 11,
        groups: [
          {
            sides: 6,
            rolls: [
              { value: 4, dropped: null },
              { value: 4, dropped: null },
            ],
          },
        ],
      },
    ])
    renderButton()
    const { tray } = await openTray()
    expect(tray.getByText('Letzte Würfe')).toBeInTheDocument()
    expect(tray.getByRole('button', { name: '2W6 + 3 noch mal würfeln' })).toBeInTheDocument()
  })
})

describe('loadDiceHistory', () => {
  it('drops entries that are not well formed', () => {
    localStorage.setItem(
      `oreana.dice.${testUser.id}`,
      JSON.stringify([
        { notation: 'W20', mode: 'normal', modifier: 0, total: 7, groups: [] },
        { notation: 'W20', mode: 'sideways', modifier: 0, total: 7, groups: [] },
        { notation: 'W7', mode: 'normal', modifier: 0, total: '<b>', groups: [] },
        {
          notation: 'W7',
          mode: 'normal',
          modifier: 0,
          total: 3,
          groups: [{ sides: 7, rolls: [] }],
        },
      ]),
    )
    expect(loadDiceHistory(testUser.id)).toHaveLength(1)
  })

  it('starts empty with nothing stored or broken storage', () => {
    expect(loadDiceHistory(testUser.id)).toEqual([])
    localStorage.setItem(`oreana.dice.${testUser.id}`, '{not json')
    expect(loadDiceHistory(testUser.id)).toEqual([])
  })
})
