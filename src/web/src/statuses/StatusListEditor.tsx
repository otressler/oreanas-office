// A status list ("Zustandsliste", knowledge/features/statuses.md, "Status lists"): a
// character's, or a `dm` member's own. Whoever may change it orders it, takes statuses out,
// adds any status of the campaign back, and makes custom ones ("Eigener Zustand") whose icon
// is generated in the shared token style after a confirm step. Everyone else only reads it.
// Everything needs a connection, like every campaign change but creating a campaign.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useState, type FormEvent } from 'react'
import { errorMessage } from '../api/errors'
import type { StatusDefinition, StatusList } from '../api/types'
import { CANDLE } from '../board/palette'
import { Badge, Button, ErrorAlert, Note, SelectField, TextField } from '../components/ui'
import { inputClass } from '../components/styles'
import { useOnline } from '../editor/encounter/useOnline'
import { de } from '../text/de'
import { TokenImageGallery } from '../tokenImages/TokenImageGallery'
import { statusName } from './names'
import {
  createStatus,
  moveInList,
  saveStatusList,
  statusKeys,
  useCampaignStatuses,
  useStatusList,
  type StatusListOwner,
} from './queries'
import { StatusIcon } from './StatusIcon'

const t = de.statuses.list

/** StatusDefinition.NameMaxLength and IconDescriptionMaxLength on the server. */
export const STATUS_NAME_MAX = 40
export const STATUS_ICON_DESCRIPTION_MAX = 300

export function StatusListEditor({
  campaignId,
  owner,
}: {
  campaignId: string
  owner: StatusListOwner
}) {
  const online = useOnline()
  if (!online) return <p className="text-sm text-dim">{t.offline}</p>
  return <OnlineEditor campaignId={campaignId} owner={owner} />
}

/** Whether this list may make icons for the custom status: it was made in this list. */
function ownsIcon(status: StatusDefinition, owner: StatusListOwner): boolean {
  if (status.libraryKey) return false
  return owner.kind === 'dm'
    ? status.characterId === null
    : status.characterId === owner.characterId
}

function OnlineEditor({ campaignId, owner }: { campaignId: string; owner: StatusListOwner }) {
  const queryClient = useQueryClient()
  const list = useStatusList(campaignId, owner, true)
  const canEdit = list.data?.canEdit ?? false
  const all = useCampaignStatuses(campaignId, canEdit)
  const [iconOf, setIconOf] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const listKey = statusKeys.list(campaignId, owner)
  const save = useMutation({
    mutationFn: (statusIds: string[]) => saveStatusList(campaignId, owner, statusIds),
    onMutate: () => setNote(null),
    onSuccess: (saved) => queryClient.setQueryData<StatusList>(listKey, saved),
  })

  if (list.isPending) return <p className="text-sm text-dim">{de.common.loading}</p>
  if (list.isError) {
    return (
      <div className="flex flex-col items-start gap-2">
        <ErrorAlert error={t.loadFailed} />
        <Button onClick={() => void list.refetch()}>{de.common.retry}</Button>
      </div>
    )
  }

  const statuses = list.data.statuses
  const ids = statuses.map((status) => status.id)
  const missing = (all.data ?? []).filter((status) => !ids.includes(status.id))

  return (
    <div className="flex flex-col gap-3">
      {statuses.length === 0 ? (
        <p className="text-sm text-dim">{t.empty}</p>
      ) : (
        <ol className="flex flex-col divide-y divide-line">
          {statuses.map((status, index) => {
            const name = statusName(status)
            return (
              <li key={status.id} className="flex flex-col gap-2 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusIcon status={status} />
                  <span className="min-w-0 flex-1 text-parchment">{name}</span>
                  {!status.libraryKey && <Badge>{t.custom}</Badge>}
                  {status.hasLevels && <Badge>{t.levels}</Badge>}
                  {canEdit && (
                    <span className="flex items-center gap-1">
                      {ownsIcon(status, owner) && (
                        <Button
                          variant="quiet"
                          className="min-h-9 px-2 text-sm"
                          aria-expanded={iconOf === status.id}
                          onClick={() => setIconOf(iconOf === status.id ? null : status.id)}
                        >
                          {t.icon(name)}
                        </Button>
                      )}
                      <IconButton
                        label={t.moveUp(name)}
                        disabled={index === 0 || save.isPending}
                        onClick={() => save.mutate(moveInList(ids, index, -1))}
                      >
                        ↑
                      </IconButton>
                      <IconButton
                        label={t.moveDown(name)}
                        disabled={index === ids.length - 1 || save.isPending}
                        onClick={() => save.mutate(moveInList(ids, index, 1))}
                      >
                        ↓
                      </IconButton>
                      <IconButton
                        label={t.remove(name)}
                        disabled={save.isPending}
                        onClick={() => save.mutate(ids.filter((id) => id !== status.id))}
                      >
                        ✕
                      </IconButton>
                    </span>
                  )}
                </div>
                {canEdit && iconOf === status.id && ownsIcon(status, owner) && (
                  <section
                    aria-label={t.icon(name)}
                    className="flex flex-col gap-2 rounded-lg border border-line p-3"
                  >
                    <p className="text-sm text-dim">{de.statuses.icon.help}</p>
                    <TokenImageGallery
                      campaignId={campaignId}
                      owner={{ type: 'status', id: status.id }}
                      name={name}
                      ring={CANDLE}
                      generateLabel={de.statuses.icon.generate}
                      regenerateLabel={de.statuses.icon.regenerate}
                      noneHint={de.statuses.icon.help}
                      prepare={async () => ({ body: {} })}
                    />
                  </section>
                )}
              </li>
            )
          })}
        </ol>
      )}
      <ErrorAlert error={save.error} />
      {note && <Note>{note}</Note>}

      {canEdit ? (
        <>
          {missing.length > 0 ? (
            <AddToList
              statuses={missing}
              busy={save.isPending}
              onAdd={(id) => save.mutate([...ids, id])}
            />
          ) : (
            all.data && <p className="text-sm text-dim">{t.allListed}</p>
          )}
          <CustomStatusForm
            campaignId={campaignId}
            owner={owner}
            onCreated={(status) => {
              setNote(de.statuses.custom.created(status.name))
              setIconOf(status.id)
              void queryClient.invalidateQueries({ queryKey: statusKeys.campaign(campaignId) })
            }}
          />
        </>
      ) : (
        owner.kind === 'character' && <p className="text-sm text-dim">{t.readOnly}</p>
      )}
    </div>
  )
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-line text-parchment hover:border-candle disabled:opacity-40"
    >
      <span aria-hidden="true">{children}</span>
    </button>
  )
}

function AddToList({
  statuses,
  busy,
  onAdd,
}: {
  statuses: StatusDefinition[]
  busy: boolean
  onAdd: (statusId: string) => void
}) {
  const [picked, setPicked] = useState('')
  const value = statuses.some((status) => status.id === picked) ? picked : statuses[0]!.id
  return (
    <div className="flex flex-wrap items-end gap-2">
      <SelectField
        label={t.addLabel}
        value={value}
        onChange={(event) => setPicked(event.target.value)}
        className="min-w-48 flex-1"
      >
        {statuses.map((status) => (
          <option key={status.id} value={status.id}>
            {statusName(status)}
          </option>
        ))}
      </SelectField>
      <Button busy={busy} onClick={() => onAdd(value)}>
        {t.add}
      </Button>
    </div>
  )
}

/** "Eigener Zustand": name, what its icon shows, and whether it has levels. */
function CustomStatusForm({
  campaignId,
  owner,
  onCreated,
}: {
  campaignId: string
  owner: StatusListOwner
  onCreated: (status: StatusDefinition) => void
}) {
  const c = de.statuses.custom
  const formId = useId()
  const descriptionId = useId()
  const levelsId = useId()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [hasLevels, setHasLevels] = useState(false)

  const create = useMutation({
    mutationFn: () =>
      createStatus(campaignId, {
        name: name.trim(),
        iconDescription: description.trim() || null,
        hasLevels,
        characterId: owner.kind === 'character' ? owner.characterId : null,
      }),
    onSuccess: (status) => {
      setOpen(false)
      setName('')
      setDescription('')
      setHasLevels(false)
      onCreated(status)
    },
  })

  if (!open) {
    return (
      <div>
        <Button onClick={() => setOpen(true)}>{c.open}</Button>
      </div>
    )
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    create.mutate()
  }

  return (
    <form
      onSubmit={submit}
      aria-labelledby={formId}
      className="flex flex-col gap-3 rounded-lg border border-line p-3"
    >
      <h4 id={formId} className="font-semibold text-parchment">
        {c.title}
      </h4>
      <TextField
        label={c.name}
        required
        maxLength={STATUS_NAME_MAX}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <div className="flex flex-col gap-1">
        <label htmlFor={descriptionId} className="text-sm text-dim">
          {c.iconDescription}
        </label>
        <textarea
          id={descriptionId}
          rows={2}
          value={description}
          maxLength={STATUS_ICON_DESCRIPTION_MAX}
          aria-describedby={`${descriptionId}-hint`}
          className={`${inputClass} resize-y`}
          onChange={(event) => setDescription(event.target.value)}
        />
        <p id={`${descriptionId}-hint`} className="text-sm text-dim">
          {c.iconHint}
        </p>
      </div>
      <label htmlFor={levelsId} className="flex min-h-11 items-center gap-2 text-parchment">
        <input
          id={levelsId}
          type="checkbox"
          checked={hasLevels}
          onChange={(event) => setHasLevels(event.target.checked)}
          className="h-5 w-5 accent-candle"
        />
        {c.hasLevels}
      </label>
      {create.error && <ErrorAlert error={errorMessage(create.error)} />}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" busy={create.isPending}>
          {c.create}
        </Button>
        <Button variant="quiet" onClick={() => setOpen(false)}>
          {de.common.cancel}
        </Button>
      </div>
    </form>
  )
}
