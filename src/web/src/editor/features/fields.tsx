// Inputs for the side panels. Edits of the map run as one store gesture from focus to
// blur, so typing a label is one undo step, not one per keystroke.
import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { TextField } from '../../components/ui'
import type { EditorMap } from '../model'
import { useEditorStore } from '../store'
import { useEditGesture } from '../useEditGesture'
import { KIND_SUGGESTIONS } from './kinds'

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>

/** A text of the map (a label, a kind), changed as one undo step per edit. */
export function MapTextField({
  label,
  value,
  onEdit,
  hint,
  error,
  ...props
}: InputProps & {
  label: string
  value: string
  /** Returns the map with the new text. */
  onEdit: (doc: EditorMap, text: string) => EditorMap
  hint?: ReactNode
  /** Shown instead of the hint, with the field marked invalid. */
  error?: string | null
}) {
  const gesture = useEditGesture()
  return (
    <TextField
      label={label}
      value={value}
      invalid={!!error}
      hint={error ?? hint}
      onFocus={gesture.begin}
      onChange={(e) => {
        const text = e.target.value
        gesture.change((doc) => onEdit(doc, text))
      }}
      onBlur={() => {
        gesture.change((doc) => onEdit(doc, value.trim()))
        gesture.end()
      }}
      {...props}
    />
  )
}

/**
 * A number of the map typed as text (an elevation, a position). While typing, the text
 * stays as typed; the map changes only while it reads as an allowed value, and anything
 * else is marked with the reason.
 */
export function MapNumberField({
  label,
  value,
  format,
  parse,
  invalidText,
  check,
  onEdit,
  hint,
  ...props
}: InputProps & {
  label: string
  value: number
  format: (value: number) => string
  parse: (text: string) => number | null
  /** Shown when the text doesn't parse. */
  invalidText: string
  /** Why a parsed value isn't allowed, or null when it is. */
  check?: (value: number, doc: EditorMap) => string | null
  onEdit: (doc: EditorMap, value: number) => EditorMap
  hint?: ReactNode
}) {
  const store = useEditorStore()
  const gesture = useEditGesture()
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  return (
    <TextField
      label={label}
      value={draft ?? format(value)}
      invalid={!!error}
      hint={error ?? hint}
      autoComplete="off"
      onFocus={() => {
        setDraft(format(value))
        gesture.begin()
      }}
      onChange={(e) => {
        const text = e.target.value
        setDraft(text)
        const parsed = parse(text)
        const problem =
          parsed === null ? invalidText : (check?.(parsed, store.getState().doc) ?? null)
        setError(problem)
        if (parsed !== null && problem === null) gesture.change((doc) => onEdit(doc, parsed))
      }}
      onBlur={() => {
        setDraft(null)
        setError(null)
        gesture.end()
      }}
      {...props}
    />
  )
}

/** A checkbox with a label and an optional hint. */
export function CheckField({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="flex min-h-11 items-center gap-3 text-parchment">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className="size-5 accent-candle"
        />
        {label}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-dim">
          {hint}
        </p>
      )}
    </div>
  )
}

/** The suggested feature kinds, for an input's `list`. */
export function KindSuggestions({ id }: { id: string }) {
  return (
    <datalist id={id}>
      {KIND_SUGGESTIONS.map((s) => (
        <option key={s.kind} value={s.kind} />
      ))}
    </datalist>
  )
}

/** Plain help text in a panel. */
export function Help({ children }: { children: ReactNode }) {
  return <p className="text-sm text-dim">{children}</p>
}
