import type { ToolAnswer } from '@polymorph/cli'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ShapeOutput, ZodRawShapeCompat } from '@modelcontextprotocol/sdk/server/zod-compat.js'
import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'

import {
  emitScreen,
  EscapingDirError,
  fix,
  fixFile,
  FrameworkMismatchError,
  getComponent,
  getInstallPlan,
  getSystemCard,
  getThemeAxes,
  FRAMEWORKS,
  install,
  PLATFORMS,
  proposeTheme,
  RefusedWriteError,
  renderScreen,
  saveTheme,
  ScreenUnavailableError,
  searchComponents,
  UnfinishedInstallError,
  UnknownComponentError,
  UnknownItemError,
  UnshippedMemberError,
  validate,
  VIEWPORTS,
  vocabulary,
  type ToolContext,
} from './tools'

/**
 * `@polymorph/mcp`: the protocol wiring, and nothing else.
 *
 * One table of tools (`TOOLS`): thirteen names, thirteen argument schemas,
 * and the function each calls. Every answer comes from `tools.ts`, and nothing
 * in this file knows what a component is. `createServer` registers the table
 * with the SDK and writes each answer as text, and `toolCaller` (`oneshot.ts`)
 * calls the same table by name for a command line, so the two cannot differ.
 * This is the thin-front rule applied one level down. If the protocol handlers
 * could compute answers, they would, and the registry would stop being
 * canonical inside its own front.
 *
 * **Stdio only.** This is a local package a consumer runs against their own
 * repository. It works with every MCP client immediately, with no hosting and
 * no auth. A hosted HTTP variant would be a separate decision. `createServer`
 * therefore returns a server with no transport attached: `bin/polymorph-mcp.js`
 * connects stdio, and the tests connect an in-memory pair. Nothing here
 * mentions a port.
 *
 * **Every tool declares its effect on a repository** through its annotations.
 * A client shows them to a user deciding whether to approve a call, and many
 * clients run a `readOnlyHint` tool without asking. Nine tools read and say
 * so. Four write, into the project the server was started for and nowhere
 * else, and each says which kind of write it is. A server with no project
 * registers only the nine, so it is exactly the read-only server its
 * annotations describe.
 */

/**
 * Read-only, non-destructive, no side effects. True of the nine that read.
 * `render_screen` runs a browser to answer, and the browser writes no file and
 * reaches no network, so the same three words are true of it.
 */
const READS = { readOnlyHint: true, destructiveHint: false, idempotentHint: true } as const

/**
 * Writes files into the project, and only ever adds: new files, new lines in
 * the project's own configuration. A file somebody has edited is kept.
 */
const ADDS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const

/**
 * Writes files into the project and can replace an existing one: an earlier
 * emit, a theme file the caller said to overwrite, or a source file a fix
 * rewrote. Marked destructive because replacing a file is destructive, however
 * narrow the conditions. The client decides how much confirmation that needs,
 * and it can only decide well if it is told.
 */
const REPLACES = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
} as const

/** An answer, as data. The server writes it as text, and the one-shot caller returns it. */
const answered = (value: unknown): ToolAnswer => ({ value, images: [], isError: false })

/**
 * An expected failure, reported as a tool error instead of thrown.
 *
 * "No component called Modal — did you mean Dialog?" is an *answer*: the agent
 * should read it and try again. A thrown exception would surface as a protocol
 * error, which most clients show as a broken tool instead of a correction, and
 * the agent would stop asking.
 */
const refused = (message: string): ToolAnswer => ({ value: message, images: [], isError: true })

/**
 * The failures a write tool is expected to have: no project, a path that
 * leaves it, a file that belongs to somebody, a name the registry does not
 * have, or an install that stopped at a config it cannot edit. Each is a
 * sentence written for an agent to act on. Anything else is rethrown, and the
 * SDK reports it as a tool error too, in the exception's own words.
 */
const refusal = (error: unknown): ToolAnswer => {
  if (
    error instanceof RefusedWriteError ||
    error instanceof EscapingDirError ||
    error instanceof UnknownItemError ||
    error instanceof UnfinishedInstallError ||
    error instanceof UnshippedMemberError ||
    error instanceof FrameworkMismatchError
  ) {
    return refused(error.message)
  }
  throw error
}

/** One description for every tool that takes a platform, so they say the same thing. */
const PLATFORM_ARGUMENT = z
  .enum(PLATFORMS)
  .optional()
  .describe(
    'The platform you are building for; `web` when omitted. Members with no rendering there are ' +
      'left out, and the card says how an adapted member renders.',
  )

/** How a prop reads in each framework, for every argument that names one. */
const PROP_READING =
  'A prop keeps its name in each: in Vue `onFoo` is the event `@foo` and a node-typed prop the ' +
  'slot of that name; in Svelte a node-typed prop is a snippet of that name; in Solid it takes ' +
  'a `JSX.Element`; in Angular a prop is an input, `onFoo` the output `(foo)`, and a ' +
  'node-typed prop content marked `slot="foo"`. In elements a member is `<poly-button>`, a ' +
  'prop its kebab-case attribute (data as JSON), `onFoo` the event `poly-foo`, a node-typed ' +
  'prop a child marked `slot="foo"`, and a function a property set from script ' +
  '(docs/frameworks.md).'

/** The framework of the tools that answer about the vocabulary. */
const FRAMEWORK_ARGUMENT = z
  .enum(FRAMEWORKS)
  .optional()
  .describe(
    'The web framework you are writing for; `react` when omitted. For `vue`, `svelte`, ' +
      '`solid`, `angular` or `elements`, members with no shell there are left out, with the ' +
      'reason. ' +
      PROP_READING,
  )

/**
 * A screen spec as `validate`, `render_screen` and `emit_screen` take it: the
 * document as an object, or its JSON text (`submittedDocument`).
 */
const SPEC = z.union([z.string(), z.record(z.string(), z.unknown())])

/**
 * The framework of the tools that read code or a spec: `validate`, `fix`,
 * `fix_file` and `emit_screen`. Omitted, each asks the project through one
 * function (`codeFrameworkOf`), so they read one fragment or spec alike.
 */
const CODE_FRAMEWORK_ARGUMENT = z
  .enum(FRAMEWORKS)
  .optional()
  .describe(
    'The web framework the code or spec is written in; a member with no shell there is ' +
      'refused, with the reason. Omitted, `validate`, `fix`, `fix_file` and `emit_screen` ' +
      'read it the same way: a `.vue` or `.svelte` file names its own, and so does an ' +
      'emitted screen’s `.ts` path (Angular); a `.html` file is an elements page in a project ' +
      'that uses the elements (its polymorph.json or package.json says so) and not Angular, ' +
      'and an Angular template otherwise; TSX and a web spec are Solid’s in a project ' +
      'whose package depends on `@polymorph/solid-ui` and not `@polymorph/react-ui`, so a ' +
      'rewritten `<button>` imports from there; for `fix_file`, a `.ts` module in a package ' +
      'that depends on `@polymorph/angular-ui` is an Angular component, its inline template ' +
      'read; otherwise React. A fragment for Vue, Svelte or Angular names its framework. The ' +
      'red rules do not read an elements page, and the answer says so; a spec is checked ' +
      'against the elements, and `emit_screen` refuses them. ' +
      PROP_READING,
  )

/** The framework of an install: the project's recorded one when omitted, and refused when it differs. */
const INSTALL_FRAMEWORK_ARGUMENT = z
  .enum(FRAMEWORKS)
  .optional()
  .describe(
    'The web framework whose members are vendored: `vue`, `svelte`, `solid` or `angular` ' +
      'vendors that vocabulary’s components. `elements` vendors none, because a page loads ' +
      'every element from the files `polymorph init --framework elements` copies; a theme ' +
      'joins its theme sheet. Omitted, it is the framework the project’s polymorph.json ' +
      'records, or `react`; one that differs from the recorded one is refused.',
  )

const READ_INSTRUCTIONS =
  'Polymorph is a design system where style is not a call-site decision. Application code ' +
  'composes components and binds content. It may not express a colour, a spacing, a raw ' +
  'interactive element or any motion. Call `get_system_card` first: it holds the whole ' +
  'vocabulary in one read. Call `search_components` with `platform` to find a member that ' +
  'exists on the platform you build for. Call `validate` on code or a screen spec before you ' +
  'return it. It returns the repository’s own lint diagnostics, and each one names its fix or ' +
  'the exception-ladder rung to climb. `fix` applies every fix that has exactly one lawful ' +
  'rewrite and returns the code. Call `render_screen` on a spec `validate` accepts to see ' +
  'the screen: it is drawn in a browser at a phone width and a desktop width, and its layout ' +
  'faults come back as data beside the pictures.'

const WRITE_INSTRUCTIONS =
  ' Four tools write into the project. Each refuses anything unlawful and reports what it ' +
  'wrote. `emit_screen` compiles a screen spec that `validate` accepts to a React or Solid ' +
  'TSX file, a Vue or Svelte single-file component or an Angular standalone component, or ' +
  'to a SwiftUI or Compose file for a spec whose platform is `ios` or `android`, so a screen ' +
  'is a checked spec and not typed code. `install` vendors components and themes as ' +
  '`polymorph add` does. `save_theme` writes the system and palette `propose_theme` ' +
  'returned. `fix_file` applies `fix` to a file in the project, so you do not send its ' +
  'contents.'

/**
 * One tool: its name, the schema of its arguments, what it declares about its
 * effect, and the function that answers it.
 *
 * The table below is the only list of tools. `createServer` registers each
 * entry with the SDK, and `toolCaller` (`oneshot.ts`) calls the same entry by
 * name outside the protocol, so a tool answers a client and a command line
 * with one function under one schema.
 */
export interface ToolEntry {
  name: (typeof TOOL_NAMES)[number]
  /** Writes into the project, so only a server or a caller that has a project offers it. */
  writes: boolean
  title: string
  description: string
  inputSchema: ZodRawShapeCompat
  annotations: ToolAnnotations
  answer: (context: ToolContext, args: Record<string, unknown>) => ToolAnswer | Promise<ToolAnswer>
}

/** An entry whose `answer` is typed by its own schema, as `registerTool` types a callback. */
function tool<Shape extends ZodRawShapeCompat>(entry: {
  name: ToolEntry['name']
  writes?: true
  title: string
  description: string
  inputSchema: Shape
  annotations: ToolAnnotations
  answer: (context: ToolContext, args: ShapeOutput<Shape>) => ToolAnswer | Promise<ToolAnswer>
}): ToolEntry {
  return { ...entry, writes: entry.writes === true, answer: entry.answer as ToolEntry['answer'] }
}

/** Every tool, in the order a server lists them: the nine that read, then the four that write. */
export const TOOLS: readonly ToolEntry[] = [
  tool({
    name: 'search_components',
    title: 'Search components',
    description:
      'Find vocabulary members by name, purpose, prop or variant. Omit the query to list the ' +
      'catalogue. Every hit says what it matched on, so a near miss is visibly a near miss. ' +
      'Pass `platform` to leave out the members absent on it, and `framework` (`vue`, ' +
      '`svelte`, `solid`, `angular` or `elements`) to leave out the members with no shell ' +
      'in that framework.',
    inputSchema: {
      query: z.string().optional().describe('A name, a concept, a prop, or a variant value.'),
      tier: z
        .enum(['icon', 'layout', 'controls', 'overlays', 'structure', 'charts', 'ai', 'archetypes'])
        .optional(),
      origin: z
        .enum(['installed', 'vendored'])
        .optional()
        .describe(
          '`installed` ships in `@polymorph/react` and is upgraded by semver; `vendored` is ' +
            'copied and owned.',
        ),
      platform: PLATFORM_ARGUMENT,
      framework: FRAMEWORK_ARGUMENT,
      limit: z.number().int().min(1).max(200).optional(),
    },
    annotations: READS,
    answer: (context, args) => answered(searchComponents(context, args)),
  }),
  tool({
    name: 'get_component',
    title: 'Get a component',
    description:
      'One component: its prop surface with printed types, its lawful variant × tone cells, the ' +
      'states its fixture renders, the `data-*` attributes it surfaces, and its dependencies. ' +
      'Pass `source: true` for the actual files.',
    inputSchema: {
      name: z.string().describe('`DatePicker`, `date-picker` and `datepicker` all work.'),
      source: z
        .boolean()
        .optional()
        .describe('Include the component, stylesheet and fixture source. Off by default.'),
    },
    annotations: READS,
    answer: (context, args) => {
      try {
        return answered(getComponent(context, args))
      } catch (error) {
        if (error instanceof UnknownComponentError) return refused(error.message)
        throw error
      }
    },
  }),
  tool({
    name: 'get_install_plan',
    title: 'Get an install plan',
    description:
      'What `polymorph add <items>` would copy: the full file closure, the packages and version ' +
      'ranges to install, and the webfonts a theme needs. Writes nothing — `install` applies ' +
      'the same plan. Items are component names, the exception ladder’s primitives (`bespoke`, ' +
      '`density-scope`, `tone-scope` — the rungs `validate` sends you to, as vendored source), ' +
      '`theme:<system>` (the system, the palette it declares and its fonts) or ' +
      '`palette:<name>` (a colour voice alone, wearable on any installed system).',
    inputSchema: {
      items: z
        .array(z.string())
        .min(1)
        .describe('`["button", "dialog", "bespoke", "theme:pastel", "palette:orchid"]`.'),
      dir: z.string().optional().describe('Where vendored source would land.'),
      framework: INSTALL_FRAMEWORK_ARGUMENT,
    },
    annotations: READS,
    answer: (context, args) => {
      try {
        return answered(getInstallPlan(context, args))
      } catch (error) {
        if (
          error instanceof UnknownItemError ||
          error instanceof UnshippedMemberError ||
          error instanceof FrameworkMismatchError
        ) {
          return refused(error.message)
        }
        throw error
      }
    },
  }),
  tool({
    name: 'get_system_card',
    title: 'Get the system card',
    description:
      'The whole vocabulary compressed for a context window: every component with its purpose ' +
      'and lawful cells, the token and axis catalogue, the red rules and the exception ladder, ' +
      'and what each platform renders natively, adapts or lacks. Read this first — it is a few ' +
      'thousand tokens and answers most questions outright. Pass `platform` for the vocabulary ' +
      'as it exists on one platform, and `framework` for a Vue, Svelte, Solid, Angular or ' +
      'elements app.',
    inputSchema: { platform: PLATFORM_ARGUMENT, framework: FRAMEWORK_ARGUMENT },
    annotations: READS,
    answer: (context, args) => answered(getSystemCard(context, args)),
  }),
  tool({
    name: 'get_theme_axes',
    title: 'Get the theme axes',
    description:
      'The parameter space: the eight design axes and their values, which the emitter exposes ' +
      'to recipes, the shipped systems with their axis assignments and default palette, the ' +
      'palettes with their colour seeds, the colour roles and the token scales. A theme is one ' +
      'system paired with one palette, and every palette is lawful on every system.',
    inputSchema: {
      customProperties: z
        .boolean()
        .optional()
        .describe('Include every `--pm-*` property a theme emits. Long; off by default.'),
      tokenValues: z
        .boolean()
        .optional()
        .describe(
          'Include each system’s token values: what every colour, space, radius, type-size, ' +
            'size and duration token is worth with its default palette. Long; off by default.',
        ),
    },
    annotations: READS,
    answer: (context, args) => answered(getThemeAxes(context, args)),
  }),
  tool({
    name: 'validate',
    title: 'Validate code against the red rules',
    description:
      'Submit code, get the red-rule violations the repository’s own lint run would report — the ' +
      'same diagnostics, from the same rules — each with the exception-ladder rung that answers ' +
      'it. A rule the groups report as a warning (the usage rules) comes back in `warnings`, ' +
      'apart from `violations`, and does not make `ok` false. ' +
      'The code is parsed, never executed. Or submit a screen spec and get it checked ' +
      'against the vocabulary: does the component exist and render on the spec’s `platform`, ' +
      'does the prop exist, is the variant × tone cell lawful, is the exception declared at the ' +
      'right rung — and, with `framework`, does that framework’s vocabulary ship it. Use it ' +
      'before handing anything back.',
    inputSchema: {
      code: z
        .string()
        .optional()
        .describe(
          'TSX, a Vue or Svelte single-file component, an Angular component module, or CSS. ' +
            'A fragment is fine; with `framework: "vue"`, markup with no block is linted as a ' +
            'template, with `framework: "svelte"` markup is linted as a component, with ' +
            '`framework: "solid"` TSX is linted as Solid’s, and with `framework: "angular"` ' +
            'TypeScript is linted as a component module, its inline template included, and ' +
            'markup as a component’s template.',
        ),
      spec: SPEC.optional().describe(
        'A screen spec: the document itself as an object, or its JSON text. Checked against ' +
          'the registry rather than linted.',
      ),
      filename: z
        .string()
        .optional()
        .describe(
          'Where to pretend it lives. Several rules ask where a file sits, so a fragment ' +
            'linted from nowhere escapes them. A `.css` name routes to Stylelint.',
        ),
      surface: z
        .enum(['application', 'vocabulary'])
        .optional()
        .describe(
          '`application` (the default) is a screen: no style decisions, no raw interactive ' +
            'elements, no motion. `vocabulary` is a component: style decisions are its job, but ' +
            'it may only spell them as tokens and may not reach past the install boundary.',
        ),
      framework: CODE_FRAMEWORK_ARGUMENT,
    },
    annotations: READS,
    answer: async (context, args) => answered(await validate(context, args)),
  }),
  tool({
    name: 'fix',
    title: 'Fix code against the red rules',
    description:
      'Submit code, get it back with every red-rule violation that has exactly one lawful ' +
      'rewrite already rewritten: a `className` or `style` on a component that ignores it is ' +
      'removed, a `lucide-react` glyph becomes `<Icon name="…">` where the role map names ' +
      'it, a `<button>` whose content is its text becomes `<Button label="…">`. These are ' +
      'the rules’ own fixes — the ones `eslint --fix` applies — and a fix carries everything ' +
      'on an element across or leaves it alone, so a glyph with a `size` or a button with a ' +
      '`className` is reported, not rewritten. What it cannot fix are decisions, and those ' +
      'come back as `validate` reports them, each with its exception-ladder rungs. A ' +
      'stylesheet is reported and never rewritten. Writes nothing; `fix_file` does the same ' +
      'to a file in the project.',
    inputSchema: {
      code: z
        .string()
        .describe(
          'TSX, a Vue or Svelte single-file component, an Angular component module or ' +
            'template, or CSS. A fragment is fine, read as `validate` reads it.',
        ),
      filename: z
        .string()
        .optional()
        .describe(
          'Where to pretend it lives, as for `validate`. A `.css` name routes to Stylelint.',
        ),
      surface: z
        .enum(['application', 'vocabulary'])
        .optional()
        .describe('`application` (the default) is a screen; `vocabulary` is a component.'),
      framework: CODE_FRAMEWORK_ARGUMENT,
    },
    annotations: READS,
    answer: async (context, args) => answered(await fix(context, args)),
  }),
  tool({
    name: 'propose_theme',
    title: 'Propose a theme',
    description:
      'Describe an intent — "calmer, more editorial, warmer paper" — and get a complete ' +
      'candidate system and palette back as JSON, plus the verdict from actually resolving the ' +
      'pair through the theme engine. The tool owns a projection table and nothing else: each ' +
      'word maps to bounded moves along the axes and seeds, applied in the order you wrote ' +
      'them, so a later word wins a contradiction. Words it does not have come back in ' +
      '`unmapped` rather than being guessed at. It writes no files — land a proposal with ' +
      '`save_theme`, or by pasting it into the workbench studio. The ' +
      `vocabulary is: ${vocabulary().join(', ')}.`,
    inputSchema: {
      intent: z
        .string()
        .min(1)
        .describe('Plain words. Every one it recognises is reported with what it moved.'),
      basedOn: z
        .object({
          system: z.string().optional().describe('A shipped system to start the axes from.'),
          palette: z.string().optional().describe('A shipped palette to start the seeds from.'),
        })
        .optional()
        .describe(
          'Where to start. Omitted, the proposal starts from the first designed system in the ' +
            'catalogue and the palette it declares.',
        ),
    },
    annotations: READS,
    answer: (context, args) => answered(proposeTheme(context, args)),
  }),
  tool({
    name: 'render_screen',
    title: 'Render a screen',
    description:
      'See a screen spec drawn. The spec is rendered in a real browser with the real ' +
      'components, under the system and palette you name, at a phone width (375px) and a ' +
      'desktop width (1440px). The answer is JSON followed by one PNG for each view. The ' +
      'JSON lists the layout faults measured in the page: `sideways-scroll` (the page or a ' +
      'region scrolls sideways), `clipped-text` (text cut by its box with no ellipsis, or ' +
      'drawn outside it), `small-target` (a control under the 24px touch-target floor with ' +
      'another control beside it), `cut-off` (text or a control hidden where nothing ' +
      'scrolls to it), `no-gap` (a member touching another member with no space between ' +
      'them, or its border against the inside of a box’s border) and `unseen-focus` (a ' +
      'control whose keyboard focus mark is missing, under 2px, under 3:1 against what it ' +
      'is drawn on, or cut). Each names the element and the numbers. A spec holds no data, ' +
      'so pass `data` to see the screen populated and `empty` to see it with nothing in it; with ' +
      'neither, each input is sampled from its type (a string is its own name, a list is ' +
      'empty) and the answer says how every input was filled. Callbacks are always stubs. ' +
      'The spec is checked as `validate` checks one, and an unlawful spec is not drawn. ' +
      'Writes nothing. It needs Playwright’s Chromium and says how to install it when it ' +
      'is missing.',
    inputSchema: {
      spec: SPEC.describe(
        'A web screen spec, as an object or as JSON text: what `validate` accepts.',
      ),
      system: z
        .string()
        .describe('A shipped system, as `get_theme_axes` lists them: `plain`, `journal`, …'),
      palette: z
        .string()
        .optional()
        .describe('A shipped palette. Omitted, the palette the system declares.'),
      mode: z
        .enum(['light', 'dark'])
        .optional()
        .describe('Omitted, the mode the system declares as its default.'),
      data: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(
          'The populated screen: a JSON value for each input, by input name, in the shape ' +
            'the input’s type declares. `{"tickets": [{"id": "T-1", "subject": "…"}]}`. An ' +
            'input left out is sampled from its type.',
        ),
      empty: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(
          'The empty screen: values laid over `data` for a second drawing. ' +
            '`{"tickets": []}` draws the screen with no rows, beside the populated one.',
        ),
      viewports: z
        .array(z.enum(VIEWPORTS))
        .min(1)
        .optional()
        .describe('Which widths to draw. Omitted, both.'),
    },
    annotations: READS,
    answer: async (context, args) => {
      try {
        const { answer, images } = await renderScreen(context, args)
        return {
          value: answer,
          images: images.map((png) => ({ data: png, mediaType: 'image/png' })),
          isError: false,
        }
      } catch (error) {
        // No browser, or no page to draw in. The message says what to run.
        if (error instanceof ScreenUnavailableError) return refused(error.message)
        throw error
      }
    },
  }),
  tool({
    name: 'emit_screen',
    writes: true,
    title: 'Emit a screen',
    description:
      'Compile a screen spec to a TSX file in the project, to Solid TSX with ' +
      '`framework: "solid"` or in a project that uses `@polymorph/solid-ui` and not ' +
      '`@polymorph/react-ui`, to a Vue or Svelte single-file component with that `framework` ' +
      'or a `.vue` or `.svelte` path, or to an Angular standalone component with ' +
      '`framework: "angular"` or a `.ts` path. A spec whose `platform` is `ios` compiles ' +
      'to a `.swift` file instead, and one whose `platform` is `android` to a `.kt` file: a ' +
      'model, an actions record and a stateless SwiftUI or Compose view built from the ' +
      'platform’s members (design/native/screen-contract.md); a member the platform does not ' +
      'draw is a fault, and `framework` is refused. `framework: "elements"` is refused: HTML ' +
      'has no way to bind a screen’s callbacks and node renderers. The spec is ' +
      'checked exactly as `validate` checks one, and an unlawful spec writes nothing and ' +
      'comes back with its faults. A lawful one lands as a presentational component — ' +
      'composition and bindings only, formatted by the project’s Prettier config (a native ' +
      'file by the emitter’s own layout), and held to every red rule (for a native file, to ' +
      'the native contract’s law) before it is written — so the screen is never typed out by ' +
      'hand. The answer names the `language` written. Replaces a file only when that file is ' +
      'itself an emitted screen, hand edits to it included; state and handlers belong in a ' +
      'container that renders it, or in the app’s store for a native screen.',
    inputSchema: {
      spec: SPEC.describe(
        'A screen spec, as an object or as JSON text — the argument `validate` takes.',
      ),
      path: z
        .string()
        .describe(
          'Where the file lands, relative to the project root. Ends in `.tsx` (React or ' +
            'Solid), `.vue` for Vue, `.svelte` for Svelte, `.ts` for Angular, `.swift` for a ' +
            'spec whose platform is `ios`, or `.kt` for one whose platform is `android`.',
        ),
      framework: CODE_FRAMEWORK_ARGUMENT,
    },
    annotations: REPLACES,
    answer: async (context, args) => {
      try {
        return answered(await emitScreen(context, args))
      } catch (error) {
        return refusal(error)
      }
    },
  }),
  tool({
    name: 'install',
    writes: true,
    title: 'Install components and themes',
    description:
      'Run `polymorph add <items>` in the project: vendor the components’ full file closure, ' +
      'record every file in the install manifest, add the packages to `package.json` and ' +
      'extend the project’s ESLint and Stylelint configs so the red rules govern its ' +
      'application code. A theme also adds the pre-paint script to `index.html` and one ' +
      'import to the app entry. It is `get_install_plan`’s plan, applied — same items, same ' +
      '`dir`. A file the install did not put there, or one the project has edited since, is ' +
      'kept and named, never overwritten. It does not run a package manager.',
    inputSchema: {
      items: z
        .array(z.string())
        .min(1)
        .describe('`["button", "dialog", "bespoke", "theme:pastel", "palette:orchid"]`.'),
      dir: z.string().optional().describe('Where vendored source lands. Default `src/polymorph`.'),
      framework: INSTALL_FRAMEWORK_ARGUMENT,
    },
    annotations: ADDS,
    answer: (context, args) => {
      try {
        return answered(install(context, args))
      } catch (error) {
        return refusal(error)
      }
    },
  }),
  tool({
    name: 'save_theme',
    writes: true,
    title: 'Save a theme',
    description:
      'Land a system and a palette as two JSON files in the project — the two documents ' +
      '`propose_theme` returns, as returned or edited since. The pair is admitted through the ' +
      'theme engine again before anything is written: an unlawful pair writes nothing and ' +
      'comes back with the laws’ own sentences. Files land at `<dir>/systems/<name>.json` and ' +
      '`<dir>/palettes/<name>.json`. A file already there under that name is reported, not ' +
      'replaced, unless `overwrite` is true. A palette that names a `moreContrast` partner is ' +
      'admitted with the partner saved in `<dir>/palettes`, so save the partner first. The ' +
      'answer lists the font packages the system needs and what to add to the build.',
    inputSchema: {
      system: z
        .record(z.string(), z.unknown())
        .describe('A system document: name, axes, fonts, defaultPalette, defaultMode.'),
      palette: z
        .record(z.string(), z.unknown())
        .describe('A palette document: name, accentHue, neutralTint, chromaBudget.'),
      dir: z
        .string()
        .optional()
        .describe('The directory holding `systems/` and `palettes/`. Default `design`.'),
      overwrite: z
        .boolean()
        .optional()
        .describe('Replace a file already saved under the same name. Off by default.'),
    },
    annotations: REPLACES,
    answer: (context, args) => {
      try {
        return answered(saveTheme(context, args))
      } catch (error) {
        return refusal(error)
      }
    },
  }),
  tool({
    name: 'fix_file',
    writes: true,
    title: 'Fix a file against the red rules',
    description:
      'Apply `fix` to a file in the project, where it stands: the file is read, every ' +
      'red-rule violation with exactly one lawful rewrite is rewritten, and the file is ' +
      'written back if anything changed. The code never passes through the conversation, so ' +
      'call it after you edit a file. Changes only what a fix changes — no formatting, ' +
      'nothing a rule did not report — and answers with how many reports each rule’s fixes ' +
      'answered and the violations that are left, which are decisions, each with its rungs. ' +
      'A file that does not parse is not touched.',
    inputSchema: {
      path: z
        .string()
        .describe(
          'The file, relative to the project root: TypeScript or JavaScript source, a `.vue` ' +
            'or `.svelte` component, an Angular `.html` template, or a `.css` file.',
        ),
      surface: z
        .enum(['application', 'vocabulary'])
        .optional()
        .describe('`application` (the default) is a screen; `vocabulary` is a component.'),
      framework: CODE_FRAMEWORK_ARGUMENT,
    },
    annotations: REPLACES,
    answer: async (context, args) => {
      try {
        return answered(await fixFile(context, args))
      } catch (error) {
        return refusal(error)
      }
    },
  }),
]

/** A tool's answer as the protocol carries it: the value as text, then each image in base64. */
export function encoded(answer: ToolAnswer): CallToolResult {
  return {
    ...(answer.isError ? { isError: true } : {}),
    content: [
      {
        type: 'text' as const,
        text:
          typeof answer.value === 'string' ? answer.value : JSON.stringify(answer.value, null, 2),
      },
      ...answer.images.map((image) => ({
        type: 'image' as const,
        data: Buffer.from(image.data).toString('base64'),
        mimeType: image.mediaType,
      })),
    ],
  }
}

export function createServer(context: ToolContext): McpServer {
  const writes = context.project !== undefined

  const server = new McpServer(
    { name: 'polymorph', version: context.registry.version },
    { instructions: writes ? READ_INSTRUCTIONS + WRITE_INSTRUCTIONS : READ_INSTRUCTIONS },
  )

  // A server with no project registers no write tool, so it is exactly the
  // read-only server its annotations describe.
  for (const entry of TOOLS) {
    if (entry.writes && !writes) continue
    server.registerTool(
      entry.name,
      {
        title: entry.title,
        description: entry.description,
        inputSchema: entry.inputSchema,
        annotations: entry.annotations,
      },
      async (args) => encoded(await entry.answer(context, args)),
    )
  }

  return server
}

/**
 * The tools that read, in the order a session uses them.
 *
 * `propose_theme` comes last. It is the only one that answers about something
 * the system does not hold: a theme nobody has saved. Every other one describes
 * the system as shipped. It
 * is still read-only: a proposal is two JSON documents that an agent (or a
 * designer, through the studio) decides whether to save.
 */
export const READ_TOOL_NAMES = [
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

/**
 * The tools that write, each paired with the read tool whose answer it writes:
 * `validate` checks a spec and `emit_screen` compiles it, `get_install_plan`
 * plans and `install` applies, `propose_theme` proposes and `save_theme` saves,
 * `fix` rewrites code it is given and `fix_file` rewrites a file. Registered
 * only when the server has a project.
 */
export const WRITE_TOOL_NAMES = ['emit_screen', 'install', 'save_theme', 'fix_file'] as const

/** Every tool a server with a project exposes. The transcript test asserts this list. */
export const TOOL_NAMES = [...READ_TOOL_NAMES, ...WRITE_TOOL_NAMES] as const
