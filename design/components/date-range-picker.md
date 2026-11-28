# DateRangePicker

A date range field: two segmented date entries in one frame, with one RangeCalendar popup. Use
it when the value is a start date and an end date.

Range selection changes the value shape, the cell states and the keyboard model together, so it
is its own member, not a mode of Calendar (`calendar.md`) or a DatePicker `range` flag.
Behaviour comes from **React Aria** `useDateRangePicker` (two `useDateField`s) /
`useRangeCalendar` with `@internationalized/date`. The repo's existing Radix positioning places
the popup, under the focus-management boundary (`README-substrates.md` §4): Radix owns the
overlay and the hooks own the collection. The one permitted focus hand-off (trigger →
calendar, then back) is `date-picker.md`'s, unchanged.

**No presets.** "Last 30 days" chips are FilterBar controls. This follows the chart brush's
rule (`line-chart.md`: the brush is an *input device* that emits a committed range and never
owns the range's display; FilterBar owns it). A picker with its own presets would be a second
place where range state lives. An app's preset writes *into* this member by setting `value`.

## Anatomy

```
[field — Input grammar]
  [start segments] [– en-dash literal] [end segments]
  [calendar trigger: iconOnly ghost "calendar"]
[popup — panel hosting RangeCalendar (Calendar's grid, range cells below)]
```

## API

| Prop                                        | Type                | Default | Notes                                                                                                                                                                                                                                                                     |
| ------------------------------------------- | ------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `value` / `defaultValue` / `onChange`       | `DateRange \| null` | —       | both ends or `null`; a half-entered range is never reported. `onChange` fires when the second end commits (the substrate's behaviour). Clearing reports `null`. Ends are `CalendarDate`, never `Date` (Calendar's law) |
| `minValue` / `maxValue` / `isDateUnavailable` | Calendar's        | —       | react-aria's own validation shape, forwarded. A typed date outside the bounds marks the field invalid (`date-picker.md`'s row). The substrate marks a reversed pair (end before start) invalid on both halves |
| `locale` / `firstDayOfWeek`                 | Calendar's          | —       | locale also orders the segments and picks the separators                                                                                                                                                                                                                     |
| `clearable`                                 | `boolean`           | `false` | DatePicker's clear control: `onChange(null)`, and both segment groups return to their patterns |
| `size`                                      | `'sm' \| 'md' \| 'lg'` | `'md'` | conventions §2. No free-text placeholder; empty segments show their own localized patterns (`date-picker.md`'s law) |
| `disabled` / `invalid` / `id`               | Input's             | —       |                                                                                                                                                                                                                                                                              |
| `startName` / `endName`                     | `string`            | —       | two hidden inputs serialize ISO-8601, as DatePicker does, because one `name` cannot carry two values |
| `presentation`                              | `'auto' \| 'popover'` | `'auto'` | DatePicker's cell verbatim (`date-picker.md`; conventions §12): `'auto'` shows the popup as a sheet below `30rem` with **RangeCalendar inside the sheet verbatim**. `'popover'` keeps the popper at every width. The anchored-span keyboard model, the two-stage Escape and the hand-off are the same in the sheet |
| `messages` | `{ showCalendar: string; clear: string; chooseRange: string; previousMonth: string; nextMonth: string; empty?: string; start?: string; end?: string }` | English | DatePicker's cell, with the popup's name reworded for a range *(the localization seam)*, and the two halves' names: `start` and `end` (FormField integration, below) |

```ts
/** The value shape — react-aria's RangeValue, written closed. */
interface DateRange {
  start: CalendarDate
  end: CalendarDate
}
```

The substrate's `allowsNonContiguousRanges` is not exposed, because a range with gaps is two
values in one. When unavailable dates fall inside the span, the substrate instead limits
extension to the contiguous run around the anchor.

The English `chooseRange` is `Choose a date range`; the other four are DatePicker's.

Attributes: field `data-size`, `data-invalid?`, `data-disabled?`,
`data-state="open|closed"` (popup); popup `data-presentation="sheet"` while
drawn as a sheet (per conventions §12); segments as
`date-picker.md` (`data-segment`, `data-placeholder?`). Grid cells carry
`data-range-start` / `data-range-middle` / `data-range-end` **instead of**
`data-selected`, because a range cell states its role, not only that it is chosen.
The single-date attribute stays Calendar's own. Cells also carry `data-today?`,
`data-unavailable?`, `data-outside-month?`, `data-disabled?` unchanged.
A one-day range puts both endpoint attributes on one cell.

## Recipes (exact tokens)

Field, segments, trigger and popup panel use `date-picker.md`'s rows verbatim (popper
bottom-end, `sideOffset 2`, Calendar's own padding). The joining en-dash is a literal:
`--pm-text-muted`, `aria-hidden`. The substrate names the halves for screen readers, so the
punctuation carries no meaning. The seat row comes with the cited rows: `--pm-shadow-control`
on the field, `none` when disabled.

The grid is `calendar.md` verbatim. The range cells are new and apply conventions §11. The
mapping: **in-range = §11's choice wash; endpoints = the full content-selection treatment.**

| Part                     | Tokens                                                                                                                                                                                                                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data-range-middle`      | bg `--pm-accent-subtle`, §11's wash and nothing else; text stays `--pm-text-primary` (§11's channels are the whole change, as in ChoiceCard). Radius is `0` between neighbours, so the band reads as one range, not twenty-eight chips, and the grid's collapsed cells make it continuous |
| `data-range-start` / `-end` | `calendar.md`'s **day selected** recipe verbatim: bg `--pm-selection-bg` · text `--pm-selection-text` · border `1px solid --pm-selection-border` · the cell's own `--pm-radius-sm`. This is the full content-selection treatment calendar dates use (`--pm-selection-*`, §11's first paragraph), so the ends of a range look exactly like the chosen day in DatePicker's popup |
| endpoint + hover         | bg `--pm-selection-bg-hover`; selection has its own hover step (Table's law, via `calendar.md`) |
| middle + hover           | nothing changes (§11: the cell is already in the range). A press re-anchors, and the span collapsing to the new anchor is the feedback |
| day hover (available, un-chosen) | bg `--pm-bg-subtle` only. This is §11's demotion, and it replaces `calendar.md`'s accent-wash hover *inside this member*. With hover on the ghost wash, `--pm-accent-subtle` always means *in the range* and never also means hover |
| day pressed              | hover colours + press feedback (Button's ghost/neutral cell; the accent press ladder is dropped along with the accent hover) |
| today, in-range          | keeps its `1px --pm-accent-bg` border inside the wash, because today is a fact, not a choice (`calendar.md`). At an endpoint, selection wins and `aria-current` still marks today |
| anchored preview         | while selecting, the cells between the anchor and the focused position get the same three attributes. The preview *is* the range being made, not a hover effect, and it commits or cancels as a whole |

Unavailable, outside-month, grid-disabled and focus cells: `calendar.md` verbatim, so a focused
endpoint's ring lies inside its fill with a gap, in `--pm-selection-text`, inside its selection
border. One month
per popup. A second month pane can be added if the registry shows evidence that it is needed.
Navigation while anchored already spans months (below).

## Keyboard model (useRangeCalendar, documented)

Opening the popup (from the trigger by a press, Enter or Space, or with Alt+ArrowDown in a
segment) focuses the calendar, per `date-picker.md`'s hand-off. Enter/Space
**anchors** the start at the focused day. Arrows, and PageUp/PageDown across months, move the
focused position, and the highlighted span extends from the anchor to it. Enter/Space again
**commits** the end. **Escape is two-stage**, as in the brush. The first Escape cancels an
in-progress span: the anchor clears and the committed value stays. The second closes the popup.
Leaving the grid with an anchor active commits the anchored span (the substrate's default).
Committing the end closes the popup, fills both segment groups and returns focus to the field.

```contract
key Alt+ArrowDown opens on segment
key Enter opens
key Space opens
focus on-open day
key Escape closes when open with range
focus on-close trigger
```

## FormField integration

DatePicker's group wiring verbatim: the label targets the field group, description and error
go through `aria-describedby` on it, and `invalid` comes from context. Each half's segments are
named by the half, `messages.start` or `messages.end`, with the field's label, so a screen
reader says "Report range, Start Date, month…". Left out, the halves' names are React Aria's
"Start Date" and "End Date" in the page's locale on React, and "Start date" and "End date" in
English in a generated member. `start`, `end` and `empty` are optional, so a catalog written
before them still fits. The en-dash never carries the meaning. On iOS each of the field's two
dates is a button named the same way, the field's label and then its half's word ("Report range,
Start date"), with its date as its value and none while the range is empty. On Android the two
dates are one button named by the field, whose value is both dates, so `start` and `end` name
nothing there.

## States

| Entry              | Render                                                       | Expect                                                        |
| ------------------ | ------------------------------------------------------------ | ------------------------------------------------------------- |
| empty              | no value                                                     | both groups `data-placeholder`                                |
| range filled       | `defaultValue` June 1 → 14 (the report window)               | both groups formatted, en-dash between                        |
| open with range    | `defaultOpen` + `defaultValue`                               | `data-range-start`, `data-range-middle`s, `data-range-end`    |
| one-day range      | `start` = `end`                                              | one cell carries both endpoint attributes, no middles         |
| out-of-range typed | beyond `maxValue`                                            | `data-invalid`                                                |
| reversed typed     | end before start                                             | `data-invalid`; the substrate marks the pair                  |
| unavailable inside | `defaultOpen` + predicate striking mid-span dates            | struck cells; selection constrained around the anchor         |
| clearable          | value + `clearable`                                          | clear present; clearing empties both groups                   |
| invalid / disabled | each                                                         | `data-invalid` / `data-disabled`                              |

`requiredSelectors`: `:hover`, `:focus-visible`, `[data-state="open"]`,
`[data-placeholder]`, `[data-invalid]`, `[data-disabled]`,
`[data-range-start]`, `[data-range-middle]`, `[data-range-end]`.

## Motion

Popup: `date-picker.md`'s panel motion verbatim (Select's `scale-fade`, origin-aware,
top-end). Month navigation: Calendar's binding verbatim. Range changes recolour cells using
§7's shared state-feedback list and move nothing, because extending a span changes paint, not
layout. At `none` or under reduced motion, the patterns' projections apply.

## Icons

`calendar` (trigger, labelled "Show calendar"); `previous` / `next` arrive with
the grid.

## A11y

Grid semantics per `calendar.md` (real `<table>`, roving tabindex, `aria-live`
month label). Each day's accessible name is the full formatted date, and the
substrate describes the committed span on its cells ("Selected Range: …"), so colour is never
the only sign that a day is in the range. Segments are spinbuttons per `date-picker.md`, and
the group announces each completed date once. RTL: segment order, popper alignment and the
band's direction flip together. `data-range-start` stays the *earlier* date, because it
describes time, not position.

## Agent

An agent reads the range, whether the popup is open and whether the field is disabled or
invalid, and sets the range, clears it, and opens and closes the popup. The member's value is
one range, so it is one state: ISO 8601 text with the start and the end in the form a
`CalendarDate` writes itself, joined by `/` (`2026-06-01/2026-06-14`), and the empty string while
no range is committed. A one-day range writes the same date twice. The field reports an agent's
range through `onChange` as it reports a person's committed range, controlled or not. Text in any
other form is refused. An end before its start, and a day outside `minValue` and `maxValue` or
one `isDateUnavailable` refuses, are refused too, with the reason: a person who types one sees
the field marked invalid, and an agent is told why instead of leaving an invalid field. The
calendar button, the clear button and the range grid in the popup are the picker's own parts, so
the picker withholds them and the bridge lists the DateRangePicker in their place. The picker
withholds two regions, the field and the popup with its grid, so neither the calendar button nor
the grid's month buttons are listed while the popup is open. A disabled field lists no action.

```agent
state value text
state open boolean as panel present
state disabled boolean as field data-disabled
state invalid boolean as field data-invalid
action set text sets value calls onChange
action clear sets value calls onChange
action open sets open
action close sets open
withholds contents
```
