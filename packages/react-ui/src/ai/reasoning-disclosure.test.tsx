import { render, screen } from '@testing-library/react'
import { useState } from 'react'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { createAgentBridge } from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'
import { ReasoningDisclosure, type ReasoningDisclosureProps } from './ReasoningDisclosure'

/**
 * ReasoningDisclosure, in a real browser.
 *
 * Collapsible's own tests cover the disclosure behaviour: one trigger, one
 * region, and nothing focusable inside a closed region. These tests cover the
 * status. "Still thinking" reaches a reader as a busy root and a spinning
 * mark, and the trigger shows the app's text unchanged.
 */

beforeAll(installTestTheme)

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<ReasoningDisclosureProps>(true)
  })
})

describe('a disclosure with a status', () => {
  it('opens and closes on the trigger, which shows the app’s text', async () => {
    const { container } = render(
      <ReasoningDisclosure label="Thought for 12 seconds">The working.</ReasoningDisclosure>,
    )
    const root = container.firstElementChild as HTMLElement
    const trigger = screen.getByRole('button', { name: 'Thought for 12 seconds' })
    expect(root.dataset['state']).toBe('closed')
    expect(screen.queryByText('The working.')).toBeNull()

    await userEvent.click(trigger)
    expect(root.dataset['state']).toBe('open')
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('The working.')).toBeTruthy()
  })

  it('reports thinking once, on the root, and spins the mark', () => {
    const { container } = render(
      <ReasoningDisclosure label="Thinking…" streaming>
        So far.
      </ReasoningDisclosure>,
    )
    const root = container.firstElementChild as HTMLElement
    expect(root.getAttribute('aria-busy')).toBe('true')
    expect(root.hasAttribute('data-streaming')).toBe(true)
    const mark = root.querySelector('button span') as HTMLElement
    expect(getComputedStyle(mark).animationName).not.toBe('none')
  })

  it('stops spinning once the thinking is done', () => {
    const { container } = render(
      <ReasoningDisclosure label="Thought for 2 seconds">Done.</ReasoningDisclosure>,
    )
    const root = container.firstElementChild as HTMLElement
    expect(root.hasAttribute('aria-busy')).toBe(false)
    const mark = root.querySelector('button span') as HTMLElement
    expect(getComputedStyle(mark).animationName).toBe('none')
  })

  it('adds no heading and no list, because the reply owns its outline', () => {
    render(<ReasoningDisclosure label="Thought for 2 seconds">Done.</ReasoningDisclosure>)
    expect(screen.queryAllByRole('heading')).toHaveLength(0)
    expect(screen.queryAllByRole('list')).toHaveLength(0)
  })
})

/**
 * An agent expands and collapses the reasoning (`design/components/reasoning-disclosure.md`,
 * Agent) through the member's own open state, so `onOpenChange` reports it in both forms.
 */
describe('an agent', () => {
  it('expands an uncontrolled and a controlled disclosure through its own open state', async () => {
    const free = vi.fn()
    const held = vi.fn()
    function Held() {
      const [open, setOpen] = useState(true)
      return (
        <ReasoningDisclosure
          label="Thought for 4 seconds"
          open={open}
          onOpenChange={(next) => {
            held(next)
            setOpen(next)
          }}
        >
          Held.
        </ReasoningDisclosure>
      )
    }
    render(
      <>
        <ReasoningDisclosure label="Thinking…" streaming onOpenChange={free}>
          Free.
        </ReasoningDisclosure>
        <Held />
      </>,
    )
    const bridge = createAgentBridge()
    try {
      const [one, two] = bridge.snapshot().members
      expect(one).toMatchObject({
        member: 'ReasoningDisclosure',
        name: 'Thinking…',
        state: { expanded: false, streaming: true },
      })
      expect(two).toMatchObject({ name: 'Thought for 4 seconds', state: { expanded: true } })
      const expanded = await bridge.act([{ id: one?.id, action: 'expand' }])
      expect(expanded.results[0]).toMatchObject({
        ok: true,
        changed: { expanded: { from: false, to: true } },
      })
      expect(free).toHaveBeenCalledWith(true)
      expect(screen.getByRole('button', { name: 'Thinking…' }).getAttribute('aria-expanded')).toBe(
        'true',
      )
      const collapsed = await bridge.act([{ id: two?.id, action: 'collapse' }])
      expect(collapsed.results[0]).toMatchObject({
        ok: true,
        changed: { expanded: { from: true, to: false } },
      })
      expect(held).toHaveBeenCalledWith(false)
    } finally {
      bridge.dispose()
    }
  })
})
