// /kampagnen/:campaignId/karten/:mapId — the map editor (knowledge/features/dm-map-editor.md).
// Works offline: the map comes from the browser and every change is saved there.
// With /begegnungen/:encounterId it is in encounter mode: the same page with the map
// fixed, only the creature tools and the encounter, and the encounter's own undo and
// autosave. A full-screen page for laptops: the toolbar on the left picks what the side
// panel on the right shows; the header has the map's (or encounter's) name and the
// whole-map items, the status bar the cell under the pointer and the problem count.
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentType,
  type MutableRefObject,
  type ReactNode,
} from 'react'
import { Link, useParams } from 'react-router'
import { buildGrid, type GridPoint } from '../board/geometry'
import { ButtonLink, Loading, PageTitle } from '../components/ui'
import { inputClass } from '../components/styles'
import { formatElevation } from '../lib/units'
import { useWideScreen } from '../lib/useWideScreen'
import { useCampaignCopy } from '../offline/campaigns'
import { useLocalUser } from '../offline/localUser'
import type { LocalEncounter } from '../offline/model'
import { refreshOpenedRecords } from '../sync'
import { de } from '../text/de'
import { EditorCanvas } from './EditorCanvas'
import { EncounterSummary } from './encounter'
import { editable, getEncounter, saveEncounter } from './encounter/encounters'
import {
  createEncounterStore,
  EditorTargetContext,
  EncounterStoreContext,
  useEncounter,
  useEncounterStore,
  useOptionalEncounterStore,
  type EncounterStore,
} from './encounter/store'
import {
  cleanEncounterName,
  encounterDocOf,
  ENCOUNTER_NAME_MAX,
  renameEncounter,
} from './encounter/tokens'
import { getMap } from './maps'
import { editorPath, mapListPath } from './paths'
import { editorMapOf, type LocalMap } from './model'
import {
  DEFAULT_TOOL_ID,
  editorHeaderItems,
  editorTools,
  encounterModeTools,
  mapHeaderItems,
  mapStatusItems,
  mapStatusMarks,
  PreviewPane,
  readOnlyEncounterTools,
} from './registry'
import { MapNameField } from './scene'
import {
  createEditorStore,
  EditorStoreContext,
  useEditor,
  useEditorStore,
  type EditorStore,
} from './store'
import type { EditorTool, ToolGroup } from './tools'
import { useAutosave, useAutosaveOf, type SaveStatus } from './useAutosave'

const t = de.editor
const te = de.encounterEditor

export function EditorPage() {
  const { campaignId = '', mapId = '', encounterId } = useParams()
  const { db } = useLocalUser()
  const wide = useWideScreen()
  const campaign = useCampaignCopy(db, campaignId)
  // Read once: the editor owns the map while it's open.
  const [record, setRecord] = useState<LocalMap | null | undefined>(undefined)
  const [encounter, setEncounter] = useState<LocalEncounter | null | undefined>(undefined)
  // Raised when the sync handed the editor a newer server version: read the records again.
  const [reloads, setReloads] = useState(0)
  // Whether the open editor holds no edits yet; the editor below registers it.
  const pristine = useRef(() => false)
  useEffect(() => {
    let current = true
    void getMap(db, mapId).then((map) => {
      if (current) setRecord(map && map.campaignId === campaignId ? map : null)
    })
    void (encounterId ? getEncounter(db, encounterId) : Promise.resolve(undefined)).then(
      (found) => {
        if (!current) return
        const ours = found?.campaignId === campaignId && found.battleMapId === mapId
        setEncounter(encounterId ? (ours ? found : null) : null)
      },
    )
    return () => {
      current = false
    }
  }, [db, mapId, campaignId, encounterId, reloads])

  // The sync keeps pulls away from the records an open editor holds, so a newer server
  // version of an untouched map would otherwise show as the old copy and end in a conflict
  // at the next save. Once, right after the first read: take it while nothing was edited.
  // Only once the editor below is shown, so it has registered `pristine` (its effect runs
  // before this one); until then nothing would be taken.
  const opened = !!record && campaign?.myRole === 'dm' && (!encounterId || encounter !== undefined)
  useEffect(() => {
    if (!opened || !wide) return
    let current = true
    const ids = encounterId ? [mapId, encounterId] : [mapId]
    void refreshOpenedRecords(db, campaignId, ids, () => pristine.current()).then((changed) => {
      if (current && changed) setReloads((n) => n + 1)
    })
    return () => {
      current = false
    }
  }, [opened, wide, db, campaignId, mapId, encounterId])

  if (!wide) return <Message campaignId={campaignId} title={t.narrowTitle} body={t.narrowBody} />
  if (record === undefined || campaign === undefined || (encounterId && encounter === undefined))
    return <Loading />
  if (record === null) {
    return <Message campaignId={campaignId} title={t.notFoundTitle} body={t.notFoundBody} />
  }
  if (campaign?.myRole !== 'dm') {
    return <Message campaignId={campaignId} title={t.notDmTitle} body={t.notDmBody} />
  }
  if (encounterId) {
    if (!encounter) {
      return <Message campaignId={campaignId} title={te.notFoundTitle} body={te.notFoundBody} />
    }
    return (
      <EditorTargetContext.Provider value={{ campaignId, mapId }}>
        <EncounterEditor
          key={`${encounter.id}:${encounter.sync.baseVersion}:${record.sync.baseVersion}`}
          map={record}
          encounter={encounter}
          pristine={pristine}
        />
      </EditorTargetContext.Provider>
    )
  }
  return (
    <EditorTargetContext.Provider value={{ campaignId, mapId }}>
      <MapEditor
        key={`${record.id}:${record.sync.baseVersion}`}
        record={record}
        pristine={pristine}
      />
    </EditorTargetContext.Provider>
  )
}

function Message({ campaignId, title, body }: { campaignId: string; title: string; body: string }) {
  return (
    <div className="flex flex-col items-start gap-3 pb-8">
      <PageTitle>{title}</PageTitle>
      <p className="text-dim">{body}</p>
      <ButtonLink variant="primary" to={mapListPath(campaignId)}>
        {t.back}
      </ButtonLink>
    </div>
  )
}

function MapEditor({
  record,
  pristine,
}: {
  record: LocalMap
  pristine: MutableRefObject<() => boolean>
}) {
  const { db } = useLocalUser()
  const [store] = useState(() => createEditorStore(editorMapOf(record), DEFAULT_TOOL_ID))
  useEffect(() => {
    pristine.current = () => store.getState().revision === 0
    return () => {
      pristine.current = () => false
    }
  }, [pristine, store])
  const status = useAutosave(store, db, record.id)

  return (
    <EditorStoreContext.Provider value={store}>
      <EditorFrame campaignId={record.campaignId} mapId={record.id} status={status} />
    </EditorStoreContext.Provider>
  )
}

/** The map is fixed and its own store never changes; the encounter has the undo and the saving. */
function EncounterEditor({
  map,
  encounter,
  pristine,
}: {
  map: LocalMap
  encounter: LocalEncounter
  pristine: MutableRefObject<() => boolean>
}) {
  const { db } = useLocalUser()
  // Active and ended encounters are the server's; they open on their own copy of the map.
  const readOnly = !editable(encounter)
  const [mapStore] = useState(() => {
    const doc = editorMapOf(map)
    const copy = readOnly ? encounter.mapCopy : null
    return createEditorStore(
      copy ? { ...doc, width: copy.width, height: copy.height, layout: copy.layout } : doc,
      (readOnly ? readOnlyEncounterTools : encounterModeTools)[0]!.id,
    )
  })
  const [store] = useState(() =>
    createEncounterStore(encounterDocOf(encounter), {
      campaignId: map.campaignId,
      mapId: map.id,
      encounterId: encounter.id,
      readOnly,
    }),
  )
  useEffect(() => {
    pristine.current = () => store.getState().revision === 0
    return () => {
      pristine.current = () => false
    }
  }, [pristine, store])
  const save = useCallback(
    async (doc: ReturnType<typeof encounterDocOf>) => {
      const saved = await saveEncounter(db, encounter.id, doc)
      if (saved) store.setState({ savedDoc: doc })
      return saved
    },
    [db, encounter.id, store],
  )
  const status = useAutosaveOf(store, save)

  return (
    <EditorStoreContext.Provider value={mapStore}>
      <EncounterStoreContext.Provider value={store}>
        <EditorFrame campaignId={map.campaignId} mapId={map.id} status={status} />
      </EncounterStoreContext.Provider>
    </EditorStoreContext.Provider>
  )
}

function EditorFrame({
  campaignId,
  mapId,
  status,
}: {
  campaignId: string
  mapId: string
  status: SaveStatus
}) {
  const store = useEditorStore()
  // In encounter mode the toolbar has only the creature tools and the encounter (only the
  // encounter when read-only), the map can't change, and undo and redo act on the encounter.
  const encounter = useOptionalEncounterStore()
  const tools = !encounter
    ? editorTools
    : encounter.getState().meta.readOnly
      ? readOnlyEncounterTools
      : encounterModeTools
  const name = useEditor((s) => s.doc.name)
  const toolId = useEditor((s) => s.toolId)
  const tool = tools.find((item) => item.id === toolId)
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const [hover, setHover] = useState<GridPoint | null>(null)
  useEditorKeys(store, encounter, tools, tool, mode === 'edit')
  useToolLifecycle(store, encounter, tool)

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-table text-parchment">
      <header className="flex min-h-12 shrink-0 items-center gap-3 border-b border-line bg-panel/80 px-3">
        <Link
          to={encounter ? editorPath(campaignId, mapId) : mapListPath(campaignId)}
          aria-label={encounter ? te.backToMap : t.back}
          title={encounter ? te.backToMap : t.back}
          className="flex min-h-9 shrink-0 items-center gap-1 rounded-lg pr-2 text-sm whitespace-nowrap text-candle hover:underline"
        >
          <span aria-hidden="true">←</span>
          {encounter ? te.backToMapShort : t.backShort}
        </Link>
        {encounter ? (
          <>
            <EncounterName />
            <h1 className="min-w-0 truncate text-base font-semibold">{te.mapOf(name)}</h1>
          </>
        ) : (
          <MapNameField />
        )}
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {encounter && <EncounterSummary />}
          {editorHeaderItems.map((Item, i) => (
            <Item key={i} />
          ))}
          {/* The map's own items (encounters, export, "only on this device") stay in map mode. */}
          {!encounter && mapHeaderItems.map((Item, i) => <Item key={i} />)}
          {encounter ? (
            !encounter.getState().meta.readOnly && <EncounterUndoRedo />
          ) : (
            <>
              <MapUndoRedo />
              <ModeSwitch mode={mode} onChange={setMode} />
            </>
          )}
        </div>
      </header>
      {mode === 'preview' ? (
        <PreviewSlot />
      ) : (
        <div className="flex min-h-0 flex-1">
          {tools.length > 0 && (
            <Toolbar
              tools={tools}
              activeId={toolId}
              onPick={(id) => store.getState().setTool(id)}
            />
          )}
          <div className="flex min-w-0 flex-1 flex-col">
            <EditorCanvas
              tool={tool}
              encounter={encounter}
              onHover={setHover}
              className="min-h-0 flex-1"
            />
          </div>
          {/* Only what the toolbar picked: the active tool's options and selection. */}
          <aside className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-line bg-panel/60 p-4">
            {tool?.Panel && (
              <PanelSection title={tool.label}>
                <tool.Panel />
              </PanelSection>
            )}
          </aside>
        </div>
      )}
      <StatusBar
        hover={mode === 'edit' ? hover : null}
        status={status}
        marks={encounter ? [] : mapStatusMarks}
        items={encounter ? [] : mapStatusItems}
      />
    </div>
  )
}

function PreviewSlot() {
  const doc = useEditor((s) => s.doc)
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PreviewPane doc={doc} />
    </div>
  )
}

function PanelSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold tracking-wide text-dim uppercase">{title}</h2>
      {children}
    </section>
  )
}

function SaveMark({ status }: { status: SaveStatus }) {
  const text = status === 'saved' ? t.saved : status === 'saving' ? t.saving : t.saveFailed
  return (
    <span
      role="status"
      title={text}
      className={`min-w-0 truncate text-xs ${status === 'failed' ? 'text-red-300' : 'text-dim'}`}
    >
      {text}
    </span>
  )
}

function MapUndoRedo() {
  const canUndo = useEditor((s) => s.past.length > 0)
  const canRedo = useEditor((s) => s.future.length > 0)
  const undo = useEditor((s) => s.undo)
  const redo = useEditor((s) => s.redo)
  return <UndoRedo canUndo={canUndo} canRedo={canRedo} undo={undo} redo={redo} />
}

function EncounterUndoRedo() {
  const canUndo = useEncounter((s) => s.past.length > 0)
  const canRedo = useEncounter((s) => s.future.length > 0)
  const undo = useEncounter((s) => s.undo)
  const redo = useEncounter((s) => s.redo)
  return <UndoRedo canUndo={canUndo} canRedo={canRedo} undo={undo} redo={redo} />
}

function UndoRedo({
  canUndo,
  canRedo,
  undo,
  redo,
}: {
  canUndo: boolean
  canRedo: boolean
  undo: () => void
  redo: () => void
}) {
  const button =
    'flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-line text-lg hover:border-candle disabled:opacity-40 disabled:hover:border-line'
  return (
    <div className="flex shrink-0 gap-1">
      <button
        type="button"
        className={button}
        disabled={!canUndo}
        onClick={undo}
        aria-label={t.undo}
        title={`${t.undo} (${t.undoKey})`}
      >
        <span aria-hidden="true">↶</span>
      </button>
      <button
        type="button"
        className={button}
        disabled={!canRedo}
        onClick={redo}
        aria-label={t.redo}
        title={`${t.redo} (${t.redoKey})`}
      >
        <span aria-hidden="true">↷</span>
      </button>
    </div>
  )
}

function ModeSwitch({
  mode,
  onChange,
}: {
  mode: 'edit' | 'preview'
  onChange: (mode: 'edit' | 'preview') => void
}) {
  const item = (value: 'edit' | 'preview', label: string) => (
    <button
      type="button"
      aria-pressed={mode === value}
      onClick={() => onChange(value)}
      className={`min-h-9 px-3 text-sm ${mode === value ? 'bg-candle font-semibold text-table' : 'hover:text-candle'}`}
    >
      {label}
    </button>
  )
  return (
    <div className="flex shrink-0 overflow-hidden rounded-lg border border-line">
      {item('edit', t.edit)}
      {item('preview', t.preview)}
    </div>
  )
}

function Toolbar({
  tools,
  activeId,
  onPick,
}: {
  tools: EditorTool[]
  activeId: string
  onPick: (id: string) => void
}) {
  const groups = new Map<ToolGroup, EditorTool[]>()
  for (const tool of tools) groups.set(tool.group, [...(groups.get(tool.group) ?? []), tool])
  return (
    <nav
      aria-label={t.toolbar}
      className="flex w-20 shrink-0 flex-col gap-3 overflow-y-auto border-r border-line bg-panel/60 py-3"
    >
      {[...groups].map(([group, tools]) => (
        <div
          key={group}
          role="group"
          aria-label={t.toolGroups[group]}
          className="flex flex-col items-center gap-1"
        >
          <span className="text-[10px] font-semibold tracking-wide text-dim uppercase">
            {t.toolGroups[group]}
          </span>
          {tools.map((tool) => (
            <button
              key={tool.id}
              type="button"
              aria-pressed={tool.id === activeId}
              aria-label={tool.label}
              title={t.toolTitle(tool.label, tool.shortcut)}
              onClick={() => onPick(tool.id)}
              className={`flex size-11 items-center justify-center rounded-lg border ${
                tool.id === activeId
                  ? 'border-candle bg-candle/15 text-candle'
                  : 'border-transparent text-parchment hover:border-line'
              }`}
            >
              <tool.Icon className="size-6" />
            </button>
          ))}
        </div>
      ))}
    </nav>
  )
}

/** Live information: the save state and sync mark, the cell under the pointer, the problems. */
function StatusBar({
  hover,
  status,
  marks,
  items,
}: {
  hover: GridPoint | null
  status: SaveStatus
  marks: ComponentType[]
  items: ComponentType[]
}) {
  const doc = useEditor((s) => s.doc)
  let info = ''
  if (hover) {
    const grid = buildGrid(doc)
    const terrain = de.board.terrain[grid.terrain(hover.x, hover.y)]
    info = [
      t.cell(hover.x, hover.y),
      terrain,
      de.board.elevation(formatElevation(grid.elevation(hover.x, hover.y))),
    ].join(' · ')
  }
  return (
    <div className="flex min-h-7 shrink-0 items-center gap-4 border-t border-line bg-panel/60 px-3 text-xs text-dim">
      <SaveMark status={status} />
      {marks.map((Item, i) => (
        <Item key={i} />
      ))}
      <span className="min-w-48 shrink-0 tabular-nums">{info}</span>
      <span className="ml-auto truncate">{t.help}</span>
      {items.map((Item, i) => (
        <Item key={i} />
      ))}
    </div>
  )
}

/**
 * Undo, redo, tool shortcuts, Escape, then the active tool's own keys. In encounter mode
 * undo and redo act on the encounter.
 */
function useEditorKeys(
  store: EditorStore,
  encounter: EncounterStore | null,
  tools: EditorTool[],
  tool: EditorTool | undefined,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      )
        return
      const state = store.getState()
      const history = encounter ? encounter.getState() : state
      const ctx = { store, encounter: encounter ?? undefined }
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      if (mod && key === 'z') {
        e.preventDefault()
        if (e.shiftKey) history.redo()
        else history.undo()
        return
      }
      if (mod && key === 'y') {
        e.preventDefault()
        history.redo()
        return
      }
      if (e.key === 'Escape' && state.gestureBase) {
        state.cancelGesture()
        tool?.onPointerLeave?.(ctx)
        return
      }
      if (!mod && !e.altKey) {
        const picked = tools.find((item) => item.shortcut === key)
        if (picked) {
          state.setTool(picked.id)
          return
        }
      }
      if (tool?.onKeyDown?.(e, ctx)) e.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [store, encounter, tools, tool, enabled])
}

/** Tells tools when they become active and when they stop. */
function useToolLifecycle(
  store: EditorStore,
  encounter: EncounterStore | null,
  tool: EditorTool | undefined,
) {
  useEffect(() => {
    if (!tool) return
    const ctx = { store, encounter: encounter ?? undefined }
    tool.onActivate?.(ctx)
    return () => tool.onDeactivate?.(ctx)
  }, [store, encounter, tool])
}

/** The encounter's name in the header: the DM can rename it, trimmed, 1 to 80 characters. */
function EncounterName() {
  const store = useEncounterStore()
  const id = useId()
  const name = useEncounter((s) => s.doc.name)
  const readOnly = useEncounter((s) => s.meta.readOnly)
  // What the field shows while it has focus; the encounter keeps the last valid name.
  const [draft, setDraft] = useState<string | null>(null)
  const invalid = draft !== null && cleanEncounterName(draft) === null
  if (readOnly) return <span className="min-w-0 truncate text-base font-semibold">{name}</span>

  const commit = () => {
    if (draft !== null) store.getState().apply((doc) => renameEncounter(doc, draft))
    setDraft(null)
  }
  return (
    <input
      id={id}
      aria-label={te.encounterName}
      className={`${inputClass} max-w-64 min-h-9 py-1 text-base font-semibold`}
      value={draft ?? name}
      maxLength={ENCOUNTER_NAME_MAX}
      autoComplete="off"
      aria-invalid={invalid || undefined}
      title={invalid ? te.encounterNameInvalid : undefined}
      onFocus={() => setDraft(name)}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') {
          setDraft(null)
          event.currentTarget.blur()
        }
      }}
    />
  )
}
