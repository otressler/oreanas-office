// The fight page's side of the live table (knowledge/decisions/realtime-sync.md): one
// TableConnection while the fight runs, its status for the indicator, moves from the
// server merged into the cached board by version, others' move previews, and reloads
// after every (re)connect.
import { useQueryClient } from '@tanstack/react-query'
import type { HubConnection } from '@microsoft/signalr'
import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AddStatusRequest,
  ApiErrorCode,
  ArrowDrawnEvent,
  BoardCell,
  BoardState,
  DrawArrowRequest,
  FogChangedEvent,
  HubResult,
  InitiativeChangedEvent,
  InitiativeEntry,
  InitiativeResult,
  InitiativeRollResult,
  InitiativeView,
  MoveResult,
  MoveTokenRequest,
  PingRequest,
  PingedEvent,
  RemoveStatusRequest,
  SetStatusLevelRequest,
  SpawnCreaturesRequest,
  SpawnResult,
  StatusResult,
  TokenMovedEvent,
  TokenStatusesChangedEvent,
} from '../api/types'
import { encounterKeys } from '../encounters/queries'
import { applyInitiative, newerInitiative } from '../initiative/initiative'
import { recheckServer } from '../server/serverStatus'
import { NotConnectedError, TableConnection, type TableStatus } from './connection'
import { createTableConnection } from './createConnection'
import {
  applyMove,
  applyRemoved,
  applyRestored,
  applyStatuses,
  rememberMove,
  type KnownPositions,
} from './merge'
import {
  applyAdded,
  applyFogChanged,
  applyRevealed,
  applyTokenHidden,
  type KnownFog,
} from './fogMerge'
import { NO_PREVIEWS, withPreview, withoutPreview, type Previews } from './previews'

export interface Table {
  /** Null while the fight isn't running: there is nothing to connect to. */
  status: TableStatus | null
  /** The newest position seen per token; keeps them when an older board reload lands. */
  known: KnownPositions
  /** Where others are about to move tokens; empty while not connected. */
  previews: Previews
  /** Shows the others this device's preview, or (null) takes it back. Nothing while not connected. */
  preview: (request: MoveTokenRequest | null) => void
  /** Takes a confirmed move or undo into the board. */
  apply: (move: TokenMovedEvent) => void
  /** Reloads the board, e.g. after the server said the fight or token is gone. */
  reload: () => void
  move: (request: MoveTokenRequest) => Promise<MoveResult>
  undo: () => Promise<MoveResult>
  /** Pings for the others (best effort, nothing while not connected); the page shows its own at once. */
  ping: (request: Omit<PingRequest, 'encounterId'>) => void
  drawArrow: (request: Omit<DrawArrowRequest, 'encounterId'>) => void
  /** Status calls; the change also arrives as an event, which updates the board. */
  addStatus: (request: AddStatusRequest) => Promise<StatusResult>
  removeStatus: (request: RemoveStatusRequest) => Promise<StatusResult>
  setStatusLevel: (request: SetStatusLevelRequest) => Promise<StatusResult>
  /** Takes a status result's change into the board right away. */
  applyStatuses: (change: TokenStatusesChangedEvent) => void
  removeToken: (tokenId: string) => Promise<HubResult>
  restoreToken: (tokenId: string) => Promise<HubResult>
  /** The SignalR connection while joined to the encounter; null otherwise (spectator and shared screens). */
  hubConnection: HubConnection | null

  // ---- Stage 10: fog and spawning, for the session DM (knowledge/features/fog-of-war.md) ----

  /** The newest fog seen from events; mergeFog puts it into a reloaded board that has an older one. */
  knownFog: KnownFog | null
  /** Reveals or hides cells. Everyone, the caller included, gets FogChanged. */
  changeFog: (cells: BoardCell[], reveal: boolean) => Promise<HubResult>
  /** Reveals or hides creatures; the change also arrives as events. */
  setTokensHidden: (tokenIds: string[], hidden: boolean) => Promise<HubResult>
  /** Puts new creatures on the board; they arrive as TokensAdded. */
  spawnCreatures: (request: Omit<SpawnCreaturesRequest, 'encounterId'>) => Promise<SpawnResult>
  /** Takes back the latest fog change, reveal or spawn. */
  undoChange: () => Promise<HubResult>

  // ---- Initiative, for the session DM (knowledge/features/initiative.md) ----

  /** The newest list seen from events and results; newerInitiative picks it over an older board. */
  knownInitiative: InitiativeView | null
  /** A fresh roll for the setup screen; nothing is saved. */
  rollInitiative: () => Promise<InitiativeRollResult>
  /** Saves the whole list; the result's change is already taken into the board. */
  setInitiative: (entries: InitiativeEntry[]) => Promise<InitiativeResult>
  /** Switches initiative off for the fight. */
  clearInitiative: () => Promise<InitiativeResult>
}

/** Others' pings and arrows as they arrive; not kept anywhere, so the page keeps them. */
export interface TableEvents {
  onPinged?: (ping: PingedEvent) => void
  onArrowDrawn?: (arrow: ArrowDrawnEvent) => void
}

/** A screen that isn't a player's device (spectator view): what to do on a fresh connection. */
export interface TableScreen {
  /** Runs before JoinEncounter on every (re)connect: WatchSession. An error code stops the join. */
  beforeJoin: (connection: HubConnection) => Promise<ApiErrorCode | null>
}

export function useTable(
  campaignId: string,
  encounterId: string,
  running: boolean,
  events: TableEvents = {},
  screen?: TableScreen,
): Table {
  const queryClient = useQueryClient()
  // The latest handlers, so a new function each render doesn't reconnect.
  const handlers = useRef(events)
  useEffect(() => {
    handlers.current = events
  })
  const screenRef = useRef(screen)
  useEffect(() => {
    screenRef.current = screen
  })
  const isScreen = screen !== undefined
  const [status, setStatus] = useState<TableStatus>('connecting')
  const [hubConnection, setHubConnection] = useState<HubConnection | null>(null)
  const [known, setKnown] = useState<KnownPositions>(() => new Map())
  const [previews, setPreviews] = useState<Previews>(NO_PREVIEWS)
  const [knownFog, setKnownFog] = useState<KnownFog | null>(null)
  const [knownInitiative, setKnownInitiative] = useState<InitiativeView | null>(null)
  const connection = useRef<TableConnection | null>(null)

  const apply = useCallback(
    (move: TokenMovedEvent) => {
      setKnown((current) => rememberMove(current, move))
      queryClient.setQueryData<BoardState>(
        encounterKeys.board(campaignId, encounterId),
        (board) => board && applyMove(board, move),
      )
    },
    [queryClient, campaignId, encounterId],
  )

  const updateBoard = useCallback(
    (change: (board: BoardState) => BoardState) =>
      queryClient.setQueryData<BoardState>(
        encounterKeys.board(campaignId, encounterId),
        (board) => board && change(board),
      ),
    [queryClient, campaignId, encounterId],
  )
  const takeStatuses = useCallback(
    (change: TokenStatusesChangedEvent) => updateBoard((board) => applyStatuses(board, change)),
    [updateBoard],
  )

  const takeFog = useCallback(
    (event: FogChangedEvent) => {
      const key = encounterKeys.board(campaignId, encounterId)
      const board = queryClient.getQueryData<BoardState>(key)
      if (!board) return
      const next = applyFogChanged(board, event)
      if (next === board) return
      queryClient.setQueryData<BoardState>(key, next)
      if (next.fog) setKnownFog({ version: next.fog.version, hiddenCells: next.fog.hiddenCells })
    },
    [queryClient, campaignId, encounterId],
  )

  const takeInitiative = useCallback(
    (changed: InitiativeChangedEvent) => {
      if (changed.encounterId !== encounterId) return
      setKnownInitiative((current) => newerInitiative(current, changed.initiative))
      updateBoard((board) => applyInitiative(board, changed))
    },
    [encounterId, updateBoard],
  )

  const reload = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: encounterKeys.board(campaignId, encounterId),
      exact: true,
    })
  }, [queryClient, campaignId, encounterId])

  useEffect(() => {
    if (!running) return
    const table = new TableConnection({
      encounterId,
      createConnection: createTableConnection,
      recheckServer,
      onStatus: (next) => {
        setStatus(next)
        setHubConnection(next === 'connected' ? table.hubConnection : null)
      },
      beforeJoin: isScreen
        ? (connection) => screenRef.current?.beforeJoin(connection) ?? Promise.resolve(null)
        : undefined,
      onJoined: reload,
      onMoved: apply,
      onPreview: (preview) =>
        setPreviews((current) =>
          preview ? withPreview(current, preview) : current.size ? NO_PREVIEWS : current,
        ),
      onPreviewCleared: (cleared) => setPreviews((current) => withoutPreview(current, cleared)),
      onEnded: reload,
      onRejected: reload,
      onPinged: (ping) => handlers.current.onPinged?.(ping),
      onArrowDrawn: (arrow) => handlers.current.onArrowDrawn?.(arrow),
      onStatusesChanged: takeStatuses,
      onTokenRemoved: (removed) => updateBoard((board) => applyRemoved(board, removed)),
      onTokenRestored: (restored) => updateBoard((board) => applyRestored(board, restored)),
      onPresenceChanged: (event) =>
        updateBoard((board) =>
          board.encounterId === event.encounterId ? { ...board, presence: event.presence } : board,
        ),
      onFogChanged: takeFog,
      onTokenRevealed: (revealed) => updateBoard((board) => applyRevealed(board, revealed)),
      onTokenHidden: (hidden) => updateBoard((board) => applyTokenHidden(board, hidden)),
      onTokensAdded: (added) => updateBoard((board) => applyAdded(board, added)),
      onInitiativeChanged: takeInitiative,
    })
    connection.current = table
    table.start()
    return () => {
      table.dispose()
      if (connection.current === table) connection.current = null
      setStatus('connecting')
    }
  }, [
    running,
    encounterId,
    apply,
    reload,
    takeStatuses,
    takeFog,
    takeInitiative,
    updateBoard,
    isScreen,
  ])

  const move = useCallback(
    (request: MoveTokenRequest) =>
      connection.current?.move(request) ?? Promise.reject(new NotConnectedError()),
    [],
  )
  const preview = useCallback(
    (request: MoveTokenRequest | null) => connection.current?.preview(request),
    [],
  )
  const undo = useCallback(
    () => connection.current?.undo() ?? Promise.reject(new NotConnectedError()),
    [],
  )

  const ping = useCallback(
    (request: Omit<PingRequest, 'encounterId'>) =>
      connection.current?.ping({ encounterId, ...request }),
    [encounterId],
  )
  const drawArrow = useCallback(
    (request: Omit<DrawArrowRequest, 'encounterId'>) =>
      connection.current?.drawArrow({ encounterId, ...request }),
    [encounterId],
  )
  const addStatus = useCallback(
    (request: AddStatusRequest) =>
      connection.current?.addStatus(request) ?? Promise.reject(new NotConnectedError()),
    [],
  )
  const removeStatus = useCallback(
    (request: RemoveStatusRequest) =>
      connection.current?.removeStatus(request) ?? Promise.reject(new NotConnectedError()),
    [],
  )
  const setStatusLevel = useCallback(
    (request: SetStatusLevelRequest) =>
      connection.current?.setStatusLevel(request) ?? Promise.reject(new NotConnectedError()),
    [],
  )
  const removeToken = useCallback(
    (tokenId: string) =>
      connection.current?.removeToken(tokenId) ?? Promise.reject(new NotConnectedError()),
    [],
  )
  const restoreToken = useCallback(
    (tokenId: string) =>
      connection.current?.restoreToken(tokenId) ?? Promise.reject(new NotConnectedError()),
    [],
  )

  const changeFog = useCallback(
    (cells: BoardCell[], reveal: boolean) =>
      connection.current?.changeFog({ encounterId, cells, reveal }) ??
      Promise.reject(new NotConnectedError()),
    [encounterId],
  )
  const setTokensHidden = useCallback(
    (tokenIds: string[], hidden: boolean) =>
      connection.current?.setTokensHidden({ encounterId, tokenIds, hidden }) ??
      Promise.reject(new NotConnectedError()),
    [encounterId],
  )
  const spawnCreatures = useCallback(
    (request: Omit<SpawnCreaturesRequest, 'encounterId'>) =>
      connection.current?.spawnCreatures({ encounterId, ...request }) ??
      Promise.reject(new NotConnectedError()),
    [encounterId],
  )
  const undoChange = useCallback(
    () => connection.current?.undoChange() ?? Promise.reject(new NotConnectedError()),
    [],
  )

  const rollInitiative = useCallback(
    () => connection.current?.rollInitiative() ?? Promise.reject(new NotConnectedError()),
    [],
  )
  // The result's change goes into the board at once; its event may come a moment later.
  const takeResult = useCallback(
    (result: InitiativeResult) => {
      if (result.change) takeInitiative(result.change)
      return result
    },
    [takeInitiative],
  )
  const setInitiative = useCallback(
    (entries: InitiativeEntry[]) =>
      connection.current?.setInitiative({ encounterId, entries }).then(takeResult) ??
      Promise.reject(new NotConnectedError()),
    [encounterId, takeResult],
  )
  const clearInitiative = useCallback(
    () =>
      connection.current?.clearInitiative().then(takeResult) ??
      Promise.reject(new NotConnectedError()),
    [takeResult],
  )

  return {
    status: running ? status : null,
    known,
    previews: running ? previews : NO_PREVIEWS,
    preview,
    apply,
    reload,
    move,
    undo,
    ping,
    drawArrow,
    addStatus,
    removeStatus,
    setStatusLevel,
    applyStatuses: takeStatuses,
    removeToken,
    restoreToken,
    hubConnection: running ? hubConnection : null,
    knownFog,
    changeFog,
    setTokensHidden,
    spawnCreatures,
    undoChange,
    knownInitiative,
    rollInitiative,
    setInitiative,
    clearInitiative,
  }
}
