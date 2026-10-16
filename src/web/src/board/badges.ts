// Status badges on tokens (knowledge/features/statuses.md, "Icons"): up to three along the
// token's upper edge, each the status icon on a small dark disc, "+N" for the rest, and a
// level as a small number. A custom status without an icon shows its first letter. On a
// token drawn too small for a row, one disc: the icon of a single status, else the count.
import type { BoardTokenStatus, StatusDefinition } from '../api/types'
import { statusLetter } from '../statuses/names'
import { PARCHMENT, TABLE_COLOR } from './palette'

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"

/** At most this many icons in a row; more show as "+N". */
export const MAX_BADGES = 3

/** The smallest disc radius in CSS pixels: an icon made for 20 px stays readable. */
export const BADGE_MIN_RADIUS_PX = 10

/** Below this token radius in CSS pixels, a row doesn't fit: one disc instead. */
export const BADGE_ROW_MIN_TOKEN_PX = 16

export type BadgeSlot =
  | { kind: 'icon'; x: number; y: number; status: BoardTokenStatus }
  | { kind: 'count'; x: number; y: number; text: string }

export interface BadgeLayout {
  /** Disc radius in world units. */
  radius: number
  slots: BadgeSlot[]
}

/**
 * Where a token's status badges go, in world units. `cx`, `cy` and `r` are the token's
 * middle and radius; `rightLimit`, if set, is the x the row must end before (the stack
 * badge's left edge), so the row slides left instead of covering it.
 */
export function badgeLayout(
  statuses: readonly BoardTokenStatus[],
  cx: number,
  cy: number,
  r: number,
  cssScale: number,
  rightLimit?: number,
): BadgeLayout {
  if (statuses.length === 0) return { radius: 0, slots: [] }
  const radius = Math.max(BADGE_MIN_RADIUS_PX / cssScale, r * 0.26)
  const y = cy - r
  if (r * cssScale < BADGE_ROW_MIN_TOKEN_PX) {
    const x = cx
    const slot: BadgeSlot =
      statuses.length === 1
        ? { kind: 'icon', x, y, status: statuses[0]! }
        : { kind: 'count', x, y, text: String(statuses.length) }
    return { radius, slots: [slot] }
  }
  const shown = statuses.slice(0, MAX_BADGES)
  const more = statuses.length - shown.length
  const count = shown.length + (more > 0 ? 1 : 0)
  const step = radius * 1.9
  const width = (count - 1) * step
  let left = cx - width / 2
  if (rightLimit !== undefined) left = Math.min(left, rightLimit - radius - width)
  const slots: BadgeSlot[] = shown.map((status, i) => ({
    kind: 'icon',
    x: left + i * step,
    y,
    status,
  }))
  if (more > 0) slots.push({ kind: 'count', x: left + shown.length * step, y, text: `+${more}` })
  return { radius, slots }
}

/** What badges need to look statuses up: definitions by id and loaded icons by URL. */
export interface StatusLook {
  definitions: ReadonlyMap<string, StatusDefinition>
  icons: ReadonlyMap<string, CanvasImageSource>
}

function disc(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, px: number) {
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fillStyle = TABLE_COLOR
  ctx.fill()
  ctx.strokeStyle = 'rgba(236, 230, 216, 0.6)'
  ctx.lineWidth = Math.max(px, radius * 0.1)
  ctx.stroke()
}

function centredText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string,
) {
  ctx.font = `700 ${size}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = color
  ctx.fillText(text, x, y + size * 0.05)
}

/** The image scaled to fit a square of side 2·half around (x, y), keeping its shape. */
function drawContained(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  x: number,
  y: number,
  half: number,
) {
  const sized = image as {
    naturalWidth?: number
    naturalHeight?: number
    width?: unknown
    height?: unknown
  }
  const w = sized.naturalWidth || (typeof sized.width === 'number' ? sized.width : 0)
  const h = sized.naturalHeight || (typeof sized.height === 'number' ? sized.height : 0)
  if (!(w > 0 && h > 0)) return
  const k = (2 * half) / Math.max(w, h)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, x - (w * k) / 2, y - (h * k) / 2, w * k, h * k)
}

/** Draws a token's badges as laid out by badgeLayout. */
export function drawBadges(
  ctx: CanvasRenderingContext2D,
  layout: BadgeLayout,
  look: StatusLook,
  cssScale: number,
): void {
  const { radius, slots } = layout
  const px = 1 / cssScale
  for (const slot of slots) {
    if (slot.kind === 'count') {
      disc(ctx, slot.x, slot.y, radius, px)
      centredText(
        ctx,
        slot.text,
        slot.x,
        slot.y,
        radius * (slot.text.length > 2 ? 0.85 : 1.05),
        PARCHMENT,
      )
      continue
    }
    const definition = look.definitions.get(slot.status.statusId)
    disc(ctx, slot.x, slot.y, radius, px)
    const icon = definition?.iconUrl ? look.icons.get(definition.iconUrl) : undefined
    if (icon) drawContained(ctx, icon, slot.x, slot.y, radius * 0.78)
    else {
      const letter = definition ? statusLetter(definition) : '?'
      centredText(ctx, letter, slot.x, slot.y, radius * 1.15, PARCHMENT)
    }
    if (slot.status.level !== null && slot.status.level !== undefined) {
      const lx = slot.x + radius * 0.72
      const ly = slot.y + radius * 0.72
      const lr = Math.max(radius * 0.5, 6 * px)
      ctx.beginPath()
      ctx.arc(lx, ly, lr, 0, Math.PI * 2)
      ctx.fillStyle = PARCHMENT
      ctx.fill()
      ctx.strokeStyle = TABLE_COLOR
      ctx.lineWidth = Math.max(px, lr * 0.15)
      ctx.stroke()
      centredText(ctx, String(slot.status.level), lx, ly, lr * 1.45, TABLE_COLOR)
    }
  }
}
