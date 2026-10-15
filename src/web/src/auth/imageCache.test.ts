// Signing in or out drops the service worker's image cache, so the next person on the
// device can't see images their account may not load.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearImageCache, IMAGE_CACHE } from './auth'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('clearImageCache', () => {
  it('deletes the image cache', async () => {
    const remove = vi.fn(() => Promise.resolve(true))
    vi.stubGlobal('caches', { delete: remove })
    await clearImageCache()
    expect(remove).toHaveBeenCalledWith(IMAGE_CACHE)
    expect(IMAGE_CACHE).toBe('oreana-images')
  })

  it('does nothing without Cache Storage', async () => {
    vi.stubGlobal('caches', undefined)
    await expect(clearImageCache()).resolves.toBeUndefined()
  })
})
