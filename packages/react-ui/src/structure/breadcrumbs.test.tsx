import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { createAgentBridge } from '@polymorph/engine/agent'
import { fixedWidthHost, installTestTheme } from '@polymorph/engine/testing'
import { Breadcrumbs, type BreadcrumbsProps } from './Breadcrumbs'

/**
 * Breadcrumbs, in a real browser.
 *
 * Most of the logic is the collapse: which crumbs stay, in what order, and where
 * the rest go. The last crumb is a location, not a link, which hand-rolled trails
 * often get wrong.
 */

beforeAll(installTestTheme)

const SIX = [
  { label: 'Home', href: '#home' },
  { label: 'Workspaces', href: '#workspaces' },
  { label: 'Northwind', href: '#northwind' },
  { label: 'Support', href: '#support' },
  { label: 'Escalations', href: '#escalations' },
  { label: 'Ticket #4182' },
]

const trail = () => screen.getByRole('navigation', { name: 'Breadcrumb' })
const rungs = () => [...trail().querySelectorAll('li')].map((node) => node.textContent)

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<BreadcrumbsProps>(true)
  })
})

describe('the trail', () => {
  it('is a labelled navigation landmark around an ordered list', () => {
    render(<Breadcrumbs items={SIX.slice(-3)} />)
    expect(trail().querySelector('ol')).not.toBeNull()
  })

  it('draws every crumb while the path is within maxItems', () => {
    render(<Breadcrumbs items={SIX.slice(0, 4)} />)
    expect(rungs()).toEqual(['Home', 'Workspaces', 'Northwind', 'Support'])
    expect(screen.queryByRole('button', { name: 'Show path' })).toBeNull()
  })

  it('keeps both ends of a long path and collapses the middle', () => {
    render(<Breadcrumbs items={SIX} />)
    // First crumb, the overflow, and the last two, so both ends of the path stay
    // visible.
    expect(rungs()).toEqual(['Home', '', 'Escalations', 'Ticket #4182'])
    expect(screen.getByRole('button', { name: 'Show path' })).toBeTruthy()
  })

  it('draws the whole path when collapsing is switched off', () => {
    render(<Breadcrumbs items={SIX} maxItems={Infinity} />)
    expect(rungs()).toEqual([
      'Home',
      'Workspaces',
      'Northwind',
      'Support',
      'Escalations',
      'Ticket #4182',
    ])
  })
})

describe('the collapsed middle', () => {
  it('offers the hidden crumbs, in order', async () => {
    render(<Breadcrumbs items={SIX} />)
    await userEvent.click(screen.getByRole('button', { name: 'Show path' }))

    await vi.waitFor(() => expect(screen.getAllByRole('menuitem').length).toBe(3))
    expect(screen.getAllByRole('menuitem').map((node) => node.textContent)).toEqual([
      'Workspaces',
      'Northwind',
      'Support',
    ])
  })

  it('calls the item’s onSelect when it has one', async () => {
    const onSelect = vi.fn()
    render(
      <Breadcrumbs
        defaultOpen
        items={[
          { label: 'Home', href: '#home' },
          { label: 'Workspaces', href: '#workspaces', onSelect },
          { label: 'Northwind', href: '#northwind' },
          { label: 'Support', href: '#support' },
          { label: 'Escalations', href: '#escalations' },
          { label: 'Ticket #4182' },
        ]}
      />,
    )
    await userEvent.click(screen.getByRole('menuitem', { name: 'Workspaces' }))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })
})

describe('routing (`link.md` §Routing)', () => {
  /**
   * Records whether each click was taken from the browser, then stops the
   * browser's navigation either way, so the runner's page stays where it is.
   */
  function watchClicks(): { decisions: boolean[]; stop(): void } {
    const decisions: boolean[] = []
    const watch = (event: MouseEvent) => {
      decisions.push(event.defaultPrevented)
      event.preventDefault()
    }
    document.addEventListener('click', watch)
    return { decisions, stop: () => document.removeEventListener('click', watch) }
  }

  it('hands a crumb’s click to the app’s router, and leaves a modified one to the browser', async () => {
    const onNavigate = vi.fn()
    render(<Breadcrumbs items={SIX.slice(0, 3)} onNavigate={onNavigate} />)
    const home = screen.getByRole('link', { name: 'Home' })
    const clicks = watchClicks()
    await userEvent.click(home)
    home.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }))
    clicks.stop()

    expect(clicks.decisions).toEqual([true, false])
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith('#home')
  })

  it('routes a crumb chosen from the overflow, which is a command and not a link', async () => {
    const onNavigate = vi.fn()
    const before = window.location.hash
    render(<Breadcrumbs items={SIX} defaultOpen onNavigate={onNavigate} />)
    await userEvent.click(
      await vi.waitFor(() => screen.getByRole('menuitem', { name: 'Northwind' })),
    )

    expect(onNavigate).toHaveBeenCalledExactlyOnceWith('#northwind')
    // The router took it, so the member did not also open the `href`.
    expect(window.location.hash).toBe(before)
  })

  it('runs an item’s own onSelect beside the router, and in its place in the overflow', async () => {
    const onNavigate = vi.fn()
    const onSelect = vi.fn()
    const items = SIX.map((item) => (item.label === 'Workspaces' ? { ...item, onSelect } : item))
    render(<Breadcrumbs items={items} maxItems={Infinity} onNavigate={onNavigate} />)
    const clicks = watchClicks()
    await userEvent.click(screen.getByRole('link', { name: 'Workspaces' }))
    clicks.stop()
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith('#workspaces')
    cleanup()

    onNavigate.mockClear()
    render(<Breadcrumbs items={items} defaultOpen onNavigate={onNavigate} />)
    await userEvent.click(
      await vi.waitFor(() => screen.getByRole('menuitem', { name: 'Workspaces' })),
    )
    expect(onSelect).toHaveBeenCalledTimes(2)
    expect(onNavigate).not.toHaveBeenCalled()
  })
})

describe('the current page', () => {
  it('renders the last crumb as text carrying aria-current', () => {
    render(<Breadcrumbs items={SIX} />)
    const current = trail().querySelector('[aria-current="page"]') as HTMLElement
    expect(current.textContent).toBe('Ticket #4182')
    expect(current.tagName).toBe('SPAN')
    expect(screen.queryByRole('link', { name: 'Ticket #4182' })).toBeNull()
  })

  it('ignores an href on the last crumb rather than linking to here', () => {
    render(
      <Breadcrumbs
        items={[
          { label: 'Tickets', href: '#tickets' },
          { label: 'Ticket #4182', href: '#itself' },
        ]}
      />,
    )
    expect(screen.getAllByRole('link').map((node) => node.textContent)).toEqual(['Tickets'])
  })

  it('leaves the earlier crumbs as real links', () => {
    render(<Breadcrumbs items={SIX.slice(0, 3)} />)
    const link = screen.getByRole('link', { name: 'Home' })
    expect(link.getAttribute('href')).toBe('#home')
  })

  it('renders a crumb without a destination as text, not a dead link', () => {
    render(<Breadcrumbs items={[{ label: 'Archive' }, { label: 'Ticket #4182' }]} />)
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(screen.getByText('Archive')).toBeTruthy()
  })
})

describe('the separators', () => {
  it('hides them from screen readers', () => {
    render(<Breadcrumbs items={SIX.slice(0, 3)} />)
    const glyphs = [...trail().querySelectorAll('svg')]
    expect(glyphs).toHaveLength(2)
    for (const glyph of glyphs) expect(glyph.getAttribute('aria-hidden')).toBe('true')
  })
})

/**
 * The trail is one line. It collapses by count, which says nothing of width: four crumbs
 * that fit a desktop header are wider than a phone. A row wider than its container
 * narrows its crumbs, the middle ones first.
 */
describe('a row wider than its container', () => {
  const FOUR = [SIX[0], SIX[1], SIX[3], SIX[5]] as typeof SIX

  /** The trail in a host of the given width: its items, its crumbs and the host. */
  function draw(width: number, props: BreadcrumbsProps) {
    const host = fixedWidthHost(width)
    const view = render(<Breadcrumbs {...props} />, { container: host })
    const items = [...host.querySelectorAll('li')]
    const widths = items.map((item) => item.getBoundingClientRect().width)
    const natural =
      (items.at(-1)?.getBoundingClientRect().right ?? 0) -
      (items[0]?.getBoundingClientRect().left ?? 0)
    return {
      host,
      items,
      widths,
      natural,
      /** Whether an item's crumb shows less than its label. */
      clipped: (at: number) => {
        const crumb = items[at]?.firstElementChild as HTMLElement
        return crumb.scrollWidth > crumb.clientWidth
      },
      done: () => {
        view.unmount()
        host.remove()
      },
    }
  }

  /** The row is inside its host, on one line, with no item over the next. */
  function expectOneLineInside({ host, items }: ReturnType<typeof draw>) {
    const edge = host.getBoundingClientRect()
    // Items differ in height (the overflow control is taller than a crumb), so the line
    // is read from their centres.
    const centre = (box: DOMRect) => box.top + box.height / 2
    const line = centre(items[0]?.getBoundingClientRect() ?? new DOMRect())
    expect(host.scrollWidth).toBe(host.clientWidth)
    for (const [at, item] of items.entries()) {
      const box = item.getBoundingClientRect()
      expect(centre(box)).toBeCloseTo(line, 0)
      expect(box.right).toBeLessThanOrEqual(edge.right + 0.5)
      const next = items[at + 1]?.getBoundingClientRect()
      if (next !== undefined) expect(box.right).toBeLessThanOrEqual(next.left + 0.5)
      // The separator stays inside its own item.
      const last = item.lastElementChild?.getBoundingClientRect()
      expect(last?.right ?? 0).toBeLessThanOrEqual(box.right + 0.5)
    }
  }

  it('leaves a row with room as it is', () => {
    const wide = draw(1200, { items: FOUR })
    expect(wide.items.map((_, at) => wide.clipped(at))).toEqual([false, false, false, false])
    wide.done()
  })

  it('narrows the middle crumbs first, and keeps both ends whole', () => {
    const wide = draw(1200, { items: FOUR })
    const { natural, widths } = wide
    wide.done()

    const narrow = draw(Math.floor(natural) - 20, { items: FOUR })
    expectOneLineInside(narrow)
    expect(narrow.widths[0]).toBeCloseTo(widths[0] ?? 0, 1)
    expect(narrow.widths[3]).toBeCloseTo(widths[3] ?? 0, 1)
    expect([narrow.clipped(0), narrow.clipped(3)]).toEqual([false, false])
    expect([narrow.clipped(1), narrow.clipped(2)]).toEqual([true, true])
    narrow.done()
  })

  it('narrows the ends once the middle is at its floor, and never crosses its container', () => {
    const wide = draw(1200, { items: SIX, maxItems: Infinity })
    const { natural } = wide
    wide.done()

    const narrow = draw(Math.floor(natural * 0.6), { items: SIX, maxItems: Infinity })
    expectOneLineInside(narrow)
    // Every crumb keeps room for a letter and an ellipsis.
    const floor = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--pm-space-6'),
    )
    for (const item of narrow.items) {
      const crumb = item.firstElementChild as HTMLElement
      expect(crumb.getBoundingClientRect().width).toBeGreaterThanOrEqual(floor - 0.5)
    }
    for (const at of [1, 2, 3, 4]) {
      expect((narrow.items[at]?.firstElementChild as HTMLElement).offsetWidth).toBeCloseTo(floor, 0)
    }
    expect([narrow.clipped(0), narrow.clipped(5)]).toEqual([true, true])
    narrow.done()
  })

  it('keeps the overflow control its width', () => {
    const wide = draw(1200, { items: SIX })
    const { natural, widths } = wide
    wide.done()

    const narrow = draw(Math.floor(natural) - 30, { items: SIX })
    expectOneLineInside(narrow)
    expect(narrow.items[1]?.querySelector('button')).not.toBeNull()
    expect(narrow.widths[1]).toBeCloseTo(widths[1] ?? 0, 1)
    // The crumb between the overflow and the current page is the middle here.
    expect(narrow.clipped(2)).toBe(true)
    expect(narrow.clipped(3)).toBe(false)
    narrow.done()
  })

  it('narrows a crumb that is a button as it does a link', () => {
    const items = [
      { label: 'Home', href: '#home' },
      { label: 'Workspaces', onSelect: () => {} },
      { label: 'Support', onSelect: () => {} },
      { label: 'Ticket #4182' },
    ]
    const wide = draw(1200, { items })
    const { natural } = wide
    wide.done()

    const narrow = draw(Math.floor(natural) - 20, { items })
    expectOneLineInside(narrow)
    expect([narrow.clipped(1), narrow.clipped(2)]).toEqual([true, true])
    narrow.done()
  })
})

/**
 * An agent follows a crumb through the bridge, as the spec's `agent` fence declares
 * (`design/components/breadcrumbs.md`, Agent): a crumb on the trail is pressed, and a hidden one
 * runs as its overflow entry does, without the Menu, which the trail withholds.
 */
describe('an agent', () => {
  it('follows a crumb on the trail and a hidden one, and lists no part of the overflow', async () => {
    const bridge = createAgentBridge()
    try {
      const onNavigate = vi.fn()
      render(<Breadcrumbs items={SIX} onNavigate={onNavigate} />)
      const { members } = bridge.snapshot()
      expect(members.map((member) => member.member)).toEqual(['Breadcrumbs'])
      const [path] = members
      expect(path?.state['items']).toEqual([
        { id: 'Home', label: 'Home' },
        { id: 'Workspaces', label: 'Workspaces' },
        { id: 'Northwind', label: 'Northwind' },
        { id: 'Support', label: 'Support' },
        { id: 'Escalations', label: 'Escalations' },
        { id: 'Ticket #4182', label: 'Ticket #4182', disabled: true },
      ])

      await bridge.act([{ id: path?.id, action: 'choose', value: 'Support' }])
      expect(onNavigate).toHaveBeenLastCalledWith('#support')
      // Northwind is hidden in the overflow, and runs as its entry does with the Menu closed.
      await bridge.act([{ id: path?.id, action: 'choose', value: 'Northwind' }])
      expect(onNavigate).toHaveBeenLastCalledWith('#northwind')
      expect(screen.queryByRole('menu')).toBeNull()

      const current = await bridge.act([{ id: path?.id, action: 'choose', value: 'Ticket #4182' }])
      expect(current.results[0]).toMatchObject({ ok: false, error: { code: 'invalid-value' } })
      expect(onNavigate).toHaveBeenCalledTimes(2)
    } finally {
      bridge.dispose()
    }
  })
})
