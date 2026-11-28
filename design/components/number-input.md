# NumberInput

A field that holds a real `number`, formats it with the chart tier's formats, and steps it. Use
it when the app holds the value as a number, because Input's `onChange` returns a string for
every `type`, including `number` (`input.md`).

Behaviour comes from **React Aria** `useNumberField` / `useNumberFieldState`, with locale-aware
parsing on the Intl rail. The member writes every element and attribute itself.

How it differs from its neighbours:

- **Not Input `type="number"`.** That is still lawful for passing a raw string, such as posting
  a form and letting the platform clamp. Once the app holds the value as a number, formats it or
  steps it, use this member.
- **Not Slider.** Slider is for a value whose rough position matters more than its exact digits.
  This member is for the exact digits.
- **Not Stepper.** `stepper.md` shows progress through a sequence of steps. The buttons below are
  also called steppers, but the members are unrelated.

## Anatomy

```
[root container — Input grammar]
  [prefix?]  [<input inputMode="numeric|decimal">]  [suffix?]  [step down] [step up]
```

## API

| Prop                                                             | Type                              | Default | Notes                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------- | --------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `value` / `defaultValue` / `onChange`                            | `number \| null`                  | —       | `null` is the empty field. `onChange(value: number \| null)` reports **committed numbers, never drafts**: typed text parses and clamps on commit (blur, Enter), the steppers commit as they fire, and `NaN` is never reported; unparseable text restores the last committed value |
| `min` / `max` / `step`                                           | `number`                          | —       | typed values clamp at commit; the steppers snap to the step and stop at the limits, and a button that cannot move is disabled (the substrate's `canIncrement`/`canDecrement`) |
| `format`                                                         | `NumberFormat`                    | —       | the chart tier's closed descriptor (`ValueFormat`, `docs/charts.md`), narrowed in the fence below to what an editable field can re-parse without loss. It formats the *displayed* text; the committed value is always the raw number. There is no `Intl.NumberFormatOptions` bag: open formatter options are rejected across the system, and `ValueFormat` is the closed alternative |
| `onBlur` / `onFocus`                                             | `(event) => void`                 | —       | for touched validation (`input.md`'s row). `onBlur` fires after the commit, so touched validation reads the committed number, not the abandoned draft; Combobox uses the same order |
| `prefix` / `suffix`                                              | `string`                          | —       | `input.md`'s affix rules, unchanged: strings only, muted, `aria-hidden` decoration; a unit that matters belongs in FormField's text. Use the format first. Affixes are for what Intl cannot express ("/mo", "per seat"), and an affix that repeats what `style: 'currency'` already shows is redundant |
| `size` / `placeholder` / `disabled` / `readOnly` / `invalid` / `id` | Input's                        | —       | same as Input |
| `name`                                                           | `string`                          | —       | posts the **plain number**, never the formatted text. The substrate puts it on a hidden input (react-aria's own mechanism), so `"$1,234.56"` cannot reach a server that expected `1234.56` |
| `messages`                                                       | `NumberInputMessages`             | —       | *(WCAG 3.1.2)* the steppers' names, localized by passing them: `increment` and `decrement`. Partial: an omitted name keeps its default, React Aria's "Increase" and "Decrease" with the field's label on React, which React Aria says in the page's locale, and "increment value" and "decrease value" in the generated members (Icons, below) |

```ts
/**
 * The chart tier's ValueFormat (`docs/charts.md`), minus what an editable field
 * cannot honestly hold. Inapplicable members are typed out rather than
 * dev-warned — inexpressible beats politely declined:
 *
 * - 'date': a number field has no date to format.
 * - 'compact': measured in the installed parser: "1.2K" parses to 1.2 —
 *   the multiplier is dropped, so a compact field destroys the value it just
 *   showed. A display-only surface may compact; an editable one may not.
 *
 * `granularity` ('date'-only) leaves with 'date'.
 */
interface NumberFormat extends Omit<ValueFormat, 'style' | 'granularity'> {
  style?: Exclude<ValueFormat['style'], 'date' | 'compact'> // 'decimal' | 'percent' | 'currency'
}
```

Percent uses the chart tier's Intl semantics unchanged: the value is the ratio (`0.9`, shown as
"90%"), and the formatter multiplies by 100. The substrate steps percent fields by `0.01` unless
`step` is set. `currency` is an ISO 4217 code and is required when `style` is `'currency'` (the
chart tier's own requirement, `docs/charts.md`).

Attributes: `data-size`, `data-invalid?`, `data-disabled?`, `data-readonly?`.
No `data-state`, because nothing opens and nothing drags.

**Scrub and wheel are not supported.** Wheel-to-increment takes over the page's scroll whenever
the pointer pauses over a field, and a value that changes because the user scrolled past it is an
edit nobody made. The substrate has its own wheel handling, active only while focused. The
vocabulary turns it off with the `isWheelDisabled` prop. Scrubbing (drag to change) is a
pointer-only interaction with no keyboard equivalent and no reduced-motion behaviour, so it is not
supported either.

## Recipes (exact tokens)

Container: Input's recipe unchanged in every state (`input.md`), with affixes per its affix row.
The seat row comes with it: `--pm-shadow-control` on the field, `none` when disabled. The steppers
are new parts:

| Part                | Tokens                                                                                                                                                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| stepper pair        | trailing, inside the frame: step **down** then step **up** in reading order, so they follow the number line in the reading direction (RTL flips both). Each button is `--pm-control-height-sm` wide × the field's own height, which meets §2's floor exactly in the narrow dimension. The clear button's square-of-height rule is for a *single* embedded action. Two square buttons would take a third of an `lg` field, so the pair uses the floor width instead |
| stepper rest        | the clear button's embedded-adornment recipe unchanged (`input.md`): icon `--pm-text-muted` · bg transparent                                                                                                                                     |
| stepper hover       | icon `--pm-text-primary` · bg `--pm-bg-subtle` · radius `--pm-radius-sm` (the radius of its own hover fill; the outer control keeps `md`) |
| stepper active      | hover colours + press feedback                                                                                                                                                                                                                                 |
| stepper at its rail | icon `--pm-text-disabled` · no hover fill, no press (the substrate disables the button that cannot move; the other keeps working) |
| glyphs              | `up` / `down` at the size's icon token (§2)                                                                                                                                                                                                                    |
| disabled field      | Input's disabled row; steppers render disabled with it, so the frame keeps its shape (PasswordInput's law) |
| readOnly field      | Input's readOnly row; steppers **not rendered**, by the clear button's rule: a value that cannot be edited cannot be stepped |

Held keys and held buttons repeat (the substrate's spin). The repeat is behaviour, not motion:
only the digits change, and digits are information (`date-picker.md`'s law). The phone floor:
below `30rem` the inner `<input>` takes the text-entry floor's size and line-height. This is the
focus-zoom floor from conventions §13, and only metrics change. The steppers are buttons, so
their size does not change.

**On Android**: §2's floor is the 48dp touch target, and a stepper's touch area must be its own,
so each stepper takes a slot 48dp wide. The buttons keep their drawn width and touch where the
slots meet, and each slot's spare width lies on its outer side, so the pair takes 96dp of the
field's width.

## FormField integration

Same as Input: the label targets the input, description and error go through
`aria-describedby`, `invalid` comes from context, and `name` serializes as above.

## States

| Entry        | Render                                                                     | Expect                                             |
| ------------ | -------------------------------------------------------------------------- | -------------------------------------------------- |
| rest md      | `placeholder="0"` + FormField label "Agents on this plan"                  | `data-size="md"`, steppers present                 |
| with value   | `defaultValue={5}` `min={1}` `step={1}`                                    | formatted "5"                                      |
| at the rail  | `defaultValue={1}` `min={1}`                                               | step-down disabled, step-up live                   |
| currency     | `defaultValue={29}` `format={{ style: 'currency', currency: 'USD' }}` — the per-seat price | "$29.00" per locale                 |
| percent      | `defaultValue={0.9}` `format={{ style: 'percent' }}` — the CSAT target     | "90%"; steps by 0.01                               |
| affixed      | `suffix="hrs"` `defaultValue={4}` — the SLA first-response target          | suffix present, muted                              |
| sm           | `size="sm"`                                                                | `data-size="sm"`                                   |
| invalid      | `invalid`                                                                  | `data-invalid`, inner input `aria-invalid`         |
| disabled     | `disabled`                                                                 | `data-disabled`; steppers disabled                 |
| readOnly     | `readOnly defaultValue`                                                    | `data-readonly`; steppers absent                   |

`requiredSelectors`: `:hover`, `:focus-visible`, `[data-invalid]`,
`[data-disabled]`, `[data-readonly]`, `::placeholder`.

## Motion

Input's border and background transitions, unchanged. The steppers use the clear button's
bindings (`stateFeedback` fill + press). Value text never animates. Formatting on commit (typing
`1234.5`, then blurring to `"$1,234.50"`) is instant, because a number that visibly redraws
itself looks like the field is editing the user's input. At `none`: instant throughout.

## Icons

`up` / `down`, decorative, on real buttons named by `messages.increment` and `messages.decrement`,
with `aria-controls` pointing at the input. Without them, React's are named by React Aria
("Increase" / "Decrease", localized, linked to the field's own label), and the members generated
from the description by their machine's English words, "increment value" and "decrease value",
which the description passes to the machine as its translations.

## A11y

The input is deliberately **not** a spinbutton. The substrate makes it a text field with
`inputMode` `numeric`/`decimal` (for the right software keyboard), because a focusable spinbutton
misbehaves under VoiceOver. This is react-aria's finding, adopted with the substrate. On React the
field carries React Aria's `aria-roledescription` "number field", in the page's locale. The
generated members give it no role description, because their machine's is the fixed English
"numberfield", which VoiceOver would say in place of the field's role, so they are heard as the
text field they are. Arrow Up/Down step from the keyboard, and Home/End go to the
min and max. `autoCorrect`/`spellCheck` are off, because a number is not prose. The stepper
buttons are real and reachable by pointer and assistive tech, but **excluded from the Tab
order**. Arrows on the input already step, so two extra Tab stops per field would cost keyboard
users time and add nothing. Announcements come from the input's own value changing; the buttons
add none of their own.

```contract
role field textbox
key ArrowUp increments on field when with value
key ArrowDown decrements on field when with value
key Home decrements on field when with value
attr stepper tabindex=-1 when with value
```

## Agent

An agent reads the committed number and whether the field is disabled, invalid or read-only, sets
a number and clears the field. The value is `null` while the field is empty. `set` commits a
number as a typed commit does: it is held within `min` and `max`, and `onChange` reports it
whether or not the caller controls the value. `clear` empties the field, which commits `null`.
Each reports only a number that differs from the committed one, as a person's commit does. The
field's text is the number in its `format`, so the value is read from the member and not from
that text. A read-only field takes no typing, so it refuses both actions and the step fails. A
disabled field lists no action.

```agent
state value number
state disabled boolean as root data-disabled
state invalid boolean as field aria-invalid
state readonly boolean as root data-readonly
action set number sets value calls onChange
action clear sets value calls onChange
```
