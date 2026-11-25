# flint — rationale

> **A descriptive name.** Flint is a hard, fine-grained stone that breaks to a
> crisp edge with a faint cool sheen. The system has crisp corners, layered
> planes close in lightness, and a blue wash over every surface. `flint` is
> reference-calibrated: its radii, elevation ladder and layered low-contrast
> planes follow established conventions for productivity desktop software
> instead of a brief. "Whose is this?" covers how a screen identifies it.

**Direction:** the layered register: crisp 4px corners, elevation, and surfaces
close in lightness under a faint blue wash. Where pebble and desktop use white
panels and a bright blue, flint lowers and tints the contrast between planes and
uses a quieter blue. It is the calibrated register that differs on temperament
and colour, not only on shape.

## Axes

| Axis | Value | Why |
| --- | --- | --- |
| geometry | `crisp` | 2/4/8 radii: controls at 4 and cards at 8, `crisp`'s `md` and `lg` exactly. `soft` (8 at control size) is desktop's reading and `round` (12) is pebble's. The 4px corner is the cheapest marker of this register. |
| depth | `elevated` | Layering by a numbered shadow ladder, with flyouts, dialogs and cards each on a step. `borders` would draw the hierarchy as lines, which this register does not do, even at low contrast. |
| density | `standard` | 36px `md` controls, the 8/12/16/24 ladder, in desktop's band for productivity software. `compact` would be a data-grid mode, not the default. `comfortable` is the touch floor. |
| contrastTemperament | `soft` | **The axis that defines flint.** The layered look is a contrast decision, not a colour one: page and surface close in lightness, borders a step down, secondary text receding. `soft` derives all three: `bg.app #f8fafc` against `bg.surface #f6fbff`, `border.default #dfe2e4`, `text.secondary #787a7c`. Under `standard` the system would look like a slightly square desktop. `soft` draws the focus ring at 2px, the floor. |
| typePersonality | `grotesque` | A humanist-leaning grotesque maps to `grotesque`. `humanist` is pastel's and journal's warmer register, with calligraphic traits flint does not want at UI sizes. |
| colorStrategy | `tinted` | **The tinted-material reading.** Layered desktop interfaces let a faint colour show through every surface. The engine does not model translucent material, so the nearest option is a tint on the surface ramp: `tinted` at `neutralHue 240` puts a blue wash on the panels (`bg.surface #f6fbff` is bluer and lighter than the page). This approximates the material as it looks in a screenshot. It does not implement a material. |
| motionTemperament | `standard` | Functional motion: connected transitions and quick fades, damped, no overshoot. `expressive` is pebble's spring. `subtle` would make a productivity system feel unresponsive. |
| ornament | `minimal` | Hover lift and the pending drop's halo, no page texture. The tinted planes are the register's decoration, and a tint is not texture, so `grain` does not apply. |

Divergence: 3 axes from desktop (geometry, contrastTemperament, colorStrategy:
a different register, not a different device), 3 from glassmorphic and
pastel, 4 from plain, pop and press, 5 from pebble, 6 from dew, 7 from
journal, 8 from terminal. As a reference-calibrated system flint only needs a
one-axis floor, but every pair clears the full three. It is the one calibrated
system that needs no relief.

## Seeds — `cobalt`

flint's colour seeds are in `design/palettes/cobalt.json`.

- **`accentHue: 240`**: a cooler, quieter interface blue than azure's, seeded
  as a hue family. At medium budget it derives to `accent.bg #008fd2`.
- **`neutralHue: 240`, `neutralTint: 0.004`**: azure's trace tint, set to
  cobalt's hue. Under `tinted` this produces the layered look: the surface wash
  is this blue, not a generic grey-blue, so panels look lit by the accent.
- **`chromaBudget: medium`**: a step quieter than azure's `high`, as flint is a
  step quieter than pebble. A high-budget blue over tinted surfaces would put
  strong colour in two places and weaken the affordance.
- **defaultMode: `light`.** Dark re-derives into a layered dark (`bg.app
  #090a0b` under `bg.surface #12181c`, the surface again bluer than the page)
  and is lawful on both standards.

`azure` and `cobalt` are the two calibrated blues and the closest palettes in
the catalogue by hue. This is deliberate and covered by the palette band law's
reference-pair exemption (see "The hue band" at the end).

## Fonts

The register needs a humanist-leaning interface grotesque published with a
variable normal face. **`@fontsource-variable/public-sans`** (5.3.0) ships
`index.css` with a `wght 100 900` **normal** face, plus a separate italic axis
file, so flint uses it. `@fontsource-variable/noto-sans` is not needed and not
installed.

| Role | Family (`@fontsource-variable/*`) | Why |
| --- | --- | --- |
| body | **Public Sans Variable** (`public-sans`) — verified 5.3.0 | The U.S. Web Design System's interface grotesque, drawn for dense government UI at small sizes: slightly humanist, wide apertures, plain. It matches the register of productivity software. |
| display | **Public Sans Variable** | Same family: weight and size carry a headline, not a second face. |
| mono | **JetBrains Mono Variable** (`jetbrains-mono`) | Already in the set. flint rarely shows code, and a dedicated mono would add a dependency it seldom needs. |

The derived package name applies fontsource's convention:
`"Public Sans Variable"` → `@fontsource-variable/public-sans`, which is what
both apps install. The slug is regular (lowercase, spaces to hyphens,
`Variable` suffix dropped), so the registry's derived-equals-installed
assertion needs no special case.

## Judged from the frame — `proof/shots/inbox-flint-light.png`

Judged cold against the layered register's intended feel, layered and tinted:

- **Crisp reads.** Cards at 8 and controls at 4 are the squarest corners in the
  catalogue apart from terminal's zero. They are the first thing that separates
  this frame from `inbox-desktop-light.png`.
- **Layered reads.** The page has a faint blue-grey and the panels sit just
  above it. The rail, the topbar and the table header read as planes of one
  material. `soft` temperament plus `tinted` strategy produce a layered-material
  look without a material implementation. This is the riskiest part of the
  design, and it works.
- **Quieter blue reads.** Next to azure's `high`, cobalt at `medium` gives a CTA
  that reads as an accent, not a highlight. The two blues read as different
  temperatures even 10° apart, which supports the hue-band exemption below.
- **Known gap.** Real translucent material shows depth-of-field behind it.
  flint has a tint. The two match in a still, not in motion over a desktop
  wallpaper.

**Verdict: the values stand.** The layered reading shows a temperament axis
carrying more register identity than a hue.

## Whose is this?

**Crisp, layered, tinted, a quieter blue.** A flint screen shows near-square
corners, planes barely apart under one blue wash, and an accent a step quieter
than azure's. The engine produces this third register with **no recipe code**:
one JSON file, one palette file, eight axes. Nothing in `packages/react-ui` refers to
`flint`.

All of it is engine output: the blue is a hue seed, the layering a contrast
temperament rather than an elevation table, the wash a tint on the neutral ramp
rather than a material, and the type a match for the register.

## The hue band — azure and cobalt

The two calibrated palettes are seeded **10° apart** (azure 250, cobalt 240),
inside the 20° band the palette law holds house pigments to. The law's reason
is that "two palettes 10° apart are effectively one colour", and the
derived accents (`#0089ea`, `#008fd2`) are visibly close. The pair is exempt by
name (`REFERENCE_PALETTE_PAIRS` in `packages/theme/src/laws.test.ts`) because
both are deliberately calibrated to the same band: the bright and the quiet
reading of one interface blue. Moving one would make it less faithful to its
calibration without making it more distinct. The band keeps house pigments
from crowding. It is not meant to force calibrated blues apart. `chromaBudget`
(high vs medium) supplies the difference the band does not measure. Limits:
the two must still differ in hue, and each is held to the band against every
other palette.
