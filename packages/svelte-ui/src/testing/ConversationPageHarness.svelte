<script lang="ts">
  /**
   * A ConversationPage titled "Chat" in a box `width` pixels wide and 480px
   * high, for `archetypes/conversation-page.test.ts`. The thread and the
   * composer are one paragraph each. With `aside`, the page also has an aside
   * named "Artifact", which is one paragraph.
   */
  import ConversationPage from '../archetypes/ConversationPage.svelte'

  let { width, aside }: { width: number; aside: boolean } = $props()
</script>

{#snippet thread()}<p>thread</p>{/snippet}
{#snippet composer()}<p>composer</p>{/snippet}
{#snippet artifact()}<p>artifact</p>{/snippet}

<div style:inline-size="{width}px" style:block-size="480px">
  <ConversationPage
    title="Chat"
    asideLabel={aside ? 'Artifact' : undefined}
    {thread}
    {composer}
    aside={aside ? artifact : undefined}
  />
</div>
