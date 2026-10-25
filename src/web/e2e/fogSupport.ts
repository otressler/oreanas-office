// Shared parts of the fog and spawn specs (stage 10, fog frontend lane): the gorge crossing
// running with fog, a DM and a player on their own devices, the canvas read-outs, and the
// German texts the specs look for (mirrors src/text/de.ts, de.fog).
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { MockBackend, sampleMap } from './mockBackend.ts'
import { MockHub } from './mockHub.ts'
import { enableFog } from './mockFog.ts'

export const fogText = {
  fogButton: 'Nebel',
  playerView: 'Spieleransicht',
  playerViewNote: 'So sehen die Spielenden den Tisch. Es wird nichts gesendet.',
  tools: { area: 'Bereich', brush: 'Pinsel', rect: 'Rechteck' },
  reveal: 'Aufdecken',
  hide: 'Verdecken',
  cancel: 'Abbrechen',
  confirmReveal: (count: number) => `${count} ${count === 1 ? 'Feld' : 'Felder'} aufdecken?`,
  confirmHide: (count: number) => `${count} ${count === 1 ? 'Feld' : 'Felder'} verdecken?`,
  revealed: (count: number) => `${count} ${count === 1 ? 'Feld' : 'Felder'} aufgedeckt`,
  undo: 'Rückgängig',
  unexplored: 'Unerkundet',
  tokenReveal: 'Aufdecken',
  tokenHide: 'Verbergen',
  revealAllHere: 'Alle verborgenen hier',
  cardLabel: 'Figurenkarte',
  cellLabel: 'Feld',
  spawn: {
    button: 'Kreatur hinzufügen',
    pick: (name: string) => `${name} hinzufügen`,
    done: 'Fertig',
    confirm: (count: number) =>
      `${count} ${count === 1 ? 'Kreatur' : 'Kreaturen'} erscheinen lassen?`,
    hidden: 'Verborgen',
    appear: 'Erscheinen lassen',
    cancel: 'Abbrechen',
    appeared: (count: number) => `${count} ${count === 1 ? 'Kreatur' : 'Kreaturen'} erschienen`,
  },
}

/** A creature of the gorge crossing by its position, e.g. the goblin at 14, 4. */
const AT = {
  goblinNorth: [14, 4],
  goblinSouth: [14, 7],
  goblinFar: [17, 2],
  ogre: [16, 5],
} as const

/** All cells east of the gorge, from column 12 on: the fog the specs start with. */
export function eastCells(): [number, number][] {
  const cells: [number, number][] = []
  for (let y = 0; y < 12; y++) for (let x = 12; x < 20; x++) cells.push([x, y])
  return cells
}

/** The "Hinterhalt" area: 3 × 6 cells at columns 13 to 15, rows 3 to 8. */
export function ambushCells(): [number, number][] {
  const cells: [number, number][] = []
  for (let y = 3; y <= 8; y++) for (let x = 13; x <= 15; x++) cells.push([x, y])
  return cells
}

export interface FogFight {
  backend: MockBackend
  hub: MockHub
  dm: ReturnType<MockBackend['addUser']>
  player: ReturnType<MockBackend['addUser']>
  campaign: ReturnType<MockBackend['addCampaign']>
  encounter: ReturnType<MockBackend['addEncounter']>
  /** The creature at a position of the gorge crossing's file. */
  creatureAt(x: number, y: number): ReturnType<MockBackend['addEncounter']>['tokens'][number]
}

/**
 * The gorge crossing running with Mira's "Held" at (0, 5). With `fog`, everything from
 * column 12 east is hidden, "Hinterhalt" is the area around the two goblins at 14, 4 and
 * 14, 7 (prepared as hidden), and creatures have no number yet.
 */
export function fogFight({ fog = true } = {}): FogFight {
  const backend = new MockBackend()
  const hub = new MockHub(backend)
  const dm = backend.addUser({ displayName: 'Oreana', email: 'oreana@example.org' })
  const player = backend.addUser({ displayName: 'Mira', email: 'mira@example.org' })
  const campaign = backend.addCampaign('Die Rabenküste', dm)
  backend.addMember(campaign, player)
  const session = backend.addSession(campaign, dm)
  const hero = backend.addCharacter(campaign, player, 'Held')
  const encounter = backend.addEncounter(campaign, sampleMap('gorge-crossing'), {
    session,
    characters: [{ characterId: hero.id, x: 0, y: 5 }],
  })
  const creatureAt = (x: number, y: number) =>
    encounter.tokens.find((t) => t.kind === 'creature' && t.x === x && t.y === y)!
  if (fog) {
    // The two goblins of the ambush carry their positions' labels while still unseen.
    const ambush = [creatureAt(...AT.goblinNorth), creatureAt(...AT.goblinSouth)]
    enableFog(backend, encounter, {
      hiddenCells: eastCells(),
      areas: [
        {
          id: 'a1',
          name: 'Hinterhalt',
          cells: ambushCells().map(([x, y]) => [x, y]),
        },
      ],
      hiddenCreatures: ambush.map((t) => t.label),
    })
  }
  // The spawn picker lists the campaign's creature types through the sync routes.
  for (const type of backend.creatureTypes.filter((t) => t.campaignId === campaign.id)) {
    backend.syncItems.set(type.id, {
      id: type.id,
      kind: 'creatureType',
      campaignId: campaign.id,
      version: 1,
      updatedAt: new Date().toISOString(),
      updatedByDisplayName: dm.displayName,
      campaign: null,
      map: null,
      encounter: null,
      creatureType: {
        name: type.name,
        size: type.size,
        appearance: '',
        notes: '',
        archivedAt: null,
        initiativeModifier: 0,
        initiativeAdvantage: false,
      },
    })
  }
  return { backend, hub, dm, player, campaign, encounter, creatureAt }
}

/** A device signed in as `user` on the running fight, connected, with the board drawn. */
export async function openDevice(
  browser: Browser,
  fight: FogFight,
  user: FogFight['dm'],
  options: { context?: BrowserContext; viewport?: { width: number; height: number } } = {},
): Promise<Page> {
  const context =
    options.context ?? (await browser.newContext({ viewport: options.viewport, locale: 'de-DE' }))
  await fight.backend.attach(context)
  await fight.hub.attach(context)
  fight.backend.signIn(context, user)
  const page = await context.newPage()
  await page.goto(`/kampagnen/${fight.campaign.id}/kampf/${fight.encounter.id}`)
  await expect(page.locator('[data-board-surface] canvas').first()).toBeVisible()
  await expect(page.getByTestId('connection-indicator')).toHaveAttribute('data-status', 'connected')
  return page
}

/**
 * The alpha (0 to 255) of the board's fog layer at the centre of a cell: how much fog covers
 * it right now. The fog is the second Konva layer, under the tokens.
 */
export async function fogAlpha(page: Page, x: number, y: number): Promise<number> {
  return page.evaluate(
    ({ cx, cy }) => {
      const stage = (
        window as unknown as {
          Konva: {
            stages: {
              x(): number
              y(): number
              scaleX(): number
              getLayers(): {
                getCanvas(): { _canvas: HTMLCanvasElement; getPixelRatio(): number }
              }[]
            }[]
          }
        }
      ).Konva.stages.at(-1)!
      const canvas = stage.getLayers()[1]!.getCanvas()
      const ratio = canvas.getPixelRatio()
      const cell = 64 * stage.scaleX()
      const px = Math.round((stage.x() + (cx + 0.5) * cell) * ratio)
      const py = Math.round((stage.y() + (cy + 0.5) * cell) * ratio)
      return canvas._canvas.getContext('2d')!.getImageData(px, py, 1, 1).data[3]!
    },
    { cx: x, cy: y },
  )
}

/**
 * Samples a cell's fog alpha on every animation frame for `ms`, so a fade shows as a series
 * of values. `trigger` runs in the test once sampling has started.
 */
export async function sampleFogAlpha(
  page: Page,
  x: number,
  y: number,
  ms: number,
  trigger: () => Promise<void>,
): Promise<number[]> {
  await page.evaluate(
    ({ cx, cy, total }) => {
      const w = window as unknown as { fogSamples: Promise<number[]>; Konva: any }
      w.fogSamples = new Promise((resolve) => {
        const stage = w.Konva.stages.at(-1)
        const samples: number[] = []
        const start = performance.now()
        const tick = () => {
          const canvas = stage.getLayers()[1].getCanvas()
          const ratio = canvas.getPixelRatio()
          const cell = 64 * stage.scaleX()
          const px = Math.round((stage.x() + (cx + 0.5) * cell) * ratio)
          const py = Math.round((stage.y() + (cy + 0.5) * cell) * ratio)
          samples.push(canvas._canvas.getContext('2d').getImageData(px, py, 1, 1).data[3])
          if (performance.now() - start < total) requestAnimationFrame(tick)
          else resolve(samples)
        }
        tick()
      })
    },
    { cx: x, cy: y, total: ms },
  )
  await trigger()
  return page.evaluate(() => (window as unknown as { fogSamples: Promise<number[]> }).fogSamples)
}
