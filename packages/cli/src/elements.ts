import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, posix, resolve } from 'node:path'

import type { Registry, RegistrySystem } from '@polymorph/registry'
import { admitTheme, prepaintScript, type ModePreference } from '@polymorph/theme'

import { DEFAULT_HARNESSES, freshRecord, planAgents, renderRecord, AGENT_RECORD } from './agents'
import type { Origin, Program } from './init-app'
import { digest, MANIFEST_FILE, readManifest, writeManifest, type Manifest } from './manifest'
import { injectPrepaint } from './patch'
import { ELEMENTS_DIR, ELEMENTS_THEME_SHEET, planInstall } from './plan'

/**
 * The elements on a page with no build: what `polymorph init --framework
 * elements` writes, and what `add` and `update` do in the install it records.
 *
 * A page loads every element from a few files the elements vocabulary's build
 * writes (`registry.vendor.frameworks.elements.noBuild`): `polymorph.js`, which
 * defines every `poly-*` tag and loads each member's code the first time one
 * of its elements connects, its chunks, `polymorph-all.js`, `polymorph.css`,
 * `prepaint.js` and a theme stylesheet per house system. No public URL serves
 * them, because the packages are published to a restricted registry, so the
 * install copies them into the app's static directory, beside the theme sheet
 * it compiles from the catalogue's documents.
 *
 * The install is recorded in `polymorph.json` like any other: each copied file
 * with the hash it was written with, so `diff` tells an edit from an upstream
 * change, and `update` copies what changed upstream and keeps what the page's
 * owner edited. Nothing is installed per member: `add button` says so. The
 * red rules do not read an HTML page, so the install writes no lint config.
 */

/** The static directory a new page and its files are written in, unless `--dir` names another. */
export const ELEMENTS_STATIC_DIR = dirname(ELEMENTS_DIR)

/** The members the example page composes. */
const PAGE_MEMBERS = ['Stack', 'Heading', 'Text', 'Button']

/** The files a page with no build loads have not been built in the source tree. */
export class NoBuildFilesError extends Error {
  constructor(dir: string, build: string, source: string) {
    super(
      `polymorph: ${dir} is not built in ${source} — it holds the files a page with no build ` +
        `loads the elements from, which a build writes. Run \`${build}\` in ${source}, then run ` +
        'this again.',
    )
    this.name = 'NoBuildFilesError'
  }
}

/** The example page names a member the elements vocabulary does not ship. */
export class UnshippedPageError extends Error {
  constructor(unshipped: readonly string[]) {
    super(
      'polymorph init: the example page names members the elements vocabulary does not ship, ' +
        `so nothing was written:\n${unshipped.join('\n')}`,
    )
    this.name = 'UnshippedPageError'
  }
}

/** One file of the install: where it lands, and where it comes from (`null` for the theme sheet). */
interface ElementsFile {
  to: string
  from: string | null
  contents: Buffer | string
}

/**
 * Every file the registry's no-build directory holds in `source`, repo-relative
 * and sorted. A directory that is missing or empty throws `NoBuildFilesError`,
 * which names the command that builds it.
 */
export function noBuildFiles(registry: Registry, source: string): string[] {
  const noBuild = registry.vendor.frameworks.elements.noBuild
  if (noBuild === undefined) {
    throw new Error(
      'polymorph: the registry names no files for a page with no build — it was built by an ' +
        'older registry; run `pnpm registry`',
    )
  }
  const files: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(resolve(source, dir), { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`
      if (entry.isDirectory()) walk(path)
      else if (entry.isFile()) files.push(path)
    }
  }
  if (existsSync(resolve(source, noBuild.dir))) walk(noBuild.dir)
  if (files.length === 0) throw new NoBuildFilesError(noBuild.dir, noBuild.build, source)
  return files.sort((a, b) => a.localeCompare(b))
}

/** `packages/elements-ui/dist/cdn/themes/plain.css` -> `public/polymorph/themes/plain.css`. */
function landing(registry: Registry, file: string, dir: string): string {
  const from = registry.vendor.frameworks.elements.noBuild?.dir ?? ''
  return `${dir}/${file.slice(from.length + 1)}`
}

/** A catalogue document, read from the source tree at the path the registry names. */
const documentAt = (source: string, path: string): unknown =>
  JSON.parse(readFileSync(resolve(source, path), 'utf8'))

/**
 * The theme sheet: each system with its own palette, then with every other
 * palette the install has, compiled by the engine from the catalogue's
 * documents. A palette that names a more-contrast partner is admitted with it.
 * An unlawful pairing throws with the law's own sentences.
 */
export function elementsThemeSheet(
  registry: Registry,
  source: string,
  systems: readonly string[],
  palettes: readonly string[],
): string {
  const paletteOf = (name: string) => registry.theme.palettes.find((entry) => entry.name === name)
  const pairings: [system: RegistrySystem, palette: string][] = []
  for (const name of [...systems].sort((a, b) => a.localeCompare(b))) {
    const system = registry.theme.systems.find((entry) => entry.name === name)
    if (system === undefined) continue
    pairings.push([system, system.defaultPalette])
    for (const palette of [...palettes].sort((a, b) => a.localeCompare(b))) {
      if (palette !== system.defaultPalette && paletteOf(palette) !== undefined) {
        pairings.push([system, palette])
      }
    }
  }

  const sheets = pairings.map(([system, name]) => {
    const palette = paletteOf(name)
    if (palette === undefined) {
      throw new Error(
        `polymorph: ${system.name} declares the palette ${name}, which is not shipped`,
      )
    }
    const partner = palette.moreContrast === undefined ? undefined : paletteOf(palette.moreContrast)
    const admission = admitTheme({
      system: documentAt(source, system.file),
      palette: documentAt(source, palette.file),
      moreContrast: partner === undefined ? undefined : documentAt(source, partner.file),
    })
    if (!admission.lawful) {
      const faults = admission.faults.map((fault) => `${fault.law}: ${fault.message}`)
      throw new Error(
        `polymorph: ${system.name} × ${name} does not admit —\n  ${faults.join('\n  ')}`,
      )
    }
    return admission.css
  })

  const named = pairings.map(([system, palette]) => `${system.name} + ${palette}`).join(', ')
  return (
    `/* polymorph — the theme sheet of this page: ${named}.\n` +
    ' * Compiled from the catalogue’s system and palette documents. `polymorph add\n' +
    ' * theme:<system>` and `polymorph update` write it again; `<html data-system\n' +
    ' * data-palette>` chooses the pairing a page wears. */\n' +
    sheets.join('\n')
  )
}

/**
 * Every file an elements install in `dir` writes: the no-build files, copied,
 * and the theme sheet for the systems and palettes it has.
 */
function installFiles(
  registry: Registry,
  source: string,
  dir: string,
  systems: readonly string[],
  palettes: readonly string[],
): ElementsFile[] {
  return [
    ...noBuildFiles(registry, source).map((from) => ({
      to: landing(registry, from, dir),
      from,
      contents: readFileSync(resolve(source, from)),
    })),
    {
      to: `${dir}/${ELEMENTS_THEME_SHEET}`,
      from: null,
      contents: elementsThemeSheet(registry, source, systems, palettes),
    },
  ]
}

/** The manifest an elements install records: every file it wrote, with the hash it wrote it with. */
function manifestOf(
  registry: Registry,
  dir: string,
  systems: readonly string[],
  palettes: readonly string[],
  files: readonly ElementsFile[],
): Manifest {
  return {
    version: registry.version,
    dir,
    components: [],
    systems: [...systems],
    palettes: [...palettes],
    files: Object.fromEntries(
      files.map((file) => [file.to, { hash: digest(file.contents), source: file.from }]),
    ),
    framework: 'elements',
  }
}

/* -------------------------------------------------------------------------- */
/* init                                                                       */
/* -------------------------------------------------------------------------- */

/** One file `polymorph init --framework elements` writes. */
export type ElementsInitStep =
  { kind: 'write'; path: string; contents: string } | { kind: 'copy'; path: string; from: string }

/** What the init writes, in order, and the pairing the page wears. */
export interface ElementsInitPlan {
  system: RegistrySystem
  palette: string
  steps: ElementsInitStep[]
}

/**
 * The pre-paint script of a page with no build, as `prepaint.js` holds it: built
 * with every house system's default mode, because the page's theme sheet is
 * compiled from the catalogue's documents. The page names its pairing on
 * `<html>`, so the script reads the system there and needs no fallback.
 */
export function elementsPrepaint(registry: Registry): string {
  return prepaintScript({
    modes: Object.fromEntries(
      registry.theme.systems.map((system) => [system.name, system.defaultMode as ModePreference]),
    ),
  })
}

/** The example page: the stylesheets, the prepaint script and the elements, then a few members. */
function examplePage(name: string, files: string, system: string, palette: string): string {
  return `<!doctype html>
<html lang="en" data-system="${system}" data-palette="${palette}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${name}</title>
    <!-- The stylesheets load before the elements, so no member paints unstyled. -->
    <link rel="stylesheet" href="${files}/polymorph.css" />
    <link rel="stylesheet" href="${files}/${ELEMENTS_THEME_SHEET}" />
    <!-- Defines every poly-* element, and loads each one's code the first time it is used. -->
    <script type="module" src="${files}/polymorph.js"></script>
  </head>
  <body>
    <poly-stack gap="5" p="6">
      <poly-heading>Welcome</poly-heading>
      <poly-text tone="secondary">A polymorph page with no build, themed and ready for its first screen.</poly-text>
      <poly-button variant="solid" tone="accent" label="Start"></poly-button>
    </poly-stack>
    <script type="module">
      // A member's callback is a poly-* event on its element.
      const start = document.querySelector('poly-button')
      start.addEventListener('poly-click', () => {
        start.label = 'Started'
      })
    </script>
  </body>
</html>
`
}

/**
 * Everything `polymorph init --framework elements` writes, in order. It reads
 * the source tree for the no-build files, which are a build output the
 * registry names by directory, so a missing build is refused before anything
 * is written.
 *
 * `staticDir` is the app's static directory: the page is written there and
 * the files in `polymorph/` inside it.
 */
export function planElementsInit(
  registry: Registry,
  source: string,
  options: {
    name: string
    system: RegistrySystem
    staticDir: string
    mcp: Program
    /** The CLI as the agent files name it: `toolsOf` in `init.ts`. */
    tools: Program
    /** A checkout when omitted. */
    origin?: Origin
  },
): ElementsInitPlan {
  const { name, system, staticDir } = options
  const unshipped = PAGE_MEMBERS.flatMap((member) => {
    const entry = registry.components.find((component) => component.name === member)?.frameworks
      .elements
    return entry?.status === 'native' ? [] : [`  ${member}: ${entry?.reason ?? 'not a member'}`]
  })
  if (unshipped.length > 0) throw new UnshippedPageError(unshipped)

  const dir = posix.join(staticDir, posix.basename(ELEMENTS_DIR))
  const page = posix.join(staticDir, 'index.html')
  const files = installFiles(registry, source, dir, [system.name], [system.defaultPalette])
  const manifest = manifestOf(registry, dir, [system.name], [system.defaultPalette], files)
  const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`
  // A page has no package.json, so no lint script: the red rules do not read HTML.
  const agents = planAgents(registry, {
    harnesses: DEFAULT_HARNESSES,
    framework: 'elements',
    origin: options.origin ?? 'checkout',
    tools: options.tools,
    mcp: options.mcp,
    lint: null,
  })

  return {
    system,
    palette: system.defaultPalette,
    steps: [
      ...files.map((file): ElementsInitStep =>
        file.from === null
          ? { kind: 'write', path: file.to, contents: String(file.contents) }
          : { kind: 'copy', path: file.to, from: file.from },
      ),
      {
        kind: 'write',
        path: page,
        // The stored theme choice, inline and first in `<head>`, before any stylesheet resolves.
        contents: injectPrepaint(
          examplePage(name, posix.basename(dir), system.name, system.defaultPalette),
          elementsPrepaint(registry),
        ),
      },
      // The agent files `polymorph agents` writes, for the harnesses it writes by default.
      ...agents.steps.map((step): ElementsInitStep => ({
        kind: 'write',
        path: step.path,
        contents: step.contents,
      })),
      { kind: 'write', path: AGENT_RECORD, contents: renderRecord(freshRecord(registry, agents)) },
      // Written in the same shape `writeManifest` writes, so a later install reads it back.
      { kind: 'write', path: MANIFEST_FILE, contents: json(ordered(manifest)) },
    ],
  }
}

/** The manifest with its keys and lists in the order `writeManifest` writes them. */
function ordered(manifest: Manifest): Manifest {
  return {
    version: manifest.version,
    dir: manifest.dir,
    components: [...manifest.components].sort(),
    systems: [...manifest.systems].sort(),
    palettes: [...manifest.palettes].sort(),
    files: Object.fromEntries(
      Object.entries(manifest.files).sort(([a], [b]) => a.localeCompare(b)),
    ),
    framework: 'elements',
  }
}

/* -------------------------------------------------------------------------- */
/* add and update                                                             */
/* -------------------------------------------------------------------------- */

export interface ElementsResult {
  /** The paths written. */
  written: string[]
  /** The paths kept because their owner edited them. */
  skipped: string[]
  /** The paths removed because the build no longer writes them. */
  removed: string[]
  notes: string[]
}

/**
 * Writes `files` into an install, as `applyPlan` writes a vendored install: a
 * file whose disk bytes differ from the hash it was installed with is the
 * owner's edit and is kept unless `force`. A file with no record that already
 * exists is kept too, unless it is what would be written. A file that is
 * already what would be written is not written again. Every file is recorded
 * with the hash of what was written.
 */
function writeFiles(
  root: string,
  manifest: Manifest,
  files: readonly ElementsFile[],
  force: boolean,
): { written: string[]; skipped: string[] } {
  const written: string[] = []
  const skipped: string[] = []
  for (const file of files) {
    const full = resolve(root, file.to)
    const hash = digest(file.contents)
    const known = manifest.files[file.to]
    if (existsSync(full)) {
      const theirs = digest(readFileSync(full))
      // Already what would be written: recorded, and not written again.
      if (theirs === hash) {
        manifest.files[file.to] = { hash, source: file.from }
        continue
      }
      if (!force && theirs !== known?.hash) {
        skipped.push(file.to)
        continue
      }
    }
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, file.contents)
    manifest.files[file.to] = { hash, source: file.from }
    written.push(file.to)
  }
  return { written, skipped }
}

/**
 * `polymorph add` in an elements install. A member is installed by nothing,
 * and the note says why. A system or palette joins the install's theme sheet,
 * which is written again with every pairing the install has. Without a
 * manifest there is no install to add a theme to, and `init` is the way in.
 */
export function addElements(
  root: string,
  source: string,
  registry: Registry,
  items: string[],
  options: { dir?: string; force: boolean },
): ElementsResult {
  const manifest = readManifest(root)
  const plan = planInstall(registry, items, {
    framework: 'elements',
    ...(manifest !== null
      ? { dir: manifest.dir }
      : options.dir === undefined
        ? {}
        : { dir: options.dir }),
  })
  const notes = [...plan.notes]
  const themed = plan.systems.length > 0 || plan.palettes.length > 0
  if (!themed) return { written: [], skipped: [], removed: [], notes }
  if (manifest === null) {
    notes.push(
      `there is no ${MANIFEST_FILE} here, so there is no page to theme — ` +
        '`polymorph init <dir> --framework elements` writes one, with its files and its theme',
    )
    return { written: [], skipped: [], removed: [], notes }
  }

  const systems = [...new Set([...manifest.systems, ...plan.systems.map(({ name }) => name)])]
  const palettes = [...new Set([...manifest.palettes, ...plan.palettes.map(({ name }) => name)])]
  const sheet = {
    to: `${manifest.dir}/${ELEMENTS_THEME_SHEET}`,
    from: null,
    contents: elementsThemeSheet(registry, source, systems, palettes),
  }
  const { written, skipped } = writeFiles(root, manifest, [sheet], options.force)
  manifest.systems = systems
  manifest.palettes = palettes
  writeManifest(root, manifest)

  for (const system of plan.systems) {
    const fonts = system.fonts.map((font) => font.family).join(', ')
    notes.push(
      `${system.name} is in ${sheet.to}: \`<html data-system="${system.name}" ` +
        `data-palette="${system.defaultPalette}">\` wears it; it names ${fonts}, whose stylesheets ` +
        'the page links itself',
    )
  }
  return { written, skipped, removed: [], notes }
}

/**
 * `polymorph update` in an elements install: the no-build files copied again
 * where the build changed them and the owner did not, the theme sheet written
 * again, and a file the build no longer writes removed where it is as
 * installed. The edit rules are `writeFiles`'s, and `force` takes ours.
 */
export function updateElements(
  root: string,
  source: string,
  registry: Registry,
  manifest: Manifest,
  force: boolean,
): ElementsResult {
  const systems = manifest.systems.filter((name) =>
    registry.theme.systems.some((system) => system.name === name),
  )
  const palettes = manifest.palettes.filter((name) =>
    registry.theme.palettes.some((palette) => palette.name === name),
  )
  const notes = [
    ...manifest.systems.filter((name) => !systems.includes(name)),
    ...manifest.palettes.filter((name) => !palettes.includes(name)),
  ].map((name) => `${name} no longer ships — it is left out of the theme sheet`)

  const files = installFiles(registry, source, manifest.dir, systems, palettes)
  const { written, skipped } = writeFiles(root, manifest, files, force)

  const carried = new Set(files.map((file) => file.to))
  const removed: string[] = []
  for (const [path, record] of Object.entries(manifest.files)) {
    if (carried.has(path) || !path.startsWith(`${manifest.dir}/`)) continue
    const full = resolve(root, path)
    if (existsSync(full) && !force && digest(readFileSync(full)) !== record.hash) {
      notes.push(`${path} is no longer part of the build, and you have edited it — kept`)
      continue
    }
    if (existsSync(full)) rmSync(full)
    delete manifest.files[path]
    removed.push(path)
  }

  manifest.version = registry.version
  manifest.systems = systems
  manifest.palettes = palettes
  writeManifest(root, manifest)
  return { written, skipped, removed, notes }
}
