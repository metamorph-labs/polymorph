# Input

A single-line text field. Its styling is the base that Textarea, NumberInput, PasswordInput
and SearchInput reuse.

## Anatomy

```
[root container]
  [leading icon?]  [prefix?]  [<input>]  [suffix?]  [clear button?]  [trailing slot?]
```

The root is a styled container. The native `<input>` inside it is borderless and transparent
and fills it. Visual states are set on the root (`data-*` mirrored from the input's state) so
icons and slots take the same colours.

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | conventions §2 |
| `icon` | `IconRole` | — | leading, decorative |
| `clearable` | `boolean` | `false` | shows `clear` button when non-empty; fires `onChange('')` |
| `clearLabel` | `string` | `'Clear'` | the clear button's accessible name *(the localization seam)*; localized applications pass their catalog value |
| `trailing` | `ReactNode` | — | slot for a vocabulary element (e.g. Badge, ghost icon Button) |
| `invalid` | `boolean` | `false` | usually set by FormField |
| `disabled` / `readOnly` | `boolean` | `false` | |
| `value` / `defaultValue` / `onChange` | controlled/uncontrolled | — | `onChange(value: string, event)`; the value is a string for every `type`, including `number`, as in the native API. For a parsed number, use NumberInput |
| `placeholder`, `type` (`text\|email\|password\|url\|tel\|number`), `name`, `id`, `autoComplete`, `maxLength` | native passthrough | — | native numeric entry is an Input `type`, not a separate member |
| `min` / `max` / `step` | `number` | — | `type="number"` only; native passthrough, so the browser handles clamping and stepping |
| `onBlur` / `onFocus` | `(event) => void` | — | native passthrough, for touched validation: an application can mark a field dirty on blur without reading the DOM |
| `prefix` / `suffix` | `string` | — | static text inside the frame, such as a currency mark, a unit or a domain. Strings only, because a node belongs in `trailing` |
| `autoFocus` | `boolean` | `false` | native passthrough. Use it only where the user has just opened a surface (a dialog's first field), never to take focus on page load |
| `exact` | `boolean` | `false` | the text is typed exactly: nothing corrects it, capitalises it or checks its spelling (`autocorrect="off"`, `autocapitalize="off"` and `spellcheck="false"` on the inner input; on iOS and Android the keyboard neither corrects nor capitalises it). For text that must match letter for letter, such as a typed confirmation's phrase (`confirm-dialog.md`), because a correction can change it while it is typed |
| `controlRef` | `React.Ref<HTMLInputElement>` | — | the native `<input>`, merged with the member's own ref. For bindings such as a collaboration layer or a form library that must read or restore the caret or selection without a `querySelector` into the frame. Accepts callback and object refs; both owners get the same node, and `null` on unmount. It is not called `ref` because a `ref` would point at the frame. See the control seam (A11y, below) |
| `onSelect` / `onCompositionStart` / `onCompositionEnd` | native passthrough | — | `onSelect` fires when the caret or range moves, by keyboard or pointer; read `selectionStart` / `selectionEnd` / `selectionDirection` from `event.currentTarget`. The composition pair is the IME events. All three arrive as the platform fires them, never suppressed and never repeated as a second change. The member never moves the selection itself. `onSelect` never fires for `email` or `number`, because the platform gives those types no selection API (`selectionStart` is `null`) and React does not synthesize one. See the control seam (A11y, below) |

Attributes: `data-size`, `data-invalid?`, `data-disabled?`, `data-readonly?`. No
`className`/`style`.

## Sizes

Height, padding-x, text step and icon size follow conventions §2. The leading icon sits
`--pm-space-3` from the text (`--pm-space-2` at `sm`). The clear button is an embedded square hit
target as tall as the input (the minimum target rule), with the `clear` icon at the size's icon
token.

**Clear button recipe**. This is the convention for embedded adornments: any control inside
another control's frame copies it:

| State | Tokens |
| --- | --- |
| rest | icon `--pm-text-muted` (adornment strength, like the leading icon, so it does not compete with the value) · bg transparent |
| hover | icon `--pm-text-primary` · bg `--pm-bg-subtle` · radius `--pm-radius-sm` (the radius of its own hover fill; the outer control keeps `md`) |
| active | hover colors + press-feedback |
| focus | ring per conventions §4 (the ring may overflow the input's frame. This is intended, because it marks the inner target) |
| hidden | never rendered while the input is empty, `disabled`, or `readOnly` (a value that cannot be edited cannot be cleared) |

The clear button does not use `--pm-danger-*` in an invalid field, because it is an action, not
a status.

## Recipe (exact tokens)

Single variant. Transitions: `border-color, background-color, color` over
`--pm-motion-duration-control` × `--pm-motion-easing-standard`. Radius `--pm-radius-md`.
Border `1px solid`.

| State | Tokens |
| --- | --- |
| rest | bg `--pm-bg-surface` · border `--pm-border-default` · seat `var(--pm-shadow-control)` *(a field the same colour as its surface, outlined by one hairline only, looks like a wireframe. The seat is the same token Button's fill uses. Flat systems resolve it to `none`, and the border alone separates the field)* · text `--pm-text-primary` · placeholder `--pm-text-muted` · leading icon `--pm-text-muted` |
| hover | border `--pm-border-strong` |
| focus | ring per conventions §4 · border **unchanged** (ring is the only focus signal) |
| affix (`prefix`/`suffix`) | the size's own text step (§2) · `--pm-text-muted`, adornment strength like the leading icon, so it does not compete with the value · gap to the value same as the leading icon's (`--pm-space-3`, `--pm-space-2` at `sm`) · disabled: `--pm-text-disabled`, like the icon |
| invalid | border `--pm-danger-border` · leading icon `--pm-danger-text` |
| invalid + focus | invalid border + standard ring (ring color never changes) |
| disabled | bg `--pm-bg-subtle` · border `--pm-border-subtle` · shadow `none` *(the seat signals a usable control, which a disabled one is not)* · text `--pm-text-disabled` · icon `--pm-text-disabled` |
| readOnly | rest bg/border · text `--pm-text-secondary` · no hover response |

Selection inside the field: `::selection { background: var(--pm-selection-bg); }`
(global convention, declared once in the vocabulary's base styles).

**The phone floor**: below `30rem` the inner `<input>` takes the text-entry floor's size and
line-height (`--pm-text-entry-size`). This is the focus-zoom floor from conventions §13. Only metrics change; every state
row above stays the same.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| rest md | `<Input placeholder="Search…" />` | `data-size="md"` |
| sizes | sm/lg | `data-size` |
| leading icon | `icon="search"` | — |
| with value | `defaultValue` | — |
| exact | `exact` | the inner input's `autocorrect` and `autocapitalize` are `off`, its `spellcheck` `false` |
| clearable w/ value | `clearable defaultValue` | clear button present |
| clearable, suppressed | `clearable defaultValue readOnly` | clear button absent |
| number | `type="number" min={0} max={10} step={2}` | the three on the inner input |
| affixes | `prefix="$"` · `suffix="USD"` | affix text present, muted |
| invalid | `invalid` | `data-invalid`, inner input `aria-invalid` |
| disabled | `disabled` | `data-disabled` |
| readOnly | `readOnly` | `data-readonly` |

`requiredSelectors`: `:hover`, `:focus-visible`, `[data-invalid]`, `[data-disabled]`,
`::placeholder`.

## Motion

Only border and background transition (tokens above). The clear button appears and disappears
with `fade` at `--pm-motion-duration-control`. At `none` it is instant.

## Icons

`clear` (functional, `label="Clear"` on its button); leading `icon` decorative.

## A11y

A click on the root focuses the input. `aria-invalid` mirrors `invalid`. A platform without the
attribute says it in words: on iOS an invalid field's hint begins with "Invalid", before
FormField's description or error, and every field control (Select, Textarea, Checkbox) does the
same. FormField does the described-by wiring. Affixes are `aria-hidden` decoration and are not
part of the value. A unit that matters must also be in the label or description (FormField's
text); the affix only shows it. Clear is a real button (reachable by Tab, activated by
Enter/Space) sized to the target floor.
`readOnly` stays focusable and selectable, following platform convention.

**The control seam**: `controlRef` gives an application the element and nothing else. The member
never moves, saves or restores a selection. It never remounts the control on a controlled change.
It delivers composition events as the platform fires them. So a collaboration binding can restore
a caret after a remote edit and hold its commit between `onCompositionStart` and
`onCompositionEnd`, and a form library can read a selection without a `querySelector` into the
frame. The seam does not provide transport, awareness, remote cursors or document identity; those
belong to the application. Presence UI beside a field is `FormField.labelEnd` holding
`Avatar`/`Badge`, not a separate member.

```contract
role field textbox
attr field aria-invalid=true when invalid
role clear button when clearable, with value
key Tab moves-focus-next on field when clearable, with value
key Enter activates on clear when clearable, with value
attr field autocorrect=off when exact
attr field autocapitalize=off when exact
attr field spellcheck=false when exact
```

## Agent

An agent reads the field's value and whether it is disabled, invalid or read-only, fills it with
text and clears it. Both actions write through the field as typing does, so the member's own
change path runs and `onChange` is called whether or not the caller controls the value. A
controlled field shows what the caller passes back, as it does for a person. A read-only field
takes no typing, so it refuses both actions and the step fails. A disabled field lists no action.

A field with `type="password"` holds a secret. The bridge treats the value of every password
field as secret, so the value is `{ secret: true }` in every output, whatever this fence says,
and `fill` refuses such a field, because a person types a password and an agent does not.
PasswordInput is the member for a password (`password-input.md`).

```agent
state value text as field value
state disabled boolean as root data-disabled
state invalid boolean as field aria-invalid
state readonly boolean as root data-readonly
action fill text sets value calls onChange
action clear sets value calls onChange
```
