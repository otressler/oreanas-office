// /kampagnen/:campaignId/bestiarium — the campaign's creature types in this browser, outside
// any map (knowledge/features/campaign-page.md). Works offline from the campaign's copy, like
// the map list; generating and uploading icons need a connection (knowledge/features/token-icons.md).
import { Link, useParams } from 'react-router'
import { SectionHeading } from '../components/ornaments'
import { Loading, PageTitle } from '../components/ui'
import { useCampaignCopy } from '../offline/campaigns'
import { useLocalUser } from '../offline/localUser'
import { de } from '../text/de'
import { BestiaryList } from './BestiaryList'

const t = de.bestiary

export function BestiaryPage() {
  const { campaignId = '' } = useParams()
  const { db } = useLocalUser()
  const campaign = useCampaignCopy(db, campaignId)

  if (campaign === undefined) return <Loading />
  if (campaign === null) {
    return <Message campaignId={campaignId} title={de.maps.unknownTitle} body={t.unknownBody} />
  }
  if (campaign.myRole !== 'dm') {
    return <Message campaignId={campaignId} title={de.maps.notDmTitle} body={t.notDmBody} />
  }

  return (
    <div className="flex flex-col pb-12">
      <BackLink campaignId={campaignId} />
      <div className="mt-6">
        <SectionHeading kicker={campaign.name} level={1}>
          {t.title}
        </SectionHeading>
      </div>
      <p className="mt-6 max-w-2xl text-dim">{t.pageIntro}</p>
      <div className="relative mt-8 rounded-sm border border-candle/25 bg-panel p-5 shadow-[0_30px_60px_-30px_rgb(0_0_0/0.9)]">
        <BestiaryList campaignId={campaignId} />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-1.5 rounded-sm border border-candle/10"
        />
      </div>
    </div>
  )
}

function BackLink({ campaignId }: { campaignId: string }) {
  return (
    <Link
      to={`/kampagnen/${campaignId}`}
      className="pt-4 text-sm text-candle underline-offset-4 hover:underline"
    >
      <span aria-hidden="true">← </span>
      {de.maps.back}
    </Link>
  )
}

function Message({ campaignId, title, body }: { campaignId: string; title: string; body: string }) {
  return (
    <div className="flex flex-col pb-8">
      <BackLink campaignId={campaignId} />
      <PageTitle>{title}</PageTitle>
      <p className="text-dim">{body}</p>
    </div>
  )
}
