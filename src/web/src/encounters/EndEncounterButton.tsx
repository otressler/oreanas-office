import { useState } from 'react'
import { Button, ErrorAlert } from '../components/ui'
import { de } from '../text/de'
import { useEndEncounter } from './queries'

/**
 * "Kampf beenden" for the session DM, with a confirmation in place: ending is
 * for everyone at the table and can't be undone.
 */
export function EndEncounterButton({
  campaignId,
  sessionId,
  encounterId,
  onEnded,
}: {
  campaignId: string
  sessionId: string
  encounterId: string
  onEnded?: () => void
}) {
  const [asking, setAsking] = useState(false)
  const end = useEndEncounter(campaignId, sessionId, encounterId)

  if (!asking) {
    return <Button onClick={() => setAsking(true)}>{de.encounters.end}</Button>
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-parchment">{de.encounters.endQuestion}</span>
      <Button
        variant="primary"

        busy={end.isPending}
        onClick={() => end.mutate(undefined, { onSuccess: () => onEnded?.() })}
      >
        {de.encounters.endConfirm}
      </Button>
      <Button
        variant="quiet"

        onClick={() => {
          setAsking(false)
          end.reset()
        }}
      >
        {de.common.cancel}
      </Button>
      <ErrorAlert error={end.error} />
    </div>
  )
}
