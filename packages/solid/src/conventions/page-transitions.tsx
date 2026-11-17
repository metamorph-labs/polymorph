import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  on,
  onCleanup,
  onMount,
  splitProps,
  useContext,
  type JSX,
} from 'solid-js'
import { Dynamic } from 'solid-js/web'

import { readMotionEnvironment } from '@polymorph/engine/motion'

/**
 * The page-transition convention (`design/conventions/page-transitions.md`),
 * the Solid foundation's counterpart of the React vocabulary's
 * `PageTransitions`.
 *
 * `PageTransitions` mounts once per application. While a foreground page load,
 * a navigation departure or a page arrival is active, it shows one thin accent
 * ribbon at the top of the viewport, decorative and out of the pointer's way.
 * `PageTransition` is the element a page frame renders its content in
 * (AuthPage's column): a new `transitionKey` replays an opacity-only arrival
 * without keying the DOM, so forms keep their drafts, their focus and their
 * scroll; `pending` holds the page still and keeps the ribbon up.
 * `usePageTransitionPending` reports any other foreground load.
 *
 * The recipe (`conventions/page-transitions.module.css`) styles both. The
 * foundation does not depend on the recipes, so a page frame hands the recipe's
 * classes over: the page's own `class`, and the ribbon's as `ribbon`, which the
 * provider draws once a frame has given it. Without a provider, a frame still
 * replays its arrivals and holds while pending.
 */

type Request = 'pending' | 'entering'

interface TransitionContext {
  readonly waiting: boolean
  readonly departing: boolean
  report: (id: string, request: Request | null) => void
  /** The ribbon's class, from the recipe a page frame imports. */
  ribbon: (className: string | undefined) => void
}

const CONTEXT = createContext<TransitionContext | undefined>(undefined)

/** One viewport ribbon for the application's navigation and loading states. */
export function PageTransitions(props: { children?: JSX.Element }): JSX.Element {
  const [requests, setRequests] = createSignal<ReadonlyMap<string, Request>>(new Map())
  const [departing, setDeparting] = createSignal(false)
  const [ribbon, setRibbon] = createSignal<string | undefined>(undefined)

  const context: TransitionContext = {
    get waiting() {
      return [...requests().values()].includes('pending')
    },
    get departing() {
      return departing()
    },
    report(id, request) {
      setRequests((current) => {
        const next = new Map(current)
        if (request === null) next.delete(id)
        else next.set(id, request)
        return next
      })
    },
    ribbon(className) {
      if (className !== undefined) setRibbon(className)
    },
  }

  let recovery: ReturnType<typeof setTimeout> | undefined
  const reset = () => {
    clearTimeout(recovery)
    setDeparting(false)
  }
  const leave = () => {
    clearTimeout(recovery)
    setDeparting(true)
    // A cancelled browser departure must not leave the current page invisible.
    recovery = setTimeout(reset, 10_000)
  }
  const click = (event: MouseEvent) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      !(event.target instanceof Element)
    )
      return
    const link = event.target.closest('a[href]')
    if (
      !(link instanceof HTMLAnchorElement) ||
      link.hasAttribute('download') ||
      (link.target && link.target !== '_self')
    )
      return
    const destination = new URL(link.href, window.location.href)
    if (
      !['http:', 'https:'].includes(destination.protocol) ||
      (destination.origin === window.location.origin &&
        destination.pathname === window.location.pathname &&
        destination.search === window.location.search)
    )
      return
    queueMicrotask(() => {
      if (!event.defaultPrevented) leave()
    })
  }
  // Observes native navigation after the application's handlers; never intercepts it.
  onMount(() => {
    document.addEventListener('click', click)
    window.addEventListener('beforeunload', leave)
    window.addEventListener('pageshow', reset)
  })
  onCleanup(() => {
    clearTimeout(recovery)
    if (typeof document === 'undefined') return
    document.removeEventListener('click', click)
    window.removeEventListener('beforeunload', leave)
    window.removeEventListener('pageshow', reset)
  })

  const active = createMemo(() => departing() || requests().size > 0)
  return (
    <CONTEXT.Provider value={context}>
      {props.children}
      {ribbon() === undefined ? null : (
        <div
          class={ribbon()}
          data-page-progress={active() ? 'visible' : 'hidden'}
          aria-hidden="true"
        />
      )}
    </CONTEXT.Provider>
  )
}

/** Reports a foreground page load; polling and idle background work stay silent. */
export function usePageTransitionPending(pending: () => boolean): void {
  const id = createUniqueId()
  const report = useContext(CONTEXT)?.report
  createEffect(on(pending, (now) => report?.(id, now ? 'pending' : null)))
  onCleanup(() => report?.(id, null))
}

/** What `PageTransition` takes: its element, its key and wait, and the classes a frame hands it. */
export interface PageTransitionProps {
  as: string
  transitionKey?: string | undefined
  pending?: boolean | undefined
  /** The ribbon's class, from the page-transitions recipe the frame imports. */
  ribbon?: string | undefined
  /** The page's class, from the frame's recipes. */
  class?: string | undefined
  /** The element's id, which a frame's skip link targets (AppShell's `#content`). */
  id?: string | undefined
  children?: JSX.Element
}

/**
 * A page frame's content element, rendered as `as`. Its `data-page-transition`
 * alternates between `a` and `b` each time the key or the wait changes, and
 * the recipe names a keyframe for each, so the arrival replays on the same
 * element and its children keep their state. While the page waits it holds
 * still (`pending`), and while the browser leaves it fades (`exiting`).
 */
export function PageTransition(props: PageTransitionProps): JSX.Element {
  const [own, rest] = splitProps(props, ['as', 'transitionKey', 'pending', 'ribbon', 'children'])
  const context = useContext(CONTEXT)
  // The ribbon's class is the frame's recipe's, read once.
  context?.ribbon(own.ribbon)
  const id = createUniqueId()
  const [element, setElement] = createSignal<Element | null>(null)
  usePageTransitionPending(() => own.pending ?? false)

  const waiting = createMemo(() => (own.pending ?? false) || (context?.waiting ?? false))
  const [sequence, setSequence] = createSignal(0)
  createEffect(
    on([() => own.transitionKey, waiting], () => setSequence((value) => value + 1), {
      defer: true,
    }),
  )

  // The ribbon stays up through the arrival, and through staggered entrances that finish after
  // the page's own fade; never through ambient loops, which have no end.
  let timer: ReturnType<typeof setTimeout> | undefined
  const arrive = () => {
    clearTimeout(timer)
    context?.report(id, null)
    const target = element()
    if (own.transitionKey === undefined || waiting() || target === null) return
    const environment = readMotionEnvironment(target)
    const ends = (target.getAnimations?.({ subtree: true }) ?? []).map(
      (animation) => animation.effect?.getComputedTiming().endTime,
    )
    const duration = environment.reducedMotion
      ? 0
      : Math.max(
          environment.durations.surface,
          ...ends.filter((end): end is number => typeof end === 'number' && Number.isFinite(end)),
        )
    if (duration <= 0) return
    context?.report(id, 'entering')
    timer = setTimeout(() => context?.report(id, null), duration)
  }
  createEffect(on(sequence, arrive))
  onCleanup(() => {
    clearTimeout(timer)
    context?.report(id, null)
  })

  return (
    <Dynamic
      component={own.as}
      {...rest}
      ref={setElement}
      data-page-transition={
        own.transitionKey === undefined ? undefined : sequence() % 2 ? 'b' : 'a'
      }
      data-page-transition-state={
        own.transitionKey === undefined
          ? undefined
          : context?.departing
            ? 'exiting'
            : waiting()
              ? 'pending'
              : 'entered'
      }
    >
      {own.children}
    </Dynamic>
  )
}
