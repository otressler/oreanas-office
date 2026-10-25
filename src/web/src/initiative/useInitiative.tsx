// The session DM's initiative at the table (knowledge/features/initiative.md): the top bar's
// "Initiative würfeln", the setup screen, and the list over the board. Initiative is off until
// the DM saves a first list; the list then stays with the encounter, on every device of the
// session DM and across a continued session, until "Beenden". Players never get it.
import { useState, type ReactNode } from 'react'
import type {
  BoardState,
  BoardToken,
  InitiativeEntry,
  InitiativeResult,
  InitiativeRollResult,
  InitiativeView,
} from '../api/types'
import { Button } from '../components/ui'
import { de } from '../text/de'
import { InitiativeList } from './InitiativeList'
import { InitiativeSetup } from './InitiativeSetup'
import { newerInitiative } from './initiative'

const t = de.initiative

/** The table calls the initiative needs (useTable). */
export interface InitiativeTable {
  knownInitiative: InitiativeView | null
  rollInitiative: () => Promise<InitiativeRollResult>
  setInitiative: (entries: InitiativeEntry[]) => Promise<InitiativeResult>
  clearInitiative: () => Promise<InitiativeResult>
}

export interface DmInitiative {
  /** For the session DM's top bar; null for everyone else. */
  toolbar: ReactNode
  /** The list, for the board's top-left corner; null while initiative is off. */
  panel: ReactNode
  /** The setup screen while it is open. */
  dialog: ReactNode
}

const COLLAPSED_KEY = 'oreana.initiative.collapsed'

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

function writeCollapsed(collapsed: boolean) {
  try {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0')
  } catch {
    // Without storage the panel just opens again next time.
  }
}

export function useInitiative({
  board,
  tokens,
  table,
  connected,
  running,
  hidden,
  selectedId,
  onSelect,
  onError,
}: {
  board: BoardState
  /** The tokens as the page shows them. */
  tokens: readonly BoardToken[]
  table: InitiativeTable
  connected: boolean
  running: boolean
  /** The players' view is on: nothing of this shows. */
  hidden: boolean
  selectedId: string | null
  onSelect: (token: BoardToken) => void
  onError: (text: string) => void
}): DmInitiative {
  const isDm = board.isSessionDm && board.viewer === 'dm' && running
  const view = newerInitiative(board.initiative, table.knownInitiative)
  // A new order shows at once, until the list's next version arrives or the save fails.
  const [pending, setPending] = useState<{ version: number; entries: InitiativeEntry[] } | null>(
    null,
  )
  const [setup, setSetup] = useState<'new' | 'edit' | null>(null)
  const [collapsed, setCollapsed] = useState(readCollapsed)

  if (!isDm) return { toolbar: null, panel: null, dialog: null }

  const saved = view?.entries ?? null
  const entries = pending && pending.version === view?.version ? pending.entries : saved

  /** Null once saved, else why not. */
  async function save(next: InitiativeEntry[]): Promise<string | null> {
    try {
      const result = await table.setInitiative(next)
      return result.error ? de.errors[result.error] : null
    } catch {
      return connected ? t.saveFailed : t.needsConnection
    }
  }

  function reorder(next: InitiativeEntry[]) {
    setPending({ version: view?.version ?? 0, entries: next })
    void save(next).then((error) => {
      setPending(null)
      if (error) onError(error)
    })
  }

  async function end() {
    try {
      const result = await table.clearInitiative()
      if (result.error) onError(de.errors[result.error])
    } catch {
      onError(connected ? t.saveFailed : t.needsConnection)
    }
  }

  function changeCollapsed(next: boolean) {
    setCollapsed(next)
    writeCollapsed(next)
  }

  const toolbar = hidden ? null : entries ? (
    <Button
      aria-pressed={!collapsed}
      onClick={() => changeCollapsed(!collapsed)}
      className={collapsed ? '' : 'border-candle bg-candle/15 text-candle'}
    >
      {t.show}
    </Button>
  ) : (
    <Button disabled={!connected} onClick={() => setSetup('new')}>
      {t.roll}
    </Button>
  )

  const panel =
    entries && !hidden ? (
      <InitiativeList
        entries={entries}
        tokens={tokens}
        selectedId={selectedId}
        connected={connected}
        collapsed={collapsed}
        onCollapsedChange={changeCollapsed}
        onSelect={onSelect}
        onReorder={reorder}
        onEdit={() => setSetup('edit')}
        onEnd={() => void end()}
      />
    ) : null

  const dialog = setup && (
    <InitiativeSetup
      tokens={tokens}
      saved={setup === 'edit' ? saved : null}
      roll={table.rollInitiative}
      onSave={async (next) => {
        const error = await save(next)
        if (!error) changeCollapsed(false)
        return error
      }}
      onClose={() => setSetup(null)}
    />
  )

  return { toolbar, panel, dialog }
}
