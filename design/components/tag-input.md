# TagInput

A field for entering several free-text values, such as emails to invite or labels to
attach. Choosing from a *closed* list is Combobox's job, or MultiSelect's for several
values; TagInput does not grow options.

It has no substrate: an Input-style container that holds a list of chips and a real
`<input>`.

## Anatomy

```
[container — Input grammar, wraps]
  [chip]* — [label] [remove: Icon "close"]
  [input <input>] — the one focusable text entry
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `value` / `defaultValue` / `onChange(values)` | `string[]` | — | |
| `placeholder` | `string` | — | shown only while empty (the chips are the value, so a placeholder behind them is clutter) |
| `validate` | `(raw: string) => string \| null` | trim + non-empty | return the normalized tag, or `null` to reject it. A rejection sets `data-invalid` on the container for one control duration, as feedback without a message; persistent errors belong to FormField |
| `allowDuplicates` | `false` | fixed | a duplicate flashes the existing chip (see Motion) instead of being added |
| `max` | `number` | — | at max: the input **stays and becomes read-only**, and the container accepts no more tags *(Unmounting the input at max is rejected: it would remove FormField's `<label for>` target, leaving a visible label pointing at nothing, and with it the description, the required flag and `aria-invalid`. Disabling it is rejected too: a disabled input leaves the tab order and the focusable tree, so the label's target could not be reached, and a keyboard user would reach the chips' remove buttons with nothing before them to say what they belong to. `readOnly` is the HTML state for a field that takes no text: focusable, labelled, announced as read-only. Enter adds nothing and typing does nothing. Backspace still removes the last chip, so a full field can make room without a mouse, and the chips stay removable. The description says `Maximum of {max} added`, derived from the prop.)* |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | container min-height = control height; chips one size |
| `onBlur` | `(event) => void` | — | container-level: fires when focus leaves the whole field. Chips and input are one control, so moving focus from a chip to the input is not a blur *(for touched validation)* |
| `disabled` / `invalid` | `boolean` | `false` | |
| `name`, `id` | native passthrough | — | serializes as comma-joined hidden input for forms |
| `removeLabel` | `(tag: string) => string` | `` (tag) => `Remove ${tag}` `` | the accessible name of a chip's remove control *(the localization seam)*. A function, because the tag is data and the surrounding sentence comes from the message catalog |

Commit keys: Enter and comma; paste splits on commas/newlines and validates each;
Backspace in an empty input removes the last chip; a chip's remove button and its
Backspace/Delete while focused both remove. Escape clears uncommitted text.

Attributes: container `data-size`, `data-invalid?`, `data-disabled?`,
`data-state="at-max"?`; chips `data-removing?` during exit.

## Recipes (exact tokens)

| Part | Tokens |
| --- | --- |
| container | Input's recipe (`input.md`) in every state, plus: `flex-wrap` · row gap `--pm-space-1` · column gap `--pm-space-1` · padding `--pm-space-1` `--pm-space-2` · min-height `--pm-control-height-{size}` · height grows with wrapping (the only Input-style field that grows) · seat `--pm-shadow-control` (`none` disabled), as in Input's seat row |
| chip | height `calc(var(--pm-control-height-sm) - var(--pm-space-2))` · padding-inline `--pm-space-2` · gap `--pm-space-1` · radius `--pm-radius-pill` (the tag shape: a pill in every geometry, including terminal's "rare tag that must read as a tag") · bg `--pm-bg-subtle` · border `1px solid --pm-border-subtle` · label `text.sm` `--pm-text-primary`, ellipsis past `calc(var(--pm-space-10) * 2)` |
| chip remove | Icon `close` `sm` `--pm-text-muted` · hover `--pm-danger-text` · its own focus ring per conventions §4 (a chip is a composite: label + one labelled button) |
| chip focused | border `--pm-border-focus-solid` (keyboard walk: ←/→ from the input traverse chips) |
| inner input | bare `<input>`: inherits container font (`text.{size map}` per conventions §2) · `--pm-text-primary` · placeholder `--pm-text-muted` · min-width `calc(var(--pm-space-10) / 2)` · flex-grow · below `30rem` it steps up to the text-entry floor's size/line-height (conventions §13's focus-zoom floor, metrics only); chips do not step, because they are not text entry |
| duplicate flash | existing chip border `--pm-accent-bg` for one `--pm-motion-duration-control` (see Motion) |
| at max | input present and read-only: `cursor: default` on the container, because there is nothing to type into, and the field still takes focus when the container passes it on |

**On Android**: a touch area is the 48dp hit target, and Android publishes it less what a
later neighbour covers. A chip's remove button is smaller than that, so the chip reserves the
room its touch area reaches past the pill's end, and the next chip starts beyond it: chips stand
8dp apart at the standard density, not `--pm-space-1`. Once the chips wrap, each line is at
least 48dp tall, so the touch areas on neighbouring lines do not overlap. A disabled field's
chips have no remove button, reserve nothing, and stand `--pm-space-1` apart.

## FormField integration

Like Input: FormField's label targets the inner input, `aria-describedby` and
`aria-invalid` are wired through, and `invalid` comes from context as for Input. The chip
count is part of the field's accessible description: "{n} added", and "Maximum of {max}
added" once the limit is reached. Both use one element, because it is the same message.
A description id that appeared only at max would change the association while a screen
reader is in the field. The inner input is therefore always rendered and always
focusable (see `max`). `name` serializes into a hidden input that also carries the
component's `disabled`, because a disabled field posts nothing.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| empty | placeholder | — |
| with chips | 3 values | chips present |
| wrapped | 8 long values | container grew |
| at max | `max={3}` + 3 values | `data-state="at-max"`, input read-only and still focusable |
| sizes | sm / lg | `data-size` |
| invalid | `invalid` | `data-invalid` |
| disabled | `disabled` + values | `data-disabled`; removes hidden |

`requiredSelectors`: `:focus-visible`, `[data-invalid]`, `[data-disabled]`,
`[data-state="at-max"]`, `[data-removing]`.

## Motion

`taginput.chip` bindings: enter = `scale-fade`, `control` class, because a chip is a
control-sized arrival. Pop's expressive scale depth makes it a pop, and terminal's subtle
setting makes it a blink. Exit = `fade` at `control-exit` with `data-removing` set, then
the row **reflows on the layout spring**, the same way the toast stack closes its gaps.
Duplicate flash: the border colour changes and returns, once, over
`--pm-motion-duration-control` × `--pm-motion-easing-standard`. At `none` / reduced
motion: instant add and remove, and no flash transition. The border change still shows
for one static frame, so it is visible without motion (`design/motion/motion.md` §10:
every `data-state` is styled at its resting value).

## Icons

`close` (chip remove, labelled "Remove {tag}").

## A11y

The container is not a button; clicking it focuses the inner input. Chips are a simple
list without `role="listbox"` (`<ul>` with labelled remove buttons). The WAI grid-chip
pattern is heavier than remove-only chips need; it is for chips that can be edited.
Removals announce through `aria-live="polite"` ("{tag} removed, {n} remain"). The
consuming app explains the comma/Enter commit in the field description; there is no
hard-coded copy here.

```contract
role field textbox
key Enter commits on field when empty
announces live:polite when with chips
```

## Agent

An agent reads the tags and whether the field is disabled or invalid, adds a tag and clears them
all. The value is the list of tags in their order, each a string, and a tag is its own id,
because the field holds no tag twice. `add` commits one tag as Enter does: `validate` normalizes it, and `onChange` reports the new
list whether or not the caller controls it. It refuses what a person's Enter does not add, and
the step fails: a tag `validate` rejects, a tag the field already holds, a field at `max`, and
text with a comma or a line break, which a person's typing would split into two tags. `clear`
removes every tag, as removing each chip does, and calls `onChange` once with the empty list.
The text typed but not committed is not the value, so an agent does not read it. A disabled
field lists no action.

```agent
state value ids
state disabled boolean as root data-disabled
state invalid boolean as field aria-invalid
action add text calls onChange
action clear sets value calls onChange
```
