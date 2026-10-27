// The bestiary's pages read the campaign's copy in this browser and are for its `dm`
// members only (knowledge/features/campaign-page.md), like the map list.
import type { ReactNode } from 'react'
import { BackLink } from '../components/sheet'
import { Loading, PageTitle } from '../components/ui'
import { useCampaignCopy } from '../offline/campaigns'
import { useLocalUser } from '../offline/localUser'
import type { CampaignCopy } from '../offline/db'
import { de } from '../text/de'

const t = de.bestiary

/** Renders `children` with the campaign once it's known here and the viewer runs it. */
export function BestiaryGate({
  campaignId,
  children,
}: {
  campaignId: string
  children: (campaign: CampaignCopy) => ReactNode
}) {
  const { db } = useLocalUser()
  const campaign = useCampaignCopy(db, campaignId)

  if (campaign === undefined) return <Loading />
  if (campaign === null) {
    return <Message campaignId={campaignId} title={de.maps.unknownTitle} body={t.unknownBody} />
  }
  if (campaign.myRole !== 'dm') {
    return <Message campaignId={campaignId} title={de.maps.notDmTitle} body={t.notDmBody} />
  }
  return children(campaign)
}

function Message({ campaignId, title, body }: { campaignId: string; title: string; body: string }) {
  return (
    <div className="flex flex-col pb-8">
      <BackLink to={`/kampagnen/${campaignId}`} label={de.maps.back} />
      <PageTitle>{title}</PageTitle>
      <p className="text-dim">{body}</p>
    </div>
  )
}
