# SearchInput

An Input preset for searching, so every search box in the product is the same: `search` icon,
clearable, search semantics and an optional shortcut hint.

## API (delta from `input.md` — it renders an Input inside)

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `value` / `onChange` / `placeholder` / `size` / `disabled` | as Input | — | `icon` and `clearable` are pre-set and not exposed |
| `shortcut` | `string` | — | e.g. `"⌘K"`; rendered as Kbd(s) in the trailing slot, **display only** (the app wires any global binding). Hidden while the field has a value or focus, so that `clear` can take its place |
| `clearLabel` | `string` | `'Clear'` | Input's prop, passed through *(the localization seam)*. `clearable` stays pre-set, but its name can be translated |
| `aria-label` | `string` | required unless inside FormField | search boxes are usually label-less |

Without a `placeholder`, the field shows `Search…`.

Attributes: as Input, plus `data-shortcut?` while the hint shows.

## Recipe

Input's recipe, unchanged, **including width**. The Input inside grows to fill the root, so a
SearchInput is exactly as wide as the row it is given, and no wider than an Input where nothing
stretches it. This needs one explicit declaration; rendering an Input does not provide it. The
Input inside is a flex item of this member's root, so without the declaration it sizes to its own
content. In a FilterBar below `36rem`, where the bar gives each control a full line, the search
box would then be shorter than the Selects below it. PasswordInput has the same declaration for
the same reason.

The native `type="search"` decoration is suppressed, because the vocabulary's `clear` button is
the only cancel control. Shortcut hint: Kbd per `kbd.md`, right inset `--pm-space-3`, in a
`--pm-text-muted` context. The phone floor comes from the inner Input's §13 rule (`input.md`;
conventions §13).

There is deliberately no debounce. SearchInput is a controlled input, and when to filter is
product logic (owned by FilterBar's consumers), not a styling decision.

## States

Entries: empty with shortcut, focused (hint hidden), with value (clear shown), sm
size, disabled, and one in a column-labelled FormField. Every other entry renders at its own
width, so this entry is the one that tells a stretched root from a filled one.
`requiredSelectors`: `[data-shortcut]`, plus Input's set by composition.

## Motion — Input's. Icons — `search`, `clear`. A11y — `role="searchbox"` via type;
shortcut hint is `aria-hidden` (if the app wires a binding, the app's own help screen
describes it).

```contract
role field searchbox
```

## Agent

A person sees one search box, so an agent sees one member: SearchInput registers itself and
withholds the Input it draws. An agent reads the field's value and whether it is disabled, fills
it with text and clears it, as it does an Input (`input.md`). Both actions write through the
field as typing does, so `onChange` is called whether or not the caller controls the value, and
the application filters on it as it does on a person's typing. A disabled field lists no action.

```agent
state value text as field value
state disabled boolean
action fill text sets value calls onChange
action clear sets value calls onChange
withholds contents
```
