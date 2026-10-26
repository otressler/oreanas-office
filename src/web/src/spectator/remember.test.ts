import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  REMEMBER_MS,
  forgetScreen,
  rememberScreen,
  rememberedScreen,
  screenPath,
  screenToResume,
} from './remember'

const screen = {
  userId: 'u1',
  campaignId: 'c1',
  sessionId: 's1',
  sharedScreen: false,
  joinCode: null,
}

afterEach(() => vi.restoreAllMocks())

describe('the remembered spectator screen', () => {
  it('is brought back for the same person, until it is left', () => {
    rememberScreen(screen, 1_000)
    expect(screenToResume('u1', 2_000)).toMatchObject({ campaignId: 'c1', sessionId: 's1' })

    forgetScreen()
    expect(screenToResume('u1', 2_000)).toBeNull()
  })

  it('is not brought back for someone else on the same device', () => {
    rememberScreen(screen, 1_000)
    expect(screenToResume('u2', 2_000)).toBeNull()
  })

  it('fades after a few days, so a forgotten tablet does not take over the app', () => {
    rememberScreen(screen, 1_000)
    expect(screenToResume('u1', 1_000 + REMEMBER_MS - 1)).not.toBeNull()
    expect(screenToResume('u1', 1_000 + REMEMBER_MS)).toBeNull()
  })

  it('keeps the join code of a session spectator for the way back', () => {
    rememberScreen({ ...screen, joinCode: 'KX7PQ2' })
    expect(rememberedScreen()?.joinCode).toBe('KX7PQ2')
  })

  it('survives garbage and missing storage', () => {
    localStorage.setItem('oreanas.spectatorScreen', '{nope')
    expect(rememberedScreen()).toBeNull()
    localStorage.setItem('oreanas.spectatorScreen', '{"userId":1}')
    expect(rememberedScreen()).toBeNull()

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => rememberScreen(screen)).not.toThrow()
    expect(rememberedScreen()).toBeNull()
  })

  it('opens a shared screen on the same route with ?gemeinsam=1', () => {
    expect(screenPath(screen)).toBe('/kampagnen/c1/sitzungen/s1/zuschauen')
    expect(screenPath({ ...screen, sharedScreen: true })).toBe(
      '/kampagnen/c1/sitzungen/s1/zuschauen?gemeinsam=1',
    )
  })
})
