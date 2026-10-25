import { describe, expect, it } from 'vitest'
import {
  budgetBlock,
  canPick,
  formatUsd,
  hasPendingJob,
  isOutdated,
  pickedBoardBackground,
  withVersion,
} from './backgrounds'
import { backgroundsOf, budget, version } from './testing'

const size = { width: 10, height: 8 }

describe('background rules', () => {
  it('knows when a job is pending', () => {
    expect(hasPendingJob([version(), version({ status: 'failed' })])).toBe(false)
    expect(hasPendingJob([version(), version({ status: 'queued' })])).toBe(true)
    expect(hasPendingJob([version({ status: 'running' })])).toBe(true)
  })

  it('calls a version outdated when the server says so or the size differs here', () => {
    expect(isOutdated(version(), size)).toBe(false)
    expect(isOutdated(version({ outdated: true }), size)).toBe(true)
    expect(isOutdated(version(), { width: 12, height: 8 })).toBe(true)
    expect(isOutdated(version({ gridHeight: 9 }), size)).toBe(true)
  })

  it('lets only done versions that fit be picked', () => {
    expect(canPick(version(), size)).toBe(true)
    expect(canPick(version({ layoutChanged: true }), size)).toBe(true)
    expect(canPick(version({ status: 'running' }), size)).toBe(false)
    expect(canPick(version({ status: 'failed', failure: 'error' }), size)).toBe(false)
    expect(canPick(version({ outdated: true }), size)).toBe(false)
  })

  it('gives the board the picked version at its frame, only while it fits', () => {
    const picked = version({ x: 0, y: -2, width: 10, height: 12 })
    const data = backgroundsOf([version(), picked], { pickedAssetId: picked.id })
    expect(pickedBoardBackground(data, size)).toEqual({
      assetId: picked.id,
      url: `/api/assets/${picked.id}`,
      x: 0,
      y: -2,
      width: 10,
      height: 12,
      rotation: 0,
    })
    expect(pickedBoardBackground(data, { width: 11, height: 8 })).toBeNull()
    expect(pickedBoardBackground(backgroundsOf([picked]), size)).toBeNull()
    expect(pickedBoardBackground(undefined, size)).toBeNull()
  })

  it('places the picked version where the DM put it, only with a placement made for it', () => {
    const picked = version()
    const data = backgroundsOf([picked], { pickedAssetId: picked.id })
    const placement = { assetId: picked.id, x: -1, y: 0.5, width: 12, height: 9, rotation: 3 }
    expect(pickedBoardBackground(data, size, placement)).toMatchObject({
      x: -1,
      y: 0.5,
      width: 12,
      height: 9,
      rotation: 3,
    })
    const other = { ...placement, assetId: 'another' }
    expect(pickedBoardBackground(data, size, other)).toMatchObject({ x: 0, rotation: 0 })
  })

  it('keeps an upload pickable after a resize', () => {
    const upload = version({ origin: 'uploaded' })
    expect(isOutdated(upload, { width: 15, height: 3 })).toBe(false)
    expect(canPick(upload, { width: 15, height: 3 })).toBe(true)
  })

  it('finds a store copy’s picked version by id, though it was made for the source map', () => {
    const shared = version({ mapId: 'source-map' })
    const data = backgroundsOf([shared], { pickedAssetId: shared.id })
    expect(pickedBoardBackground(data, size)?.assetId).toBe(shared.id)
    const done = { ...shared, layoutChanged: true }
    expect(withVersion(data, done).versions).toEqual([done])
  })

  it('replaces an updated version and adds a new one, newest first', () => {
    const old = version({ createdAt: '2026-10-14T10:00:00Z' })
    const running = version({ status: 'running', createdAt: '2026-10-14T11:00:00Z' })
    const data = backgroundsOf([running, old])
    const done = { ...running, status: 'done' as const, url: `/api/assets/${running.id}` }
    expect(withVersion(data, done).versions).toEqual([done, old])
    const newest = version({ status: 'queued', createdAt: '2026-10-14T12:00:00Z' })
    expect(withVersion(data, newest).versions.map((v) => v.id)).toEqual([
      newest.id,
      running.id,
      old.id,
    ])
  })

  it('blocks new jobs when the month is used up or no model is there', () => {
    expect(budgetBlock(undefined)).toBeNull()
    expect(budgetBlock(budget())).toBeNull()
    expect(budgetBlock(budget({ spentUsd: 20 }))).toBe('exhausted')
    expect(budgetBlock(budget({ available: false, spentUsd: 25 }))).toBe('unavailable')
  })

  it('formats dollars the German way', () => {
    // A no-break space before the sign.
    expect(formatUsd(0.42)).toBe('0,42 $')
    expect(formatUsd(20)).toBe('20,00 $')
  })
})
