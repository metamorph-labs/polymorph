/**
 * The conformance runner: executes one statement of a member's behaviour
 * contract (`docs/conformance.md`) against a rendered shell, in a real browser.
 *
 * It knows no framework. A shell reaches it through a `MountAdapter`, which
 * renders one states fixture entry and returns the element it rendered into.
 * Input and inspection reach it through a `Harness`: the law that calls the
 * runner supplies a keyboard, a pointer, a role and name reader and a retrying
 * wait. So the same statements, with the same runner, check the React shell
 * and every generated shell, each through its own adapter.
 *
 * It imports nothing but the DOM. The statement types below are written out
 * structurally, so a shell's adapter can be checked against them without
 * importing the registry. Each shell's law pins them to
 * `@polymorph/registry/behaviour`'s, so the two cannot drift.
 *
 * A statement names parts, and `parts.ts` locates each one with a selector over
 * what every shell renders by contract: ARIA, `data-member`, the recipe's
 * `data-*` attributes and a member's part hooks. A statement names a state,
 * and the runner starts from that fixture entry. Without one it tries the
 * entries in order and starts from the first that renders what the statement
 * needs. `parts.ts` also names the handler props a member calls when a key
 * or a click takes effect, and the runner mounts spies in them wherever the
 * effect is the handler running, or is nothing at all.
 */

import {
  conformAgent,
  isAgentStatement,
  type AgentConformanceContract,
  type AgentConformanceStatement,
  type ChoiceProbe,
  type ValueProbe,
} from './agent'

/* -------------------------------------------------------------------------- */
/* The statements, structurally                                               */
/* -------------------------------------------------------------------------- */

export type ConformanceEffect =
  | 'opens'
  | 'closes'
  | 'activates'
  | 'moves-focus-next'
  | 'moves-focus-previous'
  | 'moves-focus-first'
  | 'moves-focus-last'
  | 'selects'
  | 'clears'
  | 'commits'
  | 'increments'
  | 'decrements'
  | 'focuses'
  | 'nothing'

/** What a pointer click on a part does. */
export type ConformanceClickEffect = 'activates'

interface Said {
  text: string
  /** A states fixture entry's full name, already resolved from the contract's `when`. */
  state?: string
}

/** A statement of a contract fence or of an agent fence (`agent.ts`). */
export type ConformanceStatement = BehaviourStatement | AgentConformanceStatement

/** A statement of a spec's contract fence. */
export type BehaviourStatement = Said &
  (
    | { kind: 'role'; part: string; role: string }
    | { kind: 'name'; part: string; from: string }
    | { kind: 'key'; key: string; effect: ConformanceEffect; on?: string; into?: string }
    | { kind: 'click'; effect: ConformanceClickEffect; on: string }
    | { kind: 'focus'; moment: 'on-open'; part: string }
    | { kind: 'focus'; moment: 'on-close'; target: 'trigger' | 'previous' | 'nearest' }
    | { kind: 'dismiss'; by: 'outside' | 'escape' | 'both' | 'none' }
    | {
        kind: 'announces'
        channel: 'busy' | 'live:polite' | 'live:assertive'
        says?: string
        state: string
      }
    | { kind: 'attr'; part: string; attribute: string; value: string | null; state: string }
  )

/* -------------------------------------------------------------------------- */
/* What a shell and a harness provide                                         */
/* -------------------------------------------------------------------------- */

export interface Mounted {
  /** The element the entry rendered into. Portalled surfaces live outside it. */
  root: HTMLElement
  unmount(): void
}

/**
 * A prop value the runner sets: a probe string, a spy in a handler prop, a
 * prop value a `destructive when` names, or a list of entries whose handlers
 * hold spies (`CHOICE_PROBES`).
 */
export type Override = string | number | boolean | readonly unknown[] | ((...args: never[]) => void)

export interface MountProps {
  /** The states fixture entry to render, by its full name. */
  state: string
  /** Props set on the member inside that entry, over the fixture's own. */
  overrides?: Readonly<Record<string, Override>>
}

/** How a framework's shell renders a member for the runner. */
export interface MountAdapter {
  mount(member: string, props: MountProps): Promise<Mounted>
}

/** Input and inspection, supplied by the law that runs the statements. */
export interface Harness {
  /** Presses keys, in user-event's keyboard syntax (`{Enter}`, `{Shift>}{Tab}{/Shift}`). */
  keyboard(keys: string): Promise<void>
  /** A real pointer press on an element. */
  click(element: Element): Promise<void>
  /** Moves the real pointer over an element, pressing nothing, whatever covers it. */
  hover(element: Element): Promise<void>
  /** The element's ARIA role, explicit or native, or `null` when it has none. */
  roleOf(element: Element): string | null
  /** The element's accessible name. */
  nameOf(element: Element): string
  /** Retries `check` until it stops throwing, or rethrows after `timeout` ms. */
  waitFor<T>(check: () => T, timeout: number): Promise<T>
  /** Sets the size of the window the entries render in, in CSS pixels. */
  viewport(width: number, height: number): Promise<void>
}

/** A window's size in CSS pixels, at which a fixture entry is mounted (`WINDOW_SIZES`). */
export interface WindowSize {
  readonly width: number
  readonly height: number
}

/** One member, as the runner needs it. */
export interface ConformanceSubject {
  member: string
  /** The member's `data-member` value, which locates `root` unless `parts` says otherwise. */
  slug: string
  /** The states fixture's entry names, in fixture order. */
  states: readonly string[]
  /** The whole contract: `focus` and `dismiss` open and close the way its `key` lines say. */
  contract: readonly BehaviourStatement[]
  /** The whole agent fence, which an agent statement reads its states and actions from. */
  agent?: AgentConformanceContract | null
  /**
   * Props that give the member entries whose own handlers hold spies, for an
   * action that calls an entry's handler (`CHOICE_PROBES` in `parts.ts`).
   */
  choiceProbes?: ChoiceProbe
  /**
   * The text or number an action that takes one is given, for a member that
   * reads only some values (`VALUE_PROBES` in `parts.ts`).
   */
  valueProbe?: ValueProbe
  /**
   * The fixture entries mounted at a window size other than the default, by
   * entry name, with that size (`WINDOW_SIZES` in `parts.ts`). The agent runner
   * sets the size before it mounts such an entry and restores the window after.
   */
  windows?: Readonly<Record<string, WindowSize>>
  /** Part name to selector (`parts.ts`). A selector starting `:scope` searches the mount only. */
  parts: Readonly<Record<string, string>>
  /**
   * The handler props the member calls when a key takes effect (`parts.ts`).
   * `nothing` fails when one is called, and `activates` on a native button
   * holds only when one is, or when the button's own state changes.
   */
  handlers?: readonly string[]
}

export type Outcome = { pass: true } | { pass: false; reason: string }

/* -------------------------------------------------------------------------- */
/* The run                                                                    */
/* -------------------------------------------------------------------------- */

/** A statement that does not hold, with the reason in words. */
class Divergence extends Error {}

/** The value the runner sets on a prop to see where an accessible name comes from. */
const NAME_PROBE = 'Conformance probe'

/** Typed into an empty field before a `commits` or `clears` key, so there is a draft. */
const DRAFT = 'conformance'

const CLOSE_BUDGET = 2_000
const STAY_BUDGET = 300
/** How long a trigger with no opening key gets to open on focus alone, before a press. */
const FOCUS_OPENS = 1_500

/**
 * The element the real pointer is moved over: a 2px speck above everything.
 * The pointer rests on one in the bottom-left corner of the viewport while an
 * entry mounts, where entries (which render from the top) and portalled panels
 * (beside their triggers, centred, or at the end edge) do not.
 */
const SPECK = 'position:fixed;width:2px;height:2px;z-index:2147483647'

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]):not([type="hidden"]), ' +
  'textarea:not([disabled]), select:not([disabled]), [tabindex]'

/**
 * The attributes whose change shows that a control acted: its checked,
 * pressed, selected and expanded states, Radix's and Zag's `data-state`, and
 * the `data-selected` a recipe draws a selected row with.
 */
const STATE_ATTRIBUTES = [
  'aria-checked',
  'aria-pressed',
  'aria-selected',
  'aria-expanded',
  'data-state',
  'data-selected',
]

/** An element's state attributes, an absent one told apart from an empty one (`data-selected=""`). */
const stateOf = (element: Element): string =>
  JSON.stringify(STATE_ATTRIBUTES.map((attribute) => element.getAttribute(attribute)))

/** Roles that hold a set of items a key moves between. */
const COMPOSITES = new Set([
  'tablist',
  'menu',
  'menubar',
  'listbox',
  'radiogroup',
  'grid',
  'tree',
  'treegrid',
  'toolbar',
])

/** The roles of the items a virtually focused list holds. */
const ITEM_ROLES = new Set(['option', 'gridcell', 'treeitem', 'menuitem', 'menuitemcheckbox'])

/** Item roles that count as one set when they share a composite. */
const FAMILIES = [
  ['menuitem', 'menuitemcheckbox', 'menuitemradio'],
  ['gridcell', 'cell', 'columnheader', 'rowheader'],
]

/**
 * Runs one statement: a contract statement here, and an agent statement in
 * `agent.ts`, through the same adapter and harness.
 */
export async function conform(
  subject: ConformanceSubject,
  statement: ConformanceStatement,
  adapter: MountAdapter,
  harness: Harness,
): Promise<Outcome> {
  if (isAgentStatement(statement)) return conformAgent(subject, statement, adapter, harness)
  const run = new Run(subject, adapter, harness)
  try {
    await run.statement(statement)
    return { pass: true }
  } catch (error) {
    if (error instanceof Divergence) return { pass: false, reason: error.message }
    throw error
  } finally {
    run.dispose()
  }
}

/** Moves the real pointer to a point of the viewport, over a speck placed there for it. */
async function pointAt(harness: Harness, x: number, y: number): Promise<void> {
  const speck = document.createElement('div')
  speck.id = 'conformance-pointer-rest'
  speck.style.cssText = `${SPECK};left:${Math.max(0, x - 1)}px;top:${Math.max(0, y - 1)}px`
  document.body.append(speck)
  try {
    await harness.hover(speck)
  } finally {
    speck.remove()
  }
}

/**
 * Moves the pointer out of the way before an entry mounts. A pointer press
 * leaves it where the last trigger was, and an entry that renders a trigger
 * under it would open on hover before any statement had run. The speck has
 * an id, so a harness that addresses elements by selector finds it however
 * the page's other nodes come and go while the move is in flight.
 */
export async function restPointer(harness: Harness): Promise<void> {
  await pointAt(harness, 0, window.innerHeight - 2)
}

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Two frames and a beat: an entry's effects have run, and a layer's deferred listeners are attached. */
async function settle(ms = 80): Promise<void> {
  await frame()
  await frame()
  await sleep(ms)
}

/** `Shift+Tab` in user-event's syntax. */
function keystrokes(key: string): string {
  const pieces = key.split('+')
  const name = pieces.pop() as string
  const press = name === 'Space' ? ' ' : `{${name}}`
  return (
    pieces.map((modifier) => `{${modifier}>}`).join('') +
    press +
    [...pieces]
      .reverse()
      .map((modifier) => `{/${modifier}}`)
      .join('')
  )
}

const squash = (text: string) => text.replace(/\s+/g, '')

function describe(element: Element | null): string {
  if (element === null) return 'nothing'
  if (element === document.body) return '<body>'
  const tag = element.tagName.toLowerCase()
  const role = element.getAttribute('role')
  const label = element.getAttribute('aria-label') ?? element.textContent?.trim().slice(0, 30)
  return `<${tag}${role ? ` role="${role}"` : ''}>${label ? ` "${label}"` : ''}`
}

function isDisabled(element: Element): boolean {
  return (
    element.getAttribute('aria-disabled') === 'true' ||
    element.hasAttribute('data-disabled') ||
    (element as HTMLButtonElement).disabled === true
  )
}

function isSelected(element: Element): boolean {
  return (
    ['aria-selected', 'aria-checked', 'aria-pressed'].some(
      (attribute) => element.getAttribute(attribute) === 'true',
    ) ||
    (element.hasAttribute('aria-current') && element.getAttribute('aria-current') !== 'false') ||
    ['checked', 'active', 'on'].includes(element.getAttribute('data-state') ?? '')
  )
}

function focusTarget(element: HTMLElement): HTMLElement {
  if (element.matches(FOCUSABLE)) return element
  return element.querySelector<HTMLElement>(FOCUSABLE) ?? element
}

function isField(element: Element | null): element is HTMLInputElement | HTMLTextAreaElement {
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
}

/** The element a key acts on: the focused one, or the item its `aria-activedescendant` names. */
function current(): HTMLElement | null {
  const active = document.activeElement as HTMLElement | null
  if (active === null || active === document.body) return null
  const id = active.getAttribute('aria-activedescendant')
  const target = id ? document.getElementById(id) : null
  return target ?? active
}

/** A number the element shows: `aria-valuenow`, else the digits of its field's text. */
function numberOf(element: Element | null): number | null {
  if (element === null) return null
  const now = element.getAttribute('aria-valuenow')
  if (now !== null && now !== '') return Number(now)
  if (isField(element)) {
    const digits = element.value.replace(/[^\d.-]/g, '')
    return digits === '' ? null : Number(digits)
  }
  return null
}

class Run {
  private mounted: Mounted | null = null
  private readonly cleanups: (() => void)[] = []
  /**
   * The handler props whose spies have been called since the last mount. A
   * check counts only the calls after its own key or click, so a handler the
   * member calls while it mounts is not taken for the key's effect.
   */
  private readonly called: string[] = []

  constructor(
    private readonly subject: ConformanceSubject,
    private readonly adapter: MountAdapter,
    private readonly harness: Harness,
  ) {}

  dispose(): void {
    for (const cleanup of this.cleanups.splice(0)) cleanup()
    this.mounted?.unmount()
    this.mounted = null
  }

  /* ----------------------------------------------------------------------- */
  /* Mounting and locating                                                   */
  /* ----------------------------------------------------------------------- */

  private async mount(state: string, overrides?: Record<string, Override>): Promise<Mounted> {
    this.mounted?.unmount()
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    await this.rest()
    this.called.length = 0
    this.mounted = await this.adapter.mount(this.subject.member, {
      state,
      ...(overrides ? { overrides } : {}),
    })
    await settle()
    return this.mounted
  }

  /** Moves the pointer out of the way before an entry mounts (`restPointer`). */
  private async rest(): Promise<void> {
    await restPointer(this.harness)
  }

  private async pointAt(x: number, y: number): Promise<void> {
    await pointAt(this.harness, x, y)
  }

  /** A spy in each of the member's handler props, recording into `called`. */
  private spies(): Record<string, Override> | undefined {
    const handlers = this.subject.handlers ?? []
    if (handlers.length === 0) return undefined
    return Object.fromEntries(
      handlers.map((handler) => [handler, () => void this.called.push(handler)]),
    )
  }

  /**
   * Mounts the statement's entry, or the first entry for which `ready` holds.
   * `ready` returns `true`, or a sentence saying what the entry lacks.
   */
  private async mountWhere(
    statement: BehaviourStatement,
    ready: () => true | string,
    overrides?: Record<string, Override>,
  ): Promise<Mounted> {
    const candidates = statement.state ? [statement.state] : this.subject.states
    let last = ''
    for (const state of candidates) {
      const mounted = await this.mount(state, overrides)
      const verdict = ready()
      if (verdict === true) return mounted
      last = `"${state}" ${verdict}`
    }
    throw new Divergence(
      statement.state
        ? `the entry ${last}`
        : `no fixture entry is ready for it (the last: ${last})`,
    )
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

  has(part: string): boolean {
    return part === 'root' || part in this.subject.parts
  }

  all(part: string): HTMLElement[] {
    const selector = this.selector(part)
    const scope: ParentNode =
      selector.startsWith(':scope') && this.mounted ? this.mounted.root : document
    return [...scope.querySelectorAll<HTMLElement>(selector)].filter(
      (element) => element.closest('[hidden]') === null,
    )
  }

  one(part: string): HTMLElement {
    const found = this.all(part)[0]
    if (found === undefined) throw new Divergence(`no element is the part "${part}"`)
    return found
  }

  /** Whether the member's popup is up. Members without a `panel` part have none. */
  private open(): boolean {
    return this.all('panel').some((panel) => panel.getAttribute('data-state') !== 'closed')
  }

  private present(part: string): true | string {
    return this.all(part).length > 0 ? true : `renders no part "${part}"`
  }

  /* ----------------------------------------------------------------------- */
  /* Opening and closing, the way the contract says                          */
  /* ----------------------------------------------------------------------- */

  /** The contract's first opening key, and the part it is pressed on. */
  private opener(): { key: string; on: string } | null {
    for (const statement of this.subject.contract) {
      if (statement.kind === 'key' && statement.effect === 'opens') {
        return { key: statement.key, on: statement.on ?? 'trigger' }
      }
    }
    return null
  }

  private closingKey(): string {
    for (const statement of this.subject.contract) {
      if (statement.kind === 'key' && statement.effect === 'closes' && statement.on === undefined) {
        return statement.key
      }
    }
    return 'Escape'
  }

  /** A closed entry: the trigger is there and the panel is not. */
  private closedEntry(statement: BehaviourStatement): Promise<Mounted> {
    return this.mountWhere(statement, () => {
      const trigger = this.present('trigger')
      if (trigger !== true) return trigger
      return this.open() ? 'is already open' : true
    })
  }

  /**
   * Opens the member the way its contract does: the first `opens` key, pressed
   * on its part (the trigger unless it names another). With no opening key,
   * focus on the trigger, then a pointer press on it. Returns the element
   * focused just before.
   */
  private async openFromTrigger(): Promise<Element | null> {
    const opener = this.opener()
    const name = opener?.on ?? 'trigger'
    const part = this.one(name)
    const target = focusTarget(part)
    target.focus()
    this.landed(part, name)
    const before = document.activeElement
    if (opener !== null) await this.harness.keyboard(keystrokes(opener.key))
    // A member that opens on focus (a tooltip, a hover card) is open already.
    else if (!(await this.holds(() => this.open(), FOCUS_OPENS))) await this.harness.click(target)
    await this.wait(() => this.open() || 'the panel did not open', CLOSE_BUDGET)
    await settle()
    return before
  }

  /** The statement's entry with the panel up: open on mount, or opened from its trigger. */
  private async openEntry(statement: BehaviourStatement): Promise<void> {
    if (statement.state) {
      await this.mount(statement.state)
      if (!this.open()) await this.openFromTrigger()
      return
    }
    for (const state of this.subject.states) {
      await this.mount(state)
      if (this.open()) return
    }
    await this.closedEntry(statement)
    await this.openFromTrigger()
  }

  /**
   * Waits for `check` to hold, and throws its last verdict as a divergence when
   * it does not. Anything else that goes wrong (a runner bug, an adapter that
   * throws, a member that crashes) is not a finding about the member's
   * behaviour, so it propagates as the error it is.
   */
  private async wait(check: () => true | string, timeout: number): Promise<void> {
    await this.harness.waitFor(() => {
      const verdict = check()
      if (verdict !== true) throw new Divergence(verdict)
    }, timeout)
  }

  /** Whether `check` comes to hold within `timeout`. Errors other than "not yet" propagate. */
  private async holds(check: () => boolean, timeout: number): Promise<boolean> {
    try {
      await this.harness.waitFor(() => {
        if (!check()) throw new Divergence('not yet')
      }, timeout)
      return true
    } catch (error) {
      if (error instanceof Divergence) return false
      throw error
    }
  }

  /**
   * Throws when focusing a part left focus outside it: a part that takes no
   * focus and holds nothing that does. A key pressed then would go to the page,
   * and a statement about the part would hold or fail without the part taking
   * part in it.
   */
  private landed(part: Element, name: string): void {
    const active = document.activeElement
    if (active === null || !part.contains(active)) {
      throw new Divergence(`focusing the part "${name}" left focus on ${describe(active)}`)
    }
  }

  /**
   * A press outside the member, dispatched rather than performed, because a
   * modal's scrim covers the page and the pointer harness aims at an element's
   * centre, which is the panel. Outside means outside the panel, the trigger,
   * the element the entry rendered into and every element carrying the
   * member's `data-member`, so a press that lands on the member's own field or
   * frame is never mistaken for one outside it. Radix and React Aria both
   * listen on the document for the press and the release.
   *
   * A reader's press comes with what the dispatched events lack, and the
   * runner supplies both. The real pointer moves to the corner first, so a
   * member held open by the pointer over its trigger (Zag's tooltip) sees it
   * leave. And a dispatched press has no default action, so a `mousedown`
   * nobody prevented moves focus as a real one does: to the focusable element
   * under it, or out of the member when there is none.
   */
  private async pressOutside(): Promise<void> {
    const avoid = [
      ...this.all('panel'),
      ...(this.has('trigger') ? this.all('trigger') : []),
      ...(this.mounted ? [this.mounted.root] : []),
      ...document.querySelectorAll(`[data-member="${this.subject.slug}"]`),
    ]
    const inset = 4
    const corners: [number, number][] = [
      [inset, window.innerHeight - inset],
      [window.innerWidth - inset, window.innerHeight - inset],
      [window.innerWidth - inset, inset],
      [inset, inset],
    ]
    for (const [x, y] of corners) {
      const target = document.elementFromPoint(x, y)
      if (target === null || avoid.some((element) => element.contains(target))) continue
      await this.pointAt(x, y)
      const init = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y }
      target.dispatchEvent(
        new PointerEvent('pointerdown', { ...init, pointerType: 'mouse', isPrimary: true }),
      )
      if (target.dispatchEvent(new MouseEvent('mousedown', init))) {
        const focusable = target.closest<HTMLElement>(FOCUSABLE)
        if (focusable !== null) focusable.focus()
        else if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      }
      target.dispatchEvent(
        new PointerEvent('pointerup', { ...init, pointerType: 'mouse', isPrimary: true }),
      )
      target.dispatchEvent(new MouseEvent('mouseup', init))
      target.dispatchEvent(new MouseEvent('click', init))
      return
    }
    throw new Divergence('the panel covers every corner of the viewport, so nothing is outside it')
  }

  /* ----------------------------------------------------------------------- */
  /* Statements                                                              */
  /* ----------------------------------------------------------------------- */

  async statement(statement: BehaviourStatement): Promise<void> {
    switch (statement.kind) {
      case 'role':
        return this.role(statement)
      case 'name':
        return this.name(statement)
      case 'key':
        return this.key(statement)
      case 'click':
        return this.click(statement)
      case 'focus':
        return statement.moment === 'on-open'
          ? this.focusOnOpen(statement, statement.part)
          : this.focusOnClose(statement, statement.target)
      case 'dismiss':
        return this.dismiss(statement, statement.by)
      case 'announces':
        return this.announces(statement, statement.channel, statement.says)
      case 'attr':
        return this.attr(statement, statement.part, statement.attribute, statement.value)
    }
  }

  private async role(statement: BehaviourStatement & { part: string; role: string }) {
    await this.mountWhere(statement, () => this.present(statement.part))
    const element = this.one(statement.part)
    const role = this.harness.roleOf(element)
    if (role !== statement.role) {
      throw new Divergence(`${describe(element)} has the role ${role ?? 'none'}`)
    }
  }

  /**
   * From a prop: the runner sets the prop to a probe value, and the name must
   * be the probe. From children: the name is computed from the part's content,
   * so it is not empty, no `aria-label` or `aria-labelledby` replaces it, and
   * it is text the part contains.
   */
  private async name(statement: BehaviourStatement & { part: string; from: string }) {
    const fromProp = statement.from !== 'children'
    await this.mountWhere(
      statement,
      () => this.present(statement.part),
      fromProp ? { [statement.from]: NAME_PROBE } : undefined,
    )
    const element = this.one(statement.part)
    const name = this.harness.nameOf(element)
    if (fromProp) {
      if (name !== NAME_PROBE) {
        throw new Divergence(
          `with ${statement.from}="${NAME_PROBE}", ${describe(element)} is named "${name}"`,
        )
      }
      return
    }
    if (name.trim() === '') throw new Divergence(`${describe(element)} has no accessible name`)
    if (element.hasAttribute('aria-label') || element.hasAttribute('aria-labelledby')) {
      throw new Divergence(`${describe(element)} is named by an attribute, not by its content`)
    }
    if (!squash(element.textContent ?? '').includes(squash(name))) {
      throw new Divergence(`${describe(element)} is named "${name}", which it does not contain`)
    }
  }

  private async focusOnOpen(statement: BehaviourStatement, part: string) {
    await this.closedEntry(statement)
    await this.openFromTrigger()
    await this.wait(() => {
      const active = document.activeElement
      return this.all(part).some((element) => element.contains(active))
        ? true
        : `focus is on ${describe(active)}, outside the part "${part}"`
    }, CLOSE_BUDGET)
  }

  private async focusOnClose(
    statement: BehaviourStatement,
    target: 'trigger' | 'previous' | 'nearest',
  ) {
    await this.closedEntry(statement)
    if (target === 'nearest') return this.focusOnCloseNearest()
    const before = await this.openFromTrigger()
    await this.harness.keyboard(keystrokes(this.closingKey()))
    await this.wait(() => (this.open() ? 'the panel did not close' : true), CLOSE_BUDGET)
    // Radix restores focus when its focus scope unmounts, after the exit.
    await this.wait(() => {
      const active = document.activeElement
      const back =
        target === 'previous'
          ? active === before
          : this.all('trigger').some((element) => element.contains(active))
      return back ? true : `focus went to ${describe(active)}, not to the ${target}`
    }, CLOSE_BUDGET)
  }

  /**
   * The trigger leaves the page while the member is open, as a row leaves with
   * its own button when a dialog it opened deletes the row. The runner puts a
   * Button of its own just after the element the entry rendered into, opens the
   * member, takes that element out of the document, closes the member and waits
   * for focus on its Button: the first focusable element after where the
   * trigger was. The element goes back before the statement ends, so the entry
   * unmounts as it mounted.
   */
  private async focusOnCloseNearest() {
    const root = this.mounted?.root
    const parent = root?.parentNode
    if (!root || !parent) throw new Error('the entry rendered into no element in the document')
    const after = document.createElement('button')
    after.textContent = 'After the trigger'
    parent.insertBefore(after, root.nextSibling)
    try {
      await this.openFromTrigger()
      root.remove()
      await this.harness.keyboard(keystrokes(this.closingKey()))
      await this.wait(() => (this.open() ? 'the panel did not close' : true), CLOSE_BUDGET)
      await this.wait(() => {
        const active = document.activeElement
        return active === after
          ? true
          : `focus went to ${describe(active)}, not to the nearest focusable element`
      }, CLOSE_BUDGET)
    } finally {
      if (!root.isConnected) parent.insertBefore(root, after)
      after.remove()
    }
  }

  private async dismiss(statement: BehaviourStatement, by: 'outside' | 'escape' | 'both' | 'none') {
    const expected = {
      escape: by === 'escape' || by === 'both',
      outside: by === 'outside' || by === 'both',
    }
    const found: Record<'escape' | 'outside', boolean> = { escape: false, outside: false }

    for (const gesture of ['escape', 'outside'] as const) {
      await this.openEntry(statement)
      if (!this.open()) throw new Divergence('the panel is not open to dismiss')
      // Radix attaches its outside-press listener a tick after the layer mounts.
      await settle(120)
      if (gesture === 'escape') await this.harness.keyboard('{Escape}')
      else await this.pressOutside()
      found[gesture] = await this.holds(
        () => !this.open(),
        expected[gesture] ? CLOSE_BUDGET : STAY_BUDGET,
      )
    }

    const wrong = (['escape', 'outside'] as const).filter(
      (gesture) => found[gesture] !== expected[gesture],
    )
    if (wrong.length > 0) {
      throw new Divergence(
        wrong
          .map(
            (gesture) =>
              `${gesture === 'escape' ? 'Escape' : 'a press outside'} ${found[gesture] ? 'closes' : 'does not close'} it`,
          )
          .join('; '),
      )
    }
  }

  /**
   * The channel is on the member: in the element the entry rendered into, in an
   * element carrying the member's `data-member`, or in its panel. A region
   * elsewhere on the page (a page-wide announcer, another member's status)
   * says nothing about this one. With a message, a region of the channel holds
   * those words.
   */
  private async announces(
    statement: BehaviourStatement,
    channel: 'busy' | 'live:polite' | 'live:assertive',
    says: string | undefined,
  ) {
    await this.mountWhere(statement, () => true)
    const selector = {
      busy: '[aria-busy="true"]',
      'live:polite':
        '[aria-live="polite"], [role="status"]:not([aria-live]), [role="log"]:not([aria-live])',
      'live:assertive': '[aria-live="assertive"], [role="alert"]:not([aria-live])',
    }[channel]
    const scopes: Element[] = [
      (this.mounted as Mounted).root,
      ...document.querySelectorAll(`[data-member="${this.subject.slug}"]`),
      ...(this.has('panel') ? this.all('panel') : []),
    ]
    // A region in a hidden subtree announces nothing, so it says nothing about the member.
    const regions = new Set(
      scopes
        .flatMap((scope) => [
          ...(scope.matches(selector) ? [scope] : []),
          ...scope.querySelectorAll(selector),
        ])
        .filter((region) => region.closest('[hidden], [aria-hidden="true"]') === null),
    )
    if (regions.size === 0) throw new Divergence(`nothing in the member matches ${selector}`)
    if (says === undefined) return
    const words = (element: Element) => (element.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (![...regions].some((region) => words(region).includes(says))) {
      throw new Divergence(
        `no ${channel} region says "${says}"; they say ${[...regions]
          .map((region) => `"${words(region)}"`)
          .join(', ')}`,
      )
    }
  }

  private async attr(
    statement: BehaviourStatement,
    part: string,
    attribute: string,
    value: string | null,
  ) {
    await this.mountWhere(statement, () => this.present(part))
    const element = this.one(part)
    const actual = element.getAttribute(attribute)
    if (actual === null) throw new Divergence(`${describe(element)} has no ${attribute}`)
    if (value !== null && actual !== value) {
      throw new Divergence(`${describe(element)} has ${attribute}="${actual}"`)
    }
  }

  /* ----------------------------------------------------------------------- */
  /* Keys                                                                    */
  /* ----------------------------------------------------------------------- */

  private async key(
    statement: BehaviourStatement & { key: string; effect: ConformanceEffect; on?: string },
  ) {
    const { effect } = statement
    if (effect === 'focuses') return this.focuses(statement)
    const on = statement.on ?? (effect === 'opens' && this.has('trigger') ? 'trigger' : undefined)
    const hasPanel = this.has('panel')

    // Where a key's effect is a handler running, or nothing at all, the
    // member's handler props hold spies.
    const spied = effect === 'activates' || effect === 'nothing' ? this.spies() : undefined
    if (effect === 'closes' && hasPanel) await this.openEntry(statement)
    else if (effect === 'opens' && hasPanel) await this.closedEntry(statement)
    else await this.mountWhere(statement, () => (on ? this.present(on) : true), spied)

    // Where the key goes: the part, or wherever the entry left focus. A move
    // backwards starts from the last item, so a composite that does not wrap
    // still has somewhere to go.
    const backwards = effect === 'moves-focus-previous' || effect === 'moves-focus-first'
    if (on !== undefined) {
      const matches = this.all(on).filter((element) => !isDisabled(element))
      const start = backwards ? matches[matches.length - 1] : matches[0]
      if (start === undefined) throw new Divergence(`no enabled element is the part "${on}"`)
      focusTarget(start).focus()
      this.landed(start, on)
      await settle(20)
    }
    if (backwards) await this.stepIn(statement)

    const press = () => this.harness.keyboard(keystrokes(statement.key))
    switch (effect) {
      case 'opens':
      case 'closes':
        return this.openOrClose(effect, hasPanel, press)
      case 'activates':
        return this.activates(press)
      case 'moves-focus-next':
      case 'moves-focus-previous':
      case 'moves-focus-first':
      case 'moves-focus-last':
        return this.moves(effect, press, /^(?:Shift\+)?Tab$/.test(statement.key))
      case 'selects':
        return this.selects(press)
      case 'commits':
        return this.commits(press)
      case 'clears':
        return this.clears(statement, press)
      case 'increments':
      case 'decrements':
        return this.steps(effect, press)
      case 'nothing':
        return this.nothing(press)
    }
  }

  /**
   * A key pressed from the page, outside the member, that puts focus in one of
   * its parts. The runner puts focus on a Button of its own, outside the
   * element the entry rendered into, presses the key there and waits for focus
   * in the part.
   */
  private async focuses(statement: BehaviourStatement & { key: string; into?: string }) {
    const into = statement.into
    if (into === undefined) throw new Error(`"${statement.text}" names no part to focus`)
    await this.mountWhere(statement, () => this.present(into))
    const page = document.createElement('button')
    page.textContent = 'On the page'
    document.body.prepend(page)
    try {
      page.focus()
      if (document.activeElement !== page) {
        throw new Divergence(
          `focus cannot rest on the page: it is on ${describe(document.activeElement)}`,
        )
      }
      await this.harness.keyboard(keystrokes(statement.key))
      await this.wait(() => {
        const active = document.activeElement
        return this.all(into).some((element) => element.contains(active))
          ? true
          : `focus is on ${describe(active)}, outside the part "${into}"`
      }, CLOSE_BUDGET)
    } finally {
      page.remove()
    }
  }

  private async openOrClose(
    effect: 'opens' | 'closes',
    hasPanel: boolean,
    press: () => Promise<void>,
  ) {
    const opening = effect === 'opens'
    if (hasPanel) {
      if (this.open() === opening) {
        throw new Divergence(`the panel is already ${opening ? 'open' : 'closed'}`)
      }
      await press()
      await this.wait(
        () => (this.open() === opening ? true : `the panel did not ${opening ? 'open' : 'close'}`),
        CLOSE_BUDGET,
      )
      return
    }
    // No popup: the disclosure is the focused control's `aria-expanded`.
    const control = document.activeElement
    if (control === null || !control.hasAttribute('aria-expanded')) {
      throw new Divergence(`${describe(control)} has no panel and no aria-expanded to change`)
    }
    const want = opening ? 'true' : 'false'
    if (control.getAttribute('aria-expanded') === want) {
      throw new Divergence(`${describe(control)} is already aria-expanded="${want}"`)
    }
    await press()
    await this.wait(
      () =>
        control.getAttribute('aria-expanded') === want
          ? true
          : `${describe(control)} stayed aria-expanded="${control.getAttribute('aria-expanded')}"`,
      CLOSE_BUDGET,
    )
  }

  /**
   * The focused control's action ran: one of the member's handlers was called,
   * its state changed, or a click reached it. A native button turns Enter and
   * Space into a click whatever its handler does, even while that handler is
   * guarded off, so on a native button a click counts only when the member
   * passes it on to another of its elements (a file picker): otherwise a
   * handler must run or the state must change.
   */
  private async activates(press: () => Promise<void>) {
    const target = current()
    if (target === null) throw new Divergence('nothing has focus to activate')
    const native = target instanceof HTMLButtonElement
    let clicked = false
    let forwarded = false
    const listen = (event: Event) => {
      const origin = event.target as Element
      if (target.contains(origin) || origin.contains(target)) clicked = true
      else if (this.mounted?.root.contains(origin)) forwarded = true
      // A link would navigate the test page away. The click is what counts.
      if (origin.closest?.('a[href]')) event.preventDefault()
    }
    document.addEventListener('click', listen, true)
    this.cleanups.push(() => document.removeEventListener('click', listen, true))
    const state = () => stateOf(target)
    const before = state()
    const calls = this.called.length
    await press()
    await this.wait(() => {
      if (this.called.length > calls || state() !== before) return true
      if (native ? forwarded : clicked) return true
      const handlers = this.subject.handlers ?? []
      return native && clicked
        ? `${describe(target)} took the click the browser makes of the key, and ` +
            (handlers.length > 0
              ? `none of ${handlers.join(', ')} ran`
              : "no handler ran and nothing changed; name the member's handler in parts.ts")
        : `${describe(target)} took the key and did nothing`
    }, CLOSE_BUDGET)
  }

  /* ----------------------------------------------------------------------- */
  /* Clicks                                                                  */
  /* ----------------------------------------------------------------------- */

  /**
   * A real pointer click on the part's first enabled element, with spies in
   * the member's handler props, as for a key that activates. The click
   * activates the part when one of the member's handlers runs or the part's
   * state changes: a click always reaches the element it presses, so that is
   * no evidence of anything.
   */
  private async click(
    statement: BehaviourStatement & { effect: ConformanceClickEffect; on: string },
  ) {
    await this.mountWhere(statement, () => this.present(statement.on), this.spies())
    const target = this.all(statement.on).find((element) => !isDisabled(element))
    if (target === undefined)
      throw new Divergence(`no enabled element is the part "${statement.on}"`)
    const state = () => stateOf(target)
    const before = state()
    const calls = this.called.length
    await this.harness.click(target)
    await this.wait(() => {
      if (this.called.length > calls || state() !== before) return true
      const handlers = this.subject.handlers ?? []
      return (
        `${describe(target)} took the click and ` +
        (handlers.length > 0
          ? `none of ${handlers.join(', ')} ran and nothing changed`
          : 'nothing changed')
      )
    }, CLOSE_BUDGET)
  }

  /** The set of items the current element moves among, in document order. */
  private items(item: HTMLElement): HTMLElement[] {
    const { harness } = this
    const keep = (family: string[], within: ParentNode) =>
      [...within.querySelectorAll<HTMLElement>('*')].filter(
        (element) =>
          family.includes(harness.roleOf(element) ?? '') &&
          !isDisabled(element) &&
          element.closest('[hidden]') === null,
      )
    const familyOf = (role: string) => FAMILIES.find((members) => members.includes(role)) ?? [role]

    // Virtual focus: a field that controls a list moves through that list,
    // whether or not one of its items is current yet. A tab or a disclosure
    // also names what it controls, but that is its panel, not its siblings.
    const active = document.activeElement
    const virtual =
      active !== null &&
      (isField(active) ||
        active.getAttribute('role') === 'combobox' ||
        active.hasAttribute('aria-activedescendant'))
    const owned = virtual
      ? document.getElementById(active.getAttribute('aria-controls') ?? '')
      : null
    if (owned !== null && (item === active || owned.contains(item))) {
      const first = [...owned.querySelectorAll('*')].find((element) =>
        ITEM_ROLES.has(harness.roleOf(element) ?? ''),
      )
      const role = item === active ? (first ? harness.roleOf(first) : null) : harness.roleOf(item)
      return role ? keep(familyOf(role), owned) : []
    }

    const cell = item.closest<HTMLElement>('td, th, [role="gridcell"], [role="columnheader"]')
    const subject = cell && cell.closest('table, [role="grid"]') ? cell : item
    let container: Element | null = subject.parentElement
    while (container && !COMPOSITES.has(harness.roleOf(container) ?? '')) {
      container = container.parentElement
    }
    container ??=
      subject.closest(`[data-member="${this.subject.slug}"]`) ?? (this.mounted as Mounted).root
    return keep(familyOf(harness.roleOf(subject) ?? ''), container)
  }

  /**
   * Under virtual focus (`aria-activedescendant`) the runner cannot put focus
   * on an item, so a move backwards that starts on the first item first takes
   * one step forward, with the contract's own next key from the same part.
   */
  private async stepIn(statement: BehaviourStatement & { on?: string }): Promise<void> {
    const active = document.activeElement
    const at = current()
    if (at === null || active === null || at === active) return
    if (this.position(this.items(at)) > 0) return
    const next = this.subject.contract.find(
      (candidate) =>
        candidate.kind === 'key' &&
        candidate.effect === 'moves-focus-next' &&
        candidate.on === statement.on,
    )
    if (next === undefined || next.kind !== 'key') return
    await this.harness.keyboard(keystrokes(next.key))
    await settle(20)
  }

  /** Tab moves through the member's tab stops, whatever their roles. */
  private tabStops(at: HTMLElement): HTMLElement[] {
    const scope =
      at.closest(`[data-member="${this.subject.slug}"]`) ?? (this.mounted as Mounted).root
    return [...scope.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (element) =>
        element.tabIndex >= 0 && !isDisabled(element) && element.closest('[hidden]') === null,
    )
  }

  /** The item focus is on, as the composite counts it: a grid counts cells. */
  private position(items: HTMLElement[]): number {
    const at = current()
    if (at === null) return -1
    return items.findIndex((item) => item === at || item.contains(at))
  }

  private async moves(
    effect: 'moves-focus-next' | 'moves-focus-previous' | 'moves-focus-first' | 'moves-focus-last',
    press: () => Promise<void>,
    tabbing: boolean,
  ) {
    const at = current()
    if (at === null) throw new Divergence('nothing has focus to move from')
    const items = tabbing ? this.tabStops(at) : this.items(at)
    if (items.length < 2)
      throw new Divergence(`${describe(at)} has fewer than two items to move among`)
    const index = this.position(items)
    const last = items.length - 1
    const target = {
      'moves-focus-next': index === -1 || index === last ? items[0] : items[index + 1],
      'moves-focus-previous': index <= 0 ? items[last] : items[index - 1],
      'moves-focus-first': items[0],
      'moves-focus-last': items[last],
    }[effect] as HTMLElement
    if (index !== -1 && items[index] === target && effect !== 'moves-focus-next') {
      throw new Divergence(`focus already starts on ${describe(target)}`)
    }
    await press()
    await this.wait(() => {
      const now = current()
      return now !== null && (now === target || target.contains(now))
        ? true
        : `focus went from ${describe(at)} to ${describe(now)}, not to ${describe(target)}`
    }, CLOSE_BUDGET)
  }

  /** The item current after the key is selected, and was not before it. */
  private async selects(press: () => Promise<void>) {
    const was = new WeakSet<Element>()
    for (const element of document.querySelectorAll('*')) if (isSelected(element)) was.add(element)
    await press()
    await this.wait(() => {
      const now = current()
      if (now === null) return 'nothing has focus after the key'
      if (!isSelected(now)) return `${describe(now)} is not selected`
      return was.has(now) ? `${describe(now)} was already selected` : true
    }, CLOSE_BUDGET)
  }

  /** The member's value: the focused field's text, else what its trigger shows. */
  private value(field: HTMLInputElement | HTMLTextAreaElement | null): string {
    if (field !== null) return field.value
    return this.has('trigger') ? (this.one('trigger').textContent ?? '') : ''
  }

  /** The focused field, with a draft typed into it when it is empty. */
  private async drafted(): Promise<HTMLInputElement | HTMLTextAreaElement | null> {
    const active = document.activeElement
    const field = isField(active) ? active : null
    if (field !== null && field.value === '') await this.harness.keyboard(DRAFT)
    return field
  }

  /**
   * In a field, the text held before the key is gone from it: committed and
   * taken out, not kept with a newline or a character added. Without a field,
   * what the trigger shows changes.
   */
  private async commits(press: () => Promise<void>) {
    const field = await this.drafted()
    const before = this.value(field)
    if (field !== null && before === '') {
      throw new Divergence(`${describe(field)} is still empty after typing a draft`)
    }
    await press()
    await this.wait(() => {
      const after = this.value(field)
      if (field === null) return after !== before ? true : `the value stayed "${before}"`
      return after.includes(before) ? `the field still holds "${before}", as "${after}"` : true
    }, CLOSE_BUDGET)
  }

  /**
   * The field had text and the key empties it. Unless the contract also says
   * the same key closes the member in the same state from the same part, the
   * panel stays as it was: a clear is not a dismissal.
   */
  private async clears(
    statement: BehaviourStatement & { key: string; on?: string },
    press: () => Promise<void>,
  ) {
    const field = await this.drafted()
    if (field === null) {
      throw new Divergence(`${describe(document.activeElement)} is not a field to clear`)
    }
    if (field.value === '') throw new Divergence('the field is still empty after typing a draft')
    const closesToo = this.subject.contract.some(
      (other) =>
        other.kind === 'key' &&
        other.effect === 'closes' &&
        other.key === statement.key &&
        other.state === statement.state &&
        other.on === statement.on,
    )
    const watched = this.has('panel') && !closesToo
    const wasOpen = watched ? this.open() : null
    await press()
    await this.wait(
      () => (field.value === '' ? true : `the field still reads "${field.value}"`),
      CLOSE_BUDGET,
    )
    if (!watched) return
    await settle(STAY_BUDGET)
    if (this.open() !== wasOpen) {
      throw new Divergence(
        `the key ${wasOpen ? 'closed' : 'opened'} the panel as well as clearing the field, ` +
          'and the contract does not say it closes in this state',
      )
    }
  }

  private async steps(effect: 'increments' | 'decrements', press: () => Promise<void>) {
    const target = current()
    const before = numberOf(target)
    if (target === null || before === null) {
      throw new Divergence(`${describe(target)} shows no value to step`)
    }
    await press()
    await this.wait(() => {
      const after = numberOf(target)
      const moved = after !== null && (effect === 'increments' ? after > before : after < before)
      return moved ? true : `the value went from ${before} to ${after}`
    }, CLOSE_BUDGET)
  }

  /** What `nothing` compares: focus, the current item, the panel, the value, and every choice. */
  private snapshot(): string {
    const at = current()
    const active = document.activeElement
    const scope = [
      (this.mounted as Mounted).root,
      ...document.querySelectorAll(`[data-member="${this.subject.slug}"]`),
    ]
    const chosen = scope.flatMap((element) => [...element.querySelectorAll('*')].filter(isSelected))
    return JSON.stringify({
      active: describe(active),
      current: describe(at),
      open: this.has('panel') ? this.open() : null,
      value: isField(active) ? active.value : null,
      state: at
        ? [
            'aria-checked',
            'aria-selected',
            'aria-pressed',
            'aria-expanded',
            'aria-valuenow',
            'data-state',
          ].map((attribute) => at.getAttribute(attribute))
        : null,
      chosen: chosen.length,
    })
  }

  private async nothing(press: () => Promise<void>) {
    const before = this.snapshot()
    const calls = this.called.length
    await press()
    await settle(STAY_BUDGET)
    const called = this.called.slice(calls)
    if (called.length > 0) throw new Divergence(`the key called ${[...new Set(called)].join(', ')}`)
    const after = this.snapshot()
    if (after !== before) throw new Divergence(`the key changed ${before} into ${after}`)
  }
}
