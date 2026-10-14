// Terrain and elevation tools, and resizing the map (lane: terrain and elevation).
import { de } from '../../text/de'
import type { EditorTool } from '../tools'
import { ResizeIcon } from './icons'
import { ResizePanel } from './ResizePanel'
import { elevationBrush, elevationRect, terrainBrush, terrainFill, terrainRect } from './tools'

export const terrainTools: EditorTool[] = [
  terrainBrush,
  terrainRect,
  terrainFill,
  elevationBrush,
  elevationRect,
]

/** Only a panel: adding or removing columns and rows at any edge. */
export const resizeTool: EditorTool = {
  id: 'map-resize',
  group: 'map',
  label: de.editorTerrain.resize.title,
  Icon: ResizeIcon,
  Panel: ResizePanel,
  cursor: 'default',
}
