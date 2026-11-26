import type { AgentBridge, AgentBridgeOptions, AgentError, AgentQuery, AgentStep } from './bridge'
import { holdToolNames, modelContext, releaseToolNames, type ToolsClaim } from './context'
import { AGENT_TOOL_DEFINITIONS, type AgentToolName } from './definitions'
import type { AgentTool } from './tools'

/**
 * The bridge's tools on the browser's WebMCP API: the tools' definitions
 * with what runs them on a bridge, the registration `registerWebMCP` and
 * `registerWebMCPOnCall` share, and the second of them, which registers the
 * tools before the bridge is loaded. It imports only the definitions and the
 * bridge's types, so a page that registers this way loads the bridge's code
 * on the first call and not before.
 *
 * `tools.ts` reaches the definitions through this module, and a page's agent
 * setting reaches it through `on-call.ts`, so the elements' no-build build
 * puts the definitions in one chunk, which the bridge's chunk and the
 * setting's chunk both import.
 */

/** The three tools, each running `run` with its name and its input. */
export function toolsRunning(
  run: (name: AgentToolName, input: unknown) => Promise<unknown>,
): AgentTool[] {
  return AGENT_TOOL_DEFINITIONS.map((definition) => ({
    ...definition,
    execute: (input?: unknown) => run(definition.name, input),
  }))
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** What each tool runs on the bridge. */
const RUNS: Record<AgentToolName, (bridge: AgentBridge, input: unknown) => Promise<unknown>> = {
  polymorph_snapshot: (bridge) => Promise.resolve(bridge.snapshot()),
  polymorph_query: (bridge, input) => {
    const wanted = isObject(input) ? input : {}
    const search: AgentQuery = {}
    for (const key of ['name', 'text', 'member'] as const) {
      const value = wanted[key]
      if (typeof value === 'string') search[key] = value
    }
    return Promise.resolve({ members: bridge.query(search) })
  },
  polymorph_act: (bridge, input) =>
    bridge.act((isObject(input) ? input.steps : undefined) as AgentStep[]),
}

/** The bridge's three tools, for an application's own agent. */
export function agentTools(bridge: AgentBridge): AgentTool[] {
  return toolsRunning((name, input) => RUNS[name](bridge, input))
}

/**
 * Registers `tools` with the browser's WebMCP API for `claim`, as
 * `registerWebMCP` describes, and returns the function that unregisters
 * them.
 */
export function registerTools(tools: readonly AgentTool[], claim: ToolsClaim): () => void {
  const context = modelContext()
  if (context === undefined || !holdToolNames(claim)) return () => {}
  const controller = typeof AbortController === 'function' ? new AbortController() : undefined
  const registered: unknown[] = []
  for (const tool of tools) {
    try {
      const out = context.registerTool(
        {
          name: tool.name,
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: { ...tool.annotations },
          execute: (input: unknown) => tool.execute(input),
        },
        controller === undefined ? undefined : { signal: controller.signal },
      )
      // The current draft resolves or rejects; a rejection only means the tool is not registered.
      if (typeof (out as PromiseLike<unknown> | undefined)?.then === 'function') {
        ;(out as Promise<unknown>).catch(() => undefined)
      }
      registered.push(out)
    } catch {
      // A browser that refuses one tool still gets the others.
    }
  }
  let done = false
  return () => {
    if (done) return
    done = true
    controller?.abort()
    for (const tool of tools) {
      try {
        context.unregisterTool?.(tool.name)
      } catch {
        // Not registered, or already gone.
      }
    }
    for (const out of registered) {
      try {
        ;(out as { unregister?: () => void } | undefined)?.unregister?.()
      } catch {
        // Already gone.
      }
    }
    releaseToolNames(claim)
  }
}

/** What `registerWebMCPOnCall` loads: `@polymorph/engine/agent`, or a module with the same two functions. */
export interface AgentBridgeModule {
  createAgentBridge(options?: AgentBridgeOptions): AgentBridge
  agentTools(bridge: AgentBridge): AgentTool[]
}

/**
 * A bridge the page already has, which `registerWebMCPOnCall` runs the tools
 * on and never disposes: the page's own assistant and the browser's agents
 * then share one bridge, which runs one `act` at a time.
 */
export interface SharedAgentBridge {
  /**
   * The bridge, or a function that returns it or a promise of it, so the page
   * can load the bridge on its first use. The function is called on the first
   * tool call, once; a call that fails is answered with an error, and the next
   * call calls it again.
   */
  readonly bridge: AgentBridge | (() => AgentBridge | PromiseLike<AgentBridge>)
}

/** Where a registration on call gets its bridge: one it creates from a module it loads, or one the page shares. */
type BridgeSource =
  | { readonly load: () => Promise<AgentBridgeModule>; readonly options: AgentBridgeOptions }
  | SharedAgentBridge

/** What a tool call resolves to when the page could not give it a bridge. */
function unavailable(reason: unknown): { error: AgentError } {
  const why = reason instanceof Error ? reason.message : String(reason)
  return {
    error: {
      code: 'failed',
      message: `The page could not load the agent bridge (${why}). Calling the tool again tries to load it again.`,
    },
  }
}

/**
 * Registers the bridge's three tools with the browser's WebMCP API now, and
 * gets the bridge on the first call of any of them.
 *
 * Given `load` and `options`, it loads and creates the bridge: `load` is
 * called once, `createAgentBridge(options)` makes the bridge, and that call
 * and every later one run that bridge's tools from `agentTools`. `load` is a
 * dynamic import of `@polymorph/engine/agent`, so a bundler puts the bridge
 * in a chunk the page fetches on the first call. Unregistering disposes of the
 * bridge it created.
 *
 * Given `{ bridge }`, it shares a bridge the page already has, such as its
 * own assistant's: the bridge, or a function that returns it or a promise of
 * it, called on the first call. Unregistering removes the tools and leaves
 * that bridge as it is, because the page that made it disposes of it.
 *
 * Calls that arrive while the bridge loads wait for the same load. A load that
 * fails resolves each waiting call to `{ error: { code: 'failed', message } }`,
 * and the next call loads again. Returns the function that unregisters.
 *
 * Where the API is absent it registers nothing and loads nothing, and the
 * function does nothing. While another registration of the tools stands on the
 * page it registers nothing either, and warns.
 */
export function registerWebMCPOnCall(
  load: () => Promise<AgentBridgeModule>,
  options?: AgentBridgeOptions,
): () => void
export function registerWebMCPOnCall(shared: SharedAgentBridge): () => void
export function registerWebMCPOnCall(
  source: (() => Promise<AgentBridgeModule>) | SharedAgentBridge,
  options: AgentBridgeOptions = {},
): () => void {
  return registerOnCall(
    typeof source === 'function' ? { load: source, options } : source,
    { by: 'registerWebMCPOnCall' },
    false,
  )
}

/** The shared bridge `source` names, or a throw when it names none. */
async function sharedBridge(source: SharedAgentBridge): Promise<AgentBridge> {
  const given = typeof source.bridge === 'function' ? await source.bridge() : source.bridge
  if (typeof (given as Partial<AgentBridge> | undefined)?.act !== 'function') {
    throw new Error('the page gave no bridge')
  }
  return given
}

/**
 * `registerWebMCPOnCall` for `claim`. With `eager` it starts the load at
 * once, and warns when that load fails; the tools stay registered, and a call
 * loads again.
 */
export function registerOnCall(
  source: BridgeSource,
  claim: ToolsClaim,
  eager: boolean,
): () => void {
  if (modelContext() === undefined) {
    releaseToolNames(claim)
    return () => {}
  }
  if (!holdToolNames(claim)) return () => {}
  let done = false
  /** The bridge this registration created, which it disposes of; never a shared one. */
  let bridge: AgentBridge | undefined
  let loading: Promise<AgentTool[]> | undefined

  /** The loaded bridge's tools: one load at a time, kept once it succeeds. */
  const loaded = (): Promise<AgentTool[]> => {
    loading ??= (async () => {
      if (!('load' in source)) {
        const shared = await sharedBridge(source)
        if (done) throw new Error('the tools were unregistered while it loaded')
        return agentTools(shared)
      }
      const agent = await source.load()
      if (done) throw new Error('the tools were unregistered while it loaded')
      const made = agent.createAgentBridge(source.options)
      try {
        const tools = agent.agentTools(made)
        bridge = made
        return tools
      } catch (error) {
        made.dispose()
        throw error
      }
    })().catch((error: unknown) => {
      loading = undefined
      throw error
    })
    return loading
  }

  const unregister = registerTools(
    toolsRunning(async (name, input) => {
      try {
        const tool = (await loaded()).find((each) => each.name === name)
        if (tool === undefined) return unavailable(`it has no tool named ${name}`)
        return await tool.execute(input)
      } catch (error) {
        return unavailable(error)
      }
    }),
    claim,
  )
  if (eager) {
    loaded().catch((error: unknown) => {
      console.warn('polymorph: the agent bridge did not load; a tool call loads it again', error)
    })
  }
  return () => {
    if (done) return
    done = true
    unregister()
    bridge?.dispose()
    bridge = undefined
  }
}
