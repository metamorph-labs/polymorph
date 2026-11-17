import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute, posix, relative, resolve, sep } from 'node:path'

import {
  codeFrameworkOf,
  FRAMEWORK_VOCABULARY,
  FRAMEWORKS,
  type Framework,
  type Registry,
} from '@polymorph/registry'
import type { Diagnostic, VerifyOptions, VerifyResult } from '@polymorph/rules/verify'

import { MANIFEST_FILE, readManifest } from './manifest'
import { escapes, EscapingDirError } from './plan'
import { applicationFiles } from './reach'
import { UnknownFrameworkError } from './vue'

/**
 * `polymorph check <dir>`: the red rules over a directory, with no config.
 *
 * A repository that installs the packages and never set up ESLint or
 * Stylelint has no red rule running at all, and its stylesheets can re-make
 * every decision the theme made. `check` runs `verify` from
 * `@polymorph/rules/verify` over each file the rules read, the same function
 * the MCP server's `validate` calls, so it reports what an installed config
 * would report. It writes nothing.
 *
 * **What it reads.** Every `.ts`, `.tsx`, `.vue`, `.svelte`, `.html` and
 * `.css` file below the directory, as application code, outside
 * dot-directories, `node_modules`, `dist`, `build`, `coverage` and `out` (the
 * directories `update` also leaves out). The vendored directory that
 * `polymorph.json` records is the vocabulary, which the rules hold to other
 * laws, so it is not read. A `.html` file is read as an Angular template, so
 * it is read only where the project uses the Angular vocabulary. In a project
 * that uses the elements a `.html` file is a page, which the red rules do not
 * read, so it is not read either, and the notes say so.
 *
 * **Which framework a file is in** is answered by the function the MCP server
 * answers it with for `fix_file` (`codeFrameworkOf` in `@polymorph/registry`):
 * the extension for a `.vue` or `.svelte` file; for a `.html` file, an elements
 * page where the project uses the elements and not Angular, and an Angular
 * template otherwise; for a `.ts` module, Angular when the package it is in
 * uses the Angular vocabulary; for TSX, Solid when the package uses the Solid
 * vocabulary and not the React one. A package uses a vocabulary when its
 * `package.json` depends on it or `polymorph.json` records that framework, so
 * a page with no build, which has no `package.json`, is answered by its
 * manifest. `--framework` names it for every file instead.
 */

/** The files the red rules read. */
const CHECKED = /\.(?:tsx?|vue|svelte|html|css)$/

/** A usage error: the report is the message, and nothing was read. */
export class CheckError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CheckError'
  }
}

/** `verify`, passed in so the linters load only for `check`. */
export type Verify = (source: string, options: VerifyOptions) => Promise<VerifyResult>

export interface CheckOptions {
  /** The directory or file to check, relative to the root. Default: the root. */
  dir?: string
  /** The framework every file is read in, instead of the one inferred. */
  framework?: string
}

/** A report, with the rungs of the exception ladder that answer its rule. */
export interface CheckViolation extends Diagnostic {
  rungs: number[]
}

export interface CheckedFile {
  /** Relative to the root. */
  path: string
  /** The framework the file was read in. */
  framework: Framework
  /** Why the file could not be read, in which case no rule ran on it. */
  fatal: string | null
  violations: CheckViolation[]
}

export interface CheckReport {
  /** No violation and no file left unread. */
  ok: boolean
  /** What was checked, relative to the root: `.` for the root. */
  dir: string
  /** How many files were read. */
  checked: number
  /** The files with a violation or a fatal error, in path order. */
  files: CheckedFile[]
  /** What was not read, and why. */
  notes: string[]
}

/** A directory or file named on the command line, as a root-relative POSIX path (`''` for the root). */
function within(root: string, dir: string): string {
  const named = isAbsolute(dir) ? relative(root, dir) || '.' : dir
  if (escapes(named)) throw new EscapingDirError(dir, 'the directory `check` reads')
  const path = posix.normalize(named.split(sep).join('/')).replace(/\/+$/, '')
  return path === '.' ? '' : path
}

/** Whether `path` is `dir` or inside it. */
const inside = (path: string, dir: string): boolean => path === dir || path.startsWith(`${dir}/`)

/**
 * What a project says about its packages: which vocabulary the package a file
 * is in depends on, read once per `package.json`.
 */
class Project {
  private readonly manifests = new Map<string, Record<string, unknown> | null>()

  constructor(
    readonly root: string,
    /** The framework `polymorph.json` records, if any. */
    readonly recorded: Framework | undefined,
  ) {}

  /** Whether the project has a `package.json` at its root. */
  get packaged(): boolean {
    return existsSync(resolve(this.root, 'package.json'))
  }

  /** Whether the project can say which vocabulary it uses: a `package.json`, or a manifest that records one. */
  get answers(): boolean {
    return this.packaged || this.recorded !== undefined
  }

  /**
   * Whether the package `path` is in declares `name`, or `null` when no
   * manifest at or above it can be read. The nearest `package.json` answers,
   * because a project can be a workspace.
   */
  declares(path: string, name: string): boolean | null {
    let directory = dirname(resolve(this.root, path))
    while (!existsSync(resolve(directory, 'package.json'))) {
      const above = dirname(directory)
      if (above === directory) return null
      directory = above
    }
    const manifest = this.manifest(directory)
    if (manifest === null) return null
    return ['dependencies', 'devDependencies', 'peerDependencies'].some(
      (field) => (manifest[field] as Record<string, string> | undefined)?.[name] !== undefined,
    )
  }

  /** Whether the package `path` is in uses `framework`'s vocabulary. */
  uses(path: string, framework: Framework): boolean {
    return (
      this.recorded === framework || this.declares(path, FRAMEWORK_VOCABULARY[framework]) === true
    )
  }

  private manifest(directory: string): Record<string, unknown> | null {
    if (!this.manifests.has(directory)) {
      let parsed: Record<string, unknown> | null
      try {
        parsed = JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8')) as Record<
          string,
          unknown
        >
      } catch {
        parsed = null
      }
      this.manifests.set(directory, parsed)
    }
    return this.manifests.get(directory) ?? null
  }
}

/** The framework a file is read in, asked of the project as the MCP server asks it. */
function frameworkOf(project: Project, asked: Framework | undefined, path: string): Framework {
  return codeFrameworkOf(
    asked,
    path,
    project.answers ? (framework) => project.uses(path, framework) : null,
  )
}

/**
 * The module a rewritten `<button>` imports `Button` from, which only the
 * reports' `fix` depends on: the framework's vocabulary where the file's
 * package depends on it, and `null` where the project vendors its members.
 */
function vocabularyOf(project: Project, framework: Framework, path: string): string | null {
  const vocabulary = FRAMEWORK_VOCABULARY[framework]
  if (!project.packaged) return vocabulary
  return project.declares(path, vocabulary) === true ? vocabulary : null
}

/**
 * Checks every file the red rules read below `options.dir`.
 *
 * `climb` gives each rule's rungs, from the registry's law catalogue, so a
 * report carries the rungs that answer it even where its message names none.
 */
export async function check(
  root: string,
  registry: Registry,
  verify: Verify,
  options: CheckOptions = {},
): Promise<CheckReport> {
  if (
    options.framework !== undefined &&
    !(FRAMEWORKS as readonly string[]).includes(options.framework)
  ) {
    throw new UnknownFrameworkError(options.framework)
  }
  const asked = options.framework as Framework | undefined
  const from = within(root, options.dir ?? '.')
  const shown = from === '' ? '.' : from
  if (!existsSync(resolve(root, from))) {
    throw new CheckError(`polymorph check: there is no "${shown}" in ${root}`)
  }

  let manifest: ReturnType<typeof readManifest>
  try {
    manifest = readManifest(root)
  } catch (error) {
    if (error instanceof EscapingDirError) throw error
    throw new CheckError(
      `polymorph check: ${MANIFEST_FILE} cannot be read, so the vendored directory is unknown — ` +
        (error instanceof Error ? error.message : String(error)),
    )
  }
  const vendored = manifest === null ? null : within(root, manifest.dir)
  const project = new Project(root, manifest?.framework)
  const notes: string[] = []

  if (vendored !== null && from !== '' && inside(from, vendored)) {
    notes.push(
      `${shown} is in ${vendored}, the vendored vocabulary, which ` +
        'polymorph.eslint.js and polymorph.stylelint.js hold to its own rules',
    )
    return { ok: true, dir: shown, checked: 0, files: [], notes }
  }

  let paths: string[]
  if (statSync(resolve(root, from)).isFile()) {
    if (!CHECKED.test(from)) {
      throw new CheckError(
        `polymorph check: ${shown} is not a file the red rules read — they read .ts, .tsx, ` +
          '.vue, .svelte, .html and .css files',
      )
    }
    paths = [from]
  } else {
    paths = applicationFiles(root, vendored, CHECKED, from).sort()
    if (vendored !== null && (from === '' || inside(vendored, from))) {
      notes.push(`${vendored} is the vendored vocabulary and is not read as application code`)
    }
  }

  const climb = new Map(registry.laws.map((law) => [law.name, law.climb]))
  const files: CheckedFile[] = []
  const templates: string[] = []
  const pages: string[] = []
  let checked = 0

  for (const path of paths) {
    const framework = frameworkOf(project, asked, path)
    // An elements page is HTML, which the red rules do not read.
    if (path.endsWith('.html') && framework === 'elements') {
      pages.push(path)
      continue
    }
    // A `.html` file is read as an Angular template. In a project that does not
    // use the Angular vocabulary it is an entry document, not a template.
    if (path.endsWith('.html') && asked !== 'angular' && !project.uses(path, 'angular')) {
      templates.push(path)
      continue
    }
    const css = path.endsWith('.css')
    const result = await verify(readFileSync(resolve(root, path), 'utf8'), {
      surface: 'application',
      filename: path,
      ...(css ? {} : { framework, vocabulary: vocabularyOf(project, framework, path) }),
    })
    checked += 1
    if (result.fatal === null && result.diagnostics.length === 0) continue
    files.push({
      path,
      framework,
      fatal: result.fatal,
      violations: result.diagnostics.map((diagnostic) => ({
        ...diagnostic,
        rungs: climb.get(diagnostic.rule) ?? [],
      })),
    })
  }

  if (templates.length > 0) {
    notes.push(
      `${templates.length} .html file${templates.length === 1 ? ' was' : 's were'} not read: the ` +
        'rules read .html as an Angular template, and this project does not use the Angular ' +
        'vocabulary (--framework angular reads them)',
    )
  }

  if (pages.length > 0) {
    notes.push(
      `${pages.length} .html file${pages.length === 1 ? ' was' : 's were'} not read: ` +
        `${pages.length === 1 ? 'it is an elements page' : 'they are elements pages'}, and the ` +
        'red rules do not read HTML',
    )
  }

  return { ok: files.length === 0, dir: shown, checked, files, notes }
}

/* -------------------------------------------------------------------------- */
/* What the terminal shows                                                    */
/* -------------------------------------------------------------------------- */

/** A rule's rungs as a line: `rung 1 variant selection · rung 2 …`, or what to do without one. */
function rungLine(registry: Registry, rungs: number[]): string {
  if (rungs.length === 0) return 'no rung: fix the code'
  const names = new Map(registry.exceptions.ladder.map((rung) => [rung.rung, rung.name]))
  return rungs
    .map((rung) => `rung ${rung} ${(names.get(rung) ?? '').toLowerCase()}`.trimEnd())
    .join(' · ')
}

/**
 * The report as lines: each file, then each rule it breaks with the rungs
 * that answer it, then each report at its line and column.
 */
export function checkLines(registry: Registry, report: CheckReport): string[] {
  const read = `${report.checked} file${report.checked === 1 ? '' : 's'} read`
  const lines: string[] = [`polymorph check ${report.dir} — ${read}`]
  for (const note of report.notes) lines.push(`  · ${note}`)

  for (const file of report.files) {
    lines.push('', file.path)
    if (file.fatal !== null) lines.push(`  not read: ${file.fatal}`)
    const rules = [...new Set(file.violations.map((violation) => violation.rule))]
    for (const rule of rules) {
      const reports = file.violations.filter((violation) => violation.rule === rule)
      lines.push(`  ${rule} — ${rungLine(registry, reports[0]?.rungs ?? [])}`)
      for (const { line, column, message } of reports) {
        lines.push(`    ${`${line}:${column}`.padEnd(7)} ${message}`)
      }
    }
  }

  const violations = report.files.reduce((sum, file) => sum + file.violations.length, 0)
  const unread = report.files.filter((file) => file.fatal !== null).length
  lines.push('')
  if (report.ok) {
    lines.push('No violations.')
  } else {
    const broken = report.files.filter((file) => file.violations.length > 0).length
    const parts = [
      ...(violations > 0
        ? [
            `${violations} violation${violations === 1 ? '' : 's'} in ${broken} file${broken === 1 ? '' : 's'}`,
          ]
        : []),
      ...(unread > 0 ? [`${unread} file${unread === 1 ? '' : 's'} not read`] : []),
    ]
    lines.push(`${parts.join(', ')}.`)
  }
  return lines
}
