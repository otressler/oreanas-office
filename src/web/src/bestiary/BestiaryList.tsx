// The campaign's creature types as a compact list for the editor's side panel: pick one,
// edit it, create a new one, and bring archived ones back. Editing and creating open the
// creature page as a dialog over the editor (CreatureDialog). The bestiary's own page shows
// them as cards instead (knowledge/features/creature-page.md). Archived types are in a
// collapsed part and can't be picked (knowledge/domain/creature-type.md). Online, a row
// shows the type's picked icon (knowledge/features/token-icons.md).
import { useState } from 'react'
import { CREATURE_RING, tokenFill } from '../board/palette'
import { Button } from '../components/ui'
import { useLocalUser } from '../offline/localUser'
import type { LocalCreatureType } from '../offline/model'
import { de } from '../text/de'
import { useCreatureIcons } from '../tokenImages/queries'
import { CreatureDialog } from './CreaturePage'
import { setCreatureTypeArchived, useCreatureTypes } from './creatureTypes'

const t = de.bestiary

/** The type open in the dialog: undefined while it is closed, null for a new one. */
type Open = string | null | undefined

export function BestiaryList({
  campaignId,
  pickedId = null,
  onPick,
}: {
  campaignId: string
  pickedId?: string | null
  /** Called with null when the picked type was archived. */
  onPick: (type: LocalCreatureType | null) => void
}) {
  const { db } = useLocalUser()
  const types = useCreatureTypes(db, campaignId)
  const icons = useCreatureIcons(campaignId)
  const [open, setOpen] = useState<Open>(undefined)
  if (types === undefined) return null

  const active = types.filter((type) => type.archivedAt === null)
  const archived = types.filter((type) => type.archivedAt !== null)
  const close = () => setOpen(undefined)

  return (
    <div className="flex flex-col gap-3">
      {active.length === 0 && <p className="text-sm text-dim">{t.empty}</p>}
      <ul className="flex flex-col gap-1">
        {active.map((type) => (
          <li key={type.id} className="flex items-center gap-1">
            <button
              type="button"
              aria-pressed={type.id === pickedId}
              aria-label={t.pick(type.name)}
              onClick={() => onPick(type)}
              className={`flex min-h-9 min-w-0 flex-1 items-center justify-between gap-2 rounded-lg border px-3 text-left text-sm ${
                type.id === pickedId
                  ? 'border-candle bg-candle/15 text-candle'
                  : 'border-line text-parchment hover:border-candle'
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <Icon url={icons.get(type.id)?.url} name={type.name} />
                <span className="truncate">{type.name}</span>
              </span>
              <span className="shrink-0 text-xs text-dim">{de.sizes[type.size]}</span>
            </button>
            <button
              type="button"
              aria-label={t.edit(type.name)}
              title={t.edit(type.name)}
              onClick={() => setOpen(type.id)}
              className="min-h-9 rounded-lg px-2 text-sm text-dim hover:text-parchment"
            >
              {t.editShort}
            </button>
          </li>
        ))}
      </ul>

      <div>
        <Button onClick={() => setOpen(null)}>{t.newType}</Button>
      </div>
      {open !== undefined && (
        <CreatureDialog
          campaignId={campaignId}
          typeId={open}
          onSaved={(type) => {
            close()
            // A new type becomes the pick; an edited one updates it.
            if (open === null || type.id === pickedId) onPick(type)
          }}
          onArchived={(type) => {
            close()
            if (type.id === pickedId) onPick(null)
          }}
          onClose={close}
        />
      )}

      {archived.length > 0 && (
        <details className="rounded-lg border border-line px-3 py-2">
          <summary className="cursor-pointer text-sm text-dim">
            {t.archived(archived.length)}
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {archived.map((type) => (
              <li key={type.id} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-dim">{type.name}</span>
                <button
                  type="button"
                  aria-label={t.restoreLabel(type.name)}
                  onClick={() => void setCreatureTypeArchived(db, type.id, false)}
                  className="min-h-9 rounded-lg px-2 text-candle hover:underline"
                >
                  {t.restore}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

/** A type's picked icon, small, in the creatures' red ring; nothing without one. */
function Icon({ url, name }: { url: string | undefined; name: string }) {
  if (!url) return null
  return (
    <img
      src={url}
      alt={t.icon.alt(name)}
      decoding="async"
      className="h-7 w-7 shrink-0 rounded-full border-2 object-cover"
      style={{ borderColor: CREATURE_RING, backgroundColor: tokenFill(CREATURE_RING) }}
    />
  )
}
