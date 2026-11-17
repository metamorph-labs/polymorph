import { describe, expect, it } from 'vitest'

import { readingView } from './reading'
import {
  squarify,
  treemapModel,
  treemapReadout,
  treemapSelection,
  type TreemapInput,
  type TreemapItem,
  type TreemapRect,
} from './treemap'

/**
 * Treemap's layout and model, without a framework: what the React member and
 * every described member draw. The members' tests and the shared law cover
 * the DOM; these cover what the engine decides: rectangles that tile the box
 * with areas proportional to their values, the order, the colours, the gaps,
 * which labels fit, what an item with no value does, the readout and the
 * selection.
 */

const STORAGE: TreemapItem[] = [
  { key: 'video', label: 'Video', value: 420 },
  { key: 'images', label: 'Images', value: 260 },
  { key: 'backups', label: 'Backups', value: 180 },
  { key: 'logs', label: 'Logs', value: 90 },
  { key: 'other', label: 'Other', value: 50 },
]

const TEAMS: TreemapItem[] = [
  {
    key: 'support',
    label: 'Support',
    value: 300,
    children: [
      { key: 'email', label: 'Email', value: 180 },
      { key: 'chat', label: 'Chat', value: 120 },
    ],
  },
  {
    key: 'sales',
    label: 'Sales',
    value: 200,
    children: [
      { key: 'demos', label: 'Demos', value: 150 },
      { key: 'calls', label: 'Calls', value: 50 },
    ],
  },
  { key: 'legal', label: 'Legal', value: 100 },
]

const BOX = { width: 600, height: 300 }

const input = (over: Partial<TreemapInput> = {}): TreemapInput => ({
  items: STORAGE,
  label: 'Storage',
  locale: 'en-US',
  box: BOX,
  ...over,
})

const area = (rect: TreemapRect) => rect.width * rect.height

/** Whether two rectangles share more than a hairline. */
const overlap = (a: TreemapRect, b: TreemapRect) =>
  Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1e-6 &&
  Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1e-6

/** The rectangles cover the box: no overlap, inside it, and their areas sum to its area. */
function expectTiling(rects: readonly TreemapRect[], box: TreemapRect) {
  const total = rects.reduce((sum, rect) => sum + area(rect), 0)
  expect(total).toBeCloseTo(area(box), 6)
  for (const rect of rects) {
    expect(rect.x).toBeGreaterThanOrEqual(box.x - 1e-6)
    expect(rect.y).toBeGreaterThanOrEqual(box.y - 1e-6)
    expect(rect.x + rect.width).toBeLessThanOrEqual(box.x + box.width + 1e-6)
    expect(rect.y + rect.height).toBeLessThanOrEqual(box.y + box.height + 1e-6)
  }
  for (let a = 0; a < rects.length; a += 1) {
    for (let b = a + 1; b < rects.length; b += 1) {
      expect(overlap(rects[a] as TreemapRect, rects[b] as TreemapRect), `${a} and ${b}`).toBe(false)
    }
  }
}

describe('squarify', () => {
  it('tiles the box, each area proportional to its value', () => {
    const values = [6, 6, 4, 3, 2, 2, 1]
    const box = { x: 0, y: 0, width: 600, height: 400 }
    const rects = squarify(values, box)
    expectTiling(rects, box)
    const unit = area(box) / values.reduce((sum, value) => sum + value, 0)
    rects.forEach((rect, index) => expect(area(rect)).toBeCloseTo((values[index] ?? 0) * unit, 6))
  })

  it('lays the paper’s example out as the paper does: the first row is two rectangles of 6', () => {
    // Bruls, Huizing and van Wijk's worked example: 6 6 4 3 2 2 1 in a 6 × 4 box.
    const rects = squarify([6, 6, 4, 3, 2, 2, 1], { x: 0, y: 0, width: 6, height: 4 })
    expect(rects[0]).toEqual({ x: 0, y: 0, width: 3, height: 2 })
    expect(rects[1]).toEqual({ x: 0, y: 2, width: 3, height: 2 })
  })

  it('gives the same rectangles for the same values and box', () => {
    const box = { x: 0, y: 0, width: 333, height: 211 }
    expect(squarify([9, 7, 7, 3, 1], box)).toEqual(squarify([9, 7, 7, 3, 1], box))
  })

  it('keeps rectangles near square in a narrow tall box and a wide short one', () => {
    for (const box of [
      { x: 0, y: 0, width: 60, height: 600 },
      { x: 0, y: 0, width: 900, height: 60 },
    ]) {
      const rects = squarify([5, 4, 3, 2, 1], box)
      expectTiling(rects, box)
      for (const rect of rects) {
        expect(Math.max(rect.width / rect.height, rect.height / rect.width)).toBeLessThan(6)
      }
    }
  })

  it('returns nothing for no values and empty rectangles for an empty box', () => {
    expect(squarify([], { x: 0, y: 0, width: 10, height: 10 })).toEqual([])
    expect(squarify([1, 2], { x: 0, y: 0, width: 0, height: 10 })).toEqual([
      { x: 0, y: 0, width: 0, height: 0 },
      { x: 0, y: 0, width: 0, height: 0 },
    ])
  })
})

describe('treemapModel', () => {
  it('tiles the plot with one tile per item, largest first, each area its share of the total', () => {
    const model = treemapModel(input())
    const tiles = model.plot?.tiles ?? []
    expect(tiles.map((tile) => tile.key)).toEqual(['video', 'images', 'backups', 'logs', 'other'])
    expectTiling(
      tiles.map((tile) => tile.rect),
      { x: 0, y: 0, ...BOX },
    )
    tiles.forEach((tile) => {
      const leaf = model.leaves[tile.index]
      expect(area(tile.rect) / area({ x: 0, y: 0, ...BOX })).toBeCloseTo(
        (leaf?.value ?? 0) / model.total,
        6,
      )
    })
    // The largest sits at the start.
    expect(tiles[0]?.rect.x).toBe(0)
    expect(tiles[0]?.rect.y).toBe(0)
  })

  it('paints a one-level treemap in one colour, with no legend', () => {
    const model = treemapModel(input())
    expect(model.grouped).toBe(false)
    expect(model.legend).toBe(false)
    expect(new Set(model.plot?.tiles.map((tile) => tile.fill))).toEqual(
      new Set(['var(--pm-chart-1)']),
    )
  })

  it('separates tiles by a 2px gap and groups by 4px, never by colour alone', () => {
    const flat = treemapModel(input())
    for (const tile of flat.plot?.tiles ?? []) {
      expect(tile.paint.width).toBeCloseTo(tile.rect.width - 2, 6)
      expect(tile.paint.height).toBeCloseTo(tile.rect.height - 2, 6)
    }
    const grouped = treemapModel(input({ items: TEAMS }))
    const [email, chat] = grouped.plot?.tiles ?? []
    // Two items of one group: 2px apart where they meet, 2px in from the group's edges.
    expect(email?.paint.x).toBeCloseTo((email?.rect.x ?? 0) + 2, 6)
    const meeting =
      Math.abs((email?.rect.x ?? 0) + (email?.rect.width ?? 0) - (chat?.rect.x ?? 0)) < 0.01
        ? (chat?.paint.x ?? 0) - ((email?.paint.x ?? 0) + (email?.paint.width ?? 0))
        : (chat?.paint.y ?? 0) - ((email?.paint.y ?? 0) + (email?.paint.height ?? 0))
    expect(meeting).toBeCloseTo(2, 6)
  })

  it('draws two levels: groups by colour in declaration order, items inside their group', () => {
    const model = treemapModel(input({ items: TEAMS }))
    expect(model.grouped).toBe(true)
    expect(model.legend).toBe(true)
    expect(model.painted.map((entry) => entry.paint)).toEqual([
      'var(--pm-chart-1)',
      'var(--pm-chart-2)',
      'var(--pm-chart-3)',
    ])
    expect(model.leaves.map((leaf) => leaf.id)).toEqual([
      'support/email',
      'support/chat',
      'sales/demos',
      'sales/calls',
      'legal',
    ])
    expect(model.leaves.map((leaf) => leaf.fill)).toEqual([
      'var(--pm-chart-1)',
      'var(--pm-chart-1)',
      'var(--pm-chart-2)',
      'var(--pm-chart-2)',
      'var(--pm-chart-3)',
    ])
    const tiles = model.plot?.tiles ?? []
    expectTiling(
      tiles.map((tile) => tile.rect),
      { x: 0, y: 0, ...BOX },
    )
    expect(model.twin.columns.map((column) => column.label)).toEqual([
      'Group',
      'Item',
      'Value',
      'Share',
    ])
    expect(model.twin.rows).toEqual([
      ['Support', 'Email', '180', '30%'],
      ['Support', 'Chat', '120', '20%'],
      ['Sales', 'Demos', '150', '25%'],
      ['Sales', 'Calls', '50', '8.3%'],
      ['Legal', 'Legal', '100', '16.7%'],
    ])
    expect(model.summary).toBe(
      'Storage, 5 items in 3 groups. The same data is available as a table.',
    )
  })

  it('sums items below the second level into their ancestor there, and warns', () => {
    const model = treemapModel(
      input({
        items: [
          {
            key: 'eng',
            label: 'Engineering',
            value: 60,
            children: [
              {
                key: 'platform',
                label: 'Platform',
                value: 0,
                children: [
                  { key: 'db', label: 'Databases', value: 25 },
                  { key: 'net', label: 'Network', value: 15 },
                ],
              },
              { key: 'apps', label: 'Apps', value: 20 },
            ],
          },
        ],
      }),
    )
    expect(model.leaves.map((leaf) => [leaf.label, leaf.value])).toEqual([
      ['Platform', 40],
      ['Apps', 20],
    ])
    expect(model.twin.rows[0]).toEqual(['Engineering', 'Platform', '40', '66.7%'])
    expect(model.warnings.join(' ')).toMatch(/two levels\. The items under "Platform" are summed/)
  })

  it('draws a group as the sum of its children, and warns when its own value differs', () => {
    const model = treemapModel(
      input({
        items: [
          {
            key: 'g',
            label: 'Group',
            value: 999,
            children: [{ key: 'a', label: 'A', value: 10 }],
          },
          { key: 'b', label: 'B', value: 10 },
        ],
      }),
    )
    expect(model.total).toBe(20)
    expect(model.warnings.join(' ')).toMatch(/"Group" states a value that differs/)
  })

  it('leaves out zero, negative and missing values, lists them and counts them as absent', () => {
    const model = treemapModel(
      input({
        items: [
          { key: 'a', label: 'A', value: 40 },
          { key: 'zero', label: 'Zero', value: 0 },
          { key: 'minus', label: 'Minus', value: -5 },
          { key: 'nan', label: 'Unknown', value: Number.NaN },
        ],
      }),
    )
    expect(model.leaves.map((leaf) => leaf.key)).toEqual(['a'])
    expect(model.plot?.tiles).toHaveLength(1)
    expect(model.twin.rows).toEqual([
      ['A', '40', '100%'],
      ['Zero', '0', ''],
      ['Minus', '-5', ''],
      ['Unknown', '', ''],
    ])
    expect(model.summary).toBe(
      'Storage, 4 items. 3 have no positive value and are not drawn. The same data is available as a table.',
    )
    expect(model.warnings.join(' ')).toMatch(/cannot be negative/)
  })

  it('draws nothing when every value is zero, and says so', () => {
    const model = treemapModel(
      input({
        items: [
          { key: 'a', label: 'A', value: 0 },
          { key: 'b', label: 'B', value: 0 },
        ],
      }),
    )
    expect(model.state).toBe('ready')
    expect(model.plot?.tiles).toEqual([])
    expect(model.leaves).toEqual([])
    expect(model.summary).toContain('2 have no positive value and are not drawn.')
  })

  it('has no plot before the measurement, and the empty state for no items', () => {
    expect(treemapModel(input({ box: null })).plot).toBeNull()
    expect(treemapModel(input({ items: [] })).state).toBe('empty')
  })

  it('fills the plot with one item', () => {
    const model = treemapModel(input({ items: STORAGE.slice(0, 1) }))
    expect(model.plot?.tiles[0]?.rect).toEqual({ x: 0, y: 0, width: 600, height: 300 })
    expect(model.plot?.tiles[0]?.plate?.label).toBe('Video')
  })

  it('keeps every tiny item a pixel across beside one huge one, and gives each a 24px target', () => {
    const items = [
      { key: 'huge', label: 'Huge', value: 100_000 },
      ...Array.from({ length: 30 }, (_, index) => ({
        key: `t${index}`,
        label: `Tiny ${index}`,
        value: 1,
      })),
    ]
    const model = treemapModel(input({ items }))
    const tiles = model.plot?.tiles ?? []
    expect(tiles).toHaveLength(31)
    expectTiling(
      tiles.map((tile) => tile.rect),
      { x: 0, y: 0, ...BOX },
    )
    for (const tile of tiles) {
      expect(tile.paint.width).toBeGreaterThanOrEqual(1 - 1e-9)
      expect(tile.paint.height).toBeGreaterThanOrEqual(1 - 1e-9)
      expect(tile.hit.width).toBeGreaterThanOrEqual(24)
      expect(tile.hit.height).toBeGreaterThanOrEqual(24)
    }
    expect(tiles.slice(1).every((tile) => tile.plate === null)).toBe(true)
  })

  it('labels a tile only when its label and its value both fit, and never a long label', () => {
    const model = treemapModel(
      input({
        items: [
          { key: 'big', label: 'Video', value: 900 },
          {
            key: 'long',
            label: 'Archived exports from the previous storage provider',
            value: 100,
          },
        ],
        box: { width: 400, height: 240 },
      }),
    )
    const [big, long] = model.plot?.tiles ?? []
    expect(big?.plate).toEqual({
      label: 'Video',
      value: '900',
      x: (big?.paint.x ?? 0) + 4,
      y: (big?.paint.y ?? 0) + 4,
      width: (big?.paint.width ?? 0) - 8,
    })
    expect(long?.plate).toBeNull()
  })

  it('lays out at phone width', () => {
    const model = treemapModel(input({ items: TEAMS, box: { width: 311, height: 224 } }))
    expectTiling(
      (model.plot?.tiles ?? []).map((tile) => tile.rect),
      { x: 0, y: 0, width: 311, height: 224 },
    )
  })
})

describe('treemapReadout', () => {
  it('says the group, the item, its value and its share, and shows them over the tile', () => {
    const model = treemapModel(input({ items: TEAMS }))
    const readout = treemapReadout(
      input({ items: TEAMS }),
      model,
      readingView({ index: 2, series: null }, 5),
    )
    expect(readout.announcement).toBe('Sales, Demos: 150, 25%')
    expect(readout.tooltip?.header).toBe('Sales')
    expect(readout.tooltip?.rows).toEqual([
      { key: 'sales/demos', label: 'Demos', value: '150 · 25%', paint: 'var(--pm-chart-2)' },
    ])
    const tile = model.plot?.tiles[2]
    expect(readout.tooltip?.x).toBeCloseTo((tile?.rect.x ?? 0) + (tile?.rect.width ?? 0) / 2)
  })

  it('names no group for an item at the top level, and keeps the words with the tooltip off', () => {
    const model = treemapModel(input())
    const readout = treemapReadout(
      input({ tooltip: false }),
      model,
      readingView({ index: 0, series: null }, 5),
    )
    expect(readout.announcement).toBe('Video: 420, 42%')
    expect(readout.tooltip).toBeNull()
  })
})

describe('treemapSelection', () => {
  it('reports the item read with its share, and nothing at rest', () => {
    const model = treemapModel(input())
    expect(treemapSelection(input(), model, { index: 1, series: null })).toEqual({
      key: 'images',
      label: 'Images',
      value: 260,
      share: 0.26,
    })
    expect(treemapSelection(input(), model, { index: null, series: null })).toBeNull()
  })
})
