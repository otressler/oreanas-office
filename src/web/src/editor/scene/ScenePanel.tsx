// The map's name and the free texts for the image prompt (knowledge/domain/battle-map.md:
// scene, vibe, lighting). Typing into a field is one undo step from focus to blur, not
// one per keystroke: focus begins a gesture, typing updates it, blur ends it.
import { useId, useState, type ReactNode } from 'react'
import { inputClass } from '../../components/styles'
import { limits } from '../../lib/limits'
import { de } from '../../text/de'
import { useEditor, useEditorStore } from '../store'
import type { EditorMap } from '../model'

const t = de.maps.scene

type TextKey = 'scene' | 'vibe' | 'lighting'

/** Shows how many characters are left once a text gets close to its limit. */
const LEFT_FROM = 50

export function ScenePanel() {
  return (
    <div className="flex flex-col gap-3">
      <NameField />
      <TextAreaField field="scene" label={t.scene} hint={t.sceneHint} />
      <TextAreaField field="vibe" label={t.vibe} hint={t.vibeHint} />
      <TextAreaField field="lighting" label={t.lighting} hint={t.lightingHint} />
    </div>
  )
}

/** Typing changes the map inside the running gesture; one begins if none runs. */
function useTyping() {
  const store = useEditorStore()
  return {
    begin: () => store.getState().beginGesture(),
    change: (change: (current: EditorMap, base: EditorMap) => EditorMap) => {
      const state = store.getState()
      // Something else (an undo, a tool) may have ended the gesture while typing.
      if (!state.gestureBase) state.beginGesture()
      // Typing back what was there before makes no undo step.
      store.getState().updateGesture((current, base) => {
        const next = change(current, base)
        return sameMap(next, base) ? base : next
      })
    },
    end: () => store.getState().endGesture(),
  }
}

function sameMap(a: EditorMap, b: EditorMap): boolean {
  return (Object.keys(b) as (keyof EditorMap)[]).every((key) => a[key] === b[key])
}

function NameField() {
  const id = useId()
  const name = useEditor((s) => s.doc.name)
  const typing = useTyping()
  // What the field shows while it has focus; the map keeps the last valid name.
  const [draft, setDraft] = useState<string | null>(null)
  const empty = draft !== null && draft.trim() === ''

  return (
    <Field id={id} label={t.name} hint={empty ? t.nameEmpty(name) : undefined} invalid={empty}>
      <input
        id={id}
        className={inputClass}
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
          // An empty name isn't saved: the map keeps the name it had before typing.
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
      />
    </Field>
  )
}

function TextAreaField({ field, label, hint }: { field: TextKey; label: string; hint: string }) {
  const id = useId()
  const value = useEditor((s) => s.doc[field])
  const typing = useTyping()
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
  invalid = false,
  children,
}: {
  id: string
  label: string
  hint?: string
  invalid?: boolean
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm text-dim">
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className={`text-xs ${invalid ? 'text-red-300' : 'text-dim'}`}>
          {hint}
        </p>
      )}
    </div>
  )
}
