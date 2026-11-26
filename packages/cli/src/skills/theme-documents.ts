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

/** What each design axis decides. An axis this list lacks is listed with its values only. */
const AXES: Record<string, string> = {
  geometry: 'corner radii',
  depth: 'how surfaces separate: shadows, borders, translucent panes',
  density: 'space, control heights and the type ratio',
  contrastTemperament: 'how strong edges and supporting text are',
  typePersonality: 'type weights and tracking; `editorial` falls back to serif',
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
  const example = {
    $schema: './system.schema.json',
    name: 'acme',
    axes: plain.axes,
    fonts: {
      body: { family: family('body') },
      display: { family: family('display') },
      mono: { family: family('mono') },
    },
    defaultPalette: 'acme-blue',
    defaultMode: 'light',
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
  const pinnable = Object.keys(at(palette, 'pins.light').properties ?? {})
  if (pinnable.length === 0) throw new SkillFactError('the palette schema pins no role')
  const roles = Object.keys(registry.theme.colorRoles)
  return `
# The system and palette documents

A theme is two JSON documents. This file covers the fields a hand edit usually touches. The JSON
Schema is the whole contract. Write it beside the documents, and an editor checks each field of a
document whose \`$schema\` names it:

${commands(run, 'theme schema system --out src/theme/system.schema.json', 'theme schema palette --out src/theme/palette.schema.json')}

Check every edit with \`theme validate\` (the skill's step 5).

## The system

\`\`\`json
${JSON.stringify(example, null, 2)}
\`\`\`

\`name\` is kebab-case and becomes \`data-system\`. \`defaultPalette\` is the palette worn with the
system unless another is chosen. \`defaultMode\` (\`light\`, \`dark\` or \`system\`) applies only
where nothing sets \`data-mode\`. \`kind\` is \`designed\`. A system holds no colour: a colour seed
in it is refused.

| Axis | Values | Decides |
| --- | --- | --- |
${axes.join('\n')}

\`fonts\` has three slots, \`body\`, \`display\` and \`mono\`, each \`{ family, fallback?, style? }\`.
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

\`\`\`json
{
  "name": "acme-blue",
  "accentHue": 255,
  "neutralTint": 0.006,
  "chromaBudget": "high",
  "pins": {
    "light": { "accent.bg": "#1a73e8", "accent.bgHover": "#1765cc", "accent.bgActive": "#185abc" }
  }
}
\`\`\`

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
- The contrast law holds a pin and never moves it. Pin the family together: a light
  \`accent.bg\` with derived \`accent.bgHover\` and \`accent.bgActive\` is refused.
- The washes, links and selection still derive from \`accentHue\`, so set it near the pinned fill.
- \`accent.gradientTo\` is the gradient's second stop. Pin it when a refusal names the \`'to'\`
  stop. A palette that derives no second stop (no \`gradientHue\`, or \`chromaBudget\` \`none\`)
  pins it in both modes or in neither.

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
