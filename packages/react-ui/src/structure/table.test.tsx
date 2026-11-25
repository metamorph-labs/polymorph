import { useState, type ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import {
  appendThemeCSS,
  composeTheme,
  emitThemeCSS,
  exampleQuietSystem,
  exampleVioletPalette,
  resolveTheme,
} from '@polymorph/engine'
import { createAgentBridge } from '@polymorph/engine/agent'
import { Checkbox } from '../controls/Checkbox'
import { tokenColor } from '../controls/token-probe'
import { fixedWidthHost, installTestTheme } from '@polymorph/engine/testing'
import { Table, type CellProps, type HeaderProps, type RowProps, type TableProps } from './Table'

/**
 * Table: native semantics throughout, a sortable header that is a real button
 * with `aria-sort` on the cell, and a scroll region that is a tab stop only
 * while it scrolls.
 */

beforeAll(installTestTheme)

function Basic({ sortDirection, ...props }: TableProps & { sortDirection?: 'asc' | 'desc' }) {
  return (
    <Table {...props}>
      <Table.Head>
        <Table.Row>
          <Table.Header>Ticket</Table.Header>
          <Table.Header numeric sortable sortDirection={sortDirection}>
            Replies
          </Table.Header>
        </Table.Row>
      </Table.Head>
      <Table.Body>
        <Table.Row>
          <Table.Cell>T-1041</Table.Cell>
          <Table.Cell numeric>4</Table.Cell>
        </Table.Row>
      </Table.Body>
    </Table>
  )
}

describe('the closed surface', () => {
  it('has no style escape hatch, at any level of the composition', () => {
    assertGoverned<TableProps>(true)
    assertGoverned<RowProps>(true)
    assertGoverned<HeaderProps>(true)
    assertGoverned<CellProps>(true)
  })
})

describe('semantics', () => {
  it('is a real table, end to end', () => {
    render(<Basic />)
    expect(screen.getByRole('table')).toBeTruthy()
    expect(screen.getAllByRole('columnheader')).toHaveLength(2)
    expect(screen.getByRole('cell', { name: 'T-1041' })).toBeTruthy()
  })

  it('scopes its headers to their column', () => {
    render(<Basic />)
    for (const header of screen.getAllByRole('columnheader')) {
      expect(header.getAttribute('scope')).toBe('col')
    }
  })
})

/**
 * The table's own name.
 *
 * `label` names the scroll region only while it scrolls, so without a caption a
 * table that fits has no name, and chart twin tables read "table, table,
 * table". The caption reaches the accessibility tree and is drawn only on
 * request.
 */
describe('the caption', () => {
  it('names the table, whether or not anything is scrolling', () => {
    render(<Basic caption="Open tickets" />)
    expect(screen.getByRole('table', { name: 'Open tickets' })).toBeTruthy()
  })

  it('is the first child of the table, the only position where it is a caption', () => {
    const { container } = render(<Basic caption="Open tickets" />)
    const table = container.querySelector('table') as HTMLElement
    // Browsers handle a `<caption>` after the `<thead>` differently, and a
    // `Table.Caption` part could not have prevented that order.
    expect(table.firstElementChild?.tagName).toBe('CAPTION')
  })

  it('is announced without being drawn', () => {
    render(<Basic caption="Open tickets" />)
    const caption = document.querySelector('caption') as HTMLElement
    const style = getComputedStyle(caption)
    // The clip recipe, not `display: none`, which would remove it from the
    // accessibility tree as well and leave no name.
    expect(style.position).toBe('absolute')
    expect(style.clipPath).toBe('inset(50%)')
    expect(caption.getBoundingClientRect().height).toBeLessThanOrEqual(1)
    expect(screen.getByRole('table', { name: 'Open tickets' })).toBeTruthy()
  })

  it('is drawn on request, and still names the table', () => {
    render(<Basic caption="Open tickets" captionVisible />)
    const caption = document.querySelector('caption') as HTMLElement
    const style = getComputedStyle(caption)
    expect(style.position).toBe('static')
    expect(style.color).toBe(tokenColor('--pm-text-secondary'))
    // The UA centres a caption; nothing else in these recipes centres anything.
    expect(style.textAlign).toBe('start')
    expect(caption.getBoundingClientRect().height).toBeGreaterThan(1)
    expect(screen.getByRole('table', { name: 'Open tickets' })).toBeTruthy()
  })

  it('renders no caption element when there is no caption', () => {
    const { container } = render(<Basic />)
    expect(container.querySelector('caption')).toBeNull()
  })

  it('names a grid too, which is how DataTable uses it', () => {
    render(<Basic grid caption="Tickets" />)
    expect(screen.getByRole('grid', { name: 'Tickets' })).toBeTruthy()
  })
})

describe('sorting', () => {
  it('is a real button covering the header, so the keyboard can reach it', async () => {
    const onSort = vi.fn()
    render(
      <Table>
        <Table.Head>
          <Table.Row>
            <Table.Header sortable onSort={onSort}>
              Replies
            </Table.Header>
          </Table.Row>
        </Table.Head>
        <Table.Body>
          <Table.Row>
            <Table.Cell>4</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>,
    )
    const button = screen.getByRole('button', { name: /Replies/ })
    button.focus()
    await userEvent.keyboard('{Enter}')
    expect(onSort).toHaveBeenCalledTimes(1)
  })

  it('has no aria-sort until the column is sorted', () => {
    render(<Basic />)
    expect(screen.getAllByRole('columnheader')[1]?.hasAttribute('aria-sort')).toBe(false)
  })

  it('puts aria-sort on the header cell', () => {
    const { rerender } = render(<Basic sortDirection="asc" />)
    expect(screen.getAllByRole('columnheader')[1]?.getAttribute('aria-sort')).toBe('ascending')

    rerender(<Basic sortDirection="desc" />)
    expect(screen.getAllByRole('columnheader')[1]?.getAttribute('aria-sort')).toBe('descending')
  })

  it('swaps the glyph with the direction, and marks the active one', async () => {
    const { rerender } = render(<Basic />)
    const glyph = () => document.querySelector('th[data-sortable] svg') as SVGElement
    expect(glyph().dataset['icon']).toBe('sort')
    expect(getComputedStyle(glyph().parentElement as HTMLElement).color).toBe(
      tokenColor('--pm-text-muted'),
    )

    rerender(<Basic sortDirection="asc" />)
    expect(glyph().dataset['icon']).toBe('sort-asc')
    // The change to active *fades*, so the colour is read after the
    // control-duration transition ends.
    await vi.waitFor(() => {
      expect(getComputedStyle(glyph().parentElement as HTMLElement).color).toBe(
        tokenColor('--pm-accent-text'),
      )
    })

    rerender(<Basic sortDirection="desc" />)
    expect(glyph().dataset['icon']).toBe('sort-desc')
  })

  it('leaves the glyph decorative, because `aria-sort` carries the meaning', () => {
    render(<Basic sortDirection="asc" />)
    expect(
      (document.querySelector('th[data-sortable] svg') as SVGElement).getAttribute('aria-hidden'),
    ).toBe('true')
  })
})

describe('rows', () => {
  it('fires only when the row is interactive', async () => {
    const onClick = vi.fn()
    const { rerender } = render(
      <Table>
        <Table.Body>
          <Table.Row onClick={onClick}>
            <Table.Cell>T-1041</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>,
    )
    await userEvent.click(screen.getByRole('cell', { name: 'T-1041' }))
    expect(onClick, 'a non-interactive row fired').not.toHaveBeenCalled()

    rerender(
      <Table>
        <Table.Body>
          <Table.Row interactive onClick={onClick}>
            <Table.Cell>T-1041</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>,
    )
    await userEvent.click(screen.getByRole('cell', { name: 'T-1041' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('lets selection win over hover', () => {
    render(
      <Table>
        <Table.Body>
          <Table.Row interactive selected>
            <Table.Cell>Selected</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>,
    )
    const cell = screen.getByRole('cell', { name: 'Selected' })
    expect(getComputedStyle(cell).backgroundColor).toBe(tokenColor('--pm-accent-subtle'))
    // The hover rule excludes selected rows rather than relying on specificity,
    // so the reader's selection stays visible under the pointer.
    expect(cell.closest('tr')?.dataset['selected']).toBe('')
    // Visual only, and intentionally not `aria-selected`: that attribute belongs
    // to a `grid`, and axe correctly rejects it on a `table` row.
    expect(cell.closest('tr')?.hasAttribute('aria-selected')).toBe(false)
  })

  it('keeps the last row’s border, because the table needs a bottom edge', () => {
    render(<Basic />)
    const cells = screen.getAllByRole('cell')
    const last = cells[cells.length - 1] as HTMLElement
    expect(getComputedStyle(last).borderBottomStyle).toBe('solid')
    expect(getComputedStyle(last).borderBottomColor).toBe(tokenColor('--pm-border-subtle'))
  })
})

describe('numeric columns', () => {
  it('aligns to the end and uses tabular figures in the column’s own font', () => {
    render(<Basic />)
    const style = getComputedStyle(screen.getAllByRole('cell')[1] as HTMLElement)
    const root = getComputedStyle(document.documentElement)
    expect(root.getPropertyValue('--pm-numeric-align').trim()).toBe('end')
    expect(style.textAlign).toBe('end')
    expect(getComputedStyle(screen.getAllByRole('columnheader')[1] as HTMLElement).textAlign).toBe(
      'end',
    )
    // Figures come from the numeric token…
    expect(style.fontVariantNumeric).toBe(root.getPropertyValue('--pm-font-numeric').trim())
    // …and the column keeps the body font rather than switching to mono.
    // Compared without quotes, which are optional in CSS and dropped by WebKit's
    // computed value.
    const families = (list: string) => list.replaceAll('"', '')
    expect(families(style.fontFamily)).toBe(
      families(root.getPropertyValue('--pm-font-body').trim()),
    )
  })
})

describe('a system that aligns numeric columns to the start', () => {
  /** A host wearing the quiet example with `overrides.numeric.align: start`. */
  function startHost(): HTMLElement {
    const theme = resolveTheme(
      composeTheme(
        {
          ...exampleQuietSystem,
          name: 'example-numeric-start',
          overrides: { numeric: { align: 'start' } },
        },
        exampleVioletPalette,
      ),
    )
    appendThemeCSS(emitThemeCSS(theme), theme.name)
    const host = document.createElement('div')
    host.setAttribute('data-system', theme.system)
    host.setAttribute('data-palette', theme.palette)
    host.setAttribute('data-mode', 'light')
    document.body.append(host)
    return host
  }

  it('sets header, body and foot cells at the start, with tabular figures still on', () => {
    const host = startHost()
    const { container } = render(
      <Table>
        <Table.Head>
          <Table.Row>
            <Table.Header>Ticket</Table.Header>
            <Table.Header numeric sortable>
              Replies
            </Table.Header>
          </Table.Row>
        </Table.Head>
        <Table.Body>
          <Table.Row>
            <Table.Cell>T-1041</Table.Cell>
            <Table.Cell numeric>4</Table.Cell>
          </Table.Row>
        </Table.Body>
        <Table.Foot>
          <Table.Row>
            <Table.Cell>Total</Table.Cell>
            <Table.Cell numeric>4</Table.Cell>
          </Table.Row>
        </Table.Foot>
      </Table>,
      { container: host.appendChild(document.createElement('div')) },
    )
    const numeric = [...container.querySelectorAll('[data-numeric]')] as HTMLElement[]
    expect(numeric.map((cell) => cell.tagName)).toEqual(['TH', 'TD', 'TD'])
    const variants = getComputedStyle(host).getPropertyValue('--pm-font-numeric').trim()
    expect(variants).toContain('tabular-nums')
    for (const cell of numeric) {
      const style = getComputedStyle(cell)
      expect(style.textAlign, cell.textContent ?? '').toBe('start')
      expect(style.fontVariantNumeric, cell.textContent ?? '').toBe(variants)
    }
    // The figures sit at the cell's start edge, where a text column's label begins.
    const [header, body] = numeric as [HTMLElement, HTMLElement]
    const button = header.querySelector('button') as HTMLElement
    const range = document.createRange()
    range.selectNodeContents(body)
    const padding = parseFloat(getComputedStyle(body).paddingLeft)
    expect(range.getBoundingClientRect().left - body.getBoundingClientRect().left).toBeCloseTo(
      padding,
      0,
    )
    expect(button.getBoundingClientRect().left - header.getBoundingClientRect().left).toBeCloseTo(
      parseFloat(getComputedStyle(header).paddingLeft),
      0,
    )
    host.remove()
  })
})

describe('the foot', () => {
  function WithTotals() {
    return (
      <Table>
        <Table.Head>
          <Table.Row>
            <Table.Header>Ticket</Table.Header>
            <Table.Header numeric>Replies</Table.Header>
          </Table.Row>
        </Table.Head>
        <Table.Body>
          <Table.Row>
            <Table.Cell>T-1041</Table.Cell>
            <Table.Cell numeric>4</Table.Cell>
          </Table.Row>
          <Table.Row>
            <Table.Cell>T-1039</Table.Cell>
            <Table.Cell numeric>12</Table.Cell>
          </Table.Row>
        </Table.Body>
        <Table.Foot>
          <Table.Row>
            <Table.Cell>Total</Table.Cell>
            <Table.Cell numeric>16</Table.Cell>
          </Table.Row>
        </Table.Foot>
      </Table>
    )
  }

  const footCells = () => [...document.querySelectorAll('tfoot td')] as HTMLElement[]

  it('is a real tfoot of real cells', () => {
    render(<WithTotals />)
    expect(document.querySelector('tfoot')).not.toBeNull()
    expect(footCells()).toHaveLength(2)
  })

  it('is styled like the header, with the border moved to the top', () => {
    render(<WithTotals />)
    const [total] = footCells()
    const style = getComputedStyle(total as HTMLElement)
    const header = getComputedStyle(screen.getAllByRole('columnheader')[0] as HTMLElement)

    // Header styling: smallest step, uppercase, secondary colour.
    expect(style.textTransform).toBe('uppercase')
    expect(style.color).toBe(tokenColor('--pm-text-secondary'))
    expect(style.fontSize).toBe(header.fontSize)

    // The border is mirrored: the rule is on top, at the header's strength, and
    // there is no border below, because the foot is the table's bottom edge.
    expect(style.borderTopWidth).toBe('1px')
    expect(style.borderTopColor).toBe(tokenColor('--pm-border-default'))
    expect(style.borderBottomWidth).toBe('0px')
  })

  it('keeps numeric alignment, because a total uses the column’s own figures', () => {
    render(<WithTotals />)
    const numeric = footCells()[1] as HTMLElement
    expect(getComputedStyle(numeric).textAlign).toBe('end')
  })

  it('drops the last body row’s border, so there is one hairline, not two', () => {
    render(<WithTotals />)
    const bodyCells = [...document.querySelectorAll('tbody td')] as HTMLElement[]
    // The first body row keeps its border. The one above the foot drops it in
    // favour of the foot's stronger top rule.
    expect(getComputedStyle(bodyCells[0] as HTMLElement).borderBottomWidth).toBe('1px')
    expect(getComputedStyle(bodyCells[2] as HTMLElement).borderBottomWidth).toBe('0px')
  })

  it('keeps the last row’s border when there is no foot', () => {
    render(<Basic />)
    const cells = [...document.querySelectorAll('tbody td')] as HTMLElement[]
    expect(getComputedStyle(cells[cells.length - 1] as HTMLElement).borderBottomWidth).toBe('1px')
  })
})

describe('the scroll region', () => {
  it('is not a tab stop while everything fits', async () => {
    const { container } = render(<Basic />)
    const wrapper = container.firstElementChild as HTMLElement
    await vi.waitFor(() => expect(wrapper.hasAttribute('tabindex')).toBe(false))
    expect(wrapper.hasAttribute('role')).toBe(false)
  })

  it('becomes a named, focusable region once it actually overflows', async () => {
    const host = fixedWidthHost(120)
    render(
      <Table label="Tickets">
        <Table.Body>
          <Table.Row>
            <Table.Cell>A subject long enough that it cannot possibly fit in the box</Table.Cell>
            <Table.Cell>And a second column after it</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>,
      { container: host },
    )
    const wrapper = host.firstElementChild as HTMLElement
    await vi.waitFor(() => expect(wrapper.tabIndex).toBe(0))
    expect(wrapper.getAttribute('role')).toBe('region')
    expect(wrapper.getAttribute('aria-label')).toBe('Tickets')
    host.remove()
  })

  it('is focusable but not a landmark without a label', async () => {
    // An unnamed `region` is announced but cannot be identified, which is worse
    // than no landmark. The scrolling still needs a tab stop.
    const host = fixedWidthHost(120)
    render(
      <Table>
        <Table.Body>
          <Table.Row>
            <Table.Cell>A subject long enough that it cannot possibly fit in the box</Table.Cell>
            <Table.Cell>And a second column after it</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>,
      { container: host },
    )
    const wrapper = host.firstElementChild as HTMLElement
    await vi.waitFor(() => expect(wrapper.tabIndex).toBe(0))
    expect(wrapper.hasAttribute('role')).toBe(false)
    host.remove()
  })
})

/** Whether a box holds a point of the viewport. */
const inside = (rect: DOMRect, x: number, y: number) =>
  rect.left <= x && x <= rect.right && rect.top <= y && y <= rect.bottom

describe('the sticky header', () => {
  it('is not trapped inside a scroll container that never scrolls', async () => {
    // `overflow-x: auto` forces the block axis to `auto` too, so an
    // always-scrollable wrapper becomes the sticky header's scroll container,
    // and with no height it never scrolls, so the header never sticks.
    const { container } = render(<Basic stickyHeader />)
    const wrapper = container.firstElementChild as HTMLElement
    await vi.waitFor(() => expect(wrapper.hasAttribute('data-overflowing')).toBe(false))
    expect(getComputedStyle(wrapper).overflowX).toBe('visible')
  })

  it('sticks, and is opaque so rows do not scroll through it', () => {
    const { container } = render(<Basic stickyHeader />)
    expect((container.firstElementChild as HTMLElement).dataset['stickyHeader']).toBe('')
    const head = container.querySelector('thead') as HTMLElement
    expect(getComputedStyle(head).position).toBe('sticky')
    expect(getComputedStyle(head).backgroundColor).toBe(tokenColor('--pm-bg-surface'))
    // The edge is the border, never a shadow, because a flat theme has none.
    expect(getComputedStyle(head).boxShadow).toBe('none')
  })

  /**
   * Draws a table of twenty rows in a scroll port shorter than it, with
   * `first(index)` in each row's first cell, and scrolls the port through its
   * whole range in small steps. The boxes `passing` returns share the first
   * column, so one point of the first header cell is over each of them in
   * turn. At every step the header must be what is drawn on top at that point.
   */
  function scrollUnderHeader(
    first: (index: number) => ReactNode,
    passing: (port: HTMLElement) => HTMLElement[],
  ) {
    const port = fixedWidthHost(480)
    port.style.blockSize = '200px'
    port.style.overflowY = 'auto'
    render(
      <Table label="Tickets" stickyHeader>
        <Table.Head>
          <Table.Row>
            <Table.Header>Pick</Table.Header>
            <Table.Header>Ticket</Table.Header>
          </Table.Row>
        </Table.Head>
        <Table.Body>
          {Array.from({ length: 20 }, (_, index) => (
            <Table.Row key={index}>
              <Table.Cell>{first(index)}</Table.Cell>
              <Table.Cell>Ticket {index}</Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>,
      { container: port },
    )
    port.scrollIntoView()
    const head = port.querySelector('thead') as HTMLElement
    const header = screen.getByRole('columnheader', { name: 'Pick' })
    const boxes = passing(port)
    const x = (boxes[0] as HTMLElement).getBoundingClientRect().left + 8

    const last = port.scrollHeight - port.clientHeight
    expect(last).toBeGreaterThan(0)
    let crossings = 0
    for (let top = 0; top <= last; top += 4) {
      port.scrollTop = top
      const band = head.getBoundingClientRect()
      // The header is stuck: it has not moved with the rows.
      expect(Math.abs(band.top - port.getBoundingClientRect().top)).toBeLessThan(1)
      const y = band.top + band.height / 2
      if (boxes.some((box) => inside(box.getBoundingClientRect(), x, y))) crossings += 1
      const drawn = document.elementFromPoint(x, y)
      expect(
        header.contains(drawn),
        `at scroll ${top}, ${drawn?.tagName.toLowerCase()} is drawn over the header`,
      ).toBe(true)
    }
    // A box did pass behind the point, so the reading means something.
    expect(crossings).toBeGreaterThan(0)
    port.remove()
  }

  it('stays above a row’s checkbox that scrolls under it', () => {
    // A Checkbox's box is positioned, and a positioned box paints over an
    // earlier one that is not raised.
    scrollUnderHeader(
      (index) => <Checkbox aria-label={`Pick ticket ${index}`} checked={index === 4} />,
      () => screen.getAllByRole('checkbox'),
    )
  })

  it('stays above a part of a cell that its own member raises', () => {
    // A member lifts a part of itself on `raise`, as SplitButton lifts its
    // focused half. The lift is over that member's other parts, not the header.
    scrollUnderHeader(
      (index) => (
        <span data-raised="" style={{ position: 'relative', zIndex: 'var(--pm-z-raise)' }}>
          Raised {index}
        </span>
      ),
      (port) => Array.from(port.querySelectorAll<HTMLElement>('[data-raised]')),
    )
  })

  it('keeps its lift inside the table', () => {
    // A box on the same stacking step as the header, earlier in the page and
    // over the header's corner, as a shell's skip link can be.
    const port = fixedWidthHost(480)
    port.style.position = 'relative'
    render(
      <>
        <div
          data-testid="lifted"
          style={{
            position: 'absolute',
            zIndex: 'var(--pm-z-raise)',
            insetBlockStart: 0,
            insetInlineStart: 0,
            inlineSize: 48,
            blockSize: 24,
          }}
        />
        <Basic stickyHeader />
      </>,
      { container: port },
    )
    port.scrollIntoView()
    const lifted = screen.getByTestId('lifted')
    const box = lifted.getBoundingClientRect()
    const head = (port.querySelector('thead') as HTMLElement).getBoundingClientRect()
    // The box is over the header.
    expect(inside(head, box.left + box.width / 2, box.top + box.height / 2)).toBe(true)
    // The header is raised over its own rows, not over the page: the box is still on top.
    expect(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)).toBe(
      lifted,
    )
    port.remove()
  })

  it('has no border or radius of its own, because it is content, not a card', () => {
    const { container } = render(<Basic />)
    const wrapper = container.firstElementChild as HTMLElement
    expect(getComputedStyle(wrapper).borderTopWidth).toBe('0px')
    expect(getComputedStyle(wrapper).borderTopLeftRadius).toBe('0px')
  })
})

/**
 * The grid model (`structure/grid-keyboard.ts`): opt-in on Table, which owns the
 * `<table>`, for DataTable, which owns every cell. The tests cover what a plain
 * table keeps, what a grid gives up, and what it gains.
 */
describe('the grid model', () => {
  function Grid(props: Partial<TableProps> & { selected?: boolean; onOpen?: () => void } = {}) {
    const { selected, onOpen, ...table } = props
    return (
      <Table grid label="Tickets" {...table}>
        <Table.Head>
          <Table.Row>
            <Table.Header>
              <input type="checkbox" aria-label="Select all" />
            </Table.Header>
            <Table.Header>Ticket</Table.Header>
            <Table.Header numeric sortable>
              Replies
            </Table.Header>
          </Table.Row>
        </Table.Head>
        <Table.Body>
          <Table.Row selected={selected} interactive={onOpen !== undefined} onClick={onOpen}>
            <Table.Cell>
              <input type="checkbox" aria-label="Select T-1041" />
            </Table.Cell>
            <Table.Cell>T-1041</Table.Cell>
            <Table.Cell numeric>4</Table.Cell>
          </Table.Row>
          <Table.Row selected={selected === undefined ? undefined : false}>
            <Table.Cell>
              <input type="checkbox" aria-label="Select T-1038" />
            </Table.Cell>
            <Table.Cell>T-1038</Table.Cell>
            <Table.Cell numeric>9</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>
    )
  }

  /** Every element in the table that Tab would stop on. */
  function tabStops(root: HTMLElement): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>('*')).filter((node) => node.tabIndex === 0)
  }

  it('is a grid, not a table, which makes the rest of this lawful', () => {
    render(<Grid />)
    expect(screen.getByRole('grid')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()

    /*
     * The cells have no explicit role, on purpose: in a grid table a `<td>` is
     * already a `gridcell` and a `<tr>` a `row` (ARIA in HTML §4.5), and
     * hand-written copies drift. So the test asserts the absence.
     * `getAllByRole('gridcell')` would not work, because testing-library
     * resolves implicit roles from a static table and ignores the ancestor
     * condition, a limit of the library rather than of the page.
     */
    const cells = screen.getByRole('grid').querySelectorAll('td, th')
    expect(cells).toHaveLength(9)
    for (const cell of cells) expect(cell.hasAttribute('role')).toBe(false)
  })

  it('gives the whole table exactly one tab stop', () => {
    // Without the grid, a fifty-row table with a checkbox in every row has
    // fifty-one tab stops before the pagination below.
    render(<Grid />)
    expect(tabStops(screen.getByRole('grid'))).toHaveLength(1)
  })

  it('gives the stop to the cell’s own control when it has one', async () => {
    render(<Grid />)
    const grid = screen.getByRole('grid')
    // The first cell holds a checkbox, so the checkbox is the stop. Reaching it
    // and pressing Space is one action, not two.
    expect(tabStops(grid)[0]).toBe(screen.getByRole('checkbox', { name: 'Select all' }))
  })

  it('moves between cells with the arrow keys', async () => {
    render(<Grid />)
    await userEvent.tab()
    expect(document.activeElement).toBe(screen.getByRole('checkbox', { name: 'Select all' }))

    await userEvent.keyboard('{ArrowRight}')
    expect(document.activeElement?.textContent).toBe('Ticket')

    await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement?.textContent).toBe('T-1041')

    await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement?.textContent).toBe('T-1038')

    await userEvent.keyboard('{ArrowLeft}')
    expect(document.activeElement).toBe(screen.getByRole('checkbox', { name: 'Select T-1038' }))
  })

  it('stops at the edges', async () => {
    render(<Grid />)
    await userEvent.tab()
    await userEvent.keyboard('{ArrowUp}{ArrowLeft}')
    // Still the first cell of the header row. The grid handles its arrow keys,
    // so holding one down stops at the edge instead of scrolling the page.
    expect(document.activeElement).toBe(screen.getByRole('checkbox', { name: 'Select all' }))
  })

  it('moves Home and End to the row ends, and with Ctrl to the grid ends', async () => {
    render(<Grid />)
    await userEvent.tab()
    await userEvent.keyboard('{ArrowDown}{End}')
    expect(document.activeElement?.textContent).toBe('4')

    await userEvent.keyboard('{Home}')
    expect(document.activeElement).toBe(screen.getByRole('checkbox', { name: 'Select T-1041' }))

    await userEvent.keyboard('{Control>}{End}{/Control}')
    expect(document.activeElement?.textContent).toBe('9')

    await userEvent.keyboard('{Control>}{Home}{/Control}')
    expect(document.activeElement).toBe(screen.getByRole('checkbox', { name: 'Select all' }))
  })

  it('moves the stop to where the pointer clicked', async () => {
    render(<Grid />)
    const grid = screen.getByRole('grid')
    await userEvent.click(screen.getByText('T-1038'))
    // A click and an arrow key end in the same state, because both record only
    // focus.
    expect(tabStops(grid)).toHaveLength(1)
    await userEvent.keyboard('{ArrowRight}')
    expect(document.activeElement?.textContent).toBe('9')
  })

  it('does not take the arrow keys away from a plain table', async () => {
    const { container } = render(<Basic />)
    const table = container.querySelector('table') as HTMLElement
    expect(table.hasAttribute('role')).toBe(false)
    // No roving focus. A document is browsed with the reader's own keys, and
    // taking them to move a focus ring around text would only hurt.
    expect(table.querySelectorAll('td[tabindex], th[tabindex]')).toHaveLength(0)
  })
})

describe('selection semantics', () => {
  it('sets `aria-selected` in a grid but not in a table', () => {
    const { container: grid } = render(
      <Table grid>
        <Table.Body>
          <Table.Row selected>
            <Table.Cell>T-1041</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>,
    )
    expect(grid.querySelector('tr')?.getAttribute('aria-selected')).toBe('true')

    const { container: table } = render(
      <Table>
        <Table.Body>
          <Table.Row selected>
            <Table.Cell>T-1041</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>,
    )
    // The attribute belongs to a grid. In a table `selected` is only a fill, as
    // its documentation says.
    expect(table.querySelector('tr')?.hasAttribute('aria-selected')).toBe(false)
    expect(table.querySelector('tr')?.dataset['selected']).toBe('')
  })

  it('sets no aria-selected when the grid has no selection', () => {
    const { container } = render(
      <Table grid>
        <Table.Body>
          <Table.Row>
            <Table.Cell>T-1041</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>,
    )
    // `undefined` is the third value. A row announced as unselected in a grid
    // with no selection would tell the reader nothing.
    expect(container.querySelector('tr')?.hasAttribute('aria-selected')).toBe(false)
  })

  it('declares that rows can be selected in bulk', () => {
    render(<Basic grid multiselectable />)
    expect(screen.getByRole('grid').getAttribute('aria-multiselectable')).toBe('true')
  })
})

describe('opening a row from the keyboard', () => {
  it('opens on Enter from a cell', async () => {
    const onClick = vi.fn()
    render(
      <Table grid>
        <Table.Body>
          <Table.Row interactive onClick={onClick}>
            <Table.Cell>T-1041</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>,
    )
    await userEvent.tab()
    await userEvent.keyboard('{Enter}')
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('leaves Enter to a control inside the cell', async () => {
    const onClick = vi.fn()
    render(
      <Table grid>
        <Table.Body>
          <Table.Row interactive onClick={onClick}>
            <Table.Cell>
              <input type="checkbox" aria-label="Select T-1041" />
            </Table.Cell>
            <Table.Cell>T-1041</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>,
    )
    await userEvent.tab()
    expect(document.activeElement).toBe(screen.getByRole('checkbox', { name: 'Select T-1041' }))

    await userEvent.keyboard('{Enter}')
    // A control inside a cell handles its own Enter. Taking it would make a
    // checkbox navigate.
    expect(onClick).not.toHaveBeenCalled()

    // One cell over, the same key opens the row, which is the other half of the
    // rule.
    await userEvent.keyboard('{ArrowRight}{Enter}')
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

/**
 * Pan, do not crush (`docs/layout.md`).
 *
 * The wrapper is a query container that decides whether the table scrolls.
 * Below the narrow range the table keeps its intrinsic width and scrolls
 * instead of wrapping to one word per line.
 *
 * Widths are set on host elements and the window stays 1280 wide, on purpose: a
 * narrow panel on a wide monitor is cramped, and a media query would miss it.
 */
describe('the narrow container scrolls', () => {
  function Records() {
    return (
      <Table label="Tickets">
        <Table.Head>
          <Table.Row>
            <Table.Header>Ticket</Table.Header>
            <Table.Header>Requester</Table.Header>
            <Table.Header>Assignee</Table.Header>
            <Table.Header numeric>Replies</Table.Header>
          </Table.Row>
        </Table.Head>
        <Table.Body>
          <Table.Row>
            <Table.Cell>Webhook retries stalled</Table.Cell>
            <Table.Cell>marisol@northwind.example</Table.Cell>
            <Table.Cell>Priya Raman</Table.Cell>
            <Table.Cell numeric>4</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>
    )
  }

  function tableIn(width: number) {
    const host = fixedWidthHost(width)
    render(<Records />, { container: host })
    const wrapper = host.firstElementChild as HTMLElement
    return { host, wrapper, table: wrapper.firstElementChild as HTMLElement }
  }

  it('keeps its columns and scrolls instead', async () => {
    const { host, wrapper, table } = tableIn(320)

    await vi.waitFor(() => expect(wrapper.hasAttribute('data-overflowing')).toBe(true))
    expect(getComputedStyle(wrapper).overflowX).toBe('auto')
    expect(wrapper.scrollWidth).toBeGreaterThan(wrapper.clientWidth)
    // The table is as wide as its content needs, so the columns keep their
    // width.
    expect(table.getBoundingClientRect().width).toBeGreaterThan(wrapper.clientWidth)
    host.remove()
  })

  it('degrades layout but never content: every cell is still there', () => {
    const { host } = tableIn(320)
    // Nothing is hidden when space is tight (`docs/layout.md`). There is no
    // column priority, and none is added here.
    expect(screen.getAllByRole('columnheader')).toHaveLength(4)
    expect(screen.getByText('marisol@northwind.example')).toBeTruthy()
    host.remove()
  })

  it('never scrolls the window sideways', async () => {
    // The phone-width requirement: the box scrolls, and the page does not scroll
    // sideways with it.
    const { host, wrapper } = tableIn(320)
    await vi.waitFor(() => expect(wrapper.hasAttribute('data-overflowing')).toBe(true))
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
    host.remove()
  })

  it('leaves a wide enough container unchanged', async () => {
    // The other side of the threshold, and its reason: an unconditional minimum
    // would stop prose wrapping, so a table that fits would scroll on a desktop.
    const { host, wrapper } = tableIn(900)
    await vi.waitFor(() => expect(wrapper.hasAttribute('data-overflowing')).toBe(false))
    expect(wrapper.scrollWidth).toBe(wrapper.clientWidth)
    host.remove()
  })

  it('keeps the sticky header and the sort button working while scrolled', async () => {
    // In a scroll container, sticky positioning and in-cell controls are the
    // most likely to be silently broken by a layout change.
    const onSort = vi.fn()
    const host = fixedWidthHost(320)
    render(
      <Table label="Tickets" stickyHeader>
        <Table.Head>
          <Table.Row>
            <Table.Header sortable onSort={onSort}>
              A column heading long enough to force the pan
            </Table.Header>
            <Table.Header>Requester</Table.Header>
            <Table.Header>Assignee</Table.Header>
          </Table.Row>
        </Table.Head>
        <Table.Body>
          <Table.Row>
            <Table.Cell>Webhook retries stalled</Table.Cell>
            <Table.Cell>marisol@northwind.example</Table.Cell>
            <Table.Cell>Priya Raman</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>,
      { container: host },
    )

    const wrapper = host.firstElementChild as HTMLElement
    await vi.waitFor(() => expect(wrapper.hasAttribute('data-overflowing')).toBe(true))
    expect(getComputedStyle(host.querySelector('thead') as HTMLElement).position).toBe('sticky')

    const sort = screen.getByRole('button', { name: /A column heading/ })
    await userEvent.click(sort)
    expect(onSort).toHaveBeenCalledTimes(1)
    sort.focus()
    expect(document.activeElement).toBe(sort)
    host.remove()
  })
})

/**
 * An agent reads a plain Table's sortable headers and asks for a sort by one through the header's
 * own control, as the spec's `agent` fence declares (`design/components/table.md`, Agent), with
 * DataTable's state names. The caller holds the sort, so a press runs the caller's `onSort`, and
 * the caller decides the order.
 */
describe('an agent', () => {
  type Sort = { key: string; direction: 'asc' | 'desc' } | null

  /** A table whose caller holds the sort as an application does: a press sorts its column, and a second press reverses it. */
  function Sorted({
    onSort,
    follows = true,
  }: {
    onSort: (key: string) => void
    follows?: boolean
  }) {
    const [sort, setSort] = useState<Sort>(null)
    const header = (key: string) => (
      <Table.Header
        sortable
        sortDirection={sort?.key === key ? sort.direction : undefined}
        onSort={() => {
          onSort(key)
          if (!follows) return
          setSort(
            sort?.key === key && sort.direction === 'asc'
              ? { key, direction: 'desc' }
              : { key, direction: 'asc' },
          )
        }}
      >
        {key}
      </Table.Header>
    )
    return (
      <Table label="Tickets">
        <Table.Head>
          <Table.Row>
            <Table.Header>Ticket</Table.Header>
            {header('Subject')}
            {header('Replies')}
          </Table.Row>
        </Table.Head>
        <Table.Body>
          <Table.Row>
            <Table.Cell>T-1041</Table.Cell>
            <Table.Cell>Login loop</Table.Cell>
            <Table.Cell numeric>4</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>
    )
  }

  it('reads the sortable headers, and asks for a sort with one press the caller answers', async () => {
    const onSort = vi.fn()
    render(<Sorted onSort={onSort} />)
    const bridge = createAgentBridge()
    try {
      const [table] = bridge.snapshot().members
      expect(table).toMatchObject({
        member: 'Table',
        state: {
          'sort-key': null,
          'sort-direction': '',
          columns: [
            { id: 'Subject', label: 'Subject' },
            { id: 'Replies', label: 'Replies' },
          ],
        },
        actions: [{ name: 'sort', argument: 'id' }],
      })
      const { results } = await bridge.act([
        { id: table?.id, action: 'sort', value: 'Replies' },
        { id: table?.id, action: 'sort', value: 'Replies' },
        { id: table?.id, action: 'sort', value: 'Subject' },
      ])
      // The caller starts a column ascending and reverses the sorted one.
      expect(results).toMatchObject([
        {
          ok: true,
          changed: {
            'sort-key': { from: null, to: 'Replies' },
            'sort-direction': { from: '', to: 'asc' },
          },
        },
        { ok: true, changed: { 'sort-direction': { from: 'asc', to: 'desc' } } },
        {
          ok: true,
          changed: {
            'sort-key': { from: 'Replies', to: 'Subject' },
            'sort-direction': { from: 'desc', to: 'asc' },
          },
        },
      ])
      expect(onSort.mock.calls).toEqual([['Replies'], ['Replies'], ['Subject']])
      expect(screen.getByRole('columnheader', { name: /Subject/ }).getAttribute('aria-sort')).toBe(
        'ascending',
      )
      const refused = await bridge.act([{ id: table?.id, action: 'sort', value: 'Ticket' }])
      expect(refused.results[0]).toMatchObject({ ok: false, error: { code: 'invalid-value' } })
    } finally {
      bridge.dispose()
    }
  })

  it('presses once for a caller that does not answer, and changes nothing', async () => {
    const onSort = vi.fn()
    render(<Sorted onSort={onSort} follows={false} />)
    const bridge = createAgentBridge()
    try {
      const [table] = bridge.snapshot().members
      const { results } = await bridge.act([{ id: table?.id, action: 'sort', value: 'Replies' }])
      expect(results[0]).toEqual({ ok: true, id: table?.id, changed: {} })
      expect(onSort).toHaveBeenCalledTimes(1)
    } finally {
      bridge.dispose()
    }
  })

  it('lists a table with no sortable header with no column', () => {
    render(
      <Table label="Tickets">
        <Table.Head>
          <Table.Row>
            <Table.Header>Ticket</Table.Header>
          </Table.Row>
        </Table.Head>
        <Table.Body>
          <Table.Row>
            <Table.Cell>T-1041</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>,
    )
    const bridge = createAgentBridge()
    try {
      expect(bridge.snapshot().members).toMatchObject([
        { member: 'Table', state: { 'sort-key': null, 'sort-direction': '', columns: [] } },
      ])
    } finally {
      bridge.dispose()
    }
  })
})
