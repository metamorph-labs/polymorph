# The system and palette documents

A theme is two JSON documents. This file covers the fields a hand edit usually touches. The JSON
Schema is the whole contract. Write it beside the documents, and an editor checks each field of a
document whose `$schema` names it. `theme validate` and the Vite plugin ignore that key:

```sh
npx -y @metamorph-labs/polymorph@1.0.18 theme schema system --out src/theme/system.schema.json
npx -y @metamorph-labs/polymorph@1.0.18 theme schema palette --out src/theme/palette.schema.json
```

Check every edit with `theme validate` (the skill's step 5).

## The system

```json
{
  "$schema": "./system.schema.json",
  "name": "acme",
  "axes": {
    "geometry": "soft",
    "depth": "borders",
    "density": "standard",
    "contrastTemperament": "standard",
    "typePersonality": "grotesque",
    "colorStrategy": "quiet",
    "motionTemperament": "standard",
    "ornament": "minimal"
  },
  "fonts": {
    "body": { "family": "Geist Variable" },
    "display": { "family": "Fraunces Variable", "fallback": "serif" },
    "mono": { "family": "Geist Mono Variable" }
  },
  "defaultPalette": "acme-blue",
  "defaultMode": "light",
  "kind": "designed",
  "overrides": {
    "type": { "base": 14, "sm": 13, "xs": 12 },
    "radius": { "md": 10 }
  }
}
```

`name` is kebab-case and becomes `data-system`. `defaultPalette` is the palette worn with the
system unless another is chosen. `defaultMode` (`light`, `dark` or `system`) gives the colours
of a page where nothing sets `data-mode`, with `system` read as light. On the web the pre-paint
script sets `data-mode` before the first paint, to the reader's stored choice or on a first visit
to the operating system's mode, so `defaultMode` does not decide a first visit. `kind` is
`designed`. A system holds no colour: a colour seed
in it is refused.

| Axis | Values | Decides |
| --- | --- | --- |
| `geometry` | `sharp`, `crisp`, `soft`, `round` | corner radii |
| `depth` | `flat`, `borders`, `elevated`, `glass` | how surfaces separate: shadows, borders, translucent panes |
| `density` | `compact`, `standard`, `comfortable` | space, control heights and the type ratio |
| `contrastTemperament` | `soft`, `standard`, `stark` | how strong edges and supporting text are |
| `typePersonality` | `grotesque`, `humanist`, `mono`, `editorial` | weights, tracking, icon stroke and a font slot’s fallback (below) |
| `colorStrategy` | `quiet`, `tinted` | `tinted` washes surfaces with the neutral hue |
| `motionTemperament` | `none`, `subtle`, `standard`, `expressive` | durations and springs; `none` stops motion |
| `ornament` | `none`, `minimal`, `grain`, `grid` | halos and page texture |

`fonts` has three slots, `body`, `display` and `mono`, each `{ family, fallback?, style? }`.
`body` draws every text step, `text.xs` to `text.3xl`: paragraphs, controls and headings,
`PageHeader`'s title included. `display` draws only the display steps, which
`Hero`'s title uses. `mono` draws code. No slot draws headings alone, so a serif for
headings is one of two edits: a serif `display` changes `Hero`'s title only, and a serif
`body` changes every heading and every paragraph. Say which one the request gets.

`typePersonality` picks no typeface. It sets the weights (`editorial` draws titles at 700), the
tracking, the icon stroke, and the fallback of a `body` or `display` slot that names none: serif
under `editorial`, sans under the others. Give a serif slot `"fallback": "serif"`, so the page
shows a serif while the font loads.

`family` is a Fontsource family name: `Inter Variable` is the package
`@fontsource-variable/inter`, and a name that does not end in Variable is `@fontsource/<name>`. `fallback`
is `sans`, `serif` or `mono`, and `style` `italic` applies to `display` only.
`theme validate` names each package. Install them: the Vite plugin imports them. A typeface
Fontsource does not publish has no lawful way to load, so report it to whoever owns the design
system rather than writing an `@font-face`.

`overrides` changes the value a derived step resolves to. Every field is optional, and each
scale's law is checked on the result.

| Field | Accepts | Changes |
| --- | --- | --- |
| `overrides.type.base` | 12 to 20 px | the paragraph size; every step not set derives from it |
| `overrides.type.ratio` | 1.125 to 1.4 | the step between text sizes |
| `overrides.type.sm` | 10 to 20 px | controls, table cells, menus and labels |
| `overrides.type.xs` | 10 to 20 px | captions and badges |
| `overrides.type.titleWeight` | 300 to 700 | the title steps, in hundreds |
| `overrides.type.displayWeight` | 300 to 700 | the display steps, in hundreds |
| `overrides.radius.md` | 0 to 64 px | one corner step; `sm` and `lg` likewise |
| `overrides.space.5` | 2 to 128 px | one spacing step at standard density; steps 1 to 10 likewise |
| `overrides.controlHeight.md` | 24 to 64 px | one control height; `sm` and `lg` likewise |
| `overrides.focus.width` | 2 to 6 px | the focus ring |
| `overrides.focus.offset` | -6 to 4 px | minus the width keeps the ring inside the edge; 0 to 4 moves it outside |
| `overrides.hover.unfilled` | `wash`, `none` | `none` takes the hover wash off outline and ghost Buttons |
| `overrides.numeric.align` | `end`, `start` | which side numeric table columns sit on |

## The palette

"One brand colour in both modes", below, is a whole palette document.

| Field | Accepts | Holds |
| --- | --- | --- |
| `accentHue` | 0 to 360 | the accent hue in OKLCH degrees; the first chart colour follows it |
| `gradientHue` | 0 to 360 | optional: a second hue for the two gradient roles; absent, they are solid |
| `neutralHue` | 0 to 360 | optional: the hue of the greys; absent, the accent hue |
| `neutralTint` | 0 to 0.03 | how much hue the greys carry |
| `chromaBudget` | `none`, `ink`, `low`, `medium`, `high` | how loud colour is; `none` makes the accent ink |
| `pins` | object | optional: exact colours for a few roles, per mode (below) |
| `moreContrast` | string | optional: the palette a reader who asks for more contrast gets (below) |

A shipped palette also carries `chartCaps`, a record its own laws measure. Leave it out of a
palette the app owns.

## Colour roles, the two modes and the chart colours

A palette holds seeds, not colours. The engine derives every colour role (`background`, `accent`, `text`, `border`, `status`, `selection`, `gradient` and `chart`) twice, once for light mode and once for dark, and holds every text and
focus colour to its contrast floor in both. There is no dark palette and no colour field per role:
`axes --properties` lists the `--pm-*` properties a theme emits, and no app sets one.

The eight chart series colours rotate with `accentHue`, and a `chromaBudget` of `none` or
`ink` keeps the reference hues. The sequential ramp takes the first series colour's hue, and the
diverging pair is the same in every palette. No field sets a chart colour.
`theme validate` prints the chart cap: how many series `ScatterChart` and
`RadarChart` can tell apart.

## Pins

A pin replaces one derived colour with an exact one, in one mode. Pins are for a brand that states
its main button or its focus ring by value. They live in the palette's `pins`, as
`{ "light": { … }, "dark": { … } }`, and take these roles: `accent.bg`, `accent.bgHover`, `accent.bgActive`, `accent.contrast`, `border.focus`, `border.focusSolid` and `accent.gradientTo`.

- A value is an opaque `#rrggbb`. `border.focus` may be `rgb(r g b / a)`.
- A mode the palette does not name keeps every derived colour.
- The contrast law holds a pin and never moves it. A pinned fill answers to the label on it:
  `accent.contrast` reaches Lc 60 on `accent.bg`, `accent.bgHover` and `accent.bgActive`, in
  each mode. A pinned focus colour answers to its floor on each surface. No law reads a pin's hue,
  or how far apart the three fills are.
- `accent.gradientTo` is the gradient's second stop. Pin it when a refusal names the `'to'`
  stop. A palette that derives no second stop (no `gradientHue`, or `chromaBudget` `none`)
  pins it in both modes or in neither.

### One brand colour in both modes

The brand's blue `#1F4FD8` on the main button, in light and dark mode. `theme validate` admits
this palette:

```json
{
  "$schema": "./palette.schema.json",
  "name": "acme-blue",
  "accentHue": 265,
  "neutralTint": 0.006,
  "chromaBudget": "high",
  "pins": {
    "light": {
      "accent.bg": "#1f4fd8",
      "accent.bgHover": "#1744cd",
      "accent.bgActive": "#0f39c2",
      "accent.contrast": "#ffffff"
    },
    "dark": {
      "accent.bg": "#1f4fd8",
      "accent.bgHover": "#1744cd",
      "accent.bgActive": "#0f39c2",
      "accent.contrast": "#ffffff"
    }
  }
}
```

- Pin the three fills together. Hover and pressed derive from `accentHue`, not from the pin, so
  they keep the lightness its ladder gives them: beside `#1F4FD8` they are lighter. The derived fills step OKLCH lightness down
  by about 0.03 (0.62, 0.588, 0.556): `#1744cd` and `#0f39c2` are `#1F4FD8` with its lightness
  0.032 and 0.064 lower.
- Pin `accent.contrast` when the brand states the label's colour. Unpinned, it is chosen against
  the pinned `accent.bg`.
- Pin the same values in `dark`. The engine draws a hued accent fill the same in both modes, and a
  mode with no pins draws the fill `accentHue` derives, not the brand's.
- Set `accentHue` to the colour's OKLCH hue, the `h` of `oklch(L C h)`, which any colour
  converter prints: `#1F4FD8` is `oklch(0.49 0.216 264.5)`. A few degrees off is lawful.
  `accentHue` colours what surrounds the button: the washes, links, selection, focus ring and
  chart colours.
- Under `chromaBudget` `none`, which `neutral` has, the pins hold and the links,
  washes and focus ring stay grey. Raise it for them to take the hue.

## The more-contrast partner

`moreContrast` names another palette document. Its colours replace this palette's for a reader
whose system asks for more contrast or forces colours. The system's other tokens stay. Give it to
`theme validate` and `theme emit` as the third path, or save it as `<name>.json` beside the
palette. In `vite.config`, list it among `palettes`. It reaches web pages only.

## A guest pairing

A system or palette the app wrote is a guest. It answers to the laws a shipped pairing answers to:
`schema`, `resolution`, `coherence`, `contrast`, `gradient`, and `glass` when
`depth` is `glass`, in both modes and on the partner too. `theme validate` lists as
`exempt` the catalogue's own laws, which keep the shipped systems and palettes apart, and adds a
`note` when a name is also a shipped one: rename it, because names are attributes on the page.

## Refusals and their answers

| The message says | Change |
| --- | --- |
| `system.axes.density: Invalid option: expected one of …` | Use one of the values it lists. |
| `system: Unrecognized key: "accentHue"` | Move the key to the other document, or remove it. |
| `the merged ladder puts xs at 9.5px, under the 10px floor — set type.xs` | Set the field the message names. |
| `text.2xl is 20.5px at weight 300 … set a heavier titleWeight, or raise type.base or type.ratio` | Take one of the two answers it gives. |
| `accent.contrast on accent.bgHover reached Lc 34.0, floor is 60. … which the palette pins in light mode` | Pin `accent.bgHover` and `accent.bgActive` near the pinned fill. |
| `accent.contrast on accent.gradient reached Lc 29.2 at its 'to' stop` | Pin `accent.gradientTo` near the fill, or drop `gradientHue`. |
| `moreContrast: … admission was not given that palette` | Pass the partner as the third path, or put it beside the palette. |
