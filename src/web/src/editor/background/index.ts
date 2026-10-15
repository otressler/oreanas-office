// The "Hintergrund" tool in the toolbar's "Karte" group (knowledge/features/ai-map-generation.md,
// dm-map-editor.md): generate a background after confirming the job, follow its progress,
// compare versions and pick one. Lane: frontend.
import { de } from '../../text/de'
import type { EditorTool } from '../tools'
import { BackgroundPanel } from './BackgroundPanel'
import { BackgroundIcon } from './icons'

/** Only a panel: the map's background versions. */
export const backgroundTool: EditorTool = {
  id: 'map-background',
  group: 'map',
  label: de.maps.background.tool,
  Icon: BackgroundIcon,
  Panel: BackgroundPanel,
  cursor: 'default',
}
