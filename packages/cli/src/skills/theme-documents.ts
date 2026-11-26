import type { Registry } from '@polymorph/registry'
import { paletteJsonSchema, systemJsonSchema } from '@polymorph/theme'

import { DEFAULT_SYSTEM } from '../plan'
import { all, commands, Facts, SkillFactError } from './facts'

/** The part of a JSON Schema node this text reads. */
interface Schema {
  type?: string
  properties?: Record<string, Schema>
  enum?: readonly unknown[]
  minimum?: number
  maximum?: number
  pattern?: string
}

/** The node at a dotted path below a schema's properties, which must exist. */
function at(schema: Schema, path: string): Schema {
  let node = schema
  for (const key of path.split('.')) {
    const next = node.properties?.[key]
    if (next === undefined) throw new SkillFactError(`the theme schema has no field ${path}`)
    node = next
  }
  return node
}

/** What a field accepts, in a few words, read from the schema. */
function accepts(schema: Schema, path: string): string {
  const node = at(schema, path)
  if (node.enum !== undefined) return node.enum.map((value) => `\`${String(value)}\``).join(', ')
  if (node.minimum !== undefined && node.maximum !== undefined) {
    return `${node.minimum} to ${node.maximum}`
  }
  if (node.pattern === '^#[0-9a-fA-F]{6}$') return '`#rrggbb`'
  return node.type ?? ''
}

/**
 * JSON as a person writes a document: two-space indents, and an object that holds no other object
 * on one line when that line fits in 80 characters.
 */
function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(
    /^( *)(.*)\{\n([^{}]*?)\n *\}/gm,
    (whole: string, indent: string, head: string, inner: string) => {
      const line = `${indent}${head}{ ${inner.trim().split(/,\n */).join(', ')} }`
      return line.length <= 80 ? line : whole
    },
  )
}

/** What each design axis decides. An axis this list lacks is listed with its values only. */
const AXES: Record<string, string> = {
  geometry: 'corner radii',
  depth: 'how surfaces separate: shadows, borders, translucent panes',
  density: 'space, control heights and the type ratio',
  contrastTemperament: 'how strong edges and supporting text are',
  typePersonality: 'weights, tracking, icon stroke and a font slot’s fallback (below)',
  colorStrategy: '`tinted` washes surfaces with the neutral hue',
  motionTemperament: 'durations and springs; `none` stops motion',
  ornament: 'halos and page texture',
}

/** The system's amendments a hand edit usually makes, with what each changes. */
const OVERRIDES: [path: string, unit: string, changes: string][] = [
  ['type.base', 'px', 'the paragraph size; every step not set derives from it'],
  ['type.ratio', '', 'the step between text sizes'],
  ['type.sm', 'px', 'controls, table cells, menus and labels'],
  ['type.xs', 'px', 'captions and badges'],
  ['type.titleWeight', '', 'the title steps, in hundreds'],
  ['type.displayWeight', '', 'the display steps, in hundreds'],
  ['radius.md', 'px', 'one corner step; `sm` and `lg` likewise'],
  ['space.5', 'px', 'one spacing step at standard density; steps 1 to 10 likewise'],
  ['controlHeight.md', 'px', 'one control height; `sm` and `lg` likewise'],
  ['focus.width', 'px', 'the focus ring'],
  ['focus.offset', 'px', 'minus the width keeps the ring inside the edge; 0 to 4 moves it outside'],
  ['hover.unfilled', '', '`none` takes the hover wash off outline and ghost Buttons'],
  ['numeric.align', '', 'which side numeric table columns sit on'],
]

/** The palette's fields, with what each holds. */
const PALETTE: [field: string, holds: string][] = [
  ['accentHue', 'the accent hue in OKLCH degrees; the first chart colour follows it'],
  ['gradientHue', 'optional: a second hue for the two gradient roles; absent, they are solid'],
  ['neutralHue', 'optional: the hue of the greys; absent, the accent hue'],
  ['neutralTint', 'how much hue the greys carry'],
  ['chromaBudget', 'how loud colour is; `none` makes the accent ink'],
  ['pins', 'optional: exact colours for a few roles, per mode (below)'],
  ['moreContrast', 'optional: the palette a reader who asks for more contrast gets (below)'],
]

/**
 * What a system and a palette document hold, for a model editing one by hand:
 * each field a hand edit usually touches, pins, the more-contrast partner, the
 * laws a guest pairing answers to, and each refusal with its answer. Ranges
 * and pinnable roles are read from the documents' JSON Schemas, and the axes
 * from the registry, so the text follows the schema.
 */
export function documentsReference(registry: Registry, run: string): string {
  const f = new Facts(registry)
  const system = systemJsonSchema() as Schema
  const palette = paletteJsonSchema() as Schema
  const plain = registry.theme.systems.find((entry) => entry.name === DEFAULT_SYSTEM)
  if (plain === undefined) throw new SkillFactError(`no system called ${DEFAULT_SYSTEM}`)
  const family = (role: string): string => {
    const found = plain.fonts.find((font) => font.roles.includes(role))
    if (found === undefined) throw new SkillFactError(`${DEFAULT_SYSTEM} has no ${role} font`)
    return found.family
  }
  // A serif display face from the catalogue: the editorial system's, which `propose` also uses.
  const serif = registry.theme.systems
    .find((entry) => entry.axes['typePersonality'] === 'editorial')
    ?.fonts.find((font) => font.roles.includes('display'))?.family
  if (serif === undefined) throw new SkillFactError('no editorial system has a display face')
  const example = {
    $schema: './system.schema.json',
    name: 'acme',
    axes: plain.axes,
    fonts: {
      body: { family: family('body') },
      display: { family: serif, fallback: 'serif' },
      mono: { family: family('mono') },
    },
    defaultPalette: 'acme-blue',
    defaultMode: 'system',
    kind: 'designed',
    overrides: { type: { base: 14, sm: 13, xs: 12 }, radius: { md: 10 } },
  }
  const axes = registry.theme.axes.map(
    (axis) =>
      `| \`${axis.name}\` | ${axis.values.map((value) => `\`${value}\``).join(', ')} | ${AXES[axis.name] ?? ''} |`,
  )
  const overrides = OVERRIDES.map(([path, unit, changes]) => {
    const range = accepts(at(system, 'overrides'), path)
    return `| \`overrides.${path}\` | ${range}${unit === '' ? '' : ` ${unit}`} | ${changes} |`
  })
  const fields = PALETTE.map(([field, holds]) => {
    const node = at(palette, field)
    const range = node.properties === undefined ? accepts(palette, field) : 'object'
    return `| \`${field}\` | ${range} | ${holds} |`
  })
  // One brand colour pinned in both modes, as `theme validate` admits it with any system. The
  // hover and pressed fills are the brand's fill at an OKLCH lightness 0.032 and 0.064 lower, the
  // step the derived fills take, and the hue is the brand's OKLCH hue, rounded.
  const fills = {
    'accent.bg': '#1f4fd8',
    'accent.bgHover': '#1744cd',
    'accent.bgActive': '#0f39c2',
    'accent.contrast': '#ffffff',
  }
  const brand = {
    $schema: './palette.schema.json',
    name: 'acme-blue',
    accentHue: 265,
    neutralTint: 0.006,
    chromaBudget: 'high',
    pins: { light: fills, dark: fills },
  }
  // The default system's own palette, whose budget leaves a pinned brand's surroundings grey.
  const grey = registry.theme.palettes.find((entry) => entry.name === plain.defaultPalette)
  if (grey?.chromaBudget !== 'none') {
    throw new SkillFactError(`${plain.defaultPalette} no longer has a chromaBudget of none`)
  }
  const pinnable = Object.keys(at(palette, 'pins.light').properties ?? {})
  if (pinnable.length === 0) throw new SkillFactError('the palette schema pins no role')
  const roles = Object.keys(registry.theme.colorRoles)
  return `
# The system and palette documents

A theme is two JSON documents. This file covers the fields a hand edit usually touches. The JSON
Schema is the whole contract. Write it beside the documents, and an editor checks each field of a
document whose \`$schema\` names it. \`theme validate\` and the Vite plugin ignore that key:

${commands(run, 'theme schema system --out src/theme/system.schema.json', 'theme schema palette --out src/theme/palette.schema.json')}

Check every edit with \`theme validate\` (the skill's step 5).

## The system

\`\`\`json
${pretty(example)}
\`\`\`

\`name\` is kebab-case and becomes \`data-system\`. \`defaultPalette\` is the palette worn with the
system unless another is chosen. \`defaultMode\` (\`light\`, \`dark\` or \`system\`) is the mode of a
reader who has not chosen one: a first visit on the web opens in it, and on iOS and Android it is
the theme's preferred mode. \`light\` and \`dark\` are that mode, and \`system\` follows the device.
A reader's own choice is stored and wins. \`kind\` is
\`designed\`. A system holds no colour: a colour seed
in it is refused.

| Axis | Values | Decides |
| --- | --- | --- |
${axes.join('\n')}

\`fonts\` has four slots, \`body\`, \`heading\`, \`display\` and \`mono\`, each
\`{ family, fallback?, style? }\`. \`heading\` is optional and the other three are required.

| Slot | Draws |
| --- | --- |
| \`body\` | the body steps, \`text.xs\` to \`text.md\`: paragraphs, controls, labels, table cells |
| \`heading\` | the heading steps, \`text.lg\` to \`text.3xl\`: every ${f.m('Heading')} level, ${f.m('PageHeader')}'s and ${f.m('Dialog')}'s titles, ${f.m('Stat')}'s value. Left out, they draw in \`body\` |
| \`display\` | only the display steps, which ${f.m('Hero')}'s title uses |
| \`mono\` | code |

A serif for headings is therefore a serif \`heading\` slot, and it leaves paragraphs in \`body\`.
A serif \`display\` changes ${f.m('Hero')}'s title only, and a serif \`body\` changes every
paragraph, and every heading too while the system has no \`heading\` slot. Say which one the
request gets.

\`typePersonality\` picks no typeface. It sets the weights (\`editorial\` draws titles at 700), the
tracking, the icon stroke, and the fallback of a \`body\`, \`heading\` or \`display\` slot that
names none: serif under \`editorial\`, sans under the others. Give a serif slot
\`"fallback": "serif"\`, so the page shows a serif while the font loads. A system's
\`overrides.type.titleWeight\` is drawn in the \`heading\` slot's family, so that family must ship
the weight.

\`family\` is a Fontsource family name: \`Inter Variable\` is the package
\`@fontsource-variable/inter\`, and a name that does not end in Variable is \`@fontsource/<name>\`. \`fallback\`
is \`sans\`, \`serif\` or \`mono\`, and \`style\` \`italic\` applies to \`display\` only.
\`theme validate\` names each package. Install them: the Vite plugin imports them. A typeface
Fontsource does not publish has no lawful way to load, so report it to whoever owns the design
system rather than writing an \`@font-face\`.

\`overrides\` changes the value a derived step resolves to. Every field is optional, and each
scale's law is checked on the result.

| Field | Accepts | Changes |
| --- | --- | --- |
${overrides.join('\n')}

## The palette

"One brand colour in both modes", below, is a whole palette document.

| Field | Accepts | Holds |
| --- | --- | --- |
${fields.join('\n')}

A shipped palette also carries \`chartCaps\`, a record its own laws measure. Leave it out of a
palette the app owns.

## Colour roles, the two modes and the chart colours

A palette holds seeds, not colours. The engine derives every colour role (${all(roles.map((role) => `\`${role}\``))}) twice, once for light mode and once for dark, and holds every text and
focus colour to its contrast floor in both. There is no dark palette and no colour field per role:
\`axes --properties\` lists the \`--pm-*\` properties a theme emits, and no app sets one.

The eight chart series colours rotate with \`accentHue\`, and a \`chromaBudget\` of \`none\` or
\`ink\` keeps the reference hues. The sequential ramp takes the first series colour's hue, and the
diverging pair is the same in every palette. No field sets a chart colour.
\`theme validate\` prints the chart cap: how many series ${f.m('ScatterChart')} and
${f.m('RadarChart')} can tell apart.

## Pins

A pin replaces one derived colour with an exact one, in one mode. Pins are for a brand that states
its main button or its focus ring by value. They live in the palette's \`pins\`, as
\`{ "light": { … }, "dark": { … } }\`, and take these roles: ${all(pinnable.map((role) => `\`${role}\``))}.

- A value is an opaque \`#rrggbb\`. \`border.focus\` may be \`rgb(r g b / a)\`.
- A mode the palette does not name keeps every derived colour.
- The contrast law holds a pin and never moves it. A pinned fill answers to the label on it:
  \`accent.contrast\` reaches Lc 60 on \`accent.bg\`, \`accent.bgHover\` and \`accent.bgActive\`, in
  each mode. A pinned focus colour answers to its floor on each surface. No law reads a pin's hue,
  or how far apart the three fills are.
- \`accent.gradientTo\` is the gradient's second stop. Pin it when a refusal names the \`'to'\`
  stop. A palette that derives no second stop (no \`gradientHue\`, or \`chromaBudget\` \`none\`)
  pins it in both modes or in neither.

### One brand colour in both modes

The brand's blue \`#1F4FD8\` on the main button, in light and dark mode. \`theme validate\` admits
this palette:

\`\`\`json
${pretty(brand)}
\`\`\`

- Pin the three fills together. Hover and pressed derive from \`accentHue\`, not from the pin, so
  they keep the lightness its ladder gives them: beside \`#1F4FD8\` they are lighter. The derived fills step OKLCH lightness down
  by about 0.03 (0.62, 0.588, 0.556): \`#1744cd\` and \`#0f39c2\` are \`#1F4FD8\` with its lightness
  0.032 and 0.064 lower.
- Pin \`accent.contrast\` when the brand states the label's colour. Unpinned, it is chosen against
  the pinned \`accent.bg\`.
- Pin the same values in \`dark\`. The engine draws a hued accent fill the same in both modes, and a
  mode with no pins draws the fill \`accentHue\` derives, not the brand's.
- Set \`accentHue\` to the colour's OKLCH hue in whole degrees, which
  \`${run} theme hue "#1F4FD8"\` prints: \`#1F4FD8\` is \`oklch(0.491 0.216 264.5)\`, and its
  \`accentHue\` is 265. \`accentHue\` colours what surrounds the button: the washes, links,
  selection, focus ring and chart colours.
- Under \`chromaBudget\` \`none\`, which \`${plain.defaultPalette}\` has, the pins hold and the links,
  washes and focus ring stay grey. Raise it for them to take the hue.

## The more-contrast partner

\`moreContrast\` names another palette document. Its colours replace this palette's for a reader
whose system asks for more contrast or forces colours. The system's other tokens stay. Give it to
\`theme validate\` and \`theme emit\` as the third path, or save it as \`<name>.json\` beside the
palette. In \`vite.config\`, list it among \`palettes\`. It reaches web pages only.

## A guest pairing

A system or palette the app wrote is a guest. It answers to the laws a shipped pairing answers to:
\`schema\`, \`resolution\`, \`coherence\`, \`contrast\`, \`gradient\`, and \`glass\` when
\`depth\` is \`glass\`, in both modes and on the partner too. \`theme validate\` lists as
\`exempt\` the catalogue's own laws, which keep the shipped systems and palettes apart, and adds a
\`note\` when a name is also a shipped one: rename it, because names are attributes on the page.

## Refusals and their answers

| The message says | Change |
| --- | --- |
| \`system.axes.density: Invalid option: expected one of …\` | Use one of the values it lists. |
| \`system: Unrecognized key: "accentHue"\` | Move the key to the other document, or remove it. |
| \`the merged ladder puts xs at 9.5px, under the 10px floor — set type.xs\` | Set the field the message names. |
| \`text.2xl is 20.5px at weight 300 … set a heavier titleWeight, or raise type.base or type.ratio\` | Take one of the two answers it gives. |
| \`accent.contrast on accent.bgHover reached Lc 34.0, floor is 60. … which the palette pins in light mode\` | Pin \`accent.bgHover\` and \`accent.bgActive\` near the pinned fill. |
| \`accent.contrast on accent.gradient reached Lc 29.2 at its 'to' stop\` | Pin \`accent.gradientTo\` near the fill, or drop \`gradientHue\`. |
| \`moreContrast: … admission was not given that palette\` | Pass the partner as the third path, or put it beside the palette. |
`.trimStart()
}
