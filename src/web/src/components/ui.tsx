// Small building blocks for forms and pages, mobile first (see styles.ts).
import {
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react'
import { Link, type LinkProps } from 'react-router'
import { errorMessage } from '../api/errors'
import { de } from '../text/de'
import { buttonClass, inputClass, type ButtonVariant } from './styles'

export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="pt-6 pb-2 text-2xl font-semibold text-parchment">{children}</h1>
}

/** A titled block of a page. */
export function Panel({
  title,
  children,
  action,
}: {
  title: string
  children: ReactNode
  action?: ReactNode
}) {
  const id = useId()
  return (
    <section
      aria-labelledby={id}
      className="mt-4 flex flex-col gap-3 rounded-xl border border-line bg-panel p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={id} className="text-lg font-semibold text-parchment">
          {title}
        </h2>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </section>
  )
}

type Variant = ButtonVariant

export function Button({
  variant = 'secondary',
  busy = false,
  className = '',
  type = 'button',
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  return (
    <button
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={buttonClass(variant, className)}
      {...props}
    />
  )
}

export function ButtonLink({
  variant = 'secondary',
  className = '',
  ...props
}: LinkProps & { variant?: Variant }) {
  return <Link className={buttonClass(variant, className)} {...props} />
}

/** A labelled input with an optional hint below it. */
export function TextField({
  label,
  hint,
  invalid = false,
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string
  hint?: ReactNode
  invalid?: boolean
}) {
  const id = useId()
  const hintId = `${id}-hint`
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={id} className="text-sm text-dim">
        {label}
      </label>
      <input
        id={id}
        aria-describedby={hint ? hintId : undefined}
        aria-invalid={invalid || undefined}
        className={inputClass}
        {...props}
      />
      {hint && (
        <p id={hintId} className="text-sm text-dim">
          {hint}
        </p>
      )}
    </div>
  )
}

/** A labelled select. */
export function SelectField({
  label,
  className = '',
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  const id = useId()
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={id} className="text-sm text-dim">
        {label}
      </label>
      <select id={id} className={inputClass} {...props}>
        {children}
      </select>
    </div>
  )
}

/** An error message, read out by screen readers when it appears. */
export function ErrorAlert({ error }: { error: unknown }) {
  if (!error) return null
  const message = typeof error === 'string' ? error : errorMessage(error)
  return (
    <p
      role="alert"
      className="rounded-lg border border-red-400/50 bg-red-950/40 px-3 py-2 text-sm text-red-200"
    >
      {message}
    </p>
  )
}

/** A success or info note. */
export function Note({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="rounded-lg border border-candle/40 bg-candle/10 px-3 py-2 text-sm text-parchment"
    >
      {children}
    </p>
  )
}

export function Badge({
  children,
  tone = 'dim',
}: {
  children: ReactNode
  tone?: 'dim' | 'candle'
}) {
  const colours = tone === 'candle' ? 'border-candle/60 text-candle' : 'border-line text-dim'
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-xs ${colours}`}>
      {children}
    </span>
  )
}

/** Shown while the first data of a page loads. */
export function Loading() {
  return (
    <p role="status" className="py-8 text-dim">
      {de.common.loading}
    </p>
  )
}

/** A failed load, with a retry. */
export function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 py-8">
      <ErrorAlert error={error} />
      <Button onClick={onRetry}>{de.common.retry}</Button>
    </div>
  )
}
