// Fog of war and creature spawn for the mock backend and hub (stage 10, fog frontend lane;
// knowledge/features/fog-of-war.md, creature-spawn.md). Kept out of mockBackend.ts and
// mockHub.ts: they only call `fogView` (the board, filtered per viewer) and `fogCall` (the
// hub methods ChangeFog, SetTokensHidden, SpawnCreatures and UndoChange).
//
// It follows the server's rules closely enough for the app's sake:
// - an encounter has fog once `enableFog` ran; players get no hidden cell's layout and no
//   hidden creature; characters are always visible;
// - a creature is numbered the first time players see it ("numbered at first sight");
// - every change is saved before it is sent, as a FogChanged, TokenRevealed, TokenHidden or
//   TokensAdded per viewer group, and the last change can be undone.
import { randomUUID } from 'node:crypto'
import type { components } from '../src/api/schema.js'
import type { MockBackend } from './mockBackend.ts'

type S = components['schemas']
type Board = S['BoardStateResponse']
type BoardToken = S['BoardToken']
type Layout = S['MapLayout']
/** The mock backend's encounter and token (not exported there). */
type Encounter = ReturnType<MockBackend['addEncounter']>
type Token = Encounter['tokens'][number]

const SIZE = { tiny: 1, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4 } as const

/** What the last change did, for "Rückgängig". */
type Undo =
  | { kind: 'fog'; cells: string[]; reveal: boolean }
  | { kind: 'tokens'; before: { id: string; hidden: boolean }[] }
  | { kind: 'spawn'; ids: string[] }

interface FogState {
  hidden: Set<string>
  areas: S['FogArea'][]
  version: number
  /** The number each creature got at first sight. */
  numbers: Map<string, number>
}

const states = new WeakMap<Encounter, FogState>()
/** The last change per encounter, with or without fog (a spawn needs none). */
const undos = new WeakMap<Encounter, Undo>()

const key = (x: number, y: number) => `${x},${y}`
const parse = (k: string) => k.split(',').map(Number) as [number, number]

export const fogOf = (encounter: Encounter) => states.get(encounter)

function footprint(size: S['CreatureSize'], x: number, y: number): string[] {
  const n = SIZE[size]
  const cells: string[] = []
  for (let dy = 0; dy < n; dy++) for (let dx = 0; dx < n; dx++) cells.push(key(x + dx, y + dy))
  return cells
}

const sizeOf = (backend: MockBackend, token: Token): S['CreatureSize'] =>
  backend['tokenStats'](token).size

/** Whether players see the token: characters always, creatures unless hidden or wholly in fog. */
function seen(backend: MockBackend, state: FogState, token: Token): boolean {
  if (token.removedAt) return false
  if (token.kind === 'character') return true
  if (token.hidden) return false
  return footprint(sizeOf(backend, token), token.x, token.y).some((cell) => !state.hidden.has(cell))
}

function typeName(backend: MockBackend, token: Token): string {
  return backend.creatureTypes.find((t) => t.id === token.creatureTypeId)?.name ?? token.label
}

/** Numbers the creatures that players see now and have no number yet, in placement order. */
function numberNewlySeen(
  backend: MockBackend,
  encounter: Encounter,
  state: FogState,
): S['TokenNumber'][] {
  const numbered: S['TokenNumber'][] = []
  for (const token of encounter.tokens) {
    if (token.kind !== 'creature' || state.numbers.has(token.id)) continue
    if (!seen(backend, state, token)) continue
    const same = [...state.numbers].filter(
      ([id]) => encounter.tokens.find((t) => t.id === id)?.creatureTypeId === token.creatureTypeId,
    )
    const number = Math.max(0, ...same.map(([, n]) => n)) + 1
    state.numbers.set(token.id, number)
    token.label = `${typeName(backend, token)} ${number}`
    numbered.push({ tokenId: token.id, number, label: token.label })
  }
  return numbered
}

/**
 * Turns fog on for an encounter: `hiddenCells` are hidden, `areas` named groups of cells. The
 * creatures lose their numbers (they get them at first sight); `hiddenCreatures` are the
 * labels of the creatures prepared as hidden. Run before the fight is opened.
 */
export function enableFog(
  backend: MockBackend,
  encounter: Encounter,
  fog: { hiddenCells: [number, number][]; areas?: S['FogArea'][]; hiddenCreatures?: string[] },
) {
  const state: FogState = {
    hidden: new Set(fog.hiddenCells.map(([x, y]) => key(x, y))),
    areas: fog.areas ?? [],
    version: 1,
    numbers: new Map(),
  }
  states.set(encounter, state)
  const hiddenLabels = new Set(fog.hiddenCreatures ?? [])
  for (const token of encounter.tokens) {
    if (token.kind !== 'creature') continue
    if (hiddenLabels.has(token.label)) token.hidden = true
  }
  for (const token of encounter.tokens) {
    if (token.kind === 'creature') token.label = typeName(backend, token)
  }
  numberNewlySeen(backend, encounter, state)
}

// ---- The board ------------------------------------------------------------------------------

/** The layout of the given cells: their cells, the features touching them (whole), the entrances' cells. */
function layoutOf(layout: Layout, shown: (x: number, y: number) => boolean): Layout {
  return {
    ...layout,
    cells: layout.cells.filter((cell) => shown(cell.x, cell.y)),
    features: layout.features.filter((f) => {
      for (let y = f.y; y < f.y + f.h; y++)
        for (let x = f.x; x < f.x + f.w; x++) if (shown(x, y)) return true
      return false
    }),
    entrances: layout.entrances
      .map((entrance) => ({
        ...entrance,
        cells: entrance.cells.filter(([x = 0, y = 0]) => shown(x, y)),
      }))
      .filter((entrance) => entrance.cells.length > 0),
  }
}

/**
 * The board as one viewer gets it. An encounter without fog is returned as it is. The
 * session DM gets everything, hidden cells listed with their areas; anyone else gets no
 * hidden creature, the layout of revealed cells (and under characters) and the hidden cells.
 */
export function fogView(encounter: Encounter, isSessionDm: boolean, board: Board): Board {
  const state = states.get(encounter)
  if (!state) return board
  const hiddenCells = [...state.hidden].map(parse).map(([x, y]) => ({ x, y }))
  if (isSessionDm) {
    return {
      ...board,
      viewer: 'dm',
      fog: { version: state.version, hiddenCells, areas: state.areas },
    }
  }
  const tokens = board.tokens.filter((t) => visibleOnBoard(state, t))
  const underCharacters = new Set(
    tokens.filter((t) => t.kind === 'character').flatMap((t) => footprint(t.size, t.x, t.y)),
  )
  const shown = (x: number, y: number) =>
    !state.hidden.has(key(x, y)) || underCharacters.has(key(x, y))
  return {
    ...board,
    viewer: 'player',
    tokens,
    removedTokens: [],
    map: { ...board.map, layout: layoutOf(board.map.layout, shown) },
    fog: { version: state.version, hiddenCells, areas: [] },
  }
}

/** The visibility rule on a board token (the mock's tokens carry size). */
function visibleOnBoard(state: FogState, token: BoardToken): boolean {
  if (token.kind === 'character') return true
  if (token.hidden) return false
  return footprint(token.size, token.x, token.y).some((cell) => !state.hidden.has(cell))
}

// ---- Hub methods ----------------------------------------------------------------------------

/** What the hub offers the fog code: a message built for each device joined to an encounter. */
export interface FogHub {
  sendEach(
    encounterId: string,
    target: string,
    build: (userId: string | null) => unknown | null,
  ): void
}

const fail = (error: S['ApiErrorCode']) => ({ error })

/**
 * ChangeFog, SetTokensHidden, SpawnCreatures and UndoChange as the hub answers them. The
 * answer is the method's result; the events go out through `hub`.
 */
export function fogCall(
  backend: MockBackend,
  hub: FogHub,
  userId: string | null,
  method: string,
  args: unknown[],
): unknown {
  const encounterId =
    method === 'UndoChange'
      ? String(args[0])
      : String((args[0] as { encounterId: string }).encounterId)
  const encounter = backend.encounters.find((e) => e.id === encounterId)
  const campaign = encounter && backend.campaigns.find((c) => c.id === encounter.campaignId)
  const state = encounter && states.get(encounter)
  const failure = (error: S['ApiErrorCode']) =>
    method === 'SpawnCreatures' ? { error, tokenIds: null } : fail(error)
  if (!encounter || !campaign || !userId || !campaign.members.some((m) => m.userId === userId)) {
    return failure('tokenNotFound')
  }
  if (encounter.status !== 'active') return failure('encounterNotActive')
  const isDm = backend.sessions.find((s) => s.id === encounter.sessionId)?.dmUserId === userId
  if (!isDm) return failure('notSessionDm')

  const ctx = { backend, hub, encounter, userId, state }
  switch (method) {
    case 'ChangeFog': {
      const request = args[0] as S['ChangeFogRequest']
      if (!state) return fail('fogInvalid')
      const cells = request.cells.map((c) => key(c.x, c.y))
      if (cells.length === 0 || cells.some((c) => !inMap(encounter, c))) return fail('fogInvalid')
      changeFog(ctx, cells, request.reveal)
      return { error: null }
    }
    case 'SetTokensHidden': {
      const request = args[0] as S['SetTokensHiddenRequest']
      const tokens = request.tokenIds.map((id) => encounter.tokens.find((t) => t.id === id))
      if (tokens.length === 0 || tokens.some((t) => !t || t.kind !== 'creature' || t.removedAt)) {
        return fail('tokenNotFound')
      }
      setTokensHidden(ctx, tokens as Token[], request.hidden)
      return { error: null }
    }
    case 'SpawnCreatures': {
      const result = spawn(ctx, args[0] as S['SpawnCreaturesRequest'])
      return result
    }
    default:
      return undo(ctx)
  }
}

interface Ctx {
  backend: MockBackend
  hub: FogHub
  encounter: Encounter
  userId: string
  state: FogState | undefined
}

const inMap = (encounter: Encounter, cell: string) => {
  const [x, y] = parse(cell)
  return x >= 0 && y >= 0 && x < encounter.map.width && y < encounter.map.height
}

const tokenOf = (ctx: Ctx, token: Token): BoardToken =>
  ctx.backend['boardToken'](ctx.encounter, token)

/** Whether a user is the session DM: they get the DM's version of every event. */
const isDmUser = (ctx: Ctx, userId: string | null) =>
  ctx.backend.sessions.find((s) => s.id === ctx.encounter.sessionId)?.dmUserId === userId

function changeFog(ctx: Ctx, cells: string[], reveal: boolean) {
  const state = ctx.state!
  const { backend, encounter } = ctx
  const effective = cells.filter((c) => state.hidden.has(c) === reveal)
  const before = new Map(encounter.tokens.map((t) => [t.id, seen(backend, state, t)]))
  for (const c of effective) {
    if (reveal) state.hidden.delete(c)
    else state.hidden.add(c)
  }
  state.version += 1
  undos.set(encounter, { kind: 'fog', cells: effective, reveal })

  const numbered = numberNewlySeen(backend, encounter, state)
  const appeared = encounter.tokens.filter((t) => !before.get(t.id) && seen(backend, state, t))
  const disappeared = encounter.tokens.filter((t) => before.get(t.id) && !seen(backend, state, t))
  const changed = new Set(effective)
  const revealedLayout = reveal
    ? layoutOf(encounter.map.layout, (x, y) => changed.has(key(x, y)))
    : null
  const cellList = effective.map(parse).map(([x, y]) => ({ x, y }))

  ctx.hub.sendEach(encounter.id, 'FogChanged', (userId) => {
    const dm = isDmUser(ctx, userId)
    const event: S['FogChangedEvent'] = {
      encounterId: encounter.id,
      version: state.version,
      reveal,
      cells: cellList,
      revealedLayout: dm ? null : revealedLayout,
      appeared: dm ? [] : appeared.map((t) => tokenOf(ctx, t)),
      disappeared: dm ? [] : disappeared.map((t) => t.id),
      numbered: numbered,
    }
    return event
  })
}

function setTokensHidden(ctx: Ctx, tokens: Token[], hidden: boolean) {
  const state = ctx.state
  const { backend, encounter } = ctx
  const before = tokens.map((t) => ({ id: t.id, hidden: t.hidden ?? false }))
  const wasSeen = new Map(tokens.map((t) => [t.id, state ? seen(backend, state, t) : !t.hidden]))
  for (const token of tokens) token.hidden = hidden
  undos.set(encounter, { kind: 'tokens', before })
  if (state) numberNewlySeen(backend, encounter, state)
  for (const token of tokens) {
    const now = state ? seen(backend, state, token) : !hidden
    if (hidden) {
      ctx.hub.sendEach(encounter.id, 'TokenHidden', (userId) =>
        isDmUser(ctx, userId) || wasSeen.get(token.id)
          ? { encounterId: encounter.id, tokenId: token.id }
          : null,
      )
    } else {
      ctx.hub.sendEach(encounter.id, 'TokenRevealed', (userId) =>
        isDmUser(ctx, userId) || now
          ? { encounterId: encounter.id, token: tokenOf(ctx, token) }
          : null,
      )
    }
  }
}

function spawn(ctx: Ctx, request: S['SpawnCreaturesRequest']): S['SpawnResult'] {
  const { backend, encounter } = ctx
  const bad = (error: S['ApiErrorCode']) => ({ error, tokenIds: null })
  if (request.creatures.length === 0) return bad('spawnInvalid')
  const made: Token[] = []
  for (const creature of request.creatures) {
    const type = backend.creatureTypes.find(
      (t) => t.id === creature.creatureTypeId && t.campaignId === encounter.campaignId,
    )
    if (!type) return bad('spawnInvalid')
    const walkable = footprint(type.size, creature.x, creature.y).every((cell) => {
      if (!inMap(encounter, cell)) return false
      const [x, y] = parse(cell)
      const feature = encounter.map.layout.features.findLast(
        (f) => x >= f.x && y >= f.y && x < f.x + f.w && y < f.y + f.h,
      )
      if (feature) return !feature.blocksMovement
      const terrain =
        encounter.map.layout.cells.find((c) => c.x === x && c.y === y)?.terrain ?? 'void'
      return terrain !== 'void' && terrain !== 'wall'
    })
    if (!walkable) return bad('spawnInvalid')
    // The next number of the type, removed creatures included (an encounter with fog
    // numbers at first sight instead).
    const taken = encounter.tokens.filter((t) => t.creatureTypeId === type.id).length
    made.push({
      id: randomUUID(),
      kind: 'creature',
      characterId: null,
      creatureTypeId: type.id,
      label: ctx.state
        ? type.name
        : `${type.name} ${taken + made.filter((m) => m.creatureTypeId === type.id).length + 1}`,
      x: creature.x,
      y: creature.y,
      elevation: 0,
      version: 0,
      hidden: request.hidden,
    })
  }
  encounter.tokens.push(...made)
  const state = ctx.state
  undos.set(encounter, { kind: 'spawn', ids: made.map((t) => t.id) })
  if (state) numberNewlySeen(backend, encounter, state)
  ctx.hub.sendEach(encounter.id, 'TokensAdded', (userId) => {
    const dm = isDmUser(ctx, userId)
    const tokens = made.filter((t) => dm || (state ? seen(backend, state, t) : !t.hidden))
    return tokens.length === 0
      ? null
      : { encounterId: encounter.id, tokens: tokens.map((t) => tokenOf(ctx, t)) }
  })
  return { error: null, tokenIds: made.map((t) => t.id) }
}

/** "Rückgängig" for the last fog change, creature reveal or spawn. */
function undo(ctx: Ctx): S['HubResult'] {
  const last = undos.get(ctx.encounter)
  if (!last) return fail('nothingToUndo')
  undos.delete(ctx.encounter)
  switch (last.kind) {
    case 'fog':
      if (ctx.state) changeFog(ctx, last.cells, !last.reveal)
      break
    case 'tokens':
      for (const entry of last.before) {
        const token = ctx.encounter.tokens.find((t) => t.id === entry.id)
        if (token) setTokensHidden(ctx, [token], entry.hidden)
      }
      break
    case 'spawn': {
      const removedAt = new Date().toISOString()
      for (const id of last.ids) {
        const token = ctx.encounter.tokens.find((t) => t.id === id)
        if (!token) continue
        const wasSeen = ctx.state ? seen(ctx.backend, ctx.state, token) : !token.hidden
        token.removedAt = removedAt
        ctx.hub.sendEach(ctx.encounter.id, 'TokenRemoved', (userId) =>
          isDmUser(ctx, userId) || wasSeen
            ? { encounterId: ctx.encounter.id, tokenId: id, byUserId: ctx.userId, removedAt }
            : null,
        )
      }
      break
    }
  }
  // Undoing is not undoable.
  undos.delete(ctx.encounter)
  return { error: null }
}
