// The "Hintergrund" tool in the toolbar's "Karte" group (knowledge/features/ai-map-generation.md,
// dm-map-editor.md): generate a background after confirming the job, follow its progress,
// compare versions, pick one or upload the DM's own, and place it on the canvas with handles
// or two-point calibration. Lane: frontend.
import { de } from '../../text/de'
import type { EditorTool } from '../tools'
import { BackgroundPanel } from './BackgroundPanel'
import { BackgroundIcon } from './icons'
import { backgroundToolId } from './ids'
import {
  cursorAt,
  onActivate,
  onDeactivate,
  onPointerDown,
  onPointerLeave,
  onPointerMove,
  onPointerUp,
} from './tool'

export { BackgroundSource, BackgroundToggle } from './BackgroundLayer'

/** The map's background versions in the panel; the picked one's handles on the canvas. */
export const backgroundTool: EditorTool = {
  id: backgroundToolId,
  group: 'map',
  label: de.maps.background.tool,
  Icon: BackgroundIcon,
  Panel: BackgroundPanel,
  cursor: 'default',
  finePointer: true,
  cursorAt,
  onActivate,
  onDeactivate,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerLeave,
}
