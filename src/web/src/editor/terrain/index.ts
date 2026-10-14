// Terrain and elevation tools, and resizing the map (lane: terrain and elevation).
import { de } from '../../text/de'
import type { EditorPanel, EditorTool } from '../tools'
import { ResizePanel } from './ResizePanel'
import { elevationBrush, elevationRect, terrainBrush, terrainFill, terrainRect } from './tools'

export const terrainTools: EditorTool[] = [
  terrainBrush,
  terrainRect,
  terrainFill,
  elevationBrush,
  elevationRect,
]

export const terrainPanels: EditorPanel[] = [
  { id: 'resize', title: de.editorTerrain.resize.title, Component: ResizePanel },
]
