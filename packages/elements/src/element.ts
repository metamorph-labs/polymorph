import {
  catchError,
  createComponent,
  createMemo,
  createRenderEffect,
  createRoot,
  createSignal,
  getOwner,
  onCleanup,
  untrack,
  type Component,
  type JSX,
  type Owner,
  type Signal,
} from 'solid-js'
import { insert } from 'solid-js/web'

import { devWarning, hostMember } from '@polymorph/solid'

import { coerce, decode, readsTemporal, Unreadable, type TemporalCodecs } from './attributes'
import {
  attributeOf,
  camel,
  kebab,
  PREFIX,
  propertyOf,
  type Codec,
  type ElementCallback,
  type ElementDefinition,
  type ElementProperties,
  type PropertyName,
} from './definition'
import { ERROR_EVENT, PolymorphEvent } from './events'

/**
 * The element base class: a page-written `poly-*` element that renders its
 * Solid member into itself, in the light DOM.
 *
 * - **Host.** The element stays in the page and draws no box: while it renders
 *   its member it carries the custom state `poly-host`, and the foundation's
 *   stylesheet gives `:state(poly-host):not([hidden])` `display: contents`. A
 *   state rather than an attribute, because a morphing swap removes attributes
 *   the server did not send. The state is added when the member renders and
 *   removed when it is disposed, so an element that is defined and waits for
 *   its member's code still matches the stylesheet's rules for an element
 *   that has not rendered. The `id`, `title`, `role` and `aria-*` attributes
 *   that are the member's props are read into props and taken off the
 *   element, where they would name or describe the whole member, and put back
 *   when it is restored.
 * - **Props.** Each prop is a signal the member reads. Its attribute is read
 *   through its codec (`attributes.ts`) and its property sets it as it is; a
 *   property never writes the attribute back. A date or a time is read through
 *   the temporal codecs (`temporal.ts`), which the member's definition module
 *   gives `define`, so the date library loads with that member's code and not
 *   before. Text for one that arrives before the code, by its attribute or its
 *   property, is kept and read when the code is there, before the member
 *   renders, and its property reads `undefined` until then. A prop whose name
 *   is a method of the element (Diff's `before` and `after`, which are
 *   `ChildNode` methods) has no property, so the method keeps working, and is
 *   set by its attribute.
 *   A JSON value whose objects lack a callback their type requires (a Menu
 *   item's `onSelect`) is completed with one that dispatches its event on the
 *   element, with the object and its index. An object prop's node fields are
 *   filled by children whose `slot` names the prop and the field
 *   (`slot="topbar.leading"`).
 * - **Code loaded later.** A tag can be defined before its member's code is
 *   loaded (`defineLazy`), so a page defines every tag at once and loads a
 *   member's code the first time one of its elements is to render. The queue
 *   loads the code of an element and of every element inside it before it
 *   renders any of them, so an element still adopts the elements inside it.
 * - **Children.** When the member first renders, the element's children are
 *   taken out and grouped by their `slot` attribute (`children` without one);
 *   a `<template slot="x">` gives its content without a wrapper. Whitespace
 *   that holds a line break is dropped, as JSX drops it. A slot hands the
 *   member its text as strings, its plain nodes as they are, and each `poly-*`
 *   element, and each outermost one inside a plain element, rendered inside
 *   the slot as the slot reads it (adoption), so the member's slot reads it
 *   as the member it holds.
 * - **Order.** A connected element only schedules its render. A microtask
 *   later the queue renders the scheduled elements in document order, so an
 *   element renders before the elements inside it and adopts them, whatever
 *   order their tags were defined in. While the document is loading, the queue
 *   waits for `DOMContentLoaded`, because a classic script sees an element
 *   before the parser has written its children.
 * - **Events.** Each of the member's callbacks dispatches a `PolymorphEvent`
 *   on the element (`events.ts`). A controlled prop the page holds a value for
 *   follows the reader: after its change event the element sets the prop to
 *   the event's value, unless a listener cancelled the event or set the prop
 *   itself. A controlled prop the page holds no value for leaves the member
 *   uncontrolled, as an absent prop leaves a React member, and its property
 *   reads the value the member last reported.
 * - **Errors.** A member that throws as it first renders renders nothing, and
 *   the members around it render as they would. One that throws as it updates
 *   (an effect that runs again) keeps what it had rendered, and the effect
 *   that threw stops. Either way the element dispatches `poly-error` with the
 *   error as `detail`, and reports the error as an uncaught error is
 *   (`reportError`) unless a listener cancels the event. An error a member's
 *   event handler throws is the browser's, as on any page: Solid runs the
 *   handler outside the member's rendering.
 * - **Listening.** A member that asks whether its caller handles an event
 *   (`listening`) is told so while a listener for it is added through the
 *   element's `addEventListener`, or while the `listens` attribute names it
 *   (`listens="dismiss"`), for a page that listens by delegation.
 * - **Content the page changes.** The element observes its own child list. A
 *   node the page adds before or after the member's rendering joins the slot
 *   its `slot` attribute names. A child the page removes through the element
 *   (`removeChild`) leaves its slot. A swap that replaces the element's
 *   children renders the member again from the new ones. A slot that is read
 *   again, because what one of the element's slots holds changed, keeps the
 *   rendering of each `poly-*` element it still holds, so a node added beside
 *   a field leaves the field, its text and its focus as they were.
 * - **Content a script places.** `fillSlot` sets the nodes one slot holds, in
 *   order, in place of what the page wrote there, before or after the member
 *   renders, on any element, a structural part included. A renderer that draws
 *   elements from data places every child this way and writes no markup.
 * - **Structural parts.** A table's section, row or cell, a list's item: its
 *   member renders the part's root (`<tr>`) where the element was, and the
 *   element, out of the document, stays the part's controller. Its attributes
 *   that are not props are copied to the root, its listeners are added to the
 *   root, and its events are dispatched on the root, so they bubble through
 *   the member to the page. A part written outside its member renders nothing
 *   and warns, naming the member it belongs in.
 */

/** Text a JSX author's line breaks make between nodes, which JSX drops. */
const layoutText = (node: Node): boolean =>
  node.nodeType === Node.TEXT_NODE &&
  /^\s*$/.test((node as Text).data) &&
  /\n/.test((node as Text).data)

/** Attributes that are a member's props and do harm on an element that draws no box. */
const moves = (attribute: string): boolean =>
  attribute === 'id' ||
  attribute === 'title' ||
  attribute === 'role' ||
  attribute.startsWith('aria-')

/** Attributes of a structural part that its root never takes. */
const KEPT = new Set(['slot', 'class', 'style', 'listens'])

/** The slot prop a `slot` attribute names: `secondary-action` is `secondaryAction`. */
const slotProp = (name: string): string =>
  name === '' ? 'children' : name.split('.').map(camel).join('.')

/** A listener as `addEventListener` was given it. */
interface Listening {
  type: string
  listener: EventListenerOrEventListenerObject
  options: boolean | AddEventListenerOptions | undefined
  capture: boolean
}

/** What happens to an element's member, for `PolyElement.observe`. */
export type InstanceEvent = 'render' | 'dispose'

const INSTANCE_LISTENERS = new Set<(element: PolyElement, event: InstanceEvent) => void>()

const notify = (element: PolyElement, event: InstanceEvent) => {
  for (const listener of INSTANCE_LISTENERS) listener(element, event)
}

/* -------------------------------------------------------------------------- */
/* Members and the code that holds them                                        */
/* -------------------------------------------------------------------------- */

/** The Solid member each defined element renders, by its class. */
const COMPONENTS = new WeakMap<object, Component<Record<string, unknown>>>()
/** The temporal codecs each defined element reads its dates and times through, by its class. */
const TEMPORAL = new WeakMap<object, TemporalCodecs>()

/** A tag defined before its member's code: how to load the code, and the load once started. */
interface Unloaded {
  readonly tag: string
  readonly load: () => Promise<unknown>
  loading: Promise<void> | null
  failed: boolean
}

/** Each element class whose member's code has not run yet, until its module defines it. */
const UNLOADED = new WeakMap<object, Unloaded>()
/** How many classes `UNLOADED` holds, so the queue looks for code to load only while some is. */
let unloaded = 0

/**
 * Starts loading the member's code of an element class, once, and returns
 * the load, which settles when the code has defined the element; `null` when
 * there is nothing to wait for. A load that fails is reported and not tried
 * again, and its elements render nothing.
 */
function loadOf(type: object | undefined): Promise<void> | null {
  const entry = type === undefined ? undefined : UNLOADED.get(type)
  if (entry === undefined || entry.failed) return null
  entry.loading ??= entry.load().then(
    () => {
      if (!UNLOADED.has(type as object)) return
      entry.failed = true
      console.error(`polymorph: the code loaded for <${entry.tag}> did not define it`)
    },
    (error: unknown) => {
      entry.failed = true
      console.error(`polymorph: the code for <${entry.tag}> did not load`, error)
    },
  )
  return entry.loading
}

/** The nodes a script placed in an element's slots (`fillSlot`), which the class gives this module. */
let placedIn: (element: PolyElement) => Iterable<readonly Node[]> = () => []
/** Places nodes in an element's slot; the class gives this module its private entry. */
let fill: (element: PolyElement, slot: string, nodes: readonly Node[]) => void = () => {}

/**
 * The loads an element's member and the members of the elements inside it
 * wait for: the elements in its markup and the elements placed in its slots.
 */
function loadsWithin(root: Element | DocumentFragment, loads: Set<Promise<void>>): void {
  const visit = (element: Element) => {
    const loading = loadOf(customElements.get(element.localName))
    if (loading !== null) loads.add(loading)
    if (!(element instanceof PolyElement)) return
    for (const nodes of placedIn(element)) {
      for (const node of nodes) if (node instanceof Element) loadsWithin(node, loads)
    }
  }
  if (root instanceof Element) visit(root)
  for (const element of root.querySelectorAll('*')) {
    visit(element)
    // A template's content is the slot content of the element around it.
    if (element instanceof HTMLTemplateElement) loadsWithin(element.content, loads)
  }
}

/* -------------------------------------------------------------------------- */
/* The render queue                                                            */
/* -------------------------------------------------------------------------- */

const PENDING = new Set<PolyElement>()
let scheduled = false

/**
 * Renders every scheduled element, in document order, skipping one another
 * has adopted. While a member's code is still loading for one of them or for
 * an element inside one, every element waits for it, so the outermost still
 * renders first and adopts the ones inside it.
 */
function flush(): void {
  scheduled = false
  const elements = [...PENDING].sort((a, b) =>
    a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
  )
  if (unloaded > 0) {
    const loads = new Set<Promise<void>>()
    // The elements are in document order, so the ones inside an element follow it directly.
    const outermost: Element[] = []
    for (const element of elements) {
      const last = outermost[outermost.length - 1]
      if (last === undefined || !last.contains(element)) outermost.push(element)
    }
    for (const element of outermost) loadsWithin(element, loads)
    if (loads.size > 0) {
      void Promise.all(loads).then(() => {
        if (scheduled) return
        scheduled = true
        queueMicrotask(flush)
      })
      return
    }
  }
  PENDING.clear()
  for (const element of elements) element[RENDER]()
}

function schedule(element: PolyElement): void {
  PENDING.add(element)
  if (scheduled) return
  scheduled = true
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => queueMicrotask(flush), { once: true })
  } else {
    queueMicrotask(flush)
  }
}

/** The queue's entry into an element, which it renders unless it is adopted, rendered or gone. */
const RENDER = Symbol('render')
/** A slot's entry into an element it holds: the element renders inside the slot. */
const ADOPT = Symbol('adopt')
/** The entry that disposes an adopted element no slot read again. */
const SETTLE = Symbol('settle')

/* -------------------------------------------------------------------------- */
/* Release                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Adopted elements whose slot let go of them: the computation that read the
 * slot was cleaned, to run again or to end. One that runs again reads the
 * slot again and takes back each element it still holds, with its rendering.
 * Each one nothing took back is disposed when the change that let go of it
 * has run: at once after a change the element base class makes itself, and a
 * microtask later after any other.
 */
const RELEASED = new Set<PolyElement>()
let settling = false

function release(element: PolyElement): void {
  RELEASED.add(element)
  if (settling) return
  settling = true
  queueMicrotask(settle)
}

/** Disposes every released element nothing took back. */
function settle(): void {
  settling = false
  if (RELEASED.size === 0) return
  const released = [...RELEASED]
  RELEASED.clear()
  for (const element of released) element[SETTLE]()
}

/* -------------------------------------------------------------------------- */
/* Adoption                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A `poly-*` element in a slot, rendered there: its host, or a structural
 * part's root. An element whose member's code the queue did not load first (a
 * node a script added to a slot later) renders there once the code has loaded.
 */
function Hosted(props: { element: PolyElement; reader: Owner | null }): JSX.Element {
  const { element, reader } = props
  const loading = loadOf(element.constructor)
  if (loading === null) return element[ADOPT](reader)
  const [loaded, setLoaded] = createSignal(false)
  void loading.then(() => setLoaded(true))
  return createMemo(() =>
    loaded() ? untrack(() => element[ADOPT](reader)) : undefined,
  ) as unknown as JSX.Element
}

/** The `poly-*` elements inside a plain element of a slot that no other one holds. */
function outermost(node: Element, out: PolyElement[] = []): PolyElement[] {
  for (const child of node.children) {
    if (child instanceof PolyElement) out.push(child)
    else outermost(child, out)
  }
  return out
}

/**
 * One node of a slot as the member reads it. The computation that reads the
 * slot is the element's reader: when it reads the slot again, the element
 * keeps its rendering.
 */
function content(node: Node): JSX.Element {
  const reader = getOwner()
  if (node instanceof PolyElement) return createComponent(Hosted, { element: node, reader })
  if (node.nodeType === Node.TEXT_NODE) return (node as Text).data
  // A member inside a plain element is made with the slot's content, as JSX makes it.
  if (node instanceof Element)
    for (const inner of outermost(node)) createComponent(Hosted, { element: inner, reader })
  return node as JSX.Element
}

/** The first element a member's rendering holds, read through its memos. */
function firstElement(value: unknown): Element | null {
  if (value instanceof Element) return value
  if (typeof value === 'function' && value.length === 0)
    return firstElement((value as () => unknown)())
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstElement(item)
      if (found !== null) return found
    }
  }
  return null
}

/* -------------------------------------------------------------------------- */
/* The element                                                                 */
/* -------------------------------------------------------------------------- */

/** `HTMLElement`, or a stand-in where there is no DOM, so the module loads in Node. */
const Base: typeof HTMLElement =
  typeof HTMLElement === 'undefined' ? (class {} as unknown as typeof HTMLElement) : HTMLElement

/**
 * Whether a name is a method an element inherits from `HTMLElement`
 * (`before`, `after`, `remove`, `focus`). A prop of that name gets no
 * property, because a property would hide the method from the page and from
 * the libraries that call it; its attribute sets it. A name that is an
 * accessor (`id`, `title`, `ariaLabel`) is not a method, and its prop's
 * property replaces it on the element.
 */
export function inheritedMethod(name: string): boolean {
  for (
    let prototype: object | null = Base.prototype;
    prototype !== null;
    prototype = Object.getPrototypeOf(prototype) as object | null
  ) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, name)
    if (descriptor !== undefined) return typeof descriptor.value === 'function'
  }
  return false
}

export class PolyElement extends Base {
  /** The element's definition; each defined element's class sets it. */
  static readonly definition: ElementDefinition

  /** The Solid member the element renders, or `undefined` while its code has not loaded. */
  static get component(): Component<Record<string, unknown>> | undefined {
    return COMPONENTS.get(this)
  }

  static get observedAttributes(): string[] {
    const definition = this.definition
    return [
      ...Object.entries(definition.props)
        .filter(([, codec]) => codec !== 'property')
        .map(([prop]) => attributeOf(prop)),
      'listens',
    ]
  }

  /**
   * Calls `listener` each time an element renders its member and each time
   * it disposes it, for code that follows every member on the page. Returns
   * the function that stops it.
   */
  static observe(listener: (element: PolyElement, event: InstanceEvent) => void): () => void {
    INSTANCE_LISTENERS.add(listener)
    return () => INSTANCE_LISTENERS.delete(listener)
  }

  readonly #definition: ElementDefinition
  /** Where the host state is added while the member renders; `null` in an engine without one. */
  readonly #internals: ElementInternals | null = null
  /** Each prop's value. */
  readonly #cells = new Map<string, Signal<unknown>>()
  /** How many times a prop was set, so a listener that sets one is not overwritten. */
  #writes = 0
  /** The props the member reads: getters over the cells, the handlers and the slots. */
  readonly #props: Record<string, unknown> = {}
  /** The prop each observed attribute reads into. */
  readonly #attributes = new Map<string, string>()
  /** Attributes the element is removing itself, whose removal sets nothing. */
  readonly #moving = new Set<string>()
  /** The attributes taken off the element, by name, with the value `restore` puts back. */
  readonly #moved = new Map<string, string>()
  /** The page's attributes are back on the element, which renders nothing until it renders again. */
  #kept = false
  /** Each event prop's handler, made once. */
  readonly #handlers = new Map<string, (...args: unknown[]) => unknown>()
  /** The controlled prop each change event reports. */
  readonly #controls = new Map<string, string>()
  /** The value the member last reported for each controlled prop the page holds no value for. */
  readonly #reported = new Map<string, unknown>()
  /**
   * The text of each date or time prop the page set before its member's code
   * was there, with the attribute or property it came by, read when the code
   * is there.
   */
  readonly #held = new Map<string, { text: string; source: string }>()

  /** The page's `poly-*` listeners, by type, and the events `listens` names. */
  readonly #listeners = new Map<string, Set<Listening>>()
  readonly #listens = createSignal<ReadonlySet<string>>(new Set())
  readonly #listenVersion = createSignal(0)
  /** Every listener added through the element, which a structural part's root also takes. */
  readonly #records: Listening[] = []

  /** What the page wrote in the element, by slot, while the member renders. */
  readonly #captured = createSignal<ReadonlyMap<string, readonly Node[]> | null>(null)
  /** The element's children as the page wrote them, put back when the member is disposed. */
  #original: Node[] | null = null
  /** The `slot` attributes taken off captured children, put back with them. */
  #slotted: [Element, string][] = []
  /** Each captured child, with its slot and the nodes it gave that slot (a template's content). */
  #given = new Map<Node, { slot: string; nodes: readonly Node[] }>()
  /** The nodes a script placed in each slot (`fillSlot`), by slot prop, kept across renders. */
  readonly #placed = new Map<string, readonly Node[]>()

  static {
    placedIn = (element) => element.#placed.values()
    fill = (element, slot, nodes) => element.#fill(slot, nodes)
  }

  /** Disposes the member's rendering, while it renders. */
  #dispose: (() => void) | null = null
  /** The owner a slot that adopted the element renders it under. */
  #owner: Owner | null = null
  /** The computation that read the slot that adopted the element. */
  #reader: Owner | null = null
  /** The adoption that renders the element now, so an earlier one's cleanup leaves it alone. */
  #hosting: object | null = null
  #standalone = false
  #adopted = false
  /** The comments around the member's rendering inside the element. */
  #markers: [Comment, Comment] | null = null
  #childList: MutationObserver | null = null
  /** A structural part's rendering, its root, the attributes copied to it, and its observer. */
  #rendered: JSX.Element = null
  #root: Element | null = null
  readonly #copied = new Set<string>()
  #attributeList: MutationObserver | null = null

  constructor() {
    super()
    const own = this.constructor as typeof PolyElement
    this.#definition = own.definition
    try {
      const internals = this.attachInternals()
      // Tried once here, so an engine that refuses the state fails here and not at each render.
      internals.states.add('poly-host')
      internals.states.delete('poly-host')
      this.#internals = internals
    } catch {
      // An engine without custom states draws the host as an inline box.
    }
    const definition = this.#definition
    for (const [prop] of Object.entries(definition.props)) {
      this.#attributes.set(attributeOf(prop), prop)
      const fields = definition.fields?.[prop]
      Object.defineProperty(this.#props, prop, {
        enumerable: true,
        get:
          fields === undefined
            ? () => this.#cell(prop)[0]()
            : () => this.#withFields(prop, fields, this.#cell(prop)[0]()),
      })
    }
    for (const [prop, event] of Object.entries(definition.events)) {
      Object.defineProperty(this.#props, prop, {
        enumerable: true,
        get: () =>
          event.listened === true && !this.#listening(prop) ? undefined : this.#handler(prop),
      })
    }
    for (const [prop, event] of Object.entries(definition.controlled ?? {})) {
      this.#controls.set(event, prop)
    }
    for (const prop of definition.slots) {
      Object.defineProperty(this.#props, prop, {
        enumerable: true,
        get: () => this.#slot(prop),
      })
    }
    // A property a script set before the element was defined is set again through its accessor.
    for (const prop of Object.keys(definition.props)) {
      const name = propertyOf(prop)
      if (inheritedMethod(name) || !Object.prototype.hasOwnProperty.call(this, name)) continue
      const value = (this as unknown as Record<string, unknown>)[name]
      delete (this as unknown as Record<string, unknown>)[name]
      ;(this as unknown as Record<string, unknown>)[name] = value
    }
  }

  /**
   * Defines a member's element: its tag, over the Solid member it renders,
   * with an accessor for each of its props. A member with a date or a time
   * prop is given the temporal codecs (`@polymorph/elements/temporal`) its
   * element reads them through. Defining a tag that is already defined
   * returns the element that holds it.
   */
  static define(
    definition: ElementDefinition,
    component: Component<never>,
    temporal?: TemporalCodecs,
  ): typeof PolyElement {
    const member = component as unknown as Component<Record<string, unknown>>
    const existing = customElements.get(definition.tag)
    if (existing !== undefined) {
      // A tag defined before its member's code is given the member when the code runs.
      if (UNLOADED.delete(existing)) {
        unloaded -= 1
        COMPONENTS.set(existing, member)
        if (temporal !== undefined) TEMPORAL.set(existing, temporal)
      }
      return existing as unknown as typeof PolyElement
    }
    const element = PolyElement.#class(definition)
    COMPONENTS.set(element, member)
    // Before the tag is defined, because defining it reads the attributes of the elements written.
    if (temporal !== undefined) TEMPORAL.set(element, temporal)
    customElements.define(definition.tag, element)
    return element
  }

  /**
   * Defines a member's element before its member's code is loaded: the tag,
   * its attributes and its properties now, and the member when `load` has run
   * the module that defines it with `define`. The queue calls `load` the first
   * time an element of the tag, or one around it, is to render. Defining a tag
   * that is already defined returns the element that holds it.
   */
  static defineLazy(
    definition: ElementDefinition,
    load: () => Promise<unknown>,
  ): typeof PolyElement {
    const existing = customElements.get(definition.tag)
    if (existing !== undefined) return existing as unknown as typeof PolyElement
    const element = PolyElement.#class(definition)
    UNLOADED.set(element, { tag: definition.tag, load, loading: null, failed: false })
    unloaded += 1
    customElements.define(definition.tag, element)
    return element
  }

  /** A class for a definition, with an accessor for each of its props. */
  static #class(definition: ElementDefinition): typeof PolyElement {
    const element = class extends PolyElement {
      static override readonly definition = definition
    }
    PolyElement.#install(element.prototype, definition)
    return element
  }

  /**
   * Gives a defined element's class an accessor for each of its props, except
   * a prop whose name is a method the element inherits, which its attribute sets.
   */
  static #install(prototype: PolyElement, definition: ElementDefinition): void {
    for (const [prop, codec] of Object.entries(definition.props)) {
      if (inheritedMethod(propertyOf(prop))) continue
      Object.defineProperty(prototype, propertyOf(prop), {
        configurable: true,
        enumerable: true,
        get(this: PolyElement) {
          return this.#read(prop)
        },
        set(this: PolyElement, value: unknown) {
          this.#assign(prop, codec, value)
        },
      })
    }
  }

  /* props ------------------------------------------------------------------ */

  #cell(prop: string): Signal<unknown> {
    let cell = this.#cells.get(prop)
    if (cell === undefined) {
      cell = createSignal<unknown>(undefined)
      this.#cells.set(prop, cell)
    }
    return cell
  }

  /**
   * A prop's value as a script reads it. A controlled prop the page holds no
   * value for is the member's own state, so it reads as the value the member
   * last reported.
   */
  #read(prop: string): unknown {
    this.#readHeld()
    const value = this.#cell(prop)[0]()
    if (value !== undefined || !this.#reported.has(prop)) return value
    return this.#reported.get(prop)
  }

  /** A value the page sets, through an attribute or a property. */
  #write(prop: string, value: unknown): void {
    this.#held.delete(prop)
    this.#reported.delete(prop)
    this.#set(prop, value)
  }

  /** A value a script sets through a prop's property. */
  #assign(prop: string, codec: Codec, value: unknown): void {
    if (typeof value === 'string' && readsTemporal(codec) && !this.#codeLoaded()) {
      this.#hold(prop, value, `<${this.#definition.tag}>.${propertyOf(prop)}`)
      return
    }
    this.#write(prop, coerce(codec, value, TEMPORAL.get(this.constructor)))
  }

  /** Whether the element's member's code is there, with the temporal codecs it gives `define`. */
  #codeLoaded(): boolean {
    return (this.constructor as typeof PolyElement).component !== undefined
  }

  /**
   * Text read through a prop's codec. Text the codec cannot read is reported,
   * naming the attribute or property it came by, and reads as unset.
   */
  #readText(prop: string, text: string | null, source: string): unknown {
    try {
      return decode(this.#definition.props[prop] as Codec, text, TEMPORAL.get(this.constructor))
    } catch (error) {
      if (!(error instanceof Unreadable)) throw error
      devWarning(true, `${source}: ${error.message}; the prop is unset`)
      return undefined
    }
  }

  /**
   * Keeps a date or time prop's text that arrives before its member's code,
   * which brings the temporal codecs. The prop reads as unset until the code
   * is there.
   */
  #hold(prop: string, text: string, source: string): void {
    this.#write(prop, undefined)
    this.#held.set(prop, { text, source })
  }

  /** Reads each text `#hold` kept through its codec, once the member's code is there. */
  #readHeld(): void {
    if (this.#held.size === 0 || !this.#codeLoaded()) return
    for (const [prop, { text, source }] of [...this.#held]) {
      this.#write(prop, this.#readText(prop, text, source))
    }
  }

  #set(prop: string, value: unknown): void {
    this.#writes += 1
    const callbacks = this.#definition.callbacks?.[prop]
    const completed = callbacks === undefined ? value : this.#complete(callbacks, value, '', null)
    this.#cell(prop)[1](() => completed)
  }

  /**
   * A JSON value with every callback its objects require and lack completed:
   * each completed callback dispatches its event on the element, with the
   * object and its index in its list. The page's own objects are copied, not
   * changed, and a value that lacks none is the page's as it is.
   */
  #complete(
    callbacks: readonly ElementCallback[],
    value: unknown,
    at: string,
    index: number | null,
  ): unknown {
    if (Array.isArray(value)) {
      let changed = false
      const items = value.map((item: unknown, position) => {
        const completed = this.#complete(callbacks, item, at, position)
        if (completed !== item) changed = true
        return completed
      })
      return changed ? items : value
    }
    if (value === null || typeof value !== 'object') return value
    const prototype = Object.getPrototypeOf(value) as unknown
    if (prototype !== Object.prototype && prototype !== null) return value
    const object = value as Record<string, unknown>
    let copy: Record<string, unknown> | null = null
    for (const callback of callbacks) {
      if (callback.at !== at || typeof object[callback.name] === 'function') continue
      const kind = callback.where ?? []
      if (
        !kind.every(({ field, is }) => is.includes((object[field] as string | undefined) ?? null))
      )
        continue
      copy ??= { ...object }
      copy[callback.name] = (...args: unknown[]) =>
        new PolymorphEvent(callback.type, {
          detail: { item: object, index, ...(args.length > 0 ? { value: args[0] } : {}) },
          bubbles: true,
          composed: true,
        }).dispatchOn(this.#root ?? this)
    }
    for (const [field, inner] of Object.entries(object)) {
      const next = at === '' ? field : `${at}.${field}`
      if (!callbacks.some((callback) => callback.at === next || callback.at.startsWith(`${next}.`)))
        continue
      const completed = this.#complete(callbacks, inner, next, null)
      if (completed === inner) continue
      copy ??= { ...object }
      copy[field] = completed
    }
    return copy ?? object
  }

  /**
   * An object prop with its node fields filled by the children whose `slot`
   * names the prop and the field (`slot="topbar.leading"`), over the fields
   * its value already has. Each field is read as a slot is, when the member
   * reads it.
   */
  #withFields(prop: string, fields: readonly string[], value: unknown): unknown {
    const captured = this.#captured[0]()
    const filled = fields.filter((field) => (captured?.get(`${prop}.${field}`)?.length ?? 0) > 0)
    if (filled.length === 0) return value
    const merged: Record<string, unknown> =
      value !== null && typeof value === 'object' ? { ...(value as Record<string, unknown>) } : {}
    for (const field of filled) {
      Object.defineProperty(merged, field, {
        enumerable: true,
        get: () => this.#slot(`${prop}.${field}`),
      })
    }
    return merged
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === 'listens') {
      this.#listens[1](
        new Set(
          (value ?? '')
            .split(/\s+/)
            .filter((word) => word !== '')
            .map((word) => (word.startsWith(PREFIX) ? word : `${PREFIX}${kebab(word)}`)),
        ),
      )
      return
    }
    const prop = this.#attributes.get(name)
    if (prop === undefined) return
    if (value === null && this.#moving.delete(name)) return
    const source = `<${this.#definition.tag} ${name}>`
    const codec = this.#definition.props[prop] as Codec
    if (value !== null && readsTemporal(codec) && !this.#codeLoaded()) {
      this.#hold(prop, value, source)
    } else this.#write(prop, this.#readText(prop, value, source))
    if (value !== null && moves(name) && !this.#kept) this.#move(name, value)
  }

  /** Takes an attribute that is a prop off the element while its member renders. */
  #move(name: string, value: string): void {
    this.#moved.set(name, value)
    this.#moving.add(name)
    this.removeAttribute(name)
  }

  /* events ----------------------------------------------------------------- */

  /** Whether the page handles an event prop's event: a listener on the element, or `listens`. */
  #listening(prop: string): boolean {
    this.#listenVersion[0]()
    const type = this.#definition.events[prop]?.type ?? ''
    return (this.#listeners.get(type)?.size ?? 0) > 0 || this.#listens[0]().has(type)
  }

  #handler(prop: string): (...args: unknown[]) => unknown {
    let handler = this.#handlers.get(prop)
    if (handler === undefined) {
      const type = this.#definition.events[prop]?.type ?? `${PREFIX}${kebab(prop.slice(2))}`
      handler = (...args: unknown[]) => {
        const controls = this.#controls.get(prop)
        const event = new PolymorphEvent(type, {
          detail: args.length === 0 || args[0] === undefined ? null : args[0],
          args,
          bubbles: true,
          composed: true,
          cancelable: controls !== undefined,
        })
        const writes = this.#writes
        const settled = event.dispatchOn(this.#root ?? this)
        this.#forgetOnce(type)
        if (controls !== undefined && this.#writes === writes) {
          // A value the page holds follows the reader unless a listener cancels the change. A
          // member the page holds no value for keeps its own state, which the property reads.
          if (untrack(this.#cell(controls)[0]) === undefined) this.#reported.set(controls, args[0])
          else if (!event.defaultPrevented) this.#set(controls, args[0])
        }
        return settled
      }
      this.#handlers.set(prop, handler)
    }
    return handler
  }

  /** Listeners added with `once`, which the browser removed as the event reached them. */
  #forgetOnce(type: string): void {
    const set = this.#listeners.get(type)
    if (set === undefined) return
    let changed = false
    for (const entry of [...set]) {
      if (typeof entry.options === 'object' && entry.options.once === true) {
        set.delete(entry)
        this.#forget(entry)
        changed = true
      }
    }
    if (changed) this.#listenVersion[1]((count) => count + 1)
  }

  #forget(entry: Listening): void {
    const at = this.#records.indexOf(entry)
    if (at !== -1) this.#records.splice(at, 1)
  }

  override addEventListener<K extends keyof HTMLElementEventMap>(
    type: K,
    listener: (this: HTMLElement, event: HTMLElementEventMap[K]) => unknown,
    options?: boolean | AddEventListenerOptions,
  ): void
  override addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void
  override addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void {
    if (listener === null) return
    super.addEventListener(type, listener, options)
    const capture = typeof options === 'boolean' ? options : options?.capture === true
    if (this.#records.some((entry) => same(entry, type, listener, capture))) return
    const entry: Listening = { type, listener, options, capture }
    this.#records.push(entry)
    this.#root?.addEventListener(type, listener, options)
    if (type.startsWith(PREFIX)) {
      let set = this.#listeners.get(type)
      if (set === undefined) {
        set = new Set()
        this.#listeners.set(type, set)
      }
      set.add(entry)
      this.#listenVersion[1]((count) => count + 1)
    }
    if (typeof options === 'object' && options.signal !== undefined) {
      options.signal.addEventListener(
        'abort',
        () => this.removeEventListener(type, listener, options),
        {
          once: true,
        },
      )
    }
  }

  override removeEventListener<K extends keyof HTMLElementEventMap>(
    type: K,
    listener: (this: HTMLElement, event: HTMLElementEventMap[K]) => unknown,
    options?: boolean | EventListenerOptions,
  ): void
  override removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ): void
  override removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ): void {
    if (listener === null) return
    super.removeEventListener(type, listener, options)
    const capture = typeof options === 'boolean' ? options : options?.capture === true
    const entry = this.#records.find((candidate) => same(candidate, type, listener, capture))
    if (entry === undefined) return
    this.#forget(entry)
    this.#root?.removeEventListener(type, listener, options)
    if (this.#listeners.get(type)?.delete(entry) === true) {
      this.#listenVersion[1]((count) => count + 1)
    }
  }

  /* slots ------------------------------------------------------------------ */

  /**
   * Takes the page's children out of the element, grouped by slot. Untracked:
   * a slot adopts the element while it is read, and a change to what the
   * element holds renders the element again, not the member around it.
   */
  #capture(): void {
    if (untrack(this.#captured[0]) !== null) return
    const original = [...this.childNodes]
    const slots = new Map<string, Node[]>()
    this.#slotted = []
    this.#given = new Map()
    for (const node of original) this.#take(node, slots, 'end')
    // What a script placed in a slot takes the place of what the page wrote there.
    for (const [key, nodes] of this.#placed) {
      if (nodes.length === 0) slots.delete(key)
      else slots.set(key, [...nodes])
    }
    this.replaceChildren()
    this.#original = original
    this.#captured[1](slots)
  }

  /**
   * Sets the nodes a slot holds (`fillSlot`). Before the member renders, they
   * wait for it; while it renders, the member reads the slot again, which
   * keeps each element still there rendered as it was.
   */
  #fill(slot: string, nodes: readonly Node[]): void {
    const key = slotProp(slot)
    const placed = [...nodes]
    this.#placed.set(key, placed)
    const captured = untrack(this.#captured[0])
    if (captured === null) return
    const before = captured.get(key) ?? []
    const slots = new Map<string, readonly Node[]>(captured)
    if (placed.length === 0) slots.delete(key)
    else slots.set(key, placed)
    this.#captured[1](slots)
    settle()
    // A node the member still has in its rendering once it has read the slot again is removed here.
    const rendering = this.#root ?? this
    for (const node of before) {
      if (!placed.includes(node) && rendering.contains(node)) (node as ChildNode).remove()
    }
  }

  /** Adds one node the page wrote to its slot, at its start or its end. */
  #take(node: Node, slots: Map<string, Node[]>, at: 'start' | 'end'): void {
    if (node.nodeType === Node.COMMENT_NODE || layoutText(node)) return
    const named = node instanceof Element ? node.getAttribute('slot') : null
    if (named !== null && node instanceof Element) {
      this.#slotted.push([node, named])
      node.removeAttribute('slot')
    }
    const key = slotProp(named ?? '')
    const nodes =
      node instanceof HTMLTemplateElement
        ? [...document.importNode(node.content, true).childNodes].filter(
            (inner) => inner.nodeType !== Node.COMMENT_NODE && !layoutText(inner),
          )
        : [node]
    this.#given.set(node, { slot: key, nodes })
    const list = slots.get(key) ?? []
    slots.set(key, at === 'start' ? [...nodes, ...list] : [...list, ...nodes])
  }

  /**
   * Takes a child the page wrote or added out of the slot it fills, while the
   * member renders: the child and the nodes it gave the slot (a template's
   * content) leave the slot and the document, and the member reads the slot
   * without them. The member draws a slot's nodes inside its own elements,
   * and a node the page removes from there stays in its slot. So the page
   * takes a child out through the element, as it adds one through the
   * element. Any other node is removed as `Node.removeChild` removes it.
   */
  override removeChild<T extends Node>(child: T): T {
    const taken: Node = child
    const given = this.#given.get(taken)
    const captured = untrack(this.#captured[0])
    if (given === undefined || captured === null) return super.removeChild(child)
    this.#given.delete(taken)
    const slots = new Map<string, readonly Node[]>(captured)
    const left = (slots.get(given.slot) ?? []).filter((node) => !given.nodes.includes(node))
    if (left.length === 0) slots.delete(given.slot)
    else slots.set(given.slot, left)
    if (this.#original !== null) this.#original = this.#original.filter((node) => node !== taken)
    const at = this.#slotted.findIndex(([element]) => element === taken)
    if (at !== -1) {
      // The child keeps its `slot` attribute, so the page can add it again to the same slot.
      const [[element, name]] = this.#slotted.splice(at, 1) as [[Element, string]]
      element.setAttribute('slot', name)
    }
    this.#captured[1](slots)
    settle()
    // A node the member still has in the document once it has read the slot again is removed here.
    for (const node of [...given.nodes, taken]) (node as ChildNode).remove()
    return child
  }

  /**
   * A slot as the member reads it: `undefined` when the page put nothing in
   * it, the text alone when it holds one text, and otherwise a list. A slot
   * that holds one element is a list of one, so a second node added beside it
   * is inserted after it, and the element is not taken out of the document
   * and put back, which would take the focus from a field inside it.
   */
  #slot(prop: string): JSX.Element | undefined {
    const nodes = this.#captured[0]()?.get(prop)
    if (nodes === undefined || nodes.length === 0) return undefined
    const read = nodes.map(content)
    return read.length === 1 && typeof read[0] === 'string' ? read[0] : read
  }

  /* rendering -------------------------------------------------------------- */

  connectedCallback(): void {
    if (!this.#adopted && this.#dispose === null) schedule(this)
  }

  disconnectedCallback(): void {
    if (!this.#standalone) return
    // A move within the document connects the element again in the same task.
    queueMicrotask(() => {
      if (!this.isConnected && this.#standalone) this.#teardown()
    })
  }

  [RENDER](): void {
    if (!this.isConnected || this.#adopted || this.#dispose !== null) return
    // A member whose code failed to load renders nothing; the failure was reported.
    if ((this.constructor as typeof PolyElement).component === undefined) return
    if (this.#definition.structural === true) {
      // A row, a cell or an item renders where its member puts it, and nowhere else.
      devWarning(
        true,
        `<${this.#definition.tag}> renders only inside <${this.#definition.within ?? 'its member'}>, which draws it; outside it the element renders nothing`,
      )
      return
    }
    this.#standalone = true
    this.#mount()
  }

  /** Renders the element inside the slot `reader` reads (`content`). */
  [ADOPT](reader: Owner | null): JSX.Element {
    const owner = getOwner()
    if (this.#reclaims(reader)) {
      // The slot that holds the element read it again: it keeps its rendering.
      RELEASED.delete(this)
      this.#owner = owner
      this.#host()
      return this.#definition.structural === true ? this.#rendered : this
    }
    if (this.#dispose !== null) this.#teardown()
    // A member whose code failed to load renders nothing; the failure was reported.
    if ((this.constructor as typeof PolyElement).component === undefined) {
      return this.#definition.structural === true ? null : this
    }
    this.#host()
    this.#adopted = true
    this.#owner = owner
    this.#reader = reader
    this.#mount()
    return this.#definition.structural === true ? this.#rendered : this
  }

  /**
   * Whether a slot reading the element takes back the rendering a read of the
   * same slot let go of: the element was released, and the computation that
   * reads the slot now is the one that read it before, run again.
   */
  #reclaims(reader: Owner | null): boolean {
    return (
      this.#dispose !== null &&
      this.#adopted &&
      this.#hosting === null &&
      reader !== null &&
      reader === this.#reader
    )
  }

  /** Ties the element to the slot's current read: when the read is cleaned, the element is released. */
  #host(): void {
    const token = {}
    this.#hosting = token
    onCleanup(() => {
      if (this.#hosting !== token) return
      this.#hosting = null
      release(this)
    })
  }

  [SETTLE](): void {
    if (this.#hosting === null && this.#adopted) this.#teardown()
  }

  /** Renders the member: in a root of its own, under the slot that adopted the element if one did. */
  #mount(): void {
    // A date or a time the page set while the member's code loaded is read before the member renders.
    this.#readHeld()
    if (this.#kept) {
      // Attributes `restore` put back are taken off again, as they were when the element was defined.
      this.#kept = false
      for (const { name, value } of [...this.attributes]) {
        if (moves(name) && this.#attributes.has(name)) this.#move(name, value)
      }
    }
    this.#capture()
    const component = (this.constructor as typeof PolyElement).component as Component<
      Record<string, unknown>
    >
    createRoot(
      (dispose) => {
        this.#dispose = dispose
        // A member that throws renders nothing, and the members around it render as they would.
        const rendered = catchError(
          () => createComponent(component, this.#props),
          (error: unknown) => this.#fail(error),
        )
        if (this.#definition.structural === true) {
          this.#rendered = rendered
          createRenderEffect(() => this.#rootIs(firstElement(rendered)))
          return
        }
        this.#internals?.states.add('poly-host')
        hostMember(this, rendered)
        const markers: [Comment, Comment] = [document.createComment(''), document.createComment('')]
        this.append(...markers)
        this.#markers = markers
        insert(this, rendered, markers[1])
        this.#childList = new MutationObserver(() => this.#follow())
        this.#childList.observe(this, { childList: true })
      },
      this.#adopted ? (this.#owner ?? undefined) : undefined,
    )
    notify(this, 'render')
  }

  /**
   * Reports an error the member threw as it rendered or as it updated:
   * `poly-error` on the element, with the error as `detail`, and, unless a
   * listener cancels the event, as an uncaught error is reported, to
   * `window`'s `error` event (which error monitors read) and the console.
   */
  #fail(error: unknown): void {
    const event = new PolymorphEvent(ERROR_EVENT, { detail: error, cancelable: true })
    event.dispatchOn(this)
    if (event.defaultPrevented) return
    if (typeof reportError === 'function') reportError(error)
    else console.error(`polymorph: the member of <${this.#definition.tag}> threw`, error)
  }

  /** Disposes the member and puts the page's children back. */
  #teardown(): void {
    const dispose = this.#dispose
    if (dispose === null) return
    this.#dispose = null
    this.#childList?.disconnect()
    this.#childList = null
    this.#attributeList?.disconnect()
    this.#attributeList = null
    dispose()
    // The elements the member's slots held are disposed with it, before the page's children are back.
    settle()
    this.#rootIs(null)
    this.#rendered = null
    this.#markers = null
    const original = this.#original ?? []
    this.#original = null
    this.replaceChildren(...original)
    for (const [element, name] of this.#slotted) element.setAttribute('slot', name)
    this.#slotted = []
    this.#given = new Map()
    this.#captured[1](null)
    this.#standalone = false
    this.#adopted = false
    this.#reader = null
    // The element holds the page's children again, as it did before it rendered.
    this.#internals?.states.delete('poly-host')
    // The attributes the member's props took off go back, so the page's markup is whole again.
    this.#kept = true
    for (const [name, value] of this.#moved) this.setAttribute(name, value)
    this.#moved.clear()
    notify(this, 'dispose')
  }

  /**
   * Disposes the member this element renders on its own and puts back the
   * children the page wrote, so a snapshot of the page saves the page's
   * markup. An element its member's slot renders is restored with that member.
   */
  restore(): void {
    if (this.#standalone) this.#teardown()
  }

  /** Follows the page's changes to the element's children while the member renders. */
  #follow(): void {
    const markers = this.#markers
    if (markers === null) return
    const [start, end] = markers
    if (start.parentNode !== this || end.parentNode !== this) {
      // The page replaced the element's children: the member renders again from the new ones.
      const dispose = this.#dispose
      this.#dispose = null
      this.#childList?.disconnect()
      dispose?.()
      settle()
      this.#markers = null
      this.#original = null
      this.#slotted = []
      this.#given = new Map()
      this.#captured[1](null)
      notify(this, 'dispose')
      this.#mount()
      return
    }
    const before: Node[] = []
    const after: Node[] = []
    let region: 'before' | 'inside' | 'after' = 'before'
    for (const node of this.childNodes) {
      if (node === start) region = 'inside'
      else if (node === end) region = 'after'
      else if (region === 'before') before.push(node)
      else if (region === 'after') after.push(node)
    }
    if (before.length + after.length === 0) return
    const slots = new Map<string, Node[]>(
      [...(this.#captured[0]() ?? new Map<string, readonly Node[]>())].map(([key, nodes]) => [
        key,
        [...nodes],
      ]),
    )
    for (const node of [...before].reverse()) {
      node.parentNode?.removeChild(node)
      this.#original?.unshift(node)
      this.#take(node, slots, 'start')
    }
    for (const node of after) {
      node.parentNode?.removeChild(node)
      this.#original?.push(node)
      this.#take(node, slots, 'end')
    }
    this.#childList?.takeRecords()
    this.#captured[1](slots)
    settle()
  }

  /* structural parts ------------------------------------------------------- */

  /** A structural part's root, which takes the element's attributes and listeners. */
  #rootIs(root: Element | null): void {
    const previous = this.#root
    if (root !== previous) {
      for (const entry of this.#records) {
        previous?.removeEventListener(entry.type, entry.listener, entry.options)
        root?.addEventListener(entry.type, entry.listener, entry.options)
      }
      for (const name of this.#copied) previous?.removeAttribute(name)
      this.#copied.clear()
      this.#root = root
    }
    if (root === null) return
    this.#copyAttributes()
    if (this.#attributeList === null) {
      this.#attributeList = new MutationObserver(() => this.#copyAttributes())
      this.#attributeList.observe(this, { attributes: true })
    }
  }

  /** Copies the part's attributes that are not its props onto its root, and takes off the ones it lost. */
  #copyAttributes(): void {
    const root = this.#root
    if (root === null) return
    const now = new Set<string>()
    for (const attribute of this.attributes) {
      if (KEPT.has(attribute.name) || this.#attributes.has(attribute.name)) continue
      now.add(attribute.name)
      if (root.getAttribute(attribute.name) !== attribute.value) {
        root.setAttribute(attribute.name, attribute.value)
      }
    }
    for (const name of this.#copied) if (!now.has(name)) root.removeAttribute(name)
    this.#copied.clear()
    for (const name of now) this.#copied.add(name)
  }
}

/**
 * A member's element as a script reads it: the base class, with a property
 * for each prop named, typed by the member's props, in place of the
 * element's own property of that name (`title`, `ariaLabel`, `id`).
 */
export type MemberElement<Props, Names extends keyof Props & string> = Omit<
  PolyElement,
  PropertyName<Names>
> &
  ElementProperties<Props, Names>

/** Whether a recorded listener is the one `addEventListener` was given again. */
const same = (
  entry: Listening,
  type: string,
  listener: EventListenerOrEventListenerObject,
  capture: boolean,
) => entry.type === type && entry.listener === listener && entry.capture === capture

/**
 * Defines a member's element: its tag, over the Solid member it renders. A
 * member with a date or a time prop is given `temporal`, the temporal codecs
 * (`@polymorph/elements/temporal`), which its element reads them through.
 * Defining a tag that is already defined returns the element that holds it.
 */
export function define(
  definition: ElementDefinition,
  component: Component<never>,
  temporal?: TemporalCodecs,
): typeof PolyElement {
  return PolyElement.define(definition, component, temporal)
}

/**
 * Defines a member's element before its member's code is loaded: `load` runs
 * the module that calls `define` for the tag, the first time an element of
 * the tag, or one around it, is to render. A page defines every tag this way
 * at once and loads only the members it uses.
 */
export function defineLazy(
  definition: ElementDefinition,
  load: () => Promise<unknown>,
): typeof PolyElement {
  return PolyElement.defineLazy(definition, load)
}

/**
 * Sets the nodes one slot of an element holds, in order, in place of what the
 * page wrote there: `slot` is the slot as a `slot` attribute names it (`''`
 * for the children, `footer`, `empty-state.action`), and each node is text,
 * a `poly-*` element or a plain node, as a child the page wrote would be. It
 * works before the member renders and while it renders, on a structural part
 * as on any other element. Each `poly-*` element the slot held before and
 * still holds keeps its rendering; one it no longer holds is disposed. An
 * empty list empties the slot.
 *
 * A placed node is not a child of the element: `restore` puts back only what
 * the page wrote, and the slot holds the placed nodes again when the member
 * renders again.
 */
export function fillSlot(element: Element, slot: string, nodes: readonly Node[]): void {
  if (!(element instanceof PolyElement)) {
    throw new TypeError(
      `fillSlot fills a slot of a defined poly-* element, and <${element.localName}> is not one`,
    )
  }
  fill(element, slot, nodes)
}

/**
 * Disposes every member rendered on its own in `root` and puts back the
 * children the page wrote, so a page snapshot (Turbo's cache, htmx's history)
 * saves the page's markup rather than the members' rendering.
 */
export function restore(root: ParentNode = document): void {
  if (root instanceof PolyElement) root.restore()
  for (const element of [...root.querySelectorAll('*')]) {
    if (element instanceof PolyElement) element.restore()
  }
}
