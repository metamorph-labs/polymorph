<script lang="ts">
  /**
   * A panel kept in the document by `usePresence` with the `dialog.panel`
   * binding, for `conventions/presence.test.ts`. What decides `open` reads
   * `noise` too, so a change of `noise` runs the presence again without
   * changing its value.
   */
  import { usePresence } from '@polymorph/svelte/motion'

  let { open, noise }: { open: boolean; noise: number } = $props()
  let panel = $state<HTMLElement | null>(null)
  const present = usePresence(
    () => noise >= 0 && open,
    () => panel,
    'dialog.panel',
  )
</script>

{#if present.current}<div bind:this={panel} data-state={open ? 'open' : 'closed'}>Panel</div>{/if}
