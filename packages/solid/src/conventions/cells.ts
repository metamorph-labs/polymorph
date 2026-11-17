import {
  createMemo,
  createSignal,
  getOwner,
  onCleanup,
  runWithOwner,
  type Accessor,
} from 'solid-js'

/**
 * The values a Solid member holds, each read as `.value`.
 *
 * A description reads its scope by name (`copied`, `shown`, `panel`), and the
 * Vue renderer spells a held, derived or element value as a ref's `.value`. The
 * Solid renderer spells them the same way, through these cells, for two
 * reasons: a description's assignment (`copied = true`, `copies += 1`) is
 * written as it is, and TypeScript narrows a property it has checked
 * (`viewport.value !== null && viewport.value.scrollTop`), where it cannot
 * narrow the result of calling an accessor twice.
 */

/** A value the member holds (an uncontrolled draft, a measurement), read and written as `.value`. */
export function createCell<T>(initial: T): { value: T } {
  const [read, write] = createSignal<T>(initial)
  return {
    get value() {
      return read()
    },
    set value(next: T) {
      write(() => next)
    },
  }
}

/**
 * A value the member computes from its scope, read as `.value`. The memo is
 * made the first time the value is read, under the owner that declared it, so
 * a derived value may read values declared after it, as a Vue `computed` may.
 */
export function createDerived<T>(compute: () => T): { readonly value: T } {
  const owner = getOwner()
  let memo: Accessor<T> | undefined
  return {
    get value() {
      memo ??= runWithOwner(owner, () => createMemo(compute)) ?? createMemo(compute)
      return memo()
    },
  }
}

/**
 * An element a member names in its anatomy (`ref`), read as `.value`, and the
 * function its `ref` attribute calls.
 *
 * Solid calls a `ref` once, when it creates the element, and never again. A
 * description reads a ref as `null` when its element is not rendered (Vue's
 * template refs do the same), so the element is released when the
 * computation that created it is disposed: the branch that rendered it closes,
 * or the member unmounts.
 */
export function elementRef<T extends Element = HTMLElement>(): {
  readonly value: T | null
  attach(element: T): void
} {
  const [element, setElement] = createSignal<T | null>(null)
  return {
    get value() {
      return element()
    },
    attach(node: T) {
      setElement(() => node)
      if (getOwner() !== null)
        onCleanup(() => setElement((current) => (current === node ? null : current)))
    },
  }
}

/**
 * The elements a loop renders under one name (Accordion's regions), in the
 * order they were created. Each leaves the list when its item is disposed.
 */
export function elementList<T extends Element = HTMLElement>(): {
  readonly value: readonly T[]
  attach(element: T): void
} {
  const [elements, setElements] = createSignal<readonly T[]>([])
  return {
    get value() {
      return elements()
    },
    attach(node: T) {
      setElements((list) => [...list, node])
      if (getOwner() !== null)
        onCleanup(() => setElements((list) => list.filter((other) => other !== node)))
    },
  }
}

/**
 * Shares one native control element between a member and the application,
 * as `useControlRef` does in the React foundation.
 *
 * A member that draws a frame around a native control (`Input`) keeps the
 * element for its own logic. An application binding needs the same element,
 * for a caret restore or a form library reading `selectionStart`, and a
 * member's root is not the control. So the member takes a `controlRef` prop,
 * a function it calls with the element, and binds `attach` as the element's
 * `ref`. Both get the element, and both get `null` when it goes.
 */
export function useControlRef<T extends Element>(
  external: () => ((element: T | null) => void) | undefined,
): { readonly value: T | null; attach(element: T): void } {
  const own = elementRef<T>()
  return {
    get value() {
      return own.value
    },
    attach(node: T) {
      own.attach(node)
      external()?.(node)
      if (getOwner() !== null) onCleanup(() => external()?.(null))
    },
  }
}

/**
 * The props a member gives defaults, typed without `undefined`: the type a
 * member's `mergeProps` over its defaults reads them as, as a React member's
 * default parameters read them.
 */
export type Defaults<P, K extends keyof P> = { [Key in K]-?: Exclude<P[Key], undefined> }
