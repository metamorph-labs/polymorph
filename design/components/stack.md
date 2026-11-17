# Stack

A layout primitive that stacks children in a column with a token gap. With Inline and
Grid, it lets application code do all layout through props on the space scale, with no
CSS.

## Anatomy

```
[root <div>] — flex column; children flow with a token gap
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `gap` | `SpaceStep` (`0–10`) | `0` | token names (numbers of the scale), never lengths |
| `p` / `px` / `py` | `SpaceStep` | — | padding; `px`/`py` override `p` per axis |
| `align` | `'stretch' \| 'start' \| 'center' \| 'end'` | `'stretch'` | cross axis |
| `justify` | `'start' \| 'center' \| 'end' \| 'between'` | `'start'` | main axis |
| `as` | `'div' \| 'section' \| 'ul' \| 'ol' \| 'form'` | `'div'` | list/form semantics without wrappers |
| `patch` | `{ gap?, p?, px?, py? }` | — | the patchable set (instance patch, rung 3): the same keys, recorded in the inventory |
| `children` | vocabulary content | — | |

No `wrap`, no `direction` (use Inline), no arbitrary values anywhere: `gap={5}` ⇒
`var(--pm-space-5)`. Implementation: enum-to-var lookup (typed), `display: flex;
flex-direction: column`.

## Recipe

Space tokens only. Stack draws nothing (no bg, border or radius; surfaces are Card's
job). `as="ul"/"ol"` resets list styling (structural).

## States

| Entry | Render | Expect |
| --- | --- | --- |
| gaps | `gap={3}` / `gap={6}` with three chips | computed gap matches token |
| padded | `p={5}` | — |
| axis override | `p={5} py={2}` | — |
| align/justify | `align="center" justify="between"` | — |
| as list | `as="ul"` | `<ul>` rendered, list-style none |
| patched | `patch={{ gap: 2 }}` | inventory records rung 3 |

`requiredSelectors`: — (non-interactive).

## Motion / Icons / A11y

None / none / semantics via `as` only. Layout primitives are invisible to assistive
tech beyond their element choice.
