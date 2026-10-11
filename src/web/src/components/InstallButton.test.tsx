import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { listenForInstall, resetInstall } from '../pwa/install'
import { de } from '../text/de'
import { InstallButton } from './InstallButton'

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const IPAD =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'

function setUserAgent(userAgent: string, maxTouchPoints = 5) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent)
  // jsdom has no maxTouchPoints.
  Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: maxTouchPoints })
}

function setStandalone() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(display-mode: standalone)',
  }))
}

/** Fires Chrome's install event with a fake dialog. */
function offerInstall() {
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt: vi.fn(async () => {}),
    userChoice: Promise.resolve({ outcome: 'accepted' as const }),
  })
  act(() => {
    window.dispatchEvent(event)
  })
  return event
}

function start() {
  listenForInstall()
  render(<InstallButton />)
}

const installButton = () => screen.queryByRole('button', { name: de.install.button })

afterEach(() => {
  resetInstall()
  delete (navigator as { standalone?: boolean }).standalone
  delete (navigator as { maxTouchPoints?: number }).maxTouchPoints
})

describe('InstallButton', () => {
  it('shows nothing until the browser offers installing', () => {
    start()
    expect(installButton()).not.toBeInTheDocument()

    const event = offerInstall()
    expect(installButton()).toBeInTheDocument()
    // Chrome's own banner is suppressed in favour of the button.
    expect(event.defaultPrevented).toBe(true)
  })

  it("opens the browser's install dialog and then hides", async () => {
    start()
    const event = offerInstall()

    await userEvent.click(installButton()!)
    expect(event.prompt).toHaveBeenCalledOnce()
    expect(installButton()).not.toBeInTheDocument()
  })

  it('comes back when the browser offers installing again', async () => {
    start()
    offerInstall()
    await userEvent.click(installButton()!)

    offerInstall()
    expect(installButton()).toBeInTheDocument()
  })

  it('hides once the app was installed', () => {
    start()
    offerInstall()

    act(() => {
      window.dispatchEvent(new Event('appinstalled'))
    })
    expect(installButton()).not.toBeInTheDocument()
  })

  it('shows nothing when running as the installed app', () => {
    setStandalone()
    start()

    offerInstall()
    expect(installButton()).not.toBeInTheDocument()
  })

  it('explains the Share menu on an iPhone', async () => {
    setUserAgent(IPHONE)
    start()

    await userEvent.click(installButton()!)
    const help = screen.getByRole('dialog', { name: de.install.iosTitle })
    expect(help).toHaveTextContent(de.install.iosShare)
    expect(help).toHaveTextContent(de.install.iosShareMenu)
    expect(help).toHaveTextContent(de.install.iosAdd)
    expect(installButton()).toHaveAttribute('aria-expanded', 'true')

    await userEvent.click(screen.getByRole('button', { name: de.install.close }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('recognises an iPad that asks for the desktop site', () => {
    setUserAgent(IPAD, 5)
    start()
    expect(installButton()).toBeInTheDocument()
  })

  it('treats a Mac without touch as a desktop browser', () => {
    setUserAgent(IPAD, 0)
    start()
    expect(installButton()).not.toBeInTheDocument()
  })

  it('shows nothing on an iPhone that runs the installed app', () => {
    setUserAgent(IPHONE)
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: true })
    start()
    expect(installButton()).not.toBeInTheDocument()
  })
})
