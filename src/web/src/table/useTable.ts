// The fight page's side of the live table (knowledge/decisions/realtime-sync.md): one
// TableConnection while the fight runs, its status for the indicator, moves from the
// server merged into the cached board by version, others' move previews, and reloads
// after every (re)connect.
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AddStatusRequest,
  ArrowDrawnEvent,
  BoardState,
  DrawArrowRequest,
  HubResult,
  MoveResult,
  MoveTokenRequest,
  PingRequest,
  PingedEvent,
  RemoveStatusRequest,
  SetStatusLevelRequest,
  StatusResult,
  TokenMovedEvent,
  TokenStatusesChangedEvent,
} from '../api/types'
import { encounterKeys } from '../encounters/queries'
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
}

/** Others' pings and arrows as they arrive; not kept anywhere, so the page keeps them. */
export interface TableEvents {
  onPinged?: (ping: PingedEvent) => void
  onArrowDrawn?: (arrow: ArrowDrawnEvent) => void
}

export function useTable(
  campaignId: string,
  encounterId: string,
  running: boolean,
  events: TableEvents = {},
): Table {
  const queryClient = useQueryClient()
  // The latest handlers, so a new function each render doesn't reconnect.
  const handlers = useRef(events)
  useEffect(() => {
    handlers.current = events
  })
  const [status, setStatus] = useState<TableStatus>('connecting')
  const [known, setKnown] = useState<KnownPositions>(() => new Map())
  const [previews, setPreviews] = useState<Previews>(NO_PREVIEWS)
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
      onStatus: setStatus,
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
    })
    connection.current = table
    table.start()
    return () => {
      table.dispose()
      if (connection.current === table) connection.current = null
      setStatus('connecting')
    }
  }, [running, encounterId, apply, reload, takeStatuses, updateBoard])

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
  }
}
