import { render, screen } from '@testing-library/react'
import { useState } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { TAB_PASSES_BUTTONS } from '@polymorph/conformance/engines'
import { assertGoverned, DATA_ATTRS } from '@polymorph/react'
import { createAgentBridge } from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'
import { Button } from '../controls/Button'
import { Collapsible, type CollapsibleProps } from './Collapsible'

/**
 * Collapsible, in a real browser.
 *
 * The tests cover how it differs from Accordion (no list, no heading, a trigger
 * as wide as its label) and that a closed region holds nothing focusable, which
 * needs a real tab order.
 */

beforeAll(installTestTheme)

const trigger = () => screen.getByRole('button', { name: 'Advanced options' })

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<CollapsibleProps>(true)
  })
})

describe('one trigger, one region', () => {
  it('opens and closes on the trigger, reporting state on every part', async () => {
    const { container } = render(
      <Collapsible label="Advanced options">Retries follow the backoff schedule.</Collapsible>,
    )
    const root = container.firstElementChild as HTMLElement

    expect(root.dataset['state']).toBe('closed')
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('Retries follow the backoff schedule.')).toBeNull()

    await userEvent.click(trigger())
    expect(root.dataset['state']).toBe('open')
    expect(trigger().getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Retries follow the backoff schedule.')).toBeTruthy()
    expect(trigger().getAttribute('aria-controls')).toBeTruthy()
  })

  it('follows a controlled `open` without owning it', async () => {
    const onOpenChange = vi.fn()
    render(
      <Collapsible label="Advanced options" open={false} onOpenChange={onOpenChange}>
        Payload
      </Collapsible>,
    )
    await userEvent.click(trigger())
    expect(onOpenChange).toHaveBeenCalledWith(true)
    // Controlled: nothing opens until the owner re-renders.
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
  })
})

describe('not an Accordion of one', () => {
  it('renders no list and no heading, leaving the outline to the page', () => {
    render(<Collapsible label="Advanced options">Payload</Collapsible>)
    expect(screen.queryAllByRole('list')).toHaveLength(0)
    expect(screen.queryAllByRole('heading')).toHaveLength(0)
  })

  it('sizes the trigger to its label, not to the region', async () => {
    render(
      <Collapsible label="Advanced options" defaultOpen>
        A paragraph considerably wider than the words on the trigger, and then some more of it, so
        the region is unambiguously the widest thing in the root.
      </Collapsible>,
    )
    const button = trigger()
    const region = document.getElementById(button.getAttribute('aria-controls') as string)
    expect(region).toBeTruthy()
    expect(button.getBoundingClientRect().width).toBeLessThan(
      (region as HTMLElement).getBoundingClientRect().width / 2,
    )
  })
})

describe('nothing focusable hides inside a closed region', () => {
  it.skipIf(TAB_PASSES_BUTTONS)(
    'keeps a button in closed content out of the tab order entirely',
    async () => {
      render(
        <>
          <Collapsible label="Advanced options">
            <Button label="Rotate signing secret" variant="ghost" tone="neutral" />
          </Collapsible>
          <Button label="After" variant="ghost" tone="neutral" />
        </>,
      )
      expect(screen.queryByRole('button', { name: 'Rotate signing secret' })).toBeNull()

      trigger().focus()
      await userEvent.keyboard('{Tab}')
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'After' }))
    },
  )
})

/**
 * `keepMounted` keeps the closed region's content in the document, `hidden`,
 * so a page's server markup carries it (`design/components/collapsible.md`,
 * API). The default leaves it out, as the tests above assume.
 */
describe('keepMounted', () => {
  /*
   * The temperament is set explicitly, because the close assertions depend on
   * a motion duration, and an inherited attribute would depend on the previous
   * test file.
   */
  beforeEach(() => {
    document.documentElement.setAttribute(DATA_ATTRS.motion, 'standard')
  })

  afterEach(() => {
    document.documentElement.removeAttribute(DATA_ATTRS.motion)
  })

  /** A field that loses what was typed in it if a close unmounts it. */
  function Draft() {
    const [text, setText] = useState('')
    return (
      <input aria-label="Secret" value={text} onChange={(event) => setText(event.target.value)} />
    )
  }

  /** The region: the root's second child, after the trigger. */
  const regionOf = (within: ParentNode = document) =>
    within.querySelector<HTMLElement>('[data-member="collapsible"] > button + *') as HTMLElement

  /**
   * Whether the region is hidden and animating when it closes, read in the
   * task that closes it, as Accordion's test reads it.
   */
  function whenClosed(element: HTMLElement) {
    return new Promise<{ hidden: boolean; animating: boolean }>((done) => {
      const observer = new MutationObserver(() => {
        if (element.getAttribute('data-state') !== 'closed') return
        observer.disconnect()
        done({
          hidden: element.hidden,
          animating: element.getAnimations().some((animation) => animation.playState === 'running'),
        })
      })
      observer.observe(element, { attributes: true, attributeFilter: ['data-state'] })
    })
  }

  it('keeps the closed content in the DOM, out of the layout, the focus order and the tree', () => {
    render(
      <Collapsible label="Advanced options" keepMounted>
        <Button label="Rotate signing secret" variant="ghost" tone="neutral" />
      </Collapsible>,
    )
    const region = regionOf()
    expect(region.dataset['state']).toBe('closed')
    expect(region.hidden, 'a kept region must hide itself').toBe(true)
    expect(getComputedStyle(region).display).toBe('none')
    // Hidden from the first render, so no close animation plays on mount.
    expect(region.getAnimations()).toHaveLength(0)

    const kept = region.querySelector('button') as HTMLElement
    expect(kept.textContent).toContain('Rotate signing secret')
    expect(screen.queryByRole('button', { name: 'Rotate signing secret' })).toBeNull()
    kept.focus()
    expect(document.activeElement).not.toBe(kept)
  })

  it('shows the content when it opens, then hides it after the close animation', async () => {
    render(
      <Collapsible label="Advanced options" keepMounted>
        Retries follow the backoff schedule.
      </Collapsible>,
    )
    const region = regionOf()

    await userEvent.click(trigger())
    expect(region.hidden).toBe(false)
    expect(trigger().getAttribute('aria-controls')).toBe(region.id)
    // The open keyframes read the height Radix measured once the region was shown.
    expect(region.style.getPropertyValue('--radix-collapsible-content-height')).toMatch(/px$/)

    const closing = whenClosed(region)
    await userEvent.click(trigger())
    // Closed, and still in view: the recipe's close keyframes are running on it.
    expect(await closing).toEqual({ hidden: false, animating: true })
    await vi.waitFor(() => expect(region.hidden).toBe(true), { timeout: 3_000 })
    expect(region.textContent).toContain('Retries follow the backoff schedule.')
  })

  it('hides the closing content when no animation runs, at the `none` temperament', async () => {
    document.documentElement.setAttribute(DATA_ATTRS.motion, 'none')
    render(
      <Collapsible label="Advanced options" keepMounted defaultOpen>
        Retries follow the backoff schedule.
      </Collapsible>,
    )
    const region = regionOf()
    expect(region.hidden).toBe(false)

    await userEvent.click(trigger())
    await vi.waitFor(() => expect(region.hidden).toBe(true))
  })

  it('keeps what a reader typed through a close and an open', async () => {
    render(
      <Collapsible label="Advanced options" keepMounted>
        <Draft />
      </Collapsible>,
    )
    await userEvent.click(trigger())
    await userEvent.click(screen.getByLabelText('Secret'))
    await userEvent.keyboard('half-typed secret')

    await userEvent.click(trigger())
    await vi.waitFor(() => expect(regionOf().hidden).toBe(true))
    await userEvent.click(trigger())
    expect((screen.getByLabelText('Secret') as HTMLInputElement).value).toBe('half-typed secret')
  })

  it('leaves closed content out by default, and loses what was typed in it', async () => {
    render(
      <Collapsible label="Advanced options">
        <Draft />
      </Collapsible>,
    )
    expect(screen.queryByLabelText('Secret')).toBeNull()

    await userEvent.click(trigger())
    await userEvent.click(screen.getByLabelText('Secret'))
    await userEvent.keyboard('half-typed secret')
    await userEvent.click(trigger())
    await vi.waitFor(() => expect(screen.queryByLabelText('Secret')).toBeNull())
    await userEvent.click(trigger())
    expect((screen.getByLabelText('Secret') as HTMLInputElement).value).toBe('')
  })

  it('puts the closed content in the server markup, hidden, and hydrates it with no mismatch', async () => {
    const content = 'Retries follow the backoff schedule.'
    const element = (keepMounted: boolean) => (
      <Collapsible label="Advanced options" keepMounted={keepMounted}>
        {content}
      </Collapsible>
    )
    expect(renderToString(element(false))).not.toContain(content)

    const host = document.createElement('div')
    host.innerHTML = renderToString(element(true))
    document.body.append(host)
    const served = regionOf(host)
    expect(served.textContent).toBe(content)
    expect(served.hasAttribute('hidden')).toBe(true)

    const reported: string[] = []
    const error = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      reported.push(args.map(String).join(' '))
    })
    const hydrated = hydrateRoot(host, element(true), {
      onRecoverableError: (failure) => reported.push(String(failure)),
    })
    try {
      // React hydrates the root before it handles a press on it.
      await userEvent.click(host.querySelector('button') as HTMLElement)
      await vi.waitFor(() => expect(served.hidden).toBe(false))
      // React kept the server's region and reported no mismatch.
      expect(regionOf(host)).toBe(served)
      expect(reported).toEqual([])
    } finally {
      error.mockRestore()
      hydrated.unmount()
      host.remove()
    }
  })
})

/**
 * An agent opens and closes the region through the bridge, as the spec's `agent` fence declares
 * (`design/components/collapsible.md`, Agent). The member holds its open state, so an action
 * reaches the region whether or not the caller controls it.
 */
describe('an agent', () => {
  it('opens and closes an uncontrolled and a controlled Collapsible', async () => {
    const bridge = createAgentBridge()
    try {
      const free = vi.fn()
      const held = vi.fn()
      function Held() {
        const [open, setOpen] = useState(true)
        return (
          <Collapsible
            label="Raw payload"
            open={open}
            onOpenChange={(next) => {
              held(next)
              setOpen(next)
            }}
          >
            The payload.
          </Collapsible>
        )
      }
      render(
        <>
          <Collapsible label="Advanced options" onOpenChange={free}>
            Retries follow the backoff schedule.
          </Collapsible>
          <Held />
        </>,
      )
      const [one, two] = bridge.snapshot().members
      expect(one).toMatchObject({ member: 'Collapsible', name: 'Advanced options' })
      expect(one?.state).toEqual({ open: false })
      expect(two?.state).toEqual({ open: true })

      const opened = await bridge.act([{ id: one?.id, action: 'open' }])
      expect(opened.results[0]).toEqual({
        ok: true,
        id: one?.id,
        changed: { open: { from: false, to: true } },
      })
      expect(free).toHaveBeenLastCalledWith(true)
      expect(trigger().getAttribute('aria-expanded')).toBe('true')

      const closed = await bridge.act([{ id: two?.id, action: 'close' }])
      expect(closed.results[0]).toMatchObject({
        ok: true,
        changed: { open: { from: true, to: false } },
      })
      expect(held).toHaveBeenLastCalledWith(false)
      const payload = screen.getByRole('button', { name: 'Raw payload' })
      await vi.waitFor(() => expect(payload.getAttribute('aria-expanded')).toBe('false'))

      // Opening an open region reports nothing.
      await bridge.act([{ id: one?.id, action: 'open' }])
      expect(free).toHaveBeenCalledTimes(1)
    } finally {
      bridge.dispose()
    }
  })

  it('keeps a controlled Collapsible on the state its caller passes back', async () => {
    const bridge = createAgentBridge()
    try {
      const onOpenChange = vi.fn()
      render(
        <Collapsible label="Advanced options" open={false} onOpenChange={onOpenChange}>
          Retries follow the backoff schedule.
        </Collapsible>,
      )
      const [member] = bridge.snapshot().members
      const { results } = await bridge.act([{ id: member?.id, action: 'open' }])
      expect(results[0]).toEqual({ ok: true, id: member?.id, changed: {} })
      expect(onOpenChange).toHaveBeenCalledWith(true)
      expect(trigger().getAttribute('aria-expanded')).toBe('false')
    } finally {
      bridge.dispose()
    }
  })
})
