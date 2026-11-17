# Rating

A Rating is a score out of a small whole number, drawn as a row of marks: stars, five by
default. A reader sets it ("Rate this answer") or reads it ("Average rating: 4.3 out of 5").
It is one member with two forms. Set, it is a radio group of one radio per mark. Shown
(`readOnly`), it is one image named by a sentence, because an average such as 4.3 is no
radio's value.

It is not RadioGroup. A radio group's options are labelled rows, and a choice in one is never
cleared. A rating's options are the numbers 1 to `max`, drawn as marks that fill up to the
choice, and a press on the chosen mark clears it. A question whose answers are words ("Very
satisfied") is a RadioGroup, and a 1-to-5 question whose numbers should be seen is a
SegmentedControl. It is not Meter, which measures a quantity against a limit and changes
colour past a threshold. It is not Slider, whose value is continuous. Thumbs up and down under
an assistant's reply are two Buttons with `pressed`, because they are two independent
opinions and not a score out of two.

There is no substrate. Radix's radio group neither clears nor stops at its ends, and both are
this member's rules. The value, the fills, the names and the keys come from the engine
(`ratingModel`, `ratingPress`, `roveRating`), so every framework's Rating behaves alike.

## Anatomy

```
[root — role="radiogroup", or role="img" when readOnly]
  [mark]* — a <button role="radio">, or a <span> when readOnly
    [glyph — the outline]
      [fill — the filled copy, cut to the share the value covers]
  [hidden input?] — when `name` is given
```

## API

```ts
interface RatingMessages {
  mark: (value: number, numeral: string) => string // a mark's name; default "1 star", "3 stars"
  shown: (label: string, value: string, max: string) => string // the shown sentence; default "Rating: 4.3 out of 5"
}

interface RatingProps {
  label: string // the name: the group's ("Rate this answer"), or the start of the shown sentence ("Average rating")
  value?: number | null // a whole number from 1 to max, or null for none; when readOnly, any value from 0 to max
  defaultValue?: number | null // the value an uncontrolled rating starts with
  onChange?: (value: number | null) => void // the value a press or a key chose, or null when a press cleared it
  max?: number // the number of marks: a whole number from 2 to 10; default 5
  readOnly?: boolean // shows the rating as an image a reader reads and cannot change
  disabled?: boolean // every mark is disabled, and the form posts nothing
  invalid?: boolean // set by FormField when its error shows
  size?: 'sm' | 'md' | 'lg' // the marks' icon size; default md
  name?: string // posts the value as a whole number, or an empty string when the rating holds none
  locale?: string // writes the numerals the messages receive; defaults to the page's own
  messages?: RatingMessages // the localization seam: both keys, or neither
  id?: string // set by FormField
}
```

Attributes: root `data-size`, `data-readonly?` when shown, `data-disabled?` and
`data-invalid?` on a control. Each mark `data-fill="full|part|none"`. A part-filled mark's
filled copy carries its share as an inline `inline-size`, because the share is data. A
control's chosen mark is `aria-checked="true"`.

**The value.** A control holds a whole number from 1 to `max`, or nothing (`null`). A value it
is given is rounded to the nearest whole number and held inside `max`. Zero, a negative value
and `null` hold nothing. A shown rating holds any value from 0 to `max`, rounded to one decimal
place, and draws and speaks that rounding, so the picture and the sentence agree. `max` is
rounded and held from 2 to 10: one mark is a toggle, which is a pressed Button, and past ten a
reader counts marks instead of reading them, which is a Slider's or a NumberInput's work.

**Whole numbers only.** The control takes no halves. Half a mark is narrower than the minimum
hit target at every size, and an arrow that stepped by halves would double the presses to the
top. A shown rating draws any tenth, because it is not pressed.

**A press.** A press (a click, a tap, or Space on the focused mark) on an unchosen mark chooses
it. A press on the chosen mark clears the rating, and `onChange` reports `null`. A required
rating (`aria-required`, which FormField sets from `required`) keeps its mark, because a press
that emptied it would leave the form unanswered. `onChange` runs once for each change and
never for a press or a key that leaves the value as it was.

**Naming.** `label` names a control's group, unless FormField names it with its label. A shown
rating is named by one sentence, `messages.shown(label, value, max)`, with the numbers already
written in the locale's digits (`Intl.NumberFormat` with `locale`), the value to one decimal
place. Each radio is named `messages.mark(value, numeral)`. The member writes no other words.

**The form.** With `name`, a hidden input posts the value as a whole number, or an empty string
when the rating holds none. A disabled control posts nothing. A shown rating posts its value.

## Recipes (exact tokens)

| Part | Tokens |
| --- | --- |
| root | inline row · items centred · no wrap · readOnly: gap `--pm-space-1` |
| mark (control) | `--pm-hit-target` square at every size and density · no gap: neighbouring hit areas touch and never overlap · radius `--pm-radius-sm` · transparent, no border · cursor pointer |
| mark (readOnly) | the glyph's own size |
| glyph | `Icon` role `rating`, at `size` (`--pm-icon-size-sm\|md\|lg`) · colour `--pm-text-muted` |
| fill | the same `Icon`, absolutely over the glyph from the inline start · width 100%, or the part share · overflow hidden · colour `--pm-accent-text` · the glyph's `fill: currentcolor` · hidden when `data-fill="none"` |
| invalid | glyph `--pm-danger-text` |
| disabled | glyph and fill `--pm-text-disabled` · cursor not-allowed |
| hover reach | under `(hover: hover)`, on a control that is not disabled: the hovered mark's glyph and every glyph before it `--pm-accent-text` |
| focus | ring on the mark per conventions §4 |

Filled and empty differ in shape, a solid star against an outline, and not in colour alone.
Both colours are text roles, which the contrast law holds at 3:1 or more on every surface in
every pairing, so the outline that says "out of five" meets the non-text contrast floor.
Disabled marks keep the shapes in `--pm-text-disabled`.

The marks of a control touch, so ten marks take ten hit targets, 240px at the web floor, which
fits a phone's width. The star inside sits centred, so `lg` stars sit closer together than `sm`
ones. A shown rating has no hit targets, so its marks sit `--pm-space-1` apart and fit a table
cell.

In a right-to-left document the row starts at the right, and a part-filled mark fills from the
right, because the recipe is written in logical properties.

**On iOS and Android** each mark of a control is the platform's hit target, 44 points or 48dp,
so ten marks are wider than a phone. A row wider than its container wraps onto a second line,
the marks still in reading order and still touching. Android's outline glyph is Material's
`star_border`, because its outlined `star` is solid.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| nothing chosen yet | `label="Rate this answer"` | `role="radiogroup"`, `data-size="md"` |
| three of five | `defaultValue={3}` | — |
| each value — one to five | five ratings, 1 to 5, in a Stack | — |
| read-only — an average of 4.3 | `value={4.3} readOnly` | `role="img"`, `data-readonly` |
| disabled | `defaultValue={2} disabled` | `data-disabled` |
| sizes — sm, md and lg | three ratings, one per size | — |
| ten marks — the most a rating takes | `max={10} defaultValue={7}` | — |
| in a FormField, required and in error | FormField `required` with an error, `name="rating"` | — |
| in a Table cell — read-only and small | two read-only `sm` ratings in a Table's rows | — |
| messages — the words in German | German messages, `locale="de"` | — |

A right-to-left page is not an entry, because the direction is the document's and no prop sets
it. The direction law renders every entry in a right-to-left document, and the rating law
checks the row, the part fill and the arrows there.

`requiredSelectors`: `:hover`, `:focus-visible`, `[data-disabled]`, `[data-invalid]`,
`[data-readonly]`, `[data-fill="none"]`.

## Motion

The glyph's colour changes (the hover reach, disabled) take the state-feedback transition,
`--pm-motion-duration-control` × `--pm-motion-easing-standard`. A fill appears and goes at
once, as a choice changes, because several marks change together and a staggered fill would
draw attention to the value.

## Icons

`rating`, at `size`, twice in each mark: the outline and the filled copy. Both are decorative,
because the radio's name and the image's sentence carry the meaning.

## A11y

A control is `role="radiogroup"` named by `label`, or by FormField's label through
`aria-labelledby`, with `aria-required` and `aria-invalid` from FormField. Each mark is a
`<button role="radio">` named by `messages.mark` ("3 stars"), with `aria-checked`. Only the
chosen mark is checked, though the marks before it are drawn filled. One mark is a tab stop:
the chosen one, or the first when nothing is chosen. The arrows move focus to the next or the
previous mark and choose it, as in a radio group. The arrows that point along the row follow
the document's direction, so in a right-to-left document the arrow that points left moves to
the next mark. Down is the next mark and Up the previous one. Home and End move to and choose
the first and the last mark. The arrows stop at either end and do not wrap, because one press
past the top would set the lowest score. Space presses the focused mark, and Enter does
nothing, as WAI-ARIA's radio group pattern has it. A keyboard reader clears a rating with Space
on the chosen mark, the same press a pointer makes. A disabled control's marks are disabled
buttons, which take no focus and report nothing.

A shown rating is `role="img"` named by `messages.shown`, one sentence, so a screen reader
reads "Average rating: 4.3 out of 5, image" and not five unlabelled glyphs. An image's
children are presentational, so the marks are not read. It takes no focus and reports
nothing.

The hover reach is drawn by CSS alone. It changes no attribute, so what a screen reader reads
and the value are what they were. It has no touch or keyboard counterpart, because an arrow and
a tap choose at once and show the result in the fill.

```contract
role root radiogroup when nothing chosen yet
name root from label when nothing chosen yet
role mark radio when nothing chosen yet
key ArrowRight moves-focus-next on mark when nothing chosen yet
key ArrowRight selects on mark when nothing chosen yet
key ArrowLeft moves-focus-previous on mark when nothing chosen yet
key ArrowDown moves-focus-next on mark when nothing chosen yet
key ArrowUp moves-focus-previous on mark when nothing chosen yet
key Home moves-focus-first on mark when nothing chosen yet
key End moves-focus-last on mark when nothing chosen yet
key Space selects on mark when nothing chosen yet
key Enter nothing on mark when nothing chosen yet
click activates on mark when nothing chosen yet
role root img when read-only
attr root data-readonly when read-only
attr root data-disabled when disabled
attr root aria-invalid="true" when in a FormField
attr root aria-required="true" when in a FormField
```

## Agent

An agent reads the rating, the number of marks and whether the rating is read-only, disabled or
invalid, and it sets a rating and clears it. The value is a whole number from 1 to `max`, or
`null` while the rating holds none; a shown rating reads the value it draws, to one decimal
place. `set` chooses a mark as a press on it does, and takes only a whole number from 1 to
`max`, because those are the marks a person can press. `clear` empties the rating, as a press on
the chosen mark does. A required rating refuses `clear`, because a press there keeps its mark. A
shown rating takes no press, so it refuses both. Each refusal fails the step. Both actions call
`onChange` only when the value changes, whether or not the caller controls it. A disabled rating
lists no action.

```agent
state value number
state max number
state readonly boolean as root data-readonly
state disabled boolean as root data-disabled
state invalid boolean as root aria-invalid
action set number sets value calls onChange
action clear sets value calls onChange
```
