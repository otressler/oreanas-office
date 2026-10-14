// Toolbar icons of the feature and entrance tools: simple line drawings in currentColor.
interface IconProps {
  className?: string
}

const svg = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

/** An arrow pointer. */
export function SelectIcon({ className }: IconProps) {
  return (
    <svg {...svg} className={className}>
      <path d="M5 3l14 8-6 1.5L10 19z" />
      <path d="M13 12.5l4 6" />
    </svg>
  )
}

/** A block on the grid, like a crate or a pillar from above. */
export function FeatureIcon({ className }: IconProps) {
  return (
    <svg {...svg} className={className}>
      <rect x="4" y="7" width="16" height="10" rx="1.5" />
      <path d="M4 12h16M12 7v10" />
    </svg>
  )
}

/** A gap in the map's edge with an arrow passing through. */
export function EntranceIcon({ className }: IconProps) {
  return (
    <svg {...svg} className={className}>
      <path d="M4 3v6M4 15v6" />
      <path d="M2 12h14M12 8l4 4-4 4" />
      <path d="M20 4v16" strokeDasharray="2 3" />
    </svg>
  )
}
