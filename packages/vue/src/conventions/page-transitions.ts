import {
  computed,
  defineComponent,
  h,
  inject,
  onBeforeUnmount,
  onMounted,
  provide,
  reactive,
  ref,
  useId,
  watch,
  type InjectionKey,
  type PropType,
} from 'vue'

import { readMotionEnvironment } from '@polymorph/engine/motion'

/**
 * The page-transition convention (`design/conventions/page-transitions.md`),
 * the Vue foundation's counterpart of the React vocabulary's
 * `PageTransitions`.
 *
 * `PageTransitions` mounts once per application. While a foreground page load,
 * a navigation departure or a page arrival is active, it shows one thin accent
 * ribbon at the top of the viewport, decorative and out of the pointer's way.
 * `PageTransition` is the element a page frame renders its content in
 * (AppShell's `<main>`, AuthPage's column): a new `transitionKey` replays an
 * opacity-only arrival without keying the DOM, so forms keep their drafts,
 * their focus and their scroll; `pending` holds the page still and keeps the
 * ribbon up. `usePageTransitionPending` reports any other foreground load.
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

const CONTEXT: InjectionKey<TransitionContext> = Symbol('polymorph:page-transitions')

/** One viewport ribbon for the application's navigation and loading states. */
export const PageTransitions = defineComponent({
  name: 'PageTransitions',
  setup(_, { slots }) {
    const requests = reactive(new Map<string, Request>())
    const departing = ref(false)
    const ribbon = ref<string | undefined>(undefined)

    provide(CONTEXT, {
      get waiting() {
        return [...requests.values()].includes('pending')
      },
      get departing() {
        return departing.value
      },
      report(id, request) {
        if (request === null) requests.delete(id)
        else requests.set(id, request)
      },
      ribbon(className) {
        if (className !== undefined) ribbon.value = className
      },
    })

    let recovery: ReturnType<typeof setTimeout> | undefined
    const reset = () => {
      clearTimeout(recovery)
      departing.value = false
    }
    const leave = () => {
      clearTimeout(recovery)
      departing.value = true
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
    onMounted(() => {
      document.addEventListener('click', click)
      window.addEventListener('beforeunload', leave)
      window.addEventListener('pageshow', reset)
    })
    onBeforeUnmount(() => {
      clearTimeout(recovery)
      document.removeEventListener('click', click)
      window.removeEventListener('beforeunload', leave)
      window.removeEventListener('pageshow', reset)
    })

    const active = computed(() => departing.value || requests.size > 0)
    return () => [
      slots.default?.(),
      ribbon.value === undefined
        ? null
        : h('div', {
            class: ribbon.value,
            'data-page-progress': active.value ? 'visible' : 'hidden',
            'aria-hidden': 'true',
          }),
    ]
  },
})

/** Reports a foreground page load; polling and idle background work stay silent. */
export function usePageTransitionPending(pending: () => boolean): void {
  const id = useId()
  const report = inject(CONTEXT, null)?.report
  watch(pending, (now) => report?.(id, now ? 'pending' : null), { immediate: true })
  onBeforeUnmount(() => report?.(id, null))
}

/**
 * A page frame's content element, rendered as `as`. Its `data-page-transition`
 * alternates between `a` and `b` each time the key or the wait changes, and
 * the recipe names a keyframe for each, so the arrival replays on the same
 * element and its children keep their state. While the page waits it holds
 * still (`pending`), and while the browser leaves it fades (`exiting`).
 */
export const PageTransition = defineComponent({
  name: 'PageTransition',
  props: {
    as: { type: String, required: true },
    transitionKey: { type: String, default: undefined },
    pending: { type: Boolean, default: false },
    /** The ribbon's class, from the page-transitions recipe the frame imports. */
    ribbon: { type: String as PropType<string | undefined>, default: undefined },
  },
  setup(props, { slots }) {
    const context = inject(CONTEXT, null)
    context?.ribbon(props.ribbon)
    const id = useId()
    const element = ref<Element | null>(null)
    usePageTransitionPending(() => props.pending)

    const waiting = computed(() => props.pending || (context?.waiting ?? false))
    const sequence = ref(0)
    watch([() => props.transitionKey, waiting], () => {
      sequence.value += 1
    })

    // The ribbon stays up through the arrival, and through staggered entrances that finish after
    // the page's own fade; never through ambient loops, which have no end.
    let timer: ReturnType<typeof setTimeout> | undefined
    const arrive = () => {
      clearTimeout(timer)
      context?.report(id, null)
      if (props.transitionKey === undefined || waiting.value || element.value === null) return
      const environment = readMotionEnvironment(element.value)
      const ends = (element.value.getAnimations?.({ subtree: true }) ?? []).map(
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
    onMounted(arrive)
    watch(sequence, arrive, { flush: 'post' })
    onBeforeUnmount(() => {
      clearTimeout(timer)
      context?.report(id, null)
    })

    return () =>
      h(
        props.as,
        {
          ref: element,
          'data-page-transition':
            props.transitionKey === undefined ? undefined : sequence.value % 2 ? 'b' : 'a',
          'data-page-transition-state':
            props.transitionKey === undefined
              ? undefined
              : context?.departing
                ? 'exiting'
                : waiting.value
                  ? 'pending'
                  : 'entered',
        },
        slots.default?.(),
      )
  },
})
