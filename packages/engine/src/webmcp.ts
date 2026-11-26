/**
 * `@polymorph/engine/webmcp`: the agent bridge's tools on the browser's
 * WebMCP API, registered before the bridge is loaded, and the tools'
 * definitions.
 *
 * `registerWebMCPOnCall(load)` registers the three tools at once and loads
 * the bridge, with `load`, on the first call; `registerWebMCPOnCall({ bridge })`
 * runs them on a bridge the page already has. `applyAgentSetting(setting)`
 * does what a page's agent setting (`<html data-agent>`) says: nothing, the
 * same registration, or a bridge created and registered at once.
 * `AGENT_TOOL_DEFINITIONS` are the tools' names, titles, descriptions, input
 * schemas and hints, which a page's own assistant can send its model before
 * the bridge loads.
 *
 * It is a subpath of its own, apart from `@polymorph/engine/agent`, because
 * it must not import the bridge: a bundle that imports it and the bridge
 * statically would carry the bridge before any call.
 */
export { AGENT_TOOL_DEFINITIONS } from './agent/definitions'
export type { AgentToolAnnotations, AgentToolDefinition, AgentToolName } from './agent/definitions'
export { AGENT_ATTRIBUTE, applyAgentSetting } from './agent/setting'
export type { AgentSetting } from './agent/setting'
export { registerWebMCPOnCall } from './agent/webmcp'
export type { AgentBridgeModule, SharedAgentBridge } from './agent/webmcp'
