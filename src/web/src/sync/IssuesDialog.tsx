// The dialogs for what a sync could not save (knowledge/decisions/offline-prep-pwa.md,
// "Conflicts" and "Rejections"): one conflict at a time, then the list of rejected items.
import { useState, type ReactNode } from 'react'
import type { SyncServerItem } from '../api/types'
import { Button, ButtonLink, ErrorAlert } from '../components/ui'
import { editorMapOf, type LocalMap } from '../editor/model'
import { editorPath, encounterEditorPath } from '../editor/paths'
import { formatDateTime } from '../lib/dates'
import type { OfflineDb } from '../offline/db'
import type { LocalCreatureType, LocalEncounter } from '../offline/model'
import { downloadMapFile } from '../maps/mapFile'
import { de } from '../text/de'
import { fetchItems } from './api'
import { syncNow } from './client'
import { useSyncDb } from './context'
import { isItemKind, useIssues, type IssueEntry } from './issues'
import { LayoutPreview } from './LayoutPreview'
import { Modal } from './Modal'
import type { ItemKind } from './records'
import {
  keepBoth,
  keepMine,
  renameCreatureType,
  saveAsNewDraft,
  startedOnServer,
  takeServer,
  takeServerAfterRejection,
  switchToExistingCreatureType,
} from './resolve'
import { closeSyncIssues, useSyncDialog } from './state'

const t = de.sync

/** Opened by the status button and the sync marks; closes itself with nothing left to do. */
export function IssuesDialog() {
  const db = useSyncDb()
  const { open, focusId } = useSyncDialog()
  const list = useIssues(db)
  if (!open || !db || !list) return null

  const conflicts = list.entries.filter((e) => e.issue.kind === 'conflict' && isItemKind(e.kind))
  const problems = list.entries.filter((e) => e.issue.kind !== 'conflict')
  // The clicked item first, else the oldest conflict.
  const current = conflicts.find((e) => e.id === focusId) ?? conflicts[0]

  return (
    <Modal title={t.dialog.title} onClose={closeSyncIssues}>
      {current ? (
        <ConflictView key={current.id} db={db} entry={current} others={conflicts.length - 1} />
      ) : problems.length > 0 ? (
        <ProblemsView db={db} entries={problems} names={list.names} focusId={focusId} />
      ) : (
        <>
          <p className="text-dim">{t.dialog.allDone}</p>
          <Button variant="primary" className="self-start" onClick={closeSyncIssues}>
            {t.close}
          </Button>
        </>
      )}
    </Modal>
  )
}

// ---- Conflicts ---------------------------------------------------------------------------

/** What a copy of an item shows in the comparison. */
interface Described {
  name: string
  lines: string[]
  map: { width: number; height: number; layout: LocalMap['layout'] } | null
}

function describeLocal(entry: IssueEntry): Described {
  const record = entry.record
  switch (entry.kind) {
    case 'battleMap': {
      const map = record as LocalMap
      return describeMap(map.name, map.width, map.height, map.layout, map.archivedAt)
    }
    case 'creatureType': {
      const type = record as LocalCreatureType
      return describeType(type.name, type.size, type.archivedAt)
    }
    default: {
      const encounter = record as LocalEncounter
      return describeEncounter(
        encounter.name,
        encounter.status,
        encounter.tokens.length,
        encounter.archivedAt,
      )
    }
  }
}

function describeServer(server: SyncServerItem): Described {
  if (server.map) {
    const d = server.map
    return describeMap(d.name, d.width, d.height, d.layout, d.archivedAt)
  }
  if (server.creatureType) {
    const d = server.creatureType
    return describeType(d.name, d.size, d.archivedAt)
  }
  const d = server.encounter
  return d
    ? describeEncounter(d.name, d.status, d.tokens.length, d.archivedAt)
    : { name: '', lines: [], map: null }
}

function describeMap(
  name: string,
  width: number,
  height: number,
  layout: LocalMap['layout'],
  archivedAt: string | null,
): Described {
  return {
    name,
    lines: [t.dialog.sizeLine(width, height), ...(archivedAt ? [t.dialog.archived] : [])],
    map: { width, height, layout },
  }
}

function describeType(
  name: string,
  size: LocalCreatureType['size'],
  archivedAt: string | null,
): Described {
  return {
    name,
    lines: [t.dialog.sizeOf(de.sizes[size]), ...(archivedAt ? [t.dialog.archived] : [])],
    map: null,
  }
}

function describeEncounter(
  name: string,
  status: LocalEncounter['status'],
  creatures: number,
  archivedAt: string | null,
): Described {
  return {
    name,
    lines: [
      t.dialog.statusLine(de.encounterStatus[status]),
      t.dialog.creatures(creatures),
      ...(archivedAt ? [t.dialog.archived] : []),
    ],
    map: null,
  }
}

function Version({
  title,
  who,
  when,
  described,
}: {
  title: string
  who: string
  when: string
  described: Described
}) {
  return (
    <section
      aria-label={title}
      className="flex min-w-0 flex-1 flex-col gap-2 rounded-lg border border-line bg-table/60 p-3"
    >
      <h3 className="font-semibold text-candle">{title}</h3>
      <p className="text-sm text-dim">{t.dialog.changedBy(who, formatDateTime(when))}</p>
      <p className="font-semibold break-words">{described.name}</p>
      <ul className="text-sm text-dim">
        {described.lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {described.map && (
        <LayoutPreview
          width={described.map.width}
          height={described.map.height}
          layout={described.map.layout}
          label={t.dialog.preview(title)}
        />
      )}
    </section>
  )
}

function ConflictView({ db, entry, others }: { db: OfflineDb; entry: IssueEntry; others: number }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const issue = entry.issue
  if (issue.kind !== 'conflict' || !isItemKind(entry.kind)) return null
  const kind: ItemKind = entry.kind
  const server = issue.server
  const started = startedOnServer(server)
  const local = entry.record!

  /** Runs a choice; the ones that leave something to push sync afterwards. */
  async function choose(change: () => Promise<unknown>, thenSync: boolean) {
    setBusy(true)
    setError(null)
    try {
      await change()
      if (thenSync) void syncNow(db, { reason: 'button' })
    } catch {
      setError(t.dialog.failed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold break-words">
          {t.dialog.conflictTitle(t.kinds[kind], entry.name)}
        </h3>
        <p className="text-dim">{started ? t.dialog.startedBody : t.dialog.conflictBody}</p>
        {others > 0 && <p className="text-sm text-dim">{t.dialog.more(others)}</p>}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Version
          title={t.dialog.thisDevice}
          who={t.dialog.thisDeviceWho}
          when={local.updatedAt}
          described={describeLocal(entry)}
        />
        <Version
          title={t.dialog.onServer}
          who={server.updatedByDisplayName ?? t.dialog.unknownPerson}
          when={server.updatedAt}
          described={describeServer(server)}
        />
      </div>
      <ErrorAlert error={error} />
      <div className="flex flex-wrap gap-2">
        {started ? (
          <>
            <Button
              variant="primary"
              busy={busy}
              onClick={() => void choose(() => saveAsNewDraft(db, entry.id), true)}
            >
              {t.dialog.saveAsDraft}
            </Button>
            <Button
              busy={busy}
              onClick={() => void choose(() => takeServer(db, kind, entry.id), false)}
            >
              {t.dialog.discard}
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="primary"
              busy={busy}
              onClick={() => void choose(() => keepMine(db, kind, entry.id), true)}
            >
              {t.dialog.keepMine}
            </Button>
            <Button
              busy={busy}
              onClick={() => void choose(() => takeServer(db, kind, entry.id), false)}
            >
              {t.dialog.takeServer}
            </Button>
            <Button
              busy={busy}
              onClick={() => void choose(() => keepBoth(db, kind, entry.id), true)}
            >
              {t.dialog.keepBoth}
            </Button>
          </>
        )}
      </div>
    </>
  )
}

// ---- Rejections ----------------------------------------------------------------------------

function ProblemsView({
  db,
  entries,
  names,
  focusId,
}: {
  db: OfflineDb
  entries: IssueEntry[]
  names: Map<string, string>
  focusId: string | null
}) {
  const [syncing, setSyncing] = useState(false)
  // A creature type whose name is taken has its own view.
  const [renaming, setRenaming] = useState<string | null>(null)
  const nameTaken = entries.find((e) => e.id === renaming)
  if (nameTaken) {
    return <NameTakenView db={db} entry={nameTaken} onDone={() => setRenaming(null)} />
  }
  // The clicked item first.
  const sorted = [...entries].sort((a, b) => Number(b.id === focusId) - Number(a.id === focusId))

  return (
    <>
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold">{t.dialog.problemsTitle}</h3>
        <p className="text-dim">{t.dialog.problemsBody}</p>
      </div>
      <ul className="flex flex-col divide-y divide-line">
        {sorted.map((entry) => (
          <ProblemRow
            key={entry.id}
            db={db}
            entry={entry}
            names={names}
            onRename={() => setRenaming(entry.id)}
          />
        ))}
      </ul>
      <Button
        busy={syncing}
        className="self-start"
        onClick={() => {
          setSyncing(true)
          void syncNow(db, { reason: 'button' }).finally(() => setSyncing(false))
        }}
      >
        {t.dialog.syncAgain}
      </Button>
    </>
  )
}

function reasonOf(entry: IssueEntry, names: Map<string, string>): ReactNode {
  const issue = entry.issue
  if (issue.kind === 'vanished') return t.dialog.vanished
  if (issue.kind !== 'rejected') return null
  return (
    <>
      <span>{de.errors[issue.error.code]}</span>
      {issue.problems && issue.problems.length > 0 && (
        <span> {t.dialog.layoutProblems(issue.problems.length)}</span>
      )}
      {issue.dependsOnId && (
        <span> {t.dialog.dependsOn(names.get(issue.dependsOnId) ?? t.dialog.unknownItem)}</span>
      )}
    </>
  )
}

function ProblemRow({
  db,
  entry,
  names,
  onRename,
}: {
  db: OfflineDb
  entry: IssueEntry
  names: Map<string, string>
  onRename: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const record = entry.record
  const issue = entry.issue
  const kind = entry.kind

  async function takeFromServer() {
    if (!isItemKind(kind)) return
    setBusy(true)
    setError(null)
    try {
      const [item] = await fetchItems(entry.campaignId, [entry.id])
      if (item) await takeServerAfterRejection(db, kind, entry.id, item)
      else setError(t.dialog.serverMissing)
    } catch {
      setError(t.dialog.failed)
    } finally {
      setBusy(false)
    }
  }

  const nameTaken = issue.kind === 'rejected' && issue.error.code === 'creatureTypeNameTaken'
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 font-semibold break-words">{entry.name}</span>
        <span className="text-sm text-dim">{t.kinds[kind]}</span>
      </div>
      <p className="text-sm text-parchment">{reasonOf(entry, names)}</p>
      <div className="flex flex-wrap gap-2">
        {kind === 'battleMap' && (
          <ButtonLink
            to={editorPath(entry.campaignId, entry.id)}
            onClick={closeSyncIssues}
            aria-label={t.dialog.openItem(entry.name)}
          >
            {t.dialog.open}
          </ButtonLink>
        )}
        {kind === 'encounter' && (
          <ButtonLink
            to={encounterEditorPath(
              entry.campaignId,
              (record as LocalEncounter).battleMapId,
              entry.id,
            )}
            onClick={closeSyncIssues}
            aria-label={t.dialog.openItem(entry.name)}
          >
            {t.dialog.open}
          </ButtonLink>
        )}
        {nameTaken && issue.kind === 'rejected' && (
          <>
            {issue.existingCreatureTypeId && (
              <Button
                variant="primary"
                busy={busy}
                onClick={() => {
                  setBusy(true)
                  void switchToExistingCreatureType(db, entry.id, issue.existingCreatureTypeId!)
                    .catch(() => setError(t.dialog.failed))
                    .finally(() => setBusy(false))
                }}
              >
                {t.dialog.useExisting}
              </Button>
            )}
            <Button onClick={onRename}>{t.dialog.rename}</Button>
          </>
        )}
        {isItemKind(kind) && entry.sync.baseVersion > 0 && (
          <Button busy={busy} onClick={() => void takeFromServer()}>
            {t.dialog.takeServer}
          </Button>
        )}
        {kind === 'battleMap' && record && (
          <Button onClick={() => downloadMapFile(editorMapOf(record as LocalMap))}>
            {t.dialog.exportMap}
          </Button>
        )}
      </div>
      <ErrorAlert error={error} />
    </li>
  )
}

function NameTakenView({
  db,
  entry,
  onDone,
}: {
  db: OfflineDb
  entry: IssueEntry
  onDone: () => void
}) {
  const [name, setName] = useState(entry.name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function rename() {
    setBusy(true)
    setError(null)
    try {
      if (!(await renameCreatureType(db, entry.id, name))) {
        setError(t.dialog.nameInvalid)
        return
      }
      onDone()
      void syncNow(db, { reason: 'button' })
    } catch {
      setError(t.dialog.failed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        void rename()
      }}
    >
      <h3 className="text-lg font-semibold">{t.dialog.renameTitle(entry.name)}</h3>
      <p className="text-dim">{t.dialog.renameBody}</p>
      <label className="flex flex-col gap-1 text-sm text-dim">
        {t.dialog.newName}
        <input
          value={name}
          maxLength={40}
          autoComplete="off"
          onChange={(event) => setName(event.target.value)}
          className="min-h-11 w-full rounded-lg border border-line bg-table px-3 py-2 text-base text-parchment focus:border-candle focus:outline-none"
        />
      </label>
      <ErrorAlert error={error} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" busy={busy}>
          {t.dialog.renameAndSend}
        </Button>
        <Button onClick={onDone}>{de.common.cancel}</Button>
      </div>
    </form>
  )
}
