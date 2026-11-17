# Inline

The horizontal counterpart of Stack, used for rows of controls, meta lines and action groups.
It shares everything else with Stack, so this spec lists only the differences.

## API (delta from `stack.md`)

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `gap` / `p` / `px` / `py` / `patch` / `as` | as Stack | — | `as` adds `'nav'`, drops `'form'` |
| `align` | `'center' \| 'start' \| 'end' \| 'baseline' \| 'stretch'` | `'center'` | defaults to center so mixed-height controls line up; use `baseline` for text runs |
| `justify` | `'start' \| 'center' \| 'end' \| 'between'` | `'start'` | |
| `wrap` | `boolean` | `false` | `true` for tag lists and filter rows; the row gap equals the column gap |

`display: flex; flex-direction: row`.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| control row | Button + Input + Badge, `gap={3}` | centers align |
| baseline text | two text sizes, `align="baseline"` | baselines align |
| wrapping | many Badges, `wrap` | wraps with even gaps |
| justify between | `justify="between"` | — |

`requiredSelectors`: —.

Everything else is as in `stack.md`.
