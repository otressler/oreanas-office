// The "Nebel" tool of encounter mode (knowledge/features/fog-of-war.md, "Preparing"): brush,
// rectangle and fill, each revealing or hiding; with "Felder wählen" on, the same shapes
// choose the cells of an area instead. A stroke or rectangle is a preview (overlay) until the
// pointer is released, then one undo step. Hidden cells are drawn hatched by the canvas.
import type { GridPoint } from '../../board/geometry'
import {
  areaCells,
  brushStroke,
  fillFrom,
  hiddenOfDocument,
  playableCells,
  rectangle,
  type CellSet,
} from '../../fog/cells'
import { de } from '../../text/de'
import type { EditorTool, ToolContext } from '../tools'
import type { Overlay } from '../store'
import { FogIcon } from '../encounter/icons'
import { FogPanel } from './FogPanel'
import { useFogOptions } from './options'
import { paintDocFog } from './ops'

interface Session {
  /** The cells of the brush stroke so far. */
  stroke: Set<string> | null
  last: GridPoint | null
  /** The rectangle's first corner. */
  start: GridPoint | null
  hover: GridPoint | null
  unsubscribe: (() => void) | null
}

const sessions = new WeakMap<object, Session>()

function session(ctx: ToolContext): Session {
  let s = sessions.get(ctx.store)
  if (!s) {
    s = { stroke: null, last: null, start: null, hover: null, unsubscribe: null }
    sessions.set(ctx.store, s)
  }
  return s
}

const playableOf = (ctx: ToolContext) => playableCells(ctx.store.getState().doc)

const toCells = (keys: CellSet): GridPoint[] =>
  [...keys].map((key) => {
    const [x = 0, y = 0] = key.split(',').map(Number)
    return { x, y }
  })

/** The cells the current gesture would cover. */
function previewCells(ctx: ToolContext, s: Session): Set<string> {
  const map = ctx.store.getState().doc
  const { shape } = useFogOptions.getState()
  if (shape === 'brush') return s.stroke ?? new Set()
  if (shape === 'rect' && s.start && s.hover) {
    return rectangle(map, s.start, s.hover, playableOf(ctx))
  }
  if (shape === 'fill' && s.hover) {
    const fog = ctx.encounter?.getState().doc.fog
    return fog ? fillFrom(s.hover, hiddenOfDocument(fog), playableOf(ctx)) : new Set()
  }
  return new Set()
}

/** What the tool draws over the map: the chosen cells, the highlighted area, the preview. */
function draw(ctx: ToolContext) {
  const s = session(ctx)
  const { selection, highlighted, reveal, selecting, shape } = useFogOptions.getState()
  const overlay: Overlay[] = []
  if (selection.size > 0)
    overlay.push({ kind: 'cells', cells: toCells(selection), style: 'select' })
  const area = ctx.encounter?.getState().doc.fog?.areas.find((item) => item.id === highlighted)
  if (area) overlay.push({ kind: 'cells', cells: toCells(areaCells(area)), style: 'select' })
  // Fill previews only under the pointer, brush and rectangle while painting.
  const painting = shape === 'fill' ? s.hover !== null : s.stroke !== null || s.start !== null
  if (painting) {
    const cells = previewCells(ctx, s)
    if (cells.size > 0) {
      overlay.push({
        kind: 'cells',
        cells: toCells(cells),
        style: selecting ? 'select' : reveal ? 'paint' : 'erase',
      })
    }
  }
  ctx.store.getState().setOverlay(overlay)
}

function reset(ctx: ToolContext) {
  const s = session(ctx)
  s.stroke = null
  s.last = null
  s.start = null
  s.hover = null
}

/** Applies a finished gesture: chooses cells for an area, or changes the fog. */
function commit(ctx: ToolContext, cells: CellSet) {
  if (cells.size === 0) return
  const options = useFogOptions.getState()
  if (options.selecting) {
    // Painting twice on a cell takes it out again.
    const next = new Set(options.selection)
    const allIn = [...cells].every((key) => next.has(key))
    for (const key of cells) {
      if (allIn) next.delete(key)
      else next.add(key)
    }
    options.setSelection(next)
    return
  }
  const encounter = ctx.encounter
  if (!encounter || encounter.getState().meta.readOnly) return
  encounter.getState().apply((doc) => paintDocFog(doc, cells, options.reveal))
}

export const fogTool: EditorTool = {
  id: 'fog',
  group: 'encounter',
  label: de.fog.editor.tool,
  shortcut: 'n',
  Icon: FogIcon,
  Panel: FogPanel,
  cursor: 'crosshair',

  onActivate(ctx) {
    const s = session(ctx)
    s.unsubscribe?.()
    const offOptions = useFogOptions.subscribe(() => draw(ctx))
    const offDoc = ctx.encounter?.subscribe((state, prev) => {
      if (state.doc.fog !== prev.doc.fog) draw(ctx)
    })
    s.unsubscribe = () => {
      offOptions()
      offDoc?.()
    }
    draw(ctx)
  },

  onDeactivate(ctx) {
    const s = session(ctx)
    s.unsubscribe?.()
    s.unsubscribe = null
    reset(ctx)
    ctx.store.getState().setOverlay([])
  },

  onPointerDown(pointer, ctx) {
    if (!ctx.encounter?.getState().doc.fog) return
    const s = session(ctx)
    const { shape } = useFogOptions.getState()
    s.hover = pointer.cell
    if (shape === 'brush') {
      s.last = pointer.cell
      s.stroke = brushStroke(pointer.cell, pointer.cell, playableOf(ctx))
    } else if (shape === 'rect') {
      s.start = pointer.cell
    } else if (pointer.inside) {
      commit(
        ctx,
        fillFrom(pointer.cell, hiddenOfDocument(ctx.encounter.getState().doc.fog), playableOf(ctx)),
      )
    }
    draw(ctx)
  },

  onPointerMove(pointer, ctx) {
    const s = session(ctx)
    s.hover = pointer.cell
    if (pointer.pressed && s.stroke && s.last) {
      for (const key of brushStroke(s.last, pointer.cell, playableOf(ctx))) s.stroke.add(key)
      s.last = pointer.cell
    }
    draw(ctx)
  },

  onPointerUp(pointer, ctx) {
    const s = session(ctx)
    s.hover = pointer.cell
    const cells = previewCells(ctx, s)
    const wasPainting = s.stroke !== null || s.start !== null
    reset(ctx)
    if (wasPainting) commit(ctx, cells)
    s.hover = pointer.cell
    draw(ctx)
  },

  onPointerLeave(ctx) {
    reset(ctx)
    draw(ctx)
  },

  onKeyDown(event, ctx) {
    if (event.key !== 'Escape') return false
    const s = session(ctx)
    const options = useFogOptions.getState()
    if (s.stroke || s.start) {
      reset(ctx)
    } else if (options.selection.size > 0) {
      options.setSelection(new Set())
    } else return false
    draw(ctx)
    return true
  },
}
