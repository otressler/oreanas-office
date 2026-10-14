// The entrance tool: drag along the map's outer edge to make an entrance from the cells
// crossed. Only edge cells a token may stand on and no other entrance has are taken;
// the rest show red. Clicking a cell of an existing entrance selects it; the panel then
// shows it to edit or delete, and Delete removes it.
import type { GridPoint } from '../../board/geometry'
import { de } from '../../text/de'
import type { EditorStore, Overlay } from '../store'
import type { EditorTool, ToolContext } from '../tools'
import { EntranceIcon } from './icons'
import { lineCells } from '../terrain/layout'
import { addEntrance, entranceAtCell, entranceCells, removeItem } from './layout'
import { placementOptions } from './options'
import { EntranceToolPanel } from './panels'

let press: { path: GridPoint[]; moved: boolean } | null = null

function overlayFor(store: EditorStore, path: readonly GridPoint[]): Overlay[] {
  const { doc } = store.getState()
  const { take, refuse } = entranceCells(doc, path)
  // Refused cells beyond the grid aren't drawn: the pointer only passed by out there.
  const shown = refuse.filter((c) => c.x >= 0 && c.y >= 0 && c.x < doc.width && c.y < doc.height)
  const overlay: Overlay[] = []
  if (take.length) overlay.push({ kind: 'cells', cells: take, style: 'paint' })
  if (shown.length) overlay.push({ kind: 'cells', cells: shown, style: 'invalid' })
  return overlay
}

/** Hovering: an existing entrance shows as selectable, any other cell as taken or refused. */
function hover(store: EditorStore, cell: GridPoint) {
  const { doc, setOverlay } = store.getState()
  const entrance = entranceAtCell(doc, cell)
  if (entrance) {
    const cells = entrance.cells.map(([x = 0, y = 0]) => ({ x, y }))
    setOverlay([{ kind: 'cells', cells, style: 'select' }])
  } else setOverlay(overlayFor(store, [cell]))
}

function cancel({ store }: ToolContext) {
  press = null
  store.getState().setOverlay([])
}

/** Makes an entrance from the cells the rules allow; returns its id, or null if none. */
export function placeEntrance(store: EditorStore, path: readonly GridPoint[]): string | null {
  const { doc, apply, select } = store.getState()
  const { take } = entranceCells(doc, path)
  if (take.length === 0) return null
  const options = placementOptions.getState().entrance
  let id = ''
  apply((current) => {
    const added = addEntrance(current, {
      kind: options.kind,
      label: options.label.trim(),
      cells: entranceCells(current, path).take,
    })
    id = added.id
    return added.map
  })
  select({ kind: 'entrance', id })
  return id
}

export const entranceTool: EditorTool = {
  id: 'entrance',
  group: 'entrances',
  label: de.editorFeatures.tools.entrance,
  shortcut: 'e',
  Icon: EntranceIcon,
  Panel: EntranceToolPanel,
  cursor: 'crosshair',

  onActivate: cancel,
  onDeactivate: cancel,
  onPointerLeave: cancel,

  onPointerDown(pointer, { store }) {
    press = { path: [pointer.cell], moved: false }
    store.getState().setOverlay(overlayFor(store, press.path))
  },

  onPointerMove(pointer, { store }) {
    if (!press || !pointer.pressed) {
      if (pointer.inside) hover(store, pointer.cell)
      else store.getState().setOverlay([])
      return
    }
    const last = press.path.at(-1)!
    if (last.x === pointer.cell.x && last.y === pointer.cell.y) return
    // The canvas reports cell changes only; a fast drag can skip cells in between.
    press.path.push(...lineCells(last, pointer.cell).slice(1))
    press.moved = true
    store.getState().setOverlay(overlayFor(store, press.path))
  },

  onPointerUp(_pointer, ctx) {
    const done = press
    cancel(ctx)
    if (!done) return
    const { doc, select } = ctx.store.getState()
    const existing = done.moved ? undefined : entranceAtCell(doc, done.path[0]!)
    if (existing) select({ kind: 'entrance', id: existing.id })
    else placeEntrance(ctx.store, done.path)
  },

  onKeyDown(event, ctx) {
    const { selection, select, apply } = ctx.store.getState()
    if (event.key === 'Escape') {
      if (press) {
        cancel(ctx)
        return true
      }
      if (selection?.kind !== 'entrance') return false
      select(null)
      return true
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && selection?.kind === 'entrance') {
      cancel(ctx)
      apply((doc) => removeItem(doc, selection))
      return true
    }
    return false
  },
}
