import { Link, useParams } from 'react-router'
import { useLocalCampaign } from '../campaigns/localCampaigns'
import { CharactersPanel } from '../campaigns/CharactersPanel'
import { MembersPanel } from '../campaigns/MembersPanel'
import { useCampaign } from '../campaigns/queries'
import { SessionsPanel } from '../campaigns/SessionsPanel'
import { DmStatusListPanel } from '../statuses/DmStatusListPanel'
import { Badge, LoadError, Loading, PageTitle } from '../components/ui'
import { CampaignMapsLink } from '../maps/CampaignMapsLink'
import { useKeepCampaignCopy } from '../maps/campaignCopy'
import { SyncMark } from '../maps/SyncMark'
import type { CampaignCopy } from '../offline/db'
import { SyncStatusView } from '../sync'
import { de } from '../text/de'

/**
 * /kampagnen/:campaignId — the sessions with their fights first, since that's what game
 * night needs (knowledge/features/session-planning.md); `dm` members also find the maps.
 */
export function CampaignPage() {
  const { campaignId = '' } = useParams()
  // A campaign made offline isn't on the server yet; undefined while the copy loads.
  const local = useLocalCampaign(campaignId)
  const campaign = useCampaign(campaignId, { enabled: local === null })
  // The map pages work offline from this copy.
  useKeepCampaignCopy(campaign.data)

  if (local === undefined) return <Loading />
  if (local) return <LocalCampaignPage copy={local} />
  if (campaign.isPending) return <Loading />
  if (campaign.isError) {
    return <LoadError error={campaign.error} onRetry={() => void campaign.refetch()} />
  }

  return (
    <div className="flex flex-col pb-8">
      <Link to="/" className="pt-4 text-sm text-candle underline-offset-4 hover:underline">
        <span aria-hidden="true">← </span>
        {de.campaign.back}
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <PageTitle>{campaign.data.name}</PageTitle>
        <Badge>{de.roles[campaign.data.myRole]}</Badge>
      </div>
      <SessionsPanel campaign={campaign.data} />
      {campaign.data.myRole === 'dm' && <CampaignMapsLink campaignId={campaign.data.id} />}
      <CharactersPanel campaignId={campaign.data.id} />
      {campaign.data.myRole === 'dm' && <DmStatusListPanel campaignId={campaign.data.id} />}
      <MembersPanel campaign={campaign.data} />
    </div>
  )
}

/**
 * A campaign made on this device (knowledge/decisions/offline-prep-pwa.md, "Campaigns
 * offline"): only its maps work until the first sync gives it a join code. Characters and
 * sessions need the server's copy.
 */
function LocalCampaignPage({ copy }: { copy: CampaignCopy }) {
  return (
    <div className="flex flex-col pb-8">
      <Link to="/" className="pt-4 text-sm text-candle underline-offset-4 hover:underline">
        <span aria-hidden="true">← </span>
        {de.campaign.back}
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <PageTitle>{copy.name}</PageTitle>
        <Badge>{de.roles[copy.myRole]}</Badge>
        {copy.sync && <SyncMark sync={copy.sync} />}
      </div>
      <p className="text-dim">{de.sync.localCampaign.localBody}</p>
      <div className="mt-3">
        <SyncStatusView />
      </div>
      <CampaignMapsLink campaignId={copy.id} />
    </div>
  )
}
