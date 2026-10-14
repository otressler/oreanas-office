// The "Begegnungen" menu in the header of map mode: the map's encounters from the
// browser, a way to make a new one, and archived ones in a collapsed part. A mark shows
// where a creature no longer stands validly after the map changed
// (knowledge/domain/encounter.md, "When the map changes"); the menu's button carries it too.
import { Link, useNavigate } from 'react-router'
import { Popover } from '../../components/Popover'
import { Badge, Button } from '../../components/ui'
import { useLocalUser } from '../../offline/localUser'
import type { LocalEncounter } from '../../offline/model'
import { de } from '../../text/de'
import { encounterEditorPath } from '../paths'
import { useEditor } from '../store'
import { createEncounter, editable, setEncounterArchived, useEncounters } from './encounters'
import { useEditorTarget } from './store'
import { gridOf, misplacedIds } from './tokens'

const t = de.encounterEditor

/** The header button that opens the list. */
export function EncounterMenu() {
  const { db } = useLocalUser()
  const { mapId } = useEditorTarget()
  const map = useEditor((s) => s.doc)
  const encounters = useEncounters(db, mapId) ?? []
  const grid = gridOf(map)
  const active = encounters.filter((encounter) => encounter.archivedAt === null)
  const flagged = active.some(
    (encounter) => editable(encounter) && misplacedIds(grid, encounter.tokens).size > 0,
  )
  const text = t.menu(active.length)
  return (
    <Popover
      title={t.listTitle}
      side="below"
      label={flagged ? `${text}. ${t.menuFlagged}` : undefined}
      trigger={
        <>
          {text}
          {flagged && (
            <span aria-hidden="true" className="ml-1 text-red-300">
              ⚠
            </span>
          )}
          <span aria-hidden="true" className="ml-1 text-dim">
            ▾
          </span>
        </>
      }
      triggerClassName="min-h-9 rounded-lg border border-line px-3 text-sm whitespace-nowrap hover:border-candle aria-expanded:border-candle"
    >
      {() => <EncounterListPanel />}
    </Popover>
  )
}

export function EncounterListPanel() {
  const { db } = useLocalUser()
  const { campaignId, mapId } = useEditorTarget()
  const map = useEditor((s) => s.doc)
  const navigate = useNavigate()
  const encounters = useEncounters(db, mapId)
  if (encounters === undefined) return null

  const grid = gridOf(map)
  const active = encounters.filter((encounter) => encounter.archivedAt === null)
  const archived = encounters.filter((encounter) => encounter.archivedAt !== null)

  async function create() {
    const record = await createEncounter(db, { id: mapId, campaignId, name: map.name })
    void navigate(encounterEditorPath(campaignId, mapId, record.id))
  }

  const row = (encounter: LocalEncounter) => {
    const misplaced = editable(encounter) && misplacedIds(grid, encounter.tokens).size > 0
    return (
      <li key={encounter.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2">
        <Link
          to={encounterEditorPath(campaignId, mapId, encounter.id)}
          className="min-w-0 truncate font-semibold text-parchment hover:text-candle hover:underline"
        >
          {encounter.name}
        </Link>
        <Badge tone={encounter.status === 'ready' ? 'candle' : 'dim'}>
          {de.encounterStatus[encounter.status]}
        </Badge>
        {misplaced && (
          <span
            role="img"
            aria-label={t.misplacedMark}
            title={t.misplacedMark}
            className="text-sm text-red-300"
          >
            ⚠
          </span>
        )}
        <span className="text-xs text-dim">{de.encounters.creatures(encounter.tokens.length)}</span>
        {editable(encounter) && (
          <button
            type="button"
            aria-label={
              encounter.archivedAt === null
                ? t.archiveLabel(encounter.name)
                : t.restoreLabel(encounter.name)
            }
            onClick={() =>
              void setEncounterArchived(db, encounter.id, encounter.archivedAt === null)
            }
            className="ml-auto min-h-9 rounded-lg px-2 text-sm text-dim hover:text-parchment"
          >
            {encounter.archivedAt === null ? t.archive : t.restore}
          </button>
        )}
      </li>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {active.length === 0 ? (
        <p className="text-sm text-dim">{t.listEmpty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">{active.map(row)}</ul>
      )}
      <div>
        <Button onClick={() => void create()}>{t.newEncounter}</Button>
      </div>
      {archived.length > 0 && (
        <details className="rounded-lg border border-line px-3 py-1">
          <summary className="cursor-pointer py-1 text-sm text-dim">
            {t.archived(archived.length)}
          </summary>
          <ul className="flex flex-col divide-y divide-line">{archived.map(row)}</ul>
        </details>
      )}
    </div>
  )
}
