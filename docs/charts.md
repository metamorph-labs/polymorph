# Charts

Polymorph's *vocabulary* is the closed set of components every renderer ships; each
component in it is a *member*, and members are grouped into *tiers* (`structure`,
`controls`, `overlays`, `layout`, `charts`, `ai`, `archetypes`). This page covers the `charts`
tier: the members that draw data, a set of chart tokens the theme emits, and the
*laws* (tests that enforce a design claim) that keep the chart palette readable in every
theme.

The tier's decisions live in the engine, and its rendering lives in each framework's vocabulary:

| Path | What it is |
| --- | --- |
| [`packages/engine/src/charts/`](../packages/engine/src/charts/) (`@polymorph/engine/charts`) | the chart engine: the grammar types, scale physics, formatting, geometry, the default English, each member's model and readout, and the state machines of the frame's interaction (the measured box, the reading position, the brush, the sync registry, the series cap, the log of the model's warnings). The only place `d3-*` may be imported. |
| [`packages/react-ui/src/charts/`](../packages/react-ui/src/charts/) | the React members (`<Member>.tsx`) |
| `packages/react-ui/src/charts/frame/` | the React frame: frame, axes, legend, scale legend, tooltip, table twin, brush and annotation layers, and the hooks that bind the engine's machines. Not exported. |
| [`packages/shells/src/chart-frame.ts`](../packages/shells/src/chart-frame.ts) | the same frame in the description language, which the Vue, Svelte, Solid and Angular chart members are generated from ([shells.md](shells.md#charts)) |
| [`packages/recipes/src/charts/`](../packages/recipes/src/charts/) | each member's recipe and the frame's recipes (`frame/`), which every web framework's members import |
| [`platforms/ios/Sources/PolymorphUI/`](../platforms/ios/Sources/PolymorphUI/) | the SwiftUI members (`<Member>.swift`) and their shared parts (`PolymorphUI+Charts.swift`) |

Every web framework's chart members (React, Vue, Svelte, Solid and Angular) draw SVG from the
engine's models. On iOS, Swift Charts draws every chart member except `RadarChart` and `Treemap`,
which SwiftUI shapes draw because Swift Charts has no radial scale and no mark that tiles a box by
area. `PolymorphUI+Charts.swift` ports the engine's slots, stacks, domains, ticks, bins, a funnel's
shares and steps, a treemap's tiling, and sentences, so an iOS chart shows the same numbers as the
web. Android has no first-party charting framework, so the Android map marks every chart member
absent and names `Table` (the chart's table twin) as the substitute, or `Stat` for `Sparkline`
(`design/platforms/ios.json`, `design/platforms/android.json`).

## Why charts are part of the vocabulary

Applications built on polymorph cannot write CSS or raw values (see [rules.md](rules.md)),
so an app cannot build a chart from a charting library. Every such library makes visible
design decisions of its own: its own DOM, inline styles, default paddings, its own
animation system and an open "compose any chart" JSX grammar. Each of those would bypass
the theme, the motion system and the closed component grammar.

The tier therefore **owns the rendering and borrows the scale physics.** Marks, axes,
legend, tooltip, motion and colour are polymorph code: SVG styled with CSS Modules and
coloured only with `--pm-*` tokens. The borrowed part is three small packages of pure
arithmetic with no DOM, no styles and no animation:

| Package | Used for |
| --- | --- |
| `d3-scale` | linear, band and UTC scales, `nice()`, tick selection |
| `d3-shape` | line and area path generators, the monotone-x and step curves, stacking offsets, arcs |
| `d3-array` | `extent`, `max`, `min`, `sum`, and `bin` for the histogram |

Tick *values* come from the scale. Every printed label comes from `Intl`
(the engine's `charts/format.ts`, which imports no d3). `d3-format` and `d3-time-format` are
installed as transitive dependencies and are never called, because a second formatting
system would also be a second locale system. Measured costs and the rejected alternatives
(Recharts, visx, victory, nivo, hand-written scales, the `d3` meta-package) are recorded in
[`design/components/README-substrates.md`](../design/components/README-substrates.md),
section "Chart physics".

Two lint rules enforce the boundary:

- **`polymorph/no-external-dataviz`** is a *red rule* (a lint rule that fails `pnpm lint`). It
  bans importing or re-exporting `d3-*`, `recharts`, `visx`, `victory`, `nivo`, `chart.js`,
  `echarts`, `plotly` and similar packages in application code, and in the engine and the React
  packages everywhere except `packages/engine/src/charts/**` (the path is `CHART_ENGINE` in
  [`packages/rules/src/containment.ts`](../packages/rules/src/containment.ts)). An app that
  needs a visualisation the tier does not draw climbs the exception ladder to a
  `<Bespoke>` zone. See [rules.md](rules.md).
- **`polymorph/no-external-icons`** normally forbids inline `<svg>`. Its `drawIn` option
  disables only that clause for `packages/react-ui/src/charts/**`, because chart marks are geometry
  computed from a scale, not glyphs. The tier still gets icons through the icon gateway.

The d3 packages are dependencies of `@polymorph/engine`, so every consumer installs them. A
consumer's bundle carries them only when it imports a chart: the engine's chart entry is a
subpath, which an application that imports the engine's root for its theme does not load, and
a bundler drops what no member calls (see [consuming.md](consuming.md)).

## Chart tokens

The `--pm-chart-*` family has two halves: colour roles the **theme emits** per pairing and
per mode, and frame heights the **chart frame declares**.

| Token | Emitted by | Job |
| --- | --- | --- |
| `--pm-chart-1` … `--pm-chart-8` | theme | categorical series identity, in fixed slot order |
| `--pm-chart-other` | theme | the de-emphasised series under `emphasis`, and the folded tail past eight series |
| `--pm-chart-seq-1` … `--pm-chart-seq-7` | theme | sequential magnitude, one hue, near-zero toward the surface |
| `--pm-chart-neg-1` … `-3`, `--pm-chart-mid`, `--pm-chart-pos-1` … `-3` | theme | diverging polarity around zero; arm 1 nearest the midpoint |
| `--pm-chart-grid`, `--pm-chart-axis` | theme | hairline gridlines; the zero baseline and annotation ink |
| `--pm-chart-cap` | theme | an integer, not a colour: how many series an any-neighbour form may carry in this palette |
| `--pm-chart-height-sm` / `-md` / `-lg` | `packages/recipes/src/charts/frame/chart-frame.module.css` | frame heights: 144 / 224 / 336px at standard density, written as `calc()` over the space ladder so density scales them |

The colour roles are defined in
[`packages/theme/src/roles.ts`](../packages/theme/src/roles.ts) (`CHART_ROLES`), resolved in
[`packages/theme/src/color/chart.ts`](../packages/theme/src/color/chart.ts) and emitted
beside the colour roles in the base block and both mode blocks. They are also part of the
`[data-tone="inverse"]` borrow, so a chart inside an inverted panel uses the other mode's
palette. `--pm-chart-cap` is identical in both modes, so it is not part of the borrow. The
height tokens are pattern-scoped: only `chart-frame.module.css` may declare or read them
(`packages/rules/scoped-token-owners.json`).

Rules for the family:

- **Series colour is a role family, not a per-component style.** It is re-derived per
  palette and per mode, like `danger` or `success`. Charts consume it and do not own it.
  Changing an app's palette therefore recolours every chart with no app edits.
- **Text never uses a chart colour.** Labels, values and legend text use `--pm-text-*`.
  The coloured mark beside them identifies the series.
- **A series that means good or bad uses a status role**, not a slot: `tone: 'success'`
  paints with `--pm-success-solid`. A series is status *or* categorical, never both.
  Setting `tone` and `slot` together is a dev-warning, and the tone wins.
- **The numbering is the common `--chart-N` convention**, one to one: `--pm-chart-1` …
  `--pm-chart-8`.

## The chart palette

The palette's data is [`design/charts-wheel.json`](../design/charts-wheel.json). The
derivation that reads it is
[`packages/theme/src/color/chart-wheel.ts`](../packages/theme/src/color/chart-wheel.ts),
and [`packages/theme/src/chart-laws.test.ts`](../packages/theme/src/chart-laws.test.ts)
reads the JSON from disk and fails if the engine and the data disagree.

### The wheel: eight hue anchors

| Slot | Family | Hue (OKLCH) |
| --- | --- | --- |
| 1 | orange | 41.116 |
| 2 | teal | 184.704 |
| 3 | blue | 245 |
| 4 | yellow | 84.429 |
| 5 | amber | 70.08 |
| 6 | red | 16.439 |
| 7 | purple | 303.9 |
| 8 | green | 162.48 |

**The slot order is what keeps the palette safe for colour-blind readers.** Slots are
assigned in series declaration order (or by an explicit `slot`), never cycled and never
re-sorted. The pairs a reader has to tell apart are therefore the adjacent ones, and those
are the pairs the laws measure. There is no ninth hue. A ninth series folds into
`--pm-chart-other` with a dev-warning that names the fold rule.

The hues come from a canonical reference wheel that the default pairing is calibrated to
(the *reference*). Slots 1–5 are its light-mode anchors. Slots 6–8 are the families of its
dark set, ordered `red > purple > green` because that order has the best worst-case
adjacent margin across both modes. The reference's dark indigo folds into the blue family
at slot 3.

### How a palette derives its chart colours

A palette file has no chart inputs. It has only ordinary seeds (`accentHue`,
`chromaBudget`, `neutralTint`) plus `chartCaps`, which is a measured record (below), not an
input.

- **Rotation.** A chromatic palette rotates every slot of the wheel by the same angle,
  `accentHue − 41.116`, so slot 1 sits on the brand hue and the spacing between families is
  preserved. Achromatic budgets (`chromaBudget: 'none'` or `'ink'`) have no hue to anchor
  to and use the canonical wheel unrotated.
- **Steps per mode.** Each slot has a fixed lightness and requested chroma per mode
  (`CHART_WHEEL_STEPS`). Chroma beyond the sRGB gamut is projected deterministically: keep
  L and h, reduce C.
- **Repair loop.** After rotation, a slot that can no longer reach the chroma floor
  changes lightness until it can. An adjacent pair that fails a separation gate is moved
  apart in 0.03 lightness steps, plus one guard step. On the canonical wheel neither repair
  changes anything.
- **Dark mode is derived from the same anchors, not a second palette.** A series therefore
  keeps its hue family when the reader switches mode. A series that is orange in light mode
  is orange in dark mode.

The default pairing (the `plain` house system with its default `neutral` palette, see
[theming.md](theming.md)) derives these categorical values from its seeds, and the laws
compare them byte for byte:

| Slot | Light | Dark |
| --- | --- | --- |
| 1 | `#ec5600` | `#be4400` |
| 2 | `#009488` | `#00c5b5` |
| 3 | `#005081` | `#0177bc` |
| 4 | `#fabc00` | `#906b00` |
| 5 | `#d08500` | `#f69e00` |
| 6 | `#ba0139` | `#ff2357` |
| 7 | `#b369ff` | `#ab4eff` |
| 8 | `#007650` | `#00b981` |

Two light slots differ from the reference on purpose. The reference's slot 3 chroma is
below the chroma floor, and its slot 5 is too close to slot 4. The JSON records each moved
value, why it moved, and the canonical sequential and diverging hexes.

### Sequential

The sequential scale is slot 1's hue on a dedicated seven-stop lightness ladder: light
`.90 → .30`, dark `.25 → .85`, ΔL 0.10 per step, requested chroma 0.16 clamped to gamut.
The ladder reverses per mode so that values near zero are always closest to the surface
colour. It is a separate ladder rather than the UI lightness ramp sampled at seven points.
The UI ramp is shaped for roles (a cluster of near-whites, a cluster of solids, a
near-black text step), so sampling it would give several bins nobody can tell apart
followed by one large jump.

Ordinal use (discrete ordered marks rather than a continuous ramp) should start at step 3,
the first step that reaches 2:1 against the surface in both modes.

### Diverging

- **Fixed hues.** Positive is the orange anchor and negative the blue anchor, for every
  palette. Rotation never changes them. If the polarity colours changed per product,
  "above zero" would mean different colours in different places.
- **Neither arm is red or green.** The arms show direction from zero, not whether a value
  is good or bad. A surface that needs to show good or bad uses status roles. Warm means
  above zero, cool means below.
- **Three arms per side**, arm 1 nearest the midpoint, each a dedicated step matched in
  loudness across the two sides (light L .81/.68/.55, dark L .42/.55/.68; chroma
  .07/.12/.17).
- **The midpoint is neutral grey and means exactly zero.** Near-zero values use arm 1. The
  midpoint is neutral step 3 in light (the position `bg.subtle` occupies) and step 5 in
  dark, always taken from the neutral ramp. If that step is the one the grid or the axis
  uses, the midpoint moves *down* a step until it matches neither, because a zero cell must
  be quieter than the chart's furniture (grid and axis).

### Furniture and de-emphasis

- `--pm-chart-grid` is the first neutral step whose separation from `bg.surface` matches
  what the theme's own `border.default` achieves (never below the delineation floor), so a
  theme with stronger borders draws a stronger grid. `--pm-chart-axis` is the next step.
- `--pm-chart-other` is neutral step 9, the solid-fill position, with no hue.

### The series cap

Scatter and radar charts are *any-neighbour forms*: any two marks can end up side by side,
so every pair of series must be distinguishable, not only adjacent slots. The *all-pairs
cap* is the number of leading slots that pass the separation gates against every other one.
The published cap is the minimum over both modes, so a chart does not gain a series when the
reader switches to light. It is emitted as `--pm-chart-cap`.

The canonical wheel caps at 4 in light and 3 in dark, so it publishes 3. Rotated wheels
differ: `carmine` and `orchid` publish 2. Every palette in
[`design/palettes/`](../design/palettes/) declares its measured `chartCaps`
(`{ light, dark, published }`), and a law fails if a declaration disagrees with the
measurement in either direction. A change that moves a palette's cap must therefore update
that palette's file. `ScatterChart` and `RadarChart` read the token at runtime and dev-warn
when the series count exceeds it.

### The palette laws

Every check runs over every system × palette × mode the catalogue ships, measured from the
emitted strings. ΔE is OKLab distance × 100, measured on sRGB hex. CVD separation is the
worse of protanopia and deuteranopia at severity 1.0 (Machado–Oliveira–Fernandes 2009, as `culori`
implements it). Tritanopia is not measured.

| Law | Gate | Kind |
| --- | --- | --- |
| Fixed order | the engine's anchors and steps equal `charts-wheel.json` | hard |
| Exactness | plain × neutral lands the canonical categorical, sequential and diverging hexes in both modes; its light grid is `#e5e5e5`, the theme's own `border.default` | hard |
| Normal-vision separation | every adjacent pair ΔE ≥ 15 | hard |
| CVD separation | every adjacent pair ≥ 6; the repair loop aims at 8, and the list of pairings between 6 and 8 must stay empty | hard |
| Chroma floor | every slot C ≥ 0.10, whatever the chroma budget | hard |
| Rotation | slot 1 sits on the accent hue for chromatic palettes; at every hue in 5° steps, both repairs hold and the adjacency floors pass (`color/chart.test.ts`) | hard |
| Sequential | strictly monotone in lightness, adjacent ΔL ≥ 0.06, one hue (within 3°) | hard |
| Diverging | arms ≥ 90° apart; loudness to the midpoint strictly increases outward; adjacent arms ΔL ≥ 0.06; identical across every pairing | hard |
| Midpoint | chroma within the neutral tint ceiling; never equal to grid or axis; quieter than both | hard |
| Cap record | each palette's declared `chartCaps` equals the measurement; `--pm-chart-cap` equals the audited minimum | hard |
| Emission | every role in the base and both mode blocks; the inverse borrow carries chart colours; the sheet stays under the theme byte ceiling ([layout.md](layout.md#performance-budgets)) | hard |
| Lightness band | slot L within light .43–.77 / dark .48–.67 | soft — recorded, never failed |
| Mark contrast | slot vs `bg.surface` ≥ 3:1 (WCAG ratio; non-text contrast) | soft — recorded as a "relief slot" |

The soft gates and the CVD floor of 6 are acceptable only because **secondary encoding is
part of the anatomy**: every chart with two or more series has a legend whose keys match
the mark shape, line charts offer `markers`, and every member except `Sparkline` includes a
table twin. That is why the twin is required anatomy rather than an option.

The measurements are exposed as `auditChartPalette()` in
[`packages/theme/src/color/chart.ts`](../packages/theme/src/color/chart.ts). The
workbench's `/tokens` page shows each chart swatch with its own numbers: worst adjacent
pair, contrast, band and relief flags, and the cap.

## The members

Every chart member is exported from each web framework's vocabulary package. The grammar types
(`ChartSeries`, `ChartDatum`, `ValueFormat`, `ChartXAxis`, `ChartYAxis`, `ChartSize`,
`ChartMessages`, …) and `DEFAULT_CHART_MESSAGES` are exported from `@polymorph/engine/charts`,
and `@polymorph/react-ui` re-exports them.

| Member | The reader's question | Spec |
| --- | --- | --- |
| `BarChart` | Which is bigger? Grouped, stacked or diverging (Likert); vertical or horizontal. | [bar-chart.md](../design/components/bar-chart.md) |
| `LineChart` | Which way is it going? Multi-series strokes; `area` wash variant; `step` curve. | [line-chart.md](../design/components/line-chart.md) |
| `AreaChart` | What is it made of, and how is that changing? Stacked bands; `percent` variant. | [area-chart.md](../design/components/area-chart.md) |
| `Sparkline` | Which way has it been going? An axis-less inline trend glyph for `Stat` and table cells. | [sparkline.md](../design/components/sparkline.md) |
| `Heatmap` | Where is it concentrated? Magnitude over a grid; diverging automatically on signed data. | [heatmap.md](../design/components/heatmap.md) |
| `DonutChart` | Roughly how does it split? At most six segments, total in the hole. | [donut-chart.md](../design/components/donut-chart.md) |
| `ScatterChart` | Do these move together? One mark per observation; bubble area as a third measure. | [scatter-chart.md](../design/components/scatter-chart.md) |
| `Histogram` | How is it spread? Raw numbers in; the member bins them. | [histogram.md](../design/components/histogram.md) |
| `RadarChart` | What shape is this profile? 3–6 shared-unit axes on one zero-based scale. | [radar-chart.md](../design/components/radar-chart.md) |
| `FunnelChart` | Where do we lose them? One bar per stage of an ordered process, with each share and step. | [funnel-chart.md](../design/components/funnel-chart.md) |
| `Treemap` | What takes the space? Many parts as tiles whose areas are their values, in one level or two. | [treemap.md](../design/components/treemap.md) |

Member rules to know before reading the specs:

- **BarChart** — the y domain always starts at zero, because a bar on a truncated axis
  misrepresents its value. `y.domain: 'auto'` is a dev-warning and is ignored. Only a band
  x is supported. A `time` or `linear` x warns and suggests `Histogram`. Stacking mixed-sign
  data warns and renders grouped. Single-series signed data is automatically coloured with
  `--pm-chart-pos-3` / `--pm-chart-neg-3`, centred on zero. In `mode: 'diverging'` the app
  pre-signs values and each side uses the arms outward from zero. `lines` draws further
  series as lines over vertical bars, on the same zero-based value axis and in the same
  `y.format`, such as a moving average the app computes. They take the slots after the bars'
  and join the legend, the readout, the walk and the twin.
- **LineChart** — `null` breaks the line. It never drops to zero. `curve: 'step'` is
  step-after (a measurement holds until the next one).
- **AreaChart** — band or time x. A linear x warns and suggests `LineChart`.
- **Sparkline** — no frame, axes, legend, tooltip or twin, and no numbers of its own. Its
  `label` should state the reading ("First response, trending down"). In React it is the only
  chart member without `'use client'`. It is the only one drawn into a scaled `viewBox`
  (`vector-effect: non-scaling-stroke` keeps the stroke 2px). `Stat` renders one through its
  `spark` prop.
- **Heatmap** — one measure, so no `series` and no `emphasis`. A scale legend replaces the
  series legend. Values are quantised to the seven emitted steps, because interpolating
  would create colours no law has measured. Signed data uses a symmetric range around
  `--pm-chart-mid`. A missing x×y combination shows the bare surface. A `null` cell is
  absent, not zero.
- **DonutChart** — a seventh segment is a dev-warning. The centre figure is pre-formatted
  by the app. The tooltip and twin show each segment's share. Use a bar chart to compare
  close values.
- **ScatterChart** — x defaults to `linear`, y to `'auto'`. Series are capped by
  `--pm-chart-cap`. Hit-testing is a linear nearest-point scan, sized for the tier's target
  of roughly a thousand points.
- **Histogram** — `data` is `readonly number[]`, a sample rather than rows. `bins` is a
  target count (Sturges by default) that `d3-array.bin` may adjust to round thresholds. The
  count axis always starts at zero.
- **RadarChart** — one shared zero-based radial scale. Per-axis scales are the form's
  best-known distortion, and the props cannot express them. Fewer than 3 or more than 6
  axes warns. Series are capped by `--pm-chart-cap`. The twin (axes × series) counters the
  area distortion the form is prone to.
- **FunnelChart** — one series over ordered stages, as plain horizontal bars against the
  largest stage, never a tapered funnel. Stages are drawn as given: one that rises dev-warns
  and is not clamped. Shares are of the first stage and steps of the stage before, and neither
  is stated where it would divide by zero. It prints its own values, so it has no axes.
- **Treemap** — the squarified layout (`squarify` in the engine), largest first, two levels at
  most: deeper items are summed into the second level with a dev warning. An item with no
  positive value takes no area and is listed in the twin. One level is one colour; with two,
  each group takes a slot and its items its colour. A label sits on a plate of `bg.surface`,
  never on a series colour, and only where the label and the value both fit.

Shared features by member:

| Feature | Bar | Line | Area | Scatter | Histogram | Radar | Heatmap | Donut |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `emphasis` | yes | yes | yes | | | | | |
| `baseline` | yes | yes | yes | | | | | |
| `annotations` | yes | yes | yes | yes | | | | |
| legend toggle-to-isolate | yes | yes | yes | yes | | yes | | |
| `onSelect` | yes | yes | yes | yes | yes | yes | yes | yes |
| `onBrushEnd` | | time / linear x | time x | | | | | |
| `syncId` | | time / linear x | time x | | | | | |

**Deliberately not in the tier:** dual y-axes (two scales suggest a correlation that may
not exist; use two charts or index to a common base), pie (the donut covers its valid
uses), radial bar and gauge (a bar or a `Progress` serves every reader task better),
path-morph data transitions, and a free-form chart builder. A `Dashboard` panel takes any
member as a child. Composing *inside* a chart is not supported.

**Bars and a line.** Each of the three requests for a combined chart has its own answer:

- A constant reference over the bars, such as a target, a budget or a limit, is `baseline` or
  an `annotations` line or band, on the bars' own axis.
- A second series in the bars' unit, such as a moving average, last period or capacity, is a
  `BarChart` `lines` entry. It shares the one value axis, so its values read on the same ticks.
- A second measure in another unit, such as a rate beside counts or latency beside requests,
  is a second chart. A `BarChart` of the counts sits above a `LineChart` of the rate, over the
  same rows and the same `x`, in one panel. Each chart names its axis with its own `y.label`,
  formats it with its own `y.format`, and has its own summary and twin, so no reading depends
  on how two scales were made to fit one plot. Each chart sizes its value axis to its own tick
  labels, so a category sits at nearly the same place in both plots, not exactly, and each
  chart's band labels name its categories.

```tsx
<Dashboard.Panel title="Requests and p95 latency">
  <Stack gap={4}>
    <BarChart
      data={byHour}
      series={[{ key: 'requests', label: 'Requests' }]}
      x={{ key: 'hour' }}
      y={{ label: 'Requests', format: { style: 'compact' } }}
      size="sm"
      label="Requests by hour"
    />
    <LineChart
      data={byHour}
      series={[{ key: 'p95', label: 'p95 latency (ms)' }]}
      x={{ key: 'hour' }}
      y={{ label: 'Milliseconds', domain: 'zero' }}
      markers
      size="sm"
      label="p95 latency by hour"
    />
  </Stack>
</Dashboard.Panel>
```

## The shared grammar

[`types.ts`](../packages/engine/src/charts/types.ts) in the chart engine defines every type
an app uses with the tier. Everything in it is a literal, so a screen spec can express any
chart and no prop can carry a raw colour, a formatter function or a draw callback.

- **`ChartSeries`** — `key` (the field in each row), `label` (never derived from the key),
  optional `slot` (1–8), optional `tone` (`success | danger | warning | info`), optional
  `icon` (an icon role, rendered beside the mark-shaped key, never instead of it).
- **`ChartDatum`** — a row of `string | number | null`. Time values are ISO-8601 strings.
  A date-only string is a calendar date and never shifts by timezone. Rows render in the
  order given. Sorting belongs to the app's data logic. **`null` is a gap, never a zero.**
- **`ValueFormat`** — a closed `Intl` descriptor: `style` (`decimal | compact | percent |
  currency | date`), `currency`, `maximumFractionDigits`, `granularity`. `percent` takes
  ratios.
- **`ChartXAxis` / `ChartYAxis`** — `key`, `scale` (`band` default, `time`, `linear`),
  `label`, `format`, `ticks`; `domain: 'auto' | 'zero'` on y.
- **`size`** — `sm | md | lg` sets the frame height. Width always follows the container.
- **`label`** is required: it is the accessible name.
- **`locale`** — `Intl` formats with it. When it is omitted, the runtime's resolved locale
  applies.

Colour follows the series: slots bind to declaration order or an explicit `slot`, so
filtering data never recolours the series that remain. Callbacks that *report a reader's
action* (`onSelect`, `onBrushEnd`) are part of the grammar. Callbacks that let the app
*draw* are not.

## Shared chart physics

### The frame

`ChartFrame` (`packages/react-ui/src/charts/frame/ChartFrame.tsx`) is shared anatomy that every
member except `Sparkline` uses. It is not exported, and apps cannot compose it. The Vue, Svelte,
Solid and Angular members draw the same anatomy from the description builders in
`packages/shells/src/chart-frame.ts`. The rest of this section describes the web frame.

- **Chromeless.** A `figure` with no title, card or surface. `Card` and `Dashboard.Panel`
  provide the surface and heading, which also keeps one heading per panel.
- **The plot region is a 2×2 CSS grid** (`auto 1fr` × `1fr auto`): the y column sizes to
  its widest tick label and the x row to one line of text. The frame height therefore
  *includes* the x-axis band, and a chart never contains a nested scrollbar.
- **Width is measured, never scaled.** The plot cell is observed with `ResizeObserver` (the
  engine's `observeBox`, which React's `useMeasuredBox` binds, or `measureBox` from a
  described member's resize effect), and the marks are laid out in real pixels. A stretched
  `viewBox` would distort text and stroke widths. The measurement is the cell's layout box
  (`clientWidth`, `clientHeight`), in whole pixels, which a transform does not change: a chart
  inside an overlay's entrance scale lays out at its cell's size. Before the first measurement
  the frame renders at full height with axes, legend and twin in place, so nothing reflows
  when the marks appear.
- **Dev warnings** come from the model's `warnings`. A member logs a message when it enters
  the list and not again while it stays there, so the first measurement or a legend toggle
  does not repeat it (the engine's `createWarningLog`, which React's `useDevWarnings` and
  every description use).
- **States** are exposed as `data-size` and `data-state` (`loading | empty`; `loading`
  takes precedence). Empty is `data.length === 0` and shows the member's own sentence. The
  first load draws a low-contrast skeleton. A refetch keeps the previous frame at half
  opacity. Errors are not a chart state. The app shows them (an `Alert` in the panel).
- **The reading position** is exposed as `data-position` on the frame: the position along the
  chart the reading is on, 0-based, and absent while nothing is read. An agent reads it as the
  chart's `position` ([agents.md](agents.md)).

### Axes

Tick values come from the d3 scale (`nice()`d, about five on the value axis). Labels come
from `Intl`. Band labels are never rotated and never clipped. They are thinned to fit, and
when they can no longer be read, a horizontal `BarChart`, the tooltip or the twin shows the
names. Tick text is `--pm-text-muted` with tabular figures. The only axis stroke is the zero
baseline in `--pm-chart-axis`. Gridlines are hairlines in `--pm-chart-grid` on the value
axis only.

A label is centred on its tick. An x-axis label that centred would be drawn past an end of
the plot is anchored at that end instead: its start on a tick at the plot's start, its end on
a tick at the plot's end (the engine's `anchorAtEnds`, which sets the tick's `align`). That
is the label on a tick at either end of a continuous axis, and a band label wider than the
room beside its band. Past the plot's inline end there is no other part of the chart, and
past its start there is none in a right-to-left document, where the y gutter is on the other
side, so half of a label centred there lies outside the chart's box. Anchoring moves only the
label: reserving room at the plot's ends would move every mark and hit area inward by an
estimate of a label's width. An anchored label lies nearer the label beside it, so that label
gives way when the two would come nearer than the gap thinning keeps, where two labels read as
one. On an axis that drops whole labels (a band axis, `Histogram`'s edges) its tick is dropped
with it. On an axis whose ticks the scale chooses (a value axis, a time axis) the tick and the
gridline drawn from it stay, and the tick draws no label. Thinned band labels are never nearer each other
than the stride, the last one included. `chartBoxLaw` (`packages/conformance/src/chart-box.ts`) holds that no
part of a chart is drawn past its inline edges, for every states fixture entry at 942px and
343px and in both directions. The tests of `BarChart`, `LineChart`, `AreaChart`,
`ScatterChart`, `Histogram`, `Heatmap`, `DonutChart`, `FunnelChart`, `Treemap` and `Sparkline`
call it in every web framework.

### Legend

The legend is derived, never a prop. Two or more series get a legend below the plot. One
series gets none, because the panel title names it. Keys match the mark: a rect for fills, a
line for strokes. On `BarChart`, `LineChart`, `AreaChart`, `ScatterChart` and `RadarChart`
the keys are buttons with `aria-pressed` that hide and show a series. When a series is
hidden, the value domain refits and its key becomes hollow (a 1px ring in
`--pm-chart-other`, label in `--pm-text-muted`). `emphasis` grays every series except
the emphasised one, and a status-toned series may be hidden but is never grayed. The table twin
always shows every series. `Heatmap` uses a scale legend (a ramp strip, or two arm
strips and a midpoint swatch when diverging).

### Reading position and tooltip

- **One focus stop per chart.** The plot is `tabIndex=0`, `role="img"`, named by `label`.
  Arrow keys move the reading position. Escape clears it. The same details appear on focus
  as on hover.
- **Crosshair on continuous x** (`LineChart`, `AreaChart`): the reading snaps to the
  nearest x and one tooltip lists every series there. **Mark-as-target** on the discrete
  forms: each bar, cell, segment, point, bin or vertex has its own readout and is
  highlighted with `data-active`. Hit areas are at least 24px (`HIT_TARGET_MIN`).
- **The tooltip is chart-internal DOM** positioned inside the frame. It is not the overlay
  `Tooltip`, whose hover delay is wrong for a readout that follows the pointer, and it is
  not a portal. The value comes first in `--pm-text-primary`, followed by the series label.
  Configure it with `tooltip: { indicator: 'dot' |
  'line', hideLabel }`. `tooltip: false` removes only the visual layer. The keyboard
  reading, its announcements and the twin remain.
- **`onSelect`** fires on Enter, Space or click at the reading position, with a payload
  shaped for the member (for example `{ index, key, datum }` on a bar). The summary sentence
  tells screen-reader users that the plot can be activated.
- **Laws hold the keys in every web framework.** The reading position of `BarChart`,
  `LineChart`, `AreaChart`, `ScatterChart`, `Histogram`, `RadarChart`, `Heatmap` and
  `DonutChart` is held by the laws in `packages/conformance/src/chart-reading.ts`, which the
  test of each of those members calls in React, Vue, Svelte, Solid, Angular and the elements:
  one focus stop named by `label`, the first arrow on an end, where the walk stops or goes
  around, Home and End, each member's rule for Up and Down, the words each position says,
  Escape, Enter and Space with and without `onSelect`, the brush's keys, and the defaults the
  reading prevents. `FunnelChart`'s and `Treemap`'s keys are held by `funnelChartLaw` and
  `treemapLaw`. The contract grammar does not state a chart's keys, because their result is
  words and marks that depend on the data ([conformance.md](conformance.md)).

### Brush, sync and annotations

- **Brush** (`onBrushEnd`): Shift+Arrows extend from the reading position, Enter commits,
  and Escape first cancels the brush, then clears the reading. It fires only on commit, with
  ISO strings for time or numbers for linear. It never filters the chart. The range goes to
  app state, and `FilterBar` remains where filters are shown. It is coloured with the
  selection roles.
- **`syncId`** links the reading across sibling charts through a module-level registry (no
  provider). The shared value is the x-domain value, not the row index, so a daily and a
  weekly chart can share a reading (the engine's `syncValueAt` and `syncIndexOf`). Escape or
  blur clears the whole group. A chart leaves the registry when it unmounts, so the registry
  holds only mounted charts.
- **`annotations`** are literals (`line`, `band` or `point`) drawn by one shared layer in
  `--pm-chart-axis`. Bands are filled with `--pm-chart-other` at 0.08 opacity. `baseline`
  is shorthand for a line. An annotation never moves the centre of the diverging colours,
  which is always zero. A label sits above its rule, band or point. Where the plot has no
  room above, as for a band that reaches the top of the domain, it sits below, because the
  plot cuts what is drawn past its edge. A line's end label follows the same rule.

### Accessibility and language

- Every member except `Sparkline` renders a visually hidden **summary sentence**, a polite
  live region for the reading position, and the **table twin**: a real `Table` behind an
  icon-only `Button`, given the full data set, with every value reachable without hover.
- **Series are never identified by colour alone:** legend keys shaped like the mark,
  `markers` on line charts, selective end labels, and the twin.
- **Every sentence the tier outputs is replaceable.** `messages: ChartMessages` is one
  catalog for the whole tier, and it takes all keys or none, so a dashboard passes the same
  object to every chart. Sentences are functions over named facts (counts, unjoined names,
  values already formatted), because plural rules and word order depend on the language.
  The English defaults are in the engine's `charts/messages.ts` and are exported as
  `DEFAULT_CHART_MESSAGES`, so a host can override one key:
  `{ ...DEFAULT_CHART_MESSAGES, empty: '…' }`. The quarter label on a date axis (`Q3`) is
  the catalog's `quarter` key, because `Intl` has no quarter field.
- Two laws enforce this:
  [`packages/react-ui/src/charts/chart-messages.test.tsx`](../packages/react-ui/src/charts/chart-messages.test.tsx)
  renders every React chart member for a French host and fails on any default English word
  (including a `Q` on a quarterly axis), and
  [`packages/rules/src/localization.test.ts`](../packages/rules/src/localization.test.ts)
  reads JSX sites across the React vocabulary.

### Marks

| Mark | Rule |
| --- | --- |
| Bar | at most 24px thick (the rest of the band stays empty); 4px radius at the data end, square at the baseline |
| Touching marks | separated by a 2px surface gap, never a stroke (stacks, heatmap cells, donut segments, histogram bins) |
| Line | 2px stroke, round joins and caps, monotone-x curve by default; selective end labels (the endpoint value, never a number on every point) that drop to the legend and tooltip when they would collide |
| Area | the series hue at about 10% as a wash, edged by its 2px line |
| Markers | at least 8px, with a 2px surface ring |
| Donut ring | 24px, the same as the bar thickness cap |

### Motion

Two bindings in [`design/motion/motion.json`](../design/motion/motion.json):
`chart.frame` fades the frame in (`surface` class, `enter` easing). `chart.marks` brings
marks in by transform from the baseline (bars scale up from zero), and strokes and washes
in by opacity, staggered by the shared stagger tokens. There is no draw-on animation. Value
changes re-render, and reduced motion shows everything in its final state at once. See
[motion.md](motion.md).

## Adding a chart member

A new member must answer a reader's question no existing chart member answers, and its
spec must say what it is *not* and which member to use instead. The general process is in
[CONTRIBUTING.md](../CONTRIBUTING.md). For the charts tier:

1. **Scaffold it:** `pnpm new:member <Name> --tier charts`. This writes the React component,
   its recipe (`packages/recipes/src/charts/<slug>.module.css`), its *states fixture*
   (`<slug>.states.tsx`, which the completeness law renders), its test, its spec at
   `design/components/<slug>.md` and its framework-neutral description
   (`packages/shells/src/members/<slug>.ts`). It makes the four wiring edits
   (`packages/react-ui/src/index.ts`, `galleries.ts`, `galleries.test.tsx`,
   `selectors.test.ts`), and `wiring.test.ts` fails if any of them is missing. It also writes a
   placeholder entry into each platform map and framework map, which the platform and framework
   laws refuse until the member's status there is decided.
2. **Write the spec first.** The API table is checked against the component's props by the
   spec-staleness law ([`packages/rules/src/spec-api.ts`](../packages/rules/src/spec-api.ts)).
   Reuse the grammar types. Add a prop only when no existing one expresses it, and keep
   every prop a literal.
3. **Put the drawing in the engine and use the frame.** Write the member's model in
   `packages/engine/src/charts/<slug>.ts`: `<member>Model` (everything that follows from the
   props, the hidden series and the measured plot), `<member>Readout` (what shows at a
   reading position) and `<member>Selection` (what `onSelect` reports), over the engine's
   scales, series and readout helpers. The React member renders the model inside
   `ChartFrame`, measures with `useMeasuredBox`, drives the reading with `useReading` and
   supplies a `ChartTwin`; the description renders the same model through the frame
   builders ([shells.md](shells.md#charts)), and `pnpm shells` writes the Vue, Svelte, Solid
   and Angular members from it. Reach d3 only through the engine.
4. **Colour only with existing tokens**: `cssVar(chartSlotRole(slot))` and the other
   `--pm-chart-*` roles. A chart member adds no colour tokens. A new colour role is a theme
   change, with its own laws and a byte cost against the emit ceiling.
5. **An any-neighbour form** (marks of different series can touch anywhere) reads its series
   limit from the palette (`readChartCap`, which React's `useChartCap` binds and a
   description's `capEffect` calls) when its marks appear, and its model dev-warns above it.
6. **Put every sentence in `ChartMessages`.** A new sentence is a new key on the type and in
   `DEFAULT_CHART_MESSAGES`. The French-host law then covers it automatically.
7. **Fill the states fixture** with empty, loading, single-series, maximum-series and the
   member's own variants, and pin the attribute states (`[data-state="empty"]`,
   `[data-state="loading"]`, `[data-active]`) in `requiredSelectors`.
8. **Decide the phone platforms.** `pnpm new:member` puts the member on each phone platform's
   pending list (`packages/native/src/pending.ts`, `packages/native/src/kotlin-pending.ts`).
   Where the iOS map marks it native, draw it with Swift Charts in
   `platforms/ios/Sources/PolymorphUI/<Name>.swift` over the shared parts in
   `PolymorphUI+Charts.swift`, and take it off the iOS list
   ([verification.md](verification.md#the-ios-gate)). On Android, mark it absent with `Table` as
   its substitute, as the Android map does for every chart member, and take it off the Compose
   list.
9. **Hold its keys with a law.** A member whose keys walk a reading position states that walk,
   its words and its `onSelect` payload in a law of its own in
   `packages/conformance/src/chart-reading.ts`, and the member's test in every web framework
   calls it with a mount of its own.
10. Run the member's tests and the laws: `pnpm exec vitest run packages/react-ui/src/charts` for
   React, and `pnpm exec vitest run packages/vue-ui packages/svelte-ui packages/solid-ui
   packages/angular-ui packages/elements-ui` for the generated members and the elements.
