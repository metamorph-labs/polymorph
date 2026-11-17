import { render } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'

import { FixtureBox } from '../conventions/FixtureBox'
import { assertGoverned } from '@polymorph/react'
import { fixedWidthHost, installTestTheme } from '@polymorph/engine/testing'
import { Grid, type GridColumns, type GridProps } from './Grid'
import { Inline, type InlineProps } from './Inline'
import { Stack, type StackProps } from './Stack'

/**
 * The three container widths the Grid's ceiling rule depends on, in px because
 * a host element takes px: 50rem, 31.25rem and 25rem against a 16px root. There
 * is one in each band of `44rem` / `28rem`, each far enough from an edge that a
 * scrollbar or a rounding difference cannot move it into the next band.
 */
const WIDE = 800
const MID = 500
const NARROW = 400

// Real CSS and a real cascade. These primitives do the token lookup in a
// stylesheet, so the assertions must go through one too.
let space: Record<number, string>

beforeAll(() => {
  const theme = installTestTheme()
  space = theme.tokens.density[theme.axes.density].space
})

function mount(node: React.ReactElement, container?: HTMLElement): HTMLElement {
  const result = render(node, container ? { container } : undefined)
  return (container ?? result.container).firstElementChild as HTMLElement
}

/** Plain cells: a fixture with a `min-width` would test the filler, not the grid. */
function Cells({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <div key={index}>{`cell ${index + 1}`}</div>
      ))}
    </>
  )
}

/**
 * How many cells share the first row: the column count as a reader sees it.
 *
 * Read from the boxes rather than from `grid-template-columns`, which reports
 * twelve at every count. The tracks are the implementation and the row is the
 * visible result. A test of the implementation would need rewriting whenever
 * someone changed it without changing what anybody sees.
 */
function columnsIn(root: HTMLElement): number {
  const cells = [...root.children] as HTMLElement[]
  const top = cells[0]?.getBoundingClientRect().top ?? 0
  return cells.filter((cell) => Math.abs(cell.getBoundingClientRect().top - top) < 1).length
}

describe('closed props', () => {
  it('leaves no way to style any of the three from a call site', () => {
    assertGoverned<StackProps>(true)
    assertGoverned<InlineProps>(true)
    assertGoverned<GridProps>(true)
  })
})

describe('Stack', () => {
  it('resolves gap through the space token, never a raw length', () => {
    const root = mount(
      <Stack gap={5}>
        <FixtureBox />
      </Stack>,
    )
    expect(getComputedStyle(root).rowGap).toBe(space[5])
    expect(root.dataset['gap']).toBe('5')
  })

  it('flows vertically', () => {
    const root = mount(<Stack />)
    const computed = getComputedStyle(root)
    expect(computed.display).toBe('flex')
    expect(computed.flexDirection).toBe('column')
  })

  it('lets px and py override p per axis, through source order', () => {
    const root = mount(<Stack p={5} py={2} />)
    const computed = getComputedStyle(root)
    expect(computed.paddingLeft).toBe(space[5])
    expect(computed.paddingRight).toBe(space[5])
    expect(computed.paddingTop).toBe(space[2])
    expect(computed.paddingBottom).toBe(space[2])
  })

  it('lets px override the inline axis alone', () => {
    const computed = getComputedStyle(mount(<Stack p={5} px={2} />))
    expect(computed.paddingLeft).toBe(space[2])
    expect(computed.paddingTop).toBe(space[5])
  })

  it('declares no padding at all when none is asked for', () => {
    const root = mount(<Stack gap={3} />)
    expect(root.hasAttribute('data-p')).toBe(false)
    expect(getComputedStyle(root).paddingTop).toBe('0px')
  })

  it('treats p={0} as a deliberate reset rather than an omission', () => {
    const root = mount(<Stack p={0} />)
    expect(root.dataset['p']).toBe('0')
  })

  it('applies align and justify from the enums', () => {
    const computed = getComputedStyle(mount(<Stack align="center" justify="between" />))
    expect(computed.alignItems).toBe('center')
    expect(computed.justifyContent).toBe('space-between')
  })

  it('renders list semantics through `as`, and strips the list box', () => {
    const root = mount(
      <Stack as="ul" gap={2}>
        <li>one</li>
      </Stack>,
    )
    expect(root.tagName).toBe('UL')
    const computed = getComputedStyle(root)
    expect(computed.listStyleType).toBe('none')
    expect(computed.paddingInlineStart).toBe('0px')
  })

  it('keeps padding working on a list, where the reset also sets padding', () => {
    const root = mount(<Stack as="ul" p={5} />)
    expect(getComputedStyle(root).paddingLeft).toBe(space[5])
  })

  it('paints nothing, so a Stack cannot become a surface', () => {
    const computed = getComputedStyle(mount(<Stack p={5} />))
    expect(computed.backgroundColor).toBe('rgba(0, 0, 0, 0)')
    expect(computed.borderTopWidth).toBe('0px')
    expect(computed.borderRadius).toBe('0px')
  })
})

describe('patch (exception ladder rung 3)', () => {
  it('re-assigns the named decision, overriding the base prop', () => {
    const root = mount(<Stack gap={6} patch={{ gap: 2 }} />)
    expect(getComputedStyle(root).rowGap).toBe(space[2])
  })

  it('leaves keys it does not mention alone', () => {
    const root = mount(<Stack gap={6} p={5} patch={{ gap: 2 }} />)
    expect(getComputedStyle(root).paddingTop).toBe(space[5])
  })

  it('cannot erase a base prop by naming it undefined', () => {
    const root = mount(<Stack gap={6} patch={{ gap: undefined }} />)
    expect(root.dataset['gap']).toBe('6')
  })
})

describe('Inline', () => {
  it('flows horizontally and centres mixed heights by default', () => {
    const root = mount(
      <Inline gap={3}>
        <FixtureBox tall />
        <FixtureBox />
      </Inline>,
    )
    const computed = getComputedStyle(root)
    expect(computed.flexDirection).toBe('row')
    expect(computed.alignItems).toBe('center')
  })

  it('wraps only when asked, with the row gap matching the column gap', () => {
    expect(getComputedStyle(mount(<Inline gap={3} />)).flexWrap).toBe('nowrap')
    const wrapped = getComputedStyle(mount(<Inline gap={3} wrap />))
    expect(wrapped.flexWrap).toBe('wrap')
    expect(wrapped.rowGap).toBe(wrapped.columnGap)
  })

  it('offers baseline alignment for runs of mixed type sizes', () => {
    expect(getComputedStyle(mount(<Inline align="baseline" />)).alignItems).toBe('baseline')
  })

  it('renders nav semantics through `as`', () => {
    expect(mount(<Inline as="nav" />).tagName).toBe('NAV')
  })
})

describe('Grid', () => {
  it('lays out equal tracks that content cannot widen', () => {
    // Needs a definite width. `1fr` has nothing to divide in an auto-sized box,
    // so the tracks would size to content, which is the bug `minmax(0, 1fr)`
    // prevents.
    //
    // Asserted from the cells rather than from `grid-template-columns`, because
    // the template is twelve tracks at every count and the column count is in
    // the spans. The test checks what the reader sees: three equal cells on one
    // row, none of them widened by the long label.
    const host = fixedWidthHost(WIDE)
    const root = mount(
      <Grid columns={3} gap={0}>
        <FixtureBox>a very long label that would otherwise widen its track</FixtureBox>
        <FixtureBox />
        <FixtureBox />
      </Grid>,
      host,
    )
    const widths = [...root.children].map((cell) => Math.round(cell.getBoundingClientRect().width))
    expect(widths).toHaveLength(3)
    expect(new Set(widths).size).toBe(1)
    expect(columnsIn(root)).toBe(3)
    host.remove()
  })

  it('defaults to two columns', () => {
    expect(mount(<Grid />).dataset['columns']).toBe('2')
  })

  it('gaps both axes from one token', () => {
    const computed = getComputedStyle(mount(<Grid columns={2} gap={5} />))
    expect(computed.rowGap).toBe(space[5])
    expect(computed.columnGap).toBe(space[5])
  })

  it('supports the twelve-column track for archetype regions', () => {
    const host = fixedWidthHost(WIDE)
    const root = mount(
      <Grid columns={12} gap={0}>
        <Cells count={12} />
      </Grid>,
      host,
    )
    expect(getComputedStyle(root).gridTemplateColumns.split(' ')).toHaveLength(12)
    expect(columnsIn(root)).toBe(12)
    host.remove()
  })
})

/**
 * The ceiling rule (`docs/layout.md`): `columns` is a ceiling, not a fixed
 * count. N at 44rem and up, `ceil(N/2)` from 28rem to 44rem, one below that.
 * Every count is tested at three widths, because the claim is one rule for
 * every N, and six hand-written rules are where mistakes happen.
 *
 * The width is given to the container, which here is the Grid itself. The
 * element declares `container-type: inline-size` and its children carry the
 * spans, since a container query is answered by the nearest ancestor container
 * and no element can answer its own. Nothing in these tests touches the
 * viewport. That is the difference between a container query and the media
 * query the shell owns.
 */
describe('Grid — the ceiling adapts to the container', () => {
  const CEILINGS: GridColumns[] = [1, 2, 3, 4, 6, 12]
  const halved = (columns: number) => Math.ceil(columns / 2)

  function gridAt(width: number, columns: GridColumns): { root: HTMLElement; host: HTMLElement } {
    const host = fixedWidthHost(width)
    const root = mount(
      <Grid columns={columns} gap={0}>
        <Cells count={12} />
      </Grid>,
      host,
    )
    return { root, host }
  }

  it('gives the full ceiling the container has room for', () => {
    for (const columns of CEILINGS) {
      const { root, host } = gridAt(WIDE, columns)
      expect(columnsIn(root), `${columns} columns at ${WIDE}px`).toBe(columns)
      host.remove()
    }
  })

  it('halves the ceiling, rounded up, in the middle band', () => {
    for (const columns of CEILINGS) {
      const { root, host } = gridAt(MID, columns)
      expect(columnsIn(root), `${columns} columns at ${MID}px`).toBe(halved(columns))
      host.remove()
    }
  })

  it('falls to a single column when there is room for one', () => {
    for (const columns of CEILINGS) {
      const { root, host } = gridAt(NARROW, columns)
      expect(columnsIn(root), `${columns} columns at ${NARROW}px`).toBe(1)
      host.remove()
    }
  })

  it('measures its own box, not the window', () => {
    // The same Grid, at the same moment, in two containers. This is the basis
    // of the container-first approach, and a media query cannot do it.
    const wide = gridAt(WIDE, 4)
    const narrow = gridAt(NARROW, 4)
    expect(columnsIn(wide.root)).toBe(4)
    expect(columnsIn(narrow.root)).toBe(1)
    wide.host.remove()
    narrow.host.remove()
  })

  it('matches the geometry of N equal tracks at full width', () => {
    // Twelve tracks are lawful only because they change nothing above the top
    // threshold: `12 / N` tracks plus the gaps inside them equal the width
    // `repeat(N, minmax(0, 1fr))` gives. Checked against the arithmetic rather
    // than a recorded number, at a real gap.
    const host = fixedWidthHost(WIDE)
    const root = mount(
      <Grid columns={3} gap={5}>
        <Cells count={3} />
      </Grid>,
      host,
    )
    const gap = Number.parseFloat(space[5] as string)
    const cell = (root.firstElementChild as HTMLElement).getBoundingClientRect().width
    expect(cell).toBeCloseTo((WIDE - gap * 2) / 3, 0)
    host.remove()
  })
})

describe('the space scale is the only vocabulary', () => {
  it('covers every step the theme emits', () => {
    // A step the primitives cannot express would be a token nobody can reach.
    for (const step of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const) {
      const root = mount(<Stack gap={step} />)
      expect(getComputedStyle(root).rowGap, `space.${step}`).toBe(space[step])
    }
  })
})
