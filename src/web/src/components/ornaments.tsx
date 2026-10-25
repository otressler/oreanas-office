// Gold line ornaments from the landing page, also used in the app: frames with corner fans,
// rules with a diamond, buttons with pointed ends. Drawn in SVG and CSS, so they stay sharp
// at any size.
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router'

export function Diamond({ className = '' }: { className?: string }) {
  return <span aria-hidden="true" className={`inline-block size-1.5 rotate-45 ${className}`} />
}

/** A thin gold rule that starts at a diamond, or has one in the middle. */
export function Rule({
  centred = false,
  className = '',
}: {
  centred?: boolean
  className?: string
}) {
  if (centred) {
    return (
      <div aria-hidden="true" className={`flex items-center gap-2 ${className}`}>
        <span className="h-px flex-1 bg-gradient-to-l from-candle/70 to-transparent" />
        <Diamond className="bg-candle" />
        <span className="h-px flex-1 bg-gradient-to-r from-candle/70 to-transparent" />
      </div>
    )
  }
  return (
    <div aria-hidden="true" className={`flex items-center ${className}`}>
      <Diamond className="-mr-0.5 border border-candle/80 bg-table" />
      <span className="h-px flex-1 bg-gradient-to-r from-candle/70 to-transparent" />
    </div>
  )
}

/** A small tracked label above a heading. */
export function Kicker({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={`font-display text-xs font-semibold tracking-[0.3em] text-candle uppercase ${className}`}
    >
      {children}
    </p>
  )
}

/** The fan of arcs in a frame's corner; drawn for the top left and mirrored for the rest. */
function CornerFan({ className }: { className: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 56 56"
      className={`pointer-events-none absolute size-10 text-candle/70 sm:size-14 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
    >
      <path d="M28 6 A22 22 0 0 1 6 28" vectorEffect="non-scaling-stroke" />
      <path d="M42 6 A36 36 0 0 1 6 42" strokeOpacity="0.6" vectorEffect="non-scaling-stroke" />
      <path
        d="M6 6 L37 24 M6 6 L30 30 M6 6 L24 37"
        strokeOpacity="0.45"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="M6 0 L7.3 4.7 L12 6 L7.3 7.3 L6 12 L4.7 7.3 L0 6 L4.7 4.7 Z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  )
}

/**
 * A panel with a double gold border and fanned corners. With a title, the top
 * border rises into an arch that holds it.
 */
export function Frame({
  children,
  title,
  className = '',
}: {
  children: ReactNode
  title?: string
  className?: string
}) {
  return (
    <div
      className={`relative rounded-sm border border-candle/40 bg-table/85 shadow-[0_30px_60px_-20px_rgb(0_0_0/0.8)] ${className}`}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-1.5 rounded-sm border border-candle/15"
      />
      <CornerFan className="-top-1.5 -left-1.5" />
      <CornerFan className="-top-1.5 -right-1.5 -scale-x-100" />
      <CornerFan className="-bottom-1.5 -left-1.5 -scale-y-100" />
      <CornerFan className="-right-1.5 -bottom-1.5 -scale-100" />
      {title && (
        <div className="absolute top-0 left-1/2 flex -translate-x-1/2 -translate-y-full flex-col items-center">
          <svg
            aria-hidden="true"
            viewBox="0 -1 240 35"
            className="h-[34px] w-[240px] text-candle/60"
            fill="none"
          >
            <path
              d="M0 33.5 H48 C76 33.5 82 4 120 4 C158 4 164 33.5 192 33.5 H240 V34 H0 Z"
              className="fill-table"
            />
            <path
              d="M0 33.5 H48 C76 33.5 82 4 120 4 C158 4 164 33.5 192 33.5 H240"
              stroke="currentColor"
            />
            <path d="M120 -1 L123 2 L120 5 L117 2 Z" fill="currentColor" />
          </svg>
          <p className="absolute top-[12px] font-display text-xs tracking-[0.2em] text-parchment uppercase">
            {title}
          </p>
        </div>
      )}
      <div className="relative">{children}</div>
    </div>
  )
}

type ChevronVariant = 'light' | 'dark'

const chevronColours: Record<ChevronVariant, { edge: string; fill: string; text: string }> = {
  light: {
    edge: 'bg-candle-strong',
    fill: 'bg-parchment group-hover:bg-candle-strong',
    text: 'text-table',
  },
  dark: {
    edge: 'bg-candle/70 group-hover:bg-candle',
    fill: 'bg-table/90 group-hover:bg-panel',
    text: 'text-parchment',
  },
}

/** The pointed shape with its outline, the two diamonds and the label. */
function ChevronInner({ children, variant }: { children: ReactNode; variant: ChevronVariant }) {
  const colours = chevronColours[variant]
  return (
    <>
      <span aria-hidden="true" className={`chevron-shape absolute inset-0 ${colours.edge}`} />
      <span
        aria-hidden="true"
        className={`chevron-shape absolute inset-px transition-colors ${colours.fill}`}
      />
      <Diamond className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-candle-strong" />
      <Diamond className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 bg-candle-strong" />
      <span
        className={`relative font-display text-sm font-semibold tracking-[0.15em] uppercase ${colours.text}`}
      >
        {children}
      </span>
    </>
  )
}

function chevronClass(small: boolean, className: string) {
  const size = small ? 'min-h-11 px-7' : 'min-h-12 px-10'
  return `group relative inline-flex items-center justify-center ${size} ${className}`
}

/** A link styled as a button with pointed ends and a diamond above and below. */
export function ChevronLink({
  children,
  variant = 'dark',
  small = false,
  className = '',
  ...target
}: { children: ReactNode; variant?: ChevronVariant; small?: boolean; className?: string } & (
  { to: string } | { href: string }
)) {
  const inner = <ChevronInner variant={variant}>{children}</ChevronInner>
  const classes = chevronClass(small, className)
  return 'to' in target ? (
    <Link to={target.to} className={classes}>
      {inner}
    </Link>
  ) : (
    <a href={target.href} className={classes}>
      {inner}
    </a>
  )
}

/** A button with pointed ends, like ChevronLink; `busy` as on the app's Button. */
export function ChevronButton({
  children,
  variant = 'dark',
  small = false,
  busy = false,
  className = '',
  type = 'button',
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ChevronVariant
  small?: boolean
  busy?: boolean
}) {
  return (
    <button
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={chevronClass(small, `disabled:opacity-60 ${className}`)}
      {...props}
    >
      <ChevronInner variant={variant}>{children}</ChevronInner>
    </button>
  )
}

/** An arrow with fletching, pointing left or right; for back and forward buttons. */
export function BowArrow({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 32 32"
      className={`size-8 ${direction === 'right' ? '-scale-x-100' : ''}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M13 8 L4 16 L13 24" />
      <path d="M4 16 H29" />
      <path
        d="M29 16 L26 11.5 M29 16 L26 20.5 M25 16 L22 11.5 M25 16 L22 20.5"
        strokeOpacity="0.7"
      />
    </svg>
  )
}
