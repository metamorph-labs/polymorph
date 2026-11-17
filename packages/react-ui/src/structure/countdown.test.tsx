import { StrictMode } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { render, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { countdownLaw } from '@polymorph/conformance/countdown'
import { installTestTheme } from '@polymorph/engine/testing'
import { Countdown, type CountdownProps } from './Countdown'
import { states } from './countdown.states'

/**
 * What a Countdown draws, when it changes and what it reports is the law every
 * shell runs (`@polymorph/conformance/countdown`). The tests after it are the
 * React member's own: the server's markup kept while React hydrates and then
 * corrected, a new `until` counted from the clock and reported once, `onEnd`
 * once under React's development double effect, and the application's Button
 * enabled at the end in the states fixture's composition.
 *
 * The clock's timers render outside `act`, as they do in an application, so the
 * file does not declare an act environment. Testing Library's own `render`
 * still wraps itself in one.
 */

declare global {
  // React's flag for whether updates are expected inside `act`.
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

const wasActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT

beforeAll(() => {
  installTestTheme()
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
})

afterAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = wasActEnvironment
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<CountdownProps>(true)
  })
})

countdownLaw({
  shell: 'React',
  async mount(props) {
    render(<Countdown {...props} />)
  },
})

const NOW = new Date(2026, 7, 7, 12, 0, 0).getTime()

const at = (ms: number): string => new Date(NOW + ms).toISOString()

function pin(): void {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  vi.setSystemTime(NOW)
}

async function frames(count = 3): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await new Promise<void>((settle) => requestAnimationFrame(() => settle()))
  }
}

async function advance(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms)
  await frames()
}

const digitsIn = (scope: ParentNode): string =>
  scope.querySelector('[data-member="countdown"] [aria-hidden="true"]')?.textContent ?? ''

describe('Countdown — a server render, hydrated later', () => {
  /** The server's markup in a container, and the container on the page. */
  function served(props: CountdownProps): HTMLElement {
    const container = document.createElement('div')
    container.innerHTML = renderToString(<Countdown {...props} />)
    document.body.append(container)
    return container
  }

  it('keeps the server’s markup while hydrating, then draws the browser’s time, with no mismatch', async () => {
    pin()
    const props: CountdownProps = { until: at(10_000), label: 'Code', locale: 'en-US' }
    const container = served(props)
    expect(digitsIn(container)).toBe('0:10')

    // The browser hydrates three and a half seconds after the server rendered.
    vi.setSystemTime(NOW + 3_500)
    const errors = vi.spyOn(console, 'error')
    const recoverable = vi.fn()
    const root = hydrateRoot(container, <Countdown {...props} />, {
      onRecoverableError: recoverable,
    })
    await frames()

    expect(errors).not.toHaveBeenCalled()
    expect(recoverable).not.toHaveBeenCalled()
    expect(digitsIn(container)).toBe('0:07')
    expect(container.querySelector('time')?.getAttribute('datetime')).toBe('PT7S')

    await advance(500)
    expect(digitsIn(container)).toBe('0:06')
    root.unmount()
    container.remove()
  })

  it('draws the end, and calls onEnd once, when the moment passed before it hydrated', async () => {
    pin()
    const onEnd = vi.fn()
    const props: CountdownProps = { until: at(1_000), label: 'Code', locale: 'en-US', onEnd }
    const container = served(props)
    expect(digitsIn(container)).toBe('0:01')
    expect(onEnd).not.toHaveBeenCalled()

    vi.setSystemTime(NOW + 3_000)
    const errors = vi.spyOn(console, 'error')
    const root = hydrateRoot(container, <Countdown {...props} />)
    await frames()

    expect(errors).not.toHaveBeenCalled()
    expect(digitsIn(container)).toBe('0:00')
    expect(container.querySelector('[data-member="countdown"]')?.hasAttribute('data-ended')).toBe(
      true,
    )
    expect(onEnd).toHaveBeenCalledTimes(1)
    root.unmount()
    container.remove()
  })
})

describe('Countdown — a new moment', () => {
  it('counts to a new `until` from the clock, and reports each end once', async () => {
    pin()
    const onEnd = vi.fn()
    const { rerender, container } = render(
      <Countdown until={at(2_000)} label="Code" locale="en-US" onEnd={onEnd} />,
    )
    await advance(2_000)
    expect(digitsIn(container)).toBe('0:00')
    expect(onEnd).toHaveBeenCalledTimes(1)

    // The application asks for a new code: a new moment, thirty seconds from now.
    rerender(<Countdown until={at(32_000)} label="Code" locale="en-US" onEnd={onEnd} />)
    await frames()
    expect(digitsIn(container)).toBe('0:30')
    expect(container.querySelector('[data-ended]')).toBeNull()

    await advance(30_000)
    expect(digitsIn(container)).toBe('0:00')
    expect(onEnd).toHaveBeenCalledTimes(2)
  })

  it('reads the latest onEnd, so a handler that changes is the one called', async () => {
    pin()
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = render(<Countdown until={at(2_000)} label="Code" onEnd={first} />)
    rerender(<Countdown until={at(2_000)} label="Code" onEnd={second} />)
    await advance(2_000)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('calls onEnd once under React’s development double effect', async () => {
    pin()
    const onEnd = vi.fn()
    render(
      <StrictMode>
        <Countdown until={at(-1_000)} label="Code" onEnd={onEnd} />
      </StrictMode>,
    )
    await frames()
    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  it('warns in development and renders nothing for a calendar date', async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { container } = render(<Countdown until="2026-08-07" label="Code" />)
    expect(container.firstElementChild).toBeNull()
    await frames()
    expect(warned).toHaveBeenCalledTimes(1)
    expect(String(warned.mock.calls[0]?.[0])).toContain('Countdown')
  })
})

describe('Countdown — beside the application’s Button', () => {
  it('leaves the Button to the application, which enables it at the end', async () => {
    pin()
    const entry = states.entries.find((candidate) => candidate.name.startsWith('beside a Button'))
    if (entry === undefined) throw new Error('the fixture has no composition entry')
    render(<>{entry.render()}</>)
    await frames()

    const button = screen.getByRole('button', { name: 'Send a new code' })
    // The member holds no button of its own.
    expect(document.querySelector('[data-member="countdown"] button')).toBeNull()
    expect((button as HTMLButtonElement).disabled).toBe(true)
    expect(digitsIn(document)).toBe('0:30')

    await advance(30_000)
    expect(digitsIn(document)).toBe('0:00')
    expect((button as HTMLButtonElement).disabled).toBe(false)
  })
})
