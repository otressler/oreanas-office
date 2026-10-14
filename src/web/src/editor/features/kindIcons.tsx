// Catalog icons of the suggested feature kinds: simple line drawings in currentColor, in
// the style of the toolbar icons. A kind outside the catalog gets the feature tool's icon.
import type { ReactNode } from 'react'
import { FeatureIcon } from './icons'
import type { KindKey } from './kinds'

const svg = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

const DRAWINGS: Record<KindKey, ReactNode> = {
  bridge: (
    <>
      <path d="M2 9h20M2 13h20M6 9v4M10 9v4M14 9v4M18 9v4" />
      <path d="M3 13v7M21 13v7M3 20c3-5 15-5 18 0" />
    </>
  ),
  jetty: (
    <>
      <path d="M8 3v15M16 3v15M8 6h8M8 10h8M8 14h8" />
      <path d="M2 20c1.5-1 3-1 4.5 0s3 1 4.5 0 3-1 4.5 0 3 1 4.5 0" />
    </>
  ),
  door: (
    <>
      <path d="M6 21V3h12v18M3 21h18" />
      <path d="M15 12v.01" strokeWidth={2.4} />
    </>
  ),
  gate: (
    <>
      <path d="M5 21V10a7 7 0 0 1 14 0v11M3 21h18" />
      <path d="M9 21V5.2M12 21V3M15 21V5.2" />
    </>
  ),
  trapdoor: (
    <>
      <path d="M4 4h16v16H4zM9 4v16M15 4v16" />
      <circle cx="12" cy="15" r="1.8" />
    </>
  ),
  stairs: <path d="M3 21h5v-4h4v-4h4V9h5V5" />,
  ladder: <path d="M7 3v18M17 3v18M7 7h10M7 11h10M7 15h10M7 19h10" />,
  ramp: (
    <>
      <path d="M3 19h18V7z" />
      <path d="M11 15l4-3M15 12h-2.5M15 12v2.5" />
    </>
  ),
  platform: (
    <>
      <path d="M3 10l9-4 9 4-9 4z" />
      <path d="M3 10v5l9 4 9-4v-5M12 14v5" />
    </>
  ),
  carpet: (
    <>
      <path d="M5 4h14v16H5z" />
      <path d="M8 7h8v10H8z" />
      <path d="M7 2v2M10 2v2M14 2v2M17 2v2M7 20v2M10 20v2M14 20v2M17 20v2" />
    </>
  ),
  tree: (
    <>
      <circle cx="12" cy="9" r="6" />
      <path d="M12 15v6M9 21h6M12 12l-2-2M12 13l2.5-2.5" />
    </>
  ),
  log: (
    <>
      <path d="M17 8H7a3 4 0 0 0 0 8h10" />
      <ellipse cx="17" cy="12" rx="3" ry="4" />
      <ellipse cx="17" cy="12" rx="1" ry="1.5" />
    </>
  ),
  bushes: (
    <>
      <path d="M5 18a3.5 3.5 0 0 1 .5-7A5 5 0 0 1 15 8.5a4 4 0 0 1 4 9.5z" />
      <path d="M3 18h18M10 18v-4M14 18v-3" />
    </>
  ),
  rock: (
    <>
      <path d="M3 18l3-7 5-4 6 2 4 9z" />
      <path d="M11 7l1 5 5-3M12 12l-6-1M12 12l-1 6" />
    </>
  ),
  rubble: (
    <>
      <path d="M3 19l2-4 4 1 1 3z" />
      <path d="M11 19l1.5-5 4-1 2.5 3 1 3z" />
      <path d="M6 12l2-3 3 1-1 2.5z" />
    </>
  ),
  stalagmite: <path d="M3 21l3-8 2 3 4-13 4 13 2-3 3 8zM10 21l2-6 2 6" />,
  pillar: <path d="M5 3h14M5 21h14M7 5.5h10M7 18.5h10M9 5.5v13M15 5.5v13M12 5.5v13" />,
  ruin: (
    <>
      <path d="M3 21h18M4 21v-8h4v-3h4v3h3V7h5v14" />
      <path d="M4 17h16M8 13v4M12 17v4M15 10h5M17.5 10v3" />
    </>
  ),
  statue: (
    <>
      <circle cx="12" cy="4.5" r="2" />
      <path d="M9 14V9.5a3 3 0 0 1 6 0V14" />
      <path d="M7 14h10v3H7zM5 17h14v4H5z" />
    </>
  ),
  well: (
    <>
      <path d="M5 13h14v8H5zM5 17h14" />
      <path d="M7 13V5M17 13V5M5 5h14M12 5v4" />
      <path d="M10.5 9h3v2.5h-3z" />
    </>
  ),
  altar: (
    <>
      <path d="M4 10h16v2.5H4zM6 12.5V21M18 12.5V21M4 21h16" />
      <path d="M8 10V7M12 10V5M16 10V7" />
    </>
  ),
  throne: (
    <>
      <path d="M7 12V4l2.5-1.5L12 4l2.5-1.5L17 4v8" />
      <path d="M5 12h14v3H5zM7 15v6M17 15v6" />
    </>
  ),
  sarcophagus: (
    <>
      <path d="M8 3h8l3 5-2 13H7L5 8z" />
      <circle cx="12" cy="8.5" r="1.8" />
      <path d="M9.5 13h5M10 16h4" />
    </>
  ),
  cage: (
    <>
      <path d="M4 21h16M6 21V9a6 6 0 0 1 12 0v12" />
      <path d="M9.5 21V3.6M14.5 21V3.6M6 12h12" />
    </>
  ),
  table: <path d="M3 9h18l-2-3H5zM5 9v11M19 9v11M5 14h14" />,
  bench: <path d="M3 11h18v3H3zM5 14v5M19 14v5M4 8h16" />,
  bed: (
    <>
      <path d="M3 6v13M21 12v7M3 15h18M3 12h18" />
      <path d="M5 12v-1a1.5 1.5 0 0 1 1.5-1.5H10V12" />
    </>
  ),
  shelf: (
    <>
      <path d="M4 3h16v18H4zM4 9h16M4 15h16" />
      <path d="M7 5v4M9 5.5V9M13 11v4M15 11.5V15M8 17v4M17 17.5V21" />
    </>
  ),
  counter: (
    <>
      <path d="M3 13h18M4 13v8M20 13v8M4 17h16" />
      <path d="M6 8h3v5H6zM9 9.5h1.5v2H9M15 8h3v5h-3z" />
    </>
  ),
  crate: <path d="M4 4h16v16H4zM4 4l16 16M20 4L4 20" />,
  chest: (
    <>
      <path d="M3 10h18v10H3z" />
      <path d="M3 10V8a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v2" />
      <path d="M11 11.5h2v3h-2z" />
    </>
  ),
  barrel: (
    <>
      <path d="M7 3h10c2 3 2 15 0 18H7c-2-3-2-15 0-18z" />
      <path d="M5.6 8h12.8M5.6 16h12.8" />
    </>
  ),
  wagon: (
    <>
      <path d="M3 6h14v9H3zM17 10h4" />
      <circle cx="7" cy="18" r="2.5" />
      <circle cx="14" cy="18" r="2.5" />
    </>
  ),
  tent: <path d="M2 20L12 4l10 16zM12 12l-3 8M12 12l3 8" />,
  campfire: (
    <>
      <path d="M12 3c3 3.5 4 6 4 8a4 4 0 0 1-8 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-2-1-4 0-6.5z" />
      <path d="M4 21l16-4M20 21L4 17" />
    </>
  ),
  brazier: (
    <>
      <path d="M5 11h14c0 2.5-3 4-7 4s-7-1.5-7-4z" />
      <path d="M8 14.5L6 21M16 14.5l2 6.5M12 15v6" />
      <path d="M12 9c-2-1.5-1.5-4 0-6 1.5 2 2 4.5 0 6z" />
    </>
  ),
  fireplace: (
    <>
      <path d="M3 4h18M4 4v17M20 4v17M3 21h18" />
      <path d="M8 21v-8a4 4 0 0 1 8 0v8" />
      <path d="M12 20c-1.5-1-1.5-2.5 0-4 1.5 1.5 1.5 3 0 4z" />
    </>
  ),
}

/** The kind's catalog drawing, or the feature tool's icon for a kind of the DM's own. */
export function KindIcon({ kind, className }: { kind: KindKey | null; className?: string }) {
  if (!kind) return <FeatureIcon className={className} />
  return (
    <svg {...svg} className={className}>
      {DRAWINGS[kind]}
    </svg>
  )
}
