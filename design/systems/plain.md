# plain — rationale

> **`plain` is the catalogue's calibrated default.** Its spec is a set of measured target values
> (radii, control heights, the twelve-step lightness ladder, the ring, the chart hexes), and the
> shared derivation is tuned so ordinary seeds hit them exactly. Its palette is `neutral`. It is
> the look a product has before anyone chooses one.

**Direction:** the quiet default: neutral, precise, and it does not compete with the product. Soft
geometry, hairline separation, standard rhythm, a grotesque, and an *ink* primary instead of a
hue. Light-first. Dark re-derives, and the ink inverts with it.

The design test: a screen should look unchosen, yet every choice in it is deliberate. A default
has to be unobjectionable at every size, in both modes and on every screen.

plain's target values are its spec. The engine is extended where it cannot express a target, and
every divergence from one has a stated reason. The other house systems are designed, then
measured. plain is measured, then designed, so it is the baseline for the rest.

## Axes

| Axis | Value | Why |
| --- | --- | --- |
| geometry | `soft` | 4/8/14 radii: controls on 8 and panels on 14, soft's `md` and `lg` exactly. `crisp` looks engineered and `round` looks consumer. A default should look neither. |
| depth | `borders` | Separation by hairline, the cheapest boundary and one that works on any background. Shadows stay faint and only mark which surface is on top. `elevated` (pastel's) is too opinionated for a default. |
| density | `standard` | 1.25 type ratio, 36px `md` controls. `compact` suits a console and `comfortable` a brochure. A default is neither. |
| contrastTemperament | `standard` | Secondary text stays legible and borders sit where the ramp puts them. Soft and stark are both stances, and a default takes neither. |
| typePersonality | `grotesque` | Even colour, no calligraphic traits, legible before characterful, so the interface recedes behind the content. |
| colorStrategy | `quiet` | Neutral surfaces. A wash would be the system's only hue and would dominate every screen. `quiet` is the only strategy that fits an achromatic palette. |
| motionTemperament | `standard` | Motion confirms without performing. `subtle` with borders would feel unresponsive, and `expressive` with an ink primary would feel like another product. |
| ornament | `minimal` | Hover lift and the pending drop's halo only. At `chromaBudget: none` the glow resolves to a fully transparent colour and the gradient to the plain fill regardless. |

Divergence: plain is reference-calibrated, so the divergence law requires one differing axis in
any pair that includes it, not three. `desktop` differs by 1 (`depth`, see `desktop.md`). Every
other house system differs by at least 3.

## Seeds — `neutral`

plain's seeds are in `design/palettes/neutral.json`, the shortest palette in the repository:

- **`accentHue: 0`**: present and inert. A palette must name a hue, but at `chromaBudget: none`
  it never paints. Zero is the value least likely to read as a preference.
- **`neutralTint: 0`**: a true grey. Other systems tint their neutrals toward their accent.
  plain has no accent, so any tint would be a stray hue.
- **`chromaBudget: none`**: no hue at all, unlike `ink`, which keeps one at very low chroma. The
  accent derives from the neutral ramp's ends instead of from a hue. `accent.bg` is ink in light
  and near-white in dark. This is the only budget where the solid ladder's light-pinning gives
  way, because an ink fill acts as a foreground, and foregrounds invert. Status families keep
  their chroma floor (`STATUS_CHROMA_FLOOR`), so status colours stay saturated.
- **defaultMode: `light`.**

## Fonts

| Role | Family (`@fontsource-variable/*`) | Why |
| --- | --- | --- |
| body | **Geist Variable** (`geist`) | A grotesque drawn for screens: tall x-height, open apertures, unambiguous at 14px, the size most product text uses. `@fontsource-variable/geist` ships it as a variable build. |
| display | **Geist Variable** | Same family on purpose. Display contrast comes from weight and scale. A second face would pull attention from the content. |
| mono | **Geist Mono Variable** (`geist-mono`) | The body face's mono pair, for IDs, timestamps and code. The shared skeleton keeps a table of IDs consistent with the text around it. |

The engine derives the fallback stacks (`docs/theming.md`, the font slots): the system
sans stack for both sans slots and the system mono stack for mono, all with `font-display: swap`
from fontsource. The apps load the packages per system (`apps/workbench/src/fonts.ts`). The
library bundles no fonts.

## Why ink

Every other system uses a hue for its primary. plain uses lightness: the darkest colour on the
page fills the primary button. The only remaining chroma is in status colours, so colour only
carries meaning. No contrast is spent making an accent legible, no status band needs protecting
from the accent, and no screen shows the wrong brand shade.

This is why plain is the default. A tenant first supplies a hue (`design/palettes/`, one file).
plain is the product before that, and before a hue is chosen the right answer is no hue, not an
arbitrary grey-blue.

## Both modes

Light is the primary mode: white page, white cards with hairlines, ink fills, faint shadows on
controls and cards. Dark re-derives instead of inverting wholesale. The near-black page rises in
lightness to the surfaces above it (elevation-as-lightness), separation stays hairline-first, and
the ink fill inverts to near-white with dark contrast text. Both modes pass the contrast law with
no exemption, and the inverted fill is tested to pass, not assumed to.

---

**plain is the shipped default** (`design/defaults.json`). The palette/system split keeps this
cheap: every other system stays installed, listed and lawful with its own palette, and one word
selects what the product opens as.
