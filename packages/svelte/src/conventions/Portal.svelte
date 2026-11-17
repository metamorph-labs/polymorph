<script lang="ts">
  /**
   * Content rendered at the end of the document body, as overlays are: the
   * description's `portal`. The content is a root of its own, mounted with
   * the contexts of the place it is written, so a member inside it reads its
   * owner's context as it would in place. It mounts in a pre-effect, before
   * the effects of the member around it run, so they find its elements, as
   * Vue's `Teleport` renders its content with the rest.
   */
  import { getAllContexts, mount, unmount, type Snippet } from 'svelte'

  import SnippetHost from './SnippetHost.svelte'

  let { children }: { children: Snippet } = $props()

  const context = getAllContexts()

  $effect.pre(() => {
    const instance = mount(SnippetHost, {
      target: document.body,
      props: { snippet: children },
      context,
    })
    return () => {
      void unmount(instance)
    }
  })
</script>
