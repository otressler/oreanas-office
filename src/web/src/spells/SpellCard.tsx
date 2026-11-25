// The spell card (knowledge/features/spell-cards.md, "The card"): the spell-cards app's front
// and back, as React. Drawn at print size (70 × 120 mm) and scaled with `zoom`; the back
// shrinks its text to fit, as the original did, and scrolls below its head and stats when the
// text still doesn't fit at a readable size (fit.ts).
import './cards.css'
import {
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import type {
  SpellCard as Card,
  SpellChipKind,
  SpellRowColor,
  SpellSchool,
  SpellTable,
} from '../api/types'
import { de } from '../text/de'
import { fitCard, updateScroll } from './fit'
import { SPELL_ICONS } from './iconPaths'
import type { SpellIconName } from './model'
import { Markup } from './markup'
import { parseBlocks } from './markupText'

const t = de.spells

/** What a card shows: a variant's text with its spell's facts and the picked art. */
export interface CardSpell {
  nameEn: string
  level: number
  school: SpellSchool
  card: Card
  artUrl?: string | null
}

export function SpellIcon({ name }: { name: string | null | undefined }) {
  const paths = SPELL_ICONS[(name ?? 'spark') as SpellIconName] ?? SPELL_ICONS.spark
  return (
    <svg
      className="sc-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      // The paths are the app's own constants, never user input.
      dangerouslySetInnerHTML={{ __html: paths }}
    />
  )
}

const GEMS: Record<SpellSchool, [string, string, string]> = {
  abjuration: ['#dbe5ff', '#4a6fc0', '#172446'],
  conjuration: ['#bdf0ff', '#3aa6cf', '#0f3a4d'],
  divination: ['#ece4ff', '#8a72cc', '#271d47'],
  enchantment: ['#ffd9eb', '#c4558c', '#3f1530'],
  evocation: ['#ffdcc0', '#d6643a', '#42180c'],
  illusion: ['#c9fff6', '#3fa89c', '#0f302c'],
  necromancy: ['#e2f7bf', '#6d9c43', '#1b2810'],
  transmutation: ['#fff0c4', '#c0943a', '#3a2a0c'],
}

function Gem({ school, level }: { school: SpellSchool; level: number }) {
  const id = `gem${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const [a, b, c] = GEMS[school]
  return (
    <div className="sc-gem">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={a} />
            <stop offset=".45" stopColor={b} />
            <stop offset="1" stopColor={c} />
          </linearGradient>
        </defs>
        <path
          d="M12 1 22 8 18.5 22h-13L2 8z"
          fill={`url(#${id})`}
          stroke="#ecd59a"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <path
          d="M2 8h20M12 1 7.5 8l4.5 14 4.5-14z"
          fill="none"
          stroke="rgba(255,255,255,.35)"
          strokeWidth=".7"
        />
      </svg>
      <span>{level}</span>
    </div>
  )
}

const CHIP_ICONS: Record<SpellChipKind, SpellIconName> = {
  acid: 'drop',
  bludgeoning: 'mountain',
  cold: 'snow',
  fire: 'flame',
  force: 'spark',
  lightning: 'spark',
  necrotic: 'skull',
  piercing: 'shard',
  poison: 'drop',
  psychic: 'spiral',
  radiant: 'star',
  slashing: 'blade',
  thunder: 'thunder',
  heal: 'heart',
}

function LevelLabel({ level }: { level: number }) {
  return level === 0 ? (
    <>{t.level(0)}</>
  ) : (
    <>
      Grad <span className="sc-num">{level}</span>
    </>
  )
}

export function SpellCardFront({ spell }: { spell: CardSpell }) {
  const { card } = spell
  const pips = card.pips ?? []
  const left = card.concentration ? (
    <span className="sc-pip sc-l sc-flag" title={t.card.concentration}>
      {t.card.concentrationShort}
    </span>
  ) : pips[0] ? (
    <span className="sc-pip sc-l">
      <SpellIcon name={pips[0]} />
    </span>
  ) : null
  const rightIcon = card.concentration ? pips[0] : pips[1]
  const right = card.ritual ? (
    <span className="sc-pip sc-r sc-flag" title={t.card.ritual}>
      {t.card.ritualShort}
    </span>
  ) : rightIcon ? (
    <span className="sc-pip sc-r">
      <SpellIcon name={rightIcon} />
    </span>
  ) : null
  return (
    <article className={`sc-card sc-front s-${spell.school}`}>
      <div className="sc-frame">
        {spell.artUrl ? (
          <img className="sc-art" src={spell.artUrl} alt="" loading="lazy" decoding="async" />
        ) : (
          <div className="sc-no-art">
            <SpellIcon name={card.icon} />
          </div>
        )}
        <Gem school={spell.school} level={spell.level} />
        <header className="sc-title-plate">
          <h1 data-fit="h1" lang="de">
            {card.name}
          </h1>
          <div className="sc-flourish">
            <SpellIcon name={card.icon} />
          </div>
          <span className="sc-orig">{t.schools[spell.school]}</span>
        </header>
        {left}
        {right}
        <div className="sc-type-bar" data-fit="bar">
          <span className="sc-sep">◆</span>
          <span>
            <LevelLabel level={spell.level} />
          </span>
          <span className="sc-sep">◆</span>
        </div>
      </div>
    </article>
  )
}

function Stat({
  icon,
  label,
  children,
}: {
  icon: SpellIconName
  label: string
  children: ReactNode
}) {
  return (
    <div className="sc-stat">
      <span className="sc-ico">
        <SpellIcon name={icon} />
      </span>
      <span>
        <span className="sc-lbl">{label}</span>
        <span className="sc-val" data-fit="val">
          {children}
        </span>
      </span>
    </div>
  )
}

export function SpellCardBack({ spell }: { spell: CardSpell }) {
  const { card } = spell
  const effects = card.effects ?? []
  const tables = card.tables ?? []
  const writeIns = card.writeIns ?? []
  const notes = [
    card.higherLevels &&
      (spell.level === 0 ? (
        <div className="sc-note" key="up">
          <SpellIcon name="up" />
          <span>
            <b>{t.card.scaling}</b> <Markup text={card.higherLevels} />
          </span>
        </div>
      ) : (
        <div className="sc-note" key="up">
          <SpellIcon name="up" />
          <span>
            <b>{t.card.higherLevels}</b> <Markup text={card.higherLevels} />
          </span>
        </div>
      )),
    card.ritual && (
      <div className="sc-note" key="ritual">
        <SpellIcon name="book" />
        <span>
          <b>{t.card.asRitual}</b> {t.card.ritualText}
        </span>
      </div>
    ),
    card.tip && (
      <div className="sc-note sc-tip" key="tip">
        <SpellIcon name="bulb" />
        <span>
          <b>{t.card.tip}</b> <Markup text={card.tip} />
        </span>
      </div>
    ),
  ].filter(Boolean)
  const hasFootLeft = !!card.material || !!card.source
  return (
    <article className={`sc-card sc-back s-${spell.school}`}>
      <div className="sc-frame">
        <header className="sc-back-head">
          <Gem school={spell.school} level={spell.level} />
          <div className="sc-titles">
            <h2 data-fit="h2" lang="de">
              {card.name}
            </h2>
            <div className="sc-en" data-fit="en">
              {spell.nameEn}
            </div>
            <div className="sc-sub" data-fit="sub">
              {t.schools[spell.school]} · {t.level(spell.level)}
            </div>
          </div>
          {(card.concentration || card.ritual) && (
            <div className="sc-flags">
              {card.concentration && (
                <span className="sc-flag-badge" title={t.card.concentration}>
                  {t.card.concentrationShort}
                </span>
              )}
              {card.ritual && (
                <span className="sc-flag-badge" title={t.card.ritual}>
                  {t.card.ritualShort}
                </span>
              )}
            </div>
          )}
        </header>
        <div className="sc-stats">
          <Stat icon="hourglass" label={t.card.castingTime}>
            {card.castingTime}
          </Stat>
          <Stat icon="range" label={t.card.range}>
            {card.range}
          </Stat>
          <Stat icon="spark" label={t.card.components}>
            {card.components}
          </Stat>
          <Stat icon="clock" label={t.card.duration}>
            {card.concentration && <span className="sc-k">{t.card.concentrationShort}</span>}
            {card.duration}
          </Stat>
        </div>
        <div className="sc-body" onScroll={(event) => updateScroll(event.currentTarget)}>
          {card.description && <Description text={card.description} />}
          {(tables.length > 0 || effects.length > 0) && (
            <div className="sc-divider">
              <SpellIcon name={card.icon} />
            </div>
          )}
          {tables.map((table, index) => (
            <SpellTableBlock table={table} key={index} />
          ))}
          {effects.length > 0 && (
            <div className="sc-effects">
              {effects.map((effect, index) => (
                <div className={`sc-effect${effect.chip ? '' : ' sc-no-chip'}`} key={index}>
                  <span className="sc-ico">
                    <SpellIcon name={effect.icon} />
                  </span>
                  <div>
                    <h3>
                      {effect.title}
                      {effect.tag && (
                        <>
                          {' '}
                          <span className="sc-tag">{effect.tag}</span>
                        </>
                      )}
                    </h3>
                    {effect.text && (
                      <p lang="de">
                        <Markup text={effect.text} hyphenate />
                      </p>
                    )}
                  </div>
                  {effect.chip && (
                    <Chip big={effect.chip.big} small={effect.chip.small} kind={effect.chip.kind} />
                  )}
                </div>
              ))}
            </div>
          )}
          {notes.length > 0 && <div className="sc-notes">{notes}</div>}
          {(hasFootLeft || writeIns.length > 0) && (
            <footer className="sc-foot">
              {hasFootLeft && (
                <span className="sc-mat">
                  {card.material && (
                    <>
                      <b>{t.card.material}</b> {card.material}
                    </>
                  )}
                  {card.material && card.source && <br />}
                  {card.source && <span className="sc-src">{t.card.source(card.source)}</span>}
                </span>
              )}
              {writeIns.length > 0 && (
                <span className="sc-write-in">
                  {writeIns.map((w) => (
                    <span key={w}>{t.card.writeIns[w]}</span>
                  ))}
                </span>
              )}
            </footer>
          )}
        </div>
        <div className="sc-rail" aria-hidden="true">
          <i />
        </div>
        <div className="sc-more" aria-hidden="true">
          <svg className="sc-icon" viewBox="0 0 24 24">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </div>
    </article>
  )
}

/** The description: paragraphs with a small gap between them, and lists of choices. */
function Description({ text }: { text: string }) {
  return parseBlocks(text).map((block, index) =>
    block.kind === 'paragraph' ? (
      <p className="sc-desc" lang="de" key={index}>
        <Markup text={block.text} hyphenate />
      </p>
    ) : (
      <ul className="sc-list" lang="de" key={index}>
        {block.items.map((item, i) => (
          <li key={i}>
            <Markup text={item} hyphenate />
          </li>
        ))}
      </ul>
    ),
  )
}

const ROW_COLORS: SpellRowColor[] = ['red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet']

/** A table of the spell's own: rows with a key in a coloured strip, a title, a text and a chip. */
function SpellTableBlock({ table }: { table: SpellTable }) {
  return (
    <div className="sc-table">
      {table.caption && <div className="sc-table-cap">{table.caption}</div>}
      <div className="sc-rows">
        {(table.rows ?? []).map((row, index) => (
          <div
            key={index}
            className={`sc-row${row.chip ? '' : ' sc-no-chip'}${row.color && ROW_COLORS.includes(row.color) ? ` c-${row.color}` : ''}`}
          >
            <span className="sc-key">{row.key}</span>
            <div>
              {row.title && <h3>{row.title}</h3>}
              {row.text && (
                <p lang="de">
                  <Markup text={row.text} hyphenate />
                </p>
              )}
            </div>
            {row.chip && <Chip big={row.chip.big} small={row.chip.small} kind={row.chip.kind} />}
          </div>
        ))}
      </div>
    </div>
  )
}

function Chip({
  big,
  small,
  kind,
}: {
  big: string
  small?: string | null
  kind?: SpellChipKind | null
}) {
  const icon = kind ? CHIP_ICONS[kind] : null
  const txt = big.length > 5 && !icon ? ' sc-txt' : ''
  return (
    <div className={`sc-chip${kind ? ` k-${kind}` : ''}${txt}`}>
      <span className="sc-big">
        {icon && <SpellIcon name={icon} />}
        {big}
      </span>
      {small && <span className="sc-small">{small}</span>}
    </div>
  )
}

/**
 * One face of a card in a box of its scaled size. `onOverflow` hears whether the back's text
 * scrolls because it doesn't fit even after shrinking.
 */
export function SpellCardView({
  spell,
  side = 'front',
  zoom = 1,
  onOverflow,
  className = '',
}: {
  spell: CardSpell
  side?: 'front' | 'back'
  zoom?: number
  onOverflow?: (overflow: boolean) => void
  className?: string
}) {
  const ref = useCardFit(spell, onOverflow)
  return (
    <div className={`sc-scale ${className}`} style={{ '--sc-zoom': zoom } as CSSProperties}>
      <div className="sc-zoom" ref={ref}>
        {side === 'front' ? <SpellCardFront spell={spell} /> : <SpellCardBack spell={spell} />}
      </div>
    </div>
  )
}

/**
 * A card that turns over on a tap (or Enter and Space): the front, then the back. Uncontrolled
 * unless `flipped` and `onFlip` are given.
 */
export function FlipCard({
  spell,
  zoom = 1,
  flipped: controlled,
  onFlip,
  className = '',
}: {
  spell: CardSpell
  zoom?: number
  flipped?: boolean
  onFlip?: (flipped: boolean) => void
  className?: string
}) {
  const [own, setOwn] = useState(false)
  const flipped = controlled ?? own
  const ref = useCardFit(spell)
  const flip = () => {
    setOwn(!flipped)
    onFlip?.(!flipped)
  }
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={flipped}
      aria-label={t.card.flip(spell.card.name)}
      className={`sc-scale sc-flip${flipped ? ' sc-flipped' : ''} ${className}`}
      style={{ '--sc-zoom': zoom } as CSSProperties}
      onClick={flip}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          flip()
        }
        // A long back scrolls with the arrow keys while it is turned up.
        const body = flipped
          ? event.currentTarget.querySelector<HTMLElement>('.sc-scrolls .sc-body')
          : null
        if (body && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
          event.preventDefault()
          body.scrollBy({ top: event.key === 'ArrowDown' ? 40 : -40, behavior: 'smooth' })
        }
      }}
    >
      <div className="sc-zoom" ref={ref}>
        <div className="sc-face" aria-hidden={flipped}>
          <SpellCardFront spell={spell} />
        </div>
        <div className="sc-face sc-face-back" aria-hidden={!flipped}>
          <SpellCardBack spell={spell} />
        </div>
      </div>
    </div>
  )
}

/** Shrinks the card's texts to fit after every change and once the fonts are in. */
function useCardFit(spell: CardSpell, onOverflow?: (overflow: boolean) => void) {
  const ref = useRef<HTMLDivElement>(null)
  const key = JSON.stringify([spell.nameEn, spell.level, spell.school, spell.card])
  const report = useEffectEvent((overflow: boolean) => onOverflow?.(overflow))
  useLayoutEffect(() => {
    if (!ref.current) return
    let live = true
    const run = () => {
      if (live && ref.current) report(fitCard(ref.current))
    }
    run()
    void document.fonts?.ready.then(run)
    return () => {
      live = false
    }
  }, [key])
  return ref
}
