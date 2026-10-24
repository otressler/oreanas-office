// The spectator screen of one session (knowledge/features/spectator-view.md), route
// /kampagnen/:campaignId/sitzungen/:sessionId/zuschauen; with ?gemeinsam=1 the same screen is
// opened as a shared screen (local mode, knowledge/features/shared-table.md). Full screen, no
// header, landscape first. It follows the session by itself: the waiting states, the fight
// (zoomed to the whole map), "Sitzung beendet". The device remembers it is this session's
// screen until someone leaves the view.
import { useEffect, useMemo, useRef } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import type { BoardHandle } from '../board/Board'
import { useCurrentUser } from '../auth/auth'
import { useCampaign, useCampaigns } from '../campaigns/queries'
import { joinPath, sessionPath } from '../sessions/paths'
import { de } from '../text/de'
import { CornerMenu } from './CornerMenu'
import { joinLink } from './qr'
import { forgetScreen, rememberScreen, rememberedScreen } from './remember'
import { keepsAwake, showsSharedControls } from './screenState'
import { EndedScreen, PlannedScreen, WaitingScreen } from './WaitingScreen'
import { SpectatorBoard } from './SpectatorBoard'
import { useSpectatorScreen } from './useSpectatorScreen'
import { useWakeLock } from './useWakeLock'
import type { WatchStatus } from './sessionWatch'

const t = de.spectator

export function SpectatorPage() {
  const { campaignId = '', sessionId = '' } = useParams()
  const [params] = useSearchParams()
  const requestedShared = params.get('gemeinsam') === '1'
  const me = useCurrentUser()
  const navigate = useNavigate()
  const screen = useSpectatorScreen(sessionId, requestedShared)
  const { model, phase, status } = screen
  const board = useRef<BoardHandle>(null)
  // The shared screen's controls draw their own board over this one while they are there.
  const layerBoard = useRef<BoardHandle>(null)

  // Members are in the campaigns list; session spectators are not, and can't read the campaign.
  const campaigns = useCampaigns()
  const isMember = campaigns.data?.some((campaign) => campaign.id === campaignId) ?? false
  const campaign = useCampaign(campaignId, { enabled: isMember })

  // The device is now this session's screen. The join code of someone who joined with it is
  // kept for the way back to the join page.
  const joinCode = useMemo(() => {
    const prior = rememberedScreen()
    return prior?.sessionId === sessionId ? prior.joinCode : null
  }, [sessionId])
  useEffect(() => {
    rememberScreen({
      userId: me.id,
      campaignId,
      sessionId,
      sharedScreen: requestedShared,
      joinCode,
    })
  }, [me.id, campaignId, sessionId, requestedShared, joinCode])

  useWakeLock(keepsAwake(model))

  // The QR code needs the campaign's join code: `dm` members get it with the campaign, someone
  // who joined with it remembers it. Players never see it (knowledge/domain/campaign.md).
  const code = campaign.data?.joinCode ?? joinCode
  const link = code && model.session ? joinLink(window.location.origin, code, sessionId) : null

  function leave() {
    forgetScreen()
    if (isMember) void navigate(sessionPath(campaignId, sessionId))
    else void navigate(joinCode ? joinPath(joinCode, sessionId) : '/')
  }

  return (
    <div
      role="main"
      aria-label={t.screen}
      className="fixed inset-0 z-40 flex flex-col bg-table pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]"
    >
      {screen.denied || status === 'denied' ? (
        <Denied isMember={isMember} joinCode={joinCode} sessionId={sessionId} onLeave={leave} />
      ) : (
        <>
          {phase === 'loading' && <Notice status={status} />}
          {phase === 'planned' && model.session && <PlannedScreen session={model.session} />}
          {phase === 'waiting' && model.session && (
            <WaitingScreen session={model.session} link={link} />
          )}
          {phase === 'ended' && model.session && <EndedScreen session={model.session} />}
          {phase === 'fight' && model.session && model.encounterId && (
            <SpectatorBoard
              // A new fight is a new board.
              key={model.encounterId}
              session={model.session}
              encounterId={model.encounterId}
              screen={screen.screen}
              sharedScreen={screen.sharedScreen}
              sharedControls={showsSharedControls(model, screen.sharedScreen)}
              handleRef={board}
              layerHandleRef={layerBoard}
            />
          )}
          {phase !== 'loading' && phase !== 'fight' && <StatusLine status={status} />}
          <CornerMenu
            onFit={phase === 'fight' ? () => (layerBoard.current ?? board.current)?.fit?.() : null}
            onLeave={leave}
          />
        </>
      )}
    </div>
  )
}

/** Why the screen isn't live, in words; nothing while it is. */
function statusText(status: WatchStatus): string | null {
  switch (status) {
    case 'connecting':
      return t.connecting
    case 'reconnecting':
      return t.reconnecting
    case 'offline':
      return t.offline
    case 'paused':
      return t.paused
    case 'idle':
      return t.idle
    default:
      return null
  }
}

function StatusLine({ status }: { status: WatchStatus }) {
  const text = statusText(status)
  return (
    <p
      role="status"
      data-testid="spectator-status"
      data-status={status}
      className={text ? 'p-3 text-center text-lg text-dim' : 'sr-only'}
    >
      {text ?? ''}
    </p>
  )
}

function Notice({ status }: { status: WatchStatus }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-8 text-center">
      <p
        role="status"
        data-testid="spectator-status"
        data-status={status}
        className="text-2xl text-dim"
      >
        {statusText(status) ?? t.connecting}
      </p>
    </div>
  )
}

function Denied({
  isMember,
  joinCode,
  sessionId,
  onLeave,
}: {
  isMember: boolean
  joinCode: string | null
  sessionId: string
  onLeave: () => void
}) {
  // No access any more: the memory of this screen would only bring the person back here.
  useEffect(() => forgetScreen(), [])
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <p role="alert" className="text-3xl font-semibold text-parchment">
        {t.denied}
      </p>
      <p className="max-w-xl text-xl text-dim">{t.deniedHint}</p>
      {joinCode && !isMember ? (
        <Link to={joinPath(joinCode, sessionId)} className="text-xl text-candle underline">
          {t.toJoin}
        </Link>
      ) : (
        <button type="button" onClick={onLeave} className="text-xl text-candle underline">
          {t.toHome}
        </button>
      )}
    </div>
  )
}
