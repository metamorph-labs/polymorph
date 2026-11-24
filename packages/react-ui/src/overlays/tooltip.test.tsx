import { render, screen } from '@testing-library/react'
import { page, userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { Button } from '../controls/Button'
import { FormField } from '../controls/FormField'
import { Input } from '../controls/Input'
import { tokenColor, tokenLength } from '../controls/token-probe'
import { Inline } from '../layout/Inline'
import { installTestTheme } from '@polymorph/engine/testing'
import { Tooltip, TooltipProvider, TOOLTIP_DELAY_MS, type TooltipProps } from './Tooltip'

/**
 * Tooltip. These tests cover what a hint can get wrong without anyone noticing:
 * that it opens on focus as well as hover, that the control, not the wrapper,
 * is described, and that it grows out of the edge it is on.
 */

beforeAll(installTestTheme)

const bubble = () => document.querySelector('[data-motion-pattern]') as HTMLElement | null
const bubbles = () => [...document.querySelectorAll('[data-motion-pattern]')]

function mount(node: React.ReactElement) {
  return render(<TooltipProvider>{node}</TooltipProvider>)
}

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<TooltipProps>(true)
  })

  it('sets the delays once, for everyone', () => {
    // Delay is interaction design, not motion: it does not scale with
    // temperament, and `none` does not remove it.
    expect(TOOLTIP_DELAY_MS).toBe(500)
  })
})

describe('opening', () => {
  it('shows nothing until opened', () => {
    mount(
      <Tooltip content="Archive this ticket">
        <Button label="Archive" />
      </Tooltip>,
    )
    expect(bubble()).toBeNull()
  })

  it('opens on hover, after the delay', async () => {
    mount(
      <Tooltip content="Archive this ticket">
        <Button label="Archive" />
      </Tooltip>,
    )
    await userEvent.hover(screen.getByRole('button', { name: 'Archive' }))
    await vi.waitFor(() => expect(bubble()).not.toBeNull(), { timeout: TOOLTIP_DELAY_MS + 1000 })
    expect(bubble()?.textContent).toBe('Archive this ticket')
  })

  it('opens on focus too, matching hover for keyboard users', async () => {
    mount(
      <Tooltip content="Archive this ticket">
        <Button label="Archive" />
      </Tooltip>,
    )
    screen.getByRole('button', { name: 'Archive' }).focus()
    await vi.waitFor(() => expect(bubble()).not.toBeNull())
  })

  it('closes on Escape', async () => {
    mount(
      <Tooltip defaultOpen content="Archive this ticket">
        <Button label="Archive" />
      </Tooltip>,
    )
    expect(bubble()).not.toBeNull()
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(bubbles()).toHaveLength(0))
  })
})

/**
 * A control below the fold, reached with Tab: the browser scrolls it into view, and the scroll
 * comes a frame after the focus that opened the tooltip. The controls are text fields, which Tab
 * reaches in every engine.
 */
describe('while the keyboard holds its control', () => {
  afterEach(() => {
    document.scrollingElement?.scrollTo(0, 0)
  })

  function belowTheFold() {
    mount(
      <div>
        <Input aria-label="Above" />
        <div style={{ blockSize: '200vh' }} />
        <Tooltip content="Archive this ticket">
          <Input aria-label="Below" />
        </Tooltip>
        <Input aria-label="After" />
      </div>,
    )
    return {
      above: screen.getByRole('textbox', { name: 'Above' }),
      below: screen.getByRole('textbox', { name: 'Below' }),
      after: screen.getByRole('textbox', { name: 'After' }),
    }
  }

  /** Tabs from the field above to the one below, and waits for the page to scroll to it. */
  async function tabBelow() {
    const fields = belowTheFold()
    fields.above.focus()
    await userEvent.tab()
    await vi.waitFor(() => expect(document.activeElement).toBe(fields.below))
    await vi.waitFor(() => expect(bubble()).not.toBeNull())
    await vi.waitFor(() => expect(document.scrollingElement?.scrollTop).toBeGreaterThan(0))
    // The scroll event comes in the frame after the scroll.
    await new Promise((settle) => setTimeout(settle, 200))
    return fields
  }

  it('stays open when the Tab that opened it scrolls the page', async () => {
    const { below } = await tabBelow()
    expect(bubble()).not.toBeNull()
    expect(screen.getByRole('textbox', { name: 'Below', description: 'Archive this ticket' })).toBe(
      below,
    )
  })

  it('still closes on Escape', async () => {
    const { below } = await tabBelow()
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(bubbles()).toHaveLength(0))
    expect(document.activeElement).toBe(below)
  })

  it('still closes when focus moves on', async () => {
    const { after } = await tabBelow()
    await userEvent.tab()
    await vi.waitFor(() => expect(document.activeElement).toBe(after))
    await vi.waitFor(() => expect(bubbles()).toHaveLength(0))
  })

  it('still closes on a press on its control', async () => {
    const { below } = await tabBelow()
    await userEvent.click(below)
    await vi.waitFor(() => expect(bubbles()).toHaveLength(0))
  })

  it('still closes when another tooltip opens', async () => {
    const { below } = await tabBelow()
    expect(document.activeElement).toBe(below)
    mount(
      <Tooltip content="Duplicate this ticket">
        <Button label="Duplicate" />
      </Tooltip>,
    )
    await userEvent.hover(screen.getByRole('button', { name: 'Duplicate' }))
    await vi.waitFor(
      () => expect(bubbles().map((each) => each.textContent)).toEqual(['Duplicate this ticket']),
      { timeout: TOOLTIP_DELAY_MS + 1000 },
    )
  })
})

describe('what a screen reader gets', () => {
  it('describes the control, not the wrapper Radix needed', async () => {
    mount(
      <Tooltip defaultOpen content="Archive this ticket">
        <Button label="Archive" />
      </Tooltip>,
    )
    // The assertion checks the button's accessible description. The anchor
    // span is not focusable, so a description on it would never be announced.
    await vi.waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Archive', description: 'Archive this ticket' }),
      ).toBeTruthy(),
    )
  })

  it('takes the description away again when it closes', async () => {
    function Controlled({ open }: { open: boolean }) {
      return (
        <TooltipProvider>
          <Tooltip key={open ? 'open' : 'closed'} defaultOpen={open} content="Archive">
            <Button label="Archive" />
          </Tooltip>
        </TooltipProvider>
      )
    }
    const view = render(<Controlled open />)
    await vi.waitFor(() =>
      expect(screen.getByRole('button').getAttribute('aria-describedby')).toBeTruthy(),
    )

    view.rerender(<Controlled open={false} />)
    await vi.waitFor(() =>
      expect(screen.getByRole('button').getAttribute('aria-describedby')).toBeNull(),
    )
  })
})

describe('what a screen reader keeps', () => {
  it('keeps a description the control already had', async () => {
    function Field({ open }: { open: boolean }) {
      return (
        <TooltipProvider>
          <Tooltip key={open ? 'open' : 'closed'} defaultOpen={open} content="A hint">
            <FormField label="Subject" error="A subject is required.">
              <Input />
            </FormField>
          </Tooltip>
        </TooltipProvider>
      )
    }
    // Read from the DOM at each step rather than captured once: the `key`
    // change remounts the field, and `useId` returns a new id each time.
    const errorId = () => screen.getByText('A subject is required.').id
    const describedBy = () => screen.getByRole('textbox').getAttribute('aria-describedby') ?? ''

    const view = render(<Field open={false} />)
    expect(describedBy(), 'the field was not wired in the first place').toBe(errorId())

    view.rerender(<Field open />)
    await vi.waitFor(() => {
      expect(describedBy()).toContain(errorId())
      expect(describedBy()).not.toBe(errorId())
    })

    view.rerender(<Field open={false} />)
    await vi.waitFor(() => expect(describedBy()).toBe(errorId()))
  })
})

describe('recipe', () => {
  it('is the inverse pair, with no border', async () => {
    mount(
      <Tooltip defaultOpen content="Archive this ticket">
        <Button label="Archive" />
      </Tooltip>,
    )
    const style = getComputedStyle(bubble() as HTMLElement)
    expect(style.backgroundColor).toBe(tokenColor('--pm-bg-inverse'))
    expect(style.color).toBe(tokenColor('--pm-text-inverse'))
    expect(style.borderTopWidth).toBe('0px')
    expect(style.borderTopLeftRadius).toBe(tokenLength('--pm-radius-sm'))
  })

  it('wraps rather than growing past its max width', async () => {
    mount(
      <Tooltip
        defaultOpen
        content="A hint long enough to wrap onto several lines, which is already longer than a tooltip should be."
      >
        <Button label="Archive" />
      </Tooltip>,
    )
    const node = bubble() as HTMLElement
    const max = Number.parseFloat(tokenLength('--pm-space-10')) * 3
    expect(node.offsetWidth).toBeLessThanOrEqual(Math.ceil(max))
    expect(node.offsetHeight).toBeGreaterThan(
      Number.parseFloat(tokenLength('--pm-control-height-sm')),
    )
  })

  it('sits one space step from its trigger, on each side', async () => {
    const offset = Number.parseFloat(tokenLength('--pm-space-2'))
    expect(offset).toBeGreaterThan(0)
    for (const side of ['top', 'bottom', 'left', 'right'] as const) {
      // Room on every side of the trigger, so the bubble lands on the side asked for and each
      // of the four is measured.
      const host = document.createElement('div')
      host.style.cssText = 'padding: 120px;'
      document.body.append(host)
      const view = render(
        <TooltipProvider>
          <Inline justify="center">
            <Tooltip defaultOpen side={side} content="Hint">
              <Button label="Archive" />
            </Tooltip>
          </Inline>
        </TooltipProvider>,
        { container: host },
      )
      const node = bubble() as HTMLElement
      const trigger = screen.getByRole('button', { name: 'Archive' })
      // Measured, not read from a style: the gap is what the reader sees, and a
      // declaration the engine overwrites leaves the bubble against its trigger.
      // The wait covers the positioner, which places the bubble a frame after
      // it mounts, and the arrival, which scales it. The positioner rounds to
      // whole pixels, so the gap is within one of the token.
      await vi.waitFor(() => {
        const box = node.getBoundingClientRect()
        const anchor = trigger.getBoundingClientRect()
        const gaps = {
          top: anchor.top - box.bottom,
          bottom: box.top - anchor.bottom,
          left: anchor.left - box.right,
          right: box.left - anchor.right,
        }
        expect(node.dataset['side']).toBe(side)
        expect(Math.abs(gaps[side] - offset), side).toBeLessThan(1)
      })
      view.unmount()
      host.remove()
      await vi.waitFor(() => expect(bubbles()).toHaveLength(0))
    }
  })

  it('grows out of the edge it sits on', async () => {
    mount(
      <Tooltip defaultOpen side="top" content="Hint">
        <Button label="Archive" />
      </Tooltip>,
    )
    // A bubble above its trigger grows from its own bottom edge, so it appears
    // to come out of the button. The engine sets `center bottom`; the browser
    // reports it in pixels, so the assertion checks the geometry the keyword
    // describes.
    const node = bubble() as HTMLElement
    const [x = '', y = ''] = getComputedStyle(node).transformOrigin.split(' ')
    expect(Number.parseFloat(x)).toBeCloseTo(node.offsetWidth / 2, 0)
    expect(Number.parseFloat(y)).toBeCloseTo(node.offsetHeight, 0)
  })
})

/**
 * A bubble beside its trigger has the room between the trigger and the window's edge. The
 * positioner moves it to the other side when that is short, and does nothing more when both
 * sides are: in a 375px window a centred trigger leaves about 155px each side.
 */
describe('in a narrow window', () => {
  afterEach(async () => {
    await page.viewport(1280, 800)
  })

  /**
   * The bubble, once the positioner has placed it beside its trigger. Until then it waits
   * outside the window, where every edge check would pass.
   */
  async function placed(name: string): Promise<HTMLElement> {
    const node = bubble() as HTMLElement
    const trigger = screen.getByRole('button', { name }).getBoundingClientRect()
    await vi.waitFor(() => {
      const box = node.getBoundingClientRect()
      expect(box.bottom).toBeGreaterThan(trigger.top)
      expect(box.top).toBeLessThan(trigger.bottom)
      // The positioner rounds to whole pixels, so the two boxes may share one.
      expect(box.right <= trigger.left + 1 || box.left >= trigger.right - 1).toBe(true)
    })
    return node
  }

  for (const side of ['left', 'right'] as const) {
    it(`stays inside the window when neither side holds it, opened to the ${side}`, async () => {
      await page.viewport(375, 812)
      mount(
        <Inline justify="center">
          <Tooltip defaultOpen side={side} content={`Grows out of the ${side} edge of its trigger`}>
            <Button variant="outline" tone="neutral" label={side} />
          </Tooltip>
        </Inline>,
      )
      const node = await placed(side)
      await vi.waitFor(() => {
        const box = node.getBoundingClientRect()
        expect(box.left).toBeGreaterThanOrEqual(0)
        expect(box.right).toBeLessThanOrEqual(document.documentElement.clientWidth)
      })
      // The text wraps inside the narrower bubble. None of it is cut.
      expect(node.scrollWidth).toBe(node.clientWidth)
    })
  }

  it('keeps its width where a side has room for it', async () => {
    await page.viewport(375, 812)
    mount(
      <Tooltip defaultOpen side="right" content="Grows out of the right edge of its trigger">
        <Button variant="outline" tone="neutral" label="right" />
      </Tooltip>,
    )
    // The trigger is at the window's start, so the bubble fits beside it on one line.
    const node = await placed('right')
    const style = getComputedStyle(node)
    expect(node.offsetHeight).toBeCloseTo(
      Number.parseFloat(style.lineHeight) + Number.parseFloat(style.paddingBlockStart) * 2,
      0,
    )
  })
})

describe('the anchor', () => {
  it('is exactly the size of the control it wraps', async () => {
    const { container } = mount(
      <Tooltip content="Archive">
        <Button label="Archive" />
      </Tooltip>,
    )
    const anchor = container.querySelector('span') as HTMLElement
    const control = screen.getByRole('button', { name: 'Archive' })
    expect(anchor.getBoundingClientRect().width).toBeCloseTo(
      control.getBoundingClientRect().width,
      1,
    )
  })

  it('adds no tab stop of its own', () => {
    const { container } = mount(
      <Tooltip content="Archive">
        <Button label="Archive" />
      </Tooltip>,
    )
    expect((container.querySelector('span') as HTMLElement).tabIndex).toBe(-1)
  })
})
