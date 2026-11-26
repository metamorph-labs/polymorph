# desktop — rationale

> **A descriptive name.** `desktop` is the desk register: soft corners, real
> elevation, standard rhythm and motion that confirms, laid out for a cursor
> and a keyboard. It is reference-calibrated: its radii, control heights and
> motion follow established desktop-application conventions instead of a
> brief. "Whose is this?" covers how a screen identifies it.

**Direction:** the desk register, for cursor and keyboard: soft corners, real
elevation, standard rhythm and motion that confirms. Controls are 36px tall with
an 8px radius, and panels take a 14px radius. Of the three calibrated registers
(pebble, desktop, flint) it is the quietest and the closest to plain, as desktop
conventions intend.

**desktop and pebble share one palette on two structures.** Both declare
`azure`, and every colour token they resolve is byte-identical: light
`accent.bg #0089ea`, `bg.app #ffffff`, `bg.surface #ffffff`,
`border.default #e3e5e8`, `text.secondary #727375`; dark `bg.app #090a0b`,
`bg.surface #161719`. The whole difference between the desktop and the phone
system comes from three structural axes. This is the palette/system split in
its simplest form: **colour is a palette, shape is a system**.

## Axes

| Axis | Value | Why |
| --- | --- | --- |
| geometry | `soft` | 4/8/14 radii. Desktop controls sit at about 8 and panels at about 12–14, which are `soft`'s `md` and `lg`. `round`'s 12 is the touch reading and belongs to pebble. `crisp` is the squarer, layered reading and belongs to flint. This radius step is the largest single difference between the two azure systems. |
| depth | `elevated` | Windows, sheets, popovers and menus float, layered by shadow, as in a desktop window manager. `borders` is the browser's answer and plain's choice, and taking it would make desktop a re-skin of the default. |
| density | `standard` | 36px `md` controls, the 8/12/16/24 space ladder. A cursor hits a 36px target easily, and desktop apps are used for long sessions. `comfortable` is the touch floor and belongs to pebble. `compact` suits an instrument panel. |
| contrastTemperament | `standard` | Text and separators sit where a neutral ramp puts them: secondary text stays legible and hairlines sit at the ramp's step. `soft` is flint's reading (layered low-contrast surfaces) and `stark` is the instrument reading. |
| typePersonality | `grotesque` | On the desktop a UI grotesque keeps the chrome in the background and the content forward. The axis names the voice. The family is chosen under Fonts. |
| colorStrategy | `quiet` | Neutral surfaces, with blue only where something is interactive or selected, as in pebble. `tinted` would wash every panel and make the accent a background instead of an affordance. |
| motionTemperament | `standard` | Desktop animation is smooth and damped (window transitions, sheet drops, menu fades), without the spring overshoot pebble uses. This is one of the three axes that separate pebble and desktop. `expressive` on a desktop would look like a phone app in a window. |
| ornament | `minimal` | Hover lift and the pending drop's halo, no page texture. The register's decoration is its depth, and translucent material is `depth: glass`, glassmorphic's axis. `grain` would add a decoration the register does not have. |

Divergence: 3 axes from pebble (geometry, density, motion: the entire
phone/desk difference), 3 from dew and flint, 4 from pop and press, 5 from
glassmorphic, 6 from journal, 7 from terminal. **1 from plain and 2 from
pastel**, which the divergence law permits only because desktop is
reference-calibrated. See "The divergence floor" at the end of this document.

## Seeds — `azure`

desktop's colour seeds are in `design/palettes/azure.json`, shared with pebble,
so one rationale covers both:

- **`accentHue: 250`**: a bright interface blue, seeded as a hue family rather
  than a swatch. At high budget it derives to `accent.bg #0089ea`.
- **`neutralHue: 250`, `neutralTint: 0.004`**: cool-tinted greys, with
  `neutralHue` set explicitly to the accent's hue. White stays white under
  `quiet`, and the other greys lean slightly blue.
- **`chromaBudget: high`**: one accent, at full brightness.
- **defaultMode: `system`.** A first visit wears the device's mode and follows it
  until the reader chooses one. Dark re-derives lawfully and reads as the same system.

Every palette is lawful on every system, so it is ordinary for two systems to
share a default palette. This pair is notable because a reader would most expect a
phone system and a desktop system to differ by colour, and they do not.

## Fonts

The desk register wants a screen-UI grotesque published with a variable normal
face.

| Role | Family (`@fontsource-variable/*`) | Why |
| --- | --- | --- |
| body | **Inter Variable** (`inter`) — verified 5.3.0 | A grotesque drawn for screen UI, suited to interface text at desktop sizes. |
| display | **Inter Variable** | Same family. The desk register changes weight and size for a headline, never the face. |
| mono | **JetBrains Mono Variable** (`jetbrains-mono`) | Already in the set. Desktops show code more often than phones, and the repository already relies on JetBrains Mono for it. |

The font block matches pebble's on purpose, for the same reason the palette
does: the difference is in structure. The derived package for
`"Inter Variable"` is `@fontsource-variable/inter`, which both apps install,
so the registry's derived-equals-installed assertion passes.

## Judged from the frame — `proof/shots/inbox-desktop-light.png`

Judged cold against the register's intended feel, soft and standard:

- **Soft reads.** Cards sit on 14 and controls on 8. Next to pebble's 24/12 the
  same surfaces look built for a cursor, not a finger. This is one step from
  the default.
- **Standard reads.** The whole page fits with room below the table, at cursor
  rhythm rather than thumb rhythm. Rail, filter row and table tighten together
  because they read one ladder.
- **Damped reads (by absence).** Nothing in the frame animates for show.
  Elevation does the layering and motion stays out of the still, which is what
  `standard` means.
- **The pair.** Every colour in this frame matches
  `inbox-pebble-light.png`: same blue, white, hairline and secondary grey. The
  desk reading comes from three axes.

**Verdict: the values stand.** The register comes through. The caveat is that
it sits close to plain (the divergence floor below), which follows from the
calibration targets, not from tuning.

## Whose is this?

**Soft, elevated, standard: the desk.** A desktop screen identifies itself by
its register: white sheets lifted off a white page by shadow, 8px controls,
and blue only where something can be clicked. The engine produces the register
with **no recipe code**: one JSON file, eight axes, an existing palette, and
every component in the vocabulary re-renders. Nothing in `packages/react-ui` refers
to `desktop`.

The caveat: desktop is **one axis from plain** (`depth`), and a reader shown
both cold would have trouble telling them apart. Good desktop systems and good
neutral defaults converge, and the divergence law's calibrated floor, below,
exists for this case.

## The divergence floor

desktop falls inside the three-axis band twice: **1 axis from `plain`**
(`depth`: elevated vs borders) and **2 from `pastel`** (`typePersonality` and
`colorStrategy`). The divergence law (`packages/theme/src/laws.test.ts`, "holds
every pair of designed systems at least three axes apart") requires three
differing axes between invented systems, but only one for a pair that includes
a reference-calibrated system (`plain`, `pebble`, `desktop`, `flint`). A
calibrated system's distance from others follows from its targets, not from
redundancy in the catalogue, and desktop conventions do sit one axis from the
neutral default. Zero axes apart is forbidden for every pair. `pebble` uses the
same floor once (1 from pop).
