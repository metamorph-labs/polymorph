import iconSet from '../../../design/icons.json' with { type: 'json' }
import { ICON_SIZES } from '@polymorph/theme'

import {
  FRAMEWORK_FOUNDATION,
  FRAMEWORK_VOCABULARY,
  frameworkFaults,
  FRAMEWORKS,
  MAPPED_FRAMEWORKS,
  type Framework,
  type FrameworkShell,
  type MappedFramework,
  type MemberFrameworks,
} from './frameworks'
import {
  FRAMEWORK_TREES,
  INSTALLED_PACKAGES,
  NO_BUILD_FILES,
  readFrameworkPackageVersions,
  readPackageVersions,
  readShells,
  readVersion,
  RECIPES_PACKAGE,
  RECIPES_ROOT,
} from './install'
import { PLATFORMS, platformFaults, type Platform } from './platforms'
import { readLadder, readLaws, type LadderRung, type RegistryLaw } from './rulings'
import { SCHEMA_ID } from './schema'
import { readTheme, type ThemeCatalogue } from './theme'
import {
  openUiProgram,
  readExceptionPrimitives,
  readFrameworkDocuments,
  readFrameworkMap,
  readPlatformDocuments,
  readDataTypes,
  readPlatformMap,
  readVocabulary,
  vocabularyNames,
  type ExceptionPrimitive,
  type RegistryComponent,
  type RegistryDataType,
} from './vocabulary'

/**
 * `buildRegistry` builds the whole catalogue from source in one call.
 *
 * The build must be deterministic. The registry and the card regenerate
 * byte-identical on an unchanged tree, and `registry.test.ts` builds it twice
 * to check. So nothing below uses a timestamp, a commit hash, an absolute path
 * or unordered iteration. Every list is either in a deterministic source order
 * (gallery order) or explicitly sorted.
 */

export interface Registry {
  schema: typeof SCHEMA_ID
  /**
   * `@polymorph/react`'s version. It is the semver line a consumer upgrades
   * along, and the one `polymorph diff` compares an install against. The
   * vocabulary has no version of its own. Vendored source belongs to the
   * consumer, and a version number on code someone else owns would mean nothing.
   */
  version: string
  /**
   * The platforms the vocabulary is mapped to, in the order every member's
   * `platforms` entry is keyed. `web` is the React vocabulary itself.
   */
  platforms: Platform[]
  /**
   * The web frameworks the vocabulary ships in, in the order every member's
   * `frameworks` entry is keyed. `react` is the vocabulary itself.
   */
  frameworks: Framework[]
  components: RegistryComponent[]
  /**
   * Every named data type the members' props take (`SelectOption`,
   * `DataTableColumn<Row>`), with its fields, sorted by name: what a reader
   * with no compiler needs to write one.
   */
  dataTypes: RegistryDataType[]
  vendor: {
    root: string
    /**
     * The package members import their recipes from, and the tree its
     * specifiers name. An install copies a recipe from this tree to the path
     * its member has under `root`, beside the member.
     */
    recipes: { package: string; root: string }
    support: string[]
    base: string
    /**
     * Each framework but React: the tree its members are vendored from, the
     * files every install of them needs and no member imports, and the range
     * an install in it writes each of its own packages at: its foundation, its
     * vocabulary and every package its members import, read from its own
     * manifests. A member's own files are in its `frameworks.<framework>.shell`.
     * The elements also name the files a page with no build loads them from
     * (`noBuild`), which `polymorph init --framework elements` copies.
     */
    frameworks: Record<
      MappedFramework,
      {
        root: string
        support: string[]
        packages: Record<string, string>
        noBuild?: { dir: string; build: string }
      }
    >
  }
  /**
   * The range a consumer installs each package at: the installed packages,
   * what React's vendored members and the ladder's primitives import, and the
   * systems' webfonts, read from the React manifests and the workbench.
   * Another framework's packages are ranged in `vendor.frameworks`.
   */
  packages: Record<string, string>
  icons: { sizes: string[]; roles: { name: string; group: string }[]; trailing: string[] }
  theme: ThemeCatalogue
  exceptions: { ladder: LadderRung[]; primitives: ExceptionPrimitive[] }
  laws: RegistryLaw[]
}

const VENDOR_ROOT = 'packages/react-ui/src'

/**
 * Files every vendored install needs and no component imports.
 *
 * There is one entry: the CSS Modules ambient declaration. Without it, every
 * `import styles from './button.module.css'` in a consumer's repository is a
 * type error, so the install does not typecheck. The closure walk cannot find
 * it, because nothing imports an ambient `.d.ts`.
 */
const VENDOR_SUPPORT = [`${VENDOR_ROOT}/css-modules.d.ts`]

/**
 * The base layer. It is the other file no closure walk can reach, and its
 * absence shows on the page instead of failing the build.
 *
 * `support` above is unreachable because nothing imports an ambient
 * declaration. This file is unreachable because it declares no class. The
 * package root imports it for its side effect, so a consumer of
 * `@polymorph/react-ui` gets it automatically. A *vendored* consumer has no
 * package root. They import `controls/Button` directly, and nothing in that
 * file's import graph leads here.
 *
 * Without it, the vendored page runs on user-agent defaults: content-box
 * everywhere, an 8px margin on `<body>`, an `<h2>` margin that *adds to* a
 * Stack's gap, and body text in the UA serif because nothing binds it to
 * `--pm-text-md-family`. The base layer exists to prevent those defaults, and
 * omitting it brings them back at the package boundary.
 *
 * The path is published here instead of being known by the installer, because
 * *where the base layer lives* is a fact about the vocabulary. Composing the
 * path inside `packages/cli` would work, but it would put a vocabulary fact
 * inside a thin front. If the file moved, the front and the catalogue would
 * disagree, and the catalogue would look wrong.
 */
const VENDOR_BASE = `${RECIPES_ROOT}/base.css`

export function buildRegistry(root: string): Registry {
  const ui = openUiProgram(root)
  const names = vocabularyNames(ui)
  // Read once and handed to both readers, so a member and a primitive are
  // checked by the same law in the same pass.
  const platforms = readPlatformMap(root, names)
  const frameworks = readFrameworkMap(ui)
  const read = readVocabulary(ui, platforms, frameworks)
  const readPrimitives = readExceptionPrimitives(ui, platforms, frameworks)
  // The law's clause about composition needs what each member composes, which
  // only the read above knows, so the map is checked once more with it.
  const faults = platformFaults(
    names,
    readPlatformDocuments(root),
    Object.fromEntries(read.map(({ name, dependencies }) => [name, dependencies.components])),
  )
  if (faults.length > 0) {
    throw new Error(`registry: the platform map is not lawful:\n  ${faults.join('\n  ')}`)
  }

  // What each member native in each mapped framework is made of there, read
  // from that framework's tree, and the framework map checked once more with
  // what each one brings.
  const shells = Object.fromEntries(
    MAPPED_FRAMEWORKS.map((framework) => {
      const natives = [...frameworks]
        .filter(([, entries]) => entries[framework].status === 'native')
        .map(([name]) => name)
      return [framework, readShells(root, framework, natives)]
    }),
  ) as Record<MappedFramework, ReturnType<typeof readShells>>
  const mapFaults = frameworkFaults(
    ui.components.map(({ name }) => name),
    readFrameworkDocuments(root),
    readPrimitives.map(({ name }) => name),
    Object.fromEntries(MAPPED_FRAMEWORKS.map((framework) => [framework, shells[framework].brings])),
  )
  if (mapFaults.length > 0) {
    throw new Error(`registry: the framework map is not lawful:\n  ${mapFaults.join('\n  ')}`)
  }
  const withShell = (name: string, entries: MemberFrameworks): MemberFrameworks => {
    const withShells = { ...entries }
    for (const framework of MAPPED_FRAMEWORKS) {
      const shell = shells[framework].shells.get(name)
      if (shell !== undefined) withShells[framework] = { ...entries[framework], shell }
    }
    return withShells
  }
  const components = read.map((component) => ({
    ...component,
    frameworks: withShell(component.name, component.frameworks),
  }))
  const primitives = readPrimitives.map((primitive) => ({
    ...primitive,
    frameworks: withShell(primitive.name, primitive.frameworks),
  }))
  const theme = readTheme(root)
  const ladder = readLadder(root)

  // Exactly the packages a consumer could be asked to install, other than
  // another framework's own: the installed packages themselves, those React's
  // *vendored* half imports (members and the ladder's primitives alike), and
  // the webfonts a theme install carries.
  // Fonts belong to the system, not the palette, so a palette install adds
  // nothing here. An installed component's dependencies ship with the package
  // it is installed from. Nobody vendors Icon, so nobody installs `lucide` for
  // it.
  const installable = [
    ...new Set([
      ...INSTALLED_PACKAGES,
      ...components
        .filter((component) => component.origin === 'vendored')
        .flatMap((component) => component.dependencies.packages),
      ...primitives.flatMap((primitive) => primitive.dependencies.packages),
      ...theme.systems.flatMap((system) => system.fonts.map((font) => font.package)),
    ]),
  ]
  // Each other framework's packages are ranged apart from React's, from its
  // own foundation and vocabulary manifests: its foundation and vocabulary,
  // which `polymorph init` installs, and what its vendored members import. The
  // vocabularies import the same Zag machines and need not range them alike,
  // so one record for every framework would hold whichever range was read last.
  const frameworkPackages = (framework: MappedFramework): Record<string, string> =>
    readFrameworkPackageVersions(root, framework, [
      ...new Set([
        FRAMEWORK_FOUNDATION[framework],
        FRAMEWORK_VOCABULARY[framework],
        ...[...shells[framework].shells.values()].flatMap(
          (shell: FrameworkShell) => shell.dependencies.packages,
        ),
      ]),
    ])

  return {
    schema: SCHEMA_ID,
    version: readVersion(root),
    platforms: [...PLATFORMS],
    frameworks: [...FRAMEWORKS],
    components,
    dataTypes: readDataTypes(ui),
    vendor: {
      root: VENDOR_ROOT,
      recipes: { package: RECIPES_PACKAGE, root: RECIPES_ROOT },
      support: VENDOR_SUPPORT,
      base: VENDOR_BASE,
      frameworks: Object.fromEntries(
        MAPPED_FRAMEWORKS.map((framework) => [
          framework,
          {
            root: FRAMEWORK_TREES[framework].root,
            support: FRAMEWORK_TREES[framework].support,
            packages: frameworkPackages(framework),
            ...(framework === 'elements' ? { noBuild: { ...NO_BUILD_FILES } } : {}),
          },
        ]),
      ) as Registry['vendor']['frameworks'],
    },
    packages: readPackageVersions(root, installable),
    icons: {
      sizes: [...ICON_SIZES],
      // The closed semantic enum. Each role is a *meaning*, and the glyph it maps
      // to is deliberately not published. A consumer that knew the glyph would
      // start asking for glyphs instead of meanings.
      roles: Object.entries(iconSet.roles)
        .map(([name, meta]) => ({ name, group: (meta as { group: string }).group }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      // The roles a Button's trailing icon may take: a direction or a disclosure. The red rule
      // `trailing-icon` and the spec validator read this one list.
      trailing: [...iconSet.trailing],
    },
    theme,
    exceptions: { ladder, primitives },
    // The ladder is passed in, not re-read. `readLaws` checks that every rung a
    // rule points to exists in the ladder, and that check must use the ladder
    // this document publishes.
    laws: readLaws(ladder),
  }
}

/**
 * The registry as it is published: two-space JSON with a trailing newline.
 *
 * There is one writer, so the file the CLI writes and the string the
 * determinism law compares are the same bytes, not two renderings that happen
 * to agree.
 */
export function renderRegistry(registry: Registry): string {
  return `${JSON.stringify(registry, null, 2)}\n`
}
