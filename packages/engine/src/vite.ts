import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  admitTheme,
  prepaintScript,
  type AdmittedFont,
  type ModePreference,
} from '@polymorph/theme'
import type { Plugin } from 'vite'

/**
 * `@polymorph/engine/vite`: themes compiled at build time.
 *
 * A pairing is data. The theme engine turns it into tokens: OKLCH ramps, roles,
 * and the contrast and coherence laws. That work belongs in the build, not in
 * every visitor's browser. This plugin runs the engine once at build time (and
 * on every edit in dev), and gives the application only CSS and a few hundred
 * bytes of attribute-setting runtime. The engine, `zod` and `culori` never reach
 * a production bundle.
 *
 * ```ts
 * // vite.config.ts
 * polymorphTheme({
 *   systems: ['design/system.json'],
 *   palettes: ['design/palette.json', 'design/night.json'],
 * })
 *
 * // main.ts — the stylesheet, the fonts, and hydration from storage
 * import 'virtual:polymorph/theme'
 * ```
 *
 * Every system paired with its own default palette goes into the main
 * stylesheet. Every other pairing compiles to its own small stylesheet, loaded
 * only when the app switches to it: `await ensurePairing(system, palette)`
 * before `setSystem` / `setPalette`. A pairing that fails a law fails the build,
 * and the error quotes the law's message.
 */

export interface PolymorphThemeOptions {
  /** Paths to the system documents the application can use, relative to the Vite root. */
  systems: readonly string[]
  /**
   * Paths to the palette documents. Each system's `defaultPalette` must be among them, and so
   * must each palette's `moreContrast` partner.
   */
  palettes: readonly string[]
  /** The system used on a first visit. Defaults to the first of `systems`. */
  defaultSystem?: string
  /**
   * Which pairings beyond each system's own default palette the application can switch
   * to: `'all'` (the default) compiles every system × palette, or list them.
   */
  pairings?: 'all' | readonly { system: string; palette: string }[]
  /** Import each pairing's font packages from the theme module. Default `true`. */
  fonts?: boolean
}

const THEME = 'virtual:polymorph/theme'
const THEME_CSS = 'virtual:polymorph/theme.css'
const PAIRING = 'virtual:polymorph/pairing/'

/*
 * Ids that Vite's CSS pipeline accepts: a path ending in `.css`, not a `\0` id.
 * The stylesheet is then extracted into the build's CSS instead of shipped as a
 * string.
 */
const THEME_CSS_ID = '/__polymorph/theme.css'
const PAIRING_CSS_ID = '/__polymorph/pairing/'
const THEME_ID = '\0polymorph:theme'
const PAIRING_ID = '\0polymorph:pairing:'

interface Compiled {
  catalogue: {
    systems: Record<string, string>
    palettes: string[]
    modes: Record<string, ModePreference>
  }
  defaultSystem: string
  defaultPalette: string
  eager: string
  others: Map<string, string>
  fonts: string[]
  files: string[]
}

const pairKey = (system: string, palette: string) => `${system}/${palette}`

function compile(root: string, options: PolymorphThemeOptions): Compiled {
  const read = (path: string) => {
    const file = resolve(root, path)
    return { file, json: JSON.parse(readFileSync(file, 'utf8')) as { name?: unknown } }
  }
  const systems = options.systems.map(read)
  const palettes = options.palettes.map(read)
  if (systems.length === 0) throw new Error('polymorph: `systems` names no system document')

  const faults: string[] = []
  const fonts = new Set<string>()
  const paletteByName = new Map(palettes.map(({ json }) => [String(json.name), json]))
  const admit = (system: unknown, palette: unknown) => {
    const label = `${String((system as { name?: unknown }).name)} × ${String((palette as { name?: unknown }).name)}`
    // A palette that names a more-contrast partner is admitted with it, so the
    // partner's colours ride in this pairing's own stylesheet under the media
    // query and need no second load.
    const partner = (palette as { moreContrast?: unknown }).moreContrast
    const moreContrast = typeof partner === 'string' ? paletteByName.get(partner) : undefined
    if (typeof partner === 'string' && moreContrast === undefined) {
      faults.push(`${label}: its more-contrast palette "${partner}" is not among \`palettes\``)
      return null
    }
    const admission = admitTheme({ system, palette, moreContrast })
    if (!admission.lawful) {
      for (const fault of admission.faults) faults.push(`${label} — ${fault.law}: ${fault.message}`)
      return null
    }
    admission.fonts.forEach((font: AdmittedFont) => fonts.add(font.package))
    return admission
  }

  const catalogue: Compiled['catalogue'] = {
    systems: {},
    palettes: [...paletteByName.keys()],
    modes: {},
  }
  const eager: string[] = []
  const others = new Map<string, string>()
  const wanted =
    options.pairings === undefined || options.pairings === 'all'
      ? null
      : new Set(options.pairings.map(({ system, palette }) => pairKey(system, palette)))

  for (const { json: system } of systems) {
    const name = String(system.name)
    const own = String((system as { defaultPalette?: unknown }).defaultPalette)
    const ownPalette = paletteByName.get(own)
    if (!ownPalette) {
      faults.push(`${name}: its default palette "${own}" is not among \`palettes\``)
      continue
    }
    catalogue.systems[name] = own
    const lawful = admit(system, ownPalette)
    if (lawful) {
      eager.push(lawful.css)
      // The mode a reader who has not chosen one opens in, which hydration and the pre-paint
      // script both apply.
      if (lawful.system) catalogue.modes[name] = lawful.system.defaultMode
    }

    for (const [paletteName, palette] of paletteByName) {
      if (paletteName === own) continue
      if (wanted && !wanted.has(pairKey(name, paletteName))) continue
      const pairing = admit(system, palette)
      if (pairing) others.set(pairKey(name, paletteName), pairing.css)
    }
  }

  if (faults.length > 0) {
    throw new Error(`polymorph: the theme does not admit —\n  ${faults.join('\n  ')}`)
  }

  const defaultSystem = options.defaultSystem ?? String(systems[0]?.json.name)
  const defaultPalette = catalogue.systems[defaultSystem]
  if (defaultPalette === undefined) {
    throw new Error(`polymorph: defaultSystem "${defaultSystem}" is not among \`systems\``)
  }

  return {
    catalogue,
    defaultSystem,
    defaultPalette,
    eager: eager.join('\n'),
    others,
    fonts: options.fonts === false ? [] : [...fonts].sort(),
    files: [...systems, ...palettes].map(({ file }) => file),
  }
}

function themeModule(compiled: Compiled): string {
  const loaders = [...compiled.others.keys()].map(
    (key) => `  ${JSON.stringify(key)}: () => import(${JSON.stringify(`${PAIRING}${key}`)}),`,
  )
  return [
    `import ${JSON.stringify(THEME_CSS)}`,
    ...compiled.fonts.map((font) => `import ${JSON.stringify(font)}`),
    "import { getPalette, getSystem, hydrateTheme } from '@polymorph/engine/runtime'",
    '',
    `export const catalogue = ${JSON.stringify(compiled.catalogue)}`,
    `export const defaultSystem = ${JSON.stringify(compiled.defaultSystem)}`,
    '',
    'const PAIRINGS = {',
    ...loaders,
    '}',
    '',
    "/** Loads a pairing's stylesheet if it is not in the main one. Call before switching. */",
    'export function ensurePairing(system, palette) {',
    '  const load = PAIRINGS[`${system}/${palette}`]',
    '  return load ? load().then(() => undefined) : Promise.resolve()',
    '}',
    '',
    'hydrateTheme(defaultSystem, catalogue)',
    '{',
    '  const system = getSystem()',
    '  const palette = getPalette()',
    '  if (system !== null && palette !== null) void ensurePairing(system, palette)',
    '}',
    '',
  ].join('\n')
}

/** Compile system and palette documents into CSS at build time. */
export function polymorphTheme(options: PolymorphThemeOptions): Plugin {
  let root = '.'
  let compiled: Compiled | null = null
  const current = () => (compiled ??= compile(root, options))

  return {
    name: 'polymorph:theme',
    enforce: 'pre',

    configResolved(config) {
      root = config.root
    },

    configureServer(server) {
      // An edit to a system or palette recompiles, and the page reloads with it.
      const { files } = current()
      server.watcher.add(files)
      server.watcher.on('change', (file) => {
        if (!files.includes(resolve(file))) return
        compiled = null
        for (const module of server.moduleGraph.idToModuleMap.values()) {
          if (module.id?.includes('polymorph')) server.moduleGraph.invalidateModule(module)
        }
        server.ws.send({ type: 'full-reload' })
      })
    },

    resolveId(id) {
      if (id === THEME) return THEME_ID
      if (id === THEME_CSS) return THEME_CSS_ID
      if (id.startsWith(PAIRING)) return `${PAIRING_ID}${id.slice(PAIRING.length)}`
      if (id.startsWith(PAIRING_CSS_ID)) return id
      return null
    },

    load(id) {
      if (!id.includes('polymorph')) return null
      const theme = current()
      for (const file of theme.files) this.addWatchFile(file)

      if (id === THEME_ID) return themeModule(theme)
      if (id === THEME_CSS_ID) return theme.eager
      if (id.startsWith(PAIRING_ID)) {
        const key = id.slice(PAIRING_ID.length)
        return `import ${JSON.stringify(`${PAIRING_CSS_ID}${key}.css`)}`
      }
      if (id.startsWith(PAIRING_CSS_ID)) {
        const key = id.slice(PAIRING_CSS_ID.length).replace(/\.css$/, '')
        return theme.others.get(key) ?? ''
      }
      return null
    },

    transformIndexHtml(html) {
      // The default pairing goes on <html>, so a first visit is themed before any
      // script runs. The pre-paint script then applies a stored choice over it,
      // and with none stored the default mode of the system the page wears.
      const { catalogue, defaultSystem, defaultPalette } = current()
      const tagged = /<html(?![^>]*data-system)/.test(html)
        ? html.replace(
            /<html/,
            `<html data-system="${defaultSystem}" data-palette="${defaultPalette}"`,
          )
        : html
      return {
        html: tagged,
        tags: [
          {
            tag: 'script',
            children: prepaintScript({ modes: catalogue.modes, system: defaultSystem }),
            injectTo: 'head-prepend',
          },
        ],
      }
    },
  }
}
