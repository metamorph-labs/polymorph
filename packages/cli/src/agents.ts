import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, resolve, sep } from 'node:path'

import {
  FRAMEWORK_FOUNDATION,
  FRAMEWORK_VOCABULARY,
  FRAMEWORKS,
  PUBLISHED_NAMES,
  renderSystemCard,
  type Framework,
  type Registry,
} from '@polymorph/registry'

import type { Origin, Program } from './init-app'
import { digest, readManifest } from './manifest'
import { ESLINT_FRAGMENT } from './patch'
import { escapes } from './plan'
import { row } from './readings'
import { SKILL_NAMES, SKILL_USES, skillFiles } from './skills'

/**
 * `polymorph agents`: the files a coding agent reads in a project, written
 * from one description.
 *
 * A harness learns a library three ways: an instruction file it always loads
 * (`AGENTS.md`, and `CLAUDE.md`, which includes it), skills it loads when a
 * task matches (the Agent Skills format), and tools (the CLI through a shell,
 * the MCP server). `planAgents` returns all of them, for the harnesses asked
 * for, as data. It is pure: it reads the registry, the verb list (through the
 * texts) and its options, and nothing else. `init` writes its plan into a new
 * app, `agents` merges it into an existing project (`applyAgents`), and the
 * repository's plugin directory is generated from the same texts
 * (`plugin.ts`), so the three cannot say different things.
 *
 * Each step owns one part of one file:
 *
 *   file      the whole file: a skill, the card
 *   block     a marked block in a file the project owns the rest of:
 *             `AGENTS.md`, `.codex/config.toml`
 *   server    the `polymorph` entry of `mcpServers` in a JSON config:
 *             `.mcp.json`, `.cursor/mcp.json`
 *   include   one line a file must hold: `@AGENTS.md` in `CLAUDE.md`
 *
 * `polymorph/agents.json` records the hash of each part as it was written,
 * as `polymorph.json` records a vendored file. A rerun therefore replaces a
 * part nobody edited, keeps an edited one and names it, and `--force` takes
 * ours.
 */

/** The harnesses `agents` writes for, each by the files it reads. */
export const HARNESSES = ['claude', 'codex', 'cursor', 'generic'] as const
export type Harness = (typeof HARNESSES)[number]

/** The harnesses a project gets when nothing names them: the three most projects use. */
export const DEFAULT_HARNESSES: readonly Harness[] = ['claude', 'codex', 'cursor']

/** How a sentence names each harness. */
const HARNESS_NAMES: Readonly<Record<Harness, string>> = {
  claude: 'Claude Code',
  codex: 'Codex',
  cursor: 'Cursor',
  generic: 'any harness that reads AGENTS.md and .agents/skills',
}

/**
 * Where each harness reads project skills. Claude Code reads
 * `.claude/skills/`. Codex reads `.agents/skills/` from the working directory
 * up to the repository root, Cursor reads `.agents/skills/` (and Claude's and
 * Codex's directories), and so do the other harnesses of the shared format.
 */
const SKILLS_DIR: Readonly<Record<Harness, string>> = {
  claude: '.claude/skills',
  codex: '.agents/skills',
  cursor: '.agents/skills',
  generic: '.agents/skills',
}

/** Where `agents` records what it wrote. */
export const AGENT_RECORD = 'polymorph/agents.json'

/** Where the card for the project's framework is written, as `init` writes it. */
export const CARD_FILE = 'polymorph/system-card.md'

export type AgentPart = 'file' | 'block' | 'server' | 'include'

export interface AgentStep {
  /** Relative to the project. */
  path: string
  part: AgentPart
  /**
   * What the step owns, whose hash is recorded: the whole file, the block with
   * its markers, the server entry as JSON, or the line.
   */
  piece: string
  /** The whole file, as written where none exists. */
  contents: string
}

export interface AgentOptions {
  harnesses: readonly Harness[]
  /** The framework the texts and the card are for. */
  framework: Framework
  /** Where the tools run from, which decides how the texts say where the server is. */
  origin: Origin
  /**
   * The CLI, as every text names it: `npx -y @metamorph-labs/polymorph@^<version>`
   * from the published tools, the checkout's bin from a checkout.
   */
  tools: Program
  /** The MCP server, run against the project with `--project`. */
  mcp: Program
  /** The project's lint, or `null` when its `package.json` has no `lint` script. */
  lint: ProjectLint | null
}

/** A project's lint command, and whether there is evidence that it runs the red rules. */
export interface ProjectLint {
  /** `npm run lint`, in the project's package manager. */
  command: string
  /**
   * The project's ESLint config loads the red rules: it imports `@polymorph/rules` or spreads
   * the fragment `init` and `add` write. Without that evidence, `check` is the check for them.
   */
  redRules: boolean
}

export interface AgentPlan {
  harnesses: Harness[]
  framework: Framework
  steps: AgentStep[]
  /** What a harness needs beyond the files, said to the person who ran the command. */
  notes: string[]
}

/** What `polymorph/agents.json` holds. */
export interface AgentRecord {
  /** The release that wrote the files. */
  version: string
  framework: Framework
  harnesses: Harness[]
  files: Record<string, { part: AgentPart; hash: string }>
}

/* -------------------------------------------------------------------------- */
/* Commands as text                                                           */
/* -------------------------------------------------------------------------- */

/** A word a POSIX shell reads as itself. */
const PLAIN_WORD = /^[A-Za-z0-9@%+=:,./^~_-]+$/

/** A program as one shell command line, each word quoted only where a shell needs it. */
export function commandLine(program: Program): string {
  return [program.command, ...program.args]
    .map((word) => (PLAIN_WORD.test(word) ? word : `'${word.replace(/'/g, `'\\''`)}'`))
    .join(' ')
}

/* -------------------------------------------------------------------------- */
/* Marked blocks                                                              */
/* -------------------------------------------------------------------------- */

type BlockSyntax = 'markdown' | 'toml'

const BLOCK_NOTE =
  'written by `polymorph agents`. Run it again after an upgrade. An edit inside this block ' +
  'stops it being updated.'

const MARKERS: Readonly<Record<BlockSyntax, { open: string; start: RegExp; end: string }>> = {
  markdown: {
    open: `<!-- polymorph:start: ${BLOCK_NOTE} -->`,
    start: /^<!-- polymorph:start\b.*$/m,
    end: '<!-- polymorph:end -->',
  },
  toml: {
    open: `# polymorph:start: ${BLOCK_NOTE}`,
    start: /^# polymorph:start\b.*$/m,
    end: '# polymorph:end',
  },
}

const syntaxOf = (path: string): BlockSyntax => (path.endsWith('.toml') ? 'toml' : 'markdown')

/** A block of `syntax`, markers included. */
function marked(syntax: BlockSyntax, body: string): string {
  return `${MARKERS[syntax].open}\n${body.trim()}\n${MARKERS[syntax].end}`
}

/** Where the block is in `text`, from its start marker to the end of its end marker, or `null`. */
function findBlock(text: string, syntax: BlockSyntax): { from: number; to: number } | null {
  const start = MARKERS[syntax].start.exec(text)
  if (start === null) return null
  const end = text.indexOf(`\n${MARKERS[syntax].end}`, start.index)
  if (end < 0) return null
  return { from: start.index, to: end + 1 + MARKERS[syntax].end.length }
}

/* -------------------------------------------------------------------------- */
/* The plan                                                                   */
/* -------------------------------------------------------------------------- */

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`

function fileStep(path: string, contents: string): AgentStep {
  return { path, part: 'file', piece: contents, contents }
}

function blockStep(path: string, body: string): AgentStep {
  const piece = marked(syntaxOf(path), body)
  return { path, part: 'block', piece, contents: `${piece}\n` }
}

function serverStep(path: string, entry: Record<string, unknown>): AgentStep {
  return {
    path,
    part: 'server',
    piece: JSON.stringify(entry),
    contents: json({ mcpServers: { [SERVER_NAME]: entry } }),
  }
}

/** The include line Claude Code reads `AGENTS.md` through. */
const INCLUDE = '@AGENTS.md'

/** The name every MCP entry gives the server. */
const SERVER_NAME = 'polymorph'

/** The harnesses in their canonical order, each once. */
export function orderHarnesses(harnesses: Iterable<Harness>): Harness[] {
  const wanted = new Set(harnesses)
  return HARNESSES.filter((harness) => wanted.has(harness))
}

/**
 * Every file the agent setup consists of, for the harnesses asked for. Pure:
 * it reads the registry and the options.
 */
export function planAgents(registry: Registry, options: AgentOptions): AgentPlan {
  const harnesses = orderHarnesses(options.harnesses)
  const has = (harness: Harness) => harnesses.includes(harness)
  const run = commandLine(options.tools)
  const skillDirs = [...new Set(harnesses.map((harness) => SKILLS_DIR[harness]))]
  const servers = serverFiles(harnesses)
  const steps: AgentStep[] = [
    blockStep('AGENTS.md', agentsText(registry, options, { run, skillDirs, servers })),
  ]
  if (has('claude')) {
    steps.push({ path: 'CLAUDE.md', part: 'include', piece: INCLUDE, contents: `${INCLUDE}\n` })
  }
  steps.push(fileStep(CARD_FILE, renderSystemCard(registry, { framework: options.framework })))
  for (const dir of skillDirs) {
    for (const file of skillFiles(registry, run)) {
      steps.push(fileStep(`${dir}/${file.path}`, file.contents))
    }
  }
  const mcp = options.mcp
  if (has('claude')) {
    steps.push(
      serverStep('.mcp.json', { command: mcp.command, args: [...mcp.args, '--project', '.'] }),
    )
  }
  if (has('cursor')) {
    // Cursor resolves `${workspaceFolder}` in `args` to the folder that holds `.cursor/`.
    steps.push(
      serverStep('.cursor/mcp.json', {
        type: 'stdio',
        command: mcp.command,
        args: [...mcp.args, '--project', '${workspaceFolder}'],
      }),
    )
  }
  const notes: string[] = []
  if (has('codex')) {
    const args = [...mcp.args, '--project', '.'].map((arg) => JSON.stringify(arg)).join(', ')
    steps.push(
      blockStep(
        '.codex/config.toml',
        `[mcp_servers.${SERVER_NAME}]\ncommand = ${JSON.stringify(mcp.command)}\nargs = [${args}]`,
      ),
    )
    notes.push(
      'Codex reads .codex/config.toml only in a project it trusts. To give Codex the server in ' +
        'every project, add it once for your user:',
      `  codex mcp add ${SERVER_NAME} -- ${commandLine(mcp)}`,
    )
  }
  return { harnesses, framework: options.framework, steps, notes }
}

/** The MCP configs the harnesses read, by path. */
function serverFiles(harnesses: readonly Harness[]): string[] {
  return [
    ...(harnesses.includes('claude') ? ['.mcp.json'] : []),
    ...(harnesses.includes('cursor') ? ['.cursor/mcp.json'] : []),
    ...(harnesses.includes('codex') ? ['.codex/config.toml'] : []),
  ]
}

/* -------------------------------------------------------------------------- */
/* The always-loaded text                                                     */
/* -------------------------------------------------------------------------- */

/** What the always-loaded text says differently in each framework. */
interface FrameworkNotes {
  /** How the first sentence names what the app is built with. */
  built: string
  /** What application code may not contain. */
  forbids: string
  /** How a React prop reads here, or nothing for React. */
  props: string
  /** Another library's component boundary, as written in this framework. */
  boundary: string
  /** How a library inside the boundary gets the theme's values. */
  themeValues: string
  /** Whether screens are specs `emit` compiles. The elements have no emitted screens. */
  specs: boolean
  /** What only this framework's projects need said. */
  extra: readonly string[]
}

const RAW_CONTROLS = 'raw `<button>`, `<input>`, `<select>` or `<textarea>`'
const LIBRARIES = 'colours or lengths, or icon, motion or chart libraries'

const FRAMEWORK_NOTES: Readonly<Record<Framework, FrameworkNotes>> = {
  react: {
    built: `React, with the vocabulary \`${FRAMEWORK_VOCABULARY.react}\``,
    forbids: `CSS files, \`style\` or \`className\`, ${RAW_CONTROLS}, ${LIBRARIES}`,
    props: '',
    boundary: '`<ThirdParty library="…" reason="…">`',
    themeValues: `\`useThemeValues()\` from \`${FRAMEWORK_FOUNDATION.react}\``,
    specs: true,
    extra: [],
  },
  vue: {
    built: `Vue, with the vocabulary \`${FRAMEWORK_VOCABULARY.vue}\``,
    forbids: `CSS files or \`<style>\` blocks, \`class\` or \`style\` on a member or a plain element, ${RAW_CONTROLS}, ${LIBRARIES}`,
    props:
      'A prop keeps its React name. A React `onFoo` is the event `@foo`, a node-typed prop is ' +
      'the slot `#foo`, and `children` is the default slot.',
    boundary: '`<ThirdParty library="…" reason="…">`',
    themeValues: `\`useThemeValues()\` from \`${FRAMEWORK_FOUNDATION.vue}\``,
    specs: true,
    extra: [],
  },
  svelte: {
    built: `Svelte 5, with the vocabulary \`${FRAMEWORK_VOCABULARY.svelte}\``,
    forbids: `CSS files or \`<style>\` blocks, \`class\` or \`style\` on a member or a plain element, \`transition:\` directives, ${RAW_CONTROLS}, ${LIBRARIES}`,
    props:
      'A prop keeps its React name and type. A callback is the prop `onFoo`, and a node-typed ' +
      'prop is the snippet `foo`.',
    boundary: '`<ThirdParty library="…" reason="…">`',
    themeValues: `\`useThemeValues()\` from \`${FRAMEWORK_FOUNDATION.svelte}\``,
    specs: true,
    extra: [],
  },
  solid: {
    built: `Solid, with the vocabulary \`${FRAMEWORK_VOCABULARY.solid}\``,
    forbids: `CSS files, \`class\`, \`classList\` or \`style\`, ${RAW_CONTROLS}, ${LIBRARIES}`,
    props:
      'A prop keeps its React name and type. A component reads `props.foo` and never ' +
      'destructures its props, so a value stays reactive.',
    boundary: '`<ThirdParty library="…" reason="…">`',
    themeValues: `\`useThemeValues()\` from \`${FRAMEWORK_FOUNDATION.solid}\``,
    specs: true,
    extra: [],
  },
  angular: {
    built: `Angular, with the vocabulary \`${FRAMEWORK_VOCABULARY.angular}\``,
    forbids: `CSS files, \`styles\` or \`styleUrl\`, \`class\` or \`style\` on a member or a plain element, Angular animations, ${RAW_CONTROLS}, ${LIBRARIES}`,
    props:
      'A member is a standalone component written by its selector (`<pm-button>`). A prop is an ' +
      'input of the same name, and a callback `onFoo` is the output `(foo)`.',
    boundary: '`<pm-third-party library="…" reason="…">`',
    themeValues: `\`useThemeValues()\` from \`${FRAMEWORK_FOUNDATION.angular}\``,
    specs: true,
    extra: [],
  },
  elements: {
    built: 'custom elements (`<poly-button>`) on pages with no build',
    forbids: `\`class\` or \`style\` on a member, ${RAW_CONTROLS}, ${LIBRARIES}. The red rules do not read HTML, so nothing checks a page for you`,
    props:
      'A prop is the attribute in kebab case (`icon-only`), data is a JSON attribute, a node prop ' +
      'is a child with `slot="name"`, and `onFoo` is the event `poly-foo`.',
    boundary: '`<poly-third-party library="…" reason="…">`',
    themeValues: '`var(--pm-…)`',
    specs: false,
    extra: [
      'A page loads the stylesheets and `polymorph.js` from the directory `polymorph.json` names, ' +
        'which also holds the theme sheet. `add theme:<system>` adds a system to the sheet, ' +
        '`<html data-system data-palette>` chooses the one a page wears, and `update` copies the ' +
        'files again when polymorph changes.',
      '`<html data-agent="on-call">` lets an agent in the browser operate the page (the ' +
        '`polymorph-agent-bridge` skill). A page states it only when its owner decides one may.',
    ],
  },
}

/** A list in a sentence: `a`, `a and b`, `a, b and c`. */
function listed(items: readonly string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1) as string}`
}

/**
 * Wraps prose at the column every file here keeps, indenting each line after
 * the first. A code span is one word, so no line break falls inside one.
 */
function wrap(text: string, indent = '', width = 100): string {
  const lines: string[] = []
  let line = ''
  for (const word of text.match(/(?:`[^`]*`|[^\s`])+/g) ?? []) {
    const next = line === '' ? word : `${line} ${word}`
    if (next.length + (lines.length === 0 ? 0 : indent.length) > width && line !== '') {
      lines.push(line)
      line = word
    } else line = next
  }
  if (line !== '') lines.push(line)
  return lines.map((each, index) => (index === 0 ? each : `${indent}${each}`)).join('\n')
}

const bullet = (text: string): string => `- ${wrap(text, '  ', 98)}`

/**
 * The text every harness loads in every session, short on purpose: what the
 * app is built with, what will stop an agent, the commands for the card,
 * a member, `validate` and `render`, and where the skills are.
 */
function agentsText(
  registry: Registry,
  options: AgentOptions,
  where: { run: string; skillDirs: string[]; servers: string[] },
): string {
  const notes = FRAMEWORK_NOTES[options.framework]
  const framework = ` --framework ${options.framework}`
  const ladder = registry.exceptions.ladder.map((rung) => rung.name.toLowerCase())
  const lines: string[] = [
    '## Polymorph',
    '',
    wrap(
      `This app's interface is built with polymorph, in ${notes.built}: a closed vocabulary of ` +
        'components, called members, and lint rules, the red rules, that hold application code ' +
        'to it. Screens compose members and bind content to them. The theme decides every ' +
        'colour, size, font and motion.',
    ),
    '',
    bullet(
      `\`${CARD_FILE}\` is the contract: every member, its props, the token families, the rules ` +
        'and the exception ladder. A member or prop that is not in it does not exist.' +
        (notes.props === '' ? '' : ` ${notes.props}`),
    ),
    bullet(`Application code may not contain ${notes.forbids}.`),
    bullet(
      'A need the vocabulary does not cover climbs the exception ladder from its first rung: ' +
        `${listed(ladder)}. Another library's component goes inside ${notes.boundary}, and ` +
        `takes the theme as ${notes.themeValues}. A rule is never silenced with \`eslint-disable\`.`,
    ),
  ]
  for (const extra of notes.extra) lines.push(bullet(extra))
  if (notes.specs) {
    lines.push(
      bullet(
        'A screen may be a spec, a `polymorph-screen/1` JSON document, that `emit` compiles into ' +
          'a component with no state, rendered by a hand-written container. Change an emitted ' +
          'screen through its spec.',
      ),
    )
  }
  const lint =
    options.framework === 'elements' || options.lint === null
      ? ''
      : options.lint.redRules
        ? ` \`${options.lint.command}\` runs the same red rules, through the project's ESLint config.`
        : ` \`${options.lint.command}\` is the project's own lint, and its ESLint config loads no ` +
          'polymorph rules, so `check` is the check for them.'
  const check =
    options.framework === 'elements'
      ? ''
      : ' `check` runs the red rules over a directory whatever the lint config holds.'
  lines.push(bullet(`The tools run from a shell, and answer for this release.${check}${lint}`), '')
  const commands = [
    [`card${framework}`, 'the card'],
    [`search <words>${framework}`, 'find a member; `component <Name>` reads one'],
    ...(options.framework === 'elements'
      ? []
      : [
          [`validate <file>${framework}`, 'each violation with its lawful fix'],
          [
            `render <spec.json> --system <name>`,
            'draw a spec at two widths, with its layout faults',
          ],
        ]),
    ...(options.framework === 'elements' ? [] : [['check src', 'the red rules over a directory']]),
  ]
  const width = Math.max(...commands.map(([command]) => `${where.run} ${command}`.length))
  lines.push(
    '```sh',
    ...commands.map(
      ([command, comment]) => `${`${where.run} ${command}`.padEnd(width)}  # ${comment}`,
    ),
    '```',
    '',
  )
  lines.push(
    bullet(
      `The skills in ${listed(where.skillDirs.map((dir) => `\`${dir}/\``))} hold the ` +
        `procedures: ${SKILL_NAMES.map((name) => `\`${name}\` (${SKILL_USES[name]})`).join('; ')}.`,
    ),
  )
  if (where.servers.length > 0) lines.push(bullet(serverSentence(options, where.servers)))
  return lines.join('\n')
}

/** Where the MCP server is configured, and what its command needs. */
function serverSentence(options: AgentOptions, servers: string[]): string {
  const files = listed(servers.map((file) => `\`${file}\``))
  const where =
    options.origin === 'checkout'
      ? `${files} start the same tools as an MCP server from the polymorph checkout that wrote ` +
        'them, by its path on that machine. On another machine, run `agents` again from that ' +
        "machine's checkout or from the published tools."
      : `${files} start the same tools as an MCP server with \`npx\`, naming no path, so they ` +
        'work on any machine.'
  const trust = servers.includes('.codex/config.toml')
    ? ' Codex reads `.codex/config.toml` only in a project it trusts.'
    : ''
  // The configs are committed and shared, so they name `npx` for every machine, and the one
  // change a native Windows client may need is said instead of written.
  // A page installs no tools, so its first start downloads them.
  const download =
    options.framework === 'elements' && options.mcp.command === 'npx'
      ? ' The page installs no tools, so the server downloads them the first time it starts, which ' +
        'can take longer than a client waits: run the `card` command above once first.'
      : ''
  const windows =
    options.mcp.command === 'npx'
      ? ' A client on native Windows that cannot start `npx` runs it as `cmd /c npx` with the ' +
        'same arguments.'
      : ''
  return `${where}${download}${trust}${windows}`
}

/* -------------------------------------------------------------------------- */
/* The record                                                                 */
/* -------------------------------------------------------------------------- */

/** The record of a plan written whole into a new directory, as `init` writes it. */
export function freshRecord(registry: Registry, plan: AgentPlan): AgentRecord {
  return {
    version: registry.version,
    framework: plan.framework,
    harnesses: plan.harnesses,
    files: Object.fromEntries(
      plan.steps.map((step) => [step.path, { part: step.part, hash: digest(step.piece) }]),
    ),
  }
}

/** The record as written, its files sorted, so a rerun that changes nothing writes the same bytes. */
export function renderRecord(record: AgentRecord): string {
  return json({
    version: record.version,
    framework: record.framework,
    harnesses: record.harnesses,
    files: Object.fromEntries(Object.entries(record.files).sort(([a], [b]) => a.localeCompare(b))),
  })
}

export class AgentRecordError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AgentRecordError'
  }
}

/**
 * The record a project holds, or `null`. Every path in it is resolved against
 * the project and one use is a removal, so a record with a path that leaves
 * the project is refused whole, as `readManifest` refuses one.
 */
export function readAgentRecord(root: string): AgentRecord | null {
  const path = resolve(root, AGENT_RECORD)
  if (!existsSync(path)) return null
  if (!insideOnDisk(root, AGENT_RECORD)) {
    throw new AgentRecordError(`polymorph agents: ${AGENT_RECORD} resolves outside the project`)
  }
  let parsed: Partial<AgentRecord>
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<AgentRecord>
  } catch {
    throw new AgentRecordError(`polymorph agents: ${AGENT_RECORD} is not JSON`)
  }
  if (typeof parsed.files !== 'object' || parsed.files === null) {
    throw new AgentRecordError(`polymorph agents: ${AGENT_RECORD} records no files`)
  }
  for (const key of Object.keys(parsed.files)) {
    if (escapes(key)) {
      throw new AgentRecordError(
        `polymorph agents: ${AGENT_RECORD} names ${key}, which is outside the project`,
      )
    }
  }
  return {
    version: typeof parsed.version === 'string' ? parsed.version : '0.0.0',
    framework: (FRAMEWORKS as readonly unknown[]).includes(parsed.framework)
      ? (parsed.framework as Framework)
      : 'react',
    harnesses: orderHarnesses(
      (Array.isArray(parsed.harnesses) ? parsed.harnesses : []).filter(
        (harness): harness is Harness => (HARNESSES as readonly unknown[]).includes(harness),
      ),
    ),
    files: parsed.files,
  }
}

/* -------------------------------------------------------------------------- */
/* Applying a plan to a project                                               */
/* -------------------------------------------------------------------------- */

export type AgentAction = 'wrote' | 'updated' | 'unchanged' | 'kept' | 'removed' | 'refused'

export interface AgentOutcome {
  path: string
  part: AgentPart
  action: AgentAction
  /** Why a part was kept or refused. */
  why?: string
  /** A kept part that `--force` would replace: one the plan still writes, into a file that can take it. */
  replaceable?: boolean
}

export interface AgentsResult {
  outcomes: AgentOutcome[]
  record: AgentRecord
}

/** The piece of `part` in a file's text, or `null` when the file does not hold one. */
function pieceIn(part: AgentPart, path: string, text: string): string | null {
  switch (part) {
    case 'file':
      return text
    case 'block': {
      const found = findBlock(text, syntaxOf(path))
      return found === null ? null : text.slice(found.from, found.to)
    }
    case 'server': {
      const entry = serversIn(text)?.[SERVER_NAME]
      return entry === undefined ? null : JSON.stringify(entry)
    }
    case 'include':
      return text.split(/\r?\n/).some((line) => line.trim() === INCLUDE) ? INCLUDE : null
  }
}

/** The `mcpServers` object of a JSON config, or `null` when the text is not one. */
function serversIn(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as unknown
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const servers = (parsed as Record<string, unknown>)['mcpServers']
    if (servers === undefined) return {}
    return servers !== null && typeof servers === 'object' && !Array.isArray(servers)
      ? (servers as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

/** The file with the step's piece in place of whatever held its place. */
function withPiece(step: AgentStep, text: string | null): string {
  if (text === null) return step.contents
  switch (step.part) {
    case 'file':
      return step.contents
    case 'block': {
      const found = findBlock(text, syntaxOf(step.path))
      if (found !== null) return `${text.slice(0, found.from)}${step.piece}${text.slice(found.to)}`
      const body = text.replace(/\s*$/, '')
      return body === '' ? step.contents : `${body}\n\n${step.piece}\n`
    }
    case 'server': {
      const config = JSON.parse(text) as Record<string, unknown>
      const servers = { ...(serversIn(text) ?? {}) }
      servers[SERVER_NAME] = JSON.parse(step.piece) as unknown
      return json({ ...config, mcpServers: servers })
    }
    case 'include': {
      const body = text.replace(/\s*$/, '')
      return body === '' ? step.contents : `${body}\n\n${INCLUDE}\n`
    }
  }
}

/** The file with the part taken out, or `null` when nothing of the project's is left in it. */
function withoutPiece(part: AgentPart, path: string, text: string): string | null {
  switch (part) {
    case 'file':
      return null
    case 'block': {
      const found = findBlock(text, syntaxOf(path))
      if (found === null) return text
      const before = text.slice(0, found.from).replace(/\s*$/, '')
      const after = text.slice(found.to).replace(/^\s*/, '')
      const left = [before, after].filter((side) => side !== '').join('\n\n')
      return left === '' ? null : `${left}\n`
    }
    case 'server': {
      const config = JSON.parse(text) as Record<string, unknown>
      const servers = { ...(serversIn(text) ?? {}) }
      delete servers[SERVER_NAME]
      const rest = Object.keys(config).filter((key) => key !== 'mcpServers')
      if (Object.keys(servers).length === 0 && rest.length === 0) return null
      return json({ ...config, mcpServers: servers })
    }
    case 'include':
      return text
  }
}

/**
 * Whether `path` is inside `root` on disk: the deepest part of it that exists
 * is resolved for real, so a linked directory cannot carry a write outside the
 * project.
 */
function insideOnDisk(root: string, path: string): boolean {
  const base = realpathSync(root)
  let at = resolve(root, path)
  while (!existsSync(at) && dirname(at) !== at) at = dirname(at)
  const real = realpathSync(at)
  return real === base || real.startsWith(`${base}${sep}`)
}

/** A TOML key, dotted or not, as its parts: `mcp_servers."polymorph"` is `mcp_servers`, `polymorph`. */
function tomlKey(written: string): string[] {
  const parts: string[] = []
  for (const match of written.matchAll(
    /\s*(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|([A-Za-z0-9_-]+))\s*(?:\.|$)/g,
  )) {
    const part = match[1] ?? match[2] ?? match[3]
    if (part !== undefined) parts.push(part)
  }
  return parts
}

/** Where in a TOML line its comment starts, or its end: a `#` outside a string. */
function tomlCode(line: string): string {
  let quote: string | null = null
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index] as string
    if (quote !== null) {
      if (char === '\\' && quote === '"') index += 1
      else if (char === quote) quote = null
    } else if (char === '"' || char === "'") quote = char
    else if (char === '#') return line.slice(0, index)
  }
  return line
}

/** Where a TOML line's key ends: its first `=` outside a string, or -1. */
function tomlEquals(line: string): number {
  let quote: string | null = null
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index] as string
    if (quote !== null) {
      if (char === quote) quote = null
    } else if (char === '"' || char === "'") quote = char
    else if (char === '=') return index
  }
  return -1
}

/**
 * The multi-line string a TOML line leaves open, `"""` or `'''`, or `null`,
 * given the one open where the line starts. Only the delimiter that opened a
 * string closes it, so a `'''` inside a `"""` string is text.
 */
function tomlOpen(line: string, open: string | null): string | null {
  let fence = open
  let at = 0
  while (at < line.length) {
    if (fence !== null) {
      const end = line.indexOf(fence, at)
      if (end < 0) return fence
      at = end + fence.length
      fence = null
      continue
    }
    const basic = line.indexOf('"""', at)
    const literal = line.indexOf("'''", at)
    if (basic < 0 && literal < 0) return null
    fence = literal < 0 || (basic >= 0 && basic < literal) ? '"""' : "'''"
    at = (fence === '"""' ? basic : literal) + fence.length
  }
  return fence
}

/**
 * Why a Codex config cannot take the block, or `null`. The block adds the
 * table `[mcp_servers.polymorph]`, which TOML refuses when the document
 * already defines that server in any form (a table header, a key under
 * `[mcp_servers]`, a dotted key) or defines `mcp_servers` as an inline table,
 * which no table header may extend. The reading follows table headers and the
 * keys under them, line by line, and skips the inside of multi-line strings.
 */
function tomlRefusal(text: string): string | null {
  let table: string[] = []
  let open: string | null = null
  const server = (path: string[]) => path[0] === 'mcp_servers' && path[1] === SERVER_NAME
  for (const raw of text.split('\n')) {
    const inside = open !== null
    open = tomlOpen(raw, open)
    if (inside) continue
    const line = tomlCode(raw).trim()
    if (line === '') continue
    const header = /^\[\[?(.+?)\]\]?$/.exec(line)
    if (header !== null) {
      table = tomlKey(header[1] as string)
      if (server(table)) return 'it already configures the polymorph server, outside the block'
      continue
    }
    const equals = tomlEquals(line)
    if (equals < 0) continue
    const path = [...table, ...tomlKey(line.slice(0, equals))]
    if (server(path)) return 'it already configures the polymorph server, outside the block'
    if (
      path.length === 1 &&
      path[0] === 'mcp_servers' &&
      line
        .slice(equals + 1)
        .trim()
        .startsWith('{')
    ) {
      return 'it defines `mcp_servers` as an inline table, which `[mcp_servers.polymorph]` cannot extend'
    }
  }
  return null
}

/** Why a part cannot be written into the file it is in, whatever the record says, or `null`. */
function blocked(step: AgentStep, text: string | null): string | null {
  if (text === null) return null
  if (step.part === 'server' && serversIn(text) === null) {
    return 'it is not a JSON object with `mcpServers`, so it was left as it is'
  }
  if (step.part === 'block' && step.path.endsWith('.toml')) {
    const found = findBlock(text, 'toml')
    return tomlRefusal(found === null ? text : text.slice(0, found.from) + text.slice(found.to))
  }
  return null
}

/**
 * Writes a plan into a project, part by part, and returns what happened to
 * each with the record to keep. A part is written where it is absent,
 * replaced where it is exactly what was recorded, left where it already says
 * what the plan says, and kept where it differs from the record (an edit) or
 * was never recorded (not ours), unless `force`. A part the record holds that
 * the plan no longer has is removed if nobody edited it.
 *
 * With `dryRun` nothing is written, and the outcomes say what would be.
 *
 * A file whose lines end in CRLF, as Git's `core.autocrlf` checks text out on
 * Windows, is read with its endings as LF, so its parts compare and hash as
 * the plan's do. A part written into it keeps the file's CRLF endings, so the
 * file stays in the form its checkout gave it and Git sees only the change.
 */
export function applyAgents(
  root: string,
  registry: Registry,
  plan: AgentPlan,
  previous: AgentRecord | null,
  options: { force?: boolean; dryRun?: boolean } = {},
): AgentsResult {
  const outcomes: AgentOutcome[] = []
  const files: AgentRecord['files'] = {}
  // The files that end their lines with CRLF, as a checkout with Git's `core.autocrlf` has them.
  const crlf = new Set<string>()
  const read = (path: string): string | null => {
    const full = resolve(root, path)
    if (!existsSync(full)) return null
    const text = readFileSync(full, 'utf8')
    if (!text.includes('\r\n')) return text
    crlf.add(path)
    return text.replace(/\r\n/g, '\n')
  }
  const write = (path: string, text: string | null): void => {
    if (options.dryRun) return
    const full = resolve(root, path)
    if (text === null) {
      rmSync(full, { force: true })
      prune(root, dirname(full))
      return
    }
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, crlf.has(path) ? text.replace(/\n/g, '\r\n') : text)
  }

  for (const step of plan.steps) {
    const recorded = previous?.files[step.path]
    const keep = (why: string, replaceable = false): void => {
      outcomes.push({
        path: step.path,
        part: step.part,
        action: 'kept',
        why,
        ...(replaceable ? { replaceable } : {}),
      })
      if (recorded !== undefined) files[step.path] = recorded
    }
    if (escapes(step.path) || !insideOnDisk(root, step.path)) {
      outcomes.push({
        path: step.path,
        part: step.part,
        action: 'refused',
        why: 'it resolves outside the project',
      })
      continue
    }
    const text = read(step.path)
    const refusal = blocked(step, text)
    if (refusal !== null) {
      keep(refusal)
      continue
    }
    const now = text === null ? null : pieceIn(step.part, step.path, text)
    const hash = digest(step.piece)
    if (now === step.piece) {
      outcomes.push({ path: step.path, part: step.part, action: 'unchanged' })
      files[step.path] = { part: step.part, hash }
      continue
    }
    const ours = now === null || (recorded !== undefined && digest(now) === recorded.hash)
    if (!ours && !options.force) {
      keep(
        recorded === undefined
          ? 'not written by `polymorph agents`; `--force` replaces it'
          : 'edited since `polymorph agents` wrote it; `--force` replaces it',
        true,
      )
      continue
    }
    write(step.path, withPiece(step, text))
    outcomes.push({ path: step.path, part: step.part, action: now === null ? 'wrote' : 'updated' })
    files[step.path] = { part: step.part, hash }
  }

  // A part the record holds that the plan no longer has: removed if nobody edited it.
  const planned = new Set(plan.steps.map((step) => step.path))
  for (const [path, recorded] of Object.entries(previous?.files ?? {})) {
    if (planned.has(path) || escapes(path) || !insideOnDisk(root, path)) continue
    const text = read(path)
    const now = text === null ? null : pieceIn(recorded.part, path, text)
    if (now === null) continue
    if (digest(now) !== recorded.hash) {
      outcomes.push({
        path,
        part: recorded.part,
        action: 'kept',
        why: 'no longer written, and edited, so it was left',
      })
      files[path] = recorded
      continue
    }
    if (recorded.part !== 'include') {
      write(path, withoutPiece(recorded.part, path, text as string))
      outcomes.push({ path, part: recorded.part, action: 'removed' })
    }
  }

  const record: AgentRecord = {
    version: registry.version,
    framework: plan.framework,
    harnesses: plan.harnesses,
    files,
  }
  // The record is held to the project as every part is.
  if (escapes(AGENT_RECORD) || !insideOnDisk(root, AGENT_RECORD)) {
    outcomes.push({
      path: AGENT_RECORD,
      part: 'file',
      action: 'refused',
      why: 'it resolves outside the project',
    })
  } else if (!options.dryRun) {
    const full = resolve(root, AGENT_RECORD)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, renderRecord(record))
  }
  return { outcomes, record }
}

/** Removes `dir` and each directory above it that is left empty, up to the project. */
function prune(root: string, dir: string): void {
  const base = resolve(root)
  for (let at = resolve(dir); at.startsWith(`${base}${sep}`); at = dirname(at)) {
    if (!existsSync(at) || readdirSync(at).length > 0) return
    rmSync(at, { recursive: true })
  }
}

/* -------------------------------------------------------------------------- */
/* What the project is                                                        */
/* -------------------------------------------------------------------------- */

/** The project's `package.json`, or `null`. */
function packageManifest(root: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as unknown
    return parsed !== null && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

/**
 * The framework a project's texts and card are for: the one its install
 * manifest records, else the first whose vocabulary or foundation its
 * `package.json` depends on, else React.
 */
export function projectFramework(root: string): Framework {
  try {
    const manifest = readManifest(root)
    if (manifest !== null) return manifest.framework ?? 'react'
  } catch {
    // An unreadable manifest decides nothing here; `add` and `update` report it.
  }
  const manifest = packageManifest(root)
  const declared = new Set(
    ['dependencies', 'devDependencies', 'peerDependencies'].flatMap((field) => {
      const value = manifest?.[field]
      return value !== null && typeof value === 'object' ? Object.keys(value) : []
    }),
  )
  const order: Framework[] = ['vue', 'svelte', 'angular', 'solid', 'elements', 'react']
  return (
    order.find(
      (framework) =>
        declared.has(FRAMEWORK_VOCABULARY[framework]) ||
        declared.has(FRAMEWORK_FOUNDATION[framework]),
    ) ?? 'react'
  )
}

/** The lockfiles that tell a project's package manager, in the order they are looked for. */
const LOCKFILES: readonly [string, PackageManagerName][] = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
  ['package-lock.json', 'npm'],
]

type PackageManagerName = 'npm' | 'pnpm' | 'yarn' | 'bun'

/** How each package manager runs a script. */
export function runScript(manager: PackageManagerName, script: string): string {
  return manager === 'npm' || manager === 'bun'
    ? `${manager} run ${script}`
    : `${manager} ${script}`
}

/** The ESLint configs a project may have, flat and legacy, at its root. */
const ESLINT_CONFIGS = [
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  'eslint.config.mts',
  'eslint.config.cts',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.json',
  '.eslintrc.yml',
  '.eslintrc.yaml',
  '.eslintrc',
]

/**
 * Whether the project's ESLint config loads the red rules: it names
 * `@polymorph/rules` (or its published name) or the fragment `init` and
 * `add` write and spread (`ESLINT_FRAGMENT`).
 */
function eslintLoadsRedRules(root: string): boolean {
  const names = ['@polymorph/rules', PUBLISHED_NAMES['@polymorph/rules'] ?? '', ESLINT_FRAGMENT]
  return ESLINT_CONFIGS.some((file) => {
    const path = resolve(root, file)
    if (!existsSync(path)) return false
    const text = readFileSync(path, 'utf8')
    return names.some((name) => name !== '' && text.includes(name))
  })
}

/**
 * The project's lint, or `null` when its `package.json` has no `lint` script.
 * The package manager is the one its lockfile or its `packageManager` field
 * names, else `fallback`. The texts say the lint runs the red rules only when
 * the project's ESLint config shows it loads them; a lint script alone is no
 * evidence, because a project's own lint may load none of them.
 */
export function projectLint(root: string, fallback: PackageManagerName): ProjectLint | null {
  const manifest = packageManifest(root)
  const scripts = manifest?.['scripts'] as Record<string, unknown> | undefined
  if (typeof scripts?.['lint'] !== 'string') return null
  const locked = LOCKFILES.find(([file]) => existsSync(resolve(root, file)))?.[1]
  const declared = String(manifest?.['packageManager'] ?? '').split('@')[0] as PackageManagerName
  const manager =
    locked ?? (['npm', 'pnpm', 'yarn', 'bun'].includes(declared) ? declared : fallback)
  return { command: runScript(manager, 'lint'), redRules: eslintLoadsRedRules(root) }
}

/* -------------------------------------------------------------------------- */
/* The command                                                                */
/* -------------------------------------------------------------------------- */

export class HarnessError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HarnessError'
  }
}

/** `claude,codex` or `all`, read as harnesses. */
export function readHarnesses(given: string): Harness[] {
  const named = given
    .split(',')
    .map((word) => word.trim())
    .filter((word) => word !== '')
  if (named.length === 0) {
    throw new HarnessError('polymorph agents: `--harness` names no harness')
  }
  const harnesses: Harness[] = []
  for (const name of named) {
    if (name === 'all') harnesses.push(...HARNESSES)
    else if ((HARNESSES as readonly string[]).includes(name)) harnesses.push(name as Harness)
    else {
      throw new HarnessError(
        `polymorph agents: there is no harness called "${name}" — ${HARNESSES.join(', ')} or all`,
      )
    }
  }
  return orderHarnesses(harnesses)
}

/** What each outcome is called in the report, aligned as the other commands align theirs. */
const LABELS: Readonly<Record<AgentAction, string>> = {
  wrote: 'wrote',
  updated: 'updated',
  unchanged: 'unchanged',
  kept: 'kept yours',
  removed: 'removed',
  refused: 'refused',
}

/** The report of a run, one row for each part that is not unchanged. */
export function agentLines(result: AgentsResult, plan: AgentPlan, dryRun: boolean): string[] {
  const lines: string[] = []
  const unchanged = result.outcomes.filter((outcome) => outcome.action === 'unchanged')
  for (const outcome of result.outcomes) {
    if (outcome.action === 'unchanged') continue
    const part =
      outcome.part === 'block'
        ? ' (the polymorph block)'
        : outcome.part === 'server'
          ? ' (the polymorph server)'
          : outcome.part === 'include'
            ? ' (the @AGENTS.md line)'
            : ''
    const why = outcome.why === undefined ? '' : ` — ${outcome.why}`
    lines.push(row(LABELS[outcome.action], `${outcome.path}${part}${why}`))
  }
  if (unchanged.length > 0) {
    lines.push(
      row(
        'unchanged',
        unchanged.length === result.outcomes.length
          ? `all ${unchanged.length} parts are as polymorph wrote them`
          : `${unchanged.length} parts`,
      ),
    )
  }
  const recordRefused = result.outcomes.some(
    (outcome) => outcome.path === AGENT_RECORD && outcome.action === 'refused',
  )
  if (!dryRun && !recordRefused) lines.push(row('recorded', AGENT_RECORD))
  for (const note of plan.notes) lines.push(note.startsWith('  ') ? `  ${note}` : `  · ${note}`)
  return lines
}

/** The harnesses in a sentence: `Claude Code, Codex and Cursor`. */
export function harnessNames(harnesses: readonly Harness[]): string {
  return listed(harnesses.map((harness) => HARNESS_NAMES[harness]))
}
