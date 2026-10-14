import { Link } from 'react-router'
import { mapListPath } from '../editor/paths'
import { de } from '../text/de'

/** The campaign page's way to its map list, for `dm` members. */
export function CampaignMapsLink({ campaignId }: { campaignId: string }) {
  return (
    <Link
      to={mapListPath(campaignId)}
      className="mt-4 flex items-center gap-3 rounded-xl border border-line bg-panel p-4 hover:border-candle"
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-lg font-semibold text-parchment">{de.maps.campaignLink}</span>
        <span className="text-sm text-dim">{de.maps.campaignLinkHint}</span>
      </span>
      <span aria-hidden="true" className="ml-auto text-xl text-candle">
        →
      </span>
    </Link>
  )
}
