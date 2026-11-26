# pop — rationale

**Direction:** the system that tests how far the axes stretch: round geometry, real
elevation, a pink→violet gradient, expressive motion. Bar: **disciplined consumer energy**:
saturated colour and round shapes over rigorous hierarchy, and motion without jank.
Gamification is out of scope.

pop is the outlier most likely to expose coherence gaps. Its two signatures exercise two
engine capabilities harder than any other system: two-hue gradients and stagger.

## Axes

| Axis | Value | Why |
| --- | --- | --- |
| geometry | `round` | 6/12/24, the friendly register. |
| depth | `elevated` | Soft shadows seat the round shapes. A flat round shape looks like a sticker. |
| density | `comfortable` | Consumer spacing: big targets, generous rhythm. |
| contrastTemperament | `standard` | The colour is loud, so the hierarchy stays standard. |
| typePersonality | `grotesque` | Geometric, friendly letterforms carry the playfulness without novelty styling. |
| colorStrategy | `tinted` | The page itself is tinted (tint 0.014 at hue 335), so pop never shows plain grey. |
| motionTemperament | `expressive` | 1.35× travel, ζ≈0.70 springs, 0.95 press, real `overshoot` easing, the liveliest ambient periods. |
| ornament | `minimal` | Glows but no texture. pop's decoration goes into gradient and motion. |

Divergence: 3 axes from glassmorphic, 4 from pastel (geometry, density, type
personality, motion; hue and the gradient identity add further distinctness), 4 from
flint and desktop, 5 from plain, 6 from dew, 7 from journal and press, 8 from terminal.
`pebble` sits **1 axis** away (`colorStrategy`), which the divergence law permits only
because pebble is reference-calibrated (see `pebble.md`). Accent band clear (335 vs 298 =
37°).

## Seeds — `orchid`

pop's colour seeds are in `design/palettes/orchid.json`.

- **`accentHue: 335`, `gradientHue: 295`, `chromaBudget: high`**: magenta-pink paired
  toward violet. The pair runs away from the danger band (25), so the gradient's far stop
  at 295 never reads as an alarm. It is 50° from danger and 37° from pastel's violet. At
  high budget the fills are fully saturated consumer colour.
- **`neutralTint: 0.014`**: the tinted page. `tinted` puts the wash on surfaces so even
  empty states are warm.
- **defaultMode: `system`.** A first visit wears the device's mode and follows it until the
  reader chooses one. Dark derives to saturated mode-pinned fills over deep plum
  neutrals, and it is lawful.

## Fonts

| Role | Family (`@fontsource-variable/*`) | Why |
| --- | --- | --- |
| body | **Outfit Variable** (`outfit`) | Geometric and contemporary, friendly at text sizes without looking like a toy. |
| display | **Bricolage Grotesque Variable** (`bricolage-grotesque`) | A display face with character: chunky, variable opsz. It gives the masthead its personality. |
| mono | **JetBrains Mono Variable** (`jetbrains-mono`) | Already in the set. pop rarely shows code. |

## Signatures

1. **Two-hue gradient accents.** `--pm-accent-gradient` runs pink→violet
   (`#cd46b7 → #8a57e9` in light). The primary button's fill, Slider's range and
   Progress's fill use it. Progress has one state, so the gradient needs no hover ladder
   there. The button keeps its solid colour ladder underneath and uses the glow for hover
   feedback. The theme-neutral form covers every theme: a theme without a gradient
   partner resolves the role to the same pinned step-9 solid as `accent.bg`, so terminal,
   journal, press and harbor render byte-identically, pastel's fill gets its faint violet
   gradient, and pop's runs pink→violet.
2. **Cascade choreography.** Menu items enter under the panel's own scale-fade as fade +
   2px drift, each delayed by `index × --pm-motion-stagger-step` and clamped to
   `--pm-motion-stagger-max` (the index ladder stops at twelve, and later items share the
   ceiling). Temperament sets the character through the tokens alone: pop cascades at
   32ms/item, terminal at about 19ms, and `none` derives zero. Reduced motion reduces the
   cascade to presence, because a delay is motion even when the delayed thing is not.
   Derivation and law verify the values. The feel can only be judged live.

## What the shared recipes render as, under pop

- Lit fills seat the magenta solids (elevated depth). Hover adds a pink glow (alpha 0.16)
  in the accent's own colour.
- ListPage's panel: a round elevated card, the friendliest render in the catalogue.
- Selection: tinted wash with magenta text across the rail.
- The auth page's empty area: the pink→violet `bg.wash`, the screen where pop looks most
  like a consumer product's front door.

## Register judgment (side-by-side, home mode)

- **Passes the register:** the inbox stays rigorous (hierarchy, density and status
  discipline hold) while the geometry, tinted neutrals and magenta CTA give it consumer
  energy. The progress gallery shows the gradient identity working: danger stays a solid
  alarm colour, out-of-range values clamp, captions compose. The identity is pop's own:
  magenta to violet, Bricolage at the masthead, tinted neutrals throughout.
- **Known gap:** expressive motion is derived and lawful, but its feel (cascade
  character, overshoot, the spring-pop celebration on completion) can only be judged live,
  because stills cannot approve choreography. The same holds for dark mode. The gradient
  identity is limited to the primary button, Slider, Progress and the wash. Any further use
  (an Avatar ring, a Badge accent) has to be justified against restraint, not added by
  default.
- **"Whose is this?"**: pop's own, and obviously so.
