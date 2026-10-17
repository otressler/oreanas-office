// The running fight on a spectator screen (knowledge/features/spectator-view.md): the
// players' board, zoomed to the whole map, with tokens, statuses, pings, arrows and move
// previews, kept current by the same table machinery as a player's board (useTable). No token
// card and no controls: a spectator connection can't change anything. A shared screen in local
// mode gets the shared table lane's controls laid over it (SharedScreenControls).
import { useMemo, type Ref } from 'react'
import type { BoardState, WatchedSession } from '../api/types'
import { useCurrentUser } from '../auth/auth'
import { Board, type BoardHandle } from '../board/Board'
import { PresenceRow } from '../sharedTable/PresenceRow'
import { SharedScreenControls } from '../sharedTable/SharedScreenControls'
import { ConnectionIndicator } from '../table/ConnectionIndicator'
import { mergeKnown } from '../table/merge'
import { moveArrows } from '../table/previews'
import { usePings } from '../table/usePings'
import { useTable, type TableScreen } from '../table/useTable'
import { de } from '../text/de'
import { spectatorScope, useWatchedBoard } from './queries'

const t = de.spectator

interface SpectatorBoardProps {
  session: WatchedSession
  encounterId: string
  screen: TableScreen
  /** The connection is a shared screen: ask for the shared screen's board. */
  sharedScreen: boolean
  /** A shared screen in local mode: lay the shared table's controls over the board. */
  sharedControls: boolean
  /** The watching board's handle ("Ganze Karte" when the controls layer isn't there). */
  handleRef: Ref<BoardHandle>
  /** The controls layer's own board, which covers the watching one while it is there. */
  layerHandleRef: Ref<BoardHandle>
}

/** Loads the players' board; the live table starts once there is one to keep current. */
export function SpectatorBoard(props: SpectatorBoardProps) {
  const query = useWatchedBoard(props.session, props.encounterId, props.sharedScreen)
  const board = query.data && query.data.encounterId === props.encounterId ? query.data : null
  if (board) return <LiveBoard {...props} board={board} />
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-8 text-center">
      {query.isError ? (
        <div className="flex flex-col items-center gap-3">
          <p role="alert" className="text-2xl text-parchment">
            {t.boardLoadFailed}
          </p>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="min-h-14 rounded-lg border border-line px-6 text-lg text-parchment"
          >
            {t.retry}
          </button>
        </div>
      ) : (
        <p role="status" className="text-2xl text-dim">
          {t.connecting}
        </p>
      )}
    </div>
  )
}

function LiveBoard({
  session,
  encounterId,
  screen,
  sharedControls,
  handleRef,
  layerHandleRef,
  board,
}: SpectatorBoardProps & { board: BoardState }) {
  const me = useCurrentUser()
  const pings = usePings(board, me.id)
  // The cache entry is the screen's own, see spectatorScope.
  const table = useTable(spectatorScope(session.sessionId), encounterId, true, pings.events, screen)
  const shown = useMemo(() => mergeKnown(board, table.known), [board, table.known])
  const arrows = useMemo(() => moveArrows(table.previews, shown.tokens), [table.previews, shown])

  return (
    <div className="relative flex min-h-0 flex-1 flex-col" data-testid="spectator-board">
      <PresenceRow
        presence={shown.presence}
        people={shown.people}
        tokens={shown.tokens}
        // Unused once PresentPerson.isSessionDm says who runs the session; the stub still asks.
        sessionDmUserId={null}
      />
      <div className="relative flex min-h-0 flex-1 flex-col">
        <Board
          board={shown}
          // A spectator screen has no controls: taps neither select nor open the info box.
          onCellTap={sharedControls ? undefined : () => true}
          onTokenTap={sharedControls ? undefined : () => true}
          arrows={arrows}
          slide
          pings={pings.shown}
          className="min-h-0 flex-1"
          handleRef={handleRef}
        />
        {sharedControls && (
          <SharedScreenControls
            encounterId={encounterId}
            board={shown}
            connection={table.hubConnection}
            handleRef={layerHandleRef}
          />
        )}
        {table.status && (
          <div className="pointer-events-none absolute bottom-3 left-3 z-20 rounded-full bg-panel/80 px-3 py-1">
            <ConnectionIndicator status={table.status} />
          </div>
        )}
      </div>
    </div>
  )
}
