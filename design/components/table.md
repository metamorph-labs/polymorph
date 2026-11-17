# Table

A styled native table for scanning records, and the main data display of ListPage. It
adapts to density through its tokens.

It includes the sorting control. Sorting *logic*, selection and pagination belong to
DataTable (`data-table.md`).

## Anatomy

```
[wrapper — horizontal scroll container]
  [<table>]
    [<caption> — the table's name, announced; drawn only on request]
    [<thead> [<tr> [<th>*]]]
    [<tbody> [<tr> [<td>*]]*]
    [<tfoot> [<tr> [<td>*]]?]   — totals
```

Composition API (not a data grid): `Table`, `Table.Head`, `Table.Body`, `Table.Row`,
`Table.Header` (th), `Table.Cell` (td), `Table.Foot` (tfoot: a totals row for `numeric`
columns; no props, like Head and Body).

## API

| Component | Prop | Type | Default | Notes |
| --- | --- | --- | --- | --- |
| `Table` | `stickyHeader` | `boolean` | `false` | |
| | `caption` | `string \| undefined` | — | names the table, as a `<caption>`. Announced, not drawn |
| | `captionVisible` | `boolean` | `false` | draw it above the table as well |
| `Table.Header` | `sortable` | `boolean` | `false` | shows sort affordance |
| | `sortDirection` | `'asc' \| 'desc' \| undefined` | — | controlled by caller |
| | `onSort` | `() => void` | — | |
| | `numeric` | `boolean` | `false` | right-align + tabular figures |
| `Table.Row` | `interactive` | `boolean` | `false` | hover + cursor; row-level `onClick` |
| | `selected` | `boolean` | `false` | |
| `Table.Cell` | `numeric` | `boolean` | `false` | |

Attributes: rows `data-interactive?`, `data-selected?`; headers `data-sortable?`,
`aria-sort`; cells `data-numeric?`; table `data-sticky-header?`.

## Recipe (exact tokens)

| Part | Tokens |
| --- | --- |
| caption, visible | `text.sm` quartet · `--pm-text-secondary` · padding-block-end `--pm-space-3` · `text-align: start` (the UA centres a caption; no other recipe here centres anything) |
| caption, announced | the `visuallyHidden` clip recipe from `conventions/a11y.module.css`: in the accessibility tree, out of the layout |
| header cell | `text.xs` quartet + `text-transform: uppercase` · `--pm-text-secondary` · padding `--pm-space-3` `--pm-space-4` · border-bottom `1px solid --pm-border-default` · bg `--pm-bg-surface` when sticky (opaque over scroll), else transparent |
| sortable header | hover `--pm-text-primary` · sort icon `--pm-icon-size-sm`, gap `--pm-space-1`: unsorted `sort` at `--pm-text-muted`, active `sort-asc`/`sort-desc` at `--pm-accent-text` · icon `opacity: 0` at rest, `1` on header hover, sort-button `:focus-visible`, or `[data-active]`, so arrows appear on approach instead of showing permanently in every header |
| body cell | `text.sm` quartet · `--pm-text-primary` · padding `--pm-space-3` `--pm-space-4` · border-bottom `1px solid --pm-border-subtle` |
| numeric cell/header | right-aligned · `font-variant-numeric: var(--pm-font-numeric)` *(figures align in the column's own font; a mono-personality theme gets `slashed-zero` from the token)* |
| foot cell | the header cell's recipe (`text.xs` quartet + `text-transform: uppercase` · `--pm-text-secondary` · padding `--pm-space-3` `--pm-space-4`) with the border mirrored: border-**top** `1px solid --pm-border-default`, no border-bottom · `numeric` applies as in the body, because a total uses the column's figures *(totals for numeric columns)* |
| interactive row hover | bg `--pm-bg-subtle` · `cursor: pointer` |
| selected row | bg `--pm-selection-surface`; selected + hover `--pm-selection-surface-hover` *(selection is its own colour family, not the hover wash; it overrides plain hover. With a hue it has its own hover step. An achromatic system has none: its two selected surfaces are one colour, so a selected row looks the same under the pointer. The fill is the selected surface, not `--pm-selection-bg`: a row's cells hold text in every role, and controls, and the contrast law holds every text role on the selected surface. An achromatic system draws `--pm-selection-bg` as its ink, the colour of primary text)* |
| sticky header | `position: sticky; top: 0` + border-bottom draws the edge (no shadow, so flat themes do not gain one) · `z-index` `--pm-z-raise` over the rows · the wrapper and each row group after the header `isolation: isolate` *(a positioned box paints over an earlier positioned box, and the rows come after the header: a Checkbox's box and DataTable's detail are positioned, so without the lift each is drawn across the header as it scrolls under it. The wrapper's isolation keeps the lift inside the table, so the header is not raised over the page. A row group's isolation keeps a part that a member in a cell raises, as SplitButton raises its focused half, under the header)* |
| wrapper | `container-type: inline-size` · `overflow-x: auto` once it overflows *(container-first responsiveness: the wrapper decides whether the table scrolls, and declaring it a container lets the table respond to its width)* |
| table, narrow container | `min-inline-size: max-content` below a `36rem` **container** *(scroll instead of squeezing: the table keeps the width its columns need and the wrapper scrolls, instead of wrapping every cell to one word per line. Adaptation changes layout, never content, so no cell is hidden. Column priority is rejected; see `data-table.md`)* |

The intrinsic minimum width applies **only below `36rem`, not always**. An always-on
`max-content` would also stop a prose column from wrapping on a wide screen, so a table
that fits would scroll sideways on a desktop. `36rem` is a rem literal with a comment,
because a breakpoint is geometry, not theme (`docs/layout.md`).

The container is the **wrapper**, not the window. A table in a dashboard's narrow column
is just as cramped on a 27-inch monitor, and a media query cannot detect that. A member
adapts to its container, never the viewport (`docs/layout.md`).

The last body row keeps its border, which forms the table's bottom edge. Above a
`Table.Foot` it drops that border, because the foot's stronger top rule is the edge and
two lines together would form a seam (the header uses a single bottom rule for the same
reason). No zebra striping; row borders separate rows at every density. No outer border
or radius: the table is content, not a card, and ListPage decides what surface it sits
on.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| basic 3×4 | header + rows | — |
| numeric column | `numeric` | `data-numeric` |
| sortable unsorted | `sortable` | `aria-sort` absent |
| sorted asc / desc | `sortDirection` | `aria-sort="ascending"/"descending"` |
| interactive rows | `interactive` | `data-interactive` |
| selected row | `selected` | `data-selected` |
| sticky header | `stickyHeader` + tall body | `data-sticky-header` |
| visible caption | `caption` + `captionVisible` | a `<caption>` above the table, and the table named |
| totals | `Table.Foot` under a numeric column | `<tfoot>`, top rule, figures aligned |

`requiredSelectors`: `[data-interactive]:hover`, `[data-selected]`,
`[data-sortable]:hover`, `:focus-visible` (sortable header buttons).

## Motion

Row hover/selection background over `--pm-motion-duration-control` ×
`--pm-motion-easing-standard`. Sort icon swap: `fade` at control duration. Nothing
else; tables do not animate their data.

## Icons

`sort`, `sort-asc`, `sort-desc` (decorative; `aria-sort` is the semantic).

## A11y

Native `<table>` semantics end to end.

**The table carries its own name.** `caption` renders a real `<caption>` as the first
child of the `<table>`. That is where a table's name belongs, and it is the name a screen
reader uses when it lists the tables on a page. It is a *different* name from `label`
below, on purpose. `label` names the scroll region, which exists only while the columns
overflow, so a table that fits has no other name. That is acceptable when the table is a
page's main content, but not for a chart twin: a dashboard renders several charts, each
with a twin, and an uncaptioned twin announces only as "table".

By default the caption is announced but not drawn (`captionVisible` draws it), because
the table's name is usually already on screen, in a PageHeader above it or in the chart
it is the twin of. Drawing it again would repeat it. The assemblies follow this:
`DataTable` takes its caption from the `label` it already requires, and `ChartTwin` takes
its caption from its chart.

Sortable headers wrap their label in a real `<button>` (full header hit area), with
`aria-sort` on the `<th>`. Interactive rows: when the action is navigation, the row's
primary cell contains the actual link or button. Row `onClick` only enlarges the target
and is never the only path. A click anywhere on an interactive row calls its `onClick`.
The wrapper is focusable with `tabindex="0"` only when it actually overflows (so it can be
scrolled by keyboard), with `role="region"` + `aria-label` from the nearest
PageHeader/ListPage title.

```contract
click activates on row when interactive rows
```

## Agent

An agent reads which columns sort, the column the table is sorted by and its direction, and asks
for a sort by a column. The state names and values are DataTable's, so an agent reads both tables
the same way: `columns` lists each sortable header as a choice, `sort-key` is the sorted column's
id, or `null` while no column is sorted, and `sort-direction` is `asc`, `desc`, or empty while no
column is sorted. A header's markup carries no key, so a column's id is its label, and a repeated
label takes ` (2)` after it. The headers are the caller's parts and the caller holds the sort, so
the table reads all three from its own sortable headers and their `aria-sort`.

`sort` presses the column's sort control once, as a person's press does, so the caller's `onSort`
runs and the caller decides the order: a caller that reverses a sorted column and starts a new one
ascending sorts by a column ascending on the first press and descending on the second. An agent
reads `sort-key` and `sort-direction` afterwards to learn what the caller chose. A press the
caller does not answer changes nothing, and the step still succeeds, because the press is all a
person can do either. DataTable asks for a direction instead (`sort-ascending`,
`sort-descending`), because it calls its caller's `onSortChange` with the sort it is given.

A Table with no sortable header is listed with an empty `columns`, and `sort` refuses every
column. It is listed, and not left out, because a handle registers once and the caller can add
sortable headers after the table mounts. The Table a DataTable draws registers nothing: the
DataTable is listed in its place. A table inside one of the DataTable's cells is the
application's, and registers. The cells are the caller's, so the members in them are listed
within the Table.

```agent
state sort-key id
state sort-direction text
state columns choices
action sort id presses sort
```
