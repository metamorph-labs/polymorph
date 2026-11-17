import type { AgentBridge, AgentQuery, AgentStep } from './bridge'
import type { AgentToolAnnotations, AgentToolDefinition, AgentToolName } from './definitions'
import { registerTools, toolsRunning } from './webmcp'

export type { AgentToolAnnotations, AgentToolName }

/**
 * The bridge as three tools: a plain list for an application's own agent
 * (`agentTools`), and the same tools registered with the browser's WebMCP
 * API where it offers one (`registerWebMCP`). The names, descriptions,
 * schemas and hints are `definitions.ts`'s, which `registerWebMCPOnCall`
 * registers before a bridge exists.
 */

export interface AgentTool extends AgentToolDefinition {
  /** Resolves to a JSON value and never rejects. */
  execute(input?: unknown): Promise<unknown>
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
 * Registers the bridge's tools with the browser's WebMCP API and returns the
 * function that unregisters them. Where the API is absent it registers
 * nothing, and the function does nothing. While another registration of the
 * tools stands on the page (another `registerWebMCP`, a `registerWebMCPOnCall`
 * or a page's agent setting) it registers nothing and warns, because the
 * browser takes each name once.
 *
 * The current draft puts the API on `document.modelContext`, and a tool is
 * unregistered by aborting the signal it was registered with. Earlier builds
 * put it on `navigator.modelContext` and unregister a tool by name, or through
 * the object `registerTool` returned. Each is tried where it exists, and a
 * registration the browser refuses is left out without a throw.
 */
export function registerWebMCP(bridge: AgentBridge): () => void {
  return registerTools(agentTools(bridge), { by: 'registerWebMCP' })
}
