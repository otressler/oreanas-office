// An in-memory stand-in for the backend API, for specs that run against
// `vite preview`. One MockBackend holds the data; each browser context attached
// to it has its own sign-in (like its own cookie), so a spec can play several
// people at once. Behaviour follows the API contract in src/api/schema.d.ts.
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
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
  appearance: string
  /** "#rrggbb", or null for the colour by order. */
  color: string | null
}

/** An icon or portrait version, with what /api/assets serves for it. */
interface StoredTokenImage {
  image: S['TokenImage']
  campaignId: string
  bytes: Buffer
  contentType: string
}

interface Session {
  id: string
  campaignId: string
  title: string
  date: string
  status: S['SessionStatus']
  dmUserId: string
  createdByUserId: string
  /** The fight that ending the session cut off; continuing brings it back. */
  interruptedEncounterId: string | null
}

interface CreatureType {
  id: string
  campaignId: string
  name: string
  size: S['CreatureSize']
}

interface Token {
  id: string
  kind: S['TokenKind']
  characterId: string | null
  creatureTypeId: string | null
  label: string
  x: number
  y: number
  elevation: number
  version: number
}

/** One move in the history (knowledge/domain/token.md, "Move history"). */
interface TokenMove {
  encounterId: string
  tokenId: string
  byUserId: string
  from: { x: number; y: number }
  /** The token's version after the move. */
  version: number
  undone: boolean
}

interface Encounter {
  id: string
  campaignId: string
  sessionId: string
  name: string
  status: S['EncounterStatus']
  map: S['BoardMap']
  tokens: Token[]
  createdAt: string
}

/** Reads one of the app's sample maps (src/samples/maps), e.g. "gorge-crossing". */
export function sampleMap(id: string): S['ImportMapRequest'] {
  const file = new URL(`../src/samples/maps/${id}.json`, import.meta.url)
  return JSON.parse(readFileSync(file, 'utf8')) as S['ImportMapRequest']
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
  readonly creatureTypes: CreatureType[] = []
  readonly encounters: Encounter[] = []
  readonly moves: TokenMove[] = []
  // ---- Sync (stage 6): the items devices push, as the server keeps them ----------------
  readonly syncItems = new Map<string, S['SyncServerItem']>()
  /** What the map store offers; tests fill it. */
  syncStore: S['StoreMapResponse'][] = []
  /** The oldest sync version the server accepts (the real one: Sync:MinimumVersion). */
  syncMinimumVersion = 1
  // ---- Map backgrounds (stage 7) ----------------------------------------------------------
  /** Every background version, newest last. */
  readonly backgrounds: S['MapBackground'][] = []
  /** The picked background per map id. */
  readonly pickedBackgrounds = new Map<string, string | null>()
  imageBudget: S['ImageBudgetResponse'] = {
    spentUsd: 0.42,
    limitUsd: 20,
    monthStart: new Date().toISOString().slice(0, 8) + '01T00:00:00Z',
    available: true,
  }
  /** What GET /api/assets/{id} serves for every done version: a small PNG. */
  imageBytes = readFileSync(new URL('../public/pwa-192x192.png', import.meta.url))
  // ---- Token icons and portraits (stage 8) -----------------------------------------------
  /** Every icon and portrait version, newest last. */
  readonly tokenImages: StoredTokenImage[] = []
  /** The picked version per creature type or character id. */
  readonly pickedTokenImages = new Map<string, string | null>()
  /** How long a generated icon or portrait takes; then it is done and picked. */
  tokenImageDelayMs = 400
  /** Called when a version moves on; MockImageHub sends it to the watching devices. */
  onTokenImageUpdated: ((image: S['TokenImage']) => void) | null = null
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

  addCampaign(
    name: string,
    dm: User,
    joinCode = this.newJoinCode(),
    id: string = randomUUID(),
  ): Campaign {
    const campaign: Campaign = {
      id,
      name,
      defaultDmUserId: dm.id,
      joinCode,
      members: [{ userId: dm.id, role: 'dm', joinedAt: new Date().toISOString() }],
    }
    this.campaigns.push(campaign)
    return campaign
  }

  addMember(campaign: Campaign, user: User, role: S['CampaignRole'] = 'player') {
    campaign.members.push({ userId: user.id, role, joinedAt: new Date().toISOString() })
  }

  addCharacter(campaign: Campaign, owner: User, name: string, fields: Partial<Character> = {}) {
    const character: Character = {
      id: randomUUID(),
      campaignId: campaign.id,
      ownerUserId: owner.id,
      name,
      size: 'medium',
      appearance: '',
      color: null,
      ...fields,
    }
    this.characters.push(character)
    return character
  }

  addSession(campaign: Campaign, dm: User, status: S['SessionStatus'] = 'active'): Session {
    const session: Session = {
      id: randomUUID(),
      campaignId: campaign.id,
      title: 'Sitzung 1',
      date: new Date().toISOString().slice(0, 10),
      status,
      dmUserId: dm.id,
      createdByUserId: dm.id,
      interruptedEncounterId: null,
    }
    this.sessions.push(session)
    return session
  }

  /** Imports a map file into the session; with `characters`, starts it with them placed. */
  addEncounter(
    campaign: Campaign,
    file: S['ImportMapRequest'],
    into: { session: Session; characters?: S['CharacterPlacement'][] },
  ): Encounter {
    const result = this.importMap(campaign, into.session.id, file)
    if (!('id' in result)) throw new Error(`Import failed: ${JSON.stringify(result)}`)
    if (into.characters) {
      const reply = this.startEncounter(campaign, into.session, result, into.characters)
      if (reply[0] !== 200) throw new Error(`Start failed: ${JSON.stringify(reply)}`)
    }
    return result
  }

  /** Signs a browser context in as `user`, as if it had the cookie already. */
  signIn(context: BrowserContext, user: User) {
    this.signedIn.set(context, user.id)
  }

  /** Who is signed in on this browser context, if anyone. */
  userId(context: BrowserContext): string | null {
    return this.signedIn.get(context) ?? null
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
    const asset = matchPath('/api/assets/:assetId', url.pathname)
    if (asset) {
      const done = this.backgrounds.find((b) => b.id === asset.assetId && b.status === 'done')
      const token = this.tokenImages.find(
        (t) => t.image.id === asset.assetId && t.image.status === 'done',
      )
      if (!this.userId(context) || (!done && !token)) return route.fulfill({ status: 404 })
      return route.fulfill({
        status: 200,
        contentType: token?.contentType ?? 'image/png',
        headers: { 'Cache-Control': 'private, max-age=31536000, immutable' },
        body: token?.bytes ?? this.imageBytes,
      })
    }
    const [status, body] =
      this.dispatchSync(context, request, url) ??
      this.dispatchImages(context, request, url) ??
      this.dispatchTokenImages(context, request, url) ??
      this.dispatch(context, request, url)
    await route.fulfill(
      body === undefined
        ? { status }
        : { status, contentType: 'application/json', body: JSON.stringify(body) },
    )
  }

  // ---- Map backgrounds (stage 7) ----------------------------------------------------------
  // Follows src/Server/Images/ImageEndpoints.cs: the maps are the synced ones, a job is
  // queued after the map version check, and the test finishes it (finishBackground).

  /** A queued or running job of the map is done: its picture is served from now on. */
  finishBackground(id: string): S['MapBackground'] {
    const background = this.backgrounds.find((b) => b.id === id)
    if (!background) throw new Error(`No background ${id}`)
    background.status = 'done'
    background.url = `/api/assets/${id}`
    background.finishedAt = new Date().toISOString()
    this.imageBudget.spentUsd = Math.round((this.imageBudget.spentUsd + 0.05) * 100) / 100
    return { ...background }
  }

  private backgroundOf(b: S['MapBackground'], map: S['SyncMapData']): S['MapBackground'] {
    const outdated = b.gridWidth !== map.width || b.gridHeight !== map.height
    return { ...b, outdated }
  }

  private dispatchImages(context: BrowserContext, request: Request, url: URL): Reply | null {
    const params =
      matchPath('/api/campaigns/:campaignId/maps/:mapId/backgrounds', url.pathname) ??
      matchPath('/api/campaigns/:campaignId/maps/:mapId/background', url.pathname)
    if (!params) return null
    const me = this.users.find((u) => u.id === this.signedIn.get(context)) ?? null
    if (!me) return [401]
    const campaign = this.campaigns.find((c) => c.id === params.campaignId)
    if (!campaign) return [404]
    if (memberOf(campaign, me.id)?.role !== 'dm') return [403]
    const item = this.syncItems.get(params.mapId!)
    if (!item?.map || item.campaignId !== campaign.id) return [404]
    const map = item.map
    const method = request.method()
    const body = (request.postDataJSON() ?? {}) as Record<string, unknown>
    const own = this.backgrounds.filter((b) => b.mapId === item.id)

    if (url.pathname.endsWith('/backgrounds') && method === 'GET') {
      return [
        200,
        {
          pickedAssetId: this.pickedBackgrounds.get(item.id) ?? null,
          versions: own.toReversed().map((b) => this.backgroundOf(b, map)),
          budget: this.imageBudget,
        },
      ]
    }
    if (url.pathname.endsWith('/backgrounds') && method === 'POST') {
      if (body.mapVersion !== item.version) return error('mapChanged', undefined, 409)
      if (own.some((b) => b.status === 'queued' || b.status === 'running')) {
        return error('generationRunning', undefined, 409)
      }
      if (!this.imageBudget.available) return error('imagesUnavailable', undefined, 409)
      if (this.imageBudget.spentUsd >= this.imageBudget.limitUsd) {
        return error('imageBudgetExhausted', undefined, 409)
      }
      const background: S['MapBackground'] = {
        id: randomUUID(),
        mapId: item.id,
        status: 'queued',
        url: null,
        gridWidth: map.width,
        gridHeight: map.height,
        x: 0,
        y: 0,
        width: map.width,
        height: map.height,
        outdated: false,
        layoutChanged: false,
        failure: null,
        createdAt: new Date().toISOString(),
        finishedAt: null,
        refinedFromId: typeof body.refineAssetId === 'string' ? body.refineAssetId : null,
        instruction: typeof body.instruction === 'string' ? body.instruction : null,
      }
      this.backgrounds.push(background)
      return [202, background]
    }
    if (url.pathname.endsWith('/background') && method === 'PUT') {
      const assetId = (body.assetId as string | null) ?? null
      if (assetId !== null) {
        const picked = own.find((b) => b.id === assetId && b.status === 'done')
        if (!picked) return error('backgroundNotFound', undefined, 409)
        if (this.backgroundOf(picked, map).outdated) {
          return error('backgroundOutdated', undefined, 409)
        }
      }
      this.pickedBackgrounds.set(item.id, assetId)
      return [204]
    }
    return [404]
  }

  // ---- Token icons and portraits (stage 8) --------------------------------------------------
  // Follows src/Server/Images/TokenImageEndpoints.cs. A generated version is done after
  // tokenImageDelayMs with a small transparent PNG, and picked; uploads are done at once.

  /** The picked image's URL of a creature type or character, or null for the letter. */
  pickedTokenImageUrl(ownerId: string | null): string | null {
    const id = ownerId ? this.pickedTokenImages.get(ownerId) : null
    const picked = id && this.tokenImages.find((t) => t.image.id === id)
    return picked ? picked.image.url : null
  }

  /** A version, done and picked, as if made earlier (seeding). */
  addTokenImage(
    campaign: Campaign,
    ownerType: 'creatureType' | 'character',
    ownerId: string,
  ): S['TokenImage'] {
    const image = this.newTokenImage(ownerType, ownerId, 'generated', null)
    this.tokenImages.push({
      image,
      campaignId: campaign.id,
      bytes: this.imageBytes,
      contentType: 'image/png',
    })
    this.finishTokenImage(image)
    return image
  }

  private newTokenImage(
    ownerType: 'creatureType' | 'character',
    ownerId: string,
    origin: S['AssetOrigin'],
    sourceAssetId: string | null,
  ): S['TokenImage'] {
    return {
      id: randomUUID(),
      ownerType,
      ownerId,
      origin,
      status: 'queued',
      url: null,
      failure: null,
      sourceAssetId,
      createdAt: new Date().toISOString(),
      finishedAt: null,
    }
  }

  private finishTokenImage(image: S['TokenImage']) {
    image.status = 'done'
    image.url = `/api/assets/${image.id}`
    image.finishedAt = new Date().toISOString()
    this.pickedTokenImages.set(image.ownerId, image.id)
  }

  private dispatchTokenImages(context: BrowserContext, request: Request, url: URL): Reply | null {
    const list = matchPath('/api/campaigns/:campaignId/creature-types/icons', url.pathname)
    const icon =
      matchPath('/api/campaigns/:campaignId/creature-types/:ownerId/icons', url.pathname) ??
      matchPath('/api/campaigns/:campaignId/creature-types/:ownerId/icon', url.pathname)
    const upload = matchPath(
      '/api/campaigns/:campaignId/characters/:ownerId/portraits/upload',
      url.pathname,
    )
    const portrait =
      upload ??
      matchPath('/api/campaigns/:campaignId/characters/:ownerId/portraits', url.pathname) ??
      matchPath('/api/campaigns/:campaignId/characters/:ownerId/portrait', url.pathname)
    const params = list ?? icon ?? portrait
    if (!params) return null
    const me = this.users.find((u) => u.id === this.signedIn.get(context)) ?? null
    if (!me) return [401]
    const campaign = this.campaigns.find((c) => c.id === params.campaignId)
    if (!campaign) return [404]
    const role = memberOf(campaign, me.id)?.role
    if (!role) return [403]
    const method = request.method()

    if (list) {
      if (role !== 'dm') return [403]
      const icons = [...this.pickedTokenImages.entries()].flatMap(([ownerId, assetId]) => {
        const picked = this.tokenImages.find(
          (t) =>
            t.image.id === assetId &&
            t.image.ownerType === 'creatureType' &&
            t.campaignId === campaign.id,
        )
        return picked
          ? [{ creatureTypeId: ownerId, assetId: picked.image.id, url: picked.image.url! }]
          : []
      })
      return [200, icons]
    }

    const ownerType = icon ? 'creatureType' : 'character'
    const ownerId = params.ownerId!
    let character: Character | undefined
    let typeVersion: number | null = null
    if (ownerType === 'creatureType') {
      if (role !== 'dm') return [403]
      const item = this.syncItems.get(ownerId)
      const imported = this.creatureTypes.find((t) => t.id === ownerId)
      if (item?.kind === 'creatureType' && item.campaignId === campaign.id)
        typeVersion = item.version
      else if (imported?.campaignId === campaign.id) typeVersion = 1
      else return [404]
    } else {
      character = this.characters.find((c) => c.id === ownerId && c.campaignId === campaign.id)
      if (!character) return [404]
      if (role !== 'dm' && character.ownerUserId !== me.id) return [403]
    }
    const own = this.tokenImages.filter((t) => t.image.ownerId === ownerId)
    const store = (image: S['TokenImage'], bytes: Buffer, contentType: string) =>
      this.tokenImages.push({ image, campaignId: campaign.id, bytes, contentType })
    const versions = url.pathname.endsWith('s')

    if (upload) {
      if (method !== 'POST') return [404]
      const contentType = request.headers()['content-type'] ?? ''
      const bytes = request.postDataBuffer()
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType) || !bytes?.length) {
        return error('uploadInvalid')
      }
      const image = this.newTokenImage('character', ownerId, 'uploaded', null)
      this.finishTokenImage(image)
      store(image, bytes, contentType)
      return [201, { ...image }]
    }
    if (versions && method === 'GET') {
      return [
        200,
        {
          pickedAssetId: this.pickedTokenImages.get(ownerId) ?? null,
          versions: own.toReversed().map((t) => ({ ...t.image })),
          budget: this.imageBudget,
        },
      ]
    }
    if (versions && method === 'POST') {
      const body = (request.postDataJSON() ?? {}) as Record<string, unknown>
      if (ownerType === 'creatureType' && body.itemVersion !== typeVersion) {
        return error('itemChanged', undefined, 409)
      }
      const restyle = typeof body.restyleAssetId === 'string' ? body.restyleAssetId : null
      if (restyle) {
        const source = own.find(
          (t) =>
            t.image.id === restyle && t.image.origin === 'uploaded' && t.image.status === 'done',
        )
        if (!source) return error('imageNotFound', undefined, 409)
      } else if (character && !character.appearance.trim()) {
        return error('appearanceMissing', undefined, 409)
      }
      if (own.some((t) => t.image.status === 'queued' || t.image.status === 'running')) {
        return error('generationRunning', undefined, 409)
      }
      if (!this.imageBudget.available) return error('imagesUnavailable', undefined, 409)
      if (this.imageBudget.spentUsd >= this.imageBudget.limitUsd) {
        return error('imageBudgetExhausted', undefined, 409)
      }
      const image = this.newTokenImage(ownerType, ownerId, 'generated', restyle)
      store(image, TRANSPARENT_PNG, 'image/png')
      const queued = { ...image }
      setTimeout(() => {
        this.finishTokenImage(image)
        this.imageBudget.spentUsd = Math.round((this.imageBudget.spentUsd + 0.05) * 100) / 100
        this.onTokenImageUpdated?.({ ...image })
      }, this.tokenImageDelayMs)
      return [202, queued]
    }
    if (!versions && method === 'PUT') {
      const body = (request.postDataJSON() ?? {}) as Record<string, unknown>
      const assetId = (body.assetId as string | null) ?? null
      if (
        assetId !== null &&
        !own.some((t) => t.image.id === assetId && t.image.status === 'done')
      ) {
        return error('imageNotFound', undefined, 409)
      }
      this.pickedTokenImages.set(ownerId, assetId)
      return [204]
    }
    return [404]
  }

  // ---- Sync and the map store (stage 6) ---------------------------------------------------
  // Follows the contract in knowledge/decisions/offline-prep-pwa.md ("Sync protocol"): ids
  // and versions come from the device, a push answers per item, and the pull lists versions.

  /** A map as another device saved it: the server holds it at `version`. */
  addSyncedMap(campaign: Campaign, name: string, dm: User, version = 1): S['SyncServerItem'] {
    const item: S['SyncServerItem'] = {
      id: randomUUID(),
      kind: 'battleMap',
      campaignId: campaign.id,
      version,
      updatedAt: new Date().toISOString(),
      updatedByDisplayName: dm.displayName,
      campaign: null,
      creatureType: null,
      encounter: null,
      map: {
        name,
        width: 8,
        height: 6,
        layout: { schemaVersion: 1, cells: [], features: [], entrances: [] },
        scene: '',
        vibe: '',
        lighting: '',
        archivedAt: null,
        copiedFromMapId: null,
      },
    }
    this.syncItems.set(item.id, item)
    return item
  }

  /** Another device renames a synced map: the version goes up. */
  renameSyncedMap(id: string, name: string, by: User) {
    const item = this.syncItems.get(id)
    if (!item?.map) throw new Error(`No synced map ${id}`)
    this.syncItems.set(id, {
      ...item,
      version: item.version + 1,
      updatedAt: new Date().toISOString(),
      updatedByDisplayName: by.displayName,
      map: { ...item.map, name },
    })
  }

  /** The sync and map store endpoints; null for every other path. */
  private dispatchSync(context: BrowserContext, request: Request, url: URL): Reply | null {
    const path = url.pathname
    const method = request.method()
    const store = matchPath('/api/campaigns/:campaignId/map-store/*', path)
    if (!path.startsWith('/api/sync/') && !store) return null
    const me = this.users.find((u) => u.id === this.signedIn.get(context)) ?? null
    if (!me) return [401]
    const body = (request.postDataJSON() ?? {}) as Record<string, unknown>

    if (path.startsWith('/api/sync/')) {
      const version = Number(request.headers()['x-sync-version'])
      if (!(version >= this.syncMinimumVersion)) return error('syncOutdated', undefined, 426)
    }
    if (path === '/api/sync/push' && method === 'POST') {
      const items = (body.items ?? []) as S['SyncPushItem'][]
      return [200, { results: items.map((item) => this.pushSyncItem(me, item)) }]
    }
    if (store) {
      const campaign = this.campaigns.find((c) => c.id === store.campaignId)
      if (!campaign) return [404]
      if (memberOf(campaign, me.id)?.role !== 'dm') return [403]
      if (method === 'GET') return [200, this.syncStore]
      const offered = this.syncStore.find((m) => m.id === path.split('/').pop())
      if (!offered) return error('mapNotInStore', undefined, 409)
      const copy = this.addSyncedMap(campaign, offered.name, me)
      copy.map = {
        ...copy.map!,
        width: offered.width,
        height: offered.height,
        layout: offered.layout,
        copiedFromMapId: offered.id,
      }
      this.syncStore = this.syncStore.filter((m) => m.id !== offered.id)
      return [200, copy]
    }
    const sync = matchPath('/api/sync/campaigns/:campaignId/:what', path)
    if (sync) {
      const campaign = this.campaigns.find((c) => c.id === sync.campaignId)
      if (!campaign) return [404]
      if (memberOf(campaign, me.id)?.role !== 'dm') return [403]
      const own = [...this.syncItems.values()].filter((i) => i.campaignId === campaign.id)
      if (sync.what === 'versions') {
        const list = (kind: S['SyncItemKind']) =>
          own.filter((i) => i.kind === kind).map(({ id, version }) => ({ id, version }))
        return [
          200,
          {
            creatureTypes: list('creatureType'),
            battleMaps: list('battleMap'),
            encounters: list('encounter'),
            sessions: this.sessions
              .filter((s) => s.campaignId === campaign.id)
              .map((s) => ({
                id: s.id,
                title: s.title,
                date: s.date,
                status: s.status,
                dmUserId: s.dmUserId,
                dmDisplayName: this.displayName(s.dmUserId),
              })),
          },
        ]
      }
      const ids = new Set((body.ids ?? []) as string[])
      return [200, own.filter((i) => ids.has(i.id))]
    }
    return [404]
  }

  private pushSyncItem(me: User, item: S['SyncPushItem']): S['SyncItemResult'] {
    const result = (
      outcome: S['SyncOutcome'],
      fields: Partial<S['SyncItemResult']> = {},
    ): S['SyncItemResult'] => ({
      id: item.id,
      kind: item.kind,
      outcome,
      server: null,
      error: null,
      dependsOnId: null,
      problems: null,
      existingCreatureTypeId: null,
      ...fields,
    })
    const rejected = (code: ErrorCode) => result('rejected', { error: { code } })

    if (item.kind === 'campaign') {
      const existing = this.campaigns.find((c) => c.id === item.id)
      if (existing && !memberOf(existing, me.id)) return rejected('idTaken')
      const name = String(item.campaign?.name ?? '').trim()
      if (!name) return rejected('nameInvalid')
      const campaign = existing ?? this.addCampaign(name, me, undefined, item.id)
      return result(existing ? 'saved' : 'created', { server: this.campaignSyncItem(campaign) })
    }
    const campaign = this.campaigns.find((c) => c.id === item.campaignId)
    if (!campaign || memberOf(campaign, me.id)?.role !== 'dm') return rejected('notADm')

    if (item.kind === 'encounter') {
      // Only the session DM plans its fights, in a session that hasn't ended.
      const session = this.sessions.find(
        (s) => s.id === item.encounter?.sessionId && s.campaignId === campaign.id,
      )
      if (!session)
        return result('rejected', { error: { code: 'sessionInvalid', field: 'sessionId' } })
      if (session.dmUserId !== me.id) {
        return result('rejected', { error: { code: 'notSessionDm', field: 'sessionId' } })
      }
      if (session.status === 'ended') {
        return result('rejected', { error: { code: 'sessionEnded', field: 'sessionId' } })
      }
    }
    const stored = this.syncItems.get(item.id)
    const next = (version: number): S['SyncServerItem'] => ({
      id: item.id,
      kind: item.kind,
      campaignId: item.campaignId,
      version,
      updatedAt: new Date().toISOString(),
      updatedByDisplayName: me.displayName,
      campaign: null,
      creatureType: trimName(item.creatureType),
      map: trimName(item.map),
      encounter: item.encounter && { ...trimName(item.encounter)!, mapCopy: null },
    })
    if (!stored) {
      if (item.baseVersion > 0) return rejected('itemNotFound')
      const created = next(1)
      this.syncItems.set(item.id, created)
      return result('created', { server: created })
    }
    if (stored.kind !== item.kind || stored.campaignId !== item.campaignId) {
      return rejected('idTaken')
    }
    if (stored.version !== item.baseVersion) return result('conflict', { server: stored })
    const saved = next(stored.version + 1)
    this.syncItems.set(item.id, saved)
    return result('saved', { server: saved })
  }

  private campaignSyncItem(campaign: Campaign): S['SyncServerItem'] {
    return {
      id: campaign.id,
      kind: 'campaign',
      campaignId: campaign.id,
      version: 1,
      updatedAt: new Date().toISOString(),
      updatedByDisplayName: null,
      campaign: { name: campaign.name },
      creatureType: null,
      map: null,
      encounter: null,
    }
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
        appearance: String(body.appearance ?? '').trim(),
        color: characterColor(body),
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
      character.appearance = String(body.appearance ?? '').trim()
      character.color = characterColor(body)
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
        interruptedEncounterId: null,
      }
      this.sessions.push(session)
      return [201, this.sessionResponse(session, campaign, me.id)]
    }
    if ((params = match(`${base}/sessions/:sessionId`))) {
      const session = this.sessions.find(
        (s) => s.id === params!.sessionId && s.campaignId === campaign.id,
      )
      if (!session) return [404]
      if (method === 'GET') return [200, this.sessionResponse(session, campaign, me.id)]
      if (method === 'PUT') {
        if (session.dmUserId !== me.id) return [403]
        const title = String(body.title ?? '').trim()
        if (!title) return error('nameInvalid', 'title')
        session.title = title
        session.date = String(body.date)
        return [200, this.sessionResponse(session, campaign, me.id)]
      }
      return [404]
    }
    if ((params = match(`${base}/sessions/:sessionId/encounters/import`)) && method === 'POST') {
      const session = this.sessions.find(
        (s) => s.id === params!.sessionId && s.campaignId === campaign.id,
      )
      if (!session || session.dmUserId !== me.id) return [403]
      if (session.status === 'ended') return error('sessionEnded', undefined, 409)
      const result = this.importMap(campaign, session.id, body as unknown as S['ImportMapRequest'])
      return 'id' in result ? [201, this.encounterSummary(result)] : result
    }
    if ((params = match(`${base}/encounters/:encounterId/board`)) && method === 'GET') {
      const encounter = this.encounters.find(
        (e) => e.id === params!.encounterId && e.campaignId === campaign.id,
      )
      // Players see only the running fight of the running session.
      const visible =
        encounter &&
        (isDm ||
          (encounter.status === 'active' &&
            encounter.sessionId === this.activeSession(campaign)?.id))
      if (!visible) return [404]
      return [200, this.boardResponse(encounter, me.id)]
    }
    if (
      (params = match(`${base}/sessions/:sessionId/encounters/:encounterId/:action`)) &&
      method === 'POST'
    ) {
      const session = this.sessions.find(
        (s) => s.id === params!.sessionId && s.campaignId === campaign.id,
      )
      if (!session) return [404]
      if (session.dmUserId !== me.id) return [403]
      const encounter = this.encounters.find(
        (e) => e.id === params!.encounterId && e.sessionId === session.id,
      )
      if (!encounter) return [404]
      if (params.action === 'start') {
        const characters = (body.characters ?? []) as S['CharacterPlacement'][]
        return this.startEncounter(campaign, session, encounter, characters)
      }
      if (params.action === 'end') {
        if (encounter.status !== 'active' && encounter.status !== 'ended') {
          return error('encounterNotActive', undefined, 409)
        }
        encounter.status = 'ended'
        return [200, this.encounterSummary(encounter)]
      }
      return [404]
    }
    if ((params = match(`${base}/sessions/:sessionId/:action`))) {
      const session = this.sessions.find(
        (s) => s.id === params!.sessionId && s.campaignId === campaign.id,
      )
      if (!session) return [404]
      if (!canManage(session, campaign, me.id)) return [403]
      if (params.action === 'activate' && method === 'POST') {
        const other = this.sessions.find(
          (s) => s.campaignId === campaign.id && s.status === 'active' && s.id !== session.id,
        )
        if (other) return error('anotherSessionActive', undefined, 409)
        // Continuing an ended session brings back the fight it cut off.
        const interrupted = this.encounters.find((e) => e.id === session.interruptedEncounterId)
        if (session.status === 'ended' && interrupted) interrupted.status = 'active'
        session.interruptedEncounterId = null
        session.status = 'active'
      } else if (params.action === 'end' && method === 'POST') {
        if (session.status !== 'ended') {
          // Ending a session ends its fight and remembers it.
          const fight = this.activeEncounter(session)
          if (fight) fight.status = 'ended'
          session.interruptedEncounterId = fight?.id ?? null
        }
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

  // ---- Encounters --------------------------------------------------------------

  /**
   * The import file (knowledge/domain/battle-map.md): the main rules with the
   * server's error codes and fields, not every check.
   */
  private importMap(
    campaign: Campaign,
    sessionId: string,
    file: S['ImportMapRequest'],
  ): Encounter | Reply {
    const name = String(file.name ?? '').trim()
    if (!name) return error('nameInvalid', 'name')
    for (const side of ['width', 'height'] as const) {
      const value = file[side]
      if (!Number.isInteger(value) || value < 1 || value > 40) return error('mapSizeInvalid', side)
    }
    const { width, height } = file
    const layoutFile = file.layout ?? { cells: [] }
    if ((layoutFile.schemaVersion ?? 1) !== 1) {
      return error('layoutVersionUnsupported', 'layout.schemaVersion')
    }
    const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height
    const seen = new Set<string>()
    const cells: S['LayoutCell'][] = []
    for (const [i, cell] of (layoutFile.cells ?? []).entries()) {
      const key = `${cell.x},${cell.y}`
      if (!inside(cell.x, cell.y) || seen.has(key))
        return error('cellInvalid', `layout.cells[${i}]`)
      seen.add(key)
      cells.push({ x: cell.x, y: cell.y, terrain: cell.terrain, elevation: cell.elevation ?? 0 })
    }
    const features: S['LayoutFeature'][] = []
    for (const [i, f] of (layoutFile.features ?? []).entries()) {
      const fits = f.w >= 1 && f.h >= 1 && inside(f.x, f.y) && inside(f.x + f.w - 1, f.y + f.h - 1)
      if (!f.kind || !fits) return error('featureInvalid', `layout.features[${i}]`)
      features.push({
        id: f.id ?? `f${i + 1}`,
        kind: f.kind,
        label: f.label ?? f.kind,
        x: f.x,
        y: f.y,
        w: f.w,
        h: f.h,
        elevation: f.elevation ?? 0,
        blocksMovement: f.blocksMovement ?? false,
      })
    }
    const entrances: S['LayoutEntrance'][] = (layoutFile.entrances ?? []).map((e, i) => ({
      id: e.id ?? `e${i + 1}`,
      kind: e.kind,
      label: e.label ?? '',
      cells: e.cells,
    }))
    const encounter: Encounter = {
      id: randomUUID(),
      campaignId: campaign.id,
      sessionId,
      name,
      status: 'ready',
      map: {
        id: randomUUID(),
        name,
        width,
        height,
        layout: { schemaVersion: 1, cells, features, entrances },
        background: null,
      },
      tokens: [],
      createdAt: new Date().toISOString(),
    }

    const types = this.creatureTypes.filter((t) => t.campaignId === campaign.id)
    const newTypes: CreatureType[] = []
    const counts = new Map<string, number>()
    for (const [i, creature] of (file.creatures ?? []).entries()) {
      const typeName = String(creature.type ?? '').trim()
      let type = [...types, ...newTypes].find(
        (t) => t.name.toLowerCase() === typeName.toLowerCase(),
      )
      if (!type) {
        if (!typeName || !creature.size) {
          return error('creatureTypeInvalid', `creatures[${i}]`)
        }
        type = {
          id: randomUUID(),
          campaignId: campaign.id,
          name: typeName,
          size: creature.size,
        }
        newTypes.push(type)
      }
      const sizes = [...this.creatureTypes, ...newTypes]
      if (!this.canPlace(encounter, type.size, creature.x, creature.y, sizes)) {
        return error('placementInvalid', `creatures[${i}]`)
      }
      const number = (counts.get(type.id) ?? 0) + 1
      counts.set(type.id, number)
      encounter.tokens.push({
        id: randomUUID(),
        kind: 'creature',
        characterId: null,
        creatureTypeId: type.id,
        label: creature.label ?? `${type.name} ${number}`,
        x: creature.x,
        y: creature.y,
        elevation: elevation(encounter.map, type.size, creature.x, creature.y),
        version: 0,
      })
    }
    this.creatureTypes.push(...newTypes)
    this.encounters.push(encounter)
    return encounter
  }

  private startEncounter(
    campaign: Campaign,
    session: Session,
    encounter: Encounter,
    placements: S['CharacterPlacement'][],
  ): Reply {
    if (session.status !== 'active') return error('sessionNotActive', undefined, 409)
    if (encounter.status !== 'ready') return error('encounterNotReady', undefined, 409)
    if (this.activeEncounter(session)) return error('anotherEncounterActive', undefined, 409)
    if (placements.length === 0) return error('characterInvalid', 'characters')
    const placed: Encounter = { ...encounter, tokens: [...encounter.tokens] }
    for (const [i, placement] of placements.entries()) {
      const character = this.characters.find(
        (c) => c.id === placement.characterId && c.campaignId === campaign.id,
      )
      const twice = placements.findIndex((p) => p.characterId === placement.characterId) !== i
      if (!character || twice) return error('characterInvalid', `characters[${i}]`)
      if (!this.canPlace(placed, character.size, placement.x, placement.y, this.creatureTypes)) {
        return error('placementInvalid', `characters[${i}]`)
      }
      placed.tokens.push({
        id: randomUUID(),
        kind: 'character',
        characterId: character.id,
        creatureTypeId: null,
        label: character.name,
        x: placement.x,
        y: placement.y,
        elevation: elevation(encounter.map, character.size, placement.x, placement.y),
        version: 0,
      })
    }
    // All or nothing, like the server's transaction.
    encounter.tokens = placed.tokens
    encounter.status = 'active'
    return [200, this.encounterSummary(encounter)]
  }

  /** The placement rule (knowledge/domain/encounter.md), as board/geometry.ts has it. */
  private canPlace(
    encounter: Encounter,
    size: S['CreatureSize'],
    x: number,
    y: number,
    types: CreatureType[],
  ): boolean {
    const cells = footprint(size, x, y)
    if (!cells.every(([cx, cy]) => walkable(encounter.map, cx, cy))) return false
    const taken = new Set(
      encounter.tokens.flatMap((token) =>
        footprint(this.tokenStats(token, types).size, token.x, token.y).map(
          ([tx, ty]) => `${tx},${ty}`,
        ),
      ),
    )
    return cells.every(([cx, cy]) => !taken.has(`${cx},${cy}`))
  }

  /** Size comes from the character or the creature type. */
  private tokenStats(token: Token, types = this.creatureTypes) {
    const source =
      token.kind === 'character'
        ? this.characters.find((c) => c.id === token.characterId)
        : types.find((t) => t.id === token.creatureTypeId)
    return { size: source!.size }
  }

  private activeEncounter(session: Session): Encounter | undefined {
    return this.encounters.find((e) => e.sessionId === session.id && e.status === 'active')
  }

  private activeEncounterSummary(session: Session): S['ActiveEncounterSummary'] | null {
    const encounter = this.activeEncounter(session)
    return encounter ? { id: encounter.id, name: encounter.name } : null
  }

  private encounterSummary(encounter: Encounter): S['EncounterSummaryResponse'] {
    return {
      id: encounter.id,
      name: encounter.name,
      status: encounter.status,
      battleMapId: encounter.map.id,
      battleMapName: encounter.map.name,
      width: encounter.map.width,
      height: encounter.map.height,
      creatureCount: encounter.tokens.filter((t) => t.kind === 'creature').length,
      sessionId: encounter.sessionId,
      createdAt: encounter.createdAt,
      version: 1,
      archivedAt: null,
    }
  }

  private boardResponse(encounter: Encounter, userId: string): S['BoardStateResponse'] {
    const session = this.sessions.find((s) => s.id === encounter.sessionId)
    const campaignCharacters = this.characters.filter((c) => c.campaignId === encounter.campaignId)
    return {
      encounterId: encounter.id,
      campaignId: encounter.campaignId,
      sessionId: encounter.sessionId,
      name: encounter.name,
      status: encounter.status,
      map: encounter.map,
      tokens: encounter.tokens.map((token) => {
        const character = campaignCharacters.find((c) => c.id === token.characterId)
        return {
          ...token,
          ...this.tokenStats(token),
          ownerUserId: character?.ownerUserId ?? null,
          // Ring colours follow the order characters joined the campaign.
          colorIndex: character ? campaignCharacters.indexOf(character) : null,
          imageUrl: this.pickedTokenImageUrl(token.characterId ?? token.creatureTypeId),
          color: character?.color ?? null,
        }
      }),
      isSessionDm: encounter.status === 'active' && session?.dmUserId === userId,
      undoableMove: this.undoableMove(encounter, userId),
    }
  }

  // ---- Live table (the hub's checks; e2e/mockHub.ts carries the messages) -------

  /** Whether the user may join the encounter's group: a member, while it runs. */
  joinEncounter(userId: string | null, encounterId: string): S['HubResult'] {
    const encounter = this.encounters.find((e) => e.id === encounterId)
    const campaign = encounter && this.campaigns.find((c) => c.id === encounter.campaignId)
    if (!encounter || !campaign || !userId || !memberOf(campaign, userId)) {
      return { error: 'tokenNotFound' }
    }
    return { error: encounter.status === 'active' ? null : 'encounterNotActive' }
  }

  /**
   * MoveToken (knowledge/decisions/realtime-sync.md): the session DM moves any token,
   * others their own characters; the whole footprint on walkable cells, overlapping
   * other tokens allowed. Records the move for undo.
   */
  moveToken(userId: string | null, request: S['MoveTokenRequest']): S['MoveResult'] {
    const encounter = this.encounters.find((e) => e.tokens.some((t) => t.id === request.tokenId))
    const campaign = encounter && this.campaigns.find((c) => c.id === encounter.campaignId)
    if (!encounter || !campaign || !userId || !memberOf(campaign, userId)) {
      return refused('tokenNotFound')
    }
    if (encounter.status !== 'active') return refused('encounterNotActive')
    const token = encounter.tokens.find((t) => t.id === request.tokenId)!
    const isSessionDm = this.sessions.find((s) => s.id === encounter.sessionId)?.dmUserId === userId
    const owner = this.characters.find((c) => c.id === token.characterId)?.ownerUserId
    if (!isSessionDm && !(token.kind === 'character' && owner === userId)) {
      return refused('notYourToken')
    }
    const { size } = this.tokenStats(token)
    const fits = footprint(size, request.x, request.y).every(([x, y]) =>
      walkable(encounter.map, x, y),
    )
    if (!fits) return refused('targetInvalid')
    this.moves.push({
      encounterId: encounter.id,
      tokenId: token.id,
      byUserId: userId,
      from: { x: token.x, y: token.y },
      version: token.version + 1,
      undone: false,
    })
    return { error: null, move: this.place(encounter, token, request.x, request.y, userId, false) }
  }

  /** UndoMove: the user's own last move in the encounter, while it is the token's latest. */
  undoMove(userId: string | null, encounterId: string): S['MoveResult'] {
    const joined = this.joinEncounter(userId, encounterId)
    if (joined.error) return refused(joined.error)
    const encounter = this.encounters.find((e) => e.id === encounterId)!
    const last = this.lastMove(encounter, userId!)
    const token = last && encounter.tokens.find((t) => t.id === last.tokenId)
    if (!last || !token || last.undone || token.version !== last.version) {
      return refused('nothingToUndo')
    }
    last.undone = true
    return {
      error: null,
      move: this.place(encounter, token, last.from.x, last.from.y, userId!, true),
    }
  }

  private lastMove(encounter: Encounter, userId: string): TokenMove | undefined {
    return this.moves.findLast((m) => m.encounterId === encounter.id && m.byUserId === userId)
  }

  private place(
    encounter: Encounter,
    token: Token,
    x: number,
    y: number,
    userId: string,
    undo: boolean,
  ): S['TokenMovedEvent'] {
    token.x = x
    token.y = y
    token.elevation = elevation(encounter.map, this.tokenStats(token).size, x, y)
    token.version += 1
    return {
      encounterId: encounter.id,
      tokenId: token.id,
      x,
      y,
      elevation: token.elevation,
      version: token.version,
      byUserId: userId,
      undo,
    }
  }

  /** The user's move the board offers to undo: their last, while it is the token's latest. */
  private undoableMove(encounter: Encounter, userId: string): S['UndoableMove'] | null {
    const last = this.lastMove(encounter, userId)
    const token = last && !last.undone && encounter.tokens.find((t) => t.id === last.tokenId)
    return last && token && token.version === last.version
      ? { tokenId: token.id, version: last.version }
      : null
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
            activeEncounter: this.activeEncounterSummary(active),
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
      // Like the board: the place in the order characters were added to the campaign.
      colorIndex: this.characters
        .filter((c) => c.campaignId === character.campaignId)
        .indexOf(character),
      portraitUrl: this.pickedTokenImageUrl(character.id),
    }
  }

  private sessionResponse(
    session: Session,
    campaign: Campaign,
    userId: string,
  ): S['SessionResponse'] {
    const { campaignId: _, interruptedEncounterId, ...rest } = session
    const interrupted = this.encounters.find((e) => e.id === interruptedEncounterId)
    return {
      ...rest,
      dmDisplayName: this.displayName(session.dmUserId),
      canManage: canManage(session, campaign, userId),
      isSessionDm: session.dmUserId === userId,
      activeEncounter: this.activeEncounterSummary(session),
      interruptedEncounter: interrupted ? { id: interrupted.id, name: interrupted.name } : null,
      encounters: memberOf(campaign, userId)?.role === 'dm' ? this.sessionEncounters(session) : [],
    }
  }

  /** The session's fights: imported ones and ones devices pushed, in the order they came. */
  private sessionEncounters(session: Session): S['EncounterSummaryResponse'][] {
    const imported = this.encounters
      .filter((e) => e.sessionId === session.id)
      .map((e) => this.encounterSummary(e))
    const pushed = [...this.syncItems.values()]
      .filter((item) => item.kind === 'encounter' && item.encounter?.sessionId === session.id)
      .map((item): S['EncounterSummaryResponse'] => {
        const map = this.syncItems.get(item.encounter!.battleMapId)?.map
        return {
          id: item.id,
          name: item.encounter!.name,
          status: item.encounter!.status,
          battleMapId: item.encounter!.battleMapId,
          battleMapName: map?.name ?? '',
          width: map?.width ?? 0,
          height: map?.height ?? 0,
          creatureCount: item.encounter!.tokens.length,
          sessionId: session.id,
          createdAt: item.updatedAt,
          version: item.version,
          archivedAt: item.encounter!.archivedAt,
        }
      })
    return [...imported, ...pushed]
  }
}

/** A 1 x 1 transparent PNG: what a generated icon or portrait serves. */
const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

const FOOTPRINT: Record<S['CreatureSize'], number> = {
  tiny: 1,
  small: 1,
  medium: 1,
  large: 2,
  huge: 3,
  gargantuan: 4,
}

/** Every cell a token of this size covers with its top-left corner at (x, y). */
function footprint(size: S['CreatureSize'], x: number, y: number): [number, number][] {
  const n = FOOTPRINT[size]
  const cells: [number, number][] = []
  for (let dy = 0; dy < n; dy++) for (let dx = 0; dx < n; dx++) cells.push([x + dx, y + dy])
  return cells
}

/** The topmost feature covering a cell: later features lie on top. */
function featureAt(map: S['BoardMap'], x: number, y: number) {
  return map.layout.features.findLast((f) => x >= f.x && y >= f.y && x < f.x + f.w && y < f.y + f.h)
}

function walkable(map: S['BoardMap'], x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return false
  const feature = featureAt(map, x, y)
  if (feature) return !feature.blocksMovement
  const terrain = map.layout.cells.find((c) => c.x === x && c.y === y)?.terrain ?? 'void'
  return terrain !== 'void' && terrain !== 'wall'
}

/** A placed token's elevation: the highest under its footprint, counting bridges. */
function elevation(map: S['BoardMap'], size: S['CreatureSize'], x: number, y: number): number {
  return Math.max(
    ...footprint(size, x, y).map(([cx, cy]) => {
      const feature = featureAt(map, cx, cy)
      if (feature && !feature.blocksMovement) return feature.elevation
      return map.layout.cells.find((c) => c.x === cx && c.y === cy)?.elevation ?? 0
    }),
  )
}

/** A move or undo the hub turns down. The generated type has `move` non-null; the server sends null. */
function refused(code: ErrorCode): S['MoveResult'] {
  return { error: code, move: null }
}

function error(code: ErrorCode, field?: string, status = 400): Reply {
  return [status, field ? { code, field } : { code }]
}

/** The data with its name trimmed, as the server stores it. */
function trimName<T extends { name: string }>(data: T | null | undefined): T | null {
  return data ? { ...data, name: data.name.trim() } : null
}

function memberOf(campaign: Campaign, userId: string) {
  return campaign.members.find((m) => m.userId === userId)
}

function canManage(session: Session, campaign: Campaign, userId: string): boolean {
  return session.dmUserId === userId || campaign.defaultDmUserId === userId
}

function validateCharacter(body: Record<string, unknown>): Reply | null {
  if (!String(body.name ?? '').trim()) return error('nameInvalid', 'name')
  const color = String(body.color ?? '').trim()
  if (color && !/^#[0-9a-f]{6}$/i.test(color)) return error('colorInvalid', 'color')
  return null
}

/** Like the server: lower case, and empty for the colour by order. */
function characterColor(body: Record<string, unknown>): string | null {
  return String(body.color ?? '').trim().toLowerCase() || null
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
