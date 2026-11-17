<script lang="ts">
  /**
   * Draws a node a caller passed inside a structured prop (`RenderNode`), or
   * its text: the description's `render`. A bound snippet is drawn with its
   * arguments, up to three of them.
   */
  import type { Snippet } from 'svelte'

  import { isBound, type BoundSnippet, type RenderNode } from './render'

  let { node }: { node: RenderNode | string | null | undefined } = $props()

  const bound = $derived(isBound(node) ? (node as BoundSnippet) : undefined)
  const plain = $derived(typeof node === 'function' ? node : undefined)

  /** A bound snippet's own, typed for the number of arguments it was bound with. */
  const one = (snippet: BoundSnippet) => snippet.snippet as unknown as Snippet<[unknown]>
  const two = (snippet: BoundSnippet) => snippet.snippet as unknown as Snippet<[unknown, unknown]>
  const three = (snippet: BoundSnippet) =>
    snippet.snippet as unknown as Snippet<[unknown, unknown, unknown]>
  const none = (snippet: BoundSnippet) => snippet.snippet as unknown as Snippet
</script>

{#if typeof node === 'string'}{node}{:else if bound
  }{#if bound.args.length === 0}{@render none(bound)()}{:else if bound.args.length === 1
    }{@render one(bound)(bound.args[0])}{:else if bound.args.length === 2
    }{@render two(bound)(bound.args[0], bound.args[1])}{:else
    }{@render three(bound)(bound.args[0], bound.args[1], bound.args[2])}{/if
  }{:else if plain}{@render plain()}{/if}
