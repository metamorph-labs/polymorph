import { getByRole } from '@testing-library/dom'
import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

/**
 * The law for what a Treemap draws and says (`design/components/treemap.md`),
 * which every web shell's Treemap test calls with a mount of its own. The
 * chart tier has no contract fence, and the contract grammar reads one part's
 * role, name or attribute: it cannot state that the tiles cover the plot with
 * areas proportional to their values, which labels fit, or what the live
 * region says as the reader walks the tiles. This law reads those from the
 * drawn chart, in every renderer.
 *
 * The law sets the width of the page's body to draw a chart at phone width
 * and wide, and the document's direction to draw it right to left, and puts
 * both back after each test. It focuses the plot from a script, because Tab
 * does not stop on every element in WebKit.
 */

/** An item as the law passes it, in the shape of the member's `TreemapItem`. */
export interface TreemapLawItem {
  key: string
  label: string
  value: number
  children?: TreemapLawItem[]
}

/** The props the law mounts a Treemap with. A prop the law leaves out is not passed. */
export interface TreemapLawProps {
  items: TreemapLawItem[]
  label: string
  size?: 'sm' | 'md' | 'lg'
  onSelect?: (selection: { key: string; label: string; value: number; share: number }) => void
}

export interface TreemapLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /** Mounts one Treemap with these props, and no other chart. */
  mount(props: TreemapLawProps): Promise<unknown>
}

/** Relay's storage by kind, the spec's first state. Its total is 1,000. */
const STORAGE: TreemapLawItem[] = [
  { key: 'attachments', label: 'Attachments', value: 420 },
  { key: 'images', label: 'Inline images', value: 260 },
  { key: 'exports', label: 'Exports', value: 180 },
  { key: 'audit', label: 'Audit log', value: 90 },
  { key: 'avatars', label: 'Avatars', value: 50 },
]

/** Two groups and a group of one. Its total is 1,000. */
const TEAMS: TreemapLawItem[] = [
  {
    key: 'support',
    label: 'Support',
    value: 500,
    children: [
      { key: 'email', label: 'Email', value: 300 },
      { key: 'chat', label: 'Chat', value: 200 },
    ],
  },
  {
    key: 'sales',
    label: 'Sales',
    value: 300,
    children: [
      { key: 'demos', label: 'Demos', value: 200 },
      { key: 'calls', label: 'Calls', value: 100 },
    ],
  },
  { key: 'legal', label: 'Legal', value: 200 },
]

const LONG = 'Archived exports from the previous storage provider, kept for audit'

/** The one Treemap on the page. */
const figure = (): HTMLElement => {
  const element = document.querySelector<HTMLElement>('[data-member="treemap"]')
  if (element === null) throw new Error('the Treemap rendered nothing')
  return element
}

const surface = () => figure().querySelector<HTMLElement>('[role="img"]') as HTMLElement
const live = () => figure().querySelector<HTMLElement>('[aria-live="polite"]') as HTMLElement
const tiles = () => [...figure().querySelectorAll<SVGRectElement>('rect[class*="tile"]')]
const hits = () => [...figure().querySelectorAll<SVGRectElement>('rect[class*="hit"]')]
const plates = () => [
  ...surface().querySelectorAll<HTMLElement>(':scope > div[aria-hidden="true"] > span'),
]

/**
 * Waits until the plot is measured, every item with a value has its tile, and
 * the entrance has ended.
 */
async function drawn(count: number): Promise<void> {
  await vi.waitFor(() => expect(tiles()).toHaveLength(count))
  await Promise.all(
    figure()
      .getAnimations({ subtree: true })
      .map((motion) => motion.finished),
  )
}

async function openTwin(label: string): Promise<HTMLTableElement> {
  await userEvent.click(getByRole(figure(), 'button', { name: /show the data table/i }))
  return (await vi.waitFor(() =>
    getByRole(figure(), 'table', { name: `${label} — data` }),
  )) as HTMLTableElement
}

const cells = (table: HTMLTableElement) =>
  [...table.querySelectorAll('tbody tr')].map((row) =>
    [...row.querySelectorAll('td, th')].map((cell) => cell.textContent?.trim() ?? ''),
  )

interface Box {
  x: number
  y: number
  width: number
  height: number
}

/**
 * A tile's rectangle in the layout: its painted box grown back by the gap. In
 * a treemap of one level every side is 1px in, half of the 2px gap.
 */
const layoutOf = (tile: SVGRectElement): Box => {
  const box = tile.getBBox()
  return { x: box.x - 1, y: box.y - 1, width: box.width + 2, height: box.height + 2 }
}

const overlaps = (a: Box, b: Box) =>
  Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0.01 &&
  Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0.01

/**
 * The tiles of a one-level treemap cover the plot with no overlap, each with
 * the area its value takes of the total, within a pixel along its edges.
 */
function expectTiling(values: readonly number[]): void {
  const plot = surface().getBoundingClientRect()
  const svg = surface().querySelector('svg') as SVGSVGElement
  const width = Number(svg.getAttribute('width'))
  const height = Number(svg.getAttribute('height'))
  expect(Math.abs(width - plot.width)).toBeLessThanOrEqual(1)
  const boxes = tiles().map(layoutOf)
  const total = values.reduce((sum, value) => sum + value, 0)
  const sorted = [...values].sort((a, b) => b - a)
  boxes.forEach((box, index) => {
    const expected = ((sorted[index] ?? 0) / total) * width * height
    expect(Math.abs(box.width * box.height - expected)).toBeLessThanOrEqual(
      box.width + box.height + 1,
    )
    expect(box.x).toBeGreaterThanOrEqual(-0.01)
    expect(box.y).toBeGreaterThanOrEqual(-0.01)
    expect(box.x + box.width).toBeLessThanOrEqual(width + 0.01)
    expect(box.y + box.height).toBeLessThanOrEqual(height + 0.01)
  })
  const covered = boxes.reduce((sum, box) => sum + box.width * box.height, 0)
  expect(Math.abs(covered - width * height)).toBeLessThanOrEqual(width + height)
  for (let a = 0; a < boxes.length; a += 1) {
    for (let b = a + 1; b < boxes.length; b += 1) {
      expect(overlaps(boxes[a] as Box, boxes[b] as Box), `tiles ${a} and ${b}`).toBe(false)
    }
  }
}

/** The colour a value of `--pm-bg-surface` paints, read from a probe in the figure. */
function surfaceColour(): string {
  const probe = document.createElement('span')
  probe.style.setProperty('background-color', 'var(--pm-bg-surface)')
  figure().append(probe)
  const colour = getComputedStyle(probe).backgroundColor
  probe.remove()
  return colour
}

export function treemapLaw({ shell, mount }: TreemapLaw): void {
  describe(`Treemap — the ${shell} shell`, () => {
    beforeAll(installTestTheme)

    afterEach(() => {
      document.documentElement.removeAttribute('dir')
      document.body.style.removeProperty('inline-size')
    })

    it('is a named figure with a plot image, a summary and the twin of every item', async () => {
      await mount({ items: STORAGE, label: 'Storage' })
      await drawn(5)
      expect(figure().tagName).toBe('FIGURE')
      expect(figure().getAttribute('aria-label')).toBe('Storage')
      expect(getByRole(figure(), 'img', { name: 'Storage' })).toBe(surface())
      expect(figure().textContent).toContain(
        'Storage, 5 items. The same data is available as a table.',
      )
      // One level: one colour and no legend.
      expect(figure().querySelector('ul[data-key-shape]')).toBeNull()
      expect(new Set(tiles().map((tile) => getComputedStyle(tile).fill)).size).toBe(1)
      const table = await openTwin('Storage')
      expect([...table.querySelectorAll('thead th')].map((cell) => cell.textContent)).toEqual([
        'Item',
        'Value',
        'Share',
      ])
      expect(cells(table)).toEqual([
        ['Attachments', '420', '42%'],
        ['Inline images', '260', '26%'],
        ['Exports', '180', '18%'],
        ['Audit log', '90', '9%'],
        ['Avatars', '50', '5%'],
      ])
    })

    it('covers the plot with tiles, largest first, each area its share of the whole', async () => {
      await mount({ items: STORAGE, label: 'Tiling' })
      await drawn(5)
      expectTiling(STORAGE.map((item) => item.value))
    })

    for (const [name, width, size] of [
      ['at phone width', '343px', 'md'],
      ['in a wide short plot', '1200px', 'sm'],
    ] as const) {
      it(`covers the plot ${name}, and never pans the page`, async () => {
        document.body.style.setProperty('inline-size', width)
        await mount({ items: STORAGE, label: 'Sized', size })
        await drawn(5)
        expectTiling(STORAGE.map((item) => item.value))
        expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
          Math.max(window.innerWidth, Number.parseFloat(width)),
        )
      })
    }

    it('draws two levels: a group’s items in its colour, a legend of the groups, and the group in the twin', async () => {
      await mount({ items: TEAMS, label: 'Teams' })
      await drawn(5)
      const fills = tiles().map((tile) => getComputedStyle(tile).fill)
      // Reading order: Support's two, Sales' two, then Legal.
      expect(fills[0]).toBe(fills[1])
      expect(fills[2]).toBe(fills[3])
      expect(new Set([fills[0], fills[2], fills[4]]).size).toBe(3)
      const legend = figure().querySelector('ul[data-key-shape="rect"]')
      expect([...(legend?.querySelectorAll('li') ?? [])].map((item) => item.textContent)).toEqual([
        'Support',
        'Sales',
        'Legal',
      ])
      expect(figure().textContent).toContain('Teams, 5 items in 3 groups.')
      const table = await openTwin('Teams')
      expect(cells(table)).toEqual([
        ['Support', 'Email', '300', '30%'],
        ['Support', 'Chat', '200', '20%'],
        ['Sales', 'Demos', '200', '20%'],
        ['Sales', 'Calls', '100', '10%'],
        ['Legal', 'Legal', '200', '20%'],
      ])
    })

    it('labels a tile on a surface plate where the label and the value fit, and nowhere else', async () => {
      await mount({
        items: [
          { key: 'video', label: 'Video', value: 900 },
          { key: 'long', label: LONG, value: 80 },
          { key: 'tiny', label: 'Tiny', value: 20 },
        ],
        label: 'Labels',
      })
      await drawn(3)
      const shown = plates()
      expect(shown.map((plate) => plate.textContent)).toEqual(['Video900'])
      const plate = shown[0] as HTMLElement
      // Inside its tile, every word whole, on the surface colour.
      const tile = (tiles()[0] as SVGRectElement).getBoundingClientRect()
      const box = plate.getBoundingClientRect()
      expect(box.left).toBeGreaterThanOrEqual(tile.left)
      expect(box.top).toBeGreaterThanOrEqual(tile.top)
      expect(box.right).toBeLessThanOrEqual(tile.right)
      expect(box.bottom).toBeLessThanOrEqual(tile.bottom)
      for (const word of plate.querySelectorAll<HTMLElement>('span')) {
        expect(word.scrollWidth, word.textContent ?? '').toBeLessThanOrEqual(word.clientWidth + 1)
      }
      expect(getComputedStyle(plate).backgroundColor).toBe(surfaceColour())
    })

    it('draws every tiny item beside a huge one, at least a pixel across, with a 24px target', async () => {
      const items = [
        { key: 'huge', label: 'Huge', value: 100_000 },
        ...Array.from({ length: 30 }, (_, index) => ({
          key: `t${index}`,
          label: `Tiny ${index}`,
          value: 1,
        })),
      ]
      await mount({ items, label: 'Skewed' })
      await drawn(31)
      for (const tile of tiles()) {
        const box = tile.getBBox()
        expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(0.99)
      }
      for (const hit of hits()) {
        const box = hit.getBBox()
        // An engine may keep a box in single precision, so 24 can read as 23.999998.
        expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(24 - 0.001)
      }
    })

    it('leaves out an item with no positive value, and lists and counts it', async () => {
      await mount({
        items: [
          { key: 'a', label: 'Kept', value: 40 },
          { key: 'zero', label: 'Empty', value: 0 },
          { key: 'minus', label: 'Credit', value: -5 },
        ],
        label: 'Absent',
      })
      await drawn(1)
      expect(figure().textContent).toContain(
        'Absent, 3 items. 2 have no positive value and are not drawn.',
      )
      const table = await openTwin('Absent')
      expect(cells(table)).toEqual([
        ['Kept', '40', '100%'],
        ['Empty', '0', '—'],
        ['Credit', '-5', '—'],
      ])
    })

    it('walks the tiles largest first with the arrow keys, Home and End, and says each one', async () => {
      await mount({ items: TEAMS, label: 'Keys' })
      await drawn(5)
      surface().focus()
      expect(live().textContent, 'a resting pointer had already set the position').toBe('')
      await userEvent.keyboard('{ArrowRight}')
      await vi.waitFor(() => expect(live().textContent).toBe('Support, Email: 300, 30%'))
      expect(figure().querySelectorAll('rect[data-active]')).toHaveLength(1)
      await userEvent.keyboard('{ArrowRight}{ArrowRight}')
      await vi.waitFor(() => expect(live().textContent).toBe('Sales, Demos: 200, 20%'))
      await userEvent.keyboard('{End}')
      await vi.waitFor(() => expect(live().textContent).toBe('Legal: 200, 20%'))
      await userEvent.keyboard('{Home}')
      await vi.waitFor(() => expect(live().textContent).toBe('Support, Email: 300, 30%'))
      await userEvent.keyboard('{Escape}')
      await vi.waitFor(() => expect(figure().querySelectorAll('rect[data-active]')).toHaveLength(0))
    })

    it('reports the item read on Enter and on a press, with its share, through onSelect', async () => {
      const onSelect = vi.fn()
      await mount({ items: STORAGE, label: 'Selectable', onSelect })
      await drawn(5)
      surface().focus()
      await userEvent.keyboard('{ArrowRight}{ArrowRight}{Enter}')
      await vi.waitFor(() =>
        expect(onSelect).toHaveBeenCalledWith({
          key: 'images',
          label: 'Inline images',
          value: 260,
          share: 0.26,
        }),
      )
      onSelect.mockClear()
      await userEvent.click(hits()[0] as SVGRectElement)
      await vi.waitFor(() =>
        expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ key: 'attachments' })),
      )
    })

    it('shows the item under the pointer, with its group as the tooltip’s header', async () => {
      await mount({ items: TEAMS, label: 'Pointer' })
      await drawn(5)
      await userEvent.hover(hits()[2] as SVGRectElement)
      const tooltip = await vi.waitFor(() => {
        const element = figure().querySelector<HTMLElement>('[class*="tooltip"]')
        expect(element).not.toBeNull()
        return element as HTMLElement
      })
      expect(tooltip.textContent).toContain('Sales')
      expect(tooltip.textContent).toContain('200 · 20%')
      expect(tooltip.textContent).toContain('Demos')
    })

    it('shows the empty sentence for no items', async () => {
      await mount({ items: [], label: 'Nothing' })
      await vi.waitFor(() => expect(figure().getAttribute('data-state')).toBe('empty'))
      expect(figure().textContent).toContain('No data yet')
      expect(tiles()).toHaveLength(0)
    })

    it('puts the largest tile at the inline start in a right-to-left document', async () => {
      document.documentElement.setAttribute('dir', 'rtl')
      await mount({ items: STORAGE, label: 'Right to left' })
      await drawn(5)
      const plot = surface().getBoundingClientRect()
      const largest = (tiles()[0] as SVGRectElement).getBoundingClientRect()
      // 1px in from the plot's right edge, half the gap.
      expect(Math.abs(plot.right - largest.right - 1)).toBeLessThanOrEqual(0.5)
      expect(Math.abs(largest.top - plot.top - 1)).toBeLessThanOrEqual(0.5)
      const plate = plates()[0] as HTMLElement
      const box = plate.getBoundingClientRect()
      expect(box.right).toBeLessThanOrEqual(largest.right)
      expect(box.left).toBeGreaterThanOrEqual(largest.left)
      expect(Math.abs(largest.right - box.right - 4)).toBeLessThanOrEqual(0.5)
    })
  })
}
