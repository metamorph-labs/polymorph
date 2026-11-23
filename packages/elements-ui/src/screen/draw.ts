import {
  attributeOf,
  encode,
  ERROR_EVENT,
  fillSlot,
  inheritedMethod,
  PolyElement,
  propertyOf,
  slotOf,
  tagOf,
  type Codec,
  type ElementDefinition,
} from '@polymorph/elements'
import type { JsonValue } from '@polymorph/screen'
import { VOCABULARY } from '@polymorph/screen/vocabulary'
import {
  createScreen,
  materialize,
  type Drawn,
  type Screen,
  type ScreenAction,
  type ScreenFault,
  type ScreenNode,
} from '@polymorph/screen/walk'

/**
 * The elements renderer of a run-time screen: a `polymorph-screen/1`
 * document drawn as `poly-*` elements, with no markup written.
 *
 * Every decision about what a document may do is the walk's
 * (`@polymorph/screen/walk`): which components and props are drawn, what a
 * callback tells the host, what a control holds. This module draws what the
 * walk resolves, from the definition each element's class carries (the
 * table in `../definitions.ts`, which this module does not import, so a page
 * that defines every tag holds the table once):
 *
 *  - a node is an element made with `createElement`, its tag the component's
 *    (`Table.Row` is `poly-table-row`);
 *  - a callback the element dispatches as an event is a listener for that
 *    event, which calls the walk's function with the event's `detail` and hands
 *    a promise it returns to `event.waitUntil`;
 *  - a node prop and the children are the element's slots, filled with
 *    `fillSlot`: each node an element, each string a text node;
 *  - an object prop's node fields are slots of their own
 *    (`slot="empty-state.action"`), and its other fields are its data;
 *  - every other prop is set through its property, or through its attribute
 *    where its name is a method the element inherits.
 *
 * A drawing is updated in place, keyed by each node's path. A node the walk
 * kept is left alone, with everything inside it. A node that changed keeps its
 * element when its component is the same: only the props that changed are set
 * again, and only the slots whose content changed are filled again. The
 * element base class keeps the rendering of each element a slot still holds,
 * so a field keeps its text and its focus while the document around it grows.
 *
 * While the document streams, the walk leaves out an element that is still
 * being written (`cut`), so a member is drawn once its props are whole. A
 * member that throws renders nothing (`poly-error`, which the element base
 * class dispatches), and the rest of the screen draws; its element is made
 * again when its node changes, and the error is a fault of the screen once
 * nothing more of the document is to come.
 */

/** Whether a fault is drawn in its node's place, or nothing is. */
export type FaultDisplay = 'hidden' | 'inline'

export interface DrawOptions {
  /** The document, whole or as far as it has arrived (`parsePartial`). */
  document?: unknown
  /** The host's data, by input name. */
  data?: Readonly<Record<string, unknown>>
  /** Whether more of the document is still to come. */
  streaming?: boolean
  /** The path of the string still being written (`parsePartial`'s `open`). */
  open?: string | null
  /** The path of the innermost value the text ends inside (`parsePartial`'s `cut`). */
  cut?: string | null
  /** The members the host allows, by name. The elements' default when absent. */
  members?: readonly string[]
  /** `hidden` (the default) draws nothing for a node that cannot be drawn; `inline` draws its fault in its place. */
  faults?: FaultDisplay
  /** Told each action. What it returns answers the member, as the walk's `onAction`. */
  onAction?: (action: ScreenAction) => unknown
  /** Told each fault once, when it first appears. */
  onFault?: (fault: ScreenFault) => void
}

/** What a host changes on a drawing. Each field replaces the one it names. */
export type DrawUpdate = Partial<
  Pick<
    DrawOptions,
    'document' | 'data' | 'streaming' | 'open' | 'cut' | 'faults' | 'onAction' | 'onFault'
  >
>

export interface Drawing {
  /** Each named control's current value, by its name. */
  readonly values: Readonly<Record<string, JsonValue>>
  /** The names in `values` whose value the person chose, in document order. */
  readonly changed: readonly string[]
  /** Every fault the drawing has now. */
  readonly faults: readonly ScreenFault[]
  /** Changes what is drawn, in place. */
  update(change: DrawUpdate): void
  /** Takes the drawing out of its container. */
  dispose(): void
}

type Callback = (...args: unknown[]) => unknown

/** One piece of a slot: an element, or a string drawn as a text node. */
type Piece = Element | string

/** A node drawn as an element, and what it was last given. */
interface Placed {
  readonly tag: string
  /** The node's key (`ScreenNode.key`): its path, and a named control's name, so a control under another name is a new element. */
  readonly key: string
  readonly element: PolyElement
  readonly definition: ElementDefinition
  /** The node it was last drawn from. */
  node: ScreenNode | null
  /** Each prop set as data, with the drawn value it was set from. */
  given: Map<string, Drawn>
  /** What each event the element dispatches calls now, by event type. */
  calls: Map<string, Callback>
  /** The listener for each event in `calls`. */
  readonly listeners: Map<string, EventListener>
  /** What each slot holds now, by its `slot` attribute. */
  slots: Map<string, readonly Piece[]>
  /** The paths of the nodes drawn inside it, in its slots and in its data. */
  inner: string[]
  /** What the member threw, or `null`. An element whose member threw is made again when its node changes. */
  failed: unknown
}

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  (typeof value === 'object' || typeof value === 'function') &&
  value !== null &&
  typeof (value as { then?: unknown }).then === 'function'

/** Whether two values a document wrote are the same JSON. */
function sameData(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  return JSON.stringify(a) === JSON.stringify(b)
}

/** Whether two drawn values draw the same thing, as the walk compares them. */
function sameDrawn(a: Drawn, b: Drawn): boolean {
  switch (a.kind) {
    case 'value': {
      if (b.kind !== 'value' || a.from !== b.from) return false
      return a.from === 'document' ? sameData(a.value, b.value) : Object.is(a.value, b.value)
    }
    case 'node':
      return b.kind === 'node' && a.node === b.node
    case 'list':
      return (
        b.kind === 'list' &&
        a.items.length === b.items.length &&
        a.items.every((item, at) => sameDrawn(item, b.items[at] as Drawn))
      )
    case 'record': {
      if (b.kind !== 'record') return false
      const keys = Object.keys(a.fields)
      return (
        keys.length === Object.keys(b.fields).length &&
        keys.every(
          (key) =>
            Object.prototype.hasOwnProperty.call(b.fields, key) &&
            sameDrawn(a.fields[key] as Drawn, b.fields[key] as Drawn),
        )
      )
    }
    case 'binding':
      return b.kind === 'binding' && a.path === b.path && Object.is(a.value, b.value)
    case 'fault':
      return (
        b.kind === 'fault' && a.fault.path === b.fault.path && a.fault.message === b.fault.message
      )
  }
}

/** Every node a drawn value holds, in order. */
function nodesIn(drawn: Drawn, out: ScreenNode[] = []): ScreenNode[] {
  if (drawn.kind === 'node') out.push(drawn.node)
  else if (drawn.kind === 'list') for (const item of drawn.items) nodesIn(item, out)
  else if (drawn.kind === 'record')
    for (const field of Object.values(drawn.fields)) nodesIn(field, out)
  return out
}

const samePieces = (a: readonly Piece[] | undefined, b: readonly Piece[]): boolean =>
  a !== undefined && a.length === b.length && a.every((piece, at) => piece === b[at])

/** The definition a defined element's class carries. */
const definitionOf = (element: PolyElement): ElementDefinition =>
  (element.constructor as typeof PolyElement).definition

/** Sets a key as the object's own, `__proto__` included. */
function own(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  })
}

/**
 * Draws a run-time screen into `container`, a plain element: the drawing's
 * root element is appended to it, and nothing else in it is touched. Returns
 * the drawing, which a host updates as the document streams and its data
 * changes.
 */
export function draw(container: Element, options: DrawOptions = {}): Drawing {
  const page = container.ownerDocument
  let display: FaultDisplay = options.faults ?? 'hidden'
  let onFault = options.onFault
  /** Why the document last given could not be read, told once; `null` when it could. */
  let unreadable: string | null = null
  const unread = (error: unknown): void => {
    const message = `the document cannot be read: ${error instanceof Error ? error.message : String(error)}`
    if (message !== unreadable) onFault?.({ path: '$', message })
    unreadable = message
  }
  const made = (document: unknown) =>
    createScreen({
      document,
      vocabulary: VOCABULARY,
      framework: 'elements',
      ...(options.members === undefined ? {} : { members: options.members }),
      ...(options.data === undefined ? {} : { data: options.data }),
      streaming: options.streaming ?? false,
      open: options.open ?? null,
      cut: options.cut ?? null,
      ...(options.onAction === undefined ? {} : { onAction: options.onAction }),
      onFault: (fault) => onFault?.(fault),
    })
  // A document the walk cannot read (one nested deeper than it reads) draws nothing, and is a fault.
  let screen: Screen
  try {
    screen = made(options.document)
  } catch (error) {
    screen = made(undefined)
    unread(error)
  }

  /** Each node drawn, by its path. */
  const placed = new Map<string, Placed>()
  /** Each fault drawn in place, by its path. */
  const views = new Map<string, { message: string; element: Element }>()
  /** The paths drawn in the pass that is running. */
  let live = new Set<string>()
  /** Whether the pass draws every node again, the ones the walk kept included. */
  let fresh = false
  let root: Element | null = null
  let drawing = false
  let again = false
  let disposed = false

  const fail = (node: ScreenNode, message: string) =>
    screen.fail({ path: node.path, component: node.component, message })

  /** Reports what an element's member threw, once nothing more of the document is to come. */
  const report = (path: string): void => {
    const entry = placed.get(path)
    if (entry === undefined || entry.node === null || entry.failed === null) return
    if (screen.streaming || disposed) return
    const { failed } = entry
    fail(
      entry.node,
      `\`${entry.node.component}\` threw: ${failed instanceof Error ? failed.message : String(failed)}`,
    )
  }

  /** Marks a node drawn before, and every node inside it, as drawn in this pass. */
  const keep = (path: string): void => {
    if (live.has(path)) return
    live.add(path)
    for (const inner of placed.get(path)?.inner ?? []) keep(inner)
  }

  /** A fault drawn in its node's place: an Alert in the danger tone, holding its message. */
  const view = (fault: ScreenFault): Element | null => {
    if (display === 'hidden') return null
    live.add(fault.path)
    const known = views.get(fault.path)
    if (known?.message === fault.message) return known.element
    const alert = page.createElement('poly-alert')
    if (!(alert instanceof PolyElement)) return null
    set(alert, definitionOf(alert), 'tone', 'danger')
    fillSlot(alert, '', [page.createTextNode(fault.message)])
    views.set(fault.path, { message: fault.message, element: alert })
    return alert
  }

  /** Sets a prop as a page's script does: its property, or its attribute where it has none. */
  const set = (
    element: PolyElement,
    definition: ElementDefinition,
    name: string,
    value: unknown,
  ): void => {
    // Only a prop the definition names is set. Each has an accessor of the element's own, or is
    // set by its attribute where its name is a method the element inherits, so nothing a document
    // says reaches a property of the DOM's own: `innerHTML`, `style`, an `on…` handler.
    if (!Object.prototype.hasOwnProperty.call(definition.props, name)) return
    const property = propertyOf(name)
    if (!inheritedMethod(property)) {
      ;(element as unknown as Record<string, unknown>)[property] = value
      return
    }
    const text = encode(definition.props[name] as Codec, value)
    if (text === null) element.removeAttribute(attributeOf(name))
    else element.setAttribute(attributeOf(name), text)
  }

  /** Text and elements for what is drawn in a slot. */
  const pieces = (drawn: Drawn, owner: ScreenNode, inner: string[]): Piece[] => {
    switch (drawn.kind) {
      case 'node': {
        inner.push(drawn.node.path)
        const element = visit(drawn.node)
        return element === null ? [] : [element]
      }
      case 'list':
        return drawn.items.flatMap((item) => pieces(item, owner, inner))
      case 'value':
      case 'binding':
        return text(drawn.value, owner)
      case 'fault': {
        inner.push(drawn.fault.path)
        const element = view(drawn.fault)
        return element === null ? [] : [element]
      }
      case 'record':
        fail(owner, `\`${owner.component}\` holds a structured object where things are drawn`)
        return []
    }
  }

  /** A value drawn as text: a string or a number, and nothing for an absent value or a boolean. */
  const text = (value: unknown, owner: ScreenNode): Piece[] => {
    if (typeof value === 'string') return value === '' ? [] : [value]
    if (typeof value === 'number' || typeof value === 'bigint') return [String(value)]
    if (value === null || value === undefined || typeof value === 'boolean') return []
    if (Array.isArray(value)) return value.flatMap((item: unknown) => text(item, owner))
    fail(owner, `\`${owner.component}\` holds data where text or an element is drawn`)
    return []
  }

  /** The listener for one event of a placed element, which calls what the walk gave it now. */
  const listener =
    (entry: Placed, type: string): EventListener =>
    (event) => {
      // An event from an element inside this one bubbles through it, and is that element's.
      if (event.target !== event.currentTarget) return
      const call = entry.calls.get(type)
      if (call === undefined) return
      // Every argument the member passed (`PolymorphEvent.args`), so `null` and nothing differ.
      const args = (event as { args?: readonly unknown[] }).args
      const detail = (event as CustomEvent<unknown>).detail
      const result = call(...(args ?? (detail === null || detail === undefined ? [] : [detail])))
      if (isThenable(result)) {
        ;(event as { waitUntil?: (promise: PromiseLike<unknown>) => void }).waitUntil?.(result)
      }
    }

  /** Gives a placed element what its node draws, setting only what changed. */
  const apply = (entry: Placed, node: ScreenNode): void => {
    const { element, definition } = entry
    const inner: string[] = []
    const data = new Map<string, Drawn>()
    const calls = new Map<string, Callback>()
    const slots = new Map<string, Piece[]>()

    for (const [name, drawn] of Object.entries(node.props)) {
      const event = definition.events[name]
      if (event !== undefined) {
        if (drawn.kind === 'value' && typeof drawn.value === 'function') {
          calls.set(event.type, drawn.value as Callback)
        }
        continue
      }
      if (definition.slots.includes(name)) {
        slots.set(slotOf(name), pieces(drawn, node, inner))
        continue
      }
      const fields = definition.fields?.[name]
      if (fields !== undefined && drawn.kind === 'record') {
        // The fields that hold a node are slots of their own; the rest are the prop's data.
        const rest: Record<string, Drawn> = {}
        for (const [field, value] of Object.entries(drawn.fields)) {
          if (fields.includes(field)) {
            slots.set(`${slotOf(name)}.${slotOf(field)}`, pieces(value, node, inner))
          } else own(rest, field, value)
        }
        data.set(name, { kind: 'record', fields: rest as Record<string, Drawn> })
        continue
      }
      if (Object.prototype.hasOwnProperty.call(definition.props, name)) {
        data.set(name, drawn)
        continue
      }
      fail(node, `\`${node.component}\` has no \`${name}\` as an element`)
    }
    if (node.children.length > 0) {
      if (definition.slots.includes('children')) {
        slots.set(
          '',
          node.children.flatMap((child) => pieces(child, node, inner)),
        )
      } else fail(node, `\`${node.component}\` takes no children as an element`)
    }

    for (const [name, drawn] of data) {
      const before = entry.given.get(name)
      if (before !== undefined && sameDrawn(before, drawn)) {
        for (const kept of nodesIn(drawn)) {
          inner.push(kept.path)
          keep(kept.path)
        }
        continue
      }
      // A node inside data is an element in the data, which the member draws where it puts it.
      const value = materialize(drawn, {
        node: (held) => {
          inner.push(held.path)
          return visit(held)
        },
      })
      set(element, definition, name, value)
    }
    for (const name of entry.given.keys()) {
      if (!data.has(name)) set(element, definition, name, undefined)
    }
    entry.given = data

    for (const [type, call] of calls) {
      if (entry.listeners.has(type)) continue
      const listening = listener(entry, type)
      entry.listeners.set(type, listening)
      entry.calls.set(type, call)
      element.addEventListener(type, listening)
    }
    for (const [type, listening] of [...entry.listeners]) {
      if (calls.has(type)) continue
      element.removeEventListener(type, listening)
      entry.listeners.delete(type)
    }
    entry.calls = calls

    for (const [slot, list] of slots) {
      if (samePieces(entry.slots.get(slot), list)) continue
      fillSlot(
        element,
        slot,
        list.map((piece) => (typeof piece === 'string' ? page.createTextNode(piece) : piece)),
      )
    }
    for (const slot of entry.slots.keys()) if (!slots.has(slot)) fillSlot(element, slot, [])
    entry.slots = slots
    entry.inner = inner
  }

  /** The element a node is drawn as, made or kept, or `null` for a node drawn as nothing. */
  const visit = (node: ScreenNode): Element | null => {
    if (node.fault !== null) return view(node.fault)
    const tag = tagOf(node.component.replace('.', ''))
    const key = node.key ?? node.path
    let entry = placed.get(node.path)
    if (entry !== undefined && entry.tag === tag && entry.node === node && !fresh) {
      keep(node.path)
      return entry.element
    }
    if (entry === undefined || entry.tag !== tag || entry.key !== key || entry.failed !== null) {
      const element = page.createElement(tag)
      if (!(element instanceof PolyElement)) {
        const message = `\`${node.component}\` has no element on this page (\`${tag}\` is not defined)`
        fail(node, message)
        return view({ path: node.path, component: node.component, message })
      }
      const made: Placed = {
        tag,
        key,
        element,
        definition: definitionOf(element),
        node: null,
        given: new Map(),
        calls: new Map(),
        listeners: new Map(),
        slots: new Map(),
        inner: [],
        failed: null,
      }
      const path = node.path
      element.addEventListener(ERROR_EVENT, (event) => {
        // The screen reports it, as a fault with the node's path.
        event.preventDefault()
        made.failed = (event as CustomEvent<unknown>).detail
        queueMicrotask(() => report(path))
      })
      entry = made
      placed.set(path, entry)
    }
    live.add(node.path)
    try {
      apply(entry, node)
    } catch (error) {
      // A member that throws while it takes a prop draws as it was, and the rest of the screen draws.
      fail(node, error instanceof Error ? error.message : String(error))
    }
    entry.node = node
    return entry.element
  }

  /** Puts the root element in the container, in place of the one drawn before. */
  const place = (next: Element | null): void => {
    // The root a swap of the container's children took out is put back.
    if (next === root && (next === null || next.parentNode === container)) return
    if (root !== null && root.parentNode === container) {
      if (next === null) container.removeChild(root)
      else container.replaceChild(next, root)
    } else if (next !== null) container.append(next)
    root = next
  }

  const reconcile = (): void => {
    if (disposed) return
    if (drawing) {
      again = true
      return
    }
    drawing = true
    try {
      do {
        again = false
        live = new Set()
        const top = screen.root
        try {
          place(top === null ? null : visit(top))
        } catch (error) {
          // A tree too deep to draw draws nothing.
          place(null)
          live = new Set()
          unread(error)
        }
        for (const path of [...placed.keys()]) if (!live.has(path)) placed.delete(path)
        for (const path of [...views.keys()]) if (!live.has(path)) views.delete(path)
        for (const path of [...placed.keys()]) report(path)
      } while (again && !disposed)
    } finally {
      drawing = false
    }
  }

  const stop = screen.subscribe(reconcile)
  reconcile()

  return {
    get values() {
      return screen.values
    },
    get changed() {
      return screen.changed
    },
    get faults() {
      return screen.faults
    },
    update(change) {
      if (disposed) return
      const { faults, onFault: told, ...walked } = change
      // The walk tells this drawing of each fault, and the drawing tells the host it has now.
      if ('onFault' in change) onFault = told
      try {
        screen.update(walked)
        if ('document' in walked) unreadable = null
      } catch (error) {
        screen.update({ document: undefined, open: null, cut: null })
        unread(error)
      }
      if (faults !== undefined && faults !== display) {
        display = faults
        fresh = true
        try {
          reconcile()
        } finally {
          fresh = false
        }
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      stop()
      if (root !== null && root.parentNode === container) container.removeChild(root)
      root = null
      placed.clear()
      views.clear()
    },
  }
}
