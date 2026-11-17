import { render } from '@testing-library/react'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { installTestTheme } from '@polymorph/engine/testing'
import { DensityScope } from '../exceptions/Scopes'
import { Text } from './Text'
import { ScrollArea, type ScrollAreaProps } from './ScrollArea'
import styles from '@polymorph/recipes/structure/scroll-area.module.css'

/**
 * ScrollArea, in a real browser.
 *
 * All geometry or timing a unit test cannot see: rails drawn after the
 * substrate's ResizeObserver, the `always` gutter's padding, the thumb's
 * measured minimum, and a tab stop that follows real overflow.
 */

beforeAll(installTestTheme)

const LINES = Array.from({ length: 40 }, (_, index) => `Setting row ${index + 1}`)

function Tall() {
  return (
    <div className={styles.harness}>
      <ScrollArea label="Notification settings">
        {LINES.map((line) => (
          <Text key={line} size="sm">
            {line}
          </Text>
        ))}
      </ScrollArea>
    </div>
  )
}

const viewport = (host: HTMLElement) =>
  host.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement
const rail = (host: HTMLElement) =>
  host.querySelector(`.${String(styles.rail).split(' ')[0]}`) as HTMLElement | null

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<ScrollAreaProps>(true)
  })
})

describe('the guardrail: never hide that there is more content', () => {
  it('draws the rail at rest while the region overflows, and reserves its width', async () => {
    const { container } = render(<Tall />)
    const host = container.firstElementChild as HTMLElement

    await vi.waitFor(() => expect(rail(host)).not.toBeNull())
    expect(rail(host)?.getAttribute('data-state')).toBe('visible')
    expect(rail(host)?.getAttribute('data-orientation')).toBe('vertical')

    // The `always` gutter: the viewport reserves space for the rail, so the last
    // line scrolls clear of the thumb instead of under it.
    await vi.waitFor(() =>
      expect(getComputedStyle(viewport(host)).paddingInlineEnd).not.toBe('0px'),
    )
  })

  it('draws no rail on a region that does not overflow', async () => {
    const { container } = render(
      <div className={styles.harness}>
        <ScrollArea label="Notification settings">
          <Text size="sm">One row</Text>
        </ScrollArea>
      </div>,
    )
    const host = container.firstElementChild as HTMLElement

    // The substrate's overflow detection is debounced, so wait as long as the
    // positive case does before checking for absence.
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(rail(host)).toBeNull()
    expect(getComputedStyle(viewport(host)).paddingInlineEnd).toBe('0px')
  })

  it('gives the thumb a minimum length, so a very long document still has a handle', async () => {
    const { container } = render(<Tall />)
    const host = container.firstElementChild as HTMLElement

    await vi.waitFor(() => {
      const thumb = host.querySelector(`.${String(styles.thumb).split(' ')[0]}`) as HTMLElement
      expect(thumb).not.toBeNull()
      expect(thumb.getBoundingClientRect().height).toBeGreaterThanOrEqual(24)
    })
  })

  it('keeps the minimum when the natural ratio would give less, in both orientations', async () => {
    // The Tall case passes on the natural ratio alone. Only content where
    // ratio × track < 24px tests the rule itself, and a broken rule would leave
    // the substrate's own 18px minimum.
    const thumbOf = (host: HTMLElement) =>
      host.querySelector(`.${String(styles.thumb).split(' ')[0]}`) as HTMLElement | null

    const tall = render(
      <div className={styles.harness}>
        <ScrollArea label="Audit log">
          {Array.from({ length: 400 }, (_, index) => (
            <Text key={index} size="sm">
              {`Entry ${index + 1}`}
            </Text>
          ))}
        </ScrollArea>
      </div>,
    )
    const tallHost = tall.container.firstElementChild as HTMLElement
    await vi.waitFor(() => {
      // Asserts the premise, so a shorter fixture cannot silently turn this into
      // the natural-ratio test above.
      expect(viewport(tallHost).scrollHeight).toBeGreaterThan(viewport(tallHost).clientHeight * 12)
      const thumb = thumbOf(tallHost)
      expect(thumb).not.toBeNull()
      expect(thumb?.getBoundingClientRect().height).toBeGreaterThanOrEqual(24)
    })

    const wide = render(
      <div className={styles.harnessNarrow}>
        <ScrollArea orientation="horizontal" label="Raw token">
          <Text size="sm">{'pm_live_9f2c4e8b7a614d3f8c25b1e07d9a3c6f41e8b2d5'.repeat(24)}</Text>
        </ScrollArea>
      </div>,
    )
    const wideHost = wide.container.firstElementChild as HTMLElement
    await vi.waitFor(() => {
      expect(viewport(wideHost).scrollWidth).toBeGreaterThan(viewport(wideHost).clientWidth * 12)
      const thumb = thumbOf(wideHost)
      expect(thumb).not.toBeNull()
      expect(thumb?.getBoundingClientRect().width).toBeGreaterThanOrEqual(24)
    })
  })

  it('keeps the minimum at compact density, where the space steps shrink', async () => {
    const { container } = render(
      <DensityScope value="compact">
        <div className={styles.harness}>
          <ScrollArea label="Audit log">
            {Array.from({ length: 400 }, (_, index) => (
              <Text key={index} size="sm">
                {`Entry ${index + 1}`}
              </Text>
            ))}
          </ScrollArea>
        </div>
      </DensityScope>,
    )
    const host = container.querySelector('[data-density]')?.firstElementChild as HTMLElement
    await vi.waitFor(() => {
      expect(viewport(host).scrollHeight).toBeGreaterThan(viewport(host).clientHeight * 12)
      const thumb = host.querySelector(`.${String(styles.thumb).split(' ')[0]}`) as HTMLElement
      expect(thumb).not.toBeNull()
      expect(thumb.getBoundingClientRect().height).toBeGreaterThanOrEqual(24)
    })
  })
})

describe('the hover type', () => {
  it('keeps the rail mounted, hidden at rest, shown on hover, with no gutter', async () => {
    const { container } = render(
      <div className={styles.harness}>
        <ScrollArea type="hover" label="Notification settings">
          {LINES.map((line) => (
            <Text key={line} size="sm">
              {line}
            </Text>
          ))}
        </ScrollArea>
      </div>,
    )
    const host = container.firstElementChild as HTMLElement

    await vi.waitFor(() => expect(rail(host)).not.toBeNull())
    expect(rail(host)?.getAttribute('data-state')).toBe('hidden')
    expect(getComputedStyle(viewport(host)).paddingInlineEnd).toBe('0px')

    await userEvent.hover(viewport(host))
    await vi.waitFor(() => expect(rail(host)?.getAttribute('data-state')).toBe('visible'))
  })
})

describe('the tab stop (CodeBlock’s rule)', () => {
  it('is a named region exactly while it overflows', async () => {
    const { container, rerender } = render(<Tall />)
    // Re-queried per read: the rerender below swaps the root component for a
    // plain element, so a node captured here would be a detached snapshot.
    const port = () => viewport(container.firstElementChild as HTMLElement)

    await vi.waitFor(() => {
      expect(port().getAttribute('tabindex')).toBe('0')
      expect(port().getAttribute('role')).toBe('region')
      expect(port().getAttribute('aria-label')).toBe('Notification settings')
    })

    rerender(
      <div className={styles.harness}>
        <ScrollArea label="Notification settings">
          <Text size="sm">One row</Text>
        </ScrollArea>
      </div>,
    )
    await vi.waitFor(() => {
      expect(port().getAttribute('tabindex')).toBeNull()
      expect(port().getAttribute('role')).toBeNull()
    })
  })

  it('scrolls from the keyboard once focused', async () => {
    const { container } = render(<Tall />)
    const host = container.firstElementChild as HTMLElement
    await vi.waitFor(() => expect(viewport(host).getAttribute('tabindex')).toBe('0'))

    viewport(host).focus()
    // Page Down, which every engine's driver scrolls on. Playwright's WebKit takes no
    // scroll from an arrow key, on a focused region or on the page.
    await userEvent.keyboard('{PageDown}')
    await vi.waitFor(() => expect(viewport(host).scrollTop).toBeGreaterThan(0))
  })
})
