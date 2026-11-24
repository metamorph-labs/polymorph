---
'@polymorph/recipes': patch
---

**The focus ring is a solid 2px line placed by the part's shape.** Every focusable part draws
its focus ring as an outline 2px wide, or 3px in a `stark` system, in the solid focus colour
(`--pm-border-focus-solid`), with no glow under it. The outline still survives forced colours.
The focus convention places it in one of three ways:

- **Inside the edge**, for a part with padding around its content: fields, unfilled Buttons,
  rows, cards. The line covers the border and the pixels inside it, and nothing is drawn outside
  the control, so a scroll area, a pane or a table's wrapper no longer cuts it. An invalid field
  and a selected or range-endpoint cell draw it inside their state border, so the border stays
  visible.
- **Inside a fill, with a gap**, for a part with a solid fill: a `solid` Button (and every member
  that composes Button), Calendar's selected day, DateRangePicker's endpoints, and the current
  item of SectionNav, TableOfContents and AppShell's navigation. The line is the part's label
  colour, one width in from the edge, so the fill shows on both sides of it.
- **Around, with a gap**, for a part that cannot hold the line: a control too small for it
  (Checkbox, Radio, Switch, Slider's thumb, ColorInput's thumbs, Carousel's dots) and a part
  whose box is its text (Link, Tabs' trigger, the Accordion, Collapsible and ReasoningDisclosure
  triggers, Stepper's step, Table's sort button, the chart legend's key, JsonTree's toggle, a
  Breadcrumbs crumb, an ErrorSummary link and a SourceList title). The line lies `--pm-space-1`
  outside the part in the focus colour, in every state, so it touches no letter and leaves a
  control's border uncovered.

The convention exports two classes (`focusRing`, `focusAround`) and two
hooks a filled part sets on its focused state (`--pm-focus-mark`, `--pm-focus-inset`). A vendored
recipe composes the class for its part's shape. A bordered part takes the focus colour on its
border only where a system moves the ring outside.

A system that wants the ring outside every control sets `overrides.focus.offset` to 0 or more in
its system file (`{ "overrides": { "focus": { "offset": 2 } } }`): rings then sit that far
outside the edge in the focus colour, filled parts included, and `overrides.focus.field: "border"`
keeps fields' rings inside their edge. Application CSS that drew its own focus outline with
`--pm-border-focus` and `--pm-glow-focus` draws the old ring: write
`outline: var(--pm-focus-width) solid var(--pm-border-focus-solid)` and
`outline-offset: var(--pm-focus-offset)` instead, or compose one of the convention's classes.
