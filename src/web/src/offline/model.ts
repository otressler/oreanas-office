// Creature types and encounters kept in the browser, next to the maps in editor/model.ts
// (knowledge/decisions/offline-prep-pwa.md, "Items").
import type {
  CreatureSize,
  EncounterMapCopy,
  EncounterStatus,
  FogDocument,
  SessionStatus,
} from '../api/types'
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
  /** Only the session DM sees it until revealed (fog of war). Absent means false. */
  hidden?: boolean
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
  /** The session the fight is planned for and runs in; changes only while draft or ready. */
  sessionId: string
  mapCopy: EncounterMapCopy | null
  /** The encounter's fog (fog of war); absent or null while fog is off. */
  fog?: FogDocument | null
  createdAt: string
  updatedAt: string
  sync: SyncState
  /** The record format; readers upgrade older records when loading. */
  recordVersion: number
}

/** 2: every encounter belongs to a session (knowledge/features/session-planning.md). */
export const LOCAL_ENCOUNTER_RECORD_VERSION = 2

/**
 * A session of a campaign as the last pull saw it. Sessions are created and changed online
 * only; the device keeps them read-only, so fights can be planned into them offline
 * (knowledge/decisions/offline-prep-pwa.md, "Campaigns offline").
 */
export interface LocalSession {
  id: string
  campaignId: string
  title: string
  date: string
  status: SessionStatus
  dmUserId: string
  dmDisplayName: string
}
