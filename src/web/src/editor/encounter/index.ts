// Encounter mode: creatures on the map (lane: bestiary and placement).
import { de } from '../../text/de'
import type { EditorTool } from '../tools'
import { EncounterIcon } from './icons'
import { EncounterPanel } from './panels'

export { creatureTools } from './creatureTools'
export { EncounterMenu } from './EncounterListPanel'
export { EncounterSummary } from './panels'

/** Only a panel: the encounter itself ("Bereit", start, archive); also when read-only. */
export const encounterTool: EditorTool = {
  id: 'encounter',
  group: 'encounter',
  label: de.encounterEditor.title,
  Icon: EncounterIcon,
  Panel: EncounterPanel,
  cursor: 'default',
}
