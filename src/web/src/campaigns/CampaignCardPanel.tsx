// What the home page's card shows of a campaign (knowledge/features/campaign-overview.md):
// `dm` members change its name and description and pick its cover here. Needs a connection,
// like every campaign change but creating one.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useState, type FormEvent } from 'react'
import { api } from '../api/client'
import { errorMessage, unwrap } from '../api/errors'
import type { Campaign } from '../api/types'
import { CANDLE } from '../board/palette'
import { Button, ErrorAlert, Panel, TextField } from '../components/ui'
import { inputClass } from '../components/styles'
import { limits } from '../lib/limits'
import { de } from '../text/de'
import { TokenImageGallery, type Prepared } from '../tokenImages/TokenImageGallery'
import { campaignKeys } from './queries'

const t = de.campaign

export function CampaignCardPanel({ campaign }: { campaign: Campaign }) {
  const [open, setOpen] = useState(false)
  return (
    <Panel
      title={t.cardTitle}
      action={
        !open && (
          <Button variant="secondary" onClick={() => setOpen(true)}>
            {t.edit}
          </Button>
        )
      }
    >
      {open && <CardEditor campaign={campaign} onDone={() => setOpen(false)} />}
    </Panel>
  )
}

function CardEditor({ campaign, onDone }: { campaign: Campaign; onDone: () => void }) {
  const queryClient = useQueryClient()
  const descriptionId = useId()
  const [name, setName] = useState(campaign.name)
  const [description, setDescription] = useState(campaign.description ?? '')

  const save = useMutation({
    mutationFn: () =>
      unwrap(
        api.PUT('/api/campaigns/{campaignId}', {
          params: { path: { campaignId: campaign.id } },
          body: { name: name.trim(), description: description.trim() || null },
        }),
      ),
    onSuccess: (updated) => {
      queryClient.setQueryData(campaignKeys.detail(campaign.id), updated)
      void queryClient.invalidateQueries({ queryKey: campaignKeys.list })
    },
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    save.mutate(undefined, { onSuccess: onDone })
  }

  /** Before a cover job: saves a changed name or description, since the server paints from its copy. */
  async function prepare(progress: (text: string) => void): Promise<Prepared> {
    const changed =
      name.trim() !== campaign.name || description.trim() !== (campaign.description ?? '')
    if (changed) {
      if (!name.trim()) return { error: de.errors.nameInvalid }
      progress(t.saving)
      try {
        await save.mutateAsync()
      } catch (error) {
        return { error: errorMessage(error) }
      }
    }
    return { body: {} }
  }

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <TextField
          label={t.name}
          required
          maxLength={limits.campaignName}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <div className="flex flex-col gap-1">
          <label htmlFor={descriptionId} className="text-sm text-dim">
            {t.description}
          </label>
          <textarea
            id={descriptionId}
            rows={3}
            value={description}
            maxLength={limits.campaignDescription}
            aria-describedby={`${descriptionId}-hint`}
            className={`${inputClass} resize-y`}
            onChange={(event) => setDescription(event.target.value)}
          />
          <p id={`${descriptionId}-hint`} className="text-sm text-dim">
            {t.descriptionHint} ({Array.from(description).length}/{limits.campaignDescription})
          </p>
        </div>
        <ErrorAlert error={save.error} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" busy={save.isPending}>
            {de.common.save}
          </Button>
          <Button onClick={onDone}>{de.common.cancel}</Button>
        </div>
      </form>
      <section aria-label={t.coverTitle} className="flex flex-col gap-2">
        <h3 className="font-semibold text-parchment">{t.coverTitle}</h3>
        <TokenImageGallery
          campaignId={campaign.id}
          owner={{ type: 'campaign', id: campaign.id }}
          name={campaign.name}
          ring={CANDLE}
          shape="cover"
          generateLabel={t.generateCover}
          regenerateLabel={t.regenerateCover}
          generateHint={description.trim() ? null : t.coverNeedsDescription}
          prepare={prepare}
          uploads
          noneHint={t.coverNoneHint}
          rejectedHint={t.coverRejected}
        />
      </section>
    </div>
  )
}
