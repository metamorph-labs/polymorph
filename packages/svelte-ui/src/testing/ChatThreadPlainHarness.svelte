<script lang="ts">
  /**
   * A ChatThread whose turns are two plain paragraphs, with an empty state,
   * for `conventions/slotted.test.ts`.
   */
  import ChatThread from '../ai/ChatThread.svelte'
</script>

<ChatThread label="Conversation">
  <p>First turn</p>
  <p>Second turn</p>
  {#snippet empty()}<p>Ask anything</p>{/snippet}
</ChatThread>
