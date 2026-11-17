<script lang="ts">
  /**
   * A ChatThread with `count` turns, each a ChatMessage holding a
   * `SetupCounter` named `turn <n>`, and an empty state holding one named
   * `empty`, for `conventions/slotted.test.ts`.
   */
  import ChatMessage from '../ai/ChatMessage.svelte'
  import ChatThread from '../ai/ChatThread.svelte'
  import SetupCounter from './SetupCounter.svelte'

  let { count }: { count: number } = $props()
</script>

<ChatThread label="Conversation">
  {#each Array.from({ length: count }, (_, at) => at) as index (index)}
    <ChatMessage role="user" author="You"><SetupCounter name={`turn ${index}`} /></ChatMessage>
  {/each}
  {#snippet empty()}<SetupCounter name="empty" />{/snippet}
</ChatThread>
