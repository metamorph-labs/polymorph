# DataTable

A Table with column definitions, controlled sorting, row selection with bulk actions, row
expansion, loading skeletons, a required empty state and a pagination slot.

It is an assembly. Every visible part is Table, Checkbox, Badge, Skeleton, EmptyState,
Pagination or Button. DataTable adds wiring and laws, not new visuals.

## API

```ts
interface Column<Row> {
  key: string
  header: string
  cell?: (row: Row) => ReactNode        // default: String(row[key])
  sortable?: boolean
  numeric?: boolean
}

interface DataTableRowDetail<Row> {     // what `rowDetail` is called with
  row: Row                              // the caller's own row
  close: () => void                     // closes this row's detail; focus returns to the row's disclosure
}

interface DataTableProps<Row> {
  columns: Column<Row>[]
  data: Row[]
  getRowId: (row: Row) => string
  sort?: { key: string; direction: 'asc' | 'desc' }        // controlled
  onSortChange?: (sort) => void
  selection?: ReadonlySet<string>                           // presence enables selection
  onSelectionChange?: (next: ReadonlySet<string>) => void
  getRowLabel?: (row: Row) => string                        // the whole name of a row's checkbox: "Select Invoice 12"
  getRowName?: (row: Row) => string                         // the row's own name, "Invoice 12"; `detailsLabel` reads it
  onRowClick?: (row: Row) => void                           // opens the row; checkbox and disclosure clicks never trigger it
  rowDetail?: (detail: DataTableRowDetail<Row>) => ReactNode // presence enables expansion; drawn under an open row
  expanded?: ReadonlySet<string>                            // the open rows by id; controlled when given
  defaultExpanded?: ReadonlySet<string>                     // the rows open at first, while the table holds the set
  isRowExpandable?: (row: Row) => boolean                   // false: no disclosure and no detail for that row
  onExpandedChange?: (next: ReadonlySet<string>) => void    // called with the next set, controlled or not
  bulkActions?: ReactNode                                   // shown while selection.size > 0
  loading?: boolean
  emptyState: EmptyStateProps                               // required — completeness law
  pagination?: ReactNode                                    // a <Pagination> or <CursorPagination>, rendered below
  stickyHeader?: boolean
  label: string                                             // table accessible name
  messages?: {                                              // the localization seam: every key the table uses, or none
    selected: (count: number) => string                     // the bulk bar's count; default `{n} selected`
    selectAll: string                                       // header checkbox; default "Select all"
    selectRow: string                                       // row checkbox when getRowLabel is absent; default "Select row"
    detailsLabel?: (rowName: string | undefined) => string  // row disclosure and its column's header; default "Details for {rowName}", or "Details"
  }
}
```

Attributes: root `data-loading?`, `data-empty?`, plus Table's own per part.

**Localization.** The assembly has four strings of its own: the bulk bar's count, the two
checkbox names and the row disclosure's name. They are in `messages` (the localization seam),
so an app can localize them. The count is a function, because "3 selected" needs a plural rule
and plural rules belong to the app's catalog. Hosts that pass nothing get generic English
defaults. `label`, `emptyState`, the column headers, `getRowLabel` and `getRowName` are the
app's.

`detailsLabel` is optional in the type, so `messages` written for a table without `rowDetail`
still compile. A localized host that passes `rowDetail` passes `detailsLabel` as well: without
it the disclosures read the English default beside the host's own strings. It is called once
per row with what `getRowName` returns for that row, or with `undefined` when `getRowName` is
absent, and once with `undefined` for the expansion column's header. The defaults are
`Details for {rowName}` and `Details`. It is not named `rowDetails`, which differs from the
`rowDetail` prop by one letter.

A row has two names, and each has one reader. `getRowLabel` returns the whole name of the
row's checkbox, "Select Invoice 12", and only the checkbox reads it. `getRowName` returns the
row's own name, "Invoice 12", and `detailsLabel` makes the disclosure's name from it,
"Details for Invoice 12". The disclosure never reads `getRowLabel`: a control's whole name
inside another control's name reads "Details for Select Invoice 12".

**Expansion.** `rowDetail` turns expansion on. Each row gets a disclosure, and an open row
draws what `rowDetail` returns for it in a full-width row under itself. Any number of rows can
be open. Sorting and selection are controlled because they reach past the visible page. An
open row affects only itself, so the table holds the set of open rows when `expanded` is
absent. It starts with the rows `defaultExpanded` names, or with every row closed. With
`expanded` the app holds it. `onExpandedChange` is called with the next set in both cases.
`expanded`, `defaultExpanded` and `onExpandedChange` are the three props Collapsible's `open`
and AppShell's `collapsed` have. A detail adds content and hides no column.

The table's own set follows every change, whoever holds the set. An app that stops passing
`expanded` finds the rows as the last change left them, in every renderer.

The set keeps the id of a row that is not in `data`. `data` is one page, and a reader who opens
a row, pages away and comes back finds the row still open. An app that wants the rows closed
when the page changes holds the set with `expanded` and clears it.

`rowDetail` is called with one object, `{ row, close }`, and every renderer hands the same two
named values. They are a function's argument in React and Solid, the scoped slot's props in
Vue (`#rowDetail="{ row, close }"`), the snippet's parameter in Svelte and the template's
variables in Angular (`let-row="row" let-close="close"`). `row` is the caller's own row and
never a copy of it. The row is one named value and not the slot's props themselves, because a
row's fields are data: Vue copies an object bound as slot props and reads a field named
`class`, `style` or `key` as its own.

A detail is closed from inside with `close`, which a detail's Save or Done calls. `close`
removes the row from the open set and calls `onExpandedChange`, whether the table or the app
holds the set. When focus is inside the detail it first moves focus to the row's disclosure.
It does nothing for a row that is not open. An app that only removes the id from `expanded`
while focus is inside the detail loses focus to the page, because the focused element leaves
with the detail.

`isRowExpandable` says whether a row has a detail. A row it refuses has an empty cell in the
expansion column and never draws a detail row, whatever `expanded` holds. It is a predicate
because a function that draws cannot report that it drew nothing: the table has to know
before it draws the disclosure. Without it every row has a detail.

## Anatomy & recipe (exact tokens; parts inherit their own specs)

```
[bulk bar?]           — while selection is non-empty
[Table]               — selection column? + expansion column? + data columns
[detail row?]         — under each open row, across every column
[empty | skeleton]    — body states
[pagination row?]     — Inline justify end, padding-top --pm-space-4
```

| Part | Recipe |
| --- | --- |
| selection column | leading column, width `--pm-control-height-sm`; header = Checkbox `aria-label="Select all"`, checked when every row **on this page** is selected, `indeterminate` when some are; select-all **adds** this page's ids to `selection` and unselect-all **removes** them, never replacing the set; row = Checkbox `aria-label` from `getRowLabel` (fallback "Select row"); clicking the checkbox never triggers row `interactive` handlers *(returning `new Set(page ids)` would silently discard the selection on other pages the first time the header is used. That happens only when paginated, which is the case `selection` is controlled for. The header acts on the rows below it and leaves the rest of the set alone. The bar counts the whole selection, because a bulk action acts on all of it.)* |
| expansion column | present when `rowDetail` is given; after the selection column and before the data columns, width `--pm-control-height-sm`; header = the column's name from `messages.detailsLabel(undefined)`, visually hidden (`conventions/a11y`), so the column is announced and nothing is drawn; the hidden name carries `data-undrawn`, which tells the grid the cell shows nothing; row = one icon-only Button, `ghost`/`neutral`/`sm`, named by `messages.detailsLabel` from `getRowName`, icon `down` while closed and `up` while open, `aria-expanded` from the row's state and, while open, `aria-controls` naming the detail row; clicking it never triggers row `interactive` handlers; a row `isRowExpandable` refuses has an empty cell *(the wrapper that stops the checkbox's click stops this one. The two icons are the glyph Collapsible and Accordion rotate between, drawn as two roles because a Button's icon is the caller's and takes no rotation)* |
| detail row | `<tr data-detail>` directly after its row, rendered only while the row is open and `isRowExpandable` does not refuse it; one `<td>` with a `colSpan` of every column, the selection and expansion columns included; padding `--pm-space-3` `--pm-space-4` · `text.sm` · `--pm-text-primary` · border-bottom `1px solid --pm-border-subtle` · bg `--pm-bg-subtle`; never `selected`, never interactive, no hover state; the cell composes the focus ring (`conventions/focus`), which shows when the grid's arrow keys reach it; its content sits in a `container-type: inline-size` box, which is `position: sticky` at `inset-inline-start` `--pm-space-4` and at most `100cqi` less the cell's two inline paddings wide *(a body cell's padding, type and rule, so the rows keep one rhythm. The subtle fill separates the detail from the rows, which are drawn on the surface, and a selected row's detail keeps it, because the selection is the row's and not the detail's. The container lets the content respond to the detail's width and keeps a long detail out of the table's `max-content` width below `36rem`. Below `36rem` the table is wider than its wrapper and pans inside it. `100cqi` is the wrapper's width, so the box is as wide as the part of the table a reader sees, and `sticky` keeps it at the wrapper's inline start while the table pans. A detail as wide as the table would run past the visible edge, and a reader would pan to finish a sentence)* |
| selected rows | Table's `selected` recipe (`--pm-selection-surface`, hover `--pm-selection-surface-hover`) |
| bulk bar | bg `--pm-selection-surface` · border `1px solid --pm-selection-border` · radius `--pm-radius-sm` · padding `--pm-space-2` `--pm-space-4` · margin-bottom `--pm-space-3` · left: "`{n} selected`" `text.sm` `--pm-accent-text` · right: `bulkActions` in an Inline gap 3, `ghost`/`soft` `sm` buttons only; a destructive bulk action is `soft/danger` and must go through ConfirmDialog *(the bar represents the selection, so it uses the selection family. It holds buttons, so its fill is the selected surface, and the count takes the accent's text colour, which the contrast law holds on that surface)* |
| root | `container-type: inline-size` *(container-first responsiveness: the assembly is the container its own chrome measures. The Table inside has a second, narrower container, its scroll port. So the bulk bar responds to the width of the whole assembly, and the columns respond to the width they are drawn in. Neither responds to the viewport)* |
| bulk bar + pager, wrapping | both rows are `Inline … wrap`, so each row's gap also applies between wrapped lines *(the toolbar rule of container-first responsiveness, `docs/layout.md`: the bulk bar and pager wrap like toolbars)* |
| bulk bar, narrow container | below a `36rem` **container** each cluster takes the whole line (`flex: 1 0 100%`): the count on one line, the actions on the next, full width *(this is DataTable's toolbar row; `36rem` is a rem literal with a comment, because a breakpoint is geometry, not theme)* |
| pager, narrow container | the Pagination inside wraps its own run of pages (see `pagination.md`), because a pager's length depends on the data: eleven pages means eleven controls |
| loading | header renders; body = 5 rows × columns of `Skeleton shape="text"` (`textStep="sm"`, width `100%`); `aria-busy` on the region; selection and expansion column skeletons are `circle size={4}`; no row is open while loading |
| empty | `EmptyState` from `emptyState`, in the body's place (Table chrome hidden); `data-empty` |
| pager | `pagination` holds a Pagination, a CursorPagination, or CursorPagination's `append` form ("Load more"), which adds rows below the ones shown. While the next rows load, the app sets the pager's `pending`, not `loading`: `loading` replaces the body with skeletons, and the rows already read must stay. While the app does something else to the rows (a bulk action, a save), it sets the pager's `disabled`, which both pagers take. The header's select-all then acts on every row shown, which is every row on this page |
| sorting | delegated to Table.Header `sortable`/`aria-sort`; exactly one sorted column (controlled shape enforces it) |

**Column priority is rejected.** A responsive mode that drops low-priority columns below a
container width breaks the "never hidden data" rule. A column hidden at 30rem is data a phone
user cannot see. At narrow widths the Table instead scrolls horizontally inside its panel (the
Dashboard grid's `minmax(0, …)` exists for this), so every column is reachable with the
platform's own scroll gesture. A narrow layout must *hide nothing*. The per-row disclosure
exists as `rowDetail`: it adds content under a row and hides no column, so it is not a way to
drop columns at a width. A row-detail layout that replaces the columns is a different anatomy
and needs its own spec through intake, not a flag on this one.

**Choosing columns is the application's.** `columns` is a prop. An app that lets a reader
choose columns filters the array it passes and draws the chooser itself, a MultiSelect of the
column headers. DataTable holds no hidden-column state, so the table draws exactly the columns
it is given and the app saves the choice with the reader's other preferences.

## States

Entries: plain 3×4, sortable sorted asc, selection with none/some (bulk bar +
indeterminate header)/all, expandable with every row closed, a row open, a row that takes no
detail, selection with expansion, loading, empty, with pagination row.
`requiredSelectors`: `[data-loading]`, `[data-empty]`, plus composed parts' own.

## Motion

The bulk bar enters with `slide-fade` (`control` class, distance `sm`, edge top). It has no
exit animation, because it leaves with the selection and an exit would delay the table's
return. A detail row appears and leaves without animation, because a row that grows moves
every row under it. Skeleton rows shimmer per Skeleton. Everything else inherits. At `none`:
instant.

## Icons — via composed parts (`sort*`, `confirm`, `indeterminate`, `down`, `up`). A11y — table
`label`; "`{n} selected`" is `aria-live="polite"` (one announcement per change, not
per row); header select-all announces its tri-state via Checkbox semantics.

A row is interactive exactly when `onRowClick` is given, and a click on it calls
`onRowClick` with the row.

A row's disclosure is a button with `aria-expanded`, and while its row is open it names the
detail row with `aria-controls`. Its name says which row it opens, so a list of the page's
buttons does not read "Details" once per row. The expansion column has a header, which is
announced and not drawn.

```contract
announces live:polite when some selected
click activates on row when plain
attr expander aria-expanded=false when expandable
attr expander aria-expanded=true when a row open
```

## Keyboard — the grid model

DataTable is keyboard-navigable as a grid. Making every checkbox its own tab stop is rejected.
A fifty-row table with a checkbox per row would have fifty-one tab stops, and a keyboard user
heading for the pagination control below would have to pass all of them. The grid uses **one**
tab stop with arrow keys inside it, as a listbox does, for the same reason.

The model (`packages/react-ui/src/structure/grid-keyboard.ts`):

- Table exposes `role="grid"` (+ `aria-multiselectable` with selection). Rows and cells keep
  their native table semantics, so no hand-written `row`/`gridcell` duplicate can drift.
- One roving tab stop, set as a DOM property and never through React state, so a held arrow
  key does not re-render fifty rows. Coordinates are derived from wherever focus lands, so
  clicks and keypresses stay consistent without coordinating.
- Arrows move by cell. A text-entry widget in a cell keeps its own arrows and caret.
- Checkboxes, sort headers and row disclosures stay real widgets *inside* cells; the roving
  stop reaches them and Space/Enter activate them.
- A detail row (`tr[data-detail]`) is one cell across every column, and the arrow keys
  reach it as they reach a cell of text. ArrowDown from a cell of an open row moves to the
  row's detail cell, and ArrowDown again moves to the next row, in the column the reader was
  in. ArrowUp is the reverse. A row's index counts only the rows that are not a detail, and
  a detail is found from the row it follows. A detail the arrow keys passed over could be
  read only with a pointer or a screen reader's own cursor, because a detail of text holds
  no tab stop.
- ArrowLeft, ArrowRight, Home and End do nothing in a detail cell, because its row has no
  other cell. The grid still takes the key, so the page does not scroll. Ctrl or Meta with
  Home or End leaves the detail cell for the grid's first or last cell, as from any cell.
- The detail cell takes the roving stop itself, whatever it holds, and no `tabindex` is
  written on what it holds. A detail's controls keep their place in the page's tab order:
  Tab from the detail cell, or from the row's disclosure, reaches the first of them. A key
  pressed in what a detail holds is that content's own. A detail is free content, a form or
  a second table, and a grid cannot know how to move through it.
- The grid's first tab stop is the first cell of the header row that draws something. A cell
  that holds `[data-undrawn]` only names its column, so the expansion column's header is
  never the first stop: in a table without selection the first stop is the first data
  column's header, and with selection it is the header's checkbox. A tab stop on a cell
  that shows nothing puts a focus ring around an empty corner. The cell stays reachable
  with the arrow keys, because it carries the column's name, and a stop the reader has
  placed stays where it is.
- Rows that sorting, paging, loading or the app's own data replace keep one tab stop: the stop
  goes to the same coordinates, or to the last row when there are fewer. When the row that holds
  focus leaves the document, a browser hands focus to the page; the grid takes it back to the
  same column of the row that takes the removed row's place, or of the last row when the removed
  row was the last. Focus the reader moved out of the grid stays where it is. Tree keeps focus
  the same way (`tree.md`).

```contract
role table grid
attr table aria-multiselectable=true when selectable
key ArrowRight moves-focus-next on cell when selectable
key ArrowLeft moves-focus-previous on cell when selectable
key Space activates on rowcheck when selectable
key Enter activates on sort when sorted, ascending
key Enter opens on expander when expandable
key Space activates on expander when a row open
```

## Agent

An agent reads the sort, the columns, the selection, the open rows and whether the table is
loading, and sorts by a column, ascending or descending, which calls `onSortChange` as a press
on that column's header does. Each column is a choice whose id is its `key` and whose label is
its `header`; a column that is not `sortable` is a disabled choice, so sorting by it is refused.
Sorting a column the way it is sorted already changes nothing. The sort and the selection
belong to the application, so they change when it passes the new value back. The selection and
the open rows read as row ids, the values `getRowId` returns.

An agent selects rows and opens their details with the controls a person uses: each row's
Checkbox, the header's select-all Checkbox and each row's disclosure Button are members of
their own, listed within the DataTable, as are the controls the application passes (a cell's
content, a row's detail, the bulk actions, the empty state and the pagination). The table does
not withhold its own Checkboxes and Buttons, because they share the table with the application's
cells and details, and withholding the table would withhold those too. The Table it draws is its
own part and registers nothing, so an agent sees one DataTable and not a Table beside it. A
header's sort control is not a member, so the table's sort actions are an agent's only way to
sort.

```agent
state sort-key id
state sort-direction text
state columns choices
state selection ids
state expanded ids
state loading boolean as root data-loading
action sort-ascending id calls onSortChange
action sort-descending id calls onSortChange
```
