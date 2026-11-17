import {
  assign,
  create,
  eventOf,
  PolyElement,
  restore,
  type StateEntry,
  type FixtureElement,
} from '@polymorph/elements'

/**
 * Mounts a states fixture entry for a test, as a page holds it: the entry's
 * markup in an element of its own at the end of the body, its script run once
 * the elements are defined and before they render, and the overrides set on
 * the entry's subject. The test setup unmounts every one after each test.
 *
 * An override is what the conformance runner sets on a member: a spy in a
 * handler prop is a listener for the event of its name (`onClick` is
 * `poly-click`), called with the event's `detail`, and any other value is set
 * as a page's script sets it (`assign`): through the element's property
 * (`aria-label` is `ariaLabel`), or the attribute of a prop named as an
 * inherited method.
 */
const mounted = new Set<() => void>()

let hosts = 0

/** A frame for the browser to paint, so effects and motion have started. */
const frame = () => new Promise<void>((settle) => requestAnimationFrame(() => settle()))

/** How many frames an entry waits for the field it types into or the control it presses. */
const SEARCH_FRAMES = 60

/**
 * Calls `act` with the first element `selector` finds in the document, once a
 * frame until one appears, as the Solid fixture types and presses once its
 * member is mounted. Returns the function that stops it.
 */
function once(selector: string, act: (element: HTMLElement) => void): () => void {
  let frames = 0
  let request = 0
  const look = () => {
    const found = document.querySelector<HTMLElement>(selector)
    // An element that is not drawn is one a reader cannot type into or press.
    if (found === null || found.getClientRects().length === 0) {
      if (++frames < SEARCH_FRAMES) request = requestAnimationFrame(look)
      return
    }
    act(found)
  }
  request = requestAnimationFrame(look)
  return () => cancelAnimationFrame(request)
}

export async function mount(
  entry: StateEntry,
  overrides: Readonly<Record<string, unknown>> = {},
): Promise<{ host: HTMLElement; unmount(): void }> {
  const host = document.createElement('div')
  // An id, so a pointer harness that addresses an element by a selector built
  // from its ancestors finds the host however portals come and go beside it.
  host.id = `elements-mount-${++hosts}`
  host.innerHTML = entry.html
  // The entry's elements as it wrote them, read before any member takes its children.
  const written = new Map<string, Element[]>()
  for (const element of host.querySelectorAll('*')) {
    const list = written.get(element.localName) ?? []
    list.push(element)
    written.set(element.localName, list)
  }
  const find = (tag: string, index: number): FixtureElement => {
    const element = written.get(tag)?.[index]
    if (element === undefined) throw new Error(`mount: "${entry.name}" has no ${tag} #${index}`)
    return element as unknown as FixtureElement
  }
  document.body.append(host)
  entry.setup?.(find)
  const subject = entry.subject === undefined ? undefined : written.get(entry.subject)?.[0]
  if (subject !== undefined) {
    for (const [name, value] of Object.entries(overrides)) {
      if (/^on[A-Z]/.test(name) && typeof value === 'function') {
        subject.addEventListener(eventOf(name), (event) => {
          ;(value as (detail: unknown) => void)((event as CustomEvent<unknown>).detail)
        })
      } else {
        assign(subject as unknown as FixtureElement, name, value)
      }
    }
  }
  // A state only a reader reaches: text typed into a field, a control pressed.
  const stops: (() => void)[] = []
  const typed = entry.types
  if (typed !== undefined) {
    stops.push(
      once(typed.into, (field) => {
        ;(field as HTMLInputElement).value = typed.text
        field.dispatchEvent(new Event('input', { bubbles: true }))
      }),
    )
  }
  if (entry.presses !== undefined) stops.push(once(entry.presses, (control) => control.click()))
  await Promise.resolve()
  await frame()
  const unmount = () => {
    if (!mounted.delete(unmount)) return
    for (const stop of stops) stop()
    restore(host)
    host.remove()
  }
  mounted.add(unmount)
  return { host, unmount }
}

/** A mounted element a script made, with a way to give it props again. */
export interface MountedElement {
  host: HTMLElement
  element: FixtureElement
  /** Sets props again, as the application around a member sets them: `undefined` unsets one. */
  set(next: object): void
  unmount(): void
}

/**
 * Mounts nodes a script made in an element of its own at the end of the
 * body, as `mount` mounts an entry's markup: the test setup unmounts it after
 * each test.
 */
export async function mountNodes(
  ...nodes: readonly unknown[]
): Promise<{ host: HTMLElement; unmount(): void }> {
  const host = document.createElement('div')
  host.id = `elements-mount-${++hosts}`
  for (const node of nodes) host.append(node as Node)
  document.body.append(host)
  await Promise.resolve()
  await frame()
  const unmount = () => {
    if (!mounted.delete(unmount)) return
    restore(host)
    host.remove()
  }
  mounted.add(unmount)
  return { host, unmount }
}

/**
 * Mounts an element as a page's script makes one, for a behaviour law that
 * mounts a member with props: `tag` with each prop set through its property
 * and each handler (`onChange`) a listener for its event, called with the
 * event's `detail` (`create`).
 *
 * `owns` names the controlled props the caller holds, as the application
 * around a controlled React member holds them: while the caller has given one
 * a value, the element's change event for it is cancelled, so the element
 * keeps the caller's value until the caller sets another. An element whose
 * page does not cancel takes the value the reader chose.
 */
export async function mountElement(
  tag: string,
  props: object = {},
  options: { children?: readonly unknown[]; owns?: readonly string[] } = {},
): Promise<MountedElement> {
  const element = create(tag, props, options.children ?? [])
  const held = new Map<string, unknown>(Object.entries(props))
  const definition = (element.constructor as typeof PolyElement).definition
  for (const prop of options.owns ?? []) {
    const event = definition.controlled?.[prop]
    if (event === undefined) throw new Error(`mount: <${tag}> has no controlled ${prop}`)
    element.addEventListener(eventOf(event), (change) => {
      if (held.get(prop) !== undefined) change.preventDefault()
    })
  }
  const { host, unmount } = await mountNodes(element)
  return {
    host,
    element,
    set(next) {
      for (const [name, value] of Object.entries(next)) {
        held.set(name, value)
        assign(element, name, value)
      }
    },
    unmount,
  }
}

/**
 * The first element a mount renders, read through each element that draws no
 * box: a member's first element, past a member that renders none (a declared
 * Toast, whose card the viewport draws).
 */
export function renderedRoot(host: Element): Element | null {
  for (const child of host.children) {
    if (!(child instanceof PolyElement)) return child
    const inner = renderedRoot(child)
    if (inner !== null) return inner
  }
  return null
}

export function unmountAll(): void {
  for (const unmount of [...mounted]) unmount()
}
