import { gallerySlug } from './slug'

/**
 * The agent registry: the mounted members an agent may read and operate.
 *
 * A member whose spec has an `## Agent` section registers a handle here while
 * it is mounted, in every framework: React's members through `useAgentMember`,
 * the generated members through the mount effect their description's `agent`
 * block becomes. The handle states what the spec's `agent` fence declares: the
 * states an agent reads and the actions it may run. The bridge
 * (`@polymorph/engine/agent`) reads this registry and is the only reader.
 *
 * This module is all a page without a bridge carries: a list of handles, a way
 * for a bridge to follow additions and removals, and the two DOM helpers a
 * member's actions write through. It holds no runtime logic, so an application
 * that never creates a bridge pays for the list and each member's closures.
 */

/** The type of the one argument an action takes. */
export type AgentArgumentType = 'boolean' | 'number' | 'text' | 'id' | 'ids'

/** The value each argument type hands an action's `run`. */
export interface AgentArgumentValues {
  boolean: boolean
  number: number
  text: string
  /** The id of one of the member's choices. */
  id: string
  /** Ids of the member's choices. */
  ids: readonly string[]
}

/**
 * An action an agent may run: a function that takes no argument, or `run`
 * with the type of its one argument. The registry is not shipped to the page,
 * so the handle declares the argument's type itself, and the bridge checks a
 * value against it before `run` is called. The bridge awaits a promise the
 * action returns and ignores any other value.
 *
 * An `id` or `ids` argument names choices of the member's `choices` states.
 * `among` names the one state whose choices it names, as the fence's
 * `among <state>` does: the bridge then checks the value, and whether a person
 * confirms it, against that state's choices only. Without `among` it checks
 * them against every `choices` state the member has.
 */
export type AgentAction =
  | (() => unknown)
  | {
      [Type in AgentArgumentType]: {
        readonly argument: Type
        readonly among?: Type extends 'id' | 'ids' ? string : never
        readonly run: (value: AgentArgumentValues[Type]) => unknown
      }
    }[AgentArgumentType]

/** What a mounted member registers: the states and actions its spec's `agent` fence declares. */
export interface AgentHandle {
  /** The member's name, as the registry names it (`Checkbox`). */
  readonly member: string
  /** The control, which carries the member's accessible name. */
  readonly element: () => Element | null | undefined
  /** The declared states, read now. */
  readonly state: () => Readonly<Record<string, unknown>>
  /** The declared actions, by name. */
  readonly actions: Readonly<Record<string, AgentAction>>
  /** The states whose values never leave the bridge. */
  readonly secret?: readonly string[]
  /** True while this instance needs a person to confirm each action (`tone="danger"`). */
  readonly destructive?: () => boolean
  /**
   * The element whose registered members are not an agent's: the bridge lists,
   * matches and runs none of the members whose element is it or inside it
   * (`withholds contents`). It is separate from `element`, because the control
   * that names a member can be smaller than the region it holds.
   *
   * A list of elements is a region each. A member whose own parts sit in one
   * container beside what the application passed it gives its parts one by
   * one, so the application's controls stay an agent's: PromptInput gives its
   * attachment row and its own Buttons, and not the toolbar that also holds
   * its `leading` slot.
   */
  readonly withholds?: () => Element | readonly (Element | null | undefined)[] | null | undefined
}

/** A registered handle and the id the bridge reports it by, stable while it is registered. */
export interface AgentEntry {
  readonly id: string
  readonly handle: AgentHandle
}

const entries = new Set<AgentEntry>()
const followers = new Set<() => void>()
let registered = 0

function changed(): void {
  for (const follower of [...followers]) {
    try {
      follower()
    } catch {
      // A bridge's follower never stops a member from mounting or unmounting.
    }
  }
}

/**
 * Registers a mounted member and returns the function that removes it. Each
 * registration gets its own id, so a member mounted again is a new entry.
 */
export function agentMember(handle: AgentHandle): () => void {
  registered += 1
  const entry: AgentEntry = { id: `${gallerySlug(handle.member)}-${registered}`, handle }
  entries.add(entry)
  changed()
  return () => {
    if (entries.delete(entry)) changed()
  }
}

/** The registered entries, in the order they were registered. The bridge reads them. */
export function agentEntries(): readonly AgentEntry[] {
  return [...entries]
}

/** Calls `follower` after each addition and removal. Returns the function that stops it. */
export function followAgentMembers(follower: () => void): () => void {
  followers.add(follower)
  return () => {
    followers.delete(follower)
  }
}

/**
 * Writes `text` into an input or a textarea as a person's typing does, so the
 * renderer's own change path runs. The value is set through the native setter
 * of the element's prototype, not through the element's own `value`, because
 * React keeps the last value it saw on the element itself and fires no
 * `onChange` for a value it already saw. A bubbling `input` event follows,
 * which React, Vue, Svelte, Solid and Angular each listen for.
 */
export function agentFill(element: Element | null | undefined, text: string): void {
  if (!element || (element.localName !== 'input' && element.localName !== 'textarea')) {
    throw new TypeError('agentFill writes an input or a textarea')
  }
  let prototype: object | null = Object.getPrototypeOf(element) as object | null
  while (prototype !== null) {
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
    if (setter) {
      setter.call(element, text)
      element.dispatchEvent(new Event('input', { bubbles: true }))
      return
    }
    prototype = Object.getPrototypeOf(prototype) as object | null
  }
  throw new TypeError('agentFill found no value setter')
}

/**
 * Activates a control with its own `click()`, as a press does: a submit
 * button submits its form, a checkbox toggles, and a disabled control does
 * nothing.
 */
export function agentPress(element: Element | null | undefined): void {
  const control = element as HTMLElement | null | undefined
  if (!control || typeof control.click !== 'function') {
    throw new TypeError('agentPress presses an HTML element')
  }
  control.click()
}
