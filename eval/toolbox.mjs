import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createJiti } from 'jiti'

/**
 * The four tools the agent eval offers, shared by its runners
 * (`docs/verification.md`, "The agent eval"). `eval/run.mjs` answers the
 * Messages API runner's tool calls with them, and `eval/mcp.mjs` serves the
 * same functions to Claude Code and Codex over MCP, so every runner's model
 * reads the same answers and is judged by the same check.
 *
 * The `runtime` mode offers no tool. `loadScreen` loads what it uses instead:
 * the run-time card it sends, and the check and the reader it judges with.
 */

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** How much of a member's design spec `get_component` returns, in characters. */
const EXCERPT_LIMIT = 6000

/**
 * The repository's own functions, and the four tools built on them.
 * `registry` is one the caller built already: the CLI runner's MCP server
 * reads the runner's own, written as JSON, so the tools it serves answer from
 * the registry the runner judges with, without building it again.
 *
 * `get_system_card`, `search_components` and `get_component` answer as the
 * MCP tools of the same names do. `get_component` also returns the
 * opening of the member's design spec and its API section, which the MCP tool
 * leaves to a second read of the file.
 *
 * `validate` goes further than the MCP tool for a spec: a spec that passes the
 * registry is emitted, and the TSX is held to the red rules, as `pnpm emit`
 * does before it writes anything. A spec is lawful here only when the screen
 * it emits may be written.
 */
export async function loadToolbox({ registry: built } = {}) {
  const jiti = createJiti(import.meta.url)
  const load = (path) => jiti.import(resolve(ROOT, path))

  const { jsonSchema, validate: validateShape } = await load('packages/registry/src/shape.ts')
  const mcp = await load('packages/mcp/src/tools.ts')
  const { withClimb } = await load('packages/mcp/src/violations.ts')
  const { emitCheckedScreen, validateSpec } = await load('packages/spec/src/lawful.ts')
  const { SCREEN_SHAPE } = await load('packages/spec/src/schema.ts')
  const { ENDINGS, PROJECT_ENDINGS, RESULTS_SHAPE, RUNTIME_ENDINGS } =
    await load('eval/results-shape.ts')
  const { KINDS_SHAPE, REQUIREMENTS_SHAPE } = await load('eval/requirements-shape.ts')

  const registry = built ?? (await load('packages/registry/src/build.ts')).buildRegistry(ROOT)
  const context = { registry, root: ROOT }
  const tiers = [...new Set(registry.components.map((component) => component.tier))]

  async function checkSpec(submitted) {
    let document = submitted
    if (typeof submitted === 'string') {
      try {
        document = JSON.parse(submitted)
      } catch (error) {
        return {
          ok: false,
          faults: [],
          violations: [],
          fatal: `the spec is not JSON: ${error.message}`,
        }
      }
    }
    const { faults } = validateSpec(registry, document)
    if (faults.length > 0) return { ok: false, faults, violations: [], fatal: null }

    // A spec the validator accepts and the emitter cannot write is the
    // system's fault, not the agent's, so the exception is not caught here:
    // `call` reports it as a harness fault, which ends the run.
    const checked = await emitCheckedScreen(document)
    const violations = withClimb(registry, checked.violations)
    return {
      ok: checked.fatal === null && violations.length === 0,
      faults: [],
      violations,
      fatal: checked.fatal,
    }
  }

  /**
   * The red rules decide whether a module is lawful, with one addition: it has
   * to compose the vocabulary. A module that imports nothing from it breaks no
   * rule, and would otherwise count as a lawful screen.
   */
  async function checkTsx(code) {
    const answer = await mcp.validate(context, { code })
    const contract = /from\s+['"]@polymorph\/react-ui['"]/.test(code)
      ? []
      : ['The module imports nothing from `@polymorph/react-ui`: a screen composes the vocabulary.']
    return {
      ok: answer.ok && contract.length === 0,
      violations: answer.violations ?? [],
      contract,
      fatal: answer.fatal,
    }
  }

  const check = (mode, document) => (mode === 'spec' ? checkSpec(document) : checkTsx(document))

  /**
   * What is wrong with a call's input, or `null`. The API does not check a
   * streamed input against its schema, so the tools do, before anything reads it.
   */
  function inputFault(name, input) {
    const types = { platform: 'string', query: 'string', tier: 'string', name: 'string' }
    for (const [key, type] of Object.entries(types)) {
      if (input[key] !== undefined && typeof input[key] !== type) {
        return `\`${key}\` must be a ${type}.`
      }
    }
    if (input.platform !== undefined && !mcp.PLATFORMS.includes(input.platform)) {
      return `\`platform\` is one of ${mcp.PLATFORMS.join(', ')}.`
    }
    if (input.limit !== undefined && !(Number.isInteger(input.limit) && input.limit > 0)) {
      return '`limit` must be a whole number above 0.'
    }
    if (name === 'get_component' && input.name === undefined) return '`name` is required.'
    return null
  }

  /**
   * One tool call: the text that goes back to the model, and a verdict when it
   * was `validate`. `memo` lives for one run: the system card is read once per
   * platform, and a repeated call gets the same text.
   *
   * `validate` failing inside the check is the harness's fault, not the
   * model's, and comes back as `fault`, with the document that raised it.
   */
  async function call(mode, block, memo) {
    const input = typeof block.input === 'object' && block.input !== null ? block.input : {}
    const fail = (message) => ({ content: message, isError: true })
    const fault = inputFault(block.name, input)
    if (fault !== null) return fail(fault)

    switch (block.name) {
      case 'get_system_card': {
        const args = pick(input, ['platform'])
        const key = `get_system_card:${args.platform ?? ''}`
        if (!memo.has(key)) memo.set(key, mcp.getSystemCard(context, args))
        return { content: memo.get(key) }
      }
      case 'search_components':
        return {
          content: json(
            mcp.searchComponents(context, pick(input, ['query', 'tier', 'platform', 'limit'])),
          ),
        }
      case 'get_component':
        try {
          const { component } = mcp.getComponent(context, { name: input.name })
          return { content: json({ component, specExcerpt: specExcerpt(component.spec) }) }
        } catch (error) {
          if (error instanceof mcp.UnknownComponentError) return fail(error.message)
          throw error
        }
      case 'validate': {
        const field = mode === 'spec' ? 'spec' : 'code'
        const submitted = input[field]
        // The document is taken as an object or as its text, as the MCP
        // server's `validate` takes it.
        const usable =
          typeof submitted === 'string' ||
          (mode === 'spec' && typeof submitted === 'object' && submitted !== null)
        if (!usable) return fail(`\`${field}\` is required: ${CONTRACT_FIELD[mode]}.`)
        const text = typeof submitted === 'string' ? submitted : JSON.stringify(submitted, null, 2)
        let verdict
        try {
          verdict = await check(mode, submitted)
        } catch (error) {
          return { fault: `\`validate\` failed: ${messageOf(error)}`, submitted: text }
        }
        return { content: json(verdict), verdict, submitted: text }
      }
      default:
        return fail(`There is no tool called \`${block.name}\`.`)
    }
  }

  return {
    registry,
    screenSchema: JSON.stringify(jsonSchema(SCREEN_SHAPE)),
    tools: (mode) => toolDefinitions(mode, tiers, mcp.PLATFORMS),
    check,
    call,
    endings: ENDINGS,
    runtimeEndings: RUNTIME_ENDINGS,
    projectEndings: PROJECT_ENDINGS,
    validateResults: (results) => validateShape(RESULTS_SHAPE, results),
    // The shape checks `loadRequirements` asks for (`eval/requirements.mjs`). The runner
    // judges with the requirements; no tool hands them to the model.
    requirementShapes: {
      requirements: (document) => validateShape(REQUIREMENTS_SHAPE, document),
      kinds: (document) => validateShape(KINDS_SHAPE, document),
    },
  }
}

/**
 * The run-time core the `runtime` mode sends and judges with
 * (`packages/screen`): `runtimeCard`, the system prompt a host gives a model,
 * which ends with the output contract; `checkScreen`, the check a host runs
 * on a document; and `parsePartial`, the reader of a model's answer. They are
 * loaded from source, as the tools are, so a run measures the card of the
 * tree it runs on.
 */
export async function loadScreen() {
  const jiti = createJiti(import.meta.url)
  const load = (path) => jiti.import(resolve(ROOT, path))
  const { runtimeCard } = await load('packages/screen/src/card.ts')
  const { checkScreen } = await load('packages/screen/src/check.ts')
  const { parsePartial } = await load('packages/screen/src/partial.ts')
  const { defaultMembers, memberNames } = await load('packages/screen/src/members.ts')
  const { VOCABULARY } = await load('packages/screen/src/vocabulary.ts')
  const { DEFAULT_FRAMEWORK, FRAMEWORKS } = await load('packages/registry/src/frameworks.ts')
  return {
    runtimeCard,
    checkScreen,
    parsePartial,
    frameworks: FRAMEWORKS,
    defaultFramework: DEFAULT_FRAMEWORK,
    /** Every member and exception primitive the vocabulary has, by name. */
    names: () => memberNames(VOCABULARY),
    /** The members a framework draws when a host names none. */
    defaultMembers: (framework) => defaultMembers(VOCABULARY, framework),
  }
}

const CONTRACT_FIELD = {
  spec: 'the document, as an object or as JSON text',
  tsx: 'the module source',
}

const json = (value) => JSON.stringify(value, null, 2)

export const messageOf = (error) => (error instanceof Error ? error.message : String(error))

/** Only the named fields, so a stray argument cannot reach a function that would misread it. */
const pick = (input, keys) =>
  Object.fromEntries(keys.filter((key) => input[key] !== undefined).map((key) => [key, input[key]]))

/**
 * The opening of a member's design spec and its API section. The registry
 * names the file; the excerpt is the part a screen author needs, without the
 * recipe, which is the member's own business.
 */
function specExcerpt(path) {
  if (path === null) return null
  const sections = readFileSync(resolve(ROOT, path), 'utf8').split(/^(?=## )/m)
  const api = sections.slice(1).find((section) => /^## [^\n]*\bAPI\b/.test(section))
  const excerpt = [sections[0], api]
    .filter((part) => part !== undefined)
    .join('')
    .trim()
  return excerpt.length <= EXCERPT_LIMIT
    ? excerpt
    : `${excerpt.slice(0, EXCERPT_LIMIT)}\n\n(cut at ${EXCERPT_LIMIT} characters; the whole spec is ${path})`
}

/** The tool definitions the request carries. Descriptions follow the MCP server's. */
function toolDefinitions(mode, tiers, platforms) {
  const platform = {
    type: 'string',
    enum: [...platforms],
    description:
      'The platform you are building for; `web` when omitted. Members with no rendering there ' +
      'are left out.',
  }
  const object = (properties, required = []) => ({
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  })

  const validate =
    mode === 'spec'
      ? {
          name: 'validate',
          description:
            'Check a `polymorph-screen/1` document: against the registry (does every component ' +
            'exist, every prop, every variant × tone cell, every icon role, every binding), and ' +
            'then its emitted TSX against the red rules. Returns `ok`, every fault with its path, ' +
            'and every violation with the exception-ladder rungs that answer it.',
          input_schema: object(
            {
              spec: {
                anyOf: [{ type: 'object' }, { type: 'string' }],
                description: 'The whole document: the object itself, or its JSON text.',
              },
            },
            ['spec'],
          ),
        }
      : {
          name: 'validate',
          description:
            'Lint a TSX module as application code: the same red rules, the same diagnostics, as ' +
            'the repository’s own lint run. Returns `ok` and every violation with the ' +
            'exception-ladder rungs that answer it. The code is parsed, never executed.',
          input_schema: object(
            { code: { type: 'string', description: 'The whole module source.' } },
            ['code'],
          ),
        }

  return [
    {
      name: 'get_system_card',
      description:
        'The whole vocabulary compressed for a context window: every component with its ' +
        'purpose, props and lawful cells, the red rules and the exception ladder, the icon ' +
        'roles and the token catalogue. Read this first.',
      input_schema: object({ platform }),
    },
    {
      name: 'search_components',
      description:
        'Find vocabulary members by name, purpose, prop or variant. Omit the query to list the ' +
        'catalogue. Every hit says what it matched on, so a near miss is visibly a near miss.',
      input_schema: object({
        query: { type: 'string', description: 'A name, a concept, a prop, or a variant value.' },
        tier: { type: 'string', enum: tiers },
        platform,
        limit: { type: 'integer', minimum: 1, maximum: 200 },
      }),
    },
    {
      name: 'get_component',
      description:
        'One component: its props with their printed types, its lawful variant × tone cells, ' +
        'its states and anatomy, and the opening and API section of its design spec. A wrong ' +
        'name comes back with suggestions.',
      input_schema: object(
        {
          name: {
            type: 'string',
            description: '`DatePicker`, `date-picker` and `datepicker` all work.',
          },
        },
        ['name'],
      ),
    },
    validate,
    // The inputs are streamed as they are written instead of buffered, and
    // `call` checks each one, which the API no longer does for a streamed input.
  ].map((tool) => ({ ...tool, eager_input_streaming: true }))
}

/**
 * One tool call, answered. Whatever a tool throws goes back to the model as
 * an error result carrying the message, named in `failed`, and the run goes
 * on. `validate` failing inside its check is the exception: `call` returns it
 * as `fault`, which ends the run as the harness's failure.
 */
export async function callTool(toolbox, mode, block, memo) {
  try {
    return await toolbox.call(mode, block, memo)
  } catch (error) {
    const message = messageOf(error)
    return { content: `The tool failed: ${message}`, isError: true, failed: message }
  }
}
