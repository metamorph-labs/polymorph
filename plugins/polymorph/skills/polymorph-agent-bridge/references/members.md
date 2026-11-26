# How the members read and act

The card names each member's actions and states. This file says what the names mean where a
caller can go wrong. The JSON answer of `component` gives each one's type:

```sh
npx -y @metamorph-labs/polymorph@1.0.18 component LineChart --framework <framework> --json
```

## What holds for every member

- **A choice** is `{ id, label }`, with `disabled: true` on one a person cannot pick and
  `destructive: true` on one that waits for a person. An action that takes `id` names one
  choice, and one that takes `ids` names the whole set. A repeated id takes ` (2)` after it.
- **The application owns a controlled value.** A member whose value the application holds changes
  when the application passes the new value back. Until it does, a step succeeds with an empty
  `changed`.
- **A press is a person's press.** An action that presses a link takes the path a person's click
  takes: `onNavigate` routes it, or the browser leaves the page, and the step may never return.
- **A refusal is a `failed` step** with the member's reason: a read-only field refuses
  `fill`, and a `Dialog` that is not dismissible refuses
  `close`.

## What an id names

A member drawn from a list the application passes names each choice by a field of the entry. The
text answer of `npx -y @metamorph-labs/polymorph@1.0.18 component <Name> --framework <framework>` prints that entry's fields under
Types.

| Member | `choose` takes | Each id is |
| --- | --- | --- |
| `Select` | one id | the `value` of an entry of `options`, a `SelectOption` |
| `Combobox` | one id | the `value` of an entry of `options`, a `ComboboxOption` |
| `MultiSelect` | the whole set of ids | the `value` of an entry of `options`, a `MultiSelectOption` |
| `TreeSelect` | one id | the `id` of an entry of `items`, a `TreeItem` |
| `RadioGroup` | one id | the `value` of an entry of `options`, a `RadioOption` |
| `CheckboxGroup` | the whole set of ids | the `value` of an entry of `options`, a `CheckboxGroupOption` |
| `SegmentedControl` | one id | the `value` of an entry of `options`, a `SegmentedControlOption` |
| `ChoiceCard` | the whole set of ids | the `value` of an entry of `options`, a `ChoiceCardOption` |
| `Tabs` | one id | the `value` of an entry of `tabs`, a `TabDescriptor` |

- `Select` and `TreeSelect` with `emptyOption` list the empty choice as `''`.
- An entry with `disabled: true` is listed with that flag, and a step that names it answers
  `invalid-value`.
- Another member names its choices as it says below, such as a `Menu` entry by its label.

## Fields

- `Input`, `Textarea` and `SearchInput`: `fill`
  writes the whole value, as typing it does, and `clear` empties it. Their
  value is read, whatever the field holds: only `PasswordInput`, `OTPInput` and a
  password field keep a value secret.
- `NumberInput`: `set` commits a number held within
  its bounds, and `clear` commits `null`.
- `Slider`: `set` moves the first thumb and
  `set-high` the second of a range.
- A field that holds formatted text takes the form its own `value`
  shows, and refuses another form with the reason. `DatePicker` takes `2026-07-15`, or
  `2026-07-15T09:30:00` at a time granularity. `DateRangePicker` takes
  `2026-06-01/2026-06-14`. `TimeInput` takes `09:30:00`. `PhoneInput` takes a
  number with its `+` code or the national number, and reads the E.164 value.
- `FormField` declares nothing. Its label names the control, and its hint and its error are
  the control's `description`, which an agent reads after a fill.
- `PasswordInput` and `OTPInput` run nothing. A person types a secret.
- `FileUpload` runs `remove` and
  `retry` on the `rows` ids, and adds
  no file: a file is on the person's disk.

## Choices

- A choice made while a list is closed needs no `open` first.
- `Combobox`: `choose` picks among every option the
  application passed, not only those the typed text leaves, and
  `fill` types the query, which the application hears as typing.
- `MultiSelect`: `choose` sets the whole selection, and
  `[]` clears it.
- `SplitButton`, `Menu`, `ContextMenu` and `Menubar`: `choose` runs an entry by its id, without opening the menu. The id is the entry's
  label, after each enclosing submenu's label and, on a `Menubar`, its menu's title, joined
  by ` / ` (`Move to / Billing`, `File / Save`). A `danger` entry waits for a person.

## Overlays and disclosure

- A closed `Dialog`, `Drawer` or `Popover` is not listed. Press the
  control that opens it, usually a `Button`, then read again. An open one runs
  `close`. A `Dialog` that is not dismissible is answered with one of its own Buttons.
- `ConfirmDialog` runs `cancel` only. Its confirm is the
  person's. The Button that opens it is the application's, and an agent presses it: a
  `tone="danger"` one asks `confirm` first, so the person is asked twice.
- Content in a closed `Accordion` item, `Collapsible` or tab is not listed. Run
  `expand`, `open` or
  `choose` first, then read again.
- A modal does not hide the page behind it from the bridge, and neither does a stylesheet: only
  an absent element and content marked `hidden` are left out. Read `within` to tell the members
  inside an open `Dialog` from the ones behind it.

## Tables, lists and paging

- `Table`: `columns` lists the sortable headers, each by its label.
  `sort` presses a header once, and the application decides the order,
  so read `sort-key` and `sort-direction` afterwards.
- `DataTable`: `sort-ascending` and
  `sort-descending` take a column's key. Its row Checkboxes and
  disclosure Buttons are members listed `within` it, and `selection`
  and `expanded` read row ids.
- No table reads its cells. A model that needs the rows gets them from a tool of the
  application's own.
- `List`: `choose` presses an item, whose id is its `href`, or
  its title when it has none. An item that is only read is not a choice.
- `Pagination`: `set` asks for a page by its number.

## Charts

A chart is listed while a person has something to operate in it: `onSelect`
on `BarChart`, `LineChart`, `AreaChart`, `Heatmap`, `DonutChart`, `ScatterChart`, `Histogram`, `RadarChart`, `FunnelChart` and `Treemap`, a legend that hides and shows a series on `BarChart`, `LineChart`, `AreaChart`, `ScatterChart` and `RadarChart`, or a brush on
`LineChart` and `AreaChart`. Without `onSelect`, `items` is empty.

- `items` lists at most `CHART_MARK_CAP` marks: the whole positions
  around the reading position. `position` is the reading position, and
  `count` how many positions the chart has.
- `read` moves the reading, which brings other marks into
  `items`. `choose` picks a listed mark as Enter does, so
  `onSelect` receives what a person's press reports.
- `toggle` hides or shows one of `series`,
  and `hidden` lists the hidden ones. `choose` and `toggle` each name,
  as `among`, the list their id belongs to, and each refuses an id of the other list.
- `brush` takes the row a range ends on and commits the range,
  and `range-start` and `range-end` read it.

## Toasts and the app shell

- `Toast` is one member on the viewport. `notices` lists the notices
  on screen by their ids, `details` says what each holds, and
  `dismiss` and `act` answer one. Neither
  waits for a person.
- `AppShell`: `go` presses one of
  `destinations`, and `current` is where the person
  is. `collapse` and `expand` work the rail,
  and `open` and `close` the drawer below its
  breakpoint.

## What no agent does

- Type a secret, or reveal one.
- Add a file to `FileUpload`, or start a `RecordButton`, which runs
  `stop` only.
- Confirm for a person: `ConfirmDialog`'s confirm and `ApprovalCard`'s answers are
  withheld.
- Press a `Link` that opens a new tab: a browser opens one only in a person's own gesture.
- Read or run `CopyButton`, `Tooltip`, `HoverCard`, `Plan` or `ChatMessage`,
  which declare nothing.
