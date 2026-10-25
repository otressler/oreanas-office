// The crop step before a portrait upload (knowledge/features/token-icons.md, requirement 3)
// or a campaign cover upload (knowledge/domain/campaign.md): the picture lies behind the
// token circle or the cover frame, the person drags and zooms it, and only the chosen part
// goes to the server. The view is kept in the picture's own pixels (the frame's centre, a
// zoom and the frame's aspect), so it doesn't depend on how large the crop box is drawn. The
// frame always lies inside the picture: it never shows empty space.

/** A picture's size in its own pixels. */
export interface PictureSize {
  width: number
  height: number
}

/**
 * The chosen frame: its centre in picture pixels, the zoom (1 = the largest frame that fits)
 * and its width / height (1, a square, when left out).
 */
export interface CropView {
  cx: number
  cy: number
  zoom: number
  aspect?: number
}

/** The part to cut out, in picture pixels. */
export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

/** A point in the crop box, in CSS pixels from its top-left corner. */
export interface BoxPoint {
  x: number
  y: number
}

export const MIN_ZOOM = 1
export const MAX_ZOOM = 8
/** The uploaded square's edge in pixels. */
export const OUTPUT_PX = 1024
export const OUTPUT_QUALITY = 0.9

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** The frame's size in picture pixels at the view's zoom. */
export function cropFrame(size: PictureSize, view: Pick<CropView, 'zoom' | 'aspect'>): PictureSize {
  const aspect = view.aspect ?? 1
  const zoom = clamp(view.zoom, MIN_ZOOM, MAX_ZOOM)
  const width = Math.min(size.width, size.height * aspect) / zoom
  return { width, height: width / aspect }
}

/** A square frame's edge in picture pixels at a zoom. */
export function cropSide(size: PictureSize, zoom: number): number {
  return cropFrame(size, { zoom }).width
}

/** The largest frame in the middle. */
export function initialCrop(size: PictureSize, aspect = 1): CropView {
  return { cx: size.width / 2, cy: size.height / 2, zoom: MIN_ZOOM, aspect }
}

/** Keeps the zoom in range and the frame inside the picture. */
export function clampCrop(size: PictureSize, view: CropView): CropView {
  const zoom = clamp(view.zoom, MIN_ZOOM, MAX_ZOOM)
  const frame = cropFrame(size, { ...view, zoom })
  return {
    ...view,
    cx: clamp(view.cx, frame.width / 2, size.width - frame.width / 2),
    cy: clamp(view.cy, frame.height / 2, size.height - frame.height / 2),
    zoom,
  }
}

/** CSS pixels on screen per picture pixel, for a crop box `box` pixels wide. */
function screenScale(size: PictureSize, view: CropView, box: number): number {
  return box / cropFrame(size, view).width
}

/** The crop box's height for a box `box` pixels wide. */
function boxHeight(view: CropView, box: number): number {
  return box / (view.aspect ?? 1)
}

/** Drags the picture by (dx, dy) CSS pixels: the frame moves the other way. */
export function panCrop(
  size: PictureSize,
  view: CropView,
  dx: number,
  dy: number,
  box: number,
): CropView {
  if (box <= 0) return view
  const s = screenScale(size, view, box)
  return clampCrop(size, { ...view, cx: view.cx - dx / s, cy: view.cy - dy / s })
}

/** Zooms by `factor` around a point of the box, which stays over the same spot of the picture. */
export function zoomCrop(
  size: PictureSize,
  view: CropView,
  factor: number,
  point: BoxPoint,
  box: number,
): CropView {
  if (box <= 0 || !(factor > 0)) return view
  const s = screenScale(size, view, box)
  const fromCentre = { x: point.x - box / 2, y: point.y - boxHeight(view, box) / 2 }
  // The picture point under `point` before the zoom.
  const ix = view.cx + fromCentre.x / s
  const iy = view.cy + fromCentre.y / s
  const zoom = clamp(view.zoom * factor, MIN_ZOOM, MAX_ZOOM)
  const next = screenScale(size, { ...view, zoom }, box)
  return clampCrop(size, {
    ...view,
    cx: ix - fromCentre.x / next,
    cy: iy - fromCentre.y / next,
    zoom,
  })
}

/** Sets the zoom (the slider), around the middle of the box. */
export function setCropZoom(size: PictureSize, view: CropView, zoom: number): CropView {
  return clampCrop(size, { ...view, zoom })
}

/** The part to upload, in picture pixels. */
export function cropRect(size: PictureSize, view: CropView): CropRect {
  const clamped = clampCrop(size, view)
  const frame = cropFrame(size, clamped)
  return {
    x: clamped.cx - frame.width / 2,
    y: clamped.cy - frame.height / 2,
    width: frame.width,
    height: frame.height,
  }
}

/** Where the picture lies in the crop box, in CSS pixels: for its style. */
export function pictureLayout(
  size: PictureSize,
  view: CropView,
  box: number,
): { left: number; top: number; width: number; height: number } {
  const s = screenScale(size, view, box)
  return {
    left: box / 2 - view.cx * s,
    top: boxHeight(view, box) / 2 - view.cy * s,
    width: size.width * s,
    height: size.height * s,
  }
}

/**
 * Draws the part at `output` (OUTPUT_PX square by default) and encodes it as JPEG. The
 * browser has already turned a phone photo the right way up when it decoded it.
 */
export function cropToBlob(
  image: CanvasImageSource,
  rect: CropRect,
  output: PictureSize = { width: OUTPUT_PX, height: OUTPUT_PX },
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = output.width
  canvas.height = output.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.reject(new Error('no canvas'))
  // JPEG has no transparency: a transparent PNG gets the board's dark ground, not black.
  ctx.fillStyle = '#14161b'
  ctx.fillRect(0, 0, output.width, output.height)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, output.width, output.height)
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('encoding failed'))),
      'image/jpeg',
      OUTPUT_QUALITY,
    ),
  )
}
