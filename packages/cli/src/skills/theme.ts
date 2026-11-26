import type { Registry } from '@polymorph/registry'

import { DEFAULT_SYSTEM, ELEMENTS_DIR, ELEMENTS_THEME_SHEET } from '../plan'
import { all, commands, Facts, skill, type SkillFile } from './facts'
import { documentsReference } from './theme-documents'

export function themeSkill(registry: Registry, run: string): SkillFile[] {
  const f = new Facts(registry)
  const pairings = registry.theme.systems
    .slice(0, 3)
    .map((system) => `\`${system.name}/${system.defaultPalette}\``)
    .join(', ')
  const plain = registry.theme.systems.find((system) => system.name === DEFAULT_SYSTEM)
  const basis = `${DEFAULT_SYSTEM}/${plain?.defaultPalette ?? ''}`.replace(/\/$/, '')
  // The Vite plugin's function, recorded once and named in code font and in a call.
  const plugin = f.x('polymorphTheme', '@polymorph/engine/vite')
  const call = `\`${plugin.slice(1, -1)}({ systems, palettes })\``
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
  \`vite.config\` by ${call}, which compiles them when the app
  builds and again on each edit in development.
- A vendoring project: \`src/polymorph/themes/systems/\` and \`src/polymorph/themes/palettes/\`,
  compiled by \`add\` into the sheets beside them. After a hand edit, run
  \`add theme:<system> --framework <framework>\` again: it keeps the edited file and compiles the
  sheet from it. \`update\` does not compile a theme no release changed.
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
\`--overwrite\` replaces files already saved under the same names. \`--save\` writes only in a
project: a directory with a \`package.json\` or a \`polymorph.json\`. Then point the app at them: in an
app \`init\` wrote, name the two files in ${plugin} in \`vite.config\`.

Words the table does not know move nothing. Say what should change in the words of the axes \`axes\`
lists, such as denser, rounder, calmer or warmer.

## 4. Edit a document by hand

[references/documents.md](references/documents.md) has every field a hand edit touches, with the
values each takes.

| To change | Edit |
| --- | --- |
| Corners, shadows, density, contrast, type voice, tinted surfaces, motion, ornament | the system's \`axes\` |
| Typefaces | the system's \`fonts\`: Fontsource family names |
| Text sizes, heading weights, one radius, space or control height step | the system's \`overrides\` |
| The accent hue, a gradient, the tint of the greys, how loud colour is | the palette's \`accentHue\`, \`gradientHue\`, \`neutralHue\`, \`neutralTint\`, \`chromaBudget\` |
| The exact colour of the main button, its label or the focus ring | the palette's \`pins\`, per mode |
| Colours for a reader who asks for more contrast | a second palette, named by \`moreContrast\` |
| Chart colours | the palette's \`accentHue\`: chart colours have no field |
| Dark mode | nothing: every palette derives both modes (step 7) |

A system or palette the app writes for itself, not from the catalogue, is a guest. It answers to
the laws every shipped pairing answers to, and the reference lists them.

## 5. Check it, and answer a refusal

${commands(run, 'theme validate src/theme/<system>.json src/theme/<palette>.json', 'theme emit src/theme/<system>.json src/theme/<palette>.json --out theme.css', 'theme schema system --out src/theme/system.schema.json')}

\`theme validate\` admits a system and a palette under the laws every shipped pairing passes, in
both modes. A lawful pair prints \`lawful\`, the chart cap, the font packages to install and the
catalogue laws a guest is exempt from. A third path is the more-contrast partner the palette names;
without it, the partner is read from \`<name>.json\` beside the palette. \`theme emit\` prints the
stylesheet the pair compiles to, or writes it with \`--out\`, to read or hand to someone. It is not
how the app wears a theme: the build compiles the documents (step 1), and a copied sheet stops
following them. \`theme schema\` writes the JSON Schema of a system or a palette, for an editor.

A refusal exits 1 and lists each fault with its law:

\`\`\`text
unlawful — 2 fault(s):
  [contrast] acme/acme-blue (light): accent.contrast on accent.bgHover reached Lc 35.8, floor is 60. accent.contrast is chosen against accent.bg, which the palette pins in light mode.
  [contrast] acme/acme-blue (light): accent.contrast on accent.bgActive reached Lc 31.3, floor is 60. accent.contrast is chosen against accent.bg, which the palette pins in light mode.
\`\`\`

This palette pins a pale \`accent.bg\` and leaves its hover and pressed fills derived. Pinning
\`accent.bgHover\` and \`accent.bgActive\` near the pinned fill makes it lawful.

| Law | What failed | Change |
| --- | --- | --- |
| \`schema\` | A value off its range, a key the document does not take, a missing partner | The field the message names, as it says |
| \`contrast\`, \`gradient\`, \`glass\` | A text or focus colour under its floor in one mode | The seed or pin the message names |
| \`coherence\`, \`resolution\` | The derived values contradict an axis, or no colour reaches the floor | The axis or seed the message names |

The Vite plugin fails the build, and \`add\` fails, with the same messages. Answer a refusal in the
documents. A stylesheet or a \`--pm-*\` property written by the app is checked by no theme law, and
the red rules refuse it.

## 6. Wear a shipped theme

${commands(run, 'add theme:pastel --framework <framework>', 'add palette:orchid --framework <framework>')}

\`<framework>\` is the app's framework, as the \`polymorph-setup\` skill tells it. In a vendoring
project, \`add theme:<system>\` installs a shipped system with its own palette and its fonts, and
\`add palette:<name>\` a palette alone, which any installed system can wear. In a page with no
build, \`add theme:<system>\` compiles it into the theme sheet.

An app that compiles its theme with the Vite plugin wears the documents \`vite.config\` names. To
wear a shipped pairing there, save it as two documents of the app's own: words the table does not
know move nothing, so the proposal holds the shipped pairing's axes, fonts and colour seeds. Both
documents are saved under a name of their own, \`<system>-variant.json\`. Then name the two saved
files in ${plugin}.

${commands(run, 'theme propose "as shipped" --based-on journal/umber --save --dir src/theme')}

## 7. Light and dark

Every pairing has a light and a dark mode, both derived from the one palette, so there is no dark
palette to write. The mode is \`data-mode\` on \`<html>\`. A first visit follows the operating
system's setting, and a choice the reader makes is stored and applied before the first paint.

- Let the reader choose with ${f.m('ModeSwitch')}: \`<ModeSwitch label="Appearance" />\` shows
  light, dark and system, and applies the choice itself. In a page with no build it is
  \`<poly-mode-switch label="Appearance">\`.
- From code, ${f.x('setMode', '@polymorph/engine/runtime')} from \`@polymorph/engine/runtime\`
  applies \`'light'\`, \`'dark'\` or \`'system'\`, which follows the operating system again.
  ${f.x('useMode', '@polymorph/react')}, from the framework's foundation package, reads the current
  choice.
- One region in the opposite mode is ${f.m('ToneScope')} with ${f.v('ToneScope', 'value', 'inverse')}.

## What not to do

- No colour, length, font or duration in application code, and no \`--pm-*\` property declared by
  the app. A value the theme does not derive belongs in the system or palette document.
- No stylesheet that overrides a member, and no sheet from \`theme emit\` installed as the theme. A
  member's look is the documents'.
- No branching on which theme or mode is active. A subtree that needs another density or the
  inverse tone uses ${f.m('DensityScope')} or ${f.m('ToneScope')} (the \`polymorph-rules\` skill).
`
  return [
    {
      path: 'polymorph-theme/SKILL.md',
      contents: skill(
        'polymorph-theme',
        'Change how an app built with polymorph looks, its colours, type, density, shape, motion ' +
          'or overall feel, or how it offers light and dark mode. Use when asked to restyle or ' +
          'rebrand a polymorph app, to make it calmer, denser, warmer, darker or more editorial, ' +
          'to pick or adjust a theme, system or palette, to set an exact brand colour, a font or ' +
          'a type size, to add a dark mode toggle or a more-contrast palette, to edit a system or ' +
          'palette JSON document, when polymorph theme validate or the build reports a theme ' +
          'law, or when tempted to write a colour, font or length in application code. Proposes ' +
          'a theme from plain words, checks it against the theme laws and saves it.',
        body,
      ),
    },
    {
      path: 'polymorph-theme/references/documents.md',
      contents: documentsReference(registry, run),
    },
  ]
}
