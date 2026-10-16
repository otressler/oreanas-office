// Drawing pings, arrows and the "Meine Figur" pulse (knowledge/features/pings-and-arrows.md,
// "What everyone sees"; player-extras.md). World-space canvas calls on the board's ping
// layer, above the tokens; sizes that must stay readable are in CSS pixels (÷ cssScale).
// With reduced motion, rings stand still and arrows vanish without fading.
import { footprint, type GridPoint } from './geometry'
import { ARROW_MS, PING_MS, pingExpired, type ShownPing } from './pings'
import { CELL, type Point } from './viewport'

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"

/** One ring's trip outwards. */
export const RING_PERIOD_MS = 1_000
/** How long an arrow takes to fade at the end of its time. */
export const ARROW_FADE_MS = 1_000
/** How long a ping takes to fade at the end of its time. */
const PING_FADE_MS = 400
/** The "Meine Figur" pulse. */
export const PULSE_MS = 900

/** Where a token is drawn now (slides included), for pings that follow it. */
export interface PlacedToken {
  x: number
  y: number
  size: Parameters<typeof footprint>[0]
}

export type TokenLookup = (tokenId: string) => PlacedToken | undefined

/** A cell's middle in world units. */
export const cellCentre = (cell: GridPoint): Point => ({
  x: (cell.x + 0.5) * CELL,
  y: (cell.y + 0.5) * CELL,
})

/** A token's middle and radius in world units. */
export function tokenCircle(token: PlacedToken): Point & { r: number } {
  const n = footprint(token.size)
  return { x: (token.x + n / 2) * CELL, y: (token.y + n / 2) * CELL, r: n * CELL * 0.42 }
}

/**
 * The points of a ping in world units: where a marker points (`target`) and what must be on
 * screen for it to count as seen (`visible`). Null for a token ping or arrow whose token
 * isn't on the board.
 */
export function pingPoints(
  ping: ShownPing,
  tokenOf: TokenLookup,
): { target: Point; visible: Point[] } | null {
  if (ping.kind === 'cell') {
    const c = cellCentre(ping.cell)
    return { target: c, visible: [c] }
  }
  if (ping.kind === 'token') {
    const token = tokenOf(ping.tokenId)
    if (!token) return null
    const { x, y } = tokenCircle(token)
    return { target: { x, y }, visible: [{ x, y }] }
  }
  const from = arrowStart(ping, tokenOf)
  if (!from) return null
  const to = cellCentre(ping.to)
  return { target: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, visible: [from, to] }
}

function arrowStart(
  ping: Extract<ShownPing, { kind: 'arrow' }>,
  tokenOf: TokenLookup,
): (Point & { r: number }) | null {
  if ('cell' in ping.from) return { ...cellCentre(ping.from.cell), r: 0 }
  const token = tokenOf(ping.from.tokenId)
  return token ? tokenCircle(token) : null
}

/** How opaque a ping is at `now`: fading out at the end of its time (not with reduced motion). */
export function pingOpacity(ping: ShownPing, now: number, motion: boolean): number {
  if (pingExpired(ping, now)) return 0
  if (ping.kind === 'arrow' && !ping.done) return 1
  if (!motion) return 1
  const left = (ping.kind === 'arrow' ? ARROW_MS : PING_MS) - (now - ping.at)
  const fade = ping.kind === 'arrow' ? ARROW_FADE_MS : PING_FADE_MS
  return Math.max(0, Math.min(1, left / fade))
}

/** Whether a ping changes from frame to frame (pulsing or fading) at `now`. */
export function pingAnimates(ping: ShownPing, now: number, motion: boolean): boolean {
  if (!motion || pingExpired(ping, now)) return false
  if (ping.kind !== 'arrow') return true
  return ping.done && now - ping.at >= ARROW_MS - ARROW_FADE_MS
}

const SHADOW = 'rgba(10, 11, 14, 0.75)'

function ring(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  width: number,
  px: number,
) {
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.strokeStyle = SHADOW
  ctx.lineWidth = width + 2.5 * px
  ctx.stroke()
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.stroke()
}

/** The person's name, centred under (or above) (x, y), legible on any ground. */
function nameTag(
  ctx: CanvasRenderingContext2D,
  name: string,
  x: number,
  y: number,
  color: string,
  px: number,
  baseline: CanvasTextBaseline = 'top',
) {
  const size = 12 * px
  ctx.font = `700 ${size}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = baseline
  ctx.lineJoin = 'round'
  ctx.strokeStyle = 'rgba(10, 11, 14, 0.9)'
  ctx.lineWidth = 3.5 * px
  ctx.strokeText(name, x, y)
  ctx.fillStyle = color
  ctx.fillText(name, x, y)
}

/** Three rings pulsing outwards from the cell, the name under it. */
function drawCellPing(
  ctx: CanvasRenderingContext2D,
  ping: Extract<ShownPing, { kind: 'cell' }>,
  now: number,
  motion: boolean,
  px: number,
) {
  const { x, y } = cellCentre(ping.cell)
  const width = Math.max(CELL * 0.05, 3 * px)
  for (let k = 0; k < 3; k++) {
    const phase = motion ? ((now - ping.at) / RING_PERIOD_MS + k / 3) % 1 : (k + 1) / 3.5
    ctx.globalAlpha = motion ? 1 - phase : 1 - k * 0.25
    ring(ctx, x, y, CELL * (0.12 + 0.75 * phase), ping.color, width, px)
  }
  ctx.globalAlpha = 1
  ctx.beginPath()
  ctx.arc(x, y, Math.max(CELL * 0.07, 3 * px), 0, Math.PI * 2)
  ctx.fillStyle = ping.color
  ctx.fill()
  nameTag(ctx, ping.name, x, (ping.cell.y + 1) * CELL + 3 * px, ping.color, px)
}

/** A ring pulsing around the token, the name under it. */
function drawTokenPing(
  ctx: CanvasRenderingContext2D,
  ping: ShownPing,
  token: PlacedToken,
  now: number,
  motion: boolean,
  px: number,
) {
  const c = tokenCircle(token)
  const width = Math.max(CELL * 0.06, 3 * px)
  ring(ctx, c.x, c.y, c.r + width, ping.color, width, px)
  if (motion) {
    const phase = ((now - ping.at) / RING_PERIOD_MS) % 1
    ctx.globalAlpha = 1 - phase
    ring(ctx, c.x, c.y, c.r * (1.12 + 0.5 * phase), ping.color, width * 0.8, px)
    ctx.globalAlpha = 1
  }
  nameTag(ctx, ping.name, c.x, c.y + c.r + width * 2 + 2 * px, ping.color, px)
}

/** A thick arrow from the start (a cell's middle, or the token's edge) to the cell's middle. */
function drawPingArrow(
  ctx: CanvasRenderingContext2D,
  ping: Extract<ShownPing, { kind: 'arrow' }>,
  start: Point & { r: number },
  px: number,
) {
  const end = cellCentre(ping.to)
  const length = Math.hypot(end.x - start.x, end.y - start.y)
  if (length <= start.r + CELL * 0.1) return
  const [ux, uy] = [(end.x - start.x) / length, (end.y - start.y) / length]
  const width = Math.max(CELL * 0.12, 5 * px)
  const head = Math.min(width * 3, length - start.r)
  const [sx, sy] = [start.x + ux * start.r, start.y + uy * start.r]
  const [bx, by] = [end.x - ux * head, end.y - uy * head]

  const shaft = () => {
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.lineTo(bx, by)
  }
  const tip = () => {
    ctx.beginPath()
    ctx.moveTo(end.x + ux * width * 0.3, end.y + uy * width * 0.3)
    ctx.lineTo(bx - uy * head * 0.62, by + ux * head * 0.62)
    ctx.lineTo(bx + uy * head * 0.62, by - ux * head * 0.62)
    ctx.closePath()
  }
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = SHADOW
  ctx.lineWidth = width + 3 * px
  shaft()
  ctx.stroke()
  tip()
  ctx.stroke()
  ctx.strokeStyle = ping.color
  ctx.fillStyle = ping.color
  ctx.lineWidth = width
  shaft()
  ctx.stroke()
  tip()
  ctx.fill()
  // The name at the tail: under it, or above it when the arrow points down.
  const below = uy <= 0.3
  const gap = width / 2 + 4 * px
  nameTag(ctx, ping.name, sx, below ? sy + gap : sy - gap, ping.color, px, below ? 'top' : 'bottom')
}

/** Draws every shown ping that hasn't run out, in the order given (later on top). */
export function drawPings(
  ctx: CanvasRenderingContext2D,
  pings: readonly ShownPing[],
  tokenOf: TokenLookup,
  { cssScale, now, motion }: { cssScale: number; now: number; motion: boolean },
): void {
  const px = 1 / cssScale
  ctx.save()
  for (const ping of pings) {
    const opacity = pingOpacity(ping, now, motion)
    if (opacity <= 0) continue
    ctx.save()
    ctx.globalAlpha = opacity
    if (ping.kind === 'cell') drawCellPing(ctx, ping, now, motion, px)
    else if (ping.kind === 'token') {
      const token = tokenOf(ping.tokenId)
      if (token) drawTokenPing(ctx, ping, token, now, motion, px)
    } else {
      // The own arrow being drawn is slightly see-through until it is let go.
      if (!ping.done) ctx.globalAlpha = 0.85
      const start = arrowStart(ping, tokenOf)
      if (start) drawPingArrow(ctx, ping, start, px)
    }
    ctx.restore()
  }
  ctx.restore()
}

/** "Meine Figur": one ring in the token's colour, growing and fading (still with reduced motion). */
export function drawPulse(
  ctx: CanvasRenderingContext2D,
  token: PlacedToken,
  color: string,
  elapsed: number,
  { cssScale, motion }: { cssScale: number; motion: boolean },
): void {
  const t = Math.min(1, Math.max(0, elapsed / PULSE_MS))
  if (t >= 1) return
  const px = 1 / cssScale
  const c = tokenCircle(token)
  const width = Math.max(CELL * 0.07, 4 * px)
  ctx.save()
  ctx.globalAlpha = motion ? 1 - t : 1
  ring(ctx, c.x, c.y, motion ? c.r * (1.05 + 0.9 * t) : c.r * 1.3, color, width, px)
  ctx.restore()
}
