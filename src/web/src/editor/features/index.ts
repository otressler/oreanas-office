// Features, entrances and the layout checks (lane: features and entrances).
import { de } from '../../text/de'
import type { EditorPanel, EditorTool } from '../tools'
import { entranceTool } from './entranceTool'
import { featureTool } from './featureTool'
import { ChecksPanel } from './panels'
import { selectTool } from './selectTool'

export const featureTools: EditorTool[] = [selectTool, featureTool, entranceTool]

export const featurePanels: EditorPanel[] = [
  { id: 'checks', title: de.editorFeatures.checks.title, Component: ChecksPanel },
]
