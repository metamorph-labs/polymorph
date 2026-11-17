import {
  createRawSnippet,
  getAllContexts,
  getContext,
  mount,
  onDestroy,
  setContext,
  unmount,
  untrack,
  type Snippet,
} from 'svelte'

import { htmlText, serverRender } from './server'
import SnippetHost from './SnippetHost.svelte'

/**
 * What a member reads from what a caller put in one of its slots, and what it
 * hands it: the description's `slotted`, `pass` and `take`.
 *
 * A Svelte slot is a snippet, which no code can look inside, so a member that
 * reads a slot, hands it props or takes the first of what it holds renders it
 * inside a `SlotOutlet` with a `SlotScope`, and reads the document the slot
 * renders. The outlet places an empty text node before the slot's output and
 * one after it. Every member joins the slot it is rendered in (`joinSlot`),
 * with its `controlKind` and the props a parent reads, and places an empty
 * text node before and after its own output. So the scope reads, between the
 * outlet's two nodes, each member and each element no member rendered, in
 * document order: FormField reads its control's kind and hands the control
 * its id whether it is a member or an `<input>`, Avatar.Group draws the first
 * `max`, and Dialog hands its trigger the `onClick` that opens it. A member
 * inside an element of the slot belongs to that element, which is what the
 * slot holds, as React's `cloneElement` and Vue's slot read it. Text is not
 * counted.
 *
 * A member hands a member in its slot props through the member's own props
 * (`joined.passed`). It hands an element attributes and listeners: the outlet
 * sets them once the element is in the document, keeps them while the element
 * is in the slot, and restores the element's own when it leaves. An element
 * past `take` is hidden.
 *
 * A member that reads its slot before the slot renders (FormField lays out its
 * label by its control's kind) or in a state that does not render it
 * (ChatThread shows its empty state when it holds no turn) has a probe: the
 * slot is mounted outside the document as the member is made, so the first
 * render reads it. An outlet that opens for the same slot moves the probe's
 * output into place instead of rendering the slot again, so each member in it
 * is made once. While no outlet is in the document, the slot is probed again.
 * A server render renders the probe to a string (`server.ts`).
 */

/** What a parent reads from its slot: how many it holds, and the first one's `controlKind` and props. */
export interface Slotted {
  count: number
  kind: string | undefined
  props: Readonly<Record<string, unknown>>
}

/** A member in a slot, and the text nodes it renders before and after its output. */
interface Entry {
  readonly kind: string | undefined
  props(): Readonly<Record<string, unknown>>
  start: ChildNode | null
  end: ChildNode | null
}

/** One thing a slot holds: a member, or an element no member rendered, with its attributes. */
type Item =
  | { readonly entry: Entry }
  | { readonly element: Element; readonly props: Readonly<Record<string, unknown>> }

/** What a slot's document held when it was last read. */
interface Scan {
  /** The members and the elements at the slot's top level, in document order. */
  readonly items: readonly Item[]
  /** Members rendered inside an element of the slot: the element is what the slot holds. */
  readonly nested: ReadonlySet<Entry>
}

const SLOT = Symbol('polymorph:slot')
const UNREAD: Scan = { items: [], nested: new Set() }
const NONE: Slotted = { count: 0, kind: undefined, props: {} }

const isHandler = (name: string) => /^on[A-Z]/.test(name)

/**
 * A snippet that renders one empty text node and hands it to `place`. A raw
 * snippet must render an element, so a mount renders a `<template>` and
 * replaces it at once; a server render writes a comment, which hydration reads
 * in its place. The node is removed with the snippet.
 */
function marker(place: (node: ChildNode) => void): Snippet {
  return createRawSnippet(() => ({
    render: () => (typeof document === 'undefined' ? '<!---->' : '<template></template>'),
    setup(element) {
      let node: ChildNode = element
      if (element.nodeType === Node.ELEMENT_NODE) {
        node = document.createTextNode('')
        element.replaceWith(node)
      }
      place(node)
      return () => {
        if (node !== element) node.remove()
      }
    },
  }))
}

/** What an outlet set on one element: each attribute's own value and the value set, and its listeners. */
interface Applied {
  attributes: Map<string, { own: string | null; set: string }>
  listeners: Map<string, { current: (event: Event) => void; listener: (event: Event) => void }>
}

/** One rendering of a slot, by an outlet or a probe, and what it holds. */
class Rendering {
  #joined = $state.raw<readonly Entry[]>([])
  #scanned = $state.raw<Scan>(UNREAD)
  #memo: { joined: readonly Entry[]; scanned: Scan; items: readonly Item[] } | undefined
  #range: { parent: Node; nodes: () => readonly ChildNode[] } | undefined
  #observer: MutationObserver | undefined
  #pending = false
  readonly #applied = new Map<Element, Applied>()

  constructor(
    private readonly scope: SlotScope,
    /** A server probe's members stay: the render that made them ends before the member reads them. */
    private readonly keep = false,
  ) {}

  join(entry: Entry): void {
    this.#joined = [...this.#joined, entry]
    this.#schedule()
  }

  leave(entry: Entry): void {
    if (this.keep) return
    this.#joined = this.#joined.filter((other) => other !== entry)
    this.#schedule()
  }

  /** What the slot holds, in document order: the last reading, then the members that joined since. */
  items(): readonly Item[] {
    const joined = this.#joined
    const scanned = this.#scanned
    const memo = this.#memo
    if (memo !== undefined && memo.joined === joined && memo.scanned === scanned) return memo.items
    const current = new Set(joined)
    const listed = new Set<Entry>()
    const items: Item[] = []
    for (const item of scanned.items) {
      if ('entry' in item) {
        if (!current.has(item.entry)) continue
        listed.add(item.entry)
      }
      items.push(item)
    }
    for (const entry of joined) {
      if (!listed.has(entry) && !scanned.nested.has(entry)) items.push({ entry })
    }
    this.#memo = { joined, scanned, items }
    return items
  }

  read(): Slotted {
    const items = this.items()
    const first = items[0]
    if (first === undefined) return NONE
    return 'entry' in first
      ? { count: items.length, kind: first.entry.kind, props: first.entry.props() }
      : { count: items.length, kind: undefined, props: first.props }
  }

  #at(entry: Entry): number {
    return this.items().findIndex((item) => 'entry' in item && item.entry === entry)
  }

  passed(entry: Entry): Readonly<Record<string, unknown>> {
    const pass = this.scope.pass
    if (pass === undefined || this.#at(entry) === -1) return {}
    // `undefined` leaves the member's own value: FormField never clears a control's `invalid`.
    return Object.fromEntries(
      Object.entries(pass(entry.props())).filter(([, value]) => value !== undefined),
    )
  }

  shown(entry: Entry): boolean {
    const take = this.scope.take?.()
    if (take === undefined) return true
    const at = this.#at(entry)
    return at === -1 || at < take
  }

  /**
   * Reads the nodes `nodes` returns, the slot's top level under `parent`, now
   * and whenever the parent's children or an element's attributes change.
   */
  follow(parent: Node, nodes: () => readonly ChildNode[]): void {
    this.unfollow()
    this.#range = { parent, nodes }
    if (typeof MutationObserver !== 'undefined')
      this.#observer = new MutationObserver(() => this.rescan())
    this.rescan()
  }

  unfollow(): void {
    this.#observer?.disconnect()
    this.#observer = undefined
    this.#range = undefined
  }

  /** Stops reading the document and restores every element it changed. */
  release(): void {
    this.unfollow()
    for (const element of [...this.#applied.keys()]) this.#restore(element)
  }

  #schedule(): void {
    if (this.#range === undefined || this.#pending) return
    this.#pending = true
    queueMicrotask(() => {
      this.#pending = false
      this.rescan()
    })
  }

  /** Reads the slot's document again, and hands its elements what the member passes. */
  rescan(): void {
    const range = this.#range
    if (range === undefined) return
    untrack(() => {
      const scan = this.#scan(range.parent, range.nodes())
      if (!sameScan(scan, this.#scanned)) this.#scanned = scan
      const observer = this.#observer
      if (observer !== undefined) {
        observer.disconnect()
        observer.observe(range.parent, { childList: true })
        for (const item of scan.items)
          if ('element' in item) observer.observe(item.element, { attributes: true })
      }
      this.apply()
    })
  }

  #scan(parent: Node, nodes: readonly ChildNode[]): Scan {
    const joined = this.#joined
    const starts = new Map<Node, Entry>()
    for (const entry of joined) if (entry.start !== null) starts.set(entry.start, entry)
    const items: Item[] = []
    const top = new Set<Entry>()
    let inside: Entry | undefined
    for (const node of nodes) {
      if (inside !== undefined) {
        if (node === inside.end) inside = undefined
        continue
      }
      const entry = starts.get(node)
      if (entry !== undefined) {
        items.push({ entry })
        top.add(entry)
        if (entry.end !== null && entry.end !== node) inside = entry
        continue
      }
      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element
        items.push({ element, props: this.#own(element) })
      }
    }
    const nested = new Set(
      joined.filter(
        (entry) => !top.has(entry) && entry.start !== null && parent.contains(entry.start),
      ),
    )
    return { items, nested }
  }

  /** An element's attributes, with the values this rendering set replaced by the element's own. */
  #own(element: Element): Readonly<Record<string, unknown>> {
    const own: Record<string, unknown> = {}
    for (const attribute of element.attributes) own[attribute.name] = attribute.value
    for (const [name, held] of this.#applied.get(element)?.attributes ?? []) {
      if (held.own === null) delete own[name]
      else own[name] = held.own
    }
    return own
  }

  /**
   * Hands each element in the slot what the member passes: a handler as a
   * listener, any other value as an attribute; `undefined` restores the
   * element's own. An element past `take` is hidden. An outlet runs it in an
   * effect, so it runs again when what the member passes changes.
   */
  apply(): void {
    const pass = this.scope.pass
    const take = this.scope.take?.()
    const present = new Set<Element>()
    this.items().forEach((item, at) => {
      if (!('element' in item) || !item.element.isConnected) return
      present.add(item.element)
      const values: Record<string, unknown> = { ...(pass?.(item.props) ?? {}) }
      if (take !== undefined && at >= take) values['hidden'] = ''
      untrack(() => this.#set(item.element, values))
    })
    for (const element of [...this.#applied.keys()])
      if (!present.has(element)) untrack(() => this.#restore(element))
  }

  #set(element: Element, values: Readonly<Record<string, unknown>>): void {
    const applied: Applied = this.#applied.get(element) ?? {
      attributes: new Map(),
      listeners: new Map(),
    }
    this.#applied.set(element, applied)
    const handlers = new Set<string>()
    const attributes = new Set<string>()
    for (const [name, value] of Object.entries(values)) {
      if (isHandler(name) && typeof value === 'function') {
        const type = name.slice(2).toLowerCase()
        handlers.add(type)
        const held = applied.listeners.get(type)
        if (held !== undefined) {
          held.current = value as (event: Event) => void
          continue
        }
        const hold = {
          current: value as (event: Event) => void,
          listener: (event: Event) => hold.current(event),
        }
        applied.listeners.set(type, hold)
        element.addEventListener(type, hold.listener)
      } else if (value !== undefined && value !== null) {
        attributes.add(name)
        const text = String(value)
        const now = element.getAttribute(name)
        const held = applied.attributes.get(name)
        // The first value set keeps the element's own; a value the caller set since is its own now.
        if (held === undefined) applied.attributes.set(name, { own: now, set: text })
        else {
          if (now !== held.set) held.own = now
          held.set = text
        }
        if (now !== text) element.setAttribute(name, text)
      }
    }
    for (const [type, held] of [...applied.listeners]) {
      if (handlers.has(type)) continue
      element.removeEventListener(type, held.listener)
      applied.listeners.delete(type)
    }
    for (const [name, held] of [...applied.attributes]) {
      if (attributes.has(name)) continue
      restoreAttribute(element, name, held.own)
      applied.attributes.delete(name)
    }
  }

  #restore(element: Element): void {
    const applied = this.#applied.get(element)
    if (applied === undefined) return
    this.#applied.delete(element)
    for (const [type, held] of applied.listeners) element.removeEventListener(type, held.listener)
    for (const [name, held] of applied.attributes) restoreAttribute(element, name, held.own)
  }
}

function restoreAttribute(element: Element, name: string, own: string | null): void {
  if (own === null) element.removeAttribute(name)
  else element.setAttribute(name, own)
}

function sameScan(a: Scan, b: Scan): boolean {
  if (a.items.length !== b.items.length || a.nested.size !== b.nested.size) return false
  for (const entry of a.nested) if (!b.nested.has(entry)) return false
  return a.items.every((item, at) => {
    const other = b.items[at] as Item
    if ('entry' in item) return 'entry' in other && other.entry === item.entry
    if (!('element' in other) || other.element !== item.element) return false
    const names = Object.keys(item.props)
    return (
      names.length === Object.keys(other.props).length &&
      names.every((name) => other.props[name] === item.props[name])
    )
  })
}

/** A slot mounted outside the document so a member can read it before an outlet renders it. */
interface Probe {
  readonly snippet: Snippet
  readonly rendering: Rendering
  readonly host: HTMLElement
  readonly instance: ReturnType<typeof mount>
}

/** What an outlet renders: its two text nodes, and the probe's output it moves into place. */
export interface Outlet {
  readonly start: Snippet
  readonly end: Snippet
  readonly adopted: { readonly snippet: Snippet; readonly content: Snippet } | undefined
}

export interface SlotScopeOptions {
  /** Props each thing in the slot is given over its own, from its own props (`child`). */
  pass?: (child: Readonly<Record<string, unknown>>) => Readonly<Record<string, unknown>>
  /** How many of the slot's things render; the rest render nothing. */
  take?: () => number | undefined
}

/** One slot of a member, as the member reads it and hands it props. */
export class SlotScope {
  readonly pass: SlotScopeOptions['pass']
  readonly take: SlotScopeOptions['take']
  /** What `read` reads: an open outlet's rendering, or the probe's while none is open. */
  #rendering = $state.raw<Rendering | undefined>(undefined)
  #outlets = $state(0)
  #probe: Probe | undefined
  readonly #context: Map<unknown, unknown>

  constructor(options: SlotScopeOptions) {
    this.pass = options.pass
    this.take = options.take
    this.#context = new Map(getAllContexts())
  }

  /**
   * Probes the slot (`probe` reads its snippet), for a member that reads it
   * before, or without, an outlet that renders it. Called once the member's
   * script has declared everything the slot's members read through `pass`.
   */
  probe(probe: () => Snippet | undefined): void {
    if (serverRender !== undefined) {
      this.#serverProbe(probe(), serverRender)
      return
    }
    if (typeof document === 'undefined') return
    untrack(() => this.#mountProbe(probe()))
    // While no outlet renders the slot, a probe does; one opening adopts it.
    $effect(() => {
      const snippet = probe()
      if (this.#outlets > 0) return
      untrack(() => {
        if (this.#probe?.snippet !== snippet || this.#probe === undefined) this.#mountProbe(snippet)
      })
    })
    onDestroy(() => this.#dropProbe())
  }

  /** What the slot holds. */
  read(): Slotted {
    return this.#rendering?.read() ?? NONE
  }

  #mountProbe(snippet: Snippet | undefined): void {
    this.#dropProbe()
    if (snippet === undefined) {
      this.#rendering = undefined
      return
    }
    const rendering = new Rendering(this)
    const host = document.createElement('div')
    const context = new Map(this.#context)
    context.set(SLOT, rendering)
    // Read while it mounts, in the order its members join, and in document order once it has.
    this.#rendering = rendering
    const instance = mount(SnippetHost, { target: host, props: { snippet }, context })
    rendering.follow(host, () => [...host.childNodes])
    this.#probe = { snippet, rendering, host, instance }
  }

  #dropProbe(): void {
    const probe = this.#probe
    if (probe === undefined) return
    this.#probe = undefined
    probe.rendering.release()
    void unmount(probe.instance)
  }

  /** The probe in a server render: the slot rendered to a string, which is dropped, for its members. */
  #serverProbe(snippet: Snippet | undefined, render: NonNullable<typeof serverRender>): void {
    if (snippet === undefined) return
    const rendering = new Rendering(this, true)
    const context = new Map(this.#context)
    context.set(SLOT, rendering)
    this.#rendering = rendering
    void render(SnippetHost, { props: { snippet }, context }).body
  }

  /**
   * Called by an outlet as it renders `snippet`: what it renders joins this
   * scope, and the probe's output for the same snippet becomes the outlet's.
   */
  open(snippet: Snippet | undefined): Outlet {
    const probe = this.#probe
    const adopting = probe !== undefined && probe.snippet === snippet ? probe : undefined
    if (adopting === undefined) this.#dropProbe()
    else adopting.rendering.unfollow()
    this.#probe = undefined
    const rendering = adopting?.rendering ?? new Rendering(this)
    untrack(() => {
      this.#outlets += 1
      this.#rendering = rendering
    })
    setContext(SLOT, rendering)

    let start: ChildNode | null = null
    let end: ChildNode | null = null
    const between = () => {
      const nodes: ChildNode[] = []
      for (
        let node = start?.nextSibling ?? null;
        node !== null && node !== end;
        node = node.nextSibling
      )
        nodes.push(node)
      return nodes
    }
    if (typeof document !== 'undefined') {
      $effect(() => {
        const parent = start?.parentNode
        if (parent === null || parent === undefined) return
        rendering.follow(parent, between)
        return () => rendering.unfollow()
      })
      // Tracked, so what the member passes reaches the elements again when it changes.
      $effect(() => rendering.apply())
    }
    onDestroy(() =>
      untrack(() => {
        this.#outlets -= 1
        if (this.#rendering === rendering) this.#rendering = undefined
        rendering.release()
      }),
    )

    return {
      start: marker((node) => {
        start = node
      }),
      end: marker((node) => {
        end = node
      }),
      adopted:
        adopting === undefined
          ? undefined
          : {
              snippet: adopting.snippet,
              content: createRawSnippet(() => ({
                render: () => '<template></template>',
                setup(element) {
                  element.replaceWith(...adopting.host.childNodes)
                  return () => {
                    void unmount(adopting.instance)
                  }
                },
              })),
            },
    }
  }
}

/** What a member reads from the slot it is rendered in. */
export interface Joined {
  /** Props its parent hands it, over its own. */
  readonly passed: Readonly<Record<string, unknown>>
  /** Whether it renders: false past the parent's `take`. */
  readonly shown: boolean
  /** The text nodes it renders before and after its output, while it is in a slot a parent reads. */
  readonly start: Snippet | undefined
  readonly end: Snippet | undefined
}

const UNSLOTTED: Joined = { passed: {}, shown: true, start: undefined, end: undefined }

/**
 * Joins the slot a member is rendered in, if a parent reads it: `kind` is the
 * member's `controlKind`, and `own` its props a parent reads. Every member
 * calls it as it is made, and renders `start` and `end` around its output.
 */
export function joinSlot(
  kind: string | undefined,
  own: () => Readonly<Record<string, unknown>>,
): Joined {
  const rendering = getContext<Rendering | undefined>(SLOT)
  // The members this one renders are in its own slots, not in its parent's.
  setContext(SLOT, undefined)
  if (rendering === undefined) return UNSLOTTED
  const entry: Entry = { kind, props: own, start: null, end: null }
  untrack(() => rendering.join(entry))
  onDestroy(() => untrack(() => rendering.leave(entry)))
  return {
    get passed() {
      return rendering.passed(entry)
    },
    get shown() {
      return rendering.shown(entry)
    },
    start: marker((node) => {
      entry.start = node
    }),
    end: marker((node) => {
      entry.end = node
    }),
  }
}

/**
 * The text a caller put in a slot: the description's `slotText` (CodeBlock
 * copies its code, Markdown parses its source, StreamingText waits for its
 * first word). The slot is rendered into an element outside the document, and
 * its text is read there, and read again whenever it changes. A server render
 * renders it to a string and reads the string's text.
 */
export class SlotText {
  #text = $state('')

  constructor(snippet: () => Snippet | undefined) {
    const context = getAllContexts()
    if (serverRender !== undefined) {
      const shown = snippet()
      if (shown !== undefined)
        this.#text = htmlText(
          serverRender(SnippetHost, { props: { snippet: shown }, context }).body,
        )
      return
    }
    if (typeof document === 'undefined') return
    let shown: Snippet | undefined
    let release: (() => void) | undefined
    const render = (next: Snippet | undefined) => {
      release?.()
      release = undefined
      shown = next
      if (next === undefined) {
        this.#text = ''
        return
      }
      const target = document.createElement('div')
      const instance = mount(SnippetHost, { target, props: { snippet: next }, context })
      const read = () => {
        this.#text = target.textContent ?? ''
      }
      read()
      const observer = new MutationObserver(read)
      observer.observe(target, { childList: true, characterData: true, subtree: true })
      release = () => {
        observer.disconnect()
        void unmount(instance)
      }
    }
    untrack(() => render(snippet()))
    $effect(() => {
      const next = snippet()
      if (next !== shown) untrack(() => render(next))
    })
    onDestroy(() => release?.())
  }

  get current(): string {
    return this.#text
  }
}
