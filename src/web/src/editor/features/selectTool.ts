// The select tool: click a feature or an entrance to select it, drag a feature to move
// it (one undo step), Delete removes the selection and Escape clears it. Where a feature
// and an entrance share a cell, clicking again switches between them.
import type { GridPoint } from '../../board/geometry'
import { de } from '../../text/de'
import type { Selection } from '../store'
import type { EditorTool, ToolContext } from '../tools'
import { SelectIcon } from './icons'
import { entranceAtCell, featureAtCell, footprintFits, moveFeature, removeItem } from './layout'
import { SelectPanel } from './panels'

interface Press {
  start: GridPoint
  /** What lies under the pressed cell: the feature first, then the entrance. */
  hits: Selection[]
  /** The selection was already one of the hits, so a click switches to the next. */
  cycle: boolean
  moved: boolean
  /** The feature being dragged, where it started and where it would land. */
  feature: { id: string; origin: GridPoint; target: GridPoint | null } | null
}

let press: Press | null = null

const same = (a: Selection | null, b: Selection) => a?.kind === b.kind && a.id === b.id

function cancel({ store }: ToolContext) {
  press = null
  store.getState().setOverlay([])
}

export const selectTool: EditorTool = {
  id: 'select',
  group: 'features',
  label: de.editorFeatures.tools.select,
  shortcut: 'v',
  Icon: SelectIcon,
  Panel: SelectPanel,
  cursor: 'default',

  onActivate: cancel,
  onDeactivate: cancel,
  onPointerLeave: cancel,

  onPointerDown(pointer, { store }) {
    const { doc, selection, select, setOverlay } = store.getState()
    setOverlay([])
    const hits: Selection[] = []
    const feature = featureAtCell(doc, pointer.cell)
    if (feature) hits.push({ kind: 'feature', id: feature.id })
    const entrance = entranceAtCell(doc, pointer.cell)
    if (entrance) hits.push({ kind: 'entrance', id: entrance.id })
    if (hits.length === 0) {
      press = null
      select(null)
      return
    }
    const current = hits.findIndex((hit) => same(selection, hit))
    const picked = hits[Math.max(current, 0)]!
    if (current < 0) select(picked)
    const dragged =
      picked.kind === 'feature' ? doc.layout.features.find((f) => f.id === picked.id) : undefined
    press = {
      start: pointer.cell,
      hits,
      cycle: current >= 0 && hits.length > 1,
      moved: false,
      feature: dragged
        ? { id: dragged.id, origin: { x: dragged.x, y: dragged.y }, target: null }
        : null,
    }
  },

  onPointerMove(pointer, { store }) {
    if (!press || !pointer.pressed) return
    const { cell } = pointer
    if (!press.moved && cell.x === press.start.x && cell.y === press.start.y) return
    press.moved = true
    const drag = press.feature
    if (!drag) return
    const { doc, setOverlay } = store.getState()
    const feature = doc.layout.features.find((f) => f.id === drag.id)
    if (!feature) return
    const target = {
      x: drag.origin.x + cell.x - press.start.x,
      y: drag.origin.y + cell.y - press.start.y,
    }
    const rect = { ...target, w: feature.w, h: feature.h }
    const fits = footprintFits(doc, rect, feature.id)
    drag.target = fits ? target : null
    setOverlay([{ kind: 'rect', ...rect, style: fits ? 'paint' : 'invalid' }])
  },

  onPointerUp(_pointer, ctx) {
    const done = press
    cancel(ctx)
    if (!done) return
    const { apply, select, selection } = ctx.store.getState()
    const drag = done.feature
    if (done.moved) {
      if (drag?.target && (drag.target.x !== drag.origin.x || drag.target.y !== drag.origin.y)) {
        const target = drag.target
        apply((doc) => moveFeature(doc, drag.id, target))
      }
      return
    }
    if (done.cycle) {
      const index = done.hits.findIndex((hit) => same(selection, hit))
      select(done.hits[(index + 1) % done.hits.length]!)
    }
  },

  onKeyDown(event, ctx) {
    const { selection, select, apply } = ctx.store.getState()
    if (event.key === 'Escape') {
      if (press) {
        cancel(ctx)
        return true
      }
      if (!selection) return false
      select(null)
      return true
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && selection) {
      cancel(ctx)
      apply((doc) => removeItem(doc, selection))
      return true
    }
    return false
  },
}
