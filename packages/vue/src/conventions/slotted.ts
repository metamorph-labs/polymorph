import {
  Comment,
  Fragment,
  Text,
  getCurrentInstance,
  h,
  onBeforeUpdate,
  onBeforeUnmount,
  reactive,
  shallowRef,
  type FunctionalComponent,
  type VNode,
  type VNodeChild,
} from 'vue'

import { readMotionEnvironment, resolveBinding, type BindingName } from '@polymorph/engine/motion'

/**
 * What a member reads from the elements a caller put in one of its slots: how
 * many there are, the first one's component's `controlKind`, and the first
 * one's own props. FormField lays its label out by the control's kind and
 * mirrors its `disabled`; Avatar.Group counts its members. Text and comments
 * between elements are not elements, and a fragment counts as what it holds.
 */
export interface Slotted {
  count: number
  kind: string | undefined
  props: Readonly<Record<string, unknown>>
}

function elements(nodes: readonly VNode[]): VNode[] {
  return nodes.flatMap((node) => {
    if (node.type === Comment || node.type === Text) return []
    if (node.type === Fragment) return elements((node.children ?? []) as VNode[])
    return [node]
  })
}

export function slotted(slot: (() => VNode[]) | undefined): Slotted {
  const found = elements(slot?.() ?? [])
  const first = found[0]
  const type = first?.type as { controlKind?: string } | undefined
  return {
    count: found.length,
    kind: typeof type === 'object' || typeof type === 'function' ? type.controlKind : undefined,
    props: (first?.props ?? {}) as Readonly<Record<string, unknown>>,
  }
}

/** The elements of a slot, at most `take` of them, for a member that passes each one props. */
export function slottedElements(slot: (() => VNode[]) | undefined, take?: number): VNode[] {
  const found = elements(slot?.() ?? [])
  return take === undefined ? found : found.slice(0, take)
}

/** What `SlotRender` takes: the slot it runs. */
interface SlotRenderProps {
  slot: (props: never) => unknown
}

/**
 * Runs the slot it is given. It is one component for every node `slotNode`
 * makes, so a node made again for the same place patches the content the
 * last one rendered: a declared Toast's content keeps its elements, its focus
 * and its state when the toast updates.
 */
const SlotRender: FunctionalComponent<SlotRenderProps> = ({ slot }) =>
  slot({} as never) as VNodeChild
SlotRender.props = ['slot']

/**
 * A slot as a node another component renders: a declared Toast's `content`,
 * which the toast store holds and the viewport draws. The slot runs when the
 * node renders, inside the component that draws it, where Vue tracks what it
 * reads; `undefined` when the caller filled no slot.
 */
export function slotNode(slot: ((props: never) => unknown) | undefined): VNode | undefined {
  if (slot === undefined) return undefined
  return h(SlotRender, { slot })
}

/**
 * The caller's slots, for a member whose script reads them: ToolCall disables
 * its trigger while it has no body, and its `output` slot is part of the body.
 * Vue's slots are not reactive, so a computed value that reads one would keep
 * what it read first. Each read through this object also reads which slots are
 * filled, a value that changes before the member renders with a slot filled or
 * emptied, so a computed value that read a slot is read again then. What a
 * read returns is the caller's slot itself.
 */
export function useTrackedSlots<Slots extends object>(slots: Slots): Slots {
  const filled = (): string =>
    Object.keys(slots)
      .filter((name) => (slots as Record<string, unknown>)[name] !== undefined)
      .sort()
      .join(' ')
  const names = shallowRef(filled())
  onBeforeUpdate(() => {
    const now = filled()
    if (now !== names.value) names.value = now
  })
  return new Proxy(slots, {
    get(target, name, receiver) {
      void names.value
      return Reflect.get(target, name, receiver) as unknown
    },
  })
}

/**
 * Props a member hands to a slotted element, without the ones it leaves
 * unset: `undefined` would overwrite the element's own value (FormField must
 * not clear a control's own `invalid`).
 */
export function definedProps(props: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(props).filter(([, value]) => value !== undefined))
}

/** Whether a vnode prop's value is a listener: a function, or several. */
const isListener = (value: unknown): boolean => typeof value === 'function' || Array.isArray(value)

/**
 * Whether the caller listens for each of the member's events, by event name:
 * Alert draws its ✕ only when someone handles `dismiss`, and PromptInput's
 * computed `attachable` reads whether anyone handles `attach`.
 *
 * Vue's vnode props are not reactive, so a computed value that read one would
 * keep what it read first. Each read through this object also reads which
 * events have a listener, a value refreshed before each update of the member,
 * so a computed value that read it is read again when a listener is added or
 * removed. Vue updates a member when the keys of its props change, so a
 * listener added or removed is read at that update. A listener that changes
 * between a function and `undefined` under the same key does not update the
 * member, because Vue does not compare a declared event's listeners, and is
 * read at the member's next update.
 */
export function useListening(): Readonly<Record<string, boolean>> {
  const instance = getCurrentInstance()
  const listened = (): string =>
    Object.entries(instance?.vnode.props ?? {})
      .filter(([key, value]) => /^on[A-Z]/.test(key) && isListener(value))
      .map(([key]) => key)
      .sort()
      .join(' ')
  const names = shallowRef(listened())
  onBeforeUpdate(() => {
    const now = listened()
    if (now !== names.value) names.value = now
  })
  return new Proxy(
    {},
    {
      get(_, name) {
        void names.value
        if (typeof name !== 'string') return false
        return isListener(
          instance?.vnode.props?.[`on${name.charAt(0).toUpperCase()}${name.slice(1)}`],
        )
      },
    },
  )
}

/**
 * A departure that runs before a member hands control back to the caller:
 * Alert's ✕ plays the `collapse` exit, and the caller hears `dismiss` once it
 * has run, so the application owns the unmount. `start` sets `active`, waits
 * for the binding's runtime as the motion engine resolves it for the element,
 * and then calls `then`; it never calls it after the member has unmounted.
 */
export function useDeparture(
  element: { value: HTMLElement | null },
  binding: BindingName,
): { active: boolean; start(then: () => void): void } {
  let timer: ReturnType<typeof setTimeout> | undefined
  onBeforeUnmount(() => clearTimeout(timer))
  const departure = reactive({
    active: false,
    start(then: () => void) {
      departure.active = true
      const resolved = resolveBinding(
        binding,
        readMotionEnvironment(element.value ?? document.documentElement),
      )
      const runtime =
        resolved.kind === 'collapse' ? Math.max(resolved.sizeDurationMs, resolved.contentFadeMs) : 0
      clearTimeout(timer)
      if (runtime === 0) then()
      else timer = setTimeout(then, runtime)
    },
  })
  return departure
}
