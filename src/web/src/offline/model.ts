// Creature types and encounters kept in the browser, next to the maps in editor/model.ts
// (knowledge/decisions/offline-prep-pwa.md, "Items").
import type { CreatureSize, EncounterMapCopy, EncounterStatus } from '../api/types'
import type { SyncState } from './sync'

export interface LocalCreatureType {
  id: string
  campaignId: string
  name: string
  size: CreatureSize
  appearance: string
  notes: string
  archivedAt: string | null
  createdAt: string
  updatedAt: string
  sync: SyncState
  /** The record format; readers upgrade older records when loading. */
  recordVersion: number
}

export const LOCAL_CREATURE_TYPE_RECORD_VERSION = 1

export interface LocalCreatureToken {
  id: string
  creatureTypeId: string
  label: string
  x: number
  y: number
  /** Copied from the type when placed; changing the type later doesn't change it. */
  size: CreatureSize
}

export interface LocalEncounter {
  id: string
  campaignId: string
  battleMapId: string
  name: string
  /** Devices change only draft and ready encounters; active and ended ones are pulled read-only. */
  status: EncounterStatus
  archivedAt: string | null
  tokens: LocalCreatureToken[]
  /** Set by the server when the encounter starts. */
  sessionId: string | null
  mapCopy: EncounterMapCopy | null
  createdAt: string
  updatedAt: string
  sync: SyncState
  /** The record format; readers upgrade older records when loading. */
  recordVersion: number
}

export const LOCAL_ENCOUNTER_RECORD_VERSION = 1
