// The session page's spectator buttons (knowledge/features/spectator-view.md, "Joining a
// session"): "Als Zuschauer öffnen" turns this device into the session's spectator screen
// (every member), and "Zuschauer einladen" shows the QR code, link and join code for the
// session DM and `dm` members.
import { useState } from 'react'
import type { Campaign, Session } from '../api/types'
import { Button, ButtonLink } from '../components/ui'
import { CopyBox } from '../components/CopyBox'
import { spectatorPath } from '../sessions/paths'
import { de } from '../text/de'
import { QrCode } from './QrCode'
import { joinLink } from './qr'

const t = de.spectator

export function SessionSpectatorControls({
  campaign,
  session,
}: {
  campaign: Campaign
  session: Session
}) {
  const [inviting, setInviting] = useState(false)
  // Only `dm` members get the join code with the campaign; the session DM is one.
  const code = campaign.joinCode
  const canInvite = code !== null && session.status !== 'ended'
  const link = code ? joinLink(window.location.origin, code, session.id) : ''

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <ButtonLink to={spectatorPath(campaign.id, session.id)}>{t.open}</ButtonLink>
        {canInvite && (
          <Button onClick={() => setInviting((open) => !open)} aria-expanded={inviting}>
            {t.invite}
          </Button>
        )}
      </div>
      {canInvite && inviting && (
        <section
          aria-label={t.inviteTitle}
          className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4"
        >
          <p className="text-dim">{t.inviteHint}</p>
          <QrCode value={link} className="w-full max-w-sm self-center rounded-xl" />
          <CopyBox value={link} label={t.inviteLink} shareTitle={campaign.name} />
          <CopyBox value={code} label={t.inviteCode} large />
          <div>
            <Button variant="quiet" onClick={() => setInviting(false)}>
              {t.close}
            </Button>
          </div>
        </section>
      )}
    </div>
  )
}
