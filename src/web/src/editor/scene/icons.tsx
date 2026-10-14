// The toolbar icon of the "Beschreibung" tool: a page with lines of text.
export function DescriptionIcon({ className }: { className?: string }) {
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
      <path d="M6 3.5h9l3.5 3.5v13.5H6z" />
      <path d="M15 3.5V7h3.5" />
      <path d="M9 11h6M9 14h6M9 17h4" />
    </svg>
  )
}
