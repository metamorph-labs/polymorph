# MultiSelect

Picks several values from a closed list, filtered by typed text. Use it for assignees, labels
or watchers.

It is a separate member, not TagInput with options or a `multiple` mode on Combobox, because a
value that changes type (`string` → `string[]`) needs its own member. Behaviour comes from
**React Aria collection hooks** (the Combobox set with `selectionMode="multiple"` on the
listbox), positioned by the **installed Radix Popover**, per the focus-management boundary
(`README-substrates.md` §4).

**The focus boundary (`README-substrates.md` §4; binding here, and identical to Combobox's):** DOM
focus never leaves the input. The listbox is driven by `aria-activedescendant`. The popup takes
**no focus scope**. The collection owns input semantics, filtering and selection state, and the
Radix overlay owns position and dismissal. Any use of `useOverlay`/`useModal` in this component
is a defect, whether in a spec, a build or a review.

What it is not: **not Combobox**, which holds one value that free text resolves against. Here the
value is the chips and the input is only a filter. **Not TagInput**, which has an open vocabulary
where typing creates values. Here every chip comes from an option, *unless `allowCustom` is
set*. **Not Select**, which has no text filter and holds one value.

**`allowCustom` deliberately crosses into TagInput's territory.** Suggestions for a vocabulary
that the list does not close belong here, not in TagInput, which is designed without a popup.
With the flag, typed text that matches no option and passes `validate` is offered as one extra
row at the end of the list, `Add "{text}"`. Choosing it creates ("mints") the chip. The set of
values opens, but the interaction does not change. The mint row is an option row, navigated,
highlighted and toggled like any other, and a minted chip is removed like any other. The app
decides async acceptance: it receives the mint through `onChange`. An app that must ask a server
first keeps the value controlled and declines by not adopting it.

**Refusal is answered** *(WCAG 3.3.1)*: hiding the offer is the right resting state. But a
**commit** against it (Enter with text in the input, nothing highlighted, `allowCustom` set) must
not fail silently, because the user typed a value into a field that offers to add values. The
field flashes its danger border once (TagInput's refusal flash unchanged: `data-refused`, colour
only, one control duration, removed at `motion: none`). The live region used for removals *also*
says why: `messages.alreadySelected` when the value is already a chip, `messages.refused` when
`validate` returned `null`. In English they say `"{value}" is already selected` and
`Cannot add "{text}"`. TagInput's refusal is only a flash. This member also announces it,
because a flash gives feedback without identifying the error, and the words identify it.

## Anatomy

```
[field — TagInput's container: Input grammar, wraps]
  [chip]* — [label] [remove: Icon "close"]
  [input <input role="combobox">] — the one focusable text entry
  [chevron: Icon "expand" <button>]
[popup — Select's panel via Combobox, non-focus-trapping]
  [listbox aria-multiselectable [option*]] | [loading rows] | [empty row]
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `options` | `{ value: string; label: string; description?: string; disabled?: boolean }[]` | required | the same shape as Combobox; the *current* list. With async loading the app passes a new list per query |
| `value` / `defaultValue` / `onChange(values)` | `string[]` | — | **always in options order**: the reported array and the chips both follow `options`, never click order. A selection is a set, so two users picking the same set get the same value |
| `allowCustom` | `boolean` | `false` | enables an open vocabulary; see `allowCustom` above. The mint row appears only while the normalized text is non-empty, matches no option's value or label (the Intl rail's equality), is not already selected, and the field is not at max. An offer the field cannot accept is removed, not disabled |
| `validate` | `(raw: string) => string \| null` | trim + non-empty | TagInput's normalize-or-reject, applied only to minting: return the normalized value, or `null` to refuse, which hides the mint row. Options chosen from the list never pass through it. A *commit* against a hidden offer is not silent; see "Refusal is answered" above *(hiding the row alone does not identify the error, WCAG 3.3.1)* |
| `messages` | `MultiSelectMessages` | English | *(WCAG 3.1.2)* every string this member shows or announces, localized by passing it. It extends the `emptyMessage` rail to all text: the mint offer (`add`), the add/removed/refusal announcements, the count description, the chevron and chip-remove labels, the async status. Partial: an omitted string keeps its English default |
| `onLoadMore` | `() => void` | — | *(the paging rail, same as Combobox)* fires when the highlight reaches the last real row **or** the open listbox is scrolled to its end, while `loading` is false, at most once per `options` length. The app appends and sets `loading`, and the skeletons show below the existing rows. The highlight trigger is the primary one *(WCAG 2.1.1: keyboard navigation cannot reach a scroll edge when the page fits the panel, and assistive tech may never scroll)*. The mint row does not count as the last real row, because reaching an offer is not a request for more options |
| `filter` | `boolean` | `true` | Combobox's rail, narrowed: `true` is the locale-aware contains predicate (`useFilter`, the Intl rail); **`false` means the app filtered** (async), and the member must not re-filter server results. The mint row is exempt from the predicate, because it exists *because* of the text and the predicate would remove it |
| `inputValue` / `onInputChange` / `defaultInputValue` | `string` | uncontrolled | Combobox's controlled pair, mirrored by hand one layer down, because an async app needs the typed query. `defaultInputValue` sets the initial text for fixtures, as `defaultOpen` does for the popup |
| `loading` | `boolean` | `false` | Combobox's async rail; its loading and empty recipes apply unchanged (below) |
| `emptyMessage` | `string` | `"No results"` | apps localize by passing (Combobox's cell) |
| `max` | `number` | — | TagInput's at-max rule unchanged: the input **stays and becomes read-only** (focusable, labelled, announced as read-only). The description says `Maximum of {max} selected`, Backspace still removes the last chip, and chips stay removable (see "At max") |
| `onBlur` | `(event) => void` | — | container-level, as in TagInput: fires when focus leaves the whole field. Chips, input and chevron are one control, so moving from a chip to the input is not a blur *(for touched validation)* |
| `placeholder` | `string` | — | shown only while there are no chips (as in TagInput: chips are the value, and a placeholder behind them is clutter) |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | as TagInput: container min-height = control height, grows with wrapping; chips have one size |
| `disabled` / `invalid` | `boolean` | `false` | |
| `name`, `id` | native passthrough | — | TagInput's serialization unchanged: a comma-joined hidden input that also carries the component's `disabled` |
| `presentation` | `'auto' \| 'popover'` | `'auto'` | same as Combobox (`combobox.md`; conventions §12): `'auto'` shows the popup as a sheet below `30rem`, `'popover'` keeps the popper at every width. Same closed union, with no always-sheet value |

Attributes: field `data-size`, `data-invalid?`, `data-disabled?`,
`data-state="open|closed"`, `data-loading?`, `data-at-max?`, `data-refused?` (the refusal
flash, present for one animation. As in TagInput, the flash has its own flag because
`data-invalid` is the field's steady state, and a flashing state would mislead every fixture that
reads it), `data-sheeting?` (as Combobox: the composite flag the field's lift keys off); options
`data-highlighted` (active descendant), `data-state="checked|unchecked"`, `data-disabled?`,
`data-mint?` (the `allowCustom` offer row); chips `data-removing?` during exit. `data-at-max` is a
presence attribute, where TagInput uses `data-state="at-max"`. This is deliberate: this field can
be open *and* full at once, and `data-state` already holds the open state, so the two facts need
two attributes. Popup: `data-presentation="sheet"` while drawn as a sheet (conventions §12).

**The sheet, below `30rem`:** Combobox's sheet behaviour applies unchanged (`combobox.md`;
conventions §12). The popup becomes the sheet and the field stays in the page. DOM focus never
leaves the input, the sheet takes no focus scope, and the scrim dismisses without trapping focus
(the `README-substrates.md` §4 boundary still holds after re-anchoring). The field itself lifts
above the scrim, as in Combobox, so taps on the chips or the input reach them and the scrim
catches every other tap. Selection still never dismisses. This suits the sheet: a user can tick
several options with one open. The at-max rules, the Backspace ladder and the async rail are
the same in both forms. Below the breakpoint the input uses the text-entry floor's size and line-height. This is the
focus-zoom floor from conventions §13, and only metrics change.

**Selection never dismisses.** Enter or a pointer press toggles the highlighted option, and the
popup stays open. This is Menu's checkbox rule: users adjust a filter list several ticks at a
time, and a popup that closed on each tick would have to be reopened n times. Escape and
outside-press still close it. Escape follows Combobox's APG order: the first press closes, the
second clears the filter text. Inside a Dialog both are the field's and the Dialog stays open;
with the list closed and no text left, Escape closes the Dialog. A key an input method is
handling is the input method's: the Enter that confirms a Japanese or Chinese candidate, Safari's
included, toggles no option. Toggling an option off in the listbox and pressing a chip's remove
button are the same removal and are announced the same way.

**The Backspace ladder is the same as TagInput's:** Backspace in an empty input removes the last
chip. The arrows from the input's start move through the chips as TagInput's do, mirrored in a
right-to-left page. A focused chip's Backspace/Delete and
its remove button both remove it. Typed text is only a filter. Enter with no highlighted option
commits nothing, because the closed list defines the values, and creating values from text is
TagInput's job.

## At max (TagInput's transfer)

When `max` is reached, the field carries `data-at-max` and the input becomes `readOnly`. It is
never disabled or unmounted, for the reasons in `tag-input.md`'s `max` row: the label target, the
description and the keyboard path to the chips all depend on it. Typing does nothing, but
Backspace still removes the last chip, so a full field can make room without a mouse. The popup
can still open. **Unchecked options use the disabled recipe and cannot be toggled**, because
adding is what is full. **Checked options stay active**, because unchecking is the removal a full
field must allow. The accessible description adds `Maximum of {max} selected`, derived from the
prop, in the same element as the count (TagInput's one-sentence rule).

## Recipes (exact tokens)

| Part | Tokens |
| --- | --- |
| field | TagInput's container recipe unchanged (`tag-input.md`): Input's recipe in every state, `flex-wrap`, row/column gap `--pm-space-1`, padding `--pm-space-1` `--pm-space-2`, min-height `--pm-control-height-{size}`, height grows with wrapping · seat `--pm-shadow-control` (`none` disabled), Input's seat row |
| chip / chip remove / chip focused | TagInput's chip rows unchanged: pill radius, `--pm-bg-subtle` on `1px --pm-border-subtle`, labelled `close` remove with its own focus ring (conventions §4), `--pm-border-focus-solid` border while a chip has keyboard focus |
| chevron | as Combobox: Icon `expand` `--pm-text-muted`, rotates 180° while open; while `loading` the `loading` glyph (`spin` ambient) sits in its place and the chevron returns when loading ends |
| popup panel | Select's content recipe **unchanged**, as Combobox uses it (`select.md`): `--pm-bg-overlay` · `1px --pm-border-subtle` · `--pm-radius-lg` · `--pm-shadow-overlay` · padding `--pm-space-2` · min-width trigger · `sideOffset 2` popper, bottom-start |
| option | Select's item recipe unchanged **with the check column** (`select.md`: width `--pm-icon-size-sm` + gap `--pm-space-2`). Checked options show Icon `confirm` `--pm-accent-text`, and the label stays `--pm-text-primary`; optional `description` line as in Combobox's two-line row |
| option highlighted | bg `--pm-accent-subtle` · text `--pm-accent-text` (the transient position, shown as the hover fill, *not* selection; Menu's law. Only the check column shows *chosen*, so the two are never confused) |
| option at max, unchecked | text `--pm-text-disabled` · no highlight (§5's collapse: the offer is visibly withdrawn) |
| loading rows / empty row | Combobox's async recipes unchanged: three Skeleton rows at option height, or one non-interactive `emptyMessage` row, `text.sm` `--pm-text-muted`, centered |
| mint row *(`allowCustom`)* | the option recipe unchanged, with `data-mint` on the row. The check column holds Icon `add` `--pm-text-muted` (an offer, not a choice, so never the check's accent), label `Add "{text}"` `--pm-text-primary`. Last in the list; navigated and highlighted like any row |

**On Android**: the chips keep TagInput's Android measure (`tag-input.md`): 8dp apart at the
standard density while they have remove buttons, and lines at least 48dp tall once they wrap.

## FormField integration

Same as TagInput: the label targets the inner input, and `aria-describedby`, `aria-invalid` and
`invalid` from context are passed through. The chip count is part of the field's accessible
description ("{n} selected", plus "Maximum of {max} selected" once the limit is reached). Both
are in one element, for TagInput's reason: a description id that appeared only at max would
change the field's associations while a screen reader user is in it. So the inner input is never
conditional and never unfocusable.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| empty | options + `placeholder="Add assignees…"` | `data-state="closed"`, placeholder shown |
| with chips | `defaultValue` of 3 assignees | chips in options order |
| wrapped | 8 selected | container grew |
| open filtered | `defaultOpen` + typed query | options subset, first `data-highlighted` |
| open with selections | `defaultValue` + open | those options `data-state="checked"`, check glyphs |
| **loading** | `loading defaultOpen` | `data-loading`; skeleton rows |
| **empty results** | no matches, open | empty row with message |
| at max | `max={3}` + 3 values + open | `data-at-max`; input read-only and still focusable; unchecked options `data-disabled` |
| custom — the mint row | `allowCustom defaultOpen` + text matching nothing | one `data-mint` row, `Add "{text}"`, `add` glyph in the check column |
| custom — minted chip | `allowCustom` + a value no option carries | the chip renders, labelled by its value |
| loading more | options + `loading defaultOpen` | rows present *and* skeletons below them (the paging state) |
| sizes | sm / lg | `data-size` |
| invalid / disabled | each | `data-invalid` / `data-disabled`; disabled hides the remove buttons (as TagInput) |

`requiredSelectors`: `:hover`, `:focus-visible`, `[data-state="open"]`,
`[data-highlighted]`, `[data-state="checked"]`, `[data-loading]`,
`[data-at-max]`, `[data-removing]`, `[data-invalid]`, `[data-disabled]`.

## Motion

Chips: TagInput's `taginput.chip` bindings unchanged: `scale-fade` enter at `control`, `fade`
exit with `data-removing`, row reflow on the layout spring. Popup: Combobox's `combobox.popup`
unchanged: Select's `scale-fade`, `surface` class, origin-aware. Chevron/loading swap: `fade` at
`control` (as Combobox). Refusal flash: TagInput's `tag-input-refusal` shape unchanged. The
border goes to danger and back once over the control duration, and is cleared on `animationend`.
At `none` there is no flash, and the announcement alone reports the refusal. At `none` / reduced
motion: as each of those patterns projects.

## Icons

`expand` (chevron button, labelled "Show options"; a real, clickable button, as in Combobox),
`confirm` (checked option, decorative; `aria-selected` announces the state), `close` (chip
remove, labelled "Remove {label}"), `loading` (decorative; `data-loading` and the live region
announce it), `add` (the `allowCustom` mint row, decorative; the row's own label says "Add").

## A11y

React Aria's combobox pattern with a multi-select listbox: `role="combobox"` +
`aria-expanded` + `aria-controls` + `aria-activedescendant` on the input; the
listbox is `aria-multiselectable="true"`, options `role="option"` +
`aria-selected`. Arrows navigate without moving DOM focus, and Enter toggles the highlighted
option. Toggling keeps the popup open
(above). Escape closes, then clears. Chips are TagInput's chip list unchanged: a simple `<ul>`
with labelled remove buttons, which the arrows from the input's start move through. Removal from either
the chips or the listbox announces through `aria-live="polite"`: "{label} removed, {n}
selected". A mint announces the same way, "{value} added, {n} selected", because a chip created
from a row labelled "Add" is a change the user should hear in the same way as its removal. A
*refused* commit is announced in the same region (see "Refusal is answered"). Loading and empty
announce politely as in Combobox, through one live region, so the option count is not announced
twice: "{n} options", and "1 option" for one. On Apple platforms the generated members' machine
also speaks the highlighted option in an assertive region of its own, because VoiceOver in Safari
does not follow the input's `aria-activedescendant`. It runs as though nothing were chosen, so it
says the option's label alone and never Zag's English ", selected". The cost: on Apple platforms a
generated MultiSelect does not say which highlighted options are chosen, which each option
carries as `aria-selected`. React's MultiSelect, built on the listbox hooks, has no such region;
that is a difference between the renderers. All these sentences, and the chevron, chip-remove and count labels, go through `messages`,
because announced text a product cannot translate is announced in the wrong language (WCAG
3.1.2).
RTL: popper alignment flips with the existing origin helper.

```contract
role trigger combobox
attr list aria-multiselectable=true when open filtered
key ArrowDown moves-focus-next on trigger when open filtered
key Enter selects on trigger when open filtered
key Escape closes on trigger when open filtered
announces live:polite when with chips
announces live:polite "Loading options" when loading — skeleton rows
announces live:polite "No results" when empty results
```

## Agent

An agent reads the chosen values in options order, the options, the filter text, whether the
list is open and whether the field is disabled or invalid. It sets the whole selection by ids,
without opening the list, and the member reports it through `onChange` in options order, as it
reports a person's toggle, controlled or not; an empty list clears the field. At the maximum an
unchosen option is disabled, as a person sees it, and a set larger than the maximum is refused.
A chosen value that no option carries (a minted one) is listed as a choice labelled by itself,
so a set can keep it. The agent sets the filter text, which `onInputChange` reports, and is
refused while the field is full, as its text is read-only then. It opens and closes the list. It
mints no value: a minted value is one a person types and adds. A disabled option is refused, and
a disabled field lists no action. Each option's id is its `value`.

```agent
state value ids
state options choices
state input-value text as trigger value
state open boolean as panel present
state disabled boolean as root data-disabled
state invalid boolean as root data-invalid
action choose ids sets value calls onChange
action fill text sets input-value calls onInputChange
action open sets open
action close sets open
```
