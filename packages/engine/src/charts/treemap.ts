import type { ChartReadout, ChartTooltipRow, ChartTwinColumn } from './anatomy'
import { ESTIMATED_AXIS_TEXT_PX } from './cartesian'
import { formatValue } from './format'
import { BAR_END_RADIUS, estimateTextWidth, HIT_TARGET_MIN } from './geometry'
import type { MeasuredBox } from './measured-box'
import { DEFAULT_CHART_MESSAGES, spokenSummary } from './messages'
import type { ReadingPosition, ReadingView } from './reading'
import { resolveSeries, type ResolvedSeries } from './series'
import {
  chartState,
  type ChartMessages,
  type ChartState,
  type ChartTooltipConfig,
  type ValueFormat,
} from './types'

/**
 * Treemap's drawing (`design/components/treemap.md`): everything the member
 * shows that follows from its props and the measured plot, and what it shows
 * at a reading position. Every framework's Treemap renders it, so the layout,
 * the colours, the labels that fit and the readout's words are decided once.
 *
 * A treemap shows parts of a whole as rectangles that tile the plot, each with
 * an area proportional to its value. The layout is the squarified algorithm of
 * Bruls, Huizing and van Wijk (`squarify`), which keeps rectangles close to
 * square, because a long sliver is hard to compare by area. Two levels are
 * drawn: an item with children is a group whose children tile its rectangle.
 *
 * The data is the app's. An item with no positive value takes no area, because
 * a part of a whole cannot be nothing or less, and it is listed in the twin and
 * counted in the summary instead. Nothing is grouped into an "Other" item: that
 * is the app's decision, as DonutChart leaves it.
 */

export interface TreemapItem {
  key: string
  label: string
  /** An item with children takes its children's sum, and this value is not drawn. */
  value: number
  /** Two levels are drawn; deeper items are summed into the item at the second. */
  children?: readonly TreemapItem[]
}

export interface TreemapInput {
  items: readonly TreemapItem[]
  /** Formats each item's value on its label, in the tooltip and in the twin. */
  format?: ValueFormat | undefined
  /** The chart's accessible name. */
  label: string
  locale?: string | undefined
  messages?: ChartMessages | undefined
  /** The tooltip's configuration; it shapes the readout and not the marks. */
  tooltip?: ChartTooltipConfig | false | undefined
  loading?: boolean | undefined
  /** Whether the member has an `onSelect`: the summary then says the plot responds to Enter. */
  selectable?: boolean | undefined
  /** The measured plot, or `null` before the first measurement. */
  box: MeasuredBox | null
}

/** A rectangle in the plot, in px from its top left. */
export interface TreemapRect {
  x: number
  y: number
  width: number
  height: number
}

/** A label drawn on its rectangle: the item's label over its value, on a surface plate. */
export interface TreemapPlate {
  label: string
  value: string
  /** The plate's top left, in px from the plot's inline start and top. */
  x: number
  y: number
  /** The most the plate may take across, so a word longer than the estimate ends in an ellipsis. */
  width: number
}

/** One item's rectangle. */
export interface TreemapTile {
  /** Unique in the chart: the item's key, after its group's for an item in a group. */
  id: string
  key: string
  /** The tile's position in the reading order, which the keys walk. */
  index: number
  /** The exact rectangle of the layout. The tiles cover the plot with no overlap. */
  rect: TreemapRect
  /** The painted rectangle: the layout's, less the gap, and never under a pixel across. */
  paint: TreemapRect
  /** The pointer target: the layout's rectangle, at least `HIT_TARGET_MIN` each way. */
  hit: TreemapRect
  /** A `var(--pm-chart-…)` reference, set as `--pm-chart-mark`. */
  fill: string
  /** The label and value, or `null` where both do not fit. */
  plate: TreemapPlate | null
}

/** The plot at its measured size. */
export interface TreemapPlot {
  width: number
  height: number
  /** The tiles' corner radius, the engine's `BAR_END_RADIUS`, as a heatmap cell's. */
  radius: number
  /** The tiles in reading order: by group, largest first, then by item, largest first. */
  tiles: TreemapTile[]
}

/** An item that takes area, in reading order, before the plot is measured. */
export interface TreemapLeaf {
  id: string
  key: string
  label: string
  /** The value drawn: the item's own, or its children's sum for an item deeper than two levels. */
  value: number
  /** The group's label for an item in a group; `undefined` for an item at the top level. */
  group?: string
  /** The group's key for an item in a group. */
  groupKey?: string
  fill: string
}

export interface TreemapModel {
  state: ChartState
  /** Whether any top-level item has children: then colour names the group. */
  grouped: boolean
  /** The groups with their colours, for the legend: the top-level items, when grouped. */
  painted: ResolvedSeries[]
  /** The visually hidden sentence that orients a reader. */
  summary: string
  /** One message per unlawful use, each naming what the member does instead. */
  warnings: string[]
  /** Whether the legend shows: two or more groups. */
  legend: boolean
  twin: { columns: ChartTwinColumn[]; rows: string[][] }
  /** The total of the values that take area, which every share divides by. */
  total: number
  /** The items that take area, in reading order. The reading walks these. */
  leaves: TreemapLeaf[]
  /** The marks, or `null` before the plot is measured. */
  plot: TreemapPlot | null
}

/** Touching marks are separated by a surface-coloured gap, never by a stroke. */
const MARK_GAP_PX = 2

/** Groups are separated by twice the gap between their items, so a group reads as one block. */
const GROUP_GAP_PX = 4

/** A painted tile is never thinner than a pixel, so every item with a value is seen. */
const MIN_PAINT_PX = 1

/** The plate's distance from its tile's edges. */
const PLATE_INSET_PX = 4

/** The plate's padding: `--pm-space-1` across, 2px down. */
const PLATE_PAD_X = 4
const PLATE_PAD_Y = 2

/** One line of `text.xs`, estimated as a band label's line box is. */
const LINE_PX = ESTIMATED_AXIS_TEXT_PX * 1.5

/** How close to the plot's block edges the readout's centre may come. */
const READOUT_MARGIN_PX = 24

/** A share of the whole, to one decimal place. */
const SHARE: ValueFormat = { style: 'percent', maximumFractionDigits: 1 }

/** Whether a value takes area: a finite number above zero. */
const takesArea = (value: number) => Number.isFinite(value) && value > 0

/**
 * The value an item draws: its own for a leaf, its children's sum for an
 * item with children, at any depth. A child with no positive value adds
 * nothing.
 */
function drawnValue(item: TreemapItem): number {
  if (item.children === undefined || item.children.length === 0) {
    return takesArea(item.value) ? item.value : 0
  }
  return item.children.reduce((sum, child) => sum + drawnValue(child), 0)
}

const hasChildren = (item: TreemapItem) => item.children !== undefined && item.children.length > 0

/** The positions of `values` from largest to smallest; equal values keep their order. */
function largestFirst(values: readonly number[]): number[] {
  return values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => b.value - a.value || a.index - b.index)
    .map((entry) => entry.index)
}

/**
 * The worst aspect ratio of a row of areas laid along a side of length
 * `side`: the measure the squarified layout keeps as low as it can. The areas
 * are largest first, so the first is the largest and the last the smallest.
 */
function worst(areas: readonly number[], from: number, to: number, side: number): number {
  let sum = 0
  for (let index = from; index < to; index += 1) sum += areas[index] ?? 0
  const largest = areas[from] ?? 0
  const smallest = areas[to - 1] ?? 0
  const side2 = side * side
  const sum2 = sum * sum
  return Math.max((side2 * largest) / sum2, sum2 / (side2 * smallest))
}

/**
 * The squarified treemap layout (Bruls, Huizing and van Wijk, 2000): one
 * rectangle per value, each with an area proportional to its value, that
 * together tile `box` with no gap and no overlap.
 *
 * `values` are laid out in the order given, which should be largest first;
 * each must be above zero. The layout fills the box from its top left: a row
 * of rectangles runs along the box's shorter side, and the row grows while
 * adding the next value keeps its worst aspect ratio from rising. The last
 * rectangle of each row and the last row take what remains of their space,
 * so rounding never leaves a sliver uncovered. The same values and box always
 * give the same rectangles.
 */
export function squarify(values: readonly number[], box: TreemapRect): TreemapRect[] {
  const total = values.reduce((sum, value) => sum + value, 0)
  if (values.length === 0) return []
  if (!(total > 0) || box.width <= 0 || box.height <= 0) {
    return values.map(() => ({ x: box.x, y: box.y, width: 0, height: 0 }))
  }
  const scale = (box.width * box.height) / total
  const areas = values.map((value) => value * scale)
  const out: TreemapRect[] = []
  let { x, y, width, height } = box
  let start = 0
  while (start < areas.length) {
    const side = Math.min(width, height)
    let end = start + 1
    while (
      end < areas.length &&
      worst(areas, start, end + 1, side) <= worst(areas, start, end, side)
    ) {
      end += 1
    }
    let rowArea = 0
    for (let index = start; index < end; index += 1) rowArea += areas[index] ?? 0
    const last = end === areas.length
    if (width >= height) {
      // A column at the left, across the box's height.
      const thickness = last ? width : rowArea / height
      let at = y
      for (let index = start; index < end; index += 1) {
        const length = index === end - 1 ? y + height - at : (areas[index] ?? 0) / thickness
        out.push({ x, y: at, width: thickness, height: length })
        at += length
      }
      x += thickness
      width -= thickness
    } else {
      // A row at the top, across the box's width.
      const thickness = last ? height : rowArea / width
      let at = x
      for (let index = start; index < end; index += 1) {
        const length = index === end - 1 ? x + width - at : (areas[index] ?? 0) / thickness
        out.push({ x: at, y, width: length, height: thickness })
        at += length
      }
      y += thickness
      height -= thickness
    }
    start = end
  }
  return out
}

/**
 * A rectangle less its gap. Each side moves in by half the gap between items,
 * and, in a treemap with groups, a side on its group's edge by half the gap
 * between groups, so two items of one group are `MARK_GAP_PX` apart and two
 * groups `GROUP_GAP_PX`. `group` is `null` in a treemap of one level. A tile
 * the gap would erase keeps a pixel, centred on its rectangle, even where the
 * rectangle is narrower than a pixel, so every item with a value is seen.
 */
function inset(rect: TreemapRect, group: TreemapRect | null): TreemapRect {
  const near = (a: number, b: number) => Math.abs(a - b) < 0.01
  const edge = (onGroupEdge: boolean) =>
    group !== null && onGroupEdge ? GROUP_GAP_PX / 2 : MARK_GAP_PX / 2
  const left = edge(group !== null && near(rect.x, group.x))
  const top = edge(group !== null && near(rect.y, group.y))
  const right = edge(group !== null && near(rect.x + rect.width, group.x + group.width))
  const bottom = edge(group !== null && near(rect.y + rect.height, group.y + group.height))
  const fit = (start: number, size: number, before: number, after: number) => {
    const inner = size - before - after
    if (inner >= MIN_PAINT_PX) return { at: start + before, size: inner }
    return { at: start + (size - MIN_PAINT_PX) / 2, size: MIN_PAINT_PX }
  }
  const across = fit(rect.x, rect.width, left, right)
  const down = fit(rect.y, rect.height, top, bottom)
  return { x: across.at, y: down.at, width: across.size, height: down.size }
}

/** The rectangle grown to the minimum pointer target each way, kept inside the plot. */
function target(rect: TreemapRect, plot: MeasuredBox): TreemapRect {
  const grow = (start: number, size: number, limit: number) => {
    const grown = Math.min(limit, Math.max(size, HIT_TARGET_MIN))
    const at = Math.min(limit - grown, Math.max(0, start - (grown - size) / 2))
    return { at, size: grown }
  }
  const across = grow(rect.x, rect.width, plot.width)
  const down = grow(rect.y, rect.height, plot.height)
  return { x: across.at, y: down.at, width: across.size, height: down.size }
}

/**
 * The plate for a tile, or `null` when the label and the value do not both fit
 * inside it. The widths are estimated, so the plate also carries the room it
 * has, and a word wider than the estimate ends in an ellipsis instead of
 * crossing the tile.
 */
function plateFor(paint: TreemapRect, label: string, value: string): TreemapPlate | null {
  const room = paint.width - PLATE_INSET_PX * 2
  const needs =
    Math.max(
      estimateTextWidth(label, ESTIMATED_AXIS_TEXT_PX),
      estimateTextWidth(value, ESTIMATED_AXIS_TEXT_PX),
    ) +
    PLATE_PAD_X * 2
  const tall = LINE_PX * 2 + PLATE_PAD_Y * 2
  if (room < needs || paint.height - PLATE_INSET_PX * 2 < tall) return null
  return { label, value, x: paint.x + PLATE_INSET_PX, y: paint.y + PLATE_INSET_PX, width: room }
}

export function treemapModel(input: TreemapInput): TreemapModel {
  const {
    items,
    format,
    label,
    locale,
    messages = DEFAULT_CHART_MESSAGES,
    loading = false,
    selectable = false,
    box,
  } = input

  const grouped = items.some(hasChildren)

  /*
   * Colour names the group. With groups, each top-level item takes a slot in
   * declaration order, so colour follows the entity, and its children take its
   * colour. With one level, colour names nothing: every tile is the one series'.
   */
  const resolution = resolveSeries(
    grouped
      ? items.map((item) => ({ key: item.key, label: item.label }))
      : [{ key: 'items', label }],
  )
  const painted = grouped ? resolution.series : []
  const single = resolution.series[0]?.paint ?? ''
  const fillOf = (top: number) => (grouped ? (painted[top]?.paint ?? single) : single)

  const warnings: string[] = []
  if (grouped && resolution.warnings.length > 0) warnings.push(resolution.warnings.join(' '))
  const deep = items.flatMap((item) =>
    (item.children ?? []).filter(hasChildren).map((child) => child.label),
  )
  if (deep.length > 0) {
    warnings.push(
      `Treemap draws two levels. The items under ${deep.map((name) => `"${name}"`).join(', ')} are summed into ${deep.length === 1 ? 'it' : 'them'}, and the twin lists the sum.`,
    )
  }
  const mismatched = items.filter(
    (item) =>
      hasChildren(item) &&
      Number.isFinite(item.value) &&
      Math.abs(item.value - drawnValue(item)) > 1e-9 * Math.max(1, Math.abs(item.value)),
  )
  if (mismatched.length > 0) {
    warnings.push(
      `A group's area is the sum of its children. ${mismatched.map((item) => `"${item.label}"`).join(', ')} ${mismatched.length === 1 ? 'states a value that differs' : 'state values that differ'} from that sum; the sum is drawn.`,
    )
  }
  const negative = (list: readonly TreemapItem[]): boolean =>
    list.some(
      (item) => (Number.isFinite(item.value) && item.value < 0) || negative(item.children ?? []),
    )
  if (negative(items)) {
    warnings.push(
      'A part of a whole cannot be negative. An item with no positive value takes no area; it stays in the table twin.',
    )
  }

  /*
   * The order the tiles are laid out and read in: the groups largest first,
   * and within a group its items largest first. An item at the top level is a
   * group of one.
   */
  const tops = items.map((item, index) => ({ item, index, value: drawnValue(item) }))
  const topOrder = largestFirst(tops.map((top) => top.value)).filter(
    (index) => (tops[index]?.value ?? 0) > 0,
  )
  const leaves: TreemapLeaf[] = []
  const members = new Map<number, TreemapItem[]>()
  for (const index of topOrder) {
    const top = items[index] as TreemapItem
    if (!hasChildren(top)) {
      leaves.push({
        id: top.key,
        key: top.key,
        label: top.label,
        value: drawnValue(top),
        fill: fillOf(index),
      })
      continue
    }
    const children = top.children ?? []
    const order = largestFirst(children.map(drawnValue)).filter(
      (at) => drawnValue(children[at] as TreemapItem) > 0,
    )
    members.set(
      index,
      order.map((at) => children[at] as TreemapItem),
    )
    for (const at of order) {
      const child = children[at] as TreemapItem
      leaves.push({
        id: `${top.key}/${child.key}`,
        key: child.key,
        label: child.label,
        value: drawnValue(child),
        group: top.label,
        groupKey: top.key,
        fill: fillOf(index),
      })
    }
  }
  const total = leaves.reduce((sum, leaf) => sum + leaf.value, 0)

  let plot: TreemapPlot | null = null
  if (box !== null && box.width > 0 && box.height > 0) {
    const whole = { x: 0, y: 0, width: box.width, height: box.height }
    const groupRects = squarify(
      topOrder.map((index) => tops[index]?.value ?? 0),
      whole,
    )
    const tiles: TreemapTile[] = []
    topOrder.forEach((index, at) => {
      const top = items[index] as TreemapItem
      const rect = groupRects[at] as TreemapRect
      const inner = members.get(index)
      const placed =
        inner === undefined
          ? [{ item: top, rect, group: null }]
          : squarify(inner.map(drawnValue), rect).map((child, slot) => ({
              item: inner[slot] as TreemapItem,
              rect: child,
              group: rect,
            }))
      for (const { item, rect: tile, group } of placed) {
        const leaf = leaves[tiles.length] as TreemapLeaf
        const paint = inset(tile, grouped ? (group ?? tile) : null)
        tiles.push({
          id: leaf.id,
          key: item.key,
          index: tiles.length,
          rect: tile,
          paint,
          hit: target(tile, box),
          fill: leaf.fill,
          plate: plateFor(paint, item.label, formatValue(leaf.value, format, locale)),
        })
      }
    })
    plot = { width: box.width, height: box.height, radius: BAR_END_RADIUS, tiles }
  }

  /*
   * The twin lists every item in the order given, with what it draws, so an
   * item with no area is still there, its share left empty.
   */
  const shareText = (value: number) =>
    total > 0 && takesArea(value) ? formatValue(value / total, SHARE, locale) : ''
  const valueText = (item: TreemapItem) =>
    formatValue(hasChildren(item) ? drawnValue(item) : item.value, format, locale)
  const rows: string[][] = items.flatMap((item) =>
    grouped && hasChildren(item)
      ? (item.children ?? []).map((child) => [
          item.label,
          child.label,
          valueText(child),
          shareText(drawnValue(child)),
        ])
      : [
          [
            ...(grouped ? [item.label] : []),
            item.label,
            valueText(item),
            shareText(drawnValue(item)),
          ],
        ],
  )
  const listed = rows.length

  return {
    state: chartState(items, loading),
    grouped,
    painted,
    summary: spokenSummary(
      messages.treemapSummary({
        label,
        items: listed,
        groups: grouped ? items.length : 0,
        absent: listed - leaves.length,
      }),
      messages,
      selectable,
    ),
    warnings,
    legend: painted.length >= 2,
    twin: {
      columns: [
        ...(grouped ? [{ key: '__group', label: messages.groupColumn }] : []),
        { key: '__item', label: messages.itemColumn },
        { key: '__value', label: messages.valueColumn, numeric: true },
        { key: '__share', label: messages.shareColumn, numeric: true },
      ],
      rows,
    },
    total,
    leaves,
    plot,
  }
}

/**
 * What the chart shows at a reading position: the tooltip's row, the live
 * region's sentence and the tooltip itself. Both give the item's value and its
 * share of the whole, and name its group, so an item too small for its label
 * is read in full. `tooltip: false` removes only the visual layer: the
 * announcement stays.
 */
export function treemapReadout(
  input: TreemapInput,
  model: TreemapModel,
  view: ReadingView,
): ChartReadout {
  const { format, locale, tooltip = {}, box } = input
  const leaf = view.index === null ? undefined : model.leaves[view.index]
  if (view.index === null || leaf === undefined) {
    return { rows: [], announcement: '', tooltip: null }
  }
  const value = formatValue(leaf.value, format, locale)
  const share = formatValue(model.total > 0 ? leaf.value / model.total : 0, SHARE, locale)
  const rows: ChartTooltipRow[] = [
    { key: leaf.id, label: leaf.label, value: `${value} · ${share}`, paint: leaf.fill },
  ]
  const tile = model.plot?.tiles[view.index]
  const at =
    tile === undefined || box === null
      ? null
      : {
          x: tile.rect.x + tile.rect.width / 2,
          y: Math.min(
            box.height - READOUT_MARGIN_PX,
            Math.max(READOUT_MARGIN_PX, tile.rect.y + tile.rect.height / 2),
          ),
        }
  return {
    rows,
    announcement: `${leaf.group === undefined ? '' : `${leaf.group}, `}${leaf.label}: ${value}, ${share}`,
    tooltip:
      tooltip === false || !view.active || at === null || box === null
        ? null
        : {
            ...(tooltip.hideLabel || leaf.group === undefined ? {} : { header: leaf.group }),
            rows,
            indicator: tooltip.indicator ?? 'dot',
            ...at,
            side: at.x > box.width / 2 ? 'start' : 'end',
          },
  }
}

/**
 * What `onSelect` reports at a position: the item's key, label, the value it
 * draws and its share of the whole. `null` when nothing is read.
 */
export function treemapSelection(
  _input: TreemapInput,
  model: TreemapModel,
  at: ReadingPosition,
): { key: string; label: string; value: number; share: number } | null {
  const leaf = at.index === null ? undefined : model.leaves[at.index]
  if (leaf === undefined) return null
  return {
    key: leaf.key,
    label: leaf.label,
    value: leaf.value,
    share: model.total > 0 ? leaf.value / model.total : 0,
  }
}
