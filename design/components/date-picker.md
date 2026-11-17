# DatePicker

A date field with segmented keyboard entry and a Calendar popup.

Behaviour comes from **React Aria** `useDatePicker` / `useDateField` / `useDateSegment` +
`@internationalized/date` (`README-substrates.md` §3.6). The repo's existing Radix positioning
places the popup, and the popup takes no focus scope of its own. The segments keep DOM focus.
The calendar takes focus only when the user opens it (`README-substrates.md` §4's one permitted
hand-off: trigger → calendar, owned by Radix as in a popover).

The field works **without** the popup. The segments are the primary input and the calendar is
an aid. This justifies the calendar's bundle cost (`README-substrates.md` §8): typing,
stepping, validation and serialisation all work without opening the popup, so a keyboard user
never needs the grid.

## Anatomy

```
[field — Input grammar]
  [segments: [dd] [sep] [mm] [sep] [yyyy]]  — locale-ordered
  [calendar trigger: iconOnly ghost "calendar"]
[popup — panel hosting Calendar]
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `value` / `defaultValue` / `onChange` | `CalendarDate \| null` | — | `@internationalized/date`, never `Date` (Calendar's law). At `granularity` `'hour' \| 'minute'` the pair is `CalendarDateTime \| null`, the same package's datetime type, still without a time zone. `name` serializes ISO-8601 at the granularity |
| `minValue` / `maxValue` / `isDateUnavailable` | Calendar's | — | forwarded; segment entry outside range marks invalid |
| `locale` / `firstDayOfWeek` | Calendar's | — | locale also orders the segments |
| `granularity` | `'day' \| 'hour' \| 'minute'` | `'day'` | time adds segments, not a new component, and a datetime is the same machinery with more segments. Time granularities append `time-input.md`'s cells after the date segments, dayPeriod included; that spec defines them. The popup stays a month grid. It sets the date part and leaves the time unchanged (the substrate merges them). Time is typed and stepped, never picked. The hour cycle follows the locale here; the `hourCycle` override belongs to TimeInput, not to the datetime |
| `clearable` | `boolean` | `false` | Input's clear affordance; `onChange(null)`, segments return to placeholders |
| `size` / `placeholder-less` | `'sm' \| 'md' \| 'lg'` | `'md'` | no free-text placeholder. Empty segments show their own pattern (`dd`, `mm`, `yyyy`, localized) |
| `disabled` / `invalid` / `name` / `id` | Input's | — | `name` serializes ISO-8601 |
| `presentation` | `'auto' \| 'popover'` | `'auto'` | `'auto'` shows the popup as a sheet below `30rem` (see the sheet section below; conventions §12). `'popover'` keeps the popper at every width. There is no always-`'sheet'` value, because a bottom sheet is wrong on a wide pointer screen and the closed union excludes it |
| `messages` | `{ showCalendar: string; clear: string; chooseDate: string; previousMonth: string; nextMonth: string }` | English | every label the picker uses that `Intl` cannot supply *(the localization seam)*: the trigger, the clear control, the popup's accessible name, and Calendar's two month labels. Those two are forwarded to Calendar, so one catalog entry serves both |

The English `messages` are `Show calendar`, `Clear`, `Choose a date`, `Previous month` and
`Next month`.

Attributes: field `data-size`, `data-invalid?`, `data-disabled?`,
`data-state="open|closed"` (popup); segments `data-segment="day|month|year"`
(+ `"hour|minute|dayPeriod"` at time granularities),
`data-placeholder?` (unfilled); popup `data-presentation="sheet"` while drawn
as a sheet (per conventions §12).

## Recipes (exact tokens)

| Part | Tokens |
| --- | --- |
| field | Input's container recipe verbatim, content left-aligned as a segment row · gap `2px` around separators · seat `--pm-shadow-control` (`none` disabled), Input's seat row, shared by the field family |
| segment | `text.{size map}` per conventions §2 · `--pm-text-primary` · `font-variant-numeric: var(--pm-font-numeric)` (tabular figures, so segments keep their width as digits change) · padding-inline `2px` · radius `--pm-radius-sm` |
| segment placeholder | `--pm-text-muted` (the unfilled pattern) |
| segment focused | bg `--pm-accent-subtle` · text `--pm-accent-text` (the transient position, using the hover-wash family, not selection: focus is *at* the month, which is not yet chosen) |
| separator | locale's literal (`/`, `.`, `-`) · `--pm-text-muted` |
| calendar trigger | Button `ghost/neutral/{size} iconOnly icon="calendar" label="Show calendar"` · trailing, inside the field (Input's clear-slot geometry) |
| popup panel | Select's panel surface (`--pm-bg-overlay` · `1px --pm-border-subtle` · `--pm-radius-lg` · `--pm-shadow-overlay`) · padding `0` (Calendar brings its own `--pm-space-3`) · popper bottom-**end** aligned to the field, `sideOffset 2` (the grid is wider than the field, and end alignment keeps it under the trigger) |
| popup content | `Calendar` verbatim (`calendar.md`), with no restyling; the value passes both ways |

**The sheet, below `30rem`**: under `presentation="auto"` the popup becomes conventions §12's
sheet: bottom-attached, full-width (the popper alignment rows no longer apply), §12's cap,
safe-area insets, `sheet` motion and `data-presentation="sheet"`. **Calendar sits inside the
sheet verbatim.** The grid, its cells and its month navigation are unchanged from
`calendar.md`. The segments stay the primary input at every width, and the field itself never
becomes a sheet. The one permitted focus hand-off still works in the sheet: trigger → the
calendar's focused day, Escape back to the trigger, and selection closes the sheet and returns
focus to the field. If it does not, the sheet does not ship (§12).

## FormField integration

As for Input: FormField's label targets the field group (`role="group"` +
`aria-labelledby`), and description and error go through `aria-describedby` on the group.
`invalid` from context colours the container exactly as in Input. Segment-level validity (a
typed `31` in February) appears as the field's `invalid` plus `aria-invalid` on the invalid
segment.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| empty | no value | segments `data-placeholder` |
| filled | `defaultValue` | formatted per locale |
| open | `defaultOpen` | `data-state="open"`; Calendar present with the value selected |
| locale order | `locale="en-US"` vs `"de-DE"` | segment order differs |
| clearable | value + `clearable` | clear present |
| out-of-range typed | beyond `maxValue` | `data-invalid` |
| datetime | `granularity="minute"` + `defaultValue` | time segments after the date, one field |
| invalid / disabled | each | `data-invalid` / `data-disabled` |

`requiredSelectors`: `:focus-visible`, `[data-state="open"]`,
`[data-placeholder]`, `[data-invalid]`, `[data-disabled]`.

## Motion

Popup: Select's `scale-fade`, `surface` class, origin-aware (top-end here). Segment focus
changes `stateFeedback` colour only, because text around a caret must not move. Value changes
never animate the segments, because the digits are data. At `none` or under reduced motion,
the patterns' projections apply.

## Icons

`calendar` (trigger, labelled). Calendar's own `previous`/`next` arrive with it.

## A11y

React Aria's date field pattern: a `role="group"` field, and each segment a
`role="spinbutton"` with `aria-valuetext` (the full formatted value). Arrows increment and
decrement, digits type through, and left and right move between segments. DOM focus stays in
the segments. The trigger opens the popup on a press, Enter or Space, and so does Alt+ArrowDown in
a segment (React Aria's shortcut); either moves focus to the calendar's focused day.
Escape returns focus to the trigger (Radix popover behaviour; this is the one hand-off).
Selecting a date closes the popup, updates the segments and returns focus to the field.
The clear button clears on a press, Enter or Space, as Input's does, and focus moves to the first
segment, because the button leaves with the value.
`aria-live` on the group announces the completed date once, not per keystroke. RTL orders
segments and popper alignment correctly.

```contract
role field group
role segment spinbutton when filled
key ArrowUp increments on segment when filled
key ArrowDown decrements on segment when filled
key ArrowRight moves-focus-next on segment when filled
key ArrowLeft moves-focus-previous on segment when filled
key Alt+ArrowDown opens on segment
key Enter opens
key Space opens
focus on-open day
key Escape closes when open
focus on-close trigger
key Enter closes on day when open
```

## Agent

An agent reads the value, whether the popup is open and whether the field is disabled or
invalid, and sets the value, clears it, and opens and closes the popup. The value is ISO 8601
text in the form the member's value writes itself at its granularity: `2026-07-15` for a day,
`2026-07-15T09:30:00` at `hour` and `minute`, and the empty string while the field holds no
date. The field reports an agent's value through `onChange` as it reports a person's entry,
controlled or not. Text in any other form is refused, and so is a time finer than the field's
segments, which a person cannot enter. A day outside `minValue` and `maxValue`, or one
`isDateUnavailable` refuses, is refused too, with the reason: a person who types one sees the
field marked invalid, and an agent is told why instead of leaving an invalid field. The calendar
button, the clear button and the Calendar in the
popup are the picker's own parts, so the picker withholds them and the bridge lists the
DatePicker in their place. The picker withholds two regions, the field and the popup with its
Calendar, so neither the calendar button nor the Calendar is listed while the popup is open. A
disabled field lists no action.

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
