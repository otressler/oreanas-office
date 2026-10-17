import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { BoardToken } from '../api/types'
import type { BoardHandle } from '../board/Board'
import { MyCharacterButton } from './MyCharacterButton'

const me = 'u-mira'

function character(id: string, label: string, colorIndex: number, owner = me): BoardToken {
  return {
    id,
    kind: 'character',
    characterId: `c-${id}`,
    creatureTypeId: null,
    ownerUserId: owner,
    label,
    x: 0,
    y: 0,
    elevation: 0,
    size: 'medium',
    colorIndex,
    version: 0,
    imageUrl: null,
    color: null,
    statuses: [],
    hidden: false,
  }
}

const goblin: BoardToken = {
  ...character('g', 'Goblin', 0, ''),
  kind: 'creature',
  ownerUserId: null,
  colorIndex: null,
}

function setup(tokens: BoardToken[], removedTokens: BoardToken[] = []) {
  const centerOn = vi.fn<BoardHandle['centerOn']>()
  const board = { current: { centerOn, fit: vi.fn() } }
  const view = render(
    <MyCharacterButton tokens={tokens} removedTokens={removedTokens} userId={me} board={board} />,
  )
  return { centerOn, board, ...view }
}

describe('MyCharacterButton', () => {
  it('centres and pulses the own character, without anything else', async () => {
    const { centerOn } = setup([goblin, character('a', 'Held', 0)])
    await userEvent.click(screen.getByRole('button', { name: 'Meine Figur' }))
    expect(centerOn).toHaveBeenCalledWith('a', { pulse: true })
  })

  it('goes through several characters in campaign order, then starts again', async () => {
    // Listed out of order; the board puts own tokens on top.
    const { centerOn } = setup([
      character('c', 'Cara', 2),
      character('a', 'Arn', 0),
      character('x', 'Fremd', 1, 'u-other'),
      character('b', 'Bo', 1),
    ])
    const button = screen.getByRole('button', { name: 'Meine Figur' })
    for (let i = 0; i < 4; i++) await userEvent.click(button)
    expect(centerOn.mock.calls.map(([id]) => id)).toEqual(['a', 'b', 'c', 'a'])
  })

  it('skips a character taken off the board', async () => {
    const arn = character('a', 'Arn', 0)
    const bo = character('b', 'Bo', 1)
    const { centerOn, rerender, board } = setup([arn, bo])
    const button = screen.getByRole('button', { name: 'Meine Figur' })
    await userEvent.click(button)
    rerender(<MyCharacterButton tokens={[arn]} removedTokens={[bo]} userId={me} board={board} />)
    await userEvent.click(button)
    await userEvent.click(button)
    expect(centerOn.mock.calls.map(([id]) => id)).toEqual(['a', 'a', 'a'])
  })

  it('is off and says why when none of them is on the board', () => {
    setup([goblin], [character('a', 'Held', 0)])
    expect(
      screen.getByRole('button', { name: 'Deine Figur ist nicht in diesem Kampf' }),
    ).toBeDisabled()
  })

  it('stays, off, when the only character leaves the board of a player', () => {
    // Players don't get the removed tokens; the one seen before keeps the button.
    const hero = character('a', 'Held', 0)
    const { rerender, board } = setup([goblin, hero])
    rerender(<MyCharacterButton tokens={[goblin]} removedTokens={[]} userId={me} board={board} />)
    expect(
      screen.getByRole('button', { name: 'Deine Figur ist nicht in diesem Kampf' }),
    ).toBeDisabled()
  })

  it('isn’t there for someone without a character in the fight', () => {
    setup([goblin, character('x', 'Fremd', 0, 'u-other')])
    expect(screen.queryByRole('button')).toBeNull()
  })
})
