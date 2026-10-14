// Features, entrances and the layout checks (lane: features and entrances).
import type { EditorTool } from '../tools'
import { entranceTool } from './entranceTool'
import { featureTool } from './featureTool'
import { selectTool } from './selectTool'

export { ChecksStatus } from './ChecksStatus'

export const featureTools: EditorTool[] = [selectTool, featureTool, entranceTool]
