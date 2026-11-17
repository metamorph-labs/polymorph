import {
  AGENT_CHANGE_EVENT,
  createAgentBridge,
  type AgentBridge,
  type AgentBridgeOptions,
  type AgentChangeDetail,
  type AgentSnapshot,
  type AgentSnapshotMember,
  type AgentStepResult,
} from '@polymorph/engine/agent'
import { agentRegistrations, type AgentRegistration } from '@polymorph/engine/testing'

import {
  restPointer,
  type ConformanceSubject,
  type Harness,
  type Mounted,
  type MountAdapter,
  type Outcome,
  type Override,
  type WindowSize,
} from './run'

/**
 * The agent half of the conformance runner: executes one statement of a
 * member's `agent` fence (`docs/agents.md`, `docs/conformance.md`) against a
 * rendered shell, in a real browser, with an agent bridge installed.
 *
 * It goes through the same adapter, harness, `PARTS` table and state
 * resolution as the contract statements (`run.ts`). Each statement starts
 * from a fresh mount of one states fixture entry: the one its `when` names,
 * or the first a walk over the entries finds ready (`onEntry`). A walk passes
 * over each entry on which a mount registered nothing before
 * (`REGISTERS_NOTHING`). An entry `WINDOW_SIZES`
 * (`parts.ts`) lists is mounted at its window size, and the window gets its
 * own size back once the statement ends. The member under test is the
 * registered handle whose element is inside the element the entry rendered
 * into, or, for an overlay whose element is portalled out of it, the handle of
 * that member's name the mount registered.
 *
 * The bridge is the engine's own (`@polymorph/engine/agent`), so a statement
 * holds against what an application's agent reads and runs. The runner learns
 * each member's element through the bridge's policy, which is handed every
 * member's element and hides none.
 *
 * It waits with the harness's `waitFor` and with timers, because a hidden tab
 * runs no frames and the bridge waits on timers too. The one wait for an
 * animation frame, after an entry mounted at another window size, ends on a
 * timer when no frame comes.
 */

/* -------------------------------------------------------------------------- */
/* The statements, structurally                                               */
/* -------------------------------------------------------------------------- */

export type AgentStateType =
  'boolean' | 'tristate' | 'number' | 'text' | 'id' | 'ids' | 'choices' | 'list'

export type AgentArgumentType = 'boolean' | 'number' | 'text' | 'id' | 'ids'

export type AgentEvidenceLike =
  | { part: string; reading: 'attribute'; attribute: string; value: string | null }
  | { part: string; reading: 'value' | 'text' | 'present' }

export interface AgentStateStatement {
  kind: 'state'
  name: string
  type: AgentStateType
  secret: boolean
  evidence?: AgentEvidenceLike
  text: string
  /** A states fixture entry's full name, already resolved from the fence's `when`. */
  state?: string
}

export interface AgentActionStatement {
  kind: 'action'
  name: string
  argument?: AgentArgumentType
  /** For an `id` or `ids` argument: the `choices` state whose choices it names. */
  among?: string
  sets?: string
  calls?: string
  /** The part whose element the action presses with the element's own `click()`. */
  presses?: string
  text: string
  state?: string
}

export interface AgentDestructiveStatement {
  kind: 'destructive'
  prop: string
  value: string
  text: string
}

export interface AgentDestructiveOptionStatement {
  kind: 'destructive-option'
  field: string
  value: string
  text: string
}

export interface AgentDestructiveNeverStatement {
  kind: 'destructive-never'
  text: string
}

export interface AgentWithholdsStatement {
  kind: 'withholds-contents'
  text: string
  state?: string
}

/** A statement of a spec's agent fence, as `@polymorph/registry/agent` parses it. */
export type AgentConformanceStatement =
  | AgentStateStatement
  | AgentActionStatement
  | AgentDestructiveStatement
  | AgentDestructiveOptionStatement
  | AgentDestructiveNeverStatement
  | AgentWithholdsStatement

/** A member's whole agent fence, which a statement reads the other statements from. */
export interface AgentConformanceContract {
  readonly states: readonly AgentStateStatement[]
  readonly actions: readonly AgentActionStatement[]
  readonly destructive: readonly AgentDestructiveStatement[]
  readonly destructiveOptions: readonly AgentDestructiveOptionStatement[]
  readonly destructiveNever: boolean
  readonly withholdsContents: boolean
  /**
   * The fixture entries the fence's `when` clauses name, each by its full
   * name, in the fence's order. The member must register on each of them.
   */
  readonly entries?: readonly string[]
}

/**
 * The props that give a member entries whose own handlers hold spies, for an
 * action that calls an entry's handler rather than a prop of the member
 * (Menu's `choose`, which calls the chosen entry's `onSelect`). `spy(handler)`
 * returns a function that records a call of that handler.
 */
export type ChoiceProbe = (
  spy: (handler: string) => (...args: never[]) => void,
) => Readonly<Record<string, Override>>

/**
 * The value an action that takes text or a number is given, for a member that
 * reads only some values: a date member reads a date in its own form and
 * refuses other text, and a duration member draws whole counts of its
 * smallest unit. It takes the current value of the state the action sets and
 * returns another value the member accepts, in the form the state reads it.
 */
export type ValueProbe = (current: unknown) => string | number

const AGENT_KINDS: ReadonlySet<string> = new Set([
  'state',
  'action',
  'destructive',
  'destructive-option',
  'destructive-never',
  'withholds-contents',
])

export function isAgentStatement(statement: {
  kind: string
}): statement is AgentConformanceStatement {
  return AGENT_KINDS.has(statement.kind)
}

/** The checks the law makes once per member with a fence, beside its statements. */
export type AgentMemberCheck = 'undeclared' | 'disabled'

/* -------------------------------------------------------------------------- */
/* Probes and budgets                                                         */
/* -------------------------------------------------------------------------- */

/** The text an action that takes text is given. */
export const AGENT_PROBE_TEXT = 'Agent conformance probe'
const AGENT_PROBE_TEXT_AGAIN = 'Agent conformance probe, again'

/** Typed into a secret state's field. It appears nowhere else on the page. */
export const AGENT_SECRET_PROBE = 'pm-secret-probe-4471'

/**
 * Typed instead into a secret field that takes digits only (`inputmode="numeric"`, as a one-time
 * code's field is), which keeps none of the letters of the probe above. Six digits, the longest
 * code such a field holds. It appears nowhere else on the page.
 */
export const AGENT_SECRET_DIGITS = '590183'

/** The action an agent asks for that no fence declares. */
export const AGENT_UNDECLARED = 'conformance-undeclared'

/**
 * The event a fixture dispatches on `document`, with the handler's name as its
 * `detail`, when a handler the runner cannot pass as a prop of the mounted
 * member runs: a field of a toast store record (a notice's `onDismiss`, its
 * action's `onClick`). The runner counts it as a call of that handler while a
 * step runs.
 */
export const FIXTURE_CALL_EVENT = 'polymorph:fixturecall'

/** How long a mount gets to register its member. */
const REGISTER_BUDGET = 3_000
/** How long a part gets to show a state's value. */
const AGREE_BUDGET = 2_000
/** How long the runner watches for a change that must not happen. */
const STAY = 250

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** How long the runner waits for an animation frame, which a hidden tab never runs. */
const FRAME_BUDGET = 100

/** The next animation frame, or the end of `FRAME_BUDGET`, whichever comes first. */
const frame = () =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, FRAME_BUDGET)
    requestAnimationFrame(() => {
      clearTimeout(timer)
      resolve()
    })
  })

/* -------------------------------------------------------------------------- */
/* Reading values                                                             */
/* -------------------------------------------------------------------------- */

/** A statement that does not hold, with the reason in words. */
class Divergence extends Error {}

/** An entry that cannot start a statement, with the reason; the runner tries the next. */
class Unready extends Error {}

/** An entry a walk passes over without mounting it, because a mount of it registered nothing before. */
class PassedOver extends Unready {}

/**
 * The fixture entries on which a mount registered no member within
 * `REGISTER_BUDGET`, for each renderer's adapter. Each key names the member,
 * the entry and the props the runner set on it (`propsKey`). A walk over the
 * entries passes over these, so an entry on which the member never registers
 * (a Card without `href`, a chart without `onSelect`, a closed Dialog) costs the
 * wait once per member, renderer and set of props, and not once per statement.
 * The props are part of the key because they decide whether some members
 * register: a chart registers once the runner gives it an `onSelect` spy.
 */
const REGISTERS_NOTHING = new WeakMap<MountAdapter, Set<string>>()

/** The props a mount sets, as `REGISTERS_NOTHING` keys them: each prop's name, and its value unless it is a spy. */
function propsKey(overrides: Readonly<Record<string, Override>> | undefined): string {
  if (overrides === undefined) return '[]'
  return json(
    Object.keys(overrides)
      .sort()
      .map((key) => {
        const value = overrides[key]
        return [key, typeof value === 'function' ? 'spy' : value]
      }),
  )
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const json = (value: unknown): string => {
  try {
    return JSON.stringify(value) ?? 'undefined'
  } catch {
    return String(value)
  }
}

const words = (text: string) => text.replace(/\s+/g, ' ').trim()

/** Whether two values are the same, a list of ids compared as a set. */
function same(a: unknown, b: unknown, type?: AgentStateType): boolean {
  if (type === 'ids' && Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item) => b.includes(item))
  }
  if (type === 'text' && typeof a === 'string' && typeof b === 'string') {
    return words(a) === words(b)
  }
  return json(a) === json(b)
}

/** Why a value is not of a state type, or `null` when it is. */
function typeFault(value: unknown, type: AgentStateType): string | null {
  const got = `got ${json(value)}`
  switch (type) {
    case 'boolean':
      return typeof value === 'boolean' ? null : `a boolean is true or false; ${got}`
    case 'tristate':
      return value === true || value === false || value === 'mixed'
        ? null
        : `a tristate is true, false or "mixed"; ${got}`
    case 'number':
      return value === null || (typeof value === 'number' && Number.isFinite(value))
        ? null
        : `a number is finite, or null for none; ${got}`
    case 'text':
      return typeof value === 'string' ? null : `text is a string; ${got}`
    case 'id':
      return value === null || typeof value === 'string'
        ? null
        : `an id is a string, or null for none; ${got}`
    case 'ids':
      return Array.isArray(value) && value.every((item) => typeof item === 'string')
        ? null
        : `ids are a list of strings; ${got}`
    case 'choices': {
      if (!Array.isArray(value)) return `choices are a list; ${got}`
      const allowed = new Set(['id', 'label', 'disabled', 'destructive'])
      for (const choice of value) {
        if (
          !isRecord(choice) ||
          typeof choice.id !== 'string' ||
          typeof choice.label !== 'string' ||
          (choice.disabled !== undefined && typeof choice.disabled !== 'boolean') ||
          (choice.destructive !== undefined && typeof choice.destructive !== 'boolean') ||
          Object.keys(choice).some((key) => !allowed.has(key))
        ) {
          return `a choice is { id, label, disabled?, destructive? }; got ${json(choice)}`
        }
      }
      const ids = value.map((choice) => (choice as { id: string }).id)
      return new Set(ids).size === ids.length ? null : `two choices share an id; ${got}`
    }
    case 'list':
      return Array.isArray(value) && value.every(isRecord)
        ? null
        : `a list holds JSON records; ${got}`
  }
}

/** What a part's attribute, value or text reads as, for a state of this type. */
function fromText(raw: string | null, type: AgentStateType): unknown {
  switch (type) {
    case 'boolean':
      if (raw === null || raw === 'false') return false
      return raw === 'true' || raw === '' ? true : raw
    case 'tristate':
      if (raw === null || raw === 'false') return false
      return raw === 'true' ? true : raw
    case 'number':
      return raw === null || raw.trim() === '' ? null : Number(raw)
    default:
      return raw ?? ''
  }
}

function describe(element: Element | null): string {
  if (element === null) return 'nothing'
  const tag = element.tagName.toLowerCase()
  const role = element.getAttribute('role')
  return `<${tag}${role ? ` role="${role}"` : ''}>`
}

interface Choice {
  id: string
  label: string
  disabled?: boolean
  destructive?: boolean
}

/** A change event, as the subscriber and the document each heard it. */
interface Heard {
  detail: AgentChangeDetail
  /** The element the event was dispatched on, or the document; `null` for the subscriber. */
  target: EventTarget | null
}

/* -------------------------------------------------------------------------- */
/* The run                                                                    */
/* -------------------------------------------------------------------------- */

export async function conformAgent(
  subject: ConformanceSubject,
  statement: AgentConformanceStatement,
  adapter: MountAdapter,
  harness: Harness,
): Promise<Outcome> {
  const run = new AgentRun(subject, adapter, harness)
  try {
    await run.statement(statement)
    return { pass: true }
  } catch (error) {
    if (error instanceof Divergence || error instanceof Unready) {
      return { pass: false, reason: error.message }
    }
    throw error
  } finally {
    await run.dispose()
  }
}

/**
 * A check of the member as a whole: an action its fence does not declare is
 * refused with the actions it does, and on its disabled fixture entry it
 * lists no action and refuses a step.
 */
export async function conformAgentMember(
  subject: ConformanceSubject,
  check: AgentMemberCheck,
  adapter: MountAdapter,
  harness: Harness,
): Promise<Outcome> {
  const run = new AgentRun(subject, adapter, harness)
  try {
    if (check === 'undeclared') await run.undeclared()
    else await run.disabledEntry()
    return { pass: true }
  } catch (error) {
    if (error instanceof Divergence || error instanceof Unready) {
      return { pass: false, reason: error.message }
    }
    throw error
  } finally {
    await run.dispose()
  }
}

/** The fixture entry a member is disabled in: `disabled`, else the first whose name begins with it. */
export function disabledEntry(states: readonly string[]): string | undefined {
  return (
    states.find((state) => state === 'disabled') ??
    states.find((state) => /^disabled\b/.test(state))
  )
}

class AgentRun {
  private mounted: Mounted | null = null
  private mountedWith: { state: string; overrides: Record<string, Override> | undefined } | null =
    null
  private bridge: AgentBridge
  /** Each member's element, as the bridge's policy was last handed it. */
  private readonly elements = new Map<string, Element | null>()
  /** Every element the policy has been handed for each member. */
  private readonly seen = new Map<string, Set<Element>>()
  /** The id of the member under test. */
  private id = ''
  /** Whether `mount` passes over an entry `REGISTERS_NOTHING` records, as a walk does. */
  private passingOver = false
  /** The handlers whose spies have been called since the last mount. */
  private readonly called: string[] = []
  /** The change events since the last step began. */
  private readonly heard: Heard[] = []
  private readonly cleanups: (() => void)[] = []

  constructor(
    private readonly subject: ConformanceSubject,
    private readonly adapter: MountAdapter,
    private readonly harness: Harness,
  ) {
    this.bridge = this.open()
    const listen = (event: Event) => {
      const detail = (event as CustomEvent<AgentChangeDetail>).detail
      this.heard.push({ detail, target: event.target })
    }
    document.addEventListener(AGENT_CHANGE_EVENT, listen, true)
    this.cleanups.push(() => document.removeEventListener(AGENT_CHANGE_EVENT, listen, true))
  }

  async dispose(): Promise<void> {
    for (const cleanup of this.cleanups.splice(0)) cleanup()
    this.bridge.dispose()
    this.mounted?.unmount()
    this.mounted = null
    await this.restoreWindow()
  }

  private get fence(): AgentConformanceContract {
    const agent = this.subject.agent
    if (agent === undefined || agent === null) {
      throw new Error(`${this.subject.member}: the subject carries no agent fence`)
    }
    return agent
  }

  /** A bridge over the page, with `confirm` when given, whose policy records each element. */
  private open(confirm?: AgentBridgeOptions['confirm']): AgentBridge {
    const bridge = createAgentBridge({
      ...(confirm === undefined ? {} : { confirm }),
      policy: {
        hide: (member) => {
          this.elements.set(member.id, member.element)
          if (member.element !== null) {
            const seen = this.seen.get(member.id) ?? new Set<Element>()
            seen.add(member.element)
            this.seen.set(member.id, seen)
          }
          return false
        },
      },
    })
    const stop = bridge.subscribe((detail) => this.heard.push({ detail, target: null }))
    this.cleanups.push(stop)
    return bridge
  }

  /** Replaces the bridge, for a step that asks a person differently. */
  private reopen(confirm?: AgentBridgeOptions['confirm']): void {
    this.bridge.dispose()
    this.bridge = this.open(confirm)
  }

  /* ----------------------------------------------------------------------- */
  /* Mounting and locating                                                   */
  /* ----------------------------------------------------------------------- */

  /** A spy for a handler: it records each call into `called`. */
  private spy = (handler: string) => () => void this.called.push(handler)

  /**
   * The overrides that put a spy in every handler the fence's actions call:
   * a spy prop for a handler that is a prop, and the member's choice probes
   * for one an entry holds.
   */
  private spies(only?: AgentActionStatement): Record<string, Override> | undefined {
    const actions = only === undefined ? this.fence.actions : [only]
    const out: Record<string, Override> = {}
    for (const action of actions) {
      if (action.calls === undefined) continue
      const chooses = action.argument === 'id' || action.argument === 'ids'
      if (chooses && this.subject.choiceProbes !== undefined) {
        Object.assign(out, this.subject.choiceProbes(this.spy))
      } else out[action.calls] = this.spy(action.calls)
    }
    return Object.keys(out).length === 0 ? undefined : out
  }

  /**
   * Mounts an entry and finds its member: the registered handle whose element
   * is inside the element the entry rendered into, else the one of the
   * member's name this mount registered. Throws `Unready` when the entry
   * registers none within `REGISTER_BUDGET`, and records it in
   * `REGISTERS_NOTHING`. During a walk (`passingOver`), an entry recorded there
   * with the same props throws `PassedOver` and is not mounted.
   */
  private async mount(state: string, overrides?: Record<string, Override>): Promise<void> {
    const key = json([this.subject.member, state, propsKey(overrides)])
    let nothing = REGISTERS_NOTHING.get(this.adapter)
    if (nothing === undefined) {
      nothing = new Set()
      REGISTERS_NOTHING.set(this.adapter, nothing)
    }
    const unready = `"${state}" registers no ${this.subject.member} with the agent registry`
    if (this.passingOver && nothing.has(key)) throw new PassedOver(unready)
    this.mounted?.unmount()
    this.mounted = null
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    await this.windowFor(state)
    await restPointer(this.harness)
    const before = new Set(this.bridge.snapshot().members.map((member) => member.id))
    this.called.length = 0
    this.heard.length = 0
    this.mounted = await this.adapter.mount(this.subject.member, {
      state,
      ...(overrides ? { overrides } : {}),
    })
    this.mountedWith = { state, overrides }
    let found: string | undefined
    try {
      await this.harness.waitFor(() => {
        const root = (this.mounted as Mounted).root
        const members = this.bridge
          .snapshot()
          .members.filter((member) => member.member === this.subject.member)
        const inside = members.find((member) => {
          const element = this.elements.get(member.id)
          return element !== null && element !== undefined && root.contains(element)
        })
        found = (inside ?? members.find((member) => !before.has(member.id)))?.id
        if (found === undefined) throw new Unready('not yet')
      }, REGISTER_BUDGET)
    } catch (error) {
      if (!(error instanceof Unready)) throw error
      nothing.add(key)
      throw new Unready(unready)
    }
    nothing.delete(key)
    this.id = found as string
    // An entry that presses a control (`presses`) presses it on its first frame, and one of the
    // entries mounted at another window size does (AppShell's open drawer). So the runner lets
    // two frames pass before it reads a member mounted at another size.
    if (this.subject.windows?.[state] !== undefined) {
      await frame()
      await frame()
    }
  }

  /** The window's size before the runner changed it, while an entry is mounted at another. */
  private resized: WindowSize | null = null

  /**
   * Sets the window to the size `WINDOW_SIZES` gives the entry, or back to the
   * size it had when the entry has none. It waits until the document has the
   * width, so the recipe's media queries hold before the entry mounts.
   */
  private async windowFor(state: string): Promise<void> {
    const wanted = this.subject.windows?.[state]
    if (wanted === undefined) return this.restoreWindow()
    this.resized ??= { width: window.innerWidth, height: window.innerHeight }
    await this.sizeWindow(wanted)
  }

  /** Puts the window back to the size it had before the runner changed it. */
  private async restoreWindow(): Promise<void> {
    const before = this.resized
    if (before === null) return
    this.resized = null
    await this.sizeWindow(before)
  }

  private async sizeWindow({ width, height }: WindowSize): Promise<void> {
    await this.harness.viewport(width, height)
    await this.harness.waitFor(() => {
      if (window.innerWidth !== width) {
        throw new Error(`the window is ${window.innerWidth}px wide, not ${width}px`)
      }
    }, REGISTER_BUDGET)
  }

  /** The same entry again, from a fresh mount. */
  private async remount(): Promise<void> {
    const at = this.mountedWith
    if (at === null) throw new Error('remount before a mount')
    await this.mount(at.state, at.overrides)
  }

  /** The member under test as the bridge lists it now, or `undefined` once it is not listed. */
  private listed(): AgentSnapshotMember | undefined {
    return this.bridge.snapshot().members.find((member) => member.id === this.id)
  }

  /** The member under test, as the bridge reports it now. */
  private member(): AgentSnapshotMember {
    const found = this.bridge.snapshot().members.find((member) => member.id === this.id)
    if (found === undefined) {
      throw new Divergence(`${this.subject.member} is no longer in the agent registry`)
    }
    return found
  }

  private selector(part: string): string {
    const selector =
      this.subject.parts[part] ??
      (part === 'root' ? `[data-member="${this.subject.slug}"]` : undefined)
    if (selector === undefined) {
      throw new Error(
        `${this.subject.member}: no locator for the part "${part}" — add one to @polymorph/conformance's parts.ts`,
      )
    }
    return selector
  }

  /** The part's elements: those in the mount first, then the rest of the document's. */
  private all(part: string): HTMLElement[] {
    const selector = this.selector(part)
    const root = (this.mounted as Mounted).root
    const scoped = selector.startsWith(':scope')
    const found = [...(scoped ? root : document).querySelectorAll<HTMLElement>(selector)].filter(
      (element) => element.closest('[hidden]') === null,
    )
    return [
      ...found.filter((element) => root.contains(element)),
      ...found.filter((element) => !root.contains(element)),
    ]
  }

  /**
   * Tries the statement's entry, or walks the entries (`walk`) until one is
   * ready. `attempt` throws `Unready` for an entry that cannot start the
   * statement, and `Divergence` for one on which it does not hold.
   *
   * The entry a `when` names is mounted whatever an earlier mount found, so it
   * fails the statement when it registers nothing. A walk passes over each
   * entry on which a mount with the same props registered nothing
   * (`REGISTERS_NOTHING`). That record is of an earlier mount, not a proof, so
   * before a walk fails for want of an entry it mounts each entry it passed
   * over. A check the grammar gives no entry (`anywhere`) walks the entries the
   * fence names first.
   */
  private async onEntry(
    statement: { state?: string },
    attempt: (state: string) => Promise<void>,
    what: string,
    anywhere = false,
  ): Promise<void> {
    const named = statement.state
    const passed: string[] = []
    let last = ''
    const tryEach = async (states: readonly string[], passOver: boolean): Promise<boolean> => {
      for (const state of states) {
        this.passingOver = passOver
        try {
          await attempt(state)
          return true
        } catch (error) {
          if (!(error instanceof Unready)) throw error
          if (error instanceof PassedOver) passed.push(state)
          last = error.message
        } finally {
          this.passingOver = false
        }
      }
      return false
    }
    if (named !== undefined) {
      if (await tryEach([named], false)) return
      throw new Divergence(last)
    }
    if (await tryEach(this.walk(anywhere), true)) return
    if (await tryEach(passed.splice(0), false)) return
    throw new Divergence(`no fixture entry is ready for ${what} (the last: ${last})`)
  }

  /**
   * The entries a walk tries, in order. A statement with no `when` starts from
   * the first entry in fixture order that can run it. A check the grammar gives
   * no entry (`anywhere`: an undeclared action, a destructive statement) holds
   * on any entry that lists the member, so it tries first the entries the
   * fence's `when` clauses name, on each of which the member must register,
   * and then the rest in fixture order.
   */
  private walk(anywhere: boolean): readonly string[] {
    if (!anywhere) return this.subject.states
    const named = (this.fence.entries ?? []).filter((state) => this.subject.states.includes(state))
    return [...new Set([...named, ...this.subject.states])]
  }

  private async wait(check: () => true | string, timeout: number): Promise<void> {
    await this.harness.waitFor(() => {
      const verdict = check()
      if (verdict !== true) throw new Divergence(verdict)
    }, timeout)
  }

  /* ----------------------------------------------------------------------- */
  /* What a state shows                                                      */
  /* ----------------------------------------------------------------------- */

  private stateNamed(name: string): AgentStateStatement | undefined {
    return this.fence.states.find((state) => state.name === name)
  }

  /** The value the evidence's part shows, as the state's type reads it. */
  private shown(state: AgentStateStatement & { evidence: AgentEvidenceLike }): {
    value: unknown
    said: string
  } {
    const { evidence } = state
    if (evidence.reading === 'present') {
      const present = this.all(evidence.part).length > 0
      return {
        value: present,
        said: `the part "${evidence.part}" is ${present ? '' : 'not '}in the document`,
      }
    }
    const element = this.all(evidence.part)[0]
    if (element === undefined) {
      return { value: undefined, said: `no element is the part "${evidence.part}"` }
    }
    if (evidence.reading === 'attribute') {
      const raw = element.getAttribute(evidence.attribute)
      const value = evidence.value === null ? fromText(raw, state.type) : raw === evidence.value
      return {
        value,
        said: `${describe(element)} has ${raw === null ? `no ${evidence.attribute}` : `${evidence.attribute}="${raw}"`}`,
      }
    }
    if (evidence.reading === 'value') {
      const raw = 'value' in element ? String((element as HTMLInputElement).value) : null
      return {
        value: fromText(raw, state.type),
        said: `${describe(element)} has the value "${raw}"`,
      }
    }
    const raw = words(element.textContent ?? '')
    return { value: fromText(raw, state.type), said: `${describe(element)} shows "${raw}"` }
  }

  /** Waits for the state's part to show the value the snapshot reports. */
  private async agrees(state: AgentStateStatement): Promise<void> {
    if (state.evidence === undefined) return
    const withEvidence = state as AgentStateStatement & { evidence: AgentEvidenceLike }
    await this.wait(() => {
      const reported = this.member().state[state.name]
      const { value, said } = this.shown(withEvidence)
      return same(value, reported, state.type)
        ? true
        : `${said}, which reads ${json(value)}, and the state "${state.name}" is ${json(reported)}`
    }, AGREE_BUDGET)
  }

  /**
   * Waits for the state's part to agree with the state after a step. While the
   * member is listed, the part shows what the snapshot reports. A step can
   * remove the member's element (a Dialog's close), and the member is then not
   * listed: the part shows what the step's `changed` reports, or the value
   * before the step when it reports none, and a part read by `present` is
   * absent, so a member is unlisted only while its part is gone.
   */
  private async agreesAfter(
    state: AgentStateStatement,
    changed: Readonly<Record<string, { to: unknown }>>,
    before: unknown,
  ): Promise<void> {
    if (state.evidence === undefined) return
    const withEvidence = state as AgentStateStatement & { evidence: AgentEvidenceLike }
    await this.wait(() => {
      const now = this.listed()
      const { value, said } = this.shown(withEvidence)
      if (now === undefined && state.evidence?.reading === 'present' && value === true) {
        return `the part "${state.evidence.part}" is in the document, and ${this.subject.member} is not listed`
      }
      const reported =
        now !== undefined
          ? now.state[state.name]
          : changed[state.name] === undefined
            ? before
            : changed[state.name]?.to
      return same(value, reported, state.type)
        ? true
        : `${said}, which reads ${json(value)}, and the state "${state.name}" is ${json(reported)}` +
            (now === undefined ? ', as the step that unlisted the member reported it' : '')
    }, AGREE_BUDGET)
  }

  /**
   * The member's choices: every value of a `choices` state the fence declares,
   * or of the one an action chooses among (`among`) when it names one.
   */
  private choices(member: AgentSnapshotMember, among?: string): Choice[] {
    return this.fence.states
      .filter((state) => state.type === 'choices' && (among === undefined || state.name === among))
      .flatMap((state) => {
        const value = member.state[state.name]
        return Array.isArray(value) ? (value as Choice[]) : []
      })
  }

  /**
   * A choice of another `choices` state than the one an action chooses among,
   * whose id the action's own state does not hold, or `undefined` when there
   * is none.
   */
  private otherChoice(member: AgentSnapshotMember, among: string): Choice | undefined {
    const own = new Set(this.choices(member, among).map((choice) => choice.id))
    return this.fence.states
      .filter((state) => state.type === 'choices' && state.name !== among)
      .flatMap((state) => this.choices(member, state.name))
      .find((choice) => !own.has(choice.id))
  }

  /* ----------------------------------------------------------------------- */
  /* Acting                                                                  */
  /* ----------------------------------------------------------------------- */

  /** Runs one step on the member under test, with the events it emits. */
  private async act(
    action: string,
    value?: unknown,
  ): Promise<{
    step: AgentStepResult
    events: Heard[]
  }> {
    this.heard.length = 0
    // A handler a fixture reports, as its spy would record it.
    const reported = (event: Event) => {
      const handler = (event as CustomEvent<unknown>).detail
      if (typeof handler === 'string') this.called.push(handler)
    }
    document.addEventListener(FIXTURE_CALL_EVENT, reported)
    const { results } = await this.bridge
      .act([{ id: this.id, action, ...(value === undefined ? {} : { value }) }])
      .finally(() => document.removeEventListener(FIXTURE_CALL_EVENT, reported))
    const step = results[0]
    if (step === undefined) throw new Divergence(`act returned no result for "${action}"`)
    return { step, events: this.heard.filter((heard) => heard.detail.id === this.id) }
  }

  /**
   * The value an action is given: none, the opposite boolean, a fixed text,
   * the current number plus one, an enabled choice other than the current one
   * for an id, two enabled choices for ids, each of the state the action
   * chooses among when it names one (`among`). A member with a value probe
   * (`VALUE_PROBES` in `parts.ts`) gives its own text or number instead. A
   * choice marked destructive is passed over unless `destructive` asks for
   * one. Throws `Unready` when the member offers no such value.
   */
  private probe(
    action: AgentActionStatement,
    member: AgentSnapshotMember,
    destructive = false,
  ): unknown {
    const current = action.sets === undefined ? undefined : member.state[action.sets]
    const made =
      action.argument === 'text' || action.argument === 'number'
        ? this.subject.valueProbe?.(current)
        : undefined
    switch (action.argument) {
      case undefined:
        return undefined
      case 'boolean':
        return typeof current === 'boolean' ? !current : true
      case 'text':
        if (typeof made === 'string') return made
        return current === AGENT_PROBE_TEXT ? AGENT_PROBE_TEXT_AGAIN : AGENT_PROBE_TEXT
      case 'number':
        if (typeof made === 'number') return made
        return (typeof current === 'number' ? current : 0) + 1
      case 'id':
      case 'ids': {
        const offered = this.choices(member, action.among).filter(
          (choice) =>
            choice.disabled !== true &&
            (destructive ? choice.destructive === true : choice.destructive !== true),
        )
        if (action.argument === 'id') {
          const pick = offered.find((choice) => choice.id !== current)
          if (pick === undefined) throw new Unready(`offers no enabled choice for "${action.name}"`)
          return pick.id
        }
        const held = Array.isArray(current) ? current : []
        const picks = offered.filter((choice) => !held.includes(choice.id)).slice(0, 2)
        if (picks.length === 0) throw new Unready(`offers no enabled choice for "${action.name}"`)
        return picks.map((choice) => choice.id)
      }
    }
  }

  /** Checks a step's change events: exactly one, from the agent, on the member's element. */
  private oneEvent(action: string, events: Heard[], changed: Record<string, unknown>): void {
    const subscribed = events.filter((heard) => heard.target === null)
    const dispatched = events.filter((heard) => heard.target !== null)
    if (subscribed.length !== 1 || dispatched.length !== 1) {
      throw new Divergence(
        `"${action}" emitted ${subscribed.length} change events to subscribers and ` +
          `${dispatched.length} on the page; a step emits one of each`,
      )
    }
    for (const { detail } of events) {
      if (detail.source !== 'agent' || detail.action !== action || !same(detail.changed, changed)) {
        throw new Divergence(`"${action}" emitted ${json(detail)}, which is not the step's change`)
      }
    }
    // The bridge dispatches on the element the handle names as the step ends, or on the document
    // when that element has left it. The element a snapshot read before or after may differ: a
    // closing panel leaves the document while its exit plays.
    const target = (dispatched[0] as Heard).target
    const element = this.elements.get(this.id) ?? null
    // A snapshot after the step hands the policy the element the member names now. A member
    // whose control changes with its state names a new one as the step ends (InlineEdit's
    // field gives way to its edit control on a save), and the bridge dispatches on that one.
    this.bridge.snapshot()
    const seen = this.seen.get(this.id) ?? new Set<Element>()
    const lawful =
      target === document ? !(element?.isConnected ?? false) : seen.has(target as Element)
    if (!lawful) {
      throw new Divergence(
        `"${action}" dispatched ${AGENT_CHANGE_EVENT} on ${target === document ? 'the document' : describe(target as Element)}, not on the member's element`,
      )
    }
  }

  /* ----------------------------------------------------------------------- */
  /* Statements                                                              */
  /* ----------------------------------------------------------------------- */

  async statement(statement: AgentConformanceStatement): Promise<void> {
    switch (statement.kind) {
      case 'state':
        return this.state(statement)
      case 'action':
        return this.action(statement)
      case 'destructive':
        return this.destructive(statement)
      case 'destructive-option':
        return this.destructiveOption(statement)
      case 'destructive-never':
        return this.destructiveNever()
      case 'withholds-contents':
        return this.withholds(statement)
    }
  }

  /**
   * The snapshot lists the state with a value of its type; with evidence, the
   * part shows that value, before and after each action that sets it; marked
   * secret, the snapshot holds `{ secret: true }` and a probe typed into the
   * member's field appears in no output.
   */
  private async state(statement: AgentStateStatement): Promise<void> {
    await this.onEntry(statement, (state) => this.mount(state), `"${statement.name}"`)
    const member = this.member()
    if (!Object.hasOwn(member.state, statement.name)) {
      throw new Divergence(
        `the snapshot lists no state "${statement.name}"; it lists ${Object.keys(member.state).join(', ') || 'none'}`,
      )
    }
    const value = member.state[statement.name]
    if (statement.secret) {
      if (!same(value, { secret: true })) {
        throw new Divergence(`"${statement.name}" is secret, and the snapshot holds ${json(value)}`)
      }
      await this.secret(statement)
      return
    }
    const fault = typeFault(value, statement.type)
    if (fault !== null)
      throw new Divergence(`"${statement.name}" is not ${statement.type}: ${fault}`)
    if (statement.type === 'id' && typeof value === 'string') {
      const declared = this.fence.states.some((state) => state.type === 'choices')
      if (declared && !this.choices(member).some((choice) => choice.id === value)) {
        throw new Divergence(
          `"${statement.name}" is "${value}", which names none of the member's choices`,
        )
      }
    }
    if (statement.evidence === undefined) return
    await this.agrees(statement)
    // A person confirms nothing here: the check is what the part shows after the action.
    this.reopen(() => true)
    for (const action of this.fence.actions) {
      if (action.sets !== statement.name) continue
      // A step that removed the member's element leaves nothing to act on.
      const now = this.listed()
      if (now === undefined) break
      if (!now.actions.some((listed) => listed.name === action.name)) continue
      let value: unknown
      try {
        value = this.probe(action, now)
      } catch (error) {
        if (error instanceof Unready) continue
        throw error
      }
      const { step } = await this.act(action.name, value)
      if (!step.ok) continue
      await this.agreesAfter(statement, step.changed, now.state[statement.name])
    }
  }

  /**
   * Types the probe into the member's field (the state's evidence part, else
   * its `field` part) and finds it in no output: not in the snapshot, not in
   * a query for it, and not in the result or change event of any action the
   * member allows. A field that takes digits only is typed the probe of digits.
   */
  private async secret(statement: AgentStateStatement): Promise<void> {
    const part = statement.evidence?.part ?? 'field'
    if (!(part in this.subject.parts)) {
      throw new Error(
        `${this.subject.member}: "${statement.name}" is secret, and the locator table has no "${part}" part to type into`,
      )
    }
    const field = this.all(part)[0]
    if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) {
      throw new Divergence(
        `the part "${part}" is ${describe(field ?? null)}, not a field to type into`,
      )
    }
    const typed =
      field.getAttribute('inputmode') === 'numeric' ? AGENT_SECRET_DIGITS : AGENT_SECRET_PROBE
    field.focus()
    await this.harness.keyboard(typed)
    await this.wait(
      () =>
        field.value.includes(typed)
          ? true
          : `typing into the part "${part}" left its value "${field.value}"`,
      AGREE_BUDGET,
    )
    const leaks: string[] = []
    const look = (where: string, output: unknown) => {
      if (json(output).includes(typed)) leaks.push(where)
    }
    const snapshot: AgentSnapshot = this.bridge.snapshot()
    look('the snapshot', snapshot)
    look('a query for its name', this.bridge.query({ name: typed }))
    look('a query for its text', this.bridge.query({ text: typed }))
    if (this.bridge.query({ name: typed }).length > 0) leaks.push('a query by name')
    if (this.bridge.query({ text: typed }).length > 0) leaks.push('a query by text')
    if (!same(this.member().state[statement.name], { secret: true })) leaks.push('the state')
    this.reopen(() => true)
    for (const action of this.fence.actions) {
      // A step that removed the member's element leaves nothing to act on.
      const now = this.listed()
      if (now === undefined) break
      if (!now.actions.some((listed) => listed.name === action.name)) continue
      let value: unknown
      try {
        value = this.probe(action, now)
      } catch (error) {
        if (error instanceof Unready) continue
        throw error
      }
      const { step, events } = await this.act(action.name, value)
      look(`the result of "${action.name}"`, step)
      look(
        `the change event of "${action.name}"`,
        events.map((heard) => heard.detail),
      )
    }
    if (leaks.length > 0) {
      throw new Divergence(
        `the value typed into "${statement.name}" reached ${[...new Set(leaks)].join(', ')}`,
      )
    }
  }

  /**
   * The snapshot lists the action with its argument type; it runs with a
   * probe value and reports success; the state it sets holds the new value,
   * `changed` names it and its evidence agrees; the handler it calls ran; it
   * emitted one change event. With an id, a disabled choice is refused first.
   */
  private async action(statement: AgentActionStatement): Promise<void> {
    const sets = statement.sets === undefined ? undefined : this.stateNamed(statement.sets)
    if (statement.sets !== undefined && sets === undefined) {
      throw new Divergence(
        `"${statement.name}" sets "${statement.sets}", which the fence declares no state for`,
      )
    }
    await this.onEntry(
      statement,
      async (state) => {
        await this.mount(state, this.spies(statement))
        await this.runAction(statement, sets)
      },
      `"${statement.name}"`,
    )
  }

  private async runAction(
    statement: AgentActionStatement,
    sets: AgentStateStatement | undefined,
  ): Promise<void> {
    const entry = this.mountedWith?.state ?? ''
    const member = this.member()
    const listed = member.actions.find((action) => action.name === statement.name)
    if (listed === undefined) {
      throw new Unready(
        `"${entry}" lists no action "${statement.name}"; it lists ${member.actions.map((action) => action.name).join(', ') || 'none'}`,
      )
    }
    if (listed.argument !== statement.argument) {
      throw new Divergence(
        `the snapshot lists "${statement.name}" with ${listed.argument ? `the argument ${listed.argument}` : 'no argument'}, and the fence gives it ${statement.argument ? `the argument ${statement.argument}` : 'none'}`,
      )
    }
    if (listed.among !== statement.among) {
      throw new Divergence(
        `the snapshot lists "${statement.name}" ${listed.among === undefined ? 'choosing among no one state' : `among ${listed.among}`}, and the fence gives it ${statement.among === undefined ? 'no `among`' : `among ${statement.among}`}`,
      )
    }
    if (listed.confirm === true && statement.argument !== 'id' && statement.argument !== 'ids') {
      throw new Unready(`"${entry}" asks a person to confirm "${statement.name}"`)
    }

    // A disabled choice is refused, and nothing runs.
    if (statement.argument === 'id' || statement.argument === 'ids') {
      const disabled = this.choices(member, statement.among).find(
        (choice) => choice.disabled === true,
      )
      if (disabled !== undefined) {
        const before = json(member.state)
        const value = statement.argument === 'id' ? disabled.id : [disabled.id]
        const { step } = await this.act(statement.name, value)
        if (step.ok || step.error.code !== 'invalid-value') {
          throw new Divergence(
            `"${statement.name}" with the disabled choice "${disabled.id}" returned ${json(step)}, not invalid-value`,
          )
        }
        if (this.called.length > 0 || json(this.member().state) !== before) {
          throw new Divergence(`"${statement.name}" with a disabled choice changed the member`)
        }
      }
    }

    // A choice of another list is refused, and nothing runs, when the action names its own.
    const other =
      statement.among === undefined ? undefined : this.otherChoice(member, statement.among)
    if (other !== undefined) {
      const before = json(this.member().state)
      const value = statement.argument === 'id' ? other.id : [other.id]
      const { step } = await this.act(statement.name, value)
      if (step.ok || step.error.code !== 'invalid-value') {
        throw new Divergence(
          `"${statement.name}" with "${other.id}", a choice of another list than ${statement.among ?? ''}, returned ${json(step)}, not invalid-value`,
        )
      }
      if (this.called.length > 0 || json(this.member().state) !== before) {
        throw new Divergence(
          `"${statement.name}" with a choice of another list than ${statement.among ?? ''} changed the member`,
        )
      }
    }

    const value = this.probe(statement, member)
    const before = sets === undefined ? undefined : member.state[sets.name]
    this.called.length = 0
    const watched =
      statement.presses === undefined ? undefined : this.watchPresses(statement.presses)
    let pressed: HTMLElement[] = []
    const { step, events } = await this.act(statement.name, value).finally(() => {
      pressed = watched?.() ?? []
    })
    if (!step.ok) {
      throw new Divergence(
        `"${statement.name}" with ${json(value)} on "${entry}" returned ${step.error.code}: ${step.error.message}`,
      )
    }
    if (sets !== undefined) {
      // A step that removed the member's element (a close) is read from its result.
      const now = this.listed()
      const after =
        now !== undefined ? now.state[sets.name] : (step.changed[sets.name]?.to ?? before)
      if (same(after, before, sets.type)) {
        const message = `"${statement.name}" left "${sets.name}" at ${json(before)} on "${entry}"`
        if (statement.argument === undefined) throw new Unready(message)
        throw new Divergence(message)
      }
      if (statement.argument !== undefined && !same(after, value, sets.type)) {
        throw new Divergence(
          `"${statement.name}" with ${json(value)} set "${sets.name}" to ${json(after)}`,
        )
      }
      const change = step.changed[sets.name]
      if (change === undefined || !same(change.to, after, sets.type)) {
        throw new Divergence(
          `the result of "${statement.name}" reports ${json(step.changed)}, which does not name "${sets.name}"`,
        )
      }
      await this.agreesAfter(sets, step.changed, before)
    }
    if (statement.calls !== undefined && !this.called.includes(statement.calls)) {
      throw new Divergence(
        `"${statement.name}" ran and ${statement.calls} was not called` +
          (this.called.length > 0 ? `; ${[...new Set(this.called)].join(', ')} was` : ''),
      )
    }
    if (statement.presses !== undefined) this.pressedOne(statement, value, member, pressed)
    this.oneEvent(statement.name, events, step.changed)
  }

  /**
   * Records each element of the part a click reaches, until the function it
   * returns is called, which returns them. `agentPress` is the element's own
   * `click()`, so the click's target is the element pressed.
   */
  private watchPresses(part: string): () => HTMLElement[] {
    const pressed: HTMLElement[] = []
    const listen = (event: Event) => {
      const target = event.target
      if (target instanceof HTMLElement && this.all(part).includes(target)) pressed.push(target)
    }
    document.addEventListener('click', listen, true)
    return () => {
      document.removeEventListener('click', listen, true)
      return pressed
    }
  }

  /**
   * The step pressed one element of the part, and for an action that takes an
   * id, the element is named by the label of the choice the id names, as a
   * person reads it.
   */
  private pressedOne(
    statement: AgentActionStatement,
    value: unknown,
    member: AgentSnapshotMember,
    pressed: readonly HTMLElement[],
  ): void {
    const part = statement.presses as string
    const [element] = pressed
    if (element === undefined || pressed.length > 1) {
      throw new Divergence(
        `"${statement.name}" pressed ${pressed.length === 0 ? 'no element' : `${pressed.length} elements`} of the part "${part}"; it presses one`,
      )
    }
    if (statement.argument !== 'id') return
    const label =
      this.choices(member, statement.among).find((choice) => choice.id === value)?.label ?? ''
    const name = words(this.harness.nameOf(element))
    if (label === '' || !name.startsWith(words(label))) {
      throw new Divergence(
        `"${statement.name}" with ${json(value)} pressed ${describe(element)} named "${name}", not the choice "${label}"`,
      )
    }
  }

  /**
   * Asks a person three ways for each action: with no one to ask, the step
   * needs confirmation and nothing changes; with a person who says no, it is
   * declined and nothing changes; with a person who says yes, it runs.
   */
  private async confirmed(
    action: AgentActionStatement,
    value: () => unknown,
    why: string,
  ): Promise<void> {
    for (const answer of ['none', 'no', 'yes'] as const) {
      await this.remount()
      this.reopen(answer === 'none' ? undefined : () => answer === 'yes')
      const member = this.member()
      const listed = member.actions.find((candidate) => candidate.name === action.name)
      if (listed === undefined) {
        throw new Divergence(`${why}, the snapshot lists no action "${action.name}"`)
      }
      if (listed.confirm !== true) {
        throw new Divergence(
          `${why}, the snapshot does not mark "${action.name}" for a person to confirm`,
        )
      }
      const before = json(member.state)
      this.called.length = 0
      const { step } = await this.act(action.name, value())
      if (answer === 'yes') {
        if (!step.ok) {
          throw new Divergence(
            `${why}, "${action.name}" with a person's yes returned ${step.error.code}: ${step.error.message}`,
          )
        }
        if (action.calls !== undefined && !this.called.includes(action.calls)) {
          throw new Divergence(
            `${why}, "${action.name}" ran with a person's yes and did not call ${action.calls}`,
          )
        }
        continue
      }
      const code = answer === 'none' ? 'needs-confirmation' : 'declined'
      if (step.ok) {
        throw new Divergence(
          `${why}, "${action.name}" ran ${answer === 'none' ? 'with no one to ask' : 'after the person said no'}: a person was not asked`,
        )
      }
      if (step.error.code !== code) {
        throw new Divergence(`${why}, "${action.name}" returned ${step.error.code}, not ${code}`)
      }
      await sleep(STAY)
      if (this.called.length > 0 || json(this.member().state) !== before) {
        throw new Divergence(
          `${why}, "${action.name}" changed the member while it waited for a person`,
        )
      }
    }
  }

  /** On an instance with the prop set to the value, every action asks a person. */
  private async destructive(statement: AgentDestructiveStatement): Promise<void> {
    const raw = statement.value
    const value: Override =
      raw === 'true'
        ? true
        : raw === 'false'
          ? false
          : /^-?\d+(?:\.\d+)?$/.test(raw)
            ? Number(raw)
            : raw
    const overrides = { ...this.spies(), [statement.prop]: value }
    const why = `with ${statement.prop}="${raw}"`
    let ran = false
    await this.onEntry(
      {},
      async (state) => {
        await this.mount(state, overrides)
        const member = this.member()
        const actions = this.fence.actions.filter((action) =>
          member.actions.some((listed) => listed.name === action.name),
        )
        if (actions.length === 0) throw new Unready(`"${state}" lists no action`)
        for (const action of actions) {
          let probe: unknown
          try {
            probe = this.probe(action, member)
          } catch (error) {
            if (error instanceof Unready) continue
            throw error
          }
          await this.confirmed(action, () => probe, why)
          ran = true
        }
        if (!ran) throw new Unready(`"${state}" offers no value for any action`)
      },
      statement.text,
      true,
    )
  }

  /** An action naming a choice marked destructive asks a person; one naming another choice does not. */
  private async destructiveOption(statement: AgentDestructiveOptionStatement): Promise<void> {
    const why = `naming a choice with ${statement.field}=${statement.value}`
    await this.onEntry(
      {},
      async (state) => {
        await this.mount(state, this.spies())
        const member = this.member()
        const markedIn = (action?: AgentActionStatement) =>
          this.choices(member, action?.among).find(
            (choice) => choice.destructive === true && choice.disabled !== true,
          )
        if (markedIn() === undefined) {
          throw new Unready(`"${state}" has no choice marked destructive`)
        }
        const actions = this.fence.actions.filter(
          (action) =>
            (action.argument === 'id' || action.argument === 'ids') &&
            member.actions.some((listed) => listed.name === action.name),
        )
        if (actions.length === 0) throw new Unready(`"${state}" lists no action that takes an id`)
        // Each action is asked about a marked choice of the list it chooses among.
        const asked = actions.filter((action) => markedIn(action) !== undefined)
        if (asked.length === 0) {
          throw new Unready(
            `"${state}" has no choice marked destructive in a list an action chooses among`,
          )
        }
        for (const action of asked) {
          const marked = markedIn(action) as Choice
          const value = action.argument === 'id' ? marked.id : [marked.id]
          await this.confirmed(action, () => value, why)
          // A choice that is not marked runs with no one to ask.
          await this.remount()
          this.reopen()
          let other: unknown
          try {
            other = this.probe(action, this.member())
          } catch (error) {
            if (error instanceof Unready) continue
            throw error
          }
          const { step } = await this.act(action.name, other)
          if (!step.ok) {
            throw new Divergence(
              `"${action.name}" with ${json(other)}, a choice not marked destructive, returned ${step.error.code}`,
            )
          }
        }
      },
      statement.text,
      true,
    )
  }

  /** On an instance with `tone` set to `danger`, every action runs with no one to ask. */
  private async destructiveNever(): Promise<void> {
    const overrides = { ...this.spies(), tone: 'danger' }
    await this.onEntry(
      {},
      async (state) => {
        await this.mount(state, overrides)
        const first = this.member()
        const actions = this.fence.actions.filter((action) =>
          first.actions.some((listed) => listed.name === action.name),
        )
        if (actions.length === 0) throw new Unready(`"${state}" lists no action`)
        for (const action of actions) {
          await this.remount()
          this.reopen()
          const member = this.member()
          const listed = member.actions.find((candidate) => candidate.name === action.name)
          if (listed?.confirm === true) {
            throw new Divergence(
              `with tone="danger", the snapshot marks "${action.name}" for a person to confirm`,
            )
          }
          let value: unknown
          try {
            value = this.probe(action, member)
          } catch (error) {
            if (error instanceof Unready) continue
            throw error
          }
          const { step } = await this.act(action.name, value)
          if (!step.ok) {
            throw new Divergence(
              `with tone="danger", "${action.name}" returned ${step.error.code}: ${step.error.message}`,
            )
          }
        }
      },
      'destructive never',
      true,
    )
  }

  /**
   * The member withholds what its regions hold: on a mount that registers a
   * member inside a region (its `withholds` element or elements, else its own
   * element, so the claim is not vacuous), the bridge lists the member and
   * none of those inside, no query finds one, and a step on one, by its id or
   * by a target that names it, never reaches it.
   */
  private async withholds(statement: AgentWithholdsStatement): Promise<void> {
    const { member } = this.subject
    await this.onEntry(
      statement,
      async (state) => {
        await this.mount(state)
        const registered = agentRegistrations()
        const self = registered.find((registration) => registration.id === this.id)
        const regions =
          self === undefined
            ? []
            : self.withholds.length > 0
              ? self.withholds
              : self.element === null
                ? []
                : [self.element]
        if (regions.length === 0)
          throw new Unready(`"${state}" draws no region for ${member} to withhold`)
        const inside = registered.filter(
          (registration) =>
            registration.id !== this.id &&
            registration.element !== null &&
            regions.some((region) => region.contains(registration.element)),
        )
        if (inside.length === 0) {
          throw new Unready(`"${state}" registers no member inside the region ${member} withholds`)
        }
        await this.withheld(inside)
      },
      statement.text,
    )
  }

  private async withheld(inside: readonly AgentRegistration[]): Promise<void> {
    const { member } = this.subject
    const ids = new Set(inside.map((registration) => registration.id))
    const named = (found: readonly { id: string; member: string; name: string }[]) =>
      found
        .filter((match) => ids.has(match.id))
        .map((match) => `${match.member} "${match.name}"`)
        .join(', ')
    const snapshot = this.bridge.snapshot()
    if (!snapshot.members.some((listed) => listed.id === this.id)) {
      throw new Divergence(`${member} is not listed in place of what it withholds`)
    }
    const listed = named(snapshot.members)
    if (listed !== '') {
      throw new Divergence(`the snapshot lists ${listed}, inside the region ${member} withholds`)
    }
    const queried = named([
      ...this.bridge.query({}),
      ...inside.flatMap((registration) => this.bridge.query({ member: registration.member })),
    ])
    if (queried !== '') {
      throw new Divergence(`a query finds ${queried}, inside the region ${member} withholds`)
    }
    for (const registration of inside) {
      const name = registration.element === null ? '' : this.harness.nameOf(registration.element)
      for (const step of [
        { id: registration.id, action: AGENT_UNDECLARED },
        {
          target: { member: registration.member, ...(name === '' ? {} : { name }) },
          action: AGENT_UNDECLARED,
        },
      ]) {
        const [result] = (await this.bridge.act([step])).results
        const failed = result !== undefined && !result.ok
        // By its id the member is unknown. A target never resolves to it, and may name a listed
        // member outside the region instead, which refuses the undeclared action itself.
        const refused =
          'id' in step
            ? failed && result.error.code === 'unknown-member'
            : failed && !ids.has(result.id ?? '')
        if (!refused) {
          throw new Divergence(
            `a step on ${registration.member}${name === '' ? '' : ` "${name}"`} ${'id' in step ? 'by its id' : 'by a target'}, inside the region ${member} withholds, returned ${json(result)}`,
          )
        }
      }
    }
  }

  /* ----------------------------------------------------------------------- */
  /* The member as a whole                                                   */
  /* ----------------------------------------------------------------------- */

  /** An action the fence does not declare is refused, with the fence's actions as the allowed list. */
  async undeclared(): Promise<void> {
    await this.onEntry(
      {},
      async (state) => {
        await this.mount(state)
        if (this.member().state['disabled'] === true) throw new Unready(`"${state}" is disabled`)
      },
      'an enabled member',
      true,
    )
    const declared = this.fence.actions.map((action) => action.name).sort()
    const listed = this.member()
      .actions.map((action) => action.name)
      .sort()
    if (json(listed) !== json(declared)) {
      throw new Divergence(
        `the snapshot lists the actions ${json(listed)}, and the fence declares ${json(declared)}`,
      )
    }
    const { step } = await this.act(AGENT_UNDECLARED)
    if (step.ok || step.error.code !== 'not-allowed') {
      throw new Divergence(`an undeclared action returned ${json(step)}, not not-allowed`)
    }
    const allowed = [...(step.error.allowed ?? [])].sort()
    if (json(allowed) !== json(declared)) {
      throw new Divergence(
        `an undeclared action is refused with the allowed list ${json(allowed)}, and the fence declares ${json(declared)}`,
      )
    }
  }

  /** On the disabled entry the member reads disabled, lists no action, and refuses a step with `disabled`. */
  async disabledEntry(): Promise<void> {
    const entry = disabledEntry(this.subject.states)
    if (entry === undefined) throw new Error(`${this.subject.member} has no disabled fixture entry`)
    try {
      await this.mount(entry, this.spies())
    } catch (error) {
      if (error instanceof Unready) throw new Divergence(error.message)
      throw error
    }
    const member = this.member()
    if (this.stateNamed('disabled') !== undefined && member.state['disabled'] !== true) {
      throw new Divergence(
        `on "${entry}" the state "disabled" is ${json(member.state['disabled'])}`,
      )
    }
    if (member.actions.length > 0) {
      throw new Divergence(
        `on "${entry}" the snapshot lists ${json(member.actions.map((action) => action.name))}; a disabled member lists none`,
      )
    }
    const [first] = this.fence.actions
    if (first === undefined) return
    const before = json(member.state)
    const { step } = await this.act(first.name, first.argument === undefined ? undefined : null)
    if (step.ok || step.error.code !== 'disabled') {
      throw new Divergence(`"${first.name}" on "${entry}" returned ${json(step)}, not disabled`)
    }
    await sleep(STAY)
    if (this.called.length > 0 || json(this.member().state) !== before) {
      throw new Divergence(`"${first.name}" on "${entry}" changed the member`)
    }
  }
}
