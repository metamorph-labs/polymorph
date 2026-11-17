<script lang="ts">
  /**
   * One states fixture entry, rendered with the props a law sets on its member,
   * for `mount.ts`. It renders nothing of its own.
   */
  import type { Overrides, StateEntry } from '@polymorph/svelte'

  let { render, overrides }: { render: StateEntry['render']; overrides: Overrides } = $props()
</script>

{@render render(overrides)}
