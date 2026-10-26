// The background layer of the map editor's canvas (knowledge/features/dm-map-editor.md,
// "Background"): BackgroundSource hands the picked version from the "Hintergrund" query to the
// editor store, so the canvas draws it under the layout; BackgroundToggle shows or hides it.
import { useEffect } from 'react'
import { de } from '../../text/de'
import { useEditor, useEditorStore } from '../store'
import { shownVersion, useMapBackgrounds } from './backgrounds'

const t = de.maps.background

/** Keeps the editor store's `background` in step with the server's picked version. */
export function BackgroundSource({ campaignId, mapId }: { campaignId: string; mapId: string }) {
  const store = useEditorStore()
  const { query, enabled } = useMapBackgrounds(campaignId, mapId)
  const width = useEditor((s) => s.doc.width)
  const height = useEditor((s) => s.doc.height)
  const data = enabled ? query.data : undefined
  const version = shownVersion(data, { width, height })
  useEffect(() => {
    // A new object for the same version (a refetch) doesn't need a redraw.
    const current = store.getState().background
    if (current?.id === version?.id && current?.url === version?.url) return
    store.getState().setBackground(version)
  }, [store, version])
  useEffect(() => () => store.getState().setBackground(null), [store])
  return null
}

/** Shows or hides the picture under the layout; only while there is one. */
export function BackgroundToggle({ className = '' }: { className?: string }) {
  const background = useEditor((s) => s.background)
  const visible = useEditor((s) => s.backgroundVisible)
  const setVisible = useEditor((s) => s.setBackgroundVisible)
  if (!background) return null
  return (
    <button
      type="button"
      aria-pressed={visible}
      onClick={() => setVisible(!visible)}
      className={`inline-flex min-h-9 items-center gap-2 rounded-lg border border-line bg-panel/90 px-3 text-sm text-parchment shadow-lg shadow-black/40 hover:border-candle ${className}`}
    >
      <span
        aria-hidden="true"
        className={`h-2.5 w-2.5 rounded-full ${visible ? 'bg-candle' : 'border border-dim'}`}
      />
      {t.layer}
    </button>
  )
}
