import {
  afterNextRender,
  computed,
  DestroyRef,
  effect,
  inject,
  Injector,
  signal,
  untracked,
  type Signal,
} from '@angular/core'

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
 * that plays its enter although it is open when it first renders; and
 * `reflow`, a spring binding that slides the element to its new place when an
 * element beside it comes or goes. A member whose options read its inputs
 * passes a function, which is called each time they are read.
 */
export type PresenceOptions = Pick<ResolveOptions, 'side' | 'align' | 'sheetSide'> & {
  appear?: boolean
  reflow?: BindingName
}

/**
 * Exit coordination for an Angular member, over the engine's motion engine:
 * the counterpart of the React foundation's `MotionPresence` and
 * `MotionSurface`. Each function is called in an injection context.
 *
 * `present` follows `open`, except that it stays true while the element plays
 * its exit, so a member that renders `@if (present())` keeps a closing panel in
 * the document until it has animated out. Opening again during an exit
 * reverses from the current value rather than restarting. Content that is open
 * when the member first renders does not animate in.
 *
 * A member passes a binding name from `design/motion/motion.json`, or a
 * function that chooses one from its state (Dialog's panel plays `sheet.panel`
 * in its sheet form), read each time the element enters or leaves. It never
 * sees a duration, a spring or a keyframe. `options.side` and `options.align`
 * place an anchored panel's origin on the edge it opens from, and
 * `options.sheetSide` is the edge a `sheet` binding's panel is pinned to, as
 * the React foundation's `MotionSurface` takes them. Content open at first
 * render plays its enter only with `options.appear`, as a `MotionPresence`
 * child that joins after the first render does. `options.reflow` slides the
 * element into a sibling's gap, as `MotionSurface`'s `layoutBinding` does.
 * Without a binding, the element's recipe plays the motion as a CSS animation
 * keyed on its `data-state`, and presence holds until that animation ends.
 */
export function usePresence(
  open: () => boolean,
  element: () => HTMLElement | null,
  binding?: BindingName | (() => BindingName),
  options: PresenceOptions | (() => PresenceOptions) = {},
): Signal<boolean> {
  const injector = inject(Injector)
  const isOpen = computed(() => Boolean(open()))
  if (binding === undefined) return useCssPresence(isOpen, element)
  const read = (): PresenceOptions =>
    untracked(typeof options === 'function' ? options : () => options)
  const present = signal(untracked(isOpen))
  let generation = 0
  let mounted = false
  const { appear = false, reflow } = read()
  if (reflow !== undefined) useReflow(element, reflow, present)

  const motion = (target: HTMLElement): PresenceMotion | null => {
    const name = typeof binding === 'function' ? binding() : binding
    const resolved = resolveBinding(name, readMotionEnvironment(target), read())
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

  watch(isOpen, (now) => {
    const ticket = ++generation
    if (now) {
      const returning = present() && element() !== null
      present.set(true)
      if (returning) {
        const target = element() as HTMLElement
        const resolved = motion(target)
        if (resolved) void animateTo(target, resolved.animate, resolved.enterTransition)
        return
      }
      afterNextRender(
        () => {
          if (ticket === generation) enter(!mounted)
        },
        { injector },
      )
      return
    }
    const target = element()
    const resolved = target === null ? null : motion(target)
    if (target === null || resolved === null) {
      present.set(false)
      return
    }
    void animateTo(target, resolved.exit, resolved.exitTransition).then((arrived) => {
      if (arrived && ticket === generation) present.set(false)
    })
  })

  afterNextRender(
    () => {
      if (untracked(isOpen)) enter(!appear)
      mounted = true
    },
    { injector },
  )

  inject(DestroyRef).onDestroy(() => {
    generation += 1
  })

  return present.asReadonly()
}

/**
 * Slides an element from its old place to its new one when an element beside
 * it is added or removed (first, last, invert, play), with the spring the
 * binding names, as the React foundation's `layoutBinding` does. Its place is
 * its offset in its offset parent, read after the first render, after each
 * change to its parent's children, and when its parent resizes, which only
 * records the new place. A slide already running is part of where the element
 * starts from. An element on its way out does not slide.
 */
function useReflow(
  element: () => HTMLElement | null,
  binding: BindingName,
  present: Signal<boolean>,
): void {
  let place: { x: number; y: number } | null = null
  let release: (() => void) | undefined
  const measure = (target: HTMLElement) => ({ x: target.offsetLeft, y: target.offsetTop })

  afterNextRender(() => {
    const target = element()
    const parent = target?.parentElement
    if (!target || !parent) return
    place = measure(target)
    const slide = () => {
      const next = measure(target)
      const previous = place
      place = next
      if (previous === null || !untracked(present)) return
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

  inject(DestroyRef).onDestroy(() => release?.())
}

/**
 * Runs `changed` with a signal's new value each time it changes after the
 * first read, as Vue's `watch` runs: as an effect, which Angular runs before
 * the component's template is refreshed.
 */
function watch<T>(value: Signal<T>, changed: (now: T) => void): void {
  let first = true
  effect(() => {
    const now = value()
    untracked(() => {
      if (first) {
        first = false
        return
      }
      changed(now)
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
function useCssPresence(open: Signal<boolean>, element: () => HTMLElement | null): Signal<boolean> {
  const injector = inject(Injector)
  const present = signal(untracked(open))
  let generation = 0
  watch(open, (now) => {
    const ticket = ++generation
    if (now) {
      present.set(true)
      return
    }
    // The closed state is rendered first, and its animations start with it.
    afterNextRender(
      () => {
        void Promise.allSettled(running(element()).map((animation) => animation.finished)).then(
          () => {
            if (ticket === generation) present.set(false)
          },
        )
      },
      { injector },
    )
  })
  inject(DestroyRef).onDestroy(() => {
    generation += 1
  })
  return present.asReadonly()
}

/**
 * Presence for the items of a list, each played by its recipe: the set of keys
 * whose element stays in the document. A key joins when its item opens, and
 * leaves once the CSS animations its element's closed state starts have
 * finished, or at once when it starts none. Accordion's regions stay unhidden
 * through their close keyframes this way, as Radix keeps them mounted.
 *
 * `elements` reads the list a loop's ref collects, and `keyOf` names the item
 * an element belongs to. A key that opens again during its exit stays.
 */
export function useKeyedPresence(
  open: () => readonly string[],
  elements: () => readonly HTMLElement[],
  keyOf: (element: HTMLElement) => string | undefined,
): Signal<ReadonlySet<string>> {
  const injector = inject(Injector)
  const keys = computed(() => open(), {
    equal: (a, b) => a.length === b.length && a.every((key, at) => key === b[at]),
  })
  const present = signal<ReadonlySet<string>>(new Set(untracked(keys)))
  const tickets = new Map<string, number>()
  let destroyed = false

  watch(keys, (now) => {
    const opened = new Set(now)
    const leaving = [...present()].filter((key) => !opened.has(key))
    present.set(new Set([...present(), ...opened]))
    if (leaving.length === 0) return
    const mine = new Map(leaving.map((key) => [key, (tickets.get(key) ?? 0) + 1]))
    for (const [key, ticket] of mine) tickets.set(key, ticket)
    afterNextRender(
      () => {
        for (const key of leaving) {
          const target = elements().find((candidate) => keyOf(candidate) === key)
          void Promise.allSettled(running(target).map((animation) => animation.finished)).then(
            () => {
              if (destroyed || tickets.get(key) !== mine.get(key) || untracked(keys).includes(key))
                return
              const next = new Set(present())
              next.delete(key)
              present.set(next)
            },
          )
        }
      },
      { injector },
    )
  })

  inject(DestroyRef).onDestroy(() => {
    destroyed = true
  })

  return present.asReadonly()
}

/** One entry of a list presence: an item, its key, whether it is current, and the call that lets it go. */
export interface ListEntry<Item> {
  item: Item
  key: string
  open: boolean
  done: () => void
}

/**
 * A list whose removed items stay at their place while they leave
 * (TagInput's chips): an entry for every item of `of`, open, and one for each
 * item removed from it, at the position it held, closed, until its `done()`
 * runs. A removal is read in the same computation that sees the new list, so a
 * leaving item's element is never removed and rendered again.
 */
export function useListPresence<Item>(
  of: () => readonly Item[],
  keyOf: (item: Item) => string,
): Signal<readonly ListEntry<Item>[]> {
  let leaving: { key: string; item: Item; at: number }[] = []
  let before: readonly Item[] = untracked(of)
  const gone = signal(0)
  return computed(() => {
    gone()
    const now = of()
    const kept = new Set(now.map(keyOf))
    leaving = leaving.filter((entry) => !kept.has(entry.key))
    before.forEach((item, at) => {
      const key = keyOf(item)
      if (!kept.has(key) && !leaving.some((entry) => entry.key === key))
        leaving.push({ key, item, at })
    })
    before = now
    const list: ListEntry<Item>[] = now.map((item) => ({
      item,
      key: keyOf(item),
      open: true,
      done: () => {},
    }))
    for (const entry of [...leaving].sort((a, b) => a.at - b.at)) {
      list.splice(Math.min(entry.at, list.length), 0, {
        item: entry.item,
        key: entry.key,
        open: false,
        done: () => {
          leaving = leaving.filter((other) => other.key !== entry.key)
          gone.update((count) => count + 1)
        },
      })
    }
    return list
  })
}
