import { render, screen } from '@testing-library/react'
import { useState } from 'react'
import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { SCROLLBARS_ARE_HIDDEN } from '@polymorph/conformance/engines'
import { createAgentBridge } from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'
import { tokenColor, tokenLength } from '../controls/token-probe'
import { Tabs, type TabsProps } from './Tabs'

/**
 * A horizontal Tabs strip wider than its container (`design/components/tabs.md`).
 *
 * The recipe makes the list scroll, fades an edge with more tabs beyond it and
 * leaves room for the focus ring. The browser scrolls a tab that takes focus
 * into view, and the member brings the current tab inside the strip. These
 * tests read real scroll positions and boxes, in a container the width of a
 * phone.
 */

beforeAll(installTestTheme)

// A right-to-left test turns the whole document.
afterEach(() => {
  document.documentElement.removeAttribute('dir')
})

// Testing Library unmounts between tests but does not put focus back, and a
// key pressed from a detached node goes nowhere.
beforeEach(() => {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
})

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'activity', label: 'Activity', count: 12 },
  { value: 'members', label: 'Members' },
  { value: 'billing', label: 'Billing' },
  { value: 'integrations', label: 'Integrations' },
  { value: 'audit', label: 'Audit log' },
  { value: 'settings', label: 'Settings' },
]

const PHONE = 320

const px = (value: string) => Number.parseFloat(value)

/** The width of the edge fade, and how far a focus ring reaches past its tab. */
const fade = () => px(tokenLength('--pm-space-6'))
const reach = () => px(tokenLength('--pm-focus-offset')) + px(tokenLength('--pm-focus-width'))

function Strip({ width = PHONE, ...props }: Partial<TabsProps> & { width?: number }) {
  return (
    <div data-testid="container" style={{ width }}>
      <Tabs tabs={TABS} {...props}>
        {TABS.map((tab) => (
          <Tabs.Content key={tab.value} value={tab.value}>
            <p>{`${tab.label} panel`}</p>
          </Tabs.Content>
        ))}
      </Tabs>
    </div>
  )
}

const list = () => screen.getByRole('tablist')
const tab = (name: RegExp) => screen.getByRole('tab', { name })
const box = (element: Element) => element.getBoundingClientRect()

/** The sliding rule: the list's one child that is not a tab. */
const indicator = () => list().querySelector(':scope > :not([role="tab"])') as HTMLElement | null

/** Whether the tab is inside the strip, clear of both edge fades. */
function shown(name: RegExp) {
  const port = box(list())
  const item = box(tab(name))
  expect(item.left).toBeGreaterThanOrEqual(port.left + fade() - 1)
  expect(item.right).toBeLessThanOrEqual(port.right - fade() + 1)
}

/**
 * The list is at the end of its range. Within a pixel, because the range is
 * read from two rounded widths and the browser stops at the real one.
 */
function atEnd() {
  const range = list().scrollWidth - list().clientWidth
  expect(range).toBeGreaterThan(0)
  expect(Math.abs(Math.abs(list().scrollLeft) - range)).toBeLessThanOrEqual(1)
}

/**
 * The member has measured and placed the strip once. Its resize observer
 * reports a frame after the mount, and the rule renders from that report, so a
 * test that scrolls the list itself waits for the rule first.
 */
const placed = () => vi.waitFor(() => expect(indicator()).not.toBeNull())

/** The rule and the tab share an inline extent, to the pixel. */
async function aligned(name: RegExp) {
  await vi.waitFor(() => {
    const rule = indicator()
    expect(rule).not.toBeNull()
    expect(Math.round(box(rule as HTMLElement).left)).toBe(Math.round(box(tab(name)).left))
    expect(Math.round(box(rule as HTMLElement).width)).toBe(Math.round(box(tab(name)).width))
    // The rule is under its tab, on the strip's baseline, and not over it.
    expect(Math.round(box(rule as HTMLElement).bottom)).toBe(Math.round(box(tab(name)).bottom))
  })
}

/** The list's scroll position has stopped changing, so a smooth move is over. */
async function settled() {
  let last = Number.NaN
  await vi.waitFor(() => {
    const now = list().scrollLeft
    const still = now === last
    last = now
    expect(still).toBe(true)
  })
}

describe('Tabs wider than its container', () => {
  it('scrolls inside the container and leaves the page as wide as it was', () => {
    // The container ends at the viewport's end edge, where anything that
    // reached past it would let the page scroll sideways.
    render(
      <div style={{ position: 'absolute', insetBlockStart: 0, insetInlineEnd: 0 }}>
        <Strip />
      </div>,
    )
    const container = screen.getByTestId('container')
    expect(box(container).right).toBe(document.documentElement.clientWidth)
    expect(list().scrollWidth).toBeGreaterThan(list().clientWidth)
    expect(container.scrollWidth).toBe(container.clientWidth)
    expect(box(list()).right).toBe(box(container).right)
    expect(document.documentElement.scrollWidth).toBe(document.documentElement.clientWidth)
  })

  it('draws the baseline rule across the container, not across the tabs', () => {
    render(<Strip />)
    const root = list().parentElement as HTMLElement
    const rule = getComputedStyle(root, '::before')
    expect(px(rule.width)).toBe(PHONE)
    expect(rule.borderBottomWidth).toBe('1px')
    expect(rule.borderBottomColor).toBe(tokenColor('--pm-border-subtle'))
  })

  it('opens with the current tab inside the strip, without scrolling the page', async () => {
    // Below the fold: `scrollIntoView` would bring the page down to the strip.
    render(
      <>
        <div style={{ height: '200vh' }} />
        <Strip defaultValue="settings" />
      </>,
    )
    await vi.waitFor(() => expect(list().scrollLeft).toBeGreaterThan(0))
    // The last tab rests at the end of the scroll range.
    atEnd()
    expect(box(tab(/Settings/)).right).toBeLessThanOrEqual(box(list()).right)
    expect(window.scrollY).toBe(0)
  })

  it('brings a tab inside the strip when the value changes', async () => {
    const { rerender } = render(<Strip value="overview" />)
    await placed()
    expect(list().scrollLeft).toBe(0)
    const scrollTo = vi.spyOn(list(), 'scrollTo')

    // The caller's `value` changes with no press, and the rule follows it too.
    rerender(<Strip value="audit" />)
    await vi.waitFor(() => shown(/Audit log/))
    await aligned(/Audit log/)

    rerender(<Strip value="activity" />)
    await vi.waitFor(() => shown(/Activity/))
    await aligned(/Activity/)

    // A new value is travel, so both moves were smooth: the test theme has
    // motion, and the reader has not asked for less.
    expect(scrollTo).toHaveBeenCalledTimes(2)
    for (const [options] of scrollTo.mock.calls)
      expect(options).toMatchObject({ behavior: 'smooth' })
  })

  it('brings a pressed tab that the end edge cuts fully inside', async () => {
    render(<Strip />)
    await placed()
    const cut = TABS.find((entry) => {
      const item = box(tab(new RegExp(entry.label)))
      return item.left < box(list()).right && item.right > box(list()).right
    })
    expect(cut, 'one tab straddles the end edge').toBeDefined()
    const name = new RegExp((cut as { label: string }).label)
    const scrollTo = vi.spyOn(list(), 'scrollTo')

    // The press as the page receives it. Radix selects on the button going
    // down, and the test driver's own click would first scroll the tab into
    // view, which is the move under test.
    tab(name).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    await vi.waitFor(() => expect(tab(name).dataset['state']).toBe('active'))
    await vi.waitFor(() => shown(name))
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }))
  })

  it('leaves the strip where the reader scrolled it when a tab only changes size', async () => {
    const { rerender } = render(<Strip />)
    await placed()
    list().scrollLeft = 200
    const grown = TABS.map((entry) =>
      entry.count === undefined ? entry : { ...entry, count: 1200 },
    )
    rerender(<Strip tabs={grown} />)
    await vi.waitFor(() => expect(tab(/Activity/).textContent).toContain('1200'))
    // Two frames: a resize observer reports before the next paint.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    expect(list().scrollLeft).toBe(200)
  })

  it('places the current tab again when the container changes width', async () => {
    const { rerender } = render(<Strip width={900} defaultValue="settings" />)
    await placed()
    expect(list().scrollWidth).toBe(list().clientWidth)

    rerender(<Strip width={PHONE} defaultValue="settings" />)
    await vi.waitFor(atEnd)
  })
})

describe('Tabs wider than its container — the keyboard', () => {
  it('scrolls a tab that takes focus into view, clear of the fade', async () => {
    render(<Strip />)
    await placed()
    tab(/Overview/).focus()

    // The browser does this scroll, and the list's scroll padding places it.
    await userEvent.keyboard('{End}')
    await vi.waitFor(() => expect(document.activeElement).toBe(tab(/Settings/)))
    await vi.waitFor(atEnd)

    await userEvent.keyboard('{Home}')
    await vi.waitFor(() => expect(document.activeElement).toBe(tab(/Overview/)))
    await vi.waitFor(() => expect(list().scrollLeft).toBe(0))

    for (const entry of TABS.slice(1, 5)) {
      await userEvent.keyboard('{ArrowRight}')
      const name = new RegExp(entry.label)
      await vi.waitFor(() => expect(document.activeElement).toBe(tab(name)))
      await settled()
      shown(name)
    }
  })

  it('keeps the whole focus ring inside the list, at both ends of the strip', async () => {
    render(<Strip />)
    await placed()
    const first = tab(/Overview/)
    first.focus({ focusVisible: true } as FocusOptions)
    expect(getComputedStyle(first).outlineStyle).toBe('solid')

    // A scroll container clips at its padding edge, which is its box here: the
    // list has no border. The ring must end inside it on every side.
    const ring = reach()
    expect(box(first).left - ring).toBeGreaterThanOrEqual(box(list()).left)
    expect(box(first).top - ring).toBeGreaterThanOrEqual(box(list()).top)
    expect(box(first).bottom + ring).toBeLessThanOrEqual(box(list()).bottom)

    await userEvent.keyboard('{End}')
    const last = tab(/Settings/)
    await vi.waitFor(() => expect(document.activeElement).toBe(last))
    await settled()
    expect(box(last).right + ring).toBeLessThanOrEqual(box(list()).right)
  })

  it('keeps the triggers where a strip that fits has them', () => {
    // The room for the ring is padding the list takes back with margins, so the
    // first tab starts at the container's edge and the panel follows the rule.
    render(<Strip width={900} />)
    const container = screen.getByTestId('container')
    const root = list().parentElement as HTMLElement
    expect(box(tab(/Overview/)).left).toBe(box(container).left)
    expect(box(tab(/Overview/)).top).toBe(box(root).top)
    const panel = screen.getByRole('tabpanel')
    expect(box(panel).top).toBe(box(tab(/Overview/)).bottom + 1)
  })
})

describe('Tabs wider than its container — the indicator', () => {
  it('stays under its tab wherever the strip is scrolled', async () => {
    render(<Strip defaultValue="audit" />)
    await aligned(/Audit log/)

    for (const position of [0, 60, list().scrollWidth]) {
      list().scrollLeft = position
      await aligned(/Audit log/)
    }
  })

  it('stays under its tab right to left', async () => {
    const { rerender } = render(<Strip width={900} defaultValue="audit" />)
    await placed()
    // The member hands the document's direction to Radix, which writes it on the root.
    document.documentElement.setAttribute('dir', 'rtl')
    const root = list().parentElement as HTMLElement
    await vi.waitFor(() => expect(root.getAttribute('dir')).toBe('rtl'))
    // A new width has the member measure and place the strip again.
    rerender(<Strip width={PHONE} defaultValue="audit" />)

    await vi.waitFor(() => expect(list().scrollLeft).toBeLessThan(0))
    shown(/Audit log/)
    await aligned(/Audit log/)
    list().scrollLeft = 0
    await aligned(/Audit log/)
  })
})

/**
 * Whether the browser draws the edge fade: the recipe's own `@supports`
 * condition. Without it the recipe shows a thin scrollbar, and the tests that
 * read the fade are skipped.
 */
const FADES = CSS.supports('animation-timeline: scroll()')

describe.skipIf(!FADES)('Tabs wider than its container — the edge fade', () => {
  /**
   * The two mask layers as the browser computes them, the list's scroll-driven
   * animations applied. The left layer's fade is inside the list when its
   * position is 0, and outside it one fade's width to the left. The right
   * layer's fade is inside when the layer is as wide as the list, and outside
   * when it is wider. With no mask there is no fade.
   */
  function fades() {
    const style = getComputedStyle(list())
    if (style.maskImage === 'none') return { left: false, right: false }
    const left = px(style.maskPosition.split(',')[0] ?? '')
    const right = (style.maskSize.split(',')[1] ?? '').trim()
    return { left: left === 0, right: right.startsWith('100%') }
  }

  it('puts no mask on a strip that fits', async () => {
    // The animations carry the mask, and their timeline is inactive in a list
    // with nothing to scroll.
    render(<Strip width={900} />)
    await placed()
    expect(getComputedStyle(list()).maskImage).toBe('none')
    expect(fades()).toEqual({ left: false, right: false })
  })

  it('fades only the edge that has more tabs beyond it', async () => {
    render(<Strip />)
    await placed()
    expect(fades()).toEqual({ left: false, right: true })

    list().scrollLeft = 100
    await vi.waitFor(() => expect(fades()).toEqual({ left: true, right: true }))

    list().scrollLeft = list().scrollWidth
    await vi.waitFor(() => expect(fades()).toEqual({ left: true, right: false }))
  })

  it('fades the opposite edges right to left', async () => {
    render(<Strip />)
    await placed()
    // As above: the document turns, and the root follows it.
    document.documentElement.setAttribute('dir', 'rtl')
    const root = list().parentElement as HTMLElement
    await vi.waitFor(() => expect(root.getAttribute('dir')).toBe('rtl'))
    // The strip starts at its right edge, so the tabs beyond it are to the left.
    await vi.waitFor(() => expect(fades()).toEqual({ left: true, right: false }))

    list().scrollLeft = -list().scrollWidth
    await vi.waitFor(() => expect(fades()).toEqual({ left: false, right: true }))
  })
})

describe('Tabs wider than its container — the scrollbar', () => {
  it.skipIf(SCROLLBARS_ARE_HIDDEN)(
    'shows a thin scrollbar where there is no fade, and none where the fade replaces it',
    () => {
      render(<Strip />)
      expect(getComputedStyle(list()).scrollbarWidth).toBe(FADES ? 'none' : 'thin')
    },
  )
})

describe('vertical Tabs', () => {
  it('takes none of the horizontal strip’s overflow handling', () => {
    render(<Strip orientation="vertical" />)
    const style = getComputedStyle(list())
    expect(style.overflowX).toBe('visible')
    expect(style.maskImage).toBe('none')
    expect(style.paddingTop).toBe('0px')
    expect(style.marginLeft).toBe('0px')
    const root = list().parentElement as HTMLElement
    expect(getComputedStyle(root, '::before').content).toBe('none')
  })

  it('takes none of it inside a horizontal Tabs’ panel either', () => {
    render(
      <Tabs tabs={[{ value: 'outer', label: 'Outer' }]}>
        <Tabs.Content value="outer">
          <Tabs orientation="vertical" tabs={[{ value: 'inner', label: 'Inner' }]}>
            <Tabs.Content value="inner">
              <p>Inner panel</p>
            </Tabs.Content>
          </Tabs>
        </Tabs.Content>
      </Tabs>,
    )
    const inner = screen
      .getAllByRole('tablist')
      .find((strip) => strip.getAttribute('aria-orientation') === 'vertical') as HTMLElement
    const style = getComputedStyle(inner)
    expect(style.overflowX).toBe('visible')
    expect(style.paddingTop).toBe('0px')
    expect(style.marginLeft).toBe('0px')
    const rule = inner.querySelector(':scope > :not([role="tab"])')
    if (rule !== null) expect(getComputedStyle(rule).marginTop).toBe('0px')
  })
})

describe('Tabs in a root shorter than its content', () => {
  it('keeps the strip’s height, so the triggers are not clipped away', () => {
    render(
      // A row stretches the root to its own height, which is less than the strip and a panel.
      <div style={{ display: 'flex', width: PHONE, height: 24 }}>
        <Tabs tabs={TABS}>
          {TABS.map((item) => (
            <Tabs.Content key={item.value} value={item.value}>
              <p>{`${item.label} panel`}</p>
            </Tabs.Content>
          ))}
        </Tabs>
      </div>,
    )
    const first = screen.getAllByRole('tab')[0] as HTMLElement
    expect(box(list()).height).toBeGreaterThanOrEqual(box(first).height)
  })
})

/**
 * An agent chooses a tab through the bridge, as the spec's `agent` fence declares
 * (`design/components/tabs.md`, Agent). The member holds its value, so the choice shows its tab's
 * panel whether or not the caller controls it, and `onChange` reports it.
 */
describe('an agent', () => {
  const CHOICES = [
    { value: 'open', label: 'Open' },
    { value: 'solved', label: 'Solved' },
    { value: 'spam', label: 'Spam', disabled: true },
  ]
  const panels = (
    <>
      <Tabs.Content value="open">
        <p>Waiting on a reply.</p>
      </Tabs.Content>
      <Tabs.Content value="solved">
        <p>Closed this month.</p>
      </Tabs.Content>
      <Tabs.Content value="spam">
        <p>Never shown.</p>
      </Tabs.Content>
    </>
  )

  it('chooses in an uncontrolled and a controlled strip, and refuses a disabled tab', async () => {
    const bridge = createAgentBridge()
    try {
      const free = vi.fn()
      const held = vi.fn()
      function Held() {
        const [value, setValue] = useState('solved')
        return (
          <Tabs
            tabs={CHOICES}
            value={value}
            onChange={(next) => {
              held(next)
              setValue(next)
            }}
          >
            {panels}
          </Tabs>
        )
      }
      render(
        <>
          <Tabs tabs={CHOICES} onChange={free}>
            {panels}
          </Tabs>
          <Held />
        </>,
      )
      const [one, two] = bridge.snapshot().members
      expect(one).toMatchObject({
        member: 'Tabs',
        state: {
          value: 'open',
          tabs: [
            { id: 'open', label: 'Open' },
            { id: 'solved', label: 'Solved' },
            { id: 'spam', label: 'Spam', disabled: true },
          ],
        },
        actions: [{ name: 'choose', argument: 'id' }],
      })
      expect(two?.state['value']).toBe('solved')

      const chosen = await bridge.act([{ id: one?.id, action: 'choose', value: 'solved' }])
      expect(chosen.results[0]).toEqual({
        ok: true,
        id: one?.id,
        changed: { value: { from: 'open', to: 'solved' } },
      })
      expect(free).toHaveBeenLastCalledWith('solved')
      expect(screen.getAllByText('Closed this month.')).toHaveLength(2)

      const changed = await bridge.act([{ id: two?.id, action: 'choose', value: 'open' }])
      expect(changed.results[0]).toMatchObject({
        ok: true,
        changed: { value: { from: 'solved', to: 'open' } },
      })
      expect(held).toHaveBeenLastCalledWith('open')
      expect(screen.getAllByText('Waiting on a reply.')).toHaveLength(1)

      // A disabled tab is refused, and nothing is reported.
      const refused = await bridge.act([{ id: one?.id, action: 'choose', value: 'spam' }])
      expect(refused.results[0]).toMatchObject({ ok: false, error: { code: 'invalid-value' } })
      expect(free).toHaveBeenCalledTimes(1)
      expect(screen.queryByText('Never shown.')).toBeNull()
    } finally {
      bridge.dispose()
    }
  })

  it('keeps a controlled strip on the value its caller passes back', async () => {
    const bridge = createAgentBridge()
    try {
      const onChange = vi.fn()
      render(
        <Tabs tabs={CHOICES} value="open" onChange={onChange}>
          {panels}
        </Tabs>,
      )
      const [member] = bridge.snapshot().members
      const { results } = await bridge.act([{ id: member?.id, action: 'choose', value: 'solved' }])
      expect(results[0]).toEqual({ ok: true, id: member?.id, changed: {} })
      expect(onChange).toHaveBeenCalledWith('solved')
      expect(screen.getByText('Waiting on a reply.')).toBeTruthy()
      expect(screen.queryByText('Closed this month.')).toBeNull()
    } finally {
      bridge.dispose()
    }
  })
})
