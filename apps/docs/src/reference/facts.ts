/**
 * Facts the reference pages print whose sources the browser cannot import.
 *
 * `PUBLISHED_NAMES` and `PUBLISHED_REGISTRY` are exported by `@polymorph/registry`, whose entry
 * also exports the registry builder. The builder imports `node:fs`, `typescript` and `jiti`, so
 * importing the entry would put the TypeScript compiler in the page's chunk, and `node:fs` does
 * not load in a browser at all. The MCP server names its tools in `packages/mcp/src/server.ts`,
 * which imports the MCP SDK and `zod`. `src/llms.ts` reads files with `node:fs`.
 *
 * So the values are written here, and `facts.test.ts` holds each one equal to its source. A change
 * at the source fails that test until this file is updated, together with the install page's copy
 * that depends on it (`REGISTRY_ACCESS` below).
 */

/** Each published package, by the name an app imports, with the name it has at the registry. */
export const PUBLISHED_NAMES: Readonly<Record<string, string>> = {
  '@polymorph/engine': '@metamorph-labs/polymorph-engine',
  '@polymorph/react': '@metamorph-labs/polymorph-react',
  '@polymorph/react-ui': '@metamorph-labs/polymorph-react-ui',
  '@polymorph/recipes': '@metamorph-labs/polymorph-recipes',
  '@polymorph/rules': '@metamorph-labs/polymorph-rules',
  '@polymorph/solid': '@metamorph-labs/polymorph-solid',
  '@polymorph/solid-ui': '@metamorph-labs/polymorph-solid-ui',
  '@polymorph/svelte': '@metamorph-labs/polymorph-svelte',
  '@polymorph/svelte-ui': '@metamorph-labs/polymorph-svelte-ui',
  '@polymorph/vue': '@metamorph-labs/polymorph-vue',
  '@polymorph/vue-ui': '@metamorph-labs/polymorph-vue-ui',
  '@polymorph/angular': '@metamorph-labs/polymorph-angular',
  '@polymorph/angular-ui': '@metamorph-labs/polymorph-angular-ui',
  '@polymorph/elements': '@metamorph-labs/polymorph-elements',
  '@polymorph/elements-ui': '@metamorph-labs/polymorph-elements-ui',
}

/** The registry `polymorph init` points a new app at. The same names are public on npmjs.com. */
export const PUBLISHED_REGISTRY = 'https://npm.pkg.github.com'

/** The scope every published name is under, which an app's `.npmrc` points at the registry. */
export const PUBLISHED_SCOPE = (Object.values(PUBLISHED_NAMES)[0] ?? '').split('/')[0] as string

/**
 * What a reader needs before `polymorph init` can install a new app. The app it writes points
 * the scope at GitHub Packages (`packages/cli/src/init.ts`), which answers only a request with a
 * token, so the reader creates one once. An app that installs from npmjs.com needs none of this.
 * `facts.test.ts` fails when `PUBLISHED_REGISTRY` changes, so this block is revisited with it.
 */
export const REGISTRY_ACCESS = {
  /** The registry's name in a sentence. */
  host: 'GitHub Packages',
  /** The `.npmrc` an app needs. It names the token variable and never holds a token. */
  npmrc: `${PUBLISHED_SCOPE}:registry=${PUBLISHED_REGISTRY}\n${PUBLISHED_REGISTRY.replace(/^https?:/, '')}/:_authToken=\${NODE_AUTH_TOKEN}`,
  /** The commands that give the shell a token that can read the packages. */
  token: 'gh auth refresh -s read:packages\nexport NODE_AUTH_TOKEN=$(gh auth token)',
} as const

/** The bins a reader runs from a checkout. `facts.test.ts` checks that they exist. */
export const CLI_BIN = 'packages/cli/bin/polymorph.js'
export const MCP_BIN = 'packages/mcp/bin/polymorph-mcp.js'

/** The MCP server's tools that only read, in the server's order. */
export const MCP_READ_TOOLS = [
  'search_components',
  'get_component',
  'get_install_plan',
  'get_system_card',
  'get_theme_axes',
  'validate',
  'fix',
  'propose_theme',
  'render_screen',
] as const

/** The MCP server's tools that write into the project, in the server's order. */
export const MCP_WRITE_TOOLS = ['emit_screen', 'install', 'save_theme', 'fix_file'] as const

/** Where the site serves the plain-text files for agents (`src/llms.ts`). */
export const AGENT_FILES = {
  index: '/llms.txt',
  full: '/llms-full.txt',
  card: '/system-card.md',
} as const
