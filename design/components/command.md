# Command

The command palette: a searchable list of the product's actions, opened by one keystroke.

It is **composed from existing members, not imported** (`README-substrates.md` §3.4). `cmdk`
was rejected because of its namespace, the law edits it would need, and staleness. `Dialog`
owns modality and focus. The Combobox collection hooks own the input, the filtered listbox and
`aria-activedescendant`. Grouping, empty and loading come from the existing vocabulary.

## Anatomy

```
[Dialog — modal, top-placed]
  [panel]
    [search row] — [Icon "search"] [input] [Kbd "esc"]
    [listbox — scrolls]
      [group label?]* [item*] — [Icon?] [label] [hint: Kbd?]
    [empty | loading states]
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `open` / `onOpenChange` | `boolean` | required | the app owns the ⌘K binding, because a global hotkey is app policy |
| `items` | `{ id: string; label: string; icon?: IconRole; hint?: string; group?: string; keywords?: string[]; disabled?: boolean; onSelect: () => void }[]` | required | `group` labels split items into groups in the given order. `keywords` add matches without being shown |
| `placeholder` | `string` | `"Type a command…"` | apps localize by passing |
| `label` | `string` | `"Command palette"` | the dialog's accessible name (its visually hidden title). Apps localize by passing |
| `escapeHint` | `string` | `"esc"` | the dismiss key's label beside the search field. It is localizable because keyboards are not all labelled in English |
| `filter` | `'contains' \| false` | `'contains'` | `false` means the app filters (async command sources). The locale-aware default is `useFilter`'s |
| `loading` / `emptyMessage` | as Combobox | — | async loading, same shapes as Combobox |
| `closeOnSelect` | `boolean` | `true` | selection runs `onSelect`, then closes. Use `false` for palettes that chain |

An item, as `items` takes it:

```ts
interface CommandItem {
  id: string
  label: string
  icon?: IconRole
  hint?: string // a shortcut shown as a Kbd, never bound
  group?: string
  keywords?: string[] // matched, never shown
  disabled?: boolean
  onSelect: () => void
}
```

Attributes: panel `data-state` (Dialog's); items `data-highlighted`,
`data-disabled?`; root `data-loading?`.

## Recipes (exact tokens)

| Part | Tokens |
| --- | --- |
| positioning | the Dialog positioner pinned to the top: panel block-start offset `15vh` (a structural viewport literal; the palette sits high so results grow downward), centred inline · width `min(100%, calc(var(--pm-space-10) * 6))` |
| panel | Dialog's panel surface (`--pm-bg-overlay` · border `1px solid --pm-border-subtle` · `--pm-radius-lg` · `--pm-shadow-overlay`) · **zero body padding**, so rows run edge to edge |
| search row | height `--pm-control-height-lg` · padding-inline `--pm-space-4` · gap `--pm-space-3` · border-bottom `1px solid --pm-border-subtle` · icon `search` `md` `--pm-text-muted` · input bare, `text.md` `--pm-text-primary`, placeholder `--pm-text-muted`, no border or ring of its own (the panel acts as the field) · trailing `Kbd` "esc" |
| listbox | max-height `min(60vh, calc(var(--pm-space-10) * 4))` · `overflow-y: auto` · padding `--pm-space-2` |
| group label | Menu's `groupLabel` verbatim: `text.xs` uppercase `--pm-text-muted` · padding `--pm-space-2` `--pm-space-3` |
| item | Menu's item grammar: height `--pm-control-height-sm` · padding-inline `--pm-space-3` · radius `--pm-radius-sm` · gap `--pm-space-3` · `text.sm` `--pm-text-primary` · icon `sm` `--pm-text-muted` · hint `Kbd`, pushed to the end |
| item highlighted | bg `--pm-selection-bg` · text `--pm-selection-text` · icon inherits. The active row **is** the pending selection, because Enter runs it, so it uses the selection family. Menu's transient hover keeps the accent wash, so the two always look different |
| item disabled | `--pm-text-disabled`, no highlight |
| empty / loading | Combobox's recipes verbatim (three Skeleton rows / one muted `emptyMessage` row) |

## The palette below `30rem`

**Command uses Dialog's full-screen rule** (`dialog.md`, its sheet cell). A palette takes over
the screen and has a text input, and full height gives the list room above the virtual
keyboard. Below the line the `15vh` block-start offset becomes `0` and the panel fills the
screen: stretched, radius `0`, border `0`, block padding meeting
`env(safe-area-inset-top/bottom)` as in Dialog's cell. The positioner has one explicit row,
`minmax(0, 1fr)`, as Dialog's does, so the stretched panel is the window's height however long
the list is. The listbox's `min(60vh, …)` cap is dropped too. The list becomes the panel's
flex fill and scrolls below the fixed search row, as above. The search row, item grammar and highlight recipes are unchanged.

**No `presentation` prop, because a palette has no compact phone form.** Full screen is the
only correct form at phone width. With nothing to choose, the closed API does not offer a prop
that would do nothing. Below the line the input takes the text-entry floor's size and line-height, per
conventions §13's focus-zoom floor, which changes metrics only.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| open | `open` + items | panel present; first item `data-highlighted` |
| open with a query | `open`, a query typed into the field | subset; Escape clears the query and the palette stays open |
| groups | two groups | labels in order |
| with hints + icons | both | Kbd hints rendered |
| **loading** / **empty** | each | skeletons / message |
| disabled item | one disabled | `data-disabled` |

`requiredSelectors`: `[data-highlighted]`, `[data-disabled]`, `[data-loading]`,
`:focus-visible`.

## Motion

`command.panel`: Dialog's `scale-fade` at `overlay` class, **origin top-center**. It grows down
from where it sits, because there is no trigger to grow from. Items cascade with Menu's
`menu.items` stagger (`design/motion/motion.md` §9), using the same ladder and clamps. The
cascade re-runs **on each committed query change**, because new results arriving is the
event. Keystrokes that only narrow the highlight do not re-run it. At `none` or under reduced
motion, the patterns' projections apply and there is no cascade.

## Icons

`search` (decorative), per-item roles from the closed enum (decorative, because labels carry
the meaning). The hint is a `Kbd`, not an icon.

## A11y

Dialog owns modality: trap, Escape, scrim and focus return. Opening puts focus in the search
field. `README-substrates.md` §4 allows
exactly one focus manager, and it is Radix. Inside, the Combobox pattern applies verbatim:
`role="combobox"` input, `aria-activedescendant`, `role="listbox"` with grouped
`role="option"`s (`aria-labelledby` group headers). Escape clears the query if it is not empty,
else closes (APG). An Escape an input method is handling clears nothing: it abandons the
composition. Result counts announce politely, as in Combobox. The palette's own label is
`aria-label="Command palette"` on the dialog.

```contract
role panel dialog when open
role input combobox when open
role list listbox when open
key Enter opens
focus on-open input
key ArrowDown moves-focus-next on input when open
key ArrowUp moves-focus-previous on input when open
key Escape clears on input when open
key Escape clears on input when open with a query
key Escape closes on input when open
focus on-close trigger
dismiss both
announces live:polite when open
```

## Agent

An agent reads whether the palette is open, the commands it offers and the query a person typed,
chooses a command by its `id` and closes the palette. A choice runs the item's own `onSelect`, as
a person's does, and the palette then closes, unless `closeOnSelect` is `false`, as after a
person's choice. A closed palette has no panel, so the bridge does not list it, and an agent runs
a command while the palette is open. The commands are every item, by its `id`
and `label`, whatever the query shows: a query narrows what a person sees, and an agent names the
command it means. A disabled item is refused. A close asks the app through `onOpenChange`, which
owns the open state. An agent does not open the palette: the app owns the binding that opens it,
and a closed palette has no panel to name it. The palette draws its own field and rows, which
register nothing, so it withholds nothing.

```agent
state open boolean as panel present
state items choices
state query text
action choose id calls onSelect
action close sets open
```
