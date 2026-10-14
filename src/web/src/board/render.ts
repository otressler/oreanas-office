// Canvas drawing for the board, in plain 2D canvas calls inside a few Konva shapes
// (no Konva node per cell). World-space passes draw in world units (CELL per cell);
// the grid and labels draw in device pixels so lines stay one pixel wide and crisp.
import type { BoardToken } from '../api/types'
import { footprint } from './geometry'
import {
  CANDLE_STRONG,
  ENTRANCE_COLORS,
  FEATURE_COLORS,
  HIGHLIGHT_COLORS,
  PARCHMENT,
  PATTERN_COLORS,
  TABLE_COLOR,
  TERRAIN_COLORS,
  ringColor,
  tokenFill,
  tokenLetter,
} from './palette'
import type { HighlightScene, MapScene, SceneEntrance, SceneFeature, Segment } from './scene'
import { CELL } from './viewport'

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"

/** The world → device-pixel transform of a canvas (no rotation or skew on the board). */
export interface Affine {
  a: number
  d: number
  e: number
  f: number
}

/** A range of cells: x0 ≤ x < x1, y0 ≤ y < y1. */
export interface CellRect {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** The cells a canvas of this size shows, with one cell to spare, within the map. */
export function visibleCells(
  m: Affine,
  canvasWidth: number,
  canvasHeight: number,
  width: number,
  height: number,
): CellRect {
  const cell = (device: number, scale: number, offset: number) => (device - offset) / scale / CELL
  const clamp = (v: number, max: number) => Math.min(max, Math.max(0, v))
  return {
    x0: clamp(Math.floor(cell(0, m.a, m.e)) - 1, width),
    y0: clamp(Math.floor(cell(0, m.d, m.f)) - 1, height),
    x1: clamp(Math.ceil(cell(canvasWidth, m.a, m.e)) + 1, width),
    y1: clamp(Math.ceil(cell(canvasHeight, m.d, m.f)) + 1, height),
  }
}

const inView = (view: CellRect, x: number, y: number) =>
  x >= view.x0 && x < view.x1 && y >= view.y0 && y < view.y1

/** Whether a rectangle of cells overlaps the view. */
const overlaps = (view: CellRect, x: number, y: number, w: number, h: number) =>
  x < view.x1 && x + w > view.x0 && y < view.y1 && y + h > view.y0

function cellsPath(ctx: CanvasRenderingContext2D, cells: number[], view: CellRect): boolean {
  ctx.beginPath()
  let any = false
  for (let i = 0; i < cells.length; i += 2) {
    const x = cells[i]!
    const y = cells[i + 1]!
    if (!inView(view, x, y)) continue
    ctx.rect(x * CELL, y * CELL, CELL, CELL)
    any = true
  }
  return any
}

function fillCells(ctx: CanvasRenderingContext2D, cells: number[], view: CellRect, color: string) {
  if (!cellsPath(ctx, cells, view)) return
  ctx.fillStyle = color
  ctx.fill()
}

function strokeSegments(
  ctx: CanvasRenderingContext2D,
  segments: Segment[],
  view: CellRect,
  color: string,
  lineWidth: number,
) {
  ctx.beginPath()
  for (const s of segments) {
    if (!overlaps(view, s.x1, s.y1, s.x2 - s.x1 + 1, s.y2 - s.y1 + 1)) continue
    ctx.moveTo(s.x1 * CELL, s.y1 * CELL)
    ctx.lineTo(s.x2 * CELL, s.y2 * CELL)
  }
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.lineCap = 'round'
  ctx.stroke()
}

/**
 * Elevation steps as two thin bands along the edge: a lit one on the higher cell and
 * a shadow on the lower one, so a rise reads as a terrace, not as another grid line.
 */
function drawSteps(ctx: CanvasRenderingContext2D, steps: MapScene['steps'], view: CellRect) {
  const band = CELL * 0.06
  for (const [segments, higherA] of [
    [steps.higherA, true],
    [steps.higherB, false],
  ] as const) {
    const light = new Path2D()
    const shadow = new Path2D()
    for (const s of segments) {
      if (!overlaps(view, s.x1, s.y1, s.x2 - s.x1 + 1, s.y2 - s.y1 + 1)) continue
      const x = s.x1 * CELL
      const y = s.y1 * CELL
      // Side a lies above (horizontal edge) or left (vertical edge) of the line.
      if (s.y1 === s.y2) {
        const len = (s.x2 - s.x1) * CELL
        ;(higherA ? light : shadow).rect(x, y - band, len, band)
        ;(higherA ? shadow : light).rect(x, y, len, band)
      } else {
        const len = (s.y2 - s.y1) * CELL
        ;(higherA ? light : shadow).rect(x - band, y, band, len)
        ;(higherA ? shadow : light).rect(x, y, band, len)
      }
    }
    ctx.fillStyle = PATTERN_COLORS.stepLight
    ctx.fill(light)
    ctx.fillStyle = PATTERN_COLORS.stepShadow
    ctx.fill(shadow)
  }
}

/** Diagonal hatching over difficult terrain, continuous across neighbouring cells. */
function drawHatching(ctx: CanvasRenderingContext2D, cells: number[], view: CellRect) {
  if (!cellsPath(ctx, cells, view)) return
  ctx.save()
  ctx.clip()
  const left = view.x0 * CELL
  const top = view.y0 * CELL
  const w = (view.x1 - view.x0) * CELL
  const h = (view.y1 - view.y0) * CELL
  const spacing = CELL / 4
  ctx.beginPath()
  // Lines from bottom-left to top-right, anchored to world 0 so tiles line up.
  const first = Math.floor((left + top) / spacing) * spacing
  for (let c = first; c <= left + top + w + h; c += spacing) {
    ctx.moveTo(c - top, top)
    ctx.lineTo(c - top - h, top + h)
  }
  ctx.strokeStyle = PATTERN_COLORS.hatch
  ctx.lineWidth = CELL * 0.035
  ctx.stroke()
  ctx.restore()
}

/** Two gentle wave lines through each row of water. */
function drawWaves(ctx: CanvasRenderingContext2D, scene: MapScene, view: CellRect) {
  const wavelength = CELL / 2
  const amplitude = CELL * 0.055
  ctx.beginPath()
  for (const run of scene.waterRuns) {
    if (run.y < view.y0 || run.y >= view.y1) continue
    const x0 = Math.max(run.x0, view.x0)
    const x1 = Math.min(run.x1, view.x1)
    if (x0 >= x1) continue
    for (const [row, phase] of [
      [0.32, 0],
      [0.74, 0.5],
    ] as const) {
      const y = (run.y + row) * CELL
      // Inset from the run's ends so waves don't touch the bank.
      const start = x0 * CELL + (x0 === run.x0 ? CELL * 0.12 : 0) + phase * wavelength
      const end = x1 * CELL - (x1 === run.x1 ? CELL * 0.12 : 0)
      ctx.moveTo(start, y)
      let up = true
      for (let x = start; x + wavelength / 2 <= end + 0.01; x += wavelength / 2) {
        ctx.quadraticCurveTo(
          x + wavelength / 4,
          y + (up ? -amplitude : amplitude),
          x + wavelength / 2,
          y,
        )
        up = !up
      }
    }
  }
  ctx.strokeStyle = PATTERN_COLORS.wave
  ctx.lineWidth = CELL * 0.035
  ctx.lineCap = 'round'
  ctx.stroke()
}

/** Brick courses on walls: two per cell, joints offset by half a cell. */
function drawMasonry(ctx: CanvasRenderingContext2D, cells: number[], view: CellRect) {
  ctx.beginPath()
  for (let i = 0; i < cells.length; i += 2) {
    const x = cells[i]!
    const y = cells[i + 1]!
    if (!inView(view, x, y)) continue
    const px = x * CELL
    const py = y * CELL
    ctx.moveTo(px, py + CELL / 2)
    ctx.lineTo(px + CELL, py + CELL / 2)
    ctx.moveTo(px, py)
    ctx.lineTo(px + CELL, py)
    ctx.moveTo(px + CELL / 2, py)
    ctx.lineTo(px + CELL / 2, py + CELL / 2)
    ctx.moveTo(px, py + CELL / 2)
    ctx.lineTo(px, py + CELL)
  }
  ctx.strokeStyle = PATTERN_COLORS.mortar
  ctx.lineWidth = CELL * 0.05
  ctx.lineCap = 'butt'
  ctx.stroke()
}

/** A band on the outer edge and an arrow pointing out of the map, per entrance cell. */
function drawEntrance(
  ctx: CanvasRenderingContext2D,
  { side, cells }: SceneEntrance,
  view: CellRect,
) {
  const band = CELL * 0.16
  const arm = CELL * 0.2
  for (const { x, y } of cells) {
    if (!inView(view, x, y)) continue
    const px = x * CELL
    const py = y * CELL
    const cx = px + CELL / 2
    const cy = py + CELL / 2
    ctx.fillStyle = ENTRANCE_COLORS.band
    if (side === 'left') ctx.fillRect(px, py, band, CELL)
    else if (side === 'right') ctx.fillRect(px + CELL - band, py, band, CELL)
    else if (side === 'top') ctx.fillRect(px, py, CELL, band)
    else if (side === 'bottom') ctx.fillRect(px, py + CELL - band, CELL, band)
    else ctx.fillRect(px, py, CELL, CELL)
    if (!side) continue
    // A chevron whose tip points at the edge, i.e. out of the map.
    const [dx, dy] = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] }[side]
    const tipX = cx + dx * arm * 0.6
    const tipY = cy + dy * arm * 0.6
    ctx.beginPath()
    ctx.moveTo(tipX - dx * arm + dy * arm, tipY - dy * arm + dx * arm)
    ctx.lineTo(tipX, tipY)
    ctx.lineTo(tipX - dx * arm - dy * arm, tipY - dy * arm - dx * arm)
    ctx.strokeStyle = ENTRANCE_COLORS.arrow
    ctx.lineWidth = CELL * 0.08
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
  }
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

/** Planks across a walkable feature, perpendicular to its long side. */
function planks(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  spacing: number,
  color: string,
) {
  ctx.beginPath()
  if (w >= h) {
    for (let px = x + spacing; px < x + w - 1; px += spacing) {
      ctx.moveTo(px, y)
      ctx.lineTo(px, y + h)
    }
  } else {
    for (let py = y + spacing; py < y + h - 1; py += spacing) {
      ctx.moveTo(x, py)
      ctx.lineTo(x + w, py)
    }
  }
  ctx.strokeStyle = color
  ctx.lineWidth = CELL * 0.03
  ctx.stroke()
}

function drawFeature(ctx: CanvasRenderingContext2D, { feature, style }: SceneFeature) {
  const x = feature.x * CELL
  const y = feature.y * CELL
  const w = feature.w * CELL
  const h = feature.h * CELL
  const outline = CELL * 0.045

  if (style === 'bridge') {
    const across = w >= h
    // The deck leaves a little gap along the long sides for the ropes.
    const inset = CELL * 0.1
    const [dx, dy, dw, dh] = across
      ? [x, y + inset, w, h - 2 * inset]
      : [x + inset, y, w - 2 * inset, h]
    ctx.fillStyle = FEATURE_COLORS.shadow
    ctx.fillRect(dx + CELL * 0.05, dy + CELL * 0.1, dw, dh)
    ctx.fillStyle = FEATURE_COLORS.plank
    ctx.fillRect(dx, dy, dw, dh)
    planks(ctx, dx, dy, dw, dh, CELL / 4, FEATURE_COLORS.woodDark)
    ctx.beginPath()
    if (across) {
      ctx.moveTo(x, dy)
      ctx.lineTo(x + w, dy)
      ctx.moveTo(x, dy + dh)
      ctx.lineTo(x + w, dy + dh)
    } else {
      ctx.moveTo(dx, y)
      ctx.lineTo(dx, y + h)
      ctx.moveTo(dx + dw, y)
      ctx.lineTo(dx + dw, y + h)
    }
    ctx.strokeStyle = FEATURE_COLORS.rope
    ctx.lineWidth = CELL * 0.06
    ctx.lineCap = 'round'
    ctx.stroke()
    return
  }

  if (style === 'door') {
    const inset = CELL * 0.1
    ctx.fillStyle = FEATURE_COLORS.wood
    ctx.fillRect(x + inset, y + inset, w - 2 * inset, h - 2 * inset)
    planks(
      ctx,
      x + inset,
      y + inset,
      w - 2 * inset,
      h - 2 * inset,
      CELL / 5,
      FEATURE_COLORS.woodDark,
    )
    ctx.strokeStyle = FEATURE_COLORS.woodDark
    ctx.lineWidth = outline
    ctx.strokeRect(x + inset, y + inset, w - 2 * inset, h - 2 * inset)
    return
  }

  if (style === 'stairs') {
    ctx.fillStyle = FEATURE_COLORS.stairs
    ctx.fillRect(x, y, w, h)
    planks(ctx, x, y, w, h, CELL / 4, FEATURE_COLORS.outline)
    return
  }

  if (style === 'surface') {
    ctx.fillStyle = FEATURE_COLORS.surface
    ctx.fillRect(x, y, w, h)
    ctx.setLineDash([CELL * 0.12, CELL * 0.08])
    ctx.strokeStyle = FEATURE_COLORS.surfaceLine
    ctx.lineWidth = CELL * 0.03
    ctx.strokeRect(x + CELL * 0.06, y + CELL * 0.06, w - CELL * 0.12, h - CELL * 0.12)
    ctx.setLineDash([])
    return
  }

  // Blocking: a solid block with a shadow, so it reads as standing up from the ground.
  const inset = CELL * 0.07
  const bx = x + inset
  const by = y + inset
  const bw = w - 2 * inset
  const bh = h - 2 * inset
  // Square-ish even for trees: round shapes on the board are tokens.
  const radius = style === 'tree' ? Math.min(bw, bh) * 0.28 : CELL * 0.1
  roundedRect(ctx, bx + CELL * 0.05, by + CELL * 0.09, bw, bh, radius)
  ctx.fillStyle = FEATURE_COLORS.shadow
  ctx.fill()

  const body = {
    stone: FEATURE_COLORS.stone,
    tree: FEATURE_COLORS.tree,
    wood: FEATURE_COLORS.wood,
    well: FEATURE_COLORS.stone,
  }[style]
  roundedRect(ctx, bx, by, bw, bh, radius)
  ctx.fillStyle = body
  ctx.fill()

  if (style === 'tree') {
    // A lighter crown towards the light.
    ctx.beginPath()
    ctx.ellipse(bx + bw * 0.42, by + bh * 0.4, bw * 0.28, bh * 0.28, 0, 0, Math.PI * 2)
    ctx.fillStyle = FEATURE_COLORS.treeLight
    ctx.fill()
  } else if (style === 'wood') {
    planks(ctx, bx, by, bw, bh, CELL / 4, FEATURE_COLORS.woodDark)
  } else if (style === 'well') {
    ctx.beginPath()
    ctx.ellipse(bx + bw / 2, by + bh / 2, bw * 0.3, bh * 0.3, 0, 0, Math.PI * 2)
    ctx.fillStyle = TERRAIN_COLORS.water
    ctx.fill()
    ctx.strokeStyle = FEATURE_COLORS.outline
    ctx.lineWidth = outline
    ctx.stroke()
  } else {
    // Stone: a light bevel on the top and left edges.
    ctx.beginPath()
    ctx.moveTo(bx + radius, by + outline)
    ctx.lineTo(bx + bw - radius, by + outline)
    ctx.moveTo(bx + outline, by + radius)
    ctx.lineTo(bx + outline, by + bh - radius)
    ctx.strokeStyle = FEATURE_COLORS.bevel
    ctx.lineWidth = outline
    ctx.lineCap = 'round'
    ctx.stroke()
  }

  roundedRect(ctx, bx, by, bw, bh, radius)
  ctx.strokeStyle = FEATURE_COLORS.outline
  ctx.lineWidth = outline
  ctx.stroke()
}

/**
 * Terrain, its patterns, elevation, rims, entrances and features: everything that
 * changes only with the map. `ctx` must already be in world units.
 */
export function drawMap(ctx: CanvasRenderingContext2D, scene: MapScene, view: CellRect): void {
  ctx.save()
  // One base fill under every cell, so neighbouring colour groups never leave seams.
  fillCells(ctx, scene.baseCells, view, TERRAIN_COLORS.floor)
  for (const group of scene.fills) fillCells(ctx, group.cells, view, group.color)
  drawHatching(ctx, scene.difficultCells, view)
  drawWaves(ctx, scene, view)
  drawMasonry(ctx, scene.wallCells, view)
  for (const group of scene.shades) fillCells(ctx, group.cells, view, group.color)
  drawSteps(ctx, scene.steps, view)
  strokeSegments(ctx, scene.rims, view, PATTERN_COLORS.rim, CELL * 0.08)
  for (const entrance of scene.entrances) drawEntrance(ctx, entrance, view)
  for (const item of scene.features) {
    const f = item.feature
    if (overlaps(view, f.x, f.y, f.w, f.h)) drawFeature(ctx, item)
  }
  ctx.restore()
}

/** Device pixels per cell up to which the board draws the cached map image. */
export const BITMAP_CELL_PX = 64
const BITMAP_MAX_EDGE = 4096

export interface MapBitmap {
  canvas: HTMLCanvasElement
  /** Pixels per cell in the image. */
  cellPx: number
}

const bitmaps = new WeakMap<MapScene, MapBitmap | null>()

/**
 * The map drawn once into an image, for zoomed-out views where every cell is on
 * screen: then a pan or zoom only scales one image. Closer in, drawMap draws just
 * the visible cells at full sharpness.
 */
export function mapBitmap(scene: MapScene): MapBitmap | null {
  if (bitmaps.has(scene)) return bitmaps.get(scene)!
  const cellPx = Math.min(
    BITMAP_CELL_PX,
    Math.floor(BITMAP_MAX_EDGE / Math.max(scene.width, scene.height)),
  )
  const canvas = document.createElement('canvas')
  canvas.width = scene.width * cellPx
  canvas.height = scene.height * cellPx
  const ctx = canvas.getContext('2d')
  const bitmap = ctx && cellPx >= 8 ? { canvas, cellPx } : null
  if (ctx && bitmap) {
    ctx.scale(cellPx / CELL, cellPx / CELL)
    drawMap(ctx, scene, { x0: 0, y0: 0, x1: scene.width, y1: scene.height })
  }
  bitmaps.set(scene, bitmap)
  return bitmap
}

/** The static map at the current zoom: the cached image when zoomed out, else drawn live. */
export function drawMapAtZoom(ctx: CanvasRenderingContext2D, scene: MapScene): void {
  const m = ctx.getTransform()
  const bitmap = mapBitmap(scene)
  if (bitmap && m.a * CELL <= bitmap.cellPx * 1.01) {
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap.canvas, 0, 0, scene.width * CELL, scene.height * CELL)
    return
  }
  drawMap(
    ctx,
    scene,
    visibleCells(m, ctx.canvas.width, ctx.canvas.height, scene.width, scene.height),
  )
}

/** Grid lines fade out when cells get tiny on screen, so a zoomed-out map stays calm. */
export function gridAlpha(cellDevicePx: number, dpr: number): number {
  const cssPx = cellDevicePx / dpr
  return Math.min(1, Math.max(0, (cssPx - 4) / 10)) * 0.55
}

/**
 * The grid, one device pixel wide at every zoom: each line is snapped to the middle
 * of a device pixel, drawn without the world transform. Over a background picture each
 * line gets a light twin one pixel further, so the grid reads on dark and light ground.
 */
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  scene: MapScene,
  dpr: number,
  { onPicture = false }: { onPicture?: boolean } = {},
): void {
  const m = ctx.getTransform()
  const alpha = gridAlpha(m.a * CELL, dpr)
  if (alpha <= 0) return
  const { width: cw, height: ch } = ctx.canvas
  const sx = (cellX: number) => Math.round(m.a * cellX * CELL + m.e)
  const sy = (cellY: number) => Math.round(m.d * cellY * CELL + m.f)
  const stroke = (offset: number, color: string) => {
    ctx.beginPath()
    for (const s of scene.gridLines) {
      const x1 = sx(s.x1)
      const y1 = sy(s.y1)
      const x2 = sx(s.x2)
      const y2 = sy(s.y2)
      if (Math.max(x1, x2) < -1 || Math.min(x1, x2) > cw + 1) continue
      if (Math.max(y1, y2) < -1 || Math.min(y1, y2) > ch + 1) continue
      // One pixel longer at the end, so corners close.
      if (x1 === x2) {
        ctx.moveTo(x1 + 0.5 + offset, y1)
        ctx.lineTo(x1 + 0.5 + offset, y2 + 1)
      } else {
        ctx.moveTo(x1, y1 + 0.5 + offset)
        ctx.lineTo(x2 + 1, y1 + 0.5 + offset)
      }
    }
    ctx.strokeStyle = color
    ctx.stroke()
  }
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.lineWidth = 1
  ctx.lineCap = 'butt'
  if (onPicture) {
    stroke(0, PATTERN_COLORS.gridOnPicture(alpha))
    stroke(1, PATTERN_COLORS.gridOnPictureLight(alpha))
  } else {
    stroke(0, PATTERN_COLORS.grid(alpha))
  }
  ctx.restore()
}

/** Feature labels, once a cell is large enough on screen for them to fit. */
export function drawLabels(ctx: CanvasRenderingContext2D, scene: MapScene, dpr: number): void {
  const m = ctx.getTransform()
  const cellCss = (m.a * CELL) / dpr
  if (cellCss < 34) return
  const { width: cw, height: ch } = ctx.canvas
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.font = `600 ${Math.round(12 * dpr)}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  for (const { feature } of scene.features) {
    const label = feature.label || feature.kind
    const left = m.a * feature.x * CELL + m.e
    const top = m.d * feature.y * CELL + m.f
    const w = m.a * feature.w * CELL
    const h = m.d * feature.h * CELL
    if (left > cw || top > ch || left + w < 0 || top + h < 0) continue
    if (ctx.measureText(label).width + 8 * dpr > w) continue
    const cx = left + w / 2
    const cy = top + h / 2
    ctx.strokeStyle = 'rgba(14, 15, 19, 0.8)'
    ctx.lineWidth = 3 * dpr
    ctx.strokeText(label, cx, cy)
    ctx.fillStyle = PARCHMENT
    ctx.fillText(label, cx, cy)
  }
  ctx.restore()
}

/** Shaded target cells with a thin outline around each patch. */
export function drawHighlight(
  ctx: CanvasRenderingContext2D,
  highlight: HighlightScene,
  scene: MapScene,
  cssScale: number,
): void {
  const m = ctx.getTransform()
  const view = visibleCells(m, ctx.canvas.width, ctx.canvas.height, scene.width, scene.height)
  fillCells(ctx, highlight.cells, view, HIGHLIGHT_COLORS.fill)
  strokeSegments(ctx, highlight.outline, view, HIGHLIGHT_COLORS.outline, 1.5 / cssScale)
}

/** A rectangle of cells marked as "this is what the info box talks about". */
export interface Marker {
  x: number
  y: number
  size: number
}

export interface TokenDrawOptions {
  selectedTokenId?: string | null
  /** CSS pixels per world unit. */
  cssScale: number
  marker?: Marker | null
  /** A see-through copy of a token at its previewed target, drawn on top. */
  ghost?: BoardToken | null
  /** Where others are about to move tokens, drawn over the tokens. */
  arrows?: readonly MoveArrow[]
  /** How many tokens lie in each stack, by the id of the token on top (stackCounts). */
  stacks?: ReadonlyMap<string, number>
  /** What each token shows in its middle (tokenMarks); its letter by default. */
  marks?: ReadonlyMap<string, string>
}

/** Someone else's move preview: the token's target top-left cell. */
export interface MoveArrow {
  tokenId: string
  x: number
  y: number
}

/** Below this radius in CSS pixels a token is drawn as a plain coloured dot. */
const DOT_RADIUS_PX = 7

function drawToken(
  ctx: CanvasRenderingContext2D,
  token: BoardToken,
  cssScale: number,
  mark = tokenLetter(token.label),
) {
  const n = footprint(token.size)
  const cx = (token.x + n / 2) * CELL
  const cy = (token.y + n / 2) * CELL
  const r = n * CELL * 0.42
  const ring = ringColor(token)
  const dot = r * cssScale < DOT_RADIUS_PX
  const px = 1 / cssScale

  ctx.beginPath()
  ctx.arc(cx + r * 0.04, cy + r * 0.1, r, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
  ctx.fill()

  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = dot ? ring : tokenFill(ring)
  ctx.fill()
  // A dark hairline outside, so light rings stand off light ground.
  ctx.strokeStyle = 'rgba(10, 11, 14, 0.85)'
  ctx.lineWidth = Math.max(px, CELL * 0.02)
  ctx.stroke()
  if (dot) return

  const ringWidth = Math.max(r * 0.17, 2.5 * px)
  ctx.beginPath()
  ctx.arc(cx, cy, r - ringWidth / 2, 0, Math.PI * 2)
  ctx.strokeStyle = ring
  ctx.lineWidth = ringWidth
  ctx.stroke()

  // A numbered mark (S12) gets smaller type to stay inside the ring.
  const size = r * ([0.95, 0.95, 0.72, 0.56][mark.length] ?? 0.48)
  ctx.font = `600 ${Math.round(size)}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = PARCHMENT
  ctx.fillText(mark, cx, cy + r * 0.05)
}

/** A stack's count on its top token: a small parchment disc at the upper right. */
function drawStackBadge(
  ctx: CanvasRenderingContext2D,
  token: BoardToken,
  count: number,
  cssScale: number,
) {
  const n = footprint(token.size)
  const r = n * CELL * 0.42
  if (r * cssScale < DOT_RADIUS_PX) return
  const radius = Math.max(CELL * 0.16, 8 / cssScale)
  const x = (token.x + n / 2) * CELL + r * 0.74
  const y = (token.y + n / 2) * CELL - r * 0.74
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fillStyle = PARCHMENT
  ctx.fill()
  ctx.strokeStyle = 'rgba(10, 11, 14, 0.85)'
  ctx.lineWidth = Math.max(1.5 / cssScale, CELL * 0.02)
  ctx.stroke()
  ctx.font = `700 ${Math.round(radius * 1.3)}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = TABLE_COLOR
  ctx.fillText(String(count), x, y + radius * 0.06)
}

/** Candle-gold corner brackets around the selected token's footprint. */
function drawSelection(ctx: CanvasRenderingContext2D, token: BoardToken, cssScale: number) {
  const n = footprint(token.size)
  const pad = CELL * 0.02
  const x = token.x * CELL - pad
  const y = token.y * CELL - pad
  const size = n * CELL + 2 * pad
  const arm = Math.min(size * 0.3, CELL * 0.4)
  ctx.beginPath()
  for (const [cx, cy, dx, dy] of [
    [x, y, 1, 1],
    [x + size, y, -1, 1],
    [x, y + size, 1, -1],
    [x + size, y + size, -1, -1],
  ] as const) {
    ctx.moveTo(cx + dx * arm, cy)
    ctx.lineTo(cx, cy)
    ctx.lineTo(cx, cy + dy * arm)
  }
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = 'rgba(10, 11, 14, 0.7)'
  ctx.lineWidth = Math.max(CELL * 0.11, 5 / cssScale)
  ctx.stroke()
  ctx.strokeStyle = CANDLE_STRONG
  ctx.lineWidth = Math.max(CELL * 0.07, 3 / cssScale)
  ctx.stroke()
}

/** A move's preview: the token half see-through with a dashed candle frame. */
function drawGhost(
  ctx: CanvasRenderingContext2D,
  token: BoardToken,
  cssScale: number,
  mark?: string,
) {
  const n = footprint(token.size)
  ctx.save()
  ctx.globalAlpha = 0.6
  drawToken(ctx, token, cssScale, mark)
  ctx.restore()
  const inset = 2 / cssScale
  ctx.setLineDash([7 / cssScale, 5 / cssScale])
  ctx.strokeStyle = CANDLE_STRONG
  ctx.lineWidth = 2.5 / cssScale
  ctx.strokeRect(
    token.x * CELL + inset,
    token.y * CELL + inset,
    n * CELL - 2 * inset,
    n * CELL - 2 * inset,
  )
  ctx.setLineDash([])
}

/**
 * Someone else's move preview: an arrow in the token's ring colour from its edge to the
 * middle of the target, and a dashed outline of the footprint there.
 */
function drawArrow(
  ctx: CanvasRenderingContext2D,
  token: BoardToken,
  arrow: MoveArrow,
  cssScale: number,
) {
  const n = footprint(token.size)
  const half = (n * CELL) / 2
  const [x0, y0] = [token.x * CELL + half, token.y * CELL + half]
  const [x1, y1] = [arrow.x * CELL + half, arrow.y * CELL + half]
  const length = Math.hypot(x1 - x0, y1 - y0)
  const start = n * CELL * 0.42
  if (length <= start) return
  const [ux, uy] = [(x1 - x0) / length, (y1 - y0) / length]
  const color = ringColor(token)
  const width = Math.max(CELL * 0.08, 3 / cssScale)
  const head = Math.min(width * 3.2, length - start)
  const [bx, by] = [x1 - ux * head, y1 - uy * head]

  const shaft = () => {
    ctx.beginPath()
    ctx.moveTo(x0 + ux * start, y0 + uy * start)
    ctx.lineTo(bx, by)
  }
  const tip = () => {
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(bx - uy * head * 0.6, by + ux * head * 0.6)
    ctx.lineTo(bx + uy * head * 0.6, by - ux * head * 0.6)
    ctx.closePath()
  }

  const inset = 2 / cssScale
  ctx.setLineDash([7 / cssScale, 5 / cssScale])
  ctx.strokeStyle = color
  ctx.lineWidth = 2 / cssScale
  ctx.strokeRect(
    arrow.x * CELL + inset,
    arrow.y * CELL + inset,
    n * CELL - 2 * inset,
    n * CELL - 2 * inset,
  )
  ctx.setLineDash([])

  // A dark edge first, so the arrow stands off any ground and any ring colour.
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = 'rgba(10, 11, 14, 0.75)'
  ctx.lineWidth = width + 3 / cssScale
  shaft()
  ctx.stroke()
  tip()
  ctx.stroke()
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = width
  shaft()
  ctx.stroke()
  tip()
  ctx.fill()
}

/**
 * Tokens in list order, others' move arrows, the selected token on top, then a preview,
 * plus the info box's marker.
 */
export function drawTokens(
  ctx: CanvasRenderingContext2D,
  tokens: readonly BoardToken[],
  { selectedTokenId, cssScale, marker, ghost, arrows, stacks, marks }: TokenDrawOptions,
): void {
  ctx.save()
  const badge = (token: BoardToken) => {
    const count = stacks?.get(token.id)
    if (count) drawStackBadge(ctx, token, count, cssScale)
  }
  let selected: BoardToken | undefined
  for (const token of tokens) {
    if (token.id === selectedTokenId) selected = token
    else {
      drawToken(ctx, token, cssScale, marks?.get(token.id))
      badge(token)
    }
  }
  for (const arrow of arrows ?? []) {
    const token = tokens.find((candidate) => candidate.id === arrow.tokenId)
    if (token) drawArrow(ctx, token, arrow, cssScale)
  }
  if (selected) {
    drawToken(ctx, selected, cssScale, marks?.get(selected.id))
    drawSelection(ctx, selected, cssScale)
    badge(selected)
  }
  if (ghost) drawGhost(ctx, ghost, cssScale, marks?.get(ghost.id))
  if (marker) {
    const inset = 1.5 / cssScale
    ctx.setLineDash([6 / cssScale, 4 / cssScale])
    ctx.strokeStyle = PARCHMENT
    ctx.lineWidth = 2 / cssScale
    ctx.strokeRect(
      marker.x * CELL + inset,
      marker.y * CELL + inset,
      marker.size * CELL - 2 * inset,
      marker.size * CELL - 2 * inset,
    )
  }
  ctx.restore()
}
