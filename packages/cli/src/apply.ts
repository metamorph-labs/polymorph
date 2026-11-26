import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'

import type { Registry } from '@polymorph/registry'
import { admitTheme, prepaintScript, type ModePreference } from '@polymorph/theme'

import {
  BASE_IMPORT,
  generatedFiles,
  hasTheme,
  pairingLoader,
  PREPAINT_MODULE,
  prepaintModule,
  THEME_SHEET,
  themeModule,
  themePairings,
  tokenValuesIn,
  type TokenValues,
} from './emit'
import {
  digest,
  emptyManifest,
  readManifest,
  writeManifest,
  type Manifest,
  type ManifestFile,
} from './manifest'
import {
  addDependencies,
  ESLINT_FRAGMENT,
  importThemes,
  injectPrepaint,
  linkEslintConfig,
  linkStylelintConfig,
  STYLELINT_FRAGMENT,
} from './patch'
import {
  DEFAULT_SYSTEM,
  vendoredText,
  type InstallPlan,
  type PaletteInstall,
  type SystemInstall,
} from './plan'
import { FrameworkMismatchError } from './vue'

/**
 * `polymorph add`, applied.
 *
 * The plan decides what to install, and this module does it. The order of the
 * steps determines the behaviour on failure. **The manifest is written first**,
 * before any file is copied. It lists every path the install will write and
 * the hash of each file's contents, both known in advance. Then come the
 * copies, the generated files, the patches to the consumer's own config, and
 * finally the manifest again with what actually happened.
 *
 * Writing the manifest first makes a half-finished install recoverable. A patch
 * that cannot find an insertion point throws, and throwing after the copies
 * leaves vendored files and an edited `package.json` behind. If the manifest
 * were written last, nothing would record those files. A retry would see a
 * fresh install and silently overwrite whatever the consumer changed in
 * between. With the manifest written first, the retry reads the list. Paths
 * that were never written are written, and paths that were are checked against
 * their recorded hash like any other install.
 *
 * Every write is recorded with the hash of what was written. This lets `diff`
 * tell a consumer's edit from an upstream change, and lets `update` refuse the
 * first while applying the second.
 */

export interface ApplyResult {
  manifest: Manifest
  written: string[]
  skipped: string[]
  patched: string[]
  notes: string[]
}

export interface ApplyOptions {
  /** Overwrite files the consumer has edited. Off by default, so consumer edits are kept. */
  force?: boolean
}

const ENTRY_CANDIDATES = ['src/main.tsx', 'src/main.ts', 'src/index.tsx', 'src/index.ts']

/**
 * The flat configs `add` links the red rules into: the first one the
 * application has, in the order ESLint looks for them. `create-next-app`
 * writes `eslint.config.mjs`, and an `eslint.config.js` written beside it
 * would be the one ESLint reads. An application with none gets
 * `eslint.config.js`.
 */
const ESLINT_CONFIGS = [
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.ts',
  'eslint.config.mts',
]

export function applyPlan(
  root: string,
  source: string,
  registry: Registry,
  plan: InstallPlan,
  options: ApplyOptions = {},
): ApplyResult {
  const previous = readManifest(root)
  // One install is in one framework. The fronts plan in the manifest's
  // (`installFramework`); a plan in another would leave the recorded members
  // under a lint config for the wrong framework.
  if (previous !== null && (previous.framework ?? 'react') !== (plan.framework ?? 'react')) {
    throw new FrameworkMismatchError(previous.framework ?? 'react', plan.framework ?? 'react')
  }
  const dir = plan.dir
  const manifest: Manifest = previous ?? emptyManifest(plan.version, dir)

  const written: string[] = []
  const skipped: string[] = []
  const patched: string[] = []
  const notes = [...plan.notes]

  const record = (path: string, contents: string, from: string | null): void => {
    const full = resolve(root, path)
    const known = manifest.files[path]

    // A consumer edit is kept unless `force` is set. The check is against the
    // *recorded* hash, not the source, so a file that is byte-identical to what
    // we installed can be overwritten however much the source has changed since.
    //
    // A file with no manifest record is not known to be ours. It existed
    // before the install, at a path the install wants: the consumer's own
    // `Button.tsx` under a `--dir` they already use, or a vendored tree whose
    // manifest was lost. It is kept like any edit, unless it already matches
    // what would be written.
    if (!options.force && existsSync(full)) {
      const theirs = digest(readFileSync(full))
      if (known ? theirs !== known.hash : theirs !== digest(contents)) {
        skipped.push(path)
        return
      }
    }

    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, contents)
    manifest.files[path] = { hash: digest(contents), source: from } satisfies ManifestFile
    written.push(path)
  }

  /* ---- resolve ---------------------------------------------------------- */

  // Generated from everything installed, not only what this plan adds. The
  // module emits one stylesheet covering every pairing, and regenerating it from
  // this plan alone would uninstall the systems already there.
  const { systems, palettes } = allTheme(registry, manifest, plan)
  const components = [...new Set([...manifest.components, ...plan.requested])]

  // The values the generated lint configs compare a raw colour or length with,
  // so a report names the nearest token. They are read from the main sheet's
  // first pairing: the sheet this install compiles, or, when it adds no theme,
  // the one an earlier install compiled into the consumer's repository. A sheet
  // with no pairing in it, because the install has no system, gives the
  // registry's values for the default system instead (`fallbackValues`).
  const documentOf = themeDocuments(root, source, manifest, plan, options.force === true)
  const themes = hasTheme(plan) ? compileThemes(documentOf, plan, systems, palettes) : {}
  // The mode each system opens in for a reader who has not chosen one, from the documents the
  // application has. The theme module hands them to hydration, and the pre-paint script applies
  // the same before the first paint.
  const modes = modesOf(documentOf, systems)
  const prepaint = prepaintScript({ modes, system: systems[0]?.name })
  const sheet = `${dir}/themes/${THEME_SHEET}`
  const compiled = tokenValuesIn(
    themes[sheet] ??
      (existsSync(resolve(root, sheet)) ? readFileSync(resolve(root, sheet), 'utf8') : ''),
  )
  const values = Object.keys(compiled).length > 0 ? compiled : fallbackValues(registry)

  /** Every file the install will write, with its contents, computed before any is written. */
  const writes: { path: string; contents: string; from: string | null }[] = [
    // The base layer is copied, hashed and recorded like any other vendored
    // file. A consumer edit to it is kept, and an upstream change to it is
    // applied. There is no third kind of file here.
    ...(plan.base === null
      ? []
      : [
          {
            path: plan.base.to,
            contents: readFileSync(resolve(source, plan.base.from), 'utf8'),
            from: plan.base.from,
          },
        ]),
    // A member's recipe import becomes the path of the recipe's copy beside it.
    ...plan.files.map((file) => ({
      path: file.to,
      contents: vendoredText(registry, file.from, readFileSync(resolve(source, file.from), 'utf8')),
      from: file.from,
    })),
    ...[...plan.systems, ...plan.palettes].map((entry) => ({
      path: entry.file.to,
      contents: readFileSync(resolve(source, entry.file.from), 'utf8'),
      from: entry.file.from,
    })),
    // The installed Stylelint config checks each `var(--pm-…)` against a token
    // list. That list comes from the catalogue, like the pre-paint script below.
    // The installer reads what the registry knows and computes nothing itself;
    // the values beside it are read from the sheet the engine compiled.
    ...Object.entries({
      ...generatedFiles(plan, dir, registry.theme.customProperties, values),
      ...themes,
    }).map(([path, contents]) => ({
      path,
      contents: path.endsWith('themes/index.ts')
        ? themeModule(systems, palettes, plan.base ? BASE_IMPORT : null, modes)
        : path.endsWith(`themes/${PREPAINT_MODULE}`)
          ? prepaintModule(prepaint)
          : contents,
      from: null,
    })),
  ]

  /* ---- the manifest, first ---------------------------------------------- */

  // The manifest is the first thing written, so the root has to exist by now.
  mkdirSync(root, { recursive: true })

  const led: Manifest = {
    version: plan.version,
    dir,
    components,
    systems: systems.map((system) => system.name),
    palettes: palettes.map((palette) => palette.name),
    files: { ...manifest.files },
    ...(plan.framework === undefined ? {} : { framework: plan.framework }),
    ...(manifest.appInstallsThemes === true ? { appInstallsThemes: true } : {}),
  }
  for (const write of writes) {
    led.files[write.path] = { hash: digest(write.contents), source: write.from }
  }
  writeManifest(root, led)

  /* ---- copy and generate ------------------------------------------------ */

  // Check against `manifest`, not `led`. The edit check compares the disk with
  // what the *previous* install wrote, and `led` holds this install's hashes.
  for (const write of writes) record(write.path, write.contents, write.from)

  /* ---- patch ------------------------------------------------------------ */

  /**
   * Edits a file the consumer owns, or creates it from `fallback` when it does
   * not exist. A fallback is written even when the change is a no-op. The fresh
   * config already names the fragment, so `change` adds nothing, and returning
   * early on "no difference" would silently leave the file uncreated and the
   * rules not installed.
   */
  const edit = (file: string, change: (text: string) => string, fallback?: string): void => {
    const full = resolve(root, file)
    const existed = existsSync(full)
    const before = existed ? readFileSync(full, 'utf8') : fallback
    if (before === undefined) {
      notes.push(`no ${file} — skipped`)
      return
    }
    const after = change(before)
    if (existed && after === before) return
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, after)
    patched.push(file)
  }

  const manifestJson = resolve(root, 'package.json')
  const wanted = Object.keys(plan.packages).length + Object.keys(plan.devPackages).length
  if (existsSync(manifestJson) && wanted > 0) {
    const result = addDependencies(
      readFileSync(manifestJson, 'utf8'),
      plan.packages,
      plan.devPackages,
    )
    if (result.added.length > 0) {
      writeFileSync(manifestJson, result.text)
      patched.push('package.json')
    }
    for (const conflict of result.conflicts) {
      notes.push(
        `package.json pins ${conflict.name} at ${conflict.theirs}; the vocabulary was built ` +
          `against ${conflict.ours} — left as it is`,
      )
    }
  }

  // The lint fragments are on disk by now. Linking them into the configs makes them run.
  if (plan.files.length > 0 || hasTheme(plan)) {
    const eslintConfig = ESLINT_CONFIGS.find((file) => existsSync(resolve(root, file)))
    edit(
      eslintConfig ?? 'eslint.config.js',
      (text) => linkEslintConfig(text, eslintConfig),
      freshEslintConfig(),
    )
    edit('stylelint.config.js', linkStylelintConfig, freshStylelintConfig())
  }

  if (systems.length > 0 || palettes.length > 0) {
    edit('index.html', (html) => injectPrepaint(html, prepaint))

    // An application that installs its themes from a module of its own says so
    // in the manifest (`appInstallsThemes`), and its entry is left as it is.
    if (manifest.appInstallsThemes !== true) {
      const entry = ENTRY_CANDIDATES.find((candidate) => existsSync(resolve(root, candidate)))
      if (entry) {
        const specifier = importSpecifier(entry, `${dir}/themes/index.ts`)
        edit(entry, (text) => importThemes(text, specifier))
      } else {
        notes.push(
          `no application entry found — call installThemes() from ${dir}/themes before you mount`,
        )
      }
    }
  }

  // Write the manifest again, with what happened instead of what was planned. A
  // file the consumer had edited was skipped and keeps the hash it was installed with.
  manifest.version = plan.version
  manifest.dir = dir
  // A Vue, Svelte, Solid or Angular install stays one: `update` re-plans it
  // from that framework's vocabulary.
  if (plan.framework !== undefined) manifest.framework = plan.framework
  manifest.components = components
  manifest.systems = systems.map((system) => system.name)
  manifest.palettes = palettes.map((palette) => palette.name)
  writeManifest(root, manifest)

  return { manifest, written, skipped, patched, notes }
}

/**
 * Compiles every installed pairing to CSS here in the installer, so the theme
 * module the application runs derives nothing. `theme.css` holds each system
 * with its own palette, and every other pairing gets its own sheet.
 *
 * The compiled JSON is the JSON the application will have (`themeDocuments`).
 * An unlawful pairing fails the install with the law's own message. A
 * palette's more-contrast partner rides in its pairing's sheet, under the
 * media query.
 */
function compileThemes(
  json: (entry: SystemInstall | PaletteInstall) => unknown,
  plan: InstallPlan,
  systems: SystemInstall[],
  palettes: PaletteInstall[],
): Record<string, string> {
  const systemJson = new Map(systems.map((system) => [system.name, json(system)]))
  const paletteJson = new Map(palettes.map((palette) => [palette.name, json(palette)]))
  const compile = (system: string, palette: string): string => {
    // A palette that names a more-contrast partner is admitted with it, and the
    // plan installs the partner beside it. A partner that is not installed is
    // refused by admission, with its own sentence.
    const document = paletteJson.get(palette)
    const named = (document as { moreContrast?: unknown } | undefined)?.moreContrast
    const admission = admitTheme({
      system: systemJson.get(system),
      palette: document,
      moreContrast: typeof named === 'string' ? paletteJson.get(named) : undefined,
    })
    if (!admission.lawful) {
      const faults = admission.faults.map((fault) => `${fault.law}: ${fault.message}`)
      throw new Error(
        `polymorph: ${system} × ${palette} does not admit —\n  ${faults.join('\n  ')}`,
      )
    }
    return admission.css
  }

  const dir = `${plan.dir}/themes`
  const files: Record<string, string> = {
    [`${dir}/${THEME_SHEET}`]: systems
      .filter((system) => paletteJson.has(system.defaultPalette))
      .map((system) => compile(system.name, system.defaultPalette))
      .join('\n'),
  }
  for (const pairing of themePairings(systems, palettes)) {
    files[`${dir}/${pairing.sheet}`] = compile(pairing.system, pairing.palette)
    files[`${dir}/${pairing.loader}`] = pairingLoader(pairing.sheet)
  }
  return files
}

/**
 * A system's or palette's document as the application will have it: the
 * upstream copy this install writes, or the application's own copy if it has
 * edited it, because the install does not overwrite an edit unless it is
 * forced. A document this install does not write is the application's copy.
 */
function themeDocuments(
  root: string,
  source: string,
  manifest: Manifest,
  plan: InstallPlan,
  force: boolean,
): (entry: SystemInstall | PaletteInstall) => unknown {
  const planned = new Set([...plan.systems, ...plan.palettes].map((entry) => entry.file.to))
  return (entry) => {
    const vendored = resolve(root, entry.file.to)
    const recorded = manifest.files[entry.file.to]
    const edited =
      existsSync(vendored) &&
      recorded !== undefined &&
      digest(readFileSync(vendored)) !== recorded.hash
    // Under `force` the install writes the upstream copy over an edit, so the
    // sheet is compiled from the upstream copy too.
    const fromUpstream = planned.has(entry.file.to) && (!edited || force)
    const path = fromUpstream || !existsSync(vendored) ? resolve(source, entry.file.from) : vendored
    return JSON.parse(readFileSync(path, 'utf8'))
  }
}

/**
 * Each system's `defaultMode`, read from its document. A document that states
 * no valid one follows the device, which admission refuses anyway when it
 * compiles the system.
 */
function modesOf(
  json: (entry: SystemInstall) => unknown,
  systems: readonly SystemInstall[],
): Record<string, ModePreference> {
  return Object.fromEntries(
    systems.map((system) => {
      const mode = (json(system) as { defaultMode?: unknown } | null)?.defaultMode
      return [system.name, mode === 'light' || mode === 'dark' ? mode : 'system']
    }),
  )
}

/**
 * Every system and palette the install has, old and new, in the shape the
 * generator needs.
 *
 * A name the registry no longer ships is dropped, not carried. It cannot be
 * resolved, and a generated module that imports a missing file breaks the
 * build in the consumer's repository.
 */
function allTheme(
  registry: Registry,
  manifest: Manifest,
  plan: InstallPlan,
): { systems: SystemInstall[]; palettes: PaletteInstall[] } {
  const systems = new Map(plan.systems.map((system) => [system.name, system]))
  const palettes = new Map(plan.palettes.map((palette) => [palette.name, palette]))

  for (const name of manifest.systems) {
    if (systems.has(name)) continue
    const system = registry.theme.systems.find((entry) => entry.name === name)
    if (!system) continue
    systems.set(name, {
      name,
      file: { from: system.file, to: `${manifest.dir}/themes/systems/${name}.json` },
      defaultPalette: system.defaultPalette,
      fonts: system.fonts.map((font) => ({ family: font.family, package: font.package })),
    })
  }

  for (const name of manifest.palettes) {
    if (palettes.has(name)) continue
    const palette = registry.theme.palettes.find((entry) => entry.name === name)
    if (!palette) continue
    palettes.set(name, {
      name,
      file: { from: palette.file, to: `${manifest.dir}/themes/palettes/${name}.json` },
    })
  }

  return {
    systems: [...systems.values()].sort((a, b) => a.name.localeCompare(b.name)),
    palettes: [...palettes.values()].sort((a, b) => a.name.localeCompare(b.name)),
  }
}

/**
 * The token values for an install whose theme sheet holds no pairing: it has
 * no system, because the application builds its theme at run time or installs
 * a palette alone. They are the registry's values for the default system
 * wearing its own palette, the values `polymorph init` writes for a new app.
 * A report then names the token nearest a raw value in that pairing. That is
 * the right space step for a theme at standard density, and for a colour, a
 * radius, a size or a duration it can be another token than the application's
 * own theme would give. Empty only when the registry has no such system, and
 * the reports then name the family.
 */
function fallbackValues(registry: Registry): TokenValues {
  return registry.theme.systems.find((system) => system.name === DEFAULT_SYSTEM)?.tokenValues ?? {}
}

/** `src/main.tsx` importing `src/polymorph/themes/index.ts` -> `./polymorph/themes`. */
function importSpecifier(from: string, to: string): string {
  const path = relative(dirname(from), to.replace(/\/index\.ts$/, ''))
  return path.startsWith('.') ? path : `./${path}`
}

/**
 * The ESLint config an install creates when the consumer has none: the
 * generated fragment and nothing else. `polymorph init` writes the same file.
 */
export function freshEslintConfig(): string {
  return `import polymorph from './${ESLINT_FRAGMENT}'

export default [
  ...polymorph,
]
`
}

/** The Stylelint config an install creates when the consumer has none, as above. */
export function freshStylelintConfig(): string {
  return `export default {
  extends: ['./${STYLELINT_FRAGMENT}'],
}
`
}
