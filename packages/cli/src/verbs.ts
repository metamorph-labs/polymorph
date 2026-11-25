import { DEFAULT_DIR, DEFAULT_SYSTEM, ELEMENTS_DIR } from './plan'

/**
 * The verbs of `polymorph`, as data, and the two functions an entry point
 * supplies so that a verb can ask the MCP tools.
 *
 * The help reads this list. So do the docs' verb table and anything else that
 * names a verb, which is why `@polymorph/cli` exports it. A verb that answers
 * through the MCP tools names them in `tools`, and a law in `packages/mcp`
 * (`verbs.test.ts`) holds the two lists to each other: every tool the server
 * registers is the job of some verb, and every tool a verb names is one the
 * server registers. The law lives there because that package may import this
 * one, and this one may not import it.
 */

/** The groups the help lists the verbs in, in the order it lists them. */
export const VERB_GROUPS = ['start', 'look up', 'check', 'write', 'themes', 'agents'] as const
export type VerbGroup = (typeof VERB_GROUPS)[number]

export interface VerbFlag {
  /** The flag without its dashes: `framework`. */
  readonly name: string
  /** What the usage calls its value (`name` in `--framework <name>`). Absent for a flag that takes none. */
  readonly value?: string
  readonly summary: string
}

export interface Verb {
  /** The words that name it: `card`, `theme propose`. */
  readonly name: string
  readonly group: VerbGroup
  /** What it does, in one line. */
  readonly summary: string
  /** The whole command line: arguments, then flags, optional ones in brackets. */
  readonly usage: string
  readonly flags: readonly VerbFlag[]
  /**
   * The MCP tools that do this verb's job. A verb that `needs` the tools calls
   * them through `cli.tools` and prints their answer. A verb the CLI answers
   * with its own code names the tool that does the same job (`add` is
   * `install`), so an agent with either finds the other.
   */
  readonly tools: readonly string[]
  /**
   * What the entry point must supply for the verb to run: the tool caller
   * (`cli.tools`), the server starter (`cli.serve`), or nothing.
   */
  readonly needs: 'tools' | 'server' | null
}

/* -------------------------------------------------------------------------- */
/* The seams an entry point supplies                                          */
/* -------------------------------------------------------------------------- */

/** A picture that comes with a tool's answer: `render_screen`'s PNGs. */
export interface ToolImage {
  readonly data: Uint8Array
  /** `image/png`. */
  readonly mediaType: string
}

/**
 * One tool's answer, as data. It is what the MCP server sends for the same
 * call, before the protocol encodes it: the server writes `value` as text (a
 * string as it is, anything else as JSON) and each image as base64.
 */
export interface ToolAnswer {
  /**
   * The answer: its JSON value, or its text where the answer is text (the
   * system card). For an error, the sentence that says why.
   */
  readonly value: unknown
  /** The pictures that follow the answer, in order. Empty for every tool but `render_screen`. */
  readonly images: readonly ToolImage[]
  /** The tool refused or failed, and `value` is its message. */
  readonly isError: boolean
}

/**
 * Calls one MCP tool by name, in this process, with the project at `cli.root`.
 * `@polymorph/mcp` exports the factory (`toolCaller`). The arguments are checked
 * against the tool's own input schema, as the server checks them.
 */
export type ToolCaller = (name: string, args: unknown) => Promise<ToolAnswer>

/**
 * Starts the MCP server over this process's stdin and stdout, and resolves when
 * the client has gone and every request has its answer. `project` is the
 * absolute path the write tools write into, and absent for a read-only server.
 * `@polymorph/mcp` exports the function an entry point wraps (`serveStdio`).
 */
export type ServerStarter = (options: { project?: string }) => Promise<void>

/* -------------------------------------------------------------------------- */
/* The flags several verbs share                                              */
/* -------------------------------------------------------------------------- */

const JSON_FLAG: VerbFlag = {
  name: 'json',
  summary: 'print the tool’s JSON answer and nothing else',
}

const LOOKUP_FRAMEWORK: VerbFlag = {
  name: 'framework',
  value: 'name',
  summary:
    '`react` (default), `vue`, `svelte`, `solid`, `angular` or `elements`: leave out the ' +
    'members with no shell there',
}

const PLATFORM: VerbFlag = {
  name: 'platform',
  value: 'name',
  summary: '`web` (default), `ios` or `android`: leave out the members absent there',
}

const CODE_FRAMEWORK: VerbFlag = {
  name: 'framework',
  value: 'name',
  summary: 'the framework the code or spec is written in; omitted, the project decides',
}

const SURFACE: VerbFlag = {
  name: 'surface',
  value: 'name',
  summary: '`application` (default), a screen, or `vocabulary`, a member',
}

const INSTALL_FRAMEWORK: VerbFlag = {
  name: 'framework',
  value: 'name',
  summary:
    'the framework whose members are vendored; omitted, the one `polymorph.json` records, or ' +
    '`react`',
}

const DIR: VerbFlag = {
  name: 'dir',
  value: 'path',
  summary: `where vendored source lands (default \`${DEFAULT_DIR}\`)`,
}

/* -------------------------------------------------------------------------- */
/* The verbs                                                                  */
/* -------------------------------------------------------------------------- */

export const VERBS: readonly Verb[] = [
  {
    name: 'init',
    group: 'start',
    summary: 'Write a new app: packages, theme, rules, agent tools and a first screen.',
    usage:
      'polymorph init <dir> [--framework <name>] [--system <name>] [--registry <name>] ' +
      '[--dir <path>] [--no-install] [--dry-run]',
    flags: [
      {
        name: 'framework',
        value: 'name',
        summary: '`react` (default), `vue`, `svelte`, `solid`, `angular` or `elements`',
      },
      {
        name: 'system',
        value: 'name',
        summary: `the catalogue system the app wears (default \`${DEFAULT_SYSTEM}\`)`,
      },
      {
        name: 'registry',
        value: 'name',
        summary:
          'where the app installs the packages from: `npmjs` (no `.npmrc`, no token) or ' +
          '`github` (GitHub Packages, with a token); default `npmjs` from the published ' +
          'tools, `github` from a checkout',
      },
      {
        name: 'dir',
        value: 'path',
        summary: `for \`elements\`, the static directory the page is written in (default \`${ELEMENTS_DIR.split('/')[0]}\`)`,
      },
      {
        name: 'no-install',
        summary: 'write the app and do not install it with the package manager that ran this',
      },
      { name: 'dry-run', summary: 'print the plan and write nothing' },
    ],
    tools: [],
    needs: null,
  },
  {
    name: 'card',
    group: 'look up',
    summary: 'Print the system card: every member, the tokens, the red rules and the ladder.',
    usage: 'polymorph card [--framework <name>] [--platform <name>] [--json]',
    flags: [
      {
        name: 'framework',
        value: 'name',
        summary:
          '`react` (default), `vue`, `svelte`, `solid`, `angular` or `elements`: the card ' +
          'for an app in that framework',
      },
      { ...PLATFORM, summary: '`web` (default), `ios` or `android`: the card for that platform' },
      JSON_FLAG,
    ],
    tools: ['get_system_card'],
    needs: 'tools',
  },
  {
    name: 'search',
    group: 'look up',
    summary: 'Find members by name, purpose, prop or variant; with no query, list them all.',
    usage:
      'polymorph search [query] [--tier <tier>] [--origin <origin>] [--framework <name>] ' +
      '[--platform <name>] [--limit <n>] [--json]',
    flags: [
      { name: 'tier', value: 'tier', summary: 'only the members of one tier: `controls`, …' },
      {
        name: 'origin',
        value: 'origin',
        summary: '`installed` (in the foundation package) or `vendored` (copied by `add`)',
      },
      LOOKUP_FRAMEWORK,
      PLATFORM,
      { name: 'limit', value: 'n', summary: 'at most this many hits' },
      JSON_FLAG,
    ],
    tools: ['search_components'],
    needs: 'tools',
  },
  {
    name: 'component',
    group: 'look up',
    summary: 'Print one member: its props, its lawful cells, its states and what it depends on.',
    usage: 'polymorph component <name> [--source] [--framework <name>] [--json]',
    flags: [
      { name: 'source', summary: 'add the member’s source, stylesheet and states fixture' },
      {
        name: 'framework',
        value: 'name',
        summary:
          'print whether that framework ships the member, in place of every framework; the ' +
          'JSON answer lists every framework',
      },
      JSON_FLAG,
    ],
    tools: ['get_component'],
    needs: 'tools',
  },
  {
    name: 'axes',
    group: 'look up',
    summary: 'Print the theme axes, the systems and palettes, the colour roles and the scales.',
    usage: 'polymorph axes [--properties] [--values] [--json]',
    flags: [
      { name: 'properties', summary: 'add every `--pm-*` property a theme emits' },
      { name: 'values', summary: 'add each system’s token values with its default palette' },
      JSON_FLAG,
    ],
    tools: ['get_theme_axes'],
    needs: 'tools',
  },
  {
    name: 'plan',
    group: 'look up',
    summary: 'Print what `add` would copy and install, and write nothing.',
    usage: 'polymorph plan <item...> [--dir <path>] [--framework <name>] [--json]',
    flags: [DIR, INSTALL_FRAMEWORK, JSON_FLAG],
    tools: ['get_install_plan'],
    needs: 'tools',
  },
  {
    name: 'validate',
    group: 'check',
    summary: 'Check code against the red rules, or a screen spec against the vocabulary.',
    usage:
      'polymorph validate <file...|-> [--filename <name>] [--surface <name>] ' +
      '[--framework <name>] [--json]',
    flags: [
      {
        name: 'filename',
        value: 'name',
        summary: 'with `-`, the name the text read from stdin is checked as',
      },
      SURFACE,
      CODE_FRAMEWORK,
      JSON_FLAG,
    ],
    tools: ['validate'],
    needs: 'tools',
  },
  {
    name: 'check',
    group: 'check',
    summary: 'Run the red rules over a directory, with no lint config.',
    usage: 'polymorph check [dir] [--framework <name>] [--json]',
    flags: [
      {
        name: 'framework',
        value: 'name',
        summary: 'read every file in this framework instead of inferring each file’s',
      },
      { name: 'json', summary: 'print the report as JSON' },
    ],
    tools: [],
    needs: null,
  },
  {
    name: 'render',
    group: 'check',
    summary: 'Draw a screen spec in a browser, and report its layout faults beside the pictures.',
    usage:
      'polymorph render <spec.json> --system <name> [--palette <name>] [--mode <mode>] ' +
      '[--data <file>] [--empty <file>] [--viewports <list>] [--out <dir>] [--json]',
    flags: [
      { name: 'system', value: 'name', summary: 'a shipped system: `plain`, `journal`, …' },
      { name: 'palette', value: 'name', summary: 'a shipped palette; omitted, the system’s own' },
      { name: 'mode', value: 'mode', summary: '`light` or `dark`; omitted, the system’s default' },
      {
        name: 'data',
        value: 'file',
        summary: 'a JSON file with a value for each input: the populated screen',
      },
      {
        name: 'empty',
        value: 'file',
        summary: 'a JSON file laid over `--data` for a second drawing: the empty screen',
      },
      {
        name: 'viewports',
        value: 'list',
        summary: '`phone`, `desktop` or `phone,desktop` (default both)',
      },
      {
        name: 'out',
        value: 'dir',
        summary: 'where the pictures are written (default `<spec>.render/` beside the spec)',
      },
      JSON_FLAG,
    ],
    tools: ['render_screen'],
    needs: 'tools',
  },
  {
    name: 'diff',
    group: 'check',
    summary: 'List what you have changed in an install, and what has changed upstream.',
    usage: 'polymorph diff',
    flags: [],
    tools: [],
    needs: null,
  },
  {
    name: 'add',
    group: 'write',
    summary: 'Vendor members and themes, and extend the lint configs with the red rules.',
    usage: 'polymorph add <item...> [--dir <path>] [--framework <name>] [--force] [--dry-run]',
    flags: [
      DIR,
      INSTALL_FRAMEWORK,
      { name: 'force', summary: 'overwrite files you have edited' },
      { name: 'dry-run', summary: 'print the plan and write nothing' },
    ],
    tools: ['install'],
    needs: null,
  },
  {
    name: 'update',
    group: 'write',
    summary: 'Vendor again the files you have not edited, and keep the ones you have.',
    usage: 'polymorph update [--force]',
    flags: [{ name: 'force', summary: 'take upstream’s copy of files you have edited' }],
    tools: [],
    needs: null,
  },
  {
    name: 'fix',
    group: 'write',
    summary: 'Rewrite what has exactly one lawful rewrite in a file, and report the rest.',
    usage:
      'polymorph fix <file|-> [--dry-run] [--filename <name>] [--surface <name>] ' +
      '[--framework <name>] [--json]',
    flags: [
      { name: 'dry-run', summary: 'print the fixed code and write nothing' },
      {
        name: 'filename',
        value: 'name',
        summary: 'with `-`, the name the text read from stdin is fixed as',
      },
      SURFACE,
      CODE_FRAMEWORK,
      JSON_FLAG,
    ],
    tools: ['fix_file', 'fix'],
    needs: 'tools',
  },
  {
    name: 'emit',
    group: 'write',
    summary: 'Compile a screen spec to a file in the project, checked against the red rules.',
    usage: 'polymorph emit <spec.json> <out> [--framework <name>] [--json]',
    flags: [
      {
        name: 'framework',
        value: 'name',
        summary: 'the framework to emit for; omitted, the path’s extension and the project decide',
      },
      JSON_FLAG,
    ],
    tools: ['emit_screen'],
    needs: 'tools',
  },
  {
    name: 'theme propose',
    group: 'themes',
    summary: 'Turn plain words into a checked system and palette, and save them with `--save`.',
    usage:
      'polymorph theme propose "<intent>" [--based-on <system>/<palette>] [--save] ' +
      '[--dir <path>] [--overwrite] [--json]',
    flags: [
      {
        name: 'based-on',
        value: 'system>/<palette',
        summary: 'the shipped system and palette to start from; either half may be left out',
      },
      { name: 'save', summary: 'write the two documents into the project' },
      {
        name: 'dir',
        value: 'path',
        summary:
          'with `--save`, the directory holding `systems/` and `palettes/` (the tool’s default is `design`)',
      },
      { name: 'overwrite', summary: 'with `--save`, replace files already saved under the names' },
      JSON_FLAG,
    ],
    tools: ['propose_theme', 'save_theme'],
    needs: 'tools',
  },
  {
    name: 'theme validate',
    group: 'themes',
    summary: 'Check a system and a palette you wrote against the laws.',
    usage: 'polymorph theme validate <system.json> <palette.json> [partner.json]',
    flags: [],
    tools: [],
    needs: null,
  },
  {
    name: 'theme emit',
    group: 'themes',
    summary: 'Print the stylesheet a system and a palette you wrote emit, for handoff.',
    usage: 'polymorph theme emit <system.json> <palette.json> [partner.json] [--out <file>]',
    flags: [{ name: 'out', value: 'file', summary: 'write the sheet to a file' }],
    tools: [],
    needs: null,
  },
  {
    name: 'theme schema',
    group: 'themes',
    summary: 'Print the JSON Schema of a system or a palette document, for an editor.',
    usage: 'polymorph theme schema <system|palette> [--out <file>]',
    flags: [{ name: 'out', value: 'file', summary: 'write the schema to a file' }],
    tools: [],
    needs: null,
  },
  {
    name: 'mcp',
    group: 'agents',
    summary: 'Start the MCP server over stdio, for an agent’s client.',
    usage: 'polymorph mcp [--project <path>] [--read-only]',
    flags: [
      {
        name: 'project',
        value: 'path',
        summary: 'the repository the write tools write into (default this directory)',
      },
      { name: 'read-only', summary: 'start with no project, and so with no write tool' },
    ],
    tools: [],
    needs: 'server',
  },
]

/**
 * The verb a command line names, or `undefined`. A verb of two words
 * (`theme propose`) is named by its first two positional words.
 */
export function verbNamed(command: string | undefined, next: string | undefined): Verb | undefined {
  if (command === undefined) return undefined
  return (
    VERBS.find((verb) => verb.name === `${command} ${next ?? ''}`.trimEnd()) ??
    VERBS.find((verb) => verb.name === command)
  )
}

/** The usage up to its first flag: `polymorph check [dir]`. */
export const synopsis = (verb: Verb): string => verb.usage.split(/ \[?--/)[0] as string

/** A verb's own help: its usage, what it does, its flags, and the tools of the same job. */
export function verbHelp(verb: Verb): string {
  const flags = verb.flags.map((flag) => ({
    written: `--${flag.name}${flag.value === undefined ? '' : ` <${flag.value}>`}`,
    summary: flag.summary,
  }))
  const width = Math.max(0, ...flags.map((flag) => flag.written.length))
  const lines = [`usage: ${verb.usage}`, '', verb.summary]
  if (flags.length > 0) {
    lines.push('', ...flags.map((flag) => `  ${flag.written.padEnd(width)}  ${flag.summary}`))
  }
  if (verb.tools.length > 0) {
    const tools = verb.tools.map((tool) => `\`${tool}\``)
    lines.push(
      '',
      tools.length === 1
        ? `The MCP tool ${tools[0]} does the same job and gives the same answer.`
        : `The MCP tools ${tools.join(' and ')} do the same job and give the same answers.`,
    )
  }
  return lines.join('\n')
}
