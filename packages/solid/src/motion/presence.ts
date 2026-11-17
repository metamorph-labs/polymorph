import {
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  onMount,
  untrack,
  type Accessor,
} from 'solid-js'

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
 * Exit coordination for a Solid member, over the engine's motion engine: the
 * counterpart of the React foundation's `MotionPresence` and `MotionSurface`.
 *
 * `present` follows `open`, except that it stays true while the element plays
 * its exit, so a member that renders its content while `present()` is true
 * (`{present() ? <div /> : null}`) keeps a closing panel in the document until
 * it has animated out. Opening again during an
 * exit reverses from the current value rather than restarting. Content that is
 * open when the member mounts does not animate in.
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
 *
 * `open` is read through a memo, so presence moves only when the boolean
 * changes, not each time the state it is read from does. Content that opens
 * renders a microtask after `open` turns true. The foundation's `useMachine`,
 * as Zag's Solid adapter does, sets a machine's state and only then runs the
 * new state's effects, in the same call, so content that rendered at once
 * would mount before its machine's effects ran: a modal's focus trap would
 * then record the content's own field, which a machine inside it focused, as
 * where focus returns on close.
 */
export function usePresence(
  open: () => boolean,
  element: Accessor<HTMLElement | null>,
  binding?: BindingName | (() => BindingName),
  options: PresenceOptions = {},
): Accessor<boolean> {
  const isOpen = createMemo(() => Boolean(open()))
  if (binding === undefined) return useCssPresence(isOpen, element)
  const [present, setPresent] = createSignal(isOpen())
  let generation = 0
  let mounted = false
  // Read once, when the presence is made: the getter reads a prop.
  const appear = untrack(() => options.appear === true)
  if (options.reflow !== undefined) useReflow(element, options.reflow, present)

  const motion = (target: HTMLElement): PresenceMotion | null => {
    const name = typeof binding === 'function' ? binding() : binding
    const resolved = resolveBinding(name, readMotionEnvironment(target), options)
    return resolved.kind === 'presence' ? resolved : null
  }

  const enter = (initial: boolean) => {
    const target = element()
    if (target === null) return
    const resolved = motion(target)
    if (resolved === null) return
    if (resolved.transformOrigin) target.style.transformOrigin = resolved.transformOrigin
    target.setAttribute('data-motion-pattern', resolved.effective)
    if (initial) setFrame(target, resolved.animate)
    else void animateTo(target, resolved.animate, resolved.enterTransition, resolved.initial)
  }

  createEffect(
    on(
      isOpen,
      (now) => {
        const ticket = ++generation
        if (now) {
          if (present() && element() !== null) {
            const target = element() as HTMLElement
            const resolved = motion(target)
            if (resolved) void animateTo(target, resolved.animate, resolved.enterTransition)
            return
          }
          // The element renders once the machine's effects have run; it enters after.
          queueMicrotask(() => {
            if (ticket !== generation) return
            setPresent(true)
            queueMicrotask(() => {
              if (ticket === generation) enter(!mounted)
            })
          })
          return
        }
        const target = element()
        const resolved = target === null ? null : motion(target)
        if (target === null || resolved === null) {
          setPresent(false)
          return
        }
        void animateTo(target, resolved.exit, resolved.exitTransition).then((arrived) => {
          if (arrived && ticket === generation) setPresent(false)
        })
      },
      { defer: true },
    ),
  )

  onMount(() => {
    if (isOpen()) enter(!appear)
    mounted = true
  })

  onCleanup(() => {
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
function useReflow(
  element: Accessor<HTMLElement | null>,
  binding: BindingName,
  present: Accessor<boolean>,
): void {
  let place: { x: number; y: number } | null = null
  const measure = (target: HTMLElement) => ({ x: target.offsetLeft, y: target.offsetTop })
  onMount(() => {
    const target = element()
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
    onCleanup(() => {
      mutation?.disconnect()
      resize?.disconnect()
    })
  })
}

/** The CSS animations an element's current state has started. */
function running(target: Element | null | undefined): Animation[] {
  return target === null || target === undefined || typeof target.getAnimations !== 'function'
    ? []
    : target.getAnimations().filter((animation) => animation.playState === 'running')
}

/**
 * Presence for an element whose recipe animates it: `present` holds after
 * `open` turns false until the CSS animations the closed state starts have
 * finished, or at once when it starts none (reduced motion, `none`).
 */
function useCssPresence(
  open: Accessor<boolean>,
  element: Accessor<HTMLElement | null>,
): Accessor<boolean> {
  const [present, setPresent] = createSignal(open())
  let generation = 0
  createEffect(
    on(
      open,
      async (now) => {
        const ticket = ++generation
        if (now) {
          // As above: the content renders once the machine's effects have run.
          await Promise.resolve()
          if (ticket === generation) setPresent(true)
          return
        }
        await Promise.resolve()
        await Promise.allSettled(running(element()).map((animation) => animation.finished))
        if (ticket === generation) setPresent(false)
      },
      { defer: true },
    ),
  )
  onCleanup(() => {
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
  elements: Accessor<readonly HTMLElement[]>,
  keyOf: (element: HTMLElement) => string | undefined,
): Accessor<ReadonlySet<string>> {
  const keys = createMemo(() => open(), undefined, {
    equals: (a, b) => a.length === b.length && a.every((key, at) => key === b[at]),
  })
  const [present, setPresent] = createSignal<ReadonlySet<string>>(new Set(keys()))
  const tickets = new Map<string, number>()
  let unmounted = false

  createEffect(
    on(
      keys,
      async (now) => {
        const opened = new Set(now)
        const leaving = [...present()].filter((key) => !opened.has(key))
        setPresent(new Set([...present(), ...opened]))
        if (leaving.length === 0) return
        const mine = new Map(leaving.map((key) => [key, (tickets.get(key) ?? 0) + 1]))
        for (const [key, ticket] of mine) tickets.set(key, ticket)
        await Promise.resolve()
        await Promise.all(
          leaving.map(async (key) => {
            const target = elements().find((candidate) => keyOf(candidate) === key)
            await Promise.allSettled(running(target).map((animation) => animation.finished))
            if (unmounted || tickets.get(key) !== mine.get(key) || keys().includes(key)) return
            const next = new Set(present())
            next.delete(key)
            setPresent(next)
          }),
        )
      },
      { defer: true },
    ),
  )

  onCleanup(() => {
    unmounted = true
  })

  return present
}
