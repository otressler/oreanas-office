// The gallery of a creature type's icons, a character's portraits, a custom status's icons
// or a campaign's covers (knowledge/features/token-icons.md, statuses.md,
// knowledge/domain/campaign.md): the picked image in the token's ring (or as a cover), the versions with their state, picking one or none, generating after a confirm,
// uploading through the crop step (characters and creature types) and restyling an upload
// (characters). It follows running jobs over the image hub only while one is queued or
// running. Everything needs a connection; offline it says so instead.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type ReactNode } from 'react'
import { errorMessage } from '../api/errors'
import type { GenerateTokenImageRequest, TokenImage, TokenImages } from '../api/types'
import { CampaignCover } from '../campaigns/CampaignCover'
import { Badge, Button, ErrorAlert } from '../components/ui'
import { budgetBlock, formatUsd } from '../editor/background/backgrounds'
import { useOnline } from '../editor/encounter/useOnline'
import { formatDateTime } from '../lib/dates'
import { de } from '../text/de'
import { ConfirmDialog, type TokenJob } from './ConfirmDialog'
import { createTokenImageConnection } from './createConnection'
import { CropDialog, type CropShape } from './CropDialog'
import {
  canPickImage,
  generateTokenImage,
  hasPendingImage,
  imageKind,
  pickedImage,
  pickedImageKeys,
  pickTokenImage,
  tokenImagesKey,
  uploadTokenImage,
  useTokenImages,
  withImage,
  type TokenImageOwner,
} from './queries'
import { TokenPicture } from './TokenPicture'
import { useTokenImageWatch } from './watch'

const t = de.tokenImages

const Help = ({ children }: { children: ReactNode }) => (
  <p className="text-sm text-dim">{children}</p>
)

/** The job each owner's generate button starts. */
const JOBS: Record<TokenImageOwner['type'], TokenJob> = {
  character: 'portrait',
  creatureType: 'icon',
  status: 'statusIcon',
  campaign: 'cover',
}

/** What a job needs from the owner's form first: the request, or why nothing was sent. */
export type Prepared = { body: GenerateTokenImageRequest } | { error: string }

export interface TokenImageGalleryProps {
  campaignId: string
  owner: TokenImageOwner
  /** The owner's name: the letter while there is no image. */
  name: string
  ring: string
  generateLabel: string
  regenerateLabel: string
  /** Why generating isn't offered right now (shown under the button), or null. */
  generateHint?: string | null
  /**
   * Runs after the confirm, before the job: saves or syncs the owner. `progress` shows
   * what is happening meanwhile.
   */
  prepare: (progress: (text: string) => void) => Promise<Prepared>
  /** Characters and creature types: upload through the crop step. */
  uploads?: boolean
  /** Characters: restyle uploaded versions in the token style. */
  restyles?: boolean
  /** What "Ohne Bild" means for this owner; the token's letter by default. */
  noneHint?: string
  /** What to change after the model refused a picture; the appearance by default. */
  rejectedHint?: string
  /** Campaigns: pictures are 3:2 covers instead of tokens. */
  shape?: CropShape
}

export function TokenImageGallery(props: TokenImageGalleryProps) {
  const online = useOnline()
  // Offline nothing is asked for and no connection is opened: one clear line instead.
  if (!online) return <Help>{t.offline}</Help>
  return <OnlineGallery {...props} />
}

type Message = { kind: 'info' | 'error'; text: string } | null

function OnlineGallery({
  campaignId,
  owner,
  name,
  ring,
  generateLabel,
  regenerateLabel,
  generateHint = null,
  prepare,
  uploads = false,
  restyles = false,
  noneHint = t.noneHint,
  rejectedHint = t.rejected,
  shape = 'token',
}: TokenImageGalleryProps) {
  const queryClient = useQueryClient()
  const query = useTokenImages(campaignId, owner, true)
  const data = query.data
  const versions = data?.versions ?? []
  const pending = hasPendingImage(versions)
  const key = tokenImagesKey(campaignId, owner)
  const refetch = () => queryClient.invalidateQueries({ queryKey: key })
  /** Whatever shows the picked image elsewhere: the character list or the bestiary's icons. */
  const refreshPicked = () =>
    Promise.all(
      pickedImageKeys(campaignId, owner).map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    )
  const remember = (image: TokenImage) =>
    queryClient.setQueryData<TokenImages>(key, (current) =>
      current ? withImage(current, image) : current,
    )

  useTokenImageWatch({
    active: pending,
    campaignId,
    owner,
    createConnection: createTokenImageConnection,
    onUpdate: (image) => {
      remember(image)
      // A finished image is picked by the server and counts against the month.
      if (image.status === 'done' || image.status === 'failed') {
        void refetch()
        if (image.status === 'done') void refreshPicked()
      }
    },
    onWatching: () => void refetch(),
  })

  const [confirming, setConfirming] = useState<{ job: TokenJob; restyle?: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<Message>(null)
  const [cropping, setCropping] = useState<File | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const pick = useMutation({
    mutationFn: (assetId: string | null) => pickTokenImage(campaignId, owner, assetId),
    onMutate: () => setMessage(null),
    onError: (error) => setMessage({ kind: 'error', text: errorMessage(error) }),
    onSettled: () => Promise.all([refetch(), refreshPicked()]),
  })

  async function generate(restyleAssetId?: string) {
    setConfirming(null)
    setBusy(true)
    setMessage(null)
    try {
      let body: GenerateTokenImageRequest
      if (restyleAssetId) body = { restyleAssetId }
      else {
        const prepared = await prepare((text) => setMessage({ kind: 'info', text }))
        if ('error' in prepared) {
          setMessage({ kind: 'error', text: prepared.error })
          return
        }
        body = prepared.body
      }
      remember(await generateTokenImage(campaignId, owner, body))
      setMessage({ kind: 'info', text: t.queued })
      void refetch()
    } catch (error) {
      setMessage({ kind: 'error', text: errorMessage(error) })
      void refetch()
    } finally {
      setBusy(false)
    }
  }

  async function upload(picture: Blob) {
    const created = await uploadTokenImage(campaignId, owner, picture)
    remember(created)
    setCropping(null)
    setMessage({ kind: 'info', text: t.uploaded })
    await Promise.all([refetch(), refreshPicked()])
  }

  const block = budgetBlock(data?.budget)
  const picked = pickedImage(data)
  const pickedId = data?.pickedAssetId ?? null
  const loading = query.isPending
  const canStart = !busy && !pending && !loading && !query.isError
  const canGenerate = canStart && !block && !generateHint
  const job: TokenJob = JOBS[owner.type]

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {shape === 'cover' ? (
          <CampaignCover
            url={picked?.url}
            alt={t.pickedAlt(name)}
            sizes="240px"
            className="aspect-[3/2] w-60 rounded-lg border border-line"
          />
        ) : (
          <TokenPicture
            url={picked?.url}
            label={name}
            ring={ring}
            alt={t.pickedAlt(name)}
            className="h-20 w-20 text-3xl"
          />
        )}
        <div className="flex min-w-0 flex-col items-start gap-2">
          <Button
            variant="primary"
            busy={busy}
            disabled={!canGenerate}
            onClick={() => {
              setMessage(null)
              setConfirming({ job })
            }}
          >
            {versions.length > 0 ? regenerateLabel : generateLabel}
          </Button>
          {uploads && (
            <>
              <Button disabled={busy || loading} onClick={() => fileInput.current?.click()}>
                {t.upload}
              </Button>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                hidden
                data-testid="portrait-file"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  // The same file can be picked again after cancelling.
                  event.target.value = ''
                  if (file) {
                    setMessage(null)
                    setCropping(file)
                  }
                }}
              />
            </>
          )}
        </div>
      </div>
      {generateHint && <Help>{generateHint}</Help>}
      {block && (
        <p className="text-sm text-red-300">
          {block === 'exhausted' ? t.budgetExhausted : t.unavailable}
        </p>
      )}
      {pending && <Help>{t.running}</Help>}
      {message?.kind === 'info' && (
        <p role="status" className="text-sm text-parchment">
          {message.text}
        </p>
      )}
      {message?.kind === 'error' && <ErrorAlert error={message.text} />}

      {loading && <Help>{de.common.loading}</Help>}
      {query.isError && (
        <div className="flex flex-col items-start gap-2">
          <ErrorAlert error={t.loadFailed} />
          <Button onClick={() => void query.refetch()}>{de.common.retry}</Button>
        </div>
      )}

      {data && (
        <section aria-label={t.versions} className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold">{t.versions}</h4>
          {versions.length === 0 ? (
            <Help>{t.empty}</Help>
          ) : (
            <ul className="flex flex-col gap-2">
              {versions.map((version) => (
                <Version
                  key={version.id}
                  version={version}
                  name={name}
                  ring={ring}
                  shape={shape}
                  rejectedHint={rejectedHint}
                  picked={version.id === pickedId}
                  pickBusy={pick.isPending}
                  onPick={() => pick.mutate(version.id)}
                  restyle={
                    restyles && imageKind(version) === 'uploaded' && canPickImage(version)
                      ? {
                          enabled: canStart && !block,
                          onClick: () => {
                            setMessage(null)
                            setConfirming({ job: 'restyle', restyle: version.id })
                          },
                        }
                      : null
                  }
                />
              ))}
            </ul>
          )}
          {pickedId && (
            <div className="flex flex-col items-start gap-1">
              <Button busy={pick.isPending} onClick={() => pick.mutate(null)}>
                {t.pickNone}
              </Button>
              <Help>{noneHint}</Help>
            </div>
          )}
          <p className="text-xs text-dim tabular-nums">
            {t.spent(formatUsd(data.budget.spentUsd), formatUsd(data.budget.limitUsd))}
          </p>
        </section>
      )}

      {confirming && (
        <ConfirmDialog
          job={confirming.job}
          budget={data?.budget}
          onConfirm={() => void generate(confirming.restyle)}
          onClose={() => setConfirming(null)}
        />
      )}
      {cropping && (
        <CropDialog
          file={cropping}
          ring={ring}
          shape={shape}
          onConfirm={upload}
          onClose={() => setCropping(null)}
        />
      )}
    </div>
  )
}

function Version({
  version,
  name,
  ring,
  shape,
  rejectedHint,
  picked,
  pickBusy,
  onPick,
  restyle,
}: {
  version: TokenImage
  name: string
  ring: string
  shape: CropShape
  rejectedHint: string
  picked: boolean
  pickBusy: boolean
  onPick: () => void
  restyle: { enabled: boolean; onClick: () => void } | null
}) {
  const time = formatDateTime(version.createdAt)
  const done = canPickImage(version)
  return (
    <li
      aria-label={t.versionAlt(time)}
      className={`flex items-start gap-3 rounded-lg border p-2 ${picked ? 'border-candle' : 'border-line'}`}
    >
      {done && shape === 'cover' ? (
        <CampaignCover
          url={version.url}
          alt={t.versionAlt(time)}
          sizes="72px"
          className="aspect-[3/2] w-18 shrink-0 rounded"
        />
      ) : done ? (
        <TokenPicture
          url={version.url}
          label={name}
          ring={ring}
          alt={t.versionAlt(time)}
          className="h-12 w-12 text-lg"
        />
      ) : (
        <span
          aria-hidden="true"
          className={`flex h-12 shrink-0 items-center justify-center border-2 border-dashed border-line text-xs text-dim ${
            shape === 'cover' ? 'w-18 rounded' : 'w-12 rounded-full'
          }`}
        >
          {version.status === 'failed' ? '!' : '…'}
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-dim tabular-nums">{time}</span>
          <span>{t.kind[imageKind(version)]}</span>
          {version.status !== 'done' && <span>{t.status[version.status]}</span>}
          {picked && <Badge tone="candle">{t.picked}</Badge>}
        </div>
        {version.status === 'failed' && (
          <p className="text-xs text-red-300">
            {version.failure === 'rejected' ? rejectedHint : t.failed}
          </p>
        )}
        {(done && !picked) || restyle ? (
          <div className="flex flex-wrap gap-2">
            {done && !picked && (
              <Button className="min-h-9 px-3 text-sm" busy={pickBusy} onClick={onPick}>
                {t.pick}
              </Button>
            )}
            {restyle && (
              <Button
                className="min-h-9 px-3 text-sm"
                disabled={!restyle.enabled}
                onClick={restyle.onClick}
              >
                {t.restyle}
              </Button>
            )}
          </div>
        ) : null}
      </div>
    </li>
  )
}
