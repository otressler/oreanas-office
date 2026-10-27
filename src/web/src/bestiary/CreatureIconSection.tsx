// The icon part of an existing creature type's form (knowledge/features/token-icons.md):
// the gallery of its icons, generated or uploaded. The server paints from its own copy of the type, so generating
// saves the form's edits, syncs the type and sends the version it was synced at. A type the
// server has never seen gets no gallery until it is synced; the section says so.
import { useState } from 'react'
import { Button, ErrorAlert } from '../components/ui'
import { CREATURE_RING } from '../board/palette'
import { useOnline } from '../editor/encounter/useOnline'
import { useLocalUser } from '../offline/localUser'
import type { LocalCreatureType } from '../offline/model'
import { syncCreatureTypeBeforeGenerate } from '../sync/client'
import { de } from '../text/de'
import { TokenImageGallery, type Prepared } from '../tokenImages/TokenImageGallery'

const t = de.bestiary.icon

export function CreatureIconSection({
  campaignId,
  type,
  saveDraft,
  layout = 'inline',
}: {
  campaignId: string
  /** The stored type, kept up to date. */
  type: LocalCreatureType
  /** Writes the form's unsaved edits to the device; false when they can't be saved. */
  saveDraft: () => Promise<boolean>
  /** Under the portrait on the type's page, or below the fields of the editor's form. */
  layout?: 'inline' | 'sidebar'
}) {
  const { db } = useLocalUser()
  const online = useOnline()
  const notSynced = type.sync.baseVersion === 0

  /** Saves and syncs the type: its server version, or why not. */
  async function sync(
    progress: (text: string) => void,
  ): Promise<{ version: number } | { error: string }> {
    if (!(await saveDraft())) return { error: t.fixFirst }
    progress(t.syncing)
    const synced = await syncCreatureTypeBeforeGenerate(db, type.id)
    if (synced.result === 'offline') return { error: t.syncOffline }
    if (synced.result === 'blocked' || synced.version === null) return { error: t.syncBlocked }
    return { version: synced.version }
  }

  async function prepare(progress: (text: string) => void): Promise<Prepared> {
    const synced = await sync(progress)
    return 'error' in synced
      ? { error: `${synced.error} ${t.nothingGenerated}` }
      : { body: { itemVersion: synced.version } }
  }

  return (
    <section
      aria-label={t.title}
      className={`flex flex-col gap-2 ${layout === 'inline' ? 'border-t border-line pt-3' : ''}`}
    >
      <h4 className="font-semibold text-parchment">{t.title}</h4>
      <p className="text-sm text-dim">{t.help}</p>
      {!online ? (
        <p className="text-sm text-dim">{de.tokenImages.offline}</p>
      ) : notSynced ? (
        <SyncFirst sync={sync} />
      ) : (
        <TokenImageGallery
          campaignId={campaignId}
          owner={{ type: 'creatureType', id: type.id }}
          name={type.name}
          ring={CREATURE_RING}
          generateLabel={t.generate}
          regenerateLabel={t.regenerate}
          prepare={prepare}
          uploads
          layout={layout}
        />
      )}
    </section>
  )
}

/** A type only on this device: it must reach the server before it can have icons. */
function SyncFirst({
  sync,
}: {
  sync: (progress: (text: string) => void) => Promise<{ version: number } | { error: string }>
}) {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="flex flex-col items-start gap-2">
      <p className="text-sm text-dim">{t.notSynced}</p>
      <Button
        busy={busy}
        onClick={async () => {
          setBusy(true)
          setError(null)
          try {
            const result = await sync(setStatus)
            if ('error' in result) setError(result.error)
          } finally {
            setStatus(null)
            setBusy(false)
          }
        }}
      >
        {t.syncNow}
      </Button>
      {status && (
        <p role="status" className="text-sm text-parchment">
          {status}
        </p>
      )}
      <ErrorAlert error={error} />
    </div>
  )
}
