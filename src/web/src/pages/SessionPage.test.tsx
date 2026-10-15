import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Campaign, Session } from '../api/types'
import { emptyMap } from '../editor/model'
import { seedMap } from '../editor/testing'
import { encounter, ids, session } from '../encounters/testing'
import { offlineDb } from '../offline/db'
import type { LocalEncounter } from '../offline/model'
import { syncBeforeStart, syncNow } from '../sync/client'
import { json, mockApi, renderApp, testUser } from '../test/api'
import { de } from '../text/de'

vi.mock('../sync/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../sync/client')>()),
  syncBeforeStart: vi.fn(),
  syncNow: vi.fn(),
}))

const t = de.sessionPage
const sessionPath = `/kampagnen/${ids.campaign}/sitzungen/${ids.session}`

beforeEach(() => {
  vi.mocked(syncNow).mockReset().mockResolvedValue({ ok: true, issues: 0 })
  vi.mocked(syncBeforeStart).mockReset()
})

function campaign(myRole: Campaign['myRole']): Campaign {
  return {
    id: ids.campaign,
    name: 'Die Rabenküste',
    defaultDmUserId: testUser.id,
    myRole,
    joinCode: myRole === 'dm' ? 'KX7PQ2' : null,
    activeSessionId: ids.session,
    members: [],
  }
}

function api(myRole: Campaign['myRole'], current: Session, others: Session[] = [], extra = {}) {
  return mockApi({
    'GET /api/auth/me': json(200, testUser),
    'GET /api/campaigns/:id': () => json(200, campaign(myRole)),
    'GET /api/campaigns/:id/sessions': () => json(200, [current, ...others]),
    'GET /api/campaigns/:id/sessions/:sid': () => json(200, current),
    ...extra,
  })
}

/** The device's copy of a fight of this session. */
function localFight(fields: Partial<LocalEncounter> = {}): LocalEncounter {
  return {
    id: ids.encounter,
    campaignId: ids.campaign,
    battleMapId: 'm1',
    name: 'Kleine Lichtung',
    status: 'ready',
    archivedAt: null,
    tokens: [],
    sessionId: ids.session,
    mapCopy: null,
    createdAt: '2026-10-12T18:00:00Z',
    updatedAt: '2026-10-12T18:00:00Z',
    sync: { baseVersion: 1, changed: false, editCount: 0, issue: null, server: null },
    recordVersion: 2,
    ...fields,
  }
}

const fights = () => screen.findByRole('region', { name: t.fightsTitle })

describe('SessionPage', () => {
  it('lists the fights with their map and offers the session DM to set up a ready one', async () => {
    api('dm', session({ encounters: [encounter({ creatureCount: 4 })] }))
    renderApp(sessionPath)

    const list = await fights()
    expect(await within(list).findByText('Kleine Lichtung')).toBeInTheDocument()
    expect(list).toHaveTextContent(de.encounterStatus.ready)
    expect(list).toHaveTextContent('Karte: Kleine Lichtung · 4 Kreaturen')
    expect(within(list).getByRole('button', { name: de.encounters.setUp })).toBeEnabled()
    expect(within(list).getByRole('link', { name: t.importMap })).toHaveAttribute(
      'href',
      `${sessionPath}/importieren`,
    )
    // The session DM's device syncs when the page opens.
    expect(syncNow).toHaveBeenCalled()
  })

  it('syncs a fight prepared on this device before the setup, and stays if that is blocked', async () => {
    api('dm', session({ encounters: [encounter()] }))
    await offlineDb(testUser.id).encounters.put(localFight())
    vi.mocked(syncBeforeStart).mockResolvedValueOnce('blocked')
    const { router } = renderApp(sessionPath)
    const user = userEvent.setup()

    const list = await fights()
    await user.click(await within(list).findByRole('button', { name: de.encounters.setUp }))
    expect(await within(list).findByText(de.encounterEditor.startBlocked)).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(sessionPath)

    vi.mocked(syncBeforeStart).mockResolvedValueOnce('ready')
    await user.click(within(list).getByRole('button', { name: de.encounters.setUp }))
    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe(
        `${sessionPath}/kampf/${ids.encounter}/aufstellen`,
      ),
    )
  })

  it('shows a fight made on this device before the server has it', async () => {
    api('dm', session({ status: 'planned' }))
    await offlineDb(testUser.id).encounters.put(
      localFight({
        id: 'neu',
        name: 'Hinterhalt',
        status: 'draft',
        sync: { baseVersion: 0, changed: true, editCount: 1, issue: null, server: null },
      }),
    )
    renderApp(sessionPath)

    const list = await fights()
    expect(await within(list).findByText('Hinterhalt')).toBeInTheDocument()
    expect(list).toHaveTextContent(t.localOnly)
    // A planned session doesn't start fights yet.
    expect(within(list).queryByRole('button', { name: de.encounters.setUp })).toBeNull()
  })

  it('tells another dm member who prepares the fights', async () => {
    api(
      'dm',
      session({
        isSessionDm: false,
        canManage: false,
        dmDisplayName: 'Yara',
        encounters: [encounter()],
      }),
    )
    renderApp(sessionPath)

    const list = await fights()
    expect(await within(list).findByText(t.otherDm('Yara'))).toBeInTheDocument()
    expect(within(list).queryByRole('button', { name: de.encounters.setUp })).toBeNull()
    expect(within(list).queryByRole('button', { name: t.addFight })).toBeNull()
    expect(syncNow).not.toHaveBeenCalled()
  })

  it('shows players only the running fight', async () => {
    const running = { id: ids.encounter, name: 'Kleine Lichtung' }
    api('player', session({ isSessionDm: false, canManage: false, activeEncounter: running }))
    renderApp(sessionPath)

    expect(await screen.findByRole('link', { name: de.encounters.toFight })).toHaveAttribute(
      'href',
      `/kampagnen/${ids.campaign}/kampf/${ids.encounter}`,
    )
    expect(screen.queryByRole('region', { name: t.fightsTitle })).toBeNull()
  })

  it('moves a fight to another session the DM runs', async () => {
    const later = session({ id: 'later', title: 'Die Rückkehr', status: 'planned' })
    const yaras = session({ id: 'yara', title: 'Bei Yara', status: 'planned', isSessionDm: false })
    api('dm', session({ encounters: [encounter()] }), [later, yaras])
    await offlineDb(testUser.id).encounters.put(localFight())
    renderApp(sessionPath)
    const user = userEvent.setup()

    const list = await fights()
    await user.click(
      await within(list).findByRole('button', { name: t.moveLabel('Kleine Lichtung') }),
    )
    const dialog = await screen.findByRole('dialog', { name: t.moveTitle('Kleine Lichtung') })
    expect(within(dialog).queryByText('Bei Yara')).toBeNull()
    await user.click(within(dialog).getByRole('button', { name: t.moveTo }))

    await vi.waitFor(async () =>
      expect((await offlineDb(testUser.id).encounters.get(ids.encounter))?.sessionId).toBe('later'),
    )
    expect(vi.mocked(syncNow).mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('continues an ended session and names the fight that comes back', async () => {
    const interrupted = { id: ids.encounter, name: 'Kleine Lichtung' }
    const calls = api('dm', session({ status: 'ended', interruptedEncounter: interrupted }), [], {
      'POST /api/campaigns/:id/sessions/:sid/activate': () => json(200, session()),
    })
    renderApp(sessionPath)
    const user = userEvent.setup()

    expect(
      await screen.findByText(de.sessions.continueResumes('Kleine Lichtung')),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: t.addFight })).toBeNull()
    await user.click(screen.getByRole('button', { name: de.sessions.continue }))

    await vi.waitFor(() =>
      expect(calls.some((c) => c.method === 'POST' && c.path.endsWith('/activate'))).toBe(true),
    )
  })
})

describe('adding a fight', () => {
  async function openDialog() {
    api('dm', session({ status: 'planned' }))
    const { router } = renderApp(sessionPath)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: t.addFight }))
    return { router, user, dialog: await screen.findByRole('dialog', { name: de.addFight.title }) }
  }

  it('puts a fight on an existing map and opens it in the editor', async () => {
    const map = await seedMap(emptyMap('Klamm', 10, 8), ids.campaign)
    const { router, user, dialog } = await openDialog()

    await user.type(within(dialog).getByLabelText(de.addFight.name), 'Hinterhalt')
    await user.click(await within(dialog).findByRole('button', { name: de.addFight.pick }))

    const [created] = await offlineDb(testUser.id).encounters.toArray()
    expect(created).toMatchObject({
      name: 'Hinterhalt',
      battleMapId: map.id,
      sessionId: ids.session,
      status: 'draft',
    })
    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe(
        `/kampagnen/${ids.campaign}/karten/${map.id}/begegnungen/${created!.id}`,
      ),
    )
  })

  it('counts the planned fights on a map, and puts a fight on a copy of it', async () => {
    const map = await seedMap(emptyMap('Klamm', 10, 8), ids.campaign)
    await offlineDb(testUser.id).encounters.put(localFight({ battleMapId: map.id }))
    const { user, dialog } = await openDialog()

    await user.click(within(dialog).getByRole('radio', { name: de.addFight.choices.copy }))
    expect(await within(dialog).findByText(/In 1 geplanten Kampf/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: de.addFight.pick }))

    const db = offlineDb(testUser.id)
    await vi.waitFor(async () => expect(await db.maps.count()).toBe(2))
    const copy = (await db.maps.toArray()).find((m) => m.id !== map.id)!
    expect(copy).toMatchObject({ name: 'Klamm (Kopie)', copiedFromMapId: map.id })
    const fight = (await db.encounters.toArray()).find((e) => e.id !== ids.encounter)!
    expect(fight).toMatchObject({ name: 'Klamm', battleMapId: copy.id, sessionId: ids.session })
  })

  it('makes a new map and opens it in the editor with the fight', async () => {
    const { router, user, dialog } = await openDialog()

    await user.click(within(dialog).getByRole('radio', { name: de.addFight.choices.fresh }))
    await user.type(within(dialog).getByLabelText(de.maps.name), 'Wachturm')
    await user.click(within(dialog).getByRole('button', { name: de.addFight.create }))

    const db = offlineDb(testUser.id)
    await vi.waitFor(async () => expect(await db.encounters.count()).toBe(1))
    const [map] = await db.maps.toArray()
    expect(map).toMatchObject({ name: 'Wachturm' })
    expect((await db.encounters.toArray())[0]).toMatchObject({
      name: 'Wachturm',
      battleMapId: map!.id,
      sessionId: ids.session,
    })
    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe(`/kampagnen/${ids.campaign}/karten/${map!.id}`),
    )
  })
})
