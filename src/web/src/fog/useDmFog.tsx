// Fog and creature spawn on the fight page (knowledge/features/fog-of-war.md, creature-spawn.md),
// kept out of FightTable: what the board draws for fog, what a tap does in fog mode or while
// placing creatures, the buttons in the top bar and the bars at the bottom.
//
// For every viewer it works out the board's fog (opaque for players, hatched for the session
// DM) and the cells a player may not choose as a target. For the session DM it adds three
// modes that exclude each other: fog mode ("Nebel", with previews and a confirm bar),
// placing new creatures ("Kreatur hinzufügen") and "Spieleransicht", which draws exactly
// what players see and sends nothing. The server filters what players receive; the
// "Spieleransicht" filter only draws the DM's own board the way players get it.
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import type { BoardState, BoardToken } from '../api/types'
import { Button } from '../components/ui'
import type { BoardFog } from '../board/fogRender'
import type { GridPoint, MapGrid } from '../board/geometry'
import { de } from '../text/de'
import { NotConnectedError } from '../table/connection'
import type { Table } from '../table/useTable'
import { boardCells, hiddenOfView, playableCells } from './cells'
import {
  NEW_DRAFT,
  barOpen,
  changingCells,
  chooseArea,
  cleared,
  pickDirection,
  pickTool,
  tapFog,
  type FogDraft,
  type FogMap,
} from './draft'
import { FogBar } from './FogBar'
import { hiddenInSameAreas } from './hiddenHere'
import { SpawnPanel } from './spawn/SpawnPanel'
import {
  NEW_SPAWN,
  finishSpawn,
  pickSpawnType,
  previewTokens,
  resumeSpawn,
  setSpawnHidden,
  spawnIds,
  tapSpawn,
  toRequest,
  type SpawnDraft,
} from './spawn/draft'
import { UndoChangeBar, type JustChanged } from './UndoChangeBar'
import { tokensForPlayers } from './visibility'

const t = de.fog

type Mode = 'play' | 'fog' | 'spawn'

export type FogTable = Pick<
  Table,
  'changeFog' | 'setTokensHidden' | 'spawnCreatures' | 'undoChange'
>

export interface DmFog {
  /** The session DM on a DM board: the buttons and modes exist. */
  isDm: boolean
  /** "Spieleransicht" is on: nothing can be moved or sent. */
  playerView: boolean
  /** Fog mode or placing creatures is on: taps belong to it and the token card stays closed. */
  modal: boolean
  /** The board to draw: with spawn previews, or as players see it. */
  board: BoardState
  fog: BoardFog | null
  highlight: ReadonlySet<string> | undefined
  faintTokenIds: ReadonlySet<string> | undefined
  /** Cells shown as "Unerkundet" when tapped: the fog in the players' look. */
  unexplored: ReadonlySet<string> | undefined
  /** Cells no token may be moved onto: the fog, for everyone but the session DM. */
  blocked: ReadonlySet<string> | undefined
  /** Fog mode or placing took the tap; false when the page handles it. */
  tapCell: (cell: GridPoint) => boolean
  tapToken: (token: BoardToken, cell: GridPoint) => boolean
  /** The hidden creatures "Alle verborgenen hier" would reveal with this one. */
  hiddenHere: (token: BoardToken) => BoardToken[]
  /** Reveals or hides creatures; an error shows at the bottom. */
  setTokensHidden: (tokens: BoardToken[], hidden: boolean) => Promise<void>
  /** The buttons for the top bar (session DM only). */
  toolbar: ReactNode
  /**
   * The bars over the board's bottom edge, and the note of the players' view. `bottom` is
   * how many CSS pixels they keep from the edge: the docked card, other bars.
   */
  bars: (bottom: number) => ReactNode
}

export function useDmFog({
  campaignId,
  board,
  grid,
  table,
  connected,
  running,
}: {
  campaignId: string
  /** The board as the page shows it: pending moves merged. */
  board: BoardState
  grid: MapGrid
  table: FogTable
  connected: boolean
  running: boolean
}): DmFog {
  const isDm = board.isSessionDm && board.viewer === 'dm' && running
  const hidden = useMemo(() => hiddenOfView(board.fog), [board.fog])

  const [mode, setMode] = useState<Mode>('play')
  const [playerView, setPlayerView] = useState(false)
  const [draft, setDraft] = useState<FogDraft>(NEW_DRAFT)
  const [noArea, setNoArea] = useState(false)
  const [spawn, setSpawn] = useState<SpawnDraft>(NEW_SPAWN)
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [changed, setChanged] = useState<JustChanged | null>(null)
  const keys = useRef(0)

  const playable = useMemo(() => playableCells(board.map), [board.map])
  const fogMap: FogMap = useMemo(
    () => ({
      width: board.map.width,
      height: board.map.height,
      playable,
      areas: board.fog?.areas ?? [],
    }),
    [board.map.width, board.map.height, playable, board.fog?.areas],
  )

  const showPlayerView = isDm && playerView
  const fog: BoardFog | null = board.fog
    ? { hidden, look: isDm && !playerView ? 'dm' : 'player' }
    : null

  const previews = useMemo(
    () => (isDm && mode === 'spawn' ? previewTokens(spawn, board) : []),
    [isDm, mode, spawn, board],
  )
  const shown = useMemo<BoardState>(() => {
    if (showPlayerView) return { ...board, tokens: [...tokensForPlayers(board.tokens, hidden)] }
    if (previews.length === 0) return board
    return { ...board, tokens: [...board.tokens, ...previews] }
  }, [board, showPlayerView, hidden, previews])

  const fail = (caught: unknown, fallback: string) =>
    setError(caught instanceof NotConnectedError ? t.needsConnection : fallback)

  function leaveModes() {
    setMode('play')
    setDraft(NEW_DRAFT)
    setNoArea(false)
    setSpawn(NEW_SPAWN)
    setPicking(false)
    setError(null)
  }

  function toggleFog() {
    const on = mode !== 'fog'
    leaveModes()
    setPlayerView(false)
    if (on) setMode('fog')
  }

  function startSpawn() {
    leaveModes()
    setPlayerView(false)
    setMode('spawn')
    setPicking(true)
  }

  function togglePlayerView() {
    leaveModes()
    setPlayerView((on) => !on)
  }

  const tapCell = (cell: GridPoint): boolean => {
    if (!isDm || playerView) return false
    if (mode === 'fog') {
      if (busy) return true
      setError(null)
      const next = tapFog(draft, cell, fogMap)
      setNoArea(draft.tool === 'area' && next.cells.size === 0)
      setDraft(next)
      return true
    }
    if (mode === 'spawn') {
      if (picking || spawn.finished || busy) return true
      setError(null)
      keys.current += 1
      setSpawn((current) => tapSpawn(current, cell, grid, `k${keys.current}`))
      return true
    }
    return false
  }

  async function confirmFog() {
    const cells = changingCells(draft, hidden)
    if (cells.size === 0) return
    const reveal = draft.reveal
    setBusy(true)
    setError(null)
    try {
      const result = await table.changeFog(boardCells(cells), reveal)
      if (result.error) setError(de.errors[result.error])
      else {
        setDraft(cleared(draft))
        const text = reveal ? t.board.revealed(cells.size) : t.board.hidden(cells.size)
        setChanged({ text, at: Date.now() })
      }
    } catch (caught) {
      fail(caught, t.board.failed)
    } finally {
      setBusy(false)
    }
  }

  async function confirmSpawn() {
    const count = spawn.placements.length
    setBusy(true)
    setError(null)
    try {
      const result = await table.spawnCreatures(toRequest(board.encounterId, spawn))
      if (result.error) setError(de.errors[result.error])
      else {
        leaveModes()
        setChanged({ text: t.spawn.appeared(count), at: Date.now() })
      }
    } catch (caught) {
      fail(caught, t.spawn.failed)
    } finally {
      setBusy(false)
    }
  }

  async function undo() {
    setChanged(null)
    setError(null)
    try {
      const result = await table.undoChange()
      if (result.error) setError(de.errors[result.error])
    } catch (caught) {
      fail(caught, t.board.undoFailed)
    }
  }

  async function setTokensHidden(tokens: BoardToken[], hide: boolean) {
    if (tokens.length === 0) return
    setError(null)
    try {
      const result = await table.setTokensHidden(
        tokens.map((token) => token.id),
        hide,
      )
      if (result.error) setError(de.errors[result.error])
      else {
        const text =
          tokens.length > 1
            ? t.token.revealedMany(tokens.length)
            : hide
              ? t.token.hidden(tokens[0]!.label)
              : t.token.revealed(tokens[0]!.label)
        setChanged({ text, at: Date.now() })
      }
    } catch (caught) {
      fail(caught, t.token.failed)
    }
  }

  const hideChanged = useCallback(() => setChanged(null), [])
  const hiddenHere = (token: BoardToken) =>
    hiddenInSameAreas(token, board.tokens, board.fog?.areas ?? [])

  const toolbar = isDm ? (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        aria-pressed={mode === 'fog'}
        disabled={!board.fog || playerView}
        onClick={toggleFog}
        className={mode === 'fog' ? 'border-candle bg-candle/15 text-candle' : ''}
      >
        {t.board.fogButton}
      </Button>
      <Button disabled={!connected || playerView || mode === 'spawn'} onClick={startSpawn}>
        {t.spawn.button}
      </Button>
      <label className="flex min-h-11 items-center gap-2 text-sm text-parchment">
        <input type="checkbox" role="switch" checked={playerView} onChange={togglePlayerView} />
        {t.board.playerView}
      </label>
    </div>
  ) : null

  const bars = (bottom: number) =>
    isDm ? (
      <>
        {playerView && (
          <p
            role="status"
            className="pointer-events-none absolute top-3 left-1/2 z-20 w-max max-w-[calc(100%-1.5rem)] -translate-x-1/2 rounded-lg border border-candle/40 bg-panel/95 px-3 py-2 text-sm text-parchment shadow-lg shadow-black/40"
          >
            {t.board.playerViewNote}
          </p>
        )}
        {mode === 'fog' && (
          <FogBar
            draft={draft}
            count={changingCells(draft, hidden).size}
            connected={connected}
            busy={busy}
            error={error}
            noArea={noArea}
            bottom={bottom}
            onTool={(tool) => {
              setNoArea(false)
              setDraft((current) => pickTool(current, tool))
            }}
            onDirection={(reveal) => setDraft((current) => pickDirection(current, reveal))}
            onChooseArea={(area) => setDraft((current) => chooseArea(current, area))}
            onConfirm={() => void confirmFog()}
            onCancel={() => setDraft((current) => cleared(current))}
          />
        )}
        {mode === 'spawn' && (
          <SpawnPanel
            campaignId={campaignId}
            board={board}
            draft={spawn}
            picking={picking}
            connected={connected}
            busy={busy}
            error={error}
            bottom={bottom}
            onPick={(type) => {
              setSpawn((current) => pickSpawnType(current, type))
              setPicking(false)
            }}
            onOtherType={() => setPicking(true)}
            onClosePicker={() => setPicking(false)}
            onDone={() => setSpawn((current) => finishSpawn(current))}
            onResume={() => setSpawn((current) => resumeSpawn(current))}
            onHidden={(on) => setSpawn((current) => setSpawnHidden(current, on))}
            onConfirm={() => void confirmSpawn()}
            onCancel={leaveModes}
          />
        )}
        {mode === 'play' && error && (
          <p
            role="alert"
            style={{ bottom: bottom + 12 }}
            className="absolute left-1/2 z-30 w-max max-w-[calc(100%-1.5rem)] -translate-x-1/2 rounded-lg border border-red-400/50 bg-red-950/90 px-3 py-2 text-sm text-red-100 shadow-lg shadow-black/40"
          >
            {error}
          </p>
        )}
        {changed && mode !== 'spawn' && !(mode === 'fog' && barOpen(draft)) && (
          <UndoChangeBar
            changed={changed}
            label={t.board.undo}
            bottom={mode === 'fog' ? bottom + 96 : bottom}
            connected={connected}
            onUndo={() => void undo()}
            onTimeout={hideChanged}
          />
        )}
      </>
    ) : null

  return {
    isDm,
    playerView: showPlayerView,
    modal: isDm && mode !== 'play',
    board: shown,
    fog,
    highlight: isDm && mode === 'fog' && draft.cells.size > 0 ? draft.cells : undefined,
    faintTokenIds: previews.length > 0 ? spawnIds(spawn) : undefined,
    unexplored: fog?.look === 'player' ? hidden : undefined,
    blocked: !board.isSessionDm && board.fog ? hidden : undefined,
    tapCell,
    tapToken: (_token, cell) => tapCell(cell),
    hiddenHere,
    setTokensHidden,
    toolbar,
    bars,
  }
}
