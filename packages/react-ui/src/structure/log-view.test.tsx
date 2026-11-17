import { render } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { logViewLaw, type LogViewLawProps } from '@polymorph/conformance/log-view'
import { installTestTheme } from '@polymorph/engine/testing'
import { LogView, type LogViewMessages, type LogViewProps } from './LogView'

/**
 * How a LogView follows its newest line, and what it says, is the law every
 * shell runs (`@polymorph/conformance/log-view`). The tests after it are the
 * claims a browser settles for the recipe, which every shell shares: a level's
 * wash stops at the marker cell, and the time and the source are quieter than
 * the line.
 */

beforeAll(installTestTheme)

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<LogViewProps>(true)
  })
})

logViewLaw({
  shell: 'React',
  async mount(props) {
    const host = document.createElement('div')
    document.body.append(host)
    let held: LogViewLawProps = props
    const { rerender } = render(<LogView label="Build output" {...held} />, { container: host })
    return {
      host,
      set(next) {
        held = { ...held, ...next }
        rerender(<LogView label="Build output" {...held} />)
      },
    }
  },
})

/** The LogView the test rendered. */
const root = () => document.querySelector<HTMLElement>('[data-member="log-view"]') as HTMLElement

describe('LogView — the recipe', () => {
  it('washes only the marker cell of a line with a level, and leaves its text on the surface', () => {
    render(<LogView label="Build output" lines={[{ id: 'a', level: 'error', text: 'failed' }]} />)
    const line = root().querySelector('li') as HTMLElement
    const [marker, , text] = [...line.children] as HTMLElement[]
    const surface = getComputedStyle(root().querySelector('[role="log"]') as HTMLElement)

    expect(getComputedStyle(marker as HTMLElement).backgroundColor).not.toBe(
      surface.backgroundColor,
    )
    expect(getComputedStyle(line).backgroundColor).toBe('rgba(0, 0, 0, 0)')
    expect(getComputedStyle(text as HTMLElement).color).toBe(surface.color)
  })

  it('draws the time and the source quieter than the line', () => {
    render(
      <LogView
        label="Service logs"
        lines={[{ id: 'a', time: '14:24:08', source: 'svc-api', text: 'GET / 200' }]}
      />,
    )
    const line = root().querySelector('li') as HTMLElement
    const time = line.children[1] as HTMLElement
    const text = line.children[2] as HTMLElement
    const source = text.firstElementChild as HTMLElement

    expect(time.textContent).toBe('14:24:08 ')
    expect(source.textContent).toBe('svc-api ')
    expect(getComputedStyle(time).color).not.toBe(getComputedStyle(text).color)
    expect(getComputedStyle(source).color).toBe(getComputedStyle(time).color)
  })

  it('reads a level as the word its messages give', async () => {
    const french: LogViewMessages = {
      jumpToLatest: 'Aller au plus récent',
      info: 'info',
      warning: 'avertissement',
      error: 'erreur',
    }
    render(
      <LogView
        label="Sortie"
        messages={french}
        lines={[{ id: 'a', level: 'warning', text: 'requête lente' }]}
      />,
    )
    await vi.waitFor(() =>
      expect(root().querySelector('li')?.textContent).toContain('avertissement'),
    )
  })
})
