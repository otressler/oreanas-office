// QR codes for the join link (knowledge/features/spectator-view.md, "Joining a session"),
// made with the installed qrcode-generator package and drawn as one SVG path.
import qrcode from 'qrcode-generator'
import { joinPath } from '../sessions/paths'

/** Light squares around the code that scanners need. */
export const QUIET_ZONE = 4

export interface QrImage {
  /** Modules per side, the quiet zone included. */
  size: number
  /** SVG path data of the dark modules, one unit per module. */
  path: string
}

/** The QR code of `text`; error correction level M (about 15%). */
export function qrImage(text: string): QrImage {
  const code = qrcode(0, 'M')
  code.addData(text)
  code.make()
  const count = code.getModuleCount()
  let path = ''
  for (let row = 0; row < count; row++) {
    for (let column = 0; column < count; column++) {
      if (code.isDark(row, column)) {
        path += `M${column + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`
      }
    }
  }
  return { size: count + 2 * QUIET_ZONE, path }
}

/** The link the QR code holds: the join page, with the session for "Nur zuschauen". */
export function joinLink(origin: string, joinCode: string, sessionId?: string): string {
  return `${origin}${joinPath(joinCode, sessionId)}`
}
