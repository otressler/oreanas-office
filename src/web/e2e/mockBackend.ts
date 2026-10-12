// An in-memory stand-in for the backend API, for specs that run against
// `vite preview`. One MockBackend holds the data; each browser context attached
// to it has its own sign-in (like its own cookie), so a spec can play several
// people at once. Behaviour follows the API contract in src/api/schema.d.ts.
import { randomUUID } from 'node:crypto'
import type { BrowserContext, Request, Route } from '@playwright/test'
import type { components } from '../src/api/schema.js'

type S = components['schemas']
type ErrorCode = S['ApiErrorCode']

interface User {
  id: string
  displayName: string
  email: string
  password: string | null
  isAdmin: boolean
  hasGoogle: boolean
}

interface Invite {
  id: string
  token: string
  createdAt: string
  expiresAt: string
  revoked: boolean
}

interface Campaign {
  id: string
  name: string
  defaultDmUserId: string
  joinCode: string
  members: { userId: string; role: S['CampaignRole']; joinedAt: string }[]
}

interface Character {
  id: string
  campaignId: string
  ownerUserId: string
  name: string
  size: S['CreatureSize']
  speedSquares: number
}

interface Session {
  id: string
  campaignId: string
  title: string
  date: string
  status: S['SessionStatus']
  dmUserId: string
  createdByUserId: string
}

/** A reply: status and JSON body (none for 204). */
type Reply = [number, unknown?]

const HOUR = 3_600_000
// Join codes avoid look-alikes (knowledge/domain/campaign.md).
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export class MockBackend {
  readonly users: User[] = []
  readonly invites: Invite[] = []
  readonly campaigns: Campaign[] = []
  readonly characters: Character[] = []
  readonly sessions: Session[] = []
  googleEnabled = false
  private readonly signedIn = new Map<BrowserContext, string | null>()

  // ---- Seeding -------------------------------------------------------------

  addUser(fields: Partial<User> & { displayName: string; email: string }): User {
    const user: User = {
      id: randomUUID(),
      password: 'geheim123',
      isAdmin: false,
      hasGoogle: false,
      ...fields,
    }
    this.users.push(user)
    return user
  }

  /** A registration invite; `expired` makes one that ran out an hour ago. */
  addInvite({ expired = false } = {}): Invite {
    const now = Date.now()
    const invite: Invite = {
      id: randomUUID(),
      token: randomUUID().replaceAll('-', ''),
      createdAt: new Date(now - (expired ? 5 * HOUR : 0)).toISOString(),
      expiresAt: new Date(now + (expired ? -HOUR : 4 * HOUR)).toISOString(),
      revoked: false,
    }
    this.invites.push(invite)
    return invite
  }

  addCampaign(name: string, dm: User, joinCode = this.newJoinCode()): Campaign {
    const campaign: Campaign = {
      id: randomUUID(),
      name,
      defaultDmUserId: dm.id,
      joinCode,
      members: [{ userId: dm.id, role: 'dm', joinedAt: new Date().toISOString() }],
    }
    this.campaigns.push(campaign)
    return campaign
  }

  /** Signs a browser context in as `user`, as if it had the cookie already. */
  signIn(context: BrowserContext, user: User) {
    this.signedIn.set(context, user.id)
  }

  /** Answers /api/** for this context (pages and service worker). */
  async attach(context: BrowserContext) {
    if (!this.signedIn.has(context)) this.signedIn.set(context, null)
    await context.route('**/api/**', (route) => this.handle(context, route))
  }

  // ---- Request handling -----------------------------------------------------

  private async handle(context: BrowserContext, route: Route) {
    const request = route.request()
    const url = new URL(request.url())
    const [status, body] = this.dispatch(context, request, url)
    await route.fulfill(
      body === undefined
        ? { status }
        : { status, contentType: 'application/json', body: JSON.stringify(body) },
    )
  }

  private dispatch(context: BrowserContext, request: Request, url: URL): Reply {
    const method = request.method()
    const path = url.pathname
    const body = (request.postDataJSON() ?? {}) as Record<string, unknown>
    const me = this.users.find((u) => u.id === this.signedIn.get(context)) ?? null
    const match = (pattern: string) => matchPath(pattern, path)
    let params: Record<string, string> | null

    if (path === '/api/health') return [200, { status: 'ok' }]
    if (method === 'GET' && path === '/api/auth/options') {
      return [200, { googleEnabled: this.googleEnabled }]
    }
    if ((params = match('/api/auth/invites/:token')) && method === 'GET') {
      const invite = this.usableInvite(params.token!)
      return [200, { valid: !!invite, expiresAt: invite?.expiresAt ?? null }]
    }
    if (method === 'POST' && path === '/api/auth/register') {
      if (!this.usableInvite(String(body.inviteToken))) return error('inviteInvalid')
      const displayName = String(body.displayName ?? '').trim()
      const email = String(body.email ?? '').trim()
      const password = String(body.password ?? '')
      if (!displayName) return error('displayNameInvalid', 'displayName')
      if (!email.includes('@')) return error('emailInvalid', 'email')
      if (this.userByEmail(email)) return error('emailTaken', 'email')
      if (password.length < 8) return error('passwordTooShort', 'password')
      const user = this.addUser({ displayName, email, password })
      this.signedIn.set(context, user.id)
      return [200, meResponse(user)]
    }
    if (method === 'POST' && path === '/api/auth/login') {
      const user = this.userByEmail(String(body.email ?? ''))
      if (!user || user.password === null || user.password !== body.password) {
        return error('invalidCredentials')
      }
      this.signedIn.set(context, user.id)
      return [200, meResponse(user)]
    }
    if (method === 'POST' && path === '/api/auth/logout') {
      this.signedIn.set(context, null)
      return [204]
    }
    if (method === 'POST' && path === '/api/auth/password-reset') {
      const user = this.users.find((u) => u.id === body.userId)
      if (!user || body.token !== 'reset-token') return error('resetLinkInvalid')
      if (String(body.newPassword ?? '').length < 8) return error('passwordTooShort', 'newPassword')
      user.password = String(body.newPassword)
      return [204]
    }

    // Everything below needs a signed-in user.
    if (!me) return [401]

    if (path === '/api/auth/me') {
      if (method === 'PUT') {
        const displayName = String(body.displayName ?? '').trim()
        if (!displayName) return error('displayNameInvalid', 'displayName')
        me.displayName = displayName
      }
      return [200, meResponse(me)]
    }

    if (path.startsWith('/api/admin/')) {
      if (!me.isAdmin) return [403]
      if (path === '/api/admin/invites' && method === 'GET') {
        return [200, this.invites.filter((i) => this.usableInvite(i.token)).map(inviteResponse)]
      }
      if (path === '/api/admin/invites' && method === 'POST') {
        const invite = this.addInvite()
        return [200, { ...inviteResponse(invite), url: `${url.origin}/einladung/${invite.token}` }]
      }
      if ((params = match('/api/admin/invites/:id')) && method === 'DELETE') {
        const invite = this.invites.find((i) => i.id === params!.id)
        if (!invite) return [404]
        invite.revoked = true
        return [204]
      }
      if (path === '/api/admin/users' && method === 'GET') {
        return [200, this.users.map((u) => ({ ...userSummary(u) }))]
      }
      if ((params = match('/api/admin/users/:id/reset-link')) && method === 'POST') {
        const user = this.users.find((u) => u.id === params!.id)
        if (!user) return [404]
        return [
          200,
          {
            url: `${url.origin}/passwort-zuruecksetzen?benutzer=${user.id}&token=reset-token`,
            expiresAt: new Date(Date.now() + 24 * HOUR).toISOString(),
          },
        ]
      }
      return [404]
    }

    if (path === '/api/campaigns' && method === 'GET') {
      return [
        200,
        this.campaigns.filter((c) => memberOf(c, me.id)).map((c) => this.campaignSummary(c, me.id)),
      ]
    }
    if (path === '/api/campaigns' && method === 'POST') {
      const name = String(body.name ?? '').trim()
      if (!name) return error('nameInvalid', 'name')
      return [201, this.campaignResponse(this.addCampaign(name, me), me.id)]
    }
    if (path === '/api/campaigns/join' && method === 'POST') {
      const code = String(body.code ?? '')
        .replaceAll('-', '')
        .replaceAll(' ', '')
        .toUpperCase()
      const campaign = this.campaigns.find((c) => c.joinCode === code)
      if (!campaign) return error('joinCodeInvalid', 'code')
      if (!memberOf(campaign, me.id)) {
        campaign.members.push({ userId: me.id, role: 'player', joinedAt: new Date().toISOString() })
      }
      return [200, this.campaignSummary(campaign, me.id)]
    }

    params = match('/api/campaigns/:campaignId/*')
    const campaign = this.campaigns.find((c) => c.id === params?.campaignId)
    if (!campaign) return [404]
    const role = memberOf(campaign, me.id)?.role
    if (!role) return [403]
    const isDm = role === 'dm'
    const base = `/api/campaigns/${campaign.id}`

    if (path === base && method === 'GET') return [200, this.campaignResponse(campaign, me.id)]
    if (path === `${base}/join-code` && method === 'POST') {
      if (!isDm) return [403]
      campaign.joinCode = this.newJoinCode()
      return [200, { joinCode: campaign.joinCode }]
    }
    if ((params = match(`${base}/members/:userId/promote`)) && method === 'POST') {
      if (!isDm) return [403]
      const member = memberOf(campaign, params.userId!)
      if (!member) return [404]
      member.role = 'dm'
      return [200, this.memberResponse(member)]
    }

    if (path === `${base}/characters` && method === 'GET') {
      return [
        200,
        this.characters
          .filter((c) => c.campaignId === campaign.id)
          .map((c) => this.characterResponse(c, me.id, isDm)),
      ]
    }
    if (path === `${base}/characters` && method === 'POST') {
      const invalid = validateCharacter(body)
      if (invalid) return invalid
      const character: Character = {
        id: randomUUID(),
        campaignId: campaign.id,
        ownerUserId: me.id,
        name: String(body.name).trim(),
        size: body.size as S['CreatureSize'],
        speedSquares: Number(body.speedSquares),
      }
      this.characters.push(character)
      return [201, this.characterResponse(character, me.id, isDm)]
    }
    if ((params = match(`${base}/characters/:characterId`)) && method === 'PUT') {
      const character = this.characters.find(
        (c) => c.id === params!.characterId && c.campaignId === campaign.id,
      )
      if (!character) return [404]
      if (!isDm && character.ownerUserId !== me.id) return [403]
      const invalid = validateCharacter(body)
      if (invalid) return invalid
      character.name = String(body.name).trim()
      character.size = body.size as S['CreatureSize']
      character.speedSquares = Number(body.speedSquares)
      return [200, this.characterResponse(character, me.id, isDm)]
    }

    if (path === `${base}/sessions` && method === 'GET') {
      return [
        200,
        this.sessions
          .filter((s) => s.campaignId === campaign.id)
          .sort((a, b) => b.date.localeCompare(a.date))
          .map((s) => this.sessionResponse(s, campaign, me.id)),
      ]
    }
    if (path === `${base}/sessions` && method === 'POST') {
      if (!isDm) return [403]
      const title = String(body.title ?? '').trim()
      if (!title) return error('nameInvalid', 'title')
      const dmUserId = (body.dmUserId as string | null) ?? campaign.defaultDmUserId
      if (memberOf(campaign, dmUserId)?.role !== 'dm') return error('notADm', 'dmUserId')
      const session: Session = {
        id: randomUUID(),
        campaignId: campaign.id,
        title,
        date: String(body.date),
        status: 'planned',
        dmUserId,
        createdByUserId: me.id,
      }
      this.sessions.push(session)
      return [201, this.sessionResponse(session, campaign, me.id)]
    }
    if ((params = match(`${base}/sessions/:sessionId/:action`))) {
      const session = this.sessions.find(
        (s) => s.id === params!.sessionId && s.campaignId === campaign.id,
      )
      if (!session) return [404]
      if (!canManage(session, campaign, me.id)) return [403]
      if (params.action === 'activate' && method === 'POST') {
        if (session.status === 'ended') return error('sessionEnded', undefined, 409)
        const other = this.sessions.find(
          (s) => s.campaignId === campaign.id && s.status === 'active' && s.id !== session.id,
        )
        if (other) return error('anotherSessionActive', undefined, 409)
        session.status = 'active'
      } else if (params.action === 'end' && method === 'POST') {
        session.status = 'ended'
      } else if (params.action === 'dm' && method === 'PUT') {
        if (session.status === 'ended') return error('sessionEnded', undefined, 409)
        const userId = String(body.userId)
        if (memberOf(campaign, userId)?.role !== 'dm') return error('notADm', 'userId')
        session.dmUserId = userId
      } else {
        return [404]
      }
      return [200, this.sessionResponse(session, campaign, me.id)]
    }

    return [404]
  }

  // ---- Helpers ---------------------------------------------------------------

  private usableInvite(token: string): Invite | undefined {
    return this.invites.find(
      (i) => i.token === token && !i.revoked && Date.parse(i.expiresAt) > Date.now(),
    )
  }

  private userByEmail(email: string): User | undefined {
    return this.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase())
  }

  private displayName(userId: string): string {
    return this.users.find((u) => u.id === userId)?.displayName ?? ''
  }

  private newJoinCode(): string {
    let code: string
    do {
      code = Array.from(
        { length: 6 },
        () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)],
      ).join('')
    } while (this.campaigns.some((c) => c.joinCode === code))
    return code
  }

  private memberResponse(member: Campaign['members'][number]): S['MemberResponse'] {
    return { ...member, displayName: this.displayName(member.userId) }
  }

  private campaignResponse(campaign: Campaign, userId: string): S['CampaignResponse'] {
    const myRole = memberOf(campaign, userId)!.role
    return {
      id: campaign.id,
      name: campaign.name,
      defaultDmUserId: campaign.defaultDmUserId,
      myRole,
      joinCode: myRole === 'dm' ? campaign.joinCode : null,
      activeSessionId: this.activeSession(campaign)?.id ?? null,
      members: campaign.members.map((m) => this.memberResponse(m)),
    }
  }

  private campaignSummary(campaign: Campaign, userId: string): S['CampaignSummaryResponse'] {
    const active = this.activeSession(campaign)
    return {
      id: campaign.id,
      name: campaign.name,
      myRole: memberOf(campaign, userId)!.role,
      activeSession: active
        ? {
            id: active.id,
            title: active.title,
            date: active.date,
            dmUserId: active.dmUserId,
            dmDisplayName: this.displayName(active.dmUserId),
            activeEncounter: null,
          }
        : null,
    }
  }

  private activeSession(campaign: Campaign): Session | undefined {
    return this.sessions.find((s) => s.campaignId === campaign.id && s.status === 'active')
  }

  private characterResponse(
    character: Character,
    userId: string,
    isDm: boolean,
  ): S['CharacterResponse'] {
    const { campaignId: _, ...rest } = character
    return {
      ...rest,
      ownerDisplayName: this.displayName(character.ownerUserId),
      canEdit: isDm || character.ownerUserId === userId,
    }
  }

  private sessionResponse(
    session: Session,
    campaign: Campaign,
    userId: string,
  ): S['SessionResponse'] {
    const { campaignId: _, ...rest } = session
    return {
      ...rest,
      dmDisplayName: this.displayName(session.dmUserId),
      canManage: canManage(session, campaign, userId),
      isSessionDm: session.dmUserId === userId,
      activeEncounter: null,
    }
  }
}

function error(code: ErrorCode, field?: string, status = 400): Reply {
  return [status, field ? { code, field } : { code }]
}

function memberOf(campaign: Campaign, userId: string) {
  return campaign.members.find((m) => m.userId === userId)
}

function canManage(session: Session, campaign: Campaign, userId: string): boolean {
  return session.dmUserId === userId || campaign.defaultDmUserId === userId
}

function validateCharacter(body: Record<string, unknown>): Reply | null {
  if (!String(body.name ?? '').trim()) return error('nameInvalid', 'name')
  const speed = Number(body.speedSquares)
  if (!Number.isInteger(speed) || speed < 0) return error('speedInvalid', 'speedSquares')
  return null
}

function meResponse(user: User): S['MeResponse'] {
  return { ...userSummary(user), isAdmin: user.isAdmin }
}

function userSummary(user: User): S['UserSummaryResponse'] {
  return {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    hasPassword: user.password !== null,
    hasGoogle: user.hasGoogle,
  }
}

function inviteResponse(invite: Invite): S['InviteResponse'] {
  return { id: invite.id, createdAt: invite.createdAt, expiresAt: invite.expiresAt }
}

/** Matches "/a/:b/c" against a path; a trailing "/*" also matches the bare prefix. */
function matchPath(pattern: string, path: string): Record<string, string> | null {
  const names: string[] = []
  const source = pattern.replace(/\/\*$/, '(?:/.*)?').replace(/:(\w+)/g, (_, name: string) => {
    names.push(name)
    return '([^/]+)'
  })
  const result = new RegExp(`^${source}$`).exec(path)
  if (!result) return null
  return Object.fromEntries(names.map((name, i) => [name, decodeURIComponent(result[i + 1]!)]))
}
