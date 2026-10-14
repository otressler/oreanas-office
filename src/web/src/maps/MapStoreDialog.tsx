// The map store (knowledge/domain/battle-map.md, "Store"): maps of the DM's other campaigns
// that can be copied into this one. Needs the server; the copy comes back as a synced map.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { unwrap } from '../api/errors'
import type { StoreMap } from '../api/types'
import { Button, ErrorAlert, Loading, LoadError } from '../components/ui'
import { formatMeters } from '../lib/units'
import { useLocalUser } from '../offline/localUser'
import { syncNow } from '../sync'
import { LayoutPreview } from '../sync/LayoutPreview'
import { Modal } from '../sync/Modal'
import { writeServerItem } from '../sync/pull'
import { de } from '../text/de'

const t = de.sync.store

const storeKey = (campaignId: string) => ['map-store', campaignId] as const

export function MapStoreDialog({
  campaignId,
  onClose,
  onAdded,
}: {
  campaignId: string
  onClose: () => void
  onAdded: (name: string) => void
}) {
  const { db } = useLocalUser()
  const queryClient = useQueryClient()
  const maps = useQuery({
    queryKey: storeKey(campaignId),
    queryFn: () =>
      unwrap(
        api.GET('/api/campaigns/{campaignId}/map-store', { params: { path: { campaignId } } }),
      ),
  })

  const add = useMutation({
    mutationFn: async (map: StoreMap) => {
      const item = await unwrap(
        api.POST('/api/campaigns/{campaignId}/map-store/{mapId}', {
          params: { path: { campaignId, mapId: map.id } },
        }),
      )
      // The copy is the server's, so it is stored as synced; the pull that follows brings
      // everything else.
      await writeServerItem(db, item)
      void syncNow(db, { reason: 'store' })
      return map
    },
    onSuccess: (map) => {
      void queryClient.invalidateQueries({ queryKey: storeKey(campaignId) })
      onAdded(map.name)
    },
  })

  return (
    <Modal title={t.title} onClose={onClose}>
      <p className="text-dim">{t.intro}</p>
      <ErrorAlert error={add.error} />
      {maps.isPending ? (
        <Loading />
      ) : maps.isError ? (
        <LoadError error={maps.error} onRetry={() => void maps.refetch()} />
      ) : maps.data.length === 0 ? (
        <p className="text-dim">{t.empty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {maps.data.map((map) => (
            <li key={map.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-start">
              <div className="w-full sm:w-44 sm:shrink-0">
                <LayoutPreview
                  width={map.width}
                  height={map.height}
                  layout={map.layout}
                  label={t.preview(map.name)}
                />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="font-semibold break-words">{map.name}</span>
                <span className="text-sm text-dim">
                  {de.maps.size(
                    map.width,
                    map.height,
                    formatMeters(map.width),
                    formatMeters(map.height),
                  )}
                </span>
                <span className="text-sm text-dim">{t.fromCampaign(map.campaignName)}</span>
                {map.hasArchivedCopy && (
                  <span className="text-sm text-candle">{t.addBackHint}</span>
                )}
                <Button
                  className="mt-1 self-start"
                  aria-label={t.addLabel(map.name)}
                  busy={add.isPending && add.variables?.id === map.id}
                  disabled={add.isPending}
                  onClick={() => add.mutate(map)}
                >
                  {map.hasArchivedCopy ? t.addBack : t.add}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
