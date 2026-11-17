<script lang="ts">
  /**
   * Renders one snippet, for a root the foundation mounts itself: a portal's
   * content at the end of the body, and a slot's probe, which renders a slot
   * where no one sees it so a member can read what it holds.
   */
  import type { Snippet } from 'svelte'

  let { snippet }: { snippet: Snippet } = $props()
</script>

{@render snippet()}
