import { getContext, onDestroy, setContext, untrack } from 'svelte'

/**
 * The page-transition convention (`design/conventions/page-transitions.md`)
 * for Svelte: what `PageTransitions` provides and `PageTransition` reads.
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
 * foundation does not depend on the recipes, so a page frame hands the
 * recipe's classes over: the page's own `class`, and the ribbon's as
 * `ribbon`, which the provider draws once a frame has given it. Without a
 * provider, a frame still replays its arrivals and holds while pending.
 */

export type TransitionRequest = 'pending' | 'entering'

export interface TransitionContext {
  readonly waiting: boolean
  readonly departing: boolean
  report(id: string, request: TransitionRequest | null): void
  /** The ribbon's class, from the recipe a page frame imports. */
  ribbon(className: string | undefined): void
}

const CONTEXT = Symbol('polymorph:page-transitions')

/** For `PageTransitions`: makes the context its descendants report to. */
export function providePageTransitions(context: TransitionContext): void {
  setContext(CONTEXT, context)
}

/** The provider's context, or `undefined` outside one. */
export function pageTransitions(): TransitionContext | undefined {
  return getContext<TransitionContext | undefined>(CONTEXT)
}

let reports = 0

/** Reports a foreground page load; polling and idle background work stay silent. */
export function usePageTransitionPending(pending: () => boolean): void {
  reports += 1
  const id = `pending-${reports}`
  const context = pageTransitions()
  $effect.pre(() => {
    const now = pending()
    untrack(() => context?.report(id, now ? 'pending' : null))
  })
  onDestroy(() => untrack(() => context?.report(id, null)))
}
