# Textarea

A multi-line text field. It uses Input's recipe extended vertically and adds nothing
else.

Autosize (`autosize`) is opt-in, never the default. It is behaviour, not a styling
change: the layout moves under the caret and interacts with focus scrolling. A form that
wants a field to grow asks for it. `rows` stays the minimum; autosize only adds to it.

## API (delta from `input.md`)

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `rows` | `number` | `4` | native passthrough; the height, in lines |
| `resize` | `'vertical' \| 'none'` | `'vertical'` | never horizontal, because the layout owns the column width |
| `invalid` / `disabled` / `readOnly` / `value` / `onChange` / `placeholder` / `maxLength` / `name` / `id` | as Input | — | |
| `onBlur` / `onFocus` / `autoFocus` | as Input | — | *(the touched-validation pair and the focus passthrough, as on Input)* |
| `controlRef` | `React.Ref<HTMLTextAreaElement>` | — | as Input's, typed for the `<textarea>`. It is merged with the autosizer's own ref, so the caller gets the same node the autosizer measures *(the control seam)* |
| `onSelect` / `onCompositionStart` / `onCompositionEnd` | as Input | — | *(the control seam, as on Input)* |

No `size` classes, no icons, no `clearable` (multi-line values are edited, not
cleared), no trailing slot. Attributes: `data-invalid?`, `data-disabled?`,
`data-readonly?`.

## Recipe

Container tokens are Input's rows (rest/hover/focus/invalid/disabled/readOnly), with:
padding `--pm-space-3` `--pm-space-4`; text `text.sm` quartet;
`min-height: calc(var(--pm-control-height-md))`; line-height sets the vertical rhythm.
The seat row applies too: `--pm-shadow-control`, `none` when disabled. The resize handle
is the native one (structural). The phone floor: below `30rem` the `<textarea>` steps up
to the text-entry floor's size and line-height (conventions §13, metrics only).

## States

Entries: rest, with value, invalid, disabled, readOnly, `rows={8}`, `resize="none"`,
via-FormField with error. `requiredSelectors`: `:hover`, `:focus-visible`,
`[data-invalid]`, `[data-disabled]`, `::placeholder`.

## Motion / Icons / A11y

Border/background transitions per Input. None. FormField wiring identical to Input. The
control seam is the same as Input's: the member never moves the selection, never
remounts on a controlled change, and emits no change of its own around an IME
composition.

```contract
role field textbox
attr field aria-invalid=true when invalid
```

## Agent

An agent reads the field's value and whether it is disabled, invalid or read-only, fills it with
text and clears it, as it does an Input (`input.md`). Both actions write through the field as
typing does, so the member's own change path runs, an autosized field grows, and `onChange` is
called whether or not the caller controls the value. `clear` empties the field, as selecting its
text and deleting it does, because the member has no clear button. A read-only field takes no
typing, so it refuses both actions and the step fails. A disabled field lists no action.

```agent
state value text as field value
state disabled boolean as root data-disabled
state invalid boolean as field aria-invalid
state readonly boolean as root data-readonly
action fill text sets value calls onChange
action clear sets value calls onChange
```
