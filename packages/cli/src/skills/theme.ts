import type { Registry } from '@polymorph/registry'

import { DEFAULT_SYSTEM, ELEMENTS_DIR, ELEMENTS_THEME_SHEET } from '../plan'
import { all, commands, Facts, skill, type SkillFile } from './facts'

export function themeSkill(registry: Registry, run: string): SkillFile[] {
  const f = new Facts(registry)
  const pairings = registry.theme.systems
    .slice(0, 3)
    .map((system) => `\`${system.name}/${system.defaultPalette}\``)
    .join(', ')
  const plain = registry.theme.systems.find((system) => system.name === DEFAULT_SYSTEM)
  const basis = `${DEFAULT_SYSTEM}/${plain?.defaultPalette ?? ''}`.replace(/\/$/, '')
  const body = `
# Change the theme

In polymorph, how an app looks is two JSON documents. A **system** decides how the product is
built: its design axes (${all(f.axes().map((axis) => `\`${axis}\``))}), its fonts and its
defaults. A **palette** decides its colours, in a light and a dark mode. One system worn with one
palette is a **pairing**, chosen by \`data-system\` and \`data-palette\` on \`<html>\`. The members
read every value from the theme as \`--pm-*\` tokens, so the look changes when the documents change
and in no other way. Application code never writes a colour, a length, a font or a duration.

Every command in this skill starts with the same words, the polymorph tools run from a shell. An
MCP server named \`polymorph\` gives the same answers through \`get_theme_axes\`, \`propose_theme\`
and \`save_theme\`.

## 1. Find the app's theme

- An app \`init\` wrote: \`src/theme/<system>.json\` and \`src/theme/<palette>.json\`, named in
  \`vite.config\` by \`polymorphTheme({ systems, palettes })\`, which compiles them when the app
  builds.
- A vendoring project: \`src/polymorph/themes/systems/\` and \`src/polymorph/themes/palettes/\`,
  compiled by \`add\` into the sheets beside them.
- A page with no build: \`${ELEMENTS_DIR}/${ELEMENTS_THEME_SHEET}\`, compiled from a catalogue
  system.

## 2. See what can move

${commands(run, 'axes', 'axes --values')}

\`axes\` lists the axes and their values, the shipped systems and palettes, the colour roles and the
scales. \`--values\` adds each system's token values with its own palette.

## 3. Propose a theme from words

${commands(run, 'theme propose "calmer, warmer paper, more editorial"', `theme propose "denser and cooler" --based-on ${basis}`, 'theme propose "denser and cooler" --save --dir design')}

The answer lists what each word moved, the words the table does not know, and the verdict of the
theme's laws. \`--based-on\` starts from a shipped pairing, such
as ${pairings}; either half may be left out. \`--save\` writes the two documents into
\`<dir>/systems/\` and \`<dir>/palettes/\` (the directory \`design\` when \`--dir\` is left out), and
\`--overwrite\` replaces files already saved under the same names. Then point the app at them: in an
app \`init\` wrote, name the two files in \`polymorphTheme\` in \`vite.config\`.

Words the table does not know move nothing. Say what should change in the words of the axes \`axes\`
lists, such as denser, rounder, calmer or warmer.

## 4. Edit a document by hand, then check it

${commands(run, 'theme validate src/theme/system.json src/theme/palette.json', 'theme schema system --out system.schema.json')}

\`theme validate\` admits a system and a palette under the same laws as the shipped ones, and names
each law a pairing breaks. \`theme schema\` writes the JSON Schema of a system or a palette, for an
editor.

## 5. Wear a shipped theme

${commands(run, 'add theme:pastel --framework <framework>', 'add palette:orchid --framework <framework>')}

\`<framework>\` is the app's framework, as the \`polymorph-setup\` skill tells it. In a vendoring
project, \`add theme:<system>\` installs a shipped system with its own palette and its fonts, and
\`add palette:<name>\` a palette alone, which any installed system can wear. In a page with no
build, \`add theme:<system>\` compiles it into the theme sheet.

An app that compiles its theme with the Vite plugin wears the documents \`vite.config\` names. To
wear a shipped pairing there, save it as two documents of the app's own: words the table does not
know move nothing, so the proposal is the shipped pairing as it is. Then name the two saved files in
\`polymorphTheme\`.

${commands(run, 'theme propose "as shipped" --based-on journal/umber --save --dir src/theme')}

## What not to do

- No colour, length, font or duration in application code, and no \`--pm-*\` property declared by
  the app. A value the theme does not derive belongs in the system or palette document.
- No stylesheet that overrides a member. A member's look is the theme's.
- No branching on which theme is active. A subtree that needs another density or the inverse tone
  uses ${f.m('DensityScope')} or ${f.m('ToneScope')} (the \`polymorph-rules\` skill).
`
  return [
    {
      path: 'polymorph-theme/SKILL.md',
      contents: skill(
        'polymorph-theme',
        'Change how an app built with polymorph looks, its colours, type, density, shape, motion ' +
          'or overall feel. Use when asked to restyle or rebrand a polymorph app, to make it ' +
          'calmer, denser, warmer, darker or more editorial, to pick or adjust a theme, system or ' +
          'palette, or when tempted to write a colour, font or length in application code. ' +
          'Proposes a theme from plain words, checks it against the theme laws and saves it.',
        body,
      ),
    },
  ]
}

/**
 * Every file of every skill, at its path below a skills directory
 * (`polymorph-screen/SKILL.md`), in the order of `SKILL_NAMES`.
 */
