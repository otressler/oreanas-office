// Toolbar icons for the terrain and elevation tools: simple strokes in the text colour.
import type { ReactNode } from 'react'

function Svg({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  )
}

export function BrushIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M14.5 4.5l5 5-7.5 7.5-5-5z" />
      <path d="M7 12c-2 0-3.5 1.5-3.5 3.5 0 2-1 3-1 3s3.5.5 5.5-1.5c1-1 1.5-2 1-3" />
    </Svg>
  )
}

export function RectIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <rect x="4" y="6" width="16" height="12" rx="1" />
      <path d="M4 10h16M4 14h16M9 6v12M15 6v12" opacity={0.45} />
    </Svg>
  )
}

export function FillIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M11 3l8 8-6.5 6.5a2 2 0 01-2.8 0L4.5 12.3a2 2 0 010-2.8z" />
      <path d="M5 11h13" />
      <path d="M20 15s1.5 2 1.5 3a1.5 1.5 0 01-3 0c0-1 1.5-3 1.5-3z" />
    </Svg>
  )
}

export function ElevationBrushIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M3 19l6-9 4 5 3-4 5 8z" />
      <path d="M16 3v5M13.5 5.5L16 3l2.5 2.5" />
    </Svg>
  )
}

export function ElevationRectIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <rect x="3" y="10" width="14" height="10" rx="1" />
      <path d="M7 15h6" />
      <path d="M20 3v8M17.5 5.5L20 3l2.5 2.5" />
    </Svg>
  )
}
