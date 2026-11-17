# OTPInput

A field for a one-time verification code, drawn as four or six cells. Use it for two-factor and
other code verification steps.

It is built by hand with no substrate, because `@radix-ui/react-one-time-password-field` is
pre-1.0 and fails the stability bar for substrates (`README-substrates.md` §3.5). Adopting that
package later would be easy, because it would have to render the same DOM as below.

What it is not: **not PasswordInput.** The code is not masked, because it is not a secret from
the person typing it. It expires in minutes and exists only to be copied from another screen. The
shoulder-surfing threat PasswordInput defends against does not apply, because an attacker would
also need the code within its lifetime. Masking would increase the transcription errors the field
exists to prevent. **Not Input `type="number"`**: a code is a string of digits, not a quantity.
There is no stepping and no min/max, and leading zeros are part of the code.

## The single-input illusion

The main design choice is between one input per cell, each with its own label, and one real
input drawn as cells. **This member uses one real `<input>`**, because that is the accessible
shape:

- The code is *one value with one name*. Six inputs mean six tab stops and six labels ("Digit
  1"… "Digit 6") read out during entry, with focus jumping at every keystroke. A screen reader
  user hears focus changes instead of a field. One input is one stop and one label, and the user
  hears each digit as it is typed, natively.
- Platform autofill targets one field. `autoComplete="one-time-code"` offers the SMS code above
  the keyboard on iOS, and Chromium's WebOTP API fills it. Both write **one value into one
  input**. With six inputs, autofill has six targets and no guarantee which one it picks.
- FormField's `<label for>` has one correct target, `name` serializes without a hidden extra
  input, and paste is a single event on the value instead of code that splits it across six
  inputs.

The cells are only visual. The input spans the whole group and is invisible (transparent text,
`caret-color: transparent`). It is never `display: none`, because it must stay focusable and
under every pointer. Each cell is drawn from one character of the value. The caret is always at
the end: the drawn caret cell is index `value.length`. **When the field is full and focused, the
last cell shows the ring**, because a focused control must show focus somewhere and the caret
cannot move further. Arrows, Home and End do nothing, because a code is entered, not edited in the
middle; corrections go back with Backspace. A click anywhere in the group focuses the input at
the end, so there are no dead spots.

## Anatomy

```
[root — one <label>-targetable group]
  [input <input inputMode="numeric" autoComplete="one-time-code">] — real, invisible, spans the group
  [cell]* — one character each, painted   (aria-hidden)
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `length` | `4 \| 6` | `6` | the two lengths real code systems use; the cells render from it |
| `value` / `defaultValue` / `onChange(value)` | `string` | — | digits only: every write path filters (`onChange` never reports a non-digit) and truncates at `length` |
| `onComplete` | `(code: string) => void` | — | fires once, after `onChange`, when the field becomes full. Use it to auto-submit; whether to verify without a Verify button is the app's decision |
| `invalid` / `disabled` | `boolean` | `false` | usually set by FormField (`invalid`), e.g. "That code didn't match" |
| `name`, `id` | native passthrough | — | the real input carries both directly, with no hidden extra input (a benefit of the single input) |

Fixed, not props: `autoComplete="one-time-code"` (the WebOTP and autofill behaviour above, which
is why this member is one input), `inputMode="numeric"` (the digit keyboard), and
`spellCheck`/`autoCapitalize`/`autoCorrect` off (PasswordInput's list, because a code must never
be "corrected"). **Paste fills the cells**: pasted text is filtered to digits, truncated to
`length`, and fills from the first cell, replacing the existing value. A code arrives whole, and
pasting at cell 4 would be a mistake, not an intent. Typing when the field is full changes
nothing; Backspace makes room.

Attributes: root `data-invalid?`, `data-disabled?`; cells `data-filled?`, and
the caret cell `data-caret` (present only while the field holds focus; at full
it sits on the last cell; see above).

## Recipe (exact tokens)

One size, no `size` prop. The code is the only field on its page (the verify screen), never one
row among many, so the sm/md/lg scale adds nothing. A size prop can be added if the registry
shows a need for it. Cells use the size table's `lg` row, the most comfortable touch size,
because phone users retype this field from memory.

| Part | Tokens |
| --- | --- |
| root | row · gap `--pm-space-3` (8; wide enough that the cells look separate, not like a segmented bar) |
| cell | square, `--pm-control-height-lg` both dimensions · Input's rest cell unchanged (`input.md`): bg `--pm-bg-surface` · border `1px solid --pm-border-default` · seat `var(--pm-shadow-control)` · radius `--pm-radius-md` |
| digit | `text.md` full quartet (the `lg` row's own step, §2) · `--pm-text-primary` · centered · `font-variant-numeric: var(--pm-font-numeric)` (the theme's figure style) |
| caret cell | the shared focus ring's tokens (conventions §4) restated on the cell: `outline: var(--pm-focus-width) solid var(--pm-border-focus)`, `outline-offset: var(--pm-focus-offset)`. This is the only lawful proxy ring: the focused element is deliberately invisible, so the cell shows its focus. The border also changes to `--pm-border-focus-solid`, as on every bordered focused part (conventions §4), except under `invalid`, where the danger border shows state and takes precedence |
| hover | none, deliberately. Every cell is the same single target, and a hover effect on one cell would suggest per-cell focus, which this member does not have. `cursor: text` over the group shows that it takes text |
| invalid | border `--pm-danger-border` on every cell (Input's row; the whole code is wrong, not one digit); ring unchanged on the caret cell |
| disabled | Input's disabled cell, unchanged, on each cell: bg `--pm-bg-subtle` · border `--pm-border-subtle` · shadow none · text `--pm-text-disabled` |
| empty cell | empty, with no placeholder dot, because a dot in an empty cell looks like masking, which this member does not do |

**The phone floor:** below `30rem` the real `<input>` takes the text-entry floor's size and
line-height (conventions §13; only metrics change). It is invisible but focused, and the browser reads its
computed size. The drawn digits stay at `text.md` and do not change.

## FormField integration

Same as Input: the field label targets the real input ("Verification code"), description and
error go through `aria-describedby`, and `invalid` comes from context. Any entry hint ("We sent a
code to …") goes in the app's description; the member has no built-in text.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| empty | default | six cells, none `data-filled` |
| four | `length={4}` | four cells |
| partial | `defaultValue="42"` | two cells `data-filled`, four empty |
| full | `defaultValue="428051"` | all `data-filled` |
| invalid | `invalid defaultValue="428051"` | `data-invalid`, danger borders |
| disabled | `disabled` | `data-disabled` |
| via FormField | label "Verification code", error "That code didn't match" | `<label for>` reaches the input; described-by wiring intact |

`requiredSelectors`: `:focus-within` (the root's focus state; the ring is on the caret cell, not
on a pseudo-class of the invisible input), `[data-caret]` (the active cell's caret state. It comes
from focus, so the selector carries it per conventions §10, and the browser test uses a real
focus and keystroke),
`[data-filled]`, `[data-invalid]`, `[data-disabled]`.

## Motion

A digit appears with `fade` at `--pm-motion-duration-control`, like Input's clear button (the
smallest entrance in the system). The caret moves instantly, because it follows the user's own
keystroke (Slider's law for direct input). Paste fills all cells in the same frame, because six
staggered entrances for one action would be decoration. There is no shake on `invalid`; the
border change from §7's shared state-feedback list and FormField's error communicate it. At
`none` / reduced motion: instant throughout.

## Icons

None. The field is digits.

## A11y

One real input, one label, and native announcement of every typed digit. The single-input illusion
section above is the main accessibility decision. The drawn cells (and their caret) are
`aria-hidden`. The input's own value is the code, so no live region is needed to report what the
user typed. `aria-invalid` mirrors `invalid`; FormField provides the error text. The group is one
tab stop. Backspace edits, and Escape does nothing, because there is no draft state to discard.
WebOTP note: on iOS, `autoComplete="one-time-code"` is all that is needed. Chromium also needs
the app to call `navigator.credentials.get({ otp })`. That is app wiring, outside the vocabulary,
and the member's single input lets the code fill the field cleanly when the app does it.

```contract
role field textbox
key Escape nothing on field when partial
attr field aria-invalid=true when invalid
```

## Agent

An agent reads whether the field is disabled or invalid. The code is secret to an agent, though it
is shown to the person: its value is `{ secret: true }` in every output, and no action writes or
clears it. A person types the code they were sent, because the check exists to show that the
person holds the device or the inbox it was sent to, and an agent that entered it would answer
the check for them.

```agent
state value text secret
state disabled boolean as root data-disabled
state invalid boolean as field aria-invalid
```
