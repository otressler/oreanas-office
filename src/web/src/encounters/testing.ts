// Test data for the encounter screens, to feed the mocked API.
import type { BoardState, Character, Encounter, Session } from '../api/types'
import { testUser } from '../test/api'

export const ids = {
  campaign: 'c0000000-0000-0000-0000-000000000001',
  session: 's0000000-0000-0000-0000-000000000001',
  encounter: 'e0000000-0000-0000-0000-000000000001',
}

/** A 4 × 2 clearing: a wall at 3,1 and a goblin at 3,0, so six free cells. */
export function smallBoard(fields: Partial<BoardState> = {}): BoardState {
  const cells = [0, 1].flatMap((y) =>
    [0, 1, 2, 3].map((x) => ({
      x,
      y,
      terrain: x === 3 && y === 1 ? ('wall' as const) : ('floor' as const),
      elevation: 0,
    })),
  )
  return {
    encounterId: ids.encounter,
    campaignId: ids.campaign,
    sessionId: ids.session,
    name: 'Kleine Lichtung',
    status: 'ready',
    map: {
      id: 'm1',
      name: 'Kleine Lichtung',
      width: 4,
      height: 2,
      layout: { schemaVersion: 1, cells, features: [], entrances: [] },
      background: null,
    },
    tokens: [
      {
        id: 't1',
        kind: 'creature',
        characterId: null,
        creatureTypeId: 'goblin',
        ownerUserId: null,
        label: 'Goblin 1',
        x: 3,
        y: 0,
        elevation: 0,
        size: 'small',
        colorIndex: null,
        version: 0,
        imageUrl: null,
        color: null,
        statuses: [],
        hidden: false,
        dead: false,
      },
    ],
    isSessionDm: false,
    undoableMove: null,
    removedTokens: [],
    statuses: [],
    people: [],
    viewer: 'dm',
    fog: null,
    playMode: 'byod',
    presence: { people: [], sharedScreen: false },
    ...fields,
  }
}

export function character(name: string, fields: Partial<Character> = {}): Character {
  return {
    id: `ch-${name}`,
    ownerUserId: testUser.id,
    ownerDisplayName: testUser.displayName,
    name,
    size: 'medium',
    canEdit: true,
    colorIndex: 0,
    color: null,
    appearance: '',
    background: '',
    personality: '',
    bonds: '',
    tagline: '',
    characterClass: '',
    species: '',
    age: '',
    portraitUrl: null,
    ...fields,
  }
}

export function session(fields: Partial<Session> = {}): Session {
  return {
    id: ids.session,
    title: 'Sitzung 1',
    date: '2026-10-12',
    status: 'active',
    dmUserId: testUser.id,
    dmDisplayName: testUser.displayName,
    createdByUserId: testUser.id,
    canManage: true,
    isSessionDm: true,
    activeEncounter: null,
    interruptedEncounter: null,
    encounters: [],
    playMode: 'byod',
    characterPlayers: [],
    ...fields,
  }
}

export function encounter(fields: Partial<Encounter> = {}): Encounter {
  return {
    id: ids.encounter,
    name: 'Kleine Lichtung',
    status: 'ready',
    battleMapId: 'm1',
    battleMapName: 'Kleine Lichtung',
    width: 4,
    height: 2,
    creatureCount: 1,
    sessionId: ids.session,
    createdAt: '2026-10-12T18:00:00Z',
    version: 1,
    archivedAt: null,
    ...fields,
  }
}
