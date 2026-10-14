// /kampagnen/:campaignId/karten/:mapId — the map editor (knowledge/features/dm-map-editor.md).
// Works offline: the map comes from the browser and every change is saved there.
// A full-screen page for laptops: the toolbar on the left, the map in the middle,
// the active tool's panel and the map's panels on the right.
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { buildGrid, type GridPoint } from '../board/geometry'
import { ButtonLink, Loading, PageTitle } from '../components/ui'
import { formatElevation } from '../lib/units'
import { useWideScreen } from '../lib/useWideScreen'
import { useCampaignCopy } from '../offline/campaigns'
import { useLocalUser } from '../offline/localUser'
import { de } from '../text/de'
import { EditorCanvas } from './EditorCanvas'
import { getMap } from './maps'
import { mapListPath } from './paths'
import { editorMapOf, type LocalMap } from './model'
import {
  DEFAULT_TOOL_ID,
  editorHeaderItems,
  editorPanels,
  editorTools,
  findTool,
  PreviewPane,
} from './registry'
import {
  createEditorStore,
  EditorStoreContext,
  useEditor,
  useEditorStore,
  type EditorStore,
} from './store'
import type { EditorTool, ToolGroup } from './tools'
import { useAutosave, type SaveStatus } from './useAutosave'

const t = de.editor

export function EditorPage() {
  const { campaignId = '', mapId = '' } = useParams()
  const { db } = useLocalUser()
  const wide = useWideScreen()
  const campaign = useCampaignCopy(db, campaignId)
  // Read once: the editor owns the map while it's open.
  const [record, setRecord] = useState<LocalMap | null | undefined>(undefined)
  useEffect(() => {
    let current = true
    void getMap(db, mapId).then((map) => {
      if (current) setRecord(map && map.campaignId === campaignId ? map : null)
    })
    return () => {
      current = false
    }
  }, [db, mapId, campaignId])

  if (!wide) return <Message campaignId={campaignId} title={t.narrowTitle} body={t.narrowBody} />
  if (record === undefined || campaign === undefined) return <Loading />
  if (record === null) {
    return <Message campaignId={campaignId} title={t.notFoundTitle} body={t.notFoundBody} />
  }
  if (campaign?.myRole !== 'dm') {
    return <Message campaignId={campaignId} title={t.notDmTitle} body={t.notDmBody} />
  }
  return <MapEditor record={record} />
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

function MapEditor({ record }: { record: LocalMap }) {
  const { db } = useLocalUser()
  const [store] = useState(() => createEditorStore(editorMapOf(record), DEFAULT_TOOL_ID))
  const status = useAutosave(store, db, record.id)

  return (
    <EditorStoreContext.Provider value={store}>
      <EditorFrame campaignId={record.campaignId} status={status} />
    </EditorStoreContext.Provider>
  )
}

function EditorFrame({ campaignId, status }: { campaignId: string; status: SaveStatus }) {
  const store = useEditorStore()
  const name = useEditor((s) => s.doc.name)
  const toolId = useEditor((s) => s.toolId)
  const tool = findTool(toolId)
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const [hover, setHover] = useState<GridPoint | null>(null)
  useEditorKeys(store, tool, mode === 'edit')
  useToolLifecycle(store, tool)

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-table text-parchment">
      <header className="flex min-h-12 shrink-0 items-center gap-3 border-b border-line bg-panel/80 px-3">
        <Link
          to={mapListPath(campaignId)}
          className="flex min-h-9 items-center gap-1 rounded-lg pr-2 text-sm text-candle hover:underline"
        >
          <span aria-hidden="true">←</span>
          {t.back}
        </Link>
        <h1 className="min-w-0 truncate text-base font-semibold">{name}</h1>
        <SaveMark status={status} />
        <div className="ml-auto flex items-center gap-2">
          {editorHeaderItems.map((Item, i) => (
            <Item key={i} />
          ))}
          <UndoRedo />
          <ModeSwitch mode={mode} onChange={setMode} />
        </div>
      </header>
      {mode === 'preview' ? (
        <PreviewSlot />
      ) : (
        <div className="flex min-h-0 flex-1">
          <Toolbar activeId={toolId} onPick={(id) => store.getState().setTool(id)} />
          <div className="flex min-w-0 flex-1 flex-col">
            <EditorCanvas tool={tool} onHover={setHover} className="min-h-0 flex-1" />
            <StatusBar hover={hover} />
          </div>
          <aside className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-line bg-panel/60 p-4">
            {tool?.Panel && (
              <PanelSection title={tool.label}>
                <tool.Panel />
              </PanelSection>
            )}
            {editorPanels.map((panel) => (
              <PanelSection key={panel.id} title={panel.title}>
                <panel.Component />
              </PanelSection>
            ))}
          </aside>
        </div>
      )}
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
      className={`truncate text-xs ${status === 'failed' ? 'text-red-300' : 'text-dim'}`}
    >
      {text}
    </span>
  )
}

function UndoRedo() {
  const canUndo = useEditor((s) => s.past.length > 0)
  const canRedo = useEditor((s) => s.future.length > 0)
  const undo = useEditor((s) => s.undo)
  const redo = useEditor((s) => s.redo)
  const button =
    'min-h-9 rounded-lg border border-line px-3 text-sm hover:border-candle disabled:opacity-40 disabled:hover:border-line'
  return (
    <div className="flex gap-1">
      <button type="button" className={button} disabled={!canUndo} onClick={undo} title={t.undoKey}>
        {t.undo}
      </button>
      <button type="button" className={button} disabled={!canRedo} onClick={redo} title={t.redoKey}>
        {t.redo}
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
    <div className="flex overflow-hidden rounded-lg border border-line">
      {item('edit', t.edit)}
      {item('preview', t.preview)}
    </div>
  )
}

function Toolbar({ activeId, onPick }: { activeId: string; onPick: (id: string) => void }) {
  const groups = new Map<ToolGroup, EditorTool[]>()
  for (const tool of editorTools) groups.set(tool.group, [...(groups.get(tool.group) ?? []), tool])
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

function StatusBar({ hover }: { hover: GridPoint | null }) {
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
      <span className="min-w-48 tabular-nums">{info}</span>
      <span className="ml-auto truncate">{t.help}</span>
    </div>
  )
}

/** Undo, redo, tool shortcuts, Escape, then the active tool's own keys. */
function useEditorKeys(store: EditorStore, tool: EditorTool | undefined, enabled: boolean) {
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
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      if (mod && key === 'z') {
        e.preventDefault()
        if (e.shiftKey) state.redo()
        else state.undo()
        return
      }
      if (mod && key === 'y') {
        e.preventDefault()
        state.redo()
        return
      }
      if (e.key === 'Escape' && state.gestureBase) {
        state.cancelGesture()
        tool?.onPointerLeave?.({ store })
        return
      }
      if (!mod && !e.altKey) {
        const picked = editorTools.find((item) => item.shortcut === key)
        if (picked) {
          state.setTool(picked.id)
          return
        }
      }
      if (tool?.onKeyDown?.(e, { store })) e.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [store, tool, enabled])
}

/** Tells tools when they become active and when they stop. */
function useToolLifecycle(store: EditorStore, tool: EditorTool | undefined) {
  useEffect(() => {
    if (!tool) return
    tool.onActivate?.({ store })
    return () => tool.onDeactivate?.({ store })
  }, [store, tool])
}
