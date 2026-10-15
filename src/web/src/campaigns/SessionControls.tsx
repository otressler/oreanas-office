// What happens to a session as a whole (knowledge/domain/session.md): the session DM or the
// campaign's default DM (`canManage`) starts, ends, continues and hands it over; the session
// DM changes its title and date.
import { useMutation } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { api } from '../api/client'
import { unwrap } from '../api/errors'
import type { Campaign, Session } from '../api/types'
import { Button, ErrorAlert, Note, SelectField, TextField } from '../components/ui'
import { limits } from '../lib/limits'
import { de } from '../text/de'
import { useInvalidateSessions } from './queries'

type Action = 'activate' | 'end' | 'dm'

/** Starten, Beenden, Fortsetzen and Spielleitung wechseln; nothing for anyone else. */
export function SessionControls({ campaign, session }: { campaign: Campaign; session: Session }) {
  const invalidate = useInvalidateSessions(campaign.id)
  const dms = campaign.members.filter((member) => member.role === 'dm')
  const [choosingDm, setChoosingDm] = useState(false)
  const [newDm, setNewDm] = useState(session.dmUserId)
  const params = { params: { path: { campaignId: campaign.id, sessionId: session.id } } }

  const action = useMutation({
    mutationFn: (kind: Action) =>
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

  if (!session.canManage) return null
  const busy = (kind: Action) => action.isPending && action.variables === kind
  const ended = session.status === 'ended'

  return (
    <div className="flex flex-col gap-2">
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
        {ended && (
          <Button
            variant="primary"
            onClick={() => action.mutate('activate')}
            busy={busy('activate')}
          >
            {de.sessions.continue}
          </Button>
        )}
        {!ended && (
          <Button onClick={() => action.mutate('end')} busy={busy('end')}>
            {de.sessions.end}
          </Button>
        )}
        {!ended && dms.length > 1 && !choosingDm && (
          <Button variant="quiet" onClick={() => setChoosingDm(true)}>
            {de.sessions.changeDm}
          </Button>
        )}
      </div>
      {ended && session.interruptedEncounter && (
        <Note>{de.sessions.continueResumes(session.interruptedEncounter.name)}</Note>
      )}
      {choosingDm && !ended && (
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
    </div>
  )
}

/** Title and date, for the session DM. */
export function SessionDetailsForm({
  campaignId,
  session,
  onDone,
}: {
  campaignId: string
  session: Session
  onDone: () => void
}) {
  const invalidate = useInvalidateSessions(campaignId)
  const [title, setTitle] = useState(session.title)
  const [date, setDate] = useState(session.date)
  const update = useMutation({
    mutationFn: () =>
      unwrap(
        api.PUT('/api/campaigns/{campaignId}/sessions/{sessionId}', {
          params: { path: { campaignId, sessionId: session.id } },
          body: { title: title.trim(), date },
        }),
      ),
    onSuccess: async () => {
      await invalidate()
      onDone()
    },
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    update.mutate()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border border-line p-3">
      <TextField
        label={de.sessions.titleLabel}
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
      <ErrorAlert error={update.error} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" busy={update.isPending}>
          {de.common.save}
        </Button>
        <Button variant="quiet" onClick={onDone}>
          {de.common.cancel}
        </Button>
      </div>
    </form>
  )
}
