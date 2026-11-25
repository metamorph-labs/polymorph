# design/palettes/

A **palette** is the colour seeds: `accentHue`, `gradientHue?`, `neutralHue?`,
`neutralTint`, `chromaBudget`, `pins?`, plus `chartCaps`, the measured any-neighbour cap record.
`chartCaps` is stored here because the cap belongs to the palette, but the chart-law sweep
measures it and no derivation takes it as input (`docs/charts.md`). `pins` states exact colours
for the accent fills, their label, the focus pair and the colour the accent gradient runs to, and
`moreContrast` names the palette a reader who asks for more contrast gets instead. No house
palette uses either
(`docs/theming.md`). A **system**
(`design/systems/`) is the structure: the eight axes, the three font slots, the
presentation defaults. A **pairing** is one system × one palette. It is the unit that
resolves, emits, and is applied to the DOM (`docs/theming.md`).

Every palette is lawful on every system: the theme package's law suite resolves the whole
cross-product through the contrast and coherence laws. A system pins a `defaultPalette` and
nothing else, so an unusual pairing is permitted, just not chosen by default.

| Palette    | Default of  | Values                                                        |
| ---------- | ----------- | ------------------------------------------------------------- |
| `neutral`  | plain       | accentHue 0 · neutralTint 0 · `none`                           |
| `petrol`   | terminal    | accentHue 200 · neutralTint 0.006 · chromaBudget `high`        |
| `amethyst` | pastel      | accentHue 298 · gradientHue 265 · neutralTint 0.02 · `medium`  |
| `umber`    | journal     | accentHue 75 · neutralTint 0.008 · `ink`                       |
| `carmine`  | press       | accentHue 356 · neutralTint 0.003 · `medium`                   |
| `orchid`   | pop         | accentHue 335 · gradientHue 295 · neutralTint 0.014 · `high`   |
| `ember`    | harbor      | accentHue 31 · neutralTint 0.019 · `low`                       |
| `azure`    | pebble, desktop, glassmorphic | accentHue 250 · neutralHue 250 · neutralTint 0.004 · `high` |
| `cobalt`   | flint       | accentHue 240 · neutralHue 240 · neutralTint 0.004 · `medium`  |
| `verdigris`| dew         | accentHue 178 · neutralHue 80 · neutralTint 0.006 · `medium`   |
| `iris`     | —           | accentHue 291 · neutralHue 291 · neutralTint 0.008 · `high`    |
| `ochre`    | —           | accentHue 50 · neutralHue 85 · neutralTint 0.01 · `medium`     |
| `zinc`     | —           | accentHue 286 (inert) · neutralHue 286 · neutralTint 0.013 · `none` |

`iris`, `ochre` and `zinc` are not the default of any house system: a deep violet, a burnt
orange over warm stone, and a cool achromatic grey, each calibrated to a fixed target. They
exist for products that bring their own systems through `admitTheme` (`docs/theming.md`)
instead of adding them here. A palette belongs to no system, so they stay, lawful on every
system.

**`azure` is the default of three systems on purpose.** `pebble` and `desktop` share one
palette on two structures. Every colour token they resolve is byte-identical (light
`accent.bg #0089ea`, `bg.app #ffffff`, `border.default #e3e5e8`), and the whole
phone-versus-desk difference comes from three structural axes. `glassmorphic` uses the same
palette on a third structure and adds material. The palette/system split makes a shared
palette possible, and this is the catalogue's clearest example of it. `cobalt` is flint's,
a step quieter at `medium` because flint is a step quieter than pebble. The two calibrated
blues sit 10° apart, inside the 20° accent-hue band. The band law exempts that pair by name
because both are deliberately calibrated to the same blue band (`design/systems/flint.md`).
`amethyst`/`iris` and `ember`/`ochre` are exempt on the same grounds, because `iris` and
`ochre` are calibrated to fixed target hues.

`neutral` is the achromatic palette. At `chromaBudget: none` the accent family derives from
the *neutral* ramp's ends instead of from a hue, so the primary is ink. Its `accentHue` is
present and inert, and its neutrals are a true grey. Status families keep their chroma
floor, so status colours keep a minimum chroma instead of turning grey.

**`neutralHue` is optional.** A palette that omits it takes the neutral ramp's hue from
`accentHue`. `azure`, `cobalt`, `iris` and `zinc` set it equal to their accent. That states
explicitly what other palettes get by default, so the greys lean the same way as the
accent. `verdigris` and `ochre` set it *away* from the accent. `verdigris` is a 178° teal
over 80° warm stone: a cool accent on warm neutrals, which is what the separate seed exists
for. Its name is a pigment (the residue weather leaves on copper) and claims no system.
`dew` is the system that declares it.

## The naming rule

**Palette names are pigments, so they name no system.** A palette can be shared across
systems, so its name must not claim one: `amethyst`, not `pastel-purple`.

**`ember` and `harbor` are separate names on purpose.** The tenant's palette is not named
after the tenant, even though a tenant is mostly a palette, because one word naming two
kinds of thing causes collisions. `ember` names the pigment and claims no system. `harbor`
is the tenant's system, where a brand name belongs and describes it best. Its system file
is `terminal`'s axes plus its own display and mono fonts.

**`neutral` is the one exception, and it follows the rule's intent.** A pigment name for a
palette with no pigment (`graphite`, say) would follow the naming rule literally and break
its intent. At `chromaBudget: none` there is no pigment to name. `neutral` names what is in
the file, and it is still system-free: any system can use it.
