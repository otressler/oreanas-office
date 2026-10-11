import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { unwrap } from '../api/errors'
import type { UserSummary } from '../api/types'
import { CopyBox } from '../components/CopyBox'
import { Badge, Button, ErrorAlert, LoadError, Loading, PageTitle, Panel } from '../components/ui'
import { formatDateTime } from '../lib/dates'
import { de } from '../text/de'

const invitesKey = ['admin', 'invites'] as const

/** /admin, for the site admin only: invite links and password reset links. */
export function AdminPage() {
  return (
    <div className="flex flex-col pb-8">
      <PageTitle>{de.admin.title}</PageTitle>
      <Invites />
      <Users />
    </div>
  )
}

function Invites() {
  const queryClient = useQueryClient()
  const invites = useQuery({
    queryKey: invitesKey,
    queryFn: () => unwrap(api.GET('/api/admin/invites')),
  })

  const create = useMutation({
    mutationFn: () => unwrap(api.POST('/api/admin/invites')),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: invitesKey }),
  })

  const revoke = useMutation({
    mutationFn: (inviteId: string) =>
      unwrap(api.DELETE('/api/admin/invites/{inviteId}', { params: { path: { inviteId } } })),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: invitesKey }),
  })

  // The token is shown only once, so the new link stays until it's revoked here;
  // a slow or failed reload of the list must not hide it.
  const created =
    create.data && !(revoke.isSuccess && revoke.variables === create.data.id) ? create.data : null

  return (
    <Panel title={de.admin.invitesTitle}>
      <p className="text-sm text-dim">{de.admin.invitesBody}</p>
      <div>
        <Button variant="primary" onClick={() => create.mutate()} busy={create.isPending}>
          {de.admin.createInvite}
        </Button>
      </div>
      <ErrorAlert error={create.error} />
      {created && (
        <div className="flex flex-col gap-2 rounded-lg border border-candle/40 p-3">
          <p className="text-sm text-parchment">{de.admin.newInviteNote}</p>
          <CopyBox
            value={created.url}
            label={de.admin.inviteLabel(formatDateTime(created.expiresAt))}
            shareTitle={de.admin.inviteShareTitle}
          />
          <p className="text-sm text-dim">
            {de.admin.validUntil(formatDateTime(created.expiresAt))}
          </p>
        </div>
      )}

      {invites.isPending ? (
        <Loading />
      ) : invites.isError ? (
        <LoadError error={invites.error} onRetry={() => void invites.refetch()} />
      ) : invites.data.length === 0 ? (
        <p className="text-dim">{de.admin.noInvites}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {invites.data.map((invite) => (
            <li key={invite.id} className="flex flex-wrap items-center gap-2 py-2">
              <div className="flex flex-col">
                <span className="text-parchment">
                  {de.admin.validUntil(formatDateTime(invite.expiresAt))}
                </span>
                <span className="text-sm text-dim">
                  {de.admin.createdAt(formatDateTime(invite.createdAt))}
                </span>
              </div>
              <Button
                className="ml-auto"
                onClick={() => revoke.mutate(invite.id)}
                busy={revoke.isPending && revoke.variables === invite.id}
              >
                {de.admin.revoke}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <ErrorAlert error={revoke.error} />
    </Panel>
  )
}

function Users() {
  const users = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => unwrap(api.GET('/api/admin/users')),
  })

  return (
    <Panel title={de.admin.usersTitle}>
      {users.isPending ? (
        <Loading />
      ) : users.isError ? (
        <LoadError error={users.error} onRetry={() => void users.refetch()} />
      ) : users.data.length === 0 ? (
        <p className="text-dim">{de.admin.noUsers}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {users.data.map((user) => (
            <UserRow key={user.id} user={user} />
          ))}
        </ul>
      )}
    </Panel>
  )
}

function UserRow({ user }: { user: UserSummary }) {
  const resetLink = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST('/api/admin/users/{userId}/reset-link', { params: { path: { userId: user.id } } }),
      ),
  })

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="text-parchment">{user.displayName}</span>
          <span className="truncate text-sm text-dim">{user.email}</span>
        </div>
        <div className="flex gap-1">
          {user.hasPassword && <Badge>{de.admin.hasPassword}</Badge>}
          {user.hasGoogle && <Badge>{de.admin.hasGoogle}</Badge>}
        </div>
        <Button className="ml-auto" onClick={() => resetLink.mutate()} busy={resetLink.isPending}>
          {de.admin.resetLink}
        </Button>
      </div>
      <ErrorAlert error={resetLink.error} />
      {resetLink.data && (
        <div className="flex flex-col gap-2 rounded-lg border border-candle/40 p-3">
          <p className="text-sm text-parchment">{de.admin.resetLinkNote}</p>
          <CopyBox
            value={resetLink.data.url}
            label={de.admin.resetLinkLabel(user.displayName)}
            shareTitle={de.admin.resetShareTitle}
          />
          <p className="text-sm text-dim">
            {de.admin.validUntil(formatDateTime(resetLink.data.expiresAt))}
          </p>
        </div>
      )}
    </li>
  )
}
