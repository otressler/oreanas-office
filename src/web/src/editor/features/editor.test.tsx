import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { mockApi } from '../../test/api'
import { de } from '../../text/de'
import { renderEditor } from '../testing'
import { feature, mapWith } from './fixtures'

const t = de.editorFeatures

describe('features in the editor', () => {
  it('offers the tools, their panels and the checks', async () => {
    mockApi({})
    const user = userEvent.setup()
    await renderEditor(mapWith([feature('f1', 0, 0, 2, 1), feature('f2', 1, 0)]))

    // The status bar counts the problems.
    const checks = await screen.findByRole('button', { name: t.checks.count(1) })

    await user.keyboard('o')
    expect(screen.getByRole('button', { name: t.tools.feature })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByText(t.featureHelp)).toBeInTheDocument()

    await user.keyboard('e')
    expect(screen.getByText(t.entranceHelp)).toBeInTheDocument()

    // A problem in the status bar's list leads to the select tool with the feature's
    // properties, and the list closes.
    await user.click(checks)
    expect(screen.getByRole('dialog', { name: t.checks.title })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /liegt über/ }))
    expect(screen.queryByRole('dialog', { name: t.checks.title })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: t.tools.select })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('heading', { name: t.featureTitle('Säule') })).toBeInTheDocument()
  })
})
