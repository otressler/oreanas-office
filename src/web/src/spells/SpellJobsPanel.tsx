// The admin page's suggestion queue (knowledge/features/spell-cards.md, "Planned", steps 4 and 5):
// "Vorschläge erstellen" with the library's filters and "Karten überarbeiten", each with its
// count and estimated cost before it starts; then the progress per kind, failed jobs to try
// again, revisions whose words changed to check by hand, and revised cards to put back.
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import type { SpellJob, SpellJobsPlan, SpellJobsRequest, SpellSchool } from '../api/types'
import { Button, ErrorAlert, LoadError, Loading, Note, Panel, SelectField } from '../components/ui'
import { useClasses } from '../rules/classes'
import { de } from '../text/de'
import { spellPaths } from './paths'
import {
  planSpellJobs,
  retrySpellJob,
  retrySpellJobs,
  revertRevision,
  spellKeys,
  startSpellJobs,
  useSpellJobs,
} from './queries'

const t = de.spells.jobs

const SCHOOLS = Object.keys(de.spells.schools) as SpellSchool[]

// Small sums: a job costs a fraction of a cent.
const usd = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 3,
})

export function SpellJobsPanel() {
  const jobs = useSpellJobs()
  const queries = useQueryClient()
  const [error, setError] = useState<unknown>(null)
  const refresh = () => void queries.invalidateQueries({ queryKey: spellKeys.jobs })
  const act = async (action: () => Promise<unknown>) => {
    setError(null)
    try {
      await action()
      refresh()
    } catch (err) {
      setError(err)
    }
  }

  return (
    <Panel title={t.title}>
      <p className="text-sm text-dim">{t.intro}</p>
      {jobs.isPending ? (
        <Loading />
      ) : jobs.isError ? (
        <LoadError error={jobs.error} onRetry={() => void jobs.refetch()} />
      ) : (
        <>
          {!jobs.data.textModel && <Note>{t.noTextModel}</Note>}
          <p className="text-sm text-dim">
            {t.budget(usd.format(jobs.data.budget.spentUsd), usd.format(jobs.data.budget.limitUsd))}
          </p>
          <SuggestionsForm disabled={!jobs.data.textModel} onStarted={refresh} />
          <RevisionForm disabled={!jobs.data.textModel} onStarted={refresh} />
          <ErrorAlert error={error} />

          <section aria-labelledby="spell-jobs-progress" className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 id="spell-jobs-progress" className="font-semibold text-parchment">
                {t.progress}
              </h3>
              <Button variant="quiet" className="ml-auto" onClick={refresh}>
                {t.refresh}
              </Button>
            </div>
            <ul className="flex flex-col gap-1 text-sm">
              {jobs.data.counts
                .filter((c) => c.queued + c.running + c.done + c.failed > 0)
                .map((c) => (
                  <li key={c.kind}>
                    <span className="text-parchment">{t.kinds[c.kind]}:</span>{' '}
                    <span className="text-dim">
                      {t.counts(c.queued, c.running, c.done, c.failed)}
                    </span>
                  </li>
                ))}
            </ul>
          </section>

          {jobs.data.failed.length > 0 && (
            <section aria-labelledby="spell-jobs-failed" className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 id="spell-jobs-failed" className="font-semibold text-parchment">
                  {t.failed}
                </h3>
                <Button className="ml-auto" onClick={() => void act(retrySpellJobs)}>
                  {t.retryAll}
                </Button>
              </div>
              <JobList
                jobs={jobs.data.failed}
                detail={(job) => job.error}
                action={(job) => (
                  <Button variant="quiet" onClick={() => void act(() => retrySpellJob(job.id))}>
                    {t.retry}
                  </Button>
                )}
              />
            </section>
          )}

          {jobs.data.toCheck.length > 0 && (
            <section aria-labelledby="spell-jobs-check" className="flex flex-col gap-2">
              <h3 id="spell-jobs-check" className="font-semibold text-parchment">
                {t.toCheck}
              </h3>
              <p className="text-sm text-dim">{t.toCheckHint}</p>
              <JobList
                jobs={jobs.data.toCheck}
                detail={(job) => (job.detail ? t.field(job.detail) : null)}
                action={(job) =>
                  job.variantId && (
                    <Link to={spellPaths.edit(job.variantId)} className="text-sm text-candle">
                      {t.openCard}
                    </Link>
                  )
                }
              />
            </section>
          )}

          {jobs.data.revisions.length > 0 && (
            <details className="flex flex-col gap-2">
              <summary className="cursor-pointer font-semibold text-parchment">
                {t.revised(jobs.data.revisions.length)}
              </summary>
              <ul className="mt-2 flex flex-col divide-y divide-line">
                {jobs.data.revisions.map((revision) => (
                  <li key={revision.id} className="flex flex-wrap items-center gap-2 py-2">
                    <Link to={spellPaths.spell(revision.spellId)} className="flex-1 text-parchment">
                      {revision.name}
                    </Link>
                    {revision.canRevert ? (
                      <Button
                        variant="quiet"
                        onClick={() => void act(() => revertRevision(revision.id))}
                      >
                        {t.revert}
                      </Button>
                    ) : (
                      <span className="text-sm text-dim">{t.edited}</span>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </Panel>
  )
}

function JobList({
  jobs,
  detail,
  action,
}: {
  jobs: SpellJob[]
  detail: (job: SpellJob) => string | null | undefined
  action: (job: SpellJob) => React.ReactNode
}) {
  return (
    <ul className="flex flex-col divide-y divide-line">
      {jobs.map((job) => (
        <li key={job.id} className="flex flex-wrap items-center gap-2 py-2">
          <span className="min-w-0 flex-1">
            <Link to={spellPaths.spell(job.spellId)} className="block text-parchment">
              {job.spellName}
            </Link>
            <span className="block text-xs text-dim">
              {t.kinds[job.kind]}
              {detail(job) ? ` · ${detail(job)}` : ''}
            </span>
          </span>
          {action(job)}
        </li>
      ))}
    </ul>
  )
}

/** Estimate first, then start: the count and cost of exactly what the options mean now. */
function useRun(request: SpellJobsRequest, onStarted: () => void) {
  const [plan, setPlan] = useState<{ key: string; plan: SpellJobsPlan } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [started, setStarted] = useState<number | null>(null)
  const key = JSON.stringify(request)
  const current = plan?.key === key ? plan.plan : null
  const run = async (action: 'plan' | 'start') => {
    setBusy(true)
    setError(null)
    setStarted(null)
    try {
      if (action === 'plan') setPlan({ key, plan: await planSpellJobs(request) })
      else {
        const queued = await startSpellJobs(request)
        setStarted(queued.drafts + queued.motifs + queued.revisions)
        setPlan(null)
        onStarted()
      }
    } catch (err) {
      setError(err)
    }
    setBusy(false)
  }
  return { plan: current, busy, error, started, run }
}

function RunButtons({ disabled, state }: { disabled: boolean; state: ReturnType<typeof useRun> }) {
  const { plan, busy, error, started, run } = state
  const total = plan ? plan.drafts + plan.motifs + plan.revisions : 0
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={disabled} busy={busy && !plan} onClick={() => void run('plan')}>
          {t.estimate}
        </Button>
        {plan && total > 0 && (
          <Button variant="primary" busy={busy} onClick={() => void run('start')}>
            {t.start(total)}
          </Button>
        )}
      </div>
      {plan && (
        <p role="status" className="text-sm text-parchment">
          {total > 0
            ? t.plan(plan.drafts, plan.motifs, plan.revisions, usd.format(plan.estimatedUsd))
            : t.nothingToDo}
        </p>
      )}
      {started != null && (
        <p role="status" className="text-sm text-candle">
          {t.started(started)}
        </p>
      )}
      <ErrorAlert error={error} />
    </>
  )
}

function SuggestionsForm({ disabled, onStarted }: { disabled: boolean; onStarted: () => void }) {
  const classes = useClasses()
  const [level, setLevel] = useState<number | null>(null)
  const [classId, setClassId] = useState<string | null>(null)
  const [school, setSchool] = useState<SpellSchool | null>(null)
  const [onlyWithoutCard, setOnlyWithoutCard] = useState(true)
  const state = useRun(
    { run: 'suggestions', level, classId, school, onlyWithoutCard, onlyUnrevised: true },
    onStarted,
  )
  return (
    <section
      aria-labelledby="spell-jobs-suggestions"
      className="flex flex-col gap-3 rounded-lg border border-line p-3"
    >
      <h3 id="spell-jobs-suggestions" className="font-semibold text-parchment">
        {t.suggestions}
      </h3>
      <p className="text-sm text-dim">{t.suggestionsHint}</p>
      <div className="flex flex-wrap gap-3">
        <SelectField
          label={de.spells.editor.level}
          value={level ?? ''}
          onChange={(event) =>
            setLevel(event.target.value === '' ? null : Number(event.target.value))
          }
        >
          <option value="">{de.spells.library.allLevels}</option>
          {Array.from({ length: 10 }, (_, l) => (
            <option key={l} value={l}>
              {de.spells.levelGroup(l)}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={de.spells.library.classFilter}
          value={classId ?? ''}
          onChange={(event) => setClassId(event.target.value || null)}
        >
          <option value="">{de.spells.library.allClasses}</option>
          {(classes.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.nameDe}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={de.spells.editor.school}
          value={school ?? ''}
          onChange={(event) => setSchool((event.target.value || null) as SpellSchool | null)}
        >
          <option value="">{de.spells.library.allSchools}</option>
          {SCHOOLS.map((s) => (
            <option key={s} value={s}>
              {de.spells.schools[s]}
            </option>
          ))}
        </SelectField>
      </div>
      <label className="flex min-h-9 items-center gap-2 text-sm text-parchment">
        <input
          type="checkbox"
          className="size-5 accent-candle"
          checked={onlyWithoutCard}
          onChange={(event) => setOnlyWithoutCard(event.target.checked)}
        />
        {t.onlyWithoutCard}
      </label>
      <RunButtons disabled={disabled} state={state} />
    </section>
  )
}

function RevisionForm({ disabled, onStarted }: { disabled: boolean; onStarted: () => void }) {
  const [onlyUnrevised, setOnlyUnrevised] = useState(true)
  const state = useRun({ run: 'revision', onlyWithoutCard: true, onlyUnrevised }, onStarted)
  return (
    <section
      aria-labelledby="spell-jobs-revision"
      className="flex flex-col gap-3 rounded-lg border border-line p-3"
    >
      <h3 id="spell-jobs-revision" className="font-semibold text-parchment">
        {t.revision}
      </h3>
      <p className="text-sm text-dim">{t.revisionHint}</p>
      <label className="flex min-h-9 items-center gap-2 text-sm text-parchment">
        <input
          type="checkbox"
          className="size-5 accent-candle"
          checked={onlyUnrevised}
          onChange={(event) => setOnlyUnrevised(event.target.checked)}
        />
        {t.onlyUnrevised}
      </label>
      <RunButtons disabled={disabled} state={state} />
    </section>
  )
}
