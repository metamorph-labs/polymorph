<script lang="ts">
  /**
   * A slot rendered inside its scope (`slotted.svelte.ts`): an empty text
   * node, the slot, and another, so the member that renders it reads what is
   * between them, hands it props and takes the first of it. The probe's output
   * for the same snippet is moved here instead of rendered again. It renders
   * nothing of its own.
   */
  import type { Snippet } from 'svelte'

  import type { SlotScope } from './slotted.svelte'

  let { scope, snippet }: { scope: SlotScope; snippet: Snippet | undefined } = $props()

  // The scope a member made for this slot, and the snippet it adopts, stay the same for the
  // outlet's life; a new snippet renders in place of the adopted output.
  // svelte-ignore state_referenced_locally
  const outlet = scope.open(snippet)
</script>

{@render outlet.start()}{#if outlet.adopted !== undefined && snippet === outlet.adopted.snippet
  }{@render outlet.adopted.content()}{:else}{@render snippet?.()}{/if}{@render outlet.end()}
