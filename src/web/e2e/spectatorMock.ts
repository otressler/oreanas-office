// What the spectator specs need next to MockBackend and MockHub (stage 10, spectator lane),
// kept in its own file: the join endpoints (/api/join/:code, /api/join/:code/spectate),
// the session's spectate endpoints, the hub's WatchSession and the messages a watching screen
// gets when a fight starts or ends. Follows src/Server/Sessions/SessionSpectators.cs and
// knowledge/features/spectator-view.md.
//
// attach() adds a route after MockBackend's, so it is asked first and passes everything else
// on with route.fallback().
import type { BrowserContext, Route } from '@playwright/test'
import type { components } from '../src/api/schema.js'
import type { Client, MockHub } from './mockHub.ts'
import type { MockBackend } from './mockBackend.ts'

type S = components['schemas']
type Campaign = MockBackend['campaigns'][number]
type Session = MockBackend['sessions'][number]
type Encounter = MockBackend['encounters'][number]

interface Watcher {
  client: Client
  sessionId: string
}

export class SpectatorMock {
  /** Session spectator entries (people who joined a session without joining the campaign). */
  readonly entries: { userId: string; sessionId: string }[] = []
  /** The play mode WatchedSession reports; the mock's sessions are "byod" unless a spec says. */
  playMode: S['PlayMode'] = 'byod'
  private readonly watchers: Watcher[] = []

  private readonly backend: MockBackend
  private readonly hub: MockHub

  constructor(backend: MockBackend, hub: MockHub) {
    this.backend = backend
    this.hub = hub
    hub.handlers.set('WatchSession', ({ client, userId, args }) =>
      this.watchSession(client, userId, args[0] as S['WatchSessionRequest']),
    )
    // The screen's table connection joins the fight after WatchSession: session spectators
    // aren't members, so the backend's own check would turn them away.
    hub.handlers.set('JoinEncounter', ({ client, userId, args }) => {
      const encounterId = String(args[0])
      const encounter = this.backend.encounters.find((e) => e.id === encounterId)
      const watching = this.watchers.some(
        (w) => w.client === client && w.sessionId === encounter?.sessionId,
      )
      const result: S['HubResult'] =
        watching && encounter?.status === 'active'
          ? { error: null }
          : this.backend.joinEncounter(userId, encounterId)
      if (!result.error) client.encounterId = encounterId
      return result
    })
  }

  async attach(context: BrowserContext) {
    await context.route('**/api/**', (route) => this.handle(context, route))
  }

  // ---- What a spec does to the table -----------------------------------------------------

  /** The fight is running: every screen watching its session is told (its table then joins). */
  announceStart(encounter: Encounter) {
    for (const watcher of this.watching(encounter.sessionId)) {
      this.push(watcher, 'EncounterStarted', {
        sessionId: encounter.sessionId,
        encounterId: encounter.id,
      })
    }
  }

  /** The fight ended (the spec sets the status): the watching screens are told. */
  announceEnd(encounter: Encounter) {
    for (const watcher of this.watching(encounter.sessionId)) {
      this.push(watcher, 'EncounterEnded', encounter.id)
    }
  }

  /** The session ended: the watching screens are told and the server lets them go. */
  announceSessionEnd(session: Session) {
    for (const watcher of this.watching(session.id)) {
      this.push(watcher, 'SessionEnded', session.id)
    }
  }

  /** How many screens are watching the session right now. */
  watchingCount(sessionId: string): number {
    return this.watching(sessionId).length
  }

  // ---- The hub ----------------------------------------------------------------------------

  private watchSession(
    client: Client,
    userId: string | null,
    request: S['WatchSessionRequest'],
  ): S['WatchResult'] {
    const refused = (error: S['ApiErrorCode']): S['WatchResult'] => ({
      error,
      mode: request.sharedScreen ? 'sharedScreen' : 'spectator',
      session: null,
    })
    const session = this.backend.sessions.find((s) => s.id === request.sessionId)
    const campaign = session && this.backend.campaigns.find((c) => c.id === session.campaignId)
    if (!userId || !session || !campaign || !this.mayWatch(campaign, session, userId)) {
      return refused('tokenNotFound')
    }
    if (request.sharedScreen && this.playMode !== 'local') return refused('notLocalMode')
    this.watchers.push({ client, sessionId: session.id })
    return {
      error: null,
      mode: request.sharedScreen ? 'sharedScreen' : 'spectator',
      session: this.watched(campaign, session),
    }
  }

  private watching(sessionId: string): Watcher[] {
    return this.watchers.filter((w) => w.sessionId === sessionId)
  }

  private push(watcher: Watcher, target: string, event: unknown) {
    try {
      this.hub.send(watcher.client, { type: 1, target, arguments: [event] })
    } catch {
      // The screen's socket is gone.
    }
  }

  // ---- HTTP -------------------------------------------------------------------------------

  private async handle(context: BrowserContext, route: Route) {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()
    const userId = this.backend.userId(context)
    const reply = (status: number, body?: unknown) =>
      route.fulfill(
        body === undefined
          ? { status }
          : { status, contentType: 'application/json', body: JSON.stringify(body) },
      )

    let m = /^\/api\/join\/([^/]+)$/.exec(url.pathname)
    if (m && method === 'GET') {
      if (!userId) return reply(401)
      const campaign = this.campaignByCode(m[1]!)
      if (!campaign) return reply(400, { code: 'joinCodeInvalid' })
      const lookup: S['JoinLookupResponse'] = {
        campaignId: campaign.id,
        campaignName: campaign.name,
        isMember: campaign.members.some((member) => member.userId === userId),
        sessions: this.backend.sessions
          .filter((s) => s.campaignId === campaign.id && s.status !== 'ended')
          .map((s) => ({ id: s.id, title: s.title, date: s.date, status: s.status })),
      }
      return reply(200, lookup)
    }
    m = /^\/api\/join\/([^/]+)\/spectate$/.exec(url.pathname)
    if (m && method === 'POST') {
      if (!userId) return reply(401)
      const campaign = this.campaignByCode(m[1]!)
      if (!campaign) return reply(400, { code: 'joinCodeInvalid' })
      const { sessionId } = request.postDataJSON() as S['SpectateSessionRequest']
      const session = this.backend.sessions.find(
        (s) => s.id === sessionId && s.campaignId === campaign.id,
      )
      if (!session) return reply(400, { code: 'sessionInvalid' })
      if (session.status === 'ended') return reply(409, { code: 'sessionEnded' })
      const isMember = campaign.members.some((member) => member.userId === userId)
      if (
        !isMember &&
        !this.entries.some((e) => e.userId === userId && e.sessionId === sessionId)
      ) {
        this.entries.push({ userId, sessionId })
      }
      const joined: S['SpectateSessionResponse'] = {
        campaignId: campaign.id,
        sessionId,
        isMember,
      }
      return reply(200, joined)
    }
    m = /^\/api\/sessions\/([^/]+)\/spectate(\/board)?$/.exec(url.pathname)
    if (m && method === 'GET') {
      const session = this.backend.sessions.find((s) => s.id === m![1])
      const campaign = session && this.backend.campaigns.find((c) => c.id === session.campaignId)
      if (!userId) return reply(401)
      if (!session || !campaign || !this.mayWatch(campaign, session, userId)) return reply(404)
      if (!m[2]) return reply(200, this.watched(campaign, session))
      const encounter = this.running(session)
      if (!encounter) return reply(404)
      return reply(200, this.playersBoard(encounter))
    }
    return route.fallback()
  }

  private campaignByCode(code: string): Campaign | undefined {
    const clean = code.replaceAll('-', '').toUpperCase()
    return this.backend.campaigns.find((c) => c.joinCode.replaceAll('-', '') === clean)
  }

  private mayWatch(campaign: Campaign, session: Session, userId: string): boolean {
    return (
      campaign.members.some((member) => member.userId === userId) ||
      this.entries.some((e) => e.userId === userId && e.sessionId === session.id)
    )
  }

  private running(session: Session): Encounter | undefined {
    return this.backend.encounters.find((e) => e.sessionId === session.id && e.status === 'active')
  }

  private watched(campaign: Campaign, session: Session): S['WatchedSession'] {
    const characters = this.backend.characters.filter((c) => c.campaignId === campaign.id)
    return {
      sessionId: session.id,
      campaignId: campaign.id,
      title: session.title,
      date: session.date,
      status: session.status,
      playMode: this.playMode,
      activeEncounterId: this.running(session)?.id ?? null,
      characters: characters.map((character, index) => ({
        name: character.name,
        imageUrl: null,
        color: character.color,
        colorIndex: index,
      })),
    }
  }

  /** The players' board, whoever asks: not the session DM's, no removed tokens. */
  private playersBoard(encounter: Encounter): S['BoardStateResponse'] {
    const build = this.backend['boardResponse'].bind(this.backend) as (
      encounter: Encounter,
      userId: string,
    ) => S['BoardStateResponse']
    return { ...build(encounter, 'a spectator'), viewer: 'player', playMode: this.playMode }
  }
}
