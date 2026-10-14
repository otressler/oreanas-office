// The "Beschreibung" tool's panel: the free texts for the image prompt
// (knowledge/domain/battle-map.md: scene, vibe, lighting). Typing into a field is one undo
// step from focus to blur, not one per keystroke: focus begins a gesture, typing updates
// it, blur ends it.
import { useId, type ReactNode } from 'react'
import { inputClass } from '../../components/styles'
import { limits } from '../../lib/limits'
import { de } from '../../text/de'
import { useEditor } from '../store'
import { useEditGesture } from '../useEditGesture'

const t = de.maps.scene

type TextKey = 'scene' | 'vibe' | 'lighting'

/** Shows how many characters are left once a text gets close to its limit. */
const LEFT_FROM = 50

export function ScenePanel() {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-dim">{t.help}</p>
      <TextAreaField field="scene" label={t.scene} hint={t.sceneHint} />
      <TextAreaField field="vibe" label={t.vibe} hint={t.vibeHint} />
      <TextAreaField field="lighting" label={t.lighting} hint={t.lightingHint} />
    </div>
  )
}

function TextAreaField({ field, label, hint }: { field: TextKey; label: string; hint: string }) {
  const id = useId()
  const value = useEditor((s) => s.doc[field])
  const typing = useEditGesture()
  const left = limits.mapDescription - value.length

  return (
    <Field id={id} label={label} hint={left <= LEFT_FROM ? `${hint} · ${t.left(left)}` : hint}>
      <textarea
        id={id}
        className={`${inputClass} resize-y`}
        rows={3}
        value={value}
        maxLength={limits.mapDescription}
        aria-describedby={`${id}-hint`}
        onFocus={typing.begin}
        onChange={(event) => {
          const next = event.target.value
          typing.change((current) => ({ ...current, [field]: next }))
        }}
        onBlur={typing.end}
      />
    </Field>
  )
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string
  label: string
  hint: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm text-dim">
        {label}
      </label>
      {children}
      <p id={`${id}-hint`} className="text-xs text-dim">
        {hint}
      </p>
    </div>
  )
}
