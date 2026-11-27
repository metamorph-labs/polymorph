# Theming

This page explains how polymorph themes work: what a theme is made of, how its colours and scales
are derived and checked, how it reaches the page, and how to bring your own. Read
[concepts.md](concepts.md) first for the wider decision system. Motion is one of the axes below and
is covered in [motion.md](motion.md). The chart palette is covered in [charts.md](charts.md).

## The three nouns

A theme is a **pairing** of two independent halves:

| Noun | What it decides | Lives in |
| --- | --- | --- |
| **System** | Structure and presentation: the eight design axes, the font slots and presentation defaults | `design/systems/<name>.json` |
| **Palette** | Colour inputs: accent, gradient and neutral hues, neutral tint, chroma budget | `design/palettes/<name>.json` |
| **Pairing** | One system × one palette: the unit that is resolved, emitted as CSS and applied to the DOM | `<html data-system="…" data-palette="…">` |

**Any palette is lawful on any system.** The law suite resolves every system × palette combination
in both modes. Changing a product's colours (a palette edit) is therefore independent of changing
its structure (a system edit). A system names a `defaultPalette`. That is a default, not a
constraint: any other pairing is permitted.

Each input belongs to the half it feeds. `chromaBudget` ("how loud") is read only by colour
derivation, so it belongs to the palette. Fonts belong to the system, because a typeface is part of
the product's character rather than its colour. System and palette names are kebab-case slugs
because they are used in attribute selectors and in `localStorage`. A pairing's id,
`<system>/<palette>` (`pairId()`), identifies it in errors, tests and caches. It is never a DOM
attribute.

The engine path is `parseSystem` / `parsePalette` (zod schemas) → `composeTheme(system, palette)`
→ `resolveTheme` → `emitThemeCSS`, all in `packages/theme/src/` and re-exported by
`@polymorph/engine` (and through it by each web foundation: `@polymorph/react`, `@polymorph/vue`,
`@polymorph/svelte`, `@polymorph/solid` and `@polymorph/angular`).

## The system document

```json
{
  "name": "plain",
  "register": "The quiet default. True greys, hairline separation, …",
  "axes": {
    "geometry": "soft", "depth": "borders", "density": "standard",
    "contrastTemperament": "standard", "typePersonality": "grotesque",
    "colorStrategy": "quiet", "motionTemperament": "standard", "ornament": "minimal"
  },
  "fonts": {
    "body": { "family": "Geist Variable" },
    "display": { "family": "Geist Variable" },
    "mono": { "family": "Geist Mono Variable" }
  },
  "defaultPalette": "neutral",
  "defaultMode": "system",
  "kind": "designed"
}
```

| Field | Meaning |
| --- | --- |
| `name` | kebab-case; must equal the file name |
| `axes` | all eight axes, below |
| `fonts` | the font slots, below: `body`, `display` and `mono`, and an optional `heading` |
| `defaultPalette` | the palette used with the system unless another is chosen |
| `defaultMode` | `light`, `dark` or `system`: the mode of a reader who has not chosen one, on every platform. `system` follows the device. In CSS it is also the mode the pairing's block applies where nothing sets `data-mode`, with `system` read as light |
| `kind` | `designed` (default) or `tenant`. A tenant has a designed system's axes with a different palette and is exempt from the divergence law |
| `register` | one paragraph introducing the system, read by the docs site; required of every committed designed system |
| `overrides` | optional value-only amendments to the derived scales, below |
| `$schema` | tolerated and ignored, so an editor can point at the JSON Schema |

`defaultMode` is the mode preference of a reader who has not chosen one. `light` and `dark` are
that mode, whatever the device's setting. `system` follows the device's mode and keeps following
it as it changes. A reader's own choice (`setMode`) is stored and wins over the default from then
on. On the web, `hydrateTheme` applies the worn system's default when nothing is stored and does
not store it, and the pre-paint script built for the page's systems applies the same before the
first paint ([Before first paint](#before-first-paint)). So a first visit to a page wearing
`terminal`, whose default is `dark`, opens dark on a light device. On iOS and Android the same
field is `theme.preferredColorScheme` and `theme.preferredDark` ([native.md](native.md)).

A default is never stored, so a later change of a system's default, or a switch of system, still
reaches a reader who never chose. A stored `system` is read as the reader's choice, so a returning
reader whose storage holds it keeps following the device whatever the system's default. That
includes most returning readers of an application that hydrated with an earlier release, which
stored `system` on the first hydration.

Where nothing sets `data-mode`, the pairing's block applies `defaultMode` itself, with `system`
read as light: a nested scope that carries the pairing without `data-mode`, or a page that runs
neither the pre-paint script nor `hydrateTheme`.

The schema is strict. It rejects an unknown key, and it rejects a colour seed in a system file.

### The eight axes

The axes are the system's parameters. Every visible value is derived from them and the palette's
seeds. No token sheet is written by hand (`packages/theme/src/derive.ts`,
`packages/theme/src/color/role-map.ts`).

| Axis | Values | What it decides |
| --- | --- | --- |
| `geometry` | `sharp` · `crisp` · `soft` · `round` | The radius ladder sm/md/lg: 0/0/0, 2/4/8, 4/8/14, 6/12/24 px (`none` = 0 and `pill` = 9999 at every geometry). |
| `depth` | `flat` · `borders` · `elevated` · `glass` | How surfaces separate. Shadow layers for the `control`, `raised` and `overlay` steps; the lit-fill top highlight; border weight (`flat` one step heavier); scrim strength; halo strength; the app-shell edges. `flat` casts no resting shadow but still gives transient surfaces a real overlay shadow. `glass` makes transient panes translucent over a 24px backdrop blur. |
| `density` | `compact` · `standard` · `comfortable` | The spacing ladder (0, 2, 4, 8, 12, 16, 24, 32, 48, 64, 96 px at standard) × 0.85 / 1 / 1.15, control heights (32/36/40 at standard), snapped to a 2px grid. Also the type ratio: 1.2 / 1.25 / 1.3. |
| `contrastTemperament` | `soft` · `standard` · `stark` | How strong edges and supporting text are: the ramp steps for secondary and muted text, page-to-surface spread, border weight, focus-ring width (2/2/3 px), icon stroke, link underline strength. Primary text stays on step 12 at every temperament. |
| `typePersonality` | `grotesque` · `humanist` · `mono` · `editorial` | Body, title and display weights; tracking; icon stroke; the default fallback class (`editorial` falls back to serif); `mono` adds slashed zeros to tabular figures. |
| `colorStrategy` | `quiet` · `tinted` | `quiet` keeps surfaces neutral and uses the accent only on interactive parts; `tinted` gives surfaces a low-chroma wash at the neutral hue. |
| `motionTemperament` | `none` · `subtle` · `standard` · `expressive` | Duration scale, springs, press scale, ambient loop periods, stagger. `none` is lawful and zeroes every duration. See [motion.md](motion.md). |
| `ornament` | `none` · `minimal` · `grain` · `grid` | How much decoration the system permits. `none` has no decorative halos; `minimal` has halos and no texture; `grain` and `grid` add a page texture held below ΔL 0.012 in OKLCH, so it never changes a colour the contrast law measured. |

Type sizes are emitted in `rem` (a 16px base unless the system sets one, steps `xs`…`3xl`, display steps `sm`…`lg` at a ratio of
at least 1.25 whatever the density), so a reader's font-size setting scales text. Space and
component dimensions are in `px`, so layout spacing does not change with that setting.

**The base and the text-entry floor.** `md` is the paragraph size, 16px unless
`overrides.type.base` sets it, between 12 and 20px. A base under 16px is lawful because the
floor it would have moved is a token of its own: iOS zooms the page when a focused field's text
is under 16px (`design/components/README.md`, the focus-zoom floor), so below `30rem` every
text-entry member reads `--pm-text-entry-size` and `--pm-text-entry-line-height`, which the
engine derives as the md step or 16px, whichever is larger. No application needs a viewport
`maximum-scale` or a CSS `zoom` to keep a small field from zooming, and neither is lawful here:
the first disables the reader's own zoom and the second is a raw style. The two steps under the
base, `type.sm` and `type.xs`, set the working sizes in px (controls, table cells, menus and
labels read `sm`; captions and badges read `xs`), so a product whose sizes are 12, 13 and 13
says so in three numbers. `type.ratio` derives every step that is not set, above the base and
under it. The merged ladder stays in order, `xs` never goes under 10px, each step's line box fits
the control that draws it at compact density, and the reader's own font-size setting still
scales every step, because sizes are emitted in `rem`.

**Coherence.** The schema checks one axis at a time and the contrast law checks one pairing at a
time. Neither catches a set of individually valid values that contradict each other.
`auditCoherence` (`packages/theme/src/coherence.ts`) checks the *derived tokens* against the axes:
`flat` has no resting shadow and no top highlight, but transient surfaces still get a shadow;
material appears exactly when depth is `glass`, and a glass overlay still casts a shadow;
`ornament: none` has no glow; texture appears exactly at `grain`/`grid`; motion `none` derives zero
durations and zero stagger; the overshoot easing differs from standard only at `expressive`.
`laws.test.ts` checks every combination of the eight axes.

**Exposed axis flags.** Three axes are emitted as tokens that a component recipe may branch on with
a style query: `--pm-axis-depth`, `--pm-axis-geometry` and `--pm-axis-ornament`. Each of these axes
can require a structurally different recipe, not only a different value:

```css
@container style(--pm-axis-depth: flat) {
  .card { border: 1px solid var(--pm-border-default); }
}
```

The other five axes affect token values only. `laws.test.ts` asserts this list. The two drawing
choices in `overrides` (`--pm-focus-field`, `--pm-hover-unfilled`) and where the focus ring sits
(`--pm-focus-place`, read from the offset) are flags of the same kind, each read by the one
convention it belongs to.

### The font slots

`fonts.body`, `fonts.display` and `fonts.mono` are required, and `fonts.heading` is optional. Each
takes `{ family, fallback?, style? }`:

- `family` — a Fontsource family name. `fontPackage()` maps `"Inter Variable"` to
  `@fontsource-variable/inter` and a name without the `Variable` suffix to the static
  `@fontsource/…` package.
- `fallback` — `sans`, `serif` or `mono`, the system font stack used until the webfont loads.
  When it is omitted, body, heading and display follow the type personality, and the mono slot
  always falls back to a monospace stack so code does not reflow.
- `style` — `normal` or `italic`. Only the display slot reads it.

Each type step draws in one slot, and the step's `--pm-text-<step>-family` token references the
slot's `--pm-font-<slot>`:

| Slot | Steps | Draws |
| --- | --- | --- |
| `body` | `text.xs`, `text.sm`, `text.md` | paragraphs, controls, labels, table cells |
| `heading` | `text.lg`, `text.xl`, `text.2xl`, `text.3xl` | Heading's levels, EmptyState's title, dialog and page titles, Stat's value |
| `display` | `display.sm`, `display.md`, `display.lg` | Hero's title |
| `mono` | none; recipes set it at a text step's size | code, keys, JSON |

A system that leaves `fonts.heading` out draws its heading steps in the body slot, so a system
file written without it resolves to the same type. The stylesheet then writes
`--pm-font-heading: var(--pm-font-body)`, as it writes a display stack equal to the body stack,
and the token document carries the body slot's values under `fonts.heading`. A part that borrows
a heading step's weight at a body size borrows its family too when it is a heading or a title:
Heading's level 4 and ArtifactPane's title draw at `text.md` in `text.xl`'s weight and family. A
part at a heading step that is not a heading keeps the body slot's family: Hero's lede and
Avatar's `lg` initials take `text.md`'s. `FONT_ROLES` lists the roles, `heading` last, and
`fontSlot(fonts, role)` gives the slot a role draws in, the body slot for a heading the file
leaves out.

Stat's value (`text.3xl`) and DonutChart's centre figure (`text.2xl`) are at heading steps, so a
heading face draws them too. Both still set `font-variant-numeric: var(--pm-font-numeric)`. That
token asks for tabular figures (`tnum`, and a slashed zero under `mono`), not for lining figures,
so a heading face whose default figures are old-style draws old-style figures there, and a face
without tabular figures draws its proportional ones.

Applications load webfonts. The library never bundles them. `admitTheme` reports the packages a
pairing needs. The build-time plugin and a CLI theme install import them from the theme module. In
this repository, `pnpm registry` generates each app's font loader map (`apps/*/src/fonts.gen.ts`)
from the catalogue.

### Scale amendments (`overrides`)

An optional `overrides` block changes the value a derived step resolves to. The axes stay the
same. Overrides change values, never names, so every pairing emits the same set of properties. Each
scale's law is checked against the merged result.

| Key | Accepts | Held to |
| --- | --- | --- |
| `radius` | `sm`/`md`/`lg`, 0–64 px | ladder stays monotone |
| `space` | steps 1–10, 2–128 px (the standard-density base) | ladder stays non-decreasing; density still re-derives |
| `controlHeight` | `sm`/`md`/`lg`, 24–64 px | monotone; `sm` at compact density ≥ 24px (WCAG 2.5.8) |
| `shadow.throw` | 0.5–1.75 | scales shadow distance and blur, never darkness |
| `focus` | `width` 2–6 px; `offset` minus the width (the ring inside the edge, the derived default) or 0–4 px (outside, with that much air); `field` `ring` or `border` | the offset judged against the merged width, never further in than the width and never across the edge; the focus colour at 3:1 on every surface and wash, below |
| `type.base` | 12–20 px, on the half-pixel grid | the text-entry floor stays at 16px or the base, whichever is larger |
| `type.ratio` | 1.125–1.4 | derives every step that is not set; the base never moves with it |
| `type.sm`, `type.xs` | 10–20 px, on the half-pixel grid | xs ≤ sm ≤ base on the merged ladder, xs never under 10px, and each step's line box fits its control at compact density (xs in sm, sm in md, the base in lg); an unset step is judged at the size the ratio derives from the base |
| `type.titleWeight`, `type.displayWeight` | 300–700, in hundreds | each heading step's weight reads at Lc 75 at the size the merged ladder gives it; in this repository, the family that draws the weight ships it, below |
| `hover` | `unfilled`: `wash` or `none` | a press and a toggle that is on keep their wash |
| `numeric` | `align`: `end` or `start` | numeric columns keep tabular figures either way |
| `assign` | radius classes `control`/`detail`/`surface`, shadow classes `seat`/`resting`/`transient`, inset classes `surface`/`pane`/`list` | each class points at an existing step |
| `exceptions` | one member re-points one class token to one step, with a `because` | one entry per member × family × class |

Exceptions are emitted inside an `@scope` block that stops at any nested pairing, so a page's
exception does not apply inside a preview of another pairing.
[rules.md](rules.md#per-member-exceptions-in-a-system-file) explains how they relate to the other
ways to deviate.

**Heading weights.** The type personality sets two heading weights: a title weight for `text.2xl`
and `text.3xl`, and a display weight for the display steps, between 500 and 700.
`type.titleWeight` and `type.displayWeight` replace them, from 300 to 700 in hundreds. Body text and
the working sizes keep their weights, and no size moves. `text.xl` is 500 under every personality.
A title weight under 500 lightens it too, so a subheading is not heavier than the titles above it:
`text.xl` takes the title weight where its size reads at that weight, and otherwise the lightest
hundred above it that does (400 from 18px, 300 from 24px). The display steps still take 50 off the display weight at `display.lg`, so the largest
step is not the boldest, and never go under 300.

A lighter stroke needs a larger size to read at the same contrast. Every heading step is drawn in
`text.primary`, which every palette holds to Lc 75, so the schema holds each heading step's weight
to the size APCA's font lookup table gives that weight at Lc 75 (`BODY_TEXT_MIN_SIZE_PX` in
`packages/theme/src/pairings.ts`: 24px at 300, 18px at 400, 16px at 500), at the size the step
derives from the merged base and ratio. At the default base and each density's own ratio,
`text.2xl` is 27.5px or larger, so 300 is lawful there. A smaller base or a flatter ratio shrinks
the title steps: a 12px base at the standard ratio puts `text.2xl` at 23.5px, so a title weight of
300 is refused there, with a message that names the step, its size and the size the weight needs.
The personalities' own weights pass at every base and ratio the schema allows.

A font must ship the weight. In this repository, `pnpm registry` checks each weight against the
family that draws it, the heading family for `titleWeight` (the body family in a system with no
heading slot) and the display family for `displayWeight`, in the package each app installs. A static family's loader imports the weight's
file beside the three it always loads (400, 500, 600), and generation fails when the package has
no such file. A variable family's weight must lie inside the weight axis its package's
`metadata.json` declares, so Lora (400–700) cannot draw a display weight of 300. `display.lg`'s
lighter weight is not checked: a family that does not reach it draws the nearest weight it ships.
The check applies to committed systems only. A guest system admitted through `./admit` loads its
own fonts, and its application must load every heading weight the file sets.

On native platforms the weights arrive as numbers in each step's `weight` (`wght` in Swift):
SwiftUI reads 300 as `Font.Weight.light`, Compose as `FontWeight(300)`, and a Dart app passes it
to `FontWeight.w300`.

**Where the focus ring sits.** The ring is an outline at `focus.width`. The derived offset is
minus the width, so the ring lies inside the part's edge, over its border, and nothing is drawn
outside the part: a container that clips its content does not cut it. A system that sets
`focus.offset` to 0 or more moves every ring outside, with that much air. Those are the only two
places: an offset further in than minus the width would float the ring inside the control with a
gap, and one between minus the width and 0 would lay it across the edge, over the border an
invalid or selected part draws, so the schema refuses both, judged against the width the file
sets or the temperament's. The emitter writes where the ring sits as the flag `--pm-focus-place`
(`inside` or `outside`), read from the offset, and the focus convention branches on it. The
offset places the ring on most parts; two shapes adjust it in the convention
(`design/components/README.md`, the focus ring): a solid fill draws it one width further in, in
its label colour, so the fill shows on both sides; and a part that cannot hold the line, a
control too small for it or a part whose box is its text, draws it around itself, `--pm-space-1`
out or at the offset. Outside the edge, the fill's colour and gap do not apply and
the ring keeps the focus colour and the system's offset.

**Two choices.** `focus.field` and `hover.unfilled` choose between two drawings rather than change
a value:

- `focus.field: "border"` draws a focused field's ring inside its edge whatever the offset. The
  indicator is still the outline at `focus.width` in `border.focusSolid`: it lies inside the
  border box by that width, and inside an invalid field's danger border by 1px more, so the
  border stays visible. A field is Input's composite form, a textarea, Select's trigger,
  PromptInput's frame, RichTextInput's frame or OTPInput's caret cell. Under the derived offset
  every ring already lies there, so the choice changes a field only in a system that moves the
  ring outside. The default, `ring`, is the shared ring every other part draws.
- `hover.unfilled: "none"` gives Button's `outline` and `ghost` variants no wash under the pointer.
  The press still washes one step, because a control must answer the click, and a toggle that is
  on keeps its wash, because an on toggle must look on. The neutral tone's border and text changes
  stay.

Each is emitted as a flag (`--pm-focus-field`, `--pm-hover-unfilled`) that `focus.module.css` and
`button.module.css` branch on with a style query, as they branch on the exposed axis flags below.
A value token cannot carry either choice: each changes which role a rule reads, and a token that
referenced a role would keep the outer scope's value inside `[data-tone="inverse"]`. The token
document carries both as `invariant` entries, with `focus.place`. The SwiftUI and Compose members
do not read them: their fields draw the ring at the system's offset and their Buttons wash on hover
whatever the system chooses, because no native theme has a field for either choice, and they read
where the ring sits from `focus.offset` itself ([native.md](native.md)).

**Numeric columns.** `numeric.align` chooses which side of its column a numeric column's figures
sit on: `end`, the default, so the ones, tens and hundreds line up, or `start`, where the column's
label begins. It applies to every `numeric` header, body cell and total in Table, to DataTable's
`numeric` columns, and so to a Markdown table's column whose delimiter ends in `:`, which Markdown
draws as a `numeric` column. Tabular figures (`--pm-font-numeric`) stay in both. Other members that
show figures, such as Stat, Meter, NumberInput and a chart's axis, are not columns and keep their
own alignment. The choice is a keyword, not a role, so it is a value token: the emitter writes
`--pm-numeric-align` (`end` or `start`) in every pairing, and `table.module.css` sets it as the
cells' `text-align`, so every web framework and the elements follow it with no member change. The
token document carries it as the `invariant` entry `numeric.align`. SwiftUI reads it as
`theme.numeric.align` (`PMNumericAlign`), and Compose and Dart as `theme.numericAlign`; the native
Table and DataTable place their numeric headers and cells by it.

## The palette document

```json
{ "name": "verdigris", "accentHue": 178, "neutralHue": 80, "neutralTint": 0.006,
  "chromaBudget": "medium", "chartCaps": { "light": 4, "dark": 3, "published": 3 } }
```

| Field | Meaning |
| --- | --- |
| `accentHue` | OKLCH hue angle, 0–360; `polymorph theme hue "#rrggbb"` gives a colour's, in whole degrees |
| `gradientHue` | optional partner hue for the two gradient roles; absent, every gradient is a solid colour unless `pins` states where `accent.gradient` runs to |
| `neutralHue` | optional hue of the neutral ramp; absent, the neutrals take `accentHue` |
| `neutralTint` | OKLCH chroma mixed into the neutrals, 0–0.03 |
| `chromaBudget` | `none` · `ink` · `low` · `medium` · `high` — the peak chroma of the accent |
| `pins` | optional exact colours for the accent fills, their label, the focus pair and the colour the accent gradient runs to, per mode. See [Pins](#pins) |
| `moreContrast` | optional: the palette a reader who asks for more contrast gets instead. See [More contrast](#more-contrast) |
| `chartCaps` | the measured chart-series cap per mode. It is a record, not an input. See [charts.md](charts.md) |

### Pins

A brand that owns its primary button's exact colour states it in the palette, not in application
CSS. `pins` replaces a derived value with an exact one, per mode:

```json
"pins": {
  "light": { "accent.bg": "#1a73e8", "accent.bgHover": "#1765cc", "accent.bgActive": "#185abc" },
  "dark": { "border.focus": "rgb(138 180 248 / 0.5)", "border.focusSolid": "#8ab4f8" }
}
```

| Role | Accepts |
| --- | --- |
| `accent.bg`, `accent.bgHover`, `accent.bgActive`, `accent.contrast`, `border.focusSolid` | an opaque `#rrggbb` |
| `border.focus` | an opaque `#rrggbb`, or `rgb(r g b / a)` with an alpha to two decimals, as the derived ring is |
| `accent.gradientTo` | an opaque `#rrggbb`. See [The gradient's second stop](#the-gradients-second-stop) |

A fill, a gradient stop and a label are opaque because the contrast law measures a background as
drawn. A mode the palette does not name keeps every derived value, and so does every role it does
not pin. The stylesheet carries a pin exactly as stated (hex in lower case).

The pin is applied after the ramps are read and before the derived choices are made
(`packages/theme/src/color/resolve.ts`). An unpinned `accent.contrast` is therefore chosen against
the pinned `accent.bg`. The gradient's first stop is `accent.bg`, so it follows the pin too. The
contrast law never moves a pin, and holds it to the same floors as a derived value: a pinned fill
whose label measures under Lc 60 is refused with the measured value, and a pinned
`border.focusSolid` is held to the focus floor, 3:1 by the WCAG ratio, and refused with the
measured ratio. The admission report names the pin behind each fault, including the
pinned fill a derived label was chosen against. Pin the whole family when you pin one fill: a light
pinned `accent.bg` turns the derived label dark, and that label then fails on the derived hover and
pressed fills.

Pins are for the roles a brand states by value. The rest of the accent family (the washes, the
link colour, the glow, the selection) stays derived from `accentHue`, so seed the hue near the
pinned fill.

#### The gradient's second stop

`accent.gradient` runs from `accent.bg` to a second stop. Without a pin, the second stop is step 10
of the partner ramp at `gradientHue`, one step from the derived fill, so the gradient crosses two
hues at nearly one lightness. A pinned fill far from that lightness or hue can leave the label
legible at the first stop and illegible at the second: a cream `accent.bg` with a dark label on a
violet palette runs to a saturated blue, where the label falls far under the Lc 60 floor.
`accent.gradientTo` pins the second stop:

```json
"pins": {
  "light": {
    "accent.bg": "#f3e7cf", "accent.bgHover": "#ecdcbd", "accent.bgActive": "#e4d0aa",
    "accent.contrast": "#3b2a12", "accent.gradientTo": "#e2c79a"
  }
}
```

Pin it when the palette pins the accent fill and admission refuses
`accent.contrast on accent.gradient` at its `'to'` stop, or when the brand states both colours of
its gradient. The other lawful answer, dropping `gradientHue`, makes the button flat.

- The stop is not a colour role, so nothing is derived from it. It becomes the gradient's `to` and
  last stop: the stylesheet writes it in `--pm-accent-gradient` and as `--pm-accent-gradient-to`,
  and the token document and the SwiftUI, Compose and Flutter themes carry it in the gradient's
  stops.
- The contrast law measures it as it measures a derived stop: `accent.contrast` reaches Lc 60 at
  both stops, or the palette is refused. The fault names the stop and the pin, for example
  `accent.contrast on accent.gradient reached Lc 31.9 at its 'to' stop, floor is 60. The 'to' stop
  is accent.gradientTo, which the palette pins in light mode.`
- The pin gives `accent.gradient` two stops even in a palette with no `gradientHue`, or with
  `chromaBudget: none`, because the palette states both colours. `bg.wash` does not change: it has
  two stops only when the palette seeds `gradientHue` under a budget other than `none`.
- A gradient has one shape in both modes, two stops or one colour, because the SwiftUI theme draws
  one geometry with a colour per mode. A palette that derives a stop (`gradientHue` under a budget
  other than `none`) keeps it in a mode that pins none. A palette that derives none pins
  `accent.gradientTo` in both modes or in neither: the schema refuses it in one mode only.
- The solid accent Button draws the gradient over its fill, and keeps it under the pointer and on
  press, with the glow and the press transform as feedback
  ([button.md](../design/components/button.md)). The hover and pressed fills lie under the
  gradient in the stylesheet, so a palette with no `gradientHue` that pins the stop gives up their
  colour change for the glow.

## The colour engine

The engine turns seeds into twelve-step OKLCH ramps and picks named roles from the ramps. The
contrast law then checks and repairs the result (`packages/theme/src/color/`).

### Ramps

Every colour is a (ramp, step) pair, and each step has a fixed meaning:

| Steps | Use |
| --- | --- |
| 1–2 | app and subtle backgrounds |
| 3–5 | component rest, hover, active |
| 6–8 | subtle, default, strong borders |
| 9–10 | solid fill and its hover |
| 11 | solid fill active, low-contrast text |
| 12 | high-contrast text |

A ramp combines a lightness ladder (fixed per mode) with a chroma curve at one hue. The chroma
curve peaks at steps 9–10 and tapers at both ends, so near-white and near-black surfaces look like
tinted neutrals rather than pale brand colour. The palette's budget sets the peak:

| `chromaBudget` | `none` | `ink` | `low` | `medium` | `high` |
| --- | --- | --- | --- | --- | --- |
| peak chroma | 0 | 0.035 | 0.09 | 0.15 | 0.21 |

Colours are brought into sRGB by reducing chroma, never lightness. Opaque colours are emitted as
hex, so the value the law measures is byte-for-byte the value the browser paints.

Each pairing generates, per mode: `neutral` (at `neutralHue`, `neutralTint`, an almost flat
chroma curve), `tinted` (the surface wash `tinted` systems use), `accent`, `gradient` (at
`gradientHue`, or the accent hue), and four status ramps.

### Roles

Application and component code use roles, never ramps or steps. There are 72 colour roles, each
emitted as `--pm-<role>` with dots and camelCase turned into dashes (`accent.bgHover` →
`--pm-accent-bg-hover`):

| Group | Roles |
| --- | --- |
| Background | `bg.app`, `bg.subtle`, `bg.surface`, `bg.raised`, `bg.overlay`, `bg.scrim`, `bg.inverse` |
| Accent | `accent.bg`, `.bgHover`, `.bgActive`, `.subtle`, `.subtleHover`, `.subtleActive`, `.text`, `.underline`, `.contrast`, `.glow` |
| Text | `text.primary`, `.secondary`, `.muted`, `.disabled`, `.inverse` |
| Border | `border.subtle`, `.default`, `.strong`, `.field`, `.focus`, `.focusSolid` |
| Status | `danger`, `warning`, `success`, `info` × `solid`, `solidHover`, `solidActive`, `subtle`, `subtleHover`, `subtleActive`, `text`, `border`, `contrast`, `glow` |
| Selection | `selection.bg`, `.bgHover`, `.text`, `.border`, `.surface`, `.surfaceHover` |

Two **gradient roles**, `accent.gradient` and `bg.wash`, resolve to a `linear-gradient` when the
palette seeds `gradientHue` and to their base colour (`accent.bg`, `bg.app`) otherwise.
`accent.gradient` is also a `linear-gradient` when the palette pins its second stop
([The gradient's second stop](#the-gradients-second-stop)). A recipe therefore never needs to
check whether gradients exist. The **chart roles** (`chart.1`…`chart.8`, sequential, diverging)
are a separate family, documented in [charts.md](charts.md).

### Neutrals, status hues and the ink budget

- **Neutrals carry a little of the accent hue.** The neutral ramp uses `neutralHue` (the accent
  hue unless seeded) with at most 0.03 chroma. Above that, the neutrals no longer look neutral.
  Seeding `neutralHue` away from the accent gives, for example, warm stone greys under a teal
  accent.
- **Status hues are fixed**: danger 25°, warning 75°, success 150°, info 240°. Their chroma follows
  the palette's budget so the four match the accent's intensity. It is scaled 1 / 1 / 0.82 / 0.95,
  because green looks stronger at equal chroma. It never drops below the `low` peak, because a
  warning faded to grey no longer works as a warning. Each status family is structured like the
  accent family.
- **`chromaBudget: none`** has no accent hue. The accent family is taken from the neutral ramp, so
  the primary colour is ink. Its fills invert with the mode: ink in light, near-white in dark.
  Gradients resolve to solid colours, except an accent gradient whose second stop the palette
  pins, and status colours keep their chroma.

### The contrast law

Every (text, surface) combination a pairing may produce is enumerated in `LAWFUL_PAIRINGS`
(`packages/theme/src/pairings.ts`) and measured in both modes. Text is measured with **APCA**
(`packages/theme/src/color/apca.ts`, the published formula) on the rounded sRGB channels, with a translucent foreground composited over its
background first. Each floor is an |Lc| magnitude:

| Floor | Lc | Applies to |
| --- | --- | --- |
| body text | 75 | `text.primary` on every text-bearing background and selected surface; `text.inverse` on `bg.inverse` |
| secondary text | 60 | `text.secondary`, `accent.text`; status and accent text on their subtle washes (rest, hover, pressed); `selection.text` on `selection.bg`/`.bgHover` |
| muted text | 45 | `text.muted` |
| on a solid fill | 60 | `accent.contrast` and `{tone}.contrast` on their fills at rest, hover and active |

The text-bearing backgrounds are `bg.app`, `bg.subtle`, `bg.surface`, `bg.raised` and `bg.overlay`.
The selected surfaces, `selection.surface` and `selection.surfaceHover`, hold `text.primary`,
`text.secondary`, `text.muted` and `accent.text` at the same floors, because a selected row or bar
holds content of its own. `selection.bg` holds `selection.text` only.
In a system with no hue the selected surface is a neutral wash, the same at rest and under the
pointer. A law holds it ΔL ≥ 0.025 in OKLCH from every text-bearing background
(`INK_SELECTED_MIN_DELTA_L`, `packages/theme/src/color/role-map.ts`), so a selected row can be
told from the surface it sits on and from a hovered row, whose fill is `bg.subtle`. One step of
the light ladder is 0.015, so the wash sits two steps past the deepest background in light mode
and one step past it in dark mode, where a step is 0.03 or more. The wash bears text, so in light
mode it goes no deeper than the temperament's text can be read on: step 6, and step 5 for `soft`.
That bound leaves one case under the floor. A `soft` system with the `tinted` colour strategy has
its hover fill at step 4, so on a palette with no hue its selected surface is one step from its
hover fill, ΔL 0.015. The law declares that case and holds it to a different colour.
**Hairlines** (`border.default`, `selection.border` and the link's rest underline) are judged by
lightness separation instead: ΔL ≥ 0.04 in OKLCH, measured on the composite. APCA is not used for
hairlines, because it models text and scores a visible hairline as exactly zero.

**The focus colour** (`border.focusSolid`) is the colour of the focus ring, a 2px line, so the
colour carries it. It is held to **3:1 by the WCAG contrast ratio** (`FOCUS_MIN_RATIO`,
`packages/theme/src/pairings.ts`), WCAG 1.4.11's floor for a component's visual state, on every
text-bearing background and on every wash a focusable part fills with (`FOCUS_WASHES`): the
accent and status washes at rest, hovered and pressed, and the selected surfaces. The ring is
drawn inside a part's edge, on the part's own background, so the wash counts as well as the
surface behind it. The layout measure (`apps/workbench/src/screen/measure.ts`) reports a focus
mark under the same 3:1 as faint. A part with a solid fill draws the ring in its label colour,
inside the fill with a gap, which the on-solid floor already holds on the fill. The colour is held
whichever field style a system chooses, and a pinned focus colour is held like a derived one.

The focus colour is derived so that every shipped pairing passes with no pins. A hued system
starts at the accent's solid, step 9 of the solid ladder, and moves along that ladder (steps 10,
11, 12) to the first step that passes in both modes, so the ring is one colour in either mode, as
the fills beside it are. Where no step does (a `stark` system's dark washes can leave none), each
mode moves from step 9 along its own ladder, which darkens in light mode and lightens in dark
mode. An ink system draws the ring in the off-ladder `ring` grey (`RING_LIGHTNESS`,
`packages/theme/src/color/role-map.ts`): the reference's two ring greys, L 0.556 in light mode
and L 0.708 in dark mode, the other way round from the reference, which draws them at half alpha.
`border.focus`, the half-alpha focus colour, is held by lightness separation, ΔL ≥ 0.08
(`FOCUS_MIN_DELTA_L`) on every text-bearing background. Nothing in the vocabulary draws in it: it
stays a token and a pin for a palette that pins the pair and for a part an application draws in a
translucent focus colour. `text.disabled` is the one declared exemption. It uses WCAG's
incidental-text exemption, because disabled text must look unavailable.

During resolution, a failing foreground is moved away from its background in 0.01 lightness steps,
up to 0.08. A translucent role increases its alpha instead. The border family moves together, so
its order cannot invert. If that is not enough, resolution throws `ContrastLawError` naming the
pairing, and the pairing is not emitted. A pinned role is never moved, and a mode with pins does
not throw: admission reports each failing pairing with its measured value instead.

The law makes three further measurements:

- **Gradients** — text on `accent.gradient` or `bg.wash` must clear its floor at the worse of the two
  stops, a pinned stop included.
- **Glass** — under `depth: glass` the pane is `bg.surface` mixed at 96% (light) / 91% (dark), and
  every text pairing must hold with the pane composited over pure black *and* pure white.
- **WCAG 2.1** is measured alongside APCA in `laws.test.ts`. `text.primary` and `text.inverse` clear
  4.5:1 on every surface in every pairing. Secondary, muted, tonal text and on-solid labels may fall
  below 4.5:1 where APCA and WCAG disagree, but never below 3:1. The test lists the roles allowed to
  diverge, so adding a role means editing the test and giving a reason.

## Light and dark

A pairing is authored once and **derived twice**, once per mode. Dark mode is derived from the same
inputs. It is not an inversion of the light values and not a second hand-maintained palette:

- **Every ramp is regenerated on the dark lightness ladder.** The two ladders are not mirror images.
  On white, APCA leaves four usable text steps (9–12). Light-on-dark contrast rises more slowly, so
  the dark ladder compresses its surface range (steps 1–5) and gives the space to steps 9–12. This
  keeps three levels of text and three of border.

  | | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
  | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
  | light L | 1 | 0.985 | 0.97 | 0.955 | 0.94 | 0.922 | 0.88 | 0.83 | 0.62 | 0.588 | 0.556 | 0.145 |
  | dark L | 0.145 | 0.175 | 0.205 | 0.245 | 0.285 | 0.33 | 0.4 | 0.5 | 0.68 | 0.76 | 0.84 | 0.985 |

- **In dark mode, lightness shows elevation.** In light mode, the page and its surfaces share step 1
  and shadows show elevation. In dark mode, `bg.app` → `bg.overlay` rise through steps 1 → 5.
  Shadows use the same black alpha in both modes and are a secondary cue in dark mode.
- **Borders are built differently per mode.** Light borders are opaque neutral steps. Dark borders
  are the light ladder's lightest neutral step at 6% / 10% / 15% alpha.
- **Solid fills do not change with the mode.** Accent and status fills come from the light ladder
  in both modes, so a brand button is the same colour in dark mode. They do not use the dark
  ladder, because its steps 9–11 fall in a lightness band where neither a black nor a white label
  reaches Lc 60. The `none` budget is the exception: its ink fills invert.
- The scrim is the darkest neutral at 40% (light) / 60% (dark) alpha, raised for `flat` and
  `borders` depth. The scrim law holds what it does in every pairing: it never lightens the page,
  the page's body text behind it falls below the secondary-text floor, and the panel stands at
  least as far from the scrimmed page as from the page. In dark mode the page is already the
  darkest neutral, so the scrim dims what is on the page rather than the page itself. Page
  textures and the glass mix are chosen per mode.

`[data-tone="inverse"]` takes the opposite mode's values for every role that differs between modes.
This is how an inverted panel works without a second palette.

## Runtime

### Emission

`emitThemeCSS(resolved)` turns one resolved pairing into one deterministic block of `--pm-*`
custom properties (snapshot-tested in `emit.test.ts`), structured as:

| Rule | Declares |
| --- | --- |
| `[data-system="s"][data-palette="p"]` | everything but the references in the next row: axis flags, fonts, type, radii, the radius and shadow class assignments, shadows, material, texture, focus, hit target, icons, z-ladder, the system's own density and motion temperament, and colours in its default mode |
| `[data-system="s"][data-palette="p"]`, `:where(…) :is([data-density], [data-mode])` | the tokens that are references to a density's spacing or a mode's roles: the inset classes, the glows and the shell surfaces. A `var()` in a custom property is resolved where it is declared, so they are declared again on every density and mode scope, and resolve against its values |
| `… [data-density="compact\|standard\|comfortable"]` | space and control heights |
| `… [data-motion="none\|subtle\|standard\|expressive"]` | motion tokens |
| `… [data-mode="light\|dark"]` | colours, gradients, chart roles, glass surface, and the texture when it differs between modes |
| `… [data-mode] [data-tone="inverse"]` | the opposite mode's differing colours |
| `@media (prefers-contrast: more), (forced-colors: active)` | the more-contrast partner's colours under the selectors above, when the palette names one |
| `@scope (pairing) to ([data-system][data-palette])` | declared member exceptions, if any |

Every scoped rule is written twice: once for the element that carries the pairing, and once as
`:where(pairing) [data-…]` for any descendant. The second form lets nested scopes work by attribute
alone. Components read `var(--pm-*)` and know nothing about axes, ramps or modes.

### Installing

A pairing's CSS reaches a page in one of two ways. Both split it the same way. An **eager** sheet
holds every system with its own default palette. Any **cross-pairing** (a system with another
palette) is loaded the first time it is chosen. One sheet with every combination would be the
palette count times larger, mostly with pairings nobody chose.

**Compiled at build time.** This is the path for an application. The Vite plugin `polymorphTheme`
(`@polymorph/engine/vite`, `packages/engine/src/vite.ts`) admits every listed system × palette when
Vite builds and fails the build on a law fault. It emits the eager stylesheet, imported by
`virtual:polymorph/theme`, and one small sheet per cross-pairing, loaded by that module's
`ensurePairing(system, palette)`, which returns a Promise. `polymorph add theme:<system>` does the
same at install time. It writes `themes/theme.css`, `themes/pairings/` and a `themes/index.ts` that
exports `installThemes()` and `ensurePairing()`. On either path, the application's theme code is
only `@polymorph/engine/runtime`: the switching and pre-paint functions below, with none of the
theme engine's derivation code (no zod, no culori). See [consuming.md](consuming.md).

**Admitted at run time.** This is for a theme that no build can know, such as one per tenant:

- `installThemeCSS(css)` puts the sheet in a single `<style id="pm-themes">`, prepended to `<head>` so
  application CSS outranks it. Calling it again replaces the content.
- `appendThemeCSS(css, pairId)` adds one more pairing's block, once per id, directly after that
  sheet. `hasPairingCSS(pairId)` checks whether it is already there.

This path ships the theme engine to the browser: `zod`, `culori` and the derivation code. The
`runtime-engine` size fixture holds that cost under 54 kB of gzipped JavaScript (`pnpm size`,
[verification.md](verification.md#size-budgets)). The workbench and docs apps use it. The workbench
needs it because its studio re-derives a pairing while it is edited. Both apps install the eager
sheet (`emitThemesCSS`) before React mounts and append a cross-pairing through an app-level
`ensurePairing`. `apps/workbench/src/themes.ts` and `apps/docs/src/themes.ts` find every file in
`design/systems/` and `design/palettes/` by glob, so a new file needs no code.

### Switching

Switching changes an attribute on `<html>`. The CSS for every scope is already present, so nothing
re-renders. The runtime writes the attribute and stores the choice. It is
`packages/theme/src/runtime.ts`, the only module in the package that touches the DOM, and an
application imports it as `@polymorph/engine/runtime`:

| Call | Attribute | Storage key |
| --- | --- | --- |
| `setSystem(name)` | `data-system` | `pm-system` |
| `setPalette(name)` | `data-palette` | `pm-palette` |
| `setMode('light' \| 'dark' \| 'system')` | `data-mode` (`system` follows `prefers-color-scheme` live) | `pm-mode` |
| `setDensityDefault(density \| null)` | `data-density` | `pm-density` |
| `setMotionTemperament(t \| null)` | `data-motion` | `pm-motion` |

`setSystem` also moves the mode of a reader who has not chosen one to the new system's
`defaultMode`, and stores no mode. A mode the reader chose stays.

Install the pairing's block before changing either attribute. On the compiled path, await
`ensurePairing(system, palette)` first. Otherwise the document carries a pair that no block
matches, and no theme values apply. This is deliberate: no rule matches a system or a palette on
its own, because one half is not a complete theme.

### Offering the mode

The mode has three choices, `light`, `dark` and `system`, and every page that offers one offers
all three. A settings row or a toolbar holds a `ModeSwitch`, which shows the document's
preference and applies a press with `setMode`. An application that saves the choice on its
server passes `value` and applies the choice itself ([mode-switch.md](../design/components/mode-switch.md)).

An account Menu or the command palette offers the same choice as entries. `readMode()` gives the
preference and the mode it resolves to, and `watchMode(listener)` calls back after each `setMode`
and each change of the operating system's mode while `system` is applied. Each foundation wraps
the two as `useMode` ([frameworks.md](frameworks.md#the-colour-mode)), so an entry marks the
current choice and follows a change made by a ModeSwitch or another entry. In React, the Menu's
entries:

```tsx
const { preference } = useMode()

const appearance: MenuEntry[] = MODE_PREFERENCES.map((choice) => ({
  kind: 'checkbox',
  label: words[choice], // the application's words: "Light", "Dark", "System"
  checked: preference === choice,
  onCheckedChange: (checked) => {
    if (checked) setMode(choice)
  },
}))
```

The command palette lists the choices the page does not wear:

```tsx
const items: CommandItem[] = MODE_PREFERENCES.filter((choice) => choice !== preference).map(
  (choice) => ({
    id: `mode-${choice}`,
    label: commands[choice], // "Use dark mode"
    icon: `mode-${choice}`,
    group: 'Appearance',
    onSelect: () => setMode(choice),
  }),
)
```

`getModePreference()` is the preference the document wears: the one the last `setMode` applied,
or the worn system's `defaultMode` that hydration applied when nothing is stored, and before
either the stored one. So a ModeSwitch on a first visit to a page wearing a system whose default
is `dark` shows Dark, and one on a page wearing a `system` default shows System. A server stores
none and knows no device, so a server render reads `system` and `light` (`SERVER_MODE`) whatever
the system's default. React's, Vue's and Solid's `useMode` read the same while their framework
hydrates the server's markup, so a ModeSwitch or an entry hydrates with no mismatch, and then
read the document: under a `dark` default, `dark` and `dark`.

### Reading the theme as data

A member reads the theme through the cascade. A component from another library often cannot: a
map takes its colours in an options object, and a canvas grid in a theme parameter.
`readThemeValues(element?)` in `@polymorph/engine` gives the values an element resolves to, as the
strings and numbers a JavaScript API takes. It reads the custom properties already on the page, so
it sees a `<DensityScope>`, a `<ToneScope>` or a nested pairing around the element, and it costs
no theme engine in the bundle.

| Reader | Returns |
| --- | --- |
| `color(role)` | `#rrggbb`, or `rgba(r, g, b, a)` for a translucent role. `channels(role)` returns the same colour as four numbers. A chart role (`chart.1`) reads the same way. |
| `space(step)`, `radius(step \| class)`, `controlHeight(size)` | pixels, at the density the element is in. A radius class is `control`, `surface` or `detail`. |
| `text(step)` | `{ family, size, lineHeight, weight, tracking }`, sizes in pixels |
| `font(role)` | a font slot's family list |
| `duration(role)` | milliseconds |
| `value('--pm-…')` | any other token, as the text the cascade resolved |
| `mode`, `direction`, `themed` | `'light'` or `'dark'` where the element is drawn, the document's reading direction, and whether a pairing reaches the element at all |

`watchTheme(listener)` calls back when a reading would differ: a change to the pairing, the mode,
the density or the motion attribute anywhere in the document, an element entering or leaving an
inverse tone, a pairing's stylesheet installed, installed again or removed, the reader's contrast
preference, or the reading direction. A member writes `data-tone` and `data-mode` for variants of
its own, such as a Text's `danger` or a BarChart's `stacked`. The theme's sheet matches none of
those values, so they do not call back. Each foundation wraps the two as `useThemeValues`, which
returns the values and stays current ([frameworks.md](frameworks.md#another-librarys-component)).
On a server render `themed` is false, every colour is the empty string and every number is 0.

A reading is a snapshot: it keeps each token, the mode and the direction as it first read them.
The browser resolves no token for an element that is not in the document, so a reading from one
is the document root's, and a reading follows its element out when the element is removed.
`themeVersion()` is a number that grows whenever a reading may be out of date, which is each time
`watchTheme` calls back and when it takes its first listener, because nothing watched before
that. A store that keeps a reading compares the number while it holds a listener. Code that holds
no listener calls `readThemeValues` again.

[rules.md](rules.md#rung-4-another-librarys-component) describes the boundary a hosted component is
declared in.

### More contrast

A palette may name the palette a reader who asks for more contrast gets instead:
`"moreContrast": "tide-strong"`. The partner is an ordinary palette document, lawful on every
system. The emitter writes its colours into the naming pairing's own block, under
`@media (prefers-contrast: more), (forced-colors: active)` and the same selectors as the blocks above
it: the colour, gradient and chart roles and the glass surface, for the fallback mode, each mode and
each inverse region. Every other token is the system's and stays. The partner's colours follow the
reader's setting the way `setMode('system')` follows the colour scheme, but with no script: the
query matches before first paint, changes live, works in a nested pairing and arrives with a
lazily loaded cross-pairing, because it is part of that pairing's sheet.

Forced colours are in the query because the browser replaces most colours then, and whatever it
leaves (an image layer, an SVG fill) is drawn from the partner. Every focus indicator is an outline,
which forced colours keep; a `box-shadow` they drop is only ever a decorative glow or the seat.

`admitTheme({ system, palette, moreContrast })` admits the partner with the pairing: the partner
document must be the one the palette names, every colour law runs on the partner pairing too, and
its faults carry its own pair id. A palette that names a partner is refused without the partner
document, with a `schema` fault, because its block would have no query and nothing else would say
so. Each caller passes the partner:

- the build-time plugin, from `palettes`; it fails the build when the palette names one that is
  not listed;
- `polymorph theme validate|emit`, from a third path, or from the file named for the partner
  beside the palette;
- a vendored install, which installs the partner with the palette;
- the MCP's `save_theme`, from the `palettes` directory it saves into, so the partner is saved
  first;
- an emitter of its own catalogue, such as the workbench, through
  `moreContrastOf(system, palette, palettes)`, whose result is `emitThemeCSS`'s options.

To offer the choice inside the application as well, switch to the partner with `setPalette`: it is
a palette like any other.

The partner reaches the web only. A native app reads one pairing's token document, which names no
partner, and no SwiftUI or Compose member reads the platform's contrast setting.
[native.md](native.md) says what an iOS app does instead.

### Before first paint

`PREPAINT_SCRIPT` is a one-line script to inline at the top of `<head>`, before any stylesheet.
`runtime.test.ts` keeps it under 500 bytes. It applies the stored system, palette, density and
motion, and resolves the mode, so the first paint is already correct. It knows no system, so a
reader who stored no mode gets the device's mode. It does no validation, so that it stays small.

`prepaintScript({ modes, system })` builds the same script for a page that knows its systems'
default modes. `modes` maps each system to its `defaultMode`, as `InstalledCatalogue.modes`
does, and the script carries the systems whose default is `light` or `dark`. `system` is the
fallback `hydrateTheme` is given. With nothing stored, the script applies the default of the
worn system: the stored one, else the one the page's markup writes on `<html data-system>`, else
`system`. That is the mode hydration then applies, so a page whose system opens dark does not
paint light first. With no system whose default is `light` or `dark` it returns
`PREPAINT_SCRIPT`. Each such system adds its name and mode, and `runtime.test.ts` holds the
script built for the house catalogue to 600 bytes.

Each place that writes the script for a page builds it with the systems it knows:

| Where | What it is built with |
| --- | --- |
| the build-time plugin, `@polymorph/engine/vite` | the listed systems and `defaultSystem`; it inlines the script next to the default `data-system` and `data-palette` it writes on `<html>` |
| `polymorph add theme:<system>` and `polymorph update` | the installed systems, read from the application's copies of their documents, and the first as the fallback; it patches the script into `index.html` and writes it as `themes/prepaint.ts`, for a root layout that has no `index.html` |
| `polymorph init --framework elements` and `prepaint.js` | the house systems; the page names its pairing on `<html>` |
| the workbench and the docs site (`vite.config.ts`) | the house systems and `design/defaults.json`'s system |

A page whose themes arrive at run time inlines `prepaintScript` with the systems it can know
before any script runs, or `PREPAINT_SCRIPT`, which follows the device.

`hydrateTheme(fallbackSystem, installed)` runs once on mount. It re-attaches the
`prefers-color-scheme` listener and checks the stored names against what is installed. It
applies the stored mode, or with none the worn system's default from `installed.modes`, which it
does not store. A catalogue without `modes` gives every system `system`. A stored
system that is not installed is replaced by the fallback system with its default palette, and the
stored palette is cleared. A stored palette that is not installed is replaced by the current
system's default. Fallbacks are never written to storage. Only an explicit
`setSystem`/`setPalette` stores a preference. A value under the older single key `pm-theme` is
migrated once.

### Nested theme scopes

A subtree can use a different pairing or mode, for example a preview pane, an inverted marketing
band or an embedded surface:

```tsx
<div data-system="journal" data-palette="umber" data-mode="dark">…</div>
```

This replaces **every theme decision** for the subtree. The element's own pairing wins over the
one it sits inside. Its compound selector has three attributes, while the ancestor's descendant
form has one, because the pairing prefix is inside `:where()`. Put `data-mode` on the element too.
Without it, the nested pairing applies its own `defaultMode`, with `system` read as light. Install the pairing's block first.
Portaled surfaces (menus, dialogs) render outside the subtree and use the page's pairing.

### Contextual scopes, not overrides

Within one pairing, a subtree can select a different *variant* of the same decisions, with the
contextual scopes, which every web renderer's vocabulary holds (rung 2 of the
[exception ladder](rules.md#rung-2-contextual-scopes)):

- `<DensityScope value="compact">` sets `data-density`. It changes space and control heights
  only, never the type scale, so a dense table does not change the page's text sizes.
- `<ToneScope value="inverse">` sets `data-tone="inverse"`, which applies the opposite mode's
  surfaces, text and borders.

The emitter writes the same descendant form for `data-motion`. A scope only chooses among values
the emitter has already derived and the laws have already checked. An override is different: it
would change one decision without the others being derived with it. Application code has no style
props to override with. The supported way to adjust one instance is an
[instance patch](rules.md#rung-3-instance-patches).

### Recipes never name a pairing

Vocabulary CSS may not select `[data-system]`, `[data-palette]` or the older `[data-theme]` in any
form (Stylelint `polymorph/no-theme-selectors`), and may not select `data-member` (only the
emitter's exception blocks do, `polymorph/no-member-selectors`). A recipe that depended on which
system it was in would need hand-written CSS for every new system. A difference between systems is
expressed as a token value or, for the three exposed axes, a style query on the axis flag.

## The token document

The stylesheet is for browsers. Its values are strings a browser resolves: `var()` references,
`box-shadow` lists, `linear-gradient(…)`, SVG data URIs, and scopes the cascade selects between.
A SwiftUI, Compose or Dart emitter cannot read them. `emitTokenDocument(resolved, { platform })`
(`packages/theme/src/emit-tokens.ts`) gives the same decisions as plain JSON, with every value
structured and every reference resolved. `emitTokenDocumentJSON` returns it as text, and the same
pairing and platform always give the same bytes. `TOKEN_DOCUMENT_SCHEMA` (zod) and
`tokenDocumentJsonSchema()` describe it with every key named. The CSS emitter does not read the
document; both read the resolved theme.

| Key | Holds |
| --- | --- |
| `format` | `polymorph-tokens/1` |
| `platform` | `web`, `ios`, `android` or `dart` |
| `pairing` | name, system, palette, kind, all eight axes, default mode, chart cap |
| `fonts` | per slot, `heading` included (the body slot's values in a system that states none): the family without Fontsource's `Variable` suffix, whether the seed is the variable build, the fallback class, the style, every weight a type step sets, and for display every optical size |
| `floor` | the platform's floors, `controlHeight` (the web's 24, on every platform) and `hitTarget` (the platform's minimum hit area), and `raised`: each value a floor raised, by density, with the derived and raised values |
| `invariant` | every token no scope changes: type, radii and their classes, shadows and their classes, the top highlight, material, focus ring and where it sits, the field focus and unfilled hover choices, icons, z-ladder |
| `density` | per density: space, control heights, hit target, container insets |
| `motion` | per temperament: durations, ambient periods and stagger in milliseconds, easings as cubic-bezier control values, springs with their damping ratio, press scale |
| `mode` | per mode: colour, gradient and chart roles, glows, shell surfaces, page texture, glass surface |
| `inverse` | per mode: the roles `[data-tone="inverse"]` borrows from the other mode, as the stylesheet's inverse blocks do |
| `exceptions` | each declared member exception, with its target resolved |
| `unsupported` | token paths the platform cannot draw |

Inside a section, keys are token paths without the `--pm-` prefix, so `cssVarName(key)` is the
property a browser reads. Keys that start with a digit (`space.0`, `chart.1`, `text.2xl`) stay as
they are, and a platform emitter renames them. Values are structured:

- Lengths are `{ value, unit }` in the stylesheet's unit. A CSS px equals an iOS point, an Android
  dp and a Flutter logical pixel. Type sizes stay in `rem` with their `px` at the 16px base beside
  them; tracking is in `em`.
- Colours are `{ hex, alpha, r, g, b }` in sRGB, exactly the value the stylesheet ships.
- Shadows, glows and the top highlight are lists of layers, `{ x, y, blur, spread, color, inset }`
  in px. An empty list is `none`.
- Gradients carry `angle` in degrees and their `stops`. Without a partner hue or a pinned stop a
  gradient is `solid`, with two equal stops. `solid` is the same in both modes.
- The page texture is its parameters: `{ kind: 'grain', alpha, tile, baseFrequency, octaves }` or
  `{ kind: 'grid', alpha, tile, stroke, strokeWidth }`, or `{ kind: 'none' }`.
- Numbers are exact, as the engine computes them, a spring's damping ratio included; a platform
  emitter rounds as it prints.
- A reference is resolved, and the path it names is kept in `ref`. A reference whose target varies
  by scope is resolved in that scope's section: container insets in each density, shell surfaces
  and glows in each mode.

```json
"radius.control": { "ref": "radius.md", "value": 8, "unit": "px" },
"shadow.insetTop": { "layers": [{ "x": 0, "y": 1, "blur": 0, "spread": 0, "inset": true,
  "color": { "hex": "#ffffff", "alpha": 0.12, "r": 255, "g": 255, "b": 255 } }] },
"motion.spring.default": { "stiffness": 300, "damping": 30, "mass": 1,
  "dampingRatio": 0.8660254037844386 }
```

### Platforms and floors

`PLATFORM_FLOORS` (`packages/theme/src/platforms.ts`) holds the smallest control height and hit
target each platform's guidance allows:

| Platform | Control height | Hit target | Source of the hit target |
| --- | --- | --- | --- |
| `web` | 24 | 24 | WCAG 2.2, 2.5.8 Target Size (Minimum) |
| `ios` | 24 | 44 | Apple Human Interface Guidelines |
| `android` | 24 | 48 | Material Design touch targets |
| `dart` | 24 | 48 | Flutter's `kMinInteractiveDimension`, which meets both phone platforms |

Each platform's minimum is a hit area, not a visual height, so it floors the hit target only.
The document raises the hit target to the platform's floor at every density and lists each in
`floor.raised`, with the 24 it was derived as. A control's height is the density's on every
platform: the iOS document's controls are the heights the stylesheet draws, 28 to 46 points
across the house pairings' three densities, so densities stay apart on a phone. Their floor is
WCAG's 24, which the
derivation keeps every control at or above at every density (`systems.ts` refuses an amended
ladder that does not), so no document raises a height. On the web nothing is raised at all.

The hit target is the minimum pressable size: the stylesheet emits it as `--pm-hit-target`, 24px,
and a pressable element drawn smaller than that extends its hit area with a pseudo-element to at
least it: to `--pm-hit-target` itself (Carousel's dots), or to `--pm-control-height-sm`, which
the derivation keeps at or above it at every density (Checkbox, Switch, a chip's remove button).
It is the same at every
density, because density changes how large a control looks, never the smallest target a pointer
or finger has to hit, so the stylesheet declares it once, in the pairing's base block. The
document gives it per density so a platform emitter reads it with the control heights. A native
member does what a web member does: one shorter than `hitTarget` extends its hit area to it and
keeps its drawn height. In SwiftUI that is `.contentShape` over a frame of at least `hitTarget`;
in Compose, `Modifier.minimumInteractiveComponentSize()`; in Flutter, a padded tap target such as
Material's `MaterialTapTargetSize.padded`.

**Unsupported.** On `ios`, `android` and `dart`, `unsupported` lists `texture.page`. The
stylesheet draws the texture as an SVG tile with a noise filter, which no native toolkit renders.
The document still carries its parameters, so an emitter may draw it, and a law can read the list.

**Parity.** `laws.test.ts` checks, for every system × palette, that the stylesheet's property names
and the document's paths are the same set. Four names are CSS-only, each with its reason in the
law: the three axis flags (`--pm-axis-*`, style-query flags; the document carries every axis in
`pairing.axes`) and `--pm-icon-stroke` (an alias of `icon.stroke.md` for component CSS that expects
one stroke value). A second law checks, in every document on every platform, that the hit target
is at least the platform's floor, and that every control height is at least 24 and is the
derivation's own value, unchanged.

### Swift

The Swift package's `PolymorphTokens` library is the token half of native rendering on iOS;
[native.md](native.md) covers the rest, including the package's `PolymorphUI` library.

`platforms/ios` is a Swift package (iOS 17, macOS 14) whose `PolymorphTokens` library holds the
house pairings as Swift values. Each system with its default palette, the set the web stylesheet
loads eagerly, is one `PMTheme` static: `PMTheme.plain_neutral`, `PMTheme.terminal_petrol`.
`PMTheme.catalogue` lists them and `PMTheme.named(system:palette:)` finds one. `PMTheme.default` is
the web's default pairing, the system `design/defaults.json` names with its default palette, which
`pnpm emit:native` passes to `emitSwiftFiles` as `defaultPairing`. `emitSwift(resolved)`
(`packages/theme/src/emit-swift.ts`) writes them from the token document for `ios`, so the values
are the stylesheet's decisions with iOS's floor applied: the hit target is 44 points, and control
heights are the density's.

An app adds the package by this repository's URL, at a release tag:
`.package(url: "https://github.com/metamorph-labs/polymorph", from: "1.0.18")` in `Package.swift`,
or the URL in Xcode's package dialog. SwiftPM resolves a git URL only to a repository with
`Package.swift` at its root, so the root manifest declares the libraries over the sources in
`platforms/ios`. An app with a checkout can depend on `platforms/ios` by path instead
([consuming.md](consuming.md#an-ios-app)). A view reads tokens as values:

```swift
import PolymorphTokens

let theme = PMTheme.plain_neutral
let density = theme.defaultDensity // the density the system's axes select

Text("Save")
  .pmTextStyle(theme.text.md)
  .foregroundStyle(theme.colors.accentContrast.color)
  .padding(.horizontal, density.space.s4)
  .frame(minHeight: density.controlHeight.md)
  .background(theme.colors.accentBg.color, in: .rect(cornerRadius: theme.radius.control))
  .frame(minWidth: density.hitTarget, minHeight: density.hitTarget) // the hit area
  .contentShape(.rect)
```

`theme.colors.accentBg` is a `PMDynamicColor`: the role's light and dark sRGB channels, exactly as
the stylesheet ships them. Its `color` is built on `UIColor(dynamicProvider:)` (on macOS,
`NSColor(name:dynamicProvider:)`), so it resolves by the colour scheme of the environment it is
drawn in. Glows, gradient stops, shell surfaces and the glass surface are dynamic the same way.
Lengths are points (a CSS px is an iOS point), type sizes are rem × 16, tracking is in points,
durations are seconds, easings are cubic Bézier control points (`curve` reads one as a
`UnitCurve`), and springs are stiffness, damping and mass (`spring` reads one as a SwiftUI
`Spring`).

**Names.** A member is its token path below its group, camelCased: `accent.bgHover` is
`colors.accentBgHover` and `shell.topbar.bg` is `shell.topbarBg`. A name that would start with a
digit takes its group's name in front, or `s` on the space ladder: `chart.1` is `chart.chart1`,
`chart.seq.1` is `chart.seq1`, `text.2xl` is `text.text2xl`, `space.0` is `space.s0`. A Swift
keyword is renamed: the `default` spring is `spring.base`. `swiftMember` is the rule, and a
keyword it has no rename for fails the emitter instead of being escaped, as do two paths that
would share a member in one struct (`swiftMembers`). The icon sizes and strokes
are `theme.icon`, a `PMIconScale`: `PMIcon` is the vocabulary member `Icon` in `PolymorphUI`, and
an app imports both libraries.

**Not emitted.** The page texture is in `PMTheme.unsupported` and nowhere else; the emitter
refuses a document that does not list it. The `inverse` table: on the web, `[data-tone="inverse"]`
re-declares the colour and chart roles alone, and gradients, glows, shell surfaces and the glass
surface keep the outer scope's value. A SwiftUI subtree under `.environment(\.colorScheme, …)` set
to the other scheme swaps every dynamic value, those four included, so a renderer that draws the
web's inverse tone resolves the colour and chart roles in the opposite scheme
(`color.resolved(in:)`) and nothing else; the document's `inverse` table lists them. `floor` is
not emitted either: the values already meet it, and `floor.raised` is the document's record of
what the floor changed, not a token. A law in `emit-swift.test.ts` fails when a token in the
document reaches no Swift value and has no stated reason.

**Generated files are committed.** `PMTheme.swift`, the types, is written by hand; the files in
`Sources/PolymorphTokens/Generated/` are written by `pnpm emit:native` and never edited. Two
laws keep them honest. The freshness law (`packages/theme/src/native.test.ts`) regenerates every
native target in memory and fails, naming the files, when one on disk differs: run
`pnpm emit:native`. It compares the loader's example statics in
`Tests/PolymorphTokensTests/Examples/` the same way. `packages/theme/src/swift-build.test.ts`,
when `xcrun swift` exists, runs `swift build` on the package and
`swift test --filter PolymorphTokensTests` (the catalogue's checks and the loader's,
[native.md](native.md)), and type-checks the token sources with the engine's probe pairing for
macOS and for the iOS Simulator, so the `#if canImport(UIKit)` branches compile too. Each check
is skipped, with the reason in its title, without the toolchain. A third check in
`emit-swift.test.ts` reads `PMTheme.swift` and fails when an initialiser the emitter writes has
different labels from the struct it builds, so a new role reaches the type file in the same
change. [platforms/ios/README.md](../platforms/ios/README.md) has the package's own guide.

### Kotlin

`platforms/android` is a Gradle build whose `tokens` module (`dev.polymorph:tokens`) holds the house
pairings as Kotlin values; its `ui` module draws the members ([native.md](native.md)). Each system
with its default palette is one `PMTheme`: `PMThemes.plain_neutral`, `PMThemes.terminal_petrol`.
`PMThemes.catalogue` lists them and `PMThemes.named(system, palette)` finds one.
`emitKotlin(resolved)` (`packages/theme/src/emit-kotlin.ts`) writes them from the token document for
`android`, so the hit target is 48dp and control heights are the density's. A component shorter than
`hitTarget` extends its touch area with `Modifier.minimumInteractiveComponentSize()` and keeps its
height.

The module uses the Kotlin JVM plugin and imports nothing from Android or Compose: it builds
without an Android SDK, and its sources compile in a multiplatform common source set. An app
depends on it as `com.github.metamorph-labs.polymorph:tokens` from JitPack
([consuming.md](consuming.md#an-android-app)), or reaches it from a checkout of this repository or
a git submodule of it: it includes the whole build
(`includeBuild`, which [platforms/android/README.md](../platforms/android/README.md) shows), or
this module alone as a Gradle module of its own build:

```kotlin
// settings.gradle.kts
include(":polymorph-tokens")
project(":polymorph-tokens").projectDir = file("../polymorph/platforms/android/tokens")
// app/build.gradle.kts
dependencies { implementation(project(":polymorph-tokens")) }
```

Values are numbers, strings and small data classes. Turning one into a Compose type is one line,
and that line belongs to the code that draws with it:

```kotlin
val theme = PMThemes.plain_neutral
val density = theme.defaultDensity // the density the system's axes select

Modifier
  .minimumInteractiveComponentSize() // the touch area: 48dp, whatever the density
  .heightIn(min = density.controlHeight.md.dp)
  .background(Color(theme.colors.accentBg.resolve(isDark).argb), RoundedCornerShape(theme.radius.control.dp))
  .padding(horizontal = density.space[4].dp)
```

`theme.colors.accentBg` is a `PMDynamicColor`: the role's light and dark `PMRgba`, sRGB channels
exactly as the stylesheet ships them, with `argb` packed for `Color(Long)`. Gradients, glows,
shell surfaces and the glass surface are light/dark pairs the same way. Lengths are dp (a CSS px
is a dp), type sizes are rem × 16 in sp, line height is a multiplier and tracking is in em (both
`.em` in Compose), durations are whole milliseconds, easings are the four control points
`CubicBezierEasing` takes, and springs carry stiffness, damping, mass and damping ratio (Compose's
`spring()` assumes a unit mass, so it takes `dampingRatio` and `stiffness / mass`).

**Names.** A property is its token path below its family, camel-cased: `accent.bgHover` is
`colors.accentBgHover`, `shell.topbar.bg` is `shell.topbarBg`. A name that would start with a
digit takes its family in front: `chart.1` is `chart.chart1`, `chart.seq.1` is `chart.seq1`,
`text.2xl` is `text.text2xl`. The space ladder is a list, so `space.4` is `space[4]`. `default` is
a keyword in Dart and Swift, so the default spring is `spring.base` in every native package. A
pairing is `system_palette` with each half camel-cased (`acmeCorp_deepSea`), the name Swift gives
it. `nativeName` (`packages/theme/src/native-model.ts`) is the rule; the Kotlin and Dart emitters
print the same tree it names.

A token name that is a keyword in Kotlin or a reserved word in Dart takes its rename from one
table (`default` is `base`); one with no rename, a name that is not an identifier in both
languages, and two paths that would share a property in one class are refused, not escaped.

**Not emitted.** The page texture is in `PMTheme.unsupported` and nowhere else. The tree refuses a
token document that does not list it, so a platform that could draw it gets a field rather than a
silent drop. Inverse tone has no table. On the web, `[data-tone="inverse"]` re-declares the colour
and chart roles alone, each as the other mode's value, and gradients, glows, shell surfaces and
the glass surface keep the outer scope's. `PMDynamicColor.inverse` swaps light and dark, which is
that borrowed value for a colour or chart role (a law in `native-model.test.ts` holds the two
equal), so a renderer that draws the web's inverse tone applies it to the colour and chart roles
and nothing else; the document's `inverse` table lists them. References arrive resolved, so
`radius.control` is the radius it names; only a member exception keeps the path it points at.
`floor.raised` is kept, as the record of which values the floor changed. A law in
`native-model.test.ts` fails when a token in the document reaches neither package and has no
stated reason. An alpha is printed exactly as the stylesheet ships it; one with more than four
decimals is refused rather than rounded.

**Generated files are committed.** `PMTheme.kt`, the types, is written by hand; the files in
`tokens/src/generated/kotlin/` are written by `pnpm emit:native --target kotlin` and never edited.
The freshness law (`packages/theme/src/native.test.ts`) fails when one differs from what the engine
emits. `emit-kotlin.test.ts` compiles the module's sources with `kotlinc`, warnings as errors, and
is skipped, with the reason in its title, when `kotlinc` is not on `PATH`; it also fails when
`PMTheme.kt` declares different properties, or the same ones in a different order, from those the
emitter writes. `platforms/android/gradlew -p platforms/android :tokens:build` compiles the module
and runs its own tests. [platforms/android/README.md](../platforms/android/README.md) has the module's own guide.

### Dart

`platforms/dart` is a Dart package, `polymorph_tokens`, that holds the same pairings as `const`
values, with the classes and names of the Kotlin module: `PMThemes.plain_neutral`,
`PMThemes.catalogue`, `PMThemes.named(system, palette)`,
`theme.colors.accentBg.resolve(isDark: isDark)`. One class differs: an icon size is a `PMIcon` in
Dart and a `PMIconScale` in Kotlin, where `PMIcon` is the vocabulary's Icon. `emitDart(resolved)`
(`packages/theme/src/emit-dart.ts`) writes them from the token document for `dart`, whose
hit-target floor is Flutter's 48.

Polymorph has no Flutter renderer. The package exists so that a Flutter app, or any Dart program,
can read the decisions the web reads. It has no dependencies,
Flutter included, and an app adds it by path
(`polymorph_tokens: { path: ../polymorph/platforms/dart }`) or by git with
`path: platforms/dart`. Mapping a value to Flutter is one line: `Color(rgba.argb)`; every length
as it is (a CSS px is a logical pixel); `TextStyle.height` from `lineHeight`; `letterSpacing` as
`tracking * size`; `Cubic(x1, y1, x2, y2)`; `SpringDescription(mass:, stiffness:, damping:)`.

Names, omissions and units are the Kotlin module's, with `double` for every length and `int` for
weights, durations and channels. The files in `lib/src/generated/` are written by
`pnpm emit:native --target dart` and covered by the same freshness law; `pm_theme.dart`, the
types, is written by hand. `emit-dart.test.ts` runs `dart analyze --fatal-infos` on the package,
skipped with the reason in its title when `dart` is not on `PATH`, and checks `pm_theme.dart`
against the emitter as the Kotlin test checks `PMTheme.kt`. The analyzer's rules are listed in
the package's `analysis_options.yaml`, so analysis fetches nothing.
[platforms/dart/README.md](../platforms/dart/README.md) has the package's own guide.

### Where Swift and Kotlin/Dart differ

The Kotlin and Dart packages print one tree (`native-model.ts`), so they read alike. The Swift
package is shaped for SwiftUI, and the same document path reaches a different place in it:

| Document path | Swift | Kotlin and Dart |
| --- | --- | --- |
| `pairing.name`, `pairing.axes`, `pairing.chartCap` | `theme.name`, `theme.axes`, `theme.chartCap` | `theme.pairing.name`, `theme.pairing.axes`, `theme.pairing.chartCap` |
| `icon.size.md`, `icon.stroke.md` | `theme.icon.size.md`, `theme.icon.stroke.md` (by size within each) | `theme.icon.md.size`, `theme.icon.md.stroke` (by size, then each) |
| `shadow.insetTop` | `theme.insetTop`, beside `shadows` | `theme.shadows.insetTop` |
| `text.md.weight` | `theme.text.md.wght`, an `Int`; `weight` is the SwiftUI `Font.Weight` it reads as | `theme.text.md.weight`, an `Int` |
| `text.md.tracking` | points (em × size) | em |
| `space.4` | `density.space.s4` (`density.space[4]` reads the same) | `density.space[4]`, a list |
| `font.numeric` | `theme.numeric`, a `PMNumeric` (`tabular`, `slashedZero`) | `theme.numeric`, a list of feature tags (`["tnum"]`) |
| `numeric.align` | `theme.numeric.align`, a `PMNumericAlign` (`.end`, `.start`) | `theme.numericAlign`, a `String` (`"end"`) |
| `glow.focus`, `accent.gradient` | one geometry with a dynamic colour per layer or stop | a light and a dark value (`PMDynamicShadow`, `PMDynamicGradient`) |
| `motion.duration.*`, `motion.ambient.*`, `motion.stagger.*` | seconds | whole milliseconds |
| `floor` | not emitted | `theme.floor` |

## Bringing your own system and palette

The catalogue in `design/` belongs to this repository. The engine works with any system and
palette. A product with its own design writes the two JSON documents and admits them through the
same law checks a house pairing passes, without editing this repository. This usually happens in
the build: list the files in `polymorphTheme({ systems, palettes })`, and every pairing is admitted
when Vite builds. A fault fails the build ([consuming.md](consuming.md)). The same admission runs in
the browser for a theme that arrives at run time:

```ts
import { admitTheme, installThemeCSS, setSystem, setPalette } from '@polymorph/engine'

const admission = admitTheme({ system, palette }) // two parsed JSON documents
if (admission.lawful) {
  installThemeCSS(admission.css)                  // the emitted, scoped block
  setSystem(admission.system.name)
  setPalette(admission.palette.name)
  // admission.fonts names the @fontsource packages the app should install.
} else {
  for (const fault of admission.faults) console.error(`[${fault.law}] ${fault.message}`)
}
```

`admitTheme` (`packages/theme/src/admit.ts`) never throws. It returns `lawful`, `faults` (each with
the `law` that failed and its message), `exemptions`, and whichever of these it got as far as
producing: `system`, `palette`, `theme`, `resolved`, `css`, `fonts`. `admit.test.ts` admits a
pairing that is in no shipped file, without reading anything in `design/`.

**Laws that apply to a guest pairing.** A pairing must pass all of these:

| Law | Checks |
| --- | --- |
| `schema` | both documents, including merged-ladder monotony, the 24px target floor, one exception per decision, and a gradient stop pinned in both modes or neither when the palette derives no stop |
| `resolution` | the contrast repair succeeded (otherwise the engine's error) |
| `coherence` | the derived tokens agree with the axes |
| `contrast` | every lawful pairing, both modes, the focus floor and any pins included |
| `gradient` | both stops of each gradient role, a pinned stop included |
| `glass` | the pane over black and white, when depth is `glass` |

When the admission is given a more-contrast partner, `contrast`, `gradient` and `glass` also run on
the partner pairing, and its faults carry its own pair id.

**Laws that do not run on a guest.** Three laws keep the house catalogue's entries distinct from
each other. The admission report lists them as exemptions, so that nobody assumes they were
checked:

- axis divergence (designed systems at least three axes apart);
- the accent-hue band (palettes at least 20° apart);
- name uniqueness, which is the application's job, because names become attributes.

The rest are catalogue tests that read `design/` and nothing else: the register paragraph, the
`chartCaps` record, the tenant law, the stylesheet budget, the WCAG 2.1 divergence list and the
chart palette laws.

The CLI runs the same admission (`packages/cli/src/theme.ts`):

```sh
polymorph theme validate <system.json> <palette.json> [<partner.json>]  # the report; exit 1 when unlawful
polymorph theme emit <system.json> <palette.json> [<partner.json>] --out theme.css
polymorph theme schema system|palette --out schema.json                 # JSON Schema for an editor
polymorph theme hue "#1F4FD8"                                           # a colour in OKLCH, and its accentHue
```

In this repository, run them as `pnpm polymorph theme …`. `validate` also lists the fonts to
install, the chart cap, and a note when a guest name collides with a shipped one. `emit` output (and
`pnpm emit:theme <system> <palette> [out.css]` for house pairings) is for handoff and inspection. It
is not a way to install a theme. A product keeps the two documents and compiles them in its build
(`@polymorph/engine/vite`) or its install (`polymorph add`, then `polymorph update` after an edit),
so the sheet is re-derived when a decision changes. The MCP server's `propose_theme` verdict uses
the same admission, and so does `save_theme` before it writes the two documents into a project. See
[tooling.md](tooling.md).

## The house catalogue

### Systems

Axes in order: geometry · depth · density · contrastTemperament · typePersonality · colorStrategy ·
motionTemperament · ornament. Fonts: body / display / mono (all Fontsource `Variable` families).
No house system states a heading slot, so each draws its headings in its body face.

| System | Character | Axes | Fonts | Palette · mode |
| --- | --- | --- | --- | --- |
| `dew` | Warm paper, one clear teal on action and state, a serif only at display size, glass for what floats | soft · glass · standard · standard · grotesque · quiet · subtle · none | Geist / Fraunces / Geist Mono | verdigris · system |
| `flint` | Layered planes with little contrast between them, crisp corners, a blue wash on the surfaces | crisp · elevated · standard · soft · grotesque · tinted · standard · minimal | Public Sans / Public Sans / JetBrains Mono | cobalt · system |
| `glassmorphic` | Transient panes translucent over a blurred, saturated backdrop | round · glass · standard · soft · grotesque · tinted · expressive · minimal | Inter / Inter / JetBrains Mono | azure · system |
| `harbor` | The tenant: terminal's structure with its own display face and brand | sharp · flat · compact · stark · mono · quiet · subtle · grid | Space Grotesk / Plus Jakarta Sans / Fira Code | ember · system |
| `pebble` | Touch: round corners, thumb-sized controls, springs that overshoot | round · elevated · comfortable · standard · grotesque · quiet · expressive · minimal | Inter / Inter / JetBrains Mono | azure · system |
| `journal` | A writing desk: warm paper with a grain, rules for separation, ink as the accent | soft · borders · comfortable · soft · humanist · quiet · subtle · grain | Source Sans 3 / Lora / Fira Code | umber · system |
| `desktop` | The desk: soft corners, the standard working rhythm, motion that confirms | soft · elevated · standard · standard · grotesque · quiet · standard · minimal | Inter / Inter / JetBrains Mono | azure · system |
| `pastel` | Lavender-tinted neutrals, lit fills that read as pressable, a violet gradient | soft · elevated · standard · standard · humanist · tinted · standard · minimal | Plus Jakarta Sans / Plus Jakarta Sans / Fira Code | amethyst · system |
| `pop` | Consumer: round geometry over real elevation, a pink-to-violet gradient | round · elevated · comfortable · standard · grotesque · tinted · expressive · minimal | Outfit / Bricolage Grotesque / JetBrains Mono | orchid · system |
| `press` | A broadsheet: bright paper, near-black ink, a rose-wine accent, an italic masthead | crisp · borders · standard · stark · editorial · quiet · standard · minimal | Source Serif 4 / Fraunces (italic) / Fira Code | carmine · system |
| `plain` | The quiet default: true greys, hairline separation, a primary that is ink | soft · borders · standard · standard · grotesque · quiet · standard · minimal | Geist / Geist / Geist Mono | neutral · system |
| `terminal` | A precision instrument: graphite and hairlines, one electric cyan, a ruled grid | sharp · flat · compact · stark · mono · quiet · subtle · grid | Space Grotesk / Space Grotesk / JetBrains Mono | petrol · dark |

Each designed system has a rationale file next to it, `design/systems/<name>.md`, that explains
each axis. `harbor` is the catalogue's tenant (`kind: "tenant"`). Its axes are exactly terminal's,
which shows that a palette and a font are enough to carry a brand.

**The reference-calibrated systems.** `plain`, `pebble`, `desktop` and `flint` are calibrated to
fixed target values rather than designed from a brief. `plain` matches a measured neutral default.
The other three match established interface conventions for touch, desktop, and layered
productivity software. `pebble` and `desktop` share one palette: both use `azure`, and every colour
token they resolve is identical. The difference between phone and desktop is entirely in geometry
(round vs soft), density (comfortable vs standard) and motion (expressive vs standard). `flint`
differs in contrast temperament and colour strategy. It uses soft contrast for layered planes and
`tinted` surfaces in place of a translucent material, and it uses `cobalt`, a slightly quieter blue
than azure. `pebble` and `desktop` use Inter and `flint` uses Public Sans, each chosen to suit the
system. A calibrated system's axis values follow from its targets, so the divergence law requires
only one differing axis among these four instead of three.

### Palettes

Seeds: accentHue · gradientHue · neutralHue · neutralTint · budget (— means not seeded).

| Palette | Seeds | Default of | Character |
| --- | --- | --- | --- |
| `amethyst` | 298 · 265 · — · 0.02 · medium | pastel | violet with a blue-violet gradient partner, lavender greys |
| `azure` | 250 · — · 250 · 0.004 · high | pebble, desktop, glassmorphic | a bright interface blue over cool, nearly pure greys |
| `carmine` | 356 · — · — · 0.003 · medium | press | rose-wine on near-neutral paper |
| `cobalt` | 240 · — · 240 · 0.004 · medium | flint | a quieter blue than azure |
| `ember` | 31 · — · — · 0.019 · low | harbor | a muted brick orange over warm greys |
| `iris` | 291 · — · 291 · 0.008 · high | — | a deep violet with no gradient partner |
| `neutral` | 0 · — · — · 0 · none | plain | achromatic: true greys, the accent is ink |
| `ochre` | 50 · — · 85 · 0.01 · medium | — | burnt orange over warm stone greys |
| `orchid` | 335 · 295 · — · 0.014 · high | pop | pink with a violet gradient partner |
| `petrol` | 200 · — · — · 0.006 · high | terminal | electric cyan |
| `umber` | 75 · — · — · 0.008 · ink | journal | an accent held to ink: a warm near-neutral |
| `verdigris` | 178 · — · 80 · 0.006 · medium | dew | teal over warm stone greys |
| `zinc` | 286 · — · 286 · 0.013 · none | — | achromatic with a faint cool lean |

Palette names are pigment names and do not refer to a system, because any system can use any
palette. `neutral` is named for what it contains, because an achromatic palette has no pigment.
`design/palettes/README.md` has the same table. A palette that is no system's default is still
lawful on every system.

### The boot pairing

`design/defaults.json` holds `{"system": "plain"}`, the system the workbench and docs open in.
The palette is that system's `defaultPalette`. Changing either default is a one-word edit to a data
file, with no change in `apps/`.

## Adding a system or palette

**A system:** add `design/systems/<name>.json` (name = file name; all eight axes; the three
required font slots, and a heading slot if its headings have a face of their own; a
`defaultPalette` that exists; `defaultMode`; `kind`; a `register` paragraph) and, by convention, a
`design/systems/<name>.md` rationale. If the apps do not load a font family, add its
Fontsource package to `apps/workbench` and `apps/docs`, then run `pnpm registry` to regenerate the
loader maps. If a package is missing, generation stops and prints the install command. If the file
sets a heading weight the family does not ship, generation stops and names the system, the weight
and what the family ships. Nothing else is needed: the apps, the registry and every law find the
file themselves.

**A palette:** add `design/palettes/<name>.json` with a pigment name. Leave `chartCaps` out: the
chart law then fails and prints the measured record to copy in.

These laws check the new file. All of them read the directories rather than a list:

| Test | What it holds |
| --- | --- |
| `packages/theme/src/systems.test.ts` | the schemas; a palette carries exactly the non-font seeds; any palette composes with any system |
| `packages/theme/src/laws.test.ts` | file name = `name`; every `defaultPalette` and `moreContrast` exists; designed systems have a register; contrast, gradient, glass and scrim laws over every system × palette × mode; the WCAG 2.1 divergence list; each system resolves with no coherence violation, and the whole axis space is coherent; designed systems ≥ 3 axes apart (≥ 1 for the four reference-calibrated systems); palettes ≥ 20° apart in accent hue (achromatic palettes exempt; three named reference pairs may sit closer but never on the same hue); the tenant's axes equal terminal's; each eager block ≤ 28,000 bytes |
| `packages/theme/src/chart-laws.test.ts` | the chart palette laws over every pairing; each palette's `chartCaps` equals the measured cap |
| `apps/workbench/src/fonts.test.ts`, `apps/docs/src/fonts.test.ts` | every family a system names has a loader |
| `packages/registry/src/fonts-gen.test.ts` | a static family's loader imports each heading weight a system sets; a missing weight file and a weight outside a variable family's axis are refused |

```sh
pnpm exec vitest run packages/theme/src/laws.test.ts packages/theme/src/chart-laws.test.ts
```

The workbench studio (`pnpm dev`) edits axes, seeds and overrides live through the same engine, shows
the laws' messages beside the control that caused them, and saves to these same files. See
[tooling.md](tooling.md).
