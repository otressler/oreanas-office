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

/** Two crossed swords: the encounter itself (ready, start, archive). */
export function EncounterIcon({ className }: IconProps) {
  return (
    <svg {...svg} className={className}>
      <path d="M4 4l10 10M20 4L10 14" />
      <path d="M12.5 16.5l-3 3M11.5 16.5l3 3M7.5 12.5l-3 3M16.5 12.5l3 3" />
      <path d="M3.5 18.5l2 2M20.5 18.5l-2 2" />
    </svg>
  )
}

/** A cloud: fog of war. */
export function FogIcon({ className }: IconProps) {
  return (
    <svg {...svg} className={className}>
      <path d="M7 18a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17 8.5a4.5 4.5 0 0 1 .5 9.5z" />
      <path d="M8 21h8" opacity={0.5} />
    </svg>
  )
}
