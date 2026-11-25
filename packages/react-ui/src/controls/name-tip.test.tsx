import { act, render, screen } from '@testing-library/react'
import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'
import { TOOLTIP_DELAY_MS, TOOLTIP_SKIP_DELAY_MS } from '@polymorph/react'
import { Dialog } from '../overlays/Dialog'
import { Tooltip, TooltipProvider } from '../overlays/Tooltip'
import { Pagination } from '../structure/Pagination'
import { AvatarButton } from './AvatarButton'
import { Button } from './Button'
import { CopyButton } from './CopyButton'
import { SplitButton } from './SplitButton'
import { tokenColor, tokenLength } from './token-probe'

/**
 * The name tip (`design/components/button.md`): an icon-only Button shows its
 * label on hover and keyboard focus, in the Tooltip's bubble, and so does each
 * member that draws Button's icon-only box without the Button member. The
 * words are each test's own labels, which no machine formats, so no test
 * depends on the browser's locale.
 */

beforeAll(installTestTheme)

const tip = () => document.querySelector<HTMLElement>('body > [popover]')

/** The window's bottom-left corner, where no fixture reaches. */
function corner() {
  const element = document.createElement('div')
  element.style.cssText = 'position: fixed; left: 0; bottom: 0; width: 8px; height: 8px'
  document.body.append(element)
  return element
}

/** Moves the real pointer to the corner. */
async function restPointer() {
  const element = corner()
  // Forced, because a modal's scrim may cover the corner.
  await userEvent.hover(element, { force: true })
  element.remove()
}

/**
 * Fakes the hover timer once the skip delay of a tip an earlier test closed has passed. The skip
 * delay is read from the real clock, which stays real.
 */
async function fakeTimersAfterSkip() {
  vi.useRealTimers()
  await new Promise((resolve) => setTimeout(resolve, TOOLTIP_SKIP_DELAY_MS))
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
}

/** Hovers `element` and runs the hover delay on the fake clock. */
async function hoverAndWait(element: Element) {
  await userEvent.hover(element)
  await act(() => vi.advanceTimersByTimeAsync(TOOLTIP_DELAY_MS))
}

/** Renders below the window's top edge, where the tip has room above the control. */
function renderLower(node: React.ReactElement) {
  const container = document.createElement('div')
  container.style.paddingTop = '96px'
  document.body.append(container)
  return render(node, { container })
}

afterEach(async () => {
  vi.useRealTimers()
  await restPointer()
})

describe('an icon-only Button', () => {
  it('shows its label after the delay on hover, in the Tooltip’s bubble', async () => {
    renderLower(<Button variant="ghost" tone="neutral" iconOnly icon="archive" label="Archive" />)
    const button = screen.getByRole('button', { name: 'Archive' })
    await fakeTimersAfterSkip()
    await userEvent.hover(button)
    await act(() => vi.advanceTimersByTimeAsync(TOOLTIP_DELAY_MS - 1))
    expect(tip()).toBeNull()
    await act(() => vi.advanceTimersByTimeAsync(1))
    const bubble = tip() as HTMLElement
    expect(bubble.textContent).toBe('Archive')
    expect(bubble.getAttribute('aria-hidden')).toBe('true')
    // The Tooltip's recipe values, read through the composed class, and its gap.
    const style = getComputedStyle(bubble)
    expect(style.backgroundColor).toBe(tokenColor('--pm-bg-inverse'))
    expect(bubble.dataset.side).toBe('top')
    const gap = button.getBoundingClientRect().top - bubble.getBoundingClientRect().bottom
    expect(`${Math.round(gap)}px`).toBe(tokenLength('--pm-space-2'))
    // The accessible name is still the button's own, and nothing describes it twice.
    expect(button.getAttribute('aria-label')).toBe('Archive')
    expect(button.hasAttribute('aria-describedby')).toBe(false)
  })

  it('shows its label on keyboard focus', async () => {
    render(
      <>
        <Button label="Before" />
        <Button variant="ghost" tone="neutral" iconOnly icon="archive" label="Archive" />
      </>,
    )
    screen.getByRole('button', { name: 'Before' }).focus()
    await userEvent.keyboard('{Tab}')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Archive' }))
    await vi.waitFor(() => expect(tip()?.textContent).toBe('Archive'))
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
    expect(tip()).toBeNull()
  })

  it('shows nothing once it is disabled', async () => {
    const { rerender } = render(<Button iconOnly icon="archive" label="Archive" />)
    const button = screen.getByRole('button', { name: 'Archive' })
    await fakeTimersAfterSkip()
    await hoverAndWait(button)
    expect(tip()).not.toBeNull()
    rerender(<Button iconOnly icon="archive" label="Archive" disabled />)
    expect(tip()).toBeNull()
  })
})

describe('a labelled Button', () => {
  it('shows no tip on hover or keyboard focus', async () => {
    render(
      <>
        <Button label="Before" />
        <Button label="Archive" icon="archive" />
      </>,
    )
    const button = screen.getByRole('button', { name: 'Archive' })
    await fakeTimersAfterSkip()
    await hoverAndWait(button)
    expect(tip()).toBeNull()
    vi.useRealTimers()
    screen.getByRole('button', { name: 'Before' }).focus()
    await userEvent.keyboard('{Tab}')
    expect(document.activeElement).toBe(button)
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    expect(tip()).toBeNull()
  })
})

describe('an icon-only Button inside a Tooltip', () => {
  it('shows the Tooltip and not its own tip', async () => {
    render(
      <TooltipProvider>
        <Tooltip content="Archive this ticket">
          <Button variant="ghost" tone="neutral" iconOnly icon="archive" label="Archive" />
        </Tooltip>
      </TooltipProvider>,
    )
    await fakeTimersAfterSkip()
    await hoverAndWait(screen.getByRole('button', { name: 'Archive' }))
    await vi.waitFor(() =>
      expect(document.querySelector('[data-member="tooltip"]')?.textContent).toBe(
        'Archive this ticket',
      ),
    )
    expect(tip()).toBeNull()
  })
})

describe('the members that draw Button’s icon-only box', () => {
  it('SplitButton’s chevron shows its menu’s name', async () => {
    render(<SplitButton label="Resolve" menuLabel="More resolve options" entries={[]} />)
    await fakeTimersAfterSkip()
    await hoverAndWait(screen.getByRole('button', { name: 'More resolve options' }))
    expect(tip()?.textContent).toBe('More resolve options')
  })

  it('AvatarButton shows what a press does', async () => {
    render(<AvatarButton name="Ada Lovelace" label="Account menu" />)
    await fakeTimersAfterSkip()
    await hoverAndWait(screen.getByRole('button', { name: 'Account menu' }))
    expect(tip()?.textContent).toBe('Account menu')
  })

  it('CopyButton shows its label, and none while its confirmation shows', async () => {
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    try {
      render(<CopyButton value="pnpm add" label="Copy install command" copiedLabel="Copied" />)
      const button = screen.getByRole('button', { name: 'Copy install command' })
      await fakeTimersAfterSkip()
      await hoverAndWait(button)
      expect(tip()?.textContent).toBe('Copy install command')
      await userEvent.click(button)
      await act(async () => {})
      expect(button.dataset.state).toBe('copied')
      expect(tip()).toBeNull()
      // The pointer leaves and comes back while the glyph still confirms: no tip.
      await restPointer()
      await hoverAndWait(button)
      expect(tip()).toBeNull()
    } finally {
      write.mockRestore()
    }
  })

  it('Pagination’s arrow drawn as a link shows its label on hover and keyboard focus', async () => {
    render(
      <Pagination
        page={3}
        pageCount={5}
        onPageChange={() => {}}
        getPageHref={(page) => `#page-${page}`}
      />,
    )
    const next = screen.getByRole('link', { name: 'Next page' })
    await fakeTimersAfterSkip()
    await hoverAndWait(next)
    expect(tip()?.textContent).toBe('Next page')
    vi.useRealTimers()
    await restPointer()
    expect(tip()).toBeNull()
    screen.getByRole('link', { name: 'Page 5' }).focus()
    await userEvent.keyboard('{Tab}')
    expect(document.activeElement).toBe(next)
    await vi.waitFor(() => expect(tip()?.textContent).toBe('Next page'))
  })
})

describe('in a modal Dialog', () => {
  /**
   * Opens the Dialog after a press elsewhere, so the focus the Dialog gives its close button is not
   * keyboard focus and opens no tip.
   */
  async function open() {
    const elsewhere = corner()
    await userEvent.click(elsewhere, { force: true })
    elsewhere.remove()
    render(
      <Dialog title="Discard the draft?" defaultOpen trigger={<Button label="Open" />}>
        <p>The draft has not been sent.</p>
      </Dialog>,
    )
    return screen.getByRole('button', { name: 'Close' })
  }

  it('draws the close button’s tip above the panel and the scrim, and focus stays in the dialog', async () => {
    const close = await open()
    const panel = screen.getByRole('dialog')
    await vi.waitFor(() => expect(panel.contains(document.activeElement)).toBe(true))
    const focused = document.activeElement
    await fakeTimersAfterSkip()
    await hoverAndWait(close)
    const bubble = tip() as HTMLElement
    expect(bubble.textContent).toBe('Close')
    expect(bubble.matches(':popover-open')).toBe(true)
    expect(document.activeElement).toBe(focused)

    // The bubble crosses the panel's top edge: its top is over the scrim, its foot over the
    // panel. Hit testing finds the bubble at both while it takes pointer events, so it is drawn
    // over both.
    const box = bubble.getBoundingClientRect()
    const edge = panel.getBoundingClientRect().top
    expect(box.top).toBeLessThan(edge)
    expect(box.bottom).toBeGreaterThan(edge)
    const x = box.left + box.width / 2
    bubble.style.pointerEvents = 'auto'
    try {
      expect(document.elementFromPoint(x, box.top + 1)).toBe(bubble)
      expect(document.elementFromPoint(x, box.bottom - 1)).toBe(bubble)
    } finally {
      bubble.style.pointerEvents = ''
    }
    // It takes no pointer events: what is under it is what a press reaches.
    expect(document.elementFromPoint(x, box.bottom - 1)).not.toBe(bubble)
  })

  it('Escape on a tip the pointer opened closes the tip and the Dialog stays open', async () => {
    const close = await open()
    await fakeTimersAfterSkip()
    await hoverAndWait(close)
    expect(tip()).not.toBeNull()
    vi.useRealTimers()
    await userEvent.keyboard('{Escape}')
    expect(tip()).toBeNull()
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('Escape on a tip keyboard focus opened closes the tip and the Dialog', async () => {
    render(
      <Dialog title="Discard the draft?" trigger={<Button label="Open" />}>
        <p>The draft has not been sent.</p>
      </Dialog>,
    )
    const trigger = screen.getByRole('button', { name: 'Open' })
    trigger.focus()
    await userEvent.keyboard('{Enter}')
    // The Dialog puts focus on its close button, which opens the close button's tip.
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' })),
    )
    await vi.waitFor(() => expect(tip()?.textContent).toBe('Close'))
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(tip()).toBeNull()
  })
})
