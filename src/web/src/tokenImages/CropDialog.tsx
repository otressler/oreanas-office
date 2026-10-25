// The crop step before a portrait upload (knowledge/features/token-icons.md): the picture
// inside the token circle; drag to move it, pinch, the wheel or the slider to zoom. The
// picture always covers the circle (crop.ts). On confirm the chosen square is drawn at
// 1024 × 1024 and handed over as a JPEG. A campaign cover (knowledge/domain/campaign.md)
// gets a 3:2 frame instead and is drawn at 1536 × 1024.
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { errorMessage } from '../api/errors'
import { GestureTracker, wheelZoomFactor, type PointerSample } from '../board/gestures'
import { useElementSize } from '../board/useElementSize'
import { Button, ErrorAlert } from '../components/ui'
import { Modal } from '../sync/Modal'
import { de } from '../text/de'
import {
  MAX_ZOOM,
  MIN_ZOOM,
  cropRect,
  cropToBlob,
  initialCrop,
  panCrop,
  pictureLayout,
  setCropZoom,
  zoomCrop,
  type CropView,
  type PictureSize,
} from './crop'

const t = de.tokenImages.crop

/** What the frame is: a token's circle, or a cover's 3:2 rectangle. */
export type CropShape = 'token' | 'cover'

const SHAPES: Record<CropShape, { aspect: number; output: PictureSize }> = {
  token: { aspect: 1, output: { width: 1024, height: 1024 } },
  cover: { aspect: 3 / 2, output: { width: 1536, height: 1024 } },
}

type Picture =
  | { state: 'opening' }
  | { state: 'failed' }
  | { state: 'ready'; image: HTMLImageElement; size: PictureSize }

/** Opens the file as a picture; null while it opens. */
function usePicture(file: Blob): Picture {
  const [picture, setPicture] = useState<Picture>({ state: 'opening' })
  useEffect(() => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    let live = true
    image.onload = () => {
      const size = { width: image.naturalWidth, height: image.naturalHeight }
      if (!live) return
      setPicture(
        size.width > 0 && size.height > 0 ? { state: 'ready', image, size } : { state: 'failed' },
      )
    }
    image.onerror = () => {
      if (live) setPicture({ state: 'failed' })
    }
    image.src = url
    return () => {
      live = false
      image.onload = null
      image.onerror = null
      URL.revokeObjectURL(url)
    }
  }, [file])
  return picture
}

export function CropDialog({
  file,
  ring,
  shape = 'token',
  onConfirm,
  onClose,
}: {
  file: Blob
  /** The token's ring colour, drawn around the circle (or the cover's frame). */
  ring: string
  shape?: CropShape
  /** Gets the cropped JPEG; a rejection is shown in the dialog. */
  onConfirm: (picture: Blob) => Promise<void>
  onClose: () => void
}) {
  const picture = usePicture(file)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<CropView | null>(null)
  const size = picture.state === 'ready' ? picture.size : null
  const { aspect, output } = SHAPES[shape]
  const current = size ? (view ?? initialCrop(size, aspect)) : null

  async function confirm() {
    if (picture.state !== 'ready' || !current) return
    setBusy(true)
    setError(null)
    let blob: Blob
    try {
      blob = await cropToBlob(picture.image, cropRect(picture.size, current), output)
    } catch {
      setError(t.failed)
      setBusy(false)
      return
    }
    try {
      await onConfirm(blob)
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={t.title} onClose={onClose}>
      {picture.state === 'opening' && <p className="text-sm text-dim">{t.opening}</p>}
      {picture.state === 'failed' && <ErrorAlert error={t.unreadable} />}
      {picture.state === 'ready' && current && (
        <>
          <p className="max-w-prose text-sm text-dim">{t.help}</p>
          <CropBox
            image={picture.image}
            size={picture.size}
            view={current}
            ring={ring}
            shape={shape}
            onChange={setView}
          />
          <label className="flex max-w-xs flex-col gap-1 text-sm text-dim">
            {t.zoom}
            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.01}
              value={current.zoom}
              onChange={(event) =>
                setView(setCropZoom(picture.size, current, Number(event.target.value)))
              }
              className="accent-candle"
            />
          </label>
        </>
      )}
      <ErrorAlert error={error} />
      <div className="flex flex-wrap gap-2">
        {picture.state === 'ready' && (
          <Button variant="primary" busy={busy} onClick={() => void confirm()}>
            {t.ok}
          </Button>
        )}
        <Button onClick={onClose}>{de.common.cancel}</Button>
      </div>
    </Modal>
  )
}

/**
 * The box with the picture behind a window in the ring colour: a circle in a square box, or
 * a cover's whole 3:2 box.
 */
function CropBox({
  image,
  size,
  view,
  ring,
  shape,
  onChange,
}: {
  image: HTMLImageElement
  size: PictureSize
  view: CropView
  ring: string
  shape: CropShape
  onChange: (view: CropView) => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const box = useElementSize(boxRef)?.width ?? 0
  // The gesture listeners read the latest view and size through a ref.
  const latest = useRef({ view, size, box, onChange })
  useEffect(() => {
    latest.current = { view, size, box, onChange }
  })

  useEffect(() => {
    const element = boxRef.current
    if (!element) return
    const tracker = new GestureTracker()
    const local = (e: { clientX: number; clientY: number }) => {
      const rect = element.getBoundingClientRect()
      return { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }
    const sample = (e: PointerEvent): PointerSample => ({
      id: e.pointerId,
      ...local(e),
      time: e.timeStamp,
      kind: e.pointerType === 'mouse' ? 'mouse' : e.pointerType === 'pen' ? 'pen' : 'touch',
    })
    const apply = (change: (current: typeof latest.current) => CropView) => {
      const current = latest.current
      const next = change(current)
      // Kept at once, so two moves before the next render both count.
      current.view = next
      current.onChange(next)
    }
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      e.preventDefault()
      try {
        element.setPointerCapture(e.pointerId)
      } catch {
        // Capturing only keeps drags that leave the box; moving works without it.
      }
      tracker.down(sample(e))
    }
    const onPointerMove = (e: PointerEvent) => {
      const gesture = tracker.move(sample(e))
      if (!gesture || gesture.type === 'tap') return
      if (gesture.type === 'pan') {
        apply(({ size, view, box }) => panCrop(size, view, gesture.dx, gesture.dy, box))
      } else if (gesture.type === 'pinch') {
        apply(({ size, view, box }) =>
          panCrop(
            size,
            zoomCrop(size, view, gesture.factor, gesture.center, box),
            gesture.dx,
            gesture.dy,
            box,
          ),
        )
      }
    }
    const onPointerUp = (e: PointerEvent) => void tracker.up(sample(e))
    const onPointerCancel = (e: PointerEvent) => tracker.cancel(e.pointerId)
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const point = local(e)
      const factor = wheelZoomFactor(e.deltaY, e.deltaMode, e.ctrlKey)
      apply(({ size, view, box }) => zoomCrop(size, view, factor, point, box))
    }
    const prevent = (e: Event) => e.preventDefault()
    const listeners: [string, (e: never) => void, AddEventListenerOptions?][] = [
      ['pointerdown', onPointerDown],
      ['pointermove', onPointerMove],
      ['pointerup', onPointerUp],
      ['pointercancel', onPointerCancel],
      ['lostpointercapture', onPointerCancel],
      ['wheel', onWheel, { passive: false }],
      ['touchmove', prevent, { passive: false }],
      ['gesturestart', prevent, { passive: false }],
      ['gesturechange', prevent, { passive: false }],
    ]
    for (const [type, listener, options] of listeners)
      element.addEventListener(type, listener as EventListener, options)
    return () => {
      for (const [type, listener, options] of listeners)
        element.removeEventListener(type, listener as EventListener, options)
    }
  }, [])

  const layout = box > 0 ? pictureLayout(size, view, box) : null
  const pictureStyle: CSSProperties = layout
    ? {
        left: layout.left,
        top: layout.top,
        width: layout.width,
        height: layout.height,
        maxWidth: 'none',
      }
    : { display: 'none' }

  return (
    <div
      ref={boxRef}
      data-testid="crop-box"
      className={`relative w-full cursor-grab touch-none overflow-hidden rounded-lg bg-table select-none active:cursor-grabbing ${
        shape === 'cover' ? 'aspect-[3/2] max-w-[30rem]' : 'aspect-square max-w-80'
      }`}
    >
      <img
        src={image.src}
        alt={t.alt}
        draggable={false}
        className="pointer-events-none absolute"
        style={pictureStyle}
      />
      {/* Darkens what lies outside the token circle; the ring shows the token's colour. */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 border-4 ${shape === 'cover' ? 'rounded-lg' : 'rounded-full'}`}
        style={{ borderColor: ring, boxShadow: '0 0 0 100vmax rgba(10, 11, 14, 0.6)' }}
      />
    </div>
  )
}
