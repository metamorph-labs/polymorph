# Stat

A single key number with its label and the direction it is moving. It is Dashboard's
main unit of content and also appears in DetailPage asides.

Stat is content, not a surface; Dashboard wraps it in Cards.

## Anatomy

```
[root]
  [label row: [label] ......... [icon?] [trend chip?]]
  [value row: [value] ......... [spark?]]
  [delta? | description?]
  [footer?: [primary + trend glyph?]
            [secondary]]
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `label` | `string` | required | what the number is ("Open tickets") |
| `value` | `string` | required | pre-formatted by the app (formatting is data logic) |
| `numeric` | `boolean` | `true` | tabular figures for the value (`--pm-font-numeric`) |
| `icon` | `IconRole` | — | top-right, muted, decorative |
| `delta` | `{ value: string; direction: 'up' \| 'down'; positive?: boolean }` | — | `positive` defaults to `direction === 'up'`. Direction and sentiment are separate, because down can be good ("open tickets ↓") |
| `trend` | `{ direction: 'up' \| 'down'; label: string }` | — | the movement chip of a dashboard stat card, top-right, as an **outline Badge** in the neutral tone. It is separate from `delta` on purpose. `delta` carries *sentiment*: it is coloured success or danger and announces its judgement, which says whether the number is good news. `trend` says only that the number moved and in which direction. A card uses one or the other, because both would state the same fact twice |
| `spark` | `readonly number[]` | — | the trend as a shape: a `Sparkline` (`size="sm"`) at the inline end of the value row. Lawful beside `trend`: the chip states the direction in words and the spark shows the path. It replaces neither `delta` nor `footer`. Passed through unchanged; `sparkline.md` owns the drawing, including rendering nothing for fewer than two points |
| `sparkLabel` | `(label: string) => string` | `` (label) => `${label}, recent trend` `` | the sparkline's accessible name (the localization seam). A function of the stat's `label`, because the surrounding sentence comes from the message catalog |
| `description` | `string` | — | shown when no `delta` ("vs last week") |
| `footer` | `{ primary: string; secondary: string }` | — | the two-line footer. `primary` interprets the number and `secondary` names the period it was measured over. It is one prop, not two, because either line alone is incomplete. Requiring both applies the completeness law at card size |

Attributes: `data-direction?`, `data-positive?` on the delta.

**Icon roles.** The icon set has no `trending-up`/`trending-down` role, so `trend` and the
footer glyph use `up`/`down` (`arrow-up`, `arrow-down`). These are the closest glyphs, and
a straight arrow is the usual trend glyph on a dashboard card. No role is added for a
diagonal arrow, because it would be one glyph used in one place, which the
small-vocabulary law prevents.

## Recipe (exact tokens)

| Part | Tokens |
| --- | --- |
| root | Stack gap `--pm-space-2` |
| label | `text.xs` quartet + uppercase (overline grammar, conventions §6) · `--pm-text-secondary` |
| icon | `md` · `--pm-text-muted` · right-aligned on the label row |
| label row end | inline-flex · `flex: none` · gap `--pm-space-2`. Holds the icon, the trend chip, or both, so the number sets the card's width, not the length of the trend label |
| trend | `<Badge variant="outline" icon={direction}>{label}</Badge>`: Badge unchanged, which brings its overline style |
| footer | column · gap `--pm-space-2` · `margin-block-start --pm-space-5`. The footer sits further from the number than the rows above sit from each other, because label, value and delta form one statement and the footer comments on it |
| footer primary | `text.sm` quartet · `--pm-text-primary` · flex row, gap `--pm-space-3` · trailing `Icon` `sm` of `trend.direction` when there is a trend (derived, never passed, so the chip and the line always agree on the direction) |
| footer secondary | `text.sm` quartet · `--pm-text-muted` |
| value | `text.3xl` quartet (carries the title weight: the personality's, or the system file's `overrides.type.titleWeight`) · `--pm-text-primary` · `numeric`: `font-variant-numeric: var(--pm-font-numeric)` *(figures align in the theme's own font; the value never switches to a mono family)* |
| value row | with `spark`: flex row · `align-items: baseline` · `justify-content: space-between` · gap `--pm-space-3` · spark `flex: none` at the inline end. The number comes first and the spark follows it. The spark sits on the value's baseline, as an inline glyph should, and each end of the row holds one of its two items. Centring the spark beside the value at a fixed gap is rejected for these reasons. `space-between` sets the spacing, so the gap is only a minimum. Without `spark` nothing changes, because no wrapper is rendered when there is nothing to wrap |
| delta | `text.sm` · `Icon "up"/"down"` `sm` + value, gap `--pm-space-1` · `positive` → `--pm-success-text` · not → `--pm-danger-text` |
| description | `text.xs` · `--pm-text-muted` |

The two footer lines differ by **colour, not weight**. Dashboard cards often use a medium
weight, but the system has no such weight step. Emphasis here comes from case and tracking
(conventions §6), and adding a weight for two lines in one card would break the type
scale. Primary over muted gives the same two levels on the colour axis that the system
uses.

## States

Entries: plain, with icon, delta up-positive, delta down-positive (the direction ≠
sentiment case), delta down-negative, description, non-numeric. Trend-up with a
footer, trend-down with a footer, a footer with no trend (no glyph without the chip),
a trend with no footer. Spark trending down beside a down-positive delta
(response time, the direction ≠ sentiment case as a shape), spark with the trend chip
(words and shape together), spark alone. `requiredSelectors`: `[data-positive]`,
`[data-direction="down"]`.

## Motion — none (numbers snap; a counting animation is decoration — the restraint
law, `docs/concepts.md`). Icons — `up`, `down`, plus `icon`. A11y — delta renders
visually hidden text ("up 12% — positive") so colour and arrow are never the only
carriers. The judgement is "positive" or "negative". The `trend` chip needs no such text: its label is the text, the arrow beside it
is decoration, and the chip makes no sentiment claim that colour would have to carry.
