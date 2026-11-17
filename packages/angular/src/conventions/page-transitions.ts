import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  Directive,
  effect,
  ElementRef,
  inject,
  InjectionToken,
  Injector,
  input,
  signal,
  untracked,
} from '@angular/core'

import { readMotionEnvironment } from '@polymorph/engine/motion'

import { uniqueId } from './member'

/**
 * The page-transition convention (`design/conventions/page-transitions.md`),
 * the Angular foundation's counterpart of the React vocabulary's
 * `PageTransitions`.
 *
 * `PageTransitions` (`<pm-page-transitions>`) mounts once per application.
 * While a foreground page load, a navigation departure or a page arrival is
 * active, it shows one thin accent ribbon at the top of the viewport,
 * decorative and out of the pointer's way. `PageTransition` (`pmPageTransition`)
 * is the directive a page frame puts on the element it renders its content in
 * (AuthPage's column): a new `transitionKey` replays an opacity-only arrival
 * without replacing the element, so forms keep their drafts, their focus and
 * their scroll; `pending` holds the page still and keeps the ribbon up.
 * `usePageTransitionPending` reports any other foreground load.
 *
 * The recipe (`conventions/page-transitions.module.css`) styles both. The
 * foundation does not depend on the recipes, so a page frame hands the recipe's
 * classes over: its element's own class, and the ribbon's as `ribbon`, which
 * the provider draws once a frame has given it. Without a provider, a frame
 * still replays its arrivals and holds while pending.
 */

type Request = 'pending' | 'entering'

interface TransitionContext {
  readonly waiting: boolean
  readonly departing: boolean
  report: (id: string, request: Request | null) => void
  /** The ribbon's class, from the recipe a page frame imports. */
  ribbon: (className: string | undefined) => void
}

const CONTEXT = new InjectionToken<TransitionContext>('polymorph: page transitions')

/** One viewport ribbon for the application's navigation and loading states. */
@Component({
  selector: 'pm-page-transitions',
  host: { style: 'display: contents' },
  providers: [{ provide: CONTEXT, useFactory: () => inject(PageTransitions).context }],
  // prettier-ignore
  template: `<ng-content />@if (ribbon(); as className) {<div
      [attr.class]="className"
      [attr.data-page-progress]="active() ? 'visible' : 'hidden'"
      aria-hidden="true"
    ></div>}`,
})
export class PageTransitions {
  private readonly requests = signal<ReadonlyMap<string, Request>>(new Map())
  private readonly departing = signal(false)
  protected readonly ribbon = signal<string | undefined>(undefined)
  protected readonly active = computed(() => this.departing() || this.requests().size > 0)

  readonly context: TransitionContext = ((requests, departing, ribbon) => ({
    get waiting() {
      return [...requests().values()].includes('pending')
    },
    get departing() {
      return departing()
    },
    report: (id: string, request: Request | null) => {
      requests.update((current) => {
        const next = new Map(current)
        if (request === null) next.delete(id)
        else next.set(id, request)
        return next
      })
    },
    ribbon: (className: string | undefined) => {
      if (className !== undefined) ribbon.set(className)
    },
  }))(this.requests, this.departing, this.ribbon)

  constructor() {
    let recovery: ReturnType<typeof setTimeout> | undefined
    const reset = () => {
      clearTimeout(recovery)
      this.departing.set(false)
    }
    const leave = () => {
      clearTimeout(recovery)
      this.departing.set(true)
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
    afterNextRender(() => {
      document.addEventListener('click', click)
      window.addEventListener('beforeunload', leave)
      window.addEventListener('pageshow', reset)
    })
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(recovery)
      if (typeof document === 'undefined') return
      document.removeEventListener('click', click)
      window.removeEventListener('beforeunload', leave)
      window.removeEventListener('pageshow', reset)
    })
  }
}

/**
 * Reports a foreground page load; polling and idle background work stay
 * silent. Call it in an injection context.
 */
export function usePageTransitionPending(pending: () => boolean): void {
  const id = uniqueId()
  const report = inject(CONTEXT, { optional: true })?.report
  effect(() => {
    const now = pending()
    untracked(() => report?.(id, now ? 'pending' : null))
  })
  inject(DestroyRef).onDestroy(() => report?.(id, null))
}

/**
 * A page frame's content element: `<div pmPageTransition [transitionKey]="…">`.
 * Its `data-page-transition` alternates between `a` and `b` each time the key
 * or the wait changes, and the recipe names a keyframe for each, so the
 * arrival replays on the same element and its children keep their state.
 * While the page waits it holds still (`pending`), and while the browser
 * leaves it fades (`exiting`).
 */
@Directive({
  selector: '[pmPageTransition]',
  host: {
    '[attr.data-page-transition]': 'phase()',
    '[attr.data-page-transition-state]': 'state()',
  },
})
export class PageTransition {
  readonly transitionKey = input<string | undefined>(undefined)
  readonly pending = input<boolean | undefined>(undefined)
  /** The ribbon's class, from the page-transitions recipe the frame imports. */
  readonly ribbon = input<string | undefined>(undefined)

  private readonly context = inject(CONTEXT, { optional: true })
  private readonly element = inject(ElementRef).nativeElement as HTMLElement
  private readonly id = uniqueId()
  private readonly waiting = computed(
    () => (this.pending() ?? false) || (this.context?.waiting ?? false),
  )
  private readonly sequence = signal(0)

  protected readonly phase = computed(() =>
    this.transitionKey() === undefined ? undefined : this.sequence() % 2 ? 'b' : 'a',
  )
  protected readonly state = computed(() =>
    this.transitionKey() === undefined
      ? undefined
      : this.context?.departing
        ? 'exiting'
        : this.waiting()
          ? 'pending'
          : 'entered',
  )

  constructor() {
    usePageTransitionPending(() => this.pending() ?? false)
    let first = true
    let timer: ReturnType<typeof setTimeout> | undefined
    // The ribbon stays up through the arrival, and through staggered entrances that finish after
    // the page's own fade; never through ambient loops, which have no end.
    const arrive = () => {
      clearTimeout(timer)
      this.context?.report(this.id, null)
      if (this.transitionKey() === undefined || this.waiting()) return
      const environment = readMotionEnvironment(this.element)
      const ends = (this.element.getAnimations?.({ subtree: true }) ?? []).map(
        (animation) => animation.effect?.getComputedTiming().endTime,
      )
      const duration = environment.reducedMotion
        ? 0
        : Math.max(
            environment.durations.surface,
            ...ends.filter((end): end is number => typeof end === 'number' && Number.isFinite(end)),
          )
      if (duration <= 0) return
      this.context?.report(this.id, 'entering')
      timer = setTimeout(() => this.context?.report(this.id, null), duration)
    }
    effect(() => {
      this.transitionKey()
      this.waiting()
      untracked(() => {
        if (first) {
          first = false
          this.context?.ribbon(this.ribbon())
        } else this.sequence.update((value) => value + 1)
        afterNextRender(arrive, { injector: this.injector })
      })
    })
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(timer)
      this.context?.report(this.id, null)
    })
  }

  private readonly injector = inject(Injector)
}
