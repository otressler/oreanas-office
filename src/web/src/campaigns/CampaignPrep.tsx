// The `dm` members' way to the maps and the bestiary (knowledge/features/campaign-page.md):
// two panels with a picture each, like home's joining and creating. Both pages work offline,
// so the counts come from this browser's copy, not the server.
import { useLiveQuery } from 'dexie-react-hooks'
import { useId } from 'react'
import { bestiaryPath } from '../bestiary/paths'
import { ChevronLink, PicturePanel, SectionHeading } from '../components/ornaments'
import { mapListPath } from '../editor/paths'
import { picture } from '../lib/pictures'
import { offlineDb } from '../offline/db'
import { lastUser } from '../offline/identity'
import { de } from '../text/de'

// Pictures in public/campaign/.
const MAPS_PICTURE = picture('campaign/maps')
const BESTIARY_PICTURE = picture('campaign/bestiary')

export function CampaignPrep({ campaignId }: { campaignId: string }) {
  const id = useId()
  const counts = usePrepCounts(campaignId)
  return (
    <section aria-labelledby={id} className="mt-16">
      <SectionHeading id={id} kicker={de.campaign.prepKicker} level={2}>
        {de.campaign.prepTitle}
      </SectionHeading>
      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <PicturePanel
          title={de.maps.campaignLink}
          body={de.maps.campaignLinkHint}
          image={MAPS_PICTURE}
        >
          <PrepFooter
            count={counts && de.maps.campaignCount(counts.maps, counts.archivedMaps)}
            to={mapListPath(campaignId)}
            label={de.maps.campaignOpen}
          />
        </PicturePanel>
        <PicturePanel
          title={de.bestiary.title}
          body={de.bestiary.campaignBody}
          image={BESTIARY_PICTURE}
        >
          <PrepFooter
            count={counts && de.bestiary.campaignCount(counts.creatureTypes)}
            to={bestiaryPath(campaignId)}
            label={de.bestiary.campaignOpen}
          />
        </PicturePanel>
      </div>
    </section>
  )
}

function PrepFooter({
  count,
  to,
  label,
}: {
  count: string | undefined
  to: string
  label: string
}) {
  return (
    <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-5 pt-2">
      <ChevronLink variant="light" to={to}>
        {label}
      </ChevronLink>
      {count && <span className="text-sm text-dim">{count}</span>}
    </div>
  )
}

/**
 * The campaign's maps and creature types in this browser, archived ones apart from maps.
 * Undefined while loading, or without a user on this device.
 */
function usePrepCounts(campaignId: string) {
  const userId = lastUser()?.id
  return useLiveQuery(async () => {
    if (!userId) return undefined
    const db = offlineDb(userId)
    const [maps, types] = await Promise.all([
      db.maps.where('campaignId').equals(campaignId).toArray(),
      db.creatureTypes.where('campaignId').equals(campaignId).toArray(),
    ])
    const archivedMaps = maps.filter((map) => map.archivedAt !== null).length
    return {
      maps: maps.length - archivedMaps,
      archivedMaps,
      creatureTypes: types.filter((type) => type.archivedAt === null).length,
    }
  }, [userId, campaignId])
}
