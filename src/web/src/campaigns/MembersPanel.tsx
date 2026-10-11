import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { unwrap } from '../api/errors'
import type { Campaign } from '../api/types'
import { useCurrentUser } from '../auth/auth'
import { CopyBox } from '../components/CopyBox'
import { Badge, Button, ErrorAlert, Panel } from '../components/ui'
import { de } from '../text/de'
import { campaignKeys } from './queries'

/** Members with their roles; `dm` members promote players and manage the join code. */
export function MembersPanel({ campaign }: { campaign: Campaign }) {
  const me = useCurrentUser()
  const queryClient = useQueryClient()
  const isDm = campaign.myRole === 'dm'

  const promote = useMutation({
    mutationFn: (userId: string) =>
      unwrap(
        api.POST('/api/campaigns/{campaignId}/members/{userId}/promote', {
          params: { path: { campaignId: campaign.id, userId } },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: campaignKeys.detail(campaign.id) }),
  })

  return (
    <Panel title={de.campaign.membersTitle}>
      <ul className="flex flex-col divide-y divide-line">
        {campaign.members.map((member) => (
          <li key={member.userId} className="flex flex-wrap items-center gap-2 py-2">
            <span className="text-parchment">
              {member.displayName}
              {member.userId === me.id && <span className="text-dim"> {de.common.you}</span>}
            </span>
            <Badge tone={member.role === 'dm' ? 'candle' : 'dim'}>{de.roles[member.role]}</Badge>
            {member.userId === campaign.defaultDmUserId && <Badge>{de.campaign.defaultDm}</Badge>}
            {isDm && member.role === 'player' && (
              <Button
                className="ml-auto"
                onClick={() => promote.mutate(member.userId)}
                busy={promote.isPending && promote.variables === member.userId}
              >
                {de.campaign.promote}
              </Button>
            )}
          </li>
        ))}
      </ul>
      <ErrorAlert error={promote.error} />
      {campaign.joinCode && <JoinCode campaign={campaign} joinCode={campaign.joinCode} />}
    </Panel>
  )
}

function JoinCode({ campaign, joinCode }: { campaign: Campaign; joinCode: string }) {
  const queryClient = useQueryClient()

  const replace = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST('/api/campaigns/{campaignId}/join-code', {
          params: { path: { campaignId: campaign.id } },
        }),
      ),
    onSuccess: ({ joinCode }) =>
      queryClient.setQueryData<Campaign>(campaignKeys.detail(campaign.id), (old) =>
        old ? { ...old, joinCode } : old,
      ),
  })

  return (
    <div className="mt-2 flex flex-col gap-2 border-t border-line pt-4">
      <h3 className="font-semibold text-parchment">{de.campaign.joinCodeTitle}</h3>
      <p className="text-sm text-dim">{de.campaign.joinCodeBody}</p>
      <CopyBox
        value={joinCode}
        label={de.campaign.joinCodeTitle}
        shareTitle={de.campaign.joinCodeShareTitle(campaign.name)}
        large
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="quiet" onClick={() => replace.mutate()} busy={replace.isPending}>
          {de.campaign.replaceJoinCode}
        </Button>
        <span className="text-sm text-dim">{de.campaign.replaceJoinCodeNote}</span>
      </div>
      <ErrorAlert error={replace.error} />
    </div>
  )
}
