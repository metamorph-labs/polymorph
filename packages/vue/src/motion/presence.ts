import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch, type Ref } from 'vue'

import {
  animateProperty,
  animateTo,
  readMotionEnvironment,
  resolveBinding,
  setFrame,
  type BindingName,
  type PresenceMotion,
  type ResolveOptions,
} from '@polymorph/engine/motion'

/**
 * What a presence takes besides its binding: the anchored side and alignment
 * and the sheet's edge, which the motion engine reads each time the element
 * enters or leaves; `appear`, read once when the presence is made, for content
 * that plays its enter although it is open when it mounts; and `reflow`, a
 * spring binding that slides the element to its new place when an element
 * beside it comes or goes.
 */
export type PresenceOptions = Pick<ResolveOptions, 'side' | 'align' | 'sheetSide'> & {
  appear?: boolean
  reflow?: BindingName
}

/**
 * Exit coordination for a Vue member, over the engine's motion engine: the
 * counterpart of the React foundation's `MotionPresence` and `MotionSurface`.
 *
 * `present` follows `open`, except that it stays true while the element plays
 * its exit, so a member that renders `v-if="present"` keeps a closing panel in
 * the document until it has animated out. Opening again during an exit
 * reverses from the current value rather than restarting. Content that is open
 * when the member mounts does not animate in.
 *
 * A member passes a binding name from `design/motion/motion.json`, or a
 * function that chooses one from its state (Dialog's panel plays `sheet.panel`
 * in its sheet form), read each time the element enters or leaves. It never
 * sees a duration, a spring or a keyframe. `options.side` and `options.align`
 * place an anchored panel's origin on the edge it opens from, and
 * `options.sheetSide` is the edge a `sheet` binding's panel is pinned to, as
 * the React foundation's `MotionSurface` takes them. Content open at mount
 * plays its enter only with `options.appear`, as a `MotionPresence` child that
 * joins after the first render does. `options.reflow` slides the element into
 * a sibling's gap, as `MotionSurface`'s `layoutBinding` does. Without a
 * binding, the element's recipe plays the motion as a CSS animation keyed on
 * its `data-state`, and presence holds until that animation ends.
 */
export function usePresence(
  open: () => boolean,
  element: Ref<HTMLElement | null>,
  binding?: BindingName | (() => BindingName),
  options: PresenceOptions = {},
): Ref<boolean> {
  if (binding === undefined) return useCssPresence(open, element)
  const present = ref(open())
  let generation = 0
  let mounted = false
  const appear = options.appear === true
  if (options.reflow !== undefined) useReflow(element, options.reflow, () => present.value)

  const motion = (target: HTMLElement): PresenceMotion | null => {
    const name = typeof binding === 'function' ? binding() : binding
    const resolved = resolveBinding(name, readMotionEnvironment(target), options)
    return resolved.kind === 'presence' ? resolved : null
  }

  const enter = (initial: boolean) => {
    const target = element.value
    if (target === null) return
    const resolved = motion(target)
    if (resolved === null) return
    if (resolved.transformOrigin) target.style.transformOrigin = resolved.transformOrigin
    target.setAttribute('data-motion-pattern', resolved.effective)
    if (initial) setFrame(target, resolved.animate)
    else void animateTo(target, resolved.animate, resolved.enterTransition, resolved.initial)
  }

  watch(open, (now) => {
    const ticket = ++generation
    if (now) {
      const returning = present.value && element.value !== null
      present.value = true
      if (returning) {
        const target = element.value as HTMLElement
        const resolved = motion(target)
        if (resolved) void animateTo(target, resolved.animate, resolved.enterTransition)
        return
      }
      void nextTick(() => {
        if (ticket === generation) enter(!mounted)
      })
      return
    }
    const target = element.value
    const resolved = target === null ? null : motion(target)
    if (target === null || resolved === null) {
      present.value = false
      return
    }
    void animateTo(target, resolved.exit, resolved.exitTransition).then((arrived) => {
      if (arrived && ticket === generation) present.value = false
    })
  })

  void nextTick(() => {
    if (open()) enter(!appear)
    mounted = true
  })

  onBeforeUnmount(() => {
    generation += 1
  })

  return present
}

/**
 * Slides an element from its old place to its new one when an element beside
 * it is added or removed (first, last, invert, play), with the spring the
 * binding names, as the React foundation's `layoutBinding` does. Its place is
 * its offset in its offset parent, read on mount, after each change to its
 * parent's children, and when its parent resizes, which only records the new
 * place. A slide already running is part of where the element starts from.
 * An element on its way out does not slide.
 */
function useReflow(element: Ref<HTMLElement | null>, binding: BindingName, present: () => boolean) {
  let place: { x: number; y: number } | null = null
  let release: (() => void) | undefined
  const measure = (target: HTMLElement) => ({ x: target.offsetLeft, y: target.offsetTop })

  onMounted(() => {
    const target = element.value
    const parent = target?.parentElement
    if (!target || !parent) return
    place = measure(target)
    const slide = () => {
      const next = measure(target)
      const previous = place
      place = next
      if (previous === null || !present()) return
      const dx = previous.x - next.x
      const dy = previous.y - next.y
      if (dx === 0 && dy === 0) return
      const resolved = resolveBinding(binding, readMotionEnvironment(target))
      if (resolved.kind !== 'spring') return
      const transform = getComputedStyle(target).transform
      const now = new DOMMatrixReadOnly(transform === 'none' ? undefined : transform)
      void animateProperty(
        target,
        'transform',
        'none',
        resolved.transition,
        `translate(${dx + now.e}px, ${dy + now.f}px)`,
      )
    }
    const mutation =
      typeof MutationObserver === 'undefined' ? undefined : new MutationObserver(slide)
    mutation?.observe(parent, { childList: true })
    const resize =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(() => {
            place = measure(target)
          })
    resize?.observe(parent)
    release = () => {
      mutation?.disconnect()
      resize?.disconnect()
    }
  })

  onBeforeUnmount(() => release?.())
}

/**
 * Presence for an element whose recipe animates it: `present` holds after
 * `open` turns false until the CSS animations the closed state starts have
 * finished, or at once when it starts none (reduced motion, `none`).
 */
function useCssPresence(open: () => boolean, element: Ref<HTMLElement | null>): Ref<boolean> {
  const present = ref(open())
  let generation = 0
  watch(open, async (now) => {
    const ticket = ++generation
    if (now) {
      present.value = true
      return
    }
    await nextTick()
    const target = element.value
    const running =
      target === null || typeof target.getAnimations !== 'function'
        ? []
        : target.getAnimations().filter((animation) => animation.playState === 'running')
    await Promise.allSettled(running.map((animation) => animation.finished))
    if (ticket === generation) present.value = false
  })
  onBeforeUnmount(() => {
    generation += 1
  })
  return present
}

/**
 * Presence for the items of a list, each played by its recipe: the set of keys
 * whose element stays in the document. A key joins when its item opens, and
 * leaves once the CSS animations its element's closed state starts have
 * finished, or at once when it starts none. Accordion's regions stay unhidden
 * through their close keyframes this way, as Radix keeps them mounted.
 *
 * `elements` is the list a loop's ref collects, and `keyOf` names the item an
 * element belongs to. A key that opens again during its exit stays.
 */
export function useKeyedPresence(
  open: () => readonly string[],
  elements: { readonly value: readonly HTMLElement[] | null },
  keyOf: (element: HTMLElement) => string | undefined,
): Ref<ReadonlySet<string>> {
  const present = shallowRef<ReadonlySet<string>>(new Set(open()))
  const tickets = new Map<string, number>()
  let unmounted = false

  watch(open, async (now) => {
    const opened = new Set(now)
    const leaving = [...present.value].filter((key) => !opened.has(key))
    present.value = new Set([...present.value, ...opened])
    if (leaving.length === 0) return
    const mine = new Map(leaving.map((key) => [key, (tickets.get(key) ?? 0) + 1]))
    for (const [key, ticket] of mine) tickets.set(key, ticket)
    await nextTick()
    await Promise.all(
      leaving.map(async (key) => {
        const target = (elements.value ?? []).find((element) => keyOf(element) === key)
        const running =
          target === undefined || typeof target.getAnimations !== 'function'
            ? []
            : target.getAnimations().filter((animation) => animation.playState === 'running')
        await Promise.allSettled(running.map((animation) => animation.finished))
        if (unmounted || tickets.get(key) !== mine.get(key) || open().includes(key)) return
        const next = new Set(present.value)
        next.delete(key)
        present.value = next
      }),
    )
  })

  onBeforeUnmount(() => {
    unmounted = true
  })

  return present
}
