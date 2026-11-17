# Meter

A Meter shows a measured value in a known range: storage used of a quota, money spent of a
budget, seats taken of a plan. The value can go up and down, and the fill's colour says
whether it is past a threshold the application set.

It is not Progress. Progress is a task moving towards done (`role="progressbar"`), and its
value only grows. A prop on Progress would change its role and what its value means, so a
measured value is a member of its own (`role="meter"`). It is not Stat, which states a number
and how it moved, with no range. It is not a chart: it draws one value, with no series, axis
or legend. There is no substrate: one element with the meter role, the bar Progress draws,
and a line of text.

It renders no label. The name is `label`, for assistive technology, as Progress's is: the
row, cell or field around it shows the name. The words a reader sees under the bar are the
application's `valueText` ("42 GB of 50 GB"), because the unit, the rounding and the
currency are data logic the member cannot know.

## Anatomy

```
[root]
  [track — role="meter", named by label [fill]]
  [readout?: [status glyph?] [value text?]]
```

## API

```ts
interface MeterMessages {
  warning: string // the status glyph's name in the warning band; default "High"
  danger: string  // the status glyph's name in the danger band; default "Critical"
}

interface MeterProps {
  label: string             // the meter's accessible name: "Storage used", not "Meter"
  value: number             // the measured value, in the range's units; drawn clamped to min–max
  min?: number              // the bottom of the range; default 0
  max?: number              // the top of the range: the limit, the quota, the budget; default 100
  warning?: number          // from this value up, the meter is in its warning band
  danger?: number           // from this value up, the meter is in its danger band
  valueText?: string        // the value in the application's words, seen under the bar and heard as the value
  messages?: MeterMessages  // the localization seam: both keys, or none
}
```

Attributes: `data-tone` on the root, `accent`, `warning` or `danger`, the band the value is
in. It is always present, as Progress's is.

**The bands.** The member picks the tone, so a screen states the rule once, as numbers, and
does not restate a comparison at each site. A threshold is the first value of its band: a
value equal to `danger` is in the danger band. `danger` wins where the bands overlap. A
threshold that is not given is a band the meter does not have, so a meter with neither is
always `accent`. The band reads the value as given, before it is clamped, so a value past
`max` is still past a threshold above `max`.

A higher value is the worse one. Every meter in the consumer survey measures what is used
against a limit. A measure where lower is worse (battery left, budget remaining) is drawn as
what is used, until a screen needs the other direction.

**The range.** `max` is greater than `min`. A value outside the range is drawn at the end it
passed and `aria-valuenow` says that end, because `aria-valuenow` must sit inside the range
it names. The application's `valueText` says the real value ("Over by 30 GB"). A range with
no width draws an empty fill.

## Recipes (exact tokens)

The bar is Progress's, so a Meter and a Progress side by side are drawn alike and differ in
what they say.

| Part | Tokens |
| --- | --- |
| root | column · gap `--pm-space-2` |
| track | height `--pm-space-2` (4) · bg `--pm-bg-subtle` · radius `--pm-radius-pill` · overflow hidden |
| fill | `accent` → bg `--pm-accent-gradient` · `warning` → `--pm-warning-solid` · `danger` → `--pm-danger-solid` · full track height · width 100% scaled by `transform: scaleX(ratio)`, from the inline start: the left, and the right where the document runs right to left |
| readout | row · gap `--pm-space-2` · items centred |
| status glyph | `Icon` `sm` · `warning` → role `warning` in `--pm-warning-text` · `danger` → role `error` in `--pm-danger-text`, the roles Alert gives the same tones |
| value text | `text.sm` quartet · `--pm-text-secondary` · `font-variant-numeric: var(--pm-font-numeric)` (the figures keep their width as the value changes) · wraps anywhere |

The readout is drawn when there is a glyph or a value text, and not at all for an `accent`
meter with no `valueText`.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| below its thresholds | 30 of 50, warning 40, danger 45, with value text | `data-tone="accent"` |
| between its thresholds — warning | 42 of 50 | `data-tone="warning"` |
| above its thresholds — danger | 48 of 50 | `data-tone="danger"` |
| at min | 0 of 20 | `data-tone="accent"` |
| at max — the budget is spent | 2,000 of 2,000, danger 2,000 | `data-tone="danger"` |
| outside the range is clamped, and its band still holds | 130 of 100, danger 100, "Over by 30 GB" | `data-tone="danger"` |
| without the value text | 62, no thresholds | `data-tone="accent"`, no readout |
| danger without the value text — the glyph alone | 92, danger 85 | `data-tone="danger"` |
| messages — the glyph named in another language | German words | `data-tone="warning"` |

A right-to-left page is not an entry, because the direction is the document's and no prop
sets it. The direction law renders every entry in a right-to-left document, and the meter
law checks the edge the fill grows from there.

`requiredSelectors`: `[data-tone="warning"]`, `[data-tone="danger"]`, `[dir="rtl"]`.

## Motion

Fill: `transform` over `--pm-motion-duration-surface` × `--pm-motion-easing-standard`, the
`progress.fill` binding. A value change eases and never springs, because data should not look
playful. Reduced motion and `none`: instant. The text and the glyph do not animate.

## Icons

`warning` and `error`, at `sm`, named by `messages`. Each is the status's second channel, so
it is named, not decorative.

## A11y

The track is the meter: `role="meter"`, named by `label`, with `aria-valuemin`,
`aria-valuemax`, `aria-valuenow` (clamped) and, when given, `aria-valuetext` from
`valueText`. The value text under the bar is `aria-hidden`, because the meter's value already
says it. A meter's children are presentational, so the status glyph sits after the meter, in
the readout, and is read after it as an image named "High" or "Critical". A status is never
colour alone: the glyph's shape tells the bands apart on the screen and its name tells them
apart to a screen reader. A change of value is not announced, as Progress's is not: a polled
value would announce on every poll. An application that must announce a crossing announces it
itself, with a Toast or an Alert.

```contract
role track meter
name track from label
attr track aria-valuetext when below its thresholds
attr track aria-valuenow="100" when outside the range
attr root data-tone="danger" when above its thresholds
```
