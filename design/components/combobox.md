# Combobox

A text input that filters a list down to one choice. Use it for assignee pickers, country
fields and reference lookups.

Behaviour comes from **React Aria hooks** (`useComboBox` + `useFilter` + collection hooks from
`react-stately`), per `README-substrates.md` §3.5. Base UI is rejected there because it has no
stable release, and `@radix-ui/react-combobox` does not exist. This file specifies every
element and attribute.

**The focus boundary (`README-substrates.md` §4, a law for this file):** DOM focus never leaves
the input. `aria-activedescendant` drives the listbox. The popup takes **no focus scope**, and
the repo's existing Radix positioning places it. Using `useOverlay`/`useModal` in this
component is a defect.

## Anatomy

```
[trigger — Input grammar]
  [input <input role="combobox">] [clear?] [chevron: Icon "expand" <button>]
[popup — Select's panel, non-focus-trapping]
  [listbox [option*]] | [loading rows] | [empty row]
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `options` | `{ value: string; label: string; description?: string; disabled?: boolean }[]` | required | the *current* list. With async loading, the app supplies a new list per query |
| `value` / `defaultValue` / `onChange(value)` | `string \| null` | — | selection only by default. On blur, free text that matches nothing resolves to `null` and the input restores the selected label. To keep free text, use `allowsCustomValue` |
| `inputValue` / `onInputChange` | `string` | uncontrolled | controlled pair for async apps driving queries |
| `allowsCustomValue` | `boolean` | `false` | free text **is kept**. Blur keeps the draft instead of restoring the selected label. A commit that matches nothing sets the *selection* to `null` and keeps the text. The app reads the typed value through the controlled `inputValue` pair. These are React Aria's semantics, passed through, not reimplemented. When no option is selected, `name` serializes the typed text, because for this field the text is the value |
| `onLoadMore` | `() => void` | — | *(paging)* fires when the highlight reaches the last row **or** the open listbox is scrolled to its end, while `loading` is false, at most once per `options` length. The app appends the next page to `options` and sets `loading`. The skeleton rows already render below the existing rows, so loading more reuses the loading recipe. The highlight position is the primary trigger *(WCAG 2.1.1: when the page fits the panel, keyboard navigation cannot reach a scroll edge, and assistive tech does not scroll)* |
| `messages` | `ComboboxMessages` | English | *(WCAG 3.1.2)* the member's other strings, localized by passing them, as with `emptyMessage`: the chevron and clear labels, the async status ("Loading options…", "{n} options", "1 option" for one) and the list's name (`list`, "Suggestions"; A11y, below). Partial: an omitted string keeps its English default |
| `filter` | `'contains' \| 'startsWith' \| false` | `'contains'` | `useFilter` (locale-aware, through Intl). **`false` means the app has filtered** (async), so the member must not filter server results again |
| `loading` | `boolean` | `false` | async loading; see below |
| `emptyMessage` | `string` | `"No results"` | apps localize by passing |
| `clearable` | `boolean` | `false` | Input's clear affordance; clearing calls `onChange(null)` |
| `onBlur` | `(event) => void` | — | fires after the blur resolution above, so validation on touch reads the resolved value, not the abandoned draft *(the touched-validation mode)* |
| `size` / `placeholder` / `disabled` / `invalid` / `name` / `id` | — | — | Input's, verbatim |
| `presentation` | `'auto' \| 'popover'` | `'auto'` | `'auto'` shows the popup as a sheet below `30rem` (see the section below; conventions §12). `'popover'` keeps the popper at every width. There is no always-`'sheet'` value, because a bottom sheet is wrong on a wide pointer screen and the closed union excludes it (`docs/layout.md`) |

Attributes. Trigger: `data-size`, `data-invalid?`, `data-disabled?`,
`data-state="open|closed"`, `data-loading?`, `data-sheeting?`. `data-sheeting?` is present
while the popup is drawn as a sheet. The field and the portalled popup then form one composite.
The attribute describes that pair, not the field's presentation, following the at-max
precedent of one attribute per fact. The field's lift above the scrim keys off it. Options:
`data-highlighted` (the active descendant), `data-state="checked|unchecked"`,
`data-disabled?`. Popup: `data-presentation="sheet"` while drawn as a sheet, as conventions §12
requires.

## Async states (the rail, made recipe)

Loading and empty results are required states under the completeness law. Each has a
states-fixture entry:

- **`loading` + open:** the listbox region renders **three Skeleton rows** (text variant, `sm`
  step) at option height. It never shows a centred spinner, because the panel must keep its
  size so arriving results do not shift the layout. A trailing `loading` glyph (`spin`
  ambient) replaces the chevron in the trigger. The chevron returns when loading ends.
- **Zero options + open (not loading):** one non-interactive row: `emptyMessage`, `text.sm`
  `--pm-text-muted`, centred, height `--pm-control-height-sm`. The full `EmptyState` component
  is not used, because a dropdown's empty state is one sentence.
- Both states keep `aria-expanded="true"` and announce via the listbox's
  `aria-live` (see A11y).

## Recipes (exact tokens)

| Part | Tokens |
| --- | --- |
| trigger | Input's recipe verbatim in every state (`input.md`). Chevron `expand` `--pm-text-muted` as in Select. The open state keeps hover colours and the chevron rotates 180° · seat `--pm-shadow-control` (`none` disabled), as Input's seat row |
| popup panel | Select's content recipe **verbatim** (`select.md`): `--pm-bg-overlay` · `1px --pm-border-subtle` · `--pm-radius-lg` · `--pm-shadow-overlay` · padding `--pm-space-2` · min-width trigger · `sideOffset 2` popper, bottom-start |
| option | Select's item recipe verbatim, plus optional `description` line `text.xs` `--pm-text-muted` under the label (two-line options grow to fit; check column unchanged) |
| option highlighted | bg `--pm-accent-subtle` · text `--pm-accent-text` (the transient pointer or keyboard position. It is the hover wash, *not* selection, per Menu's law) |
| option checked | check `confirm` `--pm-accent-text`; label stays primary (Select's law) |
| loading rows | Skeleton text `sm` × 3 · option height · padding as options |
| empty row | `emptyMessage` · `text.sm` `--pm-text-muted` · centered |

**The phone floor:** below `30rem` the input uses the text-entry floor's size and line-height. This
is conventions §13's focus-zoom floor and changes metrics only.

## The sheet, below `30rem`

Under `presentation="auto"` the popup becomes conventions §12's sheet: bottom-attached,
full-width, §12's cap, safe-area insets, `sheet` motion and `data-presentation="sheet"`. The
popper rows above no longer apply. The trigger field does not move or change.

**The focus boundary still applies in the sheet** (§12; `README-substrates.md` §4). DOM focus
never leaves the input, the sheet takes no focus scope, and `aria-activedescendant` still drives
the listbox. The scrim is only a dismiss target and never blocks focus from the field being
typed in. **It does not block the pointer from the field either.** The sheet and its field are
one composite, so while sheeting the field sits one intra-member step above the overlay plane
(`calc(var(--pm-z-overlay) + var(--pm-z-raise))`, the z-index ladder's own syntax). An equal
step would lose the tie to the portal later in the tree; this is verified in all three engines.
A tap on the field moves the caret, and the scrim receives every other tap. The async states
(loading rows, empty row), Escape's close-then-clear order and the blur resolution are the same
in both forms. The sheet is not positioned by the Radix popper. It follows §12's approach,
which avoids `fixed` inside a transformed ancestor. The collection hooks are unaffected.

## FormField integration

The same as Input: the label targets the input, description and error go through
`aria-describedby`, `invalid` comes from context, and `name` serializes the selected value.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| closed rest / with value / sizes | as Select | `data-state`, `data-size` |
| open filtered | `defaultOpen` + typed query | options subset, first `data-highlighted` |
| open with selection | value + open | `data-state="checked"` on the option |
| **loading** | `loading defaultOpen` | `data-loading`; skeleton rows present |
| **empty results** | no matches, open | empty row with message |
| descriptions | options with descriptions | — |
| clearable with value | `clearable` | clear present |
| custom value | `allowsCustomValue` + typed text matching nothing | the draft stands; selection `null`; hidden input carries the text |
| loading more | options + `loading defaultOpen` | rows present *and* skeletons below them (the paging state) |
| invalid / disabled | each | `data-invalid` / `data-disabled` |

`requiredSelectors`: `:hover`, `:focus-visible`, `[data-state="open"]`,
`[data-highlighted]`, `[data-state="checked"]`, `[data-loading]`,
`[data-invalid]`, `[data-disabled]`.

## Motion

`combobox.popup`: Select's binding verbatim: `scale-fade`, `surface` class, origin taken from
the trigger. Skeleton rows use Skeleton's own shimmer (ambient, governed by Skeleton). The
chevron/loading swap is a `fade` at `control`. At `none` or under reduced motion, each pattern
follows its own projection.

## Icons

`expand` (the chevron button, labelled "Show options", because it is a real clickable button),
`confirm` (checked, decorative), `loading` (in the trigger while loading; decorative, because
`data-loading` and the live region announce it), `clear` through Input's clear control.

## A11y

React Aria's combobox pattern: `role="combobox"` + `aria-expanded` +
`aria-controls` + `aria-activedescendant` on the input; options are
`role="option"` with `aria-selected`. ArrowDown opens the list, and arrow keys navigate
without moving DOM focus. Escape closes the list and, in the same press, reverts the draft to
the selected option's label, which is React Aria's order: with nothing selected the draft
clears, and a committed selection is never cleared by Escape. Loading and empty states announce
politely ("Loading options…", then "{n} options", "1 option" for one, or the empty message)
through one live region, so the option count is not announced twice. On Apple platforms, where
VoiceOver in Safari does not follow a combobox's `aria-activedescendant`, the highlighted option
is also spoken in an assertive region of its own as the arrows move it. React's is React Aria's
sentence, in the page's locale. A generated member's is its machine's, run as though nothing
were chosen, so it says the option's label alone and never Zag's English ", selected". The cost:
on Apple platforms a generated Combobox does not say which highlighted option is the chosen one,
which the option carries as `aria-selected`. The listbox is named by `messages.list`, then by the
field's label where `aria-labelledby` names the field: "Suggestions Assignee". Where `aria-label`
names the field, or only a `<label for>` does, as FormField's does, the list's name is
`messages.list` alone, and on React the chevron's name follows it, because React Aria labels the
list by the button that opens it: "Suggestions Show options". React's default is React Aria's
"Suggestions", which React Aria says in the page's locale; a generated member's default is English. RTL: the existing origin helper flips popper alignment.

```contract
role trigger combobox
attr trigger aria-expanded=false when closed rest
key ArrowDown opens
focus on-open trigger
key ArrowDown moves-focus-next on trigger when open filtered
key ArrowUp moves-focus-previous on trigger when open filtered
key Escape closes on trigger when open filtered
key Escape clears on trigger when open filtered
focus on-close trigger
announces live:polite "Loading options" when loading
announces live:polite "No results" when empty results
```

## Agent

An agent reads the chosen option, the options, the typed text, whether the list is open and
whether the field is disabled or invalid. It chooses an option by its id without opening the
list, among every option the application passed and not only the ones the typed text leaves,
and the member reports the choice through `onChange` as it reports a person's, controlled or
not. The field then shows the option's label. It types into the field, which `onInputChange`
reports as typing, so an application that loads options per query hears the agent's query. It
clears the choice and the text, as the clear button does, and opens and closes the list; opening
shows every option, as the chevron does. A disabled option is refused, and a disabled field
lists no action. Each option's id is its `value`, and the value reads `null` while nothing is
chosen.

```agent
state value id
state options choices
state input-value text as trigger value
state open boolean as panel present
state disabled boolean as root data-disabled
state invalid boolean as root data-invalid
action choose id sets value calls onChange when open with a disabled option
action fill text sets input-value calls onInputChange
action clear sets value calls onChange
action open sets open
action close sets open
```
