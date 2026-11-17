<script lang="ts">
  /**
   * A page frame's content element, rendered as `as`
   * (`page-transitions.svelte.ts`). Its `data-page-transition` alternates
   * between `a` and `b` each time the key or the wait changes, and the recipe
   * names a keyframe for each, so the arrival replays on the same element and
   * its children keep their state. While the page waits it holds still
   * (`pending`), and while the browser leaves it fades (`exiting`).
   */
  import { untrack, type Snippet } from 'svelte'
  import type { ClassValue } from 'svelte/elements'

  import { readMotionEnvironment } from '@polymorph/engine/motion'

  import { pageTransitions, usePageTransitionPending } from './page-transitions.svelte'

  interface Props {
    as: string
    transitionKey?: string
    pending?: boolean
    /** The ribbon's class, from the page-transitions recipe the frame imports. */
    ribbon?: string
    /** The frame's own classes, from its recipe. */
    class?: ClassValue
    /** The element's id, which a frame's skip link targets (AppShell's `#content`). */
    id?: string
    children?: Snippet
  }

  let {
    as,
    transitionKey,
    pending = false,
    ribbon,
    class: className,
    id: elementId,
    children,
  }: Props = $props()

  const context = pageTransitions()
  // The ribbon's class is the frame's recipe's, fixed for the frame's life.
  // svelte-ignore state_referenced_locally
  untrack(() => context?.ribbon(ribbon))
  const id = $props.id()
  let element = $state<HTMLElement | null>(null)
  usePageTransitionPending(() => pending)

  const waiting = $derived(pending || (context?.waiting ?? false))
  let sequence = $state(0)
  let first = true
  $effect.pre(() => {
    void transitionKey
    void waiting
    if (first) {
      first = false
      return
    }
    untrack(() => {
      sequence += 1
    })
  })

  // The ribbon stays up through the arrival, and through staggered entrances that finish after
  // the page's own fade; never through ambient loops, which have no end.
  let timer: ReturnType<typeof setTimeout> | undefined
  const arrive = () => {
    clearTimeout(timer)
    context?.report(id, null)
    if (transitionKey === undefined || waiting || element === null) return
    const environment = readMotionEnvironment(element)
    const ends = (element.getAnimations?.({ subtree: true }) ?? []).map(
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
  $effect(() => {
    void sequence
    untrack(arrive)
  })
  $effect(() => () => {
    clearTimeout(timer)
    untrack(() => context?.report(id, null))
  })
</script>

<svelte:element
  this={as}
  bind:this={element}
  id={elementId}
  class={className}
  data-page-transition={transitionKey === undefined ? undefined : sequence % 2 ? 'b' : 'a'}
  data-page-transition-state={transitionKey === undefined
    ? undefined
    : context?.departing
      ? 'exiting'
      : waiting
        ? 'pending'
        : 'entered'}
  >{@render children?.()}</svelte:element
>
