import { assertGoverned, DATA_ATTRS } from '@polymorph/react'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { page, userEvent } from 'vitest/browser'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { Button } from '../controls/Button'
import { Input } from '../controls/Input'
import { createAgentBridge } from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'
import { Drawer, type DrawerProps } from './Drawer'

/**
 * Drawer in a real browser.
 *
 * These tests check the spec's claim that a drawer is a positioned Dialog and
 * inherits its behaviour rather than reimplementing it. So the focus trap, the
 * restore, Escape and the forced choice are asserted here too. They are not new
 * code, but "it is Dialog's, unchanged" is a claim, and it needs a test.
 *
 * The new parts are the geometry and the `sheet` pattern. They are asserted
 * from the attribute the engine writes rather than from a transform
 * mid-animation: `data-motion-pattern` is what the surface resolved to, which
 * is what a component can get wrong.
 */

beforeAll(installTestTheme)

/*
 * The temperament is set explicitly rather than inherited. A sheet moves at
 * every temperament except `none`, so a test that read whatever attribute was
 * on the page would depend on the file that ran before it.
 */
beforeEach(() => {
  document.documentElement.setAttribute(DATA_ATTRS.motion, 'standard')
})

afterEach(() => {
  document.documentElement.removeAttribute(DATA_ATTRS.motion)
})

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Radix attaches its outside-press listener a tick after the layer mounts, so
 * that the press that opened a surface cannot immediately close it. A
 * `defaultOpen` sheet must therefore get that tick. Without it, a press arrives
 * before anything is listening, and a test that expects the sheet to stay open
 * would pass for the wrong reason.
 */
const listening = () => sleep(20)

const panel = () => document.querySelector('[role="dialog"]') as HTMLElement | null
const panels = () => [...document.querySelectorAll('[role="dialog"]')]
const scrim = () => document.querySelector('[data-motion-pattern="fade"]') as HTMLElement | null

/** A pointer press outside the panel, dispatched the way Radix listens for it. */
function pressOutside(target: Element): void {
  for (const type of ['pointerdown', 'pointerup'] as const) {
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true }))
  }
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))
}

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<DrawerProps>(true)
  })
})

describe('the sheet', () => {
  it('opens as a modal named by its title', () => {
    render(
      <Drawer defaultOpen title="Ticket #4182" description="Refund not received">
        <p>body</p>
      </Drawer>,
    )
    const node = screen.getByRole('dialog', { name: 'Ticket #4182' })
    expect(node.getAttribute('aria-modal')).toBe('true')
    expect(node.dataset['state']).toBe('open')
  })

  it('describes itself from its description', () => {
    render(
      <Drawer defaultOpen title="Ticket #4182" description="Refund not received">
        <p>body</p>
      </Drawer>,
    )
    expect(screen.getByRole('dialog', { description: 'Refund not received' })).toBeTruthy()
  })

  it('reports its edge and its size, so the recipe has something to key off', () => {
    render(
      <Drawer defaultOpen side="bottom" size="lg" title="Share this ticket">
        <p>body</p>
      </Drawer>,
    )
    const node = panel() as HTMLElement
    expect(node.dataset['side']).toBe('bottom')
    expect(node.dataset['size']).toBe('lg')
  })

  it('defaults to the inline-end edge at the middle size', () => {
    render(
      <Drawer defaultOpen title="Ticket #4182">
        <p>body</p>
      </Drawer>,
    )
    const node = panel() as HTMLElement
    expect(node.dataset['side']).toBe('end')
    expect(node.dataset['size']).toBe('md')
  })

  it('enters with the sheet pattern, sliding in rather than fading in', () => {
    render(
      <Drawer defaultOpen title="Ticket #4182">
        <p>body</p>
      </Drawer>,
    )
    // The pattern the surface resolved to. The scrim beside it is still a fade,
    // which checks the spec's "scrim reuses `dialog.scrim`".
    expect((panel() as HTMLElement).dataset['motionPattern']).toBe('sheet')
    expect(scrim()).not.toBeNull()
  })

  it('starts just off screen, on the edge it is pinned to', () => {
    /*
     * Opened from a press rather than with `defaultOpen`, and read synchronously.
     * Both matter: presence deliberately does not animate a surface that was
     * already open on mount (it was never absent), and one frame after the press
     * the panel is already moving in.
     *
     * The offset is the panel's own size. A 100% offset is geometry, which is
     * why this pattern exists instead of a `slide-fade` with a large distance.
     */
    const edges = [
      { side: 'end', axis: 'x', sign: 1 },
      { side: 'start', axis: 'x', sign: -1 },
      { side: 'bottom', axis: 'y', sign: 1 },
    ] as const

    function Sheet({ side }: { side: DrawerProps['side'] }) {
      const [open, setOpen] = useState(false)
      return (
        <>
          <Button label="Open" onClick={() => setOpen(true)} />
          <Drawer open={open} onOpenChange={setOpen} side={side} title="Ticket #4182">
            <p>body</p>
          </Drawer>
        </>
      )
    }

    for (const edge of edges) {
      const view = render(<Sheet side={edge.side} />)
      fireEvent.click(screen.getByRole('button', { name: 'Open' }))

      const node = panel() as HTMLElement
      // The engine moves a surface with the `translate` property; a percentage
      // there is relative to the panel's own box.
      const own = edge.axis === 'x' ? node.offsetWidth : node.offsetHeight
      const [x = '0px', y = '0px'] = getComputedStyle(node).translate.split(/\s+/)
      const value = edge.axis === 'x' ? x : y
      const travelled = value.endsWith('%')
        ? (Number.parseFloat(value) / 100) * own
        : Number.parseFloat(value) || 0

      expect(Math.sign(travelled), `${edge.side} travelled the wrong way`).toBe(edge.sign)
      expect(Math.abs(travelled), `${edge.side} did not start off canvas`).toBeCloseTo(own, 0)
      view.unmount()
    }
  })

  it('appears in place at none', () => {
    document.documentElement.setAttribute(DATA_ATTRS.motion, 'none')
    render(
      <Drawer defaultOpen title="Ticket #4182">
        <p>body</p>
      </Drawer>,
    )
    const node = panel() as HTMLElement
    // Still the sheet pattern; `none` removes the duration, not the pattern. A
    // sheet that flashed off screen for a frame would mean the projection failed.
    expect(node.dataset['motionPattern']).toBe('sheet')
    expect(node.dataset['motionProjected']).toBeUndefined()
  })
})

describe('dismissal by control, scrim and Escape, never by gesture', () => {
  it('closes from its own ✕ and tells its caller', async () => {
    const onOpenChange = vi.fn()
    render(
      <Drawer defaultOpen title="Ticket #4182" onOpenChange={onOpenChange}>
        <p>body</p>
      </Drawer>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    await vi.waitFor(() => expect(panels()).toHaveLength(0))
  })

  it('closes on Escape', async () => {
    render(
      <Drawer defaultOpen title="Ticket #4182">
        <p>body</p>
      </Drawer>,
    )
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(panels()).toHaveLength(0))
  })

  it('closes on a press outside, because the scrim is the dismiss surface', async () => {
    render(
      <Drawer defaultOpen title="Ticket #4182">
        <p>body</p>
      </Drawer>,
    )
    await listening()
    pressOutside(scrim() as HTMLElement)
    await vi.waitFor(() => expect(panels()).toHaveLength(0))
  })

  it('offers no way to close when the choice is forced', async () => {
    render(
      <Drawer
        defaultOpen
        dismissible={false}
        title="Finish the handover"
        footer={<Button label="Hand over" />}
      >
        <p>body</p>
      </Drawer>,
    )
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
    await listening()

    await userEvent.keyboard('{Escape}')
    await sleep(120)
    expect(panel(), 'Escape closed a forced choice').not.toBeNull()

    pressOutside(scrim() as HTMLElement)
    await sleep(120)
    expect(panel(), 'an outside press closed a forced choice').not.toBeNull()
  })
})

describe('focus, unchanged from Dialog', () => {
  it('starts in the body rather than on the close button', async () => {
    render(
      <Drawer defaultOpen title="Reassign ticket" footer={<Button label="Reassign" />}>
        <Input aria-label="Assignee" />
      </Drawer>,
    )
    await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox')))
  })

  it('falls back to the primary action, which is the rightmost one', async () => {
    render(
      <Drawer
        defaultOpen
        title="Reassign ticket"
        footer={
          <>
            <Button variant="outline" tone="neutral" label="Cancel" />
            <Button label="Reassign" />
          </>
        }
      >
        <p>Nothing focusable in here.</p>
      </Drawer>,
    )
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Reassign' })),
    )
  })

  it('focuses the dismiss action when asked, as Dialog does', async () => {
    // `initialFocus="dismiss"` is for a panel asking whether you meant it. The
    // leftmost footer action is the safe one, and a hasty Enter must not
    // trigger the destructive one. The body input is skipped on purpose,
    // because that is what the prop means.
    render(
      <Drawer
        defaultOpen
        initialFocus="dismiss"
        title="Discard draft?"
        footer={
          <>
            <Button variant="outline" tone="neutral" label="Keep editing" />
            <Button variant="solid" tone="danger" label="Discard" />
          </>
        }
      >
        <Input aria-label="Reason" />
      </Drawer>,
    )
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Keep editing' })),
    )
  })

  it('reads "primary" as the body first, exactly as unset', async () => {
    render(
      <Drawer defaultOpen initialFocus="primary" title="Reassign ticket">
        <Input aria-label="Assignee" />
      </Drawer>,
    )
    await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox')))
  })

  it('traps the tab loop inside the panel', async () => {
    render(
      <>
        <Button label="Behind" />
        <Drawer defaultOpen title="Reassign ticket" footer={<Button label="Reassign" />}>
          <Input aria-label="Assignee" />
        </Drawer>
      </>,
    )
    const node = panel() as HTMLElement
    await vi.waitFor(() => expect(node.contains(document.activeElement)).toBe(true))
    for (let press = 0; press < 6; press += 1) {
      await userEvent.keyboard('{Tab}')
      expect(node.contains(document.activeElement), `left the panel on tab ${press + 1}`).toBe(true)
    }
  })

  it('returns focus to whatever opened it', async () => {
    /*
     * The drawer takes no `trigger`, so this is the whole integration a screen
     * writes, and the order matters: the launcher has focus when the sheet
     * opens, and the restore records that. Focus is set explicitly, as a
     * keyboard press would set it, because WebKit follows the macOS convention
     * where a pointer press never focuses a button, so a click-opened sheet
     * would record `body`. A `defaultOpen` drawer correctly has nothing to
     * return to.
     */
    function Screen() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <Button label="Open the ticket" onClick={() => setOpen(true)} />
          <Drawer open={open} onOpenChange={setOpen} title="Ticket #4182">
            <p>body</p>
          </Drawer>
        </>
      )
    }

    render(<Screen />)
    const launcher = screen.getByRole('button', { name: 'Open the ticket' })
    launcher.focus()
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(panel()).not.toBeNull())

    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(panels()).toHaveLength(0))
    await vi.waitFor(() => expect(document.activeElement).toBe(launcher))
  })
})

/**
 * A window shorter than the drawer's content, at phone width. The body is the
 * part that scrolls, so the header and the footer stay inside the panel and the
 * panel inside the window. A description too long for the panel cannot shrink,
 * so the panel scrolls instead, and both of its ends stay in reach.
 */
describe('a window shorter than the content, at phone width', () => {
  const SENTENCE =
    'A body long enough to scroll keeps its title and its actions in place, so the reader can still close the drawer or act on it.'
  const LONG_BODY = Array.from({ length: 60 }, (_, at) => `Paragraph ${at + 1}. ${SENTENCE}`)
  const LONG_DESCRIPTION = Array.from({ length: 30 }, () => SENTENCE).join(' ')

  afterEach(async () => {
    await page.viewport(1280, 800)
  })

  const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)))
  const open = () => panel() as HTMLElement
  const part = (name: 'body' | 'footer' | 'close') =>
    open().querySelector(`[data-dialog-part="${name}"]`) as HTMLElement
  const title = () => open().querySelector('h2') as HTMLElement

  /** The panel's box once the slide-in has ended: the same on two frames in a row. */
  const settled = () =>
    vi.waitFor(async () => {
      const before = open().getBoundingClientRect()
      await frame()
      await frame()
      const after = open().getBoundingClientRect()
      expect(after.toJSON(), 'the panel is still moving').toEqual(before.toJSON())
      return after
    })

  interface Box {
    top: number
    left: number
    bottom: number
    right: number
  }

  /** `inner` lies inside `outer`, to half a pixel. */
  function within(inner: Box, outer: Box, what: string) {
    expect(inner.top, `${what}: top`).toBeGreaterThanOrEqual(outer.top - 0.5)
    expect(inner.left, `${what}: left`).toBeGreaterThanOrEqual(outer.left - 0.5)
    expect(inner.bottom, `${what}: bottom`).toBeLessThanOrEqual(outer.bottom + 0.5)
    expect(inner.right, `${what}: right`).toBeLessThanOrEqual(outer.right + 0.5)
  }

  const windowBox = (): Box => ({
    top: 0,
    left: 0,
    bottom: window.innerHeight,
    right: window.innerWidth,
  })

  async function drawer(props: Partial<DrawerProps>, paragraphs: readonly string[]) {
    await page.viewport(375, 600)
    render(
      <Drawer defaultOpen title="Filters" footer={<Button label="Apply" />} {...props}>
        {paragraphs.map((text, at) => (
          <p key={at}>{text}</p>
        ))}
      </Drawer>,
    )
    await vi.waitFor(() => expect(panel()).not.toBeNull())
    return settled()
  }

  for (const side of ['end', 'start', 'bottom'] as const) {
    for (const size of ['sm', 'md', 'lg'] as const) {
      it(`keeps a ${size} ${side} drawer with a long body inside the window, and scrolls the body`, async () => {
        const box = await drawer({ side, size }, LONG_BODY)
        within(box, windowBox(), 'the panel')
        within(title().getBoundingClientRect(), box, 'the title')
        within(part('close').getBoundingClientRect(), box, 'the close button')
        within(part('footer').getBoundingClientRect(), box, 'the footer')
        expect(open().scrollHeight, 'the panel overflows').toBeLessThanOrEqual(
          open().clientHeight + 1,
        )
        expect(part('body').scrollHeight, 'the body does not scroll').toBeGreaterThan(
          part('body').clientHeight,
        )
      })
    }

    it(`keeps a ${side} drawer with a long description inside the window, with both ends in reach`, async () => {
      const box = await drawer({ side, description: LONG_DESCRIPTION }, ['One short paragraph.'])
      within(box, windowBox(), 'the panel')
      expect(open().scrollHeight, 'the panel does not scroll').toBeGreaterThan(open().clientHeight)
      open().scrollTop = 0
      await vi.waitFor(() => within(title().getBoundingClientRect(), box, 'the title, scrolled to'))
      open().scrollTop = open().scrollHeight
      await vi.waitFor(() =>
        within(part('footer').getBoundingClientRect(), box, 'the footer, scrolled to'),
      )
    })
  }
})

/**
 * An agent closes a drawer through the bridge, as the spec's `agent` fence declares
 * (`design/components/drawer.md`, Agent): through the member's own open state, so `onOpenChange`
 * reports it, and never a forced choice, which waits for a choice among its own actions.
 */
describe('an agent', () => {
  it('is refused by a forced choice, and nothing is reported', async () => {
    const bridge = createAgentBridge()
    try {
      const onOpenChange = vi.fn()
      render(
        <Drawer title="Handover" dismissible={false} open onOpenChange={onOpenChange}>
          <p>Body.</p>
        </Drawer>,
      )
      const [forced] = bridge.snapshot().members.filter((member) => member.member === 'Drawer')
      expect(forced).toMatchObject({ name: 'Handover', state: { open: true } })
      const refused = await bridge.act([{ id: forced?.id, action: 'close' }])
      expect(refused.results[0]).toMatchObject({
        ok: false,
        error: {
          code: 'failed',
          message: 'close failed: The drawer asks for a choice among its own actions.',
        },
      })
      expect(onOpenChange).not.toHaveBeenCalled()
    } finally {
      bridge.dispose()
    }
  })

  it('closes an uncontrolled drawer as its close control does', async () => {
    const bridge = createAgentBridge()
    try {
      const onOpenChange = vi.fn()
      render(
        <Drawer title="Ticket" defaultOpen onOpenChange={onOpenChange}>
          <p>Body.</p>
        </Drawer>,
      )
      const [member] = bridge.snapshot().members.filter((each) => each.member === 'Drawer')
      const { results } = await bridge.act([{ id: member?.id, action: 'close' }])
      expect(results[0]).toMatchObject({ ok: true, changed: { open: { from: true, to: false } } })
      expect(onOpenChange).toHaveBeenCalledWith(false)
      await vi.waitFor(() => expect(document.querySelector('[data-member="drawer"]')).toBeNull())
    } finally {
      bridge.dispose()
    }
  })
})
