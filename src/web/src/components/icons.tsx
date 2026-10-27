// Small line icons of the app's pages, in currentColor.

/** A pencil: edit what it sits on. */
export function PencilIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M15.5 4.5l4 4L8 20H4v-4z" />
      <path d="M13 7l4 4" />
    </svg>
  )
}

/** An arrow into a tray: bring something in from elsewhere. */
export function ImportIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 4v11" />
      <path d="M7.5 10.5L12 15l4.5-4.5" />
      <path d="M4 15v4h16v-4" />
    </svg>
  )
}
