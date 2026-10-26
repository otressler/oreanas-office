import { Link, useParams } from 'react-router'
import type { Campaign } from '../api/types'
import { CampaignCardPanel } from '../campaigns/CampaignCardPanel'
import { CampaignCover } from '../campaigns/CampaignCover'
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
      <CampaignHeader campaign={campaign.data} />
      <SessionsPanel campaign={campaign.data} />
      {campaign.data.myRole === 'dm' && <CampaignMapsLink campaignId={campaign.data.id} />}
      <CharactersPanel campaign={campaign.data} />
      {campaign.data.myRole === 'dm' && <DmStatusListPanel campaignId={campaign.data.id} />}
      {campaign.data.myRole === 'dm' && <CampaignCardPanel campaign={campaign.data} />}
      <MembersPanel campaign={campaign.data} />
    </div>
  )
}

/** The cover with the name over it, as on the home page's card, and the description. */
function CampaignHeader({ campaign }: { campaign: Campaign }) {
  return (
    <header className="mt-4 flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-sm border border-candle/25">
        <CampaignCover
          url={campaign.coverUrl}
          alt=""
          sizes="(min-width: 768px) 736px, 100vw"
          className="aspect-[3/1] w-full sm:aspect-[4/1]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-table via-table/50 to-transparent"
        />
        <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end gap-3 px-4 pb-3">
          <h1 className="font-display text-2xl font-semibold text-parchment drop-shadow-[0_2px_8px_rgb(0_0_0/0.9)] sm:text-3xl">
            {campaign.name}
          </h1>
          <span className="mb-1">
            <Badge>{de.roles[campaign.myRole]}</Badge>
          </span>
        </div>
      </div>
      {campaign.description && <p className="text-parchment/85">{campaign.description}</p>}
    </header>
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
