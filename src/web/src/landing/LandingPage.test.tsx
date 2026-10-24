import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { mockApi, renderApp } from '../test/api'
import { de } from '../text/de'

const t = de.landing

async function landing() {
  return screen.findByRole('heading', { level: 1, name: de.appName })
}

describe('LandingPage', () => {
  it('opens from home on a device nobody signed in on, without asking the server', async () => {
    const calls = mockApi({})
    const { router } = renderApp('/')

    await landing()
    expect(router.state.location.pathname).toBe('/willkommen')
    expect(calls).toEqual([])
  })

  it('leads to the sign-in page and the roadmap', async () => {
    mockApi({})
    renderApp('/willkommen')
    await landing()

    const signIn = screen.getAllByRole('link', { name: t.signIn })
    expect(signIn.length).toBeGreaterThan(1)
    for (const link of signIn) expect(link).toHaveAttribute('href', '/anmelden')
    expect(screen.getAllByRole('link', { name: t.roadmap })[0]).toHaveAttribute(
      'href',
      '/fahrplan',
    )
    expect(screen.getByText(t.hero.inviteOnly)).toBeInTheDocument()
  })

  it('shows one step at a time, picked by tap or arrow keys', async () => {
    mockApi({})
    renderApp('/willkommen')
    await landing()
    const [sketch, paint, play] = t.steps.items

    const tabs = within(screen.getByRole('tablist', { name: t.steps.tabsLabel }))
    expect(tabs.getByRole('tab', { name: new RegExp(sketch.name) })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('tabpanel')).toHaveTextContent(sketch.body)

    await userEvent.click(tabs.getByRole('tab', { name: new RegExp(paint.name) }))
    expect(screen.getByRole('tabpanel')).toHaveTextContent(paint.body)

    await userEvent.keyboard('{ArrowDown}')
    const playTab = tabs.getByRole('tab', { name: new RegExp(play.name) })
    expect(playTab).toHaveFocus()
    expect(playTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent(play.body)
  })

  it('switches the creature and its stats', async () => {
    mockApi({})
    renderApp('/willkommen')
    await landing()
    const owlbear = t.creatures.items[1]

    const picker = within(screen.getByRole('group', { name: t.creatures.pickLabel }))
    await userEvent.click(picker.getByRole('button', { name: owlbear.name }))

    expect(picker.getByRole('button', { name: owlbear.name })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('heading', { level: 3, name: owlbear.name })).toBeInTheDocument()
    expect(screen.getByText(owlbear.size)).toBeInTheDocument()
    expect(screen.getByText(owlbear.speed)).toBeInTheDocument()
  })

  it('moves the map comparison with the slider', async () => {
    mockApi({})
    renderApp('/willkommen')
    await landing()

    const slider = screen.getByRole('slider', { name: t.map.slider })
    const drawn = screen.getByAltText(t.map.beforeAlt)
    expect(drawn).toHaveStyle({ clipPath: 'inset(0 50% 0 0)' })

    fireEvent.change(slider, { target: { value: '80' } })
    expect(drawn).toHaveStyle({ clipPath: 'inset(0 20% 0 0)' })
  })
})
