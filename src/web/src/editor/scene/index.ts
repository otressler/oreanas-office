// Name, scene, vibe and lighting, and the header's file and sync items (lane: map list
// and offline).
import type { ComponentType } from 'react'
import { de } from '../../text/de'
import type { EditorPanel } from '../tools'
import { ExportButton, SyncMarkItem } from './HeaderItems'
import { ScenePanel } from './ScenePanel'

export const scenePanels: EditorPanel[] = [
  { id: 'scene', title: de.maps.scene.panel, Component: ScenePanel },
]

/** Small controls in the editor header, e.g. the export button and the sync mark. */
export const sceneHeaderItems: ComponentType[] = [SyncMarkItem, ExportButton]
