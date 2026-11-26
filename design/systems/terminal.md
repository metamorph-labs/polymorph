# terminal — rationale

**Direction:** the precision-instrument register: graphite, hairlines, one electric cyan.
Dark-first, because instruments are used in dark rooms. Drawn separation (borders, not
shadows), high density, stark contrast and machine-derived type.

The design bet: a technical product can avoid both grey-on-grey low contrast and console
pastiche. Colour appears only where state or action is, at full strength (`quiet`
strategy), so a glance shows what is interactive: the cyan.

Bar: **instrument-grade** dark-technical: precise hierarchy in near-black, exact selection
and focus, and overlays whose shadows look native.

## Axes

| Axis | Value | Why |
| --- | --- | --- |
| geometry | `sharp` | 0/0/0 radii. Panels are cut, not moulded. The pill stays available for the rare tag that must read as a tag. |
| depth | `flat` | No resting shadows. Borders carry every plane change. Pairs with sharp geometry and stark contrast (coherence: flat + visible borders). Transient surfaces still lift, because a menu with no shadow merges into the page behind it, which is a bug. |
| density | `compact` | 0.85 space multiplier, 1.20 type ratio, 30px `md` controls. Data-dense by default, an instrument panel rather than a brochure. |
| contrastTemperament | `stark` | Wider page-to-surface spread, borders a step up the ladder so hairlines are visible, full-strength secondary text. |
| typePersonality | `mono` | Tight body tracking and restrained 500 titles. Mono-voiced faces get heavy past medium, so hierarchy relies on size and colour. |
| colorStrategy | `quiet` | Neutral graphite surfaces. Chroma is reserved for interactive and status elements, which makes the cyan stand out. |
| motionTemperament | `subtle` | Quick, damped, no bounce. An instrument acknowledges input without celebrating it. |
| ornament | `grid` | Bounded rather than banned. Both signature details below are ornament-gated, so `none` would set the axis too low. The grid is bounded at ΔL 0.012 (sub-perceptual: material, not colour) and glow attaches only to live state. |

Divergence from pastel: **8 of 8 axes** (the law holds the two founding systems at least
five apart). They sit at opposite corners of the axis space on purpose, so everything the
vocabulary renders under both is tested across the engine's full range. Every other
designed system is at least 6 axes away. `harbor`, the tenant, shares all eight by law: a
tenant copies its base's axes verbatim, and only the brand is its own.

## Seeds — `petrol`

terminal's colour seeds are in `design/palettes/petrol.json`.

- **`accentHue: 200`**: electric cyan, chosen against the status anchors. It is 40° from
  `info` (240) and 50° from `success` (150), so a cyan action never reads as an
  informational or success surface, and `info`'s azure stays clearly separate from the
  brand. On the light solid ladder the fills render deep teal (#00999f). On graphite the
  accent text steps render electric cyan (#00e6ef). Teal fills with cyan glow is the
  identity.
- **`neutralTint: 0.006`**: cold steel. A trace of cyan in the greys makes black panels look
  like metal rather than flat #111, still far below "tinted".
- **`chromaBudget: high`**: peak 0.21. `quiet` strategy already limits where colour appears,
  so where it appears it is at full strength. Status fills are saturated (#ea3c3f / #b37900
  / #00a149 / #008fd2 on dark), like instrument lamps.
- **No `gradientHue`**: the accent gradient resolves to the plain `accent.bg`.
- **defaultMode: `dark`.** A first visit opens dark whatever the device's mode, until the
  reader chooses one.

## Fonts

| Role | Family (`@fontsource-variable/*`) | Why |
| --- | --- | --- |
| body | **Space Grotesk Variable** (`space-grotesk`) | A proportional face with a monospace skeleton (cut from Space Mono). It gives the machined voice at body sizes without mono's reading cost in dense UI. |
| display | **Space Grotesk Variable** | Same family at 500 with −0.02em, like a spec-sheet headline. Its 700 is clunky, and the mono personality's 500 is the better cut. |
| mono | **JetBrains Mono Variable** (`jetbrains-mono`) | For what a technical tool shows: IDs, hashes, payloads. Wide language coverage, unambiguous glyphs, variable weight. |

The engine derives the fallbacks as in pastel. The apps load the fonts
(`apps/workbench/src/fonts.ts`), never the library.

## What inspecting `/tokens` settled

terminal mostly confirms the engine. Its corrections overlap pastel's (shared constants):
the warning hue at 75 rather than 85 (on graphite, mustard looks even worse than on white)
and the title weight (mono personality title weight 500, per the weight rule above). See
`pastel.md` for the full list with values.

Inspected and kept as derived for terminal: stark borders a step up the ladder (on dark,
the page's own light at 15% alpha rather than standard's 10%), because the direction draws
separation as lines. Status borders are stronger for the same reason. The focus ring at
`3px / offset -3px` (stark width, inside the edge), so the ring lies on the cut edge like a
selection rectangle. Icon stroke 1.75 (mono 1.5 + stark 0.25). `bg.app` at #080b0b with surfaces
rising to #323637, the full elevation-as-lightness range, because lightness is the only
elevation cue a flat theme's resting surfaces get.

## Signature details

1. **Glow discipline**: live state emits light. The accent solid glows cyan on hover
   (`--pm-glow-hover`), and a pending drop glows with `--pm-glow-focus`. The focus ring
   takes no glow: it is the accessibility surface and stands alone in every system. The
   glow is decorative by law and derives `none` where the ornament axis says so. Flat glows strongest (alpha 0.28), because it is the only
   detachment cue a shadowless resting surface has. Status lamps do not glow: the glow
   shape tokens carry the accent's colour, and per-tone lamp shapes would be an engine
   capability, not a terminal workaround.
2. **Ruled-grid page**: `ornament: grid` puts a 24px graph-paper substrate on `bg.app`
   under the shell and the auth page's empty area. The grid colour changes per mode, black
   on light and white on dark, because black strokes over terminal's near-black page
   compute to the same pixel and the grid would be invisible in the primary mode. The ΔL
   bound applies in both directions, and `laws.test.ts` holds it ("draws the grid in a
   colour that contrasts with its surface, so dark mode shows it"). Grain's grey speckle
   shows in both modes and needs no per-mode colour.

## What the shared recipes render as, under terminal

These recipes are theme-neutral (a recipe never knows which house system it is in), so
every system renders them through its own axes:

- **ListPage containment**: the body region is a panel in Card's exact surface recipe
  (`design/archetypes/list-page.md`). Flat terminal draws it as a ruled panel. Elevated
  systems seat it.
- **Shell regions**: the rail sits on `bg.subtle`, and region edges take `border.default`
  under flat, so the chrome reads as a frame, not as page.
- **Selection**: the current nav item, selected table rows and the bulk bar use the
  `selection.*` family, which means chosen, not hovered. Select and Menu mark the chosen
  option with a check glyph instead.
- **Wash presses**: soft steps 3→4→5. Outline and ghost press to the ladder's second step.
  A terminal control responds to the click in colour, not only scale.
- **Lit fills**: composed as `shadow.control + shadow.insetTop`. Both are `none` under
  flat, so terminal's solids stay flat by derivation, not by a branch.
- **Numeric voice**: Table and Stat figures come from `--pm-font-numeric` (terminal:
  `tabular-nums slashed-zero`) in the body face.
- **Sort affordance**: glyphs appear on approach (hover, focus, sorted), not as a row of
  permanent arrows.
- **Auth page empty area**: the page takes `bg.wash` (terminal: solid `bg.app`) under its
  texture, with no gradient.

Motion stays `subtle`. A 112ms control response could look so calm it seems absent. Judged
against the bar with glow feedback present, the quick, certain response is right for an
instrument.

## Register judgment (side-by-side, home mode)

Judged against the instrument-grade bar on inbox, settings, auth, menu overlays and control
close-ups (grid verified at 4×):

- **Holds the register:** overlay detachment (menus float rather than merging into the
  page), chrome structure (rail and topbar read as a frame), selection distinct from hover,
  a contained data region, a composed auth page, live-state glow, and press response on
  washed controls.
- **Known gaps:** display presence above `text.3xl` is raised by the engine floor but shows
  only where a surface uses the display scale (`Hero`). The empty two-thirds of a seven-row
  demo inbox comes from the demo data, not the design. Status lamps do not glow.
- **"Whose is this?"**: teal fills with cyan glow on graphite over a ruled substrate.

## Both modes

Dark is the primary mode. Light re-derives: white panels on a cold steel page
(`bg.app #f7fbfb`), the same teal fills, and hairlines still doing all the separation. It
reads as the same instrument in daylight, which passes the two-theme test. Every lawful
pairing passes in both modes.
