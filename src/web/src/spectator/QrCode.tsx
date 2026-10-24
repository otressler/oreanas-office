import { useMemo } from 'react'
import { de } from '../text/de'
import { qrImage } from './qr'

/** The QR code of `value`: dark modules on white, with the quiet zone scanners need. */
export function QrCode({ value, className = '' }: { value: string; className?: string }) {
  const image = useMemo(() => qrImage(value), [value])
  return (
    <svg
      role="img"
      aria-label={de.spectator.qrLabel}
      viewBox={`0 0 ${image.size} ${image.size}`}
      shapeRendering="crispEdges"
      className={`aspect-square bg-white ${className}`}
    >
      <path d={image.path} fill="#000" />
    </svg>
  )
}
