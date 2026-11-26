import type { AgentBridge } from './bridge'
import type { AgentToolAnnotations, AgentToolDefinition, AgentToolName } from './definitions'
import { agentTools, registerTools } from './webmcp'

export type { AgentToolAnnotations, AgentToolName }
export { agentTools }

/**
 * The bridge as three tools: a plain list for an application's own agent
 * (`agentTools`), and the same tools registered with the browser's WebMCP
 * API where it offers one (`registerWebMCP`). The names, descriptions,
 * schemas and hints are `definitions.ts`'s, which `registerWebMCPOnCall`
 * registers before a bridge exists. What each tool runs on a bridge is in
 * `webmcp.ts`, because a registration that shares the page's bridge runs the
 * tools on it without loading this module.
 */

export interface AgentTool extends AgentToolDefinition {
  /** Resolves to a JSON value and never rejects. */
  execute(input?: unknown): Promise<unknown>
}

/**
 * Registers the bridge's tools with the browser's WebMCP API and returns the
 * function that unregisters them. Where the API is absent it registers
 * nothing, and the function does nothing. While another registration of the
 * tools stands on the page (another `registerWebMCP`, a `registerWebMCPOnCall`
 * or a page's agent setting) it registers nothing and warns, because the
 * browser takes each name once. Unregistering leaves the bridge as it is: the
 * page that made it disposes of it.
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
