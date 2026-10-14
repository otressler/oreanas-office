// /karten — the campaigns from the offline copy where the user is `dm`, to reach their
// map lists without the server (knowledge/decisions/offline-prep-pwa.md). The server
// gate's offline and waking screens link here.
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router'
import { ButtonLink, Loading, PageTitle } from '../components/ui'
import { mapListPath } from '../editor/paths'
import { useCampaignCopies } from '../offline/campaigns'
import { useLocalUser } from '../offline/localUser'
import { de } from '../text/de'

const t = de.maps

export function OfflineMapsPage() {
  const { db } = useLocalUser()
  const campaigns = useCampaignCopies(db)
  // Maps that aren't archived, per campaign.
  const counts = useLiveQuery(async () => {
    const result = new Map<string, number>()
    await db.maps
      .filter((map) => map.archivedAt === null)
      .each((map) => result.set(map.campaignId, (result.get(map.campaignId) ?? 0) + 1))
    return result
  }, [db])

  if (campaigns === undefined || counts === undefined) return <Loading />
  const mine = campaigns.filter((campaign) => campaign.myRole === 'dm')

  return (
    <div className="flex flex-col gap-3 pb-8">
      <PageTitle>{t.offlineTitle}</PageTitle>
      {mine.length === 0 ? (
        <>
          <p className="text-dim">{t.offlineEmpty}</p>
          <ButtonLink to="/" className="self-start">
            {t.home}
          </ButtonLink>
        </>
      ) : (
        <>
          <p className="text-dim">{t.offlineIntro}</p>
          <ul className="flex flex-col gap-2">
            {mine.map((campaign) => (
              <li key={campaign.id}>
                <Link
                  to={mapListPath(campaign.id)}
                  className="flex min-h-11 items-center gap-3 rounded-xl border border-line bg-panel p-4 hover:border-candle"
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-semibold break-words text-parchment">
                      {campaign.name}
                    </span>
                    <span className="text-sm text-dim">
                      {t.mapCount(counts.get(campaign.id) ?? 0)}
                    </span>
                  </span>
                  <span aria-hidden="true" className="ml-auto text-xl text-candle">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
