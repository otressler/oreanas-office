import { useId } from 'react'
import { Badge, PageTitle } from '../components/ui'
import { de } from '../text/de'

/**
 * The last stage of knowledge/implementation-plan.md that is built and on `main`.
 * Raise it when a stage is merged.
 */
export const BUILT_THROUGH_STAGE = 5

const t = de.roadmap

type PhaseText = (typeof t.phases)[number]
type Stage = PhaseText['stages'][number]

/** The stages and what each one brings, without dates. Static, so it works offline. */
export function RoadmapPage() {
  return (
    <div className="flex flex-col gap-6 pb-8">
      <div>
        <PageTitle>{t.title}</PageTitle>
        <p className="text-dim">{t.intro}</p>
      </div>
      {t.phases.map((phase) => (
        <Phase key={phase.title} phase={phase} />
      ))}
      <Later />
    </div>
  )
}

function Phase({ phase }: { phase: PhaseText }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div>
        <h2 id={id} className="text-xl font-semibold text-parchment">
          {phase.title}
        </h2>
        <p className="text-dim">{phase.goal}</p>
      </div>
      <ol className="flex flex-col gap-3">
        {phase.stages.map((stage) => (
          <li key={stage.number}>
            <StageCard stage={stage} />
          </li>
        ))}
      </ol>
    </section>
  )
}

function StageCard({ stage }: { stage: Stage }) {
  const id = useId()
  const done = stage.number <= BUILT_THROUGH_STAGE
  const next = stage.number === BUILT_THROUGH_STAGE + 1
  return (
    <article
      aria-labelledby={id}
      className={`flex flex-col gap-2 rounded-xl border bg-panel p-4 ${next ? 'border-candle' : 'border-line'}`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-xs font-semibold tracking-wide text-candle uppercase">
          {t.stage(stage.number)}
        </span>
        {done && <Badge>{t.done}</Badge>}
        {next && <Badge tone="candle">{t.next}</Badge>}
      </div>
      <h3 id={id} className={`text-lg font-semibold ${done ? 'text-dim' : 'text-parchment'}`}>
        {stage.title}
      </h3>
      <ItemList items={stage.items} />
    </article>
  )
}

function Later() {
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div>
        <h2 id={id} className="text-xl font-semibold text-parchment">
          {t.later.title}
        </h2>
        <p className="text-dim">{t.later.intro}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {t.later.groups.map((group) => (
          <div
            key={group.title}
            className="flex flex-col gap-2 rounded-xl border border-dashed border-line p-4"
          >
            <h3 className="font-semibold text-parchment">{group.title}</h3>
            <ItemList items={group.items} />
          </div>
        ))}
      </div>
    </section>
  )
}

function ItemList({ items }: { items: readonly string[] }) {
  return (
    <ul className="flex list-disc flex-col gap-1 pl-5 text-parchment marker:text-candle">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}
