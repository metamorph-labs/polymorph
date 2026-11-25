import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

import { FRAMEWORKS, type Framework, type SearchHit } from '@polymorph/registry'

import type { Cli, Outcome } from './cli'
import type { InstallPlan } from './plan'
import {
  axesLines,
  componentLines,
  countLine,
  faultLines,
  pictureName,
  plural,
  planLines,
  proposalLines,
  renderLines,
  row,
  savedLines,
  searchLines,
  violationLines,
  type AxesReading,
  type ComponentReading,
  type Fault,
  type ProposalReading,
  type RenderReading,
  type Reported,
  type SavedReading,
} from './readings'
import { serverFlags, ServerFlagsError } from './server-flags'
import type { ToolAnswer, Verb } from './verbs'

/**
 * The verbs that ask the MCP tools, and `mcp`, which starts the server.
 *
 * Each verb reads its command line, turns its flags into the tool's
 * arguments, calls the tool through `cli.tools`, and prints the answer. The
 * tool decides everything: this module reads files a person named, writes the
 * pictures `render` is answered with, and formats. `--json` prints exactly the
 * tool's JSON answer and nothing else on stdout. Without it a verb prints a
 * plain reading (`readings.ts`).
 *
 * **Exit codes.** 0 when the answer is clean; 1 when it reports violations,
 * faults or a refusal; 2 when the command line cannot be read: a flag the verb
 * does not take, a missing argument, a file that cannot be read. A value the
 * tool's schema refuses, such as an unknown framework, is the tool's refusal,
 * and so it is 1.
 *
 * Nothing here reads `process.cwd()`. A path on the command line is resolved
 * against `cli.root`, which is also the project the tools write into.
 */

/** A command line the verb cannot read. Its message is printed, and the exit code is 2. */
class UsageError extends Error {
  constructor(
    readonly verb: Verb,
    message: string,
  ) {
    super(`polymorph ${verb.name}: ${message}`)
    this.name = 'UsageError'
  }
}

interface Arguments {
  positionals: string[]
  values: Map<string, string>
  switches: Set<string>
}

/**
 * The command line as the verb's flags read it. A flag the verb does not
 * declare is refused rather than ignored, so a mistyped flag cannot change an
 * answer unseen. `--name value` and `--name=value` both work, and `--` ends the
 * flags. The verb's own words are taken off the front of the positionals.
 */
function readArguments(verb: Verb, argv: string[]): Arguments {
  const declared = new Map(verb.flags.map((flag) => [flag.name, flag]))
  const positionals: string[] = []
  const values = new Map<string, string>()
  const switches = new Set<string>()
  let flagsEnded = false

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] as string
    if (flagsEnded || argument === '-' || !argument.startsWith('-')) {
      positionals.push(argument)
      continue
    }
    if (argument === '--') {
      flagsEnded = true
      continue
    }
    const equals = argument.indexOf('=')
    const written = equals < 0 ? argument : argument.slice(0, equals)
    const inline = equals < 0 ? undefined : argument.slice(equals + 1)
    const flag = written.startsWith('--') ? declared.get(written.slice(2)) : undefined
    if (flag === undefined) throw new UsageError(verb, `it takes no flag "${written}"`)
    if (flag.value === undefined) {
      if (inline !== undefined) throw new UsageError(verb, `\`${written}\` takes no value`)
      switches.add(flag.name)
      continue
    }
    const value = inline ?? argv[index + 1]
    if (inline === undefined) index += 1
    if (value === undefined || value === '' || (inline === undefined && value.startsWith('--'))) {
      throw new UsageError(verb, `\`${written}\` needs a value: \`${written} <${flag.value}>\``)
    }
    values.set(flag.name, value)
  }

  for (const word of verb.name.split(' ')) {
    if (positionals[0] !== word) throw new UsageError(verb, `the command is \`${verb.usage}\``)
    positionals.shift()
  }
  return { positionals, values, switches }
}

/**
 * Runs a verb that asks the tools, or `mcp`. `argv` is the whole command line,
 * the verb's own words included.
 */
export async function runToolVerb(cli: Cli, verb: Verb, argv: string[]): Promise<Outcome> {
  const json = verb.needs === 'tools' && argv.includes('--json')
  try {
    if (verb.needs === 'server') return await serve(cli, verb, argv)
    const args = readArguments(verb, argv)
    if (cli.tools === undefined) {
      say(
        cli,
        json,
        `polymorph ${verb.name} asks the MCP tools, and this entry point supplied none`,
      )
      return { code: 1 }
    }
    const asked = { cli, args, json, ask: cli.tools }
    switch (verb.name) {
      case 'card':
        return await card(asked)
      case 'search':
        return await search(verb, asked)
      case 'component':
        return await component(verb, asked)
      case 'axes':
        return await axes(asked)
      case 'plan':
        return await plan(verb, asked)
      case 'validate':
        return await validate(verb, asked)
      case 'fix':
        return await fix(verb, asked)
      case 'emit':
        return await emit(verb, asked)
      case 'render':
        return await render(verb, asked)
      case 'theme propose':
        return await propose(verb, asked)
      default:
        throw new Error(`polymorph: ${verb.name} names the tools and has no runner`)
    }
  } catch (error) {
    if (!(error instanceof UsageError)) throw error
    const message = `${error.message}\n\nusage: ${verb.usage}`
    if (verb.needs === 'server') (cli.err ?? cli.out)(message)
    else say(cli, json, message)
    return { code: 2 }
  }
}

/** A message on stdout: as `{ "error": … }` under `--json`, so stdout stays JSON. */
function say(cli: Cli, json: boolean, message: string): void {
  cli.out(json ? JSON.stringify({ error: message }, null, 2) : message)
}

interface Asked {
  cli: Cli
  args: Arguments
  json: boolean
  ask: NonNullable<Cli['tools']>
}

/** Prints a tool's refusal, and the outcome it is. */
function refused({ cli, json }: Asked, answer: ToolAnswer): Outcome {
  say(cli, json, String(answer.value))
  return { code: 1 }
}

const printJson = (cli: Cli, value: unknown) => cli.out(JSON.stringify(value, null, 2))

/** The flags that pass to the tool under the same name, when they were given. */
function passed(args: Arguments, ...names: string[]): Record<string, string> {
  return Object.fromEntries(
    names.flatMap((name) => {
      const value = args.values.get(name)
      return value === undefined ? [] : [[name, value]]
    }),
  )
}

/* -------------------------------------------------------------------------- */
/* Reading what a person named                                                */
/* -------------------------------------------------------------------------- */

/** A path as the project sees it: relative to the root, with forward slashes. */
const fromRoot = (cli: Cli, path: string): string =>
  relative(cli.root, resolve(cli.root, path)).split(sep).join('/')

/** Whether a root-relative path leaves the root. */
const leaves = (path: string): boolean =>
  path === '..' || path.startsWith('../') || isAbsolute(path)

/** The text of a file named on the command line, or a usage error that says why there is none. */
function readNamed(verb: Verb, cli: Cli, path: string, directory?: string): string {
  const full = resolve(cli.root, path)
  if (!existsSync(full)) throw new UsageError(verb, `there is no file ${path}`)
  if (statSync(full).isDirectory()) {
    throw new UsageError(verb, directory ?? `${path} is a directory; name a file`)
  }
  return readFileSync(full, 'utf8')
}

/** All of stdin, from the entry point's reader or from this process's. */
async function standardInput(cli: Cli): Promise<string> {
  if (cli.input !== undefined) return cli.input()
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk as Uint8Array))
  return Buffer.concat(chunks).toString('utf8')
}

/** Code or a spec to submit: its text, the name it is checked as, and the name it is shown as. */
interface Submission {
  text: string
  /** The name the tool is given. Absent for stdin with no `--filename`, so the tool reads the text. */
  sent?: string
  shown: string
}

/**
 * What `validate` and `fix --dry-run` send: a file's text under its path in
 * the project, or stdin's under `--filename`. A file outside the project is
 * sent under its own name, so the rules read it as a file at the project's
 * root rather than as a path they match no pattern for.
 */
async function submission(
  verb: Verb,
  cli: Cli,
  input: string,
  filename: string | undefined,
): Promise<Submission> {
  if (input === '-') {
    const text = await standardInput(cli)
    return { text, ...(filename === undefined ? {} : { sent: filename }), shown: filename ?? '-' }
  }
  const text = readNamed(
    verb,
    cli,
    input,
    `${input} is a directory — \`polymorph check ${input}\` runs the red rules over a directory`,
  )
  const path = fromRoot(cli, input)
  return leaves(path)
    ? { text, sent: basename(input), shown: input }
    : { text, sent: path, shown: path }
}

/** A JSON file named by a flag, parsed. */
function readJson(verb: Verb, cli: Cli, flag: string, path: string): unknown {
  const text = readNamed(verb, cli, path)
  try {
    return JSON.parse(text) as unknown
  } catch (error) {
    throw new UsageError(verb, `\`--${flag}\` ${path} is not JSON: ${(error as Error).message}`)
  }
}

/* -------------------------------------------------------------------------- */
/* Looking up                                                                 */
/* -------------------------------------------------------------------------- */

async function card(asked: Asked): Promise<Outcome> {
  const { cli, args, json, ask } = asked
  const answer = await ask('get_system_card', passed(args, 'framework', 'platform'))
  if (answer.isError) return refused(asked, answer)
  if (json) printJson(cli, answer.value)
  else cli.out(String(answer.value))
  return { code: 0 }
}

async function search(verb: Verb, asked: Asked): Promise<Outcome> {
  const { cli, args, json, ask } = asked
  const query = args.positionals.length === 0 ? undefined : args.positionals.join(' ')
  const limit = args.values.get('limit')
  if (limit !== undefined && !/^\d+$/.test(limit)) {
    throw new UsageError(verb, `\`--limit\` is a count of hits, and "${limit}" is not one`)
  }
  const answer = await ask('search_components', {
    ...(query === undefined ? {} : { query }),
    ...passed(args, 'tier', 'origin', 'framework', 'platform'),
    ...(limit === undefined ? {} : { limit: Number(limit) }),
  })
  if (answer.isError) return refused(asked, answer)
  if (json) printJson(cli, answer.value)
  else for (const line of searchLines(answer.value as SearchHit[], query)) cli.out(line)
  return { code: 0 }
}

async function component(verb: Verb, asked: Asked): Promise<Outcome> {
  const { cli, args, json, ask } = asked
  if (args.positionals.length !== 1) throw new UsageError(verb, 'name one member')
  const framework = args.values.get('framework')
  // The tool answers for every framework, and the flag narrows the reading, so
  // the verb checks the name. It answers an unknown one as `card` does, where
  // the tool refuses it: a refusal, with exit code 1.
  if (framework !== undefined && !(FRAMEWORKS as readonly string[]).includes(framework)) {
    say(
      asked.cli,
      asked.json,
      `polymorph ${verb.name}: there is no framework called "${framework}" — the frameworks ` +
        `are ${FRAMEWORKS.join(', ')}`,
    )
    return { code: 1 }
  }
  const answer = await ask('get_component', {
    name: args.positionals[0],
    ...(args.switches.has('source') ? { source: true } : {}),
  })
  if (answer.isError) return refused(asked, answer)
  if (json) printJson(cli, answer.value)
  else {
    const lines = componentLines(answer.value as ComponentReading, framework as Framework)
    for (const line of lines) cli.out(line)
  }
  return { code: 0 }
}

async function axes(asked: Asked): Promise<Outcome> {
  const { cli, args, json, ask } = asked
  const answer = await ask('get_theme_axes', {
    ...(args.switches.has('properties') ? { customProperties: true } : {}),
    ...(args.switches.has('values') ? { tokenValues: true } : {}),
  })
  if (answer.isError) return refused(asked, answer)
  if (json) printJson(cli, answer.value)
  else for (const line of axesLines(answer.value as AxesReading)) cli.out(line)
  return { code: 0 }
}

async function plan(verb: Verb, asked: Asked): Promise<Outcome> {
  const { cli, args, json, ask } = asked
  if (args.positionals.length === 0) {
    throw new UsageError(verb, 'name at least one component, primitive, theme or palette')
  }
  const answer = await ask('get_install_plan', {
    items: args.positionals,
    ...passed(args, 'dir', 'framework'),
  })
  if (answer.isError) return refused(asked, answer)
  if (json) printJson(cli, answer.value)
  else for (const line of planLines(answer.value as InstallPlan)) cli.out(line)
  return { code: 0 }
}

/* -------------------------------------------------------------------------- */
/* Checking                                                                   */
/* -------------------------------------------------------------------------- */

interface ValidateReading {
  ok: boolean
  kind: 'code' | 'spec'
  violations?: Reported[]
  faults?: Fault[]
  fatal: string | null
}

/** Whether a submission is a `.json` file, which `validate` reads as a screen spec. */
const isSpec = (submission: Submission): boolean => submission.sent?.endsWith('.json') === true

/**
 * Refuses a `.json` file that is some other document: a `package.json`, a
 * theme, a data file. A spec's document is an object with a `spec` field or a
 * `root`, and the spec check explains one that has either and is still wrong.
 * Text that is not JSON is sent on, because the spec check says where it stops
 * parsing. Any other document would be answered with the faults of a spec it
 * never was, and a list of files that held one would fail for no fault of its
 * screens.
 */
function refuseOtherDocument(verb: Verb, submitted: Submission): void {
  let document: unknown
  try {
    document = JSON.parse(submitted.text)
  } catch {
    return
  }
  const fields =
    typeof document === 'object' && document !== null && !Array.isArray(document)
      ? Object.keys(document)
      : []
  if (fields.includes('spec') || fields.includes('root')) return
  throw new UsageError(
    verb,
    `${submitted.shown} is not a screen spec: a spec is a document with a \`spec\` field ` +
      'and a `root`. `validate` reads code files and screen specs',
  )
}

async function validate(verb: Verb, asked: Asked): Promise<Outcome> {
  const { cli, args, json, ask } = asked
  const inputs = args.positionals
  if (inputs.length === 0) throw new UsageError(verb, 'name a file, or `-` for stdin')
  const filename = args.values.get('filename')
  if (inputs.filter((input) => input === '-').length > 1) {
    throw new UsageError(verb, 'stdin is read once, so `-` may be named once')
  }
  if (filename !== undefined && !inputs.includes('-')) {
    throw new UsageError(verb, '`--filename` names the text read from stdin (`-`)')
  }

  // Every file is read before any is sent, so a name that is wrong stops the
  // command before it prints an answer.
  const submissions: Submission[] = []
  for (const input of inputs) submissions.push(await submission(verb, cli, input, filename))
  for (const submitted of submissions) if (isSpec(submitted)) refuseOtherDocument(verb, submitted)

  const answers: { submission: Submission; answer: ToolAnswer }[] = []
  for (const submitted of submissions) {
    const toolArgs = isSpec(submitted)
      ? { spec: submitted.text, ...passed(args, 'framework') }
      : {
          code: submitted.text,
          ...(submitted.sent === undefined ? {} : { filename: submitted.sent }),
          ...passed(args, 'surface', 'framework'),
        }
    answers.push({ submission: submitted, answer: await ask('validate', toolArgs) })
  }

  const clean = answers.every(
    ({ answer }) => !answer.isError && (answer.value as ValidateReading).ok,
  )
  if (json) {
    const values = answers.map(({ answer }) =>
      answer.isError ? { error: answer.value } : answer.value,
    )
    printJson(cli, values.length === 1 ? values[0] : values)
    return { code: clean ? 0 : 1 }
  }

  const counts = { violations: 0, faults: 0, unread: 0 }
  for (const { submission: submitted, answer } of answers) {
    if (answer.isError) {
      cli.out(`${submitted.shown}  ${String(answer.value)}`)
      counts.unread += 1
      continue
    }
    const value = answer.value as ValidateReading
    if (value.fatal !== null) {
      cli.out(`${submitted.shown}  not read: ${value.fatal}`)
      counts.unread += 1
    }
    for (const line of violationLines(submitted.shown, value.violations ?? [])) cli.out(line)
    for (const line of faultLines(submitted.shown, value.faults ?? [])) cli.out(line)
    counts.violations += value.violations?.length ?? 0
    counts.faults += value.faults?.length ?? 0
  }
  cli.out(countLine(counts))
  return { code: clean ? 0 : 1 }
}

async function render(verb: Verb, asked: Asked): Promise<Outcome> {
  const { cli, args, json, ask } = asked
  if (args.positionals.length !== 1) throw new UsageError(verb, 'name one screen spec')
  const [specPath] = args.positionals as [string]
  const system = args.values.get('system')
  if (system === undefined) {
    throw new UsageError(verb, 'name the system to draw it in with `--system <name>`')
  }
  const spec = readNamed(verb, cli, specPath)
  const data = args.values.get('data')
  const empty = args.values.get('empty')
  const viewports = args.values.get('viewports')

  const answer = await ask('render_screen', {
    spec,
    system,
    ...passed(args, 'palette', 'mode'),
    ...(data === undefined ? {} : { data: readJson(verb, cli, 'data', data) }),
    ...(empty === undefined ? {} : { empty: readJson(verb, cli, 'empty', empty) }),
    ...(viewports === undefined
      ? {}
      : { viewports: viewports.split(',').map((viewport) => viewport.trim()) }),
  })
  if (answer.isError) return refused(asked, answer)
  const value = answer.value as RenderReading

  // The pictures are written whatever is printed. Each is named for its state
  // and its width, so a reader of the JSON answer knows where each one is.
  const out = resolve(cli.root, args.values.get('out') ?? renderDirectory(specPath))
  const written = new Map<string, string>()
  for (const state of value.states ?? []) {
    for (const view of state.views) {
      const image = answer.images[view.image - 1]
      if (image === undefined) continue
      const file = resolve(out, pictureName(state.state, view.viewport))
      mkdirSync(out, { recursive: true })
      writeFileSync(file, image.data)
      written.set(`${state.state} ${view.viewport}`, fromRoot(cli, file))
    }
  }

  if (json) {
    printJson(cli, value)
    return { code: value.ok ? 0 : 1 }
  }
  const shown = fromRoot(cli, specPath)
  const lines = renderLines(
    shown,
    value,
    (state, viewport) => written.get(`${state} ${viewport}`) ?? '',
  )
  for (const line of lines) cli.out(line)
  const found =
    (value.specFaults?.length ?? 0) +
    (value.errors?.length ?? 0) +
    (value.states ?? []).reduce(
      (sum, state) =>
        sum + state.views.reduce((all, view) => all + view.faults.length + view.failed.length, 0),
      0,
    )
  if (value.fatal === null)
    cli.out(found === 0 ? 'No layout faults.' : `${plural(found, 'fault')}.`)
  return { code: value.ok ? 0 : 1 }
}

/**
 * Where `render` writes its pictures when `--out` is not given: beside the
 * spec, in a directory named for it with `.render` (`inbox.json` →
 * `inbox.render/`). The red rules and `polymorph check` read source files and
 * stylesheets, never a PNG.
 */
export const renderDirectory = (spec: string): string =>
  join(dirname(spec), `${basename(spec).replace(/\.json$/, '')}.render`)

/* -------------------------------------------------------------------------- */
/* Writing                                                                    */
/* -------------------------------------------------------------------------- */

interface FixReading {
  ok: boolean
  changed: boolean
  code?: string
  fixed: Record<string, number>
  violations: Reported[]
  fatal: string | null
  notes?: string[]
}

/** What a fix did to a file: rewritten, by which rules' fixes, or left as it was. */
function fixedLine(name: string, value: FixReading, done: string): string {
  const rules = Object.entries(value.fixed).map(([rule, count]) => `${rule} ×${count}`)
  return value.changed ? `${name}  ${done}: ${rules.join(', ')}` : `${name}  nothing to fix`
}

/** A fix's report: what it did, what it could not do, and how many are left. */
function fixReport(name: string, value: FixReading, done: string): string[] {
  const lines = [fixedLine(name, value, done)]
  if (value.fatal !== null) lines.push(`${name}  not read: ${value.fatal}`)
  lines.push(...violationLines(name, value.violations))
  for (const note of value.notes ?? []) lines.push(`  · ${note}`)
  lines.push(
    countLine({
      violations: value.violations.length,
      faults: 0,
      unread: value.fatal === null ? 0 : 1,
    }),
  )
  return lines
}

async function fix(verb: Verb, asked: Asked): Promise<Outcome> {
  const { cli, args, json, ask } = asked
  if (args.positionals.length !== 1) throw new UsageError(verb, 'name one file, or `-` for stdin')
  const [input] = args.positionals as [string]
  const filename = args.values.get('filename')
  if (filename !== undefined && input !== '-') {
    throw new UsageError(verb, '`--filename` names the text read from stdin (`-`)')
  }
  const options = passed(args, 'surface', 'framework')

  // A file is fixed where it stands. With `--dry-run`, or from stdin, the
  // code is sent and the fixed code comes back, and nothing is written.
  if (input !== '-' && !args.switches.has('dry-run')) {
    readNamed(verb, cli, input)
    const path = fromRoot(cli, input)
    const answer = await ask('fix_file', { path, ...options })
    if (answer.isError) return refused(asked, answer)
    const value = answer.value as FixReading
    if (json) printJson(cli, value)
    else for (const line of fixReport(path, value, 'rewritten')) cli.out(line)
    return { code: value.ok ? 0 : 1 }
  }

  const submitted = await submission(verb, cli, input, filename)
  const answer = await ask('fix', {
    code: submitted.text,
    ...(submitted.sent === undefined ? {} : { filename: submitted.sent }),
    ...options,
  })
  if (answer.isError) return refused(asked, answer)
  const value = answer.value as FixReading
  if (json) {
    printJson(cli, value)
    return { code: value.ok ? 0 : 1 }
  }
  // The fixed code is the whole of stdout, so it can be piped into a file;
  // what the fix did and what it left go to stderr.
  const code = value.code ?? submitted.text
  cli.out(code.endsWith('\n') ? code.slice(0, -1) : code)
  for (const line of fixReport(submitted.shown, value, 'fixed')) (cli.err ?? cli.out)(line)
  return { code: value.ok ? 0 : 1 }
}

interface EmitReading {
  ok: boolean
  faults: Fault[]
  violations?: Reported[]
  fatal: string | null
  path?: string
  component?: string
  language?: string
  outcome?: string
  notes?: string[]
  next?: string
}

async function emit(verb: Verb, asked: Asked): Promise<Outcome> {
  const { cli, args, json, ask } = asked
  if (args.positionals.length !== 2) {
    throw new UsageError(verb, 'name the spec and the file to write: `emit <spec.json> <out>`')
  }
  const [specPath, out] = args.positionals as [string, string]
  const spec = readNamed(verb, cli, specPath)
  const path = fromRoot(cli, out)
  const answer = await ask('emit_screen', { spec, path, ...passed(args, 'framework') })
  if (answer.isError) return refused(asked, answer)
  const value = answer.value as EmitReading
  if (json) {
    printJson(cli, value)
    return { code: value.ok ? 0 : 1 }
  }

  const shown = fromRoot(cli, specPath)
  if (value.ok) {
    cli.out(
      row(
        value.outcome ?? 'written',
        `${value.path ?? path} (${value.component}, ${value.language})`,
      ),
    )
    for (const note of value.notes ?? []) cli.out(`  · ${note}`)
    if (value.next !== undefined) cli.out(value.next)
    return { code: 0 }
  }
  if (value.fatal !== null) cli.out(`${shown}  not written: ${value.fatal}`)
  for (const line of faultLines(shown, value.faults)) cli.out(line)
  for (const line of violationLines(path, value.violations ?? [])) cli.out(line)
  cli.out(
    countLine({
      violations: value.violations?.length ?? 0,
      faults: value.faults.length,
      unread: 0,
    }),
  )
  return { code: 1 }
}

/* -------------------------------------------------------------------------- */
/* Themes                                                                     */
/* -------------------------------------------------------------------------- */

/** `system/palette`, `system` or `/palette`: where a proposal starts. */
function basedOn(written: string): { system?: string; palette?: string } {
  const [system, palette] = written.split('/', 2)
  return {
    ...(system ? { system } : {}),
    ...(palette ? { palette } : {}),
  }
}

async function propose(verb: Verb, asked: Asked): Promise<Outcome> {
  const { cli, args, json, ask } = asked
  const intent = args.positionals.join(' ').trim()
  if (intent === '') throw new UsageError(verb, 'say what the theme should be, in plain words')
  const save = args.switches.has('save')
  if (!save && (args.values.has('dir') || args.switches.has('overwrite'))) {
    throw new UsageError(verb, '`--dir` and `--overwrite` say where `--save` writes')
  }
  const start = args.values.get('based-on')

  const proposal = await ask('propose_theme', {
    intent,
    ...(start === undefined ? {} : { basedOn: basedOn(start) }),
  })
  if (proposal.isError) return refused(asked, proposal)
  const proposed = proposal.value as ProposalReading

  if (!save) {
    if (json) printJson(cli, proposed)
    else {
      for (const line of proposalLines(proposed)) cli.out(line)
      cli.out('`--save` writes the two documents into the project; `--json` prints them.')
    }
    return { code: proposed.lawful ? 0 : 1 }
  }

  const saving = await ask('save_theme', {
    system: proposed.system,
    palette: proposed.palette,
    ...passed(args, 'dir'),
    ...(args.switches.has('overwrite') ? { overwrite: true } : {}),
  })
  const saved = saving.isError ? undefined : (saving.value as SavedReading)
  if (json) {
    printJson(cli, {
      propose_theme: proposed,
      save_theme: saving.isError ? { error: saving.value } : saving.value,
    })
  } else {
    for (const line of proposalLines(proposed)) cli.out(line)
    if (saved === undefined) cli.out(String(saving.value))
    else for (const line of savedLines(saved)) cli.out(line)
  }
  return { code: proposed.lawful && saved?.saved === true ? 0 : 1 }
}

/* -------------------------------------------------------------------------- */
/* The server                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * `polymorph mcp`: the server over stdio, started by the entry point's
 * function, with the flags `polymorph-mcp` takes, read by the parser every
 * bin that starts the server reads them with (`server-flags.ts`). `argv` is
 * the command line with the verb's word. The project is resolved against the
 * root. The server owns stdout from here on, so nothing is printed there: a
 * refusal goes to `cli.err`.
 */
async function serve(cli: Cli, verb: Verb, argv: string[]): Promise<Outcome> {
  const at = argv.indexOf(verb.name)
  let flags: ReturnType<typeof serverFlags>
  try {
    flags = serverFlags(argv.filter((_, index) => index !== at))
  } catch (error) {
    if (error instanceof ServerFlagsError) throw new UsageError(verb, error.message)
    throw error
  }
  if (cli.serve === undefined) {
    ;(cli.err ?? cli.out)('polymorph mcp starts the MCP server, and this entry point supplied none')
    return { code: 1 }
  }
  await cli.serve(flags.readOnly ? {} : { project: resolve(cli.root, flags.project ?? '.') })
  return { code: 0 }
}
