// Statuses a spell offers when it's added to a character (knowledge/features/spell-cards.md,
// "Statuses when a spell is added"): only what the character's status list is missing, all
// ticked; "Hinzufügen" adds the ticked ones, "Überspringen" none. Nothing is added unseen.
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { StatusList } from '../api/types'
import { Button, ErrorAlert } from '../components/ui'
import { statusName } from '../statuses/names'
import { statusKeys } from '../statuses/queries'
import { StatusIcon } from '../statuses/StatusIcon'
import { Modal } from '../sync/Modal'
import { de } from '../text/de'
import { addSpellStatuses } from './queries'
import type { PendingOffers } from './statuses'

const t = de.spells.character

export function StatusOffersDialog({
  campaignId,
  characterId,
  characterName,
  pending,
  onClose,
}: {
  campaignId: string
  characterId: string
  characterName?: string
  pending: PendingOffers
  onClose: () => void
}) {
  const queries = useQueryClient()
  const [picked, setPicked] = useState(() => new Set(pending.offers.map((o) => o.key)))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const add = async () => {
    setBusy(true)
    setError(null)
    try {
      const list = await addSpellStatuses(campaignId, characterId, pending.spellId, [...picked])
      queries.setQueryData<StatusList>(
        statusKeys.list(campaignId, { kind: 'character', characterId }),
        list,
      )
      // A spell's own status is new to the campaign the first time.
      void queries.invalidateQueries({ queryKey: statusKeys.campaign(campaignId) })
      onClose()
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }

  return (
    <Modal title={t.offersTitle(pending.spellName)} onClose={onClose}>
      <p className="-mt-2 text-sm text-dim">
        {characterName ? t.offersIntro(characterName) : t.offersIntroUnnamed}
      </p>
      <ul className="flex flex-col">
        {pending.offers.map((offer) => (
          <li key={offer.key}>
            <label className="flex min-h-11 items-center gap-3 text-parchment">
              <input
                type="checkbox"
                className="size-5 accent-candle"
                checked={picked.has(offer.key)}
                onChange={(event) => {
                  const next = new Set(picked)
                  if (event.target.checked) next.add(offer.key)
                  else next.delete(offer.key)
                  setPicked(next)
                }}
              />
              <StatusIcon status={offer} />
              <span className="flex-1">{statusName(offer)}</span>
              {offer.key === 'spell' && <span className="text-xs text-dim">{t.offerSpell}</span>}
            </label>
          </li>
        ))}
      </ul>
      <ErrorAlert error={error} />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          busy={busy}
          disabled={picked.size === 0}
          onClick={() => void add()}
        >
          {t.offersAdd}
        </Button>
        <Button variant="quiet" onClick={onClose}>
          {t.offersSkip}
        </Button>
      </div>
    </Modal>
  )
}
