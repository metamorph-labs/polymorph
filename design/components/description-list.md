# DescriptionList

Label and value pairs that describe **one** entity, such as a ticket's metadata in a
DetailPage aside or a theme's axes on the TokensPage. It uses semantic `<dl>`/`<dt>`/`<dd>`
and has no substrate.

A description list describes one thing, and a Table compares many. If rows answer the same
question about different entities, use a Table with its `numeric` grammar. If a row has a
control, use a SettingsRow. DescriptionList has no interactivity, no sorting and no columns as
fields. It is read-only content, like Timeline but for facts instead of events.

## Anatomy

```
[root <dl>]
  [pair <div>]*
    [term <dt>]
    [detail <dd>]
```

The per-pair `<div>` is valid HTML inside `<dl>`. It lets a pair be one grid row or one stacked
block while keeping the term and detail together.

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `items` | `{ term: string; detail: ReactNode }[]` | required | rendered in the order given (Stat's rule: sorting is data logic). Empty renders nothing, because the empty message is EmptyState's job (Timeline's rule) |
| `orientation` | `'vertical' \| 'horizontal'` | `'vertical'` | `vertical` stacks term over detail; `horizontal` puts a term column beside a detail column. The default is vertical for Timeline's reason: metadata often ends up in a narrow aside, and the stacked pair works at any width |

`term` is a string, because a label is always text. `detail` is a `ReactNode`, because a
value is often a vocabulary member, as in the DetailPage aside's "Status: **Badge**" and
"Reporter: **Link**". Bare strings use the detail recipe below; slotted components keep their
own type (Accordion's rule). Free-form layout inside a detail is still invented layout. If a
detail needs columns, the entity needs something other than this list.

Attributes: `data-orientation`.

## Recipes (exact tokens)

| Part | Tokens |
| --- | --- |
| root vertical | column · gap `--pm-space-4` between pairs |
| pair vertical | term over detail · gap `--pm-space-1` |
| root horizontal | grid `grid-template-columns: max-content 1fr` · column gap `--pm-space-6` · row gap `--pm-space-3`. The term column is sized to its content, so no width token is needed and no label is truncated by a guessed width |
| term | `text.xs` quartet + uppercase (the overline grammar, conventions §6; Stat's label recipe verbatim) · `--pm-text-secondary` |
| detail | `text.sm` quartet · `--pm-text-primary` for bare strings; members keep their own recipes |

Terms are start-aligned in both orientations. A right-aligned label column would put terms
closer to their values, but its ragged left edge costs more than that gains.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| ticket meta | Status / Priority / Assignee / Raised, string details | `<dl>` with 4 `<dt>`+`<dd>` pairs |
| horizontal | same items, `orientation="horizontal"` | `data-orientation="horizontal"` |
| member detail | one detail a `<Badge tone="warning">Waiting</Badge>` | badge renders inside `<dd>` |
| single pair | one item | — |
| empty | `items={[]}` | renders nothing |

`requiredSelectors`: `[data-orientation="horizontal"]`.

No pseudo-classes, because nothing here is pressed, hovered or focused (as in Timeline).

## Motion

None, for Stat's reason: a changed value re-renders immediately. Animating read-only content
would be decoration.

## Icons

None. Timeline uses a marker column to mark a sequence of events, and this list has no
sequence to mark.

## A11y

Real `<dl>` semantics, so screen readers announce the term/detail pairs and their count. The
component needs no accessible name of its own, because the aside's heading names the entity (a
`dl` is content, not a landmark). One `<dt>` per `<dd>`. Multi-term and multi-detail groupings
are valid HTML but not needed here, and leaving them out keeps `items` a flat array. Reading
order matches visual order: the term, then the value.
