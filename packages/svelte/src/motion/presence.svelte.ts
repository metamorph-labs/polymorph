import { onDestroy, onMount, tick, untrack } from 'svelte'

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
 * Exit coordination for a Svelte member, over the engine's motion engine: the
 * counterpart of the React foundation's `MotionPresence` and `MotionSurface`.
 *
 * `current` follows `open`, except that it stays true while the element plays
 * its exit, so a member that renders `{#if present.current}` keeps a closing
 * panel in the document until it has animated out. Opening again during an
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
 * Each reads `open` in a pre-effect, so `current` turns true in the same update
 * that opens, before the markup that reads it. The pre-effect runs again when
 * anything `open` reads changes, so each compares the value with the last one,
 * as Vue's `watch` does, and acts only on a change: an update that leaves the
 * value as it was neither restarts an entrance nor an exit.
 */
export interface Present {
  readonly current: boolean
}

export function usePresence(
  open: () => boolean,
  element: () => HTMLElement | null,
  binding?: BindingName | (() => BindingName),
  options: PresenceOptions = {},
): Present {
  if (binding === undefined) return useCssPresence(open, element)
  let present = $state(untrack(open))
  let generation = 0
  let mounted = false
  let destroyed = false
  let first = true
  let last = false
  const appear = untrack(() => options.appear === true)
  const reflow = options.reflow
  if (reflow !== undefined) useReflow(element, reflow, () => present)

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

  $effect.pre(() => {
    const now = open()
    untrack(() => {
      if (first) {
        first = false
        last = now
        void tick().then(() => {
          // Destroyed before its first tick: nothing to place, and `open` reads what has gone.
          if (destroyed) return
          if (open()) enter(!appear)
          mounted = true
        })
        return
      }
      if (Object.is(now, last)) return
      last = now
      const ticket = ++generation
      if (now) {
        const target = element()
        const returning = present && target !== null
        present = true
        if (returning) {
          const resolved = motion(target)
          if (resolved) void animateTo(target, resolved.animate, resolved.enterTransition)
          return
        }
        void tick().then(() => {
          if (ticket === generation) enter(!mounted)
        })
        return
      }
      const target = element()
      const resolved = target === null ? null : motion(target)
      if (target === null || resolved === null) {
        present = false
        return
      }
      void animateTo(target, resolved.exit, resolved.exitTransition).then((arrived) => {
        if (arrived && ticket === generation) present = false
      })
    })
  })

  onDestroy(() => {
    destroyed = true
    generation += 1
  })

  return {
    get current() {
      return present
    },
  }
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
  element: () => HTMLElement | null,
  binding: BindingName,
  present: () => boolean,
): void {
  onMount(() => {
    const target = element()
    const parent = target?.parentElement
    if (!target || !parent) return
    const measure = () => ({ x: target.offsetLeft, y: target.offsetTop })
    let place = measure()
    const slide = () => {
      const next = measure()
      const previous = place
      place = next
      if (!present()) return
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
            place = measure()
          })
    resize?.observe(parent)
    return () => {
      mutation?.disconnect()
      resize?.disconnect()
    }
  })
}

/** The CSS animations an element's closed state started, finished. */
async function settled(target: HTMLElement | null | undefined): Promise<void> {
  const running =
    target === null || target === undefined || typeof target.getAnimations !== 'function'
      ? []
      : target.getAnimations().filter((animation) => animation.playState === 'running')
  await Promise.allSettled(running.map((animation) => animation.finished))
}

/**
 * Presence for an element whose recipe animates it: `current` holds after
 * `open` turns false until the CSS animations the closed state starts have
 * finished, or at once when it starts none (reduced motion, `none`).
 */
function useCssPresence(open: () => boolean, element: () => HTMLElement | null): Present {
  let present = $state(untrack(open))
  let generation = 0
  let first = true
  let last = false
  $effect.pre(() => {
    const now = open()
    untrack(() => {
      if (first) {
        first = false
        last = now
        return
      }
      if (Object.is(now, last)) return
      last = now
      const ticket = ++generation
      if (now) {
        present = true
        return
      }
      void tick()
        .then(() => settled(element()))
        .then(() => {
          if (ticket === generation) present = false
        })
    })
  })
  onDestroy(() => {
    generation += 1
  })
  return {
    get current() {
      return present
    },
  }
}

/**
 * Presence for the items of a list, each played by its recipe: the set of keys
 * whose element stays in the document. A key joins when its item opens, and
 * leaves once the CSS animations its element's closed state starts have
 * finished, or at once when it starts none. Accordion's regions stay unhidden
 * through their close keyframes this way, as Radix keeps them mounted.
 *
 * `elements` reads the elements a loop's ref collects, and `keyOf` names the
 * item an element belongs to. A key that opens again during its exit stays.
 */
export function useKeyedPresence(
  open: () => readonly string[],
  elements: () => readonly HTMLElement[],
  keyOf: (element: HTMLElement) => string | undefined,
): { readonly current: ReadonlySet<string> } {
  let present = $state.raw<ReadonlySet<string>>(new Set(untrack(open)))
  const tickets = new Map<string, number>()
  let destroyed = false
  let first = true
  let last: ReadonlySet<string> = new Set()

  $effect.pre(() => {
    const now = open()
    untrack(() => {
      const opened = new Set(now)
      if (first) {
        first = false
        last = opened
        return
      }
      if (opened.size === last.size && [...opened].every((key) => last.has(key))) return
      last = opened
      const leaving = [...present].filter((key) => !opened.has(key))
      present = new Set([...present, ...opened])
      if (leaving.length === 0) return
      const mine = new Map(leaving.map((key) => [key, (tickets.get(key) ?? 0) + 1]))
      for (const [key, ticket] of mine) tickets.set(key, ticket)
      void tick().then(() =>
        Promise.all(
          leaving.map(async (key) => {
            await settled(elements().find((element) => keyOf(element) === key))
            if (destroyed || tickets.get(key) !== mine.get(key) || open().includes(key)) return
            const next = new Set(present)
            next.delete(key)
            present = next
          }),
        ),
      )
    })
  })

  onDestroy(() => {
    destroyed = true
  })

  return {
    get current() {
      return present
    },
  }
}

/** One item of a list presence: current (`open`), or leaving until `done` runs. */
export interface ListEntry<Item> {
  item: Item
  key: string
  open: boolean
  done: () => void
}

/**
 * A list whose removed items stay at their place while they leave: an entry
 * for every item of `of`, open, and one for each item removed from it, at the
 * position it held, closed, until its `done` runs. An item that comes back
 * before it has gone is current again. A removal is read in the update that
 * makes it, so the leaving item's element is never removed and added again.
 */
export function useListPresence<Item>(
  of: () => readonly Item[],
  keyOf: (item: Item) => string,
): { readonly current: readonly ListEntry<Item>[] } {
  let leaving: { key: string; item: Item; at: number }[] = []
  let before: readonly Item[] = untrack(of)
  let gone = $state(0)

  const entries = $derived.by(() => {
    void gone
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
          gone += 1
        },
      })
    }
    return list
  })

  return {
    get current() {
      return entries
    },
  }
}
