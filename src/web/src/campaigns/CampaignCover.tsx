// A campaign's cover (knowledge/domain/campaign.md): its picked picture, or the app's
// default one while there is none or it doesn't load (offline, say).
import { useState } from 'react'

/** The default cover in public/home/, generated at two widths like the landing pictures. */
const DEFAULT_COVER = {
  src: '/home/cover-default-1536.webp',
  srcSet: '/home/cover-default-768.webp 768w, /home/cover-default-1536.webp 1536w',
}

export function CampaignCover({
  url,
  alt,
  sizes = '(min-width: 1024px) 400px, 100vw',
  className = '',
}: {
  url: string | null | undefined
  alt: string
  /** How wide the picture is drawn, so the browser picks the default's smaller width. */
  sizes?: string
  /** Size, shape and position; the picture covers it. */
  className?: string
}) {
  const [failed, setFailed] = useState<string | null>(null)
  const shown = url && failed !== url ? url : null
  return shown ? (
    <img
      src={shown}
      alt={alt}
      decoding="async"
      className={`object-cover ${className}`}
      onError={() => setFailed(shown)}
    />
  ) : (
    <img
      src={DEFAULT_COVER.src}
      srcSet={DEFAULT_COVER.srcSet}
      sizes={sizes}
      alt={alt}
      decoding="async"
      className={`object-cover ${className}`}
    />
  )
}
