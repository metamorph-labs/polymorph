# glassmorphic — rationale

> **A descriptive name.** `glassmorphic` names a material idiom no one house
> owns (the web calls it glassmorphism), and the name says what the system is
> made of. A screen identifies itself by its material: azure's blue as a hue
> family, panes that blur what is behind them, and a contrast law that sets
> how translucent they may be.

**Direction:** the material register. Chrome and transients (menus, dialogs,
palettes, popovers) are translucent panes that blur and saturate what is behind
them, and separate by material instead of lightness or shadow. The system exists
to exercise `depth: glass`, which pebble and desktop (on `elevated`) do not use.

**Three systems, one palette.** glassmorphic declares `azure`, like pebble and
desktop, so all three resolve byte-identical colour tokens. The glass comes
from depth, temperament, tint and motion: colour is a palette, while shape and
material belong to the system.

## Axes

| Axis | Value | Why |
| --- | --- | --- |
| geometry | `round` | 6/12/24 radii. A glass pane with sharp corners looks like a shard. The idiom rounds generously, often concentrically, which this engine does not draw, so 12 at `md` is the nearest reading, as for pebble. |
| depth | `glass` | The system's reason to exist. Transient panes go translucent over a blurred, saturated backdrop (`--pm-material-*`). Shadows thin toward long, light washes, because the material does the separating that alpha does for `elevated`. The glass law (below) sets the translucency. |
| density | `standard` | 36px `md`, the 8/12/16/24 ladder. The material is the distinguishing feature, so the layout does not also open up. `comfortable` belongs to the touch reading, which this is not. |
| contrastTemperament | `soft` | Layered translucent planes need surfaces that sit close together, which is what `soft` gives. `standard` would draw the panes' text and hairlines as if on paper. The glass law keeps the softer reading lawful. |
| typePersonality | `grotesque` | The material is the feature, so the type stays neutral. A grotesque reads as chrome on glass. |
| colorStrategy | `tinted` | Glass takes colour from what is behind it. A tinted wash on resting surfaces gives the blur palette colour to saturate, where `quiet` would leave it nothing. This is flint's tinted-material argument, applied to a material that really blurs. |
| motionTemperament | `expressive` | Floating panes move like objects: springs, slight overshoot, a press that gives. Linear easing would make the glass look printed. This also separates it from desktop, whose motion only confirms. |
| ornament | `minimal` | Hover lift and the pending drop's halo only. The specular top edge (`insetTop` at its brightest, 20% white) is part of the depth derivation, not ornament. Grain over glass would be two competing textures. |

Divergence: 3 from pop (depth, density, temperament; the closest neighbour,
since pop is the consumer register on elevation and this is the material
register on glass), 3 from flint (geometry, depth, motion; flint layers in
lightness, glassmorphic in material), 4 from pebble (depth, density,
temperament, colour), 5 from dew, desktop, plain and pastel, 6 from press, 7
from journal, 8 from terminal. The three-axis floor holds without the
calibrated exemption.

## Seeds — `azure`

Shared with pebble and desktop, unchanged: `accentHue 250`, `neutralHue 250`,
`neutralTint 0.004`, `chromaBudget high`. Using the same palette is the point:
see "Three systems, one palette".

## The glass law, and what the mix costs

A glass pane's backdrop is unknown at resolve time, so the law
(`auditGlassPairings`, swept in `laws.test.ts`) measures the worst case. The
pane (`bg.surface` at the mode's `GLASS_SURFACE_MIX`) is composited over pure
black and pure white, and every text pairing lawful on the surface must clear
its own APCA floor on both composites. Any real backdrop falls between the
extremes, so passing both means passing all.

The measured results:

- **Light mode: 96%.** `text.secondary`'s Lc 60 over a black worst case is the
  binding constraint. At 84% mix it reads Lc 43.9. A light pane is at risk from
  dark content scrolling under it, and 96 is the lowest whole percent at which
  every shipped palette passes.
- **Dark mode: 91%.** `text.muted`'s Lc 45 over a white worst case binds. Dark
  glass is lawfully more transparent than light because the floors price the
  two risks differently, not by taste.
- **The pane uses the surface role, not the overlay ladder.** Dark mode
  expresses elevation as lightness, and a lighter pane cannot keep light text
  lawful below a 99% mix, which would mean no glass. `depth: glass` drops that
  cue and uses material for lift instead. A transient pane paints
  `--pm-material-surface` (the surface role at the mix), and blur, the specular
  edge and the cast shadow detach it.
- **It still reads as glass** because the mix is the smallest part of the
  effect. `blur(24px) saturate(1.5)` turns the backdrop into a low-frequency
  colour wash, which is also why the solid-extreme measurement is a valid
  bound. The 20%-white top edge adds the highlight.

Delineation pairs are exempt on the pane by design. A hairline's ΔL cannot be
guaranteed over an arbitrary backdrop, and on glass the material provides the
separation a hairline gives elsewhere. Text has no such substitute, so the law
holds text everywhere.

## Where the material applies

The transient family (menu, select, combobox, popover, dialog, command, context
menu, hover card, drawer, sheet, the pickers, the chart tooltip, split button's
dropdown) gets the material through a style query on the exposed depth axis
(`@container style(--pm-axis-depth: glass)`). The recipes stay theme-neutral
and never know which house system they are in. Resting surfaces (page, cards,
rail) stay opaque. Content is what glass floats over, and a translucent rail
would put the law's worst case under the navigation. So `bg.app` and
`bg.subtle` are not `GLASS_BACKGROUNDS`, and the audit enforces that boundary.

## Whose is this?

A cold screen shows a round, soft-contrast, azure-tinted product whose menus
are frosted glass panes. The corners are radii (12, not concentric), the blue
is a family and not a swatch, and the type is Inter. The system refuses one
common glass technique, text on thin glass made legible per pixel by vibrancy,
because the contrast law cannot measure it. The glass is exactly as
translucent as the contrast law can prove, and no more.
