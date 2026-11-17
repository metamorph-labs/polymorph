# Accordion

Accordion is a list of sections that the reader opens one or several at a time.
`@radix-ui/react-accordion` supplies the behaviour (`README-substrates.md` §3.1), and
the vocabulary owns everything perceivable.

## Anatomy

```
[root]
  [item]*
    [header <h3>] — [trigger <button>: [label] [chevron: Icon "down"]]
    [content]     — [inner padding wrapper: children]
```

The heading is a real `<h3>` by default, so an accordion reads as document structure and
not as a row of buttons. Documents that sit deeper use the `headingLevel` prop.

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `items` | `{ value: string; label: string; content: ReactNode; disabled?: boolean }[]` | required | a closed list, like Select. Free-composition children are not offered. An accordion that needs arbitrary headers is a different design: flag it instead of widening this API |
| `type` | `'single' \| 'multiple'` | `'single'` | Radix passthrough |
| `collapsible` | `boolean` | `true` | `single` only: the open item may be closed again |
| `value` / `defaultValue` / `onValueChange` | `string \| string[]` | — | shape follows `type` |
| `headingLevel` | `3 \| 4` | `3` | |

Attributes come from Radix with no translation layer: item, trigger and content carry
`data-state="open|closed"` and `data-disabled?`.

## Recipes (exact tokens)

There is one treatment, **ruled**. Each house system renders this document grammar in
its own style (journal's rules, terminal's hairlines, pop's soft dividers). There is no
boxed or contained variant on purpose. For a panel, compose the Accordion inside a Card.

| Part | Tokens |
| --- | --- |
| item | border-bottom `1px solid --pm-border-subtle`; the first item also has border-top, so the ruled region has both edges |
| trigger | full-width row · min-height `--pm-control-height-lg` · padding-y `--pm-space-3` · gap `--pm-space-3` · `text.md` quartet · `--pm-text-primary` · bg transparent · chevron `Icon "down"` `md` `--pm-text-muted`, pushed to the end |
| trigger hover | label `--pm-accent-text` · chevron `--pm-text-secondary` (colour only; a ruled row gets no wash) |
| trigger open | chevron rotated 180° |
| trigger disabled | label + chevron `--pm-text-disabled` · no hover |
| content inner | padding-bottom `--pm-space-4` · padding-top `0` (the trigger's padding-y provides the gap) · `text.sm` `--pm-text-secondary` for bare strings; slotted components keep their own type |
| focus | the shared focus ring (conventions §4) on the trigger |

## States

| Entry | Render | Expect |
| --- | --- | --- |
| single, first open | `defaultValue` | open item `data-state="open"` |
| single, all closed | `collapsible` | — |
| multiple, two open | `type="multiple"` | two `data-state="open"` |
| one item disabled | one disabled | `data-disabled` |
| long content | paragraph content | — |

`requiredSelectors`: `:hover`, `:focus-visible`, `[data-state="open"]`,
`[data-state="closed"]`, `[data-disabled]`.

## Motion

`accordion.content` binding: **`collapse`**, persistent mode, `surface` class. Per
`README-substrates.md` §3.1, the pattern already exists and `appshell.sidebar` is the
precedent. The Radix measured height `--radix-accordion-content-height` is the input.
Never write the keyframe by hand. Chevron: rotate over `--pm-motion-duration-control` ×
`--pm-motion-easing-standard`. At `none`: instant open and close, static chevron.
Reduced motion: per `collapse`'s projection, the size changes instantly and the content
still fades.

## Icons

`down` (trigger chevron, decorative; `aria-expanded` announces the state).

## A11y

Radix defaults: `<h3><button aria-expanded aria-controls>` plus region wiring, and
arrow/home/end between triggers per WAI-APG. Enter and Space open and close the focused item.
Content regions keep `role="region"` + `aria-labelledby` while open. Nothing focusable is hidden
inside a closed item, because Radix unmounts closed content or makes it inert.

```contract
role trigger button
key Enter opens on trigger when single, all closed
key Enter closes on trigger when multiple, two open
key ArrowDown moves-focus-next on trigger
key ArrowUp moves-focus-previous on trigger
key Home moves-focus-first on trigger
key End moves-focus-last on trigger
role region region when single, first open
```

## Agent

An agent reads which items are open, as their ids, and the items, each with its `value` as its
id and its label. It expands and collapses an item by its id, as a person's press on the item's
trigger does, and the member reports the change through `onValueChange` whether or not the
caller controls the value. Expanding an item of a `single` accordion collapses the item that was
open. A disabled item is refused. A `single` accordion that is not `collapsible` keeps its open
item open, so collapsing that item fails and the step says to expand another. Expanding an item
that is open, or collapsing one that is closed, changes nothing. The open items read as a list in
both types, so an agent reads one shape. The accordion has no name of its own: an agent finds it
by an item's label.

```agent
state value ids
state items choices
action expand id calls onValueChange when single, all closed
action collapse id calls onValueChange when one item disabled
```
