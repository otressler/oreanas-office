import { useRef, useState, type PointerEvent } from 'react'
import { Diamond } from './ornaments'

interface Picture {
  src: string
  srcSet: string
  alt: string
  label: string
}

/**
 * Two pictures of the same size on top of each other, with a divider to drag between
 * them. Touch drags sideways move the divider and up or down scroll the page; the
 * hidden range input keeps it usable with the keyboard and screen readers.
 */
export function CompareSlider({
  before,
  after,
  label,
  width,
  height,
}: {
  before: Picture
  after: Picture
  label: string
  width: number
  height: number
}) {
  const [position, setPosition] = useState(50)
  const box = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  function moveTo(event: PointerEvent) {
    const rect = box.current!.getBoundingClientRect()
    const percent = ((event.clientX - rect.left) / rect.width) * 100
    setPosition(Math.min(100, Math.max(0, percent)))
  }

  function start(event: PointerEvent<HTMLDivElement>) {
    dragging.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    moveTo(event)
  }

  const stop = () => {
    dragging.current = false
  }

  const sizes = '(min-width: 1152px) 1088px, 100vw'

  return (
    <div
      ref={box}
      className="relative cursor-ew-resize touch-pan-y overflow-hidden select-none"
      style={{ aspectRatio: `${width} / ${height}` }}
      onPointerDown={start}
      onPointerMove={(event) => dragging.current && moveTo(event)}
      onPointerUp={stop}
      onPointerCancel={stop}
    >
      <img
        src={after.src}
        srcSet={after.srcSet}
        sizes={sizes}
        alt={after.alt}
        width={width}
        height={height}
        loading="lazy"
        draggable={false}
        className="absolute inset-0 size-full object-cover"
      />
      <img
        src={before.src}
        srcSet={before.srcSet}
        sizes={sizes}
        alt={before.alt}
        width={width}
        height={height}
        loading="lazy"
        draggable={false}
        className="absolute inset-0 size-full object-cover"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      />
      <PictureLabel className="left-3">{before.label}</PictureLabel>
      <PictureLabel className="right-3">{after.label}</PictureLabel>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={Math.round(position)}
        onChange={(event) => setPosition(Number(event.target.value))}
        aria-label={label}
        aria-valuetext={`${before.label} ${Math.round(position)} %, ${after.label} ${100 - Math.round(position)} %`}
        className="peer sr-only"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 w-px -translate-x-1/2 bg-candle-strong/90 shadow-[0_0_12px_rgb(240_196_110/0.6)] peer-focus-visible:[&>span]:outline-2 peer-focus-visible:[&>span]:outline-offset-2 peer-focus-visible:[&>span]:outline-candle"
        style={{ left: `${position}%` }}
      >
        <span className="absolute top-1/2 left-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-1 rounded-full border border-candle-strong bg-table/90 text-candle-strong">
          <svg viewBox="0 0 8 12" className="h-3 w-2" fill="currentColor">
            <path d="M8 0 L0 6 L8 12 Z" />
          </svg>
          <Diamond className="bg-candle-strong" />
          <svg viewBox="0 0 8 12" className="h-3 w-2" fill="currentColor">
            <path d="M0 0 L8 6 L0 12 Z" />
          </svg>
        </span>
      </div>
    </div>
  )
}

function PictureLabel({ children, className }: { children: string; className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute top-3 rounded-sm border border-candle/40 bg-table/80 px-2.5 py-1 font-display text-xs tracking-[0.2em] text-parchment uppercase ${className}`}
    >
      {children}
    </span>
  )
}
