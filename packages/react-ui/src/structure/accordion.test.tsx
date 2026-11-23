import { render, screen } from '@testing-library/react'
import { useState } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { assertGoverned, DATA_ATTRS } from '@polymorph/react'
import { createAgentBridge } from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'
import { Accordion, type AccordionProps } from './Accordion'

/**
 * Accordion, in a real browser.
 *
 * Radix owns the keyboard model and region wiring. These tests cover what this
 * repo decides: Radix's attributes pass through unwrapped, the header is a real
 * heading at the requested level, a closed row holds nothing focusable, and
 * `keepMounted` keeps a closed row's content in the document, hidden.
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

/**
 * `keepMounted` keeps a closed item's content in the document, `hidden`, so a
 * page's server markup carries every answer (`design/components/accordion.md`,
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
      <input aria-label="Note" value={text} onChange={(event) => setText(event.target.value)} />
    )
  }

  const region = (text: string, within: ParentNode = document) =>
    [...within.querySelectorAll<HTMLElement>('[data-accordion-part="region"]')].find((element) =>
      element.textContent?.includes(text),
    ) as HTMLElement

  /**
   * Whether a region is hidden and animating when it closes. It is read in the
   * task that closes it: a read after the click returns can come after the
   * animation has ended when the whole suite runs.
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

  it('keeps every closed answer in the DOM, out of the layout, the focus order and the tree', () => {
    render(
      <Accordion
        keepMounted
        items={[
          ...ITEMS,
          {
            value: 'links',
            label: 'Anything focusable in here?',
            content: <a href="#somewhere">A link nobody can see</a>,
          },
        ]}
      />,
    )
    for (const item of ITEMS) {
      const closed = region(item.content)
      expect(closed.dataset['state']).toBe('closed')
      expect(closed.hidden, 'a kept region must hide itself').toBe(true)
      expect(getComputedStyle(closed).display).toBe('none')
      // Hidden from the first render, so no close animation plays on mount.
      expect(closed.getAnimations()).toHaveLength(0)
    }
    expect(screen.queryAllByRole('region')).toHaveLength(0)

    const link = document.querySelector<HTMLElement>('a[href="#somewhere"]') as HTMLElement
    expect(link).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
    link.focus()
    expect(document.activeElement).not.toBe(link)
  })

  it('shows an answer when its row opens, then hides it after the close animation', async () => {
    render(<Accordion keepMounted items={ITEMS} />)
    const answer = region('Thirty days')
    const trigger = screen.getByRole('button', { name: 'How do returns work?' })

    await userEvent.click(trigger)
    expect(answer.hidden).toBe(false)
    expect(screen.getByRole('region')).toBe(answer)
    // The open keyframes read the height Radix measured once the region was shown.
    expect(answer.style.getPropertyValue('--radix-collapsible-content-height')).toMatch(/px$/)

    const closing = whenClosed(answer)
    await userEvent.click(trigger)
    // Closed, and still in view: the recipe's close keyframes are running on it.
    expect(await closing).toEqual({ hidden: false, animating: true })
    await vi.waitFor(() => expect(answer.hidden).toBe(true), { timeout: 3_000 })
    expect(answer.textContent).toContain('Thirty days')
  })

  it('hides a closing answer when no animation runs, at the `none` temperament', async () => {
    document.documentElement.setAttribute(DATA_ATTRS.motion, 'none')
    render(<Accordion keepMounted items={ITEMS} defaultValue="delivery" />)
    const answer = region('Two to four')
    expect(answer.hidden).toBe(false)

    await userEvent.click(screen.getByRole('button', { name: 'When will my order arrive?' }))
    await vi.waitFor(() => expect(answer.hidden).toBe(true))
  })

  it('keeps what a reader typed through a close and an open', async () => {
    render(
      <Accordion
        keepMounted
        items={[{ value: 'note', label: 'Add a note', content: <Draft /> }]}
      />,
    )
    const trigger = screen.getByRole('button', { name: 'Add a note' })
    await userEvent.click(trigger)
    await userEvent.click(screen.getByLabelText('Note'))
    await userEvent.keyboard('half-written note')

    await userEvent.click(trigger)
    await vi.waitFor(() => expect(trigger.getAttribute('aria-expanded')).toBe('false'))
    await userEvent.click(trigger)
    expect((screen.getByLabelText('Note') as HTMLInputElement).value).toBe('half-written note')
  })

  it('leaves closed content out by default, and loses what was typed in it', async () => {
    render(<Accordion items={[{ value: 'note', label: 'Add a note', content: <Draft /> }]} />)
    const trigger = screen.getByRole('button', { name: 'Add a note' })
    expect(screen.queryByLabelText('Note')).toBeNull()

    await userEvent.click(trigger)
    await userEvent.click(screen.getByLabelText('Note'))
    await userEvent.keyboard('half-written note')
    await userEvent.click(trigger)
    await vi.waitFor(() => expect(screen.queryByLabelText('Note')).toBeNull())
    await userEvent.click(trigger)
    expect((screen.getByLabelText('Note') as HTMLInputElement).value).toBe('')
  })

  it('puts every closed answer in the server markup, hidden, and hydrates it with no mismatch', async () => {
    expect(renderToString(<Accordion items={ITEMS} />)).not.toContain('Thirty days')

    const host = document.createElement('div')
    host.innerHTML = renderToString(<Accordion keepMounted items={ITEMS} />)
    document.body.append(host)
    for (const item of ITEMS) expect(region(item.content, host).hasAttribute('hidden')).toBe(true)

    const reported: string[] = []
    const error = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      reported.push(args.map(String).join(' '))
    })
    const served = region('Thirty days', host)
    const hydrated = hydrateRoot(host, <Accordion keepMounted items={ITEMS} />, {
      onRecoverableError: (failure) => reported.push(String(failure)),
    })
    try {
      // React hydrates the root before it handles a press on it.
      const trigger = [...host.querySelectorAll('button')].find(
        (button) => button.textContent === 'How do returns work?',
      ) as HTMLElement
      await userEvent.click(trigger)
      await vi.waitFor(() => expect(served.hidden).toBe(false))
      // React kept the server's region and reported no mismatch.
      expect(region('Thirty days', host)).toBe(served)
      expect(reported).toEqual([])
    } finally {
      error.mockRestore()
      hydrated.unmount()
      host.remove()
    }
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
