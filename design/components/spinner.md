# Spinner

A loading indicator for waits of unknown length: the `loading` glyph on the `spin`
ambient pattern, with an accessible name. Button's internal spinner uses the same recipe
but renders the glyph itself instead of composing Spinner; the behaviour is identical.

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | `--pm-icon-size-*` |
| `label` | `string` | `'Loading'` | announced once via `role="status"` |

Attributes: `data-size`.

## Recipe

`<Icon name="loading" />` at the given size, in `currentColor`, so it takes the colour of
its context (muted in empty regions, `accent.contrast` inside a solid button). It is
wrapped in `role="status"` with a visually hidden `label`. Centring and spacing come from
composition (Stack/Inline); Spinner owns no layout.

## States

Entries: three sizes, custom label, inside a coloured context (danger.text wrapper).
`requiredSelectors`: —.

## Motion

`spin` ambient: period `--pm-motion-ambient-spin`, linear, infinite. At `none` / reduced
motion: a static glyph. The ¾ arc and `role="status"` still indicate loading. The global
ambient stop handles this, so the component has no special case.

## Icons — `loading`. A11y — one polite announcement via `role="status"`, which says
the label; never two spinners for one operation (the nearest region owns it).

```contract
role root status
announces live:polite "Loading" when md
announces live:polite "Fetching tickets" when a label
```
