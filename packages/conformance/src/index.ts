/**
 * `@polymorph/conformance`: the behaviour conformance runner (`docs/conformance.md`),
 * shared by every shell's law.
 *
 * `run.ts` executes one contract statement against a shell through that
 * shell's mount adapter, and hands an agent fence's statement to `agent.ts`,
 * which runs it with an agent bridge installed (`docs/agents.md`). `parts.ts` locates each part a contract names, and
 * names the handler props the runner spies on, for every shell alike, because
 * every shell renders the same parts. `harness.ts` (a separate entry,
 * `@polymorph/conformance/harness`) is the keyboard, pointer and accessibility
 * reading a law hands the runner. `ledger.ts` is the shape of a shell's ledger
 * of deliberate divergences and the entries every Zag-based shell shares; each
 * shell keeps its own ledger. `law.ts` (`@polymorph/conformance/law`) is the
 * law a generated shell's test file calls, and `dist-lock.ts`
 * (`@polymorph/conformance/dist-lock`) the lock every package's build test
 * holds over its `dist`.
 */
export {
  conform,
  type BehaviourStatement,
  type ConformanceStatement,
  type ConformanceSubject,
  type MountAdapter,
  type WindowSize,
} from './run'
export {
  conformAgentMember,
  disabledEntry,
  FIXTURE_CALL_EVENT,
  isAgentStatement,
  type AgentConformanceContract,
  type AgentConformanceStatement,
  type AgentMemberCheck,
  type ValueProbe,
} from './agent'
export { CHOICE_PROBES, HANDLERS, PARTS, VALUE_PROBES, WINDOW_SIZES } from './parts'
export { ZAG_LEDGER } from './ledger'
export type { ConformanceDivergence } from './ledger'
