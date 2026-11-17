import {
  computed,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  input,
  signal,
  type OnDestroy,
  type OnInit,
  untracked,
  type WritableSignal,
} from '@angular/core'

/**
 * The values an Angular member holds, each read as `.value`.
 *
 * A description reads its scope by name (`copied`, `shown`, `panel`). The
 * Angular renderer spells a held, derived or element value as a cell's
 * `.value`, as the Vue and Solid renderers do, for two reasons: a description's
 * assignment (`copied = true`, `copies += 1`) is written as it is, and
 * TypeScript narrows a property it has checked (`this.viewport.value !== null
 * && this.viewport.value.scrollTop`), where it cannot narrow the result of
 * calling a signal twice. Each cell is a signal underneath, so a template, a
 * `computed` or an effect that reads one updates when it changes.
 */

/**
 * A value the member holds (an uncontrolled draft, a measurement), read and
 * written as `.value`. Its first value is made when it is first read, because a
 * member's fields are made before its inputs are set and a first value often
 * reads a prop (`draft` starts at `defaultValue`).
 */
export interface Cell<T> {
  value: T
}

export function cell<T>(initial: () => T): Cell<T> {
  let held: WritableSignal<T> | undefined
  const read = () => (held ??= signal<T>(untracked(initial)))
  return {
    get value() {
      return read()()
    },
    set value(next: T) {
      if (held === undefined) held = signal<T>(next)
      else held.set(next)
    },
  }
}

/** A value the member computes from its scope, read as `.value`, computed once per change. */
export function derived<T>(compute: () => T): { readonly value: T } {
  const value = computed(compute)
  return {
    get value() {
      return value()
    },
  }
}

/**
 * A value the member computes from what the caller put in a slot (its text,
 * its members), read as `.value` and computed at each read: the slot's content
 * is the document's, which no signal follows.
 */
export function measured<T>(compute: () => T): { readonly value: T } {
  return {
    get value() {
      return compute()
    },
  }
}

/** What `[pmRef]` hands an element to: one element, or the elements a loop renders. */
export interface ElementHolder {
  attach(element: Element): void
  detach(element: Element): void
}

/**
 * An element a member names in its anatomy (`ref`), read as `.value`: `null`
 * while the element is not rendered, as a Vue template ref reads.
 */
export interface ElementCell<T extends Element = HTMLElement> extends ElementHolder {
  readonly value: T | null
}

export function elementRef<T extends Element = HTMLElement>(): ElementCell<T> {
  const element = signal<T | null>(null)
  return {
    get value() {
      return element()
    },
    attach(node) {
      element.set(node as T)
    },
    detach(node) {
      if (element() === node) element.set(null)
    },
  }
}

/** The elements a loop renders under one name (Accordion's regions), in the order they were rendered. */
export interface ElementList<T extends Element = HTMLElement> extends ElementHolder {
  readonly value: readonly T[]
}

export function elementList<T extends Element = HTMLElement>(): ElementList<T> {
  const elements = signal<readonly T[]>([])
  return {
    get value() {
      return elements()
    },
    attach(node) {
      elements.update((list) => [...list, node as T])
    },
    detach(node) {
      elements.update((list) => list.filter((other) => other !== node))
    },
  }
}

/**
 * The caller's handle on a member's native control (`controlRef`), as React's
 * ref is: a function the member calls with the element, and with `null` when
 * it goes, or an object whose `current` it sets.
 */
export type ControlRef<T extends Element = HTMLElement> =
  ((element: T | null) => void) | { current: T | null }

/**
 * Shares one native control element between a member and the application,
 * as `useControlRef` does in the React foundation. The member reads the
 * element as `.value`, and the caller's `controlRef` gets it too, and `null`
 * when it goes.
 */
export function useControlRef<T extends Element = HTMLElement>(
  external: () => ControlRef<T> | undefined,
): ElementCell<T> {
  const own = elementRef<T>()
  const hand = (element: T | null) => {
    const target = external()
    if (typeof target === 'function') target(element)
    else if (target !== undefined) target.current = element
  }
  return {
    get value() {
      return own.value
    },
    attach(node) {
      own.attach(node)
      hand(node as T)
    },
    detach(node) {
      own.detach(node)
      hand(null)
    },
  }
}

/**
 * Hands a component's own host element to a cell while the component lives:
 * the `ref` of a part whose element is its host. Call it in an injection
 * context.
 */
export function hostRef(holder: ElementHolder): void {
  const element = inject(ElementRef).nativeElement as Element
  holder.attach(element)
  inject(DestroyRef).onDestroy(() => holder.detach(element))
}

/**
 * Hands its element to a cell while it is rendered: `<div [pmRef]="panel">`.
 * A description's `ref` names an element its code reads (to measure it, to
 * focus it, to play its exit), and the element is `null` again once it goes.
 */
@Directive({ selector: '[pmRef]' })
export class Ref implements OnInit, OnDestroy {
  readonly pmRef = input.required<ElementHolder>()
  private readonly element = inject(ElementRef).nativeElement as Element
  private held: ElementHolder | undefined

  ngOnInit(): void {
    this.held = this.pmRef()
    this.held.attach(this.element)
  }

  ngOnDestroy(): void {
    this.held?.detach(this.element)
  }
}
