<script lang="ts">
  /**
   * One viewport ribbon for the application's navigation and loading states
   * (`page-transitions.svelte.ts`): mounted once, around the application.
   */
  import { onMount, type Snippet } from 'svelte'
  import { SvelteMap } from 'svelte/reactivity'

  import { providePageTransitions, type TransitionRequest } from './page-transitions.svelte'

  let { children }: { children?: Snippet } = $props()

  const requests = new SvelteMap<string, TransitionRequest>()
  let departing = $state(false)
  let ribbon = $state<string | undefined>(undefined)

  providePageTransitions({
    get waiting() {
      return [...requests.values()].includes('pending')
    },
    get departing() {
      return departing
    },
    report(id, request) {
      if (request === null) requests.delete(id)
      else requests.set(id, request)
    },
    ribbon(className) {
      if (className !== undefined) ribbon = className
    },
  })

  let recovery: ReturnType<typeof setTimeout> | undefined
  const reset = () => {
    clearTimeout(recovery)
    departing = false
  }
  const leave = () => {
    clearTimeout(recovery)
    departing = true
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
    return () => {
      clearTimeout(recovery)
      document.removeEventListener('click', click)
      window.removeEventListener('beforeunload', leave)
      window.removeEventListener('pageshow', reset)
    }
  })

  const active = $derived(departing || requests.size > 0)
</script>

{@render children?.()}{#if ribbon !== undefined
  }<div class={ribbon} data-page-progress={active ? 'visible' : 'hidden'} aria-hidden="true"></div
>{/if}
