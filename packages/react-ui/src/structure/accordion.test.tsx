import { render, screen } from '@testing-library/react'
import { useState } from 'react'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { createAgentBridge } from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'
import { Accordion, type AccordionProps } from './Accordion'

/**
 * Accordion, in a real browser.
 *
 * Radix owns the keyboard model and region wiring. These tests cover what this
 * repo decides: Radix's attributes pass through unwrapped, the header is a real
 * heading at the requested level, and a closed row holds nothing focusable.
 */

beforeAll(installTestTheme)

const ITEMS = [
  { value: 'delivery', label: 'When will my order arrive?', content: 'Two to four days.' },
  { value: 'returns', label: 'How do returns work?', content: 'Thirty days, no reason needed.' },
  { value: 'sizing', label: 'Do these run large?', content: 'True to size.' },
]

const rows = () => [...document.querySelectorAll('[data-state]')]
const openRows = () => [...document.querySelectorAll('[data-state="open"]')]

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<AccordionProps>(true)
  })
})

describe('disclosure', () => {
  it('opens the row that was pressed, and closes it again', async () => {
    render(<Accordion items={ITEMS} />)
    const trigger = screen.getByRole('button', { name: 'How do returns work?' })

    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    await userEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Thirty days, no reason needed.')).toBeTruthy()

    // `collapsible` defaults to true, so the list may be shut again.
    await userEvent.click(trigger)
    await vi.waitFor(() => expect(trigger.getAttribute('aria-expanded')).toBe('false'))
  })

  it('keeps one row open at a time by default', async () => {
    render(<Accordion items={ITEMS} defaultValue="delivery" />)
    await userEvent.click(screen.getByRole('button', { name: 'Do these run large?' }))

    const expanded = screen
      .getAllByRole('button')
      .filter((node) => node.getAttribute('aria-expanded') === 'true')
    expect(expanded.map((node) => node.textContent)).toEqual(['Do these run large?'])
  })

  it('keeps several rows open when type is multiple', () => {
    render(<Accordion type="multiple" items={ITEMS} defaultValue={['delivery', 'sizing']} />)
    // Item, header and content each carry the state, which is why this counts
    // triggers rather than nodes.
    const expanded = screen
      .getAllByRole('button')
      .filter((node) => node.getAttribute('aria-expanded') === 'true')
    expect(expanded).toHaveLength(2)
    expect(openRows().length).toBeGreaterThan(2)
  })

  it('surfaces Radix’s own state attributes, with no translation layer', () => {
    render(<Accordion items={ITEMS} defaultValue="delivery" />)
    const root = document.querySelector('[data-orientation]') as HTMLElement
    expect(root.dataset['orientation']).toBe('vertical')
    expect(rows().length).toBeGreaterThan(0)
    expect(openRows().length).toBeGreaterThan(0)
  })

  it('does not open a disabled row, and marks it disabled', async () => {
    render(
      <Accordion
        items={ITEMS.map((item, index) => (index === 1 ? { ...item, disabled: true } : item))}
      />,
    )
    const trigger = screen.getByRole('button', { name: 'How do returns work?' })
    expect(trigger.hasAttribute('data-disabled')).toBe(true)

    await userEvent.click(trigger, { force: true })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })
})

describe('heading structure', () => {
  it('puts every trigger inside a real heading', () => {
    render(<Accordion items={ITEMS} />)
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(3)
  })

  it('uses h4 headings when headingLevel is 4', () => {
    render(<Accordion items={ITEMS} headingLevel={4} />)
    expect(screen.getAllByRole('heading', { level: 4 })).toHaveLength(3)
    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0)
  })

  it('labels an open panel with the row that opened it', () => {
    render(<Accordion items={ITEMS} defaultValue="delivery" />)
    const region = screen.getByRole('region')
    const trigger = screen.getByRole('button', { name: 'When will my order arrive?' })
    expect(region.getAttribute('aria-labelledby')).toBe(trigger.id)
  })

  it('hides nothing focusable inside a closed row', () => {
    render(
      <Accordion
        items={[
          {
            value: 'links',
            label: 'Anything focusable in here?',
            content: <a href="#somewhere">A link nobody can see</a>,
          },
        ]}
      />,
    )
    expect(screen.queryByRole('link')).toBeNull()
  })
})

describe('the keyboard model from Radix', () => {
  it('moves between triggers with the arrow keys', async () => {
    render(<Accordion items={ITEMS} />)
    const [first, second] = screen.getAllByRole('button')
    ;(first as HTMLElement).focus()

    await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(second)

    await userEvent.keyboard('{End}')
    expect(document.activeElement).toBe(screen.getAllByRole('button').at(-1))
  })
})

/**
 * An agent expands and collapses items by their ids through the bridge, as the spec's `agent`
 * fence declares (`design/components/accordion.md`, Agent). The member holds the open items, so
 * an action reaches the list whether or not the caller controls the value.
 */
describe('an agent', () => {
  const expanded = (name: string) =>
    screen.getByRole('button', { name }).getAttribute('aria-expanded')

  it('expands and collapses in an uncontrolled and a controlled accordion', async () => {
    const bridge = createAgentBridge()
    try {
      const free = vi.fn()
      const held = vi.fn()
      function Held() {
        const [value, setValue] = useState<string[]>(['sizing'])
        return (
          <Accordion
            type="multiple"
            items={ITEMS.map((item) => ({ ...item, label: `${item.label} (held)` }))}
            value={value}
            onValueChange={(next) => {
              held(next)
              setValue(next)
            }}
          />
        )
      }
      render(
        <>
          <Accordion items={ITEMS} onValueChange={free} />
          <Held />
        </>,
      )
      const [one, two] = bridge.snapshot().members
      expect(one).toMatchObject({
        member: 'Accordion',
        state: {
          value: [],
          items: [
            { id: 'delivery', label: 'When will my order arrive?' },
            { id: 'returns', label: 'How do returns work?' },
            { id: 'sizing', label: 'Do these run large?' },
          ],
        },
      })
      expect(two?.state['value']).toEqual(['sizing'])

      const opened = await bridge.act([{ id: one?.id, action: 'expand', value: 'returns' }])
      expect(opened.results[0]).toEqual({
        ok: true,
        id: one?.id,
        changed: { value: { from: [], to: ['returns'] } },
      })
      expect(free).toHaveBeenLastCalledWith('returns')
      expect(expanded('How do returns work?')).toBe('true')

      // A single accordion's expand replaces the open item.
      await bridge.act([{ id: one?.id, action: 'expand', value: 'delivery' }])
      expect(free).toHaveBeenLastCalledWith('delivery')
      expect(expanded('How do returns work?')).toBe('false')

      const added = await bridge.act([{ id: two?.id, action: 'expand', value: 'delivery' }])
      expect(added.results[0]).toMatchObject({
        ok: true,
        changed: { value: { from: ['sizing'], to: ['sizing', 'delivery'] } },
      })
      expect(held).toHaveBeenLastCalledWith(['sizing', 'delivery'])
      expect(expanded('When will my order arrive? (held)')).toBe('true')

      const closed = await bridge.act([{ id: two?.id, action: 'collapse', value: 'sizing' }])
      expect(closed.results[0]).toMatchObject({
        ok: true,
        changed: { value: { from: ['sizing', 'delivery'], to: ['delivery'] } },
      })
      await vi.waitFor(() => expect(expanded('Do these run large? (held)')).toBe('false'))
    } finally {
      bridge.dispose()
    }
  })

  it('keeps a controlled accordion on the value its caller passes back', async () => {
    const bridge = createAgentBridge()
    try {
      const onValueChange = vi.fn()
      render(<Accordion items={ITEMS} value="delivery" onValueChange={onValueChange} />)
      const [member] = bridge.snapshot().members
      const { results } = await bridge.act([{ id: member?.id, action: 'expand', value: 'sizing' }])
      expect(results[0]).toEqual({ ok: true, id: member?.id, changed: {} })
      expect(onValueChange).toHaveBeenCalledWith('sizing')
      expect(expanded('When will my order arrive?')).toBe('true')
    } finally {
      bridge.dispose()
    }
  })

  it('refuses a disabled item, and the open item of an accordion that is not collapsible', async () => {
    const bridge = createAgentBridge()
    try {
      const onValueChange = vi.fn()
      render(
        <Accordion
          items={ITEMS.map((item, index) => (index === 1 ? { ...item, disabled: true } : item))}
          collapsible={false}
          defaultValue="delivery"
          onValueChange={onValueChange}
        />,
      )
      const [member] = bridge.snapshot().members
      expect(member?.state['items']).toContainEqual({
        id: 'returns',
        label: 'How do returns work?',
        disabled: true,
      })
      const disabled = await bridge.act([{ id: member?.id, action: 'expand', value: 'returns' }])
      expect(disabled.results[0]).toMatchObject({ ok: false, error: { code: 'invalid-value' } })
      const kept = await bridge.act([{ id: member?.id, action: 'collapse', value: 'delivery' }])
      expect(kept.results[0]).toMatchObject({ ok: false, error: { code: 'failed' } })
      expect(onValueChange).not.toHaveBeenCalled()
      expect(expanded('When will my order arrive?')).toBe('true')
    } finally {
      bridge.dispose()
    }
  })
})
