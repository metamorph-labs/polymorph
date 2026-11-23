import {
  createContext,
  createMemo,
  createSignal,
  getOwner,
  mergeProps,
  onCleanup,
  runWithOwner,
  untrack,
  useContext,
  type Accessor,
  type Context,
  type JSX,
} from 'solid-js'

import { readMotionEnvironment, resolveBinding, type BindingName } from '@polymorph/engine/motion'

import { claimKeys, reserveKeys } from './hydration'

/**
 * The slot conventions of the Solid members: what a member reads from the
 * content a caller gives it, and what it hands that content.
 *
 * In Solid a node prop (`children`, `footer`) is a getter that creates its
 * elements each time it is read, so a member that reads a slot, to ask whether
 * it was filled, for its text or for its first element's kind, reads it once
 * (`resolveSlot`) and renders what it read.
 *
 * React's `cloneElement` sets props on an element a caller passed (FormField
 * hands its control an id). A Solid element is created before the member sees
 * it, so the member instead names the props in a context, and every generated
 * member reads that context when it is created (`claimSlot`): the ones the
 * caller put directly in the slot take the props over their own and tell the
 * member their kind (`controlKind`) and their own props. Each member then
 * hides the context from what it renders itself (`scope`), so a member inside
 * the slotted one takes nothing.
 */

/**
 * What a member reads from what a slot holds: how many members and elements
 * no member rendered, and the first one's kind and own props (an element's own
 * attributes).
 */
export interface Slotted {
  count: number
  kind: string | undefined
  props: Readonly<Record<string, unknown>>
}

/** Props a member hands its slotted members, as a function of each one's own props. */
export type SlotPass = (
  child: Readonly<Record<string, unknown>>,
) => Readonly<Record<string, unknown>>

interface Claim {
  kind: string | undefined
  props: Readonly<Record<string, unknown>>
}

interface SlotHost {
  pass: SlotPass | undefined
  claim(entry: Claim): void
  release(entry: Claim): void
}

/**
 * The slot a member is being created in. `null`, never `undefined`, inside a
 * member's own rendering: Solid reads an `undefined` context value as unset
 * and would find the enclosing slot's.
 */
const SLOT = createContext<SlotHost | null>(null)

/**
 * Sets a context's value for everything the current owner creates after the
 * call: a member's `provide`, its lent identity, the slot it hides. Solid's
 * `<Context.Provider>` does the same inside its own computation; a member sets
 * it in the computation its `scope` made, so values computed in the member's
 * body are in reach.
 */
export function provide<T>(context: Context<T>, value: T): void {
  const owner = getOwner()
  if (owner === null) return
  owner.context = { ...owner.context, [context.id]: value }
}

/**
 * What each member's `scope` rendered, by the claim the member made as it was
 * created (`null` outside a slot), so a slot tells a member's elements from
 * the ones the caller wrote.
 */
const RENDERED = new WeakMap<object, Claim | null>()

/** The claim of the member being created, from its `claimSlot` until its `scope` reads it. */
let claiming: Claim | null = null

/**
 * Runs a member's body in a computation of its own, with no enclosing slot in
 * its context, and returns what it renders. A member that renders other
 * members or the caller's content renders through it.
 */
export function scope(render: () => JSX.Element): JSX.Element {
  const claim = claiming
  claiming = null
  const rendered = createMemo(() =>
    untrack(() => {
      provide(SLOT, null)
      return render()
    }),
  )
  RENDERED.set(rendered, claim)
  return rendered as unknown as JSX.Element
}

/**
 * A member's props as the slot it was created in sets them: its own, with the
 * props the slot hands it over them (a handler runs after the member's own),
 * and an `undefined` passed value leaving the member's own. Outside a slot
 * that hands anything, the props as given. Called first in every generated
 * member, with its `controlKind`. It is also where a member a server did not
 * render leaves a hydration (`claimKeys`).
 */
export function claimSlot<P extends object>(given: P, kind?: string): P {
  claimKeys()
  claiming = null
  const host = useContext(SLOT)
  if (host === null) return given
  const entry: Claim = { kind, props: given as Readonly<Record<string, unknown>> }
  claiming = entry
  host.claim(entry)
  onCleanup(() => host.release(entry))
  const pass = host.pass
  if (pass === undefined) return given
  const own = given as Readonly<Record<string, unknown>>
  const passed = createMemo(() => {
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(pass(own))) {
      if (value === undefined) continue
      const mine = own[key]
      out[key] =
        /^on[A-Z]/.test(key) && typeof value === 'function' && typeof mine === 'function'
          ? (...args: unknown[]) => {
              ;(mine as (...args: unknown[]) => unknown)(...args)
              ;(value as (...args: unknown[]) => unknown)(...args)
            }
          : value
    }
    return out
  })
  return mergeProps(given, passed) as P
}

/** One slot as a member reads it. Called, it is the content, resolved once, for rendering. */
export interface Slot {
  (): JSX.Element
  /** Whether the caller put anything in it. */
  filled(): boolean
  /** The text the caller put in it: its strings and text nodes, in order, without the elements'. */
  text(): string
  /** How many members and other elements it holds, and the first one's kind and own props. */
  slotted(): Slotted
  /** The first `count` members and elements, or all of the content without a count (Avatar.Group's `max`). */
  take(count: number | undefined): JSX.Element
}

const isText = (node: unknown): node is Text => typeof Text !== 'undefined' && node instanceof Text

const isElement = (node: unknown): node is Element =>
  typeof Element !== 'undefined' && node instanceof Element

/**
 * One thing a slot holds at its top level: what one member rendered, an
 * element the caller wrote, or text. A member that renders through `scope` is
 * known by what it rendered; one that renders a single element of its own is
 * known by the element's `data-member`.
 */
interface Held {
  member: boolean
  claim: Claim | undefined
  nodes: unknown[]
}

/**
 * Elements a member was rendered into by a renderer that keeps an element of
 * its own around each member (`@polymorph/elements`, whose `poly-*` elements
 * each hold their member's rendering), by the claim the member made as it was
 * created: `null` for a member that renders without `scope`, which a slot
 * still reads by the claim it made.
 */
const HOSTED = new WeakMap<Element, Claim | null>()

/**
 * Records that `host` holds `rendered`, the rendering of one member, so a slot
 * that holds the host reads it as that member: it counts as a member, with the
 * member's kind and own props, and takes no `pass` as attributes, because the
 * member took them as props when it claimed the slot. Call it as the member is
 * created inside the slot, before the slot reads what it holds.
 */
export function hostMember(host: Element, rendered: JSX.Element): void {
  const claim =
    (typeof rendered === 'function' || (typeof rendered === 'object' && rendered !== null)) &&
    RENDERED.has(rendered)
      ? (RENDERED.get(rendered) ?? null)
      : null
  HOSTED.set(host, claim)
}

/** A slot's content, read as Solid's `children` reads it, into what it holds at its top level. */
function hold(value: unknown, out: Held[], within: Held | undefined): void {
  if (typeof value === 'function' && value.length === 0) {
    const claim = RENDERED.get(value)
    const next =
      within ??
      (claim === undefined ? undefined : { member: true, claim: claim ?? undefined, nodes: [] })
    if (next !== undefined && next !== within) out.push(next)
    hold((value as () => unknown)(), out, next)
  } else if (Array.isArray(value)) {
    for (const item of value) hold(item, out, within)
  } else if (within !== undefined) {
    within.nodes.push(value)
  } else if (isElement(value) && HOSTED.has(value)) {
    // An element another renderer rendered a member into is that member.
    out.push({ member: true, claim: HOSTED.get(value) ?? undefined, nodes: [value] })
  } else {
    const member = isElement(value) && value.hasAttribute('data-member')
    out.push({ member, claim: undefined, nodes: [value] })
  }
}

/** The values `pass` set on an element, by attribute name: the element's own value, or `null`. */
const PASSED = new WeakMap<Element, Map<string, string | null>>()

/** An element's own attributes, with each value `pass` set replaced by the element's own. */
function ownAttributes(element: Element): Record<string, unknown> {
  const own: Record<string, unknown> = {}
  for (const attribute of element.attributes) own[attribute.name] = attribute.value
  for (const [name, held] of PASSED.get(element) ?? []) {
    if (held === null) delete own[name]
    else own[name] = held
  }
  return own
}

/**
 * Reads a slot once: its content is created in a context that hands `pass` to
 * the members directly in it, and kept for the member to render. A caller's
 * content that changes (a list it maps) is read again, and the members it
 * creates claim the slot as the first ones did.
 *
 * The content is created the first time the member reads the slot, under the
 * owner that called this, so `pass` may read values the member declares after
 * it (FormField hands its control the id it derives from the control's kind,
 * which the control tells it as it claims the slot). A read made while the
 * content is being created sees what has claimed the slot so far. In a
 * hydration the content takes its place in the count here, and not where it
 * is first read, which a server and a browser reach in different orders
 * (`reserveKeys`).
 *
 * The slot holds members and elements no member rendered, in order, as Vue's
 * and Svelte's slots read them: an element counts beside the members, its own
 * attributes are its props, and it takes `pass` as attributes and listeners.
 */
export function resolveSlot(read: () => JSX.Element, pass?: SlotPass): Slot {
  const owner = getOwner()
  const keyed = reserveKeys()
  const [claims, setClaims] = createSignal<readonly Claim[]>([])
  // An attribute the caller changes on an element in the slot, which the slot's readers read.
  const [changes, setChanges] = createSignal(0)
  const host: SlotHost = {
    pass,
    claim: (entry) => setClaims((list) => [...list, entry]),
    release: (entry) => setClaims((list) => list.filter((other) => other !== entry)),
  }
  let resolved: { held: Accessor<readonly Held[]>; nodes: Accessor<readonly unknown[]> } | undefined
  let resolving = false
  const content = () => {
    if (resolved !== undefined || resolving) return resolved
    resolving = true
    try {
      resolved = runWithOwner(owner, () => {
        const raw = createMemo(() => {
          provide(SLOT, host)
          return keyed(read)
        })
        const held = createMemo(() => {
          const out: Held[] = []
          hold(raw(), out, undefined)
          return out
        })
        const nodes = createMemo(() => held().flatMap((entry) => entry.nodes))
        followElements(held, () => setChanges((count) => count + 1))
        if (pass !== undefined) passToElements(held, pass)
        return { held, nodes }
      })
    } finally {
      resolving = false
    }
    return resolved
  }
  const items = (): readonly unknown[] => content()?.nodes() ?? []
  // What the slot holds that counts: members, and elements no member rendered.
  const counted = (): readonly Held[] =>
    (content()?.held() ?? []).filter((entry) => entry.member || isElement(entry.nodes[0]))

  const slot = (() => content()?.nodes()) as Slot
  slot.filled = () =>
    items().some((item) => item !== null && item !== undefined && item !== false && item !== '')
  slot.text = () =>
    items()
      .map((item) =>
        typeof item === 'string' || typeof item === 'number'
          ? String(item)
          : isText(item)
            ? item.data
            : '',
      )
      .join('')
  slot.slotted = () => {
    // The members claim the slot as they are created, so reading what it holds creates them.
    content()
    const found = claims()
    const held = counted()
    const first = held[0]
    if (first !== undefined && !first.member) {
      changes()
      return {
        count: held.length,
        kind: undefined,
        props: ownAttributes(first.nodes[0] as Element),
      }
    }
    const claim = first?.claim ?? found[0]
    return {
      count: held.length > 0 ? held.length : found.length,
      kind: claim?.kind,
      props: claim?.props ?? {},
    }
  }
  slot.take = (count) =>
    count === undefined
      ? slot()
      : (counted()
          .slice(0, count)
          .flatMap((entry) => entry.nodes) as JSX.Element)
  return slot
}

/**
 * A slot resolved inside the branch that renders it, which `children` renders
 * with the slot: Dialog's footer, read and rendered only inside its open panel,
 * is created each time the panel opens and disposed when it closes, as Vue,
 * Svelte and React mount it again. A slot resolved in the member's body would
 * keep its content, its state and its effects across the closed panel.
 */
export function ResolvedSlot(props: {
  of: () => JSX.Element
  children: (slot: Slot) => JSX.Element
}): JSX.Element {
  const slot = resolveSlot(() => props.of())
  return untrack(() => props.children(slot))
}

/**
 * Calls `changed` when the caller changes an attribute of an element in the
 * slot that no member rendered, so a member that reads the element's own
 * attributes (FormField's `disabled`) reads them again. A change `pass` makes,
 * or one that leaves the value as it was, is not the caller's.
 */
function followElements(held: Accessor<readonly Held[]>, changed: () => void): void {
  if (typeof MutationObserver === 'undefined') return
  createMemo(() => {
    const elements = held()
      .filter((entry) => !entry.member && isElement(entry.nodes[0]))
      .map((entry) => entry.nodes[0] as Element)
    if (elements.length === 0) return
    const observer = new MutationObserver((records) => {
      const own = records.some(
        (record) =>
          record.attributeName !== null &&
          !(PASSED.get(record.target as Element)?.has(record.attributeName) ?? false) &&
          (record.target as Element).getAttribute(record.attributeName) !== record.oldValue,
      )
      if (own) changed()
    })
    for (const element of elements)
      observer.observe(element, { attributes: true, attributeOldValue: true })
    onCleanup(() => observer.disconnect())
  })
}

/**
 * `pass` as attributes and listeners on each element in the slot that no
 * member rendered, called with the element's own attributes. When a value
 * `pass` reads or the slot's elements change, the attributes and listeners it
 * set are taken off before the new ones are set, so an attribute `pass` no
 * longer names goes back to the element's own value, or is removed.
 */
function passToElements(held: Accessor<readonly Held[]>, pass: SlotPass): void {
  createMemo(() => {
    for (const entry of held()) {
      const element = entry.nodes[0]
      if (entry.member || !isElement(element)) continue
      const passed = PASSED.get(element) ?? new Map<string, string | null>()
      PASSED.set(element, passed)
      for (const [name, value] of Object.entries(pass(ownAttributes(element)))) {
        if (/^on[A-Z]/.test(name)) {
          if (typeof value !== 'function') continue
          const event = name.slice(2).toLowerCase()
          const listener = value as EventListener
          element.addEventListener(event, listener)
          onCleanup(() => element.removeEventListener(event, listener))
        } else if (value !== undefined && value !== null && value !== false) {
          const own = element.getAttribute(name)
          passed.set(name, own)
          element.setAttribute(name, String(value))
          onCleanup(() => {
            passed.delete(name)
            if (own === null) element.removeAttribute(name)
            else element.setAttribute(name, own)
          })
        }
      }
    }
  })
}

/**
 * The identity a member lends the members it composes (Dialog's panel carries
 * ConfirmDialog's `data-member`), read as `lent`.
 */
export const IDENTITY = createContext<string | undefined>(undefined)

/**
 * What a member that lends its identity hands the member it composes, which
 * writes a function returning one of its elements into it: ConfirmDialog reads
 * its Dialog's panel through it. Read as `borrowed` in the lender and as
 * `lender` in the member it composes.
 */
export interface BorrowedHolder {
  element?: () => Element | null | undefined
}

/** The hand-back holder a lender provides (`BorrowedHolder`); `undefined` outside one. */
export const BORROWED = createContext<BorrowedHolder | undefined>(undefined)

const OWNERS = new Map<string, Context<unknown>>()

/**
 * The context a member hands its compound parts (`Tabs.Content` reads which
 * tab is current), by the member's name, so a part reads it without importing
 * its member's module at run time. `T` is what the member hands over, which
 * its module declares (`TabsOwner`); a part outside its member reads nothing.
 */
export function ownerContext<T extends object>(member: string): Context<T | undefined> {
  let context = OWNERS.get(member)
  if (context === undefined) {
    context = createContext<unknown>(undefined)
    OWNERS.set(member, context)
  }
  return context as Context<T | undefined>
}

/**
 * A departure that runs before a member hands control back to the caller:
 * Alert's ✕ plays the `collapse` exit, and the caller hears `dismiss` once it
 * has run, so the application owns the unmount. `start` sets `active`, waits
 * for the binding's runtime as the motion engine resolves it for the element,
 * and then calls `then`; it never calls it after the member has unmounted.
 */
export function useDeparture(
  element: Accessor<HTMLElement | null>,
  binding: BindingName,
): { readonly active: boolean; start(then: () => void): void } {
  let timer: ReturnType<typeof setTimeout> | undefined
  if (getOwner() !== null) onCleanup(() => clearTimeout(timer))
  const [active, setActive] = createSignal(false)
  return {
    get active() {
      return active()
    },
    start(then: () => void) {
      setActive(true)
      const resolved = resolveBinding(
        binding,
        readMotionEnvironment(element() ?? document.documentElement),
      )
      const runtime =
        resolved.kind === 'collapse' ? Math.max(resolved.sizeDurationMs, resolved.contentFadeMs) : 0
      clearTimeout(timer)
      if (runtime === 0) then()
      else timer = setTimeout(then, runtime)
    },
  }
}

/**
 * A render prop drawn with its argument, as a node another component draws:
 * RichTextContent's parts draw the app's `entity` through it. The function is
 * called untracked, so the computation that draws the node does not run
 * again for what the app's function reads; its own bindings follow that.
 */
export function drawSlot<Arg>(
  render: ((arg: Arg) => JSX.Element) | undefined,
  arg: Arg,
): JSX.Element | undefined {
  return render === undefined ? undefined : untrack(() => render(arg))
}

/**
 * Whether a render prop draws anything for its argument: a React render prop
 * that returns `undefined` draws nothing, and the member draws its own content
 * in its place (RichTextContent's entity token where the app's `entity` draws
 * nothing for a kind). `null` and `false` draw nothing too, as in JSX.
 */
export function slotDraws<Arg>(render: ((arg: Arg) => JSX.Element) | undefined, arg: Arg): boolean {
  const drawn = drawSlot(render, arg)
  return drawn !== undefined && drawn !== null && drawn !== false
}
