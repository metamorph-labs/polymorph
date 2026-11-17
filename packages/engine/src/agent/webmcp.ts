import type { AgentBridge, AgentBridgeOptions, AgentError } from './bridge'
import { holdToolNames, modelContext, releaseToolNames, type ToolsClaim } from './context'
import { AGENT_TOOL_DEFINITIONS, type AgentToolName } from './definitions'
import type { AgentTool } from './tools'

/**
 * The bridge's tools on the browser's WebMCP API: the tools' definitions
 * with what runs them, the registration `registerWebMCP` and
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
 * loads and creates the bridge on the first call of any of them: `load` is
 * called once, `createAgentBridge(options)` makes the bridge, and that call
 * and every later one run that bridge's tools from `agentTools`. Calls that
 * arrive while it loads wait for the same load. A load that fails resolves
 * each waiting call to `{ error: { code: 'failed', message } }`, and the next
 * call loads again. Returns the function that unregisters the tools and
 * disposes of the bridge.
 *
 * Where the API is absent it registers nothing and never calls `load`, and the
 * function does nothing. While another registration of the tools stands on the
 * page it registers nothing either, and warns.
 *
 * `load` is a dynamic import of `@polymorph/engine/agent`, so a bundler puts
 * the bridge in a chunk the page fetches on the first call.
 */
export function registerWebMCPOnCall(
  load: () => Promise<AgentBridgeModule>,
  options: AgentBridgeOptions = {},
): () => void {
  return registerOnCall(load, options, { by: 'registerWebMCPOnCall' }, false)
}

/**
 * `registerWebMCPOnCall` for `claim`. With `eager` it starts the load at
 * once, and warns when that load fails; the tools stay registered, and a call
 * loads again.
 */
export function registerOnCall(
  load: () => Promise<AgentBridgeModule>,
  options: AgentBridgeOptions,
  claim: ToolsClaim,
  eager: boolean,
): () => void {
  if (modelContext() === undefined) {
    releaseToolNames(claim)
    return () => {}
  }
  if (!holdToolNames(claim)) return () => {}
  let done = false
  let bridge: AgentBridge | undefined
  let loading: Promise<AgentTool[]> | undefined

  /** The loaded bridge's tools: one load at a time, kept once it succeeds. */
  const loaded = (): Promise<AgentTool[]> => {
    loading ??= (async () => {
      const agent = await load()
      if (done) throw new Error('the tools were unregistered while it loaded')
      const made = agent.createAgentBridge(options)
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
