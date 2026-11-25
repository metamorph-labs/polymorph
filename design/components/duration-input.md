# DurationInput

A field for a length of time, such as a session lifetime, a retention period or a timeout. It
holds a whole number of seconds and shows it as counts of days, hours, minutes or seconds,
each count a segment with its unit written beside it, so a reader sees "7 days" where a number
field shows 604800.

Behaviour: **no substrate**. Each renderer draws the segments as spinbuttons and routes their
keys to the engine's duration arithmetic (`durationKey`, `durationSegments`, `commitDuration`
in `@polymorph/engine`, re-exported by every web foundation). The arithmetic is one module
with its own logic tests, so every framework splits, steps, carries and clamps a value the
same way.

The segments are the member's own, not TimeInput's. React Aria's time field and the engine's
date segments model a clock: every segment wraps inside a fixed range, the hour stops at 23
or 12, a 12-hour locale adds a day period, and the locale's date format orders the segments.
A duration has none of these. Its largest unit has no ceiling, because 36 hours is a lawful
length when hours are the largest unit shown. A step carries into the next unit instead of
wrapping, because the arrows change a quantity. The order is always largest first, and each
count needs its unit's word. What the two members share is how a segment is drawn and
edited: a spinbutton that takes focus, the same moves between segments, the same rule for
typed digits and the same erase.

How it differs from its neighbours:

- **Not TimeInput.** A time is a point on the clock (09:00 on any date). A duration is an
  amount of time (15 minutes from now, or from the last request).
- **Not NumberInput with the unit in the label.** That is how the surveyed screens enter a
  lifetime today: a number field labelled "(seconds)" with "900 to 604,800 seconds" in its
  description, which leaves the reader to work out that 604,800 is seven days. NumberInput
  stays the field for a count that is not a length of time.
- **Not a choice of a few lengths.** A screen that offers 15, 30 or 60 minutes and nothing
  else uses `Select`, or `RadioGroup` when every choice should stay visible, because the
  reader picks a named option rather than enters a quantity. This member has no presets.

## Anatomy

```
[field — Input grammar, role="group"]
  [segments]
    [quantity]+          — one per unit shown, largest first
      [count]            — role="spinbutton"
      [unit word]        — the locale's short word, aria-hidden
  [hidden input?]        — under `name`
```

The locale writes the unit word after the count in every surveyed language. A locale that
writes it first gets it first: the engine reads the side from `Intl.NumberFormat`.

## API

| Prop                                  | Type                      | Default                        | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------- | ------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `value` / `defaultValue` / `onChange` | `number \| null`          | —                              | whole seconds, and `null` for the empty field. `onChange(seconds)` reports **committed values, never drafts**, as NumberInput does: a step commits as it fires, and typed or erased digits commit when focus leaves the field or on Enter. A committed value is held inside `min` and `max`, so a value outside them never reaches the app. A commit that leaves the value as it was reports nothing. A controlled `value` the app changes replaces what the field shows |
| `units`                               | `readonly DurationUnit[]` | `['days', 'hours', 'minutes']` | which segments show, from `'days' \| 'hours' \| 'minutes' \| 'seconds'`, in any order; the field shows them largest first, each once. The default covers the surveyed session and retention screens, which range from 15 minutes to 90 days in whole minutes. A field in whole days passes `['days']`; a short timeout passes `['minutes', 'seconds']`                                                                                                                   |
| `min` / `max`                         | `number`                  | `0` / none                     | seconds. A commit holds the value inside them, as NumberInput clamps on commit. The arrows stop at them. A digit the largest segment cannot hold under `max` is refused. Both move inwards to whole counts of the smallest unit shown (`min={90}` with minutes shown holds at 2 minutes), so the reported value is one the segments draw                                                                                                                                 |
| `locale`                              | `string`                  | app default (provider)         | the digits, the unit words, each segment's name and its spoken value, all from `Intl`                                                                                                                                                                                                                                                                                                                                                                                    |
| `messages`                            | `DurationInputMessages`   | English                        | the one word the member writes itself: `empty`, what an empty segment says as its value ("Empty"). The unit words are `Intl`'s, so a locale gets them without a catalog                                                                                                                                                                                                                                                                                                  |
| `size`                                | `'sm' \| 'md' \| 'lg'`    | `'md'`                         | conventions §2. No free-text placeholder; an empty segment shows `––`, as TimeInput's does                                                                                                                                                                                                                                                                                                                                                                               |
| `disabled` / `readOnly` / `invalid`   | `boolean`                 | `false`                        | Input's. `readOnly` keeps the segments focusable, and the arrows and digits do not edit                                                                                                                                                                                                                                                                                                                                                                                  |
| `name` / `id`                         | native passthrough        | —                              | `name` posts the committed value as whole seconds in a decimal string (`"604800"`), and the empty string for no value. Every surveyed screen sends seconds, so no ISO 8601 form (`PT15M`) is offered                                                                                                                                                                                                                                                                     |

```ts
type DurationUnit = 'days' | 'hours' | 'minutes' | 'seconds'

interface DurationInputMessages {
  empty: string // what an empty segment says as its value; default "Empty"
}
```

The label, the description, the error and the required mark are FormField's, as for every
field. The field is a group, so FormField names it by association.

**A value the units cannot write.** The segments draw the value rounded to the nearest count
of the smallest unit shown, half up: 90 seconds with only minutes shown is drawn as 2 minutes.
The value itself is kept: the hidden field posts 90, and nothing is reported, until the reader
changes what the segments show. A changed field reports what its segments show, so the
remainder is gone once the reader edits. TimeInput keeps a supplied value's seconds for the
same reason, that a field does not change data the reader did not touch. A duration's
remainder is part of the quantity, so it is not kept through an edit the reader made from the
drawn value.

Attributes: field `data-size`, `data-invalid?`, `data-disabled?`, `data-readonly?`; each count
`data-segment="days|hours|minutes|seconds"` and `data-placeholder?` while empty. No
`data-state`, because nothing opens.

## Keyboard

| Key                    | In a count                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ArrowUp / ArrowDown    | one of the segment's unit more or less, reported at once. The count **carries**: 59 minutes and one more is 1 hour 0 minutes, and one less than 1 hour 0 minutes is 59 minutes. The value stops at `min` and `max`. An empty field counts as zero: ArrowUp gives one unit, ArrowDown the minimum                                                                                        |
| digits                 | type into the count. A count below the largest unit stays under the next unit shown: the minutes hold 0 to 59 while hours show. A digit that would pass that starts the count again, so 90 is **refused** in those minutes: the 9 fills them and focus moves on, as in TimeInput. Focus moves on once no further digit could fit. The largest unit takes as many digits as `max` allows |
| Backspace / Delete     | erase the count's last digit, then empty it; in an empty count, move to the one before. An empty count reads as zero, and a field whose every count is empty commits `null`                                                                                                                                                                                                             |
| ArrowLeft / ArrowRight | move to the count drawn on that side, staying put at either end. In a right-to-left document ArrowLeft moves to the next, smaller unit                                                                                                                                                                                                                                                  |
| Enter                  | commits what has been typed, without moving focus                                                                                                                                                                                                                                                                                                                                       |
| Tab                    | the browser's: each count is a tab stop, as TimeInput's segments are                                                                                                                                                                                                                                                                                                                    |

Typing refuses where stepping carries because each keeps every count but the largest inside
its unit. A typed digit belongs to the count it is typed into: turning 90 typed minutes into
1 hour 30 minutes would rewrite two counts while the reader is still typing one.

## Direction

The counts follow the direction of the place the field is in. In a right-to-left page the largest unit is
rightmost and the row reads from it, which is how Arabic and Hebrew write a duration. The
recipe is written in logical properties and the member writes no `dir`, so the direction law
holds it. The arrows that move between counts follow the drawn order, as TimeInput's do.

## Recipes (exact tokens)

Every cell is TimeInput's, which cites `date-picker.md`: **field** (Input's container recipe,
`--pm-shadow-seat`, `none` when disabled), **segment**, **segment placeholder**, **segment
focused** (the hover-wash family, not selection, because focusing a count does not choose it)
and the states. Two cells are new:

| Part      | Tokens                                                                                                                                                                                  |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| quantity  | one count and its word, gap `--pm-space-1`; the quantities sit `--pm-space-3` apart, the field's own gap, so "7 days 0 hr" reads as two quantities and not four words                   |
| unit word | `--pm-text-muted`, Input's affix colour, at the field's text step; `--pm-text-disabled` when disabled. It is decoration beside a count that already says its unit to assistive software |

**The phone floor**: conventions §13 does not apply, for TimeInput's reason. Entry is through
`role="spinbutton"` counts, not a real `<input>`, and the UA zoom that §13 prevents only
happens on real text-entry elements.

**On iOS**: the counts are not typed. The field draws them, and a tap opens the platform's
wheel pickers, one per unit shown, as the Clock app's timer sets a length. A turn of a wheel
commits, as a step does. A wheel draws its whole list, so without `max` the largest unit's wheel
offers 0 to 999, or to the count the field holds when that is more.

**On Android**: each count is TimeInput's digit segment, in a slot the 48dp touch target wide,
so a count stands the slot's spare width from its unit word rather than `--pm-space-1`. The
words come from the app (`LocalPMDurationWords`, from the platform's `MeasureFormat`), because
the member cannot reach the platform's own. Unprovided, they are English: drawn as `{count} day`,
`{count} days`, `{count} hr`, `{count} min` and `{count} sec`, and said as `{count} day`,
`{count} days`, `{count} hour`, `{count} hours`, `{count} minute`, `{count} minutes`,
`{count} second` and `{count} seconds`.

## FormField integration

The same as TimeInput: the label names the field group (`role="group"` + `aria-labelledby`),
and each count is named by the label and its unit ("Inactivity lifetime hour"). The
description and the error reach the group and every count through `aria-describedby`.
`invalid` from context colours the container as on Input and sets `aria-invalid` on each
count. There is no per-count validity, because a count cannot hold what its unit does not.
A value outside `min` and `max` is never committed, so the field reports no error of its own;
errors come from the app, through `invalid`.

## States

| Entry        | Render                                                                 | Expect                                              |
| ------------ | ---------------------------------------------------------------------- | --------------------------------------------------- |
| empty        | no value                                                               | counts `data-placeholder`                           |
| filled       | `defaultValue={604800}`, an inactivity lifetime                        | "7 days 0 hr 0 min"                                 |
| days only    | `units={['days']}` `defaultValue={2592000}`, an absolute lifetime      | "30 days"                                           |
| with seconds | `units={['minutes', 'seconds']}` `defaultValue={300}`, a short timeout | "5 min 0 sec"                                       |
| bounded      | `min={900}` `max={604800}` `defaultValue={900}`                        | "0 days 0 hr 15 min"; the days count's maximum is 7 |
| remainder    | `units={['minutes']}` `defaultValue={90}`                              | "2 min", drawn from 90 seconds                      |
| locale       | `locale="de-DE"` `defaultValue={5400}`                                 | "0 Tg. 1 Std. 30 Min."                              |
| sm           | `size="sm"` + value                                                    | `data-size="sm"`                                    |
| readOnly     | `readOnly` + value                                                     | `data-readonly`; counts hold their text             |
| invalid      | `invalid`                                                              | `data-invalid`                                      |
| disabled     | `disabled` + value                                                     | `data-disabled`                                     |

`requiredSelectors`: `:focus-visible`, `[data-placeholder]`, `[data-invalid]`,
`[data-disabled]`, `[data-readonly]`.

## Motion

TimeInput's: focusing a count changes `stateFeedback` colour only, because nothing near a
caret may move, and a count never animates when its value changes or carries, because
digits are information. There is no surface, so there is no surface motion.

## Icons

None. A clock glyph beside counts that open nothing would look like a control with nothing
behind it (TimeInput's reason).

## A11y

A `role="group"` field named by FormField's label, and each count a `role="spinbutton"`
named by the label and its unit's name from `Intl.DisplayNames` ("minute"). Its value is
`aria-valuenow` with `aria-valuetext` saying the count and the unit's long word from
`Intl.NumberFormat` ("15 minutes"), or `messages.empty` while it is empty.
`aria-valuemin` is 0. `aria-valuemax` is what the count holds below the next unit (59 for
minutes under hours), and for the largest unit what `max` holds; with no `max` the largest
count has none. The unit words drawn beside the counts are `aria-hidden`, because each count
already says its unit. The member adds no live region: a reader stepping a count hears what
the spinbutton announces itself, and a carry changes the larger count, which the reader hears
on moving to it. `readOnly` sets `aria-readonly`, `disabled` `aria-disabled` and removes the
counts from the tab order.

```contract
role field group
role segment spinbutton when filled
attr segment aria-valuetext when filled
key ArrowUp increments on segment when filled
key ArrowDown decrements on segment when filled
key ArrowRight moves-focus-next on segment when filled
key ArrowLeft moves-focus-previous on segment when filled
```

What the grammar cannot state is `@polymorph/conformance/duration-input`'s, which every web
renderer's test calls: typing and stepping report seconds, a step carries and a typed count
is refused, `min` and `max` hold a commit, a controlled value is drawn, the hidden field
posts seconds, a value the units cannot write is kept until an edit, and the counts' names
and values say their units.

## Agent

An agent reads the committed seconds and whether the field is disabled, invalid or read-only,
and sets the seconds or clears them. The value is the number of whole seconds the field holds,
and `null` while it holds none. The field reports an agent's seconds through `onChange` as it
reports a person's commit, controlled or not. Seconds that are not a whole count of the
smallest unit shown are refused, because the segments cannot draw them, and so are seconds
outside `min` and `max`, which a person's commit is held inside. A read-only field refuses both
actions, as its counts edit nothing, and a disabled field lists no action.

```agent
state value number
state disabled boolean as field data-disabled
state invalid boolean as field data-invalid
state readonly boolean as field data-readonly
action set number sets value calls onChange
action clear sets value calls onChange
```
