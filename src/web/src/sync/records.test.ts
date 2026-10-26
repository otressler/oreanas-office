// The initiative fields in sync items (knowledge/features/initiative.md): a type's modifier
// and advantage, a creature's own, and their defaults for records written before them.
import { describe, expect, it } from 'vitest'
import type { SyncServerItem } from '../api/types'
import {
  LOCAL_CREATURE_TYPE_RECORD_VERSION,
  LOCAL_ENCOUNTER_RECORD_VERSION,
  type LocalCreatureType,
  type LocalEncounter,
} from '../offline/model'
import { newSyncState } from '../offline/sync'
import { recordFromServer, recordPushItem, sameData } from './records'

const time = '2026-10-25T10:00:00.000Z'

const type = (fields: Partial<LocalCreatureType> = {}): LocalCreatureType => ({
  id: 'goblin',
  campaignId: 'c1',
  name: 'Goblin',
  size: 'small',
  appearance: '',
  notes: '',
  archivedAt: null,
  createdAt: time,
  updatedAt: time,
  sync: newSyncState(),
  recordVersion: LOCAL_CREATURE_TYPE_RECORD_VERSION,
  ...fields,
})

const encounter = (tokens: LocalEncounter['tokens']): LocalEncounter => ({
  id: 'e1',
  campaignId: 'c1',
  battleMapId: 'm1',
  name: 'Überfall',
  status: 'draft',
  archivedAt: null,
  tokens,
  sessionId: 's1',
  mapCopy: null,
  createdAt: time,
  updatedAt: time,
  sync: newSyncState(),
  recordVersion: LOCAL_ENCOUNTER_RECORD_VERSION,
})

const server = (item: ReturnType<typeof recordPushItem>): SyncServerItem => ({
  id: item.id,
  kind: item.kind,
  campaignId: item.campaignId,
  version: 1,
  updatedAt: time,
  updatedByDisplayName: null,
  campaign: null,
  creatureType: item.creatureType,
  map: null,
  encounter: item.encounter && { ...item.encounter, mapCopy: null },
})

describe('initiative in sync items', () => {
  it('pushes a type’s modifier and advantage, 0 and false for records without them', () => {
    expect(recordPushItem('creatureType', type()).creatureType).toMatchObject({
      initiativeModifier: 0,
      initiativeRollMode: 'normal',
    })
    const quick = recordPushItem(
      'creatureType',
      type({ initiativeModifier: 3, initiativeRollMode: 'disadvantage' }),
    )
    expect(quick.creatureType).toMatchObject({
      initiativeModifier: 3,
      initiativeRollMode: 'disadvantage',
    })
    expect(recordFromServer(server(quick))).toMatchObject({
      initiativeModifier: 3,
      initiativeRollMode: 'disadvantage',
    })
    expect(sameData(quick, server(quick))).toBe(true)
  })

  it('pushes a creature’s own values, and null where it takes its type’s', () => {
    const item = recordPushItem(
      'encounter',
      encounter([
        { id: 't1', creatureTypeId: 'goblin', label: 'Goblin 1', x: 0, y: 0, size: 'small' },
        {
          id: 't2',
          creatureTypeId: 'goblin',
          label: 'Goblin 2',
          x: 1,
          y: 0,
          size: 'small',
          initiativeModifier: -2,
          initiativeRollMode: 'advantage',
        },
      ]),
    )
    expect(item.encounter?.tokens.map((t) => [t.initiativeModifier, t.initiativeRollMode])).toEqual(
      [
        [null, null],
        [-2, 'advantage'],
      ],
    )
    expect(sameData(item, server(item))).toBe(true)
    const pulled = recordFromServer(server(item)) as LocalEncounter
    expect(pulled.tokens[1]).toMatchObject({
      initiativeModifier: -2,
      initiativeRollMode: 'advantage',
    })
  })
})
