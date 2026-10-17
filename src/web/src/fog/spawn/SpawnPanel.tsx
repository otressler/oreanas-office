// "Kreatur hinzufügen" on the session DM's board (knowledge/features/creature-spawn.md): the
// picker of the campaign's creature types (the ones used in this fight first, and "Neue Art"
// with only a name and a size), the bar while placing ("Fertig"), and the confirm bar
// "3 Kreaturen erscheinen lassen?" with the "Verborgen" switch. Nothing reaches the players
// before "Erscheinen lassen".
import { useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import type { BoardState, CreatureSize } from '../../api/types'
import { Button, SelectField, TextField } from '../../components/ui'
import { de } from '../../text/de'
import { CREATURE_SIZES } from '../../bestiary/creatureTypes'
import { createSpawnType, spawnTypesKey, useSpawnTypes } from './bestiaryApi'
import { orderTypes, placedByType, type SpawnDraft, type SpawnType } from './draft'

const t = de.fog.spawn

const panelClass =
  'absolute inset-x-0 z-30 mx-auto flex w-[calc(100%-1.5rem)] max-w-lg flex-col gap-2 rounded-xl border border-line bg-panel/95 p-3 shadow-lg shadow-black/40'

export function SpawnPanel({
  campaignId,
  board,
  draft,
  picking,
  connected,
  busy,
  error,
  bottom,
  onPick,
  onOtherType,
  onClosePicker,
  onDone,
  onResume,
  onHidden,
  onConfirm,
  onCancel,
}: {
  campaignId: string
  board: Pick<BoardState, 'tokens' | 'removedTokens'>
  draft: SpawnDraft
  /** The picker is open: at the start, and for "Andere Art". */
  picking: boolean
  connected: boolean
  busy: boolean
  error: string | null
  /** CSS pixels from the board's bottom edge: above the docked card. */
  bottom: number
  onPick: (type: SpawnType) => void
  onOtherType: () => void
  onClosePicker: () => void
  onDone: () => void
  onResume: () => void
  onHidden: (hidden: boolean) => void
  onConfirm: () => void
  onCancel: () => void
}) {
  const style = { bottom: bottom + 12 }
  if (picking) {
    return (
      <section
        aria-label={t.pickerTitle}
        data-testid="spawn-picker"
        style={style}
        className={panelClass}
      >
        <Picker
          campaignId={campaignId}
          board={board}
          onPick={onPick}
          onClose={draft.picked || draft.placements.length > 0 ? onClosePicker : onCancel}
        />
      </section>
    )
  }
  const count = draft.placements.length
  if (draft.finished) {
    return (
      <section
        aria-label={t.confirm(count)}
        data-testid="spawn-confirm"
        style={style}
        className={panelClass}
      >
        <p aria-live="polite" className="text-sm text-parchment">
          {t.confirm(count)}
        </p>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            role="switch"
            checked={draft.hidden}
            onChange={(event) => onHidden(event.target.checked)}
          />
          {t.hidden}
        </label>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" disabled={!connected || busy} onClick={onConfirm}>
            {t.appear}
          </Button>
          <Button onClick={onResume}>{t.back}</Button>
          <Button variant="quiet" onClick={onCancel}>
            {t.cancel}
          </Button>
        </div>
        {!connected && <p className="text-sm text-dim">{de.fog.needsConnection}</p>}
        {error && (
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
        )}
      </section>
    )
  }
  const placed = placedByType(draft)
  return (
    <section aria-label={t.button} data-testid="spawn-placing" style={style} className={panelClass}>
      {draft.picked && <p className="text-sm text-parchment">{t.placing(draft.picked.name)}</p>}
      {placed.length > 0 && (
        <ul className="flex flex-wrap gap-1" aria-label={t.confirm(count)}>
          {placed.map(({ type, count: n }) => (
            <li
              key={type.id}
              className="rounded-full border border-line px-2 py-0.5 text-sm text-parchment"
            >
              {t.placed(type.name, n)}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={count === 0} onClick={onDone}>
          {t.done}
        </Button>
        <Button onClick={onOtherType}>{t.otherType}</Button>
        <Button variant="quiet" onClick={onCancel}>
          {t.cancel}
        </Button>
      </div>
    </section>
  )
}

function Picker({
  campaignId,
  board,
  onPick,
  onClose,
}: {
  campaignId: string
  board: Pick<BoardState, 'tokens' | 'removedTokens'>
  onPick: (type: SpawnType) => void
  onClose: () => void
}) {
  const types = useSpawnTypes(campaignId, true)
  const queryClient = useQueryClient()
  const [making, setMaking] = useState(false)
  const [name, setName] = useState('')
  const [size, setSize] = useState<CreatureSize>('medium')
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function create() {
    setBusy(true)
    setProblem(null)
    const result = await createSpawnType(campaignId, { name, size })
    if (!result.ok) {
      setProblem(result.reason === 'nameTaken' ? t.newNameTaken : t.newFailed)
      setBusy(false)
      return
    }
    await queryClient.refetchQueries({ queryKey: spawnTypesKey(campaignId) })
    const made = queryClient
      .getQueryData<SpawnType[]>(spawnTypesKey(campaignId))
      ?.find((type) => type.id === result.id)
    setBusy(false)
    if (made) onPick(made)
    else setProblem(t.newFailed)
  }

  const { used, others } = orderTypes(types.data ?? [], board)
  return (
    <>
      <div className="flex items-center gap-2">
        <h2 className="min-w-0 flex-1 text-base font-semibold text-parchment">{t.pickerTitle}</h2>
        <Button variant="quiet" onClick={onClose}>
          {t.close}
        </Button>
      </div>
      <div className="flex max-h-[40vh] flex-col gap-3 overflow-y-auto overscroll-contain">
        {types.isPending && <p className="text-sm text-dim">{t.loading}</p>}
        {types.isError && <p className="text-sm text-red-300">{t.loadFailed}</p>}
        {types.data && types.data.length === 0 && <p className="text-sm text-dim">{t.empty}</p>}
        <Group title={t.usedHere} types={used} onPick={onPick} />
        <Group title={t.others} types={others} onPick={onPick} />
      </div>
      {making ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (name.trim()) void create()
          }}
        >
          <TextField
            label={t.newName}
            value={name}
            maxLength={40}
            autoComplete="off"
            onChange={(event) => setName(event.target.value)}
          />
          <SelectField
            label={t.newSize}
            value={size}
            onChange={(event) => setSize(event.target.value as CreatureSize)}
          >
            {CREATURE_SIZES.map((option) => (
              <option key={option} value={option}>
                {de.sizes[option]}
              </option>
            ))}
          </SelectField>
          {problem && (
            <p role="alert" className="text-sm text-red-300">
              {problem}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" variant="primary" busy={busy} disabled={!name.trim()}>
              {t.newCreate}
            </Button>
            <Button variant="quiet" onClick={() => setMaking(false)}>
              {t.cancel}
            </Button>
          </div>
        </form>
      ) : (
        <div>
          <Button onClick={() => setMaking(true)}>{t.newType}</Button>
        </div>
      )}
    </>
  )
}

function Group({
  title,
  types,
  onPick,
}: {
  title: string
  types: SpawnType[]
  onPick: (type: SpawnType) => void
}): ReactNode {
  if (types.length === 0) return null
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-xs font-semibold tracking-wide text-dim uppercase">{title}</h3>
      <ul className="flex flex-col gap-1">
        {types.map((type) => (
          <li key={type.id}>
            <button
              type="button"
              aria-label={t.pick(type.name)}
              onClick={() => onPick(type)}
              className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-line px-3 text-left text-parchment hover:border-candle"
            >
              <span className="truncate">{type.name}</span>
              <span className="shrink-0 text-sm text-dim">{de.sizes[type.size]}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
