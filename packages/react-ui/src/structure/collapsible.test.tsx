import { render, screen } from '@testing-library/react'
import { useState } from 'react'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { TAB_PASSES_BUTTONS } from '@polymorph/conformance/engines'
import { assertGoverned } from '@polymorph/react'
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
