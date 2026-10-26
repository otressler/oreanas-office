// The initiative list for the mock hub (knowledge/features/initiative.md): RollInitiative,
// SetInitiative and ClearInitiative for the session DM, saved on the mock encounter and
// sent to the session DM's devices only, as the real hub does. Creatures roll fixed d20s
// (7, 14, 3, …) so specs know the values: every creature type has modifier 0.
import type { components } from '../src/api/schema.js'
import type { MockBackend } from './mockBackend.ts'

type S = components['schemas']

interface InitiativeHub {
  sendEach(encounterId: string, target: string, build: (userId: string | null) => unknown): void
}

/** The d20 the creature at this place of the encounter's token list rolls. */
export const mockRoll = (index: number) => ((index * 7 + 6) % 20) + 1

export function initiativeCall(
  backend: MockBackend,
  hub: InitiativeHub,
  userId: string | null,
  method: string,
  args: unknown[],
): unknown {
  const encounterId =
    method === 'SetInitiative'
      ? String((args[0] as S['SetInitiativeRequest']).encounterId)
      : String(args[0])
  const encounter = backend.encounters.find((e) => e.id === encounterId)
  const session = encounter && backend.sessions.find((s) => s.id === encounter.sessionId)
  const failure = (error: S['ApiErrorCode']) =>
    method === 'RollInitiative' ? { error, entries: null } : { error, change: null }
  if (!encounter || !session) return failure('tokenNotFound')
  if (encounter.status !== 'active') return failure('encounterNotActive')
  if (session.dmUserId !== userId) return failure('notSessionDm')

  if (method === 'RollInitiative') {
    const onBoard = encounter.tokens.filter((t) => !t.removedAt)
    const creatures = onBoard.filter((t) => t.kind === 'creature')
    return {
      error: null,
      entries: [
        ...onBoard
          .filter((t) => t.kind === 'character')
          .map((t) => ({
            tokenId: t.id,
            value: null,
            modifier: 0,
            mode: 'normal' as const,
            rolls: [],
          })),
        ...creatures.map((t, index) => ({
          tokenId: t.id,
          value: mockRoll(index),
          modifier: 0,
          mode: 'normal' as const,
          rolls: [mockRoll(index)],
        })),
      ],
    } satisfies S['InitiativeRollResult']
  }

  const entries = method === 'SetInitiative' ? (args[0] as S['SetInitiativeRequest']).entries : null
  encounter.initiative = { version: (encounter.initiative?.version ?? 0) + 1, entries }
  const change: S['InitiativeChangedEvent'] = { encounterId, initiative: encounter.initiative }
  hub.sendEach(encounterId, 'InitiativeChanged', (to) => (to === session.dmUserId ? change : null))
  return { error: null, change } satisfies S['InitiativeResult']
}
