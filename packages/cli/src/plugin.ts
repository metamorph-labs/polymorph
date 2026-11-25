import { PUBLISHED_NAMES, TOOLS_PACKAGE, type Registry } from '@polymorph/registry'

import { commandLine } from './agents'
import type { Program } from './init-app'
import { SKILL_NAMES, skillFiles } from './skills'

/**
 * The repository's plugin for coding agents, as data: one plugin directory
 * that Claude Code and Codex both read, the two marketplaces that list it, and
 * the MCP Registry's entry for the published tools.
 *
 * `pnpm agents` (`scripts/agents.mjs`) writes these files, and
 * `plugin.test.ts` fails on any committed copy that differs. The skills are
 * `skills.ts`'s texts, so the plugin says what `polymorph agents` writes into
 * a project. Every file names the release the registry has, so a version bump
 * fails the law until `pnpm agents` runs.
 *
 * Two things differ from a project's copy, because a plugin is installed
 * apart from any one project:
 *
 * - **The tools are pinned to the release** (`@metamorph-labs/polymorph@1.0.17`),
 *   not ranged. Anthropic's directory refuses a launcher that runs a range, and
 *   the skills of one release name that release's verbs.
 * - **The plugin's MCP server reads only** (`--read-only`). A plugin's server
 *   is not started in a known project, so it offers no write tool; the skills
 *   write through the CLI, which runs in the shell's project.
 *
 * The plugin has no lifecycle hooks: a Codex plugin with hooks cannot be
 * listed in OpenAI's directory, and the project's own lint runs the red rules.
 */

/** One generated file, at its path from the repository's root. */
export interface PluginFile {
  path: string
  contents: string
}

/** Where the plugin is, from the repository's root. */
export const PLUGIN_DIR = 'plugins/polymorph'

/** The images the plugin carries, drawn from the site's favicon by `pnpm agents --icons`. */
export const PLUGIN_ICONS = {
  /** The favicon's shape with one fill and no stylesheet, which a directory's icon check requires. */
  svg: 'assets/icon.svg',
  /** 512 by 512, on a light surface and on a dark one. */
  logo: 'assets/logo.png',
  logoDark: 'assets/logo-dark.png',
  /** 128 by 128, for a composer's row. */
  icon: 'assets/icon.png',
  iconDark: 'assets/icon-dark.png',
} as const

/** The pixel size of each drawn image. */
export const ICON_SIZES: Readonly<Record<Exclude<keyof typeof PLUGIN_ICONS, 'svg'>, number>> = {
  logo: 512,
  logoDark: 512,
  icon: 128,
  iconDark: 128,
}

const REPOSITORY = 'https://github.com/metamorph-labs/polymorph'
const ON_MAIN = `${REPOSITORY}/blob/main`

/**
 * The publisher, as the licence names the copyright holder. The listings show
 * it, and the directories match it against the verified developer identity.
 */
export const PUBLISHER = { name: 'Metamorph, Inc.', url: 'https://github.com/metamorph-labs' }

/** The links a directory listing asks for. `PRIVACY.md` and `TERMS.md` are at the root of `main`. */
export const LISTING_URLS = {
  website: REPOSITORY,
  documentation: `${ON_MAIN}/docs/harnesses.md`,
  support: `${REPOSITORY}/issues`,
  privacy: `${ON_MAIN}/PRIVACY.md`,
  terms: `${ON_MAIN}/TERMS.md`,
}

/** The marketplace name both harnesses install the plugin from: `polymorph@metamorph-labs`. */
export const MARKETPLACE = 'metamorph-labs'

/** The name the plugin, its server and the MCP Registry entry share. */
export const PLUGIN_NAME = 'polymorph'

/** The MCP Registry's name for the server, which the published package declares as `mcpName`. */
export const MCP_NAME = 'io.github.metamorph-labs/polymorph'

const TOOLS_NAME = PUBLISHED_NAMES[TOOLS_PACKAGE] as string

/** The published tools at exactly the release: what the plugin's skills and server run. */
export function pinnedTools(registry: Registry): Program {
  return { command: 'npx', args: ['-y', `${TOOLS_NAME}@${registry.version}`] }
}

/** Listing text, within each format's limits (`plugin.test.ts` holds them). */
const TEXT = {
  displayName: 'Polymorph',
  shortDescription: 'Build UI with a design system',
  description:
    'Build interfaces with the Polymorph design system: skills for screens, red-rule ' +
    'violations, setup and themes, and an MCP server that reads the vocabulary, checks code ' +
    'and screen specs against the red rules, and draws a screen at phone and desktop width.',
  longDescription: [
    'Polymorph is an open-source design system: one closed vocabulary of interface components ' +
      'for React, Vue, Svelte, Solid, Angular and plain HTML, a theme engine, and lint rules ' +
      '(the red rules) that keep design decisions out of application code.',
    'This plugin gives a coding agent the procedures and the tools to work in an app built ' +
      'with it. Four skills cover building a screen, answering a red-rule violation by the ' +
      'exception ladder, adding polymorph to a project, and changing the theme. The MCP server ' +
      'returns the system card, finds members and reads their props, validates code and screen ' +
      'specs against the red rules with the lawful fix for each violation, draws a screen spec ' +
      'in a browser with the layout faults it measured, and proposes a theme from plain words.',
    'Everything runs on your machine through the published npm package ' +
      '@metamorph-labs/polymorph. Nothing is sent to Metamorph.',
  ].join('\n\n'),
  keywords: [
    'design-system',
    'ui',
    'components',
    'react',
    'vue',
    'svelte',
    'solid',
    'angular',
    'web-components',
    'eslint',
    'theming',
    'mcp',
    'agent-skills',
  ],
  capabilities: [
    'Read the system card and each component’s props',
    'Check code and screen specs against the red rules',
    'Draw a screen spec at phone and desktop width',
    'Propose a theme from plain words',
  ],
  defaultPrompt: [
    'Build a settings screen with polymorph.',
    'Fix the polymorph lint errors in this file.',
    'Make this polymorph app’s theme calmer and warmer.',
  ],
  serverDescription:
    'A design system for agents: its components, lint rules, screen specs and renderer.',
}

/**
 * The review cases OpenAI's directory asks of a plugin with an MCP server:
 * five a reviewer can run and three the plugin should decline. Each positive
 * case names the tools of the read-only server it answers with.
 */
const REVIEW = {
  positive: [
    {
      description: 'Find a component and read its props',
      prompt: 'Which polymorph component picks a date, and what props does it take?',
      tools_triggered: 'search_components, get_component',
      expected_behavior:
        'Names DatePicker and lists its props with their types and defaults, as the release’s ' +
        'registry gives them.',
    },
    {
      description: 'Check code against the red rules',
      prompt:
        'Check this React component against the polymorph rules: ' +
        'export const A = () => <div style={{ padding: 12 }} />',
      tools_triggered: 'validate',
      expected_behavior:
        'Reports polymorph/no-raw-styles at the style prop and names the lawful answer, a ' +
        'spacing prop on a layout member.',
    },
    {
      description: 'Write a screen spec and validate it',
      prompt:
        'Write a polymorph screen spec for an API keys page with a heading, a count of keys and a ' +
        'Create key button, and check that it is lawful.',
      tools_triggered: 'get_system_card, validate',
      expected_behavior:
        'Writes a polymorph-screen/1 spec of members the card lists and reports that it ' +
        'validates with no faults.',
    },
    {
      description: 'Draw a screen and read its layout faults',
      prompt:
        'Draw the API keys screen spec at phone and desktop width and tell me about any layout ' +
        'problems.',
      tools_triggered: 'render_screen',
      expected_behavior:
        'Returns a picture for each width and the layout faults measured in each, or says there ' +
        'are none.',
    },
    {
      description: 'Propose a theme from words',
      prompt: 'Propose a calmer, warmer polymorph theme based on journal/umber.',
      tools_triggered: 'propose_theme',
      expected_behavior:
        'Returns a system and a palette, says what each word moved and which words it did not ' +
        'use, and gives the theme laws’ verdict.',
    },
  ],
  negative: [
    {
      description: 'A request with no interface in it',
      prompt: 'Book me a flight to Lisbon next Tuesday.',
      expected_behavior:
        'Does not call the plugin’s tools; the request is not about a user interface.',
    },
    {
      description: 'Silencing a red rule',
      prompt: 'Add an eslint-disable comment so the polymorph rule stops failing in this file.',
      expected_behavior:
        'Declines to silence the rule and offers the exception ladder: a variant, a scope, a ' +
        'patch or a declared zone.',
    },
    {
      description: 'Another design system',
      prompt: 'Add Material UI buttons to this polymorph app.',
      expected_behavior:
        'Explains that a polymorph app composes its own members and offers Button, or a ' +
        'ThirdParty boundary with a reason when another library is required.',
    },
  ],
}

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`

/** Every generated text file of the plugin, the marketplaces and the registry entry. */
export function pluginFiles(registry: Registry): PluginFile[] {
  const version = registry.version
  const tools = pinnedTools(registry)
  const server = { command: tools.command, args: [...tools.args, 'mcp', '--read-only'] }
  const at = (path: string) => `${PLUGIN_DIR}/${path}`
  const icon = (path: string) => `./${path}`

  return [
    {
      path: '.claude-plugin/marketplace.json',
      contents: json({
        name: MARKETPLACE,
        owner: PUBLISHER,
        // `metadata.description` rather than `description`: Claude Code reads either, and
        // releases before the top-level field refuse a marketplace that has it.
        metadata: { description: 'The Polymorph design system’s plugin for coding agents.' },
        plugins: [
          {
            name: PLUGIN_NAME,
            source: `./${PLUGIN_DIR}`,
            description: TEXT.description,
            category: 'development',
            tags: TEXT.keywords,
          },
        ],
      }),
    },
    {
      path: '.agents/plugins/marketplace.json',
      contents: json({
        name: MARKETPLACE,
        interface: { displayName: 'Metamorph Labs' },
        plugins: [
          {
            name: PLUGIN_NAME,
            source: { source: 'local', path: `./${PLUGIN_DIR}` },
            policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
            category: 'Developer Tools',
          },
        ],
      }),
    },
    {
      path: at('.claude-plugin/plugin.json'),
      contents: json({
        name: PLUGIN_NAME,
        displayName: TEXT.displayName,
        version,
        description: TEXT.description,
        author: PUBLISHER,
        homepage: LISTING_URLS.website,
        repository: REPOSITORY,
        license: 'MIT',
        keywords: TEXT.keywords,
        icon: icon(PLUGIN_ICONS.logo),
        documentationUrl: LISTING_URLS.documentation,
        supportUrl: LISTING_URLS.support,
        privacyPolicyUrl: LISTING_URLS.privacy,
        termsOfServiceUrl: LISTING_URLS.terms,
        // What the plugin's parts reach: `npx` downloads the tools from npm's
        // registry the first time the server or a skill's command runs.
        network: { hosts: ['registry.npmjs.org'] },
      }),
    },
    {
      path: at('plugin.json'),
      contents: json({
        $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
        name: PLUGIN_NAME,
        version,
        description: TEXT.description,
        author: PUBLISHER,
        homepage: LISTING_URLS.website,
        repository: REPOSITORY,
        license: 'MIT',
        keywords: TEXT.keywords,
        extensions: {
          'com.openai': {
            // The skills run the CLI and the server is a local process, so the plugin needs a
            // desktop that runs commands.
            requires_local_executor: true,
            interface: {
              displayName: TEXT.displayName,
              shortDescription: TEXT.shortDescription,
              longDescription: TEXT.longDescription,
              developerName: PUBLISHER.name,
              category: 'Developer Tools',
              capabilities: TEXT.capabilities,
              websiteURL: LISTING_URLS.website,
              supportURL: LISTING_URLS.support,
              privacyPolicyURL: LISTING_URLS.privacy,
              termsOfServiceURL: LISTING_URLS.terms,
              defaultPrompt: TEXT.defaultPrompt,
              brandColor: '#111111',
              brandColorDark: '#F5F5F5',
              composerIcon: icon(PLUGIN_ICONS.icon),
              composerIconDark: icon(PLUGIN_ICONS.iconDark),
              logo: icon(PLUGIN_ICONS.logo),
              logoDark: icon(PLUGIN_ICONS.logoDark),
            },
            review: { test_cases: REVIEW },
          },
        },
      }),
    },
    { path: at('.mcp.json'), contents: json({ mcpServers: { [PLUGIN_NAME]: server } }) },
    {
      path: at('mcp.json'),
      contents: json({
        $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
        mcpServers: { [PLUGIN_NAME]: { type: 'stdio', ...server } },
      }),
    },
    ...skillFiles(registry, commandLine(tools)).map((file) => ({
      path: at(`skills/${file.path}`),
      contents: file.contents,
    })),
    { path: at('README.md'), contents: readme(registry, commandLine(tools), commandLine(server)) },
    {
      path: 'packages/tools/server.json',
      contents: json({
        $schema: 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json',
        name: MCP_NAME,
        title: TEXT.displayName,
        description: TEXT.serverDescription,
        websiteUrl: LISTING_URLS.website,
        repository: { url: REPOSITORY, source: 'github', subfolder: 'packages/tools' },
        version,
        icons: [
          {
            src: `https://raw.githubusercontent.com/metamorph-labs/polymorph/main/${PLUGIN_DIR}/${PLUGIN_ICONS.logo}`,
            mimeType: 'image/png',
            sizes: [`${ICON_SIZES.logo}x${ICON_SIZES.logo}`],
          },
        ],
        packages: [
          {
            registryType: 'npm',
            registryBaseUrl: 'https://registry.npmjs.org',
            identifier: TOOLS_NAME,
            version,
            transport: { type: 'stdio' },
            packageArguments: [{ type: 'positional', value: 'mcp' }],
          },
        ],
      }),
    },
  ]
}

/**
 * The plugin's README: what it is, what it runs and fetches, and how to
 * install it. Anthropic's directory shows it as the listing's description and
 * reads it for what the plugin runs, sends and fetches.
 */
function readme(registry: Registry, run: string, server: string): string {
  const skills = SKILL_NAMES.map((name) => `- \`${name}\``).join('\n')
  return `# Polymorph for coding agents

Polymorph is an open-source design system: one closed vocabulary of interface components for
React, Vue, Svelte, Solid, Angular and plain HTML, a theme engine, and lint rules (the red rules)
that keep design decisions out of application code. This plugin gives Claude Code and Codex what
they need to build with it in your app: four skills and an MCP server.

<!-- Every file in this directory is written by \`pnpm agents\` from packages/cli/src/plugin.ts and
     packages/cli/src/skills.ts in the polymorph repository. Edit those, not these. -->

## Skills

${skills}

Each skill is a procedure with the exact commands: building a screen and checking it, answering a
red-rule violation by the exception ladder, adding polymorph to a project, and changing the theme.

## What it runs

The skills and the server run the published tools of release ${registry.version}, the npm package
\`${TOOLS_NAME}\`:

\`\`\`sh
${run} card
${server}
\`\`\`

The first run downloads the package and its dependencies from npmjs.com with \`npx\`, which can
take longer than a client waits for a server to start. Run the first command once with \`--help\`
to have the package ready; Claude Code also waits longer when \`MCP_TIMEOUT\` is set, in
milliseconds. A client on native Windows that cannot start \`npx\` runs it as \`cmd /c npx\` with
the same arguments. The server starts with \`--read-only\`: it reads the vocabulary, validates code and screen specs, draws
screens and proposes themes, and writes no file. The skills write through the CLI, in the project
the shell is in. Drawing a screen needs a Chromium that Playwright downloads; when it is missing,
the tools answer with the command that downloads it, and download nothing themselves.

Nothing is sent to Metamorph, and the tools collect nothing. See
[PRIVACY.md](${LISTING_URLS.privacy}) and [TERMS.md](${LISTING_URLS.terms}).

## Install

Claude Code:

\`\`\`sh
claude plugin marketplace add metamorph-labs/polymorph
claude plugin install ${PLUGIN_NAME}@${MARKETPLACE}
\`\`\`

Codex:

\`\`\`sh
codex plugin marketplace add metamorph-labs/polymorph
\`\`\`

Then install Polymorph from the Metamorph Labs marketplace under \`/plugins\`.

Any harness that reads Agent Skills:

\`\`\`sh
npx skills add metamorph-labs/polymorph
\`\`\`

In a project of your own, \`${run} agents\` writes the same skills, an \`AGENTS.md\`
block and the MCP entries for Claude Code, Codex and Cursor, with a server that writes into the
project. [docs/harnesses.md](${LISTING_URLS.documentation}) says what each harness reads.

## Licence

MIT. See [LICENSE](${ON_MAIN}/LICENSE).
`
}
