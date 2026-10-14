// The terrain tools (brush, rectangle, fill) and the elevation tools (brush,
// rectangle). Every change goes through the editor store: a brush stroke is one
// gesture, a rectangle and a fill are one `apply` each. Previews and the elevation
// labels are drawn only through the store's overlay.
import type { ComponentType } from 'react'
import type { GridPoint } from '../../board/geometry'
import { de } from '../../text/de'
import type { EditorMap } from '../model'
import type { EditorStore, Overlay } from '../store'
import type { CellPointer, EditorTool, ToolContext, ToolGroup } from '../tools'
import { ElevationBrushIcon, ElevationRectIcon, BrushIcon, FillIcon, RectIcon } from './icons'
import {
  elevationAt,
  elevationLabels,
  floodArea,
  lineCells,
  paintElevation,
  paintTerrain,
  rectBetween,
  rectCells,
  terrainAt,
} from './layout'
import { ELEVATION_QUICK, pickByDigit, TERRAIN_CHOICES, usePaintOptions } from './options'
import { ElevationPanel, TerrainPanel } from './panels'

const t = de.editorTerrain

/** What a tool remembers while it's active, per editor store. */
interface Session {
  /** The cell under the pointer while it's over the map. */
  hover: GridPoint | null
  /** A brush stroke is running; the last cell it painted. */
  last: GridPoint | null
  /** A rectangle is being dragged from this cell. */
  start: GridPoint | null
  unsubscribe: (() => void) | null
}

/** How a kind of tool paints and picks; terrain and elevation differ only here. */
interface Paint {
  group: ToolGroup
  paint(doc: EditorMap, cells: GridPoint[]): EditorMap
  /** Alt+click: take the value from the clicked cell. */
  pick(doc: EditorMap, cell: GridPoint): void
  /** Show every cell's elevation while active. */
  labels: boolean
  keys(event: KeyboardEvent): boolean
  Panel: ComponentType
}

type Shape = 'brush' | 'rect' | 'fill'

const terrainPaint: Paint = {
  group: 'terrain',
  paint: (doc, cells) => paintTerrain(doc, cells, usePaintOptions.getState().terrain),
  pick: (doc, cell) => usePaintOptions.getState().setTerrain(terrainAt(doc, cell.x, cell.y)),
  labels: false,
  keys(event) {
    const terrain = pickByDigit(TERRAIN_CHOICES, event.key)
    if (!terrain) return false
    usePaintOptions.getState().setTerrain(terrain)
    return true
  },
  Panel: TerrainPanel,
}

const elevationPaint: Paint = {
  group: 'elevation',
  paint: (doc, cells) => paintElevation(doc, cells, usePaintOptions.getState().elevation),
  pick(doc, cell) {
    if (terrainAt(doc, cell.x, cell.y) === 'void') return
    usePaintOptions.getState().setElevation(elevationAt(doc, cell.x, cell.y))
  },
  labels: true,
  keys(event) {
    const meters = pickByDigit(ELEVATION_QUICK, event.key)
    if (meters === undefined) return false
    usePaintOptions.getState().setElevation(meters)
    return true
  },
  Panel: ElevationPanel,
}

function makeTool(
  shape: Shape,
  how: Paint,
  info: Pick<EditorTool, 'id' | 'label' | 'shortcut' | 'Icon'>,
): EditorTool {
  const sessions = new WeakMap<EditorStore, Session>()
  const session = (store: EditorStore) => {
    let s = sessions.get(store)
    if (!s) {
      s = { hover: null, last: null, start: null, unsubscribe: null }
      sessions.set(store, s)
    }
    return s
  }
  const inside = (doc: EditorMap, cell: GridPoint) =>
    cell.x >= 0 && cell.y >= 0 && cell.x < doc.width && cell.y < doc.height

  /** The preview under the pointer, plus the elevation labels. */
  const draw = (store: EditorStore) => {
    const s = session(store)
    const doc = store.getState().doc
    const style =
      how.group === 'terrain' && usePaintOptions.getState().terrain === 'void' ? 'erase' : 'paint'
    const overlay: Overlay[] = []
    if (how.labels) overlay.push({ kind: 'labels', items: elevationLabels(doc) })
    if (s.start) {
      const rect = rectBetween(doc, s.start, s.hover ?? s.start)
      if (rect) overlay.push({ kind: 'rect', ...rect, style })
    } else if (s.hover && inside(doc, s.hover)) {
      const cells = shape === 'fill' ? floodArea(doc, s.hover) : [s.hover]
      overlay.push({ kind: 'cells', cells, style })
    }
    store.getState().setOverlay(overlay)
  }

  const reset = (s: Session) => {
    s.hover = null
    s.last = null
    s.start = null
  }

  return {
    ...info,
    group: how.group,
    Panel: how.Panel,
    cursor: 'crosshair',

    onActivate({ store }) {
      const s = session(store)
      s.unsubscribe?.()
      const offDoc = store.subscribe((state, prev) => {
        if (state.doc !== prev.doc) draw(store)
      })
      const offOptions = usePaintOptions.subscribe(() => draw(store))
      s.unsubscribe = () => {
        offDoc()
        offOptions()
      }
      draw(store)
    },

    onDeactivate({ store }) {
      const s = session(store)
      s.unsubscribe?.()
      s.unsubscribe = null
      reset(s)
      store.getState().setOverlay([])
    },

    onPointerDown(pointer: CellPointer, { store }: ToolContext) {
      const s = session(store)
      const state = store.getState()
      s.hover = pointer.cell
      if (pointer.alt) {
        if (pointer.inside) how.pick(state.doc, pointer.cell)
        draw(store)
        return
      }
      if (shape === 'brush') {
        s.last = pointer.cell
        state.beginGesture()
        state.updateGesture((doc) => how.paint(doc, [pointer.cell]))
      } else if (shape === 'rect') {
        s.start = pointer.cell
      } else if (pointer.inside) {
        state.apply((doc) => how.paint(doc, floodArea(doc, pointer.cell)))
      }
      draw(store)
    },

    onPointerMove(pointer, { store }) {
      const s = session(store)
      s.hover = pointer.cell
      if (pointer.pressed && s.last) {
        const cells = lineCells(s.last, pointer.cell)
        s.last = pointer.cell
        store.getState().updateGesture((doc) => how.paint(doc, cells))
      }
      draw(store)
    },

    onPointerUp(pointer, { store }) {
      const s = session(store)
      const state = store.getState()
      s.hover = pointer.cell
      if (s.last) {
        const cells = lineCells(s.last, pointer.cell)
        s.last = null
        state.updateGesture((doc) => how.paint(doc, cells))
        state.endGesture()
      }
      if (s.start) {
        const rect = rectBetween(state.doc, s.start, pointer.cell)
        s.start = null
        if (rect) state.apply((doc) => how.paint(doc, rectCells(rect)))
      }
      draw(store)
    },

    onPointerLeave({ store }) {
      const s = session(store)
      // A stroke that ends here was cancelled by the editor (Escape, a lost pointer).
      reset(s)
      draw(store)
    },

    onKeyDown(event, { store }) {
      const s = session(store)
      // A rectangle is only a preview until release; Escape drops it.
      if (event.key === 'Escape' && s.start) {
        s.start = null
        draw(store)
        return true
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return false
      if (!how.keys(event)) return false
      draw(store)
      return true
    },
  }
}

export const terrainBrush = makeTool('brush', terrainPaint, {
  id: 'terrain-brush',
  label: t.tools.brush,
  shortcut: 'b',
  Icon: BrushIcon,
})

export const terrainRect = makeTool('rect', terrainPaint, {
  id: 'terrain-rect',
  label: t.tools.rect,
  shortcut: 'r',
  Icon: RectIcon,
})

export const terrainFill = makeTool('fill', terrainPaint, {
  id: 'terrain-fill',
  label: t.tools.fill,
  shortcut: 'f',
  Icon: FillIcon,
})

export const elevationBrush = makeTool('brush', elevationPaint, {
  id: 'elevation-brush',
  label: t.tools.elevationBrush,
  shortcut: 'h',
  Icon: ElevationBrushIcon,
})

export const elevationRect = makeTool('rect', elevationPaint, {
  id: 'elevation-rect',
  label: t.tools.elevationRect,
  Icon: ElevationRectIcon,
})
