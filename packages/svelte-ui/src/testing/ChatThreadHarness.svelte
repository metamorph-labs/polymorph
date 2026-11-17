<script lang="ts">
  /**
   * A ChatThread in a 480px by 240px box, with `count` turns, for
   * `ai/chat-thread.test.ts`. Even turns are the user's and odd turns the
   * assistant's, and each repeats its own number eight times.
   */
  import ChatMessage from '../ai/ChatMessage.svelte'
  import ChatThread from '../ai/ChatThread.svelte'

  let { count }: { count: number } = $props()
</script>

<div style:inline-size="480px" style:block-size="240px">
  <ChatThread label="Conversation">
    {#each Array.from({ length: count }, (_, at) => at) as index (index)}
      <ChatMessage
        role={index % 2 === 0 ? 'user' : 'assistant'}
        author={index % 2 === 0 ? 'You' : 'Pilot'}
      >
        <p>{`Turn ${index}. `.repeat(8)}</p>
      </ChatMessage>
    {/each}
    {#snippet empty()}<p>Ask anything</p>{/snippet}
  </ChatThread>
</div>
