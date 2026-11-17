import type { Registry } from '@polymorph/registry'

import { applyPlan } from './apply'
import { check, CheckError, checkLines, type Verify } from './check'
import { addElements, NoBuildFilesError, updateElements, type ElementsResult } from './elements'
import { checkoutHolding, DEFAULT_SYSTEM, initCommand, InitError, type InitPrograms } from './init'
import { readManifest } from './manifest'
import { planInstall, EscapingDirError, UnknownItemError, DEFAULT_DIR, ELEMENTS_DIR } from './plan'
import { PatchError } from './patch'
import {
  FrameworkMismatchError,
  installFramework,
  UnknownFrameworkError,
  UnshippedMemberError,
} from './vue'
import { diffInstall, updateInstall, type FileState } from './status'
import { themeCommand } from './theme'

/**
 * `polymorph`, the command surface.
 *
 * A thin front over the registry. It turns what the registry says into files
 * on disk and lines on a terminal, and computes nothing the registry does not
 * already know. `thin-front.test.ts` enforces this: the package may not open
 * the vocabulary, read `design/`, or link the TypeScript compiler.
 *
 * Arguments are parsed by hand on purpose. The grammar is a few verbs and a
 * few flags. A parser library would be more code than the grammar it parses, and
 * every new dependency has to justify itself.
 */

export interface Cli {
  /** Where the consumer's repository is. */
  root: string
  /** Where this repository is. It is the source an install copies from. */
  source: string
  registry: Registry
  out: (line: string) => void
  /**
   * The checkout's MCP server and screen emitter, which `init` wires a new app
   * to. The entry point resolves them, as it resolves `source`. Only `init`
   * reads them.
   */
  programs?: InitPrograms
}

export interface Outcome {
  code: number
}

const USAGE = `polymorph — install the vocabulary into your repository

  polymorph init <dir>        a new app: packages, theme, rules, agent tools, a first screen
  polymorph add <item...>     vendor components and themes, and travel the rules
  polymorph diff              what you have changed, and what we have
  polymorph update            re-vendor what you have not touched
  polymorph theme <verb>      bring your own system — validate, emit, schema
  polymorph check [dir]       run the red rules over a directory, with no config

Items are component names (\`button\`, \`date-picker\`), the exception
ladder's primitives (\`bespoke\`, \`third-party\`, \`density-scope\`,
\`tone-scope\`), themes (\`theme:pastel\` — a system, the palette it declares,
and its fonts) or a palette on its own (\`palette:orchid\`), which any
installed system can wear.

\`polymorph theme\` takes your own two JSON documents by path instead — the
same engine, the same laws, no catalogue: \`validate\` is the report,
\`emit\` the sheet (--out file.css), \`schema\` the editor contract.

\`polymorph check\` reads every .ts, .tsx, .vue, .svelte, .html and .css file
below the directory (default: here) as application code, outside the vendored
directory, and prints each violation with the rungs that answer it. It exits 1
on any violation and writes nothing.

\`polymorph init\` writes a new app into an empty directory: the packages as
npm aliases, an \`.npmrc\`, the Vite theme plugin with a catalogue system,
the red rules, an MCP config, a system card and a first screen. Then it runs
\`pnpm install\` with a token from NODE_AUTH_TOKEN or \`gh auth token\`.
With \`--framework elements\` it writes a page with no build instead: the
files the page loads the elements from, copied into its static directory, a
theme sheet, an example page, an MCP config and a system card. \`add\`
installs no element by name, because the page loads every one;
\`add theme:<system>\` writes the theme sheet again, and \`update\` copies
the files again.

  --dir <path>       where vendored source lands (default ${DEFAULT_DIR}); for
                     elements, the static directory \`init\` writes the page in
                     (default ${ELEMENTS_DIR.split('/')[0]}), the files going in its polymorph/
  --out <path>       where \`theme emit\`/\`theme schema\` write
  --system <name>    the system \`init\` themes the app with (default ${DEFAULT_SYSTEM})
  --framework <name> \`react\` (default), \`vue\`, \`svelte\`, \`solid\`, \`angular\` or
                     \`elements\`: the app \`init\` writes, the members \`add\` vendors
                     (that framework's components); \`add\` reads it from polymorph.json
                     once an install has one; \`check\` reads every file in it instead
                     of inferring
  --json             \`check\` prints its report as JSON
  --no-install       \`init\` writes the app and does not run \`pnpm install\`
  --force            overwrite files you have edited
  --dry-run          print the plan, write nothing
`

/**
 * The entry point: every command. `check` is asynchronous, because Stylelint's
 * API is, so it is answered here; every other command is `run`'s.
 *
 * `verify` is `@polymorph/rules/verify`'s, loaded only when `check` runs, so
 * the other commands never load ESLint or Stylelint. A caller may pass its own.
 */
export async function main(cli: Cli, argv: string[], verify?: Verify): Promise<Outcome> {
  const { flags, rest } = parse(argv)
  const [command, ...items] = rest
  if (command !== 'check') return run(cli, argv)

  try {
    return await checkCommand(cli, items, flags, verify)
  } catch (error) {
    if (
      error instanceof CheckError ||
      error instanceof EscapingDirError ||
      error instanceof UnknownFrameworkError
    ) {
      cli.out(error.message)
      return { code: 1 }
    }
    throw error
  }
}

export function run(cli: Cli, argv: string[]): Outcome {
  const { flags, rest } = parse(argv)
  const [command, ...items] = rest

  try {
    switch (command) {
      case 'init':
        return initCommand(cli, items, flags)
      case 'add':
        return add(cli, items, flags)
      case 'diff':
        return diff(cli)
      case 'update':
        return update(cli, flags)
      case 'theme':
        return themeCommand(cli, items, flags)
      case 'check':
        // Linting is asynchronous and this function is not; `main` runs it.
        cli.out('polymorph check runs through `main`, which waits for the linters')
        return { code: 1 }
      case undefined:
      case 'help':
      case '--help':
      case '-h':
        cli.out(USAGE)
        return { code: command === undefined ? 1 : 0 }
      default:
        cli.out(`polymorph: no such command "${command}"\n\n${USAGE}`)
        return { code: 1 }
    }
  } catch (error) {
    if (
      error instanceof UnknownItemError ||
      error instanceof EscapingDirError ||
      error instanceof PatchError ||
      error instanceof InitError ||
      error instanceof UnshippedMemberError ||
      error instanceof FrameworkMismatchError ||
      error instanceof UnknownFrameworkError ||
      error instanceof NoBuildFilesError
    ) {
      cli.out(error.message)
      return { code: 1 }
    }
    throw error
  }
}

interface Flags {
  dir?: string
  out?: string
  system?: string
  framework?: string
  install: boolean
  force: boolean
  dryRun: boolean
  json: boolean
}

/** One aligned row. Every label pads to the width of the widest one, `kept yours`. */
const row = (label: string, value: string) => `  ${label.padEnd(11)}${value}`

function parse(argv: string[]): { flags: Flags; rest: string[] } {
  const flags: Flags = { install: true, force: false, dryRun: false, json: false }
  const rest: string[] = []

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] as string
    if (argument === '--force') flags.force = true
    else if (argument === '--json') flags.json = true
    else if (argument === '--dry-run') flags.dryRun = true
    else if (argument === '--no-install') flags.install = false
    else if (argument === '--framework') {
      index += 1
      flags.framework = argv[index]
    } else if (argument === '--system') {
      index += 1
      flags.system = argv[index]
    } else if (argument === '--dir') {
      index += 1
      flags.dir = argv[index]
    } else if (argument === '--out') {
      index += 1
      flags.out = argv[index]
    } else rest.push(argument)
  }

  return { flags, rest }
}

/* -------------------------------------------------------------------------- */
/* Where an install may be written                                            */
/* -------------------------------------------------------------------------- */

/**
 * Why `add` or `update` may not write into the directory it runs in, or `null`.
 *
 * Both install into the current directory. In a checkout of polymorph, or a
 * directory inside one such as `apps/workbench`, they would vendor the
 * vocabulary into its own source and splice the consumer's lint config into
 * the repository's own. A checkout is recognised by `checkoutHolding`, as
 * `init` and the MCP tool `install` recognise one.
 */
function refuseCheckout(cli: Cli, command: 'add' | 'update'): string | null {
  const checkout = checkoutHolding(cli.root, cli.source, cli.registry)
  if (checkout === null) return null
  return (
    `polymorph ${command}: ${cli.root} is in a checkout of polymorph (${checkout}), and ` +
    `${command} would vendor the vocabulary into its own source — run it in the repository ` +
    'that consumes polymorph, pointing at this checkout: ' +
    `node ../polymorph/packages/cli/bin/polymorph.js ${command} …`
  )
}

/* -------------------------------------------------------------------------- */
/* add                                                                        */
/* -------------------------------------------------------------------------- */

function add(cli: Cli, items: string[], flags: Flags): Outcome {
  if (items.length === 0) {
    cli.out('polymorph add: name at least one component, primitive, theme or palette\n\n' + USAGE)
    return { code: 1 }
  }
  // A dry run writes nothing, so it may show a plan anywhere, this checkout included.
  const refusal = flags.dryRun ? null : refuseCheckout(cli, 'add')
  if (refusal !== null) {
    cli.out(refusal)
    return { code: 1 }
  }

  // An install stays in the framework its manifest records: a theme added to a
  // Vue install keeps the Vue lint config, and a member added to it is a Vue one.
  // The same holds for Svelte, Solid and Angular.
  const manifest = readManifest(cli.root)
  const framework = installFramework(manifest === null ? null : manifest.framework, flags.framework)
  if (framework === 'elements') return addToPage(cli, items, flags)
  const plan = planInstall(cli.registry, items, {
    ...(flags.dir ? { dir: flags.dir } : {}),
    ...(framework === 'react' ? {} : { framework }),
  })
  const themeFiles = plan.systems.length + plan.palettes.length

  if (plan.files.length === 0 && themeFiles === 0) {
    for (const note of plan.notes) cli.out(`  · ${note}`)
    return { code: 0 }
  }

  const dragged = plan.components.filter((name) => !plan.requested.includes(name))
  // Palettes that a system declares, as opposed to palettes the user named.
  // This is the same rule as `came along` for components.
  const declared = new Set(plan.systems.map((system) => system.defaultPalette))

  cli.out(`polymorph ${plan.version} → ${plan.dir}`)
  if (plan.requested.length > 0) cli.out(row('components', plan.requested.join(', ')))
  // Components pulled in as dependencies are always listed by name. An install
  // that adds components silently would surprise the consumer later.
  if (dragged.length > 0) cli.out(row('came along', dragged.join(', ')))
  for (const system of plan.systems) {
    const fonts = system.fonts.map((font) => font.family).join(', ')
    cli.out(row('system', `${system.name} + ${system.defaultPalette} (${fonts})`))
  }
  for (const palette of plan.palettes.filter((entry) => !declared.has(entry.name))) {
    cli.out(row('palette', palette.name))
  }
  cli.out(row('files', String(plan.files.length + themeFiles)))

  if (flags.dryRun) {
    for (const file of plan.files) cli.out(`    ${file.to}`)
    for (const entry of [...plan.systems, ...plan.palettes]) cli.out(`    ${entry.file.to}`)
    cli.out(row('packages', Object.keys(plan.packages).join(', ')))
    if (Object.keys(plan.devPackages).length > 0) {
      cli.out(row('dev', Object.keys(plan.devPackages).join(', ')))
    }
    return { code: 0 }
  }

  const result = applyPlan(cli.root, cli.source, cli.registry, plan, { force: flags.force })

  cli.out('')
  cli.out(row('wrote', `${result.written.length} files`))
  if (result.patched.length > 0) cli.out(row('extended', result.patched.join(', ')))
  for (const path of result.skipped) cli.out(row('kept yours', path))
  for (const note of result.notes) cli.out(`  · ${note}`)

  cli.out('')
  cli.out('Next: install the new dependencies.')

  return { code: 0 }
}

/**
 * `add` in an elements install. A member is in the files the page loads, so
 * nothing is written for one, and the notes say why; a system or palette joins
 * the theme sheet, which is written again.
 */
function addToPage(cli: Cli, items: string[], flags: Flags): Outcome {
  if (flags.dryRun) {
    const plan = planInstall(cli.registry, items, {
      framework: 'elements',
      ...(flags.dir ? { dir: flags.dir } : {}),
    })
    for (const note of plan.notes) cli.out(`  · ${note}`)
    for (const system of plan.systems) cli.out(row('system', system.name))
    for (const palette of plan.palettes) cli.out(row('palette', palette.name))
    const sheet = [...plan.systems, ...plan.palettes][0]?.file.to
    if (sheet !== undefined) cli.out(`    ${sheet}`)
    return { code: 0 }
  }
  const result = addElements(cli.root, cli.source, cli.registry, items, {
    force: flags.force,
    ...(flags.dir ? { dir: flags.dir } : {}),
  })
  report(cli, result)
  return { code: 0 }
}

/** What an elements `add` or `update` did, in the rows the other commands print. */
function report(cli: Cli, result: ElementsResult): void {
  if (result.written.length > 0) cli.out(row('wrote', `${result.written.length} files`))
  for (const path of result.removed) cli.out(row('dropped', path))
  for (const path of result.skipped) cli.out(row('kept yours', path))
  for (const note of result.notes) cli.out(`  · ${note}`)
}

/* -------------------------------------------------------------------------- */
/* diff                                                                       */
/* -------------------------------------------------------------------------- */

const LABELS: Record<FileState, string> = {
  clean: 'unchanged',
  edited: 'yours',
  upstream: 'ours',
  diverged: 'both',
  missing: 'gone',
  removed: 'dropped',
  generated: 'generated',
}

function diff(cli: Cli): Outcome {
  const report = diffInstall(cli.root, cli.source, cli.registry)
  const interesting = report.files.filter(
    (file) => file.state !== 'clean' && file.state !== 'generated',
  )

  cli.out(
    report.installed === report.available
      ? `polymorph ${report.installed} — up to date`
      : `polymorph ${report.installed} installed, ${report.available} available`,
  )

  if (interesting.length === 0) {
    cli.out('  every vendored file is exactly as it was installed')
    return { code: 0 }
  }

  for (const file of interesting) cli.out(row(LABELS[file.state], file.path))

  const diverged = interesting.filter((file) => file.state === 'diverged')
  if (diverged.length > 0) {
    cli.out('')
    cli.out(`  ${diverged.length} file(s) changed on both sides — update will not touch them.`)
  }

  // Not an error. A diff only reports, and the consumer decides what to do.
  return { code: 0 }
}

/* -------------------------------------------------------------------------- */
/* check                                                                      */
/* -------------------------------------------------------------------------- */

async function checkCommand(
  cli: Cli,
  items: string[],
  flags: Flags,
  verify?: Verify,
): Promise<Outcome> {
  if (items.length > 1) {
    cli.out('polymorph check: name one directory or file, or none for this one\n\n' + USAGE)
    return { code: 1 }
  }
  const lint = verify ?? (await import('@polymorph/rules/verify')).verify
  const report = await check(cli.root, cli.registry, lint, {
    ...(items[0] === undefined ? {} : { dir: items[0] }),
    ...(flags.framework === undefined ? {} : { framework: flags.framework }),
  })
  if (flags.json) cli.out(JSON.stringify(report, null, 2))
  else for (const line of checkLines(cli.registry, report)) cli.out(line)
  return { code: report.ok ? 0 : 1 }
}

/* -------------------------------------------------------------------------- */
/* update                                                                     */
/* -------------------------------------------------------------------------- */

function update(cli: Cli, flags: Flags): Outcome {
  const refusal = refuseCheckout(cli, 'update')
  if (refusal !== null) {
    cli.out(refusal)
    return { code: 1 }
  }
  const before = diffInstall(cli.root, cli.source, cli.registry)
  // An elements install copies the files its page loads again, and its theme sheet.
  if (before.manifest.framework === 'elements') {
    const result = updateElements(cli.root, cli.source, cli.registry, before.manifest, flags.force)
    cli.out(`polymorph ${before.installed} → ${cli.registry.version}`)
    report(cli, result)
    if (result.written.length === 0 && result.removed.length === 0) {
      cli.out('  nothing changed upstream')
    }
    return { code: 0 }
  }
  const stale = before.files.filter(
    (file) => file.state === 'upstream' || file.state === 'missing' || file.state === 'removed',
  )
  const held = before.files.filter((file) => file.state === 'edited' || file.state === 'diverged')

  if (stale.length === 0 && before.installed === before.available && !flags.force) {
    cli.out(`polymorph ${before.installed} — nothing to update`)
    for (const file of held) cli.out(row('kept yours', file.path))
    return { code: 0 }
  }

  const result = updateInstall(cli.root, cli.source, cli.registry, { force: flags.force })

  cli.out(`polymorph ${before.installed} → ${result.manifest.version}`)
  cli.out(row('updated', `${result.written.length} files`))
  for (const path of result.removed) cli.out(row('dropped', path))
  for (const path of result.skipped) cli.out(row('kept yours', path))
  for (const note of result.notes) cli.out(`  · ${note}`)

  if (result.skipped.length > 0 && !flags.force) {
    cli.out('')
    cli.out('  Those are files you have edited. `polymorph diff` shows which side moved;')
    cli.out('  `--force` takes ours and discards yours.')
  }

  return { code: 0 }
}
