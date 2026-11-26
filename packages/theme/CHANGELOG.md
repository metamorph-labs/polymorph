# @polymorph/theme

## 1.0.18

### Patch Changes

- b40ece2: **The focus tokens place the ring inside the control's edge.** `--pm-focus-width` is 2px at the
  `soft` and `standard` temperaments and 3px at `stark` (it was 2, 3 and 4px), and
  `--pm-focus-offset` is minus the width at every geometry (it was 0, and 2px at `round`). A new
  flag, `--pm-focus-place`, says which side of the edge the ring is on (`inside` or `outside`, read
  from the offset; `focus.place` in the token document), and the focus convention branches on it.

  **The focus colour meets 3:1.** `border.focusSolid`, the colour the ring is drawn in, is held to
  3:1 by the WCAG contrast ratio on every background, on the accent and status washes at rest,
  hovered and pressed, and on the selected surfaces, in both modes. It was held to a lightness
  difference of 0.08, which let a 2px line reach 2.56:1. A hued palette takes the accent's step 9
  where that passes, and otherwise the first later step of the solid ladder that passes in both
  modes; an ink palette draws it in the reference's two ring greys swapped, L 0.556 in light mode
  and L 0.708 in dark mode. Among the shipped palettes the colour moves for `neutral` and `zinc`
  (both modes), and for `cobalt`, `petrol` and `verdigris`, which move one step along the ramp,
  to L 0.588 (`cobalt` keeps step 9 in dark mode in the `stark` systems). A pinned
  `border.focusSolid` under 3:1 is refused at admission with the measured ratio. `border.focus`,
  the half-alpha focus colour, stays a token and a pin with its own floor; nothing in the
  vocabulary draws in it.

  A system file's `overrides.focus.offset` now takes minus the width, which states the default, or
  0 to 4px, which moves every ring outside the control with that much air. It is judged against the
  merged width, the file's or the temperament's: an offset further in than the width, or one between
  minus the width and 0, is refused with the reason. To restore a ring outside the control, set
  `"focus": { "offset": 0 }` or more under `overrides`.

  `GEOMETRY_FOCUS_OFFSET` is removed, because the offset no longer depends on geometry.
  `focusPx(temperament, overrides.focus)` returns the derived width and offset in px. The pairing
  table gains a third kind, `focus`, measured by the WCAG ratio (`minRatio`, `FOCUS_MIN_RATIO`), and
  `pairingMeasure` writes any pair's measure and floor as the reports do.

- 786c025: **A palette can pin the colour the accent gradient runs to.** `pins` takes `accent.gradientTo`,
  an opaque `#rrggbb` per mode, beside the fill pins. `accent.gradient` then runs from `accent.bg`,
  pinned or derived, to the pinned colour, instead of to step 10 of the partner ramp. The stylesheet
  writes it in `--pm-accent-gradient` and as `--pm-accent-gradient-to`, and the token document and
  the SwiftUI, Compose and Flutter themes carry it in the gradient's stops. `bg.wash` does not
  change.

  The contrast law measures the pinned stop as it measures a derived one: `accent.contrast` must
  reach Lc 60 at both stops. Admission refuses a stop under the floor with the measured value, the
  stop and the pin named: `… reached Lc 31.9 at its 'to' stop, floor is 60. The 'to' stop is
accent.gradientTo, which the palette pins in light mode.` A palette that pins a light
  `accent.bg`, such as a cream, and was refused at the `'to'` stop of its partner hue can keep
  `gradientHue` and pin a second stop the label reads on.

  The pin gives `accent.gradient` two stops in a palette with no `gradientHue`, or with
  `chromaBudget: none`, too. A gradient has one shape in both modes, so such a palette pins
  `accent.gradientTo` in both modes or in neither; the palette schema refuses it in one mode only.
  In a palette with `gradientHue`, a mode that pins no stop keeps the derived one.

  `GRADIENT_PINS`, `GRADIENT_STOP_PINS`, `gradientStopPin` and the `GradientPin` type are exported
  beside `PIN_ROLES`, which still lists only colour roles. A palette that pins nothing resolves and
  emits exactly as before.

- 5b73195: **A system file can set its heading weights.** `overrides.type.titleWeight` replaces the type
  personality's title weight on `text.2xl` and `text.3xl`, and `overrides.type.displayWeight` its
  display weight on the display steps. Each takes 300 to 700 in hundreds. Body text and the
  working sizes keep their weights, and no size changes. A title weight under 500 also lightens
  `text.xl`, which is 500 otherwise, as far as its size reads at the lighter weight, so a subheading
  is not heavier than the titles above it. `display.lg` still takes 50 off the display weight, and
  never goes under 300.

  ```json
  { "overrides": { "type": { "titleWeight": 300, "displayWeight": 300 } } }
  ```

  The schema holds each heading step's weight to the size it needs to read at Lc 75, the floor
  `text.primary` is held to, from the Lc 75 row of APCA's font lookup table
  (`BODY_TEXT_MIN_SIZE_PX`, `minSizeForWeight`): 24px at 300, 18px at 400, 16px at 500. It judges
  the size the step derives from the merged base and ratio, so a title weight of 300 under a small
  base or a flat ratio is refused with the step, its size and the size the weight needs. A system
  that sets neither key derives exactly as before. `HEADING_WEIGHT_RANGE` exports the range.

  An application loads its own fonts, so an application that admits a system setting a light
  heading weight must load that weight of the family: the 300 file of a static fontsource package,
  or a variable family whose weight axis reaches 300.

- 41606c8: **A system file chooses which side of its column a numeric column's figures sit on.**
  `overrides.numeric.align` takes `end`, the default, or `start`:

  ```json
  { "overrides": { "numeric": { "align": "start" } } }
  ```

  It applies to every `numeric` header, body cell and total in Table, and to DataTable's `numeric`
  columns, in every web framework and the elements, and in the SwiftUI and Compose Table and
  DataTable. A Markdown table's column whose delimiter ends in `:` is drawn as a `numeric` column,
  so it follows the choice too. Tabular figures stay in both. A system that does not set it renders
  as before.

  A new token carries it in every pairing: `--pm-numeric-align` (`end` or `start`), which
  `table.module.css` sets as a numeric cell's `text-align`, and `numeric.align` in the token
  document's `invariant` section (`NUMERIC_ALIGNS`, `NumericAlign`). The recipe reads the token,
  so a stylesheet emitted by an older engine draws numeric cells at the start: install the engine
  and the recipes at the same version, as every release asks. On native platforms SwiftUI reads
  `theme.numeric.align` (`PMNumericAlign`, `.end` or `.start`; `PMNumeric`'s initialiser defaults it
  to `.end`), and the Kotlin and Dart token packages add `numericAlign` (`"end"` or `"start"`) to
  `PMTheme`, beside `numeric`.

## 1.0.17

## 1.0.16

### Patch Changes

- 2f0ddd2: **The contrast law computes APCA itself.** `@polymorph/engine` and `@polymorph/theme` no longer
  depend on `apca-w3`, whose licence limits it to web content, or on `colorparsley`, which that
  package pulled in under the AGPL. The theme holds the published formula (0.0.98G-4g) in
  `packages/theme/src/color/apca.ts`, and a test pins it to a table of values computed with the
  reference implementation, so every pairing's Lc and every emitted token is unchanged. A consumer
  installs two packages fewer, and every remaining production dependency is under a permissive
  licence.

## 1.0.15

## 1.0.14

## 1.0.13

## 1.0.12

## 1.0.10

## 1.0.9

## 1.0.8

### Patch Changes

- 820c836: Every package now carries the release's version, and the release tag is `v` and that version.
  Until this release each package kept its own number, so one release installed the engine at one
  version, the foundations at another and the tag named a third. From this release on, pin every
  `@polymorph/*` package you install at the same version, and check the native packages out at the
  tag of that version.

  This package's version jumps to the release's number. The jump carries no change of its own: the
  versions it skips were never published.

## 1.0.1

### Patch Changes

- 22f607b: The base type size is a system decision. `overrides.type.base` sets the md step, the paragraph
  size, between 12 and 20px on the half-pixel grid; `overrides.type.sm` and `overrides.type.xs`
  set the two working steps under it (controls, table cells, menus and labels read `sm`; captions
  and badges read `xs`), so a product whose sizes are 12, 13 and 13 says so in three numbers. The
  steps above the base still derive from `type.ratio`, and the merged ladder stays in order with
  `xs` never under 10px.

  A base under 16px is lawful because the focus-zoom floor is now a token of its own. iOS Safari
  zooms the viewport when a focused field's font-size is under 16px, so below `30rem` every
  text-entry recipe (Input, Textarea, TagInput, Combobox, MultiSelect, NumberInput, OTPInput,
  Command and PromptInput) reads `--pm-text-entry-size` and `--pm-text-entry-line-height` instead
  of a type step. The engine derives the size as the md step or 16px, whichever is larger. No
  application needs a viewport `maximum-scale` or a CSS `zoom` to keep a small field from
  zooming. The recipes read the new tokens, so this release of `@polymorph/recipes` needs this release of the engine or later; a vendored member's recipe picks them up through `polymorph update`.

## 1.0.0

The first versioned release. Earlier history is in git.
