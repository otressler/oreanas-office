// The creature tools of encounter mode (knowledge/features/dm-map-editor.md, requirement
// 7): "Platzieren" puts the picked creature type on the clicked cell (its footprint's
// top-left), "Auswählen" selects a token, drags it to another cell, and removes it with
// Delete. Both refuse (red) where a creature may not stand: the placement rule of
// knowledge/domain/encounter.md, checked by board/geometry.ts.
import { footprint, tokenAt, type GridPoint } from '../../board/geometry'
import { de } from '../../text/de'
import type { CreatureSize } from '../../api/types'
import type { EditorTool, ToolContext } from '../tools'
import { PlaceIcon, SelectCreatureIcon } from './icons'
import { PlacePanel, SelectCreaturePanel } from './panels'
import { pickedType } from './picked'
import type { EncounterStore } from './store'
import { canStandAt, gridOf, moveToken, placeToken, removeToken } from './tokens'

const t = de.encounterEditor

/** The encounter being edited, or undefined where the tool has nothing to change. */
function editable(ctx: ToolContext): EncounterStore | undefined {
  const encounter = ctx.encounter
  return encounter && !encounter.getState().meta.readOnly ? encounter : undefined
}

function clearOverlay({ store }: ToolContext) {
  store.getState().setOverlay([])
}

/** The footprint at a cell as an overlay, red where the creature may not stand. */
function showFootprint(ctx: ToolContext, size: CreatureSize, at: GridPoint, ignoreId?: string) {
  const encounter = ctx.encounter
  if (!encounter) return false
  const { doc: map, setOverlay } = ctx.store.getState()
  const fits = canStandAt(gridOf(map), encounter.getState().doc.tokens, size, at, ignoreId)
  const n = footprint(size)
  setOverlay([{ kind: 'rect', x: at.x, y: at.y, w: n, h: n, style: fits ? 'paint' : 'invalid' }])
  return fits
}

export const placeTool: EditorTool = {
  id: 'creature-place',
  group: 'creatures',
  label: t.tools.place,
  shortcut: 'k',
  Icon: PlaceIcon,
  Panel: PlacePanel,
  cursor: 'crosshair',

  onActivate: clearOverlay,
  onDeactivate: clearOverlay,
  onPointerLeave: clearOverlay,

  onPointerMove(pointer, ctx) {
    const type = pickedType.getState().type
    if (!editable(ctx) || !type || !pointer.inside) clearOverlay(ctx)
    else showFootprint(ctx, type.size, pointer.cell)
  },

  onPointerDown(pointer, ctx) {
    const encounter = editable(ctx)
    const type = pickedType.getState().type
    if (!encounter || !type) return
    // An invalid click places nothing.
    if (!showFootprint(ctx, type.size, pointer.cell)) return
    const id = crypto.randomUUID()
    encounter.getState().apply((doc) => placeToken(doc, type, pointer.cell, id))
    encounter.getState().select(id)
    // The new token now stands there, so the preview turns red.
    showFootprint(ctx, type.size, pointer.cell)
  },
}

/** A press on a token, and where a drag would drop it. */
interface Press {
  id: string
  size: CreatureSize
  origin: GridPoint
  start: GridPoint
  moved: boolean
  target: GridPoint | null
}

let press: Press | null = null

function cancel(ctx: ToolContext) {
  press = null
  clearOverlay(ctx)
}

export const selectCreatureTool: EditorTool = {
  id: 'creature-select',
  group: 'creatures',
  label: t.tools.select,
  shortcut: 'v',
  Icon: SelectCreatureIcon,
  Panel: SelectCreaturePanel,
  cursor: 'default',

  onActivate: cancel,
  onDeactivate: cancel,
  onPointerLeave: cancel,

  onPointerDown(pointer, ctx) {
    const encounter = ctx.encounter
    if (!encounter) return
    const { doc, selectedId, select } = encounter.getState()
    clearOverlay(ctx)
    const token = tokenAt(doc.tokens, pointer.cell, selectedId)
    if (!token) {
      press = null
      select(null)
      return
    }
    select(token.id)
    press = {
      id: token.id,
      size: token.size,
      origin: { x: token.x, y: token.y },
      start: pointer.cell,
      moved: false,
      target: null,
    }
  },

  onPointerMove(pointer, ctx) {
    if (!press || !pointer.pressed || !editable(ctx)) return
    const { cell } = pointer
    if (!press.moved && cell.x === press.start.x && cell.y === press.start.y) return
    press.moved = true
    const at = {
      x: press.origin.x + cell.x - press.start.x,
      y: press.origin.y + cell.y - press.start.y,
    }
    press.target = showFootprint(ctx, press.size, at, press.id) ? at : null
  },

  onPointerUp(_pointer, ctx) {
    const done = press
    cancel(ctx)
    const encounter = editable(ctx)
    if (!done?.moved || !done.target || !encounter) return
    const target = done.target
    encounter.getState().apply((doc) => moveToken(doc, done.id, target))
  },

  onKeyDown(event, ctx) {
    const encounter = ctx.encounter
    if (!encounter) return false
    const { selectedId, select, apply } = encounter.getState()
    if (event.key === 'Escape') {
      if (press) {
        cancel(ctx)
        return true
      }
      if (selectedId === null) return false
      select(null)
      return true
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId !== null) {
      if (!editable(ctx)) return false
      cancel(ctx)
      apply((doc) => removeToken(doc, selectedId))
      return true
    }
    return false
  },
}

/** The tools of encounter mode, in toolbar order. */
export const creatureTools: EditorTool[] = [placeTool, selectCreatureTool]
