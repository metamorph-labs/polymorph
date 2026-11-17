import { render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { installTestTheme } from '@polymorph/engine/testing'
import { RelativeTime, type RelativeTimeProps } from './RelativeTime'

/**
 * RelativeTime, against a pinned clock.
 *
 * The unit logic is the engine's `relativeTimePhrase`, tested beside it
 * (`packages/engine/src/conventions/relative-time.test.ts`). These tests cover
 * the element: the `<time>` and its `dateTime`, nothing rendered for a value
 * with no phrase, and no refresh. Every test pins "now" with fake timers,
 * because a real clock makes failures depend on the date.
 */

beforeAll(installTestTheme)

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** Local noon, so day arithmetic sits far from every midnight and DST edge. */
const NOW = new Date(2026, 7, 7, 12, 0, 0)

const MINUTE_MS = 60_000
const HOUR_MS = 3_600_000

function pin() {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
}

function at(offsetMs: number): string {
  return new Date(NOW.getTime() + offsetMs).toISOString()
}

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    /*
     * The prop is `format`, not Intl's `style`, because this check reads prop
     * names and `no-raw-styles` treats any JSX `style` as raw CSS. The laws stay
     * simple, with no typed exceptions, and the check runs in full.
     */
    assertGoverned<RelativeTimeProps>(true)
  })
})

describe('a plain <time> element', () => {
  it('carries the machine-readable moment in dateTime, verbatim', () => {
    pin()
    const { container } = render(<RelativeTime value={at(-2 * HOUR_MS)} />)
    const element = container.querySelector('time') as HTMLElement
    expect(element).toBeTruthy()
    expect(element.getAttribute('datetime')).toBe(at(-2 * HOUR_MS))
  })

  it('draws no chrome of its own: no class and no title tooltip', () => {
    pin()
    const { container } = render(<RelativeTime value={at(-2 * HOUR_MS)} />)
    const element = container.querySelector('time') as HTMLElement
    expect(element.getAttribute('class')).toBeNull()
    expect(element.getAttribute('title')).toBeNull()
  })
})

describe('the options it passes to the phrase', () => {
  it('writes the phrase in the given locale and format', () => {
    pin()
    const { container } = render(
      <RelativeTime value={at(-2 * HOUR_MS)} locale="de" format="long" />,
    )
    expect(container.querySelector('time')?.textContent).toBe('vor 2 Stunden')
  })

  it('says "yesterday" with numeric="auto", and "1 day ago" by default', () => {
    pin()
    const yesterday = at(-24 * HOUR_MS)
    const auto = render(<RelativeTime value={yesterday} locale="en" numeric="auto" format="long" />)
    expect(auto.container.querySelector('time')?.textContent).toBe('yesterday')
    const always = render(<RelativeTime value={yesterday} locale="en" format="long" />)
    expect(always.container.querySelector('time')?.textContent).toBe('1 day ago')
  })
})

describe('the absolute and both modes', () => {
  it('writes the moment itself, and keeps the moment in dateTime', () => {
    pin()
    const value = at(-2 * HOUR_MS)
    const { container } = render(<RelativeTime value={value} locale="en-US" mode="absolute" />)
    const element = container.querySelector('time') as HTMLElement
    expect(element.textContent).toBe(
      new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(value),
      ),
    )
    expect(element.getAttribute('datetime')).toBe(value)
  })

  it('writes a calendar date as the date alone', () => {
    pin()
    const { container } = render(
      <RelativeTime value="2026-08-04" locale="en-US" mode="absolute" format="long" />,
    )
    expect(container.querySelector('time')?.textContent).toBe('August 4, 2026')
  })

  it('writes both as the moment, then the distance in parentheses', () => {
    pin()
    const { container } = render(<RelativeTime value="2026-08-04" locale="en-US" mode="both" />)
    expect(container.querySelector('time')?.textContent).toBe('Aug 4, 2026 (3d ago)')
  })

  it('joins both with the host’s words, so a locale orders and punctuates them', () => {
    pin()
    const messages = { both: (moment: string, distance: string) => `${distance}, ${moment}` }
    const { container } = render(
      <RelativeTime value="2026-08-04" locale="en-US" mode="both" messages={messages} />,
    )
    expect(container.querySelector('time')?.textContent).toBe('3d ago, Aug 4, 2026')
  })
})

describe('unparseable values', () => {
  it('renders nothing for an unparseable value, and warns in dev', () => {
    pin()
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { container } = render(<RelativeTime value="not-a-date" />)
    expect(container.firstElementChild).toBeNull()
    expect(warned).toHaveBeenCalledTimes(1)
    expect(String(warned.mock.calls[0]?.[0])).toContain('RelativeTime')
  })
})

describe('no refresh', () => {
  it('never updates the phrase after render', () => {
    pin()
    // The words are en-US's. Without a locale they are the engine's default locale's.
    const { container } = render(<RelativeTime value={at(-5 * MINUTE_MS)} locale="en-US" />)
    const element = container.querySelector('time') as HTMLElement
    expect(element.textContent).toBe('5m ago')

    vi.advanceTimersByTime(10 * MINUTE_MS)
    expect(element.textContent).toBe('5m ago')
  })
})
