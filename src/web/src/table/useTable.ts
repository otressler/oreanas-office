// The fight page's side of the live table (knowledge/decisions/realtime-sync.md): one
// TableConnection while the fight runs, its status for the indicator, moves from the
// server merged into the cached board by version, and reloads after every (re)connect.
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { BoardState, MoveResult, MoveTokenRequest, TokenMovedEvent } from '../api/types'
import { encounterKeys } from '../encounters/queries'
import { recheckServer } from '../server/serverStatus'
import { NotConnectedError, TableConnection, type TableStatus } from './connection'
import { createTableConnection } from './createConnection'
import { applyMove, rememberMove, type KnownPositions } from './merge'

export interface Table {
  /** Null while the fight isn't running: there is nothing to connect to. */
  status: TableStatus | null
  /** The newest position seen per token; keeps them when an older board reload lands. */
  known: KnownPositions
  /** Takes a confirmed move or undo into the board. */
  apply: (move: TokenMovedEvent) => void
  /** Reloads the board, e.g. after the server said the fight or token is gone. */
  reload: () => void
  move: (request: MoveTokenRequest) => Promise<MoveResult>
  undo: () => Promise<MoveResult>
}

export function useTable(campaignId: string, encounterId: string, running: boolean): Table {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<TableStatus>('connecting')
  const [known, setKnown] = useState<KnownPositions>(() => new Map())
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
      onEnded: reload,
      onRejected: reload,
    })
    connection.current = table
    table.start()
    return () => {
      table.dispose()
      if (connection.current === table) connection.current = null
      setStatus('connecting')
    }
  }, [running, encounterId, apply, reload])

  const move = useCallback(
    (request: MoveTokenRequest) =>
      connection.current?.move(request) ?? Promise.reject(new NotConnectedError()),
    [],
  )
  const undo = useCallback(
    () => connection.current?.undo() ?? Promise.reject(new NotConnectedError()),
    [],
  )

  return { status: running ? status : null, known, apply, reload, move, undo }
}
