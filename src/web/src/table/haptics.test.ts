import { afterEach, describe, expect, it, vi } from 'vitest'
import { canVibrate, setVibrationEnabled, vibrate, vibrationEnabled } from './haptics'

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

/** A navigator with vibrate, like Chrome on Android. */
function vibrating() {
  const calls: (number | number[])[] = []
  vi.stubGlobal('navigator', {
    ...navigator,
    vibrate: (pattern: number | number[]) => {
      calls.push(pattern)
      return true
    },
  })
  return calls
}

describe('haptics', () => {
  it('buzzes once for a taken move and twice for a rejected one', () => {
    const calls = vibrating()
    expect(canVibrate()).toBe(true)
    vibrate('taken')
    vibrate('rejected')
    expect(calls).toEqual([30, [30, 80, 30]])
  })

  it('is silent without the Vibration API, as on iPhones', () => {
    vi.stubGlobal('navigator', { ...navigator, vibrate: undefined })
    expect(canVibrate()).toBe(false)
    expect(() => vibrate('taken')).not.toThrow()
  })

  it('is on by default and remembers the switch on this device', () => {
    const calls = vibrating()
    expect(vibrationEnabled()).toBe(true)
    setVibrationEnabled(false)
    expect(vibrationEnabled()).toBe(false)
    vibrate('taken')
    expect(calls).toEqual([])
    setVibrationEnabled(true)
    vibrate('taken')
    expect(calls).toEqual([30])
  })

  it('stays on, and quiet about it, when storage is blocked', () => {
    const calls = vibrating()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => setVibrationEnabled(false)).not.toThrow()
    expect(vibrationEnabled()).toBe(true)
    vibrate('taken')
    expect(calls).toEqual([30])
    vi.restoreAllMocks()
  })

  it('swallows a browser that throws while vibrating', () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      vibrate: () => {
        throw new Error('not allowed')
      },
    })
    expect(() => vibrate('rejected')).not.toThrow()
  })
})
