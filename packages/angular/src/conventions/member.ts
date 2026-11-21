import {
  afterNextRender,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  InjectionToken,
  Injector,
  runInInjectionContext,
  signal,
  untracked,
  type EmbeddedViewRef,
  type Provider,
  type TemplateRef,
} from '@angular/core'

/**
 * What every generated Angular member is: its host element, its props as the
 * caller and the slot it sits in set them, its events, and its slots.
 *
 * **The host element.** An Angular component renders inside an element of its
 * own (`<pm-button>`), which React, Vue, Svelte and Solid do not have. A
 * member's host draws no box, carries no attribute but its `display: contents`
 * style and its mark (`data-pm-host`), and hears no DOM event of the same name
 * as one of its outputs, so the DOM a member renders is the React member's,
 * and `(click)` on `<pm-button>`
 * runs once, for the member's `click`, never again for the native click that
 * bubbles through the host. The static attributes a caller writes on a member
 * set its inputs and are removed from the host: an `id` or a `title` on
 * `<pm-input>` belongs to the control inside it. A part whose element is its
 * host (`<tr pmTableRow>`) hears its own DOM event of an output's name through
 * `MemberContext.listen`, which the filter does not apply to.
 *
 * **Slots.** A member's content (`children`, and each node prop) is the
 * caller's content projection, `<ng-content select="[slot=footer]">` for a
 * named slot. The member renders it from an `ng-template` (`SlotTemplate`), so
 * it can render it conditionally, and reads what the caller put there through
 * an embedded view it never inserts (the probe): whether it is filled, its
 * text, and the members in it. React's `cloneElement` hands a slotted element
 * props (FormField hands its control an id); here each member in a slot
 * claims the slot when it is created (`SLOT_HOST`), and reads the props the
 * slot hands it over its own (`props`). A member that renders its own slot
 * inside another member's slot (ConfirmDialog's trigger, inside Dialog's)
 * forwards the claims, so Dialog's `onClick` reaches ConfirmDialog's caller's
 * Button.
 */

/**
 * The attribute that marks a member's host. A recipe selector that reads a
 * parent or a sibling (`.grid > *`, `.row + .row`) would match the host and
 * not the member inside it, so the Angular build compiles each recipe with
 * forms that also match through an element with this attribute
 * (`packages/elements-ui/reach-through.ts`, `ANGULAR_HOST`).
 */
const HOST_ATTRIBUTE = 'data-pm-host'

/**
 * The member a member is created under: the one whose content or view it is.
 * A member claims it, and is counted in a slot of it only when the slot's
 * content holds it (`slotOf`), so a member a host renders in its own view is
 * never in the host's slots.
 */
export const SLOT_HOST = new InjectionToken<MemberContext | null>('polymorph: slot host')

/** The identity a member lends the members it renders (`lends`), read as `lent`. */
export const IDENTITY = new InjectionToken<string | undefined>('polymorph: lent identity')

const CONTEXTS = new WeakMap<Element, MemberContext>()

function hostContext(): MemberContext | null {
  return CONTEXTS.get(inject(ElementRef).nativeElement as Element) ?? null
}

/**
 * The providers every member declares: the members it is the host of (its
 * content's and its view's) claim it. A component's `viewProviders` would hide
 * it from its own view, and Angular shows them to content written inside a
 * block (`@if`) as well, so no member's slots rest on them.
 */
export const MEMBER_PROVIDERS: Provider[] = [{ provide: SLOT_HOST, useFactory: hostContext }]

/** The view providers of a member that lends its identity to the members it renders. */
export function lend(identity: string): Provider[] {
  return [{ provide: IDENTITY, useValue: identity }]
}

/** The view providers of a member that reads a lent identity, so the members it renders do not. */
export const KEEPS_IDENTITY: Provider[] = [{ provide: IDENTITY, useValue: undefined }]

/** The identity a composing member lends, read by the member it composes. */
export function lentIdentity(): string | undefined {
  return inject(IDENTITY, { optional: true, skipSelf: true }) ?? undefined
}

/**
 * What a member that lends its identity hands the member it composes, which
 * writes a function returning one of its elements into it: ConfirmDialog reads
 * its Dialog's panel through it. Read as `borrowed` in the lender and as
 * `lender` in the member it composes.
 */
export interface BorrowedHolder {
  element?: () => Element | null | undefined
}

/** The hand-back holder a lender provides to the members it renders; `undefined` outside one. */
export const BORROWED = new InjectionToken<BorrowedHolder | undefined>(
  'polymorph: hand-back holder',
)

/** The view providers of a lender that reads what the member it composes hands back. */
export function handBack(): Provider[] {
  return [{ provide: BORROWED, useFactory: (): BorrowedHolder => ({}) }]
}

/** The view providers of a member that reads its lender's holder, so the members it renders do not. */
export const KEEPS_HOLDER: Provider[] = [{ provide: BORROWED, useValue: undefined }]

/** The holder the lender reads, from its own view providers. */
export function borrowedHolder(): BorrowedHolder {
  return inject(BORROWED) ?? {}
}

/** The holder of the member that lends this one its identity, or `undefined` outside one. */
export function lenderHolder(): BorrowedHolder | undefined {
  return inject(BORROWED, { optional: true, skipSelf: true }) ?? undefined
}

const OWNERS = new Map<string, InjectionToken<object>>()

/**
 * The token a member hands its compound parts with (`Tabs.Content` reads which
 * tab is current), by the member's name, so a part reads it without importing
 * its member.
 */
export function ownerToken<T extends object>(member: string): InjectionToken<T> {
  let token = OWNERS.get(member)
  if (token === undefined) {
    token = new InjectionToken<object>(`polymorph: ${member}'s parts`)
    OWNERS.set(member, token)
  }
  return token as InjectionToken<T>
}

/** The provider a member hands its parts its owner object with. */
export function provideOwner(member: string): Provider {
  return {
    provide: ownerToken(member),
    useFactory: () => CONTEXTS.get(inject(ElementRef).nativeElement as Element)?.owner ?? {},
  }
}

/** What a compound part reads from its member, or nothing outside one. */
export function ownerOf<T extends object>(member: string): T {
  return (inject(ownerToken<T>(member), { optional: true }) ?? {}) as T
}

/** What a member reads from a slot's members: how many, and the first one's kind and own props. */
export interface Slotted {
  count: number
  kind: string | undefined
  props: Readonly<Record<string, unknown>>
}

/** Props a member hands its slotted members, as a function of each one's own props. */
export type SlotPass = (
  child: Readonly<Record<string, unknown>>,
) => Readonly<Record<string, unknown>>

/** A member in a slot. */
class Claim {
  readonly passed: () => Readonly<Record<string, unknown>>
  constructor(
    readonly member: MemberContext,
    readonly host: MemberContext,
  ) {
    this.passed = computed(() => host.passFor(this))
  }
}

interface Forward {
  readonly from: MemberContext
  readonly slot: string
  readonly target: MemberContext
  readonly into: string
}

/** An output, whatever it emits. */
interface Output {
  emit(value: never): void
}

/** How many listeners an output has: the callers' bindings to it. */
function listenerCount(output: Output): number {
  const listeners = (output as unknown as { listeners?: readonly unknown[] | null }).listeners
  return listeners?.filter((listener) => listener !== null).length ?? 0
}

const isElement = (node: Node): node is Element => node.nodeType === Node.ELEMENT_NODE

const isText = (node: Node): node is Text => node.nodeType === Node.TEXT_NODE

/**
 * What a member's context reaches outside itself: the host's own
 * `addEventListener`, which `useMember` keeps before it filters the host's
 * events, and the member's injector, for a hook after a render.
 */
interface Surroundings {
  readonly listen: (type: string, listener: EventListener) => void
  readonly injector: Injector
}

/** The event a listener on the host receives for an event type. */
export type HostEvent<K extends string> = K extends keyof HTMLElementEventMap
  ? HTMLElementEventMap[K]
  : Event

/** One member: its host, its props as set, its events and its slots. */
export class MemberContext<P extends object = Record<string, unknown>> {
  /** The member's own props, as its caller set them. */
  readonly own: P
  /** The props as the member reads them: the runner's overrides, then the slot's, then its own. */
  readonly props: P
  /** What the member hands its compound parts (`provide`). */
  owner: object | undefined
  /** The props and handlers a states fixture's runner sets over the caller's (`[pmOverrides]`). */
  readonly overrides = signal<Readonly<Record<string, unknown>> | null>(null)

  private claim: Claim | null = null
  private readonly templates = new Map<string, TemplateRef<unknown>>()
  private readonly probes = new Map<string, EmbeddedViewRef<unknown>>()
  private readonly claims = signal<readonly Claim[]>([])
  private readonly passes = new Map<string, SlotPass>()
  private readonly forwards = signal<readonly Forward[]>([])
  private readonly incoming = signal<readonly Forward[]>([])
  private readonly version = signal(0)
  private readonly unlisten: (() => void)[] = []

  constructor(
    readonly host: HTMLElement,
    readonly kind: string | undefined,
    reads: { readonly [K in keyof P]: () => P[K] },
    private readonly surroundings: Surroundings,
  ) {
    const own = {} as P
    const props = {} as P
    for (const key of Object.keys(reads) as (keyof P & string)[]) {
      const read = reads[key]
      Object.defineProperty(own, key, { enumerable: true, get: read })
      Object.defineProperty(props, key, {
        enumerable: true,
        get: () => {
          const overrides = this.overrides()
          if (overrides !== null && key in overrides) return overrides[key]
          const passed = this.claim?.passed()[key]
          return passed !== undefined ? passed : read()
        },
      })
    }
    this.own = own
    this.props = props
  }

  /* events ------------------------------------------------------------------ */

  /**
   * Emits an event: its output with the callback's first argument, which is the
   * payload an Angular output carries, then the handler the member's slot hands
   * it, with every argument. A runner's override replaces the caller's handler,
   * as a React fixture's spread props replace it.
   */
  emit(output: Output, key: string, ...args: unknown[]): void {
    void this.invoke(output, key, ...args)
  }

  /**
   * Emits an event and returns what a handler returned: the slot's handler, or
   * a runner's override. An Angular output's listener returns nothing to the
   * member, so a caller's `(confirm)` binding cannot hand a promise back
   * (`docs/frameworks.md`).
   */
  invoke(output: Output, key: string, ...args: unknown[]): unknown {
    let result: unknown
    const overrides = untracked(this.overrides)
    if (overrides !== null && key in overrides) {
      const override = overrides[key]
      if (typeof override === 'function')
        result = (override as (...values: unknown[]) => unknown)(...args)
    } else {
      output.emit(args[0] as never)
    }
    const passed = this.claim === null ? undefined : untracked(this.claim.passed)[key]
    if (typeof passed === 'function') {
      const value = (passed as (...values: unknown[]) => unknown)(...args)
      if (result === undefined) result = value
    }
    return result
  }

  /**
   * Listens on the host for a DOM event, the ones the host does not hear
   * because an output shares their name included: a part whose element is its
   * host handles its own click this way (`<tr pmTableRow>`), since a `host`
   * binding is attached after `useMember` filters the host's events. The
   * listener is removed when the member is destroyed.
   */
  listen<K extends string>(type: K, listener: (event: HostEvent<K>) => void): void {
    const handler = listener as EventListener
    this.surroundings.listen(type, handler)
    this.unlisten.push(() => this.host.removeEventListener(type, handler))
  }

  /**
   * Runs `fn` after Angular's next render (`afterNextRender`): the render a
   * change made before the call schedules, so `fn` reads the document as that
   * change left it. MultiSelect puts a controlled field's text back only once
   * its caller's value has rendered.
   */
  afterRender(fn: () => void): void {
    afterNextRender(fn, { injector: this.surroundings.injector })
  }

  /** Whether anyone handles an event: a caller's binding, the slot, or a runner's override. */
  listening(output: Output, key: string): boolean {
    const overrides = this.overrides()
    if (overrides !== null && key in overrides) return typeof overrides[key] === 'function'
    if (listenerCount(output) > 0) return true
    return typeof this.claim?.passed()[key] === 'function'
  }

  /* slots ------------------------------------------------------------------- */

  /** Records the template a slot's content is rendered from (`SlotTemplate`). */
  register(name: string, template: TemplateRef<unknown>): void {
    this.templates.set(name, template)
  }

  /** The template a slot's content is rendered from. */
  template(name: string): TemplateRef<unknown> | undefined {
    return this.templates.get(name)
  }

  /** Records the props a slot hands its members (`pass`). */
  pass(name: string, pass: SlotPass): void {
    this.passes.set(name, pass)
  }

  /** The nodes the caller put in a slot, read from a view of its template that is never inserted. */
  nodes(name: string): readonly Node[] {
    this.version()
    const template = this.templates.get(name)
    if (template === undefined) return []
    let probe = this.probes.get(name)
    if (probe === undefined) {
      probe = untracked(() => template.createEmbeddedView({}))
      this.probes.set(name, probe)
    }
    return probe.rootNodes as Node[]
  }

  /** Whether the caller put anything in a slot: an element, or text that is not only whitespace. */
  filled(name: string): boolean {
    return this.nodes(name).some(
      (node) => isElement(node) || (isText(node) && node.data.trim() !== ''),
    )
  }

  /** The text the caller put in a slot: its text nodes, in order, without the elements'. */
  text(name: string): string {
    return this.nodes(name)
      .filter(isText)
      .map((node) => node.data)
      .join('')
  }

  /** The members in a slot, the ones a member forwards into it included. */
  members(name: string): readonly Claim[] {
    const own = this.claims().filter((claim) => this.slotOf(claim) === name)
    const forwarded = this.incoming()
      .filter((forward) => forward.into === name)
      .flatMap((forward) => forward.from.members(forward.slot))
    return [...own, ...forwarded]
  }

  /** How many members (or, without members, elements) a slot holds, and the first member's kind and props. */
  slotted(name: string): Slotted {
    const found = this.members(name)
    const first = found[0]
    return {
      count: found.length > 0 ? found.length : this.nodes(name).filter(isElement).length,
      kind: first?.member.kind,
      props: (first?.member.own as Readonly<Record<string, unknown>> | undefined) ?? {},
    }
  }

  /** The slot a member sits in: the one whose nodes contain its host. */
  slotOf(claim: Claim): string | undefined {
    const element = claim.member.host
    for (const name of this.templates.keys()) {
      if (this.nodes(name).some((node) => node === element || node.contains(element))) return name
    }
    return undefined
  }

  /**
   * The props a member's slot hands it: this member's pass for the slot, then
   * the pass of each member the slot is forwarded into, which wins, as a
   * React member that clones the elements another cloned sets its props last.
   * A handler runs after the ones before it; an `undefined` value leaves the
   * member's own.
   */
  passFor(claim: Claim): Readonly<Record<string, unknown>> {
    const chain: SlotPass[] = []
    const walk = (member: MemberContext, slot: string | undefined) => {
      if (slot === undefined) return
      const pass = member.passes.get(slot)
      if (pass !== undefined) chain.push(pass)
      for (const forward of member.forwards())
        if (forward.slot === slot) walk(forward.target, forward.into)
    }
    walk(this as unknown as MemberContext, this.slotOf(claim))
    const out: Record<string, unknown> = {}
    const child = claim.member.own as Readonly<Record<string, unknown>>
    for (const pass of chain) {
      for (const [key, value] of Object.entries(pass(child))) {
        if (value === undefined) continue
        const before = out[key]
        out[key] =
          /^on[A-Z]/.test(key) && typeof value === 'function' && typeof before === 'function'
            ? (...args: unknown[]) => {
                ;(before as (...values: unknown[]) => unknown)(...args)
                return (value as (...values: unknown[]) => unknown)(...args)
              }
            : value
      }
    }
    return out
  }

  /** Forwards the claims of one of this member's slots into a slot of a member it renders it in. */
  forward(slot: string, target: MemberContext, into: string): () => void {
    const entry: Forward = { from: this as unknown as MemberContext, slot, target, into }
    this.forwards.update((list) => [...list, entry])
    target.incoming.update((list) => [...list, entry])
    return () => {
      this.forwards.update((list) => list.filter((other) => other !== entry))
      target.incoming.update((list) => list.filter((other) => other !== entry))
    }
  }

  /** Says that a slot's content moved in the document (an outlet rendered it or let it go). */
  moved(): void {
    this.version.update((count) => count + 1)
  }

  /* lifetime ---------------------------------------------------------------- */

  /** @internal Joins the slot this member was created in. */
  join(host: MemberContext): void {
    const claim = new Claim(this as unknown as MemberContext, host)
    this.claim = claim
    host.claims.update((list) => [...list, claim])
  }

  /** @internal Leaves its slot, lets its probes go and removes its host listeners. */
  release(): void {
    for (const remove of this.unlisten.splice(0)) remove()
    const claim = this.claim
    if (claim !== null) claim.host.claims.update((list) => list.filter((other) => other !== claim))
    for (const probe of this.probes.values()) probe.destroy()
    this.probes.clear()
  }
}

/** The props a member reads, each as a function of its inputs. */
export type PropReads<P extends object> = { readonly [K in keyof P]: () => P[K] }

/**
 * Makes a member's context: called first in every generated member, in its
 * injection context, with its `controlKind`, the names of its outputs, and a
 * reader for each prop. It clears the host (no box, and no attribute but its
 * `display: contents` style and its mark) unless the host is the member's own
 * element,
 * keeps the host from hearing a DOM event of an output's name, and claims the
 * slot the member was created in. The context's `listen` keeps the host's own
 * `addEventListener`, so the member can still hear such an event itself.
 */
export function useMember<P extends object>(options: {
  kind?: string
  /**
   * For a part whose element is its host (`<li pmTagInputChip>`): the
   * attribute that selects it, which is removed. The element keeps its own.
   */
  element?: string
  events?: readonly string[]
  props: PropReads<P>
}): MemberContext<P> {
  const host = inject(ElementRef).nativeElement as HTMLElement
  if (options.element === undefined) {
    for (const attribute of [...host.attributes]) host.removeAttribute(attribute.name)
    host.style.display = 'contents'
    host.setAttribute(HOST_ATTRIBUTE, '')
  } else host.removeAttribute(options.element.toLowerCase())
  const events = new Set(options.events ?? [])
  const listen = host.addEventListener.bind(host)
  if (events.size > 0) {
    host.addEventListener = ((
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      listenOptions?: boolean | AddEventListenerOptions,
    ) => {
      if (events.has(type) || listener === null) return
      listen(type, listener, listenOptions)
    }) as typeof host.addEventListener
  }
  const context = new MemberContext<P>(host, options.kind, options.props, {
    listen: (type, listener) => listen(type, listener),
    injector: inject(Injector),
  })
  CONTEXTS.set(host, context as unknown as MemberContext)
  const slot = inject(SLOT_HOST, { optional: true, skipSelf: true })
  if (slot !== null) (context as unknown as MemberContext).join(slot)
  inject(DestroyRef).onDestroy(() => {
    ;(context as unknown as MemberContext).release()
    CONTEXTS.delete(host)
  })
  return context
}

/** The context of the member whose host is `element`, for a directive on the same element. */
export function memberAt(element: Element): MemberContext | undefined {
  return CONTEXTS.get(element)
}

/**
 * A value a member makes once its inputs are set: its machine, a presence, a
 * held value whose first value reads a prop. An Angular component's fields
 * are made before its inputs are set, so these are made the first time they
 * are read (in the member's first render, or in a handler), in the member's
 * injection context, outside any reactive read.
 */
export function setup<T>(make: () => T): { readonly value: T } {
  const injector = inject(Injector)
  let made = false
  let value: T
  return {
    get value() {
      if (!made) {
        value = untracked(() => runInInjectionContext(injector, make))
        made = true
      }
      return value
    },
  }
}

let ids = 0

/** An id unique to a member's instance, for `aria-*` references between its parts and its machine's scope. */
export function uniqueId(): string {
  ids += 1
  return `pm${ids.toString(36)}`
}
