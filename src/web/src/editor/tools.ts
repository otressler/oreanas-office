// What a tool and a side panel of the map editor look like. Each tool module exports
// a list of tools and panels; registry.ts collects them (the integrator owns it).
import type { ComponentType } from 'react'
import type { GridPoint } from '../board/geometry'
import type { EncounterStore } from './encounter/store'
import type { EditorStore } from './store'

/** The toolbar's groups, in toolbar order. */
export type ToolGroup = 'terrain' | 'elevation' | 'features' | 'entrances' | 'creatures'

/** A pointer over the map, in cells. */
export interface CellPointer {
  /** The cell under the pointer; may lie outside the map. */
  cell: GridPoint
  /** The cell is inside the map's width and height. */
  inside: boolean
  /** The primary button is held (move events also come while hovering). */
  pressed: boolean
  shift: boolean
  alt: boolean
  /** Ctrl, or Cmd on a Mac. */
  mod: boolean
}

export interface ToolContext {
  store: EditorStore
  /** In encounter mode the encounter being edited; the creature tools need it. */
  encounter?: EncounterStore
}

export interface EditorTool {
  /** Stable and unique, e.g. "terrain-brush". */
  id: string
  group: ToolGroup
  /** German, from text/de.ts. */
  label: string
  /** One lower-case key that picks the tool, e.g. "b". */
  shortcut?: string
  Icon: ComponentType<{ className?: string }>
  /** The tool's options and the selection's properties, shown in the side panel while active. */
  Panel?: ComponentType
  /** A CSS cursor over the map. */
  cursor?: string

  onActivate?(ctx: ToolContext): void
  onDeactivate?(ctx: ToolContext): void
  /** Primary button down on the map. Panning (middle or right button, Space) never reaches tools. */
  onPointerDown?(pointer: CellPointer, ctx: ToolContext): void
  /** The pointer moved to another cell, pressed or hovering. */
  onPointerMove?(pointer: CellPointer, ctx: ToolContext): void
  onPointerUp?(pointer: CellPointer, ctx: ToolContext): void
  /** The pointer left the map, or the drag was cancelled. */
  onPointerLeave?(ctx: ToolContext): void
  /**
   * A key while the tool is active and no text field has focus. Return true when
   * handled. Undo, redo, tool shortcuts and Escape (cancels a running gesture) are
   * handled by the editor before this.
   */
  onKeyDown?(event: KeyboardEvent, ctx: ToolContext): boolean
}

/** A section of the side panel that is always there, below the active tool's panel. */
export interface EditorPanel {
  id: string
  /** German, from text/de.ts. */
  title: string
  Component: ComponentType
}
