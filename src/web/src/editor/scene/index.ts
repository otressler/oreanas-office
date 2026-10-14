// The map's name, the "Beschreibung" tool (scene, vibe, lighting), the header's export
// and the status bar's sync mark (lane: map list and offline).
import type { ComponentType } from 'react'
import { de } from '../../text/de'
import type { EditorTool } from '../tools'
import { ExportButton, SyncMarkItem } from './HeaderItems'
import { DescriptionIcon } from './icons'
import { ScenePanel } from './ScenePanel'

export { MapNameField } from './MapName'

/** Only a panel: the free texts for the image prompt. */
export const descriptionTool: EditorTool = {
  id: 'map-description',
  group: 'map',
  label: de.maps.scene.tool,
  Icon: DescriptionIcon,
  Panel: ScenePanel,
  cursor: 'default',
}

/** The export button, for the editor header. */
export const sceneHeaderItems: ComponentType[] = [ExportButton]

/** "Nur auf diesem Gerät" and the other sync marks, for the editor's status bar. */
export const sceneStatusItems: ComponentType[] = [SyncMarkItem]
