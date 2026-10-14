// Every tool of the map editor, in toolbar order, and the items of its header and status
// bar. Owned by the integrator; each lane fills its own module's lists.
//
// The layout has one rule per region: the toolbar picks what you work on, the side panel
// shows only the active tool's panel, the header holds what belongs to the whole map or
// encounter, and the status bar shows live information.
import { backgroundTool } from './background'
import { creatureTools, EncounterMenu, encounterTool } from './encounter'
import { ChecksStatus, featureTools } from './features'
import { descriptionTool, sceneHeaderItems, sceneStatusItems } from './scene'
import { SyncStatusItem } from '../sync'
import { resizeTool, terrainTools } from './terrain'
import type { EditorTool, ToolGroup } from './tools'

export { PreviewPane } from './preview'

const GROUP_ORDER: ToolGroup[] = ['terrain', 'elevation', 'features', 'entrances', 'map']

export const editorTools: EditorTool[] = [
  ...terrainTools,
  ...featureTools,
  descriptionTool,
  backgroundTool,
  resizeTool,
].sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group))

/** The tools of encounter mode; a read-only encounter has only the encounter itself. */
export const encounterModeTools: EditorTool[] = [...creatureTools, encounterTool]
export const readOnlyEncounterTools: EditorTool[] = [encounterTool]

/** Shown in every mode of the editor: the sync status. */
export const editorHeaderItems = [SyncStatusItem]

/** Shown in map mode only: the encounters, then the export. */
export const mapHeaderItems = [EncounterMenu, ...sceneHeaderItems]

/** The status bar in map mode: next to the save state, "Nur auf diesem Gerät". */
export const mapStatusMarks = [...sceneStatusItems]

/** The status bar in map mode, at the end: the count of layout problems. */
export const mapStatusItems = [ChecksStatus]

/** The tool a newly opened editor starts with: the first one. */
export const DEFAULT_TOOL_ID = editorTools[0]?.id ?? ''

export function findTool(id: string): EditorTool | undefined {
  return editorTools.find((tool) => tool.id === id)
}
