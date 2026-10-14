import { afterEach, describe, expect, it, vi } from 'vitest'
import { emptyMap, type EditorMap } from '../editor/model'
import gorgeCrossing from '../samples/maps/gorge-crossing.json'
import { de } from '../text/de'
import { downloadMapFile, MapFileError, mapFileName, parseMapFile, toMapFile } from './mapFile'

const t = de.maps.file

const file = (value: unknown) => JSON.stringify(value)

const minimal = {
  name: 'Klamm',
  width: 4,
  height: 3,
  layout: { cells: [{ x: 0, y: 0, terrain: 'floor' }] },
}

function refusal(text: string): string {
  try {
    parseMapFile(text)
  } catch (error) {
    if (error instanceof MapFileError) return error.message
    throw error
  }
  throw new Error('The file was accepted')
}

describe('parseMapFile', () => {
  it('reads a sample map and leaves its creatures out', () => {
    const map = parseMapFile(JSON.stringify(gorgeCrossing))

    expect(map).toMatchObject({
      name: 'Schluchtübergang',
      width: 20,
      height: 12,
      scene: 'rope bridge over a misty gorge',
      vibe: 'tense, windy',
      lighting: 'overcast morning',
    })
    expect(map).not.toHaveProperty('creatures')
    expect(map.layout.schemaVersion).toBe(1)
    expect(map.layout.cells.length).toBe(gorgeCrossing.layout.cells.length)
    // Missing elevations become 0, as in the layout document.
    expect(map.layout.cells.every((cell) => typeof cell.elevation === 'number')).toBe(true)
    expect(map.layout.features.length).toBeGreaterThan(0)
  })

  it('fills in what the file format lets out', () => {
    const map = parseMapFile(
      file({
        ...minimal,
        name: '  Klamm  ',
        scene: null,
        layout: {
          cells: [{ x: 3, y: 2, terrain: 'wall', elevation: 1.5 }],
          features: [
            { kind: 'bridge', x: 0, y: 0, w: 2, h: 1 },
            {
              id: 'f1',
              kind: 'pillar',
              label: 'Säule',
              x: 2,
              y: 2,
              w: 1,
              h: 1,
              elevation: 3,
              blocksMovement: true,
            },
          ],
          entrances: [{ kind: 'entrance', cells: [[0, 1]] }],
        },
      }),
    )

    expect(map).toEqual<EditorMap>({
      name: 'Klamm',
      width: 4,
      height: 3,
      scene: '',
      vibe: '',
      lighting: '',
      layout: {
        schemaVersion: 1,
        cells: [{ x: 3, y: 2, terrain: 'wall', elevation: 1.5 }],
        features: [
          {
            id: 'f1',
            kind: 'bridge',
            label: '',
            x: 0,
            y: 0,
            w: 2,
            h: 1,
            elevation: 0,
            blocksMovement: false,
          },
          // The file's own id was taken by the feature before it, so it gets a new one.
          {
            id: 'f2',
            kind: 'pillar',
            label: 'Säule',
            x: 2,
            y: 2,
            w: 1,
            h: 1,
            elevation: 3,
            blocksMovement: true,
          },
        ],
        entrances: [{ id: 'e1', kind: 'entrance', label: '', cells: [[0, 1]] }],
      },
    })
  })

  it('refuses a file that isn’t JSON', () => {
    expect(refusal('{ name: Klamm')).toBe(t.unreadable)
  })

  it('refuses JSON that isn’t a map', () => {
    expect(refusal('[1, 2]')).toBe(t.notAMap)
    expect(refusal(file({ name: 'Klamm', width: 4, height: 3 }))).toBe(t.notAMap)
    expect(refusal(file({ ...minimal, width: '4' }))).toBe(t.notAMap)
    expect(refusal(file({ ...minimal, scene: 42 }))).toBe(t.notAMap)
  })

  it('refuses a map without a name', () => {
    expect(refusal(file({ ...minimal, name: '  ' }))).toBe(t.noName)
  })

  it('refuses maps larger than 40 × 40 and sizes that aren’t whole cells', () => {
    expect(refusal(file({ ...minimal, width: 41 }))).toBe(t.tooLarge(40))
    expect(refusal(file({ ...minimal, height: 0 }))).toBe(t.tooLarge(40))
    expect(refusal(file({ ...minimal, width: 2.5 }))).toBe(t.tooLarge(40))
    expect(() => parseMapFile(file({ ...minimal, width: 40, height: 40 }))).not.toThrow()
  })

  it('refuses a layout from a newer app version', () => {
    expect(refusal(file({ ...minimal, layout: { ...minimal.layout, schemaVersion: 2 } }))).toBe(
      t.newerVersion,
    )
  })

  it('names the entry with a broken structure', () => {
    const layout = (extra: object) => file({ ...minimal, layout: { ...minimal.layout, ...extra } })
    expect(refusal(layout({ cells: null }))).toBe(t.badLayout(t.layout))
    expect(
      refusal(
        layout({
          cells: [
            { x: 0, y: 0, terrain: 'floor' },
            { x: 4, y: 0, terrain: 'floor' },
          ],
        }),
      ),
    ).toBe(t.badLayout(t.cell(2)))
    expect(refusal(layout({ cells: [{ x: 0, y: 0, terrain: 'lava' }] }))).toBe(
      t.badLayout(t.cell(1)),
    )
    expect(refusal(layout({ features: [{ kind: 'door', x: 0, y: 0, w: 0, h: 1 }] }))).toBe(
      t.badLayout(t.feature(1)),
    )
    expect(refusal(layout({ entrances: [{ kind: 'gate', cells: [[0, 0]] }] }))).toBe(
      t.badLayout(t.entrance(1)),
    )
    expect(refusal(layout({ entrances: [{ kind: 'exit', cells: [[0, 9]] }] }))).toBe(
      t.badLayout(t.entrance(1)),
    )
  })

  it('refuses texts longer than the server keeps', () => {
    expect(refusal(file({ ...minimal, name: 'x'.repeat(81) }))).toBe(t.nameTooLong(80))
    expect(refusal(file({ ...minimal, vibe: 'x'.repeat(501) }))).toBe(
      t.textTooLong(t.fields.vibe, 500),
    )
  })
})

describe('export', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  const map: EditorMap = {
    ...emptyMap('Schlucht: Nord/Süd', 6, 4),
    scene: 'Hängebrücke',
    vibe: 'windig',
    lighting: 'Dämmerung',
  }

  it('writes the import-file format without creatures, which the import reads back', () => {
    const exported = toMapFile(map)
    expect(Object.keys(exported).sort()).toEqual(
      ['height', 'layout', 'lighting', 'name', 'scene', 'vibe', 'width'].sort(),
    )
    expect(parseMapFile(JSON.stringify(exported))).toEqual(map)
  })

  it('names the file after the map, without characters file systems refuse', () => {
    expect(mapFileName('Schluchtübergang')).toBe('Schluchtübergang.json')
    expect(mapFileName('Schlucht: Nord/Süd')).toBe('Schlucht- Nord-Süd.json')
    expect(mapFileName('...')).toBe('Karte.json')
  })

  it('downloads the file without a connection', async () => {
    vi.useFakeTimers()
    let blob: Blob | undefined
    vi.spyOn(URL, 'createObjectURL').mockImplementation((value) => {
      blob = value as Blob
      return 'blob:map'
    })
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const clicked: HTMLAnchorElement[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this)
    })

    downloadMapFile(map)

    expect(clicked).toHaveLength(1)
    expect(clicked[0]!.download).toBe('Schlucht- Nord-Süd.json')
    expect(clicked[0]!.getAttribute('href')).toBe('blob:map')
    expect(JSON.parse(await blob!.text())).toEqual(toMapFile(map))
    vi.runAllTimers()
    expect(revoke).toHaveBeenCalledWith('blob:map')
  })
})
