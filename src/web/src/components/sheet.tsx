// The pieces a sheet page is built from: a character's (knowledge/features/character-page.md)
// and a creature type's (knowledge/features/creature-page.md). A portrait on the left, the
// name and short facts beside it, texts under headings below; whoever edits turns the page
// itself into the editor, with one bar at the bottom to save or drop it all.
import { useId, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { de } from '../text/de'
import { TokenPicture } from '../tokenImages/TokenPicture'
import { Markdown } from './Markdown'
import { Rule } from './ornaments'
import { inputClass } from './styles'
import { Button, ErrorAlert } from './ui'

const s = de.sheet

export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="pt-4 text-sm text-candle underline-offset-4 hover:underline">
      <span aria-hidden="true">← </span>
      {label}
    </Link>
  )
}

export function SectionTitle({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <div>
      <h2 id={id} className="font-display text-2xl font-semibold text-parchment">
        {children}
      </h2>
      <Rule className="mt-2 w-32" />
    </div>
  )
}

/** The short facts under the name: label over value, those left empty are skipped. */
export function Facts({ facts }: { facts: [label: string, value: string][] }) {
  return (
    <dl className="mt-2 flex flex-wrap gap-x-8 gap-y-3">
      {facts
        .filter(([, value]) => value)
        .map(([label, value]) => (
          <div key={label} className="flex flex-col gap-0.5">
            <dt className="font-display text-xs font-semibold tracking-[0.2em] text-candle uppercase">
              {label}
            </dt>
            <dd className="text-lg text-parchment">{value}</dd>
          </div>
        ))}
    </dl>
  )
}

/** A multi-line field that grows with its text, with its hint and a counter on the right. */
export function TextArea({
  label,
  hint,
  rows,
  max,
  value,
  invalid = false,
  onChange,
  id: given,
}: {
  label: string
  hint: ReactNode
  rows: number
  max: number
  value: string
  invalid?: boolean
  onChange: (value: string) => void
  id?: string
}) {
  const generated = useId()
  const id = given ?? generated
  const length = Array.from(value).length
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm text-dim">
        {label}
      </label>
      <textarea
        id={id}
        rows={rows}
        value={value}
        maxLength={max}
        aria-invalid={invalid || undefined}
        aria-describedby={`${id}-hint`}
        className={`${inputClass} w-full field-sizing-content resize-none`}
        onChange={(event) => onChange(event.target.value)}
      />
      <div
        id={`${id}-hint`}
        className={`flex flex-wrap justify-between gap-x-4 text-sm ${invalid ? 'text-red-300' : 'text-dim'}`}
      >
        <span>{hint}</span>
        <span className={`tabular-nums ${length >= max * 0.9 ? 'text-candle' : 'text-dim/70'}`}>
          ({length}/{max})
        </span>
      </div>
    </div>
  )
}

/** One text of the sheet: read as formatted text, or a box while editing. */
export function Story({
  title,
  hint,
  value,
  max,
  rows,
  editing,
  invalid,
  onChange,
}: {
  title: string
  hint: string
  value: string
  max: number
  rows: number
  editing: boolean
  invalid?: boolean
  onChange: (value: string) => void
}) {
  const id = useId()
  return (
    <section aria-labelledby={editing ? undefined : `${id}-title`} className="flex flex-col gap-3">
      {editing ? (
        <TextArea
          id={id}
          label={title}
          hint={`${hint} ${s.markdownHint}`}
          rows={rows}
          max={max}
          value={value}
          invalid={invalid}
          onChange={onChange}
        />
      ) : (
        <>
          <SectionTitle id={`${id}-title`}>{title}</SectionTitle>
          {value ? <Markdown>{value}</Markdown> : <p className="text-dim">{s.empty}</p>}
        </>
      )}
    </section>
  )
}

/**
 * The portrait as painted in the ring's light (`--ring` set by the page); the token's letter
 * without one, or while it doesn't load.
 */
export function Portrait({
  url: given,
  alt,
  name,
  ring,
}: {
  url: string | null | undefined
  alt: string
  name: string
  ring: string
}) {
  const [failed, setFailed] = useState<string | null>(null)
  const url = given && failed !== given ? given : null
  return (
    <div className="relative mx-auto aspect-square w-full max-w-72 overflow-hidden rounded-sm border border-candle/25 bg-panel shadow-[0_30px_60px_-30px_rgb(0_0_0/0.9)]">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_50%,color-mix(in_srgb,var(--ring)_40%,transparent),transparent_80%)]"
      />
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-[var(--ring)]" />
      {url ? (
        <img
          src={url}
          alt={alt}
          decoding="async"
          onError={() => setFailed(url)}
          className="absolute inset-0 size-full object-contain p-3 drop-shadow-[0_12px_24px_rgb(0_0_0/0.85)]"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <TokenPicture url={null} label={name} ring={ring} alt="" className="size-28 text-5xl" />
        </div>
      )}
    </div>
  )
}

/**
 * The bar that sticks to the bottom of the screen while editing: what went wrong, whether
 * something changed, cancel and save. `extra` stands at its start, e.g. archiving.
 */
export function EditBar({
  label,
  error,
  dirty,
  busy = false,
  extra,
  onCancel,
  onSave,
}: {
  label: string
  error: unknown
  dirty: boolean
  busy?: boolean
  extra?: ReactNode
  onCancel: () => void
  onSave: () => void
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="sticky bottom-0 z-10 -mx-4 mt-10 flex flex-col gap-2 border-t border-candle/25 bg-table/90 px-4 py-3 backdrop-blur-sm"
    >
      <ErrorAlert error={error} />
      <div className="flex flex-wrap items-center gap-2">
        {extra}
        {dirty && (
          <p role="status" className="mr-auto text-sm text-candle">
            {s.unsaved}
          </p>
        )}
        <Button variant="quiet" className="ml-auto" onClick={onCancel}>
          {de.common.cancel}
        </Button>
        <Button variant="primary" busy={busy} onClick={onSave}>
          {s.saveChanges}
        </Button>
      </div>
    </div>
  )
}
