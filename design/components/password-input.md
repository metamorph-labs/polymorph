# PasswordInput

An Input preset for passwords, with masked entry and a reveal toggle, so every password field in
the product masks, reveals and autofills the same way.

It follows SearchInput's pattern: it renders an Input inside and fixes these decisions once.
AuthPage uses it.

PasswordInput is *not* a field assembly. Label, description and error come from FormField, as for
Input; this member is only the control row. It also has no built-in text. The toggle's name is a
required prop, because "Show password" is app text in the app's language (the same law as
Button's `label`).

## Anatomy

```
[Input root]
  [<input type="password" ⇄ "text">]  [toggle: embedded button — Icon "visible" ⇄ "hidden"]
```

The toggle uses Input's **embedded-adornment** anatomy: the clear button's recipe, unchanged
(`input.md`: any control inside another control's frame copies the clear button's recipe).

## API (delta from `input.md` — it renders an Input inside)

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `toggleLabel` | `string` | required | the toggle's accessible name ("Show password"); the member has no built-in text |
| `value` / `defaultValue` / `onChange` / `placeholder` / `size` / `disabled` / `readOnly` / `invalid` | as Input | — | `type`, `icon`, `clearable` and `trailing` are fixed and not exposed. The toggle takes the trailing corner, and a clear button beside it would put two different actions one Tab stop apart |
| `autoComplete` | `'current-password' \| 'new-password'` | `'current-password'` | has a default, unlike Input's raw passthrough, because an unidentified password field breaks password managers and fails WCAG 1.3.5. Sign-up flows pass `'new-password'`; other values belong to other members (one-time codes use OTPInput) |
| `name`, `id` | native passthrough | — | |

Attributes: Input's (`data-size`, `data-invalid?`, `data-disabled?`,
`data-readonly?`) plus `data-state="hidden|visible"` on the root, the two values conventions §1
lists for it.

Visibility is the member's own state and is uncontrolled by design. A controlled `visible` prop
would let apps put the reveal control somewhere else, and the toggle's placement is exactly what
this member decides.

## Behavior (the rules that make it one member)

- **The flip never remounts.** Reveal changes the same node's `type` attribute in place, so the
  value, caret, selection and the password manager's `autocomplete` wiring are all kept. This
  member exists to rule out the bug where a remounted input drops the password on reveal.
- **Revealed text is still a secret**: while `type="text"`, the input carries
  `spellCheck={false}`, `autoCapitalize="off"`, `autoCorrect="off"`, because a revealed password
  must never be sent to a spellcheck service or "corrected".
- The toggle is always rendered, including when the field is empty. `clear` hides when empty
  because clearing nothing does nothing. Revealing an empty field still makes sense, and a toggle
  that appeared at the first keystroke would make the frame jump.
- A disabled field disables the toggle too (the frame keeps its shape). `readOnly` keeps the
  toggle active, because revealing is not editing, and a generated password shown read-only is
  exactly when reveal matters.

## Recipe (exact tokens)

Input's recipe, unchanged, in every state (`input.md`), **including width**. The Input inside
grows to fill the root, so a PasswordInput is exactly as wide as the space it is given, and no
wider than an Input where nothing stretches it. This needs one explicit declaration; rendering an
Input does not provide it. A column-labelled FormField stretches only this member's *root*, and
the Input inside is a flex item of that root. Without the declaration, the password field on
AuthPage renders narrower than the email Input above it. SearchInput has the same declaration for
the same reason.

The toggle: the clear button's embedded-adornment rows, unchanged. Rest icon `--pm-text-muted`;
hover icon `--pm-text-primary` on a `--pm-bg-subtle` fill at `--pm-radius-sm`; the shared focus
ring (conventions §4), which may overflow the frame; never `--pm-danger-*` in an invalid field
(it is an action, not a status). Hit target: square, the input's height, per the minimum target
rule. The phone floor comes from the inner Input's §13 rule (`input.md`; conventions §13).

## States

| Entry | Render | Expect |
| --- | --- | --- |
| rest | `toggleLabel="Show password"` | `data-state="hidden"`, input `type="password"`, toggle `aria-pressed="false"` |
| with value | `defaultValue="hunter2"` | masked rendering; value never in an accessible announcement |
| sm | `size="sm"` | `data-size="sm"` |
| invalid | `invalid` | `data-invalid`, inner `aria-invalid` |
| disabled | `disabled` | `data-disabled`; toggle disabled |
| readOnly | `readOnly defaultValue` | toggle enabled |
| via FormField | label "Password", `labelEnd` Link "Forgot?" per `form-field.md` | `<label for>` reaches the input; described-by wiring intact; the Input inside fills the field, at the width a sibling Input has |

`requiredSelectors`: `[data-state="hidden"]`, `[data-state="visible"]`, plus
Input's set by composition (`:hover`, `:focus-visible`, `[data-invalid]`,
`[data-disabled]`, `::placeholder`).

The revealed state has no fixture row. Like CopyButton's `copied`, it exists only after a user
action, so `[data-state="visible"]` is in `requiredSelectors`, and the member's unit test checks
that the flip keeps the value.

## Motion

Glyph crossfade: `fade` at `--pm-motion-duration-control` (Input's clear-button binding). The
masking flip itself is instant, because text has nothing to transition.
At `none`: instant throughout.

## Icons

`visible` while masked (the action is to show), `hidden` while revealed (the action is to mask).
Decorative: `toggleLabel` names the control and `aria-pressed` carries the state.

## A11y

The toggle is a real button with `aria-pressed` (pressed = revealed) and a
**constant** accessible name from `toggleLabel`. A name that changes to "Hide password" while
`aria-pressed="true"` states the same thing twice and makes both harder to follow. The value is
never announced: no live region contains it, and toggling announces only the pressed state.
Label, description, error and required all come from FormField, through the standard `field`
wiring.

```contract
role toggle button
name toggle from toggleLabel
attr toggle aria-pressed=false when rest
key Enter activates on toggle when rest
```

## Agent

An agent reads whether the field is disabled, invalid or read-only, and whether the password is
shown. It never reads the password: the value is `{ secret: true }` in every output, in a query
and in every change event. No action writes the value, because a person types a secret. An agent
gets no action on the toggle either, because revealing puts the secret on the screen, and only
the person at it decides that. The Input this member draws is its field, not a member an agent
reads or runs: the bridge lists no member inside one that holds a secret.

```agent
state value text secret
state revealed boolean as toggle aria-pressed
state disabled boolean as root data-disabled
state invalid boolean as root data-invalid
state readonly boolean as root data-readonly
```
