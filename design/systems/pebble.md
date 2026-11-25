# pebble — rationale

> **A descriptive name.** A pebble is round, smooth and hand-sized. The system
> has generous corners, real elevation, thumb-sized controls and spring motion.
> `pebble` is reference-calibrated: its geometry, density and motion follow
> established touch-interface conventions (a 44px minimum tap target, generous
> corner radii, spring motion that overshoots and settles) instead of a brief.
> Conventions about shape, rhythm and response map well onto the eight axes.
> "Whose is this?" covers how a screen identifies it.

**Direction:** the touch register: round corners, real elevation and open
spacing, for a thumb rather than a cursor. 42px controls, roomy type, and
springs that overshoot slightly and settle. It is `desktop`'s palette laid out
for a hand.

**pebble and desktop share one palette on two structures.** Both declare
`azure`, and every colour token they resolve is byte-identical
(`accent.bg #0089ea`, `bg.app #ffffff`, `bg.surface #ffffff`,
`border.default #e3e5e8`, `text.secondary #727375` in light). The whole
difference between the phone and the desktop system comes from the structural
axes. This is the clearest example of the palette/system split: colour is a
palette and shape is a system.

## Axes

| Axis | Value | Why |
| --- | --- | --- |
| geometry | `round` | 6/12/24 radii. Touch interfaces round generously, often with a continuous corner, which the engine does not draw. It draws a radius, and 12 at `md` is the nearest match for a touch control's corner. `soft`'s 8 looks desktop, and `sharp` and `crisp` look like instruments. The rounding is the main marker of the register. |
| depth | `elevated` | Sheets, cards and popovers rise off the page and cast shadows, because touch modals are surfaces sliding over other surfaces. `borders` would draw the hierarchy as lines, which is the desktop-web reading. |
| density | `comfortable` | 42px `md` controls. The 44px minimum tap target (WCAG 2.5.5's enhanced target size) is the floor a touch system is designed around, and `comfortable` is the only density near it without a per-component override. `standard` gives 36, a cursor's size. The 10/14/18/28 space ladder applies the same decision to layout. |
| contrastTemperament | `standard` | Text and separators sit where a neutral ramp puts them, with nothing washed out or pushed to instrument starkness. `soft` is flint's choice and one of the axes that separates flint, so taking it here would blur that difference. |
| typePersonality | `grotesque` | Even colour, no calligraphic traits, legible before characterful. This axis sets the voice. The family is a separate decision (see Fonts). |
| colorStrategy | `quiet` | Neutral surfaces, with blue only where something is interactive or has state: a bright blue button on white, not a blue page. `tinted` would put the accent in the background and weaken the blue's signal that something is tappable. |
| motionTemperament | `expressive` | Touch motion overshoots and settles instead of easing to a stop. `expressive` is the only temperament that resolves real spring parameters, 1.35× travel and a press scale. This axis separates pebble from desktop the most, which is correct: motion is the largest difference between a hand and a desk. |
| ornament | `minimal` | Hover lift and the pending drop's halo, no texture. pebble decorates with shape and response, not pattern, and translucent material is `depth: glass`, glassmorphic's axis. `grain` or `grid` would add a decoration the register does not have. |

Divergence from the catalogue: 3 axes from desktop (geometry, density, motion:
everything that distinguishes a phone from a desk), 4 from plain and
glassmorphic, 5 from dew, flint and pastel, 6 from journal and press, 7 from
terminal. **1 from pop**, which the divergence law permits only because pebble
is reference-calibrated. See "The divergence floor" at the end of this
document.

## Seeds — `azure`

pebble's colour seeds are in `design/palettes/azure.json`, shared with desktop.

- **`accentHue: 250`**: a bright interface blue, seeded as a hue family rather
  than a swatch. At the high peak it derives to `accent.bg #0089ea`. The seed
  is a hue, so the colour is the engine's derivation, not a copied value.
- **`neutralHue: 250`, `neutralTint: 0.004`**: `neutralHue` set explicitly to
  the accent's hue. The very low tint gives cool greys: white stays white
  (`bg.app #ffffff` under `quiet`), and the other greys lean only slightly
  blue. Cool greys suit a bright blue, and 0.004 is cool without being
  coloured.
- **`chromaBudget: high`**: the blue is meant to be bright. A system whose only
  colour is one accent can spend the whole budget on it. At `medium` the blue
  looks dull.
- **defaultMode: `light`.** Dark re-derives (`bg.app #090a0b`,
  `bg.surface #161719`, the same pinned `accent.bg`) and is lawful on both
  standards. As a still it reads as the same system, which passes the
  two-theme test.

## Fonts

The touch register needs a screen-UI grotesque published with a variable normal
face.

| Role | Family (`@fontsource-variable/*`) | Why |
| --- | --- | --- |
| body | **Inter Variable** (`inter`) — verified 5.3.0 | Designed for screen UI at text sizes, with grotesque structure and no calligraphic traits. |
| display | **Inter Variable** | Same family. The touch register changes weight and size for a headline, not the face, so a second display family would not fit. |
| mono | **JetBrains Mono Variable** (`jetbrains-mono`) | Already in the set. pebble rarely shows code, and a dedicated mono would add a dependency it seldom needs. |

The derived package name applies fontsource's convention:
`"Inter Variable"` → `@fontsource-variable/inter`, which both apps install. The
registry test asserts derived == installed, and it passes.

## Judged from the frame — `proof/shots/inbox-pebble-light.png`

Judged cold against the touch register's intended feel, round and springy:

- **Round reads.** The stat cards, the table panel and the search field are
  the roundest surfaces in the catalogue after pop, and the `sm`-radius filter
  controls are near-pills. The RELAY badge and the New-ticket button look like
  touch controls with nothing drawn specially for them.
- **Airy reads.** The comfortable ladder works as the density argument
  predicts: rail items, filter row and table rows sit at thumb spacing, and
  the seven-row inbox reaches the bottom of the frame where desktop's has room
  to spare. Same DOM, same data, one axis.
- **Springy is not in this frame.** Motion is `expressive` and derived, and a
  still cannot show a spring. terminal and pop have the same gap. Judged live,
  it is the axis most likely to need tuning.
- **The pair.** Next to `inbox-desktop-light.png`, the two frames differ only
  in radius and rhythm, which shows the shared-palette claim directly.

**Verdict: the values stand.** The feel comes from the axes alone.

## Whose is this?

**Round, airy, springy, one bright blue on white.** A pebble screen identifies
itself by its register: the roundest elevated surfaces in the catalogue after
pop, controls sized for a thumb, and a single blue that marks what can be
tapped. The reference-calibrated systems together show that the engine
produces a register with **no recipe code**: three JSON files, eight axes, two
seeds, and every component in the vocabulary re-renders. Nothing in
`packages/react-ui` refers to `pebble`.

Every value here comes from the engine: the blue is a hue seed, the corners
are radii rather than continuous curves, the type is Inter, and the same
engine derives every value, as it does for terminal.

## The divergence floor

pebble falls **1 axis from `pop`** (`colorStrategy`: quiet vs tinted; round,
elevated, comfortable, standard, grotesque, expressive and minimal are all
shared). The divergence law (`packages/theme/src/laws.test.ts`, "holds every
pair of designed systems at least three axes apart") holds invented systems
three axes apart, because two invented systems one axis apart are one idea
under two names. It requires only one axis for a pair that includes a
reference-calibrated system (`plain`, `pebble`, `desktop`, `flint`). A
calibrated system's position is fixed by its targets, so its distance from
another system follows from those targets, not from redundancy in the
catalogue. A touch register and a consumer register do share round corners,
elevation, open spacing and springs. Zero axes apart is forbidden for every
pair, because that is a duplicate whatever it is calibrated to. `desktop` uses
the same floor twice (1 from plain, 2 from pastel).
