// Every tool and side panel of the map editor, in toolbar and panel order. Owned by
// the integrator; each lane fills its own module's lists.
import { featurePanels, featureTools } from './features'
import { scenePanels, sceneHeaderItems } from './scene'
import { terrainPanels, terrainTools } from './terrain'
import type { EditorPanel, EditorTool, ToolGroup } from './tools'

export { PreviewPane } from './preview'

const GROUP_ORDER: ToolGroup[] = ['terrain', 'elevation', 'features', 'entrances']

export const editorTools: EditorTool[] = [...terrainTools, ...featureTools].sort(
  (a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group),
)

export const editorPanels: EditorPanel[] = [...scenePanels, ...terrainPanels, ...featurePanels]

export const editorHeaderItems = sceneHeaderItems

/** The tool a newly opened editor starts with: the first one. */
export const DEFAULT_TOOL_ID = editorTools[0]?.id ?? ''

export function findTool(id: string): EditorTool | undefined {
  return editorTools.find((tool) => tool.id === id)
}
