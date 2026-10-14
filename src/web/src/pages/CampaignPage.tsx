import { Link, useParams } from 'react-router'
import { CharactersPanel } from '../campaigns/CharactersPanel'
import { MembersPanel } from '../campaigns/MembersPanel'
import { useCampaign } from '../campaigns/queries'
import { SessionsPanel } from '../campaigns/SessionsPanel'
import { Badge, LoadError, Loading, PageTitle } from '../components/ui'
import { EncountersPanel } from '../encounters/EncountersPanel'
import { CampaignMapsLink } from '../maps/CampaignMapsLink'
import { useKeepCampaignCopy } from '../maps/campaignCopy'
import { de } from '../text/de'

/**
 * /kampagnen/:campaignId — sessions first, since that's what game night needs;
 * then the fights, which only `dm` members see.
 */
export function CampaignPage() {
  const { campaignId = '' } = useParams()
  const campaign = useCampaign(campaignId)
  // The map pages work offline from this copy.
  useKeepCampaignCopy(campaign.data)

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
      {campaign.data.myRole === 'dm' && (
        <>
          <CampaignMapsLink campaignId={campaign.data.id} />
          <EncountersPanel campaign={campaign.data} />
        </>
      )}
      <CharactersPanel campaignId={campaign.data.id} />
      <MembersPanel campaign={campaign.data} />
    </div>
  )
}
