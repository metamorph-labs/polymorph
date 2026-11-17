# Treemap

A treemap shows parts of a whole as rectangles that tile the plot, each with an area
proportional to its value, in one level or two. Use it to show what takes the space when there
are many parts: storage by kind, spend by line, tickets by team and channel.

It is **not** a DonutChart, which splits a whole into at most six parts a reader compares at a
glance (`donut-chart.md`), and not a BarChart, which compares close values by length, the
measure a reader judges best (`bar-chart.md`). It is not a variant of DonutChart: a ring cannot
hold many parts or a second level. It uses the shared `ChartFrame` without axes, and its grammar
types are the tier's (`docs/charts.md`).

## Anatomy

```
[ChartFrame — no axes]
  [plot: tiles, largest first from the top left (the inline start), 2px surface gap between
         items, 4px between groups, 4px corners · label plates where they fit · hit targets]
  [legend (derived, ≥2 groups)]  [twin + toggle]  [tooltip]
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `items` | `readonly TreemapItem[]` | required | the parts. An item with `children` is a **group**, and its children tile its rectangle. A group's area is the sum of its children; its own `value` is not drawn, and a group whose `value` differs from that sum dev-warns. **Two levels are drawn**: items below the second are summed into their ancestor at the second, with a dev warning, and the twin lists the sum. An item with no positive value (zero, negative, not a number) takes no area: the twin lists it and the summary counts it. `[]` renders the empty state |
| `format` | `ValueFormat` | — | formats each value on its label, in the tooltip and in the twin. Shares are percentages to one decimal place |
| `size` | `ChartSize` | `'md'` | frame heights per `bar-chart.md`'s recipe; the tiles fill the plot |
| `label` | `string` | required | the accessible name |
| `locale` | `string` | — | `Intl` formats; omitted, the runtime's resolved locale |
| `tooltip` | `ChartTooltipConfig \| false` | on, `'dot'` | per item: label, value and share of the whole, with the group as the header (`hideLabel` removes it) |
| `onSelect` | `(selection: { key: string; label: string; value: number; share: number }) => void` | — | reports activation at the reading position, with the value drawn and the share. Enter/Space activate, so it is never pointer-only |
| `loading` | `boolean` | `false` | refetch dims the previous frame; first render is the quiet skeleton |
| `messages` | `ChartMessages` | English | the tier's string catalog (`docs/charts.md`). This member uses `treemapSummary`, `activationHint` (with `onSelect`), `empty`, the twin's three (`showTable`, `hideTable`, `tableLabel`) and its headings: `groupColumn` (with groups), `itemColumn`, `valueColumn`, `shareColumn`. All keys or none, and the same object goes to every chart on the screen. Omitting it keeps the generic English |

```ts
interface TreemapItem {
  key: string
  label: string
  value: number // an item with children takes its children's sum
  children?: readonly TreemapItem[]
}
```

**Layout.** The squarified algorithm of Bruls, Huizing and van Wijk (the engine's `squarify`):
the items are laid out largest first, equal values in the order given, in rows along the box's
shorter side, and a row grows while the next item keeps its worst aspect ratio from rising. The
same items and box always give the same tiles, and the tiles cover the plot with no gap and no
overlap. With groups, the groups are laid out first by their sums, and each group's items inside
its rectangle, so every item's area is its share of the whole.

**Nothing is grouped as "Other".** A tiny item keeps its true area. Its painted tile is never
under a pixel across, and its pointer target is grown to 24px. Folding a long tail into one item
is the app's decision, in the data, as DonutChart leaves it.

Attributes: `data-size`, `data-state="loading" | "empty"` on the frame; `data-reading` on the
marks while an item is read; `data-active` on the read tile.

## Recipe (exact tokens)

| Part | Tokens |
| --- | --- |
| tile fill | one level: slot 1 for every tile, because colour names nothing there. Two levels: each top-level item takes a slot in declaration order (`resolveSeries`), and its children take its colour, so colour follows the group. A top-level item with no children is a group of one. A ninth group dev-warns and folds to `--pm-chart-other`, as a ninth series does |
| separation | the surface: 2px between the items of a group and 4px between groups, taken from each tile's edges. Never a stroke, and never a tint: a group is told by its hue, by the wider gap and by the legend |
| corners | 4px, the engine's `BAR_END_RADIUS`, as a heatmap cell |
| label plate | `--pm-bg-surface` · `--pm-radius-sm` · padding 2px `--pm-space-1`, 4px in from the tile's top and inline-start edges. Label `text.xs` quartet · `--pm-text-primary`; value `text.xs` · `--pm-text-secondary` · `--pm-font-numeric`. One line each, ellipsis past the plate |
| hover/active lift | the active tile keeps full opacity and the others ease to 0.8 over `--pm-motion-duration-control` × `--pm-motion-easing-standard` |
| hit area | the tile's rectangle, grown to `HIT_TARGET_MIN` (24px) each way and kept inside the plot; the targets sit over the paint in reading order, so a small item's target lies over its larger neighbour's |
| empty state | copy: **"No data yet"**, the English default of `messages.empty` |

**Text never sits on a series colour.** The chart palette's slots range from a light yellow to a
deep blue, so no one text token passes on every fill in every palette. The label sits on a plate
of the surface colour instead, and its contrast is the theme's own text on `bg.surface`, which
the pairing law holds in every system, palette and mode (`packages/theme/src/chart-laws.test.ts`
states it for this plate).

**What fits.** A tile shows its label and its value only when both fit on the plate inside it,
by the engine's estimate of their widths and two lines' height. Otherwise it shows nothing, and
the tooltip, the live region and the twin name it. A word wider than the estimate ends in an
ellipsis on the plate, never cut mid-glyph and never across the tile's edge.

**Right to left.** The engine lays the tiles out from the left. The marks layer turns over under
`:dir(rtl)`, so the largest tile sits at the inline start, and the plates, placed by logical
properties, stay on their tiles.

## States

1. **storage** — Relay storage by kind, in gigabytes: Attachments 420 · Inline images 260 ·
   Exports 180 · Audit log 90 · Avatars 50, one level, one colour
2. **two levels** — open tickets by team (Support, Technical, Billing) and channel, with
   Partners as a group of one: four colours, a legend
3. **one item** — one tile filling the plot
4. **all zero** — nothing takes area; the summary says so and the twin lists both
5. **one huge, many tiny** — one workspace and forty sandboxes: the sandboxes keep their true
   area, with no label
6. **long labels** — two labels too long for any tile: no plate on them
7. **absent items** — a zero and a negative: not drawn, in the twin, counted in the summary
8. **three levels** — a third level summed into the second, with the dev warning
9. **format** — currency values
10. **small** — `size="sm"`
11. **empty** — `items={[]}` · 12. **loading** · 13. **tooltip off**
14. **selectable** — the storage with `onSelect`: the summary names the activation, and an
    agent can pick a tile (Agent, below)

`requiredSelectors`: `[data-state='empty']`, `[data-state='loading']`, `[data-active]`,
`:focus-visible`.

## Motion

`chart.frame` + `chart.marks`: tiles fade in, staggered by `--pm-motion-stagger-step` and capped
at the fourth. A tile never grows, because its area is its value. Reduced motion and `none`:
everything at once.

## Icons

`table` (twin toggle).

## A11y

The plot is one focus stop (`tabIndex=0`, `role="img"`, named by `label`). Left/Right move
through the tiles in reading order, group by group and largest first, Home/End go to the first
and the last, and Escape clears the reading. Each move is said politely: "Support, Email: 180,
28.3%", the group, the item, its value and its share of the whole. With `onSelect`, Enter/Space
activate at the reading position and the summary names the activation. The summary is
`messages.treemapSummary`, given the item count, the group count and how many items take no
area. The twin is a `Table` of group · item · value · share (item · value · share with one
level), every item in the order given, with no share for an item that takes no area. The label
plates are hidden from the tree, because the live region and the twin say them. Colour is never
the only channel: the legend, the tooltip's header, the announcement and the twin name every
group.

On iOS, each tile is an accessibility element VoiceOver finds in reading order, named by its group
and its label with its value and share as its value, as Swift Charts exposes each mark; the plot
stays one focus stop for the keyboard, which the arrows walk.

## Agent

A Treemap with `onSelect` is listed for an agent, named by its `label`; without `onSelect` a person
has nothing to pick, so it registers nothing. `items` lists the tiles a person can pick, in the
order the keys walk them. A tile's label is what the live region says with the reading on it: its
group, its label, its value and its share. Its id is its index (`4`). An item that takes no area is
not a tile, so it is not listed.

A chart with more tiles than the engine's `CHART_MARK_CAP` lists a window of them: the whole tiles
around the reading position, at most the cap in all, or from the first tile while nothing is read.
`position` is the tile the reading is on, the number a tile's id starts with, or `null` while
nothing is read. The figure shows it as `data-position`, and a person's keys and pointer move it as
an agent's `read` does. `count` is how many tiles the chart has. `read` moves the reading to a tile
as Left and Right do, so the tooltip and the live region show it and the window follows. It calls
nothing, and a number that is not the index of a tile throws.

`choose` moves the reading to a listed tile and activates it as Enter does, so `onSelect` receives
what a person's press there reports, and the tooltip and the live region show the tile. The table
twin's toggle is a Button of its own, listed within the chart.

```agent
state items choices when selectable
state position number as root data-position when selectable
state count number when selectable
action read number sets position when selectable
action choose id calls onSelect when selectable
```
