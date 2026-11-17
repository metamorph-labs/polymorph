'use client'

import {
  agentEntries,
  followAgentMembers,
  type AgentAction,
  type AgentArgumentType,
  type AgentEntry,
} from '../conventions/agent'
import { accessibleDescription, accessibleName, shownText } from './name'

/**
 * The agent bridge: what an agent reads from the mounted members and what it
 * may do to them.
 *
 * It reads the registry the engine's root keeps (`conventions/agent.ts`), in
 * which each mounted member's handle states what its spec's `agent` fence
 * declares. The bridge reports those states and runs those actions, and
 * nothing else. An application's policy can only take a member or an action
 * away. A secret value never leaves the bridge, and a destructive action runs
 * only after a person confirms it.
 */

/** Why a step failed. */
export type AgentErrorCode =
  | 'unknown-member'
  | 'ambiguous-target'
  | 'not-allowed'
  | 'disabled'
  | 'invalid-value'
  | 'needs-confirmation'
  | 'declined'
  | 'failed'

/**
 * An action a snapshot lists: allowed now, with the type of its argument, the
 * state whose choices an `id` or `ids` argument names, and whether a person
 * confirms it.
 */
export interface AgentSnapshotAction {
  name: string
  argument?: AgentArgumentType
  /** For an `id` or `ids` argument: the `choices` state it names a choice of. Absent when it names a choice of any. */
  among?: string
  /** A person confirms the action before it runs: always for a destructive instance, and for a choice marked destructive. */
  confirm?: true
}

/** One mounted member, as an agent reads it. */
export interface AgentSnapshotMember {
  /** Stable while the instance is mounted. */
  id: string
  /** The member's name (`Checkbox`). */
  member: string
  /** The accessible name of the member's control. */
  name: string
  /**
   * The accessible description of the member's control: the text of the
   * elements its `aria-describedby` names, in order, such as a field's hint
   * and its error. Absent when empty, and for a member that holds a secret.
   */
  description?: string
  /** The id of the nearest member whose element contains this one's. */
  within?: string
  /** The declared states. A secret one is `{ secret: true }`. */
  state: Record<string, unknown>
  /** The actions allowed now. */
  actions: AgentSnapshotAction[]
}

export interface AgentSnapshot {
  members: AgentSnapshotMember[]
}

/** What `query` matches. Each field ignores case and matches a substring; every field given must match. */
export interface AgentQuery {
  /** The accessible name, or the label of one of the member's choices. */
  name?: string
  /** The text the member's element shows. */
  text?: string
  /** The member's name (`Checkbox`), matched whole. */
  member?: string
}

export interface AgentMatch {
  id: string
  member: string
  name: string
  /** The choice whose label matched `name`. */
  option?: { id: string; label: string }
}

/** One action to run: on the member with `id`, or on the one member `target` names. */
export interface AgentStep {
  id?: string
  target?: { member?: string; name?: string }
  action: string
  value?: unknown
}

export interface AgentChange {
  from: unknown
  to: unknown
}

export interface AgentError {
  code: AgentErrorCode
  message: string
  /** With `not-allowed`: the actions the member allows now. */
  allowed?: string[]
}

export type AgentStepResult =
  | { ok: true; id: string; changed: Record<string, AgentChange> }
  | { ok: false; id?: string; error: AgentError }

export interface AgentActResult {
  results: AgentStepResult[]
}

/** What a step that succeeded reports: to `subscribe`'s listeners, and as the detail of `polymorph:agentchange`. */
export interface AgentChangeDetail {
  id: string
  member: string
  action: string
  changed: Record<string, AgentChange>
  source: 'agent'
}

/** What an application's policy reads about a member. */
export interface AgentPolicyMember {
  readonly id: string
  readonly member: string
  readonly name: string
  readonly element: Element | null
}

/**
 * An application's narrowing of what the members declare. `hide` takes a
 * member out of every output, and `deny` takes an action away from a member.
 * Each answers yes or no, so a policy cannot add a member, a state or an
 * action. A policy that throws hides or denies.
 */
export interface AgentPolicy {
  hide?: (member: AgentPolicyMember) => boolean
  deny?: (member: AgentPolicyMember, action: string) => boolean
}

/** What a person is asked to confirm. */
export interface AgentConfirmRequest {
  id: string
  member: string
  name: string
  action: string
  value?: unknown
}

export interface AgentBridgeOptions {
  /** Asks a person, and resolves true for yes. Without it every destructive action is refused. */
  confirm?: (request: AgentConfirmRequest) => boolean | Promise<boolean>
  /** Narrowing only. */
  policy?: AgentPolicy
  /** How long a step waits for the member's state to change after its action, in milliseconds. */
  settleMs?: number
}

export interface AgentBridge {
  snapshot(): AgentSnapshot
  query(query: AgentQuery): AgentMatch[]
  /** Runs the steps in order and stops at the first failure. Never rejects. */
  act(steps: readonly AgentStep[]): Promise<AgentActResult>
  /** Calls `listener` after each step that succeeds. Returns the function that stops it. */
  subscribe(listener: (change: AgentChangeDetail) => void): () => void
  /** True while a step's action runs, so an application's handler can tell an agent's change from a person's. */
  readonly acting: boolean
  /** Stops the bridge: it reports no member and runs no step after this. */
  dispose(): void
}

/** The event a step that succeeds dispatches on its member's element, bubbling. */
export const AGENT_CHANGE_EVENT = 'polymorph:agentchange'

/** How long a step waits for a member's state to change, by default. */
export const AGENT_SETTLE_MS = 150

/** How often a step reads the member's state again while it waits. */
const POLL_MS = 16

/** What a secret value is reported as. */
const SECRET = { secret: true } as const

/** What a secret is replaced with inside a name or a label. */
const HIDDEN = '[secret]'

/** A choice of a `choices` state. */
interface Choice {
  id: string
  label: string
  disabled?: boolean
  destructive?: boolean
}

/** A member read once, for one operation. */
interface Read {
  entry: AgentEntry
  element: Element | null
  /**
   * The regions whose members this one withholds: its `withholds` element or
   * elements, or its own element when it holds a secret. Empty for a member
   * that withholds nothing.
   */
  regions: readonly Element[]
  state: Record<string, unknown>
  name: string
  policy: AgentPolicyMember
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * A `choices` state: a list whose every item has a string `id` and a string
 * `label`. The bridge knows no spec type, so it recognises one by its shape.
 */
const isChoices = (value: unknown): value is Choice[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every(
    (item) => isObject(item) && typeof item.id === 'string' && typeof item.label === 'string',
  )

/** A value as text, for comparing two reads of a state. */
function text(value: unknown): string {
  try {
    return JSON.stringify(value) ?? 'undefined'
  } catch {
    return String(value)
  }
}

/** A value as plain JSON, so an output holds no live reference into the page. */
function plain(value: unknown): unknown {
  if (value === undefined) return null
  try {
    return JSON.parse(JSON.stringify(value)) as unknown
  } catch {
    return null
  }
}

/** Every string a value holds, numbers written as text. */
function strings(value: unknown, into: string[] = []): string[] {
  if (typeof value === 'string') into.push(value)
  else if (typeof value === 'number' || typeof value === 'bigint') into.push(String(value))
  else if (Array.isArray(value)) value.forEach((item) => strings(item, into))
  else if (isObject(value)) Object.values(value).forEach((item) => strings(item, into))
  return into
}

/** Whether a value holds a secret anywhere in it. */
const tainted = (value: unknown, secrets: readonly string[]): boolean =>
  secrets.length > 0 &&
  strings(value).some((held) => secrets.some((secret) => held.includes(secret)))

/** Text with every secret in it replaced. */
function scrub(source: string, secrets: readonly string[], by = HIDDEN): string {
  let out = source
  for (const secret of secrets) out = out.split(secret).join(by)
  return out
}

const lower = (value: string) => value.toLocaleLowerCase()

/** The argument type an action declares, or `undefined` for one that takes none. */
const argumentOf = (action: AgentAction): AgentArgumentType | undefined =>
  typeof action === 'function' ? undefined : action.argument

/** The state whose choices an action's `id` or `ids` names, or `undefined` for every one. */
const amongOf = (action: AgentAction): string | undefined =>
  typeof action === 'function' || (action.argument !== 'id' && action.argument !== 'ids')
    ? undefined
    : action.among

/** The choices of every `choices` state of a member. */
const choicesOf = (state: Record<string, unknown>): Choice[] =>
  Object.values(state).flatMap((value) => (isChoices(value) ? value : []))

/**
 * The choices an action's argument names one of: those of the state it chooses
 * among, or of every `choices` state when it names none. A state that holds no
 * choices offers none.
 */
function choicesFor(action: AgentAction, state: Record<string, unknown>): Choice[] {
  const among = amongOf(action)
  if (among === undefined) return choicesOf(state)
  const held = Object.hasOwn(state, among) ? state[among] : undefined
  return isChoices(held) ? held : []
}

/** Calls a policy's or a handle's function, failing closed: a throw counts as `true`. */
function yes(run: (() => unknown) | undefined): boolean {
  if (run === undefined) return false
  try {
    return Boolean(run())
  } catch {
    return true
  }
}

/** A timer that also ends when `wake` is called. */
function pause(ms: number, wakers: Set<() => void>): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer)
      wakers.delete(done)
      resolve()
    }
    const timer = setTimeout(done, ms)
    wakers.add(done)
  })
}

const failure = (
  code: AgentErrorCode,
  message: string,
  id?: string,
  allowed?: string[],
): AgentStepResult => ({
  ok: false,
  ...(id === undefined ? {} : { id }),
  error: { code, message, ...(allowed === undefined ? {} : { allowed }) },
})

/**
 * The regions a member withholds: its `withholds` element, or each element of
 * the list it gives, else its own element when it holds a secret. A
 * `withholds` that throws withholds the member's own element, so a fault keeps
 * the member's contents from an agent rather than handing them over.
 */
function regionsOf(entry: AgentEntry, element: Element | null): readonly Element[] {
  const { withholds, secret } = entry.handle
  const own = element === null ? [] : [element]
  if (withholds !== undefined) {
    try {
      const given = withholds()
      const regions = (Array.isArray(given) ? given : [given]).filter((region): region is Element =>
        Boolean(region),
      )
      if (regions.length > 0) return regions
    } catch {
      return own
    }
  }
  return (secret?.length ?? 0) > 0 ? own : []
}

/**
 * Creates a bridge over the members mounted on this page. Each bridge reads
 * the same registry, so two bridges report the same ids.
 */
export function createAgentBridge(options: AgentBridgeOptions = {}): AgentBridge {
  const { confirm, policy = {}, settleMs = AGENT_SETTLE_MS } = options
  const listeners = new Set<(change: AgentChangeDetail) => void>()
  const wakers = new Set<() => void>()
  let acting = false
  let disposed = false
  let queue: Promise<unknown> = Promise.resolve()
  // A member that unmounts while a step waits for it ends the wait.
  const unfollow = followAgentMembers(() => [...wakers].forEach((wake) => wake()))

  /** Every registered member that reads without throwing, in document order. */
  function readAll(): Read[] {
    const reads: Read[] = []
    for (const entry of agentEntries()) {
      try {
        const element = entry.handle.element() ?? null
        const state = { ...entry.handle.state() }
        const name = accessibleName(element)
        reads.push({
          entry,
          element,
          regions: regionsOf(entry, element),
          state,
          name,
          policy: Object.freeze({ id: entry.id, member: entry.handle.member, name, element }),
        })
      } catch {
        // A member that cannot be read is not reported.
      }
    }
    // A member with no element goes last; the sort is stable, so ties keep the registration order.
    return reads.sort((a, b) => {
      if (a.element === b.element) return 0
      if (a.element === null || b.element === null) return a.element === null ? 1 : -1
      return a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING
        ? -1
        : 1
    })
  }

  /**
   * The secrets on the page now: the values of the states each handle marks
   * secret, and the value of every password field in the documents the
   * members are in.
   */
  function secretsOf(reads: readonly Read[]): string[] {
    const found = new Set<string>()
    const documents = new Set<Document>()
    if (typeof document !== 'undefined') documents.add(document)
    for (const read of reads) {
      if (read.element) documents.add(read.element.ownerDocument)
      for (const key of read.entry.handle.secret ?? []) {
        for (const held of strings(read.state[key])) found.add(held)
      }
    }
    for (const page of documents) {
      for (const field of page.querySelectorAll<HTMLInputElement>('input[type="password"]'))
        found.add(field.value)
    }
    found.delete('')
    // Longest first, so a secret inside a longer one is replaced as part of it.
    return [...found].sort((a, b) => b.length - a.length)
  }

  /**
   * Whether another member withholds this one: its element is one of that
   * member's regions or inside one. A member that withholds its contents
   * (ConfirmDialog's panel, ApprovalCard's card) keeps a person's controls from
   * an agent, and a member that holds a secret keeps the members it draws
   * (PasswordInput's Input), whose values are the secret. A withheld member is
   * not listed, matched or run, and the policy cannot list it.
   */
  const withheld = (read: Read, reads: readonly Read[]) =>
    read.element !== null &&
    reads.some(
      (holder) => holder !== read && holder.regions.some((region) => region.contains(read.element)),
    )

  /**
   * The members an agent sees: each whose element is in the document and not
   * in content marked `hidden`, that no other member withholds and that the
   * policy does not hide. A member with no element (a closed Dialog, a
   * Pagination with one page) shows a person nothing, so it is not listed,
   * matched or run. Neither is a member in `hidden` content, which a browser
   * does not draw: one renderer keeps a closed panel in the document with that
   * attribute (a collapsible's or an accordion's content, a tab's panel) where
   * another removes it, and an agent is given the same members by both.
   */
  const visible = (reads: readonly Read[]) =>
    reads.filter(
      (read) =>
        read.element !== null &&
        read.element.isConnected &&
        read.element.closest('[hidden]') === null &&
        !withheld(read, reads) &&
        !yes(policy.hide && (() => policy.hide?.(read.policy))),
    )

  /**
   * A member's description for an output, with every secret replaced. A
   * member that holds a secret, or whose control is a password field, gives
   * none, because the text that describes such a field can repeat its value.
   */
  function descriptionOf(read: Read, secrets: readonly string[]): string {
    if ((read.entry.handle.secret?.length ?? 0) > 0) return ''
    if (read.element?.matches('input[type="password"]') === true) return ''
    return scrub(accessibleDescription(read.element), secrets)
  }

  const disabled = (read: Read) => read.state['disabled'] === true

  /** Whether an action asks a person first whatever its value: the instance is destructive. */
  const destructive = (read: Read) => yes(read.entry.handle.destructive)

  /** The actions a member allows now. */
  function allowed(read: Read): AgentSnapshotAction[] {
    if (disabled(read)) return []
    const out: AgentSnapshotAction[] = []
    for (const [name, action] of Object.entries(read.entry.handle.actions)) {
      if (yes(policy.deny && (() => policy.deny?.(read.policy, name)))) continue
      const argument = argumentOf(action)
      const among = amongOf(action)
      const chooses = argument === 'id' || argument === 'ids'
      const marked =
        chooses && choicesFor(action, read.state).some((choice) => choice.destructive === true)
      const asks = destructive(read) || marked
      out.push({
        name,
        ...(argument ? { argument } : {}),
        ...(among === undefined ? {} : { among }),
        ...(asks ? { confirm: true as const } : {}),
      })
    }
    return out
  }

  /** A member's states for an output: a secret one, or one that holds a secret, is `{ secret: true }`. */
  function stateOut(read: Read, secrets: readonly string[]): Record<string, unknown> {
    const marked = new Set(read.entry.handle.secret ?? [])
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(read.state)) {
      out[key] = marked.has(key) || tainted(value, secrets) ? { ...SECRET } : plain(value)
    }
    return out
  }

  /** The id of the nearest shown member whose element contains this one's. */
  function withinOf(read: Read, shown: ReadonlyMap<Element, string>): string | undefined {
    for (let at = read.element?.parentElement; at; at = at.parentElement) {
      const id = shown.get(at)
      if (id !== undefined) return id
    }
    return undefined
  }

  function snapshot(): AgentSnapshot {
    if (disposed) return { members: [] }
    const reads = readAll()
    const secrets = secretsOf(reads)
    const shown = visible(reads)
    const elements = new Map<Element, string>()
    for (const read of shown)
      if (read.element && !elements.has(read.element)) elements.set(read.element, read.entry.id)
    return {
      members: shown.map((read) => {
        const within = withinOf(read, elements)
        const description = descriptionOf(read, secrets)
        return {
          id: read.entry.id,
          member: read.entry.handle.member,
          name: scrub(read.name, secrets),
          ...(description === '' ? {} : { description }),
          ...(within === undefined ? {} : { within }),
          state: stateOut(read, secrets),
          actions: allowed(read),
        }
      }),
    }
  }

  function query(search: AgentQuery): AgentMatch[] {
    if (disposed) return []
    const reads = readAll()
    const secrets = secretsOf(reads)
    const wanted = isObject(search) ? search : {}
    const needle = (value: unknown) => (typeof value === 'string' ? lower(value) : undefined)
    const name = needle(wanted.name)
    const shows = needle(wanted.text)
    const member = needle(wanted.member)
    // A secret is replaced by a character no needle holds, so no needle matches it or across it.
    const matches = (haystack: string, found: string) =>
      !found.includes('\u0000') && lower(scrub(haystack, secrets, '\u0000')).includes(found)
    const out: AgentMatch[] = []
    for (const read of visible(reads)) {
      if (member !== undefined && lower(read.entry.handle.member) !== member) continue
      if (
        shows !== undefined &&
        !matches(shownText(read.element), shows) &&
        !matches(descriptionOf(read, secrets), shows)
      )
        continue
      const base = {
        id: read.entry.id,
        member: read.entry.handle.member,
        name: scrub(read.name, secrets),
      }
      if (name === undefined || matches(read.name, name)) out.push(base)
      if (name === undefined) continue
      const marked = new Set(read.entry.handle.secret ?? [])
      for (const [key, value] of Object.entries(read.state)) {
        if (marked.has(key) || !isChoices(value) || tainted(value, secrets)) continue
        for (const choice of value) {
          if (matches(choice.label, name))
            out.push({ ...base, option: { id: choice.id, label: choice.label } })
        }
      }
    }
    return out
  }

  /** The member a step names, or why it names none. */
  function resolve(step: Record<string, unknown>, shown: readonly Read[]): Read | AgentStepResult {
    if (typeof step.id === 'string') {
      return (
        shown.find((read) => read.entry.id === step.id) ??
        failure('unknown-member', `No member has the id "${step.id}".`, step.id)
      )
    }
    if (!isObject(step.target))
      return failure('unknown-member', 'The step names no member: give an id or a target.')
    const { member, name } = step.target
    const candidates = shown.filter(
      (read) =>
        (typeof member !== 'string' || lower(read.entry.handle.member) === lower(member)) &&
        (typeof name !== 'string' || lower(read.name) === lower(name.trim())),
    )
    const found =
      candidates.length > 0 || typeof name !== 'string'
        ? candidates
        : shown.filter(
            (read) =>
              (typeof member !== 'string' || lower(read.entry.handle.member) === lower(member)) &&
              lower(read.name).includes(lower(name.trim())),
          )
    if (found.length === 1) return found[0] as Read
    if (found.length === 0) return failure('unknown-member', 'No member matches the target.')
    return failure(
      'ambiguous-target',
      `${found.length} members match the target. Name one by id: ${found.map((read) => read.entry.id).join(', ')}.`,
    )
  }

  /**
   * Why a value does not fit an action's argument, or `undefined` when it
   * fits. An id names an enabled choice of `choices`: the choices of the
   * state the action chooses among (`among`), or of every `choices` state.
   */
  function invalid(
    argument: AgentArgumentType | undefined,
    value: unknown,
    choices: readonly Choice[],
    action: string,
    among: string | undefined,
  ): string | undefined {
    if (argument === undefined) return value === undefined ? undefined : `${action} takes no value.`
    if (argument === 'boolean')
      return typeof value === 'boolean' ? undefined : `${action} takes true or false.`
    if (argument === 'number')
      return typeof value === 'number' && Number.isFinite(value)
        ? undefined
        : `${action} takes a number.`
    if (argument === 'text') return typeof value === 'string' ? undefined : `${action} takes text.`
    const enabled = new Set(
      choices.filter((choice) => choice.disabled !== true).map((choice) => choice.id),
    )
    const of =
      among === undefined ? "the member's enabled choices" : `the enabled choices of "${among}"`
    if (argument === 'id')
      return typeof value === 'string' && enabled.has(value)
        ? undefined
        : `${action} takes the id of one of ${of}.`
    return Array.isArray(value) &&
      value.every((item) => typeof item === 'string' && enabled.has(item))
      ? undefined
      : `${action} takes a list of ids of ${of}.`
  }

  async function runStep(raw: unknown): Promise<AgentStepResult> {
    if (!isObject(raw))
      return failure('invalid-value', 'A step is an object with a member and an action.')
    const reads = readAll()
    const secrets = secretsOf(reads)
    const shown = visible(reads)
    const read = resolve(raw, shown)
    if ('ok' in read) return read
    const { id, handle } = read.entry
    const name = typeof raw.action === 'string' ? raw.action : ''
    const action = Object.hasOwn(handle.actions, name) ? handle.actions[name] : undefined
    const denied =
      action !== undefined && yes(policy.deny && (() => policy.deny?.(read.policy, name)))
    if (action === undefined || denied) {
      const message = denied
        ? `The application does not allow ${name} on this member.`
        : `${handle.member} has no action "${name}".`
      return failure(
        'not-allowed',
        scrub(message, secrets),
        id,
        allowed(read).map((entry) => entry.name),
      )
    }
    if (disabled(read))
      return failure('disabled', `The member is disabled, so it allows no action.`, id)
    const argument = argumentOf(action)
    // An action that names the list it chooses among is checked against that list only.
    const choices = choicesFor(action, read.state)
    const fault = invalid(argument, raw.value, choices, name, amongOf(action))
    if (fault !== undefined) return failure('invalid-value', fault, id)
    const named =
      argument === 'id' ? [raw.value] : argument === 'ids' ? (raw.value as unknown[]) : []
    if (
      destructive(read) ||
      choices.some((choice) => choice.destructive === true && named.includes(choice.id))
    ) {
      if (confirm === undefined)
        return failure(
          'needs-confirmation',
          `${name} needs a person to confirm it, and the page asks no one.`,
          id,
        )
      let answer = false
      try {
        answer =
          (await confirm({
            id,
            member: handle.member,
            name: scrub(read.name, secrets),
            action: name,
            ...(raw.value === undefined ? {} : { value: plain(raw.value) }),
          })) === true
      } catch {
        answer = false
      }
      if (!answer) return failure('declined', `The person declined ${name}.`, id)
      if (!agentEntries().includes(read.entry))
        return failure('unknown-member', 'The member was removed while the person was asked.', id)
    }

    // Read again: the state may have changed while the person was asked.
    let before = read.state
    try {
      before = { ...handle.state() }
    } catch {
      // The read the step started from stands.
    }
    const was = text(before)
    acting = true
    try {
      const ran =
        typeof action === 'function'
          ? action()
          : (action.run as (value: unknown) => unknown)(raw.value)
      if (ran !== null && typeof (ran as PromiseLike<unknown> | undefined)?.then === 'function')
        await ran
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return failure('failed', scrub(`${name} failed: ${message}`, secretsOf(readAll())), id)
    } finally {
      acting = false
    }

    // The renderer writes the change after the action returns. A timer, not an animation frame,
    // because a hidden tab runs no frames.
    const start = Date.now()
    let after = before
    for (let wait = 0; ; wait = POLL_MS) {
      await pause(wait, wakers)
      if (!agentEntries().includes(read.entry)) break
      try {
        after = { ...handle.state() }
      } catch {
        break
      }
      if (text(after) !== was) {
        // A machine's state changes before its renderer writes the document, so the renderer
        // gets one more turn before the step reports.
        await pause(0, wakers)
        try {
          after = { ...handle.state() }
        } catch {
          // The last read stands.
        }
        break
      }
      if (Date.now() - start >= settleMs) break
    }

    // The element the member names after the step, else the one it named before, if either is
    // still in the document; a step that removed the member's element (a close) dispatches on
    // the document.
    const element = (() => {
      try {
        const now = handle.element()
        if (now?.isConnected) return now
      } catch {
        // The element before the step stands.
      }
      return read.element?.isConnected ? read.element : null
    })()
    const hidden = [...new Set([...secrets, ...secretsOf(readAll())])].sort(
      (a, b) => b.length - a.length,
    )
    const marked = new Set(handle.secret ?? [])
    const changed: Record<string, AgentChange> = {}
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (marked.has(key) || text(before[key]) === text(after[key])) continue
      if (tainted(before[key], hidden) || tainted(after[key], hidden)) continue
      changed[key] = { from: plain(before[key]), to: plain(after[key]) }
    }
    const detail: AgentChangeDetail = {
      id,
      member: handle.member,
      action: name,
      changed,
      source: 'agent',
    }
    for (const listener of [...listeners]) {
      try {
        listener(detail)
      } catch {
        // A listener's fault is the application's and does not fail the step.
      }
    }
    const target = element?.isConnected
      ? element
      : typeof document === 'undefined'
        ? null
        : document
    target?.dispatchEvent(new CustomEvent(AGENT_CHANGE_EVENT, { bubbles: true, detail }))
    return { ok: true, id, changed }
  }

  async function runSteps(steps: unknown): Promise<AgentActResult> {
    if (!Array.isArray(steps))
      return { results: [failure('invalid-value', 'act takes a list of steps.')] }
    const results: AgentStepResult[] = []
    for (const step of steps) {
      const result = disposed
        ? failure('unknown-member', 'The bridge is disposed.')
        : await runStep(step)
      results.push(result)
      if (!result.ok) break
    }
    return { results }
  }

  return {
    snapshot,
    query,
    act(steps) {
      // One act at a time, so two agents' steps never interleave.
      const run = queue.then(() => runSteps(steps))
      queue = run.catch(() => undefined)
      return run.catch(() => ({
        results: [failure('failed', 'The bridge failed to run the steps.')],
      }))
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    get acting() {
      return acting
    },
    dispose() {
      disposed = true
      unfollow()
      listeners.clear()
      ;[...wakers].forEach((wake) => wake())
    },
  }
}
