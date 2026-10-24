// "Status hinzufügen" on the token card (knowledge/features/statuses.md, "What the picker
// shows"): the status lists the person picks from, asked for again each time it opens. A
// player sees the lists of their own characters in the fight, the session DM their own
// DM list first and then every character's. A tap puts a status on at once, with no
// confirm step; a status the token has already shows as set, and a second tap takes it
// off when the person may. Needs the table's connection, like moving.
import { useState } from 'react'
import type { BoardTokenStatus, StatusDefinition, StatusPickerList } from '../api/types'
import { Button, ErrorAlert } from '../components/ui'
import { Modal } from '../sync/Modal'
import { de } from '../text/de'
import { statusName } from './names'
import { useStatusPicker } from './queries'
import { StatusIcon } from './StatusIcon'

const t = de.statuses.picker

export interface StatusPickerProps {
  campaignId: string
  encounterId: string
  /** The token's label, for the title. */
  label: string
  /** The statuses the token has now. */
  statuses: readonly BoardTokenStatus[]
  /** Whether the person may take a status off this token. */
  canRemove: (status: BoardTokenStatus) => boolean
  /** The table is connected: statuses can go on and off. */
  connected: boolean
  /** Puts a status on; resolves to an error text, or null when it went through. */
  onAdd: (statusId: string) => Promise<string | null>
  onRemove: (statusId: string) => Promise<string | null>
  onClose: () => void
  /** A shared screen's picker lists every character's statuses (knowledge/features/shared-table.md). */
  sharedScreen?: boolean
}

export function StatusPicker({
  campaignId,
  encounterId,
  label,
  statuses,
  canRemove,
  connected,
  onAdd,
  onRemove,
  onClose,
  sharedScreen,
}: StatusPickerProps) {
  const picker = useStatusPicker(campaignId, encounterId, sharedScreen)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function toggle(definition: StatusDefinition) {
    const set = statuses.find((status) => status.statusId === definition.id)
    if (set && !canRemove(set)) return
    setBusy(true)
    setError(null)
    try {
      setError(await (set ? onRemove(definition.id) : onAdd(definition.id)))
    } finally {
      setBusy(false)
    }
  }

  const lists = picker.data?.lists ?? []
  return (
    <Modal title={t.title(label)} onClose={onClose}>
      <p className="text-sm text-dim">{t.help}</p>
      {!connected && <p className="text-sm text-red-200">{de.tokenCard.needsConnection}</p>}
      <ErrorAlert error={error} />
      {picker.isPending ? (
        <p className="text-sm text-dim">{de.common.loading}</p>
      ) : picker.isError ? (
        <div className="flex flex-col items-start gap-2">
          <ErrorAlert error={t.loadFailed} />
          <Button onClick={() => void picker.refetch()}>{de.common.retry}</Button>
        </div>
      ) : lists.length === 0 ? (
        <p className="text-sm text-dim">{t.noLists}</p>
      ) : (
        lists.map((list) => (
          <PickerList
            key={list.characterId ?? 'dm'}
            list={list}
            statuses={statuses}
            canRemove={canRemove}
            disabled={busy || !connected}
            onToggle={(definition) => void toggle(definition)}
          />
        ))
      )}
      <div>
        <Button variant="primary" onClick={onClose}>
          {t.done}
        </Button>
      </div>
    </Modal>
  )
}

function PickerList({
  list,
  statuses,
  canRemove,
  disabled,
  onToggle,
}: {
  list: StatusPickerList
  statuses: readonly BoardTokenStatus[]
  canRemove: (status: BoardTokenStatus) => boolean
  disabled: boolean
  onToggle: (definition: StatusDefinition) => void
}) {
  const title =
    list.kind === 'dm' ? t.dmList : t.characterList(list.characterName ?? de.statuses.someone)
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-parchment">{title}</h3>
      {list.statuses.length === 0 ? (
        <p className="text-sm text-dim">{t.emptyList}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {list.statuses.map((definition) => {
            const set = statuses.find((status) => status.statusId === definition.id)
            const name = statusName(definition)
            return (
              <li key={definition.id}>
                <button
                  type="button"
                  aria-pressed={Boolean(set)}
                  aria-label={set ? t.remove(name) : t.add(name)}
                  disabled={disabled || (set !== undefined && !canRemove(set))}
                  onClick={() => onToggle(definition)}
                  className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-line px-2 py-1 text-left text-parchment hover:border-candle disabled:opacity-50 aria-pressed:border-candle aria-pressed:bg-candle/15"
                >
                  <StatusIcon status={definition} />
                  <span className="min-w-0 flex-1 truncate">{name}</span>
                  {set && <span className="text-xs text-candle">{t.set}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
