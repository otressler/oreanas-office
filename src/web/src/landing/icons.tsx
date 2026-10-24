// Line icons for the landing page's medallions and stat box, drawn on a 24 px grid.
import type { ReactNode } from 'react'

const paths = {
  live: <path d="M13 2 L4 14 H11 L10 22 L19 10 H12 Z" />,
  distance: (
    <>
      <path d="M3 17 L17 3 L21 7 L7 21 Z" />
      <path d="M7 13 L9 15 M10 10 L12 12 M13 7 L15 9" />
    </>
  ),
  ping: (
    <>
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="12" r="6" strokeOpacity="0.7" />
      <circle cx="12" cy="12" r="10" strokeOpacity="0.4" />
    </>
  ),
  arrow: <path d="M4 19 C7 10 12 7 19 6 M15 2.5 L19 6 L15.5 10" />,
  status: (
    <path d="M12 3 C8.5 8.5 6 11.5 6 15 A6 6 0 0 0 18 15 C18 11.5 15.5 8.5 12 3 Z M9.5 15.5 A2.5 2.5 0 0 0 12 18" />
  ),
  card: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="1.5" />
      <circle cx="8.5" cy="11" r="2.5" />
      <path d="M13 10 H18 M13 13.5 H17 M6 16 H11" />
    </>
  ),
  dice: (
    <path d="M12 2 L21 7 V17 L12 22 L3 17 V7 Z M12 2 L7 15 H17 Z M3 7 L7 15 M21 7 L17 15 M7 15 L12 22 L17 15" />
  ),
  undo: <path d="M9 14 L4 9 L9 4 M4 9 H15 A5 5 0 0 1 15 19 H11" />,
  offline: (
    <>
      <rect x="4" y="5" width="16" height="11" rx="1" />
      <path d="M2 19 H22 M9 9 L15 13 M15 9 L9 13" />
    </>
  ),
  install: (
    <>
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <path d="M12 7 V14 M9 11 L12 14 L15 11 M11 19 H13" />
    </>
  ),
  size: (
    <>
      <rect x="3" y="3" width="18" height="18" />
      <path d="M12 3 V21 M3 12 H21" strokeOpacity="0.5" />
    </>
  ),
  speed: <path d="M4 18 C6 18 7 16 7 13 V6 H11 V12 L17 14 C19 14.5 20 16 20 18 Z M4 21 H20" />,
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof paths

export function LineIcon({ name, className = 'size-6' }: { name: IconName; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  )
}
