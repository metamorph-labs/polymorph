# Calendar

Calendar is a month grid for choosing a date, used on its own or inside DatePicker's
popup.

Behaviour comes from **React Aria** `useCalendar` / `useCalendarGrid` /
`useCalendarCell` with `@internationalized/date` (`README-substrates.md` §3.6). It
is the most expensive substrate in the survey. It is accepted because dates belong
in the catalogue and the only alternative is not shipping them.
`README-substrates.md` §8 weighs whether the grid should load lazily behind the
field.

**The Intl rail applies to this file as law:** all date maths uses
`@internationalized/date` (`DateValue`, `CalendarDate`). Locale and week start are
props. Month and weekday names come from `Intl.DateTimeFormat`. RTL mirrors
navigation. There is no translation *infrastructure*; strings the platform cannot
supply are props.

Single-date selection only. Range selection changes the value shape, the cell states
and the keyboard model together, so it is a separate member, DateRangePicker
(`date-range-picker.md`) with its RangeCalendar, not a hidden mode of this one.

## Anatomy

```
[root]
  [header] — [prev: iconOnly ghost "previous"] [month-year label] [next: iconOnly ghost "next"]
  [grid <table>]
    [weekday row <th>*]
    [week <tr>]* — [cell <td> [day <div>]]*
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `value` / `defaultValue` / `onChange` | `CalendarDate \| null` | — | `@internationalized/date` values, never `Date` (the Intl rail: a JS `Date` at a package boundary causes timezone bugs) |
| `minValue` / `maxValue` | `CalendarDate` | — | out-of-range cells are unavailable |
| `isDateUnavailable` | `(date: CalendarDate) => boolean` | — | app policy (booked-out days); unavailable ≠ disabled-component |
| `locale` | `string` | app default (provider) | drives names, numbering, week start |
| `firstDayOfWeek` | `0–6` | locale's | the explicit override the Intl rail provides |
| `focusedValue` / `onFocusChange` | `CalendarDate` | — | controlled month navigation for apps that need it |
| `disabled` | `boolean` | `false` | whole-grid |
| `messages` | `{ previousMonth: string; nextMonth: string }` | English | the two names `Intl` cannot supply *(the localization seam)*. Month and weekday names still come from the platform. Pass all keys or none, because a half-translated header shows two languages in one control |

Attributes: cells `data-selected?`, `data-today?`, `data-unavailable?`,
`data-outside-month?`, `data-disabled?`.

## Recipes (exact tokens)

The selected date uses **selection**, not hover (the content-selection family,
`--pm-selection-*`, conventions §11), so a chosen day stays marked when the pointer
leaves.

| Part | Tokens |
| --- | --- |
| root | inline-size: content (7 × cell + gaps) · padding `--pm-space-3` |
| header | height `--pm-control-height-sm` · label `text.sm` quartet · `--pm-text-primary` · `font-variant-numeric: var(--pm-font-numeric)` (years align) · prev/next `ghost/neutral/sm iconOnly` |
| weekday | `text.xs` · `--pm-text-muted` · centered · `Intl` short names |
| cell (day) | `--pm-control-height-sm` square · centered `text.sm` · `--pm-text-primary` · radius `--pm-radius-sm` · `font-variant-numeric: var(--pm-font-numeric)` |
| day hover (available, unselected) | bg `--pm-accent-subtle` · text `--pm-accent-text` |
| day pressed | bg `--pm-accent-subtle-active` (the wash's third step) |
| **day selected** | bg `--pm-selection-bg` · text `--pm-selection-text` · border `1px solid --pm-selection-border` |
| selected + hover | bg `--pm-selection-bg-hover` (selection has its own hover step, as in Table) |
| today (unselected) | border `1px solid --pm-accent-bg` · text `--pm-accent-text` (today is a fact, not a choice, so it gets a border and never a fill) |
| today + selected | the selection recipe wins; `aria-current` still marks the date as today |
| unavailable | text `--pm-text-disabled` · `line-through` · no hover |
| outside month | not rendered (empty cells). A 4-row month shows 4 rows, and days from other months would invite mis-clicks |
| grid disabled | all days `--pm-text-disabled`, no interaction |
| focus | the shared focus ring (conventions §4) on the focused day (roving focus, one tab stop) |

## States

| Entry | Render | Expect |
| --- | --- | --- |
| month with selection | `defaultValue` | `data-selected` on the day |
| today visible | current month | `data-today` |
| min/max bounds | narrow range | `data-unavailable` on out-of-range |
| unavailable dates | predicate | `data-unavailable`, struck |
| week start override | `firstDayOfWeek={1}` | Monday first |
| disabled | `disabled` | grid inert |

`requiredSelectors`: `:hover`, `:focus-visible`, `[data-selected]`,
`[data-today]`, `[data-unavailable]`.

## Motion

Month change: the outgoing grid `fade`s at `control-exit`, and the incoming grid
enters by `slide-fade` `sm` from the travel direction (`next` → from end,
RTL-aware), `surface` class. One pattern, no parallax. Day hover/press use
`stateFeedback` colours + the press scale. At `none` / reduced motion: instant month
swap (`slide-fade` projects to `fade`; `none` zeroes it).

## Icons

`previous` / `next` (labelled "Previous month" / "Next month"; the map's directional
pairing flips the glyphs in RTL).

## A11y

React Aria's calendar pattern: grid semantics (`role="grid"`, a real `<table>`),
roving tabindex, arrows move by day, PageUp/Down by month, Home/End to the week
edges. The header label is `aria-live="polite"`, so month changes are announced.
Each day's accessible name is the full formatted date, with `aria-selected`,
`aria-disabled`, and `aria-current="date"` for today. Weekday headers use
`<th scope="col">` with full names as labels.

```contract
role grid grid
key ArrowRight moves-focus-next on day when month with selection
key ArrowLeft moves-focus-previous on day when month with selection
announces live:polite when month with selection
```

## Agent

An agent reads the chosen date and sets it. A date is ISO 8601 text in the form a
`CalendarDate` writes itself, `2026-07-15`, and the empty string while no date is chosen. The
calendar reports an agent's date through `onChange` as it reports a person's, controlled or not,
and shows the date's month. Text in any other form is refused, and so is a day outside
`minValue` and `maxValue` or one `isDateUnavailable` refuses, because a person cannot choose
either. An agent does not clear the date, as a person cannot clear it in the grid. It does not
move between months: the month on screen is where a person looks, and an agent names the date
it sets. The month buttons are the calendar's own parts, so the calendar withholds them and the
bridge lists the Calendar in their place. A disabled calendar lists no action.

```agent
state value text
state disabled boolean
action set text sets value calls onChange
withholds contents
```
