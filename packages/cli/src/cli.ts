import type { Registry } from '@polymorph/registry'

import { applyPlan } from './apply'
import { check, CheckError, checkLines, type Verify } from './check'
import { addElements, NoBuildFilesError, updateElements, type ElementsResult } from './elements'
import { checkoutHolding, initCommand, InitError, type InitPrograms } from './init'
import { readManifest } from './manifest'
import { planInstall, EscapingDirError, UnknownItemError } from './plan'
import { PatchError } from './patch'
import {
  FrameworkMismatchError,
  installFramework,
  UnknownFrameworkError,
  UnshippedMemberError,
} from './vue'
import { planHeadLines, planLines, row, writesNothing } from './readings'
import { diffInstall, updateInstall, type FileState } from './status'
import { themeCommand } from './theme'
import { runToolVerb, verbHelp } from './tool-verbs'
import {
  synopsis,
  VERB_GROUPS,
  verbNamed,
  VERBS,
  type ServerStarter,
  type ToolCaller,
} from './verbs'

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
 *
 * The verbs that ask the MCP tools (`card`, `validate`, `render` and the
 * rest) are in `tool-verbs.ts`, and every verb is listed as data in
 * `verbs.ts`. This package cannot load the tools: `@polymorph/mcp` depends on
 * it. So the entry point supplies them (`tools`), and the server for `mcp`
 * (`serve`), as it supplies the registry.
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
  /**
   * Calls one MCP tool by name in this process, with the project at `root`:
   * `toolCaller` from `@polymorph/mcp`. Every verb that asks a tool calls it,
   * and refuses with one line when the entry point did not supply it.
   */
  tools?: ToolCaller
  /** Starts the MCP server over stdio, for `polymorph mcp`: `serveStdio` from `@polymorph/mcp`. */
  serve?: ServerStarter
  /**
   * Where a verb writes what is not its answer when its answer is the whole of
   * stdout: the report of `fix --dry-run`, whose stdout is the fixed code, and
   * a refusal of `mcp`, whose stdout is the protocol. The entry point passes
   * stderr. Without it, those lines go to `out`.
   */
  err?: (line: string) => void
  /** Reads all of stdin, for a verb given `-`. Without it, this process's stdin is read. */
  input?: () => Promise<string>
}

export interface Outcome {
  code: number
}

/** The verbs, each group under its name, with the usage up to the first flag. */
function verbList(): string {
  const width = Math.max(...VERBS.map((verb) => synopsis(verb).length))
  return VERB_GROUPS.map((group) =>
    [
      `${group.charAt(0).toUpperCase()}${group.slice(1)}`,
      ...VERBS.filter((verb) => verb.group === group).map(
        (verb) => `  ${synopsis(verb).padEnd(width)}  ${verb.summary}`,
      ),
    ].join('\n'),
  ).join('\n\n')
}

const USAGE = `polymorph — the vocabulary, its red rules and its agent tools, in your repository

${verbList()}

\`polymorph <verb> --help\` prints a verb's flags. A verb that asks the MCP
tools gives the answer the tool of the same job gives: \`--json\` prints that
answer as JSON and nothing else, and without it the verb prints a plain
reading. Exit codes: 0 when the answer is clean, 1 when it reports violations,
faults or a refusal, 2 when the command line cannot be read.

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
`

/** Whether a command line asks for help. A verb's own `--help` prints its usage and flags. */
const HELP = new Set(['--help', '-h'])

/**
 * The entry point: every command. `check` and the verbs that ask the tools are
 * asynchronous, because Stylelint's API and the tools are, so they are
 * answered here; every other command is `run`'s.
 *
 * `verify` is `@polymorph/rules/verify`'s, loaded only when `check` runs, so
 * the other commands never load ESLint or Stylelint. A caller may pass its own.
 */
export async function main(cli: Cli, argv: string[], verify?: Verify): Promise<Outcome> {
  const { flags, rest } = parse(argv)
  const [command, ...items] = rest
  const verb = verbNamed(command, items[0])
  if (verb !== undefined && argv.some((argument) => HELP.has(argument))) {
    cli.out(verbHelp(verb))
    return { code: 0 }
  }
  if (verb !== undefined && verb.needs !== null) return runToolVerb(cli, verb, argv)
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
      case 'card':
      case 'search':
      case 'component':
      case 'axes':
      case 'plan':
      case 'validate':
      case 'fix':
      case 'emit':
      case 'render':
      case 'mcp':
        // The tools answer asynchronously and this function is not; `main` runs them.
        cli.out(`polymorph ${command} runs through \`main\`, which waits for the tools`)
        return { code: 1 }
      case undefined:
      case 'help':
      case '--help':
      case '-h':
        cli.out(USAGE)
        return { code: command === undefined ? 1 : 0 }
      default:
        cli.out(`polymorph: no such command "${command}"\n\n${USAGE}`)
        return { code: 2 }
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

  // A dry run prints what `polymorph plan` prints for the same items.
  if (flags.dryRun || writesNothing(plan)) {
    for (const line of planLines(plan)) cli.out(line)
    return { code: 0 }
  }
  for (const line of planHeadLines(plan)) cli.out(line)

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
    for (const line of planLines(plan)) cli.out(line)
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
