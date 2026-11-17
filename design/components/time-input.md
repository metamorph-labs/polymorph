# TimeInput

A field for entering a time of day. It is DatePicker's segmented entry on its own, with
no popup, because a clock has no equivalent of the month grid.

Behaviour: **React Aria** `useTimeField` / `useDateSegment` with
`@internationalized/date` (`README-substrates.md` §3.6). `useTimeField` *is*
`useDateField` given a clock's segment list. DatePicker's `granularity` row says time adds
segments, not a new component, and this member is built from cells that `date-picker.md`
already defines.

How it differs from its two nearest neighbours:

- **Not DatePicker at another granularity.** A datetime (a date *and* a time in one
  value) is DatePicker's own `granularity`: one field, one value. This member is the
  wall-clock time alone, such as a business-hours start of 09:00 on any date.
- **Not a duration.** `Time` is a point on the clock, not an amount of time. An SLA's "4
  hours to first response" is a DurationInput.

## Anatomy

```
[field — Input grammar]
  [segments: [hh] [sep] [mm] [dayPeriod?]]  — locale-ordered
```

No trigger and no popup; the segments are the whole control. `date-picker.md` treats the
segments as the primary input and the calendar as an aid. This member drops the aid, and
entry works the same without it.

## API

| Prop                                  | Type                   | Default                | Notes                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------- | ---------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `value` / `defaultValue` / `onChange` | `Time \| null`         | —                      | `@internationalized/date`'s `Time`: a plain wall-clock value (`hour`, `minute`, `second`, `millisecond`) with no date and no zone, never a JS `Date` (Calendar's law; a `Date` adds a timezone to a field that has none). The field edits down to its granularity. Finer fields in a supplied value (seconds on a `Time` the app built) pass through unchanged and are never zeroed |
| `granularity`                         | `'hour' \| 'minute'`   | `'minute'`             | the segment list: `'minute'` is `[hh] [mm]`, `'hour'` drops the minute segment. Seconds are not offered, because no surveyed screen edits them and the vocabulary grows only on measured demand                                                                                                                                                                                     |
| `hourCycle`                           | `12 \| 24`             | locale's               | the locale decides and the prop overrides. `12` renders the dayPeriod segment; `24` never does                                                                                                                                                                                                                                                                                      |
| `locale`                              | `string`               | app default (provider) | orders the segments, names the day periods, picks the separator literal (`date-picker.md`'s row)                                                                                                                                                                                                                                                                                    |
| `size`                                | `'sm' \| 'md' \| 'lg'` | `'md'`                 | conventions §2. No free-text placeholder; empty segments show their own localized patterns (`date-picker.md`'s law)                                                                                                                                                                                                                                                                 |
| `disabled` / `readOnly` / `invalid`   | `boolean`              | `false`                | Input's. `readOnly` keeps segments focusable and selectable (platform convention, Input's row); arrows and digits do not edit                                                                                                                                                                                                                                                       |
| `name` / `id`                         | native passthrough     | —                      | `name` serializes the ISO-8601 time in `Time`'s own form, `"09:30:00"`                                                                                                                                                                                                                                                                                                              |

Attributes: field `data-size`, `data-invalid?`, `data-disabled?`,
`data-readonly?`; segments `data-segment="hour|minute|dayPeriod"`,
`data-placeholder?` (unfilled). No `data-state`, because there is nothing to open.

## Recipes (exact tokens)

Every cell comes from `date-picker.md` and is cited, not restated: **field** (Input's
container recipe, content left-aligned as a segment row, gap `2px` around separators),
**segment**, **segment placeholder**, **segment focused** (the hover-wash family, not
selection, because focusing a segment does not choose its value), **separator** (the
locale's literal, `:` here, in `--pm-text-muted`). The seat row comes with the citation:
`--pm-shadow-control` on the field, `none` when disabled, as for every field.

One cell is new:

| Part              | Tokens                                                                                                                                                                                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| dayPeriod segment | the segment recipe unchanged. A word among digits needs nothing different (`font-variant-numeric` has no effect on letters), and AM is a segment, not a badge. Its placeholder is the locale's own day-period pattern, `--pm-text-muted` like the others |

**The phone floor**: conventions §13 does not apply to this member. Entry here is
through `role="spinbutton"` segments, not a real `<input>`/`<textarea>`, and the UA zoom
that §13 prevents only happens on real text-entry elements. Nothing steps up. The note is
here so every convention is covered.

**On Android**: each digit segment and the day period takes a slot the 48dp touch target wide,
so the touch areas of neighbouring segments meet and do not overlap. A segment's wash keeps its
drawn size in the middle of its slot, so the separator stands the slot's spare width from each
segment, about 14dp for two `md` digits at the standard density, not `2px`. DatePicker's time
segments are these.

## FormField integration

The same as DatePicker: the label targets the field group (`role="group"` +
`aria-labelledby`); description and error use `aria-describedby` on the group; `invalid`
from context colours the container as on Input. There is no per-segment validity state,
because the substrate clamps each segment to what can be typed (`date-picker.md`'s
finding). Errors come from outside, through `invalid`.

## States

| Entry        | Render                                | Expect                                             |
| ------------ | ------------------------------------- | -------------------------------------------------- |
| empty        | no value                              | segments `data-placeholder`                        |
| filled       | `defaultValue={new Time(9, 0)}`       | formatted per locale (a business-hours start)      |
| 24-hour      | `hourCycle={24}` + value              | no dayPeriod segment                               |
| locale cycle | `locale="de-DE"` + value              | 24-hour by locale, its own separator               |
| hour only    | `granularity="hour"` + `defaultValue` | one time segment (+ dayPeriod at a 12-hour locale) |
| readOnly     | `readOnly` + value                    | `data-readonly`; segments hold their text          |
| invalid      | `invalid`                             | `data-invalid`                                     |
| disabled     | `disabled`                            | `data-disabled`                                    |

`requiredSelectors`: `:focus-visible`, `[data-placeholder]`, `[data-invalid]`,
`[data-disabled]`, `[data-readonly]`.

## Motion

As in `date-picker.md` for segments: segment focus changes `stateFeedback` colour only,
because nothing near a text caret may move, and value changes never animate the segments,
because digits are information. There is no popup, so there is no surface motion. At
`none` / reduced motion: per the patterns.

## Icons

None, on purpose. The `time` role exists in the icon map but is not used here.
DatePicker's `calendar` glyph is a *button* that opens the calendar. A clock glyph beside
segments that open nothing would look like a control with nothing behind it.
RelativeTime makes the same choice from the other side ("the `time` icon role exists for
surfaces that need a glyph; a timestamp inside running text does not").

## A11y

`date-picker.md`'s segment pattern in full: a `role="group"` field, and each segment a
`role="spinbutton"` with `aria-valuetext` (the full formatted time). Arrows increment and
decrement, digits type in and advance, and left/right move between segments. DOM focus
never leaves the segments, and with no popup there is no focus hand-off. The dayPeriod
segment responds to arrows and to the locale's typed initials. `aria-live` on the group
announces the completed time once, not on every keystroke. RTL orders segments per
locale.

```contract
role field group
role segment spinbutton when filled
key ArrowUp increments on segment when filled
key ArrowDown decrements on segment when filled
key ArrowRight moves-focus-next on segment when filled
key ArrowLeft moves-focus-previous on segment when filled
```

## Agent

An agent reads the time and whether the field is disabled, invalid or read-only, and sets the
time or clears it. A time is ISO 8601 text in `Time`'s own form, `09:30:00`, and the empty
string while the field holds no time. The field reports an agent's time through `onChange` as
it reports a person's entry, controlled or not. Text in any other form is refused, and so is a
time finer than the field's segments (a minute at `hour`, a second at either granularity),
which a person cannot enter. A read-only field refuses both actions, as its segments edit
nothing, and a disabled field lists no action.

```agent
state value text
state disabled boolean as field data-disabled
state invalid boolean as field data-invalid
state readonly boolean as field data-readonly
action set text sets value calls onChange
action clear sets value calls onChange
```
