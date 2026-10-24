import '@fontsource-variable/cinzel'
import './landing.css'
import {
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { Link } from 'react-router'
import { UpdatePrompt } from '../components/UpdatePrompt'
import { de } from '../text/de'
import { CompareSlider } from './CompareSlider'
import { LineIcon, type IconName } from './icons'
import { BowArrow, ChevronLink, Diamond, Frame, Kicker, Rule } from './ornaments'

const t = de.landing

/** A picture in public/landing/, generated at several widths (see knowledge/features/landing-page.md). */
function picture(name: string, widths: number[]) {
  return {
    src: `/landing/${name}-${widths.at(-1)}.webp`,
    srcSet: widths.map((w) => `/landing/${name}-${w}.webp ${w}w`).join(', '),
  }
}

const HERO = picture('hero', [1024, 1600, 2048])
const CAMP = picture('camp', [1024, 1600, 2048])
const BACKDROP = picture('backdrop', [768, 1536])
const EMBLEMS: Record<(typeof t.steps.items)[number]['key'], string> = {
  sketch: '/landing/emblem-quill-256.webp',
  paint: '/landing/emblem-brush-256.webp',
  play: '/landing/emblem-d20-256.webp',
}

const SECTIONS = [
  { id: 'so-gehts', label: t.steps.nav },
  { id: 'karte', label: t.map.nav },
  { id: 'kreaturen', label: t.creatures.nav },
  { id: 'am-tisch', label: t.table.nav },
] as const

/**
 * /willkommen: what the app is, for people who haven't signed in on this device.
 * Static like the roadmap, so it never wakes the server (knowledge/decisions/hosting.md).
 */
export function LandingPage() {
  return (
    <div className="min-h-dvh overflow-x-clip bg-table pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
      <Header />
      <main>
        <Hero />
        <Steps />
        <MapShowcase />
        <Creatures />
        <AtTheTable />
        <Finale />
      </main>
      <Footer />
      <UpdatePrompt />
    </div>
  )
}

function Wordmark() {
  return (
    <Link
      to="/willkommen"
      className="flex min-h-11 items-center gap-2 font-display text-base font-bold tracking-wide whitespace-nowrap text-candle hover:text-candle-strong sm:text-xl"
    >
      <Diamond className="size-2 bg-candle" />
      {de.appName}
    </Link>
  )
}

function Header() {
  return (
    <header className="absolute inset-x-0 top-0 z-20 pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:h-20 lg:gap-8">
        <Wordmark />
        <nav aria-label={t.navLabel} className="hidden lg:block">
          <ul className="flex gap-6">
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="font-display text-xs font-semibold tracking-[0.15em] text-parchment uppercase hover:text-candle-strong"
                >
                  {section.label}
                </a>
              </li>
            ))}
            <li>
              <Link
                to="/fahrplan"
                className="font-display text-xs font-semibold tracking-[0.15em] text-parchment uppercase hover:text-candle-strong"
              >
                {t.roadmap}
              </Link>
            </li>
          </ul>
        </nav>
        <ChevronLink to="/anmelden" variant="light" small className="ml-auto">
          {t.signIn}
        </ChevronLink>
      </div>
    </header>
  )
}

/** Where each ember starts and how it rises; fixed, so the page renders the same every time. */
const EMBERS = [
  [12, 0, 9, 18],
  [22, 3, 11, -12],
  [35, 6, 8, 20],
  [48, 1, 12, -8],
  [57, 4.5, 10, 14],
  [64, 7, 9, -16],
  [71, 2, 13, 10],
  [78, 5, 8, -20],
  [84, 0.5, 11, 12],
  [90, 3.5, 10, -10],
  [42, 8, 12, 16],
  [67, 9.5, 9, -14],
] as const

function Hero() {
  return (
    <section
      aria-labelledby="landing-title"
      className="relative isolate flex min-h-[100svh] flex-col overflow-hidden"
    >
      <img
        src={HERO.src}
        srcSet={HERO.srcSet}
        sizes="100vw"
        alt=""
        fetchPriority="high"
        className="absolute inset-0 -z-10 size-full object-cover object-[72%_center]"
      />
      {/* Dark on the left for the title, and at the top for the header. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-gradient-to-r from-table via-table/75 to-table/10 lg:via-table/40 lg:to-transparent"
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 -z-10 h-40 bg-gradient-to-b from-table/90 to-transparent"
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 -z-10 h-2/3 bg-gradient-to-t from-table via-table/70 to-transparent"
      />
      <div
        aria-hidden="true"
        className="landing-smoke absolute -inset-x-[10%] bottom-0 -z-10 h-1/2"
      />
      <div aria-hidden="true" className="absolute inset-0 -z-10">
        {EMBERS.map(([left, delay, duration, drift]) => (
          <span
            key={`${left}-${delay}`}
            className="landing-ember absolute bottom-[18%] size-1 rounded-full bg-candle-strong shadow-[0_0_6px_2px_rgb(240_196_110/0.6)]"
            style={
              {
                left: `${left}%`,
                '--delay': `${delay}s`,
                '--duration': `${duration}s`,
                '--drift': `${drift}vw`,
              } as CSSProperties
            }
          />
        ))}
      </div>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-4 pt-28 pb-12">
        <Kicker>{t.hero.kicker}</Kicker>
        <h1
          id="landing-title"
          className="mt-4 max-w-3xl bg-gradient-to-b from-parchment via-parchment to-candle bg-clip-text pb-2 font-display text-5xl leading-[0.95] font-bold text-transparent drop-shadow-[0_4px_16px_rgb(0_0_0/0.85)] sm:text-7xl lg:text-8xl"
        >
          {de.appName}
        </h1>
        <Rule className="mt-5 w-56" />
        <p className="mt-6 font-display text-xl text-parchment sm:text-2xl">{t.hero.tagline}</p>
        <p className="mt-3 max-w-xl text-base text-dim sm:text-lg">{t.hero.body}</p>
        <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-5">
          <ChevronLink to="/anmelden" variant="light">
            {t.signIn}
          </ChevronLink>
          <ChevronLink href="#so-gehts">{t.hero.howItWorks}</ChevronLink>
        </div>
        <p className="mt-4 text-sm text-dim">{t.hero.inviteOnly}</p>
      </div>

      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-3 px-4 pb-10">
        <p className="font-display text-[0.65rem] font-semibold tracking-[0.35em] text-dim uppercase">
          {t.hero.worksOnLabel}
        </p>
        <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 font-display text-sm text-parchment/85 sm:text-base">
          {t.hero.worksOn.map((item, i) => (
            <li key={item} className="flex items-center gap-4">
              {i > 0 && <Diamond className="bg-candle/60" />}
              {item}
            </li>
          ))}
        </ul>
      </div>
      <a
        href="#so-gehts"
        className="absolute right-6 bottom-10 hidden flex-col items-center gap-3 text-dim hover:text-parchment lg:flex"
      >
        <span className="font-display text-[0.6rem] tracking-[0.35em] uppercase [writing-mode:vertical-rl]">
          {t.hero.scroll}
        </span>
        <span
          aria-hidden="true"
          className="flex h-7 w-4 justify-center rounded-full border border-current pt-1.5"
        >
          <span className="h-1.5 w-0.5 rounded-full bg-current" />
        </span>
      </a>
    </section>
  )
}

function SectionHeading({
  id,
  kicker,
  children,
  centred = false,
}: {
  id: string
  kicker: string
  children: ReactNode
  centred?: boolean
}) {
  return (
    <div className={centred ? 'text-center' : ''}>
      <Kicker>{kicker}</Kicker>
      <h2
        id={id}
        className="mt-3 bg-gradient-to-b from-parchment to-candle-strong bg-clip-text font-display text-4xl font-semibold text-transparent sm:text-5xl"
      >
        {children}
      </h2>
    </div>
  )
}

/** Moves the selection with the arrow keys, Home and End, as in a tab list. */
function useRovingSelection(count: number) {
  const [selected, setSelected] = useState(0)
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  function select(index: number) {
    const next = (index + count) % count
    setSelected(next)
    refs.current[next]?.focus()
  }

  function onKeyDown(event: KeyboardEvent) {
    const moves: Record<string, number> = {
      ArrowRight: selected + 1,
      ArrowDown: selected + 1,
      ArrowLeft: selected - 1,
      ArrowUp: selected - 1,
      Home: 0,
      End: count - 1,
    }
    const target = moves[event.key]
    if (target === undefined) return
    event.preventDefault()
    select(target)
  }

  return { selected, setSelected, refs, onKeyDown }
}

function Steps() {
  const headingId = useId()
  const tabsId = useId()
  const items = t.steps.items
  const { selected, setSelected, refs, onKeyDown } = useRovingSelection(items.length)
  const step = items[selected]!

  return (
    <section
      id="so-gehts"
      aria-labelledby={headingId}
      className="relative isolate scroll-mt-4 py-16 sm:py-28"
    >
      <img
        src={BACKDROP.src}
        srcSet={BACKDROP.srcSet}
        sizes="(min-width: 1024px) 60vw, 100vw"
        alt=""
        loading="lazy"
        className="absolute top-0 right-0 -z-10 h-[28rem] w-full object-cover opacity-30 [mask-image:radial-gradient(70%_70%_at_70%_30%,black,transparent)] lg:w-3/5"
      />
      <div className="mx-auto max-w-6xl px-4">
        <SectionHeading id={headingId} kicker={t.steps.kicker}>
          {t.steps.title}
        </SectionHeading>

        <div className="mt-16 grid gap-14 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-6">
          <Frame
            title={t.steps.tabsLabel}
            className="px-3 pt-10 pb-6 sm:px-6 [&>div:last-child]:h-full"
          >
            <div
              role="tablist"
              aria-label={t.steps.tabsLabel}
              aria-orientation="vertical"
              onKeyDown={onKeyDown}
              className="grid grid-cols-3 gap-2 lg:h-full lg:grid-cols-1 lg:grid-rows-3 lg:gap-3"
            >
              {items.map((item, i) => {
                const active = i === selected
                return (
                  <button
                    key={item.key}
                    ref={(el) => {
                      refs.current[i] = el
                    }}
                    type="button"
                    role="tab"
                    id={`${tabsId}-tab-${i}`}
                    aria-selected={active}
                    aria-controls={`${tabsId}-panel`}
                    tabIndex={active ? 0 : -1}
                    onClick={() => setSelected(i)}
                    className={`relative flex flex-col items-center gap-2 rounded-sm border p-3 text-center transition-colors lg:flex-row lg:gap-4 lg:text-left ${
                      active
                        ? 'border-candle/70 bg-[radial-gradient(circle_at_30%_50%,rgb(224_173_79/0.16),transparent_70%)]'
                        : 'border-transparent hover:border-line'
                    }`}
                  >
                    <img
                      src={EMBLEMS[item.key]}
                      alt=""
                      width={256}
                      height={256}
                      loading="lazy"
                      className={`size-14 shrink-0 object-contain sm:size-20 ${active ? '' : 'opacity-70'}`}
                    />
                    <span className="flex flex-col">
                      <span
                        className={`font-display text-sm sm:text-lg ${active ? 'text-parchment' : 'text-candle'}`}
                      >
                        <span className="hidden lg:inline">{i + 1}. </span>
                        {item.name}
                      </span>
                      <span className="hidden text-sm text-dim lg:block">{item.lead}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </Frame>

          <Frame className="px-5 pt-10 pb-8 sm:px-10">
            <div
              role="tabpanel"
              id={`${tabsId}-panel`}
              aria-labelledby={`${tabsId}-tab-${selected}`}
              key={step.key}
              className="landing-fade-in flex flex-col"
            >
              <img
                src={EMBLEMS[step.key]}
                alt=""
                width={256}
                height={256}
                className="mx-auto size-20 object-contain sm:size-24"
              />
              <h3 className="mt-6 font-display text-3xl text-parchment sm:text-4xl">{step.name}</h3>
              <Rule className="mt-3 w-56" />
              <p className="mt-5 text-parchment/90 sm:text-lg">{step.body}</p>
              <Rule centred className="mt-8" />
              <Kicker className="mt-6">{t.steps.detailsLabel}</Kicker>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {step.details.map((detail) => (
                  <li key={detail} className="flex gap-3 text-dim">
                    <Diamond className="mt-2 shrink-0 border border-candle/80" />
                    {detail}
                  </li>
                ))}
              </ul>
            </div>
          </Frame>
        </div>
        <div aria-hidden="true" className="mt-8 flex justify-center gap-3">
          {items.map((item, i) => (
            <Diamond
              key={item.key}
              className={`size-2 ${i === selected ? 'bg-candle' : 'border border-candle/60'}`}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

function MapShowcase() {
  const headingId = useId()
  return (
    <section id="karte" aria-labelledby={headingId} className="relative scroll-mt-4 py-16 sm:py-28">
      <div className="mx-auto max-w-6xl px-4">
        <div className="grid gap-6 lg:grid-cols-2 lg:items-end">
          <SectionHeading id={headingId} kicker={t.map.kicker}>
            {t.map.title}
          </SectionHeading>
          <p className="text-dim sm:text-lg">{t.map.body}</p>
        </div>
        <Frame className="mt-12 p-2.5 sm:p-5">
          <CompareSlider
            before={{ ...picture('board', [768, 1536]), alt: t.map.beforeAlt, label: t.map.before }}
            after={{ ...picture('map', [768, 1536]), alt: t.map.afterAlt, label: t.map.after }}
            label={t.map.slider}
            width={1536}
            height={1024}
          />
        </Frame>
        <div className="mx-auto mt-8 flex max-w-2xl flex-col items-center gap-4 text-center">
          <p className="font-display text-sm tracking-[0.2em] text-candle uppercase">
            {t.map.caption}
          </p>
          <Rule centred className="w-48" />
          <p className="text-dim">{t.map.note}</p>
        </div>
      </div>
    </section>
  )
}

function Creatures() {
  const headingId = useId()
  const items = t.creatures.items
  const [selected, setSelected] = useState(0)
  const creature = items[selected]!
  const art = picture(creature.key, [384, 768])

  return (
    <section
      id="kreaturen"
      aria-labelledby={headingId}
      className="relative scroll-mt-4 overflow-hidden py-16 sm:py-28"
    >
      <div className="mx-auto max-w-6xl px-4">
        <div className="max-w-2xl">
          <SectionHeading id={headingId} kicker={t.creatures.kicker}>
            {t.creatures.title}
          </SectionHeading>
          <p className="mt-5 text-dim sm:text-lg">{t.creatures.intro}</p>
        </div>

        <div className="mt-10 grid gap-x-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)_auto]">
          <div
            key={`text-${creature.key}`}
            className="landing-fade-in order-2 self-center lg:order-1"
          >
            <Kicker>{creature.epithet}</Kicker>
            <h3 className="mt-3 bg-gradient-to-b from-parchment to-candle-strong bg-clip-text font-display text-5xl font-semibold text-transparent sm:text-6xl">
              {creature.name}
            </h3>
            <Rule className="mt-5 w-56" />
            <p className="mt-6 text-parchment/90 sm:text-lg">{creature.body}</p>
          </div>

          <div className="relative order-1 h-[26rem] sm:h-[34rem] lg:order-2 lg:h-[38rem]">
            <img
              src={BACKDROP.src}
              srcSet={BACKDROP.srcSet}
              sizes="(min-width: 1024px) 50vw, 100vw"
              alt=""
              loading="lazy"
              className="absolute -inset-x-1/4 inset-y-0 size-auto h-full w-[150%] max-w-none object-cover [mask-image:radial-gradient(50%_50%_at_50%_50%,black_30%,transparent)]"
            />
            <img
              key={creature.key}
              src={art.src}
              srcSet={art.srcSet}
              sizes="(min-width: 1024px) 400px, 70vw"
              alt=""
              width={768}
              height={1152}
              loading="lazy"
              className="landing-fade-in absolute inset-x-0 bottom-0 mx-auto h-full w-auto object-contain object-bottom drop-shadow-[0_20px_40px_rgb(0_0_0/0.8)] [mask-image:linear-gradient(to_bottom,black_80%,transparent)]"
            />
          </div>

          <div
            role="group"
            aria-label={t.creatures.pickLabel}
            className="order-3 mt-6 flex justify-center gap-3 lg:mt-0 lg:flex-col lg:justify-center"
          >
            {items.map((item, i) => {
              const thumb = picture(item.key, [384])
              const active = i === selected
              return (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={active}
                  aria-label={item.name}
                  onClick={() => setSelected(i)}
                  className={`relative h-28 w-20 overflow-hidden rounded-sm border bg-panel transition sm:h-36 sm:w-28 ${
                    active ? 'border-candle-strong' : 'border-line opacity-60 hover:opacity-100'
                  }`}
                >
                  <img
                    src={thumb.src}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover object-[50%_0%]"
                  />
                  {active && (
                    <>
                      <Diamond className="absolute top-1 left-1 bg-candle-strong" />
                      <Diamond className="absolute top-1 right-1 bg-candle-strong" />
                      <Diamond className="absolute bottom-1 left-1 bg-candle-strong" />
                      <Diamond className="absolute right-1 bottom-1 bg-candle-strong" />
                    </>
                  )}
                </button>
              )
            })}
          </div>

          <Frame className="relative z-10 order-4 mt-10 px-5 py-6 sm:px-8 lg:col-span-2 lg:-mt-24">
            <div key={`stats-${creature.key}`} className="landing-fade-in">
              <dl className="grid gap-6 sm:grid-cols-3">
                <Stat icon="size" label={t.creatures.size} value={creature.size} />
                <Stat icon="speed" label={t.creatures.speed} value={creature.speed} />
                <div className="flex items-center gap-4">
                  <span className="flex size-12 shrink-0 overflow-hidden rounded-full border-[3px] border-[#e5484d] bg-panel shadow-[0_0_0_2px_rgb(10_11_14)]">
                    <img
                      src={picture(creature.key, [384]).src}
                      alt=""
                      className="size-full scale-[1.9] object-cover object-[50%_18%]"
                    />
                  </span>
                  <div>
                    <dt className="font-display text-xs font-semibold tracking-[0.25em] text-candle uppercase">
                      {t.creatures.token}
                    </dt>
                    <dd className="font-display text-lg text-parchment">{`${creature.name} 1`}</dd>
                  </div>
                </div>
              </dl>
              <Rule centred className="my-6" />
              <dl className="grid gap-6 sm:grid-cols-2">
                <div>
                  <dt className="font-display text-xs font-semibold tracking-[0.25em] text-candle uppercase">
                    {t.creatures.onBoard}
                  </dt>
                  <dd className="mt-2 text-parchment/85">{creature.onBoard}</dd>
                </div>
                <div>
                  <dt className="font-display text-xs font-semibold tracking-[0.25em] text-candle uppercase">
                    {t.creatures.picture}
                  </dt>
                  <dd className="mt-2 text-parchment/85">{t.creatures.pictureText}</dd>
                </div>
              </dl>
            </div>
          </Frame>
        </div>
      </div>
    </section>
  )
}

function Stat({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <div className="flex items-center gap-4">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-full border border-candle/50 text-candle-strong">
        <LineIcon name={icon} />
      </span>
      <div>
        <dt className="font-display text-xs font-semibold tracking-[0.25em] text-candle uppercase">
          {label}
        </dt>
        <dd className="font-display text-lg text-parchment">{value}</dd>
      </div>
    </div>
  )
}

/** The ring around a medallion icon: two circles and a wreath of ticks. */
function MedallionRing() {
  const ticks = Array.from({ length: 36 }, (_, i) => (i * 360) / 36)
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 100"
      className="absolute inset-0 size-full text-candle"
    >
      <circle cx="50" cy="50" r="48" fill="none" stroke="currentColor" strokeOpacity="0.55" />
      <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeOpacity="0.3" />
      {ticks.map((angle) => (
        <line
          key={angle}
          x1="50"
          y1="3.5"
          x2="50"
          y2="7.5"
          stroke="currentColor"
          strokeOpacity="0.45"
          transform={`rotate(${angle} 50 50)`}
        />
      ))}
    </svg>
  )
}

function AtTheTable() {
  const headingId = useId()
  const row = useRef<HTMLUListElement>(null)

  function scroll(direction: 1 | -1) {
    const list = row.current
    if (!list) return
    list.scrollBy({ left: direction * list.clientWidth * 0.8, behavior: 'smooth' })
  }

  return (
    <section
      id="am-tisch"
      aria-labelledby={headingId}
      className="relative scroll-mt-4 py-16 sm:py-28"
    >
      <div className="mx-auto max-w-6xl px-4">
        <Frame className="overflow-hidden bg-[linear-gradient(110deg,rgb(29_32_39/0.9),rgb(20_22_27/0.95)_40%,rgb(224_173_79/0.07))] px-5 py-8 sm:px-10">
          <div className="grid items-center gap-8 lg:grid-cols-[auto_minmax(0,1fr)]">
            <div className="flex flex-row items-end justify-between gap-6 lg:flex-col lg:items-start">
              <SectionHeading id={headingId} kicker={t.table.kicker}>
                {t.table.title}
              </SectionHeading>
              <div className="flex gap-2 text-candle">
                <button
                  type="button"
                  aria-label={t.table.previous}
                  onClick={() => scroll(-1)}
                  className="flex size-11 items-center justify-center hover:text-candle-strong"
                >
                  <BowArrow direction="left" />
                </button>
                <button
                  type="button"
                  aria-label={t.table.next}
                  onClick={() => scroll(1)}
                  className="flex size-11 items-center justify-center hover:text-candle-strong"
                >
                  <BowArrow direction="right" />
                </button>
              </div>
            </div>
            <ul
              ref={row}
              className="landing-no-scrollbar flex snap-x snap-mandatory gap-6 overflow-x-auto pb-2 [mask-image:linear-gradient(to_right,black_85%,transparent)]"
            >
              {t.table.items.map((item) => (
                <li
                  key={item.key}
                  className="flex w-36 shrink-0 snap-start flex-col items-center text-center"
                >
                  <span className="relative flex size-28 items-center justify-center rounded-full bg-[radial-gradient(circle,rgb(224_173_79/0.14),transparent_70%)] text-candle-strong">
                    <MedallionRing />
                    <LineIcon name={item.key} className="size-9" />
                  </span>
                  <span className="mt-4 font-display text-base text-parchment">{item.title}</span>
                  <span className="mt-1 text-sm text-dim">{item.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </Frame>
      </div>
    </section>
  )
}

function Finale() {
  const headingId = useId()
  return (
    <section
      aria-labelledby={headingId}
      className="relative isolate flex min-h-[80svh] items-end overflow-hidden pt-40 pb-20"
    >
      <img
        src={CAMP.src}
        srcSet={CAMP.srcSet}
        sizes="100vw"
        alt=""
        loading="lazy"
        className="absolute inset-0 -z-10 size-full object-cover object-[50%_35%]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-gradient-to-b from-table via-table/20 to-table"
      />
      <div
        aria-hidden="true"
        className="landing-smoke absolute -inset-x-[10%] bottom-0 -z-10 h-2/3"
      />
      <div className="mx-auto flex max-w-2xl flex-col items-center px-4 text-center">
        <h2
          id={headingId}
          className="bg-gradient-to-b from-parchment to-candle-strong bg-clip-text font-display text-4xl font-semibold text-transparent drop-shadow-[0_4px_16px_rgb(0_0_0/0.9)] sm:text-6xl"
        >
          {t.finale.title}
        </h2>
        <Rule centred className="mt-6 w-64" />
        <p className="mt-6 text-parchment/90 sm:text-lg">{t.finale.body}</p>
        <div className="mt-10 flex flex-wrap justify-center gap-x-6 gap-y-5">
          <ChevronLink to="/anmelden" variant="light">
            {t.signIn}
          </ChevronLink>
          <ChevronLink to="/fahrplan">{t.roadmap}</ChevronLink>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-line pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6">
        <Wordmark />
        <p className="text-sm text-dim">{t.footer}</p>
        <div className="flex flex-wrap gap-x-4 sm:ml-auto">
          <Link
            to="/fahrplan"
            className="flex min-h-11 items-center text-sm text-dim hover:text-parchment"
          >
            {t.roadmap}
          </Link>
          <Link
            to="/anmelden"
            className="flex min-h-11 items-center text-sm text-dim hover:text-parchment"
          >
            {t.signIn}
          </Link>
          <Link
            to="/impressum"
            className="flex min-h-11 items-center text-sm text-dim hover:text-parchment"
          >
            {de.imprint.link}
          </Link>
          <Link
            to="/datenschutz"
            className="flex min-h-11 items-center text-sm text-dim hover:text-parchment"
          >
            {de.privacy.link}
          </Link>
        </div>
        <p className="w-full text-xs text-dim">{t.unofficial}</p>
      </div>
    </footer>
  )
}
