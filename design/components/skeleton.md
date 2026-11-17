# Skeleton

A loading placeholder that holds the layout while content arrives. It uses ambient
`shimmer` motion and has a defined static form for reduced motion and `none`.

## Anatomy

```
[root <div>] — one shape per Skeleton; compose multiples inside Stack for a block
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `shape` | `'text' \| 'rect' \| 'circle'` | `'text'` | |
| `textStep` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl' \| '2xl' \| '3xl'` | `'md'` | `text` shape: mimics that step's line box |
| `width` | `SpaceStep \| '100%'` | `'100%'` | token name or full width; no raw lengths |
| `size` | `SpaceStep` | — | `circle`/`rect`: both dims (`rect` may pair `size` height with `width`) |
| `label` | `string` | — | when the skeleton stands for a named region: sets `aria-label` on a `role="status"` root |

Attributes: `data-shape`.

## Dimensions (token-derived)

| Shape | Height | Radius |
| --- | --- | --- |
| `text` | `calc(var(--pm-text-<step>-size) * var(--pm-text-<step>-line-height))`, the exact line box it replaces | `--pm-radius-sm` |
| `rect` | `--pm-space-<size>` | `--pm-radius-md` |
| `circle` | `--pm-space-<size>` square | `--pm-radius-pill` |

## Recipe (exact tokens)

| State | Tokens |
| --- | --- |
| base | bg `--pm-bg-subtle` |
| shimmer overlay | `background-image: linear-gradient(90deg, transparent, var(--pm-bg-surface), transparent)` sweeping via `shimmer` pattern (background-position/transform per `design/motion/motion.md` §6) |

In light modes `--pm-bg-surface` is lighter than `--pm-bg-subtle`, so the sweep is a
highlight. In dark modes the same pair still reads as a sheen because surface is one step
above subtle on the dark ladder. One recipe works in both modes, with no mode-conditional
CSS.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| text default | `<Skeleton />` | `data-shape="text"` |
| text steps | `textStep="2xl"` | height matches step |
| rect | `shape="rect" size={8} width={10}` | — |
| circle | `shape="circle" size={7}` | — |
| labeled region | `label="Loading tickets"` | `role="status"`, `aria-label` |

`requiredSelectors`: `[data-shape="text"]`, `[data-shape="circle"]`.

## Motion

`shimmer` (ambient): a continuous sweep. Duration and easing follow the ambient period in
the motion values (`design/motion/motion.md` §6), scaled by temperament. At `subtle` it
is slower and dimmer, per the temperament table (`design/motion/motion.md` §3). At `none`
**and** under `prefers-reduced-motion`: a static base fill with no sweep. The placeholder
itself is the loading signal.

## Icons

None.

## A11y

Decorative skeletons are `aria-hidden`, and the region's `aria-busy` reports the loading.
Pair them with a labelled wrapper, or set the `label` prop on the outermost skeleton of a
region. A screen must never rely on skeletons as its only loading semantics.
