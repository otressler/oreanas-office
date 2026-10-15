// The crop step before a portrait upload (knowledge/features/token-icons.md, requirement 3):
// the picture lies behind the token circle, the person drags and zooms it, and only the
// chosen square goes to the server. The view is kept in the picture's own pixels (the
// square's centre and a zoom), so it doesn't depend on how large the crop box is drawn.
// The square always lies inside the picture: the circle never shows empty space.

/** A picture's size in its own pixels. */
export interface PictureSize {
  width: number
  height: number
}

/** The chosen square: its centre in picture pixels, and the zoom (1 = the short side). */
export interface CropView {
  cx: number
  cy: number
  zoom: number
}

/** The square to cut out, in picture pixels. */
export interface CropSquare {
  x: number
  y: number
  side: number
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

/** The square's edge in picture pixels at a zoom. */
export function cropSide(size: PictureSize, zoom: number): number {
  return Math.min(size.width, size.height) / clamp(zoom, MIN_ZOOM, MAX_ZOOM)
}

/** The whole short side, in the middle. */
export function initialCrop(size: PictureSize): CropView {
  return { cx: size.width / 2, cy: size.height / 2, zoom: MIN_ZOOM }
}

/** Keeps the zoom in range and the square inside the picture. */
export function clampCrop(size: PictureSize, view: CropView): CropView {
  const zoom = clamp(view.zoom, MIN_ZOOM, MAX_ZOOM)
  const half = cropSide(size, zoom) / 2
  return {
    cx: clamp(view.cx, half, size.width - half),
    cy: clamp(view.cy, half, size.height - half),
    zoom,
  }
}

/** CSS pixels on screen per picture pixel, for a crop box `box` pixels wide. */
function screenScale(size: PictureSize, view: CropView, box: number): number {
  return box / cropSide(size, view.zoom)
}

/** Drags the picture by (dx, dy) CSS pixels: the square moves the other way. */
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
  // The picture point under `point` before the zoom.
  const ix = view.cx + (point.x - box / 2) / s
  const iy = view.cy + (point.y - box / 2) / s
  const zoom = clamp(view.zoom * factor, MIN_ZOOM, MAX_ZOOM)
  const next = box / cropSide(size, zoom)
  return clampCrop(size, {
    cx: ix - (point.x - box / 2) / next,
    cy: iy - (point.y - box / 2) / next,
    zoom,
  })
}

/** Sets the zoom (the slider), around the middle of the box. */
export function setCropZoom(size: PictureSize, view: CropView, zoom: number): CropView {
  return clampCrop(size, { ...view, zoom })
}

/** The square to upload, in picture pixels. */
export function cropSquare(size: PictureSize, view: CropView): CropSquare {
  const clamped = clampCrop(size, view)
  const side = cropSide(size, clamped.zoom)
  return { x: clamped.cx - side / 2, y: clamped.cy - side / 2, side }
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
    top: box / 2 - view.cy * s,
    width: size.width * s,
    height: size.height * s,
  }
}

/**
 * Draws the square at OUTPUT_PX × OUTPUT_PX and encodes it as JPEG. The browser has already
 * turned a phone photo the right way up when it decoded it.
 */
export function cropToBlob(image: CanvasImageSource, square: CropSquare): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = OUTPUT_PX
  canvas.height = OUTPUT_PX
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.reject(new Error('no canvas'))
  // JPEG has no transparency: a transparent PNG gets the board's dark ground, not black.
  ctx.fillStyle = '#14161b'
  ctx.fillRect(0, 0, OUTPUT_PX, OUTPUT_PX)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, square.x, square.y, square.side, square.side, 0, 0, OUTPUT_PX, OUTPUT_PX)
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('encoding failed'))),
      'image/jpeg',
      OUTPUT_QUALITY,
    ),
  )
}
