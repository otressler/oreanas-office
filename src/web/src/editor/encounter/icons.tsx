// Toolbar icons of the creature tools: simple line drawings in currentColor.
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

/** A token with a plus: put a creature on the map. */
export function PlaceIcon({ className }: IconProps) {
  return (
    <svg {...svg} className={className}>
      <circle cx="10" cy="14" r="6" />
      <path d="M10 11.5v5M7.5 14h5" />
      <path d="M19 3v6M16 6h6" />
    </svg>
  )
}

/** An arrow pointing at a token. */
export function SelectCreatureIcon({ className }: IconProps) {
  return (
    <svg {...svg} className={className}>
      <circle cx="14" cy="15" r="6" />
      <path d="M4 3l8 4.5-3.5 1L7 12z" />
    </svg>
  )
}
