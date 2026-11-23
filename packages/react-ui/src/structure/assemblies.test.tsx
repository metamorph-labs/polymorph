import { cleanup, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { createAgentBridge } from '@polymorph/engine/agent'
import { PAGER_ADDRESSES, pagerHoldLaw } from '@polymorph/conformance/pager-hold'
import { Button } from '../controls/Button'
import { SearchInput, type SearchInputProps } from '../controls/SearchInput'
import { fixedWidthHost, installTestTheme } from '@polymorph/engine/testing'
import { DataTable, type DataTableColumn, type DataTableProps } from './DataTable'
import { FilterBar, type FilterBarProps } from './FilterBar'
import { Pagination, paginationWindow, type PaginationProps } from './Pagination'

/**
 * The list assemblies: DataTable, FilterBar and Pagination.
 *
 * They compose components that are already tested, so these tests cover the
 * wiring and each one's few decisions: the pagination window, the tri-state
 * select-all, when a clear button exists, and what a table shows instead of rows.
 */

beforeAll(installTestTheme)

/**
 * How many lines a set of flex children occupies.
 *
 * Measured from each box's vertical *centre*, not its top: these rows centre
 * their items, so a short count beside a tall field shares a centre, not a top.
 */
function lines(items: HTMLElement[]): number {
  const centres = items.map((item) => {
    const box = item.getBoundingClientRect()
    return Math.round(box.top + box.height / 2)
  })
  return new Set(centres).size
}

describe('the closed surfaces', () => {
  it('leave no way to style any of them from a call site', () => {
    assertGoverned<SearchInputProps>(true)
    assertGoverned<FilterBarProps>(true)
    assertGoverned<PaginationProps>(true)
    assertGoverned<DataTableProps<{ id: string }>>(true)
  })
})

describe('SearchInput', () => {
  it('is a search box to assistive technology as well as visually', () => {
    render(<SearchInput aria-label="Search tickets" />)
    expect(screen.getByRole('searchbox', { name: 'Search tickets' })).toBeTruthy()
  })

  it('fixes the glyph and the clear button', () => {
    // The glyph and the clear button are set here and not exposed as props, so
    // screens do not each decide whether a search box is clearable.
    render(<SearchInput defaultValue="webhook" aria-label="Search" />)
    expect(screen.getByRole('button', { name: /clear/i })).toBeTruthy()
    expect(screen.getByRole('searchbox').parentElement?.querySelector('svg')).not.toBeNull()
  })

  it('replaces the hint with the clear button once there is a value', async () => {
    const { container } = render(<SearchInput shortcut="⌘K" aria-label="Search" />)
    const root = container.firstElementChild as HTMLElement
    expect(root.dataset['shortcut']).toBe('')
    expect(screen.getByText('⌘K')).toBeTruthy()

    await userEvent.type(screen.getByRole('searchbox'), 'web')
    expect(root.dataset['shortcut']).toBeUndefined()
    expect(screen.queryByText('⌘K')).toBeNull()
  })

  it('hides the hint while the field has focus', async () => {
    const { container } = render(<SearchInput shortcut="⌘K" aria-label="Search" />)
    const root = container.firstElementChild as HTMLElement

    await userEvent.click(screen.getByRole('searchbox'))
    expect(root.dataset['shortcut']).toBeUndefined()
  })

  it('never lets the hint take a click meant for the field', () => {
    render(<SearchInput shortcut="⌘K" aria-label="Search" />)
    const hint = screen.getByText('⌘K').closest('span[aria-hidden]') as HTMLElement
    expect(getComputedStyle(hint).pointerEvents).toBe('none')
  })
})

describe('Pagination', () => {
  /**
   * The window is the component's logic. Everything else is Buttons, so only the
   * arithmetic can be wrong, often only on later pages such as 6 of 12.
   */
  describe('the window', () => {
    it('shows every page when the window reaches both ends', () => {
      // From the middle of five, `page ± 1` plus the two ends is all of them.
      expect(paginationWindow(3, 5)).toEqual([1, 2, 3, 4, 5])
    })

    it('elides even a short tail, because the window size is fixed', () => {
      // Five pages viewed from the first still hide 3 and 4. A fixed-size window,
      // because "show everything if it nearly fits" changes width while paging.
      expect(paginationWindow(1, 5)).toEqual([1, 2, 'ellipsis', 5])
    })

    it('collapses a real gap into an ellipsis', () => {
      expect(paginationWindow(6, 12)).toEqual([1, 'ellipsis', 5, 6, 7, 'ellipsis', 12])
    })

    it('renders a single missing page rather than eliding it', () => {
      // Hiding one page behind a symbol of the same width would make that page
      // unreachable and save no space.
      expect(paginationWindow(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
    })

    it('widens with the sibling count', () => {
      expect(paginationWindow(6, 12, 2)).toEqual([1, 'ellipsis', 4, 5, 6, 7, 8, 'ellipsis', 12])
    })

    it('is empty below two pages, because that is not a paginated list', () => {
      expect(paginationWindow(1, 1)).toEqual([])
      expect(paginationWindow(1, 0)).toEqual([])
    })

    it('never runs off either end', () => {
      expect(paginationWindow(1, 12)).toEqual([1, 2, 'ellipsis', 12])
      expect(paginationWindow(12, 12)).toEqual([1, 'ellipsis', 11, 12])
    })
  })

  function pager(props: Partial<PaginationProps> = {}) {
    const onPageChange = vi.fn()
    render(<Pagination page={3} pageCount={7} onPageChange={onPageChange} {...props} />)
    return onPageChange
  }

  it('marks the current page for screen readers too', () => {
    pager()
    expect(screen.getByRole('button', { name: 'Page 3' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('button', { name: 'Page 4' }).getAttribute('aria-current')).toBeNull()
  })

  it('names a numbered button as a page and still shows the digit', () => {
    // From the spec: `label="Page N"` with a visible digit, because "3" alone is
    // ambiguous. The name contains the visible text, so speech input still works
    // (WCAG 2.5.3).
    pager()
    expect(screen.getByRole('button', { name: 'Page 3' }).textContent).toBe('3')
  })

  it('uses no solid button, which the page keeps for its own action', () => {
    pager()
    expect(screen.getByRole('button', { name: 'Page 3' }).dataset['variant']).toBe('soft')
  })

  it('calls onPageChange with the chosen page', async () => {
    const onPageChange = pager()
    await userEvent.click(screen.getByRole('button', { name: 'Page 4' }))
    expect(onPageChange).toHaveBeenCalledWith(4)

    await userEvent.click(screen.getByRole('button', { name: 'Previous page' }))
    expect(onPageChange).toHaveBeenLastCalledWith(2)
  })

  it('disables previous and next at the ends', () => {
    pager({ page: 1 })
    expect(screen.getByRole('button', { name: 'Previous page' })).toHaveProperty('disabled', true)

    render(<Pagination page={7} pageCount={7} onPageChange={vi.fn()} />)
    expect(screen.getAllByRole('button', { name: 'Next page' })[1]).toHaveProperty('disabled', true)
  })

  it('is a named landmark, so it can be jumped to', () => {
    pager({ label: 'Ticket pages' })
    expect(screen.getByRole('navigation', { name: 'Ticket pages' })).toBeTruthy()
  })

  it('uses localized messages when given', () => {
    pager({
      messages: { previous: 'Page précédente', next: 'Page suivante', page: (n) => `Page nº ${n}` },
    })
    expect(screen.getByRole('button', { name: 'Page précédente' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Page suivante' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Page nº 3' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Previous page' })).toBeNull()
  })

  describe('a pager the app holds', () => {
    it('disables every control, the current page too, and asks for nothing', () => {
      const onPageChange = pager({ disabled: true })

      const buttons = screen.getAllByRole('button')
      // Both arrows and the pages 1, 2, 3, 4 and 7.
      expect(buttons).toHaveLength(7)
      for (const button of buttons) {
        expect(button, button.getAttribute('aria-label') ?? '').toHaveProperty('disabled', true)
        button.click()
      }
      expect(onPageChange).not.toHaveBeenCalled()
      expect(screen.getByRole('navigation').hasAttribute('data-disabled')).toBe(true)
    })

    it('still says which page is current', () => {
      pager({ disabled: true })
      const current = screen.getByRole('button', { name: 'Page 3' })
      expect(current.getAttribute('aria-current')).toBe('page')
      expect(current.dataset['variant']).toBe('soft')
    })

    it('stays drawn, and gives the controls back when the hold ends', () => {
      const held = (disabled: boolean) => (
        <Pagination page={1} pageCount={7} disabled={disabled} onPageChange={() => {}} />
      )
      const { rerender } = render(held(true))
      rerender(held(false))

      expect(screen.getByRole('button', { name: 'Next page' })).toHaveProperty('disabled', false)
      expect(screen.getByRole('button', { name: 'Page 2' })).toHaveProperty('disabled', false)
      // The first page has no previous one, so the hold ending does not enable that arrow.
      expect(screen.getByRole('button', { name: 'Previous page' })).toHaveProperty('disabled', true)
      expect(screen.getByRole('navigation').hasAttribute('data-disabled')).toBe(false)
    })

    it('is not marked as held without the prop', () => {
      pager()
      expect(screen.getByRole('navigation').hasAttribute('data-disabled')).toBe(false)
      expect(screen.getByRole('button', { name: 'Page 4' })).toHaveProperty('disabled', false)
    })

    it('still renders nothing for a single page', () => {
      pager({ pageCount: 1, page: 1, disabled: true })
      expect(screen.queryByRole('navigation')).toBeNull()
    })
  })

  describe('with addresses (`pagination.md`, Behavior)', () => {
    const getPageHref = (page: number) => `#page-${page}`

    it('links every other page and both arrows to their addresses, under their buttons’ names', () => {
      pager({ getPageHref })

      expect(screen.getByRole('link', { name: 'Previous page' }).getAttribute('href')).toBe(
        '#page-2',
      )
      expect(screen.getByRole('link', { name: 'Next page' }).getAttribute('href')).toBe('#page-4')
      // Pages 1, 2, 4 and 7 around the current page 3, each showing its digit.
      for (const page of [1, 2, 4, 7]) {
        const link = screen.getByRole('link', { name: `Page ${page}` })
        expect(link.getAttribute('href')).toBe(`#page-${page}`)
        expect(link.textContent).toBe(String(page))
      }
    })

    it('keeps the current page a button, never a link to itself', () => {
      pager({ getPageHref })
      expect(screen.queryByRole('link', { name: 'Page 3' })).toBeNull()
      const [current, ...others] = screen.getAllByRole('button')
      expect(others).toHaveLength(0)
      expect(current?.getAttribute('aria-label')).toBe('Page 3')
      expect(current?.getAttribute('aria-current')).toBe('page')
    })

    it('keeps an arrow with nowhere to go a disabled button', () => {
      pager({ getPageHref, page: 1 })
      expect(screen.getByRole('button', { name: 'Previous page' })).toHaveProperty('disabled', true)
      expect(screen.getByRole('link', { name: 'Next page' }).getAttribute('href')).toBe('#page-2')
      cleanup()

      pager({ getPageHref, page: 7 })
      expect(screen.getByRole('button', { name: 'Next page' })).toHaveProperty('disabled', true)
      expect(screen.getByRole('link', { name: 'Previous page' }).getAttribute('href')).toBe(
        '#page-6',
      )
    })

    it('draws no link while the app holds the pager', () => {
      const onPageChange = pager({ getPageHref, disabled: true })
      expect(screen.queryAllByRole('link')).toHaveLength(0)
      const buttons = screen.getAllByRole('button')
      expect(buttons).toHaveLength(7)
      for (const button of buttons) expect(button).toHaveProperty('disabled', true)
      expect(onPageChange).not.toHaveBeenCalled()
    })

    it('calls onPageChange for a plain click, in place of the browser’s navigation', async () => {
      const onPageChange = pager({ getPageHref })
      let prevented: boolean | undefined
      const watch = (event: MouseEvent) => {
        prevented = event.defaultPrevented
        event.preventDefault()
      }
      document.addEventListener('click', watch)
      try {
        await userEvent.click(screen.getByRole('link', { name: 'Page 4' }))
      } finally {
        document.removeEventListener('click', watch)
      }
      expect(onPageChange).toHaveBeenCalledExactlyOnceWith(4)
      expect(prevented).toBe(true)
    })

    it('calls onPageChange for the click Enter makes on a focused link', async () => {
      const onPageChange = pager({ getPageHref })
      const watch = (event: MouseEvent) => event.preventDefault()
      document.addEventListener('click', watch)
      try {
        screen.getByRole('link', { name: 'Next page' }).focus()
        await userEvent.keyboard('{Enter}')
      } finally {
        document.removeEventListener('click', watch)
      }
      expect(onPageChange).toHaveBeenCalledExactlyOnceWith(4)
    })

    it('leaves a click with a modifier key or another button to the browser', () => {
      const onPageChange = pager({ getPageHref })
      const link = screen.getByRole('link', { name: 'Page 4' })
      for (const init of [
        { metaKey: true },
        { ctrlKey: true },
        { shiftKey: true },
        { altKey: true },
        { button: 1 },
      ]) {
        expect(taken(link, init), JSON.stringify(init)).toBe(false)
      }
      expect(onPageChange).not.toHaveBeenCalled()
    })

    it('looks like the button it replaces', () => {
      render(<Pagination label="Buttons" page={3} pageCount={7} onPageChange={vi.fn()} />)
      render(
        <Pagination
          label="Links"
          page={3}
          pageCount={7}
          getPageHref={getPageHref}
          onPageChange={vi.fn()}
        />,
      )
      const within = (label: string, role: 'button' | 'link', name: string) =>
        screen
          .getAllByRole(role, { name })
          .find((control) => control.closest('nav')?.getAttribute('aria-label') === label)

      for (const name of ['Previous page', 'Page 4', 'Next page']) {
        const button = within('Buttons', 'button', name)
        const link = within('Links', 'link', name)
        if (button === undefined || link === undefined) throw new Error(`no ${name} control`)
        for (const attribute of ['data-variant', 'data-tone', 'data-size', 'data-icon-only']) {
          expect(link.getAttribute(attribute), `${name} ${attribute}`).toBe(
            button.getAttribute(attribute),
          )
        }
        const drawn = getComputedStyle(button)
        const linked = getComputedStyle(link)
        for (const property of [
          'color',
          'background-color',
          'border-radius',
          'font-size',
          'font-weight',
          'text-decoration-line',
          'cursor',
        ] as const) {
          expect(linked.getPropertyValue(property), `${name} ${property}`).toBe(
            drawn.getPropertyValue(property),
          )
        }
        expect(link.getBoundingClientRect().width).toBe(button.getBoundingClientRect().width)
        expect(link.getBoundingClientRect().height).toBe(button.getBoundingClientRect().height)
      }
    })

    it('draws only buttons without addresses', () => {
      pager()
      expect(screen.getByRole('navigation').querySelector('a')).toBeNull()
      // Both arrows and the pages 1, 2, 3, 4 and 7.
      expect(screen.getAllByRole('button')).toHaveLength(7)
    })
  })
})

/**
 * Dispatches a click on `link` and reports whether the member took the navigation from the
 * browser. A listener on the document hears the click after the member, reads its decision, and
 * then stops the navigation itself, so a click the member leaves alone does not move the runner's
 * page or open a tab.
 */
function taken(link: HTMLElement, init: MouseEventInit = {}): boolean {
  let prevented = false
  const watch = (event: MouseEvent) => {
    prevented = event.defaultPrevented
    event.preventDefault()
  }
  document.addEventListener('click', watch, { once: true })
  try {
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }))
  } finally {
    document.removeEventListener('click', watch)
  }
  return prevented
}

/**
 * Where focus goes when a hold disables the page button that has it, and when
 * the hold ends, which the law states once for every web shell. The pager is
 * mounted in a component that holds its `page` and its `disabled`, as the
 * application around it does.
 */
pagerHoldLaw({
  shell: 'React',
  member: 'Pagination',
  mount({ addressed, asked }) {
    let change: (next: { page?: number; disabled?: boolean }) => void = () => {}
    function Held() {
      const [held, setHeld] = useState({ page: 3, disabled: false })
      change = (next) =>
        setHeld((was) => ({
          page: next.page ?? was.page,
          disabled: next.disabled ?? was.disabled,
        }))
      return (
        <Pagination
          label="Tickets"
          page={held.page}
          pageCount={7}
          disabled={held.disabled}
          getPageHref={addressed ? PAGER_ADDRESSES.page : undefined}
          onPageChange={asked}
        />
      )
    }
    render(<Held />)
    return Promise.resolve({ set: (next) => change(next) })
  },
})

/**
 * An agent asks for a page by its number through the bridge, as the spec's `agent` fence declares
 * (`design/components/pagination.md`, Agent). The pager withholds its Buttons, so the bridge lists
 * one Pagination.
 */
describe('Pagination, for an agent', () => {
  it('asks for a page by its number, and lists no Button of its own', async () => {
    const bridge = createAgentBridge()
    try {
      const onPageChange = vi.fn()
      function Held() {
        const [page, setPage] = useState(3)
        return (
          <Pagination
            label="Tickets"
            page={page}
            pageCount={7}
            onPageChange={(next) => {
              onPageChange(next)
              setPage(next)
            }}
          />
        )
      }
      render(<Held />)
      const { members } = bridge.snapshot()
      expect(members.map((member) => member.member)).toEqual(['Pagination'])
      const [pager] = members
      expect(pager).toMatchObject({
        name: 'Tickets',
        state: { page: 3, 'page-count': 7, disabled: false },
        actions: [{ name: 'set', argument: 'number' }],
      })

      const asked = await bridge.act([{ id: pager?.id, action: 'set', value: 6 }])
      expect(asked.results[0]).toEqual({
        ok: true,
        id: pager?.id,
        changed: { page: { from: 3, to: 6 } },
      })
      expect(onPageChange).toHaveBeenLastCalledWith(6)
      expect(screen.getByRole('button', { name: 'Page 6' }).getAttribute('aria-current')).toBe(
        'page',
      )

      // The current page asks for nothing, and a page outside the count fails.
      await bridge.act([{ id: pager?.id, action: 'set', value: 6 }])
      expect(onPageChange).toHaveBeenCalledTimes(1)
      const outside = await bridge.act([{ id: pager?.id, action: 'set', value: 8 }])
      expect(outside.results[0]).toMatchObject({ ok: false, error: { code: 'failed' } })
      const fraction = await bridge.act([{ id: pager?.id, action: 'set', value: 2.5 }])
      expect(fraction.results[0]).toMatchObject({ ok: false, error: { code: 'failed' } })
      expect(onPageChange).toHaveBeenCalledTimes(1)
    } finally {
      bridge.dispose()
    }
  })

  it('lists no action while the app holds it', async () => {
    const bridge = createAgentBridge()
    try {
      const onPageChange = vi.fn()
      render(<Pagination page={3} pageCount={7} disabled onPageChange={onPageChange} />)
      const [pager] = bridge.snapshot().members
      expect(pager).toMatchObject({ state: { disabled: true }, actions: [] })
      const { results } = await bridge.act([{ id: pager?.id, action: 'set', value: 4 }])
      expect(results[0]).toMatchObject({ ok: false, error: { code: 'disabled' } })
      expect(onPageChange).not.toHaveBeenCalled()
    } finally {
      bridge.dispose()
    }
  })
})

describe('FilterBar', () => {
  function bar(props: Partial<FilterBarProps> = {}) {
    const onClear = vi.fn()
    render(
      <FilterBar isFiltered={false} onClear={onClear} {...props}>
        <span>filters</span>
      </FilterBar>,
    )
    return onClear
  }

  it('shows no clear button until something is filtered', () => {
    // A permanent clear button would suggest that filters are set when none
    // are.
    bar()
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull()
  })

  it('shows the clear button as soon as something is filtered', async () => {
    const onClear = bar({ isFiltered: true })
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('announces the count politely, as list-page.md asks', () => {
    bar({ resultCount: { shown: 4, total: 27 } })
    const count = screen.getByText('4 of 27 results')
    expect(count.getAttribute('aria-live')).toBe('polite')
  })
})

/**
 * An agent clears a FilterBar through the bridge, as the spec's `agent` fence declares
 * (`design/components/filter-bar.md`, Agent). The clear Button is withheld, and the application's
 * filters stay an agent's.
 */
describe('FilterBar, for an agent', () => {
  it('clears as the clear Button does, and lists the application’s filters within the bar', async () => {
    const bridge = createAgentBridge()
    try {
      const onClear = vi.fn()
      render(
        <FilterBar isFiltered onClear={onClear} resultCount={{ shown: 4, total: 27 }}>
          <Button variant="ghost" tone="neutral" size="sm" label="Assigned to me" />
        </FilterBar>,
      )
      const { members } = bridge.snapshot()
      const filters = members.find((member) => member.member === 'FilterBar')
      expect(filters).toMatchObject({
        state: { filtered: true, 'result-count': '4 of 27 results' },
        actions: [{ name: 'clear' }],
      })
      expect(
        members
          .filter((member) => member.member === 'Button')
          .map((member) => [member.name, member.within]),
      ).toEqual([['Assigned to me', filters?.id]])
      const { results } = await bridge.act([{ id: filters?.id, action: 'clear' }])
      expect(results[0]).toMatchObject({ ok: true })
      expect(onClear).toHaveBeenCalledTimes(1)
    } finally {
      bridge.dispose()
    }
  })

  it('refuses to clear while nothing is filtered', async () => {
    const bridge = createAgentBridge()
    try {
      const onClear = vi.fn()
      render(<FilterBar isFiltered={false} onClear={onClear} />)
      const [filters] = bridge.snapshot().members
      const { results } = await bridge.act([{ id: filters?.id, action: 'clear' }])
      expect(results[0]).toMatchObject({ ok: false, error: { code: 'failed' } })
      expect(onClear).not.toHaveBeenCalled()
    } finally {
      bridge.dispose()
    }
  })
})

/**
 * The toolbar rule (`docs/layout.md`).
 *
 * There is no `Toolbar` component; FilterBar is the row the rule describes. It
 * wraps with one gap for both axes, and below `36rem` each cluster takes its own
 * line, because a search, a filter and a count side by side at phone width are
 * too cramped.
 *
 * Widths are set on host elements and the window is never resized, which tests
 * the container-first rule directly.
 */
describe('FilterBar: the toolbar wraps, then stacks', () => {
  function barIn(width: number) {
    const host = fixedWidthHost(width)
    render(
      <FilterBar
        isFiltered
        onClear={() => {}}
        resultCount={{ shown: 4, total: 27 }}
        search={<SearchInput aria-label="Search tickets" />}
      >
        <Button size="sm" variant="outline" tone="neutral" label="Status" />
        <Button size="sm" variant="outline" tone="neutral" label="Assignee" />
      </FilterBar>,
      { container: host },
    )
    const bar = host.firstElementChild as HTMLElement
    const row = bar.firstElementChild as HTMLElement
    return { host, bar, row, clusters: [...row.children] as HTMLElement[] }
  }

  it('wraps, with one gap for both axes', () => {
    const { host, row } = barIn(360)
    const style = getComputedStyle(row)
    expect(style.flexWrap).toBe('wrap')
    expect(style.rowGap).toBe(style.columnGap)
    host.remove()
  })

  it('never pushes a control past the edge of its container', () => {
    // The phone-width requirement, measured: nothing overflows at the narrowest
    // container the vocabulary supports.
    const { host, bar, clusters } = barIn(320)
    const edge = bar.getBoundingClientRect().right
    for (const cluster of clusters) {
      expect(cluster.getBoundingClientRect().right, cluster.textContent ?? '').toBeLessThanOrEqual(
        edge + 1,
      )
    }
    host.remove()
  })

  it('gives every cluster its own line below 36rem', () => {
    const { host, bar, clusters } = barIn(400)
    const inner = bar.getBoundingClientRect().width

    expect(lines(clusters), 'the clusters shared a line').toBe(clusters.length)
    for (const cluster of clusters) {
      expect(cluster.getBoundingClientRect().width).toBeCloseTo(inner, 0)
    }
    host.remove()
  })

  it('keeps the clusters on one line in a wide container', () => {
    // The other side of the threshold. A rule that always stacked would pass the
    // test above and still be wrong.
    const { host, clusters } = barIn(900)
    expect(lines(clusters)).toBe(1)
    host.remove()
  })

  it('measures its container and not the window', () => {
    // Two bars in one window give two results, which is the core of the
    // container-first rule.
    const narrow = barIn(400)
    const wide = barIn(900)

    expect(lines(narrow.clusters)).toBeGreaterThan(1)
    expect(lines(wide.clusters)).toBe(1)
    narrow.host.remove()
    wide.host.remove()
  })
})

interface Row {
  id: string
  subject: string
  minutes: number
}

describe('DataTable', () => {
  const DATA: Row[] = [
    { id: 'a', subject: 'Webhook retries', minutes: 4 },
    { id: 'b', subject: 'SSO loop', minutes: 26 },
    { id: 'c', subject: 'Empty CSV', minutes: 91 },
  ]

  const COLUMNS: DataTableColumn<Row>[] = [
    { key: 'subject', header: 'Ticket', sortable: true },
    { key: 'minutes', header: 'Updated', numeric: true, sortable: true },
  ]

  function table(props: Partial<DataTableProps<Row>> = {}) {
    render(
      <DataTable
        columns={COLUMNS}
        data={DATA}
        getRowId={(row) => row.id}
        label="Tickets"
        emptyState={{ title: 'Nothing here', description: 'Try a wider filter.' }}
        {...props}
      />,
    )
  }

  /*
   * The grid model (`structure/grid-keyboard.ts`). DataTable owns every cell, the
   * only case where taking the arrow keys is worth it. Table's suite tests the
   * mechanism; this checks that DataTable turns it on and that selection becomes
   * semantic.
   */
  it('is a grid, and declares that its rows can be selected in bulk', () => {
    table({ selection: new Set(), onSelectionChange: vi.fn() })
    const grid = screen.getByRole('grid')
    expect(grid.getAttribute('aria-multiselectable')).toBe('true')

    // Without selection there is nothing to be multiselectable about.
    cleanup()
    table()
    expect(screen.getByRole('grid').hasAttribute('aria-multiselectable')).toBe(false)
  })

  it('exposes selection to screen readers', () => {
    table({ selection: new Set(['a']), onSelectionChange: vi.fn() })
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows[0]?.getAttribute('aria-selected')).toBe('true')
    // Not omitted: in a grid *with* a selection, "not selected" is information.
    expect(rows[1]?.getAttribute('aria-selected')).toBe('false')
  })

  it('gives the whole table one tab stop, not one per row', () => {
    table({ selection: new Set(), onSelectionChange: vi.fn() })
    const stops = Array.from(screen.getByRole('grid').querySelectorAll<HTMLElement>('*')).filter(
      (node) => node.tabIndex === 0,
    )
    // Four checkboxes and two sort buttons would be six tab stops. With the grid
    // there is one, and the pagination below is one Tab away.
    expect(stops).toHaveLength(1)
  })

  it('renders a cell from the row when no renderer was given', () => {
    table()
    expect(screen.getByRole('cell', { name: 'Webhook retries' })).toBeTruthy()
    expect(screen.getByRole('cell', { name: '4' })).toBeTruthy()
  })

  it('starts a new sort ascending and reverses the sorted column', async () => {
    const onSortChange = vi.fn()
    table({ sort: { key: 'subject', direction: 'asc' }, onSortChange })

    await userEvent.click(screen.getByRole('button', { name: /Ticket/ }))
    expect(onSortChange).toHaveBeenLastCalledWith({ key: 'subject', direction: 'desc' })

    await userEvent.click(screen.getByRole('button', { name: /Updated/ }))
    expect(onSortChange).toHaveBeenLastCalledWith({ key: 'minutes', direction: 'asc' })
  })

  it('has no selection column until selection is switched on', () => {
    table()
    expect(screen.queryByRole('checkbox')).toBeNull()

    // An *empty* set still turns selection on, because the prop's presence is
    // what counts.
    table({ selection: new Set(), onSelectionChange: vi.fn() })
    expect(screen.getAllByRole('checkbox', { name: 'Select all' })).toHaveLength(1)
  })

  it('runs the header checkbox through all three of its states', () => {
    const selectAll = () => screen.getByRole('checkbox', { name: 'Select all' })

    table({ selection: new Set(), onSelectionChange: vi.fn() })
    expect(selectAll().dataset['state']).toBe('unchecked')

    render(
      <DataTable
        columns={COLUMNS}
        data={DATA}
        getRowId={(row) => row.id}
        label="Some"
        emptyState={{ title: 'x' }}
        selection={new Set(['a'])}
        onSelectionChange={vi.fn()}
      />,
    )
    expect(screen.getAllByRole('checkbox', { name: 'Select all' })[1]?.dataset['state']).toBe(
      'indeterminate',
    )
  })

  it('selects and deselects every row from the header', async () => {
    const onSelectionChange = vi.fn()
    table({ selection: new Set(), onSelectionChange })

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all' }))
    const next = onSelectionChange.mock.calls[0]?.[0] as ReadonlySet<string>
    expect([...next]).toEqual(['a', 'b', 'c'])
  })

  /*
   * `data` is one page and `selection` is all of it. The header reflects only
   * this page, and ids from page 1 must survive a round-trip, which is why
   * selection is controlled.
   */
  describe('across pages', () => {
    it('keeps an off-page id through a select-all round-trip', async () => {
      const onSelectionChange = vi.fn()
      table({ selection: new Set(['z']), onSelectionChange })

      await userEvent.click(screen.getByRole('checkbox', { name: 'Select all' }))
      const selected = onSelectionChange.mock.calls[0]?.[0] as ReadonlySet<string>
      expect([...selected].sort()).toEqual(['a', 'b', 'c', 'z'])

      cleanup()
      onSelectionChange.mockClear()
      table({ selection: selected, onSelectionChange })
      await userEvent.click(screen.getByRole('checkbox', { name: 'Select all' }))
      // Subtracted, not emptied: unselect-all removes only the visible page.
      expect([...(onSelectionChange.mock.calls[0]?.[0] as ReadonlySet<string>)]).toEqual(['z'])
    })

    it('does not check the header for rows on other pages', () => {
      table({ selection: new Set(['z']), onSelectionChange: vi.fn() })
      // Nothing on this page is selected, so the header is unchecked. The bar
      // still counts the whole selection, because a bulk action acts on all of it.
      expect(screen.getByRole('checkbox', { name: 'Select all' }).dataset['state']).toBe(
        'unchecked',
      )
      expect(screen.getByText('1 selected')).toBeTruthy()
    })
  })

  it('names each row checkbox through getRowLabel', () => {
    table({
      selection: new Set(),
      onSelectionChange: vi.fn(),
      getRowLabel: (row) => `Select ${row.subject}`,
    })
    expect(screen.getByRole('checkbox', { name: 'Select Webhook retries' })).toBeTruthy()
  })

  it('shows the bulk bar only while something is selected, and announces the count', () => {
    table({ selection: new Set(), onSelectionChange: vi.fn() })
    expect(screen.queryByText(/selected/)).toBeNull()

    render(
      <DataTable
        columns={COLUMNS}
        data={DATA}
        getRowId={(row) => row.id}
        label="Some"
        emptyState={{ title: 'x' }}
        selection={new Set(['a', 'b'])}
        onSelectionChange={vi.fn()}
        bulkActions={<Button variant="ghost" tone="neutral" size="sm" label="Archive" />}
      />,
    )
    const count = screen.getByText('2 selected')
    expect(count.getAttribute('aria-live')).toBe('polite')
    expect(screen.getByRole('button', { name: 'Archive' })).toBeTruthy()
  })

  it('keeps the table while loading and replaces it when empty', () => {
    // Two different states: loading shows placeholder rows, and empty replaces
    // the table with an EmptyState.
    const { container } = render(
      <DataTable
        columns={COLUMNS}
        data={[]}
        getRowId={(row) => row.id}
        label="Loading"
        emptyState={{ title: 'Nothing here' }}
        loading
      />,
    )
    const root = container.firstElementChild as HTMLElement
    expect(root.dataset['loading']).toBe('')
    expect(root.getAttribute('aria-busy')).toBe('true')
    expect(screen.getByRole('grid')).toBeTruthy()
    expect(screen.queryByText('Nothing here')).toBeNull()
  })

  it('shows the empty state when there is no data', () => {
    const { container } = render(
      <DataTable
        columns={COLUMNS}
        data={[]}
        getRowId={(row) => row.id}
        label="Empty"
        emptyState={{ title: 'Nothing here', description: 'Try a wider filter.' }}
      />,
    )
    const root = container.firstElementChild as HTMLElement
    expect(root.dataset['empty']).toBe('')
    expect(screen.getByText('Nothing here')).toBeTruthy()
    expect(screen.queryByRole('grid')).toBeNull()
  })

  it('does not type-check without an empty state', () => {
    // @ts-expect-error — `emptyState` is required, because every list needs one.
    const bad: DataTableProps<Row> = {
      columns: COLUMNS,
      data: DATA,
      getRowId: (r) => r.id,
      label: 'x',
    }
    expect(bad.data).toHaveLength(3)
  })
})

/**
 * An agent sorts a DataTable through the bridge, as the spec's `agent` fence declares
 * (`design/components/data-table.md`, Agent). The table withholds nothing, so its row Checkboxes
 * and the application's pager are listed within it.
 */
describe('DataTable, for an agent', () => {
  const DATA: Row[] = [
    { id: 'a', subject: 'Webhook retries', minutes: 4 },
    { id: 'b', subject: 'SSO loop', minutes: 26 },
  ]
  const COLUMNS: DataTableColumn<Row>[] = [
    { key: 'subject', header: 'Ticket', sortable: true },
    { key: 'id', header: 'Reference' },
    { key: 'minutes', header: 'Updated', numeric: true, sortable: true },
  ]

  it('sorts by a column as its header does, and refuses a column that does not sort', async () => {
    const bridge = createAgentBridge()
    try {
      const onSortChange = vi.fn()
      render(
        <DataTable
          columns={COLUMNS}
          data={DATA}
          getRowId={(row) => row.id}
          label="Tickets"
          emptyState={{ title: 'Nothing here', description: 'Try a wider filter.' }}
          sort={{ key: 'subject', direction: 'asc' }}
          onSortChange={onSortChange}
          selection={new Set(['b'])}
          onSelectionChange={vi.fn()}
          pagination={<Pagination page={1} pageCount={3} onPageChange={vi.fn()} />}
        />,
      )
      const { members } = bridge.snapshot()
      const grid = members.find((member) => member.member === 'DataTable')
      expect(grid).toMatchObject({
        state: {
          'sort-key': 'subject',
          'sort-direction': 'asc',
          columns: [
            { id: 'subject', label: 'Ticket' },
            { id: 'id', label: 'Reference', disabled: true },
            { id: 'minutes', label: 'Updated' },
          ],
          selection: ['b'],
          expanded: [],
          loading: false,
        },
      })
      // The row Checkboxes and the pager are members of their own, within the table.
      const within = members.filter((member) => member.within === grid?.id)
      expect(within.map((member) => member.member)).toEqual([
        'Checkbox',
        'Checkbox',
        'Checkbox',
        'Pagination',
      ])

      const down = await bridge.act([{ id: grid?.id, action: 'sort-descending', value: 'subject' }])
      expect(down.results[0]).toMatchObject({ ok: true })
      expect(onSortChange).toHaveBeenLastCalledWith({ key: 'subject', direction: 'desc' })

      // The column is sorted ascending already, so nothing is asked for.
      await bridge.act([{ id: grid?.id, action: 'sort-ascending', value: 'subject' }])
      expect(onSortChange).toHaveBeenCalledTimes(1)

      const refused = await bridge.act([{ id: grid?.id, action: 'sort-ascending', value: 'id' }])
      expect(refused.results[0]).toMatchObject({ ok: false, error: { code: 'invalid-value' } })
      expect(onSortChange).toHaveBeenCalledTimes(1)
    } finally {
      bridge.dispose()
    }
  })
})

/**
 * DataTable's own toolbar rows (`docs/layout.md`).
 *
 * The bulk bar and the pager follow the toolbar rule: they wrap, and below
 * `36rem` each cluster takes a full line. The container is the assembly, not the
 * window, because a narrow dashboard column is as cramped on a 27-inch monitor
 * as on a phone.
 */
describe('DataTable: the toolbar rows in their container', () => {
  const DATA: Row[] = [
    { id: 'a', subject: 'Webhook retries', minutes: 4 },
    { id: 'b', subject: 'SSO loop', minutes: 26 },
  ]

  const COLUMNS: DataTableColumn<Row>[] = [
    { key: 'subject', header: 'Ticket' },
    { key: 'minutes', header: 'Updated', numeric: true },
  ]

  function tableIn(width: number, props: Partial<DataTableProps<Row>> = {}) {
    const host = fixedWidthHost(width)
    render(
      <DataTable
        columns={COLUMNS}
        data={DATA}
        getRowId={(row) => row.id}
        label="Tickets"
        emptyState={{ title: 'Nothing here', description: 'Try a wider filter.' }}
        selection={new Set(['a', 'b'])}
        onSelectionChange={vi.fn()}
        bulkActions={
          <>
            <Button size="sm" variant="ghost" tone="neutral" label="Assign" />
            <Button size="sm" variant="soft" tone="danger" label="Close" />
          </>
        }
        {...props}
      />,
      { container: host },
    )
    const row = screen.getByText('2 selected').parentElement as HTMLElement
    return { host, row, clusters: [...row.children] as HTMLElement[] }
  }

  it('wraps the bulk bar, with one gap for both axes', () => {
    const { host, row } = tableIn(400)
    const style = getComputedStyle(row)
    expect(style.flexWrap).toBe('wrap')
    expect(style.rowGap).toBe(style.columnGap)
    host.remove()
  })

  it('gives the count and the actions a line each below 36rem', () => {
    const { host, row, clusters } = tableIn(400)
    expect(clusters).toHaveLength(2)
    expect(lines(clusters)).toBe(2)

    // Full width, so the actions form their own row rather than trailing the
    // count above them.
    const inner = row.getBoundingClientRect().width
    for (const cluster of clusters) {
      expect(cluster.getBoundingClientRect().width).toBeCloseTo(inner, 0)
    }
    host.remove()
  })

  it('keeps the count and actions on one line in a wide container', () => {
    const { host, clusters } = tableIn(900)
    expect(lines(clusters)).toBe(1)
    host.remove()
  })

  it('keeps the whole assembly inside its container at phone width', () => {
    // The phone-width requirement, as a unit test: nothing (bar, table or pager)
    // overflows its container.
    const { host } = tableIn(360, {
      pagination: <Pagination page={4} pageCount={9} onPageChange={vi.fn()} />,
    })
    const root = host.firstElementChild as HTMLElement
    expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth + 1)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
    host.remove()
  })
})
