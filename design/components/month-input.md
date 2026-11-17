# MonthInput

A field for a month and a year, with no day: a card's expiry, a billing month. It is
DatePicker's segmented entry with the month and the year segments only, and no popup.

Behaviour: the engine's segment model (`packages/engine/src/dates/segments.ts`), in every
web renderer, React included. React Aria's date field takes a `granularity` of a day or
finer, so it cannot show a month without its day. The generated vocabularies already draw
DatePicker's and TimeInput's segments from the engine's model, so the React member draws
them from it too, and every web renderer orders, steps and fills the segments with one
implementation.

How it differs from its nearest neighbours:

- **Not DatePicker at another granularity.** DatePicker's value is a day, a
  `CalendarDate`, and its popup is Calendar's day grid. A month would change both: the value
  type and what the popup chooses. A month with the day fixed to the first would hand the app
  and the form a day the reader never chose.
- **Not two NumberInputs.** A month and a year are one value, read as one field, in the
  locale's order and with its separator. Two number fields have two names, no order and no
  wrap at the twelfth month.
- **No month grid.** The surveyed screen that needs this field types a card's expiry from the
  card. No screen picks a month from a grid, so there is no popup, as on TimeInput.
- **No year alone and no range of months.** No surveyed screen enters either.

## Anatomy

```
[field — Input grammar]
  [segments: [mm] [sep] [yyyy]]  — locale-ordered
```

No trigger and no popup; the segments are the whole control.

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `value` / `defaultValue` / `onChange` | `string \| null` | — | the month as `YYYY-MM`, the form `<input type="month">` reports, with a four-digit year. `@internationalized/date` has no type for a year and a month, and a `CalendarDate` would carry a day. The field reports a value once both segments are filled, on each digit that changes it after that, and `null` once a filled segment is erased. Text that is not a month shows as empty |
| `min` / `max` | `string` | — | the first and last month the field accepts, as `YYYY-MM`, named as on `<input type="month">` and NumberInput. A month outside them marks the field invalid and stays in the field, as on DatePicker |
| `locale` | `string` | app default (provider) | orders the segments (`7/2026` in `en-US`, `2026/7` in `ja-JP`), picks the separator literal and names the month |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | conventions §2. No free-text placeholder: empty segments show `mm` and `yyyy` |
| `disabled` / `readOnly` / `invalid` | `boolean` | `false` | Input's. `readOnly` keeps segments focusable; arrows and digits do not edit |
| `name` / `id` | native passthrough | — | `name` serializes the month as `YYYY-MM`, as `<input type="month">` submits it |
| `messages` | `{ empty: string }` | English | the one word the field says that `Intl` cannot supply: what an unfilled segment says as its value. The English is `Empty` |

Attributes: field `data-size`, `data-invalid?`, `data-disabled?`, `data-readonly?`; segments
`data-segment="month|year"`, `data-placeholder?` (unfilled). No `data-state`, because there
is nothing to open.

## Recipes (exact tokens)

Every cell comes from `date-picker.md`, as `time-input.md` cites them: **field** (Input's
container recipe, content left-aligned as a segment row, gap `2px` around the separator),
**segment**, **segment placeholder**, **segment focused** (the hover-wash family, not
selection, because focusing a segment does not choose its value), **separator** (the
locale's literal, `/`, `.` or `-`, in `--pm-text-muted`). The seat row comes with the
citation: `--pm-shadow-control` on the field, `none` when disabled. **readOnly** is
TimeInput's: the field and its segments in `--pm-text-secondary`.

No cell is new.

**The phone floor**: conventions §13 does not apply, for TimeInput's reason. Entry is
through `role="spinbutton"` segments, not a real `<input>`, and the UA zoom that §13 prevents
happens only on real text-entry elements.

**On iOS**: the field is not typed. It shows the month in the locale's figures, and a tap
opens the platform's wheel pickers, one of months and one of years in the locale's order, as
iOS enters a date on its own wheels. The wheels offer only the months from `min` to `max`.

**On Android**: the segments are TimeInput's, each in a slot the 48dp touch target wide, so
the separator stands the slot's spare width from each segment rather than `2px`.

## FormField integration

As DatePicker's and TimeInput's: the label targets the field group (`role="group"` +
`aria-labelledby`), description and error use `aria-describedby` on the group, and
`invalid` from context colours the container as on Input. A month outside `min` and `max`
sets the field's `data-invalid` and `aria-invalid` on both segments. There is no
per-segment validity: the model clamps each segment to what it can hold, so a `13` in the
month is never entered.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| empty | no value | segments `data-placeholder` |
| filled | `defaultValue="2029-08"` | formatted per locale (a card's expiry) |
| sizes side by side | each size | Input's heights |
| out-of-range value | `defaultValue` before `min` | `data-invalid` |
| locale order — en-US | `locale="en-US"` + value | month, then year |
| locale order — ja-JP | `locale="ja-JP"` + value | year, then month |
| right-to-left locale — he-IL | `locale="he-IL"` + value | the document's `dir="rtl"` turns the row |
| readOnly | `readOnly` + value | `data-readonly`; segments hold their text |
| invalid | `invalid` | `data-invalid` |
| disabled | `disabled` + value | `data-disabled` |
| expiry form | in a FormField beside a card number Input | the field named by its label |

`requiredSelectors`: `:focus-visible`, `[data-placeholder]`, `[data-invalid]`,
`[data-disabled]`, `[data-readonly]`.

## Motion

As in `date-picker.md` for segments: segment focus changes `stateFeedback` colour only,
because nothing near a text caret may move, and value changes never animate the segments,
because digits are information. There is no popup, so there is no surface motion.

## Icons

None, for TimeInput's reason. DatePicker's `calendar` glyph is a button that opens the
calendar, and a glyph beside segments that open nothing would look like a control with
nothing behind it.

## A11y

`date-picker.md`'s segment pattern: a `role="group"` field, and each segment a
`role="spinbutton"` named by its part ("month", "year", from `Intl.DisplayNames`) after the
field's name. A filled month says its number and its name as its value (`7 – July`), as
React Aria says a month; an unfilled segment says `messages.empty`. ArrowUp and ArrowDown
step a segment and wrap at its ends: December steps up to January and leaves the year as it
is, as DatePicker's month does. Digits type in and move on once no further digit could fit
(`1` waits for a second digit, `3` moves to the year). ArrowLeft and ArrowRight move between
the segments, reversed in a right-to-left document. Backspace erases the last digit, and in
an empty segment moves back. DOM focus never leaves the segments, and with no popup there is
no focus hand-off. A read-only or disabled field moves focus and edits nothing.

```contract
role field group
role segment spinbutton when filled
key ArrowUp increments on segment when filled
key ArrowDown decrements on segment when filled
key ArrowRight moves-focus-next on segment when filled
key ArrowLeft moves-focus-previous on segment when filled
```

## Agent

An agent reads the month and whether the field is disabled, invalid or read-only, and sets the
month or clears it. A month is `YYYY-MM` text, the form the member's value has, and the empty
string while the field holds no month. The field reports an agent's month through `onChange`
as it reports a person's entry, controlled or not. Text in any other form is refused. A month
outside `min` and `max` is refused too, with the reason: a person who types one sees the field
marked invalid, and an agent is told why instead of leaving an invalid field. A read-only field
refuses both actions, as its segments edit nothing, and a disabled field lists no action.

```agent
state value text
state disabled boolean as field data-disabled
state invalid boolean as field data-invalid
state readonly boolean as field data-readonly
action set text sets value calls onChange
action clear sets value calls onChange
```
