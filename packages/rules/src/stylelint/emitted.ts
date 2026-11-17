import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  COLOR_ROLES,
  composeTheme,
  cssVarName,
  DISPLAY_STEPS,
  DURATION_ROLES,
  emitThemeCSS,
  ICON_SIZES,
  parsePalette,
  parseSystem,
  RADIUS_STEPS,
  resolveTheme,
  SPACE_STEPS,
  TEXT_STEPS,
  type Palette,
  type ResolvedTheme,
  type System,
} from '@polymorph/engine'

import type { TokenValues } from './catalogue.js'
import { customPropertiesIn } from './tokens.js'

export type { TokenValues }

/**
 * The list of existing tokens that `polymorph/no-ghost-tokens` receives in this
 * repository.
 *
 * The rule takes a list because a Stylelint rule cannot compute one. Part of the
 * answer comes from the theme engine, which is TypeScript, and a natively loaded
 * config cannot import it. This module builds the list once, for
 * `stylelint.config.js` and for the tests that check the rule fires. A second
 * source could disagree, and the reason for reading the emitted sheet is that
 * nobody maintains a list by hand.
 *
 * **Where it runs.** This module and `tokenValues` read this repository's
 * `design/systems/` and `design/palettes/`, so they run here and in the
 * installer's tests. A consumer has no such directory: `polymorph add` writes
 * the token list and the values into the lint fragments it generates
 * (`polymorph.eslint.js`, `polymorph.stylelint.js`). A root without the
 * directories gets an error that names the missing one.
 *
 * **The list comes from what the emitter writes**, not from the role constants
 * it writes from. Those lists differ, because density, mode, temperament and
 * tone scopes each re-declare a subset. A recipe can resolve only what is on the
 * page.
 *
 * **One pairing, not all of them.** `token-references.test.ts` asserts that every
 * shipped pairing emits the same set of property names (values differ, names do
 * not), so one pairing gives the right answer for all of them. That law makes
 * this shortcut safe at config-load time.
 *
 * **The cost.** Composing a pairing loads the theme engine, which is TypeScript.
 * `stylelint.config.js` reaches it through `jiti`, which transpiles the package
 * on first use (~2s) and reads its cache afterwards (~0.3s). Every Stylelint run
 * pays this, including editor integrations. The alternative is a checked-in list
 * of 198 property names, which goes stale and lets the next ghost through. A
 * single ghost token can silently remove a whole background on every theme,
 * which is the case this law exists for.
 *
 * **Why the engine import is static.** The engine is an optional peer, so a
 * lazy import would let this module load without it. But every caller is
 * synchronous (the two root configs at load time, `verify`), and a synchronous
 * load can only go through Node's own `require`, which cannot resolve the
 * engine's TypeScript source under `jiti` or Vitest. Whoever imports this
 * module has the engine: this repository, and the installer's tests.
 */
export function emittedTokens(root: string): string[] {
  return [...new Set(customPropertiesIn(emitThemeCSS(referenceTheme(root))))].sort()
}

/**
 * The reference pairing, resolved: the alphabetically first system document
 * in `design/systems/` (by file name), with that system's own
 * `defaultPalette`. One pairing is enough for the names (see above), and it is
 * the reference for the values.
 *
 * It is composed on every call (a few milliseconds) rather than cached, so a
 * long-running caller such as the MCP server sees a theme file edited since
 * it started.
 */
function referenceTheme(root: string): ResolvedTheme {
  const load = <T>(dir: string, parse: (raw: unknown) => T): T[] => {
    const path = resolve(root, 'design', dir)
    if (!existsSync(path)) {
      throw new Error(
        `${path} does not exist. The reference pairing is read from polymorph's own design/ ` +
          'directory, so this runs in the polymorph repository; a consumer gets the token list ' +
          'and values from the lint fragments `polymorph add` writes.',
      )
    }
    return readdirSync(path)
      .filter((file) => file.endsWith('.json'))
      .sort()
      .map((file) => parse(JSON.parse(readFileSync(resolve(path, file), 'utf8'))))
  }

  const systems = load<System>('systems', parseSystem)
  const palettes = new Map(load<Palette>('palettes', parsePalette).map((p) => [p.name, p]))

  const [system] = systems
  if (!system) {
    throw new Error(`no system documents (*.json) in ${resolve(root, 'design', 'systems')}`)
  }

  const palette = palettes.get(system.defaultPalette)
  if (!palette) {
    throw new Error(`no palette called "${system.defaultPalette}" for the system ${system.name}`)
  }

  return resolveTheme(composeTheme(system, palette))
}

/**
 * The values a raw colour, length or duration is compared with, so a report
 * can name the nearest token (`catalogue.js`). `token-values-only`,
 * `no-raw-styles` and `no-app-css` take this as their `values` option.
 *
 * **The reference pairing's base values**: its default mode, its default
 * density and its default motion temperament, which is what the emitter writes
 * into the pairing's first block. They are read from the resolved theme by the
 * engine's own role and step lists, under the names the emitter gives them, so
 * a value like `--pm-chart-3`'s, which is a colour but not a role an
 * application paints with, is never offered. A value that is a reference
 * (`var(…)`) is left out, because it is not a value to compare with.
 *
 * Like `emittedTokens`, it runs where `design/` is: this repository and the
 * installer's tests. A consumer's values come from the fragments `polymorph
 * add` writes, which read the consumer's own compiled sheet.
 */
export function tokenValues(root: string): TokenValues {
  const theme = referenceTheme(root)
  // The emitter's fallback mode: what a page without `data-mode` renders.
  const mode = theme.defaultMode === 'dark' ? 'dark' : 'light'
  const density = theme.tokens.density[theme.axes.density]
  const motion = theme.tokens.motion[theme.axes.motionTemperament]

  const family = (entries: readonly (readonly [string, string | number])[]) => {
    const found: Record<string, string> = {}
    for (const [path, value] of entries) {
      const text = String(value).trim()
      if (!text.startsWith('var(')) found[cssVarName(path)] = text
    }
    return found
  }

  return {
    color: family(COLOR_ROLES.map((role) => [role, theme.color[mode][role]] as const)),
    space: family(SPACE_STEPS.map((step) => [`space.${step}`, density.space[step]] as const)),
    radius: family(
      RADIUS_STEPS.map((step) => [`radius.${step}`, theme.tokens.radius[step]] as const),
    ),
    text: family([
      ...TEXT_STEPS.map((step) => [`text.${step}.size`, theme.tokens.text[step].size] as const),
      ...DISPLAY_STEPS.map(
        (step) => [`display.${step}.size`, theme.tokens.display[step].size] as const,
      ),
    ]),
    size: family([
      ...(['sm', 'md', 'lg'] as const).map(
        (size) => [`controlHeight.${size}`, density.controlHeight[size]] as const,
      ),
      ...ICON_SIZES.map((size) => [`icon.size.${size}`, theme.tokens.icon.size[size]] as const),
    ]),
    duration: family(
      DURATION_ROLES.map((role) => [`motion.duration.${role}`, motion.duration[role]] as const),
    ),
  }
}
