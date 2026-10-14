// The feature tool's catalog: the suggested kinds as cards with an icon, in sections, two
// per row, with a search. Picking a card sets the kind and its "blocks movement" preset;
// a search without a match can become a kind of the DM's own.
import { useId, useState } from 'react'
import { inputClass } from '../../components/styles'
import { de } from '../../text/de'
import { KindIcon } from './kindIcons'
import { KIND_GROUPS, searchKinds, suggestionFor, type KindSuggestion } from './kinds'

const t = de.editorFeatures.catalog

export function KindCatalog({
  kind,
  onPick,
  onCustom,
}: {
  /** The kind the next feature gets; its card is shown as picked. */
  kind: string
  onPick: (suggestion: KindSuggestion) => void
  onCustom: (kind: string) => void
}) {
  const titleId = useId()
  const [query, setQuery] = useState('')
  const matches = searchKinds(query)
  const picked = suggestionFor(kind)?.key
  const wanted = query.trim()

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <h3 id={titleId} className="text-xs font-semibold tracking-wide text-dim uppercase">
        {t.title}
      </h3>
      <input
        type="search"
        aria-label={t.search}
        placeholder={t.searchPlaceholder}
        className={inputClass}
        value={query}
        autoComplete="off"
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          // Enter takes the only match, or the search as a kind of the DM's own.
          if (event.key !== 'Enter' || !wanted) return
          if (matches.length === 1) onPick(matches[0]!)
          else if (matches.length === 0) onCustom(wanted)
        }}
      />
      {KIND_GROUPS.map((group) => {
        const cards = matches.filter((match) => match.group === group)
        if (cards.length === 0) return null
        return (
          <div
            key={group}
            role="group"
            aria-label={t.groups[group]}
            className="flex flex-col gap-2"
          >
            <h4 className="text-xs text-dim">{t.groups[group]}</h4>
            <div className="grid grid-cols-2 gap-2">
              {cards.map((card) => (
                <KindCard
                  key={card.key}
                  card={card}
                  picked={card.key === picked}
                  onPick={() => onPick(card)}
                />
              ))}
            </div>
          </div>
        )
      })}
      {matches.length === 0 && <p className="text-sm text-dim">{t.noMatch(wanted)}</p>}
      {wanted && !suggestionFor(wanted) && (
        <button
          type="button"
          onClick={() => onCustom(wanted)}
          className="flex min-h-11 items-center gap-2 rounded-lg border border-dashed border-line px-3 text-left text-sm hover:border-candle"
        >
          <KindIcon kind={null} className="size-5 shrink-0 text-dim" />
          {t.useCustom(wanted)}
        </button>
      )}
    </section>
  )
}

function KindCard({
  card,
  picked,
  onPick,
}: {
  card: KindSuggestion
  picked: boolean
  onPick: () => void
}) {
  const metaId = useId()
  return (
    <button
      type="button"
      aria-pressed={picked}
      aria-label={card.kind}
      aria-describedby={metaId}
      onClick={onPick}
      className={`flex min-h-20 flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2 text-center ${
        picked
          ? 'border-candle bg-candle/15 text-candle'
          : 'border-line text-parchment hover:border-candle'
      }`}
    >
      <KindIcon kind={card.key} className="size-7" />
      <span className="text-sm leading-tight">{card.kind}</span>
      <span id={metaId} className="text-[11px] text-dim">
        {card.blocksMovement ? t.blocks : t.passable}
      </span>
    </button>
  )
}
