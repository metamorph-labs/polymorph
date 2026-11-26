/**
 * `@polymorph/engine/agent`: the agent bridge.
 *
 * An agent on a running page reads and operates the mounted members through
 * this API instead of clicking or reading screenshots. Each member registers
 * a handle with the engine's root while it is mounted (`agentMember`), and the
 * bridge reads those handles: what a member's spec declares in its `agent`
 * fence is all an agent can read or do.
 *
 * It is a subpath, so an application that does not create a bridge does not
 * ship it. The registry it reads is in the root, and holds only a list.
 */
export {
  AGENT_CHANGE_EVENT,
  AGENT_KEY_ATTRIBUTE,
  AGENT_SETTLE_MS,
  createAgentBridge,
} from './bridge'
export type {
  AgentActResult,
  AgentBridge,
  AgentBridgeOptions,
  AgentChange,
  AgentChangeDetail,
  AgentConfirmRequest,
  AgentError,
  AgentErrorCode,
  AgentMatch,
  AgentPolicy,
  AgentPolicyMember,
  AgentQuery,
  AgentSnapshot,
  AgentSnapshotAction,
  AgentSnapshotMember,
  AgentStep,
  AgentStepResult,
} from './bridge'

export { agentTools, registerWebMCP } from './tools'
export type { AgentTool, AgentToolAnnotations, AgentToolName } from './tools'
