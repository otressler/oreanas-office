// The hub's method names in openapi.json, which the server writes from its interfaces,
// against the ones this app calls and listens to. Catches a schema.d.ts that wasn't
// regenerated after the server's contract changed.
import { describe, expect, it } from 'vitest'
import openapi from '../api/openapi.json'
import type { TableClientEvents, TableHubCalls } from './hub'

const hubMethods = {
  JoinEncounter: true,
  MoveToken: true,
  UndoMove: true,
  MarkActive: true,
  PreviewMove: true,
  ClearPreview: true,
  Ping: true,
  DrawArrow: true,
  AddStatus: true,
  RemoveStatus: true,
  SetStatusLevel: true,
  RemoveToken: true,
  RestoreToken: true,
  WatchSession: true,
  ChangeFog: true,
  SetTokensHidden: true,
  SpawnCreatures: true,
  UndoChange: true,
} satisfies Record<keyof TableHubCalls, true>

const clientMethods = {
  TokenMoved: true,
  EncounterEnded: true,
  IdleTimeout: true,
  MovePreviewed: true,
  MovePreviewCleared: true,
  Pinged: true,
  ArrowDrawn: true,
  TokenStatusesChanged: true,
  TokenRemoved: true,
  TokenRestored: true,
  EncounterStarted: true,
  SessionEnded: true,
  PlayModeChanged: true,
  PresenceChanged: true,
  FogChanged: true,
  TokenRevealed: true,
  TokenHidden: true,
  TokensAdded: true,
  ReloadBoard: true,
} satisfies Record<keyof TableClientEvents, true>

describe('table hub contract', () => {
  it('calls the methods the server lists', () => {
    expect(Object.keys(hubMethods).sort()).toEqual(openapi.components.schemas.TableHubMethod.enum)
  })

  it('listens to the messages the server lists', () => {
    expect(Object.keys(clientMethods).sort()).toEqual(
      openapi.components.schemas.TableClientMethod.enum,
    )
  })
})
