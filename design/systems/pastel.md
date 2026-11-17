# pastel — rationale

**Direction:** the crafted-SaaS register: warm and calm. Soft geometry, real elevation,
generous rhythm, humanist letterforms, and one restrained violet. Light-first for a daytime
tool. Dark mode is a re-derivation, not the brand.

The design test: a screen should look designed by one person whose priority is calm.
Hierarchy comes from space, weight and one accent used sparingly.

Bar: **commerce-grade polish**: pressable-looking solids, layered surfaces, engineered
forms, composed empty space. Without it, calm looks like a prototype: flat fills,
uncontained tables, a loose rhythm.

## Axes

| Axis | Value | Why |
| --- | --- | --- |
| geometry | `soft` | 4/8/14 radii: approachable, not toy-like. `round` (6/12/24) looks consumer, and pastel is a working tool. |
| depth | `elevated` | Soft layered shadows separate surfaces from the page. Coherence pairs soft radii with shadow, never sharp radii with shadow. |
| density | `standard` | 1.25 type ratio, 36px `md` controls. The `comfortable` multiplier (1.15) under a soft temperament makes the layout loose. |
| contrastTemperament | `standard` | Primary text holds the floor (step 12), secondary text sits at step 11, borders are unshifted. `soft` would let the hierarchy recede until the page looks unfinished. |
| typePersonality | `humanist` | The theme's main voice. Gentle tracking, 600 display weight. |
| colorStrategy | `tinted` | A low-chroma violet wash on surfaces (`tinted` ramp), so empty screens are not bare. It starts one step down the ladder, where sRGB can hold it. |
| motionTemperament | `standard` | Warm motion without theatrics. `expressive` suits a demo, not daily work. |
| ornament | `minimal` | Hover lift, focus halo and the violet glow. Other decoration goes into the tinted washes and the gradient where the vocabulary offers them. No texture. |

Divergence: 8 axes from terminal (the two founding systems, held at least five apart by law
and placed at opposite corners of the axis space on purpose), 6 from journal, 5 from dew,
glassmorphic, pebble and press, 4 from pop, 3 from flint and plain, and 2 from desktop (which
is reference-calibrated; see `desktop.md`).

## Seeds — `amethyst`

pastel's colour seeds are in `design/palettes/amethyst.json`.

- **`accentHue: 298`**: violet, on the warm side of indigo, set by two constraints. The
  nearest status anchor (danger 25, warning 75, success 150, info 240) is 58° away, so an
  accent button cannot pass for a status surface. It is also clear of the generic SaaS
  "blurple" band (~265–285), so it looks chosen rather than default.
- **`gradientHue: 265`**: indigo-lavender, 33° from the accent: close enough to read as one
  violet, far enough to give a gradient direction. `bg.wash` resolves to a faint `298 → 265`
  diagonal at page chroma in both modes (dark re-derives on the dark ladder as deep violet,
  not inverted light), and the primary button's fill uses the same two hues
  (`#926fd4 → #5077d5` in light).
- **`neutralTint: 0.02`**: lavender-greys, related to the accent but still grey (the maximum
  is 0.03). This tints the page before any accent appears. A lower tint colours the controls
  but not the background. No `neutralHue` is seeded, so the neutrals follow the accent's
  hue, as pastel intends.
- **`chromaBudget: medium`**: humanist, not neon. Peak 0.15 puts `accent.bg` at #926fd4,
  saturated enough for a primary button.
- **defaultMode: `light`.**

## Fonts

| Role | Family (`@fontsource-variable/*`) | Why |
| --- | --- | --- |
| body | **Plus Jakarta Sans Variable** (`plus-jakarta-sans`) | A geometric-humanist hybrid, warm at 400 and firm at 600. The J and the a make it recognisable at body sizes. |
| display | **Plus Jakarta Sans Variable** | Same family on purpose. Display contrast comes from weight (600) and scale, which keeps the voice calm. |
| mono | **Fira Code Variable** (`fira-code`) | A humanist mono from the body face's tradition, for IDs and code fragments. |

The engine derives the fallback stacks (`docs/theming.md`, the three font slots): the system
sans stack for sans personalities and the system mono stack for mono, all with
`font-display: swap` from fontsource. The apps load the packages per system
(`apps/workbench/src/fonts.ts`). The library bundles no fonts.

## What inspecting `/tokens` settled

Three engine values that pastel's surfaces determine (all in `@polymorph/theme`):

1. **Elevated shadow recipes** (`derive.ts`, `DEPTH_SHADOW_LAYERS.elevated`). A single
   stock `raised` shadow disappears on pastel's tinted surfaces, leaving a flat card with a
   hairline. The raised shadow has three layers, each longer and lighter than the last (a
   1px contact line out to `0 16px 32px / 0.07`), so depth reads as distance without more
   total darkness. `overlay` gets the long throw (`0 20px 48px / 0.16`) so dialogs float
   and cards sit.
2. **Title weights in the text scale** (`derive.ts`, `PERSONALITY.titleWeight` +
   `XL_WEIGHT`). At body 400, `text.2xl`/`text.3xl` in Plus Jakarta at 35–45px look like an
   enlarged paragraph. Components may not choose weights, so the scale holds the decision:
   `xl` at a fixed 500, `2xl`/`3xl` at the personality's title weight (600 for humanist).
3. **Warning status hue** (`color/ramp.ts`, `STATUS_HUES.warning` 75, harmony 1). At the
   solid-fill lightness the shared ladder pins, hue 85 renders #a97f00, a mustard-olive that
   looks broken, not cautionary. 75 at full harmony renders #b37900 amber in both modes.
   This affects every theme.

Inspected and kept as derived: `CHROMA_CURVE` (accent washes at steps 3–5 read as tints,
not pale brand) and `SURFACE_TINT_CHROMA.medium` (0.016 survives gamut mapping on light
surfaces: visible, still neutral).

## Signatures

1. **Lit fills.** Under `elevated`, every solid gets the contact seat and an inset top
   light. Hover adds the violet glow (permitted by `minimal` ornament, alpha 0.16 under
   elevated).
2. **Page wash.** AuthPage's empty area carries the violet wash (`bg.wash`) in both modes.
   Surfaces without a wash are unaffected.

## What the shared recipes render as, under pastel

- ListPage's panel: an elevated card around the table, so the data region is contained.
- Selection on the rail and in rows is distinct from hover. Figures align in the body face.
- **FormPage anchors its committing row** with a rule above the actions
  (`--pm-border-subtle`, `--pm-space-5` above), so form actions never float. The recipe is
  theme-neutral, so every system gets it (`design/archetypes/form-page.md`).

## Register judgment (side-by-side, home mode)

Against the commerce-grade register:

- **Holds the register:** tight rhythm at standard density, deliberate header-to-content
  joins, the table in a card panel, seated and lit solids with a hover glow, legible
  secondary text, anchored form actions, the violet wash on the auth page in both modes,
  and selection distinct from hover.
- **Known gap:** the display face is Jakarta at a heavier weight. Optical treatments improve
  letterfit, but the display moment relies on weight and scale, not a second face.
- **"Whose is this?"**: lavender-tinted neutrals, one restrained violet, soft but standard
  rhythm, and a faint violet gradient.

## Both modes

Light is the primary mode: near-white violet surfaces on a lavender page, elevation by
shadow. Dark re-derives: a #0b090f page rising to #2b2831 overlays (elevation-as-lightness),
the same violet fills (solids are mode-pinned), and the tint kept in the greys. Every lawful
pairing passes in both modes, verified in `/tokens` and by the resolve tests.
