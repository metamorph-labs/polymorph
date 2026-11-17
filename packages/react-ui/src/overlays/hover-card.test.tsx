import { render } from '@testing-library/react'
import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { TAB_PASSES_BUTTONS } from '@polymorph/conformance/engines'
import { assertGoverned } from '@polymorph/react'
import { installTestTheme } from '@polymorph/engine/testing'
import { Link } from '../controls/Link'
import { HoverCard, type HoverCardProps } from './HoverCard'
import { Popover } from './Popover'
import { TOOLTIP_DELAY_MS } from './Tooltip'

/**
 * HoverCard in a real browser.
 *
 * The tests cover the guardrail: focus opens the preview without hover (a
 * pointer dwell is not the only way), the card takes no focus and has no name,
 * and Escape closes it without moving focus. The recipe claim, that it uses
 * Popover's panel recipe unchanged, is tested as Combobox tests Input's
 * grammar: by comparing what the two stylesheets resolve to.
 */

beforeAll(installTestTheme)
afterEach(() => vi.restoreAllMocks())

const panel = () => document.querySelector('[data-state="open"][data-side]') as HTMLElement | null

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<HoverCardProps>(true)
  })
})

describe('the guardrail', () => {
  it('opens on keyboard focus after the shared delay, not only on hover', async () => {
    const { getByRole } = render(
      <HoverCard content={<p>Support · 12 open tickets</p>}>
        <Link href="#ada">Ada Lovelace</Link>
      </HoverCard>,
    )

    getByRole('link').focus()
    expect(panel()).toBeNull()

    // The Tooltip provider's open delay (~500ms), the shared timing for how
    // long a dwell must last.
    await vi.waitFor(() => expect(panel()).not.toBeNull(), { timeout: 2000 })
    expect(document.activeElement).toBe(getByRole('link'))
  })

  it.skipIf(TAB_PASSES_BUTTONS)(
    'takes no focus, carries no name, and closes when focus moves on',
    async () => {
      const { getByRole } = render(
        <div>
          <HoverCard defaultOpen content={<p>Support · 12 open tickets</p>}>
            <Link href="#ada">Ada Lovelace</Link>
          </HoverCard>
          <a href="#next">Next stop</a>
        </div>,
      )

      await vi.waitFor(() => expect(panel()).not.toBeNull())
      const preview = panel() as HTMLElement

      // Deliberately unannounced: no label and no dialog role. It is a preview
      // for sighted readers, allowed only because nothing in it is load-bearing.
      expect(preview.getAttribute('aria-label')).toBeNull()
      expect(preview.getAttribute('role')).not.toBe('dialog')

      // Tab never enters the card: focus moves to the next stop in the page, and
      // the preview closes on blur.
      getByRole('link', { name: 'Ada Lovelace' }).focus()
      await userEvent.keyboard('{Tab}')
      expect(document.activeElement).toBe(getByRole('link', { name: 'Next stop' }))
      await vi.waitFor(() => expect(panel()).toBeNull(), { timeout: 2000 })
    },
  )

  it('closes on Escape without moving focus, and a stale dwell cannot reopen it', async () => {
    const { getByRole } = render(
      <HoverCard defaultOpen content={<p>Support · 12 open tickets</p>}>
        <Link href="#ada">Ada Lovelace</Link>
      </HoverCard>,
    )
    await vi.waitFor(() => expect(panel()).not.toBeNull())

    // Focus while the card is already open starts the primitive's dwell timer,
    // and the Escape that follows falls inside its window. Dismissal must
    // outlast the timer. The substrate clears the dwell on blur and leave but
    // not on dismiss, so without the latch the card closes and then reopens.
    getByRole('link').focus()
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(panel()).toBeNull())
    expect(document.activeElement).toBe(getByRole('link'))

    // Wait past the dwell delay: the card stays closed after the timer would
    // have fired, and focus has not moved.
    await new Promise((resolve) => setTimeout(resolve, TOOLTIP_DELAY_MS + 200))
    expect(panel()).toBeNull()
    expect(document.activeElement).toBe(getByRole('link'))
  })

  it('warns in dev about interactive content, which belongs in a Popover', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(
      <HoverCard
        defaultOpen
        content={
          <p>
            <a href="#profile">Open profile</a>
          </p>
        }
      >
        <Link href="#ada">Ada Lovelace</Link>
      </HoverCard>,
    )

    await vi.waitFor(() =>
      expect(warn.mock.calls.some(([message]) => String(message).includes('HoverCard'))).toBe(true),
    )
  })
})

/**
 * The spec uses Popover's panel recipe unchanged, and both stylesheets restate
 * it, so the test compares what they resolve to.
 */
describe('the panel resolves to Popover’s', () => {
  const skin = (element: Element) => {
    const style = getComputedStyle(element)
    return {
      background: style.backgroundColor,
      border: `${style.borderTopWidth} ${style.borderTopStyle} ${style.borderTopColor}`,
      radius: style.borderTopLeftRadius,
      shadow: style.boxShadow,
      padding: style.paddingTop,
      maxWidth: style.maxWidth,
    }
  }

  it('matches property for property', async () => {
    render(
      <HoverCard defaultOpen content={<p>Support</p>}>
        <Link href="#ada">Ada Lovelace</Link>
      </HoverCard>,
    )
    await vi.waitFor(() => expect(panel()).not.toBeNull())
    const preview = panel() as HTMLElement

    render(
      <Popover defaultOpen label="Reference panel" trigger={<Link href="#ref">Reference</Link>}>
        <p>Support</p>
      </Popover>,
    )
    const reference = await vi.waitFor(() => {
      const found = document.querySelector('[aria-label="Reference panel"]')
      expect(found).not.toBeNull()
      return found as HTMLElement
    })

    expect(skin(preview)).toEqual(skin(reference))
  })
})
