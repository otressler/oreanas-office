// The "Hintergrund" panel (knowledge/features/ai-map-generation.md): generate a background
// after the DM confirmed the job, follow it over the image hub while it runs, compare the
// versions and pick one (or none). Everything here needs a connection; offline it says so.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, type ReactNode } from 'react'
import { errorMessage } from '../../api/errors'
import type { MapBackground, MapBackgrounds } from '../../api/types'
import { Badge, Button, ErrorAlert } from '../../components/ui'
import { formatDateTime } from '../../lib/dates'
import { useLocalUser } from '../../offline/localUser'
import { syncMapBeforeGenerate } from '../../sync'
import { de } from '../../text/de'
import { useEditorTarget } from '../encounter/store'
import { useOnline } from '../encounter/useOnline'
import { saveMap } from '../maps'
import { editorMapOf } from '../model'
import { useEditor, useEditorStore } from '../store'
import {
  backgroundsKey,
  budgetBlock,
  canPick,
  formatUsd,
  generateBackground,
  hasPendingJob,
  isOutdated,
  pickBackground,
  pickedVersion,
  useMapBackgrounds,
  withVersion,
  type MapSize,
} from './backgrounds'
import { CompareDialog } from './CompareDialog'
import { ConfirmDialog } from './ConfirmDialog'
import { createImageConnection } from './createConnection'
import { useBackgroundWatch } from './watch'

const t = de.maps.background

const Help = ({ children }: { children: ReactNode }) => (
  <p className="text-sm text-dim">{children}</p>
)

export function BackgroundPanel() {
  const online = useOnline()
  // Offline nothing is asked for and no connection is opened: one clear line instead.
  if (!online) return <Help>{t.offline}</Help>
  return <OnlinePanel />
}

type Message = { kind: 'info' | 'error'; text: string } | null

function OnlinePanel() {
  const { campaignId, mapId } = useEditorTarget()
  const { db } = useLocalUser()
  const queryClient = useQueryClient()
  const width = useEditor((s) => s.doc.width)
  const height = useEditor((s) => s.doc.height)
  const doc = useEditor((s) => s.doc)
  const size: MapSize = useMemo(() => ({ width, height }), [width, height])

  const { query, notSynced, enabled } = useMapBackgrounds(campaignId, mapId)
  const data = enabled ? query.data : undefined
  const versions = data?.versions ?? []
  const pending = hasPendingJob(versions)
  const key = backgroundsKey(campaignId, mapId)
  const refetch = () => queryClient.invalidateQueries({ queryKey: key })

  useBackgroundWatch({
    active: pending,
    campaignId,
    mapId,
    createConnection: createImageConnection,
    onUpdate: (background) => {
      queryClient.setQueryData<MapBackgrounds>(key, (current) =>
        current ? withVersion(current, background) : current,
      )
      // A finished image counts against the month: fetch the budget along.
      if (background.status === 'done' || background.status === 'failed') void refetch()
    },
    onWatching: () => void refetch(),
  })

  const store = useEditorStore()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<Message>(null)
  const [comparing, setComparing] = useState<string | null>(null)

  const pick = useMutation({
    mutationFn: (assetId: string | null) => pickBackground(campaignId, mapId, assetId),
    onMutate: () => setMessage(null),
    onError: (error) => setMessage({ kind: 'error', text: errorMessage(error) }),
    onSettled: () => refetch(),
  })

  async function generate() {
    setConfirming(false)
    setBusy(true)
    setMessage({ kind: 'info', text: t.syncing })
    try {
      // The server paints from its own copy: save edits the autosave hasn't written yet,
      // then sync the map.
      const doc = store.getState().doc
      const stored = await db.maps.get(mapId)
      if (stored && JSON.stringify(editorMapOf(stored)) !== JSON.stringify(doc)) {
        await saveMap(db, mapId, doc)
      }
      const synced = await syncMapBeforeGenerate(db, mapId)
      if (synced.result === 'offline') {
        setMessage({ kind: 'error', text: t.syncOffline })
        return
      }
      if (synced.result === 'blocked' || synced.version === null) {
        setMessage({ kind: 'error', text: t.syncBlocked })
        return
      }
      const created = await generateBackground(campaignId, mapId, synced.version)
      queryClient.setQueryData<MapBackgrounds>(key, (current) =>
        current ? withVersion(current, created) : current,
      )
      setMessage({ kind: 'info', text: t.queued })
      void refetch()
    } catch (error) {
      setMessage({ kind: 'error', text: errorMessage(error) })
      void refetch()
    } finally {
      setBusy(false)
    }
  }

  const block = budgetBlock(data?.budget)
  const picked = pickedVersion(data)
  const pickedId = data?.pickedAssetId ?? null
  const viewable = versions.filter((v) => v.status === 'done' && v.url)
  const loading = enabled && query.isPending
  const failed = enabled && query.isError
  const canGenerate = !busy && !pending && !block && !loading && !failed

  return (
    <div className="flex flex-col gap-3">
      <Help>{t.help}</Help>
      {notSynced && <Help>{t.notSynced}</Help>}
      {picked && isOutdated(picked, size) && (
        <p role="alert" className="text-sm text-red-300">
          {t.pickedOutdated}
        </p>
      )}
      {block && (
        <p className="text-sm text-red-300">
          {block === 'exhausted' ? t.budgetExhausted : t.unavailable}
        </p>
      )}

      <div>
        <Button
          variant="primary"
          busy={busy}
          disabled={!canGenerate}
          onClick={() => {
            setMessage(null)
            setConfirming(true)
          }}
        >
          {versions.length > 0 ? t.regenerate : t.generate}
        </Button>
      </div>
      {pending && <Help>{t.running}</Help>}
      {message?.kind === 'info' && (
        <p role="status" className="text-sm text-parchment">
          {message.text}
        </p>
      )}
      {message?.kind === 'error' && <ErrorAlert error={message.text} />}

      {loading && <Help>{de.common.loading}</Help>}
      {failed && (
        <div className="flex flex-col items-start gap-2">
          <ErrorAlert error={t.loadFailed} />
          <Button onClick={() => void query.refetch()}>{de.common.retry}</Button>
        </div>
      )}

      {data && (
        <section aria-label={t.versions} className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{t.versions}</h3>
          {versions.length === 0 ? (
            <Help>{t.empty}</Help>
          ) : (
            <ul className="flex flex-col gap-3">
              {versions.map((version) => (
                <Version
                  key={version.id}
                  version={version}
                  size={size}
                  picked={version.id === pickedId}
                  pickBusy={pick.isPending}
                  onPick={() => pick.mutate(version.id)}
                  onEnlarge={() => setComparing(version.id)}
                />
              ))}
            </ul>
          )}
          {pickedId && (
            <div className="flex flex-col items-start gap-1">
              <Button busy={pick.isPending} onClick={() => pick.mutate(null)}>
                {t.pickNone}
              </Button>
              <Help>{t.noneHint}</Help>
            </div>
          )}
          <p className="text-xs text-dim tabular-nums">
            {t.spent(formatUsd(data.budget.spentUsd), formatUsd(data.budget.limitUsd))}
          </p>
        </section>
      )}

      {confirming && (
        <ConfirmDialog
          budget={data?.budget}
          onConfirm={() => void generate()}
          onClose={() => setConfirming(false)}
        />
      )}
      {comparing && viewable.length > 0 && (
        <CompareDialog
          versions={viewable}
          startId={comparing}
          pickedId={pickedId}
          doc={doc}
          onClose={() => setComparing(null)}
        />
      )}
    </div>
  )
}

function Version({
  version,
  size,
  picked,
  pickBusy,
  onPick,
  onEnlarge,
}: {
  version: MapBackground
  size: MapSize
  picked: boolean
  pickBusy: boolean
  onPick: () => void
  onEnlarge: () => void
}) {
  const time = formatDateTime(version.createdAt)
  const outdated = isOutdated(version, size)
  const done = version.status === 'done' && version.url
  return (
    <li
      aria-label={t.versionAlt(time)}
      className={`flex flex-col gap-1 rounded-lg border p-2 ${picked ? 'border-candle' : 'border-line'}`}
    >
      {done ? (
        <button
          type="button"
          onClick={onEnlarge}
          title={t.enlarge}
          aria-label={`${t.enlarge}: ${t.versionAlt(time)}`}
          className="overflow-hidden rounded border border-line hover:border-candle"
        >
          <img
            src={version.url!}
            alt={t.versionAlt(time)}
            loading="lazy"
            decoding="async"
            className={`aspect-video w-full object-cover ${outdated ? 'opacity-50' : ''}`}
          />
        </button>
      ) : (
        <div className="flex aspect-video w-full items-center justify-center rounded border border-dashed border-line text-sm text-dim">
          {t.status[version.status]}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-dim tabular-nums">{time}</span>
        {version.status !== 'done' && <span>{t.status[version.status]}</span>}
        {picked && <Badge tone="candle">{t.picked}</Badge>}
        {outdated && <Badge>{t.outdated}</Badge>}
      </div>
      {version.status === 'failed' && (
        <p className="text-xs text-red-300">
          {version.failure === 'rejected' ? t.rejected : t.failed}
        </p>
      )}
      {outdated && version.status === 'done' && (
        <p className="text-xs text-dim">{t.outdatedHint}</p>
      )}
      {!outdated && version.layoutChanged && version.status === 'done' && (
        <p className="text-xs text-dim">{t.layoutChanged}</p>
      )}
      {!picked && canPick(version, size) && (
        <div>
          <Button className="min-h-9 px-3 text-sm" busy={pickBusy} onClick={onPick}>
            {t.pick}
          </Button>
        </div>
      )}
    </li>
  )
}
