// The live table's SignalR contract (knowledge/decisions/realtime-sync.md), the twin of
// src/Server/Table/TableContracts.cs. The message types come from openapi.json, which
// also lists the hub's method names as TableHubMethod and TableClientMethod; the checks
// below fail to compile when these maps and the server's interfaces drift apart.
//
// Order on every (re)connect: JoinEncounter, then reload the board. A TokenMoved event
// can arrive before the board; keep whichever position has the higher token version.
import type { HubConnection } from '@microsoft/signalr'
import type {
  AddStatusRequest,
  ArrowDrawnEvent,
  DrawArrowRequest,
  HubResult,
  MovePreviewClearedEvent,
  MovePreviewEvent,
  MoveResult,
  MoveTokenRequest,
  PingRequest,
  PingedEvent,
  RemoveStatusRequest,
  SetStatusLevelRequest,
  StatusResult,
  TableClientMethod,
  TableHubMethod,
  TokenMovedEvent,
  TokenRemovedEvent,
  TokenRestoredEvent,
  TokenStatusesChangedEvent,
} from '../api/types'

export const TABLE_HUB_PATH = '/hubs/table'

/** Device → server calls: their arguments and results. */
export interface TableHubCalls {
  /** Joins the encounter's group. Errors: tokenNotFound, encounterNotActive. */
  JoinEncounter: { args: [encounterId: string]; result: HubResult }
  /** Errors: tokenNotFound, encounterNotActive, notYourToken, targetInvalid. */
  MoveToken: { args: [request: MoveTokenRequest]; result: MoveResult }
  /**
   * Shows the others where the caller is about to move a token (the confirm step). Same
   * checks as MoveToken; replaces the caller's earlier preview.
   */
  PreviewMove: { args: [request: MoveTokenRequest]; result: HubResult }
  /** The caller let go of the token without moving it. MoveToken clears the preview by itself. */
  ClearPreview: { args: []; result: void }
  /** Puts back the caller's last move in the encounter. Errors: tokenNotFound, encounterNotActive, nothingToUndo. */
  UndoMove: { args: [encounterId: string]; result: MoveResult }
  /** The person touched the screen: resets the server's 30-minute idle timer. At most once a minute. */
  MarkActive: { args: []; result: void }
  /**
   * Points at a cell or a token; the others get Pinged. Not saved; more than three pings and
   * arrows in two seconds are dropped silently. Errors: tokenNotFound, encounterNotActive,
   * targetInvalid.
   */
  Ping: { args: [request: PingRequest]; result: HubResult }
  /** An arrow from a cell or token to a cell; the others get ArrowDrawn. Errors as Ping. */
  DrawArrow: { args: [request: DrawArrowRequest]; result: HubResult }
  /**
   * Errors: tokenNotFound, encounterNotActive, notYourToken, statusNotFound,
   * statusAlreadySet, levelInvalid. Everyone, the caller included, gets TokenStatusesChanged.
   */
  AddStatus: { args: [request: AddStatusRequest]; result: StatusResult }
  /** Errors: tokenNotFound, encounterNotActive, statusNotFound, notYourStatus. */
  RemoveStatus: { args: [request: RemoveStatusRequest]; result: StatusResult }
  /** Errors as RemoveStatus, and levelInvalid. */
  SetStatusLevel: { args: [request: SetStatusLevelRequest]; result: StatusResult }
  /** Session DM only. Errors: tokenNotFound, encounterNotActive, notSessionDm. Everyone gets TokenRemoved. */
  RemoveToken: { args: [tokenId: string]; result: HubResult }
  /** Session DM only. Errors as RemoveToken. Everyone gets TokenRestored. */
  RestoreToken: { args: [tokenId: string]; result: HubResult }
}

/** Server → device messages and their arguments. */
export interface TableClientEvents {
  /** A confirmed move or undo, the device's own included. */
  TokenMoved: [move: TokenMovedEvent]
  /** Someone else is about to move a token there; also sent on joining, for previews already shown. */
  MovePreviewed: [preview: MovePreviewEvent]
  /** That preview is gone: moved, let go of, or its device left. */
  MovePreviewCleared: [cleared: MovePreviewClearedEvent]
  /** The session DM ended the fight (or the session). */
  EncounterEnded: [encounterId: string]
  /** The server is about to drop this idle connection; don't reconnect until the person is back. */
  IdleTimeout: []
  /** Someone else pointed at a cell or token; the sender's own device showed it already. */
  Pinged: [ping: PingedEvent]
  /** Someone else drew an arrow; it replaces their older one. */
  ArrowDrawn: [arrow: ArrowDrawnEvent]
  /** A token's whole status list, the device's own changes included. */
  TokenStatusesChanged: [change: TokenStatusesChangedEvent]
  /** The session DM took a token off the board. */
  TokenRemoved: [removed: TokenRemovedEvent]
  /** A removed token is back. */
  TokenRestored: [restored: TokenRestoredEvent]
}

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
const contractMatches: [
  Same<keyof TableHubCalls, TableHubMethod>,
  Same<keyof TableClientEvents, TableClientMethod>,
] = [true, true]
void contractMatches

/** Calls a hub method with the contract's argument and result types. */
export function invokeHub<M extends keyof TableHubCalls>(
  connection: HubConnection,
  method: M,
  ...args: TableHubCalls[M]['args']
): Promise<TableHubCalls[M]['result']> {
  return connection.invoke<TableHubCalls[M]['result']>(method, ...args)
}

/** Listens to a server message with the contract's argument types. Returns the unsubscribe. */
export function onHubEvent<E extends keyof TableClientEvents>(
  connection: HubConnection,
  event: E,
  handler: (...args: TableClientEvents[E]) => void,
): () => void {
  const listener = handler as (...args: unknown[]) => void
  connection.on(event, listener)
  return () => connection.off(event, listener)
}
