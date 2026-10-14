// The map's name in the editor header. Typing is one undo step from focus to blur, and
// an empty name isn't saved: the map keeps the name it had before typing.
import { useId, useState } from 'react'
import { inputClass } from '../../components/styles'
import { limits } from '../../lib/limits'
import { de } from '../../text/de'
import { useEditor } from '../store'
import { useEditGesture } from '../useEditGesture'

const t = de.maps.scene

export function MapNameField() {
  const id = useId()
  const name = useEditor((s) => s.doc.name)
  const typing = useEditGesture()
  // What the field shows while it has focus; the map keeps the last valid name.
  const [draft, setDraft] = useState<string | null>(null)
  const empty = draft !== null && draft.trim() === ''

  return (
    <div className="relative min-w-0">
      {/* The page's heading for screen readers; the field shows the name. */}
      <h1 className="sr-only">{name}</h1>
      <input
        id={id}
        aria-label={t.name}
        className={`${inputClass} min-h-9 w-56 max-w-full py-1 text-base font-semibold`}
        value={draft ?? name}
        maxLength={limits.mapName}
        autoComplete="off"
        aria-invalid={empty || undefined}
        aria-describedby={empty ? `${id}-hint` : undefined}
        onFocus={() => {
          setDraft(name)
          typing.begin()
        }}
        onChange={(event) => {
          const value = event.target.value
          setDraft(value)
          typing.change((current, base) => ({
            ...current,
            name: value.trim() ? value : base.name,
          }))
        }}
        onBlur={() => {
          typing.change((current) => {
            const trimmed = current.name.trim()
            return trimmed === current.name ? current : { ...current, name: trimmed }
          })
          typing.end()
          setDraft(null)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
      />
      {empty && (
        <p
          id={`${id}-hint`}
          className="absolute top-full left-0 z-50 mt-1 w-72 rounded-lg border border-red-400/40 bg-panel px-3 py-2 text-xs text-red-300 shadow-lg shadow-black/40"
        >
          {t.nameEmpty(name)}
        </p>
      )}
    </div>
  )
}
