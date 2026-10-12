import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
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
import { de } from '../text/de'
import { campaignKeys, useSessions } from './queries'
import { limits } from '../lib/limits'
import { EndEncounterButton } from '../encounters/EndEncounterButton'

/**
 * Game nights of the campaign. `dm` members create them; the session DM or the
 * default DM (`canManage`) starts, ends and hands them over. One runs at a time.
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
        <ul className="flex flex-col divide-y divide-line">
          {sessions.data.map((session) => (
            <SessionRow key={session.id} campaignId={campaign.id} session={session} dms={dms} />
          ))}
        </ul>
      )}
    </Panel>
  )
}

/** After any change to a session: the campaign (active session) and the landing page. */
function useInvalidateSessions(campaignId: string) {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: campaignKeys.detail(campaignId) }),
      queryClient.invalidateQueries({ queryKey: campaignKeys.list }),
    ])
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

function SessionRow({
  campaignId,
  session,
  dms,
}: {
  campaignId: string
  session: Session
  dms: Member[]
}) {
  const invalidate = useInvalidateSessions(campaignId)
  const [choosingDm, setChoosingDm] = useState(false)
  const [newDm, setNewDm] = useState(session.dmUserId)
  const params = { params: { path: { campaignId, sessionId: session.id } } }

  const action = useMutation({
    mutationFn: (kind: 'activate' | 'end' | 'dm') =>
      unwrap(
        kind === 'activate'
          ? api.POST('/api/campaigns/{campaignId}/sessions/{sessionId}/activate', params)
          : kind === 'end'
            ? api.POST('/api/campaigns/{campaignId}/sessions/{sessionId}/end', params)
            : api.PUT('/api/campaigns/{campaignId}/sessions/{sessionId}/dm', {
                ...params,
                body: { userId: newDm },
              }),
      ),
    onSuccess: () => {
      setChoosingDm(false)
      return invalidate()
    },
  })

  const busy = (kind: 'activate' | 'end' | 'dm') => action.isPending && action.variables === kind
  const open = session.status !== 'ended'
  const canHandOver = dms.length > 1

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-parchment">{session.title}</span>
        <Badge tone={session.status === 'active' ? 'candle' : 'dim'}>
          {de.sessionStatus[session.status]}
        </Badge>
      </div>
      <span className="text-sm text-dim">
        {formatDate(session.date)} · {de.sessions.dmName(session.dmDisplayName)}
      </span>
      {session.activeEncounter && (
        <div className="flex flex-col gap-2 border-l-2 border-candle pl-3">
          <span className="text-xs font-semibold tracking-wide text-candle uppercase">
            {de.encounters.running}
          </span>
          <span className="text-parchment">{session.activeEncounter.name}</span>
          <div className="flex flex-wrap items-center gap-2">
            <ButtonLink
              variant="primary"
              to={`/kampagnen/${campaignId}/kampf/${session.activeEncounter.id}`}
            >
              {de.encounters.toFight}
            </ButtonLink>
            {session.isSessionDm && (
              <EndEncounterButton
                campaignId={campaignId}
                sessionId={session.id}
                encounterId={session.activeEncounter.id}
              />
            )}
          </div>
        </div>
      )}
      {session.canManage && open && (
        <div className="flex flex-wrap gap-2">
          {session.status === 'planned' && (
            <Button
              variant="primary"
              onClick={() => action.mutate('activate')}
              busy={busy('activate')}
            >
              {de.sessions.activate}
            </Button>
          )}
          <Button onClick={() => action.mutate('end')} busy={busy('end')}>
            {de.sessions.end}
          </Button>
          {canHandOver && !choosingDm && (
            <Button variant="quiet" onClick={() => setChoosingDm(true)}>
              {de.sessions.changeDm}
            </Button>
          )}
        </div>
      )}
      {choosingDm && open && (
        <div className="flex flex-wrap items-end gap-2">
          <SelectField
            label={de.sessions.dm}
            className="min-w-48 flex-1"
            value={newDm}
            onChange={(event) => setNewDm(event.target.value)}
          >
            {dms.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.displayName}
              </option>
            ))}
          </SelectField>
          <Button variant="primary" onClick={() => action.mutate('dm')} busy={busy('dm')}>
            {de.sessions.applyDm}
          </Button>
          <Button variant="quiet" onClick={() => setChoosingDm(false)}>
            {de.common.cancel}
          </Button>
        </div>
      )}
      <ErrorAlert error={action.error} />
    </li>
  )
}
