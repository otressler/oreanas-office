// The feature tool: drag a rectangle to place a feature with the panel's kind, label,
// elevation and "blocks movement". Refused (red) outside the grid or over another
// feature; void and walls below are fine (a bridge over a gorge, a door in a wall).
import type { GridPoint } from '../../board/geometry'
import { de } from '../../text/de'
import type { EditorStore } from '../store'
import type { EditorTool, ToolContext } from '../tools'
import type { Rect } from '../validation'
import { FeatureIcon } from './icons'
import { addFeature, footprintFits, rectBetween } from './layout'
import { placementOptions } from './options'
import { FeatureToolPanel } from './panels'

let anchor: GridPoint | null = null

const kindGiven = () => placementOptions.getState().feature.kind.trim().length > 0

function preview(store: EditorStore, rect: Rect) {
  const { doc, setOverlay } = store.getState()
  const ok = kindGiven() && footprintFits(doc, rect)
  setOverlay([{ kind: 'rect', ...rect, style: ok ? 'paint' : 'invalid' }])
}

function cancel({ store }: ToolContext) {
  anchor = null
  store.getState().setOverlay([])
}

/** Places a feature over the rectangle when the rules allow it; returns its id. */
export function placeFeature(store: EditorStore, rect: Rect): string | null {
  const { doc, apply, select } = store.getState()
  if (!kindGiven() || !footprintFits(doc, rect)) return null
  const options = placementOptions.getState().feature
  let id = ''
  apply((current) => {
    const added = addFeature(current, {
      ...options,
      kind: options.kind.trim(),
      label: options.label.trim(),
      ...rect,
    })
    id = added.id
    return added.map
  })
  select({ kind: 'feature', id })
  return id
}

export const featureTool: EditorTool = {
  id: 'feature',
  group: 'features',
  label: de.editorFeatures.tools.feature,
  shortcut: 'o',
  Icon: FeatureIcon,
  Panel: FeatureToolPanel,
  cursor: 'crosshair',

  onActivate: cancel,
  onDeactivate: cancel,
  onPointerLeave: cancel,

  onPointerDown(pointer, { store }) {
    anchor = pointer.cell
    preview(store, rectBetween(pointer.cell, pointer.cell))
  },

  onPointerMove(pointer, { store }) {
    if (anchor && pointer.pressed) preview(store, rectBetween(anchor, pointer.cell))
    else if (pointer.inside) preview(store, rectBetween(pointer.cell, pointer.cell))
    else store.getState().setOverlay([])
  },

  onPointerUp(pointer, ctx) {
    const start = anchor
    cancel(ctx)
    if (start) placeFeature(ctx.store, rectBetween(start, pointer.cell))
  },

  onKeyDown(event, ctx) {
    if (event.key !== 'Escape' || !anchor) return false
    cancel(ctx)
    return true
  },
}
