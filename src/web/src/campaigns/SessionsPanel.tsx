import { useMutation } from '@tanstack/react-query'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { api } from '../api/client'
import { unwrap } from '../api/errors'
import type { Campaign, Member, Session } from '../api/types'
import {
  Badge,
  Button,
  ButtonLink,
  ErrorAlert,
  LoadError,
  Loading,
  Panel,
  SelectField,
  TextField,
} from '../components/ui'
import { formatDate, todayIso } from '../lib/dates'
import { limits } from '../lib/limits'
import { fightPath, sessionPath } from '../sessions/paths'
import { de } from '../text/de'
import { useInvalidateSessions, useSessions } from './queries'

/**
 * The campaign's game nights, each with its fights (knowledge/features/session-planning.md):
 * the running one first, then the planned ones by date, then the ended ones collapsed.
 * `dm` members create them; everything else happens on the session page.
 */
export function SessionsPanel({ campaign }: { campaign: Campaign }) {
  const sessions = useSessions(campaign.id)
  const [adding, setAdding] = useState(false)
  const dms = campaign.members.filter((member) => member.role === 'dm')

  return (
    <Panel
      title={de.sessions.title}
      action={
        campaign.myRole === 'dm' &&
        !adding && <Button onClick={() => setAdding(true)}>{de.sessions.add}</Button>
      }
    >
      {adding && <SessionForm campaign={campaign} dms={dms} onDone={() => setAdding(false)} />}
      {sessions.isPending ? (
        <Loading />
      ) : sessions.isError ? (
        <LoadError error={sessions.error} onRetry={() => void sessions.refetch()} />
      ) : sessions.data.length === 0 ? (
        !adding && <p className="text-dim">{de.sessions.empty}</p>
      ) : (
        <SessionGroups campaign={campaign} sessions={sessions.data} />
      )}
    </Panel>
  )
}

function SessionGroups({ campaign, sessions }: { campaign: Campaign; sessions: Session[] }) {
  const running = sessions.filter((s) => s.status === 'active')
  // The server lists the newest date first; planned nights read best soonest first.
  const planned = sessions.filter((s) => s.status === 'planned').reverse()
  const ended = sessions.filter((s) => s.status === 'ended')
  const card = (session: Session) => (
    <SessionCard key={session.id} campaign={campaign} session={session} />
  )
  return (
    <div className="flex flex-col gap-4">
      {running.length > 0 && <Group title={de.sessions.runningTitle}>{running.map(card)}</Group>}
      {planned.length > 0 && <Group title={de.sessions.plannedTitle}>{planned.map(card)}</Group>}
      {ended.length > 0 && (
        <details className="rounded-lg border border-line px-3 py-1">
          <summary className="cursor-pointer py-1 text-sm text-dim">
            {de.sessions.endedTitle(ended.length)}
          </summary>
          <ul className="flex flex-col gap-2 py-2">{ended.map(card)}</ul>
        </details>
      )}
    </div>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold tracking-wide text-dim uppercase">{title}</h3>
      <ul className="flex flex-col gap-2">{children}</ul>
    </div>
  )
}

/** One session: what it is, its fights for `dm` members, and the way into a running fight. */
function SessionCard({ campaign, session }: { campaign: Campaign; session: Session }) {
  const fights = session.encounters.filter((encounter) => encounter.archivedAt === null)
  const running = session.status === 'active'
  return (
    <li
      className={`flex flex-col gap-2 rounded-lg border p-3 ${running ? 'border-candle/60' : 'border-line'}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to={sessionPath(campaign.id, session.id)}
          className="font-semibold text-parchment underline-offset-4 hover:text-candle hover:underline"
        >
          {session.title}
        </Link>
        <Badge tone={running ? 'candle' : 'dim'}>{de.sessionStatus[session.status]}</Badge>
      </div>
      <span className="text-sm text-dim">
        {formatDate(session.date)} · {de.sessions.dmName(session.dmDisplayName)}
      </span>
      {campaign.myRole === 'dm' &&
        (fights.length === 0 ? (
          session.status !== 'ended' && <p className="text-sm text-dim">{de.sessions.noFights}</p>
        ) : (
          <ul
            aria-label={de.sessions.fights(fights.length)}
            className="flex flex-wrap gap-x-3 gap-y-1"
          >
            {fights.map((fight) => (
              <li key={fight.id} className="flex items-center gap-1 text-sm">
                <span className="text-parchment">{fight.name}</span>
                <Badge tone={fight.status === 'active' ? 'candle' : 'dim'}>
                  {de.encounterStatus[fight.status]}
                </Badge>
              </li>
            ))}
          </ul>
        ))}
      {session.activeEncounter && (
        <div className="flex flex-wrap items-center gap-2 border-l-2 border-candle pl-3">
          <span className="text-sm text-parchment">
            {de.encounters.running}: {session.activeEncounter.name}
          </span>
          <ButtonLink variant="primary" to={fightPath(campaign.id, session.activeEncounter.id)}>
            {de.encounters.toFight}
          </ButtonLink>
        </div>
      )}
    </li>
  )
}

function SessionForm({
  campaign,
  dms,
  onDone,
}: {
  campaign: Campaign
  dms: Member[]
  onDone: () => void
}) {
  const invalidate = useInvalidateSessions(campaign.id)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(todayIso)
  // Empty means the campaign's default DM.
  const [dmUserId, setDmUserId] = useState('')
  const defaultDm = campaign.members.find((member) => member.userId === campaign.defaultDmUserId)

  const create = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST('/api/campaigns/{campaignId}/sessions', {
          params: { path: { campaignId: campaign.id } },
          body: { title: title.trim(), date, dmUserId: dmUserId || null },
        }),
      ),
    onSuccess: () => {
      void invalidate()
      onDone()
    },
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    create.mutate()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border border-line p-3">
      <h3 className="font-semibold text-parchment">{de.sessions.add}</h3>
      <TextField
        label={de.sessions.titleLabel}
        placeholder={de.sessions.titlePlaceholder}
        required
        maxLength={limits.sessionTitle}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <TextField
        label={de.sessions.date}
        type="date"
        required
        value={date}
        onChange={(event) => setDate(event.target.value)}
      />
      <SelectField
        label={de.sessions.dm}
        value={dmUserId}
        onChange={(event) => setDmUserId(event.target.value)}
      >
        <option value="">{de.sessions.defaultDm(defaultDm?.displayName ?? '')}</option>
        {dms
          .filter((member) => member.userId !== campaign.defaultDmUserId)
          .map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.displayName}
            </option>
          ))}
      </SelectField>
      <ErrorAlert error={create.error} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" busy={create.isPending}>
          {de.common.create}
        </Button>
        <Button variant="quiet" onClick={onDone}>
          {de.common.cancel}
        </Button>
      </div>
    </form>
  )
}
