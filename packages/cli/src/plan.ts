import { isAbsolute, normalize, posix, sep } from 'node:path'

import {
  FRAMEWORK_FOUNDATION,
  FRAMEWORK_VOCABULARY,
  FRAMEWORKS,
  type Framework,
  type FrameworkEntry,
  type MappedFramework,
  type Registry,
  type RegistryPalette,
} from '@polymorph/registry'

import { ANGULAR_TOOLING } from './init-angular'
import { SVELTE_TOOLING } from './init-svelte'
import { VUE_TOOLING } from './init-vue'
import { frameworkRanges, frameworkRoots, isMapped, UnshippedMemberError } from './vue'

/**
 * Works out an install before anything is written.
 *
 * A pure function of the registry and a list of names: no filesystem, no
 * network, no side effects. This lets the plan be *shown* before it is applied
 * (`--dry-run`), tested without a temporary directory, and returned by the MCP
 * server's `get_install_plan` without an installer. A separate module takes a
 * plan and writes the files.
 *
 * This module decides nothing the registry does not already say. The closure,
 * the version ranges, the fonts and the pre-paint script are all read from it.
 * This module adds only *shape*: which repo-relative path maps to which install
 * path, and which facts belong to a component and which to a theme. The design
 * is one canonical registry with three thin fronts, so `thin-front.test.ts`
 * checks that this package never opens the vocabulary itself.
 */

export interface PlanFile {
  /** The path in this repository. */
  from: string
  /** The install path, relative to the consumer's repository root. */
  to: string
}

/**
 * The structural half of a pairing, and everything it needs.
 *
 * A system install is never one file. The system names a `defaultPalette`, and
 * a system on disk with no palette beside it resolves to nothing. So
 * `theme:<system>` carries the system file, that palette's file and the
 * webfonts the system declares. This is the pairing bundle, under the `theme:`
 * name that the common case uses.
 */
export interface SystemInstall {
  name: string
  file: PlanFile
  /** The palette it declares. Always among the plan's `palettes`. */
  defaultPalette: string
  fonts: { family: string; package: string }[]
}

/** The colour half of a pairing, on its own. A palette never carries fonts. */
export interface PaletteInstall {
  name: string
  file: PlanFile
}

export interface InstallPlan {
  /** The registry version this plan was resolved against. */
  version: string
  /** Where vendored source lands, relative to the consumer's root. */
  dir: string
  /**
   * Members asked for (components and the ladder's primitives), expanded to
   * include all their dependencies, sorted.
   */
  components: string[]
  /** Members asked for by name. The manifest records these as wanted. */
  requested: string[]
  systems: SystemInstall[]
  /** Every palette the install writes, whether asked for or declared by a system. */
  palettes: PaletteInstall[]
  /**
   * The base layer, included in every install that writes anything. `null` only
   * when the install is empty, or on an update when the file no longer exists
   * upstream and is about to be pruned.
   */
  base: PlanFile | null
  files: PlanFile[]
  /** Package -> version range, for the consumer's `dependencies`. */
  packages: Record<string, string>
  /**
   * Package -> version range, for the consumer's `devDependencies`: the red
   * rules, which only the generated lint configs load.
   */
  devPackages: Record<string, string>
  /** Warnings that do not stop an install, such as an item that is already present. */
  notes: string[]
  /**
   * `vue`, `svelte`, `solid` or `angular` when the install vendors that framework's
   * vocabulary instead of the React members: each member's published shell
   * (`frameworks.<framework>.shell`). `elements` when the install is a page's:
   * it vendors no member, and every system and palette is compiled into one
   * theme sheet, which is each one's `file.to`. Absent for React.
   */
  framework?: MappedFramework
}

export interface PlanOptions {
  /** Where vendored source lands. Default `src/polymorph`. */
  dir?: string
  /** The web framework whose members are vendored. Default `react`. */
  framework?: Framework
}

export const DEFAULT_DIR = 'src/polymorph'

/**
 * Where an elements install's files land unless `--dir` names another: the
 * directory `polymorph init --framework elements` copies the files a page loads
 * into, inside the app's static directory.
 */
export const ELEMENTS_DIR = 'public/polymorph'

/** The theme sheet of an elements install, in its directory: every pairing it has, compiled. */
export const ELEMENTS_THEME_SHEET = 'theme.css'

/**
 * Why an element is not installed by name: a page loads every element at once.
 * `polymorph.js` defines every tag, and a no-build page cannot compile a
 * member's source, so `add` installs nothing per member.
 */
export const elementsNote = (member: string): string =>
  `${member} is an element in the files \`polymorph init --framework elements\` copies, which ` +
  'define every tag at once — there is nothing to install per member'

/**
 * The system a new app wears unless `polymorph init --system` names another.
 * An install with no system of its own takes this system's token values for
 * its lint configs (`applyPlan`).
 */
export const DEFAULT_SYSTEM = 'plain'

/**
 * Where the base layer is written.
 *
 * *Which* file it is comes from `registry.vendor.base`, because that is a fact
 * about the vocabulary and this module is a front. Only the destination is
 * decided here, because it is a property of the install. It sits at the top of
 * the install directory, not beside the convention modules, because it is not
 * a convention module. A component's stylesheet composes a convention module
 * by name. The generated theme module imports this file once, for its side
 * effect.
 */
const BASE_TARGET = 'base.css'

/** What the generated lint configs import, and nothing else does: a dev dependency. */
const RULES_PACKAGE = '@polymorph/rules'

/** Some of an app's tools, at the ranges it takes them. */
function ranged(
  tooling: Readonly<Record<string, string>>,
  names: readonly string[],
): Record<string, string> {
  return Object.fromEntries(names.map((name) => [name, tooling[name] ?? '']))
}

/**
 * What a Vue, Svelte or Angular install's generated ESLint config reads its
 * components with, at the ranges `polymorph init` gives such an app: dev
 * dependencies. An Angular config reads a template with Angular's template
 * parser and extracts an inline one with the processor of
 * `@angular-eslint/eslint-plugin-template`. Solid is TSX, which the rules' own
 * parser reads.
 */
const COMPONENT_PARSERS: Partial<Record<MappedFramework, Readonly<Record<string, string>>>> = {
  vue: ranged(VUE_TOOLING, ['vue-eslint-parser']),
  svelte: ranged(SVELTE_TOOLING, ['svelte-eslint-parser']),
  angular: ranged(ANGULAR_TOOLING, [
    '@angular-eslint/eslint-plugin-template',
    '@angular-eslint/template-parser',
  ]),
}

/**
 * The packages every install that writes anything depends on by name.
 *
 * Read from the registry instead of listed here: every `@polymorph/*` package
 * `registry.packages` ranges except any framework's vocabulary, which a
 * vendored install replaces with source, and any framework's foundation; then
 * the foundation of the framework the install is in. A list kept here would
 * agree with the registry's until a package was added to one of them.
 *
 * Every install that lands generates the lint configs, which import the rules,
 * and a theme install generates a module that imports the engine's runtime.
 * The rules name the engine as a peer, so the engine comes with every install
 * that lands, theme or not. The framework's foundation comes only with member
 * source, which is what imports it.
 */
function boundaryPackages(registry: Registry, framework: Framework): string[] {
  const frameworks = new Set(
    FRAMEWORKS.flatMap((each) => [FRAMEWORK_VOCABULARY[each], FRAMEWORK_FOUNDATION[each]]),
  )
  return [
    ...Object.keys(registry.packages).filter(
      (name) => name.startsWith('@polymorph/') && !frameworks.has(name),
    ),
    FRAMEWORK_FOUNDATION[framework],
  ].sort()
}

/**
 * The two prefixed forms. Systems, palettes and components share one
 * namespace, and nothing in the schema stops a name from being two of them, so
 * the prefix says which was meant.
 *
 * The common form is `theme:`, not `system:`. It installs a pairing, which is
 * what "theme" informally means, and the common case should not be renamed
 * only to expose the data model.
 */
const THEME_PREFIX = 'theme:'
const PALETTE_PREFIX = 'palette:'

/** `date-picker`, `DatePicker` and `datepicker` are the same request. */
const fold = (name: string) => name.replace(/[^a-z0-9]/gi, '').toLowerCase()

/**
 * Everything a bare name can resolve to: a gallery member, or one of the
 * exception ladder's primitives.
 *
 * The registry lists the primitives separately from `components` (no gallery,
 * no tier, no fixture, no spec). That is a fact about the catalogue, not about
 * an install. An install treats them like members: source somebody asks for by
 * name, copies, and owns. They must work with the same command because the
 * rules installed with a member point at them. `no-raw-styles` sends a
 * consumer to rung 4, and if the install could not write that rung, the
 * consumer would have to copy its two files by hand and record their hashes in
 * `polymorph.json`.
 */
interface Member {
  name: string
  /** Whether the framework's vocabulary ships it, and why not when it does not. */
  entry: FrameworkEntry
  origin: 'installed' | 'vendored'
  /**
   * The files that declare it: the React source, or another framework's
   * component and its compound parts. An installed file maps back to its
   * member by these paths.
   */
  sources: string[]
  packages: string[]
  files: string[]
}

/**
 * Every member and primitive as an install in `framework` sees it. React's
 * are the registry's own fields. Another framework's member's are its
 * published shell, so its files come from that framework's tree; a member
 * with no shell has none there.
 */
function membersOf(registry: Registry, framework: Framework = 'react'): Member[] {
  const read = (
    name: string,
    origin: 'installed' | 'vendored',
    source: string,
    dependencies: { packages: string[]; files: string[] },
    frameworks: Record<Framework, FrameworkEntry>,
  ): Member => {
    const entry = frameworks[framework]
    if (framework === 'react') {
      return {
        name,
        entry,
        origin,
        sources: [source],
        packages: dependencies.packages,
        files: dependencies.files,
      }
    }
    const shell = entry.shell
    return {
      name,
      entry,
      origin: shell?.origin ?? origin,
      sources: shell?.sources ?? [],
      packages: shell?.dependencies.packages ?? [],
      files: shell?.dependencies.files ?? [],
    }
  }
  return [
    ...registry.components.map((component) =>
      read(
        component.name,
        component.origin,
        component.files.source,
        component.dependencies,
        component.frameworks,
      ),
    ),
    // Always vendored. The registry reads the primitives from the vendorable
    // tree and rejects one that is not there.
    ...registry.exceptions.primitives.map((primitive) =>
      read(
        primitive.name,
        'vendored',
        primitive.files.source,
        primitive.dependencies,
        primitive.frameworks,
      ),
    ),
  ]
}

export class UnknownItemError extends Error {
  constructor(
    readonly item: string,
    readonly suggestion: string | null,
  ) {
    super(
      suggestion === null
        ? `polymorph: nothing in the registry is called "${item}"`
        : `polymorph: nothing in the registry is called "${item}" — did you mean ${suggestion}?`,
    )
    this.name = 'UnknownItemError'
  }
}

export class EscapingDirError extends Error {
  constructor(
    readonly dir: string,
    /** What was being contained, so the message names the offending input. */
    readonly what: string = '--dir',
  ) {
    super(`polymorph: ${what} must stay inside your repository — "${dir}" resolves outside it`)
    this.name = 'EscapingDirError'
  }
}

/**
 * The containment check, in one place, for every path that comes from outside.
 *
 * A repository-relative path is valid only if resolving it against the
 * consumer's root stays inside that root. It fails in three ways: it is
 * absolute, it climbs out with `..`, or it is empty. Empty counts as `/` here,
 * because every install path is `${dir}/…` and an empty directory makes that
 * absolute.
 *
 * The check is lexical instead of a `resolve` and a `relative`, and it gives
 * the same answer for the repository-relative paths it guards. `normalize`
 * collapses every `..` a caller can write, so a path that resolves outside is
 * exactly one that normalizes to `..` or below it. A lexical check also keeps
 * the plan a pure function, which is the purpose of separating plan from apply.
 * `--dry-run` and `get_install_plan` therefore never touch a filesystem.
 *
 * There are two callers. `--dir` reaches every path in a plan, so a bad value
 * moves the whole install somewhere else. A **manifest file key** reaches
 * `rmSync`. A hand-edited `polymorph.json` naming `src/polymorph/../../../x`
 * passes any prefix test against the install directory and still resolves
 * outside the repository, so anyone who can write that file could delete files
 * outside it. Both callers use this one check.
 */
export function escapes(path: string): boolean {
  const inside = normalize(path)
  return path.trim() === '' || isAbsolute(path) || inside === '..' || inside.startsWith(`..${sep}`)
}

/**
 * Checks where an install may be written.
 *
 * `dir` is consumer input (a flag, or a field in a hand-edited manifest), and
 * every path in the plan is built from it. The check is here, once, because
 * this is the only way a directory reaches a plan. `add`, `update` and the MCP
 * server's `get_install_plan` all call through it.
 *
 * It runs before the write, not at it, because `--dry-run` and
 * `get_install_plan` never reach a write, and a plan that names eight paths
 * outside somebody's repository is already wrong.
 */
function contain(dir: string): string {
  if (escapes(dir)) throw new EscapingDirError(dir)
  return dir
}

/**
 * The prefixed form a bare theme name should have had.
 *
 * Systems are checked first, because when a name is both, a person typing one
 * word most likely wants the pairing. Returns `null` for a name that is
 * neither. This only chooses between two known answers and never guesses.
 */
function prefixedForm(registry: Registry, name: string): string | null {
  const wanted = fold(name)

  const system = registry.theme.systems.find((entry) => fold(entry.name) === wanted)
  if (system) return `"${THEME_PREFIX}${system.name}"`

  const palette = registry.theme.palettes.find((entry) => fold(entry.name) === wanted)
  return palette ? `"${PALETTE_PREFIX}${palette.name}"` : null
}

/**
 * The members whose source an install in `framework` writes at each path, as
 * `src/polymorph/exceptions/Bespoke.tsx` -> `['Bespoke']`: every member the
 * framework ships as source. `update` reads it to tell which member a vendored
 * file the application imports belongs to.
 */
export function membersAt(
  registry: Registry,
  dir: string,
  framework: Framework = 'react',
): Map<string, string[]> {
  const at = new Map<string, string[]>()
  for (const member of membersOf(registry, framework)) {
    if (member.entry.status !== 'native' || member.origin !== 'vendored') continue
    for (const source of member.sources) {
      const path = rebase(registry, source, dir)
      at.set(path, [...(at.get(path) ?? []), member.name])
    }
  }
  return at
}

/**
 * The current name of a system or palette the catalogue shipped under another
 * one, in the same item form (`theme:shadcn` -> `theme:plain`), from the
 * registry's `theme.renamed`. `null` for a member and for a name that was
 * never renamed.
 */
export function successor(registry: Registry, item: string): string | null {
  const half = item.startsWith(THEME_PREFIX)
    ? { prefix: THEME_PREFIX, renamed: registry.theme.renamed.systems }
    : item.startsWith(PALETTE_PREFIX)
      ? { prefix: PALETTE_PREFIX, renamed: registry.theme.renamed.palettes }
      : null
  if (half === null) return null
  const wanted = fold(item.slice(half.prefix.length))
  const current = Object.entries(half.renamed).find(([old]) => fold(old) === wanted)?.[1]
  return current === undefined ? null : `${half.prefix}${current}`
}

/**
 * The suggestion for a wrong name.
 *
 * Deliberately not a fuzzy match. It catches three cases: a system or palette
 * asked for as if it were a component (`polymorph add pastel`, which is the
 * natural thing to type and which the prefix rule makes wrong), one half asked
 * for under the other half's prefix (`theme:orchid`), and a prefix of a real
 * name. A Levenshtein table would guess at everything else, and a confident
 * wrong guess is worse here than no suggestion.
 */
function suggest(registry: Registry, item: string): string | null {
  const prefixed = prefixedForm(registry, item)
  if (prefixed) return prefixed

  const wanted = fold(item)
  const member = membersOf(registry).find((entry) => fold(entry.name).startsWith(wanted))
  return member ? `"${member.name}"` : null
}

/**
 * Whether the registry still ships an item in a framework, without throwing.
 *
 * `planInstall` answers the same question by throwing. That is right for `add`,
 * where somebody typed a wrong name. It is wrong for `update`, where the names
 * come from a manifest recorded earlier against a version that did ship them.
 * An upstream removal is our change, not the consumer's mistake, and only the
 * update that reports it can remove the files. A member the framework's map
 * now marks absent is removed from that framework's vocabulary in the same
 * sense, though React still ships it.
 */
export function shipped(registry: Registry, item: string, framework: Framework = 'react'): boolean {
  if (item.startsWith(THEME_PREFIX)) {
    const wanted = fold(item.slice(THEME_PREFIX.length))
    return registry.theme.systems.some((entry) => fold(entry.name) === wanted)
  }
  if (item.startsWith(PALETTE_PREFIX)) {
    const wanted = fold(item.slice(PALETTE_PREFIX.length))
    return registry.theme.palettes.some((entry) => fold(entry.name) === wanted)
  }
  return membersOf(registry, framework).some(
    (entry) => fold(entry.name) === fold(item) && entry.entry.status === 'native',
  )
}

/**
 * Why the framework's vocabulary does not ship a member the registry still
 * has: the reason its framework map gives. `null` for an item that is not a
 * member, one the registry no longer has, and one the framework ships.
 */
export function absenceReason(
  registry: Registry,
  item: string,
  framework: Framework,
): string | null {
  if (item.startsWith(THEME_PREFIX) || item.startsWith(PALETTE_PREFIX)) return null
  const member = membersOf(registry, framework).find((entry) => fold(entry.name) === fold(item))
  if (member === undefined || member.entry.status === 'native') return null
  return member.entry.reason ?? `the ${framework} map marks it absent`
}

/**
 * The nearest name to one the registry no longer has. It is the same guess
 * `UnknownItemError` carries, available without throwing one.
 *
 * A removal is usually a rename, so the suggestion is usually the answer. If
 * `Toast` is renamed `Toaster`, the note says so, and nobody has to diff two
 * registries. A system or palette the registry records as renamed is answered
 * with its current name.
 */
export function nearestName(registry: Registry, item: string): string | null {
  const renamed = successor(registry, item)
  if (renamed !== null) return `"${renamed}"`
  if (item.startsWith(THEME_PREFIX)) return prefixedForm(registry, item.slice(THEME_PREFIX.length))
  if (item.startsWith(PALETTE_PREFIX)) {
    return prefixedForm(registry, item.slice(PALETTE_PREFIX.length))
  }
  return suggest(registry, item)
}

/**
 * Resolves names into everything the install must do.
 *
 * Components expand through the registry's file closure. It is larger than the
 * component closure and includes the convention stylesheets that nothing
 * exports. The exception ladder's primitives resolve by bare name and expand
 * the same way, because `bespoke` is vendored source just as `button` is. A
 * theme expands into a system file, the palette that system declares, and its
 * webfonts. A palette expands into one file. Everything collects into one flat,
 * deduplicated file list. Two components that share `focus.module.css` must
 * not copy it twice, and the manifest that records the install is a set of
 * files, not a set of names.
 */
export function planInstall(
  registry: Registry,
  items: string[],
  options: PlanOptions = {},
): InstallPlan {
  const framework = options.framework ?? 'react'
  const elements = framework === 'elements'
  const dir = contain(options.dir ?? (elements ? ELEMENTS_DIR : DEFAULT_DIR))
  const mapped = isMapped(framework) ? framework : null
  const foundation = FRAMEWORK_FOUNDATION[framework]
  const notes: string[] = []

  const components = new Set<string>()
  const requested: string[] = []
  const systems: SystemInstall[] = []
  const palettes = new Map<string, PaletteInstall>()
  /** Palettes named as items, as opposed to arriving as a system's default. */
  const askedFor = new Set<string>()
  const files = new Map<string, PlanFile>()
  const packages: Record<string, string> = {}

  const paletteByName = new Map(registry.theme.palettes.map((entry) => [entry.name, entry]))

  /**
   * Systems and palettes go in sibling directories, not one, because a name can
   * be both. In one flat `themes/`, the file copied second would overwrite the
   * first. The shipped catalogue has no such collision, and the split makes
   * sure that one would not matter.
   */
  const takePalette = (palette: RegistryPalette): boolean => {
    if (palettes.has(palette.name)) return false
    palettes.set(palette.name, {
      name: palette.name,
      file: {
        from: palette.file,
        to: elements
          ? `${dir}/${ELEMENTS_THEME_SHEET}`
          : `${dir}/themes/palettes/${palette.name}.json`,
      },
    })
    // A palette that names a more-contrast partner is compiled with it, so the
    // partner is installed beside it.
    const partner =
      palette.moreContrast === undefined ? undefined : paletteByName.get(palette.moreContrast)
    if (partner !== undefined) takePalette(partner)
    return true
  }

  const members = membersOf(registry, framework)
  const byFoldedName = new Map(members.map((member) => [fold(member.name), member]))

  /*
   * Which members a vendored file belongs to.
   *
   * The install's component list is read from the *files*, not from
   * `dependencies.components`, and the difference matters. That field is the
   * closure of a component's own source, while the copied closure also walks
   * the states fixture. Installing Dialog writes Input, FormField and Stack,
   * because its fixture builds a form inside the modal. A report that named
   * only Button would misstate what is in the consumer's repository.
   *
   * Each file maps to a list, not one name, because a file can declare more
   * than one member. `Scopes.tsx` holds both rung-2 scopes, so asking for
   * DensityScope also writes ToneScope. The report says so, because it is true
   * of the tree. A Vue, Svelte, Solid or Angular member's compound parts map
   * back to it, so a part reads as its member.
   */
  const membersByFile = new Map<string, Member[]>()
  for (const member of members) {
    for (const source of member.sources) {
      membersByFile.set(source, [...(membersByFile.get(source) ?? []), member])
    }
  }

  /*
   * Where each package's range is read. The framework's own packages, its
   * foundation and what its members import, are ranged in `own`: for React
   * `registry.packages`, for another framework its record in
   * `registry.vendor.frameworks`. The engine, the rules and the fonts, which
   * every framework shares, are ranged in `registry.packages`. Neither is
   * read in place of the other, so a package missing from the one it belongs
   * to stops the plan.
   */
  const own = frameworkRanges(registry, framework)
  const range = (
    name: string,
    ranges: Readonly<Record<string, string>> = registry.packages,
  ): string => {
    const declared = ranges[name]
    if (declared === undefined) {
      const where = ranges === registry.packages ? '' : ` in ${framework}`
      throw new Error(
        `polymorph: the registry has no version range for ${name}${where} — it cannot be installed`,
      )
    }
    return declared
  }

  const take = (from: string, to: string) => files.set(to, { from, to })

  for (const item of items) {
    if (item.startsWith(THEME_PREFIX)) {
      const name = item.slice(THEME_PREFIX.length)
      const wanted = fold(name)
      const system = registry.theme.systems.find((entry) => fold(entry.name) === wanted)
      // `theme:orchid` is a palette asked for under the system prefix. That is the
      // one wrong name for which suggesting the right form is worth it, after a
      // system's old name, which suggests the name it has now.
      if (!system) throw new UnknownItemError(item, nearestName(registry, item))
      if (systems.some((entry) => entry.name === system.name)) {
        notes.push(`${system.name} was asked for twice`)
        continue
      }

      const declared = paletteByName.get(system.defaultPalette)
      if (!declared) {
        throw new Error(
          `polymorph: ${system.name} declares the palette ${system.defaultPalette} and the ` +
            'registry does not ship one — it cannot be installed',
        )
      }

      systems.push({
        name: system.name,
        // Theme data gets its own directory instead of joining the vendored
        // source. It is the file a designer edits, and placing it under
        // `src/polymorph/controls/` would hide that.
        file: {
          from: system.file,
          to: elements
            ? `${dir}/${ELEMENTS_THEME_SHEET}`
            : `${dir}/themes/systems/${system.name}.json`,
        },
        defaultPalette: system.defaultPalette,
        fonts: system.fonts.map((font) => ({ family: font.family, package: font.package })),
      })
      // The pairing bundle. A system with no palette beside it resolves to
      // nothing, so its default palette is installed whether or not it was named.
      takePalette(declared)
      // A page with no build installs no package: it links a font's stylesheet itself.
      if (!elements) {
        for (const font of system.fonts) packages[font.package] = range(font.package)
      }
      continue
    }

    if (item.startsWith(PALETTE_PREFIX)) {
      const name = item.slice(PALETTE_PREFIX.length)
      const wanted = fold(name)
      const palette = registry.theme.palettes.find((entry) => fold(entry.name) === wanted)
      if (!palette) throw new UnknownItemError(item, nearestName(registry, item))

      // No note when a system already brought it, because that is the bundle, not
      // a duplicate request. Only a name asked for twice gets a note.
      if (!takePalette(palette) && askedFor.has(palette.name)) {
        notes.push(`${palette.name} was asked for twice`)
      }
      askedFor.add(palette.name)
      // No fonts and nothing else. A palette only sets colour, and the fonts
      // belong to the system it is paired with.
      continue
    }

    const member = byFoldedName.get(fold(item))
    if (!member) throw new UnknownItemError(item, suggest(registry, item))
    // Each framework's vocabulary ships only the members its map marks native.
    if (member.entry.status !== 'native') {
      throw new UnshippedMemberError(member.name, framework, member.entry.reason)
    }
    if (mapped !== null && member.entry.shell === undefined) {
      throw new Error(
        `polymorph: the registry marks ${member.name} native in ${mapped} and publishes no ` +
          'shell for it — it was built by an older registry; run `pnpm registry`',
      )
    }
    if (elements) {
      notes.push(elementsNote(member.name))
      continue
    }
    if (member.origin === 'installed') {
      // Not an error and not a no-op. The note tells the consumer they already have it.
      notes.push(
        `${member.name} ships inside ${foundation} — import it, there is nothing to vendor`,
      )
      packages[foundation] = range(foundation, own)
      continue
    }

    requested.push(member.name)
    for (const name of member.packages) packages[name] = range(name, own)
    for (const file of member.files) {
      for (const owner of membersByFile.get(file) ?? []) {
        // The registry's law keeps a native member from bringing an absent one;
        // a registry that broke it would plan files the framework does not ship.
        if (owner.entry.status !== 'native') {
          throw new UnshippedMemberError(owner.name, framework, owner.entry.reason)
        }
        components.add(owner.name)
      }
      take(file, rebase(registry, file, dir))
    }
  }

  // The ambient CSS Modules declaration, added once if any member was vendored.
  const vendored = files.size > 0
  if (vendored) {
    const support =
      mapped === null ? registry.vendor.support : registry.vendor.frameworks[mapped].support
    for (const file of support) take(file, rebase(registry, file, dir))
  }

  /*
   * The base layer comes with anything that is installed: a component, a theme,
   * or both. A theme install needs it most, because the only part of the theme
   * that reaches text outside any component is
   * `body { font-family: var(--pm-…) }`, and that rule is in the base layer.
   *
   * An install that resolves to nothing (`polymorph add icon`, which ships
   * inside `@polymorph/react`) gets no base layer, because nothing is
   * installed.
   */
  const lands = vendored || systems.length > 0 || palettes.size > 0

  // An elements install writes its theme sheet and nothing a build reads: the
  // base layer is in `polymorph.css`, and no lint config reads an HTML page.
  const devPackages: Record<string, string> = {}
  if (lands && !elements) {
    for (const name of boundaryPackages(registry, framework)) {
      if (name === foundation && !vendored) continue
      if (name === RULES_PACKAGE) devPackages[name] = range(name)
      else packages[name] = range(name, name === foundation ? own : registry.packages)
    }
    // The ESLint config a Vue, Svelte or Angular install generates reads its
    // components with these.
    if (mapped !== null) Object.assign(devPackages, COMPONENT_PARSERS[mapped])
  }

  return {
    version: registry.version,
    dir,
    components: [...components].sort(),
    requested,
    systems,
    palettes: [...palettes.values()].sort((a, b) => a.name.localeCompare(b.name)),
    base: lands && !elements ? { from: registry.vendor.base, to: `${dir}/${BASE_TARGET}` } : null,
    files: [...files.values()].sort((a, b) => a.to.localeCompare(b.to)),
    packages: sortedByName(packages),
    devPackages: sortedByName(devPackages),
    notes,
    ...(mapped === null ? {} : { framework: mapped }),
  }
}

const sortedByName = (ranges: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(ranges).sort(([a], [b]) => a.localeCompare(b)))

/**
 * `packages/react-ui/src/controls/Button.tsx` -> `src/polymorph/controls/Button.tsx`,
 * and `packages/recipes/src/controls/button.module.css` ->
 * `src/polymorph/controls/button.module.css`.
 *
 * The tree below each root is preserved exactly, and a recipe's path under the
 * recipes' root is its member's directory under the vendor root. So a recipe
 * lands beside its member, and every relative import and `composes` inside the
 * closure still resolves.
 */
function rebase(registry: Registry, file: string, dir: string): string {
  const { root, recipes } = registry.vendor
  // Every framework's tree mirrors the React one, so a member lands where
  // React's would.
  const from =
    [recipes.root, ...frameworkRoots(registry)].find((tree) => file.startsWith(`${tree}/`)) ?? root
  return `${dir}/${file.slice(from.length + 1)}`
}

/**
 * The text a vendored file is written with: the file as this repository has
 * it, with each recipe import rewritten to the relative path of the recipe's
 * copy.
 *
 * A member imports its recipe from `@polymorph/recipes`, the package every
 * framework's members share. `rebase` puts the copy beside the member, so in
 * `controls/Button.tsx` the specifier
 * `@polymorph/recipes/controls/button.module.css` becomes `./button.module.css`,
 * and a vendoring consumer installs no `@polymorph/recipes`. It is the only
 * rewrite, and only of an import's specifier: every other line is the line
 * this repository tests. The install hashes this text and `polymorph diff`
 * compares with it, so a member nobody changed reads as unchanged.
 *
 * `from` is the file's repository path, which says where its copy lands.
 */
export function vendoredText(registry: Registry, from: string, text: string): string {
  const { recipes } = registry.vendor
  // Every framework's member imports its recipe the same way, a Vue or Svelte
  // one from its `<script>`.
  const root = [registry.vendor.root, ...frameworkRoots(registry)].find((tree) =>
    from.startsWith(`${tree}/`),
  )
  if (root === undefined || !/\.(tsx?|vue|svelte)$/.test(from)) return text
  const directory = posix.dirname(from.slice(root.length + 1))

  const name = recipes.package.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
  const specifier = new RegExp(
    `(\\b(?:from|import)\\s*)(['"])${name}/([^'"?]+)(\\?[^'"]*)?\\2`,
    'g',
  )
  return text.replace(specifier, (_, keyword: string, quote: string, path: string, query = '') => {
    const relative = posix.relative(directory, path)
    const local = relative.startsWith('.') ? relative : `./${relative}`
    return `${keyword}${quote}${local}${query}${quote}`
  })
}
