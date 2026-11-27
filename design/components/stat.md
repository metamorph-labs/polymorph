# Stat

A single key number with its label and the direction it is moving. It is Dashboard's
main unit of content and also appears in DetailPage asides.

Stat is content, not a surface; Dashboard wraps it in Cards.

## Anatomy

```
[root]
  [label row: [label] ......... [icon?] [trend chip? | its placeholder]]
  [value row: [value | its placeholder] ......... [spark? | its placeholder]]
  [delta? | description? — or the placeholder of the one shown]
  [footer?: [primary + trend glyph?]
            [secondary]
            — or two line placeholders]
```

The placeholders replace their parts while `loading` (Loading, below).

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `label` | `string` | required | what the number is ("Open tickets") |
| `value` | `string` | required | pre-formatted by the app (formatting is data logic) |
| `numeric` | `boolean` | `true` | tabular figures for the value (`--pm-font-numeric`) |
| `icon` | `IconRole` | — | top-right, muted, decorative |
| `delta` | `{ value: string; direction: 'up' \| 'down'; positive?: boolean }` | — | `positive` defaults to `direction === 'up'`. Direction and sentiment are separate, because down can be good ("open tickets ↓") |
| `deltaLabel` | `(delta: { value: string; direction: 'up' \| 'down'; positive: boolean }) => string` | `` ({ value, direction, positive }) => `${direction} ${value} — ${positive ? 'positive' : 'negative'}` `` | the delta's spoken sentence (A11y, below), the localization seam. A function of the delta's value, its direction and its resolved `positive`, because the order of the words is grammar and the sentence comes from the message catalog |
| `trend` | `{ direction: 'up' \| 'down'; label: string }` | — | the movement chip of a dashboard stat card, top-right, as an **outline Badge** in the neutral tone. It is separate from `delta` on purpose. `delta` carries *sentiment*: it is coloured success or danger and announces its judgement, which says whether the number is good news. `trend` says only that the number moved and in which direction. A card uses one or the other, because both would state the same fact twice |
| `spark` | `readonly number[]` | — | the trend as a shape: a `Sparkline` (`size="sm"`) at the inline end of the value row. Lawful beside `trend`: the chip states the direction in words and the spark shows the path. It replaces neither `delta` nor `footer`. Passed through unchanged; `sparkline.md` owns the drawing, including rendering nothing for fewer than two points |
| `sparkLabel` | `(label: string) => string` | `` (label) => `${label}, recent trend` `` | the sparkline's accessible name (the localization seam). A function of the stat's `label`, because the surrounding sentence comes from the message catalog |
| `description` | `string` | — | shown when no `delta` ("vs last week") |
| `footer` | `{ primary: string; secondary: string }` | — | the two-line footer. `primary` interprets the number and `secondary` names the period it was measured over. It is one prop, not two, because either line alone is incomplete. Requiring both applies the completeness law at card size |
| `loading` | `boolean` | `false` | the number has not arrived. The label row stays, and each part that states the number is a Skeleton of that part's size (Loading, below). `value` stays required, as a chart's rows do with its `loading`: the caller passes what it has, `""` or the last value, and nothing it passes about the number is drawn |
| `loadingLabel` | `string` | `"Loading"` | what a screen reader hears in the value's place while `loading`: the name of the value's Skeleton (the localization seam) |

Attributes: `data-direction?`, `data-positive?` on the delta; `data-loading?` and
`aria-busy="true"` on the root while `loading`.

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
| trend placeholder | Badge's box (`composes: badge` from Badge's recipe, with no variant, so no colour) around `<Skeleton textStep="xs" width={7}>`: the chip's padding, border and line, so the label row keeps the chip's height |
| value placeholder | `<Skeleton textStep="3xl" width={10} label={loadingLabel}>`: the value's line box |
| spark placeholder | `<Skeleton shape="rect" size={6} width={9}>` in the spark's wrapper. It is shorter than the value's line box, so the value row keeps its height |
| delta placeholder | `<Skeleton textStep="sm" width={9}>`: the delta's line |
| description placeholder | `<Skeleton textStep="xs" width={10}>`: the description's line |
| footer placeholder | the footer's box (its gap and `margin-block-start`) around `<Skeleton textStep="sm">` and `<Skeleton textStep="sm" width={10}>`: its two lines |

The two footer lines differ by **colour, not weight**. Dashboard cards often use a medium
weight, but the system has no such weight step. Emphasis here comes from case and tracking
(conventions §6), and adding a weight for two lines in one card would break the type
scale. Primary over muted gives the same two levels on the colour axis that the system
uses.

## Loading

A dashboard often has its layout and its labels before its numbers. `loading` draws that state:
the label row stays as it is, because the label and the icon are known before the number, and
each part that states the number is replaced by a Skeleton of the size that part takes, so the
card keeps its height when the number arrives.

| Part | Its placeholder while `loading` |
| --- | --- |
| value | always |
| trend chip | when `trend` is passed |
| spark | when `spark` is passed |
| delta | when `delta` is passed |
| description | when `description` is passed and `delta` is not, as it is shown |
| footer | when `footer` is passed |

A part the caller does not pass draws nothing while loading, as it draws nothing once loaded. The
member cannot know that the part will come, and a placeholder for it would invent content. A
caller that knows the card's shape before its numbers passes each part the card will have, with
what it has (`spark={[]}`, a `delta` or `footer` of the last load), and the placeholders hold the
card's height. A placeholder is one line, so a footer line that wraps once loaded makes the card
taller.

Nothing the caller passes about the number is in the document while loading: not the value, the
delta's value or its spoken sentiment, the chip's label, the spark or its name, the description or
the footer's lines. A stale value passed while a number reloads is therefore never shown, read
aloud or found in the page's text.

## States

Entries: plain, with icon, delta up-positive, delta down-positive (the direction ≠
sentiment case), delta down-negative, delta up-negative (the same case the other way:
escalations going up), description, non-numeric. Trend-up with a
footer, trend-down with a footer, a footer with no trend (no glyph without the chip),
a trend with no footer. Spark trending down beside a down-positive delta
(response time, the direction ≠ sentiment case as a shape), spark with the trend chip
(words and shape together), spark alone. Loading with an icon (the label row stays),
loading with a delta and a value from an earlier load (neither is drawn), loading a
dashboard card with a trend, a spark and a footer (each holds its place).
`requiredSelectors`: `[data-positive]`, `[data-direction="down"]`.

## Motion

None: numbers snap, and a counting animation is decoration (the restraint law,
`docs/concepts.md`). While `loading`, the placeholders shimmer through Skeleton's `shimmer`
binding, which stops at `none` and under reduced motion.

## Icons

`up`, `down`, plus `icon`.

## A11y

The delta renders visually hidden text ("up 12% — positive"), so colour and the arrow are never
the only carriers. The judgement is "positive" or "negative". `deltaLabel` replaces the whole
sentence, given the delta's value, its direction and its resolved sentiment, so a host in another
language says all three in its own words and order. The `trend` chip needs no such text:
its label is the text, the arrow beside it is decoration, and the chip makes no sentiment claim
that colour would have to carry.

While `loading`, the root carries `aria-busy="true"`, as a loading DataTable's does. The value's
Skeleton is the labelled form (`role="status"`, named by `loadingLabel`), so a screen reader
reads the label and then "Loading" in the number's place, and every other placeholder is hidden.
No placeholder is read as a number, and no delta sentiment, chip label or sparkline name is
announced for a number that has not arrived.

```contract
announces busy when loading — the label
```

## Agent

An agent gets nothing from a Stat. Its label, its number and the words about the number are text
on the page, which an agent reads there, and a person operates nothing in it. While `loading`, the
page holds the label and no number: the value and the parts that state it are not in the
document, and the value's Skeleton carries `loadingLabel` as its name. A value the caller passes
while the number loads is therefore never read as the stat's.
