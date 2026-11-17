/**
 * `@polymorph/engine/webmcp`: the agent bridge's tools on the browser's
 * WebMCP API, registered before the bridge is loaded.
 *
 * `registerWebMCPOnCall(load)` registers the three tools at once and loads
 * the bridge, with `load`, on the first call. `applyAgentSetting(setting)`
 * does what a page's agent setting (`<html data-agent>`) says: nothing, the
 * same registration, or a bridge created and registered at once.
 *
 * It is a subpath of its own, apart from `@polymorph/engine/agent`, because
 * it must not import the bridge: a bundle that imports it and the bridge
 * statically would carry the bridge before any call.
 */
export { AGENT_ATTRIBUTE, applyAgentSetting } from './agent/setting'
export type { AgentSetting } from './agent/setting'
export { registerWebMCPOnCall } from './agent/webmcp'
export type { AgentBridgeModule } from './agent/webmcp'
