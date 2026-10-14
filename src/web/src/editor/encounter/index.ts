// Encounter mode: creatures on the map (lane: bestiary and placement).
import { de } from '../../text/de'
import type { EditorPanel } from '../tools'
import { EncounterListPanel } from './EncounterListPanel'
import { EncounterPanel } from './panels'

export { creatureTools } from './creatureTools'

/** Shown in map mode below the scene panel (the "Begegnungen" list). */
export const encounterPanels: EditorPanel[] = [
  { id: 'encounters', title: de.encounterEditor.listTitle, Component: EncounterListPanel },
]

/** Shown in encounter mode below the active tool's panel. */
export const encounterModePanels: EditorPanel[] = [
  { id: 'encounter', title: de.encounterEditor.title, Component: EncounterPanel },
]
